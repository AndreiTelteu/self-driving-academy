import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { availableParallelism, cpus, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

/**
 * PBI 155 — raportul de verificare a hardware-ului și bugetelor fixate.
 *
 * `npm run perf:hardware-budget` derivă `report.json` + `report.md` din:
 *  - capturile browser deja comise ale probei integrate 220 (build de producție, hardware real,
 *    cinci repetări pe workload și backend, 30 s warmup + 120 s măsurare);
 *  - măsurătoarea de cost pe sisteme (`systems-cost.json`, produsă de `--measure` pe contractele
 *    reale: learning, recorder, KPI, XP, provocări, distrugere);
 *  - măsurătoarea de încărcare (`build-transfer.json`, bytes reali ai build-ului de producție).
 *
 * Bugetele sunt citite din `Docs/performance-budgets.json` și **nu** sunt modificate. `--check`
 * compară raportul derivat cu fișierele comise. `--measure` reface cele două măsurători locale.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = join(root, 'Docs', 'Evidence', '155-hardware-budget');
const reportJson = join(evidence, 'report.json');
const reportMarkdown = join(evidence, 'report.md');
const costFile = join(evidence, 'systems-cost.json');
const transferFile = join(evidence, 'build-transfer.json');
const buildDirectory = join(root, '.pbi-validation-155', 'build');
const manifestFile = join(root, 'Docs', 'performance-budgets.json');
const fleetEvidence = join(root, 'Docs', 'Evidence', '220-fleet-gate', 'hardware');

const wantsCheck = process.argv.includes('--check');
const wantsMeasure = process.argv.includes('--measure');

const contract = await import(
  pathToFileURL(join(root, 'tests', 'harness', 'hardware-budget.ts')).href
);

/** Accepted 220 captures, one per backend, produced on the identified laptop with a fixed preset. */
const CAPTURES = Object.freeze([
  Object.freeze({ id: '20261022T024028061Z', renderer: 'WEBGPU' }),
  Object.freeze({ id: '20261022T033847343Z', renderer: 'WEBGL2' }),
]);
/** Baseline kept from before the 220 optimisations; the numbers are not reclassified. */
const BASELINE_CAPTURE = '20261022T005309189Z';
const WORKLOADS = Object.freeze([
  Object.freeze({ id: 'scaling-20', label: '20 taxiuri / 20 civili', stress: false }),
  Object.freeze({ id: 'normal-24', label: '24 taxiuri / 40 civili', stress: false }),
  Object.freeze({ id: 'maximum-30', label: 'maxim V1: 30 taxiuri / 40 civili', stress: false }),
  Object.freeze({
    id: 'overload-30-80',
    label: 'suprasarcină: 30 taxiuri / 80 civili',
    stress: true,
  }),
]);

function gitCommit() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function statistic(value) {
  if (value === null || typeof value !== 'object') return null;
  if (typeof value.p95 !== 'number') return null;
  return Object.freeze({
    count: Number(value.count ?? 0),
    p50: Number(value.p50 ?? 0),
    p95: Number(value.p95 ?? 0),
    p99: Number(value.p99 ?? 0),
    min: Number(value.min ?? 0),
    max: Number(value.max ?? 0),
    mean: Number(value.mean ?? 0),
  });
}

function cleanupLeaked(cleanup) {
  if (cleanup === null || typeof cleanup !== 'object') return true;
  const leaked =
    cleanup.worldDisposed !== true ||
    Number(cleanup.mappedVehicles ?? 0) !== 0 ||
    Number(cleanup.subscriptions ?? 0) !== 0 ||
    Number(cleanup.ownedMeshes ?? 0) !== 0 ||
    Number(cleanup.schedulerJobs ?? 0) !== 0 ||
    Number(cleanup.schedulerCache ?? 0) !== 0 ||
    Number(cleanup.schedulerIdentities ?? 0) !== 0 ||
    Number(cleanup.schedulerUrgent ?? 0) !== 0 ||
    Number(cleanup.collisionPairs ?? 0) !== 0 ||
    Number(cleanup.pendingCollisionEvents ?? 0) !== 0 ||
    Number(cleanup.busSubscriptions ?? 0) !== 0 ||
    Number(cleanup.gpuInstruments ?? 0) !== 0;
  return leaked;
}

async function readCapture(capture, generatedFrom) {
  const directory = join(fleetEvidence, capture.id);
  const files = (await readdir(directory)).sort();
  const runs = [];
  for (const workload of WORKLOADS) {
    for (let repeat = 1; repeat <= 5; repeat += 1) {
      const name = `${capture.renderer.toLowerCase()}-${workload.id}-${repeat}.json`;
      if (!files.includes(name)) continue;
      const report = await readJson(join(directory, name));
      if (report.kind !== 'run') continue;
      if (report.smoke !== false) throw new Error(`Smoke run in a gate capture: ${name}`);
      if (report.renderer !== capture.renderer)
        throw new Error(`Renderer mismatch in ${capture.id}/${name}`);
      if (report.budgetColumn !== 'laptop')
        throw new Error(`Unexpected budget column in ${capture.id}/${name}`);
      const run = report.run;
      runs.push(
        Object.freeze({
          captureId: capture.id,
          renderer: report.renderer,
          budgetColumn: report.budgetColumn,
          browser: report.browser,
          preset: report.preset,
          cssResolution: report.cssResolution,
          internalResolution: report.internalResolution,
          dpr: report.dpr,
          build: Object.freeze({
            commit: report.identity.commit,
            sourceHash: report.identity.sourceHash,
            artifactHash: report.artifactHash,
          }),
          workload: workload.id,
          workloadLabel: workload.label,
          stress: workload.stress,
          expectedVehicles: Number(run.counts.expectedVehicles),
          run: Object.freeze({
            repeat: run.repeat,
            frameMs: statistic(run.frameMs),
            mainThreadMs: statistic(run.mainThreadMs),
            authoritativeTickMs: statistic(run.authoritativeTickMs),
            rapierStepMs: statistic(run.rapierStepMs),
            inputToCommandMs: statistic(run.inputToCommandMs),
            learningEndToEndMs: statistic(run.learningEndToEndMs),
            gpuMs: statistic(run.optionalGpuMs),
            gpuStatus: String(run.gpuTimer?.status ?? 'fără stare'),
            pageHeapBytes: run.memory?.pageHeapBytes ?? null,
            longTaskMaxMs: run.longTasks?.supported === true ? run.longTasks.maxMs : null,
            simulatedToWallRatio: run.simulatedToWallRatio,
            framesOver35Ms: run.framesOver35Ms,
            physicalVehicles: Number(run.counts.vehicles),
            cleanupLeaked: cleanupLeaked(run.cleanup),
          }),
        }),
      );
    }
  }
  generatedFrom.push(
    `${relativePath(directory)}\\* · ${files.length} fișiere · ${runs.length} rulări măsurate`,
  );
  return runs;
}

function relativePath(path) {
  return path
    .replace(root, '')
    .replace(/^[\\/]/, '')
    .replaceAll('\\', '/');
}

async function readBaseline(generatedFrom) {
  const directory = join(fleetEvidence, BASELINE_CAPTURE);
  const files = (await readdir(directory)).sort();
  const values = [];
  let commit = '';
  let sourceHash = '';
  let capturedAt = '';
  for (const name of files) {
    if (!/^webgpu-maximum-30-\d+\.json$/.test(name)) continue;
    const report = await readJson(join(directory, name));
    if (report.kind !== 'run') continue;
    values.push(report.run.authoritativeTickMs.p95);
    commit = report.identity.commit;
    sourceHash = report.identity.sourceHash;
    capturedAt = report.createdAt;
  }
  if (values.length === 0) return null;
  generatedFrom.push(`${relativePath(directory)}\\*.json · baseline dinainte de optimizări`);
  return Object.freeze({
    capturedAt,
    commit,
    captureId: BASELINE_CAPTURE,
    sourceHash,
    conditions:
      'Build de producție pe laptopul identificat (Ryzen 7 7735U / Radeon 680M), preset LOW fix, 1920×1080 CSS și intern, DPR 1, cinci repetări 30 s + 120 s; captură din 22 octombrie 2026, **înainte** de corecțiile 220 (priming înainte de warmup, context 044 la 10 Hz fazat, cache de rutare mărginit).',
    metric: 'tick autoritar p95, workload maxim V1 30/40, WEBGPU',
    values,
    budget: 0,
    unit: 'ms',
  });
}

async function measureTransfer() {
  const { build } = await import('vite');
  await build({
    configFile: false,
    root,
    base: './',
    cacheDir: join(root, '.pbi-validation-155', 'cache'),
    build: { outDir: buildDirectory, emptyOutDir: true },
    logLevel: 'warn',
  });
  const files = [];
  for (const file of (await readdir(buildDirectory, { recursive: true })).sort()) {
    const path = resolve(buildDirectory, file);
    if (!(await stat(path)).isFile()) continue;
    files.push({ path: file.replaceAll('\\', '/'), bytes: (await stat(path)).size });
  }
  const sum = (pattern) =>
    files.filter((file) => pattern.test(file.path)).reduce((total, file) => total + file.bytes, 0);
  const payload = files.filter((file) => /\.(js|wasm|css)$/.test(file.path));
  let gzipBytes = 0;
  for (const file of payload)
    gzipBytes += gzipSync(await readFile(resolve(buildDirectory, file.path))).length;
  const measuredAt = new Date().toISOString();
  const observation = Object.freeze({
    commit: gitCommit(),
    artifactCount: files.length,
    javascriptBytes: sum(/\.js$/),
    wasmBytes: sum(/\.wasm$/),
    cssBytes: sum(/\.css$/),
    gzipBytes,
    payloadFiles: payload.length,
    measuredAt,
    command: 'npm run perf:hardware-budget -- --measure',
    scope:
      'Build de producție al intrării aplicației (index.html + src/main.ts); nu este încărcarea completă a unei curse, pentru că pagina de joc completă nu există.',
  });
  await mkdir(evidence, { recursive: true });
  await writeFile(transferFile, `${JSON.stringify(observation, null, 2)}\n`);
  console.log(
    `Build de producție: ${observation.javascriptBytes} B JS + ${observation.wasmBytes} B WASM + ${observation.cssBytes} B CSS, gzip ${observation.gzipBytes} B, ${observation.artifactCount} artefacte.`,
  );
}

async function measureCosts() {
  const moduleUrl = pathToFileURL(join(root, 'tests', 'harness', 'hardware-systems-cost.ts')).href;
  const probe = await import(moduleUrl);
  const cpu = cpus()[0]?.model.trim().replace(/\s+/g, ' ') ?? 'unknown CPU';
  const measurement = await probe.measureSystemCosts({
    samples: 5,
    ticksPerSample: 600,
    machine: `${cpu}; ${availableParallelism()} fire logice; ${Math.round(totalmem() / 2 ** 30)} GiB RAM; Node ${process.version.replace(/^v/, '')}; Windows`,
    measuredAt: new Date().toISOString(),
    command: 'npm run perf:hardware-budget -- --measure',
  });
  await mkdir(evidence, { recursive: true });
  await writeFile(costFile, `${JSON.stringify(measurement, null, 2)}\n`);
  const sortedBaseline = measurement.baselineMs.slice().sort((left, right) => left - right);
  const medianBaseline = sortedBaseline[Math.floor(sortedBaseline.length / 2)];
  console.log(
    `Cost pe sisteme: ${measurement.samples} eșantioane × ${measurement.ticksPerSample} tick-uri, baseline median ${medianBaseline?.toFixed(3)} ms.`,
  );
}

async function deriveReport() {
  const manifest = contract.parseBudgetManifest(await readJson(manifestFile));
  const generatedFrom = [];
  const runs = [];
  for (const capture of CAPTURES) runs.push(...(await readCapture(capture, generatedFrom)));
  const baseline = await readBaseline(generatedFrom);
  const costs = await readJson(costFile).catch(() => null);
  const loading = await readJson(transferFile).catch(() => null);
  if (costs === null)
    throw new Error(`Lipsește măsurătoarea de cost: ${relativePath(costFile)} (rulează --measure)`);
  generatedFrom.push(
    `${relativePath(costFile)} · măsurat ${costs.measuredAt} pe ${costs.machine}`,
    loading === null
      ? `${relativePath(transferFile)} · lipsește`
      : `${relativePath(transferFile)} · build ${loading.commit.slice(0, 12)}, ${loading.artifactCount} artefacte`,
    `${relativePath(manifestFile)} · ${manifest.budgetVersion}`,
  );
  // The documented baseline is compared with the fixed laptop tick budget from the manifest.
  const resolvedBaseline =
    baseline === null
      ? null
      : Object.freeze({
          ...baseline,
          budget: manifest.proposedBudgets.laptop.authoritativeTickP95Ms,
        });
  const report = contract.buildHardwareBudgetReport({
    manifest,
    runs,
    baseline: resolvedBaseline,
    loading: loading === null ? null : Object.freeze({ build: loading }),
    costs,
    // The measured build is the one recorded by the production build measurement; the report must
    // stay byte-stable after the commit that ships it.
    production: Object.freeze({
      commit: loading?.commit ?? runs[0]?.build.commit ?? 'unknown',
      generatedFrom,
    }),
  });
  const issues = contract.verifyHardwareBudgetReport(report);
  if (issues.length > 0) {
    for (const issue of issues) console.error(`ISSUE ${issue}`);
    process.exitCode = 1;
  }
  return {
    report,
    json: `${JSON.stringify(report, null, 2)}\n`,
    markdown: contract.hardwareBudgetMarkdown(report),
  };
}

function printSummary(report) {
  for (const configuration of report.configurations)
    console.log(
      `CONFIG ${configuration.id} · ${configuration.workload} · ${configuration.repeats} repetări`,
    );
  for (const row of report.rows)
    console.log(
      `${row.verdict.padEnd(12)} ${row.metric} · ${row.configuration} · ${row.measured === null ? '—' : `p95 ${row.measured.p95} ${row.unit}`}${row.budget === null ? '' : ` / buget ${row.budget.value} ${row.unit}`}`,
    );
  for (const cost of report.costs)
    console.log(
      `COST ${cost.system} · ${cost.perInvocationMs.p95} ms/invocare · ${cost.perTickMs.p95} ms/tick · ${cost.perSimulatedSecondMs.p95} ms/s simulată · ${cost.shareOfTickBudgetPercent}% din bugetul de tick`,
    );
  console.log(
    `SUMMARY pass ${report.summary.pass}, fail ${report.summary.fail}, NOT_MEASURED ${report.summary.notMeasured}, structural ${report.summary.structural}, reported ${report.summary.reported}, gate ${report.summary.gate}, hardwareGameplayGate ${report.summary.hardwareGameplayGate}`,
  );
  if (report.deviations.length > 0)
    for (const deviation of report.deviations) console.log(`DEVIATION ${deviation}`);
}

async function writeReports() {
  const { report, json, markdown } = await deriveReport();
  printSummary(report);
  if (wantsCheck) {
    const saved = await readFile(reportJson, 'utf8').catch(() => null);
    if (saved !== json) {
      console.error(`Hardware budget report is stale: ${relativePath(reportJson)}`);
      process.exitCode = 1;
    } else console.log(`Hardware budget report is current: ${relativePath(reportJson)}`);
    const savedMarkdown = await readFile(reportMarkdown, 'utf8').catch(() => null);
    if (savedMarkdown !== markdown) {
      console.error(`Hardware budget markdown is stale: ${relativePath(reportMarkdown)}`);
      process.exitCode = 1;
    } else console.log(`Hardware budget markdown is current: ${relativePath(reportMarkdown)}`);
    return;
  }
  await mkdir(evidence, { recursive: true });
  await writeFile(reportJson, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${relativePath(reportJson)}`);
  console.log(`Wrote ${relativePath(reportMarkdown)}`);
}

if (wantsMeasure) await measureTransfer();
if (wantsMeasure) await measureCosts();
await writeReports();

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative as relativePath, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

/**
 * PBI 224 — gate-ul de regresii de performanță.
 *
 * Modul implicit: rederivă `report.json` + `report.md` din `measurement.json` comis.
 * `--measure` execută probele portabile ale reviziei curente și scrie măsurătoarea:
 *   - build de producție real (vite), cinci repetări, bytes JS+WASM față de capacitatea din manifest;
 *   - proba structurală de randare 157 (aceeași funcție `measureRenderBudget`), cinci repetări;
 *   - comenzile `--check` ale probelor 155/156/157/158/159 (le apelează, nu le modifică);
 *   - dovezile comise ale criteriilor 2 și 4 (156, 227/228/149, 232/233, 234, 225/226, 154);
 *   - soak-ul reviziei curente din `Docs/Evidence/224-performance-gate/soak/report.json`.
 * `--check` compară raportul rederivat cu fișierele comise.
 *
 * Bugetele sunt citite din `Docs/performance-budgets.json` și nu sunt rescrise niciodată.
 * `--inject-bundle-payload=<bytes>` adaugă un modul generat în entry-ul buildului; este folosit
 * exclusiv de demonstrația de regresie controlată și cere `--out` ca să nu atingă dovada comisă.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const defaultEvidence = join(root, 'Docs', 'Evidence', '224-performance-gate');
const manifestFile = join(root, 'Docs', 'performance-budgets.json');
const workDirectory = join(root, '.pbi-validation-224');
const soakReportFile = join(defaultEvidence, 'soak', 'report.json');

const argument = (name) => {
  const prefix = `--${name}=`;
  const found = process.argv.find((entry) => entry.startsWith(prefix));
  return found === undefined ? null : found.slice(prefix.length);
};
const numberArgument = (name, fallback) => {
  const value = argument(name);
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`--${name} needs a positive number`);
  return parsed;
};
const wantsMeasure = process.argv.includes('--measure');
const wantsCheck = process.argv.includes('--check');
const wantsStrictRelease = process.argv.includes('--strict-release');
const repetitions = numberArgument('repetitions', 5);
const injectedPayloadBytes = numberArgument('inject-bundle-payload', 0);
const outArgument = argument('out');
const evidenceDirectory = outArgument === null ? defaultEvidence : resolve(root, outArgument);
const measurementFile = join(evidenceDirectory, 'measurement.json');
const reportJson = join(evidenceDirectory, 'report.json');
const reportMarkdown = join(evidenceDirectory, 'report.md');
if (injectedPayloadBytes > 0 && outArgument === null)
  throw new Error('--inject-bundle-payload requires --out so the committed evidence is untouched');

const gate = await import(
  pathToFileURL(join(root, 'tests', 'harness', 'performance-gate.ts')).href
);
const renderProbe = await import(
  pathToFileURL(join(root, 'tests', 'harness', 'render-budget.ts')).href
);

function relative(file) {
  return relativePath(root, file).replaceAll('\\', '/');
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/* ------------------------------------------------------------------------------------------- */
/* Build de producție                                                                          */
/* ------------------------------------------------------------------------------------------- */

async function digestDirectory(directory) {
  const files = (await readdir(directory, { recursive: true })).sort();
  const hash = createHash('sha256');
  let artifactCount = 0;
  for (const file of files) {
    const path = join(directory, file);
    const info = await stat(path);
    if (!info.isFile()) continue;
    artifactCount += 1;
    hash.update(file.replaceAll('\\', '/'));
    hash.update(String(info.size));
    hash.update(await readFile(path));
  }
  return { artifactCount, digest: hash.digest('hex') };
}

async function writeInjectedEntry(bytes) {
  const directory = join(workDirectory, 'injected');
  await mkdir(directory, { recursive: true });
  const payload = 'A'.repeat(bytes);
  await writeFile(
    join(directory, 'payload.ts'),
    `const payload = '${payload}';\nexport function regressionPayload(): string {\n  return payload;\n}\n`,
  );
  await writeFile(
    join(directory, 'main.ts'),
    "import '../../src/main';\nimport { regressionPayload } from './payload';\n\nif (regressionPayload().length === 0) throw new Error('payload absent');\n",
  );
  await writeFile(
    join(directory, 'index.html'),
    '<!doctype html>\n<html lang="ro">\n  <head>\n    <meta charset="UTF-8" />\n    <title>Gate 224 regression</title>\n  </head>\n  <body>\n    <div id="app"></div>\n    <script type="module" src="/main.ts"></script>\n  </body>\n</html>\n',
  );
  return directory;
}

async function measureBuilds() {
  const injectedRoot =
    injectedPayloadBytes > 0 ? await writeInjectedEntry(injectedPayloadBytes) : null;
  const samples = [];
  try {
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const outDir = join(
        workDirectory,
        injectedRoot === null ? `build-${repetition}` : `build-regressed-${repetition}`,
      );
      await build({
        configFile: false,
        root: injectedRoot ?? root,
        base: './',
        cacheDir: join(workDirectory, 'cache'),
        build: { outDir, emptyOutDir: true },
        logLevel: 'error',
      });
      const files = (await readdir(outDir, { recursive: true })).sort();
      let javascriptBytes = 0;
      let wasmBytes = 0;
      let cssBytes = 0;
      let gzipBytes = 0;
      for (const file of files) {
        const path = join(outDir, file);
        if (!(await stat(path)).isFile()) continue;
        const content = await readFile(path);
        if (file.endsWith('.js')) javascriptBytes += content.length;
        else if (file.endsWith('.wasm')) wasmBytes += content.length;
        else if (file.endsWith('.css')) cssBytes += content.length;
        if (/\.(js|wasm|css)$/.test(file)) gzipBytes += gzipSync(content).length;
      }
      const digest = await digestDirectory(outDir);
      samples.push(
        Object.freeze({
          javascriptBytes,
          wasmBytes,
          cssBytes,
          gzipBytes,
          artifactCount: digest.artifactCount,
          digest: digest.digest,
        }),
      );
      console.log(
        `BUILD ${repetition}/${repetitions}: JS ${javascriptBytes} B + WASM ${wasmBytes} B + CSS ${cssBytes} B, gzip ${gzipBytes} B, ${digest.artifactCount} artefacte, digest ${digest.digest.slice(0, 12)}`,
      );
      await rm(outDir, { recursive: true, force: true });
    }
  } finally {
    if (injectedRoot !== null) await rm(injectedRoot, { recursive: true, force: true });
  }
  return samples;
}

async function readBuildBaseline() {
  const file = join(root, 'Docs', 'Evidence', '155-hardware-budget', 'build-transfer.json');
  try {
    const baseline = await readJson(file);
    return Object.freeze({
      commit: String(baseline.commit),
      javascriptBytes: Number(baseline.javascriptBytes),
      wasmBytes: Number(baseline.wasmBytes),
      file: relative(file),
    });
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------------------------------- */
/* Proba structurală de randare                                                                */
/* ------------------------------------------------------------------------------------------- */

function measureRenders() {
  return Array.from({ length: repetitions }, (_, index) => {
    const measurement = renderProbe.measureRenderBudget();
    const digest = sha256(Buffer.from(JSON.stringify(measurement))).slice(0, 16);
    console.log(
      `RENDER ${index + 1}/${repetitions}: draw calls ${measurement.city.drawCalls + measurement.decor.drawCalls}, instanțe ${measurement.city.thinInstances}, digest ${digest}`,
    );
    return Object.freeze({
      digest,
      cityDrawCalls: measurement.city.drawCalls,
      decorDrawCalls: measurement.decor.drawCalls,
      thinInstances: measurement.city.thinInstances,
      thinBatches: measurement.city.thinBatches,
      decorCells: measurement.decor.cells,
      meshes: measurement.city.meshes,
      elements: measurement.city.elements,
    });
  });
}

/* ------------------------------------------------------------------------------------------- */
/* Comenzile probelor existente (apelate, nu modificate)                                       */
/* ------------------------------------------------------------------------------------------- */

const CHECK_COMMANDS = Object.freeze([
  Object.freeze({ id: 'render-budget', script: 'perf:render-budget' }),
  Object.freeze({ id: 'simulation-budget', script: 'perf:simulation-budget' }),
  Object.freeze({ id: 'traffic-benchmark', script: 'perf:traffic-benchmark' }),
  Object.freeze({ id: 'hardware-budget', script: 'perf:hardware-budget' }),
  Object.freeze({ id: 'soak', script: 'perf:soak' }),
]);

function runCheckCommands() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const results = [];
  for (const command of CHECK_COMMANDS) {
    const label = `npm run ${command.script} -- --check`;
    let exitCode = 0;
    try {
      execFileSync(npm, ['run', command.script, '--', '--check'], {
        cwd: root,
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 20 * 60 * 1000,
        // Windows refuses to spawn `.cmd` shims without a shell (EINVAL).
        shell: process.platform === 'win32',
      });
    } catch (error) {
      exitCode = typeof error.status === 'number' ? error.status : 1;
    }
    console.log(`CHECK ${command.id}: ${label} → exit ${exitCode}`);
    results.push(Object.freeze({ id: command.id, command: label, exitCode }));
  }
  return results;
}

/* ------------------------------------------------------------------------------------------- */
/* Dovezile comise                                                                             */
/* ------------------------------------------------------------------------------------------- */

class MissingEvidence extends Error {}

function requireReport(entry) {
  if (entry.report === null)
    throw new MissingEvidence(
      `fișierul de dovezi lipsește sau nu este JSON: ${relative(entry.file)}`,
    );
  return entry.report;
}

function assertion(ok, detail) {
  if (!ok) throw new Error(detail);
}

function successfulCommand(commands, id) {
  const entry = commands.find((candidate) => candidate.id === id);
  return entry !== undefined && entry.exitCode === 0;
}

function probeRow(input) {
  const base = {
    id: input.id,
    criterion: input.criterion,
    title: input.title,
    files: input.files,
    revision: null,
    checks: 1,
    passed: 0,
    detail: '',
    reason: '',
  };
  try {
    const result = input.factory();
    return Object.freeze({
      ...base,
      passed: 1,
      verdict: 'PASS',
      revision: result.revision ?? null,
      detail: result.detail,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof MissingEvidence)
      return Object.freeze({
        ...base,
        verdict: 'NOT_VALIDATED',
        reason: message,
      });
    return Object.freeze({
      ...base,
      verdict: 'FAIL',
      reason: message,
    });
  }
}

async function readEvidenceFiles() {
  const paths = {
    render: join(root, 'Docs', 'Evidence', '157-render-budget', 'report.json'),
    simulation: join(root, 'Docs', 'Evidence', '158-simulation-budget', 'report.json'),
    traffic: join(root, 'Docs', 'Evidence', '156-traffic-benchmark', 'report.json'),
    hardware: join(root, 'Docs', 'Evidence', '155-hardware-budget', 'report.json'),
    soak159: join(root, 'Docs', 'Evidence', '159-soak', 'report.json'),
    destruction: join(root, 'Docs', 'Evidence', '227-destructible-decor', 'report.json'),
    feedback: join(root, 'Docs', 'Evidence', '228-destruction-feedback', 'report.json'),
    audio: join(root, 'Docs', 'Evidence', '149-audio-feedback', 'report.json'),
    director: join(root, 'Docs', 'Evidence', '232-challenge-director', 'report.json'),
    experience: join(root, 'Docs', 'Evidence', '233-challenge-experience', 'report.json'),
    savefile: join(root, 'Docs', 'Evidence', '234-savefile', 'report.json'),
    sessions: join(root, 'Docs', 'Evidence', '225-session-kinds', 'report.json'),
    recovery: join(root, 'Docs', 'Evidence', '226-world-recovery', 'report.json'),
    compat: join(root, 'Docs', 'Evidence', '154-compat-matrix', 'report.json'),
  };
  const entries = {};
  for (const [id, file] of Object.entries(paths))
    entries[id] = { file, report: await readJson(file).catch(() => null) };
  return entries;
}

function buildEvidence(commands, reports, budgets) {
  const file = (entry) => relative(entry.file);
  const rows = [];

  rows.push(
    probeRow({
      id: 'probe-render-budget',
      criterion: 'capacity',
      title: 'proba 157 (buget de randare) este curentă față de sursă',
      files: [file(reports.render)],
      factory: () => {
        const report = requireReport(reports.render);
        assertion(
          successfulCommand(commands, 'render-budget'),
          'perf:render-budget --check a eșuat',
        );
        assertion(report.summary?.gate === 'STRUCTURAL_PASS', `157 gate ${report.summary?.gate}`);
        assertion(Number(report.summary?.fail) === 0, `157 are ${report.summary?.fail} FAIL`);
        return {
          revision: String(report.captures?.after?.commit ?? ''),
          detail: `157: ${report.summary?.pass} PASS, 0 FAIL, ${report.summary?.notMeasured} NOT_MEASURED; --check exit 0, captura ${String(report.captures?.after?.commit ?? '').slice(0, 12)}`,
        };
      },
    }),
  );

  rows.push(
    probeRow({
      id: 'probe-simulation-budget',
      criterion: 'gameplay',
      title: 'proba 158 (buget de simulare) este curentă față de sursă',
      files: [file(reports.simulation)],
      factory: () => {
        const report = requireReport(reports.simulation);
        assertion(
          successfulCommand(commands, 'simulation-budget'),
          'perf:simulation-budget --check a eșuat',
        );
        assertion(report.verdicts?.overall === 'PASS', `158 overall ${report.verdicts?.overall}`);
        assertion(
          (report.equivalence ?? []).every((entry) => entry.status === 'IDENTICAL'),
          '158 are echivalențe care nu sunt IDENTICAL',
        );
        return {
          revision: String(report.after?.commit ?? ''),
          detail: `158: decizii ${report.verdicts?.decisions}, estimare ${report.verdicts?.estimation}, transferuri ${report.verdicts?.transfer}, ${report.equivalence?.length} echivalențe IDENTICAL; --check exit 0`,
        };
      },
    }),
  );

  rows.push(
    probeRow({
      id: 'probe-traffic-benchmark',
      criterion: 'gameplay',
      title: 'proba 156 (benchmark de flotă/trafic) este curentă față de sursă',
      files: [file(reports.traffic)],
      factory: () => {
        const report = requireReport(reports.traffic);
        assertion(
          successfulCommand(commands, 'traffic-benchmark'),
          'perf:traffic-benchmark --check a eșuat',
        );
        assertion(
          report.summary?.gate === 'MEASURED_GATE_PASS',
          `156 gate ${report.summary?.gate}`,
        );
        assertion(Number(report.summary?.fail) === 0, `156 are ${report.summary?.fail} FAIL`);
        return {
          detail: `156: ${report.summary?.pass} PASS, 0 FAIL, ${report.summary?.stress} STRESS, ${report.summary?.reported} REPORTED; --check exit 0`,
        };
      },
    }),
  );

  rows.push(
    probeRow({
      id: 'probe-hardware-budget',
      criterion: 'gameplay',
      title: 'proba 155 (hardware și bugete) este curentă față de sursă',
      files: [file(reports.hardware)],
      factory: () => {
        const report = requireReport(reports.hardware);
        assertion(
          successfulCommand(commands, 'hardware-budget'),
          'perf:hardware-budget --check a eșuat',
        );
        assertion(
          report.summary?.gate === 'MEASURED_CONFIGURATIONS_PASS',
          `155 gate ${report.summary?.gate}`,
        );
        assertion(Number(report.summary?.fail) === 0, `155 are ${report.summary?.fail} FAIL`);
        return {
          revision: String(report.productionCommit ?? ''),
          detail: `155: ${report.summary?.pass} PASS, 0 FAIL, ${report.summary?.notMeasured} NOT_MEASURED declarate; --check exit 0`,
        };
      },
    }),
  );

  rows.push(
    probeRow({
      id: 'probe-soak-integrity',
      criterion: 'soak',
      title: 'raportul soak 159 este curent față de măsurătoarea comisă',
      files: [file(reports.soak159)],
      factory: () => {
        const report = requireReport(reports.soak159);
        assertion(successfulCommand(commands, 'soak'), 'perf:soak --check a eșuat');
        assertion(report.verdict?.status === 'SOAK_PASS', `159 verdict ${report.verdict?.status}`);
        return {
          revision: String(report.commit ?? ''),
          detail: `159: ${report.verdict?.status}, ${report.duration?.actualMinutes} min, ${report.lifecycle?.cycles} cicluri, commit ${report.commit}; --check exit 0`,
        };
      },
    }),
  );

  rows.push(
    probeRow({
      id: 'gameplay-systems-max-v1',
      criterion: 'gameplay',
      title: 'learning, recorder+autosave și XP trec pe workload maxim V1 (156)',
      files: [file(reports.traffic)],
      factory: () => {
        const report = requireReport(reports.traffic);
        const gateRows = (report.rows ?? []).filter(
          (row) =>
            row.spec?.taxis === 30 && row.spec?.civilians === 40 && row.classification === 'GATE',
        );
        assertion(gateRows.length === 12, `156 are ${gateRows.length} rânduri 30/40 GATE, nu 12`);
        assertion(
          gateRows.every((row) => row.verdict === 'PASS'),
          'există rânduri 30/40 GATE fără PASS',
        );
        const systems = new Set(gateRows.map((row) => row.spec.system));
        for (const system of ['BASELINE', 'LEARNING', 'RECORDER_AUTOSAVE', 'XP'])
          assertion(systems.has(system), `sistemul ${system} lipsește din workload-ul maxim V1`);
        const worstTick = Math.max(...gateRows.map((row) => Number(row.cpu?.tick?.p95)));
        assertion(
          worstTick <= budgets.authoritativeTickP95Ms,
          `tick p95 ${worstTick} ms depășește ${budgets.authoritativeTickP95Ms} ms`,
        );
        return {
          detail: `workload maxim V1 30/40: 12 rânduri de gate, sisteme ${[...systems].join(', ')}, tick p95 maxim ${worstTick.toFixed(2)} ms din ${budgets.authoritativeTickP95Ms} ms`,
        };
      },
    }),
  );

  rows.push(
    probeRow({
      id: 'destruction-effects-audio',
      criterion: 'destruction',
      title: 'distrugere, efecte și audio în buget (227/228/149)',
      files: [file(reports.destruction), file(reports.feedback), file(reports.audio)],
      factory: () => {
        const destruction = requireReport(reports.destruction);
        const feedback = requireReport(reports.feedback);
        const audio = requireReport(reports.audio);
        assertion(destruction.summary?.pass === true, '227 nu este PASS');
        assertion(
          Number(destruction.summary?.passed) === Number(destruction.summary?.checks),
          '227 are verificări neexecutate',
        );
        assertion(
          destruction.performance?.frame?.status === 'NOT_MEASURED',
          '227 nu declară frame NOT_MEASURED',
        );
        assertion(feedback.summary?.pass === true, '228 nu este PASS');
        assertion(
          Number(feedback.summary?.passed) === Number(feedback.summary?.checks),
          '228 are verificări neexecutate',
        );
        assertion(
          Number(feedback.budget?.ownCaps?.impactVoices) === 4,
          'plafonul de 4 voci impact lipsește',
        );
        assertion(audio.summary?.pass === true, '149 nu este PASS');
        const voices = (audio.scenarios ?? []).find((entry) => entry.name === 'rapid-toggle')?.data;
        assertion(
          Number(voices?.activeVoices) <= Number(voices?.totalVoiceCap),
          `149 are ${voices?.activeVoices} voci active din ${voices?.totalVoiceCap}`,
        );
        const bodies = destruction.resetCycles?.bodies ?? [];
        return {
          detail: `227: ${destruction.summary?.passed}/${destruction.summary?.checks} verificări, ${destruction.resetCycles?.cycles} cicluri de reset cu ${bodies.join('/')} corpuri; 228: ${feedback.summary?.passed}/${feedback.summary?.checks}, max 4 voci impact și ${feedback.budget?.ownCaps?.maxReactionsPerIncident} reacții/incident; 149: ${audio.summary?.passed}/${audio.summary?.checks}, ${voices?.activeVoices}/${voices?.totalVoiceCap} voci active. Frame: NOT_MEASURED declarat`,
        };
      },
    }),
  );

  rows.push(
    probeRow({
      id: 'challenge-director',
      criterion: 'challenges',
      title: 'directorul de provocări random și experiența în buget (232/233)',
      files: [file(reports.director), file(reports.experience)],
      factory: () => {
        const director = requireReport(reports.director);
        const experience = requireReport(reports.experience);
        assertion(director.summary?.pass === true, '232 nu este PASS');
        assertion(
          Number(director.history?.entries) <= Number(director.history?.capEntries),
          `istoricul 232 are ${director.history?.entries} intrări din ${director.history?.capEntries}`,
        );
        assertion(
          Number(director.history?.codeUnits) <= Number(director.history?.capCodeUnits),
          `istoricul 232 are ${director.history?.codeUnits} unități din ${director.history?.capCodeUnits}`,
        );
        assertion(experience.summary?.pass === true, '233 nu este PASS');
        assertion(
          Number(experience.storage?.ledgerEntries) <=
            Number(experience.performance?.storage?.recordRowsCap),
          'ledgerul 233 depășește plafonul de rânduri',
        );
        return {
          detail: `232: ${director.summary?.passed}/${director.summary?.checks}, istoric ${director.history?.entries}/${director.history?.capEntries} intrări și ${director.history?.codeUnits}/${director.history?.capCodeUnits} unități; 233: ${experience.summary?.passed}/${experience.summary?.checks}, ${experience.storage?.ledgerEntries} rând de ledger din ${experience.performance?.storage?.recordRowsCap}, ${experience.performance?.ui?.globalListeners} listeners globali`,
        };
      },
    }),
  );

  rows.push(
    probeRow({
      id: 'savefile-integrity',
      criterion: 'savefile',
      title: 'encode/canonicalizare/hash de savefile în buget (234)',
      files: [file(reports.savefile)],
      factory: () => {
        const report = requireReport(reports.savefile);
        assertion(report.summary?.pass === true, '234 nu este PASS');
        assertion(
          Number(report.budgets?.measuredFileBytes) <= Number(report.budgets?.maxFileBytes),
          'fișierul 234 depășește plafonul',
        );
        assertion(
          Number(report.budgets?.measuredPayloadBytes) <=
            Number(report.budgets?.persistenceIngressBytes),
          'payload-ul 234 depășește ingress-ul',
        );
        assertion(
          Number(report.performance?.storage?.checksumBytes) > 0,
          '234 nu raportează checksumul',
        );
        return {
          detail: `234: ${report.summary?.passed}/${report.summary?.checks} verificări, fișier ${report.budgets?.measuredFileBytes} B din ${report.budgets?.maxFileBytes} B, payload ${report.budgets?.measuredPayloadBytes} B din ingress ${report.budgets?.persistenceIngressBytes} B, checksum ${report.performance?.storage?.checksumBytes} B; encode/hash fără ceas de perete (declarat)`,
        };
      },
    }),
  );

  rows.push(
    probeRow({
      id: 'academy-chaos-cycles',
      criterion: 'lifecycle',
      title: '20 de schimbări Academie/Haos și 20 de reseturi în buget (225/226)',
      files: [file(reports.sessions), file(reports.recovery)],
      factory: () => {
        const sessions = requireReport(reports.sessions);
        const recovery = requireReport(reports.recovery);
        assertion(sessions.summary?.pass === true, '225 nu este PASS');
        assertion(
          Number(sessions.checkpoints?.switches) === 20,
          `225 are ${sessions.checkpoints?.switches} tranziții, nu 20`,
        );
        assertion(
          Number(sessions.checkpoints?.academyRows) === 10 &&
            Number(sessions.checkpoints?.chaosRows) === 10,
          '225 nu are 10 tranziții Academie + 10 Haos',
        );
        assertion(
          Number(sessions.checkpoints?.orphanWorlds) === 0 &&
            Number(sessions.checkpoints?.orphanJobs) === 0,
          '225 raportează lumi sau joburi orfane',
        );
        assertion(recovery.summary?.pass === true, '226 nu este PASS');
        assertion(
          Number(recovery.repeated?.resets) === 20,
          `226 are ${recovery.repeated?.resets} reseturi, nu 20`,
        );
        assertion(Number(recovery.repeated?.failedResets) === 0, '226 raportează reseturi eșuate');
        const bodies = recovery.repeated?.bodies ?? [];
        assertion(new Set(bodies).size === 1, `226 variază corpurile: ${bodies.join('/')}`);
        assertion(
          Number(recovery.repeated?.liveWorlds) === 1,
          '226 nu revine la o singură lume vie',
        );
        return {
          detail: `225: ${sessions.checkpoints?.switches} tranziții (${sessions.checkpoints?.academyRows} Academie / ${sessions.checkpoints?.chaosRows} Haos), ${sessions.checkpoints?.committed} checkpointuri comise, ${sessions.checkpoints?.totalBodyBytes} B total (max ${sessions.checkpoints?.maxBodyBytes} B), 0 lumi/joburi orfane; 226: ${recovery.repeated?.resets} reseturi, 0 eșuate, corpuri ${bodies.join('/')}, ${recovery.repeated?.listeners?.[0]} listener, lumi vii ${recovery.repeated?.liveWorlds}`,
        };
      },
    }),
  );

  rows.push(
    probeRow({
      id: 'backend-matrix',
      criterion: 'backends',
      title: 'matricea WEBGPU + WEBGL 2 este declarată (154)',
      files: [file(reports.compat)],
      factory: () => {
        const report = requireReport(reports.compat);
        const covered = (report.summary?.covered ?? []).join(' | ');
        assertion(Number(report.summary?.fail) === 0, `154 are ${report.summary?.fail} FAIL`);
        assertion(
          Number(report.summary?.pass) === Number(report.summary?.rows),
          '154 nu acoperă toate combinațiile declarate',
        );
        assertion(
          Number(report.summary?.deterministicPass) === Number(report.summary?.deterministicChecks),
          '154 are verificări deterministe neexecutate',
        );
        assertion(covered.includes('WEBGPU'), '154 nu acoperă WEBGPU');
        assertion(covered.includes('WEBGL2'), '154 nu acoperă WEBGL 2');
        return {
          detail: `154: ${report.summary?.pass}/${report.summary?.rows} combinații reale, ${report.summary?.deterministicPass}/${report.summary?.deterministicChecks} verificări deterministe, ${report.summary?.declaredNotRun} combinații declarate NOT_RUN; backenduri acoperite: WEBGPU și WEBGL 2`,
        };
      },
    }),
  );

  return rows;
}

function hardwareInput(reports, commit, budgets) {
  const entry = reports.hardware;
  const report = entry.report;
  const configurations = report?.configurations ?? [];
  const rows = report?.rows ?? [];
  const captures = [];
  for (const backend of ['WEBGPU', 'WEBGL2']) {
    const configuration = configurations.find(
      (candidate) => candidate.backend === backend && candidate.workload?.includes('maxim V1'),
    );
    const row = rows.find(
      (candidate) => candidate.id === `laptop-${backend.toLowerCase()}-maximum-30-frame-p95`,
    );
    const gpu = rows.find(
      (candidate) => candidate.id === `laptop-${backend.toLowerCase()}-maximum-30-gpu-p95`,
    );
    if (configuration === undefined || row === undefined) continue;
    captures.push(
      Object.freeze({
        backend,
        workload: configuration.workload,
        build: String(configuration.build ?? '').split(' ')[0],
        frameP95Ms: Number(row.measured?.p95),
        gpuP95Ms:
          gpu?.measured?.p95 === null || gpu?.measured?.p95 === undefined
            ? null
            : Number(gpu.measured.p95),
      }),
    );
  }
  const build = captures[0]?.build ?? '';
  const sameRevision = build.length >= 8 && commit.startsWith(build);
  const measured =
    captures.length === 2 && captures.every((capture) => Number.isFinite(capture.frameP95Ms));
  const reason = sameRevision
    ? ''
    : `capturile hardware 220 din ${relative(entry.file)} sunt pe buildul ${build || 'necunoscut'}; revizia curentă este ${commit.slice(0, 12)}. Pragurile absolute FPS/GPU (${budgets.frameP95Ms} ms p95, ${budgets.gpuP95Ms} ms GPU) cer aceeași revizie, deci FPS rămâne NOT_VALIDATED până la o rulare pe hardware real al acestei revizii.`;
  return Object.freeze({
    measured,
    reason,
    revision: build.length === 0 ? null : build,
    sameRevision,
    files: [relative(entry.file)],
    captures: Object.freeze(captures),
  });
}

async function soakInput(manifestModified) {
  let report;
  try {
    report = await readJson(soakReportFile);
  } catch {
    return null;
  }
  const check = (id) => (report.checks ?? []).find((entry) => entry.id === id);
  return Object.freeze({
    file: relative(soakReportFile),
    revision: String(report.commit ?? '') === '' ? null : String(report.commit),
    status: String(report.verdict?.status ?? 'UNKNOWN'),
    minutes: Number(report.duration?.actualMinutes ?? 0),
    cycles: Number(report.lifecycle?.cycles ?? 0),
    cleanCycles: Number(report.lifecycle?.cleanCycles ?? 0),
    trends: Object.freeze(
      (report.trends ?? []).map((trend) =>
        Object.freeze({
          id: String(trend.id),
          classification: String(trend.classification),
        }),
      ),
    ),
    heapDeltaBytes: Number(report.memory?.deltaHeapUsedBytes ?? 0),
    allowedHeapGrowthBytes: Number(report.memory?.allowedGrowthBytes ?? 0),
    queueMaxBytes: Number(check('workers.pendingWorkerPayloadBytes')?.observed ?? 0),
    queueMaxJobs: Number(check('workers.heavyBackgroundJobs')?.observed ?? 0),
    throttling: String(report.throttling?.status ?? 'UNKNOWN'),
    baselineUnmodified:
      manifestModified === false && report.manifest?.budgetVersion === '203-initial-1',
  });
}

/* ------------------------------------------------------------------------------------------- */
/* Măsurare și raport                                                                          */
/* ------------------------------------------------------------------------------------------- */

async function measure() {
  await mkdir(evidenceDirectory, { recursive: true });
  const commit = git('rev-parse', 'HEAD');
  const manifestBytes = await readFile(manifestFile);
  const rawManifest = JSON.parse(manifestBytes.toString('utf8'));
  const budgets = gate.parseGateBudgets(rawManifest);
  const modified =
    git('status', '--porcelain', '--', 'Docs/performance-budgets.json').length > 0 ||
    git('diff', '--name-only', 'HEAD', '--', 'Docs/performance-budgets.json').length > 0;
  const reports = await readEvidenceFiles();
  const commands = runCheckCommands();
  const buildSamples = await measureBuilds();
  const renderSamples = measureRenders();
  const measurement = Object.freeze({
    version: gate.PERFORMANCE_GATE_VERSION,
    budgetVersion: budgets.budgetVersion,
    commit,
    measuredAt: new Date().toISOString(),
    manifest: Object.freeze({ digest: sha256(manifestBytes), modified }),
    build: Object.freeze({
      samples: Object.freeze(buildSamples),
      baseline: await readBuildBaseline(),
      injectedPayloadBytes,
    }),
    render: Object.freeze(renderSamples),
    commands: Object.freeze(commands),
    evidence: Object.freeze(buildEvidence(commands, reports, budgets)),
    soak: await soakInput(modified),
    hardware: hardwareInput(reports, commit, budgets),
  });
  await writeFile(measurementFile, `${JSON.stringify(measurement, null, 2)}\n`);
  console.log(`Măsurătoare scrisă: ${relative(measurementFile)}`);
}

async function derive() {
  const budgets = gate.parseGateBudgets(await readJson(manifestFile));
  const measurement = await readJson(measurementFile);
  const report = gate.buildPerformanceGateReport({ budgets, measurement });
  const issues = gate.verifyPerformanceGateReport(report);
  if (issues.length > 0) {
    for (const issue of issues) console.error(`ISSUE ${issue}`);
    process.exitCode = 1;
  }
  return {
    report,
    measurement,
    json: `${JSON.stringify(report, null, 2)}\n`,
    markdown: gate.performanceGateMarkdown(report),
  };
}

/**
 * `--check` reexecută miezul portabil și refuză o măsurătoare comisă învechită: dacă sursa s-a
 * schimbat, raportul nu mai descrie revizia curentă, chiar dacă textul lui este neschimbat.
 */
async function checkFreshness(measurement) {
  const issues = [];
  const builds = await measureBuilds();
  const renders = measureRenders();
  if (JSON.stringify(builds) !== JSON.stringify(measurement.build?.samples))
    issues.push(
      'măsurătoarea de build este învechită față de sursă; rulează npm run perf:gate -- --measure',
    );
  if (JSON.stringify(renders) !== JSON.stringify(measurement.render))
    issues.push(
      'măsurătoarea de randare este învechită față de sursă; rulează npm run perf:gate -- --measure',
    );
  return issues;
}

function printSummary(report) {
  console.log(
    `GATE structural ${report.summary.structural} · release ${report.summary.release} · ${report.summary.pass} PASS, ${report.summary.fail} FAIL, ${report.summary.notValidated} NOT_VALIDATED · commit ${report.commit.slice(0, 12)}`,
  );
  for (const row of report.rows)
    console.log(
      `${row.verdict.padEnd(14)} ${row.id.padEnd(30)} ${row.reason.length === 0 ? row.detail : `${row.detail} — ${row.reason}`}`,
    );
}

async function writeReports() {
  const { report, measurement, json, markdown } = await derive();
  printSummary(report);
  if (wantsCheck) {
    for (const issue of await checkFreshness(measurement)) {
      console.error(`ISSUE ${issue}`);
      process.exitCode = 1;
    }
    const saved = await readFile(reportJson, 'utf8').catch(() => null);
    if (saved !== json) {
      console.error(`Gate report is stale: ${relative(reportJson)}`);
      process.exitCode = 1;
    } else console.log(`Gate report is current: ${relative(reportJson)}`);
    const savedMarkdown = await readFile(reportMarkdown, 'utf8').catch(() => null);
    if (savedMarkdown !== markdown) {
      console.error(`Gate markdown is stale: ${relative(reportMarkdown)}`);
      process.exitCode = 1;
    } else console.log(`Gate markdown is current: ${relative(reportMarkdown)}`);
  } else {
    await mkdir(evidenceDirectory, { recursive: true });
    await writeFile(reportJson, json);
    await writeFile(reportMarkdown, markdown);
    console.log(`Wrote ${relative(reportJson)}`);
    console.log(`Wrote ${relative(reportMarkdown)}`);
  }
  if (report.summary.structural === 'FAIL') process.exitCode = 1;
  if (wantsStrictRelease && report.summary.release !== 'PASS') process.exitCode = 1;
}

if (wantsMeasure) await measure();
await writeReports();

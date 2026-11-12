import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { availableParallelism, cpus, totalmem } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 156 — raportul determinist al benchmark-ului de flotă și trafic.
 *
 * `npm run perf:traffic-benchmark -- --measure` execută matricea completă (20/24/30 taxiuri ×
 * densități civile × sisteme atașate × condiții) pe contractele reale și scrie `measurement.json`.
 * `npm run perf:traffic-benchmark` derivează `report.json` + `report.md` din măsurătoarea comisă,
 * citind bugetele din `Docs/performance-budgets.json` fără să le modifice. `--check` compară
 * raportul derivat cu fișierele comise.
 *
 * `--only=<substring>` este o unealtă de depanare; artefactul comis acoperă întotdeauna matricea
 * completă, iar `--check` refuză un raport incomplet.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = join(root, 'Docs', 'Evidence', '156-traffic-benchmark');
const measurementFile = join(evidence, 'measurement.json');
const reportJson = join(evidence, 'report.json');
const reportMarkdown = join(evidence, 'report.md');
const manifestFile = join(root, 'Docs', 'performance-budgets.json');

const wantsCheck = process.argv.includes('--check');
const wantsMeasure = process.argv.includes('--measure');
const only = process.argv
  .filter((argument) => argument.startsWith('--only='))
  .map((argument) => argument.slice('--only='.length))
  .filter((value) => value.length > 0);

const contract = await import(
  pathToFileURL(join(root, 'tests', 'harness', 'traffic-benchmark.ts')).href
);
const budget = await import(
  pathToFileURL(join(root, 'tests', 'harness', 'hardware-budget.ts')).href
);

function machineIdentity() {
  const cpu = cpus()[0]?.model.trim().replace(/\s+/g, ' ') ?? 'unknown CPU';
  return `${cpu}; ${availableParallelism()} fire logice; ${Math.round(totalmem() / 2 ** 30)} GiB RAM; Node ${process.version.replace(/^v/, '')}; Windows; rulare headless, fără renderer`;
}

function relative(path) {
  return path
    .replace(root, '')
    .replace(/^[\\/]/, '')
    .replaceAll('\\', '/');
}

async function measure() {
  const measurement = await contract.measureTrafficBenchmark({
    measuredAt: new Date().toISOString(),
    machine: machineIdentity(),
    command: 'npm run perf:traffic-benchmark -- --measure',
    ...(only.length === 0 ? {} : { only }),
    onRow: (row, index, total) => {
      console.log(
        `ROW ${index}/${total} ${row.spec.id} · tick p95 ${row.pooled.tick.p95} ms · fizică ${row.pooled.physics.p95} · decizii ${row.pooled.decisions.p95} · UI ${row.pooled.ui.p95} · sistem ${row.pooled.system.p95} · invizibile ${row.invisibleTaxis} · expunere ${row.fleetVehicleSeconds}`,
      );
      for (const entry of row.structural)
        if (!entry.pass) console.error(`  STRUCTURAL FAIL ${entry.id}: ${entry.detail}`);
    },
  });
  await mkdir(evidence, { recursive: true });
  await writeFile(measurementFile, `${JSON.stringify(measurement, null, 2)}\n`);
  console.log(
    `Matrice măsurată: ${measurement.rows.length} rânduri, ${measurement.rows.reduce((total, row) => total + row.repeats.length, 0)} rulări.`,
  );
}

async function derive() {
  const manifest = budget.parseBudgetManifest(JSON.parse(await readFile(manifestFile, 'utf8')));
  const measurement = JSON.parse(await readFile(measurementFile, 'utf8'));
  if (measurement.rows.length !== contract.expandTrafficMatrix().length)
    throw new Error(
      `measurement.json is partial (${measurement.rows.length} rows); the committed artifact needs the complete matrix`,
    );
  const report = contract.buildTrafficBenchmarkReport({ manifest, measurement });
  const issues = contract.verifyTrafficBenchmarkReport(report);
  if (issues.length > 0) {
    for (const issue of issues) console.error(`ISSUE ${issue}`);
    process.exitCode = 1;
  }
  return {
    report,
    json: `${JSON.stringify(report, null, 2)}\n`,
    markdown: contract.trafficBenchmarkMarkdown(report),
  };
}

function printSummary(report) {
  for (const row of report.rows)
    console.log(
      `${row.verdict.padEnd(9)} ${row.id} · tick p95 ${row.cpu.tick.p95} ms · fizică ${row.cpu.physics.p95} · decizii ${row.cpu.decisions.p95} · UI ${row.cpu.ui.p95} · sistem ${row.cpu.system.p95} · GPU NOT_MEASURED`,
    );
  for (const row of report.rows.filter((entry) => entry.verdict === 'FAIL'))
    console.log(`DEVIATION ${row.id} · ${row.findings.join('; ')}`);
  console.log(
    `SUMMARY PASS ${report.summary.pass}, FAIL ${report.summary.fail}, STRESS ${report.summary.stress}, REPORTED ${report.summary.reported}, gate ${report.summary.gate}, hardwareGameplayGate ${report.summary.hardwareGameplayGate}`,
  );
}

async function writeReports() {
  const { report, json, markdown } = await derive();
  printSummary(report);
  if (wantsCheck) {
    const saved = await readFile(reportJson, 'utf8').catch(() => null);
    if (saved !== json) {
      console.error(`Traffic benchmark report is stale: ${relative(reportJson)}`);
      process.exitCode = 1;
    } else console.log(`Traffic benchmark report is current: ${relative(reportJson)}`);
    const savedMarkdown = await readFile(reportMarkdown, 'utf8').catch(() => null);
    if (savedMarkdown !== markdown) {
      console.error(`Traffic benchmark markdown is stale: ${relative(reportMarkdown)}`);
      process.exitCode = 1;
    } else console.log(`Traffic benchmark markdown is current: ${relative(reportMarkdown)}`);
    return;
  }
  await mkdir(evidence, { recursive: true });
  await writeFile(reportJson, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${relative(reportJson)}`);
  console.log(`Wrote ${relative(reportMarkdown)}`);
}

if (wantsMeasure) await measure();
await writeReports();

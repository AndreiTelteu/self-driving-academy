import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 158 — raportul determinist al costurilor de simulare și estimare.
 *
 * `--baseline` măsoară implementarea dinaintea optimizării și scrie `baseline.json`; este o
 * operație istorică, nu se reexecută pe codul optimizat. `--measure` măsoară implementarea curentă
 * și scrie `measurement.json`. Rularea implicită derivează `report.json` + `report.md` din cele două
 * măsurători comise, citind bugetele din `Docs/performance-budgets.json` fără să le modifice.
 * `--check` compară raportul derivat cu fișierele comise.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = join(root, 'Docs', 'Evidence', '158-simulation-budget');
const baselineFile = join(evidence, 'baseline.json');
const measurementFile = join(evidence, 'measurement.json');
const reportJson = join(evidence, 'report.json');
const reportMarkdown = join(evidence, 'report.md');
const manifestFile = join(root, 'Docs', 'performance-budgets.json');

const wantsCheck = process.argv.includes('--check');
const wantsMeasure = process.argv.includes('--measure');
const wantsBaseline = process.argv.includes('--baseline');
if (wantsCheck && (wantsMeasure || wantsBaseline))
  throw new Error('--check is read-only and cannot be combined with --measure/--baseline');

const contract = await import(
  pathToFileURL(join(root, 'tests', 'harness', 'simulation-budget.ts')).href
);
/** Three independent passes per artifact; the reported value is their median, as in 155/156/220. */
const MEASUREMENT_PASSES = 3;
const budget = await import(
  pathToFileURL(join(root, 'tests', 'harness', 'hardware-budget.ts')).href
);
const workerLimits = await import(pathToFileURL(join(root, 'src', 'workers', 'index.ts')).href);

function relative(path) {
  return path
    .replace(root, '')
    .replace(/^[\\/]/, '')
    .replaceAll('\\', '/');
}

function commit() {
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .some(
        (line) =>
          line.trim().length > 0 &&
          !line.includes('Docs/Evidence/158-simulation-budget/') &&
          !line.includes('PBI/'),
      );
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return 'UNKNOWN';
  }
}

function numeric(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new TypeError(`Manifest field ${path} must be a finite number`);
  return value;
}

async function readLimits() {
  const raw = JSON.parse(await readFile(manifestFile, 'utf8'));
  const sliceMaximumMs = numeric(
    raw?.workerSchedulingProposal?.sliceMaximumMs,
    'workerSchedulingProposal.sliceMaximumMs',
  );
  const admissionSliceMs = numeric(
    raw?.resourceAdmissionContracts?.workers?.sliceMaximumMs,
    'resourceAdmissionContracts.workers.sliceMaximumMs',
  );
  if (sliceMaximumMs !== admissionSliceMs)
    throw new Error('Manifest disagrees about the worker slice ceiling');
  return {
    sliceMaximumMs,
    pendingWorkerPayloadBytes: numeric(
      raw?.proposedCapacities?.pendingWorkerPayloadBytes,
      'proposedCapacities.pendingWorkerPayloadBytes',
    ),
    maxWorkerPayloadBytes: workerLimits.limits.bytes,
  };
}

async function measure(file, label) {
  const measurement = contract.measureSimulationBudget({
    commit: commit(),
    passes: MEASUREMENT_PASSES,
  });
  await mkdir(evidence, { recursive: true });
  await writeFile(file, `${JSON.stringify(measurement, null, 2)}\n`);
  console.log(
    `${label}: decizii p95 ${measurement.decisions.tickMs.p95} ms/tick, estimare worker p95 ${measurement.estimation.workerStepMs.p95} ms, transfer p95 ${measurement.transfer.perMessageMs.p95} ms/mesaj`,
  );
  console.log(
    `${label}: copii payload ${measurement.estimation.payloadSlicesPerEstimate}/estimare (${measurement.estimation.payloadCopiedBytesPerEstimate} B), buffer de control partajat ${measurement.transfer.controlSharesEmptyBuffer}`,
  );
  console.log(
    `${label}: digest decizii ${measurement.digests.decisions.slice(0, 16)}…, estimare ${measurement.digests.estimation.slice(0, 16)}…, transfer ${measurement.digests.transfer.slice(0, 16)}…`,
  );
  console.log(`Wrote ${relative(file)}`);
}

async function derive() {
  const manifest = budget.parseBudgetManifest(JSON.parse(await readFile(manifestFile, 'utf8')));
  const limits = await readLimits();
  const baseline = JSON.parse(await readFile(baselineFile, 'utf8'));
  const after = JSON.parse(await readFile(measurementFile, 'utf8'));
  if (baseline.fixtureVersion !== contract.SIMULATION_FIXTURE_VERSION)
    throw new Error('baseline.json does not use the committed 158 fixture');
  if (after.fixtureVersion !== contract.SIMULATION_FIXTURE_VERSION)
    throw new Error('measurement.json does not use the committed 158 fixture');
  const report = contract.buildSimulationBudgetReport({ manifest, limits, baseline, after });
  const issues = contract.verifySimulationBudgetReport(report);
  if (issues.length > 0) {
    for (const issue of issues) console.error(`ISSUE ${issue}`);
    process.exitCode = 1;
  }
  return {
    report,
    json: `${JSON.stringify(report, null, 2)}\n`,
    markdown: contract.simulationBudgetMarkdown(report),
  };
}

function printSummary(report) {
  for (const row of report.rows)
    console.log(
      `${row.verdict.padEnd(9)} ${row.id} · ${row.before ?? '—'} → ${row.after ?? '—'} · ${row.metric}`,
    );
  for (const equivalence of report.equivalence)
    console.log(
      `${equivalence.status.padEnd(9)} echivalență ${equivalence.component} · ${equivalence.entries} ieșiri`,
    );
  console.log(
    `SUMMARY decizii ${report.verdicts.decisions}, estimare ${report.verdicts.estimation}, transferuri ${report.verdicts.transfer}, echivalență ${report.verdicts.equivalence}, general ${report.verdicts.overall}`,
  );
}

async function writeReports() {
  const { report, json, markdown } = await derive();
  printSummary(report);
  if (wantsCheck) {
    const saved = await readFile(reportJson, 'utf8').catch(() => null);
    if (saved !== json) {
      console.error(`Simulation budget report is stale: ${relative(reportJson)}`);
      process.exitCode = 1;
    } else console.log(`Simulation budget report is current: ${relative(reportJson)}`);
    const savedMarkdown = await readFile(reportMarkdown, 'utf8').catch(() => null);
    if (savedMarkdown !== markdown) {
      console.error(`Simulation budget markdown is stale: ${relative(reportMarkdown)}`);
      process.exitCode = 1;
    } else console.log(`Simulation budget markdown is current: ${relative(reportMarkdown)}`);
    return;
  }
  await mkdir(evidence, { recursive: true });
  await writeFile(reportJson, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${relative(reportJson)}`);
  console.log(`Wrote ${relative(reportMarkdown)}`);
}

if (wantsBaseline) await measure(baselineFile, 'Baseline');
if (wantsMeasure) await measure(measurementFile, 'After');
if (wantsBaseline || wantsMeasure) {
  const { existsSync } = await import('node:fs');
  if (existsSync(baselineFile) && existsSync(measurementFile)) await writeReports();
} else await writeReports();

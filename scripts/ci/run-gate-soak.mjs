import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 224 — soak-ul reviziei curente, cu aceeași probă 159.
 *
 * `--measure` rulează sesiunea reală de minimum 60 de minute cu 20 de cicluri lifecycle
 * (`runSoak` din `tests/harness/soak-session.ts`, aceeași funcție folosită de PBI 159) și scrie
 * `measurement.json` + jurnalul `soak-run.txt` în `Docs/Evidence/224-performance-gate/soak/`.
 * Raportul (`report.json` + `report.md`) este derivat cu contractul 159
 * (`buildSoakReport`/`verifySoakReport`), citind bugetele din `Docs/performance-budgets.json`.
 *
 * `--check` rederivă raportul din măsurătoarea comisă și îl compară byte cu byte. Rulările scurte
 * (`--minutes 2`) rămân diagnostice: `verifySoakReport` le respinge ca dovadă de soak.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const evidence = join(root, 'Docs', 'Evidence', '224-performance-gate', 'soak');
const measurementFile = join(evidence, 'measurement.json');
const reportJson = join(evidence, 'report.json');
const reportMarkdown = join(evidence, 'report.md');
const runLog = join(evidence, 'soak-run.txt');
const manifestFile = join(root, 'Docs', 'performance-budgets.json');

const argument = (name) => {
  const prefix = `--${name}=`;
  const found = process.argv.find((entry) => entry.startsWith(prefix));
  return found === undefined ? null : found.slice(prefix.length);
};
const numberArgument = (name, fallback) => {
  const value = argument(name);
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--${name} needs a positive number`);
  return parsed;
};
const wantsMeasure = process.argv.includes('--measure');
const wantsCheck = process.argv.includes('--check');
const noGc = process.argv.includes('--no-gc');
const noPace = process.argv.includes('--no-pace');
const minutes = numberArgument('minutes', 60);
const cycles = numberArgument('cycles', 20);
const interval = numberArgument('interval', 30);
const commitArgument = argument('commit');

const session = await import(pathToFileURL(join(root, 'tests', 'harness', 'soak-session.ts')).href);
const reportModule = await import(
  pathToFileURL(join(root, 'tests', 'harness', 'soak-report.ts')).href
);
const budget = await import(
  pathToFileURL(join(root, 'tests', 'harness', 'hardware-budget.ts')).href
);

function relativeToRoot(file) {
  return relative(root, file).replaceAll('\\', '/');
}

function headCommit() {
  if (commitArgument !== null) return commitArgument;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

async function measure() {
  await mkdir(evidence, { recursive: true });
  await writeFile(runLog, '');
  const log = async (line) => {
    console.log(line);
    await appendFile(runLog, `${line}\n`);
  };
  const measurement = await session.runSoak({
    durationMinutes: minutes,
    cycles,
    sampleIntervalSeconds: interval,
    commit: headCommit(),
    pace: !noPace,
    ...(typeof globalThis.gc === 'function' && !noGc ? { gc: globalThis.gc } : {}),
    log: (line) => {
      console.log(line);
      void appendFile(runLog, `${line}\n`);
    },
  });
  await writeFile(measurementFile, `${JSON.stringify(measurement, null, 2)}\n`);
  await log(
    `[gate-soak] măsurătoare scrisă: ${relativeToRoot(measurementFile)} · durată reală ${(
      measurement.durationMs / 60000
    ).toFixed(
      2,
    )} min · ${measurement.cycles.length} cicluri · ${measurement.series.length} eșantioane`,
  );
}

async function derive() {
  const rawManifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  const manifest = budget.parseBudgetManifest(rawManifest);
  const measurement = JSON.parse(await readFile(measurementFile, 'utf8'));
  const report = reportModule.buildSoakReport({ measurement, manifest, rawManifest });
  const issues = reportModule.verifySoakReport(report);
  if (issues.length > 0) {
    for (const issue of issues) console.error(`ISSUE ${issue}`);
    process.exitCode = 1;
  }
  return {
    report,
    json: `${JSON.stringify(report, null, 2)}\n`,
    markdown: reportModule.soakMarkdown(report),
  };
}

function printSummary(report) {
  console.log(
    `SOAK ${report.verdict.status} · ${report.duration.actualMinutes} min · ${report.lifecycle.cycles} cicluri (${report.lifecycle.cleanCycles} curate) · heap +${(report.memory.deltaHeapUsedBytes / 1048576).toFixed(2)} MiB din ${(report.memory.allowedGrowthBytes / 1048576).toFixed(2)} MiB · throttling ${report.throttling.status}`,
  );
  for (const trend of report.trends)
    console.log(
      `TREND ${trend.classification.padEnd(10)} ${trend.id} · interval ${Math.round(trend.growthWithinWindow)} · prag ${Math.round(trend.allowedGrowth)}`,
    );
}

async function writeReports() {
  const { report, json, markdown } = await derive();
  printSummary(report);
  if (wantsCheck) {
    const saved = await readFile(reportJson, 'utf8').catch(() => null);
    if (saved !== json) {
      console.error(`Gate soak report is stale: ${relativeToRoot(reportJson)}`);
      process.exitCode = 1;
    } else console.log(`Gate soak report is current: ${relativeToRoot(reportJson)}`);
    const savedMarkdown = await readFile(reportMarkdown, 'utf8').catch(() => null);
    if (savedMarkdown !== markdown) {
      console.error(`Gate soak markdown is stale: ${relativeToRoot(reportMarkdown)}`);
      process.exitCode = 1;
    } else console.log(`Gate soak markdown is current: ${relativeToRoot(reportMarkdown)}`);
    return;
  }
  await mkdir(evidence, { recursive: true });
  await writeFile(reportJson, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${relativeToRoot(reportJson)}`);
  console.log(`Wrote ${relativeToRoot(reportMarkdown)}`);
}

if (wantsMeasure) {
  if (wantsCheck) throw new Error('--measure and --check are separate invocations');
  await measure();
}
await writeReports();

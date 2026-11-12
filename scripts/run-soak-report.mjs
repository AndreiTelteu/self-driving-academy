import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 159 — raportul determinist al sesiunii lungi (soak).
 *
 * `npm run perf:soak -- --measure` execută soak-ul real (implicit 60 de minute de timp de perete,
 * 20 de cicluri lifecycle), scrie `measurement.json` și jurnalul periodic `soak-run.log`.
 * Rularea implicită derivează `report.json` + `report.md` din măsurătoarea comisă, citind bugetele
 * din `Docs/performance-budgets.json` fără să le modifice. `--check` compară artefactele derivate cu
 * fișierele comise și refuză un raport structural invalid.
 *
 * Rulările scurte (`--minutes 2`) sunt diagnostice: raportul iese `DIAGNOSTIC` și `--check` nu îl
 * acceptă ca dovadă de soak.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = join(root, 'Docs', 'Evidence', '159-soak');
const measurementFile = join(evidence, 'measurement.json');
const reportJson = join(evidence, 'report.json');
const reportMarkdown = join(evidence, 'report.md');
const runLog = join(evidence, 'soak-run.txt');
const manifestFile = join(root, 'Docs', 'performance-budgets.json');

const wantsCheck = process.argv.includes('--check');
const wantsMeasure = process.argv.includes('--measure');
const noGc = process.argv.includes('--no-gc');
const noPace = process.argv.includes('--no-pace');
const numberArgument = (name, fallback) => {
  const hit = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  if (hit === undefined) return fallback;
  const value = Number(hit.slice(name.length + 3));
  if (!Number.isFinite(value)) throw new Error(`--${name} needs a finite number`);
  return value;
};
const commitArgument = process.argv.find((argument) => argument.startsWith('--commit='));
const minutes = numberArgument('minutes', 60);
const cycles = numberArgument('cycles', 20);
const interval = numberArgument('interval', 30);
const stallArgument = process.argv.find((argument) => argument.startsWith('--stall-cycles='));
const stallCycles =
  stallArgument === undefined
    ? undefined
    : stallArgument
        .slice('--stall-cycles='.length)
        .split(',')
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0);

const session = await import(pathToFileURL(join(root, 'tests', 'harness', 'soak-session.ts')).href);
const reportModule = await import(
  pathToFileURL(join(root, 'tests', 'harness', 'soak-report.ts')).href
);
const budget = await import(
  pathToFileURL(join(root, 'tests', 'harness', 'hardware-budget.ts')).href
);

function relative(path) {
  return path
    .replace(root, '')
    .replace(/^[\\/]/, '')
    .replaceAll('\\', '/');
}

function headCommit() {
  if (commitArgument !== undefined) return commitArgument.slice('--commit='.length);
  try {
    return execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
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
    ...(stallCycles === undefined ? {} : { stallCycles }),
    ...(typeof globalThis.gc === 'function' && !noGc ? { gc: globalThis.gc } : {}),
    log: (line) => {
      console.log(line);
      void appendFile(runLog, `${line}\n`);
    },
  });
  await writeFile(measurementFile, `${JSON.stringify(measurement, null, 2)}\n`);
  await log(
    `[soak] măsurătoare scrisă: ${relative(measurementFile)} · durată reală ${(
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
    `VERDICT ${report.verdict.status} · durată ${report.duration.actualMinutes} min · cicluri ${report.lifecycle.cycles} · heap delta ${(
      report.memory.deltaHeapUsedBytes / 1048576
    ).toFixed(
      2,
    )} MiB · incidente ${report.incidents.total} (${report.incidents.unrecovered} nerecuperate) · throttling ${report.throttling.status}`,
  );
  for (const check of report.checks) console.log(`CHECK ${check.verdict.padEnd(12)} ${check.id}`);
  for (const trend of report.trends)
    console.log(
      `TREND ${trend.classification.padEnd(10)} ${trend.id} · interval ${Math.round(
        trend.growthWithinWindow,
      )} · prag ${Math.round(trend.allowedGrowth)} · pantă ${Math.round(trend.slopePerMinute)}/min`,
    );
}

async function writeReports() {
  const { report, json, markdown } = await derive();
  printSummary(report);
  if (wantsCheck) {
    const saved = await readFile(reportJson, 'utf8').catch(() => null);
    if (saved !== json) {
      console.error(`Soak report is stale: ${relative(reportJson)}`);
      process.exitCode = 1;
    } else console.log(`Soak report is current: ${relative(reportJson)}`);
    const savedMarkdown = await readFile(reportMarkdown, 'utf8').catch(() => null);
    if (savedMarkdown !== markdown) {
      console.error(`Soak markdown is stale: ${relative(reportMarkdown)}`);
      process.exitCode = 1;
    } else console.log(`Soak markdown is current: ${relative(reportMarkdown)}`);
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

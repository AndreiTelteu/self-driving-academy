import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { availableParallelism, cpus, totalmem } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 157 — raportul determinist al bugetului de randare (partea structurală).
 *
 * `npm run perf:render-budget -- --measure` rulează proba structurală pe contractele reale de
 * prezentare (`createCityScene`, `createCityDecorScene`, `createDaylight`, `BabylonCellBatches`
 * plus picking pe raze) și scrie `after.json`. `--capture=before` scrie `before.json`, folosit
 * o singură dată, pe sursa dinaintea optimizării.
 *
 * `npm run perf:render-budget` derivează `report.json` + `report.md` din cele două capturi comise,
 * citind bugetele din `Docs/performance-budgets.json` fără să le modifice. `--check` reexecută
 * proba, refuză o captură `after` învechită și compară raportul derivat cu fișierele comise.
 *
 * Proba nu măsoară timp de perete: frame time și lucrul GPU sunt `NOT_MEASURED` cu motiv, nu 0.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = join(root, 'Docs', 'Evidence', '157-render-budget');
const manifestFile = join(root, 'Docs', 'performance-budgets.json');
const reportJson = join(evidence, 'report.json');
const reportMarkdown = join(evidence, 'report.md');

const argument = (name) => {
  const prefix = `--${name}=`;
  const found = process.argv.find((entry) => entry.startsWith(prefix));
  return found === undefined ? null : found.slice(prefix.length);
};
const wantsCheck = process.argv.includes('--check');
const wantsMeasure = process.argv.includes('--measure');
const capture = argument('capture') ?? 'after';
if (capture !== 'before' && capture !== 'after')
  throw new Error(`Unknown capture "${capture}" (before|after)`);

const contract = await import(
  pathToFileURL(join(root, 'tests', 'harness', 'render-budget.ts')).href
);

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function machine() {
  const cpu = cpus()[0]?.model.trim().replace(/\s+/g, ' ') ?? 'CPU necunoscut';
  return `${cpu}; ${availableParallelism()} fire logice; ${Math.round(totalmem() / 2 ** 30)} GiB RAM; Node ${process.version.replace(/^v/, '')}; Windows; NullEngine (fără renderer hardware)`;
}

function relative(path) {
  return path
    .replace(root, '')
    .replace(/^[\\/]/, '')
    .replaceAll('\\', '/');
}

const labels = {
  before: 'baseline înainte de optimizare (sursa neatinsă)',
  after: 'după optimizare (aceeași probă, același fixture)',
};

async function measure() {
  const measurement = contract.measureRenderBudget();
  const captureFile = join(evidence, `${capture}.json`);
  const payload = {
    meta: {
      capturedAt: new Date().toISOString(),
      commit: git('rev-parse', 'HEAD'),
      label: labels[capture],
      machine: machine(),
      command: `npm run perf:render-budget -- --measure --capture=${capture}`,
      fixture: 'layout real 042 + decor 146 + 70 vehicule × 3 preseturi + 32 raze',
    },
    measurement,
  };
  await mkdir(evidence, { recursive: true });
  await writeFile(captureFile, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Captură ${capture} scrisă: ${relative(captureFile)}`);
  console.log(
    `  draw calls oraș ${measurement.city.drawCalls} · mesh-uri ${measurement.city.meshes} · instanțe thin ${measurement.city.thinInstances}`,
  );
  console.log(
    `  umbre ${measurement.shadows.map((arm) => `${arm.preset} ${arm.admitted}/${arm.limit} esențial ${arm.essentialAdmitted}`).join(' · ')}`,
  );
  console.log(
    `  picking ${measurement.picking.identical}/${measurement.picking.rays} identice · LOD ${measurement.lod.map((arm) => `${arm.preset} ${arm.switches}/${arm.oscillation}`).join(' · ')}`,
  );
  return payload;
}

async function derive() {
  const manifest = contract.parseRenderBudgets(JSON.parse(await readFile(manifestFile, 'utf8')));
  const before = JSON.parse(await readFile(join(evidence, 'before.json'), 'utf8'));
  const after = JSON.parse(await readFile(join(evidence, 'after.json'), 'utf8'));
  const report = contract.buildRenderBudgetReport({
    budgets: manifest,
    before: before.measurement,
    after: after.measurement,
    beforeMeta: before.meta,
    afterMeta: after.meta,
  });
  const issues = contract.verifyRenderBudgetReport(report);
  if (issues.length > 0) {
    for (const issue of issues) console.error(`ISSUE ${issue}`);
    process.exitCode = 1;
  }
  return {
    report,
    json: `${JSON.stringify(report, null, 2)}\n`,
    markdown: contract.renderBudgetMarkdown(report),
  };
}

function printSummary(report) {
  for (const row of report.rows)
    console.log(
      `${row.verdict.padEnd(12)} ${row.id.padEnd(26)} ${String(row.before ?? '—').padStart(6)} → ${String(row.after ?? '—').padStart(6)} ${row.unit}`,
    );
  for (const row of report.rows.filter((entry) => entry.verdict === 'FAIL'))
    console.log(`DEVIATION ${row.id} · ${row.note}`);
  console.log(
    `SUMMARY PASS ${report.summary.pass}, FAIL ${report.summary.fail}, NOT_MEASURED ${report.summary.notMeasured}, structural ${report.summary.structural}, gate ${report.summary.gate}, hardwareGameplayGate ${report.summary.hardwareGameplayGate}`,
  );
}

async function writeReports() {
  const { report, json, markdown } = await derive();
  printSummary(report);
  if (wantsCheck) {
    const fresh = contract.measureRenderBudget();
    const saved = JSON.parse(await readFile(join(evidence, 'after.json'), 'utf8'));
    if (JSON.stringify(fresh) !== JSON.stringify(saved.measurement)) {
      console.error('Captura after.json este învechită față de sursă; rulează --measure.');
      process.exitCode = 1;
    } else console.log(`Captura este curentă: ${relative(join(evidence, 'after.json'))}`);
    const savedJson = await readFile(reportJson, 'utf8').catch(() => null);
    if (savedJson !== json) {
      console.error(`Raportul structural este învechit: ${relative(reportJson)}`);
      process.exitCode = 1;
    } else console.log(`Raportul structural este curent: ${relative(reportJson)}`);
    const savedMarkdown = await readFile(reportMarkdown, 'utf8').catch(() => null);
    if (savedMarkdown !== markdown) {
      console.error(`Raportul Markdown este învechit: ${relative(reportMarkdown)}`);
      process.exitCode = 1;
    } else console.log(`Raportul Markdown este curent: ${relative(reportMarkdown)}`);
    return;
  }
  await mkdir(evidence, { recursive: true });
  await writeFile(reportJson, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Scris ${relative(reportJson)}`);
  console.log(`Scris ${relative(reportMarkdown)}`);
}

if (wantsMeasure && !wantsCheck) await measure();
else await writeReports();

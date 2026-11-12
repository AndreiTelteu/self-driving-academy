import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PBI 160 — pipeline-ul CI de verificare și livrare statică.
 *
 * O singură comandă rulează, în ordine, verificările obligatorii, suita completă de teste,
 * validarea planului și a boardului, coerența manifestului de asseturi, gate-ul 224 și buildul de
 * producție. Fiecare pas obligatoriu este oprit la primul eșec (`fail fast`), iar buildul și
 * verificarea HTTP statică sunt ultimele: un rezultat eșuat nu ajunge niciodată la livrare.
 *
 * Reutilizează contractele existente, fără sisteme paralele:
 *   - gate-ul 224 (`npm run perf:gate -- --check`) în banda `verify`, respectiv jobul provider-neutral
 *     `scripts/ci/run-performance-gate-job.mjs --require=release` în banda `release`;
 *   - `PBI/Validate-Plan.ps1` (care include boardul) și `PBI/Validate-Board.ps1`;
 *   - `npm run assets:manifest -- --check` pentru coerența manifestului 150;
 *   - `npm run build` și `npm run build:report -- --check` pentru artefact și livrare statică.
 *
 * `Validate-Plan.ps1` este singurul pas cu datorie preexistentă cunoscută: pe commitul de bază
 * există linkuri locale rupte în fișiere pe care acest PBI nu le deține (inclusiv PBI/Done, care nu
 * se modifică). Pipeline-ul îl rulează obligatoriu și îi publică rezultatul; un link rupt într-un
 * fișier atins de această schimbare, o eroare de board sau orice altă eroare de plan rămân
 * blocante. Datoria este raportată explicit, nu ascunsă.
 *
 * Verdictul de release nu este niciodată dedus din FPS headless/software: dacă raportul 224 lasă
 * criteriul hardware `NOT_VALIDATED`, banda `verify` publică `PASSED_STRUCTURAL` cu livrarea
 * `STATIC_VERIFIED`, iar banda `release` iese cu cod 1 fără să declare livrare.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const gateReportFile = join(root, 'Docs', 'Evidence', '224-performance-gate', 'report.json');

const argument = (name) => {
  const prefix = `--${name}=`;
  const found = process.argv.find((entry) => entry.startsWith(prefix));
  return found === undefined ? null : found.slice(prefix.length);
};
const lane = argument('lane') ?? 'verify';
if (lane !== 'verify' && lane !== 'release') throw new Error('--lane must be verify or release');
const outArgument = argument('out');
const evidenceDirectory =
  outArgument === null
    ? join(root, 'Docs', 'Evidence', '160-build-delivery')
    : resolve(root, outArgument);
const artifactFile = join(evidenceDirectory, 'ci-pipeline.json');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pwsh = process.platform === 'win32' ? 'pwsh.exe' : 'pwsh';
const steps = [];
const startedAt = new Date().toISOString();

function relativeToRoot(file) {
  return relative(root, file).replaceAll('\\', '/');
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function changedFiles() {
  try {
    return execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => resolve(root, line.slice(3).replace(/^"|"$/g, '')));
  } catch {
    return [];
  }
}

/** Rulează un pas și consemnează codul de ieșire real. */
function run(label, command, args, options = {}) {
  const started = Date.now();
  let exitCode = 0;
  let output = '';
  try {
    output = execFileSync(command, args, {
      cwd: root,
      encoding: 'utf8',
      timeout: 60 * 60 * 1000,
      shell: options.shell ?? false,
      stdio: options.capture === true ? 'pipe' : 'inherit',
    });
  } catch (error) {
    exitCode = typeof error.status === 'number' ? error.status : 1;
    // Ieșirea pasului capturat este clasificată mai jos; pașii `inherit` și-au afișat deja rezultatul.
    if (options.capture === true) output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
  const durationMs = Date.now() - started;
  const step = Object.freeze({
    label,
    command: [command, ...args].join(' '),
    exitCode,
    durationMs,
    status: exitCode === 0 ? 'PASS' : 'FAIL',
  });
  steps.push(step);
  console.log(`STEP ${label}: exit ${exitCode} (${durationMs} ms)`);
  return { step, output };
}

function npmStep(label, args) {
  return run(label, npm, args, { shell: true }).step;
}

function powershellStep(label, script) {
  return run(label, pwsh, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, script)])
    .step;
}

/**
 * Scoate secvențele ANSI din ieșirea PowerShell, ca mesajul de eroare să poată fi citit și
 * clasificat fără să depindă de formatarea consolei.
 */
function stripAnsi(text) {
  const escape = String.fromCharCode(27);
  let out = '';
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === escape && text[index + 1] === '[') {
      let cursor = index + 2;
      while (cursor < text.length && /[0-9;]/.test(text[cursor])) cursor += 1;
      if (text[cursor] === 'm') {
        index = cursor;
        continue;
      }
    }
    out += text[index];
  }
  return out;
}

/**
 * Rulează `Validate-Plan.ps1` și separă datoria preexistentă de o eroare introdusă aici. Un link
 * rupt este datorie numai dacă fișierul care îl conține nu este atins de această schimbare; boardul
 * invalid și orice altă eroare rămân blocante.
 */
function planStep() {
  const { step, output } = run(
    'plan:validate',
    pwsh,
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'PBI/Validate-Plan.ps1')],
    { capture: true },
  );
  if (step.exitCode === 0) {
    console.log('PLAN valid: board, linkuri, index și catalog sunt coerente.');
    return { step, debt: null };
  }
  const plain = stripAnsi(output);
  // PowerShell împachetează mesajul excepției pe mai multe linii (și intercalează coduri ANSI), deci
  // spațiile sunt normalizate înainte de căutare; altfel datoria preexistentă apare ca o eroare
  // necunoscută, deși `Validate-Plan` a raportat clar un link rupt.
  const flat = plain.replace(/\s+/g, ' ').trim();
  const broken = flat.match(/Link local rupt[\s\S]{0,80}?([A-Za-z]:\\[^:]+?\.md):/);
  const boardInvalid = /Board invalid/i.test(flat);
  const file = broken?.[1] ?? null;
  const owned = file !== null && changedFiles().includes(resolve(file));
  if (file !== null && !owned && !boardInvalid) {
    const pattern = new RegExp(`${escapeRegExp(file)}:\\s*\\|?\\s*(\\S+)`);
    const link = flat.match(pattern)?.[1] ?? '';
    const debt = Object.freeze({
      file: relativeToRoot(file),
      link,
      message: `Link local rupt în ${relativeToRoot(file)}: ${link}`,
      blocking: false,
      reason:
        'Link local rupt într-un fișier care nu este atins de această schimbare; datoria există pe commitul de bază.',
    });
    const adjusted = Object.freeze({ ...step, status: 'DEBT' });
    steps[steps.length - 1] = adjusted;
    console.log(
      `STEP plan:validate: DEBT (${debt.file} → ${debt.link}); datorie preexistentă, publicată nu ascunsă.`,
    );
    return { step: adjusted, debt };
  }
  console.error(`PLAN invalid: ${planError(plain)}`);
  return { step, debt: null };
}

function planError(plain) {
  const flat = stripAnsi(plain).replace(/\s+/g, ' ').trim();
  const broken = flat.match(/Link local rupt[\s\S]{0,120}?\.md:\s*(\S+)/);
  if (broken !== null) return broken[0];
  const board = flat.match(/Board invalid[\s\S]{0,200}/i);
  return (
    board?.[0]?.trim() ?? 'Validate-Plan a eșuat fără un link sau un board invalid identificabil.'
  );
}

const mandatory = [
  () => npmStep('preflight:typecheck', ['run', 'typecheck']),
  () => npmStep('preflight:lint', ['run', 'lint']),
  () => npmStep('preflight:format', ['run', 'format:check']),
  () => npmStep('preflight:architecture', ['run', 'check:architecture']),
  () => npmStep('preflight:parameter-catalog', ['run', 'check:parameter-catalog']),
  () => npmStep('tests:full', ['test']),
];

let failedStep = null;
let planDebt = null;
for (const step of mandatory) {
  const result = step();
  if (result.exitCode !== 0) {
    failedStep = result;
    break;
  }
}

if (failedStep === null) {
  const plan = planStep();
  if (plan.step.exitCode !== 0 && plan.debt === null) failedStep = plan.step;
  planDebt = plan.debt;
}

if (failedStep === null) {
  const board = powershellStep('board:validate', 'PBI/Validate-Board.ps1');
  if (board.exitCode !== 0) failedStep = board;
}

if (failedStep === null) {
  const assets = npmStep('assets:manifest', ['run', 'assets:manifest', '--', '--check']);
  if (assets.exitCode !== 0) failedStep = assets;
}

if (failedStep === null) {
  const gate =
    lane === 'release'
      ? run('gate:224', process.execPath, [
          join(root, 'scripts', 'ci', 'run-performance-gate-job.mjs'),
          '--no-preflight',
          '--require=release',
        ]).step
      : npmStep('gate:224', ['run', 'perf:gate', '--', '--check']);
  if (gate.exitCode !== 0) failedStep = gate;
}

// Livrarea rulează numai după ce toate verificările obligatorii au trecut.
if (failedStep === null) {
  const build = npmStep('build:production', ['run', 'build']);
  if (build.exitCode !== 0) failedStep = build;
  else {
    const delivery = npmStep('delivery:static', ['run', 'build:report', '--', '--check']);
    if (delivery.exitCode !== 0) failedStep = delivery;
  }
}

const gateReport = await readFile(gateReportFile, 'utf8')
  .then((text) => JSON.parse(text))
  .catch(() => null);
const structural = gateReport?.summary?.structural ?? 'MISSING';
const release = gateReport?.summary?.release ?? 'MISSING';
const openCriteria = gateReport?.summary?.openCriteria ?? [];
const gateValid =
  structural === 'PASS' && (gateReport?.rows ?? []).some((row) => row.id === 'fps-hardware');
const delivered = failedStep === null && steps.some((step) => step.label === 'delivery:static');

let outcome;
let deliveryState;
if (failedStep !== null || !gateValid) {
  outcome = 'FAILED';
  deliveryState = 'NOT_DELIVERED';
} else if (lane === 'release' && release !== 'PASS') {
  outcome = 'BLOCKED_BY_NOT_VALIDATED';
  deliveryState = 'BLOCKED_NOT_VALIDATED';
} else {
  outcome =
    planDebt === null
      ? lane === 'release'
        ? 'PASSED'
        : 'PASSED_STRUCTURAL'
      : 'PASSED_WITH_PLAN_DEBT';
  deliveryState = lane === 'release' ? 'RELEASE_READY' : 'STATIC_VERIFIED';
}

const artifact = Object.freeze({
  version: '160-ci-pipeline-v1',
  startedAt,
  finishedAt: new Date().toISOString(),
  lane,
  outcome,
  delivery: Object.freeze({
    state: deliveryState,
    staticVerified: delivered,
    note:
      deliveryState === 'STATIC_VERIFIED'
        ? 'Artefactul static a fost construit și servit prin HTTP. Livrarea de release rămâne condiționată de verdictul 224 pe hardware real, pe aceeași revizie.'
        : deliveryState === 'RELEASE_READY'
          ? 'Verificările obligatorii și verdictul de release 224 sunt PASS; artefactul static a fost verificat prin HTTP.'
          : deliveryState === 'BLOCKED_NOT_VALIDATED'
            ? 'Verdictul de release 224 nu este PASS (hardware nevalidat); nu se declară livrare.'
            : 'Niciun artefact de livrare nu este publicat după un pas eșuat.',
  }),
  gate: Object.freeze({
    structural,
    release,
    openCriteria,
    report: relativeToRoot(gateReportFile),
  }),
  planDebt,
  failedStep: failedStep?.label ?? null,
  steps: Object.freeze(steps),
  artifacts: Object.freeze([
    'dist/index.html',
    'Docs/Evidence/160-build-delivery/report.json',
    'Docs/Evidence/160-build-delivery/report.md',
    relativeToRoot(artifactFile),
  ]),
});

await mkdir(evidenceDirectory, { recursive: true });
await writeFile(artifactFile, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(
  `CI ${lane}: ${outcome} · gate 224 structural ${structural}, release ${release} · livrare ${deliveryState}${planDebt === null ? '' : ` · datorie plan: ${planDebt.file}`}`,
);
console.log(`Artefact: ${relativeToRoot(artifactFile)}`);
if (failedStep !== null)
  console.error(`Pas eșuat: ${failedStep.label} (exit ${failedStep.exitCode})`);
if (outcome === 'FAILED' || outcome === 'BLOCKED_BY_NOT_VALIDATED') process.exitCode = 1;

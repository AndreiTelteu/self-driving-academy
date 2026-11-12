import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PBI 224 — jobul CI al gate-ului de regresii.
 *
 * Pași, fiecare cu cod de ieșire real consemnat în artefactul `ci-job.json`:
 *   1. preflight static (`typecheck`, `lint`, `format:check`, `check:architecture`,
 *      `check:parameter-catalog`) — oprit cu `--no-preflight`;
 *   2. `npm run perf:gate -- --measure` — probele portabile ale reviziei curente;
 *   3. `npm run perf:gate -- --check` — reexecută miezul și compară raportul comis;
 *   4. verdict: `FAIL` oprește jobul; `NOT_VALIDATED` oprește jobul numai cu
 *      `--require=release` (adică pe un runner cu hardware real), altfel publică lista deschisă.
 *
 * `--require=structural` (implicit) cere ca probele portabile să treacă; criteriile de hardware
 * rămân declarate `NOT_VALIDATED` până la un runner real, exact cum cere contractul 224.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifestFile = join(root, 'Docs', 'Evidence', '224-performance-gate', 'ci-job.json');
const reportFile = join(root, 'Docs', 'Evidence', '224-performance-gate', 'report.json');

const argument = (name) => {
  const prefix = `--${name}=`;
  const found = process.argv.find((entry) => entry.startsWith(prefix));
  return found === undefined ? null : found.slice(prefix.length);
};
const requirement = argument('require') ?? 'structural';
if (requirement !== 'structural' && requirement !== 'release')
  throw new Error('--require must be structural or release');
const preflight = !process.argv.includes('--no-preflight');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const startedAt = new Date().toISOString();
const steps = [];

function run(label, args) {
  const started = Date.now();
  let exitCode = 0;
  try {
    execFileSync(npm, args, {
      cwd: root,
      stdio: 'inherit',
      timeout: 60 * 60 * 1000,
      // Windows refuses to spawn `.cmd` shims without a shell (EINVAL).
      shell: process.platform === 'win32',
    });
  } catch (error) {
    exitCode = typeof error.status === 'number' ? error.status : 1;
  }
  const durationMs = Date.now() - started;
  console.log(`JOB ${label}: exit ${exitCode} (${durationMs} ms)`);
  const step = { label, command: `npm ${args.join(' ')}`, exitCode, durationMs };
  steps.push(step);
  return step;
}

if (preflight) {
  run('preflight:typecheck', ['run', 'typecheck']);
  run('preflight:lint', ['run', 'lint']);
  run('preflight:format', ['run', 'format:check']);
  run('preflight:architecture', ['run', 'check:architecture']);
  run('preflight:parameter-catalog', ['run', 'check:parameter-catalog']);
}
// 1. Verifică artefactele comise: raportul derivă din măsurătoarea comisă, iar miezul portabil
//    reexecutat trebuie să coincidă cu ea. O sursă schimbată fără reîmprospătare este un eșec real.
const checked = run('gate:check', ['run', 'perf:gate', '--', '--check']);
// 2. Măsoară revizia curentă și reîmprospătează artefactele din spațiul de lucru al CI.
const measured = run('gate:measure', ['run', 'perf:gate', '--', '--measure']);

const report = JSON.parse(await readFile(reportFile, 'utf8'));
const preflightFailures = steps.filter(
  (step) => step.label.startsWith('preflight:') && step.exitCode !== 0,
);
const gateFailed =
  checked.exitCode !== 0 ||
  measured.exitCode !== 0 ||
  report.summary.structural === 'FAIL' ||
  report.summary.release === 'FAIL';
const releaseUnvalidated = requirement === 'release' && report.summary.release !== 'PASS';
const artifact = Object.freeze({
  version: '224-performance-gate-ci-job-v1',
  startedAt,
  finishedAt: new Date().toISOString(),
  requirement,
  commit: report.commit,
  verdicts: Object.freeze({
    structural: report.summary.structural,
    release: report.summary.release,
  }),
  openCriteria: report.summary.openCriteria,
  notValidated: report.notValidated,
  steps: Object.freeze(steps),
  artifacts: Object.freeze([
    relative(root, reportFile).replaceAll('\\', '/'),
    'Docs/Evidence/224-performance-gate/report.md',
    'Docs/Evidence/224-performance-gate/measurement.json',
    'Docs/Evidence/224-performance-gate/soak/report.json',
  ]),
  outcome:
    preflightFailures.length > 0 || gateFailed
      ? 'FAILED'
      : releaseUnvalidated
        ? 'BLOCKED_BY_NOT_VALIDATED'
        : 'PASSED',
  notes: Object.freeze([
    'Probele 155/156/157/158/159 sunt apelate cu --check; acest job nu le modifică.',
    'Fără GPU real, criteriul FPS rămâne NOT_VALIDATED; --require=release transformă această stare în eșec.',
  ]),
});
await mkdir(dirname(manifestFile), { recursive: true });
await writeFile(manifestFile, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(
  `CI job: ${artifact.outcome} · structural ${artifact.verdicts.structural} · release ${artifact.verdicts.release}`,
);
console.log(`Artefact: ${relative(root, manifestFile).replaceAll('\\', '/')}`);

if (measured.exitCode !== 0)
  console.error('Măsurătoarea gate-ului a eșuat; vezi ieșirea de mai sus.');
if (checked.exitCode !== 0) console.error('Verificarea de prospețime a gate-ului a eșuat.');
if (artifact.outcome !== 'PASSED') process.exitCode = 1;

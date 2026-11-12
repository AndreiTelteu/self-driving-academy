import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PBI 224 — demonstrația de regresie controlată a gate-ului.
 *
 * Rulează gate-ul de trei ori pe aceeași revizie:
 *   1. `01-baseline` — build curat; structural trebuie să fie PASS;
 *   2. `02-regression` — același build cu un modul generat de 3 300 000 B adăugat în entry;
 *      bundle-ul depășește capacitatea de 8 MiB, iar gate-ul trebuie să raporteze FAIL;
 *   3. `03-restored` — modulul generat este șters, buildul revine la bytes-ul initial și gate-ul
 *      trebuie să revină la PASS.
 *
 * Modulul generat trăiește numai în `.pbi-validation-224/` (ignorat de git) și este șters de
 * gate după fiecare rulare; în commit nu rămâne nicio urmă a regresiei, doar artefactele celor
 * trei rulări.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const demoDirectory = join(root, 'Docs', 'Evidence', '224-performance-gate', 'regression-demo');
const injectedPayloadBytes = 3_300_000;
const runs = [
  { id: '01-baseline', expect: 'PASS', injected: 0 },
  { id: '02-regression', expect: 'FAIL', injected: injectedPayloadBytes },
  { id: '03-restored', expect: 'PASS', injected: 0 },
];

function runGate(entry) {
  const out = `Docs/Evidence/224-performance-gate/regression-demo/${entry.id}`;
  const args = [
    '--import',
    './scripts/register-typescript.mjs',
    'scripts/run-performance-gate.mjs',
    '--measure',
    '--repetitions=5',
    `--out=${out}`,
  ];
  if (entry.injected > 0) args.push(`--inject-bundle-payload=${entry.injected}`);
  const started = Date.now();
  let exitCode = 0;
  try {
    execFileSync(process.execPath, args, {
      cwd: root,
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: 30 * 60 * 1000,
    });
  } catch (error) {
    exitCode = typeof error.status === 'number' ? error.status : 1;
    if (entry.expect === 'PASS') {
      console.error(String(error.stdout ?? ''));
      console.error(String(error.stderr ?? ''));
    }
  }
  return { out, exitCode, durationMs: Date.now() - started };
}

const summaries = [];
for (const entry of runs) {
  console.log(
    `DEMO ${entry.id}: build ${entry.injected === 0 ? 'curat' : `cu ${entry.injected} B injectați`}`,
  );
  const result = runGate(entry);
  const report = JSON.parse(await readFile(join(root, result.out, 'report.json'), 'utf8'));
  const bundle = report.rows.find((row) => row.id === 'bundle-critical-transfer');
  const regression = report.rows.find((row) => row.id === 'bundle-regression');
  const fails = report.rows.filter((row) => row.verdict === 'FAIL').map((row) => row.id);
  summaries.push(
    Object.freeze({
      id: entry.id,
      injectedPayloadBytes: entry.injected,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      structural: report.summary.structural,
      release: report.summary.release,
      bundleVerdict: bundle?.verdict ?? null,
      bundleDetail: bundle?.detail ?? '',
      bundleReason: bundle?.reason ?? '',
      regressionVerdict: regression?.verdict ?? null,
      failRows: fails,
      buildBytes: report.repetitions.buildBytes,
      renderDigests: report.repetitions.renderDigests,
      files: Object.freeze([
        `${relative(root, join(root, result.out, 'report.json')).replaceAll('\\', '/')}`,
        `${relative(root, join(root, result.out, 'report.md')).replaceAll('\\', '/')}`,
        `${relative(root, join(root, result.out, 'measurement.json')).replaceAll('\\', '/')}`,
      ]),
    }),
  );
  console.log(
    `DEMO ${entry.id}: structural ${report.summary.structural}, release ${report.summary.release}, bundle ${bundle?.verdict}, FAIL rows ${fails.join(', ') || '—'}`,
  );
}

const [baseline, regressed, restored] = summaries;
const detected =
  baseline.structural === 'PASS' &&
  regressed.structural === 'FAIL' &&
  regressed.failRows.includes('bundle-critical-transfer') &&
  (regressed.bundleReason ?? '').length > 0;
const recovered =
  restored.structural === 'PASS' &&
  JSON.stringify(restored.buildBytes) === JSON.stringify(baseline.buildBytes) &&
  JSON.stringify(restored.renderDigests) === JSON.stringify(baseline.renderDigests);
const summary = Object.freeze({
  version: '224-performance-gate-regression-demo-v1',
  injectedPayloadBytes,
  runs: Object.freeze(summaries),
  detected,
  recovered,
  note: 'Regresia este un modul generat de 3,3 MB adăugat în entry-ul buildului de producție; nu atinge src/ și nu rămâne în commit. Gate-ul o detectează prin capacitatea de bundle din manifest și revine la PASS după eliminare.',
});
await mkdir(demoDirectory, { recursive: true });
await writeFile(join(demoDirectory, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(
  `DEMO: detectată ${detected} · revenire ${recovered} · artefact ${relative(root, join(demoDirectory, 'summary.json')).replaceAll('\\', '/')}`,
);
if (!detected || !recovered) process.exitCode = 1;

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PBI 162 — checklist-ul executat al release-ului V1.
 *
 * O singură comandă rulează verificările de release, citește probele comise ale celorlalte PBI-uri
 * de validare și scrie un verdict agregat cu dovada per criteriu (comandă + rezultat real). Nu
 * inventează pași noi: fiecare verificare este o comandă deja livrată — aceleași preflight-uri ca
 * `ci:verify` (160), `perf:gate` (224), `qa:fun` (235), `qa:ui` (153), `qa:compat` (154) și
 * `build:report` (160). Artefactul de livrare rămâne al pipeline-ului 160; checklist-ul doar îl
 * măsoară și îl leagă de verdict.
 *
 * Regula de onestitate: un criteriu `NOT_VALIDATED` (FPS pe hardware real) sau `NOT_RUN` (playtest
 * uman, demonstrație pe hardware agreat) nu este bifat și nu este ascuns. Verdictul agregat este
 * `PASS` numai când toate criteriile sunt `PASS`; altfel este `NOT_VALIDATED`, iar lista deschisă
 * spune exact ce lipsește și cine o deține.
 *
 * Rulare implicită: execută verificările și scrie `checklist.json`, `checklist.md` și `artifact.json`
 * în `Docs/Evidence/162-release-v1/`. `--check` reexecută tot și compară cele trei fișiere byte cu
 * byte (eșuează dacă dovezile comise sunt învechite). `--strict` transformă un release care nu este
 * `PASS` în exit code 1; rularea implicită scrie dovezile și iese 0, ca probele 155–159/224/235.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDirectory = join(root, 'Docs', 'Evidence', '162-release-v1');
const checklistFile = join(evidenceDirectory, 'checklist.json');
const markdownFile = join(evidenceDirectory, 'checklist.md');
const artifactFile = join(evidenceDirectory, 'artifact.json');
const pipelineFile = join(evidenceDirectory, 'pipeline', 'ci-pipeline.json');
const gateFile = join(root, 'Docs', 'Evidence', '224-performance-gate', 'report.json');
const funFile = join(root, 'Docs', 'Evidence', '235-fun-qa', 'report.json');
const uiFile = join(root, 'Docs', 'Evidence', '153-ui-qa', 'report.json');
const compatFile = join(root, 'Docs', 'Evidence', '154-compat-matrix', 'report.json');
const deliveryFile = join(root, 'Docs', 'Evidence', '160-build-delivery', 'report.json');
const regressionFile = join(root, 'Docs', 'Evidence', '216-v1-regression', 'report.json');
const scenariosFile = join(root, 'Docs', 'Evidence', '151-scenario-suite', 'report.json');
const indexFile = join(root, 'Docs', 'README.md');

const wantsCheck = process.argv.includes('--check');
const wantsStrict = process.argv.includes('--strict');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pwsh = process.platform === 'win32' ? 'pwsh.exe' : 'pwsh';
const windows = process.platform === 'win32';

/**
 * Dependențele V1 declarate în frontmatter-ul acestui PBI, cu dovada lor principală. `document`
 * înseamnă un PBI de documentație, a cărui dovadă este README-ul cu tabelul afirmație → fișier, nu
 * un `report.json` cu verificări numerice.
 */
const dependencies = Object.freeze([
  {
    id: '161',
    title: 'Manual de utilizare și operare',
    evidence: 'Docs/Evidence/161-release-docs/README.md',
    kind: 'document',
  },
  {
    id: '154',
    title: 'Matrice de compatibilitate WebGPU/WebGL 2',
    evidence: 'Docs/Evidence/154-compat-matrix/report.json',
    kind: 'report',
  },
  {
    id: '152',
    title: 'Sesiune integrală și progres',
    evidence: 'Docs/Evidence/152-e2e-session/report.json',
    kind: 'report',
  },
  {
    id: '108',
    title: 'Gate learning 24 de parametri',
    evidence: 'Docs/Evidence/108-learning-gate24/report.json',
    kind: 'report',
  },
  {
    id: '039',
    title: 'Zone de trecere',
    evidence: 'Docs/Evidence/039-crosswalk-zones/report.md',
    kind: 'document',
  },
  {
    id: '076',
    title: 'Selecție hartă',
    evidence: 'Docs/Evidence/076-map-selection/report.json',
    kind: 'report',
  },
  {
    id: '141',
    title: 'Replay de incidente',
    evidence: 'Docs/Evidence/141-experiment-replay/report.json',
    kind: 'report',
  },
  {
    id: '216',
    title: 'Regresia V1: moduri, KPI, daily, XP',
    evidence: 'Docs/Evidence/216-v1-regression/report.json',
    kind: 'report',
  },
  {
    id: '217',
    title: 'Trei moduri de control',
    evidence: 'Docs/Evidence/217-three-modes/report.json',
    kind: 'report',
  },
  {
    id: '235',
    title: 'Gate de experiență și revenire',
    evidence: 'Docs/Evidence/235-fun-qa/report.json',
    kind: 'report',
  },
]);

/** Fișierele atinse de acest PBI ale căror linkuri locale trebuie să se rezolve. */
const linkedFiles = [
  'Docs/18-validare-si-release.md',
  'Docs/manual/README.md',
  'Docs/manual/01-pornire-si-control.md',
  'Docs/manual/02-moduri-si-invatare.md',
  'Docs/manual/03-academie-haos-recuperare.md',
  'Docs/manual/04-kpi-si-economie.md',
  'Docs/manual/05-misiuni-xp-si-provocari.md',
  'Docs/manual/06-slidere-si-camera.md',
  'Docs/manual/07-salvare-si-recuperare.md',
  'Docs/Evidence/162-release-v1/README.md',
];
// Fișierul PBI există într-o singură coloană; verificăm ruta reală, ca raportul să fie același
// înainte și după mutarea fizică în Done.
for (const candidate of ['PBI/Done/162-release_v1.md', 'PBI/In Progress/162-release_v1.md'])
  if (existsSync(join(root, candidate))) linkedFiles.push(candidate);
/** Fișierele generate de această comandă; nu pot exista înainte de prima rulare. */
const generatedEvidence = new Set(['checklist.json', 'checklist.md', 'artifact.json']);

const steps = [];

function relativeToRoot(file) {
  return relative(root, file).replaceAll('\\', '/');
}

function spaced(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function mib(bytes) {
  return (bytes / 1048576).toFixed(2);
}

function percent(ratio) {
  return `${(ratio * 100).toFixed(2)} %`;
}

function oneLine(text) {
  return String(text ?? '')
    .replaceAll('\r', ' ')
    .replaceAll('\n', ' ')
    .replaceAll('|', '\\|')
    .trim();
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function readJsonOrNull(file) {
  try {
    return await readJson(file);
  } catch {
    return null;
  }
}

function parseJsonOrNull(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Rulează o comandă și consemnează doar codul de ieșire: duratele și timpii de perete nu intră în
 * raport, ca `--check` să poată compara byte cu byte două rulări.
 */
function run(label, command, args, options = {}) {
  const started = Date.now();
  let exitCode = 0;
  let output;
  try {
    output = execFileSync(command, args, {
      cwd: root,
      encoding: 'utf8',
      timeout: 60 * 60 * 1000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: 'pipe',
      shell: options.shell ?? false,
    });
  } catch (error) {
    exitCode = typeof error.status === 'number' ? error.status : 1;
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  const step = Object.freeze({
    label,
    command: options.display ?? [command, ...args].join(' '),
    exitCode,
    status: exitCode === 0 ? 'PASS' : 'FAIL',
  });
  steps.push(step);
  console.log(`${step.status.padEnd(4)} ${label} exit ${exitCode} (${seconds} s)`);
  return { step, output };
}

function npmStep(label, args) {
  return run(label, npm, args, {
    shell: windows,
    display: `npm ${args.join(' ')}`,
  });
}

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

function testSummaryOf(output) {
  // Node tipărește sumarul în format TAP (`# tests 12`) sau spec (`ℹ tests 12`), în funcție de
  // reporter; ambele sunt citite, ca raportul să nu depindă de un singur format de consolă.
  const value = (name) => {
    const found = output.match(new RegExp(`^(?:#|\\u2139)\\s*${name}\\s+(\\d+)$`, 'm'));
    return found === null ? null : Number(found[1]);
  };
  return {
    tests: value('tests'),
    pass: value('pass'),
    fail: value('fail'),
    skipped: value('skipped'),
    todo: value('todo'),
  };
}

/**
 * Rezumă un `report.json` de modul fără să inventeze câmpuri: fiecare PBI și-a definit propriul
 * sumar, iar aici citim doar cheile care există.
 */
function summarizeReport(report) {
  const summary = report?.summary ?? {};
  if (typeof summary.criteria === 'number')
    return {
      pass: (summary.fail ?? 0) === 0,
      detail: `${summary.criteria} criterii: ${summary.pass ?? 0} PASS, ${summary.fail ?? 0} FAIL, ${summary.notRun ?? 0} NOT_RUN; ${summary.probes ?? 0} sonde`,
    };
  if (typeof summary.steps === 'number' && typeof summary.checks === 'number')
    return {
      pass: (summary.fail ?? 0) === 0,
      detail: `${summary.steps} pași, ${summary.checks} verificări, ${summary.fail ?? 0} eșuate`,
    };
  if (typeof summary.rows === 'number' && typeof summary.pass === 'number')
    return {
      pass: (summary.fail ?? 0) === 0,
      detail: `${summary.rows} rânduri: ${summary.pass} PASS, ${summary.fail ?? 0} FAIL, ${summary.notRun ?? 0} NOT_RUN${summary.declaredNotRun === undefined ? '' : `, ${summary.declaredNotRun} declarate NOT_RUN`}`,
    };
  if (typeof summary.scenarios === 'number' && typeof summary.passed === 'number')
    return {
      pass: summary.pass === true && (summary.fail ?? 0) === 0,
      detail: `${summary.scenarios} scenarii, ${summary.passed} trecute, ${summary.fail ?? 0} eșuate, ${summary.notRun ?? 0} NOT_RUN`,
    };
  if (typeof summary.checks === 'number' && typeof summary.passed === 'number')
    return {
      pass: summary.pass === true,
      detail: `${summary.passed}/${summary.checks} verificări`,
    };
  if (typeof summary.pass === 'boolean')
    return { pass: summary.pass, detail: 'raport comis, fără sumar numeric' };
  return { pass: null, detail: 'raport comis fără sumar recunoscut' };
}

// ---------------------------------------------------------------------------------------------
// 1. Verificările executate pe această revizie.
// ---------------------------------------------------------------------------------------------

const typecheck = npmStep('typecheck', ['run', 'typecheck']);
const lint = npmStep('lint', ['run', 'lint']);
const format = npmStep('format', ['run', 'format:check']);
const architecture = npmStep('architecture', ['run', 'check:architecture']);
const catalog = npmStep('parameter-catalog', ['run', 'check:parameter-catalog']);
// Sumarul suitei este citit din formatul TAP/spec al Node; testele rulate sunt exact cele din `npm test`.
const tests = npmStep('tests', ['test']);
const boardRun = run(
  'board',
  pwsh,
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'PBI/Validate-Board.ps1'],
  { display: 'pwsh -NoProfile -ExecutionPolicy Bypass -File PBI/Validate-Board.ps1' },
);
const assets = npmStep('assets:manifest', ['run', 'assets:manifest', '--', '--check']);
const gate = npmStep('perf:gate', ['run', 'perf:gate', '--', '--check']);
const fun = npmStep('qa:fun', ['run', 'qa:fun', '--', '--check']);
const ui = npmStep('qa:ui', ['run', 'qa:ui', '--', '--check']);
const compat = npmStep('qa:compat', ['run', 'qa:compat', '--', '--check']);
// `build:report` construiește de două ori artefactul de producție (în `dist/` și într-o copie
// temporară) și compară raportul comis; nu rescrie pipeline-ul 160, îl folosește.
const delivery = npmStep('build:report', ['run', 'build:report', '--', '--check']);

const testSummary = testSummaryOf(tests.output);
const boardText = stripAnsi(boardRun.output);
const board = parseJsonOrNull(boardText);
const boardValid = board !== null && board.Valid === true;
// Fișierul PBI trebuie să existe într-o singură coloană, indiferent dacă rularea se face înainte sau
// după mutarea fizică în Done.
const pbi162ColumnCount = ['To Do', 'In Progress', 'Done'].filter((column) =>
  existsSync(join(root, 'PBI', column, '162-release_v1.md')),
).length;

const gateReport = await readJsonOrNull(gateFile);
const funReport = await readJsonOrNull(funFile);
const uiReport = await readJsonOrNull(uiFile);
const compatReport = await readJsonOrNull(compatFile);
const deliveryReport = await readJsonOrNull(deliveryFile);
const regressionReport = await readJsonOrNull(regressionFile);
const scenariosReport = await readJsonOrNull(scenariosFile);
const pipeline = await readJsonOrNull(pipelineFile);

// ---------------------------------------------------------------------------------------------
// 2. Dependențele V1: fișier în Done + dovezi comise, fără placeholder.
// ---------------------------------------------------------------------------------------------

const doneFiles = await readdir(join(root, 'PBI', 'Done')).catch(() => []);
const dependencyRows = [];
for (const dependency of dependencies) {
  const doneName = doneFiles.find((name) => name.startsWith(`${dependency.id}-`)) ?? null;
  const absolute = join(root, dependency.evidence);
  const present = existsSync(absolute);
  let placeholder = false;
  let summary = { pass: null, detail: 'dovada lipsește' };
  if (present) {
    const text = await readFile(absolute, 'utf8').catch(() => '');
    placeholder = /De completat/.test(text);
    if (dependency.kind === 'report') {
      const report = parseJsonOrNull(text);
      summary =
        report === null ? { pass: null, detail: 'raport JSON ilizibil' } : summarizeReport(report);
    } else summary = { pass: true, detail: 'dovadă de documentație (README/report)' };
  }
  // Verdictul rândului spune că dependența este livrată și are dovezi comise, nu că fiecare criteriu
  // al ei este PASS: verdictele de gate sunt rânduri separate (`gate-224`, `gate-235`, `qa-ui-153`).
  const verdict = doneName !== null && present && !placeholder ? 'PASS' : 'FAIL';
  dependencyRows.push(
    Object.freeze({
      id: dependency.id,
      title: dependency.title,
      done: doneName !== null,
      file: doneName === null ? null : `PBI/Done/${doneName}`,
      evidence: dependency.evidence,
      evidencePresent: present,
      placeholder,
      verdict,
      detail: summary.detail,
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// 3. Coerența documentației de release: linkuri locale din fișierele atinse.
// ---------------------------------------------------------------------------------------------

const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
const linkCheck = { files: 0, links: 0, broken: [], missingFiles: [] };
for (const relativePath of linkedFiles) {
  const absolute = join(root, relativePath);
  if (!existsSync(absolute)) {
    linkCheck.missingFiles.push(relativePath);
    continue;
  }
  linkCheck.files += 1;
  const text = await readFile(absolute, 'utf8');
  for (const match of text.matchAll(linkPattern)) {
    const target = match[1].trim();
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const path = target.split('#')[0].split('?')[0];
    if (path.length === 0) continue;
    linkCheck.links += 1;
    const resolved = resolve(dirname(absolute), decodeURIComponent(path));
    // Cele trei fișiere sunt scrise de aceeași comandă, imediat după verificare.
    if (
      generatedEvidence.has(resolved.split(/[\\/]/).at(-1)) &&
      dirname(resolved) === evidenceDirectory
    )
      continue;
    if (!existsSync(resolved)) linkCheck.broken.push(`${relativePath} → ${target}`);
  }
}
const indexText = await readFile(indexFile, 'utf8').catch(() => '');
const indexHasRelease = indexText.includes('18-validare-si-release.md');
const indexHasManual = indexText.includes('manual/README.md');
const docsVerdict =
  linkCheck.missingFiles.length === 0 &&
  linkCheck.broken.length === 0 &&
  indexHasRelease &&
  indexHasManual
    ? 'PASS'
    : 'FAIL';

// ---------------------------------------------------------------------------------------------
// 4. Criteriile de release, cu dovada fiecăruia.
// ---------------------------------------------------------------------------------------------

const criteria = [];
function criterion(entry) {
  criteria.push(Object.freeze(entry));
}

const allStepsOk = [typecheck, lint, format, architecture, catalog, assets].every(
  (entry) => entry.step.exitCode === 0,
);
const testsOk = tests.step.exitCode === 0 && testSummary.fail === 0 && testSummary.tests !== null;

const pipelineSteps = pipeline?.steps ?? [];
const pipelineFailedSteps = pipelineSteps.filter(
  (step) => step.label !== 'plan:validate' && step.exitCode !== 0,
);
const pipelineOk =
  pipeline !== null &&
  ['verify', 'release'].includes(pipeline.lane) &&
  ['PASSED', 'PASSED_STRUCTURAL', 'PASSED_WITH_PLAN_DEBT', 'BLOCKED_BY_NOT_VALIDATED'].includes(
    pipeline.outcome,
  ) &&
  pipelineFailedSteps.length === 0 &&
  ['STATIC_VERIFIED', 'RELEASE_READY'].includes(pipeline.delivery?.state);

const gateRows = gateReport?.rows ?? [];
const gateSummary = gateReport?.summary ?? {};
const hardRows = gateRows.filter((row) => row.verdict === 'NOT_VALIDATED');
const gatePass = gateSummary.structural === 'PASS' && gateSummary.fail === 0;
const gateVerdict =
  gate.step.exitCode !== 0 || !gatePass
    ? 'FAIL'
    : gateSummary.release === 'PASS'
      ? 'PASS'
      : 'NOT_VALIDATED';

const funCriteria = funReport?.criteria ?? [];
const funSummary = funReport?.summary ?? {};
const funFailed = funCriteria.filter((entry) => entry.verdict === 'FAIL');
const funNotRun = funCriteria.filter((entry) => entry.verdict === 'NOT_RUN');
const funVerdict =
  fun.step.exitCode !== 0 || funReport === null
    ? 'FAIL'
    : funFailed.length > 0
      ? 'FAIL'
      : funNotRun.length > 0
        ? 'NOT_RUN'
        : 'PASS';

const uiSummary = uiReport?.summary ?? {};
const uiVerdict =
  ui.step.exitCode !== 0 || uiReport === null ? 'FAIL' : (uiSummary.verdict ?? 'FAIL');

const compatSummary = compatReport?.summary ?? {};
const compatVerdict =
  compat.step.exitCode !== 0 ||
  compatReport === null ||
  compatSummary.fail !== 0 ||
  compatSummary.pass !== compatSummary.rows
    ? 'FAIL'
    : 'PASS';

const deliveryTotals = deliveryReport?.totals ?? {};
const deliveryChecks = deliveryReport?.summary ?? {};
const artifactDigest = deliveryReport?.build?.digest ?? null;
const indexHtml = (deliveryReport?.artifacts ?? []).find((entry) => entry.path === 'index.html');
const gateBundleRow = gateRows.find((row) => row.id === 'bundle-critical-transfer');
const gateBundleBytes = Number((gateBundleRow?.detail.match(/\b(\d{6,})\b/) ?? [])[1] ?? NaN);
const bundleMatches = Number.isFinite(gateBundleBytes)
  ? gateBundleBytes === deliveryTotals.criticalJsWasmBytes
  : false;
const deliveryVerdict =
  delivery.step.exitCode !== 0 ||
  deliveryReport === null ||
  deliveryChecks.pass !== true ||
  deliveryChecks.passed !== deliveryChecks.checks ||
  bundleMatches === false
    ? 'FAIL'
    : 'PASS';

criterion({
  id: 'dependencies',
  title: 'Toate dependențele V1 sunt în Done și au dovezi comise, fără placeholder',
  verdict: dependencyRows.every((row) => row.verdict === 'PASS') ? 'PASS' : 'FAIL',
  command: 'citire PBI/Done + Docs/Evidence (fără execuție)',
  evidence: 'PBI/Done/, Docs/Evidence/161,154,152,108,039,076,141,216,217,235',
  result: `${dependencyRows.filter((row) => row.verdict === 'PASS').length}/${dependencyRows.length} dependențe cu fișier în Done și dovezi fără placeholder`,
});
criterion({
  id: 'preflight',
  title: 'Verificările statice obligatorii trec pe revizia curentă',
  verdict: allStepsOk ? 'PASS' : 'FAIL',
  command:
    'npm run typecheck / lint / format:check / check:architecture / check:parameter-catalog / assets:manifest -- --check',
  evidence: 'ieșirea comenzilor, exit code per pas',
  result: `${[typecheck, lint, format, architecture, catalog, assets].filter((entry) => entry.step.exitCode === 0).length}/6 pași cu exit 0`,
});
criterion({
  id: 'tests',
  title: 'Suita completă de teste trece fără eșecuri',
  verdict: testsOk ? 'PASS' : 'FAIL',
  command: 'npm test',
  evidence: 'ieșirea TAP a suitei complete',
  result:
    testSummary.tests === null
      ? 'numerele TAP nu au putut fi citite'
      : `${spaced(testSummary.tests)} teste, ${spaced(testSummary.pass)} trecute, ${testSummary.fail} eșuate, ${testSummary.skipped} sărite`,
});
criterion({
  id: 'board',
  title: 'Boardul PBI este valid și 162 apare într-o singură coloană',
  verdict: boardValid && pbi162ColumnCount === 1 ? 'PASS' : 'FAIL',
  command: 'pwsh ./PBI/Validate-Board.ps1',
  evidence: 'ieșirea JSON a validatorului',
  result:
    board === null
      ? 'validatorul nu a produs JSON valid'
      : `Valid ${board.Valid}, Total ${board.Total}, 162 în ${pbi162ColumnCount} coloană`,
});
criterion({
  id: 'pipeline-160',
  title: 'Pipeline-ul CI 160 a rulat pe această revizie, cu livrare statică verificată',
  verdict: pipelineOk ? 'PASS' : 'FAIL',
  command: 'npm run ci:verify',
  evidence: relativeToRoot(pipelineFile),
  result:
    pipeline === null
      ? 'artefactul pipeline lipsește; rulează `npm run ci:verify -- --out=Docs/Evidence/162-release-v1/pipeline`'
      : `banda ${pipeline.lane}: ${pipeline.outcome}, ${pipelineSteps.length} pași (${pipelineFailedSteps.length} eșuate), gate structural ${pipeline.gate?.structural}, livrare ${pipeline.delivery?.state}`,
});
criterion({
  id: 'gate-224',
  title: 'Gate-ul de performanță și soak 224 trece structural, fără să ascundă FPS-ul',
  verdict: gateVerdict,
  command: 'npm run perf:gate -- --check',
  evidence: 'Docs/Evidence/224-performance-gate/report.json',
  result:
    gateReport === null
      ? 'raportul 224 lipsește'
      : `${gateRows.length} rânduri: ${gateSummary.pass} PASS, ${gateSummary.fail} FAIL, ${gateSummary.notValidated} NOT_VALIDATED (${hardRows.map((row) => row.id).join(', ') || 'niciunul'}); structural ${gateSummary.structural}, release ${gateSummary.release}`,
});
criterion({
  id: 'gate-235',
  title: 'Gate-ul de experiență și revenire 235 are verdict executat pe toate criteriile',
  verdict: funVerdict,
  command: 'npm run qa:fun -- --check',
  evidence: 'Docs/Evidence/235-fun-qa/report.json',
  result:
    funReport === null
      ? 'raportul 235 lipsește'
      : `${funSummary.criteria} criterii: ${funSummary.pass} PASS, ${funSummary.fail} FAIL (${funFailed.map((entry) => entry.id).join(', ') || 'niciunul'}), ${funSummary.notRun} NOT_RUN (${funNotRun.map((entry) => entry.id).join(', ') || 'niciunul'}); ${funSummary.probes} sonde: ${funSummary.probePass} PASS, ${funSummary.probeFail} FAIL; playtest ${funReport.playtest?.status ?? 'necunoscut'} ${funReport.playtest?.participants ?? 0}/${funReport.playtest?.requiredParticipants ?? 0}`,
});
criterion({
  id: 'qa-ui-153',
  title: 'QA vizual și accesibilitate 153 nu are eșecuri de contract',
  verdict: uiVerdict,
  command: 'npm run qa:ui -- --check',
  evidence: 'Docs/Evidence/153-ui-qa/report.json',
  result:
    uiReport === null
      ? 'raportul 153 lipsește'
      : `${uiSummary.captures} capturi, ${spaced(uiSummary.checks)} verificări, ${spaced(uiSummary.passed)} trecute, ${uiSummary.failed} eșuate (${uiSummary.contractFailed} de contract), ${uiSummary.findings} findings`,
});
criterion({
  id: 'compat-154',
  title: 'Matricea de compatibilitate 154 acoperă WebGPU și WebGL 2 și declară ce nu a rulat',
  verdict: compatVerdict,
  command: 'npm run qa:compat -- --check',
  evidence: 'Docs/Evidence/154-compat-matrix/report.json',
  result:
    compatReport === null
      ? 'raportul 154 lipsește'
      : `${compatSummary.pass}/${compatSummary.rows} combinații reale, ${compatSummary.deterministicPass}/${compatSummary.deterministicChecks} verificări deterministe, ${compatSummary.declaredNotRun} combinații declarate NOT_RUN`,
});
criterion({
  id: 'delivery-160',
  title:
    'Artefactul de livrare (build de producție + manifest) este reproductibil și servit static',
  verdict: deliveryVerdict,
  command: 'npm run build:report -- --check',
  evidence: 'Docs/Evidence/160-build-delivery/report.json',
  result:
    deliveryReport === null
      ? 'raportul 160 lipsește'
      : `${deliveryTotals.artifacts} artefacte, ${spaced(deliveryTotals.bytes)} B (${mib(deliveryTotals.bytes)} MiB), JS+WASM ${spaced(deliveryTotals.criticalJsWasmBytes)} B = ${percent(deliveryTotals.criticalJsWasmBytes / (deliveryReport.budget?.criticalJsWasmTransferBytes ?? 1))} din capacitate, gzip ${spaced(deliveryTotals.gzipBytes)} B, arbore SHA-256 ${artifactDigest}, ${deliveryReport.delivery?.requests} cereri HTTP, ${deliveryReport.delivery?.checkedPayloads} payloaduri verificate`,
});
criterion({
  id: 'docs',
  title: 'Documentația de release este coerentă, iar linkurile din fișierele atinse se rezolvă',
  verdict: docsVerdict,
  command: 'citire Docs/18 + Docs/manual + Docs/README.md + verificare de linkuri',
  evidence: 'Docs/18-validare-si-release.md, Docs/manual/, Docs/README.md',
  result: `${linkCheck.files} fișiere, ${linkCheck.links} linkuri locale, ${linkCheck.broken.length} rupte; index: 18 ${indexHasRelease ? 'prezent' : 'absent'}, manual ${indexHasManual ? 'prezent' : 'absent'}`,
});
criterion({
  id: 'hardware-demo',
  title: 'Demonstrație completă pe hardware-ul agreat (GPU real, OS/browser de referință)',
  verdict: 'NOT_RUN',
  command: 'demonstrație manuală pe hardware agreat',
  evidence:
    'Docs/Evidence/154-compat-matrix, 224-performance-gate (fps-hardware), 155-hardware-budget',
  result:
    '0 rulări pe hardware agreat; pe această mașină au rulat doar probe Node și Chromium headless pe SwiftShader',
  reason:
    'Demo-ul cerut are nevoie de GPU real și de cealaltă combinație OS/browser; pagina de joc completă nu există încă (bootstrap de randare), iar FPS-ul rămâne NOT_VALIDATED la 224.',
});
criterion({
  id: 'human-playtest',
  title: 'Playtest uman cu minimum cinci participanți și sesiune de revenire',
  verdict: 'NOT_RUN',
  command: 'sesiune de playtest cu observator',
  evidence: 'Docs/Evidence/235-fun-qa/report.json (playtest)',
  result:
    funReport === null
      ? 'raportul 235 lipsește'
      : `${funReport.playtest?.participants ?? 0}/${funReport.playtest?.requiredParticipants ?? 0} participanți; retenție 24 h / 7 zile nemăsurată`,
  reason:
    'Niciun playtest uman nu a fost executat; mecanismele sunt acoperite de probe deterministe, dar senzația de condus și revenirea nu sunt măsurate.',
});

// ---------------------------------------------------------------------------------------------
// 5. Lista deschisă: fiecare NOT_VALIDATED / NOT_RUN / FAIL, cu sursa și motivul real.
// ---------------------------------------------------------------------------------------------

const open = [];
for (const row of hardRows)
  open.push({
    source: '224',
    id: row.id,
    verdict: row.verdict,
    reason: row.reason ?? 'fără motiv consemnat',
  });
for (const entry of [...funFailed, ...funNotRun])
  open.push({
    source: '235',
    id: entry.id,
    verdict: entry.verdict,
    reason: entry.title ?? 'criteriu fără titlu',
  });
if (funReport !== null && funReport.playtest !== undefined && funReport.playtest.status !== 'PASS')
  open.push({
    source: '235',
    id: 'playtest',
    verdict: 'NOT_RUN',
    reason: `${funReport.playtest.participants}/${funReport.playtest.requiredParticipants} participanți; ${funReport.playtest.flows?.length ?? 0} fluxuri neacoperite de oameni`,
  });
for (const finding of uiReport?.findings ?? [])
  open.push({
    source: '153',
    id: finding.id,
    verdict: 'FAIL',
    reason: `${finding.severity} ${finding.check} (${finding.surface}@${finding.viewport}): ${finding.summary ?? ''}`,
  });
for (const declared of compatReport?.declared ?? [])
  if (declared.status !== 'PASS')
    open.push({
      source: '154',
      id: declared.id,
      verdict: declared.status ?? 'NOT_RUN',
      reason: declared.reason ?? 'fără motiv consemnat',
    });
for (const row of regressionReport?.rows ?? [])
  if (row.verdict === 'NOT_RUN')
    open.push({
      source: '216',
      id: row.id,
      verdict: 'NOT_RUN',
      reason: row.notRunReason ?? row.note ?? 'fără motiv consemnat',
    });
for (const scenario of scenariosReport?.scenarios ?? [])
  if (scenario.verdict === 'NOT_RUN')
    open.push({
      source: '151',
      id: scenario.id,
      verdict: 'NOT_RUN',
      reason: scenario.reason ?? scenario.title ?? 'fără motiv consemnat',
    });
open.sort((left, right) =>
  left.source === right.source
    ? left.id.localeCompare(right.id)
    : left.source.localeCompare(right.source),
);

// ---------------------------------------------------------------------------------------------
// 6. Artefactul de livrare, derivat din manifestul 160.
// ---------------------------------------------------------------------------------------------

const artifact =
  deliveryReport === null
    ? null
    : Object.freeze({
        version: '162-release-artifact-v1',
        source: 'Docs/Evidence/160-build-delivery/report.json',
        producedBy: 'npm run build:report -- --check (pipeline-ul 160, nescris aici)',
        artifactCount: deliveryTotals.artifacts,
        bytes: deliveryTotals.bytes,
        gzipBytes: deliveryTotals.gzipBytes,
        criticalJsWasmBytes: deliveryTotals.criticalJsWasmBytes,
        capacityBytes: deliveryReport.budget?.criticalJsWasmTransferBytes ?? null,
        capacityRatio: deliveryReport.budget?.ratio ?? null,
        javascriptBytes: deliveryTotals.javascriptBytes,
        wasmBytes: deliveryTotals.wasmBytes,
        cssBytes: deliveryTotals.cssBytes,
        htmlBytes: deliveryTotals.htmlBytes,
        treeDigest: artifactDigest,
        reproducible: deliveryReport.build?.reproducible === true,
        indexHtmlSha256: indexHtml?.sha256 ?? null,
        http: {
          requests: deliveryReport.delivery?.requests ?? null,
          checkedPayloads: deliveryReport.delivery?.checkedPayloads ?? null,
          failedPayloads: deliveryReport.delivery?.failedPayloads?.length ?? null,
          pass: deliveryReport.delivery?.pass === true,
        },
        fullManifest: 'Docs/Evidence/160-build-delivery/report.json',
        verifiedByChecklist: deliveryVerdict === 'PASS',
      });

// ---------------------------------------------------------------------------------------------
// 7. Verdictul agregat. `PASS` cere toate criteriile `PASS`; orice altceva este `NOT_VALIDATED`.
// ---------------------------------------------------------------------------------------------

const counts = {
  pass: criteria.filter((entry) => entry.verdict === 'PASS').length,
  fail: criteria.filter((entry) => entry.verdict === 'FAIL').length,
  notValidated: criteria.filter((entry) => entry.verdict === 'NOT_VALIDATED').length,
  notRun: criteria.filter((entry) => entry.verdict === 'NOT_RUN').length,
};
const failedSteps = steps.filter((step) => step.exitCode !== 0).length;
const release =
  counts.fail === 0 && counts.notValidated === 0 && counts.notRun === 0 && failedSteps === 0
    ? 'PASS'
    : 'NOT_VALIDATED';

const checklist = Object.freeze({
  version: '162-release-checklist-v1',
  command: 'npm run release:checklist',
  generatedBy: 'scripts/run-release-checklist.mjs',
  checks: Object.freeze(steps),
  dependencies: Object.freeze(dependencyRows),
  criteria: Object.freeze(criteria),
  open: Object.freeze(open),
  artifact,
  summary: Object.freeze({
    criteria: criteria.length,
    ...counts,
    release,
    ready: release === 'PASS',
    failed: counts.fail > 0,
    steps: steps.length,
    failedSteps,
    openItems: open.length,
    note:
      release === 'PASS'
        ? 'Toate criteriile au dovadă de trecere executată.'
        : 'Release-ul V1 nu se declară gata: lista `open` conține exact ce este FAIL, NOT_VALIDATED sau NOT_RUN.',
  }),
});

const checklistJson = `${JSON.stringify(checklist, null, 2)}\n`;
const artifactJson = `${JSON.stringify(artifact, null, 2)}\n`;

// ---------------------------------------------------------------------------------------------
// 8. Markdown-ul, generat din aceleași date (fără text paralel scris de mână).
// ---------------------------------------------------------------------------------------------

function markdown() {
  const lines = [];
  lines.push('# Checklist-ul executat al release-ului V1 (PBI 162)');
  lines.push('');
  lines.push(
    `Comandă: \`${checklist.command}\` (${checklist.checks.length} verificări, ${failedSteps} eșuate). ` +
      `Verdict agregat: **${release}**.`,
  );
  lines.push('');
  if (release !== 'PASS')
    lines.push(
      `Release-ul **nu** se declară gata: ${counts.fail} criterii FAIL, ${counts.notValidated} NOT_VALIDATED, ${counts.notRun} NOT_RUN. ` +
        'Lista deschisă de mai jos este exhaustivă și nu conține estimări.',
    );
  lines.push('');
  lines.push('## Criterii');
  lines.push('');
  lines.push('| # | Criteriu | Verdict | Comandă | Rezultat real |');
  lines.push('| --- | --- | --- | --- | --- |');
  criteria.forEach((entry, position) => {
    lines.push(
      `| ${position + 1} | ${oneLine(entry.title)} | \`${entry.verdict}\` | \`${oneLine(entry.command)}\` | ${oneLine(entry.result)} |`,
    );
  });
  lines.push('');
  lines.push('## Verificări executate');
  lines.push('');
  lines.push('| Pas | Comandă | Exit | Status |');
  lines.push('| --- | --- | --- | --- |');
  for (const step of checklist.checks)
    lines.push(
      `| ${step.label} | \`${oneLine(step.command)}\` | ${step.exitCode} | \`${step.status}\` |`,
    );
  lines.push('');
  lines.push('## Dependențe V1');
  lines.push('');
  lines.push('| PBI | Titlu | În Done | Dovezi | Verdict | Detaliu |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of dependencyRows)
    lines.push(
      `| ${row.id} | ${oneLine(row.title)} | ${row.done ? 'da' : 'nu'} | \`${row.evidence}\` | \`${row.verdict}\` | ${oneLine(row.detail)} |`,
    );
  lines.push('');
  lines.push('## Artefactul de livrare');
  lines.push('');
  if (artifact === null) lines.push('Manifestul 160 lipsește; nu există artefact de livrare.');
  else {
    lines.push(
      `- ${artifact.artifactCount} artefacte, ${spaced(artifact.bytes)} B (${mib(artifact.bytes)} MiB), gzip ${spaced(artifact.gzipBytes)} B.`,
    );
    lines.push(
      `- JS+WASM: ${spaced(artifact.criticalJsWasmBytes)} B = ${percent(artifact.capacityRatio ?? 0)} din ${spaced(artifact.capacityBytes ?? 0)} B.`,
    );
    lines.push(
      `- Arbore SHA-256 \`${artifact.treeDigest}\`, reproductibil: ${artifact.reproducible ? 'da' : 'nu'}; \`index.html\` SHA-256 \`${artifact.indexHtmlSha256}\`.`,
    );
    lines.push(
      `- Livrare statică: ${artifact.http.requests} cereri HTTP, ${artifact.http.checkedPayloads} payloaduri verificate, ${artifact.http.failedPayloads} eșuate.`,
    );
    lines.push(
      `- Manifestul complet: [report.json al 160](../160-build-delivery/report.json); sinteza: [artifact.json](artifact.json).`,
    );
  }
  lines.push('');
  lines.push('## Ce rămâne deschis');
  lines.push('');
  lines.push('| Sursă | ID | Verdict | Motiv |');
  lines.push('| --- | --- | --- | --- |');
  for (const entry of open)
    lines.push(
      `| ${entry.source} | ${oneLine(entry.id)} | \`${entry.verdict}\` | ${oneLine(entry.reason)} |`,
    );
  lines.push('');
  lines.push('## Cum se închide');
  lines.push('');
  lines.push(
    '1. FPS, frame p95/p99 și lucrul GPU pe hardware real, pe aceeași revizie și pe ambele backenduri (gate 224).',
  );
  lines.push(
    '2. Repararea defectelor de text din 153 (C3 al gate-ului 235), într-un PBI care deține `src/ui`.',
  );
  lines.push(
    '3. Playtest uman cu minimum cinci participanți și o sesiune de revenire la 24 h / 7 zile (235).',
  );
  lines.push(
    '4. Demonstrația pe hardware-ul agreat, cu GPU real și cealaltă combinație OS/browser (matricea 154).',
  );
  lines.push('');
  return `${lines.join('\n')}\n`;
}

const markdownText = markdown();

for (const entry of criteria)
  console.log(`${entry.verdict.padEnd(13)} ${entry.id.padEnd(14)} ${entry.result}`);
console.log(
  `RELEASE ${release} · criterii ${criteria.length}: ${counts.pass} PASS, ${counts.fail} FAIL, ${counts.notValidated} NOT_VALIDATED, ${counts.notRun} NOT_RUN · pași ${steps.length}, eșuați ${failedSteps} · deschise ${open.length}`,
);

async function compare(file, expected, label) {
  const saved = await readFile(file, 'utf8').catch(() => null);
  if (saved !== expected) {
    console.error(`${label} este învechit: ${relativeToRoot(file)}`);
    process.exitCode = 1;
  } else console.log(`${label} este curent: ${relativeToRoot(file)}`);
}

if (wantsCheck) {
  await compare(checklistFile, checklistJson, 'Checklist');
  await compare(markdownFile, markdownText, 'Checklist markdown');
  await compare(artifactFile, artifactJson, 'Artefact');
} else {
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(checklistFile, checklistJson);
  await writeFile(markdownFile, markdownText);
  await writeFile(artifactFile, artifactJson);
  console.log(`Scris ${relativeToRoot(checklistFile)}`);
  console.log(`Scris ${relativeToRoot(markdownFile)}`);
  console.log(`Scris ${relativeToRoot(artifactFile)}`);
}

if (wantsStrict && release !== 'PASS') process.exitCode = 1;

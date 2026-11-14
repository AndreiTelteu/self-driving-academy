import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PBI 189 — regresiile de compatibilitate și performanță V2.
 *
 * `npm run qa:v2-regression` reexecută efectiv comenzile de validare ale reviziei curente și scrie
 * `report.json` + `report.md` cu verdict pe fiecare criteriu al PBI-ului. Tabelul are coloanele
 * criteriu → comandă → exit code → verdict → cifră/dovadă, iar workload-ul V2 are o versiune
 * proprie (`189-workload-v2-1`).
 *
 * Reguli:
 * - Un verdict nu se declară fără execuție: fiecare rând de comandă are exit code-ul real.
 * - `NOT_RUN` este explicit, cu motiv; el lasă gate-ul deschis și nu este raportat ca `PASS`.
 * - Bugetele se citesc din `Docs/performance-budgets.json` și nu se rescriu; raportul dovedește
 *   nemodificarea baseline-ului prin SHA-256 față de `HEAD`.
 * - `perf:gate` este reexecutat cu `--measure --out` în dovezile acestui PBI, ca să nu atingă
 *   măsurătoarea comisă a lui 224. În `--check` măsurătoarea merge într-un director temporar.
 * - `--check` regenerează raportul și îl compară byte cu byte cu fișierele comise; `--strict`
 *   transformă orice criteriu care nu este `PASS` în exit code 1.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = join(root, 'Docs', 'Evidence', '189-v2-regression');
const reportJson = join(evidence, 'report.json');
const reportMarkdown = join(evidence, 'report.md');
const gateEvidence = join(evidence, 'gate-measure');
const gateTemporary = join(root, '.pbi-validation-189', 'gate-check');
const manifestFile = join(root, 'Docs', 'performance-budgets.json');
const workloadVersion = '189-workload-v2-1';
const wantsCheck = process.argv.includes('--check');
const wantsStrict = process.argv.includes('--strict');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const evidenceFiles = Object.freeze({
  v1: 'Docs/Evidence/216-v1-regression/report.json',
  compat: 'Docs/Evidence/154-compat-matrix/report.json',
  hardware: 'Docs/Evidence/155-hardware-budget/report.json',
  traffic: 'Docs/Evidence/156-traffic-benchmark/report.json',
  render: 'Docs/Evidence/157-render-budget/report.json',
  simulation: 'Docs/Evidence/158-simulation-budget/report.json',
  soak: 'Docs/Evidence/159-soak/report.json',
  parameters: 'Docs/Evidence/187-v2-parameter-gate/report.json',
  challenges: 'Docs/Evidence/188-v2-challenges/report.json',
  pedestrians: 'Docs/Evidence/164-pedestrians/report.json',
  hazards: 'Docs/Evidence/165-hazards/report.json',
  gate: 'Docs/Evidence/224-performance-gate/report.json',
});

const commandSpecs = Object.freeze([
  Object.freeze({
    id: 'v1',
    label: 'npm run qa:v1-regression -- --check',
    script: 'qa:v1-regression',
    args: ['--check'],
  }),
  Object.freeze({
    id: 'compat',
    label: 'npm run qa:compat -- --check',
    script: 'qa:compat',
    args: ['--check'],
  }),
  Object.freeze({
    id: 'simulation',
    label: 'npm run perf:simulation-budget -- --check',
    script: 'perf:simulation-budget',
    args: ['--check'],
  }),
  Object.freeze({
    id: 'render',
    label: 'npm run perf:render-budget -- --check',
    script: 'perf:render-budget',
    args: ['--check'],
  }),
  Object.freeze({
    id: 'soak',
    label: 'npm run perf:soak -- --check',
    script: 'perf:soak',
    args: ['--check'],
  }),
  Object.freeze({
    id: 'traffic',
    label: 'npm run perf:traffic-benchmark -- --check',
    script: 'perf:traffic-benchmark',
    args: ['--check'],
  }),
  Object.freeze({
    id: 'hardware',
    label: 'npm run perf:hardware-budget -- --check',
    script: 'perf:hardware-budget',
    args: ['--check'],
  }),
  Object.freeze({
    id: 'gate',
    label: 'npm run perf:gate -- --measure --out=Docs/Evidence/189-v2-regression/gate-measure',
    script: 'perf:gate',
    args: [],
  }),
  Object.freeze({
    id: 'parameters',
    label: 'npm run validate:parameters -- --check',
    script: 'validate:parameters',
    args: ['--check'],
  }),
  Object.freeze({
    id: 'challenges',
    label: 'npm run missions:challenges-v2 -- --check',
    script: 'missions:challenges-v2',
    args: ['--check'],
  }),
  Object.freeze({
    id: 'pedestrians',
    label: 'npm run pedestrians:report -- --check',
    script: 'pedestrians:report',
    args: ['--check'],
  }),
  Object.freeze({
    id: 'hazards',
    label: 'npm run hazards:report -- --check',
    script: 'hazards:report',
    args: ['--check'],
  }),
  Object.freeze({
    id: 'tests',
    label: 'npm test',
    script: null,
    args: ['test'],
  }),
]);

const v1Required = Object.freeze([
  'A1',
  'A2',
  'A3',
  'A4',
  'A5',
  'A6',
  'A7',
  'A8',
  'A9',
  'B1',
  'B2',
  'B3',
  'B4',
  'B5',
  'B6',
  'B7',
  'B8',
  'B9',
  'B10',
  'B11',
  'B12',
  'B13',
  'C1',
  'C2',
  'D1',
  'D2',
  'D3',
]);

function pathOf(file) {
  return relative(root, file).replaceAll('\\', '/');
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function cell(value) {
  if (value === null || value === undefined) return '—';
  return String(value).replaceAll('|', '\\|');
}

function exitVerdict(exitCode) {
  return exitCode === 0 ? 'PASS' : 'FAIL';
}

/**
 * Rulează o comandă npm și întoarce exit code-ul real. `perf:gate` primește directorul de ieșire
 * ca argument, ca măsurătoarea acestui PBI să nu suprascrie dovezile comise de 224.
 */
function run(spec) {
  const args =
    spec.id === 'gate'
      ? [
          'run',
          'perf:gate',
          '--',
          '--measure',
          `--out=${pathOf(wantsCheck ? gateTemporary : gateEvidence)}`,
        ]
      : spec.script === null
        ? spec.args
        : ['run', spec.script, '--', ...spec.args];
  let output;
  let exitCode = 0;
  try {
    output = execFileSync(npm, args, {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 45 * 60 * 1000,
      maxBuffer: 64 * 1024 * 1024,
      shell: process.platform === 'win32',
    });
  } catch (error) {
    exitCode = typeof error.status === 'number' ? error.status : 1;
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
  console.log(`${exitVerdict(exitCode)} EXIT ${exitCode} ${spec.label}`);
  return { spec, exitCode, output };
}

function testTotals(output) {
  const count = (name) => {
    const match = output.match(
      new RegExp(`(?:^|\\n)\\s*(?:#|\\u2139)\\s*${name}\\s+(\\d+)\\s*(?:\\n|$)`, 'm'),
    );
    return match === null ? null : Number(match[1]);
  };
  return { tests: count('tests'), pass: count('pass'), fail: count('fail') };
}

/** Numele de fișiere din `tests/harness` care menționează entitățile V2. */
async function harnessCoverage(directory) {
  const files = (await readdir(directory)).filter((file) => file.endsWith('.ts')).sort();
  const pedestrian = [];
  const hazard = [];
  for (const file of files) {
    const content = await readFile(join(directory, file), 'utf8');
    if (/pedestrian|pieton/i.test(content)) pedestrian.push(file);
    if (/hazard|pericol/i.test(content)) hazard.push(file);
  }
  return { files: files.length, pedestrian, hazard };
}

/** Numele din dovezile de workload care menționează entitățile V2. */
async function workloadCoverage(files) {
  const pedestrian = [];
  const hazard = [];
  for (const file of files) {
    const content = await readFile(join(root, file), 'utf8');
    if (/pedestrian|pieton/i.test(content)) pedestrian.push(file);
    if (/hazard|pericol/i.test(content)) hazard.push(file);
  }
  return { files: files.length, pedestrian, hazard };
}

function verdictOf216(rows, v1) {
  if (v1 === null) return { verdict: 'FAIL', basis: 'raportul 216 lipsește' };
  const byId = new Map(rows.map((row) => [row.id, row]));
  const missing = v1Required.filter((id) => !byId.has(id));
  const failing = v1Required.filter((id) => byId.get(id)?.verdict === 'FAIL');
  const notRun = v1Required.filter((id) => byId.get(id)?.verdict === 'NOT_RUN');
  const xpLosses = Number(v1.xp?.losses);
  const summary = v1.summary ?? {};
  const ok =
    missing.length === 0 &&
    failing.length === 0 &&
    notRun.length === 0 &&
    xpLosses === 0 &&
    Number(summary.fail) === 0;
  const basis =
    `${summary.rows} rânduri: ${summary.pass} PASS, ${summary.fail} FAIL, ${summary.notRun} NOT_RUN; ` +
    `acoperire cerută ${v1Required.length - missing.length}/${v1Required.length}; ` +
    `pierderi XP ${v1.xp?.losses}, debitări ${v1.xp?.debits}; ` +
    `rânduri declarate NOT_RUN în afara listei: ${(v1.rows ?? [])
      .filter((row) => row.verdict === 'NOT_RUN' && !v1Required.includes(row.id))
      .map((row) => row.id)
      .join(', ')}`;
  const verdict = ok ? 'PASS' : missing.length > 0 || failing.length > 0 ? 'FAIL' : 'NOT_RUN';
  return { verdict, basis };
}

const [manifest, harness] = await Promise.all([
  readJson(manifestFile),
  harnessCoverage(join(root, 'tests', 'harness')),
]);
const workloadSources = [
  evidenceFiles.hardware,
  evidenceFiles.traffic,
  evidenceFiles.simulation,
  evidenceFiles.gate,
];
const workloadEvidence = await workloadCoverage(workloadSources);

const results = new Map();
try {
  for (const spec of commandSpecs) results.set(spec.id, run(spec));

  const reports = {};
  for (const [id, file] of Object.entries(evidenceFiles))
    reports[id] = await readJson(join(root, file)).catch(() => null);
  const gateFresh = await readJson(join(wantsCheck ? gateTemporary : gateEvidence, 'report.json'));
  const headManifest = execFileSync('git', ['show', 'HEAD:Docs/performance-budgets.json'], {
    cwd: root,
    maxBuffer: 16 * 1024 * 1024,
  });
  const manifestBytes = await readFile(manifestFile);
  const manifestSha = sha256(manifestBytes);
  const baseline = Object.freeze({
    file: pathOf(manifestFile),
    budgetVersion: String(manifest.budgetVersion),
    approvedGate: Boolean(manifest.approvedGate),
    sha256: manifestSha,
    headSha256: sha256(headManifest),
    unmodified: manifestSha === sha256(headManifest),
    hardwareGameplayGate: String(manifest.acceptance?.hardwareGameplayGate ?? 'UNKNOWN'),
  });

  const v1Report = reports.v1;
  const v1Rows = v1Report?.rows ?? [];
  const v1 = verdictOf216(v1Rows, v1Report);
  const test = testTotals(results.get('tests').output);

  const inbox = (id) => results.get(id);
  const checks = [
    {
      id: 'v1-suite',
      criterion: 'C1',
      command: inbox('v1').spec.label,
      exitCode: inbox('v1').exitCode,
      verdict: exitVerdict(inbox('v1').exitCode),
      figure:
        `${v1Report?.summary?.rows ?? '—'} rânduri, ${v1Report?.summary?.pass ?? '—'} PASS, ` +
        `${v1Report?.summary?.fail ?? '—'} FAIL, ${v1Report?.summary?.notRun ?? '—'} NOT_RUN; ` +
        `pierderi XP ${v1Report?.xp?.losses ?? '—'}, debitări ${v1Report?.xp?.debits ?? '—'}`,
    },
    {
      id: 'compat-matrix',
      criterion: 'compat',
      command: inbox('compat').spec.label,
      exitCode: inbox('compat').exitCode,
      verdict: exitVerdict(inbox('compat').exitCode),
      figure:
        `${reports.compat?.summary?.pass ?? '—'}/${reports.compat?.summary?.rows ?? '—'} combinații reale PASS, ` +
        `${reports.compat?.summary?.fail ?? '—'} FAIL, ` +
        `${reports.compat?.summary?.deterministicPass ?? '—'}/${reports.compat?.summary?.deterministicChecks ?? '—'} verificări deterministe, ` +
        `${reports.compat?.summary?.declaredNotRun ?? '—'} combinații declarate NOT_RUN`,
    },
    {
      id: 'hardware-budget',
      criterion: 'C2',
      command: inbox('hardware').spec.label,
      exitCode: inbox('hardware').exitCode,
      verdict: exitVerdict(inbox('hardware').exitCode),
      figure:
        `155: ${reports.hardware?.summary?.pass ?? '—'} PASS, ${reports.hardware?.summary?.fail ?? '—'} FAIL, ` +
        `${reports.hardware?.summary?.notMeasured ?? '—'} NOT_MEASURED; ` +
        `laptop ${reports.hardware?.configurations?.length ?? '—'} configurații, ` +
        `hardwareGameplayGate ${reports.hardware?.summary?.hardwareGameplayGate ?? '—'}`,
    },
    {
      id: 'simulation-budget',
      criterion: 'C3',
      command: inbox('simulation').spec.label,
      exitCode: inbox('simulation').exitCode,
      verdict: exitVerdict(inbox('simulation').exitCode),
      figure:
        `158: decizii ${reports.simulation?.verdicts?.decisions ?? '—'}, estimare ${reports.simulation?.verdicts?.estimation ?? '—'}, ` +
        `transferuri ${reports.simulation?.verdicts?.transfer ?? '—'}, ` +
        `${(reports.simulation?.equivalence ?? []).filter((entry) => entry.status === 'IDENTICAL').length}/${(reports.simulation?.equivalence ?? []).length} echivalențe IDENTICAL`,
    },
    {
      id: 'render-budget',
      criterion: 'C3',
      command: inbox('render').spec.label,
      exitCode: inbox('render').exitCode,
      verdict: exitVerdict(inbox('render').exitCode),
      figure:
        `157: ${reports.render?.summary?.pass ?? '—'} PASS, ${reports.render?.summary?.fail ?? '—'} FAIL, ` +
        `${reports.render?.summary?.notMeasured ?? '—'} NOT_MEASURED, gate ${reports.render?.summary?.gate ?? '—'}`,
    },
    {
      id: 'soak-report',
      criterion: 'C3',
      command: inbox('soak').spec.label,
      exitCode: inbox('soak').exitCode,
      verdict: exitVerdict(inbox('soak').exitCode),
      figure:
        `159: ${reports.soak?.verdict?.status ?? '—'}, ${reports.soak?.duration?.actualMinutes ?? '—'} min, ` +
        `${reports.soak?.lifecycle?.cycles ?? '—'} cicluri, ${reports.soak?.checks?.length ?? '—'} verificări`,
    },
    {
      id: 'traffic-benchmark',
      criterion: 'C3',
      command: inbox('traffic').spec.label,
      exitCode: inbox('traffic').exitCode,
      verdict: exitVerdict(inbox('traffic').exitCode),
      figure:
        `156: ${reports.traffic?.summary?.pass ?? '—'} PASS, ${reports.traffic?.summary?.fail ?? '—'} FAIL, ` +
        `${reports.traffic?.summary?.stress ?? '—'} STRESS, ${reports.traffic?.summary?.reported ?? '—'} REPORTED, ` +
        `gate ${reports.traffic?.summary?.gate ?? '—'}`,
    },
    {
      id: 'performance-gate',
      criterion: 'C3',
      command: inbox('gate').spec.label,
      exitCode: inbox('gate').exitCode,
      verdict: exitVerdict(inbox('gate').exitCode),
      figure:
        `224 reexecutat: structural ${gateFresh.summary?.structural ?? '—'}, release ${gateFresh.summary?.release ?? '—'}, ` +
        `${gateFresh.summary?.pass ?? '—'} PASS, ${gateFresh.summary?.fail ?? '—'} FAIL, ` +
        `${gateFresh.summary?.notValidated ?? '—'} NOT_VALIDATED; ` +
        `bundle ${gateFresh.rows?.find((row) => row.id === 'bundle-critical-transfer')?.detail ?? '—'}`,
    },
    {
      id: 'parameter-gate',
      criterion: 'regressions',
      command: inbox('parameters').spec.label,
      exitCode: inbox('parameters').exitCode,
      verdict: exitVerdict(inbox('parameters').exitCode),
      figure:
        `187: ${reports.parameters?.keys?.length ?? '—'} chei, ${reports.parameters?.findings?.length ?? '—'} findings, ` +
        `verdict ${reports.parameters?.verdict ?? '—'}`,
    },
    {
      id: 'challenges-v2',
      criterion: 'regressions',
      command: inbox('challenges').spec.label,
      exitCode: inbox('challenges').exitCode,
      verdict: exitVerdict(inbox('challenges').exitCode),
      figure:
        `188: ${reports.challenges?.challenges?.length ?? '—'} provocări, ${reports.challenges?.families?.length ?? '—'} familii, ` +
        `${reports.challenges?.summary?.passed ?? '—'}/${reports.challenges?.summary?.checks ?? '—'} verificări`,
    },
    {
      id: 'pedestrians-v2',
      criterion: 'workload',
      command: inbox('pedestrians').spec.label,
      exitCode: inbox('pedestrians').exitCode,
      verdict: exitVerdict(inbox('pedestrians').exitCode),
      figure:
        `164: ${reports.pedestrians?.summary?.pedestrians ?? '—'} pietoni, ` +
        `${reports.pedestrians?.fixture?.crosswalks ?? '—'} treceri, ` +
        `${reports.pedestrians?.summary?.scenarios ?? '—'} scenarii, ${reports.pedestrians?.summary?.conflictRecords ?? '—'} conflicte`,
    },
    {
      id: 'hazards-v2',
      criterion: 'workload',
      command: inbox('hazards').spec.label,
      exitCode: inbox('hazards').exitCode,
      verdict: exitVerdict(inbox('hazards').exitCode),
      figure:
        `165: ${reports.hazards?.fixture?.obstacles ?? '—'} obstacole, ` +
        `${reports.hazards?.summary?.stimuli ?? '—'} stimuli, ` +
        `${reports.hazards?.summary?.scenarios ?? '—'} scenarii, ` +
        `${reports.hazards?.summary?.reactions ?? '—'} reacții`,
    },
    {
      id: 'full-test-suite',
      criterion: 'regressions',
      command: inbox('tests').spec.label,
      exitCode: inbox('tests').exitCode,
      verdict: exitVerdict(inbox('tests').exitCode),
      figure: `${test.tests ?? '—'} teste, ${test.pass ?? '—'} trecute, ${test.fail ?? '—'} eșuate`,
    },
  ];

  const commandFailures = checks.filter((check) => check.exitCode !== 0).map((check) => check.id);
  const regressionsOk =
    commandFailures.length === 0 &&
    Number(test.fail) === 0 &&
    reports.parameters?.verdict === 'PASS' &&
    Number(reports.parameters?.findings?.length) === 0 &&
    reports.challenges?.summary?.pass === true &&
    reports.pedestrians?.summary?.pass === true &&
    reports.hazards?.summary?.pass === true;
  const regressions = Object.freeze({
    verdict: regressionsOk ? 'PASS' : 'FAIL',
    basis:
      `${test.tests ?? '—'} teste (${test.fail ?? '—'} eșuate); 187 ${reports.parameters?.keys?.length ?? '—'} chei/${reports.parameters?.findings?.length ?? '—'} findings; ` +
      `188 ${reports.challenges?.challenges?.length ?? '—'} provocări/${reports.challenges?.summary?.passed ?? '—'} verificări; ` +
      `164 ${reports.pedestrians?.summary?.pass ? 'PASS' : 'FAIL'}; 165 ${reports.hazards?.summary?.pass ? 'PASS' : 'FAIL'}`,
  });

  const compatOk =
    inbox('compat').exitCode === 0 &&
    Number(reports.compat?.summary?.fail) === 0 &&
    Number(reports.compat?.summary?.pass) === Number(reports.compat?.summary?.rows);
  const compatibility = Object.freeze({
    verdict: compatOk ? 'PASS' : 'FAIL',
    rows: (reports.compat?.matrix ?? []).map((row) =>
      Object.freeze({
        id: String(row.id),
        scenario: String(row.scenario),
        backend: String(row.backend),
        verdict: String(row.verdict),
      }),
    ),
    deterministic: Object.freeze({
      pass: Number(reports.compat?.summary?.deterministicPass ?? 0),
      checks: Number(reports.compat?.summary?.deterministicChecks ?? 0),
    }),
    declaredNotRun: Number(reports.compat?.summary?.declaredNotRun ?? 0),
  });

  const fpsRow = gateFresh.rows?.find((row) => row.id === 'fps-hardware');
  const fpsVerdict =
    fpsRow?.verdict === 'PASS' ? 'PASS' : fpsRow?.verdict === 'FAIL' ? 'FAIL' : 'NOT_RUN';
  const c2 = Object.freeze({
    verdict: fpsVerdict,
    basis:
      `fps-hardware ${fpsRow?.verdict ?? 'lipsă'}: capturile hardware 220 sunt pe buildul ` +
      `${fpsRow?.revision ?? '—'}, iar măsurătoarea gate-ului reexecutat raportează structural ` +
      `${gateFresh.summary?.structural ?? '—'} și release ${gateFresh.summary?.release ?? '—'}; ` +
      `pragurile absolute cer aceeași revizie. 155 raportează ${reports.hardware?.summary?.pass ?? '—'} PASS pe configurația laptop, ` +
      `dar fără pietoni/pericole în workload. Gate-ul rămâne deschis.`,
  });

  const c3Failures = checks
    .filter((check) => check.criterion === 'C3' && check.exitCode !== 0)
    .map((check) => check.id);
  const c3Verdict = !baseline.unmodified
    ? 'FAIL'
    : c3Failures.length > 0 || gateFresh.summary?.structural === 'FAIL'
      ? 'FAIL'
      : fpsVerdict === 'PASS'
        ? 'PASS'
        : 'NOT_RUN';
  const c3 = Object.freeze({
    verdict: c3Verdict,
    basis:
      `Contractul 25 reexecutat: 158 ${reports.simulation?.verdicts?.overall ?? '—'}, 157 ${reports.render?.summary?.gate ?? '—'}, ` +
      `159 ${reports.soak?.verdict?.status ?? '—'}, 156 ${reports.traffic?.summary?.gate ?? '—'}, 224 structural ${gateFresh.summary?.structural ?? '—'}; ` +
      `manifest ${baseline.budgetVersion} ${baseline.unmodified ? 'nemodificat' : 'MODIFICAT'}. ` +
      `Workload-ul V2 are ${workloadEvidence.pedestrian.length + workloadEvidence.hazard.length} referințe de pietoni/pericole în dovezile de performanță și ` +
      `${harness.pedestrian.length + harness.hazard.length} în \`tests/harness\`, deci gate-urile de timp nu îl pot rula: partea V2 rămâne NOT_RUN.`,
  });

  const criteria = [
    Object.freeze({
      id: 'C1',
      title:
        'Suita V1 revizia 0.3 este reexecutată: moduri, civili, economie/reviews, daily, XP și checkpoint/replay',
      verdict: v1.verdict,
      basis: v1.basis,
      commands: ['v1-suite'],
    }),
    Object.freeze({
      id: 'C2',
      title:
        'Hardware-ul de referință trece țintele cu pietoni și catalog complet sau gate-ul rămâne deschis',
      verdict: c2.verdict,
      basis: c2.basis,
      commands: ['hardware-budget', 'performance-gate'],
    }),
    Object.freeze({
      id: 'C3',
      title:
        'Contractul 25 și gate-urile V1 sunt reexecutate pe workload V2 versionat; baseline-ul nu este relaxat tacit',
      verdict: c3.verdict,
      basis: c3.basis,
      commands: [
        'simulation-budget',
        'render-budget',
        'soak-report',
        'traffic-benchmark',
        'performance-gate',
      ],
    }),
  ];

  const totals = Object.freeze({
    pass: criteria.filter((entry) => entry.verdict === 'PASS').length,
    fail: criteria.filter((entry) => entry.verdict === 'FAIL').length,
    notRun: criteria.filter((entry) => entry.verdict === 'NOT_RUN').length,
  });

  const workload = Object.freeze({
    id: workloadVersion,
    release: 'V2',
    definition: Object.freeze({
      fleet: Object.freeze({
        taxis: Number(manifest.workloads?.maximumV1?.taxis),
        civilians: Number(manifest.workloads?.maximumV1?.civilians),
        source: `${pathOf(manifestFile)} workloads.maximumV1`,
      }),
      pedestrians: Object.freeze({
        entities: Number(reports.pedestrians?.summary?.pedestrians ?? 0),
        crosswalks: Number(reports.pedestrians?.fixture?.crosswalks ?? 0),
        scenarios: Number(reports.pedestrians?.summary?.scenarios ?? 0),
        source: evidenceFiles.pedestrians,
      }),
      hazards: Object.freeze({
        obstacles: Number(reports.hazards?.fixture?.obstacles ?? 0),
        stimuli: Number(reports.hazards?.summary?.stimuli ?? 0),
        scenarios: Number(reports.hazards?.summary?.scenarios ?? 0),
        source: evidenceFiles.hazards,
      }),
      catalog: Object.freeze({
        keys: Number(reports.parameters?.keys?.length ?? 0),
        findings: Number(reports.parameters?.findings?.length ?? 0),
        source: evidenceFiles.parameters,
      }),
      challenges: Object.freeze({
        count: Number(reports.challenges?.challenges?.length ?? 0),
        families: Number(reports.challenges?.families?.length ?? 0),
        checks: Number(reports.challenges?.summary?.checks ?? 0),
        source: evidenceFiles.challenges,
      }),
      lifecycle: Object.freeze({
        cycles: Number(reports.soak?.lifecycle?.cycles ?? 0),
        minutes: Number(reports.soak?.duration?.actualMinutes ?? 0),
        source: evidenceFiles.soak,
      }),
    }),
    functionalEvidence: Object.freeze([
      'pedestrians-v2',
      'hazards-v2',
      'parameter-gate',
      'challenges-v2',
    ]),
    timing: Object.freeze({
      verdict: 'NOT_RUN',
      reason:
        `Harness-ul de performanță nu are fixture cu pietoni/pericole: ${harness.files} fișiere în tests/harness, ` +
        `${harness.pedestrian.length} referințe de pietoni și ${harness.hazard.length} de pericole; dovezile 155/156/158/224 au ` +
        `${workloadEvidence.pedestrian.length + workloadEvidence.hazard.length} referințe. ` +
        'Măsurarea frame/simulare pe workload-ul V2 cere o pagină de harness și un GPU real, indisponibile aici.',
    }),
  });

  const notRun = Object.freeze([
    Object.freeze({
      id: 'hardware-v2',
      reason:
        'Țintele FPS/frame/GPU pe hardware real cu pietoni și catalog complet nu au fost măsurate: nu există sesiune de browser cu GPU pe această revizie, iar fixture-ul 220 nu include pietoni/pericole. Gate-ul rămâne deschis.',
    }),
    Object.freeze({
      id: 'workload-v2-timing',
      reason:
        'Workload-ul 189-workload-v2-1 este definit și dovedit funcțional, dar nu are probe de timp: harness-ul existent (155/156/158/220) exprimă doar flotă + civili.',
    }),
    Object.freeze({
      id: 'soak-v2',
      reason:
        'Soak-ul de 60 de minute este dovedit de măsurătoarea comisă 159/224 (commit 917a7de9), nu reexecutat aici; soak-ul V2 cu pietoni/pericole nu are fixture.',
    }),
  ]);

  const findings = Object.freeze([
    Object.freeze({
      id: 'committed-gate-staleness',
      command: 'npm run perf:gate -- --check',
      exitCode: 1,
      owner: '224',
      detail:
        'Dovada comisă a gate-ului 224 este învechită față de sursă după revizia pe care a fost măsurată: `--check` raportează „măsurătoarea de build este învechită față de sursă”. PBI 189 nu suprascrie dovezile 224; gate-ul este reexecutat proaspăt în `gate-measure/` pentru revizia curentă (structural PASS).',
    }),
  ]);

  const limitations = Object.freeze([
    'Probele de timp rulează în Node, fără renderer, GPU sau input uman; ele nu dovedesc FPS, frame p95/p99 sau latența pe hardware.',
    'Workload-ul V2 nu poate fi exprimat de harness-ul existent: 155/156/158/220 acoperă flotă și civili, fără pietoni sau pericole. Cifrele de timp pentru V2 nu sunt inventate.',
    'Soak-ul de 60 de minute este citit din măsurătoarea comisă a lui 159/224, nu reexecutat; o rulare reală durează o oră și aparține gate-ului complet.',
    'Capturile hardware 220 sunt pe buildul 2d68b43c8cdf, iar măsurătoarea 224 pe 757e7168; pragurile absolute cer aceeași revizie, deci FPS rămâne NOT_VALIDATED.',
    'Raportul nu include commitul HEAD, ca `--check` să rămână valabil după commit; proveniența intrărilor este dată de SHA-256.',
  ]);

  const inputs = [];
  for (const file of [pathOf(manifestFile), ...Object.values(evidenceFiles)]) {
    const bytes = await readFile(join(root, file));
    inputs.push(Object.freeze({ file, sha256: sha256(bytes) }));
  }

  const report = Object.freeze({
    schemaVersion: 1,
    pbi: '189',
    generatedBy: 'npm run qa:v2-regression',
    command: 'npm run qa:v2-regression',
    workload,
    baseline,
    criteria,
    checks,
    regressions,
    compatibility,
    findings,
    notRun,
    limitations,
    inputs,
    totals,
  });

  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = render(report, reports, v1Rows);
  if (wantsCheck) {
    const savedJson = await readFile(reportJson, 'utf8').catch(() => null);
    if (savedJson !== json) {
      console.error(`Raportul V2 este învechit: ${pathOf(reportJson)}`);
      process.exitCode = 1;
    } else console.log(`Raportul V2 este curent: ${pathOf(reportJson)}`);
    const savedMarkdown = await readFile(reportMarkdown, 'utf8').catch(() => null);
    if (savedMarkdown !== markdown) {
      console.error(`Markdown-ul V2 este învechit: ${pathOf(reportMarkdown)}`);
      process.exitCode = 1;
    } else console.log(`Markdown-ul V2 este curent: ${pathOf(reportMarkdown)}`);
  } else {
    await writeFile(reportJson, json);
    await writeFile(reportMarkdown, markdown);
    console.log(`Scris ${pathOf(reportJson)}`);
    console.log(`Scris ${pathOf(reportMarkdown)}`);
  }
  console.log(
    `SUMMARY criterii ${totals.pass} PASS, ${totals.fail} FAIL, ${totals.notRun} NOT_RUN; ` +
      `regresii ${regressions.verdict}; compatibilitate ${compatibility.verdict}; ` +
      `workload ${workloadVersion}; baseline ${baseline.unmodified ? 'nemodificat' : 'MODIFICAT'}`,
  );
  if (totals.fail > 0) process.exitCode = 1;
  if (wantsStrict && totals.notRun > 0) process.exitCode = 1;
} finally {
  if (wantsCheck) await rm(gateTemporary, { recursive: true, force: true });
}

function render(report, reports, v1Rows) {
  const criterionRows = report.criteria
    .map(
      (entry) =>
        `| **${entry.id}** | ${cell(entry.title)} | **${entry.verdict}** | ${cell(entry.basis)} |`,
    )
    .join('\n');
  const checkRows = report.checks
    .map(
      (entry) =>
        `| ${entry.criterion} | \`${entry.command}\` | ${entry.exitCode} | ${entry.verdict} | ${cell(entry.figure)} |`,
    )
    .join('\n');
  const v1RowsTable = (v1Rows ?? [])
    .map((row) => `| ${row.id} | ${row.category} | ${row.verdict} | ${cell(row.scenario)} |`)
    .join('\n');
  const compatRows = report.compatibility.rows
    .map((row) => `| ${row.id} | ${row.scenario} | ${row.backend} | ${row.verdict} |`)
    .join('\n');
  const workload = report.workload.definition;
  const notRun = report.notRun.map((entry) => `- **${entry.id}**: ${entry.reason}`).join('\n');
  const findings = report.findings
    .map(
      (entry) =>
        `- **${entry.id}** (\`${entry.command}\` → exit ${entry.exitCode}, owner ${entry.owner}): ${entry.detail}`,
    )
    .join('\n');
  const limitations = report.limitations.map((entry) => `- ${entry}`).join('\n');
  const inputs = report.inputs
    .map((entry) => `| \`${entry.file}\` | \`${entry.sha256}\` |`)
    .join('\n');
  const tests = report.checks.find((entry) => entry.id === 'full-test-suite');
  return `# 189 — regresii de compatibilitate și performanță V2

Transcript determinist generat de \`${report.generatedBy}\`; verificarea este \`npm run qa:v2-regression -- --check\`.
Machine-readable: [report.json](report.json). Măsurătoarea gate-ului reexecutat: [gate-measure/report.json](gate-measure/report.json).
Workload versionat: \`${report.workload.id}\`.

## Verdictele pe criterii

| Criteriu | Enunț | Verdict | Baza reală |
| --- | --- | --- | --- |
${criterionRows}

Total: **${report.totals.pass} PASS, ${report.totals.fail} FAIL, ${report.totals.notRun} NOT_RUN**. Un verdict \`NOT_RUN\` lasă gate-ul deschis și nu este raportat ca \`PASS\`.

## Matricea executată: criteriu → comandă → exit code → verdict → cifră

Rândurile \`compat\`, \`regressions\` și \`workload\` sunt verificări de suport, nu criterii independente.

| Criteriu | Comandă | Exit | Verdict | Cifră / dovadă |
| --- | --- | ---: | --- | --- |
${checkRows}

## Workload V2 versionat — \`${report.workload.id}\`

| Componentă | Valoare | Sursă |
| --- | ---: | --- |
| Flotă | ${workload.fleet.taxis} taxiuri / ${workload.fleet.civilians} civili | ${workload.fleet.source} |
| Pietoni | ${workload.pedestrians.entities} entități, ${workload.pedestrians.crosswalks} treceri, ${workload.pedestrians.scenarios} scenarii | ${workload.pedestrians.source} |
| Pericole | ${workload.hazards.obstacles} obstacole, ${workload.hazards.stimuli} stimuli, ${workload.hazards.scenarios} scenarii | ${workload.hazards.source} |
| Catalog | ${workload.catalog.keys} chei, ${workload.catalog.findings} findings | ${workload.catalog.source} |
| Provocări | ${workload.challenges.count} provocări în ${workload.challenges.families} familii, ${workload.challenges.checks} verificări | ${workload.challenges.source} |
| Soak | ${workload.lifecycle.cycles} cicluri, ${workload.lifecycle.minutes} min | ${workload.lifecycle.source} |

Dovada funcțională a workload-ului: ${report.workload.functionalEvidence.join(', ')}.
Măsurarea de timp pe acest workload este **${report.workload.timing.verdict}**: ${report.workload.timing.reason}

## Suita V1 revizia 0.3, rând cu rând

| ID | Categorie | Verdict | Scenariu |
| --- | --- | --- | --- |
${v1RowsTable}

## Matricea de compatibilitate 154

| Combinație | Scenariu | Backend | Verdict |
| --- | --- | --- | --- |
${compatRows}

Verificări deterministe: **${report.compatibility.deterministic.pass}/${report.compatibility.deterministic.checks}**;
combinații declarate \`NOT_RUN\`: **${report.compatibility.declaredNotRun}**. Verdict general: **${report.compatibility.verdict}**.

## Regresii funcționale V2

${report.regressions.basis}. Verdict: **${report.regressions.verdict}**.
Suita completă: ${tests.figure}, exit ${tests.exitCode}.

## Baseline-ul nu este relaxat

| Indicator | Valoare |
| --- | --- |
| Fișier | \`${report.baseline.file}\` |
| Versiune bugete | \`${report.baseline.budgetVersion}\` |
| \`approvedGate\` | \`${report.baseline.approvedGate}\` |
| \`hardwareGameplayGate\` | \`${report.baseline.hardwareGameplayGate}\` |
| SHA-256 în lucru | \`${report.baseline.sha256}\` |
| SHA-256 în \`HEAD\` | \`${report.baseline.headSha256}\` |
| Nemodificat | **${report.baseline.unmodified ? 'DA' : 'NU'}** |

## Constatări

${findings}

## Ce a rămas NOT_RUN

${notRun}

## Limitări

${limitations}

## Intrări verificate (SHA-256)

| Fișier | SHA-256 |
| --- | --- |
${inputs}
`;
}

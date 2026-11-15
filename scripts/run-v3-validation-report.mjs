import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 201 — validarea integrală V3.
 *
 * `npm run qa:v3-validation` reexecută efectiv comenzile reviziei curente, importă suitele de
 * validare V3 (fluxurile AUTO/MANUAL/LEARNING și digesteurile de catalog/KPI/XP) și scrie
 * `report.json` + `report.md` cu verdict pe fiecare criteriu al PBI-ului.
 *
 * Reguli:
 * - Un verdict nu se declară fără execuție: fiecare rând are exit code-ul real.
 * - `NOT_RUN` este explicit, cu motiv, și lasă gate-ul deschis; nu este raportat ca `PASS`.
 * - Bugetele se citesc din `Docs/performance-budgets.json` și nu se rescriu; raportul dovedește
 *   nemodificarea baseline-ului prin SHA-256 față de `HEAD`.
 * - `perf:gate` este reexecutat cu `--measure --out` în dovezile acestui PBI, ca să nu atingă
 *   măsurătoarea comisă a lui 224. În `--check` măsurătoarea merge într-un director temporar.
 * - `--check` regenerează raportul și îl compară byte cu byte cu fișierele comise.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = join(root, 'Docs', 'Evidence', '201-v3-validation');
const reportJson = join(evidence, 'report.json');
const reportMarkdown = join(evidence, 'report.md');
const gateEvidence = join(evidence, 'gate-measure');
const gateTemporary = join(root, '.pbi-validation-201', 'gate-check');
const manifestFile = join(root, 'Docs', 'performance-budgets.json');
const workloadVersion = '201-workload-v3-1';
const wantsCheck = process.argv.includes('--check');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const evidenceFiles = Object.freeze({
  v1: 'Docs/Evidence/216-v1-regression/report.json',
  compat: 'Docs/Evidence/154-compat-matrix/report.json',
  simulation: 'Docs/Evidence/158-simulation-budget/report.json',
  render: 'Docs/Evidence/157-render-budget/report.json',
  soak: 'Docs/Evidence/159-soak/report.json',
  parameters: 'Docs/Evidence/187-v2-parameter-gate/report.json',
  challenges: 'Docs/Evidence/188-v2-challenges/report.json',
  pedestrians: 'Docs/Evidence/164-pedestrians/report.json',
  hazards: 'Docs/Evidence/165-hazards/report.json',
  walkingSegments: 'Docs/Evidence/198-v3-walking-segments/report.json',
  walkingSave: 'Docs/Evidence/200-v3-walking-save/report.json',
  gate: 'Docs/Evidence/224-performance-gate/report.json',
});

/** Contractele V3 livrate 191–200, fiecare citit din raportul propriu. */
const v3Contracts = Object.freeze([
  'Docs/Evidence/191-v3-character/report.json',
  'Docs/Evidence/192-v3-walker/report.json',
  'Docs/Evidence/193-v3-authority/report.json',
  'Docs/Evidence/194-v3-camera/report.json',
  'Docs/Evidence/195-v3-enter/report.json',
  'Docs/Evidence/196-v3-exit/report.json',
  'Docs/Evidence/197-v3-fleet-switch/report.json',
  'Docs/Evidence/198-v3-walking-segments/report.json',
  'Docs/Evidence/199-v3-walking-tutorial/report.json',
  'Docs/Evidence/200-v3-walking-save/report.json',
]);

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
    id: 'gate',
    label: 'npm run perf:gate -- --measure --out=Docs/Evidence/201-v3-validation/gate-measure',
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
    id: 'walking-segments',
    label: 'npm run walking:segments -- --check',
    script: 'walking:segments',
    args: ['--check'],
  }),
  Object.freeze({
    id: 'walking-save',
    label: 'npm run walking:save -- --check',
    script: 'walking:save',
    args: ['--check'],
  }),
  Object.freeze({
    id: 'tests',
    label: 'npm test',
    script: null,
    args: ['test'],
  }),
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

/** Rulează o comandă npm și întoarce exit code-ul real. */
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

const [manifest, flowSuite, digestSuite] = await Promise.all([
  readJson(manifestFile),
  import(pathToFileURL(join(root, 'tests', 'qa', 'v3-validation-flow.ts')).href),
  import(pathToFileURL(join(root, 'tests', 'qa', 'v3-validation-digest.ts')).href),
]);

const results = new Map();
try {
  for (const spec of commandSpecs) results.set(spec.id, run(spec));

  const reports = {};
  for (const [id, file] of Object.entries(evidenceFiles))
    reports[id] = await readJson(join(root, file)).catch(() => null);
  const contracts = [];
  for (const file of v3Contracts) {
    const report = await readJson(join(root, file)).catch(() => null);
    contracts.push(
      Object.freeze({
        evidence: file,
        contract: report === null ? null : String(report.contract ?? report.version ?? 'UNKNOWN'),
      }),
    );
  }
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
    status: String(manifest.status),
    approvedGate: Boolean(manifest.approvedGate),
    sha256: manifestSha,
    headSha256: sha256(headManifest),
    unmodified: manifestSha === sha256(headManifest),
    hardwareGameplayGate: String(manifest.acceptance?.hardwareGameplayGate ?? 'UNKNOWN'),
  });

  const flow = flowSuite.runV3FlowValidation();
  const digest = await digestSuite.runV3DigestValidation();
  const test = testTotals(results.get('tests').output);
  const inbox = (id) => results.get(id);

  const checks = [
    {
      id: 'flow-v3',
      criterion: 'C1',
      command: 'suites 201 (tests/qa/v3-validation-flow.ts)',
      exitCode: flow.summary.pass ? 0 : 1,
      verdict: flow.summary.pass ? 'PASS' : 'FAIL',
      figure:
        `${flow.summary.passed}/${flow.summary.cases} moduri (AUTO/MANUAL/LEARNING), ` +
        `${flow.summary.seatedPassed}/${flow.summary.seatedCases} conducere; ` +
        `mers după ieșire ${flow.cases[0]?.walkedAfterM.toFixed(3) ?? '—'} m`,
    },
    {
      id: 'v1-suite',
      criterion: 'C1',
      command: inbox('v1').spec.label,
      exitCode: inbox('v1').exitCode,
      verdict: exitVerdict(inbox('v1').exitCode),
      figure:
        `${reports.v1?.summary?.rows ?? '—'} rânduri, ${reports.v1?.summary?.pass ?? '—'} PASS, ` +
        `${reports.v1?.summary?.fail ?? '—'} FAIL, ${reports.v1?.summary?.notRun ?? '—'} NOT_RUN; ` +
        `pierderi XP ${reports.v1?.xp?.losses ?? '—'}, debitări ${reports.v1?.xp?.debits ?? '—'}`,
    },
    {
      id: 'walking-segments',
      criterion: 'C1',
      command: inbox('walking-segments').spec.label,
      exitCode: inbox('walking-segments').exitCode,
      verdict: exitVerdict(inbox('walking-segments').exitCode),
      figure:
        `198: ${reports.walkingSegments?.walking?.ticks ?? '—'} tick-uri de mers, ` +
        `${reports.walkingSegments?.walking?.distanceM?.toFixed(2) ?? '—'} m, ` +
        `${reports.walkingSegments?.walking?.closedSegments ?? '—'} segmente închise de mers, ` +
        `${reports.walkingSegments?.summary?.scenariosPassed ?? '—'}/${reports.walkingSegments?.summary?.scenarios ?? '—'} scenarii`,
    },
    {
      id: 'walking-save',
      criterion: 'C1',
      command: inbox('walking-save').spec.label,
      exitCode: inbox('walking-save').exitCode,
      verdict: exitVerdict(inbox('walking-save').exitCode),
      figure:
        `200: ${reports.walkingSave?.summary?.passed ?? '—'}/${reports.walkingSave?.summary?.checks ?? '—'} verificări, ` +
        `${reports.walkingSave?.summary?.scenariosPassed ?? '—'}/${reports.walkingSave?.summary?.scenarios ?? '—'} scenarii, ` +
        `${reports.walkingSave?.summary?.refusalsClosed ?? '—'}/${reports.walkingSave?.summary?.refusals ?? '—'} refuzuri`,
    },
    {
      id: 'digest-v3',
      criterion: 'C2',
      command: 'suites 201 (tests/qa/v3-validation-digest.ts)',
      exitCode: digest.summary.pass ? 0 : 1,
      verdict: digest.summary.pass ? 'PASS' : 'FAIL',
      figure:
        `${digest.summary.identical}/${digest.summary.entries} digeste identice după ` +
        `${digest.walking.ticks} tick-uri de mers și după reload 200; ` +
        `XP ${digest.reload.xpBalance} / nivel ${digest.reload.level}`,
    },
    {
      id: 'parameter-gate',
      criterion: 'C2',
      command: inbox('parameters').spec.label,
      exitCode: inbox('parameters').exitCode,
      verdict: exitVerdict(inbox('parameters').exitCode),
      figure:
        `187: ${reports.parameters?.keys?.length ?? '—'} chei, ${reports.parameters?.findings?.length ?? '—'} findings, ` +
        `verdict ${reports.parameters?.verdict ?? '—'}`,
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
      id: 'performance-gate',
      criterion: 'C3',
      command: inbox('gate').spec.label,
      exitCode: inbox('gate').exitCode,
      verdict: exitVerdict(inbox('gate').exitCode),
      figure:
        `224 reexecutat: structural ${gateFresh.summary?.structural ?? '—'}, release ${gateFresh.summary?.release ?? '—'}, ` +
        `${gateFresh.summary?.pass ?? '—'} PASS, ${gateFresh.summary?.fail ?? '—'} FAIL, ` +
        `${gateFresh.summary?.notValidated ?? '—'} NOT_VALIDATED`,
    },
    {
      id: 'compatibility',
      criterion: 'C3',
      command: inbox('compat').spec.label,
      exitCode: inbox('compat').exitCode,
      verdict: exitVerdict(inbox('compat').exitCode),
      figure:
        `${reports.compat?.summary?.pass ?? '—'}/${reports.compat?.summary?.rows ?? '—'} combinații reale, ` +
        `${reports.compat?.summary?.deterministicPass ?? '—'}/${reports.compat?.summary?.deterministicChecks ?? '—'} verificări deterministe, ` +
        `${reports.compat?.summary?.declaredNotRun ?? '—'} declarate NOT_RUN`,
    },
    {
      id: 'challenges-v2',
      criterion: 'C3',
      command: inbox('challenges').spec.label,
      exitCode: inbox('challenges').exitCode,
      verdict: exitVerdict(inbox('challenges').exitCode),
      figure:
        `188: ${reports.challenges?.challenges?.length ?? '—'} provocări, ${reports.challenges?.families?.length ?? '—'} familii, ` +
        `${reports.challenges?.summary?.passed ?? '—'}/${reports.challenges?.summary?.checks ?? '—'} verificări`,
    },
    {
      id: 'full-test-suite',
      criterion: 'C3',
      command: inbox('tests').spec.label,
      exitCode: inbox('tests').exitCode,
      verdict: exitVerdict(inbox('tests').exitCode),
      figure: `${test.tests ?? '—'} teste, ${test.pass ?? '—'} trecute, ${test.fail ?? '—'} eșuate`,
    },
  ];

  const byId = new Map(checks.map((check) => [check.id, check]));
  const c1Failures = ['flow-v3', 'v1-suite', 'walking-segments', 'walking-save'].filter(
    (id) => byId.get(id).exitCode !== 0,
  );
  const c1 = Object.freeze({
    verdict: c1Failures.length === 0 ? 'PASS' : 'FAIL',
    basis:
      `${flow.summary.passed}/${flow.summary.cases} moduri (AUTO/MANUAL/LEARNING) trec lanțul real ` +
      `192→195→193→196→197→198 și ${flow.summary.seatedPassed}/${flow.summary.seatedCases} conduceri rămân ` +
      `cu o singură autoritate; fiecare mod se reia după ieșire (FOCUS+TAKE+RETURN) și personajul merge ` +
      `${flow.cases[0]?.walkedAfterM.toFixed(3) ?? '—'} m; 216 ${reports.v1?.summary?.pass ?? '—'}/${reports.v1?.summary?.rows ?? '—'} rânduri PASS cu ` +
      `${reports.v1?.xp?.losses ?? '—'} pierderi XP; 198 ${reports.walkingSegments?.summary?.scenariosPassed ?? '—'}/${reports.walkingSegments?.summary?.scenarios ?? '—'} scenarii; ` +
      `200 ${reports.walkingSave?.summary?.passed ?? '—'}/${reports.walkingSave?.summary?.checks ?? '—'} verificări de salvare/reload.`,
  });

  const c2Failures = ['digest-v3', 'parameter-gate'].filter((id) => byId.get(id).exitCode !== 0);
  const c2 = Object.freeze({
    verdict: c2Failures.length === 0 ? 'PASS' : 'FAIL',
    basis:
      `${digest.summary.identical}/${digest.summary.entries} digeste SHA-256 identice după ` +
      `${digest.walking.ticks} tick-uri de mers (${digest.walking.distanceM.toFixed(2)} m) și după reload 200: ` +
      `catalog 092 (fișier + registru), capabilități 187, KPI 209 (${digest.bundle.kpiDays} ${digest.bundle.kpiDays === 1 ? 'zi' : 'zile'}), ledger 209 ` +
      `(${digest.bundle.ledgerSettlements} decontări), XP 213 (${digest.bundle.xpEntries} intrări, ${digest.reload.xpBalance} XP / nivel ${digest.reload.level}), ` +
      `daily 211 și sesiunea 135; reload ACCEPTED, checksum verificat, 0 corpuri create, al doilea reload identic. ` +
      `187: ${reports.parameters?.keys?.length ?? '—'} chei, ${reports.parameters?.findings?.length ?? '—'} findings.`,
  });

  const hardware = gateFresh.rows?.find((row) => row.id === 'fps-hardware');
  const fpsVerdict =
    hardware?.verdict === 'PASS' ? 'PASS' : hardware?.verdict === 'FAIL' ? 'FAIL' : 'NOT_RUN';
  const c3Failures = [
    'simulation-budget',
    'render-budget',
    'soak-report',
    'performance-gate',
    'compatibility',
    'challenges-v2',
    'full-test-suite',
  ].filter((id) => byId.get(id).exitCode !== 0);
  const c3Verdict = !baseline.unmodified
    ? 'FAIL'
    : c3Failures.length > 0 || gateFresh.summary?.structural === 'FAIL'
      ? 'FAIL'
      : fpsVerdict === 'PASS' &&
          reports.render?.summary?.fail === 0 &&
          reports.render?.summary?.notMeasured === 0
        ? 'PASS'
        : 'NOT_RUN';
  const c3 = Object.freeze({
    verdict: c3Verdict,
    basis:
      `Contractul 25 reexecutat pe workload-ul \`${workloadVersion}\`: 158 ${reports.simulation?.verdicts?.overall ?? '—'}, ` +
      `157 ${reports.render?.summary?.gate ?? '—'} (${reports.render?.summary?.pass ?? '—'} PASS / ${reports.render?.summary?.notMeasured ?? '—'} NOT_MEASURED), ` +
      `159 ${reports.soak?.verdict?.status ?? '—'}, 224 structural ${gateFresh.summary?.structural ?? '—'}, ` +
      `154 ${reports.compat?.summary?.pass ?? '—'}/${reports.compat?.summary?.rows ?? '—'} combinații. ` +
      `Manifest ${baseline.budgetVersion} ${baseline.unmodified ? 'nemodificat' : 'MODIFICAT'} (SHA-256 ${baseline.unmodified ? 'identic cu HEAD' : 'diferit de HEAD'}). ` +
      `FPS/frame pe GPU real rămâne NOT_RUN (fps-hardware ${hardware?.verdict ?? 'lipsă'}): cei ${reports.render?.summary?.notMeasured ?? '—'} pași vizuali NOT_MEASURED cer renderer real.`,
  });

  const criteria = [
    Object.freeze({
      id: 'C1',
      title: 'Toate fluxurile manual/AUTO funcționează și după intrare/ieșire',
      verdict: c1.verdict,
      basis: c1.basis,
      commands: ['flow-v3', 'v1-suite', 'walking-segments', 'walking-save'],
    }),
    Object.freeze({
      id: 'C2',
      title: 'Catalogul și indicatorii nu sunt alterați de mers',
      verdict: c2.verdict,
      basis: c2.basis,
      commands: ['digest-v3', 'parameter-gate'],
    }),
    Object.freeze({
      id: 'C3',
      title:
        'Cele trei moduri, personajul și streamingul vizual trec contractul 25; workload/bugete V3 explicit versionate',
      verdict: c3.verdict,
      basis: c3.basis,
      commands: [
        'simulation-budget',
        'render-budget',
        'soak-report',
        'performance-gate',
        'compatibility',
        'challenges-v2',
        'full-test-suite',
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
    release: 'V3',
    inheritsBudgetVersion: baseline.budgetVersion,
    definition: Object.freeze({
      character: Object.freeze({
        entities: 1,
        contracts: contracts.length,
        source: 'Docs/Evidence/191-v3-character/report.json … 200-v3-walking-save/report.json',
      }),
      v3Contracts: Object.freeze(contracts),
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
      budgets: Object.freeze({
        desktop: manifest.proposedBudgets?.desktop ?? null,
        decodeTransfer: Object.freeze({
          simulationToActiveWallTimeMinimum:
            manifest.proposedBudgets?.simulationToActiveWallTimeMinimum ?? null,
          segmentCloseToProfileActivationP95Ms:
            manifest.proposedBudgets?.segmentCloseToProfileActivationP95Ms ?? null,
        }),
        source: `${pathOf(manifestFile)} proposedBudgets`,
        status: 'inherited unchanged from versioned manifest; no V3 threshold added',
      }),
    }),
    functionalEvidence: Object.freeze([
      'flow-v3',
      'walking-segments',
      'walking-save',
      'parameter-gate',
      'challenges-v2',
    ]),
    timing: Object.freeze({
      verdict: 'NOT_RUN',
      reason:
        `Harness-ul de performanță (155/156/158/220/224) exprimă flota și civilii; nu are fixture cu personaj, ` +
        `pietoni sau pericole. Măsurarea frame/simulare pe \`${workloadVersion}\` cere o pagină de harness cu GPU real, ` +
        `care nu există în ownership-ul acestui PBI. Cifrele de FPS/tick pentru V3 nu sunt inventate.`,
    }),
  });

  const notRun = Object.freeze([
    Object.freeze({
      id: 'hardware-fps-v3',
      owner: '224 / operator cu GPU real',
      reason:
        `fps-hardware = ${hardware?.verdict ?? 'lipsă'}: capturile hardware 220 sunt pe alt build, iar pragurile absolute cer ` +
        'aceeași revizie. Fără o sesiune Chrome/Babylon pe GPU real, pe ambele backenduri, FPS și frame p95/p99 rămân deschise.',
    }),
    Object.freeze({
      id: 'harness-v3-timing',
      owner: '220 / 224',
      reason:
        'Workload-ul 201-workload-v3-1 este definit și dovedit funcțional, dar nu are probe de timp: harness-ul 155/156/158/220 ' +
        'nu cunoaște personajul, pietonii sau pericolele.',
    }),
    Object.freeze({
      id: 'visual-streaming-257',
      owner: '157 / 223',
      reason:
        `157 raportează ${reports.render?.summary?.notMeasured ?? '—'} pași NOT_MEASURED pentru streamingul vizual; ei cer un renderer ` +
        'real, nu doar probe structurale. Gate-ul de release rămâne deschis.',
    }),
    Object.freeze({
      id: 'soak-v3',
      owner: '159 / 224',
      reason:
        'Soak-ul de 60 de minute este citit din măsurătoarea comisă 159/224, nu reexecutat aici; nu are variantă cu personaj, ' +
        'pietoni și pericole.',
    }),
    Object.freeze({
      id: 'playtest-human',
      owner: '235 / 216',
      reason:
        'Playtestul uman (rândul C3 al regresiei 216) rămâne NOT_RUN: cere jucători reali și nu este înlocuit de scenarii deterministe.',
    }),
  ]);

  const findings = Object.freeze(
    [
      gateFresh.summary?.release === 'NOT_VALIDATED'
        ? Object.freeze({
            id: 'gate-release-open',
            owner: '224 / operator',
            detail:
              'Gate-ul reexecutat raportează structural PASS, dar release NOT_VALIDATED; dovada comisă a lui 224 nu este suprascrisă.',
          })
        : null,
      reports.render?.summary?.notMeasured > 0
        ? Object.freeze({
            id: 'render-not-measured',
            owner: '157 / 223',
            detail: `${reports.render.summary.notMeasured} pași de streaming vizual nu au măsurătoare; gate-ul lor rămâne deschis.`,
          })
        : null,
    ].filter((entry) => entry !== null),
  );

  const limitations = Object.freeze([
    'Suitele V3 rulează headless, în Node, fără renderer, GPU sau input uman; ele dovedesc contractele, nu FPS, frame p95/p99 sau latența.',
    'Workload-ul 201-workload-v3-1 este dovedit funcțional, nu ca timp de execuție; harness-ul nu are fixture cu personaj, pietoni sau pericole.',
    'Soak-ul de 60 de minute este citit din măsurătoarea comisă 159/224, nu reexecutat; o rulare reală durează o oră și aparține gate-ului complet.',
    'Capturile hardware 220 sunt pe alt build decât revizia curentă; pragurile absolute cer aceeași revizie, deci FPS rămâne NOT_VALIDATED.',
    'Raportul nu include commitul HEAD, ca `--check` să rămână valabil după commit; proveniența intrărilor este dată de SHA-256.',
  ]);

  const inputs = [];
  for (const file of new Set([
    pathOf(manifestFile),
    ...Object.values(evidenceFiles),
    ...v3Contracts,
  ])) {
    const bytes = await readFile(join(root, file));
    inputs.push(Object.freeze({ file, sha256: sha256(bytes) }));
  }

  const report = Object.freeze({
    schemaVersion: 1,
    pbi: '201',
    generatedBy: 'npm run qa:v3-validation',
    command: 'npm run qa:v3-validation',
    workload,
    baseline,
    criteria,
    checks,
    flow,
    digest,
    findings,
    notRun,
    limitations,
    inputs,
    totals,
  });

  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = render(report);
  if (wantsCheck) {
    const savedJson = await readFile(reportJson, 'utf8').catch(() => null);
    if (savedJson !== json) {
      console.error(`Raportul V3 este învechit: ${pathOf(reportJson)}`);
      process.exitCode = 1;
    } else console.log(`Raportul V3 este curent: ${pathOf(reportJson)}`);
    const savedMarkdown = await readFile(reportMarkdown, 'utf8').catch(() => null);
    if (savedMarkdown !== markdown) {
      console.error(`Markdown-ul V3 este învechit: ${pathOf(reportMarkdown)}`);
      process.exitCode = 1;
    } else console.log(`Markdown-ul V3 este curent: ${pathOf(reportMarkdown)}`);
  } else {
    await writeFile(reportJson, json);
    await writeFile(reportMarkdown, markdown);
    console.log(`Scris ${pathOf(reportJson)}`);
    console.log(`Scris ${pathOf(reportMarkdown)}`);
  }
  console.log(
    `SUMMARY criterii ${totals.pass} PASS, ${totals.fail} FAIL, ${totals.notRun} NOT_RUN; ` +
      `moduri ${flow.summary.passed}/${flow.summary.cases}; digeste ${digest.summary.identical}/${digest.summary.entries}; ` +
      `workload ${workloadVersion}; baseline ${baseline.unmodified ? 'nemodificat' : 'MODIFICAT'}`,
  );
  if (totals.fail > 0) process.exitCode = 1;
} finally {
  if (wantsCheck) await rm(gateTemporary, { recursive: true, force: true });
}

function render(report) {
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
  const flowRows = report.flow.cases
    .map(
      (entry) =>
        `| \`${entry.id}\` | ${entry.verdict} | ${entry.ticks} | ${entry.walkedAfterM.toFixed(3)} | ${entry.reentry} | ` +
        `${entry.counters.closedManual}/${entry.counters.closedLearning}/${entry.counters.candidates} | ` +
        `${entry.authority.transitions} | ${entry.authority.delivered.CHARACTER}/${entry.authority.delivered.VEHICLE} |`,
    )
    .join('\n');
  const seatedRows = report.flow.seated
    .map(
      (entry) =>
        `| \`${entry.mode}\` | ${entry.verdict} | ${entry.ticks} | ${entry.vehicleCommands} | ${entry.characterCommands} | ${entry.inactiveRefusals} | ${entry.walkerTicks} |`,
    )
    .join('\n');
  const digestRows = report.digest.digests
    .map(
      (entry) =>
        `| \`${entry.id}\` | ${cell(entry.source)} | \`${entry.before.slice(0, 16)}…\` | ${entry.identicalAfterWalks ? 'DA' : 'NU'} | ${entry.identicalAfterReload ? 'DA' : 'NU'} |`,
    )
    .join('\n');
  const contracts = report.workload.definition.v3Contracts
    .map((entry) => `| \`${entry.contract ?? '—'}\` | \`${entry.evidence}\` |`)
    .join('\n');
  const workload = report.workload.definition;
  const notRun = report.notRun
    .map((entry) => `- **${entry.id}** (owner ${entry.owner}): ${entry.reason}`)
    .join('\n');
  const findings =
    report.findings.length === 0
      ? '- Niciuna: toate probele executate au trecut.'
      : report.findings
          .map((entry) => `- **${entry.id}** (owner ${entry.owner}): ${entry.detail}`)
          .join('\n');
  const limitations = report.limitations.map((entry) => `- ${entry}`).join('\n');
  const inputs = report.inputs
    .map((entry) => `| \`${entry.file}\` | \`${entry.sha256}\` |`)
    .join('\n');
  return `# 201 — validare integrală V3

Transcript determinist generat de \`${report.generatedBy}\`; verificarea este \`npm run qa:v3-validation -- --check\`.
Machine-readable: [report.json](report.json). Măsurătoarea gate-ului reexecutat: [gate-measure/report.json](gate-measure/report.json).
Workload versionat: \`${report.workload.id}\`.

## Verdictele pe criterii

| Criteriu | Enunț | Verdict | Baza reală |
| --- | --- | --- | --- |
${criterionRows}

Total: **${report.totals.pass} PASS, ${report.totals.fail} FAIL, ${report.totals.notRun} NOT_RUN**. Un verdict \`NOT_RUN\` lasă gate-ul deschis și nu este raportat ca \`PASS\`.

## Matricea executată: criteriu → comandă → exit code → verdict → cifră

| Criteriu | Comandă | Exit | Verdict | Cifră / dovadă |
| --- | --- | ---: | --- | --- |
${checkRows}

## Criteriul 1 — lanțul real, pe fiecare mod

Fiecare rând pornește de la un walker 192 real, intră prin 195, trece prin 193 pe VEHICLE, iese prin 196,
se reia prin 197 FOCUS+TAKE și se închide prin 198. „Închise M/L/cand" numără segmentele MANUAL, LEARNING
și candidații 069.

| Mod | Verdict | Tick-uri | Mers după ieșire (m) | Re-intrare | Închise M/L/cand | Tranziții 193 | Comenzi C/V |
| --- | --- | ---: | ---: | --- | --- | ---: | --- |
${flowRows}

Conducerea lungă (193 + 194, fără 198) dovedește că inputul rămâne singular cât timp corpul este suspendat:

| Mod | Verdict | Tick-uri | Comenzi vehicul | Comenzi personaj | Refuzuri consumator inactiv | Tick-uri walker |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
${seatedRows}

## Criteriul 2 — digeste înainte / după mers / după reload 200

${report.digest.walking.ticks} tick-uri de mers real, ${report.digest.walking.distanceM.toFixed(2)} m; apoi arhiva v2 este migrată la v3 prin 200,
citită strict și reluată. Fiecare digest este SHA-256 peste octeții canonici.

| Digest | Sursă | Înainte | După mers | După reload |
| --- | --- | --- | --- | --- |
${digestRows}

Reload: **${report.digest.reload.status}**, checksum **${report.digest.read.checksumVerified ? 'verificat' : 'neprobat'}**, autoritate
\`${report.digest.reload.authority}\`, cameră \`${report.digest.reload.cameraEntityId}\`, ${report.digest.reload.entities} entități
(${report.digest.reload.characters} personaj + ${report.digest.reload.vehicles} vehicule), **${report.digest.reload.created}** corpuri create,
XP **${report.digest.reload.xpBalance}** / nivel ${report.digest.reload.level}, ${report.digest.reload.dailyRewards} ${report.digest.reload.dailyRewards === 1 ? 'recompensă daily' : 'recompense daily'},
${report.digest.reload.settlements} decontări, ${report.digest.reload.neutralizedKeys} ${report.digest.reload.neutralizedKeys === 1 ? 'tastă neutralizată' : 'taste neutralizate'}. Al doilea reload are același digest:
**${report.digest.reload.secondReadSameDigest ? 'DA' : 'NU'}**.

## Workload V3 versionat — \`${report.workload.id}\`

| Componentă | Valoare | Sursă |
| --- | ---: | --- |
| Personaj | ${workload.character.entities} entitate, ${workload.character.contracts} contracte 191–200 | ${workload.character.source} |
| Flotă | ${workload.fleet.taxis} taxiuri / ${workload.fleet.civilians} civili | ${workload.fleet.source} |
| Pietoni | ${workload.pedestrians.entities} entități, ${workload.pedestrians.crosswalks} treceri, ${workload.pedestrians.scenarios} scenarii | ${workload.pedestrians.source} |
| Pericole | ${workload.hazards.obstacles} obstacole, ${workload.hazards.stimuli} stimuli, ${workload.hazards.scenarios} scenarii | ${workload.hazards.source} |
| Catalog | ${workload.catalog.keys} chei, ${workload.catalog.findings} findings | ${workload.catalog.source} |
| Provocări | ${workload.challenges.count} provocări în ${workload.challenges.families} familii, ${workload.challenges.checks} verificări | ${workload.challenges.source} |
| Bugete | moștenite nemodificat din \`${report.workload.inheritsBudgetVersion}\` | ${workload.budgets.source} |

Contractele V3, fiecare citit din raportul propriu:

| Contract | Dovezi |
| --- | --- |
${contracts}

Măsurarea de timp pe acest workload este **${report.workload.timing.verdict}**: ${report.workload.timing.reason}

## Baseline-ul nu este relaxat

| Indicator | Valoare |
| --- | --- |
| Fișier | \`${report.baseline.file}\` |
| Versiune bugete | \`${report.baseline.budgetVersion}\` |
| \`status\` | \`${report.baseline.status}\` |
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

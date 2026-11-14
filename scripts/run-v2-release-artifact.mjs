import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 190 — artefactul de release V2.
 *
 * O singură comandă derivează artefactul celor 80 de parametri, notele de compatibilitate și
 * checklist-ul de release. Nimic nu este scris de mână: fiecare rând al artefactului provine din
 * catalogul de date (`Docs/driving-parameters.json`), din tabelul de capabilități
 * (`src/profiles/parameter-capabilities.ts`) și din dovezile comise ale grupurilor 167–186, iar
 * fiecare afirmație de compatibilitate are o referință la dovada care o susține.
 *
 * Regula de onestitate a release-ului:
 * - cele 56 de chei `extension` sunt certificate de poarta 187, dar încă rezervate de etapa de plan
 *   (`KEY_EXTENSION_STAGE`, `reservedParameters`), deci artefactul nu le prezintă ca livrabile
 *   end-to-end;
 * - un rând `NOT_RUN` nu este promovat la `PASS`: FPS-ul pe hardware, harness-ul V2, soak-ul V2,
 *   playtestul uman și re-măsurarea 224 rămân deschise, cu owner numit;
 * - un rând fără dovadă comisă nu poate primi `PASS`.
 *
 * Rulare implicită: scrie `parameter-artifact.json/md`, `compatibility-notes.json/md` și
 * `release-checklist.json/md` în `Docs/Evidence/190-v2-release/`. `--check` regenerează tot în
 * memorie și compară byte cu byte, fără timestamp-uri în conținutul comparat.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDirectory = join(root, 'Docs', 'Evidence', '190-v2-release');
mkdirSync(evidenceDirectory, { recursive: true });
const catalogPath = 'Docs/driving-parameters.json';
const gateReportPath = 'Docs/Evidence/187-v2-parameter-gate/report.json';
const challengesReportPath = 'Docs/Evidence/188-v2-challenges/report.json';
const regressionReportPath = 'Docs/Evidence/189-v2-regression/report.json';
const v1RegressionReportPath = 'Docs/Evidence/216-v1-regression/report.json';
const performanceGatePath = 'Docs/Evidence/224-performance-gate/report.json';
const compatReportPath = 'Docs/Evidence/154-compat-matrix/report.json';
const v1ChecklistPath = 'Docs/Evidence/162-release-v1/checklist.json';
const exportReportPath = 'Docs/Evidence/133-export-profile/report.json';
const importReportPath = 'Docs/Evidence/134-import-profile/report.json';
const e2eReportPath = 'Docs/Evidence/152-e2e-session/report.json';
const pedestriansReportPath = 'Docs/Evidence/164-pedestrians/report.json';
const hazardsReportPath = 'Docs/Evidence/165-hazards/report.json';
const registryDocPath = 'Docs/parameter-registry.md';
const catalogDocPath = 'Docs/11-catalog-parametri.md';

/** Lanțul V2 încheiat de acest release: 163 (contexte) până la 189 (regresii). */
const v2Chain = Object.freeze(Array.from({ length: 27 }, (_, index) => String(163 + index)));

const profiles = await import(pathToFileURL(join(root, 'src', 'profiles', 'index.ts')).href);
const capabilities = await import(
  pathToFileURL(join(root, 'src', 'profiles', 'parameter-capabilities.ts')).href
);

const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const exists = (path) => existsSync(join(root, path));
const readText = (path) => readFileSync(join(root, path), 'utf8');

function formatNumber(value) {
  if (!Number.isFinite(value)) return String(value);
  const rounded = Number(value.toFixed(6));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function oneLine(text) {
  return String(text ?? '')
    .replaceAll('\r', ' ')
    .replaceAll('\n', ' ')
    .replaceAll('|', '\\|')
    .trim();
}

function table(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ];
}

function code(value) {
  return `\`${oneLine(value)}\``;
}

// ---------------------------------------------------------------------------------------------
// 1. Catalogul și tabelul de capabilități: singurele surse pentru cele 80 de chei.
// ---------------------------------------------------------------------------------------------

const catalog = readJson(catalogPath);
const definitions = profiles.parseParameterCatalog(catalog);
const gateReport = readJson(gateReportPath);
const challengesReport = readJson(challengesReportPath);
const regressionReport = readJson(regressionReportPath);
const v1RegressionReport = readJson(v1RegressionReportPath);
const performanceGate = readJson(performanceGatePath);
const compatReport = readJson(compatReportPath);
const v1Checklist = readJson(v1ChecklistPath);
const exportReport = readJson(exportReportPath);
const importReport = readJson(importReportPath);
const e2eReport = readJson(e2eReportPath);
const pedestriansReport = readJson(pedestriansReportPath);
const hazardsReport = readJson(hazardsReportPath);

const exportCache = new Map();
async function moduleExports(modulePath, symbol) {
  const cacheKey = `${modulePath}#${symbol}`;
  if (!exportCache.has(cacheKey)) {
    let exported = false;
    if (exists(modulePath)) {
      const module = await import(pathToFileURL(join(root, modulePath)).href);
      exported = Object.hasOwn(module, symbol);
    }
    exportCache.set(cacheKey, exported);
  }
  return exportCache.get(cacheKey);
}

const uniqueSymbols = new Map();
for (const capability of capabilities.parameterCapabilities) {
  for (const declaration of [capability.policy, capability.estimator]) {
    if (declaration === null) continue;
    uniqueSymbols.set(`${declaration.module}#${declaration.symbol}`, declaration);
  }
}
for (const declaration of uniqueSymbols.values()) {
  await moduleExports(declaration.module, declaration.symbol);
}

/** Aceeași sondă fail-closed ca poarta 187: artefactul nu poate fi construit peste declarații goale. */
const probe = {
  moduleExports: (modulePath, symbol) => exportCache.get(`${modulePath}#${symbol}`) === true,
  pathExists: exists,
  fileContains: (path, text) => readText(path).includes(text),
  readJson,
};

const derived = profiles.parameterDefinitions.map((definition) => ({
  key: definition.key,
  implemented: definition.implemented,
  estimable: definition.estimable,
}));

const gate = capabilities.evaluateParameterGate({
  definitions: definitions.map((definition) => ({
    key: definition.key,
    unit: definition.unit,
    sourceUnit: definition.sourceUnit,
  })),
  capabilities: capabilities.parameterCapabilities,
  probe,
  derived,
});

const gateKeyByKey = new Map(gate.keys.map((entry) => [entry.key, entry]));
const conventionsByKey = new Map();
for (const convention of gate.conventions) {
  for (const key of convention.keys) {
    const ids = conventionsByKey.get(key) ?? [];
    ids.push(convention.id);
    conventionsByKey.set(key, ids);
  }
}

// ---------------------------------------------------------------------------------------------
// 2. Provocările 188: singura dovadă că o cheie V2 este livrată în joc.
// ---------------------------------------------------------------------------------------------

const challengesByLearningKey = new Map();
for (const challenge of challengesReport.challenges ?? []) {
  const ids = challengesByLearningKey.get(challenge.learningKey) ?? [];
  ids.push(challenge.challengeId);
  challengesByLearningKey.set(challenge.learningKey, ids);
}
const coveredFromRows = [...challengesByLearningKey.keys()].sort();
const declaredCovered = Number(challengesReport.learningKeys?.covered ?? NaN);
const declaredUncovered = (challengesReport.learningKeys?.uncovered ?? []).length;

/**
 * Demonstrația transferului stilului extins. Pentru fiecare dintre cele zece familii V2 se citește
 * valoarea candidată reală a estimatorului (raportul de învățare) și efectul măsurat al politicii
 * (raportul de politică); transferul se oprește la etapa de plan, unde cheia este rezervată.
 */
const styleFamilies = Object.freeze([
  {
    id: 'speed',
    label: 'Viteză și ritm',
    learning: 'Docs/Evidence/168-v2-speed-learning/report.json',
    policy: 'Docs/Evidence/167-v2-speed-policy/report.json',
    key: 'speed_delta_arterial',
  },
  {
    id: 'accel',
    label: 'Accelerație și frânare',
    learning: 'Docs/Evidence/170-v2-accel-learning/report.json',
    policy: 'Docs/Evidence/169-v2-accel-policy/report.json',
    key: 'braking_jerk',
  },
  {
    id: 'follow',
    label: 'Urmărire și distanțe',
    learning: 'Docs/Evidence/172-v2-follow-learning/report.json',
    policy: 'Docs/Evidence/171-v2-follow-policy/report.json',
    key: 'cutin_brake_response',
  },
  {
    id: 'signal',
    label: 'Semafoare',
    learning: 'Docs/Evidence/174-v2-signal-learning/report.json',
    policy: 'Docs/Evidence/173-v2-signal-policy/report.json',
    key: 'yellow_stop_probability',
  },
  {
    id: 'stop',
    label: 'STOP și prioritate',
    learning: 'Docs/Evidence/176-v2-stop-learning/report.json',
    policy: 'Docs/Evidence/175-v2-stop-policy/report.json',
    key: 'rolling_stop_speed',
  },
  {
    id: 'lane',
    label: 'Schimbare de bandă și depășire',
    learning: 'Docs/Evidence/178-v2-lane-learning/report.json',
    policy: 'Docs/Evidence/177-v2-lane-policy/report.json',
    key: 'lane_change_duration',
  },
  {
    id: 'lateral',
    label: 'Control lateral și viraje',
    learning: 'Docs/Evidence/180-v2-lateral-learning/report.json',
    policy: 'Docs/Evidence/179-v2-lateral-policy/report.json',
    key: 'turn_entry_speed',
  },
  {
    id: 'route',
    label: 'Trasee și recuperare',
    learning: 'Docs/Evidence/182-v2-route-learning/report.json',
    policy: 'Docs/Evidence/181-v2-route-policy/report.json',
    key: 'route_time_weight',
  },
  {
    id: 'hazard',
    label: 'Pietoni și pericole',
    learning: 'Docs/Evidence/184-v2-hazard-learning/report.json',
    policy: 'Docs/Evidence/183-v2-hazard-policy/report.json',
    key: 'pedestrian_yield_probability',
  },
  {
    id: 'pickup',
    label: 'Pickup și confortul pasagerilor',
    learning: 'Docs/Evidence/186-v2-pickup-learning/report.json',
    policy: 'Docs/Evidence/185-v2-pickup-policy/report.json',
    key: 'pickup_stop_precision',
  },
]);

const styleTransfer = styleFamilies.map((family) => {
  const learningReport = readJson(family.learning);
  const policyReport = readJson(family.policy);
  const candidateRow =
    (learningReport.rows ?? []).find((row) => row.key === family.key) ??
    (learningReport.rows ?? []).find((row) => row.status === 'CANDIDATE') ??
    null;
  const effectRow =
    (policyReport.effects ?? []).find((row) => row.key === candidateRow?.key) ?? null;
  const reserved = candidateRow !== null && profiles.isReservedParameterKey(candidateRow.key);
  return Object.freeze({
    family: family.id,
    label: family.label,
    key: candidateRow?.key ?? family.key,
    learningReport: family.learning,
    policyReport: family.policy,
    candidate:
      candidateRow === null
        ? null
        : Object.freeze({
            status: candidateRow.status,
            value: candidateRow.value,
            unit: candidateRow.unit,
            validationStatus: candidateRow.validationStatus ?? null,
          }),
    effect: effectRow === null ? null : Object.freeze({ ...effectRow }),
    challenges: Object.freeze(challengesByLearningKey.get(candidateRow?.key) ?? []),
    dispatch: Object.freeze({
      state: reserved ? 'BLOCKED_BY_PLAN_STAGE' : 'ALLOWED',
      code: reserved ? 'KEY_EXTENSION_STAGE' : null,
      reservedByPlanStage: reserved,
    }),
    verdict:
      candidateRow?.status === 'CANDIDATE' &&
      typeof candidateRow.value === 'number' &&
      effectRow !== null &&
      Math.abs(Number(effectRow.difference)) > 0
        ? 'DEMONSTRATED_TO_POLICY'
        : 'NOT_DEMONSTRATED',
  });
});

const styleTransferDemonstrated = styleTransfer.filter(
  (entry) => entry.verdict === 'DEMONSTRATED_TO_POLICY',
).length;

// ---------------------------------------------------------------------------------------------
// 3. Cele 80 de rânduri: categorie, unitate, interval, default, politică, estimator, convenție,
//    livrare în joc și limitarea care rămâne.
// ---------------------------------------------------------------------------------------------
const SUPPORT_CORE =
  'Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2.';
const SUPPORT_V2_CHALLENGE =
  'Certificată de 187 și demonstrată de o provocare 188, dar încă rezervată de etapa de plan: `candidate-validation` o refuză cu `KEY_EXTENSION_STAGE`, iar exportul o scrie `null` în `reservedParameters`. Nu este livrabilă end-to-end până la migrarea etapei.';
const SUPPORT_V2_NO_CHALLENGE =
  'Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end.';

const rows = definitions.map((definition, index) => {
  const capability = gateKeyByKey.get(definition.key);
  if (capability === undefined) {
    throw new Error(`Missing gate row for ${definition.key}`);
  }
  const reserved = profiles.isReservedParameterKey(definition.key);
  const challenges = challengesByLearningKey.get(definition.key) ?? [];
  const deliveryKind =
    definition.implementationStage === 'initial_learning_target'
      ? 'V1_POLICY'
      : challenges.length > 0
        ? 'CHALLENGE_188'
        : 'CERTIFIED_NO_CHALLENGE';
  const limitation =
    definition.implementationStage === 'initial_learning_target'
      ? SUPPORT_CORE
      : challenges.length > 0
        ? SUPPORT_V2_CHALLENGE
        : SUPPORT_V2_NO_CHALLENGE;
  return Object.freeze({
    index: index + 1,
    key: definition.key,
    category: definition.category,
    description: definition.description,
    stage: definition.implementationStage,
    unit: definition.unit,
    sourceUnit: definition.sourceUnit,
    min: definition.min,
    max: definition.max,
    default: definition.default,
    range: `${formatNumber(definition.min)}–${formatNumber(definition.max)} ${definition.sourceUnit}`,
    policy: capability.policy,
    estimator: capability.estimator,
    evidence: capability.evidence,
    test: capability.test,
    scenario: capability.scenario,
    effect: capability.effect,
    conventions: conventionsByKey.get(definition.key) ?? [],
    delivery: Object.freeze({
      kind: deliveryKind,
      challenges: Object.freeze(challenges),
      challengeCount: challenges.length,
    }),
    support: Object.freeze({
      certified: capability.policy !== null && capability.estimator !== null,
      reservedByPlanStage: reserved,
      usableEndToEnd: reserved
        ? false
        : capability.policy !== null && capability.estimator !== null,
      limitation,
    }),
  });
});

const coreRows = rows.filter((row) => row.stage === 'initial_learning_target');
const v2Rows = rows.filter((row) => row.stage === 'extension');
const reservedKeys = rows.filter((row) => row.support.reservedByPlanStage).map((row) => row.key);
const challengeRows = rows.filter((row) => row.delivery.challengeCount > 0);
const measuredRows = rows.filter((row) => row.effect.kind === 'MEASURED');
const preservedRows = rows.filter((row) => row.effect.kind === 'PRESERVED_M');

const artifactSummary = Object.freeze({
  keys: rows.length,
  core: coreRows.length,
  v2: v2Rows.length,
  policies: rows.filter((row) => row.policy !== null).length,
  estimators: rows.filter((row) => row.estimator !== null).length,
  noneEstimator: rows.filter((row) => row.estimator === null).length,
  measuredEffects: measuredRows.length,
  preservedMEffects: preservedRows.length,
  conventions: gate.conventions.length,
  challengeCovered: challengeRows.length,
  challengeUncovered: v2Rows.length - challengeRows.length,
  reservedByPlanStage: reservedKeys.length,
  usableEndToEnd: rows.filter((row) => row.support.usableEndToEnd).length,
  gateFindings: gate.findings.length,
});

// ---------------------------------------------------------------------------------------------
// 4. Notele de compatibilitate: fiecare afirmație are o referință la dovada care o susține.
// ---------------------------------------------------------------------------------------------

/**
 * O dovadă este un drum comis plus un detaliu derivat din fișier la generare. `contains` este un
 * literal care trebuie să existe în fișier, ca o afirmație despre cod să nu poată fi doar o promisiune.
 */
function evidenceEntry(path, detail, contains) {
  const present = exists(path);
  const literal = contains === undefined ? true : present && readText(path).includes(contains);
  return Object.freeze({
    path,
    detail,
    present,
    contains: contains ?? null,
    literalPresent: literal,
  });
}

const composed = challengesReport.compatibility?.composed ?? {};
const vehicleAccess = challengesReport.compatibility?.vehicleAccess ?? {};
const fullSuite = (regressionReport.checks ?? []).find((check) => check.id === 'full-test-suite');
const v1Suite = (regressionReport.checks ?? []).find((check) => check.id === 'v1-suite');
const v1TestFigure = (v1Checklist.criteria ?? []).find(
  (criterion) => criterion.id === 'tests',
)?.result;
const fpsRow = (performanceGate.rows ?? []).find((row) => row.id === 'fps-hardware');
const stalenessFinding = (regressionReport.findings ?? []).find(
  (finding) => finding.id === 'committed-gate-staleness',
);

const claims = [
  {
    id: 'player-challenges',
    kind: 'CHANGED',
    audience: 'jucător',
    statement: `Față de 0.3, jucătorul primește ${composed.extended ?? '?'} provocări extinse noi în ${challengesReport.families?.length ?? '?'} familii, publicate alături de cele ${composed.v1 ?? '?'} template-uri V1 într-un catalog compus de ${composed.total ?? '?'}.`,
    evidence: [
      evidenceEntry(
        challengesReportPath,
        `${challengesReport.summary?.checks ?? 0}/${challengesReport.summary?.checks ?? 0} verificări, ${challengesReport.challenges?.length ?? 0} provocări, catalog compus ${composed.total ?? '?'}`,
      ),
      evidenceEntry(
        'Docs/Evidence/188-v2-challenges/README.md',
        'tabelul provocare → familie → cheie → obiectiv observabil',
      ),
    ],
  },
  {
    id: 'player-world-pedestrians-hazards',
    kind: 'CHANGED',
    audience: 'jucător',
    statement: `Lumea are acum pietoni și pericole reale: ${pedestriansReport.summary?.pedestrians ?? '?'} pietoni pe ${pedestriansReport.fixture?.crosswalks ?? '?'} treceri (${pedestriansReport.summary?.scenarios ?? '?'} scenarii) și ${hazardsReport.summary?.stimuli ?? '?'} stimuli de pericol cu ${hazardsReport.summary?.scenarios ?? '?'} scenarii.`,
    evidence: [
      evidenceEntry(
        pedestriansReportPath,
        `${pedestriansReport.summary?.passed ?? 0}/${pedestriansReport.summary?.scenarios ?? 0} scenarii trecute, ${pedestriansReport.summary?.pedestrians ?? 0} pietoni`,
      ),
      evidenceEntry(
        hazardsReportPath,
        `${hazardsReport.summary?.passed ?? 0}/${hazardsReport.summary?.scenarios ?? 0} scenarii trecute, ${hazardsReport.summary?.reactions ?? 0} reacții`,
      ),
    ],
  },
  {
    id: 'integrator-policy-layers',
    kind: 'CHANGED',
    audience: 'integrator',
    statement: `Integratorul primește ${gateReport.capability?.v2 ?? '?'} straturi de politică V2, fiecare cu estimator, dovezi comise și test independent; poarta 187 certifică ${gateReport.capability?.declared ?? '?'}/${artifactSummary.keys} chei.`,
    evidence: [
      evidenceEntry(
        gateReportPath,
        `verdict ${gateReport.verdict}, ${gateReport.capability?.core ?? 0} CORE + ${gateReport.capability?.v2 ?? 0} V2, ${gateReport.findings?.length ?? 0} findings`,
      ),
      evidenceEntry(
        'src/profiles/parameter-capabilities.ts',
        'tabelul unic de capabilități, cu politică, estimator, dovezi și test per cheie',
      ),
    ],
  },
  {
    id: 'integrator-gate-command',
    kind: 'CHANGED',
    audience: 'integrator',
    statement: `Poarta este executabilă, nu declarativă: \`npm run validate:parameters\` derivă verdictul din catalog și din fișiere, iar \`--check\` refuză un raport neactualizat; ${gateReport.probes?.length ?? '?'} probe fail-closed sunt respinse la fiecare rulare.`,
    evidence: [
      evidenceEntry(
        gateReportPath,
        `${gateReport.checks?.filter((check) => check.passed).length ?? 0}/${gateReport.checks?.length ?? 0} verificări PASS, ${gateReport.probes?.filter((probe_entry) => probe_entry.passed).length ?? 0} probe respinse`,
      ),
      evidenceEntry(
        'scripts/run-v2-parameter-gate.mjs',
        'comanda porții și modul `--check`',
        '--check',
      ),
    ],
  },
  {
    id: 'integrator-test-suite',
    kind: 'CHANGED',
    audience: 'integrator',
    statement: `Suita completă crește de la V1 la V2: ${fullSuite?.figure ?? '?'} pe revizia 189, față de ${v1TestFigure ?? '?'} la checklist-ul V1 162.`,
    evidence: [
      evidenceEntry(regressionReportPath, fullSuite?.figure ?? 'suita completă lipsește'),
      evidenceEntry(v1ChecklistPath, v1TestFigure ?? 'cifra V1 lipsește'),
    ],
  },
  {
    id: 'new-extension-keys',
    kind: 'NEW',
    audience: 'ambii',
    statement: `Nou față de 0.3: ${artifactSummary.v2} chei de extensie certificate (V2) lângă cele ${artifactSummary.core} chei CORE, cu ${artifactSummary.policies} politici și ${artifactSummary.estimators} estimatori declarați, ${artifactSummary.noneEstimator} fără estimator.`,
    evidence: [
      evidenceEntry(
        'src/profiles/parameter-capabilities.ts',
        'tabelul cu 24 de intrări CORE și 56 V2',
        'v2Policy',
      ),
      evidenceEntry(
        gateReportPath,
        `${gateReport.capability?.measuredEffects ?? 0} efecte măsurate + ${gateReport.capability?.preservedMEffects ?? 0} consecințe M păstrate`,
      ),
    ],
  },
  {
    id: 'new-parameter-gate',
    kind: 'NEW',
    audience: 'integrator',
    statement:
      'Nou față de 0.3: poarta celor 80 de parametri, care cere pentru fiecare cheie consumator real în politică, estimator, dovezi și test cu titlul declarat; o cheie declarată fără consumator este respinsă.',
    evidence: [
      evidenceEntry(
        gateReportPath,
        `${gateReport.conventions?.length ?? 0} convenții canonice, ${gateReport.findings?.length ?? 0} findings`,
      ),
      evidenceEntry(
        'Docs/Evidence/187-v2-parameter-gate/README.md',
        'probele negative și convențiile ambiguităților',
        'policy-consumer-missing',
      ),
    ],
  },
  {
    id: 'new-v2-workload',
    kind: 'NEW',
    audience: 'integrator',
    statement: `Nou față de 0.3: workload-ul V2 versionat \`${regressionReport.workload?.id ?? '?'}\` compune ${regressionReport.workload?.definition?.fleet?.taxis ?? '?'} taxiuri și ${regressionReport.workload?.definition?.fleet?.civilians ?? '?'} civili, ${regressionReport.workload?.definition?.pedestrians?.entities ?? '?'} pietoni, ${regressionReport.workload?.definition?.hazards?.obstacles ?? '?'} obstacole, catalogul de ${regressionReport.workload?.definition?.catalog?.keys ?? '?'} chei și ${regressionReport.workload?.definition?.challenges?.count ?? '?'} provocări.`,
    evidence: [
      evidenceEntry(
        regressionReportPath,
        `timing ${regressionReport.workload?.timing?.verdict ?? '?'}; ${regressionReport.workload?.functionalEvidence?.length ?? 0} dovezi funcționale reexecutate`,
      ),
    ],
  },
  {
    id: 'identical-v1-progress',
    kind: 'IDENTICAL',
    audience: 'jucător',
    statement: `Progresul V1 rămâne identic: ${v1RegressionReport.summary?.pass ?? '?'} rânduri PASS din ${v1RegressionReport.summary?.rows ?? '?'} (${v1RegressionReport.summary?.notRun ?? 0} NOT_RUN declarate), ${v1RegressionReport.summary?.fail ?? 0} eșecuri, pierderi XP 0; importul de progres al lui 188 dă același digest înainte/după${challengesReport.compatibility?.v1ProgressDigest === undefined ? '' : ` (${challengesReport.compatibility.v1ProgressDigest})`}, cu ${challengesReport.compatibility?.profileWrites ?? '?'} scrieri de profil.`,
    evidence: [
      evidenceEntry(
        v1RegressionReportPath,
        `${v1RegressionReport.summary?.pass ?? 0}/${v1RegressionReport.summary?.rows ?? 0} PASS`,
      ),
      evidenceEntry(regressionReportPath, v1Suite?.figure ?? 'rândul C1 lipsește'),
      evidenceEntry(
        challengesReportPath,
        `beforeAfterEqual ${challengesReport.compatibility?.beforeAfterEqual}, profileWrites ${challengesReport.compatibility?.profileWrites}`,
      ),
    ],
  },
  {
    id: 'identical-vehicle-access',
    kind: 'IDENTICAL',
    audience: 'jucător',
    statement: `Accesul la vehicule rămâne identic: ${vehicleAccess.vehiclesDriveable ?? '?'}/${vehicleAccess.vehicles ?? '?'} vehicule conduse, ${vehicleAccess.taxisSelectable ?? '?'}/${vehicleAccess.taxis ?? '?'} taxiuri selectabile, ${vehicleAccess.revoked ?? '?'} revocări și ${vehicleAccess.blockedTaxis ?? '?'} taxiuri blocate, cu digestul ${challengesReport.compatibility?.v1AccessDigest ?? '?'}.`,
    evidence: [
      evidenceEntry(
        challengesReportPath,
        `v1AccessDigest ${challengesReport.compatibility?.v1AccessDigest ?? '?'}`,
      ),
      evidenceEntry(
        'Docs/Evidence/188-v2-challenges/README.md',
        'instantaneul accesului la vehicule înainte/după',
      ),
    ],
  },
  {
    id: 'identical-save-agreements',
    kind: 'IDENTICAL',
    audience: 'ambii',
    statement: `Acordurile de salvare rămân identice: exportul și importul trec ${exportReport.summary?.passed ?? '?'}/${exportReport.summary?.checks ?? '?'}, respectiv ${importReport.summary?.passed ?? '?'}/${importReport.summary?.checks ?? '?'} verificări, păstrează ${importReport.validation?.reservedParameters ?? '?'} chei rezervate cu valoarea \`null\`, iar restartul sesiunii re-citește aceleași documente în ${e2eReport.summary?.checks ?? '?'} verificări.`,
    evidence: [
      evidenceEntry(
        exportReportPath,
        `${exportReport.summary?.passed ?? 0}/${exportReport.summary?.checks ?? 0} verificări`,
      ),
      evidenceEntry(
        importReportPath,
        `${importReport.summary?.passed ?? 0}/${importReport.summary?.checks ?? 0} verificări, ${importReport.validation?.reservedParameters ?? 0} chei rezervate`,
      ),
      evidenceEntry(
        e2eReportPath,
        `${e2eReport.summary?.steps ?? 0} pași, ${e2eReport.summary?.checks ?? 0} verificări`,
      ),
    ],
  },
  {
    id: 'open-reserved-56',
    kind: 'OPEN',
    audience: 'ambii',
    statement: `Cele ${artifactSummary.v2} chei extinse sunt certificate, dar încă rezervate de etapa de plan: \`candidate-validation\` le refuză cu \`KEY_EXTENSION_STAGE\`, iar exportul le scrie în \`reservedParameters\`; certificarea 187 nu le face livrabile end-to-end.`,
    evidence: [
      evidenceEntry(
        'src/learning/candidate-validation.ts',
        'refuzul cheilor de extensie la validarea candidaților',
        'KEY_EXTENSION_STAGE',
      ),
      evidenceEntry(
        'src/persistence/profile-export.ts',
        'cheile rezervate publicate cu valoarea null',
        'reservedParameters',
      ),
      evidenceEntry(
        'Docs/Evidence/187-v2-parameter-gate/README.md',
        'limitarea declarată de poartă',
        'KEY_EXTENSION_STAGE',
      ),
    ],
  },
  {
    id: 'open-challenge-coverage',
    kind: 'OPEN',
    audience: 'jucător',
    statement: `Provocările 188 acoperă ${challengesReport.learningKeys?.covered ?? '?'} din ${challengesReport.learningKeys?.extended ?? '?'} chei V2; ${declaredUncovered} rămân fără o provocare dedicată, deci nu au încă o demonstrație de joc.`,
    evidence: [
      evidenceEntry(
        challengesReportPath,
        `${declaredCovered} chei acoperite, ${declaredUncovered} neacoperite`,
      ),
      evidenceEntry(
        'Docs/Evidence/188-v2-challenges/README.md',
        'lista cheilor neacoperite',
        'Limitări',
      ),
    ],
  },
  {
    id: 'open-performance-v2',
    kind: 'OPEN',
    audience: 'ambii',
    statement: `Performanța V2 rămâne \`NOT_RUN\`: FPS-ul pe hardware este \`${fpsRow?.verdict ?? '?'}\`, harness-ul de performanță nu are fixture cu pietoni și pericole (${regressionReport.workload?.timing?.verdict ?? '?'}), iar soak-ul V2 nu are variantă cu acel workload.`,
    evidence: [
      evidenceEntry(
        regressionReportPath,
        `${regressionReport.notRun?.length ?? 0} rânduri NOT_RUN declarate`,
      ),
      evidenceEntry(
        performanceGatePath,
        `${performanceGate.summary?.pass ?? 0} PASS, ${performanceGate.summary?.fail ?? 0} FAIL, ${performanceGate.summary?.notValidated ?? 0} NOT_VALIDATED; release ${performanceGate.summary?.release}`,
      ),
      evidenceEntry(
        'Docs/Evidence/189-v2-regression/README.md',
        'harness-ul existent nu poate exprima workload-ul V2',
        'referințe la pietoni',
      ),
    ],
  },
];

for (const claim of claims) {
  claim.supported = claim.evidence.every((entry) => entry.present && entry.literalPresent);
}

// ---------------------------------------------------------------------------------------------
// 5. Dependențele V2: fiecare PBI al lanțului 163–189 trebuie să fie în Done, cu dovezi comise.
// ---------------------------------------------------------------------------------------------

const doneFiles = readdirSync(join(root, 'PBI', 'Done'));
const evidenceDirectories = readdirSync(join(root, 'Docs', 'Evidence'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

function frontmatterOf(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (match === null) return {};
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const parsed = line.match(/^([a-z_]+):\s*(.*)$/);
    if (parsed === null) continue;
    fields[parsed[1]] = parsed[2].replace(/^"|"$/g, '');
  }
  return fields;
}

const dependencies = v2Chain.map((id) => {
  const fileName = doneFiles.find((name) => name.startsWith(`${id}-`)) ?? null;
  const evidenceName = evidenceDirectories.find((name) => name.startsWith(`${id}-`)) ?? null;
  const filePath = fileName === null ? null : `PBI/Done/${fileName}`;
  const readmePath = evidenceName === null ? null : `Docs/Evidence/${evidenceName}/README.md`;
  const frontmatter = filePath === null ? {} : frontmatterOf(readText(filePath));
  const readmeText = readmePath === null || !exists(readmePath) ? '' : readText(readmePath);
  const placeholder = /De completat/.test(readmeText);
  const evidencePresent = readmePath !== null && readmeText.length > 0;
  const done = frontmatter.status === 'Done' && (frontmatter.completed_at ?? '').length > 0;
  const verdict = done && evidencePresent && !placeholder ? 'PASS' : 'FAIL';
  return Object.freeze({
    id,
    title: frontmatter.title ?? '',
    file: filePath,
    done,
    completedAt: frontmatter.completed_at ?? null,
    evidence: readmePath,
    evidencePresent,
    placeholder,
    verdict,
  });
});

// ---------------------------------------------------------------------------------------------
// 6. Checklist-ul de release: fiecare verdict este derivat dintr-o dovadă comisă.
// ---------------------------------------------------------------------------------------------

const docsRegistryText = exists(registryDocPath) ? readText(registryDocPath) : '';
const staleRegistryRule =
  docsRegistryText.includes('rămâne respins pentru toate cheile') ||
  /estimable=false`?\s*rămâne pentru toate\s*80/i.test(docsRegistryText);
const catalogDocText = exists(catalogDocPath) ? readText(catalogDocPath) : '';
const staleCatalogSupport = catalogDocText.includes(
  'Estimarea și publicarea LEARNED rămân dezactivate',
);
const catalogDocHasSupportSection =
  catalogDocText.includes('Suport real după 187') &&
  catalogDocText.includes('Evidence/187-v2-parameter-gate/README.md');

const dependencyPassCount = dependencies.filter((row) => row.verdict === 'PASS').length;
const artifactComplete =
  rows.length === 80 &&
  artifactSummary.policies === 80 &&
  artifactSummary.estimators === 80 &&
  artifactSummary.reservedByPlanStage === 56 &&
  reservedKeys.every((key) => v2Rows.some((row) => row.key === key)) &&
  coreRows.every((row) => !row.support.reservedByPlanStage);
const catalogFailClosed = (catalog.parameters ?? []).every((entry) => entry.implemented === false);

const checklistRows = [];
function row(entry) {
  checklistRows.push(Object.freeze({ owner: null, ...entry }));
}

row({
  id: 'dependencies-v2',
  area: 'Dependențe',
  title: 'Lanțul V2 163–189 este în Done, cu dovadă comisă și fără placeholder',
  verdict: dependencyPassCount === dependencies.length ? 'PASS' : 'FAIL',
  evidence: ['PBI/Done', 'Docs/Evidence'],
  detail: `${dependencyPassCount}/${dependencies.length} PBI-uri V2 în Done, cu README de dovezi fără „De completat"`,
});
row({
  id: 'artifact-80',
  area: 'Artefact',
  title: 'Artefactul celor 80 de chei este derivat și declară rezervarea celor 56',
  verdict: artifactComplete ? 'PASS' : 'FAIL',
  evidence: ['Docs/Evidence/190-v2-release/parameter-artifact.json'],
  detail: `${rows.length} chei derivate: ${artifactSummary.policies} politici, ${artifactSummary.estimators} estimatori, ${artifactSummary.reservedByPlanStage} rezervate, ${artifactSummary.challengeCovered} cu provocare 188`,
});
row({
  id: 'catalog-fail-closed',
  area: 'Catalog',
  title: 'Catalogul de date rămâne fail-closed; suportul runtime vine din tabelul 187',
  verdict:
    catalogFailClosed && derived.every((entry) => entry.implemented && entry.estimable)
      ? 'PASS'
      : 'FAIL',
  evidence: ['Docs/driving-parameters.json', 'src/profiles/parameter-capabilities.ts'],
  detail: `${(catalog.parameters ?? []).filter((entry) => entry.implemented === false).length}/80 intrări JSON cu implemented=false; ${derived.filter((entry) => entry.implemented && entry.estimable).length}/80 derivate implemented+estimable`,
});
row({
  id: 'gate-187',
  area: 'Gate',
  title: 'Poarta celor 80 de parametri: verdict derivat, fără findings',
  verdict:
    gateReport.verdict === 'PASS' &&
    gateReport.capability?.declared === 80 &&
    gateReport.findings?.length === 0
      ? 'PASS'
      : 'FAIL',
  evidence: [gateReportPath],
  detail: `${gateReport.capability?.declared ?? 0}/80 chei, ${gateReport.findings?.length ?? '?'} findings, verdict ${gateReport.verdict}`,
});
row({
  id: 'challenges-188',
  area: 'Gate',
  title: 'Provocările extinse: 15 provocări, 5 familii, verificări complete',
  verdict:
    challengesReport.summary?.pass === true && challengesReport.challenges?.length === 15
      ? 'PASS'
      : 'FAIL',
  evidence: [challengesReportPath],
  detail: `${challengesReport.summary?.passed ?? 0}/${challengesReport.summary?.checks ?? 0} verificări, ${challengesReport.challenges?.length ?? 0} provocări, ${challengesReport.learningKeys?.covered ?? 0}/${challengesReport.learningKeys?.extended ?? 0} chei V2 acoperite`,
});
row({
  id: 'regression-v1-189',
  area: 'Regresii',
  title: 'Regresia V1 revizia 0.3 reexecutată pe revizia curentă',
  verdict:
    (regressionReport.criteria ?? []).find((criterion) => criterion.id === 'C1')?.verdict === 'PASS'
      ? 'PASS'
      : 'FAIL',
  evidence: [regressionReportPath, v1RegressionReportPath],
  detail: v1Suite?.figure ?? 'rândul C1 lipsește',
});
row({
  id: 'compat-matrix-154',
  area: 'Compatibilitate',
  title: 'Matricea WebGPU/WebGL 2 reexecutată, combinațiile lipsă declarate',
  verdict:
    compatReport.summary?.fail === 0 && compatReport.summary?.pass === compatReport.summary?.rows
      ? 'PASS'
      : 'FAIL',
  evidence: [compatReportPath, regressionReportPath],
  detail: `${compatReport.summary?.pass ?? 0}/${compatReport.summary?.rows ?? 0} combinații reale, ${compatReport.summary?.deterministicPass ?? 0}/${compatReport.summary?.deterministicChecks ?? 0} verificări deterministe, ${compatReport.summary?.declaredNotRun ?? 0} declarate NOT_RUN`,
});
row({
  id: 'save-roundtrip',
  area: 'Salvare',
  title: 'Export/import păstrează valorile și cheile rezervate',
  verdict:
    exportReport.summary?.pass === true &&
    importReport.summary?.pass === true &&
    importReport.validation?.reservedParameters === 56
      ? 'PASS'
      : 'FAIL',
  evidence: [exportReportPath, importReportPath],
  detail: `export ${exportReport.summary?.passed ?? 0}/${exportReport.summary?.checks ?? 0}, import ${importReport.summary?.passed ?? 0}/${importReport.summary?.checks ?? 0}, ${importReport.validation?.reservedParameters ?? 0} chei rezervate`,
});
row({
  id: 'e2e-restart',
  area: 'Salvare',
  title: 'Sesiunea integrală re-citește aceleași documente după restart',
  verdict: e2eReport.summary?.pass === true && e2eReport.restart !== undefined ? 'PASS' : 'FAIL',
  evidence: [e2eReportPath],
  detail: `${e2eReport.summary?.steps ?? 0} pași, ${e2eReport.summary?.checks ?? 0} verificări, ${e2eReport.summary?.fail ?? '?'} eșuate`,
});
row({
  id: 'docs-11-support',
  area: 'Documentație',
  title: 'Docs/11 descrie suportul real după 187, fără afirmația V1 despre LEARNED',
  verdict: !staleCatalogSupport && catalogDocHasSupportSection ? 'PASS' : 'FAIL',
  evidence: [catalogDocPath, gateReportPath],
  detail: staleCatalogSupport
    ? 'afirmația „LEARNED rămâne dezactivat” este încă prezentă'
    : catalogDocHasSupportSection
      ? 'secțiunea de suport real există și trimite la 187'
      : 'secțiunea de suport real lipsește',
});
row({
  id: 'docs-registry-v1-rule',
  area: 'Documentație',
  title: 'Docs/parameter-registry.md descrie regula reală de estimare',
  verdict: staleRegistryRule ? 'FAIL' : 'PASS',
  owner: staleRegistryRule
    ? 'proprietarul Docs/parameter-registry.md (semnalat de 187, în afara ownership-ului 190)'
    : null,
  evidence: [registryDocPath, gateReportPath],
  detail: staleRegistryRule
    ? 'documentul afirmă încă „estimable=false / LEARNED respins pentru toate cheile”, contrazis de cei 80 de estimatori certificați'
    : 'documentul nu mai afirmă regula V1',
});
row({
  id: 'inherited-v1-gates',
  area: 'Moștenire V1',
  title: 'Gate-urile V1 deschise (153, 235) rămân vizibile în release-ul V2',
  verdict:
    (v1Checklist.summary?.fail ?? 0) === 0 && (v1Checklist.summary?.notRun ?? 0) === 0
      ? 'PASS'
      : 'FAIL',
  owner:
    (v1Checklist.summary?.fail ?? 0) === 0 && (v1Checklist.summary?.notRun ?? 0) === 0
      ? null
      : 'proprietarul 235 (experiență) și 153 (QA vizual)',
  evidence: [v1ChecklistPath],
  detail: `checklist V1 162: ${v1Checklist.summary?.pass ?? 0} PASS, ${v1Checklist.summary?.fail ?? 0} FAIL, ${v1Checklist.summary?.notValidated ?? 0} NOT_VALIDATED, ${v1Checklist.summary?.notRun ?? 0} NOT_RUN (${v1Checklist.summary?.openItems ?? 0} itemi deschiși)`,
});
row({
  id: 'fps-hardware',
  area: 'Performanță',
  title: 'FPS, frame p95/p99 și lucru GPU pe hardware real, ambele backenduri',
  verdict: 'NOT_RUN',
  owner: 'operatorul cu hardware real + proprietarul 224',
  evidence: [performanceGatePath, regressionReportPath],
  detail: `224: ${fpsRow?.verdict ?? 'NOT_VALIDATED'}; capturile hardware 220 sunt pe alt build, pragurile cer aceeași revizie. Nu se raportează FPS headless.`,
});
row({
  id: 'harness-v2',
  area: 'Performanță',
  title: 'Harness de performanță cu workload-ul V2 (pietoni, pericole, catalog complet)',
  verdict: regressionReport.workload?.timing?.verdict === 'PASS' ? 'PASS' : 'NOT_RUN',
  owner: 'proprietarul harness-ului 220/224',
  evidence: [regressionReportPath],
  detail: `${regressionReport.workload?.timing?.reason ?? 'motivul lipsește'}`,
});
row({
  id: 'soak-v2',
  area: 'Performanță',
  title: 'Soak V2 de 60 de minute pe workload-ul V2',
  verdict: 'NOT_RUN',
  owner: 'proprietarul 159/224',
  evidence: [regressionReportPath, 'Docs/Evidence/159-soak/report.json'],
  detail:
    'soak-ul comis (60,002 min, 20 cicluri) este pe workload-ul V1 și nu a fost reexecutat; nu există variantă cu pietoni/pericole',
});
row({
  id: 'playtest-human',
  area: 'Experiență',
  title: 'Playtest uman: explicații, senzație de condus, provocări reluate',
  verdict: 'NOT_RUN',
  owner: 'proprietarul 216/235',
  evidence: [v1RegressionReportPath, v1ChecklistPath],
  detail: `rândul C3 al regresiei V1 (${v1RegressionReport.rows?.find((entry) => entry.id === 'C3')?.verdict ?? 'NOT_RUN'}) și ${v1Checklist.criteria?.find((criterion) => criterion.id === 'human-playtest')?.verdict ?? 'NOT_RUN'} în checklist-ul 162: zero participanți`,
});
row({
  id: 'remeasure-224',
  area: 'Performanță',
  title: 'Re-măsurarea dovezilor comise ale gate-ului 224 pe revizia curentă',
  verdict: 'NOT_RUN',
  owner: 'proprietarul 224',
  evidence: [regressionReportPath, performanceGatePath],
  detail:
    stalenessFinding === undefined
      ? 'nu există finding de învechire'
      : `\`${stalenessFinding.command}\` iese cu exit ${stalenessFinding.exitCode}; 189 a reexecutat proaspăt doar structural (PASS), fără să suprascrie dovezile comise`,
});

const checklistSummary = Object.freeze({
  rows: checklistRows.length,
  pass: checklistRows.filter((entry) => entry.verdict === 'PASS').length,
  fail: checklistRows.filter((entry) => entry.verdict === 'FAIL').length,
  notRun: checklistRows.filter((entry) => entry.verdict === 'NOT_RUN').length,
  open: checklistRows.filter((entry) => entry.verdict !== 'PASS').length,
  release: checklistRows.every((entry) => entry.verdict === 'PASS') ? 'PASS' : 'NOT_VALIDATED',
  ready: checklistRows.every((entry) => entry.verdict === 'PASS'),
});

// ---------------------------------------------------------------------------------------------
// 7. Verificările artefactului: fail-closed, ca un rând fără sursă să oprească release-ul.
// ---------------------------------------------------------------------------------------------

const checks = [
  {
    id: 'catalog-shape',
    passed: definitions.length === 80 && coreRows.length === 24 && v2Rows.length === 56,
    detail: `${definitions.length} definiții, ${coreRows.length} ținte M, ${v2Rows.length} chei de extensie`,
  },
  {
    id: 'gate-verdict',
    passed: gate.passed && gateReport.verdict === 'PASS' && gateReport.capability?.declared === 80,
    detail: `poarta 187: ${gate.keys.length}/80 chei, ${gate.findings.length} findings, verdict ${gateReport.verdict}`,
  },
  {
    id: 'artifact-rows',
    passed:
      rows.length === 80 &&
      new Set(rows.map((entry) => entry.key)).size === 80 &&
      rows.every((entry) => entry.key === definitions[entry.index - 1]?.key),
    detail: '80 de rânduri, în ordinea catalogului, fără duplicate',
  },
  {
    id: 'policy-and-estimator',
    passed:
      artifactSummary.policies === 80 &&
      artifactSummary.estimators === 80 &&
      artifactSummary.noneEstimator === 0,
    detail: `${artifactSummary.policies} politici, ${artifactSummary.estimators} estimatori, ${artifactSummary.noneEstimator} NONE`,
  },
  {
    id: 'reservation',
    passed:
      artifactSummary.reservedByPlanStage === 56 &&
      v2Rows.every((entry) => entry.support.reservedByPlanStage && !entry.support.usableEndToEnd) &&
      coreRows.every(
        (entry) => !entry.support.reservedByPlanStage && entry.support.usableEndToEnd,
      ) &&
      profiles.reservedParameterKeys.length === 56,
    detail: `${v2Rows.length} chei V2 rezervate (\`reservedParameterKeys\`), ${coreRows.length} chei CORE utilizabile`,
  },
  {
    id: 'challenge-coverage',
    passed:
      challengeRows.length === declaredCovered &&
      coveredFromRows.every((key) => v2Rows.some((entry) => entry.key === key)) &&
      declaredCovered + declaredUncovered === v2Rows.length,
    detail: `${challengeRows.length} chei livrate prin provocările 188, ${declaredUncovered} neacoperite`,
  },
  {
    id: 'conventions',
    passed:
      gate.conventions.length === 8 &&
      gate.conventions.every((convention) => convention.keys.length > 0),
    detail: `${gate.conventions.length} convenții canonice, fiecare cu cel puțin o cheie`,
  },
  {
    id: 'style-transfer',
    passed:
      styleTransfer.length === 10 &&
      styleTransferDemonstrated === styleTransfer.length &&
      styleTransfer.every(
        (entry) =>
          reservedKeys.includes(entry.key) &&
          entry.dispatch.state === 'BLOCKED_BY_PLAN_STAGE' &&
          entry.dispatch.code === 'KEY_EXTENSION_STAGE',
      ),
    detail: `${styleTransferDemonstrated}/${styleTransfer.length} familii cu valoare candidată estimată și efect măsurat în politică; transferul către flotă este blocat de etapa de plan`,
  },
  {
    id: 'compatibility-evidence',
    passed: claims.every((claim) => claim.supported),
    detail: `${claims.filter((claim) => claim.supported).length}/${claims.length} afirmații cu dovadă existentă și literal verificat`,
  },
  {
    id: 'dependencies-done',
    passed: dependencyPassCount === dependencies.length,
    detail: `${dependencyPassCount}/${dependencies.length} PBI-uri 163–189 în Done, cu dovezi fără placeholder`,
  },
  {
    id: 'evidence-files',
    passed: exists('Docs/Evidence/190-v2-release'),
    detail: 'directorul de dovezi al release-ului există',
  },
];

const verdict =
  checks.every((check) => check.passed) && claims.every((claim) => claim.supported)
    ? 'PASS'
    : 'FAIL';

// ---------------------------------------------------------------------------------------------
// 8. Fișierele generate.
// ---------------------------------------------------------------------------------------------

const artifactJson = {
  version: '190-v2-parameter-artifact-v1',
  command: 'npm run release:v2',
  generatedBy: 'scripts/run-v2-release-artifact.mjs',
  derivation: {
    sources: [
      catalogPath,
      'src/profiles/parameter-capabilities.ts',
      'src/profiles/parameter-registry.ts',
      gateReportPath,
      challengesReportPath,
    ],
    rule: 'Fiecare rând este citit din catalog, îmbogățit cu intrarea de capabilitate (politică, estimator, dovezi, test, scenariu), verificat de `evaluateParameterGate` și legat de provocările 188 prin `learningKeys`; efectul măsurat vine din raportul comis al grupului, iar rezervarea din `reservedParameterKeys`.',
    reservedRule:
      'Cheile cu `implementationStage: extension` sunt rezervate de etapa de plan: `candidate-validation` le refuză cu `KEY_EXTENSION_STAGE`, iar exportul le scrie `null` în `reservedParameters`. Certificarea 187 nu schimbă etapa.',
  },
  summary: artifactSummary,
  checks,
  conventions: gate.conventions,
  styleTransfer: {
    summary: {
      families: styleTransfer.length,
      demonstrated: styleTransferDemonstrated,
      blockedByPlanStage: styleTransfer.filter(
        (entry) => entry.dispatch.state === 'BLOCKED_BY_PLAN_STAGE',
      ).length,
      note: 'Valoarea candidată vine din estimatorul familiei, efectul din politica familiei; transferul către flotă este oprit de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`).',
    },
    families: styleTransfer,
  },
  reservation: {
    reservedKeys,
    count: reservedKeys.length,
    reason:
      'Etapa de plan (`implementationStage: extension`) rămâne sursa rezervării; migrarea ei nu face parte din 190.',
  },
  keys: rows,
  verdict,
};

const artifactMarkdown = [
  '# Artefactul celor 80 de parametri (PBI 190)',
  '',
  '> Fișier generat determinist de `npm run release:v2`. Nu edita manual.',
  '',
  `**Verdict: ${verdict}.** Artefactul este derivat din [catalogul de date](${relativeFromEvidence(catalogPath)}), din tabelul de capabilități 187 și din dovezile comise ale grupurilor 167–186; efectele măsurate sunt citite din rapoartele grupurilor, iar livrarea în joc din raportul 188.`,
  '',
  `**Rezumat:** ${rows.length}/${rows.length} chei; ${artifactSummary.core} CORE + ${artifactSummary.v2} V2; ${artifactSummary.policies} politici și ${artifactSummary.estimators} estimatori (${artifactSummary.noneEstimator} NONE); ${artifactSummary.measuredEffects} efecte măsurate + ${artifactSummary.preservedMEffects} consecințe M păstrate; ${artifactSummary.conventions} convenții canonice; ${artifactSummary.challengeCovered} chei demonstrate de provocările 188; **${artifactSummary.reservedByPlanStage} chei certificate dar rezervate de etapa de plan**.`,
  '',
  '## Ce înseamnă „suport real” în acest artefact',
  '',
  `- **${artifactSummary.core} chei CORE** sunt livrate în bucla V1 de politicile 046–053: o cheie are consumator de politică și estimator, iar estimarea și \`LEARNED\` sunt permise de tabelul 187.`,
  `- **${artifactSummary.v2} chei V2** sunt certificate de poarta 187 (politică, estimator, dovezi, test independent), dar **încă rezervate** de etapa de plan: \`candidate-validation\` le refuză cu \`KEY_EXTENSION_STAGE\`, iar exportul le scrie \`null\` în \`reservedParameters\`. Certificarea nu le face livrabile end-to-end.`,
  `- **${artifactSummary.challengeCovered} din ${artifactSummary.v2}** chei V2 au și o demonstrație de joc în provocările 188; celelalte ${artifactSummary.challengeUncovered} sunt certificate, dar fără provocare dedicată.`,
  '- Nicio cheie nu are estimator `NONE`: toate cele 80 sunt estimabile, dar asta descrie capabilitatea certificată, nu un parcurs de joc încheiat.',
  '',
  '## Convențiile canonice ale ambiguităților',
  '',
  ...table(
    ['Convenție', 'Chei acoperite', 'Regula canonică', 'Ancoră'],
    gate.conventions.map((convention) => [
      code(convention.id),
      convention.keys.map(code).join(', '),
      oneLine(convention.statement),
      `${code(convention.anchor.path)} — ${oneLine(convention.anchor.title)}`,
    ]),
  ),
  '',
  '## Catalogul și capabilitatea celor 80 de chei',
  '',
  ...table(
    [
      '#',
      'Cheie',
      'Categorie',
      'Unitate',
      'Interval',
      'Default',
      'Etapă',
      'Politică',
      'Estimator',
      'Convenție',
    ],
    rows.map((entry) => [
      String(entry.index),
      code(entry.key),
      oneLine(entry.category),
      `${code(entry.sourceUnit)}${entry.unit === entry.sourceUnit ? '' : ` (${code(entry.unit)})`}`,
      `\`${entry.range}\``,
      code(formatNumber(entry.default)),
      entry.stage === 'extension' ? 'V2 (R)' : 'CORE (M)',
      entry.policy === null ? 'NONE' : `${entry.policy.kind} \`${entry.policy.symbol}\``,
      entry.estimator === null ? 'NONE' : code(entry.estimator.symbol),
      entry.conventions.length === 0 ? '—' : entry.conventions.map(code).join(', '),
    ]),
  ),
  '',
  '## Livrarea în joc și limitarea care rămâne',
  '',
  ...table(
    ['#', 'Cheie', 'Provocare 188', 'Efect verificat', 'Livrabilă end-to-end', 'Limitare'],
    rows.map((entry) => [
      String(entry.index),
      code(entry.key),
      entry.delivery.challenges.length === 0
        ? entry.delivery.kind === 'V1_POLICY'
          ? '— (politică V1)'
          : '— (fără provocare)'
        : entry.delivery.challenges.map(code).join('<br>'),
      oneLine(effectCell(entry.effect)),
      entry.support.usableEndToEnd ? 'DA' : 'NU',
      oneLine(entry.support.limitation),
    ]),
  ),
  '',
  '## Demonstrația transferului stilului extins',
  '',
  `Pentru fiecare dintre cele ${styleTransfer.length} familii V2, valoarea candidată vine din estimatorul familiei (raportul de învățare), efectul vine din politica familiei (raportul de politică), iar transferul către flotă se oprește la etapa de plan: **${styleTransferDemonstrated}/${styleTransfer.length} familii demonstrate până la politică, ${styleTransfer.filter((entry) => entry.dispatch.state === 'BLOCKED_BY_PLAN_STAGE').length} blocate înainte de flotă**.`,
  '',
  ...table(
    [
      'Familie',
      'Cheie',
      'Valoare candidată',
      'Validare',
      'Efect măsurat în politică',
      'Provocare 188',
      'Transfer către flotă',
    ],
    styleTransfer.map((entry) => [
      oneLine(entry.label),
      code(entry.key),
      entry.candidate === null
        ? '—'
        : `\`${formatNumber(entry.candidate.value)} ${entry.candidate.unit}\` (${entry.candidate.status})`,
      entry.candidate?.validationStatus ?? '—',
      entry.effect === null ? '—' : oneLine(effectCell({ kind: 'MEASURED', ...entry.effect })),
      entry.challenges.length === 0 ? '—' : entry.challenges.map(code).join('<br>'),
      entry.dispatch.state === 'BLOCKED_BY_PLAN_STAGE'
        ? 'BLOCAT (`KEY_EXTENSION_STAGE`)'
        : 'PERMIS',
    ]),
  ),
  '',
  '## Verificările artefactului',
  '',
  ...table(
    ['Verificare', 'Rezultat', 'Detaliu'],
    checks.map((check) => [code(check.id), check.passed ? 'PASS' : 'FAIL', oneLine(check.detail)]),
  ),
  '',
  '## Cheile rezervate',
  '',
  `${reservedKeys.length} chei \`extension\`, în ordinea catalogului:`,
  '',
  ...reservedKeys.map((key) => `- ${code(key)}`),
  '',
  '## Comenzi',
  '',
  '```bash',
  'npm run release:v2',
  'npm run release:v2 -- --check',
  'npm run validate:parameters -- --check',
  '```',
  '',
].join('\n');

const compatibilityJson = {
  version: '190-v2-compatibility-notes-v1',
  command: 'npm run release:v2',
  generatedBy: 'scripts/run-v2-release-artifact.mjs',
  baseline: 'revizia 0.3 (V1), checklist 162',
  claims: claims.map((claim) => ({
    id: claim.id,
    kind: claim.kind,
    audience: claim.audience,
    statement: claim.statement,
    evidence: claim.evidence,
    supported: claim.supported,
  })),
  summary: {
    claims: claims.length,
    changed: claims.filter((claim) => claim.kind === 'CHANGED').length,
    identical: claims.filter((claim) => claim.kind === 'IDENTICAL').length,
    added: claims.filter((claim) => claim.kind === 'NEW').length,
    open: claims.filter((claim) => claim.kind === 'OPEN').length,
    supported: claims.filter((claim) => claim.supported).length,
    unsupported: claims.filter((claim) => !claim.supported).length,
  },
  verdict: claims.every((claim) => claim.supported) ? 'PASS' : 'FAIL',
};

const compatibilityMarkdown = [
  '# Note de compatibilitate V2 față de 0.3 (PBI 190)',
  '',
  '> Fișier generat determinist de `npm run release:v2`. Nu edita manual.',
  '',
  `Fiecare afirmație are cel puțin o referință la o dovadă comisă; un detaliu derivat din fișier este afișat lângă referință. **${claims.filter((claim) => claim.supported).length}/${claims.length} afirmații susținute de dovezi existente** (${claims.filter((claim) => claim.kind === 'CHANGED').length} schimbări, ${claims.filter((claim) => claim.kind === 'IDENTICAL').length} identice, ${claims.filter((claim) => claim.kind === 'NEW').length} noutăți, ${claims.filter((claim) => claim.kind === 'OPEN').length} deschise).`,
  '',
  ...compatibilitySection('Ce s-a schimbat față de 0.3', 'CHANGED', claims),
  '',
  ...compatibilitySection('Ce rămâne identic', 'IDENTICAL', claims),
  '',
  ...compatibilitySection('Ce este nou', 'NEW', claims),
  '',
  ...compatibilitySection('Ce rămâne deschis', 'OPEN', claims),
  '',
  '## Verdictul notelor',
  '',
  claims.every((claim) => claim.supported)
    ? 'Toate afirmațiile au o dovadă existentă; notele nu conțin un „PASS" generic.'
    : 'Cel puțin o afirmație nu are dovada la calea declarată — release-ul nu se închide.',
  '',
].join('\n');

const checklistJson = {
  version: '190-v2-release-checklist-v1',
  command: 'npm run release:v2',
  generatedBy: 'scripts/run-v2-release-artifact.mjs',
  baseline: '161/189 (checklist V1 162, regresii V2 189)',
  dependencies,
  rows: checklistRows,
  summary: checklistSummary,
  open: checklistRows
    .filter((entry) => entry.verdict !== 'PASS')
    .map((entry) => ({
      id: entry.id,
      verdict: entry.verdict,
      owner: entry.owner,
      detail: entry.detail,
    })),
};

const checklistMarkdown = [
  '# Checklist de release V2 (PBI 190)',
  '',
  '> Fișier generat determinist de `npm run release:v2`. Nu edita manual.',
  '',
  `**Verdict: ${checklistSummary.release}.** ${checklistSummary.pass} \`PASS\`, ${checklistSummary.fail} \`FAIL\`, ${checklistSummary.notRun} \`NOT_RUN\`; ${checklistSummary.open} rânduri deschise, fiecare cu owner. Un rând \`NOT_RUN\` nu este promovat la \`PASS\`, iar un rând fără dovadă comisă nu poate primi \`PASS\`.`,
  '',
  '## Rândurile checklist-ului',
  '',
  ...table(
    ['Rând', 'Arie', 'Criteriu', 'Verdict', 'Owner', 'Dovadă', 'Detaliu'],
    checklistRows.map((entry) => [
      code(entry.id),
      oneLine(entry.area),
      oneLine(entry.title),
      entry.verdict,
      entry.owner === null ? '—' : oneLine(entry.owner),
      entry.evidence.map(code).join('<br>'),
      oneLine(entry.detail),
    ]),
  ),
  '',
  '## Dependențele V2 (163–189)',
  '',
  ...table(
    ['ID', 'Titlu', 'Fișier', 'Done', 'completed_at', 'Dovezi', 'Verdict'],
    dependencies.map((entry) => [
      code(entry.id),
      oneLine(entry.title),
      entry.file === null ? '—' : code(entry.file),
      entry.done ? 'DA' : 'NU',
      entry.completedAt === null ? '—' : code(entry.completedAt),
      entry.evidence === null ? '—' : code(entry.evidence),
      entry.verdict,
    ]),
  ),
  '',
  `**${dependencyPassCount}/${dependencies.length}** PBI-uri V2 sunt în \`PBI/Done\`, cu \`status: Done\`, \`completed_at\` completat și un README de dovezi fără „De completat".`,
  '',
  '## Rândurile deschise',
  '',
  ...(checklistSummary.open === 0
    ? ['Niciun rând deschis.']
    : checklistRows
        .filter((entry) => entry.verdict !== 'PASS')
        .map(
          (entry) =>
            `- \`${entry.id}\` (**${entry.verdict}**) — ${oneLine(entry.detail)} · owner: ${oneLine(entry.owner ?? 'neatribuit')}`,
        )),
  '',
  '## Comenzi',
  '',
  '```bash',
  'npm run release:v2',
  'npm run release:v2 -- --check',
  '```',
  '',
].join('\n');

function effectCell(effect) {
  if (effect.kind === 'MEASURED') {
    return `${formatNumber(effect.lowValue)} → ${formatNumber(effect.highValue)} ${effect.unit}: ${formatNumber(effect.lowOutcome)} → ${formatNumber(effect.highOutcome)} (Δ ${formatNumber(effect.difference)})`;
  }
  return `M păstrat: ${effect.title}`;
}

function compatibilitySection(title, kind, allClaims) {
  const sectionClaims = allClaims.filter((claim) => claim.kind === kind);
  return [
    `## ${title}`,
    '',
    ...table(
      ['Afirmație', 'Public', 'Dovadă', 'Detaliu derivat', 'Stare'],
      sectionClaims.map((claim) => [
        oneLine(claim.statement),
        claim.audience,
        claim.evidence.map((entry) => code(entry.path)).join('<br>'),
        claim.evidence.map((entry) => oneLine(entry.detail)).join('<br>'),
        claim.supported ? 'SUSȚINUTĂ' : 'FĂRĂ DOVADĂ',
      ]),
    ),
  ];
}

function relativeFromEvidence(path) {
  // Din `Docs/Evidence/190-v2-release/` înapoi la rădăcina `Docs/`.
  return `../../../${path}`;
}

const outputs = [
  ['parameter-artifact.json', `${JSON.stringify(artifactJson, null, 2)}\n`],
  ['parameter-artifact.md', artifactMarkdown],
  ['compatibility-notes.json', `${JSON.stringify(compatibilityJson, null, 2)}\n`],
  ['compatibility-notes.md', compatibilityMarkdown],
  ['release-checklist.json', `${JSON.stringify(checklistJson, null, 2)}\n`],
  ['release-checklist.md', checklistMarkdown],
];

if (process.argv.includes('--check')) {
  let stale = 0;
  for (const [name, content] of outputs) {
    const path = join(evidenceDirectory, name);
    if (!existsSync(path)) {
      console.error(`Missing release artifact: ${path}`);
      stale += 1;
      continue;
    }
    if (readFileSync(path, 'utf8') !== content) {
      console.error(`Stale release artifact: ${path}`);
      stale += 1;
    }
  }
  if (stale === 0) console.log('Release artifacts V2 are current.');
  process.exitCode = stale === 0 ? 0 : 1;
} else {
  for (const [name, content] of outputs) writeFileSync(join(evidenceDirectory, name), content);
  console.log(`Wrote ${outputs.length} files to ${evidenceDirectory}`);
}

for (const check of checks)
  console.log(`${check.passed ? 'PASS' : 'FAIL'} CHECK ${check.id} (${check.detail})`);
for (const claim of claims)
  if (!claim.supported)
    console.log(
      `FAIL CLAIM ${claim.id}: evidence missing (${claim.evidence.map((entry) => entry.path).join(', ')})`,
    );
console.log(
  `SUMMARY keys ${rows.length} (${artifactSummary.core} CORE / ${artifactSummary.v2} V2), estimators ${artifactSummary.estimators}, challenges ${artifactSummary.challengeCovered}/${artifactSummary.v2}, reserved ${artifactSummary.reservedByPlanStage}, checklist ${checklistSummary.pass} PASS / ${checklistSummary.fail} FAIL / ${checklistSummary.notRun} NOT_RUN, release ${checklistSummary.release}, verdict ${verdict}`,
);

if (verdict !== 'PASS' || checks.some((check) => !check.passed)) process.exitCode = 1;

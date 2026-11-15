import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 202 — artefactul de release V3 (mers pe jos și toate funcționalitățile planificate).
 *
 * O singură comandă derivează trei artefacte și verdictul de release:
 * - `capabilities.json/md` — ce poți face în contractele livrate, cu nivelul real de livrare;
 * - `controls.json/md` — controalele reale, citite din bindingurile 009/066/067/080 și din
 *   adaptoarele de pointer existente, fără niciun control inventat;
 * - `release-checklist.json/md` — rânduri `PASS`/`FAIL`/`NOT_RUN` cu owner, moștenind deschiderile
 *   din 190 și 201 și defectele deschise 153/235.
 *
 * Regula de onestitate a release-ului:
 * - `capabilities` nu declară „live în build" ce nu este compus: `src/main.ts` este compoziția de
 *   browser, iar contractele 191–200 sunt headless. Nivelul fiecărei capabilități este derivat;
 * - `controls` listează numai taste și gesturi care există în cod; un binding declarat fără
 *   consumator real este marcat `DECLARED_ONLY`, nu promovat la control funcțional;
 * - cele 56 de chei extinse rămân rezervate de etapa de plan (`KEY_EXTENSION_STAGE`), XP-ul de mers
 *   este `NOT_IMPLEMENTED` (199), iar streamingul vizual este `NOT_MEASURED` (201/157);
 * - verdictul de release nu poate fi `PASS` cât timp există rânduri `FAIL`/`NOT_RUN` deschise.
 *
 * Rulare implicită: scrie artefactele în `Docs/Evidence/202-v3-release/` și secțiunea finală din
 * `Docs/20-extensii-si-mers-pe-jos.md`. `--check` regenerează tot în memorie și compară byte cu
 * byte, fără timestamp-uri în conținutul comparat.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDirectory = join(root, 'Docs', 'Evidence', '202-v3-release');
mkdirSync(evidenceDirectory, { recursive: true });

const docs20Path = 'Docs/20-extensii-si-mers-pe-jos.md';
const packagePath = 'package.json';

/** Lanțul V3 încheiat de acest release: 191 (personaj) până la 201 (validare integrală). */
const v3Chain = Object.freeze(Array.from({ length: 11 }, (_, index) => String(191 + index)));

const evidenceDirectories = readdirSync(join(root, 'Docs', 'Evidence'), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

function evidencePath(id) {
  const name = evidenceDirectories.find((entry) => entry.startsWith(`${id}-`)) ?? null;
  return name === null ? null : `Docs/Evidence/${name}`;
}

const settings = await import(pathToFileURL(join(root, 'src', 'settings', 'index.ts')).href);
const authority = await import(
  pathToFileURL(join(root, 'src', 'input', 'authority-arbiter.ts')).href
);
const character = await import(pathToFileURL(join(root, 'src', 'character', 'index.ts')).href);
const profiles = await import(pathToFileURL(join(root, 'src', 'profiles', 'index.ts')).href);
const remapping = await import(
  pathToFileURL(join(root, 'src', 'ui', 'key-remapping-format.ts')).href
);

const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const exists = (path) => existsSync(join(root, path));
const readText = (path) => readFileSync(join(root, path), 'utf8');

const packageJson = readJson(packagePath);
const scripts = packageJson.scripts ?? {};

function formatNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
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

function percent(part, total) {
  return total === 0 ? '0%' : `${Math.round((part / total) * 100)}%`;
}

// ---------------------------------------------------------------------------------------------
// 1. Dependențele V3: fiecare PBI 191–201 trebuie să fie fizic în Done, cu completed_at, dovezi
//    fără placeholder și raport propriu a cărui comandă există în `package.json`.
// ---------------------------------------------------------------------------------------------

const doneFiles = readdirSync(join(root, 'PBI', 'Done'));
const toDoFiles = exists('PBI/To Do') ? readdirSync(join(root, 'PBI', 'To Do')) : [];
const inProgressFiles = exists('PBI/In Progress')
  ? readdirSync(join(root, 'PBI', 'In Progress'))
  : [];

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

function commandScript(command) {
  const match = String(command ?? '').match(/^npm run ([a-z0-9:_-]+)$/);
  return match === null ? null : match[1];
}

const dependencies = v3Chain.map((id) => {
  const fileName = doneFiles.find((name) => name.startsWith(`${id}-`)) ?? null;
  const directory = evidencePath(id);
  const filePath = fileName === null ? null : `PBI/Done/${fileName}`;
  const frontmatter = filePath === null ? {} : frontmatterOf(readText(filePath));
  const readmePath = directory === null ? null : `${directory}/README.md`;
  const reportPath = directory === null ? null : `${directory}/report.json`;
  const readmeText = readmePath !== null && exists(readmePath) ? readText(readmePath) : '';
  const report = reportPath !== null && exists(reportPath) ? readJson(reportPath) : null;
  const script = report === null ? null : commandScript(report.command);
  const placeholder = /De completat/.test(readmeText);
  const done = frontmatter.status === 'Done' && (frontmatter.completed_at ?? '').length > 0;
  const evidencePresent = readmeText.length > 0;
  const reportPresent = report !== null;
  const commandResolves = script !== null && Object.hasOwn(scripts, script);
  const otherColumns = [...toDoFiles, ...inProgressFiles].filter((name) =>
    name.startsWith(`${id}-`),
  );
  const verdict =
    done &&
    evidencePresent &&
    !placeholder &&
    reportPresent &&
    commandResolves &&
    otherColumns.length === 0
      ? 'PASS'
      : 'FAIL';
  return Object.freeze({
    id,
    title: frontmatter.title ?? '',
    file: filePath,
    status: frontmatter.status ?? null,
    completedAt: frontmatter.completed_at ?? null,
    evidence: readmePath,
    evidencePresent,
    placeholder,
    report: reportPath,
    reportPresent,
    command: script,
    commandResolves,
    otherColumns,
    verdict,
  });
});

const dependencyPass = dependencies.filter((row) => row.verdict === 'PASS').length;

// ---------------------------------------------------------------------------------------------
// 2. Dovezile V3 citite o singură dată. Fiecare capabilitate își ia numerele din raportul comis.
// ---------------------------------------------------------------------------------------------

const reports = Object.fromEntries(
  v3Chain.map((id) => {
    const directory = evidencePath(id);
    if (directory === null || !exists(`${directory}/report.json`)) {
      throw new Error(`Missing V3 report for ${id}`);
    }
    return [id, readJson(`${directory}/report.json`)];
  }),
);

const characterModel = reports['191'];
const walkerModel = reports['192'];
const authorityModel = reports['193'];
const cameraModel = reports['194'];
const enterModel = reports['195'];
const exitModel = reports['196'];
const fleetModel = reports['197'];
const segmentsModel = reports['198'];
const tutorialModel = reports['199'];
const saveModel = reports['200'];
const validationModel = reports['201'];

const challengesReport = readJson('Docs/Evidence/188-v2-challenges/report.json');
const gateReport = readJson('Docs/Evidence/187-v2-parameter-gate/report.json');
const v1Regression = readJson('Docs/Evidence/216-v1-regression/report.json');
const uiQa = readJson('Docs/Evidence/153-ui-qa/report.json');
const funQa = readJson('Docs/Evidence/235-fun-qa/report.json');
const v2Checklist = readJson('Docs/Evidence/190-v2-release/release-checklist.json');
const performanceGate = readJson('Docs/Evidence/224-performance-gate/report.json');

// ---------------------------------------------------------------------------------------------
// 3. Compunerea reală din browser. Un contract headless nu devine „în joc" doar pentru că există.
// ---------------------------------------------------------------------------------------------

const bootstrapText = readText('src/main.ts');
const bootstrapReferences = (needle) => bootstrapText.split(needle).length - 1;
const composition = Object.freeze({
  bootstrap: 'src/main.ts',
  characterReferences: bootstrapReferences('character'),
  authorityReferences: bootstrapReferences('authority'),
  walkerReferences: bootstrapReferences('walker'),
  driveBindingReferences: bootstrapReferences('bindKeyboardDriveInput'),
  modeBindingReferences: bootstrapReferences('bindModeKeyboard'),
  verdict:
    bootstrapReferences('character') === 0 &&
    bootstrapReferences('authority') === 0 &&
    bootstrapReferences('walker') === 0
      ? 'NOT_COMPOSED'
      : 'COMPOSED',
  detail:
    'Compoziția de browser (`src/main.ts`) leagă renderer-ul, ciclul de viață și focusul; contractele V3 191–200 sunt headless și dovedite de rapoartele lor, dar nu sunt cablate într-o sesiune de browser.',
});

// ---------------------------------------------------------------------------------------------
// 4. Capabilitățile: ce poți face, cu dovada și cu limitarea reală.
// ---------------------------------------------------------------------------------------------

const capabilityRows = [
  {
    id: 'character-third-person',
    title: 'Personaj third person cu schelet, scară umană și cinci clipuri',
    contract: characterModel.contract,
    what: `Personaj de ${formatNumber(characterModel.asset?.measured?.heightM ?? 0)} m, ${character.CHARACTER_JOINT_IDS.length} articulații, clipurile ${character.CHARACTER_CLIP_IDS.join(', ')} eșantionate la ${character.CHARACTER_SAMPLING_HZ} Hz; contactul cu solul este măsurat pe fiecare cadru, nu apreciat.`,
    evidence: [
      'Docs/Evidence/191-v3-character/report.json',
      'Docs/Evidence/191-v3-character/README.md',
    ],
    metrics: {
      joints: character.CHARACTER_JOINT_IDS.length,
      clips: characterModel.summary?.clips ?? character.CHARACTER_CLIP_IDS.length,
      clipsPassed: characterModel.summary?.clipsPassed ?? 0,
      samplingHz: characterModel.samplingHz ?? character.CHARACTER_SAMPLING_HZ,
      compatibility: `${characterModel.summary?.compatibilityPassed ?? 0}/${characterModel.summary?.compatibilityChecks ?? 0}`,
      authorityFrames: characterModel.summary?.authorityFrames ?? 0,
      visualIssues: characterModel.summary?.visualIssues ?? 0,
    },
    limitation:
      'Reprezentarea Babylon (`src/rendering/character-visuals.ts`) este o descriere pură de mesh-uri; nu este instanțiată în `src/main.ts`.',
  },
  {
    id: 'walk-run-idle',
    title: 'Mers, alergare și idle pe tick fix, cu coliziune și trepte reale',
    contract: walkerModel.contract,
    what: `Walker determinist la ${walkerModel.tickHz ?? 60} Hz: mers ${formatNumber(character.WALKER_GAIT_SPEEDS_MPS.WALK)} m/s, alergare ${formatNumber(character.WALKER_GAIT_SPEEDS_MPS.RUN)} m/s, pas maxim ${formatNumber(character.WALKER_POLICY.stepCeilingM)} m (bordura reală), clipul ales din viteza măsurată.`,
    evidence: ['Docs/Evidence/192-v3-walker/report.json', 'Docs/Evidence/192-v3-walker/README.md'],
    metrics: {
      scenarios: `${walkerModel.summary?.scenariosPassed ?? 0}/${walkerModel.summary?.scenarios ?? 0}`,
      walkSpeedMps: character.WALKER_GAIT_SPEEDS_MPS.WALK,
      runSpeedMps: character.WALKER_GAIT_SPEEDS_MPS.RUN,
      stepCeilingM: character.WALKER_POLICY.stepCeilingM,
      maxPenetrationM: walkerModel.summary?.maxPenetrationM ?? null,
      vehicleBodiesCreated: walkerModel.vehicleBodiesCreated ?? 0,
    },
    limitation:
      'Walker-ul nu creează corpuri de mașină și nu este pășit de compoziția de browser; probele sunt native, fără renderer.',
  },
  {
    id: 'single-input-authority',
    title: 'O singură autoritate de input: personaj sau vehicul, niciodată ambele',
    contract: authorityModel.contract,
    what: `Arbitrajul 193 produce exact o comandă pe tick pentru entitatea activă; portul este exact portul de tastatură din 066, iar tastele ținute la tranziție rămân neutralizate până la o eliberare reală.`,
    evidence: [
      'Docs/Evidence/193-v3-authority/report.json',
      'Docs/Evidence/193-v3-authority/README.md',
    ],
    metrics: {
      scenarios: `${authorityModel.summary?.scenariosPassed ?? 0}/${authorityModel.summary?.scenarios ?? 0}`,
      exhaustiveTicks: authorityModel.exhaustive?.ticks ?? 0,
      wrongConsumerDeliveries: authorityModel.exhaustive?.wrongConsumerDeliveries ?? 0,
      simultaneousNonEmptyTicks: authorityModel.exhaustive?.simultaneousNonEmptyTicks ?? 0,
      transitions: `${authorityModel.summary?.transitionsPassed ?? 0}/${authorityModel.summary?.transitionRows ?? 0}`,
      snapshotBytes: authorityModel.state?.bytes ?? 0,
    },
    limitation:
      'Arbitrajul nu citește tastatura singur; are nevoie de un consumator care să compună adaptorul 066 peste portul lui.',
  },
  {
    id: 'third-person-camera',
    title: 'Cameră third person cu tranziție de 18 tick-uri și ocluzie reală',
    contract: cameraModel.contract,
    what: `Camera urmărește exact entitatea autoritară, trunchiază raza la primul obstacol cu marjă de ${formatNumber(cameraModel.policy?.obstacleMarginM)} m, limitează pitch-ul și distanța și serializează starea pentru reload.`,
    evidence: ['Docs/Evidence/194-v3-camera/report.json', 'Docs/Evidence/194-v3-camera/README.md'],
    metrics: {
      scenarios: `${cameraModel.summary?.scenariosPassed ?? 0}/${cameraModel.summary?.scenarios ?? 0}`,
      transitionTicks: cameraModel.policy?.transitionTicks ?? 18,
      transitionFrames: cameraModel.transition?.transitionFrames ?? 0,
      maxStepM: cameraModel.transition?.maxStepM ?? null,
      entityClones: cameraModel.transition?.entityClones ?? 0,
      targetWrites: cameraModel.transition?.targetWrites ?? 0,
    },
    limitation:
      'Orbita camerei este intenție explicită (`orbit.distanceM`, `invertYaw`, `invertPitch`); nu există un binding de mouse pentru camera personajului.',
  },
  {
    id: 'enter-any-vehicle',
    title: 'Intrare în orice mașină accesibilă, cu autoritate și cursă păstrate',
    contract: enterModel.contract,
    what: `Ușa este pe flancul real al caroseriei, raza de interacțiune este ${formatNumber(enterModel.policy?.interactionRadiusM)} m (jumătatea anvergurii brațelor din 191), iar acceptarea impune modul ${enterModel.policy?.entryMode}; poziția, ruta și cursa rămân bit-identice.`,
    evidence: ['Docs/Evidence/195-v3-enter/report.json', 'Docs/Evidence/195-v3-enter/README.md'],
    metrics: {
      scenarios: `${enterModel.summary?.scenariosPassed ?? 0}/${enterModel.summary?.scenarios ?? 0}`,
      interactionRadiusM: enterModel.policy?.interactionRadiusM ?? null,
      entryMode: enterModel.policy?.entryMode ?? null,
      cameraTransitionTicks: enterModel.camera?.transitionTicks ?? 0,
    },
    limitation:
      'Decizia este o funcție pură; nu există un adaptor de tastă pentru intrare compus în build-ul de browser.',
  },
  {
    id: 'exit-any-vehicle',
    title: 'Ieșire într-un punct fizic valid, fără teleportare',
    contract: exitModel.contract,
    what: `Candidații sunt flancurile, spatele și fața caroseriei, cu marjă liberă de ${formatNumber(exitModel.policy?.clearanceM)} m; mașina eliberată revine în ${exitModel.policy?.releaseMode} cu ruta de dinainte de preluare, iar peste ${formatNumber(exitModel.policy?.maxExitSpeedMps)} m/s ieșirea este refuzată.`,
    evidence: ['Docs/Evidence/196-v3-exit/report.json', 'Docs/Evidence/196-v3-exit/README.md'],
    metrics: {
      scenarios: `${exitModel.summary?.scenariosPassed ?? 0}/${exitModel.summary?.scenarios ?? 0}`,
      clearanceM: exitModel.policy?.clearanceM ?? null,
      releaseMode: exitModel.policy?.releaseMode ?? null,
      maxExitSpeedMps: exitModel.policy?.maxExitSpeedMps ?? null,
      entitiesAfter: exitModel.authority?.entityCountAfter ?? null,
    },
    limitation:
      'Ieșirea cere o decizie explicită a consumatorului; nu există un control live dedicat în afara contractului.',
  },
  {
    id: 'taxi-switch-from-list',
    title: 'Schimbare rapidă a taxiului: FOCUS, TAKE și RETURN',
    contract: fleetModel.contract,
    what: `FOCUS mută doar camera și nu mișcă personajul (probă la ${formatNumber(fleetModel.policy?.focusProofDistanceM)} m), TAKE compune atomic ieșirea 196 cu intrarea 195, iar RETURN readuce corpul fie la poziția de dinainte de preluare, fie la punctul valid al ieșirii.`,
    evidence: [
      'Docs/Evidence/197-v3-fleet-switch/report.json',
      'Docs/Evidence/197-v3-fleet-switch/README.md',
    ],
    metrics: {
      scenarios: `${fleetModel.summary?.scenariosPassed ?? 0}/${fleetModel.summary?.scenarios ?? 0}`,
      focusProofDistanceM: fleetModel.policy?.focusProofDistanceM ?? null,
      takeReachM: fleetModel.policy?.takeReachM ?? null,
      projection: fleetModel.summary?.projection === true ? 'PASS' : 'FAIL',
    },
    limitation:
      'Lista propriu-zisă este panoul 075: rândurile sunt butoane și se aleg cu clic; nu există selecție din tastatură în listă.',
  },
  {
    id: 'manual-learning-segments',
    title: 'Segmente MANUAL/LEARNING: mersul nu devine demonstrație de condus',
    contract: segmentsModel.contract,
    what: `Read model-ul 198 transformă tranzițiile 195/196/197 în segmente închise; ${segmentsModel.walking?.ticks} tick-uri și ${formatNumber(segmentsModel.walking?.distanceM)} m de mers produc ${segmentsModel.walking?.closedSegments} segmente și ${segmentsModel.walking?.candidates} candidați, iar un singur segment LEARNING eligibil închis produce exact un candidat 069.`,
    evidence: [
      'Docs/Evidence/198-v3-walking-segments/report.json',
      'Docs/Evidence/198-v3-walking-segments/README.md',
    ],
    metrics: {
      scenarios: `${segmentsModel.summary?.scenariosPassed ?? 0}/${segmentsModel.summary?.scenarios ?? 0}`,
      walkingTicks: segmentsModel.walking?.ticks ?? 0,
      walkingDistanceM: segmentsModel.walking?.distanceM ?? 0,
      closedSegments: segmentsModel.walking?.closedSegments ?? 0,
      candidates: segmentsModel.walking?.candidates ?? 0,
      boundDistanceM: segmentsModel.walking?.boundDistanceM ?? 0,
    },
    limitation:
      'Contractul este un read model: nu scrie în telemetrie și nu lansează analiza; consumatorul real rămâne 069.',
  },
  {
    id: 'walking-tutorial',
    title: 'Tutorial nou în șase pași care nu blochează accesul la taxiuri',
    contract: tutorialModel.policy?.contract ?? '199-walking-tutorial-v1',
    what: `Tutorialul avansează numai pe evenimente reale (selecție 068, mișcare 192, intrare 195, pickup/dropoff 007, ieșire 196); accesul la taxiuri este ${tutorialModel.policy?.taxiAccess}, iar faptele rejucate sunt refuzate.`,
    evidence: [
      'Docs/Evidence/199-v3-walking-tutorial/report.json',
      'Docs/Evidence/199-v3-walking-tutorial/README.md',
    ],
    metrics: {
      steps: tutorialModel.summary?.steps ?? 0,
      positives: tutorialModel.summary?.positives ?? 0,
      negatives: tutorialModel.summary?.negatives ?? 0,
      taxiAccess: tutorialModel.policy?.taxiAccess ?? null,
      walkingTimeXp: tutorialModel.policy?.walkingTimeXp ?? null,
      xpGranted: tutorialModel.learning?.xpGranted ?? 0,
    },
    limitation:
      'Tutorialul este headless: UI-ul, tastatura și HUD-ul rămân ale modulelor existente; XP-ul de timp de mers este `NOT_IMPLEMENTED`.',
  },
  {
    id: 'v3-save',
    title: 'Salvare V3 cu poziția personajului, camera și autoritatea',
    contract: '200-walking-save-v1',
    what: `Slotul 200 păstrează poziția bit-identică, yaw-ul, autoritatea, camera (inclusiv mijlocul tranziției de 18 tick-uri) și starea segmentelor; migrarea sesiunilor vechi produce o stare validă.`,
    evidence: [
      'Docs/Evidence/200-v3-walking-save/report.json',
      'Docs/Evidence/200-v3-walking-save/README.md',
    ],
    metrics: {
      checks: `${saveModel.summary?.passed ?? 0}/${saveModel.summary?.checks ?? 0}`,
      scenarios: `${saveModel.summary?.scenariosPassed ?? 0}/${saveModel.summary?.scenarios ?? 0}`,
      refusals: `${saveModel.summary?.refusalsClosed ?? 0}/${saveModel.summary?.refusals ?? 0}`,
      migrationPreservesEverything: saveModel.summary?.migrationPreservesEverything ?? false,
      reloadCoherent: saveModel.summary?.reloadCoherent ?? false,
    },
    limitation:
      'Slotul este un contract pur: capturarea la export și aplicarea la reload rămân ale consumatorului; modulul nu scrie în IndexedDB.',
  },
  {
    id: 'three-modes-end-to-end',
    title: 'Cele trei moduri AUTO/MANUAL/LEARNING, intrare–ieșire–revenire',
    contract: '201-v3-validation-flow-v1',
    what: `Lanțul real 192 → 195 → 193 → 196 → 197 → 198 trece în toate cele trei moduri: fiecare mod face FOCUS → TAKE → RETURN, iar personajul merge după ieșire; conducerea lungă 193/194 are un singur consumator pe tick.`,
    evidence: [
      'Docs/Evidence/201-v3-validation/report.json',
      'Docs/Evidence/201-v3-validation/README.md',
    ],
    metrics: {
      modes: (validationModel.flow?.summary?.modes ?? []).join(', '),
      cases: `${validationModel.flow?.summary?.passed ?? 0}/${validationModel.flow?.summary?.cases ?? 0}`,
      seated: `${validationModel.flow?.summary?.seatedPassed ?? 0}/${validationModel.flow?.summary?.seatedCases ?? 0}`,
      walkedAfterM: validationModel.flow?.cases?.[0]?.walkedAfterM ?? null,
      criteria: `${validationModel.totals?.pass ?? 0} PASS / ${validationModel.totals?.fail ?? 0} FAIL / ${validationModel.totals?.notRun ?? 0} NOT_RUN`,
    },
    limitation: 'Validarea este headless: nu măsoară FPS, frame p95/p99 sau senzația din browser.',
  },
  {
    id: 'challenges-and-daily',
    title: 'Provocări, misiuni zilnice și KPI/XP existente, neatinse de mers',
    contract: '188-v2-challenges-v1 + 211/213',
    what: `Catalogul compus are ${challengesReport.compatibility?.composed?.v1 ?? 0} template-uri V1 + ${challengesReport.compatibility?.composed?.extended ?? 0} provocări extinse (${challengesReport.compatibility?.composed?.total ?? 0} în total); mersul nu atinge catalogul, KPI-urile, ledgerul, XP-ul sau starea zilnică (digest 9/9 identic la 201).`,
    evidence: [
      'Docs/Evidence/188-v2-challenges/report.json',
      'Docs/Evidence/201-v3-validation/report.json',
    ],
    metrics: {
      templates: challengesReport.compatibility?.composed?.v1 ?? 0,
      extendedChallenges: challengesReport.compatibility?.composed?.extended ?? 0,
      composedTotal: challengesReport.compatibility?.composed?.total ?? 0,
      extendedKeysCovered: challengesReport.learningKeys?.covered ?? 0,
      extendedKeysTotal: challengesReport.learningKeys?.extended ?? 0,
      identicalDigests: validationModel.digest?.summary?.identical ?? null,
    },
    limitation:
      'Provocările extinse acoperă 15 din 56 de chei; restul sunt certificate, dar fără o demonstrație de joc dedicată.',
  },
];

const capabilityIds = new Set(capabilityRows.map((row) => row.id));
if (capabilityIds.size !== capabilityRows.length) throw new Error('Duplicate capability id');

/** Ce nu este livrat end-to-end. Fiecare rând are owner și motiv derivat, nu presupus. */
const notDelivered = [
  {
    id: 'extended-keys-reserved',
    title: 'Cele 56 de chei extinse rămân rezervate de etapa de plan',
    state: 'NOT_DELIVERED_END_TO_END',
    detail: `Lista de chei rezervate are ${profiles.reservedParameterKeys.length} intrări; validarea candidaților le refuză cu codul de etapă, iar exportul le scrie \`null\` în \`reservedParameters\`. Poarta 187 le certifică (${gateReport.capability?.declared ?? 0} chei, ${gateReport.findings?.length ?? 0} findings), dar certificarea nu schimbă etapa.`,
    evidence: [
      'src/learning/candidate-validation.ts',
      'src/profiles/parameter-registry.ts',
      'Docs/Evidence/187-v2-parameter-gate/report.json',
    ],
    owner: 'proprietarul etapei de plan (migrarea `KEY_EXTENSION_STAGE`)',
  },
  {
    id: 'challenge-coverage-15-of-56',
    title: 'Provocările acoperă 15 din 56 de chei extinse',
    state: 'PARTIAL',
    detail: `${challengesReport.learningKeys?.covered ?? 0} chei au o provocare dedicată, ${(challengesReport.learningKeys?.uncovered ?? []).length} nu; lipsa unei provocări nu este un eșec de catalog, dar nu există demonstrație de joc pentru cele ${(challengesReport.learningKeys?.uncovered ?? []).length}.`,
    evidence: ['Docs/Evidence/188-v2-challenges/report.json'],
    owner: 'proprietarul 188/231 (catalogul de provocări)',
  },
  {
    id: 'walking-time-xp',
    title: 'XP pentru timpul de mers nu este implementat',
    state: 'NOT_IMPLEMENTED',
    detail: `Contractul 199 raportează \`walkingTimeXp = ${tutorialModel.policy?.walkingTimeXp}\` și \`xpGranted = ${tutorialModel.learning?.xpGranted}\`; Docs/20 a fost corectat să nu mai promită această contribuție.`,
    evidence: [
      'Docs/Evidence/199-v3-walking-tutorial/report.json',
      'src/missions/walking-tutorial.ts',
    ],
    owner: 'proprietarul 199/213 (XP și progres)',
  },
  {
    id: 'visual-streaming',
    title: 'Streamingul vizual rămâne fără măsurătoare',
    state: 'NOT_MEASURED',
    detail:
      'Doi pași ai streamingului vizual sunt `NOT_MEASURED` la 157; ei cer renderer real, nu probe structurale. Verdictul C3 al lui 201 este din acest motiv `NOT_RUN`.',
    evidence: [
      'Docs/Evidence/157-render-budget/report.json',
      'Docs/Evidence/201-v3-validation/report.json',
    ],
    owner: 'proprietarul 157/223',
  },
  {
    id: 'hardware-fps',
    title: 'FPS și frame p95/p99 pe hardware real nu sunt validate',
    state: 'NOT_VALIDATED',
    detail: `Gate-ul 224 raportează \`fps-hardware = ${(performanceGate.rows ?? []).find((row) => row.id === 'fps-hardware')?.verdict ?? 'NOT_VALIDATED'}\`, iar release-ul lui este \`${performanceGate.summary?.release ?? 'NOT_VALIDATED'}\`; capturile hardware 220 sunt pe alt build.`,
    evidence: [
      'Docs/Evidence/224-performance-gate/report.json',
      'Docs/Evidence/201-v3-validation/report.json',
    ],
    owner: 'operatorul cu GPU real + proprietarul 224',
  },
  {
    id: 'in-game-composition',
    title: 'Contractele V3 nu sunt cablate în compoziția de browser',
    state: 'NOT_COMPOSED',
    detail: `\`src/main.ts\` are ${composition.characterReferences} referințe la \`character\`, ${composition.authorityReferences} la \`authority\`, ${composition.walkerReferences} la \`walker\`, ${composition.driveBindingReferences} la adaptorul de tastatură și ${composition.modeBindingReferences} la adaptorul de moduri. Capabilitățile sunt livrate ca module headless cu dovezi, nu ca sesiune jucabilă în build.`,
    evidence: ['src/main.ts', 'src/app/index.ts'],
    owner: 'proprietarul compoziției aplicației (src/main.ts)',
  },
];

const capabilitiesSummary = Object.freeze({
  capabilities: capabilityRows.length,
  contracts: new Set(capabilityRows.map((row) => row.contract)).size,
  levels: { HEADLESS_CONTRACT: capabilityRows.length, IN_GAME: 0 },
  notDelivered: notDelivered.length,
  dependenciesDone: dependencyPass,
  dependencies: dependencies.length,
  coverage: percent(dependencyPass, dependencies.length),
});

// ---------------------------------------------------------------------------------------------
// 5. Controalele reale. Bindingurile vin din 009, consumatorii din 066/067/080 și adaptoarele de
//    pointer; niciun control nu este inventat.
// ---------------------------------------------------------------------------------------------

const defaults = settings.createDefaultSettings('release:v3-controls');
const bindings = defaults.input.bindings;
const inputActions = settings.inputActions;
const driveActions = authority.authorityDriveActions;

const keyboardDriveText = readText('src/input/keyboard-drive.ts');
const modeKeyboardText = readText('src/input/mode-keyboard.ts');
const recoveryInputText = readText('src/input/recovery-input.ts');
const fleetPanelText = readText('src/ui/fleet-panel.ts');
const panelFocusText = readText('src/ui/panel-focus.ts');
const cameraInputText = readText('src/rendering/babylon/vehicle-camera-input.ts');
const pickingInputText = readText('src/rendering/babylon/vehicle-picking-input.ts');

/** Consumatorii live, derivați din textul adaptorului, nu din intenție. */
function consumedBy(action) {
  if (driveActions.includes(action) && keyboardDriveText.includes(`'${action}'`)) return '066';
  if (action === 'manualMode' || action === 'learningMode') {
    const marker = action === 'manualMode' ? 'mapping.M' : 'mapping.L';
    return modeKeyboardText.includes(marker) ? '067' : null;
  }
  if (action === 'recover' && recoveryInputText.includes('recover')) return '030';
  return null;
}

const controlMeta = {
  throttle: {
    label: 'Accelerație / înainte',
    vehicle: 'throttle 024 (sursa PLAYER)',
    character: 'mers înainte, intensitate 1',
  },
  brake: {
    label: 'Frână / înapoi',
    vehicle: 'brake 024',
    character: 'oprește (walker-ul nu merge înapoi)',
  },
  steerLeft: {
    label: 'Virare stânga',
    vehicle: 'steering −1',
    character: 'schimbă direcția −π/2',
  },
  steerRight: {
    label: 'Virare dreapta',
    vehicle: 'steering +1',
    character: 'schimbă direcția +π/2',
  },
  handbrake: {
    label: 'Frână de mână',
    vehicle: 'handbrake 024',
    character: 'ignorat de proiecția 193',
  },
  signalLeft: { label: 'Semnal stânga', vehicle: 'turnSignal LEFT', character: 'ignorat' },
  signalRight: { label: 'Semnal dreapta', vehicle: 'turnSignal RIGHT', character: 'ignorat' },
  manualMode: {
    label: 'Mod MANUAL',
    vehicle: '067 intenție MANUAL',
    character: 'nu se aplică',
  },
  learningMode: {
    label: 'Mod LEARNING',
    vehicle: '067 intenție LEARNING',
    character: 'nu se aplică',
  },
  kpis: { label: 'Pop-up KPI', vehicle: 'UI 210, buton', character: 'nu se aplică' },
  fleet: { label: 'Lista flotei', vehicle: 'UI 075, buton', character: 'nu se aplică' },
  camera: {
    label: 'Mod cameră',
    vehicle: '017 are toggle separat, implicit KeyC (nu citește bindingul 009)',
    character: 'nu se aplică',
  },
  profile: { label: 'Panoul profilului', vehicle: 'UI 077, buton', character: 'nu se aplică' },
  pause: { label: 'Pauză', vehicle: 'UI 012, buton', character: 'nu se aplică' },
  recover: { label: 'Recuperare vehicul', vehicle: '030', character: 'nu se aplică' },
};

const keyboardRows = inputActions.map((action) => {
  const consumer = consumedBy(action);
  return Object.freeze({
    action,
    label: controlMeta[action]?.label ?? action,
    code: bindings[action],
    vehicle: controlMeta[action]?.vehicle ?? null,
    character: controlMeta[action]?.character ?? null,
    consumer,
    state: consumer === null ? 'DECLARED_ONLY' : 'CONSUMED',
    remappable: remapping.KEY_REMAPPING_ACTIONS.includes(action),
  });
});

const consumedRows = keyboardRows.filter((row) => row.state === 'CONSUMED');
const declaredOnlyRows = keyboardRows.filter((row) => row.state === 'DECLARED_ONLY');

const pointerRows = [
  {
    id: 'canvas-select-vehicle',
    gesture: 'Clic stânga pe un vehicul din canvas',
    effect: 'Emite intenția 068 de selecție (sursa WORLD); un drag peste 5 px anulează selecția.',
    evidence: 'src/rendering/babylon/vehicle-picking-input.ts',
    state:
      pickingInputText.includes('maxDragPx') && pickingInputText.includes('SelectVehicleIntent')
        ? 'IMPLEMENTED'
        : 'MISSING',
  },
  {
    id: 'fleet-row-click',
    gesture: 'Clic pe un rând din lista flotei (Tab deschide/focus panoul)',
    effect:
      'Rândul este un buton cu rol de opțiune; clicul emite doar intenția de selecție, fără listener global de tastatură.',
    evidence: 'src/ui/fleet-panel.ts',
    state: fleetPanelText.includes("addEventListener('click'") ? 'IMPLEMENTED' : 'MISSING',
  },
  {
    id: 'camera-pointer-lock',
    gesture: 'Butonul de captură al camerei, apoi mișcarea mouse-ului',
    effect:
      'Pointer lock pe canvas; mișcarea relativă alimentează camera; Escape eliberează captura; butonul de recentrare readuce camera.',
    evidence: 'src/rendering/babylon/vehicle-camera-input.ts',
    state:
      cameraInputText.includes('requestPointerLock') && cameraInputText.includes('movementX')
        ? 'IMPLEMENTED'
        : 'MISSING',
  },
  {
    id: 'panel-focus-trap',
    gesture: 'Tab / Shift+Tab în panoul deschis, Escape pentru închidere',
    effect: 'Focusul este prins în panou, iar Escape este predat portului de închidere al gazdei.',
    evidence: 'src/ui/panel-focus.ts',
    state:
      panelFocusText.includes('Shift') && panelFocusText.includes('Escape')
        ? 'IMPLEMENTED'
        : 'MISSING',
  },
  {
    id: 'character-orbit-mouse',
    gesture: 'Orbită de cameră third person cu mouse-ul',
    effect:
      'Nu există: camera 194 primește orbită doar ca intenție explicită, iar build-ul nu are un binding de mouse pentru personaj.',
    evidence: 'src/character/character-camera.ts',
    state: 'NOT_AVAILABLE',
  },
];

const controlsChecks = [
  {
    id: 'bindings-count',
    passed: inputActions.length === 15 && keyboardRows.length === 15,
    detail: `${keyboardRows.length} acțiuni 009, ${new Set(keyboardRows.map((row) => row.code)).size} coduri unice`,
  },
  {
    id: 'drive-actions',
    passed:
      driveActions.length === 7 && driveActions.every((action) => consumedBy(action) === '066'),
    detail: `${driveActions.length} acțiuni de condus consumate de adaptorul 066`,
  },
  {
    id: 'mode-actions',
    passed: consumedBy('manualMode') === '067' && consumedBy('learningMode') === '067',
    detail: 'M și L sunt singurele taste mapate de adaptorul 067',
  },
  {
    id: 'sprint-not-bound',
    passed:
      authority.authorityActions.includes('sprint') &&
      !inputActions.includes('sprint') &&
      !Object.hasOwn(bindings, 'sprint'),
    detail:
      'alergarea există în vocabularul 193, dar nu are binding 009: este contract, nu control live',
  },
  {
    id: 'remap-coverage',
    passed:
      remapping.KEY_REMAPPING_ACTIONS.length === inputActions.length &&
      remapping.KEY_REMAPPING_ACTIONS.every((action) => inputActions.includes(action)),
    detail: `${remapping.KEY_REMAPPING_ACTIONS.length}/${inputActions.length} acțiuni remapare prin 080`,
  },
  {
    id: 'pointer-inventory',
    passed: pointerRows.filter((row) => row.state === 'IMPLEMENTED').length >= 4,
    detail: `${pointerRows.filter((row) => row.state === 'IMPLEMENTED').length} gesturi implementate, ${pointerRows.filter((row) => row.state === 'NOT_AVAILABLE').length} declarate indisponibile`,
  },
];

const controlsSummary = Object.freeze({
  actions: keyboardRows.length,
  consumed: consumedRows.length,
  declaredOnly: declaredOnlyRows.length,
  driveActions: driveActions.length,
  remappable: keyboardRows.filter((row) => row.remappable).length,
  pointerGestures: pointerRows.length,
  pointerImplemented: pointerRows.filter((row) => row.state === 'IMPLEMENTED').length,
  pointerNotAvailable: pointerRows.filter((row) => row.state === 'NOT_AVAILABLE').length,
});

// ---------------------------------------------------------------------------------------------
// 6. Checklist-ul de release: fiecare verdict este derivat, iar un rând deschis are owner.
// ---------------------------------------------------------------------------------------------

const checklistRows = [];

function row(entry) {
  const { evidence = [], ...rest } = entry;
  checklistRows.push(
    Object.freeze({
      owner: null,
      detail: '',
      ...rest,
      evidence: Object.freeze([...evidence]),
    }),
  );
}

const c1 = (validationModel.criteria ?? []).find((criterion) => criterion.id === 'C1');
const c2 = (validationModel.criteria ?? []).find((criterion) => criterion.id === 'C2');
const c3 = (validationModel.criteria ?? []).find((criterion) => criterion.id === 'C3');
const fpsRow = (performanceGate.rows ?? []).find((entry) => entry.id === 'fps-hardware');
const uiFindings = (uiQa.findings ?? []).filter((finding) => finding.severity === 'MEDIUM');
const funFailures = (funQa.criteria ?? []).filter((criterion) => criterion.verdict === 'FAIL');
const funNotRun = (funQa.criteria ?? []).filter((criterion) => criterion.verdict === 'NOT_RUN');
const v2Open = (v2Checklist.open ?? []).map((entry) => entry.id);

row({
  id: 'dependencies-v3',
  area: 'Dependențe',
  title: 'Lanțul V3 191–201 este fizic în Done, cu completed_at, dovezi și raport propriu',
  verdict: dependencyPass === dependencies.length ? 'PASS' : 'FAIL',
  evidence: ['PBI/Done', 'Docs/Evidence'],
  detail: `${dependencyPass}/${dependencies.length} PBI-uri V3 în Done, fiecare cu \`completed_at\`, README fără „De completat", raport comis și comanda raportului prezentă în \`package.json\``,
});

row({
  id: 'artifact-derived',
  area: 'Artefact',
  title: 'Capabilitățile și controalele sunt derivate, iar verificările artefactului trec',
  verdict: 'PENDING',
  owner: 'proprietarul 202 (release V3)',
  evidence: [
    'Docs/Evidence/202-v3-release/capabilities.json',
    'Docs/Evidence/202-v3-release/controls.json',
  ],
  detail: `${capabilitiesSummary.capabilities} capabilități, ${capabilitiesSummary.notDelivered} limitări declarate, ${controlsSummary.actions} acțiuni de control`,
});

row({
  id: 'controls-real',
  area: 'Controale',
  title: 'Fiecare control documentat există în cod; niciunul nu este inventat',
  verdict: controlsChecks.every((check) => check.passed) ? 'PASS' : 'FAIL',
  evidence: ['Docs/Evidence/202-v3-release/controls.md', 'src/settings/store.ts'],
  detail: `${controlsSummary.consumed} acțiuni cu consumator real, ${controlsSummary.declaredOnly} declarate fără listener, ${controlsSummary.pointerImplemented} gesturi de pointer implementate`,
});

row({
  id: 'character-chain',
  area: 'Verificare',
  title: 'Lanțul personaj–mașină trece în toate cele trei moduri, cu o singură autoritate',
  verdict: c1?.verdict === 'PASS' ? 'PASS' : 'FAIL',
  evidence: ['Docs/Evidence/201-v3-validation/report.json'],
  detail: `${c1?.verdict ?? 'MISSING'}: ${oneLine(c1?.basis ?? 'criteriul C1 lipsește')}`,
});

row({
  id: 'digest-integrity',
  area: 'Verificare',
  title: 'Mersul nu alterează catalogul, KPI-urile, XP-ul sau starea zilnică',
  verdict: c2?.verdict === 'PASS' ? 'PASS' : 'FAIL',
  evidence: ['Docs/Evidence/201-v3-validation/report.json'],
  detail: `${c2?.verdict ?? 'MISSING'}: ${oneLine(c2?.basis ?? 'criteriul C2 lipsește')}`,
});

row({
  id: 'contract25-v3',
  area: 'Performanță',
  title: 'Contractul 25 pe workload-ul V3, inclusiv streamingul vizual',
  verdict: c3?.verdict === 'PASS' ? 'PASS' : 'NOT_RUN',
  owner: 'proprietarul 201/224',
  evidence: [
    'Docs/Evidence/201-v3-validation/report.json',
    'Docs/Evidence/224-performance-gate/report.json',
  ],
  detail: `${c3?.verdict ?? 'MISSING'}: ${oneLine(c3?.basis ?? 'criteriul C3 lipsește')}`,
});

row({
  id: 'v1-regression',
  area: 'Regresii',
  title: 'Regresia V1 rămâne fără eșecuri și fără pierderi de XP',
  verdict:
    (v1Regression.summary?.fail ?? 0) === 0 && (v1Regression.summary?.rows ?? 0) > 0
      ? 'PASS'
      : 'FAIL',
  evidence: ['Docs/Evidence/216-v1-regression/report.json'],
  detail: `${v1Regression.summary?.pass ?? 0}/${v1Regression.summary?.rows ?? 0} rânduri PASS, ${v1Regression.summary?.fail ?? 0} FAIL, ${v1Regression.summary?.notRun ?? 0} NOT_RUN`,
});

row({
  id: 'v2-parameter-gate',
  area: 'Catalog',
  title: 'Catalogul de 80 de chei rămâne certificat, fără findings',
  verdict:
    gateReport.verdict === 'PASS' && (gateReport.findings ?? []).length === 0 ? 'PASS' : 'FAIL',
  evidence: ['Docs/Evidence/187-v2-parameter-gate/report.json'],
  detail: `${gateReport.capability?.declared ?? 0}/80 chei, ${(gateReport.findings ?? []).length} findings, verdict ${gateReport.verdict}`,
});

row({
  id: 'walking-save',
  area: 'Salvare',
  title: 'Slotul V3 păstrează poziția, camera și autoritatea, iar migrarea este validă',
  verdict: saveModel.summary?.pass === true ? 'PASS' : 'FAIL',
  evidence: ['Docs/Evidence/200-v3-walking-save/report.json'],
  detail: `${saveModel.summary?.passed ?? 0}/${saveModel.summary?.checks ?? 0} verificări, ${saveModel.summary?.scenariosPassed ?? 0}/${saveModel.summary?.scenarios ?? 0} scenarii, ${saveModel.summary?.refusalsClosed ?? 0}/${saveModel.summary?.refusals ?? 0} refuzuri închise`,
});

row({
  id: 'walking-tutorial',
  area: 'Misiuni',
  title: 'Tutorialul nu blochează accesul la taxiuri și nu inventează XP',
  verdict:
    tutorialModel.summary?.pass === true &&
    tutorialModel.policy?.taxiAccess === 'NEVER_GATED' &&
    tutorialModel.policy?.walkingTimeXp === 'NOT_IMPLEMENTED'
      ? 'PASS'
      : 'FAIL',
  evidence: ['Docs/Evidence/199-v3-walking-tutorial/report.json'],
  detail: `${tutorialModel.summary?.steps ?? 0} pași, ${tutorialModel.summary?.positives ?? 0} pozitive, ${tutorialModel.summary?.negatives ?? 0} refuzuri, acces taxiuri ${tutorialModel.policy?.taxiAccess}`,
});

row({
  id: 'docs-scope',
  area: 'Documentație',
  title: 'Docs/20 descrie scope-ul real și trimite la artefactul V3',
  verdict: 'PENDING',
  owner: 'proprietarul 202 (release V3)',
  evidence: [docs20Path, 'Docs/Evidence/202-v3-release/capabilities.md'],
  detail:
    'secțiunea finală generată există, iar promisiunea de XP pentru timpul de mers a fost înlocuită cu `NOT_IMPLEMENTED`',
});

row({
  id: 'hardware-fps-v3',
  area: 'Performanță',
  title: 'FPS, frame p95/p99 și lucru GPU pe hardware real, ambele backenduri',
  verdict: 'NOT_RUN',
  owner: 'operatorul cu GPU real + proprietarul 224',
  evidence: [
    'Docs/Evidence/224-performance-gate/report.json',
    'Docs/Evidence/201-v3-validation/report.json',
  ],
  detail: `224: \`fps-hardware = ${fpsRow?.verdict ?? 'NOT_VALIDATED'}\`, release \`${performanceGate.summary?.release ?? 'NOT_VALIDATED'}\`; FPS headless nu este raportat ca FPS real.`,
});

row({
  id: 'harness-v3-timing',
  area: 'Performanță',
  title: 'Harness de performanță cu workload-ul V3 (personaj, pietoni, pericole)',
  verdict: 'NOT_RUN',
  owner: 'proprietarul 220/224',
  evidence: ['Docs/Evidence/201-v3-validation/report.json'],
  detail: `${oneLine(validationModel.workload?.timing?.reason ?? 'workload-ul V3 nu are probe de timp')} (workload \`${validationModel.workload?.id ?? '?'}\`)`,
});

row({
  id: 'visual-streaming',
  area: 'Performanță',
  title: 'Streamingul vizual: cei doi pași `NOT_MEASURED` ai lui 157',
  verdict: 'NOT_RUN',
  owner: 'proprietarul 157/223',
  evidence: [
    'Docs/Evidence/157-render-budget/report.json',
    'Docs/Evidence/201-v3-validation/report.json',
  ],
  detail:
    'Doi pași cer renderer real; 157 raportează `STRUCTURAL_PASS` cu 2 `NOT_MEASURED`, nu o măsurătoare vizuală.',
});

row({
  id: 'soak-v3',
  area: 'Performanță',
  title: 'Soak V3 de 60 de minute pe workload-ul cu personaj',
  verdict: 'NOT_RUN',
  owner: 'proprietarul 159/224',
  evidence: ['Docs/Evidence/159-soak/report.json', 'Docs/Evidence/201-v3-validation/report.json'],
  detail:
    'Soak-ul comis (60,002 min, 20 cicluri) este pe workload-ul V1 și citit din dovezi, nu reexecutat; nu are variantă cu personaj, pietoni și pericole.',
});

row({
  id: 'playtest-human',
  area: 'Experiență',
  title: 'Playtest uman cu minimum cinci participanți',
  verdict: 'NOT_RUN',
  owner: 'proprietarul 235/216',
  evidence: ['Docs/Evidence/235-fun-qa/report.json', 'Docs/Evidence/216-v1-regression/report.json'],
  detail: `235: \`${funQa.playtest?.status ?? 'NOT_RUN'}\`, ${funQa.playtest?.participants ?? 0}/${funQa.playtest?.requiredParticipants ?? 5} participanți; rândul C3 al lui 216 rămâne \`NOT_RUN\`.`,
});

row({
  id: 'qa-ui-153',
  area: 'Moștenire',
  title:
    'QA vizual 153: opt defecte medii, inclusiv două componente ieșite din viewport la 200% zoom',
  verdict: uiQa.summary?.verdict === 'FAIL' ? 'FAIL' : 'PASS',
  owner: 'proprietarul 153 (QA vizual)',
  evidence: ['Docs/Evidence/153-ui-qa/report.json'],
  detail: `${uiQa.summary?.failed ?? 0}/${uiQa.summary?.checks ?? 0} verificări eșuate, ${uiFindings.length} defecte MEDIUM deschise (${uiFindings.map((finding) => finding.id).join(', ')})`,
});

row({
  id: 'fun-experience-235',
  area: 'Moștenire',
  title: 'Experiența 235: confort HUD/cameră și playtestul rămân deschise',
  verdict: funFailures.length === 0 && funNotRun.length === 0 ? 'PASS' : 'FAIL',
  owner: 'proprietarul 235 (experiență)',
  evidence: ['Docs/Evidence/235-fun-qa/report.json'],
  detail: `${funFailures.map((criterion) => criterion.id).join(', ') || 'niciun FAIL'} eșuat, ${funNotRun.map((criterion) => criterion.id).join(', ') || 'niciun NOT_RUN'} neexecutat; ${funQa.summary?.pass ?? 0}/${funQa.summary?.criteria ?? 0} criterii PASS`,
});

row({
  id: 'inherited-v2-gates',
  area: 'Moștenire',
  title: 'Deschiderile checklist-ului V2 rămân vizibile în release-ul V3',
  verdict: v2Open.length === 0 ? 'PASS' : 'FAIL',
  owner: 'proprietarii rândurilor din 190 (224, 220, 159, 216/235)',
  evidence: ['Docs/Evidence/190-v2-release/release-checklist.json'],
  detail:
    v2Open.length === 0
      ? 'checklist-ul 190 nu are rânduri deschise'
      : `190 păstrează ${v2Open.length} rânduri deschise: ${v2Open.map(code).join(', ')}`,
});

row({
  id: 'remeasure-224',
  area: 'Performanță',
  title: 'Dovada comisă a gate-ului 224 este pe revizia curentă',
  verdict: 'NOT_RUN',
  owner: 'proprietarul 224',
  evidence: [
    'Docs/Evidence/224-performance-gate/report.json',
    'Docs/Evidence/201-v3-validation/gate-measure/report.json',
  ],
  detail:
    '201 a reexecutat gate-ul într-un director propriu (`structural PASS`), fără să suprascrie dovada comisă a lui 224; `--check` pe dovada comisă rămâne deschis.',
});

row({
  id: 'extended-keys-56',
  area: 'Scope',
  title: 'Cele 56 de chei extinse nu sunt livrabile end-to-end',
  verdict: 'NOT_RUN',
  owner: 'proprietarul etapei de plan (migrarea `KEY_EXTENSION_STAGE`)',
  evidence: [
    'src/learning/candidate-validation.ts',
    'Docs/Evidence/187-v2-parameter-gate/report.json',
  ],
  detail: `${profiles.reservedParameterKeys.length} chei rezervate; validarea candidaților le refuză cu codul etapei, iar exportul le scrie \`null\`.`,
});

row({
  id: 'walking-time-xp',
  area: 'Scope',
  title: 'XP pentru timpul de mers nu este implementat',
  verdict: 'NOT_RUN',
  owner: 'proprietarul 199/213',
  evidence: ['Docs/Evidence/199-v3-walking-tutorial/report.json'],
  detail: `\`walkingTimeXp = ${tutorialModel.policy?.walkingTimeXp}\`, \`xpGranted = ${tutorialModel.learning?.xpGranted}\`; Docs/20 declară explicit această lipsă.`,
});

row({
  id: 'in-game-composition',
  area: 'Scope',
  title: 'Contractele V3 sunt headless, nu cablate într-o sesiune de browser',
  verdict: 'NOT_RUN',
  owner: 'proprietarul compoziției aplicației (src/main.ts)',
  evidence: ['src/main.ts'],
  detail: `${composition.characterReferences} referințe la \`character\`, ${composition.authorityReferences} la \`authority\`, ${composition.walkerReferences} la \`walker\` în \`src/main.ts\`; dovada este contractul și raportul, nu o sesiune jucabilă.`,
});

const checklistSummary = {
  rows: checklistRows.length,
  pass: checklistRows.filter((entry) => entry.verdict === 'PASS').length,
  fail: checklistRows.filter((entry) => entry.verdict === 'FAIL').length,
  notRun: checklistRows.filter((entry) => entry.verdict === 'NOT_RUN').length,
  open: checklistRows.filter((entry) => entry.verdict !== 'PASS').length,
  release: checklistRows.every((entry) => entry.verdict === 'PASS') ? 'PASS' : 'NOT_VALIDATED',
  ready: checklistRows.every((entry) => entry.verdict === 'PASS'),
};

// ---------------------------------------------------------------------------------------------
// 7. Documentația de release: Docs/20 primește o secțiune finală generată. Orice promisiune de XP
//    pentru mers este eliminată; documentul trimite la artefact și la rândurile deschise.
// ---------------------------------------------------------------------------------------------

const docs20Text = readText(docs20Path);
const staleXpPromise = docs20Text.includes('Mersul activ poate contribui la XP de timp');
const docsStatesNotImplemented =
  docs20Text.includes('walkingTimeXp') && docs20Text.includes('NOT_IMPLEMENTED');
const sectionBegin = '<!-- release:v3:begin -->';
const sectionEnd = '<!-- release:v3:end -->';

function releaseSectionFor(sectionRows) {
  return [
    sectionBegin,
    '## Artefactul de release V3 (PBI 202)',
    '',
    '> Secțiune generată determinist de `npm run release:v3`. Nu edita manual între marcaje.',
    '',
    `Release-ul V3 se închide ca **${checklistSummary.release}**: ${checklistSummary.pass} rânduri \`PASS\`, ${checklistSummary.fail} \`FAIL\`, ${checklistSummary.notRun} \`NOT_RUN\`. Un verdict \`PASS\` ar cere zero rânduri deschise.`,
    '',
    `Dependențele V3 sunt **${dependencyPass}/${dependencies.length}** în \`PBI/Done\`, cu \`completed_at\`, dovezi fără „De completat" și raport propriu. Artefactul complet este în [Evidence/202-v3-release](Evidence/202-v3-release/README.md): [capabilități](Evidence/202-v3-release/capabilities.md), [controale](Evidence/202-v3-release/controls.md) și [checklist](Evidence/202-v3-release/release-checklist.md).`,
    '',
    '### Ce poți face, cu nivelul real de livrare',
    '',
    ...table(
      ['Capabilitate', 'Contract', 'Dovadă', 'Nivel'],
      capabilityRows.map((entry) => [
        oneLine(entry.title),
        code(entry.contract),
        code(entry.evidence[0]),
        'HEADLESS_CONTRACT',
      ]),
    ),
    '',
    `Toate cele ${capabilityRows.length} capabilități sunt contracte headless dovedite de rapoartele 188–201. \`src/main.ts\` nu le compune: ${composition.characterReferences} referințe la \`character\`, ${composition.authorityReferences} la \`authority\` și ${composition.walkerReferences} la \`walker\`. O sesiune jucabilă în browser rămâne un pas de compunere, nu o funcționalitate declarată aici.`,
    '',
    '### Controale',
    '',
    `Din cele ${controlsSummary.actions} acțiuni 009, ${controlsSummary.consumed} au consumator real în cod (${driveActions.length} la 066, două la 067, una la 030), iar ${controlsSummary.declaredOnly} sunt declarate și remapabile prin 080 fără listener de tastatură. Alergarea are canal în 193, dar nu are binding. Tabelul complet, cu tastele reale și gesturile de pointer, este în [Evidence/202-v3-release/controls.md](Evidence/202-v3-release/controls.md).`,
    '',
    '### Ce rămâne deschis',
    '',
    ...(sectionRows.length === 0
      ? ['Niciun rând deschis.']
      : sectionRows.map(
          (entry) =>
            `- \`${entry.id}\` (**${entry.verdict}**) — ${oneLine(entry.detail)} · owner: ${oneLine(entry.owner ?? 'neatribuit')}`,
        )),
    '',
    '### Corectură de onestitate',
    '',
    'XP-ul pentru timpul de mers este declarat explicit `walkingTimeXp` = `NOT_IMPLEMENTED` și `xpGranted` = 0 de contractul 199, iar Docs/20 nu îl mai prezintă ca livrabil. `src/` nu a fost modificat de acest PBI.',
    '',
    'Comenzi: `npm run release:v3` scrie artefactele și această secțiune; `npm run release:v3 -- --check` refuză un artefact neactualizat.',
    sectionEnd,
  ].join('\n');
}

function withReleaseSection(text, section) {
  const beginIndex = text.indexOf(sectionBegin);
  const endIndex = text.indexOf(sectionEnd);
  if (beginIndex !== -1 && endIndex !== -1 && endIndex > beginIndex) {
    return `${text.slice(0, beginIndex)}${section}${text.slice(endIndex + sectionEnd.length)}`;
  }
  return `${text.replace(/\s*$/, '')}\n\n${section}\n`;
}

// ---------------------------------------------------------------------------------------------
// 8. Verificările artefactului: fail-closed, ca un rând fără sursă să oprească release-ul.
// ---------------------------------------------------------------------------------------------

const evidenceExists = (path) => exists(path);

function capabilityLevelHonest() {
  if (composition.verdict === 'COMPOSED') return true;
  return capabilityRows.length > 0 && capabilityRows.every((entry) => entry.limitation.length > 0);
}

const checks = [
  {
    id: 'dependencies-done',
    passed: dependencyPass === dependencies.length,
    detail: `${dependencyPass}/${dependencies.length} PBI-uri 191–201 în Done, cu dovezi și raport`,
  },
  {
    id: 'capability-evidence',
    passed: capabilityRows.every((entry) => entry.evidence.every(evidenceExists)),
    detail: `${capabilityRows.filter((entry) => entry.evidence.every(evidenceExists)).length}/${capabilityRows.length} capabilități cu toate fișierele de dovadă existente`,
  },
  {
    id: 'capability-level-honest',
    passed: capabilityLevelHonest(),
    detail:
      composition.verdict === 'NOT_COMPOSED'
        ? `compoziția de browser nu referențiază contractele (${composition.characterReferences}/${composition.authorityReferences}/${composition.walkerReferences}); fiecare capabilitate declară limitarea`
        : 'compoziția de browser referențiază contractele',
  },
  {
    id: 'not-delivered-declared',
    passed:
      notDelivered.length >= 5 &&
      notDelivered.every((entry) => entry.owner.length > 0 && entry.evidence.every(evidenceExists)),
    detail: `${notDelivered.length} limitări declarate, fiecare cu owner și dovadă existentă`,
  },
  {
    id: 'controls-fail-closed',
    passed: controlsChecks.every((entry) => entry.passed),
    detail: `${controlsChecks.filter((entry) => entry.passed).length}/${controlsChecks.length} verificări de controale`,
  },
  {
    id: 'reserved-keys',
    passed:
      profiles.reservedParameterKeys.length === 56 &&
      profiles.reservedParameterKeys.every((key) => profiles.isReservedParameterKey(key)) &&
      readText('src/learning/candidate-validation.ts').includes('KEY_EXTENSION_STAGE'),
    detail: `${profiles.reservedParameterKeys.length} chei rezervate, refuz \`KEY_EXTENSION_STAGE\` prezent`,
  },
  {
    id: 'catalog-composition',
    passed:
      challengesReport.compatibility?.composed?.v1 === 12 &&
      challengesReport.compatibility?.composed?.extended === 15 &&
      challengesReport.learningKeys?.extended === 56 &&
      challengesReport.learningKeys?.covered === 15,
    detail: `catalog compus ${challengesReport.compatibility?.composed?.total ?? 0} (${challengesReport.compatibility?.composed?.v1 ?? 0} V1 + ${challengesReport.compatibility?.composed?.extended ?? 0} extinse), acoperire chei ${challengesReport.learningKeys?.covered ?? 0}/${challengesReport.learningKeys?.extended ?? 0}`,
  },
  {
    id: 'walking-xp-not-promised',
    passed: !staleXpPromise && docsStatesNotImplemented,
    detail: staleXpPromise
      ? 'Docs/20 încă afirmă că mersul poate contribui la XP de timp'
      : 'Docs/20 declară `walkingTimeXp` = `NOT_IMPLEMENTED` și nu mai promite XP de mers',
  },
  {
    id: 'docs-section-generated',
    passed: true,
    detail:
      'secțiunea finală generată există, trimite la artefact și declară `walkingTimeXp` = `NOT_IMPLEMENTED`',
  },
  {
    id: 'checklist-owners',
    passed: checklistRows.every((entry) => entry.verdict === 'PASS' || entry.owner !== null),
    detail: `${checklistRows.filter((entry) => entry.verdict !== 'PASS' && entry.owner === null).length} rânduri deschise fără owner`,
  },
  {
    id: 'release-verdict-rule',
    passed:
      (checklistSummary.release === 'PASS') === (checklistSummary.open === 0) &&
      (checklistSummary.release === 'PASS') === checklistSummary.ready,
    detail: `${checklistSummary.open} rânduri deschise, verdict ${checklistSummary.release}`,
  },
  {
    id: 'evidence-files',
    passed: exists('Docs/Evidence/202-v3-release'),
    detail: 'directorul de dovezi al release-ului există',
  },
];

// The generated Docs/20 section is validated against its own required content, so a write mode run
// is self-consistent; `--check` separately refuses a different file on disk.
const docsSectionProbe = withReleaseSection(docs20Text, releaseSectionFor([]));
const docsSectionCheck = checks.find((check) => check.id === 'docs-section-generated');
docsSectionCheck.passed =
  docsSectionProbe.includes(sectionBegin) &&
  docsSectionProbe.includes('Evidence/202-v3-release/capabilities.md') &&
  docsSectionProbe.includes('NOT_IMPLEMENTED') &&
  docsSectionProbe.includes(sectionEnd);

// Checklist rows that depend on the artifact itself are resolved once the checks are known.
function resolveArtifactRows() {
  const derived =
    checks.find((check) => check.id === 'controls-fail-closed')?.passed === true &&
    checks.find((check) => check.id === 'capability-evidence')?.passed === true;
  const docs =
    checks.find((check) => check.id === 'docs-section-generated')?.passed === true &&
    checks.find((check) => check.id === 'walking-xp-not-promised')?.passed === true;
  for (let index = 0; index < checklistRows.length; index += 1) {
    const entry = checklistRows[index];
    if (entry.id === 'artifact-derived') {
      checklistRows[index] = Object.freeze({ ...entry, verdict: derived ? 'PASS' : 'FAIL' });
    }
    if (entry.id === 'docs-scope') {
      checklistRows[index] = Object.freeze({ ...entry, verdict: docs ? 'PASS' : 'FAIL' });
    }
  }
  checklistSummary.pass = checklistRows.filter((entry) => entry.verdict === 'PASS').length;
  checklistSummary.fail = checklistRows.filter((entry) => entry.verdict === 'FAIL').length;
  checklistSummary.notRun = checklistRows.filter((entry) => entry.verdict === 'NOT_RUN').length;
  checklistSummary.open = checklistRows.filter((entry) => entry.verdict !== 'PASS').length;
  checklistSummary.release = checklistRows.every((entry) => entry.verdict === 'PASS')
    ? 'PASS'
    : 'NOT_VALIDATED';
  checklistSummary.ready = checklistSummary.release === 'PASS';
}

resolveArtifactRows();

const openRowsFinal = checklistRows.filter((entry) => entry.verdict !== 'PASS');
const releaseSectionFinal = releaseSectionFor(openRowsFinal);
const expectedDocs20 = withReleaseSection(docs20Text, releaseSectionFinal);
const docs20Current = expectedDocs20 === docs20Text;

const verdictCheck = checks.find((check) => check.id === 'release-verdict-rule');
verdictCheck.passed =
  (checklistSummary.release === 'PASS') === (checklistSummary.open === 0) &&
  (checklistSummary.release === 'PASS') === checklistSummary.ready;
verdictCheck.detail = `${checklistSummary.open} rânduri deschise, verdict ${checklistSummary.release}`;

const finalArtifactVerdict = checks.every((check) => check.passed) ? 'PASS' : 'FAIL';

// ---------------------------------------------------------------------------------------------
// 9. Fișierele generate.
// ---------------------------------------------------------------------------------------------

const capabilitiesJson = {
  version: '202-v3-capabilities-v1',
  command: 'npm run release:v3',
  generatedBy: 'scripts/run-v3-release-artifact.mjs',
  derivation: {
    sources: [
      'PBI/Done/191…201',
      'Docs/Evidence/191…201/report.json',
      'src/character/index.ts',
      'src/input/authority-arbiter.ts',
      'src/settings/store.ts',
      'src/main.ts',
    ],
    rule: 'Fiecare capabilitate este legată de contractul și raportul comis al PBI-ului care o livrează; numerele sunt citite din raport, iar nivelul de livrare este derivat din compoziția reală (`src/main.ts`).',
    honestyRule:
      'Un contract headless nu este prezentat ca funcționalitate jucabilă în browser; limitările 199 (XP de mers), 157/201 (streaming vizual) și etapa de plan (56 de chei) sunt declarate explicit.',
  },
  composition,
  capabilities: capabilityRows.map((entry) => ({ ...entry, level: 'HEADLESS_CONTRACT' })),
  notDelivered,
  summary: capabilitiesSummary,
  checks,
  verdict: finalArtifactVerdict,
};

const capabilitiesMarkdown = [
  '# Capabilitățile release-ului V3 (PBI 202)',
  '',
  '> Fișier generat determinist de `npm run release:v3`. Nu edita manual.',
  '',
  `**Verdict al artefactului: ${finalArtifactVerdict}.** ${capabilityRows.length} capabilități derivate din contractele și rapoartele 191–201, fiecare cu nivelul real de livrare. Dependențe V3 în Done: **${dependencyPass}/${dependencies.length}**.`,
  '',
  '## Ce poți face în contractele livrate',
  '',
  ...table(
    ['#', 'Capabilitate', 'Contract', 'Ce poți face', 'Dovadă', 'Nivel'],
    capabilityRows.map((entry, index) => [
      String(index + 1),
      oneLine(entry.title),
      code(entry.contract),
      oneLine(entry.what),
      entry.evidence.map(code).join('<br>'),
      'HEADLESS_CONTRACT',
    ]),
  ),
  '',
  '## Numerele reale din rapoarte',
  '',
  ...table(
    ['Capabilitate', 'Indicatori derivați'],
    capabilityRows.map((entry) => [
      oneLine(entry.title),
      Object.entries(entry.metrics)
        .map(([key, value]) => `${code(key)} ${formatNumber(value)}`)
        .join('<br>'),
    ]),
  ),
  '',
  '## Nivelul de livrare, derivat din compoziție',
  '',
  `\`${composition.bootstrap}\` conține ${composition.characterReferences} referințe la \`character\`, ${composition.authorityReferences} la \`authority\`, ${composition.walkerReferences} la \`walker\`, ${composition.driveBindingReferences} la adaptorul de tastatură și ${composition.modeBindingReferences} la adaptorul de moduri. Nivelul raportat este **${composition.verdict}**: capabilitățile sunt module headless dovedite, nu o sesiune de browser.`,
  '',
  '## Ce nu este livrat end-to-end',
  '',
  ...table(
    ['Limitare', 'Stare', 'Detaliu', 'Owner', 'Dovadă'],
    notDelivered.map((entry) => [
      oneLine(entry.title),
      code(entry.state),
      oneLine(entry.detail),
      oneLine(entry.owner),
      entry.evidence.map(code).join('<br>'),
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
  '## Comenzi',
  '',
  '```bash',
  'npm run release:v3',
  'npm run release:v3 -- --check',
  '```',
  '',
].join('\n');

const controlsJson = {
  version: '202-v3-controls-v1',
  command: 'npm run release:v3',
  generatedBy: 'scripts/run-v3-release-artifact.mjs',
  sources: [
    'src/settings/store.ts',
    'src/settings/contracts.ts',
    'src/input/keyboard-drive.ts',
    'src/input/mode-keyboard.ts',
    'src/input/recovery-input.ts',
    'src/input/authority-arbiter.ts',
    'src/ui/key-remapping-format.ts',
    'src/rendering/babylon/vehicle-camera-input.ts',
    'src/rendering/babylon/vehicle-picking-input.ts',
    'src/ui/fleet-panel.ts',
    'src/ui/panel-focus.ts',
  ],
  derivation:
    'Tastele vin din `createDefaultSettings(...).input.bindings` (009). Consumatorii sunt derivați din adaptoarele reale: 066 pentru cele șapte acțiuni de condus, 067 pentru M/L, 030 pentru R. Restul acțiunilor sunt declarate și remapabile, dar nu au listener de tastatură. Gesturile de pointer sunt citite din adaptoarele 017/018 și din panouri.',
  keyboard: keyboardRows,
  pointer: pointerRows,
  summary: controlsSummary,
  checks: controlsChecks,
  verdict: controlsChecks.every((check) => check.passed) ? 'PASS' : 'FAIL',
};

const controlsMarkdown = [
  '# Controalele reale ale release-ului V3 (PBI 202)',
  '',
  '> Fișier generat determinist de `npm run release:v3`. Nu edita manual.',
  '',
  `**Verdict: ${controlsJson.verdict}.** Tastele sunt citite din bindingurile 009, iar consumatorii din adaptoarele 066/067/030. Un binding declarat fără listener este marcat \`DECLARED_ONLY\`; niciun control nu este inventat.`,
  '',
  '## Tastatură (009 + 080)',
  '',
  ...table(
    ['Acțiune', 'Tastă', 'Vehicul', 'Personaj', 'Consumator', 'Stare', 'Remapabil'],
    keyboardRows.map((entry) => [
      code(entry.action),
      code(entry.code),
      oneLine(entry.vehicle),
      oneLine(entry.character),
      entry.consumer === null ? '—' : code(entry.consumer),
      entry.state,
      entry.remappable ? 'DA' : 'NU',
    ]),
  ),
  '',
  `**${controlsSummary.consumed} acțiuni au consumator real**, iar **${controlsSummary.declaredOnly} sunt declarate fără listener**: ${declaredOnlyRows.map((entry) => code(entry.action)).join(', ')}. Toate cele ${controlsSummary.remappable} acțiuni sunt remapabile prin 080, cu aceeași gramatică de coduri.`,
  '',
  'Starea `DECLARED_ONLY` se referă strict la bindingul de tastatură: `kpis`, `fleet`, `profile` și `pause` au butoane în UI, iar camera are un toggle separat în adaptorul de renderer (implicit `KeyC`), care nu citește bindingul 009. Remaparea unei astfel de taste schimbă settings-ul, nu și adaptorul separat.',
  '',
  '## Alergare și mers',
  '',
  'Mersul folosește aceleași taste de condus prin proiecția 193: accelerația comandă mersul înainte, frâna oprește (walker-ul 192 nu merge înapoi), iar virarea schimbă direcția cu ±π/2. Alergarea cere acțiunea `sprint`, care **nu are binding 009**: este un canal de contract, nu un control live.',
  '',
  '## Pointer',
  '',
  ...table(
    ['Gest', 'Efect', 'Stare', 'Dovadă'],
    pointerRows.map((entry) => [
      oneLine(entry.gesture),
      oneLine(entry.effect),
      entry.state,
      code(entry.evidence),
    ]),
  ),
  '',
  '## Focus și remapare',
  '',
  '- Tastele sunt ignorate în câmpuri de text, `contenteditable`, butoane, link-uri și dialoguri modale, iar focusul pierdut golește comenzile (066/070).',
  '- 067 validează toate cele 15 coduri, dar le transformă în intenții doar pe `manualMode` și `learningMode`; celelalte taste sunt păstrate pentru UI și remapare.',
  '- 080 acceptă numai coduri `KeyboardEvent.code` din gramatica închisă și refuză duplicatele; schimbarea se aplică prin `SettingsStore.replace`.',
  '- Camera vehiculului capturează pointerul numai la un gest explicit pe buton; Escape eliberează captura. Camera personajului 194 nu are binding de mouse.',
  '',
  '## Verificările controalelor',
  '',
  ...table(
    ['Verificare', 'Rezultat', 'Detaliu'],
    controlsChecks.map((check) => [
      code(check.id),
      check.passed ? 'PASS' : 'FAIL',
      oneLine(check.detail),
    ]),
  ),
  '',
  '## Comenzi',
  '',
  '```bash',
  'npm run release:v3',
  'npm run release:v3 -- --check',
  '```',
  '',
].join('\n');

const checklistJson = {
  version: '202-v3-release-checklist-v1',
  command: 'npm run release:v3',
  generatedBy: 'scripts/run-v3-release-artifact.mjs',
  baseline: '190 (checklist V2) + 201 (verdict V3)',
  dependencies,
  rows: checklistRows,
  summary: checklistSummary,
  verdict: checklistSummary.release,
  ready: checklistSummary.ready,
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
  '# Checklist de release V3 (PBI 202)',
  '',
  '> Fișier generat determinist de `npm run release:v3`. Nu edita manual.',
  '',
  `**Verdict: ${checklistSummary.release}.** ${checklistSummary.pass} \`PASS\`, ${checklistSummary.fail} \`FAIL\`, ${checklistSummary.notRun} \`NOT_RUN\`; ${checklistSummary.open} rânduri deschise, fiecare cu owner. Verdictul nu poate fi \`PASS\` cât timp există rânduri \`FAIL\` sau \`NOT_RUN\`.`,
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
  '## Dependențele V3 (191–201)',
  '',
  ...table(
    ['ID', 'Titlu', 'Fișier', 'Status', 'completed_at', 'Dovezi', 'Raport', 'Comandă', 'Verdict'],
    dependencies.map((entry) => [
      code(entry.id),
      oneLine(entry.title),
      entry.file === null ? '—' : code(entry.file),
      entry.status ?? '—',
      entry.completedAt === null ? '—' : code(entry.completedAt),
      entry.evidence === null ? '—' : code(entry.evidence),
      entry.report === null ? '—' : code(entry.report),
      entry.command === null ? '—' : code(entry.command),
      entry.verdict,
    ]),
  ),
  '',
  `**${dependencyPass}/${dependencies.length}** PBI-uri V3 sunt fizic în \`PBI/Done\`, cu \`status: Done\`, \`completed_at\` completat, un README de dovezi fără „De completat" și un raport a cărui comandă există în \`package.json\`.`,
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
  'npm run release:v3',
  'npm run release:v3 -- --check',
  '```',
  '',
].join('\n');

const outputs = [
  ['capabilities.json', `${JSON.stringify(capabilitiesJson, null, 2)}\n`],
  ['capabilities.md', capabilitiesMarkdown],
  ['controls.json', `${JSON.stringify(controlsJson, null, 2)}\n`],
  ['controls.md', controlsMarkdown],
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
  if (!docs20Current) {
    console.error(`Stale release section: ${docs20Path}`);
    stale += 1;
  }
  if (stale === 0) console.log('Release artifacts V3 are current.');
  process.exitCode = stale === 0 ? 0 : 1;
} else {
  for (const [name, content] of outputs) writeFileSync(join(evidenceDirectory, name), content);
  if (!docs20Current) writeFileSync(join(root, docs20Path), expectedDocs20);
  console.log(`Wrote ${outputs.length} files to ${evidenceDirectory}`);
}

for (const check of checks)
  console.log(`${check.passed ? 'PASS' : 'FAIL'} CHECK ${check.id} (${check.detail})`);
for (const entry of checklistRows)
  if (entry.verdict !== 'PASS' && entry.owner === null)
    console.log(`FAIL OWNER ${entry.id}: open row without owner`);
console.log(
  `SUMMARY dependencies ${dependencyPass}/${dependencies.length}, capabilities ${capabilityRows.length}, controls ${controlsSummary.consumed}/${controlsSummary.actions} consumed, notDelivered ${notDelivered.length}, checklist ${checklistSummary.pass} PASS / ${checklistSummary.fail} FAIL / ${checklistSummary.notRun} NOT_RUN, release ${checklistSummary.release}, artifact ${finalArtifactVerdict}`,
);

if (finalArtifactVerdict !== 'PASS') process.exitCode = 1;

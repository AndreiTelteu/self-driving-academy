import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '197-v3-fleet-switch'),
  defaultOutput = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function metres(value) {
  if (value === null || value === undefined) return '—';
  if (value === 0) return '0';
  return Math.abs(value) < 1e-6 ? value.toExponential(2) : value.toFixed(4);
}

function yesNo(value) {
  return value ? 'DA' : 'NU';
}

function markdown(report) {
  const policy = report.policy;
  const reference = report.reference;
  const scenarios = report.scenarios
    .map(
      (row) =>
        `| \`${row.id}\` | ${row.label} | \`${row.command}\` | ${row.result}${row.code ? ` \`${row.code}\`` : ''}${row.cause ? ` / \`${row.cause}\`` : ''} | \`${row.authorityBefore}\` → \`${row.authorityAfter}\` | \`${row.cameraBefore}\` → \`${row.cameraAfter}\` | ${yesNo(row.cameraDiverged)} | ${row.entitiesBefore} → ${row.entitiesAfter} | ${yesNo(row.characterMoved)} | ${row.resumeSource ?? '—'} | ${row.verdict} |`,
    )
    .join('\n');
  const focus = report.focus;
  const chain = report.chain.steps
    .map(
      (step) =>
        `| \`${step.step}\` | ${step.tick} | \`${step.authority}\` | \`${step.trackedEntityId}\` | ${step.entities} | ${yesNo(step.projectionValid)} | ${yesNo(step.authorityResolves)} | ${yesNo(step.cameraResolves)} |`,
    )
    .join('\n');
  const returns = report.returns
    .map(
      (entry) =>
        `| \`${entry.branch}\` | ${entry.label} | ${entry.accepted ? 'ACCEPTED' : 'REFUSED'} | \`${entry.resumeSource}\` | ${yesNo(entry.identicalToPrevious)} | ${entry.rejectionCode ? `\`${entry.rejectionCode}\`` : '—'} | \`${entry.oldPointWalker}\` | \`${entry.exitPointWalker}\` | ${metres(entry.resumeClearanceM)} | \`${entry.authorityAfter}\` | ${entry.vehicleMode} | ${entry.entitiesBefore} → ${entry.entitiesAfter} | ${entry.verdict} |`,
    )
    .join('\n');
  const projections = report.projection.cases
    .map(
      (entry) =>
        `| \`${entry.id}\` | ${entry.expected} | ${entry.accepted ? 'ACCEPTED' : `REFUSED \`${entry.code}\``} | \`${entry.controlledLabel ?? '—'}\` | ${entry.mode ?? '—'} (${entry.modeSource ?? '—'}) | \`${entry.trackedEntityId ?? '—'}\` | ${yesNo(entry.diverged)} | ${entry.divergenceReason ?? '—'} | ${entry.verdict} |`,
    )
    .join('\n');
  const limitations = report.limitations.map((entry) => `- ${entry}`).join('\n');
  return `# 197 — schimbare rapidă taxi și revenire la mers

Transcript determinist generat de \`${report.generatedBy}\`; comanda comisă este \`${report.command}\`.
Machine-readable: [report.json](report.json). Contract: \`${report.contract}\`, tick fix la
${report.tickHz} Hz, tranziție de cameră ${policy.cameraTransitionTicks} tick-uri, distanța probei FOCUS
${metres(policy.focusProofDistanceM)} m, raza de preluare TAKE ${metres(policy.takeReachM)} m
(aceeași din 195), marjă liberă ${metres(policy.minimumClearanceM)} m, plafon de treaptă
${metres(policy.maxGroundStepM)} m.

## Sumar

- Scenarii trecute: **${report.summary.scenariosPassed}/${report.summary.scenarios}**.
- Criteriul 1 (FOCUS mută doar camera: poziție bit-identică, entități neschimbate, camera pe taxi): **${report.summary.focus ? 'PASS' : 'FAIL'}**.
- TAKE (preluare reală 195, refuz pe taxi distant/indisponibil/deja ținut): **${report.summary.take ? 'PASS' : 'FAIL'}**.
- Revenire la mers (ambele ramuri: poziție veche validă și zid peste ea): **${report.summary.returnToWalking ? 'PASS' : 'FAIL'}**.
- Lanțul FOCUS → TAKE → RETURN fără stare intermediară inconsistentă: **${report.summary.chain ? 'PASS' : 'FAIL'}**.
- Proiecția de UI și garda de coerență: **${report.summary.projection ? 'PASS' : 'FAIL'}** (${report.projection.accepted} valide, ${report.projection.refused} refuzate).
- Determinism: ${report.determinism.runs} rulări identice: **${yesNo(report.determinism.identical)}**, SHA-256 \`${report.determinism.digest}\`.
- Verdict general: **${report.summary.pass ? 'PASS' : 'FAIL'}**.

## Referințe reale

| Referință | Valoare | Sursă |
| --- | ---: | --- |
| Hartă | \`${reference.mapId}\` | PBI 042 \`createNeighbourhoodMap\` |
| Elemente de layout | ${reference.cityElements} | \`createCityLayout\` |
| Suprafețe de mers | ${reference.surfaces} | contractul 192 |
| Solide (clădiri/obstacole) | ${reference.blockers} | amprentele reale ale clădirilor |
| Raza corpului (m) | ${metres(reference.characterRadiusM)} | PBI 191 amprenta 0,300 × 0,260 m |
| Înălțimea corpului (m) | ${metres(reference.characterHeightM)} | PBI 191 |
| Collider sedan (m) | ${metres(reference.vehicleColliderHalfExtentsM.x)} × ${metres(reference.vehicleColliderHalfExtentsM.z)} | PBI 022/145 |
| Bordura reală (m) | ${metres(reference.sidewalkElevationM)} | PBI 042 |
| Raza de preluare TAKE (m) | ${metres(reference.takeReachM)} | PBI 195 (jumătatea anvergurii 191) |

## Scenarii: comandă → autoritate → cameră → entități → personaj mutat? → verdict

| Scenariu | Descriere | Comandă | Rezultat | Autoritate | Cameră | Diferă | Entități | Personaj mutat | Revenire | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${scenarios}

Fiecare rând este o comandă separată. \`FOCUS\` nu schimbă niciodată autoritatea și nu mută corpul;
\`TAKE\` este exact intrarea 195 (sau ieșirea 196 urmată de ea, când pornești dintr-o mașină);
\`RETURN\` este ieșirea validă 196 urmată de reluarea corpului. Refuzurile au codul comenzii și, pentru
cele compuse, cauza reală din 195/196.

## Criteriul 1 — FOCUS pe un taxi la ${metres(focus.distanceM)} m

| Dovadă | Rezultat |
| --- | --- |
| Taxi urmărit | \`${focus.vehicleId}\` la ${metres(focus.distanceM)} m |
| Autoritatea înainte / după | \`${focus.authorityBefore}\` / \`${focus.authorityAfter}\` |
| Biți IEEE-754 ai poziției (înainte) | \`${focus.characterBitsBefore}\` |
| Biți IEEE-754 ai poziției (după) | \`${focus.characterBitsAfter}\` |
| Poziție bit-identică | ${yesNo(focus.positionBitsIdentical)} |
| Distanța maximă mișcată de corp (m) | ${metres(focus.characterMovedM)} |
| Entități înainte / după | ${focus.entitiesBefore} / ${focus.entitiesAfter} |
| Entitatea trimisă camerei | \`${focus.cameraTrackedEntityId}\` |
| Autoritatea trimisă camerei | \`${focus.cameraAuthorityEntityId}\` |
| Camera diferă de entitatea controlată | ${yesNo(focus.cameraDiverged)} |
| Tick-uri rămase la început / la sfârșit | ${focus.cameraRemainingStart} / ${focus.cameraRemainingEnd} |
| Cadre de tranziție | ${focus.cameraTransitionFrames}/${focus.cameraTransitionTicks} |
| Fiecare cadru raportează taxiul | ${yesNo(focus.cameraEveryFrameIsTracked)} |
| Tranziții / clonări / scrieri de țintă | ${focus.cameraTransitions} / ${focus.cameraEntityClones} / ${focus.cameraTargetWrites} |
| A doua comandă FOCUS pe același taxi | \`${focus.cameraSameEntityRefusal}\` |
| Starea se reia din JSON | ${yesNo(focus.stateRoundTrip)} |
| Proiecția trece garda | ${yesNo(focus.projectionValid)} |

Camera reală 194 este pornită pe personaj, apoi pașită pe taxi în tick-ul FOCUS: primul cadru
raportează deja taxiul, tranziția existentă durează exact ${focus.cameraTransitionTicks} cadre, iar
corpul personajului nu s-a mișcat cu niciun bit.

## Lanțul FOCUS → TAKE → RETURN

| Pas | Tick | Autoritate | Cameră | Entități | Proiecție validă | Autoritate rezolvabilă | Cameră rezolvabilă |
| --- | ---: | --- | --- | ---: | --- | --- | --- |
${chain}

Tranzițiile de cameră măsurate: FOCUS ${report.chain.focusTransitionFrames} cadre, TAKE
${report.chain.takeTransitionFrames} cadre (aceeași țintă, deci nicio tranziție nouă), RETURN
${report.chain.returnTransitionFrames} cadre. Entitățile rămân constante, fiecare autoritate și fiecare
țintă de cameră se rezolvă la o entitate existentă, iar proiecția fiecărui pas trece garda: nu există
stare intermediară cu autoritatea fără entitate sau camera pe o entitate inexistentă.

## Revenirea la mers — ambele ramuri

| Ramură | Descriere | Rezultat | Sursă | Biți identici | Motiv respingere | Walker punct vechi | Walker punct ieșire | Marjă (m) | Autoritate | Mod mașină | Entități | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- |
${returns}

Ramura \`resume\` folosește poziția fizică dinainte de preluare: este încă validă, deci este reluată bit
cu bit. Ramura \`wall\` construiește o clădire peste ea: punctul vechi este refuzat de walker-ul 192 cu
\`WALK_START_BLOCKED\`, iar contractul folosește punctul valid al ieșirii 196, care este acceptat de
walker și păstrează marja liberă. Mașina eliberată revine în \`AUTO\` în ambele ramuri.

## Proiecția de UI și garda de coerență

| Caz | Așteptat | Rezultat | Entitate controlată | Mod | Entitate urmărită | Diferă | Motiv | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${projections}

Proiecția expune entitatea controlată (\`CHARACTER:<id>\` / \`VEHICLE:<id>\`), modul, sursa modului,
entitatea urmărită de cameră, steagul de divergență și motivul \`FOCUS\`. Garda refuză o mașină
controlată în \`AUTO\`, o cameră pe personaj cât timp o mașină este controlată fără motiv de \`FOCUS\`,
un steag care contrazice id-urile, o entitate necunoscută, un mod care nu vine din starea 024 și un
număr de entități care nu corespunde listei.

## Determinism

${report.determinism.runs} rulări complete, ${report.determinism.identical ? 'identice' : 'DIFERITE'};
amprenta SHA-256 a raportului (fără câmpul de determinism) este \`${report.determinism.digest}\`.

## Limitări

${limitations}
`;
}

const suite = await import(
    pathToFileURL(join(root, 'tests', 'character', 'fleet-switch-suite.ts')).href
  ),
  started = process.hrtime.bigint(),
  report = suite.runFleetSwitchReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  output = argument('--output') ?? defaultOutput;

for (const row of report.scenarios)
  console.log(
    `${row.verdict} ${row.id}: ${row.command} ${row.result}${row.code ? ` ${row.code}` : ''}${row.cause ? `/${row.cause}` : ''}, authority ${row.authorityBefore} -> ${row.authorityAfter}, camera ${row.cameraAfter}, entities ${row.entitiesBefore}->${row.entitiesAfter}, character moved ${row.characterMoved ? 'yes' : 'no'}`,
  );
console.log(
  `SUMMARY scenarios ${report.summary.scenariosPassed}/${report.summary.scenarios}, focus ${report.summary.focus ? 'PASS' : 'FAIL'}, take ${report.summary.take ? 'PASS' : 'FAIL'}, return ${report.summary.returnToWalking ? 'PASS' : 'FAIL'}, chain ${report.summary.chain ? 'PASS' : 'FAIL'}, projection ${report.summary.projection ? 'PASS' : 'FAIL'}, focus distance ${report.focus.distanceM} m, camera transition ${report.focus.cameraTransitionFrames}/${report.focus.cameraTransitionTicks}, return transition ${report.chain.returnTransitionFrames}/${report.focus.cameraTransitionTicks}, determinism ${report.determinism.identical ? 'identical' : 'DIFFERENT'}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);
console.log(
  `COST local wall time ${(Number(process.hrtime.bigint() - started) / 1e6).toFixed(1)} ms (not part of the report)`,
);
console.log(
  `REFERENCE map ${report.reference.mapId}, city elements ${report.reference.cityElements}, surfaces ${report.reference.surfaces}, blockers ${report.reference.blockers}, reach ${report.reference.takeReachM}`,
);
console.log(`DIGEST sha256 ${report.determinism.digest}`);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`Fleet switch report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Fleet switch report is current: ${output}`);
  const markdownSaved = await readFile(reportMarkdown, 'utf8');
  if (markdownSaved !== markdown(report)) {
    console.error(`Fleet switch markdown is stale: ${reportMarkdown}`);
    process.exitCode = 1;
  } else console.log(`Fleet switch markdown is current: ${reportMarkdown}`);
} else {
  await mkdir(directory, { recursive: true });
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown(report));
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}

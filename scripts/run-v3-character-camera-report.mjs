import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '194-v3-camera'),
  defaultOutput = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function metres(value) {
  if (value === null) return '—';
  if (value === 0) return '0';
  return Math.abs(value) < 1e-6 ? value.toExponential(2) : value.toFixed(4);
}

function radians(value) {
  return `${value.toFixed(4)} rad (${((value * 180) / Math.PI).toFixed(1)}°)`;
}

function markdown(report) {
  const reference = report.reference;
  const policy = report.policy;
  const scenarios = report.scenarios
    .map(
      (entry) =>
        `| \`${entry.id}\` | ${entry.label} | \`${entry.entityId}\` (${entry.targetKind}) | ${entry.obstacleId ? `\`${entry.obstacleId}\`` : '—'} | ${metres(entry.requestedDistanceM)} | ${metres(entry.finalDistanceM)} | ${metres(entry.minClearanceM)} | ${entry.obstructedTicks}/${entry.ticks} | ${metres(entry.stableTailM)} | ${entry.verdict} |`,
    )
    .join('\n');
  const transition = report.transition;
  const refusal = report.refusal;
  const serialization = report.serialization;
  const noClone = report.noClone;
  const settings = report.settings
    .map(
      (entry) =>
        `| \`${entry.setting}\` | ${entry.fromValue} → ${entry.toValue} | ${entry.metric} | ${metres(entry.measured)} | ${entry.changed ? 'DA' : 'NU'} |`,
    )
    .join('\n');
  const limitations = report.limitations.map((entry) => `- ${entry}`).join('\n');
  return `# 194 — cameră third person pentru personaj

Transcript determinist generat de \`${report.generatedBy}\`; comanda comisă este \`${report.command}\`.
Machine-readable: [report.json](report.json). Contract: \`${report.contract}\`, tick fix la
${report.tickHz} Hz, tranziție de autoritate pe ${policy.transitionTicks} tick-uri.

## Sumar

- Scenarii de urmărire/coliziune trecute: **${report.summary.scenariosPassed}/${report.summary.scenarios}**.
- Criteriul 1a (urmărire pe \`entityId\`, tranziție interpolată, refuzuri): **${report.summary.criterion1a ? 'PASS' : 'FAIL'}**.
- Criteriul 1b (rază trunchiată la obstacol, inclusiv colțul): **${report.summary.criterion1b ? 'PASS' : 'FAIL'}**.
- Criteriul 2 (setările 009 se aplică, fără al doilea sistem): **${report.summary.criterion2 ? 'PASS' : 'FAIL'}**.
- Stare serializabilă și reluare identică: **${report.summary.serializable ? 'PASS' : 'FAIL'}**.
- Fără clonare/scriere a entității urmărite: **${report.summary.noCloning ? 'PASS' : 'FAIL'}**.
- Determinism: ${report.determinism.runs} rulări, identice: **${report.determinism.identical ? 'DA' : 'NU'}**, SHA-256 \`${report.determinism.digest}\`.
- Verdict general: **${report.summary.pass ? 'PASS' : 'FAIL'}**.

## Referințe reale

| Referință | Valoare | Sursă |
| --- | ---: | --- |
| Hartă | \`${reference.mapId}\` | PBI 042 \`createNeighbourhoodMap\` |
| Elemente de layout | ${reference.cityElements} | \`createCityLayout\` |
| Suprafețe de mers | ${reference.surfaces} | contractul 192 |
| Solide/clădiri | ${reference.blockers} | amprentele reale ale clădirilor |
| Clădire folosită | \`${reference.buildingId}\` | prima clădire cu fațada sudică accesibilă |
| Înălțimea ochilor personajului (m) | ${metres(reference.characterEyeHeightM)} | PBI 191 \`createCharacterAsset().measured.eyeHeightM\` |
| Collider sedan (m) | ${metres(reference.vehicleColliderHalfExtentsM.x)} × ${metres(reference.vehicleColliderHalfExtentsM.z)} | PBI 022/145 \`VEHICLE_COLLISION_HALF_EXTENTS_M\` |

Politica camerei: rază ${metres(policy.cameraRadiusM)} m, marjă obstacol
${metres(policy.obstacleMarginM)} m, clearance față de sol ${metres(policy.groundClearanceM)} m,
distanță ${metres(policy.minDistanceM)}–${metres(policy.maxDistanceM)} m, pitch
${radians(policy.minPitchRad)}…${radians(policy.maxPitchRad)}.

## Scenarii: entitate → obstacol → distanță finală → verdict

| Scenariu | Descriere | Entitate | Obstacol | Distanță cerută (m) | Distanță finală (m) | Clearance min (m) | Tick-uri obstruate | Coadă stabilă (m) | Verdict |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
${scenarios}

Distanța este măsurată de la ancora ochilor la centrul camerei. Clearance-ul este distanța liberă
dintre sfera camerei (rază ${metres(policy.cameraRadiusM)} m) și cea mai apropiată cutie de obstacol,
măsurată independent de controller. „Coada stabilă” este deplasarea maximă dintre cadrele
consecutive din ultimele 20 de tick-uri; zero înseamnă nicio oscilație.

## Criteriul 1a — urmărirea \`entityId\` și tranziția

| Dovadă | Rezultat |
| --- | --- |
| Tick-uri totale (30 personaj + ${transition.transitionTicks} tranziție) | ${transition.ticks} |
| \`entityId\` din primul cadru după schimbare | \`${transition.firstFrameEntityId}\` (autoritatea: \`${transition.toEntityId}\`) |
| \`entityId\` din ultimul cadru | \`${transition.lastFrameEntityId}\` |
| Fiecare cadru raportează autoritatea tick-ului | ${transition.everyFrameEntityIsAuthority ? 'DA' : 'NU'} |
| Cadre de tranziție | **${transition.transitionFrames}/${transition.transitionTicks}** |
| Tick-uri rămase la început / la sfârșit | ${transition.remainingStart} / ${transition.remainingEnd} |
| Deplasare maximă între două cadre din tranziție (m) | ${metres(transition.maxStepM)} |
| Fără teleport (deplasare < 2 m/tick) | ${transition.noTeleport ? 'DA' : 'NU'} |
| Distanță finală după tranziție (m) | ${metres(transition.settledDistanceM)} |
| Clonări de entitate / scrieri de țintă | ${transition.entityClones} / ${transition.targetWrites} |
| Tranziție către aceeași entitate | refuzată: ${refusal.sameEntityAccepted ? 'NU' : 'DA'} (\`${refusal.sameEntityReason}\`) |
| Tranziție către entitate necunoscută | refuzată: ${refusal.unknownEntityAccepted ? 'NU' : 'DA'} (\`${refusal.unknownEntityReason}\`) |
| Tranziții pornite de tick-urile pe aceeași entitate | ${refusal.sameEntityStepTransitions} |
| Pas cu \`entityId\` necunoscut | \`${refusal.unknownStepCode}\` (${refusal.unknownStepRefusals} refuz) |
| Clonări după refuzuri | ${refusal.entityCloneCountAfterRefusals} |

Dovada fără clonare: ținta este înghețată (\`${noClone.targetFrozen ? 'DA' : 'NU'}\`), poziția ei
este înghețată (\`${noClone.positionFrozen ? 'DA' : 'NU'}\`), iar după ${noClone.ticks} tick-uri
conținutul ei este neschimbat (\`${noClone.targetUnchanged ? 'DA' : 'NU'}\`); controllerul raportează
${noClone.entityClones} clonări și ${noClone.targetWrites} scrieri de țintă.

## Criteriul 2 — setările de mișcare existente

| Setare | Valori | Metrică | Măsurat | Schimbat |
| --- | --- | --- | ---: | --- |
${settings}

Sursa este contractul PBI 009 \`ControlPreferences\`, citit prin \`parseControlPreferences\`;
\`cameraMotion\` controlează factorul de urmărire, \`fov\` controlează câmpul vizual. Un control
invalid este refuzat de contract: ${report.settingsContractRefused ? 'DA' : 'NU'}. Distanța și
inversarea de axă sunt intenție explicită de orbită, nu un al doilea sistem de setări.

## Stare serializabilă

| Dovadă | Rezultat |
| --- | --- |
| Bytes JSON ai stării salvate | ${serialization.savedBytes} |
| Tranziție salvată în stare | ${serialization.transitionSaved ? 'DA' : 'NU'} |
| Entități cunoscute în stare | ${serialization.knownEntities} |
| Cadre identice după \`restore\` | **${serialization.identicalAfterRestore ? 'DA' : 'NU'}** (${serialization.framesCompared} cadre) |
| Versiune necunoscută refuzată | ${serialization.tamperedVersionRefused ? 'DA' : 'NU'} |

## Determinism

${report.determinism.runs} rulări complete, ${report.determinism.identical ? 'identice' : 'DIFERITE'};
amprenta SHA-256 a raportului (fără câmpul de determinism) este \`${report.determinism.digest}\`.

## Limitări

${limitations}
`;
}

const suite = await import(
    pathToFileURL(join(root, 'tests', 'character', 'character-camera-suite.ts')).href
  ),
  started = process.hrtime.bigint(),
  report = suite.runCharacterCameraReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  output = argument('--output') ?? defaultOutput;

for (const entry of report.scenarios)
  console.log(
    `${entry.verdict} ${entry.id}: entity ${entry.entityId}, obstacle ${entry.obstacleId ?? 'none'}, requested ${entry.requestedDistanceM.toFixed(2)} m, final ${entry.finalDistanceM.toFixed(4)} m, clearance ${entry.minClearanceM === null ? 'n/a' : entry.minClearanceM.toFixed(4)} m, obstructed ${entry.obstructedTicks}/${entry.ticks}`,
  );
console.log(
  `SUMMARY scenarios ${report.summary.scenariosPassed}/${report.summary.scenarios}, criterion1a ${report.summary.criterion1a ? 'PASS' : 'FAIL'}, criterion1b ${report.summary.criterion1b ? 'PASS' : 'FAIL'}, criterion2 ${report.summary.criterion2 ? 'PASS' : 'FAIL'}, serializable ${report.summary.serializable ? 'PASS' : 'FAIL'}, no cloning ${report.summary.noCloning ? 'PASS' : 'FAIL'}, determinism ${report.determinism.identical ? 'identical' : 'DIFFERENT'}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);
console.log(
  `COST local wall time ${(Number(process.hrtime.bigint() - started) / 1e6).toFixed(1)} ms (not part of the report)`,
);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`Character camera report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Character camera report is current: ${output}`);
  const markdownSaved = await readFile(reportMarkdown, 'utf8');
  if (markdownSaved !== markdown(report)) {
    console.error(`Character camera markdown is stale: ${reportMarkdown}`);
    process.exitCode = 1;
  } else console.log(`Character camera markdown is current: ${reportMarkdown}`);
} else {
  await mkdir(directory, { recursive: true });
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown(report));
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}

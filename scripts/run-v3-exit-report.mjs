import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '196-v3-exit'),
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

function candidateReason(candidate) {
  if (candidate.valid) return 'valid';
  return `\`${candidate.code}\`${candidate.blockerId ? ` (\`${candidate.blockerId}\`)` : ''}`;
}

function plain(value) {
  if (value === null || value === undefined || value === 'null') return '—';
  return String(value).replace(/^"|"$/g, '');
}

function markdown(report) {
  const policy = report.policy;
  const reference = report.reference;
  const scenarios = report.scenarios
    .map(
      (row) =>
        `| \`${row.id}\` | ${row.label} | ${row.result}${row.code ? ` \`${row.code}\`` : ''} | ${row.attempts} | ${row.chosen ? `\`${row.chosen.id}\`` : '—'} | ${metres(row.measured?.maxPenetrationM)} | ${metres(row.measured?.minClearanceM)} | ${metres(row.measured?.groundClearanceM)} | ${row.walkerStart} | ${row.verdict} |`,
    )
    .join('\n');
  const candidates = report.scenarios
    .flatMap((row) => row.candidates.map((candidate) => ({ row, candidate })))
    .map(
      ({ row, candidate }) =>
        `| \`${row.id}\` | \`${candidate.id}\` | ${candidate.side}/${candidate.ring} | ${candidate.valid ? 'DA' : 'NU'} | ${candidateReason(candidate)} | ${metres(candidate.groundM)} | ${metres(candidate.clearanceM)} |`,
    )
    .join('\n');
  const authority = report.authority;
  const resumption = report.resumption
    .map(
      (entry) =>
        `| \`${entry.vehicleId}\` | ${entry.baselineMode} → ${entry.previousMode} → ${entry.mode} | ${entry.fields.map((field) => (field.identical ? 'DA' : 'NU')).join(' / ')} | ${plain(entry.fields[2].released)} | ${plain(entry.fields[3].released)} | ${entry.bitsIdentical ? 'DA' : 'NU'} |`,
    )
    .join('\n');
  const resumeFields = report.resumption[0]
    ? report.resumption[0].fields.map((field) => `\`${field.field}\``).join(', ')
    : '';
  const camera = report.camera;
  const limitations = report.limitations.map((entry) => `- ${entry}`).join('\n');
  const colliderCandidates = report.scenarios.reduce(
    (total, row) => total + row.colliderRefusals.candidates,
    0,
  );
  const colliderRefused = report.scenarios.reduce(
    (total, row) => total + row.colliderRefusals.refusedByWalker,
    0,
  );
  return `# 196 — ieșirea din mașină și punct valid

Transcript determinist generat de \`${report.generatedBy}\`; comanda comisă este \`${report.command}\`.
Machine-readable: [report.json](report.json). Contract: \`${report.contract}\`, tick fix la
${report.tickHz} Hz, mod de eliberare \`${policy.releaseMode}\`, marjă liberă ${metres(policy.clearanceM)} m,
inel secundar la ${metres(policy.stepOutM)} m, plafon de treaptă ${metres(policy.maxGroundStepM)} m,
viteză maximă de ieșire ${metres(policy.maxExitSpeedMps)} m/s.

## Sumar

- Scenarii trecute: **${report.summary.scenariosPassed}/${report.summary.scenarios}**.
- Criteriul 1 (punct fizic valid, refuz pe fiecare motiv, fără teleport): **${report.summary.criterion1 ? 'PASS' : 'FAIL'}**.
- Criteriul 2a (autoritatea revine la personaj, vehiculul nu mai primește input): **${report.summary.criterion2a ? 'PASS' : 'FAIL'}**.
- Criteriul 2b (mașina eliberată reia ruta de dinainte de preluare, mod AUTO): **${report.summary.criterion2b ? 'PASS' : 'FAIL'}**.
- Camera 194 revine în același tick, cu tranziția existentă de ${camera.transitionTicks} tick-uri: **${report.summary.camera ? 'PASS' : 'FAIL'}**.
- Walker-ul 192 acceptă punctul ales și refuză fiecare candidat cu collider: **${report.summary.walkerStart ? 'PASS' : 'FAIL'}** (${colliderRefused}/${colliderCandidates}).
- Determinism: ${report.determinism.runs} rulări identice: **${report.determinism.identical ? 'DA' : 'NU'}**, SHA-256 \`${report.determinism.digest}\`.
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

## Scenarii: candidat ales, distanțe măsurate independent, verdict

| Scenariu | Descriere | Rezultat | Candidați testați | Ales | Penetrare max (m) | Marjă min (m) | Sub sol (m) | Start walker | Verdict |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | --- | --- |
${scenarios}

Distanțele sunt măsurate independent de contract, cu \`measurePenetration\` din fixtures 192, față de
**fiecare** solid și **fiecare** caroserie: penetrarea maximă este 0, marja minimă este pozitivă, iar
cota punctului este exact suprafața autorată (0 sub sol). Un rând \`REFUSED\` nu are punct, deci nu are
distanțe.

## Candidați: ordinea deterministă și motivul fiecărui refuz

| Scenariu | Candidat | Latură/inel | Valid | Motiv | Sol (m) | Marjă (m) |
| --- | --- | --- | --- | --- | ---: | ---: |
${candidates}

Ordinea este fixă: \`LEFT:R0\`, \`RIGHT:R0\`, \`REAR:R0\`, \`FRONT:R0\`, apoi același inel secundar la
${metres(policy.stepOutM)} m. Un candidat este respins dacă amprenta 191 atinge caroseria eliberată
(\`SOLID\` cu id-ul mașinii), altă mașină (\`OTHER_VEHICLE\`), un solid autorat (\`SOLID\`), dacă treapta
depășește bordura reală (\`STEP_TOO_HIGH\`) sau dacă suprafața este sub planul hărții (\`BELOW_MAP\`).
Când niciun candidat nu supraviețuiește, ieșirea este refuzată cu \`NO_VALID_EXIT\` și corpul nu este
mutat nicăieri.

## Criteriul 2a — autoritatea revine la personaj în același tick

| Dovadă | Rezultat |
| --- | --- |
| Autoritatea după ieșire | \`${authority.authorityConsumer}:${authority.characterId}\` |
| Comanda produsă de arbitrajul 193 | \`${authority.commandConsumer}\` |
| Comenzi de vehicul înainte / după | ${authority.vehicleCommandsBefore} / ${authority.vehicleCommandsAfter} |
| Comenzi livrate personajului în tick-ul ieșirii | ${authority.characterCommandsAfter} |
| Livrare către vehicul după tranziție | refuzată: ${authority.vehicleDeliveryRefused ? 'DA' : 'NU'} (\`${authority.vehicleRefusalCode}\`) |
| A doua livrare în același tick | refuzată: ${authority.doubleDeliveryRefused ? 'DA' : 'NU'} (\`${authority.doubleDeliveryCode}\`) |
| Acțiuni ținute neutralizate la tranziție | ${authority.neutralizedActions.map((action) => `\`${action}\``).join(', ') || '—'} |
| Comanda personajului la tranziție este vidă | ${authority.characterCommandEmpty ? 'DA' : 'NU'} |
| Tranziții de autoritate | ${authority.transitions} |
| Entități înainte / după | ${authority.entityCountBefore} / ${authority.entityCountAfter} |
| A doua ieșire în același tick | refuzată: ${authority.secondExitSameTickRefused ? 'DA' : 'NU'} (\`${authority.secondExitSameTickCode}\`) |
| Ieșire repetată după eliberare | \`${authority.reExitAfterReleaseCode}\` |
| Startul walker-ului acceptat | ${authority.startAccepted ? 'DA' : 'NU'} |
| Biți poziție de start (IEEE-754) | \`${authority.startPositionBits}\` |

O singură autoritate primește input: vehiculul este inactiv imediat, iar a doua livrare din tick este
refuzată. Un \`throttle\` ținut peste tranziție rămâne neutralizat, deci nici personajul nu primește
imediat o comandă de mers.

## Criteriul 2b — mașina eliberată reia ruta de dinainte de preluare

| Vehicul | Mod (baseline → preluare → eliberare) | Câmpuri identice | Cursă | Progres (m) | Amprentă identică |
| --- | --- | --- | --- | ---: | --- |
${resumption}

Câmpurile comparate sunt ${resumeFields}. Snapshot-ul de referință este cel de **dinainte de preluare**
(195): ieșirea nu copiază starea condusă manual, ci restaurează atribuirea de rută și păstrează doar
viteza, cota și tick-ul curent. Amprenta \`vehicleExitRouteBits\` codifică fiecare număr ca 8 bytes
IEEE-754 și fiecare text ca puncte de cod; o variație de 1e-12 m sau o bandă lipsă o schimbă. Modul
devine \`AUTO\` chiar și când mașina era \`LEARNING\` înainte de preluare.

## Camera 194 — aceeași autoritate, în același tick

| Dovadă | Rezultat |
| --- | --- |
| Tick-ul ieșirii / tick-ul cadrului | ${camera.tick} / ${camera.tick} |
| Autoritatea trimisă camerei | \`${camera.authorityEntityId}\` (anterior \`${camera.previousEntityId}\`) |
| \`entityId\` din primul cadru | \`${camera.frameEntityId}\` |
| Schimbare în același tick | ${camera.sameTick ? 'DA' : 'NU'} |
| Tranziție pornită | ${camera.transitioning ? 'DA' : 'NU'} |
| Tick-uri rămase la început / la sfârșit | ${camera.remainingStart} / ${camera.remainingEnd} |
| Cadre de tranziție | ${camera.transitionFrames}/${camera.transitionTicks} |
| Fiecare cadru raportează autoritatea | ${camera.everyFrameIsAuthority ? 'DA' : 'NU'} |
| Clonări / scrieri de țintă | ${camera.entityClones} / ${camera.targetWrites} |

## Determinism

${report.determinism.runs} rulări complete, ${report.determinism.identical ? 'identice' : 'DIFERITE'};
amprenta SHA-256 a raportului (fără câmpul de determinism) este \`${report.determinism.digest}\`.

## Limitări

${limitations}
`;
}

const suite = await import(
    pathToFileURL(join(root, 'tests', 'character', 'exit-vehicle-suite.ts')).href
  ),
  started = process.hrtime.bigint(),
  report = suite.runExitReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  output = argument('--output') ?? defaultOutput;

for (const row of report.scenarios)
  console.log(
    `${row.verdict} ${row.id}: ${row.result}${row.code ? ` ${row.code}` : ''} after ${row.attempts} candidate(s)${row.chosen ? `, chose ${row.chosen.id} at ${row.chosen.clearanceM.toFixed(4)} m clearance` : ''}${row.measured ? `, penetration ${row.measured.maxPenetrationM}, ground ${row.measured.groundClearanceM}` : ''}`,
  );
console.log(
  `SUMMARY scenarios ${report.summary.scenariosPassed}/${report.summary.scenarios}, criterion1 ${report.summary.criterion1 ? 'PASS' : 'FAIL'}, criterion2a ${report.summary.criterion2a ? 'PASS' : 'FAIL'}, criterion2b ${report.summary.criterion2b ? 'PASS' : 'FAIL'}, camera ${report.summary.camera ? 'PASS' : 'FAIL'}, walker start ${report.summary.walkerStart ? 'PASS' : 'FAIL'}, entities ${report.authority.entityCountBefore}->${report.authority.entityCountAfter}, camera transition ${report.camera.transitionFrames}/${report.camera.transitionTicks}, determinism ${report.determinism.identical ? 'identical' : 'DIFFERENT'}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);
console.log(
  `COST local wall time ${(Number(process.hrtime.bigint() - started) / 1e6).toFixed(1)} ms (not part of the report)`,
);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`Exit vehicle report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Exit vehicle report is current: ${output}`);
  const markdownSaved = await readFile(reportMarkdown, 'utf8');
  if (markdownSaved !== markdown(report)) {
    console.error(`Exit vehicle markdown is stale: ${reportMarkdown}`);
    process.exitCode = 1;
  } else console.log(`Exit vehicle markdown is current: ${reportMarkdown}`);
} else {
  await mkdir(directory, { recursive: true });
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown(report));
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}

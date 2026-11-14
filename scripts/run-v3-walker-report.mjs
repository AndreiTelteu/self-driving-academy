import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '192-v3-walker'),
  defaultOutput = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function metres(value) {
  if (value === 0) return '0';
  return Math.abs(value) < 1e-6 ? value.toExponential(2) : value.toFixed(4);
}

function markdown(report) {
  const pills = report.capsule;
  const reference = report.reference;
  const scenarios = report.scenarios
    .map(
      (entry) =>
        `| \`${entry.id}\` | ${entry.label} | ${entry.steps} | \`${metres(entry.finalPositionM.x)}, ${metres(entry.finalPositionM.y)}, ${metres(entry.finalPositionM.z)}\` | ${metres(entry.distanceM)} | ${metres(entry.maxPenetrationM)} | ${entry.finalClipId} | ${entry.stepUps}/${entry.stepDowns}/${entry.stepRefusals}/${entry.vehicleContacts} | ${entry.verdict} |`,
    )
    .join('\n');
  const clips = report.clipFromMeasuredSpeed
    .map(
      (entry) =>
        `| ${entry.situation} | ${metres(entry.measuredSpeedMps)} | \`${entry.clipId}\` | \`${entry.expectedClipId}\` | ${entry.pass ? 'PASS' : 'FAIL'} |`,
    )
    .join('\n');
  const limitations = report.limitations.map((entry) => `- ${entry}`).join('\n');
  const mutation = report.vehicleMutation;
  const registration = report.registrationRefusal;
  const authority = report.authority;
  return `# 192 — controller fizic pentru mers pe jos

Transcript determinist generat de \`${report.generatedBy}\`; comanda comisă este \`${report.command}\`.
Machine-readable: [report.json](report.json). Contract: \`${report.contract}\`, tick fix la
${report.tickHz} Hz.

## Sumar

- Scenarii de deplasare/coliziune trecute: **${report.summary.scenariosPassed}/${report.summary.scenarios}**.
- Penetrare maximă măsurată în orice solid: **${metres(report.summary.maxPenetrationM)} m**.
- Criteriul 1 (nu trece prin clădiri și vehicule): **${report.summary.criterion1 ? 'PASS' : 'FAIL'}**.
- Criteriul 2 (fizica de mers nu dublează corpurile auto): **${report.summary.criterion2 ? 'PASS' : 'FAIL'}**.
- Autoritate unică, cadru de render bit-identic: **${report.summary.singleAuthority ? 'PASS' : 'FAIL'}**.
- Determinism: ${report.determinism.runs} rulări, identice: **${report.determinism.identical ? 'DA' : 'NU'}**, SHA-256 \`${report.determinism.digest}\`.
- Verdict general: **${report.summary.pass ? 'PASS' : 'FAIL'}**.

## Referințe reale

| Referință | Valoare | Sursă |
| --- | ---: | --- |
| Hartă | \`${reference.mapId}\` | PBI 042 \`createNeighbourhoodMap\` |
| Elemente de layout | ${reference.cityElements} | \`createCityLayout\` |
| Suprafețe de mers | ${reference.surfaces} | pardoseli autorate + interiorul insulei |
| Solide statice | ${reference.blockers} (${reference.buildings} clădiri) | amprentele reale ale clădirilor |
| Elevația trotuarului (m) | ${metres(reference.sidewalkElevationM)} | \`CITY_LAYOUT_DEFAULTS.sidewalkElevationM\` |
| Bandă de trotuar folosită | \`${reference.sidewalkStrip}\` | prima bandă cu bordură reală peste carosabil |
| Clădire folosită | \`${reference.buildingId}\` | prima clădire cu fațada sudică accesibilă |
| Collider vehicul (m) | ${metres(reference.vehicleColliderHalfExtentsM.x)} × ${metres(reference.vehicleColliderHalfExtentsM.z)} | PBI 022/145 \`VEHICLE_COLLISION_HALF_EXTENTS_M\`, clasa ${reference.vehicleClassId} |

Capsula personajului: rază ${metres(pills.radiusM)} m, înălțime ${metres(pills.heightM)} m — ${pills.source}.
Vitezele de gait sunt derivate din clipurile 191: mers ${metres(report.gaitSpeedsMps.WALK)} m/s,
alergare ${metres(report.gaitSpeedsMps.RUN)} m/s. Plafonul de treaptă este bordura reală de
${metres(report.policy.stepCeilingM)} m.

## Scenarii: pași → poziție finală → penetrare → verdict

| Scenariu | Descriere | Pași | Poziție finală (x, y, z) | Distanță (m) | Penetrare max (m) | Clip final | Trepte sus/jos/refuzate/contacte | Verdict |
| --- | --- | ---: | --- | ---: | ---: | --- | --- | --- |
${scenarios}

Poziția este centrul tălpilor, în metri. „Trepte sus/jos/refuzate” numără tick-urile cu schimbare de
nivel, episoadele de refuz și contactele noi cu un vehicul. Penetrarea este măsurată independent de
walker, din poligoanele lumii și cilindrul de ${metres(pills.radiusM)} m.

## Criteriul 2 — fizica de mers nu dublează corpurile auto

| Dovadă | Rezultat |
| --- | --- |
| Corpuri auto create de walker | **${report.vehicleBodiesCreated}** |
| Corpuri auto create după refuzuri | **${registration.bodiesAfterRefusals}** |
| \`registerVehicleBody\` refuzat | ${registration.registerVehicleBodyRefused ? 'DA' : 'NU'} (\`${registration.registerVehicleBodyCode}\`) |
| \`writeVehicleState\` refuzat | ${registration.writeVehicleStateRefused ? 'DA' : 'NU'} (\`${registration.writeVehicleStateCode}\`) |
| Poziția vehiculului neschimbată de tick-urile de mers | ${mutation.bitsUnchangedByWalking ? 'DA' : 'NU'} (biți \`${mutation.parkedBits}\`) |
| Vehicul mutat de proprietar | ${mutation.movedByOwner ? 'DA' : 'NU'} |
| Biții proprietarului păstrați după alte tick-uri | ${mutation.ownerBitsPreserved ? 'DA' : 'NU'} |
| Walker-ul a reacționat la noua poziție | ${mutation.reactionFollowedVehicle ? 'DA' : 'NU'} |
| Tick-uri de mers din proba de mutare | ${mutation.ticks} |

## Autoritatea unică și clipul din viteza reală

| Dovadă | Rezultat |
| --- | --- |
| Tick-uri | ${authority.ticks} |
| Cadre de render | ${authority.renderFrames} |
| Cadre bit-identice cu poziția walker-ului | **${authority.identicalFrames}/${authority.ticks}** |
| Scrieri de poziție ale walker-ului | ${authority.positionWrites} |
| Scrieri de poziție prin animație | ${authority.animationPositionWrites} |
| Al doilea writer | ${authority.secondWriters} |
| Scriere prin animație refuzată | ${authority.animationWriteRefused ? 'DA' : 'NU'} (\`${authority.animationWriteCode}\`) |
| Stare înghețată | ${authority.stateFrozen ? 'DA' : 'NU'} |

| Situație | Viteză măsurată (m/s) | Clip ales | Clip așteptat | Verdict |
| --- | ---: | --- | --- | --- |
${clips}

## Determinism

${report.determinism.runs} rulări complete, ${report.determinism.identical ? 'identice' : 'DIFERITE'};
amprenta SHA-256 a raportului (fără câmpul de determinism) este \`${report.determinism.digest}\`.

## Limitări

${limitations}
`;
}

const suite = await import(pathToFileURL(join(root, 'tests', 'character', 'walker-suite.ts')).href),
  started = process.hrtime.bigint(),
  report = suite.runWalkerReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  output = argument('--output') ?? defaultOutput;

for (const entry of report.scenarios)
  console.log(
    `${entry.verdict} ${entry.id}: ${entry.steps} ticks, final (${entry.finalPositionM.x.toFixed(4)}, ${entry.finalPositionM.y.toFixed(4)}, ${entry.finalPositionM.z.toFixed(4)}), distance ${entry.distanceM.toFixed(3)} m, penetration ${entry.maxPenetrationM.toExponential(2)} m, clip ${entry.finalClipId}`,
  );
console.log(
  `SUMMARY scenarios ${report.summary.scenariosPassed}/${report.summary.scenarios}, max penetration ${report.summary.maxPenetrationM.toExponential(2)} m, criterion1 ${report.summary.criterion1 ? 'PASS' : 'FAIL'}, criterion2 ${report.summary.criterion2 ? 'PASS' : 'FAIL'}, single authority ${report.summary.singleAuthority ? 'PASS' : 'FAIL'}, vehicle bodies ${report.vehicleBodiesCreated}, determinism ${report.determinism.identical ? 'identical' : 'DIFFERENT'}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);
console.log(
  `COST local wall time ${(Number(process.hrtime.bigint() - started) / 1e6).toFixed(1)} ms (not part of the report)`,
);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`Walker report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Walker report is current: ${output}`);
  const markdownSaved = await readFile(reportMarkdown, 'utf8');
  if (markdownSaved !== markdown(report)) {
    console.error(`Walker markdown is stale: ${reportMarkdown}`);
    process.exitCode = 1;
  } else console.log(`Walker markdown is current: ${reportMarkdown}`);
} else {
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown(report));
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}

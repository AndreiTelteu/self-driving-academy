import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '195-v3-enter'),
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

function reason(row) {
  if (row.access === 'ACCEPTED') return 'acces fizic confirmat';
  return `\`${row.code}\`${row.blockerId ? ` (\`${row.blockerId}\`)` : ''}`;
}

function markdown(report) {
  const policy = report.policy;
  const reference = report.reference;
  const scenarios = report.scenarios
    .map(
      (row) =>
        `| \`${row.id}\` | ${row.label} | \`${row.vehicleId}\` (${row.driverKind}) | ${metres(row.distanceM)} | ${row.access} | ${reason(row)} | ${row.verdict} |`,
    )
    .join('\n');
  const authority = report.authority;
  const preserved = report.preserved
    .map(
      (entry) =>
        `| \`${entry.vehicleId}\` | ${entry.previousMode} → ${entry.mode} | ${entry.bitsIdentical ? 'DA' : 'NU'} | ${entry.rideId ? `\`${entry.rideId}\`` : '—'} | ${entry.routeLaneIds.length} | ${metres(entry.rideProgressM)} | ${entry.fields.filter((field) => field.identical).length}/${entry.fields.length} |`,
    )
    .join('\n');
  const preservedFields = report.preserved
    .map(
      (entry) =>
        `\n**\`${entry.vehicleId}\`** — câmpuri păstrate: ${entry.fields.map((field) => `\`${field.field}\``).join(', ')}.`,
    )
    .join('\n');
  const camera = report.camera;
  const limitations = report.limitations.map((entry) => `- ${entry}`).join('\n');
  return `# 195 — intrarea în orice mașină din proximitate

Transcript determinist generat de \`${report.generatedBy}\`; comanda comisă este \`${report.command}\`.
Machine-readable: [report.json](report.json). Contract: \`${report.contract}\`, tick fix la
${report.tickHz} Hz, rază de acces ${metres(policy.interactionRadiusM)} m (jumătatea anvergurii
brațelor măsurate în 191), mod de intrare \`${policy.entryMode}\`.

## Sumar

- Scenarii de acces trecute: **${report.summary.scenariosPassed}/${report.summary.scenarios}**.
- Criteriul 1 (orice mașină existentă, cu refuzuri reale codificate): **${report.summary.criterion1 ? 'PASS' : 'FAIL'}**.
- Criteriul 2a (o singură autoritate, personajul nu mai primește input, corpul rămâne): **${report.summary.criterion2a ? 'PASS' : 'FAIL'}**.
- Criteriul 2b (starea mașinii bit-identică, doar modul devine MANUAL): **${report.summary.criterion2b ? 'PASS' : 'FAIL'}**.
- Camera 194 primește noua autoritate în același tick, cu tranziția de ${camera.transitionTicks} tick-uri: **${report.summary.camera ? 'PASS' : 'FAIL'}**.
- Determinism: ${report.determinism.runs} rulări identice: **${report.determinism.identical ? 'DA' : 'NU'}**, SHA-256 \`${report.determinism.digest}\`.
- Verdict general: **${report.summary.pass ? 'PASS' : 'FAIL'}**.

## Referințe reale

| Referință | Valoare | Sursă |
| --- | ---: | --- |
| Hartă | \`${reference.mapId}\` | PBI 042 \`createNeighbourhoodMap\` |
| Elemente de layout | ${reference.cityElements} | \`createCityLayout\` |
| Suprafețe de mers | ${reference.surfaces} | contractul 192 |
| Solide (clădiri/obstacole) | ${reference.blockers} | amprentele reale ale clădirilor |
| Clădire folosită pentru zidul dintre | \`${reference.cornerBuildingId}\` | colțul de sud-vest la (${metres(reference.cornerM.x)}, ${metres(reference.cornerM.z)}) |
| Atingerea personajului (m) | ${metres(reference.characterReachM)} | PBI 191 \`createCharacterAsset().measured.armSpanM / 2\` |
| Collider sedan (m) | ${metres(reference.vehicleColliderHalfExtentsM.x)} × ${metres(reference.vehicleColliderHalfExtentsM.z)} | PBI 022/145 \`VEHICLE_COLLISION_HALF_EXTENTS_M\` |

## Scenarii: vehicul → distanță → acces → motiv → verdict

| Scenariu | Descriere | Vehicul | Distanță (m) | Acces | Motiv | Verdict |
| --- | --- | --- | ---: | --- | --- | --- |
${scenarios}

Distanța este planară, de la centrul picioarelor la mijlocul flancului caroseriei, exact axa de
coliziune a walker-ului 192. Ușa este flancul cel mai apropiat; un zid, un obstacol sau o altă
caroserie oprește accesul cu \`PATH_BLOCKED\`, iar un vehicul \`IMMOBILIZED\` din 023 cu
\`VEHICLE_UNAVAILABLE\`. Taxiul aflat în cursă este acceptat: cursa nu este un motiv de refuz.

## Criteriul 2a — o singură autoritate, fără a distruge personajul

| Dovadă | Rezultat |
| --- | --- |
| Autoritatea după intrare | \`${authority.authorityConsumer}:${authority.vehicleId}\` |
| Comanda produsă de arbitrajul 193 | \`${authority.commandConsumer}\` |
| Comenzi livrate personajului înainte / după | ${authority.characterCommandsBefore} / ${authority.characterCommandsAfter} |
| Comenzi livrate vehiculului în tick-ul intrării | ${authority.vehicleCommandsAfter} |
| Livrare către personaj după tranziție | refuzată: ${authority.characterDeliveryRefused ? 'DA' : 'NU'} (\`${authority.characterRefusalCode}\`) |
| A doua livrare în același tick | refuzată: ${authority.doubleDeliveryRefused ? 'DA' : 'NU'} (\`${authority.doubleDeliveryCode}\`) |
| Acțiuni ținute neutralizate la tranziție | ${authority.neutralizedActions.map((action) => `\`${action}\``).join(', ') || '—'} |
| Tranziții de autoritate | ${authority.transitions} |
| Entități înainte / după | ${authority.entityCountBefore} / ${authority.entityCountAfter} |
| Corpul personajului păstrat | ${authority.characterBodyRetained ? 'DA' : 'NU'} |
| Biți poziție personaj înainte / după | \`${authority.characterPositionBitsBefore}\` / \`${authority.characterPositionBitsAfter}\` |
| A doua intrare în același tick | refuzată: ${authority.secondEntrySameTickRefused ? 'DA' : 'NU'} (\`${authority.secondEntrySameTickCode}\`) |
| Reintrare fără jurnal, în alt tick | \`${authority.reEntryWithoutJournalCode}\` |

Personajul nu este șters, clonat sau mutat: numărul de entități rămâne același, iar biții
IEEE-754 ai poziției autoritare sunt identici înainte și după decizie.

## Criteriul 2b — cursa mașinii este păstrată bit-identic

| Vehicul | Mod | Biți identici | Cursă | Benzi de rută | Progres (m) | Câmpuri identice |
| --- | --- | --- | --- | ---: | ---: | ---: |
${preserved}

Amprenta este calculată din biții IEEE-754 ai fiecărui număr și din codurile fiecărui text, în
ordine fixă, și **exclude doar** \`state.controlMode\`. O schimbare de 1e-12 m în poziție, viteză sau
progres, o bandă de rută lipsă sau un \`rideId\` diferit schimbă amprenta (vezi testele).
${preservedFields}

## Camera 194 — aceeași autoritate, în același tick

| Dovadă | Rezultat |
| --- | --- |
| Tick-ul intrării / tick-ul cadrului | ${camera.tick} / ${camera.tick} |
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
    pathToFileURL(join(root, 'tests', 'character', 'enter-vehicle-suite.ts')).href
  ),
  started = process.hrtime.bigint(),
  report = suite.runEnterReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  output = argument('--output') ?? defaultOutput;

for (const row of report.scenarios)
  console.log(
    `${row.verdict} ${row.id}: ${row.vehicleId} distance ${row.distanceM === null ? 'n/a' : row.distanceM.toFixed(4)} m, ${row.access}${row.code ? ` ${row.code}` : ''}${row.blockerId ? ` blocker ${row.blockerId}` : ''}`,
  );
console.log(
  `SUMMARY scenarios ${report.summary.scenariosPassed}/${report.summary.scenarios}, criterion1 ${report.summary.criterion1 ? 'PASS' : 'FAIL'}, criterion2a ${report.summary.criterion2a ? 'PASS' : 'FAIL'}, criterion2b ${report.summary.criterion2b ? 'PASS' : 'FAIL'}, camera ${report.summary.camera ? 'PASS' : 'FAIL'}, entity count ${report.authority.entityCountBefore}->${report.authority.entityCountAfter}, transitions ${report.authority.transitions}, camera transition ${report.camera.transitionFrames}/${report.camera.transitionTicks}, determinism ${report.determinism.identical ? 'identical' : 'DIFFERENT'}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);
console.log(
  `COST local wall time ${(Number(process.hrtime.bigint() - started) / 1e6).toFixed(1)} ms (not part of the report)`,
);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`Enter vehicle report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Enter vehicle report is current: ${output}`);
  const markdownSaved = await readFile(reportMarkdown, 'utf8');
  if (markdownSaved !== markdown(report)) {
    console.error(`Enter vehicle markdown is stale: ${reportMarkdown}`);
    process.exitCode = 1;
  } else console.log(`Enter vehicle markdown is current: ${reportMarkdown}`);
} else {
  await mkdir(directory, { recursive: true });
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown(report));
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}

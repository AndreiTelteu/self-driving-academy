import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '191-v3-character'),
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

function ratio(value) {
  return value.toFixed(4);
}

function markdown(report) {
  const reference = report.reference;
  const compatibility = report.compatibility.checks
    .map(
      (check) =>
        `| \`${check.id}\` | ${check.label} | ${check.unit === 'ratio' ? ratio(check.actual) : check.unit === 'count' ? check.actual : metres(check.actual)} | ${check.unit === 'ratio' ? ratio(check.reference) : check.unit === 'count' ? check.reference : metres(check.reference)} | ${metres(check.tolerance)} | ${check.pass ? 'PASS' : `REFUZAT (${check.refusal})`} | ${check.detail} |`,
    )
    .join('\n');
  const scale = report.asset.scaleTable
    .map((entry) => `| ${entry.metric} | ${metres(entry.value)} | ${entry.unit} |`)
    .join('\n');
  const clips = report.clips
    .map(
      (clip) =>
        `| \`${clip.clipId}\` | ${clip.kind} | ${clip.durationS.toFixed(3)} | ${clip.frames} | ${clip.loop ? 'da' : 'nu'} | ${clip.supportFrames}/${clip.frames} | ${clip.bothFeetFrames}/${clip.frames} | ${metres(clip.lowestMinM)} | ${metres(clip.lowestMaxM)} | ${metres(clip.toleranceM)} | ${clip.verdict}${clip.reasons.length ? ` (${clip.reasons.join(', ')})` : ''} |`,
    )
    .join('\n');
  const soles = report.clips
    .map(
      (clip) =>
        `| \`${clip.clipId}\` | ${metres(clip.leftSoleMinM)} | ${metres(clip.leftSoleMaxM)} | ${metres(clip.rightSoleMinM)} | ${metres(clip.rightSoleMaxM)} | ${metres(clip.headTopMinM)} | ${metres(clip.headTopMaxM)} |`,
    )
    .join('\n');
  const authority = report.authority.clips
    .map(
      (clip) =>
        `| \`${clip.clipId}\` | ${clip.framesSampled} | ${clip.extraTicks.length ? clip.extraTicks.join(', ') : '—'} | ${clip.identical ? 'identică' : 'DIFERITĂ'} | ${clip.mismatchedFrames} |`,
    )
    .join('\n');
  const refusals = report.refusals
    .map(
      (entry) =>
        `| ${entry.case} | ${entry.refused ? 'REFUZAT' : 'ACCEPTAT'} | ${entry.reasons.join(', ') || '—'} | ${entry.message} |`,
    )
    .join('\n');
  const authorityRefusals = report.authority.refusals
    .map(
      (entry) =>
        `| ${entry.case} | ${entry.refused ? 'REFUZAT' : 'ACCEPTAT'} | \`${entry.code ?? '—'}\` | ${entry.positionBitsUnchanged ? 'da' : 'nu'} |`,
    )
    .join('\n');
  const lods = report.visual.lods
    .map(
      (lod) =>
        `| ${lod.lod} | ${lod.parts} | ${lod.vertices} | ${lod.indices} | ${lod.gpuBytes} | ${lod.drawCalls} | ${lod.materialGroups.join(', ')} |`,
    )
    .join('\n');
  const limitations = report.limitations.map((entry) => `- ${entry}`).join('\n');
  return `# 191 — personaj: animații și reprezentare

Transcript determinist generat de \`${report.generatedBy}\`; comanda comisă este \`${report.command}\`.
Machine-readable: [report.json](report.json). Contract: \`${report.contract}\`, eșantionare la
${report.samplingHz} Hz.

## Sumar

- Verificări de scară/pivoturi: **${report.summary.compatibilityPassed}/${report.summary.compatibilityChecks}** trecute, asset **${report.compatibility.accepted ? 'ACCEPTAT' : 'REFUZAT'}**.
- Clipuri cu contact valid: **${report.summary.clipsPassed}/${report.summary.clips}**.
- Cadre verificate pentru poziția autoritară: **${report.summary.authorityFrames}**, toate bit-identice: **${report.authority.clips.every((clip) => clip.identical) ? 'DA' : 'NU'}**.
- Cazuri incompatibile refuzate: **${report.summary.refusedCases}/${report.summary.refusedCasesTotal}**.
- Determinism: ${report.determinism.runs} rulări, identice: **${report.determinism.identical ? 'DA' : 'NU'}**, SHA-256 \`${report.determinism.digest}\`.
- Verdict general: **${report.summary.pass ? 'PASS' : 'FAIL'}**.

## Referințe reale din lume

Sursa: ${reference.source}.

| Referință | Valoare | Sursă reală |
| --- | ---: | --- |
| Lățime trotuar (m) | ${metres(reference.sidewalkWidthM)} | \`CITY_LAYOUT_DEFAULTS.sidewalkWidthM\` |
| Înălțime bordură (m) | ${metres(reference.curbHeightM)} | \`CITY_LAYOUT_DEFAULTS.sidewalkElevationM\` |
| Lățime bandă (m) | ${metres(reference.laneWidthM)} | ${reference.derivation.laneCount} benzi reale, valori ${reference.derivation.laneWidthsM.join(', ')} |
| Plafon vehicul deasupra solului (m) | ${metres(reference.vehicle.doorClearanceM)} | ${reference.vehicle.classId}: \`${metres(reference.derivation.roofTopM)}\` − \`${metres(reference.derivation.wheelBottomM)}\` (PBI 145/023) |
| Prag ușă deasupra solului (m) | ${metres(reference.vehicle.sillHeightM)} | ${reference.vehicle.classId}: \`${metres(reference.derivation.bodySillM)}\` − \`${metres(reference.derivation.wheelBottomM)}\` |
| Lățime cabină între geamuri (m) | ${metres(reference.vehicle.cabinWidthM)} | fețele interioare ale geamurilor laterale ${reference.vehicle.classId} |
| Geometrie sedan NEAR (B) | ${reference.derivation.geometryGpuBytes} | \`buildVehicleGeometry('sedan','NEAR')\` |

## Scara și pivoturile assetului

Asset: \`${report.asset.id}\` (${report.asset.version}), scală ${report.asset.scale}. Declarat:
înălțime ${metres(report.asset.declared.heightM)} m, ochi ${metres(report.asset.declared.eyeHeightM)} m,
anvergură ${metres(report.asset.declared.armSpanM)} m.

| Metrică | Valoare | Unitate |
| --- | ---: | --- |
${scale}

### Verificări de compatibilitate

| ID | Verificare | Valoare | Referință | Toleranță | Verdict | Detaliu |
| --- | --- | ---: | ---: | ---: | --- | --- |
${compatibility}

### Asseturi incompatibile refuzate

| Caz | Rezultat | Motive | Mesaj |
| --- | --- | --- | --- |
${refusals}

## Clipuri, durate și contact cu solul

Contactul este măsurat prin cinematică directă din rotațiile eșantionate și cutiile tălpilor, nu din
țintele solverului. „Min/Max” este punctul cel mai de jos al scheletului în fiecare cadru.

| Clip | Tip | Durată (s) | Cadre | Buclă | Sprijin (cadre) | Ambele tălpi (cadre) | Min (m) | Max (m) | Toleranță (m) | Verdict |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
${clips}

| Clip | Talpă stângă min | Talpă stângă max | Talpă dreaptă min | Talpă dreaptă max | Vârf cap min | Vârf cap max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${soles}

Regulile aplicate: \`walk\`/\`run\` cer cel puțin un picior în contact în fiecare cadru și niciun cadru
plutitor; \`idle\` cere ambele tălpi în contact; niciun clip nu poate coborî sub sol. Toleranța este
${metres(report.clips[0]?.toleranceM ?? 0)} m.

## Poziția autoritară nu este rescrisă

Poziția de probă \`{x: 1234.5678901234567, y: -0.10000000000000009, z: 987.6543219876543}\`, yaw
\`${report.authority.yawRad}\`, entitate \`${report.authority.entityId}\`. Biții IEEE-754 ai poziției
înainte de animație: \`${report.authority.positionBits}\`. După fiecare cadru eșantionat, biții
rămân identici.

| Clip | Cadre eșantionate | Tick-uri suplimentare | Poziție | Nepotriviri |
| --- | ---: | --- | --- | ---: |
${authority}

Poziția nu este nici citită de clipuri: două autorități diferite produc exact aceiași biți de
articulații (${report.authority.positionIndependentOfAuthority ? 'DA' : 'NU'}).

| Încercare de scriere prin animație | Rezultat | Cod | Poziție neschimbată |
| --- | --- | --- | --- |
${authorityRefusals}

## Reprezentare Babylon (contract de mesh-uri)

Descrierea este derivată din contractul \`src/character/\`: pivoturi, cutii și materiale, fără poziția
entității și fără servicii de simulare. Toate cele trei LOD-uri stau pe aceleași pivoturi
(probleme de aliniere: ${report.visual.alignmentIssues.length}).

| LOD | Părți | Vârfuri | Indici | Bytes GPU | Draw calls | Grupuri de material |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
${lods}

Inventar: ${report.visual.inventoryEntries} intrări, ${report.visual.inventoryBytes} B. Buget MEDIUM:
${report.visual.budgetAccepted ? 'ACCEPTAT' : 'REFUZAT'} (${report.visual.budgetDiagnostics} diagnostice).

## Determinism

${report.determinism.runs} rulări complete, ${report.determinism.identical ? 'identice' : 'DIFERITE'};
amprenta SHA-256 a raportului (fără câmpul de determinism) este \`${report.determinism.digest}\`.

## Limitări

${limitations}
`;
}

const suite = await import(
    pathToFileURL(join(root, 'tests', 'character', 'character-suite.ts')).href
  ),
  started = process.hrtime.bigint(),
  report = suite.runCharacterReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  output = argument('--output') ?? defaultOutput;

for (const clip of report.clips)
  console.log(
    `${clip.verdict} ${clip.clipId}: ${clip.frames} frames @ ${report.samplingHz} Hz, lowest ${clip.lowestMinM.toExponential(2)}..${clip.lowestMaxM.toExponential(2)} m, support ${clip.supportFrames}/${clip.frames}, both feet ${clip.bothFeetFrames}/${clip.frames}${clip.reasons.length ? `, reasons ${clip.reasons.join(',')}` : ''}`,
  );
console.log(
  `SUMMARY compatibility ${report.summary.compatibilityPassed}/${report.summary.compatibilityChecks}, clips ${report.summary.clipsPassed}/${report.summary.clips}, authority frames ${report.summary.authorityFrames}, refused ${report.summary.refusedCases}/${report.summary.refusedCasesTotal}, visual issues ${report.summary.visualIssues}, determinism ${report.determinism.identical ? 'identical' : 'DIFFERENT'}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);
console.log(
  `COST local wall time ${(Number(process.hrtime.bigint() - started) / 1e6).toFixed(1)} ms (not part of the report)`,
);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`Character report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Character report is current: ${output}`);
  const markdownSaved = await readFile(reportMarkdown, 'utf8');
  if (markdownSaved !== markdown(report)) {
    console.error(`Character markdown is stale: ${reportMarkdown}`);
    process.exitCode = 1;
  } else console.log(`Character markdown is current: ${reportMarkdown}`);
} else {
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown(report));
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}

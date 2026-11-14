import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '200-v3-walking-save'),
  defaultOutput = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function yesNo(value) {
  return value ? 'DA' : 'NU';
}

function short(value, length = 12) {
  return value === null || value === undefined ? '—' : `\`${String(value).slice(0, length)}…\``;
}

function number(value) {
  return typeof value === 'number' ? value.toLocaleString('en-US') : String(value);
}

function markdown(report) {
  const limits = report.limits;
  const scenarios = report.scenarios
    .map(
      (row) =>
        `| \`${row.id}\` | ${row.label} | \`${row.slot}\` | v${row.sourceFormatVersion} → v${row.targetFormatVersion} | ${short(row.checksum)} | \`${row.characterSource}\` | ${yesNo(row.componentsIdentical)} | \`${row.reload.authority}\` / \`${row.reload.cameraEntityId}\` | ${row.reload.entities} | ${row.reload.bodiesCreated} | ${row.reload.xpBalance} | ${row.verdict} |`,
    )
    .join('\n');
  const refusals = report.refusals
    .map(
      (row) =>
        `| \`${row.id}\` | ${row.label} | ${row.mutation} | \`${row.code}\` | \`${row.path}\` | ${yesNo(row.inputUnchanged)} | ${row.pass ? 'PASS' : 'FAIL'} |`,
    )
    .join('\n');
  const rule = report.defaultRule.map((entry) => `- ${entry}`).join('\n');
  const limitations = report.limitations.map((entry) => `- ${entry}`).join('\n');
  const reloads = report.scenarios
    .map(
      (row) =>
        `| \`${row.id}\` | ${row.reload.paused ? 'DA' : 'NU'} | \`${row.reload.mode}\` | ${yesNo(row.reload.inputReleased)} | ${row.reload.heldKeysActive} | ${row.reload.neutralizedKeys} | ${row.reload.vehicles} | ${row.reload.entities} | ${row.reload.xpBalance} / ${row.reload.xpMicroXp} | ${row.reload.dailyRewards} | ${row.reload.settlements} | ${yesNo(row.reload.secondReadSameDigest)} |`,
    )
    .join('\n');
  const sizes = report.scenarios
    .map(
      (row) =>
        `| \`${row.id}\` | ${number(row.documentBytes)} | ${number(row.sessionBytes)} / ${number(limits.sessionBytes)} | ${number(row.economyBytes)} / ${number(limits.economyBytes)} | ${number(row.characterBytes)} / ${number(limits.characterBytes)} |`,
    )
    .join('\n');
  return `# 200 — salvarea personajului și migrare V3

Transcript determinist generat de \`${report.command}\`; contract \`${report.version}\`. Machine-readable:
[report.json](report.json). Formatul arhivei de sesiune urcă de la v1 (135) și v2 (215) la **v3**, iar
sloturile \`session\` și \`economy\` rămân **neschimbate**, cu checksum-urile lor proprii. Slotul nou
\`character\` (\`${report.characterVersion}\`) poartă poziția, camera, autoritatea, segmentele 198 și
starea de flotă 197, într-un envelope cu checksum \`SDA-CJSON-1\`/SHA-256.

## Sumar

- Verificări: **${report.summary.passed}/${report.summary.checks}**.
- Scenarii: **${report.summary.scenariosPassed}/${report.summary.scenarios}**.
- Refuzuri închise: **${report.summary.refusalsClosed}/${report.summary.refusals}**.
- Migrarea păstrează sesiunea și economia bit-identic: **${report.summary.migrationPreservesEverything ? 'PASS' : 'FAIL'}**.
- Reload coerent (pauză, autoritate, cameră, input eliberat): **${report.summary.reloadCoherent ? 'PASS' : 'FAIL'}**.
- Fără duplicate (0 corpuri create, același set de entități, al doilea reload identic): **${report.summary.noDuplicates ? 'PASS' : 'FAIL'}**.
- Depozitul neatins după migrare (re-export identic): **${report.summary.storeUntouched ? 'PASS' : 'FAIL'}**.
- Determinism: ${report.determinism.runs} rulări identice: **${yesNo(report.determinism.identical)}**, amprentă SHA-256 \`${report.determinism.digest}\`.
- Verdict general: **${report.summary.pass ? 'PASS' : 'FAIL'}**.

## Scenariu → slot → checksum → migrare → componente identice → reload → verdict

| Scenariu | Descriere | Slot | Migrare | Checksum | Sursă personaj | Componente identice | Autoritate / cameră | Entități | Corpuri create | XP | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |
${scenarios}

Checksum-ul afișat este valoarea \`SHA-256\` de 64 de caractere a envelope-ului v3; digesturile complete
ale fiecărui slot sunt în \`report.json\`. „Componente identice" compară digestul canonic al slotului
\`session\` (135: lume, progres, campanie, setări, profil, scenarii) și al slotului \`economy\` (215:
KPI, daily, XP) **înainte și după** migrare; ele sunt aceleași obiecte, deci aceiași octeți.

## Reload: pauză, autoritate, cameră, entități, XP

| Scenariu | Pauză | Mod | Input eliberat | Taste active | Taste neutralizate | Vehicule | Entități | XP / micro-XP | Recompense daily | Decontări | Al doilea reload identic |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- |
${reloads}

După reload, \`heldKeysActive\` este 0 pentru că \`restore\` din 193 neutralizează fiecare tastă ținută
la salvare: o accelerație apăsată înainte de salvare nu produce nimic după reluare. \`bodiesCreated\` este
0 structural — modulul nu are API de creare de corpuri — iar numărul de entități este exact cel salvat
(personajul plus vehiculele din slot), verificat și încă o dată la reload.

## Bilanțul de mărime

| Scenariu | Document | \`session\` | \`economy\` | \`character\` |
| --- | ---: | ---: | ---: | ---: |
${sizes}

Plafonul \`session\` și \`economy\` este exact bugetul 215; slotul \`character\` are un sfert din bugetul
unui corp de rând 130 (262 144 / 4 = ${number(limits.characterBytes)} B), suficient pentru cele patru
stări mărginite (o tranziție de cameră, un segment deschis plus unul închis, două jurnale de flotă).

## Regula pentru sesiunile fără slot de personaj

${rule}

## Refuzuri închise (checksum, slot, versiune, JSON, coerență)

| Caz | Descriere | Mutație | Cod | Cale | Input neschimbat | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
${refusals}

Fiecare refuz este evaluat pe un document real; „input neschimbat" compară digestul canonic al
intrării înainte și după apel. Modulul nu are port de scriere, deci un refuz nu poate scrie nimic.

## Limitări

${limitations}
`;
}

const suite = await import(
    pathToFileURL(join(root, 'tests', 'persistence', 'walking-save-report.ts')).href
  ),
  started = process.hrtime.bigint(),
  report = await suite.runWalkingSaveReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  output = argument('--output') ?? defaultOutput;

for (const row of report.scenarios)
  console.log(
    `${row.verdict} ${row.id}: v${row.sourceFormatVersion}->v${row.targetFormatVersion} ${row.slot} ${row.characterSource}, checksum ${row.checksum.slice(0, 12)}, components identical ${row.componentsIdentical}, reload ${row.reload.authority} / ${row.reload.cameraEntityId}, entities ${row.reload.entities}, XP ${row.reload.xpBalance}`,
  );
for (const row of report.refusals)
  console.log(`${row.pass ? 'PASS' : 'FAIL'} ${row.id}: ${row.code} at ${row.path}`);
console.log(
  `SUMMARY checks ${report.summary.passed}/${report.summary.checks}, scenarios ${report.summary.scenariosPassed}/${report.summary.scenarios}, refusals ${report.summary.refusalsClosed}/${report.summary.refusals}, migration ${report.summary.migrationPreservesEverything ? 'PASS' : 'FAIL'}, reload ${report.summary.reloadCoherent ? 'PASS' : 'FAIL'}, no duplicates ${report.summary.noDuplicates ? 'PASS' : 'FAIL'}, store untouched ${report.summary.storeUntouched ? 'PASS' : 'FAIL'}, determinism ${report.determinism.identical ? 'identical' : 'DIFFERENT'}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);
console.log(
  `COST local wall time ${(Number(process.hrtime.bigint() - started) / 1e6).toFixed(1)} ms (not part of the report)`,
);
console.log(`DIGEST sha256 ${report.determinism.digest}`);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`Walking save report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Walking save report is current: ${output}`);
  const markdownSaved = await readFile(reportMarkdown, 'utf8');
  if (markdownSaved !== markdown(report)) {
    console.error(`Walking save markdown is stale: ${reportMarkdown}`);
    process.exitCode = 1;
  } else console.log(`Walking save markdown is current: ${reportMarkdown}`);
} else {
  await mkdir(directory, { recursive: true });
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown(report));
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}

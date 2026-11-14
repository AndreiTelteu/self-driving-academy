import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '198-v3-walking-segments'),
  defaultOutput = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function metres(value) {
  if (value === null || value === undefined) return '—';
  if (value === 0) return '0';
  return Math.abs(value) < 1e-6 ? value.toExponential(2) : value.toFixed(2);
}

function yesNo(value) {
  return value ? 'DA' : 'NU';
}

function kind(value) {
  return value === null || value === undefined ? '—' : `\`${value}\``;
}

function markdown(report) {
  const policy = report.policy;
  const scenarios = report.scenarios
    .map(
      (row) =>
        `| \`${row.id}\` | ${row.label} | ${row.transitions} | ${kind(row.previousMode === 'NONE' ? null : row.previousMode)} | \`${row.authorityBefore}\` → \`${row.authorityAfter}\` | ${row.closedSegmentId ? `\`${row.closedSegmentId}\`` : '—'} | ${kind(row.closedKind)} | ${row.closeReason ? `\`${row.closeReason}\`` : '—'} | ${row.truncatedManeuver ? `\`${row.truncatedManeuver}\`` : '—'} | ${row.candidates} | ${row.openedMode ? `\`${row.openedMode}\`` : '—'} | ${row.verdict} |`,
    )
    .join('\n');
  const matrix = report.matrix
    .map(
      (row) =>
        `| \`${row.previousMode}\` | \`${row.transition}\` | ${kind(row.closedKind)} | ${row.closedReason ? `\`${row.closedReason}\`` : '—'} | ${row.openedMode ? `\`${row.openedMode}\`` : '—'} | ${row.candidates} | ${row.verdict} |`,
    )
    .join('\n');
  const real = report.gate.real069;
  const realRows = [
    ['MANUAL închis (RETURN_TO_AUTO)', real.manual, report.gate.manualClosedCandidates],
    ['LEARNING închis (RETURN_TO_AUTO)', real.learning, report.gate.learningClosedCandidates],
    ['LEARNING cu țintă neeligibilă', real.ineligible, report.gate.learningIneligibleCandidates],
    [
      'LEARNING trunchiat de ieșire (VEHICLE_SWITCH)',
      real.truncatedManeuver,
      report.gate.truncatedLearningCandidates,
    ],
    ['LEARNING cu ținta schimbată după deschidere', real.frozenEligibility, 1],
    ['LEARNING retras cu DATA_LOSS', real.dataLoss, 0],
  ]
    .map(
      ([label, fact, candidates]) =>
        `| ${label} | \`${fact.mode}\` | ${yesNo(fact.learningEligible)} | \`${fact.completeness}\` | ${fact.intake} | ${candidates} | ${yesNo(fact.intake === candidates)} |`,
    )
    .join('\n');
  const limitations = report.limitations.map((entry) => `- ${entry}`).join('\n');
  return `# 198 — intervenții și telemetrie cu personaj

Transcript determinist generat de \`${report.generatedBy}\`; comanda comisă este \`${report.command}\`.
Machine-readable: [report.json](report.json). Contract: \`${report.contract}\`, tick fix la
${report.tickHz} Hz, mod implicit la intrare \`${policy.defaultEntryMode}\` (exact
\`VEHICLE_ENTRY_POLICY.entryMode\` din 195), feluri de segment ${policy.kinds.map((value) => `\`${value}\``).join(' / ')},
motive de închidere ${policy.closeReasons.map((value) => `\`${value}\``).join(' / ')}.

Poarta estimatorului, copiată din 069: ${policy.gate}.

## Sumar

- Scenarii trecute: **${report.summary.scenariosPassed}/${report.summary.scenarios}**.
- Criteriul 1a (mersul nu este driving: mii de tick-uri, 0 segmente, 0 candidați): **${report.summary.walkingIsNotDriving ? 'PASS' : 'FAIL'}**.
- Criteriul 1b (numai LEARNING închis produce estimator, inclusiv segmentul trunchiat): **${report.summary.onlyClosedLearningProducesEstimator ? 'PASS' : 'FAIL'}**.
- Criteriul 2 (matricea mod anterior × tranziție păstrează autoritatea unică și modul explicit): **${report.summary.explicitMode ? 'PASS' : 'FAIL'}**.
- FOCUS nu închide nimic: **${report.summary.focusClosesNothing ? 'PASS' : 'FAIL'}**.
- Determinism: ${report.determinism.runs} rulări identice: **${yesNo(report.determinism.identical)}**, SHA-256 \`${report.determinism.digest}\`.
- Verdict general: **${report.summary.pass ? 'PASS' : 'FAIL'}**.

## Dovada „mers = 0 segmente"

| Probă | Tick-uri de mers | Distanță parcursă (m) | Segmente de driving | Candidați | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| viteză reală (1,3710 m/s ÷ 60 Hz) | ${report.walking.ticks} | ${metres(report.walking.distanceM)} | ${report.walking.closedSegments} | ${report.walking.candidates} | ${report.walking.verdict} |
| plafonul „oricât" (50 m/tick) | ${report.walking.boundTicks} | ${metres(report.walking.boundDistanceM)} | 0 | 0 | ${report.walking.verdict} |

Același model produce exact ${report.walking.controlClosedSegments} segment când autoritatea părăsește
într-adevăr corpul (ENTER urmat de EXIT): dovada nu este tautologică. \`WALK\` este singura tranziție
care numără tick-uri și metri; nu are cale de creare de segment și nici de candidat.

## Tranziție → segment închis → fel → candidați → verdict

| Scenariu | Descriere | Tranziții | Mod anterior | Autoritate | Segment închis | Fel | Motiv | Manevră întreruptă | Candidați | Segment deschis | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- |
${scenarios}

## Matricea de moduri (mod anterior × tranziție)

| Mod anterior | Tranziție | Segment închis | Motiv | Segment deschis | Candidați | Verdict |
| --- | --- | --- | --- | --- | ---: | --- |
${matrix}

Un \`TAKE\` deschide \`MANUAL\` dacă nu primește o alegere explicită \`LEARNING\`: faptul că segmentul
anterior era \`LEARNING\` nu este o dovadă despre modul următor. \`RETURN\` închide și nu deschide nimic.
\`FOCUS\` copiază autoritatea 193 și nu atinge niciun segment.

## Poarta 069 — aceeași regulă, verificată pe ciclul de viață real

| Caz | Mod | \`learningEligible\` înghețat | Completitudine | Intrări reale 069 | Candidați 198 | Acord |
| --- | --- | --- | --- | ---: | ---: | --- |
${realRows}

Ciclul de viață real 069 (\`tests/telemetry/manual-segments-fixture.ts\`) este închis de aceleași
granițe de autoritate. Rezultatele coincid: \`${yesNo(report.gate.crossCheckMatches)}\`. Un segment
trunchiat de o ieșire în mijlocul manevrei rămâne \`CLOSED\` și eligibil, pentru că 069 nu are regulă
de manevră completă; numai \`DATA_LOSS\` produce \`INCOMPLETE\`, iar atunci nici 069 și nici acest
contract nu admit un candidat. Eligibilitatea se îngheață la deschidere: o schimbare ulterioară a
țintei nu descalifică retroactiv segmentul.

## Determinism

${report.determinism.runs} construcții complete ale raportului, ${report.determinism.identical ? 'identice' : 'DIFERITE'};
amprenta SHA-256 a raportului este \`${report.determinism.digest}\`. Starea segmentului este date pure,
înghețate, cu parser strict invers (\`parseWalkingSegmentsState\`), gata pentru 200.

## Limitări

${limitations}
`;
}

const suite = await import(
    pathToFileURL(join(root, 'tests', 'character', 'walking-segments-suite.ts')).href
  ),
  started = process.hrtime.bigint(),
  report = suite.runWalkingSegmentsReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  output = argument('--output') ?? defaultOutput;

for (const row of report.scenarios)
  console.log(
    `${row.verdict} ${row.id}: ${row.transitions}, closed ${row.closedSegmentId ?? 'none'} ${row.closedKind ?? ''} ${row.closeReason ?? ''}, candidates ${row.candidates}, opened ${row.openedMode ?? 'none'}, authority ${row.authorityBefore} -> ${row.authorityAfter}`,
  );
console.log(
  `SUMMARY scenarios ${report.summary.scenariosPassed}/${report.summary.scenarios}, walking ${report.summary.walkingIsNotDriving ? 'PASS' : 'FAIL'} (${report.walking.ticks} ticks / ${metres(report.walking.distanceM)} m -> ${report.walking.closedSegments} segments, ${report.walking.candidates} candidates), gate ${report.summary.onlyClosedLearningProducesEstimator ? 'PASS' : 'FAIL'} (manual ${report.gate.manualClosedCandidates}, learning ${report.gate.learningClosedCandidates}, ineligible ${report.gate.learningIneligibleCandidates}, truncated ${report.gate.truncatedLearningCandidates}), explicit mode ${report.summary.explicitMode ? 'PASS' : 'FAIL'}, focus ${report.summary.focusClosesNothing ? 'PASS' : 'FAIL'}, determinism ${report.determinism.identical ? 'identical' : 'DIFFERENT'}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);
console.log(
  `COST local wall time ${(Number(process.hrtime.bigint() - started) / 1e6).toFixed(1)} ms (not part of the report)`,
);
console.log(`DIGEST sha256 ${report.determinism.digest}`);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`Walking segments report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Walking segments report is current: ${output}`);
  const markdownSaved = await readFile(reportMarkdown, 'utf8');
  if (markdownSaved !== markdown(report)) {
    console.error(`Walking segments markdown is stale: ${reportMarkdown}`);
    process.exitCode = 1;
  } else console.log(`Walking segments markdown is current: ${reportMarkdown}`);
} else {
  await mkdir(directory, { recursive: true });
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown(report));
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}

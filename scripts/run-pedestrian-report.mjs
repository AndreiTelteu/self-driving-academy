import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '164-pedestrians'),
  defaultOutput = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function markdown(report) {
  const refused = Object.entries(report.fixture.refusedReasons)
    .map(([reason, count]) => `${count} × ${reason}`)
    .join(', ');
  const scenarios = report.scenarios
    .map(
      (scenario) =>
        `| ${scenario.scenarioId} | ${scenario.ticks} | ${scenario.pedestrians} | ${scenario.counts.crossingsStarted} | ${scenario.counts.crossingsCompleted} | ${scenario.counts.freeCrossings} | ${scenario.counts.yieldedCrossings} | ${scenario.counts.crossingsWithoutYield} | ${scenario.counts.unobservedCrossings} | ${scenario.counts.conflictRecords} | ${scenario.counts.stopEvents} | ${scenario.counts.collisions} | ${scenario.pass ? 'PASS' : 'FAIL'} |`,
    )
    .join('\n');
  const checks = report.scenarios
    .flatMap((scenario) =>
      scenario.checks.map(
        (check) =>
          `| ${scenario.scenarioId} | ${check.id} | ${check.passed ? 'DA' : 'NU'} | ${check.detail} |`,
      ),
    )
    .join('\n');
  const conflicts = report.scenarios
    .flatMap((scenario) =>
      scenario.conflicts.map(
        (conflict) =>
          `| ${scenario.scenarioId} | ${conflict.tick} | ${conflict.distanceM.toFixed(2)} | ${conflict.speedMps.toFixed(2)} | ${conflict.timeToConflictS === null ? '—' : conflict.timeToConflictS.toFixed(2)} | ${conflict.crossingRemainingS.toFixed(2)} | ${conflict.minimumDistanceM.toFixed(2)} | ${conflict.outcome} | ${conflict.stopTick ?? '—'} |`,
      ),
    )
    .join('\n');
  const stops = report.scenarios
    .flatMap((scenario) =>
      scenario.stops.map(
        (stop) =>
          `| ${scenario.scenarioId} | ${stop.tick} | ${stop.distanceM.toFixed(2)} | ${stop.speedMps.toFixed(2)} | ${stop.duringCrossing ? 'DA' : 'NU'} |`,
      ),
    )
    .join('\n');
  const refusals = report.refusals
    .map(
      (entry) => `| ${entry.case} | ${entry.refused ? 'REFUZAT' : 'ACCEPTAT'} | ${entry.message} |`,
    )
    .join('\n');
  const limitations = report.limitations.map((entry) => `- ${entry}`).join('\n');
  const states = report.scenarios
    .map(
      (scenario) =>
        `| ${scenario.scenarioId} | ${Object.entries(scenario.finalStates)
          .map(([state, count]) => `${state} ${count}`)
          .join(' · ')} |`,
    )
    .join('\n');
  return `# 164 — pietoni autonomi și traversări

Transcript determinist generat de \`${report.generatedBy}\`; comanda comisă este \`${report.command}\`.
Machine-readable: [report.json](report.json). Contract: \`${report.contract}\`.

Regula oracolului: ${report.oracleRule}

## Sumar

- Scenarii: **${report.summary.passed}/${report.summary.scenarios}** trecute, verdict **${report.summary.pass ? 'PASS' : 'FAIL'}**.
- Pietoni în configurația implicită: **${report.summary.pedestrians}**.
- Traversări pornite: **${report.summary.crossingsStarted}**, finalizate: **${report.summary.crossingsCompleted}**.
- Traversări libere: **${report.summary.freeCrossings}**; cu cedare: **${report.summary.yieldedCrossings}**; fără cedare: **${report.summary.crossingsWithoutYield}**; neobservate: **${report.summary.unobservedCrossings}**.
- Conflicte observate: **${report.summary.conflictRecords}**; opriri reale: **${report.summary.stopEvents}**; opriri în timpul traversării: **${report.summary.yieldStopEvents}**; contacte: **${report.summary.collisions}**.
- Amprenta SHA-256 a rulării de determinism: \`${report.determinism.digest}\` (${report.determinism.runs} rulări, identice: ${report.determinism.identical ? 'DA' : 'NU'}).

## Rețeaua derivată din hartă

| Indicator | Valoare |
| --- | ---: |
| Hartă | ${report.fixture.mapId} |
| Trecări declarate | ${report.fixture.crosswalks} |
| Legături de pietoni | ${report.fixture.links} |
| Trecări fără trotuar derivat | ${refused || '—'} |
| Pietoni ceruți / creați | ${report.fixture.pedestriansRequested} / ${report.fixture.pedestriansCreated} |
| Benzi legate de o trecere | ${report.fixture.linkedLanes} |
| Benzi fără linie de trecere | ${report.fixture.lanesWithoutLine} |
| Lungime traversare min/medie/max (m) | ${report.fixture.crossingLengthM.min.toFixed(2)} / ${report.fixture.crossingLengthM.mean.toFixed(2)} / ${report.fixture.crossingLengthM.max.toFixed(2)} |
| Pietoni pe trecere (configurație) | ${report.fixture.pedestriansPerCrosswalk} |

Ținta scenariilor: \`${report.target.crosswalkId}\`, bandă \`${report.target.laneId}\` (${report.target.longitudinalM.toFixed(1)} m din ${report.target.laneLengthM.toFixed(1)} m), traversare de ${report.target.crossingLengthM.toFixed(1)} m.

## Scenarii

| Scenariu | Pași | Pietoni | Pornite | Finalizate | Libere | Cu cedare | Fără cedare | Neobservate | Conflicte | Opriri | Contacte | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${scenarios}

### Stări finale

| Scenariu | Stări |
| --- | --- |
${states}

### Verificări per scenariu

| Scenariu | Verificare | Trecut | Detaliu |
| --- | --- | --- | --- |
${checks}

## Conflicte observate

Distanța este cea măsurată de la vehicul la linia de trecere a benzii; timpul până la conflict este
distanța împărțită la viteză, iar timpul de traversare rămas este lungimea rămasă împărțită la viteza
pietonului.

| Scenariu | Tick | Distanță (m) | Viteză (m/s) | Timp până la conflict (s) | Timp de traversare rămas (s) | Distanță minimă (m) | Rezultat | Tick oprire |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
${conflicts}

## Opriri reale în apropierea trecerii

| Scenariu | Tick | Distanță (m) | Viteză (m/s) | În timpul traversării |
| --- | ---: | ---: | ---: | --- |
${stops}

## Refuzuri de intrare

| Caz | Rezultat | Mesaj |
| --- | --- | --- |
${refusals}

## Cost structural

| Indicator | Valoare |
| --- | ---: |
| Pași măsurați | ${report.cost.steps} |
| Evaluări de pietoni | ${report.cost.pedestrianEvaluations} |
| Evaluări de vehicule | ${report.cost.vehicleEvaluations} |
| Vârf pietoni activi pe pas | ${report.cost.peakPedestriansPerStep} |
| Vârf vehicule pe pas | ${report.cost.peakVehiclesPerStep} |

## Limitări

${limitations}
`;
}

const suite = await import(
    pathToFileURL(join(root, 'tests', 'world', 'pedestrians-suite.ts')).href
  ),
  started = process.hrtime.bigint(),
  report = await suite.runPedestrianReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  output = argument('--output') ?? defaultOutput;

for (const scenario of report.scenarios)
  console.log(
    `${scenario.pass ? 'PASS' : 'FAIL'} ${scenario.scenarioId}: pedestrians ${scenario.pedestrians}, started ${scenario.counts.crossingsStarted}, completed ${scenario.counts.crossingsCompleted}, free ${scenario.counts.freeCrossings}, yielded ${scenario.counts.yieldedCrossings}, without ${scenario.counts.crossingsWithoutYield}, unobserved ${scenario.counts.unobservedCrossings}, conflicts ${scenario.counts.conflictRecords}, stops ${scenario.counts.stopEvents}, collisions ${scenario.counts.collisions}`,
  );
console.log(
  `SUMMARY scenarios ${report.summary.passed}/${report.summary.scenarios}, pedestrians ${report.summary.pedestrians}, conflicts ${report.summary.conflictRecords}, yielded ${report.summary.yieldedCrossings}, without ${report.summary.crossingsWithoutYield}, collisions ${report.summary.collisions}, determinism ${report.determinism.identical ? 'identical' : 'DIFFERENT'}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);
console.log(
  `COST steps ${report.cost.steps}, pedestrian evaluations ${report.cost.pedestrianEvaluations}, peak pedestrians ${report.cost.peakPedestriansPerStep}, local wall time ${(Number(process.hrtime.bigint() - started) / 1e6).toFixed(1)} ms (not part of the report)`,
);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`Pedestrian report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Pedestrian report is current: ${output}`);
  const markdownSaved = await readFile(reportMarkdown, 'utf8');
  if (markdownSaved !== markdown(report)) {
    console.error(`Pedestrian markdown is stale: ${reportMarkdown}`);
    process.exitCode = 1;
  } else console.log(`Pedestrian markdown is current: ${reportMarkdown}`);
} else {
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown(report));
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}

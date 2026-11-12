import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '165-hazards'),
  defaultOutput = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const number = (value, digits = 2) => (value === null ? '—' : value.toFixed(digits));
const ticks = (value) => (value === null ? '—' : String(value));

function markdown(report) {
  const fixture = report.fixture,
    summary = report.summary,
    determinism = report.determinism,
    cost = report.cost;
  const scenarios = report.scenarios
    .map(
      (scenario) =>
        `| ${scenario.scenarioId} | ${scenario.ticks} | ${scenario.stimuli} | ${scenario.reactions} | ${scenario.counts.brakeReactions} | ${scenario.counts.steerReactions} | ${scenario.counts.stopped} | ${scenario.counts.passedClear} | ${scenario.counts.passedClose} | ${scenario.counts.contacts} | ${scenario.hornOpportunities} | ${scenario.hornUses} | ${scenario.hornRefusals} | ${scenario.pass ? 'PASS' : 'FAIL'} |`,
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
  const encounters = report.scenarios
    .flatMap((scenario) =>
      scenario.encounters.map(
        (encounter) =>
          `| ${scenario.scenarioId} | ${encounter.hazardId} | ${encounter.kind} | ${encounter.controlMode} | ${encounter.onsetTick} | ${encounter.outcome} | ${ticks(encounter.resolvedTick)} | ${number(encounter.minimumDistanceM)} | ${ticks(encounter.latencyTicks)} | ${ticks(encounter.contactTick)} |`,
      ),
    )
    .join('\n');
  const physical = report.scenarios.find((scenario) => scenario.physical);
  const arms = physical
    ? physical.physical.arms
        .map(
          (arm) =>
            `| ${arm.mode} | ${arm.action} | ${arm.collider} | ${ticks(arm.onsetTick)} | ${ticks(arm.latencyTicks)} | ${ticks(arm.contactTick)} | ${number(arm.impulseNs, 3)} | ${number(arm.minimumDistanceM, 3)} | ${arm.outcome} |`,
        )
        .join('\n')
    : '';
  const comparisons = physical
    ? physical.physical.comparisons
        .map(
          (comparison) =>
            `| ${comparison.id} | ${comparison.passed ? 'DA' : 'NU'} | ${comparison.detail} |`,
        )
        .join('\n')
    : '';
  const refusals = Object.entries(fixture.refuseReasons)
    .map(([reason, count]) => `| ${reason} | ${count} |`)
    .join('\n');
  const limitations = report.limitations.map((entry) => `- ${entry}`).join('\n');
  return `# 165 — pericole, obstacole și claxon

Transcript determinist generat de \`${report.generatedBy}\`; comanda comisă este \`${report.command}\`.
Machine-readable: [report.json](report.json). Contract: \`${report.contract}\`.

Regula oracolului: ${report.oracleRule}

## Sumar real

| Indicator | Valoare |
| --- | ---: |
| Scenarii deterministe | **${summary.passed}/${summary.scenarios}** PASS |
| Obstacole acceptate / refuzate | ${fixture.obstacles} / ${fixture.refusedObstacles} |
| Stimuli observați | **${summary.stimuli}** |
| Reacții măsurate (frână / virare) | **${summary.reactions}** (${summary.brakeReactions} / ${summary.steerReactions}) |
| Oportunități de claxon / claxoane / refuzuri | **${summary.hornOpportunities} / ${summary.hornUses} / ${summary.hornRefusals}** |
| Rezultate: oprite / trecute curat / trecute aproape / contacte | ${summary.stopped} / ${summary.passedClear} / ${summary.passedClose} / ${summary.contacts} |
| Determinism | ${determinism.runs} rulări, identice: ${determinism.identical ? 'DA' : 'NU'}, SHA-256 \`${determinism.digest}\` |
| Momente de apariție (seed 165 / 165 / 166) | ${determinism.appearTicks.join(' / ')} |
| Verdict | **${summary.pass ? 'PASS' : 'FAIL'}** |

## Fixture

| Indicator | Valoare |
| --- | ---: |
| Hartă | ${fixture.mapId} |
| Bandă reală folosită | ${fixture.laneId} |
| Lungime bandă | ${number(fixture.laneLengthM)} m |
| Poziția obstacolului pe bandă | ${fixture.obstacleLongitudinalM} m |
| Seed explicit | ${fixture.seed} |
| Tick de apariție pentru obstacolul programat | ${fixture.appearTick} |

Refuzuri pe motiv:

| Motiv | Număr |
| --- | ---: |
${refusals}

## Scenarii

| Scenariu | Pași | Stimuli | Reacții | Frână | Virare | Oprite | Trecute curat | Trecute aproape | Contacte | Oportunități claxon | Claxoane | Refuzuri | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${scenarios}

### Verificări per scenariu

| Scenariu | Verificare | Trecut | Detaliu |
| --- | --- | --- | --- |
${checks}

## Stimuli și rezultate

Distanța este planară, măsurată până la centrul pericolului la debut; latența este numărul de tick-uri
dintre debutul observabil și primul front de comandă (frână sau virare), nu o stare deja activă.

| Scenariu | Pericol | Tip | Mod | Debut (tick) | Rezultat | Rezolvat (tick) | Distanță minimă (m) | Latență (tick-uri) | Contact (tick) |
| --- | --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
${encounters}

## Fizica reală: jucător contra AUTO

Armurile rulează în același tip de lume Rapier, cu același vehicul și aceeași cutie; diferă doar eticheta
modului și comenzile. \`GENERIC_CONTACT\` este un perete generic cu aceleași dimensiuni, înregistrat pe
același canal de coliziune: dacă numerele coincid, obstacolul de pericol este un contact obișnuit, fără
imunitate pentru jucător.

| Mod | Acțiune | Collider | Debut | Latență | Contact | Impuls (N·s) | Distanță minimă (m) | Rezultat |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
${arms}

| Verificare | Trecut | Detaliu |
| --- | --- | --- |
${comparisons}

## Claxonul ca oportunitate

Oportunitatea are condiții observabile — pericol iminent după timpul până la pericol, pieton în
traversare ori obstacol care blochează calea — și se deschide o singură dată per stimul. Claxonul este
măsurat numai prin fixture controlat: \`VehicleCommand\` nu are câmp de claxon, deci pentru live lipsesc
keybinding-ul, câmpul/evenimentul de comandă și feedback-ul audio/HUD. Un claxon fără oportunitate este
refuzat, iar o a doua apăsare pe aceeași oportunitate este refuzată.

## Cost structural

| Indicator | Valoare |
| --- | ---: |
| Scenariu de cost | ${cost.scenarioId} |
| Pași măsurați | ${cost.steps} |
| Evaluări de pericol | ${cost.hazardEvaluations} |
| Evaluări de vehicule | ${cost.vehicleEvaluations} |
| Vârf pericole active pe pas | ${cost.peakHazardsPerStep} |
| Vârf vehicule pe pas | ${cost.peakVehiclesPerStep} |

Costul per pas este O(vehicule × pericole active), cu plafoane explicite pentru obstacole, vehicule,
pietoni, stimuli, reacții, oportunități și contacte. Modulul nu construiește snapshot-uri în \`step\`.

## Limitări

${limitations}
`;
}

const suite = await import(pathToFileURL(join(root, 'tests', 'world', 'hazards-suite.ts')).href),
  started = process.hrtime.bigint(),
  report = await suite.runHazardReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  output = argument('--output') ?? defaultOutput;

for (const scenario of report.scenarios)
  console.log(
    `${scenario.pass ? 'PASS' : 'FAIL'} ${scenario.scenarioId}: stimuli ${scenario.stimuli}, reactions ${scenario.reactions}, stopped ${scenario.counts.stopped}, passed clear ${scenario.counts.passedClear}, contacts ${scenario.counts.contacts}, horn ${scenario.hornUses}/${scenario.hornOpportunities}, refusals ${scenario.hornRefusals}`,
  );
console.log(
  `SUMMARY scenarios ${report.summary.passed}/${report.summary.scenarios}, stimuli ${report.summary.stimuli}, reactions ${report.summary.reactions}, contacts ${report.summary.contacts}, horn ${report.summary.hornUses}, determinism ${report.determinism.identical ? 'identical' : 'DIFFERENT'}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);
console.log(
  `COST steps ${report.cost.steps}, hazard evaluations ${report.cost.hazardEvaluations}, vehicle evaluations ${report.cost.vehicleEvaluations}, peak hazards ${report.cost.peakHazardsPerStep}, local wall time ${(Number(process.hrtime.bigint() - started) / 1e6).toFixed(1)} ms (not part of the report)`,
);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`Hazard report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Hazard report is current: ${output}`);
  const markdownSaved = await readFile(reportMarkdown, 'utf8');
  if (markdownSaved !== markdown(report)) {
    console.error(`Hazard markdown is stale: ${reportMarkdown}`);
    process.exitCode = 1;
  } else console.log(`Hazard markdown is current: ${reportMarkdown}`);
} else {
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown(report));
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '216-v1-regression'),
  defaultOutput = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md'),
  costOutput = join(directory, 'cost.json'),
  costMarkdown = join(directory, 'cost.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function value(input) {
  if (input === null || input === undefined) return '—';
  return typeof input === 'string' ? input : JSON.stringify(input);
}

function markdown(report) {
  const rows = report.rows
    .map(
      (row) =>
        `| ${row.id} | ${row.category} | ${row.polarity} | ${row.scenario} | ${row.contract} | ${row.verdict} | ${value(row.notRunReason ?? row.actual)} |`,
    )
    .join('\n');
  const budgets = report.budgets
    .map(
      (entry) =>
        `| ${entry.metric} | ${value(entry.actual)} | ${value(entry.budget)} | ${entry.unit} | ${entry.verdict} | ${entry.source} |`,
    )
    .join('\n');
  const paths = report.xp.paths
    .map(
      (entry) =>
        `| ${entry.id} | \`${entry.fingerprint}\` | ${entry.unchanged ? 'identic' : 'SCHIMBAT'} |`,
    )
    .join('\n');
  const gaps = report.gaps.map((entry) => `- **${entry.component}**: ${entry.reason}`).join('\n');
  const limitations = report.limitations.map((entry) => `- ${entry}`).join('\n');
  const categories = Object.entries(report.summary.categories)
    .map(([category, count]) => `${category} ${count}`)
    .join(', ');
  const versions = Object.entries(report.versions)
    .map(([name, version]) => `- ${name}: \`${version}\``)
    .join('\n');
  const playtest = report.validation.playtestRemaining.map((entry) => `- ${entry}`).join('\n');

  return `# 216 — regresii V1 pentru moduri, KPI-uri, daily și XP

Transcript determinist generat de \`${report.generatedBy}\` cu \`${report.command}\`.
Machine-readable: [report.json](report.json).

Regula oracolului: ${report.oracleRule}

## Nivel de validare

- Nivel: \`${report.validation.level}\`
- Playtest: \`${report.validation.playtest}\`
- Frame: \`${report.validation.frame}\`
- Memorie: \`${report.validation.memory}\`
- Motiv: ${report.validation.reason}

Ce rămâne de verificat în browser:

${playtest}

## Matricea executată

${report.summary.rows} rânduri: ${report.summary.pass} PASS, ${report.summary.fail} FAIL, ${report.summary.notRun} NOT_RUN.
Categorii: ${categories}.

| ID | Categorie | Polaritate | Scenariu | Contract | Verdict | Rezultat real |
| --- | --- | --- | --- | --- | --- | --- |
${rows}

## XP fără pierderi

Sold înainte: ${report.xp.before.balance} XP (nivel ${report.xp.before.level}, ${report.xp.before.entries} intrări).
Sold după: ${report.xp.after.balance} XP (nivel ${report.xp.after.level}, ${report.xp.after.entries} intrări).
Pierderi: **${report.xp.losses}**. Debitări: ${report.xp.debits}. Credite negative: ${String(report.xp.negativeCredits)}.

Amprenta stării economice (sold, nivel, intrări, cursor): \`${report.xp.fingerprintBefore}\` → \`${report.xp.fingerprintAfter}\`.
Contoarele de refuz sunt intenționat în afara amprentei: un duplicat refuzat crește un contor fără să plătească sau să scadă XP.

| Cale de scădere | Amprentă după | Rezultat |
| --- | --- | --- |
${paths}

## Costuri noi față de manifest

| Metrică | Real | Buget | Unitate | Verdict | Sursă |
| --- | --- | --- | --- | --- | --- |
${budgets}

Lacune declarate, fără prag inventat:

${gaps}

## Dependențe

- Noduri: ${report.dependencies.nodes}
- Muchii: ${report.dependencies.edges}
- Cicluri: ${report.dependencies.cycles.length}
- Id-uri duplicate: ${report.dependencies.duplicates.length}
- Gate 235 acoperă extensiile 225–234: ${String(report.dependencies.gateCoversExtensions)}
- Dependențe inverse către 235: ${report.dependencies.inverseDependencies.length}
- Id-uri externe raportate: ${report.dependencies.external.length}

## Versiuni

${versions}

## Limitări

${limitations}
`;
}

function markdownCosts(cost) {
  const line = (label, stats) => `| ${label} | ${stats.min} | ${stats.median} | ${stats.max} |`;
  return `# 216 cost real al căii de tick

Valori machine-readable: [cost.json](cost.json). Aceasta este singura măsurătoare cu ceas de perete a
PBI 216; **nu** face parte din transcriptul determinist și **nu** este o probă de cadru sau de FPS.

Contract: ${cost.contract}

- Eșantioane: ${cost.sampleCount}
- Tick-uri per eșantion: ${cost.ticksPerSample}
- Vehicule: ${cost.vehicles}
- Eșantioane de recorder: ${cost.recorderSamples}
- Capturi de autosave: ${cost.autosaveCaptures}
- Măsurat la: ${cost.measuredAt}

| Braț | Min (ms) | Median (ms) | Max (ms) |
| --- | --- | --- | --- |
${[
  line('Doar condus, 600 tick-uri', cost.drivingOnlyMs),
  line('Condus + recorder + ofertă autosave, 600 tick-uri', cost.attachedMs),
  line('Cost per tick, doar condus (ms)', cost.drivingCostMsPerTick),
  line('Cost per tick, cu sistemele atașate (ms)', cost.attachedCostMsPerTick),
].join('\n')}

Procesul este Node, fără renderer, GPU sau browser: rezultatul descrie costul sincron al căii de tick,
nu timpul de cadru al jocului.
`;
}

const reportModule = await import(
    pathToFileURL(join(root, 'tests', 'qa', 'v1-regression-report.ts')).href
  ),
  report = await reportModule.runV1RegressionReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  output = argument('--output') ?? defaultOutput;

for (const row of report.rows)
  console.log(`${row.verdict} ROW ${row.id} ${row.category} ${row.scenario}`);
for (const entry of report.budgets)
  console.log(
    `${entry.verdict} BUDGET ${entry.metric}: ${value(entry.actual)} ${entry.unit} <= ${value(entry.budget)}`,
  );
console.log(
  `SUMMARY rows ${report.summary.pass}/${report.summary.rows} PASS, ${report.summary.fail} FAIL, ${report.summary.notRun} NOT_RUN, XP losses ${report.xp.losses}, cycles ${report.dependencies.cycles.length}`,
);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`V1 regression report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`V1 regression report is current: ${output}`);
  const markdownSaved = await readFile(reportMarkdown, 'utf8');
  if (markdownSaved !== markdown(report)) {
    console.error(`V1 regression markdown is stale: ${reportMarkdown}`);
    process.exitCode = 1;
  } else console.log(`V1 regression markdown is current: ${reportMarkdown}`);
} else {
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown(report));
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (report.summary.fail > 0) process.exitCode = 1;
}

if (process.argv.includes('--cost')) {
  const probeModule = await import(
    pathToFileURL(join(root, 'tests', 'qa', 'combined-probe.ts')).href
  );
  const samples = Number(argument('--samples') ?? '5');
  const cost = await probeModule.measureCombinedTickCosts(
    Number.isSafeInteger(samples) && samples > 0 ? samples : 5,
  );
  await writeFile(costOutput, `${JSON.stringify(cost, null, 2)}\n`);
  await writeFile(costMarkdown, markdownCosts(cost));
  console.log(
    `COST driving ${cost.drivingOnlyMs.min}/${cost.drivingOnlyMs.median}/${cost.drivingOnlyMs.max} ms, attached ${cost.attachedMs.min}/${cost.attachedMs.median}/${cost.attachedMs.max} ms, +${cost.attachedCostMsPerTick.median} ms/tick`,
  );
  console.log(`Wrote ${costOutput}`);
  console.log(`Wrote ${costMarkdown}`);
}

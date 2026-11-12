import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '163-v2-contexts'),
  defaultOutput = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function project(report) {
  return {
    ...report,
    scenarios: report.scenarios.map((scenario) => ({
      scenarioId: scenario.scenarioId,
      category: scenario.category,
      title: scenario.title,
      frames: scenario.frames,
      firstTick: scenario.firstTick,
      lastTick: scenario.lastTick,
      categoryKeys: scenario.categoryKeys,
      observableKeys: scenario.observableKeys,
      representative: scenario.representative,
      missingKeys: scenario.missingKeys,
      failedTriggers: scenario.failedTriggers,
      triggers: scenario.triggers,
      keys: scenario.keys.filter((entry) => entry.category === scenario.category),
      otherCategoryObservableKeys: scenario.keys
        .filter((entry) => entry.category !== scenario.category && entry.observable)
        .map((entry) => entry.key),
    })),
    control: {
      ...report.control,
      keys: report.control.keys.filter((entry) => entry.observable),
    },
  };
}

function markdown(report) {
  const scenarios = report.scenarios
    .map(
      (scenario) =>
        `| ${scenario.scenarioId} | ${scenario.category} | ${scenario.frames} | ${scenario.observableKeys}/${scenario.categoryKeys} | ${scenario.triggers.filter((trigger) => trigger.observed).length}/${scenario.triggers.length} | ${scenario.representative ? 'REPREZENTATIV' : 'NEPREZENTATIV'} |`,
    )
    .join('\n');
  const triggers = report.scenarios
    .flatMap((scenario) =>
      scenario.triggers.map(
        (trigger) =>
          `| ${scenario.scenarioId} | ${trigger.id} | ${trigger.observed ? 'DA' : 'NU'} | ${trigger.evidence} |`,
      ),
    )
    .join('\n');
  const contextRows = report.contextTable
    .map(
      (entry) =>
        `| \`${entry.key}\` | ${entry.categoryTitle} | ${entry.contextId} | ${entry.label} | ${entry.scenarioId} | ${entry.opportunityKind ?? '—'} |`,
    )
    .join('\n');
  const manualRows = report.contextTable
    .map(
      (entry) =>
        `| \`${entry.key}\` | ${entry.manual.setup} | ${entry.manual.action} | ${entry.manual.evidence} |`,
    )
    .join('\n');
  const coverage = report.catalog.perCategory
    .map((entry) => `| ${entry.category} | ${entry.keys} |`)
    .join('\n');
  const evidence = report.v1Compatibility.evidence
    .map(
      (entry) =>
        `| \`${entry.path}\` | ${entry.present ? 'prezent' : 'lipsă'} | ${entry.sha256 ?? '—'} |`,
    )
    .join('\n');
  const limitations = report.limitations.map((entry) => `- ${entry}`).join('\n');
  return `# 163 — scenarii și telemetrie pentru parametrii V2

Transcript determinist generat de \`${report.generatedBy}\`; comanda comisă este \`${report.command}\`.
Machine-readable: [report.json](report.json).

Regula oracolului: ${report.oracleRule}

## Sumar

- Chei R acoperite: **${report.summary.coveredKeys}/${report.summary.keys}**.
- Categorii reprezentative: **${report.summary.representativeCategories}/${report.summary.categories}**.
- Scenarii reprezentative: **${report.summary.representativeScenarios}/${report.summary.scenarios}**.
- Cadre evaluate: **${report.summary.frames}**.
- Control negativ: **${report.summary.controlObservableKeys}** chei observabile, reprezentativ \`${report.summary.controlRepresentative}\`.
- Verdicte: **${report.summary.pass ? 'PASS' : 'FAIL'}**.
- Amprenta SHA-256 a catalogului, evaluărilor și tabelei de contexte: \`${report.reproducibility.digest}\`.

## Categorii și numărul de chei

| Categorie | Chei |
| --- | ---: |
${coverage}

## Scenarii reprezentative

| Scenariu | Categorie | Cadre | Chei observabile | Triggeri | Verdict |
| --- | --- | ---: | ---: | ---: | --- |
${scenarios}

## Triggeri de reprezentativitate, numărați din cadre

| Scenariu | Trigger | Observat | Dovada numerică |
| --- | --- | --- | --- |
${triggers}

## Cheie → context → scenariu → etichetă

| Cheie | Categorie | Context | Etichetă | Scenariu | Oportunitate 086 |
| --- | --- | --- | --- | --- | --- |
${contextRows}

## Date de manual per context

| Cheie | Pregătire | Acțiune | Dovadă observabilă |
| --- | --- | --- | --- |
${manualRows}

## Compatibilitate V1

- Chei V1 protejate: **${report.v1Compatibility.protectedKeys}**; suprapunere cu cheile R: \`${report.v1Compatibility.disjointFromR ? 'niciuna' : 'EXISTĂ'}\`.
- Chei redenumite: \`${report.v1Compatibility.renamedKeys.length}\`; praguri schimbate: \`${report.v1Compatibility.changedThresholds.length}\`.
- Migrare: ${report.v1Compatibility.migration}.
- Câmpuri de catalog păstrate: ${report.v1Compatibility.preservedCatalogFields.join(', ')}.

| Dovadă V1 | Stare | SHA-256 |
| --- | --- | --- |
${evidence}

## Limitări

${limitations}
`;
}

const suite = await import(
    pathToFileURL(join(root, 'tests', 'telemetry', 'v2-contexts-suite.ts')).href
  ),
  report = await suite.runV2ContextReport(),
  disk = project(report),
  json = `${JSON.stringify(disk, null, 2)}\n`,
  output = argument('--output') ?? defaultOutput;

for (const scenario of report.scenarios)
  console.log(
    `${scenario.representative ? 'REPRESENTATIVE' : 'NOT_REPRESENTATIVE'} ${scenario.category}/${scenario.scenarioId} (${scenario.observableKeys}/${scenario.categoryKeys} keys, ${scenario.triggers.filter((trigger) => trigger.observed).length}/${scenario.triggers.length} triggers, ${scenario.frames} frames)`,
  );
console.log(
  `CONTROL ${report.control.scenarioId}: ${report.control.observableKeys} observable keys, representative ${report.control.representative}`,
);
console.log(
  `SUMMARY keys ${report.summary.coveredKeys}/${report.summary.keys}, categories ${report.summary.representativeCategories}/${report.summary.categories}, representative scenarios ${report.summary.representativeScenarios}/${report.summary.scenarios}, frames ${report.summary.frames}, v1 ${report.v1Compatibility.protectedKeys} protected, digest ${report.reproducibility.digest}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`V2 context report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`V2 context report is current: ${output}`);
  const markdownSaved = await readFile(reportMarkdown, 'utf8');
  if (markdownSaved !== markdown(disk)) {
    console.error(`V2 context markdown is stale: ${reportMarkdown}`);
    process.exitCode = 1;
  } else console.log(`V2 context markdown is current: ${reportMarkdown}`);
} else {
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown(disk));
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}

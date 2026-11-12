import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '151-scenario-suite'),
  defaultOutput = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function tolerances(scenario) {
  const seen = new Set();
  for (const check of scenario.checks) {
    const { kind, value: bound, unit } = check.tolerance;
    seen.add(kind === 'EXACT' ? 'EXACT' : `${kind} ${bound} ${unit}`);
  }
  return [...seen].join('; ');
}

function markdown(report) {
  const families = report.families
    .map(
      (family) =>
        `| ${family.family} | ${family.scenarios} | ${family.positive} | ${family.negative} | ${family.notRun} | ${family.pass}/${family.executed} |`,
    )
    .join('\n');
  const scenarios = report.scenarios
    .map((scenario) =>
      scenario.executed
        ? `| ${scenario.id} | ${scenario.family} | ${scenario.polarity} | ${scenario.steps} | ${scenario.checks.length} | ${tolerances(scenario)} | ${scenario.verdict} |`
        : `| ${scenario.id} | ${scenario.family} | ${scenario.polarity} | — | — | — | NOT_RUN: ${scenario.notRunReason} |`,
    )
    .join('\n');
  const reuse = report.reuse
    .map(
      (entry) =>
        `| ${entry.source} | ${entry.scenarioIds.join(', ')} | ${entry.evidence} | ${entry.verdict} |`,
    )
    .join('\n');
  const reuseNotes = report.reuse.map((entry) => `- **${entry.source}**: ${entry.what}`).join('\n');
  const notRun = report.scenarios
    .filter((scenario) => scenario.verdict === 'NOT_RUN')
    .map((scenario) => `- **${scenario.id}**: ${scenario.notRunReason}`)
    .join('\n');
  const limitations = report.limitations.map((entry) => `- ${entry}`).join('\n');

  return `# 151 — suita completă de scenarii V1

Transcript determinist generat de \`${report.generatedBy}\` cu \`${report.command}\`.
Machine-readable: [report.json](report.json).

Regula oracolului: ${report.oracleRule}

Seed fix: ${report.seeds.join(', ')}. Două rulări independente produc același transcript;
amprenta SHA-256 a scenariilor este \`${report.reproducibility.digest}\`.

## Familii

| Familie | Scenarii | Pozitive | Negative | NOT_RUN | Trecute/executate |
| --- | ---: | ---: | ---: | ---: | ---: |
${families}

Total: ${report.summary.scenarios} scenarii, ${report.summary.executed} executate,
${report.summary.passed} PASS, ${report.summary.fail} FAIL, ${report.summary.notRun} NOT_RUN.

## Scenarii

| ID | Familie | Polaritate | Pași | Verificări | Toleranțe declarate | Verdict |
| --- | --- | --- | ---: | ---: | --- | --- |
${scenarios}

## Refuzuri explicite (NOT_RUN)

${notRun}

## Refolicit din suitele livrate

| Sursă | Rânduri | Dovadă | Verdict |
| --- | --- | --- | --- |
${reuse}

${reuseNotes}

## Reproductibilitate

${report.reproducibility.rule}

## Limitări

${limitations}
`;
}

const suite = await import(pathToFileURL(join(root, 'tests', 'scenarios', 'v1-suite.ts')).href),
  report = suite.runScenarioSuite(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  output = argument('--output') ?? defaultOutput;

for (const scenario of report.scenarios) {
  const failed = scenario.checks.filter((check) => !check.pass);
  console.log(
    scenario.executed
      ? `${scenario.verdict} ${scenario.family}/${scenario.id} (${scenario.checks.length} checks${
          failed.length === 0 ? '' : `, failed: ${failed.map((check) => check.name).join(', ')}`
        })`
      : `NOT_RUN ${scenario.family}/${scenario.id} — ${scenario.notRunReason}`,
  );
}
for (const entry of report.reuse)
  console.log(`REUSE ${entry.verdict} ${entry.source} (${entry.scenarioIds.length} rows)`);
console.log(
  `SUMMARY scenarios ${report.summary.scenarios}, executed ${report.summary.executed}, passed ${report.summary.passed}, fail ${report.summary.fail}, notRun ${report.summary.notRun}, families ${report.summary.families}, positive ${report.summary.positive}, negative ${report.summary.negative}, reuse ${report.summary.reuse}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`Scenario suite report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Scenario suite report is current: ${output}`);
  const markdownSaved = await readFile(reportMarkdown, 'utf8');
  if (markdownSaved !== markdown(report)) {
    console.error(`Scenario suite markdown is stale: ${reportMarkdown}`);
    process.exitCode = 1;
  } else console.log(`Scenario suite markdown is current: ${reportMarkdown}`);
} else {
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown(report));
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}

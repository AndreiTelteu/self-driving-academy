import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 273 deterministic live learning report.
 *
 * The report is derived from the real 032/033 map, the real 272 telemetry writer, the real 103
 * queue/221 governor runtime and the real 109/110 publication. `--check` refuses an unrefreshed
 * report; it never rewrites the evidence.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = join(root, 'Docs', 'Evidence', '273-live-learning');
const jsonPath = join(evidence, 'report.json');
const markdownPath = join(evidence, 'report.md');
const check = process.argv.includes('--check');
const module = await import(
  pathToFileURL(join(root, 'tests', 'app', 'live-learning-report.ts')).href
);
const report = await module.runLiveLearningReport();
const json = `${JSON.stringify(report, null, 2)}\n`;
const markdown = module.liveLearningReportMarkdown(report);

if (check) {
  let currentJson = '';
  let currentMarkdown = '';
  try {
    currentJson = await readFile(jsonPath, 'utf8');
    currentMarkdown = await readFile(markdownPath, 'utf8');
  } catch {
    console.error('273 report is missing; run npm run learning:live.');
    process.exit(1);
  }
  if (currentJson !== json || currentMarkdown !== markdown) {
    console.error('273 report is stale; run npm run learning:live and commit the evidence.');
    process.exit(1);
  }
  console.log(
    `273 live learning report: ${report.summary.passed}/${report.summary.checks} PASS (fresh).`,
  );
  process.exit(0);
}

await mkdir(evidence, { recursive: true });
await writeFile(jsonPath, json);
await writeFile(markdownPath, markdown);
console.log(
  `273 live learning report: ${report.summary.passed}/${report.summary.checks} PASS, written to Docs/Evidence/273-live-learning.`,
);
if (!report.summary.pass) process.exitCode = 1;

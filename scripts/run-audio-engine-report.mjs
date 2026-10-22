import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  evidence = join(root, 'Docs', 'Evidence', '148-audio-engine'),
  defaultOutput = join(evidence, 'report.json'),
  reportMarkdown = join(evidence, 'report.md'),
  measurementOutput = join(evidence, 'measurements.json');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const reportModule = await import(
    pathToFileURL(join(root, 'tests', 'audio', 'audio-engine-report.ts')).href
  ),
  performanceModule = await import(
    pathToFileURL(join(root, 'tests', 'audio', 'audio-performance.ts')).href
  ),
  report = reportModule.runAudioEngineReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  markdown = reportModule.audioEngineReportMarkdown(report),
  output = argument('--output') ?? defaultOutput;

for (const entry of report.checks)
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} CHECK ${entry.name}`);
console.log(
  `SUMMARY checks ${report.summary.passed}/${report.summary.checks}, scenarios ${report.scenarios.length}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`Audio engine report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Audio engine report is current: ${output}`);
} else {
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}

// The performance probe is a separate artefact: its timings are not reproducible byte for byte.
if (!process.argv.includes('--check')) {
  const measurement = performanceModule.measureAudioPerformance();
  await writeFile(measurementOutput, `${JSON.stringify(measurement, null, 2)}\n`);
  console.log(`Wrote ${measurementOutput}`);
  console.log(
    `MEASUREMENT audio per tick ${measurement.delta.perTickUs} us, baseline ${measurement.baseline.perTickUs} us/tick, owned buffer bytes ${measurement.memory.ownedBufferBytes}`,
  );
}

/**
 * PBI 150 — asset manifest and selective-cache report.
 *
 * Generates the versioned build manifest from the real inventories and the real WASM files, then
 * writes the evidence (`asset-manifest.json`, `report.json`, `report.md`). `--check` verifies the
 * saved evidence is current instead of rewriting it, so CI fails on a stale manifest.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = join(root, 'Docs', 'Evidence', '150-asset-manifest');
const outputs = {
  manifest: join(evidence, 'asset-manifest.json'),
  report: join(evidence, 'report.json'),
  markdown: join(evidence, 'report.md'),
};

const reportModule = await import(
  pathToFileURL(join(root, 'tests', 'build', 'asset-manifest-report.ts')).href
);
const { manifest, report } = reportModule.buildAssetManifestEvidence(root);
const contents = {
  manifest: `${JSON.stringify(manifest, null, 2)}\n`,
  report: `${JSON.stringify(report, null, 2)}\n`,
  markdown: reportModule.assetManifestReportMarkdown(report),
};

for (const check of report.checks)
  console.log(`${check.pass ? 'PASS' : 'FAIL'} CHECK ${check.name}`);
console.log(
  `SUMMARY entries ${report.manifest.entries}, critical ${report.manifest.critical}, optional ${report.manifest.optional}, wire ${report.accounting.wire.encodedBytes} B, decoded ${report.accounting.decoded.totalBytes} B, checks ${report.summary.passed}/${report.summary.checks}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);

let stale = false;
if (process.argv.includes('--check')) {
  for (const [key, path] of Object.entries(outputs)) {
    let saved;
    try {
      saved = await readFile(path, 'utf8');
    } catch {
      saved = null;
    }
    if (saved !== contents[key]) {
      console.error(`Asset manifest evidence is stale: ${path}`);
      stale = true;
    } else console.log(`Asset manifest evidence is current: ${path}`);
  }
  if (!report.summary.pass || stale) process.exitCode = 1;
} else {
  await mkdir(evidence, { recursive: true });
  await writeFile(outputs.manifest, contents.manifest);
  await writeFile(outputs.report, contents.report);
  await writeFile(outputs.markdown, contents.markdown);
  for (const path of Object.values(outputs)) console.log(`Wrote ${path}`);
  if (!report.summary.pass) process.exitCode = 1;
}

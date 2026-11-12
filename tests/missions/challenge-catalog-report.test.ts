import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  challengeCatalogReportMarkdown,
  runChallengeCatalogReport,
} from './challenge-catalog-report';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '231-challenge-catalog', 'report.json');
const EVIDENCE_MARKDOWN = join(
  process.cwd(),
  'Docs',
  'Evidence',
  '231-challenge-catalog',
  'report.md',
);

test('231 committed challenge catalog report is the current transcript', () => {
  const report = runChallengeCatalogReport();
  const saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as unknown;
  assert.deepEqual(saved, JSON.parse(JSON.stringify(report)) as unknown);
  assert.equal(report.summary.pass, true);
  assert.equal(report.summary.passed, report.summary.checks);
  for (const entry of report.checks)
    assert.equal(entry.pass, true, `${entry.name}: expected ${String(entry.expected)}`);
  const markdown = readFileSync(EVIDENCE_MARKDOWN, 'utf8');
  assert.match(markdown, /Templates: 12/);
  assert.match(markdown, /Checks: 66\/66/);
  assert.match(markdown, /spinning in place \| 0/);
});

test('231 the report is deterministic across runs', () => {
  assert.equal(
    JSON.stringify(runChallengeCatalogReport()),
    JSON.stringify(runChallengeCatalogReport()),
  );
});

test('231 the markdown reports the catalog, the exclusion and the performance gap', () => {
  const markdown = challengeCatalogReportMarkdown(runChallengeCatalogReport());
  assert.match(markdown, /challenge-maternity-run/);
  assert.match(markdown, /demolition is not offered in the Academy/);
  assert.match(markdown, /The manifest field `challengeHistoryEntries` is `null`/);
  assert.match(markdown, /Wall clock: `NOT_MEASURED`/);
  assert.match(markdown, /Daily generator with the bridge: 3 missions/);
});

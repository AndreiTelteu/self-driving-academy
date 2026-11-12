import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  challengeDirectorReportMarkdown,
  runChallengeDirectorReport,
} from './challenge-director-report';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '232-challenge-director', 'report.json');
const EVIDENCE_MARKDOWN = join(
  process.cwd(),
  'Docs',
  'Evidence',
  '232-challenge-director',
  'report.md',
);

test('232 committed challenge director report is the current transcript', () => {
  const report = runChallengeDirectorReport();
  const saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as unknown;
  assert.deepEqual(saved, JSON.parse(JSON.stringify(report)) as unknown);
  assert.equal(report.summary.pass, true);
  assert.equal(report.summary.passed, report.summary.checks);
  for (const entry of report.checks)
    assert.equal(entry.pass, true, `${entry.name}: expected ${String(entry.expected)}`);
  const markdown = readFileSync(EVIDENCE_MARKDOWN, 'utf8');
  assert.match(markdown, /Checks: 56\/56/);
  assert.match(markdown, /PASSENGER_ABOARD/);
  assert.match(markdown, /The manifest field `challengeHistoryEntries` is `null`/);
});

test('232 the director report is deterministic across runs', () => {
  assert.equal(
    JSON.stringify(runChallengeDirectorReport()),
    JSON.stringify(runChallengeDirectorReport()),
  );
});

test('232 the markdown reports the lifecycle, the seed and the bounded history', () => {
  const markdown = challengeDirectorReportMarkdown(runChallengeDirectorReport());
  assert.match(markdown, /`OFFERED` → `ACCEPTED` → `ACTIVE`/);
  assert.match(markdown, /Identical verdict fingerprint: true/);
  assert.match(markdown, /dropped oldest: 6/);
  assert.match(markdown, /Wall clock: `NOT_MEASURED`/);
  assert.match(markdown, /OFFER_ALREADY_ACTIVE/);
  assert.match(markdown, /BOUND_TO_TAXI/);
});

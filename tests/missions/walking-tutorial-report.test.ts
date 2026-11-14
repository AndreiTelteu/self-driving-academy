import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { runWalkingTutorialReport, walkingTutorialReportMarkdown } from './walking-tutorial-report';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '199-v3-walking-tutorial', 'report.json');
const EVIDENCE_MARKDOWN = join(
  process.cwd(),
  'Docs',
  'Evidence',
  '199-v3-walking-tutorial',
  'report.md',
);

test('199 raportul comis este transcriptul curent', () => {
  const report = runWalkingTutorialReport();
  const saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as unknown;
  assert.deepEqual(saved, JSON.parse(JSON.stringify(report)) as unknown);
  assert.equal(report.summary.pass, true);
  assert.equal(report.summary.passed, report.summary.checks);
  assert.equal(report.summary.steps, 6);
  assert.equal(report.summary.positives, 6);
  assert.equal(report.summary.negatives, 30);
  assert.equal(report.positive.length, 6);
  for (const row of report.positive) assert.equal(row.advanced, true, row.stepId);
  for (const row of report.negative)
    assert.equal(row.pass, true, `${row.stepId} <- ${row.eventFed}`);
  const markdown = readFileSync(EVIDENCE_MARKDOWN, 'utf8');
  assert.match(markdown, /Pași: \*\*6\*\*, avansați din evenimentul lor real: \*\*6\/6\*\*/);
  assert.match(markdown, /Verificări: \*\*10\/10\*\*/);
  assert.match(markdown, /Snapshot de compatibilitate V1/);
  assert.match(markdown, /Martor 198/);
});

test('199 raportul este determinist pe două rulări', () => {
  const first = runWalkingTutorialReport();
  const second = runWalkingTutorialReport();
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.determinism.digest, second.determinism.digest);
});

test('199 markdown-ul numește fiecare pas, evenimentul și refuzul lui', () => {
  const report = runWalkingTutorialReport();
  const markdown = walkingTutorialReportMarkdown(report);
  for (const row of report.positive) {
    assert.ok(markdown.includes(row.stepId), row.stepId);
    assert.ok(markdown.includes(row.event), row.event);
  }
  for (const row of report.negative) {
    assert.ok(markdown.includes(row.stepId), row.stepId);
    assert.ok(markdown.includes(row.eventFed), row.eventFed);
  }
  assert.match(markdown, /Digest|digest/);
  assert.match(markdown, /XP pentru timpul de mers/);
});

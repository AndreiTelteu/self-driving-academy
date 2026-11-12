import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  destructibleDecorReportMarkdown,
  runDestructibleDecorReport,
} from './destructible-decor-report';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '227-destructible-decor', 'report.json');
const EVIDENCE_MARKDOWN = join(
  process.cwd(),
  'Docs',
  'Evidence',
  '227-destructible-decor',
  'report.md',
);

test('227 committed destructible decor report is the current transcript', () => {
  const report = runDestructibleDecorReport();
  const saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as unknown;
  assert.deepEqual(saved, JSON.parse(JSON.stringify(report)) as unknown);
  assert.equal(report.summary.pass, true);
  assert.equal(report.summary.passed, report.summary.checks);
  for (const entry of report.checks)
    assert.equal(entry.pass, true, `${entry.name}: expected ${String(entry.expected)}`);
  const markdown = readFileSync(EVIDENCE_MARKDOWN, 'utf8');
  assert.match(markdown, /Zone: 3/);
  assert.match(markdown, /identice: true/);
});

test('227 the report is deterministic across runs', () => {
  assert.equal(
    JSON.stringify(runDestructibleDecorReport()),
    JSON.stringify(runDestructibleDecorReport()),
  );
});

test('227 the markdown reports the zone data, the closed transitions and the budget gap', () => {
  const markdown = destructibleDecorReportMarkdown(runDestructibleDecorReport());
  assert.match(markdown, /DRIFT_PAD 1, RAMP 1, DEMOLITION_ALLEY 1/);
  assert.match(markdown, /Impact slab: INTACT/);
  assert.match(markdown, /buget destructionBodies: null \(lacună raportată\)/);
  assert.match(markdown, /frame: NOT_MEASURED/);
});

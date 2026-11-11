import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { runWorldRecoveryReport, worldRecoveryReportMarkdown } from './world-recovery-report';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '226-world-recovery', 'report.json');
const EVIDENCE_MARKDOWN = join(
  process.cwd(),
  'Docs',
  'Evidence',
  '226-world-recovery',
  'report.md',
);

test('226 committed evidence report is the current transcript', () => {
  const report = runWorldRecoveryReport();
  const saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as unknown;
  assert.deepEqual(saved, JSON.parse(JSON.stringify(report)) as unknown);
  assert.equal(report.summary.pass, true);
  assert.equal(report.summary.passed, report.summary.checks);
  for (const entry of report.checks) {
    assert.equal(entry.pass, true, `${entry.name}: expected ${String(entry.expected)}`);
  }
  const markdown = readFileSync(EVIDENCE_MARKDOWN, 'utf8');
  assert.match(markdown, /65\/65 verificări, PASS/);
  assert.match(markdown, /Tick-uri până la mobilitate: 0/);
});

test('226 the report is deterministic across runs', () => {
  const first = JSON.stringify(runWorldRecoveryReport());
  const second = JSON.stringify(runWorldRecoveryReport());
  assert.equal(first, second);
});

test('226 the markdown reports the three distinct operations and the preserved owners', () => {
  const markdown = worldRecoveryReportMarkdown(runWorldRecoveryReport());
  assert.match(markdown, /VEHICLE_RECOVERY, CITY_RESET, STYLE_RESTORE/);
  assert.match(markdown, /Păstrate: profil true, XP true, daily true, rewards true, misiuni true/);
  assert.match(markdown, /playtest: NOT_PERFORMED/);
});

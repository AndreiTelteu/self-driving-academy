import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  extendedChallengesReportMarkdown,
  runExtendedChallengesReport,
} from './extended-challenges-report';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '188-v2-challenges', 'report.json');
const EVIDENCE_MARKDOWN = join(process.cwd(), 'Docs', 'Evidence', '188-v2-challenges', 'report.md');

test('188 committed extended challenge report is the current transcript', () => {
  const report = runExtendedChallengesReport();
  const saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as unknown;
  assert.deepEqual(saved, JSON.parse(JSON.stringify(report)) as unknown);
  assert.equal(report.summary.pass, true);
  assert.equal(report.summary.passed, report.summary.checks);
  for (const entry of report.checks)
    assert.equal(entry.pass, true, `${entry.id}: expected ${String(entry.expected)}`);
  const markdown = readFileSync(EVIDENCE_MARKDOWN, 'utf8');
  assert.match(
    markdown,
    /Chei V2 acoperite: 12 template-uri 231 neschimbate \+ 15 provocări extinse = 27/,
  );
  assert.match(markdown, /Verificări: 40\/40/);
  assert.match(markdown, /Pietoni/);
  assert.match(markdown, /Rutare/);
  assert.match(markdown, /Semnalizare/);
  assert.match(markdown, /Pericole/);
  assert.match(markdown, /Serviciu/);
  assert.match(markdown, /24\/24 taxiuri selectabile/);
  assert.match(markdown, /64\/64 conduse/);
});

test('188 the report is deterministic across runs', () => {
  assert.equal(
    JSON.stringify(runExtendedChallengesReport()),
    JSON.stringify(runExtendedChallengesReport()),
  );
});

test('188 the markdown names every challenge and its governed fact', () => {
  const report = runExtendedChallengesReport();
  const markdown = extendedChallengesReportMarkdown(report);
  for (const row of report.challenges) {
    assert.ok(markdown.includes(row.challengeId), row.challengeId);
    assert.ok(markdown.includes(row.learningKey), row.learningKey);
    assert.ok(markdown.includes(String(row.threshold)), row.challengeId);
  }
  assert.match(markdown, /Digest: `fnv1a32:/);
  assert.match(markdown, /Scrieri de profil: 0, joburi de learning: 0/);
});

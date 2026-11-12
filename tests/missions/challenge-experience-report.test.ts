import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHALLENGE_EXPERIENCE_REPORT_VERSION,
  challengeExperienceReportMarkdown,
  runChallengeExperienceReport,
} from './challenge-experience-report';

/**
 * 233 the committed evidence report is the one the code produces.
 *
 * The report is byte-stable: no wall clock, no random source, no browser. `npm run
 * missions:challenge-experience` writes it, `--check` proves it is current, and this test proves the
 * report itself passes every semantic check it publishes.
 */
test('233 the challenge experience report passes every published check', () => {
  const report = runChallengeExperienceReport();
  assert.equal(report.version, CHALLENGE_EXPERIENCE_REPORT_VERSION);
  assert.equal(report.summary.pass, true);
  assert.equal(report.summary.checks, report.checks.length);
  assert.equal(report.summary.passed, report.checks.length);
  for (const entry of report.checks) assert.equal(entry.pass, true, entry.name);
});

test('233 the report numbers are the delivered numbers', () => {
  const report = runChallengeExperienceReport();
  assert.equal(report.credit.length, 7);
  assert.equal(report.records.rows.length, 4);
  assert.deepEqual(
    report.records.rows.map((entry) => entry.comparison),
    ['FIRST_RECORD', 'WORSE', 'EQUAL', 'BETTER'],
  );
  assert.equal(report.retry.rows[0]!.newIdentity, true);
  assert.equal(report.retry.rows[0]!.attempt, 2);
  assert.equal(report.retry.duplicateAfterRetry, 'FAMILY_REWARDED_TODAY');
  assert.equal(report.daily.length, 5);
  assert.ok(report.daily.every((entry) => entry.templates.length === 3));
  assert.ok(report.daily.every((entry) => entry.checks.noRepeatOfPrevious));
  assert.equal(report.connection.expressible, 3);
  assert.equal(report.connection.deferred, 9);
  assert.equal(report.reactions.length, 7);
  assert.ok(report.reactions.every((entry) => entry.xpDelta === 0));
  assert.equal(report.storage.manifestChallengeHistoryEntries, 'NULL_IN_MANIFEST');
  assert.ok(report.storage.snapshotBytes > 0);
  assert.equal(report.performance.ui.globalListeners, 0);
  assert.equal(report.performance.simulation.perTickWork, 'NONE');
});

test('233 the report markdown is generated from the same numbers', () => {
  const report = runChallengeExperienceReport();
  const markdown = challengeExperienceReportMarkdown(report);
  assert.match(markdown, /^# 233 challenge experience report/);
  assert.match(markdown, /Checks: \d+\/\d+/);
  assert.match(markdown, /Overall: PASS/);
  assert.match(markdown, /challengeHistoryEntries/);
  assert.match(markdown, /provocări zilnice/);
});

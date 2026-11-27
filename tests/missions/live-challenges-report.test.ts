import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LIVE_CHALLENGES_REPORT_VERSION,
  liveChallengesReportMarkdown,
  runLiveChallengesReport,
} from './live-challenges-report';

/**
 * 277 the committed report is the one the code produces and every published check passes.
 */
test('277 the live challenge report passes every published check', () => {
  const report = runLiveChallengesReport();
  assert.equal(report.version, LIVE_CHALLENGES_REPORT_VERSION);
  assert.equal(report.summary.pass, true);
  assert.equal(report.summary.checks, report.checks.length);
  assert.equal(report.summary.passed, report.checks.length);
  for (const entry of report.checks) assert.equal(entry.pass, true, entry.name);
});

test('277 the report numbers are the delivered live numbers', () => {
  const report = runLiveChallengesReport();
  assert.equal(report.offer.visibleOffers, 1);
  assert.equal(report.offer.liveInstances, 0);
  assert.equal(report.offer.offerWindowTicks, 2_700);
  assert.equal(report.offer.cooldownTicks, 10_800);
  assert.equal(report.offer.passengerRefusal, 'PASSENGER_ABOARD');
  assert.equal(report.refusal.code, 'NO_ELIGIBLE_TEMPLATE');
  assert.ok(report.refusal.detail.some((entry) => entry.startsWith('DEADLINE_INFEASIBLE:')));
  assert.equal(report.destruction.offerRefused, true);
  assert.ok(report.destruction.reasons.includes('CAPABILITY:DESTRUCTIBLE_DECOR'));
  assert.equal(report.reward.firstXp, 80);
  assert.equal(report.reward.firstEntries, 1);
  assert.equal(report.reward.secondXp, 80);
  assert.equal(report.reward.secondEntries, 1);
  assert.equal(report.reward.rewardKeyFamily, 'PRECISION');
  assert.equal(report.records.rows, 1);
  assert.equal(report.records.bestProgress, 1);
  assert.equal(report.chaos.xp, 0);
  assert.equal(report.chaos.entries, 0);
  assert.match(report.chaos.xpLabel, /Record personal/);
  assert.equal(report.reload.restored, true);
  assert.equal(report.reload.entries, 1);
  assert.equal(report.reload.creditedXp, 80);
  assert.equal(report.facts.checkpointTicks, 2);
  assert.equal(report.ui.offerActions.join(','), 'ACCEPT,DECLINE,CONTINUE');
  assert.equal(report.ui.retryEnabled, false);
  assert.equal(report.ui.globalListeners, 0);
  assert.equal(report.performance.evaluationHz, 10);
  assert.equal(report.performance.frameMeasured, 'NOT_MEASURED');
});

test('277 the report markdown is generated from the same numbers', () => {
  const report = runLiveChallengesReport();
  const markdown = liveChallengesReportMarkdown(report);
  assert.match(markdown, /^# 277 live random challenges report/);
  assert.match(markdown, /Checks: \d+\/\d+/);
  assert.match(markdown, /Overall: PASS/);
  assert.match(markdown, /PASSENGER_ABOARD/);
  assert.match(markdown, /NOT_MEASURED/);
});

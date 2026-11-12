import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHALLENGE_EXPERIENCE_LIMITS,
  CHALLENGE_EXPERIENCE_STATE_VERSION,
  CHALLENGE_EXPERIENCE_VERSION,
  CHALLENGE_REACTION_VERSION,
  CHALLENGE_RECORD_VERSION,
  challengeDailyConnection,
  challengeDailyVariety,
  challengeFastRetry,
  challengeReaction,
  challengeRecordRank,
  challengeRewardKey,
  compareChallengeRanks,
  createChallengeExperience,
  createChallengeTemplateCatalog,
  createPlayerProgress,
  decodeChallengeRewardKey,
  parseChallengeReaction,
} from '../../src/missions';
import type { ChallengeDirectorInstance } from '../../src/missions';
import {
  EXPERIENCE_FIRST_DAY,
  EXPERIENCE_PREVIOUS_DAY,
  EXPERIENCE_SECOND_DAY,
  completedChallenge,
  createExperienceHarness,
  declinedChallenge,
  experienceCalendar,
  failedChallenge,
} from './challenge-experience-fixture';

/**
 * 233 deterministic tests.
 *
 * Every value is explicit: the director seed, the simulated clock, the calendar instant and the
 * real 213 ledger. No wall clock, no random source, no browser.
 */

const instant = (harness: ReturnType<typeof createExperienceHarness>) => ({
  harness,
  director: harness.director,
});

function completedAt(
  harness: ReturnType<typeof createExperienceHarness>,
  offset: number,
): ChallengeDirectorInstance {
  return completedChallenge(harness, offset);
}

test('233 the contract versions and finite caps are the published ones', () => {
  assert.equal(CHALLENGE_EXPERIENCE_VERSION, '233-challenge-experience-v1');
  assert.equal(CHALLENGE_EXPERIENCE_STATE_VERSION, '233-challenge-experience-state-v1');
  assert.equal(CHALLENGE_REACTION_VERSION, '233-challenge-reaction-v1');
  assert.equal(CHALLENGE_RECORD_VERSION, '233-challenge-record-v1');
  assert.equal(CHALLENGE_EXPERIENCE_LIMITS.records, 32);
  assert.equal(CHALLENGE_EXPERIENCE_LIMITS.rewardedKeys, 64);
  assert.equal(CHALLENGE_EXPERIENCE_LIMITS.dailyPicks, 3);
  assert.equal(CHALLENGE_EXPERIENCE_LIMITS.globalListeners, 0);
});

test('233 a completion credits its authored XP exactly once through the real 213 ledger', () => {
  const { harness } = instant(createExperienceHarness());
  const completed = completedChallenge(harness, 600);
  const first = harness.credit(completed);
  assert.equal(first.status, 'CREDITED');
  assert.equal(first.reason, null);
  assert.equal(first.creditedXp, completed.academyXp);
  assert.equal(first.academyXp, completed.academyXp);
  assert.equal(first.xpBalance, completed.academyXp);
  assert.equal(first.calendarAction, 'NEW_DAY');
  assert.equal(first.dailyDate, EXPERIENCE_FIRST_DAY);
  assert.equal(first.sessionKind, 'ACADEMY');
  assert.ok(first.rewardKey !== null);
  assert.equal(decodeChallengeRewardKey(first.rewardKey!)?.family, completed.family);
  assert.equal(decodeChallengeRewardKey(first.rewardKey!)?.dailyDate, EXPERIENCE_FIRST_DAY);

  const ledger = harness.ledger.read();
  assert.equal(ledger.entries.length, 1);
  const entry = ledger.entries[0]!;
  assert.equal(entry.causeType, 'MISSION_REWARD');
  assert.equal(entry.causeId, first.rewardKey);
  assert.equal(entry.evidence.source, 'MISSION_REWARD');
  assert.equal(
    entry.evidence.source === 'MISSION_REWARD' ? entry.evidence.missionId : null,
    completed.templateId,
  );

  const second = harness.credit(completed);
  assert.equal(second.status, 'DUPLICATE');
  assert.equal(second.reason, 'FAMILY_REWARDED_TODAY');
  assert.equal(second.creditedXp, 0);
  assert.equal(second.xpBalance, completed.academyXp);
  assert.equal(harness.ledger.read().entries.length, 1);
  assert.equal(harness.experience.read().counters.credits, 1);
  assert.equal(harness.experience.read().counters.duplicates, 1);
});

test('233 a replay and an unanswered offer pay nothing and never lower the balance', () => {
  const { harness } = instant(createExperienceHarness());
  const declined = declinedChallenge(harness);
  const declineCredit = harness.credit(declined);
  assert.equal(declineCredit.status, 'SKIPPED');
  assert.equal(declineCredit.reason, 'NOT_COMPLETED');
  assert.equal(declineCredit.creditedXp, 0);

  harness.skipCooldown();
  const expiredOffer = harness.offer(988);
  harness.director.advance({ ticks: 2_700, paused: false });
  const expired = harness.director.instance(expiredOffer.instanceId)!;
  const expiredCredit = harness.credit(expired);
  assert.equal(expiredCredit.status, 'SKIPPED');
  assert.equal(expiredCredit.reason, 'NOT_COMPLETED');
  assert.equal(harness.ledger.read().xpBalance, 0);

  harness.skipCooldown();
  const failed = failedChallenge(harness);
  const failedCredit = harness.credit(failed);
  assert.equal(failedCredit.status, 'SKIPPED');
  assert.equal(failedCredit.reason, 'NOT_COMPLETED');
  assert.equal(harness.ledger.read().xpBalance, 0);
});

test('233 Haos keeps only a local record and never credits Academy XP', () => {
  const { harness } = instant(createExperienceHarness({ sessionKind: 'CHAOS' }));
  const completed = completedChallenge(harness, 600);
  assert.equal(completed.sessionKind, 'CHAOS');
  assert.equal(completed.outcome!.reward.xpEligible, false);
  const credit = harness.credit(completed);
  assert.equal(credit.status, 'SKIPPED');
  assert.equal(credit.reason, 'LOCAL_RECORD_ONLY');
  assert.equal(credit.creditedXp, 0);
  assert.equal(credit.instanceRewardKey, null);
  assert.equal(harness.ledger.read().xpBalance, 0);

  const outcome = harness.record(completed);
  assert.equal(outcome.comparison, 'FIRST_RECORD');
  assert.ok(outcome.best !== null);
});

test('233 a clock rollback opens no new credit while a new day pays a new family credit', () => {
  const { harness } = instant(createExperienceHarness());
  const first = completedChallenge(harness, 600);
  assert.equal(harness.credit(first, EXPERIENCE_FIRST_DAY).status, 'CREDITED');
  assert.equal(harness.experience.read().reward.highestObservedDate, EXPERIENCE_FIRST_DAY);

  const rollback = harness.credit(first, EXPERIENCE_PREVIOUS_DAY);
  assert.equal(rollback.status, 'SKIPPED');
  assert.equal(rollback.reason, 'CALENDAR_ROLLBACK');
  assert.equal(rollback.creditedXp, 0);
  assert.equal(harness.experience.read().reward.highestObservedDate, EXPERIENCE_FIRST_DAY);

  const sameDay = harness.credit(first, EXPERIENCE_FIRST_DAY);
  assert.equal(sameDay.status, 'DUPLICATE');
  assert.equal(sameDay.calendarAction, 'SAME_DAY');

  const shared = harness.experience;
  const secondSession = createExperienceHarness({ experience: shared, ledger: harness.ledger });
  const nextDay = completedChallenge(secondSession, 600);
  const nextDayCredit = secondSession.credit(nextDay, EXPERIENCE_SECOND_DAY);
  assert.equal(nextDayCredit.status, 'CREDITED');
  assert.equal(nextDayCredit.calendarAction, 'NEW_DAY');
  assert.equal(nextDayCredit.rewardKey!.includes(EXPERIENCE_SECOND_DAY), true);
  assert.equal(harness.experience.read().reward.highestObservedDate, EXPERIENCE_SECOND_DAY);
  assert.equal(harness.ledger.read().entries.length, 2);
});

test('233 records compare better, equal and worse without ever lowering the best', () => {
  const first = createExperienceHarness();
  const best = completedAt(first, 300);
  const firstOutcome = first.record(best);
  assert.equal(firstOutcome.comparison, 'FIRST_RECORD');
  assert.equal(firstOutcome.improved, true);
  assert.equal(firstOutcome.best!.score.elapsedTicks, 300);

  const slower = createExperienceHarness({
    experience: first.experience,
    ledger: first.ledger,
  });
  const worse = completedAt(slower, 900);
  const worseOutcome = first.record(worse);
  assert.equal(worseOutcome.templateId, best.templateId);
  assert.equal(worseOutcome.comparison, 'WORSE');
  assert.equal(worseOutcome.improved, false);
  assert.equal(worseOutcome.best!.score.elapsedTicks, 300);
  assert.equal(worseOutcome.previous!.score.elapsedTicks, 300);

  const equalSession = createExperienceHarness({
    experience: first.experience,
    ledger: first.ledger,
  });
  const equal = completedAt(equalSession, 300);
  const equalOutcome = first.record(equal);
  assert.equal(equalOutcome.comparison, 'EQUAL');
  assert.equal(equalOutcome.improved, false);
  assert.equal(equalOutcome.best!.score.elapsedTicks, 300);

  const faster = createExperienceHarness({
    experience: first.experience,
    ledger: first.ledger,
  });
  const better = completedAt(faster, 120);
  const betterOutcome = first.record(better);
  assert.equal(betterOutcome.comparison, 'BETTER');
  assert.equal(betterOutcome.improved, true);
  assert.equal(betterOutcome.best!.score.elapsedTicks, 120);

  const record = first.experience.recordFor(best.templateId, best.templateVersion)!;
  assert.equal(record.attempts, 4);
  assert.equal(record.completions, 4);
  assert.equal(record.best!.attempt, better.attempt);
  assert.deepEqual([...record.best!.rank], [...challengeRecordRank(record.best!.score)]);
  assert.equal(compareChallengeRanks(record.best!.rank, record.best!.rank), 'EQUAL');
});

test('233 a failed attempt is recorded but never becomes a personal best', () => {
  const { harness } = instant(createExperienceHarness());
  const failed = failedChallenge(harness);
  const outcome = harness.record(failed);
  assert.equal(outcome.comparison, 'NOT_ELIGIBLE');
  assert.equal(outcome.score, null);
  assert.equal(outcome.best, null);
  assert.equal(outcome.attempts, 1);
  assert.equal(outcome.completions, 0);
  const record = harness.experience.recordFor(failed.templateId, failed.templateVersion)!;
  assert.equal(record.best, null);
  assert.equal(record.lastResult, 'FAILED');
  assert.equal(record.attempts, 1);
});

test('233 the fast retry restarts a failed challenge with a new identity and no second reward', () => {
  const { harness } = instant(createExperienceHarness());
  const failed = failedChallenge(harness);
  const credit = harness.credit(failed);
  assert.equal(credit.status, 'SKIPPED');

  const retry = challengeFastRetry({
    director: harness.director,
    instanceId: failed.instanceId,
    capabilities: harness.world().capabilities,
  });
  assert.equal(retry.status, 'RESTARTED');
  assert.ok(retry.instance !== null);
  assert.ok(retry.instance.instanceId !== failed.instanceId);
  assert.equal(retry.instance.templateId, failed.templateId);
  assert.equal(retry.instance.attempt, failed.attempt + 1);
  assert.equal(retry.newIdentity, true);
  assert.equal(retry.xpDelta, 0);
  assert.equal(retry.rewardIdentity, 'FAMILY_DAY_UNCHANGED');

  const retried = harness.director.instance(retry.instance!.instanceId)!;
  const completed = harness.complete(retried.instanceId, 600);
  const paid = harness.credit(completed);
  assert.equal(paid.status, 'CREDITED');
  assert.equal(paid.creditedXp, completed.academyXp);

  const duplicateSession = createExperienceHarness({
    experience: harness.experience,
    ledger: harness.ledger,
  });
  const duplicate = completedAt(duplicateSession, 300);
  const duplicateCredit = duplicateSession.credit(duplicate);
  assert.equal(duplicateCredit.status, 'DUPLICATE');
  assert.equal(duplicateCredit.creditedXp, 0);
  assert.equal(harness.ledger.read().xpBalance, completed.academyXp);
});

test('233 the retry refuses a completed challenge and the per-template attempt cap', () => {
  const { harness } = instant(createExperienceHarness());
  const completed = completedChallenge(harness, 600);
  const refused = challengeFastRetry({
    director: harness.director,
    instanceId: completed.instanceId,
    capabilities: harness.world().capabilities,
  });
  assert.equal(refused.status, 'REFUSED');
  assert.equal(refused.code, 'NOT_FAILED');
  assert.equal(refused.xpDelta, 0);

  harness.skipCooldown();
  const failed = failedChallenge(harness);
  let instanceId = failed.instanceId;
  for (let attempt = failed.attempt + 1; attempt <= 8; attempt += 1) {
    const retry = challengeFastRetry({
      director: harness.director,
      instanceId,
      capabilities: harness.world().capabilities,
    });
    assert.equal(retry.status, 'RESTARTED');
    instanceId = retry.instance!.instanceId;
    harness.fail(instanceId);
  }
  const capped = challengeFastRetry({
    director: harness.director,
    instanceId,
    capabilities: harness.world().capabilities,
  });
  assert.equal(capped.status, 'REFUSED');
  assert.equal(capped.code, 'ATTEMPT_LIMIT');
  assert.equal(capped.xpDelta, 0);
});

test('233 the daily variety is exactly three, distinct, manual-capable and Haos-free', () => {
  const catalog = createChallengeTemplateCatalog();
  const first = challengeDailyVariety({
    catalog,
    dailyDate: EXPERIENCE_FIRST_DAY,
    seed: 4_242,
  });
  const again = challengeDailyVariety({
    catalog,
    dailyDate: EXPERIENCE_FIRST_DAY,
    seed: 4_242,
  });
  assert.deepEqual(first.picks, again.picks);
  assert.equal(first.picks.length, 3);
  assert.equal(first.checks.exactlyThree, true);
  assert.equal(first.checks.uniqueTemplates, true);
  assert.equal(first.checks.atLeastOneManual, true);
  assert.equal(first.checks.distinctFamilies, true);
  assert.equal(first.checks.catalogOnly, true);
  assert.equal(first.checks.noChaosOnly, true);
  assert.equal(first.counts.families, 3);
  assert.ok(first.counts.manual >= 1);
  assert.ok(first.picks.every((entry) => entry.objectiveKind !== 'DISTRUCTION'));
  assert.ok(first.picks.every((entry) => entry.sessions.includes('ACADEMY')));
  assert.deepEqual(
    first.picks.map((entry) => entry.slot),
    [1, 2, 3],
  );

  const nextDay = challengeDailyVariety({
    catalog,
    dailyDate: EXPERIENCE_SECOND_DAY,
    seed: 4_242,
  });
  assert.notDeepEqual(
    first.picks.map((entry) => entry.templateId),
    nextDay.picks.map((entry) => entry.templateId),
  );

  const avoiding = challengeDailyVariety({
    catalog,
    dailyDate: EXPERIENCE_SECOND_DAY,
    seed: 4_242,
    previousTemplateIds: first.picks.map((entry) => entry.templateId),
  });
  assert.equal(avoiding.checks.noRepeatOfPrevious, true);
  assert.equal(avoiding.repeatAvoided, true);
});

test('233 the daily connection names the three 211 families and leaves nine templates open', () => {
  const connection = challengeDailyConnection();
  assert.equal(connection.bridgeVersion, '231-challenge-daily-bridge-v1');
  assert.equal(connection.bridgeSchema, 1);
  assert.equal(connection.dailyMissionsPerDay, 3);
  assert.equal(connection.counts.catalog, 12);
  assert.equal(connection.counts.expressible, 3);
  assert.equal(connection.counts.deferred, 9);
  assert.deepEqual(
    [...connection.expressibleTemplateIds],
    ['challenge-city-copies-me', 'challenge-last-minute-airport', 'challenge-maternity-run'],
  );
  assert.equal(connection.deferredTemplateIds.length, 9);
  assert.match(connection.statement, /211/);
  assert.match(connection.statement, /exact trei/);
});

test('233 the comic reaction is authored per trigger, deterministic and costs no XP', () => {
  const { harness } = instant(createExperienceHarness());
  const offer = harness.offer();
  const offerReaction = challengeReaction({ instance: offer });
  assert.equal(offerReaction.trigger, 'OFFER');
  assert.equal(offerReaction.authored, true);
  assert.equal(offerReaction.xpDelta, 0);
  assert.equal(offerReaction.penalty, 'NONE');
  assert.ok(offerReaction.text.length > 0);

  harness.accept(offer.instanceId);
  const active = harness.director.instance(offer.instanceId)!;
  assert.equal(challengeReaction({ instance: active }).trigger, 'PROGRESS');

  harness.activate(offer.instanceId);
  const completed = harness.complete(offer.instanceId, 600);
  const catalog = createChallengeTemplateCatalog();
  const template = catalog.templates.find((entry) => entry.templateId === completed.templateId)!;
  const successLine = template.dialogue.find((entry) => entry.trigger === 'SUCCESS')!;
  const success = challengeReaction({ instance: completed });
  assert.equal(success.trigger, 'SUCCESS');
  assert.equal(success.tone, 'CELEBRATION');
  assert.equal(success.effect, 'CELEBRATION');
  assert.equal(success.text, successLine.text);
  assert.equal(success.xpStatement, 'XP_PENDING');

  const credit = harness.credit(completed);
  const credited = challengeReaction({ instance: completed, credit });
  assert.equal(credited.xpStatement, 'XP_CREDITED');
  const duplicate = harness.credit(completed);
  const recordOnly = challengeReaction({ instance: completed, credit: duplicate });
  assert.equal(recordOnly.xpStatement, 'RECORD_ONLY');

  harness.skipCooldown();
  const declinedInstance = declinedChallenge(harness);
  const decline = challengeReaction({ instance: declinedInstance });
  assert.equal(decline.trigger, 'DECLINE');
  assert.equal(decline.tone, 'SHRUG');
  assert.equal(decline.effect, 'SHRUG');
  assert.equal(decline.authored, false);
  assert.equal(decline.xpStatement, 'NO_XP_LOSS');
  assert.equal(parseChallengeReaction(decline).text, decline.text);

  harness.skipCooldown();
  const failed = failedChallenge(harness);
  const failure = challengeReaction({ instance: failed });
  const failureLine = createChallengeTemplateCatalog()
    .templates.find((entry) => entry.templateId === failed.templateId)!
    .dialogue.find((entry) => entry.trigger === 'FAILURE')!;
  assert.equal(failure.trigger, 'FAILURE');
  assert.equal(failure.text, failureLine.text);
  assert.equal(failure.xpStatement, 'NO_XP_LOSS');
});

test('233 every authored reaction text of the catalog is safe and every state is covered', () => {
  const catalog = createChallengeTemplateCatalog();
  const { harness } = instant(createExperienceHarness());
  const offer = harness.offer();
  const base = { ...offer };
  for (const template of catalog.templates) {
    const authored = challengeReaction({
      instance: {
        ...base,
        templateId: template.templateId,
        templateVersion: template.version,
        family: template.family,
        state: 'OFFERED',
      },
    });
    assert.equal(authored.authored, true);
    assert.equal(authored.templateId, template.templateId);
    assert.equal(authored.text.length > 0, true);
    assert.equal(authored.xpDelta, 0);
  }
  for (const template of catalog.templates) {
    const line = template.dialogue.find((entry) => entry.trigger === 'FAILURE')!;
    assert.equal(
      parseChallengeReaction(
        challengeReaction({
          instance: {
            ...base,
            templateId: template.templateId,
            templateVersion: template.version,
            state: 'FAILED',
          },
        }),
      ).authored,
      true,
    );
    assert.ok(line.text.length > 0);
  }
});

test('233 the reaction parser refuses an unsafe line and a balance change', () => {
  const { harness } = instant(createExperienceHarness());
  const offer = harness.offer();
  const valid = challengeReaction({ instance: offer });
  const unsafe = { ...valid, text: 'Publică pe Instagram și vezi filmarea!' };
  assert.throws(() => parseChallengeReaction(unsafe), /reaction cannot promise or insult/);
  const losing = { ...valid, xpDelta: 1 };
  assert.throws(() => parseChallengeReaction(losing), /never changes the XP balance/);
  const tone = { ...valid, tone: 'CELEBRATION', effect: 'CELEBRATION' };
  assert.throws(() => parseChallengeReaction(tone), /does not match its trigger/);
});

test('233 the experience survives a reload and refuses a tampered snapshot', () => {
  const { harness } = instant(createExperienceHarness());
  const completed = completedChallenge(harness, 300);
  harness.record(completed);
  harness.credit(completed);
  const snapshot = harness.experience.snapshot();
  assert.equal(snapshot.version, CHALLENGE_EXPERIENCE_STATE_VERSION);
  assert.equal(snapshot.records.length, 1);
  assert.equal(snapshot.rewardedKeys.length, 1);
  assert.equal(snapshot.highestObservedDate, EXPERIENCE_FIRST_DAY);

  const restored = createChallengeExperience({
    ledger: harness.ledger,
    snapshot: JSON.parse(JSON.stringify(snapshot)),
  });
  assert.equal(restored.read().records.length, 1);
  assert.equal(restored.read().records[0]!.best!.score.elapsedTicks, 300);
  assert.equal(restored.read().reward.highestObservedDate, EXPERIENCE_FIRST_DAY);
  assert.equal(
    restored.credit({ instance: completed, calendar: experienceCalendar(EXPERIENCE_FIRST_DAY) })
      .status,
    'DUPLICATE',
  );
  assert.equal(harness.ledger.read().entries.length, 1);

  const tampered = JSON.parse(JSON.stringify(snapshot)) as {
    records: { best: { rank: number[] } }[];
  };
  tampered.records[0]!.best.rank = [-1, 0, 0];
  const refused = restored.restore(tampered);
  assert.equal(refused.status, 'REFUSED');
  assert.equal(restored.read().records[0]!.best!.score.elapsedTicks, 300);

  const missing = restored.restore({ ...snapshot, version: 'other' });
  assert.equal(missing.status, 'REFUSED');
});

test('233 invalid inputs are refused instead of invented', () => {
  const { harness } = instant(createExperienceHarness());
  const completed = completedChallenge(harness, 600);
  assert.throws(() => harness.experience.credit({ instance: completed }), /calendar/);
  assert.throws(
    () =>
      harness.experience.credit({
        instance: completed,
        calendar: experienceCalendar(EXPERIENCE_FIRST_DAY),
        extra: true,
      }),
    /Unknown challenge credit request field/,
  );
  assert.throws(() => challengeRewardKey('NOT_A_FAMILY', EXPERIENCE_FIRST_DAY), /enum|family/i);
  assert.throws(() => challengeRewardKey('PRECISION', 'not-a-date'), /daily date/i);
  assert.throws(
    () =>
      challengeFastRetry({
        director: harness.director,
        instanceId: completed.instanceId,
        capabilities: harness.world().capabilities,
        other: 1,
      }),
    /Unknown challenge retry request field/,
  );
  assert.throws(
    () =>
      createChallengeExperience({
        ledger: createPlayerProgress({ playerId: 'player:233-empty' }),
        snapshot: { schemaVersion: 1 },
      }),
    /Missing challenge experience snapshot field/,
  );
  const empty = createChallengeExperience({
    ledger: createPlayerProgress({ playerId: 'player:233-empty' }),
  });
  assert.equal(empty.read().records.length, 0);
  assert.equal(empty.read().reward.highestObservedDate, null);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHALLENGE_DIRECTOR_LIMITS,
  CHALLENGE_DIRECTOR_TRANSITIONS,
  challengeCancellationReasons,
  challengeDirectorTransitionAllowed,
  challengeInstanceStates,
  createChallengeDirector,
} from '../../src/missions';
import type {
  ChallengeAcceptedResult,
  ChallengeActivatedResult,
  ChallengeDeclinedResult,
  ChallengeDirector,
  ChallengeDirectorSnapshot,
  ChallengeOfferedResult,
} from '../../src/missions';
import {
  DIRECTOR_FIXTURE_SEED,
  DIRECTOR_SESSION_ID,
  DIRECTOR_TAXI_ID,
  DIRECTOR_WORLD_EPOCH,
  createDirectorFixture,
  directorFacts,
  directorRoutes,
  directorWorld,
  directorWorldAt,
} from './challenge-director-fixture';

/**
 * PBI 232 — deterministic proof of the challenge director contract.
 *
 * No browser, no wall clock, no random source: every scenario drives the simulated clock explicitly
 * and every route answer comes from the fixture double.
 */

function fail(message: string): never {
  throw new assert.AssertionError({ message });
}

function offered(
  director: ChallengeDirector,
  options: { seed?: number } = {},
): ChallengeOfferedResult {
  const result = director.offer({
    world: directorWorldAt(director),
    ...(options.seed === undefined ? {} : { seed: options.seed }),
  });
  if (result.status !== 'OFFERED') fail(`Expected an offer, got ${result.code}`);
  return result;
}

function accepted(director: ChallengeDirector, instanceId: string): ChallengeAcceptedResult {
  const result = director.accept({
    instanceId,
    taxi: { taxiId: DIRECTOR_TAXI_ID, status: 'AVAILABLE', freeTaxis: 3 },
    assignment: null,
    passengerAboard: false,
  });
  if (result.status !== 'ACCEPTED') fail(`Expected an acceptance, got ${result.code}`);
  return result;
}

function activated(director: ChallengeDirector, instanceId: string): ChallengeActivatedResult {
  const result = director.activate({ instanceId });
  if (result.status !== 'ACTIVE') fail(`Expected activation, got ${result.code}`);
  return result;
}

function declined(director: ChallengeDirector, instanceId: string): ChallengeDeclinedResult {
  const result = director.decline({ instanceId });
  if (result.status !== 'DECLINED') fail(`Expected a decline, got ${result.code}`);
  return result;
}

function cooldown(director: ChallengeDirector): void {
  director.advance({ ticks: CHALLENGE_DIRECTOR_LIMITS.cooldownTicks, paused: false });
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

test('232 the lifecycle graph is closed and every terminal state is final', () => {
  for (const state of challengeInstanceStates) {
    const allowed = CHALLENGE_DIRECTOR_TRANSITIONS[state];
    for (const target of allowed)
      assert.equal(
        challengeDirectorTransitionAllowed(state, target),
        true,
        `${state} -> ${target} must be allowed`,
      );
  }
  for (const terminal of ['COMPLETED', 'FAILED', 'CANCELLED', 'DECLINED', 'EXPIRED'] as const)
    assert.deepEqual(CHALLENGE_DIRECTOR_TRANSITIONS[terminal], [], `${terminal} is final`);
  assert.equal(challengeDirectorTransitionAllowed('OFFERED', 'ACTIVE'), false);
  assert.equal(challengeDirectorTransitionAllowed('COMPLETED', 'ACTIVE'), false);
  assert.equal(challengeDirectorTransitionAllowed('ACCEPTED', 'OFFERED'), false);
  assert.equal(challengeDirectorTransitionAllowed('EXPIRED', 'DECLINED'), false);
});

test('232 an offer during a ride leaves the assignment and the passenger untouched', () => {
  const director = createDirectorFixture();
  const assignment = Object.freeze({
    assignmentId: 'assignment:fixture:1',
    requestId: 'request:fixture:1',
    taxiId: DIRECTOR_TAXI_ID,
    customerId: 'customer:fixture:1',
  });
  const result = director.offer({
    world: directorWorldAt(director, {
      taxiStatus: 'ASSIGNED',
      freeTaxis: 2,
      passengerAboard: true,
      assignment,
    }),
  });
  if (result.status !== 'OFFERED') fail(`Expected an offer, got ${result.code}`);
  assert.equal(result.instance.state, 'OFFERED');
  assert.equal(result.interruption.ride, assignment.assignmentId);
  assert.equal(result.interruption.passenger, assignment.customerId);
  assert.equal(result.interruption.rideCancelled, false);
  assert.equal(result.interruption.assignmentChanged, false);
  assert.equal(result.interruption.passengerMoved, false);
  // The frozen world snapshot proves the director cannot mutate the real ride.
  assert.deepEqual(assignment, {
    assignmentId: 'assignment:fixture:1',
    requestId: 'request:fixture:1',
    taxiId: DIRECTOR_TAXI_ID,
    customerId: 'customer:fixture:1',
  });

  const refused = director.accept({
    instanceId: result.instance.instanceId,
    taxi: { taxiId: DIRECTOR_TAXI_ID, status: 'ASSIGNED', freeTaxis: 2 },
    assignment,
    passengerAboard: true,
  });
  assert.equal(refused.status, 'REFUSED');
  if (refused.status !== 'REFUSED') return fail('Expected a refusal');
  assert.equal(refused.code, 'PASSENGER_ABOARD');
  const live = director.instance(result.instance.instanceId)!;
  assert.equal(live.state, 'OFFERED', 'the offer stays open, the passenger stays aboard');
  assert.equal(director.stats().cancelled, 0);
});

test('232 a dispatched taxi is never replaced by a challenge acceptance', () => {
  const director = createDirectorFixture();
  const offer = offered(director);
  const result = director.accept({
    instanceId: offer.instance.instanceId,
    taxi: { taxiId: DIRECTOR_TAXI_ID, status: 'ASSIGNED', freeTaxis: 1 },
    assignment: {
      assignmentId: 'assignment:fixture:2',
      requestId: 'request:fixture:2',
      taxiId: DIRECTOR_TAXI_ID,
      customerId: 'customer:fixture:2',
    },
    passengerAboard: false,
  });
  assert.equal(result.status, 'REFUSED');
  if (result.status !== 'REFUSED') return fail('Expected a refusal');
  assert.equal(result.code, 'TAXI_ASSIGNED');
  assert.equal(director.instance(offer.instance.instanceId)!.state, 'OFFERED');
});

test('232 a second offer in the same window is refused explicitly', () => {
  const director = createDirectorFixture();
  const first = offered(director);
  const second = director.offer({ world: directorWorldAt(director) });
  assert.equal(second.status, 'REFUSED');
  if (second.status !== 'REFUSED') return fail('Expected a refusal');
  assert.equal(second.code, 'OFFER_ALREADY_ACTIVE');
  assert.deepEqual(second.detail, [first.instance.instanceId]);
  assert.equal(director.stats().liveOffers, 1);
});

test('232 a second live instance cannot be started while one is active', () => {
  const director = createDirectorFixture();
  const offer = offered(director);
  accepted(director, offer.instance.instanceId);
  activated(director, offer.instance.instanceId);
  const second = director.offer({ world: directorWorldAt(director) });
  assert.equal(second.status, 'REFUSED');
  if (second.status !== 'REFUSED') return fail('Expected a refusal');
  assert.equal(second.code, 'INSTANCE_ALREADY_ACTIVE');
  assert.equal(director.stats().liveInstances, 1);
});

test('232 the cooldown after a decline blocks offers until three active minutes pass', () => {
  const director = createDirectorFixture();
  const offer = offered(director);
  declined(director, offer.instance.instanceId);
  const blocked = director.offer({ world: directorWorldAt(director) });
  assert.equal(blocked.status, 'REFUSED');
  if (blocked.status !== 'REFUSED') return fail('Expected a refusal');
  assert.equal(blocked.code, 'COOLDOWN_ACTIVE');
  assert.deepEqual(blocked.detail, [String(CHALLENGE_DIRECTOR_LIMITS.cooldownTicks)]);
  director.advance({ ticks: CHALLENGE_DIRECTOR_LIMITS.cooldownTicks - 1, paused: false });
  const stillBlocked = director.offer({ world: directorWorldAt(director) });
  assert.equal(stillBlocked.status, 'REFUSED');
  director.advance({ ticks: 1, paused: false });
  const reopened = director.offer({ world: directorWorldAt(director) });
  assert.equal(reopened.status, 'OFFERED');
  assert.equal(director.stats().cooldownRemainingTicks, 0);
});

test('232 the anti-repetition history avoids the last three templates and stays bounded', () => {
  const director = createDirectorFixture();
  const seen: string[] = [];
  for (let index = 0; index < 8; index += 1) {
    const offer = offered(director);
    seen.push(offer.instance.templateId);
    declined(director, offer.instance.instanceId);
    cooldown(director);
  }
  for (let index = 3; index < seen.length; index += 1) {
    const window = seen.slice(index - 3, index);
    assert.equal(
      window.includes(seen[index]!),
      false,
      `offer ${String(index)} repeated ${seen[index]} from ${window.join(', ')}`,
    );
  }
  const stats = director.stats();
  assert.equal(stats.history, 8);
  assert.equal(stats.history <= CHALLENGE_DIRECTOR_LIMITS.historyEntries, true);
  assert.equal(stats.historyCodeUnits <= CHALLENGE_DIRECTOR_LIMITS.historyCodeUnits, true);
  for (const entry of director.history()) {
    assert.equal(challengeCancellationReasons.includes('PLAYER_CANCELLED'), true);
    assert.equal(entry.result, 'DECLINED');
  }
});

test('232 the history cap drops the oldest entries instead of growing without bound', () => {
  const director = createDirectorFixture();
  for (let index = 0; index < CHALLENGE_DIRECTOR_LIMITS.historyEntries + 4; index += 1) {
    const offer = offered(director);
    declined(director, offer.instance.instanceId);
    cooldown(director);
  }
  const stats = director.stats();
  assert.equal(stats.history, CHALLENGE_DIRECTOR_LIMITS.historyEntries);
  assert.equal(stats.droppedHistory, 4);
  assert.equal(stats.historyCodeUnits <= CHALLENGE_DIRECTOR_LIMITS.historyCodeUnits, true);
});

test('232 the toggle stops new offers but never touches a live instance', () => {
  const director = createDirectorFixture();
  const offer = offered(director);
  accepted(director, offer.instance.instanceId);
  activated(director, offer.instance.instanceId);
  const off = director.setOffersEnabled({ enabled: false });
  assert.equal(off.enabled, false);
  assert.equal(off.retractedOffers, 0, 'a live instance is not an offer');
  assert.equal(off.activeInstanceId, offer.instance.instanceId);
  const refused = director.offer({ world: directorWorldAt(director) });
  assert.equal(refused.status, 'REFUSED');
  if (refused.status !== 'REFUSED') return fail('Expected a refusal');
  assert.equal(refused.code, 'OFFERS_DISABLED');
  assert.equal(director.instance(offer.instance.instanceId)!.state, 'ACTIVE');
  const back = director.setOffersEnabled({ enabled: true });
  assert.equal(back.enabled, true);
  const again = director.offer({ world: directorWorldAt(director) });
  assert.equal(again.status, 'REFUSED', 'the live instance still owns the slot');
});

test('232 disabling the toggle retracts a visible offer without cost', () => {
  const director = createDirectorFixture();
  const offer = offered(director);
  const off = director.setOffersEnabled({ enabled: false });
  assert.equal(off.retractedOffers, 1);
  const retracted = director.instance(offer.instance.instanceId)!;
  assert.equal(retracted.state, 'EXPIRED');
  assert.equal(retracted.outcome!.reason, 'OFFERS_DISABLED');
  assert.equal(retracted.outcome!.xpDelta, 0);
  assert.equal(retracted.outcome!.reward.academyXp, 0);
});

test('232 declining a challenge costs no XP, reward or reputation', () => {
  const director = createDirectorFixture();
  const offer = offered(director);
  const result = declined(director, offer.instance.instanceId);
  assert.equal(result.penalty, 'NONE');
  assert.equal(result.xpDelta, 0);
  assert.equal(result.reputationDelta, 0);
  assert.equal(result.rewardGranted, false);
  assert.equal(result.outcome.status, 'DECLINED');
  assert.equal(result.outcome.reward.xpEligible, false);
  assert.equal(result.outcome.reward.academyXp, 0);
  assert.equal(result.outcome.reward.rewardKey, null);
  assert.equal(result.outcome.reward.claimed, false);
  assert.equal(result.cooldownUntilTick, CHALLENGE_DIRECTOR_LIMITS.cooldownTicks);
  const duplicate = director.decline({ instanceId: offer.instance.instanceId });
  assert.equal(duplicate.status, 'DECLINED');
  if (duplicate.status !== 'DECLINED') return fail('Expected a decline');
  assert.equal(duplicate.duplicate, true);
  assert.equal(director.stats().declined, 1);
});

test('232 the saved seed reproduces the same challenge across a JSON reload', () => {
  const director = createDirectorFixture();
  const offer = offered(director, { seed: 987_654 });
  accepted(director, offer.instance.instanceId);
  activated(director, offer.instance.instanceId);
  director.advance({ ticks: 600, paused: false });
  const before = director.instance(offer.instance.instanceId)!;
  const snapshot = director.snapshot();
  assert.equal(snapshot.instances.length, 1);

  const reloaded = createChallengeDirector({
    seed: DIRECTOR_FIXTURE_SEED,
    routes: directorRoutes(),
  });
  const restored = reloaded.restore(deepClone(snapshot));
  assert.equal(restored.status, 'RESTORED');
  const after = reloaded.instance(offer.instance.instanceId)!;
  assert.deepEqual(deepClone(after), deepClone(before));
  assert.equal(after.seed, 987_654);
  assert.equal(after.objective.deadlineTick, before.objective.deadlineTick);
  assert.equal(after.durationTicks, before.durationTicks);
  assert.deepEqual(reloaded.snapshot(), deepClone(snapshot));

  const facts = directorFacts(after);
  const original = director.evaluate({ instanceId: before.instanceId, facts });
  const replayed = reloaded.evaluate({ instanceId: after.instanceId, facts });
  assert.equal(original.status, 'COMPLETED');
  assert.equal(replayed.status, 'COMPLETED');
  if (original.status !== 'COMPLETED' || replayed.status !== 'COMPLETED')
    return fail('Expected both runs to complete');
  assert.equal(replayed.verdict!.fingerprint, original.verdict!.fingerprint);
  assert.deepEqual(replayed.instance.outcome!.reward, original.instance.outcome!.reward);
  assert.equal(replayed.instance.outcome!.tick, original.instance.outcome!.tick);
});

test('232 the full lifecycle is counted per state and terminal states are final', () => {
  const director = createDirectorFixture();
  const offer = offered(director);
  const acceptance = accepted(director, offer.instance.instanceId);
  assert.equal(acceptance.duplicate, false);
  assert.equal(acceptance.reservation.dispatchSuspended, true);
  assert.equal(acceptance.reservation.taxiId, DIRECTOR_TAXI_ID);
  assert.equal(acceptance.reservation.pickupZoneId, offer.instance.pickupZoneId);
  assert.equal(acceptance.reservation.dropoffZoneId, offer.instance.dropoffZoneId);
  assert.equal(acceptance.reservation.rideRequestId, offer.instance.rideRequestId);
  const duplicateAccept = director.accept({
    instanceId: offer.instance.instanceId,
    taxi: { taxiId: DIRECTOR_TAXI_ID, status: 'AVAILABLE', freeTaxis: 3 },
    assignment: null,
    passengerAboard: false,
  });
  assert.equal(duplicateAccept.status, 'ACCEPTED');
  if (duplicateAccept.status !== 'ACCEPTED') return fail('Expected a duplicate acceptance');
  assert.equal(duplicateAccept.duplicate, true);

  const active = activated(director, offer.instance.instanceId);
  assert.equal(active.instance.state, 'ACTIVE');
  assert.equal(
    active.instance.objective.deadlineTick,
    active.instance.activatedAtTick! + active.instance.durationTicks,
  );
  const duplicateActivate = director.activate({ instanceId: offer.instance.instanceId });
  assert.equal(duplicateActivate.status, 'ACTIVE');
  if (duplicateActivate.status !== 'ACTIVE') return fail('Expected a duplicate activation');
  assert.equal(duplicateActivate.duplicate, true);

  const completed = director.evaluate({
    instanceId: offer.instance.instanceId,
    facts: directorFacts(active.instance, { endedTick: active.instance.objective.deadlineTick }),
  });
  assert.equal(completed.status, 'COMPLETED');
  const duplicateEvaluate = director.evaluate({
    instanceId: offer.instance.instanceId,
    facts: directorFacts(active.instance),
  });
  assert.equal(duplicateEvaluate.status, 'DUPLICATE');

  const stats = director.stats();
  assert.equal(stats.offers, 1);
  assert.equal(stats.accepted, 1);
  assert.equal(stats.activated, 1);
  assert.equal(stats.completed, 1);
  assert.deepEqual(stats.totals, {
    OFFERED: 1,
    ACCEPTED: 1,
    ACTIVE: 1,
    COMPLETED: 1,
    FAILED: 0,
    CANCELLED: 0,
    DECLINED: 0,
    EXPIRED: 0,
  });
  assert.deepEqual(stats.byState, {
    OFFERED: 0,
    ACCEPTED: 0,
    ACTIVE: 0,
    COMPLETED: 1,
    FAILED: 0,
    CANCELLED: 0,
    DECLINED: 0,
    EXPIRED: 0,
  });
});

test('232 pausing freezes the objective clock and the deadline still fails explicitly', () => {
  const director = createDirectorFixture();
  const offer = offered(director);
  accepted(director, offer.instance.instanceId);
  const active = activated(director, offer.instance.instanceId);
  const deadline = active.instance.objective.deadlineTick;
  const paused = director.advance({ ticks: 10_000_000, paused: true });
  assert.equal(paused.simulatedTick, 0);
  assert.equal(paused.expiredInstances, 0);
  assert.equal(director.instance(offer.instance.instanceId)!.state, 'ACTIVE');
  director.advance({ ticks: deadline, paused: false });
  const failed = director.instance(offer.instance.instanceId)!;
  assert.equal(failed.state, 'FAILED');
  assert.equal(failed.outcome!.reason, 'DEADLINE_EXPIRED');
  assert.equal(failed.outcome!.penalty, 'NONE');
  assert.equal(failed.outcome!.xpDelta, 0);
  assert.equal(failed.endedAtTick, deadline);
});

test('232 an unanswered offer expires inside its window and starts the cooldown', () => {
  const director = createDirectorFixture();
  const offer = offered(director);
  const result = director.advance({
    ticks: CHALLENGE_DIRECTOR_LIMITS.offerWindowTicks,
    paused: false,
  });
  assert.equal(result.expiredOffers, 1);
  const expired = director.instance(offer.instance.instanceId)!;
  assert.equal(expired.state, 'EXPIRED');
  assert.equal(expired.outcome!.reason, 'OFFER_EXPIRED');
  assert.equal(director.stats().expiredOffers, 1);
  assert.equal(director.stats().cooldownRemainingTicks, CHALLENGE_DIRECTOR_LIMITS.cooldownTicks);
});

test('232 R starts a new instance and a different taxi is refused', () => {
  const director = createDirectorFixture();
  const offer = offered(director);
  accepted(director, offer.instance.instanceId);
  const active = activated(director, offer.instance.instanceId);
  const unchanged = director.changeVehicle({
    instanceId: active.instance.instanceId,
    taxiId: DIRECTOR_TAXI_ID,
  });
  assert.equal(unchanged.status, 'UNCHANGED');
  if (unchanged.status !== 'UNCHANGED') return fail('Expected an unchanged binding');
  assert.equal(unchanged.duplicateInstances, 0);
  assert.equal(unchanged.duplicateRewards, 0);

  const bound = director.changeVehicle({
    instanceId: active.instance.instanceId,
    taxiId: 'taxi:other',
  });
  assert.equal(bound.status, 'REFUSED');
  if (bound.status !== 'REFUSED') return fail('Expected a refusal');
  assert.equal(bound.code, 'BOUND_TO_TAXI');

  const restarted = director.restart({
    instanceId: active.instance.instanceId,
    capabilities: directorWorld().capabilities,
    seed: 5_432_1,
  });
  assert.equal(restarted.status, 'ACTIVE');
  if (restarted.status !== 'ACTIVE') return fail('Expected a restart');
  assert.notEqual(restarted.instance.instanceId, active.instance.instanceId);
  assert.equal(restarted.instance.attempt, active.instance.attempt + 1);
  assert.equal(restarted.instance.seed, 5_432_1);
  assert.equal(director.instance(active.instance.instanceId)!.state, 'CANCELLED');
  assert.equal(director.instance(active.instance.instanceId)!.outcome!.reason, 'RESTART');
  assert.equal(director.instances().length, 2);
  assert.equal(director.stats().cancelled, 1);
});

test('232 the per-template attempt cap refuses R instead of duplicating an instance', () => {
  const director = createDirectorFixture();
  const offer = offered(director);
  accepted(director, offer.instance.instanceId);
  let active = activated(director, offer.instance.instanceId).instance;
  for (let attempt = 2; attempt <= CHALLENGE_DIRECTOR_LIMITS.attemptsPerTemplate; attempt += 1) {
    const result = director.restart({
      instanceId: active.instanceId,
      capabilities: directorWorld().capabilities,
      seed: 1_000 + attempt,
    });
    assert.equal(result.status, 'ACTIVE', `restart ${String(attempt)} must be accepted`);
    if (result.status !== 'ACTIVE') return fail('Expected a restart');
    active = result.instance;
  }
  const refused = director.restart({
    instanceId: active.instanceId,
    capabilities: directorWorld().capabilities,
  });
  assert.equal(refused.status, 'REFUSED');
  if (refused.status !== 'REFUSED') return fail('Expected a refusal');
  assert.equal(refused.code, 'ATTEMPT_LIMIT');
});

test('232 a city reset cancels the live challenge without XP and keeps the counters', () => {
  const director = createDirectorFixture();
  const offer = offered(director);
  accepted(director, offer.instance.instanceId);
  const active = activated(director, offer.instance.instanceId);
  const result = director.reset({ reason: 'CITY_RESET' });
  assert.equal(result.activeInstanceId, null);
  const cancelled = director.instance(active.instance.instanceId)!;
  assert.equal(cancelled.state, 'CANCELLED');
  assert.equal(cancelled.outcome!.reason, 'CITY_RESET');
  assert.equal(cancelled.outcome!.xpDelta, 0);
  assert.equal(cancelled.outcome!.reward.rewardKey, null);
  assert.equal(director.stats().cancelled, 1);
  assert.equal(director.stats().completed, 0);
});

test('232 an invalid cancellation reason and an invalid state transition are refused', () => {
  const director = createDirectorFixture();
  const offer = offered(director);
  accepted(director, offer.instance.instanceId);
  assert.throws(
    () => director.cancel({ instanceId: offer.instance.instanceId, reason: 'NOT_A_REASON' }),
    /Unsupported enum value/,
  );
  const rejected = director.cancel({
    instanceId: offer.instance.instanceId,
    reason: 'PLAYER_CANCELLED',
  });
  assert.equal(rejected.status, 'CANCELLED');
  if (rejected.status !== 'CANCELLED') return fail('Expected a cancellation');
  assert.equal(rejected.outcome.reason, 'PLAYER_CANCELLED');
  const revived = director.activate({ instanceId: offer.instance.instanceId });
  assert.equal(revived.status, 'REFUSED');
  if (revived.status !== 'REFUSED') return fail('Expected a refusal');
  assert.equal(revived.code, 'INVALID_STATE');
  assert.equal(challengeCancellationReasons.includes('SESSION_LEFT'), true);
});

test('232 a small catalog falls back stably instead of rerandomising forever', () => {
  const director = createDirectorFixture();
  const offeredTemplates: string[] = [];
  for (let index = 0; index < 2; index += 1) {
    const offer = director.offer({ world: directorWorldAt(director, { lean: true }) });
    if (offer.status !== 'OFFERED') fail(`Expected an offer, got ${offer.code}`);
    offeredTemplates.push(offer.instance.templateId);
    declined(director, offer.instance.instanceId);
    cooldown(director);
  }
  assert.equal(new Set(offeredTemplates).size, 2, 'the two realisable templates are both offered');
  // With only two candidates the anti-repetition window falls back to all of them, stably.
  const third = director.offer({ world: directorWorldAt(director, { lean: true }) });
  assert.equal(third.status, 'OFFERED');
  if (third.status !== 'OFFERED') return fail('Expected the stable fallback offer');
  assert.equal(offeredTemplates.includes(third.instance.templateId), true);
  declined(director, third.instance.instanceId);
  cooldown(director);
  // Exhaust the per-template attempt cap: the walk then refuses explicitly instead of looping.
  for (let index = 0; index < 2 * CHALLENGE_DIRECTOR_LIMITS.attemptsPerTemplate - 3; index += 1) {
    const offer = director.offer({ world: directorWorldAt(director, { lean: true }) });
    if (offer.status !== 'OFFERED')
      fail(`Expected an offer at ${String(index)}, got ${offer.code}`);
    declined(director, offer.instance.instanceId);
    cooldown(director);
  }
  const exhausted = director.offer({ world: directorWorldAt(director, { lean: true }) });
  assert.equal(exhausted.status, 'REFUSED');
  if (exhausted.status !== 'REFUSED') return fail('Expected a refusal');
  assert.equal(exhausted.code, 'NO_ELIGIBLE_TEMPLATE');
  assert.equal(exhausted.detail.filter((entry) => entry.startsWith('ATTEMPT_LIMIT:')).length, 2);
});

test('232 the preflight refuses a transfer, another session and a fleet with no free taxi', () => {
  const transfer = createDirectorFixture();
  const duringTransfer = transfer.offer({
    world: directorWorldAt(transfer, { transferInProgress: true }),
  });
  assert.equal(duringTransfer.status, 'REFUSED');
  if (duringTransfer.status !== 'REFUSED') return fail('Expected a refusal');
  assert.equal(duringTransfer.code, 'SESSION_TRANSFER_IN_PROGRESS');

  const bound = createDirectorFixture();
  assert.equal(offered(bound).instance.sessionId, DIRECTOR_SESSION_ID);
  const otherSession = bound.offer({
    world: directorWorldAt(bound, { sessionId: 'session:other', worldEpoch: 2 }),
  });
  assert.equal(otherSession.status, 'REFUSED');
  if (otherSession.status !== 'REFUSED') return fail('Expected a refusal');
  assert.equal(otherSession.code, 'SESSION_INVALID');
  const otherKind = bound.offer({ world: directorWorldAt(bound, { sessionKind: 'CHAOS' }) });
  assert.equal(otherKind.status, 'REFUSED');

  const busy = createDirectorFixture();
  const noTaxi = busy.offer({
    world: directorWorldAt(busy, { taxiStatus: 'ASSIGNED', freeTaxis: 0 }),
  });
  assert.equal(noTaxi.status, 'REFUSED');
  if (noTaxi.status !== 'REFUSED') return fail('Expected a refusal');
  assert.equal(noTaxi.code, 'NO_FREE_TAXI');
  assert.deepEqual(noTaxi.detail, [`taxi:${DIRECTOR_TAXI_ID}:ASSIGNED`]);
});

test('232 an unreachable route or an infeasible deadline excludes every candidate', () => {
  const unreachable = createDirectorFixture({
    routes: directorRoutes({ reachable: false }),
  });
  const blocked = unreachable.offer({ world: directorWorldAt(unreachable) });
  assert.equal(blocked.status, 'REFUSED');
  if (blocked.status !== 'REFUSED') return fail('Expected a refusal');
  assert.equal(blocked.code, 'NO_ELIGIBLE_TEMPLATE');
  assert.equal(
    blocked.detail.some((entry) => entry.startsWith('ROUTE_UNREACHABLE:')),
    true,
  );

  const slow = createDirectorFixture({ routes: directorRoutes({ seconds: 900 }) });
  const infeasible = slow.offer({ world: directorWorldAt(slow) });
  assert.equal(infeasible.status, 'REFUSED');
  if (infeasible.status !== 'REFUSED') return fail('Expected a refusal');
  assert.equal(infeasible.code, 'NO_ELIGIBLE_TEMPLATE');
  assert.equal(
    infeasible.detail.some((entry) => entry.startsWith('DEADLINE_INFEASIBLE:')),
    true,
  );

  const narrow = createDirectorFixture({
    routes: directorRoutes({
      unreachableTemplateIds: [
        'challenge-influencer-no-spill',
        'challenge-cake-delivery',
        'challenge-city-copies-me',
      ],
    }),
  });
  const missingZone = narrow.offer({
    world: directorWorldAt(narrow, { reachableZoneIds: [] }),
  });
  assert.equal(missingZone.status, 'REFUSED');
  if (missingZone.status !== 'REFUSED') return fail('Expected a refusal');
  assert.equal(missingZone.code, 'NO_ELIGIBLE_TEMPLATE');
  assert.equal(
    missingZone.detail.some((entry) => entry.startsWith('ROUTE_UNREACHABLE:')),
    true,
  );
});

test('232 malformed documents are rejected instead of silently accepted', () => {
  const director = createDirectorFixture();
  assert.throws(
    () => director.offer({ world: { ...directorWorld(), extra: true } }),
    /Unknown challenge world field/,
  );
  assert.throws(() => director.offer({}), /Missing challenge offer request field: world/);
  const offer = offered(director);
  assert.throws(
    () =>
      director.accept({
        instanceId: offer.instance.instanceId,
        taxi: { taxiId: DIRECTOR_TAXI_ID, status: 'FLYING', freeTaxis: 3 },
        assignment: null,
        passengerAboard: false,
      }),
    /Unsupported enum value/,
  );
  assert.throws(
    () => director.decline({ instanceId: 'challenge:missing' }),
    /Unknown challenge instance/,
  );
  accepted(director, offer.instance.instanceId);
  activated(director, offer.instance.instanceId);
  assert.throws(
    () => director.evaluate({ instanceId: offer.instance.instanceId, facts: {} }),
    /Unknown challenge run facts field|Missing challenge run facts field/,
  );
});

test('232 a tampered snapshot is refused and leaves the director untouched', () => {
  const director = createDirectorFixture();
  const offer = offered(director);
  const snapshot = deepClone(director.snapshot()) as ChallengeDirectorSnapshot & {
    instances: Record<string, unknown>[];
  };
  (snapshot.instances[0] as Record<string, unknown>).seed = -1;
  const restored = director.restore(snapshot);
  assert.equal(restored.status, 'REFUSED');
  if (restored.status !== 'REFUSED') return fail('Expected a refusal');
  assert.equal(restored.code, 'SNAPSHOT_INVALID');
  assert.equal(director.instance(offer.instance.instanceId)!.state, 'OFFERED');

  const twoOffers = deepClone(director.snapshot()) as ChallengeDirectorSnapshot & {
    instances: unknown[];
  };
  twoOffers.instances.push(twoOffers.instances[0]);
  const duplicate = director.restore(twoOffers);
  assert.equal(duplicate.status, 'REFUSED');
});

test('232 the director never runs a world and never reads a clock', () => {
  const calls = { count: 0 };
  const director = createDirectorFixture({ routes: directorRoutes({ calls }) });
  const offer = offered(director);
  assert.equal(calls.count <= CHALLENGE_DIRECTOR_LIMITS.routeProbesPerOffer, true);
  assert.equal(calls.count >= 1, true);
  director.advance({ ticks: 600, paused: false });
  assert.equal(calls.count, 1, 'advancing never re-plans or probes a route');
  const stats = director.stats();
  assert.equal(stats.simulatedTick, 600);
  assert.equal(stats.activeOfferId, offer.instance.instanceId);
});

test('232 the world epoch is part of the saved identity', () => {
  const director = createDirectorFixture();
  const offer = offered(director);
  assert.equal(offer.instance.worldEpoch, DIRECTOR_WORLD_EPOCH);
  const reloaded = createChallengeDirector({
    seed: DIRECTOR_FIXTURE_SEED,
    routes: directorRoutes(),
  });
  assert.equal(reloaded.restore(deepClone(director.snapshot())).status, 'RESTORED');
  assert.equal(reloaded.instance(offer.instance.instanceId)!.worldEpoch, DIRECTOR_WORLD_EPOCH);
  const mismatch = reloaded.offer({
    world: directorWorldAt(reloaded, { worldEpoch: DIRECTOR_WORLD_EPOCH + 1 }),
  });
  assert.equal(mismatch.status, 'REFUSED');
  if (mismatch.status !== 'REFUSED') return fail('Expected a refusal');
  assert.equal(mismatch.code, 'SESSION_INVALID');
});

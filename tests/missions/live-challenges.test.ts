import assert from 'node:assert/strict';
import test from 'node:test';
import { CHALLENGE_DIRECTOR_LIMITS, createPlayerProgress } from '../../src/missions';
import {
  LIVE_CHALLENGES_LIMITS,
  LIVE_CHALLENGES_VERSION,
  LIVE_CHALLENGE_OBJECTIVE_SOURCES,
  createLiveChallengeZones,
} from '../../src/app';
import { projectChallengePanel } from '../../src/ui';
import {
  LIVE_FIXTURE_CALENDAR,
  LIVE_FIXTURE_ZONES,
  createLiveChallengeHarness,
  memoryLiveChallengeStorage,
} from './live-challenges-fixture';

/**
 * 277 live random challenges.
 *
 * These tests exercise the real 231 catalog/evaluators, the real 232 director and the real 233
 * experience over a fake authoritative frame and the real 213 ledger. The fixture never invents a
 * verdict: the only facts the live composition sees are the zone polygon containing the taxi and
 * its speed/heading.
 */

test('277 the live composition publishes its contract and the single-offer policy', () => {
  const harness = createLiveChallengeHarness();
  const read = harness.live.read();
  assert.equal(read.version, LIVE_CHALLENGES_VERSION);
  assert.equal(read.limits.autoOfferDelayTicks, 900);
  assert.equal(read.limits.evaluationIntervalTicks, 6);
  assert.equal(CHALLENGE_DIRECTOR_LIMITS.activeOffers, 1);
  assert.equal(CHALLENGE_DIRECTOR_LIMITS.activeInstances, 1);
  assert.equal(CHALLENGE_DIRECTOR_LIMITS.cooldownTicks, 10_800);
  assert.equal(LIVE_CHALLENGE_OBJECTIVE_SOURCES.CHECKPOINTS, 'LIVE');
  assert.equal(LIVE_CHALLENGE_OBJECTIVE_SOURCES.PARKING, 'LIVE');
  assert.equal(LIVE_CHALLENGE_OBJECTIVE_SOURCES.COMFORT, 'UNAVAILABLE');
  assert.equal(read.factSources.DISTRUCTION, 'UNAVAILABLE');
  assert.equal(read.profileWrites, 0);
  assert.equal(read.xpDebits, 0);
  assert.equal(read.learningJobs, 0);
  harness.dispose();
});

test('277 one visible offer, a free refusal and a real three-minute cooldown', () => {
  const harness = createLiveChallengeHarness();
  const instanceId = harness.offer('challenge-valet-with-style');
  assert.ok(instanceId !== null);
  const offered = harness.live.read();
  assert.equal(offered.offer?.instanceId, instanceId);
  assert.equal(offered.offer?.objectiveKind, 'PARKING');
  assert.equal(offered.counters.offers, 1);
  const second = harness.live.offerNow({ templateId: 'challenge-valet-with-style', seed: 999 });
  assert.equal(second, null);
  assert.equal(harness.live.read().lastOfferRefusal?.code, 'OFFER_ALREADY_ACTIVE');

  const declined = harness.live.decline();
  assert.equal(declined.status, 'DECLINED');
  const after = harness.live.read();
  assert.equal(after.offer, null);
  assert.equal(after.lastResult?.status, 'DECLINED');
  assert.equal(after.cooldownRemainingTicks, CHALLENGE_DIRECTOR_LIMITS.cooldownTicks);
  assert.equal(after.xpBalance, 0);
  assert.equal(after.ledgerEntries, 0);
  assert.equal(after.counters.declined, 1);
  const refused = harness.live.offerNow({ templateId: 'challenge-valet-with-style', seed: 277 });
  assert.equal(refused, null);
  assert.equal(harness.live.read().lastOfferRefusal?.code, 'COOLDOWN_ACTIVE');

  harness.step(CHALLENGE_DIRECTOR_LIMITS.cooldownTicks + 1);
  assert.equal(harness.live.read().cooldownRemainingTicks, 0);
  const next = harness.offer('challenge-valet-with-style');
  assert.ok(next !== null);
  assert.notEqual(next, instanceId);
  harness.dispose();
});

test('277 accepting reserves the taxi and refuses without moving an existing passenger', () => {
  const harness = createLiveChallengeHarness();
  const instanceId = harness.offer('challenge-valet-with-style');
  assert.ok(instanceId !== null);
  harness.setPassenger(true);
  const refused = harness.live.accept();
  assert.equal(refused.status, 'REFUSED');
  if (refused.status === 'REFUSED') assert.equal(refused.code, 'PASSENGER_ABOARD');
  assert.equal(harness.state.passengerAboard, true);
  assert.equal(harness.live.read().offer?.instanceId, instanceId);
  harness.live.step({ tick: 1 });
  assert.equal(harness.state.passengerAboard, true);

  harness.setPassenger(false);
  const accepted = harness.live.accept();
  assert.equal(accepted.status, 'ACCEPTED');
  if (accepted.status === 'ACCEPTED') {
    assert.equal(accepted.reservation.taxiId, harness.state.taxiId);
    assert.equal(accepted.reservation.dispatchSuspended, true);
    assert.equal(accepted.reservation.instanceId, instanceId);
    assert.equal(accepted.xpDelta, 0);
  }
  const read = harness.live.read();
  assert.equal(read.offer, null);
  assert.equal(read.active?.instanceId, instanceId);
  assert.equal(read.active?.taxiId, harness.state.taxiId);
  assert.equal(read.active?.progress, 0);
  assert.equal(read.xpBalance, 0);
  harness.dispose();
});

test('277 an infeasible offer is refused before it is displayed, naming the deadline', () => {
  const harness = createLiveChallengeHarness({ routeSeconds: 500 });
  const instance = harness.live.offerNow({
    templateId: 'challenge-valet-with-style',
    seed: 277,
  });
  assert.equal(instance, null);
  const read = harness.live.read();
  assert.equal(read.offer, null);
  assert.equal(read.lastOfferRefusal?.code, 'NO_ELIGIBLE_TEMPLATE');
  assert.ok(
    read.lastOfferRefusal?.detail.some((entry) => entry.startsWith('DEADLINE_INFEASIBLE:')),
    read.lastOfferRefusal?.detail.join(','),
  );
  harness.dispose();
});

test('277 templates without a live fact source are unavailable, not completed by HUD text', () => {
  const harness = createLiveChallengeHarness({ sessionKind: 'CHAOS' });
  const unavailable = harness.live.read().unavailableTemplates;
  const demolition = unavailable.find(
    (entry) => entry.templateId === 'challenge-influencer-demolition',
  );
  assert.ok(demolition !== undefined);
  assert.ok(demolition.reasons.includes('CAPABILITY:DESTRUCTIBLE_DECOR'));
  assert.ok(demolition.reasons.includes('FACT_SOURCE_UNAVAILABLE:DISTRUCTION'));
  const instance = harness.live.offerNow({
    templateId: 'challenge-influencer-demolition',
    seed: 277,
  });
  assert.equal(instance, null);
  const read = harness.live.read();
  assert.equal(read.offer, null);
  assert.equal(read.lastOfferRefusal?.code, 'NO_ELIGIBLE_TEMPLATE');
  assert.ok(
    read.lastOfferRefusal?.detail.includes('CAPABILITY:DESTRUCTIBLE_DECOR'),
    read.lastOfferRefusal?.detail.join(','),
  );

  const comfort = harness.live.offerNow({
    templateId: 'challenge-influencer-no-spill',
    seed: 277,
  });
  assert.equal(comfort, null);
  assert.ok(
    harness.live
      .read()
      .lastOfferRefusal?.detail.includes('TEMPLATE_UNAVAILABLE:challenge-influencer-no-spill'),
  );
  harness.dispose();
});

test('277 a real parking stop completes from live facts, pays once and records the attempt', () => {
  const harness = createLiveChallengeHarness();
  const read = harness.completeParking();
  assert.equal(read.lastResult?.status, 'COMPLETED');
  assert.equal(read.offer, null);
  assert.equal(read.lastResult?.progress, 1);
  assert.equal(read.lastResult?.target, 1);
  assert.equal(read.lastResult?.recordComparison, 'FIRST_RECORD');
  assert.equal(read.lastResult?.creditedXp, 80);
  assert.equal(read.xpBalance, 80);
  assert.equal(read.ledgerEntries, 1);
  assert.equal(read.records, 1);
  assert.equal(read.counters.completed, 1);
  assert.ok(read.cooldownRemainingTicks > 0);
  assert.ok(read.cooldownRemainingTicks <= CHALLENGE_DIRECTOR_LIMITS.cooldownTicks);
  assert.equal(read.profileWrites, 0);
  assert.equal(read.xpDebits, 0);
  assert.equal(harness.ledger.read().entries.length, 1);
  assert.equal(harness.ledger.read().xpBalance, 80);

  const firstPanel = harness.live.panelSnapshot();
  const secondPanel = harness.live.panelSnapshot();
  assert.ok(firstPanel !== null && secondPanel !== null);
  const view = projectChallengePanel(firstPanel);
  assert.equal(view.result?.status, 'COMPLETED');
  assert.equal(view.result?.xpLabel, '80 XP creditați');
  assert.equal(view.records.length, 1);
  assert.equal(view.counts.creditedXp, 80);
  const retry = view.actions.find((entry) => entry.action === 'RETRY');
  assert.equal(retry?.enabled, false);
  assert.equal(harness.live.retry().status, 'REFUSED');
  assert.equal(harness.live.retry().code, 'NOT_FAILED');
  assert.equal(harness.ledger.read().entries.length, 1);
  harness.dispose();
});

test('277 a checkpoint objective is judged from real zone crossings in order', () => {
  const harness = createLiveChallengeHarness();
  const instanceId = harness.offer('challenge-influencer-single-frame', 277);
  assert.ok(instanceId !== null);
  const instance = harness.live.read().offer;
  assert.ok(instance !== null);
  assert.equal(instance.objectiveKind, 'CHECKPOINTS');
  const active = harness.live.accept();
  assert.equal(active.status, 'ACCEPTED');
  const objective = harness.live
    .checkpoint()
    .director.instances.find((entry) => entry.instanceId === instanceId)!.objective;
  harness.moveTo(1_000, 1_000);
  harness.step(1);
  for (const zoneId of objective.zoneIds.slice(0, objective.target)) {
    harness.moveToZone(zoneId);
    harness.step(1);
    harness.moveTo(1_000, 1_000);
    harness.step(1);
  }
  harness.step(12);
  const read = harness.live.read();
  assert.equal(read.lastResult?.status, 'COMPLETED');
  assert.ok((read.lastResult?.progress ?? 0) >= objective.target);
  assert.equal(read.xpBalance, 90);
  assert.equal(read.records, 1);
  harness.dispose();
});

test('277 a pause freezes the offer window and the objective deadline', () => {
  const harness = createLiveChallengeHarness();
  const instanceId = harness.offer('challenge-valet-with-style');
  assert.ok(instanceId !== null);
  const before = harness.live.read();
  harness.live.step({ tick: 10_000, paused: true });
  const paused = harness.live.read();
  assert.equal(paused.tick, before.tick);
  assert.equal(paused.offer?.instanceId, instanceId);
  const accepted = harness.live.accept();
  assert.equal(accepted.status, 'ACCEPTED');
  const activeBefore = harness.live.read().active!;
  harness.live.step({ tick: 20_000, paused: true });
  const activeAfter = harness.live.read().active!;
  assert.equal(activeAfter.remainingTicks, activeBefore.remainingTicks);
  harness.dispose();
});

test('277 turning offers off retracts the visible offer and leaves the balance alone', () => {
  const harness = createLiveChallengeHarness();
  assert.ok(harness.offer('challenge-valet-with-style') !== null);
  const read = harness.live.setOffersEnabled(false);
  assert.equal(read.offersEnabled, false);
  assert.equal(read.offer, null);
  assert.equal(read.lastResult?.status, 'EXPIRED');
  assert.equal(read.xpBalance, 0);
  assert.equal(harness.live.accept().status, 'REFUSED');
  harness.dispose();
});

test('277 the session checkpoint restores the same record and does not pay twice', () => {
  const storage = memoryLiveChallengeStorage();
  const ledger = createPlayerProgress({ playerId: 'player:277' });
  const first = createLiveChallengeHarness({ storage, ledger });
  const completed = first.completeParking();
  assert.equal(completed.lastResult?.creditedXp, 80);
  assert.equal(completed.xpBalance, 80);
  const saved = first.live.checkpoint();
  assert.equal(saved.version, '277-live-challenges-checkpoint-v1');
  assert.equal(saved.experience.version, '233-challenge-experience-state-v1');
  first.dispose();

  const second = createLiveChallengeHarness({ storage, ledger });
  const restored = second.live.read();
  assert.equal(restored.restored, true);
  assert.equal(restored.persistenceError, null);
  assert.equal(restored.records, 1);
  assert.equal(restored.xpBalance, 80);
  assert.equal(restored.ledgerEntries, 1);
  assert.equal(restored.lastResult?.creditedXp, 80);
  assert.equal(second.live.panelSnapshot()?.result?.xpCredited, 80);
  assert.equal(second.ledger.read().entries.length, 1);
  second.dispose();
});

test('277 Haos completes for a local record only, with no Academy XP', () => {
  const harness = createLiveChallengeHarness({ sessionKind: 'CHAOS' });
  const read = harness.completeParking();
  assert.equal(read.lastResult?.status, 'COMPLETED');
  assert.equal(read.lastResult?.sessionKind, 'CHAOS');
  assert.equal(read.lastResult?.creditedXp, 0);
  assert.equal(read.lastResult?.recordComparison, 'FIRST_RECORD');
  assert.equal(read.xpBalance, 0);
  assert.equal(read.ledgerEntries, 0);
  assert.equal(read.records, 1);
  assert.equal(harness.ledger.read().entries.length, 0);
  const panel = harness.live.panelSnapshot();
  assert.ok(panel !== null);
  const view = projectChallengePanel(panel);
  assert.match(view.result?.xpLabel ?? '', /Record personal/);
  assert.match(view.result?.rewardLabel ?? '', /Scor local/);
  harness.dispose();
});

test('277 the real catalog gives every mapped service zone one live role', () => {
  const zones = LIVE_FIXTURE_ZONES;
  assert.equal(zones.length, 16);
  assert.equal(new Set(zones.map((entry) => entry.zoneId)).size, zones.length);
  for (const kind of [
    'PARKING',
    'CHECKPOINT',
    'TOILET',
    'LANDMARK',
    'DRIFT_PAD',
    'DEMOLITION_ALLEY',
  ] as const)
    assert.ok(
      zones.some((entry) => entry.kind === kind),
      kind,
    );
  assert.equal(typeof createLiveChallengeZones, 'function');
  assert.equal(LIVE_CHALLENGES_LIMITS.zoneVisits, 64);
  assert.equal(LIVE_CHALLENGES_LIMITS.driftSamples, 4_000);
  assert.equal(LIVE_FIXTURE_CALENDAR.dayLengthSeconds, 86_400);
});

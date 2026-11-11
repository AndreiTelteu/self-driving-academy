import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RECOVERY_WITH_PASSENGER,
  WORLD_RECOVERY_VERSION,
  WORLD_RESET_REASON,
  computeRecoveryCheckpointChecksum,
  createMemoryRecoveryCheckpointStore,
  worldRecoveryCodes,
  worldRecoveryOperations,
} from '../../src/persistence/index';
import type { RecoveryResetCheckpoint } from '../../src/persistence/index';
import { verifyProfileVersionChecksum, computeProfileVersionChecksum } from '../../src/profiles';
import {
  BASELINE_JOBS,
  BASELINE_LISTENERS,
  BASELINE_TRAFFIC,
  BASELINE_VEHICLES,
  RECOVERY_FIXED_NOW,
  RECOVERY_POINT_ID,
  createWorldRecoveryFixture,
  recoveryChallenge,
  recoveryRide,
} from './world-recovery-fixture';

const baselineOccupancy = Object.freeze({
  vehicles: BASELINE_VEHICLES,
  trafficVehicles: BASELINE_TRAFFIC,
  bodies: BASELINE_VEHICLES + BASELINE_TRAFFIC,
  listeners: BASELINE_LISTENERS,
  jobs: BASELINE_JOBS,
});

test('226 exposes three distinct operations and a closed refusal vocabulary', () => {
  assert.deepEqual(
    [...worldRecoveryOperations],
    ['VEHICLE_RECOVERY', 'CITY_RESET', 'STYLE_RESTORE'],
  );
  assert.equal(RECOVERY_WITH_PASSENGER, 'RECOVERED_WITH_PASSENGER');
  assert.equal(WORLD_RESET_REASON, 'SCENARIO_RESET');
  assert.equal(WORLD_RECOVERY_VERSION, '226-world-recovery-v1');
  for (const code of ['COLLIDER_PRESENT', 'XP_WITHDRAWN', 'PLAN_STALE', 'FAULT']) {
    assert.ok(worldRecoveryCodes.includes(code as never), `Missing closed code ${code}`);
  }
});

test('226 R restores mobility at the validated collider-free point and keeps XP, epochs and style', () => {
  const fixture = createWorldRecoveryFixture();
  const ledgersBefore = fixture.economy.snapshot();
  const profileBefore = fixture.profile.active();
  const startsBefore = fixture.world.starts;

  const result = fixture.module.recoverVehicle({ tick: 10, origin: 'R' });
  assert.equal(result.status, 'RECOVERED');
  if (result.status !== 'RECOVERED') return;

  assert.equal(result.pointId, RECOVERY_POINT_ID);
  assert.equal(result.colliderCount, 0);
  assert.equal(result.mobilityRestored, true);
  assert.equal(result.ticksToMobility, 0);
  assert.equal(result.stages, 5);
  assert.equal(result.record.placement?.status, 'SAFE');
  assert.equal(result.record.placement?.colliderCount, 0);
  assert.equal(result.record.placement?.after?.velocityMps.z, 3);
  assert.equal(result.closedActivities.length, 0);

  assert.equal(result.xpBeforeMicroXp, ledgersBefore.xpMicroXp);
  assert.equal(result.xpAfterMicroXp, ledgersBefore.xpMicroXp);
  assert.equal(result.xpDeltaMicroXp, 0);
  assert.ok(result.xpAfterMicroXp > 0, 'The real 213 ledger must carry a real balance');

  const status = fixture.module.status();
  assert.deepEqual(status.epochs, { worldEpoch: 1, learningEpoch: 0, economyEpoch: 1 });
  assert.equal(result.worldEpoch, 1);
  assert.equal(result.learningEpoch, 0);
  assert.equal(result.economyEpoch, 1);

  assert.equal(fixture.profile.active().checksum, profileBefore.checksum);
  assert.equal(fixture.world.starts, startsBefore);
  assert.equal(fixture.checkpoints.commits, 0);
  assert.deepEqual(fixture.economy.seriesHistory, [1]);
  assert.equal(fixture.replay.facts.length, 0);
  assert.equal(fixture.scene.history().length, 0);
});

test('226 R refuses without a validated collider-free point instead of using “where it was”', () => {
  const unavailable = createWorldRecoveryFixture({ recovery: { colliderFree: false } });
  const refused = unavailable.module.recoverVehicle({ tick: 10, origin: 'R' });
  assert.equal(refused.status, 'REJECTED');
  if (refused.status === 'REJECTED') assert.equal(refused.rejection.code, 'NO_SAFE_POINT');
  assert.equal(unavailable.recovery.requests, 0);
  assert.equal(unavailable.recovery.commits, 0);
  assert.equal(unavailable.module.status().recoveriesRetained, 0);

  const blocked = createWorldRecoveryFixture({ recovery: { colliders: 1 } });
  const collider = blocked.module.recoverVehicle({ tick: 10, origin: 'HUD' });
  assert.equal(collider.status, 'REJECTED');
  if (collider.status === 'REJECTED') assert.equal(collider.rejection.code, 'RECOVERY_NOT_SAFE');
  assert.equal(blocked.module.status().recoveriesRetained, 0);

  const inconsistent = createWorldRecoveryFixture({ recovery: { colliders: 1, claimSafe: true } });
  const defended = inconsistent.module.recoverVehicle({ tick: 10, origin: 'R' });
  assert.equal(defended.status, 'REJECTED');
  if (defended.status === 'REJECTED') assert.equal(defended.rejection.code, 'COLLIDER_PRESENT');
  assert.equal(inconsistent.module.status().recoveriesRetained, 0);

  const noMobility = createWorldRecoveryFixture({ recovery: { withoutAfter: true } });
  const missing = noMobility.module.recoverVehicle({ tick: 10, origin: 'R' });
  assert.equal(missing.status, 'REJECTED');
  if (missing.status === 'REJECTED') assert.equal(missing.rejection.code, 'MOBILITY_NOT_RESTORED');

  const noPoint = createWorldRecoveryFixture({ recovery: { commitAnswer: 'NO_VALID_POINT' } });
  const empty = noPoint.module.recoverVehicle({ tick: 10, origin: 'R' });
  assert.equal(empty.status, 'REJECTED');
  if (empty.status === 'REJECTED') assert.equal(empty.rejection.code, 'NO_SAFE_POINT');
});

test('226 R with a passenger produces exactly one FAILED closure that stays in history', () => {
  const fixture = createWorldRecoveryFixture({ activities: [recoveryRide(true)] });
  const xpBefore = fixture.xp.read().xpBalanceMicroXp;

  const first = fixture.module.recoverVehicle({ tick: 10, origin: 'R' });
  assert.equal(first.status, 'RECOVERED');
  if (first.status !== 'RECOVERED') return;
  assert.equal(first.closedActivities.length, 1);
  assert.equal(first.closedActivities[0]!.reason, RECOVERY_WITH_PASSENGER);
  assert.equal(first.closedActivities[0]!.revenue, 0);
  assert.equal(first.closedActivities[0]!.terminal, true);
  assert.equal(fixture.scene.active().length, 0);
  assert.equal(fixture.scene.history().length, 1);

  const second = fixture.module.recoverVehicle({ tick: 11, origin: 'R' });
  assert.equal(second.status, 'RECOVERED');
  if (second.status !== 'RECOVERED') return;
  assert.equal(second.closedActivities.length, 0, 'A terminal ride cannot be closed twice');
  assert.equal(fixture.scene.history().length, 1);
  assert.equal(
    fixture.scene.history().filter((entry) => entry.reason === RECOVERY_WITH_PASSENGER).length,
    1,
  );
  assert.equal(fixture.xp.read().xpBalanceMicroXp, xpBefore);
  assert.equal(fixture.xp.read().debits, 0);
});

test('226 R in Haos keeps the recovered challenge immediately retryable', () => {
  const fixture = createWorldRecoveryFixture({
    sessionKind: 'CHAOS',
    activities: [recoveryChallenge(true)],
  });
  const result = fixture.module.recoverVehicle({ tick: 10, origin: 'R' });
  assert.equal(result.status, 'RECOVERED');
  if (result.status !== 'RECOVERED') return;
  assert.equal(result.closedActivities.length, 1);
  assert.equal(result.closedActivities[0]!.kind, 'CHALLENGE');
  assert.equal(result.retries.length, 1);
  assert.equal(result.retries[0]!.status, 'AVAILABLE');
  assert.equal(result.retries[0]!.availableAtTick, 10);
  assert.equal(result.retries[0]!.ticksWaited, 0);
  assert.deepEqual([...result.retries[0]!.blockers], []);

  const academy = createWorldRecoveryFixture({ activities: [recoveryChallenge(true)] });
  const academyResult = academy.module.recoverVehicle({ tick: 10, origin: 'R' });
  assert.equal(academyResult.status, 'RECOVERED');
  if (academyResult.status !== 'RECOVERED') return;
  assert.equal(academyResult.retries.length, 0, 'Only Haos declares the retry contract');
});

test('226 R performs no world, checkpoint, economy or style work of its own', () => {
  const fixture = createWorldRecoveryFixture({
    activities: [recoveryRide(true), recoveryChallenge()],
  });
  const before = {
    starts: fixture.world.starts,
    stops: fixture.world.stops,
    closes: fixture.world.closes,
    invalidations: fixture.world.invalidations,
    releases: fixture.world.releases,
    profile: fixture.profile.active().checksum,
    checkpointCommits: fixture.checkpoints.commits,
    series: fixture.economy.seriesHistory.length,
  };
  const result = fixture.module.recoverVehicle({ tick: 10, origin: 'R' });
  assert.equal(result.status, 'RECOVERED');

  assert.equal(fixture.world.starts, before.starts);
  assert.equal(fixture.world.stops, before.stops);
  assert.equal(fixture.world.closes, before.closes);
  assert.equal(fixture.world.invalidations, before.invalidations);
  assert.equal(fixture.world.releases, before.releases);
  assert.equal(fixture.profile.active().checksum, before.profile);
  assert.equal(fixture.checkpoints.commits, before.checkpointCommits);
  assert.equal(fixture.economy.seriesHistory.length, before.series);
  assert.equal(fixture.profile.activations, 0);
  // The challenge has no passenger, so R leaves it active.
  assert.equal(fixture.scene.active().length, 1);
});

test('226 city reset closes activities once, advances the three epochs and rebuilds traffic', () => {
  const fixture = createWorldRecoveryFixture({
    activities: [recoveryRide(true), recoveryChallenge()],
  });
  const ledgersBefore = fixture.economy.snapshot();
  const profileBefore = fixture.profile.active();
  const missionsBefore = fixture.tracker.snapshot();
  const rewardsBefore = fixture.rewards.rewards();

  const prepared = fixture.module.beginCityReset({ tick: 20 });
  assert.equal(prepared.status, 'PREPARED');
  if (prepared.status !== 'PREPARED') return;
  assert.deepEqual([...prepared.plan.activeActivities], ['challenge-1', 'ride-1']);
  assert.equal(fixture.scene.history().length, 0, 'Prepare must not close anything');
  assert.equal(fixture.checkpoints.commits, 0);
  assert.deepEqual(fixture.module.status().epochs, {
    worldEpoch: 1,
    learningEpoch: 0,
    economyEpoch: 1,
  });

  const committed = fixture.module.commitCityReset();
  assert.equal(committed.status, 'RESET');
  if (committed.status !== 'RESET') return;

  assert.deepEqual(committed.epochs, { worldEpoch: 2, learningEpoch: 1, economyEpoch: 2 });
  assert.deepEqual(committed.previous, { worldEpoch: 1, learningEpoch: 0, economyEpoch: 1 });
  assert.equal(committed.closedActivities.length, 2);
  assert.deepEqual(
    committed.closedActivities.map((entry) => entry.reason),
    [WORLD_RESET_REASON, WORLD_RESET_REASON],
  );
  assert.deepEqual(
    committed.closedActivities.map((entry) => entry.revenue),
    [0, 0],
  );
  assert.equal(committed.duplicateClosures, 0);
  assert.equal(committed.closedSegments, 1);
  assert.equal(committed.invalidatedJobs, BASELINE_JOBS);
  assert.equal(committed.releasedInputs, 2);
  assert.equal(committed.launch, 'PAUSED_AUTO');
  assert.deepEqual(committed.occupancy, baselineOccupancy);
  assert.equal(fixture.world.liveWorlds, 1);

  assert.deepEqual(committed.economySeries, {
    previousEpoch: 1,
    epoch: 2,
    seriesId: 'economy-series:2',
    history: 2,
  });
  assert.deepEqual(fixture.economy.seriesHistory, [1, 2]);

  assert.equal(committed.replay.discontinuity, true);
  assert.equal(committed.replay.finalizeReason, 'WORLD_RESET');
  assert.equal(fixture.replay.stats().discontinuities, 1);

  assert.equal(committed.profile.profileId, profileBefore.profileId);
  assert.equal(committed.profile.versionId, profileBefore.versionId);
  assert.equal(committed.profile.checksum, profileBefore.checksum);
  assert.deepEqual(committed.preserved, {
    profile: true,
    evidence: true,
    xp: true,
    daily: true,
    rewards: true,
    missions: true,
    economyHistory: true,
  });
  assert.equal(committed.missionCompletions, 0);
  assert.equal(committed.rewardGrants, 0);

  const ledgersAfter = fixture.economy.snapshot();
  assert.equal(ledgersAfter.xpMicroXp, ledgersBefore.xpMicroXp);
  assert.equal(ledgersAfter.daily, ledgersBefore.daily);
  assert.equal(ledgersAfter.rewards, ledgersBefore.rewards);
  assert.equal(ledgersAfter.missions, ledgersBefore.missions);
  assert.equal(ledgersAfter.evidence, ledgersBefore.evidence);
  assert.deepEqual(fixture.tracker.snapshot(), missionsBefore);
  assert.deepEqual(fixture.rewards.rewards(), rewardsBefore);
  assert.equal(committed.xpMicroXp, ledgersBefore.xpMicroXp);

  assert.equal(fixture.checkpoints.rows.length, 1);
  assert.equal(fixture.checkpoints.latest()?.checkpointId, prepared.plan.checkpointId);
  assert.equal(fixture.checkpoints.latest()?.checksum, prepared.plan.checkpointChecksum);
  assert.equal(committed.previousCheckpointId, null);
});

test('226 twenty city resets never duplicate progress, bodies, listeners or closures', () => {
  const fixture = createWorldRecoveryFixture({ activities: [recoveryRide(false)] });
  const ledgersBefore = fixture.economy.snapshot();
  const profileBefore = fixture.profile.active();

  for (let index = 0; index < 20; index += 1) {
    const prepared = fixture.module.beginCityReset({ tick: 100 + index });
    assert.equal(prepared.status, 'PREPARED');
    if (prepared.status !== 'PREPARED') return;
    const committed = fixture.module.commitCityReset();
    assert.equal(committed.status, 'RESET');
    if (committed.status !== 'RESET') return;
    assert.deepEqual(committed.occupancy, baselineOccupancy);
    assert.equal(committed.missionCompletions, 0);
    assert.equal(committed.rewardGrants, 0);
  }

  const status = fixture.module.status();
  assert.deepEqual(status.epochs, { worldEpoch: 21, learningEpoch: 20, economyEpoch: 21 });
  assert.equal(status.resetsRetained, 20);
  assert.equal(status.failedResets, 0);
  assert.equal(fixture.world.liveWorlds, 1);
  assert.equal(fixture.world.starts, 21);
  assert.equal(fixture.scene.history().length, 1, 'Only the first reset had an active ride');
  assert.equal(fixture.replay.facts.length, 20);
  assert.equal(fixture.checkpoints.rows.length, 20);
  assert.equal(fixture.economy.seriesHistory.length, 21);
  assert.equal(fixture.module.readHistory('CITY_RESET').length, 20);

  const ledgersAfter = fixture.economy.snapshot();
  assert.equal(ledgersAfter.xpMicroXp, ledgersBefore.xpMicroXp);
  assert.equal(ledgersAfter.daily, ledgersBefore.daily);
  assert.equal(ledgersAfter.rewards, ledgersBefore.rewards);
  assert.equal(ledgersAfter.missions, ledgersBefore.missions);
  assert.equal(fixture.profile.active().checksum, profileBefore.checksum);
  assert.equal(fixture.xp.read().debits, 0);
});

test('226 a failed commit keeps the previous checkpoint and the untouched world, and a retry commits once', () => {
  const fixture = createWorldRecoveryFixture({
    activities: [recoveryRide(true)],
    failCheckpointCommits: 1,
  });
  const prepared = fixture.module.beginCityReset({ tick: 20 });
  assert.equal(prepared.status, 'PREPARED');

  const refused = fixture.module.commitCityReset();
  assert.equal(refused.status, 'REJECTED');
  if (refused.status === 'REJECTED')
    assert.equal(refused.rejection.code, 'CHECKPOINT_COMMIT_FAILED');
  assert.equal(fixture.checkpoints.latest(), null, 'No reset checkpoint was written');
  assert.equal(fixture.checkpoints.rows.length, 0);
  assert.deepEqual(fixture.module.status().epochs, {
    worldEpoch: 1,
    learningEpoch: 0,
    economyEpoch: 1,
  });
  assert.equal(fixture.scene.history().length, 0);
  assert.equal(fixture.economy.seriesHistory.length, 1);
  assert.equal(fixture.world.starts, 1);
  assert.equal(fixture.world.liveWorlds, 1);
  assert.equal(fixture.world.invalidations, 0);
  assert.equal(fixture.module.status().failedResets, 1);

  const retried = fixture.module.commitCityReset();
  assert.equal(retried.status, 'RESET');
  if (retried.status !== 'RESET') return;
  assert.deepEqual(retried.epochs, { worldEpoch: 2, learningEpoch: 1, economyEpoch: 2 });
  assert.equal(fixture.checkpoints.rows.length, 1);
  assert.equal(fixture.scene.history().length, 1);
  assert.equal(fixture.economy.seriesHistory.length, 2);
  assert.equal(fixture.module.status().failedResets, 1);
});

test('226 a prepare refuses an invalid active profile without changing anything', () => {
  const fixture = createWorldRecoveryFixture({ activities: [recoveryRide(true)] });
  const valid = fixture.profile.active();
  fixture.profile.setActive({
    ...valid,
    checksum: `fnv1a64:${'0'.repeat(16)}`,
  });
  const prepared = fixture.module.beginCityReset({ tick: 20 });
  assert.equal(prepared.status, 'REJECTED');
  if (prepared.status === 'REJECTED') assert.equal(prepared.rejection.code, 'PROFILE_INVALID');
  assert.equal(fixture.module.status().prepared, null);
  assert.deepEqual(fixture.module.status().epochs, {
    worldEpoch: 1,
    learningEpoch: 0,
    economyEpoch: 1,
  });
  assert.equal(fixture.scene.history().length, 0);
  assert.equal(fixture.checkpoints.commits, 0);
});

test('226 a reset prepared against a changed activity set refuses instead of acting on stale facts', () => {
  const fixture = createWorldRecoveryFixture();
  const prepared = fixture.module.beginCityReset({ tick: 20 });
  assert.equal(prepared.status, 'PREPARED');
  fixture.scene.add(recoveryChallenge(true));

  const stale = fixture.module.commitCityReset();
  assert.equal(stale.status, 'REJECTED');
  if (stale.status === 'REJECTED') assert.equal(stale.rejection.code, 'PLAN_STALE');
  assert.equal(fixture.scene.history().length, 0);
  assert.deepEqual(fixture.module.status().epochs, {
    worldEpoch: 1,
    learningEpoch: 0,
    economyEpoch: 1,
  });

  fixture.scene.remove('challenge-1');
  const committed = fixture.module.commitCityReset();
  assert.equal(committed.status, 'RESET');
  if (committed.status !== 'RESET') return;
  assert.deepEqual(committed.epochs, { worldEpoch: 2, learningEpoch: 1, economyEpoch: 2 });
});

test('226 a partial reset resumes by stage without duplicating the checkpoint or the series', () => {
  const fixture = createWorldRecoveryFixture({ activities: [recoveryRide(true)] });
  const prepared = fixture.module.beginCityReset({ tick: 20 });
  assert.equal(prepared.status, 'PREPARED');
  fixture.world.failNextStart = true;

  const partial = fixture.module.commitCityReset();
  assert.equal(partial.status, 'PARTIAL');
  if (partial.status === 'PARTIAL') assert.equal(partial.stage, 'WORLD_REBUILD');
  assert.notEqual(fixture.module.status().fault, null);
  const blocked = fixture.module.recoverVehicle({ tick: 21, origin: 'R' });
  assert.equal(blocked.status, 'REJECTED');
  if (blocked.status === 'REJECTED') assert.equal(blocked.rejection.code, 'FAULT');

  const resumed = fixture.module.commitCityReset();
  assert.equal(resumed.status, 'RESET');
  if (resumed.status !== 'RESET') return;
  assert.deepEqual(resumed.epochs, { worldEpoch: 2, learningEpoch: 1, economyEpoch: 2 });
  assert.equal(fixture.checkpoints.rows.length, 1);
  assert.equal(fixture.scene.history().length, 1);
  assert.equal(fixture.economy.seriesHistory.length, 2);
  assert.equal(resumed.duplicateClosures, 0);
  assert.equal(fixture.module.status().fault, null);
});

test('226 style restoration activates the version behind the learningEpoch barrier and moves nothing else', () => {
  const fixture = createWorldRecoveryFixture({ activities: [recoveryRide(true)] });
  const ledgersBefore = fixture.economy.snapshot();
  const profileBefore = fixture.profile.active();
  const startsBefore = fixture.world.starts;
  const occupancyBefore = fixture.world.occupancy({
    sessionKind: fixture.sessionKind,
    sessionId: fixture.sessionId,
    worldEpoch: 1,
    learningEpoch: 0,
  });

  const restored = fixture.module.restoreStyle({ tick: 30, versionId: 'profile-1@2' });
  assert.equal(restored.status, 'RESTORED');
  if (restored.status !== 'RESTORED') return;

  assert.equal(restored.profile.versionId, 'profile-1@2');
  assert.equal(restored.profile.previousVersionId, profileBefore.versionId);
  assert.equal(restored.profile.previousChecksum, profileBefore.checksum);
  assert.equal(verifyProfileVersionChecksum(fixture.profile.active()), true);
  assert.equal(restored.profile.checksum, fixture.profile.active().checksum);
  assert.equal(restored.barrier, 'LEARNING_EPOCH');
  assert.deepEqual(restored.learningEpoch, { previous: 0, next: 1 });
  assert.equal(restored.worldEpoch, 1);
  assert.equal(restored.economyEpoch, 1);
  assert.equal(restored.closedSegments, 1);
  assert.equal(restored.staleResults, 2);
  assert.equal(restored.worldUntouched, true);
  assert.deepEqual(restored.preserved, {
    xp: true,
    daily: true,
    rewards: true,
    missions: true,
    economyHistory: true,
    world: true,
  });
  assert.equal(restored.xpMicroXp, ledgersBefore.xpMicroXp);

  assert.equal(fixture.world.starts, startsBefore);
  assert.deepEqual(
    fixture.world.occupancy({
      sessionKind: fixture.sessionKind,
      sessionId: fixture.sessionId,
      worldEpoch: 1,
      learningEpoch: 1,
    }),
    occupancyBefore,
  );
  assert.equal(fixture.scene.history().length, 0);
  assert.equal(fixture.checkpoints.commits, 0);
  assert.equal(fixture.replay.facts.length, 0);
  assert.deepEqual(fixture.economy.seriesHistory, [1]);
  assert.equal(fixture.economy.snapshot().missions, ledgersBefore.missions);

  const again = fixture.module.restoreStyle({ tick: 31, versionId: 'profile-1@2' });
  assert.equal(again.status, 'REJECTED');
  if (again.status === 'REJECTED') assert.equal(again.rejection.code, 'ALREADY_ACTIVE');
  assert.equal(fixture.profile.activations, 1, 'No second barrier for an active version');
});

test('226 style restoration maps the barrier refusals into the closed vocabulary', () => {
  const unknown = createWorldRecoveryFixture();
  const missing = unknown.module.restoreStyle({ tick: 30, versionId: 'profile-1@9' });
  assert.equal(missing.status, 'REJECTED');
  if (missing.status === 'REJECTED') assert.equal(missing.rejection.code, 'VERSION_NOT_FOUND');
  assert.equal(unknown.profile.active().versionId, 'profile-1@1');

  const stale = createWorldRecoveryFixture();
  stale.profile.setExpectedLearningEpoch(5);
  const staleResult = stale.module.restoreStyle({ tick: 30, versionId: 'profile-1@2' });
  assert.equal(staleResult.status, 'REJECTED');
  if (staleResult.status === 'REJECTED')
    assert.equal(staleResult.rejection.code, 'STALE_LEARNING_EPOCH');
  assert.equal(stale.module.status().epochs.learningEpoch, 0);

  const barrier = createWorldRecoveryFixture();
  barrier.profile.setRefusal('BARRIER_REJECTED');
  const refused = barrier.module.restoreStyle({ tick: 30, versionId: 'profile-1@2' });
  assert.equal(refused.status, 'REJECTED');
  if (refused.status === 'REJECTED') assert.equal(refused.rejection.code, 'BARRIER_REJECTED');
  assert.equal(barrier.profile.active().versionId, 'profile-1@1');
  assert.equal(barrier.profile.activations, 0);
});

test('226 the three operations never borrow each other’s effects', () => {
  const fixture = createWorldRecoveryFixture({ activities: [recoveryRide(true)] });
  const profileBefore = fixture.profile.active();
  const requestsBefore = fixture.recovery.requests;

  const recovered = fixture.module.recoverVehicle({ tick: 10, origin: 'R' });
  assert.equal(recovered.status, 'RECOVERED');
  let status = fixture.module.status();
  assert.deepEqual(status.epochs, { worldEpoch: 1, learningEpoch: 0, economyEpoch: 1 });
  assert.equal(fixture.checkpoints.commits, 0);
  assert.equal(fixture.economy.seriesHistory.length, 1);

  const prepared = fixture.module.beginCityReset({ tick: 20 });
  assert.equal(prepared.status, 'PREPARED');
  const reset = fixture.module.commitCityReset();
  assert.equal(reset.status, 'RESET');
  if (reset.status !== 'RESET') return;
  status = fixture.module.status();
  assert.deepEqual(status.epochs, { worldEpoch: 2, learningEpoch: 1, economyEpoch: 2 });
  assert.equal(fixture.recovery.requests, requestsBefore + 1, 'The reset never drives 030');
  assert.equal(fixture.profile.active().checksum, profileBefore.checksum);
  assert.equal(fixture.profile.activations, 0, 'The reset never restores a style');

  const restored = fixture.module.restoreStyle({ tick: 30, versionId: 'profile-1@2' });
  assert.equal(restored.status, 'RESTORED');
  if (restored.status !== 'RESTORED') return;
  status = fixture.module.status();
  assert.deepEqual(status.epochs, { worldEpoch: 2, learningEpoch: 2, economyEpoch: 2 });
  assert.equal(fixture.world.starts, 2, 'Only the reset rebuilt the world');
  assert.equal(fixture.scene.history().length, 1, 'The style restore closed no ride');
  assert.equal(fixture.checkpoints.rows.length, 1, 'The style restore wrote no checkpoint');
  assert.equal(fixture.replay.facts.length, 1, 'The style restore marked no discontinuity');
});

test('226 the checkpoint document is integrity-checked by the memory store', () => {
  const store = createMemoryRecoveryCheckpointStore();
  const draft: Omit<RecoveryResetCheckpoint, 'checksum'> = {
    version: WORLD_RECOVERY_VERSION,
    checkpointId: 'reset:session-226:2',
    sessionKind: 'ACADEMY',
    sessionId: 'session-226',
    reason: WORLD_RESET_REASON,
    createdAt: RECOVERY_FIXED_NOW,
    tick: 20,
    previous: { worldEpoch: 1, learningEpoch: 0, economyEpoch: 1 },
    next: { worldEpoch: 2, learningEpoch: 1, economyEpoch: 2 },
    closedActivities: [],
    closedSegments: 0,
    profileId: 'profile-1',
    profileVersionId: 'profile-1@1',
    profileChecksum: `fnv1a64:${'1'.repeat(16)}`,
    ledgerDigest: `sha256:${'2'.repeat(64)}`,
    launch: 'PAUSED_AUTO',
  };
  const document: RecoveryResetCheckpoint = Object.freeze({
    ...draft,
    checksum: computeRecoveryCheckpointChecksum(draft),
  });
  assert.deepEqual(store.commit(document), { status: 'COMMITTED' });
  assert.equal(store.rows.length, 1);
  assert.equal(store.latest()?.checkpointId, document.checkpointId);

  const tampered = store.commit({ ...document, checkpointId: 'reset:session-226:3', tick: 21 });
  assert.equal(tampered.status, 'REJECTED');
  if (tampered.status === 'REJECTED') assert.equal(tampered.code, 'CHECKPOINT_INVALID');
  assert.equal(store.rows.length, 1);
});

test('226 history is paged, cancellable and closes after disposal', () => {
  const fixture = createWorldRecoveryFixture();
  for (let index = 0; index < 3; index += 1)
    assert.equal(
      fixture.module.recoverVehicle({ tick: 10 + index, origin: 'R' }).status,
      'RECOVERED',
    );
  assert.equal(fixture.module.readHistory('VEHICLE_RECOVERY').length, 3);
  assert.equal(fixture.module.readHistory('VEHICLE_RECOVERY', 1, 1).length, 1);
  assert.equal(fixture.module.readHistory('CITY_RESET').length, 0);
  assert.equal(fixture.module.readHistory('STYLE_RESTORE').length, 0);

  assert.equal(fixture.module.beginCityReset({ tick: 40 }).status, 'PREPARED');
  assert.equal(fixture.module.cancelCityReset(), true);
  assert.equal(fixture.module.status().prepared, null);
  assert.equal(fixture.module.cancelCityReset(), false);
  assert.equal(fixture.module.commitCityReset().status, 'REJECTED');

  fixture.module.dispose();
  assert.equal(fixture.module.status().disposed, true);
  const disposed = fixture.module.recoverVehicle({ tick: 50, origin: 'R' });
  assert.equal(disposed.status, 'REJECTED');
  if (disposed.status === 'REJECTED') assert.equal(disposed.rejection.code, 'DISPOSED');
  assert.equal(fixture.module.readHistory('VEHICLE_RECOVERY').length, 3);
});

test('226 the fixture profile versions carry real 109 checksums', () => {
  const fixture = createWorldRecoveryFixture();
  const base = fixture.profile.active();
  assert.equal(base.checksum, computeProfileVersionChecksum(base));
  assert.equal(verifyProfileVersionChecksum(base), true);
  const result = fixture.module.restoreStyle({ tick: 30, versionId: 'profile-1@2' });
  assert.equal(result.status, 'RESTORED');
  if (result.status !== 'RESTORED') return;
  assert.equal(result.profile.checksum, computeProfileVersionChecksum(fixture.profile.active()));
  assert.notEqual(result.profile.checksum, result.profile.previousChecksum);
});

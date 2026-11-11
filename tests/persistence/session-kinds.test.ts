import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SESSION_KINDS_VERSION,
  adoptChaosStyleIntoAcademy,
  applyChaosTuning,
  computeSessionKindCheckpointChecksum,
  copyProfileForChaos,
  evaluateSessionKindTransfer,
  isSessionKind,
  sessionCapabilitiesFor,
  sessionKindCapabilityParity,
  verifyChaosProfileCopy,
  verifySessionKindCheckpoint,
} from '../../src/persistence/index';
import { playerControlModes } from '../../src/missions';
import { verifyProfileVersionChecksum } from '../../src/profiles';
import { completeMission } from '../missions/mission-rewards-fixture';
import { createMissionTestTracker } from '../missions/mission-fixture';
import {
  ACADEMY_SESSION_ID,
  CHAOS_COPY_ID,
  CHAOS_SESSION_ID,
  FIXED_NOW,
  academyActiveWindow,
  academyManualStart,
  academyProfile,
  chaosActiveWindow,
  chaosManualStart,
  chaosProfileCopy,
  sessionEconomyFixture,
  sessionHostFixture,
} from './session-kinds-fixture';
import { profileVersion } from './fixtures';

test('225 SessionKind is a separate dimension from AUTO/MANUAL/LEARNING', () => {
  assert.equal(isSessionKind('ACADEMY'), true);
  assert.equal(isSessionKind('CHAOS'), true);
  assert.equal(isSessionKind('AUTO'), false);
  assert.equal(isSessionKind('MANUAL'), false);

  const academy = sessionCapabilitiesFor('ACADEMY');
  const chaos = sessionCapabilitiesFor('CHAOS');
  assert.deepEqual(academy.controlModes, [...playerControlModes]);
  assert.deepEqual(chaos.controlModes, [...playerControlModes]);
  assert.deepEqual(academy.capabilities, chaos.capabilities);
  assert.equal(sessionKindCapabilityParity('ACADEMY', 'CHAOS').identical, true);
  assert.deepEqual(sessionKindCapabilityParity('ACADEMY', 'CHAOS').differences, []);
  for (const mode of playerControlModes) {
    assert.ok(academy.controlModes.includes(mode), `Academy lacks control mode ${mode}`);
    assert.ok(chaos.controlModes.includes(mode), `Haos lacks control mode ${mode}`);
  }
  for (const capability of ['SELECT_ANY_VEHICLE', 'FREE_DRIVE', 'MANUAL_CONTROL', 'LEARNING']) {
    assert.ok(academy.capabilities.includes(capability as never));
    assert.ok(chaos.capabilities.includes(capability as never));
  }
  assert.equal(academy.vehicleSelection, 'ANY_EXISTING');
  assert.equal(chaos.vehicleSelection, 'ANY_EXISTING');
  assert.equal(academy.kindGrantsProgress, false);
  assert.equal(chaos.kindGrantsProgress, false);
});

test('225 Haos copies the chosen profile explicitly and the copy is independent in both directions', () => {
  const source = academyProfile();
  const copy = chaosProfileCopy(source);
  assert.notEqual(copy.profile.profileId, source.profileId);
  assert.notEqual(copy.profile.versionId, source.versionId);
  assert.equal(copy.profile.parameters.speed_delta_urban, source.parameters.speed_delta_urban);
  assert.equal(copy.progressTransferred, false);
  assert.equal(copy.sourceSegmentsTransferred, 0);
  assert.equal(copy.profile.sourceSegmentIds.length, 0);
  assert.equal(verifyProfileVersionChecksum(copy.profile), true);
  assert.equal(verifyChaosProfileCopy(copy).status, 'VALID');

  const tuned = applyChaosTuning({
    copy,
    tuningId: 'tune-1',
    versionId: `chaos:${CHAOS_COPY_ID}@2`,
    key: 'speed_delta_urban',
    unit: 'ratio',
    value: 14,
    reason: 'manual tuning in Haos',
    createdAt: FIXED_NOW,
  });
  assert.equal(tuned.status, 'TUNED');
  if (tuned.status !== 'TUNED') return;
  assert.equal(tuned.copy.profile.parameters.speed_delta_urban, 14);
  assert.equal(source.parameters.speed_delta_urban, 10);
  assert.equal(verifyProfileVersionChecksum(tuned.copy.profile), true);

  const academyNext = profileVersion({
    versionId: 'profile-1@2',
    parentVersionId: 'profile-1@1',
    depth: 1,
    parameters: { speed_delta_urban: 8, following_time_headway: 1.2 },
  });
  assert.equal(academyNext.parameters.speed_delta_urban, 8);
  assert.equal(copy.profile.parameters.speed_delta_urban, 10);
  assert.equal(tuned.copy.profile.parameters.speed_delta_urban, 14);
});

test('225 the profile copy refuses a tampered source or copy', () => {
  const source = academyProfile();
  const brokenSource = { ...source, checksum: `fnv1a64:${'0'.repeat(16)}` };
  const rejected = copyProfileForChaos({
    source: brokenSource,
    copyId: 'copy-broken',
    sessionId: CHAOS_SESSION_ID,
    learningEpoch: 0,
    copiedAt: FIXED_NOW,
  });
  assert.equal(rejected.status, 'REJECTED');
  if (rejected.status === 'REJECTED')
    assert.equal(rejected.rejection.code, 'PROFILE_CHECKSUM_MISMATCH');

  const copy = chaosProfileCopy(source);
  const tampered = {
    ...copy,
    profile: {
      ...copy.profile,
      parameters: { ...copy.profile.parameters, speed_delta_urban: 99 },
    },
  };
  const verdict = verifyChaosProfileCopy(tampered);
  assert.equal(verdict.status, 'REJECTED');
  if (verdict.status === 'REJECTED')
    assert.equal(verdict.rejection.code, 'PROFILE_CHECKSUM_MISMATCH');
});

test('225 a Haos session consumes no daily, no XP and no campaign reward', () => {
  const fixture = sessionEconomyFixture();
  const before = fixture.isolation.fingerprint();
  const chaos = fixture.isolation.gate('CHAOS');
  const results = [
    chaos.ingestDaily(chaosManualStart()),
    chaos.advanceDaily({}),
    chaos.creditMission({}),
    chaos.creditDaily({}),
    chaos.observeActiveTime(chaosActiveWindow()),
    chaos.settleCampaign({}),
  ];
  for (const result of results) {
    assert.equal(result.status, 'ISOLATED');
    if (result.status === 'ISOLATED') {
      assert.equal(result.code, 'SESSION_KIND_ISOLATED');
      assert.equal(result.countersUnchanged, true);
      assert.equal(result.sessionKind, 'CHAOS');
    }
  }
  const after = fixture.isolation.fingerprint();
  assert.deepEqual(after, before);
  assert.equal(fixture.isolation.stats().isolated, 6);
  assert.equal(fixture.isolation.stats().delegated, 0);
  assert.equal(after.counts.historyScans, 0);
  assert.equal(after.counts.dailyRewards, 0);
  assert.equal(after.counts.xpBalanceMicroXp, 0);
  assert.equal(after.counts.rewardGrants, 0);

  const academy = fixture.isolation.gate('ACADEMY');
  const active = academy.observeActiveTime(academyActiveWindow());
  assert.equal(active.status, 'DELEGATED');
  if (active.status === 'DELEGATED') {
    const credited = active.result as { readonly status: string };
    assert.equal(credited.status, 'CREDITED');
  }
  const delegatedFingerprint = fixture.isolation.fingerprint();
  assert.equal(delegatedFingerprint.counts.xpBalanceMicroXp, 500_000);
  assert.equal(delegatedFingerprint.counts.xpEntries, 1);
  assert.notEqual(delegatedFingerprint.xp, before.xp);
});

test('225 the isolation gate delegates real Academy daily and campaign work', () => {
  const fixture = sessionEconomyFixture();
  const academy = fixture.isolation.gate('ACADEMY');
  const daily = academy.ingestDaily({ event: academyManualStart(), observedAtMs: 1_000_000 });
  assert.equal(daily.status, 'DELEGATED');

  const tracker = createMissionTestTracker();
  const instance = completeMission(tracker, 'campaign-1-first-taxi', 100);
  const settled = academy.settleCampaign({ instance });
  assert.equal(settled.status, 'DELEGATED');
  if (settled.status === 'DELEGATED') {
    const result = settled.result as { readonly status: string };
    assert.equal(result.status, 'GRANTED');
  }
  const after = fixture.isolation.fingerprint();
  assert.ok(after.counts.rewardGrants >= 1);
  assert.equal(fixture.isolation.stats().delegated, 2);
});

test('225 a switch closes the segment, commits atomically, invalidates jobs and releases input', async () => {
  const fixture = sessionHostFixture();
  const started = fixture.host.start('ACADEMY');
  assert.equal(started.status, 'STARTED');
  assert.equal(fixture.host.status().live, 'ACADEMY');

  const result = await fixture.host.switchTo('CHAOS');
  assert.equal(result.status, 'SWITCHED');
  if (result.status !== 'SWITCHED') return;
  assert.equal(result.from, 'ACADEMY');
  assert.equal(result.to, 'CHAOS');
  assert.equal(result.closedSegments, 1);
  assert.equal(result.invalidatedJobs, 2);
  assert.equal(result.releasedInputs, 2);
  assert.equal(result.launch.mode, 'PAUSED_AUTO');
  assert.equal(result.launch.paused, true);
  assert.equal(result.launch.auto, true);
  assert.equal(result.launch.inputReleased, true);
  assert.equal(result.launch.manualVehicles, 0);
  assert.equal(result.launch.vehiclesInAuto, 4);
  assert.equal(result.launch.previousManualVehicles, 1);

  const status = fixture.host.status();
  assert.equal(status.live, 'CHAOS');
  assert.equal(status.switches, 1);
  assert.equal(status.resident.liveWorlds, 1);
  assert.equal(status.kinds.ACADEMY.worldEpoch, 2);
  assert.equal(status.kinds.ACADEMY.checkpoints, 1);
  assert.equal(status.kinds.CHAOS.entries, 1);
  assert.deepEqual(fixture.world.orphans(), []);

  const late = fixture.host.acceptJobResult({
    sessionKind: 'ACADEMY',
    sessionId: ACADEMY_SESSION_ID,
    worldEpoch: 1,
    learningEpoch: 0,
    jobId: 'job-late',
  });
  assert.equal(late.status, 'LATE_RESULT');
  const accepted = fixture.host.acceptJobResult({
    sessionKind: 'CHAOS',
    sessionId: CHAOS_SESSION_ID,
    worldEpoch: 1,
    learningEpoch: 0,
    jobId: 'job-live',
  });
  assert.equal(accepted.status, 'ACCEPTED');
});

test('225 a failed save keeps the current world and does not advance the epochs', async () => {
  const fixture = sessionHostFixture();
  fixture.host.start('ACADEMY');
  fixture.store.failNextCommit();
  const failed = await fixture.host.switchTo('CHAOS');
  assert.equal(failed.status, 'REJECTED');
  if (failed.status === 'REJECTED') {
    assert.equal(failed.code, 'SAVE_FAILED');
    assert.equal(failed.world, 'ACADEMY');
    assert.equal(failed.closedSegments, 1);
  }
  const status = fixture.host.status();
  assert.equal(status.live, 'ACADEMY');
  assert.equal(status.switches, 0);
  assert.equal(status.failedSwitches, 1);
  assert.equal(status.kinds.ACADEMY.worldEpoch, 1);
  assert.equal(status.kinds.ACADEMY.checkpoints, 0);
  const live = fixture.world.worlds.find((world) => world.live);
  assert.ok(live !== undefined);
  assert.equal(live.jobs, 2);
  assert.equal(live.inputs, 2);
  assert.equal(fixture.world.orphans().length, 0);

  const retry = await fixture.host.switchTo('CHAOS');
  assert.equal(retry.status, 'SWITCHED');
  const after = fixture.host.status();
  assert.equal(after.live, 'CHAOS');
  assert.equal(after.switches, 1);
  assert.equal(after.kinds.ACADEMY.checkpoints, 1);
});

test('225 the two kinds keep separate checkpoints and a Haos restore leaves the Academy alone', async () => {
  const fixture = sessionHostFixture();
  fixture.host.start('ACADEMY');
  await fixture.host.switchTo('CHAOS');
  await fixture.host.switchTo('ACADEMY');
  const academyRows = await fixture.store.list('ACADEMY');
  const chaosRows = await fixture.store.list('CHAOS');
  assert.equal(academyRows.length, 1);
  assert.equal(chaosRows.length, 1);
  assert.equal(
    academyRows.every((row) => row.sessionKind === 'ACADEMY'),
    true,
  );
  assert.equal(
    chaosRows.every((row) => row.sessionKind === 'CHAOS'),
    true,
  );
  assert.notEqual(academyRows[0]!.sessionId, chaosRows[0]!.sessionId);

  const academyBefore = fixture.host.status().kinds.ACADEMY;
  const restored = await fixture.host.restore('CHAOS');
  assert.equal(restored.status, 'RESTORED');
  if (restored.status !== 'RESTORED') return;
  assert.equal(restored.sessionKind, 'CHAOS');
  assert.equal(restored.checkpointId, chaosRows[0]!.checkpointId);
  assert.equal(restored.launch.mode, 'PAUSED_AUTO');
  assert.equal(restored.launch.inputReleased, true);
  assert.equal(restored.launch.manualVehicles, 0);

  const after = fixture.host.status();
  assert.equal(after.live, 'CHAOS');
  assert.deepEqual(after.kinds.ACADEMY, academyBefore);
  assert.deepEqual(await fixture.store.list('ACADEMY'), academyRows);
});

test('225 a foreign or modified checkpoint is refused explicitly', async () => {
  const fixture = sessionHostFixture();
  fixture.host.start('ACADEMY');
  const body = { forged: true };
  const draft = {
    version: SESSION_KINDS_VERSION,
    checkpointId: 'checkpoint:forged',
    sessionKind: 'ACADEMY' as const,
    sessionId: 'session-other',
    profileId: 'profile-1',
    worldEpoch: 1,
    learningEpoch: 0,
    tick: 5,
    generation: 1,
    reason: 'AUTOSAVE' as const,
    createdAt: FIXED_NOW,
    vehicles: 1,
    manualVehicles: 0,
    launch: 'PAUSED_AUTO' as const,
    body,
    bodyBytes: new TextEncoder().encode(JSON.stringify(body)).length,
  };
  const committed = await fixture.store.commit({
    ...draft,
    checksum: computeSessionKindCheckpointChecksum(draft),
  });
  assert.equal(committed.status, 'COMMITTED');
  const restored = await fixture.host.restore('ACADEMY');
  assert.equal(restored.status, 'REJECTED');
  if (restored.status === 'REJECTED') assert.equal(restored.code, 'FOREIGN_CHECKPOINT');

  const modified = verifySessionKindCheckpoint({ ...committed.checkpoint, tick: 6 });
  assert.equal(modified.status, 'REJECTED');
  if (modified.status === 'REJECTED') assert.equal(modified.rejection.code, 'CHECKPOINT_INVALID');
});

test('225 twenty transitions leave one live world and no resident job or binding', async () => {
  const fixture = sessionHostFixture();
  fixture.host.start('ACADEMY');
  for (let index = 0; index < 20; index += 1) {
    const result = await fixture.host.switchTo(index % 2 === 0 ? 'CHAOS' : 'ACADEMY');
    assert.equal(result.status, 'SWITCHED', `transition ${index + 1}`);
    const status = fixture.host.status();
    assert.equal(status.resident.liveWorlds, 1);
    assert.equal(status.resident.profileCopies, 1);
    assert.equal(status.resident.listeners, 1);
    assert.deepEqual(fixture.world.orphans(), []);
  }
  const status = fixture.host.status();
  assert.equal(status.switches, 20);
  assert.equal(status.failedSwitches, 0);
  assert.equal(status.resident.checkpoints, 20);
  const stats = fixture.store.stats();
  assert.equal(stats.committed, 20);
  assert.equal(stats.rejected, 0);
  assert.equal(stats.rows.ACADEMY + stats.rows.CHAOS, 20);
  assert.equal(verifyChaosProfileCopy(fixture.copy).status, 'VALID');
});

test('225 a reload resumes the live world in pause/AUTO with the input released', async () => {
  const fixture = sessionHostFixture();
  fixture.host.start('ACADEMY');
  await fixture.host.switchTo('CHAOS');
  await fixture.host.switchTo('ACADEMY');
  const reload = await fixture.host.reload();
  assert.equal(reload.status, 'RESUMED');
  if (reload.status !== 'RESUMED') return;
  assert.equal(reload.sessionKind, 'ACADEMY');
  assert.equal(reload.launch.mode, 'PAUSED_AUTO');
  assert.equal(reload.launch.paused, true);
  assert.equal(reload.launch.auto, true);
  assert.equal(reload.launch.inputReleased, true);
  assert.equal(reload.launch.manualVehicles, 0);
  assert.ok(reload.tick > 0);
});

test('225 the chaos style copy into the Academy validates the profile and moves no progress', () => {
  const fixture = sessionEconomyFixture();
  const before = fixture.isolation.fingerprint();
  const tuned = applyChaosTuning({
    copy: fixture.copy,
    tuningId: 'tune-2',
    versionId: `chaos:${CHAOS_COPY_ID}@2`,
    key: 'speed_delta_urban',
    unit: 'ratio',
    value: 14,
    reason: null,
    createdAt: FIXED_NOW,
  });
  assert.equal(tuned.status, 'TUNED');
  if (tuned.status !== 'TUNED') return;

  const adopted = adoptChaosStyleIntoAcademy({
    copy: tuned.copy,
    sessionId: ACADEMY_SESSION_ID,
    profileId: 'profile-1-adopted',
    versionId: 'profile-1-adopted@1',
    adoptedAt: FIXED_NOW,
  });
  assert.equal(adopted.status, 'ADOPTED');
  if (adopted.status !== 'ADOPTED') return;
  assert.equal(adopted.adoption.profile.parameters.speed_delta_urban, 14);
  assert.equal(verifyProfileVersionChecksum(adopted.adoption.profile), true);
  assert.deepEqual(adopted.adoption.transferred, {
    progress: 'NONE',
    dailyRewards: 0,
    xp: 0,
    campaignRewards: 0,
    checkpoints: 0,
    records: 0,
    unlocks: 0,
  });
  const after = fixture.isolation.fingerprint();
  assert.deepEqual(after, before);

  const smuggling = adoptChaosStyleIntoAcademy({
    copy: tuned.copy,
    sessionId: ACADEMY_SESSION_ID,
    profileId: 'profile-1-adopted',
    versionId: 'profile-1-adopted@2',
    adoptedAt: FIXED_NOW,
    xp: 500,
  } as unknown);
  assert.equal(smuggling.status, 'REJECTED');
  if (smuggling.status === 'REJECTED')
    assert.equal(smuggling.rejection.code, 'PROGRESS_TRANSFER_REFUSED');
});

test('225 no path promotes Haos data into the Academy', () => {
  for (const path of ['IMPORT', 'EXPORT', 'CHECKPOINT', 'RESTORE', 'ARCHIVE'] as const) {
    const decision = evaluateSessionKindTransfer({ from: 'CHAOS', to: 'ACADEMY', path });
    assert.equal(decision.allowed, false, `${path} must be refused`);
    assert.equal(decision.code, 'PROMOTION_REFUSED');
    assert.equal(decision.progressTransferred, false);
  }
  const style = evaluateSessionKindTransfer({
    from: 'CHAOS',
    to: 'ACADEMY',
    path: 'STYLE_COPY',
  });
  assert.equal(style.allowed, true);
  assert.equal(style.code, 'ALLOWED');

  const copy = evaluateSessionKindTransfer({
    from: 'ACADEMY',
    to: 'CHAOS',
    path: 'PROFILE_COPY',
  });
  assert.equal(copy.allowed, true);
  const importIntoChaos = evaluateSessionKindTransfer({
    from: 'ACADEMY',
    to: 'CHAOS',
    path: 'IMPORT',
  });
  assert.equal(importIntoChaos.allowed, false);
  assert.equal(importIntoChaos.code, 'CROSS_SESSION_REFUSED');
  const sameKind = evaluateSessionKindTransfer({
    from: 'ACADEMY',
    to: 'ACADEMY',
    path: 'IMPORT',
  });
  assert.equal(sameKind.allowed, true);
});

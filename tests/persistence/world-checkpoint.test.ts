import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WORLD_SNAPSHOT_LIMITS,
  WorldSnapshotError,
  advanceWorldRng,
  captureWorldSnapshot,
  computeWorldSnapshotChecksum,
  createWorldCheckpointWriter,
  loadLatestWorldCheckpoint,
  readWorldSnapshot,
  restoreWorldState,
} from '../../src/persistence/index';
import type {
  LocalRepository,
  WorldCaptureIdentity,
  WorldCaptureResult,
  WorldCheckpointWriter,
} from '../../src/persistence/index';
import {
  WORLD_FIXTURE,
  canonicalWorld,
  captureInput,
  createWorldFixture,
  createWorldFromSnapshot,
  runWorld,
  worldSource,
} from './world-checkpoint-fixtures';
import type { MutableWorld } from './world-checkpoint-fixtures';
import {
  WORLD_CAPTURED_AT,
  WORLD_CHECKPOINT,
  WORLD_SESSION,
  WORLD_VERSIONS,
  createOrigin,
  openTab,
  sequenceClock,
} from './world-checkpoint-harness';
import type { WorldOrigin } from './world-checkpoint-harness';
import { fixedClock } from './fixtures';

const COST_CLOCK = [0, 2.5, 3, 10, 20, 26] as const;

interface WriterTab {
  readonly repository: LocalRepository;
  readonly writer: WorldCheckpointWriter;
}

async function writerTab(
  origin: WorldOrigin,
  tabId = 'tab-a',
  clock: readonly number[] = COST_CLOCK,
): Promise<WriterTab> {
  const repository = await openTab(origin, tabId);
  const writer = createWorldCheckpointWriter({
    repository,
    writerId: tabId,
    versions: WORLD_VERSIONS,
    monotonic: sequenceClock(clock),
    now: fixedClock(),
  });
  return { repository, writer };
}

function identity(generation: number): WorldCaptureIdentity {
  return { checkpointId: WORLD_CHECKPOINT, sessionId: WORLD_SESSION, generation };
}

function prepared(result: WorldCaptureResult) {
  assert.equal(result.status, 'PREPARED');
  if (result.status !== 'PREPARED') throw new Error('Expected a prepared capture');
  return result.capture;
}

function rejectedCode(result: WorldCaptureResult): string {
  assert.equal(result.status, 'REJECTED');
  if (result.status !== 'REJECTED') throw new Error('Expected a refused capture');
  return result.rejection.code;
}

function worldAt(tick: number): MutableWorld {
  const world = createWorldFixture();
  runWorld(world, tick);
  return world;
}

test('206 a coherent boundary capture carries every subsystem and its checksum', async () => {
  const world = worldAt(WORLD_FIXTURE.captureTick);
  const { repository, writer } = await writerTab(createOrigin());
  const result = await writer.captureAtTick(worldSource(world), identity(1));
  const capture = prepared(result);

  assert.equal(capture.tick, WORLD_FIXTURE.captureTick);
  assert.equal(capture.worldEpoch, WORLD_FIXTURE.worldEpoch);
  assert.equal(capture.learningEpoch, WORLD_FIXTURE.learningEpoch);
  assert.equal(capture.profileId, WORLD_FIXTURE.profileId);
  assert.equal(capture.capturedAt, WORLD_CAPTURED_AT);
  assert.equal(capture.snapshot.snapshotVersion, '206-world-snapshot-v1');
  assert.equal(capture.snapshot.units, 'SI');
  assert.equal(capture.snapshot.vehicles.length, 70);
  assert.equal(capture.snapshot.controllers.length, 70);
  assert.equal(capture.snapshot.rides.length, 30);
  assert.equal(capture.snapshot.passengers.length, 30);
  assert.equal(capture.snapshot.segments.length, 3);
  assert.equal(capture.snapshot.opportunities.length, 64);
  assert.equal(capture.snapshot.signals.length, 8);
  assert.equal(capture.snapshot.dispatch.pending.length, 3);
  assert.equal(capture.snapshot.dispatch.acceptedResults.length, 1);
  assert.equal(capture.snapshot.learning.pendingJobs.length, 3);
  assert.equal(capture.snapshot.learning.completedObservations.length, 2);
  assert.equal(capture.snapshot.rng.streams.traffic, 70 * WORLD_FIXTURE.captureTick);
  assert.equal(capture.snapshot.rng.streams.opportunities, WORLD_FIXTURE.captureTick);
  assert.match(capture.checksum, /^[0-9a-f]{64}$/);
  assert.equal(computeWorldSnapshotChecksum(capture.snapshot), capture.checksum);
  assert.equal(Object.isFrozen(capture.snapshot), true);
  assert.equal(Object.isFrozen(capture.snapshot.vehicles), true);
  assert.equal(Object.isFrozen(capture.snapshot.vehicles[0]), true);
  assert.equal(capture.bytes > 0 && capture.bytes <= WORLD_SNAPSHOT_LIMITS.maxBodyBytes, true);
  assert.equal(capture.body.checksum, capture.checksum);
  assert.equal(capture.captureMs, 2.5);
  assert.equal(capture.encodeMs, 7);

  const read = readWorldSnapshot(capture.body);
  assert.equal(read.status, 'ACCEPTED');
  if (read.status === 'ACCEPTED') {
    assert.equal(read.checksum, capture.checksum);
    assert.equal(read.bytes, capture.bytes);
    assert.equal(read.snapshot.vehicles[0]?.rideId, 'ride-01');
    assert.deepEqual(read.snapshot.vehicles[7]?.passengerIds, ['passenger-08']);
  }

  // The capture is a copy: mutating the live world afterwards cannot change what was stored.
  world.vehicles[0]!.position.x = 9999;
  assert.notEqual(capture.snapshot.vehicles[0]?.position.x, 9999);

  // The same tick and generation are coalesced instead of copied twice.
  const coalesced = prepared(
    writer.captureAtTick(
      { tick: world.tick, boundary: 'BOUNDARY', capture: () => captureInput(world) },
      identity(1),
    ),
  );
  assert.equal(coalesced.token, capture.token);
  assert.equal(writer.status().captures, 1);
  assert.equal(writer.status().coalesced, 1);

  // A newer generation at the same tick replaces the prepared one.
  world.vehicles[0]!.position.x = 1000;
  const replaced = prepared(writer.captureAtTick(worldSource(world), identity(2)));
  assert.notEqual(replaced.token, capture.token);
  assert.equal(writer.status().replaced, 1);
  assert.equal(writer.status().captures, 2);

  repository.close();
});

test('206 an in-step read, a mismatched tick and incoherent data are refused', async () => {
  const world = worldAt(WORLD_FIXTURE.captureTick);
  const { repository, writer } = await writerTab(createOrigin());
  const source = worldSource(world);

  assert.equal(
    rejectedCode(writer.captureAtTick({ ...source, boundary: 'IN_STEP' }, identity(1))),
    'TICK_NOT_BOUNDARY',
  );
  const inStepInput = { ...captureInput(world), tickBoundary: 'IN_STEP' as const };
  const inStep = captureWorldSnapshot(inStepInput);
  assert.equal(inStep.status, 'REJECTED');
  if (inStep.status === 'REJECTED') assert.equal(inStep.rejection.code, 'TICK_NOT_BOUNDARY');

  assert.equal(
    rejectedCode(
      writer.captureAtTick(
        { tick: world.tick + 1, boundary: 'BOUNDARY', capture: () => captureInput(world) },
        identity(1),
      ),
    ),
    'CAPTURE_TICK_MISMATCH',
  );

  const mismatch = captureInput(world);
  mismatch.subsystemTicks.rides = world.tick - 1;
  const refused = captureWorldSnapshot(mismatch);
  assert.equal(refused.status, 'REJECTED');
  if (refused.status === 'REJECTED') {
    assert.equal(refused.rejection.code, 'SUBSYSTEM_TICK_MISMATCH');
    assert.equal(refused.rejection.path, 'snapshot.subsystemTicks.rides');
  }

  const duplicate = captureInput(world);
  duplicate.vehicles[1]!.entityId = duplicate.vehicles[0]!.entityId;
  const duplicateResult = captureWorldSnapshot(duplicate);
  assert.equal(duplicateResult.status, 'REJECTED');
  if (duplicateResult.status === 'REJECTED') {
    assert.equal(duplicateResult.rejection.code, 'DUPLICATE_ENTITY');
  }

  const dangling = captureInput(world);
  dangling.vehicles[0]!.segmentId = 'segment-that-does-not-exist';
  const danglingResult = captureWorldSnapshot(dangling);
  assert.equal(danglingResult.status, 'REJECTED');
  if (danglingResult.status === 'REJECTED') {
    assert.equal(danglingResult.rejection.code, 'DANGLING_REFERENCE');
  }

  const nonFinite = captureInput(world);
  nonFinite.vehicles[0]!.position.x = Number.NaN;
  const nonFiniteResult = captureWorldSnapshot(nonFinite);
  assert.equal(nonFiniteResult.status, 'REJECTED');
  if (nonFiniteResult.status === 'REJECTED') {
    assert.equal(nonFiniteResult.rejection.code, 'NON_FINITE_NUMBER');
  }

  assert.equal(writer.status().rejections, 2);
  repository.close();
});

test('206 the snapshot budget and the body budget are enforced, never truncated', () => {
  const world = worldAt(WORLD_FIXTURE.captureTick);
  const tooMany = captureInput(world);
  tooMany.opportunities = Array.from(
    { length: WORLD_SNAPSHOT_LIMITS.maxOpportunities + 1 },
    () => ({
      opportunityKey: 'opportunity-overflow',
      evaluatedTick: 0,
      seed: 1,
      evaluated: false,
      verdict: null,
    }),
  );
  const tooManyResult = captureWorldSnapshot(tooMany);
  assert.equal(tooManyResult.status, 'REJECTED');
  if (tooManyResult.status === 'REJECTED') {
    assert.equal(tooManyResult.rejection.code, 'SNAPSHOT_TOO_LARGE');
  }

  const heavy = captureInput(world);
  heavy.opportunities = Array.from({ length: 1200 }, (_, index) => ({
    opportunityKey: `opportunity-${String(index).padStart(4, '0')}-${'x'.repeat(180)}`,
    evaluatedTick: 0,
    seed: 0x1000 + index,
    evaluated: false,
    verdict: null,
  }));
  const heavyResult = captureWorldSnapshot(heavy);
  assert.equal(heavyResult.status, 'REJECTED');
  if (heavyResult.status === 'REJECTED') {
    assert.equal(heavyResult.rejection.code, 'SNAPSHOT_TOO_LARGE');
    assert.match(heavyResult.rejection.message, /byte budget/);
  }
});

test('206 a stored snapshot is verified before it is read', () => {
  const world = worldAt(WORLD_FIXTURE.captureTick);
  const captured = captureWorldSnapshot(worldSource(world).capture());
  assert.equal(captured.status, 'CAPTURED');
  if (captured.status !== 'CAPTURED') return;
  const body = JSON.parse(JSON.stringify(captured.body)) as Record<string, unknown>;
  const tampered = { ...body, checksum: `0${String(body.checksum).slice(1)}` };
  const tamperedResult = readWorldSnapshot(tampered);
  assert.equal(tamperedResult.status, 'REJECTED');
  if (tamperedResult.status === 'REJECTED') {
    assert.equal(tamperedResult.rejection.code, 'CHECKSUM_MISMATCH');
  }

  const missing = { ...body } as Record<string, unknown>;
  delete missing.units;
  const missingResult = readWorldSnapshot(missing);
  assert.equal(missingResult.status, 'REJECTED');
  if (missingResult.status === 'REJECTED') {
    assert.equal(missingResult.rejection.code, 'MISSING_FIELD');
  }

  const unknown = readWorldSnapshot({ ...body, world: {} });
  assert.equal(unknown.status, 'REJECTED');
  if (unknown.status === 'REJECTED') {
    assert.equal(unknown.rejection.code, 'UNKNOWN_FIELD');
  }

  const incompatible = readWorldSnapshot({
    ...body,
    snapshotVersion: '206-world-snapshot-v2',
  });
  assert.equal(incompatible.status, 'REJECTED');
  if (incompatible.status === 'REJECTED') {
    assert.equal(incompatible.rejection.code, 'INCOMPATIBLE_VERSION');
  }

  const negativeTick = readWorldSnapshot({ ...body, tick: -1 });
  assert.equal(negativeTick.status, 'REJECTED');
  if (negativeTick.status === 'REJECTED') {
    assert.equal(negativeTick.rejection.code, 'INVALID_SNAPSHOT');
  }
});

test('206 the keyed RNG cursor is the resumed sequence, not a fresh generator', () => {
  const start = { seed: 7, streams: { traffic: 4, rideDemand: 0, opportunities: 0 } } as const;
  const first = advanceWorldRng(start, 'traffic');
  const second = advanceWorldRng(first.rng, 'traffic');
  assert.equal(first.rng.streams.traffic, 5);
  assert.equal(second.rng.streams.traffic, 6);
  assert.notEqual(first.value, second.value);
  assert.deepEqual(advanceWorldRng(start, 'traffic'), first);

  assert.throws(
    () =>
      advanceWorldRng(
        { seed: 7, streams: { traffic: -1, rideDemand: 0, opportunities: 0 } },
        'traffic',
      ),
    (error: unknown) => error instanceof WorldSnapshotError && error.code === 'INVALID_SNAPSHOT',
  );
  // A different keyed stream is independent of the traffic cursor.
  assert.equal(advanceWorldRng(first.rng, 'rideDemand').rng.streams.traffic, 5);
});

test('206 the restored world continues the exact same 60 ticks as the oracle', async () => {
  const origin = createOrigin();
  const { repository, writer } = await writerTab(origin);
  const oracle = worldAt(WORLD_FIXTURE.captureTick);
  const capture = prepared(writer.captureAtTick(worldSource(oracle), identity(1)));
  const commit = await writer.commitCapture(capture);
  assert.equal(commit.status, 'COMMITTED');

  const loaded = await loadLatestWorldCheckpoint(repository, WORLD_SESSION, {
    versions: WORLD_VERSIONS,
    currentTick: WORLD_FIXTURE.captureTick,
  });
  assert.equal(loaded.status, 'RESUMABLE');
  if (loaded.status !== 'RESUMABLE') return;
  const restored = createWorldFromSnapshot(loaded.state);
  assert.equal(restored.vehicles.length, oracle.vehicles.length);

  runWorld(oracle, WORLD_FIXTURE.continuationTicks);
  runWorld(restored, WORLD_FIXTURE.continuationTicks);

  assert.equal(oracle.tick, 120);
  assert.equal(restored.tick, 120);
  assert.equal(canonicalWorld(restored), canonicalWorld(oracle));
  assert.deepEqual(restored.rng, oracle.rng);
  assert.equal(restored.rng.streams.traffic, 70 * 120);
  assert.equal(restored.rides[0]?.state, 'COMPLETED');
  assert.equal(restored.passengers[0]?.state, 'DELIVERED');
  assert.equal(restored.vehicles[0]?.rideId, null);
  assert.equal(restored.vehicles[7]?.rideId, null);
  assert.deepEqual(restored.vehicles[7]?.passengerIds, []);
  assert.equal(restored.segments[0]?.sampleCount, 120);
  repository.close();
});

test('206 resume is paused, automatic, input-free and idempotent', async () => {
  const origin = createOrigin();
  const { repository, writer } = await writerTab(origin);
  const world = worldAt(WORLD_FIXTURE.captureTick);
  const capture = prepared(writer.captureAtTick(worldSource(world), identity(1)));
  await writer.commitCapture(capture);

  const loaded = await loadLatestWorldCheckpoint(repository, WORLD_SESSION, {
    versions: WORLD_VERSIONS,
  });
  assert.equal(loaded.status, 'RESUMABLE');
  if (loaded.status !== 'RESUMABLE') return;
  const plan = loaded.resume;

  assert.equal(plan.version, '206-world-resume-v1');
  assert.equal(plan.mode, 'PAUSED_AUTO');
  assert.equal(plan.paused, true);
  assert.equal(plan.auto, true);
  assert.equal(plan.inputReleased, true);
  assert.equal(plan.tick, WORLD_FIXTURE.captureTick);
  assert.equal(plan.profileId, WORLD_FIXTURE.profileId);
  assert.equal(plan.learningEpoch, WORLD_FIXTURE.learningEpoch);
  assert.equal(plan.vehicles.length, 70);
  assert.equal(
    plan.vehicles.every((vehicle) => vehicle.controlMode === 'AUTO'),
    true,
  );
  assert.equal(
    plan.vehicles.every((vehicle) => vehicle.inputReleased),
    true,
  );
  assert.equal(
    plan.vehicles.find((vehicle) => vehicle.vehicleId === 'taxi-01')?.previousControlMode,
    'MANUAL',
  );

  assert.deepEqual(
    plan.segments.map((segment) => [segment.segmentId, segment.nextStatus, segment.reason]),
    [['segment-taxi-01', 'INCOMPLETE', 'RELOAD']],
  );
  assert.deepEqual(
    plan.jobs
      .filter((job) => job.source === 'LEARNING')
      .map((job) => [job.jobId, job.status, job.reason]),
    [
      ['learning-01', 'RELAUNCH', null],
      ['learning-02', 'INVALIDATED', 'LEARNING_EPOCH_MISMATCH'],
      ['learning-03', 'INVALIDATED', 'PROFILE_MISMATCH'],
    ],
  );
  assert.deepEqual(
    plan.jobs
      .filter((job) => job.source === 'DISPATCH')
      .map((job) => [job.jobId, job.status, job.reason]),
    [
      ['dispatch-01', 'RELAUNCH', null],
      ['dispatch-02', 'INVALIDATED', 'PROFILE_MISMATCH'],
      ['dispatch-03', 'INVALIDATED', 'LEARNING_EPOCH_MISMATCH'],
    ],
  );
  assert.deepEqual(
    plan.observations.map((observation) => [
      observation.observationId,
      observation.idempotencyKey,
      observation.status,
      observation.alreadyRewarded,
    ]),
    [
      ['observation-01', 'segment-taxi-06:observation-01', 'REPLAY', true],
      ['observation-02', 'segment-taxi-06:observation-02', 'REPLAY', false],
    ],
  );
  assert.equal(plan.acceptedResultsPreserved, 2);
  assert.equal(plan.rewardsReapplied, 0);
  assert.equal(Object.isFrozen(plan), true);

  const again = restoreWorldState(loaded.snapshot).resume;
  assert.deepEqual(plan, again);

  const switched = restoreWorldState(loaded.snapshot, {
    currentProfileId: 'profile-2',
    currentLearningEpoch: 2,
  }).resume;
  assert.deepEqual(
    switched.jobs.map((job) => [job.jobId, job.status, job.reason]),
    [
      ['learning-01', 'INVALIDATED', 'PROFILE_MISMATCH'],
      ['learning-02', 'INVALIDATED', 'PROFILE_AND_EPOCH_MISMATCH'],
      ['learning-03', 'RELAUNCH', null],
      ['dispatch-01', 'INVALIDATED', 'PROFILE_MISMATCH'],
      ['dispatch-02', 'RELAUNCH', null],
      ['dispatch-03', 'INVALIDATED', 'PROFILE_AND_EPOCH_MISMATCH'],
    ],
  );
  repository.close();
});

test('206 only the writer page captures and only its token can be committed', async () => {
  const origin = createOrigin();
  const first = await writerTab(origin, 'tab-a');
  const second = await writerTab(origin, 'tab-b', [0, 1, 2, 3, 10, 15]);
  assert.equal(second.repository.status().role, 'READ_ONLY');
  assert.equal(second.repository.status().reason, 'WRITER_HELD_BY_OTHER_TAB');

  const world = worldAt(WORLD_FIXTURE.captureTick);
  assert.equal(
    rejectedCode(second.writer.captureAtTick(worldSource(world), identity(1))),
    'WRITER_REQUIRED',
  );

  const capture = prepared(first.writer.captureAtTick(worldSource(world), identity(1)));
  const foreign = await second.writer.commitCapture(capture);
  assert.equal(foreign.status, 'REJECTED');
  if (foreign.status === 'REJECTED') assert.equal(foreign.rejection.code, 'WRITER_MISMATCH');

  const committed = await first.writer.commitCapture(capture);
  assert.equal(committed.status, 'COMMITTED');
  assert.equal(await first.repository.latestCheckpoint(WORLD_SESSION).then((row) => row?.tick), 60);

  // A lower generation or an older tick never replaces what was already committed.
  const olderGeneration = first.writer.captureAtTick(worldSource(world), identity(1));
  assert.equal(rejectedCode(olderGeneration), 'STALE_GENERATION');
  const olderTick = first.writer.captureAtTick(
    { tick: 59, boundary: 'BOUNDARY', capture: () => captureInput(world) },
    identity(2),
  );
  assert.equal(rejectedCode(olderTick), 'STALE_TICK');

  first.repository.close();
  second.repository.close();
});

test('206 one commit at a time, coalescing and an explicit discard', async () => {
  const origin = createOrigin();
  const { repository, writer } = await writerTab(
    origin,
    'tab-a',
    [0, 1, 2, 3, 10, 15, 20, 22, 23, 30, 40, 46],
  );
  const world = worldAt(WORLD_FIXTURE.captureTick);
  const first = prepared(writer.captureAtTick(worldSource(world), identity(1)));
  const coalesced = prepared(writer.captureAtTick(worldSource(world), identity(1)));
  assert.equal(coalesced.token, first.token);
  assert.equal(writer.status().coalesced, 1);

  const replacement = prepared(writer.captureAtTick(worldSource(world), identity(2)));
  assert.equal(writer.status().replaced, 1);
  assert.equal(writer.status().captures, 2);

  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const running = writer.commitCapture(replacement, {
    beforeCommit: async () => {
      await gate;
    },
  });
  const competing = await writer.commitCapture(replacement);
  assert.equal(competing.status, 'REJECTED');
  if (competing.status === 'REJECTED') {
    assert.equal(competing.rejection.code, 'COMMIT_IN_PROGRESS');
  }
  release();
  const firstCommit = await running;
  assert.equal(firstCommit.status, 'COMMITTED');
  assert.equal(writer.status().commits, 1);

  const stale = writer.captureAtTick(worldSource(world), identity(2));
  assert.equal(rejectedCode(stale), 'STALE_GENERATION');

  const discarded = prepared(writer.captureAtTick(worldSource(world), identity(3)));
  assert.equal(writer.discardPrepared('SUPERSEDED'), true);
  assert.equal(writer.discardPrepared('SHUTDOWN'), false);
  assert.equal(writer.status().preparedTick, null);
  assert.equal(writer.status().lastDiscardReason, 'SUPERSEDED');
  assert.equal(writer.status().discarded, 1);
  assert.equal(discarded.generation, 3);

  const stats = await repository.stats();
  assert.equal(stats.counts.checkpoints, 1);
  repository.close();
});

test('206 a crash before the transaction leaves nothing durable behind', async () => {
  const origin = createOrigin();
  const { repository, writer } = await writerTab(origin);
  const world = worldAt(WORLD_FIXTURE.captureTick);
  const capture = prepared(writer.captureAtTick(worldSource(world), identity(1)));
  const crashed = await writer.commitCapture(capture, {
    beforeCommit: () => {
      throw new Error('simulated death before the transaction');
    },
  });
  assert.equal(crashed.status, 'REJECTED');
  if (crashed.status === 'REJECTED') {
    assert.equal(crashed.rejection.code, 'CRASHED_BEFORE_COMMIT');
  }
  const stats = await repository.stats();
  assert.equal(stats.counts.checkpoints, 0);
  assert.equal(writer.status().preparedTick, null);
  assert.equal(writer.status().commits, 0);

  const retry = prepared(writer.captureAtTick(worldSource(world), identity(2)));
  const committed = await writer.commitCapture(retry);
  assert.equal(committed.status, 'COMMITTED');
  repository.close();
});

test('206 a death after the transaction is reported but the row is durable', async () => {
  const origin = createOrigin();
  const { repository, writer } = await writerTab(origin);
  const world = worldAt(WORLD_FIXTURE.captureTick);
  const capture = prepared(writer.captureAtTick(worldSource(world), identity(1)));
  const crashed = await writer.commitCapture(capture, {
    afterCommit: () => {
      throw new Error('simulated death after durability');
    },
  });
  assert.equal(crashed.status, 'CRASHED_AFTER_COMMIT');
  if (crashed.status === 'CRASHED_AFTER_COMMIT') {
    assert.equal(crashed.value.tick, WORLD_FIXTURE.captureTick);
    assert.equal(crashed.value.generation, 1);
  }
  const stored = await repository.getCheckpoint(WORLD_CHECKPOINT);
  assert.notEqual(stored, null);
  assert.equal(stored?.tick, WORLD_FIXTURE.captureTick);

  const loaded = await loadLatestWorldCheckpoint(repository, WORLD_SESSION, {
    versions: WORLD_VERSIONS,
  });
  assert.equal(loaded.status, 'RESUMABLE');
  if (loaded.status === 'RESUMABLE') {
    assert.equal(loaded.tick, WORLD_FIXTURE.captureTick);
    assert.equal(loaded.generation, 1);
    assert.equal(loaded.ageTicks, null);
  }
  repository.close();
});

test('206 a lost GPU keeps the RAM capture and defers the durable commit', async () => {
  const origin = createOrigin();
  const { repository, writer } = await writerTab(origin, 'tab-a', [0, 1.5, 2, 5, 10, 14]);
  const world = worldAt(WORLD_FIXTURE.captureTick);
  const capture = prepared(writer.captureAtTick(worldSource(world), identity(1)));

  const lost = writer.deviceLoss('GPU_DEVICE_LOST');
  assert.equal(lost.device, 'LOST');
  assert.equal(lost.deviceLostTick, WORLD_FIXTURE.captureTick);
  assert.equal(lost.deviceLossReason, 'GPU_DEVICE_LOST');
  assert.equal(lost.deviceLosses, 1);
  assert.equal(writer.deviceLoss('CONTEXT_LOST').deviceLosses, 1);

  const refused = await writer.commitCapture(capture);
  assert.equal(refused.status, 'REJECTED');
  if (refused.status === 'REJECTED') assert.equal(refused.rejection.code, 'DEVICE_LOST');
  const early = await writer.commitDeferred();
  assert.equal(early.status, 'REJECTED');
  if (early.status === 'REJECTED') {
    assert.equal(early.rejection.code, 'DEVICE_NOT_INTEGRATED');
  }
  assert.equal(writer.status().preparedTick, WORLD_FIXTURE.captureTick);

  const integrated = writer.integrateRecovery();
  assert.equal(integrated.device, 'INTEGRATED');
  assert.equal(integrated.deviceLossReason, null);

  const deferred = await writer.commitDeferred();
  assert.equal(deferred.status, 'COMMITTED');
  if (deferred.status === 'COMMITTED') {
    assert.equal(deferred.capture.device, 'RAM');
    assert.equal(deferred.commitMs, 4);
  }
  assert.equal(writer.status().lastCommit?.device, 'RAM');
  assert.equal(writer.status().lastCommit?.checksum, capture.checksum);
  assert.equal((writer.status().lastCommit?.bytes ?? 0) > capture.bytes, true);
  assert.equal(writer.status().preparedTick, null);

  const loaded = await loadLatestWorldCheckpoint(repository, WORLD_SESSION, {
    versions: WORLD_VERSIONS,
  });
  assert.equal(loaded.status, 'RESUMABLE');
  repository.close();
});

test('206 an incompatible engine, physics or map version is explicit', async () => {
  const origin = createOrigin();
  const { repository, writer } = await writerTab(origin);
  const world = worldAt(WORLD_FIXTURE.captureTick);
  const capture = prepared(writer.captureAtTick(worldSource(world), identity(1)));
  await writer.commitCapture(capture);

  const incompatible = await loadLatestWorldCheckpoint(repository, WORLD_SESSION, {
    versions: { ...WORLD_VERSIONS, physicsVersion: 'rapier-0.22.0' },
  });
  assert.equal(incompatible.status, 'INCOMPATIBLE');
  if (incompatible.status === 'INCOMPATIBLE') {
    assert.equal(incompatible.reason, 'INCOMPATIBLE_VERSION');
    assert.equal(
      incompatible.detail,
      'physicsVersion: stored rapier-0.21.0, current rapier-0.22.0',
    );
    assert.equal(incompatible.stored.mapVersion, 'provisional-v1');
    assert.equal(incompatible.current.physicsVersion, 'rapier-0.22.0');
    assert.equal(incompatible.tick, WORLD_FIXTURE.captureTick);
  }

  const aged = await loadLatestWorldCheckpoint(repository, WORLD_SESSION, {
    versions: WORLD_VERSIONS,
    currentTick: WORLD_FIXTURE.captureTick + 15,
  });
  assert.equal(aged.status, 'RESUMABLE');
  if (aged.status === 'RESUMABLE') assert.equal(aged.ageTicks, 15);

  const empty = await loadLatestWorldCheckpoint(repository, 'session-without-checkpoints', {
    versions: WORLD_VERSIONS,
  });
  assert.equal(empty.status, 'EMPTY');
  repository.close();
});

test('206 the envelope and the snapshot must agree on tick, profile and epoch', async () => {
  const origin = createOrigin();
  const { repository, writer } = await writerTab(origin);
  const world = worldAt(WORLD_FIXTURE.captureTick);
  const capture = prepared(writer.captureAtTick(worldSource(world), identity(1)));

  const envelope = {
    schemaVersion: 1 as const,
    checkpointId: 'checkpoint-tick',
    sessionId: 'session-tick',
    profileId: WORLD_FIXTURE.profileId,
    worldEpoch: WORLD_FIXTURE.worldEpoch,
    tick: WORLD_FIXTURE.captureTick + 1,
    generation: 1,
    learningEpoch: WORLD_FIXTURE.learningEpoch,
    engineVersion: WORLD_VERSIONS.engineVersion,
    physicsVersion: WORLD_VERSIONS.physicsVersion,
    mapVersion: WORLD_VERSIONS.mapVersion,
    createdAt: WORLD_CAPTURED_AT,
    body: capture.body,
  };
  const written = await repository.putCheckpoint(envelope);
  assert.equal(written.status, 'COMMITTED');
  const tickMismatch = await loadLatestWorldCheckpoint(repository, 'session-tick', {
    versions: WORLD_VERSIONS,
  });
  assert.equal(tickMismatch.status, 'REJECTED');
  if (tickMismatch.status === 'REJECTED') {
    assert.equal(tickMismatch.rejection.code, 'TICK_MISMATCH');
  }

  await repository.putCheckpoint({
    ...envelope,
    checkpointId: 'checkpoint-profile',
    sessionId: 'session-profile',
    profileId: 'profile-9',
    tick: WORLD_FIXTURE.captureTick,
  });
  const profileMismatch = await loadLatestWorldCheckpoint(repository, 'session-profile', {
    versions: WORLD_VERSIONS,
  });
  assert.equal(profileMismatch.status, 'REJECTED');
  if (profileMismatch.status === 'REJECTED') {
    assert.equal(profileMismatch.rejection.code, 'PROFILE_MISMATCH');
  }

  await repository.putCheckpoint({
    ...envelope,
    checkpointId: 'checkpoint-epoch',
    sessionId: 'session-epoch',
    learningEpoch: WORLD_FIXTURE.learningEpoch + 1,
    tick: WORLD_FIXTURE.captureTick,
  });
  const epochMismatch = await loadLatestWorldCheckpoint(repository, 'session-epoch', {
    versions: WORLD_VERSIONS,
  });
  assert.equal(epochMismatch.status, 'REJECTED');
  if (epochMismatch.status === 'REJECTED') {
    assert.equal(epochMismatch.rejection.code, 'LEARNING_EPOCH_MISMATCH');
  }

  const tamperedBody = JSON.parse(JSON.stringify(capture.body)) as Record<string, unknown>;
  tamperedBody.tick = WORLD_FIXTURE.captureTick + 1;
  await repository.putCheckpoint({
    ...envelope,
    checkpointId: 'checkpoint-checksum',
    sessionId: 'session-checksum',
    body: tamperedBody,
  });
  const checksumMismatch = await loadLatestWorldCheckpoint(repository, 'session-checksum', {
    versions: WORLD_VERSIONS,
  });
  assert.equal(checksumMismatch.status, 'REJECTED');
  if (checksumMismatch.status === 'REJECTED') {
    assert.equal(checksumMismatch.rejection.code, 'CHECKSUM_MISMATCH');
  }
  repository.close();
});

test('206 cost attribution separates the synchronous copy, the encoding and the commit', async () => {
  const origin = createOrigin();
  const { repository, writer } = await writerTab(origin);
  const world = worldAt(WORLD_FIXTURE.captureTick);
  const result = writer.captureAtTick(worldSource(world), identity(1));
  const capture = prepared(result);
  assert.equal(capture.captureMs, 2.5);
  assert.equal(capture.encodeMs, 7);

  const commit = await writer.commitCapture(capture);
  assert.equal(commit.status, 'COMMITTED');
  if (commit.status === 'COMMITTED') {
    assert.equal(commit.commitMs, 6);
    assert.equal(commit.value.bodyBytes, capture.bytes);
  }

  const report = await import('./world-checkpoint-report');
  const cost = await report.measureWorldCheckpointCosts(3);
  assert.equal(cost.sampleCount, 3);
  assert.equal(cost.bytes > 0, true);
  for (const sample of [cost.captureMs, cost.encodeMs, cost.commitMs, cost.totalMs]) {
    assert.equal(sample.min >= 0, true);
    assert.equal(sample.median >= sample.min, true);
    assert.equal(sample.max >= sample.median, true);
  }
  repository.close();
});

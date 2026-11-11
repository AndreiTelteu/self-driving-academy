import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXPERIMENT_REPLAY_SOURCE,
  EXPERIMENT_REPLAY_VERSION,
  createExperimentReplay,
  experimentReplayAbsenceReasons,
  experimentReplayImmutableCoverage,
  experimentReplayImmutableFacts,
  experimentReplayRejectionCodes,
} from '../../src/experiments';
import type {
  ExperimentReplayChunkView,
  ExperimentReplayPlayer,
  ExperimentReplayReady,
  ExperimentReplayResult,
} from '../../src/experiments';
import { canonicalizeJson } from '../../src/persistence';
import {
  computeWorldReplayChunkChecksum,
  interpolateReplayPose,
  readReplaySample,
  readWorldReplayChunk,
} from '../../src/replay';
import type { WorldReplayChunk } from '../../src/replay';
import {
  CREATED_ENTITY,
  REMOVED_ENTITY,
  REPLAY_FIXTURE,
  createReplayIsolation,
  createReplaySource,
  createReplaySourcePort,
} from './experiment-replay-fixture';
import type { ReplayIsolationHarness, ReplaySourceFixture } from './experiment-replay-fixture';

/**
 * Compile-time compatibility between the real 207 chunk and the structural view 141 projects. If a
 * field 141 reads is renamed or retyped in `src/replay`, this assertion stops compiling instead of
 * letting the projector drift silently.
 */
type ChunkViewIsCompatible = WorldReplayChunk extends ExperimentReplayChunkView ? true : never;
const chunkViewIsCompatible: ChunkViewIsCompatible = true;

interface Setup {
  readonly source: ReplaySourceFixture;
  readonly isolation: ReplayIsolationHarness;
  readonly ready: ExperimentReplayReady;
  readonly player: ExperimentReplayPlayer;
}

function create(source?: unknown, isolation?: ReplayIsolationHarness): Setup {
  const fixture = createReplaySource();
  const harness = isolation ?? createReplayIsolation();
  const result: ExperimentReplayResult = createExperimentReplay(
    {
      experimentId: REPLAY_FIXTURE.experimentId,
      source: source ?? fixture.chunk,
      expectedSessionId: REPLAY_FIXTURE.sessionId,
      expectedWorldEpoch: REPLAY_FIXTURE.worldEpoch,
      isolation: harness.port,
    },
    createReplaySourcePort(),
  );
  assert.equal(result.status, 'READY', JSON.stringify(result).slice(0, 400));
  if (result.status !== 'READY') throw new Error('141 replay was refused');
  return Object.freeze({
    source: fixture,
    isolation: harness,
    ready: result,
    player: result.player,
  });
}

/** Re-signs a chunk so a deliberately changed payload is still a valid 207 document. */
function resign(chunk: WorldReplayChunk): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...chunk };
  delete payload.checksum;
  delete payload.bytes;
  const canonical = canonicalizeJson(payload, { maxDepth: 24 });
  if (canonical.status === 'REJECTED') throw new Error(canonical.rejection.message);
  return {
    ...payload,
    bytes: new TextEncoder().encode(canonical.text).length,
    checksum: computeWorldReplayChunkChecksum(payload),
  };
}

function codeOf(result: ExperimentReplayResult): string {
  return result.status === 'REFUSED' ? `${result.stage}/${result.codes.join(',')}` : 'READY';
}

test('141 source: the real 207 chunk is re-read, not trusted, and its view stays compatible', () => {
  const setup = create();
  const read = readWorldReplayChunk(setup.source.chunk);
  assert.equal(read.status, 'ACCEPTED');
  assert.equal(chunkViewIsCompatible, true);
  assert.equal(setup.ready.source.checksum, setup.source.chunk.checksum);
  assert.equal(setup.ready.source.bytes, setup.source.chunk.bytes);
  assert.equal(setup.ready.source.chunkId, setup.source.incidentId);
  assert.equal(setup.ready.source.completeness.status, 'COMPLETE');
  assert.equal(setup.ready.source.completeness.declaredPartial, false);
  assert.equal(setup.ready.source.camera.filterApplied, false);
  assert.equal(setup.ready.source.sampling.cadenceTicks, 3);
  assert.equal(setup.ready.source.sampling.observedTicksOnly, true);
  assert.equal(setup.ready.source.sampling.physicsFidelity, false);
  assert.equal(setup.ready.source.learning.producesArtifacts, false);
  assert.deepEqual(EXPERIMENT_REPLAY_SOURCE, {
    chunk: '207-world-replay-chunk-v1',
    anchor: '206-world-snapshot-v1',
  });
  assert.equal(setup.ready.version, EXPERIMENT_REPLAY_VERSION);
});

test('141 incident: an AUTO-only collision between vehicles the camera never sees', () => {
  const { ready } = create();
  const incident = ready.player.incident;
  assert.equal(incident.kind, 'COLLISION');
  assert.equal(incident.autoOnly, true);
  assert.deepEqual(incident.controlModes, ['AUTO', 'AUTO']);
  assert.equal(incident.visibility, 'OUTSIDE_CAMERA');
  assert.equal(incident.outsideCamera, true);
  assert.equal(incident.invisible, true);
  assert.equal(incident.tick, REPLAY_FIXTURE.incidentTick);
  assert.equal(incident.classifiedFromTick, 399);
  assert.deepEqual(
    incident.entities.map((entity) => [entity.entityId, entity.controlMode, entity.inCamera]),
    [
      ['taxi-02', 'AUTO', false],
      ['taxi-03', 'AUTO', false],
    ],
  );

  /* The lifecycle of the window is exact, not inferred from a missing row. */
  assert.deepEqual(
    incident.createdInWindow.map((fact) => [fact.entityId, fact.tick, fact.kind, fact.inferred]),
    [[CREATED_ENTITY, REPLAY_FIXTURE.createdTick, 'CREATED', false]],
  );
  assert.deepEqual(
    incident.removedInWindow.map((fact) => [fact.entityId, fact.tick, fact.kind, fact.inferred]),
    [[REMOVED_ENTITY, REPLAY_FIXTURE.removedTick, 'REMOVED', false]],
  );
  assert.equal(
    incident.entities.find((entity) => entity.entityId === CREATED_ENTITY),
    undefined,
    'the created civilian is not one of the colliding entities',
  );

  /* The declaration is structural: a projection never re-runs the policy or the physics step. */
  assert.equal(ready.player.declaration.projectsRecordedStates, true);
  assert.equal(ready.player.declaration.rerunsPolicy, false);
  assert.equal(ready.player.declaration.recalculatesPhysics, false);
  assert.equal(ready.player.declaration.inventsUnobservedTicks, false);
  assert.equal(ready.player.declaration.writesLiveState, false);
});

test('141 seek: the incident seek lands on the last recorded row and reports what is missing', () => {
  const { player, source } = create();
  const seek = player.seek();
  assert.equal(seek.status, 'SEEKED');
  assert.equal(seek.requestedTick, REPLAY_FIXTURE.incidentTick);
  /* 400 is not on the declared 20 Hz cadence; the last observed row is 399 and 400 is declared. */
  assert.equal(seek.landedTick, 399);
  assert.equal(seek.exact, false);
  assert.equal(seek.atIncident, true);
  assert.deepEqual(seek.span, {
    fromTick: 340,
    toTick: 520,
    storedFromTick: 340,
    storedToTick: 520,
    incidentTick: 400,
  });
  assert.deepEqual(
    seek.missing.map((entry) => [entry.reason, entry.fromTick, entry.toTick]),
    [['TICK_NOT_OBSERVED', 400, 400]],
  );
  assert.equal(seek.position?.tick, 399);
  assert.equal(seek.position?.atIncident, true);
  assert.equal(seek.position?.observedTicks, 60);
  assert.equal(seek.position?.firstObservedTick, 342);
  assert.equal(seek.position?.lastObservedTick, 519);
  assert.equal(readReplaySample(source.chunk, REPLAY_FIXTURE.incidentTick), null);
  assert.equal(player.frame().tick, 399);

  /* An in-window target that is observed lands exactly on it. */
  const exact = player.seek(405);
  assert.equal(exact.exact, true);
  assert.equal(exact.landedTick, 405);
  assert.deepEqual(exact.missing, []);
  assert.equal(exact.position?.atIncident, false);
});

test('141 seek: a target outside the stored window is refused and nothing moves', () => {
  const { player } = create();
  const start = player.position();
  const refused = player.seek(1_000);
  assert.equal(refused.status, 'REFUSED');
  assert.equal(refused.code, 'SEEK_OUT_OF_WINDOW');
  assert.equal(refused.landedTick, null);
  assert.equal(refused.position, null);
  assert.deepEqual(player.position(), start);
  assert.equal(refused.isolation.unchanged, true);
});

test('141 pause: freezing changes the flag and nothing else, and play stays frozen', () => {
  const { player } = create();
  player.seek(399);
  const before = player.position();
  const frame = player.frame();
  const paused = player.pause();
  assert.equal(paused.status, 'PAUSED');
  assert.equal(paused.frame.tick, frame.tick);
  assert.deepEqual(paused.frame, frame);
  assert.deepEqual(paused.position, { ...before, paused: true });
  assert.equal(paused.isolation.unchanged, true);

  const frozen = player.play();
  assert.equal(frozen.status, 'PAUSED');
  assert.equal(frozen.advancedTicks, 0);
  assert.deepEqual(frozen.frame, frame);
  assert.deepEqual(frozen.position, { ...before, paused: true });

  const resumed = player.resume();
  assert.equal(resumed.status, 'RESUMED');
  assert.equal(resumed.position.paused, false);
  assert.deepEqual(resumed.frame, frame);
  assert.equal(resumed.position.tick, before.tick);

  /* Nothing but the flag moved: the next step is exactly the next recorded row. */
  const step = player.play();
  assert.equal(step.status, 'ADVANCED');
  assert.equal(step.frame.tick, 402);
  assert.equal(step.advancedTicks, 3);
});

test('141 removed vehicle: it stays removed with its exact tick and is never resurrected', () => {
  const { player, ready } = create();
  const removal = ready.player.incident.removedInWindow.find(
    (fact) => fact.entityId === REMOVED_ENTITY,
  );
  assert.equal(removal?.tick, REPLAY_FIXTURE.removedTick);
  assert.equal(removal?.kind, 'REMOVED');

  const atRemoval = player.seek(405);
  assert.equal(atRemoval.exact, true);
  assert.equal(
    player.frame().vehicles.some((vehicle) => vehicle.entityId === REMOVED_ENTITY),
    true,
    'the vehicle is still present on the row before its removal',
  );

  /* The removal tick is between two observed rows: interpolation must not revive the vehicle. */
  const pose = player.poseAt(REPLAY_FIXTURE.removedTick, REMOVED_ENTITY);
  assert.equal(pose.status, 'ABSENT');
  if (pose.status === 'ABSENT') {
    assert.equal(pose.reason, 'ENTITY_REMOVED');
    assert.match(pose.detail, /removed at tick 406/);
  }

  const after = player.play();
  assert.equal(after.frame.tick, 408);
  assert.equal(
    after.frame.vehicles.some((vehicle) => vehicle.entityId === REMOVED_ENTITY),
    false,
    'the next frame no longer carries the removed vehicle',
  );
  assert.deepEqual(after.frame.removed, []);

  /* A replay across the whole window never re-adds it after the removal tick. */
  player.seek(399);
  const run = player.replay();
  const resurrected = run.frames.filter(
    (frame) =>
      frame.tick > REPLAY_FIXTURE.removedTick &&
      frame.vehicles.some((vehicle) => vehicle.entityId === REMOVED_ENTITY),
  );
  assert.equal(resurrected.length, 0);
  assert.equal(
    run.frames.some((frame) => frame.tick === 405),
    true,
  );
  assert.equal(ready.player.incident.removedInWindow[0]?.tick, REPLAY_FIXTURE.removedTick);
});

test('141 removed vehicle: a stale sample row cannot override the removal fact', () => {
  const setup = create();
  const slot = setup.source.chunk.tables.entities.find(
    (entity) => entity.entityId === REMOVED_ENTITY,
  )?.slot;
  assert.notEqual(slot, undefined);
  const stale = JSON.parse(JSON.stringify(setup.source.chunk)) as unknown as {
    samples: { tick: number; vehicles: number[][] }[];
  };
  const row = stale.samples
    .find((sample) => sample.tick === 405)
    ?.vehicles.find((vehicle) => vehicle[0] === slot);
  assert.notEqual(row, undefined);
  const after = stale.samples.find((sample) => sample.tick === 408);
  assert.notEqual(after, undefined);
  after?.vehicles.push(row ?? []);

  const staleSetup = create(resign(stale as unknown as WorldReplayChunk), createReplayIsolation());
  staleSetup.player.seek(408);
  assert.equal(
    staleSetup.player.frame().vehicles.some((vehicle) => vehicle.entityId === REMOVED_ENTITY),
    false,
    'the removal fact of 207 wins over a row that survived into the sample',
  );
});

test('141 created vehicle: it does not exist before its creation tick', () => {
  const { player } = create();
  const seek = player.seek(REPLAY_FIXTURE.createdTick - 2);
  assert.equal(seek.exact, true);
  assert.equal(
    player.frame().vehicles.some((vehicle) => vehicle.entityId === CREATED_ENTITY),
    false,
  );
  const before = player.poseAt(REPLAY_FIXTURE.createdTick - 1, CREATED_ENTITY);
  assert.equal(before.status, 'ABSENT');
  if (before.status === 'ABSENT') assert.equal(before.reason, 'ENTITY_NOT_YET_CREATED');

  const step = player.play();
  assert.equal(step.frame.tick, REPLAY_FIXTURE.createdTick + 1);
  assert.equal(
    step.frame.vehicles.some((vehicle) => vehicle.entityId === CREATED_ENTITY),
    true,
    'the first observed row after the creation tick carries the new vehicle',
  );
  const pose = player.poseAt(REPLAY_FIXTURE.createdTick + 1, CREATED_ENTITY);
  assert.equal(pose.status, 'OBSERVED');
});

test('141 created vehicle: a re-created entity is drawn again only from its new creation tick', () => {
  const setup = create();
  const slot = setup.source.chunk.tables.entities.find(
    (entity) => entity.entityId === REMOVED_ENTITY,
  )?.slot;
  assert.notEqual(slot, undefined);
  const mutable = JSON.parse(JSON.stringify(setup.source.chunk)) as unknown as {
    lifecycle: { created: unknown[]; removed: unknown[] };
    samples: { tick: number; vehicles: number[][] }[];
  };
  const row = mutable.samples
    .find((sample) => sample.tick === 405)
    ?.vehicles.find((vehicle) => vehicle[0] === slot);
  assert.notEqual(row, undefined);
  for (const tick of [414, 417]) {
    const sample = mutable.samples.find((entry) => entry.tick === tick);
    assert.notEqual(sample, undefined);
    sample?.vehicles.push([...(row ?? [])]);
  }
  mutable.lifecycle.created.push({
    tick: 412,
    kind: 'CREATED',
    entityId: REMOVED_ENTITY,
    vehicleClass: 'CIVILIAN',
    inferred: false,
  });
  const recreated = create(resign(mutable as unknown as WorldReplayChunk), createReplayIsolation());
  const between = recreated.player.poseAt(409, REMOVED_ENTITY);
  assert.equal(between.status, 'ABSENT');
  if (between.status === 'ABSENT') assert.equal(between.reason, 'ENTITY_REMOVED');
  const after = recreated.player.seek(414);
  assert.equal(after.exact, true);
  assert.equal(
    recreated.player.frame().vehicles.some((vehicle) => vehicle.entityId === REMOVED_ENTITY),
    true,
    'a later creation fact brings the entity back from its own tick',
  );
});

test('141 partial window: a clip sealed early is declared, never presented whole', () => {
  const setup = create(undefined);
  const partial = createReplaySource().partial;
  const result = createExperimentReplay(
    {
      experimentId: REPLAY_FIXTURE.experimentId,
      source: partial,
      expectedSessionId: REPLAY_FIXTURE.sessionId,
      expectedWorldEpoch: REPLAY_FIXTURE.worldEpoch,
      isolation: createReplayIsolation().port,
    },
    createReplaySourcePort(),
  );
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;
  assert.equal(result.source.completeness.status, 'PARTIAL');
  assert.equal(result.source.completeness.declaredPartial, true);
  assert.equal(result.source.completeness.reasons.includes('CAPTURE_FINALIZED_EARLY'), true);
  assert.equal(result.source.endTick, REPLAY_FIXTURE.partialSealTick);
  assert.equal(result.position.span.toTick, 520);
  assert.equal(result.position.span.storedToTick, REPLAY_FIXTURE.partialSealTick);
  const truncated = result.position.missing.find(
    (entry) => entry.reason === 'WINDOW_TRUNCATED_AFTER',
  );
  assert.deepEqual(
    truncated === undefined ? null : [truncated.fromTick, truncated.toTick],
    [431, 520],
  );

  const seek = result.player.seek();
  assert.equal(seek.landedTick, 399);
  assert.equal(seek.status, 'SEEKED');
  assert.equal(
    seek.missing.some((entry) => entry.fromTick === 400 && entry.toTick === 400),
    true,
  );
  assert.equal(setup.ready.source.completeness.status, 'COMPLETE');
});

test('141 gap: an unrecorded cadence span is declared instead of interpolated', () => {
  const gapSource = createReplaySource().gap;
  const result = createExperimentReplay(
    {
      experimentId: REPLAY_FIXTURE.experimentId,
      source: gapSource,
      expectedSessionId: REPLAY_FIXTURE.sessionId,
      expectedWorldEpoch: REPLAY_FIXTURE.worldEpoch,
      isolation: createReplayIsolation().port,
    },
    createReplaySourcePort(),
  );
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;
  assert.equal(result.source.completeness.status, 'PARTIAL');
  const gap = result.position.missing.find((entry) => entry.reason === 'TICK_NOT_OBSERVED');
  assert.notEqual(gap, undefined);
  assert.deepEqual([gap?.fromTick, gap?.toTick], [441, 468]);

  const player = result.player;
  const seek = player.seek(438);
  assert.equal(seek.exact, true);
  const step = player.play();
  assert.equal(step.status, 'ADVANCED');
  assert.equal(step.frame.tick, 471);
  assert.deepEqual(
    step.skipped.map((entry) => [entry.reason, entry.fromTick, entry.toTick]),
    [['TICK_NOT_OBSERVED', 441, 468]],
  );
  assert.equal(
    step.frame.missing.some((entry) => entry.fromTick === 441),
    true,
    'the frame declares the gap it skipped',
  );
  const inside = player.poseAt(455, 'taxi-01');
  assert.equal(inside.status, 'ABSENT');
  if (inside.status === 'ABSENT') assert.equal(inside.reason, 'TICK_NOT_OBSERVED');
});

test('141 pose: interpolation happens only between adjacent recorded rows and matches 207', () => {
  const { player, source } = create();
  const from = readReplaySample(source.chunk, 399);
  const to = readReplaySample(source.chunk, 402);
  assert.notEqual(from, null);
  assert.notEqual(to, null);
  if (from === null || to === null) return;
  const alpha = 1 / 3;
  const expected = interpolateReplayPose(from, to, 'taxi-01', alpha);
  const pose = player.poseAt(400, 'taxi-01');
  assert.equal(pose.status, 'INTERPOLATED');
  if (pose.status !== 'INTERPOLATED' || expected === null) return;
  assert.equal(pose.fromTick, 399);
  assert.equal(pose.toTick, 402);
  assert.equal(pose.alpha, alpha);
  assert.deepEqual(pose.position, expected.position);
  assert.deepEqual(pose.rotation, expected.rotation);
  assert.equal(pose.interpolation, 'LINEAR');
});

test('141 immutability: seek, pause, resume and replay leave every live fact untouched', () => {
  const isolation = createReplayIsolation();
  const before = isolation.fingerprint();
  const profileBefore = isolation.identity();
  const { player } = create(undefined, isolation);
  player.seek(399);
  player.pause();
  player.resume();
  player.seek(405);
  player.play();
  player.replay();

  const verification = player.isolation();
  assert.deepEqual(verification.facts, ['profile', 'revenue', 'ratings', 'missions', 'xp']);
  assert.deepEqual(verification.coverage, experimentReplayImmutableCoverage);
  assert.deepEqual(verification.changed, []);
  assert.equal(verification.unchanged, true);
  assert.equal(verification.liveWrites, 0);
  assert.deepEqual(
    verification.checks.map((check) => check.operation),
    ['SEEK', 'PAUSE', 'RESUME', 'SEEK', 'PLAY', 'REPLAY'],
  );
  for (const check of verification.checks) {
    assert.deepEqual(check.ledgerBefore, check.ledgerAfter);
    assert.deepEqual(check.profileBefore, check.profileAfter);
    assert.equal(check.unchanged, true);
    assert.equal(check.liveWrites, 0);
  }
  assert.deepEqual(isolation.fingerprint(), before);
  assert.deepEqual(isolation.identity(), profileBefore);

  /* Control probes: the fingerprint is derived from the live rows, so a real write changes it. */
  isolation.writeRevenue('ride-141-control', 500);
  const afterRevenue = isolation.fingerprint();
  assert.notEqual(afterRevenue.kpi, before.kpi);
  assert.equal(afterRevenue.rewards, before.rewards);
  assert.equal(afterRevenue.learning, before.learning);
  isolation.activateProfile('profile-141@2', { speed: 13, laneChange: 0.5 });
  assert.notEqual(isolation.identity().checksum, profileBefore.checksum);
  assert.equal(isolation.identity().versionId, 'profile-141@2');
});

test('141 immutability: a live write during the replay is detected per operation', () => {
  const isolation = createReplayIsolation();
  const { player } = create(undefined, isolation);
  assert.equal(player.seek(399).isolation.unchanged, true);
  isolation.writeRevenue('ride-141-late', 480);
  const paused = player.pause();
  assert.equal(paused.isolation.unchanged, false);
  assert.deepEqual(paused.isolation.changed, ['KPI']);
  assert.equal(player.isolation().unchanged, false);
  assert.deepEqual(player.isolation().changed, ['KPI']);
  assert.equal(player.isolation().liveWrites, 0);
});

test('141 refusal: an invalid source is refused before any projection', () => {
  const fixture = createReplaySource();
  const ports = createReplaySourcePort();
  const harness = createReplayIsolation();
  const base = {
    experimentId: REPLAY_FIXTURE.experimentId,
    expectedSessionId: REPLAY_FIXTURE.sessionId,
    expectedWorldEpoch: REPLAY_FIXTURE.worldEpoch,
    isolation: harness.port,
  };

  const checksum = createExperimentReplay(
    { ...base, source: { ...fixture.chunk, checksum: 'f'.repeat(64) } },
    ports,
  );
  assert.equal(codeOf(checksum), 'SOURCE/CHECKSUM_MISMATCH');

  const version = createExperimentReplay(
    { ...base, source: { ...fixture.chunk, chunkVersion: '207-world-replay-chunk-v0' } },
    ports,
  );
  assert.equal(codeOf(version), 'SOURCE/INVALID_SOURCE');

  const unpinned = createExperimentReplay(
    { ...base, source: { ...fixture.chunk, pinned: false } },
    ports,
  );
  assert.equal(codeOf(unpinned), 'SOURCE/INVALID_SOURCE');

  const foreign = createExperimentReplay(
    { ...base, source: resign({ ...fixture.chunk, sessionId: 'session-other' }) },
    ports,
  );
  assert.equal(codeOf(foreign), 'IDENTITY/FOREIGN_SOURCE');

  const otherEpoch = createExperimentReplay(
    { ...base, source: resign({ ...fixture.chunk, worldEpoch: 2 }) },
    ports,
  );
  assert.equal(codeOf(otherEpoch), 'IDENTITY/FOREIGN_SOURCE');

  const request = createExperimentReplay({ experimentId: '' } as never, ports);
  assert.equal(codeOf(request), 'REQUEST/INVALID_REQUEST');

  const outOfWindow = createExperimentReplay(
    { ...base, source: fixture.chunk, seekTick: 2_000 },
    ports,
  );
  assert.equal(codeOf(outOfWindow), 'SEEK/SEEK_OUT_OF_WINDOW');

  /* A refused source never yields a player, and the live ledgers are untouched by the attempt. */
  assert.equal('player' in checksum, false);
  assert.deepEqual(harness.fingerprint(), harness.fingerprint());
});

test('141 contract: the projection is deterministic and its absence vocabulary is closed', () => {
  const first = create();
  const second = create();
  const left = first.player.seek(399);
  const right = second.player.seek(399);
  assert.deepEqual(left.position, right.position);
  assert.deepEqual(first.player.frame(), second.player.frame());
  assert.deepEqual(experimentReplayAbsenceReasons, [
    'TICK_NOT_OBSERVED',
    'WINDOW_TRUNCATED_BEFORE',
    'WINDOW_TRUNCATED_AFTER',
    'ENTITY_NOT_YET_CREATED',
    'ENTITY_REMOVED',
    'ENTITY_UNKNOWN',
    'ENTITY_NOT_OBSERVED',
    'OUT_OF_WINDOW',
  ]);
  assert.deepEqual(experimentReplayRejectionCodes, [
    'INVALID_REQUEST',
    'INVALID_SOURCE',
    'CHECKSUM_MISMATCH',
    'FOREIGN_SOURCE',
    'INCIDENT_OUTSIDE_WINDOW',
    'SEEK_OUT_OF_WINDOW',
    'SOURCE_EMPTY',
  ]);
  assert.deepEqual(experimentReplayImmutableFacts, [
    'profile',
    'revenue',
    'ratings',
    'missions',
    'xp',
  ]);
  const frame = first.player.frame();
  assert.equal(Object.isFrozen(frame), true);
  assert.equal(Object.isFrozen(frame.vehicles), true);
  const run = first.player.replay();
  assert.equal(Object.isFrozen(run.frames), true);
  /* Replaying twice yields the same rows: the source is read, never mutated. */
  first.player.seek(399);
  assert.deepEqual(first.player.replay().frames, run.frames);
});

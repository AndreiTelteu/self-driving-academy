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
  ExperimentReplayAbsence,
  ExperimentReplayIsolationCheck,
  ExperimentReplayPlayer,
  ExperimentReplayReady,
  ExperimentReplayRejectionCode,
  ExperimentReplayResult,
  ExperimentReplayStage,
} from '../../src/experiments';
import { canonicalizeJson } from '../../src/persistence';
import {
  computeWorldReplayChunkChecksum,
  interpolateReplayPose,
  readReplaySample,
} from '../../src/replay';
import type { WorldReplayChunk } from '../../src/replay';
import {
  CREATED_ENTITY,
  REMOVED_ENTITY,
  REPLAY_FIXTURE,
  REPLAY_GAP,
  createReplayIsolation,
  createReplaySource,
  createReplaySourcePort,
} from './experiment-replay-fixture';
import type { ReplayIsolationHarness } from './experiment-replay-fixture';

/**
 * Deterministic evidence transcript for PBI 141.
 *
 * Everything below is measured on the real 207 chunk produced by the recorder, projected by the real
 * 141 module: the seek landing, the declared absences, the frames, the lifecycle of the created and
 * removed vehicles, the interpolated pose compared with 207's own helper, and the immutable
 * fingerprints of the live profile and ledgers. There is no wall clock, no random value and no
 * machine-local measurement, so `--check` compares the transcript byte for byte.
 */

/** Pinned fingerprint of the fixture chunk; a change in the 207 output shows up here immediately. */
const PINNED = Object.freeze({
  checksum: 'ff37f798e578fc928ef6d5660613843ff51e639b2bbea8349bc86692a4ded218',
  bytes: 129377,
  observedTicks: 60,
  gapMissingFrom: 441,
  gapMissingTo: 468,
});

export interface ExperimentReplayCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ExperimentReplayRefusalProbe {
  readonly probe: string;
  readonly stage: ExperimentReplayStage;
  readonly codes: readonly ExperimentReplayRejectionCode[];
  readonly detail: string;
}

export interface ExperimentReplayEvidenceReport {
  readonly version: typeof EXPERIMENT_REPLAY_VERSION;
  readonly contract: Readonly<{
    source: typeof EXPERIMENT_REPLAY_SOURCE;
    rejectionCodes: typeof experimentReplayRejectionCodes;
    absenceReasons: typeof experimentReplayAbsenceReasons;
    immutableFacts: typeof experimentReplayImmutableFacts;
    immutableCoverage: typeof experimentReplayImmutableCoverage;
    tickHz: number;
    sampleHz: number;
    cadenceTicks: number;
  }>;
  readonly source: Readonly<{
    chunkId: string;
    checksum: string;
    bytes: number;
    startTick: number;
    endTick: number;
    sealTick: number;
    windowFromTick: number;
    windowToTick: number;
    incidentTick: number;
    completeness: string;
    partialReasons: readonly string[];
    observedTicks: number;
    firstObservedTick: number;
    lastObservedTick: number;
    cameraRecordedVehicles: number;
    cameraOutOfCameraVehicles: number;
  }>;
  readonly incident: Readonly<{
    autoOnly: boolean;
    visibility: string;
    invisible: boolean;
    classifiedFromTick: number | null;
    entities: readonly {
      readonly entityId: string;
      readonly vehicleClass: string;
      readonly controlMode: string;
      readonly inCamera: boolean | null;
    }[];
    createdInWindow: readonly { readonly entityId: string; readonly tick: number }[];
    removedInWindow: readonly { readonly entityId: string; readonly tick: number }[];
  }>;
  readonly seek: Readonly<{
    requestedTick: number;
    landedTick: number | null;
    exact: boolean;
    atIncident: boolean;
    missing: readonly ExperimentReplayAbsence[];
  }>;
  readonly pause: Readonly<{
    status: string;
    tickBefore: number;
    tickAfter: number;
    frameIdentical: boolean;
    positionIdentical: boolean;
    playWhilePausedStatus: string;
  }>;
  readonly lifecycle: Readonly<{
    createdTick: number;
    createdFirstRowTick: number;
    removedTick: number;
    removedPoseAtRemoval: string;
    resurrectedFrames: number;
    presentOnRowBefore: boolean;
    absentAfterRemoval: boolean;
  }>;
  readonly replay: Readonly<{
    frames: number;
    ticks: number;
    firstTick: number;
    lastTick: number;
    declaredAbsences: number;
  }>;
  readonly partial: Readonly<{
    completeness: string;
    declaredPartial: boolean;
    reasons: readonly string[];
    storedEndTick: number;
    declaredFromTick: number;
    declaredToTick: number;
  }>;
  readonly gap: Readonly<{
    completeness: string;
    gapFromTick: number;
    gapToTick: number;
    skipped: readonly ExperimentReplayAbsence[];
    poseAtGap: string;
  }>;
  readonly interpolation: Readonly<{
    tick: number;
    fromTick: number;
    toTick: number;
    alpha: number;
    matches207: boolean;
    interpolation: string;
  }>;
  readonly immutability: Readonly<{
    operations: readonly string[];
    unchanged: boolean;
    liveWrites: number;
    changed: readonly string[];
    profileChecksum: string;
    learning: string;
    rewards: string;
    kpi: string;
    checks: readonly ExperimentReplayIsolationCheck[];
    revenueWriteChangesKpiOnly: boolean;
    profileActivationChangesChecksum: boolean;
  }>;
  readonly refusals: readonly ExperimentReplayRefusalProbe[];
  readonly checks: readonly ExperimentReplayCheck[];
  readonly summary: Readonly<{
    probes: number;
    checks: number;
    passed: number;
    pass: boolean;
  }>;
}

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): ExperimentReplayCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function ready(result: ExperimentReplayResult): ExperimentReplayReady {
  if (result.status !== 'READY') {
    throw new Error(`141 expected a ready replay, got ${JSON.stringify(result).slice(0, 300)}`);
  }
  return result;
}

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

function replayOf(source: unknown, isolation: ReplayIsolationHarness): ExperimentReplayReady {
  return ready(
    createExperimentReplay(
      {
        experimentId: REPLAY_FIXTURE.experimentId,
        source,
        expectedSessionId: REPLAY_FIXTURE.sessionId,
        expectedWorldEpoch: REPLAY_FIXTURE.worldEpoch,
        isolation: isolation.port,
      },
      createReplaySourcePort(),
    ),
  );
}

function runRefusalProbes(): readonly ExperimentReplayRefusalProbe[] {
  const fixture = createReplaySource();
  const isolation = createReplayIsolation();
  const ports = createReplaySourcePort();
  const base = {
    experimentId: REPLAY_FIXTURE.experimentId,
    expectedSessionId: REPLAY_FIXTURE.sessionId,
    expectedWorldEpoch: REPLAY_FIXTURE.worldEpoch,
    isolation: isolation.port,
  };
  const probes: ExperimentReplayRefusalProbe[] = [];
  const record = (probe: string, result: ExperimentReplayResult): void => {
    if (result.status !== 'REFUSED') throw new Error(`141 probe ${probe} was not refused`);
    probes.push(
      Object.freeze({
        probe,
        stage: result.stage,
        codes: result.codes,
        detail: result.detail,
      }),
    );
  };

  record(
    'CHECKSUM_CORRUPTED',
    createExperimentReplay(
      { ...base, source: { ...fixture.chunk, checksum: 'f'.repeat(64) } },
      ports,
    ),
  );
  record(
    'CHUNK_VERSION',
    createExperimentReplay(
      { ...base, source: { ...fixture.chunk, chunkVersion: '207-world-replay-chunk-v0' } },
      ports,
    ),
  );
  record(
    'NOT_PINNED',
    createExperimentReplay({ ...base, source: { ...fixture.chunk, pinned: false } }, ports),
  );
  record(
    'FOREIGN_SESSION',
    createExperimentReplay(
      { ...base, source: resign({ ...fixture.chunk, sessionId: 'session-other' }) },
      ports,
    ),
  );
  record(
    'FOREIGN_EPOCH',
    createExperimentReplay({ ...base, source: resign({ ...fixture.chunk, worldEpoch: 2 }) }, ports),
  );
  record('INVALID_REQUEST', createExperimentReplay({ experimentId: '' } as never, ports));
  record(
    'SEEK_OUT_OF_WINDOW',
    createExperimentReplay({ ...base, source: fixture.chunk, seekTick: 2_000 }, ports),
  );
  return Object.freeze(probes);
}

function poseStatus(player: ExperimentReplayPlayer, tick: number, entityId: string): string {
  const pose = player.poseAt(tick, entityId);
  return pose.status === 'ABSENT' ? `ABSENT/${pose.reason}` : pose.status;
}

export function runExperimentReplayReport(): ExperimentReplayEvidenceReport {
  const fixture = createReplaySource();
  const isolation = createReplayIsolation();
  const setup = replayOf(fixture.chunk, isolation);
  const player = setup.player;
  const source = setup.source;
  const declaration = player.declaration;

  /* The incident seek: default target, exact landing and the declared absence. */
  const seek = player.seek();
  const seekMissing = seek.missing;

  /* Pause: the frame and the position are frozen byte for byte. */
  const frameBeforePause = JSON.stringify(player.frame());
  const positionBeforePause = player.position();
  const paused = player.pause();
  const frameAfterPause = JSON.stringify(player.frame());
  const playWhilePaused = player.play();
  player.resume();

  /* Lifecycle: the created and the removed vehicle, exactly where the source says. */
  const createdFirstRow = player.seek(REPLAY_FIXTURE.createdTick + 1);
  const createdRow = player.frame();
  player.seek(REPLAY_FIXTURE.createdTick - 2);
  const beforeCreation = player.frame();
  const removedSeek = player.seek(REPLAY_FIXTURE.removedTick - 1);
  const rowBeforeRemoval = player.frame();
  const removalPose = poseStatus(player, REPLAY_FIXTURE.removedTick, REMOVED_ENTITY);
  player.seek(seek.landedTick ?? REPLAY_FIXTURE.incidentTick);
  const run = player.replay();
  const resurrected = run.frames.filter(
    (frame) =>
      frame.tick > REPLAY_FIXTURE.removedTick &&
      frame.vehicles.some((vehicle) => vehicle.entityId === REMOVED_ENTITY),
  ).length;
  const absentAfterRemoval =
    player.seek(REPLAY_FIXTURE.removedTick + 2).landedTick !== null &&
    !player.frame().vehicles.some((vehicle) => vehicle.entityId === REMOVED_ENTITY);

  /* Interpolation between two recorded rows, compared with the 207 helper on the same rows. */
  const from = readReplaySample(fixture.chunk, 399);
  const to = readReplaySample(fixture.chunk, 402);
  if (from === null || to === null) throw new Error('141 fixture lost the 399/402 rows');
  const alpha = 1 / 3;
  const expectedPose = interpolateReplayPose(from, to, 'taxi-01', alpha);
  const pose = player.poseAt(400, 'taxi-01');
  if (pose.status !== 'INTERPOLATED' || expectedPose === null) {
    throw new Error('141 fixture pose was not interpolated');
  }
  const matches207 =
    pose.position.x === expectedPose.position.x &&
    pose.position.y === expectedPose.position.y &&
    pose.position.z === expectedPose.position.z &&
    pose.rotation.x === expectedPose.rotation.x &&
    pose.rotation.w === expectedPose.rotation.w;

  /* The partial clip and the capture gap are declared, never presented whole. */
  const partialSetup = replayOf(fixture.partial, createReplayIsolation());
  const partialTruncated = partialSetup.position.missing.find(
    (entry) => entry.reason === 'WINDOW_TRUNCATED_AFTER',
  );
  const gapSetup = replayOf(fixture.gap, createReplayIsolation());
  const gapRange = gapSetup.position.missing.find((entry) => entry.reason === 'TICK_NOT_OBSERVED');
  const gapPlayer = gapSetup.player;
  gapPlayer.seek(438);
  const gapStep = gapPlayer.play();
  const poseAtGap = poseStatus(gapPlayer, 455, 'taxi-01');

  /* Immutability, measured before/after every operation and probed on the live read models. */
  const immutableIsolation = createReplayIsolation();
  const before = immutableIsolation.fingerprint();
  const profileBefore = immutableIsolation.identity();
  const immutableSetup = replayOf(fixture.chunk, immutableIsolation);
  immutableSetup.player.seek();
  immutableSetup.player.pause();
  immutableSetup.player.resume();
  immutableSetup.player.seek(REPLAY_FIXTURE.removedTick - 1);
  immutableSetup.player.play();
  immutableSetup.player.replay();
  const verification = immutableSetup.player.isolation();
  immutableIsolation.writeRevenue('ride-141-control', 500);
  const afterRevenue = immutableIsolation.fingerprint();
  const revenueWriteChangesKpiOnly =
    afterRevenue.kpi !== before.kpi &&
    afterRevenue.rewards === before.rewards &&
    afterRevenue.learning === before.learning;
  immutableIsolation.activateProfile('profile-141@2', { speed: 13, laneChange: 0.5 });
  const profileActivationChangesChecksum =
    immutableIsolation.identity().checksum !== profileBefore.checksum;

  const refusals = runRefusalProbes();

  /* Determinism: a second independent run produces the same transcript. */
  const secondRun = replayOf(createReplaySource().chunk, createReplayIsolation());
  secondRun.player.seek();
  const deterministic =
    JSON.stringify(secondRun.player.replay().frames) === JSON.stringify(run.frames);

  const probe = (name: string): ExperimentReplayRefusalProbe | undefined =>
    refusals.find((entry) => entry.probe === name);
  const operationCodes = verification.checks.map((entry) => entry.operation).join(',');

  const checks: ExperimentReplayCheck[] = [
    check(
      'contract-version',
      '141-experiment-replay-v1',
      EXPERIMENT_REPLAY_VERSION,
      '141 contract',
    ),
    check(
      'source-contract',
      '207-world-replay-chunk-v1+206-world-snapshot-v1',
      `${declaration.source.chunk}+${declaration.source.anchor}`,
      'the projection consumes the sealed 207 chunk and its 206 anchor',
    ),
    check('no-policy', false, declaration.rerunsPolicy, 'the replay never re-runs the policy'),
    check(
      'no-physics',
      false,
      declaration.recalculatesPhysics,
      'the replay never re-runs the physics step',
    ),
    check(
      'no-invented-ticks',
      false,
      declaration.inventsUnobservedTicks,
      'an unobserved tick is declared, not invented',
    ),
    check('no-live-writes', false, declaration.writesLiveState, 'a replay never writes live state'),
    check('chunk-checksum', PINNED.checksum, source.checksum, 'SHA-256 of the sealed chunk'),
    check('chunk-bytes', PINNED.bytes, source.bytes, 'canonical bytes of the sealed chunk'),
    check('chunk-ticks', '340..520', `${source.startTick}..${source.endTick}`, 'stored window'),
    check(
      'chunk-completeness',
      'COMPLETE',
      source.completeness.status,
      'the complete capture declares itself complete',
    ),
    check(
      'observed-ticks',
      PINNED.observedTicks,
      setup.position.observedTicks,
      'recorded 20 Hz rows within the window',
    ),
    check('first-observed', 342, setup.position.firstObservedTick, 'first recorded row of the pin'),
    check('last-observed', 519, setup.position.lastObservedTick, 'last recorded row of the pin'),
    check('auto-only', true, player.incident.autoOnly, 'the incident is AUTO only'),
    check(
      'outside-camera',
      'OUTSIDE_CAMERA',
      player.incident.visibility,
      'both colliding vehicles are outside the camera',
    ),
    check('invisible', true, player.incident.invisible, 'no involved vehicle was visible'),
    check(
      'incident-modes',
      'AUTO,AUTO',
      player.incident.controlModes.join(','),
      'the mode read from the classified tick',
    ),
    check(
      'incident-classified-at',
      399,
      player.incident.classifiedFromTick ?? -1,
      'the tick the classification was read from',
    ),
    check(
      'camera-filter',
      false,
      source.camera.filterApplied,
      'the camera is recorded, never used as a filter',
    ),
    check(
      'created-in-window',
      `${CREATED_ENTITY}@380`,
      player.incident.createdInWindow.map((fact) => `${fact.entityId}@${fact.tick}`).join(','),
      'a vehicle is created inside the pinned window',
    ),
    check(
      'removed-in-window',
      `${REMOVED_ENTITY}@406`,
      player.incident.removedInWindow.map((fact) => `${fact.entityId}@${fact.tick}`).join(','),
      'a vehicle is removed inside the pinned window',
    ),
    check('seek-requested', 400, seek.requestedTick, 'the default seek target is the incident'),
    check('seek-landed', 399, seek.landedTick ?? -1, 'the last recorded row before the incident'),
    check('seek-exact', false, seek.exact, 'tick 400 has no transform row of its own'),
    check('seek-at-incident', true, seek.atIncident, 'the landing is the incident anchor'),
    check(
      'seek-missing',
      'TICK_NOT_OBSERVED 400..400',
      seekMissing.map((entry) => `${entry.reason} ${entry.fromTick}..${entry.toTick}`).join(','),
      'the seek declares the tick it could not land on',
    ),
    check(
      'seek-window',
      '340..520',
      `${seek.span.fromTick}..${seek.span.toTick}`,
      'the requested pin window is reported',
    ),
    check('pause-status', 'PAUSED', paused.status, 'pause freezes the replay'),
    check('pause-tick', seek.landedTick ?? -1, paused.position.tick, 'the tick does not move'),
    check(
      'pause-frame-identical',
      true,
      frameBeforePause === frameAfterPause,
      'the frame is byte-identical before and after the pause',
    ),
    check(
      'pause-position-identical',
      true,
      positionBeforePause.tick === paused.position.tick &&
        positionBeforePause.index === paused.position.index &&
        positionBeforePause.atIncident === paused.position.atIncident &&
        positionBeforePause.paused === false &&
        paused.position.paused === true,
      'only the paused flag changes',
    ),
    check(
      'pause-play-frozen',
      'PAUSED',
      playWhilePaused.status,
      'play while paused does not advance',
    ),
    check(
      'pause-play-frozen-ticks',
      0,
      playWhilePaused.advancedTicks,
      'a frozen play advances zero ticks',
    ),
    check(
      'removed-pose',
      'ABSENT/ENTITY_REMOVED',
      removalPose,
      'no pose is interpolated across the removal',
    ),
    check(
      'removed-before',
      true,
      rowBeforeRemoval.vehicles.some((vehicle) => vehicle.entityId === REMOVED_ENTITY),
      'the vehicle is still drawn on the row before its removal',
    ),
    check(
      'removed-before-tick',
      REPLAY_FIXTURE.removedTick - 1,
      removedSeek.landedTick ?? -1,
      'the row before the removal lands exactly on 405',
    ),
    check(
      'removed-after',
      true,
      absentAfterRemoval,
      'the vehicle is gone from every later recorded row',
    ),
    check(
      'removed-no-resurrection',
      0,
      resurrected,
      'no frame after the removal tick carries the removed vehicle',
    ),
    check(
      'created-before',
      false,
      beforeCreation.vehicles.some((vehicle) => vehicle.entityId === CREATED_ENTITY),
      'the created vehicle does not exist before its creation tick',
    ),
    check(
      'created-pose',
      'ABSENT/ENTITY_NOT_YET_CREATED',
      poseStatus(player, REPLAY_FIXTURE.createdTick - 1, CREATED_ENTITY),
      'a pose before the creation tick is declared absent',
    ),
    check(
      'created-first-row',
      true,
      createdRow.vehicles.some((vehicle) => vehicle.entityId === CREATED_ENTITY),
      'the first row after the creation tick carries the new vehicle',
    ),
    check(
      'created-seek',
      381,
      createdFirstRow.landedTick ?? -1,
      'the created vehicle appears at the first recorded row after 380',
    ),
    check(
      'partial-declared',
      true,
      partialSetup.source.completeness.declaredPartial,
      'an early seal is declared partial',
    ),
    check(
      'partial-status',
      'PARTIAL',
      partialSetup.source.completeness.status,
      'the partial clip is not presented whole',
    ),
    check(
      'partial-reason',
      true,
      partialSetup.source.completeness.reasons.includes('CAPTURE_FINALIZED_EARLY'),
      'the reason is the closed 207 vocabulary',
    ),
    check(
      'partial-missing',
      '431..520',
      partialTruncated === undefined
        ? 'none'
        : `${partialTruncated.fromTick}..${partialTruncated.toTick}`,
      'the missing post-incident span is declared',
    ),
    check(
      'gap-declared',
      'TICK_NOT_OBSERVED',
      gapRange?.reason ?? 'none',
      'a capture gap is a declared absence',
    ),
    check(
      'gap-range',
      `${PINNED.gapMissingFrom}..${PINNED.gapMissingTo}`,
      gapRange === undefined ? 'none' : `${gapRange.fromTick}..${gapRange.toTick}`,
      'the exact lost cadence span',
    ),
    check('gap-skipped', 1, gapStep.skipped.length, 'a step over the gap reports what it skipped'),
    check(
      'gap-pose',
      'ABSENT/TICK_NOT_OBSERVED',
      poseAtGap,
      'no pose is interpolated inside the gap',
    ),
    check(
      'gap-step-tick',
      REPLAY_GAP.toTick + 1,
      gapStep.frame.tick,
      'the next recorded row after the gap',
    ),
    check(
      'interpolation-from',
      399,
      pose.fromTick,
      'the pose is interpolated from the recorded row 399',
    ),
    check('interpolation-to', 402, pose.toTick, 'to the recorded row 402'),
    check('interpolation-matches-207', true, matches207, 'same result as the 207 helper'),
    check(
      'replay-frames',
      41,
      run.frames.length,
      'the run replays from the incident anchor (index 19) to the last observed row',
    ),
    check('replay-ticks', run.frames.length, run.ticks, 'one frame per recorded row'),
    check(
      'replay-last-tick',
      519,
      run.frames[run.frames.length - 1]?.tick ?? -1,
      'the run ends on the last recorded row',
    ),
    check(
      'replay-absences',
      0,
      run.missing.length,
      'the complete window has no capture gap; sub-cadence ticks are the declared 20 Hz interpolation',
    ),
    check(
      'immutability-operations',
      'SEEK,PAUSE,RESUME,SEEK,PLAY,REPLAY',
      operationCodes,
      'every projection operation is verified',
    ),
    check(
      'immutability-unchanged',
      true,
      verification.unchanged,
      'profile, revenue, ratings, missions and XP are unchanged',
    ),
    check('immutability-live-writes', 0, verification.liveWrites, 'no live row was written'),
    check(
      'immutability-checks-unchanged',
      true,
      verification.checks.every((entry) => entry.unchanged),
      'each operation compares its own before/after',
    ),
    check(
      'immutability-ledger',
      true,
      verification.checks.every(
        (entry) =>
          entry.ledgerBefore.learning === entry.ledgerAfter.learning &&
          entry.ledgerBefore.rewards === entry.ledgerAfter.rewards &&
          entry.ledgerBefore.kpi === entry.ledgerAfter.kpi,
      ),
      'the three ledger digests are identical',
    ),
    check(
      'immutability-profile',
      true,
      verification.checks.every(
        (entry) => entry.profileBefore.checksum === entry.profileAfter.checksum,
      ),
      'the profile checksum is identical',
    ),
    check(
      'control-revenue',
      true,
      revenueWriteChangesKpiOnly,
      'a real revenue write changes the KPI digest and nothing else',
    ),
    check(
      'control-profile',
      true,
      profileActivationChangesChecksum,
      'a real profile activation changes the profile checksum',
    ),
    check(
      'refusal-checksum',
      'SOURCE/CHECKSUM_MISMATCH',
      probe('CHECKSUM_CORRUPTED')?.stage + '/' + probe('CHECKSUM_CORRUPTED')?.codes.join(','),
      'a corrupted chunk is refused by the 207 reader',
    ),
    check(
      'refusal-version',
      'SOURCE/INVALID_SOURCE',
      probe('CHUNK_VERSION')?.stage + '/' + probe('CHUNK_VERSION')?.codes.join(','),
      'another chunk version is refused',
    ),
    check(
      'refusal-unpinned',
      'SOURCE/INVALID_SOURCE',
      probe('NOT_PINNED')?.stage + '/' + probe('NOT_PINNED')?.codes.join(','),
      'a chunk that is not a pinned incident clip is refused',
    ),
    check(
      'refusal-session',
      'IDENTITY/FOREIGN_SOURCE',
      probe('FOREIGN_SESSION')?.stage + '/' + probe('FOREIGN_SESSION')?.codes.join(','),
      'a chunk recorded in another session is refused',
    ),
    check(
      'refusal-epoch',
      'IDENTITY/FOREIGN_SOURCE',
      probe('FOREIGN_EPOCH')?.stage + '/' + probe('FOREIGN_EPOCH')?.codes.join(','),
      'a chunk of another world epoch is refused',
    ),
    check(
      'refusal-request',
      'REQUEST/INVALID_REQUEST',
      probe('INVALID_REQUEST')?.stage + '/' + probe('INVALID_REQUEST')?.codes.join(','),
      'an incomplete request is refused before any source is read',
    ),
    check(
      'refusal-seek',
      'SEEK/SEEK_OUT_OF_WINDOW',
      probe('SEEK_OUT_OF_WINDOW')?.stage + '/' + probe('SEEK_OUT_OF_WINDOW')?.codes.join(','),
      'a seek outside the stored window is refused',
    ),
    check('deterministic', true, deterministic, 'two independent runs replay the same frames'),
  ];

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: EXPERIMENT_REPLAY_VERSION,
    contract: Object.freeze({
      source: EXPERIMENT_REPLAY_SOURCE,
      rejectionCodes: experimentReplayRejectionCodes,
      absenceReasons: experimentReplayAbsenceReasons,
      immutableFacts: experimentReplayImmutableFacts,
      immutableCoverage: experimentReplayImmutableCoverage,
      tickHz: source.sampling.tickHz,
      sampleHz: source.sampling.sampleHz,
      cadenceTicks: source.sampling.cadenceTicks,
    }),
    source: Object.freeze({
      chunkId: source.chunkId,
      checksum: source.checksum,
      bytes: source.bytes,
      startTick: source.startTick,
      endTick: source.endTick,
      sealTick: source.sealTick,
      windowFromTick: source.completeness.before.startTick,
      windowToTick: source.completeness.after.endTick,
      incidentTick: player.incident.tick,
      completeness: source.completeness.status,
      partialReasons: source.completeness.reasons,
      observedTicks: setup.position.observedTicks,
      firstObservedTick: setup.position.firstObservedTick,
      lastObservedTick: setup.position.lastObservedTick,
      cameraRecordedVehicles: source.camera.recordedVehicles,
      cameraOutOfCameraVehicles: source.camera.outOfCameraVehicles,
    }),
    incident: Object.freeze({
      autoOnly: player.incident.autoOnly,
      visibility: player.incident.visibility,
      invisible: player.incident.invisible,
      classifiedFromTick: player.incident.classifiedFromTick,
      entities: Object.freeze(
        player.incident.entities.map((entity) =>
          Object.freeze({
            entityId: entity.entityId,
            vehicleClass: entity.vehicleClass,
            controlMode: entity.controlMode,
            inCamera: entity.inCamera,
          }),
        ),
      ),
      createdInWindow: Object.freeze(
        player.incident.createdInWindow.map((fact) =>
          Object.freeze({ entityId: fact.entityId, tick: fact.tick }),
        ),
      ),
      removedInWindow: Object.freeze(
        player.incident.removedInWindow.map((fact) =>
          Object.freeze({ entityId: fact.entityId, tick: fact.tick }),
        ),
      ),
    }),
    seek: Object.freeze({
      requestedTick: seek.requestedTick,
      landedTick: seek.landedTick,
      exact: seek.exact,
      atIncident: seek.atIncident,
      missing: seekMissing,
    }),
    pause: Object.freeze({
      status: paused.status,
      tickBefore: positionBeforePause.tick,
      tickAfter: paused.position.tick,
      frameIdentical: frameBeforePause === frameAfterPause,
      positionIdentical: positionBeforePause.tick === paused.position.tick,
      playWhilePausedStatus: playWhilePaused.status,
    }),
    lifecycle: Object.freeze({
      createdTick: REPLAY_FIXTURE.createdTick,
      createdFirstRowTick: createdFirstRow.landedTick ?? -1,
      removedTick: REPLAY_FIXTURE.removedTick,
      removedPoseAtRemoval: removalPose,
      resurrectedFrames: resurrected,
      presentOnRowBefore: rowBeforeRemoval.vehicles.some(
        (vehicle) => vehicle.entityId === REMOVED_ENTITY,
      ),
      absentAfterRemoval,
    }),
    replay: Object.freeze({
      frames: run.frames.length,
      ticks: run.ticks,
      firstTick: run.frames[0]?.tick ?? -1,
      lastTick: run.frames[run.frames.length - 1]?.tick ?? -1,
      declaredAbsences: run.missing.length,
    }),
    partial: Object.freeze({
      completeness: partialSetup.source.completeness.status,
      declaredPartial: partialSetup.source.completeness.declaredPartial,
      reasons: partialSetup.source.completeness.reasons,
      storedEndTick: partialSetup.source.endTick,
      declaredFromTick: partialTruncated?.fromTick ?? -1,
      declaredToTick: partialTruncated?.toTick ?? -1,
    }),
    gap: Object.freeze({
      completeness: gapSetup.source.completeness.status,
      gapFromTick: gapRange?.fromTick ?? -1,
      gapToTick: gapRange?.toTick ?? -1,
      skipped: gapStep.skipped,
      poseAtGap,
    }),
    interpolation: Object.freeze({
      tick: 400,
      fromTick: pose.fromTick,
      toTick: pose.toTick,
      alpha: pose.alpha,
      matches207,
      interpolation: pose.interpolation,
    }),
    immutability: Object.freeze({
      operations: Object.freeze(verification.checks.map((entry) => entry.operation)),
      unchanged: verification.unchanged,
      liveWrites: verification.liveWrites,
      changed: verification.changed,
      profileChecksum: profileBefore.checksum,
      learning: before.learning,
      rewards: before.rewards,
      kpi: before.kpi,
      checks: verification.checks,
      revenueWriteChangesKpiOnly,
      profileActivationChangesChecksum,
    }),
    refusals,
    checks: Object.freeze(checks),
    summary: Object.freeze({
      probes: refusals.length,
      checks: checks.length,
      passed,
      pass: passed === checks.length,
    }),
  });
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|');
}

export function experimentReplayReportMarkdown(report: ExperimentReplayEvidenceReport): string {
  const entityRows = report.incident.entities
    .map(
      (entity) =>
        `| ${entity.entityId} | ${entity.vehicleClass} | ${entity.controlMode} | ${String(entity.inCamera)} |`,
    )
    .join('\n');
  const lifecycleRows = [
    ...report.incident.createdInWindow.map(
      (fact) => `| ${fact.entityId} | CREATED | ${fact.tick} |`,
    ),
    ...report.incident.removedInWindow.map(
      (fact) => `| ${fact.entityId} | REMOVED | ${fact.tick} |`,
    ),
  ].join('\n');
  const absenceRows = report.seek.missing
    .map(
      (entry) =>
        `| ${entry.reason} | ${entry.fromTick}..${entry.toTick} | ${escapeCell(entry.detail)} |`,
    )
    .join('\n');
  const checkRows = report.checks
    .map(
      (entry) =>
        `| ${entry.name} | ${String(entry.expected)} | ${String(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${escapeCell(entry.detail)} |`,
    )
    .join('\n');
  const refusalRows = report.refusals
    .map(
      (entry) =>
        `| ${entry.probe} | ${entry.stage} | ${entry.codes.join(', ')} | ${escapeCell(entry.detail)} |`,
    )
    .join('\n');
  const isolationRows = report.immutability.checks
    .map(
      (entry) =>
        `| ${entry.operation} | ${entry.unchanged ? 'identice' : 'SCHIMBATE'} | ${entry.changed.join(', ') || '-'} |`,
    )
    .join('\n');

  return `# Raport determinist 141 — replay vizual din stări înregistrate

- Contract: \`${report.version}\` peste \`${report.contract.source.chunk}\` ancorat pe \`${report.contract.source.anchor}\`
- Cadru: ${report.contract.tickHz} Hz, eșantioane ${report.contract.sampleHz} Hz (cadență ${report.contract.cadenceTicks} tickuri)
- Chunk: \`${report.source.chunkId}\`, ${report.source.bytes} bytes, \`${report.source.checksum}\`
- Fereastră cerută ${report.source.windowFromTick}..${report.source.windowToTick}, stocată ${report.source.startTick}..${report.source.endTick}, sigilată la ${report.source.sealTick}
- Completitudine sursă: ${report.source.completeness}${report.source.partialReasons.length > 0 ? ` (${report.source.partialReasons.join(', ')})` : ''}
- Eșantioane observate: ${report.source.observedTicks} (${report.source.firstObservedTick}..${report.source.lastObservedTick})

## Incidentul redat

- Auto-only: ${String(report.incident.autoOnly)}; vizibilitate: ${report.incident.visibility}; invizibil: ${String(report.incident.invisible)}
- Tick incident ${report.source.incidentTick}, clasificare citită din tick ${String(report.incident.classifiedFromTick)}

| Entitate | Clasă | Mod | În cameră |
| --- | --- | --- | --- |
${entityRows}

| Entitate | Fapt | Tick exact |
| --- | --- | --- |
${lifecycleRows}

## Seek la incident

- Cerut ${report.seek.requestedTick}, aterizat ${String(report.seek.landedTick)}, exact ${String(report.seek.exact)}, ancoră de incident ${String(report.seek.atIncident)}
${absenceRows.length > 0 ? `\n| Motiv | Interval | Detaliu |\n| --- | --- | --- |\n${absenceRows}` : '- Nicio absență declarată la seek.'}

## Pauză

- Stare ${report.pause.status}; tick ${report.pause.tickBefore} → ${report.pause.tickAfter}
- Cadru identic înainte/după: ${String(report.pause.frameIdentical)}; poziție identică: ${String(report.pause.positionIdentical)}
- \`play()\` în timpul pauzei: ${report.pause.playWhilePausedStatus}

## Ciclul de viață al vehiculelor

- Vehicul creat la tick ${report.lifecycle.createdTick}, prima linie observată ${report.lifecycle.createdFirstRowTick}
- Vehicul eliminat la tick ${report.lifecycle.removedTick}; poză la eliminare: ${report.lifecycle.removedPoseAtRemoval}
- Prezent pe linia de dinainte: ${String(report.lifecycle.presentOnRowBefore)}; absent după: ${String(report.lifecycle.absentAfterRemoval)}
- Reînviat în replay: ${report.lifecycle.resurrectedFrames} cadre

## Replay

- ${report.replay.frames} cadre, ${report.replay.ticks} tickuri, ${report.replay.firstTick}..${report.replay.lastTick}, absențe declarate: ${report.replay.declaredAbsences}
- Interpolare la tick ${report.interpolation.tick} între ${report.interpolation.fromTick} și ${report.interpolation.toTick} (alpha ${report.interpolation.alpha}), identică cu 207: ${String(report.interpolation.matches207)}

## Ferestre parțiale și goluri

- Clip sigilat devreme: ${report.partial.completeness}, declarat parțial ${String(report.partial.declaredPartial)}, motive ${report.partial.reasons.join(', ') || '-'}
- Interval lipsă declarat: ${report.partial.declaredFromTick}..${report.partial.declaredToTick} (fereastra stocată se termină la ${report.partial.storedEndTick})
- Captură cu gol: ${report.gap.completeness}, interval ${report.gap.gapFromTick}..${report.gap.gapToTick}, poziție în gol: ${report.gap.poseAtGap}

## Imutabilitate

- Operații verificate: ${report.immutability.operations.join(', ')}
- Neschimbat: ${String(report.immutability.unchanged)}; scrieri live: ${report.immutability.liveWrites}
- Profil \`${report.immutability.profileChecksum}\`
- learning \`${report.immutability.learning}\`
- rewards \`${report.immutability.rewards}\`
- kpi \`${report.immutability.kpi}\`

| Operație | Amprente | Schimbate |
| --- | --- | --- |
${isolationRows}

- Probă de control revenue: ${String(report.immutability.revenueWriteChangesKpiOnly)}; probă de control profil: ${String(report.immutability.profileActivationChangesChecksum)}

## Refuzuri demonstrate

| Probă | Etapă | Coduri | Detaliu |
| --- | --- | --- | --- |
${refusalRows}

## Verificări

| Verificare | Așteptat | Real | Rezultat | Detaliu |
| --- | --- | --- | --- | --- |
${checkRows}

## Sumar

- Probe de refuz: ${report.summary.probes}
- Verificări: ${report.summary.passed}/${report.summary.checks}
- Rezultat: ${report.summary.pass ? 'PASS' : 'FAIL'}
`;
}

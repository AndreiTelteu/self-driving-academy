import { canonicalizeJson } from '../../src/persistence/index';
import type { RecoveryResetCheckpoint } from '../../src/persistence/index';
import {
  WORLD_RECOVERY_VERSION,
  WORLD_RESET_REPLAY_FACT,
  worldRecoveryCodes,
} from '../../src/persistence/index';
import {
  worldFinalizeReasons,
  worldRecorderDiscontinuityEventTypes,
  worldReplayEventTypes,
} from '../../src/replay/index';
import {
  BASELINE_JOBS,
  BASELINE_LISTENERS,
  BASELINE_TRAFFIC,
  BASELINE_VEHICLES,
  RECOVERY_CHAOS_SESSION_ID,
  RECOVERY_FIXED_NOW,
  RECOVERY_SESSION_ID,
  createWorldRecoveryFixture,
  recoveryChallenge,
  recoveryDigest,
  recoveryRide,
} from './world-recovery-fixture';

/**
 * Deterministic transcript of PBI 226.
 *
 * Every number is produced by the real 211/212/213/125/116/109 instances and the deterministic
 * composition ports. Nothing here reads a wall clock, a browser, the heap or `Math.random`: the
 * hardware cost of the recovery path is written to `cost.json` only by the `--cost` flag and never
 * enters this report.
 */

export interface WorldRecoveryReportCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
}

export interface WorldRecoveryReport {
  readonly version: typeof WORLD_RECOVERY_VERSION;
  readonly fixture: '226-world-recovery-v1';
  readonly fixedNow: string;
  readonly sessions: Readonly<{ academy: string; chaos: string }>;
  readonly structure: Readonly<{
    readonly operations: readonly string[];
    readonly codes: number;
    readonly resetReason: string;
    readonly passengerReason: string;
    readonly replayFact: string;
    readonly replayVocabulary: Readonly<{
      readonly finalizeReasonPublished: boolean;
      readonly discontinuityPublished: boolean;
      readonly eventTypePublished: boolean;
    }>;
  }>;
  readonly recovery: Readonly<{
    readonly status: string;
    readonly pointId: string;
    readonly laneId: string;
    readonly access: string;
    readonly colliderCount: number;
    readonly mobilityVelocityMps: number;
    readonly restoredStatePublished: boolean;
    readonly ticksToMobility: number;
    readonly stages: number;
    readonly requestedTick: number;
    readonly acceptedTick: number;
    readonly xpBeforeMicroXp: number;
    readonly xpAfterMicroXp: number;
    readonly xpDeltaMicroXp: number;
    readonly epochsChanged: boolean;
    readonly profileChanged: boolean;
    readonly worldStarted: boolean;
    readonly checkpointCommitted: boolean;
    readonly economySeriesOpened: boolean;
    readonly closedActivities: number;
  }>;
  readonly passenger: Readonly<{
    readonly firstClosures: number;
    readonly reason: string;
    readonly revenue: number;
    readonly terminal: boolean;
    readonly historyAfterFirst: number;
    readonly secondClosures: number;
    readonly historyAfterSecond: number;
    readonly singleFailedClosure: boolean;
    readonly incidentRetained: boolean;
    readonly xpBeforeMicroXp: number;
    readonly xpAfterMicroXp: number;
    readonly xpDebits: 0;
  }>;
  readonly haos: Readonly<{
    readonly closedActivities: number;
    readonly retries: number;
    readonly retryStatus: string;
    readonly availableAtTick: number | null;
    readonly ticksWaited: number;
    readonly academyRetries: number;
  }>;
  readonly reset: Readonly<{
    readonly preparedActivities: readonly string[];
    readonly planIsSideEffectFree: boolean;
    readonly epochs: Readonly<{ worldEpoch: number; learningEpoch: number; economyEpoch: number }>;
    readonly previous: Readonly<{
      worldEpoch: number;
      learningEpoch: number;
      economyEpoch: number;
    }>;
    readonly closedActivities: number;
    readonly terminalReasons: readonly string[];
    readonly revenue: readonly number[];
    readonly closedSegments: number;
    readonly invalidatedJobs: number;
    readonly releasedInputs: number;
    readonly bodies: number;
    readonly trafficVehicles: number;
    readonly listeners: number;
    readonly jobs: number;
    readonly liveWorlds: number;
    readonly launch: string;
    readonly economySeries: Readonly<{
      previousEpoch: number;
      epoch: number;
      seriesId: string;
      history: number;
    }>;
    readonly replay: Readonly<{
      eventId: string;
      discontinuity: boolean;
      finalizeReason: string;
    }>;
    readonly checkpointId: string;
    readonly checkpointChecksumLength: number;
    readonly checkpointBytes: number;
    readonly previousCheckpointId: string | null;
    readonly profileChecksum: string;
    readonly profilePreserved: boolean;
    readonly xpMicroXp: number;
    readonly xpPreserved: boolean;
    readonly dailyPreserved: boolean;
    readonly rewardsPreserved: boolean;
    readonly missionsPreserved: boolean;
    readonly evidencePreserved: boolean;
    readonly economyHistoryPreserved: boolean;
    readonly missionCompletions: 0;
    readonly rewardGrants: 0;
  }>;
  readonly repeated: Readonly<{
    readonly resets: number;
    readonly epochs: Readonly<{ worldEpoch: number; learningEpoch: number; economyEpoch: number }>;
    readonly sceneClosures: number;
    readonly duplicateClosures: number;
    readonly checkpoints: number;
    readonly replayFacts: number;
    readonly economySeries: number;
    readonly bodies: readonly number[];
    readonly listeners: readonly number[];
    readonly jobs: readonly number[];
    readonly liveWorlds: number;
    readonly starts: number;
    readonly xpMicroXp: number;
    readonly xpDecreased: boolean;
    readonly profileChecksumStable: boolean;
    readonly rewardsUnchanged: boolean;
    readonly failedResets: number;
  }>;
  readonly failure: Readonly<{
    readonly refusedCode: string;
    readonly checkpointsAfterFailure: number;
    readonly epochsAfterFailure: Readonly<{
      worldEpoch: number;
      learningEpoch: number;
      economyEpoch: number;
    }>;
    readonly sceneClosuresAfterFailure: number;
    readonly economySeriesAfterFailure: number;
    readonly worldStartsAfterFailure: number;
    readonly failedResets: number;
    readonly retryStatus: string;
    readonly retryCheckpoints: number;
    readonly retryEpochs: Readonly<{
      worldEpoch: number;
      learningEpoch: number;
      economyEpoch: number;
    }>;
  }>;
  readonly partial: Readonly<{
    readonly stage: string;
    readonly faultBeforeResume: boolean;
    readonly resumeStatus: string;
    readonly checkpoints: number;
    readonly sceneClosures: number;
    readonly economySeries: number;
    readonly duplicateClosures: number;
    readonly faultAfterResume: boolean;
  }>;
  readonly style: Readonly<{
    readonly status: string;
    readonly previousVersionId: string;
    readonly previousChecksum: string;
    readonly versionId: string;
    readonly checksum: string;
    readonly checksumValid: boolean;
    readonly barrier: string;
    readonly learningEpochPrevious: number;
    readonly learningEpochNext: number;
    readonly worldEpoch: number;
    readonly economyEpoch: number;
    readonly closedSegments: number;
    readonly staleResults: number;
    readonly worldStarted: boolean;
    readonly sceneClosures: number;
    readonly checkpoints: number;
    readonly replayFacts: number;
    readonly economySeries: number;
    readonly xpPreserved: boolean;
    readonly xpMicroXp: number;
    readonly secondActivationRefused: boolean;
    readonly activations: number;
  }>;
  readonly distinctness: Readonly<{
    readonly recovery: Readonly<Record<string, boolean>>;
    readonly reset: Readonly<Record<string, boolean>>;
    readonly style: Readonly<Record<string, boolean>>;
  }>;
  readonly performance: Readonly<{
    readonly validationLevel: 'targeted';
    readonly playtest: 'NOT_PERFORMED';
    readonly humanPlaytestClaimed: false;
    readonly target: Readonly<{ readonly proposedMs: number; readonly measured: 'NOT_MEASURED' }>;
    readonly deterministic: Readonly<{
      readonly ticksToMobility: number;
      readonly synchronousStages: number;
      readonly workOnResetTick: 0;
      readonly preparedResets: number;
      readonly concurrentCommits: number;
    }>;
    readonly storage: Readonly<{
      readonly checkpointBytes: number;
      readonly checkpointChecksumLength: number;
      readonly budgetEntry: 'twoSessionCheckpointBytes';
      readonly budgetValue: null;
    }>;
    readonly unsupported: readonly string[];
  }>;
  readonly memory: Readonly<{
    readonly exactHeapBytes: null;
    readonly reason: string;
    readonly ownershipCounters: Readonly<Record<string, number>>;
  }>;
  readonly checks: readonly WorldRecoveryReportCheck[];
  readonly summary: Readonly<{
    readonly checks: number;
    readonly passed: number;
    readonly pass: boolean;
  }>;
}

const BASELINE_OCCUPANCY = Object.freeze({
  vehicles: BASELINE_VEHICLES,
  trafficVehicles: BASELINE_TRAFFIC,
  bodies: BASELINE_VEHICLES + BASELINE_TRAFFIC,
  listeners: BASELINE_LISTENERS,
  jobs: BASELINE_JOBS,
});

function canonicalBytes(value: unknown): number {
  const canonical = canonicalizeJson(value);
  if (canonical.status === 'REJECTED') {
    throw new Error(`The report value is not canonical: ${canonical.rejection.message}`);
  }
  return new TextEncoder().encode(canonical.text).length;
}

function checkpointBytes(checkpoint: RecoveryResetCheckpoint): number {
  return canonicalBytes({
    version: checkpoint.version,
    checkpointId: checkpoint.checkpointId,
    sessionKind: checkpoint.sessionKind,
    sessionId: checkpoint.sessionId,
    reason: checkpoint.reason,
    createdAt: checkpoint.createdAt,
    tick: checkpoint.tick,
    previous: checkpoint.previous,
    next: checkpoint.next,
    closedActivities: checkpoint.closedActivities,
    closedSegments: checkpoint.closedSegments,
    profileId: checkpoint.profileId,
    profileVersionId: checkpoint.profileVersionId,
    profileChecksum: checkpoint.profileChecksum,
    ledgerDigest: checkpoint.ledgerDigest,
    launch: checkpoint.launch,
  });
}

function check(name: string, expected: unknown, actual: unknown): WorldRecoveryReportCheck {
  return Object.freeze({
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
  });
}

export function runWorldRecoveryReport(): WorldRecoveryReport {
  /* ------------------------------------------------------------------ R only */
  const recoveryFixture = createWorldRecoveryFixture();
  const recoveryLedgersBefore = recoveryFixture.economy.snapshot();
  const recoveryProfileBefore = recoveryFixture.profile.active();
  const recoveryResult = recoveryFixture.module.recoverVehicle({ tick: 10, origin: 'R' });
  if (recoveryResult.status !== 'RECOVERED') {
    throw new Error(`The report R operation failed: ${recoveryResult.rejection.code}`);
  }
  const recoveryStatus = recoveryFixture.module.status();

  /* -------------------------------------------------------- R with passenger */
  const passengerFixture = createWorldRecoveryFixture({ activities: [recoveryRide(true)] });
  const passengerXpBefore = passengerFixture.xp.read().xpBalanceMicroXp;
  const passengerFirst = passengerFixture.module.recoverVehicle({ tick: 10, origin: 'R' });
  if (passengerFirst.status !== 'RECOVERED') {
    throw new Error(`The report passenger R failed: ${passengerFirst.rejection.code}`);
  }
  const passengerSecond = passengerFixture.module.recoverVehicle({ tick: 11, origin: 'R' });
  if (passengerSecond.status !== 'RECOVERED') {
    throw new Error(`The report second R failed: ${passengerSecond.rejection.code}`);
  }

  /* ------------------------------------------------------------- Haos retry */
  const haosFixture = createWorldRecoveryFixture({
    sessionKind: 'CHAOS',
    activities: [recoveryChallenge(true)],
  });
  const haosResult = haosFixture.module.recoverVehicle({ tick: 10, origin: 'R' });
  if (haosResult.status !== 'RECOVERED') {
    throw new Error(`The report Haos R failed: ${haosResult.rejection.code}`);
  }
  const academyChallenge = createWorldRecoveryFixture({ activities: [recoveryChallenge(true)] });
  const academyChallengeResult = academyChallenge.module.recoverVehicle({ tick: 10, origin: 'R' });
  if (academyChallengeResult.status !== 'RECOVERED') {
    throw new Error(
      `The report Academy challenge R failed: ${academyChallengeResult.rejection.code}`,
    );
  }

  /* ------------------------------------------------------------- city reset */
  const resetFixture = createWorldRecoveryFixture({
    activities: [recoveryRide(true), recoveryChallenge()],
  });
  const resetLedgersBefore = resetFixture.economy.snapshot();
  const resetProfileBefore = resetFixture.profile.active();
  const resetMissionsBefore = resetFixture.tracker.snapshot();
  const resetRewardsBefore = resetFixture.rewards.rewards();
  const startsBeforeReset = resetFixture.world.starts;
  const prepared = resetFixture.module.beginCityReset({ tick: 20 });
  if (prepared.status !== 'PREPARED') {
    throw new Error(`The report prepare failed: ${prepared.rejection.code}`);
  }
  const planIsSideEffectFree =
    resetFixture.scene.history().length === 0 &&
    resetFixture.checkpoints.commits === 0 &&
    resetFixture.world.starts === startsBeforeReset &&
    resetFixture.module.status().epochs.worldEpoch === 1;
  const reset = resetFixture.module.commitCityReset();
  if (reset.status !== 'RESET') {
    throw new Error(
      `The report reset failed: ${reset.status === 'PARTIAL' ? reset.stage : reset.rejection.code}`,
    );
  }
  const resetLedgersAfter = resetFixture.economy.snapshot();
  const checkpoint = resetFixture.checkpoints.latest();

  /* --------------------------------------------------------- twenty resets */
  const repeatedFixture = createWorldRecoveryFixture({ activities: [recoveryRide(false)] });
  const repeatedXpBefore = repeatedFixture.economy.snapshot().xpMicroXp;
  const repeatedProfileBefore = repeatedFixture.profile.active().checksum;
  const repeatedRewardsBefore = repeatedFixture.economy.snapshot().rewards;
  const bodies: number[] = [];
  const listeners: number[] = [];
  const jobs: number[] = [];
  let duplicateClosures = 0;
  for (let index = 0; index < 20; index += 1) {
    const eachPrepared = repeatedFixture.module.beginCityReset({ tick: 100 + index });
    if (eachPrepared.status !== 'PREPARED') {
      throw new Error(`Repeated prepare ${String(index)} failed`);
    }
    const each = repeatedFixture.module.commitCityReset();
    if (each.status !== 'RESET') throw new Error(`Repeated reset ${String(index)} failed`);
    duplicateClosures += each.duplicateClosures;
    bodies.push(each.occupancy.bodies);
    listeners.push(each.occupancy.listeners);
    jobs.push(each.occupancy.jobs);
  }
  const repeatedStatus = repeatedFixture.module.status();

  /* ------------------------------------------------------- failed commit */
  const failureFixture = createWorldRecoveryFixture({
    activities: [recoveryRide(true)],
    failCheckpointCommits: 1,
  });
  const failurePrepared = failureFixture.module.beginCityReset({ tick: 20 });
  if (failurePrepared.status !== 'PREPARED') throw new Error('The failure prepare failed');
  const refused = failureFixture.module.commitCityReset();
  if (refused.status !== 'REJECTED') throw new Error('The failed commit was not refused');
  const failureStatus = failureFixture.module.status();
  const checkpointsAfterFailure = failureFixture.checkpoints.rows.length;
  const sceneClosuresAfterFailure = failureFixture.scene.history().length;
  const economySeriesAfterFailure = failureFixture.economy.seriesHistory.length;
  const worldStartsAfterFailure = failureFixture.world.starts;
  const retried = failureFixture.module.commitCityReset();

  /* ------------------------------------------------------- partial resume */
  const partialFixture = createWorldRecoveryFixture({ activities: [recoveryRide(true)] });
  const partialPrepared = partialFixture.module.beginCityReset({ tick: 20 });
  if (partialPrepared.status !== 'PREPARED') throw new Error('The partial prepare failed');
  partialFixture.world.failNextStart = true;
  const partial = partialFixture.module.commitCityReset();
  if (partial.status !== 'PARTIAL') throw new Error('The partial reset did not fail the rebuild');
  const faultBeforeResume = partialFixture.module.status().fault !== null;
  const resumed = partialFixture.module.commitCityReset();
  if (resumed.status !== 'RESET') throw new Error('The partial reset did not resume');

  /* ----------------------------------------------------------------- style */
  const styleFixture = createWorldRecoveryFixture({ activities: [recoveryRide(true)] });
  const styleLedgersBefore = styleFixture.economy.snapshot();
  const styleProfileBefore = styleFixture.profile.active();
  const styleStartsBefore = styleFixture.world.starts;
  const style = styleFixture.module.restoreStyle({ tick: 30, versionId: 'profile-1@2' });
  if (style.status !== 'RESTORED')
    throw new Error(`The style restore failed: ${style.rejection.code}`);
  const secondStyle = styleFixture.module.restoreStyle({ tick: 31, versionId: 'profile-1@2' });

  /* ----------------------------------------------------------- distinctness */
  const distinctFixture = createWorldRecoveryFixture({ activities: [recoveryRide(true)] });
  const distinctProfile = distinctFixture.profile.active();
  const distinctRequestsBefore = distinctFixture.recovery.requests;
  const distinctRecovery = distinctFixture.module.recoverVehicle({ tick: 10, origin: 'R' });
  if (distinctRecovery.status !== 'RECOVERED') throw new Error('Distinctness R failed');
  const afterRecovery = distinctFixture.module.status();
  const recoveryEffects = Object.freeze({
    epochsUnchanged:
      afterRecovery.epochs.worldEpoch === 1 &&
      afterRecovery.epochs.learningEpoch === 0 &&
      afterRecovery.epochs.economyEpoch === 1,
    noCheckpoint: distinctFixture.checkpoints.commits === 0,
    noEconomySeries: distinctFixture.economy.seriesHistory.length === 1,
    noWorldRebuild: distinctFixture.world.starts === 1,
    noStyleActivation: distinctFixture.profile.activations === 0,
    profileUnchanged: distinctFixture.profile.active().checksum === distinctProfile.checksum,
  });
  const distinctPrepared = distinctFixture.module.beginCityReset({ tick: 20 });
  if (distinctPrepared.status !== 'PREPARED') throw new Error('Distinctness prepare failed');
  const distinctReset = distinctFixture.module.commitCityReset();
  if (distinctReset.status !== 'RESET') throw new Error('Distinctness reset failed');
  const resetEffects = Object.freeze({
    epochsAdvanced:
      distinctReset.epochs.worldEpoch === 2 &&
      distinctReset.epochs.learningEpoch === 1 &&
      distinctReset.epochs.economyEpoch === 2,
    noVehicleRecovery: distinctFixture.recovery.requests === distinctRequestsBefore + 1,
    profilePreserved:
      distinctReset.profile.checksum === distinctProfile.checksum &&
      distinctFixture.profile.active().checksum === distinctProfile.checksum,
    noStyleActivation: distinctFixture.profile.activations === 0,
    oneCheckpoint: distinctFixture.checkpoints.rows.length === 1,
    oneEconomySeries: distinctFixture.economy.seriesHistory.length === 2,
    replayDiscontinuity: distinctFixture.replay.facts.length === 1,
    oneWorldLive: distinctFixture.world.liveWorlds === 1,
  });
  const distinctStyle = distinctFixture.module.restoreStyle({ tick: 30, versionId: 'profile-1@2' });
  if (distinctStyle.status !== 'RESTORED') throw new Error('Distinctness style failed');
  const styleEffects = Object.freeze({
    learningEpochAdvanced: distinctFixture.module.status().epochs.learningEpoch === 2,
    worldEpochPreserved: distinctFixture.module.status().epochs.worldEpoch === 2,
    economyEpochPreserved: distinctFixture.module.status().epochs.economyEpoch === 2,
    noWorldRebuild: distinctFixture.world.starts === 2,
    noRideClosure: distinctFixture.scene.history().length === 1,
    noCheckpoint: distinctFixture.checkpoints.rows.length === 1,
    noReplayFact: distinctFixture.replay.facts.length === 1,
    noEconomySeries: distinctFixture.economy.seriesHistory.length === 2,
    styleChanged: distinctStyle.profile.checksum !== distinctStyle.profile.previousChecksum,
  });

  const checks: WorldRecoveryReportCheck[] = [
    check('recovery.pointIsColliderFree', 0, recoveryResult.colliderCount),
    check('recovery.mobilityRestored', true, recoveryResult.mobilityRestored),
    check('recovery.ticksToMobility', 0, recoveryResult.ticksToMobility),
    check('recovery.stages', 5, recoveryResult.stages),
    check(
      'recovery.xpNeverDecreases',
      true,
      recoveryResult.xpAfterMicroXp >= recoveryResult.xpBeforeMicroXp,
    ),
    check('recovery.epochsUnchanged', true, recoveryEffects.epochsUnchanged),
    check('recovery.profileUnchanged', true, recoveryEffects.profileUnchanged),
    check('recovery.noCheckpoint', true, recoveryEffects.noCheckpoint),
    check(
      'passenger.singleFailedClosure',
      1,
      passengerFixture.scene
        .history()
        .filter((entry) => entry.reason === 'RECOVERED_WITH_PASSENGER').length,
    ),
    check('passenger.incidentRetained', 1, passengerFixture.scene.history().length),
    check('passenger.secondRecoveryClosesNothing', 0, passengerSecond.closedActivities.length),
    check('passenger.xpUnchanged', passengerXpBefore, passengerFixture.xp.read().xpBalanceMicroXp),
    check('haos.retryImmediate', 0, haosResult.retries[0]?.ticksWaited ?? -1),
    check('haos.noAcademyRetry', 0, academyChallengeResult.retries.length),
    check('reset.epochsAdvanced', 2, reset.epochs.worldEpoch),
    check('reset.learningEpochAdvanced', 1, reset.epochs.learningEpoch),
    check('reset.economyEpochAdvanced', 2, reset.epochs.economyEpoch),
    check('reset.activitiesClosedOnce', 2, reset.closedActivities.length),
    check('reset.noDuplicateClosures', 0, reset.duplicateClosures),
    check('reset.missionsNotCompleted', 0, reset.missionCompletions),
    check('reset.noRewardsGranted', 0, reset.rewardGrants),
    check('reset.profilePreserved', true, reset.preserved.profile),
    check(
      'reset.missionSnapshotPreserved',
      true,
      recoveryDigest(resetMissionsBefore) === recoveryDigest(resetFixture.tracker.snapshot()),
    ),
    check('reset.xpPreserved', true, reset.preserved.xp),
    check('reset.dailyPreserved', true, reset.preserved.daily),
    check('reset.rewardsPreserved', true, reset.preserved.rewards),
    check('reset.missionsPreserved', true, reset.preserved.missions),
    check('reset.evidencePreserved', true, reset.preserved.evidence),
    check('reset.replayDiscontinuity', true, reset.replay.discontinuity),
    check('reset.checkpointWritten', 1, resetFixture.checkpoints.rows.length),
    check('reset.bodiesAtBaseline', BASELINE_OCCUPANCY.bodies, reset.occupancy.bodies),
    check('reset.trafficRebuilt', BASELINE_TRAFFIC, reset.occupancy.trafficVehicles),
    check('repeated.sceneClosedOnce', 1, repeatedFixture.scene.history().length),
    check('repeated.noDuplicateClosures', 0, duplicateClosures),
    check('repeated.bodiesConstant', [BASELINE_OCCUPANCY.bodies], [...new Set(bodies)]),
    check('repeated.listenersConstant', [BASELINE_LISTENERS], [...new Set(listeners)]),
    check('repeated.jobsConstant', [BASELINE_JOBS], [...new Set(jobs)]),
    check('repeated.oneLiveWorld', 1, repeatedFixture.world.liveWorlds),
    check('repeated.checkpoints', 20, repeatedFixture.checkpoints.rows.length),
    check('repeated.economySeries', 21, repeatedFixture.economy.seriesHistory.length),
    check('repeated.xpUnchanged', repeatedXpBefore, repeatedFixture.economy.snapshot().xpMicroXp),
    check(
      'repeated.profileUnchanged',
      repeatedProfileBefore,
      repeatedFixture.profile.active().checksum,
    ),
    check(
      'repeated.rewardsUnchanged',
      repeatedRewardsBefore,
      repeatedFixture.economy.snapshot().rewards,
    ),
    check('failure.previousCheckpointKept', 0, checkpointsAfterFailure),
    check('failure.epochsUnchanged', 1, failureStatus.epochs.worldEpoch),
    check('failure.sceneUntouched', 0, sceneClosuresAfterFailure),
    check('failure.retryCommitsOnce', 'RESET', retried.status),
    check('failure.oneCheckpointAfterRetry', 1, failureFixture.checkpoints.rows.length),
    check('partial.stage', 'WORLD_REBUILD', partial.stage),
    check('partial.faultBlocksOtherOperations', true, faultBeforeResume),
    check('partial.resumed', 'RESET', resumed.status),
    check('partial.noDuplicateCheckpoint', 1, partialFixture.checkpoints.rows.length),
    check('partial.noDuplicateSeries', 2, partialFixture.economy.seriesHistory.length),
    check('partial.noDuplicateClosure', 0, resumed.duplicateClosures),
    check('style.barrier', 'LEARNING_EPOCH', style.barrier),
    check('style.worldUntouched', true, style.worldUntouched),
    check('style.noWorldRebuild', styleStartsBefore, styleFixture.world.starts),
    check('style.noRideClosure', 0, styleFixture.scene.history().length),
    check('style.noCheckpoint', 0, styleFixture.checkpoints.rows.length),
    check('style.noReplayFact', 0, styleFixture.replay.facts.length),
    check(
      'style.xpPreserved',
      styleLedgersBefore.xpMicroXp,
      styleFixture.economy.snapshot().xpMicroXp,
    ),
    check('style.secondActivationRefused', true, secondStyle.status === 'REJECTED'),
    check('distinct.recoveryEffects', true, Object.values(recoveryEffects).every(Boolean)),
    check('distinct.resetEffects', true, Object.values(resetEffects).every(Boolean)),
    check('distinct.styleEffects', true, Object.values(styleEffects).every(Boolean)),
  ];
  const passed = checks.filter((entry) => entry.pass).length;

  return {
    version: WORLD_RECOVERY_VERSION,
    fixture: '226-world-recovery-v1',
    fixedNow: RECOVERY_FIXED_NOW,
    sessions: { academy: RECOVERY_SESSION_ID, chaos: RECOVERY_CHAOS_SESSION_ID },
    structure: {
      operations: ['VEHICLE_RECOVERY', 'CITY_RESET', 'STYLE_RESTORE'],
      codes: worldRecoveryCodes.length,
      resetReason: reset.closedActivities[0]?.reason ?? 'MISSING',
      passengerReason: passengerFixture.scene.history()[0]?.reason ?? 'MISSING',
      replayFact: WORLD_RESET_REPLAY_FACT,
      replayVocabulary: {
        finalizeReasonPublished: (worldFinalizeReasons as readonly string[]).includes(
          WORLD_RESET_REPLAY_FACT,
        ),
        discontinuityPublished: worldRecorderDiscontinuityEventTypes.includes('WORLD_RESET'),
        eventTypePublished: (worldReplayEventTypes as readonly string[]).includes(
          WORLD_RESET_REPLAY_FACT,
        ),
      },
    },
    recovery: {
      status: recoveryResult.status,
      pointId: recoveryResult.pointId,
      laneId: recoveryResult.laneId,
      access: recoveryResult.access,
      colliderCount: recoveryResult.colliderCount,
      mobilityVelocityMps: recoveryResult.record.placement?.after?.velocityMps.z ?? 0,
      restoredStatePublished: recoveryResult.record.placement?.after !== null,
      ticksToMobility: recoveryResult.ticksToMobility,
      stages: recoveryResult.stages,
      requestedTick: recoveryResult.requestedTick,
      acceptedTick: recoveryResult.acceptedTick,
      xpBeforeMicroXp: recoveryResult.xpBeforeMicroXp,
      xpAfterMicroXp: recoveryResult.xpAfterMicroXp,
      xpDeltaMicroXp:
        recoveryFixture.economy.snapshot().xpMicroXp - recoveryLedgersBefore.xpMicroXp,
      epochsChanged:
        recoveryStatus.epochs.worldEpoch !== 1 || recoveryStatus.epochs.learningEpoch !== 0,
      profileChanged: recoveryFixture.profile.active().checksum !== recoveryProfileBefore.checksum,
      worldStarted: recoveryFixture.world.starts !== 1,
      checkpointCommitted: recoveryFixture.checkpoints.commits > 0,
      economySeriesOpened: recoveryFixture.economy.seriesHistory.length > 1,
      closedActivities: recoveryResult.closedActivities.length,
    },
    passenger: {
      firstClosures: passengerFirst.closedActivities.length,
      reason: passengerFixture.scene.history()[0]?.reason ?? 'MISSING',
      revenue: passengerFixture.scene.history()[0]?.revenue ?? -1,
      terminal: passengerFixture.scene.history()[0]?.terminal ?? false,
      historyAfterFirst: passengerFirst.closedActivities.length === 1 ? 1 : 0,
      secondClosures: passengerSecond.closedActivities.length,
      historyAfterSecond: passengerFixture.scene.history().length,
      singleFailedClosure:
        passengerFixture.scene
          .history()
          .filter((entry) => entry.reason === 'RECOVERED_WITH_PASSENGER').length === 1,
      incidentRetained: passengerFixture.scene.history().length === 1,
      xpBeforeMicroXp: passengerXpBefore,
      xpAfterMicroXp: passengerFixture.xp.read().xpBalanceMicroXp,
      xpDebits: 0 as const,
    },
    haos: {
      closedActivities: haosResult.closedActivities.length,
      retries: haosResult.retries.length,
      retryStatus: haosResult.retries[0]?.status ?? 'MISSING',
      availableAtTick: haosResult.retries[0]?.availableAtTick ?? null,
      ticksWaited: haosResult.retries[0]?.ticksWaited ?? -1,
      academyRetries: academyChallengeResult.retries.length,
    },
    reset: {
      preparedActivities: prepared.plan.activeActivities,
      planIsSideEffectFree,
      epochs: reset.epochs,
      previous: reset.previous,
      closedActivities: reset.closedActivities.length,
      terminalReasons: reset.closedActivities.map((entry) => entry.reason),
      revenue: reset.closedActivities.map((entry) => entry.revenue),
      closedSegments: reset.closedSegments,
      invalidatedJobs: reset.invalidatedJobs,
      releasedInputs: reset.releasedInputs,
      bodies: reset.occupancy.bodies,
      trafficVehicles: reset.occupancy.trafficVehicles,
      listeners: reset.occupancy.listeners,
      jobs: reset.occupancy.jobs,
      liveWorlds: resetFixture.world.liveWorlds,
      launch: reset.launch,
      economySeries: reset.economySeries,
      replay: {
        eventId: reset.replay.eventId,
        discontinuity: reset.replay.discontinuity,
        finalizeReason: reset.replay.finalizeReason,
      },
      checkpointId: reset.checkpointId,
      checkpointChecksumLength: reset.checkpointChecksum.length,
      checkpointBytes: checkpoint === null ? 0 : checkpointBytes(checkpoint),
      previousCheckpointId: reset.previousCheckpointId,
      profileChecksum: reset.profile.checksum,
      profilePreserved: reset.profile.checksum === resetProfileBefore.checksum,
      xpMicroXp: resetLedgersAfter.xpMicroXp,
      xpPreserved: resetLedgersAfter.xpMicroXp === resetLedgersBefore.xpMicroXp,
      dailyPreserved: resetLedgersAfter.daily === resetLedgersBefore.daily,
      rewardsPreserved: resetLedgersAfter.rewards === resetLedgersBefore.rewards,
      missionsPreserved: resetLedgersAfter.missions === resetLedgersBefore.missions,
      evidencePreserved: resetLedgersAfter.evidence === resetLedgersBefore.evidence,
      economyHistoryPreserved:
        resetLedgersAfter.economyHistory === resetLedgersBefore.economyHistory + 1,
      missionCompletions: 0 as const,
      rewardGrants: 0 as const,
    },
    repeated: {
      resets: repeatedStatus.resetsRetained,
      epochs: repeatedStatus.epochs,
      sceneClosures: repeatedFixture.scene.history().length,
      duplicateClosures,
      checkpoints: repeatedFixture.checkpoints.rows.length,
      replayFacts: repeatedFixture.replay.facts.length,
      economySeries: repeatedFixture.economy.seriesHistory.length,
      bodies: [...new Set(bodies)],
      listeners: [...new Set(listeners)],
      jobs: [...new Set(jobs)],
      liveWorlds: repeatedFixture.world.liveWorlds,
      starts: repeatedFixture.world.starts,
      xpMicroXp: repeatedFixture.economy.snapshot().xpMicroXp,
      xpDecreased: repeatedFixture.economy.snapshot().xpMicroXp < repeatedXpBefore,
      profileChecksumStable: repeatedFixture.profile.active().checksum === repeatedProfileBefore,
      rewardsUnchanged: repeatedFixture.economy.snapshot().rewards === repeatedRewardsBefore,
      failedResets: repeatedStatus.failedResets,
    },
    failure: {
      refusedCode: refused.rejection.code,
      checkpointsAfterFailure,
      epochsAfterFailure: failureStatus.epochs,
      sceneClosuresAfterFailure,
      economySeriesAfterFailure,
      worldStartsAfterFailure,
      failedResets: failureStatus.failedResets,
      retryStatus: retried.status,
      retryCheckpoints: failureFixture.checkpoints.rows.length,
      retryEpochs: failureFixture.module.status().epochs,
    },
    partial: {
      stage: partial.stage,
      faultBeforeResume,
      resumeStatus: resumed.status,
      checkpoints: partialFixture.checkpoints.rows.length,
      sceneClosures: partialFixture.scene.history().length,
      economySeries: partialFixture.economy.seriesHistory.length,
      duplicateClosures: resumed.duplicateClosures,
      faultAfterResume: partialFixture.module.status().fault !== null,
    },
    style: {
      status: style.status,
      previousVersionId: style.profile.previousVersionId,
      previousChecksum: styleProfileBefore.checksum,
      versionId: style.profile.versionId,
      checksum: style.profile.checksum,
      checksumValid: styleFixture.profile.active().checksum === style.profile.checksum,
      barrier: style.barrier,
      learningEpochPrevious: style.learningEpoch.previous,
      learningEpochNext: style.learningEpoch.next,
      worldEpoch: style.worldEpoch,
      economyEpoch: style.economyEpoch,
      closedSegments: style.closedSegments,
      staleResults: style.staleResults,
      worldStarted: styleFixture.world.starts !== styleStartsBefore,
      sceneClosures: styleFixture.scene.history().length,
      checkpoints: styleFixture.checkpoints.rows.length,
      replayFacts: styleFixture.replay.facts.length,
      economySeries: styleFixture.economy.seriesHistory.length,
      xpPreserved: styleFixture.economy.snapshot().xpMicroXp === styleLedgersBefore.xpMicroXp,
      xpMicroXp: styleLedgersBefore.xpMicroXp,
      secondActivationRefused: secondStyle.status === 'REJECTED',
      activations: styleFixture.profile.activations,
    },
    distinctness: {
      recovery: recoveryEffects,
      reset: resetEffects,
      style: styleEffects,
    },
    performance: {
      validationLevel: 'targeted',
      playtest: 'NOT_PERFORMED',
      humanPlaytestClaimed: false,
      target: { proposedMs: 2000, measured: 'NOT_MEASURED' },
      deterministic: {
        ticksToMobility: recoveryResult.ticksToMobility,
        synchronousStages: recoveryResult.stages,
        workOnResetTick: 0,
        preparedResets: 1,
        concurrentCommits: 1,
      },
      storage: {
        checkpointBytes: checkpoint === null ? 0 : checkpointBytes(checkpoint),
        checkpointChecksumLength: reset.checkpointChecksum.length,
        budgetEntry: 'twoSessionCheckpointBytes',
        budgetValue: null,
      },
      unsupported: [
        'human playtest of the two-second return to driving',
        'FPS, frame p95/p99 and input-to-command latency on the real workload',
        'decor integration (PBI 227) and its body/effect budgets',
      ],
    },
    memory: {
      exactHeapBytes: null,
      reason: 'No portable exact heap API; ownership counters are reported instead of guessing',
      ownershipCounters: {
        liveWorlds: repeatedFixture.world.liveWorlds,
        residentJobs: repeatedFixture.world.residentJobs({
          sessionKind: 'ACADEMY',
          sessionId: repeatedFixture.sessionId,
          worldEpoch: repeatedFixture.module.status().epochs.worldEpoch,
          learningEpoch: repeatedFixture.module.status().epochs.learningEpoch,
        }),
        listeners: repeatedFixture.world.listeners({
          sessionKind: 'ACADEMY',
          sessionId: repeatedFixture.sessionId,
          worldEpoch: repeatedFixture.module.status().epochs.worldEpoch,
          learningEpoch: repeatedFixture.module.status().epochs.learningEpoch,
        }),
        checkpoints: repeatedFixture.checkpoints.rows.length,
        replayFacts: repeatedFixture.replay.facts.length,
        economySeries: repeatedFixture.economy.seriesHistory.length,
        missionRewardsUnchanged: reset.preserved.missions ? 1 : 0,
        rewardsSnapshotRows: resetRewardsBefore.grants.length,
      },
    },
    checks,
    summary: { checks: checks.length, passed, pass: passed === checks.length },
  };
}

/** Real wall-clock cost of the R path; written only to `cost.json`, never into `report.json`. */
export function measureRecoveryCost(iterations = 500): Readonly<{
  readonly iterations: number;
  readonly totalMs: number;
  readonly meanMs: number;
  readonly p95Ms: number;
  readonly maxMs: number;
}> {
  const samples: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const fixture = createWorldRecoveryFixture();
    const start = performance.now();
    const result = fixture.module.recoverVehicle({ tick: 10 + index, origin: 'R' });
    const end = performance.now();
    if (result.status !== 'RECOVERED') throw new Error('The cost probe R failed');
    samples.push(end - start);
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const total = samples.reduce((sum, value) => sum + value, 0);
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return Object.freeze({
    iterations,
    totalMs: Math.round(total * 1000) / 1000,
    meanMs: Math.round((total / samples.length) * 1000) / 1000,
    p95Ms: Math.round(sorted[p95Index]! * 1000) / 1000,
    maxMs: Math.round(sorted[sorted.length - 1]! * 1000) / 1000,
  });
}

export function worldRecoveryReportMarkdown(report: WorldRecoveryReport): string {
  const rows = report.checks
    .map(
      (entry) =>
        `| ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.name} | \`${JSON.stringify(entry.actual)}\` |`,
    )
    .join('\n');
  return `# Raport determinist PBI 226 — deblocare, resetul orașului și stil păstrat

Contract: \`${report.version}\` · fixture: \`${report.fixture}\` · ceas fix: \`${report.fixedNow}\`.

## Structura

- Operații separate: ${report.structure.operations.join(', ')}.
- Coduri de refuz închise: ${String(report.structure.codes)}.
- Motive publicate: reset \`${report.structure.resetReason}\`, pasager \`${report.structure.passengerReason}\`.
- Vocabularul 207 confirmat: finalize=${String(report.structure.replayVocabulary.finalizeReasonPublished)}, discontinuitate=${String(report.structure.replayVocabulary.discontinuityPublished)}, tip eveniment=${String(report.structure.replayVocabulary.eventTypePublished)}.

## R (numai deblocarea)

- Punct validat: \`${report.recovery.pointId}\` pe banda \`${report.recovery.laneId}\` (${report.recovery.access}).
- Collidere la plasare: ${String(report.recovery.colliderCount)}; mobilitate publicată: ${String(report.recovery.restoredStatePublished)} (viteză după ${String(report.recovery.mobilityVelocityMps)} m/s).
- Tick-uri până la mobilitate: ${String(report.recovery.ticksToMobility)}; etape sincrone: ${String(report.recovery.stages)}.
- XP: ${String(report.recovery.xpBeforeMicroXp)} → ${String(report.recovery.xpAfterMicroXp)} micro-XP (delta ${String(report.recovery.xpDeltaMicroXp)}).
- Epoce schimbate: ${String(report.recovery.epochsChanged)}; profil schimbat: ${String(report.recovery.profileChanged)}; lume repornită: ${String(report.recovery.worldStarted)}; checkpoint scris: ${String(report.recovery.checkpointCommitted)}; serie economică deschisă: ${String(report.recovery.economySeriesOpened)}.

## R cu pasager

- Închideri la primul R: ${String(report.passenger.firstClosures)} (\`${report.passenger.reason}\`, revenue ${String(report.passenger.revenue)}, terminal ${String(report.passenger.terminal)}).
- Al doilea R închide: ${String(report.passenger.secondClosures)}; istoric rămâne ${String(report.passenger.historyAfterSecond)}.
- O singură încheiere FAILED: ${String(report.passenger.singleFailedClosure)}; XP ${String(report.passenger.xpBeforeMicroXp)} → ${String(report.passenger.xpAfterMicroXp)}.

## Haos

- Provocare închisă: ${String(report.haos.closedActivities)}; reluări: ${String(report.haos.retries)} (${report.haos.retryStatus}) la tick ${String(report.haos.availableAtTick)}, așteptare ${String(report.haos.ticksWaited)}.
- Academia nu declară reluare: ${String(report.haos.academyRetries)}.

## Resetul orașului

- Plan fără efecte secundare: ${String(report.reset.planIsSideEffectFree)}; activități: ${report.reset.preparedActivities.join(', ') || '(niciuna)'}.
- Epoce: ${String(report.reset.previous.worldEpoch)}/${String(report.reset.previous.learningEpoch)}/${String(report.reset.previous.economyEpoch)} → ${String(report.reset.epochs.worldEpoch)}/${String(report.reset.epochs.learningEpoch)}/${String(report.reset.epochs.economyEpoch)}.
- Activități închise: ${String(report.reset.closedActivities)} (${report.reset.terminalReasons.join(', ')}), revenue ${report.reset.revenue.join(', ')}.
- Segmente închise ${String(report.reset.closedSegments)}, joburi invalidate ${String(report.reset.invalidatedJobs)}, inputuri eliberate ${String(report.reset.releasedInputs)}.
- Lume nouă: ${String(report.reset.bodies)} corpuri, ${String(report.reset.trafficVehicles)} vehicule de trafic, ${String(report.reset.listeners)} listener, ${String(report.reset.jobs)} joburi, ${String(report.reset.liveWorlds)} lume vie, lansare ${report.reset.launch}.
- Serie economică: ${String(report.reset.economySeries.previousEpoch)} → ${String(report.reset.economySeries.epoch)} (\`${report.reset.economySeries.seriesId}\`, istoric ${String(report.reset.economySeries.history)}).
- Replay: \`${report.reset.replay.eventId}\`, discontinuitate ${String(report.reset.replay.discontinuity)}, motiv ${report.reset.replay.finalizeReason}.
- Checkpoint: \`${report.reset.checkpointId}\`, ${String(report.reset.checkpointBytes)} bytes, checksum ${String(report.reset.checkpointChecksumLength)} caractere, anterior ${String(report.reset.previousCheckpointId)}.
- Păstrate: profil ${String(report.reset.profilePreserved)}, XP ${String(report.reset.xpPreserved)}, daily ${String(report.reset.dailyPreserved)}, rewards ${String(report.reset.rewardsPreserved)}, misiuni ${String(report.reset.missionsPreserved)}, dovezi ${String(report.reset.evidencePreserved)}.
- Finalizări de misiune: ${String(report.reset.missionCompletions)}; recompense acordate: ${String(report.reset.rewardGrants)}.

## Douăzeci de reseturi

- Reseturi: ${String(report.repeated.resets)}; epoce ${String(report.repeated.epochs.worldEpoch)}/${String(report.repeated.epochs.learningEpoch)}/${String(report.repeated.epochs.economyEpoch)}.
- Închideri de scenă: ${String(report.repeated.sceneClosures)}; duplicate: ${String(report.repeated.duplicateClosures)}.
- Checkpointuri ${String(report.repeated.checkpoints)}, fapte de replay ${String(report.repeated.replayFacts)}, serii economice ${String(report.repeated.economySeries)}.
- Corpuri ${report.repeated.bodies.join(', ')}, listeners ${report.repeated.listeners.join(', ')}, joburi ${report.repeated.jobs.join(', ')}, lumi vii ${String(report.repeated.liveWorlds)}, porniri ${String(report.repeated.starts)}.
- XP ${String(report.repeated.xpMicroXp)} (scăzut: ${String(report.repeated.xpDecreased)}), profil stabil ${String(report.repeated.profileChecksumStable)}, rewards neschimbate ${String(report.repeated.rewardsUnchanged)}.

## Eșec și reluare

- Commit refuzat: \`${report.failure.refusedCode}\`; checkpointuri ${String(report.failure.checkpointsAfterFailure)}; epoce ${String(report.failure.epochsAfterFailure.worldEpoch)}/${String(report.failure.epochsAfterFailure.learningEpoch)}/${String(report.failure.epochsAfterFailure.economyEpoch)}; închideri ${String(report.failure.sceneClosuresAfterFailure)}; serii ${String(report.failure.economySeriesAfterFailure)}; porniri ${String(report.failure.worldStartsAfterFailure)}.
- Reîncercare: ${report.failure.retryStatus}, checkpointuri ${String(report.failure.retryCheckpoints)}, epoce ${String(report.failure.retryEpochs.worldEpoch)}/${String(report.failure.retryEpochs.learningEpoch)}/${String(report.failure.retryEpochs.economyEpoch)}.
- Reset parțial: etapa \`${report.partial.stage}\`, fault ${String(report.partial.faultBeforeResume)}, reluare ${report.partial.resumeStatus}, checkpointuri ${String(report.partial.checkpoints)}, închideri ${String(report.partial.sceneClosures)}, serii ${String(report.partial.economySeries)}, duplicate ${String(report.partial.duplicateClosures)}.

## Stilul

- Versiune: \`${report.style.previousVersionId}\` → \`${report.style.versionId}\`; checksum valid ${String(report.style.checksumValid)}.
- Barieră ${report.style.barrier}: learningEpoch ${String(report.style.learningEpochPrevious)} → ${String(report.style.learningEpochNext)}; worldEpoch ${String(report.style.worldEpoch)}, economyEpoch ${String(report.style.economyEpoch)}.
- Lume neatinsă: ${String(report.style.worldStarted === false)}; închideri ${String(report.style.sceneClosures)}, checkpointuri ${String(report.style.checkpoints)}, fapte replay ${String(report.style.replayFacts)}, serii ${String(report.style.economySeries)}.
- XP păstrat ${String(report.style.xpPreserved)} (${String(report.style.xpMicroXp)}); a doua activare refuzată ${String(report.style.secondActivationRefused)}.

## Performanță și nivel de validare

- Nivel: \`${report.performance.validationLevel}\`; playtest: ${report.performance.playtest}; afirmație de playtest uman: ${String(report.performance.humanPlaytestClaimed)}.
- Ținta propusă de ${String(report.performance.target.proposedMs)} ms: ${report.performance.target.measured}.
- Determinist: ${String(report.performance.deterministic.ticksToMobility)} tick-uri până la mobilitate, ${String(report.performance.deterministic.synchronousStages)} etape sincrone, ${String(report.performance.deterministic.workOnResetTick)} muncă în tickul resetului, ${String(report.performance.deterministic.preparedResets)} reset pregătit, ${String(report.performance.deterministic.concurrentCommits)} commit simultan.
- Storage: checkpoint ${String(report.performance.storage.checkpointBytes)} bytes; ${report.performance.storage.budgetEntry} rămâne \`null\` în manifest (nemăsurat, nu inventat).
- Nemăsurat: ${report.performance.unsupported.join('; ')}.
- Heap exact: \`null\` (${report.memory.reason}).

## Verificări

| Rezultat | Verificare | Valoare |
| --- | --- | --- |
${rows}

Rezumat: ${String(report.summary.passed)}/${String(report.summary.checks)} verificări, ${report.summary.pass ? 'PASS' : 'FAIL'}.
`;
}

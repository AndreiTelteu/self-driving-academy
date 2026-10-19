import { parameterDefinitions, parsePublishableDrivingProfile } from '../../src/profiles';
import type { DrivingProfile } from '../../src/profiles';
import { createParameterEvidenceLedger } from '../../src/learning/parameter-evidence';
import type { ParameterEvidenceReadModel } from '../../src/learning/parameter-evidence';
import { estimateSpeedParameters } from '../../src/learning/speed-estimator';
import type { SpeedEstimatorObservation } from '../../src/learning/speed-estimator';
import { estimateAccelerationParameters } from '../../src/learning/acceleration-estimator';
import type { AccelerationEstimatorObservation } from '../../src/learning/acceleration-estimator';
import { estimateStopYieldParameters } from '../../src/learning/stop-yield-estimator';
import type { StopYieldEstimatorObservation } from '../../src/learning/stop-yield-estimator';
import {
  EARLY_LOOP_KEYS,
  compileEarlyLoopControllerProfiles,
  composeEarlyLoopProfile,
} from '../../src/learning/early-loop';
import type {
  EarlyLoopCandidates,
  EarlyLoopControllerProfiles,
  EarlyLoopKey,
  EarlyLoopProfile,
  EarlyLoopSource,
} from '../../src/learning/early-loop';
import { mechanicalCapabilities } from '../../src/telemetry';
import type {
  EligibilityWindowRecord,
  FilteredWindowRecord,
  NormalizedVehicleWindow,
  OpportunityDenominators,
  OpportunityRecord,
} from '../../src/telemetry';

/**
 * Pure playtest session model for PBI 204 stage 4.
 *
 * The browser page feeds real per-tick driving observations into this module; this module turns
 * them into the minimum 085-style fact subset that the real 093 ledger, 094/095/098 estimators and
 * the early-loop adapters read. It does not run the production 069/085 recorder, 086 registry,
 * 087 eligibility windows or 088 artefact filter. The fact records below are therefore explicitly
 * labelled as an adapted subset, not as full telemetry output.
 *
 * MANUAL records the same raw ticks for display, but builds no evidence windows and no profile
 * delta. Nothing here reads or writes localStorage, the DOM or the network.
 */

export const PLAYTEST_SCHEMA = '204-playtest-v2' as const;
export const PLAYTEST_TICK_HZ = 60;
export const PLAYTEST_DURATION_TICKS = 300 * PLAYTEST_TICK_HZ;
export const EARLY_PLAYTEST_BASE_VERSION = '204-playtest-base-v1' as const;
export const FREE_WINDOW_MINIMUM_TICKS = 600;
export const ACCELERATION_EPISODE_MINIMUM_TICKS = 30;
export const ACCELERATION_EPISODE_MAXIMUM_TICKS = 300;
export const ACCELERATION_COOLDOWN_TICKS = 120;
export const STOP_APPROACH_METERS = 60;
export const STOP_STANDSTILL_MPS = 0.15;
export const FULL_STOP_DWELL_TICKS = 30;
export const STOP_LINE_OFFSET_LIMIT_M = 5;
export const PLAYTEST_TRACE_STRIDE = 6;

export type PlaytestMode = 'LEARNING' | 'MANUAL';
export type PlaytestFinishReason = 'timer' | 'finish' | 'developer';

export interface PlaytestTickObservation {
  readonly tick: number;
  readonly throttle: number;
  readonly brake: number;
  readonly steering: number;
  readonly speedMps: number;
  readonly accelerationMps2: number;
  /** Metres from the ego to the next STOP line, positive before it; null when none is pending. */
  readonly distanceToStopLineM: number | null;
  readonly stopLineId: string | null;
  /** Set on the tick where the ego crossed that STOP line. */
  readonly crossedStopLineId: string | null;
  readonly postedLimitMps: number;
}

export interface PlaytestSpeedSample {
  readonly tick: number;
  readonly speedMps: number;
}

export interface PlaytestFreeWindow {
  readonly startTick: number;
  readonly endTick: number;
  readonly speedSamples: readonly PlaytestSpeedSample[];
}

export interface PlaytestAccelerationEpisode {
  readonly startTick: number;
  readonly endTick: number;
  readonly medianAccelerationMps2: number;
  readonly jerkSamplesMps3: readonly number[];
}

export interface PlaytestStopEpisode {
  readonly opportunityId: string;
  readonly stopLineId: string;
  readonly occurrence: number;
  readonly startTick: number;
  readonly endTick: number;
  readonly fullStop: boolean;
  readonly dwellTicks: number;
  readonly stopLineOffsetM: number;
  readonly minSpeedMps: number;
}

export interface PlaytestDrive {
  readonly mode: PlaytestMode;
  readonly sessionId: string;
  readonly vehicleId: string;
  readonly incarnation: string;
  readonly classId: 'sedan' | 'compact';
  readonly startedTick: number;
  readonly lastTick: number;
  readonly samples: readonly PlaytestTickObservation[];
  readonly freeWindows: readonly PlaytestFreeWindow[];
  readonly accelerationEpisodes: readonly PlaytestAccelerationEpisode[];
  readonly stopEpisodes: readonly PlaytestStopEpisode[];
  readonly abandonedStopApproaches: number;
  readonly maximumSpeedMps: number;
  readonly distanceM: number;
}

export interface PlaytestProgress {
  readonly ticks: number;
  readonly elapsedS: number;
  readonly freeWindows: number;
  readonly accelerationEpisodes: number;
  readonly stopEpisodes: number;
  readonly fullStops: number;
  readonly rollingStops: number;
}

export interface PlaytestRecorderOptions {
  readonly mode: PlaytestMode;
  readonly sessionId: string;
  readonly vehicleId: string;
  readonly incarnation: string;
  readonly classId: 'sedan' | 'compact';
}

export interface PlaytestRecorder {
  readonly mode: PlaytestMode;
  record(observation: PlaytestTickObservation): void;
  progress(): PlaytestProgress;
  finish(): PlaytestDrive;
}

interface MutableFreeRun {
  startTick: number;
  lastTick: number;
}

interface MutableAccelerationRun {
  startTick: number;
  lastTick: number;
  values: number[];
}

interface MutableStopApproach {
  stopLineId: string;
  opportunityId: string;
  occurrence: number;
  startTick: number;
  lastTick: number;
  minDistanceM: number;
  minSpeedMps: number;
  heldTicks: number;
}

const FREE_WINDOW_SAMPLE_STRIDE = 3;
const ACCELERATION_WARMUP_TICKS = 6;
const STOP_APPROACH_LOST_TICKS = 90;

function finite(value: number, label: string): number {
  if (!Number.isFinite(value))
    throw new RangeError(`Playtest observation has a non-finite ${label}`);
  return value;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function accumulate(samples: readonly PlaytestTickObservation[]): readonly PlaytestSpeedSample[] {
  return Object.freeze(
    samples
      .filter((_, index) => index % FREE_WINDOW_SAMPLE_STRIDE === 0)
      .map((sample) => Object.freeze({ tick: sample.tick, speedMps: sample.speedMps })),
  );
}

export function createPlaytestRecorder(options: PlaytestRecorderOptions): PlaytestRecorder {
  if (options.sessionId.length === 0) throw new Error('Playtest session id is required');
  if (options.vehicleId.length === 0) throw new Error('Playtest vehicle id is required');
  if (options.incarnation.length === 0) throw new Error('Playtest incarnation is required');
  const samples: PlaytestTickObservation[] = [];
  const freeWindows: PlaytestFreeWindow[] = [];
  const accelerationEpisodes: PlaytestAccelerationEpisode[] = [];
  const stopEpisodes: PlaytestStopEpisode[] = [];
  const occurrences = new Map<string, number>();
  let freeRun: MutableFreeRun | null = null;
  let accelerationRun: MutableAccelerationRun | null = null;
  let accelerationCooldownUntil = 0;
  let stopApproach: MutableStopApproach | null = null;
  let abandonedStopApproaches = 0;
  let lastTick: number | null = null;
  let finished: PlaytestDrive | null = null;

  function closeFreeWindow(): void {
    if (freeRun === null) return;
    const duration = freeRun.lastTick - freeRun.startTick + 1;
    if (duration >= FREE_WINDOW_MINIMUM_TICKS) {
      freeWindows.push(
        Object.freeze({
          startTick: freeRun.startTick,
          endTick: freeRun.lastTick,
          speedSamples: accumulate(
            samples.filter(
              (sample) => sample.tick >= freeRun!.startTick && sample.tick <= freeRun!.lastTick,
            ),
          ),
        }),
      );
    }
    freeRun = null;
  }

  function closeAccelerationEpisode(): void {
    if (accelerationRun === null) return;
    const duration = accelerationRun.lastTick - accelerationRun.startTick + 1;
    if (duration >= ACCELERATION_EPISODE_MINIMUM_TICKS && accelerationRun.values.length >= 10) {
      const values = accelerationRun.values;
      const jerk: number[] = [];
      for (let index = 1; index < values.length; index += 1)
        jerk.push(Math.abs(values[index]! - values[index - 1]!) * PLAYTEST_TICK_HZ);
      accelerationEpisodes.push(
        Object.freeze({
          startTick: accelerationRun.startTick,
          endTick: accelerationRun.lastTick,
          medianAccelerationMps2: median(values),
          jerkSamplesMps3: Object.freeze(jerk.slice(0, 30)),
        }),
      );
      accelerationCooldownUntil = accelerationRun.lastTick + ACCELERATION_COOLDOWN_TICKS;
    }
    accelerationRun = null;
  }

  function closeStopApproach(crossed: boolean): void {
    if (stopApproach === null) return;
    if (crossed) {
      const fullStop = stopApproach.heldTicks >= FULL_STOP_DWELL_TICKS;
      stopEpisodes.push(
        Object.freeze({
          opportunityId: stopApproach.opportunityId,
          stopLineId: stopApproach.stopLineId,
          occurrence: stopApproach.occurrence,
          startTick: stopApproach.startTick,
          endTick: stopApproach.lastTick,
          fullStop,
          dwellTicks: fullStop ? stopApproach.heldTicks : 0,
          stopLineOffsetM: Math.min(
            STOP_LINE_OFFSET_LIMIT_M,
            Math.max(0, stopApproach.minDistanceM),
          ),
          minSpeedMps: stopApproach.minSpeedMps,
        }),
      );
    } else abandonedStopApproaches += 1;
    stopApproach = null;
  }

  function record(observation: PlaytestTickObservation): void {
    if (finished !== null) throw new Error('Playtest recorder is already finished');
    const tick = observation.tick;
    if (!Number.isSafeInteger(tick) || tick < 1) throw new RangeError('Invalid playtest tick');
    if (lastTick !== null && tick <= lastTick)
      throw new RangeError('Playtest ticks must strictly increase');
    if (tick > PLAYTEST_DURATION_TICKS)
      throw new RangeError('Playtest tick exceeds the five-minute session');
    finite(observation.throttle, 'throttle');
    finite(observation.brake, 'brake');
    finite(observation.steering, 'steering');
    finite(observation.speedMps, 'speed');
    finite(observation.accelerationMps2, 'acceleration');
    finite(observation.postedLimitMps, 'posted limit');
    if (observation.postedLimitMps <= 0)
      throw new RangeError('Playtest posted limit must be positive');
    if (observation.throttle < 0 || observation.throttle > 1)
      throw new RangeError('Playtest throttle outside 0..1');
    if (observation.brake < 0 || observation.brake > 1)
      throw new RangeError('Playtest brake outside 0..1');
    if (observation.speedMps < 0) throw new RangeError('Playtest speed must be non-negative');
    if (observation.distanceToStopLineM !== null) {
      finite(observation.distanceToStopLineM, 'stop-line distance');
      if (observation.stopLineId === null)
        throw new Error('Playtest stop-line distance requires a stop-line identity');
    }
    lastTick = tick;
    samples.push(Object.freeze({ ...observation }));

    const free =
      observation.speedMps > 1 &&
      (observation.distanceToStopLineM === null || observation.distanceToStopLineM > 50);
    if (free) {
      if (freeRun === null) {
        freeRun = { startTick: tick, lastTick: tick };
      } else if (tick - freeRun.lastTick <= 3) {
        freeRun.lastTick = tick;
      } else {
        closeFreeWindow();
        freeRun = { startTick: tick, lastTick: tick };
      }
    } else {
      closeFreeWindow();
    }

    const accelerating =
      observation.throttle > 0.15 &&
      observation.accelerationMps2 > 0.2 &&
      observation.speedMps < observation.postedLimitMps + 4;
    if (accelerationRun === null) {
      if (accelerating && tick >= accelerationCooldownUntil)
        accelerationRun = { startTick: tick, lastTick: tick, values: [] };
    } else if (accelerating && tick - accelerationRun.lastTick <= 2) {
      accelerationRun.lastTick = tick;
      if (tick - accelerationRun.startTick >= ACCELERATION_WARMUP_TICKS)
        accelerationRun.values.push(observation.accelerationMps2);
      if (tick - accelerationRun.startTick >= ACCELERATION_EPISODE_MAXIMUM_TICKS)
        closeAccelerationEpisode();
    } else {
      closeAccelerationEpisode();
    }

    if (observation.crossedStopLineId !== null) {
      if (stopApproach?.stopLineId === observation.crossedStopLineId) closeStopApproach(true);
    }
    const distance = observation.distanceToStopLineM;
    const justCrossedThisLine =
      observation.crossedStopLineId !== null &&
      observation.stopLineId === observation.crossedStopLineId;
    if (
      !justCrossedThisLine &&
      distance !== null &&
      distance <= STOP_APPROACH_METERS &&
      distance >= -1
    ) {
      const stopLineId = observation.stopLineId!;
      if (stopApproach === null || stopApproach.stopLineId !== stopLineId) {
        if (stopApproach !== null) closeStopApproach(false);
        const occurrence = (occurrences.get(stopLineId) ?? 0) + 1;
        occurrences.set(stopLineId, occurrence);
        stopApproach = {
          stopLineId,
          opportunityId: `stop-${stopLineId}-${occurrence}`,
          occurrence,
          startTick: tick,
          lastTick: tick,
          minDistanceM: Math.max(0, distance),
          minSpeedMps: observation.speedMps,
          heldTicks: 0,
        };
      }
      stopApproach.lastTick = tick;
      stopApproach.minDistanceM = Math.min(stopApproach.minDistanceM, Math.max(0, distance));
      stopApproach.minSpeedMps = Math.min(stopApproach.minSpeedMps, observation.speedMps);
      if (observation.speedMps <= STOP_STANDSTILL_MPS && distance <= 8) stopApproach.heldTicks += 1;
    } else if (stopApproach !== null && tick - stopApproach.lastTick > STOP_APPROACH_LOST_TICKS) {
      closeStopApproach(false);
    }
  }

  function progress(): PlaytestProgress {
    const fullStops = stopEpisodes.filter((episode) => episode.fullStop).length;
    return Object.freeze({
      ticks: samples.length,
      elapsedS: samples.length / PLAYTEST_TICK_HZ,
      freeWindows: freeWindows.length,
      accelerationEpisodes: accelerationEpisodes.length,
      stopEpisodes: stopEpisodes.length,
      fullStops,
      rollingStops: stopEpisodes.length - fullStops,
    });
  }

  function finish(): PlaytestDrive {
    if (finished !== null) return finished;
    closeFreeWindow();
    closeAccelerationEpisode();
    closeStopApproach(false);
    let distanceM = 0;
    let maximumSpeedMps = 0;
    for (let index = 1; index < samples.length; index += 1)
      distanceM += (samples[index - 1]!.speedMps + samples[index]!.speedMps) / 2 / PLAYTEST_TICK_HZ;
    for (const sample of samples) maximumSpeedMps = Math.max(maximumSpeedMps, sample.speedMps);
    finished = Object.freeze({
      mode: options.mode,
      sessionId: options.sessionId,
      vehicleId: options.vehicleId,
      incarnation: options.incarnation,
      classId: options.classId,
      startedTick: 1,
      lastTick: samples.length,
      samples: Object.freeze([...samples]),
      freeWindows: Object.freeze([...freeWindows]),
      accelerationEpisodes: Object.freeze([...accelerationEpisodes]),
      stopEpisodes: Object.freeze([...stopEpisodes]),
      abandonedStopApproaches,
      maximumSpeedMps,
      distanceM,
    });
    return finished;
  }

  return Object.freeze({ mode: options.mode, record, progress, finish });
}

/** The documented baseline used by the native 204 fixture and this playtest. */
export function createPlaytestBaseProfile(): DrivingProfile {
  const values = Object.fromEntries(
    parameterDefinitions.map((definition) => [definition.key, definition.default]),
  ) as Record<string, number>;
  values.stop_full_probability = 0.6;
  return parsePublishableDrivingProfile({
    schemaVersion: 1,
    units: 'SI',
    profileId: '204-playtest-base',
    versionId: EARLY_PLAYTEST_BASE_VERSION,
    parentVersionId: null,
    engineVersion: '204-playtest-engine',
    parameters: values,
    unitsByParameter: Object.fromEntries(
      parameterDefinitions.map((definition) => [definition.key, definition.unit]),
    ),
    provenanceByParameter: Object.fromEntries(
      parameterDefinitions.map((definition) => [definition.key, 'BASE']),
    ),
    evidenceByParameter: Object.fromEntries(
      parameterDefinitions.map((definition) => [definition.key, null]),
    ),
    sourceSegmentIds: [],
    createdAt: '2026-10-19T00:00:00.000Z',
    checksum: '204-playtest-base-checksum',
  });
}

const KEY_LABELS: Readonly<Record<EarlyLoopKey, string>> = Object.freeze({
  speed_delta_urban: 'Viteză urbană',
  desired_acceleration: 'Accelerație dorită',
  stop_full_probability: 'Opritori complete la STOP',
});
const KEY_UNITS: Readonly<Record<EarlyLoopKey, string>> = Object.freeze({
  speed_delta_urban: 'm/s',
  desired_acceleration: 'm/s²',
  stop_full_probability: 'probabilitate',
});
export { KEY_LABELS, KEY_UNITS };

export interface PlaytestKeyResult {
  readonly key: EarlyLoopKey;
  readonly label: string;
  readonly unit: string;
  readonly before: number;
  readonly candidate: number | null;
  readonly after: number;
  readonly delta: number;
  readonly blend: number;
  readonly quality: number;
  readonly sourceEpisodeCount: number;
  readonly evidenceStatus: string;
  readonly evidenceEpisodes: number;
  readonly unchangedReason: string | null;
  readonly changed: boolean;
}

export interface PlaytestEvidenceRow {
  readonly key: EarlyLoopKey;
  readonly status: string;
  readonly distinctEpisodes: number;
  readonly quality: number;
  readonly noEstimate: string | null;
}

export interface PlaytestCandidateRow {
  readonly key: EarlyLoopKey;
  readonly status: string;
  readonly value: number | null;
  readonly quality: number;
  readonly sourceEpisodeCount: number;
}

export interface PlaytestManualProof {
  readonly evidenceEpisodes: number;
  readonly maximumParameterDelta: number;
  readonly profileUnchanged: boolean;
  readonly learningTokensNull: boolean;
  readonly statement: string;
}

export interface PlaytestResult {
  readonly mode: PlaytestMode;
  readonly baseProfile: DrivingProfile;
  readonly earlyLoop: EarlyLoopProfile;
  readonly tokens: EarlyLoopControllerProfiles;
  readonly evidence: readonly PlaytestEvidenceRow[];
  readonly candidates: readonly PlaytestCandidateRow[];
  readonly keys: readonly PlaytestKeyResult[];
  readonly unchangedSurfaceKeys: number;
  readonly manual: PlaytestManualProof | null;
  readonly observed: {
    readonly ticks: number;
    readonly elapsedS: number;
    readonly distanceM: number;
    readonly maximumSpeedMps: number;
    readonly freeWindows: number;
    readonly accelerationEpisodes: number;
    readonly stopApproaches: number;
    readonly fullStops: number;
    readonly rollingStops: number;
    readonly abandonedStopApproaches: number;
    readonly evidenceSamples: number;
  };
}

interface EpisodeIdentity {
  readonly opportunityId: string;
  readonly windowId: string;
  readonly segmentId: string;
  readonly vehicleId: string;
  readonly incarnation: string;
}

function identityFor(
  drive: PlaytestDrive,
  channel: string,
  index: number,
  stopLineId?: string,
): EpisodeIdentity {
  const suffix = String(index + 1).padStart(2, '0');
  const opportunityId =
    stopLineId === undefined ? `playtest-${channel}-${suffix}` : `stop-${stopLineId}-${suffix}`;
  return {
    opportunityId,
    windowId: `window-${opportunityId}`,
    segmentId: `segment-${drive.sessionId}-${channel}-${suffix}`,
    vehicleId: drive.vehicleId,
    incarnation: drive.incarnation,
  };
}

function buildEligibility(
  identity: EpisodeIdentity,
  kind: 'STOP' | 'YIELD',
  mode: PlaytestMode,
  startTick: number,
  endTick: number,
): EligibilityWindowRecord {
  // Minimum subset read by 093/094/095/098. The playtest does not run 087's full eligibility
  // producer; the scene supplies no leader, signal, suspension or impact facts.
  return Object.freeze({
    windowId: identity.windowId,
    opportunityId: identity.opportunityId,
    kind,
    reason: 'NO_CONSTRAINT',
    source: 'NONE',
    observable: true,
    vehicleId: identity.vehicleId,
    incarnation: identity.incarnation,
    segmentId: identity.segmentId,
    controlMode: mode,
    learningEligible: true,
    openedTick: startTick,
    lastTick: endTick,
    observationCount: endTick - startTick + 1,
    reaction: { open: false, reason: 'SEGMENT_CLOSED' },
    windowClass: 'ELIGIBLE',
    label: 'FREE_TRAFFIC',
  } as unknown as EligibilityWindowRecord);
}

function buildArtifacts(
  identity: EpisodeIdentity,
  mode: PlaytestMode,
  startTick: number,
  endTick: number,
  sessionId: string,
): FilteredWindowRecord {
  return Object.freeze({
    windowId: identity.windowId,
    sessionId,
    worldEpoch: 1,
    segmentId: identity.segmentId,
    vehicleId: identity.vehicleId,
    incarnation: identity.incarnation,
    controlMode: mode,
    learningEligible: true,
    startTick,
    endTick,
    completeness: 'COMPLETE',
    completenessReason: 'SEGMENT_CLOSED',
    artifacts: [],
    artifactCount: 0,
    boundaryTick: null,
    boundaryCause: null,
    suppressed: null,
    openedTick: startTick,
    lastTick: endTick,
    observationCount: endTick - startTick + 1,
    windowClass: 'PREFIX_ELIGIBLE',
    prefix: { fromTick: startTick, toTick: endTick, ticks: endTick - startTick + 1 },
  } as unknown as FilteredWindowRecord);
}

function buildOpportunity(
  identity: EpisodeIdentity,
  occurrence: number,
  startTick: number,
  endTick: number,
  outcome: 'STOPPED' | 'CROSSED_WITHOUT_STOP',
): OpportunityRecord {
  const full = outcome === 'STOPPED';
  return Object.freeze({
    id: identity.opportunityId,
    kind: 'STOP',
    state: 'RESOLVED',
    outcome,
    result: full ? 'SUCCESS' : 'FAILURE',
    truncationReason: null,
    vehicleId: identity.vehicleId,
    incarnation: identity.incarnation,
    segmentIds: [identity.segmentId],
    learningEligible: true,
    occurrence,
    openedTick: startTick,
    lastTick: endTick,
    resolvedTick: endTick,
    observationCount: endTick - startTick + 1,
    stimulus: {},
  } as unknown as OpportunityRecord);
}

function buildNormalized(
  identity: EpisodeIdentity,
  episode: PlaytestAccelerationEpisode,
  classId: 'sedan' | 'compact',
  startTick: number,
  endTick: number,
): NormalizedVehicleWindow {
  const capability = mechanicalCapabilities(classId);
  const demand = Math.max(
    0,
    Math.min(1, episode.medianAccelerationMps2 / capability.maxAccelerationMps2),
  );
  return Object.freeze({
    version: '089-vehicle-normalization-v1',
    featureId: `feature-${identity.windowId}`,
    windowId: identity.windowId,
    opportunityId: identity.opportunityId,
    kind: 'STOP',
    segmentId: identity.segmentId,
    vehicleId: identity.vehicleId,
    incarnation: identity.incarnation,
    classId,
    classVersion: '023-mechanics-v1',
    capability,
    completeness: 'COMPLETE',
    completenessReason: 'SEGMENT_CLOSED',
    eligibilityClass: 'ELIGIBLE',
    usableFromTick: startTick,
    usableToTick: endTick,
    usableTicks: endTick - startTick + 1,
    sampledTicks: episode.endTick - episode.startTick + 1,
    sampleCoverage: 1,
    saturationFraction: 0,
    minSaturatedTicks: 1,
    openedTick: startTick,
    lastTick: endTick,
    observationCount: endTick - startTick + 1,
    windowClass: 'NORMALIZED',
    demandStatus: 'INTENTIONAL',
    features: {
      accelerationDemand: demand,
      decelerationDemand: 0.1,
      lateralDemand: 0.05,
      aggressiveness: demand,
      aggressivenessIsLowerBound: false,
      demandPercentile: 0.5,
      raw: {
        longitudinalAccelerationMps2: episode.medianAccelerationMps2,
        longitudinalDecelerationMps2: 0,
        lateralAccelerationMps2: 0,
      },
      intent: { throttle: demand, brake: 0, steering: 0 },
    },
    capabilityMarks: [],
  } as unknown as NormalizedVehicleWindow);
}

interface PlaytestObservations {
  readonly ledger: ReturnType<typeof createParameterEvidenceLedger>;
  readonly speed: readonly SpeedEstimatorObservation[];
  readonly acceleration: readonly AccelerationEstimatorObservation[];
  readonly stop: readonly StopYieldEstimatorObservation[];
  readonly denominators: OpportunityDenominators;
  readonly sources: Readonly<Record<EarlyLoopKey, EarlyLoopSource>>;
}

function emptyDenominators(): OpportunityDenominators {
  const byKind = (['STOP', 'YIELD'] as const).map((kind) =>
    Object.freeze({
      kind,
      total: 0,
      certain: 0,
      success: 0,
      failure: 0,
      incomplete: 0,
      entered: 0,
      learningEligibleCertain: 0,
    }),
  );
  return Object.freeze({
    version: '086-opportunity-ids-v1',
    total: 0,
    certain: 0,
    success: 0,
    failure: 0,
    incomplete: 0,
    entered: 0,
    learningEligibleCertain: 0,
    byKind: Object.freeze(byKind),
    truncatedByReason: Object.freeze([]),
  } as unknown as OpportunityDenominators);
}

function stopDenominators(stopEpisodes: readonly PlaytestStopEpisode[]): OpportunityDenominators {
  const full = stopEpisodes.filter((episode) => episode.fullStop).length;
  const total = stopEpisodes.length;
  const byKind = (['STOP', 'YIELD'] as const).map((kind) =>
    Object.freeze({
      kind,
      total: kind === 'STOP' ? total : 0,
      certain: kind === 'STOP' ? total : 0,
      success: kind === 'STOP' ? full : 0,
      failure: kind === 'STOP' ? total - full : 0,
      incomplete: 0,
      entered: 0,
      learningEligibleCertain: kind === 'STOP' ? total : 0,
    }),
  );
  return Object.freeze({
    version: '086-opportunity-ids-v1',
    total,
    certain: total,
    success: full,
    failure: total - full,
    incomplete: 0,
    entered: 0,
    learningEligibleCertain: total,
    byKind: Object.freeze(byKind),
    truncatedByReason: Object.freeze([]),
  } as unknown as OpportunityDenominators);
}

function emptySources(): Readonly<Record<EarlyLoopKey, EarlyLoopSource>> {
  return Object.freeze({
    speed_delta_urban: Object.freeze({ segmentIds: [], opportunityIds: [] }),
    desired_acceleration: Object.freeze({ segmentIds: [], opportunityIds: [] }),
    stop_full_probability: Object.freeze({ segmentIds: [], opportunityIds: [] }),
  });
}

function buildObservations(drive: PlaytestDrive): PlaytestObservations {
  if (drive.mode === 'MANUAL')
    return {
      ledger: createParameterEvidenceLedger(),
      speed: [],
      acceleration: [],
      stop: [],
      denominators: emptyDenominators(),
      sources: emptySources(),
    };
  const ledger = createParameterEvidenceLedger();
  const speed: SpeedEstimatorObservation[] = [];
  const acceleration: AccelerationEstimatorObservation[] = [];
  const stop: StopYieldEstimatorObservation[] = [];
  const sources: Record<EarlyLoopKey, { segmentIds: string[]; opportunityIds: string[] }> = {
    speed_delta_urban: { segmentIds: [], opportunityIds: [] },
    desired_acceleration: { segmentIds: [], opportunityIds: [] },
    stop_full_probability: { segmentIds: [], opportunityIds: [] },
  };

  for (let index = 0; index < drive.freeWindows.length; index += 1) {
    const window = drive.freeWindows[index]!;
    const identity = identityFor(drive, 'speed', index);
    const eligibility = buildEligibility(
      identity,
      'STOP',
      drive.mode,
      window.startTick,
      window.endTick,
    );
    const artifacts = buildArtifacts(
      identity,
      drive.mode,
      window.startTick,
      window.endTick,
      drive.sessionId,
    );
    const opportunity = buildOpportunity(
      identity,
      1,
      window.startTick,
      window.endTick,
      'CROSSED_WITHOUT_STOP',
    );
    ledger.observe({
      eligibility,
      opportunity,
      artifacts,
      roadType: 'urban',
      speedSamples: window.speedSamples,
    });
    speed.push(
      Object.freeze({
        eligibility,
        artifacts,
        roadKind: 'URBAN',
        postedLimitMps: 10,
        speedSamples: window.speedSamples,
        intersectionApproach: false,
        curveRadiusM: null,
        normalized: null,
      }),
    );
    sources.speed_delta_urban.segmentIds.push(identity.segmentId);
    sources.speed_delta_urban.opportunityIds.push(identity.opportunityId);
  }

  for (let index = 0; index < drive.accelerationEpisodes.length; index += 1) {
    const episode = drive.accelerationEpisodes[index]!;
    const identity = identityFor(drive, 'acceleration', index);
    const eligibility = buildEligibility(
      identity,
      'STOP',
      drive.mode,
      episode.startTick,
      episode.endTick,
    );
    const artifacts = buildArtifacts(
      identity,
      drive.mode,
      episode.startTick,
      episode.endTick,
      drive.sessionId,
    );
    const normalized = buildNormalized(
      identity,
      episode,
      drive.classId,
      episode.startTick,
      episode.endTick,
    );
    ledger.observe({
      eligibility,
      opportunity: buildOpportunity(
        identity,
        1,
        episode.startTick,
        episode.endTick,
        'CROSSED_WITHOUT_STOP',
      ),
      artifacts,
      roadType: 'urban',
      normalized,
    });
    acceleration.push(
      Object.freeze({
        eligibility,
        artifacts,
        normalized,
        jerkSamplesMps3: episode.jerkSamplesMps3,
        reactionEvidence: null,
      }),
    );
    sources.desired_acceleration.segmentIds.push(identity.segmentId);
    sources.desired_acceleration.opportunityIds.push(identity.opportunityId);
  }

  for (let index = 0; index < drive.stopEpisodes.length; index += 1) {
    const episode = drive.stopEpisodes[index]!;
    const identity: EpisodeIdentity = {
      opportunityId: episode.opportunityId,
      windowId: `window-${episode.opportunityId}`,
      segmentId: `segment-${drive.sessionId}-stop-${String(index + 1).padStart(2, '0')}`,
      vehicleId: drive.vehicleId,
      incarnation: drive.incarnation,
    };
    const eligibility = buildEligibility(
      identity,
      'STOP',
      drive.mode,
      episode.startTick,
      episode.endTick,
    );
    const artifacts = buildArtifacts(
      identity,
      drive.mode,
      episode.startTick,
      episode.endTick,
      drive.sessionId,
    );
    const opportunity = buildOpportunity(
      identity,
      episode.occurrence,
      episode.startTick,
      episode.endTick,
      episode.fullStop ? 'STOPPED' : 'CROSSED_WITHOUT_STOP',
    );
    ledger.observe({
      eligibility,
      opportunity,
      artifacts,
      roadType: 'urban',
      stopOutcome: episode.fullStop ? 'STOPPED' : 'CROSSED_WITHOUT_STOP',
    });
    stop.push(
      Object.freeze({
        eligibility,
        opportunity,
        artifacts,
        stopCause: 'STOP_LINE',
        fullStop: episode.fullStop,
        rollingStop: !episode.fullStop,
        dwellTicks: episode.fullStop ? episode.dwellTicks : undefined,
        stopLineOffsetM: episode.stopLineOffsetM,
      }),
    );
    sources.stop_full_probability.segmentIds.push(identity.segmentId);
    sources.stop_full_probability.opportunityIds.push(identity.opportunityId);
  }

  return {
    ledger,
    speed,
    acceleration,
    stop,
    denominators: stopDenominators(drive.stopEpisodes),
    sources: Object.freeze({
      speed_delta_urban: Object.freeze({
        segmentIds: Object.freeze([...sources.speed_delta_urban.segmentIds]),
        opportunityIds: Object.freeze([...sources.speed_delta_urban.opportunityIds]),
      }),
      desired_acceleration: Object.freeze({
        segmentIds: Object.freeze([...sources.desired_acceleration.segmentIds]),
        opportunityIds: Object.freeze([...sources.desired_acceleration.opportunityIds]),
      }),
      stop_full_probability: Object.freeze({
        segmentIds: Object.freeze([...sources.stop_full_probability.segmentIds]),
        opportunityIds: Object.freeze([...sources.stop_full_probability.opportunityIds]),
      }),
    }),
  };
}

function baseValues(profile: DrivingProfile): Record<EarlyLoopKey, number> {
  return {
    speed_delta_urban: profile.parameters.speed_delta_urban,
    desired_acceleration: profile.parameters.desired_acceleration,
    stop_full_probability: profile.parameters.stop_full_probability,
  };
}

function emptyCandidates(reads: readonly ParameterEvidenceReadModel[]): EarlyLoopCandidates {
  const speed = estimateSpeedParameters(reads, []);
  const acceleration = estimateAccelerationParameters(reads, []);
  const stop = estimateStopYieldParameters(reads, emptyDenominators(), []);
  return {
    speed_delta_urban: speed.candidates.speed_delta_urban,
    desired_acceleration: acceleration.candidates.desired_acceleration,
    stop_full_probability: stop.candidates.stop_full_probability,
  };
}

function maximumParameterDelta(before: DrivingProfile, after: DrivingProfile): number {
  let maximum = 0;
  for (const definition of parameterDefinitions)
    maximum = Math.max(
      maximum,
      Math.abs(before.parameters[definition.key] - after.parameters[definition.key]),
    );
  return maximum;
}

/** Runs the real 093 -> 094/095/098 -> compose -> compile chain on a recorded drive. */
export function evaluatePlaytestDrive(
  drive: PlaytestDrive,
  baseProfile: DrivingProfile = createPlaytestBaseProfile(),
): PlaytestResult {
  const evidence = buildObservations(drive);
  const reads = evidence.ledger.readAll();
  let candidates: EarlyLoopCandidates;
  if (drive.mode === 'LEARNING') {
    const speed = estimateSpeedParameters(reads, evidence.speed);
    const acceleration = estimateAccelerationParameters(reads, evidence.acceleration);
    const stop = estimateStopYieldParameters(reads, evidence.denominators, evidence.stop);
    candidates = {
      speed_delta_urban: speed.candidates.speed_delta_urban,
      desired_acceleration: acceleration.candidates.desired_acceleration,
      stop_full_probability: stop.candidates.stop_full_probability,
    };
  } else {
    candidates = emptyCandidates(reads);
  }
  const earlyLoop = composeEarlyLoopProfile(
    baseValues(baseProfile),
    reads,
    candidates,
    evidence.sources,
  );
  const tokens = compileEarlyLoopControllerProfiles('AUTO', baseProfile, earlyLoop);
  if (tokens === null) throw new Error('AUTO must compile the playtest profile');
  const learningTokens = compileEarlyLoopControllerProfiles(
    drive.mode === 'MANUAL' ? 'MANUAL' : 'LEARNING',
    baseProfile,
    earlyLoop,
  );
  const keys = EARLY_LOOP_KEYS.map((key) => {
    const value = earlyLoop.values[key];
    const evidenceRow = reads.find((row) => row.key === key)!;
    return Object.freeze({
      key,
      label: KEY_LABELS[key],
      unit: KEY_UNITS[key],
      before: value.base,
      candidate: value.candidate,
      after: value.value,
      delta: value.value - value.base,
      blend: value.blend,
      quality: value.quality,
      sourceEpisodeCount: value.sourceEpisodeCount,
      evidenceStatus: evidenceRow.status,
      evidenceEpisodes: evidenceRow.distinctEpisodes,
      unchangedReason:
        drive.mode === 'MANUAL'
          ? 'MANUAL: nicio dovadă nu a fost înregistrată'
          : value.unchangedReason,
      changed: value.candidate !== null && value.value !== value.base,
    } satisfies PlaytestKeyResult);
  });
  const fullStops = drive.stopEpisodes.filter((episode) => episode.fullStop).length;
  const manual: PlaytestManualProof | null =
    drive.mode === 'MANUAL'
      ? Object.freeze({
          evidenceEpisodes: reads.reduce((sum, row) => sum + row.distinctEpisodes, 0),
          maximumParameterDelta: maximumParameterDelta(baseProfile, tokens.profile),
          profileUnchanged:
            maximumParameterDelta(baseProfile, tokens.profile) === 0 &&
            parameterDefinitions.every(
              (definition) =>
                tokens.profile.parameters[definition.key] ===
                baseProfile.parameters[definition.key],
            ),
          learningTokensNull: learningTokens === null,
          statement:
            'MANUAL: zero episoade de dovezi, zero candidați, delta maxim 0, profil neschimbat și tokenuri LEARNING refuzate (null).',
        })
      : null;
  return Object.freeze({
    mode: drive.mode,
    baseProfile,
    earlyLoop,
    tokens,
    evidence: Object.freeze(
      EARLY_LOOP_KEYS.map((key) => {
        const row = reads.find((entry) => entry.key === key)!;
        return Object.freeze({
          key,
          status: row.status,
          distinctEpisodes: row.distinctEpisodes,
          quality: row.quality,
          noEstimate: row.noEstimate,
        });
      }),
    ),
    candidates: Object.freeze(
      EARLY_LOOP_KEYS.map((key) => {
        const row = candidates[key];
        return Object.freeze({
          key,
          status: row.status,
          value: row.value,
          quality: row.quality,
          sourceEpisodeCount: row.sourceEpisodeCount,
        });
      }),
    ),
    keys: Object.freeze(keys),
    unchangedSurfaceKeys: parameterDefinitions.length - EARLY_LOOP_KEYS.length,
    manual,
    observed: Object.freeze({
      ticks: drive.samples.length,
      elapsedS: drive.samples.length / PLAYTEST_TICK_HZ,
      distanceM: drive.distanceM,
      maximumSpeedMps: drive.maximumSpeedMps,
      freeWindows: drive.freeWindows.length,
      accelerationEpisodes: drive.accelerationEpisodes.length,
      stopApproaches: drive.stopEpisodes.length,
      fullStops,
      rollingStops: drive.stopEpisodes.length - fullStops,
      abandonedStopApproaches: drive.abandonedStopApproaches,
      evidenceSamples: drive.samples.length,
    }),
  });
}

export type PlaytestAnswer = 'yes' | 'no' | 'uncertain';
export type PlaytestObservationChoice = 'speed' | 'acceleration' | 'stop' | 'none' | 'other';

export interface PlaytestAnswers {
  readonly noticedChange: PlaytestAnswer | '';
  readonly distinguishesModes: PlaytestAnswer | '';
  readonly supportingObservation: PlaytestObservationChoice | '';
  readonly freeText: string;
}

export interface PlaytestAutoSample {
  readonly tick: number;
  readonly speedMps: number;
  readonly decision: string;
  readonly stopRequested: boolean;
}

export interface PlaytestExportInput {
  readonly participantSlot: number | null;
  readonly developerSelfTest: boolean;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly finishedBy: PlaytestFinishReason;
  readonly result: PlaytestResult;
  readonly drive: PlaytestDrive;
  readonly answers: PlaytestAnswers;
  readonly autoDemo?: readonly PlaytestAutoSample[];
}

export interface PlaytestExportRecord {
  readonly schema: typeof PLAYTEST_SCHEMA;
  readonly label: string;
  readonly participantSlot: number | null;
  readonly developerSelfTest: boolean;
  readonly mode: PlaytestMode;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly finishedBy: PlaytestFinishReason;
  readonly durationS: number;
  readonly firstVisibleChangeSeconds: number | null;
  readonly answers: PlaytestAnswers;
  readonly observed: PlaytestResult['observed'];
  readonly keys: PlaytestResult['keys'];
  readonly unchangedSurfaceKeys: number;
  readonly manual: PlaytestManualProof | null;
  readonly evidence: PlaytestResult['evidence'];
  readonly candidates: PlaytestResult['candidates'];
  readonly profile: {
    readonly baseVersionId: string;
    readonly learnedVersionId: string;
    readonly parametersBefore: Readonly<Record<string, number>>;
    readonly parametersAfter: Readonly<Record<string, number>>;
  };
  readonly trace: readonly {
    readonly tick: number;
    readonly speedMps: number;
    readonly throttle: number;
    readonly brake: number;
    readonly distanceToStopLineM: number | null;
  }[];
  readonly autoDemo: readonly PlaytestAutoSample[];
  readonly limitations: readonly string[];
}

const LIMITATIONS = Object.freeze([
  'Scena este o linie dreaptă simplificată; celelalte trei taxiuri și două civile sunt decor, fără coliziuni sau trafic emergent.',
  'Faptele 085 sunt un subset adaptat construit din eșantioanele paginii, nu ieșirea recorderului producție 069/085.',
  'Profilul rămâne în memorie, doar pentru AUTO; nu se publică LEARNED și nu se persistă.',
  'Sesiunea dovedește bucla pe o singură mașină condusă de om; nu dovedește flota, performanța sau experiența completă a jocului.',
]);

function assertAnswers(answers: PlaytestAnswers): void {
  if (
    answers.noticedChange !== 'yes' &&
    answers.noticedChange !== 'no' &&
    answers.noticedChange !== 'uncertain'
  )
    throw new Error('Questionnaire requires noticedChange');
  if (
    answers.distinguishesModes !== 'yes' &&
    answers.distinguishesModes !== 'no' &&
    answers.distinguishesModes !== 'uncertain'
  )
    throw new Error('Questionnaire requires distinguishesModes');
  if (
    answers.supportingObservation !== 'speed' &&
    answers.supportingObservation !== 'acceleration' &&
    answers.supportingObservation !== 'stop' &&
    answers.supportingObservation !== 'none' &&
    answers.supportingObservation !== 'other'
  )
    throw new Error('Questionnaire requires supportingObservation');
  if (typeof answers.freeText !== 'string')
    throw new Error('Questionnaire freeText must be a string');
}

function assertTimestamp(value: string, label: string): void {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)))
    throw new Error(`${label} must be an ISO timestamp`);
}

/** Builds the self-contained export. It never invents answers or participant identities. */
export function buildPlaytestExport(input: PlaytestExportInput): PlaytestExportRecord {
  assertTimestamp(input.startedAt, 'startedAt');
  assertTimestamp(input.finishedAt, 'finishedAt');
  if (Date.parse(input.finishedAt) < Date.parse(input.startedAt))
    throw new Error('finishedAt precedes startedAt');
  if (input.developerSelfTest) {
    if (input.participantSlot !== null)
      throw new Error('Developer self-test must not claim a participant slot');
  } else if (
    input.participantSlot === null ||
    !Number.isSafeInteger(input.participantSlot) ||
    input.participantSlot < 1 ||
    input.participantSlot > 5
  ) {
    throw new Error('Participant slot must be an integer between 1 and 5');
  }
  assertAnswers(input.answers);
  const changed = input.result.keys.some((key) => key.changed);
  const durationS = Math.max(
    0,
    Math.round((Date.parse(input.finishedAt) - Date.parse(input.startedAt)) / 1000),
  );
  return Object.freeze({
    schema: PLAYTEST_SCHEMA,
    label: input.developerSelfTest
      ? 'developer self-test, not a participant'
      : `participant slot ${input.participantSlot}`,
    participantSlot: input.participantSlot,
    developerSelfTest: input.developerSelfTest,
    mode: input.result.mode,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    finishedBy: input.finishedBy,
    durationS,
    firstVisibleChangeSeconds: changed ? durationS : null,
    answers: Object.freeze({ ...input.answers }),
    observed: input.result.observed,
    keys: input.result.keys,
    unchangedSurfaceKeys: input.result.unchangedSurfaceKeys,
    manual: input.result.manual,
    evidence: input.result.evidence,
    candidates: input.result.candidates,
    profile: Object.freeze({
      baseVersionId: input.result.baseProfile.versionId,
      learnedVersionId: input.result.tokens.profile.versionId,
      parametersBefore: Object.freeze({ ...input.result.baseProfile.parameters }),
      parametersAfter: Object.freeze({ ...input.result.tokens.profile.parameters }),
    }),
    trace: Object.freeze(
      input.drive.samples
        .filter((_, index) => index % PLAYTEST_TRACE_STRIDE === 0)
        .map((sample) =>
          Object.freeze({
            tick: sample.tick,
            speedMps: sample.speedMps,
            throttle: sample.throttle,
            brake: sample.brake,
            distanceToStopLineM: sample.distanceToStopLineM,
          }),
        ),
    ),
    autoDemo: Object.freeze(
      (input.autoDemo ?? []).map((sample) => {
        if (!Number.isFinite(sample.tick) || !Number.isFinite(sample.speedMps))
          throw new Error('AUTO demo sample requires finite tick and speed');
        if (typeof sample.decision !== 'string' || sample.decision.length === 0)
          throw new Error('AUTO demo sample requires a decision');
        return Object.freeze({
          tick: sample.tick,
          speedMps: sample.speedMps,
          decision: sample.decision,
          stopRequested: sample.stopRequested === true,
        });
      }),
    ),
    limitations: LIMITATIONS,
  });
}

export type { EarlyLoopKey };

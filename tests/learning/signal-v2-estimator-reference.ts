import type { SignalPolicyV2Key, SignalPolicyV2MKey } from '../../src/autonomy';
import type {
  SignalV2EvidenceEpisode,
  SignalV2EvidenceSample,
} from '../../src/learning/signal-v2-estimator';
import type { EligibilityWindowRecord, FilteredWindowRecord } from '../../src/telemetry';
import { deriveOpportunitySeed, randomUnit } from '../../src/sessions';
import {
  SEED,
  neutralSignalValues,
  opportunityKeyFor,
  evaluate,
} from '../autonomy/signal-policy-v2-reference';
import type { SignalV2Scene } from '../autonomy/signal-policy-v2-reference';

/**
 * Deterministic 174 fixtures. Every episode is produced by the delivered `173-signal-policy-v2`
 * layer (over the also delivered 050 result) with a known key set, and the resulting command facts
 * become the evidence samples. The estimator therefore measures exactly the behaviour the policy
 * emitted and never the profile itself: a scene that never reaches a key's own context can only
 * leave that key `UNOBSERVED`.
 *
 * The values are plausible demonstrations, not measured data: they prove the context, uncertainty,
 * split and refusal contract of the learning layer, not the final calibration.
 */
export const signalEvidenceScene = Object.freeze({
  sessionId: '173-test',
  worldEpoch: 0,
  vehicleId: 'car',
  incarnation: '1',
  segmentId: 'segment-174',
});

/** The catalog defaults, used as the demonstrated preference unless a scene says otherwise. */
export const demonstratedSignalKeys = Object.freeze({
  yellow_stop_probability: 0.8,
  yellow_commit_time: 2,
  red_run_gap_acceptance: 4.5,
  green_launch_acceleration: 1.5,
});

export function signalEligibility(
  opportunityId: string,
  overrides: Partial<EligibilityWindowRecord> = {},
): EligibilityWindowRecord {
  return {
    windowId: `window-${opportunityId}`,
    opportunityId,
    kind: 'RED',
    reason: 'NO_CONSTRAINT',
    source: 'NONE',
    observable: true,
    vehicleId: signalEvidenceScene.vehicleId,
    incarnation: signalEvidenceScene.incarnation,
    segmentId: signalEvidenceScene.segmentId,
    controlMode: 'LEARNING',
    learningEligible: true,
    openedTick: 0,
    lastTick: 600,
    observationCount: 600,
    reaction: { open: false, reason: 'SEGMENT_EXCLUDED' },
    windowClass: 'ELIGIBLE',
    label: 'FREE_TRAFFIC',
    ...overrides,
  } as EligibilityWindowRecord;
}

export function signalArtifacts(opportunityId: string, toTick: number): FilteredWindowRecord {
  return {
    windowId: `window-${opportunityId}`,
    sessionId: signalEvidenceScene.sessionId,
    worldEpoch: signalEvidenceScene.worldEpoch,
    segmentId: signalEvidenceScene.segmentId,
    vehicleId: signalEvidenceScene.vehicleId,
    incarnation: signalEvidenceScene.incarnation,
    controlMode: 'LEARNING',
    learningEligible: true,
    startTick: 0,
    endTick: toTick,
    completeness: 'COMPLETE',
    completenessReason: 'SEGMENT_CLOSED',
    artifacts: [],
    artifactCount: 0,
    boundaryTick: null,
    boundaryCause: null,
    suppressed: null,
    openedTick: 0,
    lastTick: toTick,
    observationCount: toTick + 1,
    windowClass: 'PREFIX_ELIGIBLE',
    prefix: { fromTick: 0, toTick, ticks: toTick + 1 },
  } as FilteredWindowRecord;
}

/** One tick of a demonstration: the world scene and the 050 opportunity that identifies it. */
export interface SignalTick {
  readonly scene: SignalV2Scene;
  readonly opportunityPhaseTick: number;
}

/** The closed 173 reasons that mean the layer refused to apply the keys, i.e. no demonstration. */
const admissionRefusals = new Set<string>([
  'NO_AUTO_AUTHORITY',
  'MISSING_PROFILE',
  'FOREIGN_OR_STALE_OBSERVATION',
  'FOREIGN_OR_STALE_SIGNAL',
  'SIGNAL_PROFILE_MISMATCH',
  'SIGNAL_M_PROFILE_MISMATCH',
  'SIGNAL_OBSERVATION_MISMATCH',
  'SIGNAL_UNAVAILABLE',
  'NO_SIGNAL',
]);

/** Runs the real 050 and 173 layers over the scenes and records one sample per tick. */
export function recordEpisode(
  id: string,
  ticks: readonly SignalTick[],
  rValues: Partial<Record<SignalPolicyV2Key, number>>,
  options: {
    readonly mValues?: Partial<Record<SignalPolicyV2MKey, number>>;
    readonly occurrence?: number;
  } = {},
): SignalV2EvidenceEpisode {
  const samples: SignalV2EvidenceSample[] = [];
  for (let index = 0; index < ticks.length; index += 1) {
    const tick = index + 1,
      entry = ticks[index]!,
      evaluation = evaluate(entry.scene, {
        tick,
        opportunityKey: opportunityKeyFor(entry.opportunityPhaseTick),
        rValues,
        mValues: options.mValues,
      }),
      command = evaluation.command;
    samples.push({
      tick,
      signalState: command.signalState,
      policyActive: !admissionRefusals.has(command.reason),
      reason: command.reason,
      action: command.action,
      speedMps: entry.scene.speed,
      distanceToStopLineM: entry.scene.distanceToStopLineM,
      phaseRemainingS: entry.scene.phaseRemainingS,
      conflictGapS: entry.scene.conflictGapS,
      timeToLineS: command.timeToLineS,
      sampledUnit: command.sampledUnit,
      yellowCommitted: command.yellowCommitted,
      yellowFeasibleToStop: command.yellowFeasibleToStop,
      redRunAccepted: command.redRunAccepted,
      launchAccelerationMps2: command.launchAccelerationMps2,
      redStopProbability: evaluation.signal.redStopProbability,
    });
  }
  const opportunityId = `opportunity-${id}`;
  return {
    episodeId: id,
    occurrence: options.occurrence ?? 0,
    eligibility: signalEligibility(opportunityId),
    artifacts: signalArtifacts(opportunityId, samples.length),
    samples,
  };
}

/** Joins the samples of several demonstrations into one episode, re-sequencing the ticks. */
export function mergeEpisodes(
  id: string,
  parts: readonly SignalV2EvidenceEpisode[],
): SignalV2EvidenceEpisode {
  const samples = parts
      .flatMap((part) => part.samples)
      .map((sample, index) => ({ ...sample, tick: index + 1 })),
    opportunityId = `opportunity-${id}`;
  return {
    episodeId: id,
    occurrence: 0,
    eligibility: signalEligibility(opportunityId),
    artifacts: signalArtifacts(opportunityId, samples.length),
    samples,
  };
}

/** The 050 red compliance draw of an opportunity; a crossing is proposed only above it. */
function redComplianceSample(opportunityPhaseTick: number): number {
  return randomUnit(
    deriveOpportunitySeed(SEED, opportunityKeyFor(opportunityPhaseTick)),
    'red-compliance',
    0,
  );
}

/** Consecutive 050 opportunities whose red draw lets the profile cross instead of stopping. */
function crossingOpportunities(count: number, from: number, redStopProbability: number): number[] {
  const found: number[] = [];
  for (let phaseStartedTick = from; found.length < count; phaseStartedTick += 1)
    if (redComplianceSample(phaseStartedTick) >= redStopProbability) found.push(phaseStartedTick);
  if (found.length < count) throw new Error('No crossing opportunity in fixture range');
  return found;
}

/** The public form of the crossing search, for tests that evaluate the delivered 173 layer. */
export function crossingOpportunityTicks(count = 1, from = 0): number[] {
  return crossingOpportunities(count, from, 0.5);
}

const yellowApproach = Object.freeze({
  state: 'YELLOW',
  speed: 12,
  distanceToStopLineM: 37,
  phaseRemainingS: 20,
  conflictGapS: null,
} as const) satisfies SignalV2Scene;

/**
 * Yellow feasibility: a moving approach far enough from the line that 173 reaches its own
 * once-per-opportunity sample. The stop rate over those opportunities is the effective probability.
 */
export function yellowFeasibilityEpisodes(
  probabilities: readonly number[] = [0.8, 0.8, 0.8, 0.8],
  trials = 40,
  options: { readonly idPrefix?: string; readonly from?: number } = {},
) {
  const prefix = options.idPrefix ?? 'yellow-feasibility',
    from = options.from ?? 0;
  return probabilities.map((probability, index) =>
    recordEpisode(
      `${prefix}-${index + 1}`,
      Array.from({ length: trials }, (_, offset) => ({
        scene: yellowApproach,
        opportunityPhaseTick: from + index * 100 + offset,
      })),
      { ...neutralSignalValues, yellow_stop_probability: probability },
    ),
  );
}

/** Four yellow approaches without any sampled opportunity: no compliance draw, no rate. */
export function yellowTrialsBelowMinimumEpisodes(probabilities: readonly number[] = [0.8, 0.8]) {
  return yellowFeasibilityEpisodes(probabilities, 3);
}

interface HorizonScenes {
  readonly committed: readonly number[];
  readonly sampled: readonly number[];
}

/**
 * Yellow engagement: an approach at a known time to line. 173 first checks whether entering would
 * happen on red, then whether the horizon already commits; the sampled approaches are pushed past
 * the remaining phase so the horizon bound is read without producing a compliance trial.
 */
function horizonTicks(scenes: HorizonScenes, opportunityPhaseTick: number): SignalTick[] {
  return [
    ...scenes.committed.map((time) => ({
      scene: {
        state: 'YELLOW',
        speed: 10,
        distanceToStopLineM: time * 10 + 1,
        phaseRemainingS: time + 1,
        conflictGapS: null,
      } as SignalV2Scene,
      opportunityPhaseTick,
    })),
    ...scenes.sampled.map((time) => ({
      scene: {
        state: 'YELLOW',
        speed: 10,
        distanceToStopLineM: time * 10 + 1,
        // Past the remaining phase, so the horizon bound is read without a compliance trial.
        phaseRemainingS: Math.max(0, time - 0.5),
        conflictGapS: null,
      } as SignalV2Scene,
      opportunityPhaseTick,
    })),
  ];
}

export function yellowCommitEpisodes(horizons: readonly number[] = [2, 2, 2, 2]) {
  return horizons.map((horizon, index) =>
    recordEpisode(
      `yellow-commit-${index + 1}`,
      horizonTicks(
        {
          committed: [horizon - 0.5, horizon - 0.3, horizon - 0.1],
          sampled: [horizon + 0.2, horizon + 0.5],
        },
        index * 100,
      ),
      { ...neutralSignalValues, yellow_commit_time: horizon },
    ),
  );
}

/** Only committed approaches: the horizon has a lower bound and no upper bound. */
export function commitLowerBoundEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `commit-lower-${index + 1}`,
      horizonTicks({ committed: [1.4, 1.8], sampled: [] }, index * 100),
      { ...neutralSignalValues, yellow_commit_time: 2 },
    ),
  );
}

/** Only sampled approaches: the horizon has an upper bound and no lower bound. */
export function commitUpperBoundEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `commit-upper-${index + 1}`,
      horizonTicks({ committed: [], sampled: [2.2, 2.6] }, index * 100),
      { ...neutralSignalValues, yellow_commit_time: 2 },
    ),
  );
}

/** Committed very early and sampled very late: the bound is real but too wide to be a preference. */
export function wideCommitEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `commit-wide-${index + 1}`,
      horizonTicks({ committed: [0.4], sampled: [4] }, index * 100),
      { ...neutralSignalValues, yellow_commit_time: 2 },
    ),
  );
}

/** Four horizons that no single value satisfies: one episode holds both a far commit and a close
 * sample, which no single horizon can explain. */
export function contradictoryCommitEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    mergeEpisodes(`commit-contradictory-${index + 1}`, [
      recordEpisode(
        `commit-contradictory-far-${index + 1}`,
        horizonTicks({ committed: [3], sampled: [] }, index * 100),
        { ...neutralSignalValues, yellow_commit_time: 4 },
      ),
      recordEpisode(
        `commit-contradictory-close-${index + 1}`,
        horizonTicks({ committed: [], sampled: [1] }, index * 100 + 50),
        { ...neutralSignalValues, yellow_commit_time: 0.5 },
      ),
    ]),
  );
}

const lateBrakeScene: SignalV2Scene = Object.freeze({
  state: 'YELLOW',
  speed: 10,
  distanceToStopLineM: 31,
  phaseRemainingS: 20,
  conflictGapS: null,
} as const) satisfies SignalV2Scene;

/** The M late-braking stop preempts the yellow arithmetic, so it bounds nothing. */
export function lateBrakeEpisodes() {
  const opportunities = crossingOpportunities(8, 0, 0.5);
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `commit-late-brake-${index + 1}`,
      opportunities
        .slice(index * 2, index * 2 + 2)
        .map((opportunityPhaseTick) => ({ scene: lateBrakeScene, opportunityPhaseTick })),
      neutralSignalValues,
      { mValues: { red_stop_probability: 0.5 } },
    ),
  );
}

/** Green launch: a standstill release after the M start delay commands the key acceleration. */
export function greenLaunchEpisodes(
  accelerations: readonly number[] = [1.5, 1.5, 1.5, 1.5],
  options: { readonly idPrefix?: string; readonly from?: number } = {},
) {
  const prefix = options.idPrefix ?? 'green-launch',
    from = options.from ?? 0;
  return accelerations.map((acceleration, index) =>
    recordEpisode(
      `${prefix}-${index + 1}`,
      [0, 1, 2].map((offset) => ({
        scene: {
          state: 'GREEN',
          speed: 0,
          distanceToStopLineM: null,
          phaseRemainingS: 10,
          conflictGapS: null,
        } as SignalV2Scene,
        opportunityPhaseTick: from + index * 100 + offset,
      })),
      { ...neutralSignalValues, green_launch_acceleration: acceleration },
    ),
  );
}

/** The M start delay still holds the release: 173 reports the hold, not a launch. */
export function greenLaunchHeldEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `green-held-${index + 1}`,
      [0, 1].map((offset) => ({
        scene: {
          state: 'GREEN',
          speed: 0,
          distanceToStopLineM: null,
          phaseRemainingS: 10,
          conflictGapS: null,
          phaseElapsedS: 1,
        } as SignalV2Scene,
        opportunityPhaseTick: index * 100 + offset,
      })),
      neutralSignalValues,
      { mValues: { green_start_delay: 4 } },
    ),
  );
}

/** A green release from a moving vehicle is not a launch from standstill. */
export function greenLaunchMovingEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `green-moving-${index + 1}`,
      [0, 1].map((offset) => ({
        scene: {
          state: 'GREEN',
          speed: 5,
          distanceToStopLineM: null,
          phaseRemainingS: 10,
          conflictGapS: null,
        } as SignalV2Scene,
        opportunityPhaseTick: index * 100 + offset,
      })),
      neutralSignalValues,
    ),
  );
}

/** Eight launch accelerations far apart: the fact is real, the preference is not identified. */
export function noisyLaunchEpisodes() {
  return greenLaunchEpisodes([0.3, 6, 1.2, 5.4, 0.4, 3, 5.8, 1.8], {
    idPrefix: 'launch-noisy',
    from: 1000,
  });
}

const redApproach = Object.freeze({
  state: 'RED',
  speed: 10,
  distanceToStopLineM: 11,
  phaseRemainingS: 20,
  conflictGapS: null,
} as const) satisfies SignalV2Scene;

/**
 * Red run: 050 proposes the crossing (the profile draw is non-compliant and the remaining time is
 * inside the M late-braking horizon), and the world reports the conflict gap per attempt.
 */
export function redRunEpisodes(gaps: readonly (readonly number[])[] = [[5, 4, 5.5, 3.2, 6, 3.8]]) {
  const opportunities = crossingOpportunities(
    gaps.reduce((sum, entry) => sum + entry.length, 0),
    0,
    0.5,
  );
  let cursor = 0;
  return gaps.map((episodeGaps, index) => {
    const ticks = episodeGaps.map((gap, offset) => ({
      scene: {
        ...redApproach,
        conflictGapS: gap,
      } as SignalV2Scene,
      opportunityPhaseTick: opportunities[cursor + offset]!,
    }));
    cursor += episodeGaps.length;
    return recordEpisode(
      `red-run-${index + 1}`,
      ticks,
      {
        ...neutralSignalValues,
        red_run_gap_acceptance: demonstratedSignalKeys.red_run_gap_acceptance,
      },
      { mValues: { red_stop_probability: 0.5 } },
    );
  });
}

/** Four identical red-run bracket episodes: accepted at 5 s, rejected at 4 s. */
export function redRunBracketEpisodes() {
  return redRunEpisodes([
    [5, 4, 5.5, 3.2, 6, 3.8],
    [5, 4, 5.5, 3.2, 6, 3.8],
    [5, 4, 5.5, 3.2, 6, 3.8],
    [5, 4, 5.5, 3.2, 6, 3.8],
  ]);
}

/** Only accepted crossings: the key has an upper bound and no lower bound. */
export function redRunUpperOnlyEpisodes() {
  return redRunEpisodes([
    [5, 6],
    [5, 6],
    [5, 6],
    [5, 6],
  ]);
}

/** Only rejections above the safety cap: the key has a lower bound and no upper bound. */
export function redRunLowerOnlyEpisodes() {
  return redRunEpisodes([
    [4, 3.5],
    [4, 3.5],
    [4, 3.5],
    [4, 3.5],
  ]);
}

/** Every attempt below the 3 s safety cap: the cap decides, the key cannot be read. */
export function redRunSafetyCapEpisodes() {
  return redRunEpisodes([
    [2, 1.5],
    [2, 1.5],
    [2, 1.5],
    [2, 1.5],
  ]);
}

/** An accepted crossing below a rejected one: no single key value satisfies both bounds. */
export function contradictoryGapEpisodes() {
  const opportunities = crossingOpportunities(16, 0, 0.5);
  return [0, 1, 2, 3].map((index) =>
    mergeEpisodes(`red-run-contradictory-${index + 1}`, [
      recordEpisode(
        `red-run-contradictory-accepted-${index + 1}`,
        [4.2, 4.4].map((gap, offset) => ({
          scene: { ...redApproach, conflictGapS: gap } as SignalV2Scene,
          opportunityPhaseTick: opportunities[index * 4 + offset]!,
        })),
        { ...neutralSignalValues, red_run_gap_acceptance: 4 },
        { mValues: { red_stop_probability: 0.5 } },
      ),
      recordEpisode(
        `red-run-contradictory-rejected-${index + 1}`,
        [4.6, 4.8].map((gap, offset) => ({
          scene: { ...redApproach, conflictGapS: gap } as SignalV2Scene,
          opportunityPhaseTick: opportunities[index * 4 + 2 + offset]!,
        })),
        { ...neutralSignalValues, red_run_gap_acceptance: 6 },
        { mValues: { red_stop_probability: 0.5 } },
      ),
    ]),
  );
}

/** Accepted at 8 s and rejected at 3 s: the bound is real but too wide to be a preference. */
export function wideGapEpisodes() {
  const opportunities = crossingOpportunities(8, 0, 0.5);
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `red-run-wide-${index + 1}`,
      [8, 3].map((gap, offset) => ({
        scene: { ...redApproach, conflictGapS: gap } as SignalV2Scene,
        opportunityPhaseTick: opportunities[index * 2 + offset]!,
      })),
      { ...neutralSignalValues, red_run_gap_acceptance: 8 },
      { mValues: { red_stop_probability: 0.5 } },
    ),
  );
}

/** The world reports no conflict gap: the crossing is refused without proving a key value. */
export function redRunUnknownGapEpisodes() {
  const opportunities = crossingOpportunities(8, 0, 0.5);
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `red-run-unknown-${index + 1}`,
      [0, 1].map((offset) => ({
        scene: { ...redApproach, conflictGapS: null } as SignalV2Scene,
        opportunityPhaseTick: opportunities[index * 2 + offset]!,
      })),
      neutralSignalValues,
      { mValues: { red_stop_probability: 0.5 } },
    ),
  );
}

/** 050 keeps its stop on every red: no crossing is proposed, so no gap can be measured. */
export function redRunNotProposedEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `red-run-not-proposed-${index + 1}`,
      [0, 1].map((offset) => ({
        scene: { ...redApproach, conflictGapS: 8 } as SignalV2Scene,
        opportunityPhaseTick: index * 100 + offset,
      })),
      neutralSignalValues,
    ),
  );
}

/** Four identical demonstrations of a zero stop probability: a real zero, not missing evidence. */
export function zeroYellowEpisodes() {
  return yellowFeasibilityEpisodes([0, 0, 0, 0]);
}

/**
 * Eight heterogeneous yellow preferences in one set. The deterministic split keeps a scattered
 * estimate half (0, 0,35, 0,7, 1), so the measured stop rates disagree instead of being averaged
 * into a preference.
 */
export function noisyYellowEpisodes() {
  return yellowFeasibilityEpisodes([0.2, 0, 0.5, 0.35, 0.8, 0.7, 0.9, 1], 40, {
    idPrefix: 'yellow-noisy',
    from: 1000,
  });
}

/** A manual demonstration: the signal runs, but 173 never applies the keys. */
export function manualEpisodes() {
  const episodes = yellowFeasibilityEpisodes([0.8, 0.8, 0.8, 0.8]);
  return episodes.map((episode) => ({
    ...episode,
    eligibility: { ...episode.eligibility, controlMode: 'MANUAL', learningEligible: false },
  })) as SignalV2EvidenceEpisode[];
}

/** Positive set: every key has its own demonstrated episode family. */
export function positiveEpisodes(): SignalV2EvidenceEpisode[] {
  return [
    ...yellowFeasibilityEpisodes(),
    ...yellowCommitEpisodes(),
    ...redRunBracketEpisodes(),
    ...greenLaunchEpisodes(),
  ];
}

import type { EligibilityWindowRecord, FilteredWindowRecord } from '../../src/telemetry';
import type {
  LaneV2EvidenceEpisode,
  LaneV2EvidenceSample,
} from '../../src/learning/lane-v2-estimator';
import { laneV2PolicyActive } from '../../src/learning/lane-v2-estimator';
import { LANE_POLICY_V2_EMPTY_STATE } from '../../src/autonomy/lane-policy-v2';
import type {
  LanePolicyV2Command,
  LanePolicyV2Key,
  LanePolicyV2State,
} from '../../src/autonomy/lane-policy-v2';
import { evaluate, rightPassSample, signalUseSample } from '../autonomy/lane-policy-v2-reference';
import type { LanePolicyScene } from '../autonomy/lane-policy-v2-reference';

/**
 * Deterministic 178 fixtures. Every episode is produced by running the delivered `053-lane-change-v1`
 * and `177-lane-policy-v2` layers with a known key set, and the resulting command facts become the
 * evidence samples. The estimator therefore measures exactly the behaviour the policy emitted and
 * never the profile itself: a scene that never reaches a key's own branch can only leave that key
 * `UNOBSERVED`.
 *
 * The values are plausible demonstrations, not measured data: they prove the context, uncertainty,
 * split and refusal contract of the learning layer, not the final calibration.
 */
export const laneEvidenceScene = Object.freeze({
  sessionId: '177-test',
  worldEpoch: 0,
  vehicleId: 'car',
  incarnation: '1',
  segmentId: 'segment-178',
});

export function laneEligibility(
  opportunityId: string,
  overrides: Partial<EligibilityWindowRecord> = {},
): EligibilityWindowRecord {
  return {
    windowId: `window-${opportunityId}`,
    opportunityId,
    kind: 'LANE_CHANGE',
    reason: 'NO_CONSTRAINT',
    source: 'NONE',
    observable: true,
    vehicleId: laneEvidenceScene.vehicleId,
    incarnation: laneEvidenceScene.incarnation,
    segmentId: laneEvidenceScene.segmentId,
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

export function laneArtifacts(opportunityId: string, toTick: number): FilteredWindowRecord {
  return {
    windowId: `window-${opportunityId}`,
    sessionId: laneEvidenceScene.sessionId,
    worldEpoch: laneEvidenceScene.worldEpoch,
    segmentId: laneEvidenceScene.segmentId,
    vehicleId: laneEvidenceScene.vehicleId,
    incarnation: laneEvidenceScene.incarnation,
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

/** Left-lane optional overtake: the indicator and the duration act, the right pass does not. */
export const leftScene: LanePolicyScene = Object.freeze({
  currentLaneId: 'lane-a',
  lanes: [{ laneId: 'lane-left', side: 'LEFT' }],
  targetLaneId: 'lane-left',
  overtake: true,
  rightOvertake: 'UNKNOWN',
  rightLaneSpaceM: null,
  coverage: 'COMPLETE',
  frontGapM: 20,
  backGapM: 18,
  targetLaneSpeedMps: 12,
  speedMps: 8,
  ownLaneLeaderSpeedMps: 6,
  intent: 'OPTIONAL_OVERTAKE',
} as const);

/** Right-lane optional overtake with the map permission and the declared space present. */
export const rightScene: LanePolicyScene = Object.freeze({
  ...leftScene,
  lanes: [{ laneId: 'lane-right', side: 'RIGHT' }],
  targetLaneId: 'lane-right',
  rightOvertake: 'PERMITTED',
  rightLaneSpaceM: 30,
} as const);

/** One step of a demonstration: a scene, an opportunity identity and how many decisions to run. */
export interface LaneEvidenceStep {
  readonly scene: LanePolicyScene;
  readonly opportunityKey: string;
  readonly decisions?: number;
  /** Stop this step as soon as the command satisfies the predicate. */
  readonly stopWhen?: (command: LanePolicyV2Command) => boolean;
  /** Keep only these decisions as evidence; every decision still advances the layer. */
  readonly keep?: (command: LanePolicyV2Command, decision: number) => boolean;
  /** A new physical opportunity: the caller-held 177 latch starts empty again. */
  readonly reset?: boolean;
}

function sampleOf(
  command: LanePolicyV2Command,
  tick: number,
  opportunityKey: string,
): LaneV2EvidenceSample {
  return {
    tick,
    policyActive: laneV2PolicyActive(command.reason),
    reason: command.reason,
    action: command.action,
    opportunityKey,
    manoeuvreDurationTicks: command.manoeuvreDurationTicks,
    manoeuvreElapsedTicks: command.manoeuvreElapsedTicks,
    lateralProgress: command.lateralProgress,
    signalUsed: command.signalUsed,
    signalStartTick: command.signalStartTick,
    manoeuvreStartTick: command.manoeuvreStartTick,
    rightOvertakeRequested: command.rightOvertakeRequested,
    rightOvertakePermitted: command.rightOvertakePermitted,
    rightLaneSpaceM: command.rightLaneSpaceM,
    requiredRightSpaceM: command.requiredRightSpaceM,
    rightOvertakeSample: command.rightOvertakeSample,
    rightOvertakeGranted: command.rightOvertakeGranted,
  };
}

/** Runs the real 053 and 177 layers over the steps and records one sample per kept decision. */
export function recordEpisode(
  id: string,
  steps: readonly LaneEvidenceStep[],
  rValues: Partial<Record<LanePolicyV2Key, number>> = {},
  options: { readonly occurrence?: number } = {},
): LaneV2EvidenceEpisode {
  const samples: LaneV2EvidenceSample[] = [];
  let state: LanePolicyV2State = LANE_POLICY_V2_EMPTY_STATE,
    tick = 0;
  for (const step of steps) {
    if (step.reset === true) state = LANE_POLICY_V2_EMPTY_STATE;
    const decisions = step.decisions ?? 1;
    for (let decision = 0; decision < decisions; decision += 1) {
      tick += 1;
      const command = evaluate(step.scene, {
        tick,
        opportunityKey: step.opportunityKey,
        rValues,
        state,
      }).command;
      state = command.state;
      if (step.keep === undefined || step.keep(command, decision))
        samples.push(sampleOf(command, tick, step.opportunityKey));
      if (step.stopWhen?.(command)) break;
    }
  }
  const opportunityId = `opportunity-${id}`,
    lastTick = samples.length === 0 ? 1 : samples[samples.length - 1]!.tick;
  return {
    episodeId: id,
    occurrence: options.occurrence ?? 0,
    eligibility: laneEligibility(opportunityId),
    artifacts: laneArtifacts(opportunityId, lastTick),
    samples,
  };
}

/** Joins the samples of several demonstrations into one episode, re-sequencing the ticks. */
export function mergeEpisodes(
  id: string,
  parts: readonly LaneV2EvidenceEpisode[],
): LaneV2EvidenceEpisode {
  const samples = parts
      .flatMap((part) => part.samples)
      .map((sample, index) => ({ ...sample, tick: index + 1 })),
    opportunityId = `opportunity-${id}`;
  return {
    episodeId: id,
    occurrence: 0,
    eligibility: laneEligibility(opportunityId),
    artifacts: laneArtifacts(opportunityId, Math.max(1, samples.length)),
    samples,
  };
}

/** Scans `opportunity-<n>` identities until `count` draws satisfy the predicate. */
function scan(
  from: number,
  draw: (opportunityKey: string) => number,
  accept: (sample: number) => boolean,
  count: number,
): { opportunityKey: string; sample: number }[] {
  const found: { opportunityKey: string; sample: number }[] = [];
  for (let index = from; found.length < count; index += 1) {
    const opportunityKey = `opportunity-${index}`,
      sample = draw(opportunityKey);
    if (accept(sample)) found.push({ opportunityKey, sample });
  }
  if (found.length < count) throw new Error('No matching lane opportunity in fixture range');
  return found;
}

/** Opportunities whose once-per-opportunity indicator sample satisfies the predicate. */
export function indicatorOpportunities(
  from: number,
  accept: (sample: number) => boolean,
  count = 1,
) {
  return scan(from, signalUseSample, accept, count);
}

/** Opportunities whose once-per-opportunity right-pass sample satisfies the predicate. */
export function rightPassOpportunities(
  from: number,
  accept: (sample: number) => boolean,
  count = 1,
) {
  return scan(from, rightPassSample, accept, count);
}

/** Opportunities whose indicator is switched on for a key of 0.4. */
export function indicatorOn(from = 0, count = 1) {
  return indicatorOpportunities(from, (sample) => sample >= 0.2 && sample < 0.4, count);
}
/** Opportunities whose indicator stays off for a key of 0.4. */
export function indicatorOff(from = 0, count = 1) {
  return indicatorOpportunities(from, (sample) => sample >= 0.4 && sample < 0.6, count);
}

/** A right-pass draw granted for a key of 0.3, i.e. well inside the admissible bracket. */
export function rightPassGrant(from = 0) {
  return rightPassOpportunities(from, (sample) => sample >= 0.2 && sample < 0.25)[0]!;
}
/** A right-pass draw refused for a key of 0.3, i.e. above the grant and below the ceiling. */
export function rightPassRefusal(from = 0) {
  return rightPassOpportunities(from, (sample) => sample >= 0.35 && sample < 0.45)[0]!;
}
/** A grant close to the catalog floor, useful for a deliberately wide bracket. */
export function rightPassLowGrant(from = 0) {
  return rightPassOpportunities(from, (sample) => sample >= 0.02 && sample < 0.08)[0]!;
}
/** A refusal right below the catalog ceiling, useful for a deliberately wide bracket. */
export function rightPassHighRefusal(from = 0) {
  return rightPassOpportunities(from, (sample) => sample >= 0.44 && sample < 0.5)[0]!;
}
/** A grant above a refusal sample: no single key satisfies both bounds. */
export function rightPassTopGrant(from = 0) {
  return rightPassOpportunities(from, (sample) => sample >= 0.44 && sample < 0.5)[0]!;
}
/** A refusal below the grant above, from a different demonstration profile. */
export function rightPassLowRefusal(from = 0) {
  return rightPassOpportunities(from, (sample) => sample >= 0.35 && sample < 0.42)[0]!;
}

/** The one demonstration profile every positive family shares; only the scenario differs. */
export const demonstrationKeys = Object.freeze({
  lane_change_duration: 2,
  signal_lead_time: 2,
  signal_use_probability: 0.4,
  pass_on_right_probability: 0.3,
} as const);

/**
 * Duration episodes: the manoeuvre starts and the first two ticks of the lateral movement are
 * recorded, so the effective duration is reported by a real progress. The indicator is left to the
 * shared key, which is why some episodes wait for the lead before moving.
 */
export function durationEpisodes(
  durations: readonly number[] = [2, 2, 2, 2],
  options: { readonly idPrefix?: string; readonly from?: number } = {},
) {
  const prefix = options.idPrefix ?? 'duration',
    from = options.from ?? 0;
  return durations.map((duration, index) => {
    const opportunityKey = `opportunity-${from + index * 10}`;
    return recordEpisode(
      `${prefix}-${index + 1}`,
      [
        {
          scene: leftScene,
          opportunityKey,
          decisions: 400,
          stopWhen: (command) => command.action === 'LANE_CHANGE',
          keep: (command) => command.action === 'LANE_CHANGE',
        },
        { scene: leftScene, opportunityKey, decisions: 2 },
      ],
      { ...demonstrationKeys, lane_change_duration: duration },
    );
  });
}

/**
 * Duration episodes whose opportunities never switch the indicator on: the same manoeuvre, but the
 * lead has no interval to measure at all.
 */
export function unsignalledDurationEpisodes() {
  return indicatorOff(0, 4).map((entry, index) =>
    recordEpisode(
      `lead-none-${index + 1}`,
      [
        {
          scene: leftScene,
          opportunityKey: entry.opportunityKey,
          decisions: 400,
          stopWhen: (command) => command.action === 'LANE_CHANGE',
          keep: (command) => command.action === 'LANE_CHANGE',
        },
        { scene: leftScene, opportunityKey: entry.opportunityKey, decisions: 2 },
      ],
      demonstrationKeys,
    ),
  );
}

/**
 * Lead episodes: the manoeuvre is signalled, the first wait tick and the tick the movement starts
 * are recorded, so the lead is the distance between the indicator and the first movement.
 */
export function leadEpisodes(
  leads: readonly number[] = [2, 2, 2, 2],
  options: { readonly idPrefix?: string; readonly from?: number } = {},
) {
  const prefix = options.idPrefix ?? 'lead',
    from = options.from ?? 0;
  return leads.map((lead, index) =>
    recordEpisode(
      `${prefix}-${index + 1}`,
      [
        {
          scene: leftScene,
          opportunityKey: `opportunity-${from + index * 10 + 1}`,
          decisions: 400,
          stopWhen: (command) => command.action === 'LANE_CHANGE',
          keep: (command, decision) => decision === 0 || command.action === 'LANE_CHANGE',
        },
      ],
      { ...demonstrationKeys, signal_use_probability: 1, signal_lead_time: lead },
    ),
  );
}

/**
 * Indicator episodes: ten distinct opportunities, each a fresh manoeuvre, of which `used` switch the
 * indicator on and `unused` do not. The denominator is the number of opportunities, not the frames.
 */
export function indicatorEpisodes(
  used = 4,
  unused = 6,
  options: { readonly idPrefix?: string; readonly from?: number } = {},
) {
  const prefix = options.idPrefix ?? 'indicator',
    from = options.from ?? 0;
  return [0, 1, 2, 3].map((index) => {
    const on = indicatorOn(from + index * 100, used),
      off = indicatorOff(from + index * 100, unused),
      steps: LaneEvidenceStep[] = [...on, ...off].map((entry) => ({
        scene: leftScene,
        opportunityKey: entry.opportunityKey,
        reset: true,
      }));
    return recordEpisode(`${prefix}-${index + 1}`, steps, demonstrationKeys);
  });
}

/** Indicator episodes that never switch the indicator on: a demonstrated zero. */
export function zeroIndicatorEpisodes() {
  return [0, 1, 2, 3].map((index) => {
    const steps: LaneEvidenceStep[] = Array.from({ length: 10 }, (_, position) => ({
      scene: leftScene,
      opportunityKey: `opportunity-${2000 + index * 100 + position}`,
      reset: true,
    }));
    return recordEpisode(`indicator-zero-${index + 1}`, steps, {
      ...demonstrationKeys,
      signal_use_probability: 0,
    });
  });
}

/** Indicator episodes that always switch the indicator on, alternating with the zero set. */
export function alternatingIndicatorEpisodes() {
  const off = zeroIndicatorEpisodes();
  return [0, 1, 2, 3].map((index) =>
    index % 2 === 0
      ? off[index]!
      : recordEpisode(
          `indicator-always-${index + 1}`,
          Array.from({ length: 10 }, (_, position) => ({
            scene: leftScene,
            opportunityKey: `opportunity-${3000 + index * 100 + position}`,
            reset: true,
          })),
          { ...demonstrationKeys, signal_use_probability: 1 },
        ),
  );
}

/** Right-pass episodes: one granted draw and one refused draw of the same opportunity pair. */
export function rightPassEpisodes(
  grant = rightPassGrant(0),
  refusal = rightPassRefusal(0),
  options: { readonly idPrefix?: string } = {},
) {
  const prefix = options.idPrefix ?? 'right-pass';
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `${prefix}-${index + 1}`,
      [
        { scene: rightScene, opportunityKey: grant.opportunityKey, reset: true },
        { scene: rightScene, opportunityKey: refusal.opportunityKey, reset: true },
      ],
      { ...demonstrationKeys, signal_use_probability: 0 },
    ),
  );
}

/** Only granted draws: the key has a lower bound and no upper bound. */
export function rightPassGrantOnlyEpisodes() {
  const grant = rightPassGrant(0);
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `right-pass-grant-${index + 1}`,
      [{ scene: rightScene, opportunityKey: grant.opportunityKey, reset: true }],
      { ...demonstrationKeys, signal_use_probability: 0, pass_on_right_probability: 1 },
    ),
  );
}

/** Only refused draws: the key has an upper bound and no lower bound. */
export function rightPassRefusalOnlyEpisodes() {
  const refusal = rightPassRefusal(0);
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `right-pass-refusal-${index + 1}`,
      [{ scene: rightScene, opportunityKey: refusal.opportunityKey, reset: true }],
      { ...demonstrationKeys, signal_use_probability: 0, pass_on_right_probability: 0 },
    ),
  );
}

/**
 * A grant recorded under a high key and a refusal recorded under a low key: no single key satisfies
 * both bounds, exactly like two contradictory demonstrations of the same parameter.
 */
export function rightPassContradictoryEpisodes() {
  const grant = rightPassTopGrant(0),
    refusal = rightPassLowRefusal(0);
  return [0, 1, 2, 3].map((index) =>
    mergeEpisodes(`right-pass-contradictory-${index + 1}`, [
      recordEpisode(
        `right-pass-contradictory-grant-${index + 1}`,
        [{ scene: rightScene, opportunityKey: grant.opportunityKey, reset: true }],
        { ...demonstrationKeys, signal_use_probability: 0, pass_on_right_probability: 0.5 },
      ),
      recordEpisode(
        `right-pass-contradictory-refusal-${index + 1}`,
        [{ scene: rightScene, opportunityKey: refusal.opportunityKey, reset: true }],
        { ...demonstrationKeys, signal_use_probability: 0, pass_on_right_probability: 0.2 },
      ),
    ]),
  );
}

/** A real grant and a real refusal far apart: the bound is real but too wide to be a preference. */
export function wideRightPassEpisodes() {
  const grant = rightPassLowGrant(0),
    refusal = rightPassHighRefusal(0);
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `right-pass-wide-${index + 1}`,
      [
        { scene: rightScene, opportunityKey: grant.opportunityKey, reset: true },
        { scene: rightScene, opportunityKey: refusal.opportunityKey, reset: true },
      ],
      { ...demonstrationKeys, signal_use_probability: 0, pass_on_right_probability: 0.4 },
    ),
  );
}

/**
 * The map declaration precedes the sample: every one of these scenes refuses the pass before any
 * draw, whatever the key says.
 */
export function rightPassForbiddenEpisodes() {
  const scenes: readonly LanePolicyScene[] = [
    { ...rightScene, rightOvertake: 'FORBIDDEN' },
    { ...rightScene, rightOvertake: 'UNKNOWN' },
    { ...rightScene, rightLaneSpaceM: 8 },
    { ...rightScene, rightLaneSpaceM: null },
  ];
  return scenes.map((scene, index) =>
    recordEpisode(
      `right-pass-precondition-${index + 1}`,
      [{ scene, opportunityKey: `opportunity-${4000 + index * 10}`, reset: true }],
      { ...demonstrationKeys, signal_use_probability: 0, pass_on_right_probability: 1 },
    ),
  );
}

/** Immediate signalling: the movement starts on the indicator tick, a demonstrated lead of 0 s. */
export function zeroLeadEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `lead-zero-${index + 1}`,
      [
        {
          scene: leftScene,
          opportunityKey: `opportunity-${5000 + index * 10}`,
          decisions: 2,
        },
      ],
      { ...demonstrationKeys, signal_use_probability: 1, signal_lead_time: 0 },
    ),
  );
}

/** Four demonstrations in `MANUAL`: the policy runs, but 177 never applies the keys. */
export function manualEpisodes(): LaneV2EvidenceEpisode[] {
  return durationEpisodes().map((episode) => ({
    ...episode,
    eligibility: { ...episode.eligibility, controlMode: 'MANUAL', learningEligible: false },
  })) as LaneV2EvidenceEpisode[];
}

/** Positive set: every key has its own demonstrated episode family. */
export function positiveEpisodes(): LaneV2EvidenceEpisode[] {
  return [...durationEpisodes(), ...leadEpisodes(), ...indicatorEpisodes(), ...rightPassEpisodes()];
}

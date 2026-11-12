import type { StopPriorityPolicyKey, StopPriorityPolicyMKey } from '../../src/autonomy';
import type {
  StopPriorityEvidenceEpisode,
  StopPriorityEvidenceSample,
} from '../../src/learning/stop-priority-estimator';
import type { EligibilityWindowRecord, FilteredWindowRecord } from '../../src/telemetry';
import { blockedEntrySample, evaluate } from '../autonomy/stop-priority-policy-reference';
import type { StopPriorityScene } from '../autonomy/stop-priority-policy-reference';

/**
 * Deterministic 176 fixtures. Every episode is produced by the delivered 051, 052 and
 * `175-stop-priority-policy-v1` layers with a known key set, and the resulting command facts become
 * the evidence samples. The estimator therefore measures exactly the behaviour the policy emitted
 * and never the profile itself: a scene that never reaches a key's own branch can only leave that
 * key `UNOBSERVED`.
 *
 * The values are plausible demonstrations, not measured data: they prove the context, uncertainty,
 * split and refusal contract of the learning layer, not the final calibration.
 */
export const stopPriorityEvidenceScene = Object.freeze({
  sessionId: '175-test',
  worldEpoch: 0,
  vehicleId: 'car',
  incarnation: '1',
  segmentId: 'segment-176',
});

export function stopPriorityEligibility(
  opportunityId: string,
  overrides: Partial<EligibilityWindowRecord> = {},
): EligibilityWindowRecord {
  return {
    windowId: `window-${opportunityId}`,
    opportunityId,
    kind: 'STOP',
    reason: 'NO_CONSTRAINT',
    source: 'NONE',
    observable: true,
    vehicleId: stopPriorityEvidenceScene.vehicleId,
    incarnation: stopPriorityEvidenceScene.incarnation,
    segmentId: stopPriorityEvidenceScene.segmentId,
    controlMode: 'LEARNING',
    learningEligible: true,
    openedTick: 0,
    lastTick: 600,
    observationCount: 600,
    reaction: { open: false, reason: 'SEGMENT_EXCLUDED' },
    windowClass: 'ELIGIBLE',
    label: 'STOP_ZONE',
    ...overrides,
  } as EligibilityWindowRecord;
}

export function stopPriorityArtifacts(opportunityId: string, toTick: number): FilteredWindowRecord {
  return {
    windowId: `window-${opportunityId}`,
    sessionId: stopPriorityEvidenceScene.sessionId,
    worldEpoch: stopPriorityEvidenceScene.worldEpoch,
    segmentId: stopPriorityEvidenceScene.segmentId,
    vehicleId: stopPriorityEvidenceScene.vehicleId,
    incarnation: stopPriorityEvidenceScene.incarnation,
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

/** One tick of a demonstration: the world scene and the opportunity that addresses its draw. */
export interface StopPriorityTick {
  readonly scene: StopPriorityScene;
  readonly opportunityKey: string;
}

/** The closed 175 reasons that mean the layer refused to apply the keys, i.e. no demonstration. */
const admissionRefusals = new Set<string>([
  'NO_AUTO_AUTHORITY',
  'MISSING_PROFILE',
  'FOREIGN_OR_STALE_OBSERVATION',
  'FOREIGN_OR_STALE_STOP',
  'FOREIGN_OR_STALE_YIELD',
  'NO_POLICY_INPUT',
  'STOP_UNAVAILABLE',
  'STOP_PROFILE_MISMATCH',
  'STOP_M_PROFILE_MISMATCH',
  'YIELD_UNAVAILABLE',
  'YIELD_PROFILE_MISMATCH',
  'YIELD_M_PROFILE_MISMATCH',
]);

/** Runs the real 051, 052 and 175 layers over the scenes and records one sample per tick. */
export function recordEpisode(
  id: string,
  ticks: readonly StopPriorityTick[],
  rValues: Partial<Record<StopPriorityPolicyKey, number>>,
  options: {
    readonly mValues?: Partial<Record<StopPriorityPolicyMKey, number>>;
    readonly occurrence?: number;
  } = {},
): StopPriorityEvidenceEpisode {
  const samples: StopPriorityEvidenceSample[] = [];
  for (let index = 0; index < ticks.length; index += 1) {
    const tick = index + 1,
      entry = ticks[index]!,
      command = evaluate(entry.scene, {
        tick,
        opportunityKey: entry.opportunityKey,
        rValues,
        mValues: options.mValues,
      }).command;
    samples.push({
      tick,
      policyActive: !admissionRefusals.has(command.reason),
      reason: command.reason,
      action: command.action,
      atIntersection: entry.scene.atIntersection,
      intersectionBlocked: entry.scene.intersectionBlocked,
      intersectionExitM: entry.scene.intersectionExitM,
      stopAction: command.stopAction,
      stopRequested: command.stopRequested,
      yieldAction: command.yieldAction,
      yieldThresholdS: command.yieldThresholdS,
      requiredGapS: command.requiredGapS,
      minimumGapS: command.minimumGapS,
      allWayPosition: command.allWayPosition,
      allWaySinceDwellS: command.allWaySinceDwellS,
      rollThroughSpeedMps: command.rollThroughSpeedMps,
      rollingStopCapped: command.rollingStopCapped,
      blockedEntryProbability: command.blockedEntryProbability,
      blockedEntrySample: command.blockedEntrySample,
      blockedEntryGranted: command.blockedEntryGranted,
    });
  }
  const opportunityId = `opportunity-${id}`;
  return {
    episodeId: id,
    occurrence: options.occurrence ?? 0,
    eligibility: stopPriorityEligibility(opportunityId),
    artifacts: stopPriorityArtifacts(opportunityId, samples.length),
    samples,
  };
}

/** Joins the samples of several demonstrations into one episode, re-sequencing the ticks. */
export function mergeEpisodes(
  id: string,
  parts: readonly StopPriorityEvidenceEpisode[],
): StopPriorityEvidenceEpisode {
  const samples = parts
      .flatMap((part) => part.samples)
      .map((sample, index) => ({ ...sample, tick: index + 1 })),
    opportunityId = `opportunity-${id}`;
  return {
    episodeId: id,
    occurrence: 0,
    eligibility: stopPriorityEligibility(opportunityId),
    artifacts: stopPriorityArtifacts(opportunityId, samples.length),
    samples,
  };
}

/** Every declared scene keeps the rolling stop available unless it says otherwise. */
export const rollingScene: StopPriorityScene = Object.freeze({
  speed: 8,
  stopDistanceM: 6,
  stopSpeed: 8,
  stationaryDurationS: null,
  crossed: false,
  allWayArrival: null,
  atIntersection: false,
  intersectionBlocked: false,
  intersectionExitM: null,
  yieldGapS: null,
} as const);

/** A genuine 052 refusal: the subject yields and the separation is known. */
export const refusalScene = (yieldGapS: number): StopPriorityScene => ({
  speed: 8,
  stopDistanceM: null,
  stopSpeed: 8,
  stationaryDurationS: null,
  crossed: false,
  allWayArrival: null,
  atIntersection: true,
  intersectionBlocked: false,
  intersectionExitM: 12,
  yieldGapS,
});

/** A released 051 stop at an all-way stop where the subject is not the first arrival. */
export const allwayScene = (
  sinceDwellS: number,
  position = 2,
  released = true,
): StopPriorityScene => ({
  speed: 2,
  stopDistanceM: released ? 0.5 : 10,
  stopSpeed: 2,
  stationaryDurationS: released ? 2 : null,
  crossed: false,
  allWayArrival: { position, sinceDwellS },
  atIntersection: true,
  intersectionBlocked: false,
  intersectionExitM: 12,
  yieldGapS: null,
});

/** No declared exit space: the only scene where 175 samples the blocked-entry key. */
export const blockedScene = (overrides: Partial<StopPriorityScene> = {}): StopPriorityScene => ({
  speed: 8,
  stopDistanceM: null,
  stopSpeed: 8,
  stationaryDurationS: null,
  crossed: false,
  allWayArrival: null,
  atIntersection: true,
  intersectionBlocked: false,
  intersectionExitM: null,
  yieldGapS: null,
  ...overrides,
});

/** Opportunities whose blocked-entry draw satisfies the predicate. */
export function blockedEntryOpportunities(
  count: number,
  from: number,
  accept: (sample: number) => boolean,
): { opportunityKey: string; sample: number }[] {
  const found: { opportunityKey: string; sample: number }[] = [];
  for (let index = from; found.length < count; index += 1) {
    const opportunityKey = `opportunity-${index}`,
      sample = blockedEntrySample(opportunityKey);
    if (accept(sample)) found.push({ opportunityKey, sample });
  }
  if (found.length < count)
    throw new Error('No matching blocked-entry opportunity in fixture range');
  return found;
}

/** A grant draw well below any admissible key, so the sample proves `key > draw`. */
export function blockedEntryGrant(from = 0): { opportunityKey: string; sample: number } {
  return blockedEntryOpportunities(1, from, (sample) => sample > 0.15 && sample < 0.25)[0]!;
}
/** A denial draw below the 0.5 cap, so the sample proves `key â‰¤ draw`. */
export function blockedEntryDenial(from = 0): { opportunityKey: string; sample: number } {
  return blockedEntryOpportunities(1, from, (sample) => sample > 0.35 && sample < 0.45)[0]!;
}
/** A grant draw far from the cap, useful for a deliberately wide bracket. */
export function blockedEntryLowGrant(from = 0): { opportunityKey: string; sample: number } {
  return blockedEntryOpportunities(1, from, (sample) => sample > 0.02 && sample < 0.08)[0]!;
}
/** A denial draw right below the cap, useful for a deliberately wide bracket. */
export function blockedEntryHighDenial(from = 0): { opportunityKey: string; sample: number } {
  return blockedEntryOpportunities(1, from, (sample) => sample >= 0.44 && sample < 0.49)[0]!;
}
/** A grant draw next to the cap, where only the ceiling hides the value above it. */
export function blockedEntryCeilingGrant(from = 0): { opportunityKey: string; sample: number } {
  return blockedEntryOpportunities(1, from, (sample) => sample >= 0.46 && sample < 0.5)[0]!;
}
/** A denial draw at or above the cap: the cap, not the key, decided it. */
export function blockedEntryCappedDenial(from = 0): { opportunityKey: string; sample: number } {
  return blockedEntryOpportunities(1, from, (sample) => sample >= 0.55)[0]!;
}

/** Rolling stop: 051 declared `ROLL_THROUGH` and 175 commands the key as the crawl speed. */
export function rollingStopEpisodes(
  speeds: readonly number[] = [1.2, 1.2, 1.2, 1.2],
  options: { readonly idPrefix?: string; readonly from?: number } = {},
) {
  const prefix = options.idPrefix ?? 'rolling',
    from = options.from ?? 0;
  return speeds.map((speed, index) =>
    recordEpisode(
      `${prefix}-${index + 1}`,
      [0, 1, 2].map((offset) => ({
        scene: rollingScene,
        opportunityKey: `opportunity-${from + index * 10 + offset}`,
      })),
      { rolling_stop_speed: speed },
      { mValues: { stop_full_probability: 0 } },
    ),
  );
}

/** Eight heterogeneous rolling speeds in one set: the fact is real, the preference is not one. */
export function noisyRollingEpisodes() {
  return rollingStopEpisodes([0.2, 0.2, 2.5, 2.5], { idPrefix: 'rolling-noisy', from: 200 });
}

/** Two keys of the same profile cannot be both at or below the 2.5 m/s cap and above it. */
export function mixedRollingCapEpisodes() {
  return rollingStopEpisodes([1.2, 5, 1.2, 5], { idPrefix: 'rolling-cap-mixed', from: 300 });
}

/** A rolling stop exactly at the 2.5 m/s policy cap: the key above it is never revealed. */
export function cappedRollingEpisodes() {
  return rollingStopEpisodes([5, 5, 5, 5], { idPrefix: 'rolling-cap', from: 700 });
}

/** A demonstrated 052 refusal at a known gap: the claim or the yield bounds the key. */ export function priorityBracketEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `priority-bracket-${index + 1}`,
      [
        { scene: refusalScene(4.8), opportunityKey: `opportunity-${400 + index * 10}` },
        { scene: refusalScene(5), opportunityKey: `opportunity-${401 + index * 10}` },
      ],
      { priority_assertiveness: 0.35 },
      { mValues: { yield_time_gap: 6 } },
    ),
  );
}

/** Only claims: the key has a lower bound and no upper bound. */
export function priorityClaimOnlyEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `priority-claim-${index + 1}`,
      [
        { scene: refusalScene(5), opportunityKey: `opportunity-${500 + index * 10}` },
        { scene: refusalScene(5.5), opportunityKey: `opportunity-${501 + index * 10}` },
      ],
      { priority_assertiveness: 0.35 },
      { mValues: { yield_time_gap: 6 } },
    ),
  );
}

/** Only yields: the key has an upper bound and no lower bound. */
export function priorityYieldOnlyEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `priority-yield-${index + 1}`,
      [
        { scene: refusalScene(4.8), opportunityKey: `opportunity-${600 + index * 10}` },
        { scene: refusalScene(4), opportunityKey: `opportunity-${601 + index * 10}` },
      ],
      { priority_assertiveness: 0.35 },
      { mValues: { yield_time_gap: 6 } },
    ),
  );
}

/** A claim below a yielded gap: no single assertiveness satisfies both bounds. */
export function priorityContradictoryEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    mergeEpisodes(`priority-contradictory-${index + 1}`, [
      recordEpisode(
        `priority-contradictory-claim-${index + 1}`,
        [{ scene: refusalScene(5), opportunityKey: `opportunity-${700 + index * 10}` }],
        { priority_assertiveness: 0.5 },
        { mValues: { yield_time_gap: 6 } },
      ),
      recordEpisode(
        `priority-contradictory-yield-${index + 1}`,
        [{ scene: refusalScene(5.2), opportunityKey: `opportunity-${701 + index * 10}` }],
        { priority_assertiveness: 0.2 },
        { mValues: { yield_time_gap: 6 } },
      ),
    ]),
  );
}

/** A real claim and a real yield far apart: the bound is too wide to be a preference. */
export function widePriorityEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    mergeEpisodes(`priority-wide-${index + 1}`, [
      recordEpisode(
        `priority-wide-claim-${index + 1}`,
        [{ scene: refusalScene(5.8), opportunityKey: `opportunity-${800 + index * 10}` }],
        { priority_assertiveness: 0.1 },
        { mValues: { yield_time_gap: 6 } },
      ),
      recordEpisode(
        `priority-wide-yield-${index + 1}`,
        [{ scene: refusalScene(4.2), opportunityKey: `opportunity-${801 + index * 10}` }],
        { priority_assertiveness: 0.55 },
        { mValues: { yield_time_gap: 6 } },
      ),
    ]),
  );
}

/** The 052 threshold is already at the 3 s floor: the key is inert and cannot be measured. */
export function priorityInertEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `priority-inert-${index + 1}`,
      [{ scene: refusalScene(2), opportunityKey: `opportunity-${900 + index * 10}` }],
      { priority_assertiveness: 1 },
      { mValues: { yield_time_gap: 2.5 } },
    ),
  );
}

/** 052 granted the priority: no claim decision happened, so the key was never consulted. */
export function priorityGrantedEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `priority-granted-${index + 1}`,
      [{ scene: refusalScene(9), opportunityKey: `opportunity-${1000 + index * 10}` }],
      { priority_assertiveness: 0.35 },
      { mValues: { yield_time_gap: 6 } },
    ),
  );
}

/** A genuine refusal whose separation the world never reported. */
export function priorityUnknownSeparationEpisodes(): StopPriorityEvidenceEpisode[] {
  return [0, 1, 2, 3].map((index) => {
    const episode = recordEpisode(
        `priority-unknown-${index + 1}`,
        [{ scene: refusalScene(4.8), opportunityKey: `opportunity-${1100 + index * 10}` }],
        { priority_assertiveness: 0.35 },
        { mValues: { yield_time_gap: 6 } },
      ),
      samples = episode.samples.map((sample) => ({ ...sample, minimumGapS: null }));
    return { ...episode, samples } as StopPriorityEvidenceEpisode;
  });
}

/** All-way bracket: a held release at 3.8 s and a granted release at 4.2 s. */
export function allwayBracketEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `allway-bracket-${index + 1}`,
      [
        { scene: allwayScene(3.8), opportunityKey: `opportunity-${1200 + index * 10}` },
        { scene: allwayScene(4.2, 3), opportunityKey: `opportunity-${1201 + index * 10}` },
      ],
      { allway_stop_patience: 4 },
    ),
  );
}

/** Only granted releases: the key has an upper bound and no lower bound. */
export function allwayTurnOnlyEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `allway-turn-${index + 1}`,
      [
        { scene: allwayScene(4.2), opportunityKey: `opportunity-${1300 + index * 10}` },
        { scene: allwayScene(4.8, 3), opportunityKey: `opportunity-${1301 + index * 10}` },
      ],
      { allway_stop_patience: 4 },
    ),
  );
}

/** Only held releases: the key has a lower bound and no upper bound. */
export function allwayHoldOnlyEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `allway-hold-${index + 1}`,
      [
        { scene: allwayScene(3), opportunityKey: `opportunity-${1400 + index * 10}` },
        { scene: allwayScene(3.5, 3), opportunityKey: `opportunity-${1401 + index * 10}` },
      ],
      { allway_stop_patience: 4 },
    ),
  );
}

/** A hold beyond a granted release: no single patience satisfies both bounds. */
export function allwayContradictoryEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    mergeEpisodes(`allway-contradictory-${index + 1}`, [
      recordEpisode(
        `allway-contradictory-hold-${index + 1}`,
        [{ scene: allwayScene(5), opportunityKey: `opportunity-${1500 + index * 10}` }],
        { allway_stop_patience: 8 },
      ),
      recordEpisode(
        `allway-contradictory-turn-${index + 1}`,
        [{ scene: allwayScene(4, 3), opportunityKey: `opportunity-${1501 + index * 10}` }],
        { allway_stop_patience: 2 },
      ),
    ]),
  );
}

/** A hold at 2 s and a turn at 9 s: the bound is real but too wide to be a preference. */
export function wideAllwayEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    mergeEpisodes(`allway-wide-${index + 1}`, [
      recordEpisode(
        `allway-wide-hold-${index + 1}`,
        [{ scene: allwayScene(2), opportunityKey: `opportunity-${1600 + index * 10}` }],
        { allway_stop_patience: 8 },
      ),
      recordEpisode(
        `allway-wide-turn-${index + 1}`,
        [{ scene: allwayScene(9, 3), opportunityKey: `opportunity-${1601 + index * 10}` }],
        { allway_stop_patience: 2 },
      ),
    ]),
  );
}

/** The first arrival turns at once: 175 never delays it, so the key is not observed. */
export function allwayFirstArrivalEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `allway-first-${index + 1}`,
      [{ scene: allwayScene(0, 1), opportunityKey: `opportunity-${1700 + index * 10}` }],
      { allway_stop_patience: 4 },
    ),
  );
}

/** An approaching 051 STOP dominates the release: the patience branch is never reached. */
export function allwayNotReleasedEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `allway-approach-${index + 1}`,
      [{ scene: allwayScene(1, 2, false), opportunityKey: `opportunity-${1800 + index * 10}` }],
      { allway_stop_patience: 4 },
    ),
  );
}

/** Patience zero: the release is granted at 0 s, a demonstrated zero rather than missing data. */
export function zeroAllwayEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `allway-zero-${index + 1}`,
      [{ scene: allwayScene(0), opportunityKey: `opportunity-${1900 + index * 10}` }],
      { allway_stop_patience: 0 },
    ),
  );
}

/** Blocked entry: one granted draw below the key and one denied draw above it. */
export function blockedBracketEpisodes() {
  const grant = blockedEntryGrant(0),
    denial = blockedEntryDenial(0);
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `blocked-bracket-${index + 1}`,
      [
        { scene: blockedScene(), opportunityKey: grant.opportunityKey },
        { scene: blockedScene(), opportunityKey: denial.opportunityKey },
      ],
      { blocked_intersection_entry_probability: 0.3 },
    ),
  );
}

/** Only grants: the key has a lower bound and no upper bound. */
export function blockedGrantOnlyEpisodes() {
  const grant = blockedEntryGrant(0);
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `blocked-grant-${index + 1}`,
      [{ scene: blockedScene(), opportunityKey: grant.opportunityKey }],
      { blocked_intersection_entry_probability: 0.3 },
    ),
  );
}

/** Only denials below the cap: the key has an upper bound and no lower bound. */
export function blockedDenialOnlyEpisodes() {
  const denial = blockedEntryDenial(0);
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `blocked-denial-${index + 1}`,
      [{ scene: blockedScene(), opportunityKey: denial.opportunityKey }],
      { blocked_intersection_entry_probability: 0.3 },
    ),
  );
}

/** Grants next to the 0.5 ceiling: the cap cannot separate the key from values above it. */
export function blockedCeilingEpisodes() {
  const grant = blockedEntryCeilingGrant(0),
    capped = blockedEntryCappedDenial(0);
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `blocked-ceiling-${index + 1}`,
      [
        { scene: blockedScene(), opportunityKey: grant.opportunityKey },
        { scene: blockedScene(), opportunityKey: capped.opportunityKey },
      ],
      { blocked_intersection_entry_probability: 1 },
    ),
  );
}

/** The declared blocked interior vetoes entry before the draw: no probability evidence. */
export function blockedVetoEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `blocked-veto-${index + 1}`,
      [
        {
          scene: blockedScene({ intersectionBlocked: true }),
          opportunityKey: `opportunity-${2000 + index * 10}`,
        },
      ],
      { blocked_intersection_entry_probability: 1 },
    ),
  );
}

/** A declared exit space bypasses the sample entirely: the entry key is never consulted. */
export function blockedDeclaredExitEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `blocked-exit-${index + 1}`,
      [
        {
          scene: blockedScene({ intersectionExitM: 12 }),
          opportunityKey: `opportunity-${2100 + index * 10}`,
        },
      ],
      { blocked_intersection_entry_probability: 1 },
    ),
  );
}

/** A real grant and a real denial far apart: the bound is too wide to be a preference. */
export function wideBlockedEpisodes() {
  const grant = blockedEntryLowGrant(0),
    denial = blockedEntryHighDenial(0);
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `blocked-wide-${index + 1}`,
      [
        { scene: blockedScene(), opportunityKey: grant.opportunityKey },
        { scene: blockedScene(), opportunityKey: denial.opportunityKey },
      ],
      { blocked_intersection_entry_probability: 0.4 },
    ),
  );
}

/** A granted draw almost at the ceiling and a denial the cap decided: no interval. */
export function blockedContradictoryEpisodes() {
  const ceiling = blockedEntryCeilingGrant(0),
    denial = blockedEntryDenial(0);
  return [0, 1, 2, 3].map((index) =>
    mergeEpisodes(`blocked-contradictory-${index + 1}`, [
      recordEpisode(
        `blocked-contradictory-ceiling-${index + 1}`,
        [{ scene: blockedScene(), opportunityKey: ceiling.opportunityKey }],
        { blocked_intersection_entry_probability: 1 },
      ),
      recordEpisode(
        `blocked-contradictory-denial-${index + 1}`,
        [{ scene: blockedScene(), opportunityKey: denial.opportunityKey }],
        { blocked_intersection_entry_probability: 0.2 },
      ),
    ]),
  );
}

/** Four demonstrations in `MANUAL`: the policy runs, but 175 never applies the keys. */
export function manualEpisodes(): StopPriorityEvidenceEpisode[] {
  const episodes = rollingStopEpisodes([1.2, 1.2, 1.2, 1.2]);
  return episodes.map((episode) => ({
    ...episode,
    eligibility: { ...episode.eligibility, controlMode: 'MANUAL', learningEligible: false },
  })) as StopPriorityEvidenceEpisode[];
}

/** Positive set: every key has its own demonstrated episode family. */
export function positiveEpisodes(): StopPriorityEvidenceEpisode[] {
  return [
    ...rollingStopEpisodes(),
    ...priorityBracketEpisodes(),
    ...allwayBracketEpisodes(),
    ...blockedBracketEpisodes(),
  ];
}

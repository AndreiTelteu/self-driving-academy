import { FOLLOW_POLICY_LIMITS } from '../../src/autonomy';
import type { FollowPolicyState } from '../../src/autonomy/follow-policy';
import type {
  FollowEvidenceBinding,
  FollowEvidenceEpisode,
  FollowEvidenceSample,
} from '../../src/learning/follow-estimator';
import type { EligibilityWindowRecord, FilteredWindowRecord } from '../../src/telemetry';
import { followProfile, run } from '../autonomy/follow-policy-reference';
import type { FollowScene } from '../autonomy/follow-policy-reference';

/**
 * Deterministic 172 fixtures. They are produced by the delivered `171-follow-policy-v1` itself: a
 * scene sequence is run through the real layer with a known key set, and the resulting command
 * facts (binding, request, commitment, leader state) become the evidence samples. The estimator
 * therefore inverts exactly the arithmetic that produced the demonstration, and a scene that never
 * makes a key act can only leave that key `UNOBSERVED`.
 *
 * The values are plausible demonstrations, not measured data: they prove the context, uncertainty,
 * split and refusal contract of the learning layer, not the final calibration.
 */
export const followScene = Object.freeze({
  sessionId: '172-session',
  worldEpoch: 4,
  vehicleId: 'taxi-172',
  incarnation: '1',
  segmentId: 'segment-172',
});
/** The four 048 M keys that own the following preference the 171 keys shape. */
export const followMValues = Object.freeze({
  following_time_headway: 1.8,
  following_min_gap: 3,
  queue_standstill_gap: 2,
  following_speed_gain: 0.7,
});
/** The catalog defaults, used as the demonstrated preference unless a scene says otherwise. */
export const demonstratedKeys = Object.freeze({
  cutin_brake_response: 0.7,
  closing_ttc_threshold: 3,
  leader_change_delay: 0.2,
  following_hysteresis: 1,
});

export function followEligibility(
  windowClass: 'ELIGIBLE' | 'EXTERNAL_CONSTRAINT',
  opportunityId: string,
  overrides: Partial<EligibilityWindowRecord> = {},
): EligibilityWindowRecord {
  return {
    windowId: `window-${opportunityId}`,
    opportunityId,
    kind: 'LEADER',
    reason: 'NO_CONSTRAINT',
    source: 'NONE',
    observable: true,
    vehicleId: followScene.vehicleId,
    incarnation: followScene.incarnation,
    segmentId: followScene.segmentId,
    controlMode: 'LEARNING',
    learningEligible: true,
    openedTick: 0,
    lastTick: 600,
    observationCount: 600,
    reaction: { open: false, reason: 'SEGMENT_EXCLUDED' },
    windowClass,
    label: windowClass === 'ELIGIBLE' ? 'LEADER' : 'CONSTRAINT',
    ...overrides,
  } as EligibilityWindowRecord;
}

export function followArtifacts(opportunityId: string, toTick = 600): FilteredWindowRecord {
  return {
    windowId: `window-${opportunityId}`,
    sessionId: followScene.sessionId,
    worldEpoch: followScene.worldEpoch,
    segmentId: followScene.segmentId,
    vehicleId: followScene.vehicleId,
    incarnation: followScene.incarnation,
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

interface SceneEntry {
  readonly ego: number;
  readonly gap: number | null;
  readonly lead: number | null;
  readonly leader?: string;
  readonly cutIn?: boolean;
  readonly stopRequired?: boolean;
  readonly cruiseTarget?: number;
}

function scenesFor(entries: readonly SceneEntry[]): FollowScene[] {
  return entries.map((entry) => ({
    egoSpeed: entry.ego,
    leadGap: entry.gap,
    leadSpeed: entry.lead,
    leaderId: entry.leader ?? 'a',
    leaderIncarnation: 1,
    cutIn: entry.cutIn ?? false,
    stopRequired: entry.stopRequired ?? false,
    cruiseTargetMps: entry.cruiseTarget ?? 16,
  }));
}

/**
 * Runs the delivered 171 layer over the scenes and records one sample per tick. The previous
 * leader and commitment come from the caller state, exactly as the policy receives them.
 */
export function recordEpisode(
  id: string,
  entries: readonly SceneEntry[],
  keys: Readonly<Record<string, number>>,
  options: { occurrence?: number; initial?: FollowPolicyState } = {},
): FollowEvidenceEpisode {
  const scenes = scenesFor(entries),
    rows = run(followProfile(keys), scenes, { initial: options.initial }),
    samples: FollowEvidenceSample[] = [];
  let previousLeaderId = options.initial?.leaderId ?? null,
    previousLeaderIncarnation = options.initial?.leaderIncarnation ?? null,
    previousCommittedMps = options.initial?.committedTargetMps ?? null;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!,
      scene = scenes[index]!;
    samples.push({
      tick: index,
      egoSpeedMps: scene.egoSpeed,
      leaderId: row.state.leaderId,
      leaderIncarnation: row.state.leaderIncarnation,
      leadGapM: row.gapM,
      leadSpeedMps: row.gapM === null ? null : scene.leadSpeed,
      desiredGapM: row.desiredGapM,
      previousLeaderId,
      previousLeaderIncarnation,
      previousCommittedMps,
      cutIn: scene.cutIn ?? false,
      stopRequired: scene.stopRequired ?? false,
      policyActive: row.reason === 'FOLLOW_POLICY',
      requestedTargetMps: row.requestedTargetMps,
      committedTargetMps: row.committedTargetMps,
      binding: row.bindingConstraint as FollowEvidenceBinding,
    });
    previousLeaderId = row.state.leaderId;
    previousLeaderIncarnation = row.state.leaderIncarnation;
    previousCommittedMps = row.committedTargetMps;
  }
  const opportunityId = `opportunity-${id}`;
  return {
    episodeId: id,
    occurrence: options.occurrence ?? 0,
    eligibility: followEligibility('ELIGIBLE', opportunityId),
    artifacts: followArtifacts(opportunityId, samples.length),
    samples,
  };
}

const cutInScenes: readonly [SceneEntry, SceneEntry][] = [
  [
    { ego: 15, gap: 40, lead: 15, leader: 'a' },
    { ego: 15, gap: 18, lead: 12, leader: 'b', cutIn: true },
  ],
  [
    { ego: 15, gap: 40, lead: 15, leader: 'a' },
    { ego: 15, gap: 20, lead: 11, leader: 'b', cutIn: true },
  ],
  [
    { ego: 15, gap: 40, lead: 15, leader: 'a' },
    { ego: 14, gap: 22, lead: 10, leader: 'b', cutIn: true },
  ],
  [
    { ego: 15, gap: 40, lead: 15, leader: 'a' },
    { ego: 16, gap: 19, lead: 12, leader: 'b', cutIn: true },
  ],
];

/** A cut-in tick with a real reduction offered by 048: the key is the applied fraction. */
export function cutInEpisodes(factors: readonly number[] = [0.7, 0.7, 0.7, 0.7]) {
  return factors.map((factor, index) =>
    recordEpisode(`cutin-${index + 1}`, cutInScenes[index % cutInScenes.length]!, {
      ...demonstratedKeys,
      cutin_brake_response: factor,
    }),
  );
}

const closingScenes = [
  { ego: 18, gap: 60, lead: 4 },
  { ego: 16, gap: 50, lead: 3 },
  { ego: 20, gap: 70, lead: 5 },
  { ego: 17, gap: 55, lead: 4 },
];

/** A real closing where the contact cap binds: the key is the margin divided by the allowed speed. */
export function closingEpisodes(thresholds: readonly number[] = [3, 3, 3, 3]) {
  return thresholds.map((threshold, index) => {
    const scene = closingScenes[index % closingScenes.length]!,
      entries: SceneEntry[] = [
        { ...scene, cruiseTarget: 30 },
        { ...scene, cruiseTarget: 30 },
      ];
    return recordEpisode(`closing-${index + 1}`, entries, {
      ...demonstratedKeys,
      closing_ttc_threshold: threshold,
    });
  });
}

const leaderChangeScenes = [
  { previous: { ego: 12, gap: 20, lead: 12 }, next: { ego: 12, gap: 60, lead: 20 } },
  { previous: { ego: 12, gap: 22, lead: 12 }, next: { ego: 12, gap: 55, lead: 19 } },
  { previous: { ego: 12, gap: 18, lead: 12 }, next: { ego: 12, gap: 65, lead: 21 } },
  { previous: { ego: 12, gap: 24, lead: 12 }, next: { ego: 12, gap: 50, lead: 18 } },
];

/** A leader change without cut-in whose adoption accelerates: the hold length is the key. */
export function leaderChangeEpisodes(delays: readonly number[] = [0.2, 0.2, 0.2, 0.2]) {
  return delays.map((delay, index) => {
    const scene = leaderChangeScenes[index % leaderChangeScenes.length]!,
      hold = Math.ceil(delay * FOLLOW_POLICY_LIMITS.tickHz),
      entries: SceneEntry[] = [
        { ...scene.previous, leader: 'a' },
        ...Array.from({ length: hold + 2 }, () => ({ ...scene.next, leader: 'b' })),
      ];
    return recordEpisode(`leader-change-${index + 1}`, entries, {
      ...demonstratedKeys,
      leader_change_delay: delay,
    });
  });
}

/** Four braking ramps around a two-second delay: the hold is real but scattered. */
export function noisyDelayEpisodes() {
  return leaderChangeEpisodes([0, 0.5, 1.5, 2]);
}

const oscillationOffsets = [1.2, 0.8, -0.8, 0.15, -0.15, 1.2, -1.2, 0.65, -0.65];

function oscillationEpisode(
  id: string,
  band: number,
  ego: number,
  offsets: readonly number[],
): FollowEvidenceEpisode {
  const desired = followMValues.following_min_gap + followMValues.following_time_headway * ego,
    entries: SceneEntry[] = offsets.map((offset) => ({
      ego,
      gap: desired + offset,
      lead: ego,
      leader: 'a',
    }));
  return recordEpisode(id, entries, { ...demonstratedKeys, following_hysteresis: band });
}

/** A real oscillation around the desired gap: held and escaped samples bound the band. */
export function hysteresisEpisodes(
  bands: readonly number[] = [1, 1, 1, 1],
  egos: readonly number[] = [12, 11, 13, 12.5],
) {
  return bands.map((band, index) =>
    oscillationEpisode(
      `hysteresis-${index + 1}`,
      band,
      egos[index % egos.length]!,
      oscillationOffsets,
    ),
  );
}

/** Four cut-in reactions far apart: the fact is real, the preference is not yet identified. */
export function noisyCutInEpisodes() {
  return cutInEpisodes([0.1, 0.35, 0.8, 1]);
}

/** A cut-in where 048 asks for more speed than the previous commitment: nothing is offered. */
export function cutInWithoutReductionEpisodes() {
  const entries: SceneEntry[] = [
    { ego: 14, gap: 8, lead: 0, leader: 'a' },
    { ego: 14, gap: 40, lead: 14, leader: 'b', cutIn: true },
  ];
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(`cutin-no-reduction-${index + 1}`, entries, demonstratedKeys),
  );
}

/** A real closing whose cap never binds: the margin is a bound, not an observation. */
export function closingWithoutCapEpisodes() {
  const entries: SceneEntry[] = [
    { ego: 15, gap: 40, lead: 12 },
    { ego: 15, gap: 40, lead: 12 },
  ];
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(`closing-without-cap-${index + 1}`, entries, demonstratedKeys),
  );
}

/** A leader change whose hold is cut by the evidence window. */
export function censoredHoldEpisodes() {
  return [0, 1, 2, 3].map((index) => {
    const scene = leaderChangeScenes[index % leaderChangeScenes.length]!,
      entries: SceneEntry[] = [
        { ...scene.previous, leader: 'a' },
        ...Array.from({ length: 5 }, () => ({ ...scene.next, leader: 'b' })),
      ];
    return recordEpisode(`censored-hold-${index + 1}`, entries, demonstratedKeys);
  });
}

/** The new leader brakes during the hold: the reduction is adopted at once, so no delay is read. */
export function interruptedHoldEpisodes() {
  const entries: SceneEntry[] = [
    { ego: 12, gap: 20, lead: 12, leader: 'a' },
    { ego: 12, gap: 60, lead: 20, leader: 'b' },
    { ego: 12, gap: 20, lead: 2, leader: 'b' },
  ];
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(`interrupted-hold-${index + 1}`, entries, demonstratedKeys),
  );
}

/** Every sample stays inside the band: only the lower bound is observed. */
export function bandUpperUnobservedEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    oscillationEpisode(`band-upper-${index + 1}`, 3, 12, [1.2, 0.8, -0.8, 0.15, -0.15]),
  );
}

/** Two incompatible bands: the widest held deviation exceeds the smallest escaped one. */
export function contradictoryBandEpisodes() {
  return [
    oscillationEpisode('wide-band-1', 2, 12, [2.4, 1.4, -1.4, 0.3, -0.3, 2.4, -2.4]),
    oscillationEpisode('wide-band-2', 2, 11, [2.4, 1.4, -1.4, 0.3, -0.3, 2.4, -2.4]),
    oscillationEpisode('narrow-band-1', 0.5, 13, [0.9, 0.3, -0.3, 0.1, -0.1, 0.9, -0.9]),
    oscillationEpisode('narrow-band-2', 0.5, 12.5, [0.9, 0.3, -0.3, 0.1, -0.1, 0.9, -0.9]),
  ];
}

/** A band observed only above the desired gap: there is no oscillation to prove the tolerance. */
export function oneSidedBandEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    oscillationEpisode(`one-sided-${index + 1}`, 1, 12, [1.2, 0.8, 0.6, 1.2, 0.4, 1.2]),
  );
}

/** A manual demonstration: 048 runs, but 171 never applies the keys, so nothing can be learned. */
export function manualEpisodes() {
  const entries: SceneEntry[] = [{ ego: 12, gap: 20, lead: 12, leader: 'a' }];
  return [0, 1, 2, 3].map((index) => {
    const episode = recordEpisode(`manual-${index + 1}`, entries, demonstratedKeys);
    return {
      ...episode,
      eligibility: { ...episode.eligibility, controlMode: 'MANUAL', learningEligible: false },
    } as FollowEvidenceEpisode;
  });
}

/** Positive set: every key has its own demonstrated episode family. */
export function positiveEpisodes(): FollowEvidenceEpisode[] {
  return [
    ...cutInEpisodes(),
    ...closingEpisodes(),
    ...leaderChangeEpisodes(),
    ...hysteresisEpisodes(),
  ];
}

export type { FollowPolicyState };

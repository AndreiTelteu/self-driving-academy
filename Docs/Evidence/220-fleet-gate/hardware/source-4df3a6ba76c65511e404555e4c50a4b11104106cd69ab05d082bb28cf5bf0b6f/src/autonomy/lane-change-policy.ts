import { choice, fields, number, record, requireContract, tick } from '../sessions';
import { validateParameterValue } from '../profiles';
import type { DrivingProfile } from '../profiles';
import type { RoadAccess } from '../world';
import type { BehaviorActor, BehaviorFacts, BehaviorScope } from './behavior-fsm';
import { parseBehaviorFacts } from './behavior-fsm';

export const LANE_CHANGE_KEYS = Object.freeze([
  'lane_change_front_gap',
  'lane_change_back_gap',
  'lane_change_speed_gain',
  'lane_change_cooldown',
] as const);
export type LaneChangeKey = (typeof LANE_CHANGE_KEYS)[number];
export const LANE_CHANGE_LIMITS = Object.freeze({
  version: '053-lane-change-v1' as const,
  adjacencyVersion: '053-lane-adjacency-v1' as const,
  observationVersion: '053-lane-observation-v1' as const,
  actors: 110,
  neighbors: 2,
  maximumObservationAgeTicks: 6,
  identityCodeUnits: 256,
  profileCodeUnits: 128,
  gapM: 10000,
  speedMps: 100,
  cooldownTicks: 1800,
  tickHz: 60,
  retainedHistory: 0,
});
export interface LaneChangeProfile {
  readonly versionId: string;
  readonly frontGapM: number;
  readonly backGapM: number;
  readonly speedGainMps: number;
  readonly cooldownS: number;
}
/** Explicit033 lateral-neighbour projection authored by the graph owner; never an invented edge. */
export interface LaneChangeAdjacency {
  readonly version: '053-lane-adjacency-v1';
  readonly mapId: string;
  readonly currentLaneId: string;
  readonly access: RoadAccess;
  readonly neighbors: readonly Readonly<{
    laneId: string;
    side: 'LEFT' | 'RIGHT';
  }>[];
}
export interface LaneChangeObservation {
  readonly version: '053-lane-observation-v1';
  readonly units: 'SI';
  readonly tick: number;
  readonly targetLaneId: string;
  /** LOCAL_ONLY never certifies a horizon-wide gap; the optional change is refused instead. */
  readonly coverage: 'COMPLETE' | 'LOCAL_ONLY';
  /** null explicitly asserts no observable vehicle in the target lane. */
  readonly frontGapM: number | null;
  readonly backGapM: number | null;
  /** Achievable speed in the target lane; the source of the speed advantage. */
  readonly targetLaneSpeedMps: number;
}
/** Caller-held latch. Carrying it forward is what gives a started manoeuvre continuity. */
export interface LaneChangeState {
  readonly committed: Readonly<{ targetLaneId: string; startedTick: number }> | null;
  readonly lastChangeTick: number | null;
}
export const LANE_CHANGE_EMPTY_STATE: LaneChangeState = Object.freeze({
  committed: null,
  lastChangeTick: null,
});
export interface LaneChangeInput extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly profile: LaneChangeProfile | null;
  readonly state: LaneChangeState;
  readonly adjacency: LaneChangeAdjacency | null;
  readonly observation: LaneChangeObservation | null;
  /** Authoritative ego longitudinal speed. */
  readonly speedMps: number;
  /** Leader in the current lane; null when the lane is clear. */
  readonly ownLaneLeaderSpeedMps: number | null;
  readonly intent: 'NONE' | 'OPTIONAL_OVERTAKE';
}
export interface LaneChangeDecision extends BehaviorScope {
  readonly version: '053-lane-change-v1';
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly profileVersionId: string | null;
  readonly action: 'CHANGE' | 'NO_CHANGE' | 'UNKNOWN';
  readonly reason:
    | 'NO_INTENT'
    | 'NO_OBSERVATION'
    | 'MISSING_PROFILE'
    | 'MISSING_LANE_GRAPH'
    | 'OBSERVATION_UNAVAILABLE'
    | 'NO_ADJACENT_LANE'
    | 'TARGET_LANE_NOT_ADJACENT'
    | 'INCOMPLETE_LANE_COVERAGE'
    | 'COOLDOWN_ACTIVE'
    | 'INSUFFICIENT_FRONT_GAP'
    | 'INSUFFICIENT_BACK_GAP'
    | 'INSUFFICIENT_SPEED_GAIN'
    | 'OPTIONAL_CHANGE_VALIDATED'
    | 'COMMITTED_CONTINUITY'
    | 'COMMITMENT_RELEASED';
  readonly targetLaneId: string | null;
  readonly frontGapM: number | null;
  readonly backGapM: number | null;
  readonly speedAdvantageMps: number | null;
  readonly requiredFrontGapM: number | null;
  readonly requiredBackGapM: number | null;
  readonly requiredSpeedGainMps: number | null;
  readonly cooldownTicks: number | null;
  readonly cooldownRemainingTicks: number | null;
  /** The latch the caller must carry into the next decision. */
  readonly state: LaneChangeState;
  readonly retainedHistory: 0;
}
let evaluating = false;
export function getLaneChangeStats() {
  return Object.freeze({
    evaluating,
    retainedActors: 0,
    retainedManoeuvres: 0,
    retainedHistory: 0,
  });
}
function identity(value: unknown, limit: number = LANE_CHANGE_LIMITS.identityCodeUnits): string {
  requireContract(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= limit &&
      value.trim() === value,
    'Invalid lane-change identity',
  );
  return value;
}
function gap(value: unknown): number | null {
  return value === null ? null : number(value, 0, LANE_CHANGE_LIMITS.gapM);
}
function speed(value: unknown): number | null {
  return value === null ? null : number(value, 0, LANE_CHANGE_LIMITS.speedMps);
}
/** Reads only the selected own data from an already published profile, no capability grant. */
export function projectLaneChangeProfile(input: DrivingProfile): LaneChangeProfile {
  const profile = record(input),
    parameters = record(profile.parameters),
    units = record(profile.unitsByParameter);
  requireContract(
    Object.keys(parameters).length <= 80 && Object.keys(units).length <= 80,
    'Lane-change profile map capacity',
  );
  return Object.freeze({
    versionId: identity(profile.versionId, LANE_CHANGE_LIMITS.profileCodeUnits),
    frontGapM: validateParameterValue(
      'lane_change_front_gap',
      parameters.lane_change_front_gap,
      units.lane_change_front_gap,
    ),
    backGapM: validateParameterValue(
      'lane_change_back_gap',
      parameters.lane_change_back_gap,
      units.lane_change_back_gap,
    ),
    speedGainMps: validateParameterValue(
      'lane_change_speed_gain',
      parameters.lane_change_speed_gain,
      units.lane_change_speed_gain,
    ),
    cooldownS: validateParameterValue(
      'lane_change_cooldown',
      parameters.lane_change_cooldown,
      units.lane_change_cooldown,
    ),
  });
}
function adjacency(input: unknown): LaneChangeAdjacency {
  const data = fields(input, ['version', 'mapId', 'currentLaneId', 'access', 'neighbors']);
  requireContract(
    data.version === LANE_CHANGE_LIMITS.adjacencyVersion,
    'Lane-change adjacency version',
  );
  requireContract(
    Array.isArray(data.neighbors) && data.neighbors.length <= LANE_CHANGE_LIMITS.neighbors,
    'Lane-change adjacency capacity',
  );
  const neighbors: { laneId: string; side: 'LEFT' | 'RIGHT' }[] = [],
    seen = new Set<string>();
  for (const raw of data.neighbors as unknown[]) {
    const neighbor = fields(raw, ['laneId', 'side']),
      laneId = identity(neighbor.laneId);
    requireContract(!seen.has(laneId), 'Duplicate lane-change neighbor');
    seen.add(laneId);
    neighbors.push(
      Object.freeze({
        laneId,
        side: choice(neighbor.side, ['LEFT', 'RIGHT']),
      }),
    );
  }
  return Object.freeze({
    version: LANE_CHANGE_LIMITS.adjacencyVersion,
    mapId: identity(data.mapId),
    currentLaneId: identity(data.currentLaneId),
    access: choice(data.access, ['TAXI', 'CIVIL']),
    neighbors: Object.freeze(neighbors),
  });
}
function observation(input: unknown): LaneChangeObservation {
  const data = fields(input, [
    'version',
    'units',
    'tick',
    'targetLaneId',
    'coverage',
    'frontGapM',
    'backGapM',
    'targetLaneSpeedMps',
  ]);
  requireContract(
    data.version === LANE_CHANGE_LIMITS.observationVersion && data.units === 'SI',
    'Lane-change observation version/units',
  );
  return Object.freeze({
    version: LANE_CHANGE_LIMITS.observationVersion,
    units: 'SI',
    tick: tick(data.tick),
    targetLaneId: identity(data.targetLaneId),
    coverage: choice(data.coverage, ['COMPLETE', 'LOCAL_ONLY']),
    frontGapM: gap(data.frontGapM),
    backGapM: gap(data.backGapM),
    targetLaneSpeedMps: number(data.targetLaneSpeedMps, 0, LANE_CHANGE_LIMITS.speedMps),
  });
}
function state(input: unknown): LaneChangeState {
  const data = fields(input, ['committed', 'lastChangeTick']);
  let committed: LaneChangeState['committed'] = null;
  if (data.committed !== null) {
    const raw = fields(data.committed, ['targetLaneId', 'startedTick']);
    committed = Object.freeze({
      targetLaneId: identity(raw.targetLaneId),
      startedTick: tick(raw.startedTick),
    });
  }
  return Object.freeze({
    committed,
    lastChangeTick: data.lastChangeTick === null ? null : tick(data.lastChangeTick),
  });
}
/**
 * Pure 053 gate on an OPTIONAL lane change. The manoeuvre latch travels in the input/output state,
 * so a started manoeuvre keeps continuity instead of being re-validated and reset every frame.
 */
export function evaluateLaneChange(input: LaneChangeInput): LaneChangeDecision {
  requireContract(!evaluating, 'Reentrant lane-change evaluation');
  evaluating = true;
  try {
    const value = fields(input, [
      'sessionId',
      'worldEpoch',
      'actor',
      'decisionTick',
      'profile',
      'state',
      'adjacency',
      'observation',
      'speedMps',
      'ownLaneLeaderSpeedMps',
      'intent',
    ]);
    const sessionId = identity(value.sessionId),
      worldEpoch = tick(value.worldEpoch),
      actorData = fields(value.actor, ['id', 'incarnation']),
      actor = Object.freeze({
        id: identity(actorData.id),
        incarnation: tick(actorData.incarnation),
      }),
      decisionTick = tick(value.decisionTick),
      speedMps = number(value.speedMps, 0, LANE_CHANGE_LIMITS.speedMps),
      ownLaneLeaderSpeedMps = speed(value.ownLaneLeaderSpeedMps),
      intent = choice(value.intent, ['NONE', 'OPTIONAL_OVERTAKE']),
      latch = state(value.state),
      profile =
        value.profile === null
          ? null
          : (() => {
              const data = fields(value.profile, [
                'versionId',
                'frontGapM',
                'backGapM',
                'speedGainMps',
                'cooldownS',
              ]);
              return Object.freeze({
                versionId: identity(data.versionId, LANE_CHANGE_LIMITS.profileCodeUnits),
                frontGapM: validateParameterValue('lane_change_front_gap', data.frontGapM, 'm'),
                backGapM: validateParameterValue('lane_change_back_gap', data.backGapM, 'm'),
                speedGainMps: validateParameterValue(
                  'lane_change_speed_gain',
                  data.speedGainMps,
                  'm/s',
                ),
                cooldownS: validateParameterValue('lane_change_cooldown', data.cooldownS, 's'),
              });
            })(),
      graph = value.adjacency === null ? null : adjacency(value.adjacency),
      read = value.observation === null ? null : observation(value.observation);
    requireContract(
      latch.committed === null || latch.committed.startedTick <= decisionTick,
      'Lane-change commitment cannot start in the future',
    );
    requireContract(
      latch.lastChangeTick === null || latch.lastChangeTick <= decisionTick,
      'Lane-change cooldown cannot start in the future',
    );
    const cooldownTicks =
        profile === null ? null : Math.ceil(profile.cooldownS * LANE_CHANGE_LIMITS.tickHz),
      cooldownRemainingTicks =
        cooldownTicks === null || latch.lastChangeTick === null
          ? null
          : Math.max(0, cooldownTicks - (decisionTick - latch.lastChangeTick));
    const decision = (
      action: LaneChangeDecision['action'],
      reason: LaneChangeDecision['reason'],
      targetLaneId: string | null,
      speedAdvantageMps: number | null,
      next: LaneChangeState = latch,
    ): LaneChangeDecision =>
      Object.freeze({
        version: LANE_CHANGE_LIMITS.version,
        sessionId,
        worldEpoch,
        actor,
        decisionTick,
        profileVersionId: profile?.versionId ?? null,
        action,
        reason,
        targetLaneId,
        frontGapM: read?.frontGapM ?? null,
        backGapM: read?.backGapM ?? null,
        speedAdvantageMps,
        requiredFrontGapM: profile?.frontGapM ?? null,
        requiredBackGapM: profile?.backGapM ?? null,
        requiredSpeedGainMps: profile?.speedGainMps ?? null,
        cooldownTicks,
        cooldownRemainingTicks,
        state: next,
        retainedHistory: 0,
      });
    if (profile === null) return decision('UNKNOWN', 'MISSING_PROFILE', null, null);
    if (graph === null) return decision('UNKNOWN', 'MISSING_LANE_GRAPH', null, null);
    if (read === null) return decision('NO_CHANGE', 'NO_OBSERVATION', null, null);
    if (
      read.tick > decisionTick ||
      decisionTick - read.tick > LANE_CHANGE_LIMITS.maximumObservationAgeTicks
    )
      return decision('UNKNOWN', 'OBSERVATION_UNAVAILABLE', null, null);
    const available = graph.neighbors;
    // A committed manoeuvre owns its target lane: it continues while that lane is still an authored
    // lateral neighbour, without re-reading the start gates, and is released explicitly otherwise.
    if (latch.committed !== null) {
      if (!available.some((neighbor) => neighbor.laneId === latch.committed!.targetLaneId))
        return decision(
          'NO_CHANGE',
          'COMMITMENT_RELEASED',
          latch.committed.targetLaneId,
          null,
          Object.freeze({ committed: null, lastChangeTick: latch.lastChangeTick }),
        );
      return decision('CHANGE', 'COMMITTED_CONTINUITY', latch.committed.targetLaneId, null, latch);
    }
    if (available.length === 0) return decision('NO_CHANGE', 'NO_ADJACENT_LANE', null, null);
    if (!available.some((neighbor) => neighbor.laneId === read.targetLaneId))
      return decision('NO_CHANGE', 'TARGET_LANE_NOT_ADJACENT', null, null);
    if (intent === 'NONE') return decision('NO_CHANGE', 'NO_INTENT', null, null);
    if (read.coverage !== 'COMPLETE')
      return decision('NO_CHANGE', 'INCOMPLETE_LANE_COVERAGE', read.targetLaneId, null);
    if (cooldownRemainingTicks !== null && cooldownRemainingTicks > 0)
      return decision('NO_CHANGE', 'COOLDOWN_ACTIVE', read.targetLaneId, null);
    // Complete coverage means a null gap is an observed clear lane, never unknown availability.
    if (read.frontGapM !== null && read.frontGapM < profile.frontGapM)
      return decision('NO_CHANGE', 'INSUFFICIENT_FRONT_GAP', read.targetLaneId, null);
    if (read.backGapM !== null && read.backGapM < profile.backGapM)
      return decision('NO_CHANGE', 'INSUFFICIENT_BACK_GAP', read.targetLaneId, null);
    const constrainedSpeedMps =
        ownLaneLeaderSpeedMps === null ? speedMps : Math.min(speedMps, ownLaneLeaderSpeedMps),
      speedAdvantageMps = read.targetLaneSpeedMps - constrainedSpeedMps;
    if (speedAdvantageMps < profile.speedGainMps)
      return decision('NO_CHANGE', 'INSUFFICIENT_SPEED_GAIN', read.targetLaneId, speedAdvantageMps);
    return decision(
      'CHANGE',
      'OPTIONAL_CHANGE_VALIDATED',
      read.targetLaneId,
      speedAdvantageMps,
      Object.freeze({
        committed: Object.freeze({
          targetLaneId: read.targetLaneId,
          startedTick: decisionTick,
        }),
        lastChangeTick: decisionTick,
      }),
    );
  } finally {
    evaluating = false;
  }
}
/**
 * 045 bridge. Only raises CHANGE_LANE or clears its own validated fact; nothing else is fabricated.
 */
export function laneChangeBehaviorFacts(
  base: BehaviorFacts,
  decision: LaneChangeDecision,
): BehaviorFacts | null {
  const facts = parseBehaviorFacts(base),
    diagnostic = record(decision);
  requireContract(
    diagnostic.version === LANE_CHANGE_LIMITS.version,
    'Lane-change/FSM version mismatch',
  );
  const action = choice(diagnostic.action, ['CHANGE', 'NO_CHANGE', 'UNKNOWN']);
  if (action === 'UNKNOWN') return null;
  requireContract(
    typeof diagnostic.profileVersionId === 'string' &&
      facts.profileVersionId === diagnostic.profileVersionId,
    'Lane-change/FSM profile mismatch',
  );
  if (action === 'CHANGE')
    return facts.laneChange === 'VALIDATED'
      ? facts
      : Object.freeze({ ...facts, laneChange: 'VALIDATED' });
  return facts.laneChange === 'VALIDATED' ? Object.freeze({ ...facts, laneChange: 'NONE' }) : facts;
}

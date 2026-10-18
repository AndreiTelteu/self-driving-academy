import { fields, list, number, tick, boolean, choice, requireContract, record } from '../sessions';
import { validateParameterValue, type DrivingProfile } from '../profiles';
import type { PriorityArrival } from '../world';
import type { BehaviorFacts } from './behavior-fsm';
import { parseBehaviorFacts } from './behavior-fsm';

export const YIELD_POLICY_LIMITS = Object.freeze({
  version: '052-yield-interval-v1' as const,
  actors: 110,
  candidates: 128,
  pairs: 4096,
  timeSeconds: 60,
  identityCodeUnits: 256,
  profileCodeUnits: 128,
  maximumObservationAgeTicks: 6,
  retainedHistory: 0,
});
export interface YieldProfile {
  readonly versionId: string;
  readonly yieldTimeGapS: number;
}
export interface YieldActor {
  readonly id: string;
  readonly incarnation: number;
  readonly active: boolean;
  readonly observable: boolean;
  readonly routeKnown: boolean;
}
export interface YieldCandidate {
  readonly relationId: string;
  readonly entryS: number;
  readonly exitS: number;
}
export interface YieldPair {
  readonly relationId: string;
  readonly otherActorId: string;
  readonly priority: 'YIELD' | 'PRIORITY' | 'EQUAL';
  readonly arrival: PriorityArrival | null;
}
/** Facts authored by an owner of complete horizon coverage and explicit038map priority. */
export interface YieldPolicyInput {
  readonly version: '052-yield-interval-v1';
  readonly units: 'SI';
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly subjectId: string;
  readonly observationTick: number;
  readonly decisionTick: number;
  readonly profile: YieldProfile;
  readonly coverage: 'COMPLETE_HORIZON' | 'LOCAL_ONLY' | 'INCOMPLETE';
  readonly horizonS: number;
  readonly discontinuity: boolean;
  readonly actors: readonly YieldActor[];
  readonly candidates: readonly YieldCandidate[];
  readonly pairs: readonly YieldPair[];
}
export interface YieldPolicyDecision {
  readonly version: '052-yield-interval-v1';
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly subjectId: string;
  readonly sourceTick: number;
  readonly decisionTick: number;
  readonly profileVersionId: string;
  readonly action: 'ACCEPT' | 'REFUSE' | 'UNKNOWN';
  readonly reason: 'GAP_ACCEPTED' | 'GAP_REFUSED' | 'NO_EXPOSURE' | 'UNAVAILABLE';
  readonly thresholdS: number;
  readonly minimumGapS: number | null;
  readonly comparedPairs: number;
  readonly limitingRelationId: string | null;
  readonly retainedHistory: 0;
}
function identity(value: unknown, limit: number = YIELD_POLICY_LIMITS.identityCodeUnits): string {
  requireContract(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= limit &&
      value.trim() === value,
    'Invalid yield identity',
  );
  return value;
}
function bounded<T>(input: unknown, cap: number, read: (input: unknown) => T): readonly T[] {
  requireContract(Array.isArray(input) && input.length <= cap, 'Yield admission capacity exceeded');
  return list(input, read);
}
const time = (input: unknown) => number(input, 0, YIELD_POLICY_LIMITS.timeSeconds);
/** Reads only the selected own data from an already published profile, no capability grant. */
export function projectYieldProfile(input: DrivingProfile): YieldProfile {
  const profile = record(input),
    parameters = record(profile.parameters),
    units = record(profile.unitsByParameter);
  requireContract(
    Object.keys(parameters).length <= 80 && Object.keys(units).length <= 80,
    'Yield profile map capacity',
  );
  return Object.freeze({
    versionId: identity(profile.versionId, YIELD_POLICY_LIMITS.profileCodeUnits),
    yieldTimeGapS: validateParameterValue(
      'yield_time_gap',
      parameters.yield_time_gap,
      units.yield_time_gap,
    ),
  });
}
function arrival(input: unknown): PriorityArrival | null {
  if (input === null) return null;
  const data = fields(input, ['state', 'timeToEntryS', 'timeToExitS']);
  const state = choice(data.state, ['APPROACHING', 'OCCUPYING', 'CLEARED', 'STATIONARY']);
  const entry = data.timeToEntryS === null ? null : time(data.timeToEntryS),
    exit = data.timeToExitS === null ? null : time(data.timeToExitS);
  requireContract(
    state === 'CLEARED' || state === 'STATIONARY'
      ? entry === null && exit === null
      : state === 'OCCUPYING'
        ? entry === 0 && (exit === null || exit >= 0)
        : entry !== null && exit !== null && exit >= entry,
    'Contradictory yield arrival',
  );
  return Object.freeze({ state, timeToEntryS: entry, timeToExitS: exit });
}
/** Pure stateless interval decision. Does not own physics, actuation, evidence or a timer. */
export function evaluateYieldPolicy(input: YieldPolicyInput): YieldPolicyDecision {
  const value = fields(input, [
    'version',
    'units',
    'sessionId',
    'worldEpoch',
    'subjectId',
    'observationTick',
    'decisionTick',
    'profile',
    'coverage',
    'horizonS',
    'discontinuity',
    'actors',
    'candidates',
    'pairs',
  ]);
  requireContract(
    value.version === YIELD_POLICY_LIMITS.version && value.units === 'SI',
    'Unsupported yield version/units',
  );
  const sessionId = identity(value.sessionId),
    worldEpoch = tick(value.worldEpoch),
    subjectId = identity(value.subjectId),
    sourceTick = tick(value.observationTick),
    decisionTick = tick(value.decisionTick);
  const rawProfile = fields(value.profile, ['versionId', 'yieldTimeGapS']),
    profileVersionId = identity(rawProfile.versionId, YIELD_POLICY_LIMITS.profileCodeUnits),
    thresholdS = validateParameterValue('yield_time_gap', rawProfile.yieldTimeGapS, 's'),
    coverage = choice(value.coverage, ['COMPLETE_HORIZON', 'LOCAL_ONLY', 'INCOMPLETE']),
    horizonS = time(value.horizonS),
    discontinuity = boolean(value.discontinuity);
  const actors = new Map<string, YieldActor>();
  bounded(value.actors, YIELD_POLICY_LIMITS.actors, (input) => {
    const actor = fields(input, ['id', 'incarnation', 'active', 'observable', 'routeKnown']),
      id = identity(actor.id);
    requireContract(!actors.has(id), 'Duplicate yield actor');
    const parsed = Object.freeze({
      id,
      incarnation: tick(actor.incarnation),
      active: boolean(actor.active),
      observable: boolean(actor.observable),
      routeKnown: boolean(actor.routeKnown),
    });
    actors.set(id, parsed);
    return parsed;
  });
  requireContract(actors.has(subjectId), 'Missing yield subject');
  const candidates = new Map<string, YieldCandidate>();
  bounded(value.candidates, YIELD_POLICY_LIMITS.candidates, (input) => {
    const candidate = fields(input, ['relationId', 'entryS', 'exitS']),
      relationId = identity(candidate.relationId),
      entryS = time(candidate.entryS),
      exitS = time(candidate.exitS);
    requireContract(
      !candidates.has(relationId) && exitS >= entryS,
      'Invalid/duplicate yield candidate',
    );
    const parsed = Object.freeze({ relationId, entryS, exitS });
    candidates.set(relationId, parsed);
    return parsed;
  });
  const pairKeys = new Set<string>();
  const pairs = bounded(value.pairs, YIELD_POLICY_LIMITS.pairs, (input) => {
    const pair = fields(input, ['relationId', 'otherActorId', 'priority', 'arrival']),
      relationId = identity(pair.relationId),
      otherActorId = identity(pair.otherActorId),
      key = JSON.stringify([relationId, otherActorId]);
    requireContract(
      actors.has(otherActorId) && otherActorId !== subjectId && !pairKeys.has(key),
      'Foreign/duplicate yield pair',
    );
    pairKeys.add(key);
    return Object.freeze({
      relationId,
      otherActorId,
      priority: choice(pair.priority, ['YIELD', 'PRIORITY', 'EQUAL']),
      arrival: arrival(pair.arrival),
    });
  });
  const subject = actors.get(subjectId)!;
  let unknown =
    coverage !== 'COMPLETE_HORIZON' ||
    discontinuity ||
    !subject.active ||
    !subject.observable ||
    !subject.routeKnown ||
    sourceTick > decisionTick ||
    decisionTick - sourceTick > YIELD_POLICY_LIMITS.maximumObservationAgeTicks ||
    candidates.size === 0;
  for (const actor of actors.values())
    if (actor.active && (!actor.observable || !actor.routeKnown)) unknown = true;
  for (const candidate of candidates.values())
    if (candidate.exitS + thresholdS > horizonS) unknown = true;
  const activeOthers = [...actors.values()].filter(
    (actor) => actor.id !== subjectId && actor.active,
  );
  requireContract(
    candidates.size * activeOthers.length <= YIELD_POLICY_LIMITS.pairs,
    'Complete yield relation coverage exceeds pair capacity',
  );
  // Complete horizon never supplies an implicit compatible/priority relation from omission.
  // Every active other actor needs an explicit038fact for every candidate relation.
  for (const candidate of candidates.values())
    for (const actor of activeOthers)
      if (!pairKeys.has(JSON.stringify([candidate.relationId, actor.id]))) unknown = true;
  let minimumGapS: number | null = null,
    limitingRelationId: string | null = null,
    comparedPairs = 0;
  for (const pair of pairs) {
    if (!actors.get(pair.otherActorId)!.active || pair.priority === 'PRIORITY') continue;
    const candidate = candidates.get(pair.relationId),
      other = pair.arrival;
    if (pair.priority === 'EQUAL' || other === null || candidate === undefined) {
      unknown = true;
      continue;
    }
    if (other.state === 'CLEARED') continue;
    if (other.timeToEntryS === null || other.timeToExitS === null) {
      unknown = true;
      continue;
    }
    const gap = Math.max(
      other.timeToEntryS - candidate.exitS,
      candidate.entryS - other.timeToExitS,
    );
    comparedPairs++;
    if (
      minimumGapS === null ||
      gap < minimumGapS ||
      (gap === minimumGapS && pair.relationId < limitingRelationId!)
    ) {
      minimumGapS = gap;
      limitingRelationId = pair.relationId;
    }
  }
  const refused = minimumGapS !== null && minimumGapS < thresholdS;
  return Object.freeze({
    version: YIELD_POLICY_LIMITS.version,
    sessionId,
    worldEpoch,
    subjectId,
    sourceTick,
    decisionTick,
    profileVersionId,
    action: unknown ? 'UNKNOWN' : refused ? 'REFUSE' : 'ACCEPT',
    reason: unknown
      ? 'UNAVAILABLE'
      : refused
        ? 'GAP_REFUSED'
        : minimumGapS === null
          ? 'NO_EXPOSURE'
          : 'GAP_ACCEPTED',
    thresholdS,
    minimumGapS,
    comparedPairs,
    limitingRelationId,
    retainedHistory: 0,
  });
}
/** Unknown yields missing policy facts in045; neither a free road nor an invented blocked route. */
export function yieldBehaviorFacts(
  base: BehaviorFacts,
  decision: YieldPolicyDecision,
): BehaviorFacts | null {
  const facts = parseBehaviorFacts(base),
    diagnostic = record(decision);
  requireContract(
    diagnostic.version === YIELD_POLICY_LIMITS.version &&
      facts.profileVersionId === diagnostic.profileVersionId,
    'Yield/FSM profile mismatch/version',
  );
  const action = choice(diagnostic.action, ['ACCEPT', 'REFUSE', 'UNKNOWN']);
  if (action === 'UNKNOWN') return null;
  return Object.freeze({ ...facts, yield: action === 'REFUSE' ? 'CONFLICT_BY_POLICY' : 'NONE' });
}

/**
 * Independent reference implementation ("oracle") for the 056 suite.
 *
 * It is derived from the published contract text and formulas, not from the production modules.
 * The only values shared with a controller are the scenario inputs themselves and the addressed
 * compliance sample produced by the published006 seed addressing, which is an input to the policy.
 * This separation is what makes a plausible wrong implementation fail the suite instead of being
 * masked by the controller's own transcript.
 */
import { referenceCruise } from './cruise-targets-reference';
import { referenceFollowing } from './following-reference';
import { referenceSignal } from './signal-policy-reference';
import { referenceStop } from './stop-policy-reference';
import { referenceLaneChange } from './lane-change-policy-reference';
import type { BehaviorFacts } from '../../src/autonomy/behavior-fsm';
import type { YieldPolicyInput } from '../../src/autonomy/yield-policy';
import type { BlockedRecoveryObservation } from '../../src/autonomy/blocked-recovery';

export { referenceCruise, referenceFollowing, referenceSignal, referenceStop, referenceLaneChange };

/** 045 priority table from `behavior-fsm.md`: first matching fact wins. */
export function referenceBehavior(
  facts: BehaviorFacts,
  hasLeader: boolean,
):
  'FOLLOW_LEADER' | 'FOLLOW_LANE' | 'STOP' | 'YIELD' | 'CHANGE_LANE' | 'SERVICE' | 'BLOCKED_ROUTE' {
  if (facts.routeBlocked) return 'BLOCKED_ROUTE';
  if (facts.stop !== 'NONE') return 'STOP';
  if (facts.yield !== 'NONE') return 'YIELD';
  if (facts.service !== 'NONE') return 'SERVICE';
  if (facts.laneChange !== 'NONE') return 'CHANGE_LANE';
  return hasLeader ? 'FOLLOW_LEADER' : 'FOLLOW_LANE';
}

export interface YieldOracleDecision {
  readonly action: 'ACCEPT' | 'REFUSE' | 'UNKNOWN';
  readonly reason: 'GAP_ACCEPTED' | 'GAP_REFUSED' | 'NO_EXPOSURE' | 'UNAVAILABLE';
  readonly minimumGapS: number | null;
  readonly comparedPairs: number;
}
/**
 * 052 contract: complete same-tick coverage, explicit038 priority facts, signed interval separation
 * `g=max(oEnter-cExit, cEnter-oExit)`, accept when every relevant `g` is at least the profile gap
 * (inclusive), refuse when any is smaller, and never infer availability from a local/empty query.
 */
export function referenceYield(input: YieldPolicyInput): YieldOracleDecision {
  const subject = input.actors.find((actor) => actor.id === input.subjectId);
  let unknown =
    input.coverage !== 'COMPLETE_HORIZON' ||
    input.discontinuity ||
    subject === undefined ||
    !subject.active ||
    !subject.observable ||
    !subject.routeKnown ||
    input.observationTick > input.decisionTick ||
    input.decisionTick - input.observationTick > 6 ||
    input.candidates.length === 0;
  for (const actor of input.actors)
    if (actor.active && (!actor.observable || !actor.routeKnown)) unknown = true;
  for (const candidate of input.candidates)
    if (candidate.exitS + input.profile.yieldTimeGapS > input.horizonS) unknown = true;
  const activeOthers = input.actors.filter((actor) => actor.id !== input.subjectId && actor.active);
  for (const candidate of input.candidates)
    for (const actor of activeOthers)
      if (
        !input.pairs.some(
          (pair) => pair.relationId === candidate.relationId && pair.otherActorId === actor.id,
        )
      )
        unknown = true;
  let minimumGapS: number | null = null,
    comparedPairs = 0;
  for (const pair of input.pairs) {
    const other = input.actors.find((actor) => actor.id === pair.otherActorId);
    if (!other?.active || pair.priority === 'PRIORITY') continue;
    const candidate = input.candidates.find((entry) => entry.relationId === pair.relationId);
    if (pair.priority === 'EQUAL' || pair.arrival === null || candidate === undefined) {
      unknown = true;
      continue;
    }
    if (pair.arrival.state === 'CLEARED') continue;
    if (pair.arrival.timeToEntryS === null || pair.arrival.timeToExitS === null) {
      unknown = true;
      continue;
    }
    const gap = Math.max(
      pair.arrival.timeToEntryS - candidate.exitS,
      candidate.entryS - pair.arrival.timeToExitS,
    );
    comparedPairs++;
    if (minimumGapS === null || gap < minimumGapS) minimumGapS = gap;
  }
  if (unknown)
    return Object.freeze({
      action: 'UNKNOWN',
      reason: 'UNAVAILABLE',
      minimumGapS,
      comparedPairs,
    });
  if (minimumGapS === null)
    return Object.freeze({
      action: 'ACCEPT',
      reason: 'NO_EXPOSURE',
      minimumGapS,
      comparedPairs,
    });
  return Object.freeze({
    action: minimumGapS < input.profile.yieldTimeGapS ? 'REFUSE' : 'ACCEPT',
    reason: minimumGapS < input.profile.yieldTimeGapS ? 'GAP_REFUSED' : 'GAP_ACCEPTED',
    minimumGapS,
    comparedPairs,
  });
}

/** 054 cause priority table, derived from the documented decision table. */
export function referenceBlockedCause(
  observation: BlockedRecoveryObservation,
  locatedLaneId: string | null,
  successors: number,
):
  | 'PROGRESS'
  | 'NO_PROGRESS_OFF_GRAPH'
  | 'NO_PROGRESS_BLOCKED_LANE_AHEAD'
  | 'NO_PROGRESS_NO_FEASIBLE_SUCCESSOR'
  | 'NO_PROGRESS_ROUTE_BLOCKED'
  | 'NO_PROGRESS_LEADER_STANDSTILL'
  | 'NO_PROGRESS_UNEXPLAINED' {
  if (locatedLaneId === null) return 'NO_PROGRESS_OFF_GRAPH';
  if (observation.blockedLaneAheadId !== null) return 'NO_PROGRESS_BLOCKED_LANE_AHEAD';
  if (observation.routeStatus !== 'READY')
    return successors === 0 ? 'NO_PROGRESS_NO_FEASIBLE_SUCCESSOR' : 'NO_PROGRESS_ROUTE_BLOCKED';
  if (observation.speedMps >= 0.1) return 'PROGRESS';
  return observation.leaderSpeedMps !== null && observation.leaderSpeedMps < 0.1
    ? 'NO_PROGRESS_LEADER_STANDSTILL'
    : 'NO_PROGRESS_UNEXPLAINED';
}

/** 054 first action table: structural causes request a reroute immediately. */
export function referenceBlockedFirstAction(
  cause: ReturnType<typeof referenceBlockedCause>,
  hasPlanner: boolean,
  allowRecovery: boolean,
  hasRecoveryTarget: boolean,
): 'CONTINUE' | 'WAIT' | 'REQUEST_REROUTE' | 'REQUEST_RECOVERY' | 'STAY_BLOCKED' {
  if (cause === 'PROGRESS') return 'CONTINUE';
  if (cause === 'NO_PROGRESS_LEADER_STANDSTILL' || cause === 'NO_PROGRESS_UNEXPLAINED')
    return 'WAIT';
  if (hasPlanner) return 'REQUEST_REROUTE';
  return allowRecovery && hasRecoveryTarget ? 'REQUEST_RECOVERY' : 'STAY_BLOCKED';
}

/** 045 fact composition for a refused/unknown yield: failed closed, never a free-road claim. */
export function referenceYieldFacts(
  base: BehaviorFacts,
  action: YieldOracleDecision['action'],
): BehaviorFacts | null {
  if (action === 'UNKNOWN') return null;
  return { ...base, yield: action === 'REFUSE' ? 'CONFLICT_BY_POLICY' : 'NONE' };
}

/** Plausible bugs used only to prove the suite rejects them; they are never production paths. */
export const mutationProbes = Object.freeze({
  cruise: (_values: readonly number[], posted: number) => Math.max(0, posted),
  following: (cruiseTarget: number) => cruiseTarget,
  signal: () => 'STOP',
  lane: () => 'CHANGE',
  yield: (threshold: number) => (threshold > 0 ? 'ACCEPT' : 'UNKNOWN'),
});

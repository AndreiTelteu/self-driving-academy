// Independent explicit-policy oracle prepared before the 045 production FSM.
import type { RoadContext } from '../../src/autonomy/road-context';
export interface ReferenceBehaviorFacts {
  readonly version: '045-decision-facts-v1';
  readonly profileVersionId: string;
  readonly routeBlocked: boolean;
  readonly stop: 'NONE' | 'RED_BY_PROFILE' | 'STOP_RULE_BY_PROFILE' | 'REQUESTED';
  readonly yield: 'NONE' | 'CONFLICT_BY_POLICY';
  readonly service: 'NONE' | 'ACCEPTED';
  readonly laneChange: 'NONE' | 'VALIDATED';
}
export interface ReferenceBehaviorInput {
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly actor: Readonly<{ id: string; incarnation: number }>;
  readonly decisionTick: number;
  readonly context: RoadContext | null;
  readonly facts: ReferenceBehaviorFacts;
}
export function referenceBehavior(input: ReferenceBehaviorInput) {
  const context = input.context;
  let state = 'FOLLOW',
    reason = context?.leader ? 'FOLLOW_LEADER' : 'FOLLOW_LANE';
  // Ordered predicates are the declared priority oracle, not a production state owner.
  const candidates: readonly (readonly [boolean, string, string])[] = [
    [context === null, 'BLOCKED', 'MISSING_CONTEXT'],
    [
      context !== null &&
        (context.sessionId !== input.sessionId ||
          context.worldEpoch !== input.worldEpoch ||
          context.subject.id !== input.actor.id ||
          context.subject.incarnation !== input.actor.incarnation),
      'BLOCKED',
      'FOREIGN_CONTEXT',
    ],
    [
      context !== null &&
        (context.tick > input.decisionTick || input.decisionTick - context.tick > 6),
      'BLOCKED',
      'STALE_CONTEXT',
    ],
    [context?.discontinuity === true, 'BLOCKED', 'CONTEXT_DISCONTINUITY'],
    [
      context !== null && (!context.completeness.vehicles || context.laneId === null),
      'BLOCKED',
      'INCOMPLETE_CONTEXT',
    ],
    [input.facts.routeBlocked, 'BLOCKED', 'BLOCKED_ROUTE'],
    [
      input.facts.stop !== 'NONE',
      'STOP',
      input.facts.stop === 'RED_BY_PROFILE'
        ? 'WAIT_RED_BY_PROFILE'
        : input.facts.stop === 'STOP_RULE_BY_PROFILE'
          ? 'WAIT_STOP_BY_PROFILE'
          : 'STOP_REQUESTED',
    ],
    [input.facts.yield !== 'NONE', 'YIELD', 'YIELD_CONFLICT_BY_POLICY'],
    [input.facts.service !== 'NONE', 'SERVICE', 'SERVICE_ACCEPTED'],
    [input.facts.laneChange !== 'NONE', 'CHANGE_LANE', 'LANE_CHANGE_VALIDATED'],
  ];
  for (const [matches, next, code] of candidates)
    if (matches) {
      state = next;
      reason = code;
      break;
    }
  return Object.freeze({
    state,
    reason,
    decisionTick: input.decisionTick,
    sourceTick: context?.tick ?? null,
    profileVersionId: input.facts.profileVersionId,
  });
}
export function referenceFacts(index: number, tick: number): ReferenceBehaviorFacts {
  const phase = (index + Math.floor(tick / 60)) % 6;
  return Object.freeze({
    version: '045-decision-facts-v1',
    profileVersionId: '045-explicit-reference-profile',
    routeBlocked: phase === 0,
    stop: phase === 1 ? 'REQUESTED' : 'NONE',
    yield: phase === 2 ? 'CONFLICT_BY_POLICY' : 'NONE',
    service: phase === 3 ? 'ACCEPTED' : 'NONE',
    laneChange: phase === 4 ? 'VALIDATED' : 'NONE',
  });
}

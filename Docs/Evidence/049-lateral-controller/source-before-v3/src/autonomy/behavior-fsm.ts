import { fields, record, number, tick, boolean, choice, requireContract } from '../sessions';
import type { RoadContext } from './road-context';

export const BEHAVIOR_LIMITS = Object.freeze({
  version: '045-decision-facts-v1' as const,
  actors: 110,
  identitiesPerEpoch: 1024,
  maximumContextAgeTicks: 6,
  identityCodeUnits: 256,
  profileCodeUnits: 128,
  retainedHistory: 0,
});
export type BehaviorState = 'FOLLOW' | 'STOP' | 'YIELD' | 'CHANGE_LANE' | 'SERVICE' | 'BLOCKED';
export type BehaviorReason =
  | 'MISSING_CONTEXT'
  | 'FOREIGN_CONTEXT'
  | 'STALE_CONTEXT'
  | 'CONTEXT_DISCONTINUITY'
  | 'INCOMPLETE_CONTEXT'
  | 'MISSING_POLICY_FACTS'
  | 'BLOCKED_ROUTE'
  | 'WAIT_RED_BY_PROFILE'
  | 'WAIT_STOP_BY_PROFILE'
  | 'STOP_REQUESTED'
  | 'YIELD_CONFLICT_BY_POLICY'
  | 'SERVICE_ACCEPTED'
  | 'LANE_CHANGE_VALIDATED'
  | 'FOLLOW_LEADER'
  | 'FOLLOW_LANE';
export interface BehaviorActor {
  readonly id: string;
  readonly incarnation: number;
}
export interface BehaviorScope {
  readonly sessionId: string;
  readonly worldEpoch: number;
}
/** Exact compact projection, not ownership of a RoadContext geometry/tree. */
export interface BehaviorContext extends BehaviorScope {
  readonly sourceTick: number;
  readonly subject: BehaviorActor;
  readonly laneId: string | null;
  readonly leaderId: string | null;
  readonly vehiclesComplete: boolean;
  readonly discontinuity: boolean;
}
export interface BehaviorFacts {
  readonly version: '045-decision-facts-v1';
  readonly profileVersionId: string;
  readonly routeBlocked: boolean;
  readonly stop: 'NONE' | 'RED_BY_PROFILE' | 'STOP_RULE_BY_PROFILE' | 'REQUESTED';
  readonly yield: 'NONE' | 'CONFLICT_BY_POLICY';
  readonly service: 'NONE' | 'ACCEPTED';
  readonly laneChange: 'NONE' | 'VALIDATED';
}
export interface BehaviorInput extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly context: BehaviorContext | null;
  readonly facts: BehaviorFacts | null;
}
export interface BehaviorDecision extends BehaviorScope {
  readonly version: '045-decision-facts-v1';
  readonly actor: BehaviorActor;
  readonly state: BehaviorState;
  readonly reason: BehaviorReason;
  readonly decisionTick: number;
  readonly sourceTick: number | null;
  readonly profileVersionId: string | null;
  readonly previousState: BehaviorState | null;
  readonly transitioned: boolean;
}
export interface BehaviorFSM {
  setActors(actors: readonly BehaviorActor[], scope: BehaviorScope): void;
  setAuthority(
    actor: BehaviorActor,
    mode: 'AUTO' | 'MANUAL' | 'LEARNING',
    scope: BehaviorScope,
  ): void;
  decide(input: BehaviorInput): BehaviorDecision;
  read(actor: BehaviorActor, scope: BehaviorScope): BehaviorDecision | null;
  reset(sessionId: string, worldEpoch: number): void;
  dispose(): void;
  getStats(): Readonly<{
    sessionId: string;
    worldEpoch: number;
    actors: number;
    identities: number;
    retiredIdentities: number;
    decisions: number;
    retainedHistory: 0;
    disposed: boolean;
  }>;
}
function id(value: unknown, limit: number = BEHAVIOR_LIMITS.identityCodeUnits): string {
  requireContract(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= limit &&
      value.trim() === value,
    'Invalid behavior identity',
  );
  return value;
}
function actor(input: unknown): BehaviorActor {
  const value = fields(input, ['id', 'incarnation']);
  return Object.freeze({ id: id(value.id), incarnation: tick(value.incarnation) });
}
function scope(input: unknown): BehaviorScope {
  const value = fields(input, ['sessionId', 'worldEpoch']);
  return Object.freeze({ sessionId: id(value.sessionId), worldEpoch: tick(value.worldEpoch) });
}
export function parseBehaviorFacts(input: unknown): BehaviorFacts {
  const value = fields(input, [
    'version',
    'profileVersionId',
    'routeBlocked',
    'stop',
    'yield',
    'service',
    'laneChange',
  ]);
  requireContract(value.version === BEHAVIOR_LIMITS.version, 'Unknown behavior facts version');
  return Object.freeze({
    version: BEHAVIOR_LIMITS.version,
    profileVersionId: id(value.profileVersionId, BEHAVIOR_LIMITS.profileCodeUnits),
    routeBlocked: boolean(value.routeBlocked),
    stop: choice(value.stop, ['NONE', 'RED_BY_PROFILE', 'STOP_RULE_BY_PROFILE', 'REQUESTED']),
    yield: choice(value.yield, ['NONE', 'CONFLICT_BY_POLICY']),
    service: choice(value.service, ['NONE', 'ACCEPTED']),
    laneChange: choice(value.laneChange, ['NONE', 'VALIDATED']),
  });
}
export function parseBehaviorContext(input: unknown): BehaviorContext {
  const value = fields(input, [
    'sessionId',
    'worldEpoch',
    'sourceTick',
    'subject',
    'laneId',
    'leaderId',
    'vehiclesComplete',
    'discontinuity',
  ]);
  const subject = actor(value.subject),
    leaderId = value.leaderId === null ? null : id(value.leaderId);
  requireContract(leaderId !== subject.id, 'Behavior leader cannot be subject');
  return Object.freeze({
    sessionId: id(value.sessionId),
    worldEpoch: tick(value.worldEpoch),
    sourceTick: tick(value.sourceTick),
    subject,
    laneId: value.laneId === null ? null : id(value.laneId),
    leaderId,
    vehiclesComplete: boolean(value.vehiclesComplete),
    discontinuity: boolean(value.discontinuity),
  });
}
/** Read only used own data from the published044 snapshot. Does not certify unused geometry/coverage. */
export function projectBehaviorContext(input: RoadContext | null): BehaviorContext | null {
  if (input === null) return null;
  const value = record(input),
    completeness = fields(value.completeness, ['vehicles', 'obstacles', 'zones', 'signals']);
  for (const flag of Object.values(completeness)) boolean(flag);
  let leaderId: string | null = null;
  if (value.leader !== null) {
    const leader = fields(value.leader, ['id', 'incarnation', 'gapM', 'speedMps']);
    leaderId = id(leader.id);
    tick(leader.incarnation);
    number(leader.gapM, 0);
    number(leader.speedMps, 0, 100);
  }
  return parseBehaviorContext({
    sessionId: value.sessionId,
    worldEpoch: value.worldEpoch,
    sourceTick: value.tick,
    subject: value.subject,
    laneId: value.laneId,
    leaderId,
    vehiclesComplete: completeness.vehicles,
    discontinuity: value.discontinuity,
  });
}
function admit(input: unknown): BehaviorInput {
  const value = fields(input, [
    'sessionId',
    'worldEpoch',
    'actor',
    'decisionTick',
    'context',
    'facts',
  ]);
  return Object.freeze({
    sessionId: id(value.sessionId),
    worldEpoch: tick(value.worldEpoch),
    actor: actor(value.actor),
    decisionTick: tick(value.decisionTick),
    context: value.context === null ? null : parseBehaviorContext(value.context),
    facts: value.facts === null ? null : parseBehaviorFacts(value.facts),
  });
}
function select(input: BehaviorInput): readonly [BehaviorState, BehaviorReason] {
  const context = input.context,
    facts = input.facts;
  if (context === null) return ['BLOCKED', 'MISSING_CONTEXT'];
  if (
    context.sessionId !== input.sessionId ||
    context.worldEpoch !== input.worldEpoch ||
    context.subject.id !== input.actor.id ||
    context.subject.incarnation !== input.actor.incarnation
  )
    return ['BLOCKED', 'FOREIGN_CONTEXT'];
  if (
    context.sourceTick > input.decisionTick ||
    input.decisionTick - context.sourceTick > BEHAVIOR_LIMITS.maximumContextAgeTicks
  )
    return ['BLOCKED', 'STALE_CONTEXT'];
  if (context.discontinuity) return ['BLOCKED', 'CONTEXT_DISCONTINUITY'];
  if (!context.vehiclesComplete || context.laneId === null)
    return ['BLOCKED', 'INCOMPLETE_CONTEXT'];
  if (facts === null) return ['BLOCKED', 'MISSING_POLICY_FACTS'];
  if (facts.routeBlocked) return ['BLOCKED', 'BLOCKED_ROUTE'];
  if (facts.stop !== 'NONE')
    return [
      'STOP',
      facts.stop === 'RED_BY_PROFILE'
        ? 'WAIT_RED_BY_PROFILE'
        : facts.stop === 'STOP_RULE_BY_PROFILE'
          ? 'WAIT_STOP_BY_PROFILE'
          : 'STOP_REQUESTED',
    ];
  if (facts.yield !== 'NONE') return ['YIELD', 'YIELD_CONFLICT_BY_POLICY'];
  if (facts.service !== 'NONE') return ['SERVICE', 'SERVICE_ACCEPTED'];
  if (facts.laneChange !== 'NONE') return ['CHANGE_LANE', 'LANE_CHANGE_VALIDATED'];
  return ['FOLLOW', context.leaderId === null ? 'FOLLOW_LANE' : 'FOLLOW_LEADER'];
}
interface Entry {
  actor: BehaviorActor;
  mode: 'AUTO' | 'MANUAL' | 'LEARNING';
  decision: BehaviorDecision | null;
  lastDecisionTick: number | null;
}
/** Tick consumer. Caller invokes through219 decision port; no timers, physics or regulatory correction. */
export function createBehaviorFSM(options: BehaviorScope): BehaviorFSM {
  let owner = scope(options),
    disposed = false,
    busy = false;
  const live = new Map<string, Entry>(),
    history = new Map<string, number>(),
    retired = new Set<string>();
  const available = () => requireContract(!disposed && !busy, 'Behavior FSM disposed or reentrant');
  const fence = (input: BehaviorScope) => {
    const checked = scope(input);
    requireContract(
      checked.sessionId === owner.sessionId && checked.worldEpoch === owner.worldEpoch,
      'Foreign behavior world',
    );
  };
  const current = (identity: BehaviorActor) => {
    const entry = live.get(identity.id);
    requireContract(
      entry?.actor.incarnation === identity.incarnation,
      'Unknown or stale behavior actor',
    );
    return entry;
  };
  return Object.freeze({
    setActors(input: readonly BehaviorActor[], requestedScope: BehaviorScope) {
      available();
      busy = true;
      try {
        fence(requestedScope);
        requireContract(
          Array.isArray(input) &&
            input.length <= BEHAVIOR_LIMITS.actors &&
            Object.getPrototypeOf(input) === Array.prototype &&
            Reflect.ownKeys(input).length === input.length + 1,
          'Behavior actor admission exceeded',
        );
        const next: BehaviorActor[] = [];
        for (let index = 0; index < input.length; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
          requireContract(
            descriptor !== undefined && 'value' in descriptor && descriptor.enumerable === true,
            'Invalid behavior actor array',
          );
          next.push(actor(descriptor.value));
        }
        next.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        const ids = new Set<string>();
        let additions = 0;
        for (const identity of next) {
          requireContract(!ids.has(identity.id), 'Duplicate behavior actor');
          ids.add(identity.id);
          const previous = history.get(identity.id);
          requireContract(
            previous === undefined ||
              (identity.incarnation >= previous &&
                (!retired.has(identity.id) || identity.incarnation > previous)),
            'Stale behavior incarnation',
          );
          if (previous === undefined) additions++;
        }
        requireContract(
          history.size + additions <= BEHAVIOR_LIMITS.identitiesPerEpoch,
          'Behavior epoch identity capacity exceeded',
        );
        for (const [key] of live)
          if (!ids.has(key)) {
            live.delete(key);
            retired.add(key);
          }
        for (const identity of next) {
          const previous = live.get(identity.id);
          if (previous?.actor.incarnation !== identity.incarnation)
            live.set(identity.id, {
              actor: identity,
              mode: 'AUTO',
              decision: null,
              lastDecisionTick: null,
            });
          history.set(identity.id, identity.incarnation);
          retired.delete(identity.id);
        }
      } finally {
        busy = false;
      }
    },
    setAuthority(
      input: BehaviorActor,
      mode: 'AUTO' | 'MANUAL' | 'LEARNING',
      requestedScope: BehaviorScope,
    ) {
      available();
      busy = true;
      try {
        fence(requestedScope);
        const identity = actor(input),
          entry = current(identity);
        const next = choice(mode, ['AUTO', 'MANUAL', 'LEARNING']);
        if (entry.mode !== next) {
          entry.mode = next;
          entry.decision = null;
        }
      } finally {
        busy = false;
      }
    },
    decide(input: BehaviorInput) {
      available();
      busy = true;
      try {
        const value = admit(input);
        fence({ sessionId: value.sessionId, worldEpoch: value.worldEpoch });
        const entry = current(value.actor);
        requireContract(entry.mode === 'AUTO', 'Behavior decision requires AUTO authority');
        requireContract(
          entry.lastDecisionTick === null || value.decisionTick > entry.lastDecisionTick,
          'Behavior decision tick must advance',
        );
        const [state, reason] = select(value),
          previousState = entry.decision?.state ?? null;
        const result: BehaviorDecision = Object.freeze({
          ...owner,
          version: BEHAVIOR_LIMITS.version,
          actor: entry.actor,
          state,
          reason,
          decisionTick: value.decisionTick,
          sourceTick: value.context?.sourceTick ?? null,
          profileVersionId: value.facts?.profileVersionId ?? null,
          previousState,
          transitioned: previousState !== state,
        });
        entry.decision = result;
        entry.lastDecisionTick = value.decisionTick;
        return result;
      } finally {
        busy = false;
      }
    },
    read(input: BehaviorActor, requestedScope: BehaviorScope) {
      available();
      busy = true;
      try {
        fence(requestedScope);
        return current(actor(input)).decision;
      } finally {
        busy = false;
      }
    },
    reset(sessionId: string, worldEpoch: number) {
      available();
      busy = true;
      try {
        const next = scope({ sessionId, worldEpoch });
        requireContract(
          next.sessionId !== owner.sessionId || next.worldEpoch > owner.worldEpoch,
          'Behavior reset must advance epoch',
        );
        live.clear();
        history.clear();
        retired.clear();
        owner = next;
      } finally {
        busy = false;
      }
    },
    dispose() {
      if (disposed) return;
      requireContract(!busy, 'Reentrant behavior disposal');
      disposed = true;
      live.clear();
      history.clear();
      retired.clear();
    },
    getStats() {
      return Object.freeze({
        ...owner,
        actors: live.size,
        identities: history.size,
        retiredIdentities: retired.size,
        decisions: [...live.values()].filter((entry) => entry.decision !== null).length,
        retainedHistory: 0 as const,
        disposed,
      });
    },
  });
}

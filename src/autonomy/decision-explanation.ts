import { choice, fields, number, requireContract, tick } from '../sessions';
import { getParameterDefinition } from '../profiles';
import type {
  BehaviorActor,
  BehaviorDecision,
  BehaviorReason,
  BehaviorScope,
  BehaviorState,
} from './behavior-fsm';

/**
 * 055 read-only decision observability.
 *
 * The surface does not own a behaviour FSM, a clock, a route planner or any policy. It consumes the
 * decision objects already produced by the real 045/046–054 chain at the 219 decision cadence and
 * publishes an immutable explanation of one decision: its ordered reason codes, the quantities that
 * were actually used and the profile keys that actually influenced it, each with the value that was
 * really consumed.
 *
 * What it is NOT:
 *
 * - not a second state machine and not a second set of reason codes; every reason is copied from the
 *   real 045 decision (`state`/`reason`) plus the real policy-chain reasons the caller supplies;
 * - not a store of behaviour state, physics, poses or route graphs; it keeps at most one current
 *   explanation per admitted actor and no history (`retainedHistory: 0`);
 * - not a mutable window into module state: every explanation is a fresh, deeply frozen snapshot and
 *   contains no live reference to the FSM, to a policy decision or to a caller object, so reading it
 *   cannot change the next decision;
 * - not a place where an unimplemented parameter can be advertised: every declared influence is
 *   checked against the 092 registry and is rejected unless `implemented === true`, and only
 *   non-null (really consumed) values become influences. It never claims a value that was not used.
 *
 * The 092 registry does not mark 052's `yield_time_gap` as implemented, so no 055 explanation
 * attributes YIELD to it: the threshold is still reported as a consumed quantity in `targets`, but it
 * is deliberately not an influence until the registry declares the capability. See
 * [decision-explanation](../../Docs/decision-explanation.md) for the full contract.
 */
export const DECISION_EXPLANATION_LIMITS = Object.freeze({
  version: '055-decision-explanation-v1' as const,
  actors: 110,
  reasons: 16,
  influences: 32,
  quantities: 32,
  identityCodeUnits: 256,
  reasonCodeUnits: 128,
  keyCodeUnits: 64,
  retainedHistory: 0,
});
export type DecisionExplanationVersion = '055-decision-explanation-v1';

/** The 045 decision projection actually retained: scalars only, never the original object. */
export interface DecisionExplanationBehavior {
  readonly state: BehaviorState;
  readonly reason: BehaviorReason;
  readonly previousState: BehaviorState | null;
  readonly transitioned: boolean;
  readonly sourceTick: number | null;
  readonly profileVersionId: string | null;
}
/** One profile key that really influenced the decision, with the value really consumed. */
export interface DecisionInfluence {
  readonly key: string;
  readonly value: number;
  /** Registry proof captured at build time; only `implemented === true` keys are ever admitted. */
  readonly implemented: true;
}
/** A quantity the policy actually used (a speed target, a gap, a threshold…), never an input echo. */
export interface DecisionQuantity {
  readonly name: string;
  readonly value: number;
}
export interface DecisionExplanation extends BehaviorScope {
  readonly version: DecisionExplanationVersion;
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly sourceTick: number | null;
  readonly profileVersionId: string | null;
  readonly behavior: DecisionExplanationBehavior;
  /** Ordered reason codes of the chain; the last element is the 045 behaviour reason. */
  readonly reasons: readonly string[];
  /** Chosen action of the policy layer for this decision slice, or null when it has none. */
  readonly action: string | null;
  readonly targets: readonly DecisionQuantity[];
  readonly influences: readonly DecisionInfluence[];
  readonly retainedHistory: 0;
}
/** Explicit "no decision yet" record; the surface never guesses or fabricates a reason. */
export interface DecisionExplanationAbsent extends BehaviorScope {
  readonly version: DecisionExplanationVersion;
  readonly actor: BehaviorActor;
  readonly present: false;
  readonly decisionTick: null;
  readonly reason: 'NO_DECISION';
  readonly retainedHistory: 0;
}
export type DecisionExplanationView =
  Readonly<{ present: true; explanation: DecisionExplanation }> | DecisionExplanationAbsent;
export interface DecisionExplanationPort {
  setActors(actors: readonly BehaviorActor[], scope: BehaviorScope): void;
  capture(input: DecisionExplanationInput): DecisionExplanation;
  read(actor: BehaviorActor, scope: BehaviorScope): DecisionExplanation | null;
  view(actor: BehaviorActor, scope: BehaviorScope): DecisionExplanationView;
  reset(sessionId: string, worldEpoch: number): void;
  dispose(): void;
  getStats(): Readonly<{
    sessionId: string;
    worldEpoch: number;
    actors: number;
    explanations: number;
    retainedHistory: 0;
    disposed: boolean;
  }>;
}
export interface DecisionExplanationInput extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  /** The real 045 decision for this actor/tick; its scope, actor and tick must match. */
  readonly behavior: BehaviorDecision;
  /** Ordered reason codes, ending with the 045 behaviour reason; no other reason may be invented. */
  readonly reasons: readonly string[];
  readonly action: string | null;
  readonly targets: readonly DecisionQuantity[];
  /** `[key, value]` pairs; a null value means "not consumed" and is dropped, never advertised. */
  readonly influences: readonly (readonly [string, number | null])[];
}
const STATES = ['FOLLOW', 'STOP', 'YIELD', 'CHANGE_LANE', 'SERVICE', 'BLOCKED'] as const;
/** Exactly the 045 reason families; a foreign state/reason pair can never be explained. */
const STATE_REASONS: Readonly<Record<BehaviorState, readonly BehaviorReason[]>> = {
  FOLLOW: ['FOLLOW_LANE', 'FOLLOW_LEADER'],
  STOP: ['WAIT_RED_BY_PROFILE', 'WAIT_STOP_BY_PROFILE', 'STOP_REQUESTED'],
  YIELD: ['YIELD_CONFLICT_BY_POLICY'],
  CHANGE_LANE: ['LANE_CHANGE_VALIDATED'],
  SERVICE: ['SERVICE_ACCEPTED'],
  BLOCKED: [
    'MISSING_CONTEXT',
    'FOREIGN_CONTEXT',
    'STALE_CONTEXT',
    'CONTEXT_DISCONTINUITY',
    'INCOMPLETE_CONTEXT',
    'MISSING_POLICY_FACTS',
    'BLOCKED_ROUTE',
  ],
};
function identity(value: unknown, limit: number = DECISION_EXPLANATION_LIMITS.identityCodeUnits) {
  requireContract(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= limit &&
      value.trim() === value,
    'Invalid decision-explanation identity',
  );
  return value;
}
function actor(input: unknown): BehaviorActor {
  const value = fields(input, ['id', 'incarnation']);
  return Object.freeze({ id: identity(value.id), incarnation: tick(value.incarnation) });
}
function scope(input: unknown): BehaviorScope {
  const value = fields(input, ['sessionId', 'worldEpoch']);
  return Object.freeze({
    sessionId: identity(value.sessionId),
    worldEpoch: tick(value.worldEpoch),
  });
}
function sameActor(a: BehaviorActor, b: BehaviorActor) {
  return a.id === b.id && a.incarnation === b.incarnation;
}
function sameScope(a: BehaviorScope, b: BehaviorScope) {
  return a.sessionId === b.sessionId && a.worldEpoch === b.worldEpoch;
}
/** Copies the real 045 decision into detached scalars and fences it against the requested subject. */
function behaviorDecision(
  input: unknown,
  owner: BehaviorScope,
  subject: BehaviorActor,
  decisionTick: number,
): DecisionExplanationBehavior {
  const value = fields(input, [
    'version',
    'sessionId',
    'worldEpoch',
    'actor',
    'state',
    'reason',
    'decisionTick',
    'sourceTick',
    'profileVersionId',
    'previousState',
    'transitioned',
  ]);
  requireContract(value.version === '045-decision-facts-v1', 'Unknown 045 behavior version');
  const decisionScope = scope({ sessionId: value.sessionId, worldEpoch: value.worldEpoch }),
    decisionActor = actor(value.actor);
  requireContract(
    sameScope(decisionScope, owner) && sameActor(decisionActor, subject),
    'Decision explanation subject/scope mismatch',
  );
  requireContract(
    tick(value.decisionTick) === decisionTick,
    'Decision explanation tick mismatch with the 045 decision',
  );
  const state = choice(value.state, STATES),
    reason = identity(value.reason, DECISION_EXPLANATION_LIMITS.reasonCodeUnits) as BehaviorReason;
  requireContract(STATE_REASONS[state].includes(reason), 'Inconsistent 045 state/reason');
  requireContract(typeof value.transitioned === 'boolean', 'Invalid 045 transition flag');
  return Object.freeze({
    state,
    reason,
    previousState: value.previousState === null ? null : choice(value.previousState, STATES),
    transitioned: value.transitioned,
    sourceTick: value.sourceTick === null ? null : tick(value.sourceTick),
    profileVersionId:
      value.profileVersionId === null
        ? null
        : identity(value.profileVersionId, DECISION_EXPLANATION_LIMITS.reasonCodeUnits),
  });
}
/**
 * Reads the ordered reason chain. The last element must be the real 045 reason, so the surface can
 * never publish a reason the FSM did not actually select.
 */
function reasonCodes(input: unknown, behaviorReason: BehaviorReason): readonly string[] {
  requireContract(
    Array.isArray(input) &&
      input.length >= 1 &&
      input.length <= DECISION_EXPLANATION_LIMITS.reasons,
    'Decision explanation reason capacity',
  );
  const reasons: string[] = [],
    seen = new Set<string>();
  for (const raw of input as unknown[]) {
    const reason = identity(raw, DECISION_EXPLANATION_LIMITS.reasonCodeUnits);
    requireContract(!seen.has(reason), 'Duplicate decision explanation reason');
    seen.add(reason);
    reasons.push(reason);
  }
  requireContract(
    reasons[reasons.length - 1] === behaviorReason,
    'Decision explanation must end with the 045 behaviour reason',
  );
  return Object.freeze(reasons);
}
/**
 * Registry-gated influence list. A null value is "not consumed" and is dropped. A non-null value
 * requires a known registry key whose `implemented` flag is true; otherwise the whole explanation is
 * rejected, so an unimplemented parameter can never surface as a decision influence.
 */
export function consumedInfluences(input: unknown): readonly DecisionInfluence[] {
  requireContract(
    Array.isArray(input) && input.length <= DECISION_EXPLANATION_LIMITS.influences,
    'Decision explanation influence capacity',
  );
  const influences: DecisionInfluence[] = [],
    seen = new Set<string>();
  for (const raw of input as unknown[]) {
    requireContract(
      Array.isArray(raw) && raw.length === 2 && Object.getPrototypeOf(raw) === Array.prototype,
      'Invalid decision influence entry',
    );
    const [rawKey, rawValue] = raw as [unknown, unknown];
    if (rawValue === null || rawValue === undefined) continue;
    const key = identity(rawKey, DECISION_EXPLANATION_LIMITS.keyCodeUnits),
      definition = getParameterDefinition(key);
    requireContract(definition.implemented === true, `Unimplemented decision influence: ${key}`);
    requireContract(!seen.has(key), 'Duplicate decision influence');
    seen.add(key);
    influences.push(
      Object.freeze({
        key,
        value: number(rawValue, definition.min, definition.max),
        implemented: true as const,
      }),
    );
  }
  return Object.freeze(influences);
}
/** Bounded, uniquely named, finite quantities actually used by the decision. */
function quantities(input: unknown): readonly DecisionQuantity[] {
  requireContract(
    Array.isArray(input) && input.length <= DECISION_EXPLANATION_LIMITS.quantities,
    'Decision explanation quantity capacity',
  );
  const result: DecisionQuantity[] = [],
    seen = new Set<string>();
  for (const raw of input as unknown[]) {
    const value = fields(raw, ['name', 'value']),
      name = identity(value.name, DECISION_EXPLANATION_LIMITS.keyCodeUnits);
    requireContract(!seen.has(name), 'Duplicate decision quantity');
    seen.add(name);
    result.push(Object.freeze({ name, value: number(value.value) }));
  }
  return Object.freeze(result);
}
/**
 * Pure builder. Produces a fresh, deeply frozen explanation and never retains or references the
 * caller's objects. Throws on any inconsistency instead of publishing a guessed reason or value.
 */
export function explainDecision(input: unknown): DecisionExplanation {
  const value = fields(input, [
      'sessionId',
      'worldEpoch',
      'actor',
      'decisionTick',
      'behavior',
      'reasons',
      'action',
      'targets',
      'influences',
    ]),
    owner = scope({ sessionId: value.sessionId, worldEpoch: value.worldEpoch }),
    subject = actor(value.actor),
    decisionTick = tick(value.decisionTick),
    behavior = behaviorDecision(value.behavior, owner, subject, decisionTick),
    reasons = reasonCodes(value.reasons, behavior.reason),
    action =
      value.action === null
        ? null
        : identity(value.action, DECISION_EXPLANATION_LIMITS.reasonCodeUnits),
    targets = quantities(value.targets),
    influences = consumedInfluences(value.influences),
    explanation: DecisionExplanation = Object.freeze({
      version: DECISION_EXPLANATION_LIMITS.version,
      ...owner,
      actor: subject,
      decisionTick,
      sourceTick: behavior.sourceTick,
      profileVersionId: behavior.profileVersionId,
      behavior,
      reasons,
      action,
      targets,
      influences,
      retainedHistory: 0 as const,
    });
  return explanation;
}
interface Entry {
  actor: BehaviorActor;
  explanation: DecisionExplanation | null;
  lastDecisionTick: number | null;
}
/**
 * Bounded current-explanation store keyed by admitted actor. Mirrors 045's ownership fences: at most
 * one explanation per actor, no history, monotonic decision ticks, explicit reset/dispose. It has no
 * reference to the FSM, so a reader can neither see nor change future decisions.
 */
export function createDecisionExplainer(options: BehaviorScope): DecisionExplanationPort {
  let owner = scope(options),
    disposed = false,
    busy = false;
  const live = new Map<string, Entry>();
  const available = () =>
    requireContract(!disposed && !busy, 'Decision explainer disposed or reentrant');
  const fence = (input: BehaviorScope) => {
    const checked = scope(input);
    requireContract(
      checked.sessionId === owner.sessionId && checked.worldEpoch === owner.worldEpoch,
      'Foreign decision-explanation world',
    );
  };
  const current = (subject: BehaviorActor) => {
    const entry = live.get(subject.id);
    requireContract(
      entry?.actor.incarnation === subject.incarnation,
      'Unknown or stale decision-explanation actor',
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
            input.length <= DECISION_EXPLANATION_LIMITS.actors &&
            Object.getPrototypeOf(input) === Array.prototype &&
            Reflect.ownKeys(input).length === input.length + 1,
          'Decision-explanation actor admission exceeded',
        );
        const next: BehaviorActor[] = [];
        for (let index = 0; index < input.length; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
          requireContract(
            descriptor !== undefined && 'value' in descriptor && descriptor.enumerable === true,
            'Invalid decision-explanation actor array',
          );
          next.push(actor(descriptor.value));
        }
        const ids = new Set<string>();
        for (const identity of next) {
          requireContract(!ids.has(identity.id), 'Duplicate decision-explanation actor');
          ids.add(identity.id);
        }
        for (const [key] of live) if (!ids.has(key)) live.delete(key);
        for (const identity of next) {
          const previous = live.get(identity.id);
          requireContract(
            previous === undefined || previous.actor.incarnation === identity.incarnation,
            'Stale decision-explanation incarnation',
          );
          if (previous === undefined)
            live.set(identity.id, {
              actor: identity,
              explanation: null,
              lastDecisionTick: null,
            });
        }
      } finally {
        busy = false;
      }
    },
    capture(input: DecisionExplanationInput) {
      available();
      busy = true;
      try {
        const explanation = explainDecision(input);
        fence({ sessionId: explanation.sessionId, worldEpoch: explanation.worldEpoch });
        requireContract(
          sameActor(explanation.actor, actor(input.actor)),
          'Decision explanation actor mismatch',
        );
        const entry = current(explanation.actor);
        requireContract(
          entry.lastDecisionTick === null || explanation.decisionTick > entry.lastDecisionTick,
          'Decision explanation tick must advance',
        );
        entry.explanation = explanation;
        entry.lastDecisionTick = explanation.decisionTick;
        return explanation;
      } finally {
        busy = false;
      }
    },
    read(input: BehaviorActor, requestedScope: BehaviorScope) {
      available();
      busy = true;
      try {
        fence(requestedScope);
        return current(actor(input)).explanation;
      } finally {
        busy = false;
      }
    },
    view(input: BehaviorActor, requestedScope: BehaviorScope): DecisionExplanationView {
      available();
      busy = true;
      try {
        fence(requestedScope);
        const entry = current(actor(input));
        if (entry.explanation !== null)
          return Object.freeze({ present: true, explanation: entry.explanation });
        return Object.freeze({
          version: DECISION_EXPLANATION_LIMITS.version,
          ...owner,
          actor: entry.actor,
          present: false,
          decisionTick: null,
          reason: 'NO_DECISION',
          retainedHistory: 0 as const,
        });
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
          'Decision-explanation reset must advance epoch',
        );
        live.clear();
        owner = next;
      } finally {
        busy = false;
      }
    },
    dispose() {
      if (disposed) return;
      requireContract(!busy, 'Reentrant decision-explanation disposal');
      disposed = true;
      live.clear();
    },
    getStats() {
      return Object.freeze({
        ...owner,
        actors: live.size,
        explanations: [...live.values()].filter((entry) => entry.explanation !== null).length,
        retainedHistory: 0 as const,
        disposed,
      });
    },
  });
}

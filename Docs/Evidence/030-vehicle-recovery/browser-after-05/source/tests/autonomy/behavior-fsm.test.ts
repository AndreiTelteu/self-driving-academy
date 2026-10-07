import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBehaviorFSM,
  projectBehaviorContext,
  parseBehaviorFacts,
  parseBehaviorContext,
  BEHAVIOR_LIMITS,
} from '../../src/autonomy/behavior-fsm';
import type {
  BehaviorContext,
  BehaviorFacts,
  BehaviorInput,
} from '../../src/autonomy/behavior-fsm';
import { createRoadContext } from '../../src/autonomy/road-context';
import { createSimulationScheduler, entityDecisionPhase } from '../../src/simulation/scheduling';
import { roadContextFixture } from './road-context-reference';
import { referenceBehavior, referenceFacts } from './behavior-fsm-reference';
const scope = { sessionId: 'behavior-test', worldEpoch: 0 };
const actor = { id: 'vehicle-1', incarnation: 1 };
const context = (sourceTick = 0): BehaviorContext => ({
  ...scope,
  sourceTick,
  subject: actor,
  laneId: 'west-in',
  leaderId: null,
  vehiclesComplete: true,
  discontinuity: false,
});
const facts = (values: Partial<BehaviorFacts> = {}): BehaviorFacts => ({
  ...referenceFacts(5, 0),
  ...values,
});
const input = (decisionTick = 1, values: Partial<BehaviorInput> = {}): BehaviorInput => ({
  ...scope,
  actor,
  decisionTick,
  context: context(decisionTick - 1),
  facts: facts(),
  ...values,
});
function owner() {
  const engine = createBehaviorFSM(scope);
  engine.setActors([actor], scope);
  return engine;
}

test('all six states and concurrent priorities have exact reason codes and owned transition snapshots', () => {
  const engine = owner();
  const conflicts = facts({
    routeBlocked: true,
    stop: 'RED_BY_PROFILE',
    yield: 'CONFLICT_BY_POLICY',
    service: 'ACCEPTED',
    laneChange: 'VALIDATED',
  });
  const cases: readonly (readonly [Partial<BehaviorFacts>, string, string])[] = [
    [conflicts, 'BLOCKED', 'BLOCKED_ROUTE'],
    [{ ...conflicts, routeBlocked: false }, 'STOP', 'WAIT_RED_BY_PROFILE'],
    [{ ...conflicts, routeBlocked: false, stop: 'NONE' }, 'YIELD', 'YIELD_CONFLICT_BY_POLICY'],
    [
      { ...conflicts, routeBlocked: false, stop: 'NONE', yield: 'NONE' },
      'SERVICE',
      'SERVICE_ACCEPTED',
    ],
    [
      { ...conflicts, routeBlocked: false, stop: 'NONE', yield: 'NONE', service: 'NONE' },
      'CHANGE_LANE',
      'LANE_CHANGE_VALIDATED',
    ],
    [{}, 'FOLLOW', 'FOLLOW_LANE'],
  ];
  let previous: string | null = null;
  for (const [index, [value, state, reason]] of cases.entries()) {
    const decision = engine.decide(input(index + 1, { facts: facts(value) }));
    assert.equal(decision.state, state);
    assert.equal(decision.reason, reason);
    assert.equal(decision.previousState, previous);
    assert.equal(decision.transitioned, true);
    assert(Object.isFrozen(decision) && Object.isFrozen(decision.actor));
    previous = state;
  }
  const follow = engine.decide(input(7, { context: { ...context(6), leaderId: 'leader' } }));
  assert.equal(follow.reason, 'FOLLOW_LEADER');
  const stopRule = engine.decide(input(8, { facts: facts({ stop: 'STOP_RULE_BY_PROFILE' }) }));
  assert.equal(stopRule.reason, 'WAIT_STOP_BY_PROFILE');
  assert.equal(stopRule.state, 'STOP');
  assert.equal(follow.reason, 'FOLLOW_LEADER');
  assert.equal(follow.transitioned, false);
  assert.equal(engine.getStats().decisions, 1);
  assert.equal(engine.getStats().retainedHistory, 0);
  engine.dispose();
});

test('absence, foreign, future/stale, discontinuous and incomplete source are blocked before any requested maneuver', () => {
  const cases: readonly (readonly [BehaviorContext | null, BehaviorFacts | null, string])[] = [
    [null, facts({ stop: 'REQUESTED' }), 'MISSING_CONTEXT'],
    [{ ...context(), worldEpoch: 1 }, facts(), 'FOREIGN_CONTEXT'],
    [{ ...context(), subject: { ...actor, incarnation: 2 } }, facts(), 'FOREIGN_CONTEXT'],
    [context(8), facts(), 'STALE_CONTEXT'],
    [context(0), facts(), 'STALE_CONTEXT'],
    [{ ...context(6), discontinuity: true }, facts(), 'CONTEXT_DISCONTINUITY'],
    [{ ...context(6), laneId: null }, facts(), 'INCOMPLETE_CONTEXT'],
    [{ ...context(6), vehiclesComplete: false }, facts(), 'INCOMPLETE_CONTEXT'],
    [context(6), null, 'MISSING_POLICY_FACTS'],
  ];
  for (const [source, policy, reason] of cases) {
    const engine = owner();
    const result = engine.decide(input(7, { context: source, facts: policy }));
    assert.equal(result.state, 'BLOCKED');
    assert.equal(result.reason, reason);
    assert.equal(result.sourceTick, source?.sourceTick ?? null);
    engine.dispose();
  }
  const engine = owner();
  assert.equal(engine.decide(input(6, { context: context(0) })).state, 'FOLLOW');
  engine.dispose();
});

test('versioned parsers reject getters, exotic/sparse and oversized data without changing accepted owner state', () => {
  const engine = owner(),
    accepted = engine.decide(input());
  let reads = 0;
  assert.throws(() =>
    parseBehaviorFacts({
      ...facts(),
      get stop() {
        reads++;
        return 'NONE';
      },
    }),
  );
  assert.equal(reads, 0);
  assert.throws(() => parseBehaviorFacts({ ...facts(), version: 'unknown' }));
  assert.throws(() => parseBehaviorFacts({ ...facts(), profileVersionId: 'x'.repeat(129) }));
  assert.throws(() => parseBehaviorContext({ ...context(), leaderId: actor.id }));
  assert.throws(() => parseBehaviorContext({ ...context(), sourceTick: NaN }));
  assert.throws(() =>
    engine.decide(input(2, { facts: { ...facts(), routeBlocked: 1 } as unknown as BehaviorFacts })),
  );
  assert.equal(engine.read(actor, scope), accepted);
  assert.throws(() => engine.decide(input(2, { worldEpoch: 1 })));
  assert.equal(engine.read(actor, scope), accepted);
  const sparse = new Array(2);
  sparse[1] = actor;
  assert.throws(() => engine.setActors(sparse, scope));
  assert.equal(engine.getStats().actors, 1);
  const proxy = new Proxy(scope, {
    ownKeys(target) {
      engine.dispose();
      return Reflect.ownKeys(target);
    },
  });
  assert.throws(() => engine.setActors([actor], proxy));
  assert.equal(engine.getStats().disposed, false);
  engine.dispose();
});

test('published044 projection keeps actual source age, used completeness and shared profile semantics without retaining geometry', () => {
  const fixture = roadContextFixture(false),
    road = createRoadContext(fixture.map, { priorityPolicy: fixture.policy });
  road.updateFrame(fixture.frame);
  const published = road.getContext(actor.id, { force: true })!;
  const compact = projectBehaviorContext(published)!;
  assert.equal(compact.sourceTick, published.tick);
  assert.equal(compact.laneId, published.laneId);
  assert.equal(compact.vehiclesComplete, true);
  assert(!('obstacles' in compact));
  assert(!('priorityRelations' in compact));
  assert(Object.isFrozen(compact));
  const engine = createBehaviorFSM({
    sessionId: published.sessionId,
    worldEpoch: published.worldEpoch,
  });
  engine.setActors([published.subject], {
    sessionId: published.sessionId,
    worldEpoch: published.worldEpoch,
  });
  for (let index = 0; index < 6; index++) {
    const policy = referenceFacts(index, 0);
    const result = engine.decide({
      sessionId: published.sessionId,
      worldEpoch: published.worldEpoch,
      actor: published.subject,
      decisionTick: index + 1,
      context: compact,
      facts: policy,
    });
    const expected = referenceBehavior({
      sessionId: published.sessionId,
      worldEpoch: published.worldEpoch,
      actor: published.subject,
      decisionTick: index + 1,
      context: published,
      facts: policy,
    });
    assert.equal(result.state, expected.state);
    assert.equal(result.reason, expected.reason);
    assert.equal(result.profileVersionId, expected.profileVersionId);
  }
  engine.dispose();
  road.dispose();
});

test('219 invokes periodic decisions only in deterministic phases, urgent offphase reads fresh044, input/controller remain60Hz', () => {
  const fixture = roadContextFixture(false),
    road = createRoadContext(fixture.map, { priorityPolicy: fixture.policy });
  const worldScope = { sessionId: fixture.frame.sessionId, worldEpoch: 0 };
  road.updateFrame(fixture.frame);
  const engine = createBehaviorFSM(worldScope),
    identity = { id: 'vehicle-1', incarnation: 1 };
  engine.setActors([identity], worldScope);
  const phase = entityDecisionPhase(identity.id),
    urgentTick = phase === 1 ? 2 : 1;
  const calls: { tick: number; urgent: boolean; sourceTick: number | null; state: string }[] = [];
  let manualTicks = 0,
    controlTicks = 0,
    physicsTicks = 0;
  const scheduler = createSimulationScheduler({
    ...worldScope,
    ports: {
      input(at) {
        manualTicks++;
        if (at === urgentTick) {
          road.invalidate(identity.id, identity.incarnation);
          return { ...worldScope, actors: [identity] };
        }
      },
      decision(value, at, urgent) {
        const fresh = road.getContext(value.id, { force: urgent });
        const result = engine.decide({
          ...worldScope,
          actor: value,
          decisionTick: at,
          context: projectBehaviorContext(fresh),
          facts: facts({ stop: urgent ? 'REQUESTED' : 'NONE' }),
        });
        calls.push({ tick: at, urgent, sourceTick: result.sourceTick, state: result.state });
      },
      controller() {
        controlTicks++;
      },
      physics(at) {
        physicsTicks++;
        road.updateFrame({
          ...fixture.frame,
          tick: at,
          signals: fixture.frame.signals.map((signal) => ({ ...signal, tick: at })),
        });
      },
    },
  });
  scheduler.setActors([identity], worldScope);
  for (let at = 1; at <= 60; at++) scheduler.step({ ...worldScope, tick: at, dtSeconds: 1 / 60 });
  assert.equal(manualTicks, 60);
  assert.equal(controlTicks, 60);
  assert.equal(physicsTicks, 60);
  const urgent = calls.find((call) => call.tick === urgentTick)!;
  assert.equal(urgent.urgent, true);
  assert.equal(urgent.sourceTick, urgentTick - 1);
  assert.equal(urgent.state, 'STOP');
  assert(calls.filter((call) => !call.urgent).every((call) => call.tick % 6 === phase));
  assert.equal(calls.length, 11);
  scheduler.dispose();
  engine.dispose();
  road.dispose();
});

test('authority change clears decision without allowing tick regression and does not commandeer MANUAL/LEARNING', () => {
  const engine = owner();
  engine.decide(input(4));
  for (const mode of ['MANUAL', 'LEARNING'] as const) {
    engine.setAuthority(actor, mode, scope);
    assert.equal(engine.read(actor, scope), null);
    assert.throws(() => engine.decide(input(5)));
  }
  engine.setAuthority(actor, 'AUTO', scope);
  assert.throws(() => engine.decide(input(4)));
  const result = engine.decide(input(5));
  assert.equal(result.previousState, null);
  assert.equal(result.state, 'FOLLOW');
  engine.dispose();
});

test('identity reuse, epoch resets and atomic capacity admission fence stale callbacks with bounded tombstones', () => {
  const engine = owner();
  engine.decide(input());
  engine.setActors([], scope);
  assert.throws(() => engine.setActors([actor], scope));
  engine.setActors([{ ...actor, incarnation: 2 }], scope);
  assert.throws(() => engine.decide(input(2)));
  assert.equal(engine.getStats().decisions, 0);
  const live = Array.from({ length: 110 }, (_, index) => ({ id: `id-${index}`, incarnation: 0 }));
  engine.setActors(live, scope);
  assert.throws(() => engine.setActors([...live, { id: 'extra', incarnation: 0 }], scope));
  assert.equal(engine.getStats().actors, 110);
  engine.reset(scope.sessionId, 1);
  assert.equal(engine.getStats().identities, 0);
  assert.throws(() => engine.setActors([actor], scope));
  assert.throws(() => engine.reset(scope.sessionId, 1));
  engine.dispose();
  engine.dispose();
  assert.throws(() => engine.read(actor, scope));
});

test('twenty full110actor lifecycle cycles retain only bounded current scalar projections and release all ownership', () => {
  for (let cycle = 0; cycle < 20; cycle++) {
    const engine = createBehaviorFSM(scope),
      actors = Array.from({ length: 110 }, (_, index) => ({
        id: `cycle-${index}`,
        incarnation: 0,
      }));
    engine.setActors(actors, scope);
    for (const identity of actors) {
      const result = engine.decide(
        input(1, { actor: identity, context: { ...context(), subject: identity } }),
      );
      assert(!('context' in result));
      assert(!('facts' in result));
      assert(!('history' in result));
    }
    assert.equal(engine.getStats().actors, BEHAVIOR_LIMITS.actors);
    assert.equal(engine.getStats().decisions, 110);
    assert.equal(engine.getStats().retainedHistory, 0);
    engine.dispose();
    assert.equal(engine.getStats().actors, 0);
    assert.equal(engine.getStats().identities, 0);
    assert.equal(engine.getStats().decisions, 0);
  }
});

test('1024 protected epoch identities refuse new IDs atomically without tombstone eviction', () => {
  const engine = createBehaviorFSM(scope);
  for (let start = 0; start < 1024; start += 110) {
    const actors = Array.from({ length: Math.min(110, 1024 - start) }, (_, index) => ({
      id: `capacity-${start + index}`,
      incarnation: 0,
    }));
    engine.setActors(actors, scope);
  }
  engine.setActors([], scope);
  const before = engine.getStats();
  assert.equal(before.identities, 1024);
  assert.equal(before.retiredIdentities, 1024);
  assert.throws(() => engine.setActors([{ id: 'new-id', incarnation: 0 }], scope));
  assert.deepEqual(engine.getStats(), before);
  assert.throws(() => engine.setActors([{ id: 'capacity-0', incarnation: 0 }], scope));
  engine.setActors([{ id: 'capacity-0', incarnation: 1 }], scope);
  assert.equal(engine.getStats().identities, 1024);
  engine.reset(scope.sessionId, 1);
  assert.equal(engine.getStats().identities, 0);
  assert.equal(engine.getStats().retiredIdentities, 0);
  engine.dispose();
});

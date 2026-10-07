import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSimulationScheduler,
  entityDecisionPhase,
  SCHEDULING_LIMITS,
} from '../../src/simulation/scheduling';
import type {
  ScheduledActor,
  SchedulingPorts,
  ScheduledRouteRequest,
  ScheduledRouteResult,
  SimulationScheduler,
  RouteTask,
} from '../../src/simulation/scheduling';
import { createFixedTickLoop } from '../../src/simulation/fixed-tick';
import { referenceClockScenario, schedulingFixture } from './scheduling-reference';

const scope = { sessionId: '219-test', worldEpoch: 0 },
  a = { id: 'a', incarnation: 1 },
  b = { id: 'b', incarnation: 1 };
function setup(extra: Partial<SchedulingPorts> = {}) {
  const events: string[] = [],
    decisions: { id: string; tick: number; urgent: boolean }[] = [],
    routes: ScheduledRouteResult[] = [];
  const ports: SchedulingPorts = {
    input(tick) {
      events.push(`input:${tick}`);
    },
    decision(actor, tick, urgent) {
      decisions.push({ id: actor.id, tick, urgent });
    },
    controller(actor, tick, dt) {
      assert.equal(dt, 1 / 60);
      events.push(`control:${tick}:${actor.id}`);
    },
    physics(tick, dt) {
      assert.equal(dt, 1 / 60);
      events.push(`physics:${tick}`);
    },
    routeResult(result) {
      routes.push(result);
    },
    ...extra,
  };
  const engine = createSimulationScheduler({ ...scope, ports });
  engine.setActors([b, a], scope);
  return { engine, events, decisions, routes };
}
function step(engine: SimulationScheduler, tick: number, worldEpoch = 0) {
  return engine.step({ ...scope, worldEpoch, tick, dtSeconds: 1 / 60 });
}
function request(
  actor: ScheduledActor = a,
  override: Partial<ScheduledRouteRequest> = {},
): ScheduledRouteRequest {
  return {
    ...scope,
    actor,
    graphVersion: 'g1',
    costVersion: 'c1',
    origin: 'from',
    destination: 'to',
    access: 'CIVIL',
    priority: 'normal',
    ...override,
  };
}

test('stable entity phases retain10Hz counts across insertion order and30/60/120render clocks; physics/input remain identical', () => {
  const traces: string[][] = [];
  for (const fps of [30, 60, 120] as const) {
    const { engine, events, decisions } = setup({
      input(tick) {
        if (tick === 7) return { ...scope, actors: [b] };
      },
    });
    const loop = createFixedTickLoop({
      step: ({ tick }) => step(engine, tick),
      captureSnapshot: () => ({ tick: engine.getStats().tick }),
      interpolate: (_a, current) => current,
    });
    loop.frame(0);
    for (let frame = 1; frame <= fps * 2; frame++) loop.frame((frame * 1000) / fps);
    assert.equal(loop.getState().tick, 120);
    for (const actor of [a, b]) {
      const periodic = decisions.filter(
        (decision) =>
          decision.id === actor.id && decision.tick % 6 === entityDecisionPhase(actor.id),
      );
      assert.equal(periodic.length, 20);
      assert.ok(periodic.every((decision) => decision.tick % 6 === entityDecisionPhase(actor.id)));
    }
    assert.ok(
      decisions.some((decision) => decision.id === 'b' && decision.tick === 7 && decision.urgent),
    );
    const physics = events.filter((event) => event.startsWith('physics:'));
    assert.deepEqual(
      physics,
      referenceClockScenario(fps).events.filter((event) => event.startsWith('physics:')),
    );
    traces.push(events);
    loop.dispose();
    engine.dispose();
  }
  assert.deepEqual(traces[0], traces[1]);
  assert.deepEqual(traces[1], traces[2]);
  assert.equal(entityDecisionPhase('a'), entityDecisionPhase('a'));
});

test('urgent input runs immediately, coalesces due decisions, and publication urgency waits only next relevant physicaltick', () => {
  const targetTick = entityDecisionPhase('a') || 6;
  const { engine, decisions } = setup({
    input(tick) {
      if (tick === targetTick) return { ...scope, actors: [a, a] };
    },
    afterTick(tick) {
      if (tick === targetTick) return { ...scope, actors: [b] };
    },
  });
  for (let tick = 1; tick <= targetTick + 1; tick++) step(engine, tick);
  assert.equal(
    decisions.filter((decision) => decision.id === 'a' && decision.tick === targetTick).length,
    1,
  );
  assert.ok(
    decisions.some(
      (decision) => decision.id === 'a' && decision.tick === targetTick && decision.urgent,
    ),
  );
  assert.ok(
    decisions.some(
      (decision) => decision.id === 'b' && decision.tick === targetTick + 1 && decision.urgent,
    ),
  );
  engine.dispose();
});

test('decisionTick never restamps latest committed044context sourceTick; urgent input is independent of source age', () => {
  const fixture = schedulingFixture(false),
    currentScope = { sessionId: fixture.frame.sessionId, worldEpoch: fixture.frame.worldEpoch };
  const seen: { decisionTick: number; sourceTick: number; urgent: boolean }[] = [];
  const engine = createSimulationScheduler({
    ...currentScope,
    ports: {
      ...fixture.ports,
      input(tick) {
        if (tick === 4) return { ...currentScope, actors: [fixture.actors[0]] };
      },
      decision(actor, decisionTick, urgent) {
        const context = fixture.context.getContext(actor.id, { force: true })!;
        seen.push({ decisionTick, sourceTick: context.tick, urgent });
      },
    },
  });
  try {
    engine.setActors(fixture.actors, currentScope);
    fixture.prepare(0);
    for (let tick = 1; tick <= 6; tick++) {
      engine.step({ ...currentScope, tick, dtSeconds: 1 / 60 });
      fixture.prepare(tick);
    }
    assert.ok(seen.length >= 70);
    assert.ok(seen.every((sample) => sample.sourceTick === sample.decisionTick - 1));
    assert.ok(
      seen.some((sample) => sample.decisionTick === 4 && sample.sourceTick === 3 && sample.urgent),
    );
  } finally {
    engine.dispose();
    fixture.dispose();
  }
});

test('adversarial same-phase identities are all processed, while every offcamera actor receives all controllers', () => {
  const actors: ScheduledActor[] = [];
  for (let id = 0; actors.length < 110 && id < 10000; id++)
    if (entityDecisionPhase(`actor-${id}`) === 0)
      actors.push({ id: `actor-${id}`, incarnation: 1 });
  assert.equal(actors.length, 110);
  const { engine, decisions, events } = setup();
  engine.setActors(actors.reverse(), scope);
  for (let tick = 1; tick <= 6; tick++) step(engine, tick);
  assert.equal(decisions.length, 110);
  assert.ok(decisions.every((decision) => decision.tick === 6));
  assert.deepEqual(
    decisions.map((decision) => decision.id),
    [...actors].map((actor) => actor.id).sort(),
  );
  assert.equal(events.filter((event) => event.startsWith('control:')).length, 660);
  engine.dispose();
});

test('real008hitch/background debt, max4steps and explicit overload are preserved by scheduler composition', () => {
  const { engine, events } = setup();
  const loop = createFixedTickLoop({
    step: ({ tick }) => step(engine, tick),
    captureSnapshot: () => ({ tick: engine.getStats().tick }),
    interpolate: (_a, current) => current,
  });
  loop.frame(0);
  assert.equal(loop.frame(1000).state.status, 'overload');
  assert.equal(events.length, 0);
  assert.equal(engine.getStats().tick, 0);
  loop.resume(1000);
  for (let frame = 1; frame <= 15; frame++) assert.ok(loop.frame(1000 + frame).steps <= 4);
  assert.equal(engine.getStats().tick, 60);
  assert.equal(loop.getState().simulatedSeconds, 1);
  loop.pause(1015, 'background');
  loop.frame(10000);
  loop.resume(10000);
  loop.frame(10000 + 1000 / 60);
  assert.equal(engine.getStats().tick, 61);
  loop.dispose();
  engine.dispose();
});

test('pending028publication admission refusal faults before input/control/physics and cannot commit a nominal noop tick', () => {
  const { engine, events } = setup({
    beforeStep() {
      return false;
    },
  });
  const loop = createFixedTickLoop({
    step: ({ tick }) => step(engine, tick),
    captureSnapshot: () => ({ tick: engine.getStats().tick }),
    interpolate: (_a, current) => current,
  });
  loop.frame(0);
  const result = loop.frame(1000 / 60);
  assert.equal(result.state.status, 'fault');
  assert.equal(result.state.tick, 0);
  assert.equal(engine.getStats().fault?.stage, 'admission');
  assert.equal(engine.getStats().tick, 0);
  assert.equal(events.length, 0);
  assert.throws(() => step(engine, 1));
  loop.dispose();
  engine.dispose();
});

test('invalid/staleclock admission preserves state; callback/async/reentrant errors are terminal without retry', () => {
  const normal = setup();
  const before = normal.engine.getStats();
  assert.throws(() => normal.engine.step({ ...scope, tick: 2, dtSeconds: 1 / 60 }));
  assert.throws(() => normal.engine.step({ ...scope, worldEpoch: 1, tick: 1, dtSeconds: 1 / 60 }));
  assert.deepEqual(normal.engine.getStats(), before);
  normal.engine.dispose();
  let calls = 0;
  const broken = setup({
    physics() {
      calls++;
      throw new Error('physical effect fault');
    },
  });
  assert.throws(() => step(broken.engine, 1));
  assert.throws(() => step(broken.engine, 1));
  assert.equal(calls, 1);
  assert.equal(broken.engine.getStats().fault?.stage, 'physics');
  broken.engine.dispose();
  const asyncPort = setup({
    input: (() => Promise.resolve()) as unknown as SchedulingPorts['input'],
  });
  assert.throws(() => step(asyncPort.engine, 1));
  assert.ok(asyncPort.engine.getStats().fault);
  asyncPort.engine.dispose();
  const nested = setup({
    input() {
      reentrant.reset('different', 0);
    },
  });
  const reentrant = nested.engine;
  assert.throws(() => step(nested.engine, 1));
  assert.equal(nested.engine.getStats().sessionId, scope.sessionId);
  nested.engine.dispose();
});

test('actor scheduleridentity ownership fences staleincarnations/removal/epoch callbacks and urgentreuse', () => {
  const { engine } = setup();
  assert.equal(engine.markUrgent(a, scope), true);
  engine.setActors([{ ...a, incarnation: 2 }, b], scope);
  assert.equal(engine.getStats().urgent, 0);
  assert.equal(engine.markUrgent(a, scope), false);
  engine.setActors([b], scope);
  assert.throws(() => engine.setActors([a, b], scope));
  engine.setActors([{ ...a, incarnation: 3 }, b], scope);
  engine.reset(scope.sessionId, 1);
  engine.setActors([a], { ...scope, worldEpoch: 1 });
  assert.throws(() => engine.markUrgent(a, scope));
  assert.throws(() => engine.setActors([a], scope));
  assert.throws(() => step(engine, 1));
  assert.equal(engine.getStats().urgent, 0);
  step(engine, 1, 1);
  engine.dispose();
});

test('finiteactor and1024ledger admission never truncates; hostile getters/densearray prototypes are rejected atomically', () => {
  const { engine } = setup();
  const before = engine.getStats();
  assert.throws(() =>
    engine.setActors(
      Array.from({ length: 111 }, (_, id) => ({ id: `n${id}`, incarnation: 1 })),
      scope,
    ),
  );
  assert.deepEqual(engine.getStats(), before);
  let getters = 0;
  const hostile = {
    id: 'evil',
    get incarnation() {
      getters++;
      return 1;
    },
  };
  assert.throws(() => engine.setActors([hostile], scope));
  assert.equal(getters, 0);
  const inherited = [a];
  Object.setPrototypeOf(inherited, Object.create(Array.prototype));
  assert.throws(() => engine.setActors(inherited, scope));
  engine.reset(scope.sessionId, 1);
  for (let id = 0; id < SCHEDULING_LIMITS.identitiesPerEpoch; id++)
    engine.setActors([{ id: `id-${id}`, incarnation: 1 }], { ...scope, worldEpoch: 1 });
  assert.equal(engine.getStats().identities, 1024);
  assert.equal(engine.getStats().retiredIdentities, 1023);
  assert.throws(() =>
    engine.setActors([{ id: 'one-too-many', incarnation: 1 }], { ...scope, worldEpoch: 1 }),
  );
  engine.dispose();
});

test('routework admission is finite, priority deterministic, at most4cooperative slices and1residenttask per tick', () => {
  let slices = 0,
    tasks = 0,
    disposed = 0;
  const started: string[] = [];
  const { engine, routes } = setup({
    createRouteTask(request) {
      tasks++;
      started.push(request.actor.id);
      let work = 0;
      return {
        step(budget) {
          slices++;
          assert.equal(budget.maxExpansions, 16);
          work++;
          return {
            done: work === 5,
            path: work === 5 ? [request.origin, request.destination] : null,
          };
        },
        dispose() {
          disposed++;
        },
      };
    },
  });
  engine.setRouteVersions({ graphVersion: 'g1', costVersion: 'c1' }, scope);
  engine.requestRoute(request(a));
  engine.requestRoute(request(b, { priority: 'urgent', destination: 'other' }));
  step(engine, 1);
  assert.equal(slices, 4);
  assert.equal(tasks, 1);
  assert.deepEqual(started, ['b']);
  assert.equal(engine.getStats().residentRouteTasks, 1);
  step(engine, 2);
  assert.equal(slices, 8);
  assert.equal(tasks, 2);
  assert.equal(routes[0].actor.id, 'b');
  assert.equal(disposed, 1);
  step(engine, 3);
  assert.equal(routes.length, 2);
  assert.equal(disposed, 2);
  engine.dispose();
});

test('routecache uses graph/cost/access/origin/destination; blocked results reuse only matching versions', () => {
  let tasks = 0;
  const { engine, routes } = setup({
    createRouteTask(request) {
      tasks++;
      return {
        step() {
          return {
            done: true,
            path: request.destination === 'blocked' ? null : [request.origin, request.destination],
          };
        },
        dispose() {},
      };
    },
  });
  engine.setRouteVersions({ graphVersion: 'g1', costVersion: 'c1' }, scope);
  engine.requestRoute(request(a));
  step(engine, 1);
  assert.equal(routes[0].status, 'READY');
  assert.ok(Object.isFrozen(routes[0].path));
  assert.equal(engine.requestRoute(request(b)).status, 'CACHED');
  assert.equal(tasks, 1);
  engine.requestRoute(request(a, { destination: 'blocked' }));
  step(engine, 2);
  assert.equal(routes[1].status, 'BLOCKED');
  assert.equal(engine.requestRoute(request(b, { destination: 'blocked' })).status, 'CACHED');
  engine.setRouteVersions({ graphVersion: 'g2', costVersion: 'c1' }, scope);
  assert.equal(engine.getStats().routeCache, 0);
  assert.throws(() => engine.requestRoute(request(a)));
  engine.requestRoute(request(a, { graphVersion: 'g2' }));
  engine.setRouteVersions({ graphVersion: 'g2', costVersion: 'c2' }, scope);
  assert.equal(routes.at(-1)?.status, 'CANCELLED');
  assert.equal(engine.getStats().routeJobs, 0);
  engine.requestRoute(request(a, { graphVersion: 'g2', costVersion: 'c2', access: 'TAXI' }));
  step(engine, 3);
  assert.equal(tasks, 3);
  engine.dispose();
});

test('a cached different target cannot bypass an actor pending route', () => {
  const { engine, routes } = setup({
    createRouteTask(input) {
      return {
        step: () => ({ done: true, path: [input.origin, input.destination] }),
        dispose() {},
      };
    },
  });
  engine.setRouteVersions({ graphVersion: 'g1', costVersion: 'c1' }, scope);
  engine.requestRoute(request(b, { destination: 'cached' }));
  step(engine, 1);
  const pending = engine.requestRoute(request(a, { destination: 'pending' }));
  assert.throws(
    () => engine.requestRoute(request(a, { destination: 'cached' })),
    /different pending route/,
  );
  assert.equal(engine.requestRoute(request(a, { destination: 'pending' })).ticket, pending.ticket);
  step(engine, 2);
  assert.equal(routes.at(-1)?.path?.at(-1), 'pending');
  assert.equal(engine.requestRoute(request(a, { destination: 'cached' })).status, 'CACHED');
  engine.dispose();
});

test('malformed factory tasks clean valid own disposal once without reading accessors', () => {
  for (const shape of ['invalid-step', 'extra-field', 'step-getter', 'dispose-getter']) {
    let cleanup = 0,
      getters = 0;
    const malformed: Record<string, unknown> = {
      step: () => ({ done: false, path: null }),
      dispose() {
        cleanup++;
      },
    };
    if (shape === 'invalid-step') malformed.step = 1;
    if (shape === 'extra-field') malformed.extra = true;
    if (shape === 'step-getter')
      Object.defineProperty(malformed, 'step', {
        get() {
          getters++;
          throw new Error('getter');
        },
      });
    if (shape === 'dispose-getter')
      Object.defineProperty(malformed, 'dispose', {
        get() {
          getters++;
          throw new Error('getter');
        },
      });
    const { engine } = setup({ createRouteTask: () => malformed as unknown as RouteTask });
    engine.setRouteVersions({ graphVersion: 'g1', costVersion: 'c1' }, scope);
    engine.requestRoute(request());
    assert.throws(() => step(engine, 1));
    assert.equal(engine.getStats().fault?.stage, 'routing');
    assert.equal(engine.getStats().residentRouteTasks, 0);
    engine.dispose();
    engine.dispose();
    assert.equal(cleanup, shape === 'dispose-getter' ? 0 : 1);
    assert.equal(getters, 0);
  }
});

test('deduplicated route urgency promotes waiting normal work; injected object methods preserve their receiver', () => {
  const started: string[] = [];
  const { engine } = setup({
    createRouteTask(request) {
      started.push(request.actor.id);
      const task: RouteTask = {
        step() {
          assert.equal(this, task);
          return { done: true, path: [request.origin, request.destination] };
        },
        dispose() {
          assert.equal(this, task);
        },
      };
      return task;
    },
  });
  engine.setActors([{ id: 'aa', incarnation: 1 }, a, b], scope);
  engine.setRouteVersions({ graphVersion: 'g1', costVersion: 'c1' }, scope);
  engine.requestRoute(request(a));
  engine.requestRoute(request(b, { destination: 'other' }));
  const promoted = engine.requestRoute(request(b, { destination: 'other', priority: 'urgent' }));
  assert.equal(promoted.status, 'QUEUED');
  step(engine, 1);
  assert.deepEqual(started, ['b', 'a']);
  engine.dispose();
});

test('pendingroutecapacity/cancel/expiry and actorremoval cleanup retain explicit terminal outcomes without stalepublish', () => {
  let disposed = 0;
  const { engine, routes } = setup({
    createRouteTask() {
      return {
        step() {
          return { done: false, path: null };
        },
        dispose() {
          disposed++;
        },
      };
    },
  });
  const actors = Array.from({ length: 17 }, (_, id) => ({ id: `car-${id}`, incarnation: 1 }));
  engine.setActors(actors, scope);
  engine.setRouteVersions({ graphVersion: 'g1', costVersion: 'c1' }, scope);
  const tickets = actors.slice(0, 16).map((actor) => engine.requestRoute(request(actor)).ticket!);
  assert.throws(() => engine.requestRoute(request(actors[16])));
  assert.equal(engine.getStats().routeJobs, 16);
  assert.equal(engine.cancelRoute(tickets[1], scope), true);
  assert.equal(routes.at(-1)?.status, 'CANCELLED');
  step(engine, 1);
  engine.setActors(actors.slice(1), scope);
  assert.equal(disposed, 1);
  assert.equal(routes.at(-1)?.actor.id, 'car-0');
  for (let tick = 2; tick <= 121; tick++) step(engine, tick);
  assert.equal(engine.getStats().routeJobs, 0);
  assert.ok(routes.some((result) => result.status === 'EXPIRED'));
  engine.dispose();
});

test('routepath/source validation and taskfailure are terminal; task cleanup is attempted once at lifecycle boundary', () => {
  let cleanup = 0;
  const { engine } = setup({
    createRouteTask() {
      return {
        step() {
          return { done: true, path: ['wrong'] };
        },
        dispose() {
          cleanup++;
        },
      };
    },
  });
  engine.setRouteVersions({ graphVersion: 'g1', costVersion: 'c1' }, scope);
  engine.requestRoute(request());
  assert.throws(() => step(engine, 1));
  assert.equal(engine.getStats().fault?.stage, 'routing');
  assert.equal(engine.getStats().residentRouteTasks, 1);
  engine.dispose();
  engine.dispose();
  assert.equal(cleanup, 1);
});

test('64entryroutecache evicts deterministically and reset/dispose20cycles clear all owned queues/cache/ledger', () => {
  const { engine } = setup({
    createRouteTask(request) {
      return {
        step() {
          return { done: true, path: [request.origin, request.destination] };
        },
        dispose() {},
      };
    },
  });
  engine.setRouteVersions({ graphVersion: 'g1', costVersion: 'c1' }, scope);
  for (let tick = 1; tick <= 65; tick++) {
    engine.requestRoute(request(a, { destination: `to-${tick}` }));
    step(engine, tick);
  }
  assert.equal(engine.getStats().routeCache, 64);
  assert.equal(engine.requestRoute(request(b, { destination: 'to-1' })).status, 'QUEUED');
  for (let epoch = 1; epoch <= 20; epoch++) {
    engine.reset(scope.sessionId, epoch);
    const currentScope = { ...scope, worldEpoch: epoch };
    const clean = engine.getStats();
    assert.equal(clean.actors, 0);
    assert.equal(clean.identities, 0);
    assert.equal(clean.urgent, 0);
    assert.equal(clean.routeJobs, 0);
    assert.equal(clean.routeCache, 0);
    assert.equal(clean.residentRouteTasks, 0);
    engine.setActors([a], currentScope);
    engine.markUrgent(a, currentScope);
    engine.setRouteVersions({ graphVersion: 'g1', costVersion: 'c1' }, currentScope);
    engine.requestRoute(request(a, { worldEpoch: epoch }));
    step(engine, 1, epoch);
  }
  engine.dispose();
  const final = engine.getStats();
  assert.equal(final.actors, 0);
  assert.equal(final.identities, 0);
  assert.equal(final.routeJobs, 0);
  assert.equal(final.routeCache, 0);
  assert.equal(final.urgent, 0);
  assert.throws(() => step(engine, 2, 20));
});

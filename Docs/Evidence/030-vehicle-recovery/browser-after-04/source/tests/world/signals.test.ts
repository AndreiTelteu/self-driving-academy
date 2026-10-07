import assert from 'node:assert/strict';
import test from 'node:test';
import { createSignalController } from '../../src/world/signals';
import { createEventBus, createFixedTickLoop, parseSimulationEvent } from '../../src/simulation';
import type { SimulationEvent } from '../../src/simulation';
import { signalFixture } from './signals-fixture';
const context = {
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: 'signals-test',
  worldEpoch: 0,
};
function setup() {
  const bus = createEventBus(context);
  const controller = createSignalController(signalFixture(), { context, eventBus: bus });
  return { bus, controller };
}
test('full cycles query only the selected movement and preserve exact tick boundaries', () => {
  const { bus, controller } = setup(),
    events: SimulationEvent[] = [];
  bus.subscribe((event) => {
    events.push(event);
  });
  assert.equal(controller.getMovementSignal('junction', 'west-straight')!.state, 'GREEN');
  assert.equal(controller.getMovementSignal('junction', 'south-straight')!.state, 'RED');
  assert.equal(controller.getMovementSignal('foreign', 'west-straight'), null);
  assert.equal(controller.getMovementSignal('junction', 'missing'), null);
  const colors = [];
  for (let tick = 1; tick <= 12; tick++) {
    controller.step(tick);
    colors.push(controller.getMovementSignal('junction', 'west-straight')!.state);
    assert.equal(controller.step(tick).advanced, false);
  }
  assert.deepEqual(colors, [
    'GREEN',
    'YELLOW',
    'RED',
    'RED',
    'RED',
    'GREEN',
    'GREEN',
    'YELLOW',
    'RED',
    'RED',
    'RED',
    'GREEN',
  ]);
  assert.deepEqual(
    events.map((e) => e.tick),
    [2, 3, 4, 6, 8, 9, 10, 12],
  );
  assert.equal(new Set(events.map((e) => e.eventId)).size, 8);
  assert.equal(bus.getStats().retainedEvents, 8);
  const event = events[0];
  assert.equal(event.type, 'SIGNAL_PHASE_CHANGED');
  if (event.type === 'SIGNAL_PHASE_CHANGED') {
    assert.equal(event.payload.fromPhaseId, 'west-green');
    assert.equal(event.payload.toPhaseId, 'west-yellow');
    assert.equal(
      event.payload.movementStates.find((s) => s.movementId === 'south-straight')!.state,
      'RED',
    );
  }
});
test('phase state/events remain readonly and independent from caller map mutation', () => {
  const bus = createEventBus(context),
    map = signalFixture(),
    controller = createSignalController(map, { context, eventBus: bus });
  map.signals[0].phases[0].movementStates[0].state = 'RED';
  assert.equal(controller.getMovementSignal('junction', 'west-straight')!.state, 'GREEN');
  assert.ok(Object.isFrozen(controller.getSignal('signal')));
  assert.throws(() => controller.step(2), /consecutive/);
  assert.throws(() => controller.step(-1));
});
test('GREEN phase validates geometric conflict despite missing shared-zone authoring', () => {
  const map = signalFixture();
  map.signals[0].phases[0].movementStates.find((s) => s.movementId === 'south-straight')!.state =
    'GREEN';
  assert.throws(
    () => createSignalController(map, { context, eventBus: createEventBus(context) }),
    /Unsafe GREEN phase.*conflicts with/,
  );
  const compatible = signalFixture();
  compatible.signals[0].phases[0].movementStates.find(
    (s) => s.movementId === 'east-straight',
  )!.state = 'GREEN';
  assert.doesNotThrow(() =>
    createSignalController(compatible, { context, eventBus: createEventBus(context) }),
  );
});
test('fixed-tick loop pause and resume do not advance signal phases in wall time', () => {
  const { controller } = setup();
  const loop = createFixedTickLoop({
    captureSnapshot: () => controller.getSignal('signal'),
    step: ({ tick }) => {
      controller.step(tick);
    },
    interpolate: (_a, b) => b,
  });
  loop.frame(0);
  loop.frame(1000 / 60);
  loop.pause(1000 / 60);
  loop.frame(10000);
  assert.equal(controller.getStats().tick, 1);
  assert.equal(controller.getSignal('signal')!.phaseId, 'west-green');
  loop.resume(10000);
  loop.frame(10000 + 1000 / 60);
  assert.equal(controller.getStats().tick, 2);
  assert.equal(controller.getSignal('signal')!.phaseId, 'west-yellow');
  loop.dispose();
});
test('listener failures are returned once, reentry rejected, and retry same tick does not duplicate events', () => {
  const { bus, controller } = setup();
  let effects = 0;
  bus.subscribe(() => {
    effects++;
    controller.step(2);
  });
  controller.step(1);
  const result = controller.step(2);
  assert.equal(result.publications[0].failures.length, 1);
  assert.equal(effects, 1);
  assert.equal(controller.step(2).advanced, false);
  assert.equal(effects, 1);
});
test('event transport capacity failure retains a bounded transition and never advances time silently', () => {
  const bus = createEventBus({ ...context, maxEventsPerEpoch: 1 }),
    controller = createSignalController(signalFixture(), { context, eventBus: bus });
  controller.step(1);
  controller.step(2);
  assert.throws(() => controller.step(3), /capacity exhausted/);
  assert.equal(controller.getStats().tick, 2);
  assert.equal(controller.getStats().pendingEvents, 1);
  assert.throws(() => controller.step(3), /capacity exhausted/);
  assert.equal(bus.getStats().retainedEvents, 1);
  controller.dispose();
  controller.dispose();
  assert.equal(controller.getStats().pendingEvents, 0);
  assert.equal(controller.getStats().signals, 0);
  assert.throws(() => controller.getMovementSignal('junction', 'west-straight'), /disposed/);
});
test('phase event JSON decoding is defensive and rejects malformed or ambiguous states', () => {
  const { bus, controller } = setup();
  let captured: SimulationEvent | undefined;
  bus.subscribe((e) => {
    captured = e;
  });
  controller.step(1);
  controller.step(2);
  const json = JSON.stringify(captured),
    parsed = parseSimulationEvent(JSON.parse(json));
  assert.equal(parsed.type, 'SIGNAL_PHASE_CHANGED');
  assert.ok(Object.isFrozen(parsed.payload));
  for (const patch of [
    { fromPhaseId: 'west-yellow' },
    { movementStates: [] },
    { movementStates: [{ movementId: 'a', state: 'BLUE' }] },
    {
      movementStates: [
        { movementId: 'a', state: 'RED' },
        { movementId: 'a', state: 'GREEN' },
      ],
    },
  ]) {
    const malformed = JSON.parse(json);
    Object.assign(malformed.payload, patch);
    assert.throws(() => parseSimulationEvent(malformed));
  }
  const oversized = JSON.parse(json);
  oversized.payload.movementStates = Array.from({ length: 129 }, (_, i) => ({
    movementId: `m-${i}`,
    state: 'RED',
  }));
  assert.throws(() => parseSimulationEvent(oversized), /128/);
});

test('single immutable phase emits no false change; fractional duration quantizes upward deterministically', () => {
  const map = signalFixture();
  map.signals[0].phases = [map.signals[0].phases[0]];
  map.signals[0].phases[0].durationS = 0.025;
  const bus = createEventBus(context),
    controller = createSignalController(map, { context, eventBus: bus });
  assert.equal(controller.getSignal('signal')!.nextChangeTick, 2);
  for (let tick = 1; tick <= 100; tick++) controller.step(tick);
  assert.equal(bus.getStats().retainedEvents, 0);
  assert.equal(controller.getSignal('signal')!.phaseStartedTick, 100);
});
test('stale world is rejected even for a duplicate controller tick', () => {
  const { bus, controller } = setup();
  bus.advanceWorldEpoch(1);
  assert.throws(() => controller.step(0), /stale/);
});
test('failed publication rejects signal queries until explicit retry/recovery', () => {
  const bus = createEventBus({ ...context, maxEventsPerEpoch: 1 }),
    controller = createSignalController(signalFixture(), { context, eventBus: bus });
  controller.step(1);
  controller.step(2);
  assert.throws(() => controller.step(3));
  assert.throws(
    () => controller.getMovementSignal('junction', 'west-straight'),
    /delivery pending/,
  );
});

test('multi-signal publication failure preserves accepted-prefix failures and retries only the remainder', async () => {
  const { twoSignalFixture } = await import('./signals-fixture');
  const input = await twoSignalFixture(),
    bus = createEventBus(context);
  let effects = 0,
    failOnce = true;
  bus.subscribe(() => {
    effects++;
    throw new Error('listener failed after effect');
  });
  const transport = {
    ...bus,
    publish: (value: unknown) => {
      const event = parseSimulationEvent(value);
      if (
        event.type === 'SIGNAL_PHASE_CHANGED' &&
        event.payload.signalId === 'signal-second' &&
        failOnce
      ) {
        failOnce = false;
        throw new Error('transport temporarily failed');
      }
      return bus.publish(event);
    },
  };
  const controller = createSignalController(input, { context, eventBus: transport });
  controller.step(1);
  assert.throws(() => controller.step(2), /temporarily failed/);
  assert.equal(effects, 1);
  assert.equal(bus.getStats().retainedEvents, 1);
  assert.equal(controller.getStats().tick, 1);
  assert.equal(controller.getStats().pendingEvents, 2);
  const retry = controller.step(2);
  assert.equal(effects, 2);
  assert.equal(bus.getStats().retainedEvents, 2);
  assert.equal(retry.publications.length, 2);
  assert.equal(retry.publications[0].failures.length, 1);
  assert.equal(retry.publications[1].failures.length, 1);
  assert.equal(controller.getSignal('signal')!.phaseId, 'red');
  assert.equal(controller.getSignal('signal-second')!.phaseId, 'second-red');
});

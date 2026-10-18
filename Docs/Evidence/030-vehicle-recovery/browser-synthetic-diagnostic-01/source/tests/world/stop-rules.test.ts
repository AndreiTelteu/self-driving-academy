import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStopRules, type StopObservation } from '../../src/world/stop-rules';
import { createEventBus } from '../../src/simulation';
import { minimalMap } from './fixture';
function fixture() {
  const map = minimalMap();
  return {
    ...map,
    geometry: {
      ...map.geometry,
      nodes: map.geometry.nodes.map((node) => ({ ...node, positionM: { ...node.positionM } })),
      paths: map.geometry.paths.map((path) => ({ ...path, nodeIds: [...path.nodeIds] })),
    },
    stopLines: map.stopLines.map((line, i) =>
      i === 0 ? { ...line, kind: 'STOP' as const, signalId: null } : line,
    ),
  };
}
const context = { sessionId: 'session', worldEpoch: 0 };
const sample = (
  tick: number,
  x = 7.5,
  speedMps = 0,
  extra: Partial<StopObservation> = {},
): StopObservation => ({
  ...context,
  tick,
  vehicleId: 'taxi',
  incarnation: 'taxi-1',
  laneId: 'lane-a',
  access: 'TAXI',
  frontPositionM: { x, y: 0, z: 0 },
  headingRad: 0,
  speedMps,
  discontinuity: false,
  ...extra,
});
test('full stop uses observed consecutive dwell; crossing is a separate idempotent bus event', () => {
  const rules = createStopRules(fixture(), context),
    bus = createEventBus(context);
  const all = [];
  for (let t = 0; t <= 60; t++) all.push(...rules.observe(sample(t)));
  assert.deepEqual(
    all.map((event) => event.type),
    ['STOP_APPROACH', 'FULL_STOP'],
  );
  const full = all[1];
  assert.equal(full.type, 'FULL_STOP');
  if (full.type === 'FULL_STOP') assert.equal(full.payload.durationS, 1);
  const crossing = rules.observe(sample(61, 9, 10));
  assert.deepEqual(
    crossing.map((event) => event.type),
    ['STOP_LINE_CROSSED'],
  );
  assert(crossing[0].type === 'STOP_LINE_CROSSED');
  assert.equal(crossing[0].payload.opportunityId, full.payload.opportunityId);
  assert.notEqual(crossing[0].eventId, full.eventId);
  assert.deepEqual(rules.observe(sample(61, 9, 10)), []);
  let deliveries = 0;
  bus.subscribe(() => {
    deliveries++;
  });
  for (const event of [...all, ...crossing]) assert.equal(bus.publish(event).status, 'delivered');
  assert.equal(bus.publish(full).status, 'duplicate');
  assert.equal(deliveries, 3);
  assert(Object.isFrozen(full.payload));
  assert(Object.isFrozen(rules.getZones()[0].points));
  rules.dispose();
  bus.dispose();
});
test('rolling stop, slow reported speed with drift, and no-brake passage never fabricate FULL_STOP', () => {
  for (const speed of [0.3, 0.001]) {
    const rules = createStopRules(fixture(), context);
    const events = [];
    for (let t = 0; t <= 60; t++) events.push(...rules.observe(sample(t, 7.5 + t * 0.005, speed)));
    events.push(...rules.observe(sample(61, 9, 10)));
    assert.deepEqual(
      events.map((event) => event.type),
      ['STOP_APPROACH', 'STOP_LINE_CROSSED'],
    );
    rules.dispose();
  }
  const rules = createStopRules(fixture(), context);
  rules.observe(sample(0, 4, 20));
  assert.deepEqual(
    rules.observe(sample(1, 9, 20)).map((event) => event.type),
    ['STOP_LINE_CROSSED'],
  );
  for (let t = 2; t <= 100; t++) assert.deepEqual(rules.observe(sample(t, 9)), []);
  rules.dispose();
});
test('line contact permits stationary stop; actual forward passage then emits crossing exactly once', () => {
  const rules = createStopRules(fixture(), context);
  const events = [];
  rules.observe(sample(0, 8, 2));
  for (let t = 1; t <= 61; t++) events.push(...rules.observe(sample(t, 8.5)));
  assert.deepEqual(
    events.map((event) => event.type),
    ['FULL_STOP'],
  );
  assert.deepEqual(
    rules.observe(sample(62, 8.6, 1)).map((event) => event.type),
    ['STOP_LINE_CROSSED'],
  );
  assert.deepEqual(rules.observe(sample(63, 8.4, 1)), []);
  assert.deepEqual(rules.observe(sample(64, 8.6, 1)), []);
  rules.dispose();
});
test('speed threshold, far upstream and wrong heading cannot create complete-stop evidence', () => {
  for (const initial of [
    sample(0, 7.5, 0.011),
    sample(0, 4),
    sample(0, 7.5, 0, { headingRad: Math.PI }),
  ]) {
    const rules = createStopRules(fixture(), context);
    const events = [];
    for (let tick = 0; tick <= 120; tick++) events.push(...rules.observe({ ...initial, tick }));
    assert(!events.some((event) => event.type === 'FULL_STOP'));
    rules.dispose();
  }
});
test('missing ticks, teleport, reverse crossing, height and finite line ends do not invent traversal', () => {
  const gap = createStopRules(fixture(), context);
  gap.observe(sample(0));
  assert.deepEqual(gap.observe(sample(60, 9, 10)), []);
  gap.dispose();
  const teleport = createStopRules(fixture(), context);
  teleport.observe(sample(0));
  assert.deepEqual(teleport.observe(sample(1, 9, 10, { discontinuity: true })), []);
  teleport.dispose();
  const reverse = createStopRules(fixture(), context);
  reverse.observe(sample(0, 9, 10));
  assert(!reverse.observe(sample(1, 7, 10)).some((event) => event.type === 'STOP_LINE_CROSSED'));
  reverse.dispose();
  for (const position of [
    { y: 3, z: 0 },
    { y: 0, z: 1.5 },
  ]) {
    const rules = createStopRules(fixture(), context);
    assert.deepEqual(
      rules.observe(sample(0, 7, 10, { frontPositionM: { x: 7, ...position } })),
      [],
    );
    assert.deepEqual(
      rules.observe(sample(1, 9, 10, { frontPositionM: { x: 9, ...position } })),
      [],
    );
    rules.dispose();
  }
  const missing = createStopRules(fixture(), context);
  const events = [];
  missing.observe(sample(0));
  missing.observe(sample(60));
  for (let tick = 61; tick <= 120; tick++) events.push(...missing.observe(sample(tick)));
  assert.deepEqual(
    events.map((event) => event.type),
    ['FULL_STOP'],
  );
  missing.dispose();
});
test('stale/conflicting ticks, context and nonfinite data reject without advancing history', () => {
  const rules = createStopRules(fixture(), context);
  rules.observe(sample(10));
  const before = rules.getStats();
  for (const bad of [
    sample(9),
    sample(10, 8),
    sample(11, 7, NaN),
    sample(11, 7, 0, { worldEpoch: 1 }),
    sample(11, 7, 0, { sessionId: 'other' }),
  ])
    assert.throws(() => rules.observe(bad));
  assert.deepEqual(rules.getStats(), before);
  assert.deepEqual(rules.observe(sample(11)), []);
  rules.dispose();
  assert.equal(rules.getStats().vehicles, 0);
  assert.throws(() => rules.observe(sample(12)));
});
test('ID reuse cannot inherit stop evidence or admit a retired incarnation; real epoch resets history', () => {
  const rules = createStopRules(fixture(), context);
  for (let tick = 0; tick <= 60; tick++) rules.observe(sample(tick));
  const respawn = rules.observe(sample(60, 7.5, 0, { incarnation: 'taxi-2', discontinuity: true }));
  assert.deepEqual(
    respawn.map((event) => event.type),
    ['STOP_APPROACH'],
  );
  assert.throws(() => rules.observe(sample(61)));
  rules.forgetVehicle('taxi');
  assert.throws(() => rules.observe(sample(61, 7.5, 0, { incarnation: 'taxi-2' })));
  rules.advanceWorldEpoch(1);
  assert.equal(rules.getStats().trackedIncarnations, 0);
  assert.throws(() => rules.observe(sample(0)));
  assert.equal(rules.observe(sample(0, 7.5, 0, { worldEpoch: 1 })).length, 1);
  rules.dispose();
});
test('bounded history fails closed; frozen map geometry and transverse direction stay stable', () => {
  const input = fixture();
  const rules = createStopRules(input, context, { maxVehicles: 1, maxIncarnations: 2 });
  input.geometry.nodes[13].positionM.x = 100;
  assert.equal(rules.getZones()[0].points[0].x, 8.5);
  rules.observe(sample(0));
  assert.throws(() => rules.observe(sample(0, 7.5, 0, { vehicleId: 'second' })));
  rules.forgetVehicle('taxi');
  rules.observe(sample(1, 7.5, 0, { vehicleId: 'second' }));
  rules.forgetVehicle('second');
  assert.throws(() => rules.observe(sample(2, 7.5, 0, { vehicleId: 'third' })));
  assert.equal(rules.getStats().trackedIncarnations, 2);
  rules.dispose();
  assert.equal(rules.getStats().trackedIncarnations, 0);
  const flipped = fixture();
  flipped.geometry.paths[4] = {
    ...flipped.geometry.paths[4],
    nodeIds: [...flipped.geometry.paths[4].nodeIds].reverse(),
  };
  const geometry = createStopRules(flipped, context);
  geometry.observe(sample(0, 7));
  assert.equal(geometry.observe(sample(1, 9, 10))[0].type, 'STOP_LINE_CROSSED');
  geometry.dispose();
});

test('directed reverse geometry and consecutive STOP lines preserve distinct opportunities', () => {
  const mirror = fixture();
  for (const node of mirror.geometry.nodes) node.positionM.x = 10 - node.positionM.x;
  const reverseMap = {
    ...mirror,
    bounds: { minM: { x: -15, y: 0, z: -5 }, maxM: { x: 15, y: 0, z: 25 } },
  };
  const reverse = createStopRules(reverseMap, context);
  reverse.observe(sample(0, 2.5, 0, { headingRad: Math.PI }));
  const crossing = reverse.observe(sample(1, 0.5, 10, { headingRad: Math.PI }));
  assert.equal(crossing[0].type, 'STOP_LINE_CROSSED');
  reverse.dispose();

  const map = fixture();
  map.geometry.nodes.push(
    { id: 'near-a', positionM: { x: 6.5, y: 0, z: -1 } },
    { id: 'near-b', positionM: { x: 6.5, y: 0, z: 1 } },
  );
  map.geometry.paths.push({ id: 'near-path', nodeIds: ['near-a', 'near-b'] });
  map.stopLines.push({ ...map.stopLines[0], id: 'near-stop', geometryId: 'near-path' });
  const rules = createStopRules(map, context);
  const events = [];
  for (let tick = 0; tick <= 60; tick++) events.push(...rules.observe(sample(tick, 5.5)));
  assert.equal(events[0].type, 'STOP_APPROACH');
  if (events[0].type === 'STOP_APPROACH') assert.equal(events[0].payload.stopLineId, 'near-stop');
  const next = rules.observe(sample(61, 7, 10));
  assert.deepEqual(
    next.map((event) => event.type),
    ['STOP_LINE_CROSSED', 'STOP_APPROACH'],
  );
  assert(next[1].type === 'STOP_APPROACH' && events[0].type === 'STOP_APPROACH');
  assert.notEqual(next[1].payload.opportunityId, events[0].payload.opportunityId);
  assert.deepEqual(rules.observe(sample(62, 7.5)), []);
  rules.dispose();
});

test('calibration/accessor boundaries and long valid identities remain safe', () => {
  let reads = 0;
  assert.throws(() =>
    createStopRules(fixture(), context, {
      get dwellS() {
        reads++;
        return 1;
      },
    }),
  );
  assert.equal(reads, 0);
  assert.throws(() => createStopRules(fixture(), context, { dwellS: NaN }));
  const rules = createStopRules(fixture(), { sessionId: 's'.repeat(256), worldEpoch: 0 });
  const events = rules.observe(
    sample(0, 7.5, 0, {
      sessionId: 's'.repeat(256),
      vehicleId: 'v'.repeat(256),
      incarnation: 'i'.repeat(256),
    }),
  );
  assert.equal(events[0].type, 'STOP_APPROACH');
  rules.dispose();
});

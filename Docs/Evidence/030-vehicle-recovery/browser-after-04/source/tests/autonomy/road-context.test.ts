import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoadContext, ROAD_CONTEXT_LIMITS } from '../../src/autonomy';
import type { RoadContextEngine } from '../../src/autonomy';
import { createSignalController } from '../../src/world';
import { createEventBus } from '../../src/simulation';
import { roadContextFixture, exhaustiveRoadContext } from './road-context-reference';
import type { ReferenceFrame, ReferenceVehicle } from './road-context-reference';
function setup(dense = false) {
  const fixture = roadContextFixture(dense),
    { map, policy, frame } = fixture;
  const context = {
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId: frame.sessionId,
    worldEpoch: frame.worldEpoch,
  };
  const bus = createEventBus(context),
    signals = createSignalController(map, { context, eventBus: bus });
  const engine = createRoadContext(map, {
    priorityPolicy: policy,
    decisionPeriodTicks: 6,
    queryRadiusM: 60,
  });
  const advance = (tick: number) => {
    for (let next = signals.getStats().tick + 1; next <= tick; next++) signals.step(next);
    frame.tick = tick;
    frame.signals = map.intersections[0].movements.map((movement) =>
      signals.getMovementSignal('junction', movement.id)!,
    );
  };
  return { ...fixture, bus, signals, engine, advance };
}
function read(engine: RoadContextEngine, id = 'vehicle-4', force = false) {
  const value = engine.getContext(id, { force });
  assert.ok(value);
  return value;
}
function projection(value: ReturnType<typeof read>) {
  return {
    tick: value.tick,
    sessionId: value.sessionId,
    worldEpoch: value.worldEpoch,
    subject: value.subject,
    laneId: value.laneId,
    leader: value.leader
      ? { id: value.leader.id, incarnation: value.leader.incarnation, gapM: value.leader.gapM }
      : null,
    signal: value.signal
      ? {
          state: value.signal.state,
          signalId: value.signal.signalId,
          movementId: value.signal.movementId,
          tick: value.signal.tick,
        }
      : null,
    conflictRelationIds: value.conflictRelationIds,
    conflictVehicleIds: value.conflictVehicleIds,
    obstacleIds: value.obstacleIds,
    zoneIds: value.zoneIds,
  };
}
test('normal/dense contexts match exhaustive IDs, lanes, leaders, signals and conflicts at real authoritative ticks', () => {
  for (const dense of [false, true]) {
    const { map, graph, conflicts, frame, engine, advance, bus, signals } = setup(dense);
    for (const tick of [0, 1, 30, 59, 60, 61, 99]) {
      advance(tick);
      frame.vehicles[tick % frame.vehicles.length].incarnation++;
      engine.updateFrame(frame);
      for (const actor of frame.vehicles)
        assert.deepEqual(
          projection(read(engine, actor.id, true)),
          exhaustiveRoadContext(map, graph, conflicts, frame, actor.id),
        );
    }
    engine.dispose();
    signals.dispose();
    bus.dispose();
  }
});
test('lateral, opposite-direction and overpass vehicles never become false leaders', () => {
  const { map, policy, frame } = roadContextFixture(false),
    subject = { ...frame.vehicles[4], positionM: { x: -110, y: 0, z: -20 }, distances: [] };
  const actor = (
    id: string,
    positionM: ReferenceVehicle['positionM'],
    headingRad: number,
  ): ReferenceVehicle => ({ ...subject, id, positionM, headingRad, route: null });
  frame.vehicles = [
    subject,
    actor('correct', { x: -105, y: 0, z: -20 }, 0),
    actor('deck', { x: -108, y: 12, z: -20 }, 0),
    actor('opposite', { x: -109, y: 0, z: -20 }, Math.PI),
    actor('lateral', { x: -110, y: 0, z: 16 }, Math.atan2(-40, -100)),
  ];
  const engine = createRoadContext(map, { priorityPolicy: policy, queryRadiusM: 200 });
  engine.updateFrame(frame);
  const context = read(engine);
  assert.equal(context.laneId, 'west-in');
  assert.equal(context.leader?.id, 'correct');
  assert.ok(context.nearbyVehicleIds.includes('deck'));
  assert.ok(context.nearbyVehicleIds.includes('lateral'));
});
test('cached context keeps source tick; urgent signal refresh occurs before six-tick cadence without clock/event resampling', () => {
  const { frame, engine, advance, bus, signals } = setup();
  let events = 0;
  bus.subscribe(() => {
    events++;
    return undefined;
  });
  advance(59);
  engine.updateFrame(frame);
  const original = read(engine);
  assert.equal(original.signal?.state, 'RED');
  advance(60);
  engine.updateFrame(frame);
  assert.strictEqual(read(engine), original);
  assert.equal(read(engine).tick, 59);
  assert.equal(engine.getStats().tick, 60);
  assert.equal(events, 1);
  assert.equal(engine.invalidate('vehicle-4', 0), false);
  assert.equal(engine.invalidate('vehicle-4', 1), true);
  const urgent = read(engine);
  assert.equal(urgent.tick, 60);
  assert.equal(urgent.signal?.state, 'GREEN');
  assert.equal(original.tick, 59);
  assert.equal(original.signal?.state, 'RED');
  for (let i = 0; i < 10; i++) read(engine, 'vehicle-4', true);
  assert.equal(events, 1);
  assert.equal(signals.getStats().tick, 60);
  assert.equal(bus.getStats().retainedEvents, 1);
  advance(65);
  engine.updateFrame(frame);
  assert.equal(read(engine).tick, 60);
  advance(66);
  engine.updateFrame(frame);
  assert.equal(read(engine).tick, 66);
});
test('frame admission is atomic, duplicate snapshots canonical, contradictory/stale signal snapshots rejected', () => {
  const { frame, engine, advance } = setup();
  engine.updateFrame(frame);
  read(engine);
  const before = engine.getStats(),
    reordered = structuredClone(frame);
  reordered.vehicles.reverse();
  reordered.obstacles.reverse();
  reordered.zones.reverse();
  reordered.signals.reverse();
  engine.updateFrame(reordered);
  assert.deepEqual(engine.getStats(), before);
  const conflict = structuredClone(frame);
  conflict.vehicles[4].speedMps++;
  assert.throws(() => engine.updateFrame(conflict), /Conflicting/);
  assert.deepEqual(engine.getStats(), before);
  advance(1);
  const stale = structuredClone(frame);
  stale.signals[0] = { ...stale.signals[0], tick: 0 };
  assert.throws(() => engine.updateFrame(stale), /Stale.*signal/);
  assert.deepEqual(engine.getStats(), before);
  const contradictory = structuredClone(frame);
  contradictory.signals[0] = { ...contradictory.signals[0], state: 'GREEN' };
  assert.throws(() => engine.updateFrame(contradictory), /contradictory/);
  assert.deepEqual(engine.getStats(), before);
  const mixed = structuredClone(frame);
  // Preserve authored state for this movement; phase mixture remains invalid.
  mixed.signals[0] = {
    ...mixed.signals[0],
    phaseId: 'fixture-green',
    state: mixed.signals[0].movementId === 'west-straight' ? 'GREEN' : 'RED',
  };
  assert.throws(() => engine.updateFrame(mixed), /Mixed/);
  assert.deepEqual(engine.getStats(), before);
});
test('unknown intent, offroad intent and absent/incomplete signals remain unknown, while junction intent selects the concrete movement', () => {
  const { frame, engine, advance } = setup();
  frame.vehicles[4].route = null;
  engine.updateFrame(frame);
  assert.equal(read(engine).signal, null);
  assert.equal(read(engine).signalStatus, 'UNKNOWN_ROUTE');
  advance(1);
  frame.vehicles[4].route = { intersectionId: 'junction', movementId: 'west-straight' };
  frame.vehicles[4].positionM = { x: -280, y: 0, z: 0 };
  engine.updateFrame(frame);
  assert.equal(read(engine, 'vehicle-4', true).signalStatus, 'UNKNOWN_ROUTE');
  advance(2);
  frame.vehicles[4].positionM = { x: 0, y: 0, z: 0 };
  engine.updateFrame(frame);
  assert.equal(read(engine, 'vehicle-4', true).laneId, null);
  assert.equal(read(engine).signal?.movementId, 'west-straight');
  advance(3);
  frame.completeness.signals = false;
  frame.signals = [];
  engine.updateFrame(frame);
  assert.equal(read(engine, 'vehicle-4', true).signalStatus, 'MISSING_OBSERVATION');
  assert.equal(read(engine).signal, null);
});
test('a concrete route with incompatible current lane or access never makes its signal applicable', () => {
  const { map, policy, frame } = roadContextFixture(false);
  frame.vehicles[4].route = { intersectionId: 'junction', movementId: 'south-straight' };
  frame.vehicles[4].distances = [];
  const mismatch = createRoadContext(map, { priorityPolicy: policy });
  mismatch.updateFrame(frame);
  assert.equal(read(mismatch).signalStatus, 'UNKNOWN_ROUTE');
  assert.equal(read(mismatch).signal, null);
  const fixture = roadContextFixture(false);
  fixture.map.lanes.find((lane) => lane.id === 'east-out')!.access = ['CIVIL'];
  const access = createRoadContext(fixture.map, { priorityPolicy: fixture.policy });
  access.updateFrame(fixture.frame);
  assert.equal(read(access).signalStatus, 'UNKNOWN_ROUTE');
  assert.equal(read(access).conflictRelationIds.length, 0);
  const junction = roadContextFixture(false);
  junction.map.lanes.find((lane) => lane.id === 'west-in')!.access = ['TAXI'];
  junction.map.serviceZones[0].access = ['TAXI'];
  junction.frame.vehicles[4].access = 'CIVIL';
  junction.frame.vehicles[4].positionM = { x: 0, y: 0, z: 0 };
  const inside = createRoadContext(junction.map, { priorityPolicy: junction.policy });
  inside.updateFrame(junction.frame);
  assert.equal(read(inside).laneId, null);
  assert.equal(read(inside).signalStatus, 'UNKNOWN_ROUTE');
  assert.equal(read(inside).signal, null);
});
test('priority uses explicit038 policy and supplied SI distances; local or incomplete traffic never creates a global AVAILABLE gap', () => {
  const { frame, engine, advance, conflicts } = setup();
  engine.updateFrame(frame);
  const context = read(engine);
  assert.ok(context.priorityRelations.length > 0);
  for (const relation of context.priorityRelations) {
    assert.equal(relation.policyKnown, true);
    assert.equal(relation.subjectArrival?.timeToEntryS, 10 / 8);
    assert.equal(relation.subjectArrival?.timeToExitS, 15 / 8);
    assert.equal(relation.gap, 'UNKNOWN');
    assert.equal(relation.coverage, 'LOCAL_ONLY');
  }
  advance(1);
  frame.vehicles[4].distances = [];
  frame.completeness.vehicles = false;
  engine.updateFrame(frame);
  assert.equal(read(engine, 'vehicle-4', true).completeness.vehicles, false);
  assert.ok(
    read(engine).priorityRelations.every(
      (relation) => relation.subjectArrival === null && relation.gap === 'UNKNOWN',
    ),
  );
  advance(2);
  const foreign = structuredClone(frame);
  foreign.vehicles[4].distances = [
    { relationId: 'foreign-relation', distanceM: 10, clearanceM: 5 },
  ];
  const before = engine.getStats();
  assert.throws(() => engine.updateFrame(foreign), /foreign/);
  assert.deepEqual(engine.getStats(), before);
  frame.vehicles[4].distances = conflicts
    .getIncompatible('junction', 'west-straight')
    .map((relation) => ({ relationId: relation.id, distanceM: -1, clearanceM: 5 }));
  (frame as ReferenceFrame & { discontinuity?: boolean }).discontinuity = true;
  engine.updateFrame(frame);
  assert.ok(read(engine).priorityRelations.every((relation) => relation.subjectArrival === null));
});
test('missing policy is explicit unknown; supplied distances change instantaneous predictions without producing temporal evidence', () => {
  const { map, frame } = roadContextFixture(false),
    engine = createRoadContext(map);
  engine.updateFrame(frame);
  assert.ok(
    read(engine).priorityRelations.every(
      (relation) => !relation.policyKnown && relation.priorityMovementId === null,
    ),
  );
  frame.tick = 1;
  frame.signals = frame.signals.map((signal) => ({ ...signal, tick: 1 }));
  frame.vehicles[4].distances.forEach((distance) => {
    distance.distanceM = 20;
  });
  engine.updateFrame(frame);
  assert.equal(
    read(engine, 'vehicle-4', true).priorityRelations[0].subjectArrival?.timeToEntryS,
    20 / 8,
  );
});
test('session, epoch, incarnation and removal fences prevent stale contexts from surviving reuse', () => {
  const { frame, engine, advance } = setup();
  engine.updateFrame(frame);
  const old = read(engine);
  advance(1);
  frame.vehicles = frame.vehicles.filter((actor) => actor.id !== 'vehicle-4');
  engine.updateFrame(frame);
  assert.equal(engine.getContext('vehicle-4'), null);
  assert.equal(engine.invalidate('vehicle-4', 1), false);
  advance(2);
  const stale = structuredClone(frame);
  const initial = roadContextFixture(false).frame.vehicles[4];
  stale.vehicles.push(initial);
  assert.throws(() => engine.updateFrame(stale), /incarnation/);
  initial.incarnation = 2;
  frame.vehicles.push(initial);
  engine.updateFrame(frame);
  assert.equal(read(engine).subject.incarnation, 2);
  assert.notStrictEqual(read(engine), old);
  const priorEpoch = structuredClone(frame);
  engine.reset(frame.sessionId, 1);
  assert.throws(() => engine.updateFrame(priorEpoch), /world/);
  const next = roadContextFixture(false).frame;
  next.worldEpoch = 1;
  engine.updateFrame(next);
  assert.equal(read(engine).worldEpoch, 1);
  const foreign = structuredClone(next);
  foreign.sessionId = 'another-session';
  assert.throws(() => engine.updateFrame(foreign), /world/);
  engine.reset('another-session', 0);
  foreign.worldEpoch = 0;
  engine.updateFrame(foreign);
  assert.equal(read(engine).sessionId, 'another-session');
});
test('capacity checks preserve prior ownership and all admitted dense contexts fit the110-entry cache', () => {
  const { frame, engine, advance } = setup(true);
  engine.updateFrame(frame);
  for (const actor of frame.vehicles) read(engine, actor.id);
  assert.equal(engine.getStats().cachedContexts, 110);
  assert.equal(engine.getStats().laneProjections, 110);
  const before = engine.getStats();
  advance(1);
  frame.vehicles.push({ ...frame.vehicles[4], id: 'overflow' });
  assert.throws(() => engine.updateFrame(frame), /admission/);
  assert.deepEqual(engine.getStats(), before);
  assert.equal(ROAD_CONTEXT_LIMITS.cacheEntries, 110);
});
test('twenty reset/lifecycle cycles clear frame/index/cache/identity ownership; returned snapshots stay frozen', () => {
  const { map, policy, frame } = roadContextFixture(true),
    engine = createRoadContext(map, { priorityPolicy: policy });
  for (let epoch = 0; epoch < 20; epoch++) {
    frame.worldEpoch = epoch;
    engine.updateFrame(frame);
    for (const actor of frame.vehicles) read(engine, actor.id);
    assert.ok(Object.isFrozen(read(engine)));
    const snapshot = read(engine);
    assert.throws(() => {
      (snapshot.subject as { incarnation: number }).incarnation = 999;
    }, TypeError);
    engine.reset(frame.sessionId, epoch + 1);
    const stats = engine.getStats();
    assert.equal(stats.vehicles, 0);
    assert.equal(stats.cachedContexts, 0);
    assert.equal(stats.laneProjections, 0);
    assert.equal(stats.identities, 0);
    assert.equal(stats.invalidatedContexts, 0);
    assert.equal(stats.index.entities, 0);
    assert.equal(stats.index.spatialReferences, 0);
    assert.equal(stats.index.cells, 0);
    // reset already selected the next epoch; update in that exact scope on next cycle.
    frame.worldEpoch = epoch + 1;
  }
  engine.dispose();
  engine.dispose();
  assert.equal(engine.getStats().disposed, true);
  assert.throws(() => engine.updateFrame(frame), /disposed/);
  assert.throws(() => engine.getContext('vehicle-4'), /disposed/);
});
test('hostile data and duplicates are rejected without invoking accessors or retaining partial frame state', () => {
  const { frame, engine } = setup();
  engine.updateFrame(frame);
  const before = engine.getStats();
  let reads = 0;
  const hostile = { ...frame };
  Object.defineProperty(hostile, 'tick', {
    enumerable: true,
    get() {
      reads++;
      return 1;
    },
  });
  assert.throws(() => engine.updateFrame(hostile));
  assert.equal(reads, 0);
  assert.deepEqual(engine.getStats(), before);
  const duplicate = structuredClone(frame);
  duplicate.vehicles.push(duplicate.vehicles[4]);
  assert.throws(() => engine.updateFrame(duplicate), /Duplicate/);
  const invalid = structuredClone(frame);
  invalid.vehicles[4].positionM = { ...invalid.vehicles[4].positionM, x: NaN };
  assert.throws(() => engine.updateFrame(invalid), /number/);
  assert.deepEqual(engine.getStats(), before);
});
test('deep obstacle and polygon accessors and inherited array methods never execute during frame preparation', () => {
  const { frame, engine, advance } = setup();
  engine.updateFrame(frame);
  const before = engine.getStats();
  advance(1);
  let reads = 0;
  for (const field of ['radiusM', 'centerM'] as const) {
    const hostile = structuredClone(frame),
      shape = hostile.obstacles[0].shape;
    Object.defineProperty(shape, field, {
      enumerable: true,
      get() {
        reads++;
        engine.reset(frame.sessionId, 1);
        return 1;
      },
    });
    assert.throws(() => engine.updateFrame(hostile));
    assert.equal(reads, 0);
    assert.deepEqual(engine.getStats(), before);
  }
  const polygon = structuredClone(frame);
  const shape = polygon.zones[0].shape;
  assert.equal(shape.type, 'PRISM');
  if (shape.type === 'PRISM')
    Object.defineProperty(shape.verticesM[0], 'x', {
      enumerable: true,
      get() {
        reads++;
        return 0;
      },
    });
  assert.throws(() => engine.updateFrame(polygon));
  assert.equal(reads, 0);
  assert.deepEqual(engine.getStats(), before);
  const inherited = structuredClone(frame),
    prototype = Object.create(Array.prototype) as object;
  Object.defineProperty(prototype, 'map', {
    get() {
      reads++;
      return () => [];
    },
  });
  Object.setPrototypeOf(inherited.vehicles, prototype);
  assert.throws(() => engine.updateFrame(inherited), /prototype/);
  assert.equal(reads, 0);
  assert.deepEqual(engine.getStats(), before);
});
test('obstacle/zone identities fence stale positions and removed incarnations; kinds remain stable within an epoch', () => {
  const { frame, engine, advance } = setup();
  frame.obstacles[0].incarnation = 2;
  frame.zones[0].incarnation = 2;
  engine.updateFrame(frame);
  for (const domain of ['obstacles', 'zones'] as const) {
    advance(frame.tick + 1);
    const bad = structuredClone(frame);
    bad[domain][0].incarnation = 1;
    const before = engine.getStats();
    assert.throws(() => engine.updateFrame(bad), /incarnation/);
    assert.deepEqual(engine.getStats(), before);
  }
  engine.updateFrame(frame);
  const removedObstacle = frame.obstacles.shift()!,
    removedZone = frame.zones.shift()!;
  advance(frame.tick + 1);
  engine.updateFrame(frame);
  assert.equal(engine.getStats().retiredIdentities, 2);
  advance(frame.tick + 1);
  const stale = structuredClone(frame);
  stale.obstacles.push(removedObstacle);
  stale.zones.push(removedZone);
  assert.throws(() => engine.updateFrame(stale), /incarnation/);
  removedObstacle.incarnation++;
  removedZone.incarnation++;
  frame.obstacles.push(removedObstacle);
  frame.zones.push(removedZone);
  engine.updateFrame(frame);
  assert.equal(engine.getStats().retiredIdentities, 0);
  advance(frame.tick + 1);
  const kind = structuredClone(frame),
    obstacle = kind.obstacles.pop()!;
  kind.zones.push({
    id: obstacle.id,
    incarnation: obstacle.incarnation + 1,
    kind: 'ZONE',
    shape: {
      type: 'PRISM',
      minHeightM: 0,
      maxHeightM: 1,
      verticesM: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 1, y: 0, z: 1 },
        { x: 0, y: 0, z: 1 },
      ],
    },
  });
  assert.throws(() => engine.updateFrame(kind), /kind/);
});
test('partial observation omissions preserve identities without creating removal tombstones', () => {
  const { frame, engine, advance } = setup();
  engine.updateFrame(frame);
  const obstacle = frame.obstacles.shift()!,
    zone = frame.zones.shift()!,
    vehicle = frame.vehicles.shift()!;
  frame.completeness = { vehicles: false, obstacles: false, zones: false, signals: true };
  advance(1);
  engine.updateFrame(frame);
  assert.equal(engine.getStats().retiredIdentities, 0);
  frame.obstacles.push(obstacle);
  frame.zones.push(zone);
  frame.vehicles.push(vehicle);
  advance(2);
  engine.updateFrame(frame);
  assert.equal(engine.getStats().retiredIdentities, 0);
  assert.equal(read(engine).completeness.vehicles, false);
});
test('per-epoch identity history has finite admission without dropping retained tombstones', () => {
  const { frame, engine, advance } = setup();
  const original = frame.vehicles[4];
  frame.obstacles = [];
  frame.zones = [];
  for (let i = 0; i < ROAD_CONTEXT_LIMITS.identitiesPerEpoch; i++) {
    advance(i);
    frame.vehicles = [{ ...original, id: `identity-${i}`, incarnation: 1 }];
    engine.updateFrame(frame);
  }
  const before = engine.getStats();
  assert.equal(before.identities, 1024);
  assert.equal(before.retiredIdentities, 1023);
  advance(1024);
  frame.vehicles = [{ ...original, id: 'over-cap', incarnation: 1 }];
  assert.throws(() => engine.updateFrame(frame), /identity admission/);
  assert.deepEqual(engine.getStats(), before);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { readMinimapFrame, readMinimapGeometry } from '../../src/app';
import {
  createMinimapScene,
  createMinimapTransform,
  formatDistanceM,
  formatDuration,
  MINIMAP_LIMITS,
  MINIMAP_VERSION,
  parseMinimapFrame,
  projectMinimap,
  projectMinimapPoint,
} from '../../src/ui';
import type { MinimapFrame, MinimapMarker } from '../../src/ui';
import {
  createEtaWorld,
  disposeEtaWorld,
  etaObservation,
  graphOf,
  laneStart,
  rideOf,
} from '../fleet/eta-fixture';
import { runMinimapReport } from '../app/minimap-report';
import {
  createMinimapHarness,
  frame,
  lastFrameCalls,
  readyRoute,
  root,
  route,
  sceneOf,
  twoZoneMap,
} from './minimap-fixture';

function marker(markers: readonly MinimapMarker[], role: MinimapMarker['role']): MinimapMarker {
  const found = markers.find((entry) => entry.role === role);
  if (!found) throw new Error(`Missing ${role} marker`);
  return found;
}

function near(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test('074 north-up world-to-map transform is one deterministic uniform projection', () => {
  const transform = createMinimapTransform(
      { minM: { x: -5, z: -5 }, maxM: { x: 25, z: 25 } },
      { widthPx: 240, heightPx: 240, paddingPx: 10 },
    ),
    scale = 220 / 30;
  assert.equal(transform.scale, scale);
  assert.deepEqual(projectMinimapPoint(transform, { x: 10, z: 10 }), { x: 120, y: 120 });
  const southWest = projectMinimapPoint(transform, { x: -5, z: -5 }),
    northEast = projectMinimapPoint(transform, { x: 25, z: 25 });
  near(southWest.x, 10);
  near(southWest.y, 230);
  near(northEast.x, 230);
  near(northEast.y, 10);
  // +Z (north) must move up the canvas, +X (east) must move right.
  assert.ok(projectMinimapPoint(transform, { x: 10, z: 20 }).y < 120);
  assert.ok(projectMinimapPoint(transform, { x: 20, z: 10 }).x > 120);
  // A non-square viewport keeps the same metres-per-pixel on both axes and fits inside padding.
  const tall = createMinimapTransform(
      { minM: { x: 0, z: 0 }, maxM: { x: 100, z: 100 } },
      { widthPx: 240, heightPx: 120, paddingPx: 10 },
    ),
    left = projectMinimapPoint(tall, { x: 0, z: 0 }),
    right = projectMinimapPoint(tall, { x: 100, z: 100 });
  assert.equal(tall.scale, 1, 'the limiting axis fixes one uniform scale');
  near(left.x, 70);
  near(left.y, 110);
  near(right.x, 170);
  near(right.y, 10);
  assert.throws(() => createMinimapTransform({ minM: { x: 0, z: 0 }, maxM: { x: 0, z: 5 } }));
});

test('074 static layer reads the real directed map geometry once and invents nothing', () => {
  const scene = sceneOf(twoZoneMap());
  assert.equal(scene.graph.mapId, scene.map.mapId);
  assert.equal(scene.geometry.mapId, scene.map.mapId);
  assert.equal(scene.geometry.lanes.length, scene.map.lanes.length);
  assert.equal(scene.geometry.intersections.length, scene.map.intersections.length);
  assert.equal(scene.geometry.zones.length, scene.map.serviceZones.length);
  const minimapScene = createMinimapScene(scene.geometry);
  assert.equal(minimapScene.stats.lanes, scene.map.lanes.length);
  assert.equal(minimapScene.stats.roads, 3);
  assert.equal(minimapScene.stats.intersections, 1);
  assert.equal(minimapScene.stats.zones, 2);
  assert.equal(minimapScene.stats.movements, 1);
  for (const lane of scene.map.lanes) {
    const real = scene.graph.getDirectedPath(lane.id);
    assert.ok(real);
    const projected = minimapScene.lanes.get(lane.id);
    assert.ok(projected);
    assert.deepEqual(
      projected.map((point) => ({ x: point.x, z: point.z })),
      real.points.map((point) => ({ x: point.x, z: point.z })),
      `lane ${lane.id} must keep its real directed geometry`,
    );
  }
  const roadPoints = minimapScene.staticCommands
    .filter((command) => command.kind === 'road')
    .flatMap((command) => command.points);
  assert.equal(roadPoints.length, 2 + 2 + 3);
  const first = minimapScene.staticCommands.find((command) => command.kind === 'road');
  assert.ok(first?.kind === 'road');
  near(first.points[0]!.x, projectMinimapPoint(minimapScene.transform, { x: 0, z: 0 }).x);
  assert.equal(minimapScene.staticCommands.filter((command) => command.kind === 'area').length, 1);
});

test('074 route traces exactly the certified lane ids, including real junction movement', () => {
  const scene = createMinimapScene(sceneOf(twoZoneMap()).geometry),
    projection = projectMinimap(
      scene,
      frame({
        taxi: { vehicleId: 'taxi:074:A', slot: 3 },
        ride: {
          rideId: 'ride:074',
          taxiId: 'taxi:074:A',
          state: 'TO_PICKUP',
          pickupZoneId: 'service',
          dropoffZoneId: 'service-2',
        },
        route: readyRoute(['lane-a', 'lane-b']),
      }),
    ),
    routeCommand = projection.dynamicCommands.find((command) => command.kind === 'route');
  assert.ok(routeCommand?.kind === 'route');
  assert.deepEqual(routeCommand.laneIds, ['lane-a', 'lane-b']);
  // lane-a (0,0)-(9,0), real movement (9,0)-(11,0), lane-b (11,0)-(20,0).
  const expected = [
    { x: 0, z: 0 },
    { x: 9, z: 0 },
    { x: 11, z: 0 },
    { x: 20, z: 0 },
  ].map((point) => projectMinimapPoint(scene.transform, point));
  assert.deepEqual(routeCommand.points, expected);
  assert.equal(projection.route.status, 'READY');
  assert.deepEqual(projection.route.laneIds, ['lane-a', 'lane-b']);
  // lane-c is real map geometry but is not part of the certified route and must not be drawn.
  const laneC = scene.lanes.get('lane-c')!,
    forbidden = projectMinimapPoint(scene.transform, laneC[1]!);
  assert.ok(
    !routeCommand.points.some(
      (point) => Math.abs(point.x - forbidden.x) < 1e-9 && Math.abs(point.y - forbidden.y) < 1e-9,
    ),
  );
  const missing = projectMinimap(
    scene,
    frame({ route: readyRoute(['lane-a', 'lane-that-does-not-exist']) }),
  );
  assert.equal(missing.route.status, 'NO_ROUTE');
  assert.equal(missing.route.reason, 'ROUTE_MISSING');
  assert.equal(missing.dynamicCommands.length, 0, 'a partial invented route is not drawn');
});

test('074 taxi marker uses the real position and heading, never snapping to the route', () => {
  const scene = createMinimapScene(sceneOf(twoZoneMap()).geometry),
    position = { x: 15, y: 0, z: -4 },
    projection = projectMinimap(
      scene,
      frame({
        taxi: { vehicleId: 'taxi:074:A', slot: 3 },
        positionM: position,
        headingRad: 0,
        route: readyRoute(['lane-a']),
      }),
    ),
    taxi = marker(projection.markers, 'TAXI'),
    expected = projectMinimapPoint(scene.transform, position);
  near(taxi.x, expected.x);
  near(taxi.y, expected.y);
  assert.equal(taxi.headingRad, 0);
  const realRoutePoints = scene.lanes.get('lane-a')!;
  assert.ok(
    !realRoutePoints.some(
      (point) => Math.abs(point.x - position.x) < 1e-9 && Math.abs(point.z - position.z) < 1e-9,
    ),
  );
  const harness = createMinimapHarness(sceneOf(twoZoneMap()).geometry);
  harness.minimap.update(
    frame({
      taxi: { vehicleId: 'taxi:074:A', slot: 3 },
      positionM: { x: 0, y: 0, z: 0 },
      headingRad: 0,
      route: readyRoute(['lane-a']),
    }),
    0,
  );
  let lines = lastFrameCalls(harness.dynamicLayer).filter((call) => call.op === 'lineTo');
  const start = lastFrameCalls(harness.dynamicLayer)
      .filter((call) => call.op === 'moveTo')
      .at(-1)!,
    arc = lastFrameCalls(harness.dynamicLayer).find((call) => call.op === 'arc')!;
  near(Number(arc.args[0]), Number(start.args[0]));
  near(Number(lines.at(-1)!.args[0]), Number(arc.args[0]) + 11);
  near(Number(lines.at(-1)!.args[1]), Number(arc.args[1]));
  harness.minimap.update(
    frame({
      taxi: { vehicleId: 'taxi:074:A', slot: 3 },
      positionM: { x: 0, y: 0, z: 0 },
      headingRad: Math.PI / 2,
      tick: 11,
    }),
    120,
  );
  lines = lastFrameCalls(harness.dynamicLayer).filter((call) => call.op === 'lineTo');
  const secondArc = lastFrameCalls(harness.dynamicLayer).find((call) => call.op === 'arc')!;
  near(Number(lines.at(-1)!.args[0]), Number(secondArc.args[0]));
  near(Number(lines.at(-1)!.args[1]), Number(secondArc.args[1]) - 11);
  harness.minimap.dispose();
});

test('074 pickup and dropoff markers come from the ride zones and are never swapped', () => {
  const scene = createMinimapScene(sceneOf(twoZoneMap()).geometry),
    base = frame({
      taxi: { vehicleId: 'taxi:074:A', slot: 3 },
      ride: {
        rideId: 'ride:074',
        taxiId: 'taxi:074:A',
        state: 'TO_PICKUP',
        pickupZoneId: 'service',
        dropoffZoneId: 'service-2',
      },
    }),
    projection = projectMinimap(scene, base),
    pickup = marker(projection.markers, 'PICKUP'),
    dropoff = marker(projection.markers, 'DROPOFF'),
    pickupPoint = projectMinimapPoint(scene.transform, { x: 0, z: 0 }),
    dropoffPoint = projectMinimapPoint(scene.transform, { x: 20, z: 0 });
  assert.equal(pickup.label, 'P');
  assert.equal(dropoff.label, 'D');
  assert.equal(pickup.zoneId, 'service');
  assert.equal(dropoff.zoneId, 'service-2');
  near(pickup.x, pickupPoint.x);
  near(pickup.y, pickupPoint.y);
  near(dropoff.x, dropoffPoint.x);
  near(dropoff.y, dropoffPoint.y);
  assert.ok(
    Math.abs(pickup.x - dropoff.x) > 1 || Math.abs(pickup.y - dropoff.y) > 1,
    'the two markers must be distinct',
  );
  const swapped = projectMinimap(
    scene,
    frame({
      ...base,
      ride: { ...base.ride!, pickupZoneId: 'service-2', dropoffZoneId: 'service' },
    }),
  );
  near(marker(swapped.markers, 'PICKUP').x, dropoffPoint.x);
  near(marker(swapped.markers, 'DROPOFF').x, pickupPoint.x);
  const missing = projectMinimap(
    scene,
    frame({ ...base, ride: { ...base.ride!, dropoffZoneId: 'zone:absent' } }),
  );
  assert.equal(missing.markers.filter((entry) => entry.role === 'DROPOFF').length, 0);
  assert.match(missing.description, /zone:absent: zona lipsește din hartă/);
  assert.match(projection.description, /Ridicare la zona service; predare la zona service-2/);
});

test('074 a replanned or stale route replaces the drawn route instead of leaving it behind', () => {
  const harness = createMinimapHarness(sceneOf(twoZoneMap()).geometry),
    first = frame({
      taxi: { vehicleId: 'taxi:074:A', slot: 3 },
      ride: {
        rideId: 'ride:074',
        taxiId: 'taxi:074:A',
        state: 'TO_PICKUP',
        pickupZoneId: 'service',
        dropoffZoneId: 'service-2',
      },
      route: readyRoute(['lane-a', 'lane-b']),
    });
  harness.minimap.update(first, 0);
  assert.equal(root(harness).getAttribute('data-route'), 'READY');
  assert.equal(harness.minimap.getStats().routeLanes, 2);
  const stale: MinimapFrame = {
    ...first,
    tick: 11,
    ride: null,
    route: route({ status: 'NO_ROUTE', reason: 'ROUTE_STALE' }),
  };
  harness.dynamicLayer.reset();
  harness.minimap.update(stale, 10);
  const staleCalls = lastFrameCalls(harness.dynamicLayer);
  assert.equal(
    staleCalls.filter((call) => call.op === 'lineTo').length,
    0,
    'the old route must not survive a stale replan',
  );
  assert.equal(root(harness).getAttribute('data-route'), 'NO_ROUTE');
  assert.match(root(harness).children[3]!.textContent, /ROUTE_STALE/);
  assert.equal(harness.minimap.getStats().routeLanes, 0);
  const replanned: MinimapFrame = {
    ...first,
    tick: 12,
    ride: null,
    route: readyRoute(['lane-c'], { progressFraction: 0, remainingDistanceM: 400 }),
  };
  harness.dynamicLayer.reset();
  harness.minimap.update(replanned, 20);
  assert.equal(harness.minimap.getStats().routeLanes, 1);
  assert.equal(root(harness).getAttribute('data-route'), 'READY');
  const scene = createMinimapScene(sceneOf(twoZoneMap()).geometry),
    projection = projectMinimap(scene, replanned),
    line = projection.dynamicCommands.find((command) => command.kind === 'route');
  assert.ok(line?.kind === 'route');
  assert.deepEqual(line.laneIds, ['lane-c']);
  const oldPoint = projectMinimapPoint(scene.transform, { x: 9, z: 0 }),
    newPoints = line.points;
  assert.ok(
    !newPoints.some(
      (point) => Math.abs(point.x - oldPoint.x) < 1e-9 && Math.abs(point.y - oldPoint.y) < 1e-9,
    ),
  );
  harness.minimap.dispose();
});

test('074 no-route and no-position are explicit states and never crash', () => {
  const harness = createMinimapHarness(sceneOf(twoZoneMap()).geometry),
    empty = frame({
      taxi: { vehicleId: 'taxi:074:A', slot: 3 },
      route: route({ status: 'NO_ROUTE', reason: 'ROUTE_MISSING' }),
    });
  harness.minimap.update(empty, 0);
  assert.equal(root(harness).getAttribute('data-position'), 'MISSING');
  assert.equal(root(harness).getAttribute('data-route'), 'NO_ROUTE');
  const description = root(harness).children[3]!.textContent;
  assert.match(description, /Poziția taxiului nu este disponibilă/);
  assert.match(description, /ROUTE_MISSING/);
  assert.equal(harness.minimap.getStats().routeLanes, 0);
  const noEstimate = frame({
    taxi: { vehicleId: 'taxi:074:A', slot: 3 },
    positionM: { x: 0, y: 0, z: 0 },
    headingRad: 0,
    tick: 11,
  });
  harness.minimap.update(noEstimate, 20);
  assert.equal(root(harness).getAttribute('data-position'), 'AVAILABLE');
  const noEstimateDescription = root(harness).children[3]!.textContent;
  assert.match(noEstimateDescription, /Fără rută: 064 nu a observat încă o estimare/);
  assert.match(noEstimateDescription, /Fără estimare/);
  const scene = createMinimapScene(sceneOf(twoZoneMap()).geometry),
    projection = projectMinimap(scene, empty);
  assert.equal(projection.route.status, 'NO_ROUTE');
  assert.equal(projection.markers.length, 0);
  assert.equal(projection.dynamicCommands.length, 0);
  assert.match(projection.description, /Nicio cursă activă/);
  harness.minimap.dispose();
});

test('074 markers repaint at a bounded rate, bypass identity changes and reuse static geometry', () => {
  const harness = createMinimapHarness(sceneOf(twoZoneMap()).geometry),
    taxi = { vehicleId: 'taxi:074:A', slot: 3 };
  for (let index = 0; index < 60; index += 1)
    harness.minimap.update(
      frame({
        taxi,
        positionM: { x: index * 0.2, y: 0, z: -4 },
        headingRad: 0,
        tick: 10 + index,
        route: readyRoute(['lane-a']),
      }),
      index * 16,
    );
  const stats = harness.minimap.getStats();
  assert.equal(stats.staticPaints, 1, 'static roads are painted once');
  assert.ok((stats.dynamicPaints as number) <= 10, `dynamic paints ${stats.dynamicPaints}`);
  assert.ok((stats.dynamicPaints as number) >= 2);
  assert.ok((stats.skipped as number) > 40);
  const staticCalls = harness.staticLayer.calls;
  assert.equal(
    staticCalls.filter((call) => call.op === 'clearRect').length,
    1,
    'the static canvas is not repainted per frame',
  );
  assert.ok(staticCalls.filter((call) => call.op === 'stroke').length >= 3);
  const afterCapped = harness.minimap.getStats().dynamicPaints as number;
  harness.minimap.update(
    frame({
      taxi: { vehicleId: 'taxi:074:B', slot: 4 },
      positionM: { x: 0, y: 0, z: 0 },
      headingRad: 0,
      tick: 71,
      route: readyRoute(['lane-a']),
    }),
    960,
  );
  assert.equal(
    harness.minimap.getStats().dynamicPaints as number,
    afterCapped + 1,
    'a taxi change is not delayed by the rate limit',
  );
  const identityWrites = harness.minimap.getStats().writes as number;
  harness.minimap.update(
    frame({
      taxi: { vehicleId: 'taxi:074:B', slot: 4 },
      positionM: { x: 0, y: 0, z: 0 },
      headingRad: 0,
      tick: 72,
      route: readyRoute(['lane-a']),
    }),
    970,
  );
  assert.equal(harness.minimap.getStats().writes, identityWrites);
  assert.ok((harness.minimap.getStats().skipped as number) > 41);
  harness.minimap.dispose();
});

test('074 malformed, stale and out-of-clock frames are rejected before drawing', () => {
  assert.throws(() => parseMinimapFrame(frame({ route: readyRoute([]) })), /route lanes/);
  assert.throws(
    () =>
      parseMinimapFrame(
        frame({ route: { ...route(), laneIds: ['lane-a'] } as unknown as MinimapFrame['route'] }),
      ),
    /must not carry lanes/,
  );
  assert.throws(
    () => parseMinimapFrame(frame({ positionM: { x: 0, y: 0, z: 0 } })),
    /position requires a taxi/,
  );
  assert.throws(
    () => parseMinimapFrame(frame({ taxi: { vehicleId: 'taxi:1', slot: 1 }, headingRad: 0 })),
    /heading requires a position/,
  );
  assert.throws(
    () =>
      parseMinimapFrame(
        frame({
          route: readyRoute(['l'], { laneIds: Array.from({ length: 257 }, (_, i) => `l${i}`) }),
        }),
      ),
    /lane ceiling/,
  );
  const harness = createMinimapHarness(sceneOf(twoZoneMap()).geometry);
  const first = frame({
    taxi: { vehicleId: 'taxi:074:A', slot: 3 },
    positionM: { x: 0, y: 0, z: 0 },
    headingRad: 0,
    tick: 10,
  });
  harness.minimap.update(first, 0);
  assert.throws(() => harness.minimap.update({ ...first, tick: 9 }, 10), /Stale/);
  assert.throws(() => harness.minimap.update({ ...first, tick: 11 }, -1), /clock/);
  assert.throws(
    () =>
      harness.minimap.update(
        { ...first, version: '073-taxi-hud-v1' } as unknown as MinimapFrame,
        10,
      ),
    /contract/,
  );
  assert.throws(
    () =>
      harness.minimap.update(
        {
          ...first,
          tick: 11,
          route: readyRoute(['lane-a'], { etaMinSeconds: 200, etaMaxSeconds: 100 }),
        },
        1e9,
      ),
    /inverted/,
  );
  harness.minimap.dispose();
});

test('074 lifecycle is bounded and disposal owns every node', () => {
  const harness = createMinimapHarness(sceneOf(twoZoneMap()).geometry);
  harness.minimap.update(
    frame({
      taxi: { vehicleId: 'taxi:074:A', slot: 3 },
      positionM: { x: 0, y: 0, z: 0 },
      headingRad: 0,
      route: readyRoute(['lane-a']),
    }),
    0,
  );
  assert.equal(harness.minimap.getStats().elements, MINIMAP_LIMITS.elements);
  assert.equal(harness.minimap.getStats().textNodes, MINIMAP_LIMITS.textNodes);
  assert.equal(harness.minimap.getStats().listeners, 0);
  assert.equal(harness.minimap.getStats().retainedFrames, 1);
  harness.minimap.dispose();
  harness.minimap.dispose();
  assert.equal(harness.host.children.length, 0);
  assert.equal(harness.minimap.getStats().elements, 0);
  assert.equal(harness.minimap.getStats().textNodes, 0);
  assert.equal(harness.minimap.getStats().retainedFrames, 0);
  assert.equal(harness.minimap.getStats().disposed, true);
  assert.throws(() => harness.minimap.update(frame({ tick: 10 }), 10), /disposed/);
});

test('074 real 057/061/064 binding drives taxi, route, markers, progress and ETA', () => {
  const world = createEtaWorld();
  try {
    const map = world.rideWorld.dispatcherWorld.map,
      graph = graphOf(world),
      geometry = readMinimapGeometry({ map, graph }),
      scene = createMinimapScene(geometry),
      ride = rideOf(world),
      registry = world.rideWorld.dispatcherWorld.registry,
      estimate = world.eta.observe(etaObservation(world, { speedMps: 8 })),
      position = laneStart(world, world.routeLaneIds[0]!),
      view = readMinimapFrame(
        { fleet: registry, lifecycle: world.rideWorld.lifecycle, eta: world.eta },
        { taxiId: ride.taxiId, tick: 10, positionM: position, headingRad: 0 },
      ),
      projection = projectMinimap(scene, view);
    assert.equal(view.version, MINIMAP_VERSION);
    assert.equal(view.taxi?.vehicleId, ride.taxiId);
    assert.equal(view.ride?.rideId, ride.rideId);
    assert.equal(view.route.status, 'READY');
    assert.deepEqual(view.route.laneIds, estimate.routeLaneIds);
    assert.equal(view.route.progressFraction, estimate.progressFraction);
    assert.equal(view.route.etaSeconds, estimate.etaSeconds);
    assert.equal(projection.etaText, `~${formatDuration(estimate.etaSeconds)}`);
    assert.equal(
      projection.progressText,
      `${Math.round((estimate.progressFraction ?? 0) * 100)}% · ${formatDistanceM(estimate.remainingDistanceM)}`,
    );
    const pickup = geometry.zones.find((zone) => zone.zoneId === ride.pickupZoneId),
      dropoff = geometry.zones.find((zone) => zone.zoneId === ride.dropoffZoneId);
    assert.ok(pickup && dropoff);
    const pickupMarker = marker(projection.markers, 'PICKUP'),
      dropoffMarker = marker(projection.markers, 'DROPOFF'),
      pickupPoint = projectMinimapPoint(scene.transform, pickup.point),
      dropoffPoint = projectMinimapPoint(scene.transform, dropoff.point),
      taxiMarker = marker(projection.markers, 'TAXI');
    near(pickupMarker.x, pickupPoint.x);
    near(pickupMarker.y, pickupPoint.y);
    near(dropoffMarker.x, dropoffPoint.x);
    near(dropoffMarker.y, dropoffPoint.y);
    assert.equal(pickupMarker.zoneId, ride.pickupZoneId);
    assert.equal(dropoffMarker.zoneId, ride.dropoffZoneId);
    near(taxiMarker.x, projectMinimapPoint(scene.transform, position).x);
    const routeCommand = projection.dynamicCommands.find((command) => command.kind === 'route');
    assert.ok(routeCommand?.kind === 'route');
    assert.equal(routeCommand.points.length > 1, true);

    const other = registry
      .list()
      .find((vehicle) => vehicle.driverKind === 'TAXI' && vehicle.vehicleId !== ride.taxiId);
    assert.ok(other);
    const outside = laneStart(world, world.routeLaneIds[world.routeLaneIds.length - 1]!),
      switched = readMinimapFrame(
        { fleet: registry, lifecycle: world.rideWorld.lifecycle, eta: world.eta },
        { taxiId: other.vehicleId, tick: 10, positionM: outside, headingRad: 0 },
      );
    assert.equal(switched.taxi?.vehicleId, other.vehicleId);
    assert.equal(switched.ride, null);
    assert.equal(switched.route.status, 'NO_ROUTE');
    assert.equal(projectMinimap(scene, switched).markers.length, 1);
    const harness = createMinimapHarness(geometry);
    harness.minimap.update(view, 0);
    const paints = harness.minimap.getStats().dynamicPaints as number;
    harness.minimap.update(switched, 10);
    assert.equal(harness.minimap.getStats().dynamicPaints as number, paints + 1);
    assert.equal(root(harness).getAttribute('data-route'), 'NO_ROUTE');
    harness.minimap.dispose();

    world.rideWorld.dispatcherWorld.planner.setBlocked([world.routeLaneIds[0]!]);
    const stale = world.eta.observe(etaObservation(world, { tick: 11, speedMps: 8 })),
      staleView = readMinimapFrame(
        { fleet: registry, lifecycle: world.rideWorld.lifecycle, eta: world.eta },
        { taxiId: ride.taxiId, tick: 11, positionM: position, headingRad: 0 },
      );
    assert.equal(stale.reason, 'ROUTE_STALE');
    assert.equal(staleView.route.status, 'NO_ROUTE');
    assert.equal(staleView.route.reason, 'ROUTE_STALE');
    assert.equal(staleView.route.laneIds, null);
    assert.match(projectMinimap(scene, staleView).description, /ROUTE_STALE/);

    const foreign = readMinimapFrame(
      { fleet: registry, lifecycle: world.rideWorld.lifecycle, eta: world.eta },
      { taxiId: other.vehicleId, tick: 11, positionM: outside, headingRad: 0, rideId: ride.rideId },
    );
    assert.equal(foreign.route.status, 'NO_ROUTE');
    assert.equal(foreign.route.reason, 'FOREIGN_VEHICLE');
    assert.equal(
      projectMinimap(scene, foreign).markers.filter((entry) => entry.role !== 'TAXI').length,
      0,
    );
  } finally {
    disposeEtaWorld(world);
  }
});

test('074 committed evidence report is the current deterministic transcript', () => {
  const report = runMinimapReport(),
    saved = readFileSync(
      join(process.cwd(), 'Docs', 'Evidence', '074-minimap', 'report.json'),
      'utf8',
    );
  assert.equal(report.summary.pass, true);
  assert.equal(saved, `${JSON.stringify(report, null, 2)}\n`);
});

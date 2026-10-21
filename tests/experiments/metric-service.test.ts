import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  METRIC_IDS,
  METRIC_REASONS,
  METRIC_SERVICE_LIMITS,
  METRIC_SERVICE_VERSION,
  METRIC_UNIT_BY_ID,
  createMetricService,
  metricEventKinds,
  metricServiceVersion,
} from '../../src/experiments';
import type { MetricId, MetricSnapshot, MetricValue } from '../../src/experiments';
import { createFleetRegistry } from '../../src/fleet';
import {
  CITY_DASHBOARD_VERSION,
  CITY_METRIC_IDS,
  CITY_METRIC_REASONS,
  CITY_METRIC_UNIT_BY_ID,
  parseCityDashboardSnapshot,
} from '../../src/ui';
import {
  ingestBlockedInterval,
  ingestCollision,
  ingestRideTerminal,
  readMetricSnapshot,
  toCityDashboardMetrics,
} from '../../src/app';
import { CollisionRegistry, createCollisionEpisodes } from '../../src/vehicles';
import type { CollisionIncident } from '../../src/vehicles';
import { createHealthWorld, disposeHealthWorld, rideOf } from '../fleet/fleet-health-fixture';

const FLEET_COUNTS = Object.freeze({ vehicles: 64, taxis: 24, civilians: 40 });

function configuration(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: 'session:137',
    worldEpoch: 0,
    scenarioId: 'city-137',
    seed: 137137,
    namespace: 'city:137:fleet',
    taxiCount: 24,
    civilianCount: 40,
    profile: { profileId: 'city:137', versionId: 'profile-v1' },
    ...overrides,
  };
}

function fleetStub(counts: { vehicles: number; taxis: number; civilians: number } = FLEET_COUNTS): {
  counts: () => typeof counts;
} {
  return { counts: () => Object.freeze({ ...counts }) };
}

function read(
  service: ReturnType<typeof createMetricService>,
  overrides: Record<string, unknown> = {},
): MetricSnapshot {
  return service.snapshot({
    fleet: fleetStub(),
    tick: 100,
    simulatedSeconds: 3600,
    distanceAvailable: true,
    ...overrides,
  });
}

function metric(snapshot: MetricSnapshot, id: MetricId): MetricValue {
  const found = snapshot.metrics.find((entry) => entry.id === id);
  assert.ok(found !== undefined, `missing metric ${id}`);
  return found;
}

function closeTo(actual: number | null, expected: number, epsilon = 1e-9): boolean {
  return actual !== null && Math.abs(actual - expected) <= epsilon;
}

function rideTerminal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventId: 'event:ride:1',
    kind: 'RIDE_TERMINAL',
    rideId: 'ride:1',
    taxiId: 'taxi:1',
    state: 'COMPLETED',
    tick: 10,
    pickupSeconds: 12,
    tripSeconds: 30,
    distanceM: null,
    ...overrides,
  };
}

function distanceEvent(index: number, distanceM: number, tick = index): Record<string, unknown> {
  return {
    eventId: `event:distance:${index}`,
    kind: 'VEHICLE_DISTANCE',
    vehicleId: `taxi:${index}`,
    tick,
    distanceM,
  };
}

test('137 exposes the versioned closed metric contract', () => {
  assert.equal(METRIC_SERVICE_VERSION, '137-metric-service-v1');
  assert.equal(metricServiceVersion, METRIC_SERVICE_VERSION);
  assert.deepEqual(
    [...metricEventKinds],
    ['RIDE_TERMINAL', 'VEHICLE_DISTANCE', 'BLOCKED_INTERVAL', 'COLLISION', 'VIOLATION'],
  );
  assert.deepEqual(
    [...METRIC_IDS],
    [
      'completedRides',
      'failedRides',
      'cancelledRides',
      'terminalRides',
      'completionRate',
      'averagePickupSeconds',
      'averageTripSeconds',
      'totalDistanceM',
      'vehicleKilometres',
      'rideDistanceM',
      'blockedIntervals',
      'blockedSeconds',
      'blockedFraction',
      'collisions',
      'collisionsPer100VehicleKm',
      'violations',
      'violationsPerOpportunity',
    ],
  );
  assert.deepEqual(
    [...METRIC_REASONS],
    ['NO_EXPOSURE', 'NO_RIDES', 'NO_DISTANCE', 'NO_FLEET', 'NO_OPPORTUNITIES'],
  );
  assert.equal(METRIC_UNIT_BY_ID.completionRate, 'percentage');
  assert.equal(METRIC_UNIT_BY_ID.collisionsPer100VehicleKm, 'per100km');
  assert.equal(METRIC_UNIT_BY_ID.averageTripSeconds, 'seconds');
  assert.equal(METRIC_UNIT_BY_ID.vehicleKilometres, 'km');
  assert.equal(METRIC_UNIT_BY_ID.totalDistanceM, 'metres');
  assert.equal(METRIC_UNIT_BY_ID.blockedFraction, 'ratio');
  assert.equal(METRIC_SERVICE_LIMITS.retainedKeys, 8192);
});

test('137 re-ingesting the same event id is a no-op that never double counts', () => {
  const service = createMetricService(),
    event = rideTerminal();
  assert.equal(service.ingest(event).status, 'ACCEPTED');
  const replay = service.ingest({ ...event, tripSeconds: 999, tick: 99 });
  assert.equal(replay.status, 'DUPLICATE');
  assert.equal(replay.eventId, 'event:ride:1');
  assert.equal(replay.reason, null);
  const snapshot = read(service);
  assert.equal(metric(snapshot, 'completedRides').value, 1);
  assert.equal(metric(snapshot, 'averageTripSeconds').value, 30);
  assert.equal(metric(snapshot, 'terminalRides').value, 1);
  const stats = service.getStats();
  assert.equal(stats.events, 2);
  assert.equal(stats.accepted, 1);
  assert.equal(stats.duplicates, 1);
  assert.equal(stats.rejected, 0);
  assert.equal(stats.retainedKeys, 1);
  assert.equal(stats.historyScans, 0);
});

test('137 accepts every closed event kind and aggregates each one', () => {
  const service = createMetricService();
  service.ingestMany([
    rideTerminal(),
    distanceEvent(1, 1500, 11),
    {
      eventId: 'event:blocked:1',
      kind: 'BLOCKED_INTERVAL',
      vehicleId: 'taxi:2',
      tick: 12,
      blockedSeconds: 20,
      reason: 'TRAFFIC_BLOCK',
    },
    {
      eventId: 'event:collision:1',
      kind: 'COLLISION',
      vehicleId: 'taxi:3',
      tick: 13,
      incidentId: 'incident:1',
    },
    {
      eventId: 'event:violation:1',
      kind: 'VIOLATION',
      vehicleId: 'taxi:4',
      tick: 14,
      opportunityId: 'opportunity:1',
      violationKind: 'RED',
    },
  ]);
  const snapshot = read(service, { opportunities: 10 });
  assert.equal(metric(snapshot, 'completedRides').value, 1);
  assert.equal(metric(snapshot, 'vehicleKilometres').value, 1.5);
  assert.equal(metric(snapshot, 'totalDistanceM').value, 1500);
  assert.equal(metric(snapshot, 'blockedSeconds').value, 20);
  assert.equal(metric(snapshot, 'blockedIntervals').value, 1);
  assert.equal(metric(snapshot, 'collisions').value, 1);
  assert.equal(metric(snapshot, 'violations').value, 1);
  assert.equal(metric(snapshot, 'violationsPerOpportunity').value, 0.1);
  assert.equal(metric(snapshot, 'collisionsPer100VehicleKm').unit, 'per100km');
  assert.equal(service.getStats().accepted, 5);
});

test('137 zero exposure is unavailable while a real zero stays available', () => {
  const service = createMetricService();
  const zeroExposure = read(service, { simulatedSeconds: 0 });
  const blockedFraction = metric(zeroExposure, 'blockedFraction');
  assert.equal(blockedFraction.state, 'UNAVAILABLE');
  assert.equal(blockedFraction.value, null);
  assert.equal(blockedFraction.reason, 'NO_EXPOSURE');
  assert.equal(blockedFraction.sampleSize, null);
  assert.equal(metric(zeroExposure, 'blockedSeconds').reason, 'NO_EXPOSURE');
  assert.equal(metric(zeroExposure, 'totalDistanceM').reason, 'NO_EXPOSURE');
  assert.equal(metric(zeroExposure, 'completionRate').reason, 'NO_RIDES');
  assert.equal(metric(zeroExposure, 'collisions').state, 'AVAILABLE');
  assert.equal(metric(zeroExposure, 'collisions').value, 0);

  const withExposure = read(service),
    noDistanceRate = metric(withExposure, 'collisionsPer100VehicleKm');
  assert.equal(noDistanceRate.state, 'UNAVAILABLE');
  assert.equal(noDistanceRate.reason, 'NO_DISTANCE');
  assert.equal(metric(withExposure, 'completionRate').state, 'UNAVAILABLE');
  assert.equal(metric(withExposure, 'completionRate').reason, 'NO_RIDES');
  assert.equal(metric(withExposure, 'completedRides').value, 0);

  const measured = createMetricService();
  measured.ingestMany([distanceEvent(1, 1000), distanceEvent(2, 1000, 2)]);
  const realZero = metric(read(measured), 'collisionsPer100VehicleKm');
  assert.equal(realZero.state, 'AVAILABLE');
  assert.equal(realZero.value, 0);
  assert.equal(realZero.reason, null);
  assert.equal(realZero.sampleSize, 2);
});

test('137 denominators use the whole fleet including hidden vehicles', () => {
  const registry = createFleetRegistry(configuration());
  try {
    assert.deepEqual(registry.counts(), FLEET_COUNTS);
    const service = createMetricService();
    service.ingest({
      eventId: 'event:blocked:whole-fleet',
      kind: 'BLOCKED_INTERVAL',
      vehicleId: 'taxi:hidden',
      tick: 20,
      blockedSeconds: 3600,
      reason: 'IMMOBILIZATION',
    });
    const scanned: string[] = [];
    const spy = {
      counts: () => registry.counts(),
      list: () => {
        scanned.push('list');
        throw new Error('the snapshot must not list the fleet');
      },
      get: () => {
        scanned.push('get');
        throw new Error('the snapshot must not read one vehicle');
      },
    };
    const snapshot = service.snapshot({
      fleet: spy,
      tick: 100,
      simulatedSeconds: 3600,
      distanceAvailable: true,
    });
    assert.deepEqual(scanned, []);
    assert.deepEqual(snapshot.fleet, FLEET_COUNTS);
    assert.equal(snapshot.fleet.vehicles, 64);
    assert.equal(snapshot.fleet.taxis, 24);
    assert.equal(snapshot.fleet.civilians, 40);
    assert.equal(snapshot.fleetVehicleSeconds, 64 * 3600);
    assert.equal(metric(snapshot, 'blockedFraction').value, 3600 / (64 * 3600));
    assert.equal(snapshot.historyScans, 0);
  } finally {
    registry.dispose();
  }
});

test('137 missing rides stay unavailable instead of an apparently perfect rate', () => {
  const service = createMetricService(),
    snapshot = read(service);
  for (const id of ['completionRate', 'averagePickupSeconds', 'averageTripSeconds'] as const) {
    const entry = metric(snapshot, id);
    assert.equal(entry.state, 'UNAVAILABLE');
    assert.equal(entry.value, null);
    assert.equal(entry.reason, 'NO_RIDES');
  }
  assert.equal(metric(snapshot, 'completedRides').value, 0);
  assert.equal(metric(snapshot, 'terminalRides').value, 0);
  assert.equal(metric(snapshot, 'rideDistanceM').reason, 'NO_DISTANCE');
});

test('137 a missing distance source makes every distance rate unavailable', () => {
  const service = createMetricService();
  service.ingestMany([rideTerminal({ distanceM: 1000 }), distanceEvent(1, 2500)]);
  const snapshot = read(service, { distanceAvailable: false });
  for (const id of [
    'totalDistanceM',
    'vehicleKilometres',
    'rideDistanceM',
    'collisionsPer100VehicleKm',
  ] as const) {
    const entry = metric(snapshot, id);
    assert.equal(entry.state, 'UNAVAILABLE', id);
    assert.equal(entry.value, null, id);
    assert.equal(entry.reason, 'NO_DISTANCE', id);
  }
  assert.equal(metric(snapshot, 'completedRides').value, 1);
});

test('137 completion rate is a percentage of the real terminal rides', () => {
  const service = createMetricService();
  service.ingestMany([
    rideTerminal({ eventId: 'event:ride:1', rideId: 'ride:1', state: 'COMPLETED' }),
    rideTerminal({
      eventId: 'event:ride:2',
      rideId: 'ride:2',
      state: 'COMPLETED',
      tick: 11,
    }),
    rideTerminal({ eventId: 'event:ride:3', rideId: 'ride:3', state: 'FAILED', tick: 12 }),
  ]);
  const snapshot = read(service),
    rate = metric(snapshot, 'completionRate');
  assert.equal(rate.unit, 'percentage');
  assert.equal(rate.state, 'AVAILABLE');
  assert.ok(closeTo(rate.value, (2 / 3) * 100));
  assert.equal(rate.sampleSize, 3);
  assert.equal(metric(snapshot, 'failedRides').value, 1);
  assert.equal(metric(snapshot, 'cancelledRides').value, 0);
  assert.equal(metric(snapshot, 'terminalRides').value, 3);
});

test('137 averages pickup and trip durations over their real samples', () => {
  const service = createMetricService();
  service.ingestMany([
    rideTerminal({
      eventId: 'event:ride:1',
      rideId: 'ride:1',
      pickupSeconds: 10,
      tripSeconds: 100,
    }),
    rideTerminal({
      eventId: 'event:ride:2',
      rideId: 'ride:2',
      pickupSeconds: 20,
      tripSeconds: 200,
      tick: 11,
    }),
    rideTerminal({
      eventId: 'event:ride:3',
      rideId: 'ride:3',
      state: 'CANCELLED',
      pickupSeconds: 30,
      tripSeconds: 0,
      tick: 12,
    }),
  ]);
  const snapshot = read(service);
  assert.equal(metric(snapshot, 'averagePickupSeconds').value, 20);
  assert.equal(metric(snapshot, 'averagePickupSeconds').sampleSize, 3);
  assert.equal(metric(snapshot, 'averageTripSeconds').value, 100);
  assert.equal(metric(snapshot, 'averageTripSeconds').sampleSize, 3);
});

test('137 collisions per 100 vehicle-kilometres uses the fleet odometer', () => {
  const service = createMetricService();
  service.ingestMany([
    distanceEvent(1, 2500),
    distanceEvent(2, 2500, 2),
    {
      eventId: 'event:collision:1',
      kind: 'COLLISION',
      vehicleId: 'taxi:1',
      tick: 3,
      incidentId: 'incident:1',
    },
    {
      eventId: 'event:collision:2',
      kind: 'COLLISION',
      vehicleId: 'taxi:2',
      tick: 4,
      incidentId: 'incident:2',
    },
  ]);
  const snapshot = read(service),
    rate = metric(snapshot, 'collisionsPer100VehicleKm');
  assert.equal(metric(snapshot, 'totalDistanceM').value, 5000);
  assert.equal(metric(snapshot, 'vehicleKilometres').value, 5);
  assert.equal(rate.state, 'AVAILABLE');
  assert.equal(rate.value, 40);
  assert.equal(rate.sampleSize, 2);
  assert.equal(metric(snapshot, 'collisions').value, 2);
});

test('137 blocked fraction divides blocked vehicle-seconds by whole fleet exposure', () => {
  const service = createMetricService();
  service.ingest({
    eventId: 'event:blocked:1',
    kind: 'BLOCKED_INTERVAL',
    vehicleId: 'taxi:1',
    tick: 5,
    blockedSeconds: 1152,
    reason: 'TRAFFIC_BLOCK',
  });
  const snapshot = read(service),
    fraction = metric(snapshot, 'blockedFraction');
  assert.equal(metric(snapshot, 'blockedSeconds').value, 1152);
  assert.equal(metric(snapshot, 'blockedSeconds').sampleSize, 1);
  assert.equal(fraction.state, 'AVAILABLE');
  assert.equal(fraction.value, 1152 / (64 * 3600));
  assert.equal(fraction.sampleSize, 1);

  const emptyFleet = read(service, { fleet: fleetStub({ vehicles: 0, taxis: 0, civilians: 0 }) });
  assert.equal(metric(emptyFleet, 'blockedFraction').reason, 'NO_FLEET');
  assert.equal(metric(emptyFleet, 'blockedFraction').value, null);
  assert.equal(metric(emptyFleet, 'totalDistanceM').reason, 'NO_FLEET');
});

test('137 out-of-order events produce the same deterministic aggregates', () => {
  const ordered = createMetricService(),
    shuffled = createMetricService(),
    events = [
      rideTerminal({ eventId: 'event:ride:1', rideId: 'ride:1', tick: 1 }),
      distanceEvent(1, 1000, 2),
      {
        eventId: 'event:collision:1',
        kind: 'COLLISION',
        vehicleId: 'taxi:1',
        tick: 3,
        incidentId: 'incident:1',
      },
    ];
  ordered.ingestMany(events);
  shuffled.ingestMany([events[2], events[0], events[1]]);
  const first = read(ordered),
    second = read(shuffled);
  assert.deepEqual(first.metrics, second.metrics);
  assert.deepEqual(ordered.getStats().minTick, 1);
  assert.deepEqual(ordered.getStats().maxTick, 3);
  assert.equal(shuffled.getStats().minTick, 1);
  assert.equal(shuffled.getStats().maxTick, 3);
  // A late event is still accepted and counted once.
  assert.equal(shuffled.ingest(distanceEvent(2, 500, 0)).status, 'ACCEPTED');
  assert.equal(shuffled.getStats().minTick, 0);
  assert.equal(metric(read(shuffled), 'totalDistanceM').value, 1500);
});

test('137 rejects invalid, negative and malformed events without changing aggregates', () => {
  const service = createMetricService(),
    cases: readonly (readonly [Record<string, unknown>, string])[] = [
      [{ ...rideTerminal(), tripSeconds: -1 }, 'INVALID_NUMBER'],
      [{ ...rideTerminal(), pickupSeconds: Number.NaN }, 'INVALID_NUMBER'],
      [{ ...rideTerminal(), distanceM: Number.POSITIVE_INFINITY }, 'INVALID_NUMBER'],
      [{ ...rideTerminal(), state: 'PENDING' }, 'UNKNOWN_KIND'],
      [{ ...rideTerminal(), kind: 'TELEPORT' }, 'UNKNOWN_KIND'],
      [{ ...rideTerminal(), extra: true }, 'UNKNOWN_FIELD'],
      [{ ...rideTerminal(), rideId: undefined }, 'INVALID_IDENTITY'],
      [
        { ...rideTerminal(), eventId: 'x'.repeat(METRIC_SERVICE_LIMITS.idCodeUnits + 1) },
        'INVALID_IDENTITY',
      ],
      [distanceEvent(1, 0), 'INVALID_NUMBER'],
      [
        {
          eventId: 'event:blocked:1',
          kind: 'BLOCKED_INTERVAL',
          vehicleId: 'taxi:1',
          tick: 1,
          blockedSeconds: 0,
          reason: 'TRAFFIC_BLOCK',
        },
        'INVALID_NUMBER',
      ],
      [
        {
          eventId: 'event:violation:1',
          kind: 'VIOLATION',
          vehicleId: 'taxi:1',
          tick: 1,
          opportunityId: 'opportunity:1',
          violationKind: 'PARKING',
        },
        'UNKNOWN_KIND',
      ],
      [
        {
          eventId: 'event:blocked:2',
          kind: 'BLOCKED_INTERVAL',
          vehicleId: 'taxi:1',
          tick: 1,
          blockedSeconds: 10,
          reason: 'SERVICE_WITHDRAWN',
        },
        'UNKNOWN_KIND',
      ],
    ];
  for (const [event, reason] of cases) {
    const result = service.ingest(event);
    assert.equal(result.status, 'REJECTED', String(event.kind));
    assert.equal(result.reason, reason, String(event.kind));
    assert.equal(result.eventId, null);
  }
  const batch = service.ingestMany([rideTerminal(), rideTerminal(), { kind: 'NOPE' }]);
  assert.deepEqual(batch, { events: 3, accepted: 1, duplicates: 1, rejected: 1 });
  const stats = service.getStats();
  assert.equal(stats.events, cases.length + 3);
  assert.equal(stats.accepted, 1);
  assert.equal(stats.rejected, cases.length + 1);
  assert.equal(stats.lastRejection, 'UNKNOWN_KIND');
  const snapshot = read(service);
  assert.equal(metric(snapshot, 'completedRides').value, 1);
  assert.equal(metric(snapshot, 'totalDistanceM').value, 0);
});

test('137 idempotency memory is bounded and reports the dropped keys', () => {
  const service = createMetricService({ retainedKeys: 2 });
  service.ingestMany([distanceEvent(1, 100), distanceEvent(2, 100, 2)]);
  assert.equal(service.getStats().retainedKeys, 2);
  service.ingest(distanceEvent(3, 100, 3));
  const bounded = service.getStats();
  assert.equal(bounded.retainedKeys, 2);
  assert.equal(bounded.droppedKeys, 1);
  // The evicted key is outside the documented window, so a replay is accepted again.
  assert.equal(service.ingest(distanceEvent(1, 100)).status, 'ACCEPTED');
  assert.equal(service.getStats().droppedKeys, 2);
  assert.equal(metric(read(service), 'totalDistanceM').value, 400);
  assert.equal(service.getStats().historyScans, 0);
});

test('137 repeated HUD refreshes never rescan history or change the aggregates', () => {
  const service = createMetricService();
  const events = Array.from({ length: 10 }, (_, index) =>
    rideTerminal({
      eventId: `event:ride:${index}`,
      rideId: `ride:${index}`,
      tick: index,
    }),
  );
  service.ingestMany(events);
  const first = read(service);
  for (let index = 0; index < 100; index += 1) {
    const snapshot = read(service, { tick: 101 + index });
    assert.deepEqual(snapshot.metrics, first.metrics);
  }
  const stats = service.getStats();
  assert.equal(stats.snapshotCalls, 101);
  assert.equal(stats.historyScans, 0);
  assert.equal(stats.accepted, 10);
  assert.equal(metric(read(service), 'completedRides').value, 10);
});

test('137 snapshots are frozen and reset/dispose are idempotent', () => {
  const service = createMetricService();
  service.ingest(rideTerminal());
  const snapshot = read(service);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.metrics), true);
  assert.equal(Object.isFrozen(snapshot.metrics[0]), true);
  assert.equal(Object.isFrozen(snapshot.fleet), true);
  assert.throws(() => {
    (snapshot.metrics[0] as { value: number }).value = 99;
  }, TypeError);

  const reset = service.reset();
  assert.equal(reset.clearedKeys, 1);
  assert.equal(reset.clearedEvents, 1);
  assert.deepEqual(service.reset(), { preserveStats: false, clearedKeys: 0, clearedEvents: 0 });
  assert.equal(service.getStats().accepted, 0);
  assert.equal(metric(read(service), 'completedRides').value, 0);

  service.ingest(rideTerminal());
  const preserved = service.reset({ preserveStats: true });
  assert.equal(preserved.preserveStats, true);
  assert.equal(preserved.clearedEvents, 1);
  assert.equal(service.getStats().accepted, 1);
  assert.equal(service.getStats().retainedKeys, 0);

  service.dispose();
  service.dispose();
  const stats = service.getStats();
  assert.equal(stats.disposed, true);
  assert.equal(stats.events, 0);
  assert.equal(stats.accepted, 0);
  assert.equal(stats.retainedKeys, 0);
  assert.equal(stats.historyScans, 0);
  assert.throws(() => service.ingest(rideTerminal()), /disposed/);
  assert.throws(() => read(service), /disposed/);
  assert.throws(() => service.reset(), /disposed/);
});

test('137 composes the real 061 terminal ride through the app adapter', () => {
  const world = createHealthWorld({ requests: 1, openTaxis: 1, assign: 1 }),
    service = createMetricService();
  try {
    const ride = rideOf(world, world.assignments[0]!);
    assert.equal(ingestRideTerminal(service, ride), null);
    for (const event of [
      'ARRIVED_PICKUP',
      'PICKUP_COMPLETE',
      'ARRIVED_DROPOFF',
      'DROPOFF_COMPLETE',
    ] as const) {
      world.scenario.lifecycle.apply({
        rideId: ride.rideId,
        eventId: `metric:137:${event}`,
        event,
        tick: ride.startedTick + 1,
      });
    }
    const terminal = world.scenario.lifecycle.ride(ride.rideId)!;
    assert.equal(terminal.state, 'COMPLETED');
    const first = ingestRideTerminal(service, terminal, 1234);
    assert.equal(first?.status, 'ACCEPTED');
    assert.equal(ingestRideTerminal(service, terminal, 1234)?.status, 'DUPLICATE');
    const snapshot = readMetricSnapshot(
      { metrics: service, fleet: world.scenario.registry },
      { tick: 200, simulatedSeconds: 600, distanceAvailable: true },
    );
    assert.equal(metric(snapshot, 'completedRides').value, 1);
    assert.equal(metric(snapshot, 'averageTripSeconds').value, terminal.tripCostSeconds);
    assert.equal(metric(snapshot, 'averagePickupSeconds').value, terminal.pickupCostSeconds);
    assert.equal(metric(snapshot, 'rideDistanceM').value, 1234);
  } finally {
    disposeHealthWorld(world);
  }
});

test('137 ingests the real 028 collision incident idempotently', () => {
  const registry = new CollisionRegistry(),
    vehicle = registry.register('taxi:137:01', 'VEHICLE', 1),
    obstacle = registry.register('obstacle:137:wall', 'OBSTACLE', 2),
    episodes = createCollisionEpisodes(
      { schemaVersion: 1, units: 'SI', sessionId: 'session:137', worldEpoch: 0 },
      registry,
    ),
    incidents: CollisionIncident[] = [];
  try {
    episodes.update(65, [{ first: vehicle, second: obstacle, impulseNs: 1200 }]);
    const drain = episodes.drain((incident) => {
      incidents.push(incident);
    });
    assert.equal(drain.accepted, 1);
    const service = createMetricService(),
      incident = incidents[0]!;
    assert.equal(ingestCollision(service, incident).status, 'ACCEPTED');
    assert.equal(ingestCollision(service, incident).status, 'DUPLICATE');
    assert.throws(() => ingestCollision(service, { ...incident, tick: 1.5 }), /tick/);
    const snapshot = read(service);
    assert.equal(metric(snapshot, 'collisions').value, 1);
    assert.equal(snapshot.historyScans, 0);
  } finally {
    episodes.dispose();
    registry.dispose();
  }
});

test('137 ingests only a real 065 blockage with a measured duration', () => {
  const world = createHealthWorld({ requests: 1, openTaxis: 2, assign: 1 }),
    service = createMetricService();
  try {
    const taxiId = world.scenario.taxiIds[1]!;
    world.scenario.health.apply({
      taxiId,
      fact: 'TRAFFIC_BLOCK',
      factId: 'metric:137:block',
      tick: 60,
    });
    world.scenario.health.apply({
      taxiId,
      fact: 'RECOVERY',
      factId: 'metric:137:recovery',
      tick: 61,
    });
    const history = world.scenario.health.history();
    const blocked = history.find((entry) => entry.fact === 'TRAFFIC_BLOCK')!,
      recovery = history.find((entry) => entry.fact === 'RECOVERY')!,
      withdrawn = history.find((entry) => entry.fact === 'SERVICE_WITHDRAWN')!;
    assert.equal(ingestBlockedInterval(service, { entry: blocked }), null);
    assert.equal(ingestBlockedInterval(service, { entry: blocked, blockedSeconds: 0 }), null);
    assert.equal(ingestBlockedInterval(service, { entry: recovery }), null);
    if (withdrawn !== undefined)
      assert.equal(ingestBlockedInterval(service, { entry: withdrawn }), null);
    assert.equal(service.getStats().accepted, 0);
    const accepted = ingestBlockedInterval(service, { entry: blocked, blockedSeconds: 12 });
    assert.equal(accepted?.status, 'ACCEPTED');
    assert.equal(
      ingestBlockedInterval(service, { entry: blocked, blockedSeconds: 12 })?.status,
      'DUPLICATE',
    );
    const snapshot = read(service);
    assert.equal(metric(snapshot, 'blockedSeconds').value, 12);
    assert.equal(metric(snapshot, 'blockedIntervals').value, 1);
  } finally {
    disposeHealthWorld(world);
  }
});

test('137 adapts only the 082 metrics it owns and keeps unavailable values null', () => {
  const service = createMetricService();
  service.ingestMany([
    rideTerminal({ tripSeconds: 60 }),
    distanceEvent(1, 2000),
    {
      eventId: 'event:collision:1',
      kind: 'COLLISION',
      vehicleId: 'taxi:1',
      tick: 3,
      incidentId: 'incident:1',
    },
    {
      eventId: 'event:blocked:1',
      kind: 'BLOCKED_INTERVAL',
      vehicleId: 'taxi:1',
      tick: 4,
      blockedSeconds: 30,
      reason: 'IMMOBILIZATION',
    },
  ]);
  const snapshot = read(service),
    metrics = toCityDashboardMetrics(snapshot);
  assert.deepEqual(
    metrics.map((entry) => entry.id),
    ['completedRides', 'averageRideSeconds', 'totalDistanceM', 'collisions', 'blockages'],
  );
  assert.deepEqual(
    metrics.map((entry) => entry.unit),
    ['rides', 's', 'm', 'count', 'count'],
  );
  assert.equal(metrics.find((entry) => entry.id === 'completedRides')!.value, 1);
  assert.equal(metrics.find((entry) => entry.id === 'averageRideSeconds')!.value, 60);
  assert.equal(metrics.find((entry) => entry.id === 'totalDistanceM')!.value, 2000);
  assert.equal(metrics.find((entry) => entry.id === 'blockages')!.value, 1);
  for (const entry of metrics) {
    assert.equal(entry.reason, null);
    assert.equal(entry.state, 'AVAILABLE');
    assert.deepEqual(Object.keys(entry).sort(), [
      'id',
      'label',
      'reason',
      'sampleSize',
      'state',
      'unit',
      'value',
    ]);
  }
  const parsed = parseCityDashboardSnapshot({
    schemaVersion: 1,
    units: 'SI',
    version: CITY_DASHBOARD_VERSION,
    sessionId: 'session:137',
    worldEpoch: 0,
    tick: 100,
    metrics,
    incidents: [],
    selectedIncidentId: null,
    exposure: {
      state: 'AVAILABLE',
      windows: 0,
      observations: 0,
      durationSeconds: 0,
      reason: null,
    },
  });
  assert.equal(parsed.metrics.length, 5);
  assert.equal(CITY_METRIC_IDS.includes('violations'), true);

  const missingDistance = toCityDashboardMetrics(read(service, { distanceAvailable: false })),
    distance = missingDistance.find((entry) => entry.id === 'totalDistanceM')!;
  assert.equal(distance.state, 'UNAVAILABLE');
  assert.equal(distance.value, null);
  assert.equal(distance.sampleSize, null);
  assert.ok(CITY_METRIC_REASONS.includes(distance.reason!));
  assert.equal(distance.reason, 'SOURCE_MISSING');
  assert.equal(CITY_METRIC_UNIT_BY_ID.totalDistanceM, distance.unit);
  assert.equal(
    missingDistance.some((entry) => entry.id === 'violations' || entry.id === 'comfortScore'),
    false,
  );
});

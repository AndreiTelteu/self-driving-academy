import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createPassengerRideBridge, readPassengerVisualFrame } from '../../src/app';
import {
  createPassengerVisualPresenter,
  PASSENGER_VISUAL_FRAME_FIELDS,
  passengerMarkerId,
} from '../../src/ui';
import type { PassengerMarker, PassengerVisualFrame } from '../../src/ui';
import { taxiAt } from '../fleet/dispatcher-fixture';
import {
  beginFirstRide,
  createRideLifecycleWorld,
  disposeRideLifecycleWorld,
} from '../fleet/ride-fsm-fixture';
import type { RideLifecycleWorld } from '../fleet/ride-fsm-fixture';
import { createRecordingPassengerPort } from '../ui/passenger-visual-fixture';
import { runPassengerVisualReport } from './passenger-visual-report';

const EVENT_IDS: Readonly<Record<string, (requestId: string) => string>> = Object.freeze({
  ARRIVED_PICKUP: (requestId) => `pickup-arrived:${requestId}`,
  PICKUP_COMPLETE: (requestId) => `pickup-boarded:${requestId}`,
  ARRIVED_DROPOFF: (requestId) => `dropoff-arrived:${requestId}`,
  DROPOFF_COMPLETE: (requestId) => `dropoff-complete:${requestId}`,
});

function apply(
  world: RideLifecycleWorld,
  rideId: string,
  requestId: string,
  event: keyof typeof EVENT_IDS,
  tick: number,
): void {
  world.lifecycle.apply({
    rideId,
    eventId: EVENT_IDS[event]!(requestId),
    event,
    tick,
  });
}

function frameFor(
  world: RideLifecycleWorld,
  taxiId: string,
  tick: number,
  rideId?: string,
  map = world.dispatcherWorld.map,
): PassengerVisualFrame {
  return readPassengerVisualFrame(
    { lifecycle: world.lifecycle, map },
    rideId === undefined ? { taxiId, tick } : { taxiId, tick, rideId },
  );
}

function roles(frame: PassengerVisualFrame): readonly string[] {
  return frame.markers.map((marker) => marker.role);
}

function marker(frame: PassengerVisualFrame, role: PassengerMarker['role']): PassengerMarker {
  const found = frame.markers.find((entry) => entry.role === role);
  if (found === undefined) throw new Error(`Missing ${role} marker`);
  return found;
}

function realAnchor(world: RideLifecycleWorld, zoneId: string): { x: number; z: number } {
  const map = world.dispatcherWorld.map,
    zone = map.serviceZones.find((entry) => entry.id === zoneId);
  assert.ok(zone, `Missing real zone ${zoneId}`);
  const node = map.geometry.nodes.find((entry) => entry.id === zone.anchorNodeId);
  assert.ok(node, `Missing real anchor ${zone.anchorNodeId}`);
  return node.positionM;
}

test('147 complete service maps every real 061 state to the expected phase, occupancy and marker', () => {
  const world = createRideLifecycleWorld({ requestCount: 1, openTaxis: 1 });
  try {
    const { assignment, result } = beginFirstRide(world),
      rideId = result.ride.rideId,
      taxiId = result.ride.taxiId;
    const waiting = frameFor(world, taxiId, 10);
    assert.equal(waiting.phase, 'WAITING_PICKUP');
    assert.equal(waiting.rideId, rideId);
    assert.equal(waiting.occupancy, 0);
    assert.equal(waiting.passengerVisible, false);
    assert.deepEqual(roles(waiting), ['PICKUP']);
    assert.equal(waiting.reset, false);
    assert.equal(waiting.labels.phase, 'Așteptare ridicare');
    apply(world, rideId, assignment.requestId, 'ARRIVED_PICKUP', 11);
    const boarding = frameFor(world, taxiId, 11);
    assert.equal(boarding.phase, 'BOARDING');
    assert.equal(boarding.occupancy, 0);
    assert.equal(boarding.passengerVisible, true);
    assert.deepEqual(roles(boarding), ['PICKUP', 'PASSENGER']);
    assert.equal(marker(boarding, 'PASSENGER').x, marker(boarding, 'PICKUP').x);
    assert.equal(marker(boarding, 'PASSENGER').z, marker(boarding, 'PICKUP').z);
    apply(world, rideId, assignment.requestId, 'PICKUP_COMPLETE', 12);
    const onboard = frameFor(world, taxiId, 12);
    assert.equal(onboard.phase, 'ONBOARD');
    assert.equal(onboard.occupancy, 1);
    assert.equal(onboard.passengerVisible, true);
    assert.deepEqual(roles(onboard), ['DROPOFF']);
    assert.equal(onboard.labels.occupancy, '1 pasager');
    apply(world, rideId, assignment.requestId, 'ARRIVED_DROPOFF', 13);
    const dropping = frameFor(world, taxiId, 13);
    assert.equal(dropping.phase, 'DROPPING_OFF');
    assert.equal(dropping.occupancy, 1);
    assert.deepEqual(roles(dropping), ['DROPOFF']);
    apply(world, rideId, assignment.requestId, 'DROPOFF_COMPLETE', 14);
    assert.equal(world.lifecycle.ride(rideId)?.state, 'COMPLETED');
    const completed = frameFor(world, taxiId, 14, rideId);
    assert.equal(completed.phase, 'NONE');
    assert.equal(completed.occupancy, 0);
    assert.equal(completed.passengerVisible, false);
    assert.deepEqual(roles(completed), []);
    assert.equal(completed.reset, true);
    assert.equal(completed.accessibleText.includes('COMPLETED'), true);
  } finally {
    disposeRideLifecycleWorld(world);
  }
});

test('147 pickup and dropoff markers carry the real 032 zone ids and anchor positions', () => {
  const world = createRideLifecycleWorld({ requestCount: 1, openTaxis: 1 });
  try {
    const { assignment, result } = beginFirstRide(world),
      rideId = result.ride.rideId,
      taxiId = result.ride.taxiId,
      pickupAnchor = realAnchor(world, result.ride.pickupZoneId),
      dropoffAnchor = realAnchor(world, result.ride.dropoffZoneId);
    const waiting = frameFor(world, taxiId, 10),
      pickup = marker(waiting, 'PICKUP');
    assert.equal(pickup.zoneId, result.ride.pickupZoneId);
    assert.equal(pickup.x, pickupAnchor.x);
    assert.equal(pickup.z, pickupAnchor.z);
    assert.equal(pickup.markerId, passengerMarkerId(rideId, 'PICKUP'));
    assert.throws(() => marker(waiting, 'DROPOFF'), /Missing DROPOFF/);
    apply(world, rideId, assignment.requestId, 'ARRIVED_PICKUP', 11);
    apply(world, rideId, assignment.requestId, 'PICKUP_COMPLETE', 12);
    const dropoff = marker(frameFor(world, taxiId, 12), 'DROPOFF');
    assert.equal(dropoff.zoneId, result.ride.dropoffZoneId);
    assert.equal(dropoff.x, dropoffAnchor.x);
    assert.equal(dropoff.z, dropoffAnchor.z);
    assert.equal(dropoff.markerId, passengerMarkerId(rideId, 'DROPOFF'));
    assert.notEqual(pickup.zoneId, dropoff.zoneId);
    assert.equal(waiting.omissions.length, 0);
    assert.equal(
      frameFor(world, taxiId, 12).accessibleText.includes(result.ride.dropoffZoneId),
      true,
    );
  } finally {
    disposeRideLifecycleWorld(world);
  }
});

test('147 presentation never changes the ride, its claim, the tick or the terminal result', () => {
  const world = createRideLifecycleWorld({ requestCount: 1, openTaxis: 1 });
  try {
    const { assignment, result } = beginFirstRide(world),
      rideId = result.ride.rideId,
      taxiId = result.ride.taxiId,
      port = createRecordingPassengerPort(),
      presenter = createPassengerVisualPresenter(port.port),
      bridge = createPassengerRideBridge({
        lifecycle: world.lifecycle,
        map: world.dispatcherWorld.map,
        presenter,
      });
    const stateAt = (tick: number): void => {
      const before = world.lifecycle.ride(rideId),
        beforeStats = world.lifecycle.stats(),
        beforeClaim = world.dispatcherWorld.dispatcher.assignmentFor(assignment.requestId),
        beforeStatus = world.dispatcherWorld.dispatcher.taxiStatus(taxiId);
      bridge.present({ taxiId, tick, rideId });
      const after = world.lifecycle.ride(rideId),
        afterStats = world.lifecycle.stats(),
        afterClaim = world.dispatcherWorld.dispatcher.assignmentFor(assignment.requestId),
        afterStatus = world.dispatcherWorld.dispatcher.taxiStatus(taxiId);
      assert.equal(after, before, 'the ride record is the same object after presentation');
      assert.deepEqual(afterStats, beforeStats);
      assert.equal(afterClaim?.assignmentId, beforeClaim?.assignmentId);
      assert.equal(afterStatus, beforeStatus);
    };
    stateAt(10);
    apply(world, rideId, assignment.requestId, 'ARRIVED_PICKUP', 11);
    stateAt(11);
    apply(world, rideId, assignment.requestId, 'PICKUP_COMPLETE', 12);
    stateAt(12);
    apply(world, rideId, assignment.requestId, 'ARRIVED_DROPOFF', 13);
    stateAt(13);
    const afterDropoff = world.lifecycle.ride(rideId);
    assert.equal(afterDropoff?.state, 'DROPOFF');
    assert.equal(afterDropoff?.terminal, false);
    assert.ok(world.dispatcherWorld.dispatcher.assignmentFor(assignment.requestId));
    assert.equal(bridge.stats().presentations, 4);
    assert.equal(bridge.stats().pedestrianActors, 0);
    assert.equal(bridge.stats().opportunityEvents, 0);
    assert.equal(bridge.stats().telemetryEvents, 0);
    assert.equal(presenter.getStats().rejected, 0);
    assert.equal(world.lifecycle.ride(rideId)?.state, 'DROPOFF');
    apply(world, rideId, assignment.requestId, 'DROPOFF_COMPLETE', 14);
    assert.equal(world.lifecycle.ride(rideId)?.state, 'COMPLETED');
    assert.equal(world.lifecycle.stats().releases, 1);
    bridge.dispose();
    bridge.dispose();
    assert.throws(() => bridge.present({ taxiId, tick: 14 }), /disposed/);
    assert.equal(bridge.stats().pedestrianActors, 0);
  } finally {
    disposeRideLifecycleWorld(world);
  }
});

test('147 sources contain no pedestrian, ride-transition, telemetry or wall-clock evidence', () => {
  const files = [
      'src/ui/passenger-visual-format.ts',
      'src/ui/passenger-visual.ts',
      'src/app/passenger-visual.ts',
    ],
    sources = files.map((file) => readFileSync(join(process.cwd(), file), 'utf8'));
  for (const [index, source] of sources.entries()) {
    const file = files[index]!;
    assert.ok(
      !/from '[^']*(fleet\/(pickup|dropoff|telemetry)|pedestrian)[^']*'/.test(source),
      file,
    );
    assert.ok(!/createRidePickup\(|createRideDropoff\(|createPedestrian\(/.test(source), file);
    assert.ok(!/lifecycle\.(begin|apply|advance|reset)\(/.test(source), file);
    assert.ok(!/dispatcher\.release/.test(source), file);
    assert.ok(!/Math\.random|Date\.now|performance\.now|setTimeout|setInterval/.test(source), file);
  }
  const world = createRideLifecycleWorld({ requestCount: 1, openTaxis: 1 });
  try {
    const { result } = beginFirstRide(world),
      frame = frameFor(world, result.ride.taxiId, 10),
      keys = Object.keys(frame).sort();
    assert.deepEqual(keys, [...PASSENGER_VISUAL_FRAME_FIELDS].sort());
    assert.equal(
      keys.some((key) => /pedestrian|opportunity|telemetry/i.test(key)),
      false,
    );
    assert.equal(
      frame.markers.some((entry) => /pedestrian/i.test(entry.role)),
      false,
    );
    const port = createRecordingPassengerPort(),
      presenter = createPassengerVisualPresenter(port.port);
    presenter.update(frame);
    assert.equal(
      port.calls.some((call) => /pedestrian|opportunity|telemetry/i.test(JSON.stringify(call))),
      false,
    );
  } finally {
    disposeRideLifecycleWorld(world);
  }
});

test('147 terminal ride and a real lifecycle reset clear occupancy and every marker', () => {
  const world = createRideLifecycleWorld({ requestCount: 1, openTaxis: 1 });
  try {
    const { assignment, result } = beginFirstRide(world),
      rideId = result.ride.rideId,
      taxiId = result.ride.taxiId,
      port = createRecordingPassengerPort(),
      presenter = createPassengerVisualPresenter(port.port);
    apply(world, rideId, assignment.requestId, 'ARRIVED_PICKUP', 11);
    apply(world, rideId, assignment.requestId, 'PICKUP_COMPLETE', 12);
    apply(world, rideId, assignment.requestId, 'ARRIVED_DROPOFF', 13);
    presenter.update(frameFor(world, taxiId, 13));
    assert.equal(presenter.getStats().markers, 1);
    apply(world, rideId, assignment.requestId, 'DROPOFF_COMPLETE', 14);
    const completed = frameFor(world, taxiId, 14, rideId);
    assert.equal(completed.phase, 'NONE');
    presenter.update(completed);
    assert.equal(presenter.getStats().markers, 0);
    assert.equal(presenter.getStats().cleared, 1);
    assert.equal(presenter.getStats().visible, false);
    const reset = world.lifecycle.reset({ tick: 30 }),
      afterReset = frameFor(world, taxiId, 30);
    assert.deepEqual(reset, { tick: 30, clearedRides: 1, discardedActive: 0 });
    assert.equal(afterReset.phase, 'NONE');
    assert.equal(afterReset.rideId, null);
    assert.equal(afterReset.markers.length, 0);
    assert.equal(afterReset.accessibleText.includes('Nicio cursă activă'), true);
    presenter.update(afterReset);
    assert.equal(presenter.getStats().markers, 0);
  } finally {
    disposeRideLifecycleWorld(world);
  }
});

test('147 a missing zone or anchor omits the marker with a reason and no fake coordinate', () => {
  const world = createRideLifecycleWorld({ requestCount: 1, openTaxis: 1 });
  try {
    const { result } = beginFirstRide(world),
      rideId = result.ride.rideId,
      taxiId = result.ride.taxiId,
      map = world.dispatcherWorld.map,
      zone = map.serviceZones.find((entry) => entry.id === result.ride.pickupZoneId);
    assert.ok(zone);
    const withoutAnchor = {
        ...map,
        geometry: {
          ...map.geometry,
          nodes: map.geometry.nodes.filter((node) => node.id !== zone.anchorNodeId),
        },
      },
      withoutZone = {
        ...map,
        serviceZones: map.serviceZones.filter((entry) => entry.id !== zone.id),
      },
      anchorFrame = frameFor(world, taxiId, 10, rideId, withoutAnchor),
      zoneFrame = frameFor(world, taxiId, 10, rideId, withoutZone);
    assert.equal(anchorFrame.markers.length, 0);
    assert.deepEqual(anchorFrame.omissions, [
      { role: 'PICKUP', zoneId: zone.id, reason: 'ANCHOR_MISSING' },
    ]);
    assert.equal(anchorFrame.accessibleText.includes('ancora zonei lipsește'), true);
    assert.equal(anchorFrame.accessibleText.includes('poziția nu este inventată'), true);
    assert.equal(anchorFrame.phase, 'WAITING_PICKUP');
    assert.equal(zoneFrame.markers.length, 0);
    assert.deepEqual(zoneFrame.omissions, [
      { role: 'PICKUP', zoneId: zone.id, reason: 'ZONE_MISSING' },
    ]);
    assert.equal(zoneFrame.accessibleText.includes('zona lipsește'), true);
    const port = createRecordingPassengerPort(),
      presenter = createPassengerVisualPresenter(port.port);
    presenter.update(anchorFrame);
    assert.equal(presenter.getStats().markers, 0);
    assert.equal(
      port.calls.some((call) => call.op === 'setMarker'),
      false,
    );
  } finally {
    disposeRideLifecycleWorld(world);
  }
});

test('147 taxi and ride switches never keep the previous passenger or marker', () => {
  const world = createRideLifecycleWorld({ requestCount: 2, openTaxis: 2 });
  try {
    const assignments = world.assignments;
    assert.equal(assignments.length, 2);
    const first = beginFirstRide(world),
      rideA = first.result.ride,
      second = world.lifecycle.begin({
        requestId: assignments[1]!.requestId,
        eventId: `assigned:${assignments[1]!.requestId}`,
        tick: 10,
      }),
      rideB = second.ride,
      rideOf = (rideId: string) => {
        const ride = world.lifecycle.ride(rideId);
        assert.ok(ride);
        return ride;
      },
      port = createRecordingPassengerPort(),
      presenter = createPassengerVisualPresenter(port.port),
      bridge = createPassengerRideBridge({
        lifecycle: world.lifecycle,
        map: world.dispatcherWorld.map,
        presenter,
      }),
      freeTaxi = taxiAt(world.dispatcherWorld, 3);
    const waitingA = bridge.present({ taxiId: rideA.taxiId, tick: 10 }),
      waitingB = bridge.present({ taxiId: rideB.taxiId, tick: 10 }),
      foreign = bridge.present({ taxiId: rideB.taxiId, tick: 10, rideId: rideA.rideId }),
      free = bridge.present({ taxiId: freeTaxi, tick: 10 });
    assert.equal(waitingA.rideId, rideA.rideId);
    assert.equal(waitingB.rideId, rideB.rideId);
    assert.equal(marker(waitingA, 'PICKUP').markerId, passengerMarkerId(rideA.rideId, 'PICKUP'));
    assert.equal(marker(waitingB, 'PICKUP').markerId, passengerMarkerId(rideB.rideId, 'PICKUP'));
    assert.notEqual(marker(waitingA, 'PICKUP').markerId, marker(waitingB, 'PICKUP').markerId);
    assert.equal(
      port.calls.some(
        (call) => call.op === 'removeMarker' && call.markerId?.includes(rideA.rideId),
      ),
      true,
      'the previous taxi marker is removed, not reused',
    );
    assert.equal(foreign.phase, 'NONE');
    assert.equal(foreign.markers.length, 0);
    assert.equal(foreign.accessibleText.includes('altui taxi'), true);
    assert.equal(free.phase, 'NONE');
    assert.equal(free.rideId, null);
    assert.equal(presenter.getStats().markers, 0);
    assert.equal(rideOf(rideA.rideId).state, 'TO_PICKUP');
    assert.equal(rideOf(rideB.rideId).state, 'TO_PICKUP');
    bridge.dispose();
    assert.equal(presenter.getStats().markers, 0);
  } finally {
    disposeRideLifecycleWorld(world);
  }
});

test('147 committed evidence report is the current deterministic transcript', () => {
  const report = runPassengerVisualReport(),
    saved = readFileSync(
      join(process.cwd(), 'Docs', 'Evidence', '147-passenger-visual', 'report.json'),
      'utf8',
    );
  assert.equal(report.summary.pass, true);
  assert.equal(report.scenarios.length, 7);
  assert.ok(report.checks.length >= 25, `only ${report.checks.length} checks`);
  assert.equal(
    report.scenarios.map((scenario) => scenario.name).join(','),
    'waiting,boarding,onboard,dropping off,completed reset,mixed taxi,missing anchor',
  );
  assert.equal(saved, `${JSON.stringify(report, null, 2)}\n`);
});

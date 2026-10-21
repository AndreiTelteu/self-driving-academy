import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPassengerVisualPresenter,
  PASSENGER_VISUAL_LIMITS,
  PASSENGER_VISUAL_VERSION,
  parsePassengerVisualFrame,
  passengerMarkerId,
  passengerVisualSignature,
} from '../../src/ui';
import type { PassengerVisualFrame } from '../../src/ui';
import {
  createRecordingPassengerPort,
  PASSENGER_PICKUP_ZONE,
  PASSENGER_RIDE,
  passengerFrame,
} from './passenger-visual-fixture';

function rolesOf(frame: PassengerVisualFrame): readonly string[] {
  return frame.markers.map((marker) => marker.role);
}

test('147 frame parser accepts every phase, freezes it and keeps the closed phase invariants', () => {
  const waiting = parsePassengerVisualFrame(passengerFrame('WAITING_PICKUP')),
    boarding = parsePassengerVisualFrame(passengerFrame('BOARDING', { tick: 11 })),
    onboard = parsePassengerVisualFrame(passengerFrame('ONBOARD', { tick: 12 })),
    dropping = parsePassengerVisualFrame(passengerFrame('DROPPING_OFF', { tick: 13 })),
    none = parsePassengerVisualFrame(passengerFrame('NONE', { tick: 14 }));
  assert.equal(waiting.version, PASSENGER_VISUAL_VERSION);
  assert.deepEqual(rolesOf(waiting), ['PICKUP']);
  assert.equal(waiting.occupancy, 0);
  assert.equal(waiting.passengerVisible, false);
  assert.deepEqual(rolesOf(boarding), ['PICKUP', 'PASSENGER']);
  assert.equal(boarding.occupancy, 0);
  assert.equal(boarding.passengerVisible, true);
  assert.deepEqual(rolesOf(onboard), ['DROPOFF']);
  assert.equal(onboard.occupancy, 1);
  assert.deepEqual(rolesOf(dropping), ['DROPOFF']);
  assert.equal(dropping.phase, 'DROPPING_OFF');
  assert.equal(none.phase, 'NONE');
  assert.equal(none.rideId, null);
  assert.equal(none.reset, true);
  assert.equal(none.markers.length, 0);
  assert.ok(Object.isFrozen(waiting));
  assert.ok(Object.isFrozen(waiting.markers));
  assert.ok(Object.isFrozen(waiting.markers[0]));
  assert.ok(Object.isFrozen(waiting.labels));
  assert.notEqual(passengerVisualSignature(waiting), passengerVisualSignature(boarding));
  assert.equal(
    passengerVisualSignature(parsePassengerVisualFrame(passengerFrame('WAITING_PICKUP'))),
    passengerVisualSignature(waiting),
    'the same frame has the same deterministic signature',
  );
});

test('147 frame parser rejects unknown fields, bad identities, non-finite points and duplicate roles', () => {
  const waiting = passengerFrame('WAITING_PICKUP'),
    boarding = passengerFrame('BOARDING'),
    pickup = boarding.markers[0]!;
  assert.throws(() => parsePassengerVisualFrame({ ...waiting, extra: 1 }), /fields/);
  assert.throws(() => parsePassengerVisualFrame({ ...waiting, sessionId: '' }), /session identity/);
  assert.throws(
    () => parsePassengerVisualFrame({ ...waiting, sessionId: 'x'.repeat(513) }),
    /session identity/,
  );
  assert.throws(
    () =>
      parsePassengerVisualFrame({
        ...waiting,
        markers: [{ ...pickup, x: Number.POSITIVE_INFINITY }],
      }),
    /finite/,
  );
  assert.throws(
    () => parsePassengerVisualFrame({ ...waiting, markers: [{ ...pickup, markerId: 'forged' }] }),
    /stable rideId \+ role/,
  );
  assert.throws(
    () => parsePassengerVisualFrame({ ...boarding, markers: [pickup, pickup] }),
    /repeats a marker role/,
  );
  assert.throws(() => parsePassengerVisualFrame({ ...boarding, occupancy: 1 }), /occupancy/);
  assert.throws(
    () => parsePassengerVisualFrame({ ...waiting, passengerVisible: true }),
    /visibility/,
  );
  assert.throws(() => parsePassengerVisualFrame({ ...waiting, reset: true }), /reset/);
  assert.throws(
    () =>
      parsePassengerVisualFrame({
        ...waiting,
        markers: [],
      }),
    /required marker without a reason/,
  );
  assert.throws(
    () =>
      parsePassengerVisualFrame({
        ...waiting,
        markers: [],
        omissions: [{ role: 'PICKUP', zoneId: PASSENGER_PICKUP_ZONE, reason: 'BROKEN' }],
      }),
    /omission reason/,
  );
});

test('147 presenter writes deterministic marker commands identified by rideId + role', () => {
  const first = createRecordingPassengerPort(),
    second = createRecordingPassengerPort(),
    frame = passengerFrame('BOARDING');
  createPassengerVisualPresenter(first.port).update(frame);
  createPassengerVisualPresenter(second.port).update(frame);
  assert.deepEqual(first.calls, second.calls);
  assert.deepEqual(
    first.calls.map((call) => call.op),
    ['setMarker', 'setMarker', 'setPassengerVisible'],
  );
  assert.equal(first.calls[0]!.markerId, passengerMarkerId(PASSENGER_RIDE, 'PICKUP'));
  assert.equal(first.calls[1]!.markerId, passengerMarkerId(PASSENGER_RIDE, 'PASSENGER'));
  assert.equal(first.calls[1]!.zoneId, PASSENGER_PICKUP_ZONE);
  assert.equal(first.calls[1]!.x, first.calls[0]!.x);
  assert.equal(first.calls[1]!.z, first.calls[0]!.z);
  assert.equal(first.calls[2]!.visible, true);
});

test('147 presenter writes nothing for an identical frame and only rewrites changed values', () => {
  const recording = createRecordingPassengerPort(),
    presenter = createPassengerVisualPresenter(recording.port),
    frame = passengerFrame('WAITING_PICKUP');
  assert.equal(presenter.update(frame), true);
  const afterFirst = recording.calls.length;
  assert.equal(presenter.update(frame), false);
  assert.equal(recording.calls.length, afterFirst);
  assert.equal(presenter.getStats().updates, 1);
  assert.equal(presenter.getStats().markers, 1);
  const nextTick = passengerFrame('WAITING_PICKUP', { tick: 11 });
  presenter.update(nextTick);
  assert.equal(recording.calls.length, afterFirst, 'same marker at a new tick is not rewritten');
  assert.equal(presenter.update(passengerFrame('NONE', { tick: 12 })), true);
  assert.equal(presenter.getStats().markers, 0);
});

test('147 phase change removes stale markers without clearing the port', () => {
  const recording = createRecordingPassengerPort(),
    presenter = createPassengerVisualPresenter(recording.port);
  presenter.update(passengerFrame('BOARDING'));
  recording.reset();
  const changed = presenter.update(passengerFrame('ONBOARD', { tick: 12 }));
  assert.equal(changed, true);
  assert.deepEqual(
    recording.calls.map((call) => `${call.op}:${call.markerId ?? ''}`),
    [
      `removeMarker:${passengerMarkerId(PASSENGER_RIDE, 'PASSENGER')}`,
      `removeMarker:${passengerMarkerId(PASSENGER_RIDE, 'PICKUP')}`,
      `setMarker:${passengerMarkerId(PASSENGER_RIDE, 'DROPOFF')}`,
    ],
  );
  assert.equal(presenter.getStats().cleared, 0);
  assert.equal(presenter.getStats().markers, 1);
});

test('147 reset frame clears markers, occupancy and visibility exactly once', () => {
  const recording = createRecordingPassengerPort(),
    presenter = createPassengerVisualPresenter(recording.port);
  presenter.update(passengerFrame('BOARDING'));
  recording.reset();
  assert.equal(presenter.update(passengerFrame('NONE', { tick: 14 })), true);
  assert.deepEqual(
    recording.calls.map((call) => call.op),
    ['clear'],
  );
  const stats = presenter.getStats();
  assert.equal(stats.markers, 0);
  assert.equal(stats.visible, false);
  assert.equal(stats.cleared, 1);
  recording.reset();
  assert.equal(presenter.update(passengerFrame('NONE', { tick: 15 })), false);
  assert.equal(recording.calls.length, 0, 'an empty reset frame writes nothing');
  assert.equal(presenter.getStats().cleared, 1);
});

test('147 malformed and stale frames are rejected before any command', () => {
  const recording = createRecordingPassengerPort(),
    presenter = createPassengerVisualPresenter(recording.port);
  presenter.update(passengerFrame('WAITING_PICKUP', { tick: 20 }));
  recording.reset();
  assert.throws(
    () => presenter.update({ ...passengerFrame('BOARDING', { tick: 21 }), phase: 'BROKEN' }),
    /phase/,
  );
  assert.throws(
    () => presenter.update(passengerFrame('BOARDING', { tick: 19 })),
    /Stale passenger visual frame/,
  );
  assert.equal(recording.calls.length, 0);
  const stats = presenter.getStats();
  assert.equal(stats.rejected, 2);
  assert.equal(stats.updates, 1);
  assert.equal(stats.markers, 1);
  assert.throws(
    () =>
      createPassengerVisualPresenter({
        setMarker() {},
        removeMarker() {},
        setPassengerVisible() {},
      }),
    /clear/,
  );
});

test('147 dispose is idempotent, clears the port once and refuses later frames', () => {
  const recording = createRecordingPassengerPort(),
    presenter = createPassengerVisualPresenter(recording.port);
  presenter.update(passengerFrame('BOARDING'));
  recording.reset();
  presenter.dispose();
  presenter.dispose();
  assert.deepEqual(
    recording.calls.map((call) => call.op),
    ['clear'],
  );
  const stats = presenter.getStats();
  assert.equal(stats.disposed, true);
  assert.equal(stats.markers, 0);
  assert.equal(stats.visible, false);
  assert.equal(stats.cleared, 1);
  assert.equal(PASSENGER_VISUAL_LIMITS.markers, 2);
  assert.equal(PASSENGER_VISUAL_LIMITS.pedestrianActors, 0);
  assert.throws(() => presenter.update(passengerFrame('NONE')), /disposed/);
  assert.equal(presenter.getStats().markers, 0);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCivilWorld } from './civil-traffic-fixture';

test('269 a purchased taxi enters the same live 058 population with a real route', () => {
  const world = createCivilWorld({
    traffic: { driverKinds: ['TAXI', 'CIVILIAN'] },
  });
  try {
    const before = world.traffic.list();
    assert.equal(before.length, 24 + 40);
    const vehicle = world.registry.addVehicle('TAXI', 'compact', { tick: 5 });
    assert.equal(vehicle.slot, 25);
    const actor = world.traffic.addVehicle(vehicle.vehicleId);
    assert.equal(actor.vehicleId, vehicle.vehicleId);
    assert.equal(actor.driverKind, 'TAXI');
    assert.equal(actor.slot, 25);
    assert.equal(actor.classId, 'compact');
    assert.notEqual(actor.route.status, 'ERROR');
    assert.ok(actor.route.path.length > 0);
    assert.equal(world.traffic.list().length, before.length + 1);
    assert.equal(world.traffic.get(vehicle.vehicleId)?.vehicleId, vehicle.vehicleId);
    assert.equal(world.traffic.report().vehicles, before.length + 1);
    // Idempotent: asking for the same actor again does not duplicate it.
    assert.equal(world.traffic.addVehicle(vehicle.vehicleId).vehicleId, vehicle.vehicleId);
    assert.equal(world.traffic.list().length, before.length + 1);
    const frame = world.traffic.step({ tick: 5, dtSeconds: 1 / 60 });
    assert.ok(frame.actors.some((entry) => entry.vehicleId === vehicle.vehicleId));
    assert.equal(world.registry.counts().taxis, 25);
    assert.equal(world.traffic.removeVehicle(vehicle.vehicleId), true);
    assert.equal(world.traffic.get(vehicle.vehicleId), undefined);
    assert.equal(world.traffic.list().length, before.length);
    world.registry.removeVehicle(vehicle.vehicleId);
    assert.equal(world.registry.counts().taxis, 24);
  } finally {
    world.traffic.dispose();
    world.registry.dispose();
  }
});

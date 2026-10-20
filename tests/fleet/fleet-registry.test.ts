import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  DEFAULT_FLEET_COUNTS,
  FLEET_LIMITS,
  FLEET_REGISTRY_VERSION,
  FLEET_STATE_FIELDS,
  FLEET_VEHICLE_FIELDS,
  createFleetRegistry,
  parseFleetConfiguration,
} from '../../src/fleet';
import type { CityProfileReference, FleetConfiguration } from '../../src/fleet';
import { VEHICLE_CLASS_VERSION } from '../../src/vehicles';
import { runFleetRegistryReport } from './fleet-registry-report';
import type { FleetEvidenceReport } from './fleet-registry-report';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '057-fleet-registry', 'report.json');

function configuration(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: 'session-057',
    worldEpoch: 4,
    scenarioId: 'city-fixture',
    seed: 12345,
    namespace: 'city:fixture:fleet',
    taxiCount: DEFAULT_FLEET_COUNTS.taxis,
    civilianCount: DEFAULT_FLEET_COUNTS.civilians,
    profile: { profileId: 'city-profile', versionId: 'profile-v1' },
    ...overrides,
  };
}

function profileSource(initial: CityProfileReference) {
  let active = initial;
  return {
    activeProfile: () => active,
    activate(versionId: string) {
      active = { profileId: active.profileId, versionId };
    },
    fork(profileId: string) {
      active = { profileId, versionId: active.versionId };
    },
  };
}

test('057 creates the default 24 taxis and 40 civilians with unique stable identities', () => {
  const registry = createFleetRegistry(configuration());
  const vehicles = registry.list();
  assert.equal(vehicles.length, 64);
  assert.equal(registry.counts().taxis, 24);
  assert.equal(registry.counts().civilians, 40);
  assert.equal(new Set(vehicles.map((vehicle) => vehicle.vehicleId)).size, 64);
  for (const vehicle of vehicles) {
    assert.match(vehicle.vehicleId, /^id-v1:/);
    assert.equal(vehicle.classVersion, VEHICLE_CLASS_VERSION);
    assert.equal(vehicle.profileId, 'city-profile');
    assert.ok(['sedan', 'compact'].includes(vehicle.classId));
    assert.ok(vehicle.driverKind === 'TAXI' || vehicle.driverKind === 'CIVILIAN');
    assert.deepEqual(Object.keys(vehicle).sort(), [...FLEET_VEHICLE_FIELDS].sort());
    const state = registry.state(vehicle.vehicleId)!;
    assert.deepEqual(Object.keys(state).sort(), [...FLEET_STATE_FIELDS].sort());
    assert.equal(state.controlMode, 'AUTO');
    assert.equal(state.appliedProfileVersion, 'profile-v1');
    assert.equal(state.tick, 0);
  }
  const report = registry.report();
  assert.equal(report.version, FLEET_REGISTRY_VERSION);
  assert.equal(report.total, 64);
  assert.equal(report.byDriverKind.TAXI, 24);
  assert.equal(report.byDriverKind.CIVILIAN, 40);
  assert.equal(report.matrix.length, 4);
  assert.equal(
    report.matrix.reduce((sum, row) => sum + row.count, 0),
    64,
  );
  registry.dispose();
});

test('057 configurable taxi counts accept 20, 24 and 30 while rejecting out-of-range populations', () => {
  for (const taxis of [20, 24, 30]) {
    const registry = createFleetRegistry(configuration({ taxiCount: taxis, civilianCount: 20 }));
    assert.equal(registry.counts().taxis, taxis);
    assert.equal(registry.counts().civilians, 20);
    assert.equal(registry.report().taxis, taxis);
    registry.dispose();
  }
  for (const civilians of [20, 40]) {
    const registry = createFleetRegistry(configuration({ civilianCount: civilians }));
    assert.equal(registry.counts().civilians, civilians);
    registry.dispose();
  }
  for (const invalid of [
    { taxiCount: FLEET_LIMITS.taxisMinimum - 1 },
    { taxiCount: FLEET_LIMITS.taxisMaximum + 1 },
    { civilianCount: FLEET_LIMITS.civiliansMinimum - 1 },
    { civilianCount: FLEET_LIMITS.civiliansMaximum + 1 },
    { taxiCount: 24.5 },
    { civilianCount: 20.25 },
    { seed: 0x1_0000_0000 },
    { seed: -1 },
    { namespace: 'x'.repeat(FLEET_LIMITS.idCodeUnits) },
  ]) {
    assert.throws(() => createFleetRegistry(configuration(invalid)), /count|seed|namespace|range/i);
  }
  assert.throws(() => parseFleetConfiguration({ ...configuration(), extra: true }), /contract/i);
});

test('057 seed creation is deterministic and independent of population order', () => {
  const first = createFleetRegistry(configuration());
  const second = createFleetRegistry(configuration());
  assert.deepEqual(first.list(), second.list());
  const small = createFleetRegistry(configuration({ taxiCount: 20 }));
  const large = createFleetRegistry(configuration({ taxiCount: 30 }));
  const smallIds = new Set(small.list().map((vehicle) => vehicle.vehicleId));
  for (const vehicle of large.list())
    if (smallIds.has(vehicle.vehicleId))
      assert.equal(vehicle.classId, small.get(vehicle.vehicleId)!.classId);
  const otherSeed = createFleetRegistry(configuration({ seed: 54321 }));
  assert.notDeepEqual(
    otherSeed.list().map((vehicle) => `${vehicle.vehicleId}:${vehicle.classId}`),
    first.list().map((vehicle) => `${vehicle.vehicleId}:${vehicle.classId}`),
  );
  const planned = createFleetRegistry(
    configuration({
      classPlan: {
        taxis: Array.from({ length: 24 }, () => 'compact'),
        civilians: Array.from({ length: 40 }, () => 'sedan'),
      },
    }),
  );
  assert.equal(planned.report().byClass.compact, 24);
  assert.equal(planned.report().byClass.sedan, 40);
  first.dispose();
  second.dispose();
  small.dispose();
  large.dispose();
  otherSeed.dispose();
  planned.dispose();
});

test('057 rejects duplicate identities and incompatible class/driver configuration', () => {
  const registry = createFleetRegistry(configuration({ civilianCount: 20 }));
  const taxi = registry.list().find((vehicle) => vehicle.driverKind === 'TAXI')!;
  assert.throws(
    () => registry.addVehicle('TAXI', 'sedan', { slot: taxi.slot }),
    /Duplicate fleet vehicle id/,
  );
  assert.throws(() => registry.addVehicle('BUS' as 'TAXI', 'sedan'), /enum value|driver kind/i);
  assert.throws(() => registry.addVehicle('CIVILIAN', 'bus' as 'sedan'), /enum value|class/i);
  assert.throws(
    () => createFleetRegistry(configuration({ classPlan: { taxis: ['sedan'], civilians: [] } })),
    /class plan/i,
  );
  assert.throws(
    () =>
      createFleetRegistry(
        configuration({
          classPlan: {
            taxis: Array.from({ length: 24 }, () => 'bus'),
            civilians: Array.from({ length: 40 }, () => 'sedan'),
          },
        }),
      ),
    /enum value|class/i,
  );
  assert.throws(
    () => createFleetRegistry(configuration({ profile: { profileId: 'city-profile' } })),
    /contract/i,
  );
  registry.dispose();
});

test('057 keeps independent per-vehicle state that never depends on camera or renderer', () => {
  const registry = createFleetRegistry(configuration());
  const taxis = registry.list().filter((vehicle) => vehicle.driverKind === 'TAXI');
  const first = taxis[0]!;
  const second = taxis[1]!;
  const firstState = registry.state(first.vehicleId)!;
  const secondState = registry.state(second.vehicleId)!;
  assert.notEqual(firstState, secondState);
  registry.updateState(first.vehicleId, {
    tick: 5,
    controlMode: 'LEARNING',
    appliedProfileVersion: 'profile-v2',
  });
  assert.equal(registry.state(first.vehicleId)!.controlMode, 'LEARNING');
  assert.equal(registry.state(first.vehicleId)!.appliedProfileVersion, 'profile-v2');
  assert.deepEqual(registry.state(second.vehicleId), {
    tick: 0,
    controlMode: 'AUTO',
    appliedProfileVersion: 'profile-v1',
  });
  assert.equal(registry.updateState(second.vehicleId, { tick: 6 }).tick, 6);
  assert.throws(() => registry.updateState(first.vehicleId, { tick: 4 }), /Stale/);
  assert.throws(() => registry.updateState('missing-taxi', { tick: 1 }), /Unknown/);
  assert.throws(
    () => registry.updateState(first.vehicleId, { tick: 7, selected: true }),
    /Unknown/,
  );
  assert.throws(
    () => registry.updateState(first.vehicleId, { tick: 7, controlMode: 'CAMERA' }),
    /enum value/i,
  );
  const immutable = registry.state(first.vehicleId)! as unknown as { controlMode: string };
  assert.throws(() => {
    immutable.controlMode = 'AUTO';
  }, TypeError);
  const baseline = JSON.stringify(
    registry.list().map((vehicle) => [vehicle.vehicleId, registry.state(vehicle.vehicleId)]),
  );
  const presentation = { selectedVehicleId: first.vehicleId, visible: false };
  for (let index = 0; index < 50; index += 1) {
    registry.list();
    registry.report();
    registry.counts();
    presentation.selectedVehicleId =
      presentation.selectedVehicleId === first.vehicleId ? second.vehicleId : first.vehicleId;
    presentation.visible = !presentation.visible;
  }
  assert.equal(
    JSON.stringify(
      registry.list().map((vehicle) => [vehicle.vehicleId, registry.state(vehicle.vehicleId)]),
    ),
    baseline,
  );
  registry.dispose();
});

test('057 binds new vehicles to the active city profile version and preserves older bindings', () => {
  const source = profileSource({ profileId: 'city-profile', versionId: 'profile-v1' });
  const registry = createFleetRegistry(configuration({ civilianCount: 20 }), {
    profileSource: source,
  });
  const existing = registry.list()[0]!;
  assert.equal(registry.state(existing.vehicleId)!.appliedProfileVersion, 'profile-v1');
  source.activate('profile-v2');
  const added = registry.addVehicle('TAXI', 'compact', { tick: 9 });
  assert.equal(added.profileId, 'city-profile');
  assert.equal(registry.state(added.vehicleId)!.appliedProfileVersion, 'profile-v2');
  assert.equal(registry.state(existing.vehicleId)!.appliedProfileVersion, 'profile-v1');
  registry.updateState(existing.vehicleId, {
    tick: 10,
    appliedProfileVersion: 'profile-v2',
  });
  assert.equal(registry.state(existing.vehicleId)!.appliedProfileVersion, 'profile-v2');
  source.fork('foreign-profile');
  assert.throws(() => registry.addVehicle('CIVILIAN', 'sedan'), /identity mismatch/);
  registry.dispose();
});

test('057 disposes every owned vehicle and state back to zero', () => {
  const registry = createFleetRegistry(configuration({ taxiCount: 30, civilianCount: 20 }));
  assert.throws(() => registry.addVehicle('TAXI', 'sedan'), /taxi capacity/);
  const civilian = registry.list().find((vehicle) => vehicle.driverKind === 'CIVILIAN')!;
  assert.equal(registry.removeVehicle(civilian.vehicleId), true);
  assert.equal(registry.removeVehicle(civilian.vehicleId), false);
  assert.equal(registry.get(civilian.vehicleId), undefined);
  assert.equal(registry.state(civilian.vehicleId), undefined);
  assert.throws(
    () => registry.addVehicle('CIVILIAN', 'sedan', { slot: FLEET_LIMITS.slotMaximum + 1 }),
    /range|slot/i,
  );
  assert.equal(registry.addVehicle('CIVILIAN', 'compact').driverKind, 'CIVILIAN');
  const ids = registry.list().map((vehicle) => vehicle.vehicleId);
  registry.dispose();
  registry.dispose();
  assert.deepEqual(registry.counts(), { vehicles: 0, taxis: 0, civilians: 0 });
  assert.deepEqual(registry.list(), []);
  assert.equal(registry.get(ids[0]!), undefined);
  assert.equal(registry.state(ids[0]!), undefined);
  assert.throws(() => registry.addVehicle('TAXI', 'sedan'), /disposed/);
  assert.throws(() => registry.updateState(ids[0]!, { tick: 1 }), /disposed/);
  assert.throws(() => registry.removeVehicle(ids[0]!), /disposed/);
  const report = registry.report();
  assert.equal(report.total, 0);
  assert.equal(report.taxis, 0);
  assert.equal(report.civilians, 0);
  assert.ok(report.matrix.every((row) => row.count === 0));
});

test('057 committed evidence report is the current fleet transcript', () => {
  const report = runFleetRegistryReport();
  const saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as FleetEvidenceReport;
  assert.deepEqual(saved, JSON.parse(JSON.stringify(report)) as FleetEvidenceReport);
});

test('057 configuration keeps the common city profile reference immutable', () => {
  const parsed: FleetConfiguration = parseFleetConfiguration(configuration());
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.profile));
  assert.equal(parsed.profile.versionId, 'profile-v1');
  assert.throws(() => {
    (parsed.profile as { versionId: string }).versionId = 'other';
  }, TypeError);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CITY_ATTRIBUTABLE_FAILURE_REASONS,
  CITY_LIMITS,
  CITY_MISSION_ID,
  CITY_SCHEMA_VERSION,
  cityConsequenceVerdicts,
  cityFidelityVerdicts,
  cityMissionGate,
  cityMissionOutcomes,
  cityMissionReasons,
  evaluateCityMission,
} from '../../src/missions';
import type { CityMissionInput, CityMissionResult } from '../../src/missions';
import { CITY_FIXTURE_VISIBLE_SLOTS, buildCityRun } from './mission-city-fixture';
import type { CityRun, CityRunKind } from './mission-city-fixture';

function withRun(
  kind: CityRunKind,
  check: (run: CityRun, result: CityMissionResult) => void,
): void {
  const run = buildCityRun(kind);
  try {
    check(run, evaluateCityMission(run.input));
  } finally {
    run.dispose();
  }
}

interface MutableVersion {
  profileId: string;
  versionId: string;
  parameters: Record<string, number>;
}

interface MutableVehicle {
  vehicleId: string;
  driverKind: string;
  classId: string;
  controlMode: string;
  appliedProfileVersion: string;
}

interface MutableRide {
  rideId: string;
  taxiId: string;
  state: string;
  reason: string | null;
  totalCostSeconds: number;
}

interface MutableInput {
  profile: MutableVersion;
  versions: MutableVersion[];
  fleet: { taxis: number; civilians: number; vehicles: MutableVehicle[] };
  observation: { windowTicks: number; visibleVehicleIds: string[] };
  activation: {
    profileId: string;
    versionId: string;
    appliedTick: number;
    vehiclesUpdated: number;
  };
  rides: MutableRide[];
  [key: string]: unknown;
}

function mutableInput(input: CityMissionInput): MutableInput {
  return JSON.parse(JSON.stringify(input)) as MutableInput;
}

test('122 contract: both verdicts are closed and independent of the camera set', () => {
  assert.equal(CITY_SCHEMA_VERSION, '122-mission-city-v1');
  assert.equal(CITY_MISSION_ID, 'campaign-6-city-copies-you');
  assert.equal(CITY_LIMITS.vehicles, 70);
  assert.equal(CITY_LIMITS.rides, 1024);
  assert.deepEqual([...cityFidelityVerdicts], ['EXACT', 'PARTIAL', 'NONE']);
  assert.deepEqual([...cityConsequenceVerdicts], ['CLEAN', 'HARMFUL', 'NO_SERVICE']);
  assert.deepEqual([...cityMissionOutcomes], ['PROGRESS', 'NO_PROGRESS']);
  assert.deepEqual([...cityMissionReasons], ['NO_RIDES']);
  assert.deepEqual([...CITY_ATTRIBUTABLE_FAILURE_REASONS], ['TAXI_DAMAGED', 'TAXI_BLOCKED']);
});

test('122 prudent fleet: every vehicle is evaluated and invisible exposure is a real number', () => {
  withRun('PRUDENT', (run, result) => {
    assert.equal(result.coverage.evaluatedVehicles, 40);
    assert.equal(result.coverage.taxis, 20);
    assert.equal(result.coverage.civilians, 20);
    assert.equal(result.coverage.complete, true);
    assert.equal(result.coverage.omittedVehicles, 0);
    assert.equal(result.observation.visibleVehicles, CITY_FIXTURE_VISIBLE_SLOTS.length);
    assert.equal(result.observation.invisibleVehicles, 37);
    assert.equal(result.exposure.totalRides, 8);
    assert.equal(result.exposure.visibleRides, 3);
    assert.equal(result.exposure.invisibleRides, 5);
    assert.ok(result.exposure.invisibleSeconds > 0);
    assert.ok(result.exposure.totalSeconds > result.exposure.visibleSeconds);
    assert.equal(
      result.exposure.invisibleFraction,
      result.exposure.invisibleSeconds / result.exposure.totalSeconds,
    );
    assert.equal(result.exposure.deliveredSeconds, result.exposure.totalSeconds);
    assert.equal(result.exposure.missedSeconds, 0);
    assert.ok(result.exposure.invisibleServedTaxis >= 5);
    assert.equal(result.fidelity.verdict, 'EXACT');
    assert.equal(result.fidelity.matchedVehicles, 40);
    assert.equal(result.fidelity.matchedFraction, 1);
    assert.equal(result.consequences.verdict, 'CLEAN');
    assert.equal(result.consequences.attributableFailures, 0);
    assert.equal(result.consequences.completedRides, 8);
    assert.equal(result.consequences.visible.completedRides, 3);
    assert.equal(result.consequences.invisible.completedRides, 5);
    const gate = cityMissionGate(result);
    assert.equal(gate.outcome, 'PROGRESS');
    assert.equal(gate.reason, null);
    assert.equal(gate.fidelityVerdict, 'EXACT');
    assert.equal(gate.consequenceVerdict, 'CLEAN');
    assert.equal(
      run.ridePlan.length,
      result.vehicles.reduce((sum, row) => sum + row.outcome.rides, 0),
    );
  });
});

test('122 risky fleet: exact imitation and harmful consequences are reported separately', () => {
  withRun('RISKY', (_run, result) => {
    assert.equal(result.fidelity.verdict, 'EXACT');
    assert.equal(result.fidelity.matchedVehicles, 40);
    assert.equal(result.consequences.verdict, 'HARMFUL');
    assert.equal(result.consequences.completedRides, 3);
    assert.equal(result.consequences.failedRides, 5);
    assert.equal(result.consequences.attributableFailures, 5);
    assert.equal(result.consequences.visible.attributableFailures, 1);
    assert.equal(result.consequences.invisible.attributableFailures, 4);
    assert.ok(result.consequences.harmRate !== null);
    assert.equal(result.consequences.harmRate, 5 / 8);
    assert.ok(result.consequences.missedSeconds > 0);
    assert.ok(result.consequences.failureReasons.some((row) => row.reason === 'TAXI_DAMAGED'));
    const damaged = result.vehicles.filter((row) => row.outcome.attributableFailures > 0);
    assert.equal(damaged.length, 5);
    assert.ok(damaged.some((row) => row.visible));
    assert.ok(damaged.some((row) => !row.visible));
    assert.equal(cityMissionGate(result).outcome, 'PROGRESS');
  });
});

test('122 stale fleet: partial imitation can still deliver clean service', () => {
  withRun('STALE', (_run, result) => {
    assert.equal(result.fidelity.verdict, 'PARTIAL');
    assert.equal(result.fidelity.matchedVehicles, 34);
    assert.ok(result.fidelity.matchedFraction !== null);
    assert.ok(result.fidelity.matchedFraction! < 1);
    assert.ok(result.fidelity.matchedFraction! > 0);
    assert.equal(result.fidelity.versionAdoption.activeVersionVehicles, 34);
    assert.equal(result.fidelity.versionAdoption.otherVersions.length, 1);
    assert.equal(result.fidelity.versionAdoption.otherVersions[0]!.vehicles, 6);
    assert.equal(result.consequences.verdict, 'CLEAN');
    assert.equal(result.consequences.completedRides, 8);
    assert.equal(result.consequences.attributableFailures, 0);
    assert.ok(result.fidelity.parameters.some((row) => row.maxAbsoluteDeviation > 0));
  });
});

test('122 mixed fleet: an invisible taxi keeps its rides and is never dropped', () => {
  withRun('PRUDENT', (run, result) => {
    const visible = new Set(result.observation.visibleVehicleIds);
    assert.equal(visible.size, 3);
    const invisibleServing = result.vehicles.filter(
      (row) => !visible.has(row.vehicleId) && row.outcome.rides > 0,
    );
    assert.equal(invisibleServing.length, 5);
    assert.ok(invisibleServing.every((row) => row.outcome.completedRides === 1));
    assert.equal(result.exposure.servedVehicles, 8);
    assert.equal(result.exposure.unservedVehicles, 32);
    assert.equal(
      result.vehicles.filter((row) => row.visible).length,
      result.observation.visibleVehicles,
    );
    assert.ok(result.vehicles.every((row) => row.vehicleId.length > 0));
    assert.equal(run.input.fleet.vehicles.length, result.coverage.evaluatedVehicles);
  });
});

test('122 refuses an incompatible profile or a foreign activation', () => {
  withRun('PRUDENT', (run) => {
    const incompatible = mutableInput(run.input);
    incompatible.versions[0].profileId = 'city:foreign';
    assert.throws(() => evaluateCityMission(incompatible), /Incompatible profile version/);

    const missingKey = mutableInput(run.input);
    delete missingKey.versions[0].parameters.stop_full_probability;
    assert.throws(() => evaluateCityMission(missingKey), /parameter set/);

    const foreignActivation = mutableInput(run.input);
    foreignActivation.activation.versionId = 'city-122-other';
    assert.throws(() => evaluateCityMission(foreignActivation), /different profile version/);

    const foreignProfile = mutableInput(run.input);
    foreignProfile.activation.profileId = 'city:foreign';
    assert.throws(() => evaluateCityMission(foreignProfile), /different profile/);
  });
});

test('122 refuses an input that could hide a fleet vehicle or a ride', () => {
  withRun('PRUDENT', (run) => {
    const incomplete = mutableInput(run.input);
    incomplete.fleet.vehicles.pop();
    assert.throws(() => evaluateCityMission(incomplete), /incomplete/i);

    const duplicate = mutableInput(run.input);
    duplicate.fleet.vehicles[1].vehicleId = duplicate.fleet.vehicles[0].vehicleId;
    assert.throws(() => evaluateCityMission(duplicate), /Duplicate city fleet vehicle/);

    const unknownVisible = mutableInput(run.input);
    unknownVisible.observation.visibleVehicleIds.push('vehicle:unknown');
    assert.throws(() => evaluateCityMission(unknownVisible), /not in the evaluated fleet/);

    const civilianRide = mutableInput(run.input);
    const civilian = run.input.fleet.vehicles.find((row) => row.driverKind === 'CIVILIAN')!;
    civilianRide.rides[0].taxiId = civilian.vehicleId;
    assert.throws(() => evaluateCityMission(civilianRide), /evaluated taxi/);

    const openRide = mutableInput(run.input);
    openRide.rides[0].state = 'TO_PICKUP';
    assert.throws(() => evaluateCityMission(openRide), /terminal 061 rides/);

    const duplicateRide = mutableInput(run.input);
    duplicateRide.rides[1].rideId = duplicateRide.rides[0].rideId;
    assert.throws(() => evaluateCityMission(duplicateRide), /Duplicate city ride/);

    const unknownVersion = mutableInput(run.input);
    unknownVersion.fleet.vehicles[0].appliedProfileVersion = 'version:missing';
    assert.throws(() => evaluateCityMission(unknownVersion), /Applied version is missing/);

    const cameraField = mutableInput(run.input);
    cameraField.camera = { frustum: 'main' };
    assert.throws(() => evaluateCityMission(cameraField), /Unknown city mission field/);
  });
});

test('122 no rides: service is unavailable but the fleet is still evaluated', () => {
  withRun('PRUDENT', (run) => {
    const idle = mutableInput(run.input);
    idle.rides = [];
    const result = evaluateCityMission(idle);
    assert.equal(result.coverage.evaluatedVehicles, 40);
    assert.equal(result.exposure.totalRides, 0);
    assert.equal(result.exposure.invisibleFraction, null);
    assert.equal(result.consequences.verdict, 'NO_SERVICE');
    assert.equal(result.consequences.harmRate, null);
    const gate = cityMissionGate(result);
    assert.equal(gate.outcome, 'NO_PROGRESS');
    assert.equal(gate.reason, 'NO_RIDES');
  });
});

test('122 is read-only and immutable', () => {
  withRun('PRUDENT', (_run, result) => {
    assert.equal(result.profileWrites, 0);
    assert.equal(result.learningJobs, 0);
    assert.equal(result.fidelity.profileWrites, 0);
    assert.equal(result.fidelity.learningJobs, 0);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.fidelity));
    assert.ok(Object.isFrozen(result.consequences));
    assert.ok(Object.isFrozen(result.vehicles));
    assert.throws(() => {
      (result.fidelity as unknown as { verdict: string }).verdict = 'NONE';
    });
    assert.equal(result.fidelity.verdict, 'EXACT');
  });
});

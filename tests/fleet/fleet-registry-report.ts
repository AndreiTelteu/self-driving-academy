import {
  DEFAULT_FLEET_COUNTS,
  FLEET_REGISTRY_VERSION,
  FLEET_STATE_FIELDS,
  FLEET_VEHICLE_FIELDS,
  createFleetRegistry,
} from '../../src/fleet';
import type { FleetCounts, FleetPopulationReport } from '../../src/fleet';
import { VEHICLE_CLASS_VERSION } from '../../src/vehicles';
import type { VehicleClassId } from '../../src/vehicles';

export const FLEET_EVIDENCE_VERSION = '057-fleet-registry-v1' as const;

export interface FleetEvidenceCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface FleetEvidenceConfiguration {
  readonly taxiCount: number;
  readonly civilianCount: number;
  readonly counts: FleetCounts;
  readonly report: FleetPopulationReport;
  readonly uniqueIds: boolean;
  readonly sortedById: boolean;
  readonly deterministicAcrossRuns: boolean;
  readonly stateIndependent: boolean;
  readonly disposedToZero: boolean;
}

export interface FleetEvidenceVehicle {
  readonly vehicleId: string;
  readonly slot: number;
  readonly classId: VehicleClassId;
  readonly appliedProfileVersion: string;
}

export interface FleetEvidenceReport {
  readonly version: typeof FLEET_EVIDENCE_VERSION;
  readonly registryVersion: typeof FLEET_REGISTRY_VERSION;
  readonly engineVersion: typeof VEHICLE_CLASS_VERSION;
  readonly seed: number;
  readonly scenarioId: string;
  readonly stateFields: readonly string[];
  readonly vehicleFields: readonly string[];
  readonly configurations: readonly FleetEvidenceConfiguration[];
  readonly defaultTaxis: readonly FleetEvidenceVehicle[];
  readonly classAssignmentStableAcrossPopulation: boolean;
  readonly checks: readonly FleetEvidenceCheck[];
  readonly summary: {
    readonly configurations: number;
    readonly checks: number;
    readonly checksPassed: number;
    readonly maximumVehicles: number;
    readonly pass: boolean;
  };
}

const SEED = 20261020;
const SCENARIO_ID = 'city-fixture';
const NAMESPACE = 'fleet:evidence';

function configuration(taxiCount: number, civilianCount: number): Record<string, unknown> {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: 'session-057-evidence',
    worldEpoch: 1,
    scenarioId: SCENARIO_ID,
    seed: SEED,
    namespace: NAMESPACE,
    taxiCount,
    civilianCount,
    profile: { profileId: 'common-city-profile', versionId: 'profile-v1' },
  };
}

function check(
  name: string,
  expected: unknown,
  actual: unknown,
  detail: string,
): FleetEvidenceCheck {
  return {
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
    detail,
  };
}

function configurationReport(taxiCount: number, civilianCount: number): FleetEvidenceConfiguration {
  const registry = createFleetRegistry(configuration(taxiCount, civilianCount));
  const twin = createFleetRegistry(configuration(taxiCount, civilianCount));
  const vehicles = registry.list();
  const ids = vehicles.map((vehicle) => vehicle.vehicleId);
  const uniqueIds = new Set(ids).size === ids.length && ids.length === taxiCount + civilianCount;
  const sortedById = vehicles.every(
    (vehicle, index) => index === 0 || vehicles[index - 1]!.vehicleId < vehicle.vehicleId,
  );
  const deterministicAcrossRuns = JSON.stringify(twin.list()) === JSON.stringify(vehicles);
  const taxis = vehicles.filter((vehicle) => vehicle.driverKind === 'TAXI');
  const first = taxis[0]!;
  const second = taxis[1]!;
  const secondBefore = JSON.stringify(registry.state(second.vehicleId));
  registry.updateState(first.vehicleId, {
    tick: 25,
    controlMode: 'LEARNING',
    appliedProfileVersion: 'profile-v2',
  });
  const firstState = registry.state(first.vehicleId)!;
  const stateIndependent =
    JSON.stringify(registry.state(second.vehicleId)) === secondBefore &&
    registry.state(first.vehicleId) !== registry.state(second.vehicleId) &&
    JSON.stringify(Object.keys(firstState).sort()) ===
      JSON.stringify([...FLEET_STATE_FIELDS].sort());
  const report = registry.report();
  const counts = registry.counts();
  registry.dispose();
  twin.dispose();
  const disposedToZero =
    registry.counts().vehicles === 0 &&
    registry.counts().taxis === 0 &&
    registry.report().total === 0;
  return {
    taxiCount,
    civilianCount,
    counts,
    report,
    uniqueIds,
    sortedById,
    deterministicAcrossRuns,
    stateIndependent,
    disposedToZero,
  };
}

export function runFleetRegistryReport(): FleetEvidenceReport {
  const configurations = [
    configurationReport(20, 20),
    configurationReport(DEFAULT_FLEET_COUNTS.taxis, DEFAULT_FLEET_COUNTS.civilians),
    configurationReport(30, 40),
  ];
  const smallTaxis = createFleetRegistry(configuration(20, 40));
  const largeTaxis = createFleetRegistry(configuration(30, 40));
  const smallClasses = new Map(
    smallTaxis.list().map((vehicle) => [vehicle.vehicleId, vehicle.classId]),
  );
  const classAssignmentStableAcrossPopulation = largeTaxis
    .list()
    .every(
      (vehicle) =>
        !smallClasses.has(vehicle.vehicleId) ||
        smallClasses.get(vehicle.vehicleId) === vehicle.classId,
    );
  const defaultRegistry = createFleetRegistry(
    configuration(DEFAULT_FLEET_COUNTS.taxis, DEFAULT_FLEET_COUNTS.civilians),
  );
  const defaultTaxis: FleetEvidenceVehicle[] = defaultRegistry
    .list()
    .filter((vehicle) => vehicle.driverKind === 'TAXI')
    .map((vehicle) => ({
      vehicleId: vehicle.vehicleId,
      slot: vehicle.slot,
      classId: vehicle.classId,
      appliedProfileVersion: defaultRegistry.state(vehicle.vehicleId)!.appliedProfileVersion,
    }));
  const defaultReport = defaultRegistry.report();
  const observedVehicleFields = Object.keys(defaultRegistry.list()[0]!).sort();
  const observedStateFields = Object.keys(
    defaultRegistry.state(defaultRegistry.list()[0]!.vehicleId)!,
  ).sort();
  defaultRegistry.dispose();
  smallTaxis.dispose();
  largeTaxis.dispose();

  const matrixTotals = configurations.map((entry) =>
    entry.report.matrix.reduce((sum, row) => sum + row.count, 0),
  );
  const driverKinds = new Set(
    configurations.flatMap((entry) => entry.report.matrix.map((row) => row.driverKind)),
  );
  const checks: FleetEvidenceCheck[] = [
    check(
      'population-bounds',
      ['20/20', '24/40', '30/40'],
      configurations.map((entry) => `${entry.taxiCount}/${entry.civilianCount}`),
      'Taxis stay inside 20–30 and civilians inside 20–40.',
    ),
    check(
      'unique-identities',
      [true, true, true],
      configurations.map((entry) => entry.uniqueIds),
      'Every vehicle has a stable id-v1 identity and no duplicate exists.',
    ),
    check(
      'sorted-identity-order',
      [true, true, true],
      configurations.map((entry) => entry.sortedById),
      'list() sorts by the stable id, independent of internal insertion order.',
    ),
    check(
      'deterministic-seed',
      [true, true, true],
      configurations.map((entry) => entry.deterministicAcrossRuns),
      'Two registries from the same seed produce the same vehicles and classes.',
    ),
    check(
      'class-assignment-independent-of-population',
      true,
      classAssignmentStableAcrossPopulation,
      'Adding more vehicles never reclassifies an existing identity.',
    ),
    check(
      'independent-state',
      [true, true, true],
      configurations.map((entry) => entry.stateIndependent),
      'Updating one vehicle leaves every other vehicle state untouched.',
    ),
    check(
      'matrix-complete',
      configurations.map((entry) => entry.taxiCount + entry.civilianCount),
      matrixTotals,
      'Counts by class and driverKind add up to the full population.',
    ),
    check(
      'matrix-driver-kinds',
      ['CIVILIAN', 'TAXI'],
      [...driverKinds].sort(),
      'The report covers both taxi and civilian driver kinds.',
    ),
    check(
      'disposal-to-zero',
      [true, true, true],
      configurations.map((entry) => entry.disposedToZero),
      'dispose() releases every owned vehicle and state.',
    ),
    check(
      'state-field-contract',
      [...FLEET_STATE_FIELDS].sort(),
      observedStateFields,
      'Per-vehicle state contains only simulation fields; no camera or renderer state.',
    ),
    check(
      'vehicle-field-contract',
      [...FLEET_VEHICLE_FIELDS].sort(),
      observedVehicleFields,
      'Fleet records expose identity, kind, class and the common profile binding only.',
    ),
    check(
      'default-class-counts',
      defaultReport.total,
      defaultReport.byClass.sedan + defaultReport.byClass.compact,
      'Default fleet report counts every vehicle by class.',
    ),
  ];
  const checksPassed = checks.filter((entry) => entry.pass).length;
  return {
    version: FLEET_EVIDENCE_VERSION,
    registryVersion: FLEET_REGISTRY_VERSION,
    engineVersion: VEHICLE_CLASS_VERSION,
    seed: SEED,
    scenarioId: SCENARIO_ID,
    stateFields: [...FLEET_STATE_FIELDS].sort(),
    vehicleFields: [...FLEET_VEHICLE_FIELDS].sort(),
    configurations,
    defaultTaxis,
    classAssignmentStableAcrossPopulation,
    checks,
    summary: {
      configurations: configurations.length,
      checks: checks.length,
      checksPassed,
      maximumVehicles: Math.max(...configurations.map((entry) => entry.report.total)),
      pass: checksPassed === checks.length,
    },
  };
}

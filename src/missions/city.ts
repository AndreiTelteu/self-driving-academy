import {
  RIDE_CANCEL_REASONS,
  RIDE_FAILURE_REASONS,
  RIDE_TERMINAL_STATES,
  rideStates,
} from '../fleet';
import type { RideState } from '../fleet';
import { getParameterDefinition, validateParameterValue } from '../profiles';
import { choice, number, record, requireContract, tick } from '../sessions';
import { VEHICLE_CLASSES, controlModes, vehicleClass } from '../vehicles';
import type { ControlMode, VehicleClassId } from '../vehicles';
import { boundedId, compareText, plainFields, requireRequired } from './contracts';

/**
 * 122 "the city copies you": the whole fleet is evaluated with the player's profile.
 *
 * The mission never looks at the camera to decide what counts. It receives one fact set per fleet
 * vehicle from the real 057 registry (identity, driver kind, class, control mode, applied 109
 * version) and the real 061 terminal rides. The camera only supplies an observation set: a vehicle
 * that is not in it is *invisible*, never *excluded*. Both are evaluated, and the report splits
 * service and consequences between them so an invisible taxi's exposure is a reported number.
 *
 * Two results are deliberately independent:
 *
 * - `fidelity` answers "how well does the fleet reproduce the player's profile?" by comparing the
 *   values of every applied 109 version with the player's published version, parameter by
 *   parameter. It is a style result.
 * - `consequences` answers "what happened in the world?" from the real 061 ride outcomes (service
 *   delivered, missed service, damaged/blocked taxis). It is a world result.
 *
 * A fleet can reproduce a risky profile exactly and still damage taxis, and a stale fleet can
 * deliver clean service. The contract reports both verdicts and never folds them into one score.
 *
 * The module owns no clock, DOM, renderer, profile store, learning queue or random source. It
 * reads immutable facts, writes no profile and queues no learning job.
 */
export const CITY_SCHEMA_VERSION = '122-mission-city-v1' as const;
export const CITY_MISSION_ID = 'campaign-6-city-copies-you' as const;

export const CITY_LIMITS = Object.freeze({
  version: CITY_SCHEMA_VERSION,
  /** Real 057 fleet capacity. */
  vehicles: 70,
  /** Real 059 request capacity; one terminal ride per request. */
  rides: 1024,
  /** Bounded 092 parameters in one published version. */
  parametersPerVersion: 96,
  /** Code units per vehicle, version and ride identity. */
  idCodeUnits: 256,
  /** Two values are the same profile value only within this absolute tolerance. */
  valueEpsilon: 1e-9,
  /** One evaluation window: 24 hours at the authoritative 60 Hz tick. */
  windowTicks: 5_184_000,
});

/**
 * Closed failure reasons a profile can be held responsible for. A damaged or blocked taxi is a
 * fleet outcome; an abandoned/restarted scenario or an unreachable route is an environment fact
 * and stays reported but unattributed.
 */
export const CITY_ATTRIBUTABLE_FAILURE_REASONS = ['TAXI_DAMAGED', 'TAXI_BLOCKED'] as const;
export type CityAttributableFailureReason = (typeof CITY_ATTRIBUTABLE_FAILURE_REASONS)[number];

export const cityFidelityVerdicts = ['EXACT', 'PARTIAL', 'NONE'] as const;
export type CityFidelityVerdict = (typeof cityFidelityVerdicts)[number];

export const cityConsequenceVerdicts = ['CLEAN', 'HARMFUL', 'NO_SERVICE'] as const;
export type CityConsequenceVerdict = (typeof cityConsequenceVerdicts)[number];

export const cityMissionOutcomes = ['PROGRESS', 'NO_PROGRESS'] as const;
export type CityMissionOutcome = (typeof cityMissionOutcomes)[number];

export const cityMissionReasons = ['NO_RIDES'] as const;
export type CityMissionReason = (typeof cityMissionReasons)[number];

export type CityDriverKind = 'TAXI' | 'CIVILIAN';

/** One immutable 109 version as the mission needs it: identity plus real 092 values. */
export interface CityProfileFacts {
  readonly profileId: string;
  readonly versionId: string;
  readonly parameters: Readonly<Record<string, number>>;
}

/** One 057 vehicle with its applied 110 version; visibility is observation state, not fleet state. */
export interface CityFleetVehicleFacts {
  readonly vehicleId: string;
  readonly driverKind: CityDriverKind;
  readonly classId: VehicleClassId;
  readonly controlMode: ControlMode;
  readonly appliedProfileVersion: string;
}

export interface CityFleetFacts {
  readonly taxis: number;
  readonly civilians: number;
  readonly vehicles: readonly CityFleetVehicleFacts[];
}

/** The camera/render observation set; every other evaluated vehicle is invisible. */
export interface CityObservationFacts {
  readonly windowTicks: number;
  readonly visibleVehicleIds: readonly string[];
}

/** The real 110 apply that made the player's version the fleet target. */
export interface CityActivationFacts {
  readonly profileId: string;
  readonly versionId: string;
  readonly appliedTick: number;
  readonly vehiclesUpdated: number;
}

/** The 061 fields the mission consumes from a closed ride. */
export interface CityRideFacts {
  readonly rideId: string;
  readonly taxiId: string;
  readonly state: RideState;
  readonly reason: string | null;
  readonly totalCostSeconds: number;
}

export interface CityMissionInput {
  readonly profile: CityProfileFacts;
  readonly versions: readonly CityProfileFacts[];
  readonly fleet: CityFleetFacts;
  readonly observation: CityObservationFacts;
  readonly activation: CityActivationFacts;
  readonly rides: readonly CityRideFacts[];
}

export interface CityParameterFidelity {
  readonly key: string;
  readonly expected: number;
  readonly matchedVehicles: number;
  readonly meanAbsoluteDeviation: number;
  readonly maxAbsoluteDeviation: number;
}

export interface CityVehicleFidelity {
  readonly matched: boolean;
  readonly matchedKeys: number;
  readonly totalKeys: number;
  readonly mismatchedKeys: readonly string[];
  readonly maxAbsoluteDeviation: number;
}

export interface CityVehicleOutcome {
  readonly rides: number;
  readonly completedRides: number;
  readonly failedRides: number;
  readonly cancelledRides: number;
  readonly attributableFailures: number;
  /** Real 061 planned service seconds: the taxi was exposed to the city even if the ride failed. */
  readonly exposureSeconds: number;
  readonly deliveredSeconds: number;
  readonly missedSeconds: number;
  readonly failureReasons: readonly string[];
}

export interface CityVehicleResult extends CityFleetVehicleFacts {
  readonly visible: boolean;
  readonly fidelity: CityVehicleFidelity;
  readonly outcome: CityVehicleOutcome;
}

export interface CityVersionAdoption {
  readonly versionId: string;
  readonly vehicles: number;
}

export interface CityFidelity {
  readonly verdict: CityFidelityVerdict;
  readonly parameters: readonly CityParameterFidelity[];
  readonly evaluatedVehicles: number;
  readonly matchedVehicles: number;
  readonly matchedCells: number;
  readonly totalCells: number;
  readonly matchedFraction: number | null;
  readonly versionAdoption: Readonly<{
    activeVersionVehicles: number;
    otherVersions: readonly CityVersionAdoption[];
  }>;
  readonly byDriverKind: Readonly<
    Record<CityDriverKind, Readonly<{ evaluated: number; matchedVehicles: number }>>
  >;
  /** Structural proof that evaluating the fleet never writes a profile. */
  readonly profileWrites: 0;
  readonly learningJobs: 0;
}

export interface CityExposureSplit {
  readonly vehicles: number;
  readonly rides: number;
  readonly completedRides: number;
  readonly failedRides: number;
  readonly cancelledRides: number;
  readonly attributableFailures: number;
  readonly exposureSeconds: number;
  readonly deliveredSeconds: number;
  readonly missedSeconds: number;
}

export interface CityExposure {
  readonly totalSeconds: number;
  readonly visibleSeconds: number;
  readonly invisibleSeconds: number;
  readonly visibleFraction: number | null;
  readonly invisibleFraction: number | null;
  readonly totalRides: number;
  readonly visibleRides: number;
  readonly invisibleRides: number;
  readonly invisibleRideFraction: number | null;
  readonly deliveredSeconds: number;
  readonly missedSeconds: number;
  readonly servedVehicles: number;
  readonly unservedVehicles: number;
  readonly visibleVehicles: number;
  readonly invisibleVehicles: number;
  readonly invisibleServedTaxis: number;
}

export interface CityConsequenceReason {
  readonly reason: string;
  readonly count: number;
}

export interface CityConsequences {
  readonly verdict: CityConsequenceVerdict;
  readonly completedRides: number;
  readonly failedRides: number;
  readonly cancelledRides: number;
  readonly attributableFailures: number;
  readonly harmRate: number | null;
  readonly exposureSeconds: number;
  readonly deliveredSeconds: number;
  readonly missedSeconds: number;
  readonly failureReasons: readonly CityConsequenceReason[];
  readonly visible: CityExposureSplit;
  readonly invisible: CityExposureSplit;
}

export interface CityCoverage {
  readonly evaluatedVehicles: number;
  readonly taxis: number;
  readonly civilians: number;
  /** `true` by construction: an input that omits a declared fleet vehicle is refused. */
  readonly complete: true;
  readonly omittedVehicles: 0;
}

export interface CityMissionResult {
  readonly version: typeof CITY_SCHEMA_VERSION;
  readonly missionId: typeof CITY_MISSION_ID;
  readonly profileId: string;
  readonly profileVersionId: string;
  readonly activation: Readonly<{ appliedTick: number; vehiclesUpdated: number }>;
  readonly observation: Readonly<{
    windowTicks: number;
    visibleVehicles: number;
    invisibleVehicles: number;
    visibleVehicleIds: readonly string[];
  }>;
  readonly coverage: CityCoverage;
  readonly fidelity: CityFidelity;
  readonly exposure: CityExposure;
  readonly consequences: CityConsequences;
  readonly vehicles: readonly CityVehicleResult[];
  readonly profileWrites: 0;
  readonly learningJobs: 0;
}

export interface CityMissionGate {
  readonly missionId: typeof CITY_MISSION_ID;
  readonly outcome: CityMissionOutcome;
  readonly satisfied: boolean;
  readonly reason: CityMissionReason | null;
  readonly fidelityVerdict: CityFidelityVerdict;
  readonly consequenceVerdict: CityConsequenceVerdict;
}

const inputFields = ['profile', 'versions', 'fleet', 'observation', 'activation', 'rides'] as const;
const profileFields = ['profileId', 'versionId', 'parameters'] as const;
const fleetFields = ['taxis', 'civilians', 'vehicles'] as const;
const vehicleFields = [
  'vehicleId',
  'driverKind',
  'classId',
  'controlMode',
  'appliedProfileVersion',
] as const;
const observationFields = ['windowTicks', 'visibleVehicleIds'] as const;
const activationFields = ['profileId', 'versionId', 'appliedTick', 'vehiclesUpdated'] as const;
const rideFields = ['rideId', 'taxiId', 'state', 'reason', 'totalCostSeconds'] as const;

const classIds = Object.freeze(Object.keys(VEHICLE_CLASSES) as VehicleClassId[]);
const driverKinds = ['TAXI', 'CIVILIAN'] as const;
const terminalStates = RIDE_TERMINAL_STATES as readonly RideState[];

interface SplitAccumulator {
  vehicles: number;
  rides: number;
  completedRides: number;
  failedRides: number;
  cancelledRides: number;
  attributableFailures: number;
  exposureSeconds: number;
  deliveredSeconds: number;
}

function emptySplit(): SplitAccumulator {
  return {
    vehicles: 0,
    rides: 0,
    completedRides: 0,
    failedRides: 0,
    cancelledRides: 0,
    attributableFailures: 0,
    exposureSeconds: 0,
    deliveredSeconds: 0,
  };
}

function freezeSplit(split: SplitAccumulator): CityExposureSplit {
  return Object.freeze({
    vehicles: split.vehicles,
    rides: split.rides,
    completedRides: split.completedRides,
    failedRides: split.failedRides,
    cancelledRides: split.cancelledRides,
    attributableFailures: split.attributableFailures,
    exposureSeconds: split.exposureSeconds,
    deliveredSeconds: split.deliveredSeconds,
    missedSeconds: split.exposureSeconds - split.deliveredSeconds,
  });
}

function readParameters(value: unknown, label: string): Readonly<Record<string, number>> {
  const raw = record(value);
  const keys = Object.keys(raw);
  requireContract(
    keys.length > 0 && keys.length <= CITY_LIMITS.parametersPerVersion,
    `Invalid ${label} parameter count`,
  );
  const parameters: Record<string, number> = Object.create(null);
  for (const key of keys) {
    const definition = getParameterDefinition(key);
    parameters[key] = validateParameterValue(key, raw[key], definition.unit);
  }
  return Object.freeze(parameters);
}

function readProfile(value: unknown, label: string): CityProfileFacts {
  const data = plainFields(value, profileFields, label);
  for (const key of profileFields) requireRequired(data, key, label);
  return Object.freeze({
    profileId: boundedId(data.profileId, CITY_LIMITS.idCodeUnits, `${label} profile`),
    versionId: boundedId(data.versionId, CITY_LIMITS.idCodeUnits, `${label} version`),
    parameters: readParameters(data.parameters, label),
  });
}

function readVehicle(value: unknown): CityFleetVehicleFacts {
  const data = plainFields(value, vehicleFields, 'city fleet vehicle');
  for (const key of vehicleFields) requireRequired(data, key, 'city fleet vehicle');
  const classId = vehicleClass(choice(data.classId, classIds)).classId;
  return Object.freeze({
    vehicleId: boundedId(data.vehicleId, CITY_LIMITS.idCodeUnits, 'city fleet vehicle'),
    driverKind: choice(data.driverKind, driverKinds),
    classId,
    controlMode: choice(data.controlMode, controlModes),
    appliedProfileVersion: boundedId(
      data.appliedProfileVersion,
      CITY_LIMITS.idCodeUnits,
      'city applied version',
    ),
  });
}

function readRide(value: unknown): CityRideFacts {
  const data = plainFields(value, rideFields, 'city ride');
  for (const key of rideFields) requireRequired(data, key, 'city ride');
  const state = choice(data.state, rideStates);
  requireContract(
    terminalStates.includes(state),
    'The city mission accepts only terminal 061 rides',
  );
  let reason: string | null = null;
  if (state === 'COMPLETED') {
    requireContract(data.reason === null, 'A completed ride carries no terminal reason');
  } else if (state === 'FAILED') {
    reason = choice(data.reason, RIDE_FAILURE_REASONS);
  } else {
    reason = choice(data.reason, RIDE_CANCEL_REASONS);
  }
  return Object.freeze({
    rideId: boundedId(data.rideId, CITY_LIMITS.idCodeUnits, 'city ride'),
    taxiId: boundedId(data.taxiId, CITY_LIMITS.idCodeUnits, 'city ride taxi'),
    state,
    reason,
    totalCostSeconds: number(data.totalCostSeconds, 0, 1_000_000),
  });
}

function isAttributable(reason: string | null): boolean {
  return (
    reason !== null && (CITY_ATTRIBUTABLE_FAILURE_REASONS as readonly string[]).includes(reason)
  );
}

function sameKeys(left: Readonly<Record<string, number>>, right: Readonly<Record<string, number>>) {
  const leftKeys = Object.keys(left).sort(compareText);
  const rightKeys = Object.keys(right).sort(compareText);
  return leftKeys.length === rightKeys.length && leftKeys.every((key, i) => key === rightKeys[i]);
}

function fidelityOf(
  profile: Readonly<Record<string, number>>,
  applied: Readonly<Record<string, number>>,
): CityVehicleFidelity {
  let matchedKeys = 0;
  let maxAbsoluteDeviation = 0;
  const mismatchedKeys: string[] = [];
  for (const key of Object.keys(profile).sort(compareText)) {
    const expected = profile[key]!;
    const actual = applied[key]!;
    const deviation = Math.abs(actual - expected);
    maxAbsoluteDeviation = Math.max(maxAbsoluteDeviation, deviation);
    if (deviation <= CITY_LIMITS.valueEpsilon) matchedKeys += 1;
    else mismatchedKeys.push(key);
  }
  const totalKeys = Object.keys(profile).length;
  return Object.freeze({
    matched: matchedKeys === totalKeys,
    matchedKeys,
    totalKeys,
    mismatchedKeys: Object.freeze(mismatchedKeys),
    maxAbsoluteDeviation,
  });
}

/**
 * Evaluates every declared fleet vehicle, including the ones outside the camera observation set.
 *
 * The input is refused when it could hide a vehicle: the declared taxi/civilian counts must match
 * the supplied list exactly, every applied version must belong to the player's profile with the
 * same 092 key set, every ride must belong to an evaluated taxi, and the real 110 activation must
 * be the player's version. A camera set that is not a subset of the evaluated fleet is refused too,
 * so a vehicle is never dropped for being invisible.
 */
export function evaluateCityMission(value: unknown): CityMissionResult {
  const data = plainFields(value, inputFields, 'city mission');
  for (const key of inputFields) requireRequired(data, key, 'city mission');

  const profile = readProfile(data.profile, 'city profile');

  const rawVersions = data.versions;
  requireContract(Array.isArray(rawVersions), 'City versions must be an array');
  const versions = new Map<string, CityProfileFacts>();
  for (const raw of rawVersions) {
    const version = readProfile(raw, 'city fleet version');
    requireContract(
      version.profileId === profile.profileId,
      `Incompatible profile version: ${version.profileId}`,
    );
    requireContract(
      sameKeys(version.parameters, profile.parameters),
      `Profile version ${version.versionId} does not share the player's parameter set`,
    );
    requireContract(!versions.has(version.versionId), 'Duplicate city fleet version');
    versions.set(version.versionId, version);
  }
  requireContract(versions.has(profile.versionId), 'The player version is missing from the fleet');

  const fleet = plainFields(data.fleet, fleetFields, 'city fleet');
  for (const key of fleetFields) requireRequired(fleet, key, 'city fleet');
  const taxis = tick(fleet.taxis);
  const civilians = tick(fleet.civilians);
  requireContract(taxis > 0, 'The city mission needs at least one taxi');
  requireContract(taxis + civilians <= CITY_LIMITS.vehicles, 'City fleet exceeds the 057 capacity');
  const rawVehicles = fleet.vehicles;
  requireContract(Array.isArray(rawVehicles), 'City fleet vehicles must be an array');
  const vehicles: CityVehicleResult[] = [];
  const seenVehicles = new Set<string>();
  let taxiCount = 0;
  let civilianCount = 0;
  for (const raw of rawVehicles) {
    const vehicle = readVehicle(raw);
    requireContract(!seenVehicles.has(vehicle.vehicleId), 'Duplicate city fleet vehicle');
    seenVehicles.add(vehicle.vehicleId);
    const version = versions.get(vehicle.appliedProfileVersion);
    requireContract(
      version !== undefined,
      `Applied version is missing from the evaluated fleet: ${vehicle.appliedProfileVersion}`,
    );
    if (vehicle.driverKind === 'TAXI') taxiCount += 1;
    else civilianCount += 1;
    const fidelity = fidelityOf(profile.parameters, version.parameters);
    vehicles.push({
      ...vehicle,
      visible: false,
      fidelity,
      outcome: Object.freeze({
        rides: 0,
        completedRides: 0,
        failedRides: 0,
        cancelledRides: 0,
        attributableFailures: 0,
        exposureSeconds: 0,
        deliveredSeconds: 0,
        missedSeconds: 0,
        failureReasons: Object.freeze([]),
      }),
    });
  }
  requireContract(vehicles.length === taxis + civilians, 'City fleet list is incomplete');
  requireContract(taxiCount === taxis, 'City fleet taxi count does not match its list');
  requireContract(civilianCount === civilians, 'City fleet civilian count does not match its list');

  const observation = plainFields(data.observation, observationFields, 'city observation');
  for (const key of observationFields) requireRequired(observation, key, 'city observation');
  const windowTicks = tick(observation.windowTicks);
  requireContract(
    windowTicks > 0 && windowTicks <= CITY_LIMITS.windowTicks,
    'Invalid city observation window',
  );
  const rawVisible = observation.visibleVehicleIds;
  requireContract(Array.isArray(rawVisible), 'City visible vehicle ids must be an array');
  const visibleIds = rawVisible.map((entry) =>
    boundedId(entry, CITY_LIMITS.idCodeUnits, 'city visible vehicle'),
  );
  requireContract(new Set(visibleIds).size === visibleIds.length, 'Duplicate city visible vehicle');
  for (const id of visibleIds)
    requireContract(seenVehicles.has(id), `Visible vehicle is not in the evaluated fleet: ${id}`);
  const visibleSet = new Set(visibleIds);

  const activation = plainFields(data.activation, activationFields, 'city activation');
  for (const key of activationFields) requireRequired(activation, key, 'city activation');
  const activationProfileId = boundedId(
    activation.profileId,
    CITY_LIMITS.idCodeUnits,
    'city activation profile',
  );
  const activationVersionId = boundedId(
    activation.versionId,
    CITY_LIMITS.idCodeUnits,
    'city activation version',
  );
  requireContract(
    activationProfileId === profile.profileId,
    'The fleet activated a different profile',
  );
  requireContract(
    activationVersionId === profile.versionId,
    'The fleet activated a different profile version',
  );
  const appliedTick = tick(activation.appliedTick);
  const vehiclesUpdated = tick(activation.vehiclesUpdated);
  requireContract(
    vehiclesUpdated > 0 && vehiclesUpdated <= vehicles.length,
    'Invalid city activation vehicle count',
  );

  const rawRides = data.rides;
  requireContract(Array.isArray(rawRides), 'City rides must be an array');
  requireContract(rawRides.length <= CITY_LIMITS.rides, 'City ride capacity exceeded');
  const taxiIds = new Set(
    vehicles.filter((vehicle) => vehicle.driverKind === 'TAXI').map((vehicle) => vehicle.vehicleId),
  );
  const perVehicle = new Map<
    string,
    {
      rides: number;
      completedRides: number;
      failedRides: number;
      cancelledRides: number;
      attributableFailures: number;
      exposureSeconds: number;
      deliveredSeconds: number;
      failureReasons: Set<string>;
    }
  >();
  const seenRides = new Set<string>();
  const reasonCounts = new Map<string, number>();
  for (const raw of rawRides) {
    const ride = readRide(raw);
    requireContract(!seenRides.has(ride.rideId), 'Duplicate city ride');
    seenRides.add(ride.rideId);
    requireContract(
      taxiIds.has(ride.taxiId),
      `A city ride must belong to an evaluated taxi: ${ride.taxiId}`,
    );
    const row = perVehicle.get(ride.taxiId) ?? {
      rides: 0,
      completedRides: 0,
      failedRides: 0,
      cancelledRides: 0,
      attributableFailures: 0,
      exposureSeconds: 0,
      deliveredSeconds: 0,
      failureReasons: new Set<string>(),
    };
    row.rides += 1;
    row.exposureSeconds += ride.totalCostSeconds;
    if (ride.state === 'COMPLETED') {
      row.completedRides += 1;
      row.deliveredSeconds += ride.totalCostSeconds;
    } else if (ride.state === 'FAILED') {
      row.failedRides += 1;
      if (isAttributable(ride.reason)) row.attributableFailures += 1;
    } else {
      row.cancelledRides += 1;
    }
    if (ride.reason !== null) {
      row.failureReasons.add(ride.reason);
      reasonCounts.set(ride.reason, (reasonCounts.get(ride.reason) ?? 0) + 1);
    }
    perVehicle.set(ride.taxiId, row);
  }

  const visibleSplit = emptySplit();
  const invisibleSplit = emptySplit();
  const parameterAggregate = new Map<
    string,
    {
      expected: number;
      matchedVehicles: number;
      totalDeviation: number;
      maxDeviation: number;
    }
  >();
  for (const key of Object.keys(profile.parameters).sort(compareText))
    parameterAggregate.set(key, {
      expected: profile.parameters[key]!,
      matchedVehicles: 0,
      totalDeviation: 0,
      maxDeviation: 0,
    });

  const resolved: CityVehicleResult[] = [];
  let matchedVehicles = 0;
  let matchedCells = 0;
  let invisibleServedTaxis = 0;
  const adoption = new Map<string, number>();
  const byKind = {
    TAXI: { evaluated: 0, matchedVehicles: 0 },
    CIVILIAN: { evaluated: 0, matchedVehicles: 0 },
  };
  for (const vehicle of vehicles) {
    const visible = visibleSet.has(vehicle.vehicleId);
    const row = perVehicle.get(vehicle.vehicleId);
    const outcome: CityVehicleOutcome = Object.freeze({
      rides: row?.rides ?? 0,
      completedRides: row?.completedRides ?? 0,
      failedRides: row?.failedRides ?? 0,
      cancelledRides: row?.cancelledRides ?? 0,
      attributableFailures: row?.attributableFailures ?? 0,
      exposureSeconds: row?.exposureSeconds ?? 0,
      deliveredSeconds: row?.deliveredSeconds ?? 0,
      missedSeconds: (row?.exposureSeconds ?? 0) - (row?.deliveredSeconds ?? 0),
      failureReasons: Object.freeze([...(row?.failureReasons ?? [])].sort(compareText)),
    });
    if (vehicle.fidelity.matched) matchedVehicles += 1;
    matchedCells += vehicle.fidelity.matchedKeys;
    byKind[vehicle.driverKind].evaluated += 1;
    if (vehicle.fidelity.matched) byKind[vehicle.driverKind].matchedVehicles += 1;
    adoption.set(
      vehicle.appliedProfileVersion,
      (adoption.get(vehicle.appliedProfileVersion) ?? 0) + 1,
    );
    for (const key of Object.keys(profile.parameters)) {
      const aggregate = parameterAggregate.get(key)!;
      const actual = versions.get(vehicle.appliedProfileVersion)!.parameters[key]!;
      const deviation = Math.abs(actual - aggregate.expected);
      if (deviation <= CITY_LIMITS.valueEpsilon) aggregate.matchedVehicles += 1;
      aggregate.totalDeviation += deviation;
      aggregate.maxDeviation = Math.max(aggregate.maxDeviation, deviation);
    }
    const split = visible ? visibleSplit : invisibleSplit;
    split.vehicles += 1;
    split.rides += outcome.rides;
    split.completedRides += outcome.completedRides;
    split.failedRides += outcome.failedRides;
    split.cancelledRides += outcome.cancelledRides;
    split.attributableFailures += outcome.attributableFailures;
    split.exposureSeconds += outcome.exposureSeconds;
    split.deliveredSeconds += outcome.deliveredSeconds;
    if (!visible && vehicle.driverKind === 'TAXI' && outcome.rides > 0) invisibleServedTaxis += 1;
    resolved.push(Object.freeze({ ...vehicle, visible, outcome }));
  }

  const totalSeconds = visibleSplit.exposureSeconds + invisibleSplit.exposureSeconds;
  const totalRides = visibleSplit.rides + invisibleSplit.rides;
  const deliveredSeconds = visibleSplit.deliveredSeconds + invisibleSplit.deliveredSeconds;
  const totalCells = vehicles.length * Object.keys(profile.parameters).length;
  const verdict: CityFidelityVerdict =
    matchedCells === totalCells ? 'EXACT' : matchedCells === 0 ? 'NONE' : 'PARTIAL';
  const otherVersions = [...adoption.entries()]
    .filter(([versionId]) => versionId !== profile.versionId)
    .sort((left, right) => compareText(left[0], right[0]))
    .map(([versionId, count]) => Object.freeze({ versionId, vehicles: count }));
  const fidelity: CityFidelity = Object.freeze({
    verdict,
    parameters: Object.freeze(
      [...parameterAggregate.entries()].map(([key, aggregate]) =>
        Object.freeze({
          key,
          expected: aggregate.expected,
          matchedVehicles: aggregate.matchedVehicles,
          meanAbsoluteDeviation: aggregate.totalDeviation / vehicles.length,
          maxAbsoluteDeviation: aggregate.maxDeviation,
        }),
      ),
    ),
    evaluatedVehicles: vehicles.length,
    matchedVehicles,
    matchedCells,
    totalCells,
    matchedFraction: totalCells === 0 ? null : matchedCells / totalCells,
    versionAdoption: Object.freeze({
      activeVersionVehicles: adoption.get(profile.versionId) ?? 0,
      otherVersions: Object.freeze(otherVersions),
    }),
    byDriverKind: Object.freeze({
      TAXI: Object.freeze({ ...byKind.TAXI }),
      CIVILIAN: Object.freeze({ ...byKind.CIVILIAN }),
    }),
    profileWrites: 0 as const,
    learningJobs: 0 as const,
  });

  const visibleExposure = freezeSplit(visibleSplit);
  const invisibleExposure = freezeSplit(invisibleSplit);
  const attributableFailures =
    visibleSplit.attributableFailures + invisibleSplit.attributableFailures;
  const completedRides = visibleSplit.completedRides + invisibleSplit.completedRides;
  const consequenceVerdict: CityConsequenceVerdict =
    attributableFailures > 0 ? 'HARMFUL' : completedRides === 0 ? 'NO_SERVICE' : 'CLEAN';
  const exposure: CityExposure = Object.freeze({
    totalSeconds,
    visibleSeconds: visibleSplit.exposureSeconds,
    invisibleSeconds: invisibleSplit.exposureSeconds,
    visibleFraction: totalSeconds === 0 ? null : visibleSplit.exposureSeconds / totalSeconds,
    invisibleFraction: totalSeconds === 0 ? null : invisibleSplit.exposureSeconds / totalSeconds,
    totalRides,
    visibleRides: visibleSplit.rides,
    invisibleRides: invisibleSplit.rides,
    invisibleRideFraction: totalRides === 0 ? null : invisibleSplit.rides / totalRides,
    deliveredSeconds,
    missedSeconds: totalSeconds - deliveredSeconds,
    servedVehicles: resolved.filter((vehicle) => vehicle.outcome.rides > 0).length,
    unservedVehicles: resolved.filter((vehicle) => vehicle.outcome.rides === 0).length,
    visibleVehicles: visibleSplit.vehicles,
    invisibleVehicles: invisibleSplit.vehicles,
    invisibleServedTaxis,
  });

  const consequences: CityConsequences = Object.freeze({
    verdict: consequenceVerdict,
    completedRides,
    failedRides: visibleSplit.failedRides + invisibleSplit.failedRides,
    cancelledRides: visibleSplit.cancelledRides + invisibleSplit.cancelledRides,
    attributableFailures,
    harmRate:
      attributableFailures + completedRides === 0
        ? null
        : attributableFailures / (attributableFailures + completedRides),
    exposureSeconds: totalSeconds,
    deliveredSeconds,
    missedSeconds: totalSeconds - deliveredSeconds,
    failureReasons: Object.freeze(
      [...reasonCounts.entries()]
        .sort((left, right) => compareText(left[0], right[0]))
        .map(([reason, count]) => Object.freeze({ reason, count })),
    ),
    visible: visibleExposure,
    invisible: invisibleExposure,
  });

  return Object.freeze({
    version: CITY_SCHEMA_VERSION,
    missionId: CITY_MISSION_ID,
    profileId: profile.profileId,
    profileVersionId: profile.versionId,
    activation: Object.freeze({ appliedTick, vehiclesUpdated }),
    observation: Object.freeze({
      windowTicks,
      visibleVehicles: visibleSplit.vehicles,
      invisibleVehicles: invisibleSplit.vehicles,
      visibleVehicleIds: Object.freeze([...visibleIds].sort(compareText)),
    }),
    coverage: Object.freeze({
      evaluatedVehicles: resolved.length,
      taxis: taxiCount,
      civilians: civilianCount,
      complete: true as const,
      omittedVehicles: 0 as const,
    }),
    fidelity,
    exposure,
    consequences,
    vehicles: Object.freeze(resolved),
    profileWrites: 0 as const,
    learningJobs: 0 as const,
  });
}

/**
 * The campaign gate for stage 6: the scenario ran with the whole evaluated fleet and at least one
 * terminal ride, so the player has something to inspect. The gate never requires a good style or a
 * clean world: the mission is about seeing what the style does, not about scoring it.
 */
export function cityMissionGate(result: CityMissionResult): CityMissionGate {
  const satisfied = result.coverage.complete && result.exposure.totalRides > 0;
  return Object.freeze({
    missionId: CITY_MISSION_ID,
    outcome: satisfied ? ('PROGRESS' as const) : ('NO_PROGRESS' as const),
    satisfied,
    reason: satisfied ? null : ('NO_RIDES' as const),
    fidelityVerdict: result.fidelity.verdict,
    consequenceVerdict: result.consequences.verdict,
  });
}

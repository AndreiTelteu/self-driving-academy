import {
  choice,
  createStableId,
  deriveScenarioSeed,
  deriveVehicleSeed,
  fields,
  list,
  number,
  randomUint32,
  record,
  requireContract,
  text,
  tick,
} from '../sessions';
import type { ContractContext } from '../sessions';
import { VEHICLE_CLASSES, VEHICLE_CLASS_VERSION, controlModes, vehicleClass } from '../vehicles';
import type { ControlMode, VehicleClassId } from '../vehicles';

export const FLEET_REGISTRY_VERSION = '057-fleet-registry-v1' as const;
export const fleetDriverKinds = ['TAXI', 'CIVILIAN'] as const;
export type FleetDriverKind = (typeof fleetDriverKinds)[number];

/** V1 fleet population bounds from Docs/25 and the performance manifest. */
export const FLEET_LIMITS = Object.freeze({
  taxisMinimum: 20,
  taxisMaximum: 30,
  civiliansMinimum: 20,
  civiliansMaximum: 40,
  vehicles: 70,
  idCodeUnits: 256,
  slotMaximum: 9999,
});
export const DEFAULT_FLEET_COUNTS = Object.freeze({ taxis: 24, civilians: 40 });

/** Class IDs come from the real 023 catalog; this module never forks the mechanical identities. */
const classIds = Object.freeze(Object.keys(VEHICLE_CLASSES) as VehicleClassId[]);

/**
 * Taxis and civilians share the common city style and may use either mechanical class.
 * The table is explicit so an unknown/incompatible pair fails instead of being guessed.
 */
export const FLEET_CLASS_COMPATIBILITY: Readonly<
  Record<FleetDriverKind, readonly VehicleClassId[]>
> = Object.freeze({
  TAXI: classIds,
  CIVILIAN: classIds,
});

export interface CityProfileReference {
  readonly profileId: string;
  readonly versionId: string;
}

export function parseCityProfileReference(value: unknown): CityProfileReference {
  const data = fields(value, ['profileId', 'versionId']);
  return Object.freeze({ profileId: text(data.profileId), versionId: text(data.versionId) });
}

/** The composition root wires this to the active common city profile version (activation is 110). */
export interface CityProfileSource {
  activeProfile(): CityProfileReference;
}

export interface FleetClassPlan {
  readonly taxis: readonly VehicleClassId[];
  readonly civilians: readonly VehicleClassId[];
}

export interface FleetConfiguration extends ContractContext {
  readonly scenarioId: string;
  readonly seed: number;
  readonly namespace: string;
  readonly taxiCount: number;
  readonly civilianCount: number;
  readonly profile: CityProfileReference;
  readonly classPlan: FleetClassPlan | null;
}

const configurationFields = [
  'schemaVersion',
  'units',
  'sessionId',
  'worldEpoch',
  'scenarioId',
  'seed',
  'namespace',
  'taxiCount',
  'civilianCount',
  'profile',
  'classPlan',
] as const;

function readClassId(value: unknown): VehicleClassId {
  const classId = choice(value, classIds);
  return vehicleClass(classId).classId;
}

function readCount(value: unknown, minimum: number, maximum: number, label: string): number {
  const count = number(value, minimum, maximum);
  requireContract(Number.isSafeInteger(count), `${label} must be an integer`);
  return count;
}

export function fleetClassCompatible(
  driverKind: FleetDriverKind,
  classId: VehicleClassId,
): boolean {
  return FLEET_CLASS_COMPATIBILITY[driverKind].some((candidate) => candidate === classId);
}

function readClassPlan(value: unknown, taxiCount: number, civilianCount: number): FleetClassPlan {
  const data = fields(value, ['taxis', 'civilians']);
  const taxis = list(data.taxis, readClassId);
  const civilians = list(data.civilians, readClassId);
  requireContract(
    taxis.length === taxiCount,
    'Taxi class plan must contain exactly one class per taxi',
  );
  requireContract(
    civilians.length === civilianCount,
    'Civilian class plan must contain exactly one class per civilian',
  );
  for (const classId of taxis)
    requireContract(fleetClassCompatible('TAXI', classId), 'Taxi class is incompatible');
  for (const classId of civilians)
    requireContract(fleetClassCompatible('CIVILIAN', classId), 'Civilian class is incompatible');
  return Object.freeze({ taxis, civilians });
}

function slotKey(slot: number): string {
  return String(slot).padStart(4, '0');
}

export function fleetVehicleId(
  namespace: string,
  driverKind: FleetDriverKind,
  slot: number,
): string {
  return createStableId('vehicle', namespace, [driverKind, slotKey(slot)]);
}

/** Deterministic, per-vehicle class assignment; creation order and population size are not inputs. */
export function fleetClassForSeed(
  seed: number,
  scenarioId: string,
  vehicleId: string,
): VehicleClassId {
  const vehicleSeed = deriveVehicleSeed(deriveScenarioSeed(seed, scenarioId), vehicleId);
  return classIds[randomUint32(vehicleSeed, 'fleet-class', 0) % classIds.length]!;
}

export function parseFleetConfiguration(value: unknown): FleetConfiguration {
  const own = record(value);
  const data = fields(
    own,
    Object.hasOwn(own, 'classPlan')
      ? configurationFields
      : configurationFields.filter((key) => key !== 'classPlan'),
  );
  const context: ContractContext = {
    schemaVersion: 1,
    units: 'SI',
    sessionId: text(data.sessionId),
    worldEpoch: tick(data.worldEpoch),
  };
  const seed = number(data.seed, 0, 0xffff_ffff);
  requireContract(Number.isInteger(seed), 'Fleet seed must be a uint32');
  const namespace = text(data.namespace);
  const taxiCount = readCount(
    data.taxiCount,
    FLEET_LIMITS.taxisMinimum,
    FLEET_LIMITS.taxisMaximum,
    'Taxi count',
  );
  const civilianCount = readCount(
    data.civilianCount,
    FLEET_LIMITS.civiliansMinimum,
    FLEET_LIMITS.civiliansMaximum,
    'Civilian count',
  );
  requireContract(
    taxiCount + civilianCount <= FLEET_LIMITS.vehicles,
    'Fleet population exceeds capacity',
  );
  const profile = parseCityProfileReference(data.profile);
  const classPlan =
    Object.hasOwn(own, 'classPlan') && data.classPlan !== null
      ? readClassPlan(data.classPlan, taxiCount, civilianCount)
      : null;
  const longestId = fleetVehicleId(namespace, 'CIVILIAN', FLEET_LIMITS.slotMaximum);
  requireContract(longestId.length <= FLEET_LIMITS.idCodeUnits, 'Fleet namespace is too long');
  return Object.freeze({
    ...context,
    scenarioId: text(data.scenarioId),
    seed,
    namespace,
    taxiCount,
    civilianCount,
    profile,
    classPlan,
  });
}

export interface FleetVehicle {
  readonly vehicleId: string;
  readonly driverKind: FleetDriverKind;
  /** 1-based semantic fleet slot used to build the stable identity, not array order. */
  readonly slot: number;
  readonly classId: VehicleClassId;
  readonly classVersion: typeof VEHICLE_CLASS_VERSION;
  readonly profileId: string;
  readonly createdAtTick: number;
}

/** Only simulation state belongs here; selection, camera and renderer state never do. */
export interface FleetVehicleState {
  readonly tick: number;
  readonly controlMode: ControlMode;
  readonly appliedProfileVersion: string;
}

export interface FleetClassCount {
  readonly driverKind: FleetDriverKind;
  readonly classId: VehicleClassId;
  readonly count: number;
}

export interface FleetPopulationReport {
  readonly version: typeof FLEET_REGISTRY_VERSION;
  readonly seed: number;
  readonly total: number;
  readonly taxis: number;
  readonly civilians: number;
  readonly byDriverKind: Readonly<Record<FleetDriverKind, number>>;
  readonly byClass: Readonly<Record<VehicleClassId, number>>;
  /** Fixed driverKind × class matrix so the report shape is deterministic. */
  readonly matrix: readonly FleetClassCount[];
}

export interface FleetCounts {
  readonly vehicles: number;
  readonly taxis: number;
  readonly civilians: number;
}

export interface FleetAddOptions {
  readonly tick?: number;
  readonly slot?: number;
}

export interface FleetRegistryOptions {
  readonly profileSource?: CityProfileSource;
}

export interface FleetRegistry {
  readonly configuration: FleetConfiguration;
  context(): ContractContext;
  get(vehicleId: string): FleetVehicle | undefined;
  state(vehicleId: string): FleetVehicleState | undefined;
  list(): readonly FleetVehicle[];
  addVehicle(
    driverKind: FleetDriverKind,
    classId?: VehicleClassId,
    options?: FleetAddOptions,
  ): FleetVehicle;
  updateState(vehicleId: string, patch: unknown): FleetVehicleState;
  removeVehicle(vehicleId: string): boolean;
  counts(): FleetCounts;
  report(): FleetPopulationReport;
  dispose(): void;
}

interface Entry {
  readonly vehicle: FleetVehicle;
  state: FleetVehicleState;
}

const vehicleFieldNames = [
  'classId',
  'classVersion',
  'createdAtTick',
  'driverKind',
  'profileId',
  'slot',
  'vehicleId',
] as const;

function readAddOptions(value: unknown): { readonly tick: number; readonly slot: number | null } {
  if (value === undefined) return { tick: 0, slot: null };
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract(key === 'tick' || key === 'slot', 'Unknown fleet add option');
  const createdAtTick = Object.hasOwn(data, 'tick') ? tick(data.tick) : 0;
  const slot = Object.hasOwn(data, 'slot')
    ? readCount(data.slot, 1, FLEET_LIMITS.slotMaximum, 'Fleet slot')
    : null;
  return { tick: createdAtTick, slot };
}

function readProfileSource(value: unknown): CityProfileSource | null {
  if (value === undefined) return null;
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract(key === 'profileSource', 'Unknown fleet registry option');
  if (!Object.hasOwn(data, 'profileSource') || data.profileSource === undefined) return null;
  const source = record(data.profileSource);
  requireContract(typeof source.activeProfile === 'function', 'Invalid city profile source');
  const activeProfile = source.activeProfile as (this: unknown) => CityProfileReference;
  const receiver = data.profileSource;
  return { activeProfile: () => activeProfile.call(receiver) };
}

function frozenState(
  atTick: number,
  controlMode: ControlMode,
  appliedProfileVersion: string,
): FleetVehicleState {
  return Object.freeze({ tick: atTick, controlMode, appliedProfileVersion });
}

function zeroMatrix(): FleetClassCount[] {
  return fleetDriverKinds.flatMap((driverKind) =>
    classIds.map((classId) => ({ driverKind, classId, count: 0 })),
  );
}

class FleetRegistryImpl implements FleetRegistry {
  readonly configuration: FleetConfiguration;
  private readonly entries = new Map<string, Entry>();
  private readonly nextSlots: Record<FleetDriverKind, number> = { TAXI: 1, CIVILIAN: 1 };
  private readonly profileSource: CityProfileSource | null;
  private disposed = false;

  constructor(configuration: FleetConfiguration, profileSource: CityProfileSource | null) {
    this.configuration = configuration;
    this.profileSource = profileSource;
    const active = this.activeReference();
    this.createInitial(
      'TAXI',
      configuration.taxiCount,
      configuration.classPlan?.taxis ?? null,
      active,
    );
    this.createInitial(
      'CIVILIAN',
      configuration.civilianCount,
      configuration.classPlan?.civilians ?? null,
      active,
    );
  }

  private createInitial(
    driverKind: FleetDriverKind,
    count: number,
    plan: readonly VehicleClassId[] | null,
    active: CityProfileReference,
  ): void {
    for (let slot = 1; slot <= count; slot += 1) {
      const vehicleId = fleetVehicleId(this.configuration.namespace, driverKind, slot);
      const classId = plan?.[slot - 1] ?? this.seedClass(vehicleId);
      this.insert(driverKind, classId, slot, 0, active);
    }
  }

  private seedClass(vehicleId: string): VehicleClassId {
    return fleetClassForSeed(this.configuration.seed, this.configuration.scenarioId, vehicleId);
  }

  private activeReference(): CityProfileReference {
    const reference = this.profileSource
      ? parseCityProfileReference(this.profileSource.activeProfile())
      : this.configuration.profile;
    requireContract(
      reference.profileId === this.configuration.profile.profileId,
      'City profile source identity mismatch',
    );
    return reference;
  }

  private assertLive(): void {
    if (this.disposed) throw new Error('Fleet registry disposed');
  }

  private kindCount(driverKind: FleetDriverKind): number {
    let count = 0;
    for (const entry of this.entries.values())
      if (entry.vehicle.driverKind === driverKind) count += 1;
    return count;
  }

  private insert(
    driverKind: FleetDriverKind,
    classId: VehicleClassId,
    slot: number,
    atTick: number,
    active: CityProfileReference,
  ): FleetVehicle {
    const vehicleId = fleetVehicleId(this.configuration.namespace, driverKind, slot);
    if (this.entries.has(vehicleId)) throw new RangeError('Duplicate fleet vehicle id');
    const vehicle = Object.freeze({
      vehicleId,
      driverKind,
      slot,
      classId,
      classVersion: VEHICLE_CLASS_VERSION,
      profileId: this.configuration.profile.profileId,
      createdAtTick: atTick,
    });
    this.entries.set(vehicleId, {
      vehicle,
      state: frozenState(atTick, 'AUTO', active.versionId),
    });
    this.nextSlots[driverKind] = Math.max(this.nextSlots[driverKind], slot + 1);
    return vehicle;
  }

  context(): ContractContext {
    const { schemaVersion, units, sessionId, worldEpoch } = this.configuration;
    return Object.freeze({ schemaVersion, units, sessionId, worldEpoch });
  }

  get(vehicleId: string): FleetVehicle | undefined {
    return this.entries.get(vehicleId)?.vehicle;
  }

  state(vehicleId: string): FleetVehicleState | undefined {
    return this.entries.get(vehicleId)?.state;
  }

  list(): readonly FleetVehicle[] {
    return Object.freeze(
      [...this.entries.values()]
        .map((entry) => entry.vehicle)
        .sort((left, right) =>
          left.vehicleId < right.vehicleId ? -1 : left.vehicleId > right.vehicleId ? 1 : 0,
        ),
    );
  }

  addVehicle(
    driverKind: FleetDriverKind,
    classId?: VehicleClassId,
    options?: FleetAddOptions,
  ): FleetVehicle {
    this.assertLive();
    const kind = choice(driverKind, fleetDriverKinds);
    const maximum = kind === 'TAXI' ? FLEET_LIMITS.taxisMaximum : FLEET_LIMITS.civiliansMaximum;
    if (this.kindCount(kind) >= maximum)
      throw new RangeError(kind === 'TAXI' ? 'Fleet taxi capacity' : 'Fleet civilian capacity');
    const { tick: atTick, slot } = readAddOptions(options);
    const actualSlot = slot ?? this.nextSlots[kind];
    const resolvedClass =
      classId === undefined
        ? this.seedClass(fleetVehicleId(this.configuration.namespace, kind, actualSlot))
        : readClassId(classId);
    requireContract(
      fleetClassCompatible(kind, resolvedClass),
      'Class is incompatible with driver kind',
    );
    return this.insert(kind, resolvedClass, actualSlot, atTick, this.activeReference());
  }

  updateState(vehicleId: string, patch: unknown): FleetVehicleState {
    this.assertLive();
    const entry = this.entries.get(vehicleId);
    if (entry === undefined) throw new RangeError('Unknown fleet vehicle');
    const data = record(patch);
    for (const key of Object.keys(data))
      requireContract(
        key === 'tick' || key === 'controlMode' || key === 'appliedProfileVersion',
        'Unknown fleet state field',
      );
    const nextTick = tick(data.tick);
    if (nextTick < entry.state.tick) throw new RangeError('Stale fleet state tick');
    const controlMode = Object.hasOwn(data, 'controlMode')
      ? choice(data.controlMode, controlModes)
      : entry.state.controlMode;
    const appliedProfileVersion = Object.hasOwn(data, 'appliedProfileVersion')
      ? text(data.appliedProfileVersion)
      : entry.state.appliedProfileVersion;
    entry.state = frozenState(nextTick, controlMode, appliedProfileVersion);
    return entry.state;
  }

  removeVehicle(vehicleId: string): boolean {
    this.assertLive();
    return this.entries.delete(vehicleId);
  }

  counts(): FleetCounts {
    const taxis = this.kindCount('TAXI');
    const civilians = this.kindCount('CIVILIAN');
    return Object.freeze({ vehicles: taxis + civilians, taxis, civilians });
  }

  report(): FleetPopulationReport {
    const byDriverKind: Record<FleetDriverKind, number> = { TAXI: 0, CIVILIAN: 0 };
    const byClass = Object.fromEntries(classIds.map((classId) => [classId, 0])) as Record<
      VehicleClassId,
      number
    >;
    const pairs = new Map<string, number>();
    for (const entry of this.entries.values()) {
      byDriverKind[entry.vehicle.driverKind] += 1;
      byClass[entry.vehicle.classId] += 1;
      const pair = `${entry.vehicle.driverKind}:${entry.vehicle.classId}`;
      pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
    }
    const matrix = zeroMatrix().map((row) =>
      Object.freeze({
        ...row,
        count: pairs.get(`${row.driverKind}:${row.classId}`) ?? 0,
      }),
    );
    return Object.freeze({
      version: FLEET_REGISTRY_VERSION,
      seed: this.configuration.seed,
      total: byDriverKind.TAXI + byDriverKind.CIVILIAN,
      taxis: byDriverKind.TAXI,
      civilians: byDriverKind.CIVILIAN,
      byDriverKind: Object.freeze(byDriverKind),
      byClass: Object.freeze(byClass),
      matrix: Object.freeze(matrix),
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.entries.clear();
    this.nextSlots.TAXI = 1;
    this.nextSlots.CIVILIAN = 1;
    this.disposed = true;
  }
}

export function createFleetRegistry(
  configuration: unknown,
  options: FleetRegistryOptions = {},
): FleetRegistry {
  const parsed = parseFleetConfiguration(configuration);
  return new FleetRegistryImpl(parsed, readProfileSource(options));
}

/** Frozen contract field list used by tests and adapters to reject presentation-only fields. */
export const FLEET_VEHICLE_FIELDS = Object.freeze([...vehicleFieldNames]);

export const FLEET_STATE_FIELDS = Object.freeze([
  'appliedProfileVersion',
  'controlMode',
  'tick',
] as const);

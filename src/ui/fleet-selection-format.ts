import type { ControlMode } from '../vehicles';

/**
 * PBI 263 fleet-selection contract shared by the live panel and its tests.
 *
 * The snapshot is a read model of the same composition frame that drives the camera and the single
 * PLAYER seat. Selecting a row or a map marker changes only the camera target; taking over is a
 * separate explicit action. No vehicle, route or ride is created here.
 */
export const FLEET_SELECTION_VERSION = '263-fleet-selection-v1' as const;

export const FLEET_SELECTION_LIMITS = Object.freeze({
  version: FLEET_SELECTION_VERSION,
  /** Row write/reorder ceiling; independent of the authoritative tick. */
  maximumHz: 10,
  /** Same hard ceiling as 066/068/076. */
  vehicles: 110,
  rows: 110,
  idCodeUnits: 512,
  labelCodeUnits: 96,
  retainedViews: 1,
});

export type FleetSelectionKind = 'TAXI' | 'CIVIL';
export type FleetSelectionFilter = 'ALL' | 'AVAILABLE' | 'IN_RIDE' | 'BLOCKED';
export type FleetSelectionState = 'PLAYER' | 'BLOCKED' | 'IN_RIDE' | 'AVAILABLE';

export const FLEET_SELECTION_FILTERS: readonly FleetSelectionFilter[] = Object.freeze([
  'ALL',
  'AVAILABLE',
  'IN_RIDE',
  'BLOCKED',
]);

export const FLEET_SELECTION_FILTER_LABELS: Readonly<Record<FleetSelectionFilter, string>> =
  Object.freeze({
    ALL: 'Toate',
    AVAILABLE: 'Disponibile',
    IN_RIDE: 'În cursă',
    BLOCKED: 'Blocate',
  });

export const FLEET_SELECTION_STATE_LABELS: Readonly<Record<FleetSelectionState, string>> =
  Object.freeze({
    PLAYER: 'Condus de tine',
    BLOCKED: 'Blocat',
    IN_RIDE: 'În cursă',
    AVAILABLE: 'Disponibil',
  });

export interface FleetSelectionVehicle {
  readonly vehicleId: string;
  readonly kind: FleetSelectionKind;
  /** 1-based traffic slot, or the stable presentation slot of a seeded composition car. */
  readonly slot: number;
  readonly label: string;
  readonly classId: string;
  readonly controlMode: ControlMode;
  readonly positionM: Readonly<{ x: number; y: number; z: number }>;
  /** Map-plane heading: zero +X, positive toward +Z. */
  readonly headingRad: number;
  readonly available: boolean;
  readonly inRide: boolean;
  readonly blocked: boolean;
  readonly rideId: string | null;
  readonly routeLaneCount: number;
  readonly appliedProfileVersion: string;
  /** The current camera target. */
  readonly selected: boolean;
  /** The single car in the PLAYER seat (MANUAL/LEARNING). */
  readonly playerControlled: boolean;
}

/** One accepted live fleet frame. Every value is a read model from the composition owner. */
export interface FleetSelectionSnapshot {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
  readonly selectedVehicleId: string | null;
  readonly playerVehicleId: string | null;
  readonly vehicles: readonly FleetSelectionVehicle[];
}

export interface FleetSelectionRow {
  readonly rowId: string;
  readonly vehicleId: string;
  readonly kind: FleetSelectionKind;
  readonly kindLabel: string;
  readonly slot: number;
  readonly slotLabel: string;
  readonly label: string;
  readonly classId: string;
  readonly mode: ControlMode;
  readonly modeSymbol: 'A' | 'M' | 'L';
  readonly modeLabel: string;
  readonly state: FleetSelectionState;
  readonly stateLabel: string;
  readonly rideLabel: string;
  readonly blocked: boolean;
  readonly selected: boolean;
  readonly playerControlled: boolean;
  /** Present only because the filter must not hide the camera target or PLAYER seat. */
  readonly pinned: boolean;
  readonly positionLabel: string;
  /** Complete accessible row description; also the button `aria-label`. */
  readonly description: string;
}

export interface FleetSelectionCounts {
  readonly total: number;
  readonly taxis: number;
  readonly civilians: number;
  readonly visible: number;
  readonly pinned: number;
  readonly hidden: number;
  readonly available: number;
  readonly inRide: number;
  readonly blocked: number;
  readonly player: number;
}

export interface FleetSelectionView {
  readonly filter: FleetSelectionFilter;
  readonly rows: readonly FleetSelectionRow[];
  readonly counts: FleetSelectionCounts;
  readonly summary: string;
  readonly signature: string;
}

const MODE_SYMBOLS: Readonly<Record<ControlMode, 'A' | 'M' | 'L'>> = Object.freeze({
  AUTO: 'A',
  MANUAL: 'M',
  LEARNING: 'L',
});

const MODE_LABELS: Readonly<Record<ControlMode, string>> = Object.freeze({
  AUTO: 'Autonom',
  MANUAL: 'Manual',
  LEARNING: 'Învățare',
});

const CONTROL_MODES: readonly ControlMode[] = ['AUTO', 'MANUAL', 'LEARNING'];

function fail(message: string): never {
  throw new Error(message);
}

function plain(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${label} must be plain data`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${label} must be plain data`);
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  const data = plain(value, label),
    names = Reflect.ownKeys(data);
  if (
    names.length !== keys.length ||
    names.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    fail(`${label} fields`);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(data, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      fail(`${label} descriptors`);
  }
  return data;
}

function text(
  value: unknown,
  label: string,
  maximum: number = FLEET_SELECTION_LIMITS.idCodeUnits,
): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    fail(`${label} must be a bounded non-empty string`);
  return value;
}

function nullableText(value: unknown, label: string): string | null {
  return value === null ? null : text(value, label);
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be finite`);
  return value;
}

function count(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    fail(`${label} must be a non-negative integer`);
  return value;
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') fail(`${label} must be boolean`);
  return value;
}

function parseVehicle(value: unknown): FleetSelectionVehicle {
  const data = exact(
      value,
      [
        'vehicleId',
        'kind',
        'slot',
        'label',
        'classId',
        'controlMode',
        'positionM',
        'headingRad',
        'available',
        'inRide',
        'blocked',
        'rideId',
        'routeLaneCount',
        'appliedProfileVersion',
        'selected',
        'playerControlled',
      ],
      'Fleet selection vehicle',
    ),
    kind = data.kind;
  if (kind !== 'TAXI' && kind !== 'CIVIL') fail('Fleet selection kind');
  if (!CONTROL_MODES.includes(data.controlMode as ControlMode))
    fail('Fleet selection control mode');
  const slot = data.slot;
  if (typeof slot !== 'number' || !Number.isSafeInteger(slot) || slot < 1 || slot > 9999)
    fail('Fleet selection slot');
  const position = exact(data.positionM, ['x', 'y', 'z'], 'Fleet selection position');
  return Object.freeze({
    vehicleId: text(data.vehicleId, 'Fleet selection vehicleId'),
    kind,
    slot,
    label: text(data.label, 'Fleet selection label', FLEET_SELECTION_LIMITS.labelCodeUnits),
    classId: text(data.classId, 'Fleet selection classId', 64),
    controlMode: data.controlMode as ControlMode,
    positionM: Object.freeze({
      x: finite(position.x, 'Fleet selection x'),
      y: finite(position.y, 'Fleet selection y'),
      z: finite(position.z, 'Fleet selection z'),
    }),
    headingRad: finite(data.headingRad, 'Fleet selection heading'),
    available: bool(data.available, 'Fleet selection available'),
    inRide: bool(data.inRide, 'Fleet selection inRide'),
    blocked: bool(data.blocked, 'Fleet selection blocked'),
    rideId: nullableText(data.rideId, 'Fleet selection rideId'),
    routeLaneCount: count(data.routeLaneCount, 'Fleet selection routeLaneCount'),
    appliedProfileVersion: text(
      data.appliedProfileVersion,
      'Fleet selection appliedProfileVersion',
    ),
    selected: bool(data.selected, 'Fleet selection selected'),
    playerControlled: bool(data.playerControlled, 'Fleet selection playerControlled'),
  });
}

export function parseFleetSelectionSnapshot(value: unknown): FleetSelectionSnapshot {
  const data = exact(
      value,
      [
        'schemaVersion',
        'units',
        'sessionId',
        'worldEpoch',
        'tick',
        'selectedVehicleId',
        'playerVehicleId',
        'vehicles',
      ],
      'Fleet selection snapshot',
    ),
    tick = count(data.tick, 'Fleet selection tick');
  if (data.schemaVersion !== 1 || data.units !== 'SI') fail('Fleet selection contract');
  if (!Array.isArray(data.vehicles)) fail('Fleet selection vehicle list');
  if (data.vehicles.length > FLEET_SELECTION_LIMITS.vehicles)
    fail('Fleet selection vehicle ceiling');
  const vehicles = Object.freeze(data.vehicles.map(parseVehicle)),
    seen = new Set<string>();
  for (const vehicle of vehicles) {
    if (seen.has(vehicle.vehicleId)) fail('Fleet selection duplicate vehicle');
    seen.add(vehicle.vehicleId);
  }
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    sessionId: text(data.sessionId, 'Fleet selection session'),
    worldEpoch: count(data.worldEpoch, 'Fleet selection worldEpoch'),
    tick,
    selectedVehicleId: nullableText(data.selectedVehicleId, 'Fleet selection selectedVehicleId'),
    playerVehicleId: nullableText(data.playerVehicleId, 'Fleet selection playerVehicleId'),
    vehicles,
  });
}

function stateOf(
  vehicle: FleetSelectionVehicle,
  playerVehicleId: string | null,
): FleetSelectionState {
  if (playerVehicleId === vehicle.vehicleId || vehicle.playerControlled) return 'PLAYER';
  if (vehicle.blocked) return 'BLOCKED';
  if (vehicle.inRide) return 'IN_RIDE';
  return 'AVAILABLE';
}

function matchesFilter(state: FleetSelectionState, filter: FleetSelectionFilter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'AVAILABLE') return state === 'AVAILABLE';
  if (filter === 'IN_RIDE') return state === 'IN_RIDE';
  return state === 'BLOCKED';
}

function compareRows(left: FleetSelectionRow, right: FleetSelectionRow): number {
  const kind = left.kind === right.kind ? 0 : left.kind === 'TAXI' ? -1 : 1;
  return kind || left.slot - right.slot || (left.vehicleId < right.vehicleId ? -1 : 1);
}

function projectRow(
  vehicle: FleetSelectionVehicle,
  selectedVehicleId: string | null,
  playerVehicleId: string | null,
  pinned: boolean,
): FleetSelectionRow {
  const state = stateOf(vehicle, playerVehicleId),
    selected = selectedVehicleId === vehicle.vehicleId || vehicle.selected,
    playerControlled = playerVehicleId === vehicle.vehicleId || vehicle.playerControlled,
    modeSymbol = MODE_SYMBOLS[vehicle.controlMode],
    modeLabel = MODE_LABELS[vehicle.controlMode],
    stateLabel = FLEET_SELECTION_STATE_LABELS[state],
    kindLabel = vehicle.kind === 'TAXI' ? 'Taxi' : 'Civil',
    rideLabel =
      vehicle.rideId === null
        ? 'Nicio cursă'
        : `Cursă ${vehicle.rideId} · ${vehicle.routeLaneCount} benzi`,
    positionLabel = `(${vehicle.positionM.x.toFixed(1)}, ${vehicle.positionM.z.toFixed(1)}) m`,
    description =
      `${vehicle.label}, ${kindLabel}, ${stateLabel}, mod ${modeSymbol} ${modeLabel}, ` +
      `${positionLabel}${vehicle.rideId === null ? '' : `, ${rideLabel}`}` +
      `${selected ? ', ținta camerei' : ''}${playerControlled ? ', condus de tine' : ''}` +
      `${pinned ? ', păstrat de filtru' : ''}.`;
  return Object.freeze({
    rowId: vehicle.vehicleId,
    vehicleId: vehicle.vehicleId,
    kind: vehicle.kind,
    kindLabel,
    slot: vehicle.slot,
    slotLabel: vehicle.slot >= 9000 ? 'Parcat' : `#${vehicle.slot}`,
    label: vehicle.label,
    classId: vehicle.classId,
    mode: vehicle.controlMode,
    modeSymbol,
    modeLabel,
    state,
    stateLabel,
    rideLabel,
    blocked: vehicle.blocked,
    selected,
    playerControlled,
    pinned,
    positionLabel,
    description,
  });
}

/** Deterministic filter/sort projection. Membership is decided before sorting, so nothing is lost. */
export function projectFleetSelection(
  snapshot: FleetSelectionSnapshot,
  options: Readonly<{ filter?: FleetSelectionFilter }> = {},
): FleetSelectionView {
  const parsed = parseFleetSelectionSnapshot(snapshot),
    filter = options.filter ?? 'ALL';
  if (!FLEET_SELECTION_FILTERS.includes(filter)) fail('Fleet selection filter');
  const rows: FleetSelectionRow[] = [];
  let pinnedCount = 0,
    available = 0,
    inRide = 0,
    blocked = 0,
    player = 0,
    taxis = 0,
    civilians = 0;
  for (const vehicle of parsed.vehicles) {
    const state = stateOf(vehicle, parsed.playerVehicleId),
      pinned =
        parsed.selectedVehicleId === vehicle.vehicleId ||
        parsed.playerVehicleId === vehicle.vehicleId ||
        vehicle.selected ||
        vehicle.playerControlled;
    if (state === 'AVAILABLE') available += 1;
    if (state === 'IN_RIDE') inRide += 1;
    if (state === 'BLOCKED') blocked += 1;
    if (state === 'PLAYER') player += 1;
    if (vehicle.kind === 'TAXI') taxis += 1;
    else civilians += 1;
    if (!pinned && !matchesFilter(state, filter)) continue;
    if (pinned && !matchesFilter(state, filter)) pinnedCount += 1;
    rows.push(
      projectRow(
        vehicle,
        parsed.selectedVehicleId,
        parsed.playerVehicleId,
        pinned && !matchesFilter(state, filter),
      ),
    );
  }
  rows.sort(compareRows);
  const counts: FleetSelectionCounts = Object.freeze({
    total: parsed.vehicles.length,
    taxis,
    civilians,
    visible: rows.length,
    pinned: pinnedCount,
    hidden: parsed.vehicles.length - rows.length,
    available,
    inRide,
    blocked,
    player,
  });
  const summary =
    `${counts.visible}/${counts.total} vehicule · ${counts.taxis} taxiuri · ` +
    `${counts.civilians} civile · filtru ${FLEET_SELECTION_FILTER_LABELS[filter]}` +
    `${counts.player === 0 ? '' : ` · ${counts.player} în scaunul PLAYER`}`;
  const signature = JSON.stringify([
    filter,
    parsed.selectedVehicleId,
    parsed.playerVehicleId,
    rows.map((row) => [
      row.rowId,
      row.state,
      row.mode,
      row.selected,
      row.playerControlled,
      row.pinned,
    ]),
  ]);
  return Object.freeze({ filter, rows: Object.freeze(rows), counts, summary, signature });
}

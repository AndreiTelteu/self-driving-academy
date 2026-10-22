import type { RideState } from '../fleet';
import type { ControlMode } from '../vehicles';
import { formatDuration, formatEtaRange, modeView, rideStageView } from './taxi-hud-format';

/**
 * 075 fleet panel contract. The panel shows every real 057 taxi with its accepted control mode,
 * active 061 ride and certified 064 ETA. It creates no taxi, ride, profile version or ETA; every row
 * is a read model. Selecting a row only emits a selection intent: this module never moves a vehicle.
 */
export const FLEET_PANEL_VERSION = '075-fleet-panel-v1' as const;

export const FLEET_PANEL_LIMITS = Object.freeze({
  version: FLEET_PANEL_VERSION,
  /** Row write/reorder ceiling. Independent of the authoritative simulation tick. */
  maximumHz: 10,
  /** V1 taxi population target; the panel must list all of them. */
  taxis: 30,
  /** Hard ceiling, identical to the 066/068 native identity capacity. */
  maxTaxis: 110,
  rows: 110,
  /** Code units per identity read from a frame. */
  idCodeUnits: 512,
  /** Code units per closed 064 reason kept verbatim. */
  reasonCodeUnits: 256,
  retainedViews: 1,
  history: 0,
});

export type FleetPanelEtaStatus = 'NOT_OBSERVED' | 'ESTIMATED' | 'ARRIVED' | 'UNAVAILABLE';
export type FleetPanelServiceState = 'FREE_FLOW' | 'CONGESTED' | 'BLOCKED';
export type FleetPanelFilter = 'ALL' | 'BUSY' | 'FREE' | 'BLOCKED';
export type FleetPanelSort = 'SLOT' | 'STATE' | 'ETA';
export type FleetPanelRowState = 'BLOCKED' | 'BUSY' | 'FREE';

export const FLEET_PANEL_FILTERS: readonly FleetPanelFilter[] = Object.freeze([
  'ALL',
  'BUSY',
  'FREE',
  'BLOCKED',
]);
export const FLEET_PANEL_SORTS: readonly FleetPanelSort[] = Object.freeze(['SLOT', 'STATE', 'ETA']);

export const FLEET_PANEL_FILTER_LABELS: Readonly<Record<FleetPanelFilter, string>> = Object.freeze({
  ALL: 'Toate',
  BUSY: 'În cursă',
  FREE: 'Libere',
  BLOCKED: 'Blocate',
});

export const FLEET_PANEL_SORT_LABELS: Readonly<Record<FleetPanelSort, string>> = Object.freeze({
  SLOT: 'Slot',
  STATE: 'Stare',
  ETA: 'ETA',
});

/**
 * The ETA values displayed for one taxi row. `null` always means "not certified", never zero, and a
 * missing estimate is kept distinct from an unavailable one.
 */
export interface FleetPanelEta {
  readonly status: FleetPanelEtaStatus;
  /** Closed 064 unavailable reason, kept verbatim for the accessible row text. */
  readonly reason: string | null;
  readonly serviceState: FleetPanelServiceState | null;
  readonly seconds: number | null;
  readonly minSeconds: number | null;
  readonly maxSeconds: number | null;
  readonly progressFraction: number | null;
  readonly remainingDistanceM: number | null;
}

/** Real 061 ride record, restricted to the fields a row displays. */
export interface FleetPanelRide {
  readonly rideId: string;
  readonly state: RideState;
  readonly pickupZoneId: string;
  readonly dropoffZoneId: string;
  readonly eta: FleetPanelEta;
}

/** Real 057 identity plus the accepted state and the active ride of exactly that taxi. */
export interface FleetPanelTaxi {
  readonly vehicleId: string;
  /** 1-based semantic 057 fleet slot; the row shows it instead of the machine id. */
  readonly slot: number;
  readonly classId: string;
  readonly profileId: string;
  readonly appliedProfileVersion: string;
  readonly controlMode: ControlMode;
  /** Explicit service signal from the matched 064 estimate; `null` when nothing was observed. */
  readonly serviceState: FleetPanelServiceState | null;
  /** `true` only for a certified BLOCKED service; the panel never hides a blockage. */
  readonly blocked: boolean;
  readonly ride: FleetPanelRide | null;
}

/** One accepted panel frame. Every value is a read model; the panel invents none of them. */
export interface FleetPanelSnapshot {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: typeof FLEET_PANEL_VERSION;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
  /** The camera target. A civilian selection has no row here, so it pins nothing. */
  readonly followedTaxiId: string | null;
  readonly taxis: readonly FleetPanelTaxi[];
}

/** One projected row. `rowId` is the stable vehicle identity used for DOM reuse. */
export interface FleetPanelRow {
  readonly rowId: string;
  readonly vehicleId: string;
  readonly slot: number;
  readonly slotLabel: string;
  readonly classId: string;
  readonly profileLabel: string;
  readonly mode: ControlMode;
  readonly modeSymbol: 'A' | 'M' | 'L';
  readonly modeLabel: string;
  readonly state: FleetPanelRowState;
  readonly stateLabel: string;
  readonly rideState: RideState | null;
  readonly rideLabel: string;
  readonly etaLabel: string;
  readonly etaSeconds: number | null;
  readonly etaRangeLabel: string;
  readonly serviceState: FleetPanelServiceState | null;
  readonly serviceLabel: string;
  readonly blocked: boolean;
  readonly followed: boolean;
  /** `true` when the row is present only because the filter must not hide it. */
  readonly pinned: boolean;
  /** Complete accessible row description; also the button `aria-label`. */
  readonly description: string;
}

export interface FleetPanelCounts {
  readonly total: number;
  readonly visible: number;
  /** Rows kept visible by the followed-taxi or blockage pinning rule. */
  readonly pinned: number;
  readonly hidden: number;
  readonly busy: number;
  readonly free: number;
  readonly blocked: number;
  readonly followed: number;
}

/** One projected panel state: filter, sort, rows and a deterministic change signature. */
export interface FleetPanelView {
  readonly filter: FleetPanelFilter;
  readonly sort: FleetPanelSort;
  readonly followedTaxiId: string | null;
  readonly rows: readonly FleetPanelRow[];
  readonly counts: FleetPanelCounts;
  /** Human-readable filter/sort/count summary used by the polite live region. */
  readonly summary: string;
  readonly signature: string;
}

export interface FleetPanelProjectionOptions {
  readonly filter?: FleetPanelFilter;
  readonly sort?: FleetPanelSort;
}

const ROW_STATE_LABELS: Readonly<Record<FleetPanelRowState, string>> = Object.freeze({
  BLOCKED: 'Blocat',
  BUSY: 'În cursă',
  FREE: 'Liber',
});

const SERVICE_LABELS: Readonly<Record<FleetPanelServiceState, string>> = Object.freeze({
  FREE_FLOW: 'Flux liber',
  CONGESTED: 'Trafic congestionat',
  BLOCKED: 'Serviciu blocat',
});

const ETA_STATUSES: readonly FleetPanelEtaStatus[] = [
  'NOT_OBSERVED',
  'ESTIMATED',
  'ARRIVED',
  'UNAVAILABLE',
];
const SERVICE_STATES: readonly FleetPanelServiceState[] = ['FREE_FLOW', 'CONGESTED', 'BLOCKED'];
const RIDE_STATES: readonly RideState[] = [
  'TO_PICKUP',
  'PICKUP',
  'TO_DROPOFF',
  'DROPOFF',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
];

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareSlot(left: FleetPanelRow, right: FleetPanelRow): number {
  return left.slot - right.slot || compareText(left.vehicleId, right.vehicleId);
}

/**
 * Blocked taxis come first, then the active ride stages in pickup-to-dropoff order. A taxi without a
 * ride follows every working ride, and a retained terminal record stays last.
 */
function statePriority(row: FleetPanelRow): number {
  if (row.blocked) return 0;
  switch (row.rideState) {
    case 'TO_PICKUP':
      return 1;
    case 'PICKUP':
      return 2;
    case 'TO_DROPOFF':
      return 3;
    case 'DROPOFF':
      return 4;
    case null:
      return 5;
    default:
      return 6;
  }
}

interface EtaRowView {
  readonly label: string;
  /** Sortable remaining seconds; `null` when the ETA is not certified. */
  readonly seconds: number | null;
  readonly range: string;
  readonly accessible: string;
}

const NO_RIDE_ETA: EtaRowView = Object.freeze({
  label: 'Fără estimare',
  seconds: null,
  range: '—',
  accessible: 'fără estimare, nicio cursă activă',
});

const NO_ETA: EtaRowView = Object.freeze({
  label: 'Fără estimare',
  seconds: null,
  range: '—',
  accessible: 'fără estimare',
});

const UNAVAILABLE_ETA: EtaRowView = Object.freeze({
  label: 'Indisponibil',
  seconds: null,
  range: '—',
  accessible: 'indisponibil',
});

/** One deterministic ETA rendering, mirroring the 073 rules: unavailable is never `0 s`. */
function etaRowView(ride: FleetPanelRide | null): EtaRowView {
  if (ride === null) return NO_RIDE_ETA;
  const eta = ride.eta,
    range = formatEtaRange(eta.minSeconds, eta.maxSeconds);
  switch (eta.status) {
    case 'NOT_OBSERVED':
      return NO_ETA;
    case 'UNAVAILABLE':
      return Object.freeze({
        label: UNAVAILABLE_ETA.label,
        seconds: null,
        range,
        accessible:
          eta.reason === null ? UNAVAILABLE_ETA.accessible : `indisponibil (${eta.reason})`,
      });
    case 'ARRIVED': {
      const atPickup = ride.state === 'PICKUP';
      return Object.freeze({
        label: atPickup ? 'La pasager' : 'La destinație',
        seconds: 0,
        range,
        accessible: atPickup ? 'la pasager' : 'la destinație',
      });
    }
    case 'ESTIMATED': {
      if (eta.seconds === null) return UNAVAILABLE_ETA;
      const duration = formatDuration(eta.seconds);
      return Object.freeze({
        label: `~${duration}`,
        seconds: eta.seconds,
        range,
        accessible: `aproximativ ${duration}`,
      });
    }
  }
}

function toRow(
  taxi: FleetPanelTaxi,
  followedTaxiId: string | null,
  pinnedIds: ReadonlySet<string>,
): FleetPanelRow {
  const ride = taxi.ride,
    state: FleetPanelRowState = taxi.blocked ? 'BLOCKED' : ride === null ? 'FREE' : 'BUSY',
    mode = modeView(taxi.controlMode),
    stage = ride === null ? null : rideStageView(ride.state, ride.pickupZoneId, ride.dropoffZoneId),
    eta = etaRowView(ride),
    serviceLabel = taxi.serviceState === null ? '—' : SERVICE_LABELS[taxi.serviceState],
    followed = followedTaxiId === taxi.vehicleId,
    pinned = pinnedIds.has(taxi.vehicleId),
    stateLabel = ROW_STATE_LABELS[state],
    rideLabel = stage === null ? 'Nicio cursă activă' : stage.stage;
  const description = [
    `Taxi #${taxi.slot} (${taxi.vehicleId})`,
    stateLabel,
    `${mode.symbol} · ${mode.label}`,
    `serviciu ${taxi.serviceState === null ? 'nespecificat' : SERVICE_LABELS[taxi.serviceState]}`,
    ride === null
      ? 'nicio cursă activă'
      : `${stage?.stage ?? ''}: ${ride.pickupZoneId} → ${ride.dropoffZoneId}`,
    `ETA ${eta.accessible}`,
    ...(followed ? ['taxi urmărit'] : []),
    ...(pinned ? ['păstrat de filtru'] : []),
  ].join('; ');
  return Object.freeze({
    rowId: taxi.vehicleId,
    vehicleId: taxi.vehicleId,
    slot: taxi.slot,
    slotLabel: `Taxi #${taxi.slot}`,
    classId: taxi.classId,
    profileLabel: `${taxi.classId} · ${taxi.profileId} · ${taxi.appliedProfileVersion}`,
    mode: taxi.controlMode,
    modeSymbol: mode.symbol,
    modeLabel: mode.label,
    state,
    stateLabel,
    rideState: taxi.ride?.state ?? null,
    rideLabel,
    etaLabel: eta.label,
    etaSeconds: eta.seconds,
    etaRangeLabel: eta.range,
    serviceState: taxi.serviceState,
    serviceLabel,
    blocked: taxi.blocked,
    followed,
    pinned,
    description,
  });
}

function matchesFilter(taxi: FleetPanelTaxi, filter: FleetPanelFilter): boolean {
  switch (filter) {
    case 'ALL':
      return true;
    case 'BUSY':
      return taxi.ride !== null;
    case 'FREE':
      return taxi.ride === null;
    case 'BLOCKED':
      return taxi.blocked;
  }
}

function assertFilter(value: unknown): FleetPanelFilter {
  if (typeof value !== 'string' || !FLEET_PANEL_FILTERS.includes(value as FleetPanelFilter))
    throw new Error('Fleet panel filter');
  return value as FleetPanelFilter;
}

function assertSort(value: unknown): FleetPanelSort {
  if (typeof value !== 'string' || !FLEET_PANEL_SORTS.includes(value as FleetPanelSort))
    throw new Error('Fleet panel sort');
  return value as FleetPanelSort;
}

/**
 * Pure projection shared by the DOM adapter, the tests and the evidence report.
 *
 * Membership rule: the filter decides the rows, except that the followed taxi and the first blocked
 * taxi (lowest slot) are always kept. A filter can therefore never hide the taxi the camera follows
 * or the single most important blockage. Sorting happens after membership, so it never duplicates or
 * drops a row, and the pinned rows keep their deterministic sort position.
 */
export function projectFleetPanel(
  snapshot: FleetPanelSnapshot,
  options: FleetPanelProjectionOptions = {},
): FleetPanelView {
  const filter = options.filter === undefined ? 'ALL' : assertFilter(options.filter),
    sort = options.sort === undefined ? 'SLOT' : assertSort(options.sort),
    followedTaxiId = snapshot.followedTaxiId,
    byId = new Map<string, FleetPanelTaxi>();
  for (const taxi of snapshot.taxis) byId.set(taxi.vehicleId, taxi);
  const included = new Set<string>();
  for (const taxi of snapshot.taxis) if (matchesFilter(taxi, filter)) included.add(taxi.vehicleId);
  const pinnedIds = new Set<string>(),
    pin = (vehicleId: string) => {
      if (included.has(vehicleId) || !byId.has(vehicleId)) return;
      included.add(vehicleId);
      pinnedIds.add(vehicleId);
    };
  if (followedTaxiId !== null) pin(followedTaxiId);
  const blockedAnchor = snapshot.taxis
    .filter((taxi) => taxi.blocked)
    .reduce<FleetPanelTaxi | null>(
      (best, taxi) =>
        best === null ||
        taxi.slot < best.slot ||
        (taxi.slot === best.slot && taxi.vehicleId < best.vehicleId)
          ? taxi
          : best,
      null,
    );
  if (blockedAnchor !== null) pin(blockedAnchor.vehicleId);
  const rows = snapshot.taxis
    .filter((taxi) => included.has(taxi.vehicleId))
    .map((taxi) => toRow(taxi, followedTaxiId, pinnedIds));
  rows.sort((left, right) => {
    if (sort === 'SLOT') return compareSlot(left, right);
    if (sort === 'STATE') {
      const priority = statePriority(left) - statePriority(right);
      return priority === 0 ? compareSlot(left, right) : priority;
    }
    const leftEta = left.etaSeconds,
      rightEta = right.etaSeconds;
    if (leftEta === null && rightEta === null) return compareSlot(left, right);
    if (leftEta === null) return 1;
    if (rightEta === null) return -1;
    return leftEta - rightEta || compareSlot(left, right);
  });
  let busy = 0,
    free = 0,
    blocked = 0,
    pinned = 0,
    followed = 0;
  for (const row of rows) {
    if (row.blocked) blocked += 1;
    else if (row.rideState === null) free += 1;
    else busy += 1;
    if (row.pinned) pinned += 1;
    if (row.followed) followed += 1;
  }
  const counts: FleetPanelCounts = Object.freeze({
    total: snapshot.taxis.length,
    visible: rows.length,
    pinned,
    hidden: snapshot.taxis.length - rows.length,
    busy,
    free,
    blocked,
    followed,
  });
  const summary =
    `Filtru ${FLEET_PANEL_FILTER_LABELS[filter]}, sortare ${FLEET_PANEL_SORT_LABELS[sort]}: ` +
    `${counts.visible} din ${counts.total} taxiuri` +
    (counts.pinned === 0
      ? '.'
      : `, ${counts.pinned} ${counts.pinned === 1 ? 'păstrat' : 'păstrate'} de filtru.`);
  const signature = JSON.stringify([
    FLEET_PANEL_VERSION,
    snapshot.sessionId,
    snapshot.worldEpoch,
    snapshot.tick,
    filter,
    sort,
    followedTaxiId,
    counts.visible,
    counts.pinned,
    rows.map((row) => [
      row.rowId,
      row.state,
      row.rideState,
      row.mode,
      row.etaSeconds,
      row.followed,
      row.description,
    ]),
  ]);
  return Object.freeze({
    filter,
    sort,
    followedTaxiId,
    rows: Object.freeze(rows),
    counts,
    summary,
    signature,
  });
}

/** Compact blocked/service fingerprint, used by the adapter to bypass the write ceiling. */
export function fleetPanelBlockedSignature(snapshot: FleetPanelSnapshot): string {
  return snapshot.taxis
    .map((taxi) => `${taxi.vehicleId}:${taxi.blocked ? '1' : '0'}:${taxi.serviceState ?? '-'}`)
    .join('|');
}

// ---------------------------------------------------------------------------------------------
// Strict frame parser, mirroring the 073/074 validation style.
// ---------------------------------------------------------------------------------------------

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

function id(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > FLEET_PANEL_LIMITS.idCodeUnits)
    fail(`${label} identity`);
  return value;
}

function count(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    fail(`${label} must be a nonnegative integer`);
  return value;
}

function optionalNumber(
  value: unknown,
  label: string,
  minimum: number | null,
  maximum: number | null,
): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be finite`);
  if (minimum !== null && value < minimum) fail(`${label} is below its minimum`);
  if (maximum !== null && value > maximum) fail(`${label} is above its maximum`);
  return value;
}

function parseEta(value: unknown): FleetPanelEta {
  const data = exact(
      value,
      [
        'status',
        'reason',
        'serviceState',
        'seconds',
        'minSeconds',
        'maxSeconds',
        'progressFraction',
        'remainingDistanceM',
      ],
      'Fleet panel ETA',
    ),
    status = data.status as FleetPanelEtaStatus;
  if (!ETA_STATUSES.includes(status)) fail('Fleet panel ETA status');
  if (!(
    data.reason === null ||
    (typeof data.reason === 'string' && data.reason.length <= FLEET_PANEL_LIMITS.reasonCodeUnits)
  ))
    fail('Fleet panel ETA reason');
  if (
    data.serviceState !== null &&
    !SERVICE_STATES.includes(data.serviceState as FleetPanelServiceState)
  )
    fail('Fleet panel ETA service');
  const seconds = optionalNumber(data.seconds, 'Fleet panel ETA seconds', 0, null),
    minSeconds = optionalNumber(data.minSeconds, 'Fleet panel ETA minimum', 0, null),
    maxSeconds = optionalNumber(data.maxSeconds, 'Fleet panel ETA maximum', 0, null),
    progressFraction = optionalNumber(data.progressFraction, 'Fleet panel ETA progress', 0, 1),
    remainingDistanceM = optionalNumber(
      data.remainingDistanceM,
      'Fleet panel ETA distance',
      0,
      null,
    );
  if (status === 'ESTIMATED') {
    if (seconds === null || minSeconds === null || maxSeconds === null)
      fail('Fleet panel estimated ETA requires a certified interval');
    if (minSeconds > maxSeconds) fail('Fleet panel ETA interval is inverted');
  } else if (status === 'ARRIVED') {
    if (seconds !== 0 || minSeconds !== 0 || maxSeconds !== 0)
      fail('Fleet panel arrived ETA must be the certified zero');
  } else if (seconds !== null || minSeconds !== null || maxSeconds !== null)
    fail('Fleet panel unavailable ETA must not carry a value');
  return Object.freeze({
    status,
    reason: data.reason as string | null,
    serviceState: data.serviceState as FleetPanelServiceState | null,
    seconds,
    minSeconds,
    maxSeconds,
    progressFraction,
    remainingDistanceM,
  });
}

function parseRide(value: unknown): FleetPanelRide {
  const entry = exact(
      value,
      ['rideId', 'state', 'pickupZoneId', 'dropoffZoneId', 'eta'],
      'Fleet panel ride',
    ),
    state = entry.state as RideState;
  if (!RIDE_STATES.includes(state)) fail('Fleet panel ride state');
  return Object.freeze({
    rideId: id(entry.rideId, 'Fleet panel ride'),
    state,
    pickupZoneId: id(entry.pickupZoneId, 'Fleet panel pickup zone'),
    dropoffZoneId: id(entry.dropoffZoneId, 'Fleet panel dropoff zone'),
    eta: parseEta(entry.eta),
  });
}

function parseTaxi(value: unknown): FleetPanelTaxi {
  const entry = exact(
      value,
      [
        'vehicleId',
        'slot',
        'classId',
        'profileId',
        'appliedProfileVersion',
        'controlMode',
        'serviceState',
        'blocked',
        'ride',
      ],
      'Fleet panel taxi',
    ),
    slot = entry.slot;
  if (typeof slot !== 'number' || !Number.isSafeInteger(slot) || slot < 1 || slot > 9999)
    fail('Fleet panel slot');
  if (!['AUTO', 'MANUAL', 'LEARNING'].includes(entry.controlMode as string))
    fail('Fleet panel control mode');
  if (
    entry.serviceState !== null &&
    !SERVICE_STATES.includes(entry.serviceState as FleetPanelServiceState)
  )
    fail('Fleet panel service state');
  if (typeof entry.blocked !== 'boolean') fail('Fleet panel blocked flag');
  const serviceState = entry.serviceState as FleetPanelServiceState | null;
  if (entry.blocked !== (serviceState === 'BLOCKED'))
    fail('Fleet panel blocked flag must match the certified service state');
  return Object.freeze({
    vehicleId: id(entry.vehicleId, 'Fleet panel taxi'),
    slot,
    classId: id(entry.classId, 'Fleet panel class'),
    profileId: id(entry.profileId, 'Fleet panel profile'),
    appliedProfileVersion: id(entry.appliedProfileVersion, 'Fleet panel profile version'),
    controlMode: entry.controlMode as ControlMode,
    serviceState,
    blocked: entry.blocked,
    ride: entry.ride === null ? null : parseRide(entry.ride),
  });
}

/** Validates and freezes one panel frame before any DOM work happens. */
export function parseFleetPanelSnapshot(value: unknown): FleetPanelSnapshot {
  const data = exact(
    value,
    [
      'schemaVersion',
      'units',
      'version',
      'sessionId',
      'worldEpoch',
      'tick',
      'followedTaxiId',
      'taxis',
    ],
    'Fleet panel snapshot',
  );
  if (data.schemaVersion !== 1 || data.units !== 'SI' || data.version !== FLEET_PANEL_VERSION)
    fail('Fleet panel contract');
  if (!Array.isArray(data.taxis)) fail('Fleet panel taxi list');
  if (data.taxis.length > FLEET_PANEL_LIMITS.maxTaxis) fail('Fleet panel taxi ceiling');
  const taxis = Object.freeze(data.taxis.map(parseTaxi)),
    seen = new Set<string>();
  for (const taxi of taxis) {
    if (seen.has(taxi.vehicleId)) fail('Fleet panel duplicate taxi');
    seen.add(taxi.vehicleId);
  }
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    version: FLEET_PANEL_VERSION,
    sessionId: id(data.sessionId, 'Fleet panel session'),
    worldEpoch: count(data.worldEpoch, 'Fleet panel world epoch'),
    tick: count(data.tick, 'Fleet panel tick'),
    followedTaxiId:
      data.followedTaxiId === null ? null : id(data.followedTaxiId, 'Fleet panel followed taxi'),
    taxis,
  });
}

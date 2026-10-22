import type { RideState } from '../fleet';
import type { ControlMode } from '../vehicles';

export const TAXI_HUD_VERSION = '073-taxi-hud-v1' as const;

export const TAXI_HUD_LIMITS = Object.freeze({
  version: TAXI_HUD_VERSION,
  maximumHz: 10,
  elements: 45,
  textNodes: 38,
  listeners: 0,
  retainedProjections: 1,
  idCodeUnits: 512,
});

export type TaxiHudEtaStatus = 'NOT_OBSERVED' | 'ESTIMATED' | 'ARRIVED' | 'UNAVAILABLE';
export type TaxiHudServiceState = 'FREE_FLOW' | 'CONGESTED' | 'BLOCKED';

/** The ETA/progress values displayed by 073. `null` means "not certified", never zero. */
export interface TaxiHudEta {
  readonly status: TaxiHudEtaStatus;
  /** Closed 064 unavailable reason, kept verbatim for the details panel. */
  readonly reason: string | null;
  readonly serviceState: TaxiHudServiceState | null;
  readonly seconds: number | null;
  readonly minSeconds: number | null;
  readonly maxSeconds: number | null;
  readonly remainingDistanceM: number | null;
  readonly progressFraction: number | null;
}

/** Fleet 057 identity plus the active city-profile version applied to this taxi. */
export interface TaxiHudTaxi {
  readonly vehicleId: string;
  /** 1-based semantic 057 fleet slot; the default HUD shows it instead of the machine id. */
  readonly slot: number;
  readonly classId: string;
  readonly profileId: string;
  readonly profileVersion: string;
}

/** Real 061 ride record, restricted to the fields the HUD reads. */
export interface TaxiHudRide {
  readonly rideId: string;
  readonly taxiId: string;
  readonly state: RideState;
  readonly pickupZoneId: string;
  readonly dropoffZoneId: string;
  readonly eta: TaxiHudEta;
}

/** One accepted HUD frame. Every value is a read model; the HUD invents none of them. */
export interface TaxiHudSnapshot {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly version: typeof TAXI_HUD_VERSION;
  readonly tick: number;
  /** Authoritative physical speed magnitude in m/s; `null` when no vehicle is read. */
  readonly speedMps: number | null;
  readonly mode: ControlMode;
  readonly taxi: TaxiHudTaxi | null;
  readonly ride: TaxiHudRide | null;
}

export interface TaxiHudModeView {
  readonly symbol: 'A' | 'M' | 'L';
  readonly label: string;
}

const MODE_VIEWS: Readonly<Record<ControlMode, TaxiHudModeView>> = Object.freeze({
  AUTO: Object.freeze({ symbol: 'A', label: 'Conduce AI-ul' }),
  MANUAL: Object.freeze({ symbol: 'M', label: 'Conduci · învățare oprită' }),
  LEARNING: Object.freeze({ symbol: 'L', label: 'Conduci · orașul învață' }),
});

/** 08/067 mandate exactly these labels; text and symbol always accompany colour. */
export function modeView(mode: ControlMode): TaxiHudModeView {
  return MODE_VIEWS[mode];
}

export interface TaxiHudSpeedView {
  readonly value: string;
  readonly unit: 'km/h';
  readonly kmh: number | null;
  readonly accessible: string;
}

/** km/h is the only displayed speed unit; the input stays the physical m/s value. */
export function formatSpeedKmh(speedMps: number | null | undefined): TaxiHudSpeedView {
  if (speedMps === null || speedMps === undefined || !Number.isFinite(speedMps) || speedMps < 0)
    return Object.freeze({
      value: '—',
      unit: 'km/h' as const,
      kmh: null,
      accessible: 'Viteză indisponibilă',
    });
  const kmh = Math.round(speedMps * 3.6);
  return Object.freeze({
    value: String(kmh),
    unit: 'km/h' as const,
    kmh,
    accessible: `Viteză: ${kmh} kilometri pe oră`,
  });
}

/** One deterministic duration format: seconds below a minute, then `m min ss s`. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0)
    return '—';
  const total = Math.round(seconds),
    minutes = Math.floor(total / 60),
    rest = total % 60;
  if (minutes === 0) return `${rest} s`;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${String(rest).padStart(2, '0')} s`;
}

export function formatEtaRange(
  minSeconds: number | null | undefined,
  maxSeconds: number | null | undefined,
): string {
  if (
    minSeconds === null ||
    minSeconds === undefined ||
    maxSeconds === null ||
    maxSeconds === undefined ||
    !Number.isFinite(minSeconds) ||
    !Number.isFinite(maxSeconds)
  )
    return '—';
  const min = formatDuration(minSeconds),
    max = formatDuration(maxSeconds);
  return min === max ? min : `${min} – ${max}`;
}

export function formatDistanceM(distanceM: number | null | undefined): string {
  if (distanceM === null || distanceM === undefined || !Number.isFinite(distanceM) || distanceM < 0)
    return '—';
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;
  return `${(distanceM / 1000).toFixed(1)} km`;
}

export interface TaxiHudStageView {
  readonly stage: string;
  readonly objective: string;
  readonly terminal: boolean;
}

/** Real 061 states mapped to player text; a missing ride is handled outside this function. */
export function rideStageView(
  state: RideState,
  pickupZoneId: string,
  dropoffZoneId: string,
): TaxiHudStageView {
  switch (state) {
    case 'TO_PICKUP':
      return {
        stage: 'Spre pasager',
        objective: `Du-te la pasagerul din ${pickupZoneId}`,
        terminal: false,
      };
    case 'PICKUP':
      return {
        stage: 'La pasager',
        objective: `Așteaptă îmbarcarea în ${pickupZoneId}`,
        terminal: false,
      };
    case 'TO_DROPOFF':
      return {
        stage: 'Spre destinație',
        objective: `Du pasagerul la ${dropoffZoneId}`,
        terminal: false,
      };
    case 'DROPOFF':
      return {
        stage: 'La destinație',
        objective: `Finalizează coborârea în ${dropoffZoneId}`,
        terminal: false,
      };
    case 'COMPLETED':
      return { stage: 'Cursă încheiată', objective: 'Fără obiectiv', terminal: true };
    case 'FAILED':
      return { stage: 'Cursă eșuată', objective: 'Fără obiectiv', terminal: true };
    case 'CANCELLED':
      return { stage: 'Cursă anulată', objective: 'Fără obiectiv', terminal: true };
  }
}

const SERVICE_LABELS: Readonly<Record<TaxiHudServiceState, string>> = Object.freeze({
  FREE_FLOW: 'Flux liber',
  CONGESTED: 'Trafic congestionat',
  BLOCKED: 'Serviciu blocat',
});

export interface TaxiHudDetail {
  readonly label: string;
  readonly value: string;
}

export interface TaxiHudProjection {
  readonly speed: TaxiHudSpeedView;
  readonly mode: TaxiHudModeView;
  readonly taxi: string;
  readonly taxiAccessible: string;
  readonly stage: string;
  readonly objective: string;
  readonly route: string;
  readonly eta: string;
  readonly etaAccessible: string;
  readonly etaRange: string;
  readonly progress: string;
  readonly service: string;
  readonly details: readonly TaxiHudDetail[];
  readonly rideKey: string;
  readonly foreign: boolean;
  readonly terminal: boolean;
}

function progressText(eta: TaxiHudEta): string {
  const fraction = eta.progressFraction,
    remaining = eta.remainingDistanceM;
  if (fraction === null && remaining === null) return '—';
  const percent =
    fraction === null ? null : `${Math.min(100, Math.max(0, Math.round(fraction * 100)))}%`;
  const distance = formatDistanceM(remaining);
  if (percent === null) return distance;
  if (remaining === null) return percent;
  return `${percent} · ${distance}`;
}

function etaRows(
  eta: TaxiHudEta,
  state: RideState,
): { eta: string; etaAccessible: string; etaRange: string } {
  const range = formatEtaRange(eta.minSeconds, eta.maxSeconds);
  switch (eta.status) {
    case 'NOT_OBSERVED':
      return { eta: 'Fără estimare', etaAccessible: 'ETA indisponibil', etaRange: '—' };
    case 'UNAVAILABLE':
      return {
        eta: 'Indisponibil',
        etaAccessible: eta.reason ? `ETA indisponibil: ${eta.reason}` : 'ETA indisponibil',
        etaRange: '—',
      };
    case 'ARRIVED': {
      const atPickup = state === 'PICKUP';
      return {
        eta: atPickup ? 'La pasager' : 'La destinație',
        etaAccessible: atPickup ? 'ETA: la pasager' : 'ETA: la destinație',
        etaRange: '—',
      };
    }
    case 'ESTIMATED': {
      if (eta.seconds === null)
        return { eta: 'Indisponibil', etaAccessible: 'ETA indisponibil', etaRange: '—' };
      const duration = formatDuration(eta.seconds);
      return {
        eta: `~${duration}`,
        etaAccessible: `ETA aproximativ ${duration}`,
        etaRange: range,
      };
    }
  }
}

/** Pure projection shared by the DOM adapter, tests and the evidence report. */
export function projectTaxiHud(snapshot: TaxiHudSnapshot): TaxiHudProjection {
  const details = (ride: TaxiHudRide | null, range: string): readonly TaxiHudDetail[] =>
    Object.freeze([
      Object.freeze({ label: 'Taxi', value: snapshot.taxi?.vehicleId ?? '—' }),
      Object.freeze({ label: 'Clasă', value: snapshot.taxi?.classId ?? '—' }),
      Object.freeze({ label: 'Profil', value: snapshot.taxi?.profileId ?? '—' }),
      Object.freeze({ label: 'Versiune profil', value: snapshot.taxi?.profileVersion ?? '—' }),
      Object.freeze({ label: 'Cursă', value: ride?.rideId ?? '—' }),
      Object.freeze({ label: 'Etapă tehnică', value: ride?.state ?? '—' }),
      Object.freeze({ label: 'Interval ETA', value: range }),
      Object.freeze({
        label: 'Distanță rămasă',
        value: formatDistanceM(ride?.eta.remainingDistanceM),
      }),
      Object.freeze({ label: 'Motiv ETA', value: ride?.eta.reason ?? '—' }),
    ]);
  const mode = modeView(snapshot.mode),
    speed = formatSpeedKmh(snapshot.speedMps),
    taxi = snapshot.taxi ? `#${snapshot.taxi.slot}` : 'Niciun taxi selectat',
    taxiAccessible = snapshot.taxi
      ? `Taxi #${snapshot.taxi.slot}: ${snapshot.taxi.vehicleId}`
      : 'Niciun taxi selectat';
  if (snapshot.ride === null) {
    return Object.freeze({
      speed,
      mode,
      taxi,
      taxiAccessible,
      stage: 'Nicio cursă activă',
      objective: 'Fără obiectiv',
      route: 'Fără rută',
      eta: 'Fără estimare',
      etaAccessible: 'ETA indisponibil: nicio cursă activă',
      etaRange: '—',
      progress: '—',
      service: '—',
      details: details(null, '—'),
      rideKey: 'NONE',
      foreign: false,
      terminal: false,
    });
  }
  if (snapshot.taxi === null || snapshot.ride.taxiId !== snapshot.taxi.vehicleId) {
    return Object.freeze({
      speed,
      mode,
      taxi,
      taxiAccessible,
      stage: 'Cursă a altui taxi',
      objective: 'Fără obiectiv',
      route: 'Fără rută',
      eta: 'Fără estimare',
      etaAccessible: 'ETA indisponibil: cursa aparține altui taxi',
      etaRange: '—',
      progress: '—',
      service: '—',
      details: details(snapshot.ride, '—'),
      rideKey: snapshot.ride.rideId,
      foreign: true,
      terminal: false,
    });
  }
  const stage = rideStageView(
      snapshot.ride.state,
      snapshot.ride.pickupZoneId,
      snapshot.ride.dropoffZoneId,
    ),
    rows = etaRows(snapshot.ride.eta, snapshot.ride.state),
    route = `${snapshot.ride.pickupZoneId} → ${snapshot.ride.dropoffZoneId}`;
  if (stage.terminal)
    return Object.freeze({
      speed,
      mode,
      taxi,
      taxiAccessible,
      stage: stage.stage,
      objective: stage.objective,
      route,
      eta: '—',
      etaAccessible: 'ETA indisponibil: cursa este închisă',
      etaRange: '—',
      progress: snapshot.ride.state === 'COMPLETED' ? '100% · 0 m' : '—',
      service: '—',
      details: details(snapshot.ride, '—'),
      rideKey: snapshot.ride.rideId,
      foreign: false,
      terminal: true,
    });
  return Object.freeze({
    speed,
    mode,
    taxi,
    taxiAccessible,
    stage: stage.stage,
    objective: stage.objective,
    route,
    eta: rows.eta,
    etaAccessible: rows.etaAccessible,
    etaRange: rows.etaRange,
    progress: progressText(snapshot.ride.eta),
    service:
      snapshot.ride.eta.serviceState === null
        ? '—'
        : SERVICE_LABELS[snapshot.ride.eta.serviceState],
    details: details(snapshot.ride, rows.etaRange),
    rideKey: snapshot.ride.rideId,
    foreign: false,
    terminal: false,
  });
}

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
  if (typeof value !== 'string' || !value.trim() || value.length > TAXI_HUD_LIMITS.idCodeUnits)
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

const ETA_STATUSES: readonly TaxiHudEtaStatus[] = [
  'NOT_OBSERVED',
  'ESTIMATED',
  'ARRIVED',
  'UNAVAILABLE',
];
const SERVICE_STATES: readonly TaxiHudServiceState[] = ['FREE_FLOW', 'CONGESTED', 'BLOCKED'];
const RIDE_STATES: readonly RideState[] = [
  'TO_PICKUP',
  'PICKUP',
  'TO_DROPOFF',
  'DROPOFF',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
];

function parseEta(value: unknown): TaxiHudEta {
  const data = exact(
      value,
      [
        'status',
        'reason',
        'serviceState',
        'seconds',
        'minSeconds',
        'maxSeconds',
        'remainingDistanceM',
        'progressFraction',
      ],
      'HUD ETA',
    ),
    status = data.status as TaxiHudEtaStatus;
  if (!ETA_STATUSES.includes(status)) fail('HUD ETA status');
  if (!(data.reason === null || (typeof data.reason === 'string' && data.reason.length <= 256)))
    fail('HUD ETA reason');
  if (
    data.serviceState !== null &&
    !SERVICE_STATES.includes(data.serviceState as TaxiHudServiceState)
  )
    fail('HUD ETA service');
  const seconds = optionalNumber(data.seconds, 'HUD ETA seconds', 0, null),
    minSeconds = optionalNumber(data.minSeconds, 'HUD ETA minimum', 0, null),
    maxSeconds = optionalNumber(data.maxSeconds, 'HUD ETA maximum', 0, null),
    remainingDistanceM = optionalNumber(data.remainingDistanceM, 'HUD ETA distance', 0, null),
    progressFraction = optionalNumber(data.progressFraction, 'HUD ETA progress', 0, 1);
  if (status === 'ESTIMATED') {
    if (seconds === null || minSeconds === null || maxSeconds === null)
      fail('HUD estimated ETA requires a certified interval');
    if (minSeconds > maxSeconds) fail('HUD ETA interval is inverted');
  } else if (status === 'ARRIVED') {
    if (seconds !== 0 || minSeconds !== 0 || maxSeconds !== 0)
      fail('HUD arrived ETA must be the certified zero');
  } else if (seconds !== null || minSeconds !== null || maxSeconds !== null)
    fail('HUD unavailable ETA must not carry a value');
  return Object.freeze({
    status,
    reason: data.reason as string | null,
    serviceState: data.serviceState as TaxiHudServiceState | null,
    seconds,
    minSeconds,
    maxSeconds,
    remainingDistanceM,
    progressFraction,
  });
}

export function parseTaxiHudSnapshot(value: unknown): TaxiHudSnapshot {
  const data = exact(
    value,
    [
      'schemaVersion',
      'units',
      'sessionId',
      'worldEpoch',
      'version',
      'tick',
      'speedMps',
      'mode',
      'taxi',
      'ride',
    ],
    'HUD snapshot',
  );
  if (data.schemaVersion !== 1 || data.units !== 'SI' || data.version !== TAXI_HUD_VERSION)
    fail('HUD snapshot contract');
  if (!['AUTO', 'MANUAL', 'LEARNING'].includes(data.mode as string)) fail('HUD snapshot mode');
  const sessionId = id(data.sessionId, 'HUD session'),
    worldEpoch = count(data.worldEpoch, 'HUD world epoch'),
    tick = count(data.tick, 'HUD tick'),
    speedMps = optionalNumber(data.speedMps, 'HUD speed', 0, null);
  let taxi: TaxiHudTaxi | null = null;
  if (data.taxi !== null) {
    const entry = exact(
        data.taxi,
        ['vehicleId', 'slot', 'classId', 'profileId', 'profileVersion'],
        'HUD taxi',
      ),
      slot = entry.slot;
    if (typeof slot !== 'number' || !Number.isSafeInteger(slot) || slot < 1 || slot > 9999)
      fail('HUD taxi slot');
    taxi = Object.freeze({
      vehicleId: id(entry.vehicleId, 'HUD taxi'),
      slot,
      classId: id(entry.classId, 'HUD class'),
      profileId: id(entry.profileId, 'HUD profile'),
      profileVersion: id(entry.profileVersion, 'HUD profile version'),
    });
  }
  let ride: TaxiHudRide | null = null;
  if (data.ride !== null) {
    const entry = exact(
        data.ride,
        ['rideId', 'taxiId', 'state', 'pickupZoneId', 'dropoffZoneId', 'eta'],
        'HUD ride',
      ),
      state = entry.state as RideState;
    if (!RIDE_STATES.includes(state)) fail('HUD ride state');
    ride = Object.freeze({
      rideId: id(entry.rideId, 'HUD ride'),
      taxiId: id(entry.taxiId, 'HUD ride taxi'),
      state,
      pickupZoneId: id(entry.pickupZoneId, 'HUD pickup zone'),
      dropoffZoneId: id(entry.dropoffZoneId, 'HUD dropoff zone'),
      eta: parseEta(entry.eta),
    });
  }
  if (ride !== null && taxi === null) fail('HUD ride requires a taxi read model');
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    sessionId,
    worldEpoch,
    version: TAXI_HUD_VERSION,
    tick,
    speedMps,
    mode: data.mode as ControlMode,
    taxi,
    ride,
  });
}

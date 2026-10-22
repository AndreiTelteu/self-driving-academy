import type { MinimapPointPx, MinimapTransform } from './minimap-format';
import { projectMinimapPoint } from './minimap-format';

/**
 * 076 map-selection contract. It turns the real 057 TAXI/CIVIL vehicles into markers on the 074
 * minimap and turns one click into exactly one 068 WORLD selection intention.
 *
 * Identity rule: a marker is identified by the fleet `vehicleId` only. It is never an array index, a
 * mesh, a body handle or a Babylon node. Re-projecting the same vehicle after its position, kind or
 * label changed updates the same marker (same `markerId`), never a new one.
 *
 * Nothing here imports Babylon, a camera, a renderer or the fleet: the projection is pure and the
 * composition root supplies every real read model.
 */
export const MAP_SELECTION_VERSION = '076-map-selection-v1' as const;

export const MAP_SELECTION_LIMITS = Object.freeze({
  version: MAP_SELECTION_VERSION,
  /** Marker write/reorder ceiling. Independent of the authoritative simulation tick. */
  maximumHz: 10,
  /** Hard ceiling, identical to the 066/068 native identity capacity. */
  vehicles: 110,
  /** Code units per vehicle identity read from a snapshot. */
  idCodeUnits: 512,
  /** Code units per optional display label. */
  labelCodeUnits: 96,
  /** Marker box in canvas pixels; the DOM button is sized by CSS, the hit test uses this radius. */
  markerSizePx: 14,
  hitRadiusPx: 12,
  maximumHitRadiusPx: 64,
  /** One button per marker; the overlay root and its hidden description are the only fixed nodes. */
  fixedElements: 2,
  /** Global keyboard/document listeners installed by the adapter. */
  globalListeners: 0,
  retainedFrames: 1,
});

export type MapSelectionKind = 'TAXI' | 'CIVIL';

export interface MapSelectionPositionM {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * One real vehicle listed by the host. `available` is exactly "a finite world position is known";
 * `selectable` is the host's admission flag and can never be true without a position.
 */
export interface MapSelectionVehicle {
  readonly vehicleId: string;
  readonly kind: MapSelectionKind;
  /** 1-based semantic 057 slot. Civilians keep their own civilian slot. */
  readonly slot: number;
  /** Optional display label; `null` lets the projection build `Taxi #n` / `Civil #n`. */
  readonly label: string | null;
  readonly positionM: MapSelectionPositionM | null;
  /** Map-plane heading in radians: zero +X, positive toward +Z. `null` when unknown. */
  readonly headingRad: number | null;
  readonly available: boolean;
  readonly selectable: boolean;
}

/** One accepted host frame. Every value is a read model; no position is ever invented. */
export interface MapSelectionSnapshot {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: typeof MAP_SELECTION_VERSION;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
  /** Exact 068/017 camera target identity; a vehicle absent from the list simply selects nothing. */
  readonly followedVehicleId: string | null;
  readonly vehicles: readonly MapSelectionVehicle[];
}

/** One projected marker. `markerId` is the stable fleet identity used for DOM reuse. */
export interface MapMarkerProjection {
  readonly markerId: string;
  readonly vehicleId: string;
  readonly kind: MapSelectionKind;
  readonly slot: number;
  /** T for a taxi, C for a civilian; never colour alone. */
  readonly symbol: 'T' | 'C';
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly headingRad: number | null;
  readonly sizePx: number;
  readonly hitRadiusPx: number;
  /** `true` for the 068 camera target. */
  readonly selected: boolean;
  readonly followed: boolean;
  readonly selectable: boolean;
  /** Complete accessible marker description; also the button `aria-label`. */
  readonly description: string;
}

export interface MapSelectionCounts {
  readonly total: number;
  readonly taxis: number;
  readonly civilians: number;
  readonly selectable: number;
  readonly selected: number;
  /** Markers present in `previous` but absent from this projection. */
  readonly removed: number;
}

export interface MapSelectionProjection {
  readonly widthPx: number;
  readonly heightPx: number;
  /** Deterministically ordered by `markerId` (lexicographic). */
  readonly markers: readonly MapMarkerProjection[];
  readonly counts: MapSelectionCounts;
  readonly description: string;
  /** Deterministic change signature; `removed` is deliberately excluded. */
  readonly signature: string;
}

export interface MapSelectionProjectionOptions {
  /** Markers of the last rendered projection, used only for the `removed` count. */
  readonly previous?: readonly MapMarkerProjection[];
  readonly markerSizePx?: number;
  readonly hitRadiusPx?: number;
}

export interface MapMarkerHit {
  readonly vehicleId: string;
  readonly kind: MapSelectionKind;
}

export interface MapMarkerHitOptions {
  /** Overrides every marker's radius; clamped to 1..`maximumHitRadiusPx`. */
  readonly hitRadiusPx?: number;
}

const SYMBOLS: Readonly<Record<MapSelectionKind, 'T' | 'C'>> = Object.freeze({
  TAXI: 'T',
  CIVIL: 'C',
});

const KIND_LABELS: Readonly<Record<MapSelectionKind, string>> = Object.freeze({
  TAXI: 'Taxi',
  CIVIL: 'Civil',
});

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
  if (typeof value !== 'string' || !value.trim() || value.length > MAP_SELECTION_LIMITS.idCodeUnits)
    fail(`${label} identity`);
  return value;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be finite`);
  return value;
}

function positive(value: unknown, label: string): number {
  const number = finite(value, label);
  if (number <= 0) fail(`${label} must be positive`);
  return number;
}

function count(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    fail(`${label} must be a nonnegative integer`);
  return value;
}

function parseVehicle(value: unknown): MapSelectionVehicle {
  const entry = exact(
      value,
      ['vehicleId', 'kind', 'slot', 'label', 'positionM', 'headingRad', 'available', 'selectable'],
      'Map selection vehicle',
    ),
    kind = entry.kind as MapSelectionKind,
    slot = entry.slot;
  if (kind !== 'TAXI' && kind !== 'CIVIL') fail('Map selection kind');
  if (typeof slot !== 'number' || !Number.isSafeInteger(slot) || slot < 1 || slot > 9999)
    fail('Map selection slot');
  let label: string | null = null;
  if (entry.label !== null) {
    if (
      typeof entry.label !== 'string' ||
      !entry.label.trim() ||
      entry.label.length > MAP_SELECTION_LIMITS.labelCodeUnits
    )
      fail('Map selection label');
    label = entry.label;
  }
  let positionM: MapSelectionPositionM | null = null;
  if (entry.positionM !== null) {
    const point = exact(entry.positionM, ['x', 'y', 'z'], 'Map selection position');
    positionM = Object.freeze({
      x: finite(point.x, 'Map selection position x'),
      y: finite(point.y, 'Map selection position y'),
      z: finite(point.z, 'Map selection position z'),
    });
  }
  const headingRad = entry.headingRad === null ? null : finite(entry.headingRad, 'heading');
  if (typeof entry.available !== 'boolean') fail('Map selection available flag');
  if (typeof entry.selectable !== 'boolean') fail('Map selection selectable flag');
  if (entry.available !== (positionM !== null))
    fail('Map selection availability must match the known position');
  if (entry.selectable && positionM === null)
    fail('Map selection selectable requires a known position');
  if (headingRad !== null && positionM === null)
    fail('Map selection heading requires a known position');
  return Object.freeze({
    vehicleId: id(entry.vehicleId, 'Map selection vehicle'),
    kind,
    slot,
    label,
    positionM,
    headingRad,
    available: entry.available,
    selectable: entry.selectable,
  });
}

/** Validates and freezes one snapshot before any projection, DOM write or pointer work happens. */
export function parseMapSelectionSnapshot(value: unknown): MapSelectionSnapshot {
  const data = exact(
      value,
      [
        'schemaVersion',
        'units',
        'version',
        'sessionId',
        'worldEpoch',
        'tick',
        'followedVehicleId',
        'vehicles',
      ],
      'Map selection snapshot',
    ),
    tick = count(data.tick, 'Map selection tick');
  if (data.schemaVersion !== 1 || data.units !== 'SI' || data.version !== MAP_SELECTION_VERSION)
    fail('Map selection contract');
  if (!Array.isArray(data.vehicles)) fail('Map selection vehicle list');
  if (data.vehicles.length > MAP_SELECTION_LIMITS.vehicles) fail('Map selection vehicle ceiling');
  const vehicles = Object.freeze(data.vehicles.map(parseVehicle)),
    seen = new Set<string>();
  for (const vehicle of vehicles) {
    if (seen.has(vehicle.vehicleId)) fail('Map selection duplicate vehicle');
    seen.add(vehicle.vehicleId);
  }
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    version: MAP_SELECTION_VERSION,
    sessionId: id(data.sessionId, 'Map selection session'),
    worldEpoch: count(data.worldEpoch, 'Map selection world epoch'),
    tick,
    followedVehicleId:
      data.followedVehicleId === null
        ? null
        : id(data.followedVehicleId, 'Map selection followed vehicle'),
    vehicles,
  });
}

function headingDegrees(headingRad: number): number {
  const full = Math.PI * 2;
  let value = headingRad % full;
  if (value > Math.PI) value -= full;
  if (value < -Math.PI) value += full;
  return Math.round(((value * 180) / Math.PI + 360) % 360);
}

function normalizeHeading(headingRad: number): number {
  const full = Math.PI * 2;
  let value = headingRad % full;
  if (value > Math.PI) value -= full;
  if (value < -Math.PI) value += full;
  return value;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function markerDescription(
  vehicle: MapSelectionVehicle,
  label: string,
  selected: boolean,
  selectable: boolean,
): string {
  const kindLabel = KIND_LABELS[vehicle.kind],
    position = vehicle.positionM;
  return [
    `${label} (${vehicle.vehicleId})`,
    `simbol ${SYMBOLS[vehicle.kind]}`,
    position === null
      ? 'poziția nu este disponibilă'
      : `poziție x ${position.x.toFixed(1)} m, z ${position.z.toFixed(1)} m` +
        (vehicle.headingRad === null ? '' : `, direcție ${headingDegrees(vehicle.headingRad)}°`),
    selected ? 'vehicul urmărit de cameră' : 'neurmărit',
    selectable ? 'selectabil' : 'indisponibil pentru selecție',
    `tip ${kindLabel}`,
  ].join('; ');
}

function projectionDescription(
  markers: readonly MapMarkerProjection[],
  counts: MapSelectionCounts,
  followedVehicleId: string | null,
): string {
  const followed =
    followedVehicleId === null
      ? 'Niciun vehicul urmărit.'
      : (markers.find((marker) => marker.selected)?.description ??
        `Vehiculul urmărit ${followedVehicleId} nu are poziție cunoscută.`);
  return [
    `Selectare pe hartă: ${counts.taxis} taxiuri și ${counts.civilians} mașini civile.`,
    `${counts.selectable} markeri selectabili.`,
    followed,
    'Un click schimbă doar ținta camerei; vehiculul rămâne în AUTO până la preluarea explicită și nu este teleportat.',
  ].join(' ');
}

/**
 * Projects every available vehicle through the real 074 `MinimapTransform`. Taxis and civilians are
 * distinguished by the `T`/`C` symbol and the accessible text, not by colour. Vehicles without a
 * known position produce no marker, so no coordinate is invented.
 */
export function projectMapSelection(
  transform: MinimapTransform,
  snapshot: MapSelectionSnapshot,
  options: MapSelectionProjectionOptions = {},
): MapSelectionProjection {
  const markerSizePx = positive(
      options.markerSizePx ?? MAP_SELECTION_LIMITS.markerSizePx,
      'Map selection marker size',
    ),
    hitRadiusPx = positive(
      options.hitRadiusPx ?? MAP_SELECTION_LIMITS.hitRadiusPx,
      'Map selection hit radius',
    ),
    markers: MapMarkerProjection[] = [];
  for (const vehicle of snapshot.vehicles) {
    if (!vehicle.available || vehicle.positionM === null) continue;
    const point = projectMinimapPoint(transform, vehicle.positionM),
      label = vehicle.label ?? `${KIND_LABELS[vehicle.kind]} #${vehicle.slot}`,
      selected = snapshot.followedVehicleId === vehicle.vehicleId,
      headingRad = vehicle.headingRad === null ? null : normalizeHeading(vehicle.headingRad),
      marker: MapMarkerProjection = Object.freeze({
        markerId: vehicle.vehicleId,
        vehicleId: vehicle.vehicleId,
        kind: vehicle.kind,
        slot: vehicle.slot,
        symbol: SYMBOLS[vehicle.kind],
        label,
        x: point.x,
        y: point.y,
        headingRad,
        sizePx: markerSizePx,
        hitRadiusPx,
        selected,
        followed: selected,
        selectable: vehicle.selectable,
        description: markerDescription(vehicle, label, selected, vehicle.selectable),
      });
    markers.push(marker);
  }
  markers.sort((left, right) => compareText(left.markerId, right.markerId));
  const previous = options.previous ?? Object.freeze([]),
    present = new Set(markers.map((marker) => marker.markerId));
  let removed = 0;
  for (const marker of previous) if (!present.has(marker.markerId)) removed += 1;
  const taxis = markers.filter((marker) => marker.kind === 'TAXI').length,
    civilians = markers.length - taxis,
    selectable = markers.filter((marker) => marker.selectable).length,
    selected = markers.filter((marker) => marker.selected).length,
    counts: MapSelectionCounts = Object.freeze({
      total: markers.length,
      taxis,
      civilians,
      selectable,
      selected,
      removed,
    }),
    signature = JSON.stringify([
      MAP_SELECTION_VERSION,
      snapshot.sessionId,
      snapshot.worldEpoch,
      snapshot.followedVehicleId,
      markers.map((marker) => [
        marker.markerId,
        marker.kind,
        marker.x.toFixed(3),
        marker.y.toFixed(3),
        marker.label,
        marker.selectable,
        marker.selected,
      ]),
    ]);
  return Object.freeze({
    widthPx: transform.widthPx,
    heightPx: transform.heightPx,
    markers: Object.freeze(markers),
    counts,
    description: projectionDescription(markers, counts, snapshot.followedVehicleId),
    signature,
  });
}

/**
 * Deterministic nearest-marker hit test. Only selectable markers with finite coordinates take part;
 * a distance exactly equal to the radius counts as a hit. Ties are broken by the stable `vehicleId`
 * (lexicographically smaller wins), never by array order.
 */
export function hitTestMapMarker(
  markers: readonly MapMarkerProjection[],
  pointPx: MinimapPointPx,
  options: MapMarkerHitOptions = {},
): MapMarkerHit | null {
  if (![pointPx.x, pointPx.y].every(Number.isFinite)) return null;
  const requested = options.hitRadiusPx ?? MAP_SELECTION_LIMITS.hitRadiusPx;
  if (!Number.isFinite(requested) || requested <= 0)
    throw new Error('Map selection hit radius must be positive');
  const radius = Math.min(requested, MAP_SELECTION_LIMITS.maximumHitRadiusPx);
  let best: MapMarkerProjection | null = null,
    bestDistance = Number.POSITIVE_INFINITY;
  for (const marker of markers) {
    if (!marker.selectable) continue;
    if (![marker.x, marker.y].every(Number.isFinite)) continue;
    const distance = Math.hypot(marker.x - pointPx.x, marker.y - pointPx.y);
    if (distance > radius) continue;
    if (
      best === null ||
      distance < bestDistance ||
      (distance === bestDistance && compareText(marker.markerId, best.markerId) < 0)
    ) {
      best = marker;
      bestDistance = distance;
    }
  }
  return best === null ? null : Object.freeze({ vehicleId: best.vehicleId, kind: best.kind });
}

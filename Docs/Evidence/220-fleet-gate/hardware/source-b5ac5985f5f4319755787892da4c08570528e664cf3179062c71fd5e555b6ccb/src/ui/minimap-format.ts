import type { RideState } from '../fleet';
import { formatDistanceM, formatDuration } from './taxi-hud-format';

/**
 * 074 minimap contract. The map is drawn north-up in the X/Z road plane: screen x grows with world
 * +X (east) and screen y shrinks with world +Z (north). Nothing here imports Babylon, a camera or a
 * renderer; the same projection feeds the canvas adapter, the tests and the evidence report.
 */
export const MINIMAP_VERSION = '074-minimap-v1' as const;

export const MINIMAP_LIMITS = Object.freeze({
  version: MINIMAP_VERSION,
  /** Marker/route repaint ceiling. Independent of the authoritative simulation tick. */
  maximumHz: 10,
  widthPx: 240,
  heightPx: 240,
  paddingPx: 10,
  elements: 8,
  textNodes: 4,
  listeners: 0,
  /** Same ceiling as the 041 route and the 064 stored route. */
  routeLanes: 256,
  lanes: 4096,
  idCodeUnits: 512,
  retainedFrames: 1,
});

export interface MinimapPointM {
  readonly x: number;
  readonly z: number;
}

export interface MinimapPositionM {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface MinimapBounds {
  readonly minM: MinimapPointM;
  readonly maxM: MinimapPointM;
}

/** One real lane polyline in driving direction, read from the 033 directed graph. */
export interface MinimapLaneGeometry {
  readonly laneId: string;
  readonly geometryId: string;
  readonly direction: 'FORWARD' | 'REVERSE';
  readonly widthM: number;
  readonly points: readonly MinimapPointM[];
}

export interface MinimapIntersectionGeometry {
  readonly intersectionId: string;
  readonly points: readonly MinimapPointM[];
}

/** A real declared Movement path, used to join consecutive route lanes through a junction. */
export interface MinimapMovementGeometry {
  readonly fromLaneId: string;
  readonly toLaneId: string;
  readonly points: readonly MinimapPointM[];
}

export interface MinimapZoneGeometry {
  readonly zoneId: string;
  readonly kind: 'PICKUP' | 'DROPOFF' | 'BOTH';
  /** Real service-zone anchor node position. */
  readonly point: MinimapPointM;
}

/** Static geometry extracted once by the composition root from the real map and lane graph. */
export interface MinimapGeometry {
  readonly mapId: string;
  readonly bounds: MinimapBounds;
  readonly lanes: readonly MinimapLaneGeometry[];
  readonly intersections: readonly MinimapIntersectionGeometry[];
  readonly movements: readonly MinimapMovementGeometry[];
  readonly zones: readonly MinimapZoneGeometry[];
}

export type MinimapRouteStatus = 'READY' | 'NO_ROUTE';
export type MinimapLeg = 'PICKUP' | 'TRIP';
export type MinimapServiceState = 'FREE_FLOW' | 'CONGESTED' | 'BLOCKED';

/** Closed 064 reasons kept verbatim; these are the only reasons that may reach the minimap. */
export const MINIMAP_ROUTE_REASONS = [
  'ROUTE_MISSING',
  'ROUTE_STALE',
  'ROUTE_INVALID',
  'POSITION_INVALID',
  'OFF_ROUTE',
  'SERVICE_BLOCKED',
  'STALE_TICK',
  'WRONG_RIDE',
  'FOREIGN_VEHICLE',
  'RIDE_TERMINAL',
] as const;
export type MinimapRouteReason = (typeof MINIMAP_ROUTE_REASONS)[number];

/**
 * The current route leg as certified by 064. `laneIds` is present only for a `READY` route; a
 * missing or stale route is never silently replaced with a guess from the ride record.
 */
export interface MinimapFrameRoute {
  readonly status: MinimapRouteStatus;
  readonly reason: MinimapRouteReason | null;
  readonly laneIds: readonly string[] | null;
  readonly leg: MinimapLeg | null;
  readonly progressFraction: number | null;
  readonly remainingDistanceM: number | null;
  readonly etaSeconds: number | null;
  readonly etaMinSeconds: number | null;
  readonly etaMaxSeconds: number | null;
  readonly serviceState: MinimapServiceState | null;
}

export interface MinimapFrameTaxi {
  readonly vehicleId: string;
  readonly slot: number;
}

export interface MinimapFrameRide {
  readonly rideId: string;
  readonly taxiId: string;
  readonly state: RideState;
  readonly pickupZoneId: string;
  readonly dropoffZoneId: string;
}

/** One host frame: accepted taxi/position readback plus the real 061/064 ride state. */
export interface MinimapFrame {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: typeof MINIMAP_VERSION;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
  readonly taxi: MinimapFrameTaxi | null;
  readonly positionM: MinimapPositionM | null;
  readonly headingRad: number | null;
  readonly ride: MinimapFrameRide | null;
  readonly route: MinimapFrameRoute;
}

export type MinimapMarkerRole = 'TAXI' | 'PICKUP' | 'DROPOFF';

export interface MinimapMarker {
  readonly role: MinimapMarkerRole;
  readonly label: 'P' | 'D' | '';
  readonly x: number;
  readonly y: number;
  /** Map-plane heading in radians: zero +X, positive toward +Z. `null` without a heading. */
  readonly headingRad: number | null;
  /** Real service-zone id for pickup/dropoff markers; `null` for the taxi marker. */
  readonly zoneId: string | null;
}

export interface MinimapRoadCommand {
  readonly kind: 'road';
  readonly geometryId: string;
  readonly points: readonly MinimapPointPx[];
  readonly widthPx: number;
}

export interface MinimapAreaCommand {
  readonly kind: 'area';
  readonly intersectionId: string;
  readonly points: readonly MinimapPointPx[];
}

export type MinimapStaticCommand = MinimapRoadCommand | MinimapAreaCommand;

/** Route points are already projected to canvas pixels; laneIds stay attached for auditability. */
export interface MinimapRouteCommand {
  readonly kind: 'route';
  readonly laneIds: readonly string[];
  readonly points: readonly MinimapPointPx[];
}

export interface MinimapMarkerCommand {
  readonly kind: 'marker';
  readonly role: MinimapMarkerRole;
  readonly label: 'P' | 'D' | '';
  readonly x: number;
  readonly y: number;
  readonly headingRad: number | null;
  readonly zoneId: string | null;
}

export type MinimapDynamicCommand = MinimapRouteCommand | MinimapMarkerCommand;

export interface MinimapPointPx {
  readonly x: number;
  readonly y: number;
}

export interface MinimapTransform {
  readonly widthPx: number;
  readonly heightPx: number;
  /** Canvas pixels per world metre, uniform on both axes. */
  readonly scale: number;
  readonly centerXM: number;
  readonly centerZM: number;
  /** Canvas centre in pixels. */
  readonly centerXPx: number;
  readonly centerYPx: number;
}

export interface MinimapProjection {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly staticCommands: readonly MinimapStaticCommand[];
  readonly dynamicCommands: readonly MinimapDynamicCommand[];
  readonly markers: readonly MinimapMarker[];
  readonly route: {
    readonly status: MinimapRouteStatus;
    readonly reason: MinimapRouteReason | null;
    readonly laneIds: readonly string[] | null;
    readonly points: readonly MinimapPointPx[];
    /** `READY` only when every 064 lane has real 033 geometry. */
    readonly geometryStatus: 'READY' | 'NO_ROUTE';
  };
  readonly progressText: string;
  readonly etaText: string;
  readonly routeText: string;
  readonly description: string;
  readonly signature: string;
}

export interface MinimapSceneStats {
  readonly lanes: number;
  readonly roads: number;
  readonly intersections: number;
  readonly zones: number;
  readonly movements: number;
}

export interface MinimapScene {
  readonly version: typeof MINIMAP_VERSION;
  readonly mapId: string;
  readonly transform: MinimapTransform;
  readonly staticCommands: readonly MinimapStaticCommand[];
  readonly lanes: ReadonlyMap<string, readonly MinimapPointM[]>;
  readonly movements: ReadonlyMap<string, readonly MinimapPointM[]>;
  readonly zones: ReadonlyMap<string, MinimapZoneGeometry>;
  readonly stats: MinimapSceneStats;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`Minimap ${label} must be finite`);
  return value;
}

function positive(value: unknown, label: string): number {
  const number = finite(value, label);
  if (number <= 0) throw new Error(`Minimap ${label} must be positive`);
  return number;
}

/**
 * Deterministic north-up transform: one uniform scale, the map bounds centred in the viewport and
 * +Z drawn upward. `scale` is the only free variable; padding is included in both axes.
 */
export function createMinimapTransform(
  bounds: MinimapBounds,
  options: {
    readonly widthPx?: number;
    readonly heightPx?: number;
    readonly paddingPx?: number;
  } = {},
): MinimapTransform {
  const widthPx = positive(options.widthPx ?? MINIMAP_LIMITS.widthPx, 'width'),
    heightPx = positive(options.heightPx ?? MINIMAP_LIMITS.heightPx, 'height'),
    paddingPx = finite(options.paddingPx ?? MINIMAP_LIMITS.paddingPx, 'padding');
  if (paddingPx < 0 || paddingPx * 2 >= Math.min(widthPx, heightPx))
    throw new Error('Minimap padding is outside the viewport');
  const minX = finite(bounds.minM.x, 'bounds min x'),
    maxX = finite(bounds.maxM.x, 'bounds max x'),
    minZ = finite(bounds.minM.z, 'bounds min z'),
    maxZ = finite(bounds.maxM.z, 'bounds max z'),
    extentX = maxX - minX,
    extentZ = maxZ - minZ;
  if (extentX <= 0 || extentZ <= 0) throw new Error('Minimap bounds must have a positive extent');
  const scale = Math.min((widthPx - paddingPx * 2) / extentX, (heightPx - paddingPx * 2) / extentZ);
  return Object.freeze({
    widthPx,
    heightPx,
    scale,
    centerXM: (minX + maxX) / 2,
    centerZM: (minZ + maxZ) / 2,
    centerXPx: widthPx / 2,
    centerYPx: heightPx / 2,
  });
}

/** The single documented world-to-map transform used by drawing, markers and tests. */
export function projectMinimapPoint(
  transform: MinimapTransform,
  point: MinimapPointM,
): MinimapPointPx {
  return Object.freeze({
    x: transform.centerXPx + (finite(point.x, 'point x') - transform.centerXM) * transform.scale,
    y: transform.centerYPx - (finite(point.z, 'point z') - transform.centerZM) * transform.scale,
  });
}

function readPoint(value: unknown, label: string): MinimapPointM {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Minimap ${label} must be a point`);
  const data = value as Record<string, unknown>;
  return Object.freeze({ x: finite(data.x, `${label} x`), z: finite(data.z, `${label} z`) });
}

function readPoints(value: unknown, label: string, minimum: number): readonly MinimapPointM[] {
  if (!Array.isArray(value) || value.length < minimum)
    throw new Error(`Minimap ${label} needs at least ${minimum} points`);
  return Object.freeze(value.map((point, index) => readPoint(point, `${label}[${index}]`)));
}

function freezeLanes(geometry: MinimapGeometry): readonly MinimapLaneGeometry[] {
  if (!Array.isArray(geometry.lanes) || geometry.lanes.length > MINIMAP_LIMITS.lanes)
    throw new Error('Minimap lane count');
  return Object.freeze(
    geometry.lanes.map((lane) => {
      if (typeof lane.laneId !== 'string' || !lane.laneId.trim())
        throw new Error('Minimap lane id');
      if (lane.direction !== 'FORWARD' && lane.direction !== 'REVERSE')
        throw new Error('Minimap lane direction');
      return Object.freeze({
        laneId: lane.laneId,
        geometryId: lane.geometryId,
        direction: lane.direction,
        widthM: positive(lane.widthM, `lane ${lane.laneId} width`),
        points: readPoints(lane.points, `lane ${lane.laneId}`, 2),
      });
    }),
  );
}

/**
 * Builds the static layer once. Roads are deduplicated per real geometry+direction (opposite lanes
 * keep their own polyline); route lanes still keep their own directed points for exact tracing.
 */
export function createMinimapScene(
  geometry: MinimapGeometry,
  options: {
    readonly widthPx?: number;
    readonly heightPx?: number;
    readonly paddingPx?: number;
  } = {},
): MinimapScene {
  if (!geometry || typeof geometry !== 'object') throw new Error('Minimap geometry is required');
  if (typeof geometry.mapId !== 'string' || !geometry.mapId.trim())
    throw new Error('Minimap map id');
  const transform = createMinimapTransform(geometry.bounds, options),
    lanes = freezeLanes(geometry),
    laneMap = new Map<string, readonly MinimapPointM[]>(),
    roads = new Map<
      string,
      { geometryId: string; points: readonly MinimapPointM[]; widthM: number }
    >();
  for (const lane of lanes) {
    if (laneMap.has(lane.laneId)) throw new Error(`Minimap duplicate lane ${lane.laneId}`);
    laneMap.set(lane.laneId, lane.points);
    const key = `${lane.geometryId}:${lane.direction}`,
      existing = roads.get(key);
    if (existing === undefined || lane.widthM > existing.widthM)
      roads.set(key, { geometryId: lane.geometryId, points: lane.points, widthM: lane.widthM });
  }
  const intersections = Object.freeze(
      (geometry.intersections ?? []).map((entry) =>
        Object.freeze({
          intersectionId: entry.intersectionId,
          points: readPoints(entry.points, `intersection ${entry.intersectionId}`, 3),
        }),
      ),
    ),
    movements = new Map<string, readonly MinimapPointM[]>();
  for (const entry of geometry.movements ?? [])
    movements.set(
      `${entry.fromLaneId}>${entry.toLaneId}`,
      readPoints(entry.points, `movement ${entry.fromLaneId}>${entry.toLaneId}`, 2),
    );
  const zoneMap = new Map<string, MinimapZoneGeometry>();
  for (const zone of geometry.zones ?? []) {
    if (typeof zone.zoneId !== 'string' || !zone.zoneId.trim()) throw new Error('Minimap zone id');
    zoneMap.set(
      zone.zoneId,
      Object.freeze({ ...zone, point: readPoint(zone.point, 'zone point') }),
    );
  }
  const staticCommands: MinimapStaticCommand[] = [];
  for (const entry of intersections)
    staticCommands.push(
      Object.freeze({
        kind: 'area' as const,
        intersectionId: entry.intersectionId,
        points: entry.points.map((point) => projectMinimapPoint(transform, point)),
      }),
    );
  for (const road of roads.values())
    staticCommands.push(
      Object.freeze({
        kind: 'road' as const,
        geometryId: road.geometryId,
        points: road.points.map((point) => projectMinimapPoint(transform, point)),
        widthPx: Math.min(8, Math.max(1.4, road.widthM * transform.scale)),
      }),
    );
  return Object.freeze({
    version: MINIMAP_VERSION,
    mapId: geometry.mapId,
    transform,
    staticCommands: Object.freeze(staticCommands),
    lanes: laneMap,
    movements,
    zones: zoneMap,
    stats: Object.freeze({
      lanes: laneMap.size,
      roads: roads.size,
      intersections: intersections.length,
      zones: zoneMap.size,
      movements: movements.size,
    }),
  });
}

function samePoint(left: MinimapPointM | null, right: MinimapPointM): boolean {
  return left !== null && Math.abs(left.x - right.x) <= 1e-9 && Math.abs(left.z - right.z) <= 1e-9;
}

/**
 * Traces exactly the certified 041 lane sequence. A lane without real geometry fails the whole
 * route closed instead of drawing a partial or invented path; consecutive lanes are joined by the
 * declared Movement path when one exists and otherwise keep their real junction gap.
 */
function projectRoute(scene: MinimapScene, route: MinimapFrameRoute): MinimapProjection['route'] {
  if (route.status !== 'READY' || route.laneIds === null)
    return Object.freeze({
      status: 'NO_ROUTE' as const,
      reason: route.reason,
      laneIds: null,
      points: Object.freeze([]),
      geometryStatus: 'NO_ROUTE' as const,
    });
  const laneIds = route.laneIds,
    worldPoints: MinimapPointM[] = [];
  for (let index = 0; index < laneIds.length; index += 1) {
    const laneId = laneIds[index]!,
      points = scene.lanes.get(laneId);
    if (points === undefined)
      return Object.freeze({
        status: 'NO_ROUTE' as const,
        reason: 'ROUTE_MISSING' as const,
        laneIds: null,
        points: Object.freeze([]),
        geometryStatus: 'NO_ROUTE' as const,
      });
    for (const point of points) {
      if (samePoint(worldPoints[worldPoints.length - 1] ?? null, point)) continue;
      worldPoints.push(point);
    }
    const next = laneIds[index + 1];
    if (next === undefined) continue;
    const movement = scene.movements.get(`${laneId}>${next}`);
    if (movement === undefined) continue;
    for (let pointIndex = 0; pointIndex < movement.length; pointIndex += 1) {
      const point = movement[pointIndex]!;
      if (pointIndex === 0 && samePoint(worldPoints[worldPoints.length - 1] ?? null, point))
        continue;
      worldPoints.push(point);
    }
  }
  return Object.freeze({
    status: 'READY' as const,
    reason: route.reason,
    laneIds,
    points: Object.freeze(worldPoints.map((point) => projectMinimapPoint(scene.transform, point))),
    geometryStatus: 'READY' as const,
  });
}

function normalizeHeading(headingRad: number): number {
  const full = Math.PI * 2;
  let value = headingRad % full;
  if (value > Math.PI) value -= full;
  if (value < -Math.PI) value += full;
  return value;
}

function headingDegrees(headingRad: number): number {
  return ((normalizeHeading(headingRad) * 180) / Math.PI + 360) % 360;
}

function progressText(route: MinimapFrameRoute): string {
  const fraction = route.progressFraction,
    remaining = route.remainingDistanceM;
  if (fraction === null && remaining === null) return '—';
  const percent =
    fraction === null ? null : `${Math.min(100, Math.max(0, Math.round(fraction * 100)))}%`;
  const distance = formatDistanceM(remaining);
  if (percent === null) return distance;
  if (remaining === null) return percent;
  return `${percent} · ${distance}`;
}

function etaText(route: MinimapFrameRoute): string {
  if (route.serviceState === 'BLOCKED') return 'Indisponibil';
  if (route.etaSeconds === null) return route.status === 'READY' ? 'Indisponibil' : 'Fără estimare';
  if (route.etaSeconds === 0 && route.progressFraction === 1)
    return route.leg === 'PICKUP' ? 'La pasager' : 'La destinație';
  return `~${formatDuration(route.etaSeconds)}`;
}

const REASON_TEXT: Readonly<Record<MinimapRouteReason, string>> = Object.freeze({
  ROUTE_MISSING: 'ruta lipsește',
  ROUTE_STALE: 'ruta nu mai corespunde planului 041',
  ROUTE_INVALID: 'ruta este invalidă',
  POSITION_INVALID: 'poziția nu este pe traseu',
  OFF_ROUTE: 'taxiul este în afara traseului',
  SERVICE_BLOCKED: 'serviciul este blocat',
  STALE_TICK: 'tick-ul este în urmă',
  WRONG_RIDE: 'cursa nu există',
  FOREIGN_VEHICLE: 'taxiul nu este revendicat de cursă',
  RIDE_TERMINAL: 'cursa este închisă',
});

function routeText(route: MinimapProjection['route'], frame: MinimapFrameRoute): string {
  if (route.status === 'READY') {
    const base = `Rută: ${route.laneIds?.length ?? 0} benzi · ${progressText(frame)}`;
    return frame.reason === null ? base : `${base} · ${REASON_TEXT[frame.reason]}`;
  }
  if (frame.reason === null) return 'Fără rută: 064 nu a observat încă o estimare';
  return `Fără rută: ${REASON_TEXT[frame.reason]} (${frame.reason})`;
}

function markerText(scene: MinimapScene, frame: MinimapFrame): string {
  if (frame.ride === null) return 'Nicio cursă activă pentru marcarea ridicării și predării.';
  if (frame.taxi === null || frame.ride.taxiId !== frame.taxi.vehicleId)
    return 'Cursa aparține altui taxi; ridicarea și predarea nu sunt marcate.';
  const missing = [frame.ride.pickupZoneId, frame.ride.dropoffZoneId].filter(
    (zoneId) => !scene.zones.has(zoneId),
  );
  return (
    `Ridicare la zona ${frame.ride.pickupZoneId}; predare la zona ${frame.ride.dropoffZoneId}.` +
    (missing.length === 0
      ? ''
      : ` Fără marker pentru ${missing.join(', ')}: zona lipsește din hartă.`)
  );
}

function description(
  scene: MinimapScene,
  frame: MinimapFrame,
  texts: { readonly progress: string; readonly route: string; readonly eta: string },
): string {
  const taxi =
      frame.taxi === null
        ? 'Niciun taxi selectat.'
        : `Taxi #${frame.taxi.slot} (${frame.taxi.vehicleId}).`,
    position =
      frame.positionM === null
        ? 'Poziția taxiului nu este disponibilă.'
        : `Poziție x ${frame.positionM.x.toFixed(1)} m, z ${frame.positionM.z.toFixed(1)} m` +
          (frame.headingRad === null
            ? '.'
            : `, direcție ${Math.round(headingDegrees(frame.headingRad))}°.`),
    eta = `ETA ${texts.eta}.`,
    route = `Progres ${texts.progress}. ${texts.route}.`;
  return `Minimapă nord-sus (X est, Z nord), harta ${scene.mapId}. ${taxi} ${position} ${route} ${eta} ${markerText(scene, frame)}`;
}

/** Pure projection of one accepted frame onto the static scene. */
export function projectMinimap(scene: MinimapScene, frame: MinimapFrame): MinimapProjection {
  const route = projectRoute(scene, frame.route),
    dynamicCommands: MinimapDynamicCommand[] = [],
    markers: MinimapMarker[] = [];
  if (route.status === 'READY')
    dynamicCommands.push(
      Object.freeze({
        kind: 'route' as const,
        laneIds: route.laneIds ?? Object.freeze([]),
        points: route.points,
      }),
    );
  if (frame.positionM !== null) {
    const point = projectMinimapPoint(scene.transform, frame.positionM),
      headingRad = frame.headingRad === null ? null : normalizeHeading(frame.headingRad),
      marker: MinimapMarker = Object.freeze({
        role: 'TAXI' as const,
        label: '' as const,
        x: point.x,
        y: point.y,
        headingRad,
        zoneId: null,
      });
    markers.push(marker);
    dynamicCommands.push(
      Object.freeze({
        kind: 'marker' as const,
        role: 'TAXI' as const,
        label: '' as const,
        x: marker.x,
        y: marker.y,
        headingRad,
        zoneId: null,
      }),
    );
  }
  if (frame.ride !== null && frame.taxi !== null && frame.ride.taxiId === frame.taxi.vehicleId) {
    const addZone = (zoneId: string, role: 'PICKUP' | 'DROPOFF', label: 'P' | 'D') => {
      const zone = scene.zones.get(zoneId);
      if (zone === undefined) return;
      const point = projectMinimapPoint(scene.transform, zone.point),
        marker: MinimapMarker = Object.freeze({
          role,
          label,
          x: point.x,
          y: point.y,
          headingRad: null,
          zoneId,
        });
      markers.push(marker);
      dynamicCommands.push(
        Object.freeze({
          kind: 'marker' as const,
          role,
          label,
          x: marker.x,
          y: marker.y,
          headingRad: null,
          zoneId,
        }),
      );
    };
    addZone(frame.ride.pickupZoneId, 'PICKUP', 'P');
    addZone(frame.ride.dropoffZoneId, 'DROPOFF', 'D');
  }
  const progress = progressText(frame.route),
    eta = etaText(frame.route),
    routeTextValue = routeText(route, frame.route),
    projection = {
      widthPx: scene.transform.widthPx,
      heightPx: scene.transform.heightPx,
      staticCommands: scene.staticCommands,
      dynamicCommands: Object.freeze(dynamicCommands),
      markers: Object.freeze(markers),
      route,
      progressText: progress,
      etaText: eta,
      routeText: routeTextValue,
      description: '',
      signature: '',
    } satisfies MinimapProjection;
  const withText: MinimapProjection = Object.freeze({
    ...projection,
    description: description(scene, frame, { progress, route: routeTextValue, eta }),
  });
  return Object.freeze({
    ...withText,
    signature: JSON.stringify([
      scene.mapId,
      frame.taxi?.vehicleId ?? null,
      frame.positionM === null
        ? null
        : [
            frame.positionM.x.toFixed(3),
            frame.positionM.z.toFixed(3),
            frame.headingRad === null ? null : frame.headingRad.toFixed(4),
          ],
      frame.ride?.rideId ?? null,
      frame.ride?.state ?? null,
      frame.ride?.pickupZoneId ?? null,
      frame.ride?.dropoffZoneId ?? null,
      route.status,
      route.laneIds,
      frame.route.reason,
      frame.route.progressFraction,
      frame.route.etaSeconds,
      withText.routeText,
    ]),
  });
}

// ---------------------------------------------------------------------------------------------
// Canvas projection. The adapter owns the canvas; these functions only call a small 2D port.
// ---------------------------------------------------------------------------------------------

export interface MinimapContext {
  clearRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  stroke(): void;
  fill(): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  fillText(text: string, x: number, y: number): void;
  setLineDash(segments: number[]): void;
  strokeStyle: unknown;
  fillStyle: unknown;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  font: string;
  textAlign: string;
  textBaseline: string;
}

export type MinimapLayer = 'static' | 'dynamic';

/** Paints one layer. Static road commands never depend on the frame; the adapter paints them once. */
export function paintMinimapLayer(
  context: MinimapContext,
  projection: MinimapProjection,
  layer: MinimapLayer,
): void {
  context.clearRect(0, 0, projection.widthPx, projection.heightPx);
  context.setLineDash([]);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  if (layer === 'static') {
    for (const command of projection.staticCommands) {
      if (command.kind === 'area') {
        context.fillStyle = '#23302c';
        context.beginPath();
        command.points.forEach((point, index) =>
          index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y),
        );
        context.closePath();
        context.fill();
        continue;
      }
      context.strokeStyle = '#5a726a';
      context.lineWidth = command.widthPx;
      context.beginPath();
      command.points.forEach((point, index) =>
        index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y),
      );
      context.stroke();
    }
    return;
  }
  for (const command of projection.dynamicCommands) {
    if (command.kind === 'route') {
      if (command.points.length < 2) continue;
      const trace = () => {
        context.beginPath();
        command.points.forEach((point, index) =>
          index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y),
        );
        context.stroke();
      };
      context.strokeStyle = '#07110d';
      context.lineWidth = 5.5;
      trace();
      context.strokeStyle = '#e9f7ee';
      context.lineWidth = 2.5;
      trace();
      continue;
    }
    if (command.role === 'TAXI') {
      context.fillStyle = '#7fd7ff';
      context.strokeStyle = '#07110d';
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(command.x, command.y, 5, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      if (command.headingRad !== null) {
        const dx = Math.cos(command.headingRad),
          dy = -Math.sin(command.headingRad);
        context.strokeStyle = '#ffffff';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(command.x, command.y);
        context.lineTo(command.x + dx * 11, command.y + dy * 11);
        context.stroke();
      }
      continue;
    }
    context.fillStyle = command.role === 'PICKUP' ? '#ffd27f' : '#9edbb5';
    context.strokeStyle = '#07110d';
    context.lineWidth = 1.5;
    if (command.role === 'PICKUP') {
      context.beginPath();
      context.arc(command.x, command.y, 6.5, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    } else {
      context.beginPath();
      context.moveTo(command.x - 6, command.y - 6);
      context.lineTo(command.x + 6, command.y - 6);
      context.lineTo(command.x + 6, command.y + 6);
      context.lineTo(command.x - 6, command.y + 6);
      context.closePath();
      context.fill();
      context.stroke();
    }
    context.fillStyle = '#07110d';
    context.font = 'bold 9px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(command.label, command.x, command.y + 0.5);
  }
}

// ---------------------------------------------------------------------------------------------
// Strict frame parser, mirroring the 073 HUD validation style.
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
  if (typeof value !== 'string' || !value.trim() || value.length > MINIMAP_LIMITS.idCodeUnits)
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

const RIDE_STATES: readonly RideState[] = [
  'TO_PICKUP',
  'PICKUP',
  'TO_DROPOFF',
  'DROPOFF',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
];
const LEGS: readonly MinimapLeg[] = ['PICKUP', 'TRIP'];
const SERVICE_STATES: readonly MinimapServiceState[] = ['FREE_FLOW', 'CONGESTED', 'BLOCKED'];

function parseRoute(value: unknown): MinimapFrameRoute {
  const data = exact(
      value,
      [
        'status',
        'reason',
        'laneIds',
        'leg',
        'progressFraction',
        'remainingDistanceM',
        'etaSeconds',
        'etaMinSeconds',
        'etaMaxSeconds',
        'serviceState',
      ],
      'Minimap route',
    ),
    status = data.status as MinimapRouteStatus;
  if (status !== 'READY' && status !== 'NO_ROUTE') fail('Minimap route status');
  if (data.reason !== null && !MINIMAP_ROUTE_REASONS.includes(data.reason as MinimapRouteReason))
    fail('Minimap route reason');
  if (data.leg !== null && !LEGS.includes(data.leg as MinimapLeg)) fail('Minimap route leg');
  if (
    data.serviceState !== null &&
    !SERVICE_STATES.includes(data.serviceState as MinimapServiceState)
  )
    fail('Minimap route service');
  let laneIds: readonly string[] | null = null;
  if (data.laneIds !== null) {
    if (!Array.isArray(data.laneIds) || data.laneIds.length === 0) fail('Minimap route lanes');
    if (data.laneIds.length > MINIMAP_LIMITS.routeLanes) fail('Minimap route lane ceiling');
    laneIds = Object.freeze(data.laneIds.map((lane) => id(lane, 'Minimap route lane')));
    if (new Set(laneIds).size !== laneIds.length) fail('Minimap route repeats a lane');
  }
  if (status === 'READY' && laneIds === null) fail('Minimap READY route requires lanes');
  if (status === 'NO_ROUTE' && laneIds !== null)
    fail('Minimap NO_ROUTE route must not carry lanes');
  const progressFraction = optionalNumber(data.progressFraction, 'Minimap route progress', 0, 1),
    remainingDistanceM = optionalNumber(data.remainingDistanceM, 'Minimap route distance', 0, null),
    etaSeconds = optionalNumber(data.etaSeconds, 'Minimap route ETA', 0, null),
    etaMinSeconds = optionalNumber(data.etaMinSeconds, 'Minimap route ETA minimum', 0, null),
    etaMaxSeconds = optionalNumber(data.etaMaxSeconds, 'Minimap route ETA maximum', 0, null);
  if (etaMinSeconds !== null && etaMaxSeconds !== null && etaMinSeconds > etaMaxSeconds)
    fail('Minimap route ETA interval is inverted');
  return Object.freeze({
    status,
    reason: data.reason as MinimapRouteReason | null,
    laneIds,
    leg: data.leg as MinimapLeg | null,
    progressFraction,
    remainingDistanceM,
    etaSeconds,
    etaMinSeconds,
    etaMaxSeconds,
    serviceState: data.serviceState as MinimapServiceState | null,
  });
}

/** Validates and freezes one frame before any canvas or DOM work happens. */
export function parseMinimapFrame(value: unknown): MinimapFrame {
  const data = exact(
      value,
      [
        'schemaVersion',
        'units',
        'version',
        'sessionId',
        'worldEpoch',
        'tick',
        'taxi',
        'positionM',
        'headingRad',
        'ride',
        'route',
      ],
      'Minimap frame',
    ),
    tick = count(data.tick, 'Minimap tick');
  if (data.schemaVersion !== 1 || data.units !== 'SI' || data.version !== MINIMAP_VERSION)
    fail('Minimap frame contract');
  let taxi: MinimapFrameTaxi | null = null;
  if (data.taxi !== null) {
    const entry = exact(data.taxi, ['vehicleId', 'slot'], 'Minimap taxi'),
      slot = entry.slot;
    if (typeof slot !== 'number' || !Number.isSafeInteger(slot) || slot < 1 || slot > 9999)
      fail('Minimap taxi slot');
    taxi = Object.freeze({ vehicleId: id(entry.vehicleId, 'Minimap taxi'), slot });
  }
  let positionM: MinimapPositionM | null = null;
  if (data.positionM !== null) {
    const entry = exact(data.positionM, ['x', 'y', 'z'], 'Minimap position');
    positionM = Object.freeze({
      x: finite(entry.x, 'position x'),
      y: finite(entry.y, 'position y'),
      z: finite(entry.z, 'position z'),
    });
  }
  const headingRad = data.headingRad === null ? null : finite(data.headingRad, 'heading');
  if (headingRad !== null && (headingRad < -Math.PI || headingRad > Math.PI))
    fail('Minimap heading');
  if (positionM === null && headingRad !== null) fail('Minimap heading requires a position');
  if (positionM !== null && taxi === null) fail('Minimap position requires a taxi');
  let ride: MinimapFrameRide | null = null;
  if (data.ride !== null) {
    const entry = exact(
        data.ride,
        ['rideId', 'taxiId', 'state', 'pickupZoneId', 'dropoffZoneId'],
        'Minimap ride',
      ),
      state = entry.state as RideState;
    if (!RIDE_STATES.includes(state)) fail('Minimap ride state');
    if (taxi === null) fail('Minimap ride requires a taxi');
    ride = Object.freeze({
      rideId: id(entry.rideId, 'Minimap ride'),
      taxiId: id(entry.taxiId, 'Minimap ride taxi'),
      state,
      pickupZoneId: id(entry.pickupZoneId, 'Minimap pickup zone'),
      dropoffZoneId: id(entry.dropoffZoneId, 'Minimap dropoff zone'),
    });
  }
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    version: MINIMAP_VERSION,
    sessionId: id(data.sessionId, 'Minimap session'),
    worldEpoch: count(data.worldEpoch, 'Minimap world epoch'),
    tick,
    taxi,
    positionM,
    headingRad,
    ride,
    route: parseRoute(data.route),
  });
}

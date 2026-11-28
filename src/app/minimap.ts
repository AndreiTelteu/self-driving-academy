import type {
  EtaSnapshot,
  FleetHealth,
  FleetRegistry,
  RideEta,
  RideLifecycle,
  RideRecord,
} from '../fleet';
import type { LaneGraph, RoadMap } from '../world';
import type {
  MinimapFrame,
  MinimapFrameRoute,
  MinimapGeometry,
  MinimapIncidentSnapshot,
  MinimapRouteReason,
} from '../ui';

/** The real 032 map and 033 graph that own every line and marker drawn by 074. */
export interface MinimapGeometrySources {
  readonly map: RoadMap;
  readonly graph: LaneGraph;
}

/** One host frame: accepted taxi selection and 005 readback plus the real 061/064 ride state. */
export interface MinimapFrameInput {
  readonly taxiId: string;
  /**
   * PBI 281: presentation-only slot for a composition car that is not in the 057 registry (the
   * two seeded cars use the same 9998/9999 slots as 263). It never creates a fleet identity.
   */
  readonly taxiSlot?: number;
  readonly tick: number;
  readonly positionM: { readonly x: number; readonly y: number; readonly z: number } | null;
  readonly headingRad?: number | null;
  /** Explicit ride binding; otherwise the active 061 ride of `taxiId` is used. */
  readonly rideId?: string | null;
}

/** The real modules whose accepted read models feed one 074 frame. */
export interface MinimapSources {
  readonly fleet: FleetRegistry;
  readonly lifecycle: RideLifecycle;
  readonly eta: RideEta;
}

function legFor(state: RideRecord['state']): 'PICKUP' | 'TRIP' | null {
  if (state === 'TO_PICKUP' || state === 'PICKUP') return 'PICKUP';
  if (state === 'TO_DROPOFF' || state === 'DROPOFF') return 'TRIP';
  return null;
}

function emptyRoute(reason: MinimapRouteReason | null): MinimapFrameRoute {
  return Object.freeze({
    status: 'NO_ROUTE' as const,
    reason,
    laneIds: null,
    leg: null,
    progressFraction: null,
    remainingDistanceM: null,
    etaSeconds: null,
    etaMinSeconds: null,
    etaMaxSeconds: null,
    serviceState: null,
  });
}

/**
 * The minimap must not draw the previous leg or another taxi's plan. 064 keeps its last estimate,
 * so this source drops it whenever the ride, taxi, stage or leg no longer match.
 */
function routeFor(estimate: EtaSnapshot | undefined, ride: RideRecord): MinimapFrameRoute {
  if (
    estimate === undefined ||
    estimate.rideId !== ride.rideId ||
    estimate.taxiId !== ride.taxiId ||
    estimate.state !== ride.state ||
    estimate.leg !== legFor(ride.state)
  )
    return emptyRoute(null);
  const readable = estimate.routeLaneIds !== null && !estimate.stale,
    reason = readable
      ? estimate.reason
      : (estimate.reason ?? (estimate.stale ? 'ROUTE_STALE' : 'ROUTE_MISSING'));
  return Object.freeze({
    status: readable ? ('READY' as const) : ('NO_ROUTE' as const),
    reason: reason as MinimapRouteReason | null,
    laneIds: readable ? estimate.routeLaneIds : null,
    leg: estimate.leg,
    progressFraction: estimate.progressFraction,
    remainingDistanceM: estimate.remainingDistanceM,
    etaSeconds: estimate.etaSeconds,
    etaMinSeconds: estimate.etaMinSeconds,
    etaMaxSeconds: estimate.etaMaxSeconds,
    serviceState: estimate.serviceState,
  });
}

function activeRideFor(lifecycle: RideLifecycle, taxiId: string): RideRecord | undefined {
  return lifecycle.active().find((ride) => ride.taxiId === taxiId);
}

/**
 * Extracts the static minimap geometry once from the validated map and the directed lane graph.
 * It returns plain polylines; no mesh, Babylon camera or second city render is involved.
 */
export function readMinimapGeometry(sources: MinimapGeometrySources): MinimapGeometry {
  const { map, graph } = sources;
  if (map.mapId !== graph.mapId)
    throw new Error('Minimap geometry requires the map and graph of the same mapId');
  const nodes = new Map(map.geometry.nodes.map((node) => [node.id, node.positionM])),
    paths = new Map(map.geometry.paths.map((path) => [path.id, path])),
    areas = new Map(map.geometry.areas.map((area) => [area.id, area.vertexNodeIds])),
    pointOf = (nodeId: string) => {
      const node = nodes.get(nodeId);
      if (node === undefined)
        throw new Error(`Minimap geometry references a missing node ${nodeId}`);
      return { x: node.x, z: node.z };
    },
    pathOf = (geometryId: string) => {
      const path = paths.get(geometryId);
      if (path === undefined)
        throw new Error(`Minimap geometry references a missing path ${geometryId}`);
      return path.nodeIds.map(pointOf);
    };
  const lanes = map.lanes.map((lane) => {
      const directed = graph.getDirectedPath(lane.id);
      if (directed === null) throw new Error(`Minimap geometry has no directed lane ${lane.id}`);
      return Object.freeze({
        laneId: lane.id,
        geometryId: lane.geometryId,
        direction: lane.direction,
        widthM: lane.widthM,
        points: Object.freeze(directed.points.map((point) => ({ x: point.x, z: point.z }))),
      });
    }),
    intersections = map.intersections.map((intersection) => {
      const nodeIds = areas.get(intersection.geometryId);
      if (nodeIds === undefined)
        throw new Error(`Minimap geometry has no intersection area ${intersection.geometryId}`);
      return Object.freeze({
        intersectionId: intersection.id,
        points: Object.freeze(nodeIds.map(pointOf)),
      });
    }),
    movements = map.intersections.flatMap((intersection) =>
      intersection.movements.map((movement) =>
        Object.freeze({
          fromLaneId: movement.fromLaneId,
          toLaneId: movement.toLaneId,
          points: Object.freeze(pathOf(movement.geometryId)),
        }),
      ),
    ),
    zones = map.serviceZones.map((zone) => {
      if (!nodes.has(zone.anchorNodeId))
        throw new Error(`Minimap geometry has no service anchor ${zone.anchorNodeId}`);
      return Object.freeze({
        zoneId: zone.id,
        kind: zone.kind,
        point: pointOf(zone.anchorNodeId),
      });
    });
  return Object.freeze({
    mapId: map.mapId,
    bounds: Object.freeze({
      minM: Object.freeze({ x: map.bounds.minM.x, z: map.bounds.minM.z }),
      maxM: Object.freeze({ x: map.bounds.maxM.x, z: map.bounds.maxM.z }),
    }),
    lanes: Object.freeze(lanes),
    intersections: Object.freeze(intersections),
    movements: Object.freeze(movements),
    zones: Object.freeze(zones),
  });
}

/**
 * Composition root for 074. It reads the real 057 registry, 061 ride and 064 estimate; it never
 * creates a route, a taxi, a zone or a marker of its own.
 */
export function readMinimapFrame(sources: MinimapSources, frame: MinimapFrameInput): MinimapFrame {
  const context = sources.fleet.context(),
    vehicle = sources.fleet.get(frame.taxiId),
    slot = vehicle?.slot ?? frame.taxiSlot,
    taxi =
      vehicle !== undefined
        ? Object.freeze({ vehicleId: vehicle.vehicleId, slot: vehicle.slot })
        : slot === undefined
          ? null
          : Object.freeze({ vehicleId: frame.taxiId, slot }),
    ride =
      vehicle === undefined
        ? undefined
        : frame.rideId === undefined || frame.rideId === null
          ? activeRideFor(sources.lifecycle, frame.taxiId)
          : sources.lifecycle.ride(frame.rideId),
    rideView =
      ride === undefined
        ? null
        : Object.freeze({
            rideId: ride.rideId,
            taxiId: ride.taxiId,
            state: ride.state,
            pickupZoneId: ride.pickupZoneId,
            dropoffZoneId: ride.dropoffZoneId,
          }),
    foreign = ride !== undefined && taxi !== null && ride.taxiId !== taxi.vehicleId,
    route =
      ride === undefined || taxi === null
        ? emptyRoute(null)
        : foreign
          ? emptyRoute('FOREIGN_VEHICLE')
          : routeFor(sources.eta.estimate(ride.rideId), ride),
    positionM =
      taxi === null || frame.positionM === null
        ? null
        : Object.freeze({
            x: frame.positionM.x,
            y: frame.positionM.y,
            z: frame.positionM.z,
          }),
    headingRad =
      positionM === null || frame.headingRad === undefined || frame.headingRad === null
        ? null
        : frame.headingRad;
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    version: '074-minimap-v1',
    sessionId: context.sessionId,
    worldEpoch: context.worldEpoch,
    tick: frame.tick,
    taxi,
    positionM,
    headingRad,
    ride: rideView,
    route,
  });
}

/** One host frame for the incident markers: accepted tick and the current 005/024 readback. */
export interface MinimapIncidentFrame {
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
  /** Current real position of a vehicle; `null` when the host does not know it. */
  readonly positions: (vehicleId: string) => { readonly x: number; readonly z: number } | null;
}

export interface MinimapIncidentSources {
  /** The real 065 health owner; `undefined` is reported as unavailable, never as zero incidents. */
  readonly health: FleetHealth | undefined;
}

/**
 * PBI 281 composition root for incident markers. Only a currently `DAMAGED` taxi whose 065 cause is
 * `COLLISION_DAMAGE` produces a marker, at its current authoritative position. The stable identity
 * is the 065 `factId`; a taxi with a missing position is omitted instead of being placed at (0, 0).
 */
export function readMinimapIncidents(
  sources: MinimapIncidentSources,
  frame: MinimapIncidentFrame,
): MinimapIncidentSnapshot {
  if (sources.health === undefined)
    return Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      version: '281-minimap-incidents-v1' as const,
      sessionId: frame.sessionId,
      worldEpoch: frame.worldEpoch,
      tick: frame.tick,
      health: 'UNAVAILABLE' as const,
      incidents: Object.freeze([]),
    });
  const incidents = sources.health
    .list()
    .filter((entry) => entry.state === 'DAMAGED' && entry.cause === 'COLLISION_DAMAGE')
    .flatMap((entry) => {
      const factId = entry.factId,
        position = frame.positions(entry.taxiId);
      if (factId === null || position === null) return [];
      if (!Number.isFinite(position.x) || !Number.isFinite(position.z)) return [];
      return [
        Object.freeze({
          incidentId: factId,
          vehicleId: entry.taxiId,
          kind: 'COLLISION_DAMAGE' as const,
          positionM: Object.freeze({ x: position.x, z: position.z }),
          tick: entry.tick,
          label: entry.taxiId,
        }),
      ];
    })
    .sort((left, right) =>
      left.incidentId < right.incidentId ? -1 : left.incidentId > right.incidentId ? 1 : 0,
    );
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    version: '281-minimap-incidents-v1' as const,
    sessionId: frame.sessionId,
    worldEpoch: frame.worldEpoch,
    tick: frame.tick,
    health: 'AVAILABLE' as const,
    incidents: Object.freeze(incidents),
  });
}

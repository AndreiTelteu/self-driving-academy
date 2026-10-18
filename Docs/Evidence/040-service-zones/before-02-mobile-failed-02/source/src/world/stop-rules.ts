import {
  createStableId,
  fields,
  text,
  record,
  MAX_IDENTITY_PART_LENGTH,
  number,
  tick as readTick,
  choice,
  nullable,
  boolean,
} from '../sessions';
import { parseSimulationEvent, FIXED_TICK_HZ, type SimulationEvent } from '../simulation';
import type { Vector3 } from '../vehicles';
import { parseRoadMap } from './parser';
import { createLaneGraph } from './lane-graph';
import type { RoadAccess } from './schema';

export interface StopObservation {
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
  readonly vehicleId: string;
  readonly incarnation: string;
  readonly laneId: string | null;
  readonly access: RoadAccess;
  /** Authoritative front bumper datum, not a visual mesh or vehicle centre. */
  readonly frontPositionM: Vector3;
  readonly headingRad: number;
  readonly speedMps: number;
  readonly discontinuity: boolean;
}
export interface StopRuleOptions {
  readonly approachDistanceM?: number;
  readonly stopZoneDepthM?: number;
  readonly fullStopSpeedMps?: number;
  readonly dwellS?: number;
  readonly stationaryTravelToleranceM?: number;
  readonly heightToleranceM?: number;
  readonly rearmDistanceM?: number;
  readonly maxVehicles?: number;
  readonly maxIncarnations?: number;
}
export interface StopZone {
  readonly stopLineId: string;
  readonly laneId: string;
  readonly points: readonly [Vector3, Vector3];
  readonly normal: Readonly<{ x: number; z: number }>;
  readonly approachDistanceM: number;
  readonly stopZoneDepthM: number;
}
interface Opportunity {
  zone: StopZone;
  id: string;
  stillTicks: number;
  travelM: number;
  full: boolean;
  crossed: boolean;
  startedTick: number;
}
interface VehicleHistory {
  incarnation: string;
  tick: number;
  fingerprint: string;
  position: Vector3;
  opportunity: Opportunity | null;
}
const EMPTY: readonly SimulationEvent[] = Object.freeze([]);
const EPSILON = 1e-9;
const compareId = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
function identityPart(value: unknown): string {
  const id = text(value);
  if (id.length > MAX_IDENTITY_PART_LENGTH) throw new Error('STOP identity part exceeds capacity');
  return id;
}
function point(value: unknown): Vector3 {
  const p = fields(value, ['x', 'y', 'z']);
  return Object.freeze({
    x: number(p.x, -1e6, 1e6),
    y: number(p.y, -1e6, 1e6),
    z: number(p.z, -1e6, 1e6),
  });
}
function distance(zone: StopZone, p: Vector3): number {
  return (zone.points[0].x - p.x) * zone.normal.x + (zone.points[0].z - p.z) * zone.normal.z;
}
function onSpan(zone: StopZone, p: Vector3, height: number): boolean {
  const [a, b] = zone.points,
    dx = b.x - a.x,
    dz = b.z - a.z;
  const u = ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz);
  return (
    u >= -EPSILON && u <= 1 + EPSILON && Math.abs(p.y - a.y - u * (b.y - a.y)) <= height + EPSILON
  );
}
function crossed(zone: StopZone, from: Vector3, to: Vector3, height: number): boolean {
  const before = distance(zone, from),
    after = distance(zone, to);
  if (before < -EPSILON || after >= -EPSILON || before <= after) return false;
  const fraction = Math.max(0, before) / (before - after);
  return onSpan(
    zone,
    {
      x: from.x + (to.x - from.x) * fraction,
      y: from.y + (to.y - from.y) * fraction,
      z: from.z + (to.z - from.z) * fraction,
    },
    height,
  );
}

/** Tick-addressed evidence producer; caller owns bus publication, physics and actual world resets. */
export function createStopRules(
  input: unknown,
  context: { readonly sessionId: string; readonly worldEpoch: number },
  options: StopRuleOptions = {},
) {
  const settings = record(options);
  if (
    Object.keys(settings).some(
      (key) =>
        ![
          'approachDistanceM',
          'stopZoneDepthM',
          'fullStopSpeedMps',
          'dwellS',
          'stationaryTravelToleranceM',
          'heightToleranceM',
          'rearmDistanceM',
          'maxVehicles',
          'maxIncarnations',
        ].includes(key),
    )
  )
    throw new Error('Unknown STOP option');
  const identity = fields(context, ['sessionId', 'worldEpoch']);
  const sessionId = identityPart(identity.sessionId);
  let worldEpoch = readTick(identity.worldEpoch),
    watermark = 0,
    disposed = false;
  const approachDistanceM = number(settings.approachDistanceM ?? 20, 0.01, 100);
  const stopZoneDepthM = number(settings.stopZoneDepthM ?? 3, 0.01, approachDistanceM);
  const fullStopSpeedMps = number(settings.fullStopSpeedMps ?? 0.01, 0, 0.1);
  const dwellTicks = Math.max(1, Math.ceil(number(settings.dwellS ?? 1, 0, 4) * FIXED_TICK_HZ));
  const travelTolerance = number(settings.stationaryTravelToleranceM ?? 0.01, 0, 0.1);
  const heightTolerance = number(settings.heightToleranceM ?? 1, 0, 10);
  const rearmDistanceM = number(settings.rearmDistanceM ?? 2, 0.01, 100);
  const maxVehicles = readTick(settings.maxVehicles ?? 128),
    maxIncarnations = readTick(settings.maxIncarnations ?? 4096);
  if (maxVehicles < 1 || maxIncarnations < maxVehicles || maxIncarnations > 100000)
    throw new Error('Invalid STOP history capacity');
  const map = parseRoadMap(input),
    graph = createLaneGraph(map);
  const mapId = map.mapId;
  const nodes = new Map(map.geometry.nodes.map((node) => [node.id, node.positionM]));
  const paths = new Map(map.geometry.paths.map((path) => [path.id, path.nodeIds]));
  const byLane = new Map<string, StopZone[]>();
  const zones: StopZone[] = [];
  for (const line of map.stopLines) {
    if (line.kind !== 'STOP') continue;
    const ids = paths.get(line.geometryId)!;
    const a = nodes.get(ids[0])!,
      b = nodes.get(ids[1])!;
    const dx = b.x - a.x,
      dz = b.z - a.z,
      length = Math.hypot(dx, dz);
    const lane = graph.getLane(line.laneId)!;
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
    const projection = graph.projectOnLane(line.laneId, {
      positionM: middle,
      access: lane.access[0],
      maxHeightDifferenceM: heightTolerance,
    });
    if (length <= EPSILON || projection === null || projection.headingRad === null)
      throw new Error('STOP line requires transverse local lane geometry');
    let nx = -dz / length,
      nz = dx / length;
    const alignment = nx * Math.cos(projection.headingRad) + nz * Math.sin(projection.headingRad);
    if (Math.abs(alignment) < 0.5) throw new Error('STOP line is not transverse to directed lane');
    if (alignment < 0) {
      nx = -nx;
      nz = -nz;
    }
    const zone: StopZone = Object.freeze({
      stopLineId: line.id,
      laneId: line.laneId,
      points: Object.freeze([a, b] as const),
      normal: Object.freeze({ x: nx, z: nz }),
      approachDistanceM,
      stopZoneDepthM,
    });
    zones.push(zone);
    const laneZones = byLane.get(line.laneId) ?? [];
    laneZones.push(zone);
    byLane.set(line.laneId, laneZones);
  }
  zones.sort((a, b) => compareId(a.stopLineId, b.stopLineId));
  const frozenZones = Object.freeze(zones);
  const histories = new Map<string, VehicleHistory>(),
    incarnations = new Set<string>();
  const live = () => {
    if (disposed) throw new Error('STOP rules disposed');
  };
  const incarnationKey = (vehicle: string, incarnation: string) =>
    JSON.stringify([vehicle, incarnation]);
  return {
    getZones: () => frozenZones,
    observe(value: StopObservation): readonly SimulationEvent[] {
      live();
      const raw = fields(value, [
        'sessionId',
        'worldEpoch',
        'tick',
        'vehicleId',
        'incarnation',
        'laneId',
        'access',
        'frontPositionM',
        'headingRad',
        'speedMps',
        'discontinuity',
      ]);
      if (identityPart(raw.sessionId) !== sessionId || readTick(raw.worldEpoch) !== worldEpoch)
        throw new Error('STOP observation belongs to another world');
      const tick = readTick(raw.tick),
        vehicleId = identityPart(raw.vehicleId),
        incarnation = identityPart(raw.incarnation);
      const laneId = nullable(raw.laneId, identityPart),
        access = choice(raw.access, ['TAXI', 'CIVIL']);
      const position = point(raw.frontPositionM),
        headingRad = number(raw.headingRad, -1e6, 1e6),
        speed = number(raw.speedMps, 0, 1000),
        discontinuity = boolean(raw.discontinuity);
      const fingerprint = JSON.stringify([
        tick,
        incarnation,
        laneId,
        access,
        position,
        headingRad,
        speed,
        discontinuity,
      ]);
      const previous = histories.get(vehicleId),
        key = incarnationKey(vehicleId, incarnation);
      if (tick < watermark || (previous && tick < previous.tick))
        throw new Error('Stale STOP observation tick');
      if (previous?.tick === tick && previous.incarnation === incarnation) {
        if (previous.fingerprint !== fingerprint)
          throw new Error('Conflicting STOP observation in same tick');
        return EMPTY;
      }
      const newIncarnation = previous?.incarnation !== incarnation;
      if (newIncarnation && incarnations.has(key))
        throw new Error('Retired STOP vehicle incarnation');
      if (
        (!previous && histories.size >= maxVehicles) ||
        (newIncarnation && incarnations.size >= maxIncarnations)
      )
        throw new Error('STOP history capacity exceeded');
      const continuous =
        !!previous && !newIncarnation && !discontinuity && tick === previous.tick + 1;
      let opportunity: Opportunity | null =
        continuous && previous.opportunity ? { ...previous.opportunity } : null;
      const events: SimulationEvent[] = [];
      const emit = (
        type: 'STOP_APPROACH' | 'FULL_STOP' | 'STOP_LINE_CROSSED',
        active: Opportunity,
      ) => {
        events.push(
          parseSimulationEvent({
            schemaVersion: 1,
            units: 'SI',
            sessionId,
            worldEpoch,
            tick,
            entityIds: [vehicleId],
            eventId: createStableId(type, sessionId, [
              String(worldEpoch),
              vehicleId,
              incarnation,
              active.zone.stopLineId,
              String(active.startedTick),
            ]),
            type,
            payload:
              type === 'FULL_STOP'
                ? {
                    vehicleId,
                    opportunityId: active.id,
                    durationS: active.stillTicks / FIXED_TICK_HZ,
                  }
                : { vehicleId, opportunityId: active.id, stopLineId: active.zone.stopLineId },
          }),
        );
      };
      if (
        opportunity &&
        !opportunity.crossed &&
        crossed(opportunity.zone, previous!.position, position, heightTolerance)
      ) {
        opportunity.crossed = true;
        emit('STOP_LINE_CROSSED', opportunity);
      }
      const projection =
        laneId === null
          ? null
          : graph.projectOnLane(laneId, {
              positionM: position,
              access,
              headingRad,
              maxHeightDifferenceM: heightTolerance,
            });
      const candidates = projection
        ? (byLane.get(laneId!) ?? [])
            .filter((zone) => {
              const d = distance(zone, position);
              return (
                d >= -EPSILON && d <= approachDistanceM && onSpan(zone, position, heightTolerance)
              );
            })
            .sort(
              (a, b) =>
                distance(a, position) - distance(b, position) ||
                compareId(a.stopLineId, b.stopLineId),
            )
        : [];
      const nearest = candidates[0];
      if (
        opportunity &&
        (!projection ||
          opportunity.zone.laneId !== laneId ||
          distance(opportunity.zone, position) > approachDistanceM + rearmDistanceM ||
          distance(opportunity.zone, position) < -rearmDistanceM)
      )
        opportunity = null;
      if (nearest && (!opportunity || nearest.stopLineId !== opportunity.zone.stopLineId)) {
        opportunity = {
          zone: nearest,
          id: createStableId('stop-opportunity', sessionId, [
            String(worldEpoch),
            vehicleId,
            incarnation,
            nearest.stopLineId,
            String(tick),
          ]),
          stillTicks: -1,
          travelM: 0,
          full: false,
          crossed: false,
          startedTick: tick,
        };
        emit('STOP_APPROACH', opportunity);
      }
      if (opportunity) {
        const eligible =
          !opportunity.crossed &&
          projection !== null &&
          opportunity.zone === nearest &&
          speed <= fullStopSpeedMps &&
          distance(opportunity.zone, position) <= stopZoneDepthM;
        if (eligible) {
          const travel =
            opportunity.stillTicks >= 0 && continuous
              ? opportunity.travelM +
                Math.hypot(
                  position.x - previous!.position.x,
                  position.y - previous!.position.y,
                  position.z - previous!.position.z,
                )
              : 0;
          opportunity.stillTicks =
            opportunity.stillTicks >= 0 && travel <= travelTolerance + EPSILON
              ? opportunity.stillTicks + 1
              : 0;
          opportunity.travelM = travel <= travelTolerance + EPSILON ? travel : 0;
          if (!opportunity.full && opportunity.stillTicks >= dwellTicks) {
            opportunity.full = true;
            emit('FULL_STOP', opportunity);
          }
        } else {
          opportunity.stillTicks = -1;
          opportunity.travelM = 0;
        }
      }
      histories.set(vehicleId, { incarnation, tick, fingerprint, position, opportunity });
      if (newIncarnation) incarnations.add(key);
      watermark = tick;
      return Object.freeze(events);
    },
    forgetVehicle(vehicleId: string): void {
      live();
      histories.delete(identityPart(vehicleId));
    },
    advanceWorldEpoch(next: number): void {
      live();
      const epoch = readTick(next);
      if (epoch <= worldEpoch) throw new Error('STOP epoch must advance');
      worldEpoch = epoch;
      watermark = 0;
      histories.clear();
      incarnations.clear();
    },
    getStats: () =>
      Object.freeze({
        mapId,
        worldEpoch,
        zones: frozenZones.length,
        vehicles: histories.size,
        trackedIncarnations: incarnations.size,
        activeOpportunities: [...histories.values()].filter((entry) => entry.opportunity !== null)
          .length,
        maxVehicles,
        maxIncarnations,
        disposed,
      }),
    dispose(): void {
      if (disposed) return;
      disposed = true;
      histories.clear();
      incarnations.clear();
    },
  };
}

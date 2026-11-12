import { createEventBus } from '../../src/simulation';
import type { EventBus } from '../../src/simulation';
import {
  DESTRUCTIBLE_BROKEN_EVENT,
  DESTRUCTIBLE_LIMITS,
  createCityLayout,
  createDestructibleDecor,
  createDestructiblePlayground,
  createNeighbourhoodMap,
  verifyDestructiblePlayground,
} from '../../src/world';
import type {
  CityLayout,
  CityPlanarElement,
  DestructibleDecor,
  DestructibleDefinition,
  DestructiblePlayground,
  PlaygroundReport,
} from '../../src/world';
import type { ContractContext } from '../../src/sessions';

export const DESTRUCTIBLE_SESSION_ID = 'session-227-destructible';
export const DESTRUCTIBLE_WORLD_EPOCH = 2;
export const DESTRUCTIBLE_CONTEXT: ContractContext = Object.freeze({
  schemaVersion: 1,
  units: 'SI',
  sessionId: DESTRUCTIBLE_SESSION_ID,
  worldEpoch: DESTRUCTIBLE_WORLD_EPOCH,
});

let cached: { layout: CityLayout; plan: DestructiblePlayground; report: PlaygroundReport } | null =
  null;

/** The real neighbourhood map and layout; never a hand-authored stand-in for the city. */
export function destructibleWorld() {
  if (cached) return cached;
  const layout = createCityLayout(createNeighbourhoodMap());
  const plan = createDestructiblePlayground(layout);
  cached = { layout, plan, report: verifyDestructiblePlayground(plan, layout) };
  return cached;
}

export function createHarness(options: { readonly preset?: 'LOW' | 'MEDIUM' | 'HIGH' } = {}) {
  const { layout, plan, report } = destructibleWorld();
  const bus: EventBus = createEventBus({
    sessionId: DESTRUCTIBLE_SESSION_ID,
    worldEpoch: DESTRUCTIBLE_WORLD_EPOCH,
  });
  const decor = createDestructibleDecor({
    context: DESTRUCTIBLE_CONTEXT,
    eventBus: bus,
    layout,
    plan,
    presentationPreset: options.preset,
  });
  return { layout, plan, report, bus, decor };
}

export function definitionOf(
  plan: DestructiblePlayground,
  archetype: string,
): DestructibleDefinition {
  const definition = plan.definitions.find((candidate) => candidate.archetype === archetype);
  if (!definition) throw new Error(`No ${archetype} definition in the playground`);
  return definition;
}

/** First definition of an archetype with no neighbour inside the chain radius. */
export function isolatedDefinition(
  plan: DestructiblePlayground,
  archetype: string,
): DestructibleDefinition {
  const definition = plan.definitions.find(
    (candidate) =>
      candidate.archetype === archetype &&
      plan.definitions.every(
        (other) =>
          other.objectId === candidate.objectId ||
          Math.hypot(
            other.initialTransform.positionM.x - candidate.initialTransform.positionM.x,
            other.initialTransform.positionM.z - candidate.initialTransform.positionM.z,
          ) > DESTRUCTIBLE_LIMITS.chainRadiusM,
      ),
  );
  if (!definition) throw new Error(`No isolated ${archetype} definition in the playground`);
  return definition;
}

/** Narrowed DESTRUCTIBLE_BROKEN payload, so the union event type cannot hide the instigator. */
export function brokenPayload(event: { readonly type: string; readonly payload: unknown } | null) {
  if (event === null || event.type !== DESTRUCTIBLE_BROKEN_EVENT) return null;
  return event.payload as Readonly<{
    objectId: string;
    instigatorId: string | null;
    impulseNs: number;
  }>;
}

export function pointInPolygon(
  p: { readonly x: number; readonly z: number },
  polygon: readonly { readonly x: number; readonly z: number }[],
): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index]!;
    const b = polygon[previous]!;
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x)
      inside = !inside;
  }
  return inside;
}

export function drivableSurfaceAt(
  layout: CityLayout,
  position: { readonly x: number; readonly z: number },
): CityPlanarElement | null {
  for (const element of layout.elements) {
    if (element.kind !== 'LANE_SURFACE' && element.kind !== 'INTERSECTION_SURFACE') continue;
    if (
      pointInPolygon(
        position,
        element.footprintM as readonly { readonly x: number; readonly z: number }[],
      )
    )
      return element;
  }
  return null;
}

interface Vec {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
/** Nearest point on a lane centreline, used to aim a controlled push at the road. */
export function nearestLaneTarget(
  layout: CityLayout,
  from: Vec,
): { positionM: Vec; laneId: string } {
  let best: { positionM: Vec; laneId: string; distance: number } | null = null;
  for (const element of layout.elements) {
    if (element.kind !== 'LANE_SURFACE' || element.laneId === null) continue;
    const footprint = element.footprintM;
    const half = footprint.length / 2;
    const centre: Vec[] = [];
    for (let index = 0; index < half; index += 1) {
      const left = footprint[index]!;
      const right = footprint[footprint.length - 1 - index]!;
      centre.push({ x: (left.x + right.x) / 2, y: 0, z: (left.z + right.z) / 2 });
    }
    for (let index = 1; index < centre.length; index += 1) {
      const a = centre[index - 1]!;
      const b = centre[index]!;
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2));
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        const positionM = { x: a.x + (b.x - a.x) * t, y: 0, z: a.z + (b.z - a.z) * t };
        const distance = Math.hypot(positionM.x - from.x, positionM.z - from.z);
        if (!best || distance < best.distance)
          best = { positionM, laneId: element.laneId, distance };
      }
    }
  }
  if (!best) throw new Error('No lane in the layout');
  return { positionM: best.positionM, laneId: best.laneId };
}

/** Builds a plan variant that keeps the real zones but replaces or extends the definitions. */
export function planWith(
  plan: DestructiblePlayground,
  definitions: readonly DestructibleDefinition[],
): DestructiblePlayground {
  return { ...plan, definitions: Object.freeze([...definitions]) };
}

export function decorOf(plan: DestructiblePlayground, preset?: 'LOW' | 'MEDIUM' | 'HIGH') {
  const { layout } = destructibleWorld();
  const bus = createEventBus({
    sessionId: DESTRUCTIBLE_SESSION_ID,
    worldEpoch: DESTRUCTIBLE_WORLD_EPOCH,
  });
  const decor: DestructibleDecor = createDestructibleDecor({
    context: DESTRUCTIBLE_CONTEXT,
    eventBus: bus,
    layout,
    plan,
    presentationPreset: preset,
  });
  return { decor, bus, layout };
}

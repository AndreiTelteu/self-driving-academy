/**
 * PBI 192 — the walk world the character collides with.
 *
 * A walk world is plain data derived from contracts that already exist: walkable slabs with a real
 * top height, solid blockers with a bottom and a top, and a fallback ground height. The character is
 * a cylinder, so all collision is planar; verticality is a surface height plus a step policy.
 *
 * `createCityWalkWorld` reads the real PBI 042 layout: walkable surfaces are the authored slabs
 * (lane, intersection, crosswalk, service zone, sidewalk), the block interior is the same slab as
 * its sidewalks, and the buildings are solids with their real footprint and height. Nothing here
 * creates or owns a physics body.
 */
import { CharacterContractError } from './errors';
import { CITY_LAYOUT_DEFAULTS, type CityLayout } from '../world';
import {
  createRectanglePolygon,
  createWalkPolygon,
  walkPolygonContains,
  type WalkBounds2,
  type WalkPoint2,
  type WalkPolygon,
} from './walk-geometry';

export const WALK_SURFACE_KINDS = Object.freeze([
  'STREET',
  'SIDEWALK',
  'COURT',
  'CROSSWALK',
  'PLATFORM',
] as const);
export type WalkSurfaceKind = (typeof WALK_SURFACE_KINDS)[number];

export const WALK_BLOCKER_KINDS = Object.freeze(['BUILDING', 'OBSTACLE'] as const);
export type WalkBlockerKind = (typeof WALK_BLOCKER_KINDS)[number];

export interface WalkSurface {
  readonly id: string;
  readonly kind: WalkSurfaceKind;
  /** Top of the slab above the ground plane, in metres. */
  readonly topM: number;
  readonly polygon: WalkPolygon;
}

export interface WalkBlocker {
  readonly id: string;
  readonly kind: WalkBlockerKind;
  readonly bottomM: number;
  readonly topM: number;
  /** Clearance the walker keeps in front of this solid, in metres. */
  readonly marginM: number;
  readonly polygon: WalkPolygon;
}

export interface WalkWorldStats {
  readonly surfaces: number;
  readonly blockers: number;
  readonly buildings: number;
  readonly obstacles: number;
}

export interface WalkWorld {
  readonly surfaces: readonly WalkSurface[];
  readonly blockers: readonly WalkBlocker[];
  readonly defaultGroundM: number;
  readonly stats: WalkWorldStats;
  /** Highest walkable slab under the point; the default ground when no slab covers it. */
  surfaceAt(x: number, z: number): number;
  surfaceElementAt(x: number, z: number): WalkSurface | null;
  /** Solids whose footprint contains the point, regardless of the vertical span. */
  blockingAt(x: number, z: number): readonly WalkBlocker[];
}

export interface WalkSurfaceInput {
  readonly id: string;
  readonly kind: WalkSurfaceKind;
  readonly topM: number;
  readonly vertices: readonly WalkPoint2[];
}

export interface WalkBlockerInput {
  readonly id: string;
  readonly kind: WalkBlockerKind;
  readonly bottomM: number;
  readonly topM: number;
  readonly marginM?: number;
  readonly vertices: readonly WalkPoint2[];
}

export interface WalkWorldInput {
  readonly surfaces: readonly WalkSurfaceInput[];
  readonly blockers?: readonly WalkBlockerInput[];
  /** Ground level used where no slab was authored; zero is the street plane. */
  readonly defaultGroundM?: number;
}

function requireHeight(value: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new CharacterContractError('INVALID_WALK_WORLD', `${label} must be a finite height`);
  return value;
}

function freezeSurface(surface: WalkSurface): WalkSurface {
  requireHeight(surface.topM, `surface ${surface.id} topM`);
  if (!WALK_SURFACE_KINDS.includes(surface.kind))
    throw new CharacterContractError('INVALID_WALK_WORLD', `unknown surface kind ${surface.kind}`);
  return Object.freeze({ ...surface, polygon: surface.polygon });
}

function freezeBlocker(blocker: WalkBlocker): WalkBlocker {
  requireHeight(blocker.bottomM, `blocker ${blocker.id} bottomM`);
  requireHeight(blocker.topM, `blocker ${blocker.id} topM`);
  requireHeight(blocker.marginM, `blocker ${blocker.id} marginM`);
  if (blocker.topM <= blocker.bottomM)
    throw new CharacterContractError(
      'INVALID_WALK_WORLD',
      `blocker ${blocker.id} has no vertical extent`,
    );
  if (blocker.marginM < 0)
    throw new CharacterContractError(
      'INVALID_WALK_WORLD',
      `blocker ${blocker.id} margin is negative`,
    );
  if (!WALK_BLOCKER_KINDS.includes(blocker.kind))
    throw new CharacterContractError('INVALID_WALK_WORLD', `unknown blocker kind ${blocker.kind}`);
  return Object.freeze({ ...blocker, polygon: blocker.polygon });
}

function countKinds(
  blockers: readonly WalkBlocker[],
): Pick<WalkWorldStats, 'buildings' | 'obstacles'> {
  let buildings = 0;
  let obstacles = 0;
  for (const blocker of blockers) {
    if (blocker.kind === 'BUILDING') buildings += 1;
    else obstacles += 1;
  }
  return { buildings, obstacles };
}

function indexSurfaceIds(surfaces: readonly WalkSurface[]): void {
  const seen = new Set<string>();
  for (const surface of surfaces) {
    if (seen.has(surface.id))
      throw new CharacterContractError('INVALID_WALK_WORLD', `duplicate surface ${surface.id}`);
    seen.add(surface.id);
  }
}

function boundsOf(vertices: readonly WalkPoint2[]): WalkBounds2 {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const vertex of vertices) {
    minX = Math.min(minX, vertex.x);
    maxX = Math.max(maxX, vertex.x);
    minZ = Math.min(minZ, vertex.z);
    maxZ = Math.max(maxZ, vertex.z);
  }
  return { minX, maxX, minZ, maxZ };
}

/** Deterministic walk world from explicit data; validation is fail-closed on every field. */
export function createWalkWorld(input: WalkWorldInput): WalkWorld {
  if (!input || !Array.isArray(input.surfaces))
    throw new CharacterContractError('INVALID_WALK_WORLD', 'surfaces must be an array');
  const defaultGroundM = requireHeight(input.defaultGroundM ?? 0, 'defaultGroundM');
  const surfaces = Object.freeze(
    input.surfaces.map((surface) =>
      freezeSurface({
        id: surface.id,
        kind: surface.kind,
        topM: surface.topM,
        polygon: createWalkPolygon(surface.id, surface.vertices),
      }),
    ),
  );
  indexSurfaceIds(surfaces);
  const blockers = Object.freeze(
    (input.blockers ?? []).map((blocker) =>
      freezeBlocker({
        id: blocker.id,
        kind: blocker.kind,
        bottomM: blocker.bottomM,
        topM: blocker.topM,
        marginM: blocker.marginM ?? 0,
        polygon: createWalkPolygon(blocker.id, blocker.vertices),
      }),
    ),
  );
  const stats: WalkWorldStats = Object.freeze({
    surfaces: surfaces.length,
    blockers: blockers.length,
    ...countKinds(blockers),
  });
  const surfaceElementAt = (x: number, z: number): WalkSurface | null => {
    let best: WalkSurface | null = null;
    for (const surface of surfaces)
      if (walkPolygonContains(surface.polygon, x, z) && (best === null || surface.topM > best.topM))
        best = surface;
    return best;
  };
  return Object.freeze({
    surfaces,
    blockers,
    defaultGroundM,
    stats,
    surfaceAt(x: number, z: number): number {
      const surface = surfaceElementAt(x, z);
      return surface ? surface.topM : defaultGroundM;
    },
    surfaceElementAt,
    blockingAt(x: number, z: number): readonly WalkBlocker[] {
      return Object.freeze(
        blockers.filter((blocker) => walkPolygonContains(blocker.polygon, x, z)),
      );
    },
  });
}

/** Authored slabs a person can stand on. Marking paint and the curb lip are not separate steps. */
const WALKABLE_ELEMENT_KINDS = Object.freeze([
  'LANE_SURFACE',
  'INTERSECTION_SURFACE',
  'CROSSWALK',
  'SERVICE_ZONE',
  'SIDEWALK',
  'GROUND',
] as const);

/** Paint and stop lines are millimetres thick and are drawn on top of a slab, not walked on. */
const SURFACE_KIND_BY_ELEMENT = Object.freeze({
  LANE_SURFACE: 'STREET',
  INTERSECTION_SURFACE: 'STREET',
  CROSSWALK: 'CROSSWALK',
  SERVICE_ZONE: 'STREET',
  SIDEWALK: 'SIDEWALK',
  GROUND: 'STREET',
} as const satisfies Record<(typeof WALKABLE_ELEMENT_KINDS)[number], WalkSurfaceKind>);

function footprintVertices(
  footprint: readonly { readonly x: number; readonly y: number; readonly z: number }[],
): readonly WalkPoint2[] {
  return footprint.map((vertex) => ({ x: vertex.x, z: vertex.z }));
}

interface BlockBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  topM: number;
}

/**
 * The city layout draws the street surface at the lane elevation and the sidewalk at the real curb
 * height; the 0.2 m wide curb strip only adds a 2 cm lip on top of the sidewalk, so it is not a
 * second step. The block interior shares the sidewalk slab, exactly as the layout places buildings
 * at `sidewalkElevationM`.
 */
export function createCityWalkWorld(layout: CityLayout): WalkWorld {
  if (!layout || !Array.isArray(layout.elements))
    throw new CharacterContractError('INVALID_WALK_WORLD', 'city layout is required');
  const surfaces: WalkSurfaceInput[] = [];
  const blockers: WalkBlockerInput[] = [];
  const blockBounds = new Map<string, BlockBounds>();
  for (const element of layout.elements) {
    if (element.kind === 'SIGNAL_HEAD') continue;
    const topM = element.baseYM + element.heightM;
    if (element.kind === 'BUILDING') {
      blockers.push({
        id: element.id,
        kind: 'BUILDING',
        bottomM: element.baseYM,
        topM,
        marginM: 0,
        vertices: footprintVertices(element.footprintM),
      });
      continue;
    }
    if (!(WALKABLE_ELEMENT_KINDS as readonly string[]).includes(element.kind)) continue;
    const kind = SURFACE_KIND_BY_ELEMENT[element.kind as (typeof WALKABLE_ELEMENT_KINDS)[number]];
    surfaces.push({
      id: element.id,
      kind,
      topM,
      vertices: footprintVertices(element.footprintM),
    });
    if (element.kind !== 'SIDEWALK' || element.blockId === null) continue;
    const bounds = boundsOf(element.footprintM);
    const existing = blockBounds.get(element.blockId);
    blockBounds.set(element.blockId, {
      minX: Math.min(existing?.minX ?? bounds.minX, bounds.minX),
      maxX: Math.max(existing?.maxX ?? bounds.maxX, bounds.maxX),
      minZ: Math.min(existing?.minZ ?? bounds.minZ, bounds.minZ),
      maxZ: Math.max(existing?.maxZ ?? bounds.maxZ, bounds.maxZ),
      topM: Math.max(existing?.topM ?? topM, topM),
    });
  }
  // The block interior is the slab bounded by its own sidewalk strips: same height, one surface.
  for (const [blockId, bounds] of [...blockBounds.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const halfX = (bounds.maxX - bounds.minX) / 2;
    const halfZ = (bounds.maxZ - bounds.minZ) / 2;
    if (halfX <= 0 || halfZ <= 0) continue;
    const center = { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };
    surfaces.push({
      id: `court:${blockId}`,
      kind: 'COURT',
      topM: bounds.topM,
      vertices: createRectanglePolygon(`court:${blockId}`, center, { x: halfX, z: halfZ }).vertices,
    });
  }
  return createWalkWorld({
    surfaces,
    blockers,
    defaultGroundM: 0,
  });
}

/** Real curb height the walker is allowed to climb; it is the authored sidewalk elevation. */
export const WALK_CURB_HEIGHT_M = CITY_LAYOUT_DEFAULTS.sidewalkElevationM;

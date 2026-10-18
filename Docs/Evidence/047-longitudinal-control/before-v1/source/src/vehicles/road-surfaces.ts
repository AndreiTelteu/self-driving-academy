/** Empirical raycast tyre calibration, not a measured coefficient of friction µ. */
export const ROAD_SURFACE_VERSION = '026-flat-surfaces-v1' as const;
export type RoadSurfaceId = 'dry-asphalt' | 'reduced-adhesion';
export interface RoadSurface {
  readonly id: RoadSurfaceId;
  readonly version: typeof ROAD_SURFACE_VERSION;
  readonly groundFriction: number;
  readonly tireGripScale: number;
}
export const ROAD_SURFACES: Readonly<Record<RoadSurfaceId, RoadSurface>> = Object.freeze({
  'dry-asphalt': Object.freeze({
    id: 'dry-asphalt',
    version: ROAD_SURFACE_VERSION,
    groundFriction: 0.8,
    tireGripScale: 1,
  }),
  'reduced-adhesion': Object.freeze({
    id: 'reduced-adhesion',
    version: ROAD_SURFACE_VERSION,
    groundFriction: 0.35,
    tireGripScale: 0.35,
  }),
});
export function roadSurface(id: RoadSurfaceId, version = ROAD_SURFACE_VERSION): RoadSurface {
  if (version !== ROAD_SURFACE_VERSION || !Object.hasOwn(ROAD_SURFACES, id))
    throw new RangeError('Unknown road surface/version');
  return ROAD_SURFACES[id];
}

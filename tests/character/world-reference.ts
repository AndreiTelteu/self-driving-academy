/**
 * PBI 191 — the real-world references the character asset is admitted against.
 *
 * Every number is read from the delivered contracts, never typed as a constant: the sidewalk and
 * curb from the PBI 042 city layout defaults, the lane width from the real neighbourhood map
 * layout, and the door/cabin references from the PBI 023 mechanical class plus the PBI 145 sedan
 * geometry. The tests and the evidence report share this single derivation.
 */
import type { CharacterWorldReference } from '../../src/character';
import { buildVehicleGeometry, vehicleGeometrySpec, vehicleVisualClass } from '../../src/rendering';
import { VEHICLE_CLASSES, VEHICLE_CLASS_VERSION } from '../../src/vehicles';
import { CITY_LAYOUT_DEFAULTS, createCityLayout, createNeighbourhoodMap } from '../../src/world';

export interface RealWorldReference extends CharacterWorldReference {
  readonly derivation: Readonly<{
    readonly mapId: string;
    readonly laneCount: number;
    readonly laneWidthsM: readonly number[];
    readonly vehicleClassVersion: string;
    readonly wheelBottomM: number;
    readonly roofTopM: number;
    readonly bodySillM: number;
    readonly geometryGpuBytes: number;
  }>;
}

/** The sedan is the lower roof of the two delivered classes, so it is the binding reference. */
export function realWorldReference(): RealWorldReference {
  const layout = createCityLayout(createNeighbourhoodMap());
  const laneWidths = Object.freeze([...new Set(layout.lanes.map((lane) => lane.widthM))].sort());
  if (laneWidths.length !== 1)
    throw new Error(`Expected one authored lane width, found ${laneWidths.join(', ')}`);
  const laneWidthM = laneWidths[0]!;
  const mechanical = VEHICLE_CLASSES.sedan;
  const visual = vehicleVisualClass('sedan');
  const spec = vehicleGeometrySpec('sedan');
  const geometry = buildVehicleGeometry('sedan', 'NEAR');
  const wheelBottomM = visual.wheelBottomM;
  let roofTopM = Number.NEGATIVE_INFINITY;
  let bodySillM = Number.POSITIVE_INFINITY;
  for (const part of spec.parts) {
    roofTopM = Math.max(roofTopM, part.center[1] + part.size[1] / 2);
    bodySillM = Math.min(bodySillM, part.center[1] - part.size[1] / 2);
  }
  const sideWindows = spec.parts.filter(
    (part) => Math.abs(part.center[0]) > 0.6 && part.size[0] < 0.08,
  );
  if (sideWindows.length === 0) throw new Error('Sedan geometry has no side windows');
  const cabinInnerFaceM = Math.min(
    ...sideWindows.map((part) => Math.abs(part.center[0]) - part.size[0] / 2),
  );
  const cabinWidthM = cabinInnerFaceM * 2;
  if (!Number.isFinite(wheelBottomM) || !Number.isFinite(roofTopM))
    throw new Error('Vehicle geometry has no finite vertical extent');
  return Object.freeze({
    source: `PBI 042 city layout defaults + rețeaua reală de ${layout.lanes.length} benzi din harta neighbourhood, PBI 023 ${mechanical.classId} mechanics ${VEHICLE_CLASS_VERSION}, PBI 145 sedan NEAR geometry`,
    sidewalkWidthM: CITY_LAYOUT_DEFAULTS.sidewalkWidthM,
    curbHeightM: CITY_LAYOUT_DEFAULTS.sidewalkElevationM,
    laneWidthM,
    vehicle: Object.freeze({
      classId: mechanical.classId,
      doorClearanceM: roofTopM - wheelBottomM,
      cabinWidthM,
      sillHeightM: bodySillM - wheelBottomM,
    }),
    derivation: Object.freeze({
      mapId: 'neighbourhood-compact-v1',
      laneCount: layout.lanes.length,
      laneWidthsM: laneWidths,
      vehicleClassVersion: VEHICLE_CLASS_VERSION,
      wheelBottomM,
      roofTopM,
      bodySillM,
      geometryGpuBytes: geometry.gpuBytes,
    }),
  });
}

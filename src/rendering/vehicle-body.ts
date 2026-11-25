/**
 * PBI 247 — pure deterministic plan for the detailed vehicle bodies.
 *
 * The body is authored in the same PBI 023 chassis frame as PBI 145: metres, +Z forward, +X
 * right, origin at the rigid-body origin. Geometry is described as a small set of cross-sections
 * along Z (each a closed loop in the XY plane) joined into a smooth shell, plus separate convex
 * parts (bumpers, mirrors, roof sign, light lenses) with rounded corners. Wheel arches are opened
 * by clipping the shell against the four mechanical wheel volumes from the visual class. Nothing
 * here touches a scene, a clock or a random source; the same class/LOD always yields the same
 * vertex data.
 */
import type { VehicleClassKey, VehicleLod, VehicleMaterialGroup } from './vehicle-geometry';
import { vehicleVisualClass } from './vehicle-visuals';

/** Linear RGB vertex colour. */
export type BodyColour = readonly [number, number, number];

/** One closed loop of the body shell, at a station Z (metres). */
export interface BodySection {
  readonly z: number;
  /** Half-width of the body at this station (metres). */
  readonly halfWidth: number;
  /** Height of the beltline (glass base) at this station. */
  readonly beltY: number;
  /** Height of the roof crown at this station. */
  readonly roofY: number;
  /** Vertical centre of the lower body (rocker) at this station. */
  readonly rockerY: number;
}

/** A convex body panel with rounded corners, emitted as a bevelled box. */
export interface BodyPanel {
  readonly group: Exclude<VehicleMaterialGroup, 'WHEEL'>;
  readonly center: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  /** Corner radius (metres) applied to all eight corners; 0 keeps the sharp PBI 145 box. */
  readonly radius: number;
  readonly colour: BodyColour;
  /** Optional tilt around +X (radians) for raked glass; 0 keeps the panel upright. */
  readonly tiltRad?: number;
}

export interface VehicleBodyPlan {
  readonly classId: VehicleClassKey;
  readonly lod: VehicleLod;
  /** Base paint before the per-instance taxi/civilian multiplier. */
  readonly paint: BodyColour;
  readonly sections: readonly BodySection[];
  readonly panels: readonly BodyPanel[];
  /**
   * Side glass bands, emitted as part of the shell (GLASS group): for each band a quad strip
   * runs on both flanks from z0 to z1, between y0 (beltline) and y1 (roof), hugging the shell.
   */
  readonly glassBands: readonly GlassBand[];
  /** Wheel arch clearances, derived from the mechanical pivots (never from the render). */
  readonly wheelArches: readonly {
    readonly x: number;
    readonly z: number;
    readonly radiusM: number;
  }[];
}

/** A side-glass band in the XY/Z plan: a window strip shared by both flanks. */
export interface GlassBand {
  readonly z0: number;
  readonly z1: number;
  readonly y0: number;
  readonly y1: number;
}

const PAINT_TAXI: BodyColour = [0.92, 0.66, 0.05] as const;
const PAINT_CIVILIAN_PALETTE: readonly BodyColour[] = Object.freeze([
  [0.16, 0.24, 0.36] as const, // albastru închis
  [0.72, 0.36, 0.12] as const, // portocaliu ars
  [0.55, 0.07, 0.09] as const, // roșu cărămiziu
  [0.52, 0.56, 0.6] as const, // gri metalic mediu
  [0.24, 0.42, 0.28] as const, // verde pin
  [0.62, 0.58, 0.44] as const, // nisipiu
  [0.12, 0.14, 0.18] as const, // grafit
  [0.34, 0.42, 0.52] as const, // albastru oțel
]);
const GLASS: BodyColour = [0.05, 0.08, 0.1] as const;
const TRIM: BodyColour = [0.045, 0.045, 0.05] as const;
const WHITE: BodyColour = [1, 0.96, 0.86] as const;
const RED: BodyColour = [0.9, 0.06, 0.05] as const;
const AMBER: BodyColour = [1, 0.55, 0.05] as const;
const TAXI_SIGN: BodyColour = [0.98, 0.95, 0.85] as const;

/** Deterministic 32-bit FNV-1a over the entity id; the palette never depends on a PRNG. */
export function vehiclePaintHash(entityId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < entityId.length; index += 1) {
    hash ^= entityId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Civilian paint is deterministic per vehicle id; the taxi class always wears the project taxi
 * yellow. The multiplier is applied to the vertex colours of the BODY group at build time, so
 * the same shared PBR material renders every shade without a shader permutation.
 */
export function vehiclePaintMultiplier(
  classId: VehicleClassKey,
  entityId: string,
  driverKind: 'TAXI' | 'CIVILIAN',
): BodyColour {
  if (driverKind === 'TAXI') return PAINT_TAXI;
  const palette = PAINT_CIVILIAN_PALETTE;
  const colour = palette[vehiclePaintHash(entityId) % palette.length]!;
  // Sedan/compact keep a faint class tint over the civilian palette, so the two silhouettes stay
  // readable even before shape; the multiplier is relative to the class base paint.
  const base = classId === 'sedan' ? ([0.16, 0.24, 0.36] as const) : ([0.72, 0.36, 0.12] as const);
  return [
    Math.min(1, colour[0] * 0.85 + base[0] * 0.15),
    Math.min(1, colour[1] * 0.85 + base[1] * 0.15),
    Math.min(1, colour[2] * 0.85 + base[2] * 0.15),
  ];
}

/**
 * Cross-sections of the two classes, in the chassis frame. Sections run front bumper (+Z) to
 * rear bumper (-Z). Numbers are hand-authored to sit inside the PBI 023 collider
 * (half extents 0.85 × 0.30 × 2.0) plus a small presentation allowance for bumpers, mirrors and
 * the taxi sign, exactly like PBI 145 allowed presentation-only overhang.
 */
function sectionsFor(classId: VehicleClassKey, _lod: VehicleLod): readonly BodySection[] {
  if (classId === 'sedan') {
    return Object.freeze([
      { z: 2.18, halfWidth: 0.79, beltY: 0.42, roofY: 0.42, rockerY: 0.0 },
      { z: 1.95, halfWidth: 0.84, beltY: 0.52, roofY: 0.52, rockerY: 0.02 },
      { z: 1.35, halfWidth: 0.86, beltY: 0.6, roofY: 0.6, rockerY: 0.04 },
      { z: 0.92, halfWidth: 0.83, beltY: 0.66, roofY: 0.92, rockerY: 0.06 },
      { z: 0.35, halfWidth: 0.8, beltY: 0.68, roofY: 0.98, rockerY: 0.06 },
      { z: -0.35, halfWidth: 0.79, beltY: 0.68, roofY: 1.0, rockerY: 0.06 },
      { z: -0.95, halfWidth: 0.8, beltY: 0.66, roofY: 0.94, rockerY: 0.06 },
      { z: -1.45, halfWidth: 0.84, beltY: 0.6, roofY: 0.6, rockerY: 0.04 },
      { z: -1.95, halfWidth: 0.84, beltY: 0.52, roofY: 0.52, rockerY: 0.02 },
      { z: -2.18, halfWidth: 0.79, beltY: 0.42, roofY: 0.42, rockerY: 0.0 },
    ]);
  }
  return Object.freeze([
    { z: 1.98, halfWidth: 0.72, beltY: 0.4, roofY: 0.4, rockerY: 0.0 },
    { z: 1.78, halfWidth: 0.77, beltY: 0.5, roofY: 0.5, rockerY: 0.02 },
    { z: 1.2, halfWidth: 0.79, beltY: 0.56, roofY: 0.56, rockerY: 0.04 },
    { z: 0.72, halfWidth: 0.76, beltY: 0.62, roofY: 0.86, rockerY: 0.06 },
    { z: 0.2, halfWidth: 0.73, beltY: 0.64, roofY: 0.92, rockerY: 0.06 },
    { z: -0.4, halfWidth: 0.72, beltY: 0.64, roofY: 0.94, rockerY: 0.06 },
    { z: -0.88, halfWidth: 0.74, beltY: 0.62, roofY: 0.88, rockerY: 0.06 },
    { z: -1.32, halfWidth: 0.77, beltY: 0.56, roofY: 0.56, rockerY: 0.04 },
    { z: -1.78, halfWidth: 0.77, beltY: 0.5, roofY: 0.5, rockerY: 0.02 },
    { z: -1.98, halfWidth: 0.72, beltY: 0.4, roofY: 0.4, rockerY: 0.0 },
  ]);
}

const panel = (
  group: Exclude<VehicleMaterialGroup, 'WHEEL'>,
  center: readonly [number, number, number],
  size: readonly [number, number, number],
  radius: number,
  colour: BodyColour,
  tiltRad = 0,
): BodyPanel => ({ group, center, size, radius, colour, ...(tiltRad ? { tiltRad } : {}) });

function panelsFor(classId: VehicleClassKey, lod: VehicleLod): readonly BodyPanel[] {
  if (lod === 'FAR') return Object.freeze([]);
  const sedan = classId === 'sedan';
  const frontZ = sedan ? 2.2 : 2.0;
  const rearZ = sedan ? -2.2 : -2.0;
  const mirrorZ = sedan ? 0.86 : 0.62;
  const mirrorX = sedan ? 0.9 : 0.82;
  // Windshield sits on the hood→cabin slope (sections without/with cabin), not on the cabin.
  const shieldZ = sedan ? 1.14 : 0.96;
  const shieldY = sedan ? 0.76 : 0.71;
  const rearGlassZ = sedan ? -1.2 : -1.1;
  const rearGlassY = sedan ? 0.77 : 0.72;
  const rakeFront = sedan ? 0.55 : 0.5;
  const rakeRear = sedan ? -0.5 : -0.48;
  const panels: BodyPanel[] = [
    panel('BODY', [0, -0.05, frontZ], [1.72, 0.22, 0.2], 0.05, TRIM),
    panel('BODY', [0, -0.05, rearZ], [1.72, 0.22, 0.2], 0.05, TRIM),
    // Raked windshield and rear glass, positioned on the cabin slope of the shell.
    panel('GLASS', [0, shieldY, shieldZ], [sedan ? 1.5 : 1.36, 0.05, 0.5], 0.02, GLASS, rakeFront),
    panel(
      'GLASS',
      [0, rearGlassY, rearGlassZ],
      [sedan ? 1.44 : 1.3, 0.05, 0.5],
      0.02,
      GLASS,
      rakeRear,
    ),
    panel('HEADLIGHT', [-0.6, 0.14, frontZ - 0.01], [0.34, 0.14, 0.06], 0.02, WHITE),
    panel('HEADLIGHT', [0.6, 0.14, frontZ - 0.01], [0.34, 0.14, 0.06], 0.02, WHITE),
    panel('TAILLIGHT', [-0.62, 0.16, rearZ - 0.01], [0.3, 0.12, 0.05], 0.02, RED),
    panel('TAILLIGHT', [0.62, 0.16, rearZ - 0.01], [0.3, 0.12, 0.05], 0.02, RED),
    panel('BRAKE', [-0.62, 0.16, rearZ - 0.06], [0.26, 0.1, 0.04], 0.015, RED),
    panel('BRAKE', [0.62, 0.16, rearZ - 0.06], [0.26, 0.1, 0.04], 0.015, RED),
  ];
  if (lod === 'NEAR') {
    panels.push(
      panel('BODY', [-mirrorX, 0.44, mirrorZ], [0.18, 0.1, 0.12], 0.03, TRIM),
      panel('BODY', [mirrorX, 0.44, mirrorZ], [0.18, 0.1, 0.12], 0.03, TRIM),
      panel('SIGNAL_LEFT', [-0.82, 0.18, frontZ - 0.03], [0.12, 0.1, 0.05], 0.015, AMBER),
      panel('SIGNAL_LEFT', [-0.84, 0.16, rearZ - 0.01], [0.1, 0.1, 0.05], 0.015, AMBER),
      panel('SIGNAL_RIGHT', [0.82, 0.18, frontZ - 0.03], [0.12, 0.1, 0.05], 0.015, AMBER),
      panel('SIGNAL_RIGHT', [0.84, 0.16, rearZ - 0.01], [0.1, 0.1, 0.05], 0.015, AMBER),
    );
  }
  return Object.freeze(panels);
}

/** Side glass bands, derived from the same sections the shell uses, so they always hug the body. */
function glassBandsFor(classId: VehicleClassKey, lod: VehicleLod): readonly GlassBand[] {
  if (lod === 'FAR') return Object.freeze([]);
  const sections = sectionsFor(classId, lod);
  const bands: GlassBand[] = [];
  for (let index = 0; index < sections.length - 1; index += 1) {
    const a = sections[index]!;
    const b = sections[index + 1]!;
    // Only where the cabin exists: belt below roof.
    if (a.beltY >= a.roofY || b.beltY >= b.roofY) continue;
    bands.push({
      z0: a.z,
      z1: b.z,
      y0: Math.min(a.beltY, b.beltY) + 0.02,
      y1: Math.max(a.roofY, b.roofY) - 0.02,
    });
  }
  return Object.freeze(bands);
}

/** The taxi roof sign is a BODY-group panel so it rides the same instanced batch as the shell. */
export function taxiRoofSign(classId: VehicleClassKey): BodyPanel {
  return classId === 'sedan'
    ? panel('BODY', [0, 1.1, -0.15], [0.42, 0.18, 0.28], 0.04, TAXI_SIGN)
    : panel('BODY', [0, 1.04, -0.12], [0.38, 0.16, 0.24], 0.035, TAXI_SIGN);
}

/**
 * The full plan for one class/LOD. Wheel arches come from the mechanical pivots, so the visual
 * clearance and the physics wheel can never drift apart.
 */
export function vehicleBodyPlan(
  classId: VehicleClassKey,
  lod: VehicleLod,
  entityId: string,
  driverKind: 'TAXI' | 'CIVILIAN',
): VehicleBodyPlan {
  const visual = vehicleVisualClass(classId);
  const paint = vehiclePaintMultiplier(classId, entityId, driverKind);
  const panels = [...panelsFor(classId, lod)];
  if (driverKind === 'TAXI' && lod !== 'FAR') panels.push(taxiRoofSign(classId));
  return Object.freeze({
    classId,
    lod,
    paint,
    sections: sectionsFor(classId, lod),
    panels: Object.freeze(panels),
    glassBands: glassBandsFor(classId, lod),
    wheelArches: Object.freeze(
      visual.wheelPivots.map((pivot) =>
        Object.freeze({ x: pivot.x, z: pivot.z, radiusM: pivot.radiusM }),
      ),
    ),
  });
}

/**
 * PBI 191 — pure character skeleton contract: pivots, rest pose and anthropometry.
 *
 * The skeleton lives in the character-local frame: metres, +Y up, +Z forward, +X right, with the
 * origin on the ground contact plane between the feet. Every pivot is a joint, and the presentation
 * layer draws the box described by `boxOffsetM`/`sizeM`. Nothing here reads the city, the clock or
 * the entity's authoritative position; `scaleSkeleton` is the only operation that changes size.
 */
export interface CharacterPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const CHARACTER_SKELETON_VERSION = '191-character-skeleton-v1' as const;

export const CHARACTER_JOINT_IDS = Object.freeze([
  'pelvis',
  'spine',
  'chest',
  'neck',
  'head',
  'upper-arm-left',
  'forearm-left',
  'hand-left',
  'upper-arm-right',
  'forearm-right',
  'hand-right',
  'thigh-left',
  'shin-left',
  'foot-left',
  'thigh-right',
  'shin-right',
  'foot-right',
] as const);
export type CharacterJointId = (typeof CHARACTER_JOINT_IDS)[number];

export interface CharacterJointSpec {
  readonly joint: CharacterJointId;
  readonly parent: CharacterJointId | null;
  /** Rest translation from the parent pivot (or from the character origin for the pelvis). */
  readonly offsetM: CharacterPoint;
  /** Box centre relative to this pivot; the arithmetic anchor used by pivots, not a skin mesh. */
  readonly boxOffsetM: CharacterPoint;
  /** Box size for this body segment. */
  readonly sizeM: CharacterPoint;
}

export interface CharacterSkeleton {
  readonly version: typeof CHARACTER_SKELETON_VERSION;
  /** Uniform anthropometric multiplier applied to every authored rest offset and box. */
  readonly scale: number;
  readonly joints: readonly CharacterJointSpec[];
  /** Eye point below the head pivot; part of the declared scale. */
  readonly eyeOffsetFromHeadPivotM: number;
}

const point = (x: number, y: number, z: number): CharacterPoint => Object.freeze({ x, y, z });

function joint(
  id: CharacterJointId,
  parent: CharacterJointId | null,
  offsetM: CharacterPoint,
  boxOffsetM: CharacterPoint,
  sizeM: CharacterPoint,
): CharacterJointSpec {
  return Object.freeze({ joint: id, parent, offsetM, boxOffsetM, sizeM });
}

/** Authored adult proportions (1.78 m): hip at 0.935 m, hip-to-ankle reach 0.86 m. */
const BASE_JOINTS: readonly CharacterJointSpec[] = Object.freeze([
  joint('pelvis', null, point(0, 0.98, 0), point(0, 0.02, 0), point(0.34, 0.24, 0.22)),
  joint('spine', 'pelvis', point(0, 0.18, 0), point(0, 0.09, 0), point(0.3, 0.2, 0.2)),
  joint('chest', 'spine', point(0, 0.2, 0), point(0, 0.1, 0), point(0.4, 0.22, 0.24)),
  joint('neck', 'chest', point(0, 0.225, 0), point(0, 0.06, 0), point(0.12, 0.12, 0.12)),
  joint('head', 'neck', point(0, 0.09, 0), point(0, 0, 0), point(0.2, 0.21, 0.24)),
  joint(
    'upper-arm-left',
    'chest',
    point(-0.21, 0.08, 0),
    point(0, -0.135, 0),
    point(0.1, 0.27, 0.1),
  ),
  joint(
    'forearm-left',
    'upper-arm-left',
    point(0, -0.27, 0),
    point(0, -0.12, 0),
    point(0.08, 0.24, 0.08),
  ),
  joint(
    'hand-left',
    'forearm-left',
    point(0, -0.24, 0),
    point(0, -0.085, 0),
    point(0.08, 0.17, 0.06),
  ),
  joint(
    'upper-arm-right',
    'chest',
    point(0.21, 0.08, 0),
    point(0, -0.135, 0),
    point(0.1, 0.27, 0.1),
  ),
  joint(
    'forearm-right',
    'upper-arm-right',
    point(0, -0.27, 0),
    point(0, -0.12, 0),
    point(0.08, 0.24, 0.08),
  ),
  joint(
    'hand-right',
    'forearm-right',
    point(0, -0.24, 0),
    point(0, -0.085, 0),
    point(0.08, 0.17, 0.06),
  ),
  joint(
    'thigh-left',
    'pelvis',
    point(-0.1, -0.045, 0),
    point(0, -0.23, 0),
    point(0.14, 0.46, 0.14),
  ),
  joint('shin-left', 'thigh-left', point(0, -0.46, 0), point(0, -0.2, 0), point(0.11, 0.4, 0.11)),
  joint(
    'foot-left',
    'shin-left',
    point(0, -0.4, 0),
    point(0, -0.0375, 0.07),
    point(0.1, 0.075, 0.26),
  ),
  joint(
    'thigh-right',
    'pelvis',
    point(0.1, -0.045, 0),
    point(0, -0.23, 0),
    point(0.14, 0.46, 0.14),
  ),
  joint('shin-right', 'thigh-right', point(0, -0.46, 0), point(0, -0.2, 0), point(0.11, 0.4, 0.11)),
  joint(
    'foot-right',
    'shin-right',
    point(0, -0.4, 0),
    point(0, -0.0375, 0.07),
    point(0.1, 0.075, 0.26),
  ),
]);

const EYE_OFFSET_BASE_M = 0.03;

function scaled(value: number, scale: number): number {
  return value * scale;
}

/** Deterministic, immutable uniform scaling; no mesh, no scene and no entity identity involved. */
export function scaleSkeleton(scale: number): CharacterSkeleton {
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0)
    throw new RangeError('Invalid character skeleton scale');
  return Object.freeze({
    version: CHARACTER_SKELETON_VERSION,
    scale,
    joints: Object.freeze(
      BASE_JOINTS.map((entry) =>
        Object.freeze({
          joint: entry.joint,
          parent: entry.parent,
          offsetM: point(
            scaled(entry.offsetM.x, scale),
            scaled(entry.offsetM.y, scale),
            scaled(entry.offsetM.z, scale),
          ),
          boxOffsetM: point(
            scaled(entry.boxOffsetM.x, scale),
            scaled(entry.boxOffsetM.y, scale),
            scaled(entry.boxOffsetM.z, scale),
          ),
          sizeM: point(
            scaled(entry.sizeM.x, scale),
            scaled(entry.sizeM.y, scale),
            scaled(entry.sizeM.z, scale),
          ),
        }),
      ),
    ),
    eyeOffsetFromHeadPivotM: scaled(EYE_OFFSET_BASE_M, scale),
  });
}

export const DEFAULT_CHARACTER_SKELETON = scaleSkeleton(1);

export function characterJointSpec(
  skeleton: CharacterSkeleton,
  jointId: CharacterJointId,
): CharacterJointSpec {
  const spec = skeleton.joints.find((entry) => entry.joint === jointId);
  if (!spec) throw new RangeError(`Unknown character joint ${jointId}`);
  return spec;
}

/** Rest pivot in the character-local frame: zero rotations, pelvis offset included. */
export function characterRestPositionM(
  skeleton: CharacterSkeleton,
  jointId: CharacterJointId,
): CharacterPoint {
  let position = point(0, 0, 0);
  let current: CharacterJointId | null = jointId;
  const chain: CharacterJointSpec[] = [];
  while (current) {
    const spec = characterJointSpec(skeleton, current);
    chain.push(spec);
    current = spec.parent;
  }
  for (const spec of chain.reverse())
    position = point(
      position.x + spec.offsetM.x,
      position.y + spec.offsetM.y,
      position.z + spec.offsetM.z,
    );
  return position;
}

export interface CharacterRestPivot {
  readonly joint: CharacterJointId;
  readonly parent: CharacterJointId | null;
  readonly positionM: CharacterPoint;
}

/** Every rest pivot, in authored topological order; the renderer must place meshes on these. */
export function characterRestPivots(skeleton: CharacterSkeleton): readonly CharacterRestPivot[] {
  return Object.freeze(
    skeleton.joints.map((spec) =>
      Object.freeze({
        joint: spec.joint,
        parent: spec.parent,
        positionM: characterRestPositionM(skeleton, spec.joint),
      }),
    ),
  );
}

function boxCorners(centre: CharacterPoint, size: CharacterPoint): readonly CharacterPoint[] {
  const halfX = size.x / 2;
  const halfY = size.y / 2;
  const halfZ = size.z / 2;
  const corners: CharacterPoint[] = [];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1])
        corners.push(point(centre.x + sx * halfX, centre.y + sy * halfY, centre.z + sz * halfZ));
  return Object.freeze(corners);
}

/** Sole plane below the ankle pivot; derived from the foot box, never authored twice. */
export function ankleToSoleM(skeleton: CharacterSkeleton): number {
  const foot = characterJointSpec(skeleton, 'foot-left');
  return foot.sizeM.y / 2 - foot.boxOffsetM.y;
}

export interface CharacterScale {
  /** Top of the head above the ground contact plane. */
  readonly heightM: number;
  readonly eyeHeightM: number;
  /** Shoulder pivots plus both arm segments, i.e. the T-pose reach. */
  readonly armSpanM: number;
  readonly shoulderWidthM: number;
  readonly hipWidthM: number;
  /** Outer foot boxes at rest, i.e. the width the character needs on a sidewalk. */
  readonly footprintWidthM: number;
  readonly footprintDepthM: number;
  readonly hipHeightM: number;
  readonly legReachM: number;
  readonly ankleToSoleM: number;
  /** Lowest rest point; must be exactly zero for a ground-anchored pivot contract. */
  readonly lowestRestPointM: number;
}

/** Anthropometry measured from the real pivots, not from a declared constant. */
export function measureSkeleton(skeleton: CharacterSkeleton): CharacterScale {
  const head = characterJointSpec(skeleton, 'head');
  const headPivot = characterRestPositionM(skeleton, 'head');
  const shoulder = characterJointSpec(skeleton, 'upper-arm-left');
  const upperArm = characterJointSpec(skeleton, 'upper-arm-left');
  const forearm = characterJointSpec(skeleton, 'forearm-left');
  const hand = characterJointSpec(skeleton, 'hand-left');
  const thigh = characterJointSpec(skeleton, 'thigh-left');
  const foot = characterJointSpec(skeleton, 'foot-left');
  const hipPivot = characterRestPositionM(skeleton, 'thigh-left');
  const footPivot = characterRestPositionM(skeleton, 'foot-left');
  let lowest = Number.POSITIVE_INFINITY;
  for (const spec of skeleton.joints) {
    const pivot = characterRestPositionM(skeleton, spec.joint);
    const centre = point(
      pivot.x + spec.boxOffsetM.x,
      pivot.y + spec.boxOffsetM.y,
      pivot.z + spec.boxOffsetM.z,
    );
    for (const corner of boxCorners(centre, spec.sizeM)) lowest = Math.min(lowest, corner.y);
  }
  return Object.freeze({
    heightM: headPivot.y + head.sizeM.y / 2,
    eyeHeightM: headPivot.y - skeleton.eyeOffsetFromHeadPivotM,
    armSpanM:
      2 * Math.abs(shoulder.offsetM.x) +
      2 * (Math.abs(forearm.offsetM.y) + Math.abs(hand.offsetM.y) + hand.sizeM.y),
    shoulderWidthM: 2 * (Math.abs(upperArm.offsetM.x) + upperArm.sizeM.x / 2),
    hipWidthM: 2 * Math.abs(thigh.offsetM.x),
    footprintWidthM: 2 * (Math.abs(thigh.offsetM.x) + foot.sizeM.x / 2),
    footprintDepthM: foot.sizeM.z,
    hipHeightM: hipPivot.y,
    legReachM: hipPivot.y - footPivot.y + ankleToSoleM(skeleton),
    ankleToSoleM: ankleToSoleM(skeleton),
    lowestRestPointM: lowest,
  });
}

/** Hip-to-ankle segment lengths used by the deterministic two-bone solver. */
export function characterLegSegments(skeleton: CharacterSkeleton): {
  readonly thighM: number;
  readonly shinM: number;
  readonly ankleToSoleM: number;
} {
  const shin = characterJointSpec(skeleton, 'shin-left');
  return Object.freeze({
    thighM: Math.abs(shin.offsetM.y),
    shinM: Math.abs(characterJointSpec(skeleton, 'foot-left').offsetM.y),
    ankleToSoleM: ankleToSoleM(skeleton),
  });
}

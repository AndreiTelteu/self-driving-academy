/**
 * PBI 191 — deterministic in-place clips sampled at 60 Hz.
 *
 * A clip produces local joint transforms only: a pelvis vertical bob plus X-axis joint rotations.
 * It never receives an entity position and never returns one, so the authoritative transform cannot
 * be produced or overwritten by animation. Legs are solved with a two-bone IK from planted foot
 * targets, which keeps the stance sole on the ground and makes an impossible target an explicit
 * refusal instead of a visual artefact.
 */
import { CharacterContractError } from './errors';
import {
  CHARACTER_JOINT_IDS,
  characterJointSpec,
  characterLegSegments,
  characterRestPositionM,
  type CharacterJointId,
  type CharacterPoint,
  type CharacterSkeleton,
} from './skeleton';

export const CHARACTER_SAMPLING_HZ = 60;

/** Solver margin: a target this close to full extension is already a refusal. */
export const CHARACTER_IK_MARGIN_M = 0.004;

export const CHARACTER_CLIP_IDS = Object.freeze([
  'idle',
  'walk',
  'run',
  'enter-vehicle',
  'exit-vehicle',
] as const);
export type CharacterClipId = (typeof CHARACTER_CLIP_IDS)[number];

export type CharacterClipKind = 'IDLE' | 'GAIT' | 'TRANSITION';

export interface CharacterClipSpec {
  readonly clipId: CharacterClipId;
  readonly kind: CharacterClipKind;
  readonly loop: boolean;
  readonly frames: number;
  readonly durationS: number;
  /** Authored in the asset's metre frame; scaled with the skeleton by the sampler. */
  readonly strideM: number;
  /** Fraction of the cycle in which a foot is planted; 0.5 keeps a support foot every frame. */
  readonly stanceFraction: number;
  readonly swingLiftM: number;
  readonly armSwingRad: number;
  readonly torsoPitchRad: number;
  /** Idle breathing amplitude in metres; zero for locomotion. */
  readonly breathM: number;
}

function clip(
  clipId: CharacterClipId,
  kind: CharacterClipKind,
  frames: number,
  options: {
    readonly strideM?: number;
    readonly stanceFraction?: number;
    readonly swingLiftM?: number;
    readonly armSwingRad?: number;
    readonly torsoPitchRad?: number;
    readonly breathM?: number;
  } = {},
): CharacterClipSpec {
  if (!Number.isSafeInteger(frames) || frames < 12)
    throw new RangeError(`Invalid clip frame count for ${clipId}`);
  return Object.freeze({
    clipId,
    kind,
    loop: kind !== 'TRANSITION',
    frames,
    durationS: frames / CHARACTER_SAMPLING_HZ,
    strideM: options.strideM ?? 0,
    stanceFraction: options.stanceFraction ?? 1,
    swingLiftM: options.swingLiftM ?? 0,
    armSwingRad: options.armSwingRad ?? 0,
    torsoPitchRad: options.torsoPitchRad ?? 0,
    breathM: options.breathM ?? 0,
  });
}

export const CHARACTER_CLIP_SPECS: readonly CharacterClipSpec[] = Object.freeze([
  clip('idle', 'IDLE', 120, { armSwingRad: 0.02, breathM: 0.006 }),
  clip('walk', 'GAIT', 48, {
    strideM: 0.68,
    stanceFraction: 0.62,
    swingLiftM: 0.16,
    armSwingRad: 0.35,
    torsoPitchRad: 0.04,
  }),
  clip('run', 'GAIT', 30, {
    strideM: 0.8,
    stanceFraction: 0.55,
    swingLiftM: 0.24,
    armSwingRad: 0.6,
    torsoPitchRad: 0.14,
  }),
  clip('enter-vehicle', 'TRANSITION', 48, { armSwingRad: 0.55 }),
  clip('exit-vehicle', 'TRANSITION', 54, { armSwingRad: 0.55 }),
]);

export function characterClipSpec(clipId: CharacterClipId): CharacterClipSpec {
  const spec = CHARACTER_CLIP_SPECS.find((entry) => entry.clipId === clipId);
  if (!spec) throw new CharacterContractError('INVALID_CLIP', `unknown clip ${String(clipId)}`);
  return spec;
}

/** Nominal ground speed implied by an in-place grounded gait; never applied by the clip. */
export function characterClipNominalSpeedMps(spec: CharacterClipSpec): number {
  if (spec.kind !== 'GAIT' || spec.stanceFraction <= 0) return 0;
  return spec.strideM / (spec.stanceFraction * spec.durationS);
}

export interface CharacterJointTransform {
  readonly joint: CharacterJointId;
  /** Local translation added to the rest offset; only the pelvis may translate, and only in Y. */
  readonly offsetM: CharacterPoint;
  /** Local rotation about the joint X axis; Y and Z are always zero. */
  readonly rotationRad: CharacterPoint;
}

export interface CharacterPose {
  readonly clipId: CharacterClipId;
  readonly tick: number;
  readonly frame: number;
  readonly phase: number;
  readonly finished: boolean;
  /** Marker that this pose has no entity position; the field does not exist on purpose. */
  readonly localOnly: true;
  readonly joints: readonly CharacterJointTransform[];
}

export interface CharacterJointFrame {
  readonly joint: CharacterJointId;
  readonly parent: CharacterJointId | null;
  readonly positionM: CharacterPoint;
  readonly rotationXRad: number;
}

const FORBIDDEN_POSE_KEYS = Object.freeze([
  'positionM',
  'rootPositionM',
  'worldPositionM',
  'entityPositionM',
  'rootMotionM',
  'transform',
]);

function finitePoint(candidate: CharacterPoint): boolean {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    [candidate.x, candidate.y, candidate.z].every(
      (value) => typeof value === 'number' && Number.isFinite(value),
    )
  );
}

const point = (x: number, y: number, z: number): CharacterPoint => Object.freeze({ x, y, z });

/**
 * Fail-closed validation of a pose. A pose that carries an entity transform, a non-pelvis
 * translation or a lateral root offset is refused; it is never silently stripped.
 */
export function assertLocalCharacterPose(pose: CharacterPose): void {
  if (!pose || typeof pose !== 'object' || pose.localOnly !== true)
    throw new CharacterContractError('INVALID_POSE', 'pose is not marked localOnly');
  for (const key of FORBIDDEN_POSE_KEYS)
    if (Object.hasOwn(pose, key))
      throw new CharacterContractError(
        'POSE_CONTAINS_ENTITY_POSITION',
        `pose carries ${key}; animation may not write the authoritative transform`,
      );
  if (!Array.isArray(pose.joints) || pose.joints.length !== CHARACTER_JOINT_IDS.length)
    throw new CharacterContractError('INVALID_POSE', 'pose must contain every joint exactly once');
  const seen = new Set<CharacterJointId>();
  for (const [index, transform] of pose.joints.entries()) {
    if (!transform || !CHARACTER_JOINT_IDS.includes(transform.joint))
      throw new CharacterContractError('INVALID_JOINT', `unknown joint at index ${index}`);
    if (seen.has(transform.joint))
      throw new CharacterContractError('INVALID_JOINT', `duplicate joint ${transform.joint}`);
    if (transform.joint !== CHARACTER_JOINT_IDS[index])
      throw new CharacterContractError(
        'INVALID_POSE',
        `joints must follow the authored order (${transform.joint} at ${index})`,
      );
    seen.add(transform.joint);
    if (!finitePoint(transform.offsetM) || !finitePoint(transform.rotationRad))
      throw new CharacterContractError(
        'INVALID_POSE',
        `non-finite transform for ${transform.joint}`,
      );
    if (transform.rotationRad.y !== 0 || transform.rotationRad.z !== 0)
      throw new CharacterContractError(
        'INVALID_POSE',
        `clip rotations are X-only (${transform.joint})`,
      );
    if (transform.joint === 'pelvis') {
      if (transform.offsetM.x !== 0 || transform.offsetM.z !== 0)
        throw new CharacterContractError(
          'ROOT_MOTION_IN_CLIP',
          'root translation must be zero on X/Z; clips are in-place',
        );
    } else if (transform.offsetM.x !== 0 || transform.offsetM.y !== 0 || transform.offsetM.z !== 0)
      throw new CharacterContractError(
        'ROOT_MOTION_IN_CLIP',
        `joint ${transform.joint} must rotate, not translate`,
      );
  }
}

export interface TwoBoneSolution {
  /** Absolute forward pitch of the thigh, radians. */
  readonly hipPitchRad: number;
  /** Knee bend relative to the thigh; negative, because the knee bends backwards. */
  readonly kneeBendRad: number;
  /** Absolute forward pitch of the shin, used to keep the sole level. */
  readonly anklePitchRad: number;
}

/**
 * Deterministic sagittal two-bone IK. A target beyond reach or inside the dead zone is refused,
 * so no clip can silently float or hyperextend a leg.
 */
export function solveTwoBoneIK(
  hipM: Readonly<{ y: number; z: number }>,
  ankleM: Readonly<{ y: number; z: number }>,
  thighM: number,
  shinM: number,
): TwoBoneSolution {
  const dy = ankleM.y - hipM.y;
  const dz = ankleM.z - hipM.z;
  const distance = Math.hypot(dy, dz);
  const reach = thighM + shinM;
  const minimum = Math.abs(thighM - shinM);
  if (![distance, thighM, shinM].every(Number.isFinite) || thighM <= 0 || shinM <= 0)
    throw new CharacterContractError('INVALID_POSE', 'invalid leg segment');
  if (distance > reach - CHARACTER_IK_MARGIN_M)
    throw new CharacterContractError(
      'LEG_OVERREACH',
      `leg target ${distance.toFixed(4)} m exceeds reach ${(reach - CHARACTER_IK_MARGIN_M).toFixed(4)} m`,
    );
  if (distance < minimum + CHARACTER_IK_MARGIN_M)
    throw new CharacterContractError(
      'LEG_OVERREACH',
      `leg target ${distance.toFixed(4)} m inside the knee dead zone`,
    );
  const alpha = Math.atan2(dz, -dy);
  const cosBeta = (distance * distance + thighM * thighM - shinM * shinM) / (2 * distance * thighM);
  const beta = Math.acos(Math.max(-1, Math.min(1, cosBeta)));
  const cosBend = (distance * distance - thighM * thighM - shinM * shinM) / (2 * thighM * shinM);
  const bend = Math.acos(Math.max(-1, Math.min(1, cosBend)));
  const hipPitchRad = alpha + beta;
  const kneeBendRad = -bend;
  return Object.freeze({
    hipPitchRad,
    kneeBendRad,
    anklePitchRad: hipPitchRad + kneeBendRad,
  });
}

interface FootTarget {
  readonly soleY: number;
  readonly soleZ: number;
  readonly planted: boolean;
}

const ZERO_POINT = point(0, 0, 0);

function identityJoints(): CharacterJointTransform[] {
  return CHARACTER_JOINT_IDS.map((jointId) =>
    Object.freeze({ joint: jointId, offsetM: ZERO_POINT, rotationRad: ZERO_POINT }),
  );
}

function smoothstep(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function gaitFoot(legPhase: number, spec: CharacterClipSpec, scale: number): FootTarget {
  if (spec.kind !== 'GAIT') return { soleY: 0, soleZ: 0, planted: true };
  if (legPhase < spec.stanceFraction) {
    const progress = legPhase / spec.stanceFraction;
    return {
      soleY: 0,
      soleZ: (spec.strideM / 2 - spec.strideM * progress) * scale,
      planted: true,
    };
  }
  const swing = (legPhase - spec.stanceFraction) / (1 - spec.stanceFraction);
  return {
    soleY: spec.swingLiftM * Math.sin(Math.PI * swing) * scale,
    soleZ: (-spec.strideM / 2 + spec.strideM * swing) * scale,
    planted: swing === 0 || swing === 1,
  };
}

/**
 * Lowest hip that keeps every authored foot target inside the solver reach; the bob is geometric
 * and applies to the swing foot too, so no frame can ask for an impossible leg.
 */
function supportedHipHeightM(
  skeleton: CharacterSkeleton,
  targets: readonly FootTarget[],
  restHipY: number,
): number {
  const { thighM, shinM, ankleToSoleM } = characterLegSegments(skeleton);
  // Keep one extra solver margin so the derived hip never lands exactly on the refusal boundary.
  const reach = thighM + shinM - CHARACTER_IK_MARGIN_M * 2;
  let hip = restHipY;
  for (const target of targets) {
    const vertical = Math.sqrt(Math.max(0, reach * reach - target.soleZ * target.soleZ));
    hip = Math.min(hip, target.soleY + ankleToSoleM + vertical);
  }
  return hip;
}

interface TransitionPose {
  readonly crouch: number;
  readonly leftFoot: FootTarget;
  readonly rightFoot: FootTarget;
}

function transitionPose(spec: CharacterClipSpec, progress: number, scale: number): TransitionPose {
  const entering = spec.clipId === 'enter-vehicle';
  const crouch = entering ? smoothstep(progress) : 1 - smoothstep(progress);
  if (entering)
    return {
      crouch,
      leftFoot: { soleY: 0, soleZ: 0.08 * crouch * scale, planted: true },
      rightFoot: { soleY: 0, soleZ: -0.02 * crouch * scale, planted: true },
    };
  const step = Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (progress - 0.15) / 0.55))));
  return {
    crouch,
    leftFoot: { soleY: 0, soleZ: 0.08 * crouch * scale, planted: true },
    rightFoot: {
      soleY: 0.1 * step * scale,
      soleZ: (0.08 * crouch + 0.12 * step) * scale,
      planted: step === 0,
    },
  };
}

/**
 * Deterministic clip sampling. Sampled frames are a pure function of (skeleton, clip, tick):
 * there is no clock, no random source and no entity state.
 */
export function sampleCharacterPose(
  skeleton: CharacterSkeleton,
  clipId: CharacterClipId,
  tick: number,
): CharacterPose {
  if (!Number.isSafeInteger(tick) || tick < 0)
    throw new CharacterContractError('INVALID_TICK', `tick must be a non-negative integer`);
  const spec = characterClipSpec(clipId);
  const frame = spec.loop ? modulo(tick, spec.frames) : Math.min(tick, spec.frames - 1);
  const phase = spec.loop ? frame / spec.frames : frame / Math.max(1, spec.frames - 1);
  const scale = skeleton.scale;
  const joints = identityJoints();
  const byJoint = new Map(joints.map((transform) => [transform.joint, transform]));
  const setRotation = (jointId: CharacterJointId, rotationXRad: number) => {
    const transform = byJoint.get(jointId)!;
    const next = Object.freeze({
      joint: jointId,
      offsetM: transform.offsetM,
      rotationRad: point(rotationXRad, 0, 0),
    });
    joints[joints.indexOf(transform)] = next;
    byJoint.set(jointId, next);
  };
  const setPelvisOffset = (offsetY: number) => {
    const transform = byJoint.get('pelvis')!;
    const next = Object.freeze({
      joint: 'pelvis' as const,
      offsetM: point(0, offsetY, 0),
      rotationRad: transform.rotationRad,
    });
    joints[joints.indexOf(transform)] = next;
    byJoint.set('pelvis', next);
  };

  const restHipY = characterRestPositionM(skeleton, 'thigh-left').y;
  const restPelvisY = characterRestPositionM(skeleton, 'pelvis').y;
  const hipOffsetFromPelvisY = characterJointSpec(skeleton, 'thigh-left').offsetM.y;
  const { thighM, shinM, ankleToSoleM } = characterLegSegments(skeleton);

  let leftFoot: FootTarget;
  let rightFoot: FootTarget;
  let torsoPitch = spec.torsoPitchRad;
  let neckPitch = 0;
  let headPitch = 0;
  let armSwing = 0;
  let forearmBend = 0;
  let hipY = restHipY;
  let breathing = 0;

  if (spec.kind === 'GAIT') {
    leftFoot = gaitFoot(phase, spec, scale);
    rightFoot = gaitFoot(modulo(phase + 0.5, 1), spec, scale);
    hipY = supportedHipHeightM(skeleton, [leftFoot, rightFoot], restHipY);
    armSwing = spec.armSwingRad * Math.cos(Math.PI * 2 * phase);
    forearmBend = 0.25 + spec.armSwingRad * 0.4;
  } else if (spec.kind === 'IDLE') {
    leftFoot = { soleY: 0, soleZ: 0, planted: true };
    rightFoot = { soleY: 0, soleZ: 0, planted: true };
    breathing = spec.breathM * (1 - Math.cos(Math.PI * 4 * phase)) * 0.5;
    hipY = supportedHipHeightM(skeleton, [leftFoot, rightFoot], restHipY) - breathing;
    armSwing = spec.armSwingRad * Math.sin(Math.PI * 2 * phase);
    forearmBend = 0.12;
    torsoPitch = 0.02 * Math.sin(Math.PI * 2 * phase);
  } else {
    const transition = transitionPose(spec, phase, scale);
    leftFoot = transition.leftFoot;
    rightFoot = transition.rightFoot;
    const crouch = transition.crouch;
    hipY = Math.min(
      restHipY - (restHipY - 0.48 * scale) * crouch,
      supportedHipHeightM(skeleton, [leftFoot, rightFoot], restHipY),
    );
    torsoPitch = 0.62 * crouch;
    neckPitch = -0.32 * crouch;
    headPitch = -0.18 * crouch;
    armSwing = spec.armSwingRad * crouch;
    forearmBend = 0.12 + 0.5 * crouch;
  }

  setPelvisOffset(hipY - hipOffsetFromPelvisY - restPelvisY);
  const spinePitch = spec.kind === 'TRANSITION' ? torsoPitch * 0.55 : torsoPitch * 0.5;
  const chestPitch = spec.kind === 'TRANSITION' ? torsoPitch * 0.45 : torsoPitch * 0.5;
  setRotation('spine', -spinePitch);
  setRotation('chest', -chestPitch);
  setRotation('neck', -neckPitch);
  setRotation('head', -headPitch);
  if (spec.kind === 'TRANSITION') {
    setRotation('upper-arm-left', -armSwing);
    setRotation('upper-arm-right', -armSwing);
  } else {
    setRotation('upper-arm-left', armSwing);
    setRotation('upper-arm-right', -armSwing);
  }
  setRotation('forearm-left', -forearmBend);
  setRotation('forearm-right', -forearmBend);

  const hipZ = 0;
  const solveLeg = (side: 'left' | 'right', target: FootTarget) => {
    const solution = solveTwoBoneIK(
      { y: hipY, z: hipZ },
      { y: target.soleY + ankleToSoleM, z: target.soleZ },
      thighM,
      shinM,
    );
    setRotation(`thigh-${side}`, -solution.hipPitchRad);
    setRotation(`shin-${side}`, -solution.kneeBendRad);
    setRotation(`foot-${side}`, solution.anklePitchRad);
  };
  solveLeg('left', leftFoot);
  solveLeg('right', rightFoot);

  const pose: CharacterPose = Object.freeze({
    clipId,
    tick,
    frame,
    phase,
    finished: spec.loop ? false : tick >= spec.frames - 1,
    localOnly: true,
    joints: Object.freeze(joints),
  });
  assertLocalCharacterPose(pose);
  return pose;
}

/**
 * Forward kinematics for a sampled pose: joint origins and accumulated X rotation. Used by the
 * ground-contact measurement, so contact numbers never come from the IK targets themselves.
 */
export function characterJointFrames(
  skeleton: CharacterSkeleton,
  pose: CharacterPose,
): readonly CharacterJointFrame[] {
  assertLocalCharacterPose(pose);
  const transforms = new Map(pose.joints.map((transform) => [transform.joint, transform]));
  const frames = new Map<CharacterJointId, CharacterJointFrame>();
  const result: CharacterJointFrame[] = [];
  for (const spec of skeleton.joints) {
    const transform = transforms.get(spec.joint)!;
    const localX = spec.offsetM.x + transform.offsetM.x;
    const localY = spec.offsetM.y + transform.offsetM.y;
    const localZ = spec.offsetM.z + transform.offsetM.z;
    if (spec.parent === null) {
      const frame: CharacterJointFrame = Object.freeze({
        joint: spec.joint,
        parent: null,
        positionM: point(localX, localY, localZ),
        rotationXRad: transform.rotationRad.x,
      });
      frames.set(spec.joint, frame);
      result.push(frame);
      continue;
    }
    const parent = frames.get(spec.parent);
    if (!parent)
      throw new CharacterContractError(
        'INVALID_POSE',
        `joint ${spec.joint} appears before its parent ${spec.parent}`,
      );
    const cos = Math.cos(parent.rotationXRad);
    const sin = Math.sin(parent.rotationXRad);
    const frame: CharacterJointFrame = Object.freeze({
      joint: spec.joint,
      parent: spec.parent,
      positionM: point(
        parent.positionM.x + localX,
        parent.positionM.y + localY * cos - localZ * sin,
        parent.positionM.z + localY * sin + localZ * cos,
      ),
      rotationXRad: parent.rotationXRad + transform.rotationRad.x,
    });
    frames.set(spec.joint, frame);
    result.push(frame);
  }
  return Object.freeze(result);
}

const BOTTOM_FACE = Object.freeze([
  Object.freeze({ x: -1, z: -1 }),
  Object.freeze({ x: 1, z: -1 }),
  Object.freeze({ x: 1, z: 1 }),
  Object.freeze({ x: -1, z: 1 }),
]);

/** Four bottom corners of the foot box in the character-local frame; the sole plane. */
export function characterSoleCorners(
  skeleton: CharacterSkeleton,
  frames: readonly CharacterJointFrame[],
  side: 'left' | 'right',
): readonly CharacterPoint[] {
  const spec = characterJointSpec(skeleton, `foot-${side}`);
  const frame = frames.find((entry) => entry.joint === spec.joint);
  if (!frame) throw new CharacterContractError('INVALID_POSE', `missing foot ${side}`);
  const centreY = spec.boxOffsetM.y - spec.sizeM.y / 2;
  const cos = Math.cos(frame.rotationXRad);
  const sin = Math.sin(frame.rotationXRad);
  return Object.freeze(
    BOTTOM_FACE.map((corner) => {
      const localX = spec.boxOffsetM.x + (corner.x * spec.sizeM.x) / 2;
      const localY = centreY;
      const localZ = spec.boxOffsetM.z + (corner.z * spec.sizeM.z) / 2;
      return point(
        frame.positionM.x + localX,
        frame.positionM.y + localY * cos - localZ * sin,
        frame.positionM.z + localY * sin + localZ * cos,
      );
    }),
  );
}

/** Lowest corner of every joint box; the skeleton's real lowest point, not a foot target. */
export function characterLowestPointM(
  skeleton: CharacterSkeleton,
  frames: readonly CharacterJointFrame[],
): number {
  let lowest = Number.POSITIVE_INFINITY;
  for (const spec of skeleton.joints) {
    const frame = frames.find((entry) => entry.joint === spec.joint)!;
    const cos = Math.cos(frame.rotationXRad);
    const sin = Math.sin(frame.rotationXRad);
    for (const corner of BOTTOM_FACE)
      for (const sign of [-1, 1]) {
        const localY = spec.boxOffsetM.y + (sign * spec.sizeM.y) / 2;
        const localZ = spec.boxOffsetM.z + (corner.z * spec.sizeM.z) / 2;
        lowest = Math.min(lowest, frame.positionM.y + localY * cos - localZ * sin);
      }
  }
  return lowest;
}

/** Highest head corner, used by the door-clearance scale check. */
export function characterHeadTopM(
  skeleton: CharacterSkeleton,
  frames: readonly CharacterJointFrame[],
): number {
  const spec = characterJointSpec(skeleton, 'head');
  const frame = frames.find((entry) => entry.joint === spec.joint)!;
  const cos = Math.cos(frame.rotationXRad);
  const sin = Math.sin(frame.rotationXRad);
  let top = Number.NEGATIVE_INFINITY;
  for (const corner of BOTTOM_FACE)
    for (const sign of [-1, 1]) {
      const localY = spec.boxOffsetM.y + (sign * spec.sizeM.y) / 2;
      const localZ = spec.boxOffsetM.z + (corner.z * spec.sizeM.z) / 2;
      top = Math.max(top, frame.positionM.y + localY * cos - localZ * sin);
    }
  return top;
}

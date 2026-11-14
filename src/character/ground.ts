/**
 * PBI 191 — ground contact measured from forward kinematics, frame by frame.
 *
 * The numbers come from the sampled joint rotations and the foot boxes, not from the IK targets, so
 * a broken pose cannot report a clean contact. `walk`/`run` must keep at least one support foot in
 * every frame, `idle` must keep both feet planted, and no clip may sink below the ground plane.
 */
import {
  CHARACTER_SAMPLING_HZ,
  characterClipSpec,
  characterJointFrames,
  characterLowestPointM,
  characterSoleCorners,
  sampleCharacterPose,
  type CharacterClipId,
  type CharacterPose,
} from './clips';
import type { CharacterSkeleton } from './skeleton';

/** Authored tolerance for both floating and sinking, in metres. */
export const CHARACTER_GROUND_CONTACT_TOLERANCE_M = 0.004;

export type CharacterContactReason =
  'GROUND_PENETRATION' | 'GROUND_FLOAT' | 'NO_SUPPORT_FOOT' | 'IDLE_FOOT_LIFTED';

export interface CharacterContactFrame {
  readonly tick: number;
  readonly frame: number;
  readonly leftSoleM: number;
  readonly rightSoleM: number;
  readonly lowestM: number;
  readonly plantedSoles: readonly ('left' | 'right')[];
}

export interface CharacterClipContact {
  readonly clipId: CharacterClipId;
  readonly frames: number;
  readonly toleranceM: number;
  readonly lowestMinM: number;
  readonly lowestMaxM: number;
  readonly leftSoleMinM: number;
  readonly leftSoleMaxM: number;
  readonly rightSoleMinM: number;
  readonly rightSoleMaxM: number;
  readonly maxPenetrationM: number;
  readonly maxFloatM: number;
  readonly supportFrames: number;
  readonly bothFeetFrames: number;
  readonly frameDetail: readonly CharacterContactFrame[];
}

export interface CharacterContactCheck {
  readonly clipId: CharacterClipId;
  readonly contact: CharacterClipContact;
  readonly reasons: readonly CharacterContactReason[];
  readonly verdict: 'PASS' | 'FAIL';
}

/** Independent FK measurement of one sampled frame. */
export function measureContactFrame(
  skeleton: CharacterSkeleton,
  pose: CharacterPose,
): Omit<CharacterContactFrame, 'frame'> {
  const frames = characterJointFrames(skeleton, pose);
  const leftCorners = characterSoleCorners(skeleton, frames, 'left');
  const rightCorners = characterSoleCorners(skeleton, frames, 'right');
  const leftSoleM = Math.min(...leftCorners.map((corner) => corner.y));
  const rightSoleM = Math.min(...rightCorners.map((corner) => corner.y));
  const lowestM = characterLowestPointM(skeleton, frames);
  const plantedSoles: ('left' | 'right')[] = [];
  if (leftSoleM <= CHARACTER_GROUND_CONTACT_TOLERANCE_M) plantedSoles.push('left');
  if (rightSoleM <= CHARACTER_GROUND_CONTACT_TOLERANCE_M) plantedSoles.push('right');
  return { tick: pose.tick, leftSoleM, rightSoleM, lowestM, plantedSoles };
}

/** Aggregate a frame sequence; exported so a deliberately broken frame can be judged too. */
export function aggregateContact(
  clipId: CharacterClipId,
  frameDetail: readonly CharacterContactFrame[],
): CharacterClipContact {
  if (frameDetail.length === 0) throw new RangeError('Character contact needs at least one frame');
  let lowestMin = Number.POSITIVE_INFINITY;
  let lowestMax = Number.NEGATIVE_INFINITY;
  let leftMin = Number.POSITIVE_INFINITY;
  let leftMax = Number.NEGATIVE_INFINITY;
  let rightMin = Number.POSITIVE_INFINITY;
  let rightMax = Number.NEGATIVE_INFINITY;
  let supportFrames = 0;
  let bothFeetFrames = 0;
  for (const frame of frameDetail) {
    lowestMin = Math.min(lowestMin, frame.lowestM);
    lowestMax = Math.max(lowestMax, frame.lowestM);
    leftMin = Math.min(leftMin, frame.leftSoleM);
    leftMax = Math.max(leftMax, frame.leftSoleM);
    rightMin = Math.min(rightMin, frame.rightSoleM);
    rightMax = Math.max(rightMax, frame.rightSoleM);
    if (Math.min(frame.leftSoleM, frame.rightSoleM) <= CHARACTER_GROUND_CONTACT_TOLERANCE_M)
      supportFrames += 1;
    if (
      frame.leftSoleM <= CHARACTER_GROUND_CONTACT_TOLERANCE_M &&
      frame.rightSoleM <= CHARACTER_GROUND_CONTACT_TOLERANCE_M
    )
      bothFeetFrames += 1;
  }
  return Object.freeze({
    clipId,
    frames: frameDetail.length,
    toleranceM: CHARACTER_GROUND_CONTACT_TOLERANCE_M,
    lowestMinM: lowestMin,
    lowestMaxM: lowestMax,
    leftSoleMinM: leftMin,
    leftSoleMaxM: leftMax,
    rightSoleMinM: rightMin,
    rightSoleMaxM: rightMax,
    maxPenetrationM: Math.max(0, -lowestMin),
    maxFloatM: Math.max(0, lowestMax),
    supportFrames,
    bothFeetFrames,
    frameDetail: Object.freeze([...frameDetail]),
  });
}

/** One full cycle (looping clips) or the authored take (transitions), at the 60 Hz contract. */
export function measureClipContact(
  skeleton: CharacterSkeleton,
  clipId: CharacterClipId,
): CharacterClipContact {
  if (CHARACTER_SAMPLING_HZ !== 60) throw new Error('Character sampling contract requires 60 Hz');
  const spec = characterClipSpec(clipId);
  const frameDetail: CharacterContactFrame[] = [];
  for (let frame = 0; frame < spec.frames; frame += 1) {
    const measured = measureContactFrame(skeleton, sampleCharacterPose(skeleton, clipId, frame));
    frameDetail.push(Object.freeze({ ...measured, frame }));
  }
  return aggregateContact(clipId, frameDetail);
}

/** Closed ground-contact rule set; a failure is a named reason, not a visual opinion. */
export function evaluateContact(
  clipId: CharacterClipId,
  contact: CharacterClipContact,
): CharacterContactCheck {
  const reasons: CharacterContactReason[] = [];
  const tolerance = contact.toleranceM;
  if (contact.lowestMinM < -tolerance) reasons.push('GROUND_PENETRATION');
  const spec = characterClipSpec(clipId);
  if (spec.kind === 'GAIT') {
    if (contact.lowestMaxM > tolerance) reasons.push('GROUND_FLOAT');
    if (contact.supportFrames !== contact.frames) reasons.push('NO_SUPPORT_FOOT');
  } else if (spec.kind === 'IDLE') {
    if (contact.bothFeetFrames !== contact.frames) reasons.push('IDLE_FOOT_LIFTED');
  }
  return Object.freeze({
    clipId,
    contact,
    reasons: Object.freeze(reasons),
    verdict: reasons.length === 0 ? ('PASS' as const) : ('FAIL' as const),
  });
}

export function checkClipContact(
  skeleton: CharacterSkeleton,
  clipId: CharacterClipId,
): CharacterContactCheck {
  return evaluateContact(clipId, measureClipContact(skeleton, clipId));
}

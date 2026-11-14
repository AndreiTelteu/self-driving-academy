/**
 * PBI 191 — the authoritative transform is an input, never an output.
 *
 * A clip supplies local joint transforms; the entity position/yaw come from the caller-owned
 * authority record and are copied bit for bit into the render frame. The writer exposes an
 * explicit `writeEntityPositionM`/`writeRootMotionM` channel that always refuses, so an animation
 * that tries to move the character fails loudly instead of being ignored.
 */
import {
  assertLocalCharacterPose,
  type CharacterJointTransform,
  type CharacterPose,
} from './clips';
import { CharacterContractError } from './errors';
import { CHARACTER_JOINT_IDS, type CharacterPoint } from './skeleton';

export interface CharacterAuthority {
  readonly entityId: string;
  readonly positionM: CharacterPoint;
  readonly yawRad: number;
}

export interface CharacterRenderFrame {
  readonly entityId: string;
  /** Authoritative position, copied without arithmetic. */
  readonly positionM: CharacterPoint;
  readonly yawRad: number;
  readonly joints: readonly CharacterJointTransform[];
}

export interface CharacterPoseWriter {
  /** The only accepted animation output: a local joint transform. */
  writeLocalJoint(transform: CharacterJointTransform): void;
  /** Always refuses; animation does not own the entity position (PBI 192 walker does). */
  writeEntityPositionM(positionM: CharacterPoint): never;
  /** Always refuses; an in-place clip may not smuggle root motion. */
  writeRootMotionM(offsetM: CharacterPoint): never;
  commit(): CharacterRenderFrame;
}

const point = (x: number, y: number, z: number): CharacterPoint => Object.freeze({ x, y, z });

function finitePoint(candidate: CharacterPoint): boolean {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    [candidate.x, candidate.y, candidate.z].every(
      (value) => typeof value === 'number' && Number.isFinite(value),
    )
  );
}

export function createCharacterAuthority(input: {
  readonly entityId: string;
  readonly positionM: CharacterPoint;
  readonly yawRad: number;
}): CharacterAuthority {
  if (typeof input?.entityId !== 'string' || !input.entityId.trim())
    throw new CharacterContractError('INVALID_AUTHORITY', 'entityId must be a non-empty string');
  if (!finitePoint(input.positionM))
    throw new CharacterContractError('INVALID_AUTHORITY', 'positionM must be finite');
  if (typeof input.yawRad !== 'number' || !Number.isFinite(input.yawRad))
    throw new CharacterContractError('INVALID_AUTHORITY', 'yawRad must be finite');
  return Object.freeze({
    entityId: input.entityId,
    positionM: point(input.positionM.x, input.positionM.y, input.positionM.z),
    yawRad: input.yawRad,
  });
}

function validateAuthority(authority: CharacterAuthority): void {
  createCharacterAuthority(authority);
}

/** IEEE-754 bytes of the authoritative position, used to prove bit identity. */
export function characterPositionBits(positionM: CharacterPoint): string {
  const buffer = new ArrayBuffer(24);
  const view = new DataView(buffer);
  view.setFloat64(0, positionM.x);
  view.setFloat64(8, positionM.y);
  view.setFloat64(16, positionM.z);
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Apply a sampled pose to the authority. Position and yaw are copied, never recomputed. */
export function applyCharacterPose(
  authority: CharacterAuthority,
  pose: CharacterPose,
): CharacterRenderFrame {
  validateAuthority(authority);
  assertLocalCharacterPose(pose);
  return Object.freeze({
    entityId: authority.entityId,
    positionM: point(authority.positionM.x, authority.positionM.y, authority.positionM.z),
    yawRad: authority.yawRad,
    joints: Object.freeze([...pose.joints]),
  });
}

/**
 * Fail-closed writer. Position channels exist on purpose: refusing is the contract, so a caller
 * cannot mistake a silently ignored write for a successful one.
 */
export function createCharacterPoseWriter(authority: CharacterAuthority): CharacterPoseWriter {
  validateAuthority(authority);
  const joints: CharacterJointTransform[] = [];
  return Object.freeze({
    writeLocalJoint(transform: CharacterJointTransform): void {
      if (!transform || !CHARACTER_JOINT_IDS.includes(transform.joint))
        throw new CharacterContractError('INVALID_JOINT', 'unknown joint transform');
      assertLocalCharacterPose({
        clipId: 'idle',
        tick: 0,
        frame: 0,
        phase: 0,
        finished: false,
        localOnly: true,
        joints: Object.freeze(
          CHARACTER_JOINT_IDS.map((jointId) =>
            jointId === transform.joint
              ? transform
              : Object.freeze({
                  joint: jointId,
                  offsetM: point(0, 0, 0),
                  rotationRad: point(0, 0, 0),
                }),
          ),
        ),
      });
      joints.push(
        Object.freeze({
          joint: transform.joint,
          offsetM: point(transform.offsetM.x, transform.offsetM.y, transform.offsetM.z),
          rotationRad: point(
            transform.rotationRad.x,
            transform.rotationRad.y,
            transform.rotationRad.z,
          ),
        }),
      );
    },
    writeEntityPositionM(_positionM: CharacterPoint): never {
      throw new CharacterContractError(
        'AUTHORITY_WRITE_REFUSED',
        'animation may not write the authoritative entity position',
      );
    },
    writeRootMotionM(_offsetM: CharacterPoint): never {
      throw new CharacterContractError(
        'AUTHORITY_WRITE_REFUSED',
        'clips are in place; root motion belongs to the PBI 192 walker',
      );
    },
    commit(): CharacterRenderFrame {
      const ordered = CHARACTER_JOINT_IDS.map(
        (jointId) =>
          joints.find((transform) => transform.joint === jointId) ??
          Object.freeze({
            joint: jointId,
            offsetM: point(0, 0, 0),
            rotationRad: point(0, 0, 0),
          }),
      );
      return Object.freeze({
        entityId: authority.entityId,
        positionM: point(authority.positionM.x, authority.positionM.y, authority.positionM.z),
        yawRad: authority.yawRad,
        joints: Object.freeze(ordered),
      });
    },
  });
}

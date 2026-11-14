/**
 * PBI 191 — public entry point for the character asset, animation and authority contract.
 *
 * Everything here is headless: no Babylon, no DOM, no clock and no simulation service. The renderer
 * consumes this module through `src/rendering/character-visuals.ts`, and the PBI 192 walker owns
 * the authoritative position that the clips are never allowed to produce.
 */
export {
  CHARACTER_SKELETON_VERSION,
  CHARACTER_JOINT_IDS,
  DEFAULT_CHARACTER_SKELETON,
  ankleToSoleM,
  characterJointSpec,
  characterLegSegments,
  characterRestPivots,
  characterRestPositionM,
  measureSkeleton,
  scaleSkeleton,
} from './skeleton';
export type {
  CharacterJointId,
  CharacterJointSpec,
  CharacterPoint,
  CharacterRestPivot,
  CharacterScale,
  CharacterSkeleton,
} from './skeleton';
export {
  CHARACTER_CLIP_IDS,
  CHARACTER_CLIP_SPECS,
  CHARACTER_IK_MARGIN_M,
  CHARACTER_SAMPLING_HZ,
  assertLocalCharacterPose,
  characterClipNominalSpeedMps,
  characterClipSpec,
  characterHeadTopM,
  characterJointFrames,
  characterLowestPointM,
  characterSoleCorners,
  sampleCharacterPose,
  solveTwoBoneIK,
} from './clips';
export type {
  CharacterClipId,
  CharacterClipKind,
  CharacterClipSpec,
  CharacterJointFrame,
  CharacterJointTransform,
  CharacterPose,
  TwoBoneSolution,
} from './clips';
export {
  CHARACTER_GROUND_CONTACT_TOLERANCE_M,
  aggregateContact,
  checkClipContact,
  evaluateContact,
  measureClipContact,
  measureContactFrame,
} from './ground';
export type {
  CharacterClipContact,
  CharacterContactCheck,
  CharacterContactFrame,
  CharacterContactReason,
} from './ground';
export {
  CHARACTER_ASSET_VERSION,
  CHARACTER_SCALE_LIMITS,
  characterScaleTable,
  checkCharacterCompatibility,
  createCharacterAsset,
  requireCharacterCompatibility,
} from './asset';
export type {
  CharacterAsset,
  CharacterAssetDeclaration,
  CharacterAssetOptions,
  CharacterCompatibility,
  CharacterCompatibilityCheck,
  CharacterCompatibilityId,
  CharacterMeasuredScale,
  CharacterRefusalReason,
  CharacterVehicleReference,
  CharacterWorldReference,
} from './asset';
export {
  applyCharacterPose,
  characterPositionBits,
  createCharacterAuthority,
  createCharacterPoseWriter,
} from './authority';
export type { CharacterAuthority, CharacterPoseWriter, CharacterRenderFrame } from './authority';
export { CHARACTER_CONTRACT_ERROR_CODES, CharacterContractError } from './errors';
export type { CharacterContractErrorCode } from './errors';

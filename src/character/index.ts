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
export {
  WALKER_CONTRACT_VERSION,
  WALKER_GAITS,
  WALKER_GAIT_SPEEDS_MPS,
  WALKER_IDLE_INPUT,
  WALKER_POLICY,
  createWalker,
  walkerClipForSpeed,
} from './walker';
export type {
  Walker,
  WalkerCapsule,
  WalkerEvent,
  WalkerEventKind,
  WalkerGait,
  WalkerInput,
  WalkerOptions,
  WalkerRegistrationGuard,
  WalkerState,
  WalkerStats,
  WalkerStepInput,
  WalkerStepResult,
  WalkerVehicleSnapshot,
} from './walker';
export {
  WALK_BLOCKER_KINDS,
  WALK_CURB_HEIGHT_M,
  WALK_SURFACE_KINDS,
  createCityWalkWorld,
  createWalkWorld,
} from './walk-world';
export type {
  WalkBlocker,
  WalkBlockerInput,
  WalkBlockerKind,
  WalkSurface,
  WalkSurfaceInput,
  WalkSurfaceKind,
  WalkWorld,
  WalkWorldInput,
  WalkWorldStats,
} from './walk-world';
export {
  boundsOverlap,
  circlePenetrationM,
  circlePushOut,
  createOrientedRectanglePolygon,
  createRectanglePolygon,
  createWalkPolygon,
  walkPolygonAreaM2,
  walkPolygonContains,
  walkPolygonDistanceM,
} from './walk-geometry';
export type { CirclePushOut, WalkBounds2, WalkPoint2, WalkPolygon } from './walk-geometry';
export { CHARACTER_CONTRACT_ERROR_CODES, CharacterContractError } from './errors';
export type { CharacterContractErrorCode } from './errors';
export {
  CHARACTER_CAMERA_CONTRACT_VERSION,
  CHARACTER_CAMERA_DEFAULT_ORBIT,
  CHARACTER_CAMERA_ERROR_CODES,
  CHARACTER_CAMERA_POLICY,
  CharacterCameraError,
  characterCameraControl,
  createCharacterCamera,
  decideCameraSwitch,
  resolveCharacterCameraOrbit,
} from './character-camera';
export type {
  CharacterCamera,
  CharacterCameraControl,
  CharacterCameraErrorCode,
  CharacterCameraFrame,
  CharacterCameraObstacle,
  CharacterCameraOptions,
  CharacterCameraOrbit,
  CharacterCameraSnapshot,
  CharacterCameraState,
  CharacterCameraStats,
  CharacterCameraStepRequest,
  CharacterCameraSwitchDecision,
  CharacterCameraSwitchReason,
  CharacterCameraTarget,
  CharacterCameraTargetKind,
  CharacterCameraTransition,
  CharacterCameraWorld,
} from './character-camera';
export {
  ENTER_VEHICLE_CONTRACT_VERSION,
  VEHICLE_ENTRY_ERROR_CODES,
  VEHICLE_ENTRY_POLICY,
  VEHICLE_ENTRY_REFUSAL_CODES,
  VehicleEntryError,
  decideVehicleEntry,
  vehicleEntryBits,
  vehicleEntryDoor,
} from './enter-vehicle';
export type {
  VehicleEntryAcceptance,
  VehicleEntryCameraRequest,
  VehicleEntryCharacterBody,
  VehicleEntryDecision,
  VehicleEntryDoor,
  VehicleEntryDoorSide,
  VehicleEntryEntityCounts,
  VehicleEntryErrorCode,
  VehicleEntryRefusal,
  VehicleEntryRefusalCode,
  VehicleEntryRequest,
  VehicleEntryState,
  VehicleEntryVehicle,
} from './enter-vehicle';

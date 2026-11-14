/**
 * PBI 191/192 — closed error vocabulary for the character contract.
 *
 * The contract is fail-closed: an incompatible asset, a clip that tries to move the entity, a pose
 * that carries an entity position or a walking module that tries to own a vehicle body is refused
 * with an explicit code instead of being ignored.
 */
export const CHARACTER_CONTRACT_ERROR_CODES = Object.freeze([
  'INVALID_ASSET',
  'ASSET_REFUSED',
  'INVALID_CLIP',
  'INVALID_TICK',
  'INVALID_POSE',
  'INVALID_JOINT',
  'INVALID_AUTHORITY',
  'POSE_CONTAINS_ENTITY_POSITION',
  'ROOT_MOTION_IN_CLIP',
  'AUTHORITY_WRITE_REFUSED',
  'LEG_OVERREACH',
  'INVALID_WALK_INPUT',
  'INVALID_WALK_WORLD',
  'WALK_START_BLOCKED',
  'WALK_WORLD_POLYGON',
  'VEHICLE_BODY_WRITE_REFUSED',
  'VEHICLE_STATE_WRITE_REFUSED',
] as const);
export type CharacterContractErrorCode = (typeof CHARACTER_CONTRACT_ERROR_CODES)[number];

export class CharacterContractError extends Error {
  readonly code: CharacterContractErrorCode;

  constructor(code: CharacterContractErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'CharacterContractError';
    this.code = code;
  }
}

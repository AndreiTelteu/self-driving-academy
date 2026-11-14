import {
  CHARACTER_CAMERA_CONTRACT_VERSION,
  CHARACTER_CAMERA_DEFAULT_ORBIT,
  CharacterCameraError,
  CharacterContractError,
  FleetSwitchError,
  WalkingSegmentsError,
  createCharacterCamera,
  createFleetSwitchState,
  createWalkingSegments,
  createWalker,
  parseFleetSwitchState,
  parseWalkingSegmentsState,
} from '../character';
import type {
  CharacterCameraSnapshot,
  CharacterCameraWorld,
  CharacterPoint,
  FleetCharacterBody,
  FleetSwitchState,
  WalkWorld,
  WalkingSegmentsState,
  WalkingSegmentsTarget,
} from '../character';
import {
  INPUT_AUTHORITY_CONTRACT_VERSION,
  InputAuthorityError,
  createInputAuthorityArbiter,
} from '../input';
import type { InputAuthority, InputAuthoritySnapshot } from '../input';
import { createDefaultSettings } from '../settings';
import {
  CANONICALIZATION_VERSION,
  CHECKSUM_ALGORITHM,
  canonicalizeJson,
  parseStrictJson,
  sha256Hex,
} from './canonical-json';
import type { StrictJsonRejection } from './canonical-json';
import { PERSISTENCE_LIMITS } from './contracts';
import { readEconomySave } from './economy-save';
import type { EconomySaveDocument, EconomySaveValidation } from './economy-save';
import { measureJsonBytes } from './records';
import { SESSION_ARCHIVE_FORMAT, readSessionArchive } from './session-archive';
import type {
  SessionArchiveDocument,
  SessionArchiveRejectionCode,
  SessionArchiveSession,
  SessionArchiveValidationAccepted,
  SessionArchiveVersions,
} from './session-archive';
import {
  SESSION_ARCHIVE_ECONOMY_LIMITS,
  readSessionArchiveWithEconomy,
  sessionArchiveEconomyCodes,
} from './session-archive-economy';
import type {
  SessionArchiveEconomyCode,
  SessionArchiveEconomyCounts,
} from './session-archive-economy';
import { WORLD_SNAPSHOT_LIMITS, readWorldSnapshot } from './world-snapshot';

/**
 * The character slot of the session archive, format version 3 (PBI 200).
 *
 * Docs/20 asks the V3 save to keep the character position, the camera and the authority, and
 * Docs/29 asks every save to be a versioned, checksummed, fail-closed document. This module adds
 * exactly one thing to the delivered archive family: a sibling slot `character` next to the
 * untouched 135 (`session`) and 215 (`economy`) slots, in a version 3 envelope of its own.
 *
 * Five properties are structural:
 *
 * 1. **The existing slots are copied, never rewritten.** A version 1 or version 2 archive migrates
 *    by carrying `components.session` and `components.economy` **by reference**: their bytes, their
 *    own checksums and their own readers are unchanged, so the world, the character identity, the
 *    KPI buckets, the daily calendar and the XP ledger cannot drift by construction. The migration
 *    computes a digest of every carried component before and after and refuses a difference.
 * 2. **The character state belongs to its owners.** Position and yaw keep the exact 192 state
 *    shape (`FleetCharacterBody`, the single body the 197 model also holds), the authority is the
 *    193 snapshot, the camera is the 194 snapshot, the segment model is the 198 state and the fleet
 *    state is the 197 state. Every one of them is parsed by its owner's own inverse; this module
 *    only adds the cross-checks the owners cannot make alone.
 * 3. **A session without the slot gets a documented state, not a guess.** The migration rule named
 *    `MIGRATION_DEFAULT` places the body at the authored walk spawn (validated by the real 192
 *    walker, so a blocked point is refused, not silently accepted), makes `CHARACTER:<id>` the
 *    authority, puts the camera on that same entity, derives the segment target from the session's
 *    own profile generation (or from the session identity when there is none), and starts the 198
 *    model empty at the save tick: no walking distance, no segment and no candidate is claimed.
 * 4. **Fail-closed integrity in the documented order.** Budget and depth, strict parse, envelope and
 *    format version, canonical form and byte budget, checksum, schema, then the components, each with
 *    its owner's reader, and finally the declared size ledger. A refusal returns a closed code and
 *    the input document is never partially migrated or written: this module owns no port, no writer,
 *    no IndexedDB call and no reward path.
 * 5. **Reload starts paused and cannot double anything.** `walkingSaveReload` only describes the
 *    launch: `PAUSED_AUTO`, input released, every key held at save time neutralised by 193's own
 *    restore rule, the entity set compared against the live world (a different set is refused), and
 *    zero bodies created. The economy counters are read from the carried 215 component, so a second
 *    read reports the same XP, the same daily rewards and the same settlements.
 */

/** Contract id of this layer. */
export const WALKING_SAVE_VERSION = '200-walking-save-v1' as const;

/** Format version 3 of the session archive family: 135 is 1, 215 is 2, this is 3. */
export const WALKING_SAVE_FORMAT_VERSION = 3 as const;
export const WALKING_SAVE_SCHEMA_VERSION = 3 as const;

/** Contract id of the character slot itself. */
export const WALKING_CHARACTER_VERSION = '200-walking-character-v1' as const;

/** The three slots of a version 3 document; the first two are the delivered 135 and 215 ones. */
export const walkingSaveComponents = ['session', 'economy', 'character'] as const;
export type WalkingSaveComponentName = (typeof walkingSaveComponents)[number];

/** How the character slot was produced; provenance, not behaviour. */
export const walkingCharacterSources = ['SNAPSHOT', 'MIGRATION_DEFAULT'] as const;
export type WalkingCharacterSource = (typeof walkingCharacterSources)[number];

/**
 * Fixed budgets, derived from the delivered ones.
 *
 * The session and economy slots keep the 215 budgets byte for byte. The character slot is a quarter
 * of one 130 record body (262 144 / 4): the four states it carries are bounded by their own
 * contracts (one camera transition, one open plus one closed segment, two fleet journals), and the
 * measured state is an order of magnitude below it. The file budget is the sum plus one envelope.
 */
export const WALKING_SAVE_LIMITS = Object.freeze({
  /** Canonical UTF-16 code units of the whole version 3 document. */
  maxFileBytes:
    SESSION_ARCHIVE_ECONOMY_LIMITS.maxTotalBytes + PERSISTENCE_LIMITS.maxBodyBytes / 4 + 65_536,
  /** Canonical UTF-8 bytes of the inner 135 document, exactly the 215 slot budget. */
  sessionBytes: SESSION_ARCHIVE_ECONOMY_LIMITS.sessionBytes,
  /** Canonical UTF-8 bytes of the 215 economy bundle, exactly the 215 slot budget. */
  economyBytes: SESSION_ARCHIVE_ECONOMY_LIMITS.economyBytes,
  /** Canonical UTF-8 bytes of the character slot. */
  characterBytes: PERSISTENCE_LIMITS.maxBodyBytes / 4,
  /** Sum of the three slots. */
  maxTotalBytes: SESSION_ARCHIVE_ECONOMY_LIMITS.maxTotalBytes + PERSISTENCE_LIMITS.maxBodyBytes / 4,
  /** Vehicle entities one session may name; the 206 snapshot already caps the world at 128. */
  maxVehicleIds: WORLD_SNAPSHOT_LIMITS.maxVehicles,
  /** Nesting depth accepted by the reader. */
  maxDepth: SESSION_ARCHIVE_ECONOMY_LIMITS.maxDepth + 4,
});

/** Where the game resumes after a reload: paused, automatic, with the input released. */
export const WALKING_SAVE_LAUNCH = Object.freeze({
  mode: 'PAUSED_AUTO' as const,
  paused: true as const,
  auto: true as const,
  inputReleased: true as const,
  /** 193's restore neutralises every held key, so no key is active after a reload. */
  heldKeysActive: 0 as const,
  /** This layer creates no body of any kind; the character and the cars are restored by owners. */
  bodiesCreated: 0 as const,
});

/** Codes that exist only at this boundary. */
export const walkingSaveBoundaryCodes = [
  'ALREADY_CURRENT',
  'LEGACY_WALKING_SAVE',
  'MIGRATION_CORRUPTED',
  'CHARACTER_INVALID',
  'CHARACTER_DEFAULT_TARGET_MISSING',
  'SPAWN_REQUIRED',
  'SPAWN_BLOCKED',
  'TICK_MISMATCH',
  'AUTHORITY_MISMATCH',
  'CAMERA_AUTHORITY_MISMATCH',
  'BODY_MISMATCH',
  'ENTITY_SET_MISMATCH',
  'ENTITY_REFERENCE_MISSING',
] as const;
export type WalkingSaveBoundaryCode = (typeof walkingSaveBoundaryCodes)[number];

/** Closed refusal vocabulary: every 135 and 215 code plus this boundary. */
export type WalkingSaveCode =
  SessionArchiveRejectionCode | SessionArchiveEconomyCode | WalkingSaveBoundaryCode;

export interface WalkingSaveRejection {
  readonly code: WalkingSaveCode;
  readonly message: string;
  readonly path: string;
}

export class WalkingSaveError extends Error {
  readonly code: WalkingSaveCode;
  readonly path: string;

  constructor(code: WalkingSaveCode, message: string, path: string) {
    super(message);
    this.name = 'WalkingSaveError';
    this.code = code;
    this.path = path;
  }
}

function fail(code: WalkingSaveCode, message: string, path: string): never {
  throw new WalkingSaveError(code, message, path);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

/* --------------------------------------------------------------- small reads */

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('INVALID_FIELD', 'Expected a plain object', path);
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail('INVALID_FIELD', 'Expected plain data, not a class instance', path);
  }
  return value as Record<string, unknown>;
}

function exact(value: unknown, allowed: readonly string[], path: string): Record<string, unknown> {
  const data = object(value, path);
  for (const key of Object.keys(data)) {
    if (!allowed.includes(key)) fail('UNKNOWN_FIELD', `Unknown field: ${key}`, `${path}.${key}`);
  }
  for (const key of allowed) {
    if (!Object.hasOwn(data, key)) fail('MISSING_FIELD', `Missing field: ${key}`, `${path}.${key}`);
  }
  return data;
}

function identity(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > PERSISTENCE_LIMITS.maxIdCodeUnits
  ) {
    fail('INVALID_IDENTITY', 'Expected a bounded identity', path);
  }
  if (value.trim() !== value) fail('INVALID_IDENTITY', 'The identity must not be padded', path);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) {
      fail('INVALID_IDENTITY', 'Expected a bounded identity', path);
    }
  }
  return value;
}

function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    fail('INVALID_COUNTER', 'Expected a nonnegative safe integer', path);
  }
  return value;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('INVALID_NUMBER', 'Expected a finite number', path);
  }
  return value;
}

function timestamp(value: unknown, path: string): string {
  if (typeof value !== 'string' || !TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value))) {
    fail('INVALID_TIMESTAMP', 'Expected a UTC ISO 8601 timestamp', path);
  }
  return value;
}

function versionText(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > PERSISTENCE_LIMITS.maxTextCodeUnits
  ) {
    fail('INVALID_IDENTITY', 'Expected a bounded version text', path);
  }
  return value;
}

function canonicalText(value: unknown, path: string): string {
  const canonical = canonicalizeJson(value, { maxDepth: WALKING_SAVE_LIMITS.maxDepth });
  if (canonical.status === 'REJECTED') {
    if (canonical.rejection.code === 'UNSAFE_KEY') {
      fail('INVALID_FIELD', canonical.rejection.message, canonical.rejection.path);
    }
    fail(
      'INVALID_FIELD',
      `The ${path} is not canonical: ${canonical.rejection.message}`,
      canonical.rejection.path,
    );
  }
  return canonical.text;
}

function measured(value: unknown, path: string): number {
  try {
    return measureJsonBytes(value, path);
  } catch (error) {
    fail(
      'COMPONENT_TOO_LARGE',
      `The ${path} component cannot be measured within its budget: ${describe(error)}`,
      path,
    );
  }
}

function strictRejection(rejection: StrictJsonRejection): WalkingSaveCode {
  switch (rejection.code) {
    case 'FILE_TOO_LARGE':
      return 'FILE_TOO_LARGE';
    case 'DUPLICATE_KEY':
      return 'DUPLICATE_KEY';
    case 'DEPTH_EXCEEDED':
      return 'DEPTH_EXCEEDED';
    case 'TRAILING_CONTENT':
      return 'TRAILING_CONTENT';
    default:
      return 'PARSE_ERROR';
  }
}

/* -------------------------------------------------------------------- shapes */

export interface WalkingSaveSizes {
  readonly session: number;
  readonly economy: number;
  readonly character: number;
  readonly total: number;
  readonly limit: number;
}

export interface WalkingSaveChecksum {
  readonly algorithm: typeof CHECKSUM_ALGORITHM;
  readonly canonicalization: typeof CANONICALIZATION_VERSION;
  readonly value: string;
}

/** The character slot: the single body plus the four owner states that describe it. */
export interface WalkingSaveCharacterState {
  readonly version: typeof WALKING_CHARACTER_VERSION;
  readonly source: WalkingCharacterSource;
  readonly sessionId: string;
  readonly playerId: string;
  readonly worldEpoch: number;
  /** Session tick shared by the authority and the camera; the save tick of the whole slot. */
  readonly tick: number;
  /** Tick of the 192 walker that owns the body; never larger than the session tick. */
  readonly characterTick: number;
  readonly authority: InputAuthoritySnapshot;
  readonly camera: CharacterCameraSnapshot;
  readonly segments: WalkingSegmentsState;
  readonly fleet: FleetSwitchState;
  /** Every vehicle entity the session knew; the body count is `1 + vehicleIds.length`. */
  readonly vehicleIds: readonly string[];
}

export interface WalkingSaveDocument {
  readonly format: typeof SESSION_ARCHIVE_FORMAT;
  readonly formatVersion: typeof WALKING_SAVE_FORMAT_VERSION;
  readonly schemaVersion: typeof WALKING_SAVE_SCHEMA_VERSION;
  readonly units: 'SI';
  readonly createdAt: string;
  readonly versions: SessionArchiveVersions;
  readonly session: SessionArchiveSession;
  readonly components: Readonly<{
    session: SessionArchiveDocument;
    economy: EconomySaveDocument | null;
    character: WalkingSaveCharacterState;
  }>;
  readonly sizes: WalkingSaveSizes;
  readonly checksum: WalkingSaveChecksum;
}

/* ------------------------------------------------------------------ checksum */

function checksumPayload(document: Omit<WalkingSaveDocument, 'checksum'>): unknown {
  return {
    format: document.format,
    formatVersion: document.formatVersion,
    schemaVersion: document.schemaVersion,
    units: document.units,
    createdAt: document.createdAt,
    versions: document.versions,
    session: document.session,
    components: document.components,
    sizes: document.sizes,
  };
}

/** The same formula over the raw envelope fields, before any of them is interpreted. */
function envelopeChecksum(data: Record<string, unknown>): string {
  return sha256Hex(
    canonicalText(
      {
        format: data.format,
        formatVersion: data.formatVersion,
        schemaVersion: data.schemaVersion,
        units: data.units,
        createdAt: data.createdAt,
        versions: data.versions,
        session: data.session,
        components: data.components,
        sizes: data.sizes,
      },
      'checksum',
    ),
  );
}

/**
 * The `SHA-256` checksum of the version 3 envelope, over the `SDA-CJSON-1` canonical form of the
 * document without its top-level checksum. The builder and the reader call this one function.
 */
export function computeWalkingSaveChecksum(
  document: Omit<WalkingSaveDocument, 'checksum'> | WalkingSaveDocument,
): string {
  return sha256Hex(canonicalText(checksumPayload(document as WalkingSaveDocument), 'checksum'));
}

export function stampWalkingSaveChecksum(
  document: Omit<WalkingSaveDocument, 'checksum'> | WalkingSaveDocument,
): WalkingSaveDocument {
  const payload = document as Omit<WalkingSaveDocument, 'checksum'>;
  return Object.freeze({
    ...payload,
    checksum: Object.freeze({
      algorithm: CHECKSUM_ALGORITHM,
      canonicalization: CANONICALIZATION_VERSION,
      value: computeWalkingSaveChecksum(payload),
    }),
  });
}

/** Canonical digest of the whole document, for the evidence transcript. */
export function walkingSaveDigest(document: WalkingSaveDocument): string {
  return sha256Hex(canonicalText(document, 'document'));
}

/** Canonical digest of each slot, used to prove bit identity across a migration. */
export function walkingSaveComponentDigests(
  document: WalkingSaveDocument,
): Readonly<Record<WalkingSaveComponentName, string>> {
  return Object.freeze({
    session: sha256Hex(canonicalText(document.components.session, 'components.session')),
    economy: sha256Hex(canonicalText(document.components.economy, 'components.economy')),
    character: sha256Hex(canonicalText(document.components.character, 'components.character')),
  });
}

/* --------------------------------------------------------------- size ledger */

export function walkingSaveSizes(
  session: SessionArchiveDocument,
  economy: EconomySaveDocument | null,
  character: WalkingSaveCharacterState,
  limit: number = WALKING_SAVE_LIMITS.maxTotalBytes,
): WalkingSaveSizes {
  const sessionBytes = measured(session, 'components.session');
  const economyBytes = measured(economy, 'components.economy');
  const characterBytes = measured(character, 'components.character');
  return Object.freeze({
    session: sessionBytes,
    economy: economyBytes,
    character: characterBytes,
    total: sessionBytes + economyBytes + characterBytes,
    limit,
  });
}

function enforceBudgets(sizes: WalkingSaveSizes): void {
  if (sizes.session > WALKING_SAVE_LIMITS.sessionBytes) {
    fail(
      'COMPONENT_TOO_LARGE',
      `The session slot has ${sizes.session} bytes, above its ${WALKING_SAVE_LIMITS.sessionBytes} byte budget`,
      'sizes.session',
    );
  }
  if (sizes.economy > WALKING_SAVE_LIMITS.economyBytes) {
    fail(
      'COMPONENT_TOO_LARGE',
      `The economy slot has ${sizes.economy} bytes, above its ${WALKING_SAVE_LIMITS.economyBytes} byte budget`,
      'sizes.economy',
    );
  }
  if (sizes.character > WALKING_SAVE_LIMITS.characterBytes) {
    fail(
      'COMPONENT_TOO_LARGE',
      `The character slot has ${sizes.character} bytes, above its ${WALKING_SAVE_LIMITS.characterBytes} byte budget`,
      'sizes.character',
    );
  }
  if (sizes.total > sizes.limit || sizes.limit > WALKING_SAVE_LIMITS.maxTotalBytes) {
    fail(
      'FILE_TOO_LARGE',
      `The version 3 archive declares ${sizes.total} bytes against a ${sizes.limit} byte limit`,
      'sizes.total',
    );
  }
}

/* ---------------------------------------------------- character slot readers */

/**
 * A throwaway camera frame used only as a container for the 194 strict parser.
 *
 * `CharacterCamera.restore` is world-independent: it validates the snapshot and never samples the
 * world. The slot therefore does not need the caller's map to be read, and the frame is never
 * stored, published or reported.
 */
const CAMERA_VALIDATION_WORLD: CharacterCameraWorld = Object.freeze({
  minX: -10_000,
  maxX: 10_000,
  minZ: -10_000,
  maxZ: 10_000,
  groundM: 0,
});

const VALIDATION_PLAYER_ID = 'walking-save-validation';

function readAuthorityReference(value: unknown, path: string): InputAuthority {
  const data = object(value, path);
  if (data.consumer === 'CHARACTER') {
    const fields = exact(data, ['consumer', 'characterId'], path);
    return Object.freeze({
      consumer: 'CHARACTER' as const,
      characterId: identity(fields.characterId, `${path}.characterId`),
    });
  }
  if (data.consumer === 'VEHICLE') {
    const fields = exact(data, ['consumer', 'vehicleId'], path);
    return Object.freeze({
      consumer: 'VEHICLE' as const,
      vehicleId: identity(fields.vehicleId, `${path}.vehicleId`),
    });
  }
  return fail('AUTHORITY_MISMATCH', 'The authority must name a character or a vehicle', path);
}

function authorityEntityId(authority: InputAuthority): string {
  return authority.consumer === 'CHARACTER' ? authority.characterId : authority.vehicleId;
}

function sameAuthority(left: InputAuthority, right: InputAuthority): boolean {
  return left.consumer === right.consumer && authorityEntityId(left) === authorityEntityId(right);
}

/** The 193 strict inverse, reused through a throwaway arbiter; no clock, no port, no delivery. */
function restoreAuthority(
  snapshot: unknown,
  session: WalkingSaveExpectation,
): InputAuthoritySnapshot {
  const authority = readAuthorityReference(
    object(snapshot, 'authority').authority,
    'authority.authority',
  );
  const arbiter = createInputAuthorityArbiter({
    context: Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: session.sessionId,
      worldEpoch: session.worldEpoch,
    }),
    authority,
  });
  try {
    arbiter.restore(snapshot);
    return arbiter.snapshot();
  } finally {
    arbiter.dispose();
  }
}

/** The 194 strict inverse, reused through a throwaway camera; the frame never leaves this call. */
function restoreCamera(snapshot: unknown): CharacterCameraSnapshot {
  const camera = createCharacterCamera({
    world: CAMERA_VALIDATION_WORLD,
    control: createDefaultSettings(VALIDATION_PLAYER_ID).input.control,
  });
  camera.restore(snapshot);
  return camera.snapshot();
}

function readVehicleIds(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) fail('INVALID_FIELD', 'Expected the vehicle entity list', path);
  if (value.length > WALKING_SAVE_LIMITS.maxVehicleIds) {
    fail(
      'INVALID_COUNTER',
      `The session names ${value.length} vehicles, above the ${WALKING_SAVE_LIMITS.maxVehicleIds} budget`,
      path,
    );
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const [index, entry] of value.entries()) {
    const id = identity(entry, `${path}[${index}]`);
    if (seen.has(id)) {
      fail('INVALID_IDENTITY', `Duplicate vehicle entity ${id}`, `${path}[${index}]`);
    }
    seen.add(id);
    ids.push(id);
  }
  return Object.freeze([...ids].sort());
}

/** The identities a character slot accepts: its own body first, then every known vehicle. */
function knownEntityIds(characterId: string, vehicleIds: readonly string[]): readonly string[] {
  return Object.freeze([...new Set([characterId, ...vehicleIds])].sort());
}

function sameBody(left: FleetCharacterBody, right: FleetCharacterBody): boolean {
  return (
    left.entityId === right.entityId &&
    left.yawRad === right.yawRad &&
    left.positionM.x === right.positionM.x &&
    left.positionM.y === right.positionM.y &&
    left.positionM.z === right.positionM.z
  );
}

export interface WalkingSaveExpectation {
  readonly sessionId: string;
  readonly playerId: string;
  readonly worldEpoch: number;
  /** The live vehicle entities; when given, the set must be exactly the saved one. */
  readonly vehicleIds?: readonly string[];
}

/**
 * Strict reader of the character slot.
 *
 * The four owner documents are validated by their own inverses (193 `restore`, 194 `restore`,
 * 197 `parseFleetSwitchState`, 198 `parseWalkingSegmentsState`); this function adds only the
 * cross-checks no single owner can make: one session, one tick, one body, one authority, and a
 * camera that watches exactly the entity the authority (or an explicit 197 focus) names.
 */
export function readWalkingCharacterState(
  value: unknown,
  expect: WalkingSaveExpectation,
): WalkingSaveCharacterState {
  const fields = [
    'version',
    'source',
    'sessionId',
    'playerId',
    'worldEpoch',
    'tick',
    'characterTick',
    'authority',
    'camera',
    'segments',
    'fleet',
    'vehicleIds',
  ] as const;
  const data = exact(value, fields, 'character');
  if (data.version !== WALKING_CHARACTER_VERSION) {
    fail(
      'CHARACTER_INVALID',
      `Unsupported character slot version: ${String(data.version)}`,
      'character.version',
    );
  }
  if (!(walkingCharacterSources as readonly unknown[]).includes(data.source)) {
    fail('CHARACTER_INVALID', 'Unknown character slot provenance', 'character.source');
  }
  const sessionId = identity(data.sessionId, 'character.sessionId');
  const playerId = identity(data.playerId, 'character.playerId');
  const worldEpoch = integer(data.worldEpoch, 'character.worldEpoch');
  if (
    sessionId !== expect.sessionId ||
    playerId !== expect.playerId ||
    worldEpoch !== expect.worldEpoch
  ) {
    fail(
      'SESSION_MISMATCH',
      `The character slot belongs to ${sessionId}/${playerId}/${worldEpoch}, not ${expect.sessionId}/${expect.playerId}/${expect.worldEpoch}`,
      'character',
    );
  }
  const tick = integer(data.tick, 'character.tick');
  const characterTick = integer(data.characterTick, 'character.characterTick');
  if (characterTick > tick) {
    fail(
      'TICK_MISMATCH',
      `The walker tick ${characterTick} is ahead of the session tick ${tick}`,
      'character.characterTick',
    );
  }
  const vehicleIds = readVehicleIds(data.vehicleIds, 'character.vehicleIds');

  let fleet: FleetSwitchState;
  try {
    fleet = parseFleetSwitchState(data.fleet);
  } catch (error) {
    if (error instanceof FleetSwitchError) {
      fail('CHARACTER_INVALID', `The fleet state is invalid: ${error.message}`, 'character.fleet');
    }
    throw error;
  }
  const body = fleet.character;

  let authority: InputAuthoritySnapshot;
  try {
    authority = restoreAuthority(data.authority, { sessionId, playerId, worldEpoch });
  } catch (error) {
    if (error instanceof InputAuthorityError) {
      fail(
        'CHARACTER_INVALID',
        `The authority state is invalid: ${error.message}`,
        'character.authority',
      );
    }
    throw error;
  }

  let camera: CharacterCameraSnapshot;
  try {
    camera = restoreCamera(data.camera);
  } catch (error) {
    if (error instanceof CharacterCameraError) {
      fail(
        'CHARACTER_INVALID',
        `The camera state is invalid: ${error.message}`,
        'character.camera',
      );
    }
    throw error;
  }

  let segments: WalkingSegmentsState;
  try {
    segments = parseWalkingSegmentsState(data.segments);
  } catch (error) {
    if (error instanceof WalkingSegmentsError) {
      fail(
        'CHARACTER_INVALID',
        `The walking segment state is invalid: ${error.message}`,
        'character.segments',
      );
    }
    throw error;
  }

  if (authority.tick !== tick) {
    fail(
      'TICK_MISMATCH',
      `The authority is at tick ${authority.tick}, not the slot tick ${tick}`,
      'character.authority.tick',
    );
  }
  if (camera.tick !== tick) {
    fail(
      'TICK_MISMATCH',
      `The camera is at tick ${camera.tick}, not the slot tick ${tick}`,
      'character.camera.tick',
    );
  }
  if (segments.tick > tick) {
    fail(
      'TICK_MISMATCH',
      `The segment model is at tick ${segments.tick}, ahead of the slot tick ${tick}`,
      'character.segments.tick',
    );
  }
  if (fleet.tick > tick) {
    fail(
      'TICK_MISMATCH',
      `The fleet model is at tick ${fleet.tick}, ahead of the slot tick ${tick}`,
      'character.fleet.tick',
    );
  }
  if (fleet.focusSinceTick !== null && fleet.focusSinceTick > tick) {
    fail(
      'TICK_MISMATCH',
      'The fleet focus starts after the save tick',
      'character.fleet.focusSinceTick',
    );
  }
  if (!sameAuthority(authority.authority, fleet.authority)) {
    fail(
      'AUTHORITY_MISMATCH',
      'The 193 authority and the 197 fleet state name different entities',
      'character.fleet.authority',
    );
  }
  const authorityId = authorityEntityId(authority.authority);
  if (authority.authority.consumer === 'CHARACTER' && authorityId !== body.entityId) {
    fail(
      'AUTHORITY_MISMATCH',
      `The authority names character ${authorityId}, the body is ${body.entityId}`,
      'character.authority.authority.characterId',
    );
  }
  if (authority.authority.consumer === 'VEHICLE' && !vehicleIds.includes(authorityId)) {
    fail(
      'ENTITY_REFERENCE_MISSING',
      `The controlled vehicle ${authorityId} is not in the saved entity set`,
      'character.authority.authority.vehicleId',
    );
  }
  if (segments.characterId !== body.entityId) {
    fail(
      'BODY_MISMATCH',
      `The segment model belongs to ${segments.characterId}, the body is ${body.entityId}`,
      'character.segments.characterId',
    );
  }
  if (
    segments.target.sessionId !== sessionId ||
    segments.target.playerId !== playerId ||
    segments.target.worldEpoch !== worldEpoch
  ) {
    fail(
      'SESSION_MISMATCH',
      'The segment target belongs to another session, player or world epoch',
      'character.segments.target',
    );
  }
  if (segments.open !== null && !vehicleIds.includes(segments.open.vehicleId)) {
    fail(
      'ENTITY_REFERENCE_MISSING',
      `The open segment names vehicle ${segments.open.vehicleId}, which is not in the saved entity set`,
      'character.segments.open.vehicleId',
    );
  }
  const cameraEntityId = fleet.focusEntityId ?? authorityId;
  if (camera.entityId !== cameraEntityId) {
    fail(
      'CAMERA_AUTHORITY_MISMATCH',
      `The camera watches ${String(camera.entityId)}, the authority target is ${cameraEntityId}`,
      'character.camera.entityId',
    );
  }
  if (!camera.knownEntityIds.includes(cameraEntityId)) {
    fail(
      'CAMERA_AUTHORITY_MISMATCH',
      'The camera target is not a known entity of the camera',
      'character.camera.knownEntityIds',
    );
  }
  const allowed = new Set<string>([body.entityId, ...vehicleIds]);
  for (const id of camera.knownEntityIds) {
    if (!allowed.has(id)) {
      fail(
        'ENTITY_REFERENCE_MISSING',
        `The camera knows ${id}, which is not the body and not a saved vehicle`,
        'character.camera.knownEntityIds',
      );
    }
  }
  if (expect.vehicleIds !== undefined) {
    const live = readVehicleIds(expect.vehicleIds, 'expect.vehicleIds');
    if (live.length !== vehicleIds.length) {
      fail(
        'ENTITY_SET_MISMATCH',
        `The live world has ${live.length} vehicle(s), the save has ${vehicleIds.length}`,
        'character.vehicleIds',
      );
    }
    for (const [index, id] of live.entries()) {
      if (vehicleIds[index] !== id) {
        fail(
          'ENTITY_SET_MISMATCH',
          `The live vehicle set differs from the save at ${index}: ${id}`,
          'character.vehicleIds',
        );
      }
    }
  }

  return Object.freeze({
    version: WALKING_CHARACTER_VERSION,
    source: data.source as WalkingCharacterSource,
    sessionId,
    playerId,
    worldEpoch,
    tick,
    characterTick,
    authority,
    camera,
    segments,
    fleet,
    vehicleIds,
  });
}

/* --------------------------------------------------------- character builders */

export interface WalkingCharacterSnapshotInput {
  readonly sessionId: string;
  readonly playerId: string;
  readonly worldEpoch: number;
  /** The session tick the authority and the camera were at. */
  readonly tick: number;
  /** The real 192 walker state fields; the body itself is `fleet.character`. */
  readonly character: Readonly<{
    entityId: string;
    tick: number;
    positionM: CharacterPoint;
    yawRad: number;
  }>;
  readonly authority: InputAuthoritySnapshot;
  readonly camera: CharacterCameraSnapshot;
  readonly segments: WalkingSegmentsState;
  readonly fleet: FleetSwitchState;
  readonly vehicleIds: readonly string[];
}

/**
 * Builds the character slot from live owner states.
 *
 * The walker and the fleet model both describe one body, so their identity, position and yaw must
 * agree exactly (IEEE `===`, no tolerance): a disagreement is `BODY_MISMATCH`, never a silent pick.
 * The composed slot then goes through the strict reader, so the builder cannot emit a document the
 * reload would refuse.
 */
export function walkingCharacterSnapshot(
  input: WalkingCharacterSnapshotInput,
): WalkingSaveCharacterState {
  const walker: FleetCharacterBody = Object.freeze({
    entityId: identity(input.character.entityId, 'character.entityId'),
    positionM: Object.freeze({
      x: finite(input.character.positionM.x, 'character.positionM.x'),
      y: finite(input.character.positionM.y, 'character.positionM.y'),
      z: finite(input.character.positionM.z, 'character.positionM.z'),
    }),
    yawRad: finite(input.character.yawRad, 'character.yawRad'),
  });
  if (!sameBody(walker, input.fleet.character)) {
    fail(
      'BODY_MISMATCH',
      'The 192 walker and the 197 fleet state describe different character bodies',
      'character.fleet.character',
    );
  }
  return readWalkingCharacterState(
    {
      version: WALKING_CHARACTER_VERSION,
      source: 'SNAPSHOT' as const,
      sessionId: input.sessionId,
      playerId: input.playerId,
      worldEpoch: input.worldEpoch,
      tick: input.tick,
      characterTick: input.character.tick,
      authority: input.authority,
      camera: input.camera,
      segments: input.segments,
      fleet: input.fleet,
      vehicleIds: input.vehicleIds,
    },
    {
      sessionId: input.sessionId,
      playerId: input.playerId,
      worldEpoch: input.worldEpoch,
    },
  );
}

export interface WalkingCharacterMigrationInput {
  readonly session: SessionArchiveSession;
  /** The already validated 135 document this slot is added to. */
  readonly archive: SessionArchiveValidationAccepted;
  /** The authored walk spawn of the session, in world metres and radians. */
  readonly spawn: Readonly<{ positionM: CharacterPoint; yawRad: number }> | null;
  /** The real 192 walk world; the spawn is accepted only if the walker accepts it. */
  readonly walkWorld: WalkWorld;
  readonly characterId: string;
  /** Defaults to the vehicles of the session's world checkpoint. */
  readonly vehicleIds?: readonly string[];
  /** Defaults to the world checkpoint tick. */
  readonly tick?: number;
  /** Defaults to the session's own profile generation. */
  readonly target?: WalkingSegmentsTarget;
}

/**
 * The documented migration rule for a session that has no character slot.
 *
 * 1. **Body.** The authored walk spawn, accepted only if the real 192 walker accepts it on the real
 *    walk world (`SPAWN_BLOCKED` otherwise; a missing or non-finite spawn is `SPAWN_REQUIRED`).
 *    Nothing is inferred from nothing: the point must already be a legal standing point.
 * 2. **Authority.** `CHARACTER:<characterId>`, with no key held, so no acceleration can survive.
 * 3. **Camera.** On that same character, at the same tick, with the 194 default orbit and the
 *    session's own 009 control preferences; no first frame is claimed (`positionM` stays null).
 * 4. **Segments.** The 198 target is the session's profile generation (`profileId`,
 *    `activeVersionId`, `learningEpoch`); a session without one binds the target to its own
 *    identity (`profileId = playerId`, `baseVersionId = sessionId`), so no invented profile id is
 *    written. The model starts empty at the save tick: zero walking ticks, zero segments, zero
 *    candidates, `learningEligible: false`.
 * 5. **Fleet.** One body at the spawn, no focus and no suspended body.
 */
export function migrationCharacterState(
  input: WalkingCharacterMigrationInput,
): WalkingSaveCharacterState {
  const sessionId = identity(input.session.sessionId, 'character.sessionId');
  const playerId = identity(input.session.playerId, 'character.playerId');
  const worldEpoch = integer(input.session.worldEpoch, 'character.worldEpoch');
  const characterId = identity(input.characterId, 'character.characterId');
  const checkpoint = input.archive.components.checkpoint;
  const profile = input.archive.components.profile;
  const tick = integer(input.tick ?? checkpoint?.tick ?? 0, 'character.tick');

  const vehicleIds = input.vehicleIds ?? checkpointVehicles(checkpoint);
  const spawn = input.spawn;
  if (spawn === null) {
    fail('SPAWN_REQUIRED', 'The migration needs the authored walk spawn', 'character.spawn');
  }
  const positionM = Object.freeze({
    x: finite(spawn.positionM.x, 'character.spawn.positionM.x'),
    y: finite(spawn.positionM.y, 'character.spawn.positionM.y'),
    z: finite(spawn.positionM.z, 'character.spawn.positionM.z'),
  });
  const yawRad = finite(spawn.yawRad, 'character.spawn.yawRad');
  // The safe position is the one the real 192 walker accepts: a point inside a solid is refused.
  try {
    createWalker({
      world: input.walkWorld,
      start: { positionM, yawRad },
      entityId: characterId,
    });
  } catch (error) {
    if (error instanceof CharacterContractError) {
      fail(
        'SPAWN_BLOCKED',
        `The authored walk spawn is not a legal standing point: ${error.message}`,
        'character.spawn',
      );
    }
    throw error;
  }

  const target =
    input.target ??
    Object.freeze({
      sessionId,
      worldEpoch,
      playerId,
      profileId: profile?.profileId ?? playerId,
      baseVersionId: profile?.activeVersionId ?? sessionId,
      learningEpoch: checkpoint?.learningEpoch ?? 0,
      learningEligible: false as const,
    });

  const body: FleetCharacterBody = Object.freeze({
    entityId: characterId,
    positionM,
    yawRad,
  });
  const fleet = createFleetSwitchState({
    tick,
    authority: Object.freeze({ consumer: 'CHARACTER' as const, characterId }),
    character: body,
  });

  const control = input.archive.components.settings?.input.control;
  const validationControl = control ?? createDefaultSettings(playerId).input.control;
  const camera = createCharacterCamera({
    world: CAMERA_VALIDATION_WORLD,
    control: validationControl,
  });
  const cameraState = Object.freeze({
    version: CHARACTER_CAMERA_CONTRACT_VERSION,
    tick,
    entityId: characterId,
    previousEntityId: null,
    positionM: null,
    lookAtM: null,
    orbit: CHARACTER_CAMERA_DEFAULT_ORBIT,
    transition: null,
    transitions: 0,
    knownEntityIds: knownEntityIds(characterId, vehicleIds),
    control: Object.freeze({
      cameraMotion: camera.control.cameraMotion,
      fovDegrees: camera.control.fovDegrees,
    }),
  });

  const segments = createWalkingSegments({
    ownerId: playerId,
    characterId,
    target,
  });

  return readWalkingCharacterState(
    {
      version: WALKING_CHARACTER_VERSION,
      source: 'MIGRATION_DEFAULT' as const,
      sessionId,
      playerId,
      worldEpoch,
      tick,
      characterTick: 0,
      authority: {
        version: INPUT_AUTHORITY_CONTRACT_VERSION,
        tick,
        authority: { consumer: 'CHARACTER' as const, characterId },
        held: [],
        neutralized: [],
        transitions: 0,
      },
      camera: cameraState,
      segments: Object.freeze({ ...segments.snapshot(), tick }),
      fleet,
      vehicleIds,
    },
    { sessionId, playerId, worldEpoch },
  );
}

function checkpointVehicles(
  checkpoint: SessionArchiveValidationAccepted['components']['checkpoint'],
): readonly string[] {
  if (checkpoint === null) return Object.freeze([]);
  const snapshot = readWorldSnapshot(checkpoint.body);
  if (snapshot.status === 'REJECTED') {
    fail(
      'CHARACTER_INVALID',
      `The checkpoint snapshot cannot name its vehicles: ${snapshot.rejection.code} at ${snapshot.rejection.path}`,
      'character.vehicleIds',
    );
  }
  return Object.freeze(snapshot.snapshot.vehicles.map((vehicle) => vehicle.entityId).sort());
}

/* --------------------------------------------------------------- composition */

interface ComposedParts {
  readonly archive: SessionArchiveValidationAccepted;
  readonly economy: EconomySaveDocument | null;
  readonly character: WalkingSaveCharacterState;
  readonly createdAt: string;
}

function compose(input: ComposedParts): WalkingSaveDocument {
  const session = input.archive.session;
  const sessionRecord: SessionArchiveSession = Object.freeze({
    sessionId: identity(session.sessionId, 'session.sessionId'),
    playerId: identity(session.playerId, 'session.playerId'),
    worldEpoch: integer(session.worldEpoch, 'session.worldEpoch'),
  });
  const character = readWalkingCharacterState(input.character, sessionRecord);
  const versions = Object.freeze({
    engine: versionText(input.archive.document.versions.engine, 'versions.engine'),
    physics: versionText(input.archive.document.versions.physics, 'versions.physics'),
    map: versionText(input.archive.document.versions.map, 'versions.map'),
  });
  const sizes = walkingSaveSizes(input.archive.document, input.economy, character);
  enforceBudgets(sizes);
  const document = stampWalkingSaveChecksum({
    format: SESSION_ARCHIVE_FORMAT,
    formatVersion: WALKING_SAVE_FORMAT_VERSION,
    schemaVersion: WALKING_SAVE_SCHEMA_VERSION,
    units: 'SI' as const,
    createdAt: timestamp(input.createdAt, 'createdAt'),
    versions,
    session: sessionRecord,
    components: Object.freeze({
      session: input.archive.document,
      economy: input.economy,
      character,
    }),
    sizes,
  });
  const canonical = canonicalText(document, '$');
  if (canonical.length > WALKING_SAVE_LIMITS.maxFileBytes) {
    fail(
      'FILE_TOO_LARGE',
      `The version 3 archive has ${canonical.length} code units, above the ${WALKING_SAVE_LIMITS.maxFileBytes} budget`,
      '$',
    );
  }
  return document;
}

function emptyCounts(): SessionArchiveEconomyCounts {
  return Object.freeze({
    settlements: 0,
    reviews: 0,
    kpiDays: 0,
    xpBalance: 0,
    xpBalanceMicroXp: 0,
    level: 0,
    dailyRewards: 0,
    historyScans: 0 as const,
    debits: 0 as const,
    negativeCredits: false as const,
  });
}

function countsOf(validation: EconomySaveValidation | null): SessionArchiveEconomyCounts {
  if (validation === null || validation.status === 'REJECTED') return emptyCounts();
  const counts = validation.counts;
  return Object.freeze({
    settlements: counts.settlements,
    reviews: counts.reviews,
    kpiDays: counts.kpiDays,
    xpBalance: counts.xpBalance,
    xpBalanceMicroXp: counts.xpBalanceMicroXp,
    level: counts.level,
    dailyRewards: counts.dailyRewards,
    historyScans: 0 as const,
    debits: 0 as const,
    negativeCredits: false as const,
  });
}

/* ------------------------------------------------------------------- builder */

export interface WalkingSaveBuildInput {
  /** The real 135 document; it is re-read by its own reader before anything is written. */
  readonly archive: SessionArchiveDocument;
  readonly economy: EconomySaveDocument | null;
  readonly character: WalkingSaveCharacterState;
  readonly createdAt: string;
  readonly catalog: unknown;
}

export interface WalkingSaveBuildAccepted {
  readonly version: typeof WALKING_SAVE_VERSION;
  readonly status: 'ACCEPTED';
  readonly document: WalkingSaveDocument;
  readonly checksum: string;
  readonly sizes: WalkingSaveSizes;
  readonly counts: SessionArchiveEconomyCounts;
  readonly bytes: number;
  readonly rejection: null;
}

export interface WalkingSaveBuildRejected {
  readonly version: typeof WALKING_SAVE_VERSION;
  readonly status: 'REJECTED';
  readonly document: null;
  readonly checksum: null;
  readonly sizes: null;
  readonly counts: null;
  readonly bytes: 0;
  readonly rejection: WalkingSaveRejection;
}

export type WalkingSaveBuildResult = WalkingSaveBuildAccepted | WalkingSaveBuildRejected;

function rejectedBuild(rejection: WalkingSaveRejection): WalkingSaveBuildRejected {
  return Object.freeze({
    version: WALKING_SAVE_VERSION,
    status: 'REJECTED' as const,
    document: null,
    checksum: null,
    sizes: null,
    counts: null,
    bytes: 0 as const,
    rejection: Object.freeze(rejection),
  });
}

function rejectionOf(error: unknown, path = '$'): WalkingSaveRejection {
  if (error instanceof WalkingSaveError) {
    return Object.freeze({ code: error.code, message: error.message, path: error.path });
  }
  return Object.freeze({
    code: 'INVALID_FIELD' as const,
    message: describe(error),
    path,
  });
}

function acceptedBuild(
  document: WalkingSaveDocument,
  counts: SessionArchiveEconomyCounts,
): WalkingSaveBuildAccepted {
  return Object.freeze({
    version: WALKING_SAVE_VERSION,
    status: 'ACCEPTED' as const,
    document,
    checksum: document.checksum.value,
    sizes: document.sizes,
    counts,
    bytes: canonicalText(document, '$').length,
    rejection: null,
  });
}

/** Builds a version 3 document from the delivered component documents. */
export function buildWalkingSave(input: WalkingSaveBuildInput): WalkingSaveBuildResult {
  try {
    if (typeof input !== 'object' || input === null) {
      fail('INVALID_FIELD', 'Build input is required', '$');
    }
    const session = object(input.archive, 'archive').session;
    const expect = {
      sessionId: identity(
        object(session, 'archive.session').sessionId,
        'archive.session.sessionId',
      ),
      playerId: identity(object(session, 'archive.session').playerId, 'archive.session.playerId'),
      catalog: input.catalog,
    };
    const archive = readSessionArchive(input.archive, expect);
    if (archive.status === 'REJECTED') {
      fail(archive.rejection.code, archive.rejection.message, archive.rejection.path);
    }
    let economy: EconomySaveDocument | null = null;
    let economyValidation: EconomySaveValidation | null = null;
    if (input.economy !== null) {
      const read = readEconomySave(input.economy, {
        sessionId: archive.session.sessionId,
        playerId: archive.session.playerId,
        worldEpoch: archive.session.worldEpoch,
      });
      if (read.status === 'REJECTED') {
        fail(read.rejection.code, read.rejection.message, read.rejection.path);
      }
      economy = read.document;
      economyValidation = read;
    }
    const document = compose({
      archive,
      economy,
      character: input.character,
      createdAt: input.createdAt,
    });
    return acceptedBuild(document, countsOf(economyValidation));
  } catch (error) {
    return rejectedBuild(rejectionOf(error));
  }
}

/* ----------------------------------------------------------------- migration */

export interface WalkingSaveMigrationOptions {
  readonly createdAt: string;
  readonly catalog: unknown;
  readonly expect: {
    readonly sessionId: string;
    readonly playerId: string;
    readonly versions?: Partial<SessionArchiveVersions>;
  };
  /** An already captured character slot; when absent, the documented migration rule is used. */
  readonly character?: WalkingSaveCharacterState | null;
  readonly spawn?: Readonly<{ positionM: CharacterPoint; yawRad: number }> | null;
  readonly walkWorld?: WalkWorld;
  readonly characterId?: string;
  readonly vehicleIds?: readonly string[];
  readonly tick?: number;
  readonly target?: WalkingSegmentsTarget;
}

function readArchiveInput(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  const parsed = parseStrictJson(input, {
    maxBytes: WALKING_SAVE_LIMITS.maxFileBytes,
    maxDepth: WALKING_SAVE_LIMITS.maxDepth,
  });
  if (parsed.status === 'REJECTED') {
    const code = strictRejection(parsed.rejection);
    throw new WalkingSaveError(code, parsed.rejection.message, parsed.rejection.path);
  }
  return parsed.value;
}

/**
 * Migrates a version 1 or version 2 session archive to version 3.
 *
 * The two delivered slots are carried unchanged: `components.session` is the very document 135
 * produced and `components.economy` the very bundle 215 produced, each with its own checksum, so
 * the world, the KPI buckets, the daily calendar and the XP ledger keep their bytes. The migration
 * proves that by digesting every carried slot before and after and refusing a difference; the
 * returned `migration` block is the transcript of that check.
 *
 * The character slot is either the one the caller already captured (validated against the session)
 * or the documented `MIGRATION_DEFAULT` state. A version 3 input is refused as `ALREADY_CURRENT`:
 * it is not older data. Nothing is written: this function has no port.
 */
export function upgradeWalkingSave(
  input: unknown,
  options: WalkingSaveMigrationOptions,
): WalkingSaveBuildResult {
  try {
    const value = readArchiveInput(input);
    const envelope = object(value, '$');
    if (envelope.format !== SESSION_ARCHIVE_FORMAT) {
      fail(
        'UNSUPPORTED_FORMAT',
        `Unsupported archive format: ${String(envelope.format)}`,
        'format',
      );
    }
    if (envelope.formatVersion === WALKING_SAVE_FORMAT_VERSION) {
      fail(
        'ALREADY_CURRENT',
        'The document already declares format version 3; it is not older data',
        'formatVersion',
      );
    }
    const source = readSessionArchiveWithEconomy(value, {
      sessionId: options.expect.sessionId,
      playerId: options.expect.playerId,
      catalog: options.catalog,
      ...(options.expect.versions === undefined ? {} : { versions: options.expect.versions }),
    });
    if (source.status === 'REJECTED') {
      fail(source.rejection.code, source.rejection.message, source.rejection.path);
    }
    const legacy = source.status === 'LEGACY';
    const archive = source.archive;
    const economyDocument = legacy ? null : (source.document?.components.economy ?? null);
    const character =
      options.character ??
      migrationCharacterState({
        session: archive.session,
        archive,
        spawn: options.spawn ?? null,
        walkWorld: requireWalkWorld(options.walkWorld),
        characterId: requireCharacterId(options.characterId),
        ...(options.vehicleIds === undefined ? {} : { vehicleIds: options.vehicleIds }),
        ...(options.tick === undefined ? {} : { tick: options.tick }),
        ...(options.target === undefined ? {} : { target: options.target }),
      });
    const compared = compareCarriedComponents(archive.document, economyDocument, character);
    const document = compose({
      archive,
      economy: economyDocument,
      character,
      createdAt: options.createdAt,
    });
    const after = compareCarriedComponents(
      document.components.session,
      document.components.economy,
      document.components.character,
    );
    if (compared.session !== after.session || compared.economy !== after.economy) {
      fail(
        'MIGRATION_CORRUPTED',
        'A carried component changed during the migration; nothing was migrated',
        'components',
      );
    }
    return acceptedBuild(document, legacy ? emptyCounts() : countsOf(source.economyValidation));
  } catch (error) {
    return rejectedBuild(rejectionOf(error));
  }
}

function compareCarriedComponents(
  session: SessionArchiveDocument,
  economy: EconomySaveDocument | null,
  character: WalkingSaveCharacterState,
): Readonly<Record<WalkingSaveComponentName, string>> {
  return Object.freeze({
    session: sha256Hex(canonicalText(session, 'components.session')),
    economy: sha256Hex(canonicalText(economy, 'components.economy')),
    character: sha256Hex(canonicalText(character, 'components.character')),
  });
}

function requireWalkWorld(world: WalkWorld | undefined): WalkWorld {
  if (world === undefined) {
    fail('SPAWN_REQUIRED', 'The migration needs the walk world to validate the spawn', 'spawn');
  }
  return world;
}

function requireCharacterId(characterId: string | undefined): string {
  if (characterId === undefined) {
    fail('SPAWN_REQUIRED', 'The migration needs the character entity id', 'characterId');
  }
  return characterId;
}

/* -------------------------------------------------------------------- reader */

export interface WalkingSaveAccepted {
  readonly version: typeof WALKING_SAVE_VERSION;
  readonly status: 'ACCEPTED';
  readonly formatVersion: typeof WALKING_SAVE_FORMAT_VERSION;
  readonly document: WalkingSaveDocument;
  readonly checksumVerified: true;
  readonly session: SessionArchiveSession;
  readonly archive: SessionArchiveValidationAccepted;
  readonly economy: EconomySaveDocument | null;
  readonly economyValidation: EconomySaveValidation | null;
  readonly character: WalkingSaveCharacterState;
  readonly sizes: WalkingSaveSizes;
  readonly counts: SessionArchiveEconomyCounts;
  readonly bytes: number;
  readonly rejection: null;
}

export interface WalkingSaveRejected {
  readonly version: typeof WALKING_SAVE_VERSION;
  readonly status: 'REJECTED';
  readonly formatVersion: null;
  readonly document: null;
  readonly checksumVerified: false;
  readonly session: null;
  readonly archive: null;
  readonly economy: null;
  readonly economyValidation: null;
  readonly character: null;
  readonly sizes: null;
  readonly counts: null;
  readonly bytes: 0;
  readonly rejection: WalkingSaveRejection;
}

export type WalkingSaveValidation = WalkingSaveAccepted | WalkingSaveRejected;

function rejectedValidation(rejection: WalkingSaveRejection): WalkingSaveRejected {
  return Object.freeze({
    version: WALKING_SAVE_VERSION,
    status: 'REJECTED' as const,
    formatVersion: null,
    document: null,
    checksumVerified: false as const,
    session: null,
    archive: null,
    economy: null,
    economyValidation: null,
    character: null,
    sizes: null,
    counts: null,
    bytes: 0 as const,
    rejection: Object.freeze(rejection),
  });
}

export interface WalkingSaveExpectationInput {
  readonly sessionId: string;
  readonly playerId: string;
  readonly catalog: unknown;
  readonly versions?: Partial<SessionArchiveVersions>;
  /** The live vehicle entities; when given, the set must be exactly the saved one. */
  readonly vehicleIds?: readonly string[];
}

const envelopeFields: readonly string[] = [
  'format',
  'formatVersion',
  'schemaVersion',
  'units',
  'createdAt',
  'versions',
  'session',
  'components',
  'sizes',
  'checksum',
];

const sizeFields = ['session', 'economy', 'character', 'total', 'limit'] as const;

function readVersions(value: unknown): SessionArchiveVersions {
  const data = exact(value, ['engine', 'physics', 'map'], 'versions');
  return Object.freeze({
    engine: versionText(data.engine, 'versions.engine'),
    physics: versionText(data.physics, 'versions.physics'),
    map: versionText(data.map, 'versions.map'),
  });
}

function readSession(value: unknown): SessionArchiveSession {
  const data = exact(value, ['sessionId', 'playerId', 'worldEpoch'], 'session');
  return Object.freeze({
    sessionId: identity(data.sessionId, 'session.sessionId'),
    playerId: identity(data.playerId, 'session.playerId'),
    worldEpoch: integer(data.worldEpoch, 'session.worldEpoch'),
  });
}

function readSizes(value: unknown): WalkingSaveSizes {
  const data = exact(value, sizeFields, 'sizes');
  const sizes: Record<string, number> = Object.create(null);
  for (const field of sizeFields) sizes[field] = integer(data[field], `sizes.${field}`);
  const declared = sizes as unknown as WalkingSaveSizes;
  if (declared.limit !== WALKING_SAVE_LIMITS.maxTotalBytes) {
    fail(
      'SIZE_MISMATCH',
      `The archive declares a ${declared.limit} byte limit; this build accepts ${WALKING_SAVE_LIMITS.maxTotalBytes}`,
      'sizes.limit',
    );
  }
  return Object.freeze(declared);
}

/**
 * Reads a version 3 session archive.
 *
 * Order: byte/depth budget, strict parse, `format`/`formatVersion`, canonical form and byte budget,
 * checksum (algorithm, canonicalisation, value), schema, then every component with its owner's
 * reader, then the declared size ledger. A version 1 or 2 file is refused as `LEGACY_WALKING_SAVE`
 * (it must be migrated first); a newer format is refused before the checksum is interpreted, and a
 * newer schema after it, exactly as Docs/29 asks.
 */
export function readWalkingSave(
  input: unknown,
  expect: WalkingSaveExpectationInput,
): WalkingSaveValidation {
  try {
    const value = readArchiveInput(input);
    const envelope = object(value, '$');
    if (envelope.format !== SESSION_ARCHIVE_FORMAT) {
      fail(
        'UNSUPPORTED_FORMAT',
        `Unsupported archive format: ${String(envelope.format)}`,
        'format',
      );
    }
    const formatVersion = envelope.formatVersion;
    if (typeof formatVersion !== 'number' || !Number.isInteger(formatVersion)) {
      fail('UNSUPPORTED_FORMAT_VERSION', 'Expected an integer format version', 'formatVersion');
    }
    if (formatVersion < WALKING_SAVE_FORMAT_VERSION) {
      fail(
        'LEGACY_WALKING_SAVE',
        `The file declares format version ${formatVersion}; it must be migrated to ${WALKING_SAVE_FORMAT_VERSION} first`,
        'formatVersion',
      );
    }
    if (formatVersion > WALKING_SAVE_FORMAT_VERSION) {
      fail(
        'FORMAT_VERSION_TOO_NEW',
        `The file declares format version ${formatVersion}; this build reads ${WALKING_SAVE_FORMAT_VERSION}`,
        'formatVersion',
      );
    }
    const data = exact(envelope, envelopeFields, '$');
    const canonical = canonicalText(data, '$');
    if (canonical.length > WALKING_SAVE_LIMITS.maxFileBytes) {
      fail(
        'FILE_TOO_LARGE',
        `The version 3 archive has ${canonical.length} code units, above the ${WALKING_SAVE_LIMITS.maxFileBytes} budget`,
        '$',
      );
    }
    const checksumData = exact(
      data.checksum,
      ['algorithm', 'canonicalization', 'value'],
      'checksum',
    );
    if (checksumData.algorithm !== CHECKSUM_ALGORITHM) {
      fail(
        'UNSUPPORTED_ALGORITHM',
        `Unsupported checksum algorithm: ${String(checksumData.algorithm)}`,
        'checksum.algorithm',
      );
    }
    if (checksumData.canonicalization !== CANONICALIZATION_VERSION) {
      fail(
        'UNSUPPORTED_CANONICALIZATION',
        `Unsupported canonicalization: ${String(checksumData.canonicalization)}`,
        'checksum.canonicalization',
      );
    }
    const declaredChecksum = checksumData.value;
    if (typeof declaredChecksum !== 'string' || !SHA256_HEX.test(declaredChecksum)) {
      fail('CHECKSUM_MISMATCH', 'Expected a lowercase SHA-256 checksum', 'checksum.value');
    }
    // The checksum is verified before the schema and before any slot is interpreted, as Docs/29
    // asks: a re-stamped payload still has to pass every component contract, but a schema claim is
    // never trusted over a broken checksum.
    if (envelopeChecksum(data) !== declaredChecksum) {
      fail(
        'CHECKSUM_MISMATCH',
        'The archive was modified or is corrupted; the session was not loaded',
        'checksum.value',
      );
    }
    if (data.units !== 'SI') {
      fail('INVALID_FIELD', 'The archive is stored in SI units only', 'units');
    }
    const createdAt = timestamp(data.createdAt, 'createdAt');
    const versions = readVersions(data.versions);
    const session = readSession(data.session);
    if (session.sessionId !== expect.sessionId || session.playerId !== expect.playerId) {
      fail(
        'SESSION_MISMATCH',
        `The archive belongs to ${session.sessionId}/${session.playerId}, not ${expect.sessionId}/${expect.playerId}`,
        'session',
      );
    }
    if (expect.versions !== undefined) {
      for (const field of ['engine', 'physics', 'map'] as const) {
        const expectedVersion = expect.versions[field];
        if (expectedVersion !== undefined && versions[field] !== expectedVersion) {
          fail(
            'VERSION_MISMATCH',
            `The archive targets ${field} version ${versions[field]}, not ${expectedVersion}`,
            `versions.${field}`,
          );
        }
      }
    }
    if (data.schemaVersion !== WALKING_SAVE_SCHEMA_VERSION) {
      fail(
        typeof data.schemaVersion === 'number' &&
          Number.isSafeInteger(data.schemaVersion) &&
          data.schemaVersion > WALKING_SAVE_SCHEMA_VERSION
          ? 'SCHEMA_TOO_NEW'
          : 'UNSUPPORTED_SCHEMA',
        `Unsupported version 3 archive schema: ${String(data.schemaVersion)}`,
        'schemaVersion',
      );
    }
    const components = exact(data.components, walkingSaveComponents, 'components');
    if (components.session === null) {
      fail(
        'MISSING_FIELD',
        'A version 3 archive needs the 135 session document',
        'components.session',
      );
    }
    const archive = readSessionArchive(components.session, {
      sessionId: session.sessionId,
      playerId: session.playerId,
      catalog: expect.catalog,
    });
    if (archive.status === 'REJECTED') {
      fail(archive.rejection.code, archive.rejection.message, archive.rejection.path);
    }
    if (
      archive.session.sessionId !== session.sessionId ||
      archive.session.playerId !== session.playerId ||
      archive.session.worldEpoch !== session.worldEpoch
    ) {
      fail(
        'SESSION_MISMATCH',
        'The inner 135 session is not the session of the version 3 envelope',
        'components.session.session',
      );
    }
    let economy: EconomySaveDocument | null = null;
    let economyValidation: EconomySaveValidation | null = null;
    if (components.economy !== null) {
      const read = readEconomySave(components.economy, {
        sessionId: session.sessionId,
        playerId: session.playerId,
        worldEpoch: session.worldEpoch,
      });
      if (read.status === 'REJECTED') {
        fail(read.rejection.code, read.rejection.message, read.rejection.path);
      }
      economy = read.document;
      economyValidation = read;
    }
    const character = readWalkingCharacterState(components.character, {
      sessionId: session.sessionId,
      playerId: session.playerId,
      worldEpoch: session.worldEpoch,
      ...(expect.vehicleIds === undefined ? {} : { vehicleIds: expect.vehicleIds }),
    });
    const declaredSizes = readSizes(data.sizes);
    const measuredSizes = walkingSaveSizes(archive.document, economy, character);
    enforceBudgets(measuredSizes);
    for (const field of sizeFields) {
      if (measuredSizes[field] !== declaredSizes[field]) {
        fail(
          'SIZE_MISMATCH',
          `The declared ${field} size is ${declaredSizes[field]}, measured ${measuredSizes[field]}`,
          `sizes.${field}`,
        );
      }
    }
    const document: WalkingSaveDocument = Object.freeze({
      format: SESSION_ARCHIVE_FORMAT,
      formatVersion: WALKING_SAVE_FORMAT_VERSION,
      schemaVersion: WALKING_SAVE_SCHEMA_VERSION,
      units: 'SI',
      createdAt,
      versions,
      session,
      components: Object.freeze({ session: archive.document, economy, character }),
      sizes: measuredSizes,
      checksum: Object.freeze({
        algorithm: CHECKSUM_ALGORITHM,
        canonicalization: CANONICALIZATION_VERSION,
        value: declaredChecksum,
      }),
    });
    return Object.freeze({
      version: WALKING_SAVE_VERSION,
      status: 'ACCEPTED' as const,
      formatVersion: WALKING_SAVE_FORMAT_VERSION,
      document,
      checksumVerified: true as const,
      session,
      archive,
      economy,
      economyValidation,
      character,
      sizes: measuredSizes,
      counts: countsOf(economyValidation),
      bytes: canonical.length,
      rejection: null,
    });
  } catch (error) {
    return rejectedValidation(rejectionOf(error));
  }
}

/* -------------------------------------------------------------------- reload */

export interface WalkingSaveReloadInput {
  /** The vehicle entities of the live world; the set must be exactly the saved one. */
  readonly vehicleIds: readonly string[];
}

export interface WalkingSaveReload {
  readonly launch: typeof WALKING_SAVE_LAUNCH;
  readonly tick: number;
  readonly authority: InputAuthority;
  readonly cameraEntityId: string;
  readonly body: FleetCharacterBody;
  readonly characterTick: number;
  readonly entities: Readonly<{
    characters: 1;
    vehicles: number;
    total: number;
    created: 0;
  }>;
  readonly segments: Readonly<{
    openSegmentId: string | null;
    openKind: 'MANUAL' | 'LEARNING' | null;
    closedSegments: number;
    candidates: number;
  }>;
  readonly counts: SessionArchiveEconomyCounts;
  /** Keys held at save time that the 193 rule neutralised; every one of them is inactive. */
  readonly neutralizedKeys: number;
  readonly suspendedBodyM: CharacterPoint | null;
}

/**
 * Describes the reload of an accepted version 3 document.
 *
 * It creates nothing and applies nothing: it names the launch mode, the authority, the camera
 * entity, the body and the entity count, and it reads the economy counters out of the carried 215
 * component. A live vehicle set different from the saved one is refused with
 * `ENTITY_SET_MISMATCH`, so a reload cannot silently add or drop a body.
 */
export function walkingSaveReload(
  validation: WalkingSaveAccepted,
  input: WalkingSaveReloadInput,
): WalkingSaveReload {
  const live = readVehicleIds(input.vehicleIds, 'reload.vehicleIds');
  const saved = validation.character.vehicleIds;
  if (live.length !== saved.length) {
    fail(
      'ENTITY_SET_MISMATCH',
      `The live world has ${live.length} vehicle(s), the save has ${saved.length}`,
      'reload.vehicleIds',
    );
  }
  for (const [index, id] of live.entries()) {
    if (saved[index] !== id) {
      fail(
        'ENTITY_SET_MISMATCH',
        `The live vehicle set differs from the save at ${index}: ${id}`,
        'reload.vehicleIds',
      );
    }
  }
  const character = validation.character;
  return Object.freeze({
    launch: WALKING_SAVE_LAUNCH,
    tick: character.tick,
    authority: character.authority.authority,
    cameraEntityId: character.camera.entityId ?? character.fleet.character.entityId,
    body: character.fleet.character,
    characterTick: character.characterTick,
    entities: Object.freeze({
      characters: 1 as const,
      vehicles: saved.length,
      total: saved.length + 1,
      created: 0 as const,
    }),
    segments: Object.freeze({
      openSegmentId: character.segments.open?.segmentId ?? null,
      openKind: character.segments.open?.kind ?? null,
      closedSegments: character.segments.counters.closedSegments,
      candidates: character.segments.counters.candidates,
    }),
    counts: validation.counts,
    neutralizedKeys: character.authority.neutralized.length,
    suspendedBodyM: character.fleet.suspended?.positionM ?? null,
  });
}

export interface WalkingSaveRestoreAccepted {
  readonly status: 'ACCEPTED';
  readonly validation: WalkingSaveAccepted;
  readonly reload: WalkingSaveReload;
  readonly rejection: null;
}

export interface WalkingSaveRestoreRejected {
  readonly status: 'REJECTED';
  readonly validation: null;
  readonly reload: null;
  readonly rejection: WalkingSaveRejection;
}

export type WalkingSaveRestoreResult = WalkingSaveRestoreAccepted | WalkingSaveRestoreRejected;

/** Read plus reload in one closed call; still creates nothing and writes nothing. */
export function restoreWalkingSave(
  input: unknown,
  expect: WalkingSaveExpectationInput & { readonly vehicleIds: readonly string[] },
): WalkingSaveRestoreResult {
  const validation = readWalkingSave(input, expect);
  if (validation.status === 'REJECTED') {
    return Object.freeze({
      status: 'REJECTED' as const,
      validation: null,
      reload: null,
      rejection: validation.rejection,
    });
  }
  try {
    return Object.freeze({
      status: 'ACCEPTED' as const,
      validation,
      reload: walkingSaveReload(validation, { vehicleIds: expect.vehicleIds }),
      rejection: null,
    });
  } catch (error) {
    return Object.freeze({
      status: 'REJECTED' as const,
      validation: null,
      reload: null,
      rejection: rejectionOf(error),
    });
  }
}

/** The closed vocabulary as data, for the report and for callers that map codes to text. */
export const walkingSaveCodes: readonly WalkingSaveCode[] = Object.freeze([
  ...new Set<string>([...walkingSaveBoundaryCodes, ...sessionArchiveEconomyCodes]),
] as WalkingSaveCode[]);

import { computeProfileVersionChecksum, verifyProfileVersionChecksum } from '../profiles';
import type { ProfileVersion } from '../profiles';
import { playerControlModes } from '../missions';
import type {
  DailyProgress,
  DailyProgressSnapshot,
  MissionRewardsLedger,
  MissionRewardsSnapshot,
  PlayerControlMode,
  PlayerProgress,
  PlayerProgressCheckpoint,
} from '../missions';
import { canonicalizeJson, sha256Hex } from './canonical-json';
import { PERSISTENCE_LIMITS, PersistenceError, boundedText } from './contracts';
import { isPausedAutoLaunch } from './session-restore';

/**
 * Academy and free-play (Haos) session kinds for PBI 225.
 *
 * `SessionKind` is a second dimension beside the control mode: `AUTO`, `MANUAL` and `LEARNING`
 * describe how a vehicle is driven, while `ACADEMY` and `CHAOS` describe which world the player is
 * in. The two dimensions never feed each other — every capability of the control modes exists in
 * both kinds, and a kind never removes a vehicle, a control mode or free driving.
 *
 * Five rules are structural:
 *
 * 1. **A copy is a copy.** Entering Haos builds an explicit, deep, independent `ProfileVersion`
 *    with its own `profileId`/`versionId` and a recomputed 109 checksum. There is no shared object:
 *    a tuning applied to the Haos copy cannot change the Academy profile and a new Academy version
 *    cannot change the copy.
 * 2. **Haos owns its ledgers.** The 209 commercial ledger, the 211/212 daily calendar, the 213 XP
 *    ledger and the 125 campaign rewards are Academy read models. The isolation gate delegates an
 *    Academy operation to the real owning instance and refuses a Haos operation before it reaches
 *    it, so the Academy fingerprints measured before and after a Haos session are identical.
 * 3. **Two worlds, never two live worlds.** One session kind is live at a time. A switch closes the
 *    current segment, captures and commits one coherent checkpoint, then invalidates the jobs of the
 *    left world by `sessionId`/`worldEpoch`/`learningEpoch` and releases the input.
 * 4. **A failed save keeps the world.** A rejected commit leaves the live world, its jobs and its
 *    input untouched. Only a confirmed commit advances the epochs.
 * 5. **No promotion.** A checkpoint, an archive, an import, an export or a restore cannot move Haos
 *    data into the Academy; only the explicit, validated style copy is allowed and it carries no
 *    progress.
 *
 * The module owns no clock, DOM, renderer, random source or `Math.random`. Callers pass the real
 * owning instances (212/213/125), the real 109 profile version and an explicit timestamp source, so
 * every result is deterministic and testable without a browser.
 */

export const SESSION_KINDS_VERSION = '225-session-kinds-v1' as const;

/** The two worlds of the game. The order is stable because the report serializes it. */
export const sessionKinds = ['ACADEMY', 'CHAOS'] as const;
export type SessionKind = (typeof sessionKinds)[number];

/** Human labels used by the menu and pause screen; the contract keeps them with the identity. */
export const sessionKindLabels: Readonly<Record<SessionKind, string>> = Object.freeze({
  ACADEMY: 'Academie',
  CHAOS: 'Joacă liberă / Haos',
});

/** Closed refusal vocabulary; there is no open error channel. */
export const sessionKindCodes = [
  'UNKNOWN_SESSION_KIND',
  'INVALID_REQUEST',
  'PROFILE_INVALID',
  'PROFILE_CHECKSUM_MISMATCH',
  'PROFILE_COPY_MISMATCH',
  'PROGRESS_TRANSFER_REFUSED',
  'SESSION_KIND_ISOLATED',
  'PROMOTION_REFUSED',
  'CROSS_SESSION_REFUSED',
  'FOREIGN_CHECKPOINT',
  'CHECKPOINT_INVALID',
  'CHECKPOINT_MISSING',
  'NOT_STARTED',
  'ALREADY_ACTIVE',
  'SWITCH_IN_PROGRESS',
  'CAPTURE_FAILED',
  'SAVE_FAILED',
  'LATE_RESULT',
  'RESOURCE_LEAK',
] as const;
export type SessionKindCode = (typeof sessionKindCodes)[number];

export interface SessionKindRejection {
  readonly code: SessionKindCode;
  readonly message: string;
  readonly path: string | null;
}

export function sessionKindRejection(
  code: SessionKindCode,
  message: string,
  path: string | null = null,
): SessionKindRejection {
  return Object.freeze({ code, message, path });
}

function reject(code: SessionKindCode, message: string, path: string | null = null) {
  return Object.freeze({
    status: 'REJECTED' as const,
    rejection: sessionKindRejection(code, message, path),
  });
}

/* ------------------------------------------------------------------ identity */

export function isSessionKind(value: unknown): value is SessionKind {
  return typeof value === 'string' && (sessionKinds as readonly string[]).includes(value);
}

function requireSessionKind(value: unknown, path: string): SessionKind {
  if (!isSessionKind(value)) {
    throw new PersistenceError('INVALID_RECORD', 'Expected a session kind', path);
  }
  return value;
}

/** Every capability a control mode offers; a session kind never filters this list. */
export const sessionCapabilities = [
  'SELECT_ANY_VEHICLE',
  'FREE_DRIVE',
  'AUTO_CONTROL',
  'MANUAL_CONTROL',
  'LEARNING',
  'DESTRUCTIBLE_DECOR',
  'WORLD_RESET',
  'CHECKPOINT_RESTORE',
  'SESSION_RECORDS',
] as const;
export type SessionCapability = (typeof sessionCapabilities)[number];

export interface SessionKindCapabilities {
  readonly version: typeof SESSION_KINDS_VERSION;
  readonly sessionKind: SessionKind;
  readonly label: string;
  readonly capabilities: readonly SessionCapability[];
  /** The real 213 control modes; they are identical in both kinds and never derived from the kind. */
  readonly controlModes: readonly PlayerControlMode[];
  readonly vehicleSelection: 'ANY_EXISTING';
  readonly controlModesIsolatedFromKind: true;
  readonly vehicleSelectionIsolatedFromKind: true;
  readonly kindGrantsProgress: false;
  readonly kindConsumesDaily: false;
}

const capabilitiesForKind: Readonly<Record<SessionKind, SessionKindCapabilities>> = Object.freeze({
  ACADEMY: Object.freeze({
    version: SESSION_KINDS_VERSION,
    sessionKind: 'ACADEMY',
    label: sessionKindLabels.ACADEMY,
    capabilities: Object.freeze([...sessionCapabilities]),
    controlModes: Object.freeze([...playerControlModes]),
    vehicleSelection: 'ANY_EXISTING',
    controlModesIsolatedFromKind: true,
    vehicleSelectionIsolatedFromKind: true,
    kindGrantsProgress: false,
    kindConsumesDaily: false,
  }),
  CHAOS: Object.freeze({
    version: SESSION_KINDS_VERSION,
    sessionKind: 'CHAOS',
    label: sessionKindLabels.CHAOS,
    capabilities: Object.freeze([...sessionCapabilities]),
    controlModes: Object.freeze([...playerControlModes]),
    vehicleSelection: 'ANY_EXISTING',
    controlModesIsolatedFromKind: true,
    vehicleSelectionIsolatedFromKind: true,
    kindGrantsProgress: false,
    kindConsumesDaily: false,
  }),
});

export function sessionCapabilitiesFor(value: unknown): SessionKindCapabilities {
  return capabilitiesForKind[requireSessionKind(value, 'sessionKind')];
}

/** Parity reports every capability or control mode a kind would lack. It must always be empty. */
export interface SessionKindCapabilityParity {
  readonly identical: boolean;
  readonly differences: readonly string[];
}

export function sessionKindCapabilityParity(
  left: SessionKind,
  right: SessionKind,
): SessionKindCapabilityParity {
  const a = sessionCapabilitiesFor(left);
  const b = sessionCapabilitiesFor(right);
  const differences: string[] = [];
  if (a.capabilities.join(',') !== b.capabilities.join(','))
    differences.push('capabilities differ');
  if (a.controlModes.join(',') !== b.controlModes.join(','))
    differences.push('control modes differ');
  if (a.vehicleSelection !== b.vehicleSelection) differences.push('vehicle selection differs');
  if (a.kindGrantsProgress !== b.kindGrantsProgress) differences.push('progress policy differs');
  if (a.kindConsumesDaily !== b.kindConsumesDaily) differences.push('daily policy differs');
  return Object.freeze({
    identical: differences.length === 0,
    differences: Object.freeze(differences),
  });
}

/* -------------------------------------------------------------------- digest */

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function canonicalDigest(value: unknown, path: string): string {
  const canonical = canonicalizeJson(value, { maxDepth: 32 });
  if (canonical.status === 'REJECTED') {
    throw new PersistenceError(
      'BODY_INVALID',
      `The ${path} value is not canonical: ${canonical.rejection.message}`,
      path,
    );
  }
  return sha256Hex(canonical.text);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isPlainObject(value))
    throw new PersistenceError('INVALID_RECORD', 'Expected an object', path);
  return value;
}

function exactFields(
  value: unknown,
  allowed: readonly string[],
  path: string,
): Record<string, unknown> {
  const data = record(value, path);
  for (const key of Object.keys(data)) {
    if (!allowed.includes(key)) {
      throw new PersistenceError('INVALID_RECORD', `Unknown field: ${key}`, `${path}.${key}`);
    }
  }
  for (const key of allowed) {
    if (!Object.hasOwn(data, key)) {
      throw new PersistenceError('INVALID_RECORD', `Missing field: ${key}`, `${path}.${key}`);
    }
  }
  return data;
}

function identityText(value: unknown, path: string): string {
  return boundedText(value, path, PERSISTENCE_LIMITS.maxIdCodeUnits);
}

function clockText(value: unknown, path: string): string {
  if (typeof value !== 'string' || !TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new PersistenceError('INVALID_RECORD', 'Expected a UTC ISO 8601 timestamp', path);
  }
  return value;
}

function counter(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new PersistenceError('INVALID_RECORD', 'Expected a nonnegative safe integer', path);
  }
  return value;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new PersistenceError('INVALID_RECORD', 'Expected a finite number', path);
  }
  return value;
}

function freezeParameters(
  parameters: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  const copy: Record<string, number> = Object.create(null);
  for (const key of Object.keys(parameters).sort()) copy[key] = parameters[key]!;
  return Object.freeze(copy);
}

/* -------------------------------------------------------------- profile copy */

/**
 * An explicit Haos copy of a 109 profile version. The copy is a real `ProfileVersion`: new
 * `profileId`/`versionId`, base provenance with no source segments, deep-frozen parameters and a
 * recomputed 109 checksum. `progressTransferred` is a literal `false`, not a boolean field a caller
 * can flip.
 */
export interface ChaosProfileCopy {
  readonly version: typeof SESSION_KINDS_VERSION;
  readonly sessionKind: 'CHAOS';
  readonly copyId: string;
  readonly sessionId: string;
  readonly sourceProfileId: string;
  readonly sourceVersionId: string;
  readonly sourceChecksum: string;
  readonly copiedAt: string;
  readonly learningEpoch: number;
  readonly profile: ProfileVersion;
  readonly progressTransferred: false;
  readonly sourceSegmentsTransferred: 0;
  readonly checksum: string;
}

const copyFields = [
  'version',
  'sessionKind',
  'copyId',
  'sessionId',
  'sourceProfileId',
  'sourceVersionId',
  'sourceChecksum',
  'copiedAt',
  'learningEpoch',
  'profile',
  'progressTransferred',
  'sourceSegmentsTransferred',
  'checksum',
] as const;

function copyPayload(copy: Omit<ChaosProfileCopy, 'checksum'>): unknown {
  return {
    version: copy.version,
    sessionKind: copy.sessionKind,
    copyId: copy.copyId,
    sessionId: copy.sessionId,
    sourceProfileId: copy.sourceProfileId,
    sourceVersionId: copy.sourceVersionId,
    sourceChecksum: copy.sourceChecksum,
    copiedAt: copy.copiedAt,
    learningEpoch: copy.learningEpoch,
    profile: copy.profile,
    progressTransferred: copy.progressTransferred,
    sourceSegmentsTransferred: copy.sourceSegmentsTransferred,
  };
}

function freezeProfileVersion(version: ProfileVersion): ProfileVersion {
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    profileId: version.profileId,
    versionId: version.versionId,
    parentVersionId: version.parentVersionId,
    engineVersion: version.engineVersion,
    parameters: freezeParameters(version.parameters),
    provenance: Object.freeze({
      origin: version.provenance.origin,
      sourceSegmentIds: Object.freeze([...version.provenance.sourceSegmentIds]),
      sourceInterventionIds: Object.freeze([...version.provenance.sourceInterventionIds]),
      delta:
        version.provenance.delta === null
          ? null
          : Object.freeze({
              baseVersionId: version.provenance.delta.baseVersionId,
              validationVersion: version.provenance.delta.validationVersion,
              segmentId: version.provenance.delta.segmentId,
              interventionId: version.provenance.delta.interventionId,
              reason: version.provenance.delta.reason,
              keyCount: version.provenance.delta.keyCount,
              changes: Object.freeze(
                version.provenance.delta.changes.map((change) =>
                  Object.freeze({
                    key: change.key,
                    unit: change.unit,
                    previousValue: change.previousValue,
                    newValue: change.newValue,
                  }),
                ),
              ),
            }),
    }),
    sourceSegmentIds: Object.freeze([...version.sourceSegmentIds]),
    depth: version.depth,
    createdAt: version.createdAt,
    checksum: version.checksum,
  });
}

export interface ProfileCopyRequest {
  readonly source: ProfileVersion;
  readonly copyId: string;
  readonly sessionId: string;
  readonly learningEpoch: number;
  readonly copiedAt: string;
}

export type ProfileCopyResult =
  | { readonly status: 'COPIED'; readonly copy: ChaosProfileCopy }
  | { readonly status: 'REJECTED'; readonly rejection: SessionKindRejection };

/**
 * Copies the chosen Academy profile into Haos. The copy is independent: a new identity, a base
 * provenance with no source segments, parameters deep-frozen in sorted order and a fresh checksum.
 * The Academy profile passed in is never mutated and never referenced afterwards.
 */
export function copyProfileForChaos(value: unknown): ProfileCopyResult {
  try {
    const request = exactFields(
      value,
      ['source', 'copyId', 'sessionId', 'learningEpoch', 'copiedAt'],
      'copy request',
    );
    const source = freezeProfileVersion(
      record(request.source, 'copy.source') as unknown as ProfileVersion,
    );
    if (!verifyProfileVersionChecksum(source)) {
      return reject(
        'PROFILE_CHECKSUM_MISMATCH',
        'The source profile version does not match its own 109 checksum',
        'copy.source.checksum',
      );
    }
    const copyId = identityText(request.copyId, 'copy.copyId');
    const sessionId = identityText(request.sessionId, 'copy.sessionId');
    const learningEpoch = counter(request.learningEpoch, 'copy.learningEpoch');
    const copiedAt = clockText(request.copiedAt, 'copy.copiedAt');

    const profileId = `chaos:${copyId}`;
    if (profileId === source.profileId) {
      return reject('INVALID_REQUEST', 'A Haos copy needs its own profile identity', 'copy.copyId');
    }
    const content = {
      schemaVersion: 1 as const,
      units: 'SI' as const,
      profileId,
      versionId: `${profileId}@1`,
      parentVersionId: null,
      engineVersion: source.engineVersion,
      parameters: freezeParameters(source.parameters),
      provenance: Object.freeze({
        origin: 'BASE' as const,
        sourceSegmentIds: Object.freeze([] as string[]),
        sourceInterventionIds: Object.freeze([] as string[]),
        delta: null,
      }),
      sourceSegmentIds: Object.freeze([] as string[]),
      depth: 0,
      createdAt: copiedAt,
      checksum: '',
    };
    const profile = freezeProfileVersion(
      Object.freeze({ ...content, checksum: computeProfileVersionChecksum(content) }),
    );
    const payload = {
      version: SESSION_KINDS_VERSION,
      sessionKind: 'CHAOS' as const,
      copyId,
      sessionId,
      sourceProfileId: source.profileId,
      sourceVersionId: source.versionId,
      sourceChecksum: source.checksum,
      copiedAt,
      learningEpoch,
      profile,
      progressTransferred: false as const,
      sourceSegmentsTransferred: 0 as const,
    };
    return Object.freeze({
      status: 'COPIED' as const,
      copy: Object.freeze({ ...payload, checksum: canonicalDigest(payload, 'copy') }),
    });
  } catch (error) {
    return reject('INVALID_REQUEST', describe(error), 'copy');
  }
}

export type ProfileCopyVerification =
  | { readonly status: 'VALID'; readonly copy: ChaosProfileCopy }
  | { readonly status: 'REJECTED'; readonly rejection: SessionKindRejection };

/** Verifies the copy envelope, the independence rules and both checksums. */
export function verifyChaosProfileCopy(value: unknown): ProfileCopyVerification {
  try {
    const data = exactFields(value, copyFields, 'copy');
    if (data.version !== SESSION_KINDS_VERSION || data.sessionKind !== 'CHAOS') {
      return reject('PROFILE_COPY_MISMATCH', 'Expected a Haos profile copy', 'copy');
    }
    if (data.progressTransferred !== false || data.sourceSegmentsTransferred !== 0) {
      return reject(
        'PROGRESS_TRANSFER_REFUSED',
        'A Haos copy carries no progress and no source segments',
        'copy.progressTransferred',
      );
    }
    const profile = freezeProfileVersion(
      record(data.profile, 'copy.profile') as unknown as ProfileVersion,
    );
    if (!verifyProfileVersionChecksum(profile)) {
      return reject(
        'PROFILE_CHECKSUM_MISMATCH',
        'The copied profile version does not match its own 109 checksum',
        'copy.profile.checksum',
      );
    }
    if (profile.sourceSegmentIds.length > 0) {
      return reject(
        'PROGRESS_TRANSFER_REFUSED',
        'A copied profile cannot claim source segments',
        'copy.profile.sourceSegmentIds',
      );
    }
    const copy = Object.freeze({
      version: SESSION_KINDS_VERSION,
      sessionKind: 'CHAOS' as const,
      copyId: identityText(data.copyId, 'copy.copyId'),
      sessionId: identityText(data.sessionId, 'copy.sessionId'),
      sourceProfileId: identityText(data.sourceProfileId, 'copy.sourceProfileId'),
      sourceVersionId: identityText(data.sourceVersionId, 'copy.sourceVersionId'),
      sourceChecksum: identityText(data.sourceChecksum, 'copy.sourceChecksum'),
      copiedAt: clockText(data.copiedAt, 'copy.copiedAt'),
      learningEpoch: counter(data.learningEpoch, 'copy.learningEpoch'),
      profile,
      progressTransferred: false as const,
      sourceSegmentsTransferred: 0 as const,
      checksum: identityText(data.checksum, 'copy.checksum'),
    });
    const expected = canonicalDigest(copyPayload(copy), 'copy');
    if (expected !== copy.checksum) {
      return reject(
        'PROFILE_COPY_MISMATCH',
        'The Haos copy does not match its own checksum',
        'copy.checksum',
      );
    }
    if (copy.profile.profileId !== `chaos:${copy.copyId}`) {
      return reject(
        'PROFILE_COPY_MISMATCH',
        'The copied profile identity does not belong to the copy identity',
        'copy.profile.profileId',
      );
    }
    return Object.freeze({ status: 'VALID' as const, copy });
  } catch (error) {
    return reject('INVALID_REQUEST', describe(error), 'copy');
  }
}

export interface ChaosTuningRequest {
  readonly copy: unknown;
  readonly tuningId: string;
  readonly versionId: string;
  readonly key: string;
  readonly unit: string;
  readonly value: number;
  readonly reason: string | null;
  readonly createdAt: string;
}

export type ChaosTuningResult =
  | { readonly status: 'TUNED'; readonly copy: ChaosProfileCopy }
  | { readonly status: 'REJECTED'; readonly rejection: SessionKindRejection };

/**
 * Applies one manual tuning to the Haos copy only. The result is another independent copy record
 * with a derived 109 version; the Academy profile is not involved in any way.
 */
export function applyChaosTuning(value: unknown): ChaosTuningResult {
  try {
    const raw = record(value, 'tuning');
    const verified = verifyChaosProfileCopy(raw.copy);
    if (verified.status === 'REJECTED') return verified;
    const request = exactFields(
      value,
      ['copy', 'tuningId', 'versionId', 'key', 'unit', 'value', 'reason', 'createdAt'],
      'tuning',
    );
    const copy = verified.copy;
    const tuningId = identityText(request.tuningId, 'tuning.tuningId');
    const versionId = identityText(request.versionId, 'tuning.versionId');
    const key = identityText(request.key, 'tuning.key');
    const unit = identityText(request.unit, 'tuning.unit');
    const newValue = finite(request.value, 'tuning.value');
    const reason =
      request.reason === null ? null : boundedText(request.reason, 'tuning.reason', 240);
    const createdAt = clockText(request.createdAt, 'tuning.createdAt');
    if (versionId === copy.profile.versionId) {
      return reject('INVALID_REQUEST', 'A tuning needs a new version identity', 'tuning.versionId');
    }
    const previousValue = copy.profile.parameters[key];
    if (previousValue === undefined) {
      return reject(
        'INVALID_REQUEST',
        `The tuning key ${key} is not part of the copied profile`,
        'tuning.key',
      );
    }
    const content = {
      schemaVersion: 1 as const,
      units: 'SI' as const,
      profileId: copy.profile.profileId,
      versionId,
      parentVersionId: copy.profile.versionId,
      engineVersion: copy.profile.engineVersion,
      parameters: freezeParameters({ ...copy.profile.parameters, [key]: newValue }),
      provenance: Object.freeze({
        origin: 'DERIVED' as const,
        sourceSegmentIds: Object.freeze([] as string[]),
        sourceInterventionIds: Object.freeze([] as string[]),
        delta: Object.freeze({
          baseVersionId: copy.profile.versionId,
          validationVersion: SESSION_KINDS_VERSION,
          segmentId: tuningId,
          interventionId: null,
          reason,
          keyCount: 1,
          changes: Object.freeze([Object.freeze({ key, unit, previousValue, newValue })]),
        }),
      }),
      sourceSegmentIds: Object.freeze([] as string[]),
      depth: copy.profile.depth + 1,
      createdAt,
      checksum: '',
    };
    const profile = freezeProfileVersion(
      Object.freeze({ ...content, checksum: computeProfileVersionChecksum(content) }),
    );
    const payload = {
      version: SESSION_KINDS_VERSION,
      sessionKind: 'CHAOS' as const,
      copyId: copy.copyId,
      sessionId: copy.sessionId,
      sourceProfileId: copy.sourceProfileId,
      sourceVersionId: copy.sourceVersionId,
      sourceChecksum: copy.sourceChecksum,
      copiedAt: copy.copiedAt,
      learningEpoch: copy.learningEpoch,
      profile,
      progressTransferred: false as const,
      sourceSegmentsTransferred: 0 as const,
    };
    return Object.freeze({
      status: 'TUNED' as const,
      copy: Object.freeze({ ...payload, checksum: canonicalDigest(payload, 'tuning') }),
    });
  } catch (error) {
    return reject('INVALID_REQUEST', describe(error), 'tuning');
  }
}

/* --------------------------------------------------------- style into Academy */

/** Every progress-shaped field a promotion request could try to smuggle. */
export const promotionForbiddenFields = [
  'progress',
  'daily',
  'dailyRewards',
  'xp',
  'rewards',
  'campaign',
  'checkpoints',
  'records',
  'unlocks',
] as const;

export interface AcademyStyleAdoption {
  readonly version: typeof SESSION_KINDS_VERSION;
  readonly sessionKind: 'ACADEMY';
  readonly sessionId: string;
  readonly adoptedAt: string;
  readonly sourceCopyChecksum: string;
  readonly sourceVersionId: string;
  readonly profile: ProfileVersion;
  readonly transferred: Readonly<{
    readonly progress: 'NONE';
    readonly dailyRewards: 0;
    readonly xp: 0;
    readonly campaignRewards: 0;
    readonly checkpoints: 0;
    readonly records: 0;
    readonly unlocks: 0;
  }>;
  readonly checksum: string;
}

export interface StyleAdoptionRequest {
  readonly copy: unknown;
  readonly sessionId: string;
  readonly profileId: string;
  readonly versionId: string;
  readonly adoptedAt: string;
}

export type StyleAdoptionResult =
  | { readonly status: 'ADOPTED'; readonly adoption: AcademyStyleAdoption }
  | { readonly status: 'REJECTED'; readonly rejection: SessionKindRejection };

const adoptionFields = ['copy', 'sessionId', 'profileId', 'versionId', 'adoptedAt'] as const;

/**
 * Copies the Haos style back into the Academy as a new, validated 109 version. Only the parameters
 * and the engine identity cross the boundary: the result names every progress category with a
 * literal zero, so a caller cannot read a transferred reward out of it.
 */
export function adoptChaosStyleIntoAcademy(value: unknown): StyleAdoptionResult {
  const data = record(value, 'adoption');
  for (const key of Object.keys(data)) {
    if (!adoptionFields.includes(key as (typeof adoptionFields)[number])) {
      if ((promotionForbiddenFields as readonly string[]).includes(key)) {
        return reject(
          'PROGRESS_TRANSFER_REFUSED',
          `The ${key} category cannot cross from Haos into the Academy`,
          `adoption.${key}`,
        );
      }
      return reject('INVALID_REQUEST', `Unknown field: ${key}`, `adoption.${key}`);
    }
  }
  const verified = verifyChaosProfileCopy(data.copy);
  if (verified.status === 'REJECTED') return verified;
  try {
    const request = exactFields(data, adoptionFields, 'adoption');
    const copy = verified.copy;
    const sessionId = identityText(request.sessionId, 'adoption.sessionId');
    const profileId = identityText(request.profileId, 'adoption.profileId');
    const versionId = identityText(request.versionId, 'adoption.versionId');
    const adoptedAt = clockText(request.adoptedAt, 'adoption.adoptedAt');
    if (profileId.startsWith('chaos:') || profileId === copy.profile.profileId) {
      return reject(
        'PROMOTION_REFUSED',
        'An Academy style must belong to an Academy profile',
        'adoption.profileId',
      );
    }
    if (versionId === copy.profile.versionId) {
      return reject(
        'PROMOTION_REFUSED',
        'The adopted style needs an Academy version identity',
        'adoption.versionId',
      );
    }
    const content = {
      schemaVersion: 1 as const,
      units: 'SI' as const,
      profileId,
      versionId,
      parentVersionId: null,
      engineVersion: copy.profile.engineVersion,
      parameters: freezeParameters(copy.profile.parameters),
      provenance: Object.freeze({
        origin: 'BASE' as const,
        sourceSegmentIds: Object.freeze([] as string[]),
        sourceInterventionIds: Object.freeze([] as string[]),
        delta: null,
      }),
      sourceSegmentIds: Object.freeze([] as string[]),
      depth: 0,
      createdAt: adoptedAt,
      checksum: '',
    };
    const profile = freezeProfileVersion(
      Object.freeze({ ...content, checksum: computeProfileVersionChecksum(content) }),
    );
    const transferred = Object.freeze({
      progress: 'NONE' as const,
      dailyRewards: 0 as const,
      xp: 0 as const,
      campaignRewards: 0 as const,
      checkpoints: 0 as const,
      records: 0 as const,
      unlocks: 0 as const,
    });
    const payload = {
      version: SESSION_KINDS_VERSION,
      sessionKind: 'ACADEMY' as const,
      sessionId,
      adoptedAt,
      sourceCopyChecksum: copy.checksum,
      sourceVersionId: copy.profile.versionId,
      profile,
      transferred,
    };
    return Object.freeze({
      status: 'ADOPTED' as const,
      adoption: Object.freeze({ ...payload, checksum: canonicalDigest(payload, 'adoption') }),
    });
  } catch (error) {
    return reject('INVALID_REQUEST', describe(error), 'adoption');
  }
}

/* ----------------------------------------------------------- transfer policy */

/** Every path that could move data between the two worlds. */
export const sessionKindTransferPaths = [
  'PROFILE_COPY',
  'STYLE_COPY',
  'IMPORT',
  'EXPORT',
  'CHECKPOINT',
  'RESTORE',
  'ARCHIVE',
] as const;
export type SessionKindTransferPath = (typeof sessionKindTransferPaths)[number];

export interface SessionKindTransferDecision {
  readonly from: SessionKind;
  readonly to: SessionKind;
  readonly path: SessionKindTransferPath;
  readonly allowed: boolean;
  readonly code: 'ALLOWED' | 'PROMOTION_REFUSED' | 'CROSS_SESSION_REFUSED';
  readonly progressTransferred: false;
  readonly reason: string;
}

/**
 * The closed policy of data movement. The only two allowed crossings are the explicit profile copy
 * into Haos and the explicit style copy back into the Academy, and neither carries progress.
 */
export function evaluateSessionKindTransfer(value: unknown): SessionKindTransferDecision {
  const data = record(value, 'transfer');
  const from = requireSessionKind(data.from, 'transfer.from');
  const to = requireSessionKind(data.to, 'transfer.to');
  const path = data.path;
  if (typeof path !== 'string' || !(sessionKindTransferPaths as readonly string[]).includes(path)) {
    throw new PersistenceError('INVALID_RECORD', 'Unknown transfer path', 'transfer.path');
  }
  const decoded = path as SessionKindTransferPath;
  if (from === to) {
    return Object.freeze({
      from,
      to,
      path: decoded,
      allowed: true,
      code: 'ALLOWED' as const,
      progressTransferred: false as const,
      reason: 'A path inside the same session kind changes nothing across worlds.',
    });
  }
  if (from === 'ACADEMY' && to === 'CHAOS') {
    const allowed = decoded === 'PROFILE_COPY';
    return Object.freeze({
      from,
      to,
      path: decoded,
      allowed,
      code: allowed ? ('ALLOWED' as const) : ('CROSS_SESSION_REFUSED' as const),
      progressTransferred: false as const,
      reason: allowed
        ? 'Haos may copy the chosen profile once; the copy carries no progress.'
        : 'Academy progress cannot be imported into Haos through this path.',
    });
  }
  const allowed = decoded === 'STYLE_COPY';
  return Object.freeze({
    from,
    to,
    path: decoded,
    allowed,
    code: allowed ? ('ALLOWED' as const) : ('PROMOTION_REFUSED' as const),
    progressTransferred: false as const,
    reason: allowed
      ? 'Haos may export its style into the Academy as a validated profile version, without progress.'
      : 'A Haos session cannot promote checkpoints, archives, imports or progress into the Academy.',
  });
}

/* --------------------------------------------------------------- checkpoints */

export const sessionCheckpointReasons = ['SESSION_SWITCH', 'AUTOSAVE', 'CLOSE'] as const;
export type SessionCheckpointReason = (typeof sessionCheckpointReasons)[number];

export interface SessionKindCheckpoint {
  readonly version: typeof SESSION_KINDS_VERSION;
  readonly checkpointId: string;
  readonly sessionKind: SessionKind;
  readonly sessionId: string;
  readonly profileId: string;
  readonly worldEpoch: number;
  readonly learningEpoch: number;
  readonly tick: number;
  readonly generation: number;
  readonly reason: SessionCheckpointReason;
  readonly createdAt: string;
  readonly vehicles: number;
  readonly manualVehicles: number;
  /** Always `PAUSED_AUTO`: a stored world is never resumed in live manual control. */
  readonly launch: 'PAUSED_AUTO';
  readonly body: Readonly<Record<string, unknown>>;
  readonly bodyBytes: number;
  readonly checksum: string;
}

const checkpointFields = [
  'version',
  'checkpointId',
  'sessionKind',
  'sessionId',
  'profileId',
  'worldEpoch',
  'learningEpoch',
  'tick',
  'generation',
  'reason',
  'createdAt',
  'vehicles',
  'manualVehicles',
  'launch',
  'body',
  'bodyBytes',
  'checksum',
] as const;

function checkpointPayload(checkpoint: Omit<SessionKindCheckpoint, 'checksum'>): unknown {
  return {
    version: checkpoint.version,
    checkpointId: checkpoint.checkpointId,
    sessionKind: checkpoint.sessionKind,
    sessionId: checkpoint.sessionId,
    profileId: checkpoint.profileId,
    worldEpoch: checkpoint.worldEpoch,
    learningEpoch: checkpoint.learningEpoch,
    tick: checkpoint.tick,
    generation: checkpoint.generation,
    reason: checkpoint.reason,
    createdAt: checkpoint.createdAt,
    vehicles: checkpoint.vehicles,
    manualVehicles: checkpoint.manualVehicles,
    launch: checkpoint.launch,
    body: checkpoint.body,
    bodyBytes: checkpoint.bodyBytes,
  };
}

export function computeSessionKindCheckpointChecksum(
  checkpoint: Omit<SessionKindCheckpoint, 'checksum'>,
): string {
  return canonicalDigest(checkpointPayload(checkpoint), 'checkpoint');
}

export type SessionKindCheckpointVerification =
  | { readonly status: 'VALID'; readonly checkpoint: SessionKindCheckpoint }
  | { readonly status: 'REJECTED'; readonly rejection: SessionKindRejection };

export function verifySessionKindCheckpoint(value: unknown): SessionKindCheckpointVerification {
  try {
    const data = exactFields(value, checkpointFields, 'checkpoint');
    if (data.version !== SESSION_KINDS_VERSION) {
      return reject('CHECKPOINT_INVALID', 'Unsupported checkpoint version', 'checkpoint.version');
    }
    const sessionKind = requireSessionKind(data.sessionKind, 'checkpoint.sessionKind');
    if (data.launch !== 'PAUSED_AUTO') {
      return reject(
        'CHECKPOINT_INVALID',
        'A checkpoint must relaunch in PAUSED_AUTO',
        'checkpoint.launch',
      );
    }
    const reason = data.reason;
    if (
      typeof reason !== 'string' ||
      !(sessionCheckpointReasons as readonly string[]).includes(reason)
    ) {
      return reject('CHECKPOINT_INVALID', 'Unknown checkpoint reason', 'checkpoint.reason');
    }
    const body = record(data.body, 'checkpoint.body');
    const canonical = canonicalizeJson(body, { maxDepth: 32 });
    if (canonical.status === 'REJECTED') {
      return reject('CHECKPOINT_INVALID', canonical.rejection.message, 'checkpoint.body');
    }
    const bodyBytes = new TextEncoder().encode(canonical.text).length;
    if (bodyBytes !== counter(data.bodyBytes, 'checkpoint.bodyBytes')) {
      return reject(
        'CHECKPOINT_INVALID',
        'The checkpoint body size does not match',
        'checkpoint.bodyBytes',
      );
    }
    const checkpoint = Object.freeze({
      version: SESSION_KINDS_VERSION,
      checkpointId: identityText(data.checkpointId, 'checkpoint.checkpointId'),
      sessionKind,
      sessionId: identityText(data.sessionId, 'checkpoint.sessionId'),
      profileId: identityText(data.profileId, 'checkpoint.profileId'),
      worldEpoch: counter(data.worldEpoch, 'checkpoint.worldEpoch'),
      learningEpoch: counter(data.learningEpoch, 'checkpoint.learningEpoch'),
      tick: counter(data.tick, 'checkpoint.tick'),
      generation: counter(data.generation, 'checkpoint.generation'),
      reason: reason as SessionCheckpointReason,
      createdAt: clockText(data.createdAt, 'checkpoint.createdAt'),
      vehicles: counter(data.vehicles, 'checkpoint.vehicles'),
      manualVehicles: counter(data.manualVehicles, 'checkpoint.manualVehicles'),
      launch: 'PAUSED_AUTO' as const,
      body: data.body as Readonly<Record<string, unknown>>,
      bodyBytes,
      checksum: identityText(data.checksum, 'checkpoint.checksum'),
    });
    if (computeSessionKindCheckpointChecksum(checkpoint) !== checkpoint.checksum) {
      return reject(
        'CHECKPOINT_INVALID',
        'The checkpoint does not match its own checksum',
        'checkpoint.checksum',
      );
    }
    return Object.freeze({ status: 'VALID' as const, checkpoint });
  } catch (error) {
    return reject('CHECKPOINT_INVALID', describe(error), 'checkpoint');
  }
}

export interface SessionKindCommitAccepted {
  readonly status: 'COMMITTED';
  readonly checkpoint: SessionKindCheckpoint;
  readonly bytes: number;
}

export interface SessionKindCommitRejected {
  readonly status: 'REJECTED';
  readonly rejection: SessionKindRejection;
}

export type SessionKindCommitResult = SessionKindCommitAccepted | SessionKindCommitRejected;

export interface SessionKindCheckpointStore {
  commit(checkpoint: unknown): Promise<SessionKindCommitResult>;
  latest(sessionKind: SessionKind): Promise<SessionKindCheckpoint | null>;
  list(sessionKind: SessionKind): Promise<readonly SessionKindCheckpoint[]>;
  stats(): SessionKindStoreStats;
}

export interface SessionKindStoreStats {
  readonly committed: number;
  readonly rejected: number;
  readonly rows: Readonly<Record<SessionKind, number>>;
}

export interface MemorySessionKindStoreOptions {
  /** Rows retained per kind; the oldest generation is dropped first. */
  readonly maxRowsPerKind?: number;
}

export interface MemorySessionKindStore extends SessionKindCheckpointStore {
  /** Makes the next commit fail with the given code, so a test can prove a failed save keeps the world. */
  failNextCommit(code?: SessionKindCode): void;
}

/**
 * Bounded in-memory checkpoint port. It is the deterministic double of a durable adapter: it
 * verifies every checkpoint with the same closed rules and never stores a partial row.
 */
export function createMemorySessionKindStore(
  options: MemorySessionKindStoreOptions = {},
): MemorySessionKindStore {
  const limit = options.maxRowsPerKind ?? 32;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new PersistenceError('INVALID_RECORD', 'maxRowsPerKind must be a positive integer');
  }
  const rows: Record<SessionKind, SessionKindCheckpoint[]> = { ACADEMY: [], CHAOS: [] };
  let committed = 0;
  let rejected = 0;
  let failure: SessionKindCode | null = null;

  return {
    failNextCommit(code: SessionKindCode = 'SAVE_FAILED') {
      failure = code;
    },
    async commit(value) {
      if (failure !== null) {
        const code = failure;
        failure = null;
        rejected += 1;
        return Object.freeze({
          status: 'REJECTED' as const,
          rejection: sessionKindRejection(code, 'The checkpoint store refused this commit'),
        });
      }
      const verified = verifySessionKindCheckpoint(value);
      if (verified.status === 'REJECTED') {
        rejected += 1;
        return verified;
      }
      const checkpoint = verified.checkpoint;
      const bucket = rows[checkpoint.sessionKind];
      if (bucket.some((row) => row.checkpointId === checkpoint.checkpointId)) {
        rejected += 1;
        return reject(
          'CHECKPOINT_INVALID',
          'The checkpoint identity already exists',
          'checkpoint.checkpointId',
        );
      }
      bucket.push(checkpoint);
      bucket.sort((left, right) => left.tick - right.tick || left.generation - right.generation);
      while (bucket.length > limit) bucket.shift();
      committed += 1;
      return Object.freeze({
        status: 'COMMITTED' as const,
        checkpoint,
        bytes: checkpoint.bodyBytes,
      });
    },
    async latest(sessionKind) {
      const bucket = rows[requireSessionKind(sessionKind, 'sessionKind')];
      return bucket.length === 0 ? null : bucket[bucket.length - 1]!;
    },
    async list(sessionKind) {
      return Object.freeze([...rows[requireSessionKind(sessionKind, 'sessionKind')]]);
    },
    stats() {
      return Object.freeze({
        committed,
        rejected,
        rows: Object.freeze({ ACADEMY: rows.ACADEMY.length, CHAOS: rows.CHAOS.length }),
      });
    },
  };
}

/* ------------------------------------------------------------ isolation gate */

export const sessionLedgerOperations = [
  'DAILY_INGEST',
  'DAILY_ADVANCE',
  'XP_MISSION',
  'XP_DAILY',
  'XP_ACTIVE_TIME',
  'CAMPAIGN_SETTLE',
] as const;
export type SessionLedgerOperation = (typeof sessionLedgerOperations)[number];

/** The real Academy owners. The gate delegates to them and never reimplements them. */
export interface SessionAcademyLedgers {
  readonly daily: DailyProgress;
  readonly xp: PlayerProgress;
  readonly campaign: MissionRewardsLedger;
}

export interface SessionLedgerCounts {
  readonly dailySets: number;
  readonly dailyRewards: number;
  readonly dailyCompleted: number;
  readonly xpEntries: number;
  readonly xpBalanceMicroXp: number;
  readonly rewardGrants: number;
  readonly campaignDuplicates: number;
  /** Structural: a fingerprint never replays history to derive a value. */
  readonly historyScans: 0;
}

export interface SessionLedgerFingerprint {
  readonly daily: string;
  readonly xp: string;
  readonly campaign: string;
  readonly combined: string;
  readonly counts: SessionLedgerCounts;
}

export interface SessionGateDelegated {
  readonly status: 'DELEGATED';
  readonly sessionKind: 'ACADEMY';
  readonly operation: SessionLedgerOperation;
  readonly result: unknown;
}

export interface SessionGateIsolated {
  readonly status: 'ISOLATED';
  readonly sessionKind: 'CHAOS';
  readonly operation: SessionLedgerOperation;
  readonly code: 'SESSION_KIND_ISOLATED';
  readonly message: string;
  readonly countersUnchanged: true;
}

export type SessionGateResult = SessionGateDelegated | SessionGateIsolated;

export interface SessionLedgerGate {
  readonly sessionKind: SessionKind;
  ingestDaily(value: unknown): SessionGateResult;
  advanceDaily(value: unknown): SessionGateResult;
  creditMission(value: unknown): SessionGateResult;
  creditDaily(value: unknown): SessionGateResult;
  observeActiveTime(value: unknown): SessionGateResult;
  settleCampaign(value: unknown): SessionGateResult;
}

export interface SessionIsolationStats {
  readonly delegated: number;
  readonly isolated: number;
  readonly byOperation: Readonly<Record<SessionLedgerOperation, number>>;
}

export interface SessionKindIsolation {
  fingerprint(): SessionLedgerFingerprint;
  gate(sessionKind: SessionKind): SessionLedgerGate;
  stats(): SessionIsolationStats;
}

function digestDocument(value: unknown, path: string): string {
  return canonicalDigest(value, path);
}

function ledgerCounts(
  daily: DailyProgressSnapshot,
  xp: PlayerProgressCheckpoint,
  campaign: MissionRewardsSnapshot,
): SessionLedgerCounts {
  return Object.freeze({
    dailySets: daily.calendar.sets.length,
    dailyRewards: daily.calendar.rewards.length,
    dailyCompleted: daily.rows.filter((row) => row.state === 'COMPLETED').length,
    xpEntries: xp.entries.length,
    xpBalanceMicroXp: xp.entries.reduce((total, entry) => total + entry.amountMicroXp, 0),
    rewardGrants: campaign.grants.length,
    campaignDuplicates: campaign.totals.duplicates,
    historyScans: 0 as const,
  });
}

/**
 * Builds the isolation gate over the real 212/213/125 read models. `fingerprint()` is the evidence
 * primitive: it digests exactly what the owners hold, so an equal fingerprint before and after a
 * Haos operation means nothing was consumed.
 */
export function createSessionKindIsolation(options: SessionAcademyLedgers): SessionKindIsolation {
  const { daily, xp, campaign } = options;
  const counters: Record<SessionLedgerOperation, number> = {
    DAILY_INGEST: 0,
    DAILY_ADVANCE: 0,
    XP_MISSION: 0,
    XP_DAILY: 0,
    XP_ACTIVE_TIME: 0,
    CAMPAIGN_SETTLE: 0,
  };
  let delegated = 0;
  let isolated = 0;

  function gate(sessionKind: SessionKind): SessionLedgerGate {
    const kind = requireSessionKind(sessionKind, 'sessionKind');
    const run = (operation: SessionLedgerOperation, work: () => unknown): SessionGateResult => {
      if (kind === 'CHAOS') {
        isolated += 1;
        return Object.freeze({
          status: 'ISOLATED' as const,
          sessionKind: 'CHAOS' as const,
          operation,
          code: 'SESSION_KIND_ISOLATED' as const,
          message: `A Haos session cannot perform ${operation} on the Academy ledgers`,
          countersUnchanged: true as const,
        });
      }
      counters[operation] += 1;
      delegated += 1;
      return Object.freeze({
        status: 'DELEGATED' as const,
        sessionKind: 'ACADEMY' as const,
        operation,
        result: work(),
      });
    };
    return Object.freeze({
      sessionKind: kind,
      ingestDaily: (value: unknown) => run('DAILY_INGEST', () => daily.ingest(value)),
      advanceDaily: (value: unknown) => run('DAILY_ADVANCE', () => daily.advance(value)),
      creditMission: (value: unknown) => run('XP_MISSION', () => xp.creditMission(value)),
      creditDaily: (value: unknown) => run('XP_DAILY', () => xp.creditDaily(value)),
      observeActiveTime: (value: unknown) =>
        run('XP_ACTIVE_TIME', () => xp.observeActiveTime(value)),
      settleCampaign: (value: unknown) => run('CAMPAIGN_SETTLE', () => campaign.settle(value)),
    });
  }

  return Object.freeze({
    fingerprint(): SessionLedgerFingerprint {
      const dailySnapshot = daily.snapshot();
      const xpCheckpoint = xp.checkpoint();
      const campaignSnapshot = campaign.rewards();
      const dailyDigest = digestDocument(dailySnapshot, 'fingerprint.daily');
      const xpDigest = digestDocument(xpCheckpoint, 'fingerprint.xp');
      const campaignDigest = digestDocument(campaignSnapshot, 'fingerprint.campaign');
      return Object.freeze({
        daily: `sha256:${dailyDigest}`,
        xp: `sha256:${xpDigest}`,
        campaign: `sha256:${campaignDigest}`,
        combined: `sha256:${digestDocument(
          { daily: dailyDigest, xp: xpDigest, campaign: campaignDigest },
          'fingerprint',
        )}`,
        counts: ledgerCounts(dailySnapshot, xpCheckpoint, campaignSnapshot),
      });
    },
    gate,
    stats(): SessionIsolationStats {
      return Object.freeze({
        delegated,
        isolated,
        byOperation: Object.freeze({ ...counters }),
      });
    },
  });
}

/* --------------------------------------------------------------- world switch */

export interface SessionWorldIdentity {
  readonly sessionKind: SessionKind;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly learningEpoch: number;
}

export interface SessionWorldCapture {
  readonly tick: number;
  readonly vehicles: number;
  readonly manualVehicles: number;
  readonly body: Readonly<Record<string, unknown>>;
}

export const sessionJobInvalidationReasons = ['SESSION_SWITCH', 'WORLD_RESET', 'RELOAD'] as const;
export type SessionJobInvalidationReason = (typeof sessionJobInvalidationReasons)[number];

/**
 * Port of the one live physical world. The host only states what must happen; the composition
 * layer performs it. A port that cannot capture (because the loop is mid-step) throws and the host
 * keeps the world.
 */
export interface SessionWorldPort {
  capture(identity: SessionWorldIdentity): SessionWorldCapture;
  closeSegment(identity: SessionWorldIdentity): number;
  /** Drops every job bound to that world identity; a result of a dropped job is a late result. */
  invalidateJobs(identity: SessionWorldIdentity, reason: SessionJobInvalidationReason): number;
  releaseInput(identity: SessionWorldIdentity): number;
  start(
    identity: SessionWorldIdentity & { readonly profileId: string; readonly launch: 'PAUSED_AUTO' },
  ): void;
  stop(identity: SessionWorldIdentity): void;
  residentJobs(identity: SessionWorldIdentity): number;
  listeners(identity: SessionWorldIdentity): number;
}

export interface SessionLaunch {
  readonly mode: 'PAUSED_AUTO';
  readonly paused: true;
  readonly auto: true;
  readonly inputReleased: true;
  readonly manualVehicles: 0;
  readonly vehiclesInAuto: number;
  readonly previousManualVehicles: number;
}

export interface SessionKindHostOptions {
  readonly store: SessionKindCheckpointStore;
  readonly world: SessionWorldPort;
  readonly academyProfile: ProfileVersion;
  readonly chaosProfile: ChaosProfileCopy;
  readonly academySessionId: string;
  readonly chaosSessionId: string;
  /** Explicit clock; the host never reads a wall clock itself. */
  readonly now: () => string;
}

export interface SessionKindStatus {
  readonly sessionId: string;
  readonly profileId: string;
  readonly worldEpoch: number;
  readonly learningEpoch: number;
  readonly checkpoints: number;
  readonly lastTick: number | null;
  readonly lastCheckpointId: string | null;
  readonly entries: number;
}

export interface SessionResidentResources {
  readonly liveWorlds: number;
  readonly residentJobs: number;
  readonly listeners: number;
  readonly profileCopies: number;
  readonly checkpoints: number;
}

export interface SessionKindHostStatus {
  readonly version: typeof SESSION_KINDS_VERSION;
  readonly live: SessionKind | null;
  readonly switching: boolean;
  readonly switches: number;
  readonly failedSwitches: number;
  readonly kinds: Readonly<Record<SessionKind, SessionKindStatus>>;
  readonly resident: SessionResidentResources;
  readonly historyScans: 0;
}

export interface SessionStartAccepted {
  readonly status: 'STARTED';
  readonly sessionKind: SessionKind;
  readonly launch: SessionLaunch;
  readonly identity: SessionWorldIdentity;
}

export interface SessionSwitchAccepted {
  readonly status: 'SWITCHED';
  readonly from: SessionKind;
  readonly to: SessionKind;
  readonly checkpointId: string;
  readonly generation: number;
  readonly closedSegments: number;
  readonly invalidatedJobs: number;
  readonly releasedInputs: number;
  readonly launch: SessionLaunch;
  readonly identity: SessionWorldIdentity;
}

export interface SessionSwitchRejected {
  readonly status: 'REJECTED';
  readonly code: SessionKindCode;
  readonly message: string;
  readonly world: SessionKind | null;
  readonly closedSegments: number;
  readonly checkpointId: string | null;
}

export type SessionSwitchResult =
  SessionStartAccepted | SessionSwitchAccepted | SessionSwitchRejected;

export interface SessionRestoreAccepted {
  readonly status: 'RESTORED';
  readonly sessionKind: SessionKind;
  readonly checkpointId: string;
  readonly tick: number;
  readonly worldEpoch: number;
  readonly learningEpoch: number;
  readonly launch: SessionLaunch;
  readonly checksum: string;
}

export interface SessionRestoreRejected {
  readonly status: 'REJECTED';
  readonly code: SessionKindCode;
  readonly message: string;
  readonly sessionKind: SessionKind;
}

export type SessionRestoreOutcome = SessionRestoreAccepted | SessionRestoreRejected;

export interface SessionReloadResumed {
  readonly status: 'RESUMED';
  readonly sessionKind: SessionKind;
  readonly checkpointId: string;
  readonly tick: number;
  readonly launch: SessionLaunch;
}

export interface SessionReloadEmpty {
  readonly status: 'EMPTY';
  readonly message: string;
}

export type SessionReloadOutcome = SessionReloadResumed | SessionReloadEmpty;

export interface SessionJobResult {
  readonly sessionKind: SessionKind;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly learningEpoch: number;
  readonly jobId: string;
}

export type SessionJobResultDecision =
  | { readonly status: 'ACCEPTED'; readonly jobId: string }
  | {
      readonly status: 'LATE_RESULT';
      readonly jobId: string;
      readonly reason:
        | 'SESSION_KIND_MISMATCH'
        | 'SESSION_MISMATCH'
        | 'WORLD_EPOCH_MISMATCH'
        | 'LEARNING_EPOCH_MISMATCH';
      readonly expected: SessionWorldIdentity;
    };

export interface SessionKindHost {
  start(sessionKind: SessionKind): SessionSwitchResult;
  switchTo(sessionKind: SessionKind): Promise<SessionSwitchResult>;
  restore(sessionKind: SessionKind): Promise<SessionRestoreOutcome>;
  reload(): Promise<SessionReloadOutcome>;
  acceptJobResult(value: unknown): SessionJobResultDecision;
  status(): SessionKindHostStatus;
}

function launchOf(checkpoint: SessionKindCheckpoint): SessionLaunch {
  return Object.freeze({
    mode: 'PAUSED_AUTO' as const,
    paused: true as const,
    auto: true as const,
    inputReleased: true as const,
    manualVehicles: 0 as const,
    vehiclesInAuto: checkpoint.vehicles,
    previousManualVehicles: checkpoint.manualVehicles,
  });
}

/**
 * The two-world host. It owns which kind is live, the epoch of each kind, the checkpoint of each
 * switch and the single commit lane; it never owns a second physical world.
 */
export function createSessionKindHost(options: SessionKindHostOptions): SessionKindHost {
  const academyProfileId = identityText(
    options.academyProfile.profileId,
    'academyProfile.profileId',
  );
  if (!verifyProfileVersionChecksum(options.academyProfile)) {
    throw new PersistenceError('INVALID_RECORD', 'The Academy profile is not valid');
  }
  const chaosCheck = verifyChaosProfileCopy(options.chaosProfile);
  if (chaosCheck.status === 'REJECTED') {
    throw new PersistenceError('INVALID_RECORD', chaosCheck.rejection.message);
  }
  const chaosProfile = chaosCheck.copy;
  const academySessionId = identityText(options.academySessionId, 'academySessionId');
  const chaosSessionId = identityText(options.chaosSessionId, 'chaosSessionId');
  if (academySessionId === chaosSessionId) {
    throw new PersistenceError('INVALID_RECORD', 'The two session kinds need distinct sessions');
  }
  if (chaosProfile.sessionId !== chaosSessionId) {
    throw new PersistenceError('INVALID_RECORD', 'The Haos copy belongs to another session');
  }

  const kinds: Record<SessionKind, SessionKindStatus> = {
    ACADEMY: Object.freeze({
      sessionId: academySessionId,
      profileId: academyProfileId,
      worldEpoch: 1,
      learningEpoch: 0,
      checkpoints: 0,
      lastTick: null,
      lastCheckpointId: null,
      entries: 0,
    }),
    CHAOS: Object.freeze({
      sessionId: chaosSessionId,
      profileId: chaosProfile.profile.profileId,
      worldEpoch: 1,
      learningEpoch: 0,
      checkpoints: 0,
      lastTick: null,
      lastCheckpointId: null,
      entries: 0,
    }),
  };
  let state: Record<SessionKind, SessionKindStatus> = kinds;
  let live: SessionKind | null = null;
  let switching = false;
  let switches = 0;
  let failedSwitches = 0;

  function identityOf(sessionKind: SessionKind): SessionWorldIdentity {
    const current = state[sessionKind];
    return Object.freeze({
      sessionKind,
      sessionId: current.sessionId,
      worldEpoch: current.worldEpoch,
      learningEpoch: current.learningEpoch,
    });
  }

  function replace(sessionKind: SessionKind, patch: Partial<SessionKindStatus>): void {
    const next = Object.freeze({ ...state[sessionKind], ...patch });
    state =
      sessionKind === 'ACADEMY'
        ? { ACADEMY: next, CHAOS: state.CHAOS }
        : { ACADEMY: state.ACADEMY, CHAOS: next };
  }

  function status(): SessionKindHostStatus {
    const residentJobs = live === null ? 0 : options.world.residentJobs(identityOf(live));
    const listeners = live === null ? 0 : options.world.listeners(identityOf(live));
    return Object.freeze({
      version: SESSION_KINDS_VERSION,
      live,
      switching,
      switches,
      failedSwitches,
      kinds: Object.freeze({
        ACADEMY: Object.freeze({ ...state.ACADEMY }),
        CHAOS: Object.freeze({ ...state.CHAOS }),
      }),
      resident: Object.freeze({
        liveWorlds: live === null ? 0 : 1,
        residentJobs,
        listeners,
        profileCopies: 1,
        checkpoints: state.ACADEMY.checkpoints + state.CHAOS.checkpoints,
      }),
      historyScans: 0 as const,
    });
  }

  return {
    start(sessionKind) {
      let kind: SessionKind;
      try {
        kind = requireSessionKind(sessionKind, 'sessionKind');
      } catch (error) {
        return Object.freeze({
          status: 'REJECTED' as const,
          code: 'UNKNOWN_SESSION_KIND' as const,
          message: describe(error),
          world: live,
          closedSegments: 0,
          checkpointId: null,
        });
      }
      if (live !== null) {
        return Object.freeze({
          status: 'REJECTED' as const,
          code: 'ALREADY_ACTIVE' as const,
          message: `The ${live} world is already live`,
          world: live,
          closedSegments: 0,
          checkpointId: null,
        });
      }
      const identity = identityOf(kind);
      const profileId = state[kind].profileId;
      options.world.start({ ...identity, profileId, launch: 'PAUSED_AUTO' });
      live = kind;
      replace(kind, { entries: state[kind].entries + 1 });
      return Object.freeze({
        status: 'STARTED' as const,
        sessionKind: kind,
        launch: Object.freeze({
          mode: 'PAUSED_AUTO' as const,
          paused: true as const,
          auto: true as const,
          inputReleased: true as const,
          manualVehicles: 0 as const,
          vehiclesInAuto: 0,
          previousManualVehicles: 0,
        }),
        identity,
      });
    },

    async switchTo(sessionKind) {
      let kind: SessionKind;
      try {
        kind = requireSessionKind(sessionKind, 'sessionKind');
      } catch (error) {
        return Object.freeze({
          status: 'REJECTED' as const,
          code: 'UNKNOWN_SESSION_KIND' as const,
          message: describe(error),
          world: live,
          closedSegments: 0,
          checkpointId: null,
        });
      }
      if (live === null) {
        return Object.freeze({
          status: 'REJECTED' as const,
          code: 'NOT_STARTED' as const,
          message: 'No session kind is live; start one before switching',
          world: null,
          closedSegments: 0,
          checkpointId: null,
        });
      }
      if (live === kind) {
        return Object.freeze({
          status: 'REJECTED' as const,
          code: 'ALREADY_ACTIVE' as const,
          message: `The ${kind} world is already live`,
          world: live,
          closedSegments: 0,
          checkpointId: null,
        });
      }
      if (switching) {
        return Object.freeze({
          status: 'REJECTED' as const,
          code: 'SWITCH_IN_PROGRESS' as const,
          message: 'A session switch is already in progress',
          world: live,
          closedSegments: 0,
          checkpointId: null,
        });
      }

      const from = live;
      const identity = identityOf(from);
      switching = true;
      try {
        let closedSegments = 0;
        let capture: SessionWorldCapture;
        try {
          closedSegments = options.world.closeSegment(identity);
          capture = options.world.capture(identity);
        } catch (error) {
          switching = false;
          failedSwitches += 1;
          return Object.freeze({
            status: 'REJECTED' as const,
            code: 'CAPTURE_FAILED' as const,
            message: describe(error),
            world: from,
            closedSegments,
            checkpointId: null,
          });
        }

        const generation = state[from].checkpoints + 1;
        const bodyBytes = new TextEncoder().encode(
          canonicalText(capture.body, 'switch.body'),
        ).length;
        const draft = {
          version: SESSION_KINDS_VERSION,
          checkpointId: `checkpoint:${from}:${state[from].sessionId}:${generation}`,
          sessionKind: from,
          sessionId: state[from].sessionId,
          profileId: state[from].profileId,
          worldEpoch: identity.worldEpoch,
          learningEpoch: identity.learningEpoch,
          tick: counter(capture.tick, 'switch.tick'),
          generation,
          reason: 'SESSION_SWITCH' as const,
          createdAt: clockText(options.now(), 'switch.createdAt'),
          vehicles: counter(capture.vehicles, 'switch.vehicles'),
          manualVehicles: counter(capture.manualVehicles, 'switch.manualVehicles'),
          launch: 'PAUSED_AUTO' as const,
          body: capture.body,
          bodyBytes,
        };
        const checkpoint: SessionKindCheckpoint = Object.freeze({
          ...draft,
          checksum: computeSessionKindCheckpointChecksum(draft),
        });
        const committed = await options.store.commit(checkpoint);
        if (committed.status === 'REJECTED') {
          switching = false;
          failedSwitches += 1;
          return Object.freeze({
            status: 'REJECTED' as const,
            code: committed.rejection.code === 'SAVE_FAILED' ? 'SAVE_FAILED' : 'CHECKPOINT_INVALID',
            message: committed.rejection.message,
            world: from,
            closedSegments,
            checkpointId: checkpoint.checkpointId,
          });
        }

        const invalidatedJobs = options.world.invalidateJobs(identity, 'SESSION_SWITCH');
        const releasedInputs = options.world.releaseInput(identity);
        options.world.stop(identity);

        replace(from, {
          checkpoints: generation,
          lastTick: checkpoint.tick,
          lastCheckpointId: checkpoint.checkpointId,
          worldEpoch: identity.worldEpoch + 1,
        });
        const entering = state[kind];
        const nextLearningEpoch = entering.entries === 0 ? 0 : entering.learningEpoch + 1;
        replace(kind, {
          learningEpoch: nextLearningEpoch,
          entries: entering.entries + 1,
        });
        const nextIdentity: SessionWorldIdentity = Object.freeze({
          sessionKind: kind,
          sessionId: state[kind].sessionId,
          worldEpoch: state[kind].worldEpoch,
          learningEpoch: state[kind].learningEpoch,
        });
        options.world.start({
          ...nextIdentity,
          profileId: state[kind].profileId,
          launch: 'PAUSED_AUTO',
        });
        live = kind;
        switches += 1;
        switching = false;
        return Object.freeze({
          status: 'SWITCHED' as const,
          from,
          to: kind,
          checkpointId: checkpoint.checkpointId,
          generation,
          closedSegments,
          invalidatedJobs,
          releasedInputs,
          launch: launchOf(checkpoint),
          identity: nextIdentity,
        });
      } finally {
        switching = false;
      }
    },

    async restore(sessionKind) {
      let kind: SessionKind;
      try {
        kind = requireSessionKind(sessionKind, 'sessionKind');
      } catch (error) {
        return Object.freeze({
          status: 'REJECTED' as const,
          code: 'UNKNOWN_SESSION_KIND' as const,
          message: describe(error),
          sessionKind: 'ACADEMY' as const,
        });
      }
      const checkpoint = await options.store.latest(kind);
      if (checkpoint === null) {
        return Object.freeze({
          status: 'REJECTED' as const,
          code: 'CHECKPOINT_MISSING' as const,
          message: `No ${kind} checkpoint was committed`,
          sessionKind: kind,
        });
      }
      if (checkpoint.sessionKind !== kind || checkpoint.sessionId !== state[kind].sessionId) {
        return Object.freeze({
          status: 'REJECTED' as const,
          code: 'FOREIGN_CHECKPOINT' as const,
          message: `The ${checkpoint.sessionKind} checkpoint does not belong to the ${kind} session`,
          sessionKind: kind,
        });
      }
      replace(kind, {
        worldEpoch: checkpoint.worldEpoch,
        learningEpoch: checkpoint.learningEpoch,
        lastTick: checkpoint.tick,
        lastCheckpointId: checkpoint.checkpointId,
      });
      const identity = identityOf(kind);
      if (live !== null && live !== kind) {
        const leaving = identityOf(live);
        options.world.invalidateJobs(leaving, 'RELOAD');
        options.world.releaseInput(leaving);
        options.world.stop(leaving);
      }
      options.world.start({
        ...identity,
        profileId: state[kind].profileId,
        launch: 'PAUSED_AUTO',
      });
      live = kind;
      return Object.freeze({
        status: 'RESTORED' as const,
        sessionKind: kind,
        checkpointId: checkpoint.checkpointId,
        tick: checkpoint.tick,
        worldEpoch: checkpoint.worldEpoch,
        learningEpoch: checkpoint.learningEpoch,
        launch: launchOf(checkpoint),
        checksum: checkpoint.checksum,
      });
    },

    async reload() {
      if (live === null) {
        return Object.freeze({
          status: 'EMPTY' as const,
          message: 'No world was started, so there is nothing to reload',
        });
      }
      const kind = live;
      const checkpoint = await options.store.latest(kind);
      if (checkpoint === null) {
        return Object.freeze({
          status: 'EMPTY' as const,
          message: `The ${kind} world has no committed checkpoint`,
        });
      }
      const launch = launchOf(checkpoint);
      if (!isPausedAutoLaunch(launch)) {
        throw new PersistenceError('INVALID_RECORD', 'A reload must relaunch in PAUSED_AUTO');
      }
      return Object.freeze({
        status: 'RESUMED' as const,
        sessionKind: kind,
        checkpointId: checkpoint.checkpointId,
        tick: checkpoint.tick,
        launch,
      });
    },

    acceptJobResult(value) {
      const data = record(value, 'jobResult');
      const sessionKind = requireSessionKind(data.sessionKind, 'jobResult.sessionKind');
      const jobId = identityText(data.jobId, 'jobResult.jobId');
      if (live === null) {
        return Object.freeze({
          status: 'LATE_RESULT' as const,
          jobId,
          reason: 'SESSION_KIND_MISMATCH' as const,
          expected: Object.freeze({
            sessionKind,
            sessionId: state[sessionKind].sessionId,
            worldEpoch: state[sessionKind].worldEpoch,
            learningEpoch: state[sessionKind].learningEpoch,
          }),
        });
      }
      const expected = identityOf(live);
      const reason =
        sessionKind !== live
          ? ('SESSION_KIND_MISMATCH' as const)
          : data.sessionId !== expected.sessionId
            ? ('SESSION_MISMATCH' as const)
            : data.worldEpoch !== expected.worldEpoch
              ? ('WORLD_EPOCH_MISMATCH' as const)
              : data.learningEpoch !== expected.learningEpoch
                ? ('LEARNING_EPOCH_MISMATCH' as const)
                : null;
      if (reason !== null) {
        return Object.freeze({ status: 'LATE_RESULT' as const, jobId, reason, expected });
      }
      return Object.freeze({ status: 'ACCEPTED' as const, jobId });
    },

    status,
  };
}

/* --------------------------------------------------------------------- utils */

function canonicalText(value: unknown, path: string): string {
  const canonical = canonicalizeJson(value, { maxDepth: 32 });
  if (canonical.status === 'REJECTED') {
    throw new PersistenceError(
      'BODY_INVALID',
      `The ${path} value is not canonical: ${canonical.rejection.message}`,
      path,
    );
  }
  return canonical.text;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

import { choice, fields, record, requireContract, text, tick as readTick } from '../sessions';
import { PROFILE_ACTIVATION_LIMITS, profileActivationOrigins } from '../fleet';
import type {
  CityProfileSource,
  FleetRegistry,
  ProfileActivation,
  ProfileActivationCommand,
  ProfileActivationOrigin,
  ProfileActivationRejectionCode,
} from '../fleet';
import type { ProfileStore, ProfileVersion } from '../profiles';

/**
 * Composition root for PBI 110.
 *
 * It reads the immutable 109 `ProfileVersion` by id, checks that it belongs to the live city
 * profile and to the store engine, then hands the publication to the 110 controller with the
 * accepted fixed tick. It never mutates the store, never publishes a new version, never chooses a
 * wall-clock timestamp and never touches physics, routes, rides or the camera.
 */
export const PROFILE_ACTIVATION_APP_VERSION = '110-profile-activation-app-v1' as const;

/** Closed composition errors; the activation's own closed reasons stay untouched. */
export const profileActivationAppErrors = [
  'VERSION_NOT_FOUND',
  'PROFILE_MISMATCH',
  'ENGINE_MISMATCH',
  'STALE_TICK',
  'PUBLICATION_REJECTED',
] as const;
export type ProfileActivationAppError = (typeof profileActivationAppErrors)[number];

export interface ProfileActivationAppRejection {
  readonly code: ProfileActivationAppError;
  readonly message: string;
  /** The controller's closed publication reason, when the rejection came from it. */
  readonly activationCode: ProfileActivationRejectionCode | null;
}

export interface ProfileActivationReadSources {
  readonly store: ProfileStore;
  readonly registry: FleetRegistry;
  /** Optional controller; when present its pinned engine also gates the read. */
  readonly activation?: ProfileActivation;
}

export interface ProfileActivationPublishSources extends ProfileActivationReadSources {
  readonly activation: ProfileActivation;
  /** Accepted fixed tick. A publication never reads the wall-clock. */
  readonly clock: () => number;
}

export interface ProfileActivationReadRequest {
  readonly versionId: string;
}

export interface ProfileActivationPublishRequest extends ProfileActivationReadRequest {
  readonly origin: ProfileActivationOrigin;
  readonly idempotencyKey: string;
  readonly reason: string;
}

export interface ProfileActivationReadAccepted {
  readonly version: typeof PROFILE_ACTIVATION_APP_VERSION;
  readonly status: 'FOUND';
  readonly versionId: string;
  readonly profileId: string;
  readonly engineVersion: string;
  /** Deep-frozen copy owned by the 109 store; never a mutable reference. */
  readonly profileVersion: ProfileVersion;
  readonly rejection: null;
}

export interface ProfileActivationReadRejected {
  readonly version: typeof PROFILE_ACTIVATION_APP_VERSION;
  readonly status: 'REJECTED';
  readonly versionId: string | null;
  readonly profileId: string | null;
  readonly engineVersion: string | null;
  readonly profileVersion: null;
  readonly rejection: ProfileActivationAppRejection;
}

export type ProfileActivationReadResult =
  ProfileActivationReadAccepted | ProfileActivationReadRejected;

export interface ProfileActivationPublishAccepted {
  readonly version: typeof PROFILE_ACTIVATION_APP_VERSION;
  readonly status: 'PUBLISHED';
  /** `true` when the controller returned the existing command for this idempotency key. */
  readonly duplicate: boolean;
  readonly command: ProfileActivationCommand;
  readonly read: ProfileActivationReadAccepted;
  readonly rejection: null;
}

export interface ProfileActivationPublishRejected {
  readonly version: typeof PROFILE_ACTIVATION_APP_VERSION;
  readonly status: 'REJECTED';
  readonly duplicate: false;
  readonly command: null;
  readonly read: ProfileActivationReadAccepted | null;
  readonly rejection: ProfileActivationAppRejection;
}

export type ProfileActivationPublishResult =
  ProfileActivationPublishAccepted | ProfileActivationPublishRejected;

function boundedId(value: unknown, field: string): string {
  const id = text(value);
  requireContract(id.trim() === id && id.length <= 256, `Invalid ${field}`);
  return id;
}

function boundedText(value: unknown, field: string, maximum: number): string {
  const result = text(value);
  requireContract(result.trim() === result && result.length <= maximum, `Invalid ${field}`);
  return result;
}

function reject(
  code: ProfileActivationAppError,
  message: string,
  activationCode: ProfileActivationRejectionCode | null = null,
): ProfileActivationAppRejection {
  return Object.freeze({ code, message, activationCode });
}

function readResult(fieldsOf: {
  readonly status: 'FOUND' | 'REJECTED';
  readonly versionId: string | null;
  readonly profileId: string | null;
  readonly engineVersion: string | null;
  readonly profileVersion: ProfileVersion | null;
  readonly rejection: ProfileActivationAppRejection | null;
}): ProfileActivationReadResult {
  if (fieldsOf.status === 'FOUND') {
    if (
      fieldsOf.versionId === null ||
      fieldsOf.profileId === null ||
      fieldsOf.engineVersion === null ||
      fieldsOf.profileVersion === null
    )
      throw new Error('Profile activation read is incomplete');
    return Object.freeze({
      version: PROFILE_ACTIVATION_APP_VERSION,
      status: 'FOUND' as const,
      versionId: fieldsOf.versionId,
      profileId: fieldsOf.profileId,
      engineVersion: fieldsOf.engineVersion,
      profileVersion: fieldsOf.profileVersion,
      rejection: null,
    });
  }
  if (fieldsOf.rejection === null) throw new Error('Profile activation rejection is missing');
  return Object.freeze({
    version: PROFILE_ACTIVATION_APP_VERSION,
    status: 'REJECTED' as const,
    versionId: null,
    profileId: null,
    engineVersion: null,
    profileVersion: null,
    rejection: fieldsOf.rejection,
  });
}

function readSources(value: unknown): ProfileActivationReadSources {
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract(
      key === 'store' || key === 'registry' || key === 'activation' || key === 'clock',
      `Unknown profile activation source: ${key}`,
    );
  const store = data.store as ProfileStore | undefined;
  const registry = data.registry as FleetRegistry | undefined;
  requireContract(
    typeof store === 'object' &&
      store !== null &&
      typeof store.getVersion === 'function' &&
      typeof store.engineVersion === 'string',
    'Profile activation requires a real profile store',
  );
  requireContract(
    typeof registry === 'object' &&
      registry !== null &&
      typeof registry.configuration === 'object' &&
      registry.configuration !== null &&
      typeof registry.configuration.profile?.profileId === 'string',
    'Profile activation requires a real fleet registry',
  );
  requireContract(
    data.activation === undefined ||
      (typeof data.activation === 'object' && data.activation !== null),
    'Profile activation has an invalid controller',
  );
  return value as ProfileActivationReadSources;
}

/**
 * Reads one immutable 109 version and validates it against the live city profile and engine.
 * Pure read: the store and the fleet are never mutated.
 */
export function readProfileActivation(
  sources: ProfileActivationReadSources,
  request: ProfileActivationReadRequest,
): ProfileActivationReadResult {
  const data = readSources(sources);
  const requestData = fields(request, ['versionId']);
  const versionId = boundedId(requestData.versionId, 'versionId');
  const stored = data.store.getVersion(versionId);
  if (stored === null)
    return readResult({
      status: 'REJECTED',
      versionId: null,
      profileId: null,
      engineVersion: null,
      profileVersion: null,
      rejection: reject('VERSION_NOT_FOUND', `Version ${versionId} is not in the profile store`),
    });
  const cityProfileId = data.registry.configuration.profile.profileId;
  if (stored.profileId !== cityProfileId)
    return readResult({
      status: 'REJECTED',
      versionId: null,
      profileId: null,
      engineVersion: null,
      profileVersion: null,
      rejection: reject(
        'PROFILE_MISMATCH',
        `Version ${versionId} belongs to ${stored.profileId}, not ${cityProfileId}`,
      ),
    });
  if (stored.engineVersion !== data.store.engineVersion)
    return readResult({
      status: 'REJECTED',
      versionId: null,
      profileId: null,
      engineVersion: null,
      profileVersion: null,
      rejection: reject(
        'ENGINE_MISMATCH',
        `Version ${versionId} targets engine ${stored.engineVersion}, not ${data.store.engineVersion}`,
      ),
    });
  const pinned = data.activation?.engineVersion ?? null;
  if (pinned !== null && stored.engineVersion !== pinned)
    return readResult({
      status: 'REJECTED',
      versionId: null,
      profileId: null,
      engineVersion: null,
      profileVersion: null,
      rejection: reject(
        'ENGINE_MISMATCH',
        `Version ${versionId} targets engine ${stored.engineVersion}, not ${pinned}`,
      ),
    });
  return readResult({
    status: 'FOUND',
    versionId,
    profileId: stored.profileId,
    engineVersion: stored.engineVersion,
    profileVersion: stored,
    rejection: null,
  });
}

function mapActivationCode(code: ProfileActivationRejectionCode): ProfileActivationAppError {
  if (code === 'TICK_NOT_ADVANCING') return 'STALE_TICK';
  if (code === 'PROFILE_MISMATCH') return 'PROFILE_MISMATCH';
  if (code === 'ENGINE_MISMATCH') return 'ENGINE_MISMATCH';
  return 'PUBLICATION_REJECTED';
}

/**
 * Publishes one already-stored version for the next common tick. The tick comes exclusively from
 * the injected fixed-tick readback; the store is never written and no new version is created.
 */
export function publishProfileVersion(
  sources: ProfileActivationPublishSources,
  request: ProfileActivationPublishRequest,
): ProfileActivationPublishResult {
  const data = readSources(sources);
  const requestData = fields(request, ['versionId', 'origin', 'idempotencyKey', 'reason']);
  const origin = choice(requestData.origin, profileActivationOrigins);
  const idempotencyKey = boundedId(requestData.idempotencyKey, 'idempotencyKey');
  const reason = boundedText(
    requestData.reason,
    'reason',
    PROFILE_ACTIVATION_LIMITS.reasonCodeUnits,
  );
  const read = readProfileActivation(data, {
    versionId: boundedId(requestData.versionId, 'versionId'),
  });
  if (read.status === 'REJECTED')
    return Object.freeze({
      version: PROFILE_ACTIVATION_APP_VERSION,
      status: 'REJECTED' as const,
      duplicate: false as const,
      command: null,
      read: null,
      rejection: read.rejection,
    });
  requireContract(
    typeof data.activation?.publish === 'function',
    'A profile activation is required',
  );
  requireContract(typeof sources.clock === 'function', 'A fixed-tick clock is required');
  const atTick = readTick(sources.clock());
  const publication = data.activation.publish({
    profileId: read.profileId,
    versionId: read.versionId,
    engineVersion: read.engineVersion,
    publishedAtTick: atTick,
    activateAtTick: atTick + 1,
    reason,
    origin,
    idempotencyKey,
  });
  if (publication.status === 'REJECTED' || publication.command === null)
    return Object.freeze({
      version: PROFILE_ACTIVATION_APP_VERSION,
      status: 'REJECTED' as const,
      duplicate: false as const,
      command: null,
      read,
      rejection: reject(
        mapActivationCode(publication.rejection?.code ?? 'INVALID_VERSION'),
        publication.rejection?.message ?? 'The profile activation rejected the publication',
        publication.rejection?.code ?? null,
      ),
    });
  return Object.freeze({
    version: PROFILE_ACTIVATION_APP_VERSION,
    status: 'PUBLISHED' as const,
    duplicate: publication.duplicate,
    command: publication.command,
    read,
    rejection: null,
  });
}

/**
 * Read-only `CityProfileSource` adapter: a registry constructed with it reads the live
 * pending/applied activation target, so a vehicle created later receives the current version.
 */
export function createCityProfileSource(
  activation: Pick<ProfileActivation, 'activeProfile'>,
): CityProfileSource {
  requireContract(
    typeof activation === 'object' &&
      activation !== null &&
      typeof activation.activeProfile === 'function',
    'A city profile source requires a profile activation',
  );
  return Object.freeze({ activeProfile: () => activation.activeProfile() });
}

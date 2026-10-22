import { fields, record, requireContract, text, tick as readTick } from '../sessions';
import {
  getParameterDefinition,
  parameterDefinitions,
  parsePublishableDrivingProfile,
  validateParameterValue,
  verifyProfileVersionChecksum,
} from '../profiles';
import type { ProfileStore, ProfileVersion } from '../profiles';
import type { ProfileActivation } from '../fleet';
import type {
  LearningChangeReason,
  LearningEpochBarrier,
  LearningEpochBarrierRecord,
} from './learning-epoch';

/**
 * Restore, import and new-profile orchestration for PBI 114.
 *
 * Every path that changes the learning target is resolved through the real 205 `learningEpoch`
 * barrier and one new common 110 activation. A restore never clones or edits a 109 version, an
 * import never touches XP or missions, and a style reset is a pure activation of the stored base
 * version with no progression write at all.
 *
 * The module is a composition root: it reads `store.getVersion`/`listVersions`, validates the
 * version identity, schema, profile and engine, and delegates the barrier transaction to the
 * injected 205 barrier. It never estimates, composes, validates a delta itself, edits a version,
 * moves a vehicle, writes XP or completes a mission. A 109 store is still the only writer of a
 * version; a 110 controller is still the only publisher of an activation.
 */
export const PROFILE_RESTORE_VERSION = '114-profile-restore-v1' as const;

/** Provenance of the requested change, independent of the 110 origin vocabulary. */
export const profileRestoreProvenances = [
  'RESTORE',
  'IMPORT',
  'NEW_PROFILE',
  'RESET_STYLE',
] as const;
export type ProfileRestoreProvenance = (typeof profileRestoreProvenances)[number];

/** Closed orchestration status. `PENDING` waits for the barrier's tick boundary. */
export const profileRestoreStatuses = [
  'COMMITTED',
  'PENDING',
  'ALREADY_ACTIVE',
  'REJECTED',
] as const;
export type ProfileRestoreStatus = (typeof profileRestoreStatuses)[number];

/** Closed rejection reasons owned by this composition root. */
export const profileRestoreRejectionCodes = [
  'VERSION_NOT_FOUND',
  'VERSION_PROFILE_MISMATCH',
  'VERSION_ENGINE_MISMATCH',
  'VERSION_CORRUPT',
  'VERSION_MUTATED',
  'PROFILE_NOT_FOUND',
  'PROFILE_MISMATCH',
  'PLAYER_MISMATCH',
  'BASE_NOT_FOUND',
  'BASE_INVALID',
  'TARGET_PROFILE_MISMATCH',
  'IMPORT_INVALID',
  'STORE_REJECTED',
  'BARRIER_REJECTED',
  'BARRIER_ROLLED_BACK',
  'ACTIVATION_MISSING',
  'TICK_NOT_ADVANCING',
] as const;
export type ProfileRestoreRejectionCode = (typeof profileRestoreRejectionCodes)[number];

/**
 * The 205 barrier reason used for each provenance. 205 has no `RESET_STYLE`: a reset is a restore
 * of the stored base version, so its barrier reason and 110 origin are both `RESTORE`.
 */
export const PROFILE_RESTORE_BARRIER_REASON: Readonly<
  Record<ProfileRestoreProvenance, LearningChangeReason>
> = Object.freeze({
  RESTORE: 'RESTORE',
  IMPORT: 'IMPORT',
  NEW_PROFILE: 'NEW_PROFILE',
  RESET_STYLE: 'RESTORE',
});

/** The 110 origin actually published by 205 for each provenance. */
export const PROFILE_RESTORE_ACTIVATION_ORIGIN: Readonly<
  Record<ProfileRestoreProvenance, 'RESTORE' | 'IMPORT' | 'MANUAL_TUNING'>
> = Object.freeze({
  RESTORE: 'RESTORE',
  IMPORT: 'IMPORT',
  NEW_PROFILE: 'MANUAL_TUNING',
  RESET_STYLE: 'RESTORE',
});

export const PROFILE_RESTORE_LIMITS = Object.freeze({
  historyRows: 16,
  reportRows: 8,
  idCodeUnits: 256,
  reasonCodeUnits: 240,
});

/**
 * Read-only progression ports. They are accepted and reported, never called: a style reset may
 * not award XP, complete a mission, lower a level or reset a challenge. The zero-call report is
 * the assertion that the rule holds.
 */
export interface ProfileRestoreProgressionPorts {
  readonly awardXp?: (input: unknown) => unknown;
  readonly completeMission?: (input: unknown) => unknown;
  readonly resetProgress?: (input?: unknown) => unknown;
  readonly mutate?: (input: unknown) => unknown;
}

/** Identity of a barrier created for a profile that differs from the pinned active one. */
export interface ProfileRestoreBarrierInput {
  readonly playerId: string;
  readonly profileId: string;
  readonly engineVersion: string;
  /** Existing generation the new barrier starts from; it is not the target version. */
  readonly fromVersionId: string;
  readonly segmentId: string;
  readonly openedTick: number;
}

export interface ProfileRestoreServices {
  readonly playerId: string;
  readonly profileId: string;
  readonly engineVersion: string;
  readonly store: ProfileStore;
  readonly barrier: LearningEpochBarrier;
  /** Optional 110 readback used only to recognise an already applied target. */
  readonly activation?: Pick<ProfileActivation, 'pending' | 'activeProfile'>;
  /**
   * Builds a correctly pinned 205 barrier for another profile. Required only when
   * `newProfileFromBase` targets a `profileId` that is not the barrier's own profile.
   */
  readonly barrierFor?: (input: ProfileRestoreBarrierInput) => LearningEpochBarrier;
  readonly progression?: ProfileRestoreProgressionPorts;
  /** Fixed-tick readback owned by the host. */
  readonly tick: () => number;
  /** Deterministic UTC timestamp for a newly created 109 record. */
  readonly now?: () => string;
}

export interface ProfileRestoreRequest {
  readonly profileId: string;
  readonly versionId: string;
  readonly tick: number;
}

export interface ProfileImportRequest {
  readonly importedProfile: unknown;
  readonly tick: number;
}

export interface ProfileNewProfileRequest {
  readonly playerId: string;
  readonly profileId: string;
  readonly baseParameters?: Readonly<Record<string, number>>;
  readonly tick: number;
}

export interface ProfileResetStyleRequest {
  readonly profileId: string;
  readonly tick: number;
  /** Extra spy port for the reset scenario; it is never invoked. */
  readonly progression?: ProfileRestoreProgressionPorts;
}

/** One published common activation, read back from the committed 205 barrier. */
export interface ProfileRestoreActivation {
  readonly commandId: string | null;
  readonly profileId: string;
  readonly versionId: string;
  readonly activateAtTick: number | null;
  readonly origin: 'RESTORE' | 'IMPORT' | 'MANUAL_TUNING';
  readonly duplicate: boolean;
}

export interface ProfileRestoreBarrierSummary {
  readonly barrierId: string;
  readonly status: string;
  readonly reason: LearningChangeReason;
  readonly fromLearningEpoch: number;
  readonly learningEpoch: number;
  readonly targetVersionId: string;
  readonly activationCommandId: string | null;
  readonly activationTick: number | null;
  readonly cancelledJobs: readonly string[];
  readonly physicalPreserved: boolean;
}

export interface ProfileRestoreStoreSummary {
  readonly versions: number;
  readonly profiles: number;
  readonly baseVersions: number;
  readonly derivedVersions: number;
  readonly versionChecksum: string | null;
}

/** Deterministic transcript of one orchestration call. It contains no wall clock or randomness. */
export interface ProfileRestoreReport {
  readonly version: typeof PROFILE_RESTORE_VERSION;
  readonly status: ProfileRestoreStatus;
  readonly provenance: ProfileRestoreProvenance | null;
  readonly reason: ProfileRestoreProvenance | ProfileRestoreRejectionCode;
  readonly profileId: string | null;
  readonly versionId: string | null;
  readonly versionCreated: boolean;
  readonly versionsAdded: number;
  readonly tick: number;
  readonly barrier: ProfileRestoreBarrierSummary | null;
  readonly store: ProfileRestoreStoreSummary;
  readonly activation: ProfileRestoreActivation | null;
  readonly progressionCalls: 0;
}

export interface ProfileRestoreResult {
  readonly version: typeof PROFILE_RESTORE_VERSION;
  readonly status: ProfileRestoreStatus;
  readonly provenance: ProfileRestoreProvenance | null;
  readonly reason: ProfileRestoreProvenance | ProfileRestoreRejectionCode;
  readonly barrierId: string | null;
  readonly activation: ProfileRestoreActivation | null;
  readonly versionId: string | null;
  readonly versionCreated: boolean;
  readonly versionsAdded: number;
  readonly profileId: string | null;
  readonly tick: number;
  readonly progressionCalls: 0;
  /** Fresh frozen copy; never a reference to a mutable internal record. */
  readonly report: ProfileRestoreReport;
}

const serviceFields = [
  'playerId',
  'profileId',
  'engineVersion',
  'store',
  'barrier',
  'activation',
  'barrierFor',
  'progression',
  'tick',
  'now',
] as const;

function bounded(value: string, maximum: number = PROFILE_RESTORE_LIMITS.idCodeUnits): string {
  return value.length > maximum ? value.slice(0, maximum) : value;
}

function readServices(value: unknown): ProfileRestoreServices {
  const data = record(value);
  const allowed = new Set<string>(serviceFields);
  for (const key of Object.keys(data)) {
    requireContract(allowed.has(key), `Unknown profile restore service: ${key}`);
  }
  requireContract(
    typeof data.store === 'object' &&
      data.store !== null &&
      typeof (data.store as ProfileStore).getVersion === 'function' &&
      typeof (data.store as ProfileStore).listVersions === 'function',
    'Profile restore requires the real 109 profile store',
  );
  requireContract(
    typeof data.barrier === 'object' &&
      data.barrier !== null &&
      typeof (data.barrier as LearningEpochBarrier).requestChange === 'function' &&
      typeof (data.barrier as LearningEpochBarrier).resolve === 'function',
    'Profile restore requires the real 205 learning epoch barrier',
  );
  requireContract(typeof data.tick === 'function', 'Profile restore needs a fixed-tick readback');
  requireContract(
    typeof data.playerId === 'string' &&
      typeof data.profileId === 'string' &&
      typeof data.engineVersion === 'string',
    'Profile restore needs a complete identity',
  );
  const services = data as unknown as ProfileRestoreServices;
  requireContract(
    services.barrier.profileId === services.profileId,
    'The 205 barrier is pinned to another profile',
  );
  requireContract(
    services.barrier.playerId === services.playerId,
    'The 205 barrier belongs to another player',
  );
  requireContract(
    services.barrier.engineVersion === services.engineVersion,
    'The 205 barrier and the profile restore engine differ',
  );
  requireContract(
    services.store.engineVersion === services.engineVersion,
    'The 109 store and the profile restore engine differ',
  );
  return services;
}

function readRequestFields(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  contract: string,
): Record<string, unknown> {
  const data = record(value);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(data)) {
    requireContract(allowed.has(key), `Unknown ${contract} field: ${key}`);
  }
  for (const key of required) {
    requireContract(Object.hasOwn(data, key), `Missing ${contract} field: ${key}`);
  }
  return data;
}

function readStoreIdentity(
  services: ProfileRestoreServices,
  profileId: string,
  versionId: string,
  engineVersion: string,
): ProfileRestoreRejectionCode | ProfileVersion {
  let stored: ProfileVersion | null;
  try {
    stored = services.store.getVersion(versionId);
  } catch {
    return 'VERSION_NOT_FOUND';
  }
  if (stored === null) return 'VERSION_NOT_FOUND';
  if (stored.profileId !== profileId) return 'VERSION_PROFILE_MISMATCH';
  if (stored.engineVersion !== engineVersion) return 'VERSION_ENGINE_MISMATCH';
  if (!verifyProfileVersionChecksum(stored)) return 'VERSION_CORRUPT';
  return stored;
}

function isRejectionCode(
  value: ProfileRestoreRejectionCode | ProfileVersion,
): value is ProfileRestoreRejectionCode {
  return typeof value === 'string';
}

function sameParameters(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index += 1) {
    if (leftKeys[index] !== rightKeys[index]) return false;
    if (left[leftKeys[index]] !== right[leftKeys[index]]) return false;
  }
  return true;
}

function activeVersionId(
  services: ProfileRestoreServices,
  barrier: LearningEpochBarrier,
): string | null {
  // The committed 205 generation is the authoritative learning target; the 110 readback is only a
  // secondary witness for a host that applied an activation outside this barrier.
  try {
    const current = barrier.current().baseVersionId;
    if (current.length > 0) return current;
  } catch {
    // Fall through to the 110 readback.
  }
  try {
    const active = services.activation?.activeProfile();
    if (active !== undefined) return active.versionId;
  } catch {
    // A read failure never invents an active target.
  }
  try {
    const pending = services.activation?.pending();
    if (pending !== null && pending !== undefined) return pending.versionId;
  } catch {
    // No readback available.
  }
  return null;
}

function barrierSummary(
  record: LearningEpochBarrierRecord | null,
): ProfileRestoreBarrierSummary | null {
  if (record === null) return null;
  return Object.freeze({
    barrierId: record.barrierId,
    status: record.status,
    reason: record.reason,
    fromLearningEpoch: record.fromLearningEpoch,
    learningEpoch: record.learningEpoch,
    targetVersionId: record.targetVersionId,
    activationCommandId: record.activationCommandId,
    activationTick: record.activationTick,
    cancelledJobs: Object.freeze([...record.cancelledJobs]),
    physicalPreserved: record.physicalPreserved,
  });
}

function storeSummary(
  services: ProfileRestoreServices,
  versionId: string | null,
): ProfileRestoreStoreSummary {
  const stats = services.store.stats();
  let checksum: string | null = null;
  if (versionId !== null) {
    const stored = services.store.getVersion(versionId);
    checksum = stored === null ? null : stored.checksum;
  }
  return Object.freeze({
    versions: stats.versions,
    profiles: stats.profiles,
    baseVersions: stats.baseVersions,
    derivedVersions: stats.derivedVersions,
    versionChecksum: checksum,
  });
}

interface OutcomeInput {
  readonly status: ProfileRestoreStatus;
  readonly provenance: ProfileRestoreProvenance | null;
  readonly reason: ProfileRestoreProvenance | ProfileRestoreRejectionCode;
  readonly profileId: string | null;
  readonly versionId: string | null;
  readonly versionCreated: boolean;
  readonly versionsAdded: number;
  readonly tick: number;
  readonly barrier: LearningEpochBarrierRecord | null;
  readonly services: ProfileRestoreServices;
}

function outcome(input: OutcomeInput): ProfileRestoreResult {
  const activation =
    input.barrier === null || input.barrier.activationCommandId === null
      ? null
      : Object.freeze({
          commandId: input.barrier.activationCommandId,
          profileId: input.barrier.targetProfileId,
          versionId: input.barrier.targetVersionId,
          activateAtTick: input.barrier.activationTick,
          origin: PROFILE_RESTORE_ACTIVATION_ORIGIN[input.provenance ?? 'RESTORE'],
          duplicate: input.barrier.activationDuplicate,
        });
  const report: ProfileRestoreReport = Object.freeze({
    version: PROFILE_RESTORE_VERSION,
    status: input.status,
    provenance: input.provenance,
    reason: input.reason,
    profileId: input.profileId,
    versionId: input.versionId,
    versionCreated: input.versionCreated,
    versionsAdded: input.versionsAdded,
    tick: input.tick,
    barrier: barrierSummary(input.barrier),
    store: storeSummary(input.services, input.versionId),
    activation,
    progressionCalls: 0 as const,
  });
  return Object.freeze({
    version: PROFILE_RESTORE_VERSION,
    status: input.status,
    provenance: input.provenance,
    reason: input.reason,
    barrierId: input.barrier?.barrierId ?? null,
    activation,
    versionId: input.versionId,
    versionCreated: input.versionCreated,
    versionsAdded: input.versionsAdded,
    profileId: input.profileId,
    tick: input.tick,
    progressionCalls: 0 as const,
    report,
  });
}

function rejected(
  input: Omit<OutcomeInput, 'status' | 'barrier'> & {
    readonly reason: ProfileRestoreRejectionCode;
  },
): ProfileRestoreResult {
  return outcome({ ...input, status: 'REJECTED', barrier: null });
}

/**
 * Schedules and, when the host has already reached the boundary, commits one 205 barrier for an
 * existing target. The first call at tick `t` returns `PENDING`; the repeated call at `t + 1`
 * commits the same barrier without a second request. A target that is already active is a no-op
 * and never opens a barrier.
 */
function applyBarrier(
  services: ProfileRestoreServices,
  options: {
    readonly provenance: ProfileRestoreProvenance;
    readonly profileId: string;
    readonly versionId: string;
    readonly tick: number;
    readonly versionCreated: boolean;
    readonly versionsAdded: number;
    readonly barrier?: LearningEpochBarrier;
  },
): ProfileRestoreResult {
  const barrier = options.barrier ?? services.barrier;
  if (barrier.profileId !== options.profileId) {
    return rejected({
      provenance: options.provenance,
      reason: 'TARGET_PROFILE_MISMATCH',
      profileId: options.profileId,
      versionId: options.versionId,
      versionCreated: options.versionCreated,
      versionsAdded: options.versionsAdded,
      tick: options.tick,
      services,
    });
  }
  if (activeVersionId(services, barrier) === options.versionId) {
    return outcome({
      status: 'ALREADY_ACTIVE',
      provenance: options.provenance,
      reason: options.provenance,
      profileId: options.profileId,
      versionId: options.versionId,
      versionCreated: options.versionCreated,
      versionsAdded: options.versionsAdded,
      tick: options.tick,
      barrier: null,
      services,
    });
  }

  const pending = barrier.pending();
  let record: LearningEpochBarrierRecord | null = null;
  if (pending !== null && pending.targetVersionId === options.versionId) {
    record = pending;
  } else {
    let request;
    try {
      request = barrier.requestChange({
        reason: PROFILE_RESTORE_BARRIER_REASON[options.provenance],
        targetProfileId: options.profileId,
        targetVersionId: options.versionId,
        importValid: true,
      });
    } catch {
      return rejected({
        provenance: options.provenance,
        reason: 'BARRIER_REJECTED',
        profileId: options.profileId,
        versionId: options.versionId,
        versionCreated: options.versionCreated,
        versionsAdded: options.versionsAdded,
        tick: options.tick,
        services,
      });
    }
    if (request.status === 'REJECTED') {
      if (request.code === 'SAME_TARGET') {
        return outcome({
          status: 'ALREADY_ACTIVE',
          provenance: options.provenance,
          reason: options.provenance,
          profileId: options.profileId,
          versionId: options.versionId,
          versionCreated: options.versionCreated,
          versionsAdded: options.versionsAdded,
          tick: options.tick,
          barrier: null,
          services,
        });
      }
      const reason: ProfileRestoreRejectionCode =
        request.code === 'TARGET_PROFILE_MISMATCH'
          ? 'TARGET_PROFILE_MISMATCH'
          : request.code === 'TICK_NOT_ADVANCING'
            ? 'TICK_NOT_ADVANCING'
            : request.code === 'TARGET_VERSION_NOT_FOUND'
              ? 'VERSION_NOT_FOUND'
              : request.code === 'TARGET_ENGINE_MISMATCH'
                ? 'VERSION_ENGINE_MISMATCH'
                : request.code === 'IMPORT_INVALID'
                  ? 'IMPORT_INVALID'
                  : 'BARRIER_REJECTED';
      return rejected({
        provenance: options.provenance,
        reason,
        profileId: options.profileId,
        versionId: options.versionId,
        versionCreated: options.versionCreated,
        versionsAdded: options.versionsAdded,
        tick: options.tick,
        services,
      });
    }
    record = request.barrier;
  }

  let resolved;
  try {
    resolved = barrier.resolve();
  } catch {
    return rejected({
      provenance: options.provenance,
      reason: 'BARRIER_REJECTED',
      profileId: options.profileId,
      versionId: options.versionId,
      versionCreated: options.versionCreated,
      versionsAdded: options.versionsAdded,
      tick: options.tick,
      services,
    });
  }

  if (resolved.status === 'TICK_NOT_REACHED') {
    return outcome({
      status: 'PENDING',
      provenance: options.provenance,
      reason: options.provenance,
      profileId: options.profileId,
      versionId: options.versionId,
      versionCreated: options.versionCreated,
      versionsAdded: options.versionsAdded,
      tick: options.tick,
      barrier: resolved.barrier ?? record,
      services,
    });
  }
  if (resolved.status !== 'APPLIED') {
    return rejected({
      provenance: options.provenance,
      reason: resolved.status === 'ROLLED_BACK' ? 'BARRIER_ROLLED_BACK' : 'BARRIER_REJECTED',
      profileId: options.profileId,
      versionId: options.versionId,
      versionCreated: options.versionCreated,
      versionsAdded: options.versionsAdded,
      tick: options.tick,
      services,
    });
  }
  const committed = resolved.barrier;
  if (committed === null || committed.activationCommandId === null) {
    return rejected({
      provenance: options.provenance,
      reason: 'ACTIVATION_MISSING',
      profileId: options.profileId,
      versionId: options.versionId,
      versionCreated: options.versionCreated,
      versionsAdded: options.versionsAdded,
      tick: options.tick,
      services,
    });
  }
  return outcome({
    status: 'COMMITTED',
    provenance: options.provenance,
    reason: options.provenance,
    profileId: options.profileId,
    versionId: options.versionId,
    versionCreated: options.versionCreated,
    versionsAdded: options.versionsAdded,
    tick: options.tick,
    barrier: committed,
    services,
  });
}

function validateTick(
  services: ProfileRestoreServices,
  tick: number,
): ProfileRestoreRejectionCode | null {
  if (services.tick() !== tick) return 'TICK_NOT_ADVANCING';
  if (tick < services.barrier.current().openedTick) return 'TICK_NOT_ADVANCING';
  return null;
}

/**
 * Restores an existing 109 version. The version is only read and checksum-verified: it is never
 * cloned, edited or re-created. A new common activation with `RESTORE` provenance is published by
 * the 205 barrier; history keeps exactly the same version count.
 */
export function restoreVersion(
  servicesInput: ProfileRestoreServices,
  requestInput: unknown,
): ProfileRestoreResult {
  const services = readServices(servicesInput);
  const request = fields(requestInput, ['profileId', 'versionId', 'tick']) as unknown as {
    profileId: string;
    versionId: string;
    tick: number;
  };
  const profileId = bounded(text(request.profileId));
  const versionId = bounded(text(request.versionId));
  const requestedTick = readTick(request.tick);
  const base = {
    provenance: 'RESTORE' as const,
    profileId,
    versionId,
    versionCreated: false,
    versionsAdded: 0,
    tick: requestedTick,
    services,
  };

  if (profileId !== services.profileId) {
    return rejected({ ...base, reason: 'PROFILE_MISMATCH' });
  }
  const tickError = validateTick(services, requestedTick);
  if (tickError !== null) return rejected({ ...base, reason: tickError });

  const stored = readStoreIdentity(services, profileId, versionId, services.engineVersion);
  if (isRejectionCode(stored)) return rejected({ ...base, reason: stored });

  const before = services.store.listVersions(profileId).length;
  const result = applyBarrier(services, {
    provenance: 'RESTORE',
    profileId,
    versionId,
    tick: requestedTick,
    versionCreated: false,
    versionsAdded: 0,
  });
  if (result.status === 'REJECTED') return result;

  const after = services.store.listVersions(profileId).length;
  const current = services.store.getVersion(versionId);
  const unchanged =
    after === before &&
    current !== null &&
    current.checksum === stored.checksum &&
    sameParameters(current.parameters, stored.parameters);
  if (!unchanged) return rejected({ ...base, reason: 'VERSION_MUTATED' });
  return result;
}

/**
 * Validates an imported 109/registry profile, stores it as one immutable version through the real
 * 109 store, then commits the `IMPORT` barrier and one common activation. XP and missions are not
 * inputs of this module and are never written. An invalid import is rejected before any store or
 * barrier effect: the profile, the queue, the segment and the activation stay exactly as they were.
 */
export function importProfile(
  servicesInput: ProfileRestoreServices,
  requestInput: unknown,
): ProfileRestoreResult {
  const services = readServices(servicesInput);
  const request = readRequestFields(
    requestInput,
    ['importedProfile', 'tick'],
    [],
    'profile import',
  );
  const requestedTick = readTick(request.tick);
  const emptyBase = {
    provenance: 'IMPORT' as const,
    profileId: null,
    versionId: null,
    versionCreated: false,
    versionsAdded: 0,
    tick: requestedTick,
    services,
  };

  let imported;
  try {
    imported = parsePublishableDrivingProfile(request.importedProfile);
  } catch {
    return rejected({ ...emptyBase, reason: 'IMPORT_INVALID' });
  }
  if (imported.profileId !== services.profileId) {
    return rejected({ ...emptyBase, reason: 'IMPORT_INVALID' });
  }
  if (imported.engineVersion !== services.engineVersion) {
    return rejected({ ...emptyBase, reason: 'IMPORT_INVALID' });
  }
  const tickError = validateTick(services, requestedTick);
  if (tickError !== null) return rejected({ ...emptyBase, reason: tickError });

  const versionId = bounded(imported.versionId);
  const profileId = imported.profileId;
  const base = {
    provenance: 'IMPORT' as const,
    profileId,
    versionId,
    versionCreated: false,
    versionsAdded: 0,
    tick: requestedTick,
    services,
  };

  const existing = services.store.getVersion(versionId);
  if (existing !== null) {
    const matches =
      existing.profileId === profileId &&
      existing.engineVersion === services.engineVersion &&
      Object.keys(imported.parameters).every(
        (key) =>
          Object.hasOwn(existing.parameters, key) &&
          existing.parameters[key] === imported.parameters[key],
      );
    if (!matches) return rejected({ ...base, reason: 'IMPORT_INVALID' });
    return applyBarrier(services, { ...base, versionCreated: false });
  }

  const parentId = imported.parentVersionId ?? services.barrier.current().baseVersionId;
  const parent = readStoreIdentity(services, profileId, parentId, services.engineVersion);
  if (isRejectionCode(parent)) return rejected({ ...base, reason: 'IMPORT_INVALID' });

  const changes: { key: string; unit: string; value: number }[] = [];
  for (const key of Object.keys(imported.parameters)) {
    if (!Object.hasOwn(parent.parameters, key)) {
      return rejected({ ...base, reason: 'IMPORT_INVALID' });
    }
    if (parent.parameters[key] === imported.parameters[key]) continue;
    changes.push({
      key,
      unit: imported.unitsByParameter[key],
      value: imported.parameters[key],
    });
  }
  if (changes.length === 0) {
    return applyBarrier(services, { ...base, versionId: parent.versionId, versionCreated: false });
  }

  const before = services.store.listVersions(profileId).length;
  let stored;
  try {
    stored = services.store.derive({
      profileId,
      versionId,
      parentVersionId: parent.versionId,
      segmentId: `import:${imported.checksum}`,
      interventionId: `import:${imported.checksum}`,
      reason: bounded('IMPORTED', PROFILE_RESTORE_LIMITS.reasonCodeUnits),
      ...(services.now === undefined ? {} : { createdAt: services.now() }),
      delta: {
        profileVersionId: versionId,
        parentVersionId: parent.versionId,
        engineVersion: services.engineVersion,
        schemaVersion: 1,
        units: 'SI',
        values: changes,
      },
    });
  } catch {
    return rejected({ ...base, reason: 'IMPORT_INVALID' });
  }
  if (stored.status !== 'ACCEPTED') {
    return rejected({ ...base, reason: 'IMPORT_INVALID' });
  }
  const after = services.store.listVersions(profileId).length;
  return applyBarrier(services, {
    ...base,
    versionId: stored.versionId,
    versionCreated: stored.created,
    versionsAdded: after - before,
  });
}

function catalogDefaults(): Readonly<Record<string, number>> {
  const parameters: Record<string, number> = Object.create(null);
  for (const definition of parameterDefinitions) parameters[definition.key] = definition.default;
  return Object.freeze(parameters);
}

function readBaseParameters(value: unknown): Readonly<Record<string, number>> | null {
  if (value === undefined) return catalogDefaults();
  let raw: Record<string, unknown>;
  try {
    raw = record(value);
  } catch {
    return null;
  }
  const keys = Object.keys(raw);
  if (keys.length === 0) return null;
  const parameters: Record<string, number> = Object.create(null);
  for (const key of keys) {
    try {
      const definition = getParameterDefinition(key);
      parameters[key] = validateParameterValue(key, raw[key], definition.unit);
    } catch {
      return null;
    }
  }
  return Object.freeze(parameters);
}

function baseVersionIdFor(services: ProfileRestoreServices, profileId: string): string {
  const existing = new Set(
    services.store.listVersions(profileId).map((version) => version.versionId),
  );
  const root = bounded(`base-${profileId}`);
  if (!existing.has(root)) return root;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = bounded(`${root}-${suffix}`);
    if (!existing.has(candidate)) return candidate;
  }
  return bounded(`${root}-overflow`);
}

/**
 * Creates a fresh 109 base version from real 092 catalog defaults (or explicit values) and commits
 * the `NEW_PROFILE` barrier and one common activation. A different `profileId` needs an explicitly
 * injected 205 barrier (`barrierFor`) because 205 is pinned to one profile; without it the call is
 * rejected before the store is written. Existing history of every other profile is untouched.
 */
export function newProfileFromBase(
  servicesInput: ProfileRestoreServices,
  requestInput: unknown,
): ProfileRestoreResult {
  const services = readServices(servicesInput);
  const request = readRequestFields(
    requestInput,
    ['playerId', 'profileId', 'tick'],
    ['baseParameters'],
    'new profile',
  );
  const playerId = bounded(text(request.playerId));
  const profileId = bounded(text(request.profileId));
  const requestedTick = readTick(request.tick);
  const base = {
    provenance: 'NEW_PROFILE' as const,
    profileId,
    versionId: null,
    versionCreated: false,
    versionsAdded: 0,
    tick: requestedTick,
    services,
  };

  if (playerId !== services.playerId) return rejected({ ...base, reason: 'PLAYER_MISMATCH' });
  const tickError = validateTick(services, requestedTick);
  if (tickError !== null) return rejected({ ...base, reason: tickError });
  if (profileId !== services.barrier.profileId && services.barrierFor === undefined) {
    return rejected({ ...base, reason: 'TARGET_PROFILE_MISMATCH' });
  }

  const parameters = readBaseParameters(request.baseParameters);
  if (parameters === null) return rejected({ ...base, reason: 'BASE_INVALID' });

  const existingVersions = services.store.listVersions(profileId);
  let fromVersion: ProfileVersion | null = null;
  let barrier = services.barrier;
  if (profileId !== barrier.profileId) {
    fromVersion =
      existingVersions.find((version) => version.provenance.origin === 'BASE') ??
      existingVersions[0] ??
      null;
    if (fromVersion === null) return rejected({ ...base, reason: 'BASE_NOT_FOUND' });
    const factory = services.barrierFor;
    if (factory === undefined) return rejected({ ...base, reason: 'TARGET_PROFILE_MISMATCH' });
    try {
      barrier = factory({
        playerId,
        profileId,
        engineVersion: services.engineVersion,
        fromVersionId: fromVersion.versionId,
        segmentId: bounded(`${profileId}:g1`),
        openedTick: requestedTick,
      });
    } catch {
      return rejected({ ...base, reason: 'BARRIER_REJECTED' });
    }
  }

  const reusable = existingVersions.find(
    (version) =>
      version.provenance.origin === 'BASE' &&
      version.engineVersion === services.engineVersion &&
      sameParameters(version.parameters, parameters),
  );
  let version: ProfileVersion;
  let versionCreated = false;
  let versionsAdded = 0;
  if (reusable !== undefined) {
    version = reusable;
  } else {
    const versionId = baseVersionIdFor(services, profileId);
    let created;
    try {
      created = services.store.createBase({
        profileId,
        versionId,
        parameters,
        ...(services.now === undefined ? {} : { createdAt: services.now() }),
      });
    } catch {
      return rejected({ ...base, reason: 'BASE_INVALID' });
    }
    if (created.status !== 'ACCEPTED') return rejected({ ...base, reason: 'STORE_REJECTED' });
    version = created.profileVersion;
    versionCreated = created.created;
    versionsAdded = created.created ? 1 : 0;
  }

  const result = applyBarrier(services, {
    ...base,
    versionId: version.versionId,
    versionCreated,
    versionsAdded,
    barrier,
  });
  return result;
}

/**
 * Resets the visual style to the stored base version. It creates no version, opens one `RESTORE`
 * barrier and one common activation, and it never invokes an XP, mission or progression port:
 * `progressionCalls` is always `0`, and missions/XP remain byte-identical.
 */
export function resetStyle(
  servicesInput: ProfileRestoreServices,
  requestInput: unknown,
): ProfileRestoreResult {
  const services = readServices(servicesInput);
  const request = readRequestFields(
    requestInput,
    ['profileId', 'tick'],
    ['progression'],
    'style reset',
  );
  const profileId = bounded(text(request.profileId));
  const requestedTick = readTick(request.tick);
  const base = {
    provenance: 'RESET_STYLE' as const,
    profileId,
    versionId: null,
    versionCreated: false,
    versionsAdded: 0,
    tick: requestedTick,
    services,
  };
  if (profileId !== services.profileId) return rejected({ ...base, reason: 'PROFILE_MISMATCH' });
  const tickError = validateTick(services, requestedTick);
  if (tickError !== null) return rejected({ ...base, reason: tickError });

  const baseVersion = services.store
    .listVersions(profileId)
    .find((version) => version.provenance.origin === 'BASE');
  if (baseVersion === undefined) return rejected({ ...base, reason: 'BASE_NOT_FOUND' });

  return applyBarrier(services, {
    ...base,
    versionId: baseVersion.versionId,
  });
}

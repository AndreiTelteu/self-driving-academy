import { parameterDefinitions } from '../profiles';
import type { ProfileStore, ProfileVersion } from '../profiles';
import type {
  ProfileHistoryEntry,
  ProfileHistoryRestoreReason,
  ProfileHistoryRestoreResult,
  ProfileHistoryRestoreState,
  ProfileHistorySnapshot,
} from '../ui';
import { deriveProfileHistoryChanges, parseProfileHistorySnapshot } from '../ui';

/** The real 109 profile store is the only source of versions for a history frame. */
export interface ProfileHistorySources {
  readonly store: ProfileStore;
}

/** One host frame: the accepted tick, the profile and the user's current selection. */
export interface ProfileHistoryFrame {
  readonly tick: number;
  readonly profileId: string;
  /** The version the user selected. Selection never restores anything by itself. */
  readonly selectedVersionId?: string | null;
  /** Optional host-pinned current version; defaults to the tip of the 109 history. */
  readonly currentVersionId?: string | null;
  /** Host engine version used for compatibility; defaults to the current/store engine. */
  readonly engineVersion?: string;
  /** Local scope until the live session context is wired. */
  readonly sessionId?: string;
  readonly worldEpoch?: number;
}

/**
 * Documented local context for a history panel that is not yet bound to a live session host. It is
 * a scope label, not a world identity claim; the host can override it explicitly.
 */
export const PROFILE_HISTORY_LOCAL_CONTEXT = Object.freeze({
  sessionId: 'profile:history:local',
  worldEpoch: 0,
});

/** Closed error messages: the composition root never invents a version or a value. */
export const PROFILE_HISTORY_READ_ERRORS = Object.freeze({
  PROFILE_ID: 'Profile history has no profile id',
  CURRENT_MISSING: 'Profile history current version does not exist',
  CURRENT_FOREIGN: 'Profile history current version belongs to another profile',
});

/** Real 092 reserved (R/`extension`) keys; they never become learnable preview changes. */
export const PROFILE_HISTORY_RESERVED_KEYS: readonly string[] = Object.freeze(
  parameterDefinitions
    .filter((definition) => definition.implementationStage === 'extension')
    .map((definition) => definition.key),
);

const UNITS_BY_KEY: ReadonlyMap<string, string> = new Map(
  parameterDefinitions.map((definition) => [definition.key, definition.unit]),
);

function unitOf(key: string): string | null {
  return UNITS_BY_KEY.get(key) ?? null;
}

function blocked(reason: ProfileHistoryRestoreReason): ProfileHistoryRestoreState {
  return Object.freeze({
    action: 'BLOCKED' as const,
    reason,
    explicit: true as const,
    confirmationRequired: true as const,
  });
}

function idle(): ProfileHistoryRestoreState {
  return Object.freeze({
    action: 'NONE' as const,
    reason: 'NO_SELECTION' as const,
    explicit: true as const,
    confirmationRequired: true as const,
  });
}

function available(): ProfileHistoryRestoreState {
  return Object.freeze({
    action: 'AVAILABLE' as const,
    reason: null,
    explicit: true as const,
    confirmationRequired: true as const,
  });
}

function entryOf(
  version: ProfileVersion,
  currentVersionId: string | null,
  selectedVersionId: string | null,
  engineVersion: string,
): ProfileHistoryEntry {
  const compatible = version.engineVersion === engineVersion;
  return Object.freeze({
    versionId: version.versionId,
    parentVersionId: version.parentVersionId,
    depth: version.depth,
    createdAt: version.createdAt,
    checksum: version.checksum,
    engineVersion: version.engineVersion,
    sourceSegmentIds: Object.freeze([...version.sourceSegmentIds]),
    origin: version.provenance.origin,
    current: version.versionId === currentVersionId,
    selected: version.versionId === selectedVersionId,
    compatible,
    incompatibilityReason: compatible ? null : ('ENGINE_MISMATCH' as const),
  });
}

/**
 * Composition root for 078. It reads real 109 versions (`listVersions`/`getHistory`/`getVersion`),
 * derives the preview from two immutable snapshots and reports an explicit restore intent. It never
 * creates, edits, publishes or activates a version: 109 owns storage, 110 owns publication and
 * 114 owns activation/restore semantics. A selection outside the stored history is reported as a
 * closed `MISSING_VERSION`/`PROFILE_MISMATCH`, never invented.
 */
export function readProfileHistorySnapshot(
  sources: ProfileHistorySources,
  frame: ProfileHistoryFrame,
): ProfileHistorySnapshot {
  const profileId = frame.profileId;
  if (typeof profileId !== 'string' || profileId.trim().length === 0)
    throw new Error(PROFILE_HISTORY_READ_ERRORS.PROFILE_ID);
  const selectedVersionId = frame.selectedVersionId ?? null;
  let current: ProfileVersion | null;
  if (frame.currentVersionId !== undefined && frame.currentVersionId !== null) {
    const pinned = sources.store.getVersion(frame.currentVersionId);
    if (pinned === null)
      throw new Error(`${PROFILE_HISTORY_READ_ERRORS.CURRENT_MISSING}: ${frame.currentVersionId}`);
    if (pinned.profileId !== profileId)
      throw new Error(`${PROFILE_HISTORY_READ_ERRORS.CURRENT_FOREIGN}: ${frame.currentVersionId}`);
    current = pinned;
  } else {
    const chain = sources.store.getHistory(profileId);
    current = chain.length === 0 ? null : chain[chain.length - 1]!;
  }
  const currentVersionId = current?.versionId ?? null,
    engineVersion = frame.engineVersion ?? current?.engineVersion ?? sources.store.engineVersion,
    versions = [...sources.store.listVersions(profileId)].sort(
      (left, right) =>
        left.depth - right.depth ||
        (left.versionId < right.versionId ? -1 : left.versionId > right.versionId ? 1 : 0),
    ),
    entries = versions.map((version) =>
      entryOf(version, currentVersionId, selectedVersionId, engineVersion),
    );
  const selectedVersion =
    selectedVersionId === null ? null : sources.store.getVersion(selectedVersionId);
  let restore: ProfileHistoryRestoreState;
  if (selectedVersionId === null) {
    restore = currentVersionId === null ? blocked('MISSING_VERSION') : idle();
  } else if (selectedVersion === null) {
    restore = blocked('MISSING_VERSION');
  } else if (selectedVersion.profileId !== profileId) {
    restore = blocked('PROFILE_MISMATCH');
  } else if (currentVersionId === null) {
    restore = blocked('MISSING_VERSION');
  } else {
    const plan = planProfileRestore({
      store: sources.store,
      profileId,
      currentVersionId,
      selectedVersionId,
      engineVersion,
    });
    restore = plan.action === 'AVAILABLE' ? available() : blocked(plan.reason ?? 'MISSING_VERSION');
  }
  const preview =
    current !== null &&
    selectedVersion !== null &&
    selectedVersion.profileId === profileId &&
    selectedVersion.versionId !== current.versionId
      ? Object.freeze({
          fromVersionId: current.versionId,
          toVersionId: selectedVersion.versionId,
          changes: deriveProfileHistoryChanges({
            from: {
              versionId: current.versionId,
              parameters: current.parameters,
              delta: current.provenance.delta,
            },
            to: {
              versionId: selectedVersion.versionId,
              parameters: selectedVersion.parameters,
              delta: selectedVersion.provenance.delta,
            },
            reservedKeys: PROFILE_HISTORY_RESERVED_KEYS,
            unitOf,
          }),
        })
      : null;
  return parseProfileHistorySnapshot(
    {
      schemaVersion: 1,
      units: 'SI',
      version: '078-profile-history-v1',
      sessionId: frame.sessionId ?? PROFILE_HISTORY_LOCAL_CONTEXT.sessionId,
      worldEpoch: frame.worldEpoch ?? PROFILE_HISTORY_LOCAL_CONTEXT.worldEpoch,
      tick: frame.tick,
      profileId,
      currentVersionId,
      selectedVersionId,
      entries,
      preview,
      restore,
    },
    PROFILE_HISTORY_RESERVED_KEYS,
  );
}

/** The closed result of a restore plan. It is an intent only; nothing is mutated. */
export interface ProfileRestorePlan {
  readonly action: 'AVAILABLE' | 'BLOCKED';
  readonly reason: ProfileHistoryRestoreReason | null;
}

export interface ProfileRestorePlanInput {
  readonly store: ProfileStore;
  readonly profileId: string;
  readonly currentVersionId: string | null;
  readonly selectedVersionId: string;
  /** Host engine version; both versions must belong to it. */
  readonly engineVersion: string;
}

/**
 * Validates a restore request without executing it. Checks, in order: the selected version exists,
 * belongs to the profile and differs from the current version; both versions belong to the host
 * engine; the profile history has no duplicate `versionId`. It never derives, activates or writes a
 * version — the actual restore is the host handler's responsibility (109/110/114).
 */
export function planProfileRestore(input: ProfileRestorePlanInput): ProfileRestorePlan {
  const { store, profileId, currentVersionId, selectedVersionId, engineVersion } = input;
  const selected = store.getVersion(selectedVersionId);
  if (selected === null)
    return Object.freeze({ action: 'BLOCKED' as const, reason: 'MISSING_VERSION' as const });
  if (selected.profileId !== profileId)
    return Object.freeze({ action: 'BLOCKED' as const, reason: 'PROFILE_MISMATCH' as const });
  const current = currentVersionId === null ? null : store.getVersion(currentVersionId);
  if (current === null || currentVersionId === null)
    return Object.freeze({ action: 'BLOCKED' as const, reason: 'MISSING_VERSION' as const });
  if (current.profileId !== profileId)
    return Object.freeze({ action: 'BLOCKED' as const, reason: 'PROFILE_MISMATCH' as const });
  if (selected.versionId === current.versionId)
    return Object.freeze({ action: 'BLOCKED' as const, reason: 'SAME_VERSION' as const });
  if (current.engineVersion !== engineVersion || selected.engineVersion !== engineVersion)
    return Object.freeze({ action: 'BLOCKED' as const, reason: 'ENGINE_MISMATCH' as const });
  const ids = store.listVersions(profileId).map((version) => version.versionId);
  if (new Set(ids).size !== ids.length)
    return Object.freeze({
      action: 'BLOCKED' as const,
      reason: 'DUPLICATE_VERSION_ID' as const,
    });
  return Object.freeze({ action: 'AVAILABLE' as const, reason: null });
}

/** One explicit restore request handed to the host. The host owns persistence and activation. */
export interface ProfileHistoryRestoreRequest {
  readonly profileId: string;
  readonly fromVersionId: string;
  readonly versionId: string;
  readonly engineVersion: string;
}

export interface ProfileHistoryRestoreOutcome {
  readonly status: 'ACCEPTED' | 'REJECTED';
  /** Host rejection text or closed reason; propagated to the UI unchanged. */
  readonly reason: string | null;
}

export type ProfileHistoryRestoreHandler = (
  request: ProfileHistoryRestoreRequest,
) => ProfileHistoryRestoreOutcome;

export interface ProfileHistoryPortOptions {
  readonly store: ProfileStore;
  /** Host handler that owns persistence and activation. */
  readonly restore: ProfileHistoryRestoreHandler;
  /** Host engine; defaults to the store engine. */
  readonly engineVersion?: string;
  /** Host-pinned current version; defaults to the tip of the selected profile's history. */
  readonly currentVersionId?: string | null;
  /** Profile whose history is restored; defaults to the selected version's profile. */
  readonly profileId?: string;
}

export interface ProfileHistoryPorts {
  /** `true` when the version exists in the store; nothing is selected or mutated. */
  readonly select: (versionId: string) => boolean;
  /** Emits the host handler only after `planProfileRestore` accepts the request. */
  readonly restore: (versionId: string) => ProfileHistoryRestoreResult;
}

/**
 * Adapters for the panel ports. `select` only reports whether the version exists. `restore` plans
 * before delegating: a blocked plan never reaches the host, and a host rejection reason is returned
 * verbatim. Neither port writes a version, a profile or a store entry.
 */
export function createProfileHistoryPorts(options: ProfileHistoryPortOptions): ProfileHistoryPorts {
  const select = (versionId: string): boolean => {
    try {
      return options.store.getVersion(versionId) !== null;
    } catch {
      return false;
    }
  };
  const restore = (versionId: string): ProfileHistoryRestoreResult => {
    let selected: ProfileVersion | null;
    try {
      selected = options.store.getVersion(versionId);
    } catch {
      return Object.freeze({ accepted: false, reason: 'MISSING_VERSION' });
    }
    if (selected === null) return Object.freeze({ accepted: false, reason: 'MISSING_VERSION' });
    const profileId = options.profileId ?? selected.profileId,
      currentVersionId =
        options.currentVersionId === undefined
          ? (options.store.getHistory(profileId).at(-1)?.versionId ?? null)
          : options.currentVersionId,
      engineVersion = options.engineVersion ?? options.store.engineVersion,
      plan = planProfileRestore({
        store: options.store,
        profileId,
        currentVersionId,
        selectedVersionId: versionId,
        engineVersion,
      });
    if (plan.action !== 'AVAILABLE' || currentVersionId === null)
      return Object.freeze({ accepted: false, reason: plan.reason ?? 'MISSING_VERSION' });
    const outcome = options.restore({
      profileId,
      fromVersionId: currentVersionId,
      versionId,
      engineVersion,
    });
    return Object.freeze({ accepted: outcome.status === 'ACCEPTED', reason: outcome.reason });
  };
  return Object.freeze({ select, restore });
}

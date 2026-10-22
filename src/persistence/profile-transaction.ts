import type { ProfileVersion } from '../profiles';
import { PersistenceError } from './contracts';
import type { ActivationRecord } from './contracts';
import { measureJsonBytes, parseActivationRecord, parseProfileRecord } from './records';
import type { TransactionPort } from './ports';

/**
 * Atomic publication of one profile version and its activation (PBI 128).
 *
 * Docs/15 asks for one thing: a crash between the steps must never leave an active profile that
 * cannot be loaded. The only honest way to get that is a single multi-store transaction, so the
 * version row (109) and the activation pointer (110) are written together or not at all.
 *
 * The module owns the rules, not the storage: it works on a `TransactionPort`, so the same code
 * runs against the real IndexedDB adapter and the in-memory double. The repository owns the
 * connection, the writer lock and the transaction boundary.
 */

/** Contract id of this layer; the persisted schema keeps its own version. */
export const PROFILE_TRANSACTION_VERSION = '128-profile-transaction-v1' as const;

/**
 * Provenance classification of a stored version.
 *
 * `BASE` is the root version. A derived version that names intervention ids was produced by a
 * manual intervention (`MANUAL_TUNING`); a derived version that names only driving segments was
 * produced from learned driving (`LEARNING`). The classification is derived from stored
 * provenance only — it never invents a source.
 */
export type ProfileSourceKind = 'BASE' | 'LEARNING' | 'MANUAL_TUNING';

export function classifyProfileSource(version: ProfileVersion): ProfileSourceKind {
  if (version.provenance.origin === 'BASE') return 'BASE';
  if (version.provenance.sourceInterventionIds.length > 0) return 'MANUAL_TUNING';
  if (version.provenance.sourceSegmentIds.length > 0) return 'LEARNING';
  return 'MANUAL_TUNING';
}

/**
 * Fault-injection points used by the deterministic crash tests.
 *
 * `beforeCommit` runs inside the transaction, after every write: throwing there aborts the
 * transaction, so the database keeps the state it had before the call. `afterCommit` runs after
 * the transaction committed: throwing there models a process that died after the data was
 * durable, and the caller is told that the write survived.
 */
export interface ProfileTransactionHooks {
  readonly beforeCommit?: () => void;
  readonly afterCommit?: () => void;
}

export interface ProfileActivationCommit {
  readonly version: typeof PROFILE_TRANSACTION_VERSION;
  readonly profile: ProfileVersion;
  readonly activation: ActivationRecord;
  readonly source: ProfileSourceKind;
  /** True when this call created the version row; false when the version already existed. */
  readonly versionCreated: boolean;
  /** False when the stored activation already pointed at the same version and sequence. */
  readonly activationChanged: boolean;
  /** Canonical bytes of the version row plus the activation row. */
  readonly bytes: number;
}

export interface ProfileHistory {
  readonly profileId: string;
  /** Every stored version of the profile, ordered by creation time then version id. */
  readonly versions: readonly ProfileVersion[];
  /** Base-to-tip chain of the active version (or of the newest version without an activation). */
  readonly chain: readonly ProfileVersion[];
  readonly activeVersionId: string | null;
  readonly activeVersion: ProfileVersion | null;
  readonly activatedAt: string | null;
  readonly activationSequence: number | null;
  readonly source: ProfileSourceKind | null;
  /** False when a parent version is missing: the stored history has a hole. */
  readonly complete: boolean;
  readonly missingVersionIds: readonly string[];
}

function compareVersions(left: ProfileVersion, right: ProfileVersion): number {
  if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt ? -1 : 1;
  if (left.versionId === right.versionId) return 0;
  return left.versionId < right.versionId ? -1 : 1;
}

/**
 * Builds the readable history of one profile from the stored rows.
 *
 * The chain is rebuilt from the stored parent links, so a hole in the history is reported instead
 * of being papered over with a fabricated parent.
 */
export function buildProfileHistory(
  profileId: string,
  versions: readonly ProfileVersion[],
  activation: ActivationRecord | null,
): ProfileHistory {
  const byId = new Map(versions.map((entry) => [entry.versionId, entry]));
  const ordered = [...versions].sort(compareVersions);
  const activeVersion = activation === null ? null : (byId.get(activation.versionId) ?? null);
  let tip = activeVersion;
  if (tip === null) {
    for (const candidate of ordered) {
      if (tip === null || candidate.depth > tip.depth) tip = candidate;
    }
  }
  const chain: ProfileVersion[] = [];
  const missing: string[] = [];
  const visited = new Set<string>();
  let cursor = tip;
  while (cursor !== null) {
    if (visited.has(cursor.versionId)) {
      missing.push(cursor.versionId);
      break;
    }
    visited.add(cursor.versionId);
    chain.push(cursor);
    const parentId = cursor.parentVersionId;
    if (parentId === null) break;
    const parent = byId.get(parentId);
    if (parent === undefined) {
      missing.push(parentId);
      break;
    }
    cursor = parent;
  }
  chain.reverse();
  return Object.freeze({
    profileId,
    versions: Object.freeze(ordered),
    chain: Object.freeze(chain),
    activeVersionId: activation?.versionId ?? null,
    activeVersion,
    activatedAt: activation?.activatedAt ?? null,
    activationSequence: activation?.sequence ?? null,
    source: activeVersion === null ? null : classifyProfileSource(activeVersion),
    complete: missing.length === 0,
    missingVersionIds: Object.freeze(missing),
  });
}

/**
 * Writes the version row and the activation row inside one transaction.
 *
 * Rules, all enforced before the transaction commits:
 * 1. The activation must point at the version written by the same call: an activation can never
 *    outlive its version (`REFERENCE_MISSING`).
 * 2. The parent of a derived version must already be stored: the history cannot contain a hole
 *    (`REFERENCE_MISSING`).
 * 3. A stored version is immutable: the same id with different content is refused
 *    (`IMMUTABLE_RECORD`).
 * 4. The activation sequence never moves backwards: an older sequence cannot replace a newer
 *    active version (`STALE_REVISION`).
 */
export async function commitProfileActivationRows(
  transaction: TransactionPort,
  input: { readonly profile: unknown; readonly activation: unknown },
  hooks: ProfileTransactionHooks = {},
): Promise<ProfileActivationCommit> {
  const profile = parseProfileRecord(input.profile);
  const activation = parseActivationRecord(input.activation);

  if (activation.profileId !== profile.profileId) {
    throw new PersistenceError(
      'REFERENCE_MISSING',
      `The activation belongs to ${activation.profileId}, not to ${profile.profileId}`,
      'activation.profileId',
    );
  }
  if (activation.versionId !== profile.versionId) {
    throw new PersistenceError(
      'REFERENCE_MISSING',
      `The activation points at ${activation.versionId}, not at ${profile.versionId}`,
      'activation.versionId',
    );
  }
  if (profile.parentVersionId !== null) {
    const parent = await transaction.get('profiles', profile.parentVersionId);
    if (parent === undefined) {
      throw new PersistenceError(
        'REFERENCE_MISSING',
        `The parent version ${profile.parentVersionId} is not stored`,
        'profile.parentVersionId',
      );
    }
  }

  const existing = await transaction.get('profiles', profile.versionId);
  let versionCreated = false;
  if (existing !== undefined) {
    const stored = parseProfileRecord(existing);
    if (stored.checksum !== profile.checksum) {
      throw new PersistenceError(
        'IMMUTABLE_RECORD',
        `Profile version ${profile.versionId} is immutable`,
        'profiles',
      );
    }
  } else {
    await transaction.put('profiles', profile);
    versionCreated = true;
  }

  const currentRow = await transaction.get('profileActivations', profile.profileId);
  let activationChanged = true;
  if (currentRow !== undefined) {
    const current = parseActivationRecord(currentRow);
    if (current.sequence > activation.sequence) {
      throw new PersistenceError(
        'STALE_REVISION',
        `Activation sequence ${activation.sequence} is older than the stored ${current.sequence}`,
        'activation.sequence',
      );
    }
    if (current.sequence === activation.sequence) {
      if (current.versionId !== activation.versionId) {
        throw new PersistenceError(
          'STALE_REVISION',
          'The same activation sequence points at another version',
          'activation.sequence',
        );
      }
      activationChanged = false;
    }
  }
  if (activationChanged) await transaction.put('profileActivations', activation);

  const bytes = measureJsonBytes(profile, 'profile') + measureJsonBytes(activation, 'activation');
  hooks.beforeCommit?.();

  return Object.freeze({
    version: PROFILE_TRANSACTION_VERSION,
    profile,
    activation,
    source: classifyProfileSource(profile),
    versionCreated,
    activationChanged,
    bytes,
  });
}

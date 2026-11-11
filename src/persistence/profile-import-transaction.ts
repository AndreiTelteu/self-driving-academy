import { PersistenceError } from './contracts';
import { measureJsonBytes, parseProfileRecord } from './records';
import type { TransactionPort } from './ports';
import type { ProfileTransactionHooks } from './profile-transaction';
import type { ProfileVersion } from '../profiles';

/**
 * Atomic publication of an imported profile history (PBI 134).
 *
 * An import writes several 109 versions at once: the whole stored chain of the exported document.
 * The only honest way to keep the promise "an invalid or interrupted import changes nothing" is a
 * single `profiles` transaction, so every version row is written together or none is.
 *
 * This module deliberately does not write the activation pointer: importing a profile is not the
 * same action as activating it. Activation stays an explicit, separate step performed through the
 * 205 barrier and the 128 version+activation transaction.
 *
 * The module owns the rules, not the storage: it works on a `TransactionPort`, so the same code
 * runs against the real IndexedDB adapter and the in-memory double. The repository owns the
 * connection, the writer lock and the transaction boundary.
 */

/** Contract id of this layer. */
export const PROFILE_IMPORT_TRANSACTION_VERSION = '134-profile-import-transaction-v1' as const;

/** Bounds of one import transaction; aligned with the 133 export and 109 store budgets. */
export const PROFILE_IMPORT_TRANSACTION_LIMITS = Object.freeze({
  /** Versions written by one import; the 133 document carries at most 128. */
  maxVersions: 128,
});

export interface ProfileImportTransactionInput {
  /** Every version must belong to this profile; a foreign row is refused, never re-homed. */
  readonly profileId: string;
  /** 109 records reconstructed by the 133 reader; re-validated here before any write. */
  readonly versions: readonly unknown[];
}

export interface ProfileImportCommit {
  readonly version: typeof PROFILE_IMPORT_TRANSACTION_VERSION;
  readonly profileId: string;
  /** Every version id covered by this transaction, in depth order. */
  readonly versionIds: readonly string[];
  /** Rows that did not exist before this transaction. */
  readonly versionsCreated: number;
  /** Rows that already existed with the exactly same checksum. */
  readonly versionsExisting: number;
  /** Canonical bytes of the version rows written or confirmed. */
  readonly bytes: number;
}

function compareVersions(left: ProfileVersion, right: ProfileVersion): number {
  if (left.depth !== right.depth) return left.depth - right.depth;
  if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt ? -1 : 1;
  if (left.versionId === right.versionId) return 0;
  return left.versionId < right.versionId ? -1 : 1;
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new PersistenceError('INVALID_RECORD', `Invalid ${field}`, field);
  }
  return value;
}

/**
 * Writes the imported versions inside one transaction.
 *
 * Rules, all enforced before the transaction commits:
 * 1. Every row belongs to the imported profile (`REFERENCE_MISSING` otherwise): an import can
 *    never re-home a version under another profile id.
 * 2. A version id appears once in the import (`INVALID_RECORD`): the same row cannot be written
 *    twice with two contents.
 * 3. A stored version is immutable: the same id with another checksum is refused
 *    (`IMMUTABLE_RECORD`).
 * 4. The parent of a derived version is either already stored or written earlier in the same
 *    transaction (`REFERENCE_MISSING`): the imported history never gets a hole.
 *
 * A throw before the commit aborts the whole transaction, so the store keeps exactly the state it
 * had before the call.
 */
export async function commitProfileImportRows(
  transaction: TransactionPort,
  input: ProfileImportTransactionInput,
  hooks: ProfileTransactionHooks = {},
): Promise<ProfileImportCommit> {
  if (typeof input !== 'object' || input === null) {
    throw new PersistenceError('INVALID_RECORD', 'Expected an import transaction input', 'import');
  }
  const profileId = requireText(input.profileId, 'profileId');
  if (!Array.isArray(input.versions) || input.versions.length === 0) {
    throw new PersistenceError(
      'INVALID_RECORD',
      'An import needs at least one profile version',
      'versions',
    );
  }
  if (input.versions.length > PROFILE_IMPORT_TRANSACTION_LIMITS.maxVersions) {
    throw new PersistenceError(
      'INVALID_RECORD',
      `At most ${PROFILE_IMPORT_TRANSACTION_LIMITS.maxVersions} versions are imported at once`,
      'versions',
    );
  }

  const parsed: ProfileVersion[] = [];
  const byId = new Map<string, ProfileVersion>();
  for (let index = 0; index < input.versions.length; index += 1) {
    const version = parseProfileRecord(input.versions[index]);
    if (version.profileId !== profileId) {
      throw new PersistenceError(
        'REFERENCE_MISSING',
        `The version ${version.versionId} belongs to ${version.profileId}, not ${profileId}`,
        `versions[${index}].profileId`,
      );
    }
    if (byId.has(version.versionId)) {
      throw new PersistenceError(
        'INVALID_RECORD',
        `Duplicate imported version: ${version.versionId}`,
        `versions[${index}].versionId`,
      );
    }
    byId.set(version.versionId, version);
    parsed.push(version);
  }

  const ordered = [...parsed].sort(compareVersions);
  let versionsCreated = 0;
  let versionsExisting = 0;
  let bytes = 0;
  for (const version of ordered) {
    const existing = await transaction.get('profiles', version.versionId);
    if (existing !== undefined) {
      const stored = parseProfileRecord(existing);
      if (stored.checksum !== version.checksum) {
        throw new PersistenceError(
          'IMMUTABLE_RECORD',
          `Profile version ${version.versionId} is immutable`,
          'profiles',
        );
      }
      versionsExisting += 1;
    } else {
      if (version.parentVersionId !== null) {
        const parent = await transaction.get('profiles', version.parentVersionId);
        if (parent === undefined) {
          throw new PersistenceError(
            'REFERENCE_MISSING',
            `The parent version ${version.parentVersionId} of ${version.versionId} is not stored`,
            'profile.parentVersionId',
          );
        }
      }
      await transaction.put('profiles', version);
      versionsCreated += 1;
    }
    bytes += measureJsonBytes(version, 'profile');
  }

  hooks.beforeCommit?.();

  return Object.freeze({
    version: PROFILE_IMPORT_TRANSACTION_VERSION,
    profileId,
    versionIds: Object.freeze(ordered.map((version) => version.versionId)),
    versionsCreated,
    versionsExisting,
    bytes,
  });
}

import type { PersistenceStoreName } from './contracts';
import { PersistenceError } from './contracts';
import type { DatabasePort, TransactionPort } from './ports';
import type { ProfileTransactionHooks } from './profile-transaction';
import { decodePlayerSave } from './progress-save';
import {
  parseActivationRecord,
  parseCheckpointRecord,
  parsePersistedRecord,
  parseProfileRecord,
  parseSettingsRecord,
} from './records';
import type { LocalRepository } from './repository';
import {
  SessionArchiveError,
  exportSessionArchive,
  readSessionArchive,
  sessionArchiveRejectionCodes,
} from './session-archive';
import type {
  SessionArchiveCounts,
  SessionArchiveExportOptions,
  SessionArchiveExportResult,
  SessionArchiveRejection,
  SessionArchiveSizes,
  SessionArchiveValidationAccepted,
} from './session-archive';

/**
 * Atomic replacement of a session from a PBI 135 archive.
 *
 * The archive module (`session-archive.ts`) owns the format, the reader and the size ledger. This
 * module owns the only operation that touches the database, and it does exactly one thing:
 *
 * 1. **Nothing is written before the whole file is valid.** The reader verifies the strict parse,
 *    the envelope checksum, the declared sizes, every component parser and the cross-component
 *    coherence. Only an accepted validation reaches a transaction.
 * 2. **The replacement is one transaction over the session stores.** Existing progress rows,
 *    scenario rows and checkpoints of the session are read, validated, deleted and replaced by the
 *    archived generation; the settings row is replaced or reset to the documented defaults. A
 *    failure anywhere aborts the transaction, so a half-imported session cannot exist.
 * 3. **Rewards are replaced, never added.** There is no settlement call in this module: the 130
 *    campaign row is written verbatim from the archive, and the transaction re-decodes the written
 *    rows with the 130 oracle and compares the digests and the XP total. An import can therefore
 *    neither duplicate a stored reward nor merge two economies.
 * 4. **The profile generation must already exist.** A checkpoint that names a profile version or
 *    an activation the target database does not have is refused; the import never repairs a
 *    reference by inventing a version. Profile import stays the explicit 134 action.
 *
 * The transaction boundary is a port (`SessionArchiveTransactionRunner`) because the 127 repository
 * owns the connection and the writer lock. `createSessionArchiveTransactionRunner` adapts a 127
 * `DatabasePort`; the repository integration that exposes its own connection is a later PBI.
 */

/** Contract id of this layer. */
export const SESSION_ARCHIVE_IMPORT_VERSION = '135-session-archive-import-v1' as const;

/** Closed refusal vocabulary: every archive code plus the reasons of the import boundary. */
export const sessionArchiveImportRejectionCodes = [
  ...sessionArchiveRejectionCodes,
  'WRITER_REQUIRED',
  'REPOSITORY_CLOSED',
  'IMPORT_STORE_REJECTED',
  'IMPORT_WRITE_FAILED',
  'TRANSACTION_ABORTED',
] as const;
export type SessionArchiveImportRejectionCode = (typeof sessionArchiveImportRejectionCodes)[number];

export interface SessionArchiveImportRejection {
  readonly code: SessionArchiveImportRejectionCode;
  readonly message: string;
  readonly path: string;
}

/* -------------------------------------------------------------- writer boundary */

/** The one multi-store transaction of the writer page. */
export interface SessionArchiveTransactionRunner {
  transact<T>(
    stores: readonly PersistenceStoreName[],
    work: (transaction: TransactionPort) => Promise<T>,
  ): Promise<T>;
}

/** Adapts a 127 database connection to the import transaction boundary. */
export function createSessionArchiveTransactionRunner(
  database: DatabasePort,
): SessionArchiveTransactionRunner {
  return Object.freeze({
    transact: <T>(
      stores: readonly PersistenceStoreName[],
      work: (transaction: TransactionPort) => Promise<T>,
    ): Promise<T> => database.transact(stores, 'readwrite', work),
  });
}

/* --------------------------------------------------------------------- commit */

/** The stores one replacement touches; `profiles` is read to resolve the profile reference. */
export const SESSION_ARCHIVE_IMPORT_STORES: readonly PersistenceStoreName[] = Object.freeze([
  'profiles',
  'profileActivations',
  'checkpoints',
  'progress',
  'settings',
  'scenarios',
]);

export interface SessionArchiveProgressCommit {
  readonly recordId: string;
  readonly revision: number;
  readonly bodyBytes: number;
}

/** What the replacement really removed; the UI shows this before the confirmation. */
export interface SessionArchiveReplaced {
  readonly progress: number;
  readonly scenarios: number;
  readonly checkpoints: number;
  readonly settings: boolean;
}

export interface SessionArchiveCommit {
  readonly version: typeof SESSION_ARCHIVE_IMPORT_VERSION;
  readonly sessionId: string;
  readonly playerId: string;
  readonly worldEpoch: number;
  readonly checkpointId: string | null;
  readonly checkpointTick: number | null;
  readonly progress: readonly SessionArchiveProgressCommit[];
  readonly scenarios: number;
  readonly settings: 'WRITTEN' | 'DEFAULTS';
  readonly replaced: SessionArchiveReplaced;
  readonly bytes: number;
  readonly checksum: string;
  readonly sizes: SessionArchiveSizes;
}

function archiveFailure(
  code: SessionArchiveRejection['code'],
  message: string,
  path: string,
): SessionArchiveError {
  return new SessionArchiveError(code, message, path);
}

/**
 * Writes one accepted archive over the session, inside the caller's transaction.
 *
 * Every step that can refuse runs before the first write: the profile generation is resolved, every
 * row that will be deleted is parsed first (a corrupt stored row is reported, not overwritten
 * silently), and only then are the archived rows published. After the writes, the same transaction
 * re-reads the session and compares the 130 digests and the XP total with the archive, so a
 * mismatch rolls the whole replacement back instead of leaving a half-merged session.
 */
export async function commitSessionArchiveRows(
  transaction: TransactionPort,
  validation: SessionArchiveValidationAccepted,
  catalog: unknown,
  hooks: ProfileTransactionHooks = {},
): Promise<SessionArchiveCommit> {
  const session = validation.session;
  const components = validation.components;

  if (components.profile !== null) {
    const reference = components.profile;
    const stored = await transaction.get('profiles', reference.activeVersionId);
    if (stored === undefined) {
      throw archiveFailure(
        'PROFILE_VERSION_MISSING',
        `The profile version ${reference.activeVersionId} is not stored; a profile import is a separate action`,
        'profiles',
      );
    }
    const version = parseProfileRecord(stored);
    if (
      version.profileId !== reference.profileId ||
      version.checksum !== reference.versionChecksum
    ) {
      throw archiveFailure(
        'PROFILE_GENERATION_MISMATCH',
        `The stored version ${reference.activeVersionId} is not the one the checkpoint names`,
        'profiles',
      );
    }
    const activationRow = await transaction.get('profileActivations', reference.profileId);
    if (activationRow === undefined) {
      throw archiveFailure(
        'PROFILE_GENERATION_MISMATCH',
        `The profile ${reference.profileId} has no stored activation`,
        'profileActivations',
      );
    }
    const activation = parseActivationRecord(activationRow);
    if (
      activation.versionId !== reference.activeVersionId ||
      activation.sequence !== reference.activationSequence ||
      activation.playerId !== session.playerId
    ) {
      throw archiveFailure(
        'PROFILE_GENERATION_MISMATCH',
        `The stored activation ${activation.versionId}@${activation.sequence} is not the generation the checkpoint names`,
        'profileActivations',
      );
    }
  }

  const storedProgress: { readonly recordId: string; readonly revision: number }[] = [];
  for (const raw of await transaction.getAllByIndex('progress', 'bySession', session.sessionId)) {
    const row = parsePersistedRecord(raw, 'PROGRESS');
    storedProgress.push({ recordId: row.recordId, revision: row.revision });
  }
  const storedScenarios: { readonly recordId: string; readonly revision: number }[] = [];
  for (const raw of await transaction.getAllByIndex('scenarios', 'bySession', session.sessionId)) {
    const row = parsePersistedRecord(raw, 'SCENARIO');
    storedScenarios.push({ recordId: row.recordId, revision: row.revision });
  }
  const storedCheckpoints: string[] = [];
  for (const raw of await transaction.getAllByIndex(
    'checkpoints',
    'bySession',
    session.sessionId,
  )) {
    storedCheckpoints.push(parseCheckpointRecord(raw).checkpointId);
  }
  const settingsReplaced = (await transaction.get('settings', session.playerId)) !== undefined;

  for (const row of storedProgress) await transaction.delete('progress', row.recordId);
  for (const row of storedScenarios) await transaction.delete('scenarios', row.recordId);
  for (const checkpointId of storedCheckpoints) {
    await transaction.delete('checkpoints', checkpointId);
  }
  if (settingsReplaced) await transaction.delete('settings', session.playerId);

  const progress: SessionArchiveProgressCommit[] = [];
  for (const row of [components.progress, components.campaign]) {
    if (row === null) continue;
    const previous = storedProgress.find((entry) => entry.recordId === row.recordId);
    const revision =
      previous === undefined ? row.revision : Math.max(row.revision, previous.revision + 1);
    const written = parsePersistedRecord({ ...row, revision }, 'PROGRESS');
    await transaction.put('progress', written);
    progress.push(
      Object.freeze({
        recordId: written.recordId,
        revision: written.revision,
        bodyBytes: written.bodyBytes,
      }),
    );
  }

  if (components.settings !== null) {
    await transaction.put('settings', parseSettingsRecord(components.settings));
  }

  for (const row of components.scenarios) {
    const previous = storedScenarios.find((entry) => entry.recordId === row.recordId);
    const revision =
      previous === undefined ? row.revision : Math.max(row.revision, previous.revision + 1);
    const written = parsePersistedRecord({ ...row, revision }, 'SCENARIO');
    await transaction.put('scenarios', written);
  }

  if (components.checkpoint !== null) {
    await transaction.put('checkpoints', parseCheckpointRecord(components.checkpoint));
  }

  // The replacement is verified inside the same transaction: the written rows must decode to the
  // archive's digests and XP, otherwise the transaction aborts and the previous session survives.
  const writtenRows = await transaction.getAllByIndex('progress', 'bySession', session.sessionId);
  const writtenSettings = await transaction.get('settings', session.playerId);
  const save = decodePlayerSave({
    sessionId: session.sessionId,
    playerId: session.playerId,
    catalog,
    rows: { progress: writtenRows, settings: writtenSettings },
  });
  const writtenProgressIds = writtenRows
    .map((raw) => parsePersistedRecord(raw, 'PROGRESS').recordId)
    .sort();
  const expectedIds = [components.progress, components.campaign]
    .filter((row) => row !== null)
    .map((row) => row.recordId)
    .sort();
  if (writtenProgressIds.join('|') !== expectedIds.join('|')) {
    throw archiveFailure(
      'PROGRESS_INVALID',
      'The replaced session does not contain exactly the archived progress rows',
      'progress',
    );
  }
  if (save.tracker?.digest !== validation.digests.tracker) {
    throw new PersistenceError(
      'SAVE_DIGEST_MISMATCH',
      'The stored mission tracker is not the archived one',
      'progress',
    );
  }
  if (save.campaign?.digest !== validation.digests.campaign) {
    throw new PersistenceError(
      'LEDGER_REPLAY_MISMATCH',
      'The stored campaign log is not the archived one',
      'progress',
    );
  }
  if ((save.campaign?.rewards.totals.xp ?? 0) !== validation.counts.xp) {
    throw new PersistenceError(
      'LEDGER_REPLAY_MISMATCH',
      'The replaced session does not carry the archived XP total',
      'progress',
    );
  }

  hooks.beforeCommit?.();

  return Object.freeze({
    version: SESSION_ARCHIVE_IMPORT_VERSION,
    sessionId: session.sessionId,
    playerId: session.playerId,
    worldEpoch: session.worldEpoch,
    checkpointId: components.checkpoint?.checkpointId ?? null,
    checkpointTick: components.checkpoint?.tick ?? null,
    progress: Object.freeze(progress),
    scenarios: components.scenarios.length,
    settings: components.settings === null ? 'DEFAULTS' : 'WRITTEN',
    replaced: Object.freeze({
      progress: storedProgress.length,
      scenarios: storedScenarios.length,
      checkpoints: storedCheckpoints.length,
      settings: settingsReplaced,
    }),
    bytes: validation.sizes.total,
    checksum: validation.document.checksum.value,
    sizes: validation.sizes,
  });
}

/* ---------------------------------------------------------------------- store */

export interface SessionArchiveStoreOptions {
  readonly repository: LocalRepository;
  /** The authored 125 catalog of this build; the archived campaign is replayed against it. */
  readonly catalog: unknown;
  readonly transactions: SessionArchiveTransactionRunner;
}

export interface SessionArchiveSessionTarget {
  readonly sessionId: string;
  readonly playerId: string;
}

export interface SessionArchiveImportRequest extends SessionArchiveSessionTarget {
  /** The file text or an already parsed object; the strict reader accepts both. */
  readonly document: unknown;
  readonly hooks?: ProfileTransactionHooks;
}

export interface SessionArchiveImportAccepted {
  readonly version: typeof SESSION_ARCHIVE_IMPORT_VERSION;
  readonly status: 'COMMITTED' | 'CRASHED_AFTER_COMMIT';
  readonly crashAfterCommit: boolean;
  readonly sessionId: string;
  readonly playerId: string;
  readonly checksum: string;
  readonly sizes: SessionArchiveSizes;
  readonly counts: SessionArchiveCounts;
  readonly replacement: SessionArchiveCommit;
  readonly validation: SessionArchiveValidationAccepted;
  readonly rejection: null;
}

export interface SessionArchiveImportRejected {
  readonly version: typeof SESSION_ARCHIVE_IMPORT_VERSION;
  readonly status: 'REJECTED';
  readonly crashAfterCommit: false;
  readonly sessionId: string;
  readonly playerId: string;
  readonly checksum: null;
  readonly sizes: null;
  readonly counts: null;
  readonly replacement: null;
  readonly validation: null;
  readonly rejection: SessionArchiveImportRejection;
}

export type SessionArchiveImportResult =
  SessionArchiveImportAccepted | SessionArchiveImportRejected;

/** The session as it is stored right now; the confirmation step compares it with the archive. */
export interface SessionArchiveCurrentState {
  readonly progressRows: number;
  readonly scenarios: number;
  readonly checkpoint: {
    readonly checkpointId: string;
    readonly tick: number;
    readonly generation: number;
  } | null;
  readonly settings: 'STORED' | 'DEFAULTS';
  readonly xp: number | null;
  readonly completed: number | null;
}

export interface SessionArchivePreviewAccepted {
  readonly status: 'ACCEPTED';
  readonly validation: SessionArchiveValidationAccepted;
  readonly current: SessionArchiveCurrentState;
  readonly rejection: null;
}

export interface SessionArchivePreviewRejected {
  readonly status: 'REJECTED';
  readonly validation: null;
  readonly current: null;
  readonly rejection: SessionArchiveImportRejection;
}

export type SessionArchivePreview = SessionArchivePreviewAccepted | SessionArchivePreviewRejected;

export type SessionArchiveStoreExportOptions = Omit<SessionArchiveExportOptions, 'catalog'>;

export interface SessionArchiveStore {
  readonly export: (
    options: SessionArchiveStoreExportOptions,
  ) => Promise<SessionArchiveExportResult>;
  /** Validates a file and reports what replacing it would change; nothing is written. */
  readonly preview: (request: SessionArchiveImportRequest) => Promise<SessionArchivePreview>;
  /** Validates and replaces the session in one transaction. */
  readonly import: (request: SessionArchiveImportRequest) => Promise<SessionArchiveImportResult>;
}

function importRejected(
  sessionId: string,
  playerId: string,
  rejection: SessionArchiveImportRejection,
): SessionArchiveImportRejected {
  return Object.freeze({
    version: SESSION_ARCHIVE_IMPORT_VERSION,
    status: 'REJECTED' as const,
    crashAfterCommit: false as const,
    sessionId,
    playerId,
    checksum: null,
    sizes: null,
    counts: null,
    replacement: null,
    validation: null,
    rejection,
  });
}

function importRejection(error: unknown): SessionArchiveImportRejection {
  if (error instanceof SessionArchiveError) {
    return Object.freeze({ code: error.code, message: error.message, path: error.path });
  }
  if (error instanceof PersistenceError) {
    const code: SessionArchiveImportRejectionCode =
      error.code === 'WRITER_REQUIRED'
        ? 'WRITER_REQUIRED'
        : error.code === 'REPOSITORY_CLOSED' || error.code === 'REPOSITORY_DISPOSED'
          ? 'REPOSITORY_CLOSED'
          : error.code === 'TRANSACTION_ABORTED'
            ? 'TRANSACTION_ABORTED'
            : 'IMPORT_STORE_REJECTED';
    return Object.freeze({
      code,
      message: `${error.code}: ${error.message}`,
      path: error.path ?? '$',
    });
  }
  return Object.freeze({
    code: 'IMPORT_WRITE_FAILED' as const,
    message: error instanceof Error ? error.message : 'The archive import failed',
    path: '$',
  });
}

async function currentState(
  repository: LocalRepository,
  catalog: unknown,
  target: SessionArchiveSessionTarget,
): Promise<SessionArchiveCurrentState> {
  const rows = await repository.readPlayerSave(target.sessionId, target.playerId);
  const scenarios = await repository.listScenarios(target.sessionId);
  const checkpoint = await repository.latestCheckpoint(target.sessionId);
  let xp: number | null = null;
  let completed: number | null = null;
  try {
    const save = decodePlayerSave({
      sessionId: target.sessionId,
      playerId: target.playerId,
      catalog,
      rows,
    });
    xp = save.campaign?.rewards.totals.xp ?? 0;
    completed = save.campaign?.counts.completed ?? 0;
  } catch {
    // A corrupt session is reported as unknown instead of being "repaired" for the summary.
    xp = null;
    completed = null;
  }
  return Object.freeze({
    progressRows: rows.progress.length,
    scenarios: scenarios.length,
    checkpoint:
      checkpoint === null
        ? null
        : Object.freeze({
            checkpointId: checkpoint.checkpointId,
            tick: checkpoint.tick,
            generation: checkpoint.generation,
          }),
    settings: rows.settings === null ? 'DEFAULTS' : 'STORED',
    xp,
    completed,
  });
}

/**
 * The application-facing archive port.
 *
 * `export` reads the session from the repository, `preview` validates a file and describes the
 * change, and `import` replaces the session in one transaction. The store never keeps a second copy
 * of the state: every operation reads or writes the database.
 */
export function createSessionArchiveStore(
  options: SessionArchiveStoreOptions,
): SessionArchiveStore {
  const repository = options.repository;
  const catalog = options.catalog;
  const transactions = options.transactions;

  async function preview(request: SessionArchiveImportRequest): Promise<SessionArchivePreview> {
    const validation = readSessionArchive(request.document, {
      sessionId: request.sessionId,
      playerId: request.playerId,
      catalog,
    });
    if (validation.status === 'REJECTED') {
      return Object.freeze({
        status: 'REJECTED' as const,
        validation: null,
        current: null,
        rejection: Object.freeze({
          code: validation.rejection.code,
          message: validation.rejection.message,
          path: validation.rejection.path,
        }),
      });
    }
    try {
      const current = await currentState(repository, catalog, request);
      return Object.freeze({
        status: 'ACCEPTED' as const,
        validation,
        current,
        rejection: null,
      });
    } catch (error) {
      return Object.freeze({
        status: 'REJECTED' as const,
        validation: null,
        current: null,
        rejection: importRejection(error),
      });
    }
  }

  async function importArchive(
    request: SessionArchiveImportRequest,
  ): Promise<SessionArchiveImportResult> {
    const validation = readSessionArchive(request.document, {
      sessionId: request.sessionId,
      playerId: request.playerId,
      catalog,
    });
    if (validation.status === 'REJECTED') {
      return importRejected(request.sessionId, request.playerId, {
        code: validation.rejection.code,
        message: validation.rejection.message,
        path: validation.rejection.path,
      });
    }
    const status = repository.status();
    if (status.state !== 'READY') {
      return importRejected(request.sessionId, request.playerId, {
        code: 'REPOSITORY_CLOSED',
        message: `The repository is ${status.state}`,
        path: 'repository',
      });
    }
    if (status.role !== 'WRITER') {
      return importRejected(request.sessionId, request.playerId, {
        code: 'WRITER_REQUIRED',
        message: 'This page does not own the writer lock; an import never runs in a second tab',
        path: 'writer',
      });
    }

    // A cheap read-only check of the profile generation before opening a write transaction.
    const profile = validation.components.profile;
    if (profile !== null) {
      const version = await repository.getProfile(profile.activeVersionId);
      if (version === null) {
        return importRejected(request.sessionId, request.playerId, {
          code: 'PROFILE_VERSION_MISSING',
          message: `The profile version ${profile.activeVersionId} is not stored; a profile import is a separate action`,
          path: 'profiles',
        });
      }
      const activation = await repository.getActivation(profile.profileId);
      if (
        version.profileId !== profile.profileId ||
        version.checksum !== profile.versionChecksum ||
        activation === null ||
        activation.versionId !== profile.activeVersionId ||
        activation.sequence !== profile.activationSequence ||
        activation.playerId !== validation.session.playerId
      ) {
        return importRejected(request.sessionId, request.playerId, {
          code: 'PROFILE_GENERATION_MISMATCH',
          message: `The stored profile generation of ${profile.profileId} is not the one the checkpoint names`,
          path: 'profiles',
        });
      }
    }

    let commit: SessionArchiveCommit;
    try {
      commit = await transactions.transact(SESSION_ARCHIVE_IMPORT_STORES, (transaction) =>
        commitSessionArchiveRows(transaction, validation, catalog, {
          beforeCommit: request.hooks?.beforeCommit,
        }),
      );
    } catch (error) {
      return importRejected(request.sessionId, request.playerId, importRejection(error));
    }
    let crashAfterCommit = false;
    if (request.hooks?.afterCommit !== undefined) {
      try {
        request.hooks.afterCommit();
      } catch {
        // The transaction already committed: the replaced session is durable.
        crashAfterCommit = true;
      }
    }
    return Object.freeze({
      version: SESSION_ARCHIVE_IMPORT_VERSION,
      status: crashAfterCommit ? ('CRASHED_AFTER_COMMIT' as const) : ('COMMITTED' as const),
      crashAfterCommit,
      sessionId: commit.sessionId,
      playerId: commit.playerId,
      checksum: commit.checksum,
      sizes: commit.sizes,
      counts: validation.counts,
      replacement: commit,
      validation,
      rejection: null,
    });
  }

  return Object.freeze({
    export: (request: SessionArchiveStoreExportOptions) =>
      exportSessionArchive(repository, { ...request, catalog }),
    preview,
    import: importArchive,
  });
}

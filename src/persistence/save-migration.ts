import {
  META_SCHEMA_KEY,
  PERSISTENCE_DB_NAME,
  PERSISTENCE_FORMAT,
  PERSISTENCE_SCHEMA_VERSION,
  PersistenceError,
  persistenceStoreNames,
} from './contracts';
import type { PersistenceReasonCode, PersistenceStoreName, SchemaStep } from './contracts';
import {
  CANONICALIZATION_VERSION,
  CHECKSUM_ALGORITHM,
  canonicalizeJson,
  parseStrictJson,
  sha256Hex,
} from './canonical-json';
import { planUpgrade, schemaStores } from './schema';
import type { DatabasePort, FactoryPort } from './ports';

/**
 * Versioned local-save migration with a pre-migration export and a recovery path (PBI 136).
 *
 * The IndexedDB layout history itself is declared by 127 (`PERSISTENCE_SCHEMA_STEPS`); this module
 * makes the history operational for a restart:
 *
 * 1. **The source version is discovered, never assumed.** The build opens the existing database at
 *    version 1 first. A database already at the build version is `CURRENT` with zero steps; an older
 *    one is read, exported and only then upgraded; a database newer than the build is refused with
 *    `SCHEMA_TOO_NEW` instead of being opened with today's smaller layout.
 * 2. **The pre-migration export is taken before the upgrade.** Every row of every store that exists
 *    at the source version is copied into a canonical `SDA-CJSON-1` document with a `SHA-256`
 *    checksum and a row digest. It is the user's copy of exactly the state that is about to change.
 * 3. **A failed migration changes nothing.** The upgrade runs inside the adapter's own transaction,
 *    so a throw leaves the previous version and rows in place. The module re-reads the database
 *    afterwards and reports `untouched` only when the row digest still equals the exported one; a
 *    difference is an explicit `MIGRATION_CORRUPTED`, not a silent loss.
 * 4. **Recovery is a real path, not a message.** `recoverSaveMigration` reads the export back,
 *    refuses a non-empty target, writes every row in one transaction and verifies the row digest
 *    inside that transaction, so a failed write rolls back instead of leaving half a save behind.
 */

export const SAVE_MIGRATION_VERSION = '136-save-migration-v1' as const;

export const SAVE_MIGRATION_EXPORT_FORMAT = 'self-driving-academy-save-migration-export' as const;
export const SAVE_MIGRATION_EXPORT_FORMAT_VERSION = 1 as const;

export const SAVE_MIGRATION_LIMITS = Object.freeze({
  /** Whole export document, in UTF-16 code units. */
  maxExportBytes: 8_388_608,
  /** Rows carried by one export; a larger save is an explicit refusal, never a truncation. */
  maxRows: 32_768,
  maxDepth: 40,
});

export const saveMigrationCodes = [
  'SCHEMA_TOO_NEW',
  'MIGRATION_FAILED',
  'MIGRATION_CORRUPTED',
  'OPEN_FAILED',
  'EXPORT_TOO_LARGE',
  'EXPORT_REJECTED',
  'EXPORT_FORMAT_UNSUPPORTED',
  'EXPORT_CHECKSUM_MISMATCH',
  'RECOVERY_TARGET_NOT_EMPTY',
  'RECOVERY_WRITE_FAILED',
  'INVALID_REQUEST',
] as const;
export type SaveMigrationCode = (typeof saveMigrationCodes)[number];

export interface SaveMigrationStoreRows {
  readonly name: PersistenceStoreName;
  readonly keyPath: string;
  readonly rows: readonly unknown[];
}

export interface SaveMigrationCounts {
  readonly stores: number;
  readonly rows: number;
}

export interface SaveMigrationIntegrity {
  readonly algorithm: typeof CHECKSUM_ALGORITHM;
  readonly canonicalization: typeof CANONICALIZATION_VERSION;
  readonly value: string;
}

export interface SaveMigrationExport {
  readonly format: typeof SAVE_MIGRATION_EXPORT_FORMAT;
  readonly formatVersion: typeof SAVE_MIGRATION_EXPORT_FORMAT_VERSION;
  readonly formatId: typeof PERSISTENCE_FORMAT;
  readonly database: string;
  readonly sourceSchemaVersion: number;
  readonly targetSchemaVersion: number;
  readonly createdAt: string;
  /** `SDA-CJSON-1`/SHA-256 over the ordered rows; recovery re-checks it. */
  readonly digest: string;
  readonly counts: SaveMigrationCounts;
  readonly stores: readonly SaveMigrationStoreRows[];
  readonly checksum: SaveMigrationIntegrity;
}

export interface SaveMigrationExportInput {
  readonly database: string;
  readonly sourceSchemaVersion: number;
  readonly targetSchemaVersion: number;
  readonly createdAt: string;
  readonly stores: readonly SaveMigrationStoreRows[];
}

export type SaveMigrationExportResult =
  | {
      readonly status: 'ACCEPTED';
      readonly document: SaveMigrationExport;
      readonly bytes: number;
      readonly digest: string;
    }
  | {
      readonly status: 'REJECTED';
      readonly code: SaveMigrationCode;
      readonly message: string;
      readonly path: string;
    };

export type SaveMigrationReadResult =
  | {
      readonly status: 'ACCEPTED';
      readonly document: SaveMigrationExport;
      readonly bytes: number;
    }
  | {
      readonly status: 'REJECTED';
      readonly code: SaveMigrationCode;
      readonly message: string;
      readonly path: string;
    };

export interface SaveMigrationSuccess {
  readonly status: 'MIGRATED' | 'CURRENT' | 'CREATED';
  readonly fromVersion: number;
  readonly toVersion: number;
  /** Step ids in order; empty for a database already at the build version. */
  readonly applied: readonly string[];
  readonly export: SaveMigrationExport | null;
  readonly counts: SaveMigrationCounts;
}

export interface SaveMigrationFailure {
  readonly status: 'FAILED';
  readonly code: SaveMigrationCode;
  readonly message: string;
  readonly fromVersion: number | null;
  readonly toVersion: number;
  readonly applied: readonly string[];
  readonly export: SaveMigrationExport | null;
  /** True only when the rows still match the pre-migration digest byte for byte. */
  readonly untouched: boolean;
}

export type SaveMigrationResult = SaveMigrationSuccess | SaveMigrationFailure;

export interface SaveMigrationOptions {
  readonly factory: FactoryPort;
  readonly database?: string;
  readonly now?: () => string;
}

export interface SaveMigrationRecoveryResult {
  readonly status: 'RECOVERED';
  readonly rows: number;
  readonly counts: SaveMigrationCounts;
  readonly digest: string;
  readonly checksum: string;
  readonly verified: true;
}

export interface SaveMigrationRecoveryFailure {
  readonly status: 'FAILED';
  readonly code: SaveMigrationCode;
  readonly message: string;
  readonly verified: false;
}

export type SaveMigrationRecoveryOutcome =
  SaveMigrationRecoveryResult | SaveMigrationRecoveryFailure;

/** Stores that exist at `version`, in declaration order. */
export function saveMigrationStores(version: number): readonly PersistenceStoreName[] {
  return Object.freeze(schemaStores(version).map((definition) => definition.name));
}

/** Steps needed to move `fromVersion` to the build version; refuses a newer database. */
export function saveMigrationPlan(fromVersion: number): readonly SchemaStep[] {
  return planUpgrade(fromVersion, PERSISTENCE_SCHEMA_VERSION);
}

function rejected(
  code: SaveMigrationCode,
  message: string,
  path = 'export',
): SaveMigrationExportResult {
  return Object.freeze({ status: 'REJECTED' as const, code, message, path });
}

function readRejected(
  code: SaveMigrationCode,
  message: string,
  path = 'export',
): SaveMigrationReadResult {
  return Object.freeze({ status: 'REJECTED' as const, code, message, path });
}

function failed(
  code: SaveMigrationCode,
  message: string,
  options: {
    readonly fromVersion: number | null;
    readonly applied?: readonly string[];
    readonly export?: SaveMigrationExport | null;
    readonly untouched?: boolean;
  },
): SaveMigrationFailure {
  return Object.freeze({
    status: 'FAILED' as const,
    code,
    message,
    fromVersion: options.fromVersion,
    toVersion: PERSISTENCE_SCHEMA_VERSION,
    applied: Object.freeze([...(options.applied ?? [])]),
    export: options.export ?? null,
    untouched: options.untouched ?? false,
  });
}

/** Canonical digest of the ordered rows; the same function proves an untouched database. */
export function saveMigrationRowsDigest(stores: readonly SaveMigrationStoreRows[]): string {
  const canonical = canonicalizeJson(
    stores.map((store) => ({
      name: store.name,
      keyPath: store.keyPath,
      rows: store.rows,
    })),
    { maxDepth: SAVE_MIGRATION_LIMITS.maxDepth },
  );
  if (canonical.status === 'REJECTED') {
    throw new PersistenceError(
      'BODY_INVALID',
      `The save rows are not canonical: ${canonical.rejection.message}`,
      canonical.rejection.path,
    );
  }
  return sha256Hex(canonical.text);
}

function totalRows(stores: readonly SaveMigrationStoreRows[]): number {
  return stores.reduce((sum, store) => sum + store.rows.length, 0);
}

/** Builds the checksummed pre-migration document from already-read rows. */
export function buildSaveMigrationExport(
  input: SaveMigrationExportInput,
): SaveMigrationExportResult {
  try {
    const stores = Object.freeze(
      input.stores.map((store) =>
        Object.freeze({
          name: store.name,
          keyPath: store.keyPath,
          rows: Object.freeze([...store.rows]),
        }),
      ),
    );
    const digest = saveMigrationRowsDigest(stores);
    const body = {
      format: SAVE_MIGRATION_EXPORT_FORMAT,
      formatVersion: SAVE_MIGRATION_EXPORT_FORMAT_VERSION,
      formatId: PERSISTENCE_FORMAT,
      database: input.database,
      sourceSchemaVersion: input.sourceSchemaVersion,
      targetSchemaVersion: input.targetSchemaVersion,
      createdAt: input.createdAt,
      digest,
      counts: { stores: stores.length, rows: totalRows(stores) },
      stores,
    };
    const canonical = canonicalizeJson(body, { maxDepth: SAVE_MIGRATION_LIMITS.maxDepth });
    if (canonical.status === 'REJECTED') {
      return rejected(
        'EXPORT_REJECTED',
        `The pre-migration export is not canonical: ${canonical.rejection.message}`,
        canonical.rejection.path,
      );
    }
    if (canonical.text.length > SAVE_MIGRATION_LIMITS.maxExportBytes) {
      return rejected(
        'EXPORT_TOO_LARGE',
        `The pre-migration export has ${canonical.text.length} code units, above the ${SAVE_MIGRATION_LIMITS.maxExportBytes} budget`,
        'export',
      );
    }
    if (body.counts.rows > SAVE_MIGRATION_LIMITS.maxRows) {
      return rejected(
        'EXPORT_TOO_LARGE',
        `The pre-migration export has ${body.counts.rows} rows, above the ${SAVE_MIGRATION_LIMITS.maxRows} budget`,
        'export.counts.rows',
      );
    }
    const document: SaveMigrationExport = Object.freeze({
      ...body,
      checksum: Object.freeze({
        algorithm: CHECKSUM_ALGORITHM,
        canonicalization: CANONICALIZATION_VERSION,
        value: sha256Hex(canonical.text),
      }),
    });
    return Object.freeze({
      status: 'ACCEPTED' as const,
      document,
      bytes: canonical.text.length,
      digest,
    });
  } catch (error) {
    return rejected(
      'EXPORT_REJECTED',
      error instanceof Error ? error.message : 'The pre-migration export could not be built',
    );
  }
}

function objectOf(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PersistenceError('BODY_INVALID', 'Expected a plain object', path);
  }
  return value as Record<string, unknown>;
}

function integerOf(value: unknown, path: string, minimum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new PersistenceError('INVALID_RECORD', 'Expected a nonnegative safe integer', path);
  }
  return value;
}

function textOf(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new PersistenceError('INVALID_RECORD', 'Expected text', path);
  }
  return value;
}

function storesOf(value: unknown): SaveMigrationStoreRows[] {
  if (!Array.isArray(value)) {
    throw new PersistenceError('INVALID_RECORD', 'Expected a store list', 'export.stores');
  }
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const data = objectOf(entry, `export.stores[${index}]`);
    const name = textOf(data.name, `export.stores[${index}].name`);
    if (!(persistenceStoreNames as readonly string[]).includes(name)) {
      throw new PersistenceError(
        'INVALID_RECORD',
        `Unknown store in the export: ${name}`,
        `export.stores[${index}].name`,
      );
    }
    if (seen.has(name)) {
      throw new PersistenceError(
        'INVALID_RECORD',
        `Store ${name} appears twice in the export`,
        `export.stores[${index}].name`,
      );
    }
    seen.add(name);
    const keyPath = textOf(data.keyPath, `export.stores[${index}].keyPath`);
    if (!Array.isArray(data.rows)) {
      throw new PersistenceError(
        'INVALID_RECORD',
        'Expected a row list',
        `export.stores[${index}].rows`,
      );
    }
    return Object.freeze({
      name: name as PersistenceStoreName,
      keyPath,
      rows: Object.freeze([...data.rows]),
    });
  });
}

/**
 * Reads an export back. The checksum is verified before any row is used, and the row digest is
 * recomputed from the rows themselves, so a document edited after export is refused.
 */
export function readSaveMigrationExport(value: unknown): SaveMigrationReadResult {
  let parsed: unknown = value;
  let bytes = 0;
  if (typeof value === 'string') {
    const strict = parseStrictJson(value, {
      maxBytes: SAVE_MIGRATION_LIMITS.maxExportBytes,
      maxDepth: SAVE_MIGRATION_LIMITS.maxDepth,
    });
    if (strict.status === 'REJECTED') {
      const code: SaveMigrationCode =
        strict.rejection.code === 'FILE_TOO_LARGE' ? 'EXPORT_TOO_LARGE' : 'EXPORT_REJECTED';
      return readRejected(code, strict.rejection.message, strict.rejection.path);
    }
    parsed = strict.value;
    bytes = value.length;
  }
  try {
    const data = objectOf(parsed, 'export');
    if (data.format !== SAVE_MIGRATION_EXPORT_FORMAT) {
      return readRejected(
        'EXPORT_FORMAT_UNSUPPORTED',
        `Unsupported export format: ${String(data.format)}`,
        'export.format',
      );
    }
    if (data.formatVersion !== SAVE_MIGRATION_EXPORT_FORMAT_VERSION) {
      return readRejected(
        'EXPORT_FORMAT_UNSUPPORTED',
        `Unsupported export format version: ${String(data.formatVersion)}`,
        'export.formatVersion',
      );
    }
    if (data.formatId !== PERSISTENCE_FORMAT) {
      return readRejected(
        'EXPORT_FORMAT_UNSUPPORTED',
        `The export belongs to another format: ${String(data.formatId)}`,
        'export.formatId',
      );
    }
    const sourceSchemaVersion = integerOf(
      data.sourceSchemaVersion,
      'export.sourceSchemaVersion',
      0,
    );
    const targetSchemaVersion = integerOf(
      data.targetSchemaVersion,
      'export.targetSchemaVersion',
      1,
    );
    if (sourceSchemaVersion > PERSISTENCE_SCHEMA_VERSION) {
      return readRejected(
        'SCHEMA_TOO_NEW',
        `The export was written at schema ${sourceSchemaVersion}, newer than ${PERSISTENCE_SCHEMA_VERSION}`,
        'export.sourceSchemaVersion',
      );
    }
    if (targetSchemaVersion > PERSISTENCE_SCHEMA_VERSION) {
      return readRejected(
        'SCHEMA_TOO_NEW',
        `The export targets schema ${targetSchemaVersion}, newer than ${PERSISTENCE_SCHEMA_VERSION}`,
        'export.targetSchemaVersion',
      );
    }
    const database = textOf(data.database, 'export.database');
    const createdAt = textOf(data.createdAt, 'export.createdAt');
    const digest = textOf(data.digest, 'export.digest');
    const stores = storesOf(data.stores);
    const counts = objectOf(data.counts, 'export.counts');
    const declaredRows = integerOf(counts.rows, 'export.counts.rows', 0);
    const declaredStores = integerOf(counts.stores, 'export.counts.stores', 0);
    if (declaredStores !== stores.length || declaredRows !== totalRows(stores)) {
      return readRejected(
        'EXPORT_CHECKSUM_MISMATCH',
        'The declared counts do not describe the exported rows',
        'export.counts',
      );
    }
    const checksumData = objectOf(data.checksum, 'export.checksum');
    if (
      checksumData.algorithm !== CHECKSUM_ALGORITHM ||
      checksumData.canonicalization !== CANONICALIZATION_VERSION
    ) {
      return readRejected(
        'EXPORT_FORMAT_UNSUPPORTED',
        'Unsupported checksum or canonicalization',
        'export.checksum',
      );
    }
    const checksumValue = textOf(checksumData.value, 'export.checksum.value');
    const body = {
      format: SAVE_MIGRATION_EXPORT_FORMAT,
      formatVersion: SAVE_MIGRATION_EXPORT_FORMAT_VERSION,
      formatId: PERSISTENCE_FORMAT,
      database,
      sourceSchemaVersion,
      targetSchemaVersion,
      createdAt,
      digest,
      counts: { stores: stores.length, rows: totalRows(stores) },
      stores,
    };
    const canonical = canonicalizeJson(body, { maxDepth: SAVE_MIGRATION_LIMITS.maxDepth });
    if (canonical.status === 'REJECTED') {
      return readRejected('EXPORT_REJECTED', canonical.rejection.message, canonical.rejection.path);
    }
    if (canonical.text.length > SAVE_MIGRATION_LIMITS.maxExportBytes) {
      return readRejected('EXPORT_TOO_LARGE', 'The export is above the read budget', 'export');
    }
    if (sha256Hex(canonical.text) !== checksumValue) {
      return readRejected(
        'EXPORT_CHECKSUM_MISMATCH',
        'The export checksum does not describe its content',
        'export.checksum.value',
      );
    }
    if (saveMigrationRowsDigest(stores) !== digest) {
      return readRejected(
        'EXPORT_CHECKSUM_MISMATCH',
        'The row digest does not describe the exported rows',
        'export.digest',
      );
    }
    const document: SaveMigrationExport = Object.freeze({
      ...body,
      checksum: Object.freeze({
        algorithm: CHECKSUM_ALGORITHM,
        canonicalization: CANONICALIZATION_VERSION,
        value: checksumValue,
      }),
    });
    return Object.freeze({
      status: 'ACCEPTED' as const,
      document,
      bytes: bytes === 0 ? canonical.text.length : bytes,
    });
  } catch (error) {
    return readRejected(
      'EXPORT_REJECTED',
      error instanceof Error ? error.message : 'The export could not be read',
    );
  }
}

/* ------------------------------------------------------------------- open */

interface OpenedAt {
  readonly status: 'OPENED';
  readonly database: DatabasePort;
  readonly version: number;
  readonly previousVersion: number;
  readonly applied: readonly string[];
}

interface OpenRefused {
  readonly status: 'FAILED';
  readonly code: PersistenceReasonCode;
  readonly message: string;
}

type OpenAtResult = OpenedAt | OpenRefused;

function openAt(
  factory: FactoryPort,
  name: string,
  version: number,
  now: () => string,
): Promise<OpenAtResult> {
  return factory
    .open({
      name,
      version,
      plan: (fromVersion) => planUpgrade(fromVersion, version),
      now,
    })
    .then(
      (outcome): OpenAtResult => {
        if (outcome.status === 'OPENED') {
          return Object.freeze({
            status: 'OPENED' as const,
            database: outcome.database,
            version: outcome.database.version,
            previousVersion: outcome.previousVersion,
            applied: outcome.appliedMigrations,
          });
        }
        if (outcome.status === 'BLOCKED') {
          outcome.cancel();
          return Object.freeze({
            status: 'FAILED' as const,
            code: 'UPGRADE_BLOCKED' as const,
            message: 'A newer schema upgrade is blocked by another open connection',
          });
        }
        return Object.freeze({
          status: 'FAILED' as const,
          code: outcome.code,
          message: outcome.message,
        });
      },
      (error: unknown): OpenRefused =>
        Object.freeze({
          status: 'FAILED' as const,
          code: 'OPEN_FAILED' as const,
          message: error instanceof Error ? error.message : 'The database could not be opened',
        }),
    );
}

function keepUserRows(name: PersistenceStoreName, rows: readonly unknown[]): readonly unknown[] {
  // The schema marker is the database declaration, not user data: it is described by
  // `sourceSchemaVersion`/`targetSchemaVersion` and must not be copied back over a build-version
  // marker during recovery.
  if (name !== 'meta') return rows;
  return rows.filter((row) => {
    if (typeof row !== 'object' || row === null) return true;
    return (row as Record<string, unknown>).key !== META_SCHEMA_KEY;
  });
}

async function readRows(
  database: DatabasePort,
  stores: readonly PersistenceStoreName[],
): Promise<readonly SaveMigrationStoreRows[]> {
  if (stores.length === 0) return Object.freeze([]);
  const definitions = new Map(
    schemaStores(PERSISTENCE_SCHEMA_VERSION).map((definition) => [definition.name, definition]),
  );
  return database.transact(stores, 'readonly', async (transaction) => {
    const result: SaveMigrationStoreRows[] = [];
    for (const name of stores) {
      const rows = await transaction.getAll(name);
      result.push(
        Object.freeze({
          name,
          keyPath: definitions.get(name)?.keyPath ?? name,
          rows: Object.freeze([...keepUserRows(name, rows)]),
        }),
      );
    }
    return Object.freeze(result);
  });
}

function upgradeCodeOf(code: PersistenceReasonCode | 'UPGRADE_BLOCKED'): SaveMigrationCode {
  if (code === 'SCHEMA_TOO_NEW') return 'SCHEMA_TOO_NEW';
  if (code === 'MIGRATION_FAILED') return 'MIGRATION_FAILED';
  return 'OPEN_FAILED';
}

/* -------------------------------------------------------------- migration */

/**
 * Migrates the local save database to the build schema, exporting the pre-migration state first.
 *
 * The result is explicit in every branch: `CURRENT`, `CREATED`, `MIGRATED` or `FAILED` with the
 * exact code, the applied steps and (for a failure) the export the user can recover from.
 */
export async function migrateSaveDatabase(
  options: SaveMigrationOptions,
): Promise<SaveMigrationResult> {
  const databaseName = options.database ?? PERSISTENCE_DB_NAME;
  const now = options.now ?? (() => new Date().toISOString());

  const source = await openAt(options.factory, databaseName, 1, now);
  if (source.status === 'FAILED') {
    if (source.code !== 'SCHEMA_TOO_NEW') {
      return failed(upgradeCodeOf(source.code), source.message, { fromVersion: null });
    }
    // The database is not at version 1; either it is already at the build version or it belongs to
    // a newer build, which must never be opened with fewer stores.
    const current = await openAt(options.factory, databaseName, PERSISTENCE_SCHEMA_VERSION, now);
    if (current.status === 'FAILED') {
      return failed(upgradeCodeOf(current.code), current.message, {
        fromVersion: null,
        untouched: false,
      });
    }
    try {
      return Object.freeze({
        status: 'CURRENT' as const,
        fromVersion: current.version,
        toVersion: PERSISTENCE_SCHEMA_VERSION,
        applied: Object.freeze([...current.applied]),
        export: null,
        counts: Object.freeze({ stores: 0, rows: 0 }),
      });
    } finally {
      current.database.close();
    }
  }

  const fromVersion = source.version;
  const created = source.previousVersion === 0;
  let exported: SaveMigrationExport | null = null;
  let sourceRows: readonly SaveMigrationStoreRows[] = Object.freeze([]);
  try {
    sourceRows = await readRows(source.database, saveMigrationStores(fromVersion));
    if (totalRows(sourceRows) > SAVE_MIGRATION_LIMITS.maxRows) {
      return failed(
        'EXPORT_TOO_LARGE',
        `The save has ${totalRows(sourceRows)} rows, above the ${SAVE_MIGRATION_LIMITS.maxRows} export budget`,
        { fromVersion, untouched: true },
      );
    }
    const built = buildSaveMigrationExport({
      database: databaseName,
      sourceSchemaVersion: fromVersion,
      targetSchemaVersion: PERSISTENCE_SCHEMA_VERSION,
      createdAt: now(),
      stores: sourceRows,
    });
    if (built.status === 'REJECTED') {
      return failed(built.code, built.message, { fromVersion, untouched: true });
    }
    exported = built.document;
  } finally {
    source.database.close();
  }

  const upgrade = await openAt(options.factory, databaseName, PERSISTENCE_SCHEMA_VERSION, now);
  if (upgrade.status === 'OPENED') {
    try {
      return Object.freeze({
        status: created ? ('CREATED' as const) : ('MIGRATED' as const),
        fromVersion: created ? 0 : fromVersion,
        toVersion: upgrade.version,
        // A fresh database paid the version-1 step while it was being read; report the whole chain.
        applied: Object.freeze([...source.applied, ...upgrade.applied]),
        export: exported,
        counts: Object.freeze({
          stores: sourceRows.length,
          rows: totalRows(sourceRows),
        }),
      });
    } finally {
      upgrade.database.close();
    }
  }

  // The upgrade was refused. Prove that nothing moved: only then is `untouched` reported.
  const verify = await openAt(options.factory, databaseName, fromVersion, now);
  let untouched = false;
  let verifiedRows: readonly SaveMigrationStoreRows[] = Object.freeze([]);
  if (verify.status === 'OPENED') {
    try {
      verifiedRows = await readRows(verify.database, saveMigrationStores(fromVersion));
      untouched = saveMigrationRowsDigest(verifiedRows) === exported.digest;
    } finally {
      verify.database.close();
    }
  }
  return failed(upgradeCodeOf(upgrade.code), upgrade.message, {
    fromVersion: created ? 0 : fromVersion,
    applied: [],
    export: exported,
    untouched,
  });
}

/* --------------------------------------------------------------- recovery */

export interface SaveMigrationRecoveryOptions {
  readonly factory: FactoryPort;
  /** Target database; defaults to the source database of the export. */
  readonly database?: string;
  readonly now?: () => string;
}

function recoveryFailed(code: SaveMigrationCode, message: string): SaveMigrationRecoveryFailure {
  return Object.freeze({ status: 'FAILED' as const, code, message, verified: false as const });
}

/**
 * Writes an exported pre-migration state into an empty database and verifies the result.
 *
 * The write and the verification share one transaction, so a mismatch aborts the transaction and
 * the target stays empty. Recovery never merges into existing rows: a non-empty target is refused.
 */
export async function recoverSaveMigration(
  document: unknown,
  options: SaveMigrationRecoveryOptions,
): Promise<SaveMigrationRecoveryOutcome> {
  const read = readSaveMigrationExport(document);
  if (read.status === 'REJECTED') {
    return recoveryFailed(read.code, read.message);
  }
  const now = options.now ?? (() => new Date().toISOString());
  const databaseName = options.database ?? read.document.database;
  const target = await openAt(options.factory, databaseName, PERSISTENCE_SCHEMA_VERSION, now);
  if (target.status === 'FAILED') {
    return recoveryFailed(upgradeCodeOf(target.code), target.message);
  }
  try {
    const stores =
      target.database.version === PERSISTENCE_SCHEMA_VERSION
        ? saveMigrationStores(PERSISTENCE_SCHEMA_VERSION)
        : saveMigrationStores(target.database.version);
    const existing = await readRows(target.database, stores);
    if (totalRows(existing) > 0) {
      return recoveryFailed(
        'RECOVERY_TARGET_NOT_EMPTY',
        `Database ${databaseName} already holds ${totalRows(existing)} row(s); recovery needs an empty target`,
      );
    }
    if (read.document.counts.rows > SAVE_MIGRATION_LIMITS.maxRows) {
      return recoveryFailed('EXPORT_TOO_LARGE', 'The export is above the recovery row budget');
    }
    const byName = new Map(read.document.stores.map((store) => [store.name, store]));
    const exported = read.document.stores.map((store) => store.name);
    try {
      const digest = await target.database.transact(stores, 'readwrite', async (transaction) => {
        for (const name of exported) {
          const store = byName.get(name);
          if (store === undefined) continue;
          for (const row of store.rows) await transaction.put(name, row);
        }
        // Verify inside the same transaction: a throw rolls the whole recovery back. The
        // comparison uses exactly the stores the export declares, so a newer empty store (such as
        // `checkpoints` in a version-1 export) does not look like a mismatch.
        const written: SaveMigrationStoreRows[] = [];
        for (const name of exported) {
          const stored = await transaction.getAll(name);
          written.push(
            Object.freeze({
              name,
              keyPath: byName.get(name)?.keyPath ?? name,
              rows: Object.freeze([...keepUserRows(name, stored)]),
            }),
          );
        }
        const verified = saveMigrationRowsDigest(written);
        if (verified !== read.document.digest) {
          throw new PersistenceError(
            'SAVE_DIGEST_MISMATCH',
            'The recovered rows do not match the export digest',
            'recovery.digest',
          );
        }
        return verified;
      });
      return Object.freeze({
        status: 'RECOVERED' as const,
        rows: read.document.counts.rows,
        counts: Object.freeze({
          stores: read.document.counts.stores,
          rows: read.document.counts.rows,
        }),
        digest,
        checksum: read.document.checksum.value,
        verified: true as const,
      });
    } catch (error) {
      return recoveryFailed(
        'RECOVERY_WRITE_FAILED',
        error instanceof Error ? error.message : 'The recovery transaction was aborted',
      );
    }
  } finally {
    target.database.close();
  }
}

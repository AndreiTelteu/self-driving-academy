/**
 * 140 experiment ledger isolation.
 *
 * An experiment reads the complete world, but it never owns the live ledgers: learning evidence,
 * granted rewards/XP and the KPI read model belong to the normal session. This module is the
 * ownership boundary. The experiment receives a handle that exposes exactly one observation
 * operation (the fingerprint) and one detached copy (the fork); there is no mutator for the live
 * rows at all, so a write cannot be routed to them by mistake.
 *
 * The boundary is demonstrated on two levels:
 *
 * - structural: the `ExperimentLedgerPort` handed to an experiment only declares `fingerprint()`,
 *   and `write()` always answers `REFUSED`/`LIVE_LEDGER_READ_ONLY` instead of appending;
 * - behavioural: the fingerprint is recomputed from the real ledgers by the caller, so
 *   `verify()` reports whether the live rows changed while the experiment ran, and a fork write is
 *   reported as `ACCEPTED_IN_COPY` with `appliedToLive: false`.
 *
 * There is no clock, no randomness and no storage access here; the digests are computed by the
 * composition layer from the real read models.
 */

export const EXPERIMENT_LEDGER_ISOLATION_VERSION = '140-experiment-ledger-isolation-v1' as const;

export const experimentLedgerNames = ['LEARNING', 'REWARDS', 'KPI'] as const;
export type ExperimentLedgerName = (typeof experimentLedgerNames)[number];

/** The three live ledgers an experiment must never write, in the documented order. */
export const experimentLedgerFingerprintFields = ['learning', 'rewards', 'kpi'] as const;
export type ExperimentLedgerFingerprintField = (typeof experimentLedgerFingerprintFields)[number];

/**
 * Digest of each live ledger, recomputed by the caller from that ledger's own read model. A
 * fingerprint is only useful if it is derived from the real rows, so the module never caches it.
 */
export interface ExperimentLedgerFingerprint {
  readonly learning: string;
  readonly rewards: string;
  readonly kpi: string;
}

/**
 * The only surface an experiment gets for the live ledgers. It is deliberately read-only: there is
 * no `settle`, `observe`, `ingest` or `append` on this port, so a live write is not expressible.
 */
export interface ExperimentLedgerPort {
  fingerprint(): ExperimentLedgerFingerprint;
}

export const experimentLedgerIsolationCodes = [
  'LIVE_LEDGER_READ_ONLY',
  'EXPERIMENT_LEDGER_MISMATCH',
] as const;
export type ExperimentLedgerIsolationCode = (typeof experimentLedgerIsolationCodes)[number];

export const experimentLedgerInputCodes = ['INVALID_LEDGER_REQUEST'] as const;
export type ExperimentLedgerInputCode = (typeof experimentLedgerInputCodes)[number];

export class ExperimentLedgerError extends Error {
  readonly code: ExperimentLedgerInputCode;

  constructor(code: ExperimentLedgerInputCode, message: string) {
    super(message);
    this.name = 'ExperimentLedgerError';
    this.code = code;
  }
}

/** One row an experiment would like to write. It is only ever stored in a detached copy. */
export interface ExperimentLedgerWriteRow {
  readonly ledger: ExperimentLedgerName;
  readonly rowId: string;
  /** Scalar fact; an experiment cannot smuggle a live object through the boundary. */
  readonly value: Readonly<Record<string, string | number | boolean | null>>;
}

export interface ExperimentLedgerWriteResult {
  readonly status: 'REFUSED' | 'ACCEPTED_IN_COPY';
  readonly code: ExperimentLedgerIsolationCode | null;
  readonly ledger: ExperimentLedgerName;
  readonly rowId: string;
  /** A write never reaches the live ledger, whichever path was used. */
  readonly appliedToLive: false;
  readonly copyRows: number;
  readonly detail: string;
}

export interface ExperimentLedgerFork {
  readonly ledger: ExperimentLedgerName;
  readonly rows: readonly ExperimentLedgerWriteRow[];
  write(row: ExperimentLedgerWriteRow): ExperimentLedgerWriteResult;
}

export interface ExperimentLedgerVerification {
  readonly before: ExperimentLedgerFingerprint;
  readonly after: ExperimentLedgerFingerprint;
  readonly unchanged: boolean;
  readonly changedLedgers: readonly ExperimentLedgerName[];
  readonly liveWrites: 0;
  readonly refusedWrites: number;
  readonly copyWrites: number;
  readonly forks: number;
}

export interface ExperimentLedgerIsolation {
  readonly version: typeof EXPERIMENT_LEDGER_ISOLATION_VERSION;
  /** Declared, not inferred: the experiment handle has no live mutator. */
  readonly structuralIsolation: true;
  fingerprint(): ExperimentLedgerFingerprint;
  fork(ledger: ExperimentLedgerName): ExperimentLedgerFork;
  /** A direct write attempt is refused, never redirected to the ledgers. */
  write(row: ExperimentLedgerWriteRow): ExperimentLedgerWriteResult;
  /** Recomputed from the live ledgers: did anything change while the experiment ran? */
  verify(): ExperimentLedgerVerification;
}

const fingerprintFieldByLedger: Readonly<
  Record<ExperimentLedgerName, ExperimentLedgerFingerprintField>
> = Object.freeze({
  LEARNING: 'learning' as const,
  REWARDS: 'rewards' as const,
  KPI: 'kpi' as const,
});

function ledgerOfField(field: ExperimentLedgerFingerprintField): ExperimentLedgerName {
  if (field === 'learning') return 'LEARNING';
  if (field === 'rewards') return 'REWARDS';
  return 'KPI';
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireLedgerName(value: unknown): ExperimentLedgerName {
  if (typeof value !== 'string' || !(experimentLedgerNames as readonly string[]).includes(value)) {
    throw new ExperimentLedgerError(
      'INVALID_LEDGER_REQUEST',
      `Expected one of ${experimentLedgerNames.join(', ')}`,
    );
  }
  return value as ExperimentLedgerName;
}

function requireFingerprint(value: unknown): ExperimentLedgerFingerprint {
  if (!isPlainRecord(value)) {
    throw new ExperimentLedgerError(
      'INVALID_LEDGER_REQUEST',
      'The ledger port must return a plain fingerprint object',
    );
  }
  const fingerprint: Record<ExperimentLedgerFingerprintField, string> = {
    learning: '',
    rewards: '',
    kpi: '',
  };
  for (const field of experimentLedgerFingerprintFields) {
    const digest = value[field];
    if (typeof digest !== 'string' || digest.length === 0) {
      throw new ExperimentLedgerError(
        'INVALID_LEDGER_REQUEST',
        `The ${field} ledger fingerprint is missing`,
      );
    }
    fingerprint[field] = digest;
  }
  return Object.freeze(fingerprint);
}

function requireRow(value: unknown): ExperimentLedgerWriteRow {
  if (!isPlainRecord(value)) {
    throw new ExperimentLedgerError('INVALID_LEDGER_REQUEST', 'Expected a ledger write row');
  }
  const ledger = requireLedgerName(value.ledger);
  const rowId = value.rowId;
  if (typeof rowId !== 'string' || rowId.length === 0 || rowId.trim() !== rowId) {
    throw new ExperimentLedgerError(
      'INVALID_LEDGER_REQUEST',
      'Expected a non-empty, unpadded rowId',
    );
  }
  if (!isPlainRecord(value.value)) {
    throw new ExperimentLedgerError('INVALID_LEDGER_REQUEST', 'Expected a plain row value');
  }
  const fact: Record<string, string | number | boolean | null> = {};
  const keys = Object.keys(value.value);
  if (keys.length === 0) {
    throw new ExperimentLedgerError('INVALID_LEDGER_REQUEST', 'A row needs at least one fact');
  }
  for (const key of keys) {
    const entry = value.value[key];
    const scalar =
      entry === null ||
      typeof entry === 'string' ||
      typeof entry === 'boolean' ||
      (typeof entry === 'number' && Number.isFinite(entry));
    if (!scalar) {
      throw new ExperimentLedgerError(
        'INVALID_LEDGER_REQUEST',
        `Row fact ${key} is not a scalar value`,
      );
    }
    fact[key] = entry;
  }
  return Object.freeze({ ledger, rowId, value: Object.freeze(fact) });
}

function refused(row: ExperimentLedgerWriteRow, detail: string): ExperimentLedgerWriteResult {
  return Object.freeze({
    status: 'REFUSED' as const,
    code: 'LIVE_LEDGER_READ_ONLY' as const,
    ledger: row.ledger,
    rowId: row.rowId,
    appliedToLive: false as const,
    copyRows: 0,
    detail,
  });
}

/**
 * Builds the experiment's view of the live ledgers. `before` is read once, from the real ledgers,
 * before the experiment touches anything; `verify()` re-reads them and names every ledger whose
 * digest moved.
 */
export function createExperimentLedgerIsolation(
  port: ExperimentLedgerPort,
): ExperimentLedgerIsolation {
  if (typeof port !== 'object' || port === null || typeof port.fingerprint !== 'function') {
    throw new ExperimentLedgerError(
      'INVALID_LEDGER_REQUEST',
      'The isolation requires a ledger port with a fingerprint',
    );
  }
  const before = requireFingerprint(port.fingerprint());
  let refusedWrites = 0;
  let copyWrites = 0;
  let forks = 0;

  function fingerprint(): ExperimentLedgerFingerprint {
    return requireFingerprint(port.fingerprint());
  }

  function write(row: ExperimentLedgerWriteRow): ExperimentLedgerWriteResult {
    const valid = requireRow(row);
    refusedWrites += 1;
    return refused(
      valid,
      'The live ledger is read-only for an experiment; write into a fork to change a copy',
    );
  }

  function fork(ledger: ExperimentLedgerName): ExperimentLedgerFork {
    const name = requireLedgerName(ledger);
    forks += 1;
    const rows: ExperimentLedgerWriteRow[] = [];
    return Object.freeze({
      ledger: name,
      get rows(): readonly ExperimentLedgerWriteRow[] {
        return Object.freeze([...rows]);
      },
      write(row: ExperimentLedgerWriteRow): ExperimentLedgerWriteResult {
        const valid = requireRow(row);
        if (valid.ledger !== name) {
          refusedWrites += 1;
          return Object.freeze({
            status: 'REFUSED' as const,
            code: 'EXPERIMENT_LEDGER_MISMATCH' as const,
            ledger: valid.ledger,
            rowId: valid.rowId,
            appliedToLive: false as const,
            copyRows: rows.length,
            detail: `The ${name} fork only accepts ${name} rows`,
          });
        }
        rows.push(valid);
        copyWrites += 1;
        return Object.freeze({
          status: 'ACCEPTED_IN_COPY' as const,
          code: null,
          ledger: name,
          rowId: valid.rowId,
          appliedToLive: false as const,
          copyRows: rows.length,
          detail: 'The row was appended to the detached copy; the live ledger was not touched',
        });
      },
    });
  }

  function verify(): ExperimentLedgerVerification {
    const after = requireFingerprint(port.fingerprint());
    const changedLedgers: ExperimentLedgerName[] = [];
    for (const field of experimentLedgerFingerprintFields) {
      if (before[field] !== after[field]) changedLedgers.push(ledgerOfField(field));
    }
    return Object.freeze({
      before: Object.freeze({ ...before }),
      after: Object.freeze({ ...after }),
      unchanged: changedLedgers.length === 0,
      changedLedgers: Object.freeze(changedLedgers),
      liveWrites: 0 as const,
      refusedWrites,
      copyWrites,
      forks,
    });
  }

  return Object.freeze({
    version: EXPERIMENT_LEDGER_ISOLATION_VERSION,
    structuralIsolation: true as const,
    fingerprint,
    fork,
    write,
    verify,
  });
}

/** Maps a ledger name to its fingerprint field; exposed so evidence can label each digest. */
export function experimentLedgerFingerprintField(
  ledger: ExperimentLedgerName,
): ExperimentLedgerFingerprintField {
  return fingerprintFieldByLedger[requireLedgerName(ledger)];
}

import type {
  ExperimentLedgerFingerprint,
  ExperimentLedgerPort,
} from './experiment-ledger-isolation';

/**
 * 140 complete experiment snapshot.
 *
 * The experiment does not own a snapshot format. It consumes the complete world checkpoint of
 * 206 (`SDA-CJSON-1` canonical form + `SHA-256` + engine/physics/map versions) through a small
 * port, so the same document that a reload uses is the document an experiment starts from.
 *
 * The contract adds only what an experiment needs on top of 206:
 *
 * 1. the snapshot is validated and loaded at the *same* tick, with no advance and no jump;
 * 2. the roundtrip is compared state for state — every leaf field of every section, not only the
 *    checksum — and the number of compared entities and fields is reported;
 * 3. engine/physics/map compatibility is refused explicitly, per field, with a closed code;
 * 4. the live ledgers are isolated: the experiment observes a fingerprint and may only write into
 *    a detached copy (see `experiment-ledger-isolation.ts`).
 *
 * The module is pure: it has no clock, no randomness, no renderer and no storage. The actual 206
 * functions are injected as ports by the composition layer, which keeps the domain module free of
 * adapter imports.
 */

export const EXPERIMENT_SNAPSHOT_VERSION = '140-experiment-snapshot-v1' as const;

/** The integrity contract this module reuses; 206 owns the implementation. */
export const EXPERIMENT_SNAPSHOT_INTEGRITY = Object.freeze({
  canonicalization: 'SDA-CJSON-1' as const,
  algorithm: 'SHA-256' as const,
});

/**
 * The payload sections of the 206 snapshot, in the documented order. 140 does not own this shape:
 * it is the section list the roundtrip compares, and the report/test pin it against a real 206
 * capture so a change in 206 cannot pass silently.
 */
export const experimentSnapshotSections = [
  'snapshotVersion',
  'units',
  'tick',
  'worldEpoch',
  'profile',
  'vehicles',
  'controllers',
  'rides',
  'passengers',
  'segments',
  'opportunities',
  'signals',
  'dispatch',
  'learning',
  'rng',
  'dedup',
] as const;
export type ExperimentSnapshotSection = (typeof experimentSnapshotSections)[number];

export const experimentSnapshotStages = [
  'CAPTURE',
  'READ',
  'COMPATIBILITY',
  'LOAD',
  'TICK',
  'ROUNDTRIP',
  'LEDGER',
] as const;
export type ExperimentSnapshotStage = (typeof experimentSnapshotStages)[number];

export const experimentSnapshotRejectionCodes = [
  /** The world could not be captured at a tick boundary. */
  'CAPTURE_REJECTED',
  /** The stored snapshot failed 206 validation for a reason other than its checksum. */
  'SNAPSHOT_INVALID',
  /** The stored snapshot does not match its own `SHA-256`. */
  'CHECKSUM_MISMATCH',
  /** The snapshot was taken at a different tick than the experiment start. */
  'TICK_MISMATCH',
  /** The snapshot was produced by another engine build. */
  'ENGINE_VERSION_MISMATCH',
  /** The snapshot was produced by another physics backend build. */
  'PHYSICS_BACKEND_MISMATCH',
  /** The snapshot was produced on another map. */
  'MAP_VERSION_MISMATCH',
  /** The stored state and the restored state disagree on at least one field. */
  'ROUNDTRIP_FIELD_MISMATCH',
  /** A live ledger changed while the experiment ran. */
  'LEDGER_CHANGED',
] as const;
export type ExperimentSnapshotRejectionCode = (typeof experimentSnapshotRejectionCodes)[number];

export const experimentSnapshotInputCodes = [
  'INVALID_REQUEST',
  'SNAPSHOT_PAYLOAD_INVALID',
] as const;
export type ExperimentSnapshotInputCode = (typeof experimentSnapshotInputCodes)[number];

export class ExperimentSnapshotError extends Error {
  readonly code: ExperimentSnapshotInputCode;
  readonly path: string;

  constructor(code: ExperimentSnapshotInputCode, message: string, path: string) {
    super(message);
    this.name = 'ExperimentSnapshotError';
    this.code = code;
    this.path = path;
  }
}

export interface ExperimentVersions {
  readonly engineVersion: string;
  readonly physicsVersion: string;
  readonly mapVersion: string;
}

/* ------------------------------------------------------------------- ports */

export interface ExperimentSnapshotCaptureAccepted {
  readonly status: 'CAPTURED';
  /** The 206 snapshot body: the validated, frozen payload plus its checksum. */
  readonly body: unknown;
  readonly checksum: string;
  readonly bytes: number;
}

export interface ExperimentSnapshotCaptureRejected {
  readonly status: 'REJECTED';
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export type ExperimentSnapshotCaptureOutcome =
  ExperimentSnapshotCaptureAccepted | ExperimentSnapshotCaptureRejected;

export interface ExperimentSnapshotReadAccepted {
  readonly status: 'ACCEPTED';
  readonly body: unknown;
  readonly checksum: string;
  readonly bytes: number;
}

export interface ExperimentSnapshotReadRejected {
  readonly status: 'REJECTED';
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export type ExperimentSnapshotReadOutcome =
  ExperimentSnapshotReadAccepted | ExperimentSnapshotReadRejected;

export interface ExperimentSnapshotDecodeAccepted {
  readonly status: 'ACCEPTED';
  readonly tick: number;
  /** Restored 206 state; the experiment's starting world. */
  readonly state: unknown;
  /** The 206 resume plan (`206-world-resume-v1`). */
  readonly resume: unknown;
}

export interface ExperimentSnapshotDecodeIncompatible {
  readonly status: 'INCOMPATIBLE';
  readonly stored: ExperimentVersions;
  readonly current: ExperimentVersions;
  readonly detail: string;
}

export interface ExperimentSnapshotDecodeRejected {
  readonly status: 'REJECTED';
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export type ExperimentSnapshotDecodeOutcome =
  | ExperimentSnapshotDecodeAccepted
  | ExperimentSnapshotDecodeIncompatible
  | ExperimentSnapshotDecodeRejected;

/**
 * The real 206 contract, injected. `capture` is `captureWorldSnapshot`, `read` is
 * `readWorldSnapshot` and `decode` is `decodeWorldCheckpoint`; nothing here re-implements them.
 */
export interface ExperimentSnapshotPorts {
  readonly capture: (input: unknown) => ExperimentSnapshotCaptureOutcome;
  readonly read: (body: unknown) => ExperimentSnapshotReadOutcome;
  readonly decode: (
    checkpoint: unknown,
    versions: ExperimentVersions,
  ) => ExperimentSnapshotDecodeOutcome;
}

/* ----------------------------------------------------------------- request */

/**
 * The identity an experiment snapshot is stored under. Together with the body and the versions it
 * is exactly the 129/206 checkpoint envelope (`CheckpointRecord`), so no second envelope exists.
 */
export interface ExperimentSnapshotEnvelopeIdentity {
  readonly checkpointId: string;
  readonly sessionId: string;
  readonly generation: number;
  readonly createdAt: string;
}

export interface ExperimentSnapshotRequest {
  readonly experimentId: string;
  /** The tick the experiment must continue from. A different snapshot tick is refused. */
  readonly expectedTick: number;
  /** The complete 206 capture input, read at a tick boundary by the caller. */
  readonly captureInput: unknown;
  readonly envelope: ExperimentSnapshotEnvelopeIdentity;
  /**
   * Versions recorded in the snapshot envelope. Injectable so the refusal probes can present a
   * snapshot written by another engine, physics backend or map.
   */
  readonly storedVersions: ExperimentVersions;
  /** Versions of the running build. */
  readonly currentVersions: ExperimentVersions;
  /** Live ledgers, reachable read-only. */
  readonly ledger: ExperimentLedgerPort;
}

/* ------------------------------------------------------------------ result */

export interface ExperimentSectionComparison {
  readonly section: ExperimentSnapshotSection;
  /** Vehicles, controllers, rides… for an array; `pending + acceptedResults` for the dispatcher. */
  readonly entities: number;
  /** Leaf fields compared in this section, including empty lists as one field. */
  readonly fields: number;
}

export interface ExperimentFieldMismatch {
  readonly path: string;
  readonly stored: string | number | boolean | null;
  readonly restored: string | number | boolean | null;
}

export interface ExperimentLedgerCheck {
  readonly before: ExperimentLedgerFingerprint;
  readonly after: ExperimentLedgerFingerprint;
  readonly unchanged: boolean;
  readonly liveWrites: 0;
}

export interface ExperimentSnapshotLoaded {
  readonly status: 'LOADED';
  readonly version: typeof EXPERIMENT_SNAPSHOT_VERSION;
  readonly experimentId: string;
  /** The tick restored from the snapshot; equal to `expectedTick` or the load is refused. */
  readonly tick: number;
  readonly expectedTick: number;
  /** The load neither advances nor rewinds the fixed-tick loop. */
  readonly ticksAdvanced: 0;
  readonly checksum: string;
  readonly bytes: number;
  readonly versions: Readonly<{
    stored: ExperimentVersions;
    current: ExperimentVersions;
  }>;
  readonly sections: readonly ExperimentSectionComparison[];
  readonly entities: number;
  readonly fields: number;
  /** Empty on success; a single differing leaf is enough to refuse the load. */
  readonly mismatches: readonly ExperimentFieldMismatch[];
  /** The restored 206 state the experiment continues from (no checksum field). */
  readonly state: unknown;
  readonly resume: unknown;
  readonly ledger: ExperimentLedgerCheck;
}

export interface ExperimentSnapshotRefused {
  readonly status: 'REFUSED';
  readonly version: typeof EXPERIMENT_SNAPSHOT_VERSION;
  readonly experimentId: string;
  readonly stage: ExperimentSnapshotStage;
  readonly codes: readonly ExperimentSnapshotRejectionCode[];
  readonly detail: string;
  readonly ledger: ExperimentLedgerCheck;
}

export type ExperimentSnapshotResult = ExperimentSnapshotLoaded | ExperimentSnapshotRefused;

/* --------------------------------------------------------------- internals */

/** Marker for an empty array, so an empty list is compared as a field instead of vanishing. */
const EMPTY_LIST: unique symbol = Symbol('140-empty-list');
type LeafValue = string | number | boolean | null | typeof EMPTY_LIST;

interface SnapshotView {
  readonly tick: number;
  readonly worldEpoch: number;
  readonly profileId: string;
  readonly learningEpoch: number;
}

interface Comparison {
  readonly sections: readonly ExperimentSectionComparison[];
  readonly entities: number;
  readonly fields: number;
  readonly mismatches: readonly ExperimentFieldMismatch[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function boundedText(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new ExperimentSnapshotError('INVALID_REQUEST', 'Expected bounded text', path);
  }
  return value;
}

function nonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new ExperimentSnapshotError(
      'INVALID_REQUEST',
      'Expected a nonnegative safe integer',
      path,
    );
  }
  return value;
}

function requireVersions(value: ExperimentVersions, path: string): ExperimentVersions {
  if (!isPlainRecord(value)) {
    throw new ExperimentSnapshotError('INVALID_REQUEST', 'Expected plain versions', path);
  }
  return Object.freeze({
    engineVersion: boundedText(value.engineVersion, `${path}.engineVersion`),
    physicsVersion: boundedText(value.physicsVersion, `${path}.physicsVersion`),
    mapVersion: boundedText(value.mapVersion, `${path}.mapVersion`),
  });
}

function requireRequest(request: ExperimentSnapshotRequest): ExperimentSnapshotRequest {
  if (!isPlainRecord(request)) {
    throw new ExperimentSnapshotError('INVALID_REQUEST', 'Expected a request object', 'request');
  }
  const envelope = request.envelope;
  if (!isPlainRecord(envelope)) {
    throw new ExperimentSnapshotError(
      'INVALID_REQUEST',
      'Expected an envelope',
      'request.envelope',
    );
  }
  return Object.freeze({
    experimentId: boundedText(request.experimentId, 'request.experimentId'),
    expectedTick: nonNegativeInteger(request.expectedTick, 'request.expectedTick'),
    captureInput: request.captureInput,
    envelope: Object.freeze({
      checkpointId: boundedText(envelope.checkpointId, 'request.envelope.checkpointId'),
      sessionId: boundedText(envelope.sessionId, 'request.envelope.sessionId'),
      generation: nonNegativeInteger(envelope.generation, 'request.envelope.generation'),
      createdAt: boundedText(envelope.createdAt, 'request.envelope.createdAt'),
    }),
    storedVersions: requireVersions(request.storedVersions, 'request.storedVersions'),
    currentVersions: requireVersions(request.currentVersions, 'request.currentVersions'),
    ledger: request.ledger,
  });
}

function readView(body: unknown): SnapshotView | null {
  if (!isPlainRecord(body)) return null;
  const profile = body.profile;
  const learning = body.learning;
  if (!isPlainRecord(profile) || !isPlainRecord(learning)) return null;
  const tick = body.tick;
  const worldEpoch = body.worldEpoch;
  const profileId = profile.profileId;
  const learningEpoch = learning.learningEpoch;
  if (
    typeof tick !== 'number' ||
    !Number.isSafeInteger(tick) ||
    tick < 0 ||
    typeof worldEpoch !== 'number' ||
    !Number.isSafeInteger(worldEpoch) ||
    worldEpoch < 0 ||
    typeof profileId !== 'string' ||
    profileId.length === 0 ||
    typeof learningEpoch !== 'number' ||
    !Number.isSafeInteger(learningEpoch) ||
    learningEpoch < 0
  ) {
    return null;
  }
  return Object.freeze({ tick, worldEpoch, profileId, learningEpoch });
}

function sectionValue(body: unknown, section: ExperimentSnapshotSection): unknown {
  if (!isPlainRecord(body)) return undefined;
  return body[section];
}

function missingSections(body: unknown): readonly ExperimentSnapshotSection[] {
  if (!isPlainRecord(body)) return experimentSnapshotSections;
  return experimentSnapshotSections.filter((section) => !Object.hasOwn(body, section));
}

/** Ordered leaf map of one section; objects and arrays are flattened, empty lists stay a field. */
function flatten(value: unknown, path: string, into: Map<string, LeafValue>): void {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      into.set(path, EMPTY_LIST);
      return;
    }
    for (let index = 0; index < value.length; index += 1) {
      flatten(value[index], `${path}[${index}]`, into);
    }
    return;
  }
  if (isPlainRecord(value)) {
    const keys = Object.keys(value).sort();
    if (keys.length === 0) {
      into.set(path, null);
      return;
    }
    for (const key of keys) flatten(value[key], `${path}.${key}`, into);
    return;
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    into.set(path, value);
    return;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    into.set(path, value);
    return;
  }
  // 206 never stores anything else; treat an unexpected shape as a named, incomparable field.
  into.set(path, null);
}

function renderLeaf(value: LeafValue | undefined): string | number | boolean | null {
  if (value === EMPTY_LIST) return '[]';
  if (value === undefined) return null;
  return value;
}

function requireFingerprint(value: unknown, path: string): ExperimentLedgerFingerprint {
  if (!isPlainRecord(value)) {
    throw new ExperimentSnapshotError('INVALID_REQUEST', 'Expected a ledger fingerprint', path);
  }
  const read = (field: 'learning' | 'rewards' | 'kpi'): string => {
    const digest = value[field];
    if (typeof digest !== 'string' || digest.length === 0) {
      throw new ExperimentSnapshotError(
        'INVALID_REQUEST',
        `The ${field} ledger fingerprint is missing`,
        `${path}.${field}`,
      );
    }
    return digest;
  };
  return Object.freeze({
    learning: read('learning'),
    rewards: read('rewards'),
    kpi: read('kpi'),
  });
}

function entityCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (isPlainRecord(value)) {
    const pending = value.pending;
    const accepted = value.acceptedResults;
    if (Array.isArray(pending) && Array.isArray(accepted)) return pending.length + accepted.length;
    return 1;
  }
  return value === undefined ? 0 : 1;
}

/**
 * Compares two states section by section, leaf by leaf. This is the "before/after" check: the
 * checksum only says the bytes are the same, this says every position, rotation, velocity, FSM,
 * controller memory entry, opportunity, signal, dispatcher row, passenger and RNG cursor is.
 */
export function compareExperimentSnapshotState(stored: unknown, restored: unknown): Comparison {
  const sections: ExperimentSectionComparison[] = [];
  const mismatches: ExperimentFieldMismatch[] = [];
  let entities = 0;
  let fields = 0;
  for (const section of experimentSnapshotSections) {
    const left = new Map<string, LeafValue>();
    const right = new Map<string, LeafValue>();
    flatten(sectionValue(stored, section), section, left);
    flatten(sectionValue(restored, section), section, right);
    const paths = [...new Set([...left.keys(), ...right.keys()])].sort();
    let sectionFields = 0;
    for (const path of paths) {
      sectionFields += 1;
      const hasLeft = left.has(path);
      const hasRight = right.has(path);
      const leftValue = left.get(path);
      const rightValue = right.get(path);
      if (!hasLeft || !hasRight || leftValue !== rightValue) {
        mismatches.push(
          Object.freeze({
            path,
            stored: renderLeaf(leftValue),
            restored: renderLeaf(rightValue),
          }),
        );
      }
    }
    const sectionEntities = entityCount(sectionValue(stored, section));
    sections.push(Object.freeze({ section, entities: sectionEntities, fields: sectionFields }));
    entities += sectionEntities;
    fields += sectionFields;
  }
  return Object.freeze({
    sections: Object.freeze(sections),
    entities,
    fields,
    mismatches: Object.freeze(mismatches),
  });
}

/**
 * The documented compatibility rule, per field and with a closed code. `stored` is what the
 * snapshot envelope recorded, `current` is the running build; a single difference refuses the
 * load instead of continuing a world written by another engine, physics backend or map.
 */
export function experimentCompatibilityCodes(
  stored: ExperimentVersions,
  current: ExperimentVersions,
): readonly ExperimentSnapshotRejectionCode[] {
  const codes: ExperimentSnapshotRejectionCode[] = [];
  if (stored.engineVersion !== current.engineVersion) codes.push('ENGINE_VERSION_MISMATCH');
  if (stored.physicsVersion !== current.physicsVersion) codes.push('PHYSICS_BACKEND_MISMATCH');
  if (stored.mapVersion !== current.mapVersion) codes.push('MAP_VERSION_MISMATCH');
  return Object.freeze(codes);
}

function sectionSummary(comparison: Comparison): readonly ExperimentSectionComparison[] {
  return comparison.sections;
}

function ledgerCheck(
  request: ExperimentSnapshotRequest,
  before: ExperimentLedgerFingerprint,
): ExperimentLedgerCheck {
  const after = requireFingerprint(request.ledger.fingerprint(), 'ledger.fingerprint');
  return Object.freeze({
    before: Object.freeze({ ...before }),
    after: Object.freeze({ ...after }),
    unchanged:
      before.learning === after.learning &&
      before.rewards === after.rewards &&
      before.kpi === after.kpi,
    liveWrites: 0 as const,
  });
}

/**
 * Validates, loads and verifies one complete experiment snapshot.
 *
 * The order is the documented one: capture at the boundary, verify the stored checksum, refuse a
 * snapshot from another tick, compare the stored state with the restored state field by field,
 * refuse an incompatible engine/physics/map, and finally confirm that the live ledgers still have
 * the same fingerprint. Nothing is written: the experiment gets the restored state and the 206
 * resume plan.
 */
export function runExperimentSnapshot(
  request: ExperimentSnapshotRequest,
  ports: ExperimentSnapshotPorts,
): ExperimentSnapshotResult {
  const valid = requireRequest(request);
  const before = requireFingerprint(valid.ledger.fingerprint(), 'ledger.fingerprint');
  const refusal = (
    stage: ExperimentSnapshotStage,
    codes: readonly ExperimentSnapshotRejectionCode[],
    detail: string,
  ): ExperimentSnapshotRefused =>
    Object.freeze({
      status: 'REFUSED' as const,
      version: EXPERIMENT_SNAPSHOT_VERSION,
      experimentId: valid.experimentId,
      stage,
      codes: Object.freeze([...codes]),
      detail,
      ledger: ledgerCheck(valid, before),
    });

  const captured = ports.capture(valid.captureInput);
  if (captured.status === 'REJECTED') {
    return refusal(
      'CAPTURE',
      ['CAPTURE_REJECTED'],
      `${captured.code}: ${captured.message} (${captured.path})`,
    );
  }

  const read = ports.read(captured.body);
  if (read.status === 'REJECTED') {
    const code: ExperimentSnapshotRejectionCode =
      read.code === 'CHECKSUM_MISMATCH' ? 'CHECKSUM_MISMATCH' : 'SNAPSHOT_INVALID';
    return refusal('READ', [code], `${read.code}: ${read.message} (${read.path})`);
  }

  const view = readView(read.body);
  if (view === null) {
    return refusal(
      'READ',
      ['SNAPSHOT_INVALID'],
      'The stored snapshot has no readable tick/profile',
    );
  }
  const missing = missingSections(read.body);
  if (missing.length > 0) {
    return refusal('READ', ['SNAPSHOT_INVALID'], `Missing sections: ${missing.join(', ')}`);
  }
  if (captured.checksum !== read.checksum) {
    return refusal(
      'READ',
      ['CHECKSUM_MISMATCH'],
      `The capture reported ${captured.checksum}, the readback reported ${read.checksum}`,
    );
  }
  if (view.tick !== valid.expectedTick) {
    return refusal(
      'TICK',
      ['TICK_MISMATCH'],
      `The snapshot is at tick ${view.tick}, the experiment starts at ${valid.expectedTick}`,
    );
  }

  const stored = compareExperimentSnapshotState(captured.body, read.body);
  if (stored.mismatches.length > 0) {
    return refusal(
      'ROUNDTRIP',
      ['ROUNDTRIP_FIELD_MISMATCH'],
      `${stored.mismatches.length} stored fields differ after readback, first ${stored.mismatches[0]?.path}`,
    );
  }

  const envelope = Object.freeze({
    schemaVersion: 1 as const,
    checkpointId: valid.envelope.checkpointId,
    sessionId: valid.envelope.sessionId,
    profileId: view.profileId,
    worldEpoch: view.worldEpoch,
    tick: view.tick,
    generation: valid.envelope.generation,
    learningEpoch: view.learningEpoch,
    engineVersion: valid.storedVersions.engineVersion,
    physicsVersion: valid.storedVersions.physicsVersion,
    mapVersion: valid.storedVersions.mapVersion,
    createdAt: valid.envelope.createdAt,
    bodyBytes: read.bytes,
    body: read.body,
  });

  const decoded = ports.decode(envelope, valid.currentVersions);
  if (decoded.status === 'REJECTED') {
    const code: ExperimentSnapshotRejectionCode =
      decoded.code === 'CHECKSUM_MISMATCH' ? 'CHECKSUM_MISMATCH' : 'SNAPSHOT_INVALID';
    return refusal('LOAD', [code], `${decoded.code}: ${decoded.message} (${decoded.path})`);
  }
  if (decoded.status === 'INCOMPATIBLE') {
    const codes = experimentCompatibilityCodes(decoded.stored, decoded.current);
    return refusal(
      'COMPATIBILITY',
      codes.length > 0 ? codes : ['ENGINE_VERSION_MISMATCH'],
      decoded.detail,
    );
  }

  const compatibility = experimentCompatibilityCodes(valid.storedVersions, valid.currentVersions);
  if (compatibility.length > 0) {
    return refusal(
      'COMPATIBILITY',
      compatibility,
      `stored ${JSON.stringify(valid.storedVersions)} vs current ${JSON.stringify(valid.currentVersions)}`,
    );
  }
  if (decoded.tick !== view.tick || decoded.tick !== valid.expectedTick) {
    return refusal(
      'TICK',
      ['TICK_MISMATCH'],
      `The snapshot is at tick ${view.tick}, the load returned tick ${decoded.tick}`,
    );
  }

  const restored = compareExperimentSnapshotState(read.body, decoded.state);
  if (restored.mismatches.length > 0) {
    const first = restored.mismatches[0];
    return refusal(
      'ROUNDTRIP',
      ['ROUNDTRIP_FIELD_MISMATCH'],
      `${restored.mismatches.length} fields differ after restore, first ${first?.path}`,
    );
  }

  const ledger = ledgerCheck(valid, before);
  if (!ledger.unchanged) {
    return Object.freeze({
      status: 'REFUSED' as const,
      version: EXPERIMENT_SNAPSHOT_VERSION,
      experimentId: valid.experimentId,
      stage: 'LEDGER' as const,
      codes: Object.freeze(['LEDGER_CHANGED' as const]),
      detail: 'A live ledger changed while the experiment snapshot ran',
      ledger,
    });
  }

  return Object.freeze({
    status: 'LOADED' as const,
    version: EXPERIMENT_SNAPSHOT_VERSION,
    experimentId: valid.experimentId,
    tick: decoded.tick,
    expectedTick: valid.expectedTick,
    ticksAdvanced: 0 as const,
    checksum: read.checksum,
    bytes: read.bytes,
    versions: Object.freeze({
      stored: Object.freeze({ ...valid.storedVersions }),
      current: Object.freeze({ ...valid.currentVersions }),
    }),
    sections: sectionSummary(restored),
    entities: restored.entities,
    fields: restored.fields,
    mismatches: restored.mismatches,
    state: decoded.state,
    resume: decoded.resume,
    ledger,
  });
}

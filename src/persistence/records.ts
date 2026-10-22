import { computeProfileVersionChecksum } from '../profiles';
import type { ProfileVersion, ProfileVersionContent, ProfileVersionProvenance } from '../profiles';
import { parseRuntimeSettings } from '../settings';
import type { RuntimeSettings } from '../settings';
import {
  META_SCHEMA_KEY,
  PERSISTENCE_LIMITS,
  PERSISTENCE_FORMAT,
  PersistenceError,
  boundedText,
  isPersistenceRecordKind,
} from './contracts';
import type {
  ActivationRecord,
  CheckpointRecord,
  MetaRecord,
  PersistedRecord,
  PersistenceRecordKind,
  PersistenceReasonCode,
} from './contracts';

/**
 * Record validation at the storage boundary.
 *
 * Nothing reaches a transaction before it is structural, bounded and free of values that a later
 * JSON export could not represent. Validation is deliberately the same on read: a row edited by
 * another build (or by hand) is reported instead of being used as if it were a domain object.
 */
const encoder = new TextEncoder();
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const STATUS_TOKEN = /^[A-Z][A-Z0-9_]*$/;
const RESERVED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const forbidden = (value: unknown) =>
  value === undefined || typeof value === 'function' || typeof value === 'symbol';

function invalid(code: PersistenceReasonCode, message: string, path: string): never {
  throw new PersistenceError(code, message, path);
}

function readObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalid('INVALID_RECORD', 'Expected a plain object', path);
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return invalid('INVALID_RECORD', 'Expected plain data, not a class instance', path);
  }
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') invalid('INVALID_RECORD', 'Symbol fields are unsupported', path);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor) || descriptor.enumerable !== true) {
      invalid('INVALID_RECORD', 'Expected enumerable data fields without accessors', path);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function exactFields(
  value: unknown,
  allowed: readonly string[],
  path: string,
): Record<string, unknown> {
  const data = readObject(value, path);
  for (const key of Object.keys(data)) {
    if (!allowed.includes(key))
      invalid('INVALID_RECORD', `Unknown field: ${key}`, `${path}.${key}`);
  }
  return data;
}

function readTimestamp(value: unknown, path: string): string {
  if (typeof value !== 'string' || !UTC_TIMESTAMP.test(value)) {
    return invalid('INVALID_RECORD', 'Expected a UTC timestamp', path);
  }
  if (!Number.isFinite(Date.parse(value))) {
    return invalid('INVALID_RECORD', 'Expected a valid calendar timestamp', path);
  }
  return value;
}

function readTick(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return invalid('INVALID_RECORD', 'Expected a safe nonnegative integer', path);
  }
  return value;
}

function readCount(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return invalid('INVALID_RECORD', 'Expected a nonnegative counter', path);
  }
  return value;
}

function readId(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > PERSISTENCE_LIMITS.maxIdCodeUnits ||
    value.trim() !== value
  ) {
    return invalid('INVALID_RECORD', 'Expected a bounded identity', path);
  }
  return value;
}

function readText(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > PERSISTENCE_LIMITS.maxTextCodeUnits ||
    value.trim() !== value
  ) {
    return invalid('INVALID_RECORD', 'Expected bounded text', path);
  }
  return value;
}

interface JsonContext {
  entries: number;
  readonly parts: string[];
}

function jsonScalar(value: unknown, path: string): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid('BODY_INVALID', 'Numbers must be finite', path);
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'bigint' || typeof value === 'object') {
    return invalid('BODY_INVALID', 'Unsupported value inside persisted data', path);
  }
  return invalid('BODY_INVALID', 'Persisted data must be JSON', path);
}

function jsonValue(value: unknown, path: string, depth: number, context: JsonContext): string {
  if (depth > PERSISTENCE_LIMITS.maxBodyDepth) {
    invalid('BODY_INVALID', 'Persisted data is nested too deeply', path);
  }
  context.entries += 1;
  if (context.entries > PERSISTENCE_LIMITS.maxBodyEntries) {
    invalid('BODY_INVALID', 'Persisted data has too many entries', path);
  }
  if (forbidden(value)) invalid('BODY_INVALID', 'Persisted data must be JSON', path);
  if (Array.isArray(value)) {
    const items: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !('value' in descriptor)) {
        invalid('BODY_INVALID', 'Sparse arrays are unsupported', `${path}[${index}]`);
      }
      items.push(jsonValue(descriptor.value, `${path}[${index}]`, depth + 1, context));
    }
    return `[${items.join(',')}]`;
  }
  if (value === null || typeof value !== 'object') return jsonScalar(value, path);
  const data = readObject(value, path);
  const keys = Object.keys(data).sort();
  const members: string[] = [];
  for (const key of keys) {
    if (RESERVED_KEYS.has(key)) {
      invalid('BODY_INVALID', `Reserved key is not persisted: ${key}`, `${path}.${key}`);
    }
    members.push(
      `${JSON.stringify(key)}:${jsonValue(data[key], `${path}.${key}`, depth + 1, context)}`,
    );
  }
  return `{${members.join(',')}}`;
}

/**
 * Canonical (sorted-key) UTF-8 size of plain JSON data.
 *
 * 234 owns the export canonicalization (`SDA-CJSON-1`); this measurement only enforces the local
 * storage budget and stays stable across key insertion order, so the same record always reports
 * the same size.
 */
export function measureJsonBytes(value: unknown, path = 'body'): number {
  const text = jsonValue(value, path, 0, { entries: 0, parts: [] });
  return encoder.encode(text).length;
}

function boundedBody(
  value: unknown,
  path: string,
  maximum: number = PERSISTENCE_LIMITS.maxBodyBytes,
): { readonly body: Readonly<Record<string, unknown>>; readonly bodyBytes: number } {
  const data = readObject(value, path);
  const keys = Object.keys(data);
  if (keys.length === 0) {
    invalid('BODY_INVALID', 'A persisted body needs at least one field', path);
  }
  const bodyBytes = measureJsonBytes(data, path);
  if (bodyBytes > maximum) {
    invalid('BODY_TOO_LARGE', `Persisted body exceeds ${maximum} bytes`, path);
  }
  // Reserved keys are already rejected, so a plain object is safe and nicer for consumers.
  const body: Record<string, unknown> = {};
  for (const key of keys) body[key] = data[key];
  return { body: Object.freeze(body), bodyBytes };
}

function checkDeclaredBytes(value: unknown, measured: number, path: string): void {
  if (value === undefined) return;
  if (typeof value !== 'number' || value !== measured) {
    invalid(
      'BODY_INVALID',
      'Declared bodyBytes do not match the measured body',
      `${path}.bodyBytes`,
    );
  }
}

function readStatus(value: unknown, kind: PersistenceRecordKind, path: string): string | null {
  const allowed: Readonly<Record<PersistenceRecordKind, readonly string[]>> = {
    SEGMENT: ['OPEN', 'CLOSED', 'INCOMPLETE'],
    PROGRESS: ['ACTIVE', 'COMPLETED', 'FAILED'],
    SCENARIO: [],
  };
  if (kind === 'SCENARIO') {
    if (value !== null)
      invalid('INVALID_RECORD', 'Scenario records have no lifecycle status', path);
    return null;
  }
  if (
    typeof value !== 'string' ||
    value.length > PERSISTENCE_LIMITS.maxTagCodeUnits ||
    !STATUS_TOKEN.test(value) ||
    !allowed[kind].includes(value)
  ) {
    return invalid('INVALID_RECORD', `Unsupported ${kind} status`, path);
  }
  return value;
}

const persistedRecordFields = [
  'schemaVersion',
  'recordKind',
  'recordId',
  'sessionId',
  'worldEpoch',
  'status',
  'revision',
  'createdAt',
  'body',
  'bodyBytes',
] as const;

export function parsePersistedRecord(
  value: unknown,
  expected: PersistenceRecordKind,
): PersistedRecord {
  const data = exactFields(value, persistedRecordFields, 'record');
  if (data.schemaVersion !== 1) invalid('INVALID_RECORD', 'Unsupported record schema', 'record');
  if (!isPersistenceRecordKind(data.recordKind) || data.recordKind !== expected) {
    invalid('INVALID_RECORD', `Expected a ${expected} record`, 'record.recordKind');
  }
  const measured = boundedBody(data.body, 'record.body');
  checkDeclaredBytes(data.bodyBytes, measured.bodyBytes, 'record');
  return Object.freeze({
    schemaVersion: 1 as const,
    recordKind: expected,
    recordId: readId(data.recordId, 'record.recordId'),
    sessionId: readId(data.sessionId, 'record.sessionId'),
    worldEpoch: readTick(data.worldEpoch, 'record.worldEpoch'),
    status: readStatus(data.status, expected, 'record.status'),
    revision: readCount(data.revision, 'record.revision'),
    createdAt: readTimestamp(data.createdAt, 'record.createdAt'),
    bodyBytes: measured.bodyBytes,
    body: measured.body,
  });
}

const checkpointFields = [
  'schemaVersion',
  'checkpointId',
  'sessionId',
  'profileId',
  'worldEpoch',
  'tick',
  'generation',
  'learningEpoch',
  'engineVersion',
  'physicsVersion',
  'mapVersion',
  'createdAt',
  'body',
  'bodyBytes',
] as const;

export function parseCheckpointRecord(value: unknown): CheckpointRecord {
  const data = exactFields(value, checkpointFields, 'checkpoint');
  if (data.schemaVersion !== 1)
    invalid('INVALID_RECORD', 'Unsupported checkpoint schema', 'checkpoint');
  const measured = boundedBody(data.body, 'checkpoint.body');
  checkDeclaredBytes(data.bodyBytes, measured.bodyBytes, 'checkpoint');
  const record: CheckpointRecord = Object.freeze({
    schemaVersion: 1 as const,
    checkpointId: readId(data.checkpointId, 'checkpoint.checkpointId'),
    sessionId: readId(data.sessionId, 'checkpoint.sessionId'),
    profileId: readId(data.profileId, 'checkpoint.profileId'),
    worldEpoch: readTick(data.worldEpoch, 'checkpoint.worldEpoch'),
    tick: readTick(data.tick, 'checkpoint.tick'),
    generation: readCount(data.generation, 'checkpoint.generation'),
    learningEpoch: readCount(data.learningEpoch, 'checkpoint.learningEpoch'),
    engineVersion: readText(data.engineVersion, 'checkpoint.engineVersion'),
    physicsVersion: readText(data.physicsVersion, 'checkpoint.physicsVersion'),
    mapVersion: readText(data.mapVersion, 'checkpoint.mapVersion'),
    createdAt: readTimestamp(data.createdAt, 'checkpoint.createdAt'),
    bodyBytes: measured.bodyBytes,
    body: measured.body,
  });
  return record;
}

const activationFields = [
  'schemaVersion',
  'playerId',
  'profileId',
  'versionId',
  'sequence',
  'activatedAt',
] as const;

export function parseActivationRecord(value: unknown): ActivationRecord {
  const data = exactFields(value, activationFields, 'activation');
  if (data.schemaVersion !== 1)
    invalid('INVALID_RECORD', 'Unsupported activation schema', 'activation');
  return Object.freeze({
    schemaVersion: 1 as const,
    playerId: readId(data.playerId, 'activation.playerId'),
    profileId: readId(data.profileId, 'activation.profileId'),
    versionId: readId(data.versionId, 'activation.versionId'),
    sequence: readCount(data.sequence, 'activation.sequence'),
    activatedAt: readTimestamp(data.activatedAt, 'activation.activatedAt'),
  });
}

const metaFields = ['key', 'value'] as const;

export function parseMetaRecord(value: unknown): MetaRecord {
  const data = exactFields(value, metaFields, 'meta');
  const key = readId(data.key, 'meta.key');
  if (key !== META_SCHEMA_KEY)
    invalid('INVALID_RECORD', `Unsupported meta key: ${key}`, 'meta.key');
  const record = readObject(data.value, 'meta.value');
  if (record.format !== PERSISTENCE_FORMAT) {
    invalid('INVALID_RECORD', 'Local database belongs to another format', 'meta.value.format');
  }
  if (record.schemaVersion !== 1 && record.schemaVersion !== 2) {
    invalid('INVALID_RECORD', 'Unsupported local schema marker', 'meta.value.schemaVersion');
  }
  readTimestamp(record.createdAt, 'meta.value.createdAt');
  return Object.freeze({ key: META_SCHEMA_KEY, value: Object.freeze({ ...record }) });
}

/**
 * A stored 109 profile version, re-verified with the 109 checksum function itself so a corrupted
 * or hand-edited history row is rejected instead of being activated by 128.
 */
export function parseProfileRecord(value: unknown): ProfileVersion {
  const data = readObject(value, 'profile');
  const required = [
    'schemaVersion',
    'units',
    'profileId',
    'versionId',
    'parentVersionId',
    'engineVersion',
    'parameters',
    'provenance',
    'sourceSegmentIds',
    'depth',
    'createdAt',
    'checksum',
  ] as const;
  for (const field of required) {
    if (!Object.hasOwn(data, field))
      invalid('INVALID_RECORD', `Missing field: ${field}`, 'profile');
  }
  for (const key of Object.keys(data)) {
    if (!(required as readonly string[]).includes(key)) {
      invalid('INVALID_RECORD', `Unknown field: ${key}`, `profile.${key}`);
    }
  }
  if (data.schemaVersion !== 1 || data.units !== 'SI') {
    invalid('INVALID_RECORD', 'Unsupported profile schema or units', 'profile');
  }
  const provenanceData = exactFields(
    data.provenance,
    ['origin', 'sourceSegmentIds', 'sourceInterventionIds', 'delta'],
    'profile.provenance',
  );
  const origin = provenanceData.origin;
  if (origin !== 'BASE' && origin !== 'DERIVED') {
    invalid('INVALID_RECORD', 'Unsupported profile origin', 'profile.provenance.origin');
  }
  const ids = (value: unknown, path: string): readonly string[] => {
    if (!Array.isArray(value)) return invalid('INVALID_RECORD', 'Expected an array', path);
    const result = value.map((entry, position) => readId(entry, `${path}[${position}]`));
    if (new Set(result).size !== result.length) {
      invalid('INVALID_RECORD', 'Duplicate identities', path);
    }
    return Object.freeze(result);
  };
  const provenanceIds = ids(provenanceData.sourceSegmentIds, 'profile.provenance.sourceSegmentIds');
  const interventionIds = ids(
    provenanceData.sourceInterventionIds,
    'profile.provenance.sourceInterventionIds',
  );
  const sourceSegmentIds = ids(data.sourceSegmentIds, 'profile.sourceSegmentIds');
  const rawDelta = provenanceData.delta;
  let delta: ProfileVersionProvenance['delta'] = null;
  if (rawDelta !== null) {
    const value = exactFields(
      rawDelta,
      [
        'baseVersionId',
        'validationVersion',
        'segmentId',
        'interventionId',
        'reason',
        'keyCount',
        'changes',
      ],
      'profile.provenance.delta',
    );
    if (!Array.isArray(value.changes)) {
      invalid('INVALID_RECORD', 'Expected delta changes', 'profile.provenance.delta.changes');
    }
    const changes = value.changes.map((entry, position) => {
      const change = exactFields(
        entry,
        ['key', 'unit', 'previousValue', 'newValue'],
        `profile.provenance.delta.changes[${position}]`,
      );
      const readFinite = (candidate: unknown): number => {
        if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
          return invalid('INVALID_RECORD', 'Expected a finite number', 'profile.delta');
        }
        return candidate;
      };
      return Object.freeze({
        key: readId(change.key, 'profile.delta.key'),
        unit: readId(change.unit, 'profile.delta.unit'),
        previousValue: readFinite(change.previousValue),
        newValue: readFinite(change.newValue),
      });
    });
    delta = Object.freeze({
      baseVersionId: readId(value.baseVersionId, 'profile.delta.baseVersionId'),
      validationVersion: readText(value.validationVersion, 'profile.delta.validationVersion'),
      segmentId: readId(value.segmentId, 'profile.delta.segmentId'),
      interventionId:
        value.interventionId === null
          ? null
          : readId(value.interventionId, 'profile.delta.interventionId'),
      reason: value.reason === null ? null : readText(value.reason, 'profile.delta.reason'),
      keyCount: readCount(value.keyCount, 'profile.delta.keyCount'),
      changes: Object.freeze(changes),
    });
    if (delta.changes.length !== delta.keyCount) {
      invalid(
        'INVALID_RECORD',
        'Delta key count does not match its changes',
        'profile.delta.keyCount',
      );
    }
  }
  const rawParameters = readObject(data.parameters, 'profile.parameters');
  const keys = Object.keys(rawParameters);
  if (keys.length === 0) invalid('INVALID_RECORD', 'A profile version needs parameters', 'profile');
  const parameters: Record<string, number> = Object.create(null);
  for (const key of keys) {
    if (!/^[a-z][a-z0-9_]*$/.test(key) || RESERVED_KEYS.has(key)) {
      invalid('INVALID_RECORD', `Invalid parameter key: ${key}`, 'profile.parameters');
    }
    const value = rawParameters[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      invalid('INVALID_RECORD', 'Parameter values must be finite numbers', 'profile.parameters');
    }
    parameters[key] = value;
  }
  const parentVersionId =
    data.parentVersionId === null ? null : readId(data.parentVersionId, 'profile.parentVersionId');
  const versionId = readId(data.versionId, 'profile.versionId');
  if (versionId === parentVersionId) {
    invalid('INVALID_RECORD', 'A version cannot be its own parent', 'profile.parentVersionId');
  }
  const depth = readCount(data.depth, 'profile.depth');
  if (origin === 'BASE') {
    if (parentVersionId !== null || delta !== null || depth !== 0) {
      invalid('INVALID_RECORD', 'A base version has no parent, delta or depth', 'profile.depth');
    }
  } else if (parentVersionId === null || delta === null || depth === 0) {
    invalid('INVALID_RECORD', 'A derived version needs its parent and delta', 'profile.provenance');
  }
  if (delta !== null && delta.baseVersionId !== parentVersionId) {
    invalid(
      'INVALID_RECORD',
      'Delta base does not match the parent version',
      'profile.provenance.delta',
    );
  }
  const content: ProfileVersionContent = {
    schemaVersion: 1,
    units: 'SI',
    profileId: readId(data.profileId, 'profile.profileId'),
    versionId,
    parentVersionId,
    engineVersion: readText(data.engineVersion, 'profile.engineVersion'),
    parameters: Object.freeze(parameters),
    provenance: Object.freeze({
      origin,
      sourceSegmentIds: provenanceIds,
      sourceInterventionIds: interventionIds,
      delta,
    }),
    sourceSegmentIds,
    depth,
    createdAt: readTimestamp(data.createdAt, 'profile.createdAt'),
  };
  const checksum = readText(data.checksum, 'profile.checksum');
  const computed = computeProfileVersionChecksum(content);
  if (checksum !== computed) {
    throw new PersistenceError(
      'PROFILE_CHECKSUM_MISMATCH',
      'Stored profile version does not match its 109 checksum',
      'profile.checksum',
    );
  }
  return Object.freeze({ ...content, checksum }) as ProfileVersion;
}

/** 009 settings snapshot; the player id doubles as the store key. */
export function parseSettingsRecord(value: unknown): RuntimeSettings {
  const settings = parseRuntimeSettings(value);
  const bytes = measureJsonBytes(settings, 'settings');
  if (bytes > PERSISTENCE_LIMITS.maxRecordBytes) {
    throw new PersistenceError(
      'RECORD_TOO_LARGE',
      'Settings record exceeds the record budget',
      'settings',
    );
  }
  return settings;
}

/** Narrow helper so the repository can bound a raw key without importing sessions directly. */
export function storageKey(value: unknown, field: string): string {
  return boundedText(value, field, PERSISTENCE_LIMITS.maxIdCodeUnits);
}

import { recordStage } from '../../scripts/manual-segments-record-stage-observer.mjs';
import { parseInterventionSegment } from './contracts';
import type { InterventionSegment } from './contracts';
import { INTERVENTION_LIMITS } from './intervention-ports';

/** Only exact results of this admission function can enter this private cache.
 * Weak keys do not retain released records/history; no caller can register a key.
 * Owner disposal releases repository/history references. External references may
 * keep an immutable record alive, but this cache grants no authority capability.
 */
const admittedRecords = new WeakMap<
  object,
  Readonly<{ record: InterventionSegment; bytes: number }>
>();

// Called only AFTER the existing bounded own-data preflight and005 copy/parser.
// An unexpectedly mutable parser descendant disables reuse rather than trusting
// caller freeze flags or changing the parser's accepted-data semantics.
function immutableParserResult(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return true;
  if (!Object.isFrozen(value)) return false;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !immutableParserResult(descriptor.value))
      return false;
  }
  return true;
}

/** Bounded own-data preflight before005 record parsing/cloning. */
export function interventionRecordBytes(value: unknown) {
return recordStage('bytewalk', () => {
  const encoder = new TextEncoder();
  let nodes = 0,
    bytes = 0;
  function add(n: number) {
    bytes += n;
    if (bytes > INTERVENTION_LIMITS.recordBytes) throw Error('Intervention record byte capacity');
  }
  function literal(v: string | number | boolean | null) {
    add(encoder.encode(JSON.stringify(v)).byteLength);
  }
  function visit(v: unknown, depth: number, name: string) {
    if (++nodes > 8192 || depth > 16) throw Error('Intervention record traversal capacity');
    if (v === null || typeof v === 'boolean') {
      literal(v);
      return;
    }
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw Error('Intervention finite numbers');
      literal(v);
      return;
    }
    if (typeof v === 'string') {
      if (v.length > 256) throw Error('Intervention string capacity');
      literal(v);
      return;
    }
    if (typeof v !== 'object' || v === null) throw Error('Intervention plain JSON data');
    const array = Array.isArray(v),
      prototype: unknown = Object.getPrototypeOf(v);
    if (
      array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null
    )
      throw Error('Intervention data prototype');
    const keys = Reflect.ownKeys(v);
    if (array) {
      const length = Object.getOwnPropertyDescriptor(v, 'length');
      if (
        !length ||
        !('value' in length) ||
        !Number.isSafeInteger(length.value) ||
        length.value < 0
      )
        throw Error('Intervention array length');
      const n = length.value as number,
        cap = name === 'events' || name === 'conflictEntityIds' ? 8 : 32;
      if (n > cap || keys.length !== n + 1) throw Error('Intervention array cardinality');
      add(2 + Math.max(0, n - 1));
      for (let i = 0; i < n; i++) {
        const d = Object.getOwnPropertyDescriptor(v, String(i));
        if (!d || !('value' in d) || !d.enumerable) throw Error('Intervention dense data array');
        visit(d.value, depth + 1, name);
      }
    } else {
      if (keys.length > 64) throw Error('Intervention field capacity');
      add(2 + Math.max(0, keys.length - 1));
      for (const key of keys) {
        if (typeof key !== 'string' || key.length > 256) throw Error('Intervention data key');
        const d = Object.getOwnPropertyDescriptor(v, key);
        if (!d || !('value' in d) || !d.enumerable) throw Error('Intervention own data descriptor');
        literal(key);
        add(1);
        visit(d.value, depth + 1, key);
      }
    }
  }
  visit(value, 0, 'root');
  return bytes;

});
}

export function admitInterventionRecord(value: unknown) {
  // WeakMap identity lookup invokes no property/prototype/getter/Proxy hooks.
  if (value !== null && typeof value === 'object') {
    const admitted = admittedRecords.get(value);
    if (admitted) return recordStage('cachehit', () => admitted);
  }
  interventionRecordBytes(value); // Enforce every external envelope BEFORE cloning.
  const record = recordStage('parse005', () => parseInterventionSegment(value));
  const admitted = Object.freeze({ record, bytes: interventionRecordBytes(record) });
  if (recordStage('immutability', () => immutableParserResult(record))) admittedRecords.set(record, admitted);
  return admitted;
}

import { parseInterventionSegment } from './contracts';
import { INTERVENTION_LIMITS } from './intervention-ports';

/** Bounded own-data preflight before005 record parsing/cloning. */
export function interventionRecordBytes(value: unknown) {
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
}

export function admitInterventionRecord(value: unknown) {
  const bytes = interventionRecordBytes(value);
  const record = parseInterventionSegment(value);
  return Object.freeze({ record, bytes });
}

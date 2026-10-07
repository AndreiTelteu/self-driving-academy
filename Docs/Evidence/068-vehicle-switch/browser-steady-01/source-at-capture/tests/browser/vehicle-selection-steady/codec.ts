import type { BodyState } from '../../../src/vehicles/body-port';
import { check } from './proof';
/** SI tuple preserves all actualBodyState transform/velocity components, including signedzero.
 * Lossless delta encoding is evidence compression, not a dropped after-snapshot or tolerance. */
export const BODY_TUPLE = Object.freeze([
  'position.x',
  'position.y',
  'position.z',
  'rotation.x',
  'rotation.y',
  'rotation.z',
  'rotation.w',
  'velocity.x',
  'velocity.y',
  'velocity.z',
]);
export function bodyNumbers(bodies: readonly BodyState[]) {
  check(bodies.length === 70, 'All70-body evidence required');
  const data = new Float64Array(700);
  bodies.forEach((body, index) => {
    const p = body.transform.positionM,
      q = body.transform.rotationQuaternion,
      v = body.velocityMps;
    const values = [p.x, p.y, p.z, q.x, q.y, q.z, q.w, v.x, v.y, v.z];
    check(values.every(Number.isFinite), 'Non-finite actual body tuple');
    data.set(values, index * 10);
  });
  return data;
}
export function binary64(values: Float64Array) {
  const bytes = new Uint8Array(values.length * 8),
    view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setFloat64(index * 8, value, true));
  let result = '';
  for (let i = 0; i < bytes.length; i += 8192)
    result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return {
    encoding: 'float64-le-base64' as const,
    count: values.length,
    bytes: bytes.length,
    data: btoa(result),
  };
}
export function settlementTuple(before: readonly BodyState[], after: readonly BodyState[]) {
  const a = bodyNumbers(before),
    b = bodyNumbers(after),
    indices: number[] = [],
    changed: number[] = [];
  for (let index = 0; index < 70; index++) {
    const ai = before[index]!.identity,
      bi = after[index]!.identity;
    check(
      ai.entityId === bi.entityId && ai.handle === bi.handle && ai.generation === bi.generation,
      'Settlement native identity changed',
    );
  }
  for (let index = 0; index < a.length; index++)
    if (!Object.is(a[index], b[index])) {
      indices.push(index);
      changed.push(b[index]!);
    }
  return {
    tupleVersion: '068-all70-body-tuple-v1',
    fields: BODY_TUPLE,
    before: binary64(a),
    after: {
      copyBefore: true,
      changedIndices: indices,
      changedValues: binary64(Float64Array.from(changed)),
    },
  };
}
/** Actual sampled raw/effective/native numeric channels, deterministic checksum (not SHA).
 * Raw channel samples are additionally retained at canonical300tick checkpoints. */
export function numericChecksum() {
  let a = 2166136261,
    b = 2246822519,
    values = 0;
  const scratch = new DataView(new ArrayBuffer(8));
  return {
    add(value: number) {
      check(Number.isFinite(value), 'Nonfinite checksum channel');
      scratch.setFloat64(0, value, true);
      for (let i = 0; i < 8; i++) {
        const byte = scratch.getUint8(i);
        a = Math.imul(a ^ byte, 16777619) >>> 0;
        b = Math.imul(b ^ byte, 3266489917) >>> 0;
      }
      values++;
    },
    read() {
      return { algorithm: 'two-u32-float64-le-v1', values, a, b };
    },
  };
}

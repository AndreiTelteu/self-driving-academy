import type { ContractContext } from '../sessions';
export function requireMode(condition: boolean, message: string): asserts condition {
  if (!condition) throw Error(message);
}
export function modeFields(value: unknown, keys: readonly string[]): Record<string, unknown> {
  requireMode(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'Expected mode data object',
  );
  const prototype = Object.getPrototypeOf(value);
  requireMode(prototype === Object.prototype || prototype === null, 'Expected plain mode data');
  const names = Reflect.ownKeys(value);
  requireMode(
    names.length === keys.length && names.every((k) => typeof k === 'string' && keys.includes(k)),
    'Missing/extra/symbol mode fields',
  );
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    requireMode(!!d && 'value' in d && d.enumerable === true, 'Expected mode data descriptors');
    result[key] = d.value;
  }
  return result;
}
export function modeInteger(value: unknown): number {
  requireMode(
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
    'Expected mode safe integer',
  );
  return value;
}
export function modeBoolean(value: unknown): boolean {
  requireMode(typeof value === 'boolean', 'Expected mode boolean');
  return value;
}
export function modeText(value: unknown, max = 256): string {
  requireMode(
    typeof value === 'string' && value.trim().length > 0 && value.length <= max,
    'Expected bounded mode text',
  );
  return value;
}
export function modeContext(value: unknown): ContractContext {
  const d = modeFields(value, ['schemaVersion', 'units', 'sessionId', 'worldEpoch']);
  requireMode(d.schemaVersion === 1 && d.units === 'SI', 'Unsupported mode context');
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    sessionId: modeText(d.sessionId),
    worldEpoch: modeInteger(d.worldEpoch),
  });
}
export function sameModeWorld(a: ContractContext, b: ContractContext) {
  return (
    a.sessionId === b.sessionId &&
    a.worldEpoch === b.worldEpoch &&
    a.schemaVersion === b.schemaVersion &&
    a.units === b.units
  );
}

/** Small boundary readers shared by session-scoped domain contracts. */
export class ContractValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractValidationError';
  }
}

export function requireContract(condition: boolean, message: string): asserts condition {
  if (!condition) throw new ContractValidationError(message);
}

export function record(value: unknown): Record<string, unknown> {
  requireContract(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'Expected object',
  );
  const prototype: unknown = Object.getPrototypeOf(value);
  requireContract(
    prototype === Object.prototype || prototype === null,
    'Expected plain data object',
  );
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    requireContract(typeof key === 'string', 'Symbol fields are unsupported');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    requireContract(
      descriptor !== undefined && 'value' in descriptor && descriptor.enumerable === true,
      'Expected enumerable data fields',
    );
    const field: unknown = descriptor.value;
    result[key] = field;
  }
  return result;
}

export function fields(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  const data = record(value);
  requireContract(
    Object.keys(data).length === allowed.length && allowed.every((key) => Object.hasOwn(data, key)),
    'Missing or unknown contract fields',
  );
  return data;
}

export function number(value: unknown, minimum = -Infinity, maximum = Infinity): number {
  requireContract(
    typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum,
    'Expected finite number in range',
  );
  return value;
}

export function tick(value: unknown): number {
  const result = number(value, 0, Number.MAX_SAFE_INTEGER);
  requireContract(Number.isSafeInteger(result), 'Expected safe nonnegative integer');
  return result;
}

export function text(value: unknown): string {
  requireContract(typeof value === 'string' && value.trim().length > 0, 'Expected nonempty string');
  return value;
}

export function boolean(value: unknown): boolean {
  requireContract(typeof value === 'boolean', 'Expected boolean');
  return value;
}

export function choice<const T extends readonly string[]>(value: unknown, options: T): T[number] {
  for (const option of options) if (value === option) return option;
  throw new ContractValidationError('Unsupported enum value');
}

export function list<T>(value: unknown, read: (value: unknown) => T): readonly T[] {
  requireContract(Array.isArray(value), 'Expected array');
  requireContract(
    Object.getPrototypeOf(value) === Array.prototype &&
      Reflect.ownKeys(value).length === value.length + 1,
    'Expected dense array without extra fields',
  );
  const result: T[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    requireContract(
      descriptor !== undefined && 'value' in descriptor && descriptor.enumerable === true,
      'Expected array data entries without accessors',
    );
    const entry: unknown = descriptor.value;
    result.push(read(entry));
  }
  return Object.freeze(result);
}

export function nullable<T>(value: unknown, read: (value: unknown) => T): T | null {
  return value === null ? null : read(value);
}

export interface ContractContext {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly sessionId: string;
  readonly worldEpoch: number;
}

export const contextFields = ['schemaVersion', 'units', 'sessionId', 'worldEpoch'] as const;

export function readContext(data: Record<string, unknown>): ContractContext {
  requireContract(
    data.schemaVersion === 1 && data.units === 'SI',
    'Unsupported schema version or units',
  );
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: text(data.sessionId),
    worldEpoch: tick(data.worldEpoch),
  };
}

export function sameWorld(left: ContractContext, right: ContractContext): boolean {
  return left.sessionId === right.sessionId && left.worldEpoch === right.worldEpoch;
}

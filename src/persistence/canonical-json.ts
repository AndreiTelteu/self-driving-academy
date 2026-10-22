/**
 * Canonical JSON, strict parsing and SHA-256 for the export envelope (PBI 133).
 *
 * The rules are the ones of [Docs/29-savefile-si-integritate.md](../Docs/29-savefile-si-integritate.md):
 * `SDA-CJSON-1` canonicalization plus a `SHA-256` checksum over the UTF-8 bytes of the canonical
 * representation of the whole envelope, without the top-level checksum field.
 *
 * Three properties matter and are enforced here, not by convention:
 *
 * 1. **Deterministic.** Object keys are sorted by UTF-16 code unit at every level, array order is
 *    preserved, `-0` becomes `0` and no whitespace is emitted. The same data always produces the
 *    same text, so two exports of the same profile can be compared byte for byte.
 * 2. **Data only.** NaN, Infinity, `undefined`, functions and symbols are rejected, and the keys
 *    that are dangerous for prototype pollution are refused. The canonical text never evaluates
 *    anything.
 * 3. **Strict on the way in.** The reader below is a real JSON parser, not `JSON.parse`: it
 *    rejects duplicate object keys (the importer must not silently accept "the last value"), it
 *    enforces the JSON number grammar (no `NaN`, no `Infinity`, no leading `+`, no leading zeros),
 *    it rejects trailing content and it bounds the size and the depth of the input.
 *
 * The SHA-256 implementation is a self-contained one on purpose: `crypto.subtle` only exists in a
 * secure context, and a profile export must stay verifiable in every browser context and in Node.
 */

/** Canonicalization id stored in the envelope and in every checksum. */
export const CANONICALIZATION_VERSION = 'SDA-CJSON-1' as const;

/** Checksum algorithm stored in the envelope. */
export const CHECKSUM_ALGORITHM = 'SHA-256' as const;

/** Keys that are never accepted inside a canonicalized document. */
export const UNSAFE_JSON_KEYS: readonly string[] = Object.freeze([
  '__proto__',
  'prototype',
  'constructor',
]);

export const canonicalJsonRejectionCodes = [
  'UNSUPPORTED_VALUE',
  'NON_FINITE_NUMBER',
  'UNSAFE_KEY',
  'TOO_DEEP',
  'CYCLE',
] as const;
export type CanonicalJsonRejectionCode = (typeof canonicalJsonRejectionCodes)[number];

export interface CanonicalJsonRejection {
  readonly code: CanonicalJsonRejectionCode;
  readonly message: string;
  readonly path: string;
}

export type CanonicalJsonResult =
  | { readonly status: 'ACCEPTED'; readonly text: string }
  | { readonly status: 'REJECTED'; readonly rejection: CanonicalJsonRejection };

export const strictJsonRejectionCodes = [
  'FILE_TOO_LARGE',
  'PARSE_ERROR',
  'DUPLICATE_KEY',
  'DEPTH_EXCEEDED',
  'TRAILING_CONTENT',
  'INVALID_NUMBER',
  'INVALID_ESCAPE',
  'INVALID_LITERAL',
  'UNEXPECTED_TOKEN',
] as const;
export type StrictJsonRejectionCode = (typeof strictJsonRejectionCodes)[number];

export interface StrictJsonRejection {
  readonly code: StrictJsonRejectionCode;
  readonly message: string;
  readonly path: string;
}

export type StrictJsonResult =
  | { readonly status: 'ACCEPTED'; readonly value: unknown }
  | { readonly status: 'REJECTED'; readonly rejection: StrictJsonRejection };

export const STRICT_JSON_LIMITS = Object.freeze({
  /** UTF-16 code units of the parsed text. */
  maxBytes: 1_048_576,
  /** Nesting depth of objects and arrays. */
  maxDepth: 24,
});

/* ------------------------------------------------------------------ SHA-256 */

const SHA256_K: readonly number[] = Object.freeze([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/** SHA-256 of raw bytes, returned as 32 bytes. */
export function sha256Bytes(bytes: Uint8Array): Uint8Array {
  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const length = bytes.length;
  const paddedLength = Math.ceil((length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  const schedule = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      schedule[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const previous = schedule[index - 15];
      const recent = schedule[index - 2];
      const s0 = (rotr(previous, 7) ^ rotr(previous, 18) ^ (previous >>> 3)) >>> 0;
      const s1 = (rotr(recent, 17) ^ rotr(recent, 19) ^ (recent >>> 10)) >>> 0;
      schedule[index] = (schedule[index - 16] + s0 + schedule[index - 7] + s1) >>> 0;
    }
    let a = state[0];
    let b = state[1];
    let c = state[2];
    let d = state[3];
    let e = state[4];
    let f = state[5];
    let g = state[6];
    let h = state[7];
    for (let index = 0; index < 64; index += 1) {
      const s1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const choice = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + s1 + choice + SHA256_K[index] + schedule[index]) >>> 0;
      const s0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const majority = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }
  const digest = new Uint8Array(32);
  const digestView = new DataView(digest.buffer);
  for (let index = 0; index < 8; index += 1) digestView.setUint32(index * 4, state[index], false);
  return digest;
}

const encoder = new TextEncoder();

/** Lowercase hexadecimal SHA-256 of the UTF-8 bytes of `text`. */
export function sha256Hex(text: string): string {
  const digest = sha256Bytes(encoder.encode(text));
  let hex = '';
  for (let index = 0; index < digest.length; index += 1) {
    hex += digest[index].toString(16).padStart(2, '0');
  }
  return hex;
}

/* -------------------------------------------------------- canonicalization */

interface CanonicalContext {
  readonly maxDepth: number;
  readonly entries: { count: number };
  readonly seen: Set<object>;
}

function canonicalRejection(
  code: CanonicalJsonRejectionCode,
  message: string,
  path: string,
): CanonicalJsonResult {
  return { status: 'REJECTED', rejection: { code, message, path } };
}

function canonicalValue(
  value: unknown,
  path: string,
  depth: number,
  context: CanonicalContext,
): string | CanonicalJsonRejection {
  if (depth > context.maxDepth) {
    return {
      code: 'TOO_DEEP',
      message: `The document is nested deeper than ${context.maxDepth} levels`,
      path,
    };
  }
  context.entries.count += 1;
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return {
        code: 'NON_FINITE_NUMBER',
        message: 'Numbers must be finite',
        path,
      };
    }
    // JSON.stringify already maps -0 to 0 and keeps the shortest round-trip form.
    return JSON.stringify(value === 0 ? 0 : value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value !== 'object') {
    return {
      code: 'UNSUPPORTED_VALUE',
      message: `Only JSON values are supported (received ${typeof value})`,
      path,
    };
  }
  if (context.seen.has(value)) {
    return { code: 'CYCLE', message: 'The document contains a cycle', path };
  }
  context.seen.add(value);
  try {
    if (Array.isArray(value)) {
      const items: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const item = canonicalValue(value[index], `${path}[${index}]`, depth + 1, context);
        if (typeof item !== 'string') return item;
        items.push(item);
      }
      return `[${items.join(',')}]`;
    }
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return {
        code: 'UNSUPPORTED_VALUE',
        message: 'Expected plain data, not a class instance',
        path,
      };
    }
    const keys = Object.keys(value).sort();
    const members: string[] = [];
    for (const key of keys) {
      if (UNSAFE_JSON_KEYS.includes(key)) {
        return {
          code: 'UNSAFE_KEY',
          message: `The key ${key} is not allowed in a canonical document`,
          path: `${path}.${key}`,
        };
      }
      const member = canonicalValue(
        (value as Record<string, unknown>)[key],
        `${path}.${key}`,
        depth + 1,
        context,
      );
      if (typeof member !== 'string') return member;
      members.push(`${JSON.stringify(key)}:${member}`);
    }
    return `{${members.join(',')}}`;
  } finally {
    context.seen.delete(value);
  }
}

/**
 * Canonical text of plain JSON data, following `SDA-CJSON-1`.
 *
 * The result has no whitespace, sorted object keys at every level, preserved array order and no
 * value that JSON cannot represent.
 */
export function canonicalizeJson(
  value: unknown,
  options: { readonly maxDepth?: number } = {},
): CanonicalJsonResult {
  const maxDepth = options.maxDepth ?? STRICT_JSON_LIMITS.maxDepth;
  const outcome = canonicalValue(value, '$', 0, {
    maxDepth,
    entries: { count: 0 },
    seen: new Set<object>(),
  });
  if (typeof outcome === 'string') return { status: 'ACCEPTED', text: outcome };
  return canonicalRejection(outcome.code, outcome.message, outcome.path);
}

/* ------------------------------------------------------------ strict parser */

/** Internal outcome of the recursive descent reader. */
type ParseOutcome =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly rejection: StrictJsonRejection };

/** Internal outcome of a string read. */
type StringOutcome =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly rejection: StrictJsonRejection };

class StrictJsonReader {
  index = 0;

  private readonly text: string;

  private readonly maxDepth: number;

  constructor(text: string, maxDepth: number) {
    this.text = text;
    this.maxDepth = maxDepth;
  }

  private reject(
    code: StrictJsonRejectionCode,
    message: string,
    path: string,
  ): { readonly ok: false; readonly rejection: StrictJsonRejection } {
    return {
      ok: false,
      rejection: { code, message, path },
    };
  }

  skipWhitespace(): void {
    while (this.index < this.text.length) {
      const code = this.text.charCodeAt(this.index);
      if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) this.index += 1;
      else break;
    }
  }

  private peek(): string {
    return this.index < this.text.length ? this.text[this.index] : '';
  }

  parseValue(path: string, depth: number): ParseOutcome {
    if (depth > this.maxDepth) {
      return this.reject(
        'DEPTH_EXCEEDED',
        `The document is deeper than ${this.maxDepth} levels`,
        path,
      );
    }
    this.skipWhitespace();
    const character = this.peek();
    if (character === '') {
      return this.reject('PARSE_ERROR', 'Unexpected end of input', path);
    }
    if (character === '{') return this.parseObject(path, depth);
    if (character === '[') return this.parseArray(path, depth);
    if (character === '"') return this.parseString(path);
    if (character === 't' || character === 'f' || character === 'n') return this.parseLiteral(path);
    if (character === 'N') return this.reject('INVALID_LITERAL', 'NaN is not a JSON value', path);
    if (character === 'I') {
      return this.reject('INVALID_LITERAL', 'Infinity is not a JSON value', path);
    }
    if (character === '-' || (character >= '0' && character <= '9')) return this.parseNumber(path);
    return this.reject('UNEXPECTED_TOKEN', `Unexpected token ${character}`, path);
  }

  private parseObject(path: string, depth: number): ParseOutcome {
    this.index += 1;
    const result: Record<string, unknown> = Object.create(null);
    this.skipWhitespace();
    if (this.peek() === '}') {
      this.index += 1;
      return { ok: true, value: result };
    }
    for (;;) {
      this.skipWhitespace();
      if (this.peek() !== '"') {
        return this.reject('UNEXPECTED_TOKEN', 'Expected an object key', path);
      }
      const key = this.parseString(`${path}.<key>`);
      if (!key.ok) return key;
      this.skipWhitespace();
      if (this.peek() !== ':') {
        return this.reject('UNEXPECTED_TOKEN', 'Expected a colon after the object key', path);
      }
      this.index += 1;
      const value = this.parseValue(`${path}.${key.value}`, depth + 1);
      if (!value.ok) return value;
      if (Object.hasOwn(result, key.value)) {
        return this.reject(
          'DUPLICATE_KEY',
          `Duplicate object key: ${key.value}`,
          `${path}.${key.value}`,
        );
      }
      result[key.value] = value.value;
      this.skipWhitespace();
      const separator = this.peek();
      if (separator === ',') {
        this.index += 1;
        continue;
      }
      if (separator === '}') {
        this.index += 1;
        return { ok: true, value: result };
      }
      return this.reject('UNEXPECTED_TOKEN', 'Expected a comma or the end of the object', path);
    }
  }

  private parseArray(path: string, depth: number): ParseOutcome {
    this.index += 1;
    const items: unknown[] = [];
    this.skipWhitespace();
    if (this.peek() === ']') {
      this.index += 1;
      return { ok: true, value: items };
    }
    for (;;) {
      const value = this.parseValue(`${path}[${items.length}]`, depth + 1);
      if (!value.ok) return value;
      items.push(value.value);
      this.skipWhitespace();
      const separator = this.peek();
      if (separator === ',') {
        this.index += 1;
        continue;
      }
      if (separator === ']') {
        this.index += 1;
        return { ok: true, value: items };
      }
      return this.reject('UNEXPECTED_TOKEN', 'Expected a comma or the end of the array', path);
    }
  }

  private parseString(path: string): StringOutcome {
    this.index += 1;
    let result = '';
    for (;;) {
      if (this.index >= this.text.length) {
        return this.reject('PARSE_ERROR', 'Unterminated string', path);
      }
      const character = this.text[this.index];
      const code = this.text.charCodeAt(this.index);
      if (character === '"') {
        this.index += 1;
        return { ok: true, value: result };
      }
      if (code < 0x20) {
        return this.reject('PARSE_ERROR', 'Unescaped control character in a string', path);
      }
      if (character === '\\') {
        this.index += 1;
        const escape = this.text[this.index];
        switch (escape) {
          case '"':
            result += '"';
            this.index += 1;
            break;
          case '\\':
            result += '\\';
            this.index += 1;
            break;
          case '/':
            result += '/';
            this.index += 1;
            break;
          case 'b':
            result += '\b';
            this.index += 1;
            break;
          case 'f':
            result += '\f';
            this.index += 1;
            break;
          case 'n':
            result += '\n';
            this.index += 1;
            break;
          case 'r':
            result += '\r';
            this.index += 1;
            break;
          case 't':
            result += '\t';
            this.index += 1;
            break;
          case 'u': {
            const hex = this.text.slice(this.index + 1, this.index + 5);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
              return this.reject('INVALID_ESCAPE', 'Invalid unicode escape', path);
            }
            result += String.fromCharCode(Number.parseInt(hex, 16));
            this.index += 5;
            break;
          }
          default:
            return this.reject('INVALID_ESCAPE', `Invalid escape \\${escape ?? ''}`, path);
        }
        continue;
      }
      result += character;
      this.index += 1;
    }
  }

  private parseNumber(path: string): ParseOutcome {
    const start = this.index;
    if (this.peek() === '-') this.index += 1;
    if (this.peek() === '0') {
      this.index += 1;
    } else if (this.peek() >= '1' && this.peek() <= '9') {
      while (this.peek() >= '0' && this.peek() <= '9') this.index += 1;
    } else {
      return this.reject('INVALID_NUMBER', 'Invalid number', path);
    }
    if (this.peek() === '.') {
      this.index += 1;
      if (!(this.peek() >= '0' && this.peek() <= '9')) {
        return this.reject('INVALID_NUMBER', 'A decimal point needs at least one digit', path);
      }
      while (this.peek() >= '0' && this.peek() <= '9') this.index += 1;
    }
    const exponent = this.peek();
    if (exponent === 'e' || exponent === 'E') {
      this.index += 1;
      const sign = this.peek();
      if (sign === '+' || sign === '-') this.index += 1;
      if (!(this.peek() >= '0' && this.peek() <= '9')) {
        return this.reject('INVALID_NUMBER', 'An exponent needs at least one digit', path);
      }
      while (this.peek() >= '0' && this.peek() <= '9') this.index += 1;
    }
    const raw = this.text.slice(start, this.index);
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      return this.reject('INVALID_NUMBER', 'The number is not finite', path);
    }
    return { ok: true, value };
  }

  private parseLiteral(path: string): ParseOutcome {
    if (this.text.startsWith('true', this.index)) {
      this.index += 4;
      return { ok: true, value: true };
    }
    if (this.text.startsWith('false', this.index)) {
      this.index += 5;
      return { ok: true, value: false };
    }
    if (this.text.startsWith('null', this.index)) {
      this.index += 4;
      return { ok: true, value: null };
    }
    return this.reject('INVALID_LITERAL', 'Unknown literal', path);
  }
}

/**
 * Strict JSON reader.
 *
 * `JSON.parse` is not enough for an import boundary: it silently keeps the last value of a
 * duplicated key and it accepts no NaN/Infinity, but it does accept them in some engines and it
 * does not bound the size or the depth of the input. This reader refuses all of those.
 */
export function parseStrictJson(
  text: string,
  options: { readonly maxBytes?: number; readonly maxDepth?: number } = {},
): StrictJsonResult {
  const maxBytes = options.maxBytes ?? STRICT_JSON_LIMITS.maxBytes;
  const maxDepth = options.maxDepth ?? STRICT_JSON_LIMITS.maxDepth;
  if (text.length > maxBytes) {
    return {
      status: 'REJECTED',
      rejection: {
        code: 'FILE_TOO_LARGE',
        message: `The document has ${text.length} code units, above the ${maxBytes} budget`,
        path: '$',
      },
    };
  }
  const reader = new StrictJsonReader(text, maxDepth);
  const value = reader.parseValue('$', 0);
  if (!value.ok) {
    return { status: 'REJECTED', rejection: value.rejection };
  }
  reader.skipWhitespace();
  if (reader.index !== text.length) {
    return {
      status: 'REJECTED',
      rejection: {
        code: 'TRAILING_CONTENT',
        message: 'The document has content after the top-level value',
        path: '$',
      },
    };
  }
  return { status: 'ACCEPTED', value: value.value };
}

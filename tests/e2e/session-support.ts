import { canonicalizeJson, sha256Hex } from '../../src/persistence/index';

/**
 * Vocabulary of the PBI 152 end-to-end session.
 *
 * Every numeric comparison declares its tolerance, exactly like the 151 scenario suite and the 216
 * regression matrix: `EXACT` for contract values (states, identities, counters, checksums),
 * `ABSOLUTE` for a published precision and `RELATIVE` for a ratio. There is no "approximately
 * equal": a number without a declared tolerance cannot enter the transcript.
 */
export const E2E_SESSION_VERSION = '152-e2e-session-v1' as const;
export const E2E_SESSION_GENERATED_BY = 'scripts/run-e2e-session-report.mjs' as const;
export const E2E_SESSION_COMMAND = 'npm run e2e:session' as const;
export const E2E_SESSION_SEED = 152 as const;

export type SessionToleranceKind = 'EXACT' | 'ABSOLUTE' | 'RELATIVE';

export interface SessionTolerance {
  readonly kind: SessionToleranceKind;
  /** `0` for `EXACT`; the published bound otherwise. */
  readonly value: number;
  /** Unit of the bound; `—` when the compared value is a contract token. */
  readonly unit: string;
}

export type SessionValue =
  | string
  | number
  | boolean
  | null
  | readonly string[]
  | readonly number[]
  | Readonly<Record<string, string | number | boolean | null>>;

export interface SessionCheck {
  readonly name: string;
  readonly expected: SessionValue;
  readonly actual: SessionValue;
  readonly tolerance: SessionTolerance;
  readonly pass: boolean;
  readonly detail: string;
}

export interface SessionStep {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly contract: string;
  readonly input: Readonly<Record<string, SessionValue>>;
  readonly actual: Readonly<Record<string, SessionValue>>;
  readonly checks: readonly SessionCheck[];
  readonly verdict: 'PASS' | 'FAIL';
}

export const exactTolerance: SessionTolerance = Object.freeze({
  kind: 'EXACT' as const,
  value: 0,
  unit: '—',
});

export function absoluteTolerance(value: number, unit: string): SessionTolerance {
  return Object.freeze({ kind: 'ABSOLUTE' as const, value, unit });
}

export function relativeTolerance(value: number, unit: string): SessionTolerance {
  return Object.freeze({ kind: 'RELATIVE' as const, value, unit });
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function numericMatch(left: number, right: number, tolerance: SessionTolerance): boolean {
  if (tolerance.kind === 'EXACT') return left === right;
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  if (tolerance.kind === 'ABSOLUTE') return Math.abs(left - right) <= tolerance.value;
  const scale = Math.max(Math.abs(left), Math.abs(right), Number.EPSILON);
  return Math.abs(left - right) / scale <= tolerance.value;
}

/** One declared comparison. The verdict is derived, never authored. */
export function sessionCheck(
  name: string,
  expected: SessionValue,
  actual: SessionValue,
  tolerance: SessionTolerance,
  detail: string,
): SessionCheck {
  const pass =
    typeof expected === 'number' && typeof actual === 'number'
      ? numericMatch(expected, actual, tolerance)
      : sameJson(expected, actual);
  return Object.freeze({ name, expected, actual, tolerance, pass, detail });
}

export function sessionStep(input: {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly contract: string;
  readonly input: Readonly<Record<string, SessionValue>>;
  readonly actual: Readonly<Record<string, SessionValue>>;
  readonly checks: readonly SessionCheck[];
}): SessionStep {
  return Object.freeze({
    ...input,
    checks: Object.freeze([...input.checks]),
    verdict: input.checks.every((check) => check.pass) ? ('PASS' as const) : ('FAIL' as const),
  });
}

/** Canonical SHA-256 over the executed steps; two independent runs must produce the same value. */
export function sessionDigest(steps: readonly SessionStep[]): string {
  const payload = steps.map((step) => ({
    id: step.id,
    order: step.order,
    contract: step.contract,
    input: step.input,
    actual: step.actual,
    checks: step.checks.map((check) => ({
      name: check.name,
      expected: check.expected,
      actual: check.actual,
      tolerance: check.tolerance,
      pass: check.pass,
      detail: check.detail,
    })),
    verdict: step.verdict,
  }));
  const canonical = canonicalizeJson(payload, { maxDepth: 48 });
  if (canonical.status === 'REJECTED') {
    throw new Error(
      `The session transcript cannot be canonicalized: ${canonical.rejection.message}`,
    );
  }
  return sha256Hex(canonical.text);
}

/** Canonical SHA-256 of any plain projection; used for state fingerprints. */
export function fingerprint(value: unknown): string {
  const canonical = canonicalizeJson(value, { maxDepth: 48 });
  if (canonical.status === 'REJECTED') {
    throw new Error(`The fingerprint payload is not JSON: ${canonical.rejection.message}`);
  }
  return sha256Hex(canonical.text);
}

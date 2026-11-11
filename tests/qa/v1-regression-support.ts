import { canonicalizeJson, sha256Hex } from '../../src/persistence/index';

/**
 * Shared vocabulary of the PBI 216 V1 regression matrix.
 *
 * Every row of the matrix is an executed scenario: it carries the contract that owns the business
 * rule, the real numbers the run produced and an explicit verdict. A scenario that was not executed
 * is `NOT_RUN` with a reason; it is never a checked box.
 */

export const V1_REGRESSION_VERSION = '216-v1-regression-v1' as const;

/** One concrete command that exercises the whole matrix. */
export const V1_REGRESSION_COMMAND = 'npm run qa:v1-regression' as const;

export type QaCategory =
  | 'MODES'
  | 'PROPAGATION'
  | 'LEARNING_BARRIER'
  | 'KPI'
  | 'DAILY'
  | 'XP'
  | 'CHECKPOINT'
  | 'REPLAY'
  | 'COMBINED'
  | 'BENCHMARK'
  | 'PLAYTEST'
  | 'DEPENDENCIES';

export type QaVerdict = 'PASS' | 'FAIL' | 'NOT_RUN';

export type QaPolarity = 'POSITIVE' | 'NEGATIVE' | 'COST' | 'DOCUMENT';

export interface QaRow {
  readonly id: string;
  readonly category: QaCategory;
  /** The delivered contract whose rule is regressed, e.g. `217-three-modes-v1`. */
  readonly contract: string;
  readonly scenario: string;
  readonly polarity: QaPolarity;
  /** The command that exercised this row in this evidence run. */
  readonly command: string;
  /** Real values produced by the run; never a copy of a documented expectation. */
  readonly actual: Readonly<Record<string, unknown>>;
  readonly verdict: QaVerdict;
  readonly note: string;
  /** Set only when `verdict` is `NOT_RUN`; names what is missing. */
  readonly notRunReason: string | null;
}

export interface QaCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

/** Deep JSON equality, the same oracle the other 20x transcripts use. */
export function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function qaCheck(name: string, expected: unknown, actual: unknown, detail: string): QaCheck {
  return Object.freeze({ name, expected, actual, pass: sameJson(expected, actual), detail });
}

export function checksPass(checks: readonly QaCheck[]): boolean {
  return checks.every((entry) => entry.pass);
}

export function failedChecks(checks: readonly QaCheck[]): readonly string[] {
  return checks.filter((entry) => !entry.pass).map((entry) => entry.name);
}

export function qaRow(input: {
  readonly id: string;
  readonly category: QaCategory;
  readonly contract: string;
  readonly scenario: string;
  readonly polarity: QaPolarity;
  readonly actual: Readonly<Record<string, unknown>>;
  readonly checks: readonly QaCheck[];
  readonly note: string;
}): QaRow {
  const failed = failedChecks(input.checks);
  return Object.freeze({
    id: input.id,
    category: input.category,
    contract: input.contract,
    scenario: input.scenario,
    polarity: input.polarity,
    command: V1_REGRESSION_COMMAND,
    actual: input.actual,
    verdict: failed.length === 0 ? 'PASS' : 'FAIL',
    note: failed.length === 0 ? input.note : `${input.note} Eșec: ${failed.join(', ')}`,
    notRunReason: null,
  });
}

export function notRunRow(input: {
  readonly id: string;
  readonly category: QaCategory;
  readonly contract: string;
  readonly scenario: string;
  readonly polarity: QaPolarity;
  readonly reason: string;
}): QaRow {
  return Object.freeze({
    id: input.id,
    category: input.category,
    contract: input.contract,
    scenario: input.scenario,
    polarity: input.polarity,
    command: V1_REGRESSION_COMMAND,
    actual: Object.freeze({}),
    verdict: 'NOT_RUN' as const,
    note: 'Scenariul nu a fost executat; motivul este obligatoriu.',
    notRunReason: input.reason,
  });
}

/** Canonical SHA-256 of a JSON value; used for the XP before/after fingerprints. */
export function digest(value: unknown): string {
  const canonical = canonicalizeJson(value, { maxDepth: 64 });
  if (canonical.status === 'REJECTED') throw new Error(canonical.rejection.message);
  return sha256Hex(canonical.text);
}

export function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : round6(numerator / denominator);
}

import { createHash } from 'node:crypto';

/**
 * Shared vocabulary of the PBI 151 V1 scenario suite.
 *
 * A scenario is executed against a delivered contract with a fixed seed, an explicit input and an
 * explicit expected result. Every numeric comparison carries a declared tolerance; there is no
 * "approximately equal" fallback. A scenario that cannot run is `NOT_RUN` with a reason and is never
 * counted as a pass.
 */

export const SCENARIO_SUITE_VERSION = '151-scenario-suite-v1' as const;
export const SCENARIO_SUITE_COMMAND = 'npm run scenarios:v1' as const;
export const SCENARIO_SUITE_GENERATED_BY = 'scripts/run-scenario-suite-report.mjs' as const;
export const SCENARIO_SUITE_SEED = 151 as const;

export type ScenarioFamily = 'AUTONOMY' | 'RIDES' | 'LEARNING' | 'CAMPAIGN';
export type ScenarioPolarity = 'POSITIVE' | 'NEGATIVE';
export type ScenarioVerdict = 'PASS' | 'FAIL' | 'NOT_RUN';

export const scenarioFamilies: readonly ScenarioFamily[] = Object.freeze([
  'AUTONOMY',
  'RIDES',
  'LEARNING',
  'CAMPAIGN',
]);

/** A comparison rule that is part of the scenario, not of the implementation under test. */
export interface ScenarioTolerance {
  readonly kind: 'EXACT' | 'ABSOLUTE' | 'RELATIVE';
  /** Absolute bound in `unit`, or the relative fraction; 0 for `EXACT`. */
  readonly value: number;
  readonly unit: string;
  readonly rule: string;
}

export function exactTolerance(rule: string): ScenarioTolerance {
  return Object.freeze({ kind: 'EXACT' as const, value: 0, unit: 'identic', rule });
}

export function absoluteTolerance(value: number, unit: string, rule: string): ScenarioTolerance {
  if (!(value >= 0)) throw new RangeError('Absolute tolerance must be non-negative');
  return Object.freeze({ kind: 'ABSOLUTE' as const, value, unit, rule });
}

export function relativeTolerance(fraction: number, rule: string): ScenarioTolerance {
  if (!(fraction >= 0)) throw new RangeError('Relative tolerance must be non-negative');
  return Object.freeze({ kind: 'RELATIVE' as const, value: fraction, unit: 'ratio', rule });
}

export interface ScenarioCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly tolerance: ScenarioTolerance;
  readonly pass: boolean;
  readonly detail: string;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function withinTolerance(expected: number, actual: number, tolerance: ScenarioTolerance): boolean {
  if (!Number.isFinite(expected) || !Number.isFinite(actual)) {
    return Object.is(expected, actual);
  }
  if (tolerance.kind === 'EXACT') return actual === expected;
  const bound =
    tolerance.kind === 'ABSOLUTE' ? tolerance.value : Math.abs(expected) * tolerance.value;
  return Math.abs(actual - expected) <= bound;
}

function freezeCheck(
  name: string,
  expected: unknown,
  actual: unknown,
  tolerance: ScenarioTolerance,
  pass: boolean,
  detail: string,
): ScenarioCheck {
  return Object.freeze({ name, expected, actual, tolerance, pass, detail });
}

export function checkExact(
  name: string,
  expected: unknown,
  actual: unknown,
  detail: string,
): ScenarioCheck {
  return freezeCheck(
    name,
    expected,
    actual,
    exactTolerance('valoarea trebuie să fie identică cu cea a contractului'),
    sameJson(expected, actual),
    detail,
  );
}

export function checkNumber(
  name: string,
  expected: number,
  actual: number,
  tolerance: ScenarioTolerance,
  detail: string,
): ScenarioCheck {
  return freezeCheck(
    name,
    expected,
    actual,
    tolerance,
    withinTolerance(expected, actual, tolerance),
    detail,
  );
}

export function checkTrue(
  name: string,
  condition: boolean,
  actual: unknown,
  detail: string,
): ScenarioCheck {
  return freezeCheck(
    name,
    true,
    actual,
    exactTolerance('condiția booleană trebuie să fie adevărată'),
    condition,
    detail,
  );
}

export interface ScenarioOutcomeInput {
  readonly id: string;
  readonly family: ScenarioFamily;
  readonly polarity: ScenarioPolarity;
  readonly title: string;
  readonly contract: string;
  readonly seed: number;
  readonly steps: number;
  readonly input: Readonly<Record<string, unknown>>;
  readonly expected: Readonly<Record<string, unknown>>;
  readonly actual: Readonly<Record<string, unknown>>;
  readonly checks: readonly ScenarioCheck[];
  readonly note: string;
}

/** One executed scenario; the verdict is derived from the checks, never authored. */
export interface ScenarioOutcome {
  readonly id: string;
  readonly family: ScenarioFamily;
  readonly polarity: ScenarioPolarity;
  readonly title: string;
  readonly contract: string;
  readonly executed: true;
  readonly seed: number;
  readonly steps: number;
  readonly input: Readonly<Record<string, unknown>>;
  readonly expected: Readonly<Record<string, unknown>>;
  readonly actual: Readonly<Record<string, unknown>>;
  readonly checks: readonly ScenarioCheck[];
  readonly verdict: 'PASS' | 'FAIL';
  readonly note: string;
  readonly notRunReason: null;
}

/** A scenario the suite knows about but could not execute. It carries a reason, never a verdict. */
export interface NotRunScenario {
  readonly id: string;
  readonly family: ScenarioFamily;
  readonly polarity: ScenarioPolarity;
  readonly title: string;
  readonly contract: string;
  readonly executed: false;
  readonly seed: null;
  readonly steps: 0;
  readonly input: Readonly<Record<string, unknown>>;
  readonly expected: Readonly<Record<string, unknown>>;
  readonly actual: Readonly<Record<string, unknown>>;
  readonly checks: readonly ScenarioCheck[];
  readonly verdict: 'NOT_RUN';
  readonly note: string;
  readonly notRunReason: string;
}

export type SuiteScenario = ScenarioOutcome | NotRunScenario;

export function scenarioOutcome(input: ScenarioOutcomeInput): ScenarioOutcome {
  if (input.checks.length === 0) throw new Error(`Scenario ${input.id} has no checks`);
  if (!Number.isSafeInteger(input.seed) || input.seed < 0)
    throw new Error(`Scenario ${input.id} has no valid seed`);
  if (!Number.isSafeInteger(input.steps) || input.steps < 1)
    throw new Error(`Scenario ${input.id} has no executed steps`);
  const failed = input.checks.filter((check) => !check.pass);
  return Object.freeze({
    id: input.id,
    family: input.family,
    polarity: input.polarity,
    title: input.title,
    contract: input.contract,
    executed: true as const,
    seed: input.seed,
    steps: input.steps,
    input: Object.freeze({ ...input.input }),
    expected: Object.freeze({ ...input.expected }),
    actual: Object.freeze({ ...input.actual }),
    checks: Object.freeze([...input.checks]),
    verdict: failed.length === 0 ? ('PASS' as const) : ('FAIL' as const),
    note:
      failed.length === 0
        ? input.note
        : `${input.note} Eșec: ${failed.map((c) => c.name).join(', ')}`,
    notRunReason: null,
  });
}

export function notRunScenario(input: {
  readonly id: string;
  readonly family: ScenarioFamily;
  readonly polarity: ScenarioPolarity;
  readonly title: string;
  readonly contract: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly reason: string;
}): NotRunScenario {
  if (input.reason.trim().length < 32)
    throw new Error(`NOT_RUN scenario ${input.id} needs a real reason`);
  return Object.freeze({
    id: input.id,
    family: input.family,
    polarity: input.polarity,
    title: input.title,
    contract: input.contract,
    executed: false as const,
    seed: null,
    steps: 0 as const,
    input: Object.freeze({ ...input.input }),
    expected: Object.freeze({ executed: false, verdict: 'NOT_RUN' }),
    actual: Object.freeze({}),
    checks: Object.freeze([]),
    verdict: 'NOT_RUN' as const,
    note: 'Scenariul nu a fost executat; este raportat NOT_RUN cu motiv, nu bifat.',
    notRunReason: input.reason,
  });
}

/** Evidence already produced by another delivered suite, quoted instead of re-executed. */
export interface SuiteReuse {
  readonly source: string;
  readonly contract: string;
  readonly scenarioIds: readonly string[];
  readonly evidence: string;
  readonly what: string;
  readonly checks: readonly ScenarioCheck[];
  readonly verdict: 'PASS' | 'FAIL';
}

export function reuseEntry(input: Omit<SuiteReuse, 'verdict'>): SuiteReuse {
  const failed = input.checks.filter((check) => !check.pass);
  return Object.freeze({
    ...input,
    scenarioIds: Object.freeze([...input.scenarioIds]),
    checks: Object.freeze([...input.checks]),
    verdict: failed.length === 0 ? ('PASS' as const) : ('FAIL' as const),
  });
}

export interface ScenarioFamilySummary {
  readonly family: ScenarioFamily;
  readonly scenarios: number;
  readonly executed: number;
  readonly positive: number;
  readonly negative: number;
  readonly pass: number;
  readonly fail: number;
  readonly notRun: number;
}

export function familySummaries(
  scenarios: readonly SuiteScenario[],
): readonly ScenarioFamilySummary[] {
  return Object.freeze(
    scenarioFamilies.map((family) => {
      const rows = scenarios.filter((scenario) => scenario.family === family);
      return Object.freeze({
        family,
        scenarios: rows.length,
        executed: rows.filter((scenario) => scenario.executed).length,
        positive: rows.filter((scenario) => scenario.polarity === 'POSITIVE').length,
        negative: rows.filter((scenario) => scenario.polarity === 'NEGATIVE').length,
        pass: rows.filter((scenario) => scenario.verdict === 'PASS').length,
        fail: rows.filter((scenario) => scenario.verdict === 'FAIL').length,
        notRun: rows.filter((scenario) => scenario.verdict === 'NOT_RUN').length,
      });
    }),
  );
}

/** Stable SHA-256 of a JSON value; proves that two runs produced the same bytes. */
export function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export interface ScenarioSuiteReport {
  readonly version: typeof SCENARIO_SUITE_VERSION;
  readonly generatedBy: typeof SCENARIO_SUITE_GENERATED_BY;
  readonly command: typeof SCENARIO_SUITE_COMMAND;
  readonly oracleRule: string;
  readonly seeds: readonly number[];
  readonly scenarios: readonly SuiteScenario[];
  readonly reuse: readonly SuiteReuse[];
  readonly families: readonly ScenarioFamilySummary[];
  readonly summary: Readonly<{
    scenarios: number;
    executed: number;
    passed: number;
    fail: number;
    notRun: number;
    positive: number;
    negative: number;
    families: number;
    reuse: number;
    allFamiliesCovered: boolean;
    everyFamilyPositiveAndNegative: boolean;
    pass: boolean;
  }>;
  readonly reproducibility: Readonly<{
    runs: 2;
    digest: string;
    rule: string;
  }>;
  readonly limitations: readonly string[];
}

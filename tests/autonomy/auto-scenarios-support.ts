/**
 * Shared support for the 056 basic-autonomy scenario suite.
 *
 * The suite is deliberately browser-independent: every scenario drives production engines and
 * contracts directly, and the expected value of every assertion is produced by the documented
 * oracle in `auto-scenarios-oracle.ts`, never by a hand-written constant copied from a current
 * controller output.
 */
import { randomUnit, deriveOpportunitySeed } from '../../src/sessions';
import {
  getParameterDefinition,
  parsePublishableDrivingProfile,
} from '../../src/profiles/parameter-registry';
import type { DrivingProfile } from '../../src/profiles';
import { createSimulationScheduler } from '../../src/simulation/scheduling';
import type { SchedulingPorts } from '../../src/simulation/scheduling';
import type { BehaviorActor, BehaviorFacts } from '../../src/autonomy/behavior-fsm';

/** All profile keys consumed by the 044-055 autonomy policies exercised here. */
export const AUTO_PROFILE_KEYS = Object.freeze([
  'speed_delta_urban',
  'speed_delta_residential',
  'curve_lateral_accel',
  'intersection_approach_speed',
  'desired_acceleration',
  'comfort_deceleration',
  'acceleration_jerk',
  'brake_reaction_delay',
  'following_time_headway',
  'following_min_gap',
  'queue_standstill_gap',
  'following_speed_gain',
  'red_stop_probability',
  'green_start_delay',
  'red_stop_line_offset',
  'late_red_brake_threshold',
  'stop_full_probability',
  'stop_dwell_time',
  'stop_line_offset',
  'lane_change_front_gap',
  'lane_change_back_gap',
  'lane_change_speed_gain',
  'lane_change_cooldown',
  'yield_time_gap',
] as const);
export type AutoProfileKey = (typeof AUTO_PROFILE_KEYS)[number];

/**
 * Published style profile used by the suite. Values are the registry defaults unless the scenario
 * explicitly overrides a key, so the fixture cannot carry hidden calibration values.
 */
export function autoScenarioProfile(
  overrides: Readonly<Partial<Record<AutoProfileKey, number>>> = {},
  versionId = '056-auto-scenario-v1',
): DrivingProfile {
  const parameters: Record<string, number> = {},
    unitsByParameter: Record<string, string> = {},
    provenanceByParameter: Record<string, string> = {},
    evidenceByParameter: Record<string, null> = {};
  for (const key of AUTO_PROFILE_KEYS) {
    parameters[key] = overrides[key] ?? getParameterDefinition(key).default;
    unitsByParameter[key] = getParameterDefinition(key).unit;
    provenanceByParameter[key] = 'BASE';
    evidenceByParameter[key] = null;
  }
  return parsePublishableDrivingProfile({
    schemaVersion: 1,
    units: 'SI',
    profileId: `056-auto-scenarios-${versionId}`,
    versionId,
    parentVersionId: null,
    engineVersion: '056-auto-scenarios-v1',
    parameters,
    unitsByParameter,
    provenanceByParameter,
    evidenceByParameter,
    sourceSegmentIds: [],
    createdAt: '2026-10-20T00:00:00.000Z',
    checksum: 'fixture',
  });
}

export function baseFacts(profileVersionId: string): BehaviorFacts {
  return {
    version: '045-decision-facts-v1',
    profileVersionId,
    routeBlocked: false,
    stop: 'NONE',
    yield: 'NONE',
    service: 'NONE',
    laneChange: 'NONE',
  };
}

/** The published006 addressing is the only source of a policy's compliance sample. */
export function addressedComplianceSample(
  vehicleSeed: number,
  opportunityKey: string,
  sampleKey: 'red-compliance' | 'full-stop',
): number {
  return randomUnit(deriveOpportunitySeed(vehicleSeed, opportunityKey), sampleKey, 0);
}

/** Values are bounded report data; they are serialized with JSON when the runner writes evidence. */
export type ScenarioValueInput = unknown;

export interface ScenarioCheck {
  readonly name: string;
  readonly expected: ScenarioValueInput;
  readonly actual: ScenarioValueInput;
  readonly pass: boolean;
  readonly detail: string;
}
export interface ScenarioResult {
  readonly id: string;
  readonly behavior: string;
  readonly title: string;
  readonly oracle: string;
  readonly ticks: number;
  readonly checks: readonly ScenarioCheck[];
  readonly pass: boolean;
}
export interface GuardResult {
  readonly id: string;
  readonly behavior: string;
  readonly title: string;
  readonly stimulus: string;
  readonly expected: ScenarioValueInput;
  readonly actual: ScenarioValueInput;
  readonly checks: readonly ScenarioCheck[];
  readonly pass: boolean;
}
export interface AutoScenarioReport {
  readonly version: '056-auto-scenarios-v1';
  readonly oracleRule: string;
  readonly scenarios: readonly ScenarioResult[];
  readonly negativeCases: readonly GuardResult[];
  readonly mutationProbes: readonly ScenarioCheck[];
  readonly summary: Readonly<{
    scenarios: number;
    scenariosPassed: number;
    negativeCases: number;
    negativeCasesPassed: number;
    mutationProbes: number;
    mutationProbesPassed: number;
    pass: boolean;
  }>;
}

export const ORACLE_RULE =
  'Each expected value is computed at run time by an independent reference implementation of the published contract formulas and priority tables from the scenario inputs (profile values, authored facts, addressed sample, tick). No expected value is a precomputed transcript of a controller output.';

export function passCheck(
  name: string,
  expected: ScenarioValueInput,
  actual: ScenarioValueInput,
  detail: string,
): ScenarioCheck {
  return Object.freeze({ name, expected, actual, pass: true, detail });
}
export function failedCheck(
  name: string,
  expected: ScenarioValueInput,
  actual: ScenarioValueInput,
  detail: string,
): ScenarioCheck {
  return Object.freeze({ name, expected, actual, pass: false, detail });
}
export function checkEqual<T>(name: string, expected: T, actual: T, detail: string): ScenarioCheck {
  const equal = JSON.stringify(expected) === JSON.stringify(actual);
  return Object.freeze({ name, expected, actual, pass: equal, detail });
}
export function checkNumber(
  name: string,
  expected: number | null,
  actual: number | null,
  tolerance: number,
  detail: string,
): ScenarioCheck {
  if (expected === null || actual === null)
    return Object.freeze({
      name,
      expected,
      actual,
      pass: expected === actual,
      detail,
    });
  const pass =
    Number.isFinite(expected) &&
    Number.isFinite(actual) &&
    Math.abs(expected - actual) <= tolerance;
  return Object.freeze({ name, expected, actual, pass, detail });
}
export function checkTrue(
  name: string,
  condition: boolean,
  actual: ScenarioValueInput,
  detail: string,
): ScenarioCheck {
  return Object.freeze({ name, expected: true, actual, pass: condition, detail });
}

export function scenarioResult(input: Omit<ScenarioResult, 'pass'>): ScenarioResult {
  return Object.freeze({
    ...input,
    checks: Object.freeze([...input.checks]),
    pass: input.checks.every((check) => check.pass),
  });
}

export interface CadenceRun {
  readonly decisionTicks: ReadonlyMap<string, readonly number[]>;
  readonly controllerCalls: number;
  readonly physicsCalls: number;
  readonly inputCalls: number;
  dispose(): void;
}
/**
 * Real219 scheduler around the scenario decision port. Input/controller/physics remain60Hz; the
 * periodic decision cadence is the production six-phase10Hz addressing.
 */
export function runCadence(input: {
  readonly sessionId: string;
  readonly actors: readonly BehaviorActor[];
  readonly ticks: number;
  readonly beforeTick?: (tick: number) => void;
  readonly decide: (actor: BehaviorActor, decisionTick: number) => void;
}): CadenceRun {
  const scope = { sessionId: input.sessionId, worldEpoch: 0 },
    decisionTicks = new Map<string, number[]>();
  let controllerCalls = 0,
    physicsCalls = 0,
    inputCalls = 0;
  const ports: SchedulingPorts = {
    input(tick) {
      inputCalls++;
      input.beforeTick?.(tick);
    },
    decision(actor, decisionTick) {
      const list = decisionTicks.get(actor.id) ?? [];
      list.push(decisionTick);
      decisionTicks.set(actor.id, list);
      input.decide(actor, decisionTick);
    },
    controller(_actor, _tick, dtSeconds) {
      if (dtSeconds !== 1 / 60) throw new Error('056 scheduler controller dt');
      controllerCalls++;
    },
    physics(_tick, dtSeconds) {
      if (dtSeconds !== 1 / 60) throw new Error('056 scheduler physics dt');
      physicsCalls++;
    },
  };
  const engine = createSimulationScheduler({ ...scope, ports });
  engine.setActors(input.actors, scope);
  for (let tick = 1; tick <= input.ticks; tick++)
    engine.step({ ...scope, tick, dtSeconds: 1 / 60 });
  return {
    decisionTicks,
    controllerCalls,
    physicsCalls,
    inputCalls,
    dispose: () => engine.dispose(),
  };
}

export function report(
  scenarios: readonly ScenarioResult[],
  negativeCases: readonly GuardResult[],
  mutationProbes: readonly ScenarioCheck[],
): AutoScenarioReport {
  const scenariosPassed = scenarios.filter((scenario) => scenario.pass).length,
    negativeCasesPassed = negativeCases.filter((entry) => entry.pass).length,
    mutationProbesPassed = mutationProbes.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: '056-auto-scenarios-v1',
    oracleRule: ORACLE_RULE,
    scenarios: Object.freeze([...scenarios]),
    negativeCases: Object.freeze([...negativeCases]),
    mutationProbes: Object.freeze([...mutationProbes]),
    summary: Object.freeze({
      scenarios: scenarios.length,
      scenariosPassed,
      negativeCases: negativeCases.length,
      negativeCasesPassed,
      mutationProbes: mutationProbes.length,
      mutationProbesPassed,
      pass:
        scenariosPassed === scenarios.length &&
        negativeCasesPassed === negativeCases.length &&
        mutationProbesPassed === mutationProbes.length,
    }),
  });
}

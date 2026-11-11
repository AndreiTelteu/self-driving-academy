import {
  FLEET_COMFORT_TARGETS,
  FLEET_FIDELITY_TARGETS,
  FLEET_LIMITS,
  FLEET_MISSION_ID,
  FLEET_OBJECTIVE_ID,
  FLEET_SCHEMA_VERSION,
  FLEET_SERVICE_TARGETS,
  evaluateFleetMission,
  fleetChallengeBriefing,
  fleetChallengeDefinition,
  fleetComfortVerdicts,
  fleetCompositeRule,
  fleetCompositeVerdicts,
  fleetDimensionIds,
  fleetFidelityVerdicts,
  fleetMissionGate,
  fleetMissionOutcomes,
  fleetMissionReasons,
  fleetRequestStatuses,
  fleetServiceVerdicts,
} from '../../src/missions';
import type { FleetChallengeBriefing } from '../../src/missions';
import { FLEET_FIXTURE_REQUESTS, buildFleetRun } from './mission-fleet-fixture';
import type { FleetRunOptions } from './mission-fleet-fixture';

/**
 * Deterministic report for PBI 124.
 *
 * Every run is a real 065 fleet scenario driven through 059/060/061, a real 109/110 profile
 * publication, real 121 comfort windows, the real 122 city evaluation and real-shaped 007
 * `COLLISION` events. The fixture authors only the player's service plan, the comfort behaviour,
 * how many vehicles kept the old version and how many collisions happened.
 */
export const MISSION_FLEET_REPORT_VERSION = '124-mission-fleet-report-v1' as const;

export interface MissionFleetReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean | null;
  readonly actual: string | number | boolean | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface MissionFleetReportWindow {
  readonly startTick: number;
  readonly endTick: number;
  readonly durationTicks: number;
  readonly endedAtTick: number;
  readonly complete: boolean;
}

export interface MissionFleetReportBriefing {
  readonly status: string;
  readonly definitionVersion: string;
  readonly incidentBudget: number;
  readonly compositeRuleId: string;
  readonly minimumServedRides: number;
  readonly minimumServedFraction: number;
  readonly maximumLateRides: number;
  readonly comfortMinimumRides: number;
  readonly comfortMaxAccelerationMps2: number;
  readonly comfortMaxJerkMps3: number;
  readonly fidelityMatchedFraction: number;
  readonly fidelityVerdict: string;
  readonly conditions: readonly string[];
  readonly evaluatedRides: number;
  readonly evaluatedIncidents: number;
}

export interface MissionFleetReportRun {
  readonly name: string;
  readonly profileId: string;
  readonly profileVersionId: string;
  readonly attempt: number;
  readonly instanceId: string;
  readonly window: MissionFleetReportWindow;
  readonly briefing: MissionFleetReportBriefing;
  readonly service: Readonly<{
    verdict: string;
    requests: number;
    served: number;
    failed: number;
    cancelled: number;
    pending: number;
    late: number;
    servedFraction: number | null;
    plannedSeconds: number | null;
    deliveredSeconds: number | null;
    missedSeconds: number | null;
    allServedRows: boolean;
  }>;
  readonly comfort: Readonly<{
    verdict: string;
    rides: number;
    passed: number;
    failed: number;
    peakAccelerationMps2: number | null;
    peakJerkMps3: number | null;
  }>;
  readonly fidelity: Readonly<{
    verdict: string;
    cityVerdict: string;
    evaluatedVehicles: number;
    matchedCells: number;
    totalCells: number;
    matchedFraction: number | null;
  }>;
  readonly incidents: Readonly<{
    limit: number;
    used: number;
    remaining: number;
    withinBudget: boolean;
    duplicates: number;
  }>;
  readonly composite: Readonly<{
    verdict: string;
    dimensionVerdicts: readonly string[];
    failingDimensions: readonly string[];
  }>;
  readonly outcome: string;
  readonly reasons: readonly string[];
  readonly gate: string;
  readonly profileWrites: number;
  readonly learningJobs: number;
  readonly deterministic: boolean;
  readonly briefingMatchesPreStart: boolean;
}

export interface MissionFleetReport {
  readonly version: typeof MISSION_FLEET_REPORT_VERSION;
  readonly contract: Readonly<{
    missionId: string;
    schema: string;
    objectiveId: string;
    windowTicks: number;
    incidentBudget: number;
    serviceTargets: readonly string[];
    comfortThresholds: readonly string[];
    comfortMinimumRides: number;
    fidelityTarget: string;
    compositeRule: string;
    compositeVerdicts: readonly string[];
    dimensions: readonly string[];
    serviceVerdicts: readonly string[];
    comfortVerdicts: readonly string[];
    fidelityVerdicts: readonly string[];
    requestStatuses: readonly string[];
    reasons: readonly string[];
    outcomes: readonly string[];
  }>;
  readonly briefing: Readonly<{
    conditions: readonly string[];
    evaluated: readonly [number, number];
  }>;
  readonly runs: readonly MissionFleetReportRun[];
  readonly checks: readonly MissionFleetReportCheck[];
  readonly summary: Readonly<{
    runs: number;
    checks: number;
    passed: number;
    pass: boolean;
  }>;
}

function check(
  name: string,
  expected: string | number | boolean | null,
  actual: string | number | boolean | null,
  detail: string,
): MissionFleetReportCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function round(value: number | null, digits = 6): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function briefingFacts(briefing: FleetChallengeBriefing): MissionFleetReportBriefing {
  return Object.freeze({
    status: briefing.status,
    definitionVersion: briefing.definitionVersion,
    incidentBudget: briefing.incidentBudget,
    compositeRuleId: briefing.compositeRule.id,
    minimumServedRides: briefing.serviceTargets.minimumServedRides,
    minimumServedFraction: briefing.serviceTargets.minimumServedFraction,
    maximumLateRides: briefing.serviceTargets.maximumLateRides,
    comfortMinimumRides: briefing.comfortTargets.minimumRides,
    comfortMaxAccelerationMps2: briefing.comfortTargets.thresholds.maxAccelerationMps2,
    comfortMaxJerkMps3: briefing.comfortTargets.thresholds.maxJerkMps3,
    fidelityMatchedFraction: briefing.fidelityTargets.minimumMatchedFraction,
    fidelityVerdict: briefing.fidelityTargets.requiredVerdict,
    conditions: Object.freeze(briefing.conditions.map((condition) => condition.statement)),
    evaluatedRides: briefing.evaluated.rides,
    evaluatedIncidents: briefing.evaluated.incidents,
  });
}

async function driveRun(name: string, options: FleetRunOptions): Promise<MissionFleetReportRun> {
  const run = buildFleetRun(options);
  try {
    const { result } = run;
    const again = evaluateFleetMission(run.input);
    const preStart = fleetChallengeBriefing({
      definition: run.input.definition,
      difficulty: run.input.difficulty,
      startTick: run.input.startTick,
      profile: run.input.profile,
    });
    return Object.freeze({
      name,
      profileId: result.profile.profileId,
      profileVersionId: result.profile.versionId,
      attempt: result.attempt,
      instanceId: result.instanceId,
      window: Object.freeze({
        startTick: result.evaluationWindow.startTick,
        endTick: result.evaluationWindow.endTick,
        durationTicks: result.evaluationWindow.durationTicks,
        endedAtTick: result.evaluationWindow.endedAtTick,
        complete: result.evaluationWindow.complete,
      }),
      briefing: briefingFacts(result.briefing),
      service: Object.freeze({
        verdict: result.service.verdict,
        requests: result.service.requests,
        served: result.service.served,
        failed: result.service.failed,
        cancelled: result.service.cancelled,
        pending: result.service.pending,
        late: result.service.late,
        servedFraction: round(result.service.servedFraction),
        plannedSeconds: round(result.service.plannedSeconds),
        deliveredSeconds: round(result.service.deliveredSeconds),
        missedSeconds: round(result.service.missedSeconds),
        allServedRows: result.service.rows.every((row) => row.status === 'SERVED'),
      }),
      comfort: Object.freeze({
        verdict: result.comfort.verdict,
        rides: result.comfort.rides,
        passed: result.comfort.passed,
        failed: result.comfort.failed,
        peakAccelerationMps2: round(result.comfort.peakAccelerationMps2),
        peakJerkMps3: round(result.comfort.peakJerkMps3),
      }),
      fidelity: Object.freeze({
        verdict: result.fidelity.verdict,
        cityVerdict: result.fidelity.cityVerdict,
        evaluatedVehicles: result.fidelity.evaluatedVehicles,
        matchedCells: result.fidelity.matchedCells,
        totalCells: result.fidelity.totalCells,
        matchedFraction: round(result.fidelity.matchedFraction),
      }),
      incidents: Object.freeze({
        limit: result.incidents.limit,
        used: result.incidents.used,
        remaining: result.incidents.remaining,
        withinBudget: result.incidents.withinBudget,
        duplicates: result.incidents.duplicates,
      }),
      composite: Object.freeze({
        verdict: result.composite.verdict,
        dimensionVerdicts: Object.freeze([
          `SERVICE:${result.service.verdict}`,
          `COMFORT:${result.comfort.verdict}`,
          `FIDELITY:${result.fidelity.verdict}`,
          `INCIDENTS:${result.incidents.withinBudget ? 'WITHIN_BUDGET' : 'EXCEEDED'}`,
          `WINDOW:${result.evaluationWindow.complete ? 'COMPLETE' : 'INCOMPLETE'}`,
        ]),
        failingDimensions: Object.freeze([...result.composite.failingDimensions]),
      }),
      outcome: result.outcome,
      reasons: Object.freeze([...result.reasons]),
      gate: fleetMissionGate(result).outcome,
      profileWrites: result.profileWrites,
      learningJobs: result.learningJobs,
      deterministic: JSON.stringify(result) === JSON.stringify(again),
      briefingMatchesPreStart: JSON.stringify(preStart) === JSON.stringify(result.briefing),
    });
  } finally {
    run.dispose();
  }
}

function equalLists(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

export async function runMissionFleetReport(): Promise<MissionFleetReport> {
  const definition = fleetChallengeDefinition();
  const success = await driveRun('success', {});
  const failure = await driveRun('service-failure', {
    service: { completed: 2, failed: 30, cancelled: 0 },
    comfort: 'FAIL',
  });
  const replay = await driveRun('replay-other-profile', { profile: 'V2', staleVehicles: 6 });
  const budget = await driveRun('incident-budget', { incidents: 1 });
  const incomplete = await driveRun('incomplete-window', {
    service: { completed: 2, failed: 0, cancelled: 0 },
  });
  const runs = [success, failure, replay, budget, incomplete];

  const preStart = fleetChallengeBriefing({
    definition,
    difficulty: 'NORMAL',
    startTick: 0,
    profile: { profileId: 'city:common', versionId: 'fleet-124-v1' },
  });
  const checks: MissionFleetReportCheck[] = [];

  checks.push(
    check('contract-schema', FLEET_SCHEMA_VERSION, '124-mission-fleet-v1', 'mission schema'),
    check('mission-id', FLEET_MISSION_ID, 'campaign-8-fleet-challenge', '116 campaign stage'),
    check('objective-id', FLEET_OBJECTIVE_ID, 'fleet-clean-dropoffs', 'the authored 116 objective'),
    check('window-ticks', 21_600, definition.windowTicks, 'the 116 evaluation window'),
    check('incident-budget', 0, definition.incidentBudget, 'the 116 numeric incident budget'),
    check('limit-taxis', 70, FLEET_LIMITS.taxis, 'the 057 fleet capacity'),
    check(
      'limit-window',
      5_184_000,
      FLEET_LIMITS.windowTicks,
      'the upper bound of one evaluation window (24 h at 60 Hz)',
    ),
    check(
      'service-targets',
      '1/0',
      `${FLEET_SERVICE_TARGETS.minimumServedFraction}/${FLEET_SERVICE_TARGETS.maximumLateRides}`,
      'every request served and no ride after its promise',
    ),
    check(
      'comfort-thresholds',
      '2/2',
      `${preStart.comfortTargets.thresholds.maxAccelerationMps2}/${preStart.comfortTargets.thresholds.maxJerkMps3}`,
      'the 121 acceleration and jerk thresholds shown to the player',
    ),
    check(
      'comfort-targets',
      `${FLEET_COMFORT_TARGETS.minimumRides}/0`,
      `${preStart.comfortTargets.minimumRides}/${preStart.comfortTargets.maximumFailedRides}`,
      'at least one evaluated passenger ride and no failure',
    ),
    check(
      'fidelity-target',
      '1/EXACT',
      `${FLEET_FIDELITY_TARGETS.minimumMatchedFraction}/${FLEET_FIDELITY_TARGETS.requiredVerdict}`,
      'the 122 fleet must reproduce the profile exactly',
    ),
    check(
      'composite-rule',
      'ALL_DIMENSIONS_WITHIN_BUDGET',
      fleetCompositeRule.id,
      'the explicit conjunction, never a weighted score',
    ),
    check(
      'composite-verdicts',
      'SUCCESS,FAILURE,INCOMPLETE',
      fleetCompositeVerdicts.join(','),
      'closed composite vocabulary',
    ),
    check(
      'dimensions',
      'SERVICE,COMFORT,FIDELITY,INCIDENTS,WINDOW',
      fleetDimensionIds.join(','),
      'each dimension is reported separately',
    ),
    check(
      'service-verdicts',
      'MET,BELOW_TARGET',
      fleetServiceVerdicts.join(','),
      'closed service verdicts',
    ),
    check(
      'comfort-verdicts',
      'PASSED,FAILED,NOT_EVALUATED',
      fleetComfortVerdicts.join(','),
      'closed comfort verdicts',
    ),
    check(
      'fidelity-verdicts',
      'MET,BELOW_TARGET',
      fleetFidelityVerdicts.join(','),
      'closed fidelity verdicts',
    ),
    check(
      'request-statuses',
      'SERVED,FAILED,CANCELLED,PENDING',
      fleetRequestStatuses.join(','),
      'closed request statuses',
    ),
    check(
      'reasons',
      'SERVICE_BELOW_TARGET,COMFORT_FAILED,COMFORT_NOT_EVALUATED,FIDELITY_BELOW_TARGET,INCIDENT_BUDGET_EXCEEDED,WINDOW_INCOMPLETE',
      fleetMissionReasons.join(','),
      'every failure has a closed reason',
    ),
    check(
      'outcomes',
      'PROGRESS,NO_PROGRESS',
      fleetMissionOutcomes.join(','),
      'closed gate outcomes',
    ),
    check('briefing-status', 'BEFORE_START', preStart.status, 'the briefing exists before start'),
    check('briefing-evaluated-rides', 0, preStart.evaluated.rides, 'no ride is in the briefing'),
    check(
      'briefing-evaluated-incidents',
      0,
      preStart.evaluated.incidents,
      'no incident is in the briefing',
    ),
    check(
      'briefing-window',
      21_600,
      preStart.evaluationWindow.durationTicks,
      'the shown window is the 116 duration',
    ),
    check(
      'briefing-budget',
      definition.incidentBudget,
      preStart.incidentBudget,
      'the shown budget is the 116 budget',
    ),
    check(
      'briefing-conditions',
      'SERVICE,COMFORT,FIDELITY,INCIDENTS',
      preStart.conditions.map((condition) => condition.dimension).join(','),
      'every measured dimension is shown before start',
    ),
    check(
      'briefing-composite-rule',
      'ALL_DIMENSIONS_WITHIN_BUDGET',
      preStart.compositeRule.id,
      'the composition rule is shown before start',
    ),
    check(
      'briefing-embedded-everywhere',
      true,
      runs.every((run) => run.briefingMatchesPreStart),
      'every result is judged against the pre-start briefing',
    ),
    check(
      'success-requests',
      FLEET_FIXTURE_REQUESTS,
      success.service.requests,
      'the whole real 059 schedule is evaluated',
    ),
    check('success-served', FLEET_FIXTURE_REQUESTS, success.service.served, 'every request served'),
    check('success-pending', 0, success.service.pending, 'nothing left pending'),
    check('success-fraction', 1, success.service.servedFraction, 'full service'),
    check('success-late', 0, success.service.late, 'no ride after its promise'),
    check('success-service', 'MET', success.service.verdict, 'the service target is met'),
    check(
      'success-planned-equals-delivered',
      true,
      success.service.plannedSeconds === success.service.deliveredSeconds,
      'planned and delivered service seconds agree',
    ),
    check('success-comfort', 'PASSED', success.comfort.verdict, 'three real 121 rides pass'),
    check('success-comfort-rides', 3, success.comfort.rides, 'three passenger rides evaluated'),
    check(
      'success-fidelity',
      'EXACT',
      success.fidelity.cityVerdict,
      'the fleet copies the profile',
    ),
    check(
      'success-fidelity-verdict',
      'MET',
      success.fidelity.verdict,
      'the fidelity target is met',
    ),
    check('success-incidents', 0, success.incidents.used, 'no collision inside the window'),
    check(
      'success-composite',
      'SUCCESS',
      success.composite.verdict,
      'the explicit conjunction passes',
    ),
    check('success-outcome', 'PROGRESS', success.outcome, 'the campaign gate progresses'),
    check('success-gate', 'PROGRESS', success.gate, 'the gate mirrors the composite verdict'),
    check(
      'success-window-complete',
      true,
      success.window.complete,
      'the early end is legitimate because no request stayed pending',
    ),
    check(
      'success-ended-before-window',
      true,
      success.window.endedAtTick < success.window.endTick,
      'the run ended early, not by window expiry',
    ),
    check('failure-served', 2, failure.service.served, 'only two rides were delivered'),
    check('failure-failed', 30, failure.service.failed, 'thirty rides failed'),
    check('failure-fraction', 0.0625, failure.service.servedFraction, '2 of 32 requests served'),
    check('failure-service', 'BELOW_TARGET', failure.service.verdict, 'the service target fails'),
    check('failure-comfort', 'FAILED', failure.comfort.verdict, 'the comfort target fails'),
    check(
      'failure-fidelity-still-met',
      'MET',
      failure.fidelity.verdict,
      'the passing dimension is reported, not hidden',
    ),
    check('failure-composite', 'FAILURE', failure.composite.verdict, 'the composite verdict fails'),
    check(
      'failure-failing-dimensions',
      'SERVICE,COMFORT',
      failure.composite.failingDimensions.join(','),
      'both failing dimensions are named',
    ),
    check(
      'failure-reasons',
      'SERVICE_BELOW_TARGET,COMFORT_FAILED',
      failure.reasons.join(','),
      'the reasons are explicit, not a score',
    ),
    check('failure-outcome', 'NO_PROGRESS', failure.outcome, 'no progress on failure'),
    check('replay-attempt', 2, replay.attempt, 'the replay is the next attempt'),
    check(
      'replay-profile',
      true,
      replay.profileVersionId !== success.profileVersionId,
      'the replay uses another profile version',
    ),
    check(
      'replay-instance',
      true,
      replay.instanceId !== success.instanceId,
      'the replay has its own stable instance identity',
    ),
    check(
      'replay-same-window',
      true,
      replay.window.durationTicks === success.window.durationTicks &&
        replay.window.endTick === success.window.endTick,
      'the evaluation window is unchanged by the replay',
    ),
    check(
      'replay-same-conditions',
      true,
      equalLists(replay.briefing.conditions, success.briefing.conditions),
      'the shown conditions are unchanged by the replay',
    ),
    check(
      'replay-fidelity',
      'PARTIAL',
      replay.fidelity.cityVerdict,
      'six vehicles kept the old version',
    ),
    check(
      'replay-fidelity-verdict',
      'BELOW_TARGET',
      replay.fidelity.verdict,
      'the fidelity target fails on a partial fleet',
    ),
    check(
      'replay-failing-dimensions',
      'FIDELITY',
      replay.composite.failingDimensions.join(','),
      'only the fidelity dimension fails',
    ),
    check(
      'replay-composite',
      'FAILURE',
      replay.composite.verdict,
      'the replay is judged on its own',
    ),
    check('budget-limit', 0, budget.incidents.limit, 'the numeric 116 budget'),
    check('budget-used', 1, budget.incidents.used, 'one real 007 collision counted'),
    check('budget-remaining', -1, budget.incidents.remaining, 'the budget is exceeded'),
    check('budget-within', false, budget.incidents.withinBudget, 'the budget target fails'),
    check(
      'budget-failing-dimensions',
      'INCIDENTS',
      budget.composite.failingDimensions.join(','),
      'only the incident dimension fails',
    ),
    check(
      'budget-other-dimensions-pass',
      true,
      budget.service.verdict === 'MET' &&
        budget.comfort.verdict === 'PASSED' &&
        budget.fidelity.verdict === 'MET',
      'the passing dimensions stay visible',
    ),
    check('incomplete-window', false, incomplete.window.complete, 'thirty requests stayed pending'),
    check('incomplete-pending', 30, incomplete.service.pending, 'the unfinished work is reported'),
    check(
      'incomplete-verdict',
      'INCOMPLETE',
      incomplete.composite.verdict,
      'no success is claimed',
    ),
    check(
      'incomplete-failing-dimensions',
      'WINDOW,SERVICE',
      incomplete.composite.failingDimensions.join(','),
      'both the window and the service fail',
    ),
    check(
      'incomplete-reasons',
      'WINDOW_INCOMPLETE,SERVICE_BELOW_TARGET',
      incomplete.reasons.join(','),
      'the reasons name the unfinished window',
    ),
    check(
      'structural-read-only',
      0,
      runs.reduce((total, run) => total + run.profileWrites + run.learningJobs, 0),
      'the mission never writes a profile or queues a learning job',
    ),
    check(
      'deterministic',
      true,
      runs.every((run) => run.deterministic),
      'evaluating the same run twice produces the identical bytes',
    ),
  );

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: MISSION_FLEET_REPORT_VERSION,
    contract: Object.freeze({
      missionId: FLEET_MISSION_ID,
      schema: FLEET_SCHEMA_VERSION,
      objectiveId: FLEET_OBJECTIVE_ID,
      windowTicks: definition.windowTicks ?? 0,
      incidentBudget: definition.incidentBudget ?? 0,
      serviceTargets: Object.freeze([
        `minimumServedRides=${preStart.serviceTargets.minimumServedRides}`,
        `minimumServedFraction=${preStart.serviceTargets.minimumServedFraction}`,
        `maximumLateRides=${preStart.serviceTargets.maximumLateRides}`,
      ]),
      comfortThresholds: Object.freeze([
        `maxAccelerationMps2=${preStart.comfortTargets.thresholds.maxAccelerationMps2}`,
        `maxJerkMps3=${preStart.comfortTargets.thresholds.maxJerkMps3}`,
      ]),
      comfortMinimumRides: preStart.comfortTargets.minimumRides,
      fidelityTarget: `${preStart.fidelityTargets.minimumMatchedFraction}/${preStart.fidelityTargets.requiredVerdict}`,
      compositeRule: fleetCompositeRule.id,
      compositeVerdicts: Object.freeze([...fleetCompositeVerdicts]),
      dimensions: Object.freeze([...fleetDimensionIds]),
      serviceVerdicts: Object.freeze([...fleetServiceVerdicts]),
      comfortVerdicts: Object.freeze([...fleetComfortVerdicts]),
      fidelityVerdicts: Object.freeze([...fleetFidelityVerdicts]),
      requestStatuses: Object.freeze([...fleetRequestStatuses]),
      reasons: Object.freeze([...fleetMissionReasons]),
      outcomes: Object.freeze([...fleetMissionOutcomes]),
    }),
    briefing: Object.freeze({
      conditions: Object.freeze(preStart.conditions.map((condition) => condition.statement)),
      evaluated: Object.freeze([preStart.evaluated.rides, preStart.evaluated.incidents] as const),
    }),
    runs: Object.freeze(runs),
    checks: Object.freeze(checks),
    summary: Object.freeze({
      runs: runs.length,
      checks: checks.length,
      passed,
      pass: passed === checks.length,
    }),
  });
}

const BACKTICK = '`';

function code(value: string | number | boolean | null): string {
  return `${BACKTICK}${String(value)}${BACKTICK}`;
}

function cell(value: string | number | boolean | null): string {
  return value === null ? '—' : String(value).replaceAll('|', '\\|');
}

export function missionFleetReportMarkdown(report: MissionFleetReport): string {
  const lines: string[] = [];
  lines.push(
    '# 124 "final service challenge" report',
    '',
    'Machine-readable transcript: [report.json](report.json). Generated by ' +
      code('npm run missions:fleet') +
      '; no wall-clock value, random source or browser state participates. Version: ' +
      code(report.version) +
      '.',
    '',
    '## Pre-start briefing',
    '',
    'Every condition, target, window and the numeric incident budget is fixed before the first',
    'ride; the evaluation embeds this same object. The briefing cannot carry an outcome field.',
    '',
    '| Condition |',
    '| --- |',
    ...report.briefing.conditions.map((condition) => `| ${condition.replaceAll('|', '\\|')} |`),
    '',
    `Evaluated fields in the briefing: rides ${code(report.briefing.evaluated[0])}, incidents ${code(
      report.briefing.evaluated[1],
    )}.`,
    '',
    '## Runs',
    '',
    '| Run | Profile | Attempt | Service | Comfort | Fidelity | Incidents | Composite | Outcome |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...report.runs.map(
      (run) =>
        `| ${run.name} | ${code(run.profileVersionId)} | ${run.attempt} | ${code(run.service.verdict)} ${run.service.served}/${run.service.requests} | ${code(run.comfort.verdict)} ${run.comfort.passed}/${run.comfort.rides} | ${code(run.fidelity.verdict)} ${code(run.fidelity.cityVerdict)} ${String(run.fidelity.matchedCells)}/${String(run.fidelity.totalCells)} | ${run.incidents.used}/${run.incidents.limit} | ${code(run.composite.verdict)} | ${code(run.outcome)} |`,
    ),
    '',
    '## Dimensions kept separate',
    '',
    '| Run | Dimension verdicts | Failing dimensions | Reasons |',
    '| --- | --- | --- | --- |',
    ...report.runs.map(
      (run) =>
        `| ${run.name} | ${run.composite.dimensionVerdicts.join(', ')} | ${run.composite.failingDimensions.join(', ') || '—'} | ${run.reasons.join(', ') || '—'} |`,
    ),
    '',
    'A passing dimension is never folded into a failing one: the composite verdict is an explicit',
    'conjunction of the reported verdicts plus the window state, so no dimension can hide behind a',
    'score.',
    '',
    '## Window and numeric detail',
    '',
    '| Run | Start | End | Ended | Complete | Planned s | Delivered s | Missed s | Late |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...report.runs.map(
      (run) =>
        `| ${run.name} | ${run.window.startTick} | ${run.window.endTick} | ${run.window.endedAtTick} | ${run.window.complete ? 'yes' : 'no'} | ${cell(run.service.plannedSeconds)} | ${cell(run.service.deliveredSeconds)} | ${cell(run.service.missedSeconds)} | ${run.service.late} |`,
    ),
    '',
    '## Checks',
    '',
    '| Check | Expected | Actual | Result | Detail |',
    '| --- | --- | --- | --- | --- |',
    ...report.checks.map(
      (entry) =>
        `| ${entry.name} | ${cell(entry.expected)} | ${cell(entry.actual)} | ${
          entry.pass ? 'PASS' : 'FAIL'
        } | ${entry.detail} |`,
    ),
    '',
    '## Summary',
    '',
    '- Runs: ' + String(report.summary.runs),
    '- Checks: ' + String(report.summary.passed) + '/' + String(report.summary.checks),
    '- Overall: ' + (report.summary.pass ? 'PASS' : 'FAIL'),
    '',
    '## Limitations',
    '',
    '- Deterministic Node run: the service plan, the fleet, the profile activation, the comfort',
    '  windows, the 122 fidelity and the 007 collisions are real contracts, but there is no browser,',
    '  renderer or human session.',
    '- The authored part is the player behaviour: which requests complete, fail, are cancelled or',
    '  stay pending, the comfort profile, how many vehicles kept the old version and how many real',
    '  collisions happened.',
    '- The mission is a domain contract: it has no HUD, panel or `main.ts` composition.',
    '- No FPS, frame, GPU or hardware measurement is claimed.',
    '',
  );
  return lines.join('\n');
}

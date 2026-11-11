import {
  CITY_ATTRIBUTABLE_FAILURE_REASONS,
  CITY_LIMITS,
  CITY_MISSION_ID,
  CITY_SCHEMA_VERSION,
  cityConsequenceVerdicts,
  cityFidelityVerdicts,
  cityMissionGate,
  cityMissionOutcomes,
  cityMissionReasons,
  evaluateCityMission,
} from '../../src/missions';
import type { CityMissionInput, CityMissionResult } from '../../src/missions';
import { CITY_FIXTURE_VISIBLE_SLOTS, buildCityRun } from './mission-city-fixture';
import type { CityRun, CityRunKind } from './mission-city-fixture';

/**
 * Deterministic report for PBI 122.
 *
 * The fleet, the profile versions, the activation and every ride are produced by the delivered
 * 057/059/060/061/109/110 contracts. The fixture authors only which taxi takes a ride and whether
 * that ride completes or ends damaged, exactly like the 115 declared encounter plan.
 */
export const MISSION_CITY_REPORT_VERSION = '122-mission-city-report-v1' as const;

export interface MissionCityReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean | null;
  readonly actual: string | number | boolean | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface MissionCityReportVehicle {
  readonly vehicleId: string;
  readonly rides: number;
  readonly completedRides: number;
  readonly attributableFailures: number;
  readonly exposureSeconds: number;
}

export interface MissionCityReportRun {
  readonly name: string;
  readonly plan: readonly string[];
  readonly fidelity: string;
  readonly matchedVehicles: number;
  readonly evaluatedVehicles: number;
  readonly matchedFraction: number | null;
  readonly activeVersionVehicles: number;
  readonly otherVersions: readonly { readonly versionId: string; readonly vehicles: number }[];
  readonly invisibleFraction: number | null;
  readonly invisibleSeconds: number;
  readonly totalSeconds: number;
  readonly totalRides: number;
  readonly visibleRides: number;
  readonly invisibleRides: number;
  readonly servedVehicles: number;
  readonly invisibleServedTaxis: number;
  readonly consequence: string;
  readonly completedRides: number;
  readonly failedRides: number;
  readonly cancelledRides: number;
  readonly attributableFailures: number;
  readonly visibleAttributableFailures: number;
  readonly invisibleAttributableFailures: number;
  readonly harmRate: number | null;
  readonly deliveredSeconds: number;
  readonly missedSeconds: number;
  readonly failureReasons: readonly { readonly reason: string; readonly count: number }[];
  readonly gate: string;
  readonly invisibleTaxis: readonly MissionCityReportVehicle[];
}

export interface MissionCityReport {
  readonly version: typeof MISSION_CITY_REPORT_VERSION;
  readonly contract: Readonly<{
    missionId: string;
    schema: string;
    vehicles: number;
    rides: number;
    parametersPerVersion: number;
    windowTicks: number;
    fidelityVerdicts: readonly string[];
    consequenceVerdicts: readonly string[];
    outcomes: readonly string[];
    reasons: readonly string[];
    attributableFailures: readonly string[];
    visibleSlots: readonly number[];
  }>;
  readonly runs: readonly MissionCityReportRun[];
  readonly checks: readonly MissionCityReportCheck[];
  readonly summary: Readonly<{
    runs: number;
    checks: number;
    passed: number;
    pass: boolean;
  }>;
}

interface MutableInput {
  profile: { profileId: string };
  versions: { profileId: string }[];
  fleet: { vehicles: unknown[] };
  activation: { versionId: string };
}

function mutable(input: CityMissionInput): MutableInput {
  return JSON.parse(JSON.stringify(input)) as MutableInput;
}

function refuses(input: unknown): boolean {
  try {
    evaluateCityMission(input);
    return false;
  } catch {
    return true;
  }
}

function check(
  name: string,
  expected: string | number | boolean | null,
  actual: string | number | boolean | null,
  detail: string,
): MissionCityReportCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function round(value: number | null, digits = 6): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function planLabel(run: CityRun): readonly string[] {
  return run.ridePlan.map((entry) => `slot-${entry.slot}:${entry.outcome}`);
}

function invisibleTaxis(result: CityMissionResult): readonly MissionCityReportVehicle[] {
  return Object.freeze(
    result.vehicles
      .filter(
        (vehicle) => !vehicle.visible && vehicle.driverKind === 'TAXI' && vehicle.outcome.rides > 0,
      )
      .map((vehicle) =>
        Object.freeze({
          vehicleId: vehicle.vehicleId,
          rides: vehicle.outcome.rides,
          completedRides: vehicle.outcome.completedRides,
          attributableFailures: vehicle.outcome.attributableFailures,
          exposureSeconds: round(vehicle.outcome.exposureSeconds) ?? 0,
        }),
      ),
  );
}

function summarize(run: CityRun, result: CityMissionResult): MissionCityReportRun {
  return Object.freeze({
    name: run.kind.toLowerCase(),
    plan: Object.freeze(planLabel(run)),
    fidelity: result.fidelity.verdict,
    matchedVehicles: result.fidelity.matchedVehicles,
    evaluatedVehicles: result.fidelity.evaluatedVehicles,
    matchedFraction: round(result.fidelity.matchedFraction),
    activeVersionVehicles: result.fidelity.versionAdoption.activeVersionVehicles,
    otherVersions: Object.freeze(
      result.fidelity.versionAdoption.otherVersions.map((entry) =>
        Object.freeze({ versionId: entry.versionId, vehicles: entry.vehicles }),
      ),
    ),
    invisibleFraction: round(result.exposure.invisibleFraction),
    invisibleSeconds: round(result.exposure.invisibleSeconds) ?? 0,
    totalSeconds: round(result.exposure.totalSeconds) ?? 0,
    totalRides: result.exposure.totalRides,
    visibleRides: result.exposure.visibleRides,
    invisibleRides: result.exposure.invisibleRides,
    servedVehicles: result.exposure.servedVehicles,
    invisibleServedTaxis: result.exposure.invisibleServedTaxis,
    consequence: result.consequences.verdict,
    completedRides: result.consequences.completedRides,
    failedRides: result.consequences.failedRides,
    cancelledRides: result.consequences.cancelledRides,
    attributableFailures: result.consequences.attributableFailures,
    visibleAttributableFailures: result.consequences.visible.attributableFailures,
    invisibleAttributableFailures: result.consequences.invisible.attributableFailures,
    harmRate: round(result.consequences.harmRate),
    deliveredSeconds: round(result.consequences.deliveredSeconds) ?? 0,
    missedSeconds: round(result.consequences.missedSeconds) ?? 0,
    failureReasons: Object.freeze(
      result.consequences.failureReasons.map((entry) =>
        Object.freeze({ reason: entry.reason, count: entry.count }),
      ),
    ),
    gate: cityMissionGate(result).outcome,
    invisibleTaxis: invisibleTaxis(result),
  });
}

function buildRun(kind: CityRunKind): {
  readonly run: CityRun;
  readonly result: CityMissionResult;
  readonly summary: MissionCityReportRun;
} {
  const run = buildCityRun(kind);
  const result = evaluateCityMission(run.input);
  return { run, result, summary: summarize(run, result) };
}

export function runMissionCityReport(): MissionCityReport {
  const checks: MissionCityReportCheck[] = [];
  const prudent = buildRun('PRUDENT');
  const risky = buildRun('RISKY');
  const stale = buildRun('STALE');
  const runs = [prudent.summary, risky.summary, stale.summary];

  try {
    checks.push(
      check('contract-schema', CITY_SCHEMA_VERSION, '122-mission-city-v1', 'mission schema'),
      check('mission-id', CITY_MISSION_ID, 'campaign-6-city-copies-you', '116 campaign stage'),
      check('fleet-capacity', 70, CITY_LIMITS.vehicles, '057 fleet capacity'),
      check('ride-capacity', 1024, CITY_LIMITS.rides, '059 request capacity'),
      check('parameter-capacity', 96, CITY_LIMITS.parametersPerVersion, '092 values per version'),
      check(
        'window-ticks',
        5_184_000,
        CITY_LIMITS.windowTicks,
        'one day at the authoritative 60 Hz tick',
      ),
      check(
        'fidelity-verdicts',
        'EXACT,PARTIAL,NONE',
        cityFidelityVerdicts.join(','),
        'closed imitation verdicts',
      ),
      check(
        'consequence-verdicts',
        'CLEAN,HARMFUL,NO_SERVICE',
        cityConsequenceVerdicts.join(','),
        'closed world verdicts',
      ),
      check('outcomes', 'PROGRESS,NO_PROGRESS', cityMissionOutcomes.join(','), 'closed gate'),
      check('reasons', 'NO_RIDES', cityMissionReasons.join(','), 'closed gate refusal'),
      check(
        'attributable-failures',
        'TAXI_DAMAGED,TAXI_BLOCKED',
        CITY_ATTRIBUTABLE_FAILURE_REASONS.join(','),
        'real 061 failure reasons the profile is held responsible for',
      ),
      check(
        'visible-observation-set',
        '3',
        String(CITY_FIXTURE_VISIBLE_SLOTS.length),
        'camera set of the simulated run',
      ),
    );

    checks.push(
      check(
        'prudent-evaluated-fleet',
        40,
        prudent.result.coverage.evaluatedVehicles,
        '20 taxis and 20 civilians from the 057 registry',
      ),
      check('prudent-covered-taxis', 20, prudent.result.coverage.taxis, '057 taxi population'),
      check(
        'prudent-covered-civilians',
        20,
        prudent.result.coverage.civilians,
        '057 civilian population',
      ),
      check(
        'prudent-visible-vehicles',
        3,
        prudent.result.observation.visibleVehicles,
        'only the camera set is visible',
      ),
      check(
        'prudent-invisible-vehicles',
        37,
        prudent.result.observation.invisibleVehicles,
        'every other vehicle is still evaluated',
      ),
      check('prudent-total-rides', 8, prudent.result.exposure.totalRides, 'real 061 terminals'),
      check('prudent-visible-rides', 3, prudent.summary.visibleRides, 'rides by visible taxis'),
      check(
        'prudent-invisible-rides',
        5,
        prudent.summary.invisibleRides,
        'rides by invisible taxis',
      ),
      check(
        'prudent-invisible-taxis',
        5,
        prudent.result.exposure.invisibleServedTaxis,
        'invisible taxis that actually served rides',
      ),
      check(
        'prudent-invisible-exposure',
        true,
        prudent.result.exposure.invisibleSeconds > 0,
        'invisible service seconds are reported, not dropped',
      ),
      check(
        'prudent-invisible-fraction',
        round(prudent.result.exposure.invisibleSeconds / prudent.result.exposure.totalSeconds),
        prudent.summary.invisibleFraction,
        'invisibleSeconds / totalSeconds',
      ),
      check(
        'prudent-fidelity',
        'EXACT',
        prudent.result.fidelity.verdict,
        'whole fleet on the profile',
      ),
      check('prudent-matched-vehicles', 40, prudent.result.fidelity.matchedVehicles, 'all values'),
      check('prudent-consequence', 'CLEAN', prudent.result.consequences.verdict, 'no harm'),
      check('prudent-completed', 8, prudent.result.consequences.completedRides, 'all delivered'),
      check(
        'prudent-invisible-completed',
        5,
        prudent.result.consequences.invisible.completedRides,
        'invisible service counted',
      ),
      check('prudent-gate', 'PROGRESS', cityMissionGate(prudent.result).outcome, 'scenario ran'),
    );

    checks.push(
      check(
        'risky-fidelity',
        'EXACT',
        risky.result.fidelity.verdict,
        'the risky profile is copied',
      ),
      check('risky-matched-vehicles', 40, risky.result.fidelity.matchedVehicles, 'all values'),
      check(
        'risky-consequence',
        'HARMFUL',
        risky.result.consequences.verdict,
        'world result differs',
      ),
      check('risky-completed', 3, risky.result.consequences.completedRides, 'only three delivered'),
      check('risky-failed', 5, risky.result.consequences.failedRides, 'damaged taxis'),
      check(
        'risky-attributable',
        5,
        risky.result.consequences.attributableFailures,
        'TAXI_DAMAGED is attributable',
      ),
      check(
        'risky-visible-harm',
        1,
        risky.result.consequences.visible.attributableFailures,
        'one visible failure',
      ),
      check(
        'risky-invisible-harm',
        4,
        risky.result.consequences.invisible.attributableFailures,
        'four failures outside the camera',
      ),
      check(
        'risky-harm-rate',
        0.625,
        risky.summary.harmRate,
        'attributable / (completed + attributable)',
      ),
      check(
        'risky-missed-seconds',
        true,
        risky.result.consequences.missedSeconds > 0,
        'planned service that was not delivered',
      ),
      check(
        'risky-reason',
        'TAXI_DAMAGED',
        risky.result.consequences.failureReasons[0]?.reason ?? null,
        'the real 061 failure reason',
      ),
      check(
        'risky-gate',
        'PROGRESS',
        cityMissionGate(risky.result).outcome,
        'the player observed it',
      ),
      check(
        'verdicts-independent-good-imitation-bad-world',
        true,
        risky.result.fidelity.verdict === 'EXACT' &&
          risky.result.consequences.verdict === 'HARMFUL',
        'the two halves disagree by construction',
      ),
    );

    checks.push(
      check('stale-fidelity', 'PARTIAL', stale.result.fidelity.verdict, 'six vehicles are stale'),
      check('stale-matched-vehicles', 34, stale.result.fidelity.matchedVehicles, '34 of 40'),
      check(
        'stale-matched-fraction',
        true,
        stale.result.fidelity.matchedFraction !== null &&
          stale.result.fidelity.matchedFraction < 1 &&
          stale.result.fidelity.matchedFraction > 0,
        'a measured fraction, not a label',
      ),
      check(
        'stale-other-version-vehicles',
        6,
        stale.result.fidelity.versionAdoption.otherVersions[0]?.vehicles ?? null,
        'the 109 version that differs',
      ),
      check(
        'stale-parameter-deviation',
        true,
        stale.result.fidelity.parameters.some((row) => row.maxAbsoluteDeviation > 0),
        'the differing 092 parameter is reported',
      ),
      check(
        'stale-consequence',
        'CLEAN',
        stale.result.consequences.verdict,
        'service still delivered',
      ),
      check('stale-completed', 8, stale.result.consequences.completedRides, 'all rides delivered'),
      check(
        'verdicts-independent-partial-imitation-clean-world',
        true,
        stale.result.fidelity.verdict === 'PARTIAL' &&
          stale.result.consequences.verdict === 'CLEAN',
        'the inverse disagreement is also possible',
      ),
    );

    checks.push(
      check(
        'same-exposure-for-identical-plans',
        true,
        prudent.summary.totalSeconds === risky.summary.totalSeconds,
        'the consequence difference is not a service-volume difference',
      ),
      check(
        'invisible-share-identical',
        prudent.summary.invisibleFraction,
        risky.summary.invisibleFraction,
        'the camera set and the ride plan are identical',
      ),
      check(
        'structural-profile-writes',
        0,
        prudent.result.profileWrites + risky.result.profileWrites + stale.result.profileWrites,
        'evaluating the fleet never writes a profile',
      ),
      check(
        'structural-learning-jobs',
        0,
        prudent.result.learningJobs + risky.result.learningJobs + stale.result.learningJobs,
        'evaluating the fleet never queues a learning job',
      ),
      check(
        'deterministic',
        true,
        JSON.stringify(evaluateCityMission(prudent.run.input)) === JSON.stringify(prudent.result),
        'a second evaluation produces the same bytes',
      ),
      check(
        'refuses-incompatible-profile',
        true,
        refuses(
          Object.assign(mutable(prudent.run.input), {
            versions: [{ ...prudent.run.input.versions[0]!, profileId: 'city:foreign' }],
          }),
        ),
        'a version from another profile is refused',
      ),
      check(
        'refuses-incomplete-fleet',
        true,
        (() => {
          const input = mutable(prudent.run.input);
          input.fleet.vehicles.pop();
          return refuses(input);
        })(),
        'a fleet that omits a vehicle is refused',
      ),
      check(
        'refuses-foreign-activation',
        true,
        (() => {
          const input = mutable(prudent.run.input);
          input.activation.versionId = 'city-122-foreign';
          return refuses(input);
        })(),
        'an activation of another version is refused',
      ),
    );
  } finally {
    prudent.run.dispose();
    risky.run.dispose();
    stale.run.dispose();
  }

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: MISSION_CITY_REPORT_VERSION,
    contract: Object.freeze({
      missionId: CITY_MISSION_ID,
      schema: CITY_SCHEMA_VERSION,
      vehicles: CITY_LIMITS.vehicles,
      rides: CITY_LIMITS.rides,
      parametersPerVersion: CITY_LIMITS.parametersPerVersion,
      windowTicks: CITY_LIMITS.windowTicks,
      fidelityVerdicts: Object.freeze([...cityFidelityVerdicts]),
      consequenceVerdicts: Object.freeze([...cityConsequenceVerdicts]),
      outcomes: Object.freeze([...cityMissionOutcomes]),
      reasons: Object.freeze([...cityMissionReasons]),
      attributableFailures: Object.freeze([...CITY_ATTRIBUTABLE_FAILURE_REASONS]),
      visibleSlots: Object.freeze([...CITY_FIXTURE_VISIBLE_SLOTS]),
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

export function missionCityReportMarkdown(report: MissionCityReport): string {
  const lines: string[] = [];
  lines.push(
    '# 122 "the city copies you" report',
    '',
    'Machine-readable transcript: [report.json](report.json). Generated by ' +
      code('npm run missions:city') +
      '; no wall-clock value, random source or browser state participates. Version: ' +
      code(report.version) +
      '.',
    '',
    '## Contract',
    '',
    '- Mission: ' + code(report.contract.missionId) + ' (' + report.contract.schema + ').',
    '- Fleet capacity: ' +
      String(report.contract.vehicles) +
      ' vehicles; ride capacity: ' +
      String(report.contract.rides) +
      '.',
    '- Fidelity verdicts: ' +
      report.contract.fidelityVerdicts.map((entry) => code(entry)).join(', ') +
      '.',
    '- Consequence verdicts: ' +
      report.contract.consequenceVerdicts.map((entry) => code(entry)).join(', ') +
      '.',
    '- Attributable 061 failures: ' +
      report.contract.attributableFailures.map((entry) => code(entry)).join(', ') +
      '.',
    '',
    '## Runs',
    '',
    '| Run | Fidelity | Matched | Invisible exposure | Invisible rides | Consequence | Completed/Failed | Attributable | Harm rate | Gate |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...report.runs.map(
      (run) =>
        `| ${run.name} | ${code(run.fidelity)} | ${run.matchedVehicles}/${run.evaluatedVehicles} | ${cell(run.invisibleFraction)} (${run.invisibleSeconds} s of ${run.totalSeconds} s) | ${run.invisibleRides}/${run.totalRides} | ${code(run.consequence)} | ${run.completedRides}/${run.failedRides} | ${run.attributableFailures} | ${cell(run.harmRate)} | ${code(run.gate)} |`,
    ),
    '',
    'Every run evaluates the same 40 vehicles. The camera sees only slots 1–3, so 37 vehicles are',
    'invisible; their service seconds and their failures are part of the totals. The risky run uses the',
    'same ride plan and the same exposure as the prudent run, which is why the consequence difference',
    'cannot be explained by a different amount of service.',
    '',
    '## Invisible taxis that served',
    '',
    '| Run | Vehicle | Rides | Completed | Attributable failures | Exposure (s) |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.runs.flatMap((run) =>
      run.invisibleTaxis.map(
        (vehicle) =>
          `| ${run.name} | ${vehicle.vehicleId} | ${vehicle.rides} | ${vehicle.completedRides} | ${vehicle.attributableFailures} | ${vehicle.exposureSeconds} |`,
      ),
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
    '- Deterministic Node run: the fleet, the profile versions, the activation and the rides are real',
    '  057/059/060/061/109/110 outputs, but there is no browser, renderer or human session.',
    '- The authored part is the ride plan (which taxi takes a ride and whether it completes, ends',
    '  damaged or is cancelled), exactly like the declared 115 encounter plan; every count, second,',
    '  ratio and verdict is computed by the mission from the delivered contracts.',
    '- The camera set is a declared observation list because 122 owns no renderer. Visibility is',
    '  presentation state: it changes nothing about which vehicles are evaluated.',
    '- No FPS, frame, GPU or hardware measurement is claimed.',
    '',
  );
  return lines.join('\n');
}

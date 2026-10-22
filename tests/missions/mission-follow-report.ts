import {
  FOLLOW_COMPARISON_SCENARIOS,
  FOLLOW_LIMITS,
  FOLLOW_MISSION_ID,
  FOLLOW_SCHEMA_VERSION,
  FOLLOW_SINGLE_SPEED_SCENARIOS,
  followComparisonStatuses,
  followMissionOutcomes,
  followSeparationKinds,
} from '../../src/missions';
import { compareStyles, measureFollowStyle } from './mission-follow-fixture';

/**
 * Deterministic report for PBI 119.
 *
 * Every number below is produced by the real chain: the delivered 048 following policy measures the
 * gap a compiled profile holds in an authored context, the real 096 estimator derives the
 * coefficients from the real 093 evidence chain, and the mission contract decides the separation.
 * The report never writes a following law of its own and never publishes a profile.
 */
export const MISSION_FOLLOW_REPORT_VERSION = '119-mission-follow-report-v1' as const;

export interface MissionFollowReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean | null;
  readonly actual: string | number | boolean | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface MissionFollowReportScenario {
  readonly name: string;
  readonly status: string;
  readonly detail: Readonly<Record<string, string | number | boolean | null>>;
}

export interface MissionFollowReportProfile {
  readonly profileId: string;
  readonly headwayS: number | null;
  readonly minGapM: number | null;
  readonly identified: boolean;
  readonly reason: string | null;
  /** Real 048 `desiredGapM` per authored scenario, in catalogue order. */
  readonly gapsM: readonly number[];
}

export interface MissionFollowReport {
  readonly version: typeof MISSION_FOLLOW_REPORT_VERSION;
  readonly contract: Readonly<{
    missionId: string;
    schema: string;
    scenarios: readonly {
      scenarioId: string;
      egoSpeedMps: number;
      leaderSpeedMps: number;
      leaderGapM: number;
      leaderId: string;
    }[];
    singleSpeedScenarioIds: readonly string[];
    statuses: readonly string[];
    separations: readonly string[];
    outcomes: readonly string[];
    tolerances: Readonly<{ headwayS: number; minGapM: number }>;
    limits: Readonly<{ profiles: number; observationsPerProfile: number }>;
  }>;
  readonly scenarios: readonly MissionFollowReportScenario[];
  readonly profiles: Readonly<Record<string, MissionFollowReportProfile>>;
  readonly checks: readonly MissionFollowReportCheck[];
  readonly summary: Readonly<{
    scenarios: number;
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
): MissionFollowReportCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function scenario(
  name: string,
  status: string,
  detail: Record<string, string | number | boolean | null>,
): MissionFollowReportScenario {
  return Object.freeze({ name, status, detail: Object.freeze(detail) });
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function gaps(style: Parameters<typeof measureFollowStyle>[0]): readonly number[] {
  return measureFollowStyle(style).measuredGapsM.map((value) => round(value));
}

const STYLES = ['PRUDENT', 'HEADWAY_TWIN', 'GAP_TWIN', 'RECKLESS', 'PRUDENT_TWIN'] as const;

export function runMissionFollowReport(): MissionFollowReport {
  const scenarios: MissionFollowReportScenario[] = [];
  const checks: MissionFollowReportCheck[] = [];
  const profiles: Record<string, MissionFollowReportProfile> = {};

  checks.push(
    check('contract-schema', FOLLOW_SCHEMA_VERSION, '119-mission-follow-v1', 'mission schema'),
    check('mission-id', FOLLOW_MISSION_ID, 'campaign-3-following-distance', '116 campaign stage'),
    check('scenario-count', 4, FOLLOW_COMPARISON_SCENARIOS.length, 'authored known contexts'),
    check(
      'distinct-speeds',
      4,
      new Set(FOLLOW_COMPARISON_SCENARIOS.map((entry) => entry.egoSpeedMps)).size,
      'the comparison varies the speed',
    ),
    check('single-speed-count', 1, FOLLOW_SINGLE_SPEED_SCENARIOS.length, 'the refusal context'),
    check('profiles-per-comparison', 2, FOLLOW_LIMITS.profiles, 'exactly two styles'),
    check(
      'statuses',
      'SEPARATED,IDENTICAL,UNIDENTIFIED',
      followComparisonStatuses.join(','),
      'closed comparison vocabulary',
    ),
    check(
      'separations',
      'HEADWAY,MINIMUM_GAP,BOTH,NONE,UNIDENTIFIED',
      followSeparationKinds.join(','),
      'closed separation vocabulary',
    ),
    check(
      'outcomes',
      'PROGRESS,NO_PROGRESS',
      followMissionOutcomes.join(','),
      'closed mission outcome',
    ),
    check('headway-tolerance', 0.1, FOLLOW_LIMITS.headwayDeltaS, 'seconds'),
    check('gap-tolerance', 0.5, FOLLOW_LIMITS.gapDeltaM, 'metres'),
  );

  // 1. One style measured on every authored context. The gap is the real 048 output.
  const prudent = measureFollowStyle('PRUDENT');
  const headwayTwin = measureFollowStyle('HEADWAY_TWIN');
  for (const run of [prudent, headwayTwin]) {
    profiles[run.style] = Object.freeze({
      profileId: run.profileId,
      headwayS: null,
      minGapM: null,
      identified: false,
      reason: null,
      gapsM: run.measuredGapsM.map((value) => round(value)),
    });
  }
  checks.push(
    check(
      'prudent-headway',
      2.4,
      round((prudent.measuredGapsM[3]! - 4) / FOLLOW_COMPARISON_SCENARIOS[3]!.egoSpeedMps),
      'the measured gap law of the real 048 policy at 20 m/s',
    ),
    check(
      'prudent-min-gap',
      4,
      round(prudent.measuredGapsM[0]! - 2.4 * FOLLOW_COMPARISON_SCENARIOS[0]!.egoSpeedMps),
      'the intercept of the same measured gaps',
    ),
  );

  // 2. Same minimum gap, different headway: only the slope separates the styles.
  const headwayCase = compareStyles('PRUDENT', 'HEADWAY_TWIN');
  const [headwayA, headwayB] = headwayCase.comparison.profiles;
  for (const profile of headwayCase.comparison.profiles)
    profiles[profile.profileId.split(':')[2]!.toUpperCase()] = Object.freeze({
      profileId: profile.profileId,
      headwayS: profile.headwayS === null ? null : round(profile.headwayS),
      minGapM: profile.minGapM === null ? null : round(profile.minGapM),
      identified: profile.identified,
      reason: profile.reason,
      gapsM: profile.measurements.map((entry) => round(entry.gapM)),
    });
  scenarios.push(
    scenario(
      'Headway separates the styles at identical leader facts',
      headwayCase.comparison.status,
      {
        separation: headwayCase.comparison.separation,
        headwayDeltaS: headwayCase.comparison.headwayDeltaS,
        minGapDeltaM: headwayCase.comparison.minGapDeltaM,
        prudentHeadwayS: headwayA!.headwayS,
        twinHeadwayS: headwayB!.headwayS,
        prudentMinGapM: headwayA!.minGapM,
        twinMinGapM: headwayB!.minGapM,
        prudentGapsM: headwayA!.measurements.map((entry) => entry.gapM).join(','),
        twinGapsM: headwayB!.measurements.map((entry) => entry.gapM).join(','),
        measuredAt4: `${headwayA!.measurements[0]!.gapM} vs ${headwayB!.measurements[0]!.gapM}`,
        measuredAt20: `${headwayA!.measurements[3]!.gapM} vs ${headwayB!.measurements[3]!.gapM}`,
        outcome: headwayCase.gate.outcome,
      },
    ),
  );
  checks.push(
    check('headway-status', 'SEPARATED', headwayCase.comparison.status, 'real 096 coefficients'),
    check('headway-kind', 'HEADWAY', headwayCase.comparison.separation, 'slope differs'),
    check(
      'headway-min-gap',
      0,
      round(headwayCase.comparison.minGapDeltaM ?? Number.NaN),
      'intercept equal',
    ),
    check(
      'headway-delta',
      1.8,
      round(headwayCase.comparison.headwayDeltaS ?? Number.NaN),
      'seconds',
    ),
    check(
      'headway-gap-4',
      2.4 + 4 * 2.4 - (2.4 + 0.6 * 4),
      round(headwayA!.measurements[0]!.gapM - headwayB!.measurements[0]!.gapM),
      'real 048 gap difference at 4 m/s',
    ),
    check(
      'headway-gap-20',
      2.4 + 20 * 2.4 - (2.4 + 0.6 * 20),
      round(headwayA!.measurements[3]!.gapM - headwayB!.measurements[3]!.gapM),
      'same two styles, larger difference at 20 m/s',
    ),
    check('headway-outcome', 'PROGRESS', headwayCase.gate.outcome, 'mission gate'),
    check('headway-writes', 0, headwayCase.comparison.profileWrites, 'no profile write'),
  );

  // 3. Same headway, different minimum gap: only the intercept separates the styles.
  const gapCase = compareStyles('PRUDENT', 'GAP_TWIN');
  const [gapA, gapB] = gapCase.comparison.profiles;
  for (const profile of gapCase.comparison.profiles)
    profiles[profile.profileId.split(':')[2]!.toUpperCase()] = Object.freeze({
      profileId: profile.profileId,
      headwayS: profile.headwayS === null ? null : round(profile.headwayS),
      minGapM: profile.minGapM === null ? null : round(profile.minGapM),
      identified: profile.identified,
      reason: profile.reason,
      gapsM: profile.measurements.map((entry) => round(entry.gapM)),
    });
  scenarios.push(
    scenario('Minimum gap separates the styles at every speed', gapCase.comparison.status, {
      separation: gapCase.comparison.separation,
      headwayDeltaS: gapCase.comparison.headwayDeltaS,
      minGapDeltaM: gapCase.comparison.minGapDeltaM,
      prudentHeadwayS: gapA!.headwayS,
      twinHeadwayS: gapB!.headwayS,
      prudentMinGapM: gapA!.minGapM,
      twinMinGapM: gapB!.minGapM,
      differenceAt4: gapB!.measurements[0]!.gapM - gapA!.measurements[0]!.gapM,
      differenceAt20: gapB!.measurements[3]!.gapM - gapA!.measurements[3]!.gapM,
      outcome: gapCase.gate.outcome,
    }),
  );
  checks.push(
    check('gap-status', 'SEPARATED', gapCase.comparison.status, 'real 096 coefficients'),
    check('gap-kind', 'MINIMUM_GAP', gapCase.comparison.separation, 'intercept differs'),
    check(
      'gap-headway',
      0,
      round(Math.abs((gapA!.headwayS ?? Number.NaN) - (gapB!.headwayS ?? Number.NaN))),
      'slope equal',
    ),
    check('gap-delta', 6, round(gapCase.comparison.minGapDeltaM ?? Number.NaN), 'metres'),
    ...FOLLOW_COMPARISON_SCENARIOS.map((entry, index) =>
      check(
        `gap-difference-${entry.egoSpeedMps}`,
        6,
        round(gapB!.measurements[index]!.gapM - gapA!.measurements[index]!.gapM),
        'a constant difference is a minimum-gap difference',
      ),
    ),
    check('gap-outcome', 'PROGRESS', gapCase.gate.outcome, 'mission gate'),
  );

  // 4. Two identities with equal values are not a separation.
  const identical = compareStyles('PRUDENT', 'PRUDENT_TWIN');
  scenarios.push(
    scenario('Two identical styles', identical.comparison.status, {
      separation: identical.comparison.separation,
      reason: identical.comparison.reason,
      headwayDeltaS: identical.comparison.headwayDeltaS,
      minGapDeltaM: identical.comparison.minGapDeltaM,
      outcome: identical.gate.outcome,
      gateReason: identical.gate.reason,
    }),
  );
  checks.push(
    check('identical-status', 'IDENTICAL', identical.comparison.status, 'no visible difference'),
    check('identical-kind', 'NONE', identical.comparison.separation, 'neither coefficient'),
    check('identical-reason', 'PROFILE_VALUES_MATCH', identical.comparison.reason, 'closed reason'),
    check('identical-outcome', 'NO_PROGRESS', identical.gate.outcome, 'mission gate'),
  );

  // 5. A single speed cannot identify slope and intercept, so the mission cannot progress.
  const single = compareStyles('PRUDENT', 'HEADWAY_TWIN', FOLLOW_SINGLE_SPEED_SCENARIOS);
  const [singleA, singleB] = single.comparison.profiles;
  scenarios.push(
    scenario('Single speed refuses to identify the coefficients', single.comparison.status, {
      distinctSpeeds: single.comparison.distinctSpeeds,
      singleSpeed: single.comparison.singleSpeed,
      separation: single.comparison.separation,
      reason: single.comparison.reason,
      prudentGapM: singleA!.measurements[0]!.gapM,
      twinGapM: singleB!.measurements[0]!.gapM,
      prudentHeadwayS: singleA!.headwayS,
      twinHeadwayS: singleB!.headwayS,
      prudentMinGapM: singleA!.minGapM,
      twinMinGapM: singleB!.minGapM,
      outcome: single.gate.outcome,
      gateReason: single.gate.reason,
    }),
  );
  checks.push(
    check('single-speed-count', 1, single.comparison.distinctSpeeds, 'distinct authored speeds'),
    check('single-speed-flag', true, single.comparison.singleSpeed, 'one speed'),
    check('single-status', 'UNIDENTIFIED', single.comparison.status, 'not enough identification'),
    check('single-separation', 'UNIDENTIFIED', single.comparison.separation, 'no coefficient'),
    check(
      'single-reason',
      'SINGLE_SPEED_CANNOT_IDENTIFY',
      single.comparison.reason,
      'real 096 refusal',
    ),
    check('single-headway', null, singleA!.headwayS, 'no slope identified'),
    check('single-min-gap', null, singleA!.minGapM, 'no intercept identified'),
    check('single-delta', null, single.comparison.headwayDeltaS, 'no reported difference'),
    check('single-outcome', 'NO_PROGRESS', single.gate.outcome, 'mission gate'),
    check(
      'single-gap-differs',
      true,
      round(singleA!.measurements[0]!.gapM - singleB!.measurements[0]!.gapM) !== 0,
      'the measured gap still differs; only identification is refused',
    ),
  );

  // 6. The gate matrix covers every comparison status.
  const gates = [
    ['PRUDENT', 'HEADWAY_TWIN', 'PROGRESS', 'SEPARATED'],
    ['PRUDENT', 'GAP_TWIN', 'PROGRESS', 'SEPARATED'],
    ['PRUDENT', 'RECKLESS', 'PROGRESS', 'SEPARATED'],
    ['PRUDENT', 'PRUDENT_TWIN', 'NO_PROGRESS', 'IDENTICAL'],
  ] as const;
  for (const [left, right, outcome, status] of gates) {
    const result = compareStyles(left, right);
    checks.push(
      check(
        `gate-${left}-${right}`,
        `${outcome}:${status}`,
        `${result.gate.outcome}:${result.comparison.status}`,
        'gate follows the measured comparison',
      ),
    );
  }
  scenarios.push(
    scenario('Gate matrix', 'PROGRESS/NO_PROGRESS', {
      recklessSeparation: compareStyles('PRUDENT', 'RECKLESS').comparison.separation,
      recklessHeadwayDeltaS: compareStyles('PRUDENT', 'RECKLESS').comparison.headwayDeltaS,
      recklessMinGapDeltaM: compareStyles('PRUDENT', 'RECKLESS').comparison.minGapDeltaM,
      profileWrites: headwayCase.comparison.profileWrites + gapCase.comparison.profileWrites,
      learningJobs: headwayCase.comparison.learningJobs + gapCase.comparison.learningJobs,
    }),
  );

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: MISSION_FOLLOW_REPORT_VERSION,
    contract: Object.freeze({
      missionId: FOLLOW_MISSION_ID,
      schema: FOLLOW_SCHEMA_VERSION,
      scenarios: Object.freeze(
        FOLLOW_COMPARISON_SCENARIOS.map((entry) => Object.freeze({ ...entry })),
      ),
      singleSpeedScenarioIds: Object.freeze(
        FOLLOW_SINGLE_SPEED_SCENARIOS.map((entry) => entry.scenarioId),
      ),
      statuses: Object.freeze([...followComparisonStatuses]),
      separations: Object.freeze([...followSeparationKinds]),
      outcomes: Object.freeze([...followMissionOutcomes]),
      tolerances: Object.freeze({
        headwayS: FOLLOW_LIMITS.headwayDeltaS,
        minGapM: FOLLOW_LIMITS.gapDeltaM,
      }),
      limits: Object.freeze({
        profiles: FOLLOW_LIMITS.profiles,
        observationsPerProfile: FOLLOW_LIMITS.observationsPerProfile,
      }),
    }),
    scenarios: Object.freeze(scenarios),
    profiles: Object.freeze(profiles),
    checks: Object.freeze(checks),
    summary: Object.freeze({
      scenarios: scenarios.length,
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

export function missionFollowReportMarkdown(report: MissionFollowReport): string {
  const lines: string[] = [];
  lines.push(
    '# 119 following-style comparison report',
    '',
    'Machine-readable transcript: [report.json](report.json). Generated by ' +
      code('npm run missions:follow') +
      ';',
    'no wall-clock value, random source or browser state participates. Version: ' +
      code(report.version) +
      '.',
    '',
    '## Authored known contexts',
    '',
    '| Scenario | Ego speed (m/s) | Leader speed (m/s) | Authored gap (m) | Leader |',
    '| --- | --- | --- | --- | --- |',
    ...report.contract.scenarios.map(
      (entry) =>
        `| ${entry.scenarioId} | ${entry.egoSpeedMps} | ${entry.leaderSpeedMps} | ${entry.leaderGapM} | ${entry.leaderId} |`,
    ),
    '',
    'Within one scenario both styles meet exactly the same leader facts. Across the set the speed',
    'varies, which is what lets the real 096 estimator tell a headway style from a minimum-gap',
    'style. The single-speed context ' +
      report.contract.singleSpeedScenarioIds.map((id) => code(id)).join(', ') +
      ' exists only to exercise the refusal.',
    '',
    '## Measured profiles',
    '',
    '| Profile | Headway (s) | Minimum gap (m) | Identified | Reason | Measured gaps (m) |',
    '| --- | --- | --- | --- | --- | --- |',
    ...Object.values(report.profiles).map(
      (entry) =>
        `| ${entry.profileId} | ${cell(entry.headwayS)} | ${cell(entry.minGapM)} | ${
          entry.identified ? 'yes' : 'no'
        } | ${cell(entry.reason)} | ${entry.gapsM.join(', ')} |`,
    ),
    '',
    'The gaps are the real 048 `desiredGapM` values for the compiled profile, not values authored',
    'for the mission; the coefficients are the real 096 candidates derived from the real 093',
    'evidence chain.',
    '',
    '## Scenarios',
    '',
    '| Scenario | Status | Detail |',
    '| --- | --- | --- |',
    ...report.scenarios.map(
      (entry) =>
        `| ${entry.name} | ${code(entry.status)} | ${Object.entries(entry.detail)
          .map(([key, value]) => `${key}=${cell(value)}`)
          .join('; ')} |`,
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
    '- Scenarios: ' + String(report.summary.scenarios),
    '- Checks: ' + String(report.summary.passed) + '/' + String(report.summary.checks),
    '- Overall: ' + (report.summary.pass ? 'PASS' : 'FAIL'),
    '',
    '## Limitations',
    '',
    '- Deterministic Node run: the styles are measured through the real 048 policy and the real',
    '  086/087/088/093/096 chain, but there is no browser, renderer or human session.',
    '- The 087 window identity and the 088 window identity still use two schemes; the fixture binds',
    '  the real 088 window to the real 087 window of the same opportunity, exactly like the 118',
    '  fixture, and invents no value, tick or estimate.',
    '- The authored leader facts are a controlled calibration set, not a replay of recorded traffic.',
    '- No FPS, frame, GPU or hardware measurement is claimed.',
    '',
  );
  return lines.join('\n');
}

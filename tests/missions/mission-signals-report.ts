import {
  SIGNALS_LIMITS,
  SIGNALS_MISSION_ID,
  SIGNALS_SCHEMA_VERSION,
  evaluateSignalMission,
  signalEpisodeVerdicts,
  signalExplanations,
  signalMissionOutcomes,
  signalViolationKinds,
  stopCauses,
} from '../../src/missions';
import type { SignalMissionResult } from '../../src/missions';
import {
  SIGNALS_COMPLIANT_PLAN,
  SIGNALS_VIOLATION_PLAN,
  SIGNALS_SHORT_PLAN,
  buildSignalRun,
} from './mission-signals-fixture';
import type { SignalRun } from './mission-signals-fixture';

/**
 * Deterministic report for PBI 120.
 *
 * Every number below is produced by the real chain: 086 opens and resolves the opportunities, 087
 * classifies them and answers the reaction window, 088 filters the segment, 093 records the
 * evidence, and the real 097/098 estimators derive the candidates the mission reports. The report
 * never recomputes a candidate and never publishes a profile.
 */
export const MISSION_SIGNALS_REPORT_VERSION = '120-mission-signals-report-v1' as const;

export interface MissionSignalsReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean | null;
  readonly actual: string | number | boolean | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface MissionSignalsReportEpisode {
  readonly opportunityId: string;
  readonly kind: string;
  readonly windowClass: string;
  readonly label: string;
  readonly stopCause: string | null;
  readonly outcome: string;
  readonly opportunityResult: string;
  readonly verdict: string;
  readonly explanation: string;
  readonly violation: string | null;
  readonly fullStop: boolean;
  readonly dwellS: number | null;
  readonly reactionApplicable: boolean;
  readonly reactionResponded: boolean;
  readonly reactionReason: string | null;
  readonly consequenceKey: string | null;
  readonly consequenceStatus: string | null;
  readonly consequenceValue: number | null;
}

export interface MissionSignalsReportRun {
  readonly name: string;
  readonly plan: readonly string[];
  readonly outcome: string;
  readonly reason: string | null;
  readonly violations: number;
  readonly compliant: number;
  readonly trafficStops: number;
  readonly blockedGreens: number;
  readonly fullStops: number;
  readonly objectiveMet: boolean;
  readonly redDenominator: number;
  readonly stopOpportunityDenominator: number;
  readonly stopLineDenominator: number;
  readonly trafficInducedStopsExcluded: number;
  readonly redCandidate: Readonly<{
    status: string;
    value: number | null;
    confidence: string;
    sourceEpisodeCount: number;
  }>;
  readonly stopCandidate: Readonly<{
    status: string;
    value: number | null;
    confidence: string;
    sourceEpisodeCount: number;
  }>;
  readonly episodes: readonly MissionSignalsReportEpisode[];
}

export interface MissionSignalsReport {
  readonly version: typeof MISSION_SIGNALS_REPORT_VERSION;
  readonly contract: Readonly<{
    missionId: string;
    schema: string;
    objectiveFullStops: number;
    minimumFullStopDwellS: number;
    episodeLimit: number;
    verdicts: readonly string[];
    violationKinds: readonly string[];
    stopCauses: readonly string[];
    outcomes: readonly string[];
    explanations: readonly string[];
  }>;
  readonly runs: readonly MissionSignalsReportRun[];
  readonly checks: readonly MissionSignalsReportCheck[];
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
): MissionSignalsReportCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function planLabel(run: SignalRun): readonly string[] {
  return run.plan.map((entry) => {
    if (entry.kind === 'TRAFFIC_STOP') return 'TRAFFIC_STOP';
    if (entry.kind === 'STOP_LINE')
      return `STOP_LINE:${entry.decision}${entry.dwellS === undefined ? '' : `:${entry.dwellS}s`}`;
    return `${entry.kind}:${entry.decision}`;
  });
}

function episodesOf(result: SignalMissionResult): readonly MissionSignalsReportEpisode[] {
  return result.episodes.map((entry) =>
    Object.freeze({
      opportunityId: entry.opportunityId,
      kind: entry.kind,
      windowClass: entry.windowClass,
      label: entry.label,
      stopCause: entry.stopCause,
      outcome: entry.outcome,
      opportunityResult: entry.opportunityResult,
      verdict: entry.verdict,
      explanation: entry.explanation,
      violation: entry.violation,
      fullStop: entry.fullStop,
      dwellS: entry.dwellS === null ? null : round(entry.dwellS),
      reactionApplicable: entry.reaction.applicable,
      reactionResponded: entry.reaction.responded,
      reactionReason: entry.reaction.reason,
      consequenceKey: entry.consequence?.learningKey ?? null,
      consequenceStatus: entry.consequence?.candidateStatus ?? null,
      consequenceValue:
        entry.consequence?.candidateValue === null ||
        entry.consequence?.candidateValue === undefined
          ? null
          : round(entry.consequence.candidateValue),
    }),
  );
}

function summarize(run: SignalRun, name: string): MissionSignalsReportRun {
  const { result, facts } = run;
  return Object.freeze({
    name,
    plan: Object.freeze(planLabel(run)),
    outcome: result.outcome,
    reason: result.reason,
    violations: result.violations,
    compliant: result.compliant,
    trafficStops: result.trafficStops,
    blockedGreens: result.blockedGreens,
    fullStops: result.fullStops,
    objectiveMet: result.objectiveMet,
    redDenominator: facts.signalResult.certainRedDenominator,
    stopOpportunityDenominator: facts.stopResult.certainStopOpportunityDenominator,
    stopLineDenominator: facts.stopResult.certainStopDenominator,
    trafficInducedStopsExcluded: facts.stopResult.trafficInducedStopsExcluded,
    redCandidate: Object.freeze({
      status: result.learning.redStopProbability.status,
      value:
        result.learning.redStopProbability.value === null
          ? null
          : round(result.learning.redStopProbability.value),
      confidence: result.learning.redStopProbability.confidence,
      sourceEpisodeCount: result.learning.redStopProbability.sourceEpisodeCount,
    }),
    stopCandidate: Object.freeze({
      status: result.learning.stopFullProbability.status,
      value:
        result.learning.stopFullProbability.value === null
          ? null
          : round(result.learning.stopFullProbability.value),
      confidence: result.learning.stopFullProbability.confidence,
      sourceEpisodeCount: result.learning.stopFullProbability.sourceEpisodeCount,
    }),
    episodes: Object.freeze(episodesOf(result)),
  });
}

/** Proves the mission refuses a candidate that the real episodes do not support. */
function refusesForgedCandidate(run: SignalRun): boolean {
  const forged = JSON.parse(JSON.stringify(run.input)) as {
    signal: { redStopProbability: { value: number } };
  };
  forged.signal.redStopProbability.value = 0.99;
  try {
    evaluateSignalMission(forged);
    return false;
  } catch {
    return true;
  }
}

export function runMissionSignalsReport(): MissionSignalsReport {
  const checks: MissionSignalsReportCheck[] = [];

  checks.push(
    check('contract-schema', SIGNALS_SCHEMA_VERSION, '120-mission-signals-v1', 'mission schema'),
    check('mission-id', SIGNALS_MISSION_ID, 'campaign-4-stops-and-signals', '116 campaign stage'),
    check('objective-full-stops', 2, SIGNALS_LIMITS.objectiveFullStops, '116 FULL_STOPS target'),
    check(
      'objective-minimum-dwell',
      1.5,
      SIGNALS_LIMITS.minimumFullStopDwellS,
      '116 minimum dwell in seconds',
    ),
    check('episode-limit', 32, SIGNALS_LIMITS.episodes, 'bounded mission run'),
    check(
      'verdicts',
      'VIOLATION,COMPLIANT,TRAFFIC_STOP,BLOCKED_GREEN,EXTERNAL_CONSTRAINT',
      signalEpisodeVerdicts.join(','),
      'closed episode verdicts',
    ),
    check(
      'violation-kinds',
      'RED_CROSSED,STOP_LINE_CROSSED',
      signalViolationKinds.join(','),
      'only a free-traffic decision can be a violation',
    ),
    check('stop-causes', 'STOP_LINE,LEADER,QUEUE,BLOCKED', stopCauses.join(','), '050/051 causes'),
    check(
      'outcomes',
      'PROGRESS,NO_PROGRESS',
      signalMissionOutcomes.join(','),
      'closed mission outcome',
    ),
    check(
      'explanations',
      'RED_HELD,RED_CROSSED,STOP_LINE_HELD,STOP_LINE_CROSSED,GREEN_RELEASED,GREEN_MISSED,TRAFFIC_STOP_NOT_VIOLATION,BLOCKED_GREEN_NOT_VIOLATION,EXTERNAL_CONSTRAINT_NOT_VIOLATION',
      signalExplanations.join(','),
      'every episode is explained',
    ),
  );

  const compliant = buildSignalRun(SIGNALS_COMPLIANT_PLAN);
  const violation = buildSignalRun(SIGNALS_VIOLATION_PLAN);
  const short = buildSignalRun(SIGNALS_SHORT_PLAN);
  const runs = [
    summarize(compliant, 'compliant'),
    summarize(violation, 'violation'),
    summarize(short, 'short-dwell'),
  ];

  const compliantBlocked = compliant.result.episodes.find(
    (entry) => entry.verdict === 'BLOCKED_GREEN',
  )!;
  const compliantTraffic = compliant.result.episodes.find(
    (entry) => entry.verdict === 'TRAFFIC_STOP',
  )!;
  const greenDelay = compliant.facts.evidence.find((row) => row.key === 'green_start_delay')!;
  const violationRed = violation.result.episodes.filter(
    (entry) => entry.violation === 'RED_CROSSED',
  );
  const violationStop = violation.result.episodes.filter(
    (entry) => entry.violation === 'STOP_LINE_CROSSED',
  );

  checks.push(
    check('compliant-outcome', 'PROGRESS', compliant.result.outcome, '116 objective met'),
    check('compliant-violations', 0, compliant.result.violations, 'no attributable violation'),
    check('compliant-full-stops', 3, compliant.result.fullStops, 'three real FULL_STOP events'),
    check('compliant-blocked-greens', 1, compliant.result.blockedGreens, 'real BLOCKED_GREEN'),
    check('compliant-traffic-stops', 1, compliant.result.trafficStops, 'real LEADER stop'),
    check(
      'compliant-red-denominator',
      3,
      compliant.facts.signalResult.certainRedDenominator,
      '086',
    ),
    check(
      'compliant-stop-opportunity-denominator',
      4,
      compliant.facts.stopResult.certainStopOpportunityDenominator,
      'all 086 STOP opportunities',
    ),
    check(
      'compliant-stop-line-denominator',
      3,
      compliant.facts.stopResult.certainStopDenominator,
      'free-traffic STOP_LINE subset',
    ),
    check(
      'compliant-traffic-excluded',
      1,
      compliant.facts.stopResult.trafficInducedStopsExcluded,
      'the LEADER stop never enters the stop-line ratio',
    ),
    check('compliant-red-candidate', 1, runs[0]!.redCandidate.value, '097 ratio over 3 HELD reds'),
    check(
      'compliant-stop-candidate',
      1,
      runs[0]!.stopCandidate.value,
      '098 ratio over 3 STOP_LINE approaches, not 4',
    ),
    check(
      'compliant-stop-candidate-not-3-4',
      false,
      runs[0]!.stopCandidate.value === 0.75,
      'a traffic stop is not a missing stop-line stop',
    ),
    check('blocked-green-verdict', 'BLOCKED_GREEN', compliantBlocked.verdict, 'not a violation'),
    check('blocked-green-window', 'EXTERNAL_CONSTRAINT', compliantBlocked.windowClass, '087'),
    check(
      'blocked-green-consequence',
      null,
      compliantBlocked.consequence?.learningKey ?? null,
      'no candidate doubled',
    ),
    check(
      'blocked-green-reaction',
      false,
      compliantBlocked.reaction.applicable,
      'no reaction requirement',
    ),
    check(
      'blocked-green-reaction-reason',
      'EXTERNAL_CONSTRAINT',
      compliantBlocked.reaction.reason,
      'the real 087 refusal',
    ),
    check(
      'blocked-green-outcome',
      'MISSED',
      compliantBlocked.outcome,
      'the 086 relation is a certain failure',
    ),
    check(
      'traffic-stop-verdict',
      'TRAFFIC_STOP',
      compliantTraffic.verdict,
      'a queue stop is not a stop-line violation',
    ),
    check(
      'traffic-stop-failure',
      'FAILURE',
      compliantTraffic.opportunityResult,
      'the 086 opportunity is a real failure',
    ),
    check(
      'traffic-stop-consequence',
      null,
      compliantTraffic.consequence?.learningKey ?? null,
      'excluded from learning',
    ),
    check(
      'green-delay-evidence',
      1,
      greenDelay.distinctEpisodes,
      'only the unblocked green produces a delay',
    ),
    check(
      'green-delay-candidate',
      null,
      compliant.facts.signalResult.candidates.green_start_delay.value,
      'one delay is below the two-episode minimum',
    ),
    check(
      'violation-outcome',
      'NO_PROGRESS',
      violation.result.outcome,
      'violations block progress',
    ),
    check(
      'violation-reason',
      'VIOLATIONS_AND_INSUFFICIENT_FULL_STOPS',
      violation.result.reason,
      'both halves fail',
    ),
    check('violation-count', 4, violation.result.violations, 'two reds and two stop lines'),
    check('violation-red-count', 2, violationRed.length, 'real RED CROSSED outcomes'),
    check('violation-stop-count', 2, violationStop.length, 'real CROSSED_WITHOUT_STOP outcomes'),
    check('violation-full-stops', 1, violation.result.fullStops, 'one FULL_STOP event'),
    check(
      'violation-red-candidate',
      0.333333,
      runs[1]!.redCandidate.value,
      '1 HELD of 3 certain reds',
    ),
    check(
      'violation-stop-candidate',
      0.333333,
      runs[1]!.stopCandidate.value,
      '1 full of 3 STOP_LINE approaches',
    ),
    check(
      'violation-consequence-red',
      'red_stop_probability',
      violationRed[0]!.consequence?.learningKey ?? null,
      'the violation is the learned red episode',
    ),
    check(
      'violation-consequence-stop',
      'stop_full_probability',
      violationStop[0]!.consequence?.learningKey ?? null,
      'the violation is the learned stop-line episode',
    ),
    check(
      'violation-consequence-failure',
      'FAILURE',
      violationRed[0]!.consequence?.opportunityResult ?? null,
      'consequence tied to the certain 086 result',
    ),
    check(
      'violation-blocked-green',
      1,
      violation.result.blockedGreens,
      'a violation run can still contain an external constraint',
    ),
    check(
      'short-outcome',
      'INSUFFICIENT_FULL_STOPS',
      short.result.reason,
      'no violation, but the objective fails',
    ),
    check('short-full-stops', 1, short.result.fullStops, '0.5 s is below the 1.5 s minimum'),
    check(
      'short-first-dwell',
      2,
      round(short.result.episodes.find((entry) => entry.fullStop)!.dwellS ?? -1),
      'the 2 s stop counts',
    ),
    check(
      'short-second-dwell',
      0.5,
      round(short.result.episodes.filter((entry) => entry.fullStop)[1]!.dwellS ?? -1),
      'the 0.5 s stop does not count',
    ),
    check(
      'short-stop-candidate',
      'UNOBSERVED',
      short.result.learning.stopFullProbability.status,
      'two stop-line facts are below the three-episode minimum',
    ),
    check(
      'refuses-forged-candidate',
      true,
      refusesForgedCandidate(violation),
      'a candidate the real episodes do not support is refused',
    ),
    check(
      'structural-writes',
      0,
      compliant.result.profileWrites + violation.result.profileWrites + short.result.profileWrites,
      'the mission never writes a profile',
    ),
    check(
      'structural-learning-jobs',
      0,
      compliant.result.learningJobs + violation.result.learningJobs + short.result.learningJobs,
      'the mission never queues a learning job',
    ),
  );

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: MISSION_SIGNALS_REPORT_VERSION,
    contract: Object.freeze({
      missionId: SIGNALS_MISSION_ID,
      schema: SIGNALS_SCHEMA_VERSION,
      objectiveFullStops: SIGNALS_LIMITS.objectiveFullStops,
      minimumFullStopDwellS: SIGNALS_LIMITS.minimumFullStopDwellS,
      episodeLimit: SIGNALS_LIMITS.episodes,
      verdicts: Object.freeze([...signalEpisodeVerdicts]),
      violationKinds: Object.freeze([...signalViolationKinds]),
      stopCauses: Object.freeze([...stopCauses]),
      outcomes: Object.freeze([...signalMissionOutcomes]),
      explanations: Object.freeze([...signalExplanations]),
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

export function missionSignalsReportMarkdown(report: MissionSignalsReport): string {
  const lines: string[] = [];
  lines.push(
    '# 120 STOP/red/green mission report',
    '',
    'Machine-readable transcript: [report.json](report.json). Generated by ' +
      code('npm run missions:signals') +
      ';',
    'no wall-clock value, random source or browser state participates. Version: ' +
      code(report.version) +
      '.',
    '',
    '## Contract',
    '',
    '- Mission: ' + code(report.contract.missionId) + ' (' + report.contract.schema + ').',
    '- Objective: ' +
      code(report.contract.objectiveFullStops) +
      ' full stops of at least ' +
      code(report.contract.minimumFullStopDwellS) +
      ' s, and zero attributable violations.',
    '- Episode limit: ' + String(report.contract.episodeLimit) + '.',
    '- Verdicts: ' + report.contract.verdicts.map((entry) => code(entry)).join(', ') + '.',
    '- Violation kinds: ' +
      report.contract.violationKinds.map((entry) => code(entry)).join(', ') +
      '.',
    '- Real STOP causes: ' +
      report.contract.stopCauses.map((entry) => code(entry)).join(', ') +
      '.',
    '',
    '## Runs',
    '',
    '| Run | Outcome | Reason | Violations | Full stops | Red candidate | Stop candidate |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...report.runs.map(
      (run) =>
        `| ${run.name} | ${code(run.outcome)} | ${cell(run.reason)} | ${run.violations} | ${run.fullStops} | ${cell(run.redCandidate.value)} (${run.redCandidate.status}) | ${cell(run.stopCandidate.value)} (${run.stopCandidate.status}) |`,
    ),
    '',
    'The candidates are the real 097 `red_stop_probability` and 098 `stop_full_probability`',
    'candidates. The violation run therefore reports `1/3` for both: the same episodes the estimators',
    'learn from are the episodes the mission explains.',
    '',
    '## Denominator accounting',
    '',
    '| Run | Certain RED | Certain STOP | Free-traffic STOP_LINE | Traffic-induced excluded |',
    '| --- | --- | --- | --- | --- |',
    ...report.runs.map(
      (run) =>
        `| ${run.name} | ${run.redDenominator} | ${run.stopOpportunityDenominator} | ${run.stopLineDenominator} | ${run.trafficInducedStopsExcluded} |`,
    ),
    '',
    '## Episodes',
    '',
    '| Run | Kind | Window | Cause | Outcome | Verdict | Explanation | Reaction | Consequence |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...report.runs.flatMap((run) =>
      run.episodes.map(
        (entry) =>
          `| ${run.name} | ${entry.kind} | ${entry.windowClass}/${entry.label} | ${cell(
            entry.stopCause,
          )} | ${entry.outcome} (${entry.opportunityResult}) | ${entry.verdict} | ${
            entry.explanation
          } | ${entry.reactionApplicable ? (entry.reactionResponded ? 'responded' : 'open, no response') : cell(entry.reactionReason)} | ${
            entry.consequenceKey === null
              ? '—'
              : `${entry.consequenceKey}=${cell(entry.consequenceValue)}`
          } |`,
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
    '- Deterministic Node run: every fact is produced by the real 086/087/088/093/097/098 chain, but',
    '  there is no browser, renderer or human session.',
    '- The authored scenario says which phase is red, which stop line is approached and how long the',
    '  real `FULL_STOP` event lasts; every classification, denominator, candidate and refusal is the',
    '  delivered module output.',
    '- The 087 window identity and the 088 window identity still use two schemes; the fixture binds',
    '  the real 088 window to the real 087 window of the same opportunity, exactly like the 118/119',
    '  fixtures, and invents no value, tick or estimate.',
    '- A candidate needs three distinct episodes, so the report proves identification and refusal at',
    '  that minimum rather than at a large recorded sample.',
    '- No FPS, frame, GPU or hardware measurement is claimed.',
    '',
  );
  return lines.join('\n');
}

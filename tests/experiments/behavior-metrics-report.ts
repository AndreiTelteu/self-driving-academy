import {
  BEHAVIOR_LIMITS,
  BEHAVIOR_METRIC_IDS,
  BEHAVIOR_METRICS_VERSION,
  BEHAVIOR_OUTCOME_VIOLATION,
  BEHAVIOR_UNIT_BY_ID,
  createBehaviorMetrics,
  behaviorEventKinds,
  behaviorUnavailableReasons,
} from '../../src/experiments';
import type { BehaviorMetrics, BehaviorMetricsSnapshot } from '../../src/experiments';
import { opportunitySuccessOutcomes } from '../../src/telemetry';
import { toCityDashboardBehaviorMetrics } from '../../src/app';

/**
 * 138 evidence transcript: seven deterministic scenarios over the real behavior accumulators and
 * the real 082 adapter.
 *
 * The report contains no wall-clock timestamp, no random value and no machine-local measurement, so
 * `--check` compares the transcript exactly and a stale report fails loudly.
 */

export interface BehaviorMetricsReportContract {
  readonly eventKinds: readonly string[];
  readonly metricIds: readonly string[];
  readonly unavailableReasons: readonly string[];
  readonly rules: readonly string[];
  readonly retainedKeys: number;
  readonly idCodeUnits: number;
  readonly reactionTickHz: number;
  readonly sampleSeconds: number;
}

export interface BehaviorMetricsReportRow {
  readonly scope: string;
  readonly id: string;
  readonly unit: string;
  readonly state: string;
  readonly value: number | null;
  readonly sampleSize: number | null;
  readonly reason: string | null;
}

export interface BehaviorMetricsReportScenario {
  readonly name: string;
  readonly events: Readonly<{
    events: number;
    accepted: number;
    duplicates: number;
    rejected: number;
  }>;
  readonly metrics: readonly BehaviorMetricsReportRow[];
  readonly adapter: readonly Readonly<{
    id: string;
    unit: string;
    state: string;
    value: number | null;
    sampleSize: number | null;
    reason: string | null;
  }>[];
  readonly historyScans: number;
  readonly snapshotCalls: number;
}

export interface BehaviorMetricsCheck {
  readonly name: string;
  readonly expected: string | number | boolean | null;
  readonly actual: string | number | boolean | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface BehaviorMetricsReportFramerate {
  readonly tenHz: Readonly<{
    events: number;
    accepted: number;
    duplicates: number;
    eligible: number | null;
    successes: number | null;
    violations: number | null;
    complianceRate: number | null;
    violationRate: number | null;
  }>;
  readonly sixtyHz: Readonly<{
    events: number;
    accepted: number;
    duplicates: number;
    eligible: number | null;
    successes: number | null;
    violations: number | null;
    complianceRate: number | null;
    violationRate: number | null;
  }>;
}

export interface BehaviorMetricsReport {
  readonly version: typeof BEHAVIOR_METRICS_VERSION;
  readonly contract: BehaviorMetricsReportContract;
  readonly scenarios: readonly BehaviorMetricsReportScenario[];
  readonly framerate: BehaviorMetricsReportFramerate;
  readonly checks: readonly BehaviorMetricsCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

const FLEET_COUNTS = Object.freeze({ vehicles: 64, taxis: 24, civilians: 40 });

function fullFleet(): { counts: () => typeof FLEET_COUNTS } {
  return { counts: () => FLEET_COUNTS };
}

function opportunity(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventId: 'report:opportunity',
    kind: 'OPPORTUNITY_RESOLVED',
    opportunityId: 'report:opportunity',
    occurrence: 0,
    opportunityKind: 'STOP',
    vehicleId: 'taxi:1',
    resolvedTick: 120,
    outcome: 'STOPPED',
    success: true,
    violation: null,
    reactionTicks: null,
    dwellTicks: null,
    headwaySeconds: null,
    speedMps: null,
    limitMps: null,
    ...overrides,
  };
}

function speedSample(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventId: 'report:speed',
    kind: 'SPEED_SAMPLE',
    tick: 30,
    vehicleId: 'taxi:1',
    speedMps: 12,
    limitMps: null,
    ...overrides,
  };
}

function snapshotOf(service: BehaviorMetrics): BehaviorMetricsSnapshot {
  return service.snapshot({
    tick: 900,
    simulatedSeconds: 3600,
    fleet: fullFleet(),
  });
}

function flatten(snapshot: BehaviorMetricsSnapshot): readonly BehaviorMetricsReportRow[] {
  const rows: BehaviorMetricsReportRow[] = [];
  const push = (scope: string, metric: BehaviorMetricsSnapshot['overall']['successes']) =>
    rows.push(
      Object.freeze({
        scope,
        id: metric.id,
        unit: metric.unit,
        state: metric.state,
        value: metric.value,
        sampleSize: metric.sampleSize,
        reason: metric.reason,
      }),
    );
  for (const metric of [
    snapshot.overall.eligibleOpportunities,
    snapshot.overall.successes,
    snapshot.overall.violations,
    snapshot.overall.complianceRate,
    snapshot.overall.violationRate,
  ])
    push('ALL', metric);
  for (const entry of snapshot.byKind)
    for (const metric of [
      entry.eligibleOpportunities,
      entry.successes,
      entry.violations,
      entry.complianceRate,
      entry.violationRate,
    ])
      push(entry.kind, metric);
  for (const metric of [
    snapshot.stops.completeStops,
    snapshot.stops.stopDwellSeconds,
    snapshot.stops.meanStopDwellSeconds,
  ])
    push('stops', metric);
  for (const metric of [
    snapshot.reactions.reactionSamples,
    snapshot.reactions.meanReactionSeconds,
    snapshot.reactions.medianReactionSeconds,
  ])
    push('reactions', metric);
  for (const metric of [
    snapshot.speed.samples,
    snapshot.speed.meanMps,
    snapshot.speed.medianMps,
    snapshot.speed.p90Mps,
    snapshot.speed.limitedSamples,
    snapshot.speed.limitedSeconds,
    snapshot.speed.meanLimitMps,
    snapshot.speed.overLimitSamples,
    snapshot.speed.overLimitSeconds,
    snapshot.speed.overLimitFraction,
  ])
    push('speed', metric);
  for (const metric of [
    snapshot.headway.samples,
    snapshot.headway.ineligibleSamples,
    snapshot.headway.meanSeconds,
    snapshot.headway.medianSeconds,
    snapshot.headway.p90Seconds,
  ])
    push('headway', metric);
  return Object.freeze(rows);
}

function scenarioOf(
  name: string,
  service: BehaviorMetrics,
  snapshot: BehaviorMetricsSnapshot,
): BehaviorMetricsReportScenario {
  const stats = service.getStats();
  return Object.freeze({
    name,
    events: Object.freeze({
      events: stats.events,
      accepted: stats.accepted,
      duplicates: stats.duplicates,
      rejected: stats.rejected,
    }),
    metrics: flatten(snapshot),
    adapter: Object.freeze(
      toCityDashboardBehaviorMetrics(snapshot).map((entry) =>
        Object.freeze({
          id: entry.id,
          unit: entry.unit,
          state: entry.state,
          value: entry.value,
          sampleSize: entry.sampleSize,
          reason: entry.reason,
        }),
      ),
    ),
    historyScans: snapshot.historyScans,
    snapshotCalls: snapshot.snapshotCalls,
  });
}

function row(
  snapshot: BehaviorMetricsSnapshot,
  scope: string,
  id: string,
): BehaviorMetricsReportRow {
  const found = flatten(snapshot).find((entry) => entry.scope === scope && entry.id === id);
  if (found === undefined) throw new Error(`Missing report metric ${scope}.${id}`);
  return found;
}

function check(
  name: string,
  expected: string | number | boolean | null,
  actual: string | number | boolean | null,
  detail: string,
): BehaviorMetricsCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function framerateOf(
  service: BehaviorMetrics,
  snapshot: BehaviorMetricsSnapshot,
): BehaviorMetricsReportFramerate['tenHz'] {
  const stats = service.getStats();
  return Object.freeze({
    events: stats.events,
    accepted: stats.accepted,
    duplicates: stats.duplicates,
    eligible: row(snapshot, 'ALL', 'eligibleOpportunities').value,
    successes: row(snapshot, 'ALL', 'successes').value,
    violations: row(snapshot, 'ALL', 'violations').value,
    complianceRate: row(snapshot, 'ALL', 'complianceRate').value,
    violationRate: row(snapshot, 'ALL', 'violationRate').value,
  });
}

/** Deterministic duplicate-frame stream: every occurrence is re-sent once per frame. */
function duplicateFrames(framesPerOccurrence: number): readonly Record<string, unknown>[] {
  const occurrences = [
    {
      eventId: 'report:frame:stop:1',
      opportunityId: 'report:stop:1',
      outcome: 'STOPPED',
      success: true,
    },
    {
      eventId: 'report:frame:stop:2',
      opportunityId: 'report:stop:2',
      outcome: 'CROSSED_WITHOUT_STOP',
      success: false,
    },
    {
      eventId: 'report:frame:red:1',
      opportunityId: 'report:red:1',
      opportunityKind: 'RED',
      outcome: 'HELD',
      success: true,
    },
    {
      eventId: 'report:frame:red:2',
      opportunityId: 'report:red:2',
      opportunityKind: 'RED',
      outcome: 'CROSSED',
      success: false,
    },
  ];
  const events: Record<string, unknown>[] = [];
  for (const entry of occurrences)
    for (let frame = 0; frame < framesPerOccurrence; frame += 1)
      events.push(opportunity({ ...entry, eventId: `${entry.eventId}:frame:${frame}` }));
  return events;
}

export function runBehaviorMetricsReport(): BehaviorMetricsReport {
  // 1. STOP per eligible opportunity: two stops, one rolling crossing.
  const stopService = createBehaviorMetrics(),
    stopEvents = [
      opportunity({ eventId: 'report:stop:1', opportunityId: 'report:stop:1', dwellTicks: 90 }),
      opportunity({ eventId: 'report:stop:2', opportunityId: 'report:stop:2', dwellTicks: 150 }),
      opportunity({
        eventId: 'report:stop:3',
        opportunityId: 'report:stop:3',
        outcome: 'CROSSED_WITHOUT_STOP',
        success: false,
      }),
    ];
  stopService.ingestMany(stopEvents);
  const stopSnapshot = snapshotOf(stopService),
    stopScenario = scenarioOf('STOP per oportunitate eligibilă', stopService, stopSnapshot);

  // 2. RED per eligible opportunity: one held, one crossing.
  const redService = createBehaviorMetrics(),
    redEvents = [
      opportunity({
        eventId: 'report:red:1',
        opportunityId: 'report:red:1',
        opportunityKind: 'RED',
        outcome: 'HELD',
        success: true,
      }),
      opportunity({
        eventId: 'report:red:2',
        opportunityId: 'report:red:2',
        opportunityKind: 'RED',
        outcome: 'CROSSED',
        success: false,
      }),
    ];
  redService.ingestMany(redEvents);
  const redSnapshot = snapshotOf(redService),
    redScenario = scenarioOf('RED per oportunitate eligibilă', redService, redSnapshot);

  // 3. The same four occurrences at 10 Hz and 60 Hz: only the duplicate counters differ.
  const tenService = createBehaviorMetrics(),
    sixtyService = createBehaviorMetrics(),
    tenBatch = tenService.ingestMany(duplicateFrames(10)),
    sixtyBatch = sixtyService.ingestMany(duplicateFrames(60));
  const tenSnapshot = snapshotOf(tenService),
    sixtySnapshot = snapshotOf(sixtyService),
    cadenceScenario = scenarioOf('cadre duplicate 10 Hz vs 60 Hz', tenService, tenSnapshot);

  // Overall aggregation over the two real-kind scenarios; not a scenario of its own.
  const combined = createBehaviorMetrics();
  combined.ingestMany([...stopEvents, ...redEvents]);
  const combinedSnapshot = snapshotOf(combined);

  // 4. No opportunity at all: the denominator is unavailable, never a perfect rate.
  const emptyService = createBehaviorMetrics(),
    emptySnapshot = snapshotOf(emptyService),
    emptyScenario = scenarioOf('numitor zero', emptyService, emptySnapshot);

  // 5. A real zero with a real denominator: three stops, zero violations.
  const zeroService = createBehaviorMetrics();
  zeroService.ingestMany([
    opportunity({ eventId: 'report:zero:1', opportunityId: 'report:zero:1' }),
    opportunity({ eventId: 'report:zero:2', opportunityId: 'report:zero:2' }),
    opportunity({ eventId: 'report:zero:3', opportunityId: 'report:zero:3' }),
  ]);
  const zeroSnapshot = snapshotOf(zeroService),
    zeroScenario = scenarioOf('zero real', zeroService, zeroSnapshot);

  // 6. Speed distribution and headway eligibility from the same real observations.
  const speedService = createBehaviorMetrics();
  speedService.ingestMany([
    speedSample({ eventId: 'report:speed:1', speedMps: 10, limitMps: 10 }),
    speedSample({ eventId: 'report:speed:2', speedMps: 15, limitMps: 10 }),
    speedSample({ eventId: 'report:speed:3', speedMps: 25, limitMps: 10 }),
    speedSample({ eventId: 'report:speed:4', speedMps: 5, limitMps: null }),
    opportunity({
      eventId: 'report:headway:moving',
      opportunityId: 'report:headway:moving',
      headwaySeconds: 1.2,
      speedMps: 12,
    }),
    opportunity({
      eventId: 'report:headway:standing',
      opportunityId: 'report:headway:standing',
      headwaySeconds: 2,
      speedMps: 0,
    }),
    opportunity({
      eventId: 'report:headway:unlimited',
      opportunityId: 'report:headway:unlimited',
      headwaySeconds: null,
      speedMps: 12,
    }),
  ]);
  const speedSnapshot = snapshotOf(speedService),
    speedScenario = scenarioOf('viteză și headway eligibil', speedService, speedSnapshot);

  // 7. GREEN reaction samples; a RED reaction is not part of the green reaction indicator.
  const reactionService = createBehaviorMetrics();
  reactionService.ingestMany([
    opportunity({
      eventId: 'report:green:1',
      opportunityId: 'report:green:1',
      opportunityKind: 'GREEN',
      outcome: 'RELEASED',
      success: true,
    }),
    opportunity({
      eventId: 'report:green:2',
      opportunityId: 'report:green:2',
      opportunityKind: 'GREEN',
      outcome: 'MISSED',
      success: false,
      reactionTicks: 90,
    }),
    opportunity({
      eventId: 'report:green:3',
      opportunityId: 'report:green:3',
      opportunityKind: 'GREEN',
      outcome: 'RELEASED',
      success: true,
      reactionTicks: 150,
    }),
    opportunity({
      eventId: 'report:red:reaction',
      opportunityId: 'report:red:reaction',
      opportunityKind: 'RED',
      outcome: 'HELD',
      success: true,
      reactionTicks: 600,
    }),
  ]);
  const reactionSnapshot = snapshotOf(reactionService),
    reactionScenario = scenarioOf('reacție GREEN', reactionService, reactionSnapshot);

  const stopEligible = row(stopSnapshot, 'STOP', 'eligibleOpportunities'),
    stopSuccesses = row(stopSnapshot, 'STOP', 'successes'),
    stopViolations = row(stopSnapshot, 'STOP', 'violations'),
    stopCompliance = row(stopSnapshot, 'STOP', 'complianceRate'),
    stopViolation = row(stopSnapshot, 'STOP', 'violationRate'),
    redEligible = row(redSnapshot, 'RED', 'eligibleOpportunities'),
    redSuccesses = row(redSnapshot, 'RED', 'successes'),
    redViolations = row(redSnapshot, 'RED', 'violations'),
    redCompliance = row(redSnapshot, 'RED', 'complianceRate'),
    redViolation = row(redSnapshot, 'RED', 'violationRate'),
    overallTen = row(tenSnapshot, 'ALL', 'eligibleOpportunities'),
    overallSixty = row(sixtySnapshot, 'ALL', 'eligibleOpportunities'),
    emptyRate = row(emptySnapshot, 'ALL', 'violationRate'),
    realZeroViolations = row(zeroSnapshot, 'STOP', 'violations'),
    realZeroRate = row(zeroSnapshot, 'STOP', 'violationRate'),
    speedSamples = row(speedSnapshot, 'speed', 'speedSamples'),
    overLimitSamples = row(speedSnapshot, 'speed', 'overLimitSamples'),
    overLimitSeconds = row(speedSnapshot, 'speed', 'overLimitSeconds'),
    overLimitFraction = row(speedSnapshot, 'speed', 'overLimitFraction'),
    headwaySamples = row(speedSnapshot, 'headway', 'headwaySamples'),
    headwayIneligible = row(speedSnapshot, 'headway', 'ineligibleHeadwaySamples'),
    headwayMean = row(speedSnapshot, 'headway', 'meanHeadwaySeconds'),
    reactionSamples = row(reactionSnapshot, 'reactions', 'reactionSamples'),
    reactionMean = row(reactionSnapshot, 'reactions', 'meanReactionSeconds'),
    adapter = stopScenario.adapter;

  const checks: BehaviorMetricsCheck[] = [
    check(
      'contract-version',
      BEHAVIOR_METRICS_VERSION,
      BEHAVIOR_METRICS_VERSION,
      '138 behavior metrics contract version',
    ),
    check(
      'closed-event-kinds',
      2,
      behaviorEventKinds.length,
      `the service ingests exactly ${behaviorEventKinds.length} closed event kinds`,
    ),
    check('metric-count', 26, BEHAVIOR_METRIC_IDS.length, 'the closed metric identity set'),
    check(
      'unavailable-reason-count',
      7,
      behaviorUnavailableReasons.length,
      'the closed unavailable vocabulary',
    ),
    check(
      'compliance-unit',
      'percentage',
      BEHAVIOR_UNIT_BY_ID.complianceRate,
      'a compliance rate is a percentage of eligible opportunities',
    ),
    check(
      'violation-rate-unit',
      'percentage',
      BEHAVIOR_UNIT_BY_ID.violationRate,
      'a violation rate is a percentage of eligible opportunities',
    ),
    check(
      'over-limit-fraction-unit',
      'ratio',
      BEHAVIOR_UNIT_BY_ID.overLimitFraction,
      'the over-limit fraction carries a ratio unit',
    ),
    check(
      'success-never-violation',
      true,
      opportunitySuccessOutcomes.every((outcome) => BEHAVIOR_OUTCOME_VIOLATION[outcome] === false),
      'the 086 success half is never a violation',
    ),
    check('stop-eligible', 3, stopEligible.value, 'three STOP occurrences are three opportunities'),
    check('stop-successes', 2, stopSuccesses.value, 'two STOP occurrences resolved STOPPED'),
    check(
      'stop-violations',
      1,
      stopViolations.value,
      'the rolling crossing is exactly one STOP violation',
    ),
    check(
      'stop-compliance-percentage',
      (2 / 3) * 100,
      stopCompliance.value,
      'compliance is successes / eligible × 100',
    ),
    check(
      'stop-violation-percentage',
      (1 / 3) * 100,
      stopViolation.value,
      'violation is violations / eligible × 100',
    ),
    check(
      'stop-violation-sample',
      3,
      stopViolation.sampleSize,
      'the rate reports the eligible STOP denominator',
    ),
    check(
      'stop-complete-count',
      2,
      row(stopSnapshot, 'stops', 'completeStops').value,
      'complete stops are counted separately',
    ),
    check(
      'stop-dwell-seconds',
      4,
      row(stopSnapshot, 'stops', 'stopDwellSeconds').value,
      '240 dwell ticks at 60 Hz are four observed seconds',
    ),
    check(
      'stop-mean-dwell-seconds',
      2,
      row(stopSnapshot, 'stops', 'meanStopDwellSeconds').value,
      'four dwell seconds over two samples',
    ),
    check('red-eligible', 2, redEligible.value, 'two RED occurrences are two opportunities'),
    check('red-successes', 1, redSuccesses.value, 'one RED occurrence was held'),
    check('red-violations', 1, redViolations.value, 'one RED occurrence was crossed'),
    check('red-compliance', 50, redCompliance.value, 'one of two RED opportunities complied'),
    check('red-violation', 50, redViolation.value, 'one of two RED opportunities was a violation'),
    check(
      'overall-eligible',
      5,
      row(combinedSnapshot, 'ALL', 'eligibleOpportunities').value,
      'overall aggregates the STOP and RED denominators without double counting',
    ),
    check(
      'overall-successes',
      3,
      row(combinedSnapshot, 'ALL', 'successes').value,
      'two stops and one held red are three successes',
    ),
    check(
      'overall-violations',
      2,
      row(combinedSnapshot, 'ALL', 'violations').value,
      'one rolling stop and one red crossing are two violations',
    ),
    check(
      'overall-violation-rate',
      40,
      row(combinedSnapshot, 'ALL', 'violationRate').value,
      'two violations of five opportunities are 40 %',
    ),
    check(
      'cadence-denominator-identical',
      overallTen.value,
      overallSixty.value,
      '10 Hz and 60 Hz duplicate frames produce the same opportunity denominator',
    ),
    check(
      'cadence-numerators-identical',
      JSON.stringify([
        row(tenSnapshot, 'ALL', 'successes').value,
        row(tenSnapshot, 'ALL', 'violations').value,
      ]),
      JSON.stringify([
        row(sixtySnapshot, 'ALL', 'successes').value,
        row(sixtySnapshot, 'ALL', 'violations').value,
      ]),
      '10 Hz and 60 Hz duplicate frames produce the same numerators',
    ),
    check('cadence-accepted-10hz', 4, tenBatch.accepted, 'four distinct occurrences at 10 Hz'),
    check('cadence-accepted-60hz', 4, sixtyBatch.accepted, 'four distinct occurrences at 60 Hz'),
    check(
      'cadence-duplicates-10hz',
      36,
      tenBatch.duplicates,
      'nine duplicate frames per occurrence',
    ),
    check(
      'cadence-duplicates-60hz',
      236,
      sixtyBatch.duplicates,
      'fifty-nine duplicate frames per occurrence',
    ),
    check(
      'zero-denominator-state',
      'UNAVAILABLE',
      emptyRate.state,
      'an empty denominator is unavailable',
    ),
    check(
      'zero-denominator-value',
      null,
      emptyRate.value,
      'the unavailable rate carries no number',
    ),
    check(
      'zero-denominator-reason',
      'NO_OPPORTUNITIES',
      emptyRate.reason,
      'the closed reason names the empty opportunity denominator',
    ),
    check(
      'zero-denominator-not-perfect',
      true,
      emptyRate.state !== 'AVAILABLE',
      'an empty denominator is never reported as a perfect 0 % or 100 %',
    ),
    check(
      'real-zero-state',
      'AVAILABLE',
      realZeroRate.state,
      'a real zero with a real denominator stays available',
    ),
    check('real-zero-value', 0, realZeroRate.value, 'three compliant stops mean zero violations'),
    check('real-zero-sample', 3, realZeroRate.sampleSize, 'the real zero reports its denominator'),
    check('real-zero-count', 0, realZeroViolations.value, 'the violation count is a real zero'),
    check('speed-samples', 4, speedSamples.value, 'four speed samples were accepted'),
    check(
      'speed-mean',
      13.75,
      row(speedSnapshot, 'speed', 'meanSpeedMps').value,
      'mean of 10, 15, 25 and 5 m/s',
    ),
    check(
      'speed-limited-samples',
      3,
      row(speedSnapshot, 'speed', 'limitedSpeedSamples').value,
      'only three samples carried a certifiable limit',
    ),
    check('over-limit-samples', 2, overLimitSamples.value, 'two samples exceeded their limit'),
    check('over-limit-seconds', 0.2, overLimitSeconds.value, 'two accepted samples × 0.1 s'),
    check(
      'over-limit-fraction',
      2 / 3,
      overLimitFraction.value,
      'over-limit fraction over time with a valid limit only',
    ),
    check(
      'headway-eligible-samples',
      1,
      headwaySamples.value,
      'only the moving-ego headway enters the distribution',
    ),
    check(
      'headway-ineligible-samples',
      1,
      headwayIneligible.value,
      'the standing-ego headway is reported as ineligible',
    ),
    check('headway-mean', 1.2, headwayMean.value, 'the eligible headway sample is 1.2 s'),
    check(
      'reaction-samples',
      2,
      reactionSamples.value,
      'two GREEN opportunities carried a reaction',
    ),
    check('reaction-mean', 2, reactionMean.value, '1.5 s and 2.5 s reaction samples'),
    check(
      'reaction-excludes-red',
      true,
      reactionSamples.value === 2,
      'the RED reaction sample is not part of the GREEN reaction indicator',
    ),
    check('history-scans', 0, stopScenario.historyScans, 'the snapshot never rescans a history'),
    check(
      'adapter-ids',
      'violations',
      adapter.map((entry) => entry.id).join(','),
      '138 adapts violations only',
    ),
    check(
      'adapter-unit',
      'count',
      adapter[0]?.unit ?? 'missing',
      'violations use the 082 count unit',
    ),
    check('adapter-value', 1, adapter[0]?.value ?? null, 'the STOP scenario has one violation'),
    check(
      'adapter-sample',
      3,
      adapter[0]?.sampleSize ?? null,
      'the adapter reports the eligible denominator',
    ),
    check('retained-keys-limit', 8192, BEHAVIOR_LIMITS.retainedKeys, 'bounded idempotency memory'),
  ];

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: BEHAVIOR_METRICS_VERSION,
    contract: Object.freeze({
      eventKinds: Object.freeze([...behaviorEventKinds]),
      metricIds: Object.freeze([...BEHAVIOR_METRIC_IDS]),
      unavailableReasons: Object.freeze([...behaviorUnavailableReasons]),
      rules: Object.freeze([
        'the opportunity denominator is the set of distinct (opportunityId, occurrence) identities',
        'a repeated frame of the same occurrence is DUPLICATE and changes no numerator or denominator',
        '10 Hz and 60 Hz duplicate streams produce identical denominators and numerators',
        'an empty denominator is UNAVAILABLE with value:null; a real zero with a denominator is AVAILABLE 0',
        'success comes from the 086 opportunitySuccessOutcomes; a violation comes from the real failure table',
        'speed and headway distributions keep bounded histograms and never retain a full history',
        'over-limit duration uses only samples with a certifiable limit and a declared sample interval',
        'historyScans is structurally 0 and the snapshot is frozen',
      ]),
      retainedKeys: BEHAVIOR_LIMITS.retainedKeys,
      idCodeUnits: BEHAVIOR_LIMITS.idCodeUnits,
      reactionTickHz: BEHAVIOR_LIMITS.reactionTickHz,
      sampleSeconds: BEHAVIOR_LIMITS.sampleSeconds,
    }),
    scenarios: Object.freeze([
      stopScenario,
      redScenario,
      cadenceScenario,
      emptyScenario,
      zeroScenario,
      speedScenario,
      reactionScenario,
    ]),
    framerate: Object.freeze({
      tenHz: framerateOf(tenService, tenSnapshot),
      sixtyHz: framerateOf(sixtyService, sixtySnapshot),
    }),
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}

function metricRow(entry: BehaviorMetricsReportRow): string {
  return `| ${entry.scope} | ${entry.id} | ${entry.unit} | ${entry.state} | ${entry.value === null ? 'null' : entry.value} | ${entry.reason ?? '—'} | ${entry.sampleSize ?? '—'} |`;
}

export function behaviorMetricsReportMarkdown(report: BehaviorMetricsReport): string {
  const scenarioSections = report.scenarios
      .map(
        (entry) => `### ${entry.name}

| Value | Result |
| --- | --- |
| Events | ${entry.events.events} attempted · ${entry.events.accepted} accepted · ${entry.events.duplicates} duplicates · ${entry.events.rejected} rejected |
| History scans | ${entry.historyScans} |
| Snapshots | ${entry.snapshotCalls} |
| 082 adapter | ${entry.adapter.map((metric) => `${metric.id}=${metric.state === 'AVAILABLE' ? String(metric.value) : 'Indisponibil'}`).join(' · ')} |

| Scope | Metric | Unit | State | Value | Reason | Sample |
| --- | --- | --- | --- | ---: | --- | ---: |
${entry.metrics.map(metricRow).join('\n')}
`,
      )
      .join('\n'),
    checkRows = report.checks
      .map(
        (entry) =>
          `| ${entry.name} | ${String(entry.expected)} | ${String(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail} |`,
      )
      .join('\n'),
    framerate = report.framerate;
  return `# 138 behavior metrics report

Machine-readable transcript: [report.json](report.json). Generated by \`npm run metrics:behavior\`.
The report contains no wall-clock timestamp, no random value and no machine-local measurement, so
\`--check\` compares it exactly.

Version: \`${report.version}\`. The report drives the real \`createBehaviorMetrics\` accumulators and
the real 082 metric adapter over deterministic opportunities and speed samples.

## Contract

Event kinds: ${report.contract.eventKinds.join(', ')}.
Unavailable reasons: ${report.contract.unavailableReasons.join(', ')}.
Idempotency memory: ${report.contract.retainedKeys} keys, ${report.contract.idCodeUnits} code units per
identity. Reaction ticks are converted at ${report.contract.reactionTickHz} Hz; one accepted speed
sample is declared as ${report.contract.sampleSeconds} s.

Rules: ${report.contract.rules.join('; ')}.

## Framerate independence

| Stream | Events | Accepted | Duplicates | Eligible | Successes | Violations | Compliance % | Violation % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 Hz duplicate frames | ${framerate.tenHz.events} | ${framerate.tenHz.accepted} | ${framerate.tenHz.duplicates} | ${String(framerate.tenHz.eligible)} | ${String(framerate.tenHz.successes)} | ${String(framerate.tenHz.violations)} | ${String(framerate.tenHz.complianceRate)} | ${String(framerate.tenHz.violationRate)} |
| 60 Hz duplicate frames | ${framerate.sixtyHz.events} | ${framerate.sixtyHz.accepted} | ${framerate.sixtyHz.duplicates} | ${String(framerate.sixtyHz.eligible)} | ${String(framerate.sixtyHz.successes)} | ${String(framerate.sixtyHz.violations)} | ${String(framerate.sixtyHz.complianceRate)} | ${String(framerate.sixtyHz.violationRate)} |

The two streams describe the same four physical occurrences; only the duplicate counters differ.

## Scenarios

${scenarioSections}
## Checks

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
${checkRows}

## Summary

- Checks: ${report.summary.passed}/${report.summary.checks}
- Scenarios: ${report.scenarios.length}
- Overall: ${report.summary.pass ? 'PASS' : 'FAIL'}
`;
}

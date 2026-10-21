import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BEHAVIOR_HISTOGRAMS,
  BEHAVIOR_LIMITS,
  BEHAVIOR_METRIC_IDS,
  BEHAVIOR_METRICS_VERSION,
  BEHAVIOR_OUTCOME_VIOLATION,
  BEHAVIOR_UNIT_BY_ID,
  behaviorEventKinds,
  behaviorMetricsVersion,
  behaviorRejectionReasons,
  behaviorUnavailableReasons,
  createBehaviorMetrics,
} from '../../src/experiments';
import type { BehaviorMetricsSnapshot, BehaviorMetricValue } from '../../src/experiments';
import { opportunitySuccessOutcomes } from '../../src/telemetry';
import type { OpportunityRecord } from '../../src/telemetry';
import {
  ingestOpportunityRecord,
  ingestSpeedSample,
  readBehaviorMetricSnapshot,
  toCityDashboardBehaviorMetrics,
} from '../../src/app';

const FLEET_COUNTS = Object.freeze({ vehicles: 64, taxis: 24, civilians: 40 });

function fleetStub(counts: { vehicles: number; taxis: number; civilians: number } = FLEET_COUNTS): {
  counts: () => typeof counts;
} {
  return { counts: () => Object.freeze({ ...counts }) };
}

function opportunity(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventId: 'event:opportunity:1',
    kind: 'OPPORTUNITY_RESOLVED',
    opportunityId: 'opportunity:stop:1',
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
    eventId: 'event:speed:1',
    kind: 'SPEED_SAMPLE',
    tick: 30,
    vehicleId: 'taxi:1',
    speedMps: 12,
    limitMps: null,
    ...overrides,
  };
}

function read(
  service: ReturnType<typeof createBehaviorMetrics>,
  overrides: Record<string, unknown> = {},
): BehaviorMetricsSnapshot {
  return service.snapshot({ tick: 900, simulatedSeconds: 3600, ...overrides });
}

function group(snapshot: BehaviorMetricsSnapshot, kind: string) {
  const found = snapshot.byKind.find((entry) => entry.kind === kind);
  assert.ok(found !== undefined, `missing kind ${kind}`);
  return found;
}

function closeTo(actual: number | null, expected: number, epsilon = 1e-9): boolean {
  return actual !== null && Math.abs(actual - expected) <= epsilon;
}

function unavailable(metric: BehaviorMetricValue, reason: string): boolean {
  return metric.state === 'UNAVAILABLE' && metric.value === null && metric.reason === reason;
}

function record(overrides: Partial<OpportunityRecord> = {}): OpportunityRecord {
  return Object.freeze({
    id: 'opportunity-red-1',
    kind: 'RED',
    state: 'RESOLVED',
    outcome: 'CROSSED',
    result: 'FAILURE',
    truncationReason: null,
    vehicleId: 'taxi:1',
    incarnation: 'taxi-1',
    segmentIds: Object.freeze(['segment:1']),
    learningEligible: true,
    occurrence: 0,
    openedTick: 100,
    lastTick: 160,
    resolvedTick: 160,
    observationCount: 3,
    stimulus: Object.freeze({
      stopLineId: null,
      signalId: 'signal:1',
      intersectionId: 'intersection:1',
      movementId: 'movement:1',
      movementPhaseStartedTick: 90,
      fromLaneId: null,
      toLaneId: null,
      relationIds: Object.freeze([]),
    }),
    ...overrides,
  });
}

test('138 exposes the versioned closed behavior contract', () => {
  assert.equal(BEHAVIOR_METRICS_VERSION, '138-behavior-metrics-v1');
  assert.equal(behaviorMetricsVersion, BEHAVIOR_METRICS_VERSION);
  assert.deepEqual([...behaviorEventKinds], ['OPPORTUNITY_RESOLVED', 'SPEED_SAMPLE']);
  assert.equal(BEHAVIOR_METRIC_IDS.length, 26);
  assert.deepEqual(
    [...behaviorRejectionReasons],
    [
      'INVALID_SHAPE',
      'UNKNOWN_FIELD',
      'UNKNOWN_KIND',
      'UNKNOWN_OUTCOME',
      'INCONSISTENT_OUTCOME',
      'INVALID_IDENTITY',
      'INVALID_NUMBER',
      'LIMIT_EXCEEDED',
    ],
  );
  assert.deepEqual(
    [...behaviorUnavailableReasons],
    [
      'NO_OPPORTUNITIES',
      'NO_REACTION_SAMPLES',
      'NO_STOP_DWELL',
      'NO_SPEED_SAMPLES',
      'NO_LIMIT',
      'NO_ELIGIBLE_SPEED',
      'NO_HEADWAY_SAMPLES',
    ],
  );
  assert.equal(BEHAVIOR_UNIT_BY_ID.complianceRate, 'percentage');
  assert.equal(BEHAVIOR_UNIT_BY_ID.violationRate, 'percentage');
  assert.equal(BEHAVIOR_UNIT_BY_ID.overLimitFraction, 'ratio');
  assert.equal(BEHAVIOR_UNIT_BY_ID.meanSpeedMps, 'mps');
  assert.equal(BEHAVIOR_UNIT_BY_ID.meanReactionSeconds, 'seconds');
  assert.equal(BEHAVIOR_UNIT_BY_ID.eligibleOpportunities, 'count');
  assert.equal(BEHAVIOR_LIMITS.retainedKeys, 8192);
  assert.equal(BEHAVIOR_LIMITS.reactionTickHz, 60);
  assert.equal(BEHAVIOR_LIMITS.minimumEligibleSpeedMps, 0.1);
  assert.equal(BEHAVIOR_HISTOGRAMS.speed.binWidth, 0.5);
  // The success half of the real 086 vocabulary is never a violation.
  for (const outcome of opportunitySuccessOutcomes)
    assert.equal(BEHAVIOR_OUTCOME_VIOLATION[outcome], false);
  assert.equal(BEHAVIOR_OUTCOME_VIOLATION.CROSSED_WITHOUT_STOP, true);
  assert.equal(BEHAVIOR_OUTCOME_VIOLATION.CROSSED, true);
  assert.equal(BEHAVIOR_OUTCOME_VIOLATION.PROCEEDED, true);
  assert.equal(BEHAVIOR_OUTCOME_VIOLATION.MISSED, false);
  assert.equal(BEHAVIOR_OUTCOME_VIOLATION.ABORTED, false);
});

test('138 reports STOP and RED per eligible opportunity with rates and units', () => {
  const service = createBehaviorMetrics();
  const batch = service.ingestMany([
    opportunity({ eventId: 'stop:1', opportunityId: 'stop:1', dwellTicks: 90 }),
    opportunity({ eventId: 'stop:2', opportunityId: 'stop:2', dwellTicks: 150 }),
    opportunity({
      eventId: 'stop:3',
      opportunityId: 'stop:3',
      outcome: 'CROSSED_WITHOUT_STOP',
      success: false,
    }),
    opportunity({
      eventId: 'red:1',
      opportunityId: 'red:1',
      opportunityKind: 'RED',
      outcome: 'HELD',
      success: true,
    }),
    opportunity({
      eventId: 'red:2',
      opportunityId: 'red:2',
      opportunityKind: 'RED',
      outcome: 'CROSSED',
      success: false,
    }),
  ]);
  assert.deepEqual(batch, { events: 5, accepted: 5, duplicates: 0, rejected: 0 });

  const snapshot = read(service);
  const stop = group(snapshot, 'STOP'),
    red = group(snapshot, 'RED');
  assert.equal(stop.eligibleOpportunities.value, 3);
  assert.equal(stop.eligibleOpportunities.unit, 'count');
  assert.equal(stop.successes.value, 2);
  assert.equal(stop.violations.value, 1);
  assert.equal(stop.complianceRate.unit, 'percentage');
  assert.ok(closeTo(stop.complianceRate.value, 200 / 3));
  assert.ok(closeTo(stop.violationRate.value, 100 / 3));
  assert.equal(stop.violationRate.sampleSize, 3);
  assert.equal(red.eligibleOpportunities.value, 2);
  assert.equal(red.successes.value, 1);
  assert.equal(red.violations.value, 1);
  assert.equal(red.complianceRate.value, 50);
  assert.equal(red.violationRate.value, 50);

  // Complete stops and dwell are reported separately, in seconds.
  assert.equal(snapshot.stops.completeStops.value, 2);
  assert.equal(snapshot.stops.stopDwellSeconds.unit, 'seconds');
  assert.equal(snapshot.stops.stopDwellSeconds.value, 240 / 60);
  assert.equal(snapshot.stops.meanStopDwellSeconds.value, 2);

  // Overall aggregates every kind without inventing a compatible denominator.
  assert.equal(snapshot.overall.kind, 'ALL');
  assert.equal(snapshot.overall.eligibleOpportunities.value, 5);
  assert.equal(snapshot.overall.successes.value, 3);
  assert.equal(snapshot.overall.violations.value, 2);
  assert.equal(snapshot.overall.violationRate.value, 40);
});

test('138 counts YIELD and LANE_CHANGE per opportunity without inventing violations', () => {
  const service = createBehaviorMetrics();
  service.ingestMany([
    opportunity({
      eventId: 'yield:1',
      opportunityId: 'yield:1',
      opportunityKind: 'YIELD',
      outcome: 'YIELDED',
      success: true,
    }),
    opportunity({
      eventId: 'yield:2',
      opportunityId: 'yield:2',
      opportunityKind: 'YIELD',
      outcome: 'PROCEEDED',
      success: false,
    }),
    opportunity({
      eventId: 'lane:1',
      opportunityId: 'lane:1',
      opportunityKind: 'LANE_CHANGE',
      outcome: 'ABORTED',
      success: false,
    }),
  ]);
  const snapshot = read(service);
  assert.equal(group(snapshot, 'YIELD').eligibleOpportunities.value, 2);
  assert.equal(group(snapshot, 'YIELD').violations.value, 1);
  assert.equal(group(snapshot, 'LANE_CHANGE').eligibleOpportunities.value, 1);
  assert.equal(group(snapshot, 'LANE_CHANGE').violations.value, 0);
  assert.equal(group(snapshot, 'LANE_CHANGE').complianceRate.value, 0);
});

test('138 duplicate frames at 10 Hz and 60 Hz produce identical denominators and numerators', () => {
  const occurrences = [
    { eventId: 'frame:stop:1', opportunityId: 'stop:1', outcome: 'STOPPED', success: true },
    {
      eventId: 'frame:stop:2',
      opportunityId: 'stop:2',
      outcome: 'CROSSED_WITHOUT_STOP',
      success: false,
    },
    {
      eventId: 'frame:red:1',
      opportunityId: 'red:1',
      opportunityKind: 'RED',
      outcome: 'HELD',
      success: true,
    },
    {
      eventId: 'frame:red:2',
      opportunityId: 'red:2',
      opportunityKind: 'RED',
      outcome: 'CROSSED',
      success: false,
    },
  ];
  const stream = (framesPerOccurrence: number) => {
    const events: Record<string, unknown>[] = [];
    for (const entry of occurrences)
      for (let frame = 0; frame < framesPerOccurrence; frame += 1)
        events.push(opportunity({ ...entry, eventId: `${entry.eventId}:frame:${frame}` }));
    return events;
  };
  const ten = createBehaviorMetrics(),
    sixty = createBehaviorMetrics();
  const tenBatch = ten.ingestMany(stream(10)),
    sixtyBatch = sixty.ingestMany(stream(60));
  assert.equal(tenBatch.accepted, 4);
  assert.equal(tenBatch.duplicates, 36);
  assert.equal(sixtyBatch.accepted, 4);
  assert.equal(sixtyBatch.duplicates, 236);

  const tenSnapshot = read(ten),
    sixtySnapshot = read(sixty);
  const projection = (snapshot: BehaviorMetricsSnapshot) => ({
    overall: {
      eligible: snapshot.overall.eligibleOpportunities.value,
      successes: snapshot.overall.successes.value,
      violations: snapshot.overall.violations.value,
      compliance: snapshot.overall.complianceRate.value,
      violation: snapshot.overall.violationRate.value,
    },
    byKind: snapshot.byKind.map((entry) => ({
      kind: entry.kind,
      eligible: entry.eligibleOpportunities.value,
      successes: entry.successes.value,
      violations: entry.violations.value,
      compliance: entry.complianceRate.value,
      violation: entry.violationRate.value,
    })),
  });
  assert.deepEqual(projection(tenSnapshot), projection(sixtySnapshot));
  assert.deepEqual(projection(tenSnapshot), {
    overall: { eligible: 4, successes: 2, violations: 2, compliance: 50, violation: 50 },
    byKind: [
      { kind: 'STOP', eligible: 2, successes: 1, violations: 1, compliance: 50, violation: 50 },
      { kind: 'RED', eligible: 2, successes: 1, violations: 1, compliance: 50, violation: 50 },
      {
        kind: 'GREEN',
        eligible: 0,
        successes: 0,
        violations: 0,
        compliance: null,
        violation: null,
      },
      {
        kind: 'YIELD',
        eligible: 0,
        successes: 0,
        violations: 0,
        compliance: null,
        violation: null,
      },
      {
        kind: 'LANE_CHANGE',
        eligible: 0,
        successes: 0,
        violations: 0,
        compliance: null,
        violation: null,
      },
    ],
  });
});

test('138 counts distinct occurrences separately and dedupes the repeated one', () => {
  const service = createBehaviorMetrics(),
    first = opportunity({ eventId: 'stop:occurrence:0' }),
    firstAgain = opportunity({ eventId: 'stop:occurrence:0:replayed' }),
    second = opportunity({ eventId: 'stop:occurrence:1', occurrence: 1 });
  assert.equal(service.ingest(first).status, 'ACCEPTED');
  assert.equal(service.ingest(firstAgain).status, 'DUPLICATE');
  assert.equal(service.ingest(second).status, 'ACCEPTED');
  const snapshot = read(service);
  assert.equal(snapshot.overall.eligibleOpportunities.value, 2);
  assert.equal(service.getStats().duplicates, 1);
  assert.equal(service.getStats().accepted, 2);
});

test('138 dedupes a repeated speed event id without double counting samples or duration', () => {
  const service = createBehaviorMetrics(),
    sample = speedSample({ speedMps: 30, limitMps: 20 });
  assert.equal(service.ingest(sample).status, 'ACCEPTED');
  assert.equal(service.ingest(sample).status, 'DUPLICATE');
  const snapshot = read(service);
  assert.equal(snapshot.speed.samples.value, 1);
  assert.equal(snapshot.speed.limitedSamples.value, 1);
  assert.equal(snapshot.speed.overLimitSamples.value, 1);
  assert.equal(snapshot.speed.overLimitSeconds.value, BEHAVIOR_LIMITS.sampleSeconds);
  assert.equal(snapshot.speed.limitedSeconds.value, BEHAVIOR_LIMITS.sampleSeconds);
  assert.equal(snapshot.speed.overLimitFraction.value, 1);
  assert.equal(service.getStats().duplicates, 1);
});

test('138 reports an empty denominator as UNAVAILABLE, never a perfect 0 or 1', () => {
  const snapshot = read(createBehaviorMetrics());
  const overall = snapshot.overall,
    stop = group(snapshot, 'STOP');
  assert.equal(overall.eligibleOpportunities.state, 'AVAILABLE');
  assert.equal(overall.eligibleOpportunities.value, 0);
  assert.ok(unavailable(overall.complianceRate, 'NO_OPPORTUNITIES'));
  assert.ok(unavailable(overall.violationRate, 'NO_OPPORTUNITIES'));
  assert.equal(overall.complianceRate.sampleSize, null);
  assert.ok(unavailable(stop.violationRate, 'NO_OPPORTUNITIES'));
  assert.ok(unavailable(snapshot.reactions.meanReactionSeconds, 'NO_REACTION_SAMPLES'));
  assert.ok(unavailable(snapshot.stops.meanStopDwellSeconds, 'NO_STOP_DWELL'));
  assert.ok(unavailable(snapshot.speed.meanMps, 'NO_SPEED_SAMPLES'));
  assert.ok(unavailable(snapshot.speed.overLimitFraction, 'NO_LIMIT'));
  assert.ok(unavailable(snapshot.headway.meanSeconds, 'NO_HEADWAY_SAMPLES'));
  assert.equal(snapshot.historyScans, 0);
});

test('138 keeps a real zero with a real denominator AVAILABLE', () => {
  const service = createBehaviorMetrics();
  service.ingestMany([
    opportunity({ eventId: 'stop:1', opportunityId: 'stop:1' }),
    opportunity({ eventId: 'stop:2', opportunityId: 'stop:2' }),
    opportunity({ eventId: 'stop:3', opportunityId: 'stop:3' }),
  ]);
  const snapshot = read(service),
    stop = group(snapshot, 'STOP');
  assert.equal(stop.violations.state, 'AVAILABLE');
  assert.equal(stop.violations.value, 0);
  assert.equal(stop.violationRate.state, 'AVAILABLE');
  assert.equal(stop.violationRate.value, 0);
  assert.equal(stop.violationRate.sampleSize, 3);
  assert.equal(stop.complianceRate.value, 100);
});

test('138 reports a real zero over-limit fraction with a real limit denominator', () => {
  const service = createBehaviorMetrics();
  service.ingestMany([
    speedSample({ eventId: 'speed:1', speedMps: 10, limitMps: 20 }),
    speedSample({ eventId: 'speed:2', speedMps: 15, limitMps: 20 }),
  ]);
  const snapshot = read(service);
  assert.equal(snapshot.speed.overLimitSamples.value, 0);
  assert.equal(snapshot.speed.overLimitFraction.state, 'AVAILABLE');
  assert.equal(snapshot.speed.overLimitFraction.value, 0);
  assert.equal(snapshot.speed.overLimitSeconds.state, 'AVAILABLE');
  assert.equal(snapshot.speed.overLimitSeconds.value, 0);
});

test('138 computes the speed distribution and over-limit duration only with a valid limit', () => {
  const service = createBehaviorMetrics();
  const batch = service.ingestMany([
    speedSample({ eventId: 'speed:1', speedMps: 10, limitMps: 10 }),
    speedSample({ eventId: 'speed:2', speedMps: 15, limitMps: 10 }),
    speedSample({ eventId: 'speed:3', speedMps: 25, limitMps: 10 }),
    speedSample({ eventId: 'speed:4', speedMps: 5, limitMps: null }),
  ]);
  assert.equal(batch.accepted, 4);
  const snapshot = read(service),
    speed = snapshot.speed;
  assert.equal(speed.samples.value, 4);
  assert.equal(speed.meanMps.unit, 'mps');
  assert.equal(speed.meanMps.value, 13.75);
  assert.ok(closeTo(speed.medianMps.value, 10, BEHAVIOR_HISTOGRAMS.speed.binWidth / 2));
  assert.ok(closeTo(speed.p90Mps.value, 25, BEHAVIOR_HISTOGRAMS.speed.binWidth / 2));
  assert.equal(speed.limitedSamples.value, 3);
  assert.equal(speed.limitedSeconds.value, 0.3);
  assert.equal(speed.meanLimitMps.value, 10);
  assert.equal(speed.overLimitSamples.value, 2);
  assert.equal(speed.overLimitSeconds.value, 0.2);
  assert.ok(closeTo(speed.overLimitFraction.value, 2 / 3));
  assert.equal(speed.overLimitFraction.unit, 'ratio');
  assert.equal(speed.overLimitFraction.sampleSize, 3);
});

test('138 reports NO_LIMIT when the speed stream carries no certifiable limit', () => {
  const service = createBehaviorMetrics();
  service.ingestMany([
    speedSample({ eventId: 'speed:1', speedMps: 30 }),
    speedSample({ eventId: 'speed:2', speedMps: 40, limitMps: null }),
  ]);
  const snapshot = read(service);
  assert.equal(snapshot.speed.samples.value, 2);
  assert.equal(snapshot.speed.meanMps.value, 35);
  assert.equal(snapshot.speed.limitedSamples.value, 0);
  assert.ok(unavailable(snapshot.speed.meanLimitMps, 'NO_LIMIT'));
  assert.ok(unavailable(snapshot.speed.overLimitSeconds, 'NO_LIMIT'));
  assert.ok(unavailable(snapshot.speed.overLimitFraction, 'NO_LIMIT'));
});

test('138 reports GREEN reaction only for eligible GREEN opportunities with a sample', () => {
  const service = createBehaviorMetrics();
  service.ingest(
    opportunity({
      eventId: 'green:1',
      opportunityId: 'green:1',
      opportunityKind: 'GREEN',
      outcome: 'RELEASED',
      success: true,
    }),
  );
  let snapshot = read(service);
  assert.equal(snapshot.reactions.reactionSamples.value, 0);
  assert.ok(unavailable(snapshot.reactions.meanReactionSeconds, 'NO_REACTION_SAMPLES'));
  assert.ok(unavailable(snapshot.reactions.medianReactionSeconds, 'NO_REACTION_SAMPLES'));

  service.ingestMany([
    opportunity({
      eventId: 'green:2',
      opportunityId: 'green:2',
      opportunityKind: 'GREEN',
      outcome: 'MISSED',
      success: false,
      reactionTicks: 90,
    }),
    opportunity({
      eventId: 'green:3',
      opportunityId: 'green:3',
      opportunityKind: 'GREEN',
      outcome: 'RELEASED',
      success: true,
      reactionTicks: 150,
    }),
    opportunity({
      eventId: 'red:reaction',
      opportunityId: 'red:reaction',
      opportunityKind: 'RED',
      outcome: 'HELD',
      success: true,
      reactionTicks: 600,
    }),
  ]);
  snapshot = read(service);
  assert.equal(snapshot.reactions.reactionSamples.value, 2);
  assert.equal(snapshot.reactions.reactionSamples.unit, 'count');
  assert.equal(snapshot.reactions.meanReactionSeconds.value, 2);
  assert.equal(snapshot.reactions.meanReactionSeconds.unit, 'seconds');
  assert.ok(
    closeTo(
      snapshot.reactions.medianReactionSeconds.value,
      1.5,
      BEHAVIOR_HISTOGRAMS.reaction.binWidth / 2,
    ),
  );
});

test('138 reports headway only for eligible-speed samples', () => {
  const standing = createBehaviorMetrics();
  standing.ingest(
    opportunity({
      eventId: 'headway:standing',
      opportunityId: 'headway:standing',
      headwaySeconds: 2,
      speedMps: 0,
    }),
  );
  let snapshot = read(standing);
  assert.equal(snapshot.headway.samples.value, 0);
  assert.equal(snapshot.headway.ineligibleSamples.value, 1);
  assert.ok(unavailable(snapshot.headway.meanSeconds, 'NO_ELIGIBLE_SPEED'));
  assert.ok(unavailable(snapshot.headway.p90Seconds, 'NO_ELIGIBLE_SPEED'));

  const moving = createBehaviorMetrics();
  moving.ingestMany([
    opportunity({
      eventId: 'headway:moving',
      opportunityId: 'headway:moving',
      headwaySeconds: 1.2,
      speedMps: 12,
    }),
    opportunity({
      eventId: 'headway:no-sample',
      opportunityId: 'headway:no-sample',
      headwaySeconds: null,
      speedMps: 12,
    }),
  ]);
  snapshot = read(moving);
  assert.equal(snapshot.headway.samples.value, 1);
  assert.equal(snapshot.headway.ineligibleSamples.value, 0);
  assert.equal(snapshot.headway.meanSeconds.state, 'AVAILABLE');
  assert.equal(snapshot.headway.meanSeconds.value, 1.2);
});

test('138 rejects invalid, negative and inconsistent events without changing aggregates', () => {
  const service = createBehaviorMetrics();
  const rejected = [
    service.ingest(null),
    service.ingest({ ...opportunity(), extra: 'unknown' }),
    service.ingest({ ...opportunity(), eventId: '' }),
    service.ingest({ ...opportunity(), speedMps: -1 }),
    service.ingest({ ...opportunity(), outcome: 'CROSSED' }),
    service.ingest({ ...opportunity(), success: false }),
    service.ingest({ ...opportunity(), violation: true }),
    service.ingest({ ...opportunity(), kind: 'UNKNOWN_EVENT' }),
    service.ingest({ ...speedSample(), speedMps: -3 }),
    service.ingest({ ...speedSample(), occurrence: 1 }),
  ];
  assert.deepEqual(
    rejected.map((entry) => entry.reason),
    [
      'INVALID_SHAPE',
      'UNKNOWN_FIELD',
      'INVALID_IDENTITY',
      'INVALID_NUMBER',
      'UNKNOWN_OUTCOME',
      'INCONSISTENT_OUTCOME',
      'INCONSISTENT_OUTCOME',
      'UNKNOWN_KIND',
      'INVALID_NUMBER',
      'UNKNOWN_FIELD',
    ],
  );
  const snapshot = read(service);
  assert.equal(snapshot.overall.eligibleOpportunities.value, 0);
  assert.equal(snapshot.speed.samples.value, 0);
  assert.equal(service.getStats().rejected, 10);
  assert.equal(service.getStats().lastRejection, 'UNKNOWN_FIELD');
});

test('138 bounds the dedupe memory and reports dropped keys', () => {
  const service = createBehaviorMetrics({ retainedKeys: 2 });
  service.ingestMany([
    speedSample({ eventId: 'speed:1' }),
    speedSample({ eventId: 'speed:2' }),
    speedSample({ eventId: 'speed:3' }),
  ]);
  assert.equal(service.getStats().retainedKeys, 2);
  assert.equal(service.getStats().droppedKeys, 1);
  // A replay outside the retained window is counted again; the caller does not replay old history.
  assert.equal(service.ingest(speedSample({ eventId: 'speed:1' })).status, 'ACCEPTED');
  assert.equal(service.getStats().droppedKeys, 2);
  assert.equal(read(service).speed.samples.value, 4);
});

test('138 snapshots are frozen, order-independent and never scan a history', () => {
  const service = createBehaviorMetrics();
  service.ingestMany([
    opportunity({ eventId: 'stop:1', opportunityId: 'stop:1', dwellTicks: 60 }),
    speedSample({ eventId: 'speed:1', speedMps: 20, limitMps: 15 }),
  ]);
  const first = read(service),
    second = read(service);
  assert.equal(first.historyScans, 0);
  assert.equal(service.getStats().historyScans, 0);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.overall), true);
  assert.equal(Object.isFrozen(first.byKind), true);
  assert.equal(Object.isFrozen(first.speed), true);
  assert.equal(Object.isFrozen(first.speed.overLimitFraction), true);
  assert.equal(Reflect.set(first, 'tick', 1), false);
  assert.equal(Reflect.set(first.overall.violations, 'value', 9), false);
  const projection = (snapshot: BehaviorMetricsSnapshot) =>
    JSON.stringify({ ...snapshot, snapshotCalls: 0 });
  assert.equal(projection(first), projection(second));
  assert.equal(second.snapshotCalls, 2);
});

test('138 snapshot accepts an optional whole-fleet context through counts() only', () => {
  const scanned: string[] = [],
    port = {
      counts: () => FLEET_COUNTS,
      list: () => {
        scanned.push('list');
        throw new Error('the snapshot must not list the fleet');
      },
    },
    snapshot = read(createBehaviorMetrics(), { fleet: port, simulatedSeconds: 60 });
  assert.deepEqual(snapshot.fleet, FLEET_COUNTS);
  assert.equal(snapshot.simulatedSeconds, 60);
  assert.deepEqual(scanned, []);
  assert.equal(read(createBehaviorMetrics()).fleet, null);
});

test('138 reset and dispose clear the owned state idempotently', () => {
  const service = createBehaviorMetrics();
  service.ingest(opportunity());
  const cleared = service.reset({ preserveStats: true });
  assert.equal(cleared.preserveStats, true);
  assert.equal(cleared.clearedEvents, 1);
  assert.equal(read(service).overall.eligibleOpportunities.value, 0);
  assert.equal(service.getStats().events, 1);
  assert.equal(service.getStats().retainedKeys, 0);

  service.dispose();
  service.dispose();
  const stats = service.getStats();
  assert.equal(stats.disposed, true);
  assert.equal(stats.events, 0);
  assert.equal(stats.retainedKeys, 0);
  assert.throws(() => service.ingest(opportunity()), /disposed/);
  assert.throws(() => service.snapshot({ tick: 1 }), /disposed/);
});

test('138 app ingests the real 086 record shape idempotently and skips non-resolved records', () => {
  const service = createBehaviorMetrics(),
    red = record();
  assert.equal(ingestOpportunityRecord(service, red)?.status, 'ACCEPTED');
  assert.equal(ingestOpportunityRecord(service, red)?.status, 'DUPLICATE');
  assert.equal(
    ingestOpportunityRecord(service, record({ state: 'TRUNCATED', outcome: null, result: null })),
    null,
  );
  assert.equal(
    ingestOpportunityRecord(service, record({ state: 'ENTERED', outcome: null, result: null })),
    null,
  );
  const snapshot = readBehaviorMetricSnapshot(service, {
    tick: 200,
    simulatedSeconds: 3600,
    fleet: fleetStub(),
  });
  assert.equal(snapshot.overall.eligibleOpportunities.value, 1);
  assert.equal(snapshot.overall.violations.value, 1);
  assert.equal(group(snapshot, 'RED').violationRate.value, 100);
  assert.deepEqual(snapshot.fleet, FLEET_COUNTS);
});

test('138 app keeps missing timing null and measures only the supplied dwell', () => {
  const service = createBehaviorMetrics();
  ingestOpportunityRecord(
    service,
    record({
      id: 'opportunity-stop-1',
      kind: 'STOP',
      outcome: 'STOPPED',
      result: 'SUCCESS',
      resolvedTick: 400,
    }),
  );
  let snapshot = read(service);
  assert.equal(snapshot.stops.completeStops.value, 1);
  assert.ok(unavailable(snapshot.stops.meanStopDwellSeconds, 'NO_STOP_DWELL'));

  ingestOpportunityRecord(
    service,
    record({
      id: 'opportunity-stop-2',
      kind: 'STOP',
      outcome: 'STOPPED',
      result: 'SUCCESS',
      occurrence: 1,
      resolvedTick: 420,
    }),
    { dwellTicks: 120 },
  );
  snapshot = read(service);
  assert.equal(snapshot.stops.completeStops.value, 2);
  assert.equal(snapshot.stops.meanStopDwellSeconds.value, 2);
});

test('138 app speed samples are idempotent and the 082 adapter exposes violations only', () => {
  const service = createBehaviorMetrics();
  ingestSpeedSample(service, {
    eventId: 'speed:app:1',
    tick: 10,
    vehicleId: 'taxi:1',
    speedMps: 18,
    limitMps: 15,
  });
  ingestSpeedSample(service, {
    eventId: 'speed:app:1',
    tick: 10,
    vehicleId: 'taxi:1',
    speedMps: 18,
    limitMps: 15,
  });
  ingestOpportunityRecord(service, record());
  const snapshot = readBehaviorMetricSnapshot(service, { tick: 30 }),
    adapter = toCityDashboardBehaviorMetrics(snapshot);
  assert.equal(snapshot.speed.samples.value, 1);
  assert.equal(snapshot.speed.overLimitSamples.value, 1);
  assert.equal(adapter.length, 1);
  assert.equal(adapter[0]?.id, 'violations');
  assert.equal(adapter[0]?.unit, 'count');
  assert.equal(adapter[0]?.state, 'AVAILABLE');
  assert.equal(adapter[0]?.value, 1);
  assert.equal(adapter[0]?.sampleSize, 1);
  assert.equal(adapter[0]?.reason, null);
  assert.equal(Object.isFrozen(adapter), true);
});

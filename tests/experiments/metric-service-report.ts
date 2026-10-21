import {
  METRIC_IDS,
  METRIC_REASONS,
  METRIC_SERVICE_LIMITS,
  METRIC_SERVICE_VERSION,
  createMetricService,
  metricEventKinds,
} from '../../src/experiments';
import type { MetricId, MetricSnapshot, MetricService } from '../../src/experiments';
import { toCityDashboardMetrics } from '../../src/app';

/**
 * 137 evidence transcript: seven deterministic scenarios, the 082 adapter shape and a machine-local
 * throughput probe.
 *
 * The report contains no wall-clock timestamp and no random value. Only the `performance` block is
 * machine-local and provisional; the run script compares a projection with that block nulled, so
 * `--check` stays a real staleness check.
 */

export interface MetricServiceReportContract {
  readonly eventKinds: readonly string[];
  readonly metricIds: readonly string[];
  readonly reasons: readonly string[];
  readonly rules: readonly string[];
  readonly retainedKeys: number;
  readonly idCodeUnits: number;
}

export interface MetricServiceReportMetric {
  readonly id: string;
  readonly unit: string;
  readonly state: string;
  readonly value: number | null;
  readonly sampleSize: number | null;
  readonly reason: string | null;
}

export interface MetricServiceReportScenario {
  readonly name: string;
  readonly fleet: Readonly<{ vehicles: number; taxis: number; civilians: number }>;
  readonly simulatedSeconds: number;
  readonly distanceAvailable: boolean;
  readonly fleetVehicleSeconds: number;
  readonly events: Readonly<{
    events: number;
    accepted: number;
    duplicates: number;
    rejected: number;
  }>;
  readonly metrics: readonly MetricServiceReportMetric[];
  readonly adapter: readonly Readonly<{
    id: string;
    unit: string;
    state: string;
    value: number | null;
    reason: string | null;
  }>[];
  readonly historyScans: number;
  readonly snapshotCalls: number;
}

export interface MetricServiceCheck {
  readonly name: string;
  readonly expected: string | number | boolean | null;
  readonly actual: string | number | boolean | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface MetricServicePerformance {
  readonly label: string;
  readonly events: number;
  readonly snapshots: number;
  readonly ingestMs: number;
  readonly snapshotMs: number;
  readonly perEventMs: number;
  readonly perSnapshotMs: number;
  readonly eventsPerSecond: number;
  readonly note: string;
}

export interface MetricServiceReport {
  readonly version: typeof METRIC_SERVICE_VERSION;
  readonly contract: MetricServiceReportContract;
  readonly scenarios: readonly MetricServiceReportScenario[];
  readonly performance: MetricServicePerformance;
  readonly checks: readonly MetricServiceCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

const FULL_FLEET = Object.freeze({ vehicles: 64, taxis: 24, civilians: 40 });

function fullFleet(): { counts: () => typeof FULL_FLEET } {
  return { counts: () => FULL_FLEET };
}

function snapshotOf(
  service: MetricService,
  overrides: Record<string, unknown> = {},
): MetricSnapshot {
  return service.snapshot({
    fleet: fullFleet(),
    tick: 900,
    simulatedSeconds: 3600,
    distanceAvailable: true,
    ...overrides,
  });
}

function metric(snapshot: MetricSnapshot, id: MetricId) {
  const found = snapshot.metrics.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`Missing report metric ${id}`);
  return found;
}

function scenarioOf(
  name: string,
  service: MetricService,
  snapshot: MetricSnapshot,
): MetricServiceReportScenario {
  const stats = service.getStats();
  return Object.freeze({
    name,
    fleet: snapshot.fleet,
    simulatedSeconds: snapshot.simulatedSeconds,
    distanceAvailable: snapshot.distanceAvailable,
    fleetVehicleSeconds: snapshot.fleetVehicleSeconds,
    events: Object.freeze({
      events: stats.events,
      accepted: stats.accepted,
      duplicates: stats.duplicates,
      rejected: stats.rejected,
    }),
    metrics: Object.freeze(
      snapshot.metrics.map((entry) =>
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
    adapter: Object.freeze(
      toCityDashboardMetrics(snapshot).map((entry) =>
        Object.freeze({
          id: entry.id,
          unit: entry.unit,
          state: entry.state,
          value: entry.value,
          reason: entry.reason,
        }),
      ),
    ),
    historyScans: snapshot.historyScans,
    snapshotCalls: snapshot.snapshotCalls,
  });
}

function check(
  name: string,
  expected: string | number | boolean | null,
  actual: string | number | boolean | null,
  detail: string,
): MetricServiceCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function rideTerminal(index: number, state = 'COMPLETED'): Record<string, unknown> {
  return {
    eventId: `report:ride:${index}`,
    kind: 'RIDE_TERMINAL',
    rideId: `ride:${index}`,
    taxiId: `taxi:${index}`,
    state,
    tick: index,
    pickupSeconds: 12 + index,
    tripSeconds: 60 + index,
    distanceM: null,
  };
}

function distanceEvent(index: number, distanceM: number): Record<string, unknown> {
  return {
    eventId: `report:distance:${index}`,
    kind: 'VEHICLE_DISTANCE',
    vehicleId: `taxi:${index}`,
    tick: index,
    distanceM,
  };
}

function collisionEvent(index: number): Record<string, unknown> {
  return {
    eventId: `report:collision:${index}`,
    kind: 'COLLISION',
    vehicleId: `taxi:${index}`,
    tick: index,
    incidentId: `incident:${index}`,
  };
}

function blockedEvent(index: number, blockedSeconds: number): Record<string, unknown> {
  return {
    eventId: `report:blocked:${index}`,
    kind: 'BLOCKED_INTERVAL',
    vehicleId: `taxi:${index}`,
    tick: index,
    blockedSeconds,
    reason: 'TRAFFIC_BLOCK',
  };
}

/** Deterministic 20 000-event mix across all five closed event kinds. */
function throughputEvents(count: number): readonly Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  for (let index = 0; index < count; index += 1) {
    const kind = index % 5;
    if (kind === 0)
      events.push({
        ...rideTerminal(index, index % 10 === 0 ? 'FAILED' : 'COMPLETED'),
        tick: Math.floor(index / 10),
      });
    else if (kind === 1)
      events.push({ ...distanceEvent(index, 250 + (index % 40)), tick: Math.floor(index / 10) });
    else if (kind === 2)
      events.push({ ...blockedEvent(index, 1 + (index % 30)), tick: Math.floor(index / 10) });
    else if (kind === 3) events.push({ ...collisionEvent(index), tick: Math.floor(index / 10) });
    else
      events.push({
        eventId: `perf:violation:${index}`,
        kind: 'VIOLATION',
        vehicleId: `taxi:${index % 64}`,
        tick: Math.floor(index / 10),
        opportunityId: `opportunity:${index}`,
        violationKind: 'RED',
      });
  }
  return events;
}

export function runMetricServiceReport(): MetricServiceReport {
  // 1. Invisible fleet: 24 taxis + 40 civilians, none of them selected. The counts port is the only
  //    read; list/get are traps that would fail the scenario if the snapshot looked at them.
  const scanned: string[] = [],
    invisibleRegistryLike = {
      counts: () => FULL_FLEET,
      list: () => {
        scanned.push('list');
        throw new Error('the snapshot must not list the fleet');
      },
      get: () => {
        scanned.push('get');
        throw new Error('the snapshot must not read one vehicle');
      },
    },
    invisible = createMetricService();
  invisible.ingest(blockedEvent(1, 3600));
  const invisibleSnapshot = invisible.snapshot({
      fleet: invisibleRegistryLike,
      tick: 900,
      simulatedSeconds: 3600,
      distanceAvailable: true,
    }),
    invisibleScenario = scenarioOf('flotă nevizibilă 24+40', invisible, invisibleSnapshot);

  // 2. No rides at all.
  const noRides = createMetricService(),
    noRidesScenario = scenarioOf('fără curse', noRides, snapshotOf(noRides));

  // 3. Distance source missing: the events carry distance but the caller cannot certify it.
  const noDistance = createMetricService();
  noDistance.ingestMany([rideTerminal(1), distanceEvent(1, 2500)]);
  const noDistanceScenario = scenarioOf(
    'fără distanță',
    noDistance,
    snapshotOf(noDistance, { distanceAvailable: false }),
  );

  // 4. Real zero: distance exists, no collision was observed.
  const realZero = createMetricService();
  realZero.ingestMany([distanceEvent(1, 1000), distanceEvent(2, 1000)]);
  const realZeroScenario = scenarioOf('zero real', realZero, snapshotOf(realZero));

  // 5. Collisions per 100 vehicle-km: 2 collisions over 5 000 m.
  const collisionRate = createMetricService();
  collisionRate.ingestMany([
    distanceEvent(1, 2500),
    distanceEvent(2, 2500),
    collisionEvent(3),
    collisionEvent(4),
  ]);
  const collisionScenario = scenarioOf(
    'coliziuni per 100 km',
    collisionRate,
    snapshotOf(collisionRate),
  );

  // 6. Blocked time: 1 152 blocked vehicle-seconds over 64 × 3 600 fleet vehicle-seconds.
  const blocked = createMetricService();
  blocked.ingest(blockedEvent(1, 1152));
  const blockedScenario = scenarioOf('timp blocat', blocked, snapshotOf(blocked));

  // 7. Local throughput probe: deterministic 20 000 mixed events and 2 000 snapshots.
  const throughput = createMetricService(),
    events = throughputEvents(20_000),
    ingestStarted = performance.now(),
    batch = throughput.ingestMany(events),
    ingestMs = performance.now() - ingestStarted,
    snapshotStarted = performance.now();
  let lastSnapshot: MetricSnapshot | null = null;
  for (let index = 0; index < 2_000; index += 1) {
    lastSnapshot = throughput.snapshot({
      fleet: fullFleet(),
      tick: 10_000 + index,
      simulatedSeconds: 3600,
      distanceAvailable: true,
      opportunities: 4_000,
    });
  }
  const snapshotMs = performance.now() - snapshotStarted;
  if (lastSnapshot === null) throw new Error('Missing throughput snapshot');
  const throughputScenario = scenarioOf(
      '20 000 evenimente · 2 000 snapshoturi',
      throughput,
      lastSnapshot,
    ),
    perEventMs = ingestMs / events.length,
    perSnapshotMs = snapshotMs / 2_000,
    eventsPerSecond = events.length / (ingestMs / 1000);

  // Out-of-order equivalence is checked over the same events here, not in a scenario.
  const ordered = createMetricService(),
    shuffled = createMetricService(),
    outOfOrderEvents = [rideTerminal(1), distanceEvent(1, 1000), collisionEvent(2)];
  ordered.ingestMany(outOfOrderEvents);
  shuffled.ingestMany([outOfOrderEvents[2]!, outOfOrderEvents[0]!, outOfOrderEvents[1]!]);
  const orderedSnapshot = snapshotOf(ordered),
    shuffledSnapshot = snapshotOf(shuffled);

  const duplicate = createMetricService(),
    replay = rideTerminal(1);
  duplicate.ingest(replay);
  duplicate.ingest(replay);
  const duplicateSnapshot = snapshotOf(duplicate);

  const adapter = invisibleScenario.adapter,
    noDistanceAdapter = noDistanceScenario.adapter,
    noDistanceTotal = noDistanceAdapter.find((entry) => entry.id === 'totalDistanceM');

  const checks: MetricServiceCheck[] = [
    check(
      'contract-version',
      METRIC_SERVICE_VERSION,
      METRIC_SERVICE_VERSION,
      '137 metric service contract version',
    ),
    check(
      'closed-event-kinds',
      5,
      metricEventKinds.length,
      `the service ingests exactly ${metricEventKinds.length} closed event kinds`,
    ),
    check(
      'metric-count',
      17,
      invisibleScenario.metrics.length,
      'every closed metric is present in canonical order',
    ),
    check(
      'invisible-fleet-vehicles',
      64,
      invisibleScenario.fleet.vehicles,
      'the denominator counts all 24 taxis and 40 civilians, hidden included',
    ),
    check(
      'invisible-fleet-taxis',
      24,
      invisibleScenario.fleet.taxis,
      'the taxi count is the whole registered fleet',
    ),
    check(
      'invisible-fleet-civilians',
      40,
      invisibleScenario.fleet.civilians,
      'the civilian count is the whole registered fleet',
    ),
    check(
      'invisible-fleet-no-list',
      0,
      scanned.length,
      'the snapshot called neither list nor get on the fleet port',
    ),
    check(
      'invisible-fleet-vehicle-seconds',
      64 * 3600,
      invisibleScenario.fleetVehicleSeconds,
      'fleet vehicle-seconds are vehicles × simulated exposure',
    ),
    check(
      'invisible-fleet-blocked-fraction',
      3600 / (64 * 3600),
      metric(invisibleSnapshot, 'blockedFraction').value,
      'blocked vehicle-seconds / whole-fleet vehicle-seconds',
    ),
    check(
      'invisible-fleet-blocked-sample',
      1,
      metric(invisibleSnapshot, 'blockedFraction').sampleSize,
      'the blocked fraction reports its blocked interval sample',
    ),
    check(
      'no-rides-completion-state',
      'UNAVAILABLE',
      metric(snapshotOf(noRides), 'completionRate').state,
      'no terminal ride means no completion rate',
    ),
    check(
      'no-rides-completion-value',
      null,
      metric(snapshotOf(noRides), 'completionRate').value,
      'the unavailable rate carries no number',
    ),
    check(
      'no-rides-completion-reason',
      'NO_RIDES',
      metric(snapshotOf(noRides), 'completionRate').reason,
      'the closed reason names the missing ride denominator',
    ),
    check(
      'no-rides-completed-zero',
      0,
      metric(snapshotOf(noRides), 'completedRides').value,
      'a real zero completed count stays a real zero',
    ),
    check(
      'no-rides-completed-state',
      'AVAILABLE',
      metric(snapshotOf(noRides), 'completedRides').state,
      'a count needs no denominator, so zero is available',
    ),
    check(
      'no-rides-average-state',
      'UNAVAILABLE',
      metric(snapshotOf(noRides), 'averageTripSeconds').state,
      'no ride duration sample means no average',
    ),
    check(
      'no-distance-total-state',
      'UNAVAILABLE',
      noDistanceTotal?.state ?? 'missing',
      'a missing distance source cannot certify travel',
    ),
    check(
      'no-distance-total-value',
      null,
      noDistanceTotal?.value ?? null,
      'the unavailable distance carries no number',
    ),
    check(
      'no-distance-total-reason',
      'NO_DISTANCE',
      noDistanceScenario.metrics.find((entry) => entry.id === 'totalDistanceM')?.reason ??
        'missing',
      'the closed reason names the missing distance',
    ),
    check(
      'no-distance-adapter-reason',
      'SOURCE_MISSING',
      noDistanceTotal?.reason ?? 'missing',
      'the 082 adapter maps the 137 NO_DISTANCE reason into its own closed vocabulary',
    ),
    check(
      'no-distance-km-state',
      'UNAVAILABLE',
      metric(snapshotOf(noDistance, { distanceAvailable: false }), 'vehicleKilometres').state,
      'vehicle-kilometres are unavailable without a distance source',
    ),
    check(
      'no-distance-collision-reason',
      'NO_DISTANCE',
      metric(snapshotOf(noDistance, { distanceAvailable: false }), 'collisionsPer100VehicleKm')
        .reason,
      'a per-distance rate is unavailable instead of infinite',
    ),
    check(
      'real-zero-collision-rate',
      0,
      metric(realZeroSnapshot(), 'collisionsPer100VehicleKm').value,
      'zero collisions with real distance is an available zero',
    ),
    check(
      'real-zero-collision-state',
      'AVAILABLE',
      metric(realZeroSnapshot(), 'collisionsPer100VehicleKm').state,
      'the real zero is a certified value, not a missing one',
    ),
    check(
      'real-zero-completion-reason',
      'NO_RIDES',
      realZeroScenario.metrics.find((entry) => entry.id === 'completionRate')?.reason ?? 'missing',
      'a real zero collision rate does not hide the missing ride denominator',
    ),
    check(
      'collisions-per-100km',
      40,
      metric(collisionSnapshot(), 'collisionsPer100VehicleKm').value,
      '2 collisions over 5 km are 40 per 100 vehicle-km',
    ),
    check(
      'collisions-per-100km-unit',
      'per100km',
      metric(collisionSnapshot(), 'collisionsPer100VehicleKm').unit,
      'the rate carries its per-100-km unit',
    ),
    check(
      'collisions-per-100km-sample',
      2,
      metric(collisionSnapshot(), 'collisionsPer100VehicleKm').sampleSize,
      'the rate reports the two distance samples',
    ),
    check(
      'blocked-seconds',
      1152,
      metric(blockedSnapshot(), 'blockedSeconds').value,
      'blocked vehicle-seconds accumulate from the real intervals',
    ),
    check(
      'blocked-fraction',
      1152 / (64 * 3600),
      metric(blockedSnapshot(), 'blockedFraction').value,
      'blocked fraction is blocked vehicle-seconds over fleet vehicle-seconds',
    ),
    check(
      'blocked-fraction-unit',
      'ratio',
      metric(blockedSnapshot(), 'blockedFraction').unit,
      'the fraction carries the ratio unit',
    ),
    check(
      'blocked-fraction-sample',
      1,
      metric(blockedSnapshot(), 'blockedFraction').sampleSize,
      'the fraction reports its blocked interval sample',
    ),
    check(
      'out-of-order-equivalence',
      JSON.stringify(orderedSnapshot.metrics),
      JSON.stringify(shuffledSnapshot.metrics),
      'the same events in another order produce identical aggregates',
    ),
    check(
      'duplicate-no-double-count',
      1,
      metric(duplicateSnapshot, 'completedRides').value,
      'a replayed event id is counted once',
    ),
    check(
      'duplicate-counter',
      1,
      duplicate.getStats().duplicates,
      'the duplicate is reported instead of folded into the total',
    ),
    check(
      'history-scans-zero',
      0,
      invisibleScenario.historyScans,
      'the snapshot never rescans a history',
    ),
    check(
      'adapter-ids',
      'completedRides,averageRideSeconds,totalDistanceM,collisions,blockages',
      adapter.map((entry) => entry.id).join(','),
      'only the 082 metrics owned by 137 are adapted',
    ),
    check(
      'adapter-unavailable-null',
      true,
      noDistanceAdapter.every((entry) => entry.state !== 'UNAVAILABLE' || entry.value === null),
      'an adapted unavailable value never becomes zero',
    ),
    check(
      'adapter-no-violations',
      false,
      adapter.some((entry) => entry.id === 'violations'),
      '138/139 own violations and comfort, so 137 does not adapt them',
    ),
    check('throughput-events', 20_000, batch.events, 'the probe ingests 20 000 mixed events'),
    check(
      'throughput-accepted',
      20_000,
      batch.accepted,
      'every distinct probe event is accepted exactly once',
    ),
    check('throughput-rejected', 0, batch.rejected, 'the probe contains no invalid event'),
    check(
      'throughput-per-event-under-0.05ms',
      true,
      perEventMs < 0.05,
      'the measured per-event cost stays under the local 0.05 ms probe ceiling',
    ),
    check(
      'throughput-per-snapshot-under-1ms',
      true,
      perSnapshotMs < 1,
      'the measured per-snapshot cost stays under the local 1 ms probe ceiling',
    ),
  ];

  function collisionSnapshot(): MetricSnapshot {
    return snapshotOf(collisionRate);
  }

  function realZeroSnapshot(): MetricSnapshot {
    return snapshotOf(realZero);
  }

  function blockedSnapshot(): MetricSnapshot {
    return snapshotOf(blocked);
  }

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: METRIC_SERVICE_VERSION,
    contract: Object.freeze({
      eventKinds: Object.freeze([
        'RIDE_TERMINAL',
        'VEHICLE_DISTANCE',
        'BLOCKED_INTERVAL',
        'COLLISION',
        'VIOLATION',
      ]),
      metricIds: Object.freeze([...METRIC_IDS]),
      reasons: Object.freeze([...METRIC_REASONS]),
      rules: Object.freeze([
        'denominators use the whole fleet from counts(), hidden and unselected vehicles included',
        'zero exposure or a missing distance/opportunity denominator is UNAVAILABLE with value:null',
        'a real zero with a real denominator stays AVAILABLE with value:0',
        'events are idempotent by eventId and every aggregate is incremental; historyScans is 0',
        'out-of-order ticks are accepted and counted deterministically by sum/count/min/max',
        'a metric value carries exactly one unit and a closed unavailable reason',
      ]),
      retainedKeys: METRIC_SERVICE_LIMITS.retainedKeys,
      idCodeUnits: METRIC_SERVICE_LIMITS.idCodeUnits,
    }),
    scenarios: Object.freeze([
      invisibleScenario,
      noRidesScenario,
      noDistanceScenario,
      realZeroScenario,
      collisionScenario,
      blockedScenario,
      throughputScenario,
    ]),
    performance: Object.freeze({
      label: 'machine-local provisional',
      events: events.length,
      snapshots: 2_000,
      ingestMs,
      snapshotMs,
      perEventMs,
      perSnapshotMs,
      eventsPerSecond,
      note: 'Local correctness/cost probe on this machine only; it is not an FPS, hardware or game-loop claim.',
    }),
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}

function metricRow(entry: MetricServiceReportMetric): string {
  return `| ${entry.id} | ${entry.unit} | ${entry.state} | ${entry.value === null ? 'null' : entry.value} | ${entry.reason ?? '—'} | ${entry.sampleSize ?? '—'} |`;
}

export function metricServiceReportMarkdown(report: MetricServiceReport): string {
  const scenarioSections = report.scenarios
      .map(
        (entry) => `### ${entry.name}

| Value | Result |
| --- | --- |
| Fleet | ${entry.fleet.vehicles} vehicles (${entry.fleet.taxis} taxis + ${entry.fleet.civilians} civilians) |
| Exposure | ${entry.simulatedSeconds} s simulated |
| Fleet vehicle-seconds | ${entry.fleetVehicleSeconds} |
| Distance source | ${entry.distanceAvailable ? 'declared' : 'missing'} |
| Events | ${entry.events.events} attempted · ${entry.events.accepted} accepted · ${entry.events.duplicates} duplicates · ${entry.events.rejected} rejected |
| History scans | ${entry.historyScans} |
| Snapshots | ${entry.snapshotCalls} |
| 082 adapter | ${entry.adapter.map((metric) => `${metric.id}=${metric.state === 'AVAILABLE' ? String(metric.value) : 'Indisponibil'}`).join(' · ')} |

| Metric | Unit | State | Value | Reason | Sample |
| --- | --- | --- | ---: | --- | ---: |
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
    performance = report.performance;
  return `# 137 metric service report

Machine-readable transcript: [report.json](report.json). Generated by \`npm run metrics:service\`. The
report contains no wall-clock timestamp and no random value; only the \`performance\` block is
machine-local and provisional.

Version: \`${report.version}\`. The report drives the real \`createMetricService\` accumulators and the
real 082 metric adapter over deterministic events and whole-fleet counts (24 taxis + 40 civilians).

## Contract

Event kinds: ${report.contract.eventKinds.join(', ')}.
Metrics: ${report.contract.metricIds.join(', ')}.
Unavailable reasons: ${report.contract.reasons.join(', ')}.
Idempotency memory: ${report.contract.retainedKeys} keys, ${report.contract.idCodeUnits} code units per
identity.

Rules: ${report.contract.rules.join('; ')}.

## Scenarios

${scenarioSections}
## Local throughput (machine-local, provisional)

| Measurement | Value |
| --- | ---: |
| Mixed events ingested | ${performance.events} |
| Ingest elapsed | ${performance.ingestMs.toFixed(3)} ms |
| Per event | ${performance.perEventMs.toFixed(5)} ms |
| Events per second | ${performance.eventsPerSecond.toFixed(0)} |
| Snapshots read | ${performance.snapshots} |
| Snapshot elapsed | ${performance.snapshotMs.toFixed(3)} ms |
| Per snapshot | ${performance.perSnapshotMs.toFixed(5)} ms |

${performance.note} The numbers are not a budget and do not certify the integrated game.

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

import {
  COMFORT_CONTROL_MODES,
  COMFORT_METRICS_LIMITS,
  COMFORT_METRICS_VERSION,
  COMFORT_REVIEW_COEFFICIENTS,
  COMFORT_REVIEW_MODEL_VERSION,
  COMFORT_THRESHOLD_SOURCE,
  COMFORT_THRESHOLDS,
  createComfortMetrics,
  comfortEventKinds,
  comfortReviewModel,
} from '../../src/experiments';
import type { ComfortMetrics, ComfortMetricsSnapshot } from '../../src/experiments';
import {
  ingestComfortImpact,
  ingestComfortRide,
  readComfortSnapshot,
  toCityDashboardComfortMetrics,
} from '../../src/app';
import {
  briskRide,
  incidentRide,
  jerkyRide,
  linearRide,
  mixedRide,
  recoveryRide,
  turnRide,
} from './comfort-fixture';
import type { ComfortRecordedRide } from './comfort-fixture';

/**
 * 139 evidence transcript: seven deterministic scenarios over the real 085/088/061/069 facts, the
 * 082 adapter shape, the shared mission verdict and a machine-local cost probe.
 *
 * The report contains no wall-clock timestamp and no random value. Only the `performance` block is
 * machine-local and provisional; the run script compares a projection with that block nulled, so
 * `--check` stays a real staleness check.
 */

export interface ComfortMetricsReportContract {
  readonly version: string;
  readonly eventKinds: readonly string[];
  readonly controlModes: readonly string[];
  readonly thresholds: Readonly<{ maxAccelerationMps2: number; maxJerkMps3: number }>;
  readonly thresholdSource: Readonly<{
    maxAccelerationMps2: string;
    maxJerkMps3: string;
    catalog: string;
  }>;
  readonly reviewModelVersion: string;
  readonly reviewCoefficients: Readonly<{
    ratingBase: number;
    accelerationPenaltyPoints: number;
    jerkPenaltyPoints: number;
    lateralPenaltyPoints: number;
    maximumPenalty: number;
  }>;
  readonly limits: Readonly<{
    retainedKeys: number;
    retainedRides: number;
    idCodeUnits: number;
  }>;
}

export interface ComfortMetricsReportScenario {
  readonly name: string;
  readonly rideId: string;
  readonly vehicleId: string;
  readonly controlModes: readonly string[];
  readonly intervals: number;
  readonly events: Readonly<{
    events: number;
    accepted: number;
    duplicates: number;
    rejected: number;
  }>;
  readonly excludedSamples: number;
  readonly excludedIntervals: number;
  readonly comfort: Readonly<{
    peakAccelerationMps2: number;
    peakLateralAccelerationMps2: number;
    peakJerkMps3: number;
    accelerationViolations: number;
    jerkViolations: number;
    lateralViolations: number;
  }>;
  readonly review: Readonly<{
    comfortPenalty: number | null;
    comfortScore: number | null;
    comfortIntervals: number;
    impacts: number;
    affectedRides: number;
  }>;
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

export interface ComfortMetricsCheck {
  readonly name: string;
  readonly expected: string | number | boolean | null;
  readonly actual: string | number | boolean | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ComfortMetricsPerformance {
  readonly label: string;
  readonly intervals: number;
  readonly ingestMs: number;
  readonly perIntervalMs: number;
  readonly snapshots: number;
  readonly snapshotMs: number;
  readonly perSnapshotMs: number;
  readonly perModeIngestMs: Readonly<Record<string, number>>;
  readonly perModePerIntervalMs: Readonly<Record<string, number>>;
  readonly invisibleTaxiIntervals: number;
  readonly invisibleTaxiIngestMs: number;
  readonly invisibleTaxiPerIntervalMs: number;
  readonly note: string;
}

export interface ComfortMetricsReport {
  readonly version: typeof COMFORT_METRICS_VERSION;
  readonly contract: ComfortMetricsReportContract;
  readonly scenarios: readonly ComfortMetricsReportScenario[];
  readonly performance: ComfortMetricsPerformance;
  readonly checks: readonly ComfortMetricsCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  name: string,
  expected: string | number | boolean | null,
  actual: string | number | boolean | null,
  detail: string,
): ComfortMetricsCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function ingest(
  service: ComfortMetrics,
  ride: ComfortRecordedRide,
  rideState: 'TO_DROPOFF' | 'TO_PICKUP' = 'TO_DROPOFF',
): void {
  ingestComfortRide(service, {
    rideId: ride.rideId,
    vehicleId: ride.vehicleId,
    rideState,
    readouts: ride.readouts,
    artifactWindows: ride.windows,
  });
}

function scenarioOf(
  name: string,
  service: ComfortMetrics,
  ride: ComfortRecordedRide,
  snapshot: ComfortMetricsSnapshot,
  excludedSamples: number,
  excludedIntervals: number,
): ComfortMetricsReportScenario {
  const review = comfortReviewModel(snapshot);
  const stats = service.getStats();
  const rideAggregate = snapshot.rides.find((entry) => entry.rideId === ride.rideId);
  if (rideAggregate === undefined) throw new Error(`Missing report ride ${ride.rideId}`);
  return Object.freeze({
    name,
    rideId: ride.rideId,
    vehicleId: ride.vehicleId,
    controlModes: rideAggregate.controlModes,
    intervals: rideAggregate.intervals,
    events: Object.freeze({
      events: stats.events,
      accepted: stats.accepted,
      duplicates: stats.duplicates,
      rejected: stats.rejected,
    }),
    excludedSamples,
    excludedIntervals,
    comfort: Object.freeze({
      peakAccelerationMps2: rideAggregate.peakAccelerationMps2,
      peakLateralAccelerationMps2: rideAggregate.peakLateralAccelerationMps2,
      peakJerkMps3: rideAggregate.peakJerkMps3,
      accelerationViolations: rideAggregate.accelerationViolations,
      jerkViolations: rideAggregate.jerkViolations,
      lateralViolations: rideAggregate.lateralViolations,
    }),
    review: Object.freeze({
      comfortPenalty: review.comfortPenalty,
      comfortScore: review.comfortScore,
      comfortIntervals: review.comfortIntervals,
      impacts: review.impacts.impacts,
      affectedRides: review.impacts.affectedRides,
    }),
    adapter: Object.freeze(
      toCityDashboardComfortMetrics(snapshot).map((entry) =>
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

function snapshotOf(service: ComfortMetrics, tick = 900): ComfortMetricsSnapshot {
  return readComfortSnapshot(service, { tick, simulatedSeconds: 3600 });
}

/** Deterministic interval events of one control mode, used by the machine-local cost probe. */
function intervalEvents(
  rideId: string,
  vehicleId: string,
  controlMode: 'AUTO' | 'MANUAL' | 'LEARNING',
  count: number,
): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  for (let index = 0; index < count; index += 1)
    events.push({
      eventId: `perf:${controlMode}:${rideId}:${index}`,
      kind: 'PASSENGER_INTERVAL',
      rideId,
      vehicleId,
      controlMode,
      learningEligible: controlMode === 'LEARNING',
      fromTick: index,
      toTick: index + 1,
      durationSeconds: 1 / 60,
      longitudinalAccelerationMps2: 0.5,
      lateralAccelerationMps2: 0.25,
      lateralLimitMps2: 12.753,
    });
  return events;
}

export function runComfortMetricsReport(): ComfortMetricsReport {
  // 1. Linear ride in AUTO: the comfortable reference of the whole module.
  const linear = createComfortMetrics();
  const linearRideFacts = linearRide('AUTO', { rideId: 'ride:139:linear' });
  const linearIngest = ingestComfortRide(linear, {
    rideId: linearRideFacts.rideId,
    vehicleId: linearRideFacts.vehicleId,
    rideState: 'TO_DROPOFF',
    readouts: linearRideFacts.readouts,
    artifactWindows: linearRideFacts.windows,
  });
  if (linearIngest === null) throw new Error('Missing linear ingest');
  const linearSnapshot = snapshotOf(linear);
  const linearScenario = scenarioOf(
    'cursă linie · AUTO',
    linear,
    linearRideFacts,
    linearSnapshot,
    linearIngest.excludedSamples,
    linearIngest.excludedIntervals,
  );

  // 2. Brisk ride in MANUAL: the acceleration threshold is exceeded.
  const brisk = createComfortMetrics();
  const briskRideFacts = briskRide('MANUAL', { rideId: 'ride:139:brisk' });
  ingest(brisk, briskRideFacts);
  const briskScenario = scenarioOf(
    'cursă bruscă · MANUAL',
    brisk,
    briskRideFacts,
    snapshotOf(brisk),
    0,
    0,
  );

  // 3. Jerky ride in LEARNING: the jerk threshold is exceeded, the acceleration is not.
  const jerky = createComfortMetrics();
  const jerkyRideFacts = jerkyRide('LEARNING', { rideId: 'ride:139:jerky' });
  ingest(jerky, jerkyRideFacts);
  const jerkyScenario = scenarioOf(
    'cursă jerky · LEARNING',
    jerky,
    jerkyRideFacts,
    snapshotOf(jerky),
    0,
    0,
  );

  // 4. Mixed ride: one ride, three control modes.
  const mixed = createComfortMetrics();
  const mixedRideFacts = mixedRide({ rideId: 'ride:139:mixed' });
  ingest(mixed, mixedRideFacts);
  const mixedSnapshot = snapshotOf(mixed);
  const mixedScenario = scenarioOf(
    'cursă mixtă · AUTO+MANUAL+LEARNING',
    mixed,
    mixedRideFacts,
    mixedSnapshot,
    0,
    0,
  );

  // 5. Ride with a real impact: the impact is excluded from the comfort and counted apart.
  const incident = createComfortMetrics();
  const incidentRideFacts = incidentRide('AUTO', { rideId: 'ride:139:incident' });
  const incidentIngest = ingestComfortRide(incident, {
    rideId: incidentRideFacts.rideId,
    vehicleId: incidentRideFacts.vehicleId,
    rideState: 'TO_DROPOFF',
    readouts: incidentRideFacts.readouts,
    artifactWindows: incidentRideFacts.windows,
  });
  if (incidentIngest === null) throw new Error('Missing incident ingest');
  const incidentFact = incidentRideFacts.incidents[0]!;
  const impactOutcome = ingestComfortImpact(incident, {
    incident: incidentFact,
    rideId: incidentRideFacts.rideId,
    vehicleId: incidentRideFacts.vehicleId,
    rideState: 'TO_DROPOFF',
  });
  if (impactOutcome === null) throw new Error('Missing impact ingest');
  const incidentSnapshot = snapshotOf(incident);
  const incidentScenario = scenarioOf(
    'cursă cu incident',
    incident,
    incidentRideFacts,
    incidentSnapshot,
    incidentIngest.excludedSamples,
    incidentIngest.excludedIntervals,
  );

  // 6. Taxi outside the camera: the module has no camera, so the taxi is aggregated like any other.
  const invisible = createComfortMetrics();
  const visibleRide = linearRide('AUTO', { rideId: 'ride:139:visible' });
  const invisibleRide = linearRide('AUTO', {
    rideId: 'ride:139:invisible',
    vehicleId: 'taxi:139:offscreen',
  });
  ingest(invisible, visibleRide);
  ingest(invisible, invisibleRide);
  const invisibleSnapshot = snapshotOf(invisible);
  const invisibleScenario = scenarioOf(
    'taxi nevizibil',
    invisible,
    invisibleRide,
    invisibleSnapshot,
    0,
    0,
  );

  // 7. A real recovery teleport: the 088 span keeps the teleport out of the comfort metric.
  const recovery = createComfortMetrics();
  const recoveryRideFacts = recoveryRide('MANUAL', { rideId: 'ride:139:recovery' });
  const recoveryIngest = ingestComfortRide(recovery, {
    rideId: recoveryRideFacts.rideId,
    vehicleId: recoveryRideFacts.vehicleId,
    rideState: 'TO_DROPOFF',
    readouts: recoveryRideFacts.readouts,
    artifactWindows: recoveryRideFacts.windows,
  });
  if (recoveryIngest === null) throw new Error('Missing recovery ingest');
  const recoveryScenario = scenarioOf(
    'recuperare 030 · teleport exclus',
    recovery,
    recoveryRideFacts,
    snapshotOf(recovery),
    recoveryIngest.excludedSamples,
    recoveryIngest.excludedIntervals,
  );

  // 8. A real turn: the lateral acceleration is measured against the real class capability.
  const turn = createComfortMetrics();
  const turnRideFacts = turnRide({
    controlMode: 'AUTO',
    radiusM: 30,
    rideId: 'ride:139:turn',
  });
  ingest(turn, turnRideFacts);
  const turnScenario = scenarioOf(
    'curbă · accelerație laterală',
    turn,
    turnRideFacts,
    snapshotOf(turn),
    0,
    0,
  );

  // 9. Machine-local cost probe: the same workload per control mode and for an off-camera taxi.
  //    Every measurement uses a fresh service, so the numbers are comparable with each other.
  const perModeIngestMs: Record<string, number> = {};
  const perModePerIntervalMs: Record<string, number> = {};
  let probeIntervals = 0;
  const everyEvent: Record<string, unknown>[] = [];
  for (const mode of COMFORT_CONTROL_MODES) {
    const service = createComfortMetrics();
    const events = intervalEvents(`perf:${mode}`, `taxi:perf:${mode}`, mode, 4_000);
    const started = performance.now();
    service.ingestMany(events);
    const elapsed = performance.now() - started;
    perModeIngestMs[mode] = elapsed;
    perModePerIntervalMs[mode] = elapsed / events.length;
    probeIntervals += events.length;
    everyEvent.push(...events);
  }
  const invisibleService = createComfortMetrics();
  const invisibleEvents = intervalEvents('perf:invisible', 'taxi:perf:offscreen', 'AUTO', 4_000);
  const invisibleStarted = performance.now();
  invisibleService.ingestMany(invisibleEvents);
  const invisibleMs = performance.now() - invisibleStarted;

  const snapshotService = createComfortMetrics();
  snapshotService.ingestMany(everyEvent);
  const snapshotStarted = performance.now();
  for (let index = 0; index < 2_000; index += 1)
    readComfortSnapshot(snapshotService, { tick: 10_000 + index, simulatedSeconds: 3600 });
  const snapshotMs = performance.now() - snapshotStarted;
  const probeResult: ComfortMetricsPerformance = Object.freeze({
    label: 'probe locală 139',
    intervals: probeIntervals,
    ingestMs: Object.values(perModeIngestMs).reduce((total, value) => total + value, 0),
    perIntervalMs:
      Object.values(perModePerIntervalMs).reduce((total, value) => total + value, 0) /
      COMFORT_CONTROL_MODES.length,
    snapshots: 2_000,
    snapshotMs,
    perSnapshotMs: snapshotMs / 2_000,
    perModeIngestMs: Object.freeze({ ...perModeIngestMs }),
    perModePerIntervalMs: Object.freeze({ ...perModePerIntervalMs }),
    invisibleTaxiIntervals: invisibleEvents.length,
    invisibleTaxiIngestMs: invisibleMs,
    invisibleTaxiPerIntervalMs: invisibleMs / invisibleEvents.length,
    note: 'măsurătoare locală, provizorie: nu este buget, FPS sau dovadă hardware',
  });

  const checks: ComfortMetricsCheck[] = [
    check(
      'contract-version',
      COMFORT_METRICS_VERSION,
      COMFORT_METRICS_VERSION,
      '139 comfort metrics contract version',
    ),
    check(
      'closed-event-kinds',
      2,
      comfortEventKinds.length,
      'the service ingests exactly the passenger interval and the passenger impact',
    ),
    check(
      'control-modes',
      3,
      COMFORT_CONTROL_MODES.length,
      'AUTO, MANUAL and LEARNING are all aggregated',
    ),
    check(
      'threshold-acceleration',
      2,
      COMFORT_THRESHOLDS.maxAccelerationMps2,
      'the comfort acceleration threshold is the catalog default of comfort_deceleration',
    ),
    check(
      'threshold-jerk',
      2,
      COMFORT_THRESHOLDS.maxJerkMps3,
      'the comfort jerk threshold is the catalog default of acceleration_jerk',
    ),
    check(
      'threshold-source',
      'comfort_deceleration',
      COMFORT_THRESHOLD_SOURCE.maxAccelerationMps2,
      'the threshold provenance is the shipped parameter catalog',
    ),
    check(
      'review-model-version',
      COMFORT_REVIEW_MODEL_VERSION,
      comfortReviewModel(linearSnapshot).version,
      'the review model reads the comfort read model',
    ),
    check(
      'linear-intervals',
      120,
      linearScenario.intervals,
      'the linear ride contributes one interval per tick pair',
    ),
    check(
      'linear-peak-acceleration',
      0.9375,
      linearScenario.comfort.peakAccelerationMps2,
      'the linear ride peaks at the recorded 0,9375 m/s²',
    ),
    check(
      'linear-violations',
      0,
      linearScenario.comfort.accelerationViolations,
      'the linear ride exceeds no comfort threshold',
    ),
    check(
      'linear-mode',
      'AUTO',
      linearScenario.controlModes.join(','),
      'the linear ride is aggregated in its own control mode',
    ),
    check(
      'brisk-peak-acceleration',
      5.625,
      briskScenario.comfort.peakAccelerationMps2,
      'the brisk ride peaks at the recorded 5,625 m/s²',
    ),
    check(
      'brisk-violations',
      120,
      briskScenario.comfort.accelerationViolations,
      'every interval of the brisk ride exceeds the acceleration threshold',
    ),
    check(
      'brisk-jerk-violations',
      0,
      briskScenario.comfort.jerkViolations,
      'a constant acceleration has no jerk violation',
    ),
    check(
      'jerky-peak-jerk',
      225,
      jerkyScenario.comfort.peakJerkMps3,
      'the jerky ride peaks at the real 225 m/s³ jerk',
    ),
    check(
      'jerky-acceleration-violations',
      0,
      jerkyScenario.comfort.accelerationViolations,
      'the jerky ride stays inside the acceleration threshold',
    ),
    check(
      'jerky-jerk-violations',
      119,
      jerkyScenario.comfort.jerkViolations,
      'every jerk pair of the jerky ride exceeds the jerk threshold',
    ),
    check(
      'mixed-modes',
      'AUTO,LEARNING,MANUAL',
      mixedScenario.controlModes.join(','),
      'the mixed ride is aggregated in all three control modes',
    ),
    check(
      'mixed-intervals',
      179,
      mixedScenario.intervals,
      'the mixed ride contributes every usable interval of its three segments',
    ),
    check(
      'mixed-mode-counts',
      60,
      mixedSnapshot.byMode.find((entry) => entry.mode === 'AUTO')?.intervals ?? 0,
      'the AUTO part of the mixed ride keeps its own intervals',
    ),
    check(
      'incident-excluded-samples',
      61,
      incidentScenario.excludedSamples,
      'the 088 window suppresses every sample from the impact tick on',
    ),
    check(
      'incident-intervals',
      59,
      incidentScenario.intervals,
      'only the prefix before the real impact reaches the comfort metric',
    ),
    check(
      'incident-impacts',
      1,
      incidentScenario.review.impacts,
      'the real impact is counted as a passenger consequence',
    ),
    check(
      'incident-no-comfort-violation',
      0,
      incidentScenario.comfort.accelerationViolations,
      'the impact impulse never becomes a comfort violation',
    ),
    check(
      'invisible-intervals',
      120,
      invisibleScenario.intervals,
      'the taxi outside the camera is aggregated like a visible one',
    ),
    check(
      'invisible-total-intervals',
      240,
      invisibleSnapshot.overall.intervals,
      'the visible and the off-camera taxi contribute the same intervals',
    ),
    check(
      'recovery-excluded-samples',
      61,
      recoveryScenario.excludedSamples,
      'the 088 window suppresses the recovery tick and everything after it',
    ),
    check(
      'recovery-peak-acceleration',
      0.9375,
      recoveryScenario.comfort.peakAccelerationMps2,
      'the teleport never becomes comfort of the command',
    ),
    check(
      'recovery-violations',
      0,
      recoveryScenario.comfort.accelerationViolations,
      'the recovery ride exceeds no comfort threshold',
    ),
    check(
      'turn-lateral',
      3.333362,
      turnScenario.comfort.peakLateralAccelerationMps2,
      'the turn measures the real lateral acceleration of the recorded velocity',
    ),
    check(
      'turn-lateral-violations',
      0,
      turnScenario.comfort.lateralViolations,
      'the comfortable turn stays below the real sedan capability',
    ),
    check(
      'adapter-id',
      'comfortScore',
      linearScenario.adapter[0]?.id ?? null,
      'the 082 adapter exposes the comfort metric',
    ),
    check(
      'adapter-value',
      comfortReviewModel(linearSnapshot).comfortScore,
      linearScenario.adapter[0]?.value ?? null,
      'the dashboard reads the comfort score of the shared review model',
    ),
    check('history-scans', 0, linearScenario.historyScans, 'the snapshot performs no history scan'),
    check(
      'limits-retained-keys',
      8192,
      COMFORT_METRICS_LIMITS.retainedKeys,
      'the idempotency memory is bounded',
    ),
    check(
      'limits-retained-rides',
      512,
      COMFORT_METRICS_LIMITS.retainedRides,
      'the per-ride read model is bounded',
    ),
  ];

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: COMFORT_METRICS_VERSION,
    contract: Object.freeze({
      version: COMFORT_METRICS_VERSION,
      eventKinds: Object.freeze([...comfortEventKinds]),
      controlModes: Object.freeze([...COMFORT_CONTROL_MODES]),
      thresholds: Object.freeze({ ...COMFORT_THRESHOLDS }),
      thresholdSource: Object.freeze({ ...COMFORT_THRESHOLD_SOURCE }),
      reviewModelVersion: COMFORT_REVIEW_MODEL_VERSION,
      reviewCoefficients: Object.freeze({
        ratingBase: COMFORT_REVIEW_COEFFICIENTS.ratingBase,
        accelerationPenaltyPoints: COMFORT_REVIEW_COEFFICIENTS.accelerationPenaltyPoints,
        jerkPenaltyPoints: COMFORT_REVIEW_COEFFICIENTS.jerkPenaltyPoints,
        lateralPenaltyPoints: COMFORT_REVIEW_COEFFICIENTS.lateralPenaltyPoints,
        maximumPenalty: COMFORT_REVIEW_COEFFICIENTS.maximumPenalty,
      }),
      limits: Object.freeze({
        retainedKeys: COMFORT_METRICS_LIMITS.retainedKeys,
        retainedRides: COMFORT_METRICS_LIMITS.retainedRides,
        idCodeUnits: COMFORT_METRICS_LIMITS.idCodeUnits,
      }),
    }),
    scenarios: Object.freeze([
      linearScenario,
      briskScenario,
      jerkyScenario,
      mixedScenario,
      incidentScenario,
      invisibleScenario,
      recoveryScenario,
      turnScenario,
    ]),
    performance: probeResult,
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}

/**
 * The projection without the machine-local numbers. The run script and the test compare this
 * projection with the saved evidence, so the transcript stays a real staleness check while the
 * cost probe keeps its measured values.
 */
export function comfortMetricsStableReport(report: ComfortMetricsReport): ComfortMetricsReport {
  return Object.freeze({
    ...report,
    performance: Object.freeze({
      ...report.performance,
      ingestMs: null as unknown as number,
      perIntervalMs: null as unknown as number,
      snapshotMs: null as unknown as number,
      perSnapshotMs: null as unknown as number,
      perModeIngestMs: Object.freeze({}) as Readonly<Record<string, number>>,
      perModePerIntervalMs: Object.freeze({}) as Readonly<Record<string, number>>,
      invisibleTaxiIngestMs: null as unknown as number,
      invisibleTaxiPerIntervalMs: null as unknown as number,
    }),
  });
}

/** Deterministic markdown transcript of the report. */
export function comfortMetricsReportMarkdown(report: ComfortMetricsReport): string {
  const lines: string[] = [];
  lines.push(`# Raport 139 — indicatori de confort cu pasager`);
  lines.push('');
  lines.push(
    `Contract: \`${report.version}\` · evenimente: ${report.contract.eventKinds.join(', ')}`,
  );
  lines.push(
    `Praguri: accelerație ≤ ${report.contract.thresholds.maxAccelerationMps2} m/s², jerk ≤ ${report.contract.thresholds.maxJerkMps3} m/s³ (${report.contract.thresholdSource.maxAccelerationMps2} / ${report.contract.thresholdSource.maxJerkMps3}).`,
  );
  lines.push('');
  lines.push('## Scenarii');
  lines.push('');
  lines.push(
    '| Scenariu | Ride | Moduri | Intervale | Accel. max | Lateral max | Jerk max | Viol. accel | Viol. jerk | Viol. lateral | Scor confort | Impacte |',
  );
  lines.push('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const scenario of report.scenarios)
    lines.push(
      `| ${scenario.name} | ${scenario.rideId} | ${scenario.controlModes.join('/')} | ${scenario.intervals} | ${scenario.comfort.peakAccelerationMps2} | ${scenario.comfort.peakLateralAccelerationMps2} | ${scenario.comfort.peakJerkMps3} | ${scenario.comfort.accelerationViolations} | ${scenario.comfort.jerkViolations} | ${scenario.comfort.lateralViolations} | ${scenario.review.comfortScore ?? 'indisponibil'} | ${scenario.review.impacts} |`,
    );
  lines.push('');
  lines.push('## Cost local (provizoriu, măsurat pe această mașină)');
  lines.push('');
  lines.push(`- Intervale ingerate: ${report.performance.intervals}`);
  lines.push(
    `- Cost ingest: ${report.performance.ingestMs.toFixed(3)} ms (${report.performance.perIntervalMs.toFixed(6)} ms/interval)`,
  );
  for (const mode of Object.keys(report.performance.perModePerIntervalMs))
    lines.push(
      `- Mod ${mode}: ${report.performance.perModeIngestMs[mode]?.toFixed(3)} ms (${report.performance.perModePerIntervalMs[mode]?.toFixed(6)} ms/interval)`,
    );
  lines.push(
    `- Taxi nevizibil: ${report.performance.invisibleTaxiIngestMs.toFixed(3)} ms pentru ${report.performance.invisibleTaxiIntervals} intervale (${report.performance.invisibleTaxiPerIntervalMs.toFixed(6)} ms/interval)`,
  );
  lines.push(
    `- Snapshoturi: ${report.performance.snapshots} în ${report.performance.snapshotMs.toFixed(3)} ms (${report.performance.perSnapshotMs.toFixed(6)} ms/snapshot)`,
  );
  lines.push(`- ${report.performance.note}`);
  lines.push('');
  lines.push('## Verificări');
  lines.push('');
  for (const entry of report.checks)
    lines.push(`- ${entry.pass ? 'PASS' : 'FAIL'} **${entry.name}** — ${entry.detail}`);
  lines.push('');
  lines.push(
    `Rezultat: ${report.summary.passed}/${report.summary.checks} verificări, ${report.summary.pass ? 'PASS' : 'FAIL'}.`,
  );
  lines.push('');
  return lines.join('\n');
}

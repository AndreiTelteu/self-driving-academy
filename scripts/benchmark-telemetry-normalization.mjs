// PBI 089 native probe: added cost and owned memory of the vehicle-class normalization layer.
//
// Fixture: the 089 feature is purely additive on top of the real 086/087/088 chain, so BEFORE is the
// same fixture with the 089 normalizer disabled (--baseline) and AFTER adds it. The chain follows the
// 088 probe: the real 044/085 fixture (`roadContextFixture(false)`), the real 036/037/044/045/046/047
// command source and a real 049 lateral projection, the real 086 opportunity registry, the real 087
// eligibility layer and the real 088 artefact filter evaluated at the real 219 decision cadence.
//
// Arms (paired, sequential, one process):
//   chain     - world/context + the real 086/087/088 chain only (BEFORE)
//   normalize - chain + the real 089 normalizer observe() at every 219 decision
// The 089 added cost is the normalize-minus-chain delta plus the isolated observe() percentiles.
//
// Usage (sequential, one arm at a time):
//   node --import ./scripts/register-typescript.mjs scripts/benchmark-telemetry-normalization.mjs --baseline
//   node --import ./scripts/register-typescript.mjs scripts/benchmark-telemetry-normalization.mjs
import { cpus, platform, release, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { roadContextFixture } from '../tests/autonomy/road-context-reference.ts';
import { createLongitudinalTargetFixture } from '../tests/autonomy/longitudinal-target-fixture.ts';
import {
  longitudinalProfile,
  longitudinalValues,
} from '../tests/autonomy/longitudinal-reference.ts';
import { lateralFixture } from '../tests/autonomy/lateral-controller-reference.ts';
import {
  compileLateralTrajectory,
  compileLongitudinalProfile,
  createLateralController,
  createLongitudinalController,
} from '../src/autonomy/index.ts';
import { createStableId } from '../src/sessions/index.ts';
import { tractiveForceN, vehicleClass } from '../src/vehicles/index.ts';

const baseline = process.argv.includes('--baseline');
// The 089 layer is purely additive: the BEFORE arm is the same real 086/087/088 chain with the 089
// normalizer disabled, so the telemetry module is always loaded.
const telemetry = await import('../src/telemetry/index.ts');

const EVIDENCE = 'Docs/Evidence/089-vehicle-normalization';
const FIXTURE_MAP_ID = roadContextFixture(false).map.mapId;
const SESSION = 'academy-1';
const EPOCH = 2;
const SEGMENT = 'normalization-ride';
const VEHICLE = 'taxi-0';
const INCARNATION = 'taxi-0-in1';
const WORLD = { sessionId: SESSION, worldEpoch: EPOCH };
const FIXTURE_VERSION = '089-vehicle-normalization-native-v1';
const RIDE_TICKS = 480;
const DECISION_PERIOD = 6;
const WARMUP_TICKS = 120;
const MEASURED_TICKS = RIDE_TICKS - WARMUP_TICKS;
const REPETITIONS = 5;
const MEMORY_ITERATIONS = 5120;

const sources = [
  'scripts/benchmark-telemetry-normalization.mjs',
  'src/telemetry/vehicle-normalization.ts',
  'src/telemetry/artifact-filter.ts',
  'src/telemetry/eligibility-windows.ts',
  'src/telemetry/opportunities.ts',
  'src/telemetry/tick-samples.ts',
  'src/vehicles/vehicle-classes.ts',
  'src/autonomy/longitudinal-control.ts',
  'src/autonomy/lateral-controller.ts',
  'src/autonomy/cruise-targets.ts',
  'tests/autonomy/road-context-reference.ts',
  'tests/autonomy/longitudinal-reference.ts',
  'tests/autonomy/lateral-controller-reference.ts',
];

const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const percentile = (sorted, fraction) => sorted[Math.floor((sorted.length - 1) * fraction)] ?? null;
const summary = (samples) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    min: sorted[0] ?? null,
    max: sorted[sorted.length - 1] ?? null,
    mean: sorted.length ? sorted.reduce((total, value) => total + value, 0) / sorted.length : null,
  };
};

function powerScheme() {
  try {
    return platform() === 'win32'
      ? execFileSync('powercfg', ['/getactivescheme'], { encoding: 'utf8' }).trim()
      : null;
  } catch {
    return null;
  }
}

/**
 * The fixture: one real 047 ride (a real compiled profile, the real 046 target producer and the real
 * 047 controller stepped at 60 Hz), replayed verbatim in the compact so both classes execute the
 * **same command**; the realized demand is the real 023 drivetrain and the real 049 projected
 * curvature. Built once, outside the timed region; the timed region only runs the layers.
 */
function buildFixture() {
  const actor = { id: VEHICLE, incarnation: 1 };
  const profile = compileLongitudinalProfile(longitudinalProfile(longitudinalValues[0]));

  const lateralWorld = Object.freeze({
    sessionId: '089-probe-lateral',
    worldEpoch: 0,
    mapId: '049-separated-curves-v1',
    mapVersionId: 'fixture-v1',
  });
  const lateralActor = Object.freeze({ id: 'lateral-car', incarnation: 1 });
  const trajectory = compileLateralTrajectory(lateralFixture(1), {
    ...lateralWorld,
    version: '049-directed-trajectory-v1',
    id: 'curve',
    access: 'CIVIL',
    laneIds: ['lane-0'],
    loop: true,
  });
  const lateral = createLateralController(lateralWorld);
  lateral.setActors([{ ...lateralActor, classId: 'sedan' }], lateralWorld);
  lateral.setTrajectory(lateralActor, trajectory, lateralWorld);
  const projection = lateral.step({
    ...lateralWorld,
    version: '049-lateral-v1',
    actor: lateralActor,
    tick: 1,
    observation: {
      sourceTick: 0,
      positionM: { x: -384, y: 0.8, z: -360 },
      rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
      velocityMps: { x: 0, y: 0, z: 3 },
      discontinuity: false,
    },
    requestedSpeedMps: 3,
  });
  lateral.dispose();
  const lateralCurvature = Math.abs(projection.curvaturePerM ?? 0);

  const ride = (classId, replay) => {
    const config = vehicleClass(classId);
    const targetOwner = createLongitudinalTargetFixture(profile.cruise, actor, WORLD);
    const controller = createLongitudinalController(WORLD);
    controller.setActors([actor], WORLD);
    const commands = [];
    const samples = [];
    let speed = 0;
    for (let tick = 1; tick <= RIDE_TICKS; tick += 1) {
      let command;
      if (replay === null) {
        const guided = controller.step({
          ...WORLD,
          actor,
          tick,
          authority: 'AUTO',
          profile,
          target: targetOwner.target(tick, false, classId),
          observation: {
            version: '047-observation-v1',
            units: 'SI',
            ...WORLD,
            actor,
            tick,
            longitudinalSpeedMps: speed,
            classId,
            classVersion: '023-mechanics-v1',
          },
        });
        if (guided.reason !== 'TRACK_TARGET') throw new Error(`047 reason ${guided.reason}`);
        command = { throttle: guided.command.throttle, brake: guided.command.brake };
        commands.push(command);
      } else {
        command = replay[tick - 1];
      }
      const { throttle, brake } = command;
      const longitudinalAccelerationMps2 =
        brake > 0
          ? -brake * config.brakeAcceleration
          : (throttle * tractiveForceN(config, speed)) / config.massKg;
      const lateralAccelerationMps2 = speed * speed * lateralCurvature;
      speed = Math.max(0, speed + longitudinalAccelerationMps2 / 60);
      samples.push(
        Object.freeze({
          tick,
          longitudinalAccelerationMps2,
          lateralAccelerationMps2,
          throttle,
          brake,
          steering: projection.steering,
        }),
      );
    }
    controller.dispose();
    targetOwner.dispose();
    return { commands, samples };
  };

  const sedan = ride('sedan', null);
  const compact = ride('compact', sedan.commands);
  return { sedan: sedan.samples, compact: compact.samples };
}

const fixtureData = buildFixture();
const stimulus = {
  kind: 'YIELD',
  tick: DECISION_PERIOD,
  sourceKey: createStableId('priority-yield', SESSION, [String(EPOCH), VEHICLE, 'probe']),
  relatedIds: ['junction', 'west-straight'],
};

/**
 * Drives the real 086/087/088 chain over the ride and, in the `normalize` arm, the real 089 layer at
 * every 219 decision. `sink` receives the last 089 record for the self-check.
 */
function runArm(mode, repetition, classId, samples, sink) {
  const registry = telemetry.createOpportunityRegistry();
  const eligibility = telemetry.createEligibilityWindows();
  const artifacts = telemetry.createArtifactFilter();
  const normalizer = mode === 'normalize' ? telemetry.createVehicleNormalizer() : null;
  const chainSamples = [];
  const observeSamples = [];
  let opportunity = null;
  let decisions = 0;
  global.gc?.();
  const wallStart = performance.now();
  for (let tick = DECISION_PERIOD; tick <= RIDE_TICKS; tick += DECISION_PERIOD) {
    // Fixture preparation, identical in both arms and outside the timed windows.
    const visible = samples.slice(0, tick);
    const started = performance.now();
    const records = registry.observe({
      tick,
      sessionId: SESSION,
      worldEpoch: EPOCH,
      segmentId: SEGMENT,
      learningEligible: true,
      vehicleId: VEHICLE,
      incarnation: INCARNATION,
      signal: null,
      events: [],
      stimuli: tick === DECISION_PERIOD ? [stimulus] : [],
      conclusions: [],
    });
    if (opportunity === null && records.length > 0)
      opportunity = { id: records[0].id, kind: records[0].kind };
    if (opportunity !== null)
      eligibility.observe({
        tick,
        sessionId: SESSION,
        worldEpoch: EPOCH,
        opportunityId: opportunity.id,
        kind: opportunity.kind,
        vehicleId: VEHICLE,
        incarnation: INCARNATION,
        segmentId: SEGMENT,
        controlMode: 'LEARNING',
        learningEligible: true,
        classId,
        suspension: 'NONE',
        visibility: { source: 'CONTROLLED_FIXTURE', observable: true },
        leader: null,
        signal: null,
        greenExit: null,
        mechanical: null,
        impact: null,
      });
    const artifactRecord = artifacts.evaluate({
      tick,
      sessionId: SESSION,
      worldEpoch: EPOCH,
      segmentId: SEGMENT,
      vehicleId: VEHICLE,
      incarnation: INCARNATION,
      controlMode: 'LEARNING',
      learningEligible: true,
      startTick: 1,
      endTick: tick === RIDE_TICKS ? RIDE_TICKS : null,
      segmentCompleteness: tick === RIDE_TICKS ? 'CLOSED' : 'OPEN',
      closeReason: tick === RIDE_TICKS ? 'RIDE_COMPLETED' : null,
      lostCheckpointTick: null,
      observationLoss: null,
      collisions: [],
      recoveries: [],
      suspensions: [],
    });
    let crossed = performance.now();
    if (normalizer !== null && opportunity !== null) {
      const eligible = eligibility.getWindow(opportunity.id);
      if (eligible !== null) {
        const record = normalizer.observe({
          tick,
          sessionId: SESSION,
          worldEpoch: EPOCH,
          segmentId: SEGMENT,
          vehicleId: VEHICLE,
          incarnation: INCARNATION,
          classId,
          eligibility: eligible,
          artifacts: artifactRecord,
          samples: visible,
        });
        observeSamples.push(performance.now() - crossed);
        if (sink) sink.push(record);
      }
    }
    if (tick > WARMUP_TICKS) {
      chainSamples.push(crossed - started);
      decisions += 1;
    }
  }
  const wallMs = performance.now() - wallStart;
  const stats = normalizer ? normalizer.getStats() : null;
  const denominators = normalizer ? normalizer.getDenominators() : null;
  if (normalizer) normalizer.dispose();
  artifacts.dispose();
  eligibility.dispose();
  registry.dispose();
  return {
    repetition,
    mode,
    classId,
    chainCallMs: summary(chainSamples),
    observeCallMs: normalizer ? summary(observeSamples) : null,
    wallMs,
    decisions,
    normalizationOwnership: stats,
    normalizationDenominators: denominators,
    heapAfterBytes: process.memoryUsage().heapUsed,
  };
}

let guard = 0;
function checksumGuard(value) {
  guard = (guard + value) % 1000003;
}

function measureMemoryRegion() {
  global.gc?.();
  const before = process.memoryUsage();
  const layer = telemetry.createVehicleNormalizer();
  const afterCreate = process.memoryUsage();
  const capability = telemetry.mechanicalCapabilities('sedan');
  for (let index = 0; index < MEMORY_ITERATIONS; index += 1) {
    const base = index * 1000;
    const samples = Array.from({ length: 8 }, (_, offset) =>
      Object.freeze({
        tick: base + offset + 1,
        longitudinalAccelerationMps2: capability.maxAccelerationMps2 * 0.4,
        lateralAccelerationMps2: 0,
        throttle: 0.4,
        brake: 0,
        steering: 0,
      }),
    );
    if (index % 3 === 0)
      for (let offset = 0; offset < 4; offset += 1)
        samples[offset] = Object.freeze({
          ...samples[offset],
          longitudinalAccelerationMps2: capability.maxAccelerationMps2,
        });
    layer.observe({
      tick: base + 500,
      sessionId: SESSION,
      worldEpoch: EPOCH,
      segmentId: `memory-segment-${index}`,
      vehicleId: `vehicle-${index}`,
      incarnation: INCARNATION,
      classId: index % 2 ? 'compact' : 'sedan',
      eligibility: {
        windowClass: 'ELIGIBLE',
        windowId: `memory-window-${index}`,
        opportunityId: `memory-opportunity-${index}`,
        kind: 'GREEN',
        segmentId: `memory-segment-${index}`,
        vehicleId: `vehicle-${index}`,
        incarnation: INCARNATION,
        openedTick: base + 1,
        lastTick: base + 8,
      },
      artifacts: {
        windowClass: 'PREFIX_ELIGIBLE',
        completeness: 'COMPLETE',
        completenessReason: 'SEGMENT_CLOSED',
        segmentId: `memory-segment-${index}`,
        vehicleId: `vehicle-${index}`,
        prefix: { fromTick: base + 1, toTick: base + 8, ticks: 8 },
      },
      samples,
    });
  }
  const afterFill = process.memoryUsage();
  const stats = layer.getStats();
  const denominators = layer.getDenominators();
  layer.dispose();
  const afterDispose = process.memoryUsage();
  const disposed = layer.getStats();
  return {
    label: 'MEMORY_REGION_EXACT_OWNERSHIP_COUNTERS',
    iterations: MEMORY_ITERATIONS,
    retained: stats.retained,
    maxWindows: stats.maxWindows,
    windowsEvaluated: stats.windowsEvaluated,
    retiredTotal: stats.retiredTotal,
    bytesPerRecord: telemetry.NORMALIZATION_BYTES_PER_RECORD,
    recordBytesCeiling: telemetry.NORMALIZATION_RECORD_BYTES_CEILING,
    estimatedBytes: stats.estimatedBytes,
    estimatedBytesMaximum: stats.estimatedBytesMaximum,
    withinCeiling: stats.estimatedBytes <= stats.estimatedBytesMaximum,
    identityCodeUnits: stats.identityCodeUnits,
    capabilityLimitedRetained: stats.capabilityLimitedRetained,
    byChannel: denominators.byChannel,
    arrayBuffersBeforeBytes: before.arrayBuffers,
    arrayBuffersAfterCreateBytes: afterCreate.arrayBuffers,
    arrayBuffersAfterFillBytes: afterFill.arrayBuffers,
    arrayBuffersAfterDisposeBytes: afterDispose.arrayBuffers,
    heapUsedBeforeBytes: before.heapUsed,
    heapUsedAfterFillBytes: afterFill.heapUsed,
    disposedCountersZero:
      disposed.retained === 0 && disposed.identityCodeUnits === 0 && disposed.estimatedBytes === 0,
  };
}

/** The natural cadence: one `observe` per **closed** window rather than one per decision. */
function measurePerWindowCost() {
  const layer = telemetry.createVehicleNormalizer();
  const eligible = {
    windowClass: 'ELIGIBLE',
    windowId: 'per-window',
    opportunityId: 'per-window-opportunity',
    kind: 'GREEN',
    segmentId: SEGMENT,
    vehicleId: VEHICLE,
    incarnation: INCARNATION,
    openedTick: 1,
    lastTick: RIDE_TICKS,
  };
  const artifacts = {
    windowClass: 'PREFIX_ELIGIBLE',
    completeness: 'COMPLETE',
    completenessReason: 'SEGMENT_CLOSED',
    segmentId: SEGMENT,
    vehicleId: VEHICLE,
    prefix: { fromTick: 1, toTick: RIDE_TICKS, ticks: RIDE_TICKS },
  };
  const durations = [];
  for (let iteration = 0; iteration < 120; iteration += 1) {
    const started = performance.now();
    layer.observe({
      tick: RIDE_TICKS + 1000 + iteration,
      sessionId: SESSION,
      worldEpoch: EPOCH,
      segmentId: SEGMENT,
      vehicleId: VEHICLE,
      incarnation: INCARNATION,
      classId: 'sedan',
      eligibility: eligible,
      artifacts,
      samples: fixtureData.sedan,
    });
    durations.push(performance.now() - started);
  }
  const stats = layer.getStats();
  layer.dispose();
  return {
    label: 'ONE_OBSERVE_PER_CLOSED_WINDOW',
    usableSamples: fixtureData.sedan.length,
    iterations: durations.length,
    observeMs: summary(durations),
    retained: stats.retained,
  };
}

/** Criterion 1 and criterion 2, checked on the real chain rather than on a synthetic scale. */
function selfCheck() {
  const failures = [];
  const runClass = (classId, sink, samples) => runArm('normalize', 0, classId, samples, sink);
  const sedanRecords = [];
  const compactRecords = [];
  runClass('sedan', sedanRecords, fixtureData.sedan);
  runClass('compact', compactRecords, fixtureData.compact);
  const sedan = sedanRecords[sedanRecords.length - 1];
  const compact = compactRecords[compactRecords.length - 1];
  if (!sedan || !compact) failures.push('the real chain produced no normalized window');
  else {
    if (sedan.windowClass !== 'NORMALIZED' || compact.windowClass !== 'NORMALIZED')
      failures.push('the real ride was not normalized');
    else {
      if (sedan.demandStatus !== 'INTENTIONAL')
        failures.push(`the sedan ride was ${sedan.demandStatus}, not INTENTIONAL`);
      if (compact.demandStatus !== 'INTENTIONAL')
        failures.push(`the compact ride was ${compact.demandStatus}, not INTENTIONAL`);
      const delta = Math.abs(
        sedan.features.accelerationDemand - compact.features.accelerationDemand,
      );
      if (delta > telemetry.NORMALIZATION_EQUALITY_TOLERANCE)
        failures.push(`the same command normalized differently: ${delta}`);
      const ratio =
        compact.features.raw.longitudinalAccelerationMps2 /
        sedan.features.raw.longitudinalAccelerationMps2;
      const predicted =
        telemetry.mechanicalCapabilities('compact').maxAccelerationMps2 /
        telemetry.mechanicalCapabilities('sedan').maxAccelerationMps2;
      if (Math.abs(ratio - predicted) > 0.02)
        failures.push(`the raw ratio ${ratio} does not match ${predicted}`);
      checksumGuard(Math.round(sedan.features.aggressiveness * 1000));
    }
  }
  // Criterion 2: a saturated command is marked with its limiting channel and cannot be emitted.
  const layer = telemetry.createVehicleNormalizer();
  const capability = telemetry.mechanicalCapabilities('compact');
  const saturatedSamples = Array.from({ length: 6 }, (_, index) =>
    Object.freeze({
      tick: index + 1,
      longitudinalAccelerationMps2: capability.maxAccelerationMps2,
      lateralAccelerationMps2: 0,
      throttle: 1,
      brake: 0,
      steering: 0,
    }),
  );
  const saturated = layer.observe({
    tick: 5000,
    sessionId: SESSION,
    worldEpoch: EPOCH,
    segmentId: 'saturated-segment',
    vehicleId: VEHICLE,
    incarnation: INCARNATION,
    classId: 'compact',
    eligibility: {
      windowClass: 'ELIGIBLE',
      windowId: 'saturated-window',
      opportunityId: 'saturated-opportunity',
      kind: 'GREEN',
      segmentId: 'saturated-segment',
      vehicleId: VEHICLE,
      incarnation: INCARNATION,
      openedTick: 1,
      lastTick: 6,
    },
    artifacts: {
      windowClass: 'PREFIX_ELIGIBLE',
      completeness: 'COMPLETE',
      completenessReason: 'SEGMENT_CLOSED',
      segmentId: 'saturated-segment',
      vehicleId: VEHICLE,
      prefix: { fromTick: 1, toTick: 6, ticks: 6 },
    },
    samples: saturatedSamples,
  });
  if (
    saturated.demandStatus !== 'CAPABILITY_LIMITED' ||
    saturated.limitingChannel !== 'LONGITUDINAL_ACCELERATION'
  )
    failures.push('a saturated demand was not marked CAPABILITY_LIMITED');
  if (saturated.features?.aggressivenessIsLowerBound !== true)
    failures.push('a saturated demand was not flagged as a lower bound');
  let refused = false;
  try {
    layer.emitIntentFeature(saturated);
  } catch {
    refused = true;
  }
  if (!refused) failures.push('a saturated window became an intent feature');
  // A fully suppressed 088 window is refused, never normalized as if complete.
  const suppressed = layer.observe({
    tick: 5001,
    sessionId: SESSION,
    worldEpoch: EPOCH,
    segmentId: 'suppressed-segment',
    vehicleId: VEHICLE,
    incarnation: INCARNATION,
    classId: 'sedan',
    eligibility: {
      windowClass: 'ELIGIBLE',
      windowId: 'suppressed-window',
      opportunityId: 'suppressed-opportunity',
      kind: 'GREEN',
      segmentId: 'suppressed-segment',
      vehicleId: VEHICLE,
      incarnation: INCARNATION,
      openedTick: 1,
      lastTick: 6,
    },
    artifacts: {
      windowClass: 'FULLY_SUPPRESSED',
      completeness: 'PARTIAL',
      completenessReason: 'TRUNCATED_BY_ARTIFACT',
      segmentId: 'suppressed-segment',
      vehicleId: VEHICLE,
      prefix: null,
    },
    samples: saturatedSamples,
  });
  if (suppressed.windowClass !== 'REFUSED' || suppressed.features !== null)
    failures.push('a fully suppressed window was normalized');
  checksumGuard(layer.getDenominators().total);
  layer.dispose();
  return { passed: failures.length === 0, failures };
}

const runs = [];
if (baseline) {
  for (let repetition = 1; repetition <= REPETITIONS; repetition += 1)
    runs.push(runArm('chain', repetition, 'sedan', fixtureData.sedan, null));
} else {
  for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
    runs.push(runArm('chain', repetition, 'sedan', fixtureData.sedan, null));
    runs.push(runArm('normalize', repetition, 'sedan', fixtureData.sedan, null));
  }
}

const paired = [];
if (!baseline)
  for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
    const chain = runs.find((run) => run.repetition === repetition && run.mode === 'chain');
    const normalize = runs.find((run) => run.repetition === repetition && run.mode === 'normalize');
    paired.push({
      repetition,
      normalizeOverChainP50Ms: normalize.chainCallMs.p50 - chain.chainCallMs.p50,
      normalizeOverChainP95Ms: normalize.chainCallMs.p95 - chain.chainCallMs.p95,
      normalizeOverChainP99Ms: normalize.chainCallMs.p99 - chain.chainCallMs.p99,
      observeP50Ms: normalize.observeCallMs.p50,
      observeP95Ms: normalize.observeCallMs.p95,
      observeP99Ms: normalize.observeCallMs.p99,
      chainP95Ms: chain.chainCallMs.p95,
      decisions: normalize.decisions,
      wallDeltaMs: normalize.wallMs - chain.wallMs,
    });
  }

const report = {
  capturedAt: new Date().toISOString(),
  pbi: '089',
  mode: baseline ? 'BEFORE_NORMALIZER_DISABLED' : 'AFTER_VEHICLE_NORMALIZATION',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHashes: Object.fromEntries(sources.map((file) => [file, hash(file)])),
  sourceHashScope:
    'Probe, normalization layer, artefact filter, eligibility layer, opportunity registry, tick samples, vehicle classes, longitudinal/lateral controllers, cruise targets and the reused fixtures; not a verified transitive dependency closure',
  hardware: {
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    ramBytes: totalmem(),
    os: `${platform()} ${release()}`,
    powerScheme: powerScheme(),
  },
  runtime: process.version,
  budgetVersion: '203-initial-1',
  fixtureVersion: FIXTURE_VERSION,
  fixtureMapId: FIXTURE_MAP_ID,
  validationLevel: 'targeted',
  protocol: {
    repetitions: REPETITIONS,
    totalRideTicks: RIDE_TICKS,
    warmupTicks: WARMUP_TICKS,
    measuredTicks: MEASURED_TICKS,
    decisionPeriodTicks: DECISION_PERIOD,
    measuredDecisions: MEASURED_TICKS / DECISION_PERIOD,
    arms: 'chain / normalize per repetition, sequential, one process, no concurrent load',
    workload:
      'one subject observed over the real 044/085 fixture; the real 046 target producer and the real 047 longitudinal controller at 60 Hz produce the command sequence, replayed verbatim in the compact so both classes execute the same command; the realized demand is the real 023 drivetrain and the real 049 projected curvature; the real 086 registry, the real 087 eligibility layer, the real 088 filter and (in the normalize arm) the real 089 normalizer run at the 219 decision cadence (every 6 ticks)',
    seed: 'none; deterministic fixture and a fixed tick cadence',
    capacity: 'default (4096)',
    clock: 'performance.now only; fixed synthetic tick index (no wall clock in the fixture)',
    budget:
      'Added cost must stay far below the 5.5 ms provisional full-tick p95 ceiling; no isolated budget claimed',
    calibration: 'PROVISIONAL_UNCALIBRATED',
    injected: [
      'The 044 fixture carries no traffic opportunity, so the real 038 priority-yield identity is injected through the 086 registry stimulus port at one decision.',
      'The ride carries no collision, recovery or suspension: the 088 window is COMPLETE. The refused cases are covered by the unit suite and the self-check.',
    ],
  },
  scope:
    'Native Node CPU and owned-memory cost of the 089 vehicle-class normalization on top of the real 086/087/088 chain. No renderer, browser, GPU, FPS or realtime-throughput claim.',
  runs,
  paired,
  memoryRegion: baseline ? null : measureMemoryRegion(),
  perWindowCostMs: baseline ? null : measurePerWindowCost(),
  selfCheck: baseline ? null : selfCheck(),
  budgets: {
    manifest: 'Docs/performance-budgets.json',
    budgetVersion: '203-initial-1',
    capacityCalibration: 'PROVISIONAL_UNCALIBRATED',
    diagnosticSamplesProposal: 4096,
    measuredCapacity: telemetry.NORMALIZATION_CAPACITY.default,
    recorderRamBytesCap: 33554432,
    authoritativeTickP95MsDesktopProvisional: 5.5,
    authoritativeTickP95MsLaptopProvisional: 8,
  },
  exclusions: [
    'No browser, renderer, GPU or FPS measurement; the 052 record documents an unresolved WebGPU presentation stall on this laptop.',
    'Heap counters are diagnostic only; exact ownership is reported from the normalization counters.',
    'Forced GC between repetitions is not used inside the timed region.',
    'BEFORE is the same fixture with the 089 layer disabled, not a historical commit: 089 is purely additive.',
  ],
  guard,
};

mkdirSync(EVIDENCE, { recursive: true });
const stem = baseline ? 'native-before-01' : 'native-after-01';
writeFileSync(`${EVIDENCE}/${stem}.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      mode: report.mode,
      commit: report.commit,
      runs: runs.map((run) => ({
        repetition: run.repetition,
        mode: run.mode,
        classId: run.classId,
        chainP50Ms: run.chainCallMs.p50,
        chainP95Ms: run.chainCallMs.p95,
        chainP99Ms: run.chainCallMs.p99,
        observeP50Ms: run.observeCallMs?.p50 ?? null,
        observeP95Ms: run.observeCallMs?.p95 ?? null,
        observeP99Ms: run.observeCallMs?.p99 ?? null,
        decisions: run.decisions,
        wallMs: run.wallMs,
      })),
      paired,
      memoryRegion: report.memoryRegion,
      perWindowCostMs: report.perWindowCostMs,
      selfCheck: report.selfCheck,
    },
    null,
    2,
  ),
);

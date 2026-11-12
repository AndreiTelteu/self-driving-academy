/**
 * PBI 155 — costul fiecărui sistem peste baseline, măsurat pe contractele reale.
 *
 * Baseline-ul este bucla reală de conducere a fixture-ului 206 (30 de taxiuri + 40 de civili).
 * Fiecare braț adaugă **un singur** sistem, la cadența lui documentată, peste exact aceeași buclă:
 * learning (103→112), recorder (207/222), KPI (209/214), XP (213), provocări (231–233) și distrugere
 * (227/228). Diferența pereche (braț − baseline) este costul sistemului, raportat per invocare, per
 * tick și per secundă simulată.
 *
 * Măsurătoarea folosește ceas de perete (`performance.now`) și rulează doar în Node, fără renderer:
 * este costul sincron al căii de tick, nu un cadru de joc. Modulul nu are nicio dependență de DOM.
 */
import { createFleetKpi, createFleetLedger, createReviewLedger } from '../../src/economy';
import { createPlayerProgress } from '../../src/missions';
import { captureWorldSnapshot } from '../../src/persistence';
import { createWorldRecorder } from '../../src/replay';
import type { SystemId } from './hardware-budget';
import { createPipelineWorld, pipelineSegment } from './profile-pipeline-fixture';
import {
  createWorldFixture,
  captureInput,
  stepWorld,
} from '../persistence/world-checkpoint-fixtures';
import { comfortForRide } from '../economy/economy-fixture';
import { activeWindow, XP_FIXTURE_START_MS } from '../missions/player-xp-fixture';
import {
  createExperienceHarness,
  completedChallenge,
} from '../missions/challenge-experience-fixture';
import { createHarness as createDestructibleFixture } from '../world/destructible-decor-fixture';

const FIXTURE_NOW = '2026-11-12T00:00:00.000Z';
const SEED = 155_001;
const VEHICLES = 70;
const RECORDER_VERSIONS = Object.freeze({
  engineVersion: 'babylon-9.29.0',
  physicsVersion: 'rapier-0.21.0',
  mapVersion: 'map-155-cost-1',
});

export interface SystemArmResult {
  readonly system: SystemId;
  readonly cadence: string;
  readonly invocationsPerSample: number;
  readonly totalMs: number[];
  readonly counters: Readonly<Record<string, number | null>>;
}

export interface SystemCostMeasurement {
  readonly measuredAt: string;
  readonly machine: string;
  readonly command: string;
  readonly ticksPerSample: number;
  readonly samples: number;
  readonly vehicles: number;
  readonly baselineMs: number[];
  readonly arms: readonly SystemArmResult[];
  readonly warmupSamples: number;
  readonly order: string;
}

export interface MeasureSystemCostOptions {
  readonly samples: number;
  readonly ticksPerSample: number;
  readonly machine: string;
  readonly measuredAt: string;
  readonly command: string;
}

type CounterSink = Record<string, number | null>;

interface ArmDefinition {
  readonly system: SystemId;
  readonly cadence: string;
  readonly invocationsPerSample: number;
  readonly run: (sample: number, ticks: number, counters: CounterSink) => Promise<number>;
}

function drivingBaseline(ticks: number): number {
  const world = createWorldFixture();
  const started = performance.now();
  for (let tick = 0; tick < ticks; tick += 1) stepWorld(world);
  return performance.now() - started;
}

async function learningArm(sample: number, ticks: number, counters: CounterSink): Promise<number> {
  const world = createPipelineWorld();
  const driving = createWorldFixture();
  let activations = 0;
  const started = performance.now();
  // Two closed segments per sample (one every 5 s simulated) through the real 103→112 pipeline.
  for (let index = 0; index < 2; index += 1) {
    world.advanceTick();
    const result = await world.pipeline.onSegmentClosed(
      pipelineSegment({
        segmentId: `segment-155:${sample}:${index}`,
        order: index + 1,
        candidateValue: 4 + index * 0.2,
      }),
    );
    if (result.status === 'COMPOSED' || result.status === 'RECOMPOSED') activations += 1;
  }
  // The authoritative tick calls advance() on every tick; that cost belongs to the same system.
  for (let tick = 0; tick < ticks; tick += 1) {
    stepWorld(driving);
    world.advanceTick();
    world.pipeline.advance();
  }
  const elapsed = performance.now() - started;
  counters.segments = 2;
  counters.activations = activations;
  world.dispose();
  return elapsed;
}

function frameOf(world: ReturnType<typeof createWorldFixture>) {
  return Object.freeze({
    tick: world.tick,
    vehicles: Object.freeze(
      world.vehicles.map((vehicle) =>
        Object.freeze({
          entityId: vehicle.entityId,
          handle: vehicle.handle,
          vehicleClass: vehicle.vehicleClass,
          controlMode: vehicle.controlMode,
          position: Object.freeze({ ...vehicle.position }),
          rotation: unitQuaternion(vehicle.rotation),
          linearVelocity: Object.freeze({ ...vehicle.linearVelocity }),
          fsmState: vehicle.fsmState,
          rideId: vehicle.rideId,
          passengerIds: Object.freeze([...vehicle.passengerIds]),
          inCamera: false,
        }),
      ),
    ),
    signals: Object.freeze(
      world.signals.map((signal) =>
        Object.freeze({
          signalId: signal.signalId,
          phase: signal.phase,
          remainingTicks: signal.remainingTicks,
        }),
      ),
    ),
  });
}

function unitQuaternion(rotation: { x: number; y: number; z: number; w: number }) {
  const norm = Math.hypot(rotation.x, rotation.y, rotation.z, rotation.w) || 1;
  return Object.freeze({
    x: rotation.x / norm,
    y: rotation.y / norm,
    z: rotation.z / norm,
    w: rotation.w / norm,
  });
}

function recorderArm(sample: number, ticks: number, counters: CounterSink): number {
  const world = createWorldFixture();
  const recorder = createWorldRecorder({
    sessionId: 'session-155-cost',
    worldEpoch: 1,
    versions: RECORDER_VERSIONS,
    pinBeforeSeconds: 5,
    pinAfterSeconds: 5,
    now: () => FIXTURE_NOW,
  });
  // The 206 fixture needs a valid snapshot before the anchor; the warmup is outside the measurement.
  for (let tick = 0; tick < 60; tick += 1) stepWorld(world);
  const captured = captureWorldSnapshot(captureInput(world));
  if (captured.status !== 'CAPTURED')
    throw new Error(`206 refused the 155 recorder anchor: ${captured.rejection.code}`);
  recorder.recordCheckpoint({
    checkpointId: `checkpoint-155-${sample}`,
    snapshot: captured.snapshot,
  });
  const started = performance.now();
  for (let tick = 0; tick < ticks; tick += 1) {
    stepWorld(world);
    // The recorder owns its 20 Hz cadence internally; the host offers every authoritative tick.
    recorder.recordTick(frameOf(world));
  }
  const elapsed = performance.now() - started;
  const stats = recorder.getStats();
  counters.peakChargedBytes = stats.peakChargedBytes;
  counters.samplesRecorded = stats.samplesRecorded;
  recorder.dispose();
  return elapsed;
}

function kpiArm(_sample: number, ticks: number, counters: CounterSink): number {
  const world = createWorldFixture();
  const ledger = createFleetLedger();
  const reviews = createReviewLedger();
  const kpi = createFleetKpi();
  // The 139 read model is prepared outside the timed loop: the arm measures the 209 ingest and the
  // aggregated snapshot read, not the creation of the comfort fixture.
  const terminalRides = Math.ceil(ticks / 60);
  const comfort = Array.from({ length: terminalRides }, (_, index) =>
    comfortForRide(`155:ride:${index}`, 'taxi-01', index * 60, { controlMode: 'AUTO' }),
  );
  let settlements = 0;
  let reviewed = 0;
  const started = performance.now();
  for (let tick = 0; tick < ticks; tick += 1) {
    stepWorld(world);
    // One terminal ride settled and reviewed per second simulated; the real fixture is far rarer.
    if (tick % 60 === 0) {
      const index = tick / 60;
      const outcome = ledger.ingest({
        eventId: `155:economy:${index}`,
        rideId: `155:ride:${index}`,
        requestId: `155:request:${index}`,
        taxiId: 'taxi-01',
        vehicleKind: 'TAXI',
        terminalState: 'COMPLETED',
        terminalTick: tick,
        passengerAboard: true,
        plannedDistanceMeters: 1_200,
        referenceTripDurationSeconds: 120,
      });
      if (outcome.settlement !== null) {
        kpi.applySettlement(outcome.settlement);
        settlements += 1;
      }
      const review = reviews.ingest({
        eventId: `155:review:${index}`,
        facts: {
          rideId: `155:ride:${index}`,
          customerId: `155:customer:${index}`,
          terminalState: 'COMPLETED',
          terminalTick: tick,
          passengerAboard: true,
          referenceTripDurationSeconds: 120,
          actualTripDurationSeconds: 120,
          comfort: comfort[index] ?? null,
        },
      });
      if (review.review !== null) {
        kpi.applyReview(review.review);
        reviewed += 1;
      }
    }
    // The HUD/dashboard reads the aggregated snapshot at 10 Hz, never per frame.
    if (tick % 6 === 0) kpi.snapshot(tick);
  }
  const elapsed = performance.now() - started;
  counters.settlements = settlements;
  counters.reviews = reviewed;
  ledger.dispose();
  reviews.dispose();
  return elapsed;
}

function xpArm(_sample: number, ticks: number, counters: CounterSink): number {
  const progress = createPlayerProgress({ playerId: 'player-155' });
  const driving = createWorldFixture();
  let windows = 0;
  const started = performance.now();
  for (let tick = 0; tick < ticks; tick += 1) {
    stepWorld(driving);
    // The 213 ledger credits active driving in 30 s windows at most once per window.
    if (tick % 300 === 0) {
      progress.observeActiveTime(
        activeWindow(XP_FIXTURE_START_MS + tick * 1000, 30_000, { controlMode: 'LEARNING' }),
      );
      windows += 1;
    }
    if (tick % 6 === 0) progress.read();
  }
  const elapsed = performance.now() - started;
  counters.windows = windows;
  counters.entries = progress.read().entries.length;
  return elapsed;
}

function challengesArm(_sample: number, ticks: number, counters: CounterSink): number {
  const harness = createExperienceHarness({ seed: SEED });
  const driving = createWorldFixture();
  let credited = 0;
  const started = performance.now();
  for (let tick = 0; tick < ticks; tick += 1) {
    stepWorld(driving);
    harness.director.advance({ ticks: 1, paused: false });
    // One completed attempt per 10 s simulated: record + credit through the real 213 ledger.
    if (tick === ticks - 5) {
      const instance = completedChallenge(harness);
      harness.record(instance);
      harness.credit(instance);
      credited += 1;
    }
    harness.experience.read();
  }
  const elapsed = performance.now() - started;
  counters.attempts = 1;
  counters.credits = credited;
  return elapsed;
}

function destructionArm(sample: number, ticks: number, counters: CounterSink): number {
  const fixture = createDestructibleFixture({ preset: 'LOW' });
  const driving = createWorldFixture();
  const definitions = fixture.plan.definitions.filter((definition) => definition.zoneId !== null);
  let impacts = 0;
  const started = performance.now();
  for (let tick = 1; tick <= ticks; tick += 1) {
    stepWorld(driving);
    if (definitions.length > 0 && tick % 50 === 1) {
      const definition = definitions[(tick + sample) % definitions.length];
      if (definition !== undefined) {
        const { x, y, z } = definition.initialTransform.positionM;
        fixture.decor.applyImpact({
          tick,
          objectId: definition.objectId,
          impulseNs: 420,
          pointM: Object.freeze({ x, y, z }),
          instigatorId: 'taxi-01',
          controlSource: 'MANUAL',
        });
        impacts += 1;
      }
    }
    fixture.decor.advance(tick);
  }
  const elapsed = performance.now() - started;
  const stats = fixture.decor.getStats();
  counters.impacts = impacts;
  counters.objects = fixture.plan.definitions.length;
  counters.brokenObjects = stats.states.BROKEN;
  fixture.bus.dispose();
  fixture.decor.dispose();
  return elapsed;
}

function invocationsFor(system: SystemId, ticks: number): number {
  switch (system) {
    case 'learning':
      return 2;
    case 'recorder':
      return ticks;
    case 'kpi':
      return Math.ceil(ticks / 60) * 2 + Math.ceil(ticks / 6);
    case 'xp':
      return Math.ceil(ticks / 300) + Math.ceil(ticks / 6);
    case 'challenges':
      return ticks + 3;
    case 'destruction':
      return ticks + Math.floor(ticks / 50);
  }
}

function armDefinitions(ticks: number): ArmDefinition[] {
  const run = (
    system: SystemId,
    cadence: string,
    body: (sample: number, ticks: number, counters: CounterSink) => number | Promise<number>,
  ): ArmDefinition => ({
    system,
    cadence,
    invocationsPerSample: invocationsFor(system, ticks),
    run: async (sample, count, counters) => body(sample, count, counters),
  });
  return [
    run(
      'learning',
      'o închidere de segment la fiecare 5 s simulate (două pe eșantion)',
      learningArm,
    ),
    run('recorder', 'un apel pe tick; recorderul decimează intern la 20 Hz', recorderArm),
    run('kpi', 'settle + review la fiecare 1 s simulată, snapshot agregat la 10 Hz', kpiArm),
    run('xp', 'fereastră activă de 30 s + citire la 10 Hz', xpArm),
    run(
      'challenges',
      'advance per tick + o încercare completă la fiecare 10 s simulate',
      challengesArm,
    ),
    run('destruction', 'advance per tick + un impact la fiecare 50 de tick-uri', destructionArm),
  ];
}

/**
 * Runs the paired measurement. One unmeasured warmup execution of every arm and of the baseline
 * precedes the samples, so the numbers describe the steady JIT state.
 */
export async function measureSystemCosts(
  options: MeasureSystemCostOptions,
): Promise<SystemCostMeasurement> {
  if (!Number.isInteger(options.samples) || options.samples < 3)
    throw new RangeError('The cost probe needs at least three measured samples');
  if (!Number.isInteger(options.ticksPerSample) || options.ticksPerSample < 60)
    throw new RangeError('The cost probe needs at least 60 ticks per sample');
  const arms = armDefinitions(options.ticksPerSample);
  const baselineMs: number[] = [];
  const totals = new Map<SystemId, number[]>(arms.map((arm) => [arm.system, []]));
  const counters = new Map<SystemId, CounterSink>(arms.map((arm) => [arm.system, {}]));
  drivingBaseline(Math.min(options.ticksPerSample, 120));
  for (const arm of arms) await arm.run(0, options.ticksPerSample, counters.get(arm.system)!);
  for (let sample = 0; sample < options.samples; sample += 1) {
    // Alternate the order (baseline first on even samples, last on odd samples) so a thermal step
    // or a clock drift cannot systematically inflate the deltas.
    if (sample % 2 === 0) {
      baselineMs.push(drivingBaseline(options.ticksPerSample));
      for (const arm of arms)
        (totals.get(arm.system) as number[]).push(
          await arm.run(sample, options.ticksPerSample, counters.get(arm.system)!),
        );
    } else {
      const times: [SystemId, number][] = [];
      for (const arm of arms)
        times.push([
          arm.system,
          await arm.run(sample, options.ticksPerSample, counters.get(arm.system)!),
        ]);
      baselineMs.push(drivingBaseline(options.ticksPerSample));
      for (const [system, time] of times) (totals.get(system) as number[]).push(time);
    }
  }
  return Object.freeze({
    measuredAt: options.measuredAt,
    machine: options.machine,
    command: options.command,
    ticksPerSample: options.ticksPerSample,
    samples: options.samples,
    vehicles: VEHICLES,
    baselineMs,
    warmupSamples: 1,
    order: 'baseline first on even samples, last on odd samples',
    arms: Object.freeze(
      arms.map((arm) =>
        Object.freeze({
          system: arm.system,
          cadence: arm.cadence,
          invocationsPerSample: arm.invocationsPerSample,
          totalMs: totals.get(arm.system) as number[],
          counters: Object.freeze({ ...counters.get(arm.system)! }),
        }),
      ),
    ),
  });
}

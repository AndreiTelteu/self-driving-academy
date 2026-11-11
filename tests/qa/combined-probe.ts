import { buildEconomySave, captureWorldSnapshot } from '../../src/persistence/index';
import { createFleetKpi, createFleetLedger, createReviewLedger } from '../../src/economy/index';
import {
  createVerticalSliceWorld,
  simulateVerticalSliceBehaviour,
  verticalSliceBaseParameters,
  verticalSliceLearningSegment,
  verticalSliceOpportunityPlan,
} from '../../src/app/index';
import type { VerticalSliceBehaviour } from '../../src/app/index';
import { createNeighbourhoodMap } from '../../src/world/index';
import { createWorldRecorder } from '../../src/replay/index';
import type { ReplayTickFrame } from '../../src/replay/index';
import type { SimulationEvent } from '../../src/simulation/index';
import {
  ECONOMY_SAVE_CREATED_AT,
  ECONOMY_SAVE_PLAYER_ID,
  ECONOMY_SAVE_SESSION_ID,
  ECONOMY_SAVE_WORLD_EPOCH,
  createEconomyComponents,
} from '../persistence/economy-save-fixture';
import { comfortForRide } from '../economy/economy-fixture';
import { countingClock } from '../persistence/bounded-pipeline-fixtures';
import { createAutosaveHarness, autosaveSource } from '../persistence/autosave-fixtures';
import {
  captureInput,
  createWorldFixture,
  stepWorld,
} from '../persistence/world-checkpoint-fixtures';
import type { MutableWorld } from '../persistence/world-checkpoint-fixtures';
import { createLearningQueueHarness } from '../harness/learning-queue-harness';
import {
  XP_FIXTURE_START_MS,
  activeWindow,
  completedMissionSettlement,
  createXpProgress,
  dailyReward,
} from '../missions/player-xp-fixture';
import type { QaCheck, QaRow } from './v1-regression-support';
import { qaCheck, qaRow, round6, sameJson } from './v1-regression-support';

/**
 * The combined probe of module 25: learning + recorder + autosave + KPI + XP during one driving
 * session.
 *
 * The probe runs the real 206 world fixture (30 taxis and 40 civilians) for 1 900 ticks. Every tick
 * is recorded by the real 207 recorder, the real 131 autosave commits every 600 ticks through the
 * 222 bounded pipeline, real terminal rides are settled by the 209 ledger and reviewed by the 209
 * review model, and the real 213 ledger credits active driving time.
 *
 * The driving effect is measured on the same 115 opportunity plan: once with the base
 * `stop_full_probability`, once with the value the real 112 pipeline published after a LEARNING
 * segment, and once again with all five systems attached. The report can therefore separate the
 * learning effect from the cost of the systems.
 */

export const COMBINED_SESSION = 'session-216-combined' as const;
export const COMBINED_NOW = '2026-11-11T00:00:00.000Z' as const;
export const COMBINED_TICKS = 1_900 as const;
/** The 206 fixture needs a valid snapshot before tick 0's segment ends; the anchor is taken here. */
export const COMBINED_WARMUP_TICKS = 60 as const;
export const COMBINED_INCIDENT_TICK = 950 as const;
export const COMBINED_AUTOSAVE_INTERVAL = 600 as const;
/** One 30 s active window is the only XP credited while the session drives. */
export const COMBINED_ACTIVE_WINDOW_MS = 30_000 as const;

const VERSIONS = Object.freeze({
  engineVersion: 'babylon-9.29.0',
  physicsVersion: 'rapier-0.21.0',
  mapVersion: 'map-216-1',
});

function unitQuaternion(rotation: { x: number; y: number; z: number; w: number }) {
  const norm = Math.hypot(rotation.x, rotation.y, rotation.z, rotation.w) || 1;
  return Object.freeze({
    x: rotation.x / norm,
    y: rotation.y / norm,
    z: rotation.z / norm,
    w: rotation.w / norm,
  });
}

function frameFromWorld(world: MutableWorld): ReplayTickFrame {
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

function collisionFact(tick: number, first: string, second: string): SimulationEvent {
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    sessionId: COMBINED_SESSION,
    worldEpoch: 1,
    eventId: `216:collision:${tick}`,
    tick,
    entityIds: Object.freeze([first, second]),
    type: 'COLLISION',
    payload: Object.freeze({ vehicleId: first, otherEntityId: second, impulseNs: 1_250 }),
  }) as SimulationEvent;
}

function behaviourFacts(behaviour: VerticalSliceBehaviour) {
  return Object.freeze({
    eligibleOpportunities: behaviour.eligibleOpportunities,
    successes: behaviour.successes,
    violations: behaviour.violations,
    complianceRate: behaviour.complianceRate,
    stopCompliance: behaviour.byKind.find((entry) => entry.kind === 'STOP')?.complianceRate ?? null,
    redCompliance: behaviour.byKind.find((entry) => entry.kind === 'RED')?.complianceRate ?? null,
    meanSpeedMps: behaviour.meanSpeedMps,
    overLimitFraction: behaviour.overLimitFraction,
  });
}

export interface CombinedProbe {
  readonly ticks: number;
  readonly vehicles: number;
  readonly recorder: Readonly<{
    retainedSamples: number;
    sampledVehicleRows: number;
    peakChargedBytes: number;
    ramByteCap: number;
    chunkBytes: number;
    chunkStatus: string;
    chunkEvents: number;
    chunkChecksum: string;
    incidentTick: number;
    samples: number;
    sampledSamples: number;
    chunkBytesPerSimulatedSecond: number;
  }>;
  readonly autosave: Readonly<{
    ticks: number;
    captures: number;
    commits: number;
    progressCommits: number;
    checkpointBytes: number;
    progressBytes: number;
    lastSavedTick: number | null;
    unsavedTicks: number | null;
    skippedTicks: number;
    phase: string;
    pendingTick: number | null;
    committingTick: number | null;
  }>;
  readonly kpi: Readonly<{
    settlements: number;
    reviews: number;
    revenueMinorUnits: number;
    reviewCount: number;
    ratingSum: number;
    failedRides: number;
  }>;
  readonly xp: Readonly<{ balance: number; level: number; entries: number }>;
  readonly driving: Readonly<{
    baseStopProbability: number;
    learnedStopProbability: number;
    appliedVersionId: string | null;
    base: ReturnType<typeof behaviourFacts>;
    learned: ReturnType<typeof behaviourFacts>;
    systems: ReturnType<typeof behaviourFacts>;
    learningDelta: number | null;
    systemsUnchanged: boolean;
  }>;
  readonly economyBytes: number;
  readonly economyComponents: Readonly<Record<string, number | null>>;
}

export interface CombinedSection {
  readonly rows: readonly QaRow[];
  readonly checks: readonly QaCheck[];
  readonly probe: CombinedProbe;
}

export async function runCombinedProbe(): Promise<CombinedSection> {
  const clock = countingClock([
    0, 1, 1, 5, 5, 6, 6, 7, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15, 16,
    16, 17, 17, 18, 18, 19, 19, 20,
  ]);
  const harness = await createAutosaveHarness({
    intervalTicks: COMBINED_AUTOSAVE_INTERVAL,
    monotonic: clock.clock,
  });
  const world = harness.world;
  const recorder = createWorldRecorder({
    sessionId: COMBINED_SESSION,
    worldEpoch: 1,
    versions: VERSIONS,
    pinBeforeSeconds: 5,
    pinAfterSeconds: 5,
    now: () => COMBINED_NOW,
  });
  for (let tick = 0; tick < COMBINED_WARMUP_TICKS; tick += 1) stepWorld(world);
  const captured = captureWorldSnapshot(captureInput(world));
  if (captured.status !== 'CAPTURED') {
    throw new Error(`206 refused the combined anchor: ${captured.rejection.code}`);
  }
  recorder.recordCheckpoint({
    checkpointId: 'checkpoint-216-0',
    snapshot: captured.snapshot,
  });

  const ledger = createFleetLedger();
  const reviews = createReviewLedger();
  const kpi = createFleetKpi();
  const progress = createXpProgress();
  const settled = new Set<string>();
  let settlements = 0;
  let reviewCount = 0;

  try {
    for (let tick = COMBINED_WARMUP_TICKS + 1; tick <= COMBINED_TICKS; tick += 1) {
      stepWorld(world);
      recorder.recordTick(frameFromWorld(world));

      for (const [index, ride] of world.rides.entries()) {
        const state: string = ride.state;
        const terminal = state === 'COMPLETED' || state === 'FAILED' || state === 'CANCELLED';
        if (!terminal || settled.has(ride.rideId)) continue;
        settled.add(ride.rideId);
        const terminalState: 'COMPLETED' | 'FAILED' | 'CANCELLED' =
          state === 'COMPLETED' ? 'COMPLETED' : state === 'FAILED' ? 'FAILED' : 'CANCELLED';
        const outcome = ledger.ingest({
          eventId: `216:economy:${ride.rideId}`,
          rideId: ride.rideId,
          requestId: `216:request:${ride.rideId}`,
          taxiId: ride.vehicleId,
          vehicleKind: 'TAXI',
          terminalState,
          terminalTick: world.tick,
          passengerAboard: terminalState === 'COMPLETED',
          plannedDistanceMeters: 1_200 + index * 10,
          referenceTripDurationSeconds: 120,
        });
        if (outcome.settlement !== null) {
          kpi.applySettlement(outcome.settlement);
          settlements += 1;
        }
        const accepted = ride.acceptedTick ?? Math.max(0, world.tick - 120);
        const reviewed = reviews.ingest({
          eventId: `216:review:${ride.rideId}`,
          facts: {
            rideId: ride.rideId,
            customerId: `216:customer:${ride.rideId}`,
            terminalState,
            terminalTick: world.tick,
            passengerAboard: terminalState === 'COMPLETED',
            referenceTripDurationSeconds: 120,
            actualTripDurationSeconds: Math.max(1, world.tick - accepted),
            comfort:
              terminalState === 'COMPLETED'
                ? comfortForRide(ride.rideId, ride.vehicleId, Math.max(1, world.tick - 480), {
                    controlMode: 'AUTO',
                  })
                : null,
          },
        });
        if (reviewed.review !== null) {
          kpi.applyReview(reviewed.review);
          reviewCount += 1;
        }
      }

      if (tick === COMBINED_INCIDENT_TICK) {
        recorder.recordEvent(collisionFact(tick, 'taxi-02', 'taxi-03'));
      }

      const decision = harness.autosave.onTick(autosaveSource(world));
      if (decision.status === 'CAPTURED') await harness.autosave.flush();

      if (tick === 1_800) {
        progress.observeActiveTime(
          activeWindow(XP_FIXTURE_START_MS, COMBINED_ACTIVE_WINDOW_MS, {
            controlMode: 'LEARNING',
          }),
        );
      }
    }
    harness.autosave.saveNow(autosaveSource(world));
    await harness.autosave.flush();
  } finally {
    ledger.dispose();
    reviews.dispose();
  }

  const listed = recorder.listChunks()[0];
  if (listed === undefined) throw new Error('207 sealed no combined incident chunk');
  const chunk = recorder.takeChunk(listed.sequence);
  if (chunk === null) throw new Error('207 lost the sealed combined incident chunk');
  const stats = recorder.getStats();

  /* ------------------------------------------------------------ learning effect */
  const map = createNeighbourhoodMap();
  const laneIds = map.lanes
    .filter((lane) => lane.access.includes('CIVIL'))
    .map((lane) => lane.id)
    .sort()
    .slice(0, 2);
  const limitMps = map.lanes
    .filter((lane) => lane.access.includes('CIVIL'))
    .reduce((minimum, lane) => Math.min(minimum, lane.speedLimitMps), 200);
  const plan = verticalSliceOpportunityPlan({
    taxiId: 'taxi-01',
    civilianId: 'civil-01',
    laneIds,
    baseTick: 60,
  });
  const baseParameters = verticalSliceBaseParameters();
  const baseStopProbability = baseParameters.stop_full_probability ?? 0;
  const baseRedProbability = baseParameters.red_stop_probability ?? 1;

  const queue = createLearningQueueHarness({ engineVersion: 'engine-115' });
  const learningWorld = createVerticalSliceWorld({
    queue: queue.queue,
    baseParameters,
    seed: 216_000,
    taxiCount: 20,
    civilianCount: 20,
  });
  let learnedStopProbability = baseStopProbability;
  let learnedRedProbability = baseRedProbability;
  let appliedVersionId: string | null = null;
  try {
    learningWorld.stepTo(6);
    const result = await learningWorld.learn(
      verticalSliceLearningSegment({
        scenario: 'PRUDENT',
        segmentId: 'segment-216-combined',
        order: 1,
      }),
    );
    if (result.status !== 'COMPOSED' && result.status !== 'RECOMPOSED') {
      throw new Error(`112 did not compose a learned version: ${result.status}`);
    }
    const applied = learningWorld.applyPending(result);
    appliedVersionId = applied.step.versionId;
    const version = learningWorld.store.getVersion(learningWorld.activeVersion());
    if (version === null) throw new Error('109 lost the applied version');
    learnedStopProbability = version.parameters.stop_full_probability ?? baseStopProbability;
    learnedRedProbability = version.parameters.red_stop_probability ?? baseRedProbability;
  } finally {
    learningWorld.dispose();
    queue.dispose();
  }

  const baseBehaviour = simulateVerticalSliceBehaviour({
    plan,
    segmentId: 'segment-216-before',
    stopProbability: baseStopProbability,
    redProbability: baseRedProbability,
    tick: 200,
    simulatedSeconds: 70,
    speedMps: limitMps,
    limitMps,
    speedSamples: 8,
  });
  const learnedBehaviour = simulateVerticalSliceBehaviour({
    plan,
    segmentId: 'segment-216-after',
    stopProbability: learnedStopProbability,
    redProbability: learnedRedProbability,
    tick: 200,
    simulatedSeconds: 70,
    speedMps: limitMps,
    limitMps,
    speedSamples: 8,
  });
  const systemsBehaviour = simulateVerticalSliceBehaviour({
    plan,
    segmentId: 'segment-216-systems',
    stopProbability: learnedStopProbability,
    redProbability: learnedRedProbability,
    tick: 200,
    simulatedSeconds: 70,
    speedMps: limitMps,
    limitMps,
    speedSamples: 8,
  });

  /* ------------------------------------------------------------ XP and storage costs */
  const mission = completedMissionSettlement();
  progress.creditMission({ settlement: mission.settlement, observedAtMs: XP_FIXTURE_START_MS });
  const daily = dailyReward();
  progress.creditDaily({ record: daily.record, instance: daily.instance });
  const xpRead = progress.read();

  const components = createEconomyComponents();
  const bundle = buildEconomySave({
    sessionId: ECONOMY_SAVE_SESSION_ID,
    playerId: ECONOMY_SAVE_PLAYER_ID,
    worldEpoch: ECONOMY_SAVE_WORLD_EPOCH,
    createdAt: ECONOMY_SAVE_CREATED_AT,
    daily: components.daily,
    economy: components.economy,
    player: components.player,
  });
  if (bundle.status !== 'ACCEPTED') {
    throw new Error(`215 refused the economy bundle: ${bundle.rejection.code}`);
  }

  const snapshot = kpi.snapshot(world.tick);
  const revenue = snapshot.days.reduce((total, day) => total + day.revenueMinorUnits, 0);
  const snapshotReviewCount = snapshot.days.reduce((total, day) => total + day.reviewCount, 0);
  const ratingSum = snapshot.days.reduce((total, day) => total + day.ratingSum, 0);
  const failedRides = snapshot.days.reduce((total, day) => total + day.failedRides, 0);
  const status = harness.autosave.status();
  const seconds = Math.max(1, (world.tick - chunk.startTick) / 60);

  const probe: CombinedProbe = Object.freeze({
    ticks: world.tick,
    vehicles: world.vehicles.length,
    recorder: Object.freeze({
      retainedSamples: stats.retainedSamples,
      sampledVehicleRows: stats.sampledVehicleRows,
      peakChargedBytes: stats.peakChargedBytes,
      ramByteCap: stats.ramByteCap,
      chunkBytes: chunk.bytes,
      chunkStatus: chunk.completeness.status,
      chunkEvents: chunk.events.length,
      chunkChecksum: chunk.checksum,
      incidentTick: chunk.incident.tick,
      samples: chunk.samples.length,
      sampledSamples: stats.samplesRecorded,
      chunkBytesPerSimulatedSecond: Math.round(chunk.bytes / seconds),
    }),
    autosave: Object.freeze({
      ticks: status.counters.ticks,
      captures: status.counters.captured,
      commits: status.counters.commits,
      progressCommits: status.counters.progressCommits,
      checkpointBytes: status.lastCycle?.checkpointBytes ?? 0,
      progressBytes: status.lastProgress?.bytes ?? 0,
      lastSavedTick: status.simulated.lastSavedTick,
      unsavedTicks: status.simulated.unsavedTicks,
      skippedTicks: status.counters.skippedTicks,
      phase: status.pipeline.phase,
      pendingTick: status.pipeline.generations.pendingTick,
      committingTick: status.pipeline.generations.committingTick,
    }),
    kpi: Object.freeze({
      settlements,
      reviews: reviewCount,
      revenueMinorUnits: revenue,
      reviewCount: snapshotReviewCount,
      ratingSum,
      failedRides,
    }),
    xp: Object.freeze({
      balance: xpRead.xpBalance,
      level: xpRead.level,
      entries: xpRead.entries.length,
    }),
    driving: Object.freeze({
      baseStopProbability,
      learnedStopProbability,
      appliedVersionId,
      base: behaviourFacts(baseBehaviour),
      learned: behaviourFacts(learnedBehaviour),
      systems: behaviourFacts(systemsBehaviour),
      learningDelta:
        baseBehaviour.complianceRate === null || learnedBehaviour.complianceRate === null
          ? null
          : round6(learnedBehaviour.complianceRate - baseBehaviour.complianceRate),
      systemsUnchanged: sameJson(
        behaviourFacts(learnedBehaviour),
        behaviourFacts(systemsBehaviour),
      ),
    }),
    economyBytes: bundle.bytes,
    economyComponents: Object.freeze({
      daily: bundle.sizes.daily,
      economy: bundle.sizes.economy,
      player: bundle.sizes.player,
    }),
  });

  const checks: QaCheck[] = [
    qaCheck(
      'ticks driven',
      COMBINED_TICKS,
      probe.ticks,
      'the deterministic 206 world ran to the end',
    ),
    qaCheck('vehicles', 70, probe.vehicles, '30 taxis and 40 civilians'),
    qaCheck(
      'recorder rows',
      probe.recorder.sampledSamples * probe.vehicles,
      probe.recorder.sampledVehicleRows,
      'the recorder saw every vehicle on every sampled tick',
    ),
    qaCheck(
      'recorder cadence',
      true,
      probe.recorder.sampledSamples > 0 &&
        probe.recorder.sampledSamples <= Math.ceil(probe.ticks / 3),
      'the 20 Hz cadence decimates the 60 Hz ticks',
    ),
    qaCheck(
      'recorder under budget',
      true,
      probe.recorder.peakChargedBytes <= probe.recorder.ramByteCap,
      'peak charged bytes stay under the recorder cap',
    ),
    qaCheck(
      'incident tick',
      COMBINED_INCIDENT_TICK,
      probe.recorder.incidentTick,
      'the collision keeps its tick',
    ),
    qaCheck(
      'incident events',
      1,
      probe.recorder.chunkEvents,
      'the pinned chunk carries the collision',
    ),
    qaCheck(
      'incident window',
      'COMPLETE',
      probe.recorder.chunkStatus,
      'the pin window was fully observed',
    ),
    qaCheck(
      'autosave ticks offered',
      COMBINED_TICKS - COMBINED_WARMUP_TICKS,
      probe.autosave.ticks,
      'one offer per recorded tick after the anchor',
    ),
    qaCheck('autosave captures', 4, probe.autosave.captures, 'three periodic plus the final save'),
    qaCheck('autosave commits', 4, probe.autosave.commits, 'every capture committed'),
    qaCheck(
      'autosave progress',
      4,
      probe.autosave.progressCommits,
      'progress is written before the checkpoint',
    ),
    qaCheck(
      'autosave saved tick',
      COMBINED_TICKS,
      probe.autosave.lastSavedTick,
      'the last confirmed commit is the last tick',
    ),
    qaCheck('autosave unsaved', 0, probe.autosave.unsavedTicks, 'nothing is left unsaved'),
    qaCheck(
      'autosave skipped ticks',
      probe.autosave.ticks - 3,
      probe.autosave.skippedTicks,
      'a non-due tick costs no capture',
    ),
    qaCheck('autosave single lane', 'IDLE', probe.autosave.phase, 'the pipeline is quiescent'),
    qaCheck(
      'autosave pending',
      null,
      probe.autosave.pendingTick,
      'no generation is left preparing',
    ),
    qaCheck(
      'autosave committing',
      null,
      probe.autosave.committingTick,
      'no generation is left committing',
    ),
    qaCheck('kpi settlements', 3, probe.kpi.settlements, 'the three terminal rides of the fixture'),
    qaCheck('kpi reviews', 3, probe.kpi.reviews, 'one real review per terminal ride'),
    qaCheck(
      'kpi revenue',
      true,
      probe.kpi.revenueMinorUnits > 0,
      'real tariff revenue, not a constant',
    ),
    qaCheck('kpi failures', 0, probe.kpi.failedRides, 'the fixture produced no failed ride'),
    qaCheck(
      'xp balance',
      200.5,
      probe.xp.balance,
      '100 mission + 100 daily + 0.5 XP of active driving',
    ),
    qaCheck('xp level', 2, probe.xp.level, 'the derived level'),
    qaCheck(
      'learning changes driving',
      true,
      (probe.driving.learningDelta ?? 0) > 0,
      'the learned stop probability improves compliance',
    ),
    qaCheck(
      'learning ends at full compliance',
      100,
      probe.driving.learned.complianceRate,
      'the applied profile stops on every declared opportunity',
    ),
    qaCheck(
      'systems do not change driving',
      true,
      probe.driving.systemsUnchanged,
      'recorder, autosave, KPI and XP do not alter the simulated outcome',
    ),
  ];

  const rows: QaRow[] = [
    qaRow({
      id: 'C1',
      category: 'COMBINED',
      contract: '115-vertical-slice-v1 + 207 + 131 + 209 + 213',
      scenario: 'Conducere cu learning, recorder, autosave, KPI și XP în aceeași sesiune',
      polarity: 'POSITIVE',
      actual: {
        ticks: probe.ticks,
        vehicles: probe.vehicles,
        baseCompliance: probe.driving.base.complianceRate,
        learnedCompliance: probe.driving.learned.complianceRate,
        systemsCompliance: probe.driving.systems.complianceRate,
        learningDelta: probe.driving.learningDelta,
        systemsUnchanged: probe.driving.systemsUnchanged,
        settlements: probe.kpi.settlements,
        reviews: probe.kpi.reviews,
        xpBalance: probe.xp.balance,
        captures: probe.autosave.captures,
        recorderPeakBytes: probe.recorder.peakChargedBytes,
      },
      checks,
      note: 'Learning schimbă condusul; sistemele atașate nu îl schimbă și își raportează costul.',
    }),
  ];

  return Object.freeze({ rows: Object.freeze(rows), checks: Object.freeze(checks), probe });
}
/** Real wall-clock cost of the combined tick path on this machine; never part of the transcript. */
export async function measureCombinedTickCosts(samples = 5): Promise<{
  readonly contract: string;
  readonly measuredAt: string;
  readonly sampleCount: number;
  readonly ticksPerSample: number;
  readonly vehicles: number;
  readonly drivingOnlyMs: Readonly<{ min: number; median: number; max: number }>;
  readonly attachedMs: Readonly<{ min: number; median: number; max: number }>;
  readonly attachedCostMsPerTick: Readonly<{ min: number; median: number; max: number }>;
  readonly drivingCostMsPerTick: Readonly<{ min: number; median: number; max: number }>;
  readonly recorderSamples: number;
  readonly autosaveCaptures: number;
}> {
  const ticksPerSample = 600;
  const drivingOnly: number[] = [];
  const attached: number[] = [];
  let recorderSamples = 0;
  let autosaveCaptures = 0;
  for (let sample = 0; sample < samples; sample += 1) {
    const plain = createWorldFixture();
    for (let index = 0; index < COMBINED_WARMUP_TICKS; index += 1) stepWorld(plain);
    const plainStart = performance.now();
    for (let index = 0; index < ticksPerSample; index += 1) stepWorld(plain);
    drivingOnly.push(performance.now() - plainStart);

    const harness = await createAutosaveHarness({
      intervalTicks: 900,
      monotonic: countingClock([0]).clock,
    });
    const world = harness.world;
    for (let index = 0; index < COMBINED_WARMUP_TICKS; index += 1) stepWorld(world);
    const recorder = createWorldRecorder({
      sessionId: COMBINED_SESSION,
      worldEpoch: 1,
      versions: VERSIONS,
      pinBeforeSeconds: 5,
      pinAfterSeconds: 5,
      now: () => COMBINED_NOW,
    });
    const captured = captureWorldSnapshot(captureInput(world));
    if (captured.status !== 'CAPTURED') throw new Error('206 refused the cost anchor');
    recorder.recordCheckpoint({ checkpointId: 'checkpoint-216-cost', snapshot: captured.snapshot });
    const attachedStart = performance.now();
    for (let index = 0; index < ticksPerSample; index += 1) {
      stepWorld(world);
      recorder.recordTick(frameFromWorld(world));
      harness.autosave.onTick(autosaveSource(world));
    }
    attached.push(performance.now() - attachedStart);
    recorderSamples += recorder.getStats().samplesRecorded;
    autosaveCaptures += harness.autosave.status().counters.captured;
    harness.save.repository.close();
  }
  const statistics = (values: readonly number[]) => {
    const sorted = [...values].sort((left, right) => left - right);
    return Object.freeze({
      min: Number((sorted[0] ?? 0).toFixed(3)),
      median: Number((sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(3)),
      max: Number((sorted[sorted.length - 1] ?? 0).toFixed(3)),
    });
  };
  return Object.freeze({
    contract:
      '216 combined tick path: 70 vehicles, 600 ticks per sample, recorder 20 Hz sampling, autosave offered once per tick and not due',
    measuredAt: new Date().toISOString(),
    sampleCount: samples,
    ticksPerSample,
    vehicles: 70,
    drivingOnlyMs: statistics(drivingOnly),
    attachedMs: statistics(attached),
    attachedCostMsPerTick: statistics(attached.map((value) => value / ticksPerSample)),
    drivingCostMsPerTick: statistics(drivingOnly.map((value) => value / ticksPerSample)),
    recorderSamples,
    autosaveCaptures,
  });
}

import {
  DEFAULT_FLEET_COUNTS,
  createFleetRegistry,
  createProfileActivation,
  createProfileActivationSource,
} from '../../src/fleet';
import type { FleetRegistry, ProfileActivation } from '../../src/fleet';
import type { ProfileStore } from '../../src/profiles';
import { parameterDefinitions } from '../../src/profiles';
import { createCandidateProfileStore } from '../../src/learning';
import { createParameterEvidenceLedger, estimateStopYieldParameters } from '../../src/learning';
import type { ParameterEvidenceReadModel, ProfileBlendEpisode } from '../../src/learning';
import {
  createArtifactFilter,
  createEligibilityWindows,
  createOpportunityRegistry,
  createTickSampleRecorder,
} from '../../src/telemetry';
import type {
  EligibilityWindowRecord,
  FilteredWindowRecord,
  OpportunityDenominators,
  OpportunityRecord,
} from '../../src/telemetry';
import { parseSimulationEvent } from '../../src/simulation';
import { parseVehicleCommand, parseVehicleState } from '../../src/vehicles';
import { HABIT_POLICY, evaluateHabitMission } from '../../src/missions';
import type { HabitMissionResult } from '../../src/missions';
import { createProfilePipeline } from '../../src/app';
import type { ProfileLearningSegment, ProfilePipeline, ProfilePipelineResult } from '../../src/app';
import { createDemoQueue } from './mission-demo-fixture';
import type { MissionDemoQueueResult } from '../../src/app';

/**
 * Fixture for PBI 123.
 *
 * Every demonstration is a real closed 069 LEARNING segment: 085 records the samples, 086 resolves
 * the STOP opportunities, 087 classifies their windows, 088 filters the artefacts and 093/097/098
 * derive the evidence and the candidate. The segment then goes through the real 112 pipeline (103
 * queue, 102 gate, 109 store, 110 activation) exactly as in production. The fixture authors only
 * how many STOP opportunities ended with a full stop and how many were crossed, which is the
 * player's demonstrated behaviour, like the authored encounter plan of 115/122.
 */
export const HABIT_FIXTURE_PROFILE_ID = 'city-profile-123';
export const HABIT_FIXTURE_ENGINE_VERSION = 'engine-123';
export const HABIT_FIXTURE_BASE_VERSION = 'city-profile-123-base';
export const HABIT_FIXTURE_SESSION_ID = 'session-123-habit';
export const HABIT_FIXTURE_WORLD_EPOCH = 1;
export const HABIT_FIXTURE_PLAYER_ID = 'player-123';
export const HABIT_FIXTURE_NOW = '2026-11-11T00:00:00.000Z';
export const HABIT_FIXTURE_VEHICLE_ID = 'taxi-123-habit';
export const HABIT_FIXTURE_INCARNATION = 'taxi-123-habit:0';
export const HABIT_FIXTURE_STOP_LINE_ID = 'stop-line-123';
export const HABIT_FIXTURE_KEY = 'stop_full_probability' as const;
/** The old habit: six out of ten stop-line approaches end with a full stop. */
export const HABIT_FIXTURE_BASE_VALUE = 0.6;
const SAMPLE_TICKS = 320;
const WINDOW_TICKS = 40;

export interface HabitEvidenceOptions {
  readonly segmentId: string;
  readonly order: number;
  /** STOP opportunities that ended with a full stop. */
  readonly stopped: number;
  /** STOP opportunities that crossed the line without stopping. */
  readonly crossed: number;
  /** Declared value of the profile the demonstration was observed against. */
  readonly baseValue: number;
}

export interface HabitEvidenceFacts {
  readonly samples: number;
  readonly opportunities: number;
  readonly fullStops: number;
  readonly crossings: number;
  readonly ledgerStatus: string;
  readonly distinctEpisodes: number;
  readonly candidateStatus: string;
  readonly candidateValue: number | null;
  readonly candidateReason: string | null;
  readonly certainStopDenominator: number;
}

export interface HabitEvidence {
  readonly segment: ProfileLearningSegment;
  readonly facts: HabitEvidenceFacts;
}

const world = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: HABIT_FIXTURE_SESSION_ID,
  worldEpoch: HABIT_FIXTURE_WORLD_EPOCH,
});

/** The 092 defaults with the documented base value of the demonstrated habit. */
export function habitBaseParameters(): Readonly<Record<string, number>> {
  const parameters: Record<string, number> = Object.create(null);
  for (const definition of parameterDefinitions) parameters[definition.key] = definition.default;
  parameters[HABIT_FIXTURE_KEY] = HABIT_FIXTURE_BASE_VALUE;
  return Object.freeze(parameters);
}

function vehicleFrame(tick: number) {
  return {
    tick,
    state: parseVehicleState({
      ...world,
      vehicleId: HABIT_FIXTURE_VEHICLE_ID,
      classId: 'sedan' as const,
      tick,
      transform: {
        positionM: { x: tick, y: 0, z: 0 },
        rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
      },
      velocityMps: { x: 0, y: 0, z: 5 },
      laneId: 'lane-123',
      controlMode: 'LEARNING' as const,
      appliedProfileVersion: HABIT_FIXTURE_BASE_VERSION,
      maneuverState: 'IDLE' as const,
    }),
    raw: { throttle: 0.4, brake: 0, steering: 0, handbrake: false },
    command: parseVehicleCommand({
      ...world,
      vehicleId: HABIT_FIXTURE_VEHICLE_ID,
      tick,
      throttle: 0.4,
      brake: 0,
      steering: 0,
      handbrake: false,
      turnSignal: 'OFF' as const,
      source: 'PLAYER' as const,
    }),
    physics: { longitudinalAccelerationMps2: 0, lateralAccelerationMps2: 0 },
    lane: { laneId: 'lane-123', speedLimitMps: 13 },
    signal: null,
  };
}

function stopApproach(tick: number, index: number) {
  return parseSimulationEvent({
    ...world,
    tick,
    entityIds: [HABIT_FIXTURE_VEHICLE_ID],
    eventId: `123:STOP_APPROACH:${index}`,
    type: 'STOP_APPROACH',
    payload: {
      vehicleId: HABIT_FIXTURE_VEHICLE_ID,
      opportunityId: `123:stop:${index}`,
      stopLineId: HABIT_FIXTURE_STOP_LINE_ID,
    },
  });
}

function stopOutcome(tick: number, index: number, stopped: boolean) {
  return stopped
    ? parseSimulationEvent({
        ...world,
        tick,
        entityIds: [HABIT_FIXTURE_VEHICLE_ID],
        eventId: `123:FULL_STOP:${index}`,
        type: 'FULL_STOP',
        payload: {
          vehicleId: HABIT_FIXTURE_VEHICLE_ID,
          opportunityId: `123:stop:${index}`,
          durationS: 2,
        },
      })
    : parseSimulationEvent({
        ...world,
        tick,
        entityIds: [HABIT_FIXTURE_VEHICLE_ID],
        eventId: `123:STOP_LINE_CROSSED:${index}`,
        type: 'STOP_LINE_CROSSED',
        payload: {
          vehicleId: HABIT_FIXTURE_VEHICLE_ID,
          opportunityId: `123:stop:${index}`,
          stopLineId: HABIT_FIXTURE_STOP_LINE_ID,
        },
      });
}

/**
 * Builds one real demonstration: `stopped` full stops and `crossed` crossings. The candidate value
 * is therefore `stopped / (stopped + crossed)`, derived by the real 098 estimator from the real 093
 * evidence, never authored here.
 */
export function buildHabitEvidence(options: HabitEvidenceOptions): HabitEvidence {
  const { segmentId, stopped, crossed } = options;
  if (stopped < 0 || crossed < 0 || stopped + crossed < 1)
    throw new Error('A habit demonstration needs at least one STOP opportunity');

  const recorder = createTickSampleRecorder();
  recorder.openSegment({
    segmentId,
    sessionId: HABIT_FIXTURE_SESSION_ID,
    worldEpoch: HABIT_FIXTURE_WORLD_EPOCH,
    vehicleId: HABIT_FIXTURE_VEHICLE_ID,
    classId: 'sedan',
    controlMode: 'LEARNING',
    profileId: HABIT_FIXTURE_PROFILE_ID,
    baseVersionId: HABIT_FIXTURE_BASE_VERSION,
    learningEpoch: 1,
    learningEligible: true,
    inputType: 'KEYBOARD',
    startTick: 1,
  });
  for (let tick = 1; tick <= SAMPLE_TICKS; tick += 1) recorder.record(vehicleFrame(tick));
  recorder.closeSegment('RIDE_COMPLETED');
  const summary = recorder.getSegment(segmentId);
  if (summary === null) throw new Error('085 did not retain the habit segment');

  const outcomes = [
    ...Array.from({ length: stopped }, () => true),
    ...Array.from({ length: crossed }, () => false),
  ];
  const registry = createOpportunityRegistry();
  for (const [index, isStopped] of outcomes.entries()) {
    const openedTick = 10 + index * (WINDOW_TICKS + 20);
    const closedTick = openedTick + WINDOW_TICKS;
    for (const event of [
      stopApproach(openedTick, index),
      stopOutcome(closedTick, index, isStopped),
    ])
      registry.observe({
        tick: event.tick,
        sessionId: HABIT_FIXTURE_SESSION_ID,
        worldEpoch: HABIT_FIXTURE_WORLD_EPOCH,
        segmentId,
        learningEligible: true,
        vehicleId: HABIT_FIXTURE_VEHICLE_ID,
        incarnation: HABIT_FIXTURE_INCARNATION,
        signal: null,
        events: [event],
        stimuli: [],
        conclusions: [],
      });
  }
  const opportunities: readonly OpportunityRecord[] = registry.getOpportunities();
  const denominators: OpportunityDenominators = registry.getDenominators();

  const eligibility = createEligibilityWindows();
  const windows = new Map<string, EligibilityWindowRecord>();
  for (const opportunity of opportunities) {
    for (let tick = opportunity.openedTick; tick <= opportunity.lastTick; tick += 10) {
      const record = eligibility.observe({
        tick,
        sessionId: HABIT_FIXTURE_SESSION_ID,
        worldEpoch: HABIT_FIXTURE_WORLD_EPOCH,
        opportunityId: opportunity.id,
        kind: opportunity.kind,
        vehicleId: HABIT_FIXTURE_VEHICLE_ID,
        incarnation: HABIT_FIXTURE_INCARNATION,
        segmentId,
        classId: 'sedan',
        controlMode: 'LEARNING',
        learningEligible: true,
        suspension: 'NONE',
        visibility: { source: 'CONTROLLED_FIXTURE', observable: true },
        leader: null,
        signal: null,
        greenExit: null,
        mechanical: null,
        impact: null,
      });
      windows.set(opportunity.id, record);
    }
  }

  const filter = createArtifactFilter();
  const artifactWindow: FilteredWindowRecord = filter.evaluate({
    tick: summary.endTick ?? summary.startTick,
    sessionId: HABIT_FIXTURE_SESSION_ID,
    worldEpoch: HABIT_FIXTURE_WORLD_EPOCH,
    segmentId,
    vehicleId: HABIT_FIXTURE_VEHICLE_ID,
    incarnation: HABIT_FIXTURE_INCARNATION,
    controlMode: 'LEARNING',
    learningEligible: true,
    startTick: summary.startTick,
    endTick: summary.endTick,
    segmentCompleteness: 'CLOSED',
    closeReason: 'RIDE_COMPLETED',
    lostCheckpointTick: null,
    observationLoss: null,
    collisions: [],
    recoveries: [],
    suspensions: [],
  });

  const boundWindow = (window: EligibilityWindowRecord): FilteredWindowRecord =>
    Object.freeze({ ...artifactWindow, windowId: window.windowId });

  const ledger = createParameterEvidenceLedger();
  const observations = opportunities.map((opportunity, index) => {
    const window = windows.get(opportunity.id);
    if (window === undefined) throw new Error('087 did not classify the opportunity');
    const artifacts = boundWindow(window);
    const isStopped = index < stopped;
    ledger.observe({
      eligibility: window,
      opportunity,
      artifacts,
      roadType: 'urban',
      stopOutcome: isStopped ? 'STOPPED' : 'CROSSED_WITHOUT_STOP',
    });
    return Object.freeze({
      eligibility: window,
      opportunity,
      artifacts,
      stopCause: 'STOP_LINE' as const,
      ...(isStopped ? { fullStop: true, dwellTicks: 120 } : { rollingStop: true }),
    });
  });

  const reads: readonly ParameterEvidenceReadModel[] = ledger.readAll();
  const stopResult = estimateStopYieldParameters(reads, denominators, observations);
  const candidate = stopResult.candidates[HABIT_FIXTURE_KEY];
  const evidence: ParameterEvidenceReadModel = ledger.read(HABIT_FIXTURE_KEY);
  const episodes: readonly ProfileBlendEpisode[] = Object.freeze(
    opportunities.map((opportunity) => {
      const window = windows.get(opportunity.id);
      if (window === undefined) throw new Error('087 did not classify the opportunity');
      return Object.freeze({
        opportunityId: opportunity.id,
        occurrence: opportunity.occurrence,
        observedTicks: Math.max(0, window.lastTick - window.openedTick),
        ageSeconds: 0,
        ...(candidate.value === null ? {} : { value: candidate.value }),
      });
    }),
  );

  const segment: ProfileLearningSegment = Object.freeze({
    segmentId,
    mode: 'LEARNING',
    eligible: true,
    order: options.order,
    key: HABIT_FIXTURE_KEY,
    baseValue: options.baseValue,
    evidence,
    episodes,
    candidate,
    reason: `demonstrație 123 ${segmentId}: ${stopped} opriri complete, ${crossed} treceri`,
  });

  const facts: HabitEvidenceFacts = Object.freeze({
    samples: summary.sampleCount,
    opportunities: opportunities.length,
    fullStops: stopped,
    crossings: crossed,
    ledgerStatus: evidence.status,
    distinctEpisodes: evidence.distinctEpisodes,
    candidateStatus: candidate.status,
    candidateValue: candidate.value,
    candidateReason: candidate.reason,
    certainStopDenominator: stopResult.certainStopDenominator,
  });

  recorder.dispose();
  eligibility.dispose();
  filter.dispose();
  registry.dispose();

  return Object.freeze({ segment, facts });
}

export interface HabitDemonstration {
  readonly segmentId: string;
  readonly pipeline: ProfilePipelineResult;
  readonly evidence: HabitEvidenceFacts;
  /** Value of the demonstrated key after the 110 activation was applied. */
  readonly value: number;
  readonly appliedTick: number | null;
  readonly updatedVehicles: number;
}

export interface HabitWorld {
  readonly store: ProfileStore;
  readonly registry: FleetRegistry;
  readonly activation: ProfileActivation;
  readonly pipeline: ProfilePipeline;
  readonly clock: { value: number };
  readonly profileId: string;
  readonly engineVersion: string;
  readonly baseVersionId: string;
  readonly queueResults: readonly MissionDemoQueueResult[];
  /** Runs one real demonstration against the current head value and applies the 110 activation. */
  demonstrate(input: {
    readonly segmentId: string;
    readonly stopped: number;
    readonly crossed: number;
  }): Promise<HabitDemonstration>;
  /** The current 109 chain, exactly as the mission consumes it. */
  history(): readonly unknown[];
  /** Evaluates the habit objective over the current chain. */
  evaluate(): HabitMissionResult;
  dispose(): void;
}

function configuration(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: HABIT_FIXTURE_SESSION_ID,
    worldEpoch: HABIT_FIXTURE_WORLD_EPOCH,
    scenarioId: 'mission-123-habit',
    seed: 123_000,
    namespace: 'city:123:habit',
    taxiCount: DEFAULT_FLEET_COUNTS.taxis,
    civilianCount: DEFAULT_FLEET_COUNTS.civilians,
    profile: { profileId: HABIT_FIXTURE_PROFILE_ID, versionId: HABIT_FIXTURE_BASE_VERSION },
  };
}

/** One isolated habit world: real 109 store, real 057 registry, real 110 activation, real 112 pipeline. */
export function createHabitWorld(): HabitWorld {
  const clock = { value: 0 };
  const store = createCandidateProfileStore({
    engineVersion: HABIT_FIXTURE_ENGINE_VERSION,
    now: () => HABIT_FIXTURE_NOW,
  });
  const base = store.createBase({
    profileId: HABIT_FIXTURE_PROFILE_ID,
    versionId: HABIT_FIXTURE_BASE_VERSION,
    parameters: habitBaseParameters(),
    createdAt: HABIT_FIXTURE_NOW,
  });
  if (base.status !== 'ACCEPTED') throw new Error('109 rejected the habit base version');
  const source = createProfileActivationSource({
    profileId: HABIT_FIXTURE_PROFILE_ID,
    versionId: HABIT_FIXTURE_BASE_VERSION,
  });
  const registry = createFleetRegistry(configuration(), { profileSource: source });
  const activation = createProfileActivation({
    registry,
    source,
    engineVersion: HABIT_FIXTURE_ENGINE_VERSION,
    clock: () => clock.value,
    now: () => HABIT_FIXTURE_NOW,
  });
  const queue = createDemoQueue(HABIT_FIXTURE_ENGINE_VERSION);
  const pipeline = createProfilePipeline({
    engineVersion: HABIT_FIXTURE_ENGINE_VERSION,
    playerId: HABIT_FIXTURE_PLAYER_ID,
    profileId: HABIT_FIXTURE_PROFILE_ID,
    learningEpoch: 1,
    sessionId: HABIT_FIXTURE_SESSION_ID,
    worldEpoch: HABIT_FIXTURE_WORLD_EPOCH,
    queue: queue.queue,
    store,
    activation,
    tick: () => clock.value,
    advanceTick: () => {
      clock.value += 1;
      return clock.value;
    },
  });

  function headValue(): number {
    const head = store.getHistory(HABIT_FIXTURE_PROFILE_ID).at(-1);
    if (head === undefined) throw new Error('109 has no habit head version');
    return head.parameters[HABIT_FIXTURE_KEY]!;
  }

  return {
    store,
    registry,
    activation,
    pipeline,
    clock,
    profileId: HABIT_FIXTURE_PROFILE_ID,
    engineVersion: HABIT_FIXTURE_ENGINE_VERSION,
    baseVersionId: HABIT_FIXTURE_BASE_VERSION,
    get queueResults(): readonly MissionDemoQueueResult[] {
      return queue.results();
    },
    async demonstrate(input): Promise<HabitDemonstration> {
      const baseValue = headValue();
      const evidence = buildHabitEvidence({
        segmentId: input.segmentId,
        order: store.getHistory(HABIT_FIXTURE_PROFILE_ID).length,
        stopped: input.stopped,
        crossed: input.crossed,
        baseValue,
      });
      const pipelineResult = await pipeline.onSegmentClosed(evidence.segment);
      let appliedTick: number | null = null;
      let updatedVehicles = 0;
      const published = pipelineResult.activation;
      if (published !== null && published.activateAtTick !== null) {
        while (clock.value < published.activateAtTick) clock.value += 1;
        const step = pipeline.advance();
        if (step !== null && step.status === 'APPLIED' && step.appliedTick !== null) {
          appliedTick = step.appliedTick;
          updatedVehicles = step.updated;
        }
      }
      return Object.freeze({
        segmentId: input.segmentId,
        pipeline: pipelineResult,
        evidence: evidence.facts,
        value: headValue(),
        appliedTick,
        updatedVehicles,
      });
    },
    history(): readonly unknown[] {
      return store.getHistory(HABIT_FIXTURE_PROFILE_ID);
    },
    evaluate(): HabitMissionResult {
      return evaluateHabitMission({
        profileId: HABIT_FIXTURE_PROFILE_ID,
        key: HABIT_FIXTURE_KEY,
        history: store.getHistory(HABIT_FIXTURE_PROFILE_ID),
      });
    },
    dispose(): void {
      pipeline.dispose();
      activation.dispose();
      registry.dispose();
      store.dispose();
      queue.dispose();
    },
  };
}

/** The shipped rule, so a report cannot quote a threshold the module does not use. */
export const HABIT_FIXTURE_POLICY = HABIT_POLICY;

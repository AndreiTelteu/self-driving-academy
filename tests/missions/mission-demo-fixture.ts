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
import {
  createParameterEvidenceLedger,
  estimateSignalParameters,
  estimateStopYieldParameters,
} from '../../src/learning';
import type { ParameterEvidenceReadModel, ProfileBlendEpisode } from '../../src/learning';
import type { LearningJob } from '../../src/learning';
import { parseSimulationEvent } from '../../src/simulation';
import { parseVehicleCommand, parseVehicleState } from '../../src/vehicles';
import type { ProfileLearningSegment } from '../../src/app';
import type { MissionDemoQueueHandle, MissionDemoQueueResult } from '../../src/app';
import { createLearningQueueHarness } from '../harness/learning-queue-harness';

/**
 * The 118 evidence fixture.
 *
 * One closed 069 LEARNING segment is recorded by the real 085 tick-sample recorder, produces real
 * 086 STOP opportunities, is classified by the real 087 eligibility windows and filtered by the
 * real 088 artefact filter. The same facts feed the real 093 evidence ledger and the real 097/098
 * estimators, so the read model, the candidate and the episodes cannot drift apart.
 *
 * The 087 window identity (`eligibility-entry:*`) and the 088 window identity (`telemetry-window:*`)
 * are produced by two different id schemes in the current contracts, while the 093/098 contracts
 * require one window identity on both records. The fixture therefore binds the real 088 window to
 * the real 087 window of the same opportunity; no value, opportunity, tick or estimate is invented.
 */
export const DEMO_SESSION_ID = 'session-118-fixture';
export const DEMO_WORLD_EPOCH = 1;
export const DEMO_VEHICLE_ID = 'taxi-118-demo';
export const DEMO_INCARNATION = 'taxi-118-demo:0';
export const DEMO_SEGMENT_ID = 'segment-118-demo';
export const DEMO_PROFILE_ID = 'city-profile-118';
export const DEMO_BASE_VERSION_ID = 'city-profile-118-base';
export const DEMO_LEARNING_EPOCH = 1;
export const DEMO_LEARNING_KEY = 'stop_full_probability';
export const DEMO_BASE_VALUE = 0.6;
export const DEMO_STOP_CYCLES = 4;
export const DEMO_WINDOW_TICKS = 40;
export const DEMO_SAMPLE_TICKS = 300;
export const DEMO_STOP_LINE_ID = 'stop-line-118';

export interface DemoEvidenceFacts {
  readonly samples: number;
  readonly opportunities: number;
  readonly eligibleWindows: number;
  readonly artifactWindows: number;
  readonly artifactClass: string;
  readonly ledgerStatus: string;
  readonly distinctEpisodes: number;
  readonly stopCandidateStatus: string;
  readonly stopCandidateValue: number | null;
  readonly stopCandidateReason: string | null;
  readonly stopCandidateEpisodes: number;
  readonly signalCandidateStatus: string;
  readonly signalCandidateReason: string | null;
  readonly certainStopDenominator: number;
  readonly denominatorsTotal: number;
}

export interface DemoEvidence {
  readonly segment: ProfileLearningSegment;
  readonly opportunityIds: readonly string[];
  readonly facts: DemoEvidenceFacts;
}

const world = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: DEMO_SESSION_ID,
  worldEpoch: DEMO_WORLD_EPOCH,
});

function vehicleFrame(tick: number) {
  return {
    tick,
    state: parseVehicleState({
      ...world,
      vehicleId: DEMO_VEHICLE_ID,
      classId: 'sedan' as const,
      tick,
      transform: {
        positionM: { x: tick, y: 0, z: 0 },
        rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
      },
      velocityMps: { x: 0, y: 0, z: 5 },
      laneId: 'lane-118',
      controlMode: 'LEARNING' as const,
      appliedProfileVersion: DEMO_BASE_VERSION_ID,
      maneuverState: 'IDLE' as const,
    }),
    raw: { throttle: 0.4, brake: 0, steering: 0, handbrake: false },
    command: parseVehicleCommand({
      ...world,
      vehicleId: DEMO_VEHICLE_ID,
      tick,
      throttle: 0.4,
      brake: 0,
      steering: 0,
      handbrake: false,
      turnSignal: 'OFF' as const,
      source: 'PLAYER' as const,
    }),
    physics: { longitudinalAccelerationMps2: 0, lateralAccelerationMps2: 0 },
    lane: { laneId: 'lane-118', speedLimitMps: 13 },
    signal: null,
  };
}

function stopEvent(
  type: 'STOP_APPROACH' | 'FULL_STOP',
  tick: number,
  index: number,
  durationS: number,
) {
  return parseSimulationEvent({
    ...world,
    tick,
    entityIds: [DEMO_VEHICLE_ID],
    eventId: `118:${type}:${index}`,
    type,
    payload: {
      vehicleId: DEMO_VEHICLE_ID,
      opportunityId: '118:stop-source',
      ...(type === 'STOP_APPROACH' ? { stopLineId: DEMO_STOP_LINE_ID } : { durationS }),
    },
  });
}

/**
 * Records one closed 069 LEARNING segment and derives the real evidence of the demonstrated key.
 *
 * `stopCycles` is the number of real 086 STOP opportunities; `0` produces a segment without any
 * eligible evidence, which is the no-change route of the mission.
 */
export function buildDemoEvidence(
  options: {
    readonly stopCycles?: number;
    readonly segmentId?: string;
    readonly order?: number;
    readonly interventionId?: string;
  } = {},
): DemoEvidence {
  const stopCycles = options.stopCycles ?? DEMO_STOP_CYCLES;
  const segmentId = options.segmentId ?? DEMO_SEGMENT_ID;

  // 085: the closed LEARNING segment and its real samples.
  const recorder = createTickSampleRecorder();
  recorder.openSegment({
    segmentId,
    sessionId: DEMO_SESSION_ID,
    worldEpoch: DEMO_WORLD_EPOCH,
    vehicleId: DEMO_VEHICLE_ID,
    classId: 'sedan',
    controlMode: 'LEARNING',
    profileId: DEMO_PROFILE_ID,
    baseVersionId: DEMO_BASE_VERSION_ID,
    learningEpoch: DEMO_LEARNING_EPOCH,
    learningEligible: true,
    inputType: 'KEYBOARD',
    startTick: 1,
  });
  for (let tick = 1; tick <= DEMO_SAMPLE_TICKS; tick += 1) recorder.record(vehicleFrame(tick));
  recorder.closeSegment('RIDE_COMPLETED');
  const summary = recorder.getSegment(segmentId);
  if (summary === null) throw new Error('085 did not retain the demonstration segment');

  // 086: real STOP opportunities, each opened and resolved by real events.
  const registry = createOpportunityRegistry();
  for (let index = 0; index < stopCycles; index += 1) {
    const openedTick = 10 + index * (DEMO_WINDOW_TICKS + 20);
    const closedTick = openedTick + DEMO_WINDOW_TICKS;
    registry.observe({
      tick: openedTick,
      sessionId: DEMO_SESSION_ID,
      worldEpoch: DEMO_WORLD_EPOCH,
      segmentId,
      learningEligible: true,
      vehicleId: DEMO_VEHICLE_ID,
      incarnation: DEMO_INCARNATION,
      signal: null,
      events: [stopEvent('STOP_APPROACH', openedTick, index, 0)],
      stimuli: [],
      conclusions: [],
    });
    registry.observe({
      tick: closedTick,
      sessionId: DEMO_SESSION_ID,
      worldEpoch: DEMO_WORLD_EPOCH,
      segmentId,
      learningEligible: true,
      vehicleId: DEMO_VEHICLE_ID,
      incarnation: DEMO_INCARNATION,
      signal: null,
      events: [stopEvent('FULL_STOP', closedTick, index, 2)],
      stimuli: [],
      conclusions: [],
    });
  }
  const opportunities: readonly OpportunityRecord[] = registry.getOpportunities();
  const denominators: OpportunityDenominators = registry.getDenominators();

  // 087: the real classification of every opportunity window.
  const eligibility = createEligibilityWindows();
  const windows = new Map<string, EligibilityWindowRecord>();
  for (const opportunity of opportunities) {
    for (let tick = opportunity.openedTick; tick <= opportunity.lastTick; tick += 10) {
      const record = eligibility.observe({
        tick,
        sessionId: DEMO_SESSION_ID,
        worldEpoch: DEMO_WORLD_EPOCH,
        opportunityId: opportunity.id,
        kind: opportunity.kind,
        vehicleId: DEMO_VEHICLE_ID,
        incarnation: DEMO_INCARNATION,
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

  // 088: the real artefact window of the closed segment.
  const filter = createArtifactFilter();
  const artifactWindow: FilteredWindowRecord = filter.evaluate({
    tick: summary.endTick ?? summary.startTick,
    sessionId: DEMO_SESSION_ID,
    worldEpoch: DEMO_WORLD_EPOCH,
    segmentId,
    vehicleId: DEMO_VEHICLE_ID,
    incarnation: DEMO_INCARNATION,
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

  // The 093/098 contracts require one window identity on both records.
  const boundWindow = (window: EligibilityWindowRecord): FilteredWindowRecord =>
    Object.freeze({ ...artifactWindow, windowId: window.windowId });

  const ledger = createParameterEvidenceLedger();
  const stopObservations = opportunities.map((opportunity) => {
    const window = windows.get(opportunity.id);
    if (window === undefined) throw new Error('087 did not classify the opportunity');
    const artifacts = boundWindow(window);
    ledger.observe({
      eligibility: window,
      opportunity,
      artifacts,
      roadType: 'urban',
      stopOutcome: 'STOPPED',
    });
    return Object.freeze({
      eligibility: window,
      opportunity,
      artifacts,
      stopCause: 'STOP_LINE' as const,
      fullStop: true,
      rollingStop: false,
      dwellTicks: 120,
    });
  });

  const reads: readonly ParameterEvidenceReadModel[] = ledger.readAll();
  const stopResult = estimateStopYieldParameters(reads, denominators, stopObservations);
  const signalResult = estimateSignalParameters(reads, denominators, []);
  const stopCandidate = stopResult.candidates[DEMO_LEARNING_KEY];
  const evidence: ParameterEvidenceReadModel = ledger.read(DEMO_LEARNING_KEY);

  const episodes: readonly ProfileBlendEpisode[] = Object.freeze(
    opportunities.map((opportunity) => {
      const window = windows.get(opportunity.id);
      if (window === undefined) throw new Error('087 did not classify the opportunity');
      return Object.freeze({
        opportunityId: opportunity.id,
        occurrence: opportunity.occurrence,
        observedTicks: Math.max(0, window.lastTick - window.openedTick),
        ageSeconds: 0,
        ...(stopCandidate.value === null ? {} : { value: stopCandidate.value }),
      });
    }),
  );

  const segment: ProfileLearningSegment = Object.freeze({
    segmentId,
    mode: 'LEARNING',
    eligible: true,
    order: options.order ?? 1,
    key: DEMO_LEARNING_KEY,
    baseValue: DEMO_BASE_VALUE,
    evidence,
    episodes,
    candidate: stopCandidate,
    ...(options.interventionId === undefined ? {} : { interventionId: options.interventionId }),
    reason: 'segment LEARNING 118 închis cu dovezi eligibile',
  });

  const facts: DemoEvidenceFacts = Object.freeze({
    samples: summary.sampleCount,
    opportunities: opportunities.length,
    eligibleWindows: windows.size,
    artifactWindows: 1,
    artifactClass: artifactWindow.windowClass,
    ledgerStatus: evidence.status,
    distinctEpisodes: evidence.distinctEpisodes,
    stopCandidateStatus: stopCandidate.status,
    stopCandidateValue: stopCandidate.value,
    stopCandidateReason: stopCandidate.reason,
    stopCandidateEpisodes: stopCandidate.sourceEpisodeCount,
    signalCandidateStatus: signalResult.candidates.red_stop_probability.status,
    signalCandidateReason: signalResult.candidates.red_stop_probability.reason,
    certainStopDenominator: stopResult.certainStopDenominator,
    denominatorsTotal: denominators.total,
  });

  recorder.dispose();
  eligibility.dispose();
  filter.dispose();
  registry.dispose();

  return Object.freeze({
    segment,
    opportunityIds: Object.freeze(opportunities.map((opportunity) => opportunity.id)),
    facts,
  });
}

/** The observed real 103 queue used by the 112 pipeline of the demonstration. */
export function createDemoQueue(engineVersion: string): MissionDemoQueueHandle & {
  dispose(): void;
} {
  const harness = createLearningQueueHarness({ engineVersion });
  const results: MissionDemoQueueResult[] = [];
  return Object.freeze({
    queue: {
      submit(value: unknown) {
        const admission = harness.queue.submit(value);
        if (admission.ticket !== null) {
          const job = value as LearningJob;
          void admission.ticket.outcome.then((outcome) => {
            results.push(Object.freeze({ job, outcome }));
          });
        }
        return admission;
      },
    },
    results: (): readonly MissionDemoQueueResult[] => Object.freeze([...results]),
    dispose: (): void => harness.dispose(),
  });
}

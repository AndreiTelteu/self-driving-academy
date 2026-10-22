import {
  estimateSignalParameters,
  estimateStopYieldParameters,
  createParameterEvidenceLedger,
} from '../../src/learning';
import type {
  ParameterEvidenceReadModel,
  SignalEstimatorResult,
  StopYieldEstimatorResult,
} from '../../src/learning';
import { parseSimulationEvent } from '../../src/simulation';
import {
  createArtifactFilter,
  createEligibilityWindows,
  createOpportunityRegistry,
} from '../../src/telemetry';
import type {
  EligibilityWindowRecord,
  FilteredWindowRecord,
  OpportunityDenominators,
  OpportunityKindDenominator,
  OpportunityRecord,
} from '../../src/telemetry';
import { SIGNALS_MISSION_ID, evaluateSignalMission } from '../../src/missions';
import type {
  SignalEpisodeInput,
  SignalLearningFacts,
  SignalMissionResult,
  StopLearningFacts,
} from '../../src/missions';

/**
 * 120 mission fixture.
 *
 * The fixture authors the *scenario* (which signal is red, which stop line is approached, whether
 * the driver stopped and for how long) and then lets the real modules decide every fact:
 *
 * - 086 opens and resolves the STOP/RED/GREEN opportunities from real `STOP_APPROACH`,
 *   `FULL_STOP`, `STOP_LINE_CROSSED` events and the real signal phase occurrence;
 * - 087 classifies each opportunity with the real signal/leader/green-exit facts and opens the real
 *   reaction window, which `respond` accepts only for `FREE_TRAFFIC`;
 * - 088 produces the real artefact window of the closed segment;
 * - 093 records the real evidence of the same episodes;
 * - 097/098 derive the real candidates from those episodes and the real 086 denominators.
 *
 * The mission then reads those facts and the real candidates. It never recomputes the estimator and
 * never invents a violation: a traffic-induced stop is a 086 `FAILURE` of a *constrained* window and
 * a blocked green is an `EXTERNAL_CONSTRAINT`, so neither is a stop-line/red violation.
 */
export const SIGNALS_SESSION_ID = 'session-120-signals';
export const SIGNALS_WORLD_EPOCH = 1;
export const SIGNALS_VEHICLE_ID = 'taxi:120';
export const SIGNALS_INCARNATION = 'taxi:120:1';
export const SIGNALS_SEGMENT_ID = 'segment:120-signals';

const SIGNAL_ID = 'signal:120';
const INTERSECTION_ID = 'intersection:120';
const MOVEMENT_ID = 'movement:120';
const PHASE_ID = 'phase:120';
const STOP_LINE_ID = 'stop-line:120';
const LEADER_ID = 'leader:120-queue';

/** 2 s at 60 Hz: above the 1.5 s objective minimum. */
export const SIGNALS_FULL_STOP_DWELL_S = 2;
/** 0.5 s: a full stop that does not satisfy the 1.5 s objective. */
export const SIGNALS_SHORT_STOP_DWELL_S = 0.5;

export type SignalPlanEpisode =
  | {
      readonly kind: 'STOP_LINE';
      readonly decision: 'FULL' | 'CROSS';
      /** Authored dwell of a FULL stop; it is carried by the real `FULL_STOP` event. */
      readonly dwellS?: number;
    }
  | { readonly kind: 'TRAFFIC_STOP' }
  | { readonly kind: 'RED'; readonly decision: 'HELD' | 'CROSS' }
  | { readonly kind: 'GREEN'; readonly decision: 'FREE' | 'BLOCKED' };

export interface SignalReactionProjection {
  readonly accepted: boolean;
  readonly reason:
    | 'RESPONSE'
    | 'NOT_OBSERVABLE'
    | 'EXTERNAL_CONSTRAINT'
    | 'SEGMENT_EXCLUDED'
    | 'NO_WINDOW'
    | 'ALREADY_RESPONDED';
  readonly durationSeconds: number | null;
}

export interface SignalRunFacts {
  readonly opportunities: readonly OpportunityRecord[];
  readonly windows: ReadonlyMap<string, EligibilityWindowRecord>;
  readonly artifacts: FilteredWindowRecord;
  readonly denominators: OpportunityDenominators;
  readonly evidence: readonly ParameterEvidenceReadModel[];
  readonly signalResult: SignalEstimatorResult;
  readonly stopResult: StopYieldEstimatorResult;
  readonly reactions: ReadonlyMap<string, SignalReactionProjection>;
  readonly redDenominator: OpportunityKindDenominator;
  readonly stopDenominator: OpportunityKindDenominator;
}

export interface SignalRun {
  readonly plan: readonly SignalPlanEpisode[];
  readonly facts: SignalRunFacts;
  readonly input: unknown;
  readonly result: SignalMissionResult;
}

function context(tick: number) {
  return {
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId: SIGNALS_SESSION_ID,
    worldEpoch: SIGNALS_WORLD_EPOCH,
    tick,
  };
}

function signalContext(state: 'RED' | 'GREEN', phaseStartedTick: number) {
  return {
    signalId: SIGNAL_ID,
    intersectionId: INTERSECTION_ID,
    phaseId: PHASE_ID,
    movementId: MOVEMENT_ID,
    state,
    phaseStartedTick,
  };
}

/** The 087 signal fact has its own narrower shape; phase start is not part of it. */
function eligibilitySignal(state: 'RED' | 'GREEN') {
  return Object.freeze({
    signalId: SIGNAL_ID,
    intersectionId: INTERSECTION_ID,
    movementId: MOVEMENT_ID,
    state,
  });
}

function stopEvent(
  type: 'STOP_APPROACH' | 'FULL_STOP' | 'STOP_LINE_CROSSED',
  tick: number,
  index: number,
  durationS: number | null,
) {
  return parseSimulationEvent({
    ...context(tick),
    entityIds: [SIGNALS_VEHICLE_ID],
    eventId: `${SIGNALS_SESSION_ID}:${type}:${index}`,
    type,
    payload:
      type === 'FULL_STOP'
        ? {
            vehicleId: SIGNALS_VEHICLE_ID,
            opportunityId: `${SIGNALS_SESSION_ID}:stop:${index}`,
            durationS: durationS ?? SIGNALS_FULL_STOP_DWELL_S,
          }
        : {
            vehicleId: SIGNALS_VEHICLE_ID,
            opportunityId: `${SIGNALS_SESSION_ID}:stop:${index}`,
            stopLineId: STOP_LINE_ID,
          },
  });
}

function observe(
  registry: ReturnType<typeof createOpportunityRegistry>,
  tick: number,
  signal: ReturnType<typeof signalContext> | null,
  events: readonly ReturnType<typeof parseSimulationEvent>[] = [],
) {
  return registry.observe({
    tick,
    sessionId: SIGNALS_SESSION_ID,
    worldEpoch: SIGNALS_WORLD_EPOCH,
    segmentId: SIGNALS_SEGMENT_ID,
    learningEligible: true,
    vehicleId: SIGNALS_VEHICLE_ID,
    incarnation: SIGNALS_INCARNATION,
    signal,
    events,
    stimuli: [],
    conclusions: [],
  });
}

/** The authored dwell of one plan episode, carried into the real FULL_STOP event. */
export function planFullStopDwellS(episode: SignalPlanEpisode): number | null {
  return episode.kind === 'STOP_LINE' && episode.decision === 'FULL'
    ? (episode.dwellS ?? SIGNALS_FULL_STOP_DWELL_S)
    : null;
}

const dwellTicksOf = (episode: SignalPlanEpisode): number | null => {
  const dwellS = planFullStopDwellS(episode);
  return dwellS === null ? null : Math.round(dwellS * 60);
};

/**
 * Builds one mission run. The plan is the authored scenario; every recorded fact comes from the real
 * registry, classifier, filter, ledger and estimators.
 */
export function buildSignalRun(plan: readonly SignalPlanEpisode[]): SignalRun {
  const registry = createOpportunityRegistry();
  const opportunities: OpportunityRecord[] = [];
  try {
    for (const [position, episode] of plan.entries()) {
      const index = position + 1;
      const openedTick = index * 100;
      const resolvedTick = openedTick + 10;
      if (episode.kind === 'STOP_LINE' || episode.kind === 'TRAFFIC_STOP') {
        observe(registry, openedTick, null, [stopEvent('STOP_APPROACH', openedTick, index, null)]);
        const dwellS = planFullStopDwellS(episode);
        const event =
          dwellS !== null
            ? stopEvent('FULL_STOP', resolvedTick, index, dwellS)
            : stopEvent('STOP_LINE_CROSSED', resolvedTick, index, null);
        const touched = observe(registry, resolvedTick, null, [event]);
        const record = touched.find((entry) => entry.state === 'RESOLVED');
        if (record === undefined) throw new Error(`086 did not resolve the STOP at ${openedTick}`);
        opportunities.push(record);
      } else {
        const state = episode.kind === 'RED' ? 'RED' : 'GREEN';
        const opened = observe(registry, openedTick, signalContext(state, openedTick));
        const record = opened.find((entry) => entry.state === 'ENTERED');
        if (record === undefined) throw new Error(`086 did not open the ${state} phase`);
        const outcome =
          episode.kind === 'RED'
            ? episode.decision === 'HELD'
              ? 'HELD'
              : 'CROSSED'
            : episode.decision === 'FREE'
              ? 'RELEASED'
              : 'MISSED';
        opportunities.push(
          registry.conclude({ tick: resolvedTick, opportunityId: record.id, outcome }),
        );
      }
    }

    const eligibility = createEligibilityWindows();
    const windows = new Map<string, EligibilityWindowRecord>();
    const reactions = new Map<string, SignalReactionProjection>();
    for (const [position, opportunity] of opportunities.entries()) {
      const episode = plan[position]!;
      const tick = opportunity.resolvedTick ?? opportunity.lastTick;
      const window = eligibility.observe({
        tick,
        sessionId: SIGNALS_SESSION_ID,
        worldEpoch: SIGNALS_WORLD_EPOCH,
        opportunityId: opportunity.id,
        kind: opportunity.kind,
        vehicleId: SIGNALS_VEHICLE_ID,
        incarnation: SIGNALS_INCARNATION,
        segmentId: SIGNALS_SEGMENT_ID,
        classId: 'sedan',
        controlMode: 'LEARNING',
        learningEligible: true,
        suspension: 'NONE',
        visibility: { source: 'CONTROLLED_FIXTURE', observable: true },
        leader:
          episode.kind === 'TRAFFIC_STOP'
            ? Object.freeze({ id: LEADER_ID, gapM: 8, speedMps: 0 })
            : null,
        signal:
          episode.kind === 'RED'
            ? eligibilitySignal('RED')
            : episode.kind === 'GREEN'
              ? eligibilitySignal('GREEN')
              : null,
        greenExit:
          episode.kind === 'GREEN' && episode.decision === 'BLOCKED'
            ? Object.freeze({ blocked: true, source: 'FOLLOWING_QUEUE' as const })
            : null,
        mechanical: null,
        impact: null,
      });
      windows.set(opportunity.id, window);
      const response = eligibility.respond({ tick: tick + 5, opportunityId: opportunity.id });
      reactions.set(
        opportunity.id,
        Object.freeze({
          accepted: response.accepted,
          reason: response.reason,
          durationSeconds: response.durationSeconds,
        }),
      );
    }

    const filter = createArtifactFilter();
    const lastTick = opportunities[opportunities.length - 1]!.resolvedTick ?? 0;
    const artifacts = filter.evaluate({
      tick: lastTick,
      sessionId: SIGNALS_SESSION_ID,
      worldEpoch: SIGNALS_WORLD_EPOCH,
      segmentId: SIGNALS_SEGMENT_ID,
      vehicleId: SIGNALS_VEHICLE_ID,
      incarnation: SIGNALS_INCARNATION,
      controlMode: 'LEARNING',
      learningEligible: true,
      startTick: 1,
      endTick: lastTick,
      segmentCompleteness: 'CLOSED',
      closeReason: 'RIDE_COMPLETED',
      lostCheckpointTick: null,
      observationLoss: null,
      collisions: [],
      recoveries: [],
      suspensions: [],
    });
    if (artifacts.windowClass !== 'PREFIX_ELIGIBLE' || artifacts.prefix === null)
      throw new Error('088 did not retain a usable prefix for the signals segment');

    const bound = (window: EligibilityWindowRecord): FilteredWindowRecord =>
      Object.freeze({ ...artifacts, windowId: window.windowId });

    const ledger = createParameterEvidenceLedger();
    const stopObservations: Parameters<typeof estimateStopYieldParameters>[2][number][] = [];
    const signalObservations: Parameters<typeof estimateSignalParameters>[2][number][] = [];
    const episodeInputs: SignalEpisodeInput[] = [];
    for (const [position, opportunity] of opportunities.entries()) {
      const episode = plan[position]!;
      const window = windows.get(opportunity.id);
      if (window === undefined) throw new Error('087 did not classify the opportunity');
      const reaction = reactions.get(opportunity.id);
      if (reaction === undefined) throw new Error('087 did not answer the opportunity');
      const boundArtifacts = bound(window);
      const dwellTicks = dwellTicksOf(episode);
      const stopCause =
        episode.kind === 'STOP_LINE'
          ? ('STOP_LINE' as const)
          : episode.kind === 'TRAFFIC_STOP'
            ? ('LEADER' as const)
            : null;
      const fullStop = episode.kind === 'STOP_LINE' && episode.decision === 'FULL';
      const rollingStop = episode.kind === 'STOP_LINE' && episode.decision === 'CROSS';
      const stopOutcome =
        episode.kind === 'STOP_LINE'
          ? episode.decision === 'FULL'
            ? ('STOPPED' as const)
            : ('CROSSED_WITHOUT_STOP' as const)
          : episode.kind === 'RED'
            ? episode.decision === 'HELD'
              ? ('HELD' as const)
              : ('CROSSED' as const)
            : undefined;

      ledger.observe({
        eligibility: window,
        opportunity,
        artifacts: boundArtifacts,
        roadType: 'urban',
        ...(stopOutcome === undefined ? {} : { stopOutcome }),
        ...(episode.kind === 'GREEN' && episode.decision === 'FREE'
          ? { greenStartDelayS: 0.5 }
          : {}),
      });
      episodeInputs.push(
        Object.freeze({
          opportunity,
          eligibilityWindow: window,
          stopCause,
          fullStop: episode.kind === 'STOP_LINE' ? fullStop : null,
          rollingStop: episode.kind === 'STOP_LINE' ? rollingStop : null,
          dwellTicks,
          reaction,
        }),
      );
      signalObservations.push(
        Object.freeze({
          eligibility: window,
          opportunity,
          artifacts: boundArtifacts,
          ...(episode.kind === 'GREEN' && episode.decision === 'FREE'
            ? {
                greenOnsetTick: window.openedTick,
                departureTick: window.openedTick + 30,
              }
            : {}),
        }),
      );
      if (episode.kind === 'STOP_LINE' || episode.kind === 'TRAFFIC_STOP') {
        stopObservations.push(
          Object.freeze({
            eligibility: window,
            opportunity,
            artifacts: boundArtifacts,
            stopCause: episode.kind === 'STOP_LINE' ? 'STOP_LINE' : 'LEADER',
            ...(episode.kind === 'STOP_LINE'
              ? {
                  fullStop,
                  rollingStop,
                  ...(dwellTicks === null ? {} : { dwellTicks }),
                }
              : {}),
          }),
        );
      }
    }

    const denominators = registry.getDenominators();
    const evidence = ledger.readAll();
    const signalResult = estimateSignalParameters(evidence, denominators, signalObservations);
    const stopResult = estimateStopYieldParameters(evidence, denominators, stopObservations);
    const redDenominator = denominators.byKind.find((row) => row.kind === 'RED')!;
    const stopDenominator = denominators.byKind.find((row) => row.kind === 'STOP')!;
    const facts: SignalRunFacts = Object.freeze({
      opportunities: Object.freeze(opportunities),
      windows,
      artifacts,
      denominators,
      evidence,
      signalResult,
      stopResult,
      reactions,
      redDenominator,
      stopDenominator,
    });

    const signalFacts: SignalLearningFacts = Object.freeze({
      certainRedDenominator: signalResult.certainRedDenominator,
      redStopProbability: Object.freeze({
        status: signalResult.candidates.red_stop_probability.status,
        value: signalResult.candidates.red_stop_probability.value,
        confidence: signalResult.candidates.red_stop_probability.confidence,
        sourceEpisodeCount: signalResult.candidates.red_stop_probability.sourceEpisodeCount,
        reason: signalResult.candidates.red_stop_probability.reason,
      }),
    });
    const stopFacts: StopLearningFacts = Object.freeze({
      certainStopOpportunityDenominator: stopResult.certainStopOpportunityDenominator,
      certainStopDenominator: stopResult.certainStopDenominator,
      stopFullProbability: Object.freeze({
        status: stopResult.candidates.stop_full_probability.status,
        value: stopResult.candidates.stop_full_probability.value,
        confidence: stopResult.candidates.stop_full_probability.confidence,
        sourceEpisodeCount: stopResult.candidates.stop_full_probability.sourceEpisodeCount,
        reason: stopResult.candidates.stop_full_probability.reason,
      }),
    });
    const input = Object.freeze({
      episodes: Object.freeze(episodeInputs),
      signal: signalFacts,
      stop: stopFacts,
    });
    return Object.freeze({
      plan,
      facts,
      input,
      result: evaluateSignalMission(input),
    });
  } finally {
    registry.dispose();
  }
}

/** Three full stops, three held reds, a free green, a blocked green and a traffic stop. */
export const SIGNALS_COMPLIANT_PLAN: readonly SignalPlanEpisode[] = Object.freeze([
  { kind: 'STOP_LINE', decision: 'FULL' },
  { kind: 'RED', decision: 'HELD' },
  { kind: 'STOP_LINE', decision: 'FULL' },
  { kind: 'GREEN', decision: 'BLOCKED' },
  { kind: 'RED', decision: 'HELD' },
  { kind: 'TRAFFIC_STOP' },
  { kind: 'STOP_LINE', decision: 'FULL' },
  { kind: 'RED', decision: 'HELD' },
  { kind: 'GREEN', decision: 'FREE' },
]);

/** One held red, two crossed reds, one full stop and two crossed stop lines. */
export const SIGNALS_VIOLATION_PLAN: readonly SignalPlanEpisode[] = Object.freeze([
  { kind: 'STOP_LINE', decision: 'FULL' },
  { kind: 'RED', decision: 'HELD' },
  { kind: 'STOP_LINE', decision: 'CROSS' },
  { kind: 'GREEN', decision: 'BLOCKED' },
  { kind: 'RED', decision: 'CROSS' },
  { kind: 'TRAFFIC_STOP' },
  { kind: 'STOP_LINE', decision: 'CROSS' },
  { kind: 'RED', decision: 'CROSS' },
  { kind: 'GREEN', decision: 'FREE' },
]);

/** Two full stops, but one dwells only 0.5 s, so the 1.5 s objective is not met. */
export const SIGNALS_SHORT_PLAN: readonly SignalPlanEpisode[] = Object.freeze([
  { kind: 'STOP_LINE', decision: 'FULL' },
  { kind: 'RED', decision: 'HELD' },
  { kind: 'STOP_LINE', decision: 'FULL', dwellS: SIGNALS_SHORT_STOP_DWELL_S },
  { kind: 'RED', decision: 'HELD' },
  { kind: 'RED', decision: 'HELD' },
]);

export { SIGNALS_MISSION_ID };

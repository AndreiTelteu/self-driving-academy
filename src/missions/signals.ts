import { boolean, choice, number, record, requireContract, tick } from '../sessions';
import type {
  EligibilityWindowClass,
  EligibilityWindowRecord,
  OpportunityRecord,
} from '../telemetry';
import { boundedId, plainFields, requireRequired } from './contracts';

/**
 * 120 STOP/red/green mission.
 *
 * The mission consumes real facts only:
 *
 * - the 086 opportunity and its certain `outcome`/`result`;
 * - the 087 eligibility window and its real label/class, plus the real 087 `respond` result when a
 *   reaction was attempted;
 * - the 050/051 STOP cause, so a stop caused by traffic is never reported as a stop-line violation;
 * - the 097 `red_stop_probability` and 098 `stop_full_probability` candidates, so the violation the
 *   player commits is the same episode the real estimators learn from.
 *
 * A violation therefore has two observable halves: the real 086 `FAILURE` outcome and the real
 * candidate that includes the episode. A blocked green is an `EXTERNAL_CONSTRAINT`, never a
 * violation and never a reaction requirement: the 087 `respond` contract refuses it with
 * `EXTERNAL_CONSTRAINT`, which is exactly what the mission reports.
 *
 * The module owns no clock, DOM, renderer, profile store, learning queue or random source. It reads
 * immutable evidence and returns immutable facts, and it never publishes a profile.
 */
export const SIGNALS_SCHEMA_VERSION = '120-mission-signals-v1' as const;
export const SIGNALS_MISSION_ID = 'campaign-4-stops-and-signals' as const;

export const SIGNALS_LIMITS = Object.freeze({
  version: SIGNALS_SCHEMA_VERSION,
  /** Opportunities of one mission run. */
  episodes: 32,
  /** Code units for an opportunity or window identity. */
  idCodeUnits: 256,
  /** The 116 `full-stops` objective and its minimum dwell. */
  objectiveFullStops: 2,
  minimumFullStopDwellS: 1.5,
});

export const signalMissionOutcomes = ['PROGRESS', 'NO_PROGRESS'] as const;
export type SignalMissionOutcome = (typeof signalMissionOutcomes)[number];

export const signalEpisodeVerdicts = [
  'VIOLATION',
  'COMPLIANT',
  'TRAFFIC_STOP',
  'BLOCKED_GREEN',
  'EXTERNAL_CONSTRAINT',
] as const;
export type SignalEpisodeVerdict = (typeof signalEpisodeVerdicts)[number];

export const signalViolationKinds = ['RED_CROSSED', 'STOP_LINE_CROSSED'] as const;
export type SignalViolationKind = (typeof signalViolationKinds)[number];

/** Closed explanations the mission gives for one episode. */
export const signalExplanations = [
  'RED_HELD',
  'RED_CROSSED',
  'STOP_LINE_HELD',
  'STOP_LINE_CROSSED',
  'GREEN_RELEASED',
  'GREEN_MISSED',
  'TRAFFIC_STOP_NOT_VIOLATION',
  'BLOCKED_GREEN_NOT_VIOLATION',
  'EXTERNAL_CONSTRAINT_NOT_VIOLATION',
] as const;
export type SignalExplanation = (typeof signalExplanations)[number];

export const signalMissionReasons = [
  'VIOLATIONS',
  'INSUFFICIENT_FULL_STOPS',
  'VIOLATIONS_AND_INSUFFICIENT_FULL_STOPS',
] as const;
export type SignalMissionReason = (typeof signalMissionReasons)[number];

export const stopCauses = ['STOP_LINE', 'LEADER', 'QUEUE', 'BLOCKED'] as const;
export type StopCause = (typeof stopCauses)[number];

export const signalCandidateStatuses = ['CANDIDATE', 'UNOBSERVED', 'REFUSED'] as const;
export const signalCandidateConfidences = ['HIGH', 'MODERATE', 'LOW', 'NONE'] as const;

export interface SignalCandidateFact {
  readonly status: (typeof signalCandidateStatuses)[number];
  readonly value: number | null;
  readonly confidence: (typeof signalCandidateConfidences)[number];
  readonly sourceEpisodeCount: number;
  readonly reason: string | null;
}

/** Real 097 facts of this run. */
export interface SignalLearningFacts {
  readonly certainRedDenominator: number;
  readonly redStopProbability: SignalCandidateFact;
}

/** Real 098 facts of this run. */
export interface StopLearningFacts {
  readonly certainStopOpportunityDenominator: number;
  /** 087 FREE_TRAFFIC STOP_LINE subset. */
  readonly certainStopDenominator: number;
  readonly stopFullProbability: SignalCandidateFact;
}

export const reactionReasons = [
  'RESPONSE',
  'NOT_OBSERVABLE',
  'EXTERNAL_CONSTRAINT',
  'SEGMENT_EXCLUDED',
  'NO_WINDOW',
  'ALREADY_RESPONDED',
] as const;
export type ReactionReason = (typeof reactionReasons)[number];

/** The real 087 response result, paired with its opportunity by the caller. */
export interface SignalReactionFact {
  readonly accepted: boolean;
  readonly reason: ReactionReason;
  readonly durationSeconds: number | null;
}

export interface SignalEpisodeInput {
  readonly opportunity: OpportunityRecord;
  readonly eligibilityWindow: EligibilityWindowRecord;
  /** Real 050/051 STOP cause; `null` for RED/GREEN. */
  readonly stopCause: StopCause | null;
  /** Real STOP decision facts; `null` for RED/GREEN and for traffic-induced stops. */
  readonly fullStop: boolean | null;
  readonly rollingStop: boolean | null;
  readonly dwellTicks: number | null;
  /** Real 087 `respond` result, or `null` when no reaction was attempted. */
  readonly reaction: SignalReactionFact | null;
}

export interface SignalMissionInput {
  readonly episodes: readonly SignalEpisodeInput[];
  readonly signal: SignalLearningFacts;
  readonly stop: StopLearningFacts;
}

export interface SignalReactionResult {
  /** True only for a free-traffic eligible window, the only one 087 opens a reaction window for. */
  readonly applicable: boolean;
  readonly responded: boolean;
  readonly durationSeconds: number | null;
  readonly reason: ReactionReason | null;
}

export interface SignalConsequence {
  /** Real 086 certainty: a violation is always a `FAILURE` opportunity. */
  readonly opportunityResult: 'FAILURE';
  readonly learningKey: 'red_stop_probability' | 'stop_full_probability';
  readonly candidateStatus: SignalCandidateFact['status'];
  readonly candidateValue: number | null;
  readonly candidateReason: string | null;
}

export interface SignalEpisodeResult {
  readonly opportunityId: string;
  readonly kind: 'STOP' | 'RED' | 'GREEN';
  readonly windowClass: EligibilityWindowClass;
  readonly label: string;
  readonly stopCause: StopCause | null;
  readonly outcome: string;
  readonly opportunityResult: 'SUCCESS' | 'FAILURE';
  readonly verdict: SignalEpisodeVerdict;
  readonly explanation: SignalExplanation;
  readonly violation: SignalViolationKind | null;
  readonly fullStop: boolean;
  readonly dwellS: number | null;
  readonly reaction: SignalReactionResult;
  readonly consequence: SignalConsequence | null;
}

export interface SignalMissionResult {
  readonly version: typeof SIGNALS_SCHEMA_VERSION;
  readonly missionId: typeof SIGNALS_MISSION_ID;
  readonly episodes: readonly SignalEpisodeResult[];
  readonly violations: number;
  readonly compliant: number;
  readonly trafficStops: number;
  readonly blockedGreens: number;
  readonly externalConstraints: number;
  readonly fullStops: number;
  readonly objectiveMet: boolean;
  /** The mission's own gate: the 116 objective and zero attributable violations. */
  readonly outcome: SignalMissionOutcome;
  readonly reason: SignalMissionReason | null;
  readonly learning: Readonly<{
    redStopProbability: SignalCandidateFact;
    stopFullProbability: SignalCandidateFact;
    certainRedDenominator: number;
    certainStopDenominator: number;
  }>;
  /** Structural proof that the mission never writes a profile or queues a learning job. */
  readonly profileWrites: 0;
  readonly learningJobs: 0;
}

const inputFields = ['episodes', 'signal', 'stop'] as const;
const episodeFields = [
  'opportunity',
  'eligibilityWindow',
  'stopCause',
  'fullStop',
  'rollingStop',
  'dwellTicks',
  'reaction',
] as const;
const reactionFields = ['accepted', 'reason', 'durationSeconds'] as const;
const signalFields = ['certainRedDenominator', 'redStopProbability'] as const;
const stopFields = [
  'certainStopOpportunityDenominator',
  'certainStopDenominator',
  'stopFullProbability',
] as const;
const candidateFields = ['status', 'value', 'confidence', 'sourceEpisodeCount', 'reason'] as const;
const opportunityKinds = ['STOP', 'RED', 'GREEN'] as const;
const opportunityOutcomes = {
  STOP: ['STOPPED', 'CROSSED_WITHOUT_STOP'],
  RED: ['HELD', 'CROSSED'],
  GREEN: ['RELEASED', 'MISSED'],
} as const;
const windowClasses = ['ELIGIBLE', 'EXTERNAL_CONSTRAINT', 'EXCLUDED'] as const;
const externalLabels = ['LEADER', 'BLOCKED_GREEN', 'MECHANICAL_LIMIT', 'IMPACT'] as const;
const excludedLabels = [
  'PAUSE',
  'FOCUS_LOST',
  'MANUAL_SEGMENT',
  'AUTO_SEGMENT',
  'NOT_OBSERVABLE',
] as const;
const RATIO_EPSILON = 1e-9;

interface OpportunityView {
  readonly id: string;
  readonly kind: (typeof opportunityKinds)[number];
  readonly outcome: string;
  readonly result: 'SUCCESS' | 'FAILURE';
  readonly vehicleId: string;
  readonly incarnation: string;
  readonly learningEligible: boolean;
}

interface WindowView {
  readonly opportunityId: string;
  readonly kind: (typeof opportunityKinds)[number];
  readonly windowClass: EligibilityWindowClass;
  readonly label: string;
  readonly reason: string;
  readonly vehicleId: string;
  readonly incarnation: string;
  readonly learningEligible: boolean;
}

function readOpportunity(value: unknown): OpportunityView {
  const data = record(value);
  const id = boundedId(data.id, SIGNALS_LIMITS.idCodeUnits, 'signal opportunity');
  const kind = choice(data.kind, opportunityKinds);
  requireContract(data.state === 'RESOLVED', 'Signal mission accepts only resolved opportunities');
  const outcome = choice(data.outcome, opportunityOutcomes[kind]);
  const result = choice(data.result, ['SUCCESS', 'FAILURE'] as const);
  requireContract(
    (outcome === 'STOPPED' || outcome === 'HELD' || outcome === 'RELEASED') ===
      (result === 'SUCCESS'),
    'Signal opportunity outcome contradicts its 086 result',
  );
  return Object.freeze({
    id,
    kind,
    outcome,
    result,
    vehicleId: boundedId(data.vehicleId, SIGNALS_LIMITS.idCodeUnits, 'signal vehicle'),
    incarnation: boundedId(data.incarnation, SIGNALS_LIMITS.idCodeUnits, 'signal incarnation'),
    learningEligible: boolean(data.learningEligible),
  });
}

function readWindow(value: unknown): WindowView {
  const data = record(value);
  const windowClass = choice(data.windowClass, windowClasses);
  const label =
    windowClass === 'ELIGIBLE'
      ? choice(data.label, ['FREE_TRAFFIC'] as const)
      : windowClass === 'EXTERNAL_CONSTRAINT'
        ? choice(data.label, externalLabels)
        : choice(data.label, excludedLabels);
  return Object.freeze({
    opportunityId: boundedId(
      data.opportunityId,
      SIGNALS_LIMITS.idCodeUnits,
      'signal window opportunity',
    ),
    kind: choice(data.kind, opportunityKinds),
    windowClass,
    label,
    reason: boundedId(data.reason, SIGNALS_LIMITS.idCodeUnits, 'signal window reason'),
    vehicleId: boundedId(data.vehicleId, SIGNALS_LIMITS.idCodeUnits, 'signal window vehicle'),
    incarnation: boundedId(
      data.incarnation,
      SIGNALS_LIMITS.idCodeUnits,
      'signal window incarnation',
    ),
    learningEligible: boolean(data.learningEligible),
  });
}

function readReaction(value: unknown): SignalReactionFact {
  const data = plainFields(value, reactionFields, 'signal reaction');
  for (const key of reactionFields) requireRequired(data, key, 'signal reaction');
  const accepted = boolean(data.accepted);
  const reason = choice(data.reason, reactionReasons);
  const durationSeconds =
    data.durationSeconds === null ? null : number(data.durationSeconds, 0, 1_000_000);
  requireContract(
    accepted === (reason === 'RESPONSE'),
    'Signal reaction reason contradicts accept',
  );
  requireContract(
    accepted === (durationSeconds !== null),
    'Signal reaction duration must exist exactly for an accepted response',
  );
  return Object.freeze({ accepted, reason, durationSeconds });
}

function readCandidate(value: unknown, key: string): SignalCandidateFact {
  const data = plainFields(value, candidateFields, 'signal candidate');
  for (const field of candidateFields) requireRequired(data, field, 'signal candidate');
  const status = choice(data.status, signalCandidateStatuses);
  const candidateValue = data.value === null ? null : number(data.value, 0, 1);
  const confidence = choice(data.confidence, signalCandidateConfidences);
  const sourceEpisodeCount = tick(data.sourceEpisodeCount);
  const reason =
    data.reason === null ? null : boundedId(data.reason, SIGNALS_LIMITS.idCodeUnits, key);
  requireContract(
    (status === 'CANDIDATE') === (candidateValue !== null),
    'Signal candidate value must exist exactly for an identified candidate',
  );
  return Object.freeze({ status, value: candidateValue, confidence, sourceEpisodeCount, reason });
}

function readSignalFacts(value: unknown): SignalLearningFacts {
  const data = plainFields(value, signalFields, 'signal learning facts');
  for (const key of signalFields) requireRequired(data, key, 'signal learning facts');
  return Object.freeze({
    certainRedDenominator: tick(data.certainRedDenominator),
    redStopProbability: readCandidate(data.redStopProbability, 'red_stop_probability'),
  });
}

function readStopFacts(value: unknown): StopLearningFacts {
  const data = plainFields(value, stopFields, 'stop learning facts');
  for (const key of stopFields) requireRequired(data, key, 'stop learning facts');
  return Object.freeze({
    certainStopOpportunityDenominator: tick(data.certainStopOpportunityDenominator),
    certainStopDenominator: tick(data.certainStopDenominator),
    stopFullProbability: readCandidate(data.stopFullProbability, 'stop_full_probability'),
  });
}

function sameRatio(actual: number | null, numerator: number, denominator: number): boolean {
  if (denominator === 0) return actual === null;
  return actual !== null && Math.abs(actual - numerator / denominator) <= RATIO_EPSILON;
}

function classify(
  opportunity: OpportunityView,
  eligibilityWindow: WindowView,
  stopCause: StopCause | null,
  fullStop: boolean,
): {
  verdict: SignalEpisodeVerdict;
  explanation: SignalExplanation;
  violation: SignalViolationKind | null;
} {
  const freeTraffic = eligibilityWindow.windowClass === 'ELIGIBLE';
  if (opportunity.kind === 'STOP') {
    if (stopCause === null) throw new Error('STOP episode requires a real 050/051 stop cause');
    if (stopCause !== 'STOP_LINE') {
      requireContract(
        !freeTraffic,
        'A traffic-induced STOP cannot carry a free-traffic stop-line window',
      );
      return {
        verdict: 'TRAFFIC_STOP',
        explanation: 'TRAFFIC_STOP_NOT_VIOLATION',
        violation: null,
      };
    }
    requireContract(
      freeTraffic && eligibilityWindow.label === 'FREE_TRAFFIC',
      'STOP_LINE corridor not free',
    );
    return fullStop
      ? { verdict: 'COMPLIANT', explanation: 'STOP_LINE_HELD', violation: null }
      : {
          verdict: 'VIOLATION',
          explanation: 'STOP_LINE_CROSSED',
          violation: 'STOP_LINE_CROSSED',
        };
  }
  if (opportunity.kind === 'RED') {
    if (eligibilityWindow.windowClass === 'EXTERNAL_CONSTRAINT')
      return {
        verdict: 'EXTERNAL_CONSTRAINT',
        explanation: 'EXTERNAL_CONSTRAINT_NOT_VIOLATION',
        violation: null,
      };
    requireContract(freeTraffic, 'A RED episode must be free traffic or an external constraint');
    return opportunity.outcome === 'HELD'
      ? { verdict: 'COMPLIANT', explanation: 'RED_HELD', violation: null }
      : { verdict: 'VIOLATION', explanation: 'RED_CROSSED', violation: 'RED_CROSSED' };
  }
  if (eligibilityWindow.windowClass === 'EXTERNAL_CONSTRAINT') {
    return eligibilityWindow.label === 'BLOCKED_GREEN'
      ? {
          verdict: 'BLOCKED_GREEN',
          explanation: 'BLOCKED_GREEN_NOT_VIOLATION',
          violation: null,
        }
      : {
          verdict: 'EXTERNAL_CONSTRAINT',
          explanation: 'EXTERNAL_CONSTRAINT_NOT_VIOLATION',
          violation: null,
        };
  }
  requireContract(freeTraffic, 'A GREEN episode must be free traffic or an external constraint');
  return opportunity.outcome === 'RELEASED'
    ? { verdict: 'COMPLIANT', explanation: 'GREEN_RELEASED', violation: null }
    : { verdict: 'COMPLIANT', explanation: 'GREEN_MISSED', violation: null };
}

/**
 * Builds the mission result from real 086/087 facts and the real 097/098 candidates.
 *
 * The mission refuses a contradictory input instead of explaining a situation the facts do not
 * support: a stop-line violation must be a free-traffic `FAILURE`, a traffic-induced stop must be an
 * external constraint, and a supplied reaction must agree with the window 087 actually opened.
 */
export function evaluateSignalMission(value: unknown): SignalMissionResult {
  const data = plainFields(value, inputFields, 'signal mission');
  for (const key of inputFields) requireRequired(data, key, 'signal mission');
  const signal = readSignalFacts(data.signal);
  const stop = readStopFacts(data.stop);
  const rawEpisodes = data.episodes;
  requireContract(
    Array.isArray(rawEpisodes) &&
      rawEpisodes.length > 0 &&
      rawEpisodes.length <= SIGNALS_LIMITS.episodes,
    'Signal mission episode capacity violated',
  );

  const episodes: SignalEpisodeResult[] = [];
  const seen = new Set<string>();
  for (const raw of rawEpisodes) {
    const episode = plainFields(raw, episodeFields, 'signal episode');
    for (const key of episodeFields) requireRequired(episode, key, 'signal episode');
    const opportunity = readOpportunity(episode.opportunity);
    const eligibilityWindow = readWindow(episode.eligibilityWindow);
    requireContract(
      eligibilityWindow.opportunityId === opportunity.id &&
        eligibilityWindow.kind === opportunity.kind &&
        eligibilityWindow.vehicleId === opportunity.vehicleId &&
        eligibilityWindow.incarnation === opportunity.incarnation,
      'Signal episode window does not belong to its opportunity',
    );
    requireContract(!seen.has(opportunity.id), 'Duplicate signal mission opportunity');
    seen.add(opportunity.id);

    const stopCause = episode.stopCause === null ? null : choice(episode.stopCause, stopCauses);
    if (opportunity.kind === 'STOP') {
      requireContract(stopCause !== null, 'STOP episode requires a stop cause');
    } else {
      requireContract(stopCause === null, 'Only a STOP episode may carry a stop cause');
    }
    const fullStop = episode.fullStop === null ? false : boolean(episode.fullStop);
    const rollingStop = episode.rollingStop === null ? null : boolean(episode.rollingStop);
    const dwellTicks = episode.dwellTicks === null ? null : tick(episode.dwellTicks);
    if (opportunity.kind === 'STOP') {
      if (stopCause === 'STOP_LINE') {
        requireContract(
          fullStop !== (rollingStop === true),
          'A STOP_LINE episode must be either a full stop or a rolling stop',
        );
        if (fullStop) {
          requireContract(
            opportunity.outcome === 'STOPPED',
            'A full stop contradicts the certain 086 outcome',
          );
          requireContract(dwellTicks !== null, 'A full stop requires its measured dwell');
        } else {
          requireContract(
            opportunity.outcome === 'CROSSED_WITHOUT_STOP',
            'A missing full stop contradicts the certain 086 outcome',
          );
          requireContract(dwellTicks === null, 'Only a full stop may carry a dwell');
        }
      } else {
        requireContract(
          !fullStop && rollingStop === null && dwellTicks === null,
          'A traffic-induced stop is not a stop-line decision',
        );
      }
    } else {
      requireContract(
        !fullStop && rollingStop === null && dwellTicks === null,
        'Only a STOP episode may carry stop-line decision facts',
      );
    }

    const classification = classify(opportunity, eligibilityWindow, stopCause, fullStop);
    const reaction = episode.reaction === null ? null : readReaction(episode.reaction);
    const applicable = eligibilityWindow.windowClass === 'ELIGIBLE';
    if (!applicable) {
      requireContract(
        reaction === null ||
          (!reaction.accepted &&
            (eligibilityWindow.windowClass === 'EXTERNAL_CONSTRAINT'
              ? reaction.reason === 'EXTERNAL_CONSTRAINT'
              : reaction.reason === 'SEGMENT_EXCLUDED' || reaction.reason === 'NOT_OBSERVABLE')),
        'A constrained window cannot accept a reaction',
      );
    }
    if (reaction !== null && reaction.accepted)
      requireContract(applicable, 'A reaction was accepted on a non-eligible window');

    const learningKey =
      classification.violation === 'RED_CROSSED'
        ? ('red_stop_probability' as const)
        : classification.violation === 'STOP_LINE_CROSSED'
          ? ('stop_full_probability' as const)
          : null;
    const candidate =
      learningKey === 'red_stop_probability'
        ? signal.redStopProbability
        : learningKey === 'stop_full_probability'
          ? stop.stopFullProbability
          : null;
    requireContract(
      classification.violation === null || opportunity.result === 'FAILURE',
      'A signal violation requires a certain 086 failure',
    );
    episodes.push(
      Object.freeze({
        opportunityId: opportunity.id,
        kind: opportunity.kind,
        windowClass: eligibilityWindow.windowClass,
        label: eligibilityWindow.label,
        stopCause,
        outcome: opportunity.outcome,
        opportunityResult: opportunity.result,
        verdict: classification.verdict,
        explanation: classification.explanation,
        violation: classification.violation,
        fullStop,
        dwellS: dwellTicks === null ? null : dwellTicks / 60,
        reaction: Object.freeze({
          applicable,
          responded: reaction?.accepted ?? false,
          durationSeconds: reaction?.durationSeconds ?? null,
          reason: reaction?.reason ?? null,
        }),
        consequence:
          classification.violation === null || candidate === null
            ? null
            : Object.freeze({
                opportunityResult: 'FAILURE' as const,
                learningKey: learningKey!,
                candidateStatus: candidate.status,
                candidateValue: candidate.value,
                candidateReason: candidate.reason,
              }),
      }),
    );
  }

  const redEpisodes = episodes.filter((entry) => entry.kind === 'RED');
  const stopEpisodes = episodes.filter((entry) => entry.kind === 'STOP');
  const stopLine = stopEpisodes.filter(
    (entry) => entry.stopCause === 'STOP_LINE' && entry.windowClass === 'ELIGIBLE',
  );
  requireContract(
    signal.certainRedDenominator === redEpisodes.length,
    '097 RED denominator does not match the mission episodes',
  );
  requireContract(
    stop.certainStopOpportunityDenominator === stopEpisodes.length,
    '098 STOP denominator does not match the mission episodes',
  );
  requireContract(
    stop.certainStopDenominator === stopLine.length,
    '098 stop-line denominator does not match the mission episodes',
  );
  const heldRed = redEpisodes.filter((entry) => entry.outcome === 'HELD').length;
  const fullStopFacts = stopLine.filter((entry) => entry.fullStop).length;
  const fullStops = stopLine.filter(
    (entry) =>
      entry.fullStop &&
      entry.dwellS !== null &&
      entry.dwellS + RATIO_EPSILON >= SIGNALS_LIMITS.minimumFullStopDwellS,
  ).length;
  if (signal.redStopProbability.status === 'CANDIDATE')
    requireContract(
      sameRatio(signal.redStopProbability.value, heldRed, redEpisodes.length),
      '097 red_stop_probability candidate does not match the real episodes',
    );
  else
    requireContract(
      signal.redStopProbability.value === null,
      'An unidentified 097 candidate cannot carry a value',
    );
  if (stop.stopFullProbability.status === 'CANDIDATE')
    requireContract(
      sameRatio(stop.stopFullProbability.value, fullStopFacts, stopLine.length),
      '098 stop_full_probability candidate does not match the real episodes',
    );
  else
    requireContract(
      stop.stopFullProbability.value === null,
      'An unidentified 098 candidate cannot carry a value',
    );

  const violations = episodes.filter((entry) => entry.verdict === 'VIOLATION').length;
  const objectiveMet = fullStops >= SIGNALS_LIMITS.objectiveFullStops;
  const reason: SignalMissionReason | null =
    violations === 0 && objectiveMet
      ? null
      : violations > 0 && !objectiveMet
        ? 'VIOLATIONS_AND_INSUFFICIENT_FULL_STOPS'
        : violations > 0
          ? 'VIOLATIONS'
          : 'INSUFFICIENT_FULL_STOPS';
  return Object.freeze({
    version: SIGNALS_SCHEMA_VERSION,
    missionId: SIGNALS_MISSION_ID,
    episodes: Object.freeze(episodes),
    violations,
    compliant: episodes.filter((entry) => entry.verdict === 'COMPLIANT').length,
    trafficStops: episodes.filter((entry) => entry.verdict === 'TRAFFIC_STOP').length,
    blockedGreens: episodes.filter((entry) => entry.verdict === 'BLOCKED_GREEN').length,
    externalConstraints: episodes.filter((entry) => entry.verdict === 'EXTERNAL_CONSTRAINT').length,
    fullStops,
    objectiveMet,
    outcome: reason === null ? ('PROGRESS' as const) : ('NO_PROGRESS' as const),
    reason,
    learning: Object.freeze({
      redStopProbability: signal.redStopProbability,
      stopFullProbability: stop.stopFullProbability,
      certainRedDenominator: signal.certainRedDenominator,
      certainStopDenominator: stop.certainStopDenominator,
    }),
    profileWrites: 0 as const,
    learningJobs: 0 as const,
  });
}

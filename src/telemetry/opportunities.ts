import {
  boolean,
  choice,
  createStableId,
  fields,
  list,
  record,
  requireContract,
  text,
  tick as readTick,
} from '../sessions';
import { parseSimulationEvent } from '../simulation';
import type { SimulationEvent } from '../simulation';
import type { MovementSignal } from '../world';
import { segmentCloseReasons } from './contracts';

/**
 * 086 opportunity registry: unique identity, lifecycle, denominators and bounds for the enumerated
 * opportunity kinds (STOP, RED, GREEN, YIELD, LANE_CHANGE).
 *
 * It is a pure telemetry consumer. It owns no clock, physics, renderer, DOM, scheduler or event bus;
 * it never publishes and never decides compliance. It reads the already authoritative 036 movement
 * phase occurrence, the drained 036/037/053 event stream, and the occurrence/outcome vocabulary the
 * 038/050/051/052/053 owners already publish, then assigns one deterministic identity per physical
 * occurrence, tracks its lifecycle and aggregates counters.
 *
 * Identity comes from the 006 `createStableId` contract plus the authoritative physical context
 * (session, world epoch, vehicle, incarnation, lane/intersection/signal/movement) and a per-registry
 * occurrence ordinal. No wall clock and no `Math.random` participate, and the identity deliberately
 * does NOT depend on the observation cadence, the frame count or the observation tick: the same
 * physical occurrence observed at every fixed tick and at the 10 Hz decision cadence resolves to
 * exactly one opportunity with exactly one ID. The *producer* occurrence key (037 stop-approach id,
 * 038 yield evidence id, 053 lane-change id) is used only to tell two distinct physical occurrences
 * apart; it is never embedded verbatim in the identity, so a producer that stamps its own
 * observation tick cannot make this identity cadence-dependent.
 */

export const OPPORTUNITY_VERSION = '086-opportunity-ids-v1' as const;

export const opportunityKinds = ['STOP', 'RED', 'GREEN', 'YIELD', 'LANE_CHANGE'] as const;
export type OpportunityKind = (typeof opportunityKinds)[number];

/**
 * Canonical lifecycle states from Docs/09 ("O oportunitate poate fi ENTERED, RESOLVED sau TRUNCATED").
 * The finer vocabulary requested for 086 lives in the fields, not in a second state machine: ENTERED
 * covers opened/active (`observationCount`, `lastTick`), RESOLVED carries a certain `outcome` and its
 * `result`, and TRUNCATED carries an explicit `truncationReason` that names incomplete/superseded.
 */
export const opportunityStates = ['ENTERED', 'RESOLVED', 'TRUNCATED'] as const;
export type OpportunityState = (typeof opportunityStates)[number];

export const opportunityTruncationReasons = [
  'SUPERSEDED',
  'SEGMENT_CLOSED',
  'OBSERVATION_LOST',
  'SUSPENDED',
  'DISPOSED',
] as const;
export type OpportunityTruncationReason = (typeof opportunityTruncationReasons)[number];

/** Closed outcome vocabulary per kind. Exactly one outcome may ever be attached to an opportunity. */
export const opportunityOutcomeTable = Object.freeze({
  STOP: Object.freeze(['STOPPED', 'CROSSED_WITHOUT_STOP'] as const),
  RED: Object.freeze(['HELD', 'CROSSED'] as const),
  GREEN: Object.freeze(['RELEASED', 'MISSED'] as const),
  YIELD: Object.freeze(['YIELDED', 'PROCEEDED'] as const),
  LANE_CHANGE: Object.freeze(['COMPLETED', 'ABORTED'] as const),
});

export type OpportunityOutcome = (typeof opportunityOutcomeTable)[OpportunityKind][number];

/** The certain-success half of each kind's outcome vocabulary; the other half is certain failure. */
export const opportunitySuccessOutcomes: readonly OpportunityOutcome[] = Object.freeze([
  'STOPPED',
  'HELD',
  'RELEASED',
  'YIELDED',
  'COMPLETED',
]);

export type OpportunityResult = 'SUCCESS' | 'FAILURE';

export const OPPORTUNITY_CAPACITY = Object.freeze({
  minimum: 32,
  /**
   * `4096` is the 203 manifest's `diagnosticSamples` figure. With the per-record byte ceiling below,
   * the default store's derived worst case is `4096 × 4288 B ≈ 17.6 MB`, inside the manifest's
   * `recorderRamBytes` 33,554,432 B alongside the 085 sample buffers (≈3.6 MiB).
   */
  default: 4096,
  /** `7168 × 4288 B ≈ 30.7 MB < 33,554,432 B`; a larger store cannot fit the recorder budget. */
  maximum: 7168,
  /** Maximum semantic ids carried by one YIELD/LANE_CHANGE stimulus. */
  relatedIdsPerStimulus: 4,
});

/**
 * Dense per-record ownership estimate for the bounded store: the documented number of fixed
 * numeric/boolean/enum slots times eight bytes. String content is *not* included here; it is reported
 * separately as `identityCodeUnits`, exactly like the 085 recorder reports interned identities.
 */
export const OPPORTUNITY_DENSE_SLOTS = 24;
export const OPPORTUNITY_BYTES_PER_RECORD = OPPORTUNITY_DENSE_SLOTS * 8;

/**
 * Enforced identity ceiling for one record (its id, vehicle, incarnation, segments, stimulus ids and
 * relation ids). A prospective record above it is refused explicitly instead of being retained, which
 * is what makes `estimatedBytesMaximum` a real bound and not an estimate. 2048 code units comfortably
 * covers a realistic id (~100–300 units) while keeping the worst case finite.
 */
export const OPPORTUNITY_IDENTITY_CODE_UNITS_CEILING = 2048;
export const OPPORTUNITY_RECORD_BYTES_CEILING =
  OPPORTUNITY_BYTES_PER_RECORD + OPPORTUNITY_IDENTITY_CODE_UNITS_CEILING * 2;
/** Segments recorded per opportunity; a rollover continues the same opportunity without re-identifying it. */
export const OPPORTUNITY_SEGMENTS_PER_RECORD = 8;
/** `Docs/performance-budgets.json` `proposedCapacities.recorderRamBytes`. */
export const OPPORTUNITY_RECORDER_RAM_BYTES = 33_554_432;

type SignalState = 'RED' | 'YELLOW' | 'GREEN';
const signalStates = ['RED', 'YELLOW', 'GREEN'] as const;

/** Real 036 movement phase occurrence applicable to one vehicle, plus the authoritative phase start. */
export interface OpportunitySignalContext {
  readonly signalId: string;
  readonly intersectionId: string;
  readonly phaseId: string;
  readonly movementId: string;
  readonly state: SignalState;
  /**
   * `SignalControllerSnapshot.phaseStartedTick` of the same signal. A phase *occurrence* is identified
   * by this authoritative tick, never by the observation tick, so a phase that cycles back with the
   * same `phaseId` is a distinct occurrence with a distinct opportunity.
   */
  readonly phaseStartedTick: number;
}

/** Occurrence authored by the 038/052 yield owner or the 053 lane-change owner in its own vocabulary. */
export interface OpportunityStimulus {
  readonly kind: 'YIELD' | 'LANE_CHANGE';
  readonly tick: number;
  /** Authoritative producer occurrence key; tells two distinct physical occurrences apart. */
  readonly sourceKey: string;
  /** Zero to four semantic ids (relation ids, from/to lane ids). Never array positions. */
  readonly relatedIds: readonly string[];
}

/** Certain outcome authored by the deciding 050/051/052/053 policy for an opportunity id. */
export interface OpportunityConclusion {
  readonly tick: number;
  readonly opportunityId: string;
  readonly outcome: string;
}

export interface OpportunityObservation {
  readonly tick: number;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly segmentId: string;
  /** Frozen from the owning segment (069/085 rule); never re-derived mid-opportunity. */
  readonly learningEligible: boolean;
  readonly vehicleId: string;
  readonly incarnation: string;
  readonly signal: OpportunitySignalContext | null;
  /** Authoritative 036/037/053 events drained since the previous observation, in tick order. */
  readonly events: readonly SimulationEvent[];
  readonly stimuli: readonly OpportunityStimulus[];
  readonly conclusions: readonly OpportunityConclusion[];
}

export interface OpportunityStimulusView {
  readonly stopLineId: string | null;
  readonly signalId: string | null;
  readonly intersectionId: string | null;
  readonly movementId: string | null;
  readonly movementPhaseStartedTick: number | null;
  readonly fromLaneId: string | null;
  readonly toLaneId: string | null;
  readonly relationIds: readonly string[];
}

export interface OpportunityRecord {
  readonly id: string;
  readonly kind: OpportunityKind;
  readonly state: OpportunityState;
  readonly outcome: OpportunityOutcome | null;
  readonly result: OpportunityResult | null;
  readonly truncationReason: OpportunityTruncationReason | null;
  readonly vehicleId: string;
  readonly incarnation: string;
  /** Segments that observed the opportunity, opening segment first; a rollover does not re-identify it. */
  readonly segmentIds: readonly string[];
  readonly learningEligible: boolean;
  readonly occurrence: number;
  readonly openedTick: number;
  /** Cadence-visible. */
  readonly lastTick: number;
  readonly resolvedTick: number | null;
  /** Cadence-visible: how many observations touched this opportunity. Never used for identity. */
  readonly observationCount: number;
  readonly stimulus: OpportunityStimulusView;
}

export interface OpportunityKindDenominator {
  readonly kind: OpportunityKind;
  /** Every opportunity of this kind ever opened. */
  readonly total: number;
  /** Certain subset: resolved as exactly one explicit success or failure. */
  readonly certain: number;
  readonly success: number;
  readonly failure: number;
  /** Truncated subset: cut short, never counted as certain success or certain failure. */
  readonly incomplete: number;
  readonly entered: number;
  readonly learningEligibleCertain: number;
}

export interface OpportunityReasonDenominator {
  readonly reason: OpportunityTruncationReason;
  readonly count: number;
}

export interface OpportunityDenominators {
  readonly version: typeof OPPORTUNITY_VERSION;
  readonly total: number;
  readonly certain: number;
  readonly success: number;
  readonly failure: number;
  readonly incomplete: number;
  readonly entered: number;
  readonly learningEligibleCertain: number;
  readonly byKind: readonly OpportunityKindDenominator[];
  readonly truncatedByReason: readonly OpportunityReasonDenominator[];
}

export interface OpportunityRegistryStats {
  readonly version: typeof OPPORTUNITY_VERSION;
  readonly disposed: boolean;
  readonly maxOpportunities: number;
  /** Cumulative since construction; survives every eviction and `dispose()`. */
  readonly openedTotal: number;
  readonly resolvedTotal: number;
  readonly truncatedTotal: number;
  readonly retiredTotal: number;
  readonly rejectedTotal: number;
  readonly contradictionTotal: number;
  readonly observationCalls: number;
  readonly skippedTicks: number;
  readonly suspensions: number;
  readonly resumptions: number;
  readonly segmentOverflow: number;
  /** Live owned resources; every one returns to zero after `dispose()`. */
  readonly retained: number;
  readonly entered: number;
  readonly resolved: number;
  readonly truncated: number;
  readonly identityCodeUnits: number;
  readonly estimatedBytes: number;
  readonly estimatedBytesMaximum: number;
}

export interface OpportunityRegistryOptions {
  readonly maxOpportunities?: number;
}

export interface OpportunityTruncationInput {
  readonly tick: number;
  readonly opportunityId: string;
  readonly reason: OpportunityTruncationReason;
}

export interface OpportunitySegmentCloseInput {
  readonly tick: number;
  readonly segmentId: string;
  readonly reason: (typeof segmentCloseReasons)[number];
}

export interface OpportunityTickInput {
  readonly tick: number;
}

export interface OpportunityRegistry {
  readonly version: typeof OPPORTUNITY_VERSION;
  /** Consumes one authoritative observation and returns the records it touched, in first-touch order. */
  observe(input: OpportunityObservation): readonly OpportunityRecord[];
  conclude(input: OpportunityConclusion): OpportunityRecord;
  truncate(input: OpportunityTruncationInput): OpportunityRecord;
  /** 069 rule: the observation window ends, so every non-terminal opportunity is TRUNCATED. */
  closeSegment(input: OpportunitySegmentCloseInput): readonly OpportunityRecord[];
  /** 070 rule: a suspension is not a resolution; every entered opportunity becomes TRUNCATED. */
  suspend(input: OpportunityTickInput): readonly OpportunityRecord[];
  resume(input: OpportunityTickInput): void;
  getOpportunities(): readonly OpportunityRecord[];
  getOpportunity(opportunityId: string): OpportunityRecord | null;
  findEntered(
    kind: OpportunityKind,
    vehicleId: string,
    incarnation: string,
  ): OpportunityRecord | null;
  getDenominators(): OpportunityDenominators;
  getStats(): OpportunityRegistryStats;
  dispose(): void;
}

type OpportunityGroup = 'STOP' | 'SIGNAL' | 'YIELD' | 'LANE_CHANGE';

interface InternalRecord {
  readonly id: string;
  readonly kind: OpportunityKind;
  readonly group: OpportunityGroup;
  readonly sourceKey: string;
  readonly vehicleId: string;
  readonly incarnation: string;
  readonly occurrence: number;
  readonly stimulus: OpportunityStimulusView;
  readonly segmentIds: string[];
  readonly learningEligible: boolean;
  readonly openedTick: number;
  state: OpportunityState;
  outcome: OpportunityOutcome | null;
  result: OpportunityResult | null;
  truncationReason: OpportunityTruncationReason | null;
  lastTick: number;
  resolvedTick: number | null;
  observationCount: number;
}

const observationFields = [
  'tick',
  'sessionId',
  'worldEpoch',
  'segmentId',
  'learningEligible',
  'vehicleId',
  'incarnation',
  'signal',
  'events',
  'stimuli',
  'conclusions',
] as const;
const signalFields = [
  'signalId',
  'intersectionId',
  'phaseId',
  'movementId',
  'state',
  'phaseStartedTick',
] as const;
const stimulusFields = ['kind', 'tick', 'sourceKey', 'relatedIds'] as const;
const conclusionFields = ['tick', 'opportunityId', 'outcome'] as const;
const truncationFields = ['tick', 'opportunityId', 'reason'] as const;
const closeSegmentFields = ['tick', 'segmentId', 'reason'] as const;
const tickOnlyFields = ['tick'] as const;
const optionKeys = ['maxOpportunities'];
const movementFields = ['tick', 'signalId', 'intersectionId', 'phaseId', 'movementId', 'state'];

const emptyStimulus: OpportunityStimulusView = Object.freeze({
  stopLineId: null,
  signalId: null,
  intersectionId: null,
  movementId: null,
  movementPhaseStartedTick: null,
  fromLaneId: null,
  toLaneId: null,
  relationIds: Object.freeze([]) as readonly string[],
});

function identity(value: unknown, maximum = 256): string {
  const result = text(value);
  requireContract(result.length <= maximum, 'Opportunity identity capacity exceeded');
  return result;
}

function readSignalContext(value: unknown): OpportunitySignalContext {
  const data = fields(value, signalFields);
  return Object.freeze({
    signalId: identity(data.signalId),
    intersectionId: identity(data.intersectionId),
    phaseId: identity(data.phaseId),
    movementId: identity(data.movementId),
    state: choice(data.state, signalStates),
    phaseStartedTick: readTick(data.phaseStartedTick),
  });
}

/**
 * Builds the registry's signal context from the real 036 outputs (`getMovementSignal` plus
 * `getSignal(signalId).phaseStartedTick`). Exported so a caller cannot accidentally invent the phase
 * start from the observation tick and silently break occurrence identity.
 */
export function opportunitySignalContext(
  movement: MovementSignal,
  phaseStartedTick: number,
): OpportunitySignalContext {
  const data = fields(movement, movementFields);
  readTick(data.tick);
  return readSignalContext({
    signalId: identity(data.signalId),
    intersectionId: identity(data.intersectionId),
    phaseId: identity(data.phaseId),
    movementId: identity(data.movementId),
    state: choice(data.state, signalStates),
    phaseStartedTick: readTick(phaseStartedTick),
  });
}

function readStimulus(value: unknown): OpportunityStimulus {
  const data = fields(value, stimulusFields);
  const relatedIds = list(data.relatedIds, (entry) => identity(entry));
  requireContract(
    relatedIds.length <= OPPORTUNITY_CAPACITY.relatedIdsPerStimulus,
    'Opportunity stimulus carries too many related ids',
  );
  return Object.freeze({
    kind: choice(data.kind, ['YIELD', 'LANE_CHANGE'] as const),
    tick: readTick(data.tick),
    sourceKey: identity(data.sourceKey),
    relatedIds,
  });
}

function readConclusion(value: unknown): OpportunityConclusion {
  const data = fields(value, conclusionFields);
  return Object.freeze({
    tick: readTick(data.tick),
    opportunityId: identity(data.opportunityId),
    outcome: identity(data.outcome, 64),
  });
}

const isSuccess = (outcome: OpportunityOutcome): boolean =>
  opportunitySuccessOutcomes.includes(outcome);

const kindGroup = (kind: OpportunityKind): OpportunityGroup =>
  kind === 'STOP'
    ? 'STOP'
    : kind === 'RED' || kind === 'GREEN'
      ? 'SIGNAL'
      : kind === 'YIELD'
        ? 'YIELD'
        : 'LANE_CHANGE';

/** Semantic identity parts of a stimulus, in a fixed documented order; never array positions. */
function identityParts(view: OpportunityStimulusView): readonly string[] {
  const parts: string[] = [];
  if (view.stopLineId !== null) parts.push(view.stopLineId);
  if (view.signalId !== null)
    parts.push(
      view.signalId,
      view.intersectionId!,
      view.movementId!,
      String(view.movementPhaseStartedTick!),
    );
  if (view.fromLaneId !== null) parts.push(view.fromLaneId, view.toLaneId!);
  parts.push(...view.relationIds);
  return parts;
}

function describe(record: InternalRecord): OpportunityRecord {
  return Object.freeze({
    id: record.id,
    kind: record.kind,
    state: record.state,
    outcome: record.outcome,
    result: record.result,
    truncationReason: record.truncationReason,
    vehicleId: record.vehicleId,
    incarnation: record.incarnation,
    segmentIds: Object.freeze([...record.segmentIds]),
    learningEligible: record.learningEligible,
    occurrence: record.occurrence,
    openedTick: record.openedTick,
    lastTick: record.lastTick,
    resolvedTick: record.resolvedTick,
    observationCount: record.observationCount,
    stimulus: record.stimulus,
  });
}

function recordCodeUnits(record: InternalRecord): number {
  let units = record.id.length + record.vehicleId.length + record.incarnation.length;
  for (const segment of record.segmentIds) units += segment.length;
  const stimulus = record.stimulus;
  for (const value of [
    stimulus.stopLineId,
    stimulus.signalId,
    stimulus.intersectionId,
    stimulus.movementId,
    stimulus.fromLaneId,
    stimulus.toLaneId,
  ])
    if (value !== null) units += value.length;
  for (const value of stimulus.relationIds) units += value.length;
  return units;
}

/**
 * Bounded 086 registry. Live records are never evicted; a resolved/truncated record may be retired
 * oldest-first, and the cumulative denominators survive retirement.
 */
export function createOpportunityRegistry(
  options: OpportunityRegistryOptions = {},
): OpportunityRegistry {
  const config = record(options);
  for (const key of Object.keys(config))
    requireContract(optionKeys.includes(key), 'Unknown opportunity registry option');
  const maxOpportunities =
    config.maxOpportunities === undefined
      ? OPPORTUNITY_CAPACITY.default
      : readTick(config.maxOpportunities);
  requireContract(
    maxOpportunities >= OPPORTUNITY_CAPACITY.minimum &&
      maxOpportunities <= OPPORTUNITY_CAPACITY.maximum,
    'Opportunity store capacity out of range',
  );
  requireContract(
    maxOpportunities * OPPORTUNITY_RECORD_BYTES_CEILING <= OPPORTUNITY_RECORDER_RAM_BYTES,
    'Opportunity store cannot fit the recorder RAM budget',
  );

  let disposed = false;
  let nextOccurrence = 0;
  let openedTotal = 0;
  let resolvedTotal = 0;
  let truncatedTotal = 0;
  let retiredTotal = 0;
  let rejectedTotal = 0;
  let contradictionTotal = 0;
  let observationCalls = 0;
  let skippedTicks = 0;
  let suspensions = 0;
  let resumptions = 0;
  let segmentOverflow = 0;
  let lastObservedTick: number | null = null;
  let sessionId: string | null = null;
  let worldEpoch: number | null = null;

  const retained = new Map<string, InternalRecord>();
  const order: InternalRecord[] = [];
  const enteredByGroup = new Map<string, InternalRecord>();
  const enteredBySource = new Map<string, InternalRecord>();
  const counters = new Map<
    OpportunityKind,
    {
      opened: number;
      resolved: number;
      truncated: number;
      success: number;
      failure: number;
      eligibleCertain: number;
      entered: number;
    }
  >();
  for (const kind of opportunityKinds)
    counters.set(kind, {
      opened: 0,
      resolved: 0,
      truncated: 0,
      success: 0,
      failure: 0,
      eligibleCertain: 0,
      entered: 0,
    });
  const truncatedByReason = new Map<OpportunityTruncationReason, number>();

  const alive = () => requireContract(!disposed, 'Opportunity registry disposed');

  const groupKey = (group: OpportunityGroup, vehicleId: string, incarnation: string) =>
    JSON.stringify([group, vehicleId, incarnation]);

  const evict = () => {
    while (order.length > maxOpportunities) {
      const index = order.findIndex((candidate) => candidate.state !== 'ENTERED');
      if (index < 0) return;
      const record = order.splice(index, 1)[0];
      if (record === undefined) return;
      retained.delete(record.id);
      if (enteredBySource.get(record.sourceKey) === record)
        enteredBySource.delete(record.sourceKey);
      retiredTotal += 1;
    }
  };

  const terminate = (record: InternalRecord, state: OpportunityState, tick: number) => {
    record.state = state;
    record.resolvedTick = tick;
    record.lastTick = Math.max(record.lastTick, tick);
    enteredByGroup.delete(groupKey(record.group, record.vehicleId, record.incarnation));
    enteredBySource.delete(record.sourceKey);
    counters.get(record.kind)!.entered -= 1;
  };

  /** A rollover continues the same opportunity; the observation segment is recorded, never re-identified. */
  const noteSegment = (record: InternalRecord, segmentId: string) => {
    if (record.segmentIds.includes(segmentId)) return;
    if (record.segmentIds.length >= OPPORTUNITY_SEGMENTS_PER_RECORD) {
      segmentOverflow += 1;
      return;
    }
    record.segmentIds.push(segmentId);
    if (recordCodeUnits(record) > OPPORTUNITY_IDENTITY_CODE_UNITS_CEILING) {
      record.segmentIds.pop();
      segmentOverflow += 1;
    }
  };

  const recordTruncation = (
    record: InternalRecord,
    tick: number,
    reason: OpportunityTruncationReason,
  ): boolean => {
    if (record.state !== 'ENTERED') return false;
    terminate(record, 'TRUNCATED', tick);
    record.truncationReason = reason;
    truncatedTotal += 1;
    counters.get(record.kind)!.truncated += 1;
    truncatedByReason.set(reason, (truncatedByReason.get(reason) ?? 0) + 1);
    return true;
  };

  const resolve = (record: InternalRecord, tick: number, outcome: OpportunityOutcome) => {
    if (record.state !== 'ENTERED') {
      // One opportunity can never be both a certain success and a certain failure.
      if (record.outcome !== outcome) contradictionTotal += 1;
      return;
    }
    const success = isSuccess(outcome);
    terminate(record, 'RESOLVED', tick);
    record.outcome = outcome;
    record.result = success ? 'SUCCESS' : 'FAILURE';
    resolvedTotal += 1;
    const counter = counters.get(record.kind)!;
    counter.resolved += 1;
    if (success) counter.success += 1;
    else counter.failure += 1;
    if (record.learningEligible) counter.eligibleCertain += 1;
  };

  function open(
    group: OpportunityGroup,
    kind: OpportunityKind,
    sourceKey: string,
    stimulusView: OpportunityStimulusView,
    input: {
      vehicleId: string;
      incarnation: string;
      segmentId: string;
      learningEligible: boolean;
    },
    openedTick: number,
  ): InternalRecord | null {
    const key = groupKey(group, input.vehicleId, input.incarnation);
    const previous = enteredByGroup.get(key);
    if (previous && previous.sourceKey === sourceKey) {
      previous.lastTick = Math.max(previous.lastTick, openedTick);
      previous.observationCount += 1;
      return previous;
    }
    if (previous) recordTruncation(previous, openedTick, 'SUPERSEDED');
    if (
      order.length >= maxOpportunities &&
      !order.some((candidate) => candidate.state !== 'ENTERED')
    ) {
      rejectedTotal += 1;
      return null;
    }
    const occurrence = nextOccurrence;
    nextOccurrence += 1;
    const id = createStableId(`opportunity-${kind.toLowerCase()}`, sessionId!, [
      String(worldEpoch!),
      input.vehicleId,
      input.incarnation,
      ...identityParts(stimulusView),
      String(occurrence),
    ]);
    const opened: InternalRecord = {
      id,
      kind,
      group,
      sourceKey,
      vehicleId: input.vehicleId,
      incarnation: input.incarnation,
      occurrence,
      stimulus: stimulusView,
      segmentIds: [input.segmentId],
      learningEligible: input.learningEligible,
      openedTick,
      state: 'ENTERED',
      outcome: null,
      result: null,
      truncationReason: null,
      lastTick: openedTick,
      resolvedTick: null,
      observationCount: 1,
    };
    if (recordCodeUnits(opened) > OPPORTUNITY_IDENTITY_CODE_UNITS_CEILING) {
      rejectedTotal += 1;
      return null;
    }
    retained.set(id, opened);
    order.push(opened);
    enteredByGroup.set(key, opened);
    enteredBySource.set(sourceKey, opened);
    openedTotal += 1;
    const counter = counters.get(kind)!;
    counter.opened += 1;
    counter.entered += 1;
    evict();
    return opened;
  }

  function processEvent(
    event: SimulationEvent,
    input: { vehicleId: string; incarnation: string; segmentId: string; learningEligible: boolean },
    touched: Map<string, InternalRecord>,
  ) {
    // The authoritative vehicle comes from the event payload; the caller supplies the incarnation.
    const forEvent = (vehicleId: string) => ({
      vehicleId,
      incarnation: input.incarnation,
      segmentId: input.segmentId,
      learningEligible: input.learningEligible,
    });
    if (event.type === 'STOP_APPROACH') {
      const opened = open(
        'STOP',
        'STOP',
        event.payload.opportunityId,
        Object.freeze({ ...emptyStimulus, stopLineId: event.payload.stopLineId }),
        forEvent(event.payload.vehicleId),
        event.tick,
      );
      if (opened) touched.set(opened.id, opened);
      return;
    }
    if (event.type === 'FULL_STOP' || event.type === 'STOP_LINE_CROSSED') {
      const found = enteredBySource.get(event.payload.opportunityId);
      if (!found) return;
      if (event.type === 'FULL_STOP') resolve(found, event.tick, 'STOPPED');
      // Crossing after a full stop is the normal success path, never a second outcome.
      else if (found.state === 'ENTERED') resolve(found, event.tick, 'CROSSED_WITHOUT_STOP');
      touched.set(found.id, found);
      return;
    }
    if (event.type === 'LANE_CHANGE_STARTED') {
      const opened = open(
        'LANE_CHANGE',
        'LANE_CHANGE',
        event.payload.opportunityId,
        Object.freeze({
          ...emptyStimulus,
          fromLaneId: event.payload.fromLaneId,
          toLaneId: event.payload.toLaneId,
        }),
        forEvent(event.payload.vehicleId),
        event.tick,
      );
      if (opened) touched.set(opened.id, opened);
      return;
    }
    if (event.type === 'LANE_CHANGE_COMPLETED') {
      const found = enteredBySource.get(event.payload.opportunityId);
      if (!found) return;
      resolve(found, event.tick, 'COMPLETED');
      touched.set(found.id, found);
    }
  }

  function processSignal(
    context: OpportunitySignalContext,
    input: { vehicleId: string; incarnation: string; segmentId: string; learningEligible: boolean },
    tick: number,
    touched: Map<string, InternalRecord>,
  ) {
    const previous = enteredByGroup.get(groupKey('SIGNAL', input.vehicleId, input.incarnation));
    // A phase occurrence is identified by the authoritative phase start, never the observation tick.
    const sourceKey = JSON.stringify([
      context.signalId,
      context.intersectionId,
      context.movementId,
      context.phaseStartedTick,
    ]);
    if (context.state === 'YELLOW') {
      if (previous && recordTruncation(previous, context.phaseStartedTick, 'SUPERSEDED'))
        touched.set(previous.id, previous);
      return;
    }
    if (previous && previous.sourceKey === sourceKey) {
      previous.lastTick = Math.max(previous.lastTick, tick);
      previous.observationCount += 1;
      touched.set(previous.id, previous);
      return;
    }
    if (previous && recordTruncation(previous, context.phaseStartedTick, 'SUPERSEDED'))
      touched.set(previous.id, previous);
    const opened = open(
      'SIGNAL',
      context.state,
      sourceKey,
      Object.freeze({
        ...emptyStimulus,
        signalId: context.signalId,
        intersectionId: context.intersectionId,
        movementId: context.movementId,
        movementPhaseStartedTick: context.phaseStartedTick,
      }),
      input,
      context.phaseStartedTick,
    );
    if (opened) touched.set(opened.id, opened);
  }

  function processStimulus(
    value: OpportunityStimulus,
    input: { vehicleId: string; incarnation: string; segmentId: string; learningEligible: boolean },
    touched: Map<string, InternalRecord>,
  ) {
    const opened = open(
      value.kind,
      value.kind,
      value.sourceKey,
      Object.freeze({ ...emptyStimulus, relationIds: value.relatedIds }),
      input,
      value.tick,
    );
    if (opened) touched.set(opened.id, opened);
  }

  return Object.freeze({
    version: OPPORTUNITY_VERSION,
    observe(value: OpportunityObservation): readonly OpportunityRecord[] {
      alive();
      const data = fields(value, observationFields);
      const tick = readTick(data.tick);
      const observationSession = identity(data.sessionId);
      const observationEpoch = readTick(data.worldEpoch);
      if (sessionId === null && worldEpoch === null) {
        sessionId = observationSession;
        worldEpoch = observationEpoch;
      }
      requireContract(
        observationSession === sessionId && observationEpoch === worldEpoch,
        'Opportunity observation belongs to another session or world epoch',
      );
      const segmentId = identity(data.segmentId);
      const learningEligible = boolean(data.learningEligible);
      const vehicleId = identity(data.vehicleId);
      const incarnation = identity(data.incarnation);
      if (lastObservedTick !== null) {
        requireContract(tick >= lastObservedTick, 'Opportunity observation tick regressed');
        skippedTicks += tick - lastObservedTick - 1;
      }
      lastObservedTick = tick;
      observationCalls += 1;
      const context = { vehicleId, incarnation, segmentId, learningEligible };
      const touched = new Map<string, InternalRecord>();
      for (const event of list(data.events, (entry) => parseSimulationEvent(entry)))
        processEvent(event, context, touched);
      if (data.signal !== null)
        processSignal(readSignalContext(data.signal), context, tick, touched);
      for (const entry of list(data.stimuli, readStimulus))
        processStimulus(entry, context, touched);
      for (const entry of list(data.conclusions, readConclusion)) {
        const found = retained.get(entry.opportunityId);
        requireContract(found !== undefined, 'Opportunity conclusion refers to an unknown id');
        resolve(found, entry.tick, choice(entry.outcome, opportunityOutcomeTable[found.kind]));
        touched.set(found.id, found);
      }
      for (const record of touched.values()) noteSegment(record, segmentId);
      return Object.freeze([...touched.values()].map(describe));
    },
    conclude(value: OpportunityConclusion): OpportunityRecord {
      alive();
      const entry = readConclusion(value);
      const found = retained.get(entry.opportunityId);
      requireContract(found !== undefined, 'Opportunity conclusion refers to an unknown id');
      resolve(found, entry.tick, choice(entry.outcome, opportunityOutcomeTable[found.kind]));
      return describe(found);
    },
    truncate(value: OpportunityTruncationInput) {
      alive();
      const data = fields(value, truncationFields);
      const found = retained.get(identity(data.opportunityId));
      requireContract(found !== undefined, 'Opportunity truncation refers to an unknown id');
      recordTruncation(
        found,
        readTick(data.tick),
        choice(data.reason, opportunityTruncationReasons),
      );
      return describe(found);
    },
    closeSegment(value: OpportunitySegmentCloseInput) {
      alive();
      const data = fields(value, closeSegmentFields);
      const tick = readTick(data.tick);
      const segmentIdToClose = identity(data.segmentId);
      choice(data.reason, segmentCloseReasons);
      const closed: OpportunityRecord[] = [];
      for (const candidate of order)
        if (
          candidate.state === 'ENTERED' &&
          candidate.segmentIds.includes(segmentIdToClose) &&
          recordTruncation(candidate, tick, 'SEGMENT_CLOSED')
        )
          closed.push(describe(candidate));
      return Object.freeze(closed);
    },
    suspend(value: OpportunityTickInput) {
      alive();
      const tick = readTick(fields(value, tickOnlyFields).tick);
      suspensions += 1;
      const truncated: OpportunityRecord[] = [];
      for (const candidate of order)
        if (recordTruncation(candidate, tick, 'SUSPENDED')) truncated.push(describe(candidate));
      return Object.freeze(truncated);
    },
    resume(value: OpportunityTickInput) {
      alive();
      const tick = readTick(fields(value, tickOnlyFields).tick);
      resumptions += 1;
      if (lastObservedTick !== null)
        requireContract(tick >= lastObservedTick, 'Opportunity resume tick must not regress');
      lastObservedTick = tick;
    },
    getOpportunities: () => Object.freeze(order.map(describe)),
    getOpportunity(opportunityId: string) {
      const found = retained.get(identity(opportunityId));
      return found ? describe(found) : null;
    },
    findEntered(kind: OpportunityKind, vehicleId: string, incarnation: string) {
      const found = enteredByGroup.get(
        groupKey(kindGroup(kind), identity(vehicleId), identity(incarnation)),
      );
      if (!found || found.kind !== kind) return null;
      return describe(found);
    },
    getDenominators(): OpportunityDenominators {
      let total = 0;
      let certain = 0;
      let success = 0;
      let failure = 0;
      let incomplete = 0;
      let enteredCount = 0;
      let eligibleCertain = 0;
      const byKind = opportunityKinds.map((kind) => {
        const counter = counters.get(kind)!;
        total += counter.opened;
        certain += counter.resolved;
        success += counter.success;
        failure += counter.failure;
        incomplete += counter.truncated;
        enteredCount += counter.entered;
        eligibleCertain += counter.eligibleCertain;
        return Object.freeze({
          kind,
          total: counter.opened,
          certain: counter.resolved,
          success: counter.success,
          failure: counter.failure,
          incomplete: counter.truncated,
          entered: counter.entered,
          learningEligibleCertain: counter.eligibleCertain,
        });
      });
      return Object.freeze({
        version: OPPORTUNITY_VERSION,
        total,
        certain,
        success,
        failure,
        incomplete,
        entered: enteredCount,
        learningEligibleCertain: eligibleCertain,
        byKind: Object.freeze(byKind),
        truncatedByReason: Object.freeze(
          opportunityTruncationReasons.map((reason) =>
            Object.freeze({ reason, count: truncatedByReason.get(reason) ?? 0 }),
          ),
        ),
      });
    },
    getStats(): OpportunityRegistryStats {
      let identityCodeUnits = 0;
      let enteredCount = 0;
      let resolvedCount = 0;
      let truncatedCount = 0;
      for (const candidate of order) {
        identityCodeUnits += recordCodeUnits(candidate);
        if (candidate.state === 'ENTERED') enteredCount += 1;
        else if (candidate.state === 'RESOLVED') resolvedCount += 1;
        else truncatedCount += 1;
      }
      return Object.freeze({
        version: OPPORTUNITY_VERSION,
        disposed,
        maxOpportunities,
        openedTotal,
        resolvedTotal,
        truncatedTotal,
        retiredTotal,
        rejectedTotal,
        contradictionTotal,
        observationCalls,
        skippedTicks,
        suspensions,
        resumptions,
        segmentOverflow,
        retained: order.length,
        entered: enteredCount,
        resolved: resolvedCount,
        truncated: truncatedCount,
        identityCodeUnits,
        estimatedBytes: order.length * OPPORTUNITY_BYTES_PER_RECORD + identityCodeUnits * 2,
        estimatedBytesMaximum: maxOpportunities * OPPORTUNITY_RECORD_BYTES_CEILING,
      });
    },
    dispose() {
      if (disposed) return;
      const tick = lastObservedTick ?? 0;
      for (const candidate of order) recordTruncation(candidate, tick, 'DISPOSED');
      order.length = 0;
      retained.clear();
      enteredByGroup.clear();
      enteredBySource.clear();
      disposed = true;
    },
  });
}

import { choice, createStableId, number, requireContract, text, tick } from '../sessions';
import { parseSimulationEvent } from '../simulation';
import type { EventBus, SimulationEvent } from '../simulation';
import { boundedId, plainFields, requireRequired } from './contracts';

/**
 * 199 walking tutorial: walk to a car, get in, finish the ride, get out.
 *
 * The tutorial is a mission-like progress contract with one explicit promise, copied from 117: it
 * teaches the walking and vehicle transitions **without producing learning**. It owns no clock, no
 * DOM, no renderer, no profile store, no learning job, no telemetry writer and no profile version.
 *
 * A step advances only from a real fact delivered by the module that owns it, never from time,
 * frames or a list position:
 *
 * 1. `SELECT_TAXI` - an accepted 068 taxi selection (`selectedIdentity` plus the registered kind);
 * 2. `WALK_TO_TAXI` - a real 192 walker state whose authoritative position actually moved;
 * 3. `ENTER_VEHICLE` - an accepted 195 entry (`MANUAL`, `VEHICLE:<id>`, same entity count);
 * 4. `BOARD_PASSENGER` - a validated 007 `PICKUP` for the selected taxi;
 * 5. `FINISH_RIDE` - a validated 007 `DROPOFF` for the ride that was boarded;
 * 6. `EXIT_VEHICLE` - an accepted 196 exit (`AUTO`, `CHARACTER:<id>`, route bits identical).
 *
 * Each step declares the event kind that advances it, and one step is resolved by exactly one
 * event: a wrong event is reported as ignored and changes no progress, and replaying the same event
 * identity is reported as `EVENT_ALREADY_APPLIED` instead of satisfying the next step. The walker
 * needs a baseline first, so the first observed 192 state only records where the body is; motion is
 * measured between two real authoritative positions.
 *
 * Access to the fleet is structurally untouched: the tutorial never gates, filters or disables a
 * selection, `canSelectTaxi` answers `allowed: true` for every identity, and the module returns no
 * estimator candidate, no demonstration and no profile version. A `PROFILE_ACTIVATE` event is kept
 * as evidence only. Walking time XP is not implemented here (Docs/20 permits it, this contract does
 * not simulate it): `stats().xpGranted` is structurally zero.
 */
export const WALKING_TUTORIAL_VERSION = '199-walking-tutorial-v1' as const;
export const WALKING_TUTORIAL_ID = 'tutorial-walking-enter-exit' as const;
export const WALKING_TUTORIAL_NAMESPACE = 'tutorial:199' as const;

export const WALKING_TUTORIAL_LIMITS = Object.freeze({
  version: WALKING_TUTORIAL_VERSION,
  /** Fixed authored steps; the tutorial cannot grow its own history. */
  steps: 6,
  /** Evidence event ids retained per step. */
  evidencePerStep: 4,
  /** Distinct observation identities remembered for progress idempotency (FIFO). */
  retainedObservations: 64,
  /** Authored id/label code units. */
  idCodeUnits: 256,
  instanceIdCodeUnits: 512,
});

/**
 * The published policy. It is documentation that cannot drift from the implementation: the tests
 * and the deterministic report assert every field.
 */
export const WALKING_TUTORIAL_POLICY = Object.freeze({
  contract: WALKING_TUTORIAL_VERSION,
  oneEventPerStep: true as const,
  clock: 'NONE' as const,
  frames: 'NONE' as const,
  taxiAccess: 'NEVER_GATED' as const,
  learning: 'REFUSED' as const,
  drivingXp: 'NONE' as const,
  walkingTimeXp: 'NOT_IMPLEMENTED' as const,
  eventSources: Object.freeze({
    TAXI_SELECTION: '068',
    WALKER_MOTION: '192',
    VEHICLE_ENTRY: '195',
    RIDE_PICKUP: '007',
    RIDE_DROPOFF: '007',
    VEHICLE_EXIT: '196',
  }),
});

export const walkingTutorialStepIds = [
  'SELECT_TAXI',
  'WALK_TO_TAXI',
  'ENTER_VEHICLE',
  'BOARD_PASSENGER',
  'FINISH_RIDE',
  'EXIT_VEHICLE',
] as const;
export type WalkingTutorialStepId = (typeof walkingTutorialStepIds)[number];

export const walkingTutorialEventKinds = [
  'TAXI_SELECTION',
  'WALKER_MOTION',
  'VEHICLE_ENTRY',
  'RIDE_PICKUP',
  'RIDE_DROPOFF',
  'VEHICLE_EXIT',
] as const;
export type WalkingTutorialEventKind = (typeof walkingTutorialEventKinds)[number];

export const walkingTutorialStates = ['ACTIVE', 'PAUSED', 'ABANDONED', 'COMPLETED'] as const;
export type WalkingTutorialStateName = (typeof walkingTutorialStates)[number];

export const walkingTutorialStepStates = ['PENDING', 'SATISFIED', 'SKIPPED'] as const;
export type WalkingTutorialStepState = (typeof walkingTutorialStepStates)[number];

/** Closed vocabulary for an observation that did not advance the tutorial. */
export const walkingTutorialIgnoreReasons = [
  'TUTORIAL_NOT_ACTIVE',
  'TUTORIAL_PAUSED',
  'TUTORIAL_ABANDONED',
  'TUTORIAL_COMPLETE',
  'NOT_A_TAXI',
  'NO_SELECTED_TAXI',
  'FOREIGN_VEHICLE',
  'WRONG_STEP',
  'RIDE_NOT_BOARDED',
  'UNRELATED_EVENT',
  'WALK_BASELINE_RECORDED',
  'NO_WALKER_MOTION',
  'ENTRY_REFUSED',
  'EXIT_REFUSED',
  'EVENT_ALREADY_APPLIED',
  'EVIDENCE_DROPPED',
] as const;
export type WalkingTutorialIgnoreReason = (typeof walkingTutorialIgnoreReasons)[number];

export type WalkingTutorialRequirement =
  'SELECTION' | 'WALK' | 'ENTRY' | 'PICKUP' | 'DROPOFF' | 'EXIT';

export interface WalkingTutorialStepDefinition {
  readonly stepId: WalkingTutorialStepId;
  readonly order: number;
  readonly title: string;
  readonly instruction: string;
  /** The only event kind that can satisfy this step. */
  readonly event: WalkingTutorialEventKind;
  /** Module that owns the event fact; the tutorial never derives it. */
  readonly source: '068' | '192' | '195' | '196' | '007';
  readonly requirement: WalkingTutorialRequirement;
}

export interface WalkingTutorialStepView {
  readonly stepId: WalkingTutorialStepId;
  readonly order: number;
  readonly event: WalkingTutorialEventKind;
  readonly state: WalkingTutorialStepState;
  readonly satisfiedTick: number | null;
  readonly evidenceEventIds: readonly string[];
}

export interface WalkingTutorialInstance {
  readonly instanceId: string;
  readonly tutorialId: string;
  readonly version: string;
  readonly attempt: 1;
  readonly state: WalkingTutorialStateName;
  /** Index of the current step; equals the step count when the tutorial is complete. */
  readonly stepIndex: number;
  readonly steps: readonly WalkingTutorialStepView[];
  readonly startedTick: number;
  readonly updatedTick: number;
  readonly pausedTick: number | null;
  readonly abandonedTick: number | null;
  readonly completedTick: number | null;
  readonly completedBy: 'PLAY' | 'SKIP' | null;
  /** Selected 068 taxi, or `null` before the first taxi selection. */
  readonly taxiId: string | null;
  /** Car of the accepted 195 entry, or `null` before the takeover. */
  readonly vehicleId: string | null;
  /** Ride boarded through the 007 `PICKUP`, or `null` before it. */
  readonly rideId: string | null;
  readonly lastWalkerPositionM: Readonly<{ x: number; y: number; z: number }> | null;
  /** Real 192 ticks observed while the walking step was open; evidence, never XP. */
  readonly walkingTicks: number;
  /** Real 192 displacement measured from two authoritative positions, in metres. */
  readonly walkingDistanceM: number;
  readonly skippedSteps: number;
}

export interface WalkingTutorialStartResult {
  readonly instance: WalkingTutorialInstance;
  readonly duplicate: boolean;
}

export interface WalkingTutorialObservation {
  readonly status: 'ACCEPTED' | 'IGNORED' | 'COMPLETED';
  readonly reason: WalkingTutorialIgnoreReason | null;
  /** The event kind that was observed; `null` when the tutorial was not even started. */
  readonly event: WalkingTutorialEventKind | null;
  /** The step that the observation targeted, or the current step of an ignored observation. */
  readonly stepId: WalkingTutorialStepId | null;
  readonly instance: WalkingTutorialInstance | null;
}

export interface WalkingTutorialTaxiAccess {
  readonly vehicleId: string;
  readonly allowed: true;
  readonly reason: 'TUTORIAL_NEVER_GATES_TAXI_ACCESS';
}

export interface WalkingTutorialStats {
  readonly version: string;
  readonly namespace: string;
  readonly tutorialId: string;
  readonly state: WalkingTutorialStateName | null;
  readonly stepIndex: number;
  readonly steps: number;
  readonly observations: number;
  readonly accepted: number;
  readonly ignored: number;
  readonly skippedSteps: number;
  readonly walkingTicks: number;
  readonly walkingDistanceM: number;
  /** Selections refused by the tutorial. Structurally always zero: access is never gated. */
  readonly blockedSelections: 0;
  /** Learning jobs created by the tutorial. Structurally always zero. */
  readonly learningJobs: 0;
  /** Profile versions published by the tutorial. Structurally always zero. */
  readonly profileVersions: 0;
  /** Demonstrations created by the tutorial. Structurally always zero. */
  readonly demonstrations: 0;
  /** Estimator candidates produced by the tutorial. Structurally always zero. */
  readonly estimatorCandidates: 0;
  /** `PROFILE_ACTIVATE` events observed as evidence; they never advance a step. */
  readonly learningActivationsObserved: number;
  /** XP granted by the tutorial. Structurally always zero; walking time XP is not implemented. */
  readonly xpGranted: 0;
  readonly retainedInstances: number;
  readonly disposed: boolean;
}

/** Pure, serializable document handed to PBI 200. */
export interface WalkingTutorialState {
  readonly version: typeof WALKING_TUTORIAL_VERSION;
  readonly instanceId: string;
  readonly state: WalkingTutorialStateName;
  readonly stepIndex: number;
  readonly steps: readonly Readonly<{
    stepId: WalkingTutorialStepId;
    state: WalkingTutorialStepState;
    satisfiedTick: number | null;
    evidenceEventIds: readonly string[];
  }>[];
  readonly startedTick: number;
  readonly updatedTick: number;
  readonly pausedTick: number | null;
  readonly abandonedTick: number | null;
  readonly completedTick: number | null;
  readonly completedBy: 'PLAY' | 'SKIP' | null;
  readonly taxiId: string | null;
  readonly vehicleId: string | null;
  readonly rideId: string | null;
  readonly lastWalkerPositionM: Readonly<{ x: number; y: number; z: number }> | null;
  readonly walkingTicks: number;
  readonly walkingDistanceM: number;
  readonly skippedSteps: number;
  readonly appliedEventIds: readonly string[];
  readonly observations: number;
  readonly accepted: number;
  readonly ignored: number;
  readonly learningActivationsObserved: number;
}

export interface WalkingTutorialOptions {
  readonly namespace?: string;
  readonly context?: unknown;
  /** A state produced by `snapshot()`; the strict parser validates it before resuming. */
  readonly resume?: unknown;
}

/**
 * The exact fields the tutorial reads from a real 192 state. It is a read contract, not a second
 * walker: the tutorial never integrates, writes or steps a body.
 */
export interface WalkingTutorialWalkerFact {
  readonly tick: number;
  readonly positionM: Readonly<{ x: number; y: number; z: number }>;
  readonly yawRad: number;
  readonly speedMps: number;
  readonly desiredSpeedMps: number;
  readonly clipId: string;
  readonly groundHeightM: number;
  readonly blocked: boolean;
  readonly positionWrites: number;
}

/** The 193 authority fields a 195/196 acceptance exposes. */
export interface WalkingTutorialAuthorityFact {
  readonly consumer: 'CHARACTER' | 'VEHICLE';
  readonly characterId: string | null;
  readonly vehicleId: string | null;
}

/** The exact fields the tutorial reads from an accepted 195 entry. */
export interface WalkingTutorialEntryFact {
  readonly tick: number;
  readonly vehicleId: string;
  readonly mode: 'MANUAL';
  readonly authority: WalkingTutorialAuthorityFact;
  readonly previousAuthority: WalkingTutorialAuthorityFact;
  readonly entities: Readonly<{ before: number; after: number }>;
  readonly bits: Readonly<{ before: string; after: string }>;
}

/** The exact fields the tutorial reads from an accepted 196 exit. */
export interface WalkingTutorialExitFact {
  readonly tick: number;
  readonly vehicleId: string;
  readonly mode: 'AUTO';
  readonly authority: WalkingTutorialAuthorityFact;
  readonly previousAuthority: WalkingTutorialAuthorityFact;
  readonly entities: Readonly<{ before: number; after: number }>;
  readonly bits: Readonly<{ baseline: string; released: string; identical: boolean }>;
}

export interface WalkingTutorial {
  readonly tutorialId: string;
  readonly version: string;
  readonly namespace: string;
  steps(): readonly WalkingTutorialStepDefinition[];
  start(input: unknown): WalkingTutorialStartResult;
  observeSelection(input: unknown): WalkingTutorialObservation;
  observeWalk(input: unknown): WalkingTutorialObservation;
  observeEntry(input: unknown): WalkingTutorialObservation;
  observeExit(input: unknown): WalkingTutorialObservation;
  observeRide(input: unknown): WalkingTutorialObservation;
  ingest(value: unknown): WalkingTutorialObservation;
  skip(input: unknown): WalkingTutorialInstance;
  pause(input: unknown): WalkingTutorialInstance;
  resume(input: unknown): WalkingTutorialInstance;
  abandon(input: unknown): WalkingTutorialInstance;
  instance(): WalkingTutorialInstance | null;
  snapshot(): WalkingTutorialState | null;
  canSelectTaxi(vehicleId: unknown): WalkingTutorialTaxiAccess;
  stats(): WalkingTutorialStats;
  attachBus(bus: EventBus): () => void;
  dispose(): void;
}

interface MutableStep {
  readonly definition: WalkingTutorialStepDefinition;
  state: WalkingTutorialStepState;
  satisfiedTick: number | null;
  readonly evidenceEventIds: string[];
}

interface MutableInstance {
  readonly instanceId: string;
  state: WalkingTutorialStateName;
  stepIndex: number;
  readonly steps: MutableStep[];
  readonly startedTick: number;
  updatedTick: number;
  pausedTick: number | null;
  abandonedTick: number | null;
  completedTick: number | null;
  completedBy: 'PLAY' | 'SKIP' | null;
  taxiId: string | null;
  vehicleId: string | null;
  rideId: string | null;
  lastWalkerPositionM: Readonly<{ x: number; y: number; z: number }> | null;
  walkingTicks: number;
  walkingDistanceM: number;
  skippedSteps: number;
}

const stepDefinitions: readonly WalkingTutorialStepDefinition[] = Object.freeze([
  Object.freeze({
    stepId: 'SELECT_TAXI' as const,
    order: 1,
    title: 'Alege un taxi',
    instruction:
      'Alege orice taxi din listă sau din lume. Toate taxiurile rămân disponibile, indiferent de progresul tutorialului.',
    event: 'TAXI_SELECTION' as const,
    source: '068' as const,
    requirement: 'SELECTION' as const,
  }),
  Object.freeze({
    stepId: 'WALK_TO_TAXI' as const,
    order: 2,
    title: 'Mergi până la taxi',
    instruction: 'Deplasează personajul cu W/A/S/D până când poziția autoritară chiar se schimbă.',
    event: 'WALKER_MOTION' as const,
    source: '192' as const,
    requirement: 'WALK' as const,
  }),
  Object.freeze({
    stepId: 'ENTER_VEHICLE' as const,
    order: 3,
    title: 'Intră în mașină',
    instruction:
      'Apropie-te de portiera stângă și apasă E. Intrarea acceptată trece mașina în MANUAL.',
    event: 'VEHICLE_ENTRY' as const,
    source: '195' as const,
    requirement: 'ENTRY' as const,
  }),
  Object.freeze({
    stepId: 'BOARD_PASSENGER' as const,
    order: 4,
    title: 'Ia pasagerul',
    instruction: 'Oprește la punctul de ridicare până când cursa este îmbarcată.',
    event: 'RIDE_PICKUP' as const,
    source: '007' as const,
    requirement: 'PICKUP' as const,
  }),
  Object.freeze({
    stepId: 'FINISH_RIDE' as const,
    order: 5,
    title: 'Du pasagerul la destinație',
    instruction:
      'Finalizează cursa îmbarcată; coborârea pasagerului este faptul care bifează pasul.',
    event: 'RIDE_DROPOFF' as const,
    source: '007' as const,
    requirement: 'DROPOFF' as const,
  }),
  Object.freeze({
    stepId: 'EXIT_VEHICLE' as const,
    order: 6,
    title: 'Coboară din mașină',
    instruction:
      'Apasă E ca să cobori. Ieșirea acceptată readuce autoritatea la personaj și mașina în AUTO.',
    event: 'VEHICLE_EXIT' as const,
    source: '196' as const,
    requirement: 'EXIT' as const,
  }),
]);

const vehicleKinds = ['TAXI', 'CIVIL'] as const;
const walkerFields = [
  'tick',
  'positionM',
  'yawRad',
  'speedMps',
  'desiredSpeedMps',
  'clipId',
  'groundHeightM',
  'blocked',
  'positionWrites',
] as const;
const pointFields = ['x', 'y', 'z'] as const;
const entryFields = [
  'accepted',
  'tick',
  'vehicleId',
  'code',
  'detail',
  'distanceM',
  'doorM',
  'blockerId',
  'authority',
  'previousAuthority',
  'previousMode',
  'mode',
  'vehicle',
  'character',
  'door',
  'entities',
  'camera',
  'bits',
  'journal',
] as const;
const exitFields = [
  'accepted',
  'tick',
  'vehicleId',
  'code',
  'detail',
  'speedMps',
  'candidates',
  'authority',
  'previousAuthority',
  'character',
  'start',
  'vehicle',
  'previousMode',
  'baselineMode',
  'mode',
  'exit',
  'entities',
  'camera',
  'bits',
  'journal',
] as const;
const eventFields = [
  'schemaVersion',
  'units',
  'sessionId',
  'worldEpoch',
  'eventId',
  'tick',
  'entityIds',
  'type',
  'payload',
];
const startFields = ['tick'] as const;
const timeFields = ['tick'] as const;
const selectionFields = ['tick', 'vehicleId', 'kind'] as const;
const skipFields = ['tick', 'stepId'] as const;
const optionFields = ['namespace', 'context', 'resume'] as const;
const contextFields = ['sessionId', 'worldEpoch'] as const;
const stateDocumentFields = [
  'version',
  'instanceId',
  'state',
  'stepIndex',
  'steps',
  'startedTick',
  'updatedTick',
  'pausedTick',
  'abandonedTick',
  'completedTick',
  'completedBy',
  'taxiId',
  'vehicleId',
  'rideId',
  'lastWalkerPositionM',
  'walkingTicks',
  'walkingDistanceM',
  'skippedSteps',
  'appliedEventIds',
  'observations',
  'accepted',
  'ignored',
  'learningActivationsObserved',
] as const;
const stateStepFields = ['stepId', 'state', 'satisfiedTick', 'evidenceEventIds'] as const;
const completedByValues = ['PLAY', 'SKIP'] as const;

function stepView(step: MutableStep): WalkingTutorialStepView {
  return Object.freeze({
    stepId: step.definition.stepId,
    order: step.definition.order,
    event: step.definition.event,
    state: step.state,
    satisfiedTick: step.satisfiedTick,
    evidenceEventIds: Object.freeze([...step.evidenceEventIds]),
  });
}

function instanceView(instance: MutableInstance): WalkingTutorialInstance {
  return Object.freeze({
    instanceId: instance.instanceId,
    tutorialId: WALKING_TUTORIAL_ID,
    version: WALKING_TUTORIAL_VERSION,
    attempt: 1 as const,
    state: instance.state,
    stepIndex: instance.stepIndex,
    steps: Object.freeze(instance.steps.map(stepView)),
    startedTick: instance.startedTick,
    updatedTick: instance.updatedTick,
    pausedTick: instance.pausedTick,
    abandonedTick: instance.abandonedTick,
    completedTick: instance.completedTick,
    completedBy: instance.completedBy,
    taxiId: instance.taxiId,
    vehicleId: instance.vehicleId,
    rideId: instance.rideId,
    lastWalkerPositionM: instance.lastWalkerPositionM,
    walkingTicks: instance.walkingTicks,
    walkingDistanceM: instance.walkingDistanceM,
    skippedSteps: instance.skippedSteps,
  });
}

function tutorialInstanceId(namespace: string): string {
  const id = createStableId('mission-walking-tutorial', namespace, [WALKING_TUTORIAL_ID, 'a0001']);
  requireContract(
    id.length <= WALKING_TUTORIAL_LIMITS.instanceIdCodeUnits,
    'Walking tutorial instance identity exceeds the code-unit limit',
  );
  return id;
}

function readPoint(value: unknown, label: string): Readonly<{ x: number; y: number; z: number }> {
  const data = plainFields(value, pointFields, label);
  for (const key of pointFields) requireRequired(data, key, label);
  return Object.freeze({ x: number(data.x), y: number(data.y), z: number(data.z) });
}

function readWalkerFact(input: unknown): WalkingTutorialWalkerFact {
  const state = plainFields(input, walkerFields, 'walker state');
  for (const key of walkerFields) requireRequired(state, key, 'walker state');
  const positionWrites = tick(state.positionWrites);
  requireContract(
    positionWrites >= 1,
    'A walker state owns at least its initial authoritative write',
  );
  requireContract(typeof state.clipId === 'string' && state.clipId.length > 0, 'Walker clip id');
  requireContract(typeof state.blocked === 'boolean', 'Walker blocked flag');
  return Object.freeze({
    tick: tick(state.tick),
    positionM: readPoint(state.positionM, 'walker position'),
    yawRad: number(state.yawRad),
    speedMps: number(state.speedMps, 0),
    desiredSpeedMps: number(state.desiredSpeedMps, 0),
    clipId: state.clipId,
    groundHeightM: number(state.groundHeightM),
    blocked: state.blocked,
    positionWrites,
  });
}

function readAuthorityFact(value: unknown, label: string): WalkingTutorialAuthorityFact {
  const data = plainFields(value, ['consumer', 'characterId', 'vehicleId'], label);
  requireRequired(data, 'consumer', label);
  const consumer = choice(data.consumer, ['CHARACTER', 'VEHICLE']);
  return Object.freeze({
    consumer,
    characterId:
      consumer === 'CHARACTER'
        ? boundedId(data.characterId, WALKING_TUTORIAL_LIMITS.idCodeUnits, label)
        : null,
    vehicleId:
      consumer === 'VEHICLE'
        ? boundedId(data.vehicleId, WALKING_TUTORIAL_LIMITS.idCodeUnits, label)
        : null,
  });
}

function readEntityCounts(
  value: unknown,
  label: string,
): Readonly<{ before: number; after: number }> {
  const data = plainFields(value, ['before', 'after', 'vehicles', 'characters'], label);
  for (const key of ['before', 'after'] as const) requireRequired(data, key, label);
  return Object.freeze({ before: tick(data.before), after: tick(data.after) });
}

function readEntryFact(input: unknown): WalkingTutorialEntryFact {
  const data = plainFields(input, entryFields, 'vehicle entry decision');
  for (const key of [
    'accepted',
    'tick',
    'vehicleId',
    'mode',
    'authority',
    'previousAuthority',
    'entities',
    'bits',
  ] as const)
    requireRequired(data, key, 'vehicle entry acceptance');
  const bits = plainFields(data.bits, ['before', 'after'], 'vehicle entry bits');
  for (const key of ['before', 'after'] as const) requireRequired(bits, key, 'vehicle entry bits');
  return Object.freeze({
    tick: tick(data.tick),
    vehicleId: boundedId(
      data.vehicleId,
      WALKING_TUTORIAL_LIMITS.idCodeUnits,
      'walking tutorial vehicle',
    ),
    mode: choice(data.mode, ['MANUAL']),
    authority: readAuthorityFact(data.authority, 'vehicle entry authority'),
    previousAuthority: readAuthorityFact(
      data.previousAuthority,
      'vehicle entry previous authority',
    ),
    entities: readEntityCounts(data.entities, 'vehicle entry entities'),
    bits: Object.freeze({ before: text(bits.before), after: text(bits.after) }),
  });
}

function readExitFact(input: unknown): WalkingTutorialExitFact {
  const data = plainFields(input, exitFields, 'vehicle exit decision');
  for (const key of [
    'accepted',
    'tick',
    'vehicleId',
    'mode',
    'authority',
    'previousAuthority',
    'entities',
    'bits',
  ] as const)
    requireRequired(data, key, 'vehicle exit acceptance');
  const bits = plainFields(data.bits, ['baseline', 'released', 'identical'], 'vehicle exit bits');
  for (const key of ['baseline', 'released', 'identical'] as const)
    requireRequired(bits, key, 'vehicle exit bits');
  requireContract(typeof bits.identical === 'boolean', 'Vehicle exit bit identity flag');
  return Object.freeze({
    tick: tick(data.tick),
    vehicleId: boundedId(
      data.vehicleId,
      WALKING_TUTORIAL_LIMITS.idCodeUnits,
      'walking tutorial vehicle',
    ),
    mode: choice(data.mode, ['AUTO']),
    authority: readAuthorityFact(data.authority, 'vehicle exit authority'),
    previousAuthority: readAuthorityFact(data.previousAuthority, 'vehicle exit previous authority'),
    entities: readEntityCounts(data.entities, 'vehicle exit entities'),
    bits: Object.freeze({
      baseline: text(bits.baseline),
      released: text(bits.released),
      identical: bits.identical,
    }),
  });
}

/** Identity of an observed 192 state; a repeated position at the same tick is the same fact. */
function walkEvidenceId(atTick: number, movedM: number): string {
  return `walk:${atTick}:${movedM.toFixed(6)}`;
}

export function createWalkingTutorial(options: unknown = {}): WalkingTutorial {
  const option = plainFields(options, optionFields, 'walking tutorial option');
  const namespace =
    option.namespace === undefined
      ? WALKING_TUTORIAL_NAMESPACE
      : boundedId(
          option.namespace,
          WALKING_TUTORIAL_LIMITS.idCodeUnits,
          'walking tutorial namespace',
        );
  let expectedContext: { readonly sessionId: string; readonly worldEpoch: number } | null = null;
  if (option.context !== undefined) {
    const data = plainFields(option.context, contextFields, 'walking tutorial context');
    for (const key of contextFields) requireRequired(data, key, 'walking tutorial context');
    expectedContext = Object.freeze({
      sessionId: text(data.sessionId),
      worldEpoch: tick(data.worldEpoch),
    });
  }

  let instance: MutableInstance | null = null;
  let lastTick = 0;
  let observations = 0;
  let accepted = 0;
  let ignored = 0;
  let learningActivationsObserved = 0;
  let unsubscribe: (() => void) | null = null;
  let disposed = false;
  let busy = false;
  const appliedEventIds: string[] = [];

  const mutate = <T>(operation: () => T): T => {
    requireContract(!busy, 'Walking tutorial mutation reentrant');
    requireContract(!disposed, 'Walking tutorial disposed');
    busy = true;
    try {
      return operation();
    } finally {
      busy = false;
    }
  };

  const assertTick = (value: unknown): number => {
    const atTick = tick(value);
    if (atTick < lastTick) throw new RangeError('Stale walking tutorial tick');
    lastTick = atTick;
    return atTick;
  };

  const currentStep = (): MutableStep | null =>
    instance === null || instance.stepIndex >= instance.steps.length
      ? null
      : instance.steps[instance.stepIndex]!;

  const rememberEvidence = (step: MutableStep, eventId: string): void => {
    if (step.evidenceEventIds.includes(eventId)) return;
    step.evidenceEventIds.push(eventId);
    while (step.evidenceEventIds.length > WALKING_TUTORIAL_LIMITS.evidencePerStep)
      step.evidenceEventIds.shift();
  };

  const rememberObservation = (eventId: string): void => {
    if (appliedEventIds.includes(eventId)) return;
    appliedEventIds.push(eventId);
    while (appliedEventIds.length > WALKING_TUTORIAL_LIMITS.retainedObservations)
      appliedEventIds.shift();
  };

  const complete = (completedBy: 'PLAY' | 'SKIP', atTick: number): void => {
    const live = instance!;
    live.state = 'COMPLETED';
    live.stepIndex = live.steps.length;
    live.completedBy = completedBy;
    live.completedTick = atTick;
    live.updatedTick = atTick;
    live.pausedTick = null;
  };

  const advance = (step: MutableStep, atTick: number, evidenceId: string): boolean => {
    const live = instance!;
    requireContract(step.state === 'PENDING', 'Walking tutorial step already resolved');
    step.state = 'SATISFIED';
    step.satisfiedTick = atTick;
    rememberEvidence(step, evidenceId);
    rememberObservation(evidenceId);
    live.updatedTick = atTick;
    live.stepIndex += 1;
    if (live.stepIndex >= live.steps.length) {
      complete('PLAY', atTick);
      return true;
    }
    return false;
  };

  const ignoredResult = (
    reason: WalkingTutorialIgnoreReason,
    event: WalkingTutorialEventKind | null,
  ): WalkingTutorialObservation => {
    ignored += 1;
    return Object.freeze({
      status: 'IGNORED' as const,
      reason,
      event,
      stepId: currentStep()?.definition.stepId ?? null,
      instance: instance === null ? null : instanceView(instance),
    });
  };

  const idleResult = (
    reason: WalkingTutorialIgnoreReason,
    event: WalkingTutorialEventKind | null,
  ): WalkingTutorialObservation => {
    ignored += 1;
    return Object.freeze({
      status: 'IGNORED' as const,
      reason,
      event,
      stepId: null,
      instance: null,
    });
  };

  const acceptedResult = (
    stepId: WalkingTutorialStepId,
    event: WalkingTutorialEventKind,
    completed: boolean,
  ): WalkingTutorialObservation => {
    accepted += 1;
    return Object.freeze({
      status: completed ? ('COMPLETED' as const) : ('ACCEPTED' as const),
      reason: null,
      event,
      stepId,
      instance: instance === null ? null : instanceView(instance),
    });
  };

  /** Shared gate: a resolved, paused, abandoned or finished tutorial never advances. */
  const gate = (event: WalkingTutorialEventKind): WalkingTutorialObservation | null => {
    const live = instance;
    if (live === null) return idleResult('TUTORIAL_NOT_ACTIVE', event);
    if (live.state === 'PAUSED') return ignoredResult('TUTORIAL_PAUSED', event);
    if (live.state === 'ABANDONED') return ignoredResult('TUTORIAL_ABANDONED', event);
    if (live.state === 'COMPLETED') return ignoredResult('TUTORIAL_COMPLETE', event);
    return null;
  };

  function start(input: unknown): WalkingTutorialStartResult {
    return mutate(() => {
      const data = plainFields(input, startFields, 'walking tutorial start');
      requireRequired(data, 'tick', 'walking tutorial start');
      const atTick = assertTick(data.tick);
      if (instance !== null) {
        requireContract(instance.state !== 'COMPLETED', 'Walking tutorial is already complete');
        return Object.freeze({ instance: instanceView(instance), duplicate: true });
      }
      instance = {
        instanceId: tutorialInstanceId(namespace),
        state: 'ACTIVE',
        stepIndex: 0,
        steps: stepDefinitions.map((definition) => ({
          definition,
          state: 'PENDING' as const,
          satisfiedTick: null,
          evidenceEventIds: [],
        })),
        startedTick: atTick,
        updatedTick: atTick,
        pausedTick: null,
        abandonedTick: null,
        completedTick: null,
        completedBy: null,
        taxiId: null,
        vehicleId: null,
        rideId: null,
        lastWalkerPositionM: null,
        walkingTicks: 0,
        walkingDistanceM: 0,
        skippedSteps: 0,
      };
      appliedEventIds.length = 0;
      return Object.freeze({ instance: instanceView(instance), duplicate: false });
    });
  }

  function observeSelection(input: unknown): WalkingTutorialObservation {
    return mutate(() => {
      const data = plainFields(input, selectionFields, 'walking tutorial selection');
      for (const key of selectionFields) requireRequired(data, key, 'walking tutorial selection');
      const atTick = assertTick(data.tick);
      const vehicleId = boundedId(
        data.vehicleId,
        WALKING_TUTORIAL_LIMITS.idCodeUnits,
        'walking tutorial vehicle',
      );
      const kind = choice(data.kind, vehicleKinds);
      observations += 1;
      const blocked = gate('TAXI_SELECTION');
      if (blocked !== null) return blocked;
      if (kind === 'CIVIL') return ignoredResult('NOT_A_TAXI', 'TAXI_SELECTION');
      const evidenceId = `selection:${atTick}:${vehicleId}`;
      if (appliedEventIds.includes(evidenceId))
        return ignoredResult('EVENT_ALREADY_APPLIED', 'TAXI_SELECTION');
      const live = instance!;
      const step = currentStep();
      if (step === null) return ignoredResult('TUTORIAL_NOT_ACTIVE', 'TAXI_SELECTION');
      if (step.definition.requirement !== 'SELECTION')
        return ignoredResult('WRONG_STEP', 'TAXI_SELECTION');
      if (evidenceId.length > WALKING_TUTORIAL_LIMITS.idCodeUnits)
        return ignoredResult('EVIDENCE_DROPPED', 'TAXI_SELECTION');
      live.taxiId = vehicleId;
      const completed = advance(step, atTick, evidenceId);
      return acceptedResult(step.definition.stepId, 'TAXI_SELECTION', completed);
    });
  }

  function observeWalk(input: unknown): WalkingTutorialObservation {
    return mutate(() => {
      const walker = readWalkerFact(input);
      const atTick = assertTick(walker.tick);
      const positionM = walker.positionM;
      observations += 1;
      const blocked = gate('WALKER_MOTION');
      if (blocked !== null) return blocked;
      const step = currentStep();
      if (step === null) return ignoredResult('TUTORIAL_NOT_ACTIVE', 'WALKER_MOTION');
      if (step.definition.requirement !== 'WALK')
        return ignoredResult('WRONG_STEP', 'WALKER_MOTION');
      const live = instance!;
      if (live.lastWalkerPositionM === null) {
        live.lastWalkerPositionM = positionM;
        live.updatedTick = atTick;
        return ignoredResult('WALK_BASELINE_RECORDED', 'WALKER_MOTION');
      }
      const previous = live.lastWalkerPositionM;
      const movedM = Math.hypot(positionM.x - previous.x, positionM.z - previous.z);
      live.lastWalkerPositionM = positionM;
      live.walkingTicks += 1;
      live.walkingDistanceM += movedM;
      live.updatedTick = atTick;
      if (movedM <= 0) return ignoredResult('NO_WALKER_MOTION', 'WALKER_MOTION');
      const evidenceId = walkEvidenceId(atTick, movedM);
      if (appliedEventIds.includes(evidenceId))
        return ignoredResult('EVENT_ALREADY_APPLIED', 'WALKER_MOTION');
      const completed = advance(step, atTick, evidenceId);
      return acceptedResult(step.definition.stepId, 'WALKER_MOTION', completed);
    });
  }

  function observeEntry(input: unknown): WalkingTutorialObservation {
    return mutate(() => {
      const data = plainFields(input, entryFields, 'vehicle entry decision');
      requireRequired(data, 'accepted', 'vehicle entry decision');
      requireRequired(data, 'tick', 'vehicle entry decision');
      const atTick = assertTick(data.tick);
      observations += 1;
      const blocked = gate('VEHICLE_ENTRY');
      if (blocked !== null) return blocked;
      if (data.accepted !== true) return ignoredResult('ENTRY_REFUSED', 'VEHICLE_ENTRY');
      const decision = readEntryFact(input);
      // A real 195 acceptance carries the single 193 authority and an unchanged world.
      requireContract(
        decision.mode === 'MANUAL',
        'Walking tutorial entry must be the 195 MANUAL mode',
      );
      requireContract(
        decision.authority.consumer === 'VEHICLE' &&
          decision.authority.vehicleId === decision.vehicleId,
        'Walking tutorial entry authority must name the entered car',
      );
      requireContract(
        decision.previousAuthority.consumer === 'CHARACTER',
        'Walking tutorial entry must leave a character authority',
      );
      requireContract(
        decision.entities.before === decision.entities.after,
        'Walking tutorial entry must not create an entity',
      );
      requireContract(
        decision.bits.before === decision.bits.after,
        'Walking tutorial entry must preserve the car state bit for bit',
      );
      const live = instance!;
      const evidenceId = `entry:${atTick}:${decision.vehicleId}`;
      if (appliedEventIds.includes(evidenceId))
        return ignoredResult('EVENT_ALREADY_APPLIED', 'VEHICLE_ENTRY');
      if (live.taxiId !== decision.vehicleId)
        return ignoredResult('FOREIGN_VEHICLE', 'VEHICLE_ENTRY');
      const step = currentStep();
      if (step === null) return ignoredResult('TUTORIAL_NOT_ACTIVE', 'VEHICLE_ENTRY');
      if (step.definition.requirement !== 'ENTRY')
        return ignoredResult('WRONG_STEP', 'VEHICLE_ENTRY');
      live.vehicleId = decision.vehicleId;
      const completed = advance(step, atTick, evidenceId);
      return acceptedResult(step.definition.stepId, 'VEHICLE_ENTRY', completed);
    });
  }

  function observeExit(input: unknown): WalkingTutorialObservation {
    return mutate(() => {
      const data = plainFields(input, exitFields, 'vehicle exit decision');
      requireRequired(data, 'accepted', 'vehicle exit decision');
      requireRequired(data, 'tick', 'vehicle exit decision');
      const atTick = assertTick(data.tick);
      observations += 1;
      const blocked = gate('VEHICLE_EXIT');
      if (blocked !== null) return blocked;
      if (data.accepted !== true) return ignoredResult('EXIT_REFUSED', 'VEHICLE_EXIT');
      const decision = readExitFact(input);
      requireContract(decision.mode === 'AUTO', 'Walking tutorial exit must be the 196 AUTO mode');
      requireContract(
        decision.authority.consumer === 'CHARACTER',
        'Walking tutorial exit must return a character authority',
      );
      requireContract(
        decision.previousAuthority.consumer === 'VEHICLE' &&
          decision.previousAuthority.vehicleId === decision.vehicleId,
        'Walking tutorial exit must release the controlled car',
      );
      requireContract(
        decision.entities.before === decision.entities.after,
        'Walking tutorial exit must not create an entity',
      );
      requireContract(
        decision.bits.identical === true && decision.bits.baseline === decision.bits.released,
        'Walking tutorial exit must restore the pre-takeover car state bit for bit',
      );
      const live = instance!;
      const evidenceId = `exit:${atTick}:${decision.vehicleId}`;
      if (appliedEventIds.includes(evidenceId))
        return ignoredResult('EVENT_ALREADY_APPLIED', 'VEHICLE_EXIT');
      if (live.vehicleId !== decision.vehicleId)
        return ignoredResult('FOREIGN_VEHICLE', 'VEHICLE_EXIT');
      const step = currentStep();
      if (step === null) return ignoredResult('TUTORIAL_NOT_ACTIVE', 'VEHICLE_EXIT');
      if (step.definition.requirement !== 'EXIT')
        return ignoredResult('WRONG_STEP', 'VEHICLE_EXIT');
      const completed = advance(step, atTick, evidenceId);
      return acceptedResult(step.definition.stepId, 'VEHICLE_EXIT', completed);
    });
  }

  function observeRide(value: unknown): WalkingTutorialObservation {
    return mutate(() => {
      const data = plainFields(value, eventFields, 'walking tutorial ride event');
      requireRequired(data, 'type', 'walking tutorial ride event');
      const event = parseSimulationEvent(value);
      if (expectedContext !== null)
        requireContract(
          event.sessionId === expectedContext.sessionId &&
            event.worldEpoch === expectedContext.worldEpoch,
          'Foreign walking tutorial event world',
        );
      const atTick = assertTick(event.tick);
      observations += 1;
      const kind: WalkingTutorialEventKind =
        event.type === 'PICKUP' ? 'RIDE_PICKUP' : 'RIDE_DROPOFF';
      if (event.type === 'PROFILE_ACTIVATE') return rideEvidence(event);
      const blocked = gate(kind);
      if (blocked !== null) return blocked;
      if (event.type !== 'PICKUP' && event.type !== 'DROPOFF')
        return ignoredResult('UNRELATED_EVENT', null);
      if (appliedEventIds.includes(event.eventId))
        return ignoredResult('EVENT_ALREADY_APPLIED', kind);
      const live = instance!;
      if (live.taxiId === null) return ignoredResult('NO_SELECTED_TAXI', kind);
      if (event.payload.vehicleId !== live.taxiId) return ignoredResult('FOREIGN_VEHICLE', kind);
      if (event.type === 'DROPOFF') {
        if (live.rideId === null || live.rideId !== event.payload.rideId)
          return ignoredResult('RIDE_NOT_BOARDED', kind);
      }
      const step = currentStep();
      if (step === null) return ignoredResult('TUTORIAL_NOT_ACTIVE', kind);
      if (step.definition.event !== kind) return ignoredResult('WRONG_STEP', kind);
      if (event.type === 'PICKUP') live.rideId = event.payload.rideId;
      live.updatedTick = atTick;
      const completed = advance(step, atTick, event.eventId);
      return acceptedResult(step.definition.stepId, kind, completed);
    });
  }

  /** A `PROFILE_ACTIVATE` is evidence about the world, never progress and never a learning job. */
  function rideEvidence(event: SimulationEvent): WalkingTutorialObservation {
    if (event.type === 'PROFILE_ACTIVATE') learningActivationsObserved += 1;
    return ignoredResult('UNRELATED_EVENT', null);
  }

  function ingest(value: unknown): WalkingTutorialObservation {
    return observeRide(value);
  }

  function skip(input: unknown): WalkingTutorialInstance {
    return mutate(() => {
      const data = plainFields(input, skipFields, 'walking tutorial skip');
      for (const key of skipFields) requireRequired(data, key, 'walking tutorial skip');
      const atTick = assertTick(data.tick);
      const live = instance;
      requireContract(live !== null, 'Walking tutorial has not started');
      requireContract(live.state === 'ACTIVE', 'Only an active walking tutorial can skip');
      if (data.stepId === 'ALL') {
        for (let index = live.stepIndex; index < live.steps.length; index += 1) {
          const step = live.steps[index]!;
          step.state = 'SKIPPED';
          step.satisfiedTick = atTick;
          live.skippedSteps += 1;
        }
        complete('SKIP', atTick);
        return instanceView(live);
      }
      const stepId = choice(data.stepId, walkingTutorialStepIds);
      const step = currentStep();
      requireContract(step !== null, 'Walking tutorial has no current step');
      requireContract(
        step.definition.stepId === stepId,
        'Only the current walking tutorial step can skip',
      );
      step.state = 'SKIPPED';
      step.satisfiedTick = atTick;
      live.skippedSteps += 1;
      live.updatedTick = atTick;
      live.stepIndex += 1;
      if (live.stepIndex >= live.steps.length) complete('SKIP', atTick);
      return instanceView(live);
    });
  }

  function pause(input: unknown): WalkingTutorialInstance {
    return mutate(() => {
      const data = plainFields(input, timeFields, 'walking tutorial pause');
      requireRequired(data, 'tick', 'walking tutorial pause');
      const atTick = assertTick(data.tick);
      const live = instance;
      requireContract(live !== null, 'Walking tutorial has not started');
      requireContract(live.state === 'ACTIVE', 'Only an active walking tutorial can pause');
      live.state = 'PAUSED';
      live.pausedTick = atTick;
      live.updatedTick = atTick;
      return instanceView(live);
    });
  }

  function resume(input: unknown): WalkingTutorialInstance {
    return mutate(() => {
      const data = plainFields(input, timeFields, 'walking tutorial resume');
      requireRequired(data, 'tick', 'walking tutorial resume');
      const atTick = assertTick(data.tick);
      const live = instance;
      requireContract(live !== null, 'Walking tutorial has not started');
      requireContract(live.state === 'PAUSED', 'Only a paused walking tutorial can resume');
      live.state = 'ACTIVE';
      live.pausedTick = null;
      live.updatedTick = atTick;
      return instanceView(live);
    });
  }

  /** Stops the attempt without completing it; the partial progress is kept as evidence. */
  function abandon(input: unknown): WalkingTutorialInstance {
    return mutate(() => {
      const data = plainFields(input, timeFields, 'walking tutorial abandon');
      requireRequired(data, 'tick', 'walking tutorial abandon');
      const atTick = assertTick(data.tick);
      const live = instance;
      requireContract(live !== null, 'Walking tutorial has not started');
      requireContract(
        live.state === 'ACTIVE' || live.state === 'PAUSED',
        'Only an unfinished walking tutorial can be abandoned',
      );
      live.state = 'ABANDONED';
      live.abandonedTick = atTick;
      live.pausedTick = null;
      live.updatedTick = atTick;
      return instanceView(live);
    });
  }

  function snapshot(): WalkingTutorialState | null {
    if (disposed || instance === null) return null;
    return Object.freeze({
      version: WALKING_TUTORIAL_VERSION,
      instanceId: instance.instanceId,
      state: instance.state,
      stepIndex: instance.stepIndex,
      steps: Object.freeze(
        instance.steps.map((step) =>
          Object.freeze({
            stepId: step.definition.stepId,
            state: step.state,
            satisfiedTick: step.satisfiedTick,
            evidenceEventIds: Object.freeze([...step.evidenceEventIds]),
          }),
        ),
      ),
      startedTick: instance.startedTick,
      updatedTick: instance.updatedTick,
      pausedTick: instance.pausedTick,
      abandonedTick: instance.abandonedTick,
      completedTick: instance.completedTick,
      completedBy: instance.completedBy,
      taxiId: instance.taxiId,
      vehicleId: instance.vehicleId,
      rideId: instance.rideId,
      lastWalkerPositionM: instance.lastWalkerPositionM,
      walkingTicks: instance.walkingTicks,
      walkingDistanceM: instance.walkingDistanceM,
      skippedSteps: instance.skippedSteps,
      appliedEventIds: Object.freeze([...appliedEventIds]),
      observations,
      accepted,
      ignored,
      learningActivationsObserved,
    });
  }

  function stats(): WalkingTutorialStats {
    return Object.freeze({
      version: WALKING_TUTORIAL_VERSION,
      namespace,
      tutorialId: WALKING_TUTORIAL_ID,
      state: disposed || instance === null ? null : instance.state,
      stepIndex: disposed || instance === null ? 0 : instance.stepIndex,
      steps: WALKING_TUTORIAL_LIMITS.steps,
      observations: disposed ? 0 : observations,
      accepted: disposed ? 0 : accepted,
      ignored: disposed ? 0 : ignored,
      skippedSteps: disposed || instance === null ? 0 : instance.skippedSteps,
      walkingTicks: disposed || instance === null ? 0 : instance.walkingTicks,
      walkingDistanceM: disposed || instance === null ? 0 : instance.walkingDistanceM,
      blockedSelections: 0 as const,
      learningJobs: 0 as const,
      profileVersions: 0 as const,
      demonstrations: 0 as const,
      estimatorCandidates: 0 as const,
      learningActivationsObserved: disposed ? 0 : learningActivationsObserved,
      xpGranted: 0 as const,
      retainedInstances: disposed || instance === null ? 0 : 1,
      disposed,
    });
  }

  if (option.resume !== undefined) {
    const resumed = parseWalkingTutorialState(option.resume);
    instance = {
      instanceId: resumed.instanceId,
      state: resumed.state,
      stepIndex: resumed.stepIndex,
      steps: resumed.steps.map((step) => ({
        definition: stepDefinitions.find((entry) => entry.stepId === step.stepId)!,
        state: step.state,
        satisfiedTick: step.satisfiedTick,
        evidenceEventIds: [...step.evidenceEventIds],
      })),
      startedTick: resumed.startedTick,
      updatedTick: resumed.updatedTick,
      pausedTick: resumed.pausedTick,
      abandonedTick: resumed.abandonedTick,
      completedTick: resumed.completedTick,
      completedBy: resumed.completedBy,
      taxiId: resumed.taxiId,
      vehicleId: resumed.vehicleId,
      rideId: resumed.rideId,
      lastWalkerPositionM: resumed.lastWalkerPositionM,
      walkingTicks: resumed.walkingTicks,
      walkingDistanceM: resumed.walkingDistanceM,
      skippedSteps: resumed.skippedSteps,
    };
    lastTick = resumed.updatedTick;
    observations = resumed.observations;
    accepted = resumed.accepted;
    ignored = resumed.ignored;
    learningActivationsObserved = resumed.learningActivationsObserved;
    appliedEventIds.push(...resumed.appliedEventIds);
  }

  return Object.freeze({
    tutorialId: WALKING_TUTORIAL_ID,
    version: WALKING_TUTORIAL_VERSION,
    namespace,
    steps: () => stepDefinitions,
    start,
    observeSelection,
    observeWalk,
    observeEntry,
    observeExit,
    observeRide,
    ingest,
    skip,
    pause,
    resume,
    abandon,
    instance: () => (disposed || instance === null ? null : instanceView(instance)),
    snapshot,
    canSelectTaxi(vehicleId: unknown): WalkingTutorialTaxiAccess {
      requireContract(!disposed, 'Walking tutorial disposed');
      const id = boundedId(
        vehicleId,
        WALKING_TUTORIAL_LIMITS.idCodeUnits,
        'walking tutorial vehicle',
      );
      return Object.freeze({
        vehicleId: id,
        allowed: true as const,
        reason: 'TUTORIAL_NEVER_GATES_TAXI_ACCESS' as const,
      });
    },
    stats,
    attachBus(bus: EventBus): () => void {
      requireContract(!disposed, 'Walking tutorial disposed');
      requireContract(unsubscribe === null, 'Walking tutorial is already attached to a bus');
      requireContract(
        typeof bus === 'object' &&
          bus !== null &&
          typeof bus.publish === 'function' &&
          typeof bus.subscribe === 'function' &&
          typeof bus.getStats === 'function',
        'Walking tutorial requires a real 007 event bus',
      );
      if (expectedContext !== null) {
        const busStats = bus.getStats();
        requireContract(
          busStats.sessionId === expectedContext.sessionId &&
            busStats.worldEpoch === expectedContext.worldEpoch,
          'Foreign walking tutorial event bus world',
        );
      }
      const stop = bus.subscribe((event: SimulationEvent) => {
        ingest(event);
        return undefined;
      });
      unsubscribe = () => {
        stop();
        unsubscribe = null;
      };
      return unsubscribe;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (unsubscribe !== null) {
        const stop = unsubscribe;
        unsubscribe = null;
        stop();
      }
      instance = null;
    },
  });
}

function readNullableTick(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return tick(value);
}

function readNullableId(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return boundedId(value, WALKING_TUTORIAL_LIMITS.idCodeUnits, label);
}

function readNullablePoint(
  value: unknown,
  label: string,
): Readonly<{ x: number; y: number; z: number }> | null {
  if (value === null || value === undefined) return null;
  return readPoint(value, label);
}

/**
 * Strict inverse of `snapshot()`: refuses an unknown version, a step list that does not match the
 * authored order, a terminal state with pending steps, a non-monotone tick history and counters
 * that no real sequence could produce. Resuming from the middle produces the same final state as an
 * uninterrupted run.
 */
export function parseWalkingTutorialState(value: unknown): WalkingTutorialState {
  const data = plainFields(value, stateDocumentFields, 'walking tutorial state');
  for (const key of stateDocumentFields) requireRequired(data, key, 'walking tutorial state');
  requireContract(
    data.version === WALKING_TUTORIAL_VERSION,
    'Unsupported walking tutorial state version',
  );
  const instanceId = boundedId(
    data.instanceId,
    WALKING_TUTORIAL_LIMITS.instanceIdCodeUnits,
    'walking tutorial instance',
  );
  const state = choice(data.state, walkingTutorialStates);
  const stepIndex = tick(data.stepIndex);
  requireContract(
    stepIndex <= WALKING_TUTORIAL_LIMITS.steps,
    'Walking tutorial step index exceeds the authored steps',
  );
  requireContract(
    Array.isArray(data.steps) && data.steps.length === WALKING_TUTORIAL_LIMITS.steps,
    'Walking tutorial state must carry every authored step',
  );
  const steps = (data.steps as readonly unknown[]).map((entry) => {
    const step = plainFields(entry, stateStepFields, 'walking tutorial state step');
    for (const key of stateStepFields) requireRequired(step, key, 'walking tutorial state step');
    return Object.freeze({
      stepId: choice(step.stepId, walkingTutorialStepIds),
      state: choice(step.state, walkingTutorialStepStates),
      satisfiedTick: readNullableTick(step.satisfiedTick),
      evidenceEventIds: Object.freeze(
        (Array.isArray(step.evidenceEventIds) ? step.evidenceEventIds : []).map((entry) =>
          boundedId(entry, WALKING_TUTORIAL_LIMITS.idCodeUnits, 'walking tutorial evidence'),
        ),
      ),
    });
  });
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!;
    requireContract(
      step.stepId === walkingTutorialStepIds[index],
      'Walking tutorial steps must stay in the authored order',
    );
    if (index < stepIndex)
      requireContract(
        step.state !== 'PENDING',
        'A satisfied walking tutorial step cannot stay pending',
      );
    else
      requireContract(
        step.state === 'PENDING',
        'A walking tutorial step beyond the current index must stay pending',
      );
  }
  const startedTick = tick(data.startedTick);
  const updatedTick = tick(data.updatedTick);
  requireContract(updatedTick >= startedTick, 'Walking tutorial ticks must be monotone');
  const pausedTick = readNullableTick(data.pausedTick);
  const abandonedTick = readNullableTick(data.abandonedTick);
  const completedTick = readNullableTick(data.completedTick);
  for (const observed of [pausedTick, abandonedTick, completedTick])
    if (observed !== null)
      requireContract(
        observed >= startedTick && observed <= updatedTick,
        'A walking tutorial milestone must sit inside the instance history',
      );
  const completedBy =
    data.completedBy === null || data.completedBy === undefined
      ? null
      : choice(data.completedBy, completedByValues);
  if (state === 'COMPLETED') {
    requireContract(stepIndex === steps.length, 'A complete walking tutorial has every step done');
    requireContract(
      completedTick !== null && completedBy !== null,
      'A complete tutorial is stamped',
    );
  } else {
    requireContract(
      completedTick === null && completedBy === null,
      'An unfinished walking tutorial cannot carry completion facts',
    );
    requireContract(
      stepIndex < steps.length,
      'An unfinished walking tutorial keeps a current step',
    );
  }
  if (state === 'PAUSED') requireContract(pausedTick !== null, 'A paused tutorial keeps its tick');
  else requireContract(pausedTick === null, 'Only a paused tutorial keeps a pause tick');
  if (state === 'ABANDONED')
    requireContract(abandonedTick !== null, 'An abandoned tutorial keeps its tick');
  else requireContract(abandonedTick === null, 'Only an abandoned tutorial keeps an abandon tick');
  const walkingTicks = tick(data.walkingTicks);
  const walkingDistanceM = number(data.walkingDistanceM, 0);
  const skippedSteps = tick(data.skippedSteps);
  const satisfiedSteps = steps.filter((step) => step.state === 'SATISFIED').length;
  requireContract(
    skippedSteps + satisfiedSteps === stepIndex,
    'Walking tutorial skipped and satisfied steps must cover the completed prefix',
  );
  const applied = Array.isArray(data.appliedEventIds) ? data.appliedEventIds : [];
  requireContract(
    applied.length <= WALKING_TUTORIAL_LIMITS.retainedObservations,
    'Walking tutorial observation ledger exceeds its budget',
  );
  const observations = tick(data.observations);
  const accepted = tick(data.accepted);
  const ignored = tick(data.ignored);
  requireContract(
    accepted + ignored === observations,
    'Walking tutorial counters must add up to the observations',
  );
  return Object.freeze({
    version: WALKING_TUTORIAL_VERSION,
    instanceId,
    state,
    stepIndex,
    steps: Object.freeze(steps),
    startedTick,
    updatedTick,
    pausedTick,
    abandonedTick,
    completedTick,
    completedBy,
    taxiId: readNullableId(data.taxiId, 'walking tutorial taxi'),
    vehicleId: readNullableId(data.vehicleId, 'walking tutorial car'),
    rideId: readNullableId(data.rideId, 'walking tutorial ride'),
    lastWalkerPositionM: readNullablePoint(data.lastWalkerPositionM, 'walker position'),
    walkingTicks,
    walkingDistanceM,
    skippedSteps,
    appliedEventIds: Object.freeze(
      applied.map((entry) =>
        boundedId(entry, WALKING_TUTORIAL_LIMITS.idCodeUnits, 'walking tutorial evidence'),
      ),
    ),
    observations,
    accepted,
    ignored,
    learningActivationsObserved: tick(data.learningActivationsObserved),
  });
}

import { choice, list, number, requireContract, text, tick } from '../sessions';
import { parseSimulationEvent } from '../simulation';
import type { SimulationEvent } from '../simulation';
import { boundedId, compareText, frozenSorted, plainFields, requireRequired } from './contracts';
import {
  DAILY_LIMITS,
  DAILY_MISSION_XP,
  DAILY_MISSIONS_PER_DAY,
  DAILY_TICK_HZ,
  advanceDailyCalendar,
  dailyCalendarSet,
  dailyRewardFor,
  dailySetPhase,
  parseDailyCalendarState,
  parseDailyMissionSet,
  recordDailyReward,
} from './daily';
import type {
  DailyCalendarState,
  DailyMissionInstance,
  DailyMissionSet,
  DailySetPhase,
} from './daily';

/**
 * 212 daily progress consumer.
 *
 * The three objectives of the day are the delivered 211 set; this module is the consumer that turns
 * live 007 events into their progress. It owns no clock, no random source, no DOM, no renderer and
 * no XP ledger:
 *
 * - every event is a validated `SimulationEvent` plus the explicit real instant that observed it, so
 *   the day window is a parameter and never `Date.now()`;
 * - the event must belong to the current Academy world (`sessionId` + `worldEpoch`). A replay, an
 *   experiment, a Haos session or an event from an old world epoch is refused with a counted reason,
 *   never skipped silently;
 * - an objective verifies the control mode and the real ride interval: a ride is the real
 *   `PICKUP`..`DROPOFF` interval of one `rideId`, its mode is the mode in effect for that vehicle
 *   (`MANUAL_START`/`MANUAL_END`), and a mode change inside the interval makes it `MIXED`, so a
 *   `MANUAL` objective cannot be satisfied by an `AUTO` or a mixed ride;
 * - the single reward reuses the 211 identity (`dailyRewardId` + `recordDailyReward`, the policy 125
 *   publishes: one grant per instance identity, a repeat is a duplicate). No second ledger is
 *   created and no XP amount is invented;
 * - the day boundary is exclusive: the last instant that contributes is `expiresAtMs - 1`; exactly at
 *   `expiresAtMs` the set is `EXPIRED` and the event is refused, while an event accepted before the
 *   boundary keeps its completion and its reward.
 *
 * The module keeps no second source of truth: the read model copies the 211 instance (title, target,
 * control requirement, reward amount, window, budget) and adds only the real progress counts and the
 * real refusal counters. A reload restores the same rows, the same reward and the same open rides.
 */

export const DAILY_PROGRESS_VERSION = '212-daily-progress-v1' as const;

export const DAILY_PROGRESS_LIMITS = Object.freeze({
  version: DAILY_PROGRESS_VERSION,
  /** Exactly one progress row per mission of the day. */
  instances: DAILY_MISSIONS_PER_DAY,
  /** Real 057 fleet capacity for the tracked control-mode state. */
  vehicles: 70,
  /** Open ride intervals tracked at once; a closed ride leaves the map. */
  openRides: 70,
  /** Event identities remembered for progress idempotency (FIFO). */
  retainedEvents: 4096,
  /** Distinct profile versions one `DISTINCT_PROFILE_VERSIONS` objective can count. */
  distinctVersions: 64,
  /** Code units per player, session, vehicle, ride, instance, reward and event identity. */
  idCodeUnits: 256,
  /** Authoritative simulation rate of the ride intervals, identical to 211. */
  tickHz: DAILY_TICK_HZ,
});

/** Closed progress states of one daily objective. */
export const dailyProgressStates = ['ACTIVE', 'COMPLETED', 'EXPIRED', 'INELIGIBLE'] as const;
export type DailyProgressState = (typeof dailyProgressStates)[number];

/** Closed reasons a daily objective refused an event or cannot contribute. */
export const dailyProgressReasons = [
  'FOREIGN_SESSION',
  'STALE_EPOCH',
  'OUTSIDE_DAY',
  'DUPLICATE',
  'IRRELEVANT',
  'NO_RIDE',
  'ALREADY_COMPLETED',
  'UNSUPPORTED_OBJECTIVE',
  'EXPIRED',
  'WINDOW_CLOSED',
  'INCIDENT_BUDGET_EXCEEDED',
] as const;
export type DailyProgressReason = (typeof dailyProgressReasons)[number];

/** Closed control modes a ride interval or an event can be attributed to. */
export const dailyRideModes = ['AUTO', 'MANUAL', 'LEARNING', 'MIXED'] as const;
export type DailyRideMode = (typeof dailyRideModes)[number];

export const dailyProgressIngestStatuses = ['ACCEPTED', 'DUPLICATE', 'REJECTED'] as const;
export type DailyProgressIngestStatus = (typeof dailyProgressIngestStatuses)[number];

/** The real 007 event types this consumer reads; everything else is `IRRELEVANT`. */
export const DAILY_PROGRESS_EVENT_TYPES = Object.freeze([
  'MANUAL_START',
  'MANUAL_END',
  'PICKUP',
  'DROPOFF',
  'COLLISION',
  'PROFILE_ACTIVATE',
  'FULL_STOP',
  'LANE_CHANGE_COMPLETED',
  'LEADER_ACQUIRED',
] as const);

/** Closed 007 event vocabulary, used only to read back a persisted ledger. */
export const SIMULATION_EVENT_TYPE_IDS = [
  'MANUAL_START',
  'MANUAL_END',
  'LEADER_ACQUIRED',
  'SIGNAL_CHANGED',
  'SIGNAL_PHASE_CHANGED',
  'STOP_APPROACH',
  'STOP_LINE_CROSSED',
  'FULL_STOP',
  'LANE_CHANGE_STARTED',
  'LANE_CHANGE_COMPLETED',
  'COLLISION',
  'PICKUP',
  'DROPOFF',
  'PROFILE_ACTIVATE',
  'VEHICLE_RECOVERED',
  'WORLD_RESET',
  'DESTRUCTIBLE_BROKEN',
] as const;

function readId(value: unknown, label: string): string {
  return boundedId(value, DAILY_PROGRESS_LIMITS.idCodeUnits, label);
}

function readMode(value: unknown): DailyRideMode {
  return choice(value, dailyRideModes);
}

function readState(value: unknown): DailyProgressState {
  return choice(value, dailyProgressStates);
}

/** Real closed ride interval: the 007 `PICKUP`..`DROPOFF` pair of one `rideId`. */
export interface DailyRideInterval {
  readonly rideId: string;
  readonly vehicleId: string;
  readonly pickupTick: number;
  readonly dropoffTick: number;
  readonly durationTicks: number;
  readonly durationSeconds: number;
  readonly mode: DailyRideMode;
  /** `true` when no `COLLISION` was recorded for the vehicle inside the interval. */
  readonly clean: boolean;
}

export interface DailyProgressRow {
  readonly instanceId: string;
  readonly progress: number;
  readonly satisfied: boolean;
  readonly state: DailyProgressState;
  readonly reason: DailyProgressReason | null;
  readonly rides: number;
  readonly manualRides: number;
  readonly learningRides: number;
  readonly autoRides: number;
  readonly mixedRides: number;
  /** Events of a matching kind refused because the control mode was not the required one. */
  readonly modeMismatches: number;
  readonly collisions: number;
  /** Matching events that arrived after this objective was already completed. */
  readonly afterCompletionEvents: number;
  readonly firstTick: number | null;
  readonly deadlineTick: number | null;
  readonly completedAtMs: number | null;
  readonly rewardId: string | null;
  readonly rewardXp: number;
  readonly rewardGrantedAtMs: number | null;
  readonly distinctVersions: readonly string[];
  readonly lastRide: DailyRideInterval | null;
}

/** One objective as the UI reads it: the 211 instance plus the real progress row. */
export interface DailyProgressInstanceRead extends DailyProgressRow {
  readonly slot: number;
  readonly familyId: string;
  readonly title: string;
  readonly label: string;
  readonly objectiveKind: DailyMissionInstance['objectiveKind'];
  readonly controlRequirement: DailyMissionInstance['controlRequirement'];
  readonly learningKey: string | null;
  readonly target: number;
  readonly difficulty: DailyMissionInstance['difficulty'];
  readonly zone: string | null;
  readonly windowTicks: number | null;
  readonly incidentBudget: number | null;
  readonly minDurationS: number | null;
  readonly allowsManual: boolean;
  /** XP promised by the 211 instance; granted only in the `COMPLETED` state. */
  readonly promisedXp: number;
  readonly grantedXp: number;
}

export interface DailyProgressCounters {
  readonly accepted: number;
  readonly duplicates: number;
  readonly rejected: number;
  readonly rewardsGranted: number;
  readonly rewardsDuplicate: number;
  readonly droppedEvents: number;
}

export interface DailyProgressRejection {
  readonly eventId: string;
  readonly reason: DailyProgressReason;
  readonly observedAtMs: number;
}

export interface DailyProgressRead {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: typeof DAILY_PROGRESS_VERSION;
  readonly playerId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  /** Explicit real instant the read was taken at; the day phase is derived from it. */
  readonly observedAtMs: number;
  readonly phase: DailySetPhase;
  readonly dailyDate: string;
  readonly timeZone: string;
  readonly utcOffsetSeconds: number;
  readonly dayLengthSeconds: number;
  readonly dayStartMs: number;
  /** Exclusive end of the day: the reset moment shown by the UI. */
  readonly expiresAtMs: number;
  readonly generatorVersion: string;
  readonly templateCatalogVersion: string;
  readonly capabilityGaps: readonly string[];
  readonly instances: readonly DailyProgressInstanceRead[];
  readonly promisedXp: number;
  readonly grantedXp: number;
  readonly rewards: number;
  readonly counters: DailyProgressCounters;
  readonly rejections: readonly Readonly<{ reason: DailyProgressReason; count: number }>[];
  readonly lastRejection: DailyProgressRejection | null;
}

export interface DailyProgressIngestResult {
  readonly version: typeof DAILY_PROGRESS_VERSION;
  readonly status: DailyProgressIngestStatus;
  readonly eventId: string;
  readonly type: SimulationEvent['type'];
  readonly observedAtMs: number;
  readonly reason: DailyProgressReason | null;
  readonly phase: DailySetPhase;
  readonly advanced: readonly Readonly<{
    instanceId: string;
    progress: number;
    target: number;
    satisfied: boolean;
  }>[];
  readonly completed: readonly string[];
  readonly rewardsGranted: number;
  readonly rewardsDuplicate: number;
}

export interface DailyProgressAdvanceResult {
  readonly version: typeof DAILY_PROGRESS_VERSION;
  readonly action: ReturnType<typeof advanceDailyCalendar>['action'];
  readonly dailyDate: string;
  readonly skippedDays: number;
  readonly regenerated: boolean;
  readonly capabilityDrift: boolean;
  /** Rows kept from the same day, and rows created for the new day. */
  readonly retainedRows: number;
  readonly createdRows: number;
  readonly droppedRows: number;
  /** True when a world reset rebound the consumer to a new `worldEpoch`/`sessionId`. */
  readonly rebound: boolean;
}

export interface DailyProgressAdvanceInput {
  readonly calendar: unknown;
  readonly capabilities: unknown;
  readonly generatedAtMs: number;
  readonly sessionId?: string;
  readonly worldEpoch?: number;
  readonly generatorVersion?: string;
  readonly templateCatalog?: unknown;
}

export interface DailyProgressSnapshot {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: typeof DAILY_PROGRESS_VERSION;
  readonly playerId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  /** Local date whose set and rows this checkpoint belongs to. */
  readonly dailyDate: string;
  readonly calendar: DailyCalendarState;
  readonly rows: readonly DailyProgressRow[];
  readonly vehicles: readonly Readonly<{
    vehicleId: string;
    mode: DailyRideMode;
    sinceTick: number;
  }>[];
  readonly rides: readonly Readonly<{
    rideId: string;
    vehicleId: string;
    pickupTick: number;
    mode: DailyRideMode;
    incident: boolean;
  }>[];
  readonly events: readonly Readonly<{
    eventId: string;
    tick: number;
    type: SimulationEvent['type'];
  }>[];
  readonly rejections: readonly Readonly<{ reason: DailyProgressReason; count: number }>[];
  readonly lastRejection: DailyProgressRejection | null;
  readonly counters: DailyProgressCounters;
}

export interface DailyProgressStats {
  readonly version: typeof DAILY_PROGRESS_VERSION;
  readonly playerId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly dailyDate: string;
  readonly instances: number;
  readonly completed: number;
  readonly ineligible: number;
  readonly active: number;
  readonly vehicles: number;
  readonly openRides: number;
  readonly retainedEvents: number;
  readonly counters: DailyProgressCounters;
  readonly rewards: number;
}

export interface DailyProgress {
  readonly version: typeof DAILY_PROGRESS_VERSION;
  readonly playerId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  set(): DailyMissionSet;
  calendarState(): DailyCalendarState;
  advance(input: unknown): DailyProgressAdvanceResult;
  ingest(value: unknown): DailyProgressIngestResult;
  read(observedAtMs: unknown): DailyProgressRead;
  snapshot(): DailyProgressSnapshot;
  stats(): DailyProgressStats;
}

const optionFields = [
  'playerId',
  'sessionId',
  'worldEpoch',
  'calendar',
  'capabilities',
  'generatedAtMs',
  'state',
  'generatorVersion',
  'templateCatalog',
] as const;

const advanceFields = [
  'calendar',
  'capabilities',
  'generatedAtMs',
  'sessionId',
  'worldEpoch',
  'generatorVersion',
  'templateCatalog',
] as const;

const ingestFields = ['event', 'observedAtMs'] as const;
const restoreOptionFields = ['sessionId', 'worldEpoch'] as const;

const snapshotFields = [
  'schemaVersion',
  'units',
  'version',
  'playerId',
  'sessionId',
  'worldEpoch',
  'dailyDate',
  'calendar',
  'rows',
  'vehicles',
  'rides',
  'events',
  'rejections',
  'lastRejection',
  'counters',
] as const;

const rowFields = [
  'instanceId',
  'progress',
  'satisfied',
  'state',
  'reason',
  'rides',
  'manualRides',
  'learningRides',
  'autoRides',
  'mixedRides',
  'modeMismatches',
  'collisions',
  'afterCompletionEvents',
  'firstTick',
  'deadlineTick',
  'completedAtMs',
  'rewardId',
  'rewardXp',
  'rewardGrantedAtMs',
  'distinctVersions',
  'lastRide',
] as const;

const rideFields = [
  'rideId',
  'vehicleId',
  'pickupTick',
  'dropoffTick',
  'durationTicks',
  'durationSeconds',
  'mode',
  'clean',
] as const;

const openRideFields = ['rideId', 'vehicleId', 'pickupTick', 'mode', 'incident'] as const;
const vehicleFields = ['vehicleId', 'mode', 'sinceTick'] as const;
const eventFields = ['eventId', 'tick', 'type'] as const;
const rejectionFields = ['reason', 'count'] as const;
const lastRejectionFields = ['eventId', 'reason', 'observedAtMs'] as const;
const counterFields = [
  'accepted',
  'duplicates',
  'rejected',
  'rewardsGranted',
  'rewardsDuplicate',
  'droppedEvents',
] as const;

interface OpenRide {
  rideId: string;
  vehicleId: string;
  pickupTick: number;
  mode: DailyRideMode;
  incident: boolean;
}

interface VehicleMode {
  vehicleId: string;
  mode: DailyRideMode;
  sinceTick: number;
}

interface MutableRow {
  instanceId: string;
  progress: number;
  satisfied: boolean;
  state: DailyProgressState;
  reason: DailyProgressReason | null;
  rides: number;
  manualRides: number;
  learningRides: number;
  autoRides: number;
  mixedRides: number;
  modeMismatches: number;
  collisions: number;
  afterCompletionEvents: number;
  firstTick: number | null;
  deadlineTick: number | null;
  completedAtMs: number | null;
  rewardId: string | null;
  rewardXp: number;
  rewardGrantedAtMs: number | null;
  distinctVersions: string[];
  lastRide: DailyRideInterval | null;
}

interface RestoredState {
  readonly rows: readonly MutableRow[];
  readonly vehicles: readonly VehicleMode[];
  readonly rides: readonly OpenRide[];
  readonly events: readonly {
    readonly eventId: string;
    readonly tick: number;
    readonly type: SimulationEvent['type'];
  }[];
  readonly rejections: readonly { readonly reason: DailyProgressReason; readonly count: number }[];
  readonly lastRejection: DailyProgressRejection | null;
  readonly counters: DailyProgressCounters;
}

function vehicleOf(event: SimulationEvent): string | null {
  switch (event.type) {
    case 'MANUAL_START':
    case 'MANUAL_END':
    case 'LEADER_ACQUIRED':
    case 'STOP_APPROACH':
    case 'STOP_LINE_CROSSED':
    case 'FULL_STOP':
    case 'LANE_CHANGE_STARTED':
    case 'LANE_CHANGE_COMPLETED':
    case 'COLLISION':
    case 'PICKUP':
    case 'DROPOFF':
    case 'VEHICLE_RECOVERED':
      return event.payload.vehicleId;
    default:
      return null;
  }
}

function isConsumedType(type: SimulationEvent['type']): boolean {
  return (DAILY_PROGRESS_EVENT_TYPES as readonly string[]).includes(type);
}

function requirementAllows(
  requirement: DailyMissionInstance['controlRequirement'],
  mode: DailyRideMode,
): boolean {
  if (requirement === 'ANY') return true;
  return mode === requirement;
}

function objectiveProgressed(
  instance: DailyMissionInstance,
  event: SimulationEvent,
  ride: DailyRideInterval | null,
): boolean {
  switch (instance.objectiveKind) {
    case 'DROPOFFS':
      return ride !== null;
    case 'MANUAL_DROPOFFS':
      return ride !== null;
    case 'CLEAN_DROPOFFS':
      return ride !== null && ride.clean;
    case 'LEARNING_ACTIVATIONS':
      return event.type === 'PROFILE_ACTIVATE';
    case 'DISTINCT_PROFILE_VERSIONS':
      return event.type === 'PROFILE_ACTIVATE';
    case 'FULL_STOPS':
      return event.type === 'FULL_STOP' && event.payload.durationS >= (instance.minDurationS ?? 0);
    case 'LANE_CHANGES':
      return event.type === 'LANE_CHANGE_COMPLETED';
    case 'LEADER_ACQUIRED':
      return event.type === 'LEADER_ACQUIRED';
  }
}

function emptyRow(instanceId: string, rewardXp: number): MutableRow {
  return {
    instanceId,
    progress: 0,
    satisfied: false,
    state: 'ACTIVE',
    reason: null,
    rides: 0,
    manualRides: 0,
    learningRides: 0,
    autoRides: 0,
    mixedRides: 0,
    modeMismatches: 0,
    collisions: 0,
    afterCompletionEvents: 0,
    firstTick: null,
    deadlineTick: null,
    completedAtMs: null,
    rewardId: null,
    rewardXp,
    rewardGrantedAtMs: null,
    distinctVersions: [],
    lastRide: null,
  };
}

function rowView(row: MutableRow): DailyProgressRow {
  return Object.freeze({
    instanceId: row.instanceId,
    progress: row.progress,
    satisfied: row.satisfied,
    state: row.state,
    reason: row.reason,
    rides: row.rides,
    manualRides: row.manualRides,
    learningRides: row.learningRides,
    autoRides: row.autoRides,
    mixedRides: row.mixedRides,
    modeMismatches: row.modeMismatches,
    collisions: row.collisions,
    afterCompletionEvents: row.afterCompletionEvents,
    firstTick: row.firstTick,
    deadlineTick: row.deadlineTick,
    completedAtMs: row.completedAtMs,
    rewardId: row.rewardId,
    rewardXp: row.rewardXp,
    rewardGrantedAtMs: row.rewardGrantedAtMs,
    distinctVersions: Object.freeze([...row.distinctVersions]),
    lastRide: row.lastRide,
  });
}

function readRide(value: unknown): DailyRideInterval {
  const data = plainFields(value, rideFields, 'daily ride interval');
  for (const key of rideFields) requireRequired(data, key, 'daily ride interval');
  const pickupTick = tick(data.pickupTick);
  const dropoffTick = tick(data.dropoffTick);
  const durationTicks = tick(data.durationTicks);
  requireContract(dropoffTick >= pickupTick, 'Daily ride interval ends before it starts');
  requireContract(
    durationTicks === dropoffTick - pickupTick,
    'Daily ride duration does not match its interval',
  );
  const durationSeconds = number(data.durationSeconds, 0, 86_400);
  requireContract(
    Math.abs(durationSeconds - durationTicks / DAILY_TICK_HZ) < 1e-6,
    'Daily ride duration in seconds disagrees with its ticks',
  );
  requireContract(typeof data.clean === 'boolean', 'Daily ride clean flag must be a boolean');
  return Object.freeze({
    rideId: readId(data.rideId, 'daily ride'),
    vehicleId: readId(data.vehicleId, 'daily ride vehicle'),
    pickupTick,
    dropoffTick,
    durationTicks,
    durationSeconds,
    mode: readMode(data.mode),
    clean: data.clean,
  });
}

function readRow(value: unknown, instances: ReadonlySet<string>): MutableRow {
  const data = plainFields(value, rowFields, 'daily progress row');
  for (const key of rowFields) requireRequired(data, key, 'daily progress row');
  const instanceId = readId(data.instanceId, 'daily progress instance');
  requireContract(instances.has(instanceId), 'Daily progress row is not a mission of the day');
  const progress = tick(data.progress);
  requireContract(typeof data.satisfied === 'boolean', 'Daily satisfied flag must be a boolean');
  const satisfied = data.satisfied;
  if (satisfied) requireContract(progress >= 1, 'A satisfied daily row has real progress');
  const state = readState(data.state);
  const reason = data.reason === null ? null : choice(data.reason, dailyProgressReasons);
  if (state === 'ACTIVE' || state === 'COMPLETED')
    requireContract(reason === null, 'A live or completed daily row carries no reason');
  if (state === 'EXPIRED')
    requireContract(reason === 'EXPIRED', 'An expired daily row reports the EXPIRED reason');
  if (state === 'INELIGIBLE')
    requireContract(reason !== null, 'An ineligible daily row needs a reason');
  if (state === 'COMPLETED')
    requireContract(satisfied, 'A completed daily row declares itself satisfied');
  const rewardId = data.rewardId === null ? null : readId(data.rewardId, 'daily reward');
  const rewardXp = tick(data.rewardXp);
  const rewardGrantedAtMs = data.rewardGrantedAtMs === null ? null : tick(data.rewardGrantedAtMs);
  if (state === 'COMPLETED') {
    requireContract(rewardId !== null, 'A completed daily row carries its reward identity');
    requireContract(rewardGrantedAtMs !== null, 'A completed daily row carries its grant instant');
  }
  const distinctVersions = list(data.distinctVersions, (entry) =>
    readId(entry, 'daily profile version'),
  );
  requireContract(
    distinctVersions.length <= DAILY_PROGRESS_LIMITS.distinctVersions,
    'Daily distinct version capacity exceeded',
  );
  return {
    instanceId,
    progress,
    satisfied,
    state,
    reason,
    rides: tick(data.rides),
    manualRides: tick(data.manualRides),
    learningRides: tick(data.learningRides),
    autoRides: tick(data.autoRides),
    mixedRides: tick(data.mixedRides),
    modeMismatches: tick(data.modeMismatches),
    collisions: tick(data.collisions),
    afterCompletionEvents: tick(data.afterCompletionEvents),
    firstTick: data.firstTick === null ? null : tick(data.firstTick),
    deadlineTick: data.deadlineTick === null ? null : tick(data.deadlineTick),
    completedAtMs: data.completedAtMs === null ? null : tick(data.completedAtMs),
    rewardId,
    rewardXp,
    rewardGrantedAtMs,
    distinctVersions: [...distinctVersions],
    lastRide: data.lastRide === null ? null : readRide(data.lastRide),
  };
}

function readCounter(value: unknown): DailyProgressCounters {
  const data = plainFields(value, counterFields, 'daily progress counters');
  for (const key of counterFields) requireRequired(data, key, 'daily progress counters');
  return Object.freeze({
    accepted: tick(data.accepted),
    duplicates: tick(data.duplicates),
    rejected: tick(data.rejected),
    rewardsGranted: tick(data.rewardsGranted),
    rewardsDuplicate: tick(data.rewardsDuplicate),
    droppedEvents: tick(data.droppedEvents),
  });
}

function readRejections(
  value: unknown,
): readonly Readonly<{ reason: DailyProgressReason; count: number }>[] {
  const entries = list(value, (entry) => {
    const data = plainFields(entry, rejectionFields, 'daily progress rejection');
    for (const key of rejectionFields) requireRequired(data, key, 'daily progress rejection');
    return Object.freeze({
      reason: choice(data.reason, dailyProgressReasons),
      count: tick(data.count),
    });
  });
  requireContract(
    new Set(entries.map((entry) => entry.reason)).size === entries.length,
    'Duplicate daily progress rejection reason',
  );
  return Object.freeze(entries);
}

function zeroCounters(): DailyProgressCounters {
  return Object.freeze({
    accepted: 0,
    duplicates: 0,
    rejected: 0,
    rewardsGranted: 0,
    rewardsDuplicate: 0,
    droppedEvents: 0,
  });
}

function buildDailyProgress(value: unknown, restored: RestoredState | null): DailyProgress {
  const data = plainFields(value, optionFields, 'daily progress option');
  for (const key of [
    'playerId',
    'sessionId',
    'worldEpoch',
    'calendar',
    'capabilities',
    'generatedAtMs',
  ])
    requireRequired(data, key, 'daily progress option');
  const playerId = readId(data.playerId, 'player');
  const sessionId = readId(data.sessionId, 'session');
  const worldEpoch = tick(data.worldEpoch);
  const step = advanceDailyCalendar({
    state: data.state === undefined ? null : data.state,
    playerId,
    calendar: data.calendar,
    capabilities: data.capabilities,
    generatedAtMs: data.generatedAtMs,
    ...(data.generatorVersion === undefined ? {} : { generatorVersion: data.generatorVersion }),
    ...(data.templateCatalog === undefined ? {} : { templateCatalog: data.templateCatalog }),
  });
  requireContract(step.set !== null, 'Daily progress requires a generated daily set');
  const initialSet = step.set;

  let calendarState = step.state,
    set = initialSet,
    boundSessionId = sessionId,
    boundWorldEpoch = worldEpoch,
    counters = restored?.counters ?? zeroCounters();

  const rows = new Map<string, MutableRow>();
  const vehicles = new Map<string, VehicleMode>();
  const openRides = new Map<string, OpenRide>();
  const eventLedger = new Map<string, { tick: number; type: SimulationEvent['type'] }>();
  const rejections = new Map<DailyProgressReason, number>();
  let lastRejection: DailyProgressRejection | null = restored?.lastRejection ?? null;

  const ensureRow = (instance: DailyMissionInstance): MutableRow => {
    const existing = rows.get(instance.instanceId);
    if (existing !== undefined) return existing;
    const created = emptyRow(instance.instanceId, instance.rewardXp);
    const reward = dailyRewardFor(calendarState, instance.instanceId);
    if (reward !== null) {
      // A retained 211 reward is authoritative: the objective is completed, never re-armed.
      created.progress = instance.target;
      created.satisfied = true;
      created.state = 'COMPLETED';
      created.reason = null;
      created.completedAtMs = reward.grantedAtMs;
      created.rewardId = reward.rewardId;
      created.rewardGrantedAtMs = reward.grantedAtMs;
    }
    rows.set(instance.instanceId, created);
    return created;
  };

  /** Keeps the rows of the retained set, drops rows of another day, reconciles retained rewards. */
  const bindSet = (
    next: DailyMissionSet,
  ): { retained: number; created: number; dropped: number } => {
    const ids = new Set(next.instances.map((instance) => instance.instanceId));
    let dropped = 0;
    for (const instanceId of [...rows.keys()])
      if (!ids.has(instanceId)) {
        rows.delete(instanceId);
        dropped += 1;
      }
    let retained = 0,
      created = 0;
    for (const instance of next.instances) {
      const existed = rows.has(instance.instanceId);
      ensureRow(instance);
      if (existed) retained += 1;
      else created += 1;
    }
    return { retained, created, dropped };
  };

  const bound = bindSet(initialSet);
  requireContract(bound.created + bound.retained === DAILY_MISSIONS_PER_DAY, 'Daily row capacity');

  if (restored !== null) {
    for (const row of restored.rows) rows.set(row.instanceId, { ...row });
    for (const vehicle of restored.vehicles) vehicles.set(vehicle.vehicleId, { ...vehicle });
    for (const ride of restored.rides) openRides.set(ride.rideId, { ...ride });
    for (const event of restored.events)
      eventLedger.set(event.eventId, { tick: event.tick, type: event.type });
    for (const entry of restored.rejections) rejections.set(entry.reason, entry.count);
  }

  const rememberRejection = (
    reason: DailyProgressReason,
    eventId: string,
    observedAtMs: number,
  ): void => {
    rejections.set(reason, (rejections.get(reason) ?? 0) + 1);
    lastRejection = Object.freeze({ eventId, reason, observedAtMs });
    counters = Object.freeze({ ...counters, rejected: counters.rejected + 1 });
  };

  const rememberEvent = (event: SimulationEvent): void => {
    while (eventLedger.size >= DAILY_PROGRESS_LIMITS.retainedEvents) {
      const oldest = eventLedger.keys().next();
      if (oldest.done === true) break;
      eventLedger.delete(oldest.value);
      counters = Object.freeze({ ...counters, droppedEvents: counters.droppedEvents + 1 });
    }
    eventLedger.set(event.eventId, { tick: event.tick, type: event.type });
  };

  const modeOfVehicle = (vehicleId: string | null): DailyRideMode => {
    if (vehicleId === null) return 'AUTO';
    return vehicles.get(vehicleId)?.mode ?? 'AUTO';
  };

  const setVehicleMode = (vehicleId: string, mode: DailyRideMode, atTick: number): void => {
    requireContract(
      vehicles.size < DAILY_PROGRESS_LIMITS.vehicles || vehicles.has(vehicleId),
      'Daily progress vehicle capacity exceeded',
    );
    for (const ride of openRides.values())
      if (ride.vehicleId === vehicleId && ride.mode !== mode) ride.mode = 'MIXED';
    vehicles.set(vehicleId, { vehicleId, mode, sinceTick: atTick });
  };

  const closeRide = (rideId: string, dropoffTick: number): DailyRideInterval | null => {
    const ride = openRides.get(rideId);
    if (ride === undefined) return null;
    openRides.delete(rideId);
    const durationTicks = dropoffTick - ride.pickupTick;
    requireContract(durationTicks >= 0, 'Daily ride interval ends before it starts');
    return Object.freeze({
      rideId: ride.rideId,
      vehicleId: ride.vehicleId,
      pickupTick: ride.pickupTick,
      dropoffTick,
      durationTicks,
      durationSeconds: durationTicks / DAILY_TICK_HZ,
      mode: ride.mode,
      clean: !ride.incident,
    });
  };

  const rejection = (
    event: SimulationEvent,
    observedAtMs: number,
    reason: DailyProgressReason,
    phase: DailySetPhase,
  ): DailyProgressIngestResult => {
    rememberEvent(event);
    rememberRejection(reason, event.eventId, observedAtMs);
    return Object.freeze({
      version: DAILY_PROGRESS_VERSION,
      status: 'REJECTED' as const,
      eventId: event.eventId,
      type: event.type,
      observedAtMs,
      reason,
      phase,
      advanced: Object.freeze([]),
      completed: Object.freeze([]),
      rewardsGranted: 0,
      rewardsDuplicate: 0,
    });
  };

  function ingest(value: unknown): DailyProgressIngestResult {
    const input = plainFields(value, ingestFields, 'daily progress event');
    for (const key of ingestFields) requireRequired(input, key, 'daily progress event');
    const event = parseSimulationEvent(input.event);
    const observedAtMs = tick(input.observedAtMs);
    const phase = dailySetPhase(set, observedAtMs);

    const known = eventLedger.get(event.eventId);
    if (known !== undefined) {
      requireContract(
        known.tick === event.tick && known.type === event.type,
        'Conflicting daily progress event identity',
      );
      counters = Object.freeze({ ...counters, duplicates: counters.duplicates + 1 });
      return Object.freeze({
        version: DAILY_PROGRESS_VERSION,
        status: 'DUPLICATE' as const,
        eventId: event.eventId,
        type: event.type,
        observedAtMs,
        reason: 'DUPLICATE' as const,
        phase,
        advanced: Object.freeze([]),
        completed: Object.freeze([]),
        rewardsGranted: 0,
        rewardsDuplicate: 0,
      });
    }

    if (event.sessionId !== boundSessionId)
      return rejection(event, observedAtMs, 'FOREIGN_SESSION', phase);
    if (event.worldEpoch !== boundWorldEpoch)
      return rejection(event, observedAtMs, 'STALE_EPOCH', phase);
    if (phase !== 'ACTIVE') return rejection(event, observedAtMs, 'OUTSIDE_DAY', phase);
    if (!isConsumedType(event.type)) return rejection(event, observedAtMs, 'IRRELEVANT', phase);

    const vehicleId = vehicleOf(event);
    let ride: DailyRideInterval | null = null;
    if (event.type === 'PICKUP') {
      requireContract(
        openRides.size < DAILY_PROGRESS_LIMITS.openRides || openRides.has(event.payload.rideId),
        'Daily progress open ride capacity exceeded',
      );
      requireContract(
        !openRides.has(event.payload.rideId),
        'Daily progress ride is already open: ' + event.payload.rideId,
      );
      openRides.set(event.payload.rideId, {
        rideId: event.payload.rideId,
        vehicleId: event.payload.vehicleId,
        pickupTick: event.tick,
        mode: modeOfVehicle(event.payload.vehicleId),
        incident: false,
      });
    } else if (event.type === 'DROPOFF') {
      ride = closeRide(event.payload.rideId, event.tick);
      if (ride === null) return rejection(event, observedAtMs, 'NO_RIDE', phase);
    } else if (event.type === 'MANUAL_START') {
      setVehicleMode(event.payload.vehicleId, event.payload.controlMode, event.tick);
    } else if (event.type === 'MANUAL_END') {
      setVehicleMode(event.payload.vehicleId, 'AUTO', event.tick);
    } else if (event.type === 'COLLISION') {
      for (const interval of openRides.values())
        if (interval.vehicleId === event.payload.vehicleId) interval.incident = true;
    }

    rememberEvent(event);
    counters = Object.freeze({ ...counters, accepted: counters.accepted + 1 });

    const eventMode: DailyRideMode =
      ride !== null
        ? ride.mode
        : event.type === 'PROFILE_ACTIVATE'
          ? 'LEARNING'
          : event.type === 'MANUAL_START' || event.type === 'MANUAL_END'
            ? event.payload.controlMode
            : modeOfVehicle(vehicleId);

    const advanced: { instanceId: string; progress: number; target: number; satisfied: boolean }[] =
      [];
    const completed: string[] = [];
    let rewardsGranted = 0,
      rewardsDuplicate = 0;

    for (const instance of set.instances) {
      const row = ensureRow(instance);
      if (row.state === 'COMPLETED') {
        if (objectiveProgressed(instance, event, ride)) row.afterCompletionEvents += 1;
        continue;
      }
      if (row.state !== 'ACTIVE') continue;
      if (row.deadlineTick !== null && event.tick > row.deadlineTick) {
        row.state = 'INELIGIBLE';
        row.reason = 'WINDOW_CLOSED';
        continue;
      }
      if (event.type === 'COLLISION' && instance.incidentBudget !== null) {
        row.collisions += 1;
        if (row.collisions > instance.incidentBudget) {
          row.state = 'INELIGIBLE';
          row.reason = 'INCIDENT_BUDGET_EXCEEDED';
          continue;
        }
      }
      if (!objectiveProgressed(instance, event, ride)) continue;
      if (!requirementAllows(instance.controlRequirement, eventMode)) {
        row.modeMismatches += 1;
        continue;
      }
      if (instance.objectiveKind === 'DISTINCT_PROFILE_VERSIONS') {
        requireContract(
          event.type === 'PROFILE_ACTIVATE',
          'Daily distinct version objective requires a profile activation',
        );
        const versionId = event.payload.versionId;
        if (row.distinctVersions.includes(versionId)) continue;
        requireContract(
          row.distinctVersions.length < DAILY_PROGRESS_LIMITS.distinctVersions,
          'Daily distinct version capacity exceeded',
        );
        row.distinctVersions.push(versionId);
      }
      if (row.firstTick === null) {
        row.firstTick = event.tick;
        row.deadlineTick = instance.windowTicks === null ? null : event.tick + instance.windowTicks;
      }
      if (ride !== null) {
        row.lastRide = ride;
        row.rides += 1;
        if (ride.mode === 'MANUAL') row.manualRides += 1;
        else if (ride.mode === 'LEARNING') row.learningRides += 1;
        else if (ride.mode === 'MIXED') row.mixedRides += 1;
        else row.autoRides += 1;
      }
      row.progress = Math.min(instance.target, row.progress + 1);
      row.satisfied = row.progress >= instance.target;
      advanced.push({
        instanceId: instance.instanceId,
        progress: row.progress,
        target: instance.target,
        satisfied: row.satisfied,
      });
      if (!row.satisfied) continue;
      row.state = 'COMPLETED';
      row.reason = null;
      row.completedAtMs = observedAtMs;
      const reward = recordDailyReward({
        state: calendarState,
        instanceId: instance.instanceId,
        grantedAtMs: observedAtMs,
      });
      calendarState = reward.state;
      row.rewardId = reward.record.rewardId;
      row.rewardGrantedAtMs = reward.record.grantedAtMs;
      if (reward.granted) {
        rewardsGranted += 1;
        counters = Object.freeze({ ...counters, rewardsGranted: counters.rewardsGranted + 1 });
      } else {
        rewardsDuplicate += 1;
        counters = Object.freeze({ ...counters, rewardsDuplicate: counters.rewardsDuplicate + 1 });
      }
      completed.push(instance.instanceId);
    }

    return Object.freeze({
      version: DAILY_PROGRESS_VERSION,
      status: 'ACCEPTED' as const,
      eventId: event.eventId,
      type: event.type,
      observedAtMs,
      reason: null,
      phase,
      advanced: Object.freeze(advanced.map((entry) => Object.freeze(entry))),
      completed: Object.freeze(completed),
      rewardsGranted,
      rewardsDuplicate,
    });
  }

  function advance(value: unknown): DailyProgressAdvanceResult {
    const input = plainFields(value, advanceFields, 'daily progress advance');
    for (const key of ['calendar', 'capabilities', 'generatedAtMs'])
      requireRequired(input, key, 'daily progress advance');
    const nextSessionId =
      input.sessionId === undefined ? boundSessionId : readId(input.sessionId, 'session');
    const nextWorldEpoch =
      input.worldEpoch === undefined ? boundWorldEpoch : tick(input.worldEpoch);
    requireContract(
      nextWorldEpoch >= boundWorldEpoch,
      'Daily progress cannot move back to an older world epoch',
    );
    const step = advanceDailyCalendar({
      state: calendarState,
      playerId,
      calendar: input.calendar,
      capabilities: input.capabilities,
      generatedAtMs: input.generatedAtMs,
      ...(input.generatorVersion === undefined ? {} : { generatorVersion: input.generatorVersion }),
      ...(input.templateCatalog === undefined ? {} : { templateCatalog: input.templateCatalog }),
    });
    requireContract(step.set !== null, 'Daily progress advance produced no daily set');
    const rebound = nextSessionId !== boundSessionId || nextWorldEpoch !== boundWorldEpoch;
    calendarState = step.state;
    set = step.set;
    boundSessionId = nextSessionId;
    boundWorldEpoch = nextWorldEpoch;
    if (step.action !== 'SAME_DAY' && step.action !== 'ROLLBACK') {
      vehicles.clear();
      openRides.clear();
    }
    const boundNow = bindSet(set);
    return Object.freeze({
      version: DAILY_PROGRESS_VERSION,
      action: step.action,
      dailyDate: set.dailyDate,
      skippedDays: step.skippedDays,
      regenerated: step.regenerated,
      capabilityDrift: step.capabilityDrift,
      retainedRows: boundNow.retained,
      createdRows: boundNow.created,
      droppedRows: boundNow.dropped,
      rebound,
    });
  }

  function read(observedAtMs: unknown): DailyProgressRead {
    const observed = tick(observedAtMs);
    const phase = dailySetPhase(set, observed);
    const instances: DailyProgressInstanceRead[] = [];
    let promisedXp = 0,
      grantedXp = 0,
      rewards = 0;
    for (const instance of set.instances) {
      const row = ensureRow(instance);
      const state: DailyProgressState =
        row.state === 'COMPLETED'
          ? 'COMPLETED'
          : row.state === 'EXPIRED'
            ? 'EXPIRED'
            : row.state === 'INELIGIBLE'
              ? 'INELIGIBLE'
              : phase === 'EXPIRED'
                ? 'EXPIRED'
                : phase === 'PENDING'
                  ? 'INELIGIBLE'
                  : 'ACTIVE';
      let reason: DailyProgressReason | null = row.reason;
      if (state === 'EXPIRED') reason = 'EXPIRED';
      else if (state === 'INELIGIBLE' && row.state === 'ACTIVE') reason = 'OUTSIDE_DAY';
      else if (state === 'ACTIVE') reason = null;
      const completed = state === 'COMPLETED';
      promisedXp += instance.rewardXp;
      if (completed) {
        grantedXp += instance.rewardXp;
        rewards += 1;
      }
      instances.push(
        Object.freeze({
          ...rowView(row),
          state,
          reason,
          slot: instance.slot,
          familyId: instance.familyId,
          title: instance.title,
          label: instance.label,
          objectiveKind: instance.objectiveKind,
          controlRequirement: instance.controlRequirement,
          learningKey: instance.learningKey,
          target: instance.target,
          difficulty: instance.difficulty,
          zone: instance.zone,
          windowTicks: instance.windowTicks,
          incidentBudget: instance.incidentBudget,
          minDurationS: instance.minDurationS,
          allowsManual: instance.allowsManual,
          promisedXp: instance.rewardXp,
          grantedXp: completed ? instance.rewardXp : 0,
        }),
      );
    }
    return Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      version: DAILY_PROGRESS_VERSION,
      playerId,
      sessionId: boundSessionId,
      worldEpoch: boundWorldEpoch,
      observedAtMs: observed,
      phase,
      dailyDate: set.dailyDate,
      timeZone: set.calendarTimeZone,
      utcOffsetSeconds: set.calendarOffsetSeconds,
      dayLengthSeconds: set.dayLengthSeconds,
      dayStartMs: set.dayStartMs,
      expiresAtMs: set.expiresAtMs,
      generatorVersion: set.generatorVersion,
      templateCatalogVersion: set.templateCatalogVersion,
      capabilityGaps: set.capabilityGaps,
      instances: Object.freeze(instances),
      promisedXp,
      grantedXp,
      rewards,
      counters,
      rejections: Object.freeze(
        [...rejections.entries()]
          .map(([reason, count]) => Object.freeze({ reason, count }))
          .sort((left, right) => compareText(left.reason, right.reason)),
      ),
      lastRejection,
    });
  }

  function snapshot(): DailyProgressSnapshot {
    return Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      version: DAILY_PROGRESS_VERSION,
      playerId,
      sessionId: boundSessionId,
      worldEpoch: boundWorldEpoch,
      dailyDate: set.dailyDate,
      calendar: calendarState,
      rows: Object.freeze([...rows.values()].map(rowView)),
      vehicles: Object.freeze(
        [...vehicles.values()].map((entry) =>
          Object.freeze({
            vehicleId: entry.vehicleId,
            mode: entry.mode,
            sinceTick: entry.sinceTick,
          }),
        ),
      ),
      rides: Object.freeze(
        [...openRides.values()].map((entry) =>
          Object.freeze({
            rideId: entry.rideId,
            vehicleId: entry.vehicleId,
            pickupTick: entry.pickupTick,
            mode: entry.mode,
            incident: entry.incident,
          }),
        ),
      ),
      events: Object.freeze(
        [...eventLedger.entries()].map(([eventId, entry]) =>
          Object.freeze({ eventId, tick: entry.tick, type: entry.type }),
        ),
      ),
      rejections: Object.freeze(
        [...rejections.entries()]
          .map(([reason, count]) => Object.freeze({ reason, count }))
          .sort((left, right) => compareText(left.reason, right.reason)),
      ),
      lastRejection,
      counters,
    });
  }

  function stats(): DailyProgressStats {
    const values = [...rows.values()];
    return Object.freeze({
      version: DAILY_PROGRESS_VERSION,
      playerId,
      sessionId: boundSessionId,
      worldEpoch: boundWorldEpoch,
      dailyDate: set.dailyDate,
      instances: values.length,
      completed: values.filter((row) => row.state === 'COMPLETED').length,
      ineligible: values.filter((row) => row.state === 'INELIGIBLE').length,
      active: values.filter((row) => row.state === 'ACTIVE').length,
      vehicles: vehicles.size,
      openRides: openRides.size,
      retainedEvents: eventLedger.size,
      counters,
      rewards: calendarState.rewards.length,
    });
  }

  const boundState: DailyProgress = {
    version: DAILY_PROGRESS_VERSION,
    get playerId() {
      return playerId;
    },
    get sessionId() {
      return boundSessionId;
    },
    get worldEpoch() {
      return boundWorldEpoch;
    },
    set: () => set,
    calendarState: () => calendarState,
    advance,
    ingest,
    read,
    snapshot,
    stats,
  };
  return Object.freeze(boundState);
}

/**
 * Build a consumer for the current Academy world.
 *
 * The first set comes from the delivered 211 calendar step, so a session that starts mid-day reads
 * the persisted day and a fresh player gets the generated one. `state` is the 211 calendar state
 * (rewards included) when the caller restores a checkpoint.
 */
export function createDailyProgress(value: unknown): DailyProgress {
  return buildDailyProgress(value, null);
}

/**
 * Restore a persisted checkpoint.
 *
 * A restart is a new Academy session, so the consumer rebinds to the current world while keeping the
 * same rows, the same open rides and the same 211 reward ledger: a later event cannot re-award a
 * completed objective, and a ride that was open at the save is still attributed to its interval.
 */
export function restoreDailyProgress(
  snapshot: unknown,
  options: unknown,
): { readonly progress: DailyProgress; readonly rebound: boolean } {
  const data = plainFields(snapshot, snapshotFields, 'daily progress snapshot');
  for (const key of snapshotFields) requireRequired(data, key, 'daily progress snapshot');
  requireContract(
    data.schemaVersion === 1 && data.units === 'SI' && data.version === DAILY_PROGRESS_VERSION,
    'Unsupported daily progress snapshot version or units',
  );
  const option = plainFields(options, restoreOptionFields, 'daily progress restore');
  for (const key of restoreOptionFields) requireRequired(option, key, 'daily progress restore');
  const playerId = readId(data.playerId, 'player');
  const storedSessionId = readId(data.sessionId, 'session');
  const storedWorldEpoch = tick(data.worldEpoch);
  const sessionId = readId(option.sessionId, 'session');
  const worldEpoch = tick(option.worldEpoch);
  requireContract(
    worldEpoch >= storedWorldEpoch,
    'Restored daily progress cannot move back to an older world epoch',
  );
  const calendar = parseDailyCalendarState(data.calendar);
  requireContract(
    calendar.playerId === playerId,
    'Restored daily calendar belongs to another player',
  );
  requireContract(calendar.sets.length > 0, 'Restored daily calendar carries no set');
  const dailyDate = text(data.dailyDate);
  const current = dailyCalendarSet(calendar, dailyDate);
  requireContract(current !== null, 'Restored daily progress has no set for its own date');
  const set = parseDailyMissionSet(current);
  const instances = new Set(set.instances.map((instance) => instance.instanceId));
  const rows = list(data.rows, (entry) => readRow(entry, instances));
  requireContract(
    rows.length === DAILY_MISSIONS_PER_DAY,
    'Restored daily progress must carry one row per mission of the day',
  );
  requireContract(
    new Set(rows.map((row) => row.instanceId)).size === rows.length,
    'Restored daily progress repeats an instance',
  );
  const vehicles = list(data.vehicles, (entry) => {
    const value = plainFields(entry, vehicleFields, 'daily progress vehicle mode');
    for (const key of vehicleFields) requireRequired(value, key, 'daily progress vehicle mode');
    return Object.freeze({
      vehicleId: readId(value.vehicleId, 'daily progress vehicle'),
      mode: readMode(value.mode),
      sinceTick: tick(value.sinceTick),
    });
  });
  requireContract(
    vehicles.length <= DAILY_PROGRESS_LIMITS.vehicles,
    'Restored daily progress vehicle capacity exceeded',
  );
  const rides = list(data.rides, (entry) => {
    const value = plainFields(entry, openRideFields, 'daily progress open ride');
    for (const key of openRideFields) requireRequired(value, key, 'daily progress open ride');
    requireContract(
      typeof value.incident === 'boolean',
      'Daily progress open ride incident flag must be a boolean',
    );
    return Object.freeze({
      rideId: readId(value.rideId, 'daily progress ride'),
      vehicleId: readId(value.vehicleId, 'daily progress ride vehicle'),
      pickupTick: tick(value.pickupTick),
      mode: readMode(value.mode),
      incident: value.incident,
    });
  });
  requireContract(
    rides.length <= DAILY_PROGRESS_LIMITS.openRides,
    'Restored daily progress open ride capacity exceeded',
  );
  const events = list(data.events, (entry) => {
    const value = plainFields(entry, eventFields, 'daily progress event record');
    for (const key of eventFields) requireRequired(value, key, 'daily progress event record');
    return Object.freeze({
      eventId: readId(value.eventId, 'daily progress event'),
      tick: tick(value.tick),
      type: choice(value.type, SIMULATION_EVENT_TYPE_IDS),
    });
  });
  requireContract(
    events.length <= DAILY_PROGRESS_LIMITS.retainedEvents,
    'Restored daily progress event capacity exceeded',
  );
  const rejections = readRejections(data.rejections);
  const lastRejection =
    data.lastRejection === null
      ? null
      : (() => {
          const value = plainFields(
            data.lastRejection,
            lastRejectionFields,
            'daily progress last rejection',
          );
          for (const key of lastRejectionFields)
            requireRequired(value, key, 'daily progress last rejection');
          return Object.freeze({
            eventId: readId(value.eventId, 'daily progress event'),
            reason: choice(value.reason, dailyProgressReasons),
            observedAtMs: tick(value.observedAtMs),
          });
        })();
  const counters = readCounter(data.counters);
  requireContract(
    rejections.reduce((total, entry) => total + entry.count, 0) === counters.rejected,
    'Restored daily progress rejection counters disagree',
  );
  const progress = buildDailyProgress(
    {
      playerId,
      sessionId,
      worldEpoch,
      calendar: {
        timeZone: set.calendarTimeZone,
        observedAtMs: set.dayStartMs,
        utcOffsetSeconds: set.calendarOffsetSeconds,
        dayLengthSeconds: set.dayLengthSeconds,
      },
      capabilities: set.capabilitySnapshot,
      generatedAtMs: set.generatedAtMs,
      generatorVersion: set.generatorVersion,
      state: calendar,
    },
    { rows, vehicles, rides, events, rejections, lastRejection, counters },
  );
  return Object.freeze({ progress, rebound: sessionId !== storedSessionId });
}

/** Stable sorted list of the objectives of the day, used by reports and evidence rows. */
export function dailyProgressOrdered(
  read: DailyProgressRead,
): readonly DailyProgressInstanceRead[] {
  return Object.freeze([...read.instances].sort((left, right) => left.slot - right.slot));
}

/** Stable list of the refusal reasons of one read model, sorted by identity. */
export function dailyProgressReasonsOf(read: DailyProgressRead): readonly DailyProgressReason[] {
  return frozenSorted(
    read.rejections.map((entry) => entry.reason),
  ) as readonly DailyProgressReason[];
}

/** The XP proposal of one daily mission, re-exported so the UI never hardcodes the amount. */
export const DAILY_PROGRESS_REWARD_XP = DAILY_MISSION_XP;

/** Bound used by the UI parser: no daily read may declare more rows than the set. */
export const DAILY_PROGRESS_MAX_ROWS = DAILY_LIMITS.missionsPerDay;

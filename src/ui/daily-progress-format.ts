/**
 * 212 daily progress panel format.
 *
 * The panel is a read-only projection of the delivered 212 read model. It never counts an event,
 * never activates a reward and never keeps a second source of truth:
 *
 * - the objectives, targets, control requirements, XP amounts and evaluation limits are copied from
 *   the 211 daily set through the consumer's read model;
 * - the progress, the ride counts (MANUAL/LEARNING/AUTO/mixed), the ride interval, the collisions and
 *   the refusal counters are copied from the consumer rows;
 * - the time zone, the local date and the reset moment are formatted from the explicit
 *   `dayStartMs`/`expiresAtMs`/`utcOffsetSeconds` triple, so no host time zone and no wall clock can
 *   change what the panel shows.
 *
 * `parseDailyProgressSnapshot` refuses a snapshot that contradicts those contracts instead of
 * displaying an invented state: a `satisfied` flag that disagrees with its target, a completed row
 * without its reward, an expired row while the day is still active, a stated reason on a live row, a
 * rejection counter that does not match its rows, or a local date that does not match its window.
 *
 * The module has no clock, DOM, renderer, consumer or random source; it maps and formats plain data.
 */

export const DAILY_PROGRESS_PANEL_VERSION = '212-daily-progress-panel-v1' as const;

/** Version of the delivered 212 consumer read model the panel is allowed to display. */
export const DAILY_PROGRESS_READ_VERSION = '212-daily-progress-v1' as const;

export const DAILY_PROGRESS_PANEL_LIMITS = Object.freeze({
  version: DAILY_PROGRESS_PANEL_VERSION,
  /** Exactly three objectives per day, as delivered by 211. */
  instances: 3,
  /** Authoritative simulation rate the ride intervals are expressed in. */
  tickHz: 60,
  /** Distinct profile versions one objective can count. */
  distinctVersions: 64,
  /** Code units per identity. */
  idCodeUnits: 256,
  /** Code units per authored title. */
  titleCodeUnits: 160,
  /** Code units per authored objective label. */
  labelCodeUnits: 240,
  /** One read per open and one per accepted refresh; a closed panel re-reads nothing. */
  readsPerOpen: 1,
  globalListeners: 0,
});

export const DAILY_PROGRESS_TEXT = Object.freeze({
  trigger: 'Misiunile zilei',
  triggerDescription: 'Deschide panoul misiunilor zilei: obiective, progres, XP, fus orar și reset',
  title: 'Misiunile zilei',
  description:
    'Panoul citește consumatorul de progres al zilei: obiectivele, progresul, XP-ul promis, fusul orar, momentul de reset și motivul neeligibilității sunt exact cele raportate de contractele 211, 116 și 007. Panoul nu numără evenimente, nu acordă XP și nu recalculează progresul.',
  close: 'Închide',
  closeDescription: 'Închide panoul misiunilor zilei și revino la buton',
  bodyLabel: 'Obiectivele zilei',
  empty: 'Niciun set de misiuni zilnice citit încă.',
  none: 'Niciuna',
  readonlyNote:
    'Progresul vine din evenimente live ale sesiunii Academiei; panoul este o proiecție read-only și nu poate acorda recompense.',
  labels: Object.freeze({
    progress: 'Progres',
    control: 'Mod cerut',
    mode: 'Moduri înregistrate',
    xp: 'XP',
    reward: 'Recompensă',
    window: 'Fereastră',
    reset: 'Reset',
    timeZone: 'Fus orar',
    day: 'Zi locală',
    reason: 'Motiv',
    ride: 'Ultima cursă',
    rejected: 'Evenimente respinse',
    lastRejection: 'Ultimul eveniment respins',
    eligibility: 'Neeligibilitate',
    promised: 'XP promis',
    granted: 'XP acordat',
  }),
});

/** Closed state vocabulary of the consumer; copied so the UI cannot drift silently. */
export const DAILY_PROGRESS_STATES = ['ACTIVE', 'COMPLETED', 'EXPIRED', 'INELIGIBLE'] as const;
export type DailyProgressPanelState = (typeof DAILY_PROGRESS_STATES)[number];

/** Closed refusal vocabulary of the consumer. */
export const DAILY_PROGRESS_REASONS = [
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
export type DailyProgressPanelReason = (typeof DAILY_PROGRESS_REASONS)[number];

/** Closed control requirements and ride modes. */
export const DAILY_PROGRESS_CONFIG_REQUIREMENTS = ['MANUAL', 'LEARNING', 'ANY'] as const;
export const DAILY_PROGRESS_MODES = ['AUTO', 'MANUAL', 'LEARNING', 'MIXED'] as const;
export type DailyProgressPanelRequirement = (typeof DAILY_PROGRESS_CONFIG_REQUIREMENTS)[number];
export type DailyProgressPanelMode = (typeof DAILY_PROGRESS_MODES)[number];

/** 116 objective kinds, copied from the delivered vocabulary. */
export const DAILY_PROGRESS_OBJECTIVE_KINDS = [
  'DROPOFFS',
  'MANUAL_DROPOFFS',
  'CLEAN_DROPOFFS',
  'LEARNING_ACTIVATIONS',
  'DISTINCT_PROFILE_VERSIONS',
  'FULL_STOPS',
  'LANE_CHANGES',
  'LEADER_ACQUIRED',
] as const;
export type DailyProgressPanelObjectiveKind = (typeof DAILY_PROGRESS_OBJECTIVE_KINDS)[number];

export const DAILY_PROGRESS_DIFFICULTIES = ['EASY', 'NORMAL', 'HARD'] as const;
export const DAILY_PROGRESS_PHASES = ['PENDING', 'ACTIVE', 'EXPIRED'] as const;
export type DailyProgressPanelPhase = (typeof DAILY_PROGRESS_PHASES)[number];

export const DAILY_PROGRESS_STATE_LABELS: Readonly<Record<DailyProgressPanelState, string>> =
  Object.freeze({
    ACTIVE: 'În desfășurare',
    COMPLETED: 'Îndeplinit',
    EXPIRED: 'Expirat',
    INELIGIBLE: 'Neeligibil',
  });

export const DAILY_PROGRESS_PHASE_LABELS: Readonly<Record<DailyProgressPanelPhase, string>> =
  Object.freeze({
    PENDING: 'Nu a început',
    ACTIVE: 'Activă',
    EXPIRED: 'Încheiată',
  });

export const DAILY_PROGRESS_REASON_LABELS: Readonly<Record<DailyProgressPanelReason, string>> =
  Object.freeze({
    FOREIGN_SESSION: 'eveniment din altă sesiune (replay, experiment sau Haos)',
    STALE_EPOCH: 'eveniment dintr-un epoch vechi al lumii',
    OUTSIDE_DAY: 'eveniment în afara ferestrei zilei',
    DUPLICATE: 'eveniment deja procesat',
    IRRELEVANT: 'eveniment fără legătură cu obiectivele zilei',
    NO_RIDE: 'livrare fără îmbarcare: intervalul cursei lipsește',
    ALREADY_COMPLETED: 'obiectiv deja îndeplinit; recompensa nu se acordă a doua oară',
    UNSUPPORTED_OBJECTIVE: 'tip de obiectiv fără evaluator în consumator',
    EXPIRED: 'ziua s-a încheiat înainte de îndeplinire',
    WINDOW_CLOSED: 'fereastra de evaluare s-a închis',
    INCIDENT_BUDGET_EXCEEDED: 'bugetul de incidente a fost depășit',
  });

export const DAILY_PROGRESS_REQUIREMENT_LABELS: Readonly<
  Record<DailyProgressPanelRequirement, string>
> = Object.freeze({
  MANUAL: 'MANUAL (fără learning)',
  LEARNING: 'LEARNING',
  ANY: 'orice mod (AUTO, MANUAL sau LEARNING)',
});

export const DAILY_PROGRESS_MODE_LABELS: Readonly<Record<DailyProgressPanelMode, string>> =
  Object.freeze({
    AUTO: 'AUTO',
    MANUAL: 'MANUAL',
    LEARNING: 'LEARNING',
    MIXED: 'mixt',
  });

export const DAILY_PROGRESS_OBJECTIVE_LABELS: Readonly<
  Record<DailyProgressPanelObjectiveKind, string>
> = Object.freeze({
  DROPOFFS: 'Curse finalizate',
  MANUAL_DROPOFFS: 'Curse MANUAL',
  CLEAN_DROPOFFS: 'Curse fără incident',
  LEARNING_ACTIVATIONS: 'Activări LEARNING',
  DISTINCT_PROFILE_VERSIONS: 'Versiuni LEARNING distincte',
  FULL_STOPS: 'Opriri complete',
  LANE_CHANGES: 'Schimbări de bandă',
  LEADER_ACQUIRED: 'Situații de urmărire',
});

export interface DailyProgressRide {
  readonly rideId: string;
  readonly vehicleId: string;
  readonly pickupTick: number;
  readonly dropoffTick: number;
  readonly durationTicks: number;
  readonly durationSeconds: number;
  readonly mode: DailyProgressPanelMode;
  readonly clean: boolean;
}

export interface DailyProgressInstance {
  readonly instanceId: string;
  readonly slot: number;
  readonly familyId: string;
  readonly title: string;
  readonly label: string;
  readonly objectiveKind: DailyProgressPanelObjectiveKind;
  readonly controlRequirement: DailyProgressPanelRequirement;
  readonly learningKey: string | null;
  readonly target: number;
  readonly difficulty: (typeof DAILY_PROGRESS_DIFFICULTIES)[number];
  readonly zone: string | null;
  readonly windowTicks: number | null;
  readonly incidentBudget: number | null;
  readonly minDurationS: number | null;
  readonly allowsManual: boolean;
  readonly promisedXp: number;
  readonly grantedXp: number;
  readonly progress: number;
  readonly satisfied: boolean;
  readonly state: DailyProgressPanelState;
  readonly reason: DailyProgressPanelReason | null;
  readonly rides: number;
  readonly manualRides: number;
  readonly learningRides: number;
  readonly autoRides: number;
  readonly mixedRides: number;
  readonly modeMismatches: number;
  readonly collisions: number;
  readonly afterCompletionEvents: number;
  readonly firstTick: number | null;
  readonly deadlineTick: number | null;
  readonly completedAtMs: number | null;
  readonly rewardId: string | null;
  readonly rewardXp: number;
  readonly rewardGrantedAtMs: number | null;
  readonly distinctVersions: readonly string[];
  readonly lastRide: DailyProgressRide | null;
}

export interface DailyProgressCounters {
  readonly accepted: number;
  readonly duplicates: number;
  readonly rejected: number;
  readonly rewardsGranted: number;
  readonly rewardsDuplicate: number;
  readonly droppedEvents: number;
}

export interface DailyProgressSnapshot {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: typeof DAILY_PROGRESS_PANEL_VERSION;
  readonly playerId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly observedAtMs: number;
  readonly phase: DailyProgressPanelPhase;
  readonly dailyDate: string;
  readonly timeZone: string;
  readonly utcOffsetSeconds: number;
  readonly dayLengthSeconds: number;
  readonly dayStartMs: number;
  readonly expiresAtMs: number;
  readonly generatorVersion: string;
  readonly templateCatalogVersion: string;
  readonly capabilityGaps: readonly string[];
  readonly instances: readonly DailyProgressInstance[];
  readonly promisedXp: number;
  readonly grantedXp: number;
  readonly rewards: number;
  readonly counters: DailyProgressCounters;
  readonly rejections: readonly Readonly<{
    reason: DailyProgressPanelReason;
    count: number;
  }>[];
  readonly lastRejection: Readonly<{
    eventId: string;
    reason: DailyProgressPanelReason;
    observedAtMs: number;
  }> | null;
}

export interface DailyProgressInstanceView {
  readonly instanceId: string;
  readonly slot: number;
  readonly orderLabel: string;
  readonly title: string;
  readonly label: string;
  readonly kindLabel: string;
  readonly objectiveLabel: string;
  readonly target: number;
  readonly progress: number;
  readonly progressLabel: string;
  readonly percent: number;
  readonly satisfied: boolean;
  readonly state: DailyProgressPanelState;
  readonly stateLabel: string;
  readonly reason: DailyProgressPanelReason | null;
  readonly reasonLabel: string | null;
  readonly controlLabel: string;
  readonly modeLabel: string;
  readonly rideLabel: string;
  readonly lastRide: DailyProgressRide | null;
  readonly xpLabel: string;
  readonly rewardLabel: string;
  readonly limitsLabel: string;
  readonly eligibilityLabel: string;
  readonly description: string;
}

export interface DailyProgressPanelCounts {
  readonly instances: number;
  readonly active: number;
  readonly completed: number;
  readonly expired: number;
  readonly ineligible: number;
  readonly rides: number;
  readonly manualRides: number;
  readonly learningRides: number;
  readonly autoRides: number;
  readonly mixedRides: number;
  readonly modeMismatches: number;
  readonly rejections: number;
  readonly rewards: number;
}

export interface DailyProgressPanelView {
  readonly signature: string;
  readonly heading: string;
  readonly description: string;
  readonly summary: string;
  readonly empty: boolean;
  readonly ariaLabel: string;
  readonly phase: DailyProgressPanelPhase;
  readonly phaseLabel: string;
  readonly dayLabel: string;
  readonly timeZoneLabel: string;
  readonly resetLabel: string;
  readonly windowLabel: string;
  readonly xpLabel: string;
  readonly rejectionLabel: string;
  readonly counts: DailyProgressPanelCounts;
  readonly instances: readonly DailyProgressInstanceView[];
}

// ---------------------------------------------------------------------------------------------
// Strict plain-data readers. The UI cannot import the domain validators, so it keeps its own
// closed-field parser; the tests assert the vocabularies above are identical to the delivered ones.
// ---------------------------------------------------------------------------------------------

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${label} must be plain data`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new Error(`${label} must be plain data`);
  const data: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') throw new Error(`${label} keys`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      throw new Error(`${label} descriptors`);
    data[key] = descriptor.value;
  }
  return data;
}

function fields(
  data: Record<string, unknown>,
  required: readonly string[],
  label: string,
): Record<string, unknown> {
  for (const key of Object.keys(data))
    if (!required.includes(key)) throw new Error(`${label} has an unknown field: ${key}`);
  for (const key of required)
    if (!Object.prototype.hasOwnProperty.call(data, key))
      throw new Error(`${label} is missing the field: ${key}`);
  return data;
}

function identifier(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > DAILY_PROGRESS_PANEL_LIMITS.idCodeUnits
  )
    throw new Error(`Daily progress ${label} identity`);
  return value;
}

function boundedText(value: unknown, maximum: number, label: string): string {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > maximum
  )
    throw new Error(`Daily progress ${label} text`);
  return value;
}

function integer(value: unknown, minimum: number, maximum: number, label: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    throw new Error(`Daily progress ${label} number`);
  return value;
}

function nullableInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number | null {
  return value === null ? null : integer(value, minimum, maximum, label);
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Daily progress ${label} flag`);
  return value;
}

function choice<T extends string>(value: unknown, options: readonly T[], label: string): T {
  if (typeof value !== 'string' || !(options as readonly string[]).includes(value))
    throw new Error(`Daily progress ${label} vocabulary`);
  return value as T;
}

function boundedList(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`Daily progress ${label} list`);
  return value;
}

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

const instanceFields = [
  'instanceId',
  'slot',
  'familyId',
  'title',
  'label',
  'objectiveKind',
  'controlRequirement',
  'learningKey',
  'target',
  'difficulty',
  'zone',
  'windowTicks',
  'incidentBudget',
  'minDurationS',
  'allowsManual',
  'promisedXp',
  'grantedXp',
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

const counterFields = [
  'accepted',
  'duplicates',
  'rejected',
  'rewardsGranted',
  'rewardsDuplicate',
  'droppedEvents',
] as const;

const rejectionFields = ['reason', 'count'] as const;
const lastRejectionFields = ['eventId', 'reason', 'observedAtMs'] as const;

const snapshotFields = [
  'schemaVersion',
  'units',
  'version',
  'playerId',
  'sessionId',
  'worldEpoch',
  'observedAtMs',
  'phase',
  'dailyDate',
  'timeZone',
  'utcOffsetSeconds',
  'dayLengthSeconds',
  'dayStartMs',
  'expiresAtMs',
  'generatorVersion',
  'templateCatalogVersion',
  'capabilityGaps',
  'instances',
  'promisedXp',
  'grantedXp',
  'rewards',
  'counters',
  'rejections',
  'lastRejection',
] as const;

function parseRide(value: unknown): DailyProgressRide {
  const data = fields(record(value, 'Daily progress ride'), rideFields, 'Daily progress ride');
  const pickupTick = integer(data.pickupTick, 0, Number.MAX_SAFE_INTEGER, 'ride pickup');
  const dropoffTick = integer(data.dropoffTick, 0, Number.MAX_SAFE_INTEGER, 'ride dropoff');
  const durationTicks = integer(data.durationTicks, 0, Number.MAX_SAFE_INTEGER, 'ride duration');
  if (dropoffTick < pickupTick)
    throw new Error('Daily progress ride interval ends before it starts');
  if (durationTicks !== dropoffTick - pickupTick)
    throw new Error('Daily progress ride duration does not match its interval');
  const durationSeconds =
    typeof data.durationSeconds === 'number' && Number.isFinite(data.durationSeconds)
      ? data.durationSeconds
      : Number.NaN;
  if (
    !Number.isFinite(durationSeconds) ||
    Math.abs(durationSeconds - durationTicks / DAILY_PROGRESS_PANEL_LIMITS.tickHz) > 1e-6
  )
    throw new Error('Daily progress ride duration in seconds disagrees with its ticks');
  return Object.freeze({
    rideId: identifier(data.rideId, 'ride'),
    vehicleId: identifier(data.vehicleId, 'ride vehicle'),
    pickupTick,
    dropoffTick,
    durationTicks,
    durationSeconds,
    mode: choice(data.mode, DAILY_PROGRESS_MODES, 'ride mode'),
    clean: boolean(data.clean, 'ride clean'),
  });
}

function parseInstance(value: unknown): DailyProgressInstance {
  const data = fields(
    record(value, 'Daily progress instance'),
    instanceFields,
    'Daily progress instance',
  );
  const state = choice(data.state, DAILY_PROGRESS_STATES, 'instance state');
  const reason =
    data.reason === null ? null : choice(data.reason, DAILY_PROGRESS_REASONS, 'instance reason');
  if (state === 'ACTIVE' || state === 'COMPLETED') {
    if (reason !== null) throw new Error('Daily progress live row carries a reason');
  } else if (state === 'EXPIRED') {
    if (reason !== 'EXPIRED') throw new Error('Daily progress expired row reports EXPIRED');
  } else if (reason === null) throw new Error('Daily progress ineligible row needs a reason');
  const target = integer(data.target, 1, 1_000_000, 'instance target');
  const progress = integer(data.progress, 0, target, 'instance progress');
  const satisfied = boolean(data.satisfied, 'instance satisfied');
  if (satisfied !== progress >= target)
    throw new Error('Daily progress satisfied flag contradicts its target');
  if (state === 'COMPLETED' && !satisfied)
    throw new Error('Daily progress completed row is not satisfied');
  const rewardXp = integer(data.rewardXp, 0, 1_000_000, 'instance reward');
  const promisedXp = integer(data.promisedXp, 0, 1_000_000, 'instance promised XP');
  if (promisedXp !== rewardXp)
    throw new Error('Daily progress promised XP is not the authored reward');
  const grantedXp = integer(data.grantedXp, 0, 1_000_000, 'instance granted XP');
  if (state === 'COMPLETED' ? grantedXp !== rewardXp : grantedXp !== 0)
    throw new Error('Daily progress granted XP contradicts the row state');
  const rewardId = data.rewardId === null ? null : identifier(data.rewardId, 'reward');
  const completedAtMs = nullableInteger(
    data.completedAtMs,
    0,
    Number.MAX_SAFE_INTEGER,
    'instance completion instant',
  );
  const rewardGrantedAtMs = nullableInteger(
    data.rewardGrantedAtMs,
    0,
    Number.MAX_SAFE_INTEGER,
    'instance grant instant',
  );
  if (state === 'COMPLETED') {
    if (rewardId === null) throw new Error('Daily progress completed row has no reward identity');
    if (completedAtMs === null || rewardGrantedAtMs === null)
      throw new Error('Daily progress completed row has no completion instant');
  } else if (rewardId !== null || completedAtMs !== null || rewardGrantedAtMs !== null)
    throw new Error('Daily progress unfinished row carries a reward');
  const lastRide = data.lastRide === null ? null : parseRide(data.lastRide);
  const distinctVersions = boundedList(data.distinctVersions, 'instance version').map((entry) =>
    identifier(entry, 'profile version'),
  );
  if (distinctVersions.length > DAILY_PROGRESS_PANEL_LIMITS.distinctVersions)
    throw new Error('Daily progress distinct version capacity');
  if (new Set(distinctVersions).size !== distinctVersions.length)
    throw new Error('Daily progress distinct versions repeat');
  const minDurationS =
    data.minDurationS === null
      ? null
      : (() => {
          if (
            typeof data.minDurationS !== 'number' ||
            !Number.isFinite(data.minDurationS) ||
            data.minDurationS < 0 ||
            data.minDurationS > 3_600
          )
            throw new Error('Daily progress minimum stop duration');
          return data.minDurationS;
        })();
  return Object.freeze({
    instanceId: identifier(data.instanceId, 'instance'),
    slot: integer(data.slot, 1, DAILY_PROGRESS_PANEL_LIMITS.instances, 'instance slot'),
    familyId: identifier(data.familyId, 'instance family'),
    title: boundedText(data.title, DAILY_PROGRESS_PANEL_LIMITS.titleCodeUnits, 'instance title'),
    label: boundedText(data.label, DAILY_PROGRESS_PANEL_LIMITS.labelCodeUnits, 'instance label'),
    objectiveKind: choice(data.objectiveKind, DAILY_PROGRESS_OBJECTIVE_KINDS, 'objective kind'),
    controlRequirement: choice(
      data.controlRequirement,
      DAILY_PROGRESS_CONFIG_REQUIREMENTS,
      'control requirement',
    ),
    learningKey: data.learningKey === null ? null : identifier(data.learningKey, 'learning key'),
    target,
    difficulty: choice(data.difficulty, DAILY_PROGRESS_DIFFICULTIES, 'instance difficulty'),
    zone: data.zone === null ? null : identifier(data.zone, 'instance zone'),
    windowTicks: nullableInteger(
      data.windowTicks,
      1,
      Number.MAX_SAFE_INTEGER,
      'instance evaluation window',
    ),
    incidentBudget: nullableInteger(data.incidentBudget, 0, 1_000, 'instance incident budget'),
    minDurationS,
    allowsManual: boolean(data.allowsManual, 'instance manual allowance'),
    promisedXp,
    grantedXp,
    progress,
    satisfied,
    state,
    reason,
    rides: integer(data.rides, 0, 1_000_000, 'instance rides'),
    manualRides: integer(data.manualRides, 0, 1_000_000, 'instance manual rides'),
    learningRides: integer(data.learningRides, 0, 1_000_000, 'instance learning rides'),
    autoRides: integer(data.autoRides, 0, 1_000_000, 'instance auto rides'),
    mixedRides: integer(data.mixedRides, 0, 1_000_000, 'instance mixed rides'),
    modeMismatches: integer(data.modeMismatches, 0, 1_000_000, 'instance mode mismatches'),
    collisions: integer(data.collisions, 0, 1_000_000, 'instance collisions'),
    afterCompletionEvents: integer(
      data.afterCompletionEvents,
      0,
      1_000_000,
      'instance post-completion events',
    ),
    firstTick: nullableInteger(data.firstTick, 0, Number.MAX_SAFE_INTEGER, 'instance first tick'),
    deadlineTick: nullableInteger(
      data.deadlineTick,
      0,
      Number.MAX_SAFE_INTEGER,
      'instance deadline',
    ),
    completedAtMs,
    rewardId,
    rewardXp,
    rewardGrantedAtMs,
    distinctVersions: Object.freeze(distinctVersions),
    lastRide,
  });
}

function readCounters(value: unknown): DailyProgressCounters {
  const data = fields(
    record(value, 'Daily progress counters'),
    counterFields,
    'Daily progress counters',
  );
  return Object.freeze({
    accepted: integer(data.accepted, 0, Number.MAX_SAFE_INTEGER, 'accepted events'),
    duplicates: integer(data.duplicates, 0, Number.MAX_SAFE_INTEGER, 'duplicate events'),
    rejected: integer(data.rejected, 0, Number.MAX_SAFE_INTEGER, 'rejected events'),
    rewardsGranted: integer(data.rewardsGranted, 0, Number.MAX_SAFE_INTEGER, 'granted rewards'),
    rewardsDuplicate: integer(
      data.rewardsDuplicate,
      0,
      Number.MAX_SAFE_INTEGER,
      'duplicate rewards',
    ),
    droppedEvents: integer(data.droppedEvents, 0, Number.MAX_SAFE_INTEGER, 'dropped events'),
  });
}

function validateZonedDay(
  dayStartMs: number,
  utcOffsetSeconds: number,
  dayLengthSeconds: number,
): void {
  if (Math.abs(utcOffsetSeconds) > 50_400)
    throw new Error('Daily progress UTC offset is outside the real world range');
  if (![82_800, 86_400, 90_000].includes(dayLengthSeconds))
    throw new Error('Daily progress day length must be 23, 24 or 25 hours');
  if (dayStartMs < 0) throw new Error('Daily progress day start is before the identity anchor');
}

/** `YYYY-MM-DD` of the local date whose midnight is `dayStartMs` under `utcOffsetSeconds`. */
export function dailyProgressDateLabel(dayStartMs: number, utcOffsetSeconds: number): string {
  const shifted = dayStartMs + utcOffsetSeconds * 1_000;
  return new Date(shifted).toISOString().slice(0, 10);
}

/** Deterministic `YYYY-MM-DD HH:mm` of an instant under an explicit offset; never the host zone. */
export function formatDailyProgressInstant(epochMs: number, utcOffsetSeconds: number): string {
  const iso = new Date(epochMs + utcOffsetSeconds * 1_000).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

export function formatDailyProgressOffset(utcOffsetSeconds: number): string {
  const sign = utcOffsetSeconds < 0 ? '-' : '+';
  const absolute = Math.abs(utcOffsetSeconds);
  const hours = String(Math.floor(absolute / 3_600)).padStart(2, '0');
  const minutes = String(Math.floor((absolute % 3_600) / 60)).padStart(2, '0');
  return `UTC${sign}${hours}:${minutes}`;
}

/** Validates one composed read model; anything the delivered contracts cannot report is refused. */
export function parseDailyProgressSnapshot(value: unknown): DailyProgressSnapshot {
  const data = fields(
    record(value, 'Daily progress snapshot'),
    snapshotFields,
    'Daily progress snapshot',
  );
  if (
    data.schemaVersion !== 1 ||
    data.units !== 'SI' ||
    data.version !== DAILY_PROGRESS_READ_VERSION
  )
    throw new Error('Daily progress snapshot contract version');
  const instances = boundedList(data.instances, 'instance').map(parseInstance);
  if (instances.length !== DAILY_PROGRESS_PANEL_LIMITS.instances)
    throw new Error('A daily read carries exactly three objectives');
  if (new Set(instances.map((entry) => entry.instanceId)).size !== instances.length)
    throw new Error('Daily progress snapshot repeats an instance');
  if (new Set(instances.map((entry) => entry.slot)).size !== instances.length)
    throw new Error('Daily progress snapshot repeats a slot');
  for (const instance of instances) {
    if (instance.windowTicks === null && instance.deadlineTick !== null)
      throw new Error('Daily progress deadline without an evaluation window');
    if (instance.incidentBudget === null && instance.collisions > 0)
      throw new Error('Daily progress collisions without an incident budget');
  }
  const dayStartMs = integer(data.dayStartMs, 0, Number.MAX_SAFE_INTEGER, 'day start');
  const expiresAtMs = integer(data.expiresAtMs, 0, Number.MAX_SAFE_INTEGER, 'day expiry');
  const utcOffsetSeconds = integer(data.utcOffsetSeconds, -50_400, 50_400, 'UTC offset');
  const dayLengthSeconds = integer(data.dayLengthSeconds, 82_800, 90_000, 'day length');
  validateZonedDay(dayStartMs, utcOffsetSeconds, dayLengthSeconds);
  if (expiresAtMs !== dayStartMs + dayLengthSeconds * 1_000)
    throw new Error('Daily progress day window does not match its declared length');
  const observedAtMs = integer(data.observedAtMs, 0, Number.MAX_SAFE_INTEGER, 'observed instant');
  const phase = choice(data.phase, DAILY_PROGRESS_PHASES, 'day phase');
  if (phase === 'ACTIVE' && !(dayStartMs <= observedAtMs && observedAtMs < expiresAtMs))
    throw new Error('Daily progress day is not active at the observed instant');
  if (phase === 'PENDING' && observedAtMs >= dayStartMs)
    throw new Error('Daily progress day is not pending at the observed instant');
  if (phase === 'EXPIRED' && observedAtMs < expiresAtMs)
    throw new Error('Daily progress day is not expired at the observed instant');
  const dailyDate = boundedText(data.dailyDate, 16, 'daily date');
  if (dailyDate !== dailyProgressDateLabel(dayStartMs, utcOffsetSeconds))
    throw new Error('Daily progress local date does not match its day window');
  if (phase === 'EXPIRED' && instances.some((entry) => entry.state === 'ACTIVE'))
    throw new Error('Daily progress expired day still reports an active objective');
  const promisedXp = integer(data.promisedXp, 0, 1_000_000, 'promised XP');
  const grantedXp = integer(data.grantedXp, 0, 1_000_000, 'granted XP');
  const rewards = integer(data.rewards, 0, DAILY_PROGRESS_PANEL_LIMITS.instances, 'reward count');
  const expectedPromised = instances.reduce((total, entry) => total + entry.rewardXp, 0);
  if (promisedXp !== expectedPromised)
    throw new Error('Daily progress promised XP does not match its objectives');
  const expectedGranted = instances.reduce((total, entry) => total + entry.grantedXp, 0);
  if (grantedXp !== expectedGranted)
    throw new Error('Daily progress granted XP does not match its objectives');
  if (rewards !== instances.filter((entry) => entry.state === 'COMPLETED').length)
    throw new Error('Daily progress reward count does not match its completed objectives');
  const counters = readCounters(data.counters);
  const rejections = boundedList(data.rejections, 'rejection').map((entry) => {
    const row = fields(
      record(entry, 'Daily progress rejection'),
      rejectionFields,
      'Daily progress rejection',
    );
    return Object.freeze({
      reason: choice(row.reason, DAILY_PROGRESS_REASONS, 'rejection reason'),
      count: integer(row.count, 0, Number.MAX_SAFE_INTEGER, 'rejection count'),
    });
  });
  if (new Set(rejections.map((entry) => entry.reason)).size !== rejections.length)
    throw new Error('Daily progress rejection board repeats a reason');
  if (rejections.reduce((total, entry) => total + entry.count, 0) !== counters.rejected)
    throw new Error('Daily progress rejection counters disagree');
  const lastRejection =
    data.lastRejection === null
      ? null
      : (() => {
          const row = fields(
            record(data.lastRejection, 'Daily progress last rejection'),
            lastRejectionFields,
            'Daily progress last rejection',
          );
          return Object.freeze({
            eventId: identifier(row.eventId, 'event'),
            reason: choice(row.reason, DAILY_PROGRESS_REASONS, 'last rejection reason'),
            observedAtMs: integer(
              row.observedAtMs,
              0,
              Number.MAX_SAFE_INTEGER,
              'last rejection instant',
            ),
          });
        })();
  const capabilityGaps = boundedList(data.capabilityGaps, 'capability gap').map((entry) =>
    identifier(entry, 'capability gap'),
  );
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    version: DAILY_PROGRESS_PANEL_VERSION,
    playerId: identifier(data.playerId, 'player'),
    sessionId: identifier(data.sessionId, 'session'),
    worldEpoch: integer(data.worldEpoch, 0, Number.MAX_SAFE_INTEGER, 'world epoch'),
    observedAtMs,
    phase,
    dailyDate,
    timeZone: boundedText(data.timeZone, 64, 'time zone'),
    utcOffsetSeconds,
    dayLengthSeconds,
    dayStartMs,
    expiresAtMs,
    generatorVersion: identifier(data.generatorVersion, 'generator version'),
    templateCatalogVersion: identifier(data.templateCatalogVersion, 'template catalog version'),
    capabilityGaps: Object.freeze(capabilityGaps),
    instances: Object.freeze(instances),
    promisedXp,
    grantedXp,
    rewards,
    counters,
    rejections: Object.freeze(rejections),
    lastRejection,
  });
}

// ---------------------------------------------------------------------------------------------
// Projection: text, labels and deterministic bar percentages.
// ---------------------------------------------------------------------------------------------

function percentOf(progress: number, target: number): number {
  if (target <= 0) return 100;
  const ratio = (progress / target) * 100;
  return Math.max(0, Math.min(100, Math.round(ratio)));
}

function modeBreakdown(instance: DailyProgressInstance): string {
  const parts = [
    `${instance.manualRides} MANUAL`,
    `${instance.learningRides} LEARNING`,
    `${instance.autoRides} AUTO`,
    `${instance.mixedRides} mixt`,
  ];
  return `${parts.join(', ')} (${instance.rides} curse în total)`;
}

function rideLabelOf(ride: DailyProgressRide | null): string {
  if (ride === null) return DAILY_PROGRESS_TEXT.none;
  const clean = ride.clean ? 'fără incident' : 'cu incident';
  return `${ride.rideId}: ${ride.pickupTick} → ${ride.dropoffTick} (${ride.durationSeconds.toFixed(1)} s), ${DAILY_PROGRESS_MODE_LABELS[ride.mode]}, ${clean}`;
}

function limitsLabelOf(instance: DailyProgressInstance): string {
  const parts: string[] = [];
  parts.push(
    instance.windowTicks === null
      ? 'fereastră: până la finalizarea zilei'
      : `fereastră: ${instance.windowTicks} tick-uri, termen ${instance.deadlineTick ?? 0}`,
  );
  parts.push(
    instance.incidentBudget === null
      ? 'fără buget de incidente'
      : `incidente ${instance.collisions} din ${instance.incidentBudget}`,
  );
  if (instance.minDurationS !== null) parts.push(`oprire minimă ${instance.minDurationS} s`);
  if (instance.zone !== null) parts.push(`zonă ${instance.zone}`);
  if (instance.learningKey !== null) parts.push(`cheie ${instance.learningKey}`);
  return parts.join('; ');
}

function eligibilityLabelOf(instance: DailyProgressInstance): string {
  if (instance.modeMismatches === 0) return 'Niciun eveniment eligibil nu a fost refuzat pe mod.';
  return `${instance.modeMismatches} evenimente de tip potrivit au fost refuzate pe mod (alt mod decât ${DAILY_PROGRESS_REQUIREMENT_LABELS[instance.controlRequirement]}).`;
}

function instanceView(
  instance: DailyProgressInstance,
  total: number,
  dayExpired: boolean,
): DailyProgressInstanceView {
  const kindLabel = DAILY_PROGRESS_OBJECTIVE_LABELS[instance.objectiveKind];
  const reasonLabel =
    instance.reason === null ? null : DAILY_PROGRESS_REASON_LABELS[instance.reason];
  const progressLabel = `${instance.progress} din ${instance.target}`;
  const rewardLabel =
    instance.state === 'COMPLETED'
      ? `${instance.grantedXp} XP acordat la ${formatDailyProgressInstant(instance.rewardGrantedAtMs ?? 0, 0)} UTC (${instance.rewardId ?? DAILY_PROGRESS_TEXT.none})`
      : `${instance.promisedXp} XP promis, neacordat încă`;
  const orderLabel = `Obiectivul ${instance.slot} din ${total}`;
  const description = [
    `${orderLabel}: ${instance.title}.`,
    `${kindLabel} · ${instance.label} · țintă ${instance.target}.`,
    `Mod cerut: ${DAILY_PROGRESS_REQUIREMENT_LABELS[instance.controlRequirement]}.`,
    `Progres ${progressLabel}.`,
    `${DAILY_PROGRESS_TEXT.labels.mode}: ${modeBreakdown(instance)}.`,
    `${DAILY_PROGRESS_TEXT.labels.window}: ${limitsLabelOf(instance)}.`,
    dayExpired ? 'Ziua este încheiată.' : '',
    reasonLabel === null ? '' : `Motiv: ${reasonLabel}.`,
  ]
    .filter((part) => part.length > 0)
    .join(' ');
  return Object.freeze({
    instanceId: instance.instanceId,
    slot: instance.slot,
    orderLabel,
    title: instance.title,
    label: instance.label,
    kindLabel,
    objectiveLabel: `${kindLabel} · ${instance.label}`,
    target: instance.target,
    progress: instance.progress,
    progressLabel,
    percent: percentOf(instance.progress, instance.target),
    satisfied: instance.satisfied,
    state: instance.state,
    stateLabel: DAILY_PROGRESS_STATE_LABELS[instance.state],
    reason: instance.reason,
    reasonLabel,
    controlLabel: DAILY_PROGRESS_REQUIREMENT_LABELS[instance.controlRequirement],
    modeLabel: modeBreakdown(instance),
    rideLabel: rideLabelOf(instance.lastRide),
    lastRide: instance.lastRide,
    xpLabel:
      instance.state === 'COMPLETED'
        ? `${instance.grantedXp} XP acordat`
        : `${instance.promisedXp} XP promis`,
    rewardLabel,
    limitsLabel: limitsLabelOf(instance),
    eligibilityLabel: eligibilityLabelOf(instance),
    description,
  });
}

function rejectionLabelOf(snapshot: DailyProgressSnapshot): string {
  if (snapshot.rejections.length === 0)
    return `${DAILY_PROGRESS_TEXT.labels.rejected}: ${DAILY_PROGRESS_TEXT.none}.`;
  const parts = snapshot.rejections.map(
    (entry) => `${entry.count} × ${entry.reason} (${DAILY_PROGRESS_REASON_LABELS[entry.reason]})`,
  );
  const last =
    snapshot.lastRejection === null
      ? ''
      : ` Ultimul: ${snapshot.lastRejection.eventId} · ${snapshot.lastRejection.reason} · ${formatDailyProgressInstant(snapshot.lastRejection.observedAtMs, snapshot.utcOffsetSeconds)}.`;
  return `${DAILY_PROGRESS_TEXT.labels.rejected}: ${parts.join(', ')}.${last}`;
}

/** Deterministic view of one parsed read model; it changes only with real progress. */
export function projectDailyProgressPanel(snapshot: DailyProgressSnapshot): DailyProgressPanelView {
  const total = snapshot.instances.length;
  const dayExpired = snapshot.phase === 'EXPIRED';
  const instances = snapshot.instances
    .slice()
    .sort((left, right) => left.slot - right.slot)
    .map((instance) => instanceView(instance, total, dayExpired));
  const counts: DailyProgressPanelCounts = Object.freeze({
    instances: total,
    active: instances.filter((entry) => entry.state === 'ACTIVE').length,
    completed: instances.filter((entry) => entry.state === 'COMPLETED').length,
    expired: instances.filter((entry) => entry.state === 'EXPIRED').length,
    ineligible: instances.filter((entry) => entry.state === 'INELIGIBLE').length,
    rides: snapshot.instances.reduce((sum, entry) => sum + entry.rides, 0),
    manualRides: snapshot.instances.reduce((sum, entry) => sum + entry.manualRides, 0),
    learningRides: snapshot.instances.reduce((sum, entry) => sum + entry.learningRides, 0),
    autoRides: snapshot.instances.reduce((sum, entry) => sum + entry.autoRides, 0),
    mixedRides: snapshot.instances.reduce((sum, entry) => sum + entry.mixedRides, 0),
    modeMismatches: snapshot.instances.reduce((sum, entry) => sum + entry.modeMismatches, 0),
    rejections: snapshot.counters.rejected,
    rewards: snapshot.rewards,
  });
  const summary = [
    `Ziua ${snapshot.dailyDate}: ${counts.completed} îndeplinite, ${counts.active} în desfășurare, ${counts.expired} expirate, ${counts.ineligible} neeligibile.`,
    `${snapshot.promisedXp} XP promis, ${snapshot.grantedXp} XP acordat, ${counts.rewards} recompense unice.`,
    `Curse: ${counts.manualRides} MANUAL, ${counts.learningRides} LEARNING, ${counts.autoRides} AUTO, ${counts.mixedRides} mixte.`,
    `${counts.rejections} evenimente respinse explicit.`,
  ].join(' ');
  const timeZoneLabel = `${snapshot.timeZone} (${formatDailyProgressOffset(snapshot.utcOffsetSeconds)})`;
  return Object.freeze({
    signature: JSON.stringify([
      snapshot.dailyDate,
      snapshot.observedAtMs,
      snapshot.phase,
      counts,
      snapshot.promisedXp,
      snapshot.grantedXp,
      instances.map((entry) => [
        entry.instanceId,
        entry.progress,
        entry.state,
        entry.reason,
        entry.lastRide === null ? null : entry.lastRide.rideId,
      ]),
      snapshot.rejections,
    ]),
    heading: DAILY_PROGRESS_TEXT.title,
    description: DAILY_PROGRESS_TEXT.description,
    summary,
    empty: false,
    ariaLabel: `${DAILY_PROGRESS_TEXT.title} · ${summary}`,
    phase: snapshot.phase,
    phaseLabel: DAILY_PROGRESS_PHASE_LABELS[snapshot.phase],
    dayLabel: `${DAILY_PROGRESS_TEXT.labels.day}: ${snapshot.dailyDate} (${timeZoneLabel})`,
    timeZoneLabel: `${DAILY_PROGRESS_TEXT.labels.timeZone}: ${timeZoneLabel}`,
    resetLabel: `${DAILY_PROGRESS_TEXT.labels.reset}: ${formatDailyProgressInstant(snapshot.expiresAtMs, snapshot.utcOffsetSeconds)} (${timeZoneLabel})`,
    windowLabel: `${DAILY_PROGRESS_TEXT.labels.window}: ${formatDailyProgressInstant(snapshot.dayStartMs, snapshot.utcOffsetSeconds)} → ${formatDailyProgressInstant(snapshot.expiresAtMs, snapshot.utcOffsetSeconds)} (${snapshot.dayLengthSeconds / 3_600} h) · ${DAILY_PROGRESS_PHASE_LABELS[snapshot.phase]}`,
    xpLabel: `${snapshot.grantedXp} XP acordat din ${snapshot.promisedXp} XP promis (${snapshot.rewards} recompense unice)`,
    rejectionLabel: rejectionLabelOf(snapshot),
    counts,
    instances: Object.freeze(instances),
  });
}

/** Empty view used when the host has no daily read yet; it claims nothing about progress. */
export function emptyDailyProgressView(): DailyProgressPanelView {
  const counts: DailyProgressPanelCounts = Object.freeze({
    instances: 0,
    active: 0,
    completed: 0,
    expired: 0,
    ineligible: 0,
    rides: 0,
    manualRides: 0,
    learningRides: 0,
    autoRides: 0,
    mixedRides: 0,
    modeMismatches: 0,
    rejections: 0,
    rewards: 0,
  });
  return Object.freeze({
    signature: JSON.stringify(['EMPTY']),
    heading: DAILY_PROGRESS_TEXT.title,
    description: DAILY_PROGRESS_TEXT.description,
    summary: DAILY_PROGRESS_TEXT.empty,
    empty: true,
    ariaLabel: `${DAILY_PROGRESS_TEXT.title} · ${DAILY_PROGRESS_TEXT.empty}`,
    phase: 'PENDING' as const,
    phaseLabel: DAILY_PROGRESS_PHASE_LABELS.PENDING,
    dayLabel: `${DAILY_PROGRESS_TEXT.labels.day}: ${DAILY_PROGRESS_TEXT.none}`,
    timeZoneLabel: `${DAILY_PROGRESS_TEXT.labels.timeZone}: ${DAILY_PROGRESS_TEXT.none}`,
    resetLabel: `${DAILY_PROGRESS_TEXT.labels.reset}: ${DAILY_PROGRESS_TEXT.none}`,
    windowLabel: `${DAILY_PROGRESS_TEXT.labels.window}: ${DAILY_PROGRESS_TEXT.none}`,
    xpLabel: `0 XP acordat din 0 XP promis (0 recompense unice)`,
    rejectionLabel: `${DAILY_PROGRESS_TEXT.labels.rejected}: ${DAILY_PROGRESS_TEXT.none}.`,
    counts,
    instances: Object.freeze([]),
  });
}

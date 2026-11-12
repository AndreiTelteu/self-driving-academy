import type {
  ChallengeDailySet,
  ChallengeDirectorInstance,
  ChallengeRecord,
  ChallengeReaction,
  ChallengeRecordComparison,
} from '../missions';

/**
 * 233 challenge panel format.
 *
 * The panel is a read-only projection of the delivered contracts and it never owns a challenge:
 *
 * - the offer, the live attempt and the terminal result are copied from the real 232 instance,
 *   including its objective snapshot, deadline, incident budget, authored XP and terminal reason;
 * - the personal records are copied from the 233 record store;
 * - the daily set is copied from the deterministic 233 variety over the real 231 catalog;
 * - the reaction is the 233 reaction derived from that same result.
 *
 * `parseChallengePanelSnapshot` refuses a snapshot that contradicts those contracts instead of
 * displaying an invented challenge: an offer must really be `OFFERED`, a result must be terminal,
 * an XP-eligible result must be an Academy completion, a record best must be at or above its target,
 * the daily set must be exactly three distinct manual-capable challenges and the reaction must match
 * the current instance. The module has no clock, DOM, renderer, director or ledger, and it never
 * mutates a contract.
 */
export const CHALLENGE_PANEL_VERSION = '233-challenge-panel-v1' as const;
export const CHALLENGE_PANEL_SNAPSHOT_VERSION = '233-challenge-panel-snapshot-v1' as const;

export const CHALLENGE_PANEL_LIMITS = Object.freeze({
  version: CHALLENGE_PANEL_VERSION,
  /** Retained record rows; the 233 store caps them at 32. */
  records: 32,
  /** The 211 daily set is exactly three challenges. */
  dailyPicks: 3,
  /** Code units per identity copied from the contracts. */
  idCodeUnits: 256,
  /** Code units per authored title and label. */
  titleCodeUnits: 160,
  /** Code units per reaction line. */
  reactionCodeUnits: 240,
  /** Reads per open; a closed panel re-reads nothing. */
  readsPerOpen: 1,
  globalListeners: 0,
});

export const CHALLENGE_PANEL_TEXT = Object.freeze({
  trigger: 'Provocări',
  triggerDescription:
    'Deschide panoul provocărilor: oferta curentă, rezultatul, recordurile personale și setul zilnic',
  title: 'Provocări și recorduri',
  description:
    'Panoul citește contractele 231, 232 și 233: premisa, obiectivul, recompensa și rezultatul sunt exact cele raportate de ele. Panoul nu acceptă, nu refuză și nu pornește nimic de unul singur.',
  close: 'Închide',
  closeDescription: 'Închide panoul provocărilor și revino la buton',
  bodyLabel: 'Provocări, rezultat și recorduri',
  empty: 'Nicio provocare descoperită încă. Ofertele apar discret în timp ce conduci.',
  none: 'Niciuna',
  offerHeading: 'Ofertă acum',
  activeHeading: 'Provocare în desfășurare',
  resultHeading: 'Ultimul rezultat',
  recordsHeading: 'Recorduri personale',
  dailyHeading: 'Setul zilnic',
  reactionHeading: 'Reacția clientului',
  readonlyNote:
    'Acceptă, Refuză, Mai încearcă și Continuă condusul sunt acțiuni ale hostului: panoul trimite intenția, contractele decid.',
  noResult: 'Niciun rezultat încă',
  noRecords: 'Niciun record personal încă',
  noDaily: 'Setul zilnic nu este disponibil',
  labels: Object.freeze({
    template: 'Șablon',
    objective: 'Obiectiv',
    progress: 'Progres',
    reward: 'Recompensă',
    rewardRecordOnly: 'Record personal, fără XP suplimentar',
    deadline: 'Deadline',
    incidents: 'Buget de incidente',
    session: 'Sesiune',
    control: 'Control',
    premise: 'Premisa',
    expires: 'Oferta expiră',
    status: 'Stare',
    reason: 'Motiv',
    record: 'Record',
    attempts: 'Încercări',
    completions: 'Reușite',
    best: 'Cel mai bun',
    attempt: 'Încercarea',
    lastResult: 'Ultimul rezultat',
    dailyDate: 'Data zilei',
    dailyPicks: 'Provocări',
    bridge: 'Daily 211',
    manual: 'MANUAL',
    localOnly: 'Scor local (Haos)',
  }),
});

export const CHALLENGE_PANEL_ACTIONS = ['ACCEPT', 'DECLINE', 'RETRY', 'CONTINUE'] as const;
export type ChallengePanelAction = (typeof CHALLENGE_PANEL_ACTIONS)[number];

export const CHALLENGE_PANEL_ACTION_LABELS: Readonly<Record<ChallengePanelAction, string>> =
  Object.freeze({
    ACCEPT: 'Acceptă',
    DECLINE: 'Refuză',
    RETRY: 'Mai încearcă',
    CONTINUE: 'Continuă condusul',
  });

export const CHALLENGE_PANEL_STATUSES = [
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'DECLINED',
  'EXPIRED',
] as const;
export type ChallengePanelResultStatus = (typeof CHALLENGE_PANEL_STATUSES)[number];

export const CHALLENGE_PANEL_STATUS_LABELS: Readonly<Record<ChallengePanelResultStatus, string>> =
  Object.freeze({
    COMPLETED: 'Reușită',
    FAILED: 'Eșec',
    CANCELLED: 'Anulat',
    DECLINED: 'Refuzat',
    EXPIRED: 'Expirat',
  });

export const CHALLENGE_PANEL_COMPARISON_LABELS: Readonly<
  Record<ChallengeRecordComparison, string>
> = Object.freeze({
  FIRST_RECORD: 'Primul record',
  BETTER: 'Record nou',
  EQUAL: 'Record egalat',
  WORSE: 'Sub record',
  NOT_ELIGIBLE: 'Fără record',
});

export const CHALLENGE_PANEL_SESSION_LABELS = Object.freeze({
  ACADEMY: 'Academie',
  CHAOS: 'Haos',
});

export const CHALLENGE_PANEL_CONTROL_LABELS = Object.freeze({
  MANUAL: 'Manual',
  LEARNING: 'Learning',
  ANY: 'Manual sau automat',
});

export interface ChallengePanelOffer {
  readonly instanceId: string;
  readonly templateId: string;
  readonly templateVersion: string;
  readonly title: string;
  /** The authored 231 offer line: the real premise of the situation. */
  readonly premise: string;
  readonly objectiveKind: string;
  readonly objectiveLabel: string;
  readonly target: number;
  /** `null` while the objective has not been evaluated yet; never an invented partial progress. */
  readonly progress: number | null;
  readonly rewardXp: number;
  readonly incidentBudget: number;
  readonly deadlineTick: number;
  readonly expiresAtTick: number;
  readonly sessionKind: 'ACADEMY' | 'CHAOS';
  readonly controlRequirement: 'MANUAL' | 'LEARNING' | 'ANY';
}

export interface ChallengePanelActive {
  readonly instanceId: string;
  readonly templateId: string;
  readonly title: string;
  readonly objectiveLabel: string;
  readonly target: number;
  readonly progress: number | null;
  readonly rewardXp: number;
  readonly deadlineTick: number;
  readonly activatedAtTick: number;
  readonly remainingTicks: number;
}

export interface ChallengePanelResult {
  readonly instanceId: string;
  readonly templateId: string;
  readonly templateVersion: string;
  readonly title: string;
  readonly status: ChallengePanelResultStatus;
  readonly reason: string;
  readonly target: number;
  readonly progress: number;
  readonly academyXp: number;
  readonly xpCredited: number;
  readonly sessionKind: 'ACADEMY' | 'CHAOS';
  readonly recordComparison: ChallengeRecordComparison;
  readonly endedAtTick: number;
}

export interface ChallengePanelRecord {
  readonly recordId: string;
  readonly templateId: string;
  readonly family: string;
  readonly bestProgress: number | null;
  readonly bestTarget: number;
  readonly bestAttempt: number | null;
  readonly bestTick: number | null;
  readonly attempts: number;
  readonly completions: number;
  readonly lastResult: string;
}

export interface ChallengePanelDailyPick {
  readonly slot: number;
  readonly templateId: string;
  readonly title: string;
  readonly family: string;
  readonly manual: boolean;
  readonly bridgeFamilyId: string | null;
}

export interface ChallengePanelSnapshot {
  readonly version: typeof CHALLENGE_PANEL_SNAPSHOT_VERSION;
  readonly tick: number;
  readonly sessionKind: 'ACADEMY' | 'CHAOS';
  readonly offersEnabled: boolean;
  readonly offer: ChallengePanelOffer | null;
  readonly active: ChallengePanelActive | null;
  readonly result: ChallengePanelResult | null;
  readonly reaction: ChallengeReaction | null;
  readonly records: readonly ChallengePanelRecord[];
  readonly daily: Readonly<{
    readonly dailyDate: string;
    readonly picks: readonly ChallengePanelDailyPick[];
  }> | null;
}

export interface ChallengePanelActionView {
  readonly action: ChallengePanelAction;
  readonly label: string;
  readonly enabled: boolean;
  readonly reason: string | null;
}

export interface ChallengePanelOfferView {
  readonly instanceId: string;
  readonly templateId: string;
  readonly title: string;
  readonly premise: string;
  readonly objectiveLabel: string;
  readonly progressLabel: string;
  readonly rewardLabel: string;
  readonly deadlineLabel: string;
  readonly incidentsLabel: string;
  readonly sessionLabel: string;
  readonly controlLabel: string;
  readonly expiresLabel: string;
}

export interface ChallengePanelActiveView {
  readonly instanceId: string;
  readonly templateId: string;
  readonly title: string;
  readonly objectiveLabel: string;
  readonly progressLabel: string;
  readonly rewardLabel: string;
  readonly deadlineLabel: string;
  readonly remainingLabel: string;
}

export interface ChallengePanelResultView {
  readonly instanceId: string;
  readonly templateId: string;
  readonly title: string;
  readonly status: ChallengePanelResultStatus;
  readonly statusLabel: string;
  readonly reasonLabel: string;
  readonly progressLabel: string;
  readonly rewardLabel: string;
  readonly recordLabel: string;
  readonly recordComparison: ChallengeRecordComparison;
  readonly xpLabel: string;
  readonly reactionHeadline: string;
  readonly reactionText: string;
  readonly reactionEffect: string;
  readonly reactionTone: string;
  readonly xpStatementLabel: string;
}

export interface ChallengePanelRecordView {
  readonly recordId: string;
  readonly templateId: string;
  readonly title: string;
  readonly familyLabel: string;
  readonly bestLabel: string;
  readonly attemptsLabel: string;
  readonly lastResultLabel: string;
}

export interface ChallengePanelDailyView {
  readonly dailyDate: string;
  readonly summary: string;
  readonly picks: readonly Readonly<{
    slot: number;
    templateId: string;
    title: string;
    familyLabel: string;
    controlLabel: string;
    bridgeLabel: string;
  }>[];
}

export interface ChallengePanelView {
  readonly version: typeof CHALLENGE_PANEL_VERSION;
  readonly signature: string;
  readonly tick: number;
  readonly sessionKind: 'ACADEMY' | 'CHAOS';
  readonly sessionLabel: string;
  readonly offersEnabled: boolean;
  readonly empty: boolean;
  readonly offer: ChallengePanelOfferView | null;
  readonly active: ChallengePanelActiveView | null;
  readonly result: ChallengePanelResultView | null;
  readonly records: readonly ChallengePanelRecordView[];
  readonly daily: ChallengePanelDailyView | null;
  readonly notice: string;
  readonly actions: readonly ChallengePanelActionView[];
  readonly counts: Readonly<{
    records: number;
    discovered: number;
    dailyPicks: number;
    completions: number;
    creditedXp: number;
    actions: number;
  }>;
}

export function emptyChallengePanelView(): ChallengePanelView {
  return Object.freeze({
    version: CHALLENGE_PANEL_VERSION,
    signature: 'empty',
    tick: 0,
    sessionKind: 'ACADEMY' as const,
    sessionLabel: CHALLENGE_PANEL_SESSION_LABELS.ACADEMY,
    offersEnabled: false,
    empty: true,
    offer: null,
    active: null,
    result: null,
    records: Object.freeze([]),
    daily: null,
    notice: CHALLENGE_PANEL_TEXT.empty,
    actions: Object.freeze([]),
    counts: Object.freeze({
      records: 0,
      discovered: 0,
      dailyPicks: 0,
      completions: 0,
      creditedXp: 0,
      actions: 0,
    }),
  });
}

/* ---------------------------------------------------------------------------------------------
 * Strict readers
 * ------------------------------------------------------------------------------------------- */

type Fields = Readonly<Record<string, unknown>>;

function record(value: unknown, label: string): Fields {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value as Fields;
}

function unknownFields(data: Fields, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(data))
    if (!allowed.includes(key)) throw new Error(`Unknown ${label} field: ${key}`);
}

function required(data: Fields, keys: readonly string[], label: string): void {
  for (const key of keys)
    if (data[key] === undefined) throw new Error(`Missing ${label} field: ${key}`);
}

function identity(value: unknown, maximum: number, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value
  )
    throw new Error(`Invalid ${label} identity`);
  return value;
}

function label(value: unknown, maximum: number, name: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum)
    throw new Error(`Invalid ${name} label`);
  return value;
}

function whole(value: unknown, minimum: number, maximum: number, name: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    throw new Error(`Invalid ${name} number`);
  return value;
}

function boolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${name} flag`);
  return value;
}

function sessionKind(value: unknown): 'ACADEMY' | 'CHAOS' {
  if (value !== 'ACADEMY' && value !== 'CHAOS') throw new Error('Invalid challenge session kind');
  return value;
}

function comparison(value: unknown): ChallengeRecordComparison {
  if (
    value !== 'FIRST_RECORD' &&
    value !== 'BETTER' &&
    value !== 'EQUAL' &&
    value !== 'WORSE' &&
    value !== 'NOT_ELIGIBLE'
  )
    throw new Error('Invalid challenge record comparison');
  return value;
}

function resultStatus(value: unknown): ChallengePanelResultStatus {
  for (const status of CHALLENGE_PANEL_STATUSES) if (value === status) return status;
  throw new Error('Invalid challenge result status');
}

const offerFields = [
  'instanceId',
  'templateId',
  'templateVersion',
  'title',
  'premise',
  'objectiveKind',
  'objectiveLabel',
  'target',
  'progress',
  'rewardXp',
  'incidentBudget',
  'deadlineTick',
  'expiresAtTick',
  'sessionKind',
  'controlRequirement',
] as const;
const activeFields = [
  'instanceId',
  'templateId',
  'title',
  'objectiveLabel',
  'target',
  'progress',
  'rewardXp',
  'deadlineTick',
  'activatedAtTick',
  'remainingTicks',
] as const;
const resultFields = [
  'instanceId',
  'templateId',
  'templateVersion',
  'title',
  'status',
  'reason',
  'target',
  'progress',
  'academyXp',
  'xpCredited',
  'sessionKind',
  'recordComparison',
  'endedAtTick',
] as const;
const panelRecordFields = [
  'recordId',
  'templateId',
  'family',
  'bestProgress',
  'bestTarget',
  'bestAttempt',
  'bestTick',
  'attempts',
  'completions',
  'lastResult',
] as const;
const dailyPickFields = [
  'slot',
  'templateId',
  'title',
  'family',
  'manual',
  'bridgeFamilyId',
] as const;
const dailyFields = ['dailyDate', 'picks'] as const;
const snapshotFields = [
  'version',
  'tick',
  'sessionKind',
  'offersEnabled',
  'offer',
  'active',
  'result',
  'reaction',
  'records',
  'daily',
] as const;

function readOffer(value: unknown): ChallengePanelOffer {
  const data = record(value, 'challenge offer');
  unknownFields(data, offerFields, 'challenge offer');
  required(data, offerFields, 'challenge offer');
  const control = data.controlRequirement;
  if (control !== 'MANUAL' && control !== 'LEARNING' && control !== 'ANY')
    throw new Error('Invalid challenge control requirement');
  const offer: ChallengePanelOffer = {
    instanceId: identity(data.instanceId, CHALLENGE_PANEL_LIMITS.idCodeUnits, 'challenge offer'),
    templateId: identity(data.templateId, CHALLENGE_PANEL_LIMITS.idCodeUnits, 'challenge template'),
    templateVersion: identity(
      data.templateVersion,
      CHALLENGE_PANEL_LIMITS.idCodeUnits,
      'challenge template version',
    ),
    title: label(data.title, CHALLENGE_PANEL_LIMITS.titleCodeUnits, 'challenge title'),
    premise: label(data.premise, CHALLENGE_PANEL_LIMITS.reactionCodeUnits, 'challenge premise'),
    objectiveKind: identity(data.objectiveKind, 32, 'challenge objective kind'),
    objectiveLabel: label(
      data.objectiveLabel,
      CHALLENGE_PANEL_LIMITS.titleCodeUnits,
      'challenge objective',
    ),
    target: whole(data.target, 1, 1_000, 'challenge target'),
    progress: data.progress === null ? null : whole(data.progress, 0, 1_000, 'challenge progress'),
    rewardXp: whole(data.rewardXp, 0, 1_000_000, 'challenge reward'),
    incidentBudget: whole(data.incidentBudget, 0, 20, 'challenge incident budget'),
    deadlineTick: whole(data.deadlineTick, 0, Number.MAX_SAFE_INTEGER, 'challenge deadline'),
    expiresAtTick: whole(data.expiresAtTick, 0, Number.MAX_SAFE_INTEGER, 'challenge offer expiry'),
    sessionKind: sessionKind(data.sessionKind),
    controlRequirement: control,
  };
  if (offer.expiresAtTick > offer.deadlineTick)
    throw new Error('A challenge offer cannot expire after its objective deadline');
  return Object.freeze(offer);
}

function readActive(value: unknown): ChallengePanelActive {
  const data = record(value, 'challenge active');
  unknownFields(data, activeFields, 'challenge active');
  required(data, activeFields, 'challenge active');
  const active: ChallengePanelActive = {
    instanceId: identity(data.instanceId, CHALLENGE_PANEL_LIMITS.idCodeUnits, 'challenge instance'),
    templateId: identity(data.templateId, CHALLENGE_PANEL_LIMITS.idCodeUnits, 'challenge template'),
    title: label(data.title, CHALLENGE_PANEL_LIMITS.titleCodeUnits, 'challenge title'),
    objectiveLabel: label(
      data.objectiveLabel,
      CHALLENGE_PANEL_LIMITS.titleCodeUnits,
      'challenge objective',
    ),
    target: whole(data.target, 1, 1_000, 'challenge target'),
    progress: data.progress === null ? null : whole(data.progress, 0, 1_000, 'challenge progress'),
    rewardXp: whole(data.rewardXp, 0, 1_000_000, 'challenge reward'),
    deadlineTick: whole(data.deadlineTick, 0, Number.MAX_SAFE_INTEGER, 'challenge deadline'),
    activatedAtTick: whole(
      data.activatedAtTick,
      0,
      Number.MAX_SAFE_INTEGER,
      'challenge activation',
    ),
    remainingTicks: whole(
      data.remainingTicks,
      0,
      Number.MAX_SAFE_INTEGER,
      'challenge remaining time',
    ),
  };
  if (active.activatedAtTick > active.deadlineTick)
    throw new Error('A challenge cannot start after its own deadline');
  return Object.freeze(active);
}

function readResult(value: unknown): ChallengePanelResult {
  const data = record(value, 'challenge result');
  unknownFields(data, resultFields, 'challenge result');
  required(data, resultFields, 'challenge result');
  const status = resultStatus(data.status);
  const session = sessionKind(data.sessionKind);
  const result: ChallengePanelResult = {
    instanceId: identity(data.instanceId, CHALLENGE_PANEL_LIMITS.idCodeUnits, 'challenge instance'),
    templateId: identity(data.templateId, CHALLENGE_PANEL_LIMITS.idCodeUnits, 'challenge template'),
    templateVersion: identity(
      data.templateVersion,
      CHALLENGE_PANEL_LIMITS.idCodeUnits,
      'challenge template version',
    ),
    title: label(data.title, CHALLENGE_PANEL_LIMITS.titleCodeUnits, 'challenge title'),
    status,
    reason: identity(data.reason, 64, 'challenge result reason'),
    target: whole(data.target, 1, 1_000, 'challenge target'),
    progress: whole(data.progress, 0, 1_000, 'challenge progress'),
    academyXp: whole(data.academyXp, 0, 1_000_000, 'challenge reward'),
    xpCredited: whole(data.xpCredited, 0, 1_000_000, 'challenge credited XP'),
    sessionKind: session,
    recordComparison: comparison(data.recordComparison),
    endedAtTick: whole(data.endedAtTick, 0, Number.MAX_SAFE_INTEGER, 'challenge result tick'),
  };
  if (result.status !== 'COMPLETED' && result.xpCredited > 0)
    throw new Error('Only a completed challenge can credit XP');
  if (result.sessionKind !== 'ACADEMY' && result.xpCredited > 0)
    throw new Error('A Haos challenge never credits Academy XP');
  if (result.status !== 'COMPLETED' && result.recordComparison !== 'NOT_ELIGIBLE')
    throw new Error('Only a completed challenge produces a personal record');
  if (result.status === 'COMPLETED' && result.progress < result.target)
    throw new Error('A completed challenge must reach its target');
  return Object.freeze(result);
}

function readPanelRecord(value: unknown): ChallengePanelRecord {
  const data = record(value, 'challenge panel record');
  unknownFields(data, panelRecordFields, 'challenge panel record');
  required(data, panelRecordFields, 'challenge panel record');
  const bestProgress =
    data.bestProgress === null ? null : whole(data.bestProgress, 0, 1_000, 'best progress');
  const bestAttempt =
    data.bestAttempt === null ? null : whole(data.bestAttempt, 1, 8, 'best attempt');
  const bestTick =
    data.bestTick === null ? null : whole(data.bestTick, 0, Number.MAX_SAFE_INTEGER, 'best tick');
  const bestTarget = whole(data.bestTarget, 1, 1_000, 'best target');
  const attempts = whole(data.attempts, 0, Number.MAX_SAFE_INTEGER, 'record attempts');
  const completions = whole(data.completions, 0, Number.MAX_SAFE_INTEGER, 'record completions');
  if (completions > attempts)
    throw new Error('A challenge record has more completions than attempts');
  if (bestProgress === null) {
    if (bestAttempt !== null || bestTick !== null)
      throw new Error('A record without a best value cannot carry a best attempt');
  } else {
    if (bestProgress < bestTarget) throw new Error('A challenge best must reach its own target');
    if (bestAttempt === null || bestTick === null)
      throw new Error('A challenge best needs its attempt and tick');
    if (completions < 1) throw new Error('A challenge best needs a completion');
  }
  return Object.freeze({
    recordId: identity(data.recordId, CHALLENGE_PANEL_LIMITS.idCodeUnits, 'challenge record'),
    templateId: identity(data.templateId, CHALLENGE_PANEL_LIMITS.idCodeUnits, 'challenge template'),
    family: identity(data.family, 32, 'challenge family'),
    bestProgress,
    bestTarget,
    bestAttempt,
    bestTick,
    attempts,
    completions,
    lastResult: identity(data.lastResult, 32, 'challenge last result'),
  });
}

function readDailyPick(value: unknown): ChallengePanelDailyPick {
  const data = record(value, 'challenge daily pick');
  unknownFields(data, dailyPickFields, 'challenge daily pick');
  required(data, dailyPickFields, 'challenge daily pick');
  return Object.freeze({
    slot: whole(data.slot, 1, CHALLENGE_PANEL_LIMITS.dailyPicks, 'daily slot'),
    templateId: identity(data.templateId, CHALLENGE_PANEL_LIMITS.idCodeUnits, 'challenge template'),
    title: label(data.title, CHALLENGE_PANEL_LIMITS.titleCodeUnits, 'challenge title'),
    family: identity(data.family, 32, 'challenge family'),
    manual: boolean(data.manual, 'daily manual'),
    bridgeFamilyId:
      data.bridgeFamilyId === null
        ? null
        : identity(data.bridgeFamilyId, CHALLENGE_PANEL_LIMITS.idCodeUnits, 'daily bridge family'),
  });
}

function readDaily(value: unknown): NonNullable<ChallengePanelSnapshot['daily']> {
  const data = record(value, 'challenge daily set');
  unknownFields(data, dailyFields, 'challenge daily set');
  required(data, dailyFields, 'challenge daily set');
  if (!Array.isArray(data.picks)) throw new Error('A challenge daily set needs its picks');
  if (data.picks.length !== CHALLENGE_PANEL_LIMITS.dailyPicks)
    throw new Error('The daily challenge set is exactly three challenges');
  const picks = data.picks.map(readDailyPick);
  if (new Set(picks.map((entry) => entry.templateId)).size !== picks.length)
    throw new Error('A daily challenge set repeats a template');
  if (!picks.some((entry) => entry.manual))
    throw new Error('The daily challenge set needs at least one manual challenge');
  const dailyDate = identity(data.dailyDate, 10, 'daily date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dailyDate)) throw new Error('Invalid daily date');
  return Object.freeze({ dailyDate, picks: Object.freeze(picks) });
}

function readReaction(value: unknown): ChallengeReaction {
  const data = record(value, 'challenge reaction');
  const fields = [
    'version',
    'templateId',
    'templateVersion',
    'trigger',
    'tone',
    'effect',
    'headline',
    'text',
    'xpStatement',
    'xpStatementLabel',
    'xpDelta',
    'penalty',
    'authored',
  ] as const;
  unknownFields(data, fields, 'challenge reaction');
  required(data, fields, 'challenge reaction');
  const trigger = data.trigger;
  const tone = data.tone;
  const effect = data.effect;
  if (
    trigger !== 'OFFER' &&
    trigger !== 'PROGRESS' &&
    trigger !== 'SUCCESS' &&
    trigger !== 'FAILURE' &&
    trigger !== 'DECLINE'
  )
    throw new Error('Invalid challenge reaction trigger');
  if (tone !== 'CELEBRATION' && tone !== 'COMMISERATION' && tone !== 'SHRUG' && tone !== 'NEUTRAL')
    throw new Error('Invalid challenge reaction tone');
  if (
    effect !== 'CELEBRATION' &&
    effect !== 'COMMISERATION' &&
    effect !== 'SHRUG' &&
    effect !== 'NONE'
  )
    throw new Error('Invalid challenge reaction effect');
  const consistent =
    (trigger === 'SUCCESS' && tone === 'CELEBRATION' && effect === 'CELEBRATION') ||
    (trigger === 'FAILURE' && tone === 'COMMISERATION' && effect === 'COMMISERATION') ||
    (trigger === 'DECLINE' && tone === 'SHRUG' && effect === 'SHRUG') ||
    ((trigger === 'OFFER' || trigger === 'PROGRESS') && tone === 'NEUTRAL' && effect === 'NONE');
  if (!consistent) throw new Error('Challenge reaction tone does not match its trigger');
  if (data.xpDelta !== 0) throw new Error('A challenge reaction never changes the XP balance');
  if (data.penalty !== 'NONE') throw new Error('A challenge reaction never adds a penalty');
  return data as unknown as ChallengeReaction;
}

export function parseChallengePanelSnapshot(value: unknown): ChallengePanelSnapshot {
  const data = record(value, 'challenge panel snapshot');
  unknownFields(data, snapshotFields, 'challenge panel snapshot');
  required(data, snapshotFields, 'challenge panel snapshot');
  if (data.version !== CHALLENGE_PANEL_SNAPSHOT_VERSION)
    throw new Error('Unsupported challenge panel snapshot version');
  const session = sessionKind(data.sessionKind);
  const offer = data.offer === null ? null : readOffer(data.offer);
  const active = data.active === null ? null : readActive(data.active);
  const result = data.result === null ? null : readResult(data.result);
  const reaction = data.reaction === null ? null : readReaction(data.reaction);
  if (!Array.isArray(data.records)) throw new Error('A challenge panel snapshot needs its records');
  if (data.records.length > CHALLENGE_PANEL_LIMITS.records)
    throw new Error('Challenge panel record capacity exceeded');
  const records = data.records.map(readPanelRecord);
  if (new Set(records.map((entry) => entry.recordId)).size !== records.length)
    throw new Error('Duplicate challenge record in the panel snapshot');
  const daily = data.daily === null ? null : readDaily(data.daily);
  if (offer !== null && offer.sessionKind !== session)
    throw new Error('A challenge offer belongs to another session');
  if (active !== null && result !== null && active.instanceId === result.instanceId)
    throw new Error('A live challenge cannot also be its own result');
  if (offer !== null && active !== null && offer.templateId === active.templateId)
    throw new Error('A challenge cannot be offered and live at the same time');
  const current = offer?.templateId ?? active?.templateId ?? result?.templateId ?? null;
  if (reaction !== null && current !== null && reaction.templateId !== current)
    throw new Error('The challenge reaction belongs to another instance');
  if (reaction !== null && offer === null && active === null && result === null)
    throw new Error('A challenge reaction needs a current instance');
  if (result !== null && reaction !== null) {
    const expected =
      result.status === 'COMPLETED'
        ? 'SUCCESS'
        : result.status === 'FAILED'
          ? 'FAILURE'
          : 'DECLINE';
    if (reaction.trigger !== expected)
      throw new Error('The challenge reaction does not match the result status');
  }
  return Object.freeze({
    version: CHALLENGE_PANEL_SNAPSHOT_VERSION,
    tick: whole(data.tick, 0, Number.MAX_SAFE_INTEGER, 'panel tick'),
    sessionKind: session,
    offersEnabled: boolean(data.offersEnabled, 'offers enabled'),
    offer,
    active,
    result,
    reaction,
    records: Object.freeze(records),
    daily,
  });
}

/* ---------------------------------------------------------------------------------------------
 * Projection
 * ------------------------------------------------------------------------------------------- */

function actionView(
  action: ChallengePanelAction,
  enabled: boolean,
  reason: string | null,
): ChallengePanelActionView {
  return Object.freeze({
    action,
    label: CHALLENGE_PANEL_ACTION_LABELS[action],
    enabled,
    reason,
  });
}

function offerActions(offersEnabled: boolean): readonly ChallengePanelActionView[] {
  return Object.freeze([
    actionView('ACCEPT', offersEnabled, offersEnabled ? null : 'Ofertele sunt oprite din setări'),
    actionView('DECLINE', true, null),
    actionView('CONTINUE', true, null),
  ]);
}

function resultActions(result: ChallengePanelResult): readonly ChallengePanelActionView[] {
  return Object.freeze([
    actionView(
      'RETRY',
      result.status === 'FAILED',
      result.status === 'FAILED'
        ? null
        : 'Reluarea imediată pornește doar din eșec; după succes, 232 oferă o provocare nouă',
    ),
    actionView('CONTINUE', true, null),
  ]);
}

function progressLabel(progress: number | null, target: number): string {
  return progress === null ? `—/${target}` : `${progress}/${target}`;
}

export function projectChallengePanel(
  snapshot: ChallengePanelSnapshot,
  options: { readonly reaction?: ChallengeReaction | null } = {},
): ChallengePanelView {
  const reaction = options.reaction === undefined ? snapshot.reaction : options.reaction;
  const offer =
    snapshot.offer === null
      ? null
      : Object.freeze({
          instanceId: snapshot.offer.instanceId,
          templateId: snapshot.offer.templateId,
          title: snapshot.offer.title,
          premise: snapshot.offer.premise,
          objectiveLabel: snapshot.offer.objectiveLabel,
          progressLabel: progressLabel(snapshot.offer.progress, snapshot.offer.target),
          rewardLabel:
            snapshot.offer.sessionKind === 'CHAOS'
              ? CHALLENGE_PANEL_TEXT.labels.localOnly
              : `${snapshot.offer.rewardXp} XP`,
          deadlineLabel: `${snapshot.offer.deadlineTick} ticks`,
          incidentsLabel: String(snapshot.offer.incidentBudget),
          sessionLabel: CHALLENGE_PANEL_SESSION_LABELS[snapshot.offer.sessionKind],
          controlLabel: CHALLENGE_PANEL_CONTROL_LABELS[snapshot.offer.controlRequirement],
          expiresLabel: `${snapshot.offer.expiresAtTick} ticks`,
        });
  const active =
    snapshot.active === null
      ? null
      : Object.freeze({
          instanceId: snapshot.active.instanceId,
          templateId: snapshot.active.templateId,
          title: snapshot.active.title,
          objectiveLabel: snapshot.active.objectiveLabel,
          progressLabel: progressLabel(snapshot.active.progress, snapshot.active.target),
          rewardLabel:
            snapshot.sessionKind === 'CHAOS'
              ? CHALLENGE_PANEL_TEXT.labels.localOnly
              : `${snapshot.active.rewardXp} XP`,
          deadlineLabel: `${snapshot.active.deadlineTick} ticks`,
          remainingLabel: `${snapshot.active.remainingTicks} ticks`,
        });
  const result =
    snapshot.result === null
      ? null
      : Object.freeze({
          instanceId: snapshot.result.instanceId,
          templateId: snapshot.result.templateId,
          title: snapshot.result.title,
          status: snapshot.result.status,
          statusLabel: CHALLENGE_PANEL_STATUS_LABELS[snapshot.result.status],
          reasonLabel: snapshot.result.reason,
          progressLabel: progressLabel(snapshot.result.progress, snapshot.result.target),
          rewardLabel:
            snapshot.result.sessionKind === 'CHAOS'
              ? CHALLENGE_PANEL_TEXT.labels.localOnly
              : `${snapshot.result.academyXp} XP`,
          recordLabel: CHALLENGE_PANEL_COMPARISON_LABELS[snapshot.result.recordComparison],
          recordComparison: snapshot.result.recordComparison,
          xpLabel:
            snapshot.result.xpCredited > 0
              ? `${snapshot.result.xpCredited} XP creditați`
              : CHALLENGE_PANEL_TEXT.labels.rewardRecordOnly,
          reactionHeadline: reaction?.headline ?? '',
          reactionText: reaction?.text ?? '',
          reactionEffect: reaction?.effect ?? 'NONE',
          reactionTone: reaction?.tone ?? 'NEUTRAL',
          xpStatementLabel: reaction?.xpStatementLabel ?? '',
        });
  const records = Object.freeze(
    snapshot.records.map((entry) =>
      Object.freeze({
        recordId: entry.recordId,
        templateId: entry.templateId,
        title: entry.templateId,
        familyLabel: entry.family,
        bestLabel:
          entry.bestProgress === null || entry.bestAttempt === null || entry.bestTick === null
            ? CHALLENGE_PANEL_TEXT.noResult
            : `${progressLabel(entry.bestProgress, entry.bestTarget)} · ${CHALLENGE_PANEL_TEXT.labels.attempt} ${entry.bestAttempt} · tick ${entry.bestTick}`,
        attemptsLabel: `${CHALLENGE_PANEL_TEXT.labels.attempts}: ${entry.attempts}`,
        lastResultLabel: `${CHALLENGE_PANEL_TEXT.labels.lastResult}: ${entry.lastResult}`,
      }),
    ),
  );
  const daily =
    snapshot.daily === null
      ? null
      : Object.freeze({
          dailyDate: snapshot.daily.dailyDate,
          summary: `${snapshot.daily.picks.length} provocări · ${snapshot.daily.picks.filter((entry) => entry.manual).length} MANUAL`,
          picks: Object.freeze(
            snapshot.daily.picks.map((entry) =>
              Object.freeze({
                slot: entry.slot,
                templateId: entry.templateId,
                title: entry.title,
                familyLabel: entry.family,
                controlLabel: entry.manual ? CHALLENGE_PANEL_TEXT.labels.manual : 'LEARNING',
                bridgeLabel:
                  entry.bridgeFamilyId === null
                    ? 'evaluator propriu 231'
                    : `211: ${entry.bridgeFamilyId}`,
              }),
            ),
          ),
        });
  const creditedXp = snapshot.result?.xpCredited ?? 0;
  const completions = snapshot.records.reduce((total, entry) => total + entry.completions, 0);
  const actions: readonly ChallengePanelActionView[] =
    snapshot.offer !== null
      ? offerActions(snapshot.offersEnabled)
      : snapshot.result !== null
        ? resultActions(snapshot.result)
        : snapshot.active !== null
          ? Object.freeze([actionView('CONTINUE', true, null)])
          : Object.freeze([]);
  const counts = Object.freeze({
    records: snapshot.records.length,
    discovered: new Set(snapshot.records.map((entry) => entry.templateId)).size,
    dailyPicks: snapshot.daily?.picks.length ?? 0,
    completions,
    creditedXp,
    actions: actions.length,
  });
  const empty =
    snapshot.offer === null &&
    snapshot.active === null &&
    snapshot.result === null &&
    snapshot.records.length === 0;
  const signature = JSON.stringify({ ...snapshot, reaction });
  return Object.freeze({
    version: CHALLENGE_PANEL_VERSION,
    signature,
    tick: snapshot.tick,
    sessionKind: snapshot.sessionKind,
    sessionLabel: CHALLENGE_PANEL_SESSION_LABELS[snapshot.sessionKind],
    offersEnabled: snapshot.offersEnabled,
    empty,
    offer,
    active,
    result,
    records,
    daily,
    notice: empty ? CHALLENGE_PANEL_TEXT.empty : CHALLENGE_PANEL_TEXT.readonlyNote,
    actions,
    counts,
  });
}

/* ---------------------------------------------------------------------------------------------
 * Host composition: plain mapping over the delivered read models
 * ------------------------------------------------------------------------------------------- */

/** The authored 231 template row the host passes for the current instance. */
export interface ChallengePanelTemplateRow {
  readonly templateId: string;
  readonly controlRequirement: 'MANUAL' | 'LEARNING' | 'ANY';
  /** The authored OFFER dialogue line: the real premise shown with the offer. */
  readonly premise: string;
}

export interface ChallengePanelComposeInput {
  readonly tick: number;
  readonly sessionKind: 'ACADEMY' | 'CHAOS';
  readonly offersEnabled: boolean;
  readonly offer: ChallengeDirectorInstance | null;
  readonly active: ChallengeDirectorInstance | null;
  readonly result: ChallengeDirectorInstance | null;
  readonly reaction: ChallengeReaction | null;
  readonly records: readonly ChallengeRecord[];
  readonly daily: ChallengeDailySet | null;
  readonly creditedXp: number;
  readonly recordComparison: ChallengeRecordComparison;
  /** Authored rows of the templates currently on screen; no control mode or premise is invented. */
  readonly templates: readonly ChallengePanelTemplateRow[];
}

function templateRow(
  input: ChallengePanelComposeInput,
  templateId: string,
): ChallengePanelTemplateRow {
  const row = input.templates.find((entry) => entry.templateId === templateId);
  if (row === undefined)
    throw new Error(`The challenge panel has no authored template row for ${templateId}`);
  return row;
}

function resultStatusOfState(state: string): ChallengePanelResultStatus {
  for (const status of CHALLENGE_PANEL_STATUSES) if (state === status) return status;
  throw new Error(`A ${state} challenge instance is not a terminal result`);
}

/** Map one real 232 instance to the read-only offer row. */
function offerOf(
  input: ChallengePanelComposeInput,
  instance: ChallengeDirectorInstance,
): ChallengePanelOffer {
  const template = templateRow(input, instance.templateId);
  return Object.freeze({
    instanceId: instance.instanceId,
    templateId: instance.templateId,
    templateVersion: instance.templateVersion,
    title: instance.title,
    premise: template.premise,
    objectiveKind: instance.objective.objectiveKind,
    objectiveLabel: `${instance.objective.objectiveKind} · ${instance.objective.target}`,
    target: instance.objective.target,
    progress: null,
    rewardXp: instance.academyXp,
    incidentBudget: instance.objective.incidentBudget,
    deadlineTick: instance.objective.deadlineTick,
    expiresAtTick: instance.offerExpiresAtTick,
    sessionKind: instance.sessionKind,
    controlRequirement: template.controlRequirement,
  });
}

export function composeChallengePanelSnapshot(
  input: ChallengePanelComposeInput,
): ChallengePanelSnapshot {
  const offer = input.offer === null ? null : offerOf(input, input.offer);
  const active =
    input.active === null
      ? null
      : Object.freeze({
          instanceId: input.active.instanceId,
          templateId: input.active.templateId,
          title: input.active.title,
          objectiveLabel: `${input.active.objective.objectiveKind} · ${input.active.objective.target}`,
          target: input.active.objective.target,
          progress: null,
          rewardXp: input.active.academyXp,
          deadlineTick: input.active.objective.deadlineTick,
          activatedAtTick: input.active.activatedAtTick ?? 0,
          remainingTicks: Math.max(0, input.active.objective.deadlineTick - input.tick),
        });
  const result =
    input.result === null || input.result.outcome === null
      ? null
      : Object.freeze({
          instanceId: input.result.instanceId,
          templateId: input.result.templateId,
          templateVersion: input.result.templateVersion,
          title: input.result.title,
          status: resultStatusOfState(input.result.state),
          reason: input.result.outcome.reason,
          target: input.result.objective.target,
          progress: input.result.outcome.verdict?.progress ?? 0,
          academyXp: input.result.outcome.reward.academyXp,
          xpCredited: input.creditedXp,
          sessionKind: input.result.sessionKind,
          recordComparison: input.recordComparison,
          endedAtTick: input.result.outcome.tick,
        });
  const records = Object.freeze(
    input.records.map((entry) =>
      Object.freeze({
        recordId: entry.recordId,
        templateId: entry.templateId,
        family: entry.family,
        bestProgress: entry.best === null ? null : entry.best.score.progress,
        bestTarget: entry.best === null ? 1 : entry.best.score.target,
        bestAttempt: entry.best === null ? null : entry.best.attempt,
        bestTick: entry.best === null ? null : entry.best.achievedAtTick,
        attempts: entry.attempts,
        completions: entry.completions,
        lastResult: entry.lastResult,
      }),
    ),
  );
  const daily =
    input.daily === null
      ? null
      : Object.freeze({
          dailyDate: input.daily.dailyDate,
          picks: Object.freeze(
            input.daily.picks.map((entry) =>
              Object.freeze({
                slot: entry.slot,
                templateId: entry.templateId,
                title: entry.title,
                family: entry.family,
                manual: entry.allowsManual,
                bridgeFamilyId: entry.dailyBridgeFamilyId,
              }),
            ),
          ),
        });
  return Object.freeze({
    version: CHALLENGE_PANEL_SNAPSHOT_VERSION,
    tick: input.tick,
    sessionKind: input.sessionKind,
    offersEnabled: input.offersEnabled,
    offer,
    active,
    result,
    reaction: input.reaction,
    records,
    daily,
  });
}

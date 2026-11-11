import { createStableId, list, number, requireContract, text, tick } from '../sessions';
import { boundedId, compareText, plainFields, requireRequired } from './contracts';
import { DAILY_MISSION_XP, dailyRewardId } from './daily';
import type { DailyMissionInstance, DailyRewardRecord } from './daily';
import { missionRewardKinds } from './definitions';
import { REWARDS_SCHEMA_VERSION, missionRewardGrantStatuses } from './rewards';
import type { MissionCompletionResult } from './rewards';

/**
 * 213 player progress: the XP ledger, the level and the active time of one player.
 *
 * The contract is deliberately separate from the driving profile. `DrivingProfile` (109) holds the
 * style and its evidence; this module holds the player's experience and owns no profile store, no
 * profile reader and no profile field (`profileWrites: 0`). Creating, resetting, restoring or
 * importing a driving profile therefore cannot touch XP: there is nothing to touch.
 *
 * Three rules are structural:
 *
 * 1. **Credits are identified, never counted.** Every credit carries the stable identity of its
 *    cause — the 125 `rewardId` of an authored mission reward, the 211 `dailyRewardId` of a daily
 *    instance, or the real-time window of active play — and the XP entry is keyed by that identity in
 *    the ledger. A second delivery of the same cause finds the same key and is reported `DUPLICATE`;
 *    it never pays twice and there is no second idempotency mechanism to keep in sync.
 * 2. **The ledger is append-only and nonnegative.** There is no debit, penalty, refund or reset
 *    operation, and a negative amount is refused. Revenue, ratings, incidents, mission failure or
 *    refusal, a missed day and a profile reset can only leave the balance unchanged: the API that
 *    would lower it does not exist. The level is derived from the balance by a versioned monotone
 *    threshold table, so it cannot fall either.
 * 3. **Every number is explainable.** Each entry stores its source, its real moment, its identity,
 *    its amount and the balance after it, and the balance is exactly the sum of the retained
 *    entries. A checkpoint stores the entries and the accounting cursor only; the balance, the level
 *    and the totals are recomputed, so a save file cannot smuggle in XP that no credit produced.
 *
 * Active time is real, continuous and observed. The caller reports short windows
 * (`maxObservationWindowMs`) with the real facts it already has: the scope of the world, the control
 * mode, pause, focus, visibility and the AFK verdict of the calibrated threshold. Time between two
 * reports is unobserved and is never credited, a reported window longer than the calibration is
 * refused, and a repeated window is a duplicate. AUTO counts when the player is actually observing
 * the Academy — that is exactly "focused, visible, not paused, not AFK" — because the product
 * decision is that watching the simulation actively is play; replay, experiments and Haos run in
 * another scope and never count.
 *
 * Minutes keep their fractions. The ledger stores integer milliseconds and integer micro-XP
 * (`1 XP = 1_000_000 micro-XP`), the accrual of a window is the exact difference between the
 * integer micro-XP of the total before and after it, and the sub-micro remainder stays in the
 * millisecond total instead of being rounded away. No rounding ever invents or loses XP.
 */
export const PLAYER_PROGRESS_VERSION = '213-player-progress-v1' as const;
export const XP_RULE_VERSION = '213-xp-rules-v1' as const;
export const XP_LEVEL_VERSION = '213-xp-levels-v1' as const;
export const PLAYER_PROGRESS_NAMESPACE = 'player:progress' as const;

/** `1 XP = 1_000_000 micro-XP`; the ledger keeps integer micro-XP so fractions stay exact. */
export const XP_MICRO_PER_XP = 1_000_000 as const;
/** Authored rate: one XP per real active minute (proposal of calibration, Docs/23). */
export const XP_PER_ACTIVE_MINUTE = 1 as const;
/** Highest reachable level of the versioned threshold table. */
export const MAX_PLAYER_LEVEL = 50 as const;
/** Extra XP of every level step (calibration proposal, not a certified value). */
export const LEVEL_STEP_XP = 100 as const;

export const PLAYER_PROGRESS_LIMITS = Object.freeze({
  version: PLAYER_PROGRESS_VERSION,
  /** Retained XP entries; a credit beyond capacity is refused instead of silently dropped. */
  entries: 8_192,
  /** Code units per player, cause and entry identity. */
  idCodeUnits: 1_024,
  /** 100 days of active play, the range of the exact integer accrual. */
  lifetimeActiveMs: 8_640_000_000,
  maximumLevel: MAX_PLAYER_LEVEL,
  /** Whole XP authored by one mission reward or one daily instance. */
  maxCreditXp: 1_000_000,
});

/** Closed causes of an XP entry. */
export const xpCauseTypes = ['MISSION_REWARD', 'DAILY_REWARD', 'ACTIVE_TIME'] as const;
export type XpCauseType = (typeof xpCauseTypes)[number];

/** Closed worlds. Only the Academy contributes active time. */
export const playerTimeScopes = ['ACADEMY', 'REPLAY', 'EXPERIMENT', 'HAOS'] as const;
export type PlayerTimeScope = (typeof playerTimeScopes)[number];

export const playerControlModes = ['MANUAL', 'LEARNING', 'AUTO'] as const;
export type PlayerControlMode = (typeof playerControlModes)[number];

/** Closed reasons a reported window contributed no XP. */
export const activeTimeSkipReasons = [
  'PAUSED',
  'NOT_FOCUSED',
  'BACKGROUND',
  'AFK',
  'OUTSIDE_ACADEMY',
  'WINDOW_TOO_LONG',
  'ZERO_DURATION',
  'STALE_WINDOW',
] as const;
export type ActiveTimeSkipReason = (typeof activeTimeSkipReasons)[number];

/** Closed reasons a credit row was not paid. */
export const xpSkipReasons = [
  'NO_XP_REWARD',
  'REWARD_ALREADY_GRANTED',
  'DUPLICATE_DELIVERY',
  'ZERO_AMOUNT',
] as const;
export type XpSkipReason = (typeof xpSkipReasons)[number];

export const xpCreditOutcomes = ['CREDITED', 'DUPLICATE', 'SKIPPED'] as const;
export type XpCreditOutcome = (typeof xpCreditOutcomes)[number];

/**
 * The published policy. It is documentation that cannot drift from the implementation: the tests
 * and the deterministic report assert every field.
 */
export const PLAYER_XP_POLICY = Object.freeze({
  version: XP_RULE_VERSION,
  levelVersion: XP_LEVEL_VERSION,
  /** Real active minutes only, fractions preserved, no rounding. */
  timeXp: Object.freeze({
    xpPerActiveMinute: XP_PER_ACTIVE_MINUTE,
    calibration: 'PROPOSAL' as const,
    fractions: 'PRESERVED' as const,
    rounding: 'NONE' as const,
    unit: 'MICRO_XP' as const,
    statement:
      'Un minut real activ acordă 1 XP; fracțiunile sunt păstrate în milisecunde și micro-XP, iar restul sub un micro-XP rămâne în totalul de milisecunde, nu se rotunjește.',
  }),
  /** The composition layer must feed `afk: true` when no input was seen for this long. */
  afkThresholdMs: 120_000,
  /** One reported observation window cannot be longer than this. */
  maxObservationWindowMs: 30_000,
  /** Time between two reports beyond this is an unobserved gap and never credited. */
  maxObservationGapMs: 30_000,
  counts: Object.freeze({
    paused: false,
    background: false,
    focusLost: false,
    afk: false,
    replay: false,
    experiments: false,
    offline: false,
    haos: false,
    auto: true,
  }),
  autoStatement:
    'AUTO contează pentru că jucătorul observă activ orașul: fereastra cere focus, vizibilitate, absența pauzei și verdictul AFK, iar modul de control este păstrat ca dovadă, nu folosit ca filtru.',
  monotone: Object.freeze({
    debits: 0 as const,
    negativeCredits: false,
    penalties: 'NONE' as const,
    levelSource: 'XP_BALANCE' as const,
    statement:
      'Soldul crește doar prin credite nenegative și nu există operație de debit, penalizare sau reset; nivelul este derivat strict crescător din sold.',
  }),
  /** What never contributes XP, published so the composition layer cannot guess. */
  excluded: Object.freeze([
    'PAUSE',
    'FOCUS_LOST',
    'BACKGROUND_WINDOW',
    'AFK',
    'REPLAY',
    'EXPERIMENT',
    'OFFLINE_GAP',
    'HAOS',
  ]),
});

/** Whole-XP threshold of a level: an arithmetic progression, versioned and monotone. */
export function levelThresholdXp(level: number): number {
  const at = tick(level);
  requireContract(
    at >= 1 && at <= MAX_PLAYER_LEVEL,
    `Level ${level} is outside the 213 threshold table`,
  );
  return (LEVEL_STEP_XP * (at - 1) * at) / 2;
}

export function levelThresholdMicroXp(level: number): number {
  return levelThresholdXp(level) * XP_MICRO_PER_XP;
}

/** Highest level whose threshold the balance reaches; a pure function of the balance. */
export function levelForXpMicro(microXp: number): number {
  const balance = tick(microXp);
  let level = 1;
  while (level < MAX_PLAYER_LEVEL && levelThresholdMicroXp(level + 1) <= balance) level += 1;
  return level;
}

/**
 * Exact integer micro-XP of an accumulated active time: `ms * 1e6 / 60_000 = ms * 50 / 3`.
 * Splitting the division by three keeps every operation inside the safe integer range.
 */
export function activeTimeMicroXp(activeMs: number): number {
  const ms = tick(activeMs);
  return Math.floor(ms / 3) * 50 + Math.floor(((ms % 3) * 50) / 3);
}

export function microXpToXp(microXp: number): number {
  return tick(microXp) / XP_MICRO_PER_XP;
}

/** Stable identity of one real active-time window; the same period can never pay twice. */
export function activeTimeCreditId(
  playerId: string,
  startedAtMs: number,
  endedAtMs: number,
): string {
  return createStableId('active-time-credit', PLAYER_PROGRESS_NAMESPACE, [
    boundedId(playerId, PLAYER_PROGRESS_LIMITS.idCodeUnits, 'player'),
    `${tick(startedAtMs)}`,
    `${tick(endedAtMs)}`,
  ]);
}

/** Stable identity of the XP entry produced by one cause; the ledger is keyed by it. */
export function xpEntryId(playerId: string, causeType: XpCauseType, causeId: string): string {
  return createStableId('xp-entry', PLAYER_PROGRESS_NAMESPACE, [
    boundedId(playerId, PLAYER_PROGRESS_LIMITS.idCodeUnits, 'player'),
    causeType,
    boundedId(causeId, PLAYER_PROGRESS_LIMITS.idCodeUnits, 'xp cause'),
  ]);
}

export interface MissionXpEvidence {
  readonly source: 'MISSION_REWARD';
  readonly completionId: string;
  readonly missionId: string;
  readonly missionVersion: string;
  readonly definitionRewardId: string;
  readonly namespace: string;
}

export interface DailyXpEvidence {
  readonly source: 'DAILY_REWARD';
  readonly instanceId: string;
  readonly dailyDate: string;
  readonly rewardXp: number;
}

export interface ActiveTimeEvidence {
  readonly source: 'ACTIVE_TIME';
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly activeMs: number;
  readonly controlMode: PlayerControlMode;
  readonly scope: 'ACADEMY';
}

export type XpEntryEvidence = MissionXpEvidence | DailyXpEvidence | ActiveTimeEvidence;

export interface XpEntry {
  /** Stable identity derived from `(playerId, causeType, causeId)`. */
  readonly entryId: string;
  readonly ruleVersion: string;
  readonly causeType: XpCauseType;
  readonly causeId: string;
  readonly amountMicroXp: number;
  readonly amountXp: number;
  /** Running sum of every credit up to and including this one. */
  readonly balanceAfterMicroXp: number;
  readonly balanceAfterXp: number;
  /** Authoritative tick of the cause when it has one; `null` for real-time credits. */
  readonly tick: number | null;
  readonly realTimeMs: number;
  readonly evidence: XpEntryEvidence;
}

export interface PlayerProgressCounters {
  readonly credits: number;
  readonly duplicates: number;
  readonly timeSkips: Readonly<Record<ActiveTimeSkipReason, number>>;
  readonly creditSkips: Readonly<Record<XpSkipReason, number>>;
  readonly skippedWindowMs: number;
  readonly unobservedMs: number;
  readonly offlineGaps: number;
}

export interface XpCauseTotal {
  readonly causeType: XpCauseType;
  readonly entries: number;
  readonly microXp: number;
  readonly xp: number;
}

export interface PlayerProgressRead {
  readonly version: typeof PLAYER_PROGRESS_VERSION;
  readonly namespace: typeof PLAYER_PROGRESS_NAMESPACE;
  readonly playerId: string;
  readonly ruleVersion: string;
  readonly levelVersion: string;
  readonly xpBalance: number;
  readonly xpBalanceMicroXp: number;
  readonly lifetimeXpEarned: number;
  readonly lifetimeXpEarnedMicroXp: number;
  readonly level: number;
  readonly levelThresholdXp: number;
  readonly levelThresholdMicroXp: number;
  readonly nextLevelXp: number | null;
  readonly nextLevelMicroXp: number | null;
  /** Fraction of the current level range already covered, `0..1`; `1` at the highest level. */
  readonly levelProgress: number;
  readonly activePlayMs: number;
  readonly activePlaySeconds: number;
  /** Append-only history in credit order, each row with its running balance. */
  readonly entries: readonly XpEntry[];
  readonly byCause: readonly XpCauseTotal[];
  readonly counters: PlayerProgressCounters;
  readonly accountedThroughMs: number;
  /** Structural: the balance is exactly the sum of these entries. */
  readonly balanceIsSumOfEntries: true;
  readonly monotone: true;
  readonly debits: 0;
  readonly profileWrites: 0;
  readonly policy: typeof PLAYER_XP_POLICY;
}

export interface XpCreditRow {
  readonly causeId: string;
  readonly status: XpCreditOutcome;
  readonly reason: XpSkipReason | null;
  readonly amountMicroXp: number;
  readonly amountXp: number;
  readonly entryId: string | null;
}

export interface XpCreditResult {
  readonly version: typeof PLAYER_PROGRESS_VERSION;
  readonly playerId: string;
  readonly causeType: 'MISSION_REWARD' | 'DAILY_REWARD';
  readonly status: XpCreditOutcome;
  readonly rows: readonly XpCreditRow[];
  readonly credited: number;
  readonly creditedMicroXp: number;
  readonly creditedXp: number;
  readonly duplicates: number;
  readonly skipped: number;
  readonly xpBalance: number;
  readonly xpBalanceMicroXp: number;
  readonly level: number;
}

export interface ActiveTimeResult {
  readonly version: typeof PLAYER_PROGRESS_VERSION;
  readonly playerId: string;
  readonly status: XpCreditOutcome;
  readonly reason: ActiveTimeSkipReason | null;
  readonly causeId: string;
  readonly entryId: string | null;
  readonly windowMs: number;
  readonly creditedMs: number;
  readonly creditedMicroXp: number;
  readonly creditedXp: number;
  /** Time between the previous accounting cursor and this window; never credited. */
  readonly gapMs: number;
  readonly offlineGap: boolean;
  readonly accountedThroughMs: number;
  readonly activePlayMs: number;
  readonly xpBalance: number;
  readonly xpBalanceMicroXp: number;
  readonly level: number;
}

export interface PlayerProgressCheckpoint {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: typeof PLAYER_PROGRESS_VERSION;
  readonly playerId: string;
  readonly ruleVersion: string;
  readonly levelVersion: string;
  readonly entries: readonly XpEntry[];
  readonly accountedThroughMs: number;
  readonly counters: PlayerProgressCounters;
}

export interface PlayerProgressStats {
  readonly version: typeof PLAYER_PROGRESS_VERSION;
  readonly playerId: string;
  readonly entries: number;
  readonly credits: number;
  readonly duplicates: number;
  readonly skipped: number;
  readonly activePlayMs: number;
  readonly xpBalanceMicroXp: number;
  readonly level: number;
  readonly accountedThroughMs: number;
  readonly profileWrites: 0;
}

export interface PlayerProgress {
  readonly version: typeof PLAYER_PROGRESS_VERSION;
  readonly playerId: string;
  readonly ruleVersion: string;
  /** Consumes one real 125 settlement; only its granted XP rewards pay, and only once. */
  creditMission(value: unknown): XpCreditResult;
  /** Consumes one real 211 daily reward record plus the authored instance that produced it. */
  creditDaily(value: unknown): XpCreditResult;
  /** Consumes one short, real observation window of active play. */
  observeActiveTime(value: unknown): ActiveTimeResult;
  read(): PlayerProgressRead;
  entry(entryId: string): XpEntry | undefined;
  checkpoint(): PlayerProgressCheckpoint;
  stats(): PlayerProgressStats;
}

const missionCreditFields = ['settlement', 'observedAtMs'] as const;
const dailyCreditFields = ['record', 'instance'] as const;
const timeFields = [
  'startedAtMs',
  'endedAtMs',
  'scope',
  'controlMode',
  'paused',
  'focused',
  'visible',
  'afk',
] as const;
const checkpointFields = [
  'schemaVersion',
  'units',
  'version',
  'playerId',
  'ruleVersion',
  'levelVersion',
  'entries',
  'accountedThroughMs',
  'counters',
] as const;
const counterFields = [
  'credits',
  'duplicates',
  'timeSkips',
  'creditSkips',
  'skippedWindowMs',
  'unobservedMs',
  'offlineGaps',
] as const;

function emptyTimeSkips(): Record<ActiveTimeSkipReason, number> {
  return {
    PAUSED: 0,
    NOT_FOCUSED: 0,
    BACKGROUND: 0,
    AFK: 0,
    OUTSIDE_ACADEMY: 0,
    WINDOW_TOO_LONG: 0,
    ZERO_DURATION: 0,
    STALE_WINDOW: 0,
  };
}

function emptyCreditSkips(): Record<XpSkipReason, number> {
  return {
    NO_XP_REWARD: 0,
    REWARD_ALREADY_GRANTED: 0,
    DUPLICATE_DELIVERY: 0,
    ZERO_AMOUNT: 0,
  };
}

function frozenTimeSkips(source: Record<string, number>): PlayerProgressCounters['timeSkips'] {
  const result = emptyTimeSkips();
  for (const reason of activeTimeSkipReasons) result[reason] = source[reason] ?? 0;
  return Object.freeze(result);
}

function frozenCreditSkips(source: Record<string, number>): PlayerProgressCounters['creditSkips'] {
  const result = emptyCreditSkips();
  for (const reason of xpSkipReasons) result[reason] = source[reason] ?? 0;
  return Object.freeze(result);
}

function requireBoolean(data: Record<string, unknown>, key: string, label: string): boolean {
  requireRequired(data, key, label);
  const value = data[key];
  requireContract(typeof value === 'boolean', `${label} field ${key} must be a boolean`);
  return value;
}

function requireWholeXp(value: unknown, maximum: number, label: string): number {
  const amount = number(value, 0, maximum);
  requireContract(Number.isSafeInteger(amount), `${label} must be a whole number of XP`);
  return amount;
}

function readMissionRow(value: unknown): {
  readonly rewardId: string;
  readonly definitionRewardId: string;
  readonly kind: string;
  readonly amount: number;
  readonly status: string;
} {
  const row = plainFields(
    value,
    [
      'definitionRewardId',
      'rewardId',
      'kind',
      'amount',
      'unlockId',
      'capabilityId',
      'status',
      'reason',
    ],
    'mission reward row',
  );
  for (const key of ['definitionRewardId', 'rewardId', 'kind', 'amount', 'status'] as const)
    requireRequired(row, key, 'mission reward row');
  return {
    rewardId: boundedId(row.rewardId, PLAYER_PROGRESS_LIMITS.idCodeUnits, 'mission reward'),
    definitionRewardId: boundedId(
      row.definitionRewardId,
      PLAYER_PROGRESS_LIMITS.idCodeUnits,
      'definition reward',
    ),
    kind: row.kind as string,
    amount: requireWholeXp(row.amount, PLAYER_PROGRESS_LIMITS.maxCreditXp, 'mission reward'),
    status: row.status as string,
  };
}

function readMissionSettlement(value: unknown): MissionCompletionResult {
  const data = plainFields(
    value,
    [
      'version',
      'namespace',
      'missionId',
      'missionVersion',
      'attempt',
      'completionId',
      'completedTick',
      'status',
      'rewards',
      'rewardsGranted',
      'rewardsDuplicate',
      'xpGranted',
      'unlocked',
      'duplicateReasons',
      'profileWrites',
      'learningJobs',
    ],
    'mission settlement',
  );
  for (const key of [
    'version',
    'namespace',
    'missionId',
    'missionVersion',
    'completionId',
    'completedTick',
    'rewards',
    'profileWrites',
  ] as const)
    requireRequired(data, key, 'mission settlement');
  requireContract(
    data.version === REWARDS_SCHEMA_VERSION,
    'XP credits require a real 125 mission settlement',
  );
  requireContract(data.profileWrites === 0, 'A 125 settlement never writes a driving profile');
  boundedId(data.namespace, PLAYER_PROGRESS_LIMITS.idCodeUnits, 'mission namespace');
  boundedId(data.missionId, PLAYER_PROGRESS_LIMITS.idCodeUnits, 'mission');
  boundedId(data.missionVersion, PLAYER_PROGRESS_LIMITS.idCodeUnits, 'mission version');
  boundedId(data.completionId, PLAYER_PROGRESS_LIMITS.idCodeUnits, 'mission completion');
  tick(data.completedTick);
  const rows = list(data.rewards, readMissionRow);
  for (const row of rows) {
    requireContract(
      (missionRewardKinds as readonly string[]).includes(row.kind),
      `Unknown 116 reward kind: ${row.kind}`,
    );
    requireContract(
      (missionRewardGrantStatuses as readonly string[]).includes(row.status),
      `Unknown 125 reward status: ${row.status}`,
    );
  }
  return value as MissionCompletionResult;
}

function readDailyRecord(value: unknown): DailyRewardRecord {
  const data = plainFields(
    value,
    ['instanceId', 'rewardId', 'dailyDate', 'grantedAtMs'],
    'daily reward record',
  );
  for (const key of ['instanceId', 'rewardId', 'dailyDate', 'grantedAtMs'] as const)
    requireRequired(data, key, 'daily reward record');
  return Object.freeze({
    instanceId: boundedId(data.instanceId, PLAYER_PROGRESS_LIMITS.idCodeUnits, 'daily instance'),
    rewardId: boundedId(data.rewardId, PLAYER_PROGRESS_LIMITS.idCodeUnits, 'daily reward'),
    dailyDate: boundedId(data.dailyDate, PLAYER_PROGRESS_LIMITS.idCodeUnits, 'daily date'),
    grantedAtMs: tick(data.grantedAtMs),
  });
}

function readDailyInstance(value: unknown): DailyMissionInstance {
  requireContract(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'Daily XP requires the authored 211 instance',
  );
  const data = value as Record<string, unknown>;
  const instance = plainFields(
    data,
    [
      'instanceId',
      'slot',
      'familyId',
      'templateVersion',
      'category',
      'objectiveKind',
      'controlRequirement',
      'allowsManual',
      'learningKey',
      'target',
      'difficulty',
      'zone',
      'incidentBudget',
      'windowTicks',
      'minDurationS',
      'rewardXp',
      'title',
      'label',
    ],
    'daily instance',
  );
  for (const key of ['instanceId', 'rewardXp'] as const)
    requireRequired(instance, key, 'daily instance');
  return value as DailyMissionInstance;
}

function readSkipCounter(
  value: unknown,
  reasons: readonly string[],
  label: string,
): Record<string, number> {
  requireContract(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    `${label} must be an object`,
  );
  const data = value as Record<string, unknown>;
  const keys = Object.keys(data).sort(compareText);
  requireContract(
    keys.length === reasons.length && keys.every((key) => reasons.includes(key)),
    `${label} must hold exactly the closed reasons`,
  );
  const result: Record<string, number> = Object.create(null);
  for (const reason of reasons) result[reason] = tick(data[reason]);
  return result;
}

function readEntry(value: unknown, playerId: string): XpEntry {
  const data = plainFields(
    value,
    [
      'entryId',
      'ruleVersion',
      'causeType',
      'causeId',
      'amountMicroXp',
      'amountXp',
      'balanceAfterMicroXp',
      'balanceAfterXp',
      'tick',
      'realTimeMs',
      'evidence',
    ],
    'xp entry',
  );
  for (const key of [
    'entryId',
    'ruleVersion',
    'causeType',
    'causeId',
    'amountMicroXp',
    'amountXp',
    'balanceAfterMicroXp',
    'balanceAfterXp',
    'realTimeMs',
    'evidence',
  ] as const)
    requireRequired(data, key, 'xp entry');
  const causeType = data.causeType;
  requireContract(
    (xpCauseTypes as readonly unknown[]).includes(causeType),
    'Unknown XP cause type',
  );
  const cause = causeType as XpCauseType;
  const causeId = boundedId(data.causeId, PLAYER_PROGRESS_LIMITS.idCodeUnits, 'xp cause');
  const entryId = boundedId(data.entryId, PLAYER_PROGRESS_LIMITS.idCodeUnits, 'xp entry');
  requireContract(
    entryId === xpEntryId(playerId, cause, causeId),
    'XP entry identity is not the stable 213 identity of its cause',
  );
  const amountMicroXp = tick(data.amountMicroXp);
  requireContract(data.amountXp === microXpToXp(amountMicroXp), 'XP entry amount drifted');
  const evidenceFields =
    cause === 'MISSION_REWARD'
      ? ['source', 'completionId', 'missionId', 'missionVersion', 'definitionRewardId', 'namespace']
      : cause === 'DAILY_REWARD'
        ? ['source', 'instanceId', 'dailyDate', 'rewardXp']
        : ['source', 'startedAtMs', 'endedAtMs', 'activeMs', 'controlMode', 'scope'];
  const evidenceData = plainFields(data.evidence, evidenceFields, 'xp evidence');
  requireContract(evidenceData.source === cause, 'XP evidence source does not match the cause');
  let evidence: XpEntryEvidence;
  if (cause === 'MISSION_REWARD') {
    for (const key of [
      'completionId',
      'missionId',
      'missionVersion',
      'definitionRewardId',
      'namespace',
    ] as const)
      boundedId(evidenceData[key], PLAYER_PROGRESS_LIMITS.idCodeUnits, key);
    evidence = Object.freeze({
      source: 'MISSION_REWARD' as const,
      completionId: evidenceData.completionId as string,
      missionId: evidenceData.missionId as string,
      missionVersion: evidenceData.missionVersion as string,
      definitionRewardId: evidenceData.definitionRewardId as string,
      namespace: evidenceData.namespace as string,
    });
  } else if (cause === 'DAILY_REWARD') {
    evidence = Object.freeze({
      source: 'DAILY_REWARD' as const,
      instanceId: boundedId(
        evidenceData.instanceId,
        PLAYER_PROGRESS_LIMITS.idCodeUnits,
        'daily instance',
      ),
      dailyDate: boundedId(
        evidenceData.dailyDate,
        PLAYER_PROGRESS_LIMITS.idCodeUnits,
        'daily date',
      ),
      rewardXp: requireWholeXp(
        evidenceData.rewardXp,
        PLAYER_PROGRESS_LIMITS.maxCreditXp,
        'daily reward',
      ),
    });
    requireContract(
      causeId === dailyRewardId(playerId, evidence.instanceId),
      'Daily XP cause is not the stable 211 reward identity',
    );
    requireContract(
      amountMicroXp === evidence.rewardXp * XP_MICRO_PER_XP,
      'Daily XP amount is not the authored 211 reward',
    );
  } else {
    const controlMode = evidenceData.controlMode;
    requireContract(
      (playerControlModes as readonly unknown[]).includes(controlMode),
      'Unknown control mode in active time evidence',
    );
    requireContract(evidenceData.scope === 'ACADEMY', 'Active time XP is Academy-only');
    const startedAtMs = tick(evidenceData.startedAtMs);
    const endedAtMs = tick(evidenceData.endedAtMs);
    const activeMs = tick(evidenceData.activeMs);
    requireContract(
      activeMs > 0 && endedAtMs > startedAtMs && activeMs === endedAtMs - startedAtMs,
      'Active time evidence does not describe a contiguous window',
    );
    requireContract(
      causeId === activeTimeCreditId(playerId, startedAtMs, endedAtMs),
      'Active time cause is not the stable window identity',
    );
    evidence = Object.freeze({
      source: 'ACTIVE_TIME' as const,
      startedAtMs,
      endedAtMs,
      activeMs,
      controlMode: controlMode as PlayerControlMode,
      scope: 'ACADEMY' as const,
    });
  }
  const tickValue = data.tick === undefined || data.tick === null ? null : tick(data.tick);
  const realTimeMs = tick(data.realTimeMs);
  const balanceAfterMicroXp = tick(data.balanceAfterMicroXp);
  requireContract(
    data.balanceAfterXp === microXpToXp(balanceAfterMicroXp),
    'XP running balance drifted',
  );
  return Object.freeze({
    entryId,
    ruleVersion: text(data.ruleVersion),
    causeType: cause,
    causeId,
    amountMicroXp,
    amountXp: microXpToXp(amountMicroXp),
    balanceAfterMicroXp,
    balanceAfterXp: microXpToXp(balanceAfterMicroXp),
    tick: tickValue,
    realTimeMs,
    evidence,
  });
}

function readCounters(value: unknown): PlayerProgressCounters {
  const data = plainFields(value, counterFields, 'player progress counters');
  for (const key of counterFields) requireRequired(data, key, 'player progress counters');
  return Object.freeze({
    credits: tick(data.credits),
    duplicates: tick(data.duplicates),
    timeSkips: frozenTimeSkips(
      readSkipCounter(data.timeSkips, activeTimeSkipReasons, 'time skips'),
    ),
    creditSkips: frozenCreditSkips(
      readSkipCounter(data.creditSkips, xpSkipReasons, 'credit skips'),
    ),
    skippedWindowMs: tick(data.skippedWindowMs),
    unobservedMs: tick(data.unobservedMs),
    offlineGaps: tick(data.offlineGaps),
  });
}

/**
 * Rebuilds a progress ledger from a checkpoint. The balance, the level and the totals are derived;
 * only the entries, the accounting cursor and the counters are stored, and every row is checked
 * against its identity, its running balance and the exact integer accrual.
 */
export function parsePlayerProgress(value: unknown): PlayerProgress {
  const data = plainFields(value, checkpointFields, 'player progress checkpoint');
  for (const key of checkpointFields) requireRequired(data, key, 'player progress checkpoint');
  requireContract(
    data.schemaVersion === 1 && data.units === 'SI',
    'Unsupported player progress schema or units',
  );
  requireContract(data.version === PLAYER_PROGRESS_VERSION, 'Unsupported player progress version');
  requireContract(data.ruleVersion === XP_RULE_VERSION, 'Unsupported XP rule version');
  requireContract(data.levelVersion === XP_LEVEL_VERSION, 'Unsupported XP level version');
  const playerId = boundedId(data.playerId, PLAYER_PROGRESS_LIMITS.idCodeUnits, 'player');
  const entries = list(data.entries, (entry) => readEntry(entry, playerId));
  requireContract(
    entries.length <= PLAYER_PROGRESS_LIMITS.entries,
    'Player progress capacity exceeded',
  );
  const counters = readCounters(data.counters);
  const accountedThroughMs = tick(data.accountedThroughMs);
  return createPlayerProgress({ playerId, entries, accountedThroughMs, counters });
}

interface PlayerProgressState {
  readonly playerId: string;
  readonly entries?: readonly XpEntry[];
  readonly accountedThroughMs?: number;
  readonly counters?: PlayerProgressCounters;
}

export function createPlayerProgress(options: unknown): PlayerProgress {
  const raw = plainFields(
    options,
    ['playerId', 'entries', 'accountedThroughMs', 'counters'],
    'player progress option',
  );
  requireRequired(raw, 'playerId', 'player progress option');
  const state = raw as unknown as PlayerProgressState;
  const playerId = boundedId(state.playerId, PLAYER_PROGRESS_LIMITS.idCodeUnits, 'player');

  const entries: XpEntry[] = [];
  const byEntryId = new Map<string, XpEntry>();
  let balanceMicroXp = 0;
  let activePlayMs = 0;
  let accountedThroughMs = 0;
  const timeSkips = emptyTimeSkips();
  const creditSkips = emptyCreditSkips();
  let credits = 0;
  let duplicates = 0;
  let skippedWindowMs = 0;
  let unobservedMs = 0;
  let offlineGaps = 0;

  function counters(): PlayerProgressCounters {
    return Object.freeze({
      credits,
      duplicates,
      timeSkips: frozenTimeSkips(timeSkips),
      creditSkips: frozenCreditSkips(creditSkips),
      skippedWindowMs,
      unobservedMs,
      offlineGaps,
    });
  }

  function levelOf(balance: number): number {
    return levelForXpMicro(balance);
  }

  /** Appends one credit; the caller already proved the identity is new. */
  function append(input: {
    readonly causeType: XpCauseType;
    readonly causeId: string;
    readonly amountMicroXp: number;
    readonly tick: number | null;
    readonly realTimeMs: number;
    readonly evidence: XpEntryEvidence;
  }): XpEntry {
    requireContract(
      entries.length < PLAYER_PROGRESS_LIMITS.entries,
      'Player progress capacity exceeded',
    );
    const amountMicroXp = tick(input.amountMicroXp);
    const nextBalance = balanceMicroXp + amountMicroXp;
    requireContract(
      Number.isSafeInteger(nextBalance) && nextBalance <= Number.MAX_SAFE_INTEGER,
      'XP balance exceeds the safe integer range',
    );
    const entryId = xpEntryId(playerId, input.causeType, input.causeId);
    requireContract(!byEntryId.has(entryId), 'Duplicate XP entry identity');
    const entry: XpEntry = Object.freeze({
      entryId,
      ruleVersion: XP_RULE_VERSION,
      causeType: input.causeType,
      causeId: input.causeId,
      amountMicroXp,
      amountXp: microXpToXp(amountMicroXp),
      balanceAfterMicroXp: nextBalance,
      balanceAfterXp: microXpToXp(nextBalance),
      tick: input.tick,
      realTimeMs: tick(input.realTimeMs),
      evidence: input.evidence,
    });
    entries.push(entry);
    byEntryId.set(entryId, entry);
    balanceMicroXp = nextBalance;
    credits += 1;
    return entry;
  }

  function checkpoint(): PlayerProgressCheckpoint {
    return Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      version: PLAYER_PROGRESS_VERSION,
      playerId,
      ruleVersion: XP_RULE_VERSION,
      levelVersion: XP_LEVEL_VERSION,
      entries: Object.freeze([...entries]),
      accountedThroughMs,
      counters: counters(),
    });
  }

  function read(): PlayerProgressRead {
    const level = levelOf(balanceMicroXp);
    const threshold = levelThresholdMicroXp(level);
    const nextThreshold = level >= MAX_PLAYER_LEVEL ? null : levelThresholdMicroXp(level + 1);
    const levelProgress =
      nextThreshold === null
        ? 1
        : Math.min(1, Math.max(0, (balanceMicroXp - threshold) / (nextThreshold - threshold)));
    const byCause: XpCauseTotal[] = xpCauseTypes.map((causeType) => {
      const rows = entries.filter((entry) => entry.causeType === causeType);
      const micro = rows.reduce((total, entry) => total + entry.amountMicroXp, 0);
      return Object.freeze({
        causeType,
        entries: rows.length,
        microXp: micro,
        xp: microXpToXp(micro),
      });
    });
    return Object.freeze({
      version: PLAYER_PROGRESS_VERSION,
      namespace: PLAYER_PROGRESS_NAMESPACE,
      playerId,
      ruleVersion: XP_RULE_VERSION,
      levelVersion: XP_LEVEL_VERSION,
      xpBalance: microXpToXp(balanceMicroXp),
      xpBalanceMicroXp: balanceMicroXp,
      lifetimeXpEarned: microXpToXp(balanceMicroXp),
      lifetimeXpEarnedMicroXp: balanceMicroXp,
      level,
      levelThresholdXp: levelThresholdXp(level),
      levelThresholdMicroXp: threshold,
      nextLevelXp: nextThreshold === null ? null : microXpToXp(nextThreshold),
      nextLevelMicroXp: nextThreshold,
      levelProgress,
      activePlayMs,
      activePlaySeconds: activePlayMs / 1_000,
      entries: Object.freeze([...entries]),
      byCause: Object.freeze(byCause),
      counters: counters(),
      accountedThroughMs,
      balanceIsSumOfEntries: true as const,
      monotone: true as const,
      debits: 0 as const,
      profileWrites: 0 as const,
      policy: PLAYER_XP_POLICY,
    });
  }

  function creditResult(
    causeType: 'MISSION_REWARD' | 'DAILY_REWARD',
    rows: readonly XpCreditRow[],
  ): XpCreditResult {
    const creditedRows = rows.filter((row) => row.status === 'CREDITED');
    const creditedMicro = creditedRows.reduce((total, row) => total + row.amountMicroXp, 0);
    const skippedRows = rows.filter((row) => row.status === 'SKIPPED');
    const duplicateRows = rows.filter((row) => row.status === 'DUPLICATE');
    const status: XpCreditOutcome =
      creditedRows.length > 0 ? 'CREDITED' : duplicateRows.length > 0 ? 'DUPLICATE' : 'SKIPPED';
    return Object.freeze({
      version: PLAYER_PROGRESS_VERSION,
      playerId,
      causeType,
      status,
      rows: Object.freeze([...rows]),
      credited: creditedRows.length,
      creditedMicroXp: creditedMicro,
      creditedXp: microXpToXp(creditedMicro),
      duplicates: duplicateRows.length,
      skipped: skippedRows.length,
      xpBalance: microXpToXp(balanceMicroXp),
      xpBalanceMicroXp: balanceMicroXp,
      level: levelOf(balanceMicroXp),
    });
  }

  function skipCredit(causeId: string, reason: XpSkipReason): XpCreditRow {
    creditSkips[reason] += 1;
    return Object.freeze({
      causeId,
      status: 'SKIPPED' as const,
      reason,
      amountMicroXp: 0,
      amountXp: 0,
      entryId: null,
    });
  }

  function creditMission(value: unknown): XpCreditResult {
    const data = plainFields(value, missionCreditFields, 'mission XP input');
    for (const key of missionCreditFields) requireRequired(data, key, 'mission XP input');
    const settlement = readMissionSettlement(data.settlement);
    const observedAtMs = tick(data.observedAtMs);
    const rows: XpCreditRow[] = [];
    for (const reward of settlement.rewards) {
      if (reward.kind !== 'XP') continue;
      const causeId = reward.rewardId;
      if (reward.status !== 'GRANTED') {
        rows.push(skipCredit(causeId, 'REWARD_ALREADY_GRANTED'));
        continue;
      }
      if (reward.amount === 0) {
        rows.push(skipCredit(causeId, 'ZERO_AMOUNT'));
        continue;
      }
      const entryId = xpEntryId(playerId, 'MISSION_REWARD', causeId);
      const existing = byEntryId.get(entryId);
      if (existing !== undefined) {
        duplicates += 1;
        creditSkips.DUPLICATE_DELIVERY += 1;
        rows.push(
          Object.freeze({
            causeId,
            status: 'DUPLICATE' as const,
            reason: 'DUPLICATE_DELIVERY' as const,
            amountMicroXp: 0,
            amountXp: 0,
            entryId,
          }),
        );
        continue;
      }
      const amountMicroXp = reward.amount * XP_MICRO_PER_XP;
      append({
        causeType: 'MISSION_REWARD',
        causeId,
        amountMicroXp,
        tick: settlement.completedTick,
        realTimeMs: observedAtMs,
        evidence: Object.freeze({
          source: 'MISSION_REWARD' as const,
          completionId: settlement.completionId,
          missionId: settlement.missionId,
          missionVersion: settlement.missionVersion,
          definitionRewardId: reward.definitionRewardId,
          namespace: settlement.namespace,
        }),
      });
      rows.push(
        Object.freeze({
          causeId,
          status: 'CREDITED' as const,
          reason: null,
          amountMicroXp,
          amountXp: microXpToXp(amountMicroXp),
          entryId,
        }),
      );
    }
    if (rows.length === 0) rows.push(skipCredit(settlement.completionId, 'NO_XP_REWARD'));
    return creditResult('MISSION_REWARD', rows);
  }

  function creditDaily(value: unknown): XpCreditResult {
    const data = plainFields(value, dailyCreditFields, 'daily XP input');
    for (const key of dailyCreditFields) requireRequired(data, key, 'daily XP input');
    const record = readDailyRecord(data.record);
    const instance = readDailyInstance(data.instance);
    const instanceId = boundedId(
      instance.instanceId,
      PLAYER_PROGRESS_LIMITS.idCodeUnits,
      'daily instance',
    );
    requireContract(
      record.instanceId === instanceId,
      'Daily reward record does not belong to the authored instance',
    );
    requireContract(
      record.rewardId === dailyRewardId(playerId, instanceId),
      'Daily reward identity is not the stable 211 identity of this player',
    );
    const authoredXp = requireWholeXp(
      instance.rewardXp,
      PLAYER_PROGRESS_LIMITS.maxCreditXp,
      'daily reward',
    );
    requireContract(
      authoredXp === DAILY_MISSION_XP,
      'Daily reward differs from the authored 211 XP',
    );
    const causeId = record.rewardId;
    const entryId = xpEntryId(playerId, 'DAILY_REWARD', causeId);
    const existing = byEntryId.get(entryId);
    if (existing !== undefined) {
      duplicates += 1;
      creditSkips.DUPLICATE_DELIVERY += 1;
      return creditResult('DAILY_REWARD', [
        Object.freeze({
          causeId,
          status: 'DUPLICATE' as const,
          reason: 'DUPLICATE_DELIVERY' as const,
          amountMicroXp: 0,
          amountXp: 0,
          entryId,
        }),
      ]);
    }
    const amountMicroXp = authoredXp * XP_MICRO_PER_XP;
    append({
      causeType: 'DAILY_REWARD',
      causeId,
      amountMicroXp,
      tick: null,
      realTimeMs: record.grantedAtMs,
      evidence: Object.freeze({
        source: 'DAILY_REWARD' as const,
        instanceId,
        dailyDate: record.dailyDate,
        rewardXp: authoredXp,
      }),
    });
    return creditResult('DAILY_REWARD', [
      Object.freeze({
        causeId,
        status: 'CREDITED' as const,
        reason: null,
        amountMicroXp,
        amountXp: microXpToXp(amountMicroXp),
        entryId,
      }),
    ]);
  }

  function observeActiveTime(value: unknown): ActiveTimeResult {
    const data = plainFields(value, timeFields, 'active time window');
    for (const key of timeFields) requireRequired(data, key, 'active time window');
    const startedAtMs = tick(data.startedAtMs);
    const endedAtMs = tick(data.endedAtMs);
    requireContract(endedAtMs >= startedAtMs, 'Active time window ends before it starts');
    requireContract(
      (playerTimeScopes as readonly unknown[]).includes(data.scope),
      'Unknown world scope of the active time window',
    );
    requireContract(
      (playerControlModes as readonly unknown[]).includes(data.controlMode),
      'Unknown control mode of the active time window',
    );
    const scope = data.scope as PlayerTimeScope;
    const controlMode = data.controlMode as PlayerControlMode;
    const paused = requireBoolean(data, 'paused', 'active time window');
    const focused = requireBoolean(data, 'focused', 'active time window');
    const visible = requireBoolean(data, 'visible', 'active time window');
    const afk = requireBoolean(data, 'afk', 'active time window');
    const windowMs = endedAtMs - startedAtMs;
    const causeId = activeTimeCreditId(playerId, startedAtMs, endedAtMs);
    const entryId = xpEntryId(playerId, 'ACTIVE_TIME', causeId);

    function result(
      status: XpCreditOutcome,
      reason: ActiveTimeSkipReason | null,
      creditedMs: number,
      creditedMicroXp: number,
      gapMs: number,
      offlineGap: boolean,
    ): ActiveTimeResult {
      return Object.freeze({
        version: PLAYER_PROGRESS_VERSION,
        playerId,
        status,
        reason,
        causeId,
        entryId: status === 'CREDITED' ? entryId : null,
        windowMs,
        creditedMs,
        creditedMicroXp,
        creditedXp: microXpToXp(creditedMicroXp),
        gapMs,
        offlineGap,
        accountedThroughMs,
        activePlayMs,
        xpBalance: microXpToXp(balanceMicroXp),
        xpBalanceMicroXp: balanceMicroXp,
        level: levelOf(balanceMicroXp),
      });
    }

    function skip(
      reason: ActiveTimeSkipReason,
      gapMs: number,
      offlineGap: boolean,
    ): ActiveTimeResult {
      timeSkips[reason] += 1;
      skippedWindowMs += windowMs;
      if (endedAtMs > accountedThroughMs) accountedThroughMs = endedAtMs;
      return result('SKIPPED', reason, 0, 0, gapMs, offlineGap);
    }

    if (windowMs === 0) return skip('ZERO_DURATION', 0, false);
    const existing = byEntryId.get(entryId);
    if (existing !== undefined) {
      duplicates += 1;
      return result('DUPLICATE', null, 0, 0, 0, false);
    }
    if (startedAtMs < accountedThroughMs) return skip('STALE_WINDOW', 0, false);
    if (windowMs > PLAYER_XP_POLICY.maxObservationWindowMs)
      return skip('WINDOW_TOO_LONG', 0, false);

    // The first observed window opens the accounting: nothing before it belongs to the session.
    const gapMs = accountedThroughMs === 0 ? 0 : startedAtMs - accountedThroughMs;
    const offlineGap = gapMs > PLAYER_XP_POLICY.maxObservationGapMs;
    if (gapMs > 0) {
      unobservedMs += gapMs;
      if (offlineGap) offlineGaps += 1;
    }
    let reason: ActiveTimeSkipReason | null = null;
    if (scope !== 'ACADEMY') reason = 'OUTSIDE_ACADEMY';
    else if (paused) reason = 'PAUSED';
    else if (!focused) reason = 'NOT_FOCUSED';
    else if (!visible) reason = 'BACKGROUND';
    else if (afk) reason = 'AFK';
    if (reason !== null) {
      timeSkips[reason] += 1;
      skippedWindowMs += windowMs;
      accountedThroughMs = endedAtMs;
      return result('SKIPPED', reason, 0, 0, gapMs, offlineGap);
    }

    const creditedMicroXp =
      activeTimeMicroXp(activePlayMs + windowMs) - activeTimeMicroXp(activePlayMs);
    activePlayMs += windowMs;
    requireContract(
      activePlayMs <= PLAYER_PROGRESS_LIMITS.lifetimeActiveMs,
      'Active play exceeds the 213 lifetime range',
    );
    accountedThroughMs = endedAtMs;
    append({
      causeType: 'ACTIVE_TIME',
      causeId,
      amountMicroXp: creditedMicroXp,
      tick: null,
      realTimeMs: endedAtMs,
      evidence: Object.freeze({
        source: 'ACTIVE_TIME' as const,
        startedAtMs,
        endedAtMs,
        activeMs: windowMs,
        controlMode,
        scope: 'ACADEMY' as const,
      }),
    });
    return result('CREDITED', null, windowMs, creditedMicroXp, gapMs, offlineGap);
  }

  // A restored checkpoint is rebuilt through the same identity and running-balance rules.
  if (state.entries !== undefined) {
    const restored = list(state.entries, (entry) => readEntry(entry, playerId));
    requireContract(
      restored.length <= PLAYER_PROGRESS_LIMITS.entries,
      'Player progress capacity exceeded',
    );
    for (const entry of restored) {
      requireContract(
        entry.balanceAfterMicroXp === balanceMicroXp + entry.amountMicroXp,
        'XP running balance is not the sum of the credits',
      );
      entries.push(entry);
      byEntryId.set(entry.entryId, entry);
      balanceMicroXp = entry.balanceAfterMicroXp;
      credits += 1;
      if (entry.causeType === 'ACTIVE_TIME' && entry.evidence.source === 'ACTIVE_TIME')
        activePlayMs += entry.evidence.activeMs;
    }
    requireContract(
      activePlayMs <= PLAYER_PROGRESS_LIMITS.lifetimeActiveMs,
      'Active play exceeds the 213 lifetime range',
    );
    accountedThroughMs = tick(state.accountedThroughMs ?? 0);
    for (const entry of entries) {
      const end =
        entry.causeType === 'ACTIVE_TIME' && entry.evidence.source === 'ACTIVE_TIME'
          ? entry.evidence.endedAtMs
          : 0;
      requireContract(
        end <= accountedThroughMs,
        'Credited active time is beyond the accounting cursor',
      );
    }
    const restoredCounters = state.counters;
    if (restoredCounters !== undefined) {
      requireContract(
        restoredCounters.credits === entries.length,
        'Restored credit counter does not match the retained entries',
      );
      duplicates += restoredCounters.duplicates;
      for (const reason of activeTimeSkipReasons)
        timeSkips[reason] += restoredCounters.timeSkips[reason];
      for (const reason of xpSkipReasons)
        creditSkips[reason] += restoredCounters.creditSkips[reason];
      skippedWindowMs += restoredCounters.skippedWindowMs;
      unobservedMs += restoredCounters.unobservedMs;
      offlineGaps += restoredCounters.offlineGaps;
    }
  }

  return Object.freeze({
    version: PLAYER_PROGRESS_VERSION,
    playerId,
    ruleVersion: XP_RULE_VERSION,
    creditMission,
    creditDaily,
    observeActiveTime,
    read,
    entry(entryId: string): XpEntry | undefined {
      return byEntryId.get(text(entryId));
    },
    checkpoint,
    stats(): PlayerProgressStats {
      return Object.freeze({
        version: PLAYER_PROGRESS_VERSION,
        playerId,
        entries: entries.length,
        credits,
        duplicates,
        skipped:
          activeTimeSkipReasons.reduce((total, reason) => total + timeSkips[reason], 0) +
          xpSkipReasons.reduce((total, reason) => total + creditSkips[reason], 0),
        activePlayMs,
        xpBalanceMicroXp: balanceMicroXp,
        level: levelOf(balanceMicroXp),
        accountedThroughMs,
        profileWrites: 0 as const,
      });
    },
  });
}

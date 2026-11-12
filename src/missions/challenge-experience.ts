import {
  choice,
  createStableId,
  list,
  number,
  randomUint32,
  requireContract,
  text,
  tick,
} from '../sessions';
import {
  CHALLENGE_LIMITS,
  CHALLENGE_TICK_HZ,
  challengeDailyFamilies,
  challengeEvaluatorIds,
  challengeFamilies,
  challengeObjectiveKinds,
  challengePrerequisitesMissing,
  challengeSessionKinds,
  createChallengeTemplateCatalog,
  parseChallengeTemplateCatalog,
} from './challenges';
import type {
  ChallengeControlRequirement,
  ChallengeEvaluatorId,
  ChallengeFamily,
  ChallengeObjectiveKind,
  ChallengeSessionKind,
  ChallengeTemplate,
  ChallengeTemplateCatalog,
  ChallengeVerdict,
} from './challenges';
import { boundedId, compareText, plainFields, requireRequired } from './contracts';
import { DAILY_MISSIONS_PER_DAY, parseDailyDate, resolveDailyCalendarDay } from './daily';
import type { DailyCalendarDay, DailyCalendarInput } from './daily';
import type { ChallengeDirector, ChallengeDirectorInstance } from './director';
import { XP_MICRO_PER_XP, microXpToXp } from './player-progress';
import type { PlayerProgress, XpCreditOutcome } from './player-progress';
import { REWARDS_SCHEMA_VERSION } from './rewards';
import type { MissionCompletionResult, MissionSettledReward } from './rewards';

/**
 * 233 challenge experience: idempotent reward credit, personal records, fast retry, daily variety
 * and the deterministic comic reactions of a finished challenge.
 *
 * The module consumes the delivered contracts instead of inventing parallel ones:
 *
 * - the catalog and its authored dialogue come from 231 (`./challenges`);
 * - the live instance, its terminal outcome, its verdict and the replay attempt rule come from
 *   232 (`./director`);
 * - XP is credited once through the real 213 ledger (`PlayerProgress.creditMission`); there is no
 *   second ledger and no local XP counter;
 * - the day identity, the `YYYY-MM-DD` vocabulary and the three-mission daily size come from 211
 *   (`./daily`).
 *
 * Reward identity is `(family, dailyDate)`: the first completed Academy challenge of a family on a
 * local date pays its authored XP, every other completion of that family on that date is a record
 * only. The identity is a stable 006 id, so the 213 ledger deduplicates it even after a reload, an
 * import, a rerun or a clock rollback. A rollback to a past date opens no new credit at all.
 *
 * Personal records are stored per `(templateId, templateVersion)`. A result beats a record only
 * when its versioned rank vector is strictly greater; equality is reported as `EQUAL` and never
 * rewrites the best, and a worse run never lowers it.
 *
 * There is no clock, no `Math.random`, no DOM and no renderer here: the caller passes an explicit
 * calendar, the real instance and the real ledger.
 */

export const CHALLENGE_EXPERIENCE_VERSION = '233-challenge-experience-v1' as const;
export const CHALLENGE_EXPERIENCE_STATE_VERSION = '233-challenge-experience-state-v1' as const;
export const CHALLENGE_EXPERIENCE_NAMESPACE = '233-challenge-experience-v1' as const;
export const CHALLENGE_REWARD_KEY_VERSION = '233-challenge-reward-key-v1' as const;
export const CHALLENGE_RECORD_VERSION = '233-challenge-record-v1' as const;
export const CHALLENGE_REACTION_VERSION = '233-challenge-reaction-v1' as const;
export const CHALLENGE_DAILY_VARIETY_VERSION = '233-challenge-daily-variety-v1' as const;
export const CHALLENGE_DAILY_CONNECTION_VERSION = '233-challenge-daily-connection-v1' as const;

/**
 * Fixed budgets. The manifest leaves `challengeHistoryEntries` null, so this PBI establishes a
 * finite provisional admission cap and reports the calibration gap instead of claiming a calibrated
 * budget: a record cannot grow without bound and a dropped reward key is still deduplicated by the
 * 213 ledger.
 */
export const CHALLENGE_EXPERIENCE_LIMITS = Object.freeze({
  version: CHALLENGE_EXPERIENCE_VERSION,
  /** Record rows; the 231 catalog holds at most 32 authored templates. */
  records: 32,
  /** Reward keys retained for the family/day report; older ones are dropped with a counter. */
  rewardedKeys: 64,
  /** Daily picks; 211 fixes the daily set at exactly three. */
  dailyPicks: DAILY_MISSIONS_PER_DAY,
  /** Previous daily template ids the variety avoids when an alternative exists. */
  recentDailyTemplates: 3,
  /** Code units per template, record and reward identity. */
  idCodeUnits: 256,
  /** Code units per authored title and label. */
  titleCodeUnits: 160,
  /** Code units per reaction line. */
  reactionCodeUnits: 240,
  /** Async-world listeners: the experience owns no DOM and no global listener. */
  globalListeners: 0,
});

/** Closed outcomes of a reward credit request. */
export const challengeCreditStatuses = ['CREDITED', 'DUPLICATE', 'SKIPPED'] as const;
export type ChallengeCreditStatus = (typeof challengeCreditStatuses)[number];

/** Closed reasons a challenge credit paid nothing. */
export const challengeCreditReasons = [
  'LOCAL_RECORD_ONLY',
  'NOT_COMPLETED',
  'NOT_ELIGIBLE',
  'CALENDAR_ROLLBACK',
  'FAMILY_REWARDED_TODAY',
  'LEDGER_DUPLICATE',
  'NO_XP_REWARD',
] as const;
export type ChallengeCreditReason = (typeof challengeCreditReasons)[number];

/** Closed record comparison vocabulary. */
export const challengeRecordComparisons = [
  'FIRST_RECORD',
  'BETTER',
  'EQUAL',
  'WORSE',
  'NOT_ELIGIBLE',
] as const;
export type ChallengeRecordComparison = (typeof challengeRecordComparisons)[number];

export const challengeCalendarActions = ['NEW_DAY', 'SAME_DAY', 'ROLLBACK'] as const;
export type ChallengeCalendarAction = (typeof challengeCalendarActions)[number];

/** Closed reaction vocabulary: tone, effect and the exact XP statement. */
export const challengeReactionTones = ['CELEBRATION', 'COMMISERATION', 'SHRUG', 'NEUTRAL'] as const;
export type ChallengeReactionTone = (typeof challengeReactionTones)[number];

export const challengeReactionEffects = ['CELEBRATION', 'COMMISERATION', 'SHRUG', 'NONE'] as const;
export type ChallengeReactionEffect = (typeof challengeReactionEffects)[number];

export const challengeReactionTriggers = [
  'OFFER',
  'PROGRESS',
  'SUCCESS',
  'FAILURE',
  'DECLINE',
] as const;
export type ChallengeReactionTrigger = (typeof challengeReactionTriggers)[number];

export const challengeXpStatements = [
  'XP_PENDING',
  'XP_CREDITED',
  'RECORD_ONLY',
  'NO_XP_LOSS',
  'LOCAL_RECORD_ONLY',
] as const;
export type ChallengeXpStatement = (typeof challengeXpStatements)[number];

/**
 * Terms a reaction can never contain: an external upload promise, an XP loss promise or an insult.
 * The authored 231 lines already pass; the closed decline lines are held to the same rule.
 */
const forbiddenReactionTerms = [
  'upload',
  'instagram',
  'tiktok',
  'youtube',
  'facebook',
  'social media',
  'live stream',
  'pierzi xp',
  'pierdere de xp',
  'penalizare',
  'prost',
  'idiot',
  'tâmpit',
  'netot',
] as const;

/* ---------------------------------------------------------------------------------------------
 * Calendar and reward identity
 * ------------------------------------------------------------------------------------------- */

/**
 * The reward identity of one family on one local date. It deliberately excludes the instance id:
 * a rerun creates a new instance, never a second credit.
 */
export function challengeRewardKey(family: string, dailyDate: string): string {
  const boundedFamily = choice(family, challengeFamilies);
  parseDailyDate(dailyDate);
  return createStableId('challenge-reward', CHALLENGE_EXPERIENCE_NAMESPACE, [
    boundedFamily,
    dailyDate,
  ]);
}

/**
 * Decode one reward key back to its family and local date. The 006 identity is length-prefixed, so
 * the parts are unambiguous; a key that does not carry exactly the four expected parts is refused.
 */
export function decodeChallengeRewardKey(
  key: string,
): Readonly<{ family: ChallengeFamily; dailyDate: string }> | null {
  const prefix = 'id-v1:';
  if (!key.startsWith(prefix)) return null;
  const parts: string[] = [];
  let index = prefix.length;
  while (index < key.length) {
    const colon = key.indexOf(':', index);
    if (colon < 0) return null;
    const length = Number(key.slice(index, colon));
    if (!Number.isSafeInteger(length) || length < 0) return null;
    const start = colon + 1;
    parts.push(key.slice(start, start + length));
    index = start + length;
  }
  if (parts.length !== 4) return null;
  const family = parts[2]!,
    dailyDate = parts[3]!;
  if (!(challengeFamilies as readonly string[]).includes(family)) return null;
  parseDailyDate(dailyDate);
  return Object.freeze({ family: family as ChallengeFamily, dailyDate });
}

function readCalendar(value: unknown): DailyCalendarDay {
  return resolveDailyCalendarDay(value);
}

/* ---------------------------------------------------------------------------------------------
 * Personal records: versioned rank vector and a comparison that never lowers the best
 * ------------------------------------------------------------------------------------------- */

export interface ChallengeRecordScore {
  readonly objectiveKind: ChallengeObjectiveKind;
  readonly evaluatorId: ChallengeEvaluatorId;
  readonly progress: number;
  readonly target: number;
  /** Ticks between the activation and the completion; a session-relative result, not a clock. */
  readonly elapsedTicks: number | null;
  readonly incidents: number;
  readonly validDriftSeconds: number;
  readonly distinctDestroyed: number;
  readonly peakAccelerationMps2: number;
  readonly peakJerkMps3: number;
  readonly stopViolationTicks: number;
  readonly orderViolations: number;
  readonly learningObserved: number;
}

/**
 * Higher is better, dimension by dimension, in a fixed order: progress, then the shorter elapsed
 * attempt, then fewer incidents, then the family-specific quality of the objective. The final
 * dimension is not padded with invented tie-breakers, so two equal runs stay equal.
 */
export function challengeRecordRank(score: ChallengeRecordScore): readonly number[] {
  const rank: number[] = [
    score.progress,
    score.elapsedTicks === null ? 0 : -score.elapsedTicks,
    -score.incidents,
  ];
  switch (score.objectiveKind) {
    case 'COMFORT':
      rank.push(-score.peakAccelerationMps2, -score.peakJerkMps3);
      break;
    case 'DRIFT':
      rank.push(score.validDriftSeconds);
      break;
    case 'DISTRUCTION':
      rank.push(score.distinctDestroyed);
      break;
    case 'CHECKPOINTS':
      rank.push(-score.stopViolationTicks);
      break;
    case 'ZONE_ORDER':
      rank.push(-score.orderViolations);
      break;
    case 'LEARNING':
      rank.push(score.learningObserved);
      break;
    case 'TIMED_DROPOFF':
    case 'PARKING':
      break;
  }
  return Object.freeze(rank);
}

/** `BETTER`, `EQUAL` or `WORSE` for two rank vectors of the same objective kind. */
export function compareChallengeRanks(
  left: readonly number[],
  right: readonly number[],
): 'BETTER' | 'EQUAL' | 'WORSE' {
  requireContract(left.length === right.length, 'Challenge record ranks have different shapes');
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]!,
      b = right[index]!;
    if (a === b) continue;
    return a > b ? 'BETTER' : 'WORSE';
  }
  return 'EQUAL';
}

export interface ChallengeRecordBest {
  readonly score: ChallengeRecordScore;
  readonly rank: readonly number[];
  readonly attempt: number;
  readonly achievedAtTick: number;
  readonly dailyDate: string;
}

export interface ChallengeRecord {
  readonly version: typeof CHALLENGE_RECORD_VERSION;
  /** `templateId@templateVersion`: a revised objective is a new record row. */
  readonly recordId: string;
  readonly templateId: string;
  readonly templateVersion: string;
  readonly family: ChallengeFamily;
  readonly objectiveKind: ChallengeObjectiveKind;
  readonly evaluatorId: ChallengeEvaluatorId;
  readonly sessions: readonly ChallengeSessionKind[];
  readonly best: ChallengeRecordBest | null;
  readonly attempts: number;
  readonly completions: number;
  readonly lastResult: string;
  readonly lastTick: number;
}

export interface ChallengeRecordOutcome {
  readonly version: typeof CHALLENGE_RECORD_VERSION;
  readonly recordId: string;
  readonly templateId: string;
  readonly family: ChallengeFamily;
  readonly comparison: ChallengeRecordComparison;
  readonly score: ChallengeRecordScore | null;
  readonly previous: ChallengeRecordBest | null;
  readonly best: ChallengeRecordBest | null;
  readonly improved: boolean;
  readonly attempts: number;
  readonly completions: number;
}

const recordFields = [
  'version',
  'recordId',
  'templateId',
  'templateVersion',
  'family',
  'objectiveKind',
  'evaluatorId',
  'sessions',
  'best',
  'attempts',
  'completions',
  'lastResult',
  'lastTick',
] as const;
const recordBestFields = ['score', 'rank', 'attempt', 'achievedAtTick', 'dailyDate'] as const;
const recordScoreFields = [
  'objectiveKind',
  'evaluatorId',
  'progress',
  'target',
  'elapsedTicks',
  'incidents',
  'validDriftSeconds',
  'distinctDestroyed',
  'peakAccelerationMps2',
  'peakJerkMps3',
  'stopViolationTicks',
  'orderViolations',
  'learningObserved',
] as const;

function recordIdOf(templateId: string, templateVersion: string): string {
  return `${templateId}@${templateVersion}`;
}

function readScore(value: unknown): ChallengeRecordScore {
  const data = plainFields(value, recordScoreFields, 'challenge record score');
  for (const key of recordScoreFields) requireRequired(data, key, 'challenge record score');
  const score: ChallengeRecordScore = Object.freeze({
    objectiveKind: choice(data.objectiveKind, challengeObjectiveKinds),
    evaluatorId: choice(data.evaluatorId, challengeEvaluatorIds),
    progress: tick(data.progress),
    target: number(data.target, 1, 1_000),
    elapsedTicks: data.elapsedTicks === null ? null : tick(data.elapsedTicks),
    incidents: tick(data.incidents),
    validDriftSeconds: number(data.validDriftSeconds, 0, 100_000),
    distinctDestroyed: tick(data.distinctDestroyed),
    peakAccelerationMps2: number(data.peakAccelerationMps2, 0, 1_000),
    peakJerkMps3: number(data.peakJerkMps3, 0, 100_000),
    stopViolationTicks: tick(data.stopViolationTicks),
    orderViolations: tick(data.orderViolations),
    learningObserved: tick(data.learningObserved),
  });
  requireContract(
    Number.isSafeInteger(score.progress) && score.progress >= 0,
    'Challenge record progress must be whole and non-negative',
  );
  requireContract(
    score.progress >= score.target,
    'Only a completed challenge is a personal record',
  );
  return score;
}

function readBest(value: unknown): ChallengeRecordBest {
  const data = plainFields(value, recordBestFields, 'challenge record best');
  for (const key of recordBestFields) requireRequired(data, key, 'challenge record best');
  const score = readScore(data.score);
  const rank = list(data.rank, (entry) => number(entry, -1_000_000, 1_000_000));
  const expected = challengeRecordRank(score);
  requireContract(rank.length === expected.length, 'Challenge record rank has the wrong shape');
  for (let index = 0; index < expected.length; index += 1)
    requireContract(
      rank[index] === expected[index],
      'Challenge record rank is not derived from its score',
    );
  const dailyDate = text(data.dailyDate);
  parseDailyDate(dailyDate);
  return Object.freeze({
    score,
    rank: Object.freeze([...rank]),
    attempt: number(data.attempt, 1, CHALLENGE_LIMITS.attemptsPerTemplate),
    achievedAtTick: tick(data.achievedAtTick),
    dailyDate,
  });
}

function readRecord(value: unknown): ChallengeRecord {
  const data = plainFields(value, recordFields, 'challenge record');
  for (const key of recordFields) requireRequired(data, key, 'challenge record');
  const templateId = boundedId(data.templateId, CHALLENGE_LIMITS.idCodeUnits, 'challenge template');
  const templateVersion = boundedId(
    data.templateVersion,
    CHALLENGE_LIMITS.idCodeUnits,
    'challenge template version',
  );
  requireContract(
    data.recordId === recordIdOf(templateId, templateVersion),
    'Challenge record identity does not match its template version',
  );
  requireContract(
    data.version === CHALLENGE_RECORD_VERSION,
    'Unsupported challenge record version',
  );
  const family = choice(data.family, challengeFamilies);
  const objectiveKind = choice(data.objectiveKind, challengeObjectiveKinds);
  const evaluatorId = choice(data.evaluatorId, challengeEvaluatorIds);
  const sessions = list(data.sessions, (entry) => choice(entry, challengeSessionKinds));
  requireContract(
    sessions.length > 0 && new Set(sessions).size === sessions.length,
    'Challenge record session list is empty or duplicated',
  );
  const best = data.best === null ? null : readBest(data.best);
  if (best !== null)
    requireContract(
      best.score.objectiveKind === objectiveKind && best.score.evaluatorId === evaluatorId,
      'Challenge record best belongs to another objective',
    );
  const attempts = number(data.attempts, 0, Number.MAX_SAFE_INTEGER);
  const completions = number(data.completions, 0, Number.MAX_SAFE_INTEGER);
  requireContract(
    Number.isSafeInteger(attempts) && Number.isSafeInteger(completions),
    'Challenge record counters must be whole',
  );
  requireContract(completions <= attempts, 'A record has more completions than attempts');
  requireContract(best === null || completions >= 1, 'A challenge best needs a completion');
  return Object.freeze({
    version: CHALLENGE_RECORD_VERSION,
    recordId: recordIdOf(templateId, templateVersion),
    templateId,
    templateVersion,
    family,
    objectiveKind,
    evaluatorId,
    sessions: Object.freeze([...sessions]),
    best,
    attempts,
    completions,
    lastResult: boundedId(data.lastResult, 32, 'challenge last result'),
    lastTick: tick(data.lastTick),
  });
}

function scoreOfVerdict(
  instance: ChallengeDirectorInstance,
  verdict: ChallengeVerdict,
): ChallengeRecordScore {
  const activatedAt = instance.activatedAtTick;
  const completion = verdict.completedAtTick;
  const elapsedTicks =
    completion === null || activatedAt === null ? null : Math.max(0, completion - activatedAt);
  return Object.freeze({
    objectiveKind: verdict.objectiveKind,
    evaluatorId: verdict.evaluatorId,
    progress: verdict.progress,
    target: verdict.target,
    elapsedTicks,
    incidents: verdict.incidents.used,
    validDriftSeconds: verdict.measured.validDriftSeconds,
    distinctDestroyed: verdict.measured.distinctDestroyed,
    peakAccelerationMps2: verdict.measured.peakAccelerationMps2,
    peakJerkMps3: verdict.measured.peakJerkMps3,
    stopViolationTicks: verdict.measured.stopViolationTicks,
    orderViolations: verdict.measured.orderViolations,
    learningObserved: verdict.measured.learningObserved,
  });
}

/* ---------------------------------------------------------------------------------------------
 * Instance readers shared by the record, the credit and the retry
 * ------------------------------------------------------------------------------------------- */

function requireInstance(value: unknown, label: string): ChallengeDirectorInstance {
  requireContract(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    `${label} requires a real 232 instance`,
  );
  const instance = value as ChallengeDirectorInstance;
  requireContract(
    typeof instance.instanceId === 'string' &&
      typeof instance.templateId === 'string' &&
      typeof instance.templateVersion === 'string' &&
      typeof instance.family === 'string' &&
      typeof instance.attempt === 'number',
    `${label} received an incomplete 232 instance`,
  );
  return instance;
}

function terminalOutcome(instance: ChallengeDirectorInstance): {
  readonly outcome: NonNullable<ChallengeDirectorInstance['outcome']>;
} {
  requireContract(instance.outcome !== null, 'A challenge result needs a terminal 232 outcome');
  return { outcome: instance.outcome };
}

/* ---------------------------------------------------------------------------------------------
 * The experience state: records, reward calendar, counters
 * ------------------------------------------------------------------------------------------- */

export interface ChallengeRewardCalendarRead {
  readonly highestObservedDate: string | null;
  readonly timeZone: string | null;
  readonly rewardedKeys: readonly string[];
  readonly rewardedFamiliesToday: readonly string[];
  readonly droppedKeys: number;
}

export interface ChallengeExperienceCounters {
  readonly records: number;
  readonly firstRecords: number;
  readonly better: number;
  readonly equal: number;
  readonly worse: number;
  readonly notEligible: number;
  readonly credits: number;
  readonly duplicates: number;
  readonly skipped: number;
  readonly ledgerCredits: number;
  readonly ledgerDuplicates: number;
  readonly droppedKeys: number;
}

export interface ChallengeExperienceRead {
  readonly version: typeof CHALLENGE_EXPERIENCE_VERSION;
  readonly stateVersion: typeof CHALLENGE_EXPERIENCE_STATE_VERSION;
  readonly catalogVersion: string;
  readonly records: readonly ChallengeRecord[];
  readonly discoveredTemplateIds: readonly string[];
  readonly reward: ChallengeRewardCalendarRead;
  readonly counters: ChallengeExperienceCounters;
}

export interface ChallengeExperienceSnapshot {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: typeof CHALLENGE_EXPERIENCE_STATE_VERSION;
  readonly highestObservedDate: string | null;
  readonly timeZone: string | null;
  readonly rewardedKeys: readonly string[];
  readonly records: readonly ChallengeRecord[];
  readonly counters: ChallengeExperienceCounters;
}

export interface ChallengeExperienceRestoreResult {
  readonly status: 'RESTORED';
  readonly records: number;
  readonly rewardedKeys: number;
  readonly highestObservedDate: string | null;
}

export type ChallengeExperienceRestoreOutcome =
  | ChallengeExperienceRestoreResult
  | Readonly<{ status: 'REFUSED'; code: 'SNAPSHOT_INVALID'; message: string }>;

export interface ChallengeCreditResult {
  readonly version: typeof CHALLENGE_EXPERIENCE_VERSION;
  readonly status: ChallengeCreditStatus;
  readonly reason: ChallengeCreditReason | null;
  readonly rewardKey: string | null;
  readonly family: ChallengeFamily;
  readonly templateId: string;
  readonly sessionKind: ChallengeSessionKind;
  readonly dailyDate: string;
  readonly calendarAction: ChallengeCalendarAction;
  /** Authored 231 XP of the template. */
  readonly academyXp: number;
  /** XP this call actually paid; `0` on every duplicate and every refusal. */
  readonly creditedXp: number;
  readonly creditedMicroXp: number;
  readonly xpBalance: number;
  readonly xpBalanceMicroXp: number;
  readonly level: number;
  readonly entryId: string | null;
  readonly ledgerStatus: XpCreditOutcome | null;
  readonly ledgerDuplicates: number;
  /** 232 identity of the instance outcome, kept as evidence, never used as the ledger key. */
  readonly instanceRewardKey: string | null;
}

export interface ChallengeRecordRequest {
  readonly instance: ChallengeDirectorInstance;
  readonly calendar: DailyCalendarInput;
}

export interface ChallengeCreditRequest {
  readonly instance: ChallengeDirectorInstance;
  readonly calendar: DailyCalendarInput;
}

export interface ChallengeExperience {
  readonly version: typeof CHALLENGE_EXPERIENCE_VERSION;
  /** Trade a terminal instance for a record comparison. Never pays XP. */
  record(value: unknown): ChallengeRecordOutcome;
  /** Credit the authored XP once per family and local date, through the real 213 ledger. */
  credit(value: unknown): ChallengeCreditResult;
  records(): readonly ChallengeRecord[];
  recordFor(templateId: string, templateVersion: string): ChallengeRecord | undefined;
  read(): ChallengeExperienceRead;
  snapshot(): ChallengeExperienceSnapshot;
  restore(value: unknown): ChallengeExperienceRestoreOutcome;
  stats(): ChallengeExperienceRead;
}

const experienceOptionFields = ['ledger', 'catalog', 'snapshot'] as const;
const snapshotFields = [
  'schemaVersion',
  'units',
  'version',
  'highestObservedDate',
  'timeZone',
  'rewardedKeys',
  'records',
  'counters',
] as const;
const counterFields = [
  'records',
  'firstRecords',
  'better',
  'equal',
  'worse',
  'notEligible',
  'credits',
  'duplicates',
  'skipped',
  'ledgerCredits',
  'ledgerDuplicates',
  'droppedKeys',
] as const;

function emptyCounters(): {
  -readonly [Key in keyof ChallengeExperienceCounters]: ChallengeExperienceCounters[Key];
} {
  return {
    records: 0,
    firstRecords: 0,
    better: 0,
    equal: 0,
    worse: 0,
    notEligible: 0,
    credits: 0,
    duplicates: 0,
    skipped: 0,
    ledgerCredits: 0,
    ledgerDuplicates: 0,
    droppedKeys: 0,
  };
}

function readCounters(value: unknown): ChallengeExperienceCounters {
  const data = plainFields(value, counterFields, 'challenge experience counters');
  for (const key of counterFields) requireRequired(data, key, 'challenge experience counters');
  const counters = emptyCounters();
  for (const key of counterFields) counters[key] = tick(data[key]);
  return Object.freeze(counters);
}

export function createChallengeExperience(options: unknown): ChallengeExperience {
  const data = plainFields(options, experienceOptionFields, 'challenge experience option');
  requireRequired(data, 'ledger', 'challenge experience option');
  requireContract(
    typeof data.ledger === 'object' && data.ledger !== null,
    'Challenge experience needs the real 213 ledger',
  );
  const ledger = data.ledger as PlayerProgress;
  requireContract(
    typeof ledger.creditMission === 'function' && typeof ledger.read === 'function',
    'Challenge experience needs the real 213 ledger',
  );
  const catalog = parseChallengeTemplateCatalog(
    data.catalog === undefined ? createChallengeTemplateCatalog() : data.catalog,
  );

  let highestObservedDate: string | null = null;
  let timeZone: string | null = null;
  let rewardedKeys: string[] = [];
  let records: ChallengeRecord[] = [];
  let counters = emptyCounters();

  function recordsInOrder(): readonly ChallengeRecord[] {
    return Object.freeze(
      [...records].sort((left, right) => compareText(left.recordId, right.recordId)),
    );
  }

  function recordFor(templateId: string, templateVersion: string): ChallengeRecord | undefined {
    const id = recordIdOf(templateId, templateVersion);
    return records.find((entry) => entry.recordId === id);
  }

  function read(): ChallengeExperienceRead {
    const ordered = recordsInOrder();
    const discovered = new Set(ordered.map((entry) => entry.templateId));
    const familiesToday = new Set<string>();
    for (const key of rewardedKeys) {
      const decoded = decodeChallengeRewardKey(key);
      if (decoded !== null && decoded.dailyDate === highestObservedDate)
        familiesToday.add(decoded.family);
    }
    return Object.freeze({
      version: CHALLENGE_EXPERIENCE_VERSION,
      stateVersion: CHALLENGE_EXPERIENCE_STATE_VERSION,
      catalogVersion: catalog.version,
      records: ordered,
      discoveredTemplateIds: Object.freeze([...discovered].sort(compareText)),
      reward: Object.freeze({
        highestObservedDate,
        timeZone,
        rewardedKeys: Object.freeze([...rewardedKeys]),
        rewardedFamiliesToday: Object.freeze([...familiesToday].sort(compareText)),
        droppedKeys: counters.droppedKeys,
      }),
      counters: Object.freeze({ ...counters }),
    });
  }

  function rememberKey(key: string): void {
    if (rewardedKeys.includes(key)) return;
    rewardedKeys.push(key);
    while (rewardedKeys.length > CHALLENGE_EXPERIENCE_LIMITS.rewardedKeys) {
      rewardedKeys.shift();
      counters.droppedKeys += 1;
    }
  }

  function record(value: unknown): ChallengeRecordOutcome {
    const request = plainFields(value, ['instance', 'calendar'], 'challenge record request');
    for (const key of ['instance', 'calendar'] as const)
      requireRequired(request, key, 'challenge record request');
    const instance = requireInstance(request.instance, 'Challenge record');
    const { outcome } = terminalOutcome(instance);
    const day = readCalendar(request.calendar);
    const id = recordIdOf(instance.templateId, instance.templateVersion);
    const existing = records.find((entry) => entry.recordId === id);
    const completed = outcome.status === 'COMPLETED' && outcome.verdict !== null;
    const score = completed ? scoreOfVerdict(instance, outcome.verdict!) : null;
    const rank = score === null ? null : challengeRecordRank(score);
    const previous = existing?.best ?? null;
    let comparison: ChallengeRecordComparison = 'NOT_ELIGIBLE';
    let best = previous;
    let improved = false;
    if (score !== null && rank !== null) {
      if (previous === null) {
        comparison = 'FIRST_RECORD';
        counters.firstRecords += 1;
      } else {
        comparison = compareChallengeRanks(rank, previous.rank);
        if (comparison === 'BETTER') counters.better += 1;
        else if (comparison === 'EQUAL') counters.equal += 1;
        else counters.worse += 1;
      }
      if (previous === null || comparison === 'BETTER') {
        best = Object.freeze({
          score,
          rank,
          attempt: instance.attempt,
          achievedAtTick: outcome.verdict!.evaluatedTick,
          dailyDate: day.dailyDate,
        });
        improved = true;
      }
    } else {
      counters.notEligible += 1;
    }
    const attempts = (existing?.attempts ?? 0) + 1;
    const completions = (existing?.completions ?? 0) + (completed ? 1 : 0);
    const next: ChallengeRecord = Object.freeze({
      version: CHALLENGE_RECORD_VERSION,
      recordId: id,
      templateId: instance.templateId,
      templateVersion: instance.templateVersion,
      family: choice(instance.family, challengeFamilies),
      objectiveKind: instance.objective.objectiveKind,
      evaluatorId: instance.objective.evaluatorId,
      sessions: Object.freeze([...new Set([...(existing?.sessions ?? []), instance.sessionKind])]),
      best,
      attempts,
      completions,
      lastResult: outcome.status,
      lastTick: outcome.tick,
    });
    if (existing === undefined) {
      requireContract(
        records.length < CHALLENGE_EXPERIENCE_LIMITS.records,
        'Challenge record capacity exceeded',
      );
      records.push(next);
      counters.records += 1;
    } else {
      records = records.map((entry) => (entry.recordId === id ? next : entry));
    }
    return Object.freeze({
      version: CHALLENGE_RECORD_VERSION,
      recordId: id,
      templateId: instance.templateId,
      family: next.family,
      comparison,
      score,
      previous,
      best,
      improved,
      attempts,
      completions,
    });
  }

  function credit(value: unknown): ChallengeCreditResult {
    const request = plainFields(value, ['instance', 'calendar'], 'challenge credit request');
    for (const key of ['instance', 'calendar'] as const)
      requireRequired(request, key, 'challenge credit request');
    const instance = requireInstance(request.instance, 'Challenge credit');
    const { outcome } = terminalOutcome(instance);
    const calendar = request.calendar as DailyCalendarInput;
    const day = readCalendar(calendar);
    const observedAtMs = tick(calendar.observedAtMs);
    const dayIndex = parseDailyDate(day.dailyDate);
    const highestIndex = highestObservedDate === null ? null : parseDailyDate(highestObservedDate);
    const action: ChallengeCalendarAction =
      highestIndex === null
        ? 'NEW_DAY'
        : dayIndex > highestIndex
          ? 'NEW_DAY'
          : dayIndex === highestIndex
            ? 'SAME_DAY'
            : 'ROLLBACK';
    if (action !== 'ROLLBACK') {
      highestObservedDate = day.dailyDate;
      timeZone = day.timeZone;
    }
    const family = choice(instance.family, challengeFamilies);
    const authored = outcome.reward.academyXp;
    const base = {
      version: CHALLENGE_EXPERIENCE_VERSION,
      rewardKey: null,
      family,
      templateId: instance.templateId,
      sessionKind: instance.sessionKind,
      dailyDate: day.dailyDate,
      calendarAction: action,
      academyXp: authored,
      creditedXp: 0,
      creditedMicroXp: 0,
      ledgerStatus: null,
      ledgerDuplicates: 0,
      instanceRewardKey: outcome.reward.rewardKey,
    } as const;
    const balance = () => ledger.read();
    const skip = (reason: ChallengeCreditReason): ChallengeCreditResult => {
      counters.skipped += 1;
      const readState = balance();
      return Object.freeze({
        ...base,
        status: 'SKIPPED' as const,
        reason,
        xpBalance: readState.xpBalance,
        xpBalanceMicroXp: readState.xpBalanceMicroXp,
        level: readState.level,
        entryId: null,
      });
    };
    if (instance.sessionKind !== 'ACADEMY') return skip('LOCAL_RECORD_ONLY');
    if (outcome.status !== 'COMPLETED') return skip('NOT_COMPLETED');
    if (!outcome.reward.xpEligible) return skip('NOT_ELIGIBLE');
    if (action === 'ROLLBACK') return skip('CALENDAR_ROLLBACK');
    if (!Number.isSafeInteger(authored) || authored <= 0) return skip('NO_XP_REWARD');
    const key = challengeRewardKey(family, day.dailyDate);
    if (rewardedKeys.includes(key)) {
      counters.duplicates += 1;
      const readState = balance();
      return Object.freeze({
        ...base,
        status: 'DUPLICATE' as const,
        reason: 'FAMILY_REWARDED_TODAY' as const,
        rewardKey: key,
        xpBalance: readState.xpBalance,
        xpBalanceMicroXp: readState.xpBalanceMicroXp,
        level: readState.level,
        entryId: null,
      });
    }
    const settlement = challengeXpSettlement(instance, key, authored, outcome.tick);
    const result = ledger.creditMission({ settlement, observedAtMs });
    if (result.creditedXp > 0) {
      counters.credits += 1;
      counters.ledgerCredits += result.credited;
      rememberKey(key);
      return Object.freeze({
        ...base,
        status: 'CREDITED' as const,
        reason: null,
        rewardKey: key,
        creditedXp: result.creditedXp,
        creditedMicroXp: result.creditedMicroXp,
        ledgerStatus: result.status,
        ledgerDuplicates: result.duplicates,
        xpBalance: result.xpBalance,
        xpBalanceMicroXp: result.xpBalanceMicroXp,
        level: result.level,
        entryId: result.rows.find((row) => row.status === 'CREDITED')?.entryId ?? null,
      });
    }
    if (result.duplicates > 0) {
      counters.duplicates += 1;
      counters.ledgerDuplicates += result.duplicates;
      rememberKey(key);
      return Object.freeze({
        ...base,
        status: 'DUPLICATE' as const,
        reason: 'LEDGER_DUPLICATE' as const,
        rewardKey: key,
        ledgerStatus: result.status,
        ledgerDuplicates: result.duplicates,
        xpBalance: result.xpBalance,
        xpBalanceMicroXp: result.xpBalanceMicroXp,
        level: result.level,
        entryId: result.rows.find((row) => row.status === 'DUPLICATE')?.entryId ?? null,
      });
    }
    return skip('NO_XP_REWARD');
  }

  function snapshot(): ChallengeExperienceSnapshot {
    return Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      version: CHALLENGE_EXPERIENCE_STATE_VERSION,
      highestObservedDate,
      timeZone,
      rewardedKeys: Object.freeze([...rewardedKeys]),
      records: recordsInOrder(),
      counters: Object.freeze({ ...counters }),
    });
  }

  function restore(value: unknown): ChallengeExperienceRestoreOutcome {
    try {
      const state = plainFields(value, snapshotFields, 'challenge experience snapshot');
      for (const key of snapshotFields)
        requireRequired(state, key, 'challenge experience snapshot');
      requireContract(
        state.schemaVersion === 1 && state.units === 'SI',
        'Unsupported challenge experience schema version or units',
      );
      requireContract(
        state.version === CHALLENGE_EXPERIENCE_STATE_VERSION,
        'Unsupported challenge experience snapshot version',
      );
      const nextHighest =
        state.highestObservedDate === null ? null : text(state.highestObservedDate);
      if (nextHighest !== null) parseDailyDate(nextHighest);
      const nextTimeZone = state.timeZone === null ? null : text(state.timeZone);
      requireContract(
        (nextHighest === null) === (nextTimeZone === null),
        'Challenge reward calendar identity is incomplete',
      );
      const nextKeys = list(state.rewardedKeys, (entry) =>
        boundedId(entry, CHALLENGE_EXPERIENCE_LIMITS.idCodeUnits, 'challenge reward key'),
      );
      requireContract(
        nextKeys.length <= CHALLENGE_EXPERIENCE_LIMITS.rewardedKeys &&
          new Set(nextKeys).size === nextKeys.length,
        'Challenge reward key capacity or duplicate',
      );
      const nextRecords = list(state.records, readRecord);
      requireContract(
        nextRecords.length <= CHALLENGE_EXPERIENCE_LIMITS.records,
        'Challenge record capacity exceeded',
      );
      requireContract(
        new Set(nextRecords.map((entry) => entry.recordId)).size === nextRecords.length,
        'Duplicate challenge record in the snapshot',
      );
      const nextCounters = readCounters(state.counters);
      requireContract(
        nextCounters.records === nextRecords.length,
        'Challenge record counter does not match the snapshot',
      );
      // Apply only after every field validated, so a rejected snapshot changes nothing.
      highestObservedDate = nextHighest;
      timeZone = nextTimeZone;
      rewardedKeys = [...nextKeys];
      records = [...nextRecords];
      counters = {
        records: nextCounters.records,
        firstRecords: nextCounters.firstRecords,
        better: nextCounters.better,
        equal: nextCounters.equal,
        worse: nextCounters.worse,
        notEligible: nextCounters.notEligible,
        credits: nextCounters.credits,
        duplicates: nextCounters.duplicates,
        skipped: nextCounters.skipped,
        ledgerCredits: nextCounters.ledgerCredits,
        ledgerDuplicates: nextCounters.ledgerDuplicates,
        droppedKeys: nextCounters.droppedKeys,
      };
      return Object.freeze({
        status: 'RESTORED' as const,
        records: records.length,
        rewardedKeys: rewardedKeys.length,
        highestObservedDate,
      });
    } catch (error) {
      return Object.freeze({
        status: 'REFUSED' as const,
        code: 'SNAPSHOT_INVALID' as const,
        message: error instanceof Error ? error.message : 'Invalid challenge experience snapshot',
      });
    }
  }

  const experience: ChallengeExperience = Object.freeze({
    version: CHALLENGE_EXPERIENCE_VERSION,
    record,
    credit,
    records: recordsInOrder,
    recordFor,
    read,
    snapshot,
    restore,
    stats: read,
  });
  if (data.snapshot !== undefined) {
    const restored = restore(data.snapshot);
    requireContract(
      restored.status === 'RESTORED',
      restored.status === 'REFUSED' ? restored.message : 'Challenge experience restore failed',
    );
  }
  return experience;
}

/**
 * The 125-shaped settlement the 213 ledger consumes. The ledger is keyed by
 * `(playerId, causeType, causeId)`, so the stable `(family, dailyDate)` key is what makes the credit
 * idempotent across reload, import, rerun and duplicate delivery.
 */
function challengeXpSettlement(
  instance: ChallengeDirectorInstance,
  rewardKey: string,
  amount: number,
  completedTick: number,
): MissionCompletionResult {
  const reward: MissionSettledReward = Object.freeze({
    definitionRewardId: rewardKey,
    rewardId: rewardKey,
    kind: 'XP' as const,
    amount,
    unlockId: null,
    capabilityId: null,
    status: 'GRANTED' as const,
    reason: null,
  });
  return Object.freeze({
    version: REWARDS_SCHEMA_VERSION,
    namespace: CHALLENGE_EXPERIENCE_NAMESPACE,
    missionId: instance.templateId,
    missionVersion: instance.templateVersion,
    attempt: instance.attempt,
    completionId: rewardKey,
    completedTick,
    status: 'GRANTED' as const,
    rewards: Object.freeze([reward]),
    rewardsGranted: 1,
    rewardsDuplicate: 0,
    xpGranted: amount,
    unlocked: Object.freeze([]),
    duplicateReasons: Object.freeze([]),
    profileWrites: 0 as const,
    learningJobs: 0 as const,
  });
}

/* ---------------------------------------------------------------------------------------------
 * Fast retry: a failed challenge restarts immediately with a new identity, never a new reward
 * ------------------------------------------------------------------------------------------- */

export const challengeRetryRefusals = [
  'NOT_FAILED',
  'ATTEMPT_LIMIT',
  'INVALID_STATE',
  'DIRECTOR_REFUSAL',
] as const;
export type ChallengeRetryRefusal = (typeof challengeRetryRefusals)[number];

export interface ChallengeFastRetryResult {
  readonly version: typeof CHALLENGE_EXPERIENCE_VERSION;
  readonly status: 'RESTARTED' | 'REFUSED';
  readonly code: ChallengeRetryRefusal | null;
  readonly message: string;
  readonly detail: readonly string[];
  readonly previousInstanceId: string | null;
  readonly previousStatus: string | null;
  readonly previousReason: string | null;
  readonly instance: ChallengeDirectorInstance | null;
  readonly templateId: string | null;
  readonly attempt: number | null;
  readonly newIdentity: boolean;
  readonly xpDelta: 0;
  /** The family/day credit identity is unchanged, so a retry can never pay twice. */
  readonly rewardIdentity: 'FAMILY_DAY_UNCHANGED';
}

/**
 * The immediate retry of a failed challenge. It delegates the whole lifecycle to 232 `restart`,
 * which creates a new `instanceId`, seed and attempt for the same template; the reward identity
 * stays `(family, dailyDate)`, so completing the retry the same day cannot pay a second time.
 */
export function challengeFastRetry(value: unknown): ChallengeFastRetryResult {
  const request = plainFields(
    value,
    ['director', 'instanceId', 'capabilities', 'seed'],
    'challenge retry request',
  );
  for (const key of ['director', 'instanceId', 'capabilities'] as const)
    requireRequired(request, key, 'challenge retry request');
  requireContract(
    typeof request.director === 'object' && request.director !== null,
    'Challenge retry needs the real 232 director',
  );
  const director = request.director as ChallengeDirector;
  requireContract(
    typeof director.restart === 'function',
    'Challenge retry needs the real 232 director',
  );
  const instanceId = boundedId(
    request.instanceId,
    CHALLENGE_EXPERIENCE_LIMITS.idCodeUnits,
    'challenge retry instance',
  );
  const instance = director.instance(instanceId);
  const previousStatus = instance?.state ?? null;
  const previousReason = instance?.outcome?.reason ?? null;
  const refused = (
    code: ChallengeRetryRefusal,
    message: string,
    detail: readonly string[] = [],
  ): ChallengeFastRetryResult =>
    Object.freeze({
      version: CHALLENGE_EXPERIENCE_VERSION,
      status: 'REFUSED' as const,
      code,
      message,
      detail: Object.freeze([...detail]),
      previousInstanceId: instanceId,
      previousStatus,
      previousReason,
      instance: null,
      templateId: instance?.templateId ?? null,
      attempt: instance?.attempt ?? null,
      newIdentity: false,
      xpDelta: 0 as const,
      rewardIdentity: 'FAMILY_DAY_UNCHANGED' as const,
    });
  if (instance === undefined)
    return refused('INVALID_STATE', 'Unknown challenge instance', [instanceId]);
  if (instance.state !== 'FAILED')
    return refused(
      'NOT_FAILED',
      'The immediate retry applies to a failed challenge; a live or completed one keeps its state',
      [`state:${instance.state}`],
    );
  const result = director.restart({
    instanceId,
    capabilities: request.capabilities,
    ...(request.seed === undefined ? {} : { seed: request.seed }),
  });
  if (result.status === 'REFUSED')
    return refused(
      result.code === 'ATTEMPT_LIMIT' ? 'ATTEMPT_LIMIT' : 'DIRECTOR_REFUSAL',
      result.message,
      result.detail,
    );
  return Object.freeze({
    version: CHALLENGE_EXPERIENCE_VERSION,
    status: 'RESTARTED' as const,
    code: null,
    message: 'The challenge restarted with a new attempt identity',
    detail: Object.freeze([`from:${instanceId}`, `to:${result.instance.instanceId}`]),
    previousInstanceId: instanceId,
    previousStatus: 'FAILED' as const,
    previousReason,
    instance: result.instance,
    templateId: result.instance.templateId,
    attempt: result.instance.attempt,
    newIdentity: result.instance.instanceId !== instanceId,
    xpDelta: 0 as const,
    rewardIdentity: 'FAMILY_DAY_UNCHANGED' as const,
  });
}

/* ---------------------------------------------------------------------------------------------
 * Daily variety: exactly three challenges, distinct families, at least one manual
 * ------------------------------------------------------------------------------------------- */

export interface ChallengeDailyPick {
  readonly slot: number;
  readonly templateId: string;
  readonly templateVersion: string;
  readonly family: ChallengeFamily;
  readonly title: string;
  readonly label: string;
  readonly objectiveKind: ChallengeObjectiveKind;
  readonly evaluatorId: ChallengeEvaluatorId;
  readonly controlRequirement: ChallengeControlRequirement;
  readonly allowsManual: boolean;
  readonly sessions: readonly ChallengeSessionKind[];
  readonly rewardXp: number;
  /** The template also maps onto a delivered 211 daily objective; `null` otherwise. */
  readonly dailyBridgeFamilyId: string | null;
}

export interface ChallengeDailySet {
  readonly version: typeof CHALLENGE_DAILY_VARIETY_VERSION;
  readonly dailyDate: string;
  readonly seed: number;
  readonly picks: readonly ChallengeDailyPick[];
  readonly counts: Readonly<{
    picks: number;
    families: number;
    manual: number;
    expressible: number;
    deferred: number;
  }>;
  readonly checks: Readonly<{
    exactlyThree: boolean;
    uniqueTemplates: boolean;
    atLeastOneManual: boolean;
    distinctFamilies: boolean;
    catalogOnly: boolean;
    noChaosOnly: boolean;
    noRepeatOfPrevious: boolean;
  }>;
  readonly repeatAvoided: boolean;
}

export interface ChallengeDailyConnection {
  readonly version: typeof CHALLENGE_DAILY_CONNECTION_VERSION;
  readonly bridgeVersion: string;
  readonly bridgeSchema: number;
  readonly dailyMissionsPerDay: number;
  readonly expressibleTemplateIds: readonly string[];
  readonly deferredTemplateIds: readonly string[];
  readonly counts: Readonly<{ expressible: number; deferred: number; catalog: number }>;
  /** Exact statement of what 233 connects to 211 and what stays open. */
  readonly statement: string;
}

/** A template is 211-expressible exactly when 231 publishes it in its daily bridge. */
const expressibleObjectiveKinds: readonly ChallengeObjectiveKind[] = Object.freeze([
  'TIMED_DROPOFF',
  'LEARNING',
]);

export function challengeDailyConnection(catalogInput?: unknown): ChallengeDailyConnection {
  const catalog = parseChallengeTemplateCatalog(
    catalogInput === undefined ? createChallengeTemplateCatalog() : catalogInput,
  );
  const bridge = challengeDailyFamilies(catalog);
  const expressible = new Set(bridge.families.map((entry) => entry.familyId));
  const expressibleIds = catalog.templates
    .filter((entry) => expressible.has(entry.templateId))
    .map((entry) => entry.templateId)
    .sort(compareText);
  const deferredIds = catalog.templates
    .filter((entry) => !expressible.has(entry.templateId))
    .map((entry) => entry.templateId)
    .sort(compareText);
  return Object.freeze({
    version: CHALLENGE_DAILY_CONNECTION_VERSION,
    bridgeVersion: bridge.version,
    bridgeSchema: bridge.schemaVersion,
    dailyMissionsPerDay: DAILY_MISSIONS_PER_DAY,
    expressibleTemplateIds: Object.freeze(expressibleIds),
    deferredTemplateIds: Object.freeze(deferredIds),
    counts: Object.freeze({
      expressible: expressibleIds.length,
      deferred: deferredIds.length,
      catalog: catalog.templates.length,
    }),
    statement:
      '211 rămâne generatorul zilnic: catalogul versiunii 231-challenge-daily-bridge-v1 este intrarea externă care produce exact trei misiuni, iar 233 alege provocările din același catalog 231 fără să regenereze setul. Obiectivele care nu au un echivalent 116 (CHECKPOINTS, ZONE_ORDER, COMFORT, PARKING, DRIFT, DISTRUCTION) rămân deschise pentru evaluatorii proprii ai 231 și nu intră în daily.',
  });
}

function dailySafeTemplates(catalog: ChallengeTemplateCatalog): readonly ChallengeTemplate[] {
  return Object.freeze(
    catalog.templates.filter(
      (entry) =>
        (entry.sessions as readonly string[]).includes('ACADEMY') &&
        entry.objectiveKind !== 'DISTRUCTION',
    ),
  );
}

function dailyPickOf(template: ChallengeTemplate, slot: number): ChallengeDailyPick {
  const expressible = expressibleObjectiveKinds.includes(template.objectiveKind);
  return Object.freeze({
    slot,
    templateId: template.templateId,
    templateVersion: template.version,
    family: template.family,
    title: template.title,
    label: template.label,
    objectiveKind: template.objectiveKind,
    evaluatorId: template.evaluatorId,
    controlRequirement: template.controlRequirement,
    allowsManual: template.controlRequirement !== 'LEARNING',
    sessions: Object.freeze([...template.sessions]),
    rewardXp: template.rewardPolicy.academyXp,
    dailyBridgeFamilyId: expressible ? template.templateId : null,
  });
}

/**
 * Deterministic daily variety over the real 231 catalog: three distinct templates, one per family
 * when the catalog allows it, at least one manual, never a Haos-only objective, and no identical
 * repeat of the previous day when an alternative exists.
 */
export function challengeDailyVariety(value: unknown): ChallengeDailySet {
  const request = plainFields(
    value,
    ['catalog', 'dailyDate', 'seed', 'capabilities', 'previousTemplateIds'],
    'challenge daily request',
  );
  for (const key of ['dailyDate', 'seed'] as const)
    requireRequired(request, key, 'challenge daily request');
  const catalog = parseChallengeTemplateCatalog(
    request.catalog === undefined ? createChallengeTemplateCatalog() : request.catalog,
  );
  const dailyDate = text(request.dailyDate);
  parseDailyDate(dailyDate);
  const seed = number(request.seed, 0, 0xffff_ffff);
  requireContract(Number.isInteger(seed), 'Challenge daily seed must be a uint32');
  const previous =
    request.previousTemplateIds === undefined
      ? []
      : list(request.previousTemplateIds, (entry) =>
          boundedId(entry, CHALLENGE_LIMITS.idCodeUnits, 'challenge daily template'),
        );
  const safe = dailySafeTemplates(catalog);
  const eligible =
    request.capabilities === undefined
      ? safe
      : safe.filter(
          (entry) => challengePrerequisitesMissingForDaily(entry, request.capabilities) === false,
        );
  requireContract(
    eligible.length >= DAILY_MISSIONS_PER_DAY,
    'The challenge catalog has fewer than three daily-eligible templates',
  );
  // A previous day is never repeated when three other templates exist at all.
  const nonRepeating = eligible.filter((entry) => !previous.includes(entry.templateId));
  const pool = nonRepeating.length >= DAILY_MISSIONS_PER_DAY ? nonRepeating : eligible;

  const hash = (key: string): number =>
    randomUint32(seed, `${CHALLENGE_EXPERIENCE_NAMESPACE}:daily:${dailyDate}:${key}`, 0);
  const families = new Map<ChallengeFamily, ChallengeTemplate[]>();
  for (const template of pool) {
    const bucket = families.get(template.family);
    if (bucket === undefined) families.set(template.family, [template]);
    else bucket.push(template);
  }
  const familyOrder = [...families.keys()].sort(
    (left, right) => hash(`family:${left}`) - hash(`family:${right}`) || compareText(left, right),
  );
  const templateOrder = (entries: readonly ChallengeTemplate[]): ChallengeTemplate[] =>
    [...entries].sort((left, right) => {
      const leftRepeat = previous.includes(left.templateId) ? 1 : 0;
      const rightRepeat = previous.includes(right.templateId) ? 1 : 0;
      return (
        leftRepeat - rightRepeat ||
        hash(`template:${left.templateId}`) - hash(`template:${right.templateId}`) ||
        compareText(left.templateId, right.templateId)
      );
    });
  const chosen: ChallengeTemplate[] = [];
  for (const family of familyOrder) {
    if (chosen.length >= DAILY_MISSIONS_PER_DAY) break;
    const candidate = templateOrder(families.get(family)!).find(
      (entry) => !chosen.some((picked) => picked.templateId === entry.templateId),
    );
    if (candidate !== undefined) chosen.push(candidate);
  }
  if (chosen.length < DAILY_MISSIONS_PER_DAY) {
    for (const template of templateOrder(pool)) {
      if (chosen.length >= DAILY_MISSIONS_PER_DAY) break;
      if (!chosen.some((picked) => picked.templateId === template.templateId))
        chosen.push(template);
    }
  }
  requireContract(
    chosen.length === DAILY_MISSIONS_PER_DAY,
    'The daily variety could not fill exactly three distinct challenges',
  );
  // At least one manual challenge: replace the last learning-only pick when the seed avoided them.
  if (!chosen.some((entry) => entry.controlRequirement !== 'LEARNING')) {
    const manual = templateOrder(pool).find(
      (entry) =>
        entry.controlRequirement !== 'LEARNING' &&
        !chosen.some((picked) => picked.templateId === entry.templateId),
    );
    requireContract(manual !== undefined, 'The catalog has no manual daily challenge');
    chosen[chosen.length - 1] = manual;
  }
  const picks = Object.freeze(chosen.map((entry, index) => dailyPickOf(entry, index + 1)));
  const templateIds = picks.map((entry) => entry.templateId);
  const familyCount = new Set(picks.map((entry) => entry.family)).size;
  const manual = picks.filter((entry) => entry.allowsManual).length;
  const catalogIds = new Set(catalog.templates.map((entry) => entry.templateId));
  const noRepeatOfPrevious = previous.every((entry) => !templateIds.includes(entry));
  return Object.freeze({
    version: CHALLENGE_DAILY_VARIETY_VERSION,
    dailyDate,
    seed,
    picks,
    counts: Object.freeze({
      picks: picks.length,
      families: familyCount,
      manual,
      expressible: picks.filter((entry) => entry.dailyBridgeFamilyId !== null).length,
      deferred: picks.filter((entry) => entry.dailyBridgeFamilyId === null).length,
    }),
    checks: Object.freeze({
      exactlyThree: picks.length === DAILY_MISSIONS_PER_DAY,
      uniqueTemplates: new Set(templateIds).size === templateIds.length,
      atLeastOneManual: manual > 0,
      distinctFamilies: familyCount >= 2,
      catalogOnly: templateIds.every((entry) => catalogIds.has(entry)),
      noChaosOnly: picks.every((entry) => entry.objectiveKind !== 'DISTRUCTION'),
      noRepeatOfPrevious,
    }),
    repeatAvoided: noRepeatOfPrevious,
  });
}

function challengePrerequisitesMissingForDaily(
  template: ChallengeTemplate,
  capabilities: unknown,
): boolean {
  return challengePrerequisitesMissing(template, capabilities).length > 0;
}

/* ---------------------------------------------------------------------------------------------
 * Comic reactions derived from the real result
 * ------------------------------------------------------------------------------------------- */

export interface ChallengeReaction {
  readonly version: typeof CHALLENGE_REACTION_VERSION;
  readonly templateId: string;
  readonly templateVersion: string;
  readonly trigger: ChallengeReactionTrigger;
  readonly tone: ChallengeReactionTone;
  readonly effect: ChallengeReactionEffect;
  readonly headline: string;
  readonly text: string;
  readonly xpStatement: ChallengeXpStatement;
  readonly xpStatementLabel: string;
  /** A reaction never changes the balance: no loss and no second credit. */
  readonly xpDelta: 0;
  readonly penalty: 'NONE';
  readonly authored: boolean;
}

const declineReactions: Readonly<Record<string, Readonly<{ text: string; headline: string }>>> =
  Object.freeze({
    DECLINED: Object.freeze({
      headline: 'Refuzat politicos',
      text: 'Clientul s-a răzgândit: „Las-o pentru data viitoare.” Niciun XP nu se pierde.',
    }),
    EXPIRED: Object.freeze({
      headline: 'Oferta a expirat',
      text: 'Oferta a expirat înainte să urci. Clientul a găsit alt taxi și o altă poveste.',
    }),
    CANCELLED: Object.freeze({
      headline: 'Provocare anulată',
      text: 'Provocarea s-a anulat la timp. Bugetul de XP rămâne neatins.',
    }),
  });

const xpStatementLabels: Readonly<Record<ChallengeXpStatement, string>> = Object.freeze({
  XP_PENDING: 'XP se acordă o singură dată, la prima reușită a familiei în ziua respectivă.',
  XP_CREDITED: 'XP acordat o singură dată pentru familia de azi.',
  RECORD_ONLY: 'Record personal, fără XP suplimentar.',
  NO_XP_LOSS: 'Fără XP și fără pierderi: refuzul și eșecul nu costă nimic.',
  LOCAL_RECORD_ONLY: 'În Haos ținem doar scorul local; fără XP de Academie.',
});

function requireSafeReactionText(value: string): string {
  const text = value.trim();
  requireContract(text.length > 0, 'A challenge reaction needs real text');
  requireContract(
    text.length <= CHALLENGE_EXPERIENCE_LIMITS.reactionCodeUnits,
    'Challenge reaction text exceeds its budget',
  );
  const lower = text.toLowerCase();
  for (const term of forbiddenReactionTerms)
    requireContract(!lower.includes(term), `Challenge reaction cannot promise or insult: ${term}`);
  return text;
}

export interface ChallengeReactionRequest {
  readonly instance: ChallengeDirectorInstance;
  readonly catalog?: unknown;
  /** The credit this result produced, when it was already requested. */
  readonly credit?: Readonly<{ status: ChallengeCreditStatus; creditedXp: number }> | null;
}

/**
 * A deterministic reaction derived from the real terminal outcome: the authored 231 success and
 * failure lines for a result, the progress line while the objective runs, and a closed, safe line
 * for a decline, an expiry or a cancellation. Every reaction states that it costs no XP.
 */
export function challengeReaction(value: unknown): ChallengeReaction {
  const request = plainFields(
    value,
    ['instance', 'catalog', 'credit'],
    'challenge reaction request',
  );
  requireRequired(request, 'instance', 'challenge reaction request');
  const instance = requireInstance(request.instance, 'Challenge reaction');
  const catalog = parseChallengeTemplateCatalog(
    request.catalog === undefined ? createChallengeTemplateCatalog() : request.catalog,
  );
  const template = catalog.templates.find((entry) => entry.templateId === instance.templateId);
  requireContract(template !== undefined, `Unknown challenge template: ${instance.templateId}`);
  const credit =
    request.credit === undefined || request.credit === null
      ? null
      : (() => {
          requireContract(
            typeof request.credit === 'object' && request.credit !== null,
            'Challenge reaction credit must be a real credit result',
          );
          const row = request.credit as Readonly<{
            status: ChallengeCreditStatus;
            creditedXp: number;
          }>;
          requireContract(
            (challengeCreditStatuses as readonly string[]).includes(row.status),
            'Unknown challenge credit status in the reaction',
          );
          return row;
        })();
  const state = instance.state;
  const trigger: ChallengeReactionTrigger =
    state === 'OFFERED'
      ? 'OFFER'
      : state === 'ACCEPTED' || state === 'ACTIVE'
        ? 'PROGRESS'
        : state === 'COMPLETED'
          ? 'SUCCESS'
          : state === 'FAILED'
            ? 'FAILURE'
            : 'DECLINE';
  let tone: ChallengeReactionTone;
  let effect: ChallengeReactionEffect;
  let headline: string;
  let text: string;
  let xpStatement: ChallengeXpStatement;
  let authored = false;
  if (trigger === 'DECLINE') {
    const line = declineReactions[state];
    requireContract(line !== undefined, `No closed decline line for ${state}`);
    tone = 'SHRUG';
    effect = 'SHRUG';
    headline = line.headline;
    text = line.text;
    xpStatement = instance.sessionKind === 'CHAOS' ? 'LOCAL_RECORD_ONLY' : 'NO_XP_LOSS';
  } else {
    const line = template.dialogue.find((entry) => entry.trigger === trigger);
    requireContract(line !== undefined, `The template has no ${trigger} line`);
    authored = true;
    text = line.text;
    if (trigger === 'SUCCESS') {
      tone = 'CELEBRATION';
      effect = 'CELEBRATION';
      headline = 'Provocare reușită';
      xpStatement =
        instance.sessionKind === 'CHAOS'
          ? 'LOCAL_RECORD_ONLY'
          : credit === null
            ? 'XP_PENDING'
            : credit.status === 'CREDITED' && credit.creditedXp > 0
              ? 'XP_CREDITED'
              : 'RECORD_ONLY';
    } else if (trigger === 'FAILURE') {
      tone = 'COMMISERATION';
      effect = 'COMMISERATION';
      headline = 'Aproape, dar nu încă';
      xpStatement = instance.sessionKind === 'CHAOS' ? 'LOCAL_RECORD_ONLY' : 'NO_XP_LOSS';
    } else if (trigger === 'PROGRESS') {
      tone = 'NEUTRAL';
      effect = 'NONE';
      headline = 'Provocare în desfășurare';
      xpStatement = instance.sessionKind === 'CHAOS' ? 'LOCAL_RECORD_ONLY' : 'XP_PENDING';
    } else {
      tone = 'NEUTRAL';
      effect = 'NONE';
      headline = 'Ofertă nouă';
      xpStatement = instance.sessionKind === 'CHAOS' ? 'LOCAL_RECORD_ONLY' : 'XP_PENDING';
    }
  }
  return Object.freeze({
    version: CHALLENGE_REACTION_VERSION,
    templateId: template.templateId,
    templateVersion: template.version,
    trigger,
    tone,
    effect,
    headline,
    text: requireSafeReactionText(text),
    xpStatement,
    xpStatementLabel: xpStatementLabels[xpStatement],
    xpDelta: 0 as const,
    penalty: 'NONE' as const,
    authored,
  });
}

/** Strict reader used by the UI projection; it refuses an invented or unsafe reaction. */
export function parseChallengeReaction(value: unknown): ChallengeReaction {
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
  const data = plainFields(value, fields, 'challenge reaction');
  for (const key of fields) requireRequired(data, key, 'challenge reaction');
  requireContract(
    data.version === CHALLENGE_REACTION_VERSION,
    'Unsupported challenge reaction version',
  );
  const trigger = choice(data.trigger, challengeReactionTriggers);
  const tone = choice(data.tone, challengeReactionTones);
  const effect = choice(data.effect, challengeReactionEffects);
  const xpStatement = choice(data.xpStatement, challengeXpStatements);
  requireContract(data.xpDelta === 0, 'A challenge reaction never changes the XP balance');
  requireContract(data.penalty === 'NONE', 'A challenge reaction never adds a penalty');
  requireContract(typeof data.authored === 'boolean', 'Challenge reaction authored flag');
  requireContract(
    data.xpStatementLabel === xpStatementLabels[xpStatement],
    'Challenge reaction XP statement label drifted',
  );
  const consistent =
    (trigger === 'SUCCESS' && tone === 'CELEBRATION' && effect === 'CELEBRATION') ||
    (trigger === 'FAILURE' && tone === 'COMMISERATION' && effect === 'COMMISERATION') ||
    (trigger === 'DECLINE' && tone === 'SHRUG' && effect === 'SHRUG') ||
    ((trigger === 'OFFER' || trigger === 'PROGRESS') && tone === 'NEUTRAL' && effect === 'NONE');
  requireContract(consistent, 'Challenge reaction tone does not match its trigger');
  requireContract(
    (trigger === 'DECLINE') === (data.authored === false),
    'Only a decline reaction is not authored by the 231 template',
  );
  return Object.freeze({
    version: CHALLENGE_REACTION_VERSION,
    templateId: boundedId(
      data.templateId,
      CHALLENGE_LIMITS.idCodeUnits,
      'challenge reaction template',
    ),
    templateVersion: boundedId(
      data.templateVersion,
      CHALLENGE_LIMITS.idCodeUnits,
      'challenge reaction template version',
    ),
    trigger,
    tone,
    effect,
    headline: requireSafeReactionText(text(data.headline)),
    text: requireSafeReactionText(text(data.text)),
    xpStatement,
    xpStatementLabel: requireSafeReactionText(text(data.xpStatementLabel)),
    xpDelta: 0 as const,
    penalty: 'NONE' as const,
    authored: data.authored,
  });
}

/* ---------------------------------------------------------------------------------------------
 * Tick helper kept explicit so the module never reads a wall clock or a frame clock
 * ------------------------------------------------------------------------------------------- */

/** Authoritative ticks of a real second at the 231 60 Hz tick rate. */
export function challengeSecondsToTicks(seconds: number): number {
  const value = number(seconds, 0, 100_000);
  return Math.round(value * CHALLENGE_TICK_HZ);
}

/** Whole XP of a micro-XP amount, for report rows that read the real ledger. */
export function challengeMicroXpToXp(microXp: number): number {
  return microXpToXp(tick(microXp));
}

/** One XP expressed in the ledger unit; exported so evidence and tests never guess it. */
export const CHALLENGE_XP_MICRO_PER_XP = XP_MICRO_PER_XP;

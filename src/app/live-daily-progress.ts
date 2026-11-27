import {
  DAILY_DAY_LENGTHS,
  DAILY_MISSION_XP,
  DAILY_MISSIONS_PER_DAY,
  PLAYER_XP_POLICY,
  createDailyProgress,
  createPlayerProgress,
  dailyCapabilities,
  parsePlayerProgress,
  restoreDailyProgress,
} from '../missions';
import type {
  ActiveTimeResult,
  DailyCalendarInput,
  DailyCalendarState,
  DailyClockAction,
  DailyCapabilitySnapshot,
  DailyMissionInstance,
  DailyMissionSet,
  DailyProgress,
  DailyProgressAdvanceResult,
  DailyProgressIngestResult,
  DailyProgressRead,
  DailyProgressSnapshot,
  DailyRewardRecord,
  MissionCompletionResult,
  PlayerProgress,
  PlayerProgressCheckpoint,
  PlayerProgressRead,
  XpCreditResult,
} from '../missions';
import type { SimulationEvent } from '../simulation';

/**
 * PBI 276 — the live daily missions and player XP vertical.
 *
 * The composition owns exactly the contracts already delivered by 211 (daily generation and
 * calendar), 212 (live daily progress), 213 (player XP ledger and level) and 125 (mission rewards).
 * It creates no second simulation, generator, ledger, profile store or clock source:
 *
 * - the real calendar day is derived from an explicit instant plus the player's IANA zone;
 * - the same validated 007 events published by 275 feed the daily consumer;
 * - a 125 completion settlement is paid once by its own reward identity;
 * - active time is a sequence of short real windows with pause/focus/background/AFK/scope verdicts;
 * - the reset of the day, a clock rollback or a forward jump is delegated to 211/212.
 *
 * A reload checkpoint is plain session data, not a savefile: it carries the 212 snapshot and the
 * 213 checkpoint, so the same day is not re-randomised and a reward is not paid twice in the tab.
 * Durable files, imports and autosave remain PBI 278.
 */

export const LIVE_DAILY_PROGRESS_VERSION = '276-live-daily-progress-v1' as const;
export const LIVE_DAILY_PROGRESS_CHECKPOINT_VERSION = '276-reload-checkpoint-v1' as const;
export const LIVE_DAILY_PROGRESS_RECOVERY_SESSION = 'session-276-reload' as const;
export const LIVE_DAILY_PROGRESS_ACTIVE_WINDOW_MS = 10_000 as const;
export const LIVE_DAILY_PROGRESS_CALENDAR_SYNC_MS = 1_000 as const;

export const liveDailyProgressKinds = ['ACADEMY', 'CHAOS'] as const;
export type LiveDailyProgressKind = (typeof liveDailyProgressKinds)[number];

export const liveDailyProgressStorageStates = ['MEMORY_ONLY', 'SESSION_STORAGE', 'FAILED'] as const;
export type LiveDailyProgressStorageState = (typeof liveDailyProgressStorageStates)[number];

const millisecondsPerDay = 86_400_000;
const secondsPerMillisecond = 1_000;

export interface LocalDailyDay {
  readonly timeZone: string;
  readonly dailyDate: string;
  readonly dayIndex: number;
  readonly dayStartMs: number;
  readonly expiresAtMs: number;
  readonly utcOffsetSeconds: number;
  /** The real local day length in seconds; 23 h, 24 h or 25 h. */
  readonly requestedDayLengthSeconds: number;
  /** The 211-supported day length; an unsupported zone falls back to 25 h and reports it. */
  readonly dayLengthSeconds: (typeof DAILY_DAY_LENGTHS)[number];
  readonly supported: boolean;
}

interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function civilDateOf(epochMs: number): CivilDate {
  const date = new Date(epochMs);
  return Object.freeze({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

function dateText(date: CivilDate): string {
  return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`;
}

function zonedParts(
  epochMs: number,
  timeZone: string,
): CivilDate & { readonly hour: number; readonly minute: number; readonly second: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(new Date(epochMs));
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((entry) => entry.type === type)?.value ?? '0';
  return Object.freeze({
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day')),
    hour: Number(value('hour')),
    minute: Number(value('minute')),
    second: Number(value('second')),
  });
}

/** UTC offset in effect at one explicit instant, in whole seconds. */
export function zoneOffsetSeconds(epochMs: number, timeZone: string): number {
  const parts = zonedParts(epochMs, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Math.round(
    (asUtc - Math.floor(epochMs / secondsPerMillisecond) * secondsPerMillisecond) / 1000,
  );
}

function localMidnightUtc(date: CivilDate, timeZone: string): number {
  const guess = Date.UTC(date.year, date.month - 1, date.day);
  let start = guess - zoneOffsetSeconds(guess, timeZone) * secondsPerMillisecond;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const next = guess - zoneOffsetSeconds(start, timeZone) * secondsPerMillisecond;
    if (next === start) break;
    start = next;
  }
  return start;
}

function nextCivilDate(date: CivilDate): CivilDate {
  return civilDateOf(Date.UTC(date.year, date.month - 1, date.day + 1));
}

/**
 * Resolve the player's real local day from an explicit instant and IANA zone.
 *
 * The offset is read at local midnight, so a DST transition inside the day keeps the identity of
 * the day and changes only its window length (23 h or 25 h). A zone whose transition is not one of
 * the two authored DST lengths is reported as unsupported and uses the widest supported window, so
 * the world never crashes on an exotic offset; the limitation is visible in the status.
 */
export function resolveLocalDailyDay(epochMs: number, timeZone: string): LocalDailyDay {
  if (!Number.isSafeInteger(epochMs) || epochMs < 0)
    throw new Error('Daily calendar instant must be a non-negative safe integer');
  if (typeof timeZone !== 'string' || timeZone.trim() !== timeZone || timeZone.length === 0)
    throw new Error('Daily calendar time zone is invalid');
  const date = zonedParts(epochMs, timeZone);
  const dayStartMs = localMidnightUtc(date, timeZone);
  const nextStartMs = localMidnightUtc(nextCivilDate(date), timeZone);
  const requestedDayLengthSeconds = Math.round((nextStartMs - dayStartMs) / secondsPerMillisecond);
  const supported = (DAILY_DAY_LENGTHS as readonly number[]).includes(requestedDayLengthSeconds);
  const dayLengthSeconds = supported
    ? (requestedDayLengthSeconds as (typeof DAILY_DAY_LENGTHS)[number])
    : 90_000;
  const dayIndex = Math.floor(
    (dayStartMs + zoneOffsetSeconds(dayStartMs, timeZone) * 1000) / millisecondsPerDay,
  );
  return Object.freeze({
    timeZone,
    dailyDate: dateText(date),
    dayIndex,
    dayStartMs,
    expiresAtMs: dayStartMs + dayLengthSeconds * secondsPerMillisecond,
    utcOffsetSeconds: zoneOffsetSeconds(dayStartMs, timeZone),
    requestedDayLengthSeconds,
    dayLengthSeconds,
    supported,
  });
}

export function dailyCalendarInputOf(day: LocalDailyDay): DailyCalendarInput {
  return Object.freeze({
    timeZone: day.timeZone,
    observedAtMs: day.dayStartMs,
    utcOffsetSeconds: day.utcOffsetSeconds,
    dayLengthSeconds: day.dayLengthSeconds,
  });
}

function strictCalendarInput(day: LocalDailyDay, observedAtMs: number): DailyCalendarInput {
  return Object.freeze({
    timeZone: day.timeZone,
    observedAtMs,
    utcOffsetSeconds: day.utcOffsetSeconds,
    dayLengthSeconds: day.dayLengthSeconds,
  });
}

export interface LiveDailyProgressStorage {
  load(): string | null;
  save(value: string): void;
  clear(): void;
}

export interface LiveDailyProgressHostFacts {
  readonly focused: boolean;
  readonly visible: boolean;
  readonly afk: boolean;
}

export interface LiveDailyProgressOptions {
  readonly playerId: string;
  readonly timeZone: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly kind: LiveDailyProgressKind;
  readonly capabilities: unknown;
  readonly now?: () => number;
  readonly catalog?: unknown;
  readonly storage?: LiveDailyProgressStorage;
  readonly hostFacts?: () => LiveDailyProgressHostFacts;
  readonly activeWindowMs?: number;
  readonly calendarSyncMs?: number;
}

export interface LiveDailyProgressSessionInput {
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
  readonly kind: LiveDailyProgressKind;
  readonly capabilities: unknown;
}

export interface LiveDailyProgressTickInput {
  readonly tick: number;
  readonly nowMs: number;
  readonly playing: boolean;
}

export interface LiveDailyProgressActiveWindow {
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly controlMode: 'MANUAL' | 'LEARNING' | 'AUTO';
  readonly paused: boolean;
  readonly focused: boolean;
  readonly visible: boolean;
  readonly afk: boolean;
}

export interface LiveDailyProgressDayAction {
  readonly action: DailyClockAction;
  readonly dailyDate: string;
  readonly skippedDays: number;
  readonly regenerated: boolean;
  readonly capabilityDrift: boolean;
  readonly retainedRows: number;
  readonly createdRows: number;
  readonly droppedRows: number;
  readonly rebound: boolean;
}

export interface LiveDailyProgressRead {
  readonly version: typeof LIVE_DAILY_PROGRESS_VERSION;
  readonly playerId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly kind: LiveDailyProgressKind;
  readonly observedAtMs: number;
  readonly daily: DailyProgressRead;
  readonly player: PlayerProgressRead;
  readonly xpFingerprint: string;
  readonly activeTime: Readonly<{
    pendingMs: number;
    accountedThroughMs: number;
    liveWindowStartMs: number | null;
    lastSkipReason: string | null;
  }>;
  readonly dayAction: LiveDailyProgressDayAction | null;
  readonly storage: LiveDailyProgressStorageState;
  readonly storageError: string | null;
  readonly restore: Readonly<{ restored: boolean; reason: string | null }>;
  readonly ingestErrors: number;
  readonly lastIngestError: string | null;
  readonly debits: 0;
  readonly negativeCredits: false;
  readonly profileWrites: 0;
}

export interface LiveDailyProgressStatus {
  readonly version: typeof LIVE_DAILY_PROGRESS_VERSION;
  readonly playerId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly kind: LiveDailyProgressKind;
  readonly dailyDate: string;
  readonly phase: DailyProgressRead['phase'];
  readonly dayLengthSeconds: number;
  readonly timeZone: string;
  readonly xpBalance: number;
  readonly xpBalanceMicroXp: number;
  readonly level: number;
  readonly entries: number;
  readonly dailyCompleted: number;
  readonly dailyRewards: number;
  readonly activePlayMs: number;
  readonly accountedThroughMs: number;
  readonly xpFingerprint: string;
  readonly dayAction: LiveDailyProgressDayAction | null;
  readonly storage: LiveDailyProgressStorageState;
  readonly restore: Readonly<{ restored: boolean; reason: string | null }>;
  readonly ingestErrors: number;
  readonly lastIngestError: string | null;
  readonly debits: 0;
  readonly negativeCredits: false;
  readonly profileWrites: 0;
}

export interface LiveDailyReloadCheckpoint {
  readonly version: typeof LIVE_DAILY_PROGRESS_CHECKPOINT_VERSION;
  readonly playerId: string;
  readonly savedAtMs: number;
  readonly daily: DailyProgressSnapshot;
  readonly player: PlayerProgressCheckpoint;
}

interface StoredCheckpoint {
  readonly version?: unknown;
  readonly playerId?: unknown;
  readonly daily?: unknown;
  readonly player?: unknown;
}

function hashXp(read: PlayerProgressRead): string {
  const content = JSON.stringify({
    balance: read.xpBalanceMicroXp,
    level: read.level,
    entries: read.entries.map((entry) => [entry.entryId, entry.amountMicroXp]),
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

function rebaseSnapshot(snapshot: DailyProgressSnapshot): DailyProgressSnapshot {
  return Object.freeze({
    ...snapshot,
    sessionId: LIVE_DAILY_PROGRESS_RECOVERY_SESSION,
    worldEpoch: 0,
  });
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function capabilitiesOf(value: unknown): DailyCapabilitySnapshot {
  if (typeof value !== 'object' || value === null)
    throw new Error('Daily capabilities must be plain data');
  return dailyCapabilities(value as Parameters<typeof dailyCapabilities>[0]);
}

function readStoredCheckpoint(raw: string): StoredCheckpoint | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as StoredCheckpoint;
  } catch {
    return null;
  }
}

export function createLiveDailyProgress(options: LiveDailyProgressOptions): LiveDailyProgress {
  if (options === null || typeof options !== 'object')
    throw new Error('Live daily progress requires options');
  if (typeof options.playerId !== 'string' || options.playerId.trim().length === 0)
    throw new Error('Live daily progress requires a player id');
  if (typeof options.timeZone !== 'string' || options.timeZone.trim().length === 0)
    throw new Error('Live daily progress requires an IANA time zone');
  if (typeof options.sessionId !== 'string' || options.sessionId.trim().length === 0)
    throw new Error('Live daily progress requires a session id');
  if (!Number.isSafeInteger(options.worldEpoch) || options.worldEpoch < 0)
    throw new Error('Live daily progress requires a non-negative world epoch');
  if (!(liveDailyProgressKinds as readonly string[]).includes(options.kind))
    throw new Error('Unknown live daily progress session kind');

  const now = options.now ?? (() => Date.now());
  const activeWindowMs = Math.max(
    1_000,
    Math.min(
      PLAYER_XP_POLICY.maxObservationWindowMs,
      options.activeWindowMs ?? LIVE_DAILY_PROGRESS_ACTIVE_WINDOW_MS,
    ),
  );
  const calendarSyncMs = Math.max(
    100,
    Math.min(60_000, options.calendarSyncMs ?? LIVE_DAILY_PROGRESS_CALENDAR_SYNC_MS),
  );
  const hostFacts =
    options.hostFacts ?? (() => Object.freeze({ focused: true, visible: true, afk: false }));

  const playerId = options.playerId;
  let sessionId = options.sessionId;
  let worldEpoch = options.worldEpoch;
  let kind = options.kind;
  let capabilities = capabilitiesOf(options.capabilities);
  let disposed = false;
  let tick = 0;
  let lastObservedAtMs = now();
  let lastCalendarSyncAtMs = -Infinity;
  let activeWindowStartMs: number | null = null;
  let lastSkipReason: string | null = null;
  let dayAction: LiveDailyProgressDayAction | null = null;
  let ingestErrors = 0;
  let lastIngestError: string | null = null;
  let storageState: LiveDailyProgressStorageState =
    options.storage === undefined ? 'MEMORY_ONLY' : 'SESSION_STORAGE';
  let storageError: string | null = null;
  let restore: Readonly<{ restored: boolean; reason: string | null }> = Object.freeze({
    restored: false,
    reason: null,
  });
  const creditedRewardIds = new Set<string>();

  const initialNow = now();
  const initialDay = resolveLocalDailyDay(initialNow, options.timeZone);

  function freshPlayer(): PlayerProgress {
    return createPlayerProgress({ playerId });
  }

  function freshDaily(): DailyProgress {
    return createDailyProgress({
      playerId,
      sessionId,
      worldEpoch,
      calendar: strictCalendarInput(initialDay, initialNow),
      capabilities,
      generatedAtMs: initialNow,
      ...(options.catalog === undefined ? {} : { templateCatalog: options.catalog }),
    });
  }

  let player: PlayerProgress = freshPlayer();
  let daily: DailyProgress = freshDaily();

  function rememberCreditedRewards(): void {
    for (const entry of player.read().entries)
      if (entry.causeType === 'DAILY_REWARD') creditedRewardIds.add(entry.causeId);
  }

  function restoreCheckpoint(raw: string): void {
    const stored = readStoredCheckpoint(raw);
    if (stored === null) {
      restore = Object.freeze({ restored: false, reason: 'INVALID_JSON' });
      return;
    }
    if (stored.version !== LIVE_DAILY_PROGRESS_CHECKPOINT_VERSION) {
      restore = Object.freeze({ restored: false, reason: 'VERSION_MISMATCH' });
      return;
    }
    if (stored.playerId !== playerId) {
      restore = Object.freeze({ restored: false, reason: 'PLAYER_MISMATCH' });
      return;
    }
    try {
      const restoredPlayer = parsePlayerProgress(stored.player);
      const restoredDaily = restoreDailyProgress(
        rebaseSnapshot(stored.daily as DailyProgressSnapshot),
        {
          sessionId,
          worldEpoch,
        },
      );
      player = restoredPlayer;
      daily = restoredDaily.progress;
      rememberCreditedRewards();
      restore = Object.freeze({
        restored: true,
        reason: restoredDaily.rebound ? 'REBOUND' : null,
      });
      storageState = 'SESSION_STORAGE';
    } catch (error: unknown) {
      restore = Object.freeze({ restored: false, reason: errorText(error) });
      storageState = 'FAILED';
    }
  }

  if (options.storage !== undefined) {
    try {
      const raw = options.storage.load();
      if (raw !== null) restoreCheckpoint(raw);
    } catch (error: unknown) {
      storageError = errorText(error);
      storageState = 'FAILED';
    }
  }

  function save(): void {
    if (options.storage === undefined) {
      storageState = 'MEMORY_ONLY';
      return;
    }
    if (disposed) return;
    try {
      const checkpoint: LiveDailyReloadCheckpoint = Object.freeze({
        version: LIVE_DAILY_PROGRESS_CHECKPOINT_VERSION,
        playerId,
        savedAtMs: now(),
        daily: rebaseSnapshot(daily.snapshot()),
        player: player.checkpoint(),
      });
      options.storage.save(JSON.stringify(checkpoint));
      storageState = 'SESSION_STORAGE';
    } catch (error: unknown) {
      storageError = errorText(error);
      storageState = 'FAILED';
    }
  }

  function instanceFor(instanceId: string): DailyMissionInstance | null {
    for (const set of daily.calendarState().sets)
      for (const instance of set.instances) if (instance.instanceId === instanceId) return instance;
    return null;
  }

  function creditDailyRewards(): readonly XpCreditResult[] {
    const results: XpCreditResult[] = [];
    for (const reward of daily.calendarState().rewards) {
      if (creditedRewardIds.has(reward.rewardId)) continue;
      const instance = instanceFor(reward.instanceId);
      if (instance === null) continue;
      const record: DailyRewardRecord = Object.freeze({
        instanceId: reward.instanceId,
        rewardId: reward.rewardId,
        dailyDate: reward.dailyDate,
        grantedAtMs: reward.grantedAtMs,
      });
      const result = player.creditDaily({ record, instance });
      creditedRewardIds.add(reward.rewardId);
      results.push(result);
    }
    return Object.freeze(results);
  }

  function syncCalendar(atMs: number, force = false): DailyProgressAdvanceResult | null {
    if (!force && atMs - lastCalendarSyncAtMs < calendarSyncMs) return null;
    const local = resolveLocalDailyDay(atMs, options.timeZone);
    // A clock rollback before the retained day is not a new day: keep the retained set and its
    // rewards. 211 resumes when the clock reaches the retained date again.
    if (local.dailyDate < daily.set().dailyDate) {
      lastCalendarSyncAtMs = atMs;
      return null;
    }
    lastCalendarSyncAtMs = atMs;
    const step = daily.advance({
      calendar: strictCalendarInput(local, atMs),
      capabilities,
      generatedAtMs: atMs,
      sessionId,
      worldEpoch,
      ...(options.catalog === undefined ? {} : { templateCatalog: options.catalog }),
    });
    dayAction = Object.freeze({
      action: step.action,
      dailyDate: step.dailyDate,
      skippedDays: step.skippedDays,
      regenerated: step.regenerated,
      capabilityDrift: step.capabilityDrift,
      retainedRows: step.retainedRows,
      createdRows: step.createdRows,
      droppedRows: step.droppedRows,
      rebound: step.rebound,
    });
    const credited = creditDailyRewards();
    if (step.action !== 'SAME_DAY' || step.regenerated || credited.length > 0) save();
    return step;
  }

  function assertLive(): void {
    if (disposed) throw new Error('Live daily progress is disposed');
  }

  function activeFlags(): LiveDailyProgressHostFacts {
    const facts = hostFacts();
    if (
      typeof facts !== 'object' ||
      facts === null ||
      typeof facts.focused !== 'boolean' ||
      typeof facts.visible !== 'boolean' ||
      typeof facts.afk !== 'boolean'
    )
      throw new Error('Live daily progress host facts are invalid');
    return facts;
  }

  function creditWindow(
    window: LiveDailyProgressActiveWindow,
    override?: Partial<LiveDailyProgressActiveWindow>,
  ): ActiveTimeResult {
    const input = {
      startedAtMs: window.startedAtMs,
      endedAtMs: window.endedAtMs,
      scope: kind === 'ACADEMY' ? ('ACADEMY' as const) : ('HAOS' as const),
      controlMode: window.controlMode,
      paused: override?.paused ?? window.paused,
      focused: override?.focused ?? window.focused,
      visible: override?.visible ?? window.visible,
      afk: override?.afk ?? window.afk,
    };
    const result = player.observeActiveTime(input);
    lastSkipReason = result.reason;
    if (result.status === 'CREDITED') save();
    return result;
  }

  function flushActiveWindow(atMs: number, suspend: boolean): readonly ActiveTimeResult[] {
    if (activeWindowStartMs === null) return Object.freeze([]);
    const end = suspend
      ? Math.max(activeWindowStartMs, Math.min(atMs, lastObservedAtMs))
      : Math.max(activeWindowStartMs, atMs);
    const results: ActiveTimeResult[] = [];
    let cursor = activeWindowStartMs;
    const facts = activeFlags();
    while (cursor < end) {
      const next = Math.min(cursor + PLAYER_XP_POLICY.maxObservationWindowMs, end);
      const snapshot = Object.freeze({
        startedAtMs: cursor,
        endedAtMs: next,
        controlMode: 'AUTO' as const,
        paused: false,
        focused: suspend ? true : facts.focused,
        visible: suspend ? true : facts.visible,
        afk: facts.afk,
      });
      results.push(creditWindow(snapshot));
      cursor = next;
    }
    activeWindowStartMs = suspend ? null : end;
    return Object.freeze(results);
  }

  function observeTick(input: LiveDailyProgressTickInput): void {
    assertLive();
    if (!Number.isSafeInteger(input.tick) || input.tick < 0)
      throw new Error('Live daily progress tick must be a non-negative integer');
    if (!Number.isSafeInteger(input.nowMs) || input.nowMs < 0)
      throw new Error('Live daily progress instant must be a non-negative integer');
    tick = Math.max(tick, input.tick);
    lastObservedAtMs = input.nowMs;
    syncCalendar(input.nowMs);
    if (!input.playing) {
      flushActiveWindow(input.nowMs, true);
      return;
    }
    if (kind !== 'ACADEMY') return;
    if (activeWindowStartMs === null) {
      activeWindowStartMs = input.nowMs;
      return;
    }
    if (input.nowMs - activeWindowStartMs < activeWindowMs) return;
    flushActiveWindow(input.nowMs, false);
  }

  function beginSession(input: LiveDailyProgressSessionInput): LiveDailyProgressRead {
    assertLive();
    if (!(liveDailyProgressKinds as readonly string[]).includes(input.kind))
      throw new Error('Unknown live daily progress session kind');
    if (input.worldEpoch < worldEpoch)
      throw new Error('Live daily progress cannot move back to an older world epoch');
    if (input.sessionId !== sessionId || input.kind !== kind) {
      flushActiveWindow(now(), true);
      activeWindowStartMs = null;
    }
    sessionId = input.sessionId;
    worldEpoch = input.worldEpoch;
    kind = input.kind;
    capabilities = capabilitiesOf(input.capabilities);
    tick = Math.max(tick, input.tick);
    syncCalendar(now(), true);
    creditDailyRewards();
    save();
    return read();
  }

  function read(atMs: number = now()): LiveDailyProgressRead {
    assertLive();
    const observedAtMs = Number.isSafeInteger(atMs) && atMs >= 0 ? atMs : now();
    syncCalendar(observedAtMs);
    creditDailyRewards();
    const dailyRead = daily.read(observedAtMs);
    const playerRead = player.read();
    return Object.freeze({
      version: LIVE_DAILY_PROGRESS_VERSION,
      playerId,
      sessionId,
      worldEpoch,
      kind,
      observedAtMs,
      daily: dailyRead,
      player: playerRead,
      xpFingerprint: hashXp(playerRead),
      activeTime: Object.freeze({
        pendingMs:
          activeWindowStartMs === null ? 0 : Math.max(0, observedAtMs - activeWindowStartMs),
        accountedThroughMs: playerRead.accountedThroughMs,
        liveWindowStartMs: activeWindowStartMs,
        lastSkipReason,
      }),
      dayAction,
      storage: storageState,
      storageError,
      restore,
      ingestErrors,
      lastIngestError,
      debits: 0 as const,
      negativeCredits: false as const,
      profileWrites: 0 as const,
    });
  }

  function observeEvent(
    event: SimulationEvent,
    observedAtMs: number,
  ): DailyProgressIngestResult | null {
    assertLive();
    if (kind !== 'ACADEMY') return null;
    try {
      const result = daily.ingest({ event, observedAtMs });
      if (result.status === 'ACCEPTED') {
        creditDailyRewards();
        save();
      }
      return result;
    } catch (error: unknown) {
      ingestErrors += 1;
      lastIngestError = errorText(error);
      return null;
    }
  }

  function observeMissionSettlement(
    settlement: MissionCompletionResult,
    observedAtMs: number,
  ): XpCreditResult | null {
    assertLive();
    if (kind !== 'ACADEMY') return null;
    const result = player.creditMission({ settlement, observedAtMs });
    if (result.status === 'CREDITED') save();
    return result;
  }

  function observeActiveWindow(window: LiveDailyProgressActiveWindow): ActiveTimeResult {
    assertLive();
    if (window.endedAtMs <= window.startedAtMs)
      throw new Error('Live daily active window must have a positive duration');
    return creditWindow(window);
  }

  function suspend(atMs: number = now()): void {
    assertLive();
    flushActiveWindow(atMs, true);
    activeWindowStartMs = null;
    save();
  }

  function resume(atMs: number = now()): void {
    assertLive();
    lastObservedAtMs = atMs;
    if (kind !== 'ACADEMY') {
      activeWindowStartMs = null;
      return;
    }
    activeWindowStartMs = atMs;
  }

  function status(): LiveDailyProgressStatus {
    const current = read();
    return Object.freeze({
      version: LIVE_DAILY_PROGRESS_VERSION,
      playerId,
      sessionId,
      worldEpoch,
      kind,
      dailyDate: current.daily.dailyDate,
      phase: current.daily.phase,
      dayLengthSeconds: current.daily.dayLengthSeconds,
      timeZone: current.daily.timeZone,
      xpBalance: current.player.xpBalance,
      xpBalanceMicroXp: current.player.xpBalanceMicroXp,
      level: current.player.level,
      entries: current.player.entries.length,
      dailyCompleted: current.daily.instances.filter((entry) => entry.state === 'COMPLETED').length,
      dailyRewards: current.daily.rewards,
      activePlayMs: current.player.activePlayMs,
      accountedThroughMs: current.player.accountedThroughMs,
      xpFingerprint: current.xpFingerprint,
      dayAction,
      storage: storageState,
      restore,
      ingestErrors,
      lastIngestError,
      debits: 0 as const,
      negativeCredits: false as const,
      profileWrites: 0 as const,
    });
  }

  function checkpoint(atMs: number = now()): LiveDailyReloadCheckpoint {
    assertLive();
    return Object.freeze({
      version: LIVE_DAILY_PROGRESS_CHECKPOINT_VERSION,
      playerId,
      savedAtMs: atMs,
      daily: rebaseSnapshot(daily.snapshot()),
      player: player.checkpoint(),
    });
  }

  const runtime: LiveDailyProgress = {
    version: LIVE_DAILY_PROGRESS_VERSION,
    get playerId() {
      return playerId;
    },
    get sessionId() {
      return sessionId;
    },
    get worldEpoch() {
      return worldEpoch;
    },
    get kind() {
      return kind;
    },
    dailySet: () => daily.set(),
    calendarState: () => daily.calendarState(),
    beginSession,
    observeTick,
    observeEvent,
    observeMissionSettlement,
    observeActiveWindow,
    suspend,
    resume,
    read,
    status,
    stats: status,
    checkpoint,
    save,
    playerProgress: () => player,
    dispose(): void {
      if (disposed) return;
      try {
        flushActiveWindow(now(), true);
      } finally {
        save();
        disposed = true;
      }
    },
  };
  return Object.freeze(runtime);
}

export interface LiveDailyProgress {
  readonly version: typeof LIVE_DAILY_PROGRESS_VERSION;
  readonly playerId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly kind: LiveDailyProgressKind;
  dailySet(): DailyMissionSet;
  calendarState(): DailyCalendarState;
  beginSession(input: LiveDailyProgressSessionInput): LiveDailyProgressRead;
  observeTick(input: LiveDailyProgressTickInput): void;
  observeEvent(event: SimulationEvent, observedAtMs: number): DailyProgressIngestResult | null;
  observeMissionSettlement(
    settlement: MissionCompletionResult,
    observedAtMs: number,
  ): XpCreditResult | null;
  observeActiveWindow(window: LiveDailyProgressActiveWindow): ActiveTimeResult;
  suspend(atMs?: number): void;
  resume(atMs?: number): void;
  read(atMs?: number): LiveDailyProgressRead;
  status(): LiveDailyProgressStatus;
  stats(): LiveDailyProgressStatus;
  checkpoint(atMs?: number): LiveDailyReloadCheckpoint;
  save(): void;
  /**
   * The one real 213 ledger owned by this composition. PBI 277 credits challenge rewards through it
   * instead of creating a second ledger; no caller gets a second balance or a debit path.
   */
  playerProgress(): PlayerProgress;
  dispose(): void;
}

/** Structural constants the report and tests assert against the delivered contracts. */
export const LIVE_DAILY_PROGRESS_POLICY = Object.freeze({
  version: LIVE_DAILY_PROGRESS_VERSION,
  missionsPerDay: DAILY_MISSIONS_PER_DAY,
  dailyMissionXp: DAILY_MISSION_XP,
  activeWindowMs: LIVE_DAILY_PROGRESS_ACTIVE_WINDOW_MS,
  calendarSyncMs: LIVE_DAILY_PROGRESS_CALENDAR_SYNC_MS,
  maxObservationWindowMs: PLAYER_XP_POLICY.maxObservationWindowMs,
  afkThresholdMs: PLAYER_XP_POLICY.afkThresholdMs,
  debits: 0 as const,
  negativeCredits: false as const,
  profileWrites: 0 as const,
});

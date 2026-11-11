import {
  advanceDailyCalendar,
  createDailyCalendarState,
  dailyCapabilities,
  resolveDailyCalendarDay,
} from '../../src/missions';
import type {
  DailyCalendarInput,
  DailyCalendarState,
  DailyCapabilitySnapshot,
  DailyMissionSet,
} from '../../src/missions';

/**
 * Deterministic fixtures for PBI 211.
 *
 * Nothing here reads a clock, a browser or a random source. A local calendar day is described by a
 * real date, the IANA zone and the offset of that zone; the instant is derived from them, so a test
 * can sit exactly on the midnight boundary or exactly inside a DST day.
 */

export const DAILY_FIXTURE_PLAYER = 'player:211-daily' as const;
export const DAILY_FIXTURE_ZONE = 'Europe/Bucharest' as const;
export const DAILY_FIXTURE_OFFSET_SECONDS = 7_200 as const;
const millisecondsPerDay = 86_400_000;

/** Epoch milliseconds of a local wall time on a local calendar date. */
export function dailyInstant(
  dailyDate: string,
  utcOffsetSeconds: number,
  hour = 12,
  minute = 0,
  second = 0,
  millisecond = 0,
): number {
  const days = dateDays(dailyDate);
  return (
    days * millisecondsPerDay -
    utcOffsetSeconds * 1_000 +
    hour * 3_600_000 +
    minute * 60_000 +
    second * 1_000 +
    millisecond
  );
}

export function dateDays(dailyDate: string): number {
  const [year, month, day] = dailyDate.split('-').map(Number);
  return Date.UTC(year!, month! - 1, day!) / millisecondsPerDay;
}

export function calendarInput(
  dailyDate: string,
  options: {
    readonly utcOffsetSeconds?: number;
    readonly dayLengthSeconds?: number;
    readonly hour?: number;
    readonly minute?: number;
    readonly second?: number;
    readonly millisecond?: number;
    readonly atMs?: number;
  } = {},
): DailyCalendarInput {
  const utcOffsetSeconds = options.utcOffsetSeconds ?? DAILY_FIXTURE_OFFSET_SECONDS;
  return Object.freeze({
    timeZone: DAILY_FIXTURE_ZONE,
    observedAtMs:
      options.atMs ??
      dailyInstant(
        dailyDate,
        utcOffsetSeconds,
        options.hour ?? 12,
        options.minute ?? 0,
        options.second ?? 0,
        options.millisecond ?? 0,
      ),
    utcOffsetSeconds,
    dayLengthSeconds: options.dayLengthSeconds ?? 86_400,
  });
}

/** All capabilities the delivered systems can offer in V1. */
export function fullCapabilities(): DailyCapabilitySnapshot {
  return dailyCapabilities({
    learningKeys: ['speed_delta_urban', 'following_time_headway'],
    zones: ['zone:airport', 'zone:center', 'zone:suburb'],
    vehicleClasses: ['compact', 'sedan'],
    controlModes: ['AUTO', 'LEARNING', 'MANUAL'],
    campaignCompleted: ['campaign-1-first-taxi'],
    unlocks: ['challenge:first-demonstration'],
  });
}

/** A new player with a minimal but real map: no learning key, no zone, no campaign progress. */
export function minimalCapabilities(): DailyCapabilitySnapshot {
  return dailyCapabilities({
    learningKeys: [],
    zones: [],
    vehicleClasses: ['sedan'],
    controlModes: ['AUTO', 'MANUAL'],
    campaignCompleted: [],
    unlocks: [],
  });
}

/** A middle snapshot: learning exists, but no campaign stage has been completed yet. */
export function learningOnlyCapabilities(): DailyCapabilitySnapshot {
  return dailyCapabilities({
    learningKeys: ['speed_delta_urban'],
    zones: ['zone:center'],
    vehicleClasses: ['sedan'],
    controlModes: ['AUTO', 'LEARNING', 'MANUAL'],
    campaignCompleted: [],
    unlocks: [],
  });
}

export interface DailyStepOptions {
  readonly state?: DailyCalendarState | null;
  readonly playerId?: string;
  readonly calendar: DailyCalendarInput;
  readonly capabilities?: DailyCapabilitySnapshot;
  readonly generatedAtMs?: number;
  readonly templateCatalog?: unknown;
}

/** Advance the calendar; the generated instant is explicit unless the caller overrides it. */
export function step(options: DailyStepOptions) {
  return advanceDailyCalendar({
    state: options.state ?? null,
    playerId: options.playerId ?? DAILY_FIXTURE_PLAYER,
    calendar: options.calendar,
    capabilities: options.capabilities ?? fullCapabilities(),
    generatedAtMs:
      options.generatedAtMs ?? Math.min(options.calendar.observedAtMs, Number.MAX_SAFE_INTEGER),
    ...(options.templateCatalog === undefined ? {} : { templateCatalog: options.templateCatalog }),
  });
}

/** First boot followed by the requested day; convenience for a single-day scenario. */
export function setForDay(
  dailyDate: string,
  capabilities: DailyCapabilitySnapshot = fullCapabilities(),
  calendarOptions: Parameters<typeof calendarInput>[1] = {},
): DailyMissionSet {
  const result = step({
    calendar: calendarInput(dailyDate, calendarOptions),
    capabilities,
  });
  if (result.set === null) throw new Error('Expected a generated daily set');
  return result.set;
}

/** A state that already contains the given consecutive days. */
export function stateForDays(
  days: readonly string[],
  capabilities: DailyCapabilitySnapshot = fullCapabilities(),
  calendarOptions: Parameters<typeof calendarInput>[1] = {},
): DailyCalendarState {
  let state: DailyCalendarState = createDailyCalendarState(
    DAILY_FIXTURE_PLAYER,
    DAILY_FIXTURE_ZONE,
  );
  for (const day of days)
    state = step({ state, calendar: calendarInput(day, calendarOptions), capabilities }).state;
  return state;
}

export function resolvedDay(dailyDate: string, options: Parameters<typeof calendarInput>[1] = {}) {
  return resolveDailyCalendarDay(calendarInput(dailyDate, options));
}

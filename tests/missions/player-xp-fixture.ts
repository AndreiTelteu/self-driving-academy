import { createFleetKpi, createFleetLedger, createReviewLedger } from '../../src/economy';
import type { FleetKpiSnapshot } from '../../src/economy';
import { createCandidateProfileStore } from '../../src/learning';
import {
  createPlayerProgress,
  createMissionRewardsLedger,
  dailyMissionSetOrdered,
  recordDailyReward,
} from '../../src/missions';
import type {
  DailyCalendarState,
  DailyMissionInstance,
  DailyMissionSet,
  DailyRewardRecord,
  MissionCompletionResult,
  MissionInstance,
  MissionRewardsLedger,
  MissionTracker,
  PlayerProgress,
} from '../../src/missions';
import { parameterDefinitions } from '../../src/profiles';
import type { ProfileStore } from '../../src/profiles';
import { calendarInput, step } from './mission-daily-fixture';
import { completeMission, replayMission } from './mission-rewards-fixture';
import { createMissionTestTracker } from './mission-fixture';

/**
 * Fixture for PBI 213.
 *
 * Every credit is produced by a real delivered contract: a 116 campaign mission completed by real
 * 007 events and settled by the real 125 ledger, a 211 daily instance rewarded by the real calendar,
 * a real 209 failed ride with its real review and KPI, and a real 109 profile store. The fixture only
 * chooses which real facts happen and when; it never invents XP, a settlement or a completion.
 *
 * There is no wall clock: every moment is an explicit millisecond value.
 */
export const XP_FIXTURE_PLAYER = 'player:213-xp' as const;
export const XP_FIXTURE_DATE = '2026-11-11' as const;
export const XP_FIXTURE_NOW = '2026-11-11T00:00:00.000Z' as const;
export const XP_FIXTURE_ENGINE_VERSION = 'engine-213' as const;
export const XP_FIXTURE_PROFILE_ID = 'profile:213' as const;
export const XP_FIXTURE_PROFILE_VERSION = 'profile-213-base' as const;
/** First real-time moment of the active-time scenarios (matches the 211 fixture day). */
export const XP_FIXTURE_START_MS = 1_794_475_200_000 as const;
export const XP_FIXTURE_TICK = 100 as const;

export function createXpProgress(playerId: string = XP_FIXTURE_PLAYER): PlayerProgress {
  return createPlayerProgress({ playerId });
}

export interface MissionScenario {
  readonly tracker: MissionTracker;
  readonly ledger: MissionRewardsLedger;
  readonly instance: MissionInstance;
  readonly settlement: MissionCompletionResult;
}

/** One real campaign mission completed through the 116 tracker and settled by the 125 ledger. */
export function completedMissionSettlement(
  missionId = 'campaign-1-first-taxi',
  startTick: number = XP_FIXTURE_TICK,
): MissionScenario {
  const tracker = createMissionTestTracker();
  const ledger = createMissionRewardsLedger({ catalog: tracker.catalog() });
  const instance = completeMission(tracker, missionId, startTick);
  return Object.freeze({
    tracker,
    ledger,
    instance,
    settlement: ledger.settle({ instance }),
  });
}

/** A real 116 replay of the same mission, settled by the same 125 ledger. */
export function replaySettlement(scenario: MissionScenario): MissionCompletionResult {
  const completedTick = scenario.instance.completedTick ?? 0;
  const replayed = replayMission(scenario.tracker, scenario.instance, completedTick + 10);
  return scenario.ledger.settle({ instance: replayed });
}

export interface DailyScenario {
  readonly state: DailyCalendarState;
  readonly set: DailyMissionSet;
  readonly instance: DailyMissionInstance;
  readonly record: DailyRewardRecord;
}

/** One real 211 reward record produced by the delivered generator and calendar. */
export function dailyReward(dailyDate: string = XP_FIXTURE_DATE): DailyScenario {
  const first = step({ playerId: XP_FIXTURE_PLAYER, calendar: calendarInput(dailyDate) });
  if (first.set === null) throw new Error('Expected a generated 211 daily set');
  const instance = dailyMissionSetOrdered(first.set)[0];
  if (instance === undefined) throw new Error('Expected a 211 daily instance');
  const rewarded = recordDailyReward({
    state: first.state,
    instanceId: instance.instanceId,
    grantedAtMs: calendarInput(dailyDate).observedAtMs,
  });
  if (!rewarded.granted) throw new Error('Expected the first 211 daily reward');
  return Object.freeze({
    state: rewarded.state,
    set: first.set,
    instance,
    record: rewarded.record,
  });
}

/** Advances the same player's real 211 calendar to another local day. */
export function advanceDaily(state: DailyCalendarState, dailyDate: string) {
  return step({ state, playerId: XP_FIXTURE_PLAYER, calendar: calendarInput(dailyDate) });
}

export interface WindowOverrides {
  readonly scope?: string;
  readonly controlMode?: string;
  readonly paused?: boolean;
  readonly focused?: boolean;
  readonly visible?: boolean;
  readonly afk?: boolean;
}

/** One plain observation window; the caller owns the real facts it reports. */
export function activeWindow(
  startedAtMs: number,
  durationMs = 30_000,
  overrides: WindowOverrides = {},
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    startedAtMs,
    endedAtMs: startedAtMs + durationMs,
    scope: overrides.scope ?? 'ACADEMY',
    controlMode: overrides.controlMode ?? 'MANUAL',
    paused: overrides.paused ?? false,
    focused: overrides.focused ?? true,
    visible: overrides.visible ?? true,
    afk: overrides.afk ?? false,
  });
}

/** Parameter defaults of a real 109 base profile, used by the fixture and by the import scenario. */
export function xpProfileParameters(): Record<string, number> {
  const parameters: Record<string, number> = Object.create(null);
  for (const definition of parameterDefinitions) parameters[definition.key] = definition.default;
  return parameters;
}

/** Real 109 store seeded with one base profile, exactly like the 125 fixture. */
export function createXpProfileStore(): ProfileStore {
  const store = createCandidateProfileStore({
    engineVersion: XP_FIXTURE_ENGINE_VERSION,
    now: () => XP_FIXTURE_NOW,
  });
  const created = store.createBase({
    profileId: XP_FIXTURE_PROFILE_ID,
    versionId: XP_FIXTURE_PROFILE_VERSION,
    parameters: xpProfileParameters(),
    sourceSegmentIds: [],
    createdAt: XP_FIXTURE_NOW,
  });
  if (created.status !== 'ACCEPTED')
    throw new Error(`213 fixture profile rejected: ${created.rejection.code}`);
  return store;
}

export interface FailingEconomy {
  readonly settlement: {
    readonly rideId: string;
    readonly terminalState: string;
    readonly netMinorUnits: number;
  };
  readonly rating: number | null;
  readonly snapshot: FleetKpiSnapshot;
  dispose(): void;
}

/**
 * One real 209 failed taxi ride: revenue drops, the passenger writes a low review and the KPI day
 * keeps both facts. It is the KPI/incident path the player progress must ignore.
 */
export function failingEconomy(): FailingEconomy {
  const ledger = createFleetLedger();
  const reviews = createReviewLedger();
  const kpi = createFleetKpi();
  const rideId = 'ride:213:failed';
  const terminalTick = 1_000;
  const outcome = ledger.ingest({
    eventId: 'economy:213:failed',
    rideId,
    requestId: 'request:213:failed',
    taxiId: 'taxi:213',
    vehicleKind: 'TAXI',
    terminalState: 'FAILED',
    terminalTick,
    passengerAboard: true,
    plannedDistanceMeters: 1_200,
    referenceTripDurationSeconds: 120,
  });
  const settlement = outcome.settlement;
  if (settlement === null) throw new Error('Expected a 209 settlement for the failed ride');
  const review = reviews.ingest({
    eventId: 'review:213:failed',
    facts: {
      rideId,
      customerId: 'customer:request:213:failed',
      terminalState: 'FAILED',
      terminalTick,
      passengerAboard: true,
      referenceTripDurationSeconds: 120,
      actualTripDurationSeconds: 600,
      comfort: null,
    },
  });
  kpi.applySettlement(settlement);
  if (review.review !== null) kpi.applyReview(review.review);
  return {
    settlement,
    rating: review.review?.rating ?? null,
    snapshot: kpi.snapshot(terminalTick + 1),
    dispose(): void {
      kpi.dispose();
      reviews.dispose();
      ledger.dispose();
    },
  };
}

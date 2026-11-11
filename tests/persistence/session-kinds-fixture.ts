import {
  createCampaignMissionCatalog,
  createDailyProgress,
  createMissionRewardsLedger,
  createPlayerProgress,
} from '../../src/missions';
import type { DailyProgress, MissionRewardsLedger, PlayerProgress } from '../../src/missions';
import {
  copyProfileForChaos,
  createMemorySessionKindStore,
  createSessionKindHost,
  createSessionKindIsolation,
} from '../../src/persistence/index';
import type {
  ChaosProfileCopy,
  MemorySessionKindStore,
  SessionKindHost,
  SessionKindIsolation,
  SessionWorldCapture,
  SessionWorldIdentity,
  SessionWorldPort,
} from '../../src/persistence/index';
import type { ProfileVersion } from '../../src/profiles/index';
import { calendarInput, fullCapabilities } from '../missions/mission-daily-fixture';
import { profileVersion } from './fixtures';

/**
 * Deterministic fixture for PBI 225.
 *
 * The Academy profile is a real 109 version, the daily calendar is a real 211/212 set, the XP ledger
 * is a real 213 instance and the campaign is a real 125 ledger over the real 116 catalog. Nothing
 * here reads a clock, a browser or `Math.random`.
 */
export const FIXED_NOW = '2026-11-11T20:00:00.000Z' as const;
export const ACADEMY_SESSION_ID = 'session-225-academy' as const;
export const CHAOS_SESSION_ID = 'session-225-chaos' as const;
export const CHAOS_COPY_ID = 'haos-copy-1' as const;
export const DAILY_DATE = '2026-11-11' as const;

export function fixedClock(): () => string {
  return () => FIXED_NOW;
}

export function academyProfile(): ProfileVersion {
  return profileVersion({ parameters: { speed_delta_urban: 10, following_time_headway: 1.2 } });
}

export function chaosProfileCopy(source: ProfileVersion = academyProfile()): ChaosProfileCopy {
  const result = copyProfileForChaos({
    source,
    copyId: CHAOS_COPY_ID,
    sessionId: CHAOS_SESSION_ID,
    learningEpoch: 0,
    copiedAt: FIXED_NOW,
  });
  if (result.status !== 'COPIED')
    throw new Error(`225 fixture copy rejected: ${result.rejection.code}`);
  return result.copy;
}

export function academyDaily(): DailyProgress {
  const calendar = calendarInput(DAILY_DATE);
  return createDailyProgress({
    playerId: 'player:225',
    sessionId: ACADEMY_SESSION_ID,
    worldEpoch: 1,
    calendar,
    capabilities: fullCapabilities(),
    generatedAtMs: calendar.observedAtMs,
  });
}

export function academyXp(): PlayerProgress {
  return createPlayerProgress({ playerId: 'player:225' });
}

export function academyCampaign(): MissionRewardsLedger {
  return createMissionRewardsLedger({ catalog: createCampaignMissionCatalog() });
}

/** A real 007 `MANUAL_START` of the Academy session, validated by the owning parser. */
export function academyManualStart(eventId = '225:manual-start:1', tick = 10): unknown {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: ACADEMY_SESSION_ID,
    worldEpoch: 1,
    eventId,
    tick,
    entityIds: ['taxi:225'],
    type: 'MANUAL_START',
    payload: { vehicleId: 'taxi:225', controlMode: 'MANUAL' },
  };
}

/** The same event claimed by the Haos session; the gate must refuse before daily sees it. */
export function chaosManualStart(eventId = '225:chaos:manual-start:1', tick = 10): unknown {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: CHAOS_SESSION_ID,
    worldEpoch: 1,
    eventId,
    tick,
    entityIds: ['taxi:225'],
    type: 'MANUAL_START',
    payload: { vehicleId: 'taxi:225', controlMode: 'MANUAL' },
  };
}

/** A short real active window inside the Academy. */
export function academyActiveWindow(): unknown {
  return {
    startedAtMs: 0,
    endedAtMs: 30_000,
    scope: 'ACADEMY',
    controlMode: 'MANUAL',
    paused: false,
    focused: true,
    visible: true,
    afk: false,
  };
}

/** A Haos active window: even as a raw 213 input it is outside the Academy. */
export function chaosActiveWindow(): unknown {
  return { ...(academyActiveWindow() as Record<string, unknown>), scope: 'HAOS' };
}

export interface SessionEconomyFixture {
  readonly profile: ProfileVersion;
  readonly copy: ChaosProfileCopy;
  readonly daily: DailyProgress;
  readonly xp: PlayerProgress;
  readonly campaign: MissionRewardsLedger;
  readonly isolation: SessionKindIsolation;
}

export function sessionEconomyFixture(): SessionEconomyFixture {
  const profile = academyProfile();
  const daily = academyDaily();
  const xp = academyXp();
  const campaign = academyCampaign();
  return Object.freeze({
    profile,
    copy: chaosProfileCopy(profile),
    daily,
    xp,
    campaign,
    isolation: createSessionKindIsolation({ daily, xp, campaign }),
  });
}

interface WorldRecord {
  identity: SessionWorldIdentity;
  jobs: number;
  listeners: number;
  inputs: number;
  closedSegments: number;
  captures: number;
  live: boolean;
}

export interface TestWorldPort extends SessionWorldPort {
  /** Every world ever started, in start order. */
  readonly worlds: readonly Readonly<WorldRecord>[];
  /** Worlds that are no longer live but still hold a job, a listener or an input binding. */
  orphans(): readonly Readonly<WorldRecord>[];
}

function worldKey(identity: SessionWorldIdentity): string {
  return `${identity.sessionKind}:${identity.sessionId}:${identity.worldEpoch}:${identity.learningEpoch}`;
}

/**
 * Deterministic port of the one live physical world. A started world owns two jobs, one listener and
 * two input bindings; `invalidateJobs`/`releaseInput` drop exactly the jobs and bindings of the
 * identity they are given, so a mismatch would leave an orphan and fail the test.
 */
export function createTestWorldPort(): TestWorldPort {
  const worlds = new Map<string, WorldRecord>();
  let tick = 0;

  function requireWorld(identity: SessionWorldIdentity): WorldRecord {
    const record = worlds.get(worldKey(identity));
    if (record === undefined) throw new Error(`No world for ${worldKey(identity)}`);
    return record;
  }

  return {
    get worlds() {
      return Object.freeze([...worlds.values()].map((record) => Object.freeze({ ...record })));
    },
    orphans() {
      return Object.freeze(
        [...worlds.values()]
          .filter((record) => !record.live)
          .filter((record) => record.jobs > 0 || record.listeners > 0 || record.inputs > 0)
          .map((record) => Object.freeze({ ...record })),
      );
    },
    start(identity) {
      const key = worldKey(identity);
      worlds.set(key, {
        identity: Object.freeze({ ...identity }),
        jobs: 2,
        listeners: 1,
        inputs: 2,
        closedSegments: 0,
        captures: 0,
        live: true,
      });
    },
    stop(identity) {
      const record = requireWorld(identity);
      record.live = false;
      record.listeners = 0;
    },
    closeSegment(identity) {
      const record = requireWorld(identity);
      record.closedSegments += 1;
      return 1;
    },
    capture(identity): SessionWorldCapture {
      const record = requireWorld(identity);
      record.captures += 1;
      tick += 1;
      return Object.freeze({
        tick,
        vehicles: 4,
        manualVehicles: 1,
        body: Object.freeze({ tick, worldEpoch: identity.worldEpoch, vehicles: 4 }),
      });
    },
    invalidateJobs(identity) {
      const record = requireWorld(identity);
      const removed = record.jobs;
      record.jobs = 0;
      return removed;
    },
    releaseInput(identity) {
      const record = requireWorld(identity);
      const released = record.inputs;
      record.inputs = 0;
      return released;
    },
    residentJobs(identity) {
      return requireWorld(identity).jobs;
    },
    listeners(identity) {
      return requireWorld(identity).listeners;
    },
  };
}

export interface SessionHostFixture {
  readonly profile: ProfileVersion;
  readonly copy: ChaosProfileCopy;
  readonly store: MemorySessionKindStore;
  readonly world: TestWorldPort;
  readonly host: SessionKindHost;
}

export function sessionHostFixture(): SessionHostFixture {
  const profile = academyProfile();
  const copy = chaosProfileCopy(profile);
  const store = createMemorySessionKindStore();
  const world = createTestWorldPort();
  const host = createSessionKindHost({
    store,
    world,
    academyProfile: profile,
    chaosProfile: copy,
    academySessionId: ACADEMY_SESSION_ID,
    chaosSessionId: CHAOS_SESSION_ID,
    now: fixedClock(),
  });
  return Object.freeze({ profile, copy, store, world, host });
}

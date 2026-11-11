import {
  createCampaignMissionCatalog,
  createDailyProgress,
  createMissionRewardsLedger,
  createPlayerProgress,
} from '../../src/missions';
import type {
  DailyProgress,
  MissionRewardsLedger,
  MissionTracker,
  PlayerProgress,
} from '../../src/missions';
import type { ProfileVersion } from '../../src/profiles';
import {
  canonicalizeJson,
  createMemoryRecoveryCheckpointStore,
  createWorldRecovery,
  sha256Hex,
} from '../../src/persistence/index';
import type {
  MemoryRecoveryCheckpointStore,
  RecoveryCheckpointPort,
  RecoveryLedgerPort,
  RecoveryLedgerSnapshot,
  RecoveryProfilePort,
  RecoveryReplayFact,
  RecoveryReplayPort,
  RecoverySceneActivity,
  RecoverySceneClose,
  RecoverySceneCloseResult,
  RecoveryScenePort,
  RecoverySceneRetry,
  RecoveryStyleActivation,
  RecoveryVehicle,
  RecoveryWorldPort,
  SessionKind,
  WorldRecovery,
} from '../../src/persistence/index';
import type { ContractContext } from '../../src/sessions';
import type { RecoveryRecord } from '../../src/vehicles';
import { calendarInput, fullCapabilities } from '../missions/mission-daily-fixture';
import { createMissionTestTracker } from '../missions/mission-fixture';
import { profileVersion } from './fixtures';

/**
 * Deterministic fixture for PBI 226.
 *
 * The economic read models are the real 211/212/213/125/116/109 instances: the XP ledger is a real
 * `PlayerProgress` credited through a real active window, the daily calendar is a real
 * `DailyProgress`, the campaign is a real 125 ledger and the mission snapshot is a real 116
 * tracker. The five ports around them are deterministic doubles of the composition owners
 * (030/206/209/207/065); the 030 double reproduces the real `RecoveryRecord` output of
 * `createVehicleRecovery`, and is type-bound to its exact surface by `RecoveryVehicle`.
 */

export const RECOVERY_FIXED_NOW = '2026-11-11T21:00:00.000Z' as const;
export const RECOVERY_SESSION_ID = 'session-226-academy' as const;
export const RECOVERY_CHAOS_SESSION_ID = 'session-226-chaos' as const;
export const RECOVERY_DAILY_DATE = '2026-11-11' as const;
export const RECOVERY_VEHICLE_ID = 'taxi-01' as const;
export const RECOVERY_POINT_ID = 'recovery-point:map-1:taxi-01:1:lane-1:10' as const;
export const RECOVERY_LANE_ID = 'lane-1' as const;
export const BASELINE_VEHICLES = 24 as const;
export const BASELINE_TRAFFIC = 40 as const;
export const BASELINE_LISTENERS = 1 as const;
export const BASELINE_JOBS = 2 as const;

export function recoveryClock(): () => string {
  return () => RECOVERY_FIXED_NOW;
}

export function recoveryDigest(value: unknown): string {
  const canonical = canonicalizeJson(value);
  if (canonical.status === 'REJECTED') {
    throw new Error(`The fixture value is not canonical: ${canonical.rejection.message}`);
  }
  return `sha256:${sha256Hex(canonical.text)}`;
}

/* --------------------------------------------------------------- 030 double */

export interface RecoveryVehicleDoubleOptions {
  /** No validated collider-free candidate yet; R must refuse instead of using "where it was". */
  readonly colliderFree?: boolean;
  readonly colliders?: number;
  /** Report SAFE while the collider count is nonzero, to exercise the defensive module check. */
  readonly claimSafe?: boolean;
  /** The native placement never publishes the restored state. */
  readonly withoutAfter?: boolean;
  readonly commitAnswer?: 'NO_VALID_POINT' | 'CANCELLED' | null;
}

export interface RecoveryVehicleDouble extends RecoveryVehicle {
  readonly requests: number;
  readonly commits: number;
}

export function createRecoveryVehicleDouble(
  options: RecoveryVehicleDoubleOptions = {},
): RecoveryVehicleDouble {
  const colliderFree = options.colliderFree ?? true;
  const colliders = options.colliders ?? 0;
  const claimSafe = options.claimSafe ?? false;
  const withoutAfter = options.withoutAfter ?? false;
  const commitAnswer = options.commitAnswer ?? null;
  const history: RecoveryRecord[] = [];
  let requests = 0;
  let commits = 0;
  let intent: { context: ContractContext; tick: number; origin: 'R' | 'HUD' } | null = null;

  function snapshotSerial() {
    return {
      positionM: Object.freeze({ x: 4, y: 0.5, z: 8 }),
      rotationQuaternion: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
    };
  }

  return Object.freeze({
    get requests() {
      return requests;
    },
    get commits() {
      return commits;
    },
    readProjection() {
      return Object.freeze({
        identity: Object.freeze({ entityId: RECOVERY_VEHICLE_ID, handle: 7, generation: 1 }),
        mode: 'MANUAL' as const,
        available: colliderFree,
        enabled: true,
        pointId: colliderFree ? RECOVERY_POINT_ID : null,
        result: history.at(-1) ?? null,
        fault: null,
      });
    },
    request(value: {
      readonly context: ContractContext;
      readonly identity: unknown;
      readonly mode: 'MANUAL' | 'LEARNING';
      readonly tick: number;
      readonly origin: 'R' | 'HUD';
    }) {
      requests += 1;
      intent = { context: value.context, tick: value.tick, origin: value.origin };
      return `recovery:${value.context.sessionId}:${String(value.context.worldEpoch)}:${String(value.tick)}:${value.origin}`;
    },
    commit(at: number): RecoveryRecord | 'NO_VALID_POINT' | 'CANCELLED' | null {
      commits += 1;
      if (commitAnswer !== null) return commitAnswer;
      const active = intent;
      if (active === null) return null;
      const before = Object.freeze({
        physicsStepSerial: at,
        transform: snapshotSerial(),
        velocityMps: Object.freeze({ x: 0, y: 0, z: 0 }),
        angularVelocityRadS: Object.freeze({ x: 0, y: 0, z: 0 }),
      });
      const after = withoutAfter
        ? null
        : Object.freeze({
            physicsStepSerial: at,
            transform: Object.freeze({
              positionM: Object.freeze({ x: 0, y: 0.5, z: 10 }),
              rotationQuaternion: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
            }),
            velocityMps: Object.freeze({ x: 0, y: 0, z: 3 }),
            angularVelocityRadS: Object.freeze({ x: 0, y: 0, z: 0 }),
          });
      const record: RecoveryRecord = Object.freeze({
        context: active.context,
        operationId: `recovery:${active.context.sessionId}:${String(active.context.worldEpoch)}:${String(at)}:${active.origin}`,
        vehicleId: RECOVERY_VEHICLE_ID,
        bodyGeneration: 1,
        pointId: RECOVERY_POINT_ID,
        mapId: 'map-1',
        laneId: RECOVERY_LANE_ID,
        access: 'TAXI' as const,
        mode: 'MANUAL' as const,
        validatedTick: at - 1,
        requestedTick: active.tick,
        acceptedTick: at,
        origin: active.origin,
        kind: 'TELEPORT' as const,
        learningEligible: false as const,
        status: claimSafe || colliders === 0 ? ('COMPLETED' as const) : ('DENIED' as const),
        before,
        placement: Object.freeze({
          status:
            claimSafe || (colliderFree && colliders === 0)
              ? ('SAFE' as const)
              : ('BLOCKED' as const),
          physicsStepSerial: at,
          colliderCount: colliders,
          after,
          attempted: 5,
          completed: 5,
          failure: null,
        }),
        deliveredStages: 5,
        failure: null,
      });
      history.push(record);
      return record;
    },
    readHistory(offset = 0, limit = 64) {
      return Object.freeze(history.slice(offset, offset + limit));
    },
  });
}

/* --------------------------------------------------------------- 206/065 double */

export interface RecoveryWorldDouble extends RecoveryWorldPort {
  readonly starts: number;
  readonly stops: number;
  readonly closes: number;
  readonly invalidations: number;
  readonly releases: number;
  readonly liveWorlds: number;
  failNextStart: boolean;
}

interface WorldRecord {
  vehicles: number;
  trafficVehicles: number;
  bodies: number;
  listeners: number;
  jobs: number;
  live: boolean;
  closedSegments: number;
}

function worldKey(identity: {
  readonly sessionKind: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
}): string {
  // One physical world per session and world epoch; learningEpoch is a learning generation bound to
  // the same world, so a style activation does not create a second world.
  return `${identity.sessionKind}:${identity.sessionId}:${identity.worldEpoch}`;
}

export function createRecoveryWorldDouble(): RecoveryWorldDouble {
  const worlds = new Map<string, WorldRecord>();
  let starts = 0;
  let stops = 0;
  let closes = 0;
  let invalidations = 0;
  let releases = 0;
  const port: RecoveryWorldDouble = {
    get starts() {
      return starts;
    },
    get stops() {
      return stops;
    },
    get closes() {
      return closes;
    },
    get invalidations() {
      return invalidations;
    },
    get releases() {
      return releases;
    },
    get liveWorlds() {
      return [...worlds.values()].filter((record) => record.live).length;
    },
    failNextStart: false,
    start(identity) {
      starts += 1;
      if (port.failNextStart) {
        port.failNextStart = false;
        throw new Error('The rebuilt world refused to start');
      }
      worlds.set(worldKey(identity), {
        vehicles: BASELINE_VEHICLES,
        trafficVehicles: BASELINE_TRAFFIC,
        bodies: BASELINE_VEHICLES + BASELINE_TRAFFIC,
        listeners: BASELINE_LISTENERS,
        jobs: BASELINE_JOBS,
        live: true,
        closedSegments: 0,
      });
    },
    stop(identity) {
      stops += 1;
      const record = worlds.get(worldKey(identity));
      if (record === undefined) throw new Error('No world to stop');
      record.live = false;
      record.listeners = 0;
    },
    closeSegment(identity) {
      closes += 1;
      const record = worlds.get(worldKey(identity));
      if (record === undefined) throw new Error('No world to close');
      record.closedSegments += 1;
      return 1;
    },
    capture(identity) {
      const record = worlds.get(worldKey(identity));
      if (record === undefined) throw new Error('No world to capture');
      return Object.freeze({
        tick: 10,
        vehicles: record.vehicles,
        manualVehicles: 1,
        body: Object.freeze({ tick: 10, vehicles: record.vehicles }),
      });
    },
    invalidateJobs(identity) {
      invalidations += 1;
      const record = worlds.get(worldKey(identity));
      if (record === undefined) throw new Error('No world to invalidate');
      const removed = record.jobs;
      record.jobs = 0;
      return removed;
    },
    releaseInput(identity) {
      releases += 1;
      const record = worlds.get(worldKey(identity));
      if (record === undefined) throw new Error('No world to release');
      return 2;
    },
    residentJobs(identity) {
      return worlds.get(worldKey(identity))?.jobs ?? 0;
    },
    listeners(identity) {
      return worlds.get(worldKey(identity))?.listeners ?? 0;
    },
    occupancy(identity) {
      const record = worlds.get(worldKey(identity));
      if (record === undefined) throw new Error('No world occupancy');
      return Object.freeze({
        vehicles: record.vehicles,
        trafficVehicles: record.trafficVehicles,
        bodies: record.bodies,
        listeners: record.listeners,
        jobs: record.jobs,
      });
    },
  };
  return port;
}

/* ------------------------------------------------------------------ 065/061 */

export interface RecoverySceneDouble extends RecoveryScenePort {
  readonly closes: number;
  readonly retries: number;
  add(activity: RecoverySceneActivity): void;
  remove(activityId: string): boolean;
}

export function createRecoverySceneDouble(
  initial: readonly RecoverySceneActivity[] = [],
): RecoverySceneDouble {
  const active = new Map(initial.map((activity) => [activity.activityId, activity]));
  const closed: RecoverySceneClose[] = [];
  let closeCalls = 0;
  let retryCalls = 0;
  return {
    get closes() {
      return closeCalls;
    },
    get retries() {
      return retryCalls;
    },
    add(activity) {
      active.set(activity.activityId, activity);
    },
    remove(activityId) {
      return active.delete(activityId);
    },
    active() {
      return Object.freeze([...active.values()]);
    },
    close(request): RecoverySceneCloseResult {
      closeCalls += 1;
      const activity = active.get(request.activityId);
      const prior = closed.find((entry) => entry.activityId === request.activityId);
      if (activity === undefined) {
        if (prior !== undefined) {
          return Object.freeze({
            status: 'DUPLICATE' as const,
            close: prior,
            duplicates: 1 as const,
          });
        }
        return Object.freeze({
          status: 'REJECTED' as const,
          code: 'NOT_ACTIVE' as const,
          message: `No active activity ${request.activityId}`,
        });
      }
      if (activity.kind !== request.kind) {
        return Object.freeze({
          status: 'REJECTED' as const,
          code: 'FOREIGN_OWNER' as const,
          message: 'The activity kind does not belong to the close reason',
        });
      }
      const close: RecoverySceneClose = Object.freeze({
        activityId: activity.activityId,
        kind: activity.kind,
        reason: request.reason,
        tick: request.tick,
        revenue: 0 as const,
        terminal: true as const,
      });
      active.delete(activity.activityId);
      closed.push(close);
      return Object.freeze({ status: 'CLOSED' as const, close, duplicates: 0 as const });
    },
    history() {
      return Object.freeze([...closed]);
    },
    retry(request): RecoverySceneRetry {
      retryCalls += 1;
      const finished = closed.find(
        (entry) => entry.activityId === request.activityId && entry.kind === 'CHALLENGE',
      );
      if (finished === undefined) {
        return Object.freeze({
          status: 'UNAVAILABLE' as const,
          activityId: request.activityId,
          availableAtTick: null,
          ticksWaited: 0 as const,
          blockers: Object.freeze(['CHALLENGE_STILL_ACTIVE']),
        });
      }
      return Object.freeze({
        status: 'AVAILABLE' as const,
        activityId: request.activityId,
        availableAtTick: request.tick,
        ticksWaited: 0 as const,
        blockers: Object.freeze([]),
      });
    },
  };
}

/* ----------------------------------------------------------------- 109 style */

export interface RecoveryProfileDouble extends RecoveryProfilePort {
  readonly activations: number;
  readonly refused: number;
  setRefusal(value: 'VERSION_NOT_FOUND' | 'STALE_LEARNING_EPOCH' | 'BARRIER_REJECTED' | null): void;
  /** Replace the active version, including an intentionally broken one for the prepare-failure test. */
  setActive(version: ProfileVersion): void;
  /** `null` accepts the host generation, which is the normal case; a number simulates a stale caller. */
  setExpectedLearningEpoch(value: number | null): void;
}

export function createRecoveryProfileDouble(): RecoveryProfileDouble {
  const base = profileVersion({
    parameters: { speed_delta_urban: 10, following_time_headway: 1.2 },
  });
  const derived = profileVersion({
    versionId: 'profile-1@2',
    parentVersionId: 'profile-1@1',
    depth: 1,
    parameters: { speed_delta_urban: 14, following_time_headway: 1.2 },
    provenance: {
      origin: 'DERIVED',
      sourceSegmentIds: ['segment-1'],
      sourceInterventionIds: [],
      delta: {
        baseVersionId: 'profile-1@1',
        validationVersion: '102-candidate-v1',
        segmentId: 'segment-1',
        interventionId: null,
        reason: 'manual tuning',
        keyCount: 1,
        changes: [{ key: 'speed_delta_urban', unit: 'ratio', previousValue: 10, newValue: 14 }],
      },
    },
    sourceSegmentIds: ['segment-1'],
  });
  const versions = new Map([
    [base.versionId, base],
    [derived.versionId, derived],
  ]);
  let active = base;
  let expectedLearningEpoch: number | null = null;
  let activations = 0;
  let refused = 0;
  let refusal: 'VERSION_NOT_FOUND' | 'STALE_LEARNING_EPOCH' | 'BARRIER_REJECTED' | null = null;
  return {
    get activations() {
      return activations;
    },
    get refused() {
      return refused;
    },
    setRefusal(value) {
      refusal = value;
    },
    setActive(version) {
      active = version;
    },
    setExpectedLearningEpoch(value) {
      expectedLearningEpoch = value;
    },
    active() {
      return active;
    },
    activate(request): RecoveryStyleActivation {
      if (refusal !== null) {
        refused += 1;
        return Object.freeze({
          status: 'REJECTED' as const,
          code: refusal,
          message: `The barrier refused the activation: ${refusal}`,
        });
      }
      const version = versions.get(request.versionId);
      if (version === undefined) {
        refused += 1;
        return Object.freeze({
          status: 'REJECTED' as const,
          code: 'VERSION_NOT_FOUND' as const,
          message: `No version ${request.versionId}`,
        });
      }
      if (expectedLearningEpoch !== null && request.learningEpoch !== expectedLearningEpoch) {
        refused += 1;
        return Object.freeze({
          status: 'REJECTED' as const,
          code: 'STALE_LEARNING_EPOCH' as const,
          message: `Expected learningEpoch ${String(expectedLearningEpoch)}`,
        });
      }
      active = version;
      activations += 1;
      return Object.freeze({
        status: 'ACTIVATED' as const,
        version,
        barrier: 'LEARNING_EPOCH' as const,
        closedSegments: 1,
        staleResults: 2,
      });
    },
  };
}

/* --------------------------------------------------------------- 125/211+ */

export interface RecoveryEconomyDouble extends RecoveryLedgerPort {
  readonly seriesHistory: readonly number[];
  readonly profiles: () => ProfileVersion;
}

export function createRecoveryEconomyDouble(input: {
  readonly xp: PlayerProgress;
  readonly daily: DailyProgress;
  readonly rewards: MissionRewardsLedger;
  readonly tracker: MissionTracker;
  readonly profile: RecoveryProfileDouble;
}): RecoveryEconomyDouble {
  const seriesHistory: number[] = [1];
  let epoch = 1;
  return {
    get seriesHistory() {
      return Object.freeze([...seriesHistory]);
    },
    profiles: () => input.profile.active(),
    snapshot(): RecoveryLedgerSnapshot {
      const active = input.profile.active();
      const evidence = Object.fromEntries(
        Object.entries(active.parameters).map(([key, value]) => [key, value]),
      );
      return Object.freeze({
        xpMicroXp: input.xp.read().xpBalanceMicroXp,
        daily: recoveryDigest(input.daily.snapshot()),
        rewards: recoveryDigest(input.rewards.rewards()),
        missions: recoveryDigest(input.tracker.snapshot()),
        evidence: recoveryDigest({
          profileId: active.profileId,
          versionId: active.versionId,
          parameters: evidence,
        }),
        economyHistory: seriesHistory.length,
      });
    },
    closeEconomySeries(request) {
      if (request.previousEpoch !== epoch) throw new Error('Stale economy epoch');
      epoch = request.epoch;
      seriesHistory.push(epoch);
      return Object.freeze({
        previousEpoch: request.previousEpoch,
        epoch,
        seriesId: `economy-series:${String(epoch)}`,
        history: seriesHistory.length,
      });
    },
  };
}

/* --------------------------------------------------------------- 207 replay */

export interface RecoveryReplayDouble extends RecoveryReplayPort {
  readonly facts: readonly RecoveryReplayFact[];
}

export function createRecoveryReplayDouble(): RecoveryReplayDouble {
  const facts: RecoveryReplayFact[] = [];
  const seen = new Set<string>();
  let events = 0;
  return {
    get facts() {
      return Object.freeze([...facts]);
    },
    recordReset(request) {
      const eventId = `replay-event:${request.resetId}`;
      const duplicate = seen.has(eventId);
      if (!duplicate) {
        seen.add(eventId);
        events += 1;
      }
      const fact: RecoveryReplayFact = Object.freeze({
        status: duplicate ? ('DUPLICATE' as const) : ('RECORDED' as const),
        eventId,
        discontinuity: true as const,
        finalizeReason: 'WORLD_RESET' as const,
      });
      if (!duplicate) facts.push(fact);
      return fact;
    },
    stats() {
      return Object.freeze({ resets: facts.length, discontinuities: facts.length, events });
    },
  };
}

/* ------------------------------------------------------------------ fixture */

export interface WorldRecoveryFixture {
  readonly module: WorldRecovery;
  readonly recovery: RecoveryVehicleDouble;
  readonly world: RecoveryWorldDouble;
  readonly scene: RecoverySceneDouble;
  readonly profile: RecoveryProfileDouble;
  readonly economy: RecoveryEconomyDouble;
  readonly replay: RecoveryReplayDouble;
  readonly checkpoints: MemoryRecoveryCheckpointStore;
  readonly xp: PlayerProgress;
  readonly daily: DailyProgress;
  readonly rewards: MissionRewardsLedger;
  readonly tracker: MissionTracker;
  readonly calendar: ReturnType<typeof calendarInput>;
  readonly sessionKind: SessionKind;
  readonly sessionId: string;
}

export interface WorldRecoveryFixtureOptions {
  readonly sessionKind?: SessionKind;
  readonly recovery?: RecoveryVehicleDoubleOptions;
  readonly activities?: readonly RecoverySceneActivity[];
  readonly failCheckpointCommits?: number;
}

export function createWorldRecoveryFixture(
  options: WorldRecoveryFixtureOptions = {},
): WorldRecoveryFixture {
  const sessionKind = options.sessionKind ?? 'ACADEMY';
  const sessionId = sessionKind === 'CHAOS' ? RECOVERY_CHAOS_SESSION_ID : RECOVERY_SESSION_ID;
  const profile = createRecoveryProfileDouble();
  const xp = createPlayerProgress({ playerId: 'player:226' });
  // A real 213 active window: 30 s of MANUAL focus credit exactly 500 000 micro-XP (0.5 XP).
  xp.observeActiveTime({
    startedAtMs: 0,
    endedAtMs: 30_000,
    scope: 'ACADEMY',
    controlMode: 'MANUAL',
    paused: false,
    focused: true,
    visible: true,
    afk: false,
  });
  const calendar = calendarInput(RECOVERY_DAILY_DATE);
  const daily = createDailyProgress({
    playerId: 'player:226',
    sessionId: RECOVERY_SESSION_ID,
    worldEpoch: 1,
    calendar,
    capabilities: fullCapabilities(),
    generatedAtMs: calendar.observedAtMs,
  });
  const rewards = createMissionRewardsLedger({ catalog: createCampaignMissionCatalog() });
  const tracker = createMissionTestTracker();
  const world = createRecoveryWorldDouble();
  world.start({
    sessionKind,
    sessionId,
    worldEpoch: 1,
    learningEpoch: 0,
    profileId: profile.active().profileId,
    launch: 'PAUSED_AUTO',
  });
  const scene = createRecoverySceneDouble(options.activities ?? []);
  const recovery = createRecoveryVehicleDouble(options.recovery);
  const economy = createRecoveryEconomyDouble({ xp, daily, rewards, tracker, profile });
  const replay = createRecoveryReplayDouble();
  const checkpoints = createMemoryRecoveryCheckpointStore({
    failNextCommits: options.failCheckpointCommits ?? 0,
  });
  const module = createWorldRecovery({
    sessionKind,
    sessionId,
    epochs: { worldEpoch: 1, learningEpoch: 0, economyEpoch: 1 },
    recovery: () => recovery,
    world,
    scene,
    ledgers: economy,
    profile,
    replay,
    checkpoints: checkpoints as RecoveryCheckpointPort,
    now: recoveryClock(),
  });
  return Object.freeze({
    module,
    recovery,
    world,
    scene,
    profile,
    economy,
    replay,
    checkpoints,
    xp,
    daily,
    rewards,
    tracker,
    calendar,
    sessionKind,
    sessionId,
  });
}

/* --------------------------------------------------------------- activities */

export function recoveryRide(
  passengerAboard: boolean,
  overrides: Partial<RecoverySceneActivity> = {},
): RecoverySceneActivity {
  return Object.freeze({
    activityId: 'ride-1',
    kind: 'RIDE' as const,
    vehicleId: RECOVERY_VEHICLE_ID,
    passengerAboard,
    ...overrides,
  });
}

export function recoveryChallenge(passengerAboard = false): RecoverySceneActivity {
  return Object.freeze({
    activityId: 'challenge-1',
    kind: 'CHALLENGE' as const,
    vehicleId: RECOVERY_VEHICLE_ID,
    passengerAboard,
  });
}

import { fields, requireContract, tick, ContractValidationError } from '../sessions';
import type { ContractContext } from '../sessions';
import { verifyProfileVersionChecksum } from '../profiles';
import type { ProfileVersion } from '../profiles';
import type { RecoveryRecord } from '../vehicles';
import type { createVehicleRecovery } from '../vehicles';
import { canonicalizeJson, sha256Hex } from './canonical-json';
import { PersistenceError, boundedText } from './contracts';
import type { SessionKind, SessionWorldIdentity, SessionWorldPort } from './session-kinds';

/**
 * Vehicle recovery, city reset and style restoration for PBI 226.
 *
 * Three operations with three different effects, and the module refuses to blur them:
 *
 * 1. **`recoverVehicle` (R)** repositions one controlled vehicle at a point the native 030 recovery
 *    already validated as collider-free and restores its mobility. It never touches a world epoch,
 *    the profile, the economy series, the checkpoint or the XP ledger. A ride that carries a
 *    passenger is closed exactly once with `RECOVERED_WITH_PASSENGER` and the 030 record stays in
 *    the recovery history.
 * 2. **`beginCityReset`/`commitCityReset`** rebuilds the world: closes segments and active
 *    rides/challenges once with `SCENARIO_RESET`, invalidates the jobs of the old world, advances
 *    `worldEpoch`, `learningEpoch` and `economyEpoch`, keeps the active profile version (identical
 *    checksum) and relaunches `PAUSED_AUTO`. Missions are not completed. A failed checkpoint commit
 *    keeps the previous checkpoint and leaves the world exactly as it was; a repeated reset closes
 *    nothing twice and does not duplicate bodies, listeners or rewards.
 * 3. **`restoreStyle`** activates a chosen profile version behind the real `learningEpoch` barrier.
 *    It changes neither the physical world nor the XP/daily/rewards/missions read models and never
 *    rebuilds the city.
 *
 * The module owns no clock, DOM, renderer, random source, physics world or durable store. Every
 * owner (030 recovery, 206/127 checkpoint, 109 profile, 209 economy series, 125/211/212/213
 * ledgers, 207 replay vocabulary, 065/061 ride closures) is injected as a port, so the same code
 * runs deterministically in tests, in the report and in the browser composition.
 */

export const WORLD_RECOVERY_VERSION = '226-world-recovery-v1' as const;

/** Closed operation vocabulary: three operations, never a fourth or a merged one. */
export const worldRecoveryOperations = ['VEHICLE_RECOVERY', 'CITY_RESET', 'STYLE_RESTORE'] as const;
export type WorldRecoveryOperation = (typeof worldRecoveryOperations)[number];

/** Closed refusal vocabulary; there is no open error channel. */
export const worldRecoveryCodes = [
  'INVALID_REQUEST',
  'DISPOSED',
  'BUSY',
  'FAULT',
  'HISTORY_FULL',
  'PORT_FAILED',
  'NOT_PREPARED',
  'PLAN_STALE',
  'NO_CONTROLLED_VEHICLE',
  'RECOVERY_DISABLED',
  'NO_SAFE_POINT',
  'RECOVERY_UNAVAILABLE',
  'RECOVERY_NOT_SAFE',
  'COLLIDER_PRESENT',
  'MOBILITY_NOT_RESTORED',
  'CLOSE_REFUSED',
  'DUPLICATE_CLOSURE',
  'RETRY_UNAVAILABLE',
  'XP_WITHDRAWN',
  'PROGRESS_MUTATED',
  'CAPTURE_FAILED',
  'CHECKPOINT_COMMIT_FAILED',
  'EPOCH_LIMIT',
  'ECONOMY_SERIES_MISMATCH',
  'REPLAY_REFUSED',
  'PROFILE_INVALID',
  'ALREADY_ACTIVE',
  'VERSION_NOT_FOUND',
  'STALE_LEARNING_EPOCH',
  'BARRIER_REJECTED',
  'WORLD_UNTOUCHED_VIOLATION',
] as const;
export type WorldRecoveryCode = (typeof worldRecoveryCodes)[number];

export const WORLD_RECOVERY_LIMITS = Object.freeze({
  version: WORLD_RECOVERY_VERSION,
  /** Operations of each kind retained for readback; preservation is explicit, never truncation. */
  history: 1024,
  /** Active rides/challenges a single reset may close. */
  activities: 64,
  /** History page capacity. */
  page: 64,
  /** Code units per identity. */
  idCodeUnits: 256,
  /** Epochs are safe counters; a reset past this refuses instead of wrapping. */
  maxEpoch: 2 ** 31,
});

/** The one reset reason the 065/061 lifecycle publishes, and the one failure reason R publishes. */
export const WORLD_RESET_REASON = 'SCENARIO_RESET' as const;
export const RECOVERY_WITH_PASSENGER = 'RECOVERED_WITH_PASSENGER' as const;
/** Published 207 finalize reason and discontinuity event type; the fixture asserts both. */
export const WORLD_RESET_REPLAY_FACT = 'WORLD_RESET' as const;

export interface WorldRecoveryRejection {
  readonly code: WorldRecoveryCode;
  readonly message: string;
  readonly path: string | null;
}

export interface WorldRecoveryRejected {
  readonly status: 'REJECTED';
  readonly operation: WorldRecoveryOperation;
  readonly rejection: WorldRecoveryRejection;
}

export function worldRecoveryRejection(
  code: WorldRecoveryCode,
  message: string,
  path: string | null = null,
): WorldRecoveryRejection {
  return Object.freeze({ code, message, path });
}

/* ------------------------------------------------------------------- epochs */

export interface WorldRecoveryEpochs {
  readonly worldEpoch: number;
  readonly learningEpoch: number;
  readonly economyEpoch: number;
}

export interface WorldRecoveryIdentity extends SessionWorldIdentity {
  readonly economyEpoch: number;
}

/* ----------------------------------------------------------------- vehicles */

/**
 * The exact 030 recovery surface this module drives. The real owner is
 * `createVehicleRecovery`; a different module cannot satisfy this type by name alone.
 */
export type RecoveryVehicle = Pick<
  ReturnType<typeof createVehicleRecovery>,
  'readProjection' | 'request' | 'commit' | 'readHistory'
>;

/* -------------------------------------------------------------------- world */

export interface RecoveryWorldOccupancy {
  readonly vehicles: number;
  /** Rebuilt civil traffic after `start`; decor belongs to 227 and is not counted here. */
  readonly trafficVehicles: number;
  readonly bodies: number;
  readonly listeners: number;
  readonly jobs: number;
}

/**
 * The one live physical world, expressed with the 225 `SessionWorldPort` vocabulary so the reset
 * reuses the same port the session host already speaks, plus the occupancy the reset must report.
 */
export interface RecoveryWorldPort extends SessionWorldPort {
  occupancy(identity: SessionWorldIdentity): RecoveryWorldOccupancy;
}

/* -------------------------------------------------------------------- scene */

export const recoverySceneKinds = ['RIDE', 'CHALLENGE', 'MISSION'] as const;
export type RecoverySceneKind = (typeof recoverySceneKinds)[number];

export const recoverySceneCloseReasons = [RECOVERY_WITH_PASSENGER, WORLD_RESET_REASON] as const;
export type RecoverySceneCloseReason = (typeof recoverySceneCloseReasons)[number];

export interface RecoverySceneActivity {
  readonly activityId: string;
  readonly kind: RecoverySceneKind;
  readonly vehicleId: string;
  readonly passengerAboard: boolean;
}

export interface RecoverySceneClose {
  readonly activityId: string;
  readonly kind: RecoverySceneKind;
  readonly reason: RecoverySceneCloseReason;
  readonly tick: number;
  /** A reset or a passenger recovery never invents revenue. */
  readonly revenue: 0;
  readonly terminal: true;
}

export type RecoverySceneCloseResult =
  | {
      readonly status: 'CLOSED';
      readonly close: RecoverySceneClose;
      readonly duplicates: 0;
    }
  | {
      readonly status: 'DUPLICATE';
      readonly close: RecoverySceneClose;
      readonly duplicates: 1;
    }
  | {
      readonly status: 'REJECTED';
      readonly code: 'NOT_ACTIVE' | 'ALREADY_TERMINAL' | 'WRONG_REASON' | 'FOREIGN_OWNER';
      readonly message: string;
    };

export interface RecoverySceneRetry {
  readonly status: 'AVAILABLE' | 'UNAVAILABLE';
  readonly activityId: string;
  readonly availableAtTick: number | null;
  readonly ticksWaited: 0;
  readonly blockers: readonly string[];
}

export interface RecoveryScenePort {
  active(): readonly RecoverySceneActivity[];
  close(request: {
    readonly activityId: string;
    readonly kind: RecoverySceneKind;
    readonly reason: RecoverySceneCloseReason;
    readonly tick: number;
    readonly operationId: string;
  }): RecoverySceneCloseResult;
  history(): readonly RecoverySceneClose[];
  /** Haos only: a recovered challenge declares whether R invalidated the attempt. */
  retry(request: {
    readonly activityId: string;
    readonly operationId: string;
    readonly tick: number;
  }): RecoverySceneRetry;
}

/* ------------------------------------------------------------------ ledgers */

export interface RecoveryLedgerSnapshot {
  readonly xpMicroXp: number;
  readonly daily: string;
  readonly rewards: string;
  readonly missions: string;
  /** 109 evidence digest; the reset must keep it byte-identical. */
  readonly evidence: string;
  readonly economyHistory: number;
}

export interface RecoveryEconomySeries {
  readonly previousEpoch: number;
  readonly epoch: number;
  readonly seriesId: string;
  /** Number of series retained after closing the previous one; history is never deleted. */
  readonly history: number;
}

export interface RecoveryLedgerPort {
  /** Read-only digest of the owners 125/211/212/213/109; this module never writes them. */
  snapshot(): RecoveryLedgerSnapshot;
  closeEconomySeries(request: {
    readonly sessionId: string;
    readonly previousEpoch: number;
    readonly epoch: number;
    readonly reason: typeof WORLD_RESET_REASON;
    readonly tick: number;
  }): RecoveryEconomySeries;
}

/* ------------------------------------------------------------------ profile */

export type RecoveryStyleActivation =
  | {
      readonly status: 'ACTIVATED';
      readonly version: ProfileVersion;
      readonly barrier: 'LEARNING_EPOCH';
      readonly closedSegments: number;
      /** Results of the previous learning generation refused at the barrier. */
      readonly staleResults: number;
    }
  | {
      readonly status: 'REJECTED';
      readonly code: 'VERSION_NOT_FOUND' | 'STALE_LEARNING_EPOCH' | 'BARRIER_REJECTED';
      readonly message: string;
    };

export interface RecoveryProfilePort {
  active(): ProfileVersion;
  activate(request: {
    readonly versionId: string;
    readonly learningEpoch: number;
    readonly tick: number;
    readonly reason: 'STYLE_RESTORE';
  }): RecoveryStyleActivation;
}

/* ------------------------------------------------------------------- replay */

export interface RecoveryReplayFact {
  readonly status: 'RECORDED' | 'DUPLICATE';
  readonly eventId: string;
  readonly discontinuity: true;
  readonly finalizeReason: typeof WORLD_RESET_REPLAY_FACT;
}

export interface RecoveryReplayPort {
  recordReset(request: {
    readonly sessionId: string;
    readonly previousWorldEpoch: number;
    readonly worldEpoch: number;
    readonly learningEpoch: number;
    readonly tick: number;
    readonly resetId: string;
  }): RecoveryReplayFact;
  stats(): {
    readonly resets: number;
    readonly discontinuities: number;
    readonly events: number;
  };
}

/* --------------------------------------------------------------- checkpoints */

export interface RecoveryResetCheckpoint {
  readonly version: typeof WORLD_RECOVERY_VERSION;
  readonly checkpointId: string;
  readonly sessionKind: SessionKind;
  readonly sessionId: string;
  readonly reason: typeof WORLD_RESET_REASON;
  readonly createdAt: string;
  readonly tick: number;
  readonly previous: WorldRecoveryEpochs;
  readonly next: WorldRecoveryEpochs;
  readonly closedActivities: readonly string[];
  readonly closedSegments: number;
  readonly profileId: string;
  readonly profileVersionId: string;
  readonly profileChecksum: string;
  readonly ledgerDigest: string;
  readonly launch: 'PAUSED_AUTO';
  readonly checksum: string;
}

export type RecoveryCheckpointCommit =
  | { readonly status: 'COMMITTED' }
  | {
      readonly status: 'REJECTED';
      readonly code: 'SAVE_FAILED' | 'CHECKPOINT_INVALID';
      readonly message: string;
    };

export interface RecoveryCheckpointPort {
  latest(): RecoveryResetCheckpoint | null;
  commit(document: RecoveryResetCheckpoint): RecoveryCheckpointCommit;
  read(checkpointId: string): RecoveryResetCheckpoint | null;
}

function checkpointPayload(
  document: Omit<RecoveryResetCheckpoint, 'checksum'>,
): Record<string, unknown> {
  return {
    version: document.version,
    checkpointId: document.checkpointId,
    sessionKind: document.sessionKind,
    sessionId: document.sessionId,
    reason: document.reason,
    createdAt: document.createdAt,
    tick: document.tick,
    previous: document.previous,
    next: document.next,
    closedActivities: document.closedActivities,
    closedSegments: document.closedSegments,
    profileId: document.profileId,
    profileVersionId: document.profileVersionId,
    profileChecksum: document.profileChecksum,
    ledgerDigest: document.ledgerDigest,
    launch: document.launch,
  };
}

export function computeRecoveryCheckpointChecksum(
  document: Omit<RecoveryResetCheckpoint, 'checksum'>,
): string {
  const canonical = canonicalizeJson(checkpointPayload(document), { maxDepth: 16 });
  if (canonical.status === 'REJECTED') {
    throw new PersistenceError(
      'BODY_INVALID',
      `The reset checkpoint is not canonical: ${canonical.rejection.message}`,
      'checkpoint',
    );
  }
  return `sha256:${sha256Hex(canonical.text)}`;
}

export interface MemoryRecoveryCheckpointStoreOptions {
  /** Deterministic failure injection: the next N commits answer `SAVE_FAILED`. */
  readonly failNextCommits?: number;
}

export interface MemoryRecoveryCheckpointStore extends RecoveryCheckpointPort {
  readonly commits: number;
  readonly rows: readonly RecoveryResetCheckpoint[];
}

/**
 * Deterministic in-memory checkpoint port, the same shape 225 delivered for the session store. The
 * durable IndexedDB adapter stays in the composition layer; a failed commit writes nothing, so the
 * previous checkpoint remains the latest valid one.
 */
export function createMemoryRecoveryCheckpointStore(
  options: MemoryRecoveryCheckpointStoreOptions = {},
): MemoryRecoveryCheckpointStore {
  const rows: RecoveryResetCheckpoint[] = [];
  let failNextCommits = tick(options.failNextCommits ?? 0);
  let commits = 0;
  return {
    get commits() {
      return commits;
    },
    get rows() {
      return Object.freeze([...rows]);
    },
    latest() {
      return rows.at(-1) ?? null;
    },
    commit(document) {
      if (failNextCommits > 0) {
        failNextCommits -= 1;
        return Object.freeze({
          status: 'REJECTED' as const,
          code: 'SAVE_FAILED' as const,
          message: 'The storage adapter refused the reset checkpoint',
        });
      }
      if (rows.some((row) => row.checkpointId === document.checkpointId)) {
        return Object.freeze({ status: 'COMMITTED' as const });
      }
      if (document.checksum !== computeRecoveryCheckpointChecksum(document)) {
        return Object.freeze({
          status: 'REJECTED' as const,
          code: 'CHECKPOINT_INVALID' as const,
          message: 'The reset checkpoint checksum does not match its content',
        });
      }
      rows.push(Object.freeze({ ...document }));
      commits += 1;
      return Object.freeze({ status: 'COMMITTED' as const });
    },
    read(checkpointId) {
      return rows.find((row) => row.checkpointId === checkpointId) ?? null;
    },
  };
}

/* ------------------------------------------------------------------ results */

export interface VehicleRecovered {
  readonly status: 'RECOVERED';
  readonly operation: 'VEHICLE_RECOVERY';
  readonly operationId: string;
  readonly tick: number;
  readonly sessionKind: SessionKind;
  readonly worldEpoch: number;
  readonly learningEpoch: number;
  readonly economyEpoch: number;
  readonly origin: 'R' | 'HUD';
  readonly mode: 'MANUAL' | 'LEARNING';
  readonly pointId: string;
  readonly laneId: string;
  readonly mapId: string;
  readonly access: 'TAXI' | 'CIVIL';
  /** The native 030 inspection placed the body with zero colliders. */
  readonly colliderCount: 0;
  readonly mobilityRestored: true;
  readonly requestedTick: number;
  readonly acceptedTick: number;
  readonly ticksToMobility: number;
  readonly stages: number;
  readonly xpBeforeMicroXp: number;
  readonly xpAfterMicroXp: number;
  readonly xpDeltaMicroXp: number;
  readonly closedActivities: readonly RecoverySceneClose[];
  readonly retries: readonly RecoverySceneRetry[];
  readonly historyLength: number;
  readonly record: RecoveryRecord;
}

export type VehicleRecoveryOutcome = VehicleRecovered | WorldRecoveryRejected;

export interface CityResetPlan {
  readonly resetId: string;
  readonly tick: number;
  readonly previous: WorldRecoveryEpochs;
  readonly next: WorldRecoveryEpochs;
  readonly activeActivities: readonly string[];
  readonly checkpointId: string;
  readonly checkpointChecksum: string;
}

export interface CityResetPrepared {
  readonly status: 'PREPARED';
  readonly operation: 'CITY_RESET';
  readonly resetId: string;
  readonly plan: CityResetPlan;
}

export type CityResetPreparation = CityResetPrepared | WorldRecoveryRejected;

export interface CityResetCommitted {
  readonly status: 'RESET';
  readonly operation: 'CITY_RESET';
  readonly resetId: string;
  readonly tick: number;
  readonly sessionKind: SessionKind;
  readonly previous: WorldRecoveryEpochs;
  readonly epochs: WorldRecoveryEpochs;
  readonly checkpointId: string;
  readonly checkpointChecksum: string;
  readonly previousCheckpointId: string | null;
  readonly closedSegments: number;
  readonly invalidatedJobs: number;
  readonly releasedInputs: number;
  readonly closedActivities: readonly RecoverySceneClose[];
  readonly duplicateClosures: number;
  readonly economySeries: RecoveryEconomySeries;
  readonly replay: RecoveryReplayFact;
  readonly launch: 'PAUSED_AUTO';
  readonly occupancy: RecoveryWorldOccupancy;
  readonly profile: Readonly<{
    readonly profileId: string;
    readonly versionId: string;
    readonly checksum: string;
  }>;
  readonly preserved: Readonly<{
    readonly profile: boolean;
    readonly evidence: boolean;
    readonly xp: boolean;
    readonly daily: boolean;
    readonly rewards: boolean;
    readonly missions: boolean;
    readonly economyHistory: boolean;
  }>;
  readonly xpMicroXp: number;
  readonly missionCompletions: 0;
  readonly rewardGrants: 0;
  readonly historyLength: number;
}

export interface CityResetPartial {
  readonly status: 'PARTIAL';
  readonly operation: 'CITY_RESET';
  readonly resetId: string;
  readonly stage: string;
  readonly failure: string;
}

export type CityResetCommitOutcome = CityResetCommitted | CityResetPartial | WorldRecoveryRejected;

export interface StyleRestored {
  readonly status: 'RESTORED';
  readonly operation: 'STYLE_RESTORE';
  readonly tick: number;
  readonly sessionKind: SessionKind;
  readonly profile: Readonly<{
    readonly profileId: string;
    readonly previousVersionId: string;
    readonly previousChecksum: string;
    readonly versionId: string;
    readonly checksum: string;
  }>;
  readonly barrier: 'LEARNING_EPOCH';
  readonly learningEpoch: Readonly<{ readonly previous: number; readonly next: number }>;
  readonly worldEpoch: number;
  readonly economyEpoch: number;
  readonly closedSegments: number;
  readonly staleResults: number;
  readonly worldUntouched: true;
  readonly preserved: Readonly<{
    readonly xp: boolean;
    readonly daily: boolean;
    readonly rewards: boolean;
    readonly missions: boolean;
    readonly economyHistory: boolean;
    readonly world: boolean;
  }>;
  readonly xpMicroXp: number;
  readonly historyLength: number;
}

export type StyleRestoreOutcome = StyleRestored | WorldRecoveryRejected;

export interface WorldRecoveryStatus {
  readonly version: typeof WORLD_RECOVERY_VERSION;
  readonly sessionKind: SessionKind;
  readonly sessionId: string;
  readonly epochs: WorldRecoveryEpochs;
  readonly prepared: CityResetPlan | null;
  readonly disposed: boolean;
  readonly fault: string | null;
  readonly recoveries: number;
  readonly resets: number;
  readonly styleRestores: number;
  readonly failedResets: number;
  readonly recoveriesRetained: number;
  readonly resetsRetained: number;
  readonly styleRestoresRetained: number;
  readonly economyHistory: number;
  readonly checkpoints: number;
}

export interface WorldRecoveryOptions {
  readonly sessionKind: SessionKind;
  readonly sessionId: string;
  readonly epochs: WorldRecoveryEpochs;
  /** The 030 instance of the *current* world; a city reset recreates it, so it is a provider. */
  readonly recovery: () => RecoveryVehicle;
  readonly world: RecoveryWorldPort;
  readonly scene: RecoveryScenePort;
  readonly ledgers: RecoveryLedgerPort;
  readonly profile: RecoveryProfilePort;
  readonly replay: RecoveryReplayPort;
  readonly checkpoints: RecoveryCheckpointPort;
  /** Explicit clock; the module never reads a wall clock itself. */
  readonly now: () => string;
}

export interface WorldRecovery {
  /** R: reposition one vehicle at a validated collider-free point and restore mobility. */
  recoverVehicle(request: unknown): VehicleRecoveryOutcome;
  /** Reset, step 1 of 2: validate and stage; nothing visible changes yet. */
  beginCityReset(request: unknown): CityResetPreparation;
  /** Reset, step 2 of 2: durable checkpoint first, then the new world; resumable by stage. */
  commitCityReset(): CityResetCommitOutcome;
  cancelCityReset(): boolean;
  /** Style only: activate a profile version behind the learningEpoch barrier. */
  restoreStyle(request: unknown): StyleRestoreOutcome;
  readHistory(
    operation: WorldRecoveryOperation,
    offset?: number,
    limit?: number,
  ): readonly (VehicleRecovered | CityResetCommitted | StyleRestored)[];
  status(): WorldRecoveryStatus;
  dispose(): void;
}

/* ---------------------------------------------------------------- internals */

function codeText(value: unknown, path: string): string {
  return boundedText(value, path, WORLD_RECOVERY_LIMITS.idCodeUnits);
}

function epochOf(value: unknown, path: string): number {
  const epoch = tick(value);
  requireContract(epoch <= WORLD_RECOVERY_LIMITS.maxEpoch, `${path} exceeds the epoch ceiling`);
  return epoch;
}

function readEpochs(value: unknown, path: string): WorldRecoveryEpochs {
  const data = fields(value, ['worldEpoch', 'learningEpoch', 'economyEpoch']);
  return Object.freeze({
    worldEpoch: epochOf(data.worldEpoch, `${path}.worldEpoch`),
    learningEpoch: epochOf(data.learningEpoch, `${path}.learningEpoch`),
    economyEpoch: epochOf(data.economyEpoch, `${path}.economyEpoch`),
  });
}

function readSessionKind(value: unknown, path: string): SessionKind {
  if (value !== 'ACADEMY' && value !== 'CHAOS') {
    throw new PersistenceError('INVALID_RECORD', 'Expected a session kind', path);
  }
  return value;
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function sameOccupancy(left: RecoveryWorldOccupancy, right: RecoveryWorldOccupancy): boolean {
  return (
    left.vehicles === right.vehicles &&
    left.trafficVehicles === right.trafficVehicles &&
    left.bodies === right.bodies &&
    left.listeners === right.listeners &&
    left.jobs === right.jobs
  );
}

function sameActivityPlan(
  planned: readonly RecoverySceneActivity[],
  actual: readonly RecoverySceneActivity[],
): boolean {
  const key = (activity: RecoverySceneActivity) =>
    `${activity.activityId}|${activity.kind}|${activity.vehicleId}|${String(activity.passengerAboard)}`;
  const left = planned.map(key).sort(),
    right = actual.map(key).sort();
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function ledgerDigest(snapshot: RecoveryLedgerSnapshot): string {
  const canonical = canonicalizeJson({
    xpMicroXp: snapshot.xpMicroXp,
    daily: snapshot.daily,
    rewards: snapshot.rewards,
    missions: snapshot.missions,
    evidence: snapshot.evidence,
  });
  if (canonical.status === 'REJECTED') {
    throw new PersistenceError(
      'BODY_INVALID',
      `The ledger snapshot is not canonical: ${canonical.rejection.message}`,
      'ledgers',
    );
  }
  return `sha256:${sha256Hex(canonical.text)}`;
}

interface PreparedReset {
  readonly resetId: string;
  readonly tick: number;
  readonly previous: WorldRecoveryEpochs;
  readonly next: WorldRecoveryEpochs;
  readonly activities: readonly RecoverySceneActivity[];
  readonly previousOccupancy: RecoveryWorldOccupancy;
  readonly previousLedgers: RecoveryLedgerSnapshot;
  readonly profile: Readonly<{ profileId: string; versionId: string; checksum: string }>;
  readonly previousCheckpointId: string | null;
  readonly checkpoint: RecoveryResetCheckpoint;
  stages: number;
  closedSegments: number;
  invalidatedJobs: number;
  releasedInputs: number;
  duplicateClosures: number;
  closedActivities: RecoverySceneClose[];
  economySeries: RecoveryEconomySeries | null;
  occupancy: RecoveryWorldOccupancy | null;
  replay: RecoveryReplayFact | null;
  preserved: CityResetCommitted['preserved'] | null;
  faultStage: string | null;
}

const RESET_STAGES = [
  'CHECKPOINT',
  'CLOSE_SEGMENT',
  'INVALIDATE_JOBS',
  'CLOSE_ACTIVITIES',
  'ECONOMY_SERIES',
  'WORLD_REBUILD',
  'REPLAY_DISCONTINUITY',
  'VERIFY_PRESERVED',
] as const;

export function createWorldRecovery(options: WorldRecoveryOptions): WorldRecovery {
  const sessionKind = readSessionKind(options.sessionKind, 'sessionKind');
  const sessionId = codeText(options.sessionId, 'sessionId');
  let epochs = readEpochs(options.epochs, 'epochs');
  requireContract(
    typeof options.recovery === 'function' &&
      typeof options.world?.start === 'function' &&
      typeof options.world?.occupancy === 'function' &&
      typeof options.world?.invalidateJobs === 'function' &&
      typeof options.world?.releaseInput === 'function' &&
      typeof options.world?.closeSegment === 'function' &&
      typeof options.scene?.active === 'function' &&
      typeof options.scene?.close === 'function' &&
      typeof options.scene?.history === 'function' &&
      typeof options.scene?.retry === 'function' &&
      typeof options.ledgers?.snapshot === 'function' &&
      typeof options.ledgers?.closeEconomySeries === 'function' &&
      typeof options.profile?.active === 'function' &&
      typeof options.profile?.activate === 'function' &&
      typeof options.replay?.recordReset === 'function' &&
      typeof options.checkpoints?.commit === 'function' &&
      typeof options.now === 'function',
    'World recovery needs every real owner port',
  );

  const recoveries: VehicleRecovered[] = [];
  const resets: CityResetCommitted[] = [];
  const styleRestores: StyleRestored[] = [];
  let prepared: PreparedReset | null = null;
  let busy = false;
  let disposed = false;
  let fault: string | null = null;
  let resetsCommitted = 0;
  let failedResets = 0;

  function identityOf(value: WorldRecoveryEpochs): SessionWorldIdentity {
    return Object.freeze({
      sessionKind,
      sessionId,
      worldEpoch: value.worldEpoch,
      learningEpoch: value.learningEpoch,
    });
  }

  function contextOf(value: WorldRecoveryEpochs): ContractContext {
    return Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId,
      worldEpoch: value.worldEpoch,
    });
  }

  function reject(
    operation: WorldRecoveryOperation,
    code: WorldRecoveryCode,
    message: string,
    path: string | null = null,
  ): WorldRecoveryRejected {
    return Object.freeze({
      status: 'REJECTED' as const,
      operation,
      rejection: worldRecoveryRejection(code, message, path),
    });
  }

  function run<T>(
    operation: WorldRecoveryOperation,
    work: () => T | WorldRecoveryRejected,
    allowDuringFault = false,
  ): T | WorldRecoveryRejected {
    if (disposed) return reject(operation, 'DISPOSED', 'The world recovery is disposed');
    if (busy) return reject(operation, 'BUSY', 'Another recovery operation is running');
    if (fault !== null && !allowDuringFault) {
      return reject(operation, 'FAULT', `An unfinished city reset must resume: ${fault}`);
    }
    busy = true;
    try {
      return work();
    } catch (error) {
      const code: WorldRecoveryCode =
        error instanceof ContractValidationError ? 'INVALID_REQUEST' : 'PORT_FAILED';
      return reject(operation, code, describe(error));
    } finally {
      busy = false;
    }
  }

  function full(operation: WorldRecoveryOperation, length: number): WorldRecoveryRejected | null {
    return length >= WORLD_RECOVERY_LIMITS.history
      ? reject(
          operation,
          'HISTORY_FULL',
          'The recovery history is full; preserve or export it before resuming',
        )
      : null;
  }

  function status(): WorldRecoveryStatus {
    return Object.freeze({
      version: WORLD_RECOVERY_VERSION,
      sessionKind,
      sessionId,
      epochs: Object.freeze({ ...epochs }),
      prepared: prepared === null ? null : planOf(prepared),
      disposed,
      fault,
      recoveries: recoveries.length,
      resets: resetsCommitted,
      styleRestores: styleRestores.length,
      failedResets,
      recoveriesRetained: recoveries.length,
      resetsRetained: resets.length,
      styleRestoresRetained: styleRestores.length,
      economyHistory: options.ledgers.snapshot().economyHistory,
      checkpoints: options.checkpoints.latest() === null ? 0 : 1,
    });
  }

  function planOf(value: PreparedReset): CityResetPlan {
    return Object.freeze({
      resetId: value.resetId,
      tick: value.tick,
      previous: Object.freeze({ ...value.previous }),
      next: Object.freeze({ ...value.next }),
      activeActivities: Object.freeze(value.activities.map((activity) => activity.activityId)),
      checkpointId: value.checkpoint.checkpointId,
      checkpointChecksum: value.checkpoint.checksum,
    });
  }

  /* ------------------------------------------------------------------ R only */

  function recoverVehicle(value: unknown): VehicleRecoveryOutcome {
    return run('VEHICLE_RECOVERY', () => {
      const historyFull = full('VEHICLE_RECOVERY', recoveries.length);
      if (historyFull !== null) return historyFull;
      const data = fields(value, ['tick', 'origin']);
      const at = tick(data.tick);
      if (data.origin !== 'R' && data.origin !== 'HUD') {
        return reject(
          'VEHICLE_RECOVERY',
          'INVALID_REQUEST',
          'Expected the R or HUD origin',
          'origin',
        );
      }
      if (prepared !== null) {
        return reject(
          'VEHICLE_RECOVERY',
          'BUSY',
          'A city reset is prepared; commit or cancel it first',
        );
      }
      const vehicle = options.recovery();
      const projection = vehicle.readProjection();
      if (projection.identity === null || projection.mode === null) {
        return reject('VEHICLE_RECOVERY', 'NO_CONTROLLED_VEHICLE', 'R needs one controlled seat');
      }
      if (!projection.enabled || projection.fault !== null) {
        return reject('VEHICLE_RECOVERY', 'RECOVERY_DISABLED', 'The 030 recovery is not enabled');
      }
      if (!projection.available || projection.pointId === null) {
        return reject(
          'VEHICLE_RECOVERY',
          'NO_SAFE_POINT',
          'No validated collider-free recovery point is available',
          'pointId',
        );
      }
      const before = options.ledgers.snapshot();
      const context = contextOf(epochs);
      const operationId = vehicle.request({
        context,
        identity: projection.identity,
        mode: projection.mode,
        tick: at,
        origin: data.origin,
      });
      const record = vehicle.commit(at);
      if (record === null || typeof record === 'string') {
        return reject(
          'VEHICLE_RECOVERY',
          record === 'NO_VALID_POINT' ? 'NO_SAFE_POINT' : 'RECOVERY_UNAVAILABLE',
          `The 030 recovery answered ${String(record)}`,
        );
      }
      if (record.status !== 'COMPLETED' || record.placement === null) {
        return reject(
          'VEHICLE_RECOVERY',
          'RECOVERY_NOT_SAFE',
          `The 030 recovery finished as ${record.status}`,
          'record.status',
        );
      }
      if (record.placement.status !== 'SAFE') {
        return reject(
          'VEHICLE_RECOVERY',
          'RECOVERY_NOT_SAFE',
          `The native inspection refused the point: ${record.placement.status}`,
          'record.placement.status',
        );
      }
      if (record.placement.colliderCount !== 0) {
        return reject(
          'VEHICLE_RECOVERY',
          'COLLIDER_PRESENT',
          `The point holds ${String(record.placement.colliderCount)} colliders`,
          'record.placement.colliderCount',
        );
      }
      if (record.placement.after === null) {
        return reject(
          'VEHICLE_RECOVERY',
          'MOBILITY_NOT_RESTORED',
          'The native placement did not publish the restored state',
          'record.placement.after',
        );
      }

      const closedActivities: RecoverySceneClose[] = [];
      for (const activity of options.scene.active()) {
        if (activity.vehicleId !== record.vehicleId || !activity.passengerAboard) continue;
        if (activity.kind === 'MISSION') continue;
        const closed = options.scene.close({
          activityId: activity.activityId,
          kind: activity.kind,
          reason: RECOVERY_WITH_PASSENGER,
          tick: at,
          operationId,
        });
        if (closed.status === 'REJECTED') {
          return reject('VEHICLE_RECOVERY', 'CLOSE_REFUSED', closed.message, 'scene.close');
        }
        if (closed.status === 'DUPLICATE') {
          return reject(
            'VEHICLE_RECOVERY',
            'DUPLICATE_CLOSURE',
            'The ride was already closed for this recovery',
            'scene.close',
          );
        }
        closedActivities.push(closed.close);
      }

      const retries: RecoverySceneRetry[] = [];
      if (sessionKind === 'CHAOS') {
        for (const close of closedActivities) {
          if (close.kind !== 'CHALLENGE') continue;
          const retry = options.scene.retry({
            activityId: close.activityId,
            operationId,
            tick: at,
          });
          if (retry.status !== 'AVAILABLE' || retry.ticksWaited !== 0) {
            return reject(
              'VEHICLE_RECOVERY',
              'RETRY_UNAVAILABLE',
              `The Haos retry is not immediate for ${close.activityId}`,
              'scene.retry',
            );
          }
          retries.push(retry);
        }
      }

      const after = options.ledgers.snapshot();
      if (after.xpMicroXp < before.xpMicroXp) {
        return reject(
          'VEHICLE_RECOVERY',
          'XP_WITHDRAWN',
          `R withdrew ${String(before.xpMicroXp - after.xpMicroXp)} micro-XP`,
          'ledgers.xpMicroXp',
        );
      }
      if (
        after.daily !== before.daily ||
        after.rewards !== before.rewards ||
        after.missions !== before.missions ||
        after.evidence !== before.evidence
      ) {
        return reject(
          'VEHICLE_RECOVERY',
          'PROGRESS_MUTATED',
          'R must not change the daily, rewards, missions or profile evidence',
        );
      }

      const result: VehicleRecovered = Object.freeze({
        status: 'RECOVERED' as const,
        operation: 'VEHICLE_RECOVERY' as const,
        operationId,
        tick: at,
        sessionKind,
        worldEpoch: epochs.worldEpoch,
        learningEpoch: epochs.learningEpoch,
        economyEpoch: epochs.economyEpoch,
        origin: data.origin,
        mode: projection.mode,
        pointId: record.pointId,
        laneId: record.laneId,
        mapId: record.mapId,
        access: record.access,
        colliderCount: 0 as const,
        mobilityRestored: true as const,
        requestedTick: record.requestedTick,
        acceptedTick: record.acceptedTick,
        ticksToMobility: record.acceptedTick - record.requestedTick,
        stages: record.deliveredStages,
        xpBeforeMicroXp: before.xpMicroXp,
        xpAfterMicroXp: after.xpMicroXp,
        xpDeltaMicroXp: after.xpMicroXp - before.xpMicroXp,
        closedActivities: Object.freeze(closedActivities),
        retries: Object.freeze(retries),
        historyLength: recoveries.length + 1,
        record,
      });
      recoveries.push(result);
      return result;
    });
  }

  /* -------------------------------------------------------------- reset only */

  function beginCityReset(value: unknown): CityResetPreparation {
    return run('CITY_RESET', () => {
      const historyFull = full('CITY_RESET', resets.length);
      if (historyFull !== null) return historyFull;
      const data = fields(value, ['tick']);
      const at = tick(data.tick);
      if (prepared !== null) {
        return reject('CITY_RESET', 'BUSY', 'A city reset is already prepared');
      }
      const nextWorldEpoch = epochs.worldEpoch + 1;
      const nextLearningEpoch = epochs.learningEpoch + 1;
      const nextEconomyEpoch = epochs.economyEpoch + 1;
      if (
        nextWorldEpoch > WORLD_RECOVERY_LIMITS.maxEpoch ||
        nextLearningEpoch > WORLD_RECOVERY_LIMITS.maxEpoch ||
        nextEconomyEpoch > WORLD_RECOVERY_LIMITS.maxEpoch
      ) {
        return reject('CITY_RESET', 'EPOCH_LIMIT', 'The reset would pass the epoch ceiling');
      }
      const next: WorldRecoveryEpochs = Object.freeze({
        worldEpoch: epochOf(nextWorldEpoch, 'worldEpoch'),
        learningEpoch: epochOf(nextLearningEpoch, 'learningEpoch'),
        economyEpoch: epochOf(nextEconomyEpoch, 'economyEpoch'),
      });
      const activities = Object.freeze(
        [...options.scene.active()].sort((left, right) =>
          left.activityId < right.activityId ? -1 : left.activityId > right.activityId ? 1 : 0,
        ),
      );
      requireContract(
        activities.length <= WORLD_RECOVERY_LIMITS.activities,
        'The reset plan exceeds the active activity capacity',
      );
      const profileVersion = options.profile.active();
      if (!verifyProfileVersionChecksum(profileVersion)) {
        return reject(
          'CITY_RESET',
          'PROFILE_INVALID',
          'The active profile version fails its 109 checksum',
          'profile',
        );
      }
      const ledgers = options.ledgers.snapshot();
      let occupancy: RecoveryWorldOccupancy;
      try {
        occupancy = options.world.occupancy(identityOf(epochs));
      } catch (error) {
        return reject(
          'CITY_RESET',
          'CAPTURE_FAILED',
          `The live world could not be captured: ${describe(error)}`,
          'world.occupancy',
        );
      }
      const previousCheckpoint = options.checkpoints.latest();
      const resetId = `reset:${sessionId}:${String(next.worldEpoch)}`;
      const draft = {
        version: WORLD_RECOVERY_VERSION,
        checkpointId: resetId,
        sessionKind,
        sessionId,
        reason: WORLD_RESET_REASON,
        createdAt: codeText(options.now(), 'now'),
        tick: at,
        previous: Object.freeze({ ...epochs }),
        next,
        closedActivities: Object.freeze(activities.map((activity) => activity.activityId)),
        closedSegments: 0,
        profileId: profileVersion.profileId,
        profileVersionId: profileVersion.versionId,
        profileChecksum: profileVersion.checksum,
        ledgerDigest: ledgerDigest(ledgers),
        launch: 'PAUSED_AUTO' as const,
      };
      const checkpoint: RecoveryResetCheckpoint = Object.freeze({
        ...draft,
        checksum: computeRecoveryCheckpointChecksum(draft),
      });
      prepared = {
        resetId,
        tick: at,
        previous: Object.freeze({ ...epochs }),
        next,
        activities,
        previousOccupancy: occupancy,
        previousLedgers: ledgers,
        profile: Object.freeze({
          profileId: profileVersion.profileId,
          versionId: profileVersion.versionId,
          checksum: profileVersion.checksum,
        }),
        previousCheckpointId: previousCheckpoint === null ? null : previousCheckpoint.checkpointId,
        checkpoint,
        stages: 0,
        closedSegments: 0,
        invalidatedJobs: 0,
        releasedInputs: 0,
        duplicateClosures: 0,
        closedActivities: [],
        economySeries: null,
        occupancy: null,
        replay: null,
        preserved: null,
        faultStage: null,
      };
      return Object.freeze({
        status: 'PREPARED' as const,
        operation: 'CITY_RESET' as const,
        resetId,
        plan: planOf(prepared),
      });
    });
  }

  function commitCityReset(): CityResetCommitOutcome {
    return run(
      'CITY_RESET',
      () => {
        if (prepared === null) {
          return reject('CITY_RESET', 'NOT_PREPARED', 'No city reset was prepared');
        }
        const plan = prepared;
        const oldIdentity = identityOf(plan.previous);
        const newIdentity = identityOf(plan.next);
        let stage = RESET_STAGES[plan.stages] ?? 'VERIFY_PRESERVED';
        try {
          if (plan.stages === 0 && !sameActivityPlan(plan.activities, options.scene.active())) {
            return reject(
              'CITY_RESET',
              'PLAN_STALE',
              'The active rides/challenges changed after prepare; prepare again',
              'scene.active',
            );
          }

          stage = RESET_STAGES[plan.stages] ?? 'VERIFY_PRESERVED';
          if (plan.stages < 1) {
            const committed = options.checkpoints.commit(plan.checkpoint);
            if (committed.status === 'REJECTED') {
              failedResets += 1;
              return reject(
                'CITY_RESET',
                'CHECKPOINT_COMMIT_FAILED',
                committed.message,
                'checkpoints.commit',
              );
            }
            plan.stages = 1;
          }

          stage = RESET_STAGES[plan.stages] ?? 'VERIFY_PRESERVED';
          if (plan.stages < 2) {
            plan.closedSegments = options.world.closeSegment(oldIdentity);
            plan.stages = 2;
          }

          stage = RESET_STAGES[plan.stages] ?? 'VERIFY_PRESERVED';
          if (plan.stages < 3) {
            plan.invalidatedJobs = options.world.invalidateJobs(oldIdentity, 'WORLD_RESET');
            plan.releasedInputs = options.world.releaseInput(oldIdentity);
            plan.stages = 3;
          }

          stage = RESET_STAGES[plan.stages] ?? 'VERIFY_PRESERVED';
          if (plan.stages < 4) {
            for (const activity of plan.activities) {
              const closed = options.scene.close({
                activityId: activity.activityId,
                kind: activity.kind,
                reason: WORLD_RESET_REASON,
                tick: plan.tick,
                operationId: plan.resetId,
              });
              if (closed.status === 'REJECTED') {
                return reject('CITY_RESET', 'CLOSE_REFUSED', closed.message, 'scene.close');
              }
              if (closed.close.reason !== WORLD_RESET_REASON) {
                return reject(
                  'CITY_RESET',
                  'CLOSE_REFUSED',
                  'The scene published another terminal reason',
                  'scene.close',
                );
              }
              if (closed.status === 'DUPLICATE') {
                plan.duplicateClosures += 1;
                continue;
              }
              plan.closedActivities.push(closed.close);
            }
            plan.stages = 4;
          }

          stage = RESET_STAGES[plan.stages] ?? 'VERIFY_PRESERVED';
          if (plan.stages < 5) {
            const series = options.ledgers.closeEconomySeries({
              sessionId,
              previousEpoch: plan.previous.economyEpoch,
              epoch: plan.next.economyEpoch,
              reason: WORLD_RESET_REASON,
              tick: plan.tick,
            });
            if (series.previousEpoch !== plan.previous.economyEpoch) {
              return reject(
                'CITY_RESET',
                'ECONOMY_SERIES_MISMATCH',
                `The economy closed epoch ${String(series.previousEpoch)} instead of ${String(plan.previous.economyEpoch)}`,
                'economySeries.previousEpoch',
              );
            }
            if (series.epoch !== plan.next.economyEpoch) {
              return reject(
                'CITY_RESET',
                'ECONOMY_SERIES_MISMATCH',
                `The economy opened epoch ${String(series.epoch)} instead of ${String(plan.next.economyEpoch)}`,
                'economySeries.epoch',
              );
            }
            if (series.history !== plan.previousLedgers.economyHistory + 1) {
              return reject(
                'CITY_RESET',
                'ECONOMY_SERIES_MISMATCH',
                'The closed series was not retained in the economy history',
                'economySeries.history',
              );
            }
            plan.economySeries = series;
            plan.stages = 5;
          }

          stage = RESET_STAGES[plan.stages] ?? 'VERIFY_PRESERVED';
          if (plan.stages < 6) {
            options.world.stop(oldIdentity);
            options.world.start({
              ...newIdentity,
              profileId: plan.profile.profileId,
              launch: 'PAUSED_AUTO',
            });
            plan.occupancy = options.world.occupancy(newIdentity);
            epochs = plan.next;
            plan.stages = 6;
          }

          stage = RESET_STAGES[plan.stages] ?? 'VERIFY_PRESERVED';
          if (plan.stages < 7) {
            const replay = options.replay.recordReset({
              sessionId,
              previousWorldEpoch: plan.previous.worldEpoch,
              worldEpoch: plan.next.worldEpoch,
              learningEpoch: plan.next.learningEpoch,
              tick: plan.tick,
              resetId: plan.resetId,
            });
            if (
              replay.discontinuity !== true ||
              replay.finalizeReason !== WORLD_RESET_REPLAY_FACT
            ) {
              return reject(
                'CITY_RESET',
                'REPLAY_REFUSED',
                'The recorder did not mark the world discontinuity',
                'replay.recordReset',
              );
            }
            plan.replay = replay;
            plan.stages = 7;
          }

          stage = RESET_STAGES[plan.stages] ?? 'VERIFY_PRESERVED';
          if (plan.stages < 8) {
            const afterLedgers = options.ledgers.snapshot();
            const afterProfile = options.profile.active();
            const preserved = Object.freeze({
              profile:
                afterProfile.profileId === plan.profile.profileId &&
                afterProfile.versionId === plan.profile.versionId &&
                afterProfile.checksum === plan.profile.checksum,
              evidence: afterLedgers.evidence === plan.previousLedgers.evidence,
              xp: afterLedgers.xpMicroXp === plan.previousLedgers.xpMicroXp,
              daily: afterLedgers.daily === plan.previousLedgers.daily,
              rewards: afterLedgers.rewards === plan.previousLedgers.rewards,
              missions: afterLedgers.missions === plan.previousLedgers.missions,
              economyHistory:
                afterLedgers.economyHistory === plan.previousLedgers.economyHistory + 1,
            });
            if (Object.values(preserved).some((value) => !value)) {
              fault = `${plan.resetId}: the preserved owners changed during the reset`;
              plan.faultStage = 'VERIFY_PRESERVED';
              return Object.freeze({
                status: 'PARTIAL' as const,
                operation: 'CITY_RESET' as const,
                resetId: plan.resetId,
                stage: 'VERIFY_PRESERVED',
                failure: fault,
              });
            }
            plan.preserved = preserved;
            plan.stages = 8;
          }

          const economySeries = plan.economySeries;
          const occupancy = plan.occupancy;
          const replay = plan.replay;
          const preserved = plan.preserved;
          if (
            economySeries === null ||
            occupancy === null ||
            replay === null ||
            preserved === null
          ) {
            throw new PersistenceError('INVALID_RECORD', 'The reset stages are incomplete');
          }
          const result: CityResetCommitted = Object.freeze({
            status: 'RESET' as const,
            operation: 'CITY_RESET' as const,
            resetId: plan.resetId,
            tick: plan.tick,
            sessionKind,
            previous: plan.previous,
            epochs: plan.next,
            checkpointId: plan.checkpoint.checkpointId,
            checkpointChecksum: plan.checkpoint.checksum,
            previousCheckpointId: plan.previousCheckpointId,
            closedSegments: plan.closedSegments,
            invalidatedJobs: plan.invalidatedJobs,
            releasedInputs: plan.releasedInputs,
            closedActivities: Object.freeze([...plan.closedActivities]),
            duplicateClosures: plan.duplicateClosures,
            economySeries,
            replay,
            launch: 'PAUSED_AUTO' as const,
            occupancy,
            profile: plan.profile,
            preserved,
            xpMicroXp: plan.previousLedgers.xpMicroXp,
            missionCompletions: 0 as const,
            rewardGrants: 0 as const,
            historyLength: resets.length + 1,
          });
          resets.push(result);
          resetsCommitted += 1;
          prepared = null;
          fault = null;
          return result;
        } catch (error) {
          const reason = describe(error);
          fault = `${plan.resetId}: ${stage}: ${reason}`;
          plan.faultStage = stage;
          return Object.freeze({
            status: 'PARTIAL' as const,
            operation: 'CITY_RESET' as const,
            resetId: plan.resetId,
            stage,
            failure: reason,
          });
        }
      },
      true,
    );
  }

  /* -------------------------------------------------------------- style only */

  function restoreStyle(value: unknown): StyleRestoreOutcome {
    return run('STYLE_RESTORE', () => {
      const historyFull = full('STYLE_RESTORE', styleRestores.length);
      if (historyFull !== null) return historyFull;
      const data = fields(value, ['tick', 'versionId']);
      const at = tick(data.tick);
      const versionId = codeText(data.versionId, 'versionId');
      if (prepared !== null) {
        return reject(
          'STYLE_RESTORE',
          'BUSY',
          'A city reset is prepared; the style is restored after it commits or is cancelled',
        );
      }
      const previous = options.profile.active();
      if (!verifyProfileVersionChecksum(previous)) {
        return reject(
          'STYLE_RESTORE',
          'PROFILE_INVALID',
          'The active profile version fails its 109 checksum',
          'profile',
        );
      }
      if (previous.versionId === versionId) {
        return reject(
          'STYLE_RESTORE',
          'ALREADY_ACTIVE',
          'The requested version is already active; no second barrier is opened',
          'versionId',
        );
      }
      const occupancyBefore = options.world.occupancy(identityOf(epochs));
      const ledgersBefore = options.ledgers.snapshot();
      const activation = options.profile.activate({
        versionId,
        learningEpoch: epochs.learningEpoch,
        tick: at,
        reason: 'STYLE_RESTORE',
      });
      if (activation.status === 'REJECTED') {
        return reject('STYLE_RESTORE', activation.code, activation.message, 'profile.activate');
      }
      if (activation.barrier !== 'LEARNING_EPOCH') {
        return reject(
          'STYLE_RESTORE',
          'BARRIER_REJECTED',
          'The activation did not open the learningEpoch barrier',
          'profile.activate',
        );
      }
      if (!verifyProfileVersionChecksum(activation.version)) {
        return reject(
          'STYLE_RESTORE',
          'PROFILE_INVALID',
          'The activated version fails its 109 checksum',
          'profile.activate',
        );
      }
      if (
        activation.version.versionId !== versionId ||
        activation.version.profileId !== previous.profileId
      ) {
        return reject(
          'STYLE_RESTORE',
          'PROFILE_INVALID',
          'The activation returned a different version or profile',
          'profile.activate',
        );
      }
      const occupancyAfter = options.world.occupancy(identityOf(epochs));
      const ledgersAfter = options.ledgers.snapshot();
      const preserved = Object.freeze({
        xp: ledgersAfter.xpMicroXp === ledgersBefore.xpMicroXp,
        daily: ledgersAfter.daily === ledgersBefore.daily,
        rewards: ledgersAfter.rewards === ledgersBefore.rewards,
        missions: ledgersAfter.missions === ledgersBefore.missions,
        economyHistory: ledgersAfter.economyHistory === ledgersBefore.economyHistory,
        world: sameOccupancy(occupancyBefore, occupancyAfter),
      });
      if (!Object.values(preserved).every((entry) => entry)) {
        return reject(
          'STYLE_RESTORE',
          preserved.world ? 'PROGRESS_MUTATED' : 'WORLD_UNTOUCHED_VIOLATION',
          'Restoring the style must not rebuild the world or move progress',
        );
      }
      const previousLearningEpoch = epochs.learningEpoch;
      epochs = Object.freeze({
        ...epochs,
        learningEpoch: epochOf(previousLearningEpoch + 1, 'learningEpoch'),
      });
      const result: StyleRestored = Object.freeze({
        status: 'RESTORED' as const,
        operation: 'STYLE_RESTORE' as const,
        tick: at,
        sessionKind,
        profile: Object.freeze({
          profileId: activation.version.profileId,
          previousVersionId: previous.versionId,
          previousChecksum: previous.checksum,
          versionId: activation.version.versionId,
          checksum: activation.version.checksum,
        }),
        barrier: 'LEARNING_EPOCH' as const,
        learningEpoch: Object.freeze({
          previous: previousLearningEpoch,
          next: epochs.learningEpoch,
        }),
        worldEpoch: epochs.worldEpoch,
        economyEpoch: epochs.economyEpoch,
        closedSegments: tick(activation.closedSegments),
        staleResults: tick(activation.staleResults),
        worldUntouched: true as const,
        preserved,
        xpMicroXp: ledgersAfter.xpMicroXp,
        historyLength: styleRestores.length + 1,
      });
      styleRestores.push(result);
      return result;
    });
  }

  return Object.freeze({
    recoverVehicle,
    beginCityReset,
    commitCityReset,
    cancelCityReset() {
      if (disposed) return false;
      if (prepared === null || prepared.stages > 0) return false;
      prepared = null;
      fault = null;
      return true;
    },
    restoreStyle,
    readHistory(operation: WorldRecoveryOperation, offset = 0, limit = WORLD_RECOVERY_LIMITS.page) {
      const start = tick(offset),
        count = tick(limit);
      requireContract(
        operation === 'VEHICLE_RECOVERY' ||
          operation === 'CITY_RESET' ||
          operation === 'STYLE_RESTORE',
        'Unknown recovery operation',
      );
      requireContract(count <= WORLD_RECOVERY_LIMITS.page, 'History page capacity');
      const source: readonly (VehicleRecovered | CityResetCommitted | StyleRestored)[] =
        operation === 'VEHICLE_RECOVERY'
          ? recoveries
          : operation === 'CITY_RESET'
            ? resets
            : styleRestores;
      return Object.freeze(source.slice(start, start + count));
    },
    status,
    dispose() {
      if (disposed) return;
      disposed = true;
      prepared = null;
      fault = null;
    },
  });
}

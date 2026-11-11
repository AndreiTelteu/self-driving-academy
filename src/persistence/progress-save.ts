import { createMissionRewardsLedger, createMissionTracker, parseMissionCatalog } from '../missions';
import type {
  CampaignProgress,
  MissionCatalog,
  MissionCompletionResult,
  MissionInstance,
  MissionResetInfo,
  MissionRewardsLedger,
  MissionRewardsSnapshot,
  MissionRewardsStats,
  MissionSettlementStatus,
  MissionTracker,
  MissionTrackerSnapshot,
  MissionUnlockSnapshot,
} from '../missions';
import { requireContract } from '../sessions';
import { createDefaultSettings, createSettingsStore } from '../settings';
import type { RuntimeSettings } from '../settings';
import { canonicalizeJson, sha256Hex } from './canonical-json';
import { PERSISTENCE_LIMITS, PersistenceError } from './contracts';
import type { PersistenceReasonCode, PersistedRecord, PersistedRecordInput } from './contracts';
import { measureJsonBytes, parsePersistedRecord, parseSettingsRecord } from './records';
import type { ProfileTransactionHooks } from './profile-transaction';
import type { TransactionPort } from './ports';
import type { LocalRepository, PlayerResetOutcome, PlayerSaveOutcome } from './repository';

/**
 * 130 progress, campaign and settings save.
 *
 * The module stores three explicit categories, each on its own row, so one category can be reset
 * without touching the others:
 *
 * - `PROGRESS` is the real 116 `MissionTrackerSnapshot` (mission instances, objective progress,
 *   verdicts, failure reasons, the event identity ledger and the tracker reward ledger). It is
 *   stored exactly as the tracker produced it and restored through `MissionTracker.restore`, so a
 *   reload cannot invent objectives or verdicts the tracker would reject.
 * - `CAMPAIGN` is the ordered operation log of the real 125 ledger (`settle` and `resetMission`).
 *   The 125 module has no restore entry point, and inventing a second sidebar of rewards would be a
 *   parallel system. The log is replayed into a fresh 125 ledger, and the replay is verified before
 *   the write and after the read against the canonical digest of the four 125 read models
 *   (`progress`, `rewards`, `unlocks`, `stats`). A reward therefore stays unique after a reload by
 *   identity, exactly as in 125 — not because a blob contains the word XP.
 * - `SETTINGS` is the real 009 `RuntimeSettings` row (keyboard remaps plus every preference). A
 *   player without a stored row receives the documented defaults; no preference is invented.
 *
 * Both `progress` rows use the 127 envelope, the closed `PROGRESS` lifecycle token and the
 * `bySession`/`byStatus` indexes; the settings row uses the 127 `settings` store. Nothing here opens
 * its own database or creates a parallel store, and every write is one multi-store transaction
 * (`commitPlayerSaveRows` / `commitPlayerResetRows`) so a failure halfway leaves the database exactly
 * as it was.
 *
 * Ownership: the module owns the rules and works on a `TransactionPort`; the repository owns the
 * connection, the writer lock and the transaction boundary.
 */
export const PROGRESS_SAVE_VERSION = '130-progress-save-v1' as const;

/** Version of the replayed campaign log contract; it is data, not a second store. */
export const CAMPAIGN_LEDGER_VERSION = '130-campaign-ledger-v1' as const;

/** Row identity prefixes inside the 127 `progress` store; the session id follows the prefix. */
export const PROGRESS_SAVE_ROW_PREFIXES = Object.freeze({
  tracker: 'tracker:',
  campaign: 'campaign:',
});

export const progressSaveCategories = ['SETTINGS', 'CAMPAIGN', 'PROGRESS'] as const;
export type ProgressSaveCategory = (typeof progressSaveCategories)[number];

export const progressTrackerStatuses = ['ACTIVE', 'COMPLETED', 'FAILED'] as const;
export type ProgressTrackerStatus = (typeof progressTrackerStatuses)[number];

export const progressSaveLimits = Object.freeze({
  version: PROGRESS_SAVE_VERSION,
  /** One tracker row, one campaign row and one settings row per save. */
  trackerRows: 1,
  campaignRows: 1,
  settingsRows: 1,
  /** 125 settlement records retained in the campaign log (125 keeps 256 completions). */
  campaignEvents: 256,
  maxIdentityCodeUnits: PERSISTENCE_LIMITS.maxIdCodeUnits,
  maxBodyBytes: PERSISTENCE_LIMITS.maxBodyBytes,
  maxRecordBytes: PERSISTENCE_LIMITS.maxRecordBytes,
});

function reject(code: PersistenceReasonCode, message: string, path: string | null = null): never {
  throw new PersistenceError(code, message, path);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

function boundedId(value: unknown, field: string): string {
  requireContract(
    typeof value === 'string' && value.length > 0,
    `Expected a bounded ${field} identity`,
  );
  requireContract(value.trim() === value, `The ${field} identity must not be padded`);
  requireContract(
    value.length <= PERSISTENCE_LIMITS.maxIdCodeUnits,
    `The ${field} identity exceeds ${PERSISTENCE_LIMITS.maxIdCodeUnits} code units`,
  );
  return value;
}

function canonicalText(value: unknown, path: string): string {
  const result = canonicalizeJson(value);
  if (result.status === 'REJECTED') {
    reject('BODY_INVALID', result.rejection.message, `${path}.${result.rejection.path}`);
  }
  return result.text;
}

function digestOf(value: unknown, path: string): string {
  return sha256Hex(canonicalText(value, path));
}

function rowId(prefix: string, sessionId: string): string {
  const id = `${prefix}${sessionId}`;
  requireContract(
    id.length <= PERSISTENCE_LIMITS.maxIdCodeUnits,
    `The ${prefix} row identity exceeds ${PERSISTENCE_LIMITS.maxIdCodeUnits} code units`,
  );
  return id;
}

/* ------------------------------------------------------------- campaign ledger */

/**
 * The completion facts a 125 `settle` consumes: the real 116 instance identity, version, attempt
 * and completion tick. Nothing else from the instance is needed, and nothing else is invented.
 */
export interface CampaignCompletionFacts {
  readonly instanceId: string;
  readonly missionId: string;
  readonly missionVersion: string;
  readonly attempt: number;
  readonly state: 'COMPLETED';
  readonly completedTick: number;
}

export interface CampaignSettleEvent {
  readonly kind: 'SETTLE';
  readonly completion: CampaignCompletionFacts;
  /** The verdict the live 125 ledger produced for this settlement. */
  readonly status: MissionSettlementStatus;
}

export interface CampaignResetEvent {
  readonly kind: 'RESET';
  readonly missionId: string;
  readonly tick: number;
}

export type CampaignLedgerEvent = CampaignSettleEvent | CampaignResetEvent;

/** Compact, storable projection of the four 125 read models. */
export interface CampaignCounts {
  readonly missions: number;
  readonly completed: number;
  readonly available: number;
  readonly locked: number;
  readonly completions: number;
  readonly rewards: number;
  readonly capabilities: number;
  readonly resets: number;
  readonly xp: number;
  readonly duplicates: number;
  readonly tick: number;
}

const completionFields = [
  'instanceId',
  'missionId',
  'missionVersion',
  'attempt',
  'state',
  'completedTick',
] as const;
const settleEventFields = ['kind', 'completion', 'status'] as const;
const resetEventFields = ['kind', 'missionId', 'tick'] as const;

function readCompletion(value: unknown, path: string): CampaignCompletionFacts {
  const data = exact(value, completionFields, path);
  return Object.freeze({
    instanceId: boundedId(data.instanceId, 'completion instance'),
    missionId: boundedId(data.missionId, 'completion mission'),
    missionVersion: boundedId(data.missionVersion, 'completion mission version'),
    attempt: positiveInteger(data.attempt, `${path}.attempt`),
    state: 'COMPLETED' as const,
    completedTick: nonnegativeInteger(data.completedTick, `${path}.completedTick`),
  });
}

function readCampaignEvent(value: unknown, index: number): CampaignLedgerEvent {
  const path = `events[${index}]`;
  const data = object(value, path);
  const kind = data.kind;
  if (kind === 'SETTLE') {
    const event = exact(data, settleEventFields, path);
    const status = event.status;
    requireContract(
      status === 'GRANTED' || status === 'NO_REWARD' || status === 'DUPLICATE',
      `Unsupported settlement status at ${path}.status`,
    );
    return Object.freeze({
      kind: 'SETTLE' as const,
      completion: readCompletion(event.completion, `${path}.completion`),
      status,
    });
  }
  if (kind === 'RESET') {
    const event = exact(data, resetEventFields, path);
    return Object.freeze({
      kind: 'RESET' as const,
      missionId: boundedId(event.missionId, 'reset mission'),
      tick: nonnegativeInteger(event.tick, `${path}.tick`),
    });
  }
  return reject('INVALID_RECORD', `Unknown campaign ledger event at ${path}.kind`, `${path}.kind`);
}

function integerInRange(value: unknown, field: string, minimum: number, maximum: number): number {
  requireContract(
    typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= minimum &&
      value <= maximum,
    `Expected ${field} to be a safe integer in [${minimum}, ${maximum}]`,
  );
  return value;
}

function nonnegativeInteger(value: unknown, field: string): number {
  return integerInRange(value, field, 0, Number.MAX_SAFE_INTEGER);
}

function positiveInteger(value: unknown, field: string): number {
  return integerInRange(value, field, 1, Number.MAX_SAFE_INTEGER);
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return reject('INVALID_RECORD', 'Expected a plain object', path);
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return reject('INVALID_RECORD', 'Expected plain data, not a class instance', path);
  }
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') reject('INVALID_RECORD', 'Symbol fields are unsupported', path);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor) || descriptor.enumerable !== true) {
      reject('INVALID_RECORD', 'Expected enumerable data fields', `${path}.${key}`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function exact(value: unknown, allowed: readonly string[], path: string): Record<string, unknown> {
  const data = object(value, path);
  for (const key of Object.keys(data)) {
    if (!allowed.includes(key)) reject('INVALID_RECORD', `Unknown field: ${key}`, `${path}.${key}`);
  }
  for (const key of allowed) {
    if (!Object.hasOwn(data, key)) {
      reject('INVALID_RECORD', `Missing field: ${key}`, `${path}.${key}`);
    }
  }
  return data;
}

function readEvents(value: unknown, path: string): readonly CampaignLedgerEvent[] {
  if (!Array.isArray(value)) return reject('INVALID_RECORD', 'Expected an event list', path);
  requireContract(
    value.length <= progressSaveLimits.campaignEvents,
    `The campaign log exceeds ${progressSaveLimits.campaignEvents} events`,
  );
  const events: CampaignLedgerEvent[] = [];
  for (let index = 0; index < value.length; index += 1) {
    events.push(readCampaignEvent(value[index], index));
  }
  return Object.freeze(events);
}

/** Compact projection of the four read models 125 exposes; it is never a second source of truth. */
export function campaignCounts(ledger: MissionRewardsLedger): CampaignCounts {
  const progress = ledger.progress();
  const rewards = ledger.rewards();
  const unlocks = ledger.unlocks();
  const stats = ledger.stats();
  return Object.freeze({
    missions: progress.counts.missions,
    completed: progress.counts.completed,
    available: progress.counts.available,
    locked: progress.counts.locked,
    completions: stats.completions,
    rewards: rewards.totals.granted,
    capabilities: unlocks.counts.granted,
    resets: stats.resets,
    xp: rewards.totals.xp,
    duplicates: rewards.totals.duplicates,
    tick: stats.tick,
  });
}

/** Canonical digest of the four 125 read models; equality is the replay oracle. */
export function campaignLedgerDigest(ledger: MissionRewardsLedger): string {
  return digestOf(
    {
      progress: ledger.progress(),
      rewards: ledger.rewards(),
      unlocks: ledger.unlocks(),
      stats: ledger.stats(),
    },
    'campaign',
  );
}

/** Canonical digest of a mission catalog, so a saved ledger is never replayed under another one. */
export function missionCatalogDigest(catalog: unknown): string {
  return digestOf(parseMissionCatalog(catalog), 'catalog');
}

export interface ReplayedCampaign {
  readonly version: typeof CAMPAIGN_LEDGER_VERSION;
  readonly catalog: MissionCatalog;
  readonly catalogDigest: string;
  readonly namespace: string;
  readonly events: readonly CampaignLedgerEvent[];
  readonly ledger: MissionRewardsLedger;
  readonly digest: string;
  readonly counts: CampaignCounts;
  readonly progress: CampaignProgress;
  readonly rewards: MissionRewardsSnapshot;
  readonly unlocks: MissionUnlockSnapshot;
  readonly stats: MissionRewardsStats;
}

function ledgerOf(value: unknown): MissionRewardsLedger {
  const data = object(value, 'campaign.ledger');
  for (const method of ['settle', 'progress', 'rewards', 'unlocks', 'resetMission', 'stats']) {
    requireContract(
      typeof data[method] === 'function',
      `The campaign ledger is missing ${method}()`,
    );
  }
  const namespace = data.namespace;
  requireContract(typeof namespace === 'string', 'The campaign ledger has no namespace');
  return value as MissionRewardsLedger;
}

/**
 * Rebuilds a real 125 ledger by replaying the stored operation log.
 *
 * Every settlement must produce exactly the stored verdict and every reset the stored tick; a log
 * that no longer reproduces the live ledger is refused with `LEDGER_REPLAY_MISMATCH` instead of
 * being trusted as a bonus source of XP.
 */
export function replayCampaignLedger(
  catalogInput: unknown,
  eventsInput: unknown,
): ReplayedCampaign {
  const catalog = parseMissionCatalog(catalogInput);
  const events = readEvents(eventsInput, 'events');
  const ledger = createMissionRewardsLedger({ catalog });
  for (const [index, event] of events.entries()) {
    try {
      if (event.kind === 'SETTLE') {
        const settlement = ledger.settle({ instance: event.completion });
        requireContract(
          settlement.status === event.status,
          `Event ${index} replays as ${settlement.status}, not ${event.status}`,
        );
      } else {
        const reset = ledger.resetMission({ missionId: event.missionId, tick: event.tick });
        requireContract(
          reset.tick === event.tick && reset.missionId === event.missionId,
          `Event ${index} replays reset ${reset.missionId}@${reset.tick}`,
        );
      }
    } catch (error) {
      reject(
        'LEDGER_REPLAY_MISMATCH',
        `Campaign event ${index} cannot be replayed: ${describe(error)}`,
        `events[${index}]`,
      );
    }
  }
  return Object.freeze({
    version: CAMPAIGN_LEDGER_VERSION,
    catalog,
    catalogDigest: missionCatalogDigest(catalog),
    namespace: catalog.namespace,
    events,
    ledger,
    digest: campaignLedgerDigest(ledger),
    counts: campaignCounts(ledger),
    progress: ledger.progress(),
    rewards: ledger.rewards(),
    unlocks: ledger.unlocks(),
    stats: ledger.stats(),
  });
}

/**
 * The 125 ledger wrapped with an ordered operation log.
 *
 * The application keeps using the real ledger for every answer; the recorder only remembers the
 * operations, in order, so the save layer can replay them into a fresh ledger after a reload.
 * A refused operation throws before it is recorded, so the log never contains an event that did not
 * happen.
 */
export interface CampaignProgressRecorder {
  readonly ledger: MissionRewardsLedger;
  readonly namespace: string;
  readonly events: () => readonly CampaignLedgerEvent[];
  readonly settle: (value: unknown) => MissionCompletionResult;
  readonly settleInstance: (instance: unknown) => MissionCompletionResult;
  readonly resetMission: (value: unknown) => MissionResetInfo;
}

export function createCampaignProgressRecorder(options: unknown): CampaignProgressRecorder {
  const data = exact(options, ['catalog'], 'campaign recorder');
  const catalog = parseMissionCatalog(data.catalog);
  const ledger = createMissionRewardsLedger({ catalog });
  const recorded: CampaignLedgerEvent[] = [];

  const settle = (value: unknown): MissionCompletionResult => {
    const result = ledger.settle(value);
    recorded.push(
      Object.freeze({
        kind: 'SETTLE' as const,
        completion: Object.freeze({
          instanceId: result.completionId,
          missionId: result.missionId,
          missionVersion: result.missionVersion,
          attempt: result.attempt,
          state: 'COMPLETED' as const,
          completedTick: result.completedTick,
        }),
        status: result.status,
      }),
    );
    return result;
  };

  return Object.freeze({
    ledger,
    namespace: catalog.namespace,
    events: () => Object.freeze([...recorded]),
    settle,
    settleInstance: (instance: unknown) => settle({ instance }),
    resetMission(value: unknown): MissionResetInfo {
      const result = ledger.resetMission(value);
      recorded.push(
        Object.freeze({
          kind: 'RESET' as const,
          missionId: result.missionId,
          tick: result.tick,
        }),
      );
      return result;
    },
  });
}

/* ----------------------------------------------------------------- tracker rows */

export interface TrackerSummary {
  readonly status: ProgressTrackerStatus;
  readonly missions: number;
  readonly instances: number;
  readonly active: number;
  readonly completed: number;
  readonly failed: number;
  readonly attempts: number;
  readonly acceptedEvents: number;
  readonly events: number;
  readonly rewards: number;
  readonly completedMissionIds: readonly string[];
  readonly tick: number;
}

/** What the stored snapshot actually contains, derived from the snapshot itself. */
export function summarizeTracker(
  snapshot: MissionTrackerSnapshot,
  catalog: MissionCatalog,
): TrackerSummary {
  const instances = snapshot.instances;
  const completedMissionIds = Object.freeze(
    [
      ...new Set(instances.filter((entry) => entry.state === 'COMPLETED').map((e) => e.missionId)),
    ].sort(),
  );
  const active = instances.filter((entry) => entry.state === 'ACTIVE').length;
  const failed = instances.filter((entry) => entry.state === 'FAILED').length;
  const status: ProgressTrackerStatus =
    active > 0
      ? 'ACTIVE'
      : completedMissionIds.length === catalog.missions.length
        ? 'COMPLETED'
        : failed > 0
          ? 'FAILED'
          : 'ACTIVE';
  return Object.freeze({
    status,
    missions: catalog.missions.length,
    instances: instances.length,
    active,
    completed: completedMissionIds.length,
    failed,
    attempts: snapshot.attempts.reduce((total, entry) => total + entry.attempts, 0),
    acceptedEvents: snapshot.counters.acceptedEvents,
    events: snapshot.events.length,
    rewards: snapshot.rewards.length,
    completedMissionIds,
    tick: snapshot.tick,
  });
}

/** Deterministic projection of a tracker snapshot used to compare a reload with the live tracker. */
export interface TrackerFacts {
  readonly tick: number;
  readonly attempts: readonly { readonly missionId: string; readonly attempts: number }[];
  readonly latest: readonly { readonly missionId: string; readonly instanceId: string }[];
  readonly instances: readonly {
    readonly instanceId: string;
    readonly missionId: string;
    readonly missionVersion: string;
    readonly attempt: number;
    readonly state: string;
    readonly completedTick: number | null;
    readonly failedTick: number | null;
    readonly failureReason: string | null;
    readonly replayedFrom: string | null;
    readonly incidents: number;
    readonly appliedEvents: number;
    readonly rewardsGranted: number;
    readonly objectives: readonly {
      readonly objectiveId: string;
      readonly target: number;
      readonly progress: number;
      readonly satisfied: boolean;
    }[];
  }[];
  readonly events: readonly { readonly eventId: string; readonly fingerprint: string }[];
  readonly rewards: readonly {
    readonly rewardId: string;
    readonly missionId: string;
    readonly definitionRewardId: string;
    readonly instanceId: string;
    readonly grantedTick: number;
  }[];
  readonly counters: MissionTrackerSnapshot['counters'];
}

export function trackerFacts(snapshot: MissionTrackerSnapshot): TrackerFacts {
  return Object.freeze({
    tick: snapshot.tick,
    attempts: snapshot.attempts,
    latest: snapshot.latest,
    instances: Object.freeze(
      snapshot.instances.map((entry) =>
        Object.freeze({
          instanceId: entry.instanceId,
          missionId: entry.missionId,
          missionVersion: entry.missionVersion,
          attempt: entry.attempt,
          state: entry.state,
          completedTick: entry.completedTick,
          failedTick: entry.failedTick,
          failureReason: entry.failureReason,
          replayedFrom: entry.replayedFrom,
          incidents: entry.incidents,
          appliedEvents: entry.appliedEvents,
          rewardsGranted: entry.rewardsGranted,
          objectives: Object.freeze(
            entry.objectives.map((objective) =>
              Object.freeze({
                objectiveId: objective.objectiveId,
                target: objective.target,
                progress: objective.progress,
                satisfied: objective.satisfied,
              }),
            ),
          ),
        }),
      ),
    ),
    events: snapshot.events,
    rewards: Object.freeze(
      snapshot.rewards.map((reward) =>
        Object.freeze({
          rewardId: reward.rewardId,
          missionId: reward.missionId,
          definitionRewardId: reward.definitionRewardId,
          instanceId: reward.instanceId,
          grantedTick: reward.grantedTick,
        }),
      ),
    ),
    counters: snapshot.counters,
  });
}

/** Validates a snapshot with the real 116 `restore`, so only a restorable one is ever stored. */
function restorableSnapshot(
  value: unknown,
  catalog: MissionCatalog,
  sessionId: string,
  worldEpoch: number,
): MissionTrackerSnapshot {
  const tracker = createMissionTracker({ catalog, context: { sessionId, worldEpoch } });
  try {
    tracker.restore(value);
  } catch (error) {
    reject(
      'TRACKER_SNAPSHOT_INVALID',
      `The mission tracker snapshot cannot be restored: ${describe(error)}`,
      'tracker',
    );
  } finally {
    tracker.dispose();
  }
  return value as MissionTrackerSnapshot;
}

/* -------------------------------------------------------------------- row bodies */

export interface TrackerRowBody {
  readonly kind: 'MISSION_TRACKER';
  readonly version: typeof PROGRESS_SAVE_VERSION;
  readonly digest: string;
  readonly snapshot: MissionTrackerSnapshot;
  /** Keeps the body assignable to the 127 plain-JSON envelope. */
  readonly [key: string]: unknown;
}

export interface CampaignRowBody {
  readonly kind: 'CAMPAIGN_LEDGER';
  readonly version: typeof PROGRESS_SAVE_VERSION;
  readonly ledgerVersion: typeof CAMPAIGN_LEDGER_VERSION;
  readonly namespace: string;
  readonly catalogDigest: string;
  readonly digest: string;
  readonly counts: CampaignCounts;
  readonly events: readonly CampaignLedgerEvent[];
  /** Keeps the body assignable to the 127 plain-JSON envelope. */
  readonly [key: string]: unknown;
}

export interface TrackerRowCommit {
  readonly recordId: string;
  readonly revision: number;
  readonly status: ProgressTrackerStatus;
  readonly bodyBytes: number;
  readonly digest: string;
}

export interface CampaignRowCommit {
  readonly recordId: string;
  readonly revision: number;
  readonly status: 'ACTIVE' | 'COMPLETED';
  readonly bodyBytes: number;
  readonly digest: string;
}

export interface SettingsCommit {
  readonly playerId: string;
  readonly bytes: number;
  readonly controlVersion: number;
}

export interface PlayerSaveCampaignInput {
  readonly ledger: MissionRewardsLedger;
  readonly events: readonly unknown[];
}

export interface PlayerSaveTransactionInput {
  readonly sessionId: string;
  readonly playerId: string;
  readonly worldEpoch: number;
  readonly catalog: unknown;
  readonly createdAt: string;
  readonly settings?: unknown;
  readonly tracker?: unknown;
  readonly campaign?: PlayerSaveCampaignInput;
}

export type PlayerSaveRequest = Omit<PlayerSaveTransactionInput, 'createdAt'>;

export interface PlayerSaveCommit {
  readonly version: typeof PROGRESS_SAVE_VERSION;
  readonly sessionId: string;
  readonly playerId: string;
  readonly worldEpoch: number;
  readonly categories: readonly ProgressSaveCategory[];
  readonly tracker: TrackerRowCommit | null;
  readonly campaign: CampaignRowCommit | null;
  readonly settings: SettingsCommit | null;
  readonly bytes: number;
}

export interface PlayerResetTransactionInput {
  readonly sessionId: string;
  readonly playerId: string;
  readonly category: ProgressSaveCategory;
}

export type PlayerResetRequest = PlayerResetTransactionInput;

export interface PlayerResetCommit {
  readonly version: typeof PROGRESS_SAVE_VERSION;
  readonly sessionId: string;
  readonly playerId: string;
  readonly category: ProgressSaveCategory;
  readonly deleted: Readonly<{ tracker: boolean; campaign: boolean }>;
  readonly kept: Readonly<{ tracker: boolean; campaign: boolean; settings: boolean }>;
  /** The settings row now stored for the player after a `SETTINGS` reset. */
  readonly settings: RuntimeSettings | null;
  readonly settingsChanged: boolean;
}

interface SaveInputFields {
  readonly sessionId: string;
  readonly playerId: string;
  readonly worldEpoch: number;
  readonly catalog: unknown;
  readonly createdAt: string;
  readonly settings: unknown;
  readonly tracker: unknown;
  readonly campaign: unknown;
  readonly categories: readonly ProgressSaveCategory[];
}

const saveInputFields = [
  'sessionId',
  'playerId',
  'worldEpoch',
  'catalog',
  'createdAt',
  'settings',
  'tracker',
  'campaign',
] as const;

function readSaveInput(value: unknown): SaveInputFields {
  const data = object(value, 'save');
  for (const key of Object.keys(data)) {
    if (!(saveInputFields as readonly string[]).includes(key)) {
      reject('INVALID_RECORD', `Unknown field: ${key}`, `save.${key}`);
    }
  }
  for (const key of ['sessionId', 'playerId', 'worldEpoch', 'catalog', 'createdAt']) {
    if (!Object.hasOwn(data, key)) reject('INVALID_RECORD', `Missing field: ${key}`, 'save');
  }
  const categories: ProgressSaveCategory[] = [];
  if (data.settings !== undefined) categories.push('SETTINGS');
  if (data.campaign !== undefined) categories.push('CAMPAIGN');
  if (data.tracker !== undefined) categories.push('PROGRESS');
  if (categories.length === 0) {
    reject('SAVE_EMPTY', 'A save needs at least one of settings, tracker or campaign', 'save');
  }
  return {
    sessionId: boundedId(data.sessionId, 'session'),
    playerId: boundedId(data.playerId, 'player'),
    worldEpoch: nonnegativeInteger(data.worldEpoch, 'save.worldEpoch'),
    catalog: data.catalog,
    createdAt: boundedId(data.createdAt, 'createdAt'),
    settings: data.settings,
    tracker: data.tracker,
    campaign: data.campaign,
    categories: Object.freeze(categories),
  };
}

function readCampaignInput(value: unknown): PlayerSaveCampaignInput {
  const data = exact(value, ['ledger', 'events'], 'campaign');
  return Object.freeze({
    ledger: ledgerOf(data.ledger),
    events: readEvents(data.events, 'events'),
  });
}

function campaignRowStatus(counts: CampaignCounts): 'ACTIVE' | 'COMPLETED' {
  return counts.missions > 0 && counts.completed === counts.missions ? 'COMPLETED' : 'ACTIVE';
}

async function writeProgressRow(
  transaction: TransactionPort,
  input: {
    readonly recordId: string;
    readonly sessionId: string;
    readonly worldEpoch: number;
    readonly status: string;
    readonly createdAt: string;
    readonly body: Readonly<Record<string, unknown>>;
  },
): Promise<{ readonly revision: number; readonly bodyBytes: number; readonly bytes: number }> {
  const existing = await transaction.get('progress', input.recordId);
  let revision = 1;
  if (existing !== undefined) {
    const current = parsePersistedRecord(existing, 'PROGRESS');
    revision = current.revision + 1;
  }
  const record: PersistedRecordInput = {
    schemaVersion: 1,
    recordKind: 'PROGRESS',
    recordId: input.recordId,
    sessionId: input.sessionId,
    worldEpoch: input.worldEpoch,
    status: input.status,
    revision,
    createdAt: input.createdAt,
    body: input.body,
  };
  // The 127 parser measures the body budget, the depth, the entry count and the lifecycle token
  // before the row can reach the transaction.
  const parsed = parsePersistedRecord(record, 'PROGRESS');
  await transaction.put('progress', parsed);
  return {
    revision,
    bodyBytes: parsed.bodyBytes,
    bytes: measureJsonBytes(parsed, 'record'),
  };
}

/* ------------------------------------------------------------------- transaction */

/**
 * Writes the three categories inside one transaction.
 *
 * Rules, all enforced before the transaction commits:
 * 1. The mission snapshot must be restorable by the real 116 `restore` (`TRACKER_SNAPSHOT_INVALID`
 *    otherwise): a snapshot the tracker would refuse is never stored.
 * 2. The campaign log must replay into exactly the live 125 ledger, digest for digest
 *    (`LEDGER_REPLAY_MISMATCH` otherwise): the stored log cannot be a second, more generous ledger.
 * 3. The stored campaign log must belong to the same catalog (`CATALOG_MISMATCH`): rewards are
 *    authored per definition version, so a different catalog is a different economy.
 * 4. The settings row must belong to this player (`REFERENCE_MISSING`).
 * 5. Both `progress` rows take a newer revision than the stored one (`STALE_REVISION` via the
 *    envelope parser is not needed: the revision is derived here, never accepted from the caller).
 */
export async function commitPlayerSaveRows(
  transaction: TransactionPort,
  input: PlayerSaveTransactionInput,
  hooks: ProfileTransactionHooks = {},
): Promise<PlayerSaveCommit> {
  const data = readSaveInput(input);
  const catalog = parseMissionCatalog(data.catalog);

  let tracker: TrackerRowCommit | null = null;
  let campaign: CampaignRowCommit | null = null;
  let settings: SettingsCommit | null = null;
  let bytes = 0;

  if (data.tracker !== undefined) {
    const snapshot = restorableSnapshot(data.tracker, catalog, data.sessionId, data.worldEpoch);
    const summary = summarizeTracker(snapshot, catalog);
    const body: TrackerRowBody = Object.freeze({
      kind: 'MISSION_TRACKER' as const,
      version: PROGRESS_SAVE_VERSION,
      digest: digestOf(snapshot, 'tracker.snapshot'),
      snapshot,
    });
    const written = await writeProgressRow(transaction, {
      recordId: rowId(PROGRESS_SAVE_ROW_PREFIXES.tracker, data.sessionId),
      sessionId: data.sessionId,
      worldEpoch: data.worldEpoch,
      status: summary.status,
      createdAt: data.createdAt,
      body,
    });
    tracker = Object.freeze({
      recordId: rowId(PROGRESS_SAVE_ROW_PREFIXES.tracker, data.sessionId),
      revision: written.revision,
      status: summary.status,
      bodyBytes: written.bodyBytes,
      digest: body.digest,
    });
    bytes += written.bytes;
  }

  if (data.campaign !== undefined) {
    const campaignInput = readCampaignInput(data.campaign);
    if (campaignInput.ledger.namespace !== catalog.namespace) {
      reject(
        'CATALOG_MISMATCH',
        `The campaign ledger belongs to ${campaignInput.ledger.namespace}, not ${catalog.namespace}`,
        'campaign.ledger',
      );
    }
    const replay = replayCampaignLedger(catalog, campaignInput.events);
    const liveDigest = campaignLedgerDigest(campaignInput.ledger);
    if (liveDigest !== replay.digest) {
      reject(
        'LEDGER_REPLAY_MISMATCH',
        'The campaign log does not replay into the live 125 ledger',
        'campaign.events',
      );
    }
    const liveCounts = campaignCounts(campaignInput.ledger);
    if (canonicalText(liveCounts, 'campaign') !== canonicalText(replay.counts, 'campaign')) {
      reject(
        'LEDGER_REPLAY_MISMATCH',
        'The campaign log does not reproduce the live 125 totals',
        'campaign.events',
      );
    }
    const body: CampaignRowBody = Object.freeze({
      kind: 'CAMPAIGN_LEDGER' as const,
      version: PROGRESS_SAVE_VERSION,
      ledgerVersion: CAMPAIGN_LEDGER_VERSION,
      namespace: replay.namespace,
      catalogDigest: replay.catalogDigest,
      digest: replay.digest,
      counts: replay.counts,
      events: replay.events,
    });
    const status = campaignRowStatus(replay.counts);
    const written = await writeProgressRow(transaction, {
      recordId: rowId(PROGRESS_SAVE_ROW_PREFIXES.campaign, data.sessionId),
      sessionId: data.sessionId,
      worldEpoch: data.worldEpoch,
      status,
      createdAt: data.createdAt,
      body,
    });
    campaign = Object.freeze({
      recordId: rowId(PROGRESS_SAVE_ROW_PREFIXES.campaign, data.sessionId),
      revision: written.revision,
      status,
      bodyBytes: written.bodyBytes,
      digest: body.digest,
    });
    bytes += written.bytes;
  }

  if (data.settings !== undefined) {
    const parsed = parseSettingsRecord(data.settings);
    if (parsed.playerId !== data.playerId) {
      reject(
        'REFERENCE_MISSING',
        `The settings belong to ${parsed.playerId}, not ${data.playerId}`,
        'settings.playerId',
      );
    }
    await transaction.put('settings', parsed);
    const settingsBytes = measureJsonBytes(parsed, 'settings');
    settings = Object.freeze({
      playerId: parsed.playerId,
      bytes: settingsBytes,
      controlVersion: parsed.input.control.version,
    });
    bytes += settingsBytes;
  }

  hooks.beforeCommit?.();

  return Object.freeze({
    version: PROGRESS_SAVE_VERSION,
    sessionId: data.sessionId,
    playerId: data.playerId,
    worldEpoch: data.worldEpoch,
    categories: data.categories,
    tracker,
    campaign,
    settings,
    bytes,
  });
}

/**
 * Resets exactly one category.
 *
 * - `SETTINGS` writes the documented 009 defaults for this player (through the real `SettingsStore`
 *   reset, so the control version moves only when the control preferences change) and keeps the
 *   campaign ledger and the mission progress rows untouched.
 * - `CAMPAIGN` deletes only the campaign log row: settlements, rewards, unlocks, resets. Mission
 *   progress and settings stay stored.
 * - `PROGRESS` deletes only the mission tracker row: instances, objective progress and verdicts.
 *   The campaign ledger and settings stay stored.
 *
 * No branch touches `profiles` or `profileActivations`: a category reset cannot delete a profile.
 */
export async function commitPlayerResetRows(
  transaction: TransactionPort,
  input: PlayerResetTransactionInput,
  hooks: ProfileTransactionHooks = {},
): Promise<PlayerResetCommit> {
  const data = exact(input, ['sessionId', 'playerId', 'category'], 'reset');
  const sessionId = boundedId(data.sessionId, 'session');
  const playerId = boundedId(data.playerId, 'player');
  if (!(progressSaveCategories as readonly string[]).includes(data.category as string)) {
    reject(
      'SAVE_CATEGORY_UNKNOWN',
      `Unknown save category: ${String(data.category)}`,
      'reset.category',
    );
  }
  const category = data.category as ProgressSaveCategory;
  const trackerId = rowId(PROGRESS_SAVE_ROW_PREFIXES.tracker, sessionId);
  const campaignId = rowId(PROGRESS_SAVE_ROW_PREFIXES.campaign, sessionId);
  const deleted = { tracker: false, campaign: false };
  let settings: RuntimeSettings | null = null;
  let settingsChanged = false;

  if (category === 'SETTINGS') {
    const stored = await transaction.get('settings', playerId);
    const current =
      stored === undefined ? createDefaultSettings(playerId) : parseSettingsRecord(stored);
    const next = createSettingsStore(current).reset();
    settingsChanged = canonicalText(next, 'settings') !== canonicalText(current, 'settings');
    if (settingsChanged) await transaction.put('settings', next);
    settings = next;
  } else if (category === 'CAMPAIGN') {
    const stored = await transaction.get('progress', campaignId);
    if (stored !== undefined) {
      parsePersistedRecord(stored, 'PROGRESS');
      await transaction.delete('progress', campaignId);
      deleted.campaign = true;
    }
  } else {
    const stored = await transaction.get('progress', trackerId);
    if (stored !== undefined) {
      parsePersistedRecord(stored, 'PROGRESS');
      await transaction.delete('progress', trackerId);
      deleted.tracker = true;
    }
  }

  const kept = Object.freeze({
    tracker: (await transaction.get('progress', trackerId)) !== undefined,
    campaign: (await transaction.get('progress', campaignId)) !== undefined,
    settings: (await transaction.get('settings', playerId)) !== undefined,
  });

  hooks.beforeCommit?.();

  return Object.freeze({
    version: PROGRESS_SAVE_VERSION,
    sessionId,
    playerId,
    category,
    deleted: Object.freeze(deleted),
    kept,
    settings,
    settingsChanged,
  });
}

/* ------------------------------------------------------------------------- load */

export interface PlayerSaveRows {
  readonly progress: readonly unknown[];
  readonly settings: unknown;
}

export interface LoadedTracker {
  readonly recordId: string;
  readonly revision: number;
  readonly bodyBytes: number;
  readonly status: ProgressTrackerStatus;
  readonly digest: string;
  readonly snapshot: MissionTrackerSnapshot;
  readonly summary: TrackerSummary;
}

export interface LoadedCampaign {
  readonly recordId: string;
  readonly revision: number;
  readonly bodyBytes: number;
  readonly status: 'ACTIVE' | 'COMPLETED';
  readonly digest: string;
  readonly catalogDigest: string;
  readonly counts: CampaignCounts;
  readonly events: readonly CampaignLedgerEvent[];
  readonly ledger: MissionRewardsLedger;
  readonly progress: CampaignProgress;
  readonly rewards: MissionRewardsSnapshot;
  readonly unlocks: MissionUnlockSnapshot;
  readonly stats: MissionRewardsStats;
}

export interface LoadedPlayerSave {
  readonly version: typeof PROGRESS_SAVE_VERSION;
  readonly sessionId: string;
  readonly playerId: string;
  readonly worldEpoch: number | null;
  readonly settings: RuntimeSettings;
  readonly settingsSource: 'STORED' | 'DEFAULTS';
  readonly tracker: LoadedTracker | null;
  readonly campaign: LoadedCampaign | null;
  readonly categories: Readonly<{ settings: boolean; campaign: boolean; progress: boolean }>;
  readonly empty: boolean;
}

const trackerBodyFields = ['kind', 'version', 'digest', 'snapshot'] as const;
const campaignBodyFields = [
  'kind',
  'version',
  'ledgerVersion',
  'namespace',
  'catalogDigest',
  'digest',
  'counts',
  'events',
] as const;
const campaignCountFields = [
  'missions',
  'completed',
  'available',
  'locked',
  'completions',
  'rewards',
  'capabilities',
  'resets',
  'xp',
  'duplicates',
  'tick',
] as const;

function readCounts(value: unknown): CampaignCounts {
  const data = exact(value, campaignCountFields, 'campaign.counts');
  return Object.freeze({
    missions: nonnegativeInteger(data.missions, 'campaign.counts.missions'),
    completed: nonnegativeInteger(data.completed, 'campaign.counts.completed'),
    available: nonnegativeInteger(data.available, 'campaign.counts.available'),
    locked: nonnegativeInteger(data.locked, 'campaign.counts.locked'),
    completions: nonnegativeInteger(data.completions, 'campaign.counts.completions'),
    rewards: nonnegativeInteger(data.rewards, 'campaign.counts.rewards'),
    capabilities: nonnegativeInteger(data.capabilities, 'campaign.counts.capabilities'),
    resets: nonnegativeInteger(data.resets, 'campaign.counts.resets'),
    xp: nonnegativeInteger(data.xp, 'campaign.counts.xp'),
    duplicates: nonnegativeInteger(data.duplicates, 'campaign.counts.duplicates'),
    tick: nonnegativeInteger(data.tick, 'campaign.counts.tick'),
  });
}

function decodeTrackerRow(row: PersistedRecord, catalog: MissionCatalog): LoadedTracker {
  const body = exact(row.body, trackerBodyFields, 'progress.tracker');
  requireContract(
    body.version === PROGRESS_SAVE_VERSION,
    `Unsupported tracker row version: ${String(body.version)}`,
  );
  const snapshot = body.snapshot as MissionTrackerSnapshot;
  const digest = digestOf(snapshot, 'tracker.snapshot');
  if (body.digest !== digest) {
    reject(
      'SAVE_DIGEST_MISMATCH',
      'The stored mission snapshot does not match its digest',
      'progress.tracker.digest',
    );
  }
  const summary = summarizeTracker(snapshot, catalog);
  if (row.status !== summary.status) {
    reject(
      'INVALID_RECORD',
      `The tracker row status ${String(row.status)} does not match the snapshot ${summary.status}`,
      'progress.tracker.status',
    );
  }
  return Object.freeze({
    recordId: row.recordId,
    revision: row.revision,
    bodyBytes: row.bodyBytes,
    status: summary.status,
    digest,
    snapshot,
    summary,
  });
}

function decodeCampaignRow(
  row: PersistedRecord,
  catalog: MissionCatalog,
  catalogDigest: string,
): LoadedCampaign {
  const body = exact(row.body, campaignBodyFields, 'progress.campaign');
  requireContract(
    body.version === PROGRESS_SAVE_VERSION,
    `Unsupported campaign row version: ${String(body.version)}`,
  );
  requireContract(
    body.ledgerVersion === CAMPAIGN_LEDGER_VERSION,
    `Unsupported campaign ledger version: ${String(body.ledgerVersion)}`,
  );
  if (body.namespace !== catalog.namespace || body.catalogDigest !== catalogDigest) {
    reject(
      'CATALOG_MISMATCH',
      'The stored campaign log belongs to another mission catalog',
      'progress.campaign.catalogDigest',
    );
  }
  const replay = replayCampaignLedger(catalog, body.events);
  if (body.digest !== replay.digest) {
    reject(
      'LEDGER_REPLAY_MISMATCH',
      'The stored campaign log no longer reproduces its ledger',
      'progress.campaign.digest',
    );
  }
  const storedCounts = readCounts(body.counts);
  if (canonicalText(storedCounts, 'campaign') !== canonicalText(replay.counts, 'campaign')) {
    reject(
      'LEDGER_REPLAY_MISMATCH',
      'The stored campaign totals do not match the replayed ledger',
      'progress.campaign.counts',
    );
  }
  const status = campaignRowStatus(replay.counts);
  if (row.status !== status) {
    reject(
      'INVALID_RECORD',
      `The campaign row status ${String(row.status)} does not match the replay ${status}`,
      'progress.campaign.status',
    );
  }
  return Object.freeze({
    recordId: row.recordId,
    revision: row.revision,
    bodyBytes: row.bodyBytes,
    status,
    digest: replay.digest,
    catalogDigest,
    counts: replay.counts,
    events: replay.events,
    ledger: replay.ledger,
    progress: replay.progress,
    rewards: replay.rewards,
    unlocks: replay.unlocks,
    stats: replay.stats,
  });
}

/** Pure decoder: raw rows plus a catalog in, a validated save out. */
export function decodePlayerSave(input: {
  readonly sessionId: string;
  readonly playerId: string;
  readonly catalog: unknown;
  readonly rows: PlayerSaveRows;
}): LoadedPlayerSave {
  const sessionId = boundedId(input.sessionId, 'session');
  const playerId = boundedId(input.playerId, 'player');
  const catalog = parseMissionCatalog(input.catalog);
  const catalogDigest = missionCatalogDigest(catalog);
  const rawRows = input.rows.progress;
  if (!Array.isArray(rawRows)) reject('INVALID_RECORD', 'Expected progress rows', 'progress');

  let trackerRow: PersistedRecord | null = null;
  let campaignRow: PersistedRecord | null = null;
  let worldEpoch: number | null = null;
  for (const [index, raw] of rawRows.entries()) {
    const row = parsePersistedRecord(raw, 'PROGRESS');
    if (row.sessionId !== sessionId) {
      reject(
        'REFERENCE_MISSING',
        `Row ${row.recordId} belongs to ${row.sessionId}, not ${sessionId}`,
        `progress[${index}]`,
      );
    }
    worldEpoch = worldEpoch === null ? row.worldEpoch : worldEpoch;
    if (worldEpoch !== row.worldEpoch) {
      reject(
        'INVALID_RECORD',
        'Progress rows of one session belong to another world epoch',
        `progress[${index}].worldEpoch`,
      );
    }
    const kind = object(row.body, `progress[${index}].body`).kind;
    if (kind === 'MISSION_TRACKER') {
      if (trackerRow !== null) reject('INVALID_RECORD', 'Duplicate tracker row', 'progress');
      trackerRow = row;
    } else if (kind === 'CAMPAIGN_LEDGER') {
      if (campaignRow !== null) reject('INVALID_RECORD', 'Duplicate campaign row', 'progress');
      campaignRow = row;
    } else {
      reject('INVALID_RECORD', `Unknown progress row kind: ${String(kind)}`, `progress[${index}]`);
    }
  }

  const settings =
    input.rows.settings === undefined || input.rows.settings === null
      ? createDefaultSettings(playerId)
      : parseSettingsRecord(input.rows.settings);
  const settingsSource =
    input.rows.settings === undefined || input.rows.settings === null ? 'DEFAULTS' : 'STORED';
  if (settings.playerId !== playerId) {
    reject(
      'REFERENCE_MISSING',
      `The stored settings belong to ${settings.playerId}, not ${playerId}`,
      'settings.playerId',
    );
  }

  const tracker = trackerRow === null ? null : decodeTrackerRow(trackerRow, catalog);
  const campaign =
    campaignRow === null ? null : decodeCampaignRow(campaignRow, catalog, catalogDigest);

  return Object.freeze({
    version: PROGRESS_SAVE_VERSION,
    sessionId,
    playerId,
    worldEpoch,
    settings,
    settingsSource,
    tracker,
    campaign,
    categories: Object.freeze({
      settings: settingsSource === 'STORED',
      campaign: campaign !== null,
      progress: tracker !== null,
    }),
    empty: tracker === null && campaign === null && settingsSource === 'DEFAULTS',
  });
}

/**
 * Restores the mission tracker from a loaded save through the real 116 `restore`.
 *
 * A save without a tracker row (for example after an explicit `PROGRESS` reset) yields a fresh,
 * empty tracker: the reset is respected, not silently undone.
 */
export function restoreMissionProgress(input: {
  readonly save: LoadedPlayerSave;
  readonly catalog: unknown;
}): {
  readonly tracker: MissionTracker;
  readonly instances: readonly MissionInstance[];
  readonly restored: boolean;
} {
  const catalog = parseMissionCatalog(input.catalog);
  const save = input.save;
  const tracker = createMissionTracker({
    catalog,
    context: { sessionId: save.sessionId, worldEpoch: save.worldEpoch ?? 0 },
  });
  if (save.tracker === null) {
    return Object.freeze({ tracker, instances: Object.freeze([]), restored: false });
  }
  try {
    const instances = tracker.restore(save.tracker.snapshot);
    return Object.freeze({ tracker, instances, restored: true });
  } catch (error) {
    tracker.dispose();
    reject(
      'TRACKER_SNAPSHOT_INVALID',
      `The stored mission snapshot cannot be restored: ${describe(error)}`,
      'progress.tracker',
    );
  }
}

/* ------------------------------------------------------------------ save store */

export interface RestoredProgressSave {
  readonly save: LoadedPlayerSave;
  readonly tracker: MissionTracker;
  readonly instances: readonly MissionInstance[];
  readonly restored: boolean;
}

/**
 * The application-facing save port.
 *
 * `save` writes all three categories in one transaction, `load` reads them back in one read
 * transaction and decodes them, `open` additionally restores the real 116 tracker, and `reset`
 * removes exactly one category. The store never keeps a second copy of the state: it always reads
 * the database.
 */
export interface ProgressSaveStore {
  readonly catalog: MissionCatalog;
  readonly save: (
    input: PlayerSaveRequest,
    hooks?: ProfileTransactionHooks,
  ) => Promise<PlayerSaveOutcome>;
  readonly load: (input: {
    readonly sessionId: string;
    readonly playerId: string;
  }) => Promise<LoadedPlayerSave>;
  readonly open: (input: {
    readonly sessionId: string;
    readonly playerId: string;
  }) => Promise<RestoredProgressSave>;
  readonly reset: (
    input: PlayerResetRequest,
    hooks?: ProfileTransactionHooks,
  ) => Promise<PlayerResetOutcome>;
}

export function createProgressSaveStore(options: {
  readonly repository: LocalRepository;
  readonly catalog: unknown;
}): ProgressSaveStore {
  const data = exact(options, ['repository', 'catalog'], 'progress save store');
  const catalog = parseMissionCatalog(data.catalog);
  const repository = data.repository as LocalRepository;

  async function load(input: {
    readonly sessionId: string;
    readonly playerId: string;
  }): Promise<LoadedPlayerSave> {
    const rows = await repository.readPlayerSave(input.sessionId, input.playerId);
    return decodePlayerSave({ ...input, catalog, rows });
  }

  return Object.freeze({
    catalog,
    save: (input: PlayerSaveRequest, hooks?: ProfileTransactionHooks) =>
      repository.commitPlayerSave(input, hooks),
    load,
    async open(input: {
      readonly sessionId: string;
      readonly playerId: string;
    }): Promise<RestoredProgressSave> {
      const save = await load(input);
      const restored = restoreMissionProgress({ save, catalog });
      return Object.freeze({
        save,
        tracker: restored.tracker,
        instances: restored.instances,
        restored: restored.restored,
      });
    },
    reset: (input: PlayerResetRequest, hooks?: ProfileTransactionHooks) =>
      repository.resetPlayerSave(input, hooks),
  });
}

/** Closed rejection codes this layer adds to the shared 127 vocabulary. */
export const progressSaveRejectionCodes = Object.freeze([
  'CATALOG_MISMATCH',
  'LEDGER_REPLAY_MISMATCH',
  'TRACKER_SNAPSHOT_INVALID',
  'SAVE_DIGEST_MISMATCH',
  'SAVE_CATEGORY_UNKNOWN',
  'SAVE_EMPTY',
] as const);
export type ProgressSaveRejectionCode = (typeof progressSaveRejectionCodes)[number];

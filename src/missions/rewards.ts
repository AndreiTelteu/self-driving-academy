import { fleetDriverKinds } from '../fleet';
import type { FleetDriverKind } from '../fleet';
import { choice, list, record, requireContract, tick } from '../sessions';
import { VEHICLE_CLASSES } from '../vehicles';
import type { VehicleClassId } from '../vehicles';
import { MISSION_LIMITS, boundedId, compareText, plainFields, requireRequired } from './contracts';
import {
  campaignOrder,
  missionInstanceId,
  missionRewardId,
  missionStates,
  parseMissionCatalog,
} from './definitions';
import type {
  MissionCatalog,
  MissionDefinition,
  MissionReward,
  MissionRewardKind,
} from './definitions';

/**
 * 125 progress, rewards and unlocks.
 *
 * This module joins three delivered contracts without forking any of them:
 *
 * - the campaign is the real 116 catalog: mission ids, prerequisites and authored rewards;
 * - a completion is a real 116 `MissionInstance` in the `COMPLETED` state, with its stable
 *   `(namespace, missionId, attempt)` identity and its `completedTick`. Nothing here invents a
 *   completion, a score or an objective: 116 already judged the mission from validated 007 events;
 * - the fleet is the real 057 registry (read-only): vehicle identity, driver kind and 023 class.
 *
 * The three answers are kept in three separate read models, never folded into one structure:
 *
 * - `progress()` answers "which challenges can I play" — `LOCKED`, `AVAILABLE`, `COMPLETED`, the
 *   missing prerequisites and the next attempt of every campaign mission;
 * - `unlocks()` answers "which capabilities did I open" — a monotone, append-only capability list
 *   with the base capabilities (`access:drive-existing-vehicles`, `access:select-any-taxi`, one
 *   `vehicle-class:<id>` per real 023 class) always first;
 * - `rewards()` answers "what was granted, once" — one row per authored 116 reward with the stable
 *   116 reward identity and the completion that produced it.
 *
 * Reward idempotency is by identity, not by "we ran it again". The key is the 116
 * `missionRewardId(namespace, missionId, definitionVersion, rewardId)`, and the completion key is
 * the 116 `missionInstanceId(namespace, missionId, attempt)`. That is sufficient because a reward is
 * authored per definition version: re-delivering the same completion finds the same completion id
 * and changes nothing, and a later attempt of the same definition finds the same reward key and is
 * reported as a duplicate instead of paying twice. A new definition version is a new authored
 * reward with its own identity, so it is granted normally.
 *
 * A mission reset restores that mission's playable progress (its completion records and attempt
 * counter), keeps every granted reward and every unlock, and never touches a profile: the ledger has
 * no profile store at all (`profileWrites: 0`). Because campaign availability is derived from real
 * completions, a mission whose prerequisite was reset returns to `LOCKED` until it is completed
 * again — a reset of one mission never rewrites another mission's records.
 *
 * The module owns no clock, DOM, renderer, profile store, learning queue or random source.
 */
export const REWARDS_SCHEMA_VERSION = '125-mission-rewards-v1' as const;

export const REWARDS_LIMITS = Object.freeze({
  version: REWARDS_SCHEMA_VERSION,
  /** Authored campaign missions in one catalog (116 capacity). */
  missions: MISSION_LIMITS.missions,
  /** Completed attempts retained per mission (116 replay capacity). */
  completionsPerMission: MISSION_LIMITS.attemptsPerMission,
  /** Retained completion records across the campaign. */
  completions: 256,
  /** Granted reward rows retained across the campaign. */
  rewards: 256,
  /** Unlocked capabilities retained across the campaign. */
  capabilities: 128,
  /** Real 057 fleet capacity accepted by the access proof. */
  vehicles: 70,
  /** Code units per mission, reward, capability, completion and vehicle identity. */
  idCodeUnits: MISSION_LIMITS.idCodeUnits,
});

/** Closed campaign states of one mission; derived from real completions and declared prerequisites. */
export const campaignMissionStates = ['LOCKED', 'AVAILABLE', 'COMPLETED'] as const;
export type CampaignMissionState = (typeof campaignMissionStates)[number];

export const missionCapabilityKinds = [
  'BASE_ACCESS',
  'CHALLENGE',
  'VEHICLE_CLASS',
  'ANALYSIS_TOOL',
] as const;
export type MissionCapabilityKind = (typeof missionCapabilityKinds)[number];

/** Closed settlement verdicts: a new completion paid, a new completion that paid nothing, or a repeat. */
export const missionSettlementStatuses = ['GRANTED', 'NO_REWARD', 'DUPLICATE'] as const;
export type MissionSettlementStatus = (typeof missionSettlementStatuses)[number];

export const missionRewardGrantStatuses = ['GRANTED', 'DUPLICATE'] as const;
export type MissionRewardGrantStatus = (typeof missionRewardGrantStatuses)[number];

/** Closed reasons a reward row was not paid again. */
export const missionDuplicateReasons = [
  'COMPLETION_ALREADY_SETTLED',
  'REWARD_ALREADY_GRANTED',
] as const;
export type MissionDuplicateReason = (typeof missionDuplicateReasons)[number];

/**
 * The published identity policy. It is documentation that cannot drift from the implementation:
 * every field is asserted by the tests and by the deterministic report.
 */
export const MISSION_REWARD_IDENTITY = Object.freeze({
  id: 'MISSION_VERSION' as const,
  /** Stable 116 reward identity: one authored reward per definition version. */
  rewardKey: 'namespace + missionId + definitionVersion + rewardId',
  /** Stable 116 completion identity: one attempt of one mission. */
  completionKey: 'namespace + missionId + attempt',
  xpScope: 'MISSION_VERSION' as const,
  unlockScope: 'MISSION_VERSION' as const,
  replayGrants: false,
  replay:
    'O reluare creează o finalizare nouă, dar recompensa autorată aparține versiunii definiției, deci este raportată ca duplicat și nu plătește din nou.',
  whySufficient:
    'Cheia include namespace-ul, misiunea, versiunea definiției și recompensa, iar finalizarea include încercarea. O aceeași finalizare are aceeași cheie de finalizare, deci o livrare repetată nu schimbă nimic; o altă încercare a aceleiași versiuni are altă cheie de finalizare, dar aceeași cheie de recompensă, deci este raportată explicit ca duplicat.',
});

export interface MissionCapability {
  readonly capabilityId: string;
  readonly kind: MissionCapabilityKind;
  /** `BASE` capabilities exist from the first second and are never removed. */
  readonly source: 'BASE' | 'MISSION_REWARD';
  readonly missionId: string | null;
  readonly missionVersion: string | null;
  readonly definitionRewardId: string | null;
  /** 1-based grant order; `0` for a base capability. */
  readonly order: number;
}

const realClassIds = Object.freeze(Object.keys(VEHICLE_CLASSES) as VehicleClassId[]);

function baseCapability(capabilityId: string, kind: MissionCapabilityKind): MissionCapability {
  return Object.freeze({
    capabilityId,
    kind,
    source: 'BASE' as const,
    missionId: null,
    missionVersion: null,
    definitionRewardId: null,
    order: 0,
  });
}

/**
 * Capabilities the player has before any campaign progress: every existing vehicle can be driven and
 * any taxi can be selected (Docs/13), plus one `vehicle-class:<id>` capability per real 023 class.
 */
export const MISSION_BASE_CAPABILITIES: readonly MissionCapability[] = Object.freeze([
  baseCapability('access:drive-existing-vehicles', 'BASE_ACCESS'),
  baseCapability('access:select-any-taxi', 'BASE_ACCESS'),
  ...realClassIds.map((classId) => baseCapability(`vehicle-class:${classId}`, 'VEHICLE_CLASS')),
]);

export const MISSION_BASE_ACCESS = Object.freeze({
  driveExistingVehicles: true,
  selectAnyTaxi: true,
  statement:
    'Orice vehicul existent poate fi condus și orice taxi poate fi selectat de la început; o deblocare doar adaugă capabilități.',
});

export interface MissionCompletionRef {
  /** The 116 instance identity, which is also the completion identity. */
  readonly completionId: string;
  readonly attempt: number;
  readonly completedTick: number;
}

export interface CampaignMissionProgress {
  readonly missionId: string;
  readonly title: string;
  readonly definitionVersion: string;
  /** 1-based position in the prerequisite DAG, not the array position. */
  readonly order: number;
  readonly state: CampaignMissionState;
  readonly prerequisites: readonly string[];
  readonly missingPrerequisites: readonly string[];
  /** Completed attempts retained for this mission in the current campaign run. */
  readonly attempts: number;
  /** Next attempt that can be completed, or `null` when the 116 replay capacity is exhausted. */
  readonly nextAttempt: number | null;
  /** `AVAILABLE`/`COMPLETED` with a free attempt; a `LOCKED` mission is not playable. */
  readonly playable: boolean;
  readonly completions: readonly MissionCompletionRef[];
  readonly lastCompletedTick: number | null;
  /** Explicit resets of this mission; they change nothing about granted rewards. */
  readonly resets: number;
  readonly rewardsGranted: number;
  readonly unlockedCapabilities: readonly string[];
}

export interface CampaignProgress {
  readonly version: typeof REWARDS_SCHEMA_VERSION;
  readonly namespace: string;
  readonly order: readonly string[];
  readonly missions: readonly CampaignMissionProgress[];
  readonly completedMissionIds: readonly string[];
  readonly availableMissionIds: readonly string[];
  readonly lockedMissionIds: readonly string[];
  readonly nextMissionId: string | null;
  readonly counts: Readonly<{
    missions: number;
    completed: number;
    available: number;
    locked: number;
  }>;
}

export interface MissionRewardGrantFact {
  /** Stable 116 reward identity. */
  readonly rewardId: string;
  /** The 116 completion that produced this grant. */
  readonly completionId: string;
  readonly missionId: string;
  readonly missionVersion: string;
  readonly definitionRewardId: string;
  readonly kind: MissionRewardKind;
  readonly amount: number;
  readonly unlockId: string | null;
  /** Capability opened by an unlock reward; `null` for XP. */
  readonly capabilityId: string | null;
  readonly grantedTick: number;
  /** 1-based grant order across the campaign. */
  readonly order: number;
}

export interface MissionRewardsSnapshot {
  readonly version: typeof REWARDS_SCHEMA_VERSION;
  readonly namespace: string;
  readonly identity: typeof MISSION_REWARD_IDENTITY;
  readonly grants: readonly MissionRewardGrantFact[];
  readonly byMission: readonly Readonly<{
    missionId: string;
    granted: number;
    xp: number;
    unlocks: number;
  }>[];
  readonly totals: Readonly<{
    granted: number;
    xp: number;
    unlocks: number;
    duplicates: number;
  }>;
}

export interface MissionUnlockSnapshot {
  readonly version: typeof REWARDS_SCHEMA_VERSION;
  readonly namespace: string;
  /** Base capabilities, always present and never locked. */
  readonly base: readonly MissionCapability[];
  /** Capabilities opened by mission rewards, in grant order; append-only. */
  readonly capabilities: readonly MissionCapability[];
  readonly byKind: Readonly<Record<MissionCapabilityKind, readonly string[]>>;
  readonly counts: Readonly<{ base: number; granted: number; total: number }>;
  readonly monotone: true;
  readonly baseAccess: typeof MISSION_BASE_ACCESS;
}

export interface MissionSettledReward {
  readonly definitionRewardId: string;
  readonly rewardId: string;
  readonly kind: MissionRewardKind;
  readonly amount: number;
  readonly unlockId: string | null;
  readonly capabilityId: string | null;
  readonly status: MissionRewardGrantStatus;
  readonly reason: MissionDuplicateReason | null;
}

export interface MissionCompletionResult {
  readonly version: typeof REWARDS_SCHEMA_VERSION;
  readonly namespace: string;
  readonly missionId: string;
  readonly missionVersion: string;
  readonly attempt: number;
  readonly completionId: string;
  readonly completedTick: number;
  readonly status: MissionSettlementStatus;
  readonly rewards: readonly MissionSettledReward[];
  readonly rewardsGranted: number;
  readonly rewardsDuplicate: number;
  readonly xpGranted: number;
  /** Capability ids opened by this settlement; empty on a duplicate or a repeat. */
  readonly unlocked: readonly string[];
  readonly duplicateReasons: readonly MissionDuplicateReason[];
  readonly profileWrites: 0;
  readonly learningJobs: 0;
}

export interface MissionResetInfo {
  readonly version: typeof REWARDS_SCHEMA_VERSION;
  readonly namespace: string;
  readonly missionId: string;
  readonly tick: number;
  readonly clearedCompletions: number;
  readonly resets: number;
  /** Rewards kept by the reset; they are never deleted. */
  readonly rewardsRetained: number;
  /** Unlocks kept by the reset; they are monotone. */
  readonly unlocksRetained: number;
  readonly progress: CampaignMissionProgress;
  readonly profileWrites: 0;
}

export interface MissionRewardsStats {
  readonly version: typeof REWARDS_SCHEMA_VERSION;
  readonly namespace: string;
  readonly missions: number;
  readonly completions: number;
  readonly rewards: number;
  readonly capabilities: number;
  readonly resets: number;
  readonly tick: number;
}

export interface MissionRewardsLedger {
  readonly namespace: string;
  catalog(): MissionCatalog;
  /** Consumes one real completed 116 instance; a repeat changes nothing. */
  settle(value: unknown): MissionCompletionResult;
  /** Campaign progress: which challenges are locked, available or completed. */
  progress(): CampaignProgress;
  /** Granted rewards, once per authored 116 reward identity. */
  rewards(): MissionRewardsSnapshot;
  /** Monotone unlock list: base capabilities plus every opened capability, in grant order. */
  unlocks(): MissionUnlockSnapshot;
  /** Restores one mission to playable progress; keeps rewards, unlocks and profiles untouched. */
  resetMission(value: unknown): MissionResetInfo;
  completion(completionId: string): MissionCompletionRef | undefined;
  stats(): MissionRewardsStats;
}

export interface MissionVehicleFact {
  readonly vehicleId: string;
  readonly driverKind: FleetDriverKind;
  readonly classId: VehicleClassId;
}

export interface MissionVehicleAccessRow {
  readonly vehicleId: string;
  readonly driverKind: FleetDriverKind;
  readonly classId: VehicleClassId;
  /** The class is a real 023 class opened by a base or granted capability. */
  readonly driveable: boolean;
  /** Any taxi of the real 057 registry stays selectable. */
  readonly taxiSelectable: boolean;
}

export interface MissionVehicleAccess {
  readonly version: typeof REWARDS_SCHEMA_VERSION;
  readonly vehicles: number;
  readonly taxis: number;
  readonly civilians: number;
  readonly vehiclesDriveable: number;
  readonly taxisSelectable: number;
  readonly byClass: readonly Readonly<{
    classId: VehicleClassId;
    vehicles: number;
    driveable: number;
    taxis: number;
  }>[];
  /** Structural: a monotone unlock list cannot revoke access. */
  readonly revoked: readonly string[];
  /** Structural: no taxi can be blocked by progress. */
  readonly blockedTaxis: readonly string[];
  readonly baseCapabilitiesPresent: boolean;
  readonly rows: readonly MissionVehicleAccessRow[];
}

const settleFields = ['instance'] as const;
const resetFields = ['missionId', 'tick'] as const;
const ledgerFields = ['catalog'] as const;

interface CompletionFacts {
  readonly missionId: string;
  readonly missionVersion: string;
  readonly attempt: number;
  readonly completionId: string;
  readonly completedTick: number;
}

function capabilityKindOf(kind: MissionRewardKind): MissionCapabilityKind | null {
  switch (kind) {
    case 'XP':
      return null;
    case 'UNLOCK_CHALLENGE':
      return 'CHALLENGE';
    case 'UNLOCK_VEHICLE_CLASS':
      return 'VEHICLE_CLASS';
    case 'UNLOCK_ANALYSIS_TOOL':
      return 'ANALYSIS_TOOL';
  }
}

function rewardCapabilityId(reward: MissionReward): string | null {
  if (reward.kind === 'XP') return null;
  requireContract(reward.unlockId !== null, 'An unlock reward requires an unlock identity');
  return reward.unlockId;
}

/** Reads the 116 identity fields this module relies on from a real instance projection. */
function readCompletionFacts(value: unknown, namespace: string): CompletionFacts {
  const data = plainFields(value, settleFields, 'mission completion');
  requireRequired(data, 'instance', 'mission completion');
  const instance = record(data.instance);
  const state = choice(instance.state, missionStates);
  requireContract(
    state === 'COMPLETED',
    `Mission completion requires a completed 116 instance, not ${state}`,
  );
  const missionId = boundedId(instance.missionId, REWARDS_LIMITS.idCodeUnits, 'mission');
  const missionVersion = boundedId(
    instance.missionVersion,
    MISSION_LIMITS.versionCodeUnits,
    'mission version',
  );
  const attempt = tick(instance.attempt);
  requireContract(
    attempt >= 1 && attempt <= REWARDS_LIMITS.completionsPerMission,
    'Mission completion attempt is outside the 116 replay capacity',
  );
  const completionId = boundedId(
    instance.instanceId,
    MISSION_LIMITS.instanceIdCodeUnits,
    'mission instance',
  );
  requireContract(
    completionId === missionInstanceId(namespace, missionId, attempt),
    'Mission completion identity is not the stable 116 instance identity',
  );
  const completedTick = tick(instance.completedTick);
  return Object.freeze({
    missionId,
    missionVersion,
    attempt,
    completionId,
    completedTick,
  });
}

function emptyCapabilityRecord(): Record<MissionCapabilityKind, string[]> {
  return {
    BASE_ACCESS: [],
    CHALLENGE: [],
    VEHICLE_CLASS: [],
    ANALYSIS_TOOL: [],
  };
}

function toCompletionRef(facts: CompletionFacts): MissionCompletionRef {
  return Object.freeze({
    completionId: facts.completionId,
    attempt: facts.attempt,
    completedTick: facts.completedTick,
  });
}

export function createMissionRewardsLedger(options: unknown): MissionRewardsLedger {
  const option = plainFields(options, ledgerFields, 'mission rewards option');
  requireRequired(option, 'catalog', 'mission rewards option');
  const catalog = parseMissionCatalog(option.catalog);
  const namespace = catalog.namespace;
  const definitions = new Map(catalog.missions.map((mission) => [mission.missionId, mission]));
  const order = campaignOrder(catalog);
  const orderIndex = new Map(order.map((missionId, index) => [missionId, index + 1]));

  /** Completion records of the current campaign run, per mission, in completion order. */
  const completed = new Map<string, CompletionFacts[]>();
  const completions = new Map<string, CompletionFacts>();
  /** Reward ledger keyed by the stable 116 reward identity. */
  const rewardLedger = new Map<string, MissionRewardGrantFact>();
  /** Monotone capability list keyed by capability id. */
  const capabilities = new Map<string, MissionCapability>();
  const resets = new Map<string, number>();

  let lastTick = 0;
  let duplicateCompletions = 0;
  let duplicateRewards = 0;

  function definitionOf(missionId: string): MissionDefinition {
    const definition = definitions.get(missionId);
    requireContract(definition !== undefined, `Unknown mission definition: ${missionId}`);
    return definition;
  }

  function completedIds(): Set<string> {
    const ids = new Set<string>();
    for (const [missionId, entries] of completed) if (entries.length > 0) ids.add(missionId);
    return ids;
  }

  function progressOf(definition: MissionDefinition, done: Set<string>): CampaignMissionProgress {
    const entries = completed.get(definition.missionId) ?? [];
    const missing = definition.prerequisites.filter((id) => !done.has(id));
    const state: CampaignMissionState = done.has(definition.missionId)
      ? 'COMPLETED'
      : missing.length === 0
        ? 'AVAILABLE'
        : 'LOCKED';
    const attempts = entries.length;
    const nextAttempt = attempts < REWARDS_LIMITS.completionsPerMission ? attempts + 1 : null;
    const grants = [...rewardLedger.values()].filter(
      (grant) => grant.missionId === definition.missionId,
    );
    return Object.freeze({
      missionId: definition.missionId,
      title: definition.title,
      definitionVersion: definition.version,
      order: orderIndex.get(definition.missionId) ?? 0,
      state,
      prerequisites: definition.prerequisites,
      missingPrerequisites: Object.freeze(missing),
      attempts,
      nextAttempt,
      playable: state !== 'LOCKED' && nextAttempt !== null,
      completions: Object.freeze(entries.map(toCompletionRef)),
      lastCompletedTick: entries.length === 0 ? null : entries.at(-1)!.completedTick,
      resets: resets.get(definition.missionId) ?? 0,
      rewardsGranted: grants.length,
      unlockedCapabilities: Object.freeze(
        grants
          .map((grant) => grant.capabilityId)
          .filter((id): id is string => id !== null)
          .sort(compareText),
      ),
    });
  }

  function progress(): CampaignProgress {
    const done = completedIds();
    const missions = order.map((missionId) => progressOf(definitionOf(missionId), done));
    const completedMissionIds = missions
      .filter((entry) => entry.state === 'COMPLETED')
      .map((entry) => entry.missionId);
    const availableMissionIds = missions
      .filter((entry) => entry.state === 'AVAILABLE')
      .map((entry) => entry.missionId);
    const lockedMissionIds = missions
      .filter((entry) => entry.state === 'LOCKED')
      .map((entry) => entry.missionId);
    return Object.freeze({
      version: REWARDS_SCHEMA_VERSION,
      namespace,
      order,
      missions: Object.freeze(missions),
      completedMissionIds: Object.freeze(completedMissionIds),
      availableMissionIds: Object.freeze(availableMissionIds),
      lockedMissionIds: Object.freeze(lockedMissionIds),
      nextMissionId: availableMissionIds[0] ?? null,
      counts: Object.freeze({
        missions: missions.length,
        completed: completedMissionIds.length,
        available: availableMissionIds.length,
        locked: lockedMissionIds.length,
      }),
    });
  }

  function rewards(): MissionRewardsSnapshot {
    const grants = [...rewardLedger.values()].sort((left, right) => left.order - right.order);
    const byMission: MissionRewardsSnapshot['byMission'] = order
      .map((missionId) => {
        const rows = grants.filter((grant) => grant.missionId === missionId);
        return Object.freeze({
          missionId,
          granted: rows.length,
          xp: rows.reduce((total, row) => total + (row.kind === 'XP' ? row.amount : 0), 0),
          unlocks: rows.filter((row) => row.unlockId !== null).length,
        });
      })
      .filter((row) => row.granted > 0);
    return Object.freeze({
      version: REWARDS_SCHEMA_VERSION,
      namespace,
      identity: MISSION_REWARD_IDENTITY,
      grants: Object.freeze(grants),
      byMission: Object.freeze(byMission),
      totals: Object.freeze({
        granted: grants.length,
        xp: grants.reduce((total, row) => total + (row.kind === 'XP' ? row.amount : 0), 0),
        unlocks: grants.filter((row) => row.unlockId !== null).length,
        duplicates: duplicateRewards,
      }),
    });
  }

  function unlocks(): MissionUnlockSnapshot {
    const granted = [...capabilities.values()].sort((left, right) => left.order - right.order);
    const byKind = emptyCapabilityRecord();
    for (const capability of [...MISSION_BASE_CAPABILITIES, ...granted])
      byKind[capability.kind].push(capability.capabilityId);
    return Object.freeze({
      version: REWARDS_SCHEMA_VERSION,
      namespace,
      base: MISSION_BASE_CAPABILITIES,
      capabilities: Object.freeze(granted),
      byKind: Object.freeze({
        BASE_ACCESS: Object.freeze(byKind.BASE_ACCESS),
        CHALLENGE: Object.freeze(byKind.CHALLENGE),
        VEHICLE_CLASS: Object.freeze(byKind.VEHICLE_CLASS),
        ANALYSIS_TOOL: Object.freeze(byKind.ANALYSIS_TOOL),
      }),
      counts: Object.freeze({
        base: MISSION_BASE_CAPABILITIES.length,
        granted: granted.length,
        total: MISSION_BASE_CAPABILITIES.length + granted.length,
      }),
      monotone: true as const,
      baseAccess: MISSION_BASE_ACCESS,
    });
  }

  function settle(value: unknown): MissionCompletionResult {
    const facts = readCompletionFacts(value, namespace);
    const definition = definitionOf(facts.missionId);
    requireContract(
      definition.version === facts.missionVersion,
      `Mission completion version ${facts.missionVersion} does not match the catalog ${definition.version}`,
    );

    const known = completions.get(facts.completionId);
    if (known !== undefined) {
      requireContract(
        known.missionId === facts.missionId &&
          known.attempt === facts.attempt &&
          known.completedTick === facts.completedTick,
        'Conflicting mission completion identity',
      );
      duplicateCompletions += 1;
      duplicateRewards += definition.rewards.length;
      return Object.freeze({
        version: REWARDS_SCHEMA_VERSION,
        namespace,
        missionId: facts.missionId,
        missionVersion: facts.missionVersion,
        attempt: facts.attempt,
        completionId: facts.completionId,
        completedTick: facts.completedTick,
        status: 'DUPLICATE' as const,
        rewards: Object.freeze(
          definition.rewards.map((reward) =>
            Object.freeze({
              definitionRewardId: reward.rewardId,
              rewardId: missionRewardId(
                namespace,
                facts.missionId,
                facts.missionVersion,
                reward.rewardId,
              ),
              kind: reward.kind,
              amount: reward.amount,
              unlockId: reward.unlockId,
              capabilityId: rewardCapabilityId(reward),
              status: 'DUPLICATE' as const,
              reason: 'COMPLETION_ALREADY_SETTLED' as const,
            }),
          ),
        ),
        rewardsGranted: 0,
        rewardsDuplicate: definition.rewards.length,
        xpGranted: 0,
        unlocked: Object.freeze([]),
        duplicateReasons: Object.freeze(['COMPLETION_ALREADY_SETTLED' as const]),
        profileWrites: 0 as const,
        learningJobs: 0 as const,
      });
    }

    const previousAttempts = completed.get(facts.missionId) ?? [];
    requireContract(facts.completedTick >= lastTick, 'Stale mission completion tick');
    requireContract(
      facts.attempt === previousAttempts.length + 1,
      `Mission completion attempt ${facts.attempt} is not the next attempt of ${facts.missionId}`,
    );
    requireContract(
      completions.size < REWARDS_LIMITS.completions,
      'Mission completion capacity exceeded',
    );

    const rows: MissionSettledReward[] = [];
    const unlocked: string[] = [];
    const reasons: MissionDuplicateReason[] = [];
    let granted = 0;
    let duplicated = 0;
    let xpGranted = 0;
    for (const reward of definition.rewards) {
      const rewardId = missionRewardId(
        namespace,
        facts.missionId,
        facts.missionVersion,
        reward.rewardId,
      );
      requireContract(
        rewardId.length <= MISSION_LIMITS.rewardIdCodeUnits,
        'Mission reward identity exceeds the code-unit limit',
      );
      const existing = rewardLedger.get(rewardId);
      if (existing !== undefined) {
        duplicated += 1;
        duplicateRewards += 1;
        if (!reasons.includes('REWARD_ALREADY_GRANTED')) reasons.push('REWARD_ALREADY_GRANTED');
        rows.push(
          Object.freeze({
            definitionRewardId: reward.rewardId,
            rewardId,
            kind: reward.kind,
            amount: reward.amount,
            unlockId: reward.unlockId,
            capabilityId: rewardCapabilityId(reward),
            status: 'DUPLICATE' as const,
            reason: 'REWARD_ALREADY_GRANTED' as const,
          }),
        );
        continue;
      }
      requireContract(
        rewardLedger.size < REWARDS_LIMITS.rewards,
        'Mission reward capacity exceeded',
      );
      const capabilityId = rewardCapabilityId(reward);
      const grant: MissionRewardGrantFact = Object.freeze({
        rewardId,
        completionId: facts.completionId,
        missionId: facts.missionId,
        missionVersion: facts.missionVersion,
        definitionRewardId: reward.rewardId,
        kind: reward.kind,
        amount: reward.amount,
        unlockId: reward.unlockId,
        capabilityId,
        grantedTick: facts.completedTick,
        order: rewardLedger.size + 1,
      });
      rewardLedger.set(rewardId, grant);
      granted += 1;
      if (reward.kind === 'XP') xpGranted += reward.amount;
      if (capabilityId !== null && !capabilities.has(capabilityId)) {
        const kind = capabilityKindOf(reward.kind);
        requireContract(kind !== null, 'An unlock reward must open a capability');
        requireContract(
          capabilities.size < REWARDS_LIMITS.capabilities,
          'Mission unlock capacity exceeded',
        );
        capabilities.set(
          capabilityId,
          Object.freeze({
            capabilityId,
            kind,
            source: 'MISSION_REWARD' as const,
            missionId: facts.missionId,
            missionVersion: facts.missionVersion,
            definitionRewardId: reward.rewardId,
            order: capabilities.size + 1,
          }),
        );
        unlocked.push(capabilityId);
      }
      rows.push(
        Object.freeze({
          definitionRewardId: reward.rewardId,
          rewardId,
          kind: reward.kind,
          amount: reward.amount,
          unlockId: reward.unlockId,
          capabilityId,
          status: 'GRANTED' as const,
          reason: null,
        }),
      );
    }

    const next = [...previousAttempts, facts];
    completed.set(facts.missionId, next);
    completions.set(facts.completionId, facts);
    lastTick = facts.completedTick;

    return Object.freeze({
      version: REWARDS_SCHEMA_VERSION,
      namespace,
      missionId: facts.missionId,
      missionVersion: facts.missionVersion,
      attempt: facts.attempt,
      completionId: facts.completionId,
      completedTick: facts.completedTick,
      status: granted > 0 ? ('GRANTED' as const) : ('NO_REWARD' as const),
      rewards: Object.freeze(rows),
      rewardsGranted: granted,
      rewardsDuplicate: duplicated,
      xpGranted,
      unlocked: Object.freeze(unlocked),
      duplicateReasons: Object.freeze(reasons),
      profileWrites: 0 as const,
      learningJobs: 0 as const,
    });
  }

  function resetMission(value: unknown): MissionResetInfo {
    const data = plainFields(value, resetFields, 'mission reset');
    for (const key of resetFields) requireRequired(data, key, 'mission reset');
    const missionId = boundedId(data.missionId, REWARDS_LIMITS.idCodeUnits, 'mission');
    const atTick = tick(data.tick);
    requireContract(atTick >= lastTick, 'Stale mission reset tick');
    const definition = definitionOf(missionId);
    const entries = completed.get(missionId) ?? [];
    for (const entry of entries) completions.delete(entry.completionId);
    completed.delete(missionId);
    const resetsForMission = (resets.get(missionId) ?? 0) + 1;
    resets.set(missionId, resetsForMission);
    lastTick = atTick;
    const done = completedIds();
    return Object.freeze({
      version: REWARDS_SCHEMA_VERSION,
      namespace,
      missionId,
      tick: atTick,
      clearedCompletions: entries.length,
      resets: resetsForMission,
      rewardsRetained: rewardLedger.size,
      unlocksRetained: capabilities.size,
      progress: progressOf(definition, done),
      profileWrites: 0 as const,
    });
  }

  function stats(): MissionRewardsStats {
    return Object.freeze({
      version: REWARDS_SCHEMA_VERSION,
      namespace,
      missions: catalog.missions.length,
      completions: completions.size,
      rewards: rewardLedger.size,
      capabilities: capabilities.size,
      resets: [...resets.values()].reduce((total, count) => total + count, 0),
      tick: lastTick,
    });
  }

  return Object.freeze({
    namespace,
    catalog: () => catalog,
    settle,
    progress,
    rewards,
    unlocks,
    resetMission,
    completion(completionId: string): MissionCompletionRef | undefined {
      const entry = completions.get(completionId);
      return entry === undefined ? undefined : toCompletionRef(entry);
    },
    stats,
  });
}

/** Closed field list of a real 057 `FleetVehicle` projection used by the access proof. */
function readVehicle(value: unknown): MissionVehicleFact {
  const data = record(value);
  const vehicleId = boundedId(data.vehicleId, REWARDS_LIMITS.idCodeUnits, 'vehicle');
  const driverKind = choice(data.driverKind, fleetDriverKinds);
  const classId = choice(data.classId, realClassIds);
  return Object.freeze({ vehicleId, driverKind, classId });
}

/**
 * Proves that an unlock list only adds access. It reads the real 057 fleet projection and answers,
 * per vehicle, whether it can be driven and whether a taxi can be selected. The list is monotone, so
 * `revoked` and `blockedTaxis` are structural zeros: no progress state can take a vehicle or a taxi
 * away from the player.
 */
export function missionVehicleAccess(
  unlocks: MissionUnlockSnapshot,
  vehicles: unknown,
): MissionVehicleAccess {
  requireContract(
    unlocks.version === REWARDS_SCHEMA_VERSION,
    'Mission vehicle access requires a 125 unlock snapshot',
  );
  const facts = list(vehicles, readVehicle);
  requireContract(
    facts.length <= REWARDS_LIMITS.vehicles,
    'Mission vehicle access exceeds the 057 fleet capacity',
  );
  const openClasses = new Set<string>();
  for (const capability of [...unlocks.base, ...unlocks.capabilities])
    if (capability.kind === 'VEHICLE_CLASS') openClasses.add(capability.capabilityId);
  const rows: MissionVehicleAccessRow[] = [];
  let taxis = 0;
  let civilians = 0;
  let driveable = 0;
  let selectable = 0;
  for (const fact of facts) {
    const canDrive = openClasses.has(`vehicle-class:${fact.classId}`);
    const canSelect = fact.driverKind === 'TAXI';
    if (fact.driverKind === 'TAXI') taxis += 1;
    else civilians += 1;
    if (canDrive) driveable += 1;
    if (canSelect) selectable += 1;
    rows.push(
      Object.freeze({
        vehicleId: fact.vehicleId,
        driverKind: fact.driverKind,
        classId: fact.classId,
        driveable: canDrive,
        taxiSelectable: canSelect,
      }),
    );
  }
  const byClass = realClassIds.map((classId) => {
    const ofClass = facts.filter((fact) => fact.classId === classId);
    return Object.freeze({
      classId,
      vehicles: ofClass.length,
      driveable: ofClass.filter(() => openClasses.has(`vehicle-class:${classId}`)).length,
      taxis: ofClass.filter((fact) => fact.driverKind === 'TAXI').length,
    });
  });
  const baseCapabilitiesPresent = MISSION_BASE_CAPABILITIES.every((capability) =>
    [...unlocks.base, ...unlocks.capabilities].some(
      (candidate) => candidate.capabilityId === capability.capabilityId,
    ),
  );
  return Object.freeze({
    version: REWARDS_SCHEMA_VERSION,
    vehicles: facts.length,
    taxis,
    civilians,
    vehiclesDriveable: driveable,
    taxisSelectable: selectable,
    byClass: Object.freeze(byClass),
    revoked: Object.freeze([]),
    blockedTaxis: Object.freeze([]),
    baseCapabilitiesPresent,
    rows: Object.freeze(rows),
  });
}

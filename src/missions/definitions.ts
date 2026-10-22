import { choice, createStableId, list, number, record, requireContract } from '../sessions';
import type { SimulationEvent } from '../simulation';
import {
  MISSION_LIMITS,
  MISSION_SCHEMA_VERSION,
  boundedId,
  compareText,
  frozenSorted,
  plainFields,
  requireRequired,
} from './contracts';

/**
 * 116 mission definitions: a mission has a stable id, an explicit definition version, objectives,
 * rewards and a replay declaration. Nothing here reads a clock, a profile, the DOM or a renderer.
 *
 * Objectives name the real 007 simulation event that advances them. A mission never counts HUD
 * text, a rendered frame or a caller-supplied score: the lifecycle only accepts validated
 * `SimulationEvent` values (see `lifecycle.ts`).
 */
export const missionDifficulties = ['EASY', 'NORMAL', 'HARD'] as const;
export type MissionDifficulty = (typeof missionDifficulties)[number];

export const missionStates = ['ACTIVE', 'COMPLETED', 'FAILED'] as const;
export type MissionState = (typeof missionStates)[number];

export const MISSION_TERMINAL_STATES = ['COMPLETED', 'FAILED'] as const;
export type MissionTerminalState = (typeof MISSION_TERMINAL_STATES)[number];

/** Explicit failure vocabulary; a FAILED instance always carries exactly one of these. */
export const MISSION_FAILURE_REASONS = [
  'EVALUATION_WINDOW_EXPIRED',
  'INCIDENT_BUDGET_EXCEEDED',
  'SCENARIO_RESET',
  'PLAYER_ABANDONED',
] as const;
export type MissionFailureReason = (typeof MISSION_FAILURE_REASONS)[number];

/** Closed objective vocabulary; each kind consumes only real event payload values. */
export const missionObjectiveKinds = [
  'DROPOFFS',
  'MANUAL_DROPOFFS',
  'CLEAN_DROPOFFS',
  'LEARNING_ACTIVATIONS',
  'DISTINCT_PROFILE_VERSIONS',
  'FULL_STOPS',
  'LANE_CHANGES',
  'LEADER_ACQUIRED',
] as const;
export type MissionObjectiveKind = (typeof missionObjectiveKinds)[number];

/** The real 007 event types a mission tracker observes for every objective kind. */
export const MISSION_OBJECTIVE_EVENT_TYPES: Readonly<
  Record<MissionObjectiveKind, readonly SimulationEvent['type'][]>
> = Object.freeze({
  DROPOFFS: Object.freeze(['DROPOFF'] as const),
  MANUAL_DROPOFFS: Object.freeze(['DROPOFF', 'MANUAL_START'] as const),
  CLEAN_DROPOFFS: Object.freeze(['DROPOFF', 'COLLISION'] as const),
  LEARNING_ACTIVATIONS: Object.freeze(['PROFILE_ACTIVATE'] as const),
  DISTINCT_PROFILE_VERSIONS: Object.freeze(['PROFILE_ACTIVATE'] as const),
  FULL_STOPS: Object.freeze(['FULL_STOP'] as const),
  LANE_CHANGES: Object.freeze(['LANE_CHANGE_COMPLETED'] as const),
  LEADER_ACQUIRED: Object.freeze(['LEADER_ACQUIRED'] as const),
});

export const missionRewardKinds = [
  'XP',
  'UNLOCK_CHALLENGE',
  'UNLOCK_VEHICLE_CLASS',
  'UNLOCK_ANALYSIS_TOOL',
] as const;
export type MissionRewardKind = (typeof missionRewardKinds)[number];

export const missionReplayProfileSources = ['CURRENT', 'SNAPSHOT'] as const;
export type MissionReplayProfileSource = (typeof missionReplayProfileSources)[number];

export interface MissionDifficultyTargets {
  readonly NORMAL: number;
  readonly EASY?: number;
  readonly HARD?: number;
}

export interface MissionObjective {
  readonly objectiveId: string;
  readonly kind: MissionObjectiveKind;
  /** Authored rule text for evidence; never an input to progress. */
  readonly label: string;
  readonly target: number;
  readonly difficultyTargets: MissionDifficultyTargets;
  /** Optional `FULL_STOP.durationS` floor in seconds; `null` for every other kind. */
  readonly minDurationS: number | null;
  /** Optional `PROFILE_ACTIVATE.profileId` filter; `null` accepts any profile. */
  readonly profileId: string | null;
}

export interface MissionReward {
  readonly rewardId: string;
  readonly kind: MissionRewardKind;
  /** XP amount; `0` for unlock rewards. */
  readonly amount: number;
  /** Unlock identity; `null` for XP rewards. */
  readonly unlockId: string | null;
}

export interface MissionReplay {
  readonly profileSource: MissionReplayProfileSource;
  /** Present exactly when `profileSource` is `SNAPSHOT`. */
  readonly snapshotId: string | null;
  /** Declared comparison scenario; required when comparison profiles are named. */
  readonly scenarioId: string | null;
  /** Declared profiles a comparison mission uses; empty for a single-profile replay. */
  readonly comparisonProfileIds: readonly string[];
}

export interface MissionDefinition {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly missionId: string;
  readonly version: string;
  readonly title: string;
  readonly objectives: readonly MissionObjective[];
  readonly rewards: readonly MissionReward[];
  readonly replay: MissionReplay;
  /** Evaluation window in authoritative sim ticks; `null` means "until completed". */
  readonly windowTicks: number | null;
  /** Collisions tolerated during one attempt; `null` means "no incident budget". */
  readonly incidentBudget: number | null;
  /** Campaign ordering constraint; every id must exist in the same catalog. */
  readonly prerequisites: readonly string[];
}

export interface MissionCatalog {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: typeof MISSION_SCHEMA_VERSION;
  /** Stable 006 namespace used by instance and reward identities. */
  readonly namespace: string;
  readonly missions: readonly MissionDefinition[];
}

const objectiveFields = [
  'objectiveId',
  'kind',
  'label',
  'target',
  'difficultyTargets',
  'minDurationS',
  'profileId',
] as const;

const rewardFields = ['rewardId', 'kind', 'amount', 'unlockId'] as const;

const replayFields = ['profileSource', 'snapshotId', 'scenarioId', 'comparisonProfileIds'] as const;

const definitionFields = [
  'schemaVersion',
  'units',
  'missionId',
  'version',
  'title',
  'objectives',
  'rewards',
  'replay',
  'windowTicks',
  'incidentBudget',
  'prerequisites',
] as const;

const catalogFields = ['schemaVersion', 'units', 'version', 'namespace', 'missions'] as const;

function positiveInteger(value: unknown, maximum: number, label: string): number {
  const result = number(value, 1, maximum);
  requireContract(Number.isSafeInteger(result), `${label} must be an integer`);
  return result;
}

function readDifficultyTargets(value: unknown, label: string): MissionDifficultyTargets {
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract(
      (missionDifficulties as readonly string[]).includes(key),
      `Unknown ${label} difficulty: ${key}`,
    );
  requireRequired(data, 'NORMAL', label);
  const normal = positiveInteger(data.NORMAL, 1_000_000, `${label} NORMAL target`);
  const easy =
    data.EASY === undefined
      ? undefined
      : positiveInteger(data.EASY, normal, `${label} EASY target`);
  const hard =
    data.HARD === undefined
      ? undefined
      : positiveInteger(data.HARD, 1_000_000, `${label} HARD target`);
  requireContract(hard === undefined || hard >= normal, `${label} HARD target cannot be easier`);
  const targets: MissionDifficultyTargets = Object.freeze({
    NORMAL: normal,
    ...(easy === undefined ? {} : { EASY: easy }),
    ...(hard === undefined ? {} : { HARD: hard }),
  });
  return targets;
}

function readObjective(value: unknown): MissionObjective {
  const data = plainFields(value, objectiveFields, 'mission objective');
  for (const key of objectiveFields) requireRequired(data, key, 'mission objective');
  const objectiveId = boundedId(data.objectiveId, MISSION_LIMITS.idCodeUnits, 'mission objective');
  const kind = choice(data.kind, missionObjectiveKinds);
  const label = boundedId(data.label, MISSION_LIMITS.titleCodeUnits, 'mission objective label');
  const difficultyTargets = readDifficultyTargets(data.difficultyTargets, 'mission objective');
  const minDurationS = data.minDurationS === null ? null : number(data.minDurationS, 0, 3600);
  const profileId =
    data.profileId === null
      ? null
      : boundedId(data.profileId, MISSION_LIMITS.idCodeUnits, 'profile');
  if (kind === 'FULL_STOPS') {
    requireContract(minDurationS !== null, 'FULL_STOPS requires a minimum stop duration');
  } else {
    requireContract(minDurationS === null, `Only FULL_STOPS declares minDurationS: ${kind}`);
  }
  requireContract(
    kind === 'LEARNING_ACTIVATIONS' || profileId === null,
    `Only LEARNING_ACTIVATIONS filters a profile: ${kind}`,
  );
  return Object.freeze({
    objectiveId,
    kind,
    label,
    target: difficultyTargets.NORMAL,
    difficultyTargets,
    minDurationS,
    profileId,
  });
}

function readReward(value: unknown): MissionReward {
  const data = plainFields(value, rewardFields, 'mission reward');
  for (const key of rewardFields) requireRequired(data, key, 'mission reward');
  const rewardId = boundedId(data.rewardId, MISSION_LIMITS.idCodeUnits, 'mission reward');
  const kind = choice(data.kind, missionRewardKinds);
  const amount = number(data.amount, 0, 1_000_000);
  requireContract(Number.isSafeInteger(amount), 'Mission reward amount must be an integer');
  const unlockId =
    data.unlockId === null
      ? null
      : boundedId(data.unlockId, MISSION_LIMITS.idCodeUnits, 'mission unlock');
  if (kind === 'XP') {
    requireContract(amount > 0, 'XP reward requires a positive amount');
    requireContract(unlockId === null, 'XP reward cannot carry an unlock identity');
  } else {
    requireContract(amount === 0, 'Unlock reward cannot carry an XP amount');
    requireContract(unlockId !== null, 'Unlock reward requires an unlock identity');
  }
  return Object.freeze({ rewardId, kind, amount, unlockId });
}

function readReplay(value: unknown): MissionReplay {
  const data = plainFields(value, replayFields, 'mission replay');
  for (const key of replayFields) requireRequired(data, key, 'mission replay');
  const profileSource = choice(data.profileSource, missionReplayProfileSources);
  const snapshotId =
    data.snapshotId === null
      ? null
      : boundedId(data.snapshotId, MISSION_LIMITS.idCodeUnits, 'mission snapshot');
  const scenarioId =
    data.scenarioId === null
      ? null
      : boundedId(data.scenarioId, MISSION_LIMITS.idCodeUnits, 'mission scenario');
  const comparisonProfileIds = list(data.comparisonProfileIds, (entry) =>
    boundedId(entry, MISSION_LIMITS.idCodeUnits, 'comparison profile'),
  );
  requireContract(
    comparisonProfileIds.length <= MISSION_LIMITS.comparisonProfiles,
    'Mission comparison profile capacity exceeded',
  );
  requireContract(
    new Set(comparisonProfileIds).size === comparisonProfileIds.length,
    'Duplicate mission comparison profile',
  );
  if (profileSource === 'SNAPSHOT')
    requireContract(snapshotId !== null, 'SNAPSHOT replay requires a snapshot id');
  else requireContract(snapshotId === null, 'CURRENT replay cannot declare a snapshot id');
  if (comparisonProfileIds.length > 0)
    requireContract(scenarioId !== null, 'Comparison profiles require a declared scenario');
  return Object.freeze({
    profileSource,
    snapshotId,
    scenarioId,
    comparisonProfileIds,
  });
}

/** Resolved threshold for one difficulty; an undeclared variant falls back to NORMAL. */
export function missionTargetFor(
  objective: MissionObjective,
  difficulty: MissionDifficulty,
): number {
  return objective.difficultyTargets[difficulty] ?? objective.difficultyTargets.NORMAL;
}

export function parseMissionDefinition(value: unknown): MissionDefinition {
  const data = plainFields(value, definitionFields, 'mission definition');
  for (const key of definitionFields) requireRequired(data, key, 'mission definition');
  requireContract(
    data.schemaVersion === 1 && data.units === 'SI',
    'Unsupported mission definition schema version or units',
  );
  const missionId = boundedId(data.missionId, MISSION_LIMITS.idCodeUnits, 'mission');
  const version = boundedId(data.version, MISSION_LIMITS.versionCodeUnits, 'mission version');
  const title = boundedId(data.title, MISSION_LIMITS.titleCodeUnits, 'mission title');
  const objectives = list(data.objectives, readObjective);
  requireContract(
    objectives.length > 0 && objectives.length <= MISSION_LIMITS.objectivesPerMission,
    'Mission objective capacity violated',
  );
  requireContract(
    new Set(objectives.map((entry) => entry.objectiveId)).size === objectives.length,
    'Duplicate mission objective id',
  );
  const rewards = list(data.rewards, readReward);
  requireContract(
    rewards.length > 0 && rewards.length <= MISSION_LIMITS.rewardsPerMission,
    'Mission reward capacity violated',
  );
  requireContract(
    new Set(rewards.map((entry) => entry.rewardId)).size === rewards.length,
    'Duplicate mission reward id',
  );
  const replay = readReplay(data.replay);
  const windowTicks =
    data.windowTicks === null
      ? null
      : positiveInteger(data.windowTicks, Number.MAX_SAFE_INTEGER, 'Mission window ticks');
  const incidentBudget =
    data.incidentBudget === null
      ? null
      : (() => {
          const budget = number(data.incidentBudget, 0, 1000);
          requireContract(
            Number.isSafeInteger(budget),
            'Mission incident budget must be an integer',
          );
          return budget;
        })();
  const prerequisites = list(data.prerequisites, (entry) =>
    boundedId(entry, MISSION_LIMITS.idCodeUnits, 'mission prerequisite'),
  );
  requireContract(
    new Set(prerequisites).size === prerequisites.length,
    'Duplicate mission prerequisite',
  );
  requireContract(!prerequisites.includes(missionId), 'Mission cannot require itself');
  for (const objective of objectives)
    requireContract(
      missionTargetFor(objective, 'NORMAL') === objective.target,
      'Mission NORMAL target identity mismatch',
    );
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    missionId,
    version,
    title,
    objectives,
    rewards,
    replay,
    windowTicks,
    incidentBudget,
    prerequisites,
  });
}

/** Stable instance identity: one mission attempt, never an array position or a clock. */
export function missionInstanceId(namespace: string, missionId: string, attempt: number): string {
  requireContract(
    Number.isSafeInteger(attempt) && attempt >= 1 && attempt <= MISSION_LIMITS.attemptsPerMission,
    'Invalid mission attempt',
  );
  return createStableId('mission-instance', namespace, [
    missionId,
    `a${String(attempt).padStart(4, '0')}`,
  ]);
}

/**
 * Stable reward identity: `(namespace, missionId, definitionVersion, rewardId)`. A duplicate
 * delivery of the same completion and a replay of the same definition version cannot grant twice;
 * a new definition version is a new authored reward and gets its own identity.
 */
export function missionRewardId(
  namespace: string,
  missionId: string,
  definitionVersion: string,
  rewardId: string,
): string {
  return createStableId('mission-reward', namespace, [missionId, definitionVersion, rewardId]);
}

/**
 * Explicit progress idempotency key: `(namespace, mission instance, objective, eventId)`. The
 * tracker-wide event ledger is the primary guard; this identity makes the rule addressable.
 */
export function missionProgressKey(
  namespace: string,
  instanceId: string,
  objectiveId: string,
  eventId: string,
): string {
  return createStableId('mission-progress', namespace, [instanceId, objectiveId, eventId]);
}

function prerequisitesCycle(missions: readonly MissionDefinition[]): readonly string[] | null {
  const byId = new Map(missions.map((mission) => [mission.missionId, mission]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  let cycle: readonly string[] | null = null;
  const visit = (missionId: string, path: readonly string[]): void => {
    if (cycle !== null || done.has(missionId)) return;
    if (visiting.has(missionId)) {
      cycle = Object.freeze([...path.slice(path.indexOf(missionId)), missionId]);
      return;
    }
    visiting.add(missionId);
    for (const dependency of byId.get(missionId)?.prerequisites ?? [])
      visit(dependency, [...path, missionId]);
    visiting.delete(missionId);
    done.add(missionId);
  };
  for (const mission of missions) visit(mission.missionId, []);
  return cycle;
}

export function parseMissionCatalog(value: unknown): MissionCatalog {
  const data = plainFields(value, catalogFields, 'mission catalog');
  for (const key of catalogFields) requireRequired(data, key, 'mission catalog');
  requireContract(
    data.schemaVersion === 1 && data.units === 'SI' && data.version === MISSION_SCHEMA_VERSION,
    'Unsupported mission catalog schema version or units',
  );
  const namespace = boundedId(data.namespace, MISSION_LIMITS.idCodeUnits, 'mission namespace');
  const missions = list(data.missions, parseMissionDefinition);
  requireContract(
    missions.length > 0 && missions.length <= MISSION_LIMITS.missions,
    'Mission catalog capacity violated',
  );
  requireContract(
    new Set(missions.map((entry) => entry.missionId)).size === missions.length,
    'Duplicate mission id',
  );
  const ids = new Set(missions.map((entry) => entry.missionId));
  for (const mission of missions) {
    for (const prerequisite of mission.prerequisites)
      requireContract(ids.has(prerequisite), `Unknown mission prerequisite: ${prerequisite}`);
    for (const reward of mission.rewards)
      requireContract(
        missionRewardId(namespace, mission.missionId, mission.version, reward.rewardId).length <=
          MISSION_LIMITS.rewardIdCodeUnits,
        'Mission reward identity exceeds the code-unit limit',
      );
  }
  requireContract(
    missionInstanceId(namespace, missions[0]!.missionId, 1).length <=
      MISSION_LIMITS.instanceIdCodeUnits,
    'Mission instance identity exceeds the code-unit limit',
  );
  const cycle = prerequisitesCycle(missions);
  requireContract(cycle === null, `Mission prerequisite cycle: ${(cycle ?? []).join(' -> ')}`);
  const canonical = missions
    .slice()
    .sort((left, right) => compareText(left.missionId, right.missionId));
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    version: MISSION_SCHEMA_VERSION,
    namespace,
    missions: Object.freeze(canonical),
  });
}

export const MISSION_CATALOG_NAMESPACE = 'campaign:116';

interface CampaignObjectiveInput {
  readonly objectiveId: string;
  readonly kind: MissionObjectiveKind;
  readonly label: string;
  readonly target: number;
  readonly easy?: number;
  readonly hard?: number;
  readonly minDurationS?: number;
  readonly profileId?: string;
}

function campaignObjective(input: CampaignObjectiveInput): MissionObjective {
  return Object.freeze({
    objectiveId: input.objectiveId,
    kind: input.kind,
    label: input.label,
    target: input.target,
    difficultyTargets: Object.freeze({
      NORMAL: input.target,
      ...(input.easy === undefined ? {} : { EASY: input.easy }),
      ...(input.hard === undefined ? {} : { HARD: input.hard }),
    }),
    minDurationS: input.minDurationS ?? null,
    profileId: input.profileId ?? null,
  });
}

function xpReward(rewardId: string, amount: number): MissionReward {
  return Object.freeze({ rewardId, kind: 'XP' as const, amount, unlockId: null });
}

function unlockReward(
  rewardId: string,
  kind: Exclude<MissionRewardKind, 'XP'>,
  unlockId: string,
): MissionReward {
  return Object.freeze({ rewardId, kind, amount: 0, unlockId });
}

function currentReplay(): MissionReplay {
  return Object.freeze({
    profileSource: 'CURRENT' as const,
    snapshotId: null,
    scenarioId: null,
    comparisonProfileIds: Object.freeze([]),
  });
}

function comparisonReplay(snapshotId: string, scenarioId: string): MissionReplay {
  return Object.freeze({
    profileSource: 'SNAPSHOT' as const,
    snapshotId,
    scenarioId,
    comparisonProfileIds: Object.freeze(['profile:prudent', 'profile:reckless']),
  });
}

/**
 * The eight campaign stages of `Docs/13-misiuni-si-progres.md`. Objective thresholds and reward
 * amounts are proposals pending calibration; every objective names the real event family that
 * advances it. Comfort/rating objectives are intentionally absent until the KPI contract exists.
 */
export function campaignMissionDefinitions(): readonly MissionDefinition[] {
  return Object.freeze([
    Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      missionId: 'campaign-1-first-taxi',
      version: '1',
      title: 'Primul taxi',
      objectives: Object.freeze([
        campaignObjective({
          objectiveId: 'manual-ride',
          kind: 'MANUAL_DROPOFFS',
          label: 'Finalizează o cursă cu intervenție MANUAL',
          target: 1,
        }),
      ]),
      rewards: Object.freeze([
        xpReward('xp', 100),
        unlockReward('unlock-challenge', 'UNLOCK_CHALLENGE', 'challenge:first-demonstration'),
      ]),
      replay: currentReplay(),
      windowTicks: null,
      incidentBudget: null,
      prerequisites: Object.freeze([]),
    }),
    Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      missionId: 'campaign-2-first-demonstration',
      version: '1',
      title: 'Prima demonstrație',
      objectives: Object.freeze([
        campaignObjective({
          objectiveId: 'profile-activation',
          kind: 'LEARNING_ACTIVATIONS',
          label: 'Publică o versiune LEARNING în flotă',
          target: 1,
        }),
      ]),
      rewards: Object.freeze([
        xpReward('xp', 100),
        unlockReward('unlock-analysis', 'UNLOCK_ANALYSIS_TOOL', 'analysis:learning-review'),
      ]),
      replay: currentReplay(),
      windowTicks: null,
      incidentBudget: null,
      prerequisites: Object.freeze(['campaign-1-first-taxi']),
    }),
    Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      missionId: 'campaign-3-following-distance',
      version: '1',
      title: 'Distanța în trafic',
      objectives: Object.freeze([
        campaignObjective({
          objectiveId: 'leader-acquired',
          kind: 'LEADER_ACQUIRED',
          label: 'Demonstrează două situații de urmărire',
          target: 2,
          easy: 1,
        }),
      ]),
      rewards: Object.freeze([
        xpReward('xp', 100),
        unlockReward('unlock-challenge', 'UNLOCK_CHALLENGE', 'challenge:following-comparison'),
      ]),
      replay: comparisonReplay('snapshot:campaign-comparison', 'scenario:following-comparison'),
      windowTicks: 18_000,
      incidentBudget: 2,
      prerequisites: Object.freeze(['campaign-2-first-demonstration']),
    }),
    Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      missionId: 'campaign-4-stops-and-signals',
      version: '1',
      title: 'STOP și semafoare',
      objectives: Object.freeze([
        campaignObjective({
          objectiveId: 'full-stops',
          kind: 'FULL_STOPS',
          label: 'Oprește complet la două oportunități',
          target: 2,
          easy: 1,
          minDurationS: 1.5,
        }),
      ]),
      rewards: Object.freeze([
        xpReward('xp', 100),
        unlockReward('unlock-analysis', 'UNLOCK_ANALYSIS_TOOL', 'analysis:opportunity-review'),
      ]),
      replay: currentReplay(),
      windowTicks: 12_000,
      incidentBudget: 1,
      prerequisites: Object.freeze(['campaign-3-following-distance']),
    }),
    Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      missionId: 'campaign-5-passenger',
      version: '1',
      title: 'Pasagerul',
      objectives: Object.freeze([
        campaignObjective({
          objectiveId: 'clean-dropoff',
          kind: 'CLEAN_DROPOFFS',
          label: 'Finalizează o cursă fără incident',
          target: 1,
        }),
      ]),
      rewards: Object.freeze([
        xpReward('xp', 100),
        unlockReward('unlock-vehicle-class', 'UNLOCK_VEHICLE_CLASS', 'vehicle-class:comfort-sedan'),
      ]),
      replay: currentReplay(),
      windowTicks: null,
      incidentBudget: 1,
      prerequisites: Object.freeze(['campaign-4-stops-and-signals']),
    }),
    Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      missionId: 'campaign-6-city-copies-you',
      version: '1',
      title: 'Orașul te copiază',
      objectives: Object.freeze([
        campaignObjective({
          objectiveId: 'city-activation',
          kind: 'LEARNING_ACTIVATIONS',
          label: 'Publică o versiune pe care o preia flota',
          target: 1,
        }),
      ]),
      rewards: Object.freeze([
        xpReward('xp', 100),
        unlockReward('unlock-challenge', 'UNLOCK_CHALLENGE', 'challenge:fleet-scenario'),
      ]),
      replay: currentReplay(),
      windowTicks: null,
      incidentBudget: null,
      prerequisites: Object.freeze(['campaign-5-passenger']),
    }),
    Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      missionId: 'campaign-7-changing-a-habit',
      version: '1',
      title: 'Schimbarea unui obicei',
      objectives: Object.freeze([
        campaignObjective({
          objectiveId: 'distinct-versions',
          kind: 'DISTINCT_PROFILE_VERSIONS',
          label: 'Compară două versiuni publicate',
          target: 2,
        }),
      ]),
      rewards: Object.freeze([
        xpReward('xp', 100),
        unlockReward('unlock-analysis', 'UNLOCK_ANALYSIS_TOOL', 'analysis:version-comparison'),
      ]),
      replay: comparisonReplay('snapshot:campaign-habit', 'scenario:habit-comparison'),
      windowTicks: null,
      incidentBudget: null,
      prerequisites: Object.freeze(['campaign-6-city-copies-you']),
    }),
    Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      missionId: 'campaign-8-fleet-challenge',
      version: '1',
      title: 'Provocarea flotei',
      objectives: Object.freeze([
        campaignObjective({
          objectiveId: 'fleet-clean-dropoffs',
          kind: 'CLEAN_DROPOFFS',
          label: 'Finalizează trei curse fără incidente',
          target: 3,
          easy: 2,
          hard: 4,
        }),
      ]),
      rewards: Object.freeze([
        xpReward('xp', 100),
        unlockReward('unlock-challenge', 'UNLOCK_CHALLENGE', 'challenge:fleet-championship'),
      ]),
      replay: currentReplay(),
      windowTicks: 21_600,
      incidentBudget: 0,
      prerequisites: Object.freeze(['campaign-7-changing-a-habit']),
    }),
  ]);
}

export function createCampaignMissionCatalog(
  namespace: string = MISSION_CATALOG_NAMESPACE,
): MissionCatalog {
  return parseMissionCatalog({
    schemaVersion: 1,
    units: 'SI',
    version: MISSION_SCHEMA_VERSION,
    namespace,
    missions: campaignMissionDefinitions(),
  });
}

/** Definition ids in campaign order, derived from the prerequisite DAG rather than the array. */
export function campaignOrder(catalog: MissionCatalog): readonly string[] {
  const remaining = new Map(catalog.missions.map((mission) => [mission.missionId, mission]));
  const ordered: string[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining.values()]
      .filter((mission) => mission.prerequisites.every((id) => !remaining.has(id)))
      .sort((left, right) => compareText(left.missionId, right.missionId));
    requireContract(ready.length > 0, 'Mission catalog is not a DAG');
    for (const mission of ready) {
      ordered.push(mission.missionId);
      remaining.delete(mission.missionId);
    }
  }
  return Object.freeze(ordered);
}

export function missionDefinitionIds(catalog: MissionCatalog): readonly string[] {
  return frozenSorted(catalog.missions.map((mission) => mission.missionId));
}

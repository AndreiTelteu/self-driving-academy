import type {
  CampaignMissionProgress,
  CampaignProgress,
  MissionCatalog,
  MissionDefinition,
  MissionDifficulty,
  MissionFailureReason,
  MissionInstance,
  MissionObjectiveKind,
  MissionRewardKind,
} from '../missions';

/**
 * 126 mission panel format.
 *
 * The panel is a read-only projection of the delivered 116 and 125 contracts. It never judges a
 * mission, never advances an objective and never keeps a second state of truth:
 *
 * - the campaign answer (`LOCKED`/`AVAILABLE`/`COMPLETED`, `attempts`, `nextAttempt`, the missing
 *   prerequisites and the granted reward count) is copied from the 125 campaign progress;
 * - the evaluation answer (objectives, progress, `satisfied`, `failureReason`, window, incidents)
 *   is copied from the latest real 116 instance of that mission;
 * - the authored text (title, objective labels, thresholds, rewards, replay policy) is copied from
 *   the mission definition version the instance reports, so two definition versions never mix.
 *
 * `parseMissionPanelSnapshot` refuses a snapshot that contradicts those contracts instead of
 * displaying an invented verdict: a satisfied objective must really be at or above its target, a
 * completed campaign mission must have a real completion, `nextAttempt` must follow the 125
 * attempt rule, and an attempt must belong to the mission and the definition version it claims.
 *
 * The module has no clock, DOM, renderer, tracker, ledger or random source; it only maps and
 * formats plain values.
 */
export const MISSION_PANEL_VERSION = '126-mission-panel-v1' as const;

export const MISSION_PANEL_LIMITS = Object.freeze({
  version: MISSION_PANEL_VERSION,
  /** 116 authored missions in one catalog. */
  missions: 32,
  /** 116 objectives in one definition. */
  objectivesPerMission: 8,
  /** 116 authored rewards in one definition. */
  rewardsPerMission: 4,
  /** 116 replay attempts per mission id; the 125 `nextAttempt` rule reads the same number. */
  attemptsPerMission: 8,
  /** 116 comparison profiles named by one replay declaration. */
  comparisonProfiles: 4,
  /** Code units per mission, objective, reward, snapshot and scenario identity. */
  idCodeUnits: 256,
  /** Code units per authored title. */
  titleCodeUnits: 160,
  /** Code units per authored objective label. */
  labelCodeUnits: 240,
  /** Code units per definition version. */
  versionCodeUnits: 32,
  /** One read per open and one per accepted refresh; a closed panel re-reads nothing. */
  readsPerOpen: 1,
  globalListeners: 0,
});

export const MISSION_PANEL_TEXT = Object.freeze({
  trigger: 'Misiuni',
  triggerDescription: 'Deschide panoul misiunilor: obiective, progres, motive de eșec și reluare',
  title: 'Misiuni și obiective',
  description:
    'Panoul citește contractele 116 și 125: obiectivele, progresul, motivele de eșec, încercările și opțiunile de reluare sunt exact cele raportate de ele. Panoul nu recalculează progresul, nu consumă încercări și nu resetează nimic.',
  close: 'Închide',
  closeDescription: 'Închide panoul misiunilor și revino la buton',
  bodyLabel: 'Lista misiunilor campaniei',
  empty: 'Nicio misiune în catalogul campaniei.',
  noAttempt: 'Nicio încercare înregistrată',
  none: 'Niciuna',
  inspect: 'Inspectează',
  inspected: 'Inspectată',
  blockedNote:
    'Inspectarea unei misiuni blocate este doar citire: progresul, încercările și registrele 116 și 125 rămân neschimbate.',
  readonlyNote:
    'Reluarea este o opțiune afișată, nu o acțiune a panoului: pornirea ei rămâne a hostului, prin contractul 116.',
  objectivesHeading: 'Obiective',
  labels: Object.freeze({
    version: 'Versiune definiție',
    attempt: 'Încercare',
    attempts: 'Încercări',
    nextAttempt: 'Următoarea încercare',
    prerequisites: 'Prerechizite',
    missing: 'Prerechizite lipsă',
    failure: 'Motiv de eșec',
    replay: 'Reluare',
    rewards: 'Recompense',
    limits: 'Fereastră și incidente',
    progress: 'Progres',
  }),
});

/** Campaign states of the 125 contract, copied so the UI vocabulary cannot drift silently. */
export const MISSION_PANEL_CAMPAIGN_STATES = ['LOCKED', 'AVAILABLE', 'COMPLETED'] as const;
export type MissionPanelCampaignState = (typeof MISSION_PANEL_CAMPAIGN_STATES)[number];

/** 116 instance states. */
export const MISSION_PANEL_ATTEMPT_STATES = ['ACTIVE', 'COMPLETED', 'FAILED'] as const;
export type MissionPanelAttemptState = (typeof MISSION_PANEL_ATTEMPT_STATES)[number];

/** 116 closed failure vocabulary. */
export const MISSION_PANEL_FAILURE_REASONS = [
  'EVALUATION_WINDOW_EXPIRED',
  'INCIDENT_BUDGET_EXCEEDED',
  'SCENARIO_RESET',
  'PLAYER_ABANDONED',
] as const;

/** 116 closed objective vocabulary. */
export const MISSION_PANEL_OBJECTIVE_KINDS = [
  'DROPOFFS',
  'MANUAL_DROPOFFS',
  'CLEAN_DROPOFFS',
  'LEARNING_ACTIVATIONS',
  'DISTINCT_PROFILE_VERSIONS',
  'FULL_STOPS',
  'LANE_CHANGES',
  'LEADER_ACQUIRED',
] as const;

/** 116 closed reward vocabulary. */
export const MISSION_PANEL_REWARD_KINDS = [
  'XP',
  'UNLOCK_CHALLENGE',
  'UNLOCK_VEHICLE_CLASS',
  'UNLOCK_ANALYSIS_TOOL',
] as const;

export const MISSION_PANEL_DIFFICULTIES = ['EASY', 'NORMAL', 'HARD'] as const;
export const MISSION_PANEL_PROFILE_SOURCES = ['CURRENT', 'SNAPSHOT'] as const;

export const MISSION_PANEL_STATE_LABELS: Readonly<Record<MissionPanelCampaignState, string>> =
  Object.freeze({
    LOCKED: 'Blocat',
    AVAILABLE: 'Disponibil',
    COMPLETED: 'Finalizat',
  });

export const MISSION_PANEL_ATTEMPT_LABELS: Readonly<Record<MissionPanelAttemptState, string>> =
  Object.freeze({
    ACTIVE: 'În desfășurare',
    COMPLETED: 'Finalizat cu succes',
    FAILED: 'Eșuat',
  });

export const MISSION_PANEL_FAILURE_LABELS: Readonly<Record<MissionFailureReason, string>> =
  Object.freeze({
    EVALUATION_WINDOW_EXPIRED: 'Fereastra de evaluare a expirat',
    INCIDENT_BUDGET_EXCEEDED: 'Bugetul de incidente a fost depășit',
    SCENARIO_RESET: 'Scenariul a fost resetat',
    PLAYER_ABANDONED: 'Misiunea a fost abandonată',
  });

export const MISSION_PANEL_OBJECTIVE_LABELS: Readonly<Record<MissionObjectiveKind, string>> =
  Object.freeze({
    DROPOFFS: 'Curse finalizate',
    MANUAL_DROPOFFS: 'Curse MANUAL',
    CLEAN_DROPOFFS: 'Curse fără incident',
    LEARNING_ACTIVATIONS: 'Activări publicate',
    DISTINCT_PROFILE_VERSIONS: 'Versiuni publicate distincte',
    FULL_STOPS: 'Opriri complete',
    LANE_CHANGES: 'Schimbări de bandă finalizate',
    LEADER_ACQUIRED: 'Situații de urmărire',
  });

export const MISSION_PANEL_REWARD_LABELS: Readonly<Record<MissionRewardKind, string>> =
  Object.freeze({
    XP: 'XP',
    UNLOCK_CHALLENGE: 'Deblochează provocare',
    UNLOCK_VEHICLE_CLASS: 'Deblochează clasă de vehicul',
    UNLOCK_ANALYSIS_TOOL: 'Deblochează instrument de analiză',
  });

export interface MissionPanelDifficultyTargets {
  readonly NORMAL: number;
  readonly EASY?: number;
  readonly HARD?: number;
}

/** Authored objective of the definition version the instance reports. */
export interface MissionPanelObjective {
  readonly objectiveId: string;
  readonly kind: MissionObjectiveKind;
  readonly label: string;
  readonly target: number;
  readonly difficultyTargets: MissionPanelDifficultyTargets;
  readonly minDurationS: number | null;
  readonly profileId: string | null;
}

/** Evaluated objective of the real 116 instance; progress is never recomputed here. */
export interface MissionPanelObjectiveProgress {
  readonly objectiveId: string;
  readonly progress: number;
  readonly target: number;
  readonly satisfied: boolean;
}

export interface MissionPanelReplay {
  readonly profileSource: 'CURRENT' | 'SNAPSHOT';
  readonly snapshotId: string | null;
  readonly scenarioId: string | null;
  readonly comparisonProfileIds: readonly string[];
}

export interface MissionPanelReward {
  readonly rewardId: string;
  readonly kind: MissionRewardKind;
  readonly amount: number;
  readonly unlockId: string | null;
}

export interface MissionPanelAttempt {
  readonly instanceId: string;
  readonly missionId: string;
  readonly missionVersion: string;
  readonly attempt: number;
  readonly state: MissionPanelAttemptState;
  readonly difficulty: MissionDifficulty;
  readonly startedTick: number;
  readonly updatedTick: number;
  readonly completedTick: number | null;
  readonly failedTick: number | null;
  readonly failureReason: MissionFailureReason | null;
  readonly windowTicks: number | null;
  readonly deadlineTick: number | null;
  readonly incidentBudget: number | null;
  readonly incidents: number;
  readonly appliedEvents: number;
  readonly replayedFrom: string | null;
  readonly objectives: readonly MissionPanelObjectiveProgress[];
}

export interface MissionPanelMission {
  readonly missionId: string;
  readonly definitionVersion: string;
  readonly title: string;
  /** 1-based campaign position from the 125 prerequisite DAG. */
  readonly order: number;
  readonly state: MissionPanelCampaignState;
  readonly prerequisites: readonly string[];
  readonly missingPrerequisites: readonly string[];
  readonly attempts: number;
  readonly nextAttempt: number | null;
  readonly playable: boolean;
  readonly lastCompletedTick: number | null;
  readonly resets: number;
  readonly rewardsGranted: number;
  readonly objectives: readonly MissionPanelObjective[];
  readonly rewards: readonly MissionPanelReward[];
  readonly replay: MissionPanelReplay;
  /** Latest real 116 instance of the mission, or `null` when no attempt exists yet. */
  readonly attempt: MissionPanelAttempt | null;
}

export interface MissionPanelSnapshot {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly version: typeof MISSION_PANEL_VERSION;
  readonly tick: number;
  readonly namespace: string;
  readonly missions: readonly MissionPanelMission[];
}

export interface MissionPanelObjectiveView {
  readonly index: number;
  readonly objectiveId: string;
  readonly kind: MissionObjectiveKind;
  readonly kindLabel: string;
  readonly label: string;
  readonly target: number;
  readonly progress: number | null;
  readonly satisfied: boolean | null;
  readonly percent: number | null;
  readonly progressLabel: string;
  readonly stateLabel: string;
  readonly description: string;
}

export interface MissionPanelMissionView {
  readonly missionId: string;
  readonly title: string;
  readonly order: number;
  readonly orderLabel: string;
  readonly versionLabel: string;
  readonly state: MissionPanelCampaignState;
  readonly stateLabel: string;
  readonly attemptState: MissionPanelAttemptState | null;
  readonly attemptStateLabel: string;
  readonly failureReason: MissionFailureReason | null;
  readonly failureLabel: string | null;
  readonly statusLabel: string;
  readonly progressLabel: string;
  readonly attemptsLabel: string;
  readonly nextAttemptLabel: string;
  readonly prerequisitesLabel: string;
  readonly missingPrerequisitesLabel: string;
  readonly replayAvailable: boolean;
  readonly replayLabel: string;
  readonly replayPolicyLabel: string;
  readonly rewardsLabel: string;
  readonly limitsLabel: string;
  readonly inspectionLabel: string;
  readonly objectives: readonly MissionPanelObjectiveView[];
  readonly description: string;
}

export interface MissionPanelCounts {
  readonly missions: number;
  readonly locked: number;
  readonly available: number;
  readonly completed: number;
  readonly active: number;
  readonly failed: number;
  readonly replayable: number;
  readonly attempts: number;
  readonly evaluatedObjectives: number;
  readonly satisfiedObjectives: number;
  readonly rewardsGranted: number;
}

export interface MissionPanelView {
  readonly signature: string;
  readonly heading: string;
  readonly description: string;
  readonly summary: string;
  readonly empty: boolean;
  readonly ariaLabel: string;
  readonly counts: MissionPanelCounts;
  readonly missions: readonly MissionPanelMissionView[];
}

export interface MissionPanelSources {
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
  readonly catalog: MissionCatalog;
  readonly progress: CampaignProgress;
  readonly instances: readonly MissionInstance[];
}

// ---------------------------------------------------------------------------------------------
// Strict plain-data readers. The UI cannot import the domain validators, so it keeps its own
// closed-field parser; the tests assert the vocabularies above are identical to the 116/125 ones.
// ---------------------------------------------------------------------------------------------

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${label} must be plain data`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new Error(`${label} must be plain data`);
  const data: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') throw new Error(`${label} keys`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      throw new Error(`${label} descriptors`);
    data[key] = descriptor.value;
  }
  return data;
}

function fields(
  data: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): Record<string, unknown> {
  for (const key of Object.keys(data))
    if (!required.includes(key) && !optional.includes(key))
      throw new Error(`${label} has an unknown field: ${key}`);
  for (const key of required)
    if (!Object.prototype.hasOwnProperty.call(data, key))
      throw new Error(`${label} is missing the field: ${key}`);
  return data;
}

function identifier(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > MISSION_PANEL_LIMITS.idCodeUnits
  )
    throw new Error(`Mission panel ${label} identity`);
  return value;
}

function optionalIdentifier(value: unknown, label: string): string | null {
  return value === null ? null : identifier(value, label);
}

function boundedText(value: unknown, maximum: number, label: string): string {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > maximum
  )
    throw new Error(`Mission panel ${label} text`);
  return value;
}

function integer(value: unknown, minimum: number, maximum: number, label: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    throw new Error(`Mission panel ${label} number`);
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Mission panel ${label} flag`);
  return value;
}

function nullableInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number | null {
  return value === null ? null : integer(value, minimum, maximum, label);
}

function choice<T extends string>(value: unknown, options: readonly T[], label: string): T {
  if (typeof value !== 'string' || !(options as readonly string[]).includes(value))
    throw new Error(`Mission panel ${label} vocabulary`);
  return value as T;
}

function boundedList(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`Mission panel ${label} list`);
  return value;
}

function boundedIds(value: unknown, maximum: number, label: string): readonly string[] {
  const list = boundedList(value, label).map((entry) => identifier(entry, label));
  if (list.length > maximum) throw new Error(`Mission panel ${label} capacity`);
  return Object.freeze(list);
}

const missionFields = [
  'missionId',
  'definitionVersion',
  'title',
  'order',
  'state',
  'prerequisites',
  'missingPrerequisites',
  'attempts',
  'nextAttempt',
  'playable',
  'lastCompletedTick',
  'resets',
  'rewardsGranted',
  'objectives',
  'rewards',
  'replay',
  'attempt',
] as const;

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

const progressFields = ['objectiveId', 'progress', 'target', 'satisfied'] as const;

const attemptFields = [
  'instanceId',
  'missionId',
  'missionVersion',
  'attempt',
  'state',
  'difficulty',
  'startedTick',
  'updatedTick',
  'completedTick',
  'failedTick',
  'failureReason',
  'windowTicks',
  'deadlineTick',
  'incidentBudget',
  'incidents',
  'appliedEvents',
  'replayedFrom',
  'objectives',
] as const;

const snapshotFields = [
  'schemaVersion',
  'units',
  'sessionId',
  'worldEpoch',
  'version',
  'tick',
  'namespace',
  'missions',
] as const;

function parseDifficultyTargets(value: unknown): MissionPanelDifficultyTargets {
  const data = fields(
    record(value, 'Mission panel difficulty targets'),
    ['NORMAL'],
    ['EASY', 'HARD'],
    'Mission panel difficulty targets',
  );
  const normal = integer(data.NORMAL, 1, 1_000_000, 'objective NORMAL target');
  const easy =
    data.EASY === undefined ? undefined : integer(data.EASY, 1, normal, 'objective EASY target');
  const hard =
    data.HARD === undefined ? undefined : integer(data.HARD, 1, 1_000_000, 'objective HARD target');
  if (hard !== undefined && hard < normal)
    throw new Error('Mission panel objective HARD target cannot be easier than NORMAL');
  return Object.freeze({
    NORMAL: normal,
    ...(easy === undefined ? {} : { EASY: easy }),
    ...(hard === undefined ? {} : { HARD: hard }),
  });
}

function parseObjective(value: unknown): MissionPanelObjective {
  const data = fields(
    record(value, 'Mission panel objective'),
    objectiveFields,
    [],
    'Mission panel objective',
  );
  const kind = choice(data.kind, MISSION_PANEL_OBJECTIVE_KINDS, 'objective kind');
  const difficultyTargets = parseDifficultyTargets(data.difficultyTargets);
  const minDurationS =
    data.minDurationS === null
      ? null
      : (() => {
          if (typeof data.minDurationS !== 'number' || !Number.isFinite(data.minDurationS))
            throw new Error('Mission panel objective minimum stop duration');
          if (data.minDurationS < 0 || data.minDurationS > 3600)
            throw new Error('Mission panel objective minimum stop duration');
          return data.minDurationS;
        })();
  const profileId = optionalIdentifier(data.profileId, 'objective profile');
  if (kind === 'FULL_STOPS') {
    if (minDurationS === null)
      throw new Error('Mission panel FULL_STOPS objective requires a minimum stop duration');
  } else if (minDurationS !== null)
    throw new Error(`Mission panel only FULL_STOPS declares a minimum stop duration: ${kind}`);
  if (kind !== 'LEARNING_ACTIVATIONS' && profileId !== null)
    throw new Error(`Mission panel only LEARNING_ACTIVATIONS filters a profile: ${kind}`);
  const objective: MissionPanelObjective = Object.freeze({
    objectiveId: identifier(data.objectiveId, 'objective'),
    kind,
    label: boundedText(data.label, MISSION_PANEL_LIMITS.labelCodeUnits, 'objective label'),
    target: integer(data.target, 1, 1_000_000, 'objective target'),
    difficultyTargets,
    minDurationS,
    profileId,
  });
  if (objective.target !== objective.difficultyTargets.NORMAL)
    throw new Error('Mission panel objective target is not the definition NORMAL target');
  return objective;
}

function parseReward(value: unknown): MissionPanelReward {
  const data = fields(
    record(value, 'Mission panel reward'),
    rewardFields,
    [],
    'Mission panel reward',
  );
  const kind = choice(data.kind, MISSION_PANEL_REWARD_KINDS, 'reward kind');
  const amount = integer(data.amount, 0, 1_000_000, 'reward amount');
  const unlockId = optionalIdentifier(data.unlockId, 'reward unlock');
  if (kind === 'XP') {
    if (amount <= 0) throw new Error('Mission panel XP reward requires a positive amount');
    if (unlockId !== null) throw new Error('Mission panel XP reward cannot carry an unlock');
  } else {
    if (amount !== 0) throw new Error('Mission panel unlock reward cannot carry XP');
    if (unlockId === null) throw new Error('Mission panel unlock reward requires an identity');
  }
  return Object.freeze({
    rewardId: identifier(data.rewardId, 'reward'),
    kind,
    amount,
    unlockId,
  });
}

function parseReplay(value: unknown): MissionPanelReplay {
  const data = fields(
    record(value, 'Mission panel replay'),
    replayFields,
    [],
    'Mission panel replay',
  );
  const profileSource = choice(data.profileSource, MISSION_PANEL_PROFILE_SOURCES, 'replay source');
  const snapshotId = optionalIdentifier(data.snapshotId, 'replay snapshot');
  const scenarioId = optionalIdentifier(data.scenarioId, 'replay scenario');
  const comparisonProfileIds = boundedIds(
    data.comparisonProfileIds,
    MISSION_PANEL_LIMITS.comparisonProfiles,
    'replay profile',
  );
  if (new Set(comparisonProfileIds).size !== comparisonProfileIds.length)
    throw new Error('Mission panel replay repeats a comparison profile');
  if (profileSource === 'SNAPSHOT') {
    if (snapshotId === null) throw new Error('Mission panel SNAPSHOT replay requires a snapshot');
  } else if (snapshotId !== null)
    throw new Error('Mission panel CURRENT replay cannot declare a snapshot');
  if (comparisonProfileIds.length > 0 && scenarioId === null)
    throw new Error('Mission panel comparison profiles require a declared scenario');
  return Object.freeze({ profileSource, snapshotId, scenarioId, comparisonProfileIds });
}

function parseObjectiveProgress(value: unknown): MissionPanelObjectiveProgress {
  const data = fields(
    record(value, 'Mission panel objective progress'),
    progressFields,
    [],
    'Mission panel objective progress',
  );
  const progress = integer(data.progress, 0, 1_000_000, 'objective progress');
  const target = integer(data.target, 1, 1_000_000, 'objective target');
  const satisfied = boolean(data.satisfied, 'objective satisfied');
  if (satisfied !== progress >= target)
    throw new Error('Mission panel objective progress contradicts its satisfied flag');
  return Object.freeze({
    objectiveId: identifier(data.objectiveId, 'objective'),
    progress,
    target,
    satisfied,
  });
}

function parseAttempt(value: unknown, missionId: string, version: string): MissionPanelAttempt {
  const data = fields(
    record(value, 'Mission panel attempt'),
    attemptFields,
    [],
    'Mission panel attempt',
  );
  const attemptMissionId = identifier(data.missionId, 'attempt mission');
  if (attemptMissionId !== missionId)
    throw new Error(`Mission panel attempt belongs to ${attemptMissionId}, not ${missionId}`);
  const missionVersion = boundedText(
    data.missionVersion,
    MISSION_PANEL_LIMITS.versionCodeUnits,
    'attempt version',
  );
  if (missionVersion !== version)
    throw new Error(
      `Mission panel attempt version ${missionVersion} is not the applied version ${version}`,
    );
  const state = choice(data.state, MISSION_PANEL_ATTEMPT_STATES, 'attempt state');
  const difficulty = choice(data.difficulty, MISSION_PANEL_DIFFICULTIES, 'attempt difficulty');
  const completedTick = nullableInteger(
    data.completedTick,
    0,
    Number.MAX_SAFE_INTEGER,
    'attempt completion tick',
  );
  const failedTick = nullableInteger(
    data.failedTick,
    0,
    Number.MAX_SAFE_INTEGER,
    'attempt failure tick',
  );
  const failureReason =
    data.failureReason === null
      ? null
      : choice(data.failureReason, MISSION_PANEL_FAILURE_REASONS, 'attempt failure reason');
  if (state === 'FAILED') {
    if (failureReason === null) throw new Error('Mission panel failed attempt requires a reason');
    if (failedTick === null)
      throw new Error('Mission panel failed attempt requires a failure tick');
  } else {
    if (failureReason !== null)
      throw new Error('Mission panel attempt carries a failure reason without failing');
    if (failedTick !== null)
      throw new Error('Mission panel attempt carries a failure tick without failing');
  }
  if (state === 'COMPLETED' && completedTick === null)
    throw new Error('Mission panel completed attempt requires a completion tick');
  if (state !== 'COMPLETED' && completedTick !== null)
    throw new Error('Mission panel attempt carries a completion tick without completing');
  const objectives = boundedList(data.objectives, 'attempt objective').map(parseObjectiveProgress);
  if (objectives.length === 0 || objectives.length > MISSION_PANEL_LIMITS.objectivesPerMission)
    throw new Error('Mission panel attempt objective capacity');
  return Object.freeze({
    instanceId: identifier(data.instanceId, 'attempt instance'),
    missionId,
    missionVersion,
    attempt: integer(data.attempt, 1, MISSION_PANEL_LIMITS.attemptsPerMission, 'attempt'),
    state,
    difficulty,
    startedTick: integer(data.startedTick, 0, Number.MAX_SAFE_INTEGER, 'attempt start tick'),
    updatedTick: integer(data.updatedTick, 0, Number.MAX_SAFE_INTEGER, 'attempt update tick'),
    completedTick,
    failedTick,
    failureReason,
    windowTicks: nullableInteger(
      data.windowTicks,
      1,
      Number.MAX_SAFE_INTEGER,
      'attempt evaluation window',
    ),
    deadlineTick: nullableInteger(
      data.deadlineTick,
      0,
      Number.MAX_SAFE_INTEGER,
      'attempt deadline',
    ),
    incidentBudget: nullableInteger(data.incidentBudget, 0, 1000, 'attempt incident budget'),
    incidents: integer(data.incidents, 0, 1_000_000, 'attempt incidents'),
    appliedEvents: integer(data.appliedEvents, 0, 1_000_000, 'attempt applied events'),
    replayedFrom: optionalIdentifier(data.replayedFrom, 'replayed instance'),
    objectives: Object.freeze(objectives),
  });
}

function parseMission(value: unknown, index: number): MissionPanelMission {
  const data = fields(
    record(value, 'Mission panel mission'),
    missionFields,
    [],
    'Mission panel mission',
  );
  const missionId = identifier(data.missionId, 'mission');
  const definitionVersion = boundedText(
    data.definitionVersion,
    MISSION_PANEL_LIMITS.versionCodeUnits,
    'definition version',
  );
  const state = choice(data.state, MISSION_PANEL_CAMPAIGN_STATES, 'campaign state');
  const attempts = integer(data.attempts, 0, MISSION_PANEL_LIMITS.attemptsPerMission, 'attempts');
  const nextAttempt =
    data.nextAttempt === null
      ? null
      : integer(data.nextAttempt, 1, MISSION_PANEL_LIMITS.attemptsPerMission, 'next attempt');
  const expectedNext = attempts < MISSION_PANEL_LIMITS.attemptsPerMission ? attempts + 1 : null;
  if (nextAttempt !== expectedNext)
    throw new Error(
      `Mission panel nextAttempt ${String(nextAttempt)} does not follow the 125 attempt rule of ${attempts} completed attempts`,
    );
  const playable = boolean(data.playable, 'mission playable');
  if (playable !== (state !== 'LOCKED' && nextAttempt !== null))
    throw new Error('Mission panel playable flag contradicts the campaign state and attempt rule');
  const prerequisites = boundedIds(
    data.prerequisites,
    MISSION_PANEL_LIMITS.missions,
    'prerequisite',
  );
  const missingPrerequisites = boundedIds(
    data.missingPrerequisites,
    MISSION_PANEL_LIMITS.missions,
    'missing prerequisite',
  );
  for (const missing of missingPrerequisites)
    if (!prerequisites.includes(missing))
      throw new Error(`Mission panel missing prerequisite ${missing} is not a prerequisite`);
  if (state === 'AVAILABLE' && missingPrerequisites.length > 0)
    throw new Error('Mission panel available mission still reports missing prerequisites');
  if (state === 'LOCKED' && missingPrerequisites.length === 0)
    throw new Error('Mission panel locked mission reports no missing prerequisite');
  if (state === 'COMPLETED' && attempts < 1)
    throw new Error('Mission panel completed mission has no real 116 completion');
  const lastCompletedTick = nullableInteger(
    data.lastCompletedTick,
    0,
    Number.MAX_SAFE_INTEGER,
    'last completion tick',
  );
  if (state === 'COMPLETED' && lastCompletedTick === null)
    throw new Error('Mission panel completed mission has no last completion tick');
  if (state !== 'COMPLETED' && lastCompletedTick !== null)
    throw new Error('Mission panel uncompleted mission reports a completion tick');
  const objectives = boundedList(data.objectives, 'mission objective').map(parseObjective);
  if (objectives.length === 0 || objectives.length > MISSION_PANEL_LIMITS.objectivesPerMission)
    throw new Error('Mission panel mission objective capacity');
  if (new Set(objectives.map((objective) => objective.objectiveId)).size !== objectives.length)
    throw new Error('Mission panel mission repeats an objective id');
  const rewards = boundedList(data.rewards, 'mission reward').map(parseReward);
  if (rewards.length === 0 || rewards.length > MISSION_PANEL_LIMITS.rewardsPerMission)
    throw new Error('Mission panel mission reward capacity');
  if (new Set(rewards.map((reward) => reward.rewardId)).size !== rewards.length)
    throw new Error('Mission panel mission repeats a reward id');
  const order = integer(data.order, 1, MISSION_PANEL_LIMITS.missions, 'mission order');
  if (order !== index + 1)
    throw new Error(`Mission panel mission ${missionId} is not at its campaign position ${order}`);
  const attempt =
    data.attempt === null ? null : parseAttempt(data.attempt, missionId, definitionVersion);
  if (attempt !== null) {
    if (attempt.objectives.length !== objectives.length)
      throw new Error('Mission panel attempt objective count differs from the applied definition');
    for (const [objectiveIndex, evaluated] of attempt.objectives.entries()) {
      const authored = objectives[objectiveIndex]!;
      if (evaluated.objectiveId !== authored.objectiveId)
        throw new Error('Mission panel attempt objective is not the applied definition objective');
      const expected =
        authored.difficultyTargets[attempt.difficulty] ?? authored.difficultyTargets.NORMAL;
      if (evaluated.target !== expected)
        throw new Error(
          `Mission panel attempt target ${evaluated.target} is not the ${attempt.difficulty} target ${expected}`,
        );
    }
  }
  return Object.freeze({
    missionId,
    definitionVersion,
    title: boundedText(data.title, MISSION_PANEL_LIMITS.titleCodeUnits, 'mission title'),
    order,
    state,
    prerequisites,
    missingPrerequisites,
    attempts,
    nextAttempt,
    playable,
    lastCompletedTick,
    resets: integer(data.resets, 0, 1_000_000, 'mission resets'),
    rewardsGranted: integer(data.rewardsGranted, 0, 1_000_000, 'mission rewards'),
    objectives: Object.freeze(objectives),
    rewards: Object.freeze(rewards),
    replay: parseReplay(data.replay),
    attempt,
  });
}

/** Validates one composed snapshot; anything the 116/125 contracts cannot report is refused. */
export function parseMissionPanelSnapshot(value: unknown): MissionPanelSnapshot {
  const data = fields(
    record(value, 'Mission panel snapshot'),
    snapshotFields,
    [],
    'Mission panel snapshot',
  );
  if (data.schemaVersion !== 1 || data.units !== 'SI' || data.version !== MISSION_PANEL_VERSION)
    throw new Error('Mission panel snapshot contract version');
  const missions = boundedList(data.missions, 'mission').map(parseMission);
  if (missions.length === 0 || missions.length > MISSION_PANEL_LIMITS.missions)
    throw new Error('Mission panel snapshot mission capacity');
  if (new Set(missions.map((mission) => mission.missionId)).size !== missions.length)
    throw new Error('Mission panel snapshot repeats a mission id');
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId: identifier(data.sessionId, 'session'),
    worldEpoch: integer(data.worldEpoch, 0, Number.MAX_SAFE_INTEGER, 'world epoch'),
    version: MISSION_PANEL_VERSION,
    tick: integer(data.tick, 0, Number.MAX_SAFE_INTEGER, 'tick'),
    namespace: identifier(data.namespace, 'namespace'),
    missions: Object.freeze(missions),
  });
}

function definitionOf(catalog: MissionCatalog, missionId: string): MissionDefinition {
  const definition = catalog.missions.find((mission) => mission.missionId === missionId);
  if (definition === undefined)
    throw new Error(`Mission panel catalog has no definition for ${missionId}`);
  return definition;
}

function latestInstance(
  instances: readonly MissionInstance[],
  missionId: string,
): MissionInstance | null {
  let latest: MissionInstance | null = null;
  for (const instance of instances) {
    if (instance.missionId !== missionId) continue;
    if (latest === null || instance.attempt > latest.attempt) latest = instance;
  }
  return latest;
}

/**
 * Composes the panel snapshot from the real read models. Every field is a direct copy:
 *
 * - `CampaignMissionProgress` supplies the campaign answer (state, attempts, nextAttempt,
 *   playable, prerequisites, last completion, resets, granted rewards);
 * - the mission definition supplies the applied version's authored text and thresholds;
 * - the latest `MissionInstance` supplies the evaluated objectives and the closed failure reason.
 *
 * Nothing is derived except the identity of the latest attempt, and the result is parsed by
 * `parseMissionPanelSnapshot`, so an inconsistent composition fails instead of being displayed.
 */
export function composeMissionPanelSnapshot(sources: MissionPanelSources): MissionPanelSnapshot {
  if (sources.catalog.namespace !== sources.progress.namespace)
    throw new Error('Mission panel catalog and progress namespaces differ');
  const missions = sources.progress.missions.map((entry: CampaignMissionProgress) => {
    const definition = definitionOf(sources.catalog, entry.missionId);
    if (definition.version !== entry.definitionVersion)
      throw new Error(
        `Mission panel definition ${entry.missionId} is version ${definition.version}, not the applied version ${entry.definitionVersion}`,
      );
    if (definition.title !== entry.title)
      throw new Error(
        `Mission panel definition ${entry.missionId} title does not match the applied version title`,
      );
    const instance = latestInstance(sources.instances, entry.missionId);
    return {
      missionId: entry.missionId,
      definitionVersion: entry.definitionVersion,
      title: entry.title,
      order: entry.order,
      state: entry.state,
      prerequisites: [...entry.prerequisites],
      missingPrerequisites: [...entry.missingPrerequisites],
      attempts: entry.attempts,
      nextAttempt: entry.nextAttempt,
      playable: entry.playable,
      lastCompletedTick: entry.lastCompletedTick,
      resets: entry.resets,
      rewardsGranted: entry.rewardsGranted,
      objectives: definition.objectives.map((objective) => ({
        objectiveId: objective.objectiveId,
        kind: objective.kind,
        label: objective.label,
        target: objective.target,
        difficultyTargets: { ...objective.difficultyTargets },
        minDurationS: objective.minDurationS,
        profileId: objective.profileId,
      })),
      rewards: definition.rewards.map((reward) => ({
        rewardId: reward.rewardId,
        kind: reward.kind,
        amount: reward.amount,
        unlockId: reward.unlockId,
      })),
      replay: {
        profileSource: definition.replay.profileSource,
        snapshotId: definition.replay.snapshotId,
        scenarioId: definition.replay.scenarioId,
        comparisonProfileIds: [...definition.replay.comparisonProfileIds],
      },
      attempt:
        instance === null
          ? null
          : {
              instanceId: instance.instanceId,
              missionId: instance.missionId,
              missionVersion: instance.missionVersion,
              attempt: instance.attempt,
              state: instance.state,
              difficulty: instance.difficulty,
              startedTick: instance.startedTick,
              updatedTick: instance.updatedTick,
              completedTick: instance.completedTick,
              failedTick: instance.failedTick,
              failureReason: instance.failureReason,
              windowTicks: instance.windowTicks,
              deadlineTick: instance.deadlineTick,
              incidentBudget: instance.incidentBudget,
              incidents: instance.incidents,
              appliedEvents: instance.appliedEvents,
              replayedFrom: instance.replayedFrom,
              objectives: instance.objectives.map((objective) => ({
                objectiveId: objective.objectiveId,
                progress: objective.progress,
                target: objective.target,
                satisfied: objective.satisfied,
              })),
            },
    };
  });
  return parseMissionPanelSnapshot({
    schemaVersion: 1,
    units: 'SI',
    sessionId: sources.sessionId,
    worldEpoch: sources.worldEpoch,
    version: MISSION_PANEL_VERSION,
    tick: sources.tick,
    namespace: sources.progress.namespace,
    missions,
  });
}

// ---------------------------------------------------------------------------------------------
// Projection: text, labels and deterministic bar percentages.
// ---------------------------------------------------------------------------------------------

function percentOf(progress: number, target: number): number {
  if (target <= 0) return 100;
  const ratio = (progress / target) * 100;
  return Math.max(0, Math.min(100, Math.round(ratio)));
}

function objectiveView(
  objective: MissionPanelObjective,
  evaluated: MissionPanelObjectiveProgress | null,
  index: number,
): MissionPanelObjectiveView {
  const kindLabel = MISSION_PANEL_OBJECTIVE_LABELS[objective.kind];
  const description =
    evaluated === null
      ? `${kindLabel} · ${objective.label} · țintă ${objective.target}, neevaluat`
      : `${kindLabel} · ${objective.label} · ${evaluated.progress} din ${evaluated.target}`;
  return Object.freeze({
    index,
    objectiveId: objective.objectiveId,
    kind: objective.kind,
    kindLabel,
    label: objective.label,
    target: evaluated === null ? objective.target : evaluated.target,
    progress: evaluated === null ? null : evaluated.progress,
    satisfied: evaluated === null ? null : evaluated.satisfied,
    percent: evaluated === null ? null : percentOf(evaluated.progress, evaluated.target),
    progressLabel:
      evaluated === null
        ? `${objective.target} (neevaluat)`
        : `${evaluated.progress} din ${evaluated.target}`,
    stateLabel:
      evaluated === null ? 'Neevaluat' : evaluated.satisfied ? 'Îndeplinit' : 'În așteptare',
    description,
  });
}

function replayPolicyLabel(replay: MissionPanelReplay): string {
  const parts: string[] = [];
  if (replay.profileSource === 'SNAPSHOT') {
    parts.push(`profil SNAPSHOT ${replay.snapshotId ?? MISSION_PANEL_TEXT.none}`);
  } else parts.push('profil CURRENT (profilul curent)');
  if (replay.scenarioId !== null) parts.push(`scenariu ${replay.scenarioId}`);
  if (replay.comparisonProfileIds.length > 0)
    parts.push(`compară ${replay.comparisonProfileIds.join(' cu ')}`);
  return parts.join(', ');
}

function missionView(
  mission: MissionPanelMission,
  total: number,
  selected: boolean,
): MissionPanelMissionView {
  const attempt = mission.attempt;
  const attemptStateLabel =
    attempt === null ? MISSION_PANEL_TEXT.noAttempt : MISSION_PANEL_ATTEMPT_LABELS[attempt.state];
  const failureLabel =
    attempt === null || attempt.failureReason === null
      ? null
      : `${MISSION_PANEL_FAILURE_LABELS[attempt.failureReason]} (${attempt.failureReason})`;
  const satisfiedCount =
    attempt === null ? 0 : attempt.objectives.filter((o) => o.satisfied).length;
  const progressLabel =
    attempt === null
      ? MISSION_PANEL_TEXT.noAttempt
      : `${satisfiedCount} din ${attempt.objectives.length} obiective îndeplinite`;
  const attemptsLabel = `${mission.attempts} din ${MISSION_PANEL_LIMITS.attemptsPerMission} încercări încheiate`;
  const nextAttemptLabel =
    mission.nextAttempt === null
      ? 'Încercări epuizate'
      : `Următoarea încercare: ${mission.nextAttempt}`;
  const prerequisitesLabel =
    mission.prerequisites.length === 0
      ? 'Fără prerechizite'
      : `Prerechizite: ${mission.prerequisites.join(', ')}`;
  const missingPrerequisitesLabel =
    mission.missingPrerequisites.length === 0
      ? ''
      : `Lipsesc: ${mission.missingPrerequisites.join(', ')}`;
  const replayAvailable = mission.state !== 'LOCKED' && mission.nextAttempt !== null;
  const policy = replayPolicyLabel(mission.replay);
  const replayLabel = !replayAvailable
    ? mission.state === 'LOCKED'
      ? 'Reluare indisponibilă: misiunea este blocată de prerechizite.'
      : 'Reluare indisponibilă: cele 8 încercări ale contractului 116 sunt epuizate.'
    : attempt !== null && attempt.state === 'FAILED'
      ? `Reluare disponibilă: încercarea ${mission.nextAttempt} din 8, ${policy}. Eșecul păstrează profilurile învățate.`
      : `Reluare disponibilă: încercarea ${mission.nextAttempt} din 8, ${policy}.`;
  const rewardsLabel =
    mission.rewards
      .map((reward) =>
        reward.kind === 'XP'
          ? `${reward.amount} ${MISSION_PANEL_REWARD_LABELS.XP}`
          : `${MISSION_PANEL_REWARD_LABELS[reward.kind]} ${reward.unlockId ?? ''}`,
      )
      .join(', ') + `; acordate: ${mission.rewardsGranted}`;
  const limitsLabel =
    attempt === null
      ? 'Fereastră și incidente: neaplicate până la prima încercare.'
      : [
          attempt.windowTicks === null
            ? 'Fereastră: până la finalizare'
            : `Fereastră: ${attempt.windowTicks} tick-uri, termen ${attempt.deadlineTick ?? 0}`,
          attempt.incidentBudget === null
            ? 'fără buget de incidente'
            : `incidente ${attempt.incidents} din ${attempt.incidentBudget}`,
        ].join('; ');
  const statusParts = [MISSION_PANEL_STATE_LABELS[mission.state]];
  if (attempt !== null) statusParts.push(MISSION_PANEL_ATTEMPT_LABELS[attempt.state]);
  if (failureLabel !== null) statusParts.push(failureLabel);
  else if (mission.state === 'LOCKED' && missingPrerequisitesLabel.length > 0)
    statusParts.push(missingPrerequisitesLabel);
  const statusLabel = statusParts.join(' · ');
  const description = [
    `Etapa ${mission.order} din ${total}: ${mission.title}, versiunea ${mission.definitionVersion}.`,
    `${MISSION_PANEL_STATE_LABELS[mission.state]}.`,
    `${attemptStateLabel}.`,
    `${progressLabel}.`,
    failureLabel === null ? '' : `Motiv de eșec: ${failureLabel}.`,
    `${nextAttemptLabel}.`,
    replayLabel,
  ]
    .filter((part) => part.length > 0)
    .join(' ');
  return Object.freeze({
    missionId: mission.missionId,
    title: mission.title,
    order: mission.order,
    orderLabel: `Etapa ${mission.order} din ${total}`,
    versionLabel: `Versiunea ${mission.definitionVersion}`,
    state: mission.state,
    stateLabel: MISSION_PANEL_STATE_LABELS[mission.state],
    attemptState: attempt === null ? null : attempt.state,
    attemptStateLabel,
    failureReason: attempt?.failureReason ?? null,
    failureLabel,
    statusLabel,
    progressLabel,
    attemptsLabel,
    nextAttemptLabel,
    prerequisitesLabel,
    missingPrerequisitesLabel,
    replayAvailable,
    replayLabel,
    replayPolicyLabel: policy,
    rewardsLabel,
    limitsLabel,
    inspectionLabel: selected ? MISSION_PANEL_TEXT.inspected : MISSION_PANEL_TEXT.inspect,
    objectives: Object.freeze(
      mission.objectives.map((objective, index) =>
        objectiveView(
          objective,
          attempt === null ? null : (attempt.objectives[index] ?? null),
          index,
        ),
      ),
    ),
    description,
  });
}

/** Deterministic view of one parsed snapshot; `selectedMissionId` only changes the label text. */
export function projectMissionPanel(
  snapshot: MissionPanelSnapshot,
  options: { readonly selectedMissionId?: string | null } = {},
): MissionPanelView {
  const total = snapshot.missions.length;
  const selected = options.selectedMissionId ?? null;
  const missions = snapshot.missions.map((mission) =>
    missionView(mission, total, mission.missionId === selected),
  );
  const counts: MissionPanelCounts = Object.freeze({
    missions: total,
    locked: missions.filter((mission) => mission.state === 'LOCKED').length,
    available: missions.filter((mission) => mission.state === 'AVAILABLE').length,
    completed: missions.filter((mission) => mission.state === 'COMPLETED').length,
    active: missions.filter((mission) => mission.attemptState === 'ACTIVE').length,
    failed: missions.filter((mission) => mission.attemptState === 'FAILED').length,
    replayable: missions.filter((mission) => mission.replayAvailable).length,
    attempts: snapshot.missions.reduce((sum, mission) => sum + mission.attempts, 0),
    evaluatedObjectives: snapshot.missions.reduce(
      (sum, mission) => sum + (mission.attempt === null ? 0 : mission.attempt.objectives.length),
      0,
    ),
    satisfiedObjectives: snapshot.missions.reduce(
      (sum, mission) =>
        sum +
        (mission.attempt === null
          ? 0
          : mission.attempt.objectives.filter((objective) => objective.satisfied).length),
      0,
    ),
    rewardsGranted: snapshot.missions.reduce((sum, mission) => sum + mission.rewardsGranted, 0),
  });
  const summary = [
    `Campanie: ${counts.completed} finalizate, ${counts.available} disponibile, ${counts.locked} blocate.`,
    `${counts.active} în desfășurare, ${counts.failed} eșuate, ${counts.replayable} cu reluare disponibilă.`,
    `${counts.satisfiedObjectives} din ${counts.evaluatedObjectives} obiective evaluate îndeplinite.`,
  ].join(' ');
  return Object.freeze({
    signature: JSON.stringify([
      snapshot.tick,
      selected,
      counts,
      missions.map((mission) => [
        mission.missionId,
        mission.state,
        mission.attemptState,
        mission.failureReason,
        mission.replayAvailable,
        mission.objectives.map((objective) => [
          objective.objectiveId,
          objective.progress,
          objective.satisfied,
        ]),
      ]),
    ]),
    heading: MISSION_PANEL_TEXT.title,
    description: MISSION_PANEL_TEXT.description,
    summary,
    empty: total === 0,
    ariaLabel: `${MISSION_PANEL_TEXT.title} · ${summary}`,
    counts,
    missions: Object.freeze(missions),
  });
}

/** Empty view used when the host has no campaign read yet; it claims nothing about progress. */
export function emptyMissionPanelView(): MissionPanelView {
  const counts: MissionPanelCounts = Object.freeze({
    missions: 0,
    locked: 0,
    available: 0,
    completed: 0,
    active: 0,
    failed: 0,
    replayable: 0,
    attempts: 0,
    evaluatedObjectives: 0,
    satisfiedObjectives: 0,
    rewardsGranted: 0,
  });
  return Object.freeze({
    signature: JSON.stringify(['EMPTY']),
    heading: MISSION_PANEL_TEXT.title,
    description: MISSION_PANEL_TEXT.description,
    summary: MISSION_PANEL_TEXT.empty,
    empty: true,
    ariaLabel: `${MISSION_PANEL_TEXT.title} · ${MISSION_PANEL_TEXT.empty}`,
    counts,
    missions: Object.freeze([]),
  });
}

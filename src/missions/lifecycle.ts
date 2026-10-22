import { choice, list, requireContract, text, tick } from '../sessions';
import { parseSimulationEvent } from '../simulation';
import type { EventBus, SimulationEvent } from '../simulation';
import {
  MISSION_LIMITS,
  MISSION_SCHEMA_VERSION,
  boundedId,
  compareText,
  plainFields,
  requireRequired,
} from './contracts';
import {
  MISSION_FAILURE_REASONS,
  MISSION_TERMINAL_STATES,
  missionDifficulties,
  missionInstanceId,
  missionObjectiveKinds,
  missionRewardId,
  missionStates,
  missionTargetFor,
  parseMissionCatalog,
} from './definitions';
import type {
  MissionCatalog,
  MissionDefinition,
  MissionDifficulty,
  MissionFailureReason,
  MissionObjective,
  MissionObjectiveKind,
  MissionReplay,
  MissionReward,
  MissionRewardKind,
  MissionState,
} from './definitions';

/**
 * 116 mission lifecycle.
 *
 * The tracker owns no clock, world, renderer, DOM, profile store or XP balance. It advances only
 * from validated 007 `SimulationEvent` values and from an authoritative tick handed by the caller:
 *
 * 1. Every accepted event id enters a bounded FIFO ledger. A second delivery is `DUPLICATE` and
 *    changes nothing, so neither an accidental replay nor a mission replay can re-award progress.
 * 2. Rewards are granted through a stable `(missionId, definitionVersion, rewardId)` identity in a
 *    separate bounded ledger; a completion after a replay reports the reward as a duplicate.
 * 3. A completed or failed instance is terminal. Continuing requires `replay`, which creates the
 *    next stable attempt and restarts the objectives at zero while keeping the ledgers.
 * 4. The evaluation window and the incident budget are explicit definition fields. A terminal
 *    event that arrives after the deadline does not complete the mission.
 */

export interface MissionObjectiveState {
  readonly objectiveId: string;
  readonly kind: MissionObjectiveKind;
  readonly target: number;
  readonly progress: number;
  readonly satisfied: boolean;
}

export interface MissionInstance {
  readonly instanceId: string;
  readonly missionId: string;
  readonly missionVersion: string;
  readonly attempt: number;
  readonly state: MissionState;
  readonly difficulty: MissionDifficulty;
  readonly startedTick: number;
  readonly updatedTick: number;
  readonly completedTick: number | null;
  readonly failedTick: number | null;
  readonly failureReason: MissionFailureReason | null;
  /** Previous attempt when this instance came from `replay`; `null` for the first attempt. */
  readonly replayedFrom: string | null;
  /** Declared replay policy of the mission; it is data, never a silent profile change. */
  readonly replay: MissionReplay;
  readonly windowTicks: number | null;
  readonly deadlineTick: number | null;
  readonly incidentBudget: number | null;
  readonly incidents: number;
  readonly objectives: readonly MissionObjectiveState[];
  /** Total accepted events applied to this instance. */
  readonly appliedEvents: number;
  /** Short evidence window; the tracker-wide ledger owns deduplication. */
  readonly recentEventIds: readonly string[];
  readonly rewardsGranted: number;
}

export interface MissionRewardGrant {
  readonly rewardId: string;
  readonly missionId: string;
  readonly missionVersion: string;
  /** Authored reward id inside the mission definition. */
  readonly definitionRewardId: string;
  readonly kind: MissionRewardKind;
  readonly amount: number;
  readonly unlockId: string | null;
  readonly instanceId: string;
  readonly grantedTick: number;
}

export interface MissionStartResult {
  readonly instance: MissionInstance;
  /** `true` when the same start was already applied; nothing changed. */
  readonly duplicate: boolean;
}

export interface MissionAdvancedObjective {
  readonly instanceId: string;
  readonly missionId: string;
  readonly objectiveId: string;
  readonly progress: number;
  readonly target: number;
  readonly satisfied: boolean;
}

export interface MissionIngestResult {
  readonly status: 'ACCEPTED' | 'DUPLICATE' | 'IGNORED';
  readonly eventId: string;
  readonly type: SimulationEvent['type'];
  readonly tick: number;
  readonly advanced: readonly MissionAdvancedObjective[];
  readonly completed: readonly string[];
  readonly failed: readonly string[];
  readonly rewardsGranted: number;
  readonly rewardsDuplicate: number;
}

export interface MissionAdvanceResult {
  readonly tick: number;
  readonly expired: readonly string[];
}

export interface MissionReplayResult {
  readonly instance: MissionInstance;
  readonly previous: MissionInstance;
}

export interface MissionResetResult {
  readonly tick: number;
  readonly clearedInstances: number;
  readonly discardedActive: number;
}

export interface MissionTrackerStats {
  readonly version: string;
  readonly namespace: string;
  readonly missions: number;
  readonly instances: number;
  readonly active: number;
  readonly completed: number;
  readonly failed: number;
  readonly attempts: number;
  readonly acceptedEvents: number;
  readonly duplicates: number;
  readonly rewardsGranted: number;
  readonly rewardsDuplicate: number;
  readonly droppedEvents: number;
  readonly droppedRewards: number;
  readonly droppedInstances: number;
  readonly retainedEvents: number;
  readonly retainedEventCodeUnits: number;
  readonly retainedRewards: number;
  readonly tick: number;
  readonly disposed: boolean;
}

export interface MissionSnapshotEntry extends MissionInstance {
  /** Full objective definitions are not duplicated: the catalog owns them. */
  readonly objectiveIds: readonly string[];
}

export interface MissionTrackerSnapshot {
  readonly version: string;
  readonly tick: number;
  readonly attempts: readonly { readonly missionId: string; readonly attempts: number }[];
  readonly latest: readonly { readonly missionId: string; readonly instanceId: string }[];
  readonly instances: readonly MissionSnapshotEntry[];
  readonly events: readonly { readonly eventId: string; readonly fingerprint: string }[];
  readonly rewards: readonly MissionRewardGrant[];
  /** Per-vehicle facts the CLEAN/MANUAL objectives need after a restart. */
  readonly manualVehicles: readonly string[];
  readonly collidedVehicles: readonly string[];
  readonly counters: Readonly<{
    acceptedEvents: number;
    duplicates: number;
    rewardsGranted: number;
    rewardsDuplicate: number;
    droppedEvents: number;
    droppedRewards: number;
    droppedInstances: number;
  }>;
}

export interface MissionTrackerOptions {
  readonly catalog: unknown;
  readonly bus?: EventBus;
  readonly context?: unknown;
}

export interface MissionTracker {
  readonly namespace: string;
  catalog(): MissionCatalog;
  definition(missionId: string): MissionDefinition | undefined;
  /** Creates attempt 1 or returns the already-started attempt unchanged. */
  start(input: unknown): MissionStartResult;
  /** Consumes one real 007 event; duplicate ids are `DUPLICATE` and change nothing. */
  ingest(value: unknown): MissionIngestResult;
  /** Authoritative sim tick from the fixed-tick loop; expires evaluation windows. */
  advance(atTick: unknown): MissionAdvanceResult;
  /** Explicit failure with a closed reason; only an ACTIVE instance can fail. */
  fail(input: unknown): MissionInstance;
  /** Creates the next stable attempt of a terminal instance. */
  replay(input: unknown): MissionReplayResult;
  instance(instanceId: string): MissionInstance | undefined;
  active(): readonly MissionInstance[];
  instances(): readonly MissionInstance[];
  rewards(): readonly MissionRewardGrant[];
  snapshot(): MissionTrackerSnapshot;
  restore(snapshot: unknown): readonly MissionInstance[];
  /** Scenario boundary: clears attempts and instances, keeps the idempotency ledgers. */
  reset(input: unknown): MissionResetResult;
  stats(): MissionTrackerStats;
  /** Subscribes to the real 007 bus; the returned function unsubscribes. */
  attachBus(bus: EventBus): () => void;
  dispose(): void;
}

interface MutableObjective {
  readonly definition: MissionObjective;
  readonly target: number;
  progress: number;
  satisfied: boolean;
  readonly distinct: Set<string>;
}

interface MutableInstance {
  readonly instanceId: string;
  readonly missionId: string;
  readonly missionVersion: string;
  readonly definition: MissionDefinition;
  readonly attempt: number;
  state: MissionState;
  readonly difficulty: MissionDifficulty;
  readonly startedTick: number;
  updatedTick: number;
  completedTick: number | null;
  failedTick: number | null;
  failureReason: MissionFailureReason | null;
  readonly replayedFrom: string | null;
  readonly windowTicks: number | null;
  readonly deadlineTick: number | null;
  readonly incidentBudget: number | null;
  incidents: number;
  readonly objectives: MutableObjective[];
  appliedEvents: number;
  readonly recentEventIds: string[];
  rewardsGranted: number;
}

const startFields = ['missionId', 'tick', 'difficulty'] as const;
const failFields = ['instanceId', 'reason', 'tick'] as const;
const replayFields = ['instanceId', 'tick'] as const;
const resetFields = ['tick', 'preserveStats'] as const;
const optionFields = ['catalog', 'bus', 'context'] as const;
const contextFields = ['sessionId', 'worldEpoch'] as const;

function objectiveState(objective: MutableObjective): MissionObjectiveState {
  return Object.freeze({
    objectiveId: objective.definition.objectiveId,
    kind: objective.definition.kind,
    target: objective.target,
    progress: objective.progress,
    satisfied: objective.satisfied,
  });
}

function instanceView(instance: MutableInstance): MissionInstance {
  return Object.freeze({
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
    replayedFrom: instance.replayedFrom,
    replay: instance.definition.replay,
    windowTicks: instance.windowTicks,
    deadlineTick: instance.deadlineTick,
    incidentBudget: instance.incidentBudget,
    incidents: instance.incidents,
    objectives: Object.freeze(instance.objectives.map(objectiveState)),
    appliedEvents: instance.appliedEvents,
    recentEventIds: Object.freeze([...instance.recentEventIds]),
    rewardsGranted: instance.rewardsGranted,
  });
}

function isTerminal(state: MissionState): boolean {
  return (MISSION_TERMINAL_STATES as readonly MissionState[]).includes(state);
}

function readContext(value: unknown): { readonly sessionId: string; readonly worldEpoch: number } {
  const data = plainFields(value, contextFields, 'mission context');
  for (const key of contextFields) requireRequired(data, key, 'mission context');
  return Object.freeze({ sessionId: text(data.sessionId), worldEpoch: tick(data.worldEpoch) });
}

function readBus(value: unknown): EventBus {
  requireContract(
    typeof value === 'object' &&
      value !== null &&
      typeof (value as EventBus).publish === 'function' &&
      typeof (value as EventBus).subscribe === 'function' &&
      typeof (value as EventBus).getStats === 'function',
    'Mission tracker requires a real 007 event bus',
  );
  return value as EventBus;
}

interface DropoffFacts {
  readonly vehicleId: string;
  readonly manual: boolean;
  readonly clean: boolean;
}

function advancesObjective(
  objective: MissionObjective,
  event: SimulationEvent,
  dropoff: DropoffFacts | null,
): boolean {
  switch (objective.kind) {
    case 'DROPOFFS':
      return event.type === 'DROPOFF';
    case 'MANUAL_DROPOFFS':
      return event.type === 'DROPOFF' && dropoff !== null && dropoff.manual;
    case 'CLEAN_DROPOFFS':
      return event.type === 'DROPOFF' && dropoff !== null && dropoff.clean;
    case 'LEARNING_ACTIVATIONS':
      return (
        event.type === 'PROFILE_ACTIVATE' &&
        (objective.profileId === null || event.payload.profileId === objective.profileId)
      );
    case 'DISTINCT_PROFILE_VERSIONS':
      return event.type === 'PROFILE_ACTIVATE';
    case 'FULL_STOPS':
      return event.type === 'FULL_STOP' && event.payload.durationS >= (objective.minDurationS ?? 0);
    case 'LANE_CHANGES':
      return event.type === 'LANE_CHANGE_COMPLETED';
    case 'LEADER_ACQUIRED':
      return event.type === 'LEADER_ACQUIRED';
  }
}

function zeroStats(namespace: string, disposed: boolean): MissionTrackerStats {
  return Object.freeze({
    version: MISSION_SCHEMA_VERSION,
    namespace,
    missions: 0,
    instances: 0,
    active: 0,
    completed: 0,
    failed: 0,
    attempts: 0,
    acceptedEvents: 0,
    duplicates: 0,
    rewardsGranted: 0,
    rewardsDuplicate: 0,
    droppedEvents: 0,
    droppedRewards: 0,
    droppedInstances: 0,
    retainedEvents: 0,
    retainedEventCodeUnits: 0,
    retainedRewards: 0,
    tick: 0,
    disposed,
  });
}

function snapshotEntry(instance: MutableInstance): MissionSnapshotEntry {
  return Object.freeze({
    ...instanceView(instance),
    objectiveIds: Object.freeze(
      instance.definition.objectives.map((objective) => objective.objectiveId),
    ),
  });
}

function readFingerprint(value: unknown): string {
  const fingerprint = text(value);
  requireContract(
    fingerprint.length > 0 && fingerprint.length <= 16_384,
    'Invalid mission event fingerprint',
  );
  return fingerprint;
}

export function createMissionTracker(options: unknown): MissionTracker {
  const option = plainFields(options, optionFields, 'mission tracker option');
  requireRequired(option, 'catalog', 'mission tracker option');
  const catalog = parseMissionCatalog(option.catalog);
  const expectedContext = option.context === undefined ? null : readContext(option.context);
  const definitions = new Map(catalog.missions.map((mission) => [mission.missionId, mission]));
  const instances = new Map<string, MutableInstance>();
  const latest = new Map<string, string>();
  const attempts = new Map<string, number>();
  const eventLedger = new Map<string, string>();
  const rewardLedger = new Map<string, MissionRewardGrant>();
  const manualVehicles = new Set<string>();
  const collidedVehicles = new Set<string>();

  let lastTick = 0;
  let acceptedEvents = 0;
  let duplicates = 0;
  let rewardsGranted = 0;
  let rewardsDuplicate = 0;
  let droppedEvents = 0;
  let droppedRewards = 0;
  let droppedInstances = 0;
  let retainedEventCodeUnits = 0;
  let unsubscribe: (() => void) | null = null;
  let disposed = false;

  function assertLive(): void {
    requireContract(!disposed, 'Mission tracker disposed');
  }

  function dropOldest<V>(map: Map<string, V>, label: 'event' | 'reward'): void {
    const oldest = map.keys().next();
    if (oldest.done === true) return;
    const removed = map.get(oldest.value);
    map.delete(oldest.value);
    if (label === 'event') {
      droppedEvents += 1;
      if (typeof removed === 'string') retainedEventCodeUnits -= removed.length;
    } else droppedRewards += 1;
  }

  function rememberEvent(eventId: string, fingerprint: string): void {
    while (
      eventLedger.size >= MISSION_LIMITS.retainedEvents ||
      retainedEventCodeUnits + fingerprint.length > MISSION_LIMITS.eventCodeUnits
    ) {
      const before = eventLedger.size;
      dropOldest(eventLedger, 'event');
      if (eventLedger.size === before) break;
    }
    eventLedger.set(eventId, fingerprint);
    retainedEventCodeUnits += fingerprint.length;
  }

  function evictInstances(): void {
    while (instances.size > MISSION_LIMITS.retainedInstances) {
      const victim = [...instances.values()]
        .filter((instance) => isTerminal(instance.state))
        .sort(
          (left, right) =>
            left.updatedTick - right.updatedTick || compareText(left.instanceId, right.instanceId),
        )[0];
      requireContract(
        victim !== undefined,
        'Mission instance capacity exceeded with no terminal instance to evict',
      );
      instances.delete(victim.instanceId);
      droppedInstances += 1;
    }
  }

  function activeCount(): number {
    let count = 0;
    for (const instance of instances.values()) if (instance.state === 'ACTIVE') count += 1;
    return count;
  }

  function rememberVehicle(set: Set<string>, vehicleId: string): void {
    if (set.size >= MISSION_LIMITS.vehicleFlags && !set.has(vehicleId)) {
      const oldest = set.values().next();
      if (oldest.done !== true) set.delete(oldest.value);
    }
    set.add(vehicleId);
  }

  function grantRewards(
    instance: MutableInstance,
    atTick: number,
  ): {
    granted: number;
    duplicate: number;
  } {
    let granted = 0;
    let duplicate = 0;
    for (const reward of instance.definition.rewards) {
      const rewardId = missionRewardId(
        catalog.namespace,
        instance.missionId,
        instance.missionVersion,
        reward.rewardId,
      );
      requireContract(
        rewardId.length <= MISSION_LIMITS.rewardIdCodeUnits,
        'Mission reward identity exceeds the code-unit limit',
      );
      if (rewardLedger.has(rewardId)) {
        duplicate += 1;
        rewardsDuplicate += 1;
        continue;
      }
      if (rewardLedger.size >= MISSION_LIMITS.retainedRewards) dropOldest(rewardLedger, 'reward');
      rewardLedger.set(
        rewardId,
        Object.freeze({
          rewardId,
          missionId: instance.missionId,
          missionVersion: instance.missionVersion,
          definitionRewardId: reward.rewardId,
          kind: reward.kind,
          amount: reward.amount,
          unlockId: reward.unlockId,
          instanceId: instance.instanceId,
          grantedTick: atTick,
        }),
      );
      instance.rewardsGranted += 1;
      rewardsGranted += 1;
      granted += 1;
    }
    return Object.freeze({ granted, duplicate });
  }

  function complete(
    instance: MutableInstance,
    atTick: number,
  ): { granted: number; duplicate: number } {
    requireContract(instance.state === 'ACTIVE', 'Mission instance is already terminal');
    instance.state = 'COMPLETED';
    instance.completedTick = atTick;
    instance.updatedTick = atTick;
    return grantRewards(instance, atTick);
  }

  function failInstance(
    instance: MutableInstance,
    reason: MissionFailureReason,
    atTick: number,
  ): void {
    requireContract(instance.state === 'ACTIVE', 'Mission instance is already terminal');
    requireContract(atTick >= instance.updatedTick, 'Mission failure predates the instance');
    instance.state = 'FAILED';
    instance.failedTick = atTick;
    instance.failureReason = reason;
    instance.updatedTick = atTick;
  }

  function expire(atTick: number): readonly string[] {
    const expired: string[] = [];
    for (const instance of instances.values()) {
      if (instance.state !== 'ACTIVE' || instance.deadlineTick === null) continue;
      if (atTick <= instance.deadlineTick) continue;
      failInstance(instance, 'EVALUATION_WINDOW_EXPIRED', atTick);
      expired.push(instance.instanceId);
    }
    return Object.freeze(expired);
  }

  function createInstance(
    definition: MissionDefinition,
    attempt: number,
    difficulty: MissionDifficulty,
    atTick: number,
    replayedFrom: string | null,
  ): MutableInstance {
    const instanceId = missionInstanceId(catalog.namespace, definition.missionId, attempt);
    requireContract(
      instanceId.length <= MISSION_LIMITS.instanceIdCodeUnits,
      'Mission instance identity exceeds the code-unit limit',
    );
    requireContract(
      !instances.has(instanceId),
      'Mission attempt identity already exists; use replay on the latest attempt',
    );
    requireContract(
      activeCount() < MISSION_LIMITS.activeInstances,
      'Mission active instance capacity exceeded',
    );
    const objectives: MutableObjective[] = definition.objectives.map((objective) => ({
      definition: objective,
      target: missionTargetFor(objective, difficulty),
      progress: 0,
      satisfied: false,
      distinct: new Set<string>(),
    }));
    const instance: MutableInstance = {
      instanceId,
      missionId: definition.missionId,
      missionVersion: definition.version,
      definition,
      attempt,
      state: 'ACTIVE',
      difficulty,
      startedTick: atTick,
      updatedTick: atTick,
      completedTick: null,
      failedTick: null,
      failureReason: null,
      replayedFrom,
      windowTicks: definition.windowTicks,
      deadlineTick: definition.windowTicks === null ? null : atTick + definition.windowTicks,
      incidentBudget: definition.incidentBudget,
      incidents: 0,
      objectives,
      appliedEvents: 0,
      recentEventIds: [],
      rewardsGranted: 0,
    };
    instances.set(instanceId, instance);
    latest.set(definition.missionId, instanceId);
    attempts.set(definition.missionId, attempt);
    evictInstances();
    return instance;
  }

  function assertPrerequisites(definition: MissionDefinition): void {
    for (const prerequisite of definition.prerequisites) {
      const completed = [...instances.values()].some(
        (instance) =>
          instance.missionId === prerequisite &&
          instance.definition.version === definitions.get(prerequisite)?.version &&
          instance.state === 'COMPLETED',
      );
      requireContract(completed, `Mission prerequisite not completed: ${prerequisite}`);
    }
  }

  function start(input: unknown): MissionStartResult {
    assertLive();
    const data = plainFields(input, startFields, 'mission start');
    requireRequired(data, 'missionId', 'mission start');
    requireRequired(data, 'tick', 'mission start');
    const missionId = boundedId(data.missionId, MISSION_LIMITS.idCodeUnits, 'mission');
    const atTick = tick(data.tick);
    const difficulty = choice(data.difficulty ?? 'NORMAL', missionDifficulties);
    const definition = definitions.get(missionId);
    requireContract(definition !== undefined, 'Unknown mission definition');
    const latestId = latest.get(missionId);
    if (latestId !== undefined) {
      const existing = instances.get(latestId);
      requireContract(
        existing !== undefined,
        'Mission latest attempt is not retained; replay after an explicit restore',
      );
      if (existing.state === 'ACTIVE') {
        requireContract(
          existing.difficulty === difficulty,
          'Mission start difficulty conflicts with the active attempt',
        );
        return Object.freeze({ instance: instanceView(existing), duplicate: true });
      }
      requireContract(false, 'Mission is already terminal; use replay');
    }
    requireContract(
      (attempts.get(missionId) ?? 0) === 0,
      'Mission already has attempts in this tracker; use replay',
    );
    if (atTick < lastTick) throw new RangeError('Stale mission tick');
    lastTick = atTick;
    assertPrerequisites(definition);
    const instance = createInstance(definition, 1, difficulty, atTick, null);
    return Object.freeze({ instance: instanceView(instance), duplicate: false });
  }

  function applyToInstance(
    instance: MutableInstance,
    event: SimulationEvent,
    dropoff: DropoffFacts | null,
    advanced: MissionAdvancedObjective[],
  ): void {
    if (instance.state !== 'ACTIVE') return;
    const profileVersionId = event.type === 'PROFILE_ACTIVATE' ? event.payload.versionId : null;
    for (const objective of instance.objectives) {
      if (objective.satisfied) continue;
      if (!advancesObjective(objective.definition, event, dropoff)) continue;
      if (objective.definition.kind === 'DISTINCT_PROFILE_VERSIONS') {
        requireContract(profileVersionId !== null, 'Missing profile activation version');
        if (objective.distinct.has(profileVersionId)) continue;
        objective.distinct.add(profileVersionId);
      }
      objective.progress = Math.min(objective.target, objective.progress + 1);
      objective.satisfied = objective.progress >= objective.target;
      advanced.push(
        Object.freeze({
          instanceId: instance.instanceId,
          missionId: instance.missionId,
          objectiveId: objective.definition.objectiveId,
          progress: objective.progress,
          target: objective.target,
          satisfied: objective.satisfied,
        }),
      );
    }
    instance.updatedTick = Math.max(instance.updatedTick, event.tick);
    instance.appliedEvents += 1;
    instance.recentEventIds.push(event.eventId);
    while (instance.recentEventIds.length > MISSION_LIMITS.recentEventsPerInstance)
      instance.recentEventIds.shift();
  }

  function ingest(value: unknown): MissionIngestResult {
    assertLive();
    const event = parseSimulationEvent(value);
    if (expectedContext !== null)
      requireContract(
        event.sessionId === expectedContext.sessionId &&
          event.worldEpoch === expectedContext.worldEpoch,
        'Foreign mission event world',
      );
    const fingerprint = JSON.stringify(event);
    const known = eventLedger.get(event.eventId);
    if (known !== undefined) {
      requireContract(known === fingerprint, 'Conflicting mission event identity');
      duplicates += 1;
      return Object.freeze({
        status: 'DUPLICATE' as const,
        eventId: event.eventId,
        type: event.type,
        tick: event.tick,
        advanced: Object.freeze([]),
        completed: Object.freeze([]),
        failed: Object.freeze([]),
        rewardsGranted: 0,
        rewardsDuplicate: 0,
      });
    }
    if (event.tick < lastTick) throw new RangeError('Stale mission tick');
    lastTick = event.tick;
    const expired = expire(event.tick);
    const dropoff: DropoffFacts | null =
      event.type === 'DROPOFF'
        ? Object.freeze({
            vehicleId: event.payload.vehicleId,
            manual: manualVehicles.has(event.payload.vehicleId),
            clean: !collidedVehicles.has(event.payload.vehicleId),
          })
        : null;
    const advanced: MissionAdvancedObjective[] = [];
    const completed: string[] = [];
    const failed: string[] = [...expired];
    let granted = 0;
    let rewardDuplicate = 0;
    for (const instance of instances.values()) {
      if (instance.state !== 'ACTIVE') continue;
      applyToInstance(instance, event, dropoff, advanced);
      if (event.type === 'COLLISION') {
        if (instance.incidentBudget !== null) {
          instance.incidents += 1;
          if (instance.incidents > instance.incidentBudget) {
            failInstance(instance, 'INCIDENT_BUDGET_EXCEEDED', event.tick);
            failed.push(instance.instanceId);
            continue;
          }
        }
      }
      if (instance.state === 'ACTIVE' && instance.objectives.every((entry) => entry.satisfied)) {
        const rewards = complete(instance, event.tick);
        granted += rewards.granted;
        rewardDuplicate += rewards.duplicate;
        completed.push(instance.instanceId);
      }
    }
    if (event.type === 'MANUAL_START' && event.payload.controlMode === 'MANUAL')
      rememberVehicle(manualVehicles, event.payload.vehicleId);
    if (event.type === 'COLLISION') rememberVehicle(collidedVehicles, event.payload.vehicleId);
    if (event.type === 'DROPOFF') {
      manualVehicles.delete(event.payload.vehicleId);
      collidedVehicles.delete(event.payload.vehicleId);
    }
    rememberEvent(event.eventId, fingerprint);
    acceptedEvents += 1;
    return Object.freeze({
      status:
        advanced.length > 0 || completed.length > 0 || failed.length > 0
          ? ('ACCEPTED' as const)
          : ('IGNORED' as const),
      eventId: event.eventId,
      type: event.type,
      tick: event.tick,
      advanced: Object.freeze(advanced),
      completed: Object.freeze(completed),
      failed: Object.freeze(failed),
      rewardsGranted: granted,
      rewardsDuplicate: rewardDuplicate,
    });
  }

  function advance(atTick: unknown): MissionAdvanceResult {
    assertLive();
    const nextTick = tick(atTick);
    if (nextTick < lastTick) throw new RangeError('Stale mission tick');
    lastTick = nextTick;
    return Object.freeze({ tick: nextTick, expired: expire(nextTick) });
  }

  function fail(input: unknown): MissionInstance {
    assertLive();
    const data = plainFields(input, failFields, 'mission failure');
    for (const key of failFields) requireRequired(data, key, 'mission failure');
    const instanceId = boundedId(
      data.instanceId,
      MISSION_LIMITS.instanceIdCodeUnits,
      'mission instance',
    );
    const reason = choice(data.reason, MISSION_FAILURE_REASONS);
    const atTick = tick(data.tick);
    if (atTick < lastTick) throw new RangeError('Stale mission tick');
    const instance = instances.get(instanceId);
    requireContract(instance !== undefined, 'Unknown mission instance');
    lastTick = atTick;
    failInstance(instance, reason, atTick);
    return instanceView(instance);
  }

  function replay(input: unknown): MissionReplayResult {
    assertLive();
    const data = plainFields(input, replayFields, 'mission replay');
    for (const key of replayFields) requireRequired(data, key, 'mission replay');
    const instanceId = boundedId(
      data.instanceId,
      MISSION_LIMITS.instanceIdCodeUnits,
      'mission instance',
    );
    const atTick = tick(data.tick);
    if (atTick < lastTick) throw new RangeError('Stale mission tick');
    const previous = instances.get(instanceId);
    requireContract(previous !== undefined, 'Unknown mission instance');
    requireContract(isTerminal(previous.state), 'Only a terminal mission instance can be replayed');
    const attempt = previous.attempt + 1;
    requireContract(
      attempt <= MISSION_LIMITS.attemptsPerMission,
      'Mission replay attempt capacity exceeded',
    );
    requireContract(
      activeCount() < MISSION_LIMITS.activeInstances,
      'Mission active instance capacity exceeded',
    );
    lastTick = atTick;
    const instance = createInstance(
      previous.definition,
      attempt,
      previous.difficulty,
      atTick,
      previous.instanceId,
    );
    return Object.freeze({ instance: instanceView(instance), previous: instanceView(previous) });
  }

  function listInstances(): readonly MissionInstance[] {
    return Object.freeze(
      [...instances.values()]
        .sort(
          (left, right) =>
            left.startedTick - right.startedTick || compareText(left.instanceId, right.instanceId),
        )
        .map(instanceView),
    );
  }

  function snapshot(): MissionTrackerSnapshot {
    return Object.freeze({
      version: MISSION_SCHEMA_VERSION,
      tick: lastTick,
      attempts: Object.freeze(
        [...attempts.entries()]
          .sort(([left], [right]) => compareText(left, right))
          .map(([missionId, count]) => Object.freeze({ missionId, attempts: count })),
      ),
      latest: Object.freeze(
        [...latest.entries()]
          .sort(([left], [right]) => compareText(left, right))
          .map(([missionId, instanceId]) => Object.freeze({ missionId, instanceId })),
      ),
      instances: disposed
        ? Object.freeze([])
        : Object.freeze(
            [...instances.values()]
              .sort((left, right) => compareText(left.instanceId, right.instanceId))
              .map(snapshotEntry),
          ),
      events: Object.freeze(
        [...eventLedger.entries()].map(([eventId, fingerprint]) =>
          Object.freeze({ eventId, fingerprint }),
        ),
      ),
      rewards: Object.freeze(
        [...rewardLedger.values()].sort((left, right) =>
          compareText(left.rewardId, right.rewardId),
        ),
      ),
      manualVehicles: Object.freeze([...manualVehicles].sort(compareText)),
      collidedVehicles: Object.freeze([...collidedVehicles].sort(compareText)),
      counters: Object.freeze({
        acceptedEvents: disposed ? 0 : acceptedEvents,
        duplicates: disposed ? 0 : duplicates,
        rewardsGranted: disposed ? 0 : rewardsGranted,
        rewardsDuplicate: disposed ? 0 : rewardsDuplicate,
        droppedEvents: disposed ? 0 : droppedEvents,
        droppedRewards: disposed ? 0 : droppedRewards,
        droppedInstances: disposed ? 0 : droppedInstances,
      }),
    });
  }

  function restore(value: unknown): readonly MissionInstance[] {
    assertLive();
    requireContract(instances.size === 0, 'Mission restore requires an empty tracker');
    const data = plainFields(
      value,
      [
        'version',
        'tick',
        'attempts',
        'latest',
        'instances',
        'events',
        'rewards',
        'manualVehicles',
        'collidedVehicles',
        'counters',
      ],
      'mission snapshot',
    );
    for (const key of [
      'version',
      'tick',
      'attempts',
      'latest',
      'instances',
      'events',
      'rewards',
      'manualVehicles',
      'collidedVehicles',
      'counters',
    ])
      requireRequired(data, key, 'mission snapshot');
    requireContract(
      data.version === MISSION_SCHEMA_VERSION,
      'Unsupported mission snapshot version',
    );
    const atTick = tick(data.tick);
    const restoredInstances = list(data.instances, (entry) => {
      const view = plainFields(
        entry,
        [
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
          'replayedFrom',
          'replay',
          'windowTicks',
          'deadlineTick',
          'incidentBudget',
          'incidents',
          'objectives',
          'appliedEvents',
          'recentEventIds',
          'rewardsGranted',
          'objectiveIds',
        ],
        'mission snapshot instance',
      );
      const instanceId = boundedId(
        view.instanceId,
        MISSION_LIMITS.instanceIdCodeUnits,
        'mission instance',
      );
      const missionId = boundedId(view.missionId, MISSION_LIMITS.idCodeUnits, 'mission');
      const definition = definitions.get(missionId);
      requireContract(definition !== undefined, 'Snapshot references an unknown mission');
      requireContract(
        view.missionVersion === definition.version,
        'Snapshot mission version does not match the catalog',
      );
      const attempt = tick(view.attempt);
      requireContract(
        attempt >= 1 && attempt <= MISSION_LIMITS.attemptsPerMission,
        'Invalid snapshot mission attempt',
      );
      requireContract(
        instanceId === missionInstanceId(catalog.namespace, missionId, attempt),
        'Snapshot instance identity is not the stable 006 identity',
      );
      const replay = plainFields(
        view.replay,
        ['profileSource', 'snapshotId', 'scenarioId', 'comparisonProfileIds'],
        'mission snapshot replay',
      );
      for (const key of ['profileSource', 'snapshotId', 'scenarioId', 'comparisonProfileIds'])
        requireRequired(replay, key, 'mission snapshot replay');
      requireContract(
        replay.profileSource === definition.replay.profileSource &&
          replay.snapshotId === definition.replay.snapshotId &&
          replay.scenarioId === definition.replay.scenarioId &&
          JSON.stringify(replay.comparisonProfileIds) ===
            JSON.stringify(definition.replay.comparisonProfileIds),
        'Snapshot replay declaration does not match the catalog',
      );
      const difficulty = choice(view.difficulty, missionDifficulties);
      const state = choice(view.state, missionStates);
      const startedTick = tick(view.startedTick);
      const updatedTick = tick(view.updatedTick);
      requireContract(startedTick >= 0 && updatedTick >= startedTick, 'Invalid snapshot ticks');
      requireContract(updatedTick <= atTick, 'Snapshot instance is newer than the snapshot tick');
      const objectiveIds = list(view.objectiveIds, (id) =>
        boundedId(id, MISSION_LIMITS.idCodeUnits, 'mission objective'),
      );
      requireContract(
        objectiveIds.length === definition.objectives.length &&
          objectiveIds.every((id, index) => id === definition.objectives[index]!.objectiveId),
        'Snapshot objectives do not match the catalog',
      );
      const objectives = list(view.objectives, (entry) => {
        const objective = plainFields(
          entry,
          ['objectiveId', 'kind', 'target', 'progress', 'satisfied'],
          'mission snapshot objective',
        );
        for (const key of ['objectiveId', 'kind', 'target', 'progress', 'satisfied'])
          requireRequired(objective, key, 'mission snapshot objective');
        const objectiveId = boundedId(
          objective.objectiveId,
          MISSION_LIMITS.idCodeUnits,
          'mission objective',
        );
        return Object.freeze({
          objectiveId,
          kind: choice(objective.kind, missionObjectiveKinds),
          target: tick(objective.target),
          progress: tick(objective.progress),
          satisfied: objective.satisfied === true,
        });
      });
      const recentEventIds = list(view.recentEventIds, (id) =>
        boundedId(id, MISSION_LIMITS.eventIdCodeUnits, 'mission event'),
      );
      requireContract(
        recentEventIds.length <= MISSION_LIMITS.recentEventsPerInstance,
        'Snapshot recent event window exceeded',
      );
      const windowTicks = view.windowTicks === null ? null : tick(view.windowTicks);
      const deadlineTick = view.deadlineTick === null ? null : tick(view.deadlineTick);
      const incidentBudget = view.incidentBudget === null ? null : tick(view.incidentBudget);
      if (windowTicks !== null) {
        requireContract(windowTicks > 0, 'Snapshot window ticks must be positive');
        requireContract(
          deadlineTick === startedTick + windowTicks,
          'Snapshot deadline does not match its window',
        );
      } else
        requireContract(deadlineTick === null, 'Snapshot declares a deadline without a window');
      const completedTick = view.completedTick === null ? null : tick(view.completedTick);
      const failedTick = view.failedTick === null ? null : tick(view.failedTick);
      const failureReason =
        view.failureReason === null ? null : choice(view.failureReason, MISSION_FAILURE_REASONS);
      if (state === 'COMPLETED')
        requireContract(
          completedTick !== null && failedTick === null,
          'Invalid completed snapshot',
        );
      if (state === 'FAILED')
        requireContract(failedTick !== null && failureReason !== null, 'Invalid failed snapshot');
      if (state === 'ACTIVE')
        requireContract(
          completedTick === null && failedTick === null && failureReason === null,
          'Active snapshot carries a terminal outcome',
        );
      return {
        instanceId,
        missionId,
        missionVersion: definition.version,
        definition,
        attempt,
        state,
        difficulty,
        startedTick,
        updatedTick,
        completedTick,
        failedTick,
        failureReason,
        replayedFrom:
          view.replayedFrom === null
            ? null
            : boundedId(view.replayedFrom, MISSION_LIMITS.instanceIdCodeUnits, 'replayed instance'),
        windowTicks,
        deadlineTick,
        incidentBudget,
        incidents: tick(view.incidents),
        appliedEvents: tick(view.appliedEvents),
        recentEventIds: [...recentEventIds],
        rewardsGranted: tick(view.rewardsGranted),
        objectives: objectives.map((objective, index) => {
          const source = definition.objectives[index]!;
          requireContract(
            source.objectiveId === objective.objectiveId && source.kind === objective.kind,
            'Snapshot objective identity does not match the catalog',
          );
          requireContract(
            objective.target === missionTargetFor(source, difficulty),
            'Snapshot objective target does not match the catalog difficulty',
          );
          return {
            definition: source,
            target: objective.target,
            progress: Math.min(objective.target, objective.progress),
            satisfied: objective.progress >= objective.target,
            distinct: new Set<string>(),
          };
        }),
      } satisfies MutableInstance;
    });
    requireContract(
      new Set(restoredInstances.map((entry) => entry.instanceId)).size === restoredInstances.length,
      'Duplicate mission instance in snapshot',
    );
    requireContract(
      restoredInstances.filter((entry) => entry.state === 'ACTIVE').length <=
        MISSION_LIMITS.activeInstances,
      'Snapshot active mission capacity exceeded',
    );
    requireContract(
      restoredInstances.length <= MISSION_LIMITS.retainedInstances,
      'Snapshot instance capacity exceeded',
    );
    for (const entry of restoredInstances) instances.set(entry.instanceId, entry);
    const latestEntries = list(data.latest, (entry) => {
      const row = plainFields(entry, ['missionId', 'instanceId'], 'mission snapshot latest');
      for (const key of ['missionId', 'instanceId'])
        requireRequired(row, key, 'mission snapshot latest');
      const missionId = boundedId(row.missionId, MISSION_LIMITS.idCodeUnits, 'mission');
      const instanceId = boundedId(
        row.instanceId,
        MISSION_LIMITS.instanceIdCodeUnits,
        'mission instance',
      );
      requireContract(
        instances.get(instanceId)?.missionId === missionId,
        'Snapshot latest instance does not belong to the mission',
      );
      return Object.freeze({ missionId, instanceId });
    });
    for (const row of latestEntries) latest.set(row.missionId, row.instanceId);
    for (const row of list(data.attempts, (entry) => {
      const attempt = plainFields(entry, ['missionId', 'attempts'], 'mission snapshot attempt');
      for (const key of ['missionId', 'attempts'])
        requireRequired(attempt, key, 'mission snapshot attempt');
      const missionId = boundedId(attempt.missionId, MISSION_LIMITS.idCodeUnits, 'mission');
      const count = tick(attempt.attempts);
      requireContract(
        count >= 1 && count <= MISSION_LIMITS.attemptsPerMission,
        'Invalid snapshot attempt count',
      );
      return Object.freeze({ missionId, attempts: count });
    }))
      attempts.set(row.missionId, row.attempts);
    for (const row of list(data.events, (entry) => {
      const known = plainFields(entry, ['eventId', 'fingerprint'], 'mission snapshot event');
      for (const key of ['eventId', 'fingerprint'])
        requireRequired(known, key, 'mission snapshot event');
      return Object.freeze({
        eventId: boundedId(known.eventId, MISSION_LIMITS.eventIdCodeUnits, 'mission event'),
        fingerprint: readFingerprint(known.fingerprint),
      });
    }))
      rememberEvent(row.eventId, row.fingerprint);
    for (const row of list(data.rewards, (entry) => {
      const grant = plainFields(
        entry,
        [
          'rewardId',
          'missionId',
          'missionVersion',
          'definitionRewardId',
          'kind',
          'amount',
          'unlockId',
          'instanceId',
          'grantedTick',
        ],
        'mission snapshot reward',
      );
      for (const key of Object.keys(grant)) requireRequired(grant, key, 'mission snapshot reward');
      const rewardId = boundedId(
        grant.rewardId,
        MISSION_LIMITS.rewardIdCodeUnits,
        'mission reward',
      );
      const missionId = boundedId(grant.missionId, MISSION_LIMITS.idCodeUnits, 'mission');
      const definition = definitions.get(missionId);
      requireContract(definition !== undefined, 'Snapshot reward references an unknown mission');
      const missionVersion = boundedId(
        grant.missionVersion,
        MISSION_LIMITS.versionCodeUnits,
        'mission version',
      );
      const definitionRewardId = boundedId(
        grant.definitionRewardId,
        MISSION_LIMITS.idCodeUnits,
        'mission reward',
      );
      const reward = definition.rewards.find((entry) => entry.rewardId === definitionRewardId);
      requireContract(reward !== undefined, 'Snapshot reward is not in the catalog definition');
      requireContract(
        missionVersion === definition.version &&
          rewardId ===
            missionRewardId(catalog.namespace, missionId, missionVersion, reward.rewardId),
        'Snapshot reward identity is not the stable 006 identity',
      );
      requireContract(
        grant.kind === reward.kind &&
          grant.amount === reward.amount &&
          grant.unlockId === reward.unlockId,
        'Snapshot reward value does not match the catalog',
      );
      return Object.freeze({
        rewardId,
        missionId,
        missionVersion,
        definitionRewardId,
        kind: reward.kind,
        amount: reward.amount,
        unlockId: reward.unlockId,
        instanceId: boundedId(
          grant.instanceId,
          MISSION_LIMITS.instanceIdCodeUnits,
          'mission instance',
        ),
        grantedTick: tick(grant.grantedTick),
      });
    })) {
      requireContract(!rewardLedger.has(row.rewardId), 'Duplicate mission reward in snapshot');
      if (rewardLedger.size >= MISSION_LIMITS.retainedRewards) dropOldest(rewardLedger, 'reward');
      rewardLedger.set(row.rewardId, row);
    }
    const manual = list(data.manualVehicles, (entry) =>
      boundedId(entry, MISSION_LIMITS.idCodeUnits, 'manual vehicle'),
    );
    const collided = list(data.collidedVehicles, (entry) =>
      boundedId(entry, MISSION_LIMITS.idCodeUnits, 'collided vehicle'),
    );
    requireContract(
      manual.length <= MISSION_LIMITS.vehicleFlags &&
        collided.length <= MISSION_LIMITS.vehicleFlags,
      'Snapshot vehicle fact capacity exceeded',
    );
    for (const vehicleId of manual) manualVehicles.add(vehicleId);
    for (const vehicleId of collided) collidedVehicles.add(vehicleId);
    const counters = plainFields(
      data.counters,
      [
        'acceptedEvents',
        'duplicates',
        'rewardsGranted',
        'rewardsDuplicate',
        'droppedEvents',
        'droppedRewards',
        'droppedInstances',
      ],
      'mission snapshot counters',
    );
    for (const key of Object.keys(counters))
      requireRequired(counters, key, 'mission snapshot counters');
    acceptedEvents = tick(counters.acceptedEvents);
    duplicates = tick(counters.duplicates);
    rewardsGranted = tick(counters.rewardsGranted);
    rewardsDuplicate = tick(counters.rewardsDuplicate);
    droppedEvents = tick(counters.droppedEvents);
    droppedRewards = tick(counters.droppedRewards);
    droppedInstances = tick(counters.droppedInstances);
    lastTick = Math.max(lastTick, atTick);
    return Object.freeze(restoredInstances.map(instanceView));
  }

  function reset(input: unknown): MissionResetResult {
    assertLive();
    const data = plainFields(input, resetFields, 'mission reset');
    requireRequired(data, 'tick', 'mission reset');
    requireContract(
      data.preserveStats === undefined || typeof data.preserveStats === 'boolean',
      'Mission reset preserveStats must be a boolean',
    );
    const atTick = tick(data.tick);
    if (atTick < lastTick) throw new RangeError('Stale mission tick');
    let discardedActive = 0;
    for (const instance of instances.values())
      if (instance.state === 'ACTIVE') discardedActive += 1;
    const clearedInstances = instances.size;
    instances.clear();
    latest.clear();
    attempts.clear();
    manualVehicles.clear();
    collidedVehicles.clear();
    lastTick = atTick;
    if (data.preserveStats !== true) {
      acceptedEvents = 0;
      duplicates = 0;
      rewardsGranted = 0;
      rewardsDuplicate = 0;
      droppedEvents = 0;
      droppedRewards = 0;
      droppedInstances = 0;
    }
    return Object.freeze({ tick: atTick, clearedInstances, discardedActive });
  }

  function stats(): MissionTrackerStats {
    if (disposed) return zeroStats(catalog.namespace, true);
    let active = 0;
    let completed = 0;
    let failed = 0;
    for (const instance of instances.values()) {
      if (instance.state === 'ACTIVE') active += 1;
      else if (instance.state === 'COMPLETED') completed += 1;
      else failed += 1;
    }
    let attemptsTotal = 0;
    for (const count of attempts.values()) attemptsTotal += count;
    return Object.freeze({
      version: MISSION_SCHEMA_VERSION,
      namespace: catalog.namespace,
      missions: catalog.missions.length,
      instances: instances.size,
      active,
      completed,
      failed,
      attempts: attemptsTotal,
      acceptedEvents,
      duplicates,
      rewardsGranted,
      rewardsDuplicate,
      droppedEvents,
      droppedRewards,
      droppedInstances,
      retainedEvents: eventLedger.size,
      retainedEventCodeUnits,
      retainedRewards: rewardLedger.size,
      tick: lastTick,
      disposed: false,
    });
  }

  function attachBus(bus: unknown): () => void {
    assertLive();
    const realBus = readBus(bus);
    requireContract(unsubscribe === null, 'Mission tracker is already attached to a bus');
    if (expectedContext !== null) {
      const busStats = realBus.getStats();
      requireContract(
        busStats.sessionId === expectedContext.sessionId &&
          busStats.worldEpoch === expectedContext.worldEpoch,
        'Foreign mission event bus world',
      );
    }
    const stop = realBus.subscribe((event) => {
      ingest(event);
      return undefined;
    });
    unsubscribe = () => {
      stop();
      unsubscribe = null;
    };
    return unsubscribe;
  }

  const tracker: MissionTracker = Object.freeze({
    namespace: catalog.namespace,
    catalog: () => catalog,
    definition: (missionId: string) => definitions.get(missionId),
    start,
    ingest,
    advance,
    fail,
    replay,
    instance(instanceId: string): MissionInstance | undefined {
      if (disposed) return undefined;
      const instance = instances.get(instanceId);
      return instance === undefined ? undefined : instanceView(instance);
    },
    active(): readonly MissionInstance[] {
      if (disposed) return Object.freeze([]);
      return Object.freeze(listInstances().filter((instance) => instance.state === 'ACTIVE'));
    },
    instances(): readonly MissionInstance[] {
      return disposed ? Object.freeze([]) : listInstances();
    },
    rewards(): readonly MissionRewardGrant[] {
      if (disposed) return Object.freeze([]);
      return Object.freeze(
        [...rewardLedger.values()].sort((left, right) =>
          compareText(left.rewardId, right.rewardId),
        ),
      );
    },
    snapshot,
    restore,
    reset,
    stats,
    attachBus,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (unsubscribe !== null) {
        const stop = unsubscribe;
        unsubscribe = null;
        stop();
      }
      instances.clear();
      latest.clear();
      attempts.clear();
      eventLedger.clear();
      rewardLedger.clear();
      manualVehicles.clear();
      collidedVehicles.clear();
      lastTick = 0;
      acceptedEvents = 0;
      duplicates = 0;
      rewardsGranted = 0;
      rewardsDuplicate = 0;
      droppedEvents = 0;
      droppedRewards = 0;
      droppedInstances = 0;
      retainedEventCodeUnits = 0;
    },
  });
  if (option.bus !== undefined) tracker.attachBus(option.bus as EventBus);
  return tracker;
}

export const MISSION_INSTANCE_FIELDS = Object.freeze([
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
  'replayedFrom',
  'replay',
  'windowTicks',
  'deadlineTick',
  'incidentBudget',
  'incidents',
  'objectives',
  'appliedEvents',
  'recentEventIds',
  'rewardsGranted',
] as const);

/** Reward vocabulary helper used by reports without re-deriving identities. */
export function rewardIdentityOf(
  namespace: string,
  mission: MissionDefinition,
  reward: MissionReward,
): string {
  return missionRewardId(namespace, mission.missionId, mission.version, reward.rewardId);
}

/** Instance identity helper mirroring the tracker derivation. */
export function attemptInstanceId(namespace: string, missionId: string, attempt: number): string {
  return missionInstanceId(namespace, missionId, attempt);
}

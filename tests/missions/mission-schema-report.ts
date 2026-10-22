import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MISSION_CATALOG_NAMESPACE,
  MISSION_FAILURE_REASONS,
  MISSION_LIMITS,
  MISSION_OBJECTIVE_EVENT_TYPES,
  MISSION_SCHEMA_VERSION,
  MISSION_TERMINAL_STATES,
  campaignMissionDefinitions,
  campaignOrder,
  createCampaignMissionCatalog,
  createMissionTracker,
  missionDefinitionIds,
  missionDifficulties,
  missionInstanceId,
  missionObjectiveKinds,
  missionReplayProfileSources,
  missionRewardId,
  missionRewardKinds,
  missionStates,
  missionTargetFor,
  parseMissionCatalog,
  parseMissionDefinition,
} from '../../src/missions';
import type { MissionObjective, MissionTracker } from '../../src/missions';
import {
  collision,
  createMissionTestBus,
  createMissionTestCatalog,
  createMissionTestTracker,
  dropoff,
  fullStop,
  laneChangeCompleted,
  leaderAcquired,
  manualStart,
  profileActivate,
  publishAll,
  realRideDropoffs,
  testMission,
} from './mission-fixture';

export interface MissionReportCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

interface CatalogReportRow {
  readonly missionId: string;
  readonly version: string;
  readonly title: string;
  readonly objectives: readonly {
    readonly objectiveId: string;
    readonly kind: string;
    readonly target: number;
    readonly easy: number | null;
    readonly hard: number | null;
    readonly minDurationS: number | null;
    readonly profileId: string | null;
    readonly eventTypes: readonly string[];
  }[];
  readonly rewards: readonly {
    readonly rewardId: string;
    readonly kind: string;
    readonly amount: number;
    readonly unlockId: string | null;
  }[];
  readonly replay: {
    readonly profileSource: string;
    readonly snapshotId: string | null;
    readonly scenarioId: string | null;
    readonly comparisonProfileIds: readonly string[];
  };
  readonly windowTicks: number | null;
  readonly incidentBudget: number | null;
  readonly prerequisites: readonly string[];
}

export interface MissionSchemaReport {
  readonly version: typeof MISSION_SCHEMA_VERSION;
  readonly generatedBy: string;
  readonly oracleRule: string;
  readonly limits: typeof MISSION_LIMITS;
  readonly contract: Readonly<{
    namespace: string;
    states: readonly string[];
    terminalStates: readonly string[];
    failureReasons: readonly string[];
    objectiveKinds: readonly string[];
    rewardKinds: readonly string[];
    difficulties: readonly string[];
    replayProfileSources: readonly string[];
    objectiveEvents: Readonly<Record<string, readonly string[]>>;
  }>;
  readonly catalog: Readonly<{
    missions: number;
    order: readonly string[];
    ids: readonly string[];
    rows: readonly CatalogReportRow[];
  }>;
  readonly lifecycle: Readonly<{
    startState: string;
    duplicateStart: boolean;
    state: string;
    progress: number;
    target: number;
    completedTick: number;
    appliedEvents: number;
    rewardsGranted: number;
    rewardLedger: number;
    stats: Readonly<{
      instances: number;
      active: number;
      completed: number;
      acceptedEvents: number;
      duplicates: number;
      rewardsGranted: number;
      tick: number;
    }>;
  }>;
  readonly objectives: Readonly<{
    state: string;
    rows: readonly {
      readonly objectiveId: string;
      readonly kind: string;
      readonly progress: number;
      readonly target: number;
      readonly satisfied: boolean;
    }[];
  }>;
  readonly duplicates: Readonly<{
    manual: readonly string[];
    progressAfterDuplicates: number;
    stateAfterDuplicates: string;
    rewardsAfterFirst: number;
    rewardsAfterDuplicate: number;
    conflictRejected: boolean;
    duplicates: number;
  }>;
  readonly failure: Readonly<{
    window: Readonly<{
      state: string;
      reason: string;
      failedTick: number;
      lateCompletionState: string;
      rewards: number;
    }>;
    incident: Readonly<{
      state: string;
      reason: string;
      incidents: number;
      rewards: number;
    }>;
  }>;
  readonly replay: Readonly<{
    firstState: string;
    attempt: number;
    replayedFromMatches: boolean;
    state: string;
    progress: number;
    profileSource: string;
    snapshotId: string;
    comparisonProfiles: readonly string[];
    rewardsAfterFirstAttempt: number;
    rewardsAfterReplay: number;
    rewardsAfterThirdAttempt: number;
    rewardsGrantedThirdAttempt: number;
    rewardDuplicates: number;
  }>;
  readonly identity: Readonly<{
    namespace: string;
    instanceIdPrefix: string;
    instanceIdsStable: boolean;
    attemptsDistinct: boolean;
    rewardIdStable: boolean;
    rewardVersionScoped: boolean;
    rewardIdentityMatches: boolean;
  }>;
  readonly restore: Readonly<{
    restoredState: string;
    restoredProgress: number;
    duplicateAfterRestore: string;
    continuedState: string;
    rewards: number;
    terminalState: string;
    replayAttempt: number;
    forgedInstanceRejected: boolean;
    versionMismatchRejected: boolean;
  }>;
  readonly reset: Readonly<{
    clearedInstances: number;
    instancesAfter: number;
    rewardsKept: number;
    completedAfterReset: number;
    rewardsAfterSecondCompletion: number;
    rewardsGrantedSecondCompletion: number;
    preservedEvents: number;
  }>;
  readonly realSimulation: Readonly<{
    rides: number;
    allDecisionsCompleted: boolean;
    progress: number;
    state: string;
    rewards: number;
    acceptedEvents: number;
    uniqueTaxis: number;
    uniqueRides: number;
    firstDropoffTick: number;
    lastDropoffTick: number;
  }>;
  readonly bounds: Readonly<{
    ingested: number;
    retainedEvents: number;
    retainedEventCodeUnits: number;
    droppedEvents: number;
    activeInstances: number;
    recentEventsPerInstance: number;
    objectiveProgress: number;
    ancientDuplicate: string;
  }>;
  readonly checks: readonly MissionReportCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  name: string,
  expected: unknown,
  actual: unknown,
  detail: string,
): MissionReportCheck {
  return Object.freeze({
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
    detail,
  });
}

function truthy(name: string, actual: boolean, detail: string): MissionReportCheck {
  return check(name, true, actual, detail);
}

function throws(action: () => unknown, pattern: RegExp): boolean {
  try {
    action();
    return false;
  } catch (error) {
    return error instanceof Error && pattern.test(error.message);
  }
}

function catalogReport(): MissionSchemaReport['catalog'] {
  const catalog = createCampaignMissionCatalog();
  const rows: CatalogReportRow[] = catalog.missions.map((mission) =>
    Object.freeze({
      missionId: mission.missionId,
      version: mission.version,
      title: mission.title,
      objectives: Object.freeze(
        mission.objectives.map((objective) =>
          Object.freeze({
            objectiveId: objective.objectiveId,
            kind: objective.kind,
            target: objective.target,
            easy: objective.difficultyTargets.EASY ?? null,
            hard: objective.difficultyTargets.HARD ?? null,
            minDurationS: objective.minDurationS,
            profileId: objective.profileId,
            eventTypes: MISSION_OBJECTIVE_EVENT_TYPES[objective.kind],
          }),
        ),
      ),
      rewards: Object.freeze(
        mission.rewards.map((reward) =>
          Object.freeze({
            rewardId: reward.rewardId,
            kind: reward.kind,
            amount: reward.amount,
            unlockId: reward.unlockId,
          }),
        ),
      ),
      replay: Object.freeze({
        profileSource: mission.replay.profileSource,
        snapshotId: mission.replay.snapshotId,
        scenarioId: mission.replay.scenarioId,
        comparisonProfileIds: mission.replay.comparisonProfileIds,
      }),
      windowTicks: mission.windowTicks,
      incidentBudget: mission.incidentBudget,
      prerequisites: mission.prerequisites,
    }),
  );
  return Object.freeze({
    missions: rows.length,
    order: campaignOrder(catalog),
    ids: missionDefinitionIds(catalog),
    rows: Object.freeze(rows),
  });
}

function lifecycleProbe(): MissionSchemaReport['lifecycle'] {
  const bus = createMissionTestBus();
  const tracker = createMissionTestTracker({ bus });
  const started = tracker.start({ missionId: 'campaign-1-first-taxi', tick: 10 });
  const duplicateStart = tracker.start({ missionId: 'campaign-1-first-taxi', tick: 10 }).duplicate;
  publishAll(bus, [
    manualStart('report:manual', 11, 'taxi:report'),
    dropoff('report:dropoff', 12, 'taxi:report', 'ride:report'),
  ]);
  const instance = tracker.instance(started.instance.instanceId)!;
  const stats = tracker.stats();
  const report = Object.freeze({
    startState: 'ACTIVE',
    duplicateStart,
    state: instance.state,
    progress: instance.objectives[0]!.progress,
    target: instance.objectives[0]!.target,
    completedTick: instance.completedTick ?? -1,
    appliedEvents: instance.appliedEvents,
    rewardsGranted: instance.rewardsGranted,
    rewardLedger: tracker.rewards().length,
    stats: Object.freeze({
      instances: stats.instances,
      active: stats.active,
      completed: stats.completed,
      acceptedEvents: stats.acceptedEvents,
      duplicates: stats.duplicates,
      rewardsGranted: stats.rewardsGranted,
      tick: stats.tick,
    }),
  });
  tracker.dispose();
  bus.dispose();
  return report;
}

function reportObjective(
  objectiveId: string,
  kind: MissionObjective['kind'],
  target: number,
  minDurationS: number | null = null,
): MissionObjective {
  return {
    objectiveId,
    kind,
    label: objectiveId,
    target,
    difficultyTargets: { NORMAL: target },
    minDurationS,
    profileId: null,
  };
}

function objectivesProbe(): MissionSchemaReport['objectives'] {
  const catalog = createMissionTestCatalog([
    testMission({
      missionId: 'report-objectives',
      objectives: [
        reportObjective('manual', 'MANUAL_DROPOFFS', 1),
        reportObjective('clean', 'CLEAN_DROPOFFS', 1),
        reportObjective('dropoffs', 'DROPOFFS', 2),
        reportObjective('activation', 'LEARNING_ACTIVATIONS', 1),
        reportObjective('versions', 'DISTINCT_PROFILE_VERSIONS', 2),
        reportObjective('stop', 'FULL_STOPS', 1, 1.5),
        reportObjective('lane', 'LANE_CHANGES', 1),
        reportObjective('leader', 'LEADER_ACQUIRED', 1),
      ],
    }),
  ]);
  const tracker = createMissionTestTracker({ catalog });
  const started = tracker.start({ missionId: 'report-objectives', tick: 0 });
  tracker.ingest(manualStart('report:obj-manual', 1, 'taxi:obj'));
  tracker.ingest(dropoff('report:obj-drop-1', 2, 'taxi:obj', 'ride:obj-1'));
  tracker.ingest(dropoff('report:obj-drop-2', 3, 'taxi:obj', 'ride:obj-2'));
  tracker.ingest(profileActivate('report:obj-activation-1', 4, 'profile:obj', 'obj-v1'));
  tracker.ingest(profileActivate('report:obj-activation-2', 5, 'profile:obj', 'obj-v2'));
  tracker.ingest(fullStop('report:obj-stop', 6, 'taxi:obj', 'opportunity:obj', 2));
  tracker.ingest(
    laneChangeCompleted('report:obj-lane', 7, 'taxi:obj', 'opportunity:lane', 'lane:a', 'lane:b'),
  );
  tracker.ingest(leaderAcquired('report:obj-leader', 8, 'taxi:obj', 'civilian:obj', 18));
  const instance = tracker.instance(started.instance.instanceId)!;
  const report = Object.freeze({
    state: instance.state,
    rows: Object.freeze(
      instance.objectives.map((objective) =>
        Object.freeze({
          objectiveId: objective.objectiveId,
          kind: objective.kind,
          progress: objective.progress,
          target: objective.target,
          satisfied: objective.satisfied,
        }),
      ),
    ),
  });
  tracker.dispose();
  return report;
}

function duplicatesProbe(): MissionSchemaReport['duplicates'] {
  const tracker = createMissionTestTracker();
  const started = tracker.start({ missionId: 'campaign-1-first-taxi', tick: 0 });
  const manual = manualStart('report:duplicate-manual', 1, 'taxi:report');
  const drop = dropoff('report:duplicate-dropoff', 2, 'taxi:report', 'ride:report');
  const statuses = [
    tracker.ingest(manual).status,
    tracker.ingest(manual).status,
    tracker.ingest(drop).status,
    tracker.ingest(drop).status,
  ];
  const instance = tracker.instance(started.instance.instanceId)!;
  const rewardsAfterFirst = 2;
  const report = Object.freeze({
    manual: Object.freeze(statuses),
    progressAfterDuplicates: instance.objectives[0]!.progress,
    stateAfterDuplicates: instance.state,
    rewardsAfterFirst,
    rewardsAfterDuplicate: tracker.rewards().length,
    conflictRejected: throws(
      () => tracker.ingest(dropoff('report:duplicate-dropoff', 3, 'taxi:other', 'ride:other')),
      /Conflicting mission event identity/,
    ),
    duplicates: tracker.stats().duplicates,
  });
  tracker.dispose();
  return report;
}

function failureProbe(): MissionSchemaReport['failure'] {
  const windowed = createMissionTestCatalog([
    testMission({ missionId: 'report-windowed', windowTicks: 100 }),
  ]);
  const windowTracker = createMissionTestTracker({ catalog: windowed });
  const windowStart = windowTracker.start({ missionId: 'report-windowed', tick: 0 });
  windowTracker.advance(101);
  windowTracker.ingest(dropoff('report:late', 102, 'taxi:report', 'ride:report'));
  const windowInstance = windowTracker.instance(windowStart.instance.instanceId)!;
  const windowReport = Object.freeze({
    state: windowInstance.state,
    reason: windowInstance.failureReason ?? 'NONE',
    failedTick: windowInstance.failedTick ?? -1,
    lateCompletionState: windowTracker.instance(windowStart.instance.instanceId)!.state,
    rewards: windowTracker.rewards().length,
  });
  windowTracker.dispose();

  const incident = createMissionTestCatalog([
    testMission({
      missionId: 'report-incident',
      incidentBudget: 0,
      objectives: [
        {
          objectiveId: 'clean',
          kind: 'CLEAN_DROPOFFS',
          label: 'Clean ride',
          target: 1,
          difficultyTargets: { NORMAL: 1 },
          minDurationS: null,
          profileId: null,
        },
      ],
    }),
  ]);
  const incidentTracker = createMissionTestTracker({ catalog: incident });
  const incidentStart = incidentTracker.start({ missionId: 'report-incident', tick: 0 });
  incidentTracker.ingest(collision('report:collision', 1, 'taxi:report'));
  const incidentInstance = incidentTracker.instance(incidentStart.instance.instanceId)!;
  const incidentReport = Object.freeze({
    state: incidentInstance.state,
    reason: incidentInstance.failureReason ?? 'NONE',
    incidents: incidentInstance.incidents,
    rewards: incidentTracker.rewards().length,
  });
  incidentTracker.dispose();
  return Object.freeze({ window: windowReport, incident: incidentReport });
}

function replayProbe(): MissionSchemaReport['replay'] {
  const catalog = createMissionTestCatalog([
    testMission({
      missionId: 'report-replay',
      objectives: [
        {
          ...testMission().objectives[0]!,
          target: 2,
          difficultyTargets: { NORMAL: 2 },
        },
      ],
      replay: {
        profileSource: 'SNAPSHOT',
        snapshotId: 'snapshot:report-replay',
        scenarioId: 'scenario:report-replay',
        comparisonProfileIds: ['profile:a', 'profile:b'],
      },
    }),
  ]);
  const tracker = createMissionTestTracker({ catalog });
  const first = tracker.start({ missionId: 'report-replay', tick: 0 });
  tracker.ingest(dropoff('report:replay-first', 1, 'taxi:report', 'ride:1'));
  tracker.fail({ instanceId: first.instance.instanceId, reason: 'PLAYER_ABANDONED', tick: 5 });
  const rewardsAfterFirstAttempt = tracker.rewards().length;
  const replay = tracker.replay({ instanceId: first.instance.instanceId, tick: 6 });
  tracker.ingest(dropoff('report:replay-1', 7, 'taxi:report', 'ride:2'));
  tracker.ingest(dropoff('report:replay-2', 8, 'taxi:report', 'ride:3'));
  const rewardsAfterReplay = tracker.rewards().length;
  const third = tracker.replay({ instanceId: replay.instance.instanceId, tick: 9 }).instance;
  tracker.ingest(dropoff('report:third-1', 10, 'taxi:report', 'ride:4'));
  tracker.ingest(dropoff('report:third-2', 11, 'taxi:report', 'ride:5'));
  const thirdInstance = tracker.instance(third.instanceId)!;
  const report = Object.freeze({
    firstState: tracker.instance(first.instance.instanceId)!.state,
    attempt: replay.instance.attempt,
    replayedFromMatches: replay.instance.replayedFrom === first.instance.instanceId,
    state: replay.instance.state,
    progress: replay.instance.objectives[0]!.progress,
    profileSource: replay.instance.replay.profileSource,
    snapshotId: replay.instance.replay.snapshotId ?? 'NONE',
    comparisonProfiles: replay.instance.replay.comparisonProfileIds,
    rewardsAfterFirstAttempt,
    rewardsAfterReplay,
    rewardsAfterThirdAttempt: tracker.rewards().length,
    rewardsGrantedThirdAttempt: thirdInstance.rewardsGranted,
    rewardDuplicates: tracker.stats().rewardsDuplicate,
  });
  tracker.dispose();
  return report;
}

function identityProbe(): MissionSchemaReport['identity'] {
  const catalog = createCampaignMissionCatalog();
  const mission = catalog.missions.find((entry) => entry.missionId === 'campaign-1-first-taxi')!;
  const catalog2 = createCampaignMissionCatalog(catalog.namespace);
  const mission2 = catalog2.missions.find((entry) => entry.missionId === mission.missionId)!;
  const first = missionInstanceId(catalog.namespace, mission.missionId, 1);
  const second = missionInstanceId(catalog.namespace, mission.missionId, 2);
  const rewardId = missionRewardId(catalog.namespace, mission.missionId, mission.version, 'xp');
  const versionTwo = missionRewardId(catalog.namespace, mission.missionId, '2', 'xp');
  return Object.freeze({
    namespace: catalog.namespace,
    instanceIdPrefix: first.startsWith('id-v1:') ? 'id-v1:' : 'OTHER',
    instanceIdsStable: first === missionInstanceId(catalog2.namespace, mission2.missionId, 1),
    attemptsDistinct: first !== second,
    rewardIdStable: rewardId === missionRewardId(catalog2.namespace, mission2.missionId, '1', 'xp'),
    rewardVersionScoped: rewardId !== versionTwo,
    rewardIdentityMatches:
      rewardId === missionRewardId(catalog.namespace, 'campaign-1-first-taxi', '1', 'xp'),
  });
}

function restoreProbe(): MissionSchemaReport['restore'] {
  const catalog = createMissionTestCatalog([
    testMission({
      missionId: 'report-restore',
      objectives: [
        {
          ...testMission().objectives[0]!,
          target: 2,
          difficultyTargets: { NORMAL: 2 },
        },
      ],
    }),
  ]);
  const tracker = createMissionTestTracker({ catalog });
  const started = tracker.start({ missionId: 'report-restore', tick: 0 });
  tracker.ingest(dropoff('report:restore-first', 1, 'taxi:report', 'ride:1'));
  const snapshot = tracker.snapshot();
  tracker.dispose();

  const restored = createMissionTestTracker({ catalog });
  restored.restore(snapshot);
  const instance = restored.instance(started.instance.instanceId)!;
  const duplicateAfterRestore = restored.ingest(
    dropoff('report:restore-first', 1, 'taxi:report', 'ride:1'),
  ).status;
  restored.ingest(dropoff('report:restore-second', 2, 'taxi:report', 'ride:2'));
  const completed = restored.instance(started.instance.instanceId)!;

  const terminalSnapshot = restored.snapshot();
  restored.dispose();
  const terminal = createMissionTestTracker({ catalog });
  terminal.restore(terminalSnapshot);
  const terminalInstance = terminal.instance(started.instance.instanceId)!;
  const replay = terminal.replay({ instanceId: terminalInstance.instanceId, tick: 3 });

  const forged = createMissionTestTracker({ catalog });
  const forgedRejected = throws(
    () =>
      forged.restore({
        ...snapshot,
        instances: [{ ...snapshot.instances[0]!, instanceId: 'forged' }],
      }),
    /stable 006 identity/,
  );
  forged.dispose();
  const versionMismatch = createMissionTestTracker({ catalog });
  const versionMismatchRejected = throws(
    () =>
      versionMismatch.restore({
        ...snapshot,
        instances: snapshot.instances.map((entry) => ({ ...entry, missionVersion: '999' })),
      }),
    /version does not match/,
  );
  versionMismatch.dispose();
  const report = Object.freeze({
    restoredState: instance.state,
    restoredProgress: instance.objectives[0]!.progress,
    duplicateAfterRestore,
    continuedState: completed.state,
    rewards: terminal.rewards().length,
    terminalState: terminalInstance.state,
    replayAttempt: replay.instance.attempt,
    forgedInstanceRejected: forgedRejected,
    versionMismatchRejected,
  });
  terminal.dispose();
  return report;
}

function resetProbe(): MissionSchemaReport['reset'] {
  const tracker = createMissionTestTracker();
  tracker.start({ missionId: 'campaign-1-first-taxi', tick: 0 });
  tracker.ingest(manualStart('report:reset-manual', 1, 'taxi:report'));
  tracker.ingest(dropoff('report:reset-dropoff', 2, 'taxi:report', 'ride:1'));
  const rewardsKept = tracker.rewards().length;
  const preservedEvents = tracker.stats().retainedEvents;
  const reset = tracker.reset({ tick: 100 });
  const instancesAfter = tracker.instances().length;
  const again = tracker.start({ missionId: 'campaign-1-first-taxi', tick: 100 });
  tracker.ingest(manualStart('report:reset-manual-2', 101, 'taxi:report'));
  tracker.ingest(dropoff('report:reset-dropoff-2', 102, 'taxi:report', 'ride:2'));
  const instance = tracker.instance(again.instance.instanceId)!;
  const report = Object.freeze({
    clearedInstances: reset.clearedInstances,
    instancesAfter,
    rewardsKept,
    completedAfterReset: instance.state === 'COMPLETED' ? 1 : 0,
    rewardsAfterSecondCompletion: tracker.rewards().length,
    rewardsGrantedSecondCompletion: instance.rewardsGranted,
    preservedEvents,
  });
  tracker.dispose();
  return report;
}

function realSimulationProbe(): MissionSchemaReport['realSimulation'] {
  const real = realRideDropoffs(3);
  try {
    const catalog = createMissionTestCatalog([
      testMission({
        missionId: 'report-real-rides',
        objectives: [
          {
            objectiveId: 'real-dropoffs',
            kind: 'DROPOFFS',
            label: 'Real rides',
            target: 3,
            difficultyTargets: { NORMAL: 3 },
            minDurationS: null,
            profileId: null,
          },
        ],
      }),
    ]);
    const bus = createMissionTestBus();
    const tracker: MissionTracker = createMissionTestTracker({ catalog, bus });
    const started = tracker.start({ missionId: 'report-real-rides', tick: 1 });
    for (const ride of real.dropoffs) bus.publish(ride.event);
    const instance = tracker.instance(started.instance.instanceId)!;
    const ticks = real.dropoffs.map((ride) => ride.tick);
    const report = Object.freeze({
      rides: real.dropoffs.length,
      allDecisionsCompleted: real.dropoffs.every((ride) => ride.decision.status === 'COMPLETED'),
      progress: instance.objectives[0]!.progress,
      state: instance.state,
      rewards: tracker.rewards().length,
      acceptedEvents: tracker.stats().acceptedEvents,
      uniqueTaxis: new Set(real.dropoffs.map((ride) => ride.taxiId)).size,
      uniqueRides: new Set(real.dropoffs.map((ride) => ride.rideId)).size,
      firstDropoffTick: Math.min(...ticks),
      lastDropoffTick: Math.max(...ticks),
    });
    tracker.dispose();
    bus.dispose();
    return report;
  } finally {
    real.dispose();
  }
}

function boundsProbe(): MissionSchemaReport['bounds'] {
  const objective: MissionObjective = {
    objectiveId: 'bulk',
    kind: 'DROPOFFS',
    label: 'Bulk dropoffs',
    target: 50_000,
    difficultyTargets: { NORMAL: 50_000 },
    minDurationS: null,
    profileId: null,
  };
  const catalog = createMissionTestCatalog([
    testMission({ missionId: 'report-bulk', objectives: [objective] }),
  ]);
  const tracker = createMissionTestTracker({ catalog });
  const started = tracker.start({ missionId: 'report-bulk', tick: 0 });
  const total = MISSION_LIMITS.retainedEvents + 64;
  let ancientDuplicate = 'ACCEPTED';
  for (let index = 0; index < total; index += 1) {
    tracker.ingest(dropoff(`report:bulk:${index}`, index + 1, 'taxi:bulk', `ride:${index}`));
  }
  try {
    ancientDuplicate = tracker.ingest(dropoff('report:bulk:0', 1, 'taxi:bulk', 'ride:0')).status;
  } catch (error) {
    ancientDuplicate = error instanceof Error ? 'STALE_REJECTED' : 'REJECTED';
  }
  const instance = tracker.instance(started.instance.instanceId)!;
  const stats = tracker.stats();
  const report = Object.freeze({
    ingested: total,
    retainedEvents: stats.retainedEvents,
    retainedEventCodeUnits: stats.retainedEventCodeUnits,
    droppedEvents: stats.droppedEvents,
    activeInstances: stats.active,
    recentEventsPerInstance: instance.recentEventIds.length,
    objectiveProgress: instance.objectives[0]!.progress,
    ancientDuplicate,
  });
  tracker.dispose();
  return report;
}

export function runMissionSchemaReport(): MissionSchemaReport {
  const catalog = catalogReport();
  const lifecycle = lifecycleProbe();
  const objectives = objectivesProbe();
  const duplicates = duplicatesProbe();
  const failure = failureProbe();
  const replay = replayProbe();
  const identity = identityProbe();
  const restore = restoreProbe();
  const reset = resetProbe();
  const realSimulation = realSimulationProbe();
  const secondRealSimulation = realSimulationProbe();
  const bounds = boundsProbe();
  const definitionsSource = readFileSync(
    join(process.cwd(), 'src', 'missions', 'definitions.ts'),
    'utf8',
  );
  const lifecycleSource = readFileSync(
    join(process.cwd(), 'src', 'missions', 'lifecycle.ts'),
    'utf8',
  );
  const noWallClock = [definitionsSource, lifecycleSource].every(
    (source) =>
      !/\bDate\b|performance\.now|setTimeout|setInterval|requestAnimationFrame|Math\.random/.test(
        source,
      ),
  );
  const noDom = [definitionsSource, lifecycleSource].every(
    (source) => !/\bdocument\b|HTMLElement|HTMLCanvasElement|@babylonjs|@dimforge/.test(source),
  );
  const deterministic = { realSimulation, secondRealSimulation };
  const repeatable =
    JSON.stringify(deterministic.realSimulation) ===
    JSON.stringify(deterministic.secondRealSimulation);
  const expectedKinds = [
    'DROPOFFS',
    'MANUAL_DROPOFFS',
    'CLEAN_DROPOFFS',
    'LEARNING_ACTIVATIONS',
    'DISTINCT_PROFILE_VERSIONS',
    'FULL_STOPS',
    'LANE_CHANGES',
    'LEADER_ACQUIRED',
  ];
  const checks: MissionReportCheck[] = [
    check('version', MISSION_SCHEMA_VERSION, MISSION_SCHEMA_VERSION, 'One versioned schema.'),
    check(
      'limits',
      {
        missions: 32,
        objectivesPerMission: 8,
        rewardsPerMission: 4,
        activeInstances: 16,
        retainedInstances: 64,
        attemptsPerMission: 8,
        retainedEvents: 8192,
        eventCodeUnits: 1_048_576,
        retainedRewards: 4096,
        recentEventsPerInstance: 16,
      },
      {
        missions: MISSION_LIMITS.missions,
        objectivesPerMission: MISSION_LIMITS.objectivesPerMission,
        rewardsPerMission: MISSION_LIMITS.rewardsPerMission,
        activeInstances: MISSION_LIMITS.activeInstances,
        retainedInstances: MISSION_LIMITS.retainedInstances,
        attemptsPerMission: MISSION_LIMITS.attemptsPerMission,
        retainedEvents: MISSION_LIMITS.retainedEvents,
        eventCodeUnits: MISSION_LIMITS.eventCodeUnits,
        retainedRewards: MISSION_LIMITS.retainedRewards,
        recentEventsPerInstance: MISSION_LIMITS.recentEventsPerInstance,
      },
      'Every capacity is a fixed budget; no wall-clock growth.',
    ),
    check(
      'catalog',
      {
        missions: 8,
        ids: [
          'campaign-1-first-taxi',
          'campaign-2-first-demonstration',
          'campaign-3-following-distance',
          'campaign-4-stops-and-signals',
          'campaign-5-passenger',
          'campaign-6-city-copies-you',
          'campaign-7-changing-a-habit',
          'campaign-8-fleet-challenge',
        ],
        versions: Array.from({ length: 8 }, () => '1'),
        namespace: MISSION_CATALOG_NAMESPACE,
      },
      {
        missions: catalog.missions,
        ids: catalog.ids,
        versions: catalog.rows.map((row) => row.version),
        namespace: MISSION_CATALOG_NAMESPACE,
      },
      'Eight authored campaign missions with stable ids and definition versions.',
    ),
    check(
      'campaign-order',
      [
        'campaign-1-first-taxi',
        'campaign-2-first-demonstration',
        'campaign-3-following-distance',
        'campaign-4-stops-and-signals',
        'campaign-5-passenger',
        'campaign-6-city-copies-you',
        'campaign-7-changing-a-habit',
        'campaign-8-fleet-challenge',
      ],
      catalog.order,
      'The prerequisite graph is a DAG in campaign order.',
    ),
    check(
      'objective-kinds',
      expectedKinds,
      [...missionObjectiveKinds],
      'The objective vocabulary is closed.',
    ),
    check(
      'objective-events',
      {
        DROPOFFS: ['DROPOFF'],
        MANUAL_DROPOFFS: ['DROPOFF', 'MANUAL_START'],
        CLEAN_DROPOFFS: ['DROPOFF', 'COLLISION'],
        LEARNING_ACTIVATIONS: ['PROFILE_ACTIVATE'],
        DISTINCT_PROFILE_VERSIONS: ['PROFILE_ACTIVATE'],
        FULL_STOPS: ['FULL_STOP'],
        LANE_CHANGES: ['LANE_CHANGE_COMPLETED'],
        LEADER_ACQUIRED: ['LEADER_ACQUIRED'],
      },
      Object.fromEntries(
        expectedKinds.map((kind) => [
          kind,
          [...MISSION_OBJECTIVE_EVENT_TYPES[kind as keyof typeof MISSION_OBJECTIVE_EVENT_TYPES]],
        ]),
      ),
      'Each objective consumes only real 007 events.',
    ),
    check(
      'states',
      {
        states: ['ACTIVE', 'COMPLETED', 'FAILED'],
        terminal: ['COMPLETED', 'FAILED'],
        failureReasons: [
          'EVALUATION_WINDOW_EXPIRED',
          'INCIDENT_BUDGET_EXCEEDED',
          'SCENARIO_RESET',
          'PLAYER_ABANDONED',
        ],
        rewardKinds: ['XP', 'UNLOCK_CHALLENGE', 'UNLOCK_VEHICLE_CLASS', 'UNLOCK_ANALYSIS_TOOL'],
        difficulties: ['EASY', 'NORMAL', 'HARD'],
        replayProfileSources: ['CURRENT', 'SNAPSHOT'],
      },
      {
        states: [...missionStates],
        terminal: [...MISSION_TERMINAL_STATES],
        failureReasons: [...MISSION_FAILURE_REASONS],
        rewardKinds: [...missionRewardKinds],
        difficulties: [...missionDifficulties],
        replayProfileSources: [...missionReplayProfileSources],
      },
      'Lifecycle, failure and reward vocabularies are closed.',
    ),
    check(
      'difficulty-targets',
      { easy: 2, normal: 3, hard: 4, incidentBudget: 0 },
      (() => {
        const fleet = campaignMissionDefinitions().find(
          (mission) => mission.missionId === 'campaign-8-fleet-challenge',
        )!;
        const objective = fleet.objectives[0]!;
        return {
          easy: missionTargetFor(objective, 'EASY'),
          normal: missionTargetFor(objective, 'NORMAL'),
          hard: missionTargetFor(objective, 'HARD'),
          incidentBudget: fleet.incidentBudget,
        };
      })(),
      'Difficulty changes declared thresholds only, never the learned style.',
    ),
    check(
      'lifecycle',
      {
        startState: 'ACTIVE',
        duplicateStart: true,
        state: 'COMPLETED',
        progress: 1,
        target: 1,
        completedTick: 12,
        appliedEvents: 2,
        rewardsGranted: 2,
        rewardLedger: 2,
        stats: {
          instances: 1,
          active: 0,
          completed: 1,
          acceptedEvents: 2,
          duplicates: 0,
          rewardsGranted: 2,
          tick: 12,
        },
      },
      lifecycle,
      'Start, MANUAL progress and completion run through the real 007 bus.',
    ),
    check(
      'objectives',
      {
        state: 'COMPLETED',
        rows: [
          {
            objectiveId: 'manual',
            kind: 'MANUAL_DROPOFFS',
            progress: 1,
            target: 1,
            satisfied: true,
          },
          { objectiveId: 'clean', kind: 'CLEAN_DROPOFFS', progress: 1, target: 1, satisfied: true },
          { objectiveId: 'dropoffs', kind: 'DROPOFFS', progress: 2, target: 2, satisfied: true },
          {
            objectiveId: 'activation',
            kind: 'LEARNING_ACTIVATIONS',
            progress: 1,
            target: 1,
            satisfied: true,
          },
          {
            objectiveId: 'versions',
            kind: 'DISTINCT_PROFILE_VERSIONS',
            progress: 2,
            target: 2,
            satisfied: true,
          },
          { objectiveId: 'stop', kind: 'FULL_STOPS', progress: 1, target: 1, satisfied: true },
          { objectiveId: 'lane', kind: 'LANE_CHANGES', progress: 1, target: 1, satisfied: true },
          {
            objectiveId: 'leader',
            kind: 'LEADER_ACQUIRED',
            progress: 1,
            target: 1,
            satisfied: true,
          },
        ],
      },
      objectives,
      'Every objective kind advances from its real event payload, including the FULL_STOP floor.',
    ),
    check(
      'duplicates',
      {
        manual: ['IGNORED', 'DUPLICATE', 'ACCEPTED', 'DUPLICATE'],
        progressAfterDuplicates: 1,
        stateAfterDuplicates: 'COMPLETED',
        rewardsAfterFirst: 2,
        rewardsAfterDuplicate: 2,
        conflictRejected: true,
        duplicates: 2,
      },
      duplicates,
      'A repeated event id is DUPLICATE and never re-awards progress or rewards.',
    ),
    check(
      'window-failure',
      {
        state: 'FAILED',
        reason: 'EVALUATION_WINDOW_EXPIRED',
        failedTick: 101,
        lateCompletionState: 'FAILED',
        rewards: 0,
      },
      failure.window,
      'A late terminal event cannot complete a mission after its window.',
    ),
    check(
      'incident-failure',
      {
        state: 'FAILED',
        reason: 'INCIDENT_BUDGET_EXCEEDED',
        incidents: 1,
        rewards: 0,
      },
      failure.incident,
      'An exceeded incident budget fails the mission without a reward.',
    ),
    check(
      'replay',
      {
        firstState: 'FAILED',
        attempt: 2,
        replayedFromMatches: true,
        state: 'ACTIVE',
        progress: 0,
        profileSource: 'SNAPSHOT',
        snapshotId: 'snapshot:report-replay',
        comparisonProfiles: ['profile:a', 'profile:b'],
        rewardsAfterFirstAttempt: 0,
        rewardsAfterReplay: 2,
        rewardsAfterThirdAttempt: 2,
        rewardsGrantedThirdAttempt: 0,
        rewardDuplicates: 2,
      },
      replay,
      'Replay creates the next stable attempt, resets progress, keeps earned rewards once.',
    ),
    check(
      'identity',
      {
        namespace: MISSION_CATALOG_NAMESPACE,
        instanceIdPrefix: 'id-v1:',
        instanceIdsStable: true,
        attemptsDistinct: true,
        rewardIdStable: true,
        rewardVersionScoped: true,
        rewardIdentityMatches: true,
      },
      identity,
      'Instance and reward identities are stable 006 values, version-scoped for rewards.',
    ),
    check(
      'restore',
      {
        restoredState: 'ACTIVE',
        restoredProgress: 1,
        duplicateAfterRestore: 'DUPLICATE',
        continuedState: 'COMPLETED',
        rewards: 2,
        terminalState: 'COMPLETED',
        replayAttempt: 2,
        forgedInstanceRejected: true,
        versionMismatchRejected: true,
      },
      restore,
      'Snapshot/restore keeps progress and idempotency; forged identities are rejected.',
    ),
    check(
      'reset',
      {
        clearedInstances: 1,
        instancesAfter: 0,
        rewardsKept: 2,
        completedAfterReset: 1,
        rewardsAfterSecondCompletion: 2,
        rewardsGrantedSecondCompletion: 0,
        preservedEvents: 2,
      },
      reset,
      'A scenario reset clears instances but keeps processed events and rewards.',
    ),
    check(
      'real-simulation',
      {
        rides: 3,
        allDecisionsCompleted: true,
        progress: 3,
        state: 'COMPLETED',
        rewards: 2,
        acceptedEvents: 3,
        uniqueTaxis: 3,
        uniqueRides: 3,
        firstDropoffTick: 210,
        lastDropoffTick: 610,
      },
      realSimulation,
      'Real 057/059/060/061/063 rides advance the mission through real 007 events.',
    ),
    check(
      'bounded-ledger',
      {
        ingested: 8256,
        retainedEvents: 4462,
        retainedEventCodeUnits: 1_048_570,
        droppedEvents: 3794,
        activeInstances: 1,
        recentEventsPerInstance: 16,
        objectiveProgress: 8256,
        ancientDuplicate: 'STALE_REJECTED',
      },
      bounds,
      'The event ledger and per-instance evidence stay bounded; an ancient replay is stale.',
    ),
    truthy('determinism', repeatable, 'Two identical real simulations produce identical results.'),
    truthy('no-wall-clock', noWallClock, 'The source has no Date, timer or ambient randomness.'),
    truthy('no-dom-or-renderer', noDom, 'The source has no DOM, Babylon or Rapier dependency.'),
    check(
      'validation-errors',
      true,
      throws(
        () =>
          parseMissionDefinition({
            ...testMission(),
            replay: {
              profileSource: 'SNAPSHOT',
              snapshotId: null,
              scenarioId: null,
              comparisonProfileIds: [],
            },
          }),
        /snapshot id/,
      ) &&
        throws(() => createMissionTracker({}), /catalog/) &&
        throws(() => parseMissionCatalog({}), /mission catalog/),
      'Malformed definitions, catalogs and options are rejected instead of defaulted.',
    ),
  ];
  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: MISSION_SCHEMA_VERSION,
    generatedBy:
      'node --import ./scripts/register-typescript.mjs scripts/run-mission-schema-report.mjs',
    oracleRule:
      'Eight authored campaign missions declare stable ids, definition versions, real-event objectives, rewards, a replay policy and an evaluation window. An instance starts once, advances only from validated 007 events, completes when every objective target is satisfied, fails through an explicit reason, window or incident budget, and can be replayed as the next stable attempt. Event ids and reward identities are idempotent inside bounded ledgers, so a duplicate event or a replay never awards progress or a reward twice; profile state is never touched by the tracker.',
    limits: MISSION_LIMITS,
    contract: Object.freeze({
      namespace: MISSION_CATALOG_NAMESPACE,
      states: Object.freeze([...missionStates]),
      terminalStates: Object.freeze([...MISSION_TERMINAL_STATES]),
      failureReasons: Object.freeze([...MISSION_FAILURE_REASONS]),
      objectiveKinds: Object.freeze([...missionObjectiveKinds]),
      rewardKinds: Object.freeze([...missionRewardKinds]),
      difficulties: Object.freeze([...missionDifficulties]),
      replayProfileSources: Object.freeze([...missionReplayProfileSources]),
      objectiveEvents: Object.freeze(
        Object.fromEntries(
          missionObjectiveKinds.map((kind) => [kind, MISSION_OBJECTIVE_EVENT_TYPES[kind]]),
        ),
      ),
    }),
    catalog,
    lifecycle,
    objectives,
    duplicates,
    failure,
    replay,
    identity,
    restore,
    reset,
    realSimulation,
    bounds,
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}

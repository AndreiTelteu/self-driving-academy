/**
 * PBI 199 - deterministic evidence suite for the walking tutorial.
 *
 * Every fact in this suite is produced by the module that owns it: the walker states come from the
 * real 192 fixed-tick controller, the entry and exit decisions from the real 195/196 contracts, the
 * ride facts from validated 007 events and the compatibility snapshot from the delivered 231/188/
 * 211/125/213 read models. Nothing here writes telemetry, creates a learning job or reads a clock.
 */
import { createHash } from 'node:crypto';
import {
  VEHICLE_ENTRY_POLICY,
  VEHICLE_EXIT_POLICY,
  WALKER_GAIT_SPEEDS_MPS,
  createWalker,
  createWalkWorld,
  decideVehicleEntry,
  decideVehicleExit,
  vehicleEntryDoor,
} from '../../src/character';
import type {
  VehicleEntryDecision,
  VehicleExitDecision,
  WalkerState,
  WalkWorld,
} from '../../src/character';
import {
  WALKING_TUTORIAL_ID,
  WALKING_TUTORIAL_POLICY,
  WALKING_TUTORIAL_VERSION,
  createWalkingTutorial,
  walkingTutorialStepIds,
} from '../../src/missions';
import type {
  WalkingTutorial,
  WalkingTutorialEventKind,
  WalkingTutorialObservation,
  WalkingTutorialStepId,
} from '../../src/missions';
import {
  advanceDailyCalendar,
  createCampaignMissionCatalog,
  createChallengeTemplateCatalog,
  createComposedChallengeCatalog,
  createDailyCalendarState,
  createMissionRewardsLedger,
  createPlayerProgress,
  dailyCapabilities,
  missionVehicleAccess,
  parsePlayerProgress,
} from '../../src/missions';
import { completeMission, createRewardsTracker } from './mission-rewards-fixture';
import { setForDay } from './mission-daily-fixture';
import { pickup, dropoff, profileActivate } from './mission-fixture';
import { createFleetRegistry, DEFAULT_FLEET_COUNTS } from '../../src/fleet';

export const TUTORIAL_REPORT_CONTRACT = WALKING_TUTORIAL_VERSION;
export const WALKING_TUTORIAL_REPORT_COMMAND = 'npm run walking:tutorial';

export const TUTORIAL_TAXI_ID = 'vehicle:taxi-199';
export const TUTORIAL_TAXI_ID_B = 'vehicle:taxi-199-b';
export const TUTORIAL_RIDE_ID = 'ride:199-1';
export const TUTORIAL_CHARACTER_ID = 'player-character';
export const TUTORIAL_SESSION_ID = 'session-199-walking-tutorial';
export const TUTORIAL_DAILY_DATE = '2026-11-15';
export const TUTORIAL_V1_MISSION_ID = 'campaign-1-first-taxi';

/** Ticks are explicit so the transcript is byte-stable and no wall clock participates. */
export const TUTORIAL_TICKS = Object.freeze({
  start: 0,
  selection: 5,
  baseline: 10,
  motion: 11,
  entry: 200,
  pickup: 210,
  dropoff: 220,
  exit: 230,
  abandon: 231,
  v1Mission: 500,
});

type RideEnvelope = ReturnType<typeof pickup>;

function flatStreet(): WalkWorld {
  return createWalkWorld({
    surfaces: [
      {
        id: 'fixture:street-199',
        kind: 'STREET',
        topM: 0,
        vertices: [
          { x: -20, z: -20 },
          { x: 20, z: -20 },
          { x: 20, z: 20 },
          { x: -20, z: 20 },
        ],
      },
    ],
    blockers: [],
    defaultGroundM: 0,
  });
}

export interface WalkingFixture {
  readonly world: WalkWorld;
  readonly states: readonly WalkerState[];
  readonly entryAt: (tick: number) => VehicleEntryDecision;
  readonly entryRefusalAt: (tick: number) => VehicleEntryDecision;
  readonly exitAt: (tick: number) => VehicleExitDecision;
  readonly exitRefusalAt: (tick: number) => VehicleExitDecision;
  readonly pickupAt: (tick: number, rideId?: string, vehicleId?: string) => RideEnvelope;
  readonly dropoffAt: (tick: number, rideId?: string, vehicleId?: string) => RideEnvelope;
  readonly profileAt: (tick: number) => RideEnvelope;
  readonly taxi: Readonly<{ vehicleId: string; doorDistanceM: number; movedM: number }>;
}

/**
 * One real walker on a flat authored street, a taxi parked 0.30 m from the position the character
 * reaches on the motion tick, and the exact 195/196 decisions for that geometry.
 */
export function walkingFixture(): WalkingFixture {
  const world = flatStreet();
  const walker = createWalker({
    world,
    start: { positionM: Object.freeze({ x: 0, y: 0, z: -2 }), yawRad: 0 },
  });
  const states: WalkerState[] = [walker.state];
  for (let tick = 1; tick <= 240; tick += 1)
    states.push(
      walker.step({
        tick,
        input: Object.freeze({ headingRad: 0, gait: 'WALK' as const, intensity: 1 }),
      }).state,
    );
  const baseline = states[TUTORIAL_TICKS.baseline]!;
  const motion = states[TUTORIAL_TICKS.motion]!;
  const outward = Object.freeze({ x: 1, z: 0 });
  const footprint = Object.freeze({ x: 0.85, z: 2 });
  const doorM = Object.freeze({
    x: motion.positionM.x + outward.x * 0.3,
    y: motion.positionM.y,
    z: motion.positionM.z + outward.z * 0.3,
  });
  const center = Object.freeze({
    x: doorM.x + outward.x * footprint.x,
    y: doorM.y,
    z: doorM.z + outward.z * footprint.x,
  });
  const vehicle = Object.freeze({
    vehicleId: TUTORIAL_TAXI_ID,
    driverKind: 'TAXI' as const,
    classId: 'sedan',
    positionM: center,
    yawRad: 0,
    halfExtentsM: footprint,
    bottomM: 0.29,
    topM: 1.8,
    availability: 'AVAILABLE' as const,
    state: Object.freeze({
      tick: TUTORIAL_TICKS.entry - 1,
      controlMode: 'AUTO' as const,
      velocityMps: Object.freeze({ x: 0, y: 0, z: 0 }),
      laneId: null,
      maneuverState: 'IDLE' as const,
      routeLaneIds: Object.freeze([]),
      rideId: null,
      rideProgressM: 0,
      appliedProfileVersion: 'profile-199-base',
    }),
  });
  const character = Object.freeze({
    entityId: TUTORIAL_CHARACTER_ID,
    positionM: motion.positionM,
    yawRad: motion.yawRad,
    radiusM: walker.capsule.radiusM,
    heightM: walker.capsule.heightM,
  });
  const door = vehicleEntryDoor(vehicle, motion.positionM);
  const movedM = Math.hypot(
    motion.positionM.x - baseline.positionM.x,
    motion.positionM.z - baseline.positionM.z,
  );
  if (Math.abs(door.distanceM - 0.3) > 1e-9)
    throw new Error(`199 fixture expected a 0.30 m door, measured ${door.distanceM}`);
  if (movedM <= 0) throw new Error('199 fixture walker did not move on the motion tick');

  const entryDecision = (tick: number): VehicleEntryDecision =>
    decideVehicleEntry({
      tick,
      authority: Object.freeze({ consumer: 'CHARACTER', characterId: TUTORIAL_CHARACTER_ID }),
      character,
      intent: Object.freeze({ vehicleId: TUTORIAL_TAXI_ID }),
      vehicles: Object.freeze([vehicle]),
      blockers: world.blockers,
      previousEntry: null,
    });

  const manualVehicle = Object.freeze({
    ...vehicle,
    state: Object.freeze({
      ...vehicle.state,
      tick: TUTORIAL_TICKS.exit - 1,
      controlMode: 'MANUAL' as const,
    }),
  });
  const exitDecision = (tick: number): VehicleExitDecision =>
    decideVehicleExit({
      tick,
      authority: Object.freeze({ consumer: 'VEHICLE', vehicleId: TUTORIAL_TAXI_ID }),
      character: Object.freeze({
        entityId: TUTORIAL_CHARACTER_ID,
        radiusM: walker.capsule.radiusM,
        heightM: walker.capsule.heightM,
      }),
      vehicle: manualVehicle,
      preTakeover: vehicle,
      vehicles: Object.freeze([manualVehicle]),
      world: Object.freeze({
        surfaces: world.surfaces,
        blockers: world.blockers,
        defaultGroundM: world.defaultGroundM,
      }),
      previousExit: null,
    });

  const acceptedEntry = entryDecision(TUTORIAL_TICKS.entry);
  const acceptedExit = exitDecision(TUTORIAL_TICKS.exit);
  if (!acceptedEntry.accepted)
    throw new Error(`199 fixture entry was refused: ${acceptedEntry.code}`);
  if (!acceptedExit.accepted) throw new Error(`199 fixture exit was refused: ${acceptedExit.code}`);

  return Object.freeze({
    world,
    states: Object.freeze(states),
    entryAt: entryDecision,
    entryRefusalAt: (tick: number): VehicleEntryDecision =>
      decideVehicleEntry({
        tick,
        authority: Object.freeze({ consumer: 'CHARACTER', characterId: TUTORIAL_CHARACTER_ID }),
        character,
        intent: Object.freeze({ vehicleId: 'vehicle:199-absent' }),
        vehicles: Object.freeze([vehicle]),
        blockers: world.blockers,
        previousEntry: null,
      }),
    exitAt: exitDecision,
    exitRefusalAt: (tick: number): VehicleExitDecision =>
      decideVehicleExit({
        tick,
        authority: Object.freeze({ consumer: 'VEHICLE', vehicleId: TUTORIAL_TAXI_ID }),
        character: Object.freeze({
          entityId: TUTORIAL_CHARACTER_ID,
          radiusM: walker.capsule.radiusM,
          heightM: walker.capsule.heightM,
        }),
        // The pre-takeover car is AUTO, so 196 refuses to release a seat that is not held.
        vehicle,
        preTakeover: vehicle,
        vehicles: Object.freeze([vehicle]),
        world: Object.freeze({
          surfaces: world.surfaces,
          blockers: world.blockers,
          defaultGroundM: world.defaultGroundM,
        }),
        previousExit: null,
      }),
    pickupAt: (tick: number, rideId = TUTORIAL_RIDE_ID, vehicleId = TUTORIAL_TAXI_ID) =>
      pickup(`199:pickup:${tick}:${rideId}`, tick, vehicleId, rideId),
    dropoffAt: (tick: number, rideId = TUTORIAL_RIDE_ID, vehicleId = TUTORIAL_TAXI_ID) =>
      dropoff(`199:dropoff:${tick}:${rideId}`, tick, vehicleId, rideId),
    profileAt: (tick: number) =>
      profileActivate(`199:profile:${tick}`, tick, 'profile:199', 'version-199:1'),
    taxi: Object.freeze({
      vehicleId: TUTORIAL_TAXI_ID,
      doorDistanceM: door.distanceM,
      movedM,
    }),
  });
}

export interface TutorialTapeRow {
  readonly stepId: WalkingTutorialStepId | null;
  readonly event: WalkingTutorialEventKind | null;
  readonly status: string;
  readonly reason: string | null;
  readonly tick: number;
}

export interface TutorialRun {
  readonly tutorial: WalkingTutorial;
  readonly fixture: WalkingFixture;
  readonly tape: readonly TutorialTapeRow[];
  readonly selectedTaxiId: string;
}

interface ObservationRecord {
  readonly observation: WalkingTutorialObservation;
  readonly tick: number;
  readonly stepId: WalkingTutorialStepId | null;
}

function record(
  tape: ObservationRecord[],
  observation: WalkingTutorialObservation,
  tick: number,
  stepId: WalkingTutorialStepId | null,
): WalkingTutorialObservation {
  tape.push(Object.freeze({ observation, tick, stepId }));
  return observation;
}

const F = () => walkingFixture();

/** The full authored sequence: 068 selection, 192 motion, 195 entry, 007 pickup/dropoff, 196 exit. */
export function playTutorial(options: { readonly fixture?: WalkingFixture } = {}): TutorialRun {
  const fixture = options.fixture ?? F();
  const tutorial = createWalkingTutorial();
  const tape: ObservationRecord[] = [];
  tutorial.start({ tick: TUTORIAL_TICKS.start });
  record(
    tape,
    tutorial.observeSelection({
      tick: TUTORIAL_TICKS.selection,
      vehicleId: TUTORIAL_TAXI_ID,
      kind: 'TAXI',
    }),
    TUTORIAL_TICKS.selection,
    'SELECT_TAXI',
  );
  record(
    tape,
    tutorial.observeWalk(fixture.states[TUTORIAL_TICKS.baseline]!),
    TUTORIAL_TICKS.baseline,
    'WALK_TO_TAXI',
  );
  record(
    tape,
    tutorial.observeWalk(fixture.states[TUTORIAL_TICKS.motion]!),
    TUTORIAL_TICKS.motion,
    'WALK_TO_TAXI',
  );
  record(
    tape,
    tutorial.observeEntry(fixture.entryAt(TUTORIAL_TICKS.entry)),
    TUTORIAL_TICKS.entry,
    'ENTER_VEHICLE',
  );
  record(
    tape,
    tutorial.observeRide(fixture.pickupAt(TUTORIAL_TICKS.pickup)),
    TUTORIAL_TICKS.pickup,
    'BOARD_PASSENGER',
  );
  record(
    tape,
    tutorial.observeRide(fixture.dropoffAt(TUTORIAL_TICKS.dropoff)),
    TUTORIAL_TICKS.dropoff,
    'FINISH_RIDE',
  );
  record(
    tape,
    tutorial.observeExit(fixture.exitAt(TUTORIAL_TICKS.exit)),
    TUTORIAL_TICKS.exit,
    'EXIT_VEHICLE',
  );
  return Object.freeze({
    tutorial,
    fixture,
    tape: Object.freeze(
      tape.map((entry) =>
        Object.freeze({
          stepId: entry.stepId,
          event: entry.observation.event,
          status: entry.observation.status,
          reason: entry.observation.reason,
          tick: entry.tick,
        }),
      ),
    ),
    selectedTaxiId: TUTORIAL_TAXI_ID,
  });
}

/** Plays the correct events for every step before `stepIndex`. */
export function playUntil(stepIndex: number, fixture = F()): WalkingTutorial {
  const tutorial = createWalkingTutorial();
  tutorial.start({ tick: TUTORIAL_TICKS.start });
  if (stepIndex >= 1)
    tutorial.observeSelection({
      tick: TUTORIAL_TICKS.selection,
      vehicleId: TUTORIAL_TAXI_ID,
      kind: 'TAXI',
    });
  if (stepIndex >= 2) {
    tutorial.observeWalk(fixture.states[TUTORIAL_TICKS.baseline]!);
    tutorial.observeWalk(fixture.states[TUTORIAL_TICKS.motion]!);
  }
  if (stepIndex >= 3) tutorial.observeEntry(fixture.entryAt(TUTORIAL_TICKS.entry));
  if (stepIndex >= 4) tutorial.observeRide(fixture.pickupAt(TUTORIAL_TICKS.pickup));
  if (stepIndex >= 5) tutorial.observeRide(fixture.dropoffAt(TUTORIAL_TICKS.dropoff));
  return tutorial;
}

export function probeTickFor(stepIndex: number): number {
  const ticks = [
    TUTORIAL_TICKS.start,
    TUTORIAL_TICKS.selection,
    TUTORIAL_TICKS.baseline,
    TUTORIAL_TICKS.entry,
    TUTORIAL_TICKS.pickup,
    TUTORIAL_TICKS.dropoff,
  ];
  return (ticks[stepIndex] ?? TUTORIAL_TICKS.dropoff) + 1;
}

/** Every event kind except the one the step declares, as a real fact at the probe tick. */
export function wrongEvents(
  stepIndex: number,
  fixture: WalkingFixture,
): readonly Readonly<{
  kind: WalkingTutorialEventKind;
  feed: (tutorial: WalkingTutorial) => WalkingTutorialObservation;
}>[] {
  const tick = probeTickFor(stepIndex);
  const expected = walkingTutorialStepIds[stepIndex]!;
  const all: readonly WalkingTutorialEventKind[] = [
    'TAXI_SELECTION',
    'WALKER_MOTION',
    'VEHICLE_ENTRY',
    'RIDE_PICKUP',
    'RIDE_DROPOFF',
    'VEHICLE_EXIT',
  ];
  const byStep: Record<WalkingTutorialStepId, WalkingTutorialEventKind> = {
    SELECT_TAXI: 'TAXI_SELECTION',
    WALK_TO_TAXI: 'WALKER_MOTION',
    ENTER_VEHICLE: 'VEHICLE_ENTRY',
    BOARD_PASSENGER: 'RIDE_PICKUP',
    FINISH_RIDE: 'RIDE_DROPOFF',
    EXIT_VEHICLE: 'VEHICLE_EXIT',
  };
  return Object.freeze(
    all
      .filter((kind) => kind !== byStep[expected])
      .map((kind) =>
        Object.freeze({
          kind,
          feed: (tutorial: WalkingTutorial): WalkingTutorialObservation => {
            switch (kind) {
              case 'TAXI_SELECTION':
                return tutorial.observeSelection({
                  tick,
                  vehicleId: TUTORIAL_TAXI_ID,
                  kind: 'TAXI',
                });
              case 'WALKER_MOTION':
                return tutorial.observeWalk(fixture.states[tick]!);
              case 'VEHICLE_ENTRY':
                return tutorial.observeEntry(fixture.entryAt(tick));
              case 'RIDE_PICKUP':
                return tutorial.observeRide(fixture.pickupAt(tick, 'ride:199-probe'));
              case 'RIDE_DROPOFF':
                return tutorial.observeRide(fixture.dropoffAt(tick, 'ride:199-probe'));
              case 'VEHICLE_EXIT':
                return tutorial.observeExit(fixture.exitAt(tick));
            }
          },
        }),
      ),
  );
}

export function progressKey(tutorial: WalkingTutorial): string {
  const instance = tutorial.instance();
  if (instance === null) return 'none';
  return JSON.stringify({
    stepIndex: instance.stepIndex,
    steps: instance.steps.map((step) => ({
      stepId: step.stepId,
      state: step.state,
      satisfiedTick: step.satisfiedTick,
    })),
    taxiId: instance.taxiId,
    vehicleId: instance.vehicleId,
    rideId: instance.rideId,
    walkingTicks: instance.walkingTicks,
    walkingDistanceM: instance.walkingDistanceM,
  });
}

export function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function tutorialDigest(tutorial: WalkingTutorial): string {
  return sha256(JSON.stringify(tutorial.snapshot()));
}

export interface CompatibilitySnapshot {
  readonly challengeCatalog: Readonly<{
    templates: number;
    templateIds: readonly string[];
    json: string;
    digest: string;
  }>;
  readonly extendedCatalog: Readonly<{
    v1: number;
    extended: number;
    total: number;
    challengeIds: readonly string[];
    json: string;
    digest: string;
  }>;
  readonly daily: Readonly<{
    date: string;
    instances: number;
    instanceIds: readonly string[];
    json: string;
    digest: string;
  }>;
  readonly progress: Readonly<{
    missions: number;
    completed: number;
    available: number;
    completedIds: readonly string[];
    json: string;
    digest: string;
  }>;
  readonly unlocks: Readonly<{
    capabilities: number;
    capabilityIds: readonly string[];
    json: string;
    digest: string;
  }>;
  readonly access: Readonly<{
    vehicles: number;
    taxis: number;
    driveable: number;
    selectable: number;
    revoked: number;
    blockedTaxis: number;
    json: string;
    digest: string;
  }>;
  readonly playerProgress: Readonly<{ json: string; digest: string }>;
  readonly v1Mission: Readonly<{ missionId: string; state: string; json: string; digest: string }>;
  readonly digest: string;
}

/**
 * An independent read of the delivered fleet, mission, challenge and daily read models. It is
 * rebuilt from scratch on every call, so an equality between the three calls means the tutorial and
 * its abandonment really changed nothing.
 */
export function compatibilitySnapshot(): CompatibilitySnapshot {
  const catalog = createChallengeTemplateCatalog();
  const composed = createComposedChallengeCatalog();
  const daily = setForDay(TUTORIAL_DAILY_DATE);
  const tracker = createRewardsTracker();
  const ledger = createMissionRewardsLedger({ catalog: tracker.catalog() });
  const progress = ledger.progress();
  const unlocks = ledger.unlocks();
  const fleet = createFleetRegistry({
    schemaVersion: 1,
    units: 'SI',
    sessionId: 'session-199-fleet',
    worldEpoch: 1,
    scenarioId: 'scenario:199-fleet',
    seed: 199,
    namespace: 'fleet:199',
    taxiCount: DEFAULT_FLEET_COUNTS.taxis,
    civilianCount: DEFAULT_FLEET_COUNTS.civilians,
    profile: { profileId: 'city:common', versionId: 'profile-version:199' },
  });
  const access = missionVehicleAccess(unlocks, fleet.list());
  const player = createPlayerProgress({ playerId: 'player:199' });
  const completed = completeMission(
    createRewardsTracker(),
    TUTORIAL_V1_MISSION_ID,
    TUTORIAL_TICKS.v1Mission,
  );
  const checkpoint = player.checkpoint();
  const restored = parsePlayerProgress(JSON.parse(JSON.stringify(checkpoint)) as unknown);
  const playerProgressJson = JSON.stringify(restored.checkpoint());
  const parts = {
    challengeCatalog: Object.freeze({
      templates: catalog.templates.length,
      templateIds: Object.freeze(catalog.templates.map((template) => template.templateId)),
      json: JSON.stringify(catalog),
      digest: sha256(JSON.stringify(catalog)),
    }),
    extendedCatalog: Object.freeze({
      v1: composed.counts.v1,
      extended: composed.counts.extended,
      total: composed.counts.total,
      challengeIds: Object.freeze(
        composed.extended.challenges.map((challenge) => challenge.challengeId),
      ),
      json: JSON.stringify(composed),
      digest: sha256(JSON.stringify(composed)),
    }),
    daily: Object.freeze({
      date: TUTORIAL_DAILY_DATE,
      instances: daily.instances.length,
      instanceIds: Object.freeze(daily.instances.map((instance) => instance.instanceId)),
      json: JSON.stringify(daily),
      digest: sha256(JSON.stringify(daily)),
    }),
    progress: Object.freeze({
      missions: progress.missions.length,
      completed: progress.counts.completed,
      available: progress.counts.available,
      completedIds: Object.freeze([...progress.completedMissionIds]),
      json: JSON.stringify(progress),
      digest: sha256(JSON.stringify(progress)),
    }),
    unlocks: Object.freeze({
      capabilities: unlocks.counts.total,
      capabilityIds: Object.freeze(unlocks.capabilities.map((entry) => entry.capabilityId)),
      json: JSON.stringify(unlocks),
      digest: sha256(JSON.stringify(unlocks)),
    }),
    access: Object.freeze({
      vehicles: access.vehicles,
      taxis: access.taxis,
      driveable: access.vehiclesDriveable,
      selectable: access.taxisSelectable,
      revoked: access.revoked.length,
      blockedTaxis: access.blockedTaxis.length,
      json: JSON.stringify(access),
      digest: sha256(JSON.stringify(access)),
    }),
    playerProgress: Object.freeze({
      json: playerProgressJson,
      digest: sha256(playerProgressJson),
    }),
    v1Mission: Object.freeze({
      missionId: completed.missionId,
      state: completed.state,
      json: JSON.stringify(completed),
      digest: sha256(JSON.stringify(completed)),
    }),
  };
  const digest = sha256(
    JSON.stringify([
      parts.challengeCatalog.digest,
      parts.extendedCatalog.digest,
      parts.daily.digest,
      parts.progress.digest,
      parts.unlocks.digest,
      parts.access.digest,
      parts.playerProgress.digest,
      parts.v1Mission.digest,
    ]),
  );
  return Object.freeze({ ...parts, digest });
}

/** A real 211 calendar state, kept for the report's daily evidence. */
export function dailyCalendarEvidence(): Readonly<{ days: number; sets: number; digest: string }> {
  let state = createDailyCalendarState('player:199', 'Europe/Bucharest');
  state = advanceDailyCalendar({
    state,
    playerId: 'player:199',
    calendar: {
      timeZone: 'Europe/Bucharest',
      observedAtMs: Date.UTC(2026, 10, 15, 10, 0, 0),
      utcOffsetSeconds: 7_200,
      dayLengthSeconds: 86_400,
    },
    capabilities: dailyCapabilities({
      learningKeys: ['speed_delta_urban'],
      zones: ['zone:center'],
      vehicleClasses: ['sedan'],
      controlModes: ['AUTO', 'MANUAL', 'LEARNING'],
      campaignCompleted: [],
      unlocks: [],
    }),
    generatedAtMs: Date.UTC(2026, 10, 15, 10, 0, 0),
  }).state;
  const json = JSON.stringify(state);
  return Object.freeze({
    days: state.sets.length,
    sets: state.sets.length,
    digest: sha256(json),
  });
}

export const TUTORIAL_CATALOGS = Object.freeze({
  v1Templates: createChallengeTemplateCatalog().templates.length,
  extended: createComposedChallengeCatalog().counts.extended,
  campaignMissions: createCampaignMissionCatalog().missions.length,
});

export const TUTORIAL_WALKER_SPEED_MPS = WALKER_GAIT_SPEEDS_MPS.WALK;
export const TUTORIAL_ENTRY_MODE = VEHICLE_ENTRY_POLICY.entryMode;
export const TUTORIAL_EXIT_MODE = VEHICLE_EXIT_POLICY.releaseMode;
export const TUTORIAL_POLICY = WALKING_TUTORIAL_POLICY;
export const TUTORIAL_ID = WALKING_TUTORIAL_ID;
export const TUTORIAL_VERSION = WALKING_TUTORIAL_VERSION;

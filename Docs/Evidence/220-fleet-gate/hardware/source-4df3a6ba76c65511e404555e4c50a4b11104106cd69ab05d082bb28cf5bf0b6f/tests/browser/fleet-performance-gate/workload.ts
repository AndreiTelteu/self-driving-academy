/**
 * PBI 220 fleet gate workload.
 *
 * One physical world with the real V1 fleet composition: 057 population, 065 dispatch/demand,
 * 058 civil traffic decisions, 044 road context, 036 signals, 219 simulation scheduling,
 * 024 controller, 022/028 physics and collision publication, and the real 103/109/110/112
 * learning pipeline. Presentation is Babylon.js with a fixed preset; the camera never removes a
 * physical actor.
 *
 * The command policy is a declared fixture policy: it converts the real per-actor route progress and
 * the real 058 leader/queue interaction into throttle/brake/steering. It is not a claim that the
 * full 045/050/051/052 gameplay policies are measured here.
 */
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import '@babylonjs/core/Engines/Extensions/engine.query.js';
import '@babylonjs/core/Engines/AbstractEngine/abstractEngine.timeQuery.js';
import '@babylonjs/core/Engines/WebGPU/Extensions/engine.query.js';
import { EngineInstrumentation } from '@babylonjs/core/Instrumentation/engineInstrumentation.js';
import type { RenderingBackend } from '../../../src/rendering/babylon';
import { createRapierProbe } from '../../../src/vehicles/rapier';
import { createKeyboardFilter, createVehicleController } from '../../../src/vehicles';
import type {
  BodyIdentity,
  BodyState,
  VehicleCommandPacket,
  VehicleControlProjection,
} from '../../../src/vehicles';
import {
  createCollisionEventAdapter,
  createEventBus,
  createFixedTickLoop,
  createSimulationScheduler,
} from '../../../src/simulation';
import { createRoadContext } from '../../../src/autonomy';
import type { RoadContextFrame } from '../../../src/autonomy';
import { createCandidateProfileStore } from '../../../src/learning';
import { getParameterDefinition, parseDrivingProfile } from '../../../src/profiles';
import type { DrivingProfile } from '../../../src/profiles';
import { createDefaultSettings } from '../../../src/settings';
import { createFleetScenario } from '../../../src/fleet';
import type { FleetScenario } from '../../../src/fleet';
import { createProfileActivation, createProfileActivationSource } from '../../../src/fleet';
import { createCivilTraffic } from '../../../src/fleet';
import { createSignalController } from '../../../src/world';
import type { LaneGraph } from '../../../src/world';
import { VERTICAL_SLICE_ENGINE_VERSION } from '../../../src/app';
import { createProfilePipeline, PROFILE_PIPELINE_LIMITS } from '../../../src/app/profile-pipeline';
import type { ProfileLearningSegment, ProfilePipeline } from '../../../src/app/profile-pipeline';
import {
  VERTICAL_SLICE_PLAYER_ID,
  VERTICAL_SLICE_SESSION_ID,
  VERTICAL_SLICE_WORLD_EPOCH,
  verticalSliceBaseParameters,
  verticalSliceLearningSegment,
} from '../../../src/app/vertical-slice';
import { createLearningQueueHarness } from '../../harness/learning-queue-harness';
import { distribution } from '../../../src/telemetry';
import { syntheticRouteSearch } from '../../simulation/scheduling-reference';
import type { FleetWorkloadSpec } from './plan';
import { AUTHORITATIVE_CIVILIAN_MAXIMUM } from './plan';

export const FLEET_FIXTURE_VERSION = '220-fleet-physical-gate-v1';
const SEED = 220_001;
const LEARNING_INTERVAL_TICKS = 300;
const INPUT_INTERVAL_TICKS = 12;
const CUT_IN_INTERVAL_TICKS = 240;
const FIXTURE_NOW = '2026-10-22T00:00:00.000Z';

type StyleId = 'PRUDENT' | 'AGGRESSIVE';

interface ActorPlan {
  readonly id: string;
  readonly driverKind: 'TAXI' | 'CIVILIAN';
  readonly style: StyleId;
  readonly surplus: boolean;
  laneId: string;
  cursorM: number;
  cutIn: boolean;
}

interface StyleTarget {
  readonly cruiseMps: number;
  readonly minimumGapM: number;
  readonly headwayS: number;
}

function laneSample(
  graph: LaneGraph,
  laneId: string,
  longitudinalM: number,
): { x: number; y: number; z: number; headingRad: number; lengthM: number } | null {
  const path = graph.getDirectedPath(laneId);
  if (!path || path.points.length < 2) return null;
  let remaining = Math.min(Math.max(longitudinalM, 0), path.lengthM);
  for (let index = 0; index < path.points.length - 1; index++) {
    const from = path.points[index]!,
      to = path.points[index + 1]!;
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    if (length <= 0) continue;
    if (remaining <= length || index === path.points.length - 2) {
      const fraction = Math.min(1, Math.max(0, remaining / length));
      return {
        x: from.x + (to.x - from.x) * fraction,
        y: from.y + (to.y - from.y) * fraction,
        z: from.z + (to.z - from.z) * fraction,
        headingRad: Math.atan2(to.z - from.z, to.x - from.x),
        lengthM: path.lengthM,
      };
    }
    remaining -= length;
  }
  const last = path.points[path.points.length - 1]!;
  return { x: last.x, y: last.y, z: last.z, headingRad: 0, lengthM: path.lengthM };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

function styleProjection(store: ReturnType<typeof createCandidateProfileStore>, versionId: string) {
  const version = store.getVersion(versionId);
  if (version === null) throw new Error(`Missing base profile version ${versionId}`);
  const parameters: Record<string, number> = Object.create(null),
    unitsByParameter: Record<string, string> = Object.create(null),
    provenanceByParameter: Record<string, string> = Object.create(null),
    evidenceByParameter: Record<string, null> = Object.create(null);
  for (const key of Object.keys(version.parameters)) {
    parameters[key] = version.parameters[key]!;
    unitsByParameter[key] = getParameterDefinition(key).unit;
    provenanceByParameter[key] = 'BASE';
    evidenceByParameter[key] = null;
  }
  return parseDrivingProfile({
    schemaVersion: 1,
    units: 'SI',
    profileId: version.profileId,
    versionId: version.versionId,
    parentVersionId: version.parentVersionId,
    engineVersion: version.engineVersion,
    parameters,
    unitsByParameter,
    provenanceByParameter,
    evidenceByParameter,
    sourceSegmentIds: [...version.sourceSegmentIds],
    createdAt: version.createdAt,
    checksum: version.checksum,
  });
}

export interface FleetGateWorkload {
  readonly workload: string;
  readonly physicalVehicles: number;
  prepareObservation(observe: boolean): void;
  beginMeasurement(): void;
  diagnostics(): Readonly<Record<string, unknown>>;
  frame(
    nowMs: number,
    observe: boolean,
    tickSample: (cpuMs: number) => void,
    physicsSample: (rapierMs: number) => void,
  ): {
    readonly tick: number;
    readonly debtSeconds: number;
    readonly status: string;
    readonly simulatedSeconds: number;
    readonly activeRealSeconds: number;
    readonly overloads: number;
  };
  render(): void;
  samples(): {
    readonly inputMs: Float64Array;
    readonly learningMs: Float64Array;
    readonly phases: Readonly<Record<string, Float64Array>>;
  };
  counts(): Readonly<Record<string, unknown>>;
  dispose(): Readonly<Record<string, number | boolean>>;
}

export async function createFleetGateWorkload(
  backend: RenderingBackend,
  spec: FleetWorkloadSpec,
  epoch: number,
): Promise<FleetGateWorkload> {
  const world = await createRapierProbe();
  const context = {
    schemaVersion: 1,
    units: 'SI',
    sessionId: `220-${spec.id}`,
    worldEpoch: epoch,
  } as const;
  const scope = { sessionId: context.sessionId, worldEpoch: epoch };
  const authoritativeCivilians = Math.min(spec.civilians, AUTHORITATIVE_CIVILIAN_MAXIMUM);
  const scenario: FleetScenario = createFleetScenario({
    taxiCount: spec.taxis,
    civilianCount: Math.max(authoritativeCivilians, 20),
    seed: SEED,
    scenarioId: `gate220-${spec.id}`,
    sessionId: context.sessionId,
    worldEpoch: epoch,
  });

  /** The real 057 configuration owns the profile identity; the 109/110 chain must follow it. */
  const profileId = scenario.configuration.profile.profileId;
  const baseVersionId = 'city-style-base-220';
  const store = createCandidateProfileStore({
    engineVersion: VERTICAL_SLICE_ENGINE_VERSION,
    now: () => FIXTURE_NOW,
  });
  const base = store.createBase({
    profileId,
    versionId: baseVersionId,
    parameters: verticalSliceBaseParameters(),
    createdAt: FIXTURE_NOW,
  });
  if (base.status !== 'ACCEPTED') throw new Error('220 base style version rejected by 109');
  const activationSource = createProfileActivationSource({
    profileId,
    versionId: baseVersionId,
  });
  const clock = { value: 0 };
  const activation = createProfileActivation({
    registry: scenario.registry,
    source: activationSource,
    engineVersion: VERTICAL_SLICE_ENGINE_VERSION,
    clock: () => clock.value,
    now: () => FIXTURE_NOW,
  });
  const queueHarness = createLearningQueueHarness({
    engineVersion: VERTICAL_SLICE_ENGINE_VERSION,
  });
  const baseStyle = styleProjection(store, baseVersionId);
  const pipeline: ProfilePipeline = createProfilePipeline({
    engineVersion: VERTICAL_SLICE_ENGINE_VERSION,
    playerId: VERTICAL_SLICE_PLAYER_ID,
    profileId,
    learningEpoch: 1,
    sessionId: VERTICAL_SLICE_SESSION_ID,
    worldEpoch: VERTICAL_SLICE_WORLD_EPOCH,
    queue: queueHarness.queue,
    store,
    activation,
    tick: () => clock.value,
  });
  const traffic = createCivilTraffic({
    registry: scenario.registry,
    map: scenario.map,
    graph: scenario.graph,
    planner: scenario.planner,
    styleSource: { activeStyle: (): DrivingProfile => baseStyle },
    seed: SEED,
  });

  const bus = createEventBus(scope);
  const road = createRoadContext(scenario.map);
  const signals = createSignalController(scenario.map, { context, eventBus: bus });
  const collision = createCollisionEventAdapter({ context, physics: world, eventBus: bus });
  const controller = createVehicleController(context, world);

  const civilLanes = scenario.map.lanes
    .filter((lane) => lane.access.includes('CIVIL'))
    .map((lane) => lane.id)
    .sort();
  const actors: ActorPlan[] = [];
  const identities = new Map<string, BodyIdentity>();
  const states = new Map<string, BodyState>();
  const meshes: ReturnType<typeof MeshBuilder.CreateBox>[] = [];
  const offs: (() => void)[] = [];
  const pendingUrgent = new Set<string>();
  let decisions = 0;
  let controllers = 0;
  let physicsSteps = 0;
  let lastContextSourceTick = 0;
  let lastDecisionTick = 0;
  let contactsObserved = 0;
  let collisionEvents = 0;
  let dispatchSteps = 0;
  let dispatchAssignments = 0;
  let pendingRequests = 0;
  let learningSegments = 0;
  let learningActivations = 0;
  let learningFailures = 0;
  let pendingInputAt: number | null = null;

  const learningSamples = new Float64Array(4096);
  const inputSamplesBuffer = new Float64Array(4096);
  /** Per-tick cost breakdown; the authoritative tick total is still measured by one outer pair. */
  const phaseNames = ['decision', 'commands', 'physics', 'traffic', 'dispatch', 'context'] as const;
  const phaseSamples = Object.fromEntries(
    phaseNames.map((name) => [name, new Float64Array(60000)]),
  ) as Record<(typeof phaseNames)[number], Float64Array>;
  const phaseCounts = Object.fromEntries(phaseNames.map((name) => [name, 0])) as Record<
    (typeof phaseNames)[number],
    number
  >;
  const phaseAcc = Object.fromEntries(phaseNames.map((name) => [name, 0])) as Record<
    (typeof phaseNames)[number],
    number
  >;
  let inputSampleCount = 0;
  let learningSampleCount = 0;
  let learningInFlight = false;
  let pendingLearningClosedAt: number | null = null;
  let learningOrdinal = 0;

  let disposed = false;
  let observing = false;
  let sampleTick: (cpuMs: number) => void = () => undefined;
  let samplePhysicsStep: (rapierMs: number) => void = () => undefined;
  let packets: VehicleCommandPacket[] = [];
  let commands: VehicleControlProjection[] = [];
  let rapierMs = 0;
  let activeUrgent = new Set<string>();
  let scheduler: ReturnType<typeof createSimulationScheduler> | undefined;
  let gpuInstrumentation: EngineInstrumentation | undefined;
  let gpuSamples = new Float64Array(0);
  let gpuSampleCount = 0;
  let gpuCounterCount = 0;
  let gpuMeasuring = false;
  let discardFirstFreshGpu = true;
  let gpuStatus = 'disabled: observer-off';
  let observationPrepared = false;
  let loop: ReturnType<typeof createFixedTickLoop<{ tick: number }, { tick: number }>> | undefined;
  let keyboardBinding: { dispose(): void } | undefined;

  const styles: Readonly<Record<StyleId, StyleTarget>> = Object.freeze({
    PRUDENT: Object.freeze({
      cruiseMps: 7 + (baseStyle.parameters.speed_delta_urban ?? 0) * 0.5,
      minimumGapM: 4.5 + (baseStyle.parameters.following_min_gap ?? 0),
      headwayS: 1.1 + (baseStyle.parameters.following_time_headway ?? 0),
    }),
    AGGRESSIVE: Object.freeze({
      cruiseMps: 13 + (baseStyle.parameters.speed_delta_urban ?? 0) * 1.2,
      minimumGapM: 1.6,
      headwayS: Math.max(0.25, (baseStyle.parameters.following_time_headway ?? 1) * 0.35),
    }),
  });

  const primaryLane = (id: string, fallbackIndex: number): string => {
    const taxiLane = scenario.positions.laneFor(id);
    if (taxiLane) return taxiLane;
    return civilLanes[fallbackIndex % Math.max(civilLanes.length, 1)]!;
  };

  function planActor(
    id: string,
    driverKind: 'TAXI' | 'CIVILIAN',
    index: number,
    surplus: boolean,
  ): ActorPlan {
    return {
      id,
      driverKind,
      style: index % 3 === 1 ? 'AGGRESSIVE' : 'PRUDENT',
      surplus,
      laneId: primaryLane(id, index),
      cursorM: (index % 7) * 6,
      cutIn: false,
    };
  }

  const taxiIds = [...scenario.taxiIds];
  const civilianIds = [...scenario.civilianIds];
  const surplusCivilians =
    spec.civilians > authoritativeCivilians ? spec.civilians - authoritativeCivilians : 0;

  scenario.taxiIds.forEach((id, index) => actors.push(planActor(id, 'TAXI', index, false)));
  civilianIds.forEach((id, index) => {
    const plan = planActor(id, 'CIVILIAN', index + taxiIds.length, false);
    const cycle = civilLanes.length ? civilLanes : ['road'];
    plan.laneId = cycle[(index + taxiIds.length) % cycle.length]!;
    actors.push(plan);
  });
  const surplusIds: string[] = [];
  for (let index = 0; index < surplusCivilians; index++) {
    const id = `stress-civil-${String(index).padStart(3, '0')}`;
    surplusIds.push(id);
    const plan = planActor(id, 'CIVILIAN', index + taxiIds.length + civilianIds.length, true);
    const cycle = civilLanes.length ? civilLanes : ['road'];
    plan.laneId = cycle[(index * 3 + 1) % cycle.length]!;
    actors.push(plan);
  }

  const planById = new Map(actors.map((actor) => [actor.id, actor]));
  const expectedPhysical = spec.taxis + spec.civilians;

  const cleanup = () => {
    if (!disposed) {
      disposed = true;
      keyboardBinding?.dispose();
      keyboardBinding = undefined;
      if (gpuInstrumentation) {
        gpuInstrumentation.captureGPUFrameTime = false;
        gpuInstrumentation.dispose();
        gpuInstrumentation = undefined;
      }
      gpuSamples = new Float64Array(0);
      learningSamples.fill(0);
      loop?.dispose();
      scheduler?.dispose();
      controller.dispose();
      collision.dispose();
      signals.dispose();
      road.dispose();
      for (const off of offs) off();
      bus.dispose();
      for (const mesh of meshes) mesh.dispose();
      states.clear();
      pendingUrgent.clear();
      activeUrgent.clear();
      packets = [];
      commands = [];
      identities.clear();
      traffic.dispose();
      pipeline.dispose();
      queueHarness.dispose();
      activation.dispose();
      store.dispose();
      scenario.dispose();
      world.dispose();
    }
    const schedule = scheduler?.getStats();
    const incidents = collision.getStats();
    const bodyResources = world.bodyResources();
    const collisionResources = world.collisionResources();
    let nativeReadRejected = false;
    try {
      world.project(`taxi-0`);
    } catch (error) {
      nativeReadRejected = error instanceof Error && error.message === 'Physics world disposed';
    }
    return {
      worldDisposed:
        disposed &&
        collisionResources.disposed &&
        collisionResources.colliders === 0 &&
        bodyResources.entities === 0 &&
        nativeReadRejected,
      mappedVehicles: bodyResources.entities,
      subscriptions: bodyResources.subscriptions,
      ownedMeshes: meshes.filter((mesh) => !mesh.isDisposed()).length,
      schedulerJobs: schedule?.routeJobs ?? 0,
      schedulerCache: schedule?.routeCache ?? 0,
      schedulerIdentities: schedule?.identities ?? 0,
      schedulerUrgent: schedule?.urgent ?? 0,
      collisionPairs: incidents.trackedPairs ?? 0,
      pendingCollisionEvents: incidents.pending ?? 0,
      busSubscriptions: bus.getStats().listeners,
      gpuInstruments: gpuInstrumentation ? 1 : 0,
      actors: actors.length,
      learningQueued: queueHarness.starts.length,
    };
  };

  try {
    /* Population: real 057 taxi/civil ids plus declared stress-only surplus bodies. */
    actors.forEach((actor, index) => {
      const lane = laneSample(scenario.graph, actor.laneId, actor.cursorM);
      const position = lane
        ? { x: lane.x, y: 0.85, z: lane.z }
        : { x: (index % 10) * 2.4 - 12, y: 0.85, z: Math.floor(index / 10) * 6 };
      world.addClassCar(actor.id, position, index % 2 ? 'compact' : 'sedan');
      const identity = world.bodyIdentity(actor.id)!;
      identities.set(actor.id, identity);
      controller.register(identity);
      const mesh = MeshBuilder.CreateBox(
        actor.id,
        { width: 1.8, height: 0.7, depth: 4.1 },
        backend.scene,
      );
      meshes.push(mesh);
      mesh.rotationQuaternion = Quaternion.Identity();
      offs.push(
        world.subscribeBody(identity, (state) => {
          states.set(actor.id, state);
          const { positionM: p, rotationQuaternion: q } = state.transform;
          mesh.position.set(p.x, p.y, p.z);
          mesh.rotationQuaternion!.set(q.x, q.y, q.z, q.w);
        }),
      );
    });
    /* Declared queue/contact fixture: two barriers and a debris pile at the choke point. */
    world.addBox({ x: 0, y: 1, z: 44 }, { x: 22, y: 1, z: 0.6 });
    world.addBox({ x: -14, y: 1, z: 22 }, { x: 0.6, y: 1, z: 12 });
    for (let index = 0; index < 24; index++)
      world.addBox(
        { x: (index % 6) * 0.8 - 2.5, y: 0.4 + Math.floor(index / 6) * 0.65, z: 38 },
        { x: 0.35, y: 0.35, z: 0.35 },
      );
    meshes.push(MeshBuilder.CreateGround('ground', { width: 240, height: 240 }, backend.scene));

    offs.push(
      bus.subscribe((event) => {
        if (event.type === 'COLLISION') {
          collisionEvents++;
          for (const id of event.entityIds) if (states.has(id)) pendingUrgent.add(id);
        }
        if (event.type === 'SIGNAL_PHASE_CHANGED')
          for (const actor of actors) pendingUrgent.add(actor.id);
      }),
    );

    /* Real 025 keyboard path for the player taxi, used for input -> command latency. */
    const settings = createDefaultSettings('220-fleet-gate');
    const player = actors[0]!;
    const keyboard = createKeyboardFilter(context, player.id, settings.input.control);
    const surface = document.getElementById('gate-surface') ?? document.body;
    keyboardBinding = bindKeyboard(surface, settings.input.bindings, keyboard);

    const scheduledActors = actors
      .map((actor) => ({ id: actor.id, incarnation: identities.get(actor.id)!.generation }))
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

    function publishContext(tick: number) {
      const frame: RoadContextFrame = {
        ...scope,
        tick,
        vehicles: scheduledActors.map((actor) => {
          const state = states.get(actor.id)!;
          const q = state.transform.rotationQuaternion,
            velocity = state.velocityMps;
          const forwardX = 2 * (q.x * q.z + q.w * q.y),
            forwardZ = 1 - 2 * (q.x * q.x + q.y * q.y);
          const plan = planById.get(actor.id)!;
          return {
            ...actor,
            positionM: state.transform.positionM,
            headingRad: Math.atan2(forwardZ, forwardX),
            access: plan.driverKind === 'TAXI' ? ('TAXI' as const) : ('CIVIL' as const),
            speedMps: Math.hypot(velocity.x, velocity.z),
            radiusM: 1.2,
            route: null,
            distances: [],
          };
        }),
        obstacles: [],
        zones: [],
        signals: scenario.map.intersections.flatMap((intersection) =>
          intersection.movements
            .map((movement) => signals!.getMovementSignal(intersection.id, movement.id))
            .filter((signal) => signal !== null),
        ),
        completeness: { vehicles: true, obstacles: false, zones: false, signals: true },
      };
      road.updateFrame(frame);
    }

    /** 058 owns its civilian actors; only taxi/other external positions are supplied. */
    function externalVehicleObservations() {
      return actors
        .filter((actor) => planById.get(actor.id)!.driverKind === 'TAXI')
        .map((actor) => {
          const state = states.get(actor.id)!;
          const q = state.transform.rotationQuaternion;
          const forwardX = 2 * (q.x * q.z + q.w * q.y),
            forwardZ = 1 - 2 * (q.x * q.x + q.y * q.y);
          return {
            vehicleId: actor.id,
            driverKind: 'TAXI' as const,
            positionM: state.transform.positionM,
            headingRad: Math.atan2(forwardZ, forwardX),
            speedMps: Math.hypot(state.velocityMps.x, state.velocityMps.z),
            radiusM: 1.8,
          };
        });
    }

    world.publishBodies(0, false);
    signals.step(0);
    traffic.step({
      tick: 0,
      dtSeconds: 1 / 60,
      vehicles: externalVehicleObservations(),
    });
    publishContext(0);

    /** Per-lane ordering gives the fixture a real leader/queue gap without extra allocations. */
    const laneOrder = new Map<string, ActorPlan[]>();
    function refreshLaneOrder() {
      for (const list of laneOrder.values()) list.length = 0;
      for (const actor of actors) {
        let list = laneOrder.get(actor.laneId);
        if (!list) {
          list = [];
          laneOrder.set(actor.laneId, list);
        }
        list.push(actor);
      }
      for (const list of laneOrder.values())
        list.sort((left, right) => right.cursorM - left.cursorM);
    }

    function commandFor(actor: ActorPlan, tick: number, dtSeconds: number): VehicleCommandPacket {
      const state = states.get(actor.id)!;
      const speed = Math.hypot(state.velocityMps.x, state.velocityMps.z);
      actor.cursorM += speed * dtSeconds;
      let lane = laneSample(scenario.graph, actor.laneId, actor.cursorM);
      if (!lane || actor.cursorM >= lane.lengthM) {
        const successors = scenario.graph.getSuccessors(
          actor.laneId,
          actor.driverKind === 'TAXI' ? 'TAXI' : 'CIVIL',
        );
        actor.laneId = successors.length ? successors[0]!.id : actor.laneId;
        actor.cursorM = 0;
        lane = laneSample(scenario.graph, actor.laneId, 0);
      }
      const ahead = laneSample(scenario.graph, actor.laneId, actor.cursorM + 9);
      const target = ahead ?? lane;
      const style = styles[actor.style];
      let desired = style.cruiseMps;
      // Real 058 civil interaction: a blocked or leader-limited actor slows down.
      const snapshot = actor.surplus ? undefined : traffic.get(actor.id);
      if (snapshot) desired = Math.min(desired, 2);
      const order = laneOrder.get(actor.laneId) ?? [];
      const index = order.indexOf(actor);
      if (index > 0) {
        const leader = order[index - 1]!;
        const gap = leader.cursorM - actor.cursorM;
        const minimum = actor.cutIn ? 0.8 : style.minimumGapM + speed * style.headwayS * 0.1;
        if (gap < minimum) desired = Math.min(desired, Math.max(0, speed - 2.5));
      }
      const q = state.transform.rotationQuaternion;
      const forwardX = 2 * (q.x * q.z + q.w * q.y),
        forwardZ = 1 - 2 * (q.x * q.x + q.y * q.y);
      const heading = Math.atan2(forwardZ, forwardX);
      const wanted = target ? target.headingRad : heading;
      let error = wanted - heading;
      while (error > Math.PI) error -= 2 * Math.PI;
      while (error < -Math.PI) error += 2 * Math.PI;
      if (!actor.surplus && actor.id === player.id) {
        // The player taxi is driven by the real keyboard filter; see the controller port.
        const frame = keyboard.step({ tick, dtSeconds, speedMps: speed });
        return {
          identity: identities.get(actor.id)!,
          command: { ...frame.command, tick, source: 'PLAYER' as const },
        };
      }
      const aggressiveBoost = actor.cutIn ? 1.35 : 1;
      const throttle = clamp((desired * aggressiveBoost - speed) * 0.55, 0, 1);
      const brake =
        desired * aggressiveBoost < speed - 0.4 ? clamp((speed - desired) * 0.45, 0, 1) : 0;
      return {
        identity: identities.get(actor.id)!,
        command: {
          ...context,
          vehicleId: actor.id,
          tick,
          source: 'AUTONOMY' as const,
          throttle: Math.round(throttle * 1000) / 1000,
          brake: Math.round(brake * 1000) / 1000,
          steering: Math.round(clamp(error * 0.55, -1, 1) * 1000) / 1000,
          handbrake: false,
          turnSignal: 'OFF' as const,
        },
      };
    }

    function stepLearning(tick: number) {
      /* One 5 s-simulated cadence during steady state; the first segment also opens in preflight. */
      const due = tick === 6 || (tick >= 120 && tick % LEARNING_INTERVAL_TICKS === 0);
      if (!due || learningInFlight) return;
      learningInFlight = true;
      learningOrdinal++;
      const segment: ProfileLearningSegment = verticalSliceLearningSegment({
        scenario: learningOrdinal % 2 ? 'PRUDENT' : 'RECKLESS',
        segmentId: `gate220:${spec.id}:segment:${learningOrdinal}`,
        order: learningOrdinal,
        interventionId: `gate220:${spec.id}:intervention:${learningOrdinal}`,
        reason: `gate 220 ${spec.id} segment ${learningOrdinal}`,
      });
      const closedAt = performance.now();
      learningSegments++;
      queueHarness.plan(segment.segmentId, 'result');
      void pipeline
        .onSegmentClosed(segment)
        .then((result) => {
          if (disposed) return;
          if (result.status === 'COMPOSED' || result.status === 'RECOMPOSED') {
            /* The 110 command activates on the next common tick; measured end to end. */
            if (pendingLearningClosedAt === null) pendingLearningClosedAt = closedAt;
          } else if (result.status !== 'NO_CHANGE' && result.status !== 'DEDUPLICATED') {
            learningFailures++;
          }
        })
        .catch(() => {
          if (!disposed) learningFailures++;
        })
        .finally(() => {
          learningInFlight = false;
        });
    }

    function applyLearningActivation() {
      if (pendingLearningClosedAt === null) return;
      const step = pipeline.advance();
      if (step?.status !== 'APPLIED') return;
      learningActivations++;
      if (learningSampleCount < learningSamples.length)
        learningSamples[learningSampleCount++] = performance.now() - pendingLearningClosedAt;
      pendingLearningClosedAt = null;
    }

    const ports = {
      beforeStep: ({ tick }: { tick: number }) => collision.beforePhysicsStep(tick).ready,
      input(tick: number) {
        if (!Number.isSafeInteger(tick) || tick < 1)
          throw new Error('Input requires an addressed physical tick');
        packets = [];
        for (const actor of actors)
          if (activeUrgent.has(actor.id))
            road.invalidate(actor.id, identities.get(actor.id)!.generation);
        if (activeUrgent.size)
          return {
            ...scope,
            actors: scheduledActors.filter((actor) => activeUrgent.has(actor.id)),
          };
        return undefined;
      },
      decision(actor: (typeof scheduledActors)[number], tick: number) {
        const phaseStart = observing ? performance.now() : 0;
        const result = road.getContext(actor.id, { force: activeUrgent.has(actor.id) });
        if (!result || result.tick >= tick)
          throw new Error('Context must retain latest committed source tick');
        lastContextSourceTick = result.tick;
        lastDecisionTick = tick;
        decisions++;
        syntheticRouteSearch(scenario.graph, 'west-in', 'west-out');
        if (observing) phaseAcc.decision += performance.now() - phaseStart;
      },
      controller(actor: (typeof scheduledActors)[number], tick: number) {
        const phaseStart = observing ? performance.now() : 0;
        const plan = planById.get(actor.id)!;
        packets.push(commandFor(plan, tick, 1 / 60));
        if (observing) phaseAcc.commands += performance.now() - phaseStart;
      },
      physics(tick: number, dtSeconds: number) {
        if (packets.length !== actors.length)
          throw new Error('Missing scheduled physical controller participation');
        const authorityChanges =
          tick % 600 === 1
            ? [
                {
                  identity: identities.get(playersId())!,
                  mode:
                    Math.floor((tick - 1) / 600) % 2 ? ('LEARNING' as const) : ('MANUAL' as const),
                },
              ]
            : [];
        const physicsStart = observing ? performance.now() : 0;
        const result = controller.step({ tick, dtSeconds }, packets, authorityChanges, observing);
        if (observing) phaseAcc.physics += performance.now() - physicsStart;
        if (result.controls.length !== actors.length || result.ignoredCommands.length)
          throw new Error('Actual024 command participation differs');
        commands = result.controls as VehicleControlProjection[];
        controllers += result.controls.length;
        physicsSteps++;
        rapierMs = result.physics.stepMs;
        if (observing) samplePhysicsStep(rapierMs);
        if (pendingInputAt !== null) {
          const playerControl = commands.find((control) => control.identity.entityId === player.id);
          if (playerControl) {
            if (inputSampleCount < inputSamplesBuffer.length)
              inputSamplesBuffer[inputSampleCount] = performance.now() - pendingInputAt;
            inputSampleCount++;
            pendingInputAt = null;
          }
        }
        const capture = collision.captureAfterPhysicsStep(tick);
        if (capture.publication.pending || capture.publication.listenerFailures)
          throw new Error('Incomplete authoritative collision delivery');
        contactsObserved = Math.max(contactsObserved, world.contacts());
        world.publishBodies(tick, observing);
        signals.step(tick);
        const trafficStart = observing ? performance.now() : 0;
        traffic.step({
          tick,
          dtSeconds,
          vehicles: externalVehicleObservations(),
        });
        if (observing) phaseAcc.traffic += performance.now() - trafficStart;
        clock.value = tick;
        const contextStart = observing ? performance.now() : 0;
        publishContext(tick);
        if (observing) phaseAcc.context += performance.now() - contextStart;
        // Real 059/060 fleet queue work at 10 Hz.
        if (tick % 6 === 0) {
          const dispatchStart = observing ? performance.now() : 0;
          scenario.demand.advance(tick);
          for (const active of scenario.dispatcher.assignments())
            if (tick - active.tick >= 90)
              scenario.dispatcher.release(active.taxiId, 'COMPLETED', tick);
          const dispatch = scenario.dispatcher.step({ tick, maxAssignments: 4 });
          dispatchSteps++;
          dispatchAssignments += dispatch.assigned.length;
          pendingRequests = scenario.demand.pending().length;
          if (observing) phaseAcc.dispatch += performance.now() - dispatchStart;
        }
        stepLearning(tick);
        applyLearningActivation();
      },
    };

    scheduler = createSimulationScheduler({ ...scope, ports });
    scheduler.setActors(scheduledActors, scope);

    loop = createFixedTickLoop({
      captureSnapshot: () => ({ tick: physicsSteps }),
      interpolate: (_, current) => current,
      step(time) {
        const started = observing ? performance.now() : 0;
        activeUrgent = new Set(pendingUrgent);
        pendingUrgent.clear();
        if (time.tick % INPUT_INTERVAL_TICKS === 1) {
          dispatchInput(settings.input.bindings.throttle);
        }
        if (time.tick % CUT_IN_INTERVAL_TICKS === 120) {
          const aggressive = actors.filter((actor) => actor.style === 'AGGRESSIVE');
          const chosen = aggressive[(time.tick / CUT_IN_INTERVAL_TICKS) % aggressive.length];
          if (chosen) chosen.cutIn = true;
        }
        if (time.tick % CUT_IN_INTERVAL_TICKS === 130) {
          for (const actor of actors) actor.cutIn = false;
        }
        if (time.tick % 20 === 0) refreshLaneOrder();
        scheduler!.step({ ...scope, ...time });
        if (observing) {
          sampleTick(performance.now() - started);
          for (const name of phaseNames) {
            if (phaseCounts[name] < phaseSamples[name].length)
              phaseSamples[name][phaseCounts[name]] = phaseAcc[name];
            phaseCounts[name]++;
            phaseAcc[name] = 0;
          }
        }
        return undefined;
      },
    });

    function playersId(): string {
      return actors[0]!.id;
    }

    function dispatchInput(code: string | undefined) {
      if (!code || disposed) return;
      pendingInputAt = performance.now();
      const down = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
      const up = new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true });
      document.dispatchEvent(down);
      window.setTimeout(() => {
        if (!disposed) document.dispatchEvent(up);
      }, 24);
    }

    return {
      workload: spec.id,
      physicalVehicles: actors.length,
      prepareObservation(observe) {
        if (observationPrepared) throw new Error('Observation mode already prepared');
        observationPrepared = true;
        if (!observe) return;
        if (!backend.scene.getEngine().getCaps().timerQuery) {
          gpuStatus = 'unavailable: timer query unsupported';
          return;
        }
        gpuSamples = new Float64Array(60000);
        gpuInstrumentation = new EngineInstrumentation(backend.scene.getEngine());
        gpuInstrumentation.captureGPUFrameTime = true;
        gpuCounterCount = gpuInstrumentation.gpuFrameTimeCounter.count;
        gpuStatus = 'supported: awaiting fresh asynchronous measured result';
      },
      beginMeasurement() {
        gpuMeasuring = true;
        discardFirstFreshGpu = true;
        if (gpuInstrumentation) gpuCounterCount = gpuInstrumentation.gpuFrameTimeCounter.count;
      },
      diagnostics: () => ({
        gpuTimer: {
          status: gpuStatus,
          samples: gpuSampleCount ? distribution(gpuSamples, gpuSampleCount) : null,
          association:
            'Asynchronous fresh Babylon timer results, not associated with the current CPU frame',
        },
        ownedDiagnosticBytes:
          gpuSamples.byteLength + learningSamples.byteLength + inputSamplesBuffer.byteLength,
        learningQueueBlocks: queueHarness.starts.length,
        learningQueueControls: queueHarness.controls.length,
        pipelineStats: pipeline.stats(),
        schedule: scheduler?.getStats() ?? null,
        dispatcher: scenario.dispatcher.stats(),
        demand: scenario.demand.stats(),
        traffic: traffic.getStats(),
        road: road.getStats(),
        engine:
          (backend.scene.getEngine() as unknown as { getInfo?: () => unknown }).getInfo?.() ?? null,
      }),
      frame(nowMs, observe, tickSample, physicsSample) {
        observing = observe;
        sampleTick = tickSample;
        samplePhysicsStep = physicsSample;
        const { state } = loop!.frame(nowMs);
        return {
          tick: state.tick,
          debtSeconds: state.debtSeconds,
          status: state.status,
          simulatedSeconds: state.simulatedSeconds,
          activeRealSeconds: state.activeRealSeconds,
          overloads: state.overloadCount,
        };
      },
      render() {
        backend.render();
        if (!gpuInstrumentation) return;
        const counter = gpuInstrumentation.gpuFrameTimeCounter;
        if (counter.count <= gpuCounterCount) return;
        gpuCounterCount = counter.count;
        if (!gpuMeasuring) return;
        if (discardFirstFreshGpu) {
          discardFirstFreshGpu = false;
          return;
        }
        const gpuMs = counter.current / 1_000_000;
        if (gpuSampleCount >= gpuSamples.length || !Number.isFinite(gpuMs) || gpuMs < 0)
          throw new Error('GPU diagnostic sample admission');
        gpuSamples[gpuSampleCount++] = gpuMs;
        gpuStatus = 'available: asynchronous fresh timer in milliseconds';
      },
      samples: () => ({
        inputMs: inputSamplesBuffer.slice(0, inputSampleCount),
        learningMs: learningSamples.slice(0, learningSampleCount),
        phases: Object.fromEntries(
          phaseNames.map((name) => [`${name}Ms`, phaseSamples[name].slice(0, phaseCounts[name])]),
        ) as Readonly<Record<string, Float64Array>>,
      }),
      counts: () => ({
        vehicles: disposed ? 0 : world.counts().vehicles,
        expectedVehicles: expectedPhysical,
        bodies: disposed ? 0 : world.counts().bodies,
        colliders: disposed ? 0 : world.counts().colliders,
        decisions,
        controllers,
        physicsSteps,
        lastContextSourceTick,
        lastDecisionTick,
        contacts: contactsObserved,
        collisionEvents,
        dispatchSteps,
        dispatchAssignments,
        pendingRequests,
        learningSegments,
        learningActivations,
        learningFailures,
        surrogateCivilians: surplusCivilians,
        surplusActors: surplusIds.length,
        actors: actorPlanCounts(),
      }),
      dispose: cleanup,
    };
  } catch (error) {
    cleanup();
    throw error;
  }

  function actorPlanCounts() {
    return {
      aggressive: actors.filter((actor) => actor.style === 'AGGRESSIVE').length,
      prudent: actors.filter((actor) => actor.style === 'PRUDENT').length,
    };
  }
}

function bindKeyboard(
  surface: HTMLElement,
  bindings: ReturnType<typeof createDefaultSettings>['input']['bindings'],
  filter: ReturnType<typeof createKeyboardFilter>,
) {
  const documentRef = surface.ownerDocument;
  const codes = new Map<string, string>();
  for (const [action, code] of Object.entries(bindings)) codes.set(code, action);
  const down = (event: Event) => {
    const code = (event as KeyboardEvent).code;
    const action = codes.get(code);
    if (!action) return;
    if ((event as KeyboardEvent).repeat) return;
    filter.setAction(action as never, true);
  };
  const up = (event: Event) => {
    const action = codes.get((event as KeyboardEvent).code);
    if (action) filter.setAction(action as never, false);
  };
  documentRef.addEventListener('keydown', down);
  documentRef.addEventListener('keyup', up);
  return {
    dispose() {
      documentRef.removeEventListener('keydown', down);
      documentRef.removeEventListener('keyup', up);
    },
  };
}

export const FLEET_FIXTURE_LIMITS = Object.freeze({
  learningIntervalTicks: LEARNING_INTERVAL_TICKS,
  inputIntervalTicks: INPUT_INTERVAL_TICKS,
  cutInIntervalTicks: CUT_IN_INTERVAL_TICKS,
  pipelineHistory: PROFILE_PIPELINE_LIMITS.history,
  fixtureNow: FIXTURE_NOW,
  seed: SEED,
});

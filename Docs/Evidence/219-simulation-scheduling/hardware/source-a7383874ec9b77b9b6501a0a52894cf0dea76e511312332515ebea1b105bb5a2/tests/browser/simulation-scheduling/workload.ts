// Light preparation. Execute only after024 publication and an exclusive coordinator grant.
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import '@babylonjs/core/Engines/Extensions/engine.query';
import '@babylonjs/core/Engines/AbstractEngine/abstractEngine.timeQuery';
import '@babylonjs/core/Engines/WebGPU/Extensions/engine.query';
import { EngineInstrumentation } from '@babylonjs/core/Instrumentation/engineInstrumentation';
import type { RenderingBackend } from '../../../src/rendering/babylon';
import { createRapierProbe } from '../../../src/vehicles/rapier';
import { createVehicleController } from '../../../src/vehicles';
import type { BodyIdentity, BodyState, VehicleCommandPacket } from '../../../src/vehicles';
import {
  createCollisionEventAdapter,
  createEventBus,
  createFixedTickLoop,
  createSimulationScheduler,
} from '../../../src/simulation';
import { createRoadContext } from '../../../src/autonomy';
import type { RoadContextFrame } from '../../../src/autonomy';
import { createSignalController } from '../../../src/world';
import { distribution } from '../../../src/telemetry';
import { roadContextFixture } from '../../autonomy/road-context-reference';
import { syntheticRouteSearch, unscheduledStep } from '../../simulation/scheduling-reference';
import type {
  SchedulingArm,
  SchedulingHardwareWorkload,
  SchedulingSemanticCheckpoint,
} from './protocol';

const hashNumber = (hash: number, number: number) =>
  Math.imul(hash ^ (Math.round(number * 1e6) | 0), 16777619) >>> 0;
const hashText = (hash: number, text: string) => {
  for (let index = 0; index < text.length; index++)
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619) >>> 0;
  return hash;
};
const digest = (hash: number) => hash.toString(16).padStart(8, '0');

/** Same actual70mixed-class native contact fixture and fixed commands in both scheduling arms. */
export async function createPhysicalSchedulingWorkload(
  backend: RenderingBackend,
  arm: SchedulingArm,
  epoch: number,
): Promise<SchedulingHardwareWorkload> {
  const world = await createRapierProbe();
  const context = {
    schemaVersion: 1,
    units: 'SI',
    sessionId: '219-physical70',
    worldEpoch: epoch,
  } as const;
  const scope = { sessionId: context.sessionId, worldEpoch: epoch };
  let bus: ReturnType<typeof createEventBus> | undefined;
  let roadFixture: ReturnType<typeof roadContextFixture>;
  let road: ReturnType<typeof createRoadContext> | undefined;
  let signals: ReturnType<typeof createSignalController> | undefined;
  let collision: ReturnType<typeof createCollisionEventAdapter> | undefined;
  let controller: ReturnType<typeof createVehicleController> | undefined;
  const identities: BodyIdentity[] = [];
  const states = new Map<string, BodyState>();
  const offs: (() => void)[] = [];
  const meshes: ReturnType<typeof MeshBuilder.CreateBox>[] = [];
  const checkpoints: SchedulingSemanticCheckpoint[] = [];
  const pendingUrgent = new Set<string>();
  let decisions = 0,
    controllers = 0,
    physicsSteps = 0,
    lastContextSourceTick = 0,
    lastDecisionTick = 0;
  let commandsHash = 2166136261,
    eventsHash = 2166136261;
  let disposed = false,
    observing = false,
    sampleTick: (cpuMs: number) => void = () => undefined;
  let packets: VehicleCommandPacket[] = [],
    activeUrgent = new Set<string>();
  let scheduler: ReturnType<typeof createSimulationScheduler> | undefined;
  let gpuInstrumentation: EngineInstrumentation | undefined;
  let gpuSamples = new Float64Array(0),
    gpuSampleCount = 0,
    gpuCounterCount = 0;
  let gpuMeasuring = false,
    discardFirstFreshGpu = true,
    observationPrepared = false;
  let gpuStatus = 'disabled: observer-off';
  let loop: ReturnType<typeof createFixedTickLoop<{ tick: number }, { tick: number }>> | undefined;
  const cleanup = () => {
    if (!disposed) {
      disposed = true;
      if (gpuInstrumentation) {
        gpuInstrumentation.captureGPUFrameTime = false;
        gpuInstrumentation.dispose();
        gpuInstrumentation = undefined;
      }
      gpuSamples = new Float64Array(0);
      loop?.dispose();
      scheduler?.dispose();
      controller?.dispose();
      collision?.dispose();
      signals?.dispose();
      road?.dispose();
      for (const off of offs) off();
      bus?.dispose();
      for (const mesh of meshes) mesh.dispose();
      states.clear();
      pendingUrgent.clear();
      activeUrgent.clear();
      packets = [];
      identities.length = 0;
      world.dispose();
    }
    const schedule = scheduler?.getStats(),
      incidents = collision?.getStats();
    return {
      worldDisposed: disposed && world.counts().bodies === 0,
      mappedVehicles: world.bodyResources().entities,
      subscriptions: world.bodyResources().subscriptions,
      ownedMeshes: meshes.filter((mesh) => !mesh.isDisposed()).length,
      schedulerJobs: schedule?.routeJobs ?? 0,
      schedulerCache: schedule?.routeCache ?? 0,
      schedulerIdentities: schedule?.identities ?? 0,
      schedulerUrgent: schedule?.urgent ?? 0,
      collisionPairs: incidents?.trackedPairs ?? 0,
      pendingCollisionEvents: incidents?.pending ?? 0,
      busSubscriptions: bus?.getStats().listeners ?? 0,
      gpuInstruments: gpuInstrumentation ? 1 : 0,
    };
  };
  try {
    bus = createEventBus(scope);
    roadFixture = roadContextFixture(false);
    road = createRoadContext(roadFixture.map, { priorityPolicy: roadFixture.policy });
    signals = createSignalController(roadFixture.map, { context, eventBus: bus });
    collision = createCollisionEventAdapter({ context, physics: world, eventBus: bus });
    controller = createVehicleController(context, world);
    for (let index = 0; index < 70; index++) {
      const id = `car-${index}`;
      world.addClassCar(
        id,
        { x: (index % 10) * 2.2 - 10, y: 0.8, z: Math.floor(index / 10) * 4.15 },
        index % 2 ? 'compact' : 'sedan',
      );
      const identity = world.bodyIdentity(id)!;
      identities.push(identity);
      controller.register(identity);
      const mesh = MeshBuilder.CreateBox(id, { width: 1.7, height: 0.6, depth: 4 }, backend.scene);
      meshes.push(mesh);
      mesh.rotationQuaternion = Quaternion.Identity();
      offs.push(
        world.subscribeBody(identity, (state) => {
          states.set(id, state);
          const { positionM: p, rotationQuaternion: q } = state.transform;
          mesh.position.set(p.x, p.y, p.z);
          mesh.rotationQuaternion!.set(q.x, q.y, q.z, q.w);
        }),
      );
    }
    world.addBox({ x: 0, y: 1, z: 32 }, { x: 20, y: 1, z: 0.5 });
    world.addBox({ x: -12, y: 1, z: 16 }, { x: 0.5, y: 1, z: 20 });
    world.addBox({ x: 12, y: 1, z: 16 }, { x: 0.5, y: 1, z: 20 });
    for (let index = 0; index < 64; index++)
      world.addBox(
        { x: (index % 8) * 0.65 - 2.5, y: 0.35 + Math.floor(index / 8) * 0.62, z: 30 },
        { x: 0.3, y: 0.3, z: 0.3 },
        true,
      );
    meshes.push(MeshBuilder.CreateGround('ground', { width: 60, height: 60 }, backend.scene));
    offs.push(
      bus.subscribe((event) => {
        // Epoch/eventId are provenance, excluded from equivalent physical-event semantics.
        eventsHash = hashText(
          eventsHash,
          JSON.stringify({
            tick: event.tick,
            type: event.type,
            entityIds: event.entityIds,
            payload: event.payload,
          }),
        );
        if (event.type === 'SIGNAL_PHASE_CHANGED')
          for (const identity of identities) pendingUrgent.add(identity.entityId);
        if (event.type === 'COLLISION')
          for (const id of event.entityIds) if (states.has(id)) pendingUrgent.add(id);
      }),
    );
    const actors = identities
      .map((identity) => ({ id: identity.entityId, incarnation: identity.generation }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    function publishContext(tick: number) {
      const frame: RoadContextFrame = {
        ...scope,
        tick,
        vehicles: actors.map((actor) => {
          const state = states.get(actor.id)!;
          const q = state.transform.rotationQuaternion,
            velocity = state.velocityMps;
          const forwardX = 2 * (q.x * q.z + q.w * q.y),
            forwardZ = 1 - 2 * (q.x * q.x + q.y * q.y);
          return {
            ...actor,
            positionM: state.transform.positionM,
            headingRad: Math.atan2(forwardZ, forwardX),
            access: 'CIVIL',
            speedMps: Math.hypot(velocity.x, velocity.z),
            radiusM: 1.2,
            route: null,
            distances: [],
          };
        }),
        obstacles: [],
        zones: [],
        signals: roadFixture.map.intersections.flatMap((intersection) =>
          intersection.movements
            .map((movement) => signals!.getMovementSignal(intersection.id, movement.id))
            .filter((signal) => signal !== null),
        ),
        completeness: { vehicles: true, obstacles: false, zones: false, signals: true },
      };
      road!.updateFrame(frame);
    }
    world.publishBodies(0, false);
    signals.step(0);
    publishContext(0);
    const ports = {
      beforeStep: ({ tick }: { tick: number }) => collision!.beforePhysicsStep(tick).ready,
      input(tick: number) {
        if (!Number.isSafeInteger(tick) || tick < 1)
          throw new Error('Input requires an addressed physical tick');
        packets = [];
        for (const actor of actors)
          if (activeUrgent.has(actor.id)) road!.invalidate(actor.id, actor.incarnation);
        if (activeUrgent.size)
          return { ...scope, actors: actors.filter((actor) => activeUrgent.has(actor.id)) };
        return undefined;
      },
      decision(actor: (typeof actors)[number], tick: number, urgent: boolean) {
        const result = road!.getContext(actor.id, { force: urgent });
        if (!result || result.tick >= tick)
          throw new Error('Context must retain latest committed source tick');
        lastContextSourceTick = result.tick;
        lastDecisionTick = tick;
        decisions++;
        // Identical explicitly synthetic033 route work; no045 command policy or fake legal decision.
        syntheticRouteSearch(roadFixture.graph, 'west-in', 'west-out');
      },
      controller(actor: (typeof actors)[number], tick: number) {
        const index = Number(actor.id.slice(4)),
          identity = world.bodyIdentity(actor.id)!;
        packets.push({
          identity,
          command: {
            ...context,
            vehicleId: actor.id,
            tick,
            source: index === 0 ? 'PLAYER' : 'AUTONOMY',
            throttle: index % 2 ? 0.65 : 1,
            brake: 0,
            steering: index % 2 ? 0.03 : -0.03,
            handbrake: false,
            turnSignal: 'OFF',
          },
        });
      },
      physics(tick: number, dtSeconds: number) {
        if (packets.length !== 70)
          throw new Error('Missing scheduled physical controller participation');
        const authorityChanges =
          tick % 600 === 1
            ? [
                {
                  identity: identities[0],
                  mode:
                    Math.floor((tick - 1) / 600) % 2 ? ('LEARNING' as const) : ('MANUAL' as const),
                },
              ]
            : [];
        const result = controller!.step({ tick, dtSeconds }, packets, authorityChanges, observing);
        if (result.controls.length !== 70 || result.ignoredCommands.length)
          throw new Error('Actual024 command participation differs');
        controllers += result.controls.length;
        physicsSteps++;
        for (const control of result.controls) {
          commandsHash = hashNumber(commandsHash, control.tick);
          commandsHash = hashText(commandsHash, control.identity.entityId);
          commandsHash = hashNumber(commandsHash, control.command.throttle);
          commandsHash = hashNumber(commandsHash, control.command.brake);
          commandsHash = hashNumber(commandsHash, control.command.steering);
        }
        const capture = collision!.captureAfterPhysicsStep(tick);
        if (capture.publication.pending || capture.publication.listenerFailures)
          throw new Error('Incomplete authoritative collision delivery');
        world.publishBodies(tick, observing);
        signals!.step(tick);
        publishContext(tick);
        if (tick === 6 || (tick % 600 === 0 && tick <= 8400)) {
          let posesHash = 2166136261;
          for (const actor of actors) {
            const body = states.get(actor.id)!,
              p = body.transform.positionM,
              q = body.transform.rotationQuaternion,
              v = body.velocityMps;
            posesHash = hashText(posesHash, actor.id);
            for (const value of [p.x, p.y, p.z, q.x, q.y, q.z, q.w, v.x, v.y, v.z])
              posesHash = hashNumber(posesHash, value);
          }
          checkpoints.push({
            tick,
            commandsDigest: digest(commandsHash),
            posesDigest: digest(posesHash),
            authoritativeEventsDigest: digest(eventsHash),
          });
        }
      },
    };
    if (arm === 'ENTITY_PHASED') {
      scheduler = createSimulationScheduler({ ...scope, ports });
      scheduler.setActors(actors, scope);
    }
    loop = createFixedTickLoop({
      captureSnapshot: () => ({ tick: physicsSteps }),
      interpolate: (_, current) => current,
      step(time) {
        const start = observing ? performance.now() : 0;
        activeUrgent = new Set(pendingUrgent);
        pendingUrgent.clear();
        // Scripted input/selection at next addressed tick; does not change command policy/targets.
        if (time.tick % 600 === 1) activeUrgent.add('car-0');
        if (scheduler) scheduler.step({ ...scope, ...time });
        else {
          if (!ports.beforeStep(time))
            throw new Error('Pending collision publication blocks physical step');
          unscheduledStep(
            actors,
            time.tick,
            {
              ...ports,
              input: (tick) => {
                ports.input(tick);
              },
            },
            activeUrgent,
          );
        }
        if (observing) sampleTick(performance.now() - start);
        return undefined;
      },
    });
    return {
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
          pendingResults: null,
          pendingReason: 'Public Babylon instrumentation does not expose outstanding query count',
          association:
            'Asynchronous fresh counter results, not associated with the current CPU frame; first fresh boundary result discarded',
        },
        ownedDiagnosticBytes: gpuSamples.byteLength,
      }),
      frame(nowMs, observe, tickSample) {
        observing = observe;
        sampleTick = tickSample;
        const { state } = loop!.frame(nowMs);
        return {
          tick: state.tick,
          debtSeconds: state.debtSeconds,
          status: state.status,
          simulatedSeconds: state.simulatedSeconds,
          activeRealSeconds: state.activeRealSeconds,
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
      counts: () => ({
        vehicles: world.counts().vehicles,
        decisions,
        controllers,
        physicsSteps,
        lastContextSourceTick,
        lastDecisionTick,
      }),
      semanticCheckpoints: () => checkpoints,
      dispose: cleanup,
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}

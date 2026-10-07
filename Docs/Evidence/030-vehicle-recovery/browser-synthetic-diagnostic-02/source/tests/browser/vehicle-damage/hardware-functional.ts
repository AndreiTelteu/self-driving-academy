import type { FunctionalPhaseReadback } from './hardware-functional-phases';
import { createHarnessLifetime } from './hardware-lifetime';
import { createRenderingBackend } from '../../../src/rendering/babylon/backend';
import { createRapierProbe } from '../../../src/vehicles/rapier';
import { createVehicleController } from '../../../src/vehicles/controller';
import { createVehicleDamage } from '../../../src/vehicles/damage-state';
import { createCollisionEpisodes } from '../../../src/vehicles/collision-episodes';
import { VEHICLE_CLASSES } from '../../../src/vehicles/vehicle-classes';
import { createFixedTickLoop } from '../../../src/simulation/fixed-tick';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import type { VehicleCommand } from '../../../src/vehicles/contracts';
import type { VehicleActuationInput } from '../../../src/vehicles/controller-port';
const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
function check(condition: boolean, reason: string): asserts condition {
  if (!condition) throw new Error(reason);
}
async function post(path: string, value: unknown) {
  const body = JSON.stringify(value);
  check(new TextEncoder().encode(body).length <= 128 * 1024, 'Functional bounded payload');
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!response.ok)
    throw new Error(`Functional export:${response.status} ${await response.text()}`);
  return response.json();
}
/** Scripted native commands, explicitly not trusted-keyboard/economy/full-gameplay evidence. */
export async function runHardwareFunctional(
  preference: 'AUTO' | 'WEBGL2',
  progress: (text: string) => void,
) {
  const begin = await post('/functional-start', { preference });
  const captureId = begin.captureId as string;
  let ordinal = 0;
  const lifetime = createHarnessLifetime();
  try {
    for (const classId of ['sedan', 'compact'] as const)
      for (const source of ['PLAYER', 'AUTONOMY'] as const)
        for (const speed of [0, 3, 12]) {
          const owned = await createRenderingBackend(
            document.getElementById('canvas') as HTMLCanvasElement,
            preference,
          );
          const caseLifetime = createHarnessLifetime();
          caseLifetime.own('backend', () => owned.dispose());
          try {
            const engine = owned.scene.getEngine();
            engine.setHardwareScalingLevel(1);
            owned.resize();
            const world = await createRapierProbe();
            caseLifetime.own('world', () => world.dispose());
            const tuning = VEHICLE_CLASSES[classId];
            const context = Object.freeze({
              schemaVersion: 1 as const,
              units: 'SI' as const,
              sessionId: '029-current-functional',
              worldEpoch: ordinal,
            });
            const damage = createVehicleDamage(context, world);
            caseLifetime.own('damage', () => damage.dispose());
            const episodes = createCollisionEpisodes(context, world.collisionSource);
            caseLifetime.own('episodes', () => episodes.dispose());
            world.addClassCar('car', { x: 0, y: 0.8, z: 0 }, classId);
            const token = world.bodyIdentity('car')!;
            damage.register(token, tuning.massKg);
            if (speed) world.addNamedBox('wall', { x: 0, y: 1, z: 3 }, { x: 10, y: 1, z: 0.25 });
            let applied: ReadonlyMap<string, VehicleActuationInput> = new Map();
            const port = {
              bodyIdentity: (id: string) => world.bodyIdentity(id),
              readBody: (identity: typeof token) => world.readBody(identity),
              step(inputs: ReadonlyMap<string, VehicleActuationInput>, measure?: boolean) {
                applied = inputs;
                return world.step(inputs, measure);
              },
            };
            const controller = createVehicleController(context, port, 0, {
              drivetrainVersion: '027-braking-reverse-v1',
              availability: damage,
            });
            caseLifetime.own('controller', () => controller.dispose());
            controller.register(token);
            const mesh = MeshBuilder.CreateBox(
              'functional-car',
              { width: 1.8, height: 0.8, depth: 4 },
              owned.scene,
            );
            new HemisphericLight('functional-light', new Vector3(0, 1, 0), owned.scene);
            const camera = new FreeCamera(
              'functional-camera',
              new Vector3(15, 12, -16),
              owned.scene,
            );
            camera.setTarget(new Vector3(0, 0, 5));
            owned.scene.activeCamera = camera;
            MeshBuilder.CreateGround('functional-ground', { width: 60, height: 80 }, owned.scene);
            let tick = 0,
              command: Partial<VehicleCommand> = { throttle: 0 },
              direction: 'FORWARD' | 'REVERSE' = 'FORWARD',
              lost = false;
            engine.onContextLostObservable.add(() => {
              lost = true;
            });
            const result: Record<string, unknown> = {
              ordinal,
              classId,
              source,
              impactSpeedMps: speed,
              scriptedCommands: true,
              backend: owned.rendererKind,
              startedAt: new Date().toISOString(),
              setup:
                'Any pose/velocity reset or wall removal below is fixture setup outside damage.recover; recovery itself has no relocation authority',
            };
            const phaseReadbacks: FunctionalPhaseReadback[] = [];
            result.phaseReadbacks = phaseReadbacks;
            result.phaseCapacity = 64;
            let phase: FunctionalPhaseReadback['phase'] | null = null,
              phaseStart = 0,
              lastTransition = '';
            const startPhase = (name: FunctionalPhaseReadback['phase']) => {
              phase = name;
              phaseStart = tick;
              lastTransition = '';
            };
            const loop = createFixedTickLoop({
              captureSnapshot: () => ({ tick }),
              interpolate: (_previous, current) => current,
              step(time) {
                tick = time.tick;
                const packet: VehicleCommand = {
                  ...context,
                  vehicleId: 'car',
                  tick,
                  source,
                  throttle: 0,
                  brake: 0,
                  steering: 0,
                  handbrake: false,
                  turnSignal: 'OFF',
                  driveIntent: { version: '027-braking-reverse-v1', direction, shiftBrake: 0.7 },
                  ...command,
                };
                const bodyBefore = world.readBody(token);
                const control = controller.step(
                  time,
                  [{ identity: token, command: packet }],
                  tick === 1
                    ? [{ identity: token, mode: source === 'PLAYER' ? 'MANUAL' : 'AUTO' }]
                    : [],
                ).controls[0];
                check(
                  JSON.stringify(control.drivetrain?.physicalInput) ===
                    JSON.stringify(applied.get('car')),
                  'Published effective projection equals actual native input',
                );
                check(
                  control.raw?.source === source && control.raw?.throttle === packet.throttle,
                  'Raw authority/request truth',
                );
                const state = damage.readDamage(token);
                check(
                  Math.abs(applied.get('car')!.throttle) <= state.throttleMagnitudeLimit,
                  'Signed magnitude bounded',
                );
                if (state.availability === 'IMMOBILIZED')
                  check(
                    applied.get('car')!.throttle === 0 &&
                      applied.get('car')!.brake === 1 &&
                      control.drivetrain?.nearZeroTicks === 0,
                    'Immobilized brake/dwell truth',
                  );
                if (packet.brake > 0 || packet.handbrake)
                  check(applied.get('car')!.throttle === 0, 'Service/handbrake dominates');
                if (phase) {
                  const drivetrain = control.drivetrain!;
                  const transition = `${drivetrain.phase}:${drivetrain.engagedDirection}:${drivetrain.nearZeroTicks}`;
                  const phaseTick = tick - phaseStart;
                  if (phaseTick <= 6 || transition !== lastTransition) {
                    check(phaseReadbacks.length < 64, 'Functional phase capacity');
                    const compact = (value: VehicleCommand) => ({
                      source: value.source,
                      throttle: value.throttle,
                      brake: value.brake,
                      handbrake: value.handbrake,
                      steering: value.steering,
                      driveIntent: value.driveIntent!,
                    });
                    phaseReadbacks.push({
                      phase,
                      tick,
                      phaseTick,
                      source,
                      raw: compact(control.raw!),
                      effective: compact(control.command),
                      nativeInput: { ...applied.get('car')! },
                      drivetrain: { ...drivetrain, physicalInput: { ...drivetrain.physicalInput } },
                      velocityBefore: { ...bodyBefore.velocityMps },
                      velocityAfter: { ...world.readBody(token).velocityMps },
                      availability: state.availability,
                    });
                  }
                  lastTransition = transition;
                }
                episodes.update(tick, world.readCollisionContacts().contacts);
                check(
                  episodes.drain((incident) => {
                    damage.applyIncident(incident);
                  }).status === 'drained',
                  'Native incident admission',
                );
              },
            });
            caseLifetime.own('loop', () => loop.dispose());
            const until = async (target: number) => {
              while (tick < target) {
                const now = await frame();
                check(
                  document.visibilityState === 'visible' && document.hasFocus() && !lost,
                  'Functional foreground/context',
                );
                check(
                  owned.rendererKind === begin.backend &&
                    devicePixelRatio === 1 &&
                    owned.canvas.clientWidth === 1920 &&
                    owned.canvas.clientHeight === 1080 &&
                    engine.getRenderWidth() === 1920 &&
                    engine.getRenderHeight() === 1080,
                  'Actual backend/resolution',
                );
                const info = JSON.stringify(
                  'getInfo' in engine
                    ? (engine as unknown as { getInfo(): unknown }).getInfo()
                    : null,
                );
                check(
                  /AMD/i.test(info) && !/swiftshader|llvmpipe|software rasterizer/i.test(info),
                  'Actual AMD hardware',
                );
                const stepped = loop.frame(now);
                check(
                  stepped.state.status === 'running' && stepped.state.overloadCount === 0,
                  'Functional actual60Hz',
                );
                const state = world.project('car'),
                  q = state.rotation;
                mesh.position.set(state.position.x, state.position.y, state.position.z);
                mesh.rotationQuaternion = new Quaternion(q.x, q.y, q.z, q.w);
                owned.render();
              }
            };
            try {
              await owned.scene.whenReadyAsync();
              loop.frame(await frame());
              await until(180);
              if (speed) world.setVelocity('car', { x: 0, y: 0, z: speed });
              await until(tick + 180);
              const expected = speed === 0 ? 'AVAILABLE' : speed === 3 ? 'DAMAGED' : 'IMMOBILIZED';
              check(
                damage.readDamage(token).availability === expected,
                'Actual native onset threshold',
              );
              result.incidentHistory = damage.readHistory();
              result.actualAvailability = expected;
              result.afterImpact = world.project('car');
              if (speed) world.removeCollisionEntity(world.collisionIdentity('wall')!);
              world.setPose(token, {
                positionM: { x: 0, y: 0.8, z: 0 },
                rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
              });
              world.setBodyVelocity(token, { x: 0, y: 0, z: 0 });
              result.reverseSetupBody = world.readBody(token);
              result.mechanics = world.readVehicleMechanics('car');
              direction = 'REVERSE';
              command = { throttle: 1 };
              startPhase('REVERSE');
              const driveStart = tick;
              await until(driveStart + 300);
              result.reverseDrive = world.project('car');
              result.reverseControl = controller.readControl(token);
              result.reverseApplied = applied.get('car');
              if (expected === 'IMMOBILIZED')
                check(
                  Math.abs(world.project('car').position.z) < 0.25,
                  'Actual unable-to-move scenario',
                );
              else
                check(
                  world.project('car').position.z < -5,
                  'Actual native reverse motion under availability',
                );
              startPhase('SERVICE_BRAKE');
              command = { throttle: 1, brake: 1 };
              await until(tick + 60);
              startPhase('HANDBRAKE');
              command = { throttle: 1, handbrake: true };
              await until(tick + 60);
              if (expected !== 'AVAILABLE') {
                command = { throttle: 0 };
                world.setBodyVelocity(token, { x: 0, y: 0, z: 0 });
                const before = world.readBody(token),
                  history = damage.readHistory();
                damage.recover(token, { context, operationId: `recover-${ordinal}`, tick });
                result.recoveryBodyBefore = before;
                result.recoveryBodyAfter = world.readBody(token);
                check(
                  JSON.stringify(result.recoveryBodyAfter) === JSON.stringify(before),
                  'Recovery itself does not alter physical state',
                );
                check(
                  JSON.stringify(damage.readHistory().slice(0, history.length)) ===
                    JSON.stringify(history),
                  'Recovery preserves incident prefix',
                );
                result.recoveryHistory = damage.readHistory();
                startPhase('RECOVERY');
                command = { throttle: 1 };
                const startZ = world.project('car').position.z;
                await until(tick + 300);
                check(
                  world.project('car').position.z < startZ - 5 && world.project('car').speed > 2,
                  'Recovery actual reverse motion',
                );
                result.recovered = world.project('car');
              }
              //Explicit lateral-velocity setup proves the direction interlock reads total native motion.
              if (damage.readDamage(token).availability === 'AVAILABLE') {
                world.setBodyVelocity(token, { x: 2, y: 0, z: 0 });
                direction = 'FORWARD';
                command = { throttle: 1 };
                startPhase('LATERAL');
                await until(tick + 6);
                const lateral = controller.readControl(token)!;
                check(
                  lateral.drivetrain?.engagedDirection === 'REVERSE' &&
                    lateral.drivetrain.nearZeroTicks === 0 &&
                    applied.get('car')!.throttle === 0,
                  'Actual lateral motion blocks opposite gear',
                );
                result.lateralInterlock = lateral;
                controller.suspend();
                const suspensionBodyBefore = world.readBody(token);
                const beforeSuspend = JSON.stringify(suspensionBodyBefore);
                let suspendedRejected = false;
                try {
                  controller.step({ tick: tick + 1, dtSeconds: 1 / 60 });
                } catch {
                  suspendedRejected = true;
                }
                check(
                  suspendedRejected && JSON.stringify(world.readBody(token)) === beforeSuspend,
                  'Suspended actuation rejects without physical mutation',
                );
                result.suspension = {
                  bodyBefore: suspensionBodyBefore,
                  bodyAfter: world.readBody(token),
                  rejected: suspendedRejected,
                };
                controller.resume();
                command = { throttle: 0 };
                startPhase('RESUME_NEUTRAL');
                await until(tick + 6);
                check(
                  applied.get('car')!.throttle === 0,
                  'Resume has no retained propulsion target',
                );
                result.suspensionNativeInput = applied.get('car');
              }
              result.passed = true;
              result.simulation = loop.getState();
            } catch (error) {
              result.passed = false;
              result.error = String(error);
              caseLifetime.record('primary', error);
            } finally {
              caseLifetime.dispose();
              const cleanupErrors = caseLifetime
                .snapshot()
                .causes.filter((cause) => cause.category.startsWith('cleanup:'));
              if (cleanupErrors.length) {
                result.passed = false;
                result.cleanupErrors = cleanupErrors.map(String);
              }
              let disposedReadRejected = false;
              try {
                world.project('car');
              } catch {
                disposedReadRejected = true;
              }
              try {
                result.cleanup = {
                  bodies: world.bodyResources(),
                  collisions: world.collisionResources(),
                  controller: controller.getStats(),
                  damage: damage.getStats(),
                  sceneDisposed: owned.scene.isDisposed,
                  engineScenes: engine.scenes.length,
                  sceneMeshes: owned.scene.meshes.length,
                  sceneMaterials: owned.scene.materials.length,
                  sceneTextures: owned.scene.textures.length,
                  connectedCanvasCount: document.querySelectorAll('canvas').length,
                  disposedReadRejected,
                };
              } catch (error) {
                caseLifetime.record('cleanup:readback', error);
              }
              result.completedAt = new Date().toISOString();
              result.causes = caseLifetime.snapshot();
              if (caseLifetime.failed) result.passed = false;
              await caseLifetime.attempt('export:case', () =>
                post('/functional-case', { captureId, ordinal, result }),
              );
            }
            caseLifetime.throwIfFailed();
            progress(`${captureId}: native ${classId}/${source}/${speed}m/s saved ${++ordinal}/32`);
          } catch (error) {
            caseLifetime.record('primary', error);
          } finally {
            caseLifetime.dispose();
          }
          caseLifetime.throwIfFailed();
        }
    //20 real engine/scene/canvas/native owner creation/disposal cycles; scoped lifecycle, not224soak.
    for (let cycle = 0; cycle < 20; cycle++) {
      const owned = await createRenderingBackend(
        document.getElementById('canvas') as HTMLCanvasElement,
        preference,
      );
      const cycleLifetime = createHarnessLifetime();
      cycleLifetime.own('backend', () => owned.dispose());
      let world: Awaited<ReturnType<typeof createRapierProbe>> | undefined,
        damage: ReturnType<typeof createVehicleDamage> | undefined,
        controller: ReturnType<typeof createVehicleController> | undefined;
      const result: Record<string, unknown> = {
        ordinal,
        cycle,
        ownerCycle: true,
        backend: owned.rendererKind,
        startedAt: new Date().toISOString(),
        passed: false,
        actualNativeTicks: 0,
        scope:
          'Real owner/canvas/scene/native lifecycle; six commanded physics ticks, not wall-cadence/224soak evidence',
      };

      try {
        owned.scene.getEngine().setHardwareScalingLevel(1);
        owned.resize();
        world = await createRapierProbe();
        const acquiredWorld = world;
        cycleLifetime.own('world', () => acquiredWorld.dispose());
        world.addCar('cycle-car', { x: 0, y: 0.8, z: 0 });
        const context = {
          schemaVersion: 1 as const,
          units: 'SI' as const,
          sessionId: '029-owner-cycles',
          worldEpoch: cycle,
        };
        damage = createVehicleDamage(context, world);
        const acquiredDamage = damage;
        cycleLifetime.own('damage', () => acquiredDamage.dispose());
        const token = world.bodyIdentity('cycle-car')!;
        damage.register(token, 1400);
        controller = createVehicleController(context, world, 0, {
          drivetrainVersion: '027-braking-reverse-v1',
          availability: damage,
        });
        const acquiredController = controller;
        cycleLifetime.own('controller', () => acquiredController.dispose());
        controller.register(token);
        MeshBuilder.CreateBox('cycle-vehicle', { size: 1 }, owned.scene);
        const camera = new FreeCamera('cycle-camera', new Vector3(0, 5, -10), owned.scene);
        camera.setTarget(Vector3.Zero());
        owned.scene.activeCamera = camera;
        check(
          owned.rendererKind === begin.backend &&
            document.hasFocus() &&
            document.visibilityState === 'visible',
          'Cycle actual backend/foreground',
        );
        for (let tick = 1; tick <= 6; tick++) {
          await frame();
          check(document.hasFocus() && document.visibilityState === 'visible', 'Cycle foreground');
          controller.step({ tick, dtSeconds: 1 / 60 });
          owned.render();
          result.actualNativeTicks = tick;
        }
        result.passed = true;
      } catch (error) {
        cycleLifetime.record('primary', error);
        result.passed = false;
        result.error = String(error);
      } finally {
        cycleLifetime.dispose();
        if (cycleLifetime.failed) result.passed = false;
        let disposedReadRejected = false;
        if (world)
          try {
            world.project('cycle-car');
          } catch {
            disposedReadRejected = true;
          }
        try {
          const engine = owned.scene.getEngine();
          const cleanup = {
            bodies: world?.bodyResources(),
            collisions: world?.collisionResources(),
            controllerVehicles: controller?.getStats().vehicles,
            damageVehicles: damage?.getStats().vehicles,
            damageHistory: damage?.getStats().historyRecords,
            sceneDisposed: owned.scene.isDisposed,
            engineScenes: engine.scenes.length,
            sceneMeshes: owned.scene.meshes.length,
            sceneMaterials: owned.scene.materials.length,
            sceneTextures: owned.scene.textures.length,
            connectedCanvasCount: document.querySelectorAll('canvas').length,
            disposedReadRejected,
          };
          result.cleanup = cleanup;
        } catch (error) {
          cycleLifetime.record('cleanup:readback', error);
        }
        result.completedAt = new Date().toISOString();
        result.causes = cycleLifetime.snapshot();
        if (cycleLifetime.failed) result.passed = false;
        await cycleLifetime.attempt('export:case', () =>
          post('/functional-case', { captureId, ordinal, result }),
        );
      }
      cycleLifetime.throwIfFailed();
      ordinal++;
      progress(`${captureId}: owner cycle ${cycle + 1}/20 saved`);
    }
    progress(JSON.stringify(await post('/functional-finish', { captureId }), null, 2));
  } catch (error) {
    lifetime.record('primary', error);
    await lifetime.attempt('export:failure', () =>
      post('/functional-failure', {
        captureId,
        ordinal,
        error: String(error),
        errorChain: lifetime.snapshot(),
      }),
    );
    progress(JSON.stringify(lifetime.snapshot()));
    lifetime.throwIfFailed();
  }
}

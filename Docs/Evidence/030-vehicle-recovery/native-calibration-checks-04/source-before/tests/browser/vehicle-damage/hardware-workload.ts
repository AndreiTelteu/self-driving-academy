import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { createRapierProbe } from '../../../src/vehicles/rapier';
import { createVehicleController } from '../../../src/vehicles/controller';
import { createVehicleDamage } from '../../../src/vehicles/damage-state';
import { createPublished027Controller } from './hardware-reference';
import type { RenderingBackend } from '../../../src/rendering/babylon/backend';
import type {
  VehicleController,
  VehicleActuationInput,
} from '../../../src/vehicles/controller-port';
import type { VehicleCommand } from '../../../src/vehicles/contracts';
import type { HardwarePartIdentity } from './hardware-parts';
import type { BodyIdentity } from '../../../src/vehicles/body-port';

export const PHYSICAL_CHECKPOINT_PROTOCOL = Object.freeze({
  firstTick: 1920,
  strideTicks: 120,
  count: 58,
  finalTick: 8760,
  cars: 70,
  scalarsPerCar: 16,
  hashScratchBytes: 70 * 16 * 8,
  controlCodecMaximumBytes: 128 * 1024,
  pendingHashes: 64,
});
export async function sha256(bytes: Uint8Array<ArrayBuffer>) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}
export async function createHardwareWorkload(
  owned: RenderingBackend,
  identity: HardwarePartIdentity,
) {
  const firstWorldAt = new Date().toISOString();
  const world = await createRapierProbe();
  let abortController: VehicleController | undefined;
  let abortDamage: ReturnType<typeof createVehicleDamage> | undefined;
  let abortLight: HemisphericLight | undefined,
    abortCamera: FreeCamera | undefined,
    abortGround: ReturnType<typeof MeshBuilder.CreateGround> | undefined;
  const meshes: ReturnType<typeof MeshBuilder.CreateBox>[] = [];
  try {
    const context = Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: '029-matched-hardware',
      worldEpoch: 0,
    });
    const damage = identity.arm === 'CURRENT_029' ? createVehicleDamage(context, world) : null;
    abortDamage = damage ?? undefined;
    let applied: ReadonlyMap<string, VehicleActuationInput> = new Map();
    const port = {
      bodyIdentity: (id: string) => world.bodyIdentity(id),
      readBody: (token: Parameters<typeof world.readBody>[0]) => world.readBody(token),
      step(inputs: ReadonlyMap<string, VehicleActuationInput>, measure?: boolean) {
        applied = inputs;
        return world.step(inputs, measure);
      },
    };
    const options = {
      drivetrainVersion: '027-braking-reverse-v1' as const,
      ...(damage ? { availability: damage } : {}),
    };
    // The reference function is the real archived/published027 implementation, never current029 with a flag off.
    const controller: VehicleController =
      identity.arm === 'CURRENT_029'
        ? createVehicleController(context, port, 0, options)
        : createPublished027Controller(context, port, 0, options);
    abortController = controller;
    const tokens: BodyIdentity[] = [];
    const light = new HemisphericLight('hardware-sun', new Vector3(0, 1, 0), owned.scene);
    abortLight = light;
    const camera = new FreeCamera('hardware-camera', new Vector3(42, 34, -42), owned.scene);
    abortCamera = camera;
    camera.setTarget(new Vector3(0, 0, 16));
    owned.scene.activeCamera = camera;
    const ground = MeshBuilder.CreateGround(
      'hardware-ground',
      { width: 120, height: 120 },
      owned.scene,
    );
    abortGround = ground;
    for (let index = 0; index < 70; index++) {
      const id = `car-${index}`;
      world.addCar(id, { x: (index % 10) * 2.2 - 10, y: 0.8, z: Math.floor(index / 10) * 4.15 });
      const token = world.bodyIdentity(id)!;
      tokens.push(token);
      controller.register(token);
      damage?.register(token, 1400);
      meshes.push(MeshBuilder.CreateBox(id, { width: 1.8, height: 0.8, depth: 4 }, owned.scene));
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
    const measuredActorTicks = new Uint32Array(70);
    let totalTicks = 0,
      disposed = false;
    const checkpointHashes: Promise<{ tick: number; hash: string }>[] = [];
    const trace = new Float64Array(64 * 3 * 16);
    const scratch = new Float64Array(70 * 16);
    let traceRows = 0;
    const scalarState = (index: number) => {
      const state = world.project(`car-${index}`),
        input = applied.get(`car-${index}`)!;
      const values = [
        state.position.x,
        state.position.y,
        state.position.z,
        state.rotation.x,
        state.rotation.y,
        state.rotation.z,
        state.rotation.w,
        state.velocity.x,
        state.velocity.y,
        state.velocity.z,
        state.speed,
        input.throttle,
        input.brake,
        input.steering,
        input.handbrake ? 1 : 0,
        state.wheelContacts,
      ];
      if (!values.every(Number.isFinite)) throw new Error('Nonfinite physical state/input codec');
      return values;
    };
    return {
      world,
      damage,
      controller,
      tokens,
      firstWorldAt,
      measuredActorTicks,
      ownedTypedBytes: Object.freeze({
        trace: trace.byteLength,
        physicalHashScratch: scratch.byteLength,
        actorTicks: measuredActorTicks.byteLength,
      }),
      get totalTicks() {
        return totalTicks;
      },
      step(tick: number, measured: boolean, observer: boolean) {
        const packets =
          (tick - 1) % 6 === 0
            ? tokens.map((token, index) => ({
                identity: token,
                command: {
                  ...context,
                  vehicleId: `car-${index}`,
                  tick,
                  source: 'AUTONOMY',
                  throttle: index % 2 ? 0.65 : 1,
                  brake: 0,
                  steering: index % 2 ? 0.03 : -0.03,
                  handbrake: false,
                  turnSignal: 'OFF',
                  driveIntent: {
                    version: '027-braking-reverse-v1',
                    direction: 'FORWARD',
                    shiftBrake: 0.7,
                  },
                } as VehicleCommand,
              }))
            : [];
        const frame = controller.step(
          { tick, dtSeconds: 1 / 60 },
          packets,
          [],
          measured && observer,
        );
        totalTicks = tick;
        if (measured) for (let index = 0; index < 70; index++) measuredActorTicks[index]++;
        if (tick >= 1920 && tick <= 8760 && (tick - 1920) % 120 === 0) {
          if (traceRows >= 58 || checkpointHashes.length >= 64)
            throw new Error('Checkpoint capacity');
          for (let index = 0; index < 70; index++) scratch.set(scalarState(index), index * 16);
          for (let index = 0; index < 3; index++)
            trace.set(scratch.subarray(index * 16, (index + 1) * 16), (traceRows * 3 + index) * 16);
          // subtle.digest copies the bounded input synchronously. At most64 pending promises; no state snapshot graphs retained.
          const encoded = new TextEncoder().encode(
            JSON.stringify(
              frame.controls.map((control, index) => ({
                identity: tokens[index],
                mechanics: world.readVehicleMechanics(`car-${index}`),
                suspension: world.project(`car-${index}`).suspension,
                mode: control.mode,
                raw: control.raw,
                effective: control.command,
                targetTick: control.targetTick,
                drivetrain: control.drivetrain,
              })),
              (_key, value: unknown) => {
                if (typeof value === 'number') {
                  if (!Number.isFinite(value)) throw new Error('Nonfinite control/identity codec');
                  if (Object.is(value, -0)) return { negativeZero: true };
                }
                return value;
              },
            ),
          );
          if (encoded.byteLength > PHYSICAL_CHECKPOINT_PROTOCOL.controlCodecMaximumBytes)
            throw new Error('Control identity codec capacity');
          checkpointHashes.push(
            Promise.all([sha256(new Uint8Array(scratch.buffer)), sha256(encoded)]).then(
              async ([physical, input]) => ({
                tick,
                hash: await sha256(new TextEncoder().encode(physical + input)),
              }),
            ),
          );
          traceRows++;
        }
        return frame;
      },
      render() {
        for (let index = 0; index < 70; index++) {
          const state = world.project(`car-${index}`),
            q = state.rotation;
          meshes[index].position.set(state.position.x, state.position.y, state.position.z);
          meshes[index].rotationQuaternion = new Quaternion(q.x, q.y, q.z, q.w);
        }
        owned.render();
      },
      async trace() {
        const hashes = await Promise.all(checkpointHashes);
        if (hashes.length !== 58 || hashes.at(-1)?.tick !== 8760)
          throw new Error('Incomplete exact physical checkpoints');
        return {
          hashes,
          rows: traceRows,
          values: [...trace.subarray(0, traceRows * 3 * 16)],
          physicalHash: hashes.at(-1)!.hash,
          checkpointHash: await sha256(new TextEncoder().encode(JSON.stringify(hashes))),
        };
      },
      async partialTrace() {
        const hashes = await Promise.all(checkpointHashes);
        return {
          partial: true,
          hashes,
          rows: traceRows,
          values: [...trace.subarray(0, traceRows * 3 * 16)],
          actualEndTick: totalTicks,
          checkpointHash: await sha256(new TextEncoder().encode(JSON.stringify(hashes))),
        };
      },
      dispose() {
        if (disposed) throw new Error('Workload already disposed');
        disposed = true;
        const cleanupErrors: unknown[] = [];
        for (const resource of [controller, damage, world, ...meshes, ground, light, camera])
          if (resource)
            try {
              resource.dispose();
            } catch (error) {
              cleanupErrors.push(error);
            }
        let disposedReadRejected = false;
        try {
          world.project('car-0');
        } catch {
          disposedReadRejected = true;
        }
        const cleanup = {
          vehicles: world.bodyResources().entities,
          subscriptions: world.bodyResources().subscriptions,
          collisionColliders: world.collisionResources().colliders,
          controllerVehicles: controller.getStats().vehicles,
          damageRegistrations: damage?.getStats().vehicles ?? 0,
          damageHistory: damage?.getStats().historyRecords ?? 0,
          disposedReadRejected,
        };
        if (cleanupErrors.length)
          throw new AggregateError(
            cleanupErrors,
            'Workload disposal failed; all acquired resources attempted',
          );
        return cleanup;
      },
    };
  } catch (error) {
    const cleanupErrors: unknown[] = [];
    for (const resource of [
      ...meshes,
      abortGround,
      abortLight,
      abortCamera,
      abortController,
      abortDamage,
      world,
    ])
      if (resource)
        try {
          resource.dispose();
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
    if (cleanupErrors.length)
      throw new AggregateError(
        [error, ...cleanupErrors],
        'Hardware workload factory failed; original cause and cleanup errors retained',
      );
    throw error;
  }
}

import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { RenderingBackend } from '../../../src/rendering/babylon';
import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { createRapierProbe } from '../../../src/vehicles/rapier';
import { VEHICLE_CLASSES } from '../../../src/vehicles/vehicle-classes';
import { createFixedTickLoop } from '../../../src/simulation';

export async function compareClasses(
  backend: RenderingBackend,
  status: HTMLElement,
  identity: unknown,
) {
  const world = await createRapierProbe();
  const ids = ['sedan', 'compact'] as const;
  const meshes = ids.map((id, i) => {
    const mesh = MeshBuilder.CreateBox(id, { width: 1.7, height: 0.6, depth: 4 }, backend.scene);
    const material = new StandardMaterial(id, backend.scene);
    material.diffuseColor = i ? new Color3(0.2, 0.8, 0.4) : new Color3(0.2, 0.45, 1);
    mesh.material = material;
    return mesh;
  });
  MeshBuilder.CreateGround('same-flat-ground', { width: 100, height: 180 }, backend.scene);
  const camera = backend.scene.activeCamera as FreeCamera;
  camera.position = new Vector3(45, 60, -35);
  camera.setTarget(new Vector3(0, 0, 25));
  const present = () => {
    ids.forEach((id, i) => {
      const state = world.project(id),
        q = state.rotation;
      meshes[i]!.position.copyFromFloats(state.position.x, state.position.y, state.position.z);
      meshes[i]!.rotationQuaternion = new Quaternion(q.x, q.y, q.z, q.w);
    });
    backend.render();
  };
  const raf = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
  const run = async (total: number, throttle: number, brake: number, steering: number) => {
    let tick = 0;
    const inputs = new Map(ids.map((id) => [id, { throttle, brake, steering }]));
    const loop = createFixedTickLoop({
      captureSnapshot: () => ({ tick }),
      interpolate: (_, current) => current,
      step: () => {
        if (tick < total) {
          world.step(inputs, false);
          tick++;
        }
      },
    });
    try {
      loop.frame(await raf());
      while (tick < total) {
        if (!document.hasFocus() || document.hidden)
          throw new Error('Class comparison lost foreground');
        loop.frame(await raf());
        present();
        if (loop.getState().overloadCount) throw new Error('Class comparison overload');
      }
    } finally {
      loop.dispose();
    }
  };
  const reset = async () => {
    ids.forEach((id, i) => {
      const old = world.bodyIdentity(id);
      if (old) world.removeBody(old);
      world.addClassCar(id, { x: i * 8 - 4, y: 0.8, z: 0 }, id);
    });
    await run(180, 0, 0, 0);
  };
  try {
    await reset();
    status.textContent = 'Same flat ground: 3s full throttle; blue sedan / green compact';
    await run(180, 1, 0, 0);
    const acceleration = ids.map((id) => world.project(id).speed);
    await reset();
    const origins = ids.map((id) => world.project(id).position.z);
    ids.forEach((id) => world.setVelocity(id, { x: 0, y: 0, z: 20 }));
    status.textContent = 'Same flat ground: brake from 20m/s';
    await run(240, 0, 1, 0);
    const braking = ids.map((id, i) => world.project(id).position.z - origins[i]!);
    await reset();
    ids.forEach((id) => world.setVelocity(id, { x: 0, y: 0, z: 8 }));
    status.textContent = 'Same flat ground: turn from 8m/s at steering0.35';
    await run(180, 0, 0, 0.35);
    const report = {
      identity,
      capturedAt: new Date().toISOString(),
      renderer: backend.rendererKind,
      classes: ids.map((id, i) => ({
        id,
        configuration: VEHICLE_CLASSES[id],
        native: world.readVehicleMechanics(id),
        accelerationSpeedMps: acceleration[i],
        brakingDistanceM: braking[i],
        turning: world.project(id),
      })),
      foreground: true,
      physics: world.counts(),
      browser: navigator.userAgent,
    };
    if (!(acceleration[1]! > acceleration[0]! * 1.15 && braking[1]! < braking[0]! * 0.95))
      throw new Error('Class differences failed');
    const saved = await fetch('/classes-export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    if (!saved.ok) throw new Error('Class export rejected');
    status.textContent = `PASS real Rapier classes (${backend.rendererKind})\n${JSON.stringify(report.classes, null, 2)}`;
    let frame = 0;
    const draw = () => {
      present();
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      world.dispose();
      backend.dispose();
    };
  } catch (error) {
    world.dispose();
    throw error;
  }
}

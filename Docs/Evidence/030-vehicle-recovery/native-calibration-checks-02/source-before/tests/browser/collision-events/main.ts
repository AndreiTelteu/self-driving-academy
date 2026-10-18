import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { createRenderingBackend } from '../../../src/rendering/babylon';
import { createRapierProbe } from '../../../src/vehicles/rapier';
import { createCollisionEventAdapter, createEventBus } from '../../../src/simulation';
import type { SimulationEvent } from '../../../src/simulation';

declare const __COLLISION_BUILD__: { sourceHash: string; commit: string; inputs: string[] };
const status = document.getElementById('status')!;
const button = document.getElementById('run') as HTMLButtonElement;
const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
function check(value: boolean, message: string): asserts value {
  if (!value) throw new Error(message);
}
button.onclick = async () => {
  button.disabled = true;
  let backend: Awaited<ReturnType<typeof createRenderingBackend>> | undefined;
  let world: Awaited<ReturnType<typeof createRapierProbe>> | undefined;
  let adapter: ReturnType<typeof createCollisionEventAdapter> | undefined;
  let bus: ReturnType<typeof createEventBus> | undefined;
  const report: { [key: string]: unknown } = {
    fixtureVersion: '028-native-lifecycle-v1',
    identity: __COLLISION_BUILD__,
    startedAt: new Date().toISOString(),
    scope:
      'Headed actual native contacts/lifecycle visual playtest; fixed60Hz solver steps, one per foreground RAF; no FPS or frame budget claim',
  };
  try {
    const preference =
      (document.getElementById('backend') as HTMLSelectElement).value === 'WEBGL2'
        ? 'WEBGL2'
        : 'AUTO';
    const previous = document.getElementById('canvas') as HTMLCanvasElement;
    const fresh = previous.cloneNode(false) as HTMLCanvasElement;
    previous.replaceWith(fresh);
    backend = await createRenderingBackend(fresh, preference);
    report.renderer = backend.rendererKind;
    backend.scene.activeCamera!.position = new Vector3(16, 13, -16);
    (backend.scene.activeCamera! as FreeCamera).setTarget(new Vector3(0, 0, 5));
    new HemisphericLight('sun', new Vector3(0, 1, 0), backend.scene);
    const ground = MeshBuilder.CreateGround('ground', { width: 35, height: 35 }, backend.scene);
    const car = MeshBuilder.CreateBox(
      'vehicle',
      { width: 1.8, height: 0.8, depth: 4 },
      backend.scene,
    );
    const wall = MeshBuilder.CreateBox(
      'named wall',
      { width: 8, height: 2, depth: 0.1 },
      backend.scene,
    );
    wall.position = new Vector3(0, 1, 10);
    const material = new StandardMaterial('vehicle paint', backend.scene);
    material.diffuseColor = new Color3(0.15, 0.65, 1);
    car.material = material;
    const groundMaterial = new StandardMaterial('ground material', backend.scene);
    groundMaterial.diffuseColor = new Color3(0.25, 0.3, 0.32);
    ground.material = groundMaterial;
    world = await createRapierProbe();
    world.addCar('car', { x: 0, y: 0.8, z: 0 });
    world.addNamedBox('wall', { x: 0, y: 1, z: 10 }, { x: 4, y: 1, z: 0.05 });
    const context = {
      schemaVersion: 1,
      units: 'SI',
      sessionId: '028-headed',
      worldEpoch: 1,
    } as const;
    bus = createEventBus({ sessionId: context.sessionId, worldEpoch: 1 });
    adapter = createCollisionEventAdapter({ context, physics: world, eventBus: bus });
    const events: SimulationEvent[] = [];
    bus.subscribe((event) => {
      check(events.length < 128, 'Event artifact cap');
      events.push(event);
    });
    const drive = new Map([['car', { throttle: 1, brake: 0, steering: 0 }]]);
    let tick = 0,
      active = false,
      lastOnset = -Infinity,
      contactTicks = 0,
      maxStreak = 0,
      streak = 0;
    const expectedOnsets: number[] = [];
    const advance = async (
      label: string,
      inputs = new Map<string, { throttle: number; brake: number; steering: number }>(),
    ) => {
      check(document.visibilityState === 'visible', 'Playtest must stay visible');
      check(adapter!.beforePhysicsStep(tick).ready, 'Pending incidents block physics');
      world!.step(inputs, false);
      const result = adapter!.captureAfterPhysicsStep(tick);
      check(
        result.publication.pending === 0 && result.publication.listenerFailures === 0,
        'Incomplete delivery',
      );
      const touching = result.readback.contacts.length > 0;
      if (touching && !active && tick - lastOnset >= 60) {
        expectedOnsets.push(tick);
        lastOnset = tick;
      }
      active = touching;
      streak = touching ? streak + 1 : 0;
      maxStreak = Math.max(maxStreak, streak);
      contactTicks += touching ? 1 : 0;
      const projection = world!.project('car'),
        position = projection.position,
        q = projection.rotation;
      car.position.set(position.x, position.y, position.z);
      car.rotationQuaternion = new Quaternion(q.x, q.y, q.z, q.w);
      const latest = events.at(-1);
      status.textContent = JSON.stringify(
        {
          stage: label,
          tick,
          contacts: result.readback.contacts.length,
          incidents: events.length,
          latestImpulseNs: latest?.type === 'COLLISION' ? latest.payload.impulseNs : null,
        },
        null,
        2,
      );
      backend!.render();
      tick++;
      await frame();
      return touching;
    };
    for (let index = 0; index < 180; index++) await advance('settle');
    world.setVelocity('car', { x: 0, y: 0, z: 10 });
    for (let index = 0; index < 180; index++)
      await advance('wall impact and persistent contact', drive);
    check(
      contactTicks > 60 && maxStreak > 60,
      'Actual persistent contact beyond cooldown required',
    );
    const firstCount = events.length;
    check(firstCount >= 1, 'First actual incident required');
    world.setPose(world.bodyIdentity('car')!, {
      positionM: { x: 0, y: 0.8, z: 0 },
      rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
    });
    world.setVelocity('car', { x: 0, y: 0, z: 0 });
    for (let index = 0; index < 61; index++)
      check(!(await advance('complete separation')), 'Separated pair must be absent');
    world.setVelocity('car', { x: 0, y: 0, z: 10 });
    for (let index = 0; index < 180; index++) await advance('real recontact', drive);
    check(events.length > firstCount, 'Recontact must create a new episode');
    check(
      JSON.stringify(events.map((event) => event.tick)) === JSON.stringify(expectedOnsets),
      'Segment onset oracle mismatch',
    );
    check(
      events.every((event) => event.type === 'COLLISION' && event.payload.impulseNs > 0),
      'Actual onset impulse must be positive N*s',
    );
    const old = world.collisionIdentity('car')!;
    check(world.removeCollisionEntity(old), 'Remove actual vehicle');
    world.addCar('car', { x: 5, y: 0.8, z: 0 });
    const replacement = world.collisionIdentity('car')!;
    check(
      replacement.serial > old.serial &&
        !world.collisionSource.isCurrent(old) &&
        !world.removeCollisionEntity(old),
      'Stale identity must not remove replacement',
    );
    report.reuse = { oldSerial: old.serial, newSerial: replacement.serial, staleRejected: true };
    await advance('replacement identity');
    report.events = events;
    report.expectedOnsets = expectedOnsets;
    report.contactTicks = contactTicks;
    report.maxStreak = maxStreak;
    report.nativeTicks = tick;
    for (let iteration = 0; iteration < 20; iteration++) {
      const token = world.collisionIdentity('car')!;
      check(world.removeCollisionEntity(token), 'Lifecycle removal');
      world.addCar('car', { x: 5, y: 0.8, z: 0 });
      check(!world.removeCollisionEntity(token), 'Lifecycle stale removal');
    }
    report.vehicleReuseCycles = 20;
    adapter.dispose();
    bus.dispose();
    world.dispose();
    report.cleanup = {
      body: world.bodyResources(),
      collision: world.collisionResources(),
      adapter: adapter.getStats(),
      bus: bus.getStats(),
    };
    check(
      world.bodyResources().entities === 0 &&
        world.collisionResources().colliders === 0 &&
        adapter.getStats().trackedPairs === 0 &&
        adapter.getStats().pending === 0 &&
        bus.getStats().retainedEvents === 0 &&
        bus.getStats().listeners === 0,
      'Ownership cleanup must be zero',
    );
    const lifecycle = [];
    for (let iteration = 0; iteration < 20; iteration++) {
      const cycleWorld = await createRapierProbe();
      const cycleContext = { ...context, worldEpoch: iteration + 2 };
      const cycleBus = createEventBus({
        sessionId: context.sessionId,
        worldEpoch: cycleContext.worldEpoch,
      });
      const cycleAdapter = createCollisionEventAdapter({
        context: cycleContext,
        physics: cycleWorld,
        eventBus: cycleBus,
      });
      try {
        cycleWorld.addCar('car', { x: 0, y: 0.8, z: 0 });
        cycleWorld.addNamedBox('wall', { x: 0, y: 1, z: 10 }, { x: 4, y: 1, z: 0.05 });
        cycleAdapter.beforePhysicsStep(0);
        cycleWorld.step(new Map(), false);
        cycleAdapter.captureAfterPhysicsStep(0);
      } finally {
        cycleAdapter.dispose();
        cycleBus.dispose();
        cycleWorld.dispose();
      }
      const counts = {
        body: cycleWorld.bodyResources(),
        collision: cycleWorld.collisionResources(),
        adapter: cycleAdapter.getStats(),
        bus: cycleBus.getStats(),
      };
      check(
        counts.body.entities === 0 &&
          counts.body.subscriptions === 0 &&
          counts.collision.colliders === 0 &&
          counts.adapter.trackedPairs === 0 &&
          counts.adapter.pending === 0 &&
          counts.bus.listeners === 0 &&
          counts.bus.retainedEvents === 0,
        'World lifecycle resource leak',
      );
      lifecycle.push(counts);
    }
    report.lifecycleCycles = 20;
    report.lifecycle = lifecycle;
    report.completedAt = new Date().toISOString();
    report.passed = true;
    const saved = await fetch('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    check(saved.ok, 'Report export failed');
    status.textContent = JSON.stringify(report, null, 2);
    (window as unknown as { collisionReport: unknown }).collisionReport = report;
  } catch (error) {
    status.textContent = `FAIL: ${String(error)}`;
    console.error(error);
  } finally {
    adapter?.dispose();
    bus?.dispose();
    world?.dispose();
    backend?.dispose();
    button.disabled = false;
  }
};

import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { createRenderingBackend } from '../../../src/rendering/babylon';
import type { RenderingBackend } from '../../../src/rendering/babylon';
import { createRapierProbe } from '../../../src/vehicles/rapier';
import { createVehicleController, parseVehicleCommand } from '../../../src/vehicles';
import type { VehicleCommand, VehicleControlProjection } from '../../../src/vehicles';
import { createFixedTickLoop } from '../../../src/simulation';

declare const __CONTROLLER_BUILD__: { sourceHash: string; commit: string; inputs: string[] };
const status = document.getElementById('status')!;
const raf = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
function check(value: boolean, message: string): asserts value {
  if (!value) throw new Error(message);
}
const plain = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;
let owned: RenderingBackend | undefined;

async function drive(backend: RenderingBackend, classId: 'sedan' | 'compact', epoch: number) {
  const world = await createRapierProbe();
  const context = {
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId: '024-browser',
    worldEpoch: epoch,
  };
  const controller = createVehicleController(context, world);
  const ids = ['player', 'autonomy'];
  const meshes = ids.map((id, i) => {
    world.addClassCar(id, { x: i * 10 - 5, y: 0.8, z: 0 }, classId);
    controller.register(world.bodyIdentity(id)!);
    const mesh = MeshBuilder.CreateBox(id, { width: 1.7, height: 0.6, depth: 4 }, backend.scene);
    const material = new StandardMaterial(id, backend.scene);
    material.diffuseColor = i ? new Color3(0.15, 0.8, 0.35) : new Color3(0.2, 0.5, 1);
    mesh.material = material;
    return mesh;
  });
  const lampMaterial = new StandardMaterial('indicator', backend.scene);
  lampMaterial.emissiveColor = new Color3(1, 0.65, 0.05);
  const lamps = meshes.map((mesh) =>
    [-1, 1].map((side) => {
      const lamp = MeshBuilder.CreateBox('signal', { size: 0.25 }, backend.scene);
      lamp.parent = mesh;
      lamp.position.set(side * 0.65, 0.4, 1.8);
      lamp.material = lampMaterial;
      return lamp;
    }),
  );
  const tokens = ids.map((id) => world.bodyIdentity(id)!);
  let latest: readonly VehicleControlProjection[] = [];
  let tick = 0,
    maxParityError = 0,
    takeoverIgnored = 0;
  const checkpoints: unknown[] = [];
  let handbrakeStart = 0;
  const command = (
    id: string,
    stamp: number,
    source: VehicleCommand['source'],
    values: Partial<VehicleCommand>,
  ) =>
    parseVehicleCommand({
      ...context,
      vehicleId: id,
      tick: stamp,
      source,
      throttle: 0,
      brake: 0,
      steering: 0,
      handbrake: false,
      turnSignal: 'OFF',
      ...values,
    });
  const loop = createFixedTickLoop({
    captureSnapshot: () => ({ tick }),
    interpolate: (_previous, current) => current,
    step(frame) {
      tick = frame.tick;
      const phase = Math.floor((tick - 1) / 180);
      if (tick === 721) {
        for (let i = 0; i < ids.length; i++) {
          world.setPose(tokens[i], {
            positionM: { x: i * 10 - 5, y: 0.8, z: 0 },
            rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
          });
          world.setVelocity(ids[i], { x: 0, y: 0, z: 15 });
        }
        handbrakeStart = world.project('player').position.z;
      }
      const values: Partial<VehicleCommand> =
        phase === 0
          ? {}
          : phase === 1
            ? { throttle: 0.8 }
            : phase === 2
              ? { throttle: 0.5, steering: 0.25, turnSignal: 'LEFT' }
              : phase === 3
                ? { brake: 0.8 }
                : phase === 4
                  ? { handbrake: true, turnSignal: 'HAZARD' }
                  : { throttle: 0.4, turnSignal: 'RIGHT' };
      const packets = ids.flatMap((id, i) => {
        const source = (tick <= 900 ? i === 0 : i === 1) ? 'PLAYER' : 'AUTONOMY';
        return source === 'PLAYER' || (tick - 1) % 6 === 0
          ? [{ identity: tokens[i], command: command(id, tick, source, values) }]
          : [];
      });
      if (tick === 901)
        packets.push({
          identity: tokens[1],
          command: command(ids[1], tick, 'AUTONOMY', { throttle: 1 }),
        });
      const authority =
        tick === 1
          ? [{ identity: tokens[0], mode: 'MANUAL' }]
          : tick === 901
            ? [
                { identity: tokens[0], mode: 'AUTO' },
                { identity: tokens[1], mode: 'MANUAL' },
              ]
            : [];
      const result = controller.step(frame, packets, authority, false);
      latest = result.controls;
      takeoverIgnored += result.ignoredCommands.length;
      const a = world.project(ids[0]),
        b = world.project(ids[1]);
      const error = Math.max(
        Math.abs(a.position.x + 10 - b.position.x),
        Math.abs(a.position.y - b.position.y),
        Math.abs(a.position.z - b.position.z),
        Math.abs(a.speed - b.speed),
      );
      maxParityError = Math.max(maxParityError, error);
      check(error < 0.005, 'PLAYER/AUTONOMY physical parity exceeded tolerance');
      check(
        result.controls[0].command.throttle === result.controls[1].command.throttle,
        'Effective controls diverged',
      );
      if (tick % 60 === 0)
        checkpoints.push({
          tick,
          physical: ids.map((id) => plain(world.project(id))),
          controls: latest.map((control) => plain(control)),
          brakes: world.readVehicleMechanics(ids[0]).wheelBrakeImpulseLimitNs,
        });
      return undefined;
    },
  });
  const start = performance.now();
  try {
    loop.frame(await raf());
    while (tick < 960) {
      check(!document.hidden && document.hasFocus(), 'Drive lost foreground');
      loop.frame(await raf());
      check(loop.getState().overloadCount === 0, 'Drive fixed-tick overload');
      meshes.forEach((mesh, i) => {
        const state = world.project(ids[i]),
          q = state.rotation;
        mesh.position.copyFromFloats(state.position.x, state.position.y, state.position.z);
        mesh.rotationQuaternion = new Quaternion(q.x, q.y, q.z, q.w);
        lamps[i][0].setEnabled(latest[i]?.leftIndicatorOn ?? false);
        lamps[i][1].setEnabled(latest[i]?.rightIndicatorOn ?? false);
      });
      status.textContent = `${classId}: physical tick ${tick}/960, ${['settle', 'accelerate', 'turn + LEFT', 'service brake', 'rear handbrake from 15m/s + HAZARD', 'same-tick authority transfer + RIGHT'][Math.floor((tick - 1) / 180)]}\nParity error ${maxParityError.toFixed(6)} m or m/s. PLAYER now ${tick > 900 ? 'green' : 'blue'}.`;
      backend.render();
    }
    controller.suspend();
    check(controller.getStats().targets === 0, 'Suspend retained AUTO target');
    controller.resume();
    const resumed = controller.step({ tick: tick + 1, dtSeconds: 1 / 60 }, [], [], false);
    check(
      resumed.controls.every(
        (control) =>
          control.command.throttle === 0 &&
          control.command.brake === 0 &&
          !control.command.handbrake,
      ),
      'Resume reused input',
    );
    check(takeoverIgnored === 1, 'Old AI was not explicitly ignored at takeover');
    return {
      classId,
      ticks: tick + 1,
      elapsedWallMs: performance.now() - start,
      maxParityError,
      takeoverIgnored,
      handbrakeStart,
      checkpoints,
      resumedNeutral: true,
      overloadCount: loop.getState().overloadCount,
    };
  } finally {
    loop.dispose();
    controller.dispose();
    world.dispose();
    check(
      world.bodyResources().entities === 0 &&
        world.bodyResources().subscriptions === 0 &&
        world.collisionResources().colliders === 0 &&
        controller.getStats().vehicles === 0,
      'Drive ownership cleanup failed',
    );
    meshes.forEach((mesh) => mesh.dispose(false, true));
    lampMaterial.dispose();
  }
}

document.getElementById('run')!.addEventListener('click', async () => {
  const button = document.getElementById('run') as HTMLButtonElement;
  button.disabled = true;
  try {
    owned?.dispose();
    const old = document.getElementById('canvas') as HTMLCanvasElement;
    const candidate = old.cloneNode(false) as HTMLCanvasElement;
    old.replaceWith(candidate);
    owned = await createRenderingBackend(
      candidate,
      (document.getElementById('backend') as HTMLSelectElement).value as 'AUTO' | 'WEBGL2',
    );
    // The backend owns a fresh canvas for each attempt; candidate is detached.
    const canvas = owned.canvas;
    owned.scene.useRightHandedSystem = false;
    new HemisphericLight('light', new Vector3(0, 1, 0), owned.scene);
    const camera = new FreeCamera('camera', new Vector3(38, 55, -35), owned.scene);
    camera.setTarget(new Vector3(0, 0, 20));
    owned.scene.activeCamera = camera;
    MeshBuilder.CreateGround('flat', { width: 120, height: 180 }, owned.scene);
    owned.scene.getEngine().setHardwareScalingLevel(1);
    owned.resize();
    // Fix the measured internal resolution explicitly, independent of host sizing.
    owned.scene.getEngine().setSize(1920, 1080);
    check(
      devicePixelRatio === 1 &&
        canvas.clientWidth === 1920 &&
        canvas.clientHeight === 1080 &&
        owned.scene.getEngine().getRenderWidth() === 1920 &&
        owned.scene.getEngine().getRenderHeight() === 1080,
      `Resolution mismatch: DPR=${devicePixelRatio}, CSS=${canvas.clientWidth}x${canvas.clientHeight}, internal=${owned.scene.getEngine().getRenderWidth()}x${owned.scene.getEngine().getRenderHeight()}`,
    );
    const classes = [];
    for (const [epoch, classId] of (['sedan', 'compact'] as const).entries())
      classes.push(await drive(owned, classId, epoch));
    const manifest = (await (await fetch('/build-manifest.json')).json()) as {
      artifactHash: string;
    };
    const engine = owned.scene.getEngine();
    const report = {
      fixtureVersion: '024-controller-drive-v1',
      identity: __CONTROLLER_BUILD__,
      artifactHash: manifest.artifactHash,
      createdAt: new Date().toISOString(),
      browser: navigator.userAgent,
      renderer: owned.rendererKind,
      actualGpuInfo:
        'getInfo' in engine ? (engine as unknown as { getInfo(): unknown }).getInfo() : null,
      foreground: document.hasFocus() && !document.hidden,
      cssResolution: [canvas.clientWidth, canvas.clientHeight],
      internalResolution: [engine.getRenderWidth(), engine.getRenderHeight()],
      dpr: devicePixelRatio,
      classes,
      scope:
        'Functional real headed driving/playtest; no steady-state frame budget or FPS claim. Before/after CPU and20-cycle memory evidence are separate.',
    };
    const response = await fetch('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    check(response.ok, `Export rejected: ${await response.text()}`);
    status.textContent = `PASS ${owned.rendererKind}: sedan and compact parity; 10Hz→60Hz, moving handbrake, indicators, same-tick transfer, neutral resume and cleanup. Evidence saved.`;
  } catch (error) {
    status.textContent = `FAILED: ${String(error)}`;
    console.error(error);
  } finally {
    button.disabled = false;
  }
});

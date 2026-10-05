import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { createRenderingBackend } from '../../../src/rendering/babylon';
import type { RenderingBackend } from '../../../src/rendering/babylon';
import { createRapierProbe } from '../../../src/vehicles/rapier';
import { createVehicleController } from '../../../src/vehicles/controller';
import { createBrakingReverseKeyboardFilter } from '../../../src/vehicles/braking-reverse-input';
import { DRIVETRAIN_LIMITS, readDrivetrainMotion } from '../../../src/vehicles/drivetrain';
import { bindKeyboardDriveInput } from '../../../src/input';
import { createDefaultSettings } from '../../../src/settings';
import { createFixedTickLoop } from '../../../src/simulation/fixed-tick';

declare const __REVERSE_BUILD__: { sourceHash: string; commit: string; inputs: string[] };
const status = document.getElementById('status')!;
const raf = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
function check(value: boolean, message: string): asserts value {
  if (!value) throw new Error(message);
}
const copy = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;
let owned: RenderingBackend | undefined;
async function protocol(backend: RenderingBackend, classId: 'sedan' | 'compact', epoch: number) {
  const world = await createRapierProbe();
  world.addClassCar('car', { x: 0, y: 0.8, z: 0 }, classId);
  const context = {
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId: '027-browser',
    worldEpoch: epoch,
  };
  const token = world.bodyIdentity('car')!,
    settings = createDefaultSettings('027-browser');
  const controller = createVehicleController(context, world, 0, {
    drivetrainVersion: DRIVETRAIN_LIMITS.version,
  });
  controller.register(token);
  const filter = createBrakingReverseKeyboardFilter(context, 'car', settings.input.control);
  const canvas = backend.canvas;
  canvas.focus();
  const binding = bindKeyboardDriveInput({
    surface: canvas,
    bindings: settings.input.bindings,
    port: filter,
  });
  const event = (type: string, code: string) =>
    document.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
  const mesh = MeshBuilder.CreateBox('car', { width: 1.7, height: 0.6, depth: 4 }, backend.scene),
    material = new StandardMaterial('car', backend.scene);
  material.diffuseColor = new Color3(0.2, 0.5, 1);
  mesh.material = material;
  let tick = 0,
    phase:
      | 'SETTLE'
      | 'STOP_FORWARD'
      | 'REVERSE'
      | 'STOP_REVERSE'
      | 'FORWARD'
      | 'HANDBRAKE_TURN'
      | 'NEUTRAL'
      | 'COMPLETE' = 'SETTLE',
    phaseTick = 0;
  let latest: unknown,
    reverseEngagement: unknown,
    forwardEngagement: unknown,
    handbrakeMechanics: unknown;
  let reverseMotion = false,
    forwardMotion = false,
    neutralReleased = false;
  const checkpoints: unknown[] = [];
  const loop = createFixedTickLoop({
    captureSnapshot: () => ({ tick }),
    interpolate: (_previous, current) => current,
    step(time) {
      tick = time.tick;
      if (tick === 181) {
        world.setVelocity('car', { x: 0, y: 0, z: 20 });
        event('keydown', 'KeyS');
        phase = 'STOP_FORWARD';
        phaseTick = tick;
      }
      binding.sync();
      const input = filter.step({ ...time, speedMps: world.project('car').speed });
      const realized = controller.step(
        time,
        [{ identity: token, command: input.command }],
        tick === 1 ? [{ identity: token, mode: 'MANUAL' }] : [],
        false,
      ).controls[0];
      const drive = realized.drivetrain!,
        physical = world.project('car'),
        motion = readDrivetrainMotion(world.readBody(token));
      for (const value of [
        ...Object.values(physical.position),
        ...Object.values(physical.rotation),
        ...Object.values(physical.velocity),
      ])
        check(Number.isFinite(value), 'Non-finite physical state');
      check(physical.speed < 100 && Math.abs(physical.position.y) < 10, 'Unstable chassis');
      if (realized.command.brake > 0 || realized.command.handbrake)
        check(drive.physicalInput.throttle === 0, 'Brake allowed propulsion');
      latest = { phase, input, realized, physical };
      if (tick % 30 === 0) checkpoints.push({ tick, ...(copy(latest) as object) });
      if (phase === 'STOP_FORWARD') {
        if (drive.engagedDirection === 'REVERSE') {
          check(
            drive.nearZeroTicks === 6 && drive.motion !== null && drive.motion.totalSpeedMps <= 0.2,
            'Unsafe reverse engagement',
          );
          reverseEngagement = copy({ tick, drive, physical });
          phase = 'REVERSE';
          phaseTick = tick;
        } else
          check(
            drive.physicalInput.throttle === 0 && realized.command.brake > 0,
            'Forward braking interlock failed',
          );
      } else if (phase === 'REVERSE' && motion.longitudinalSpeedMps < -3) {
        reverseMotion = true;
        event('keyup', 'KeyS');
        event('keydown', 'KeyW');
        phase = 'STOP_REVERSE';
        phaseTick = tick;
      } else if (phase === 'STOP_REVERSE') {
        if (drive.engagedDirection === 'FORWARD') {
          check(
            drive.nearZeroTicks === 6 && drive.motion !== null && drive.motion.totalSpeedMps <= 0.2,
            'Unsafe forward engagement',
          );
          forwardEngagement = copy({ tick, drive, physical });
          phase = 'FORWARD';
          phaseTick = tick;
        } else check(drive.physicalInput.throttle === 0, 'Reverse braking interlock failed');
      } else if (phase === 'FORWARD' && motion.longitudinalSpeedMps > 3) {
        forwardMotion = true;
        event('keyup', 'KeyW');
        world.setPose(token, {
          positionM: { x: 0, y: 0.8, z: 0 },
          rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
        });
        world.setVelocity('car', { x: 0, y: 0, z: 8 });
        event('keydown', 'KeyD');
        event('keydown', 'Space');
        phase = 'HANDBRAKE_TURN';
        phaseTick = tick;
      } else if (phase === 'HANDBRAKE_TURN' && tick - phaseTick >= 180) {
        const mechanics = world.readVehicleMechanics('car');
        check(
          mechanics.wheelBrakeImpulseLimitNs[0] === 0 &&
            mechanics.wheelBrakeImpulseLimitNs[1] === 0 &&
            mechanics.wheelBrakeImpulseLimitNs[2] > 0 &&
            mechanics.wheelBrakeImpulseLimitNs[3] > 0,
          'Rear handbrake mapping failed',
        );
        check(physical.speed < 8, 'Handbrake had no physical slowing');
        handbrakeMechanics = copy(mechanics);
        event('keyup', 'Space');
        event('keyup', 'KeyD');
        phase = 'NEUTRAL';
        phaseTick = tick;
      } else if (phase === 'NEUTRAL' && tick - phaseTick >= 60) {
        check(
          filter.getStats().heldKeys === 0 &&
            realized.command.throttle === 0 &&
            realized.command.brake === 0 &&
            realized.command.steering === 0,
          'Release retained command',
        );
        neutralReleased = true;
        phase = 'COMPLETE';
      }
      check(tick - phaseTick < 1200 && tick < 3000, 'Maneuver failed to complete');
      return undefined;
    },
  });
  const start = performance.now();
  try {
    loop.frame(await raf());
    while (String(phase) !== 'COMPLETE') {
      check(document.hasFocus() && !document.hidden, 'Lost foreground');
      loop.frame(await raf());
      check(loop.getState().overloadCount === 0, 'Fixed tick overload');
      const state = world.project('car'),
        q = state.rotation;
      mesh.position.copyFromFloats(state.position.x, state.position.y, state.position.z);
      mesh.rotationQuaternion = new Quaternion(q.x, q.y, q.z, q.w);
      status.textContent = `${classId} ${phase}: tick ${tick}\n${JSON.stringify(latest)}`;
      backend.render();
    }
    check(reverseMotion && forwardMotion && neutralReleased, 'Protocol incomplete');
    return {
      classId,
      ticks: tick,
      elapsedWallMs: performance.now() - start,
      reverseMotion,
      forwardMotion,
      neutralReleased,
      reverseEngagement,
      forwardEngagement,
      handbrakeMechanics,
      checkpoints,
      overloadCount: loop.getState().overloadCount,
      scope:
        'Scripted DOM S/W/Space on actual native physics; independent handbrake-turn arm resets pose/velocity to8m/s, not a continuous-road claim.',
    };
  } finally {
    binding.dispose();
    loop.dispose();
    filter.dispose();
    controller.dispose();
    world.dispose();
    check(
      binding.getStats().listeners === 0 &&
        filter.getStats().heldKeys === 0 &&
        controller.getStats().drivetrain?.states === 0 &&
        world.bodyResources().entities === 0,
      'Cleanup failed',
    );
    mesh.dispose(false, true);
  }
}
document.getElementById('run')!.addEventListener('click', async () => {
  const button = document.getElementById('run') as HTMLButtonElement;
  button.disabled = true;
  try {
    owned?.dispose();
    owned = await createRenderingBackend(
      document.getElementById('canvas') as HTMLCanvasElement,
      (document.getElementById('backend') as HTMLSelectElement).value as 'AUTO' | 'WEBGL2',
    );
    const canvas = owned.canvas;
    canvas.tabIndex = 0;
    canvas.focus();
    owned.scene.getEngine().setHardwareScalingLevel(1);
    owned.resize();
    owned.scene.getEngine().setSize(1920, 1080);
    check(
      devicePixelRatio === 1 && canvas.clientWidth === 1920 && canvas.clientHeight === 1080,
      'Resolution mismatch',
    );
    new HemisphericLight('light', new Vector3(0, 1, 0), owned.scene);
    const camera = new FreeCamera('camera', new Vector3(25, 45, -25), owned.scene);
    camera.setTarget(new Vector3(0, 0, 20));
    owned.scene.activeCamera = camera;
    MeshBuilder.CreateGround('ground', { width: 150, height: 220 }, owned.scene);
    const classes: Awaited<ReturnType<typeof protocol>>[] = [];
    for (const [epoch, classId] of (['sedan', 'compact'] as const).entries())
      classes.push(await protocol(owned, classId, epoch));
    const engine = owned.scene.getEngine(),
      manifest = (await (await fetch('/build-manifest.json')).json()) as { artifactHash: string };
    const report = {
      fixtureVersion: '027-braking-reverse-drive-v1',
      identity: __REVERSE_BUILD__,
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
      guards: DRIVETRAIN_LIMITS,
      scope:
        'Visible headed native stop/reverse/forward/rear-handbrake playtest. Scripted DOM inputs; no trusted physical-key or fleet FPS claim.',
    };
    const response = await fetch('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    check(response.ok, await response.text());
    status.textContent = `PASS ${owned.rendererKind}: sedan/compact braking, guarded reverse/forward and rear-handbrake turn. Evidence saved.`;
  } catch (error) {
    status.textContent = `FAILED: ${String(error)}`;
    console.error(error);
  } finally {
    button.disabled = false;
  }
});

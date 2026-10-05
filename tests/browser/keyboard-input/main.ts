import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { createRenderingBackend } from '../../../src/rendering/babylon';
import type { RenderingBackend } from '../../../src/rendering/babylon';
import { createRapierProbe } from '../../../src/vehicles/rapier';
import { createKeyboardFilter, createVehicleController } from '../../../src/vehicles';
import type { KeyboardInputFrame } from '../../../src/vehicles';
import { bindKeyboardDriveInput } from '../../../src/input';
import { createDefaultSettings } from '../../../src/settings';
import { createFixedTickLoop } from '../../../src/simulation/fixed-tick';

declare const __KEYBOARD_BUILD__: { sourceHash: string; commit: string; inputs: string[] };
const status = document.getElementById('status')!,
  finish = document.getElementById('finish') as HTMLButtonElement;
const raf = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
function check(value: boolean, message: string): asserts value {
  if (!value) throw new Error(message);
}
const plain = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;
let owned: RenderingBackend | undefined, stopManual: (() => void) | undefined;
const trusted = { presses: 0, releases: 0, editablePresses: 0, codes: new Set<string>() };
document.addEventListener('keydown', (event) => {
  if (event.isTrusted && ['KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(event.code)) {
    if (event.target === document.getElementById('typing')) trusted.editablePresses++;
    else {
      trusted.presses++;
      trusted.codes.add(event.code);
    }
  }
});
document.addEventListener('keyup', (event) => {
  if (event.isTrusted && ['KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(event.code)) trusted.releases++;
});

async function protocol(backend: RenderingBackend, classId: 'sedan' | 'compact', epoch: number) {
  const world = await createRapierProbe();
  world.addClassCar('car', { x: 0, y: 0.8, z: 0 }, classId);
  const context = {
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId: '025-browser',
    worldEpoch: epoch,
  };
  const settings = createDefaultSettings('025-browser'),
    filter = createKeyboardFilter(context, 'car', settings.input.control),
    controller = createVehicleController(context, world);
  const token = world.bodyIdentity('car')!;
  controller.register(token);
  const canvas = backend.canvas;
  canvas.focus();
  const binding = bindKeyboardDriveInput({
    surface: canvas,
    bindings: settings.input.bindings,
    port: filter,
  });
  const mesh = MeshBuilder.CreateBox('car', { width: 1.7, height: 0.6, depth: 4 }, backend.scene),
    material = new StandardMaterial('car', backend.scene);
  material.diffuseColor = new Color3(0.2, 0.5, 1);
  mesh.material = material;
  let tick = 0,
    latest: KeyboardInputFrame | undefined;
  const checkpoints: unknown[] = [];
  const event = (type: string, code: string) =>
    document.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
  let editableReleased = false,
    blurReleased = false,
    resumedNeutral = false;
  const loop = createFixedTickLoop({
    captureSnapshot: () => ({ tick }),
    interpolate: (_previous, current) => current,
    step(time) {
      tick = time.tick;
      if (tick === 181) event('keydown', 'KeyW');
      if (tick === 301) event('keydown', 'KeyD');
      if (tick === 361) {
        event('keyup', 'KeyW');
        event('keyup', 'KeyD');
        event('keydown', 'KeyS');
      }
      if (tick === 481) {
        event('keyup', 'KeyS');
        world.setVelocity('car', { x: 0, y: 0, z: 35 });
        event('keydown', 'KeyA');
      }
      if (tick === 541) {
        event('keyup', 'KeyA');
        event('keydown', 'Space');
      }
      if (tick === 601) {
        event('keyup', 'Space');
        event('keydown', 'KeyW');
        const input = document.getElementById('typing') as HTMLInputElement;
        input.focus();
        check(filter.getStats().heldKeys === 0, 'Editable focus did not release held key');
        editableReleased = true;
        event('keydown', 'KeyW');
        check(filter.getStats().heldKeys === 0, 'Editable focus captured drive');
        canvas.focus();
      }
      if (tick === 631) {
        event('keydown', 'KeyW');
        window.dispatchEvent(new Event('blur'));
        check(filter.getStats().heldKeys === 0, 'Blur left held key');
        blurReleased = true;
        event('keydown', 'KeyW');
        filter.clear();
      }
      binding.sync();
      latest = filter.step({ ...time, speedMps: world.project('car').speed });
      controller.step(
        time,
        [{ identity: token, command: latest.command }],
        tick === 1 ? [{ identity: token, mode: 'MANUAL' }] : [],
        false,
      );
      if (tick === 632) {
        check(
          latest.command.throttle === 0 && latest.command.steering === 0,
          'Resume retained command',
        );
        resumedNeutral = true;
      }
      if (tick % 30 === 0)
        checkpoints.push({ tick, input: plain(latest), physical: plain(world.project('car')) });
      return undefined;
    },
  });
  const start = performance.now();
  try {
    loop.frame(await raf());
    while (tick < 660) {
      check(document.hasFocus() && !document.hidden, 'Protocol lost foreground');
      loop.frame(await raf());
      check(loop.getState().overloadCount === 0, 'Fixed tick overload');
      const state = world.project('car'),
        q = state.rotation;
      mesh.position.copyFromFloats(state.position.x, state.position.y, state.position.z);
      mesh.rotationQuaternion = new Quaternion(q.x, q.y, q.z, q.w);
      status.textContent = `${classId}: tick ${tick}/660. raw ${JSON.stringify(latest?.raw)}\nfiltered ${JSON.stringify(latest?.command)}`;
      backend.render();
    }
    check(editableReleased && blurReleased && resumedNeutral, 'Focus protocol incomplete');
    return {
      classId,
      ticks: tick,
      elapsedWallMs: performance.now() - start,
      checkpoints,
      editableReleased,
      blurReleased,
      resumedNeutral,
      overloadCount: loop.getState().overloadCount,
    };
  } finally {
    binding.dispose();
    loop.dispose();
    filter.dispose();
    controller.dispose();
    world.dispose();
    check(
      binding.getStats().listeners === 0 &&
        world.bodyResources().entities === 0 &&
        filter.getStats().heldKeys === 0,
      'Ownership cleanup failed',
    );
    mesh.dispose(false, true);
  }
}

document.getElementById('run')!.addEventListener('click', async () => {
  const button = document.getElementById('run') as HTMLButtonElement;
  button.disabled = true;
  finish.disabled = true;
  try {
    stopManual?.();
    owned?.dispose();
    trusted.presses = 0;
    trusted.releases = 0;
    trusted.editablePresses = 0;
    trusted.codes.clear();
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
    const camera = new FreeCamera('camera', new Vector3(30, 55, -35), owned.scene);
    camera.setTarget(new Vector3(0, 0, 35));
    owned.scene.activeCamera = camera;
    MeshBuilder.CreateGround('ground', { width: 150, height: 220 }, owned.scene);
    const classes: Awaited<ReturnType<typeof protocol>>[] = [];
    for (const [epoch, classId] of (['sedan', 'compact'] as const).entries())
      classes.push(await protocol(owned, classId, epoch));
    const world = await createRapierProbe();
    world.addClassCar('car', { x: 0, y: 0.8, z: 0 }, 'sedan');
    const context = {
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: '025-trusted',
      worldEpoch: 0,
    };
    const controller = createVehicleController(context, world),
      settings = createDefaultSettings('025-trusted'),
      filter = createKeyboardFilter(context, 'car', settings.input.control);
    const token = world.bodyIdentity('car')!;
    controller.register(token);
    const binding = bindKeyboardDriveInput({
      surface: canvas,
      bindings: settings.input.bindings,
      port: filter,
    });
    let tick = 0,
      manualFrames = 0,
      manualRawPress = false,
      manualFilteredPress = false,
      stopped = false;
    const mesh = MeshBuilder.CreateBox(
      'manual-car',
      { width: 1.7, height: 0.6, depth: 4 },
      owned.scene,
    );
    const loop = createFixedTickLoop({
      captureSnapshot: () => ({ tick }),
      interpolate: (_previous, current) => current,
      step(time) {
        tick = time.tick;
        binding.sync();
        const input = filter.step({ ...time, speedMps: world.project('car').speed });
        if (input.raw.throttle || input.raw.brake || input.raw.steering) manualRawPress = true;
        if (input.command.throttle || input.command.brake || input.command.steering)
          manualFilteredPress = true;
        controller.step(
          time,
          [{ identity: token, command: input.command }],
          tick === 1 ? [{ identity: token, mode: 'MANUAL' }] : [],
          false,
        );
        return undefined;
      },
    });
    stopManual = () => {
      if (stopped) return;
      stopped = true;
      binding.dispose();
      loop.dispose();
      filter.dispose();
      controller.dispose();
      world.dispose();
      mesh.dispose();
    };
    canvas.focus();
    status.textContent =
      'Automated DOM protocol PASS. On canvas hold W, S, A and D briefly, then type W in input. Finish exports only after real trusted keyboard events and filtered tick commands are observed.';
    finish.disabled = false;
    const animate = async () => {
      while (!stopped) {
        const timestamp = await raf();
        if (stopped) break;
        if (document.hidden || !document.hasFocus()) {
          binding.sync();
          loop.pause(timestamp, 'background');
          continue;
        }
        if (loop.getState().status === 'background') loop.resume(timestamp);
        loop.frame(timestamp);
        manualFrames++;
        const state = world.project('car');
        mesh.position.copyFromFloats(state.position.x, state.position.y, state.position.z);
        owned!.render();
      }
    };
    void animate();
    finish.onclick = async () => {
      try {
        check(
          trusted.presses >= 4 &&
            trusted.releases >= 4 &&
            trusted.codes.size === 4 &&
            trusted.editablePresses >= 1 &&
            manualRawPress &&
            manualFilteredPress,
          'Trusted keyboard checks incomplete; hold W/S/A/D on canvas, type W in field',
        );
        const engine = owned!.scene.getEngine(),
          manifest = (await (await fetch('/build-manifest.json')).json()) as {
            artifactHash: string;
          };
        const report = {
          fixtureVersion: '025-keyboard-drive-v1',
          identity: __KEYBOARD_BUILD__,
          artifactHash: manifest.artifactHash,
          createdAt: new Date().toISOString(),
          browser: navigator.userAgent,
          renderer: owned!.rendererKind,
          actualGpuInfo:
            'getInfo' in engine ? (engine as unknown as { getInfo(): unknown }).getInfo() : null,
          foreground: document.hasFocus() && !document.hidden,
          cssResolution: [canvas.clientWidth, canvas.clientHeight],
          internalResolution: [engine.getRenderWidth(), engine.getRenderHeight()],
          dpr: devicePixelRatio,
          classes,
          trusted: {
            presses: trusted.presses,
            releases: trusted.releases,
            editablePresses: trusted.editablePresses,
            codes: [...trusted.codes].sort(),
            manualFrames,
            manualRawPress,
            manualFilteredPress,
          },
          scope:
            'Real headed keyboard/filter/focus playtest. Automated DOM protocol plus trusted physical key events; no fleet FPS claim.',
        };
        stopManual!();
        const response = await fetch('/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(report),
        });
        check(response.ok, await response.text());
        status.textContent = `PASS ${owned!.rendererKind}: two-class keyboard DOM ramps/braking/highspeed/focus plus trusted keyboard press/hold/release/editable. Evidence saved.`;
        finish.disabled = true;
      } catch (error) {
        status.textContent = `FAILED finish: ${String(error)}`;
      }
    };
  } catch (error) {
    status.textContent = `FAILED: ${String(error)}`;
    console.error(error);
  } finally {
    button.disabled = false;
  }
});

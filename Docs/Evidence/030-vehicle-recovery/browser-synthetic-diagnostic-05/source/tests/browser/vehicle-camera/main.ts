import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import { createRenderingBackend } from '../../../src/rendering/babylon';
import { BabylonVehicleCamera } from '../../../src/rendering/babylon/vehicle-camera';
import { bindVehicleCameraInput } from '../../../src/rendering/babylon/vehicle-camera-input';
import type { BackendPreference } from '../../../src/rendering';
import type { CameraTarget } from '../../../src/rendering/vehicle-camera';
import { createDefaultSettings, createSettingsStore } from '../../../src/settings';
import { measure, counts, gpuInfo } from '../scene-adapter/baseline';
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const element = (id: string) => document.getElementById(id)!;

export async function runCameraProbe(preference: BackendPreference) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  canvas.tabIndex = 0;
  element('host').replaceChildren(canvas);
  const backend = await createRenderingBackend(canvas, preference),
    scene = backend.scene;
  const baseline = await measure(backend);
  const material = (name: string, color: Color3) => {
    const m = new StandardMaterial(name, scene);
    m.disableLighting = true;
    m.emissiveColor = color;
    return m;
  };
  const teal = material('teal', new Color3(0.1, 0.75, 0.55)),
    yellow = material('yellow', new Color3(0.95, 0.65, 0.1)),
    dark = material('cabin', new Color3(0.08, 0.12, 0.16)),
    red = material('obstacle', new Color3(0.75, 0.15, 0.1));
  function car(id: string, x: number) {
    const root = new TransformNode(id, scene);
    root.position.x = x;
    root.rotationQuaternion = Quaternion.Identity();
    const shell = CreateBox(id + '-exterior', { width: 1.7, height: 1.3, depth: 3 }, scene);
    shell.parent = root;
    shell.position.y = 0.7;
    shell.material = id === 'a' ? teal : yellow;
    const dash = CreateBox(id + '-dashboard', { width: 1.5, height: 0.25, depth: 0.4 }, scene);
    dash.parent = root;
    dash.position.set(0, 0.85, 0.95);
    dash.material = dark;
    const floor = CreateBox(id + '-floor', { width: 1.5, height: 0.1, depth: 2.6 }, scene);
    floor.parent = root;
    floor.position.y = 0.2;
    floor.material = dark;
    const steering = CreateBox(
      id + '-steering-marker',
      { width: 0.35, height: 0.3, depth: 0.08 },
      scene,
    );
    steering.parent = root;
    steering.position.set(-0.35, 0.9, 0.6);
    steering.material = id === 'a' ? teal : yellow;
    return { root, shell, dash, floor, steering };
  }
  const cars = { a: car('a', 0), b: car('b', 7) };
  const wall = CreateBox('wall', { width: 10, height: 4, depth: 0.2 }, scene);
  wall.position.set(0, 2, -4);
  wall.material = red;
  const road = CreateBox('road', { width: 60, height: 0.15, depth: 60 }, scene);
  road.position.y = -0.15;
  road.material = material('road', new Color3(0.25, 0.3, 0.33));
  const destination = CreateBox('forward-marker', { width: 1, height: 3, depth: 1 }, scene);
  destination.position.set(0, 1.5, 10);
  destination.material = yellow;
  const store = createSettingsStore(createDefaultSettings('camera-probe'));
  let speed = 30,
    distance = 6,
    selected: 'a' | 'b' = 'a',
    running = false,
    raf = 0,
    last = 0,
    captured = false,
    captureError: string | null = null;
  const preferenceView = () => ({
    mode: store.getSnapshot().input.cameraMode,
    fovDegrees: store.getSnapshot().input.control.fov,
    motion: store.getSnapshot().input.control.cameraMotion,
    distanceM: distance,
  });
  const camera = new BabylonVehicleCamera({
    scene,
    preferences: preferenceView(),
    obstacles: () => [wall, road, destination],
    exterior: (id) => [cars[id as 'a' | 'b'].shell],
  });
  camera.select('a');
  function target(): CameraTarget {
    const root = cars[selected].root,
      q = root.rotationQuaternion!,
      p = root.position;
    return Object.freeze({
      entityId: selected,
      incarnation: 'camera-probe-v1',
      speedMps: speed,
      driverEyeM: Object.freeze({ x: -0.35, y: 1.15, z: 0.2 }),
      transform: Object.freeze({
        positionM: Object.freeze({ x: p.x, y: p.y, z: p.z }),
        rotationQuaternion: Object.freeze({ x: q.x, y: q.y, z: q.z, w: q.w }),
      }),
    });
  }
  let latest = camera.update(target(), 1 / 60);
  const render = (dt = 1 / 60) => {
    latest = camera.update(target(), dt);
    backend.render();
    element('status').textContent =
      `${selected} · ${camera.controller.mode} · captured ${captured} · speed ${speed}m/s`;
    return latest;
  };
  const unbind = bindVehicleCameraInput({
    canvas: backend.canvas,
    captureButton: element('capture'),
    recenterButton: element('recenter'),
    controller: camera.controller,
    toggleCode: store.getSnapshot().input.bindings.camera,
    onModeChanged: (mode) => {
      const s = store.getSnapshot();
      store.replace({ ...s, input: { ...s.input, cameraMode: mode } });
    },
    onCaptureChanged: (value) => {
      captured = value;
      element('status').textContent = `captured ${captured}`;
    },
    onCaptureError: (error) => {
      captureError = String(error);
      element('status').textContent = `Capture error ${captureError}`;
    },
  });
  const handlers: readonly [string, () => void][] = [
    [
      'select',
      () => {
        selected = selected === 'a' ? 'b' : 'a';
        camera.select(selected);
        render();
      },
    ],
    [
      'turn',
      () => {
        cars[selected].root.rotationQuaternion = Quaternion.RotationYawPitchRoll(Math.PI / 2, 0, 0);
        render();
      },
    ],
    [
      'brake',
      () => {
        speed = 0;
        render();
      },
    ],
    [
      'impact',
      () => {
        cars[selected].root.position.z = -4;
        render();
      },
    ],
    [
      'reset',
      () => {
        for (const [id, car] of Object.entries(cars)) {
          car.root.position.set(id === 'a' ? 0 : 7, 0, 0);
          car.root.rotationQuaternion = Quaternion.Identity();
        }
        speed = 30;
        camera.controller.reset();
        render();
      },
    ],
  ];
  for (const [id, handler] of handlers) element(id).addEventListener('click', handler);
  const settingsChanged = () => {
    const s = store.getSnapshot(),
      fov = Number((element('fov') as HTMLInputElement).value),
      motion = Number((element('motion') as HTMLInputElement).value);
    distance = Number((element('distance') as HTMLInputElement).value);
    store.replace({
      ...s,
      input: {
        ...s.input,
        control: {
          ...s.input.control,
          version: s.input.control.version + 1,
          fov,
          cameraMotion: motion,
        },
      },
    });
    camera.setPreferences(preferenceView());
    render();
  };
  for (const id of ['fov', 'motion', 'distance'])
    element(id).addEventListener('input', settingsChanged);
  const authoritative = JSON.stringify(target());
  await scene.whenReadyAsync();
  const before = await measure(backend);
  const after = await measure(backend, () => camera.update(target(), 1 / 60));
  assert(JSON.stringify(target()) === authoritative, 'camera authority unchanged');
  const chase = camera.update(target(), 1 / 60)!;
  assert(chase.positionM.z > -3.7, 'wall shortens chase boom with sphere clearance');
  camera.setPreferences({ ...preferenceView(), mode: 'FIRST_PERSON', motion: 0 });
  const eye = camera.update(target(), 1 / 60)!;
  assert(
    Math.abs(eye.positionM.x + 0.35) < 1e-12 &&
      Math.abs(eye.positionM.y - 1.15) < 1e-12 &&
      Math.abs(eye.positionM.z - 0.2) < 1e-12,
    'actual driver eye inside vehicle envelope',
  );
  assert(!cars.a.shell.isVisible && cars.a.dash.isVisible, 'exterior hidden, interior preserved');
  assert(camera.camera.minZ === 0.05, 'near plane');
  const first = camera.camera.position.clone();
  camera.controller.look(120, 50);
  render();
  assert(camera.camera.position.equals(first), 'look cannot move eye');
  camera.controller.recenter();
  render();
  cars.a.root.rotationQuaternion = Quaternion.RotationYawPitchRoll(Math.PI / 2, 0, 0);
  render();
  assert(Math.abs(camera.camera.position.x - 0.2) < 1e-6, 'turn transforms seat');
  cars.a.root.rotationQuaternion = Quaternion.RotationYawPitchRoll(0, 0.3, 0.2);
  render();
  assert(latest !== null, 'impact orientation valid');
  cars.a.root.rotationQuaternion = Quaternion.Identity();
  cars.a.root.position.z = -4;
  render();
  assert(Math.abs(camera.camera.position.z + 4) > 0.299, 'impact wall penetration corrected');
  cars.a.root.position.z = 0;
  selected = 'b';
  camera.select('b');
  render();
  assert(cars.a.shell.isVisible && !cars.b.shell.isVisible, 'switch restores former exterior');
  selected = 'a';
  camera.select('a');
  camera.setPreferences(preferenceView());
  render();
  assert(cars.b.shell.isVisible, 'chase restores exterior');
  const beforeDisposal = counts(backend);
  const report = {
    pass: true,
    fixture: '017-camera-v1',
    backend: backend.rendererKind,
    preference,
    browser: navigator.userAgent,
    gpu: gpuInfo(backend),
    dpr: devicePixelRatio,
    resolution: [backend.canvas.width, backend.canvas.height],
    baseline,
    before,
    after,
    checks: [
      'chase obstacle radius',
      'driver eye inside cabin',
      'near plane',
      'selected exterior hidden/cabin visible',
      'look fixed eye',
      'turn',
      'impact rotation and penetration',
      'target switch authority untouched',
      'visibility restored',
    ],
    beforeDisposal,
  };
  element('result').textContent = JSON.stringify(report, null, 2);
  const frame = (now: number) => {
    if (!running) return;
    render(last ? Math.min(0.25, (now - last) / 1000) : 0);
    last = now;
    raf = requestAnimationFrame(frame);
  };
  const start = () => {
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  };
  const inspect = () => ({
    mode: camera.controller.mode,
    selected,
    captured,
    captureError,
    pointerLocked: document.pointerLockElement === backend.canvas,
    look: camera.controller.lookAngles,
    position: {
      x: camera.camera.position.x,
      y: camera.camera.position.y,
      z: camera.camera.position.z,
    },
    fov: camera.camera.fov,
    settingsMode: store.getSnapshot().input.cameraMode,
    shellVisible: cars[selected].shell.isVisible,
    interiorVisible: cars[selected].dash.isVisible,
    authority: target(),
    pose: latest,
  });
  const dispose = () => {
    running = false;
    cancelAnimationFrame(raf);
    unbind();
    for (const [id, handler] of handlers) element(id).removeEventListener('click', handler);
    for (const id of ['fov', 'motion', 'distance'])
      element(id).removeEventListener('input', settingsChanged);
    camera.dispose();
    assert(cars.a.shell.isVisible && cars.b.shell.isVisible, 'dispose restores visibility');
    backend.dispose();
  };
  start();
  return { report, inspect, render, dispose, camera, store };
}

// Built preview entry point: a frozen production fixture, separate from the application.
if (new URLSearchParams(location.search).has('autostart')) {
  const kind =
    new URLSearchParams(location.search).get('backend') === 'WEBGPU' ? 'WEBGPU' : 'WEBGL2';
  runCameraProbe(kind)
    .then((probe) => {
      Object.assign(window, { probe017: probe });
    })
    .catch((error: unknown) => {
      element('result').textContent = String(error);
      throw error;
    });
}

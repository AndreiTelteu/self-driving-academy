import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { createRenderingBackend } from '../../../src/rendering/babylon';
import { createDaylight } from '../../../src/rendering/babylon/daylight';
import type { QualityPreset } from '../../../src/rendering/quality-policy';
import type { BackendPreference } from '../../../src/rendering';
import { bootstrapProbe, measure, gpuInfo, counts } from '../scene-adapter/baseline';
let owned: { dispose(): void } | null = null;
export async function lightingProbe(
  preference: BackendPreference,
  preset: QualityPreset,
  dpr = devicePixelRatio,
) {
  Object.assign(window, { lightingStage: 'begin' });
  owned?.dispose();
  const canvas = document.createElement('canvas');
  canvas.style.width = '640px';
  canvas.style.height = '360px';
  canvas.width = 640;
  canvas.height = 360;
  document.querySelector('#host')!.replaceChildren(canvas);
  Object.assign(window, { lightingStage: 'backend initializing' });
  const backend = await createRenderingBackend(canvas, preference);
  Object.assign(window, { lightingStage: 'building scene' });
  const scene = backend.scene;
  scene.activeCamera!.position.set(12, 11, -16);
  (scene.activeCamera as FreeCamera).setTarget(new Vector3(0, 0, 5));
  const daylight = createDaylight(
    scene,
    { preset, preferredBackend: preference, resolutionScale: 1, adaptive: false },
    { width: 640, height: 360, dpr },
  );
  const road = MeshBuilder.CreateGround('road', { width: 9, height: 30 }, scene);
  road.material = daylight.material('road');
  road.receiveShadows = true;
  for (let i = 0; i < 8; i++) {
    const stripe = MeshBuilder.CreateBox(
      `center-${i}`,
      { width: 0.18, height: 0.012, depth: 1.5 },
      scene,
    );
    stripe.position.set(0, 0.012, -12 + i * 3.5);
    stripe.material = daylight.material('marking');
  }
  for (let i = 0; i < 7; i++) {
    const stripe = MeshBuilder.CreateBox(
      `crosswalk-${i}`,
      { width: 0.7, height: 0.014, depth: 1.8 },
      scene,
    );
    stripe.position.set(-3.6 + i * 1.2, 0.015, 5);
    stripe.material = daylight.material('marking');
  }
  const vehicle = MeshBuilder.CreateBox('vehicle', { width: 1.7, height: 1.3, depth: 3.8 }, scene);
  vehicle.position.set(-2.2, 0.7, 0);
  vehicle.material = daylight.material('vehicle');
  daylight.addShadowCaster(vehicle);
  const housing = MeshBuilder.CreateBox('signal', { width: 1.15, height: 3.2, depth: 0.6 }, scene);
  housing.position.set(4, 3.4, 5);
  housing.material = daylight.material('signalHousing');
  daylight.addShadowCaster(housing);
  for (const [index, color] of (['red', 'amber', 'green'] as const).entries()) {
    const lamp = MeshBuilder.CreateSphere(color, { diameter: 0.75, segments: 12 }, scene);
    lamp.position.set(4, 4.4 - index, 4.65);
    lamp.material = daylight.material(color);
  }
  Object.assign(window, { lightingStage: 'scene compiling' });
  await scene.whenReadyAsync();
  Object.assign(window, { lightingStage: 'measuring' });
  const startup = performance.now();
  backend.render();
  const firstRenderMs = performance.now() - startup;
  const report = {
    fixture: '016-road-signals-v1',
    preference,
    actualBackend: backend.rendererKind,
    preset,
    gpu: gpuInfo(backend),
    browser: navigator.userAgent,
    actualDeviceDpr: devicePixelRatio,
    quality: daylight.getQuality(),
    firstRenderMs,
    resources: daylight.getResourceCounts(),
    ...(await measure(backend)),
  };
  document.querySelector('#result')!.textContent = JSON.stringify(report, null, 2);
  owned = {
    dispose: () => {
      daylight.dispose();
      backend.dispose();
    },
  };
  Object.assign(window, { lightingCurrent: { daylight, backend, counts: () => counts(backend) } });
  return report;
}
Object.assign(window, { lightingBaseline: bootstrapProbe, lightingProbe });

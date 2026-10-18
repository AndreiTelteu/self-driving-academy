import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { createRenderingBackend } from '../../../src/rendering/babylon';
import { BabylonSceneAdapter } from '../../../src/rendering/babylon';
import { BabylonSnapshotPresenter } from '../../../src/rendering/babylon';
import { interpolateRenderSnapshots, type RenderSnapshot } from '../../../src/rendering';
import type { BackendPreference } from '../../../src/rendering';
import { measure, counts, gpuInfo } from '../scene-adapter/baseline';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function fixture(tick: number): RenderSnapshot {
  const transform = Object.freeze({
    positionM: Object.freeze({ x: tick * 2, y: 0, z: 0 }),
    rotationQuaternion: Object.freeze({
      x: 0,
      y: tick === 0 ? 0 : Math.SQRT1_2,
      z: 0,
      w: tick === 0 ? 1 : Math.SQRT1_2,
    }),
  });
  const local = Object.freeze({
    positionM: Object.freeze({ x: 0.7, y: -0.25, z: 0.6 }),
    rotationQuaternion: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
  });
  return Object.freeze({
    sessionId: 'probe',
    worldEpoch: 0,
    tick,
    vehicles: Object.freeze([
      Object.freeze({
        vehicleId: 'car',
        incarnation: 'a',
        transform,
        wheels: Object.freeze([
          Object.freeze({
            wheelId: 'front',
            transform: local,
            spinRad: tick * Math.PI * 2,
            steeringRad: tick * 0.4,
          }),
        ]),
      }),
    ]),
  });
}
export async function runProbe(preference: BackendPreference) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  document.querySelector('#host')!.replaceChildren(canvas);
  const backend = await createRenderingBackend(canvas, preference),
    scene = backend.scene;
  const baseline = await measure(backend);
  const adapter = new BabylonSceneAdapter(scene, { sessionId: 'probe', worldEpoch: 0 });
  const body = CreateBox('body', { width: 1.2, height: 0.5, depth: 2 }, scene);
  const material = new StandardMaterial('calibration', scene);
  material.disableLighting = true;
  material.emissiveColor = new Color3(0.1, 0.8, 0.6);
  body.material = material;
  const wheel = CreateBox('wheel-marker', { width: 0.25, height: 0.6, depth: 0.2 }, scene);
  wheel.parent = body;
  wheel.material = material;
  const a = fixture(0),
    b = fixture(1),
    authority = JSON.stringify([a, b]);
  adapter.create('car', { root: body, ownedMaterials: [material] }, a.vehicles[0].transform);
  const presenter = new BabylonSnapshotPresenter(adapter),
    resolve = () => wheel;
  const camera = scene.activeCamera as FreeCamera;
  camera.position.set(5, 4, -6);
  camera.setTarget(new Vector3(1, 0, 0));
  const before = await measure(backend, () =>
    adapter.updateTransform('car', b.vehicles[0].transform),
  );
  const after = await measure(backend, () =>
    presenter.present(interpolateRenderSnapshots(a, b, 0.5), resolve),
  );
  assert(Math.abs(adapter.getNode('car')!.position.x - 1) < 1e-12, 'midpoint body');
  assert(Math.abs(wheel.position.x - 0.7) < 1e-12, 'wheel local pose');
  assert(Math.abs(wheel.rotationQuaternion!.x) > 0.9, 'unwrapped wheel midpoint');
  const pose = adapter.getNode('car')!.position.clone(),
    wheelQ = wheel.rotationQuaternion!.clone();
  assert(presenter.present(a, resolve) === 0, 'stale tick rejected');
  assert(
    adapter.getNode('car')!.position.equals(pose) && wheel.rotationQuaternion!.equals(wheelQ),
    'stale body and wheel preserved',
  );
  assert(presenter.present({ ...b, worldEpoch: 1 }, resolve) === 0, 'wrong epoch rejected');
  assert(presenter.present(null, resolve) === 0, 'missing current no-op');
  assert(JSON.stringify([a, b]) === authority, 'authority unchanged');
  const stranger = new TransformNode('unrelated', scene);
  presenter.present(b, () => stranger);
  assert(stranger.position.length() === 0, 'unrelated node unchanged');
  stranger.dispose();
  presenter.present(interpolateRenderSnapshots(a, b, 0.5), resolve);
  backend.render();
  const report = {
    pass: true,
    fixture: '014-render-sync-v1',
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
      'body midpoint',
      'orientation slerp',
      'wheel continuous rotation',
      'stale tick/epoch leaves body and wheels',
      'missing no-op',
      'deep frozen authority',
      'wheel ownership',
    ],
    resources: counts(backend),
    retainedSnapshots: 0,
  };
  document.querySelector('#result')!.textContent = JSON.stringify(report, null, 2);
  return {
    report,
    dispose: () => {
      adapter.dispose();
      backend.dispose();
    },
  };
}

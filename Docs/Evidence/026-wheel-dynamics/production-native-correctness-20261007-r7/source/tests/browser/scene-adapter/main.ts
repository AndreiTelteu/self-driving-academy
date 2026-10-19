import {
  BabylonSceneAdapter,
  createRenderingBackend,
  type VisualRepresentation,
} from '../../../src/rendering/babylon';
import type {
  BackendPreference,
  VisualTransform,
  VisualVehicleState,
} from '../../../src/rendering';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { EngineStore } from '@babylonjs/core/Engines/engineStore';
import type { Scene } from '@babylonjs/core/scene';
import { counts, measure, gpuInfo } from './baseline';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function equal(a: unknown, b: unknown, message: string) {
  assert(JSON.stringify(a) === JSON.stringify(b), message);
}
function throws(action: () => unknown, message: string) {
  let rejected = false;
  try {
    action();
  } catch {
    rejected = true;
  }
  assert(rejected, message);
}
const identity = { sessionId: 'calibration', worldEpoch: 0 };
const origin: VisualTransform = Object.freeze({
  positionM: Object.freeze({ x: 0, y: 0, z: 0 }),
  rotationQuaternion: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
});
function box(scene: Scene, name: string, shared?: StandardMaterial): VisualRepresentation {
  const root = new TransformNode(name, scene);
  const mesh = CreateBox(`${name}-body`, { width: 1, height: 0.5, depth: 2 }, scene);
  mesh.parent = root;
  mesh.position.y = 0.25;
  const material = shared ?? new StandardMaterial(`${name}-material`, scene);
  material.disableLighting = true;
  material.diffuseColor = new Color3(0.1, 0.8, 0.6);
  material.emissiveColor = material.diffuseColor;
  mesh.material = material;
  return { root, ownedMaterials: shared ? [] : [material] };
}

/** Real Babylon lifecycle, calibration and rejection checks; no gameplay resources. */
export async function lifecycleProbe(preference: BackendPreference, keep = false) {
  const enginesBefore = EngineStore.Instances.length;
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  document.querySelector('#host')!.replaceChildren(canvas);
  const backend = await createRenderingBackend(canvas, preference);
  const scene = backend.scene;
  const camera = scene.activeCamera as FreeCamera;
  camera.position.set(5, 5, -8);
  camera.setTarget(new Vector3(0, 0, 1));
  // Allocate Babylon's lazy shared default before the resource baseline.
  void scene.defaultMaterial;
  const before = counts(backend);
  const adapter = new BabylonSceneAdapter(scene, identity);
  const adapterBaseline = counts(backend);
  const checks: string[] = [];
  const mark = (name: string) => checks.push(name);
  const transform: VisualTransform = Object.freeze({
    positionM: Object.freeze({ x: 2, y: 1, z: 3 }),
    rotationQuaternion: Object.freeze({ x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }),
  });
  const state: VisualVehicleState = Object.freeze({
    ...identity,
    vehicleId: 'car',
    tick: 10,
    transform,
  });
  const immutable = JSON.stringify(state);
  const first = box(scene, 'first');
  // Local pivot survives replacement; the entity origin remains the authoritative origin.
  first.root.setPivotPoint(new Vector3(0.2, 0, 0));
  const node = adapter.create('car', first, origin);
  assert(node.parent === adapter.root && first.root.parent === node, 'stable parent chain');
  assert(adapter.presentVehicle(state), 'live state');
  equal(node.position.asArray(), [2, 1, 3], 'metres and Y-up');
  equal(
    node.rotationQuaternion!.asArray(),
    [0, Math.SQRT1_2, 0, Math.SQRT1_2],
    'quaternion copied',
  );
  equal(node.getPivotPoint().asArray(), [0, 0, 0], 'entity pivot at origin');
  node.computeWorldMatrix(true);
  const forward = Vector3.TransformNormal(new Vector3(0, 0, 1), node.getWorldMatrix());
  assert(Math.abs(forward.x - 1) < 1e-6 && Math.abs(forward.z) < 1e-6, '+Z rotates to +X');
  const child = first.root.getChildMeshes()[0];
  child.computeWorldMatrix(true);
  const expected = Vector3.TransformCoordinates(
    child.position,
    first.root.computeWorldMatrix(true),
  );
  assert(
    Vector3.Distance(child.getAbsolutePosition(), expected) < 1e-6,
    'representation pivot composition',
  );
  assert(adapter.entityIdFor(child) === 'car', 'descendant picking');
  mark('pose/quaternion/pivot/descendant mapping');
  const second = box(scene, 'second');
  adapter.replace('car', second);
  assert(adapter.getNode('car') === node && first.root.isDisposed(), 'replacement stable node');
  equal(node.position.asArray(), [2, 1, 3], 'replacement preserves pose');
  equal(JSON.stringify(state), immutable, 'immutable domain');
  mark('replacement/domain immutability');
  const duplicate = box(scene, 'duplicate');
  throws(() => adapter.create('car', duplicate, origin), 'duplicate ID rejected');
  assert(duplicate.root.parent === null, 'failed candidate remains caller-owned');
  duplicate.root.dispose(false, false);
  duplicate.ownedMaterials![0].dispose(false, false);
  const invalid = box(scene, 'invalid');
  invalid.root.parent = adapter.root;
  throws(() => adapter.replace('car', invalid), 'attached replacement rejected');
  assert(
    adapter.getNode('car') === node && second.root.parent === node && !second.root.isDisposed(),
    'failure leaves previous representation live',
  );
  invalid.root.dispose(false, false);
  invalid.ownedMaterials![0].dispose(false, false);
  throws(() => adapter.replace('car', second), 'same/owned candidate rejected');
  const duplicateResources = box(scene, 'duplicate-resources');
  throws(
    () =>
      adapter.replace('car', {
        ...duplicateResources,
        ownedMaterials: [
          duplicateResources.ownedMaterials![0],
          duplicateResources.ownedMaterials![0],
        ],
      }),
    'duplicate owned materials rejected',
  );
  duplicateResources.root.dispose(false, false);
  duplicateResources.ownedMaterials![0].dispose(false, false);
  const exclusiveReuse = box(
    scene,
    'exclusive-reuse',
    second.ownedMaterials![0] as StandardMaterial,
  );
  throws(() => adapter.replace('car', exclusiveReuse), 'exclusive material reuse rejected');
  exclusiveReuse.root.dispose(false, false);
  assert(!second.root.isDisposed(), 'exclusive rejection preserves previous visual');
  const dead = box(scene, 'dead');
  dead.root.dispose(false, false);
  throws(() => adapter.replace('car', dead), 'disposed rejected');
  dead.ownedMaterials![0].dispose(false, false);
  const foreignCanvas = document.createElement('canvas');
  const foreignBackend = await createRenderingBackend(foreignCanvas, 'WEBGL2');
  const foreign = box(foreignBackend.scene, 'foreign');
  throws(() => adapter.replace('car', foreign), 'foreign scene rejected');
  const borrowedForeign = box(
    scene,
    'borrowed-foreign',
    foreign.ownedMaterials![0] as StandardMaterial,
  );
  throws(() => adapter.replace('car', borrowedForeign), 'foreign shared material rejected');
  borrowedForeign.root.dispose(false, false);
  foreignBackend.dispose();
  const deadShared = new StandardMaterial('dead-shared', scene);
  deadShared.dispose();
  const borrowedDead = box(scene, 'borrowed-dead', deadShared);
  throws(() => adapter.replace('car', borrowedDead), 'disposed shared material rejected');
  borrowedDead.root.dispose(false, false);
  const badTexture = RawTexture.CreateRGBATexture(
    new Uint8Array([255, 0, 0, 255]),
    1,
    1,
    scene,
    false,
  );
  badTexture.dispose();
  const textureMaterial = new StandardMaterial('bad-texture-material', scene);
  textureMaterial.diffuseTexture = badTexture;
  const borrowedBadTexture = box(scene, 'borrowed-bad-texture', textureMaterial);
  throws(() => adapter.replace('car', borrowedBadTexture), 'disposed shared texture rejected');
  borrowedBadTexture.root.dispose(false, false);
  textureMaterial.dispose(false, false);
  throws(
    () => adapter.updateTransform('car', { ...origin, positionM: { x: NaN, y: 0, z: 0 } }),
    'NaN rejected',
  );
  equal(node.position.asArray(), [2, 1, 3], 'invalid pose atomic');
  mark('duplicate/attached/disposed/foreign/invalid rejection');
  assert(!adapter.presentVehicle({ ...state, tick: 9, transform: origin }), 'stale tick rejected');
  assert(!adapter.presentVehicle({ ...state, sessionId: 'old' }), 'stale session rejected');
  assert(!adapter.presentVehicle({ ...state, worldEpoch: 1 }), 'wrong epoch rejected');
  adapter.remove('car');
  assert(!adapter.remove('car'), 'remove idempotent');
  adapter.create('car', box(scene, 'reused'), origin);
  assert(!adapter.presentVehicle(state), 'removed/reused same epoch rejects old pose');
  assert(adapter.presentVehicle({ ...state, tick: 11 }), 'reused ID accepts newer pose');
  adapter.remove('car');
  equal(counts(backend), adapterBaseline, 'exclusive resources restored');
  const shared = new StandardMaterial('shared', scene);
  shared.disableLighting = true;
  const texture = RawTexture.CreateRGBATexture(
    new Uint8Array([255, 255, 255, 255]),
    1,
    1,
    scene,
    false,
  );
  shared.diffuseTexture = texture;
  adapter.create('a', box(scene, 'a', shared), origin);
  adapter.create('b', box(scene, 'b', shared), origin);
  adapter.replace('a', box(scene, 'a2', shared));
  adapter.remove('a');
  assert(scene.materials.includes(shared) && scene.textures.includes(texture), 'shared survive');
  assert(!adapter.getNode('b')!.isDisposed(), 'other representation survives');
  adapter.remove('b');
  shared.dispose(false, false);
  texture.dispose();
  equal(counts(backend), adapterBaseline, 'shared caller cleanup');
  mark('shared material/texture preservation');
  const capacity = new BabylonSceneAdapter(scene, identity, 1);
  capacity.create('one', box(scene, 'one'), origin);
  capacity.create('two', box(scene, 'two'), origin);
  capacity.presentVehicle({ ...state, vehicleId: 'one' });
  throws(
    () => capacity.presentVehicle({ ...state, vehicleId: 'two' }),
    'identity history capacity enforced',
  );
  throws(() => capacity.reset(identity), 'same epoch reset rejected');
  capacity.dispose();
  equal(counts(backend), adapterBaseline, 'bounded identity registry cleanup');
  scene.useRightHandedSystem = true;
  throws(() => new BabylonSceneAdapter(scene, identity), 'right handed scene rejected');
  scene.useRightHandedSystem = false;
  mark('bounded identity history/right-handed scene rejection');
  for (let cycle = 0; cycle < 20; cycle++) {
    const owned = box(scene, `cycle-${cycle}`);
    const tex = RawTexture.CreateRGBATexture(new Uint8Array([255, 0, 0, 255]), 1, 1, scene, false);
    (owned.ownedMaterials![0] as StandardMaterial).diffuseTexture = tex;
    adapter.create('cycle', { ...owned, ownedTextures: [tex] }, origin);
    adapter.replace('cycle', box(scene, 'replacement'));
    adapter.remove('cycle');
    adapter.remove('cycle');
    equal(counts(backend), adapterBaseline, `cycle ${cycle} baseline`);
  }
  mark('20 create/replace/remove cycles restore node/mesh/material/texture/geometry counts');
  adapter.create('car', box(scene, 'reset-old'), origin);
  adapter.reset({ ...identity, worldEpoch: 1 });
  adapter.create('car', box(scene, 'reset-new'), origin);
  assert(!adapter.presentVehicle(state), 'old identity after reuse');
  assert(adapter.presentVehicle({ ...state, worldEpoch: 1, tick: 0 }), 'new identity reused ID');
  mark('reset/identity reuse');
  adapter.dispose();
  adapter.dispose();
  const after = counts(backend);
  equal(after, before, 'adapter full cleanup');
  throws(() => adapter.create('late', box(scene, 'late'), origin), 'disposed adapter rejected');
  // Remove the caller-owned failed candidate created above.
  const late = scene.getTransformNodeByName('late');
  late?.dispose(false, false);
  scene.getMaterialByName('late-material')?.dispose(false, false);
  mark('idempotent disposal');
  const calibration = new BabylonSceneAdapter(scene, identity);
  const body = box(scene, 'calibration-body');
  calibration.create('calibration', body, origin);
  const nose = CreateBox('forward-marker', { size: 0.2 }, scene);
  nose.parent = body.root;
  nose.position.z = 1;
  nose.position.y = 0.65;
  const marker = new StandardMaterial('marker', scene);
  marker.disableLighting = true;
  marker.diffuseColor = Color3.Red();
  marker.emissiveColor = marker.diffuseColor;
  nose.material = marker;
  // This fixture-only extra resource stays caller-owned.
  await scene.whenReadyAsync();
  backend.render();
  const report = {
    fixture: '013-lifecycle-v1',
    backend: backend.rendererKind,
    gpu: gpuInfo(backend),
    checks,
    cycles: 20,
    before,
    adapterBaseline,
    after,
    domainUnchanged: JSON.stringify(state) === immutable,
  };
  document.querySelector('#result')!.textContent = JSON.stringify(report, null, 2);
  if (keep)
    return {
      report,
      dispose: () => {
        calibration.dispose();
        marker.dispose();
        backend.dispose();
      },
    };
  calibration.dispose();
  marker.dispose();
  backend.dispose();
  assert(EngineStore.Instances.length === enginesBefore, 'engine cleanup');
  return { report };
}

export async function newCostProbe(preference: BackendPreference) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  document.querySelector('#host')!.replaceChildren(canvas);
  const backend = await createRenderingBackend(canvas, preference);
  void backend.scene.defaultMaterial;
  const baseline = counts(backend);
  const adapter = new BabylonSceneAdapter(backend.scene, identity);
  const poses: VisualTransform[] = [];
  for (let index = 0; index < 70; index++) {
    const pose = {
      ...origin,
      positionM: { x: (index % 10) - 5, y: 0, z: Math.floor(index / 10) * 3 },
    };
    poses.push(pose);
    adapter.create(`box-${index}`, box(backend.scene, `box-${index}`), pose);
  }
  const camera = backend.scene.activeCamera as FreeCamera;
  camera.position.set(15, 18, -20);
  camera.setTarget(new Vector3(0, 0, 9));
  await backend.scene.whenReadyAsync();
  const report = {
    fixture: '013-70-boxes-v1',
    backend: backend.rendererKind,
    gpu: gpuInfo(backend),
    ...(await measure(backend, () => {
      for (let index = 0; index < 70; index++)
        adapter.updateTransform(`box-${index}`, poses[index]);
    })),
    baseline,
    additionalEntities: 70,
  };
  adapter.dispose();
  equal(counts(backend), baseline, 'new cost cleanup');
  backend.dispose();
  return report;
}

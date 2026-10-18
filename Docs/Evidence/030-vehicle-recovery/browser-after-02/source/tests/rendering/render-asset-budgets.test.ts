import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { BabylonCellBatches } from '../../src/rendering/babylon/cell-batches';
import { VehiclePickingRegistry } from '../../src/rendering/babylon/vehicle-picking-registry';
import {
  RENDER_ASSET_CAPS,
  checkAssetManifest,
  admitAssetManifest,
  checkAssetUsage,
} from '../../src/rendering/asset-budgets';
import { analyzeRegistryGlb } from '../../src/rendering/babylon/asset-contract';
import { triangleGlb } from '../browser/asset-registry/glb-fixture';
import { checkVisualResources } from '../../src/rendering/quality-policy';

test('manifest rejects cumulative first-ride/decoder/GPU/shader budgets without confusing transfer with residency', () => {
  const asset = {
    id: 'triangle',
    firstRide: true,
    transferBytes: 1024,
    geometryGpuBytes: 4096,
    textureGpuBytes: 8192,
    shaderVariants: 1,
  };
  const manifest = {
    version: 'test',
    criticalCodeTransferBytes: 1024,
    decoderWasmBytes: 0,
    decoderWorkspaceBytes: 0,
    assets: [asset],
  };
  assert.equal(checkAssetManifest(manifest, 'LOW').accepted, true);
  const over = {
    ...manifest,
    decoderWasmBytes: RENDER_ASSET_CAPS.decoderWasmBytes + 1,
    assets: [
      {
        ...asset,
        transferBytes: RENDER_ASSET_CAPS.firstRideTransferBytes + 1,
        textureGpuBytes: RENDER_ASSET_CAPS.textureGpuBytes.LOW + 1,
      },
    ],
  };
  assert.deepEqual(
    checkAssetManifest(over, 'LOW').diagnostics.map((d) => d.metric),
    ['firstRideTransferBytes', 'decoderWasmBytes', 'textureGpuBytes'],
  );
  assert.throws(() => admitAssetManifest(over, 'LOW'), /over budget/);
  assert.throws(
    () => checkAssetManifest({ ...manifest, assets: [asset, asset] }, 'LOW'),
    /duplicate/,
  );
  assert.throws(
    () =>
      checkAssetManifest(
        {
          ...manifest,
          assets: Array.from({ length: 257 }, (_, i) => ({
            ...asset,
            id: `zero-${i}`,
            transferBytes: 0,
            geometryGpuBytes: 0,
            textureGpuBytes: 0,
            shaderVariants: 0,
          })),
        },
        'LOW',
      ),
    /capacity/,
  );
  assert.equal(
    checkVisualResources('LOW', {
      textureDimension: 1025,
      transparentMeshes: 33,
      visualEffects: 17,
    }).diagnostics.length,
    3,
  );
  assert.throws(
    () => checkAssetManifest({ ...manifest, criticalCodeTransferBytes: NaN }, 'LOW'),
    /Invalid/,
  );
  const analysis = analyzeRegistryGlb(triangleGlb(true));
  assert.ok(analysis.textureGpuBytes > 0);
  assert.equal(analysis.decodedResourceBytes, analysis.geometryGpuBytes + analysis.textureGpuBytes);
  assert.equal(analysis.decoderWasmBytes, 0);
  assert.equal(
    checkAssetUsage(asset, {
      transferBytes: 1025,
      geometryGpuBytes: 4000,
      textureGpuBytes: 8000,
      decodeMs: 2001,
      shaderPrepareMs: 0,
      firstUseMs: 51,
    }).length,
    3,
  );
});

test('local LOD batches preserve picking after motion/removal/reorder, copy inputs and dispose owned resources', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const near = CreateBox('near', {}, scene),
    far = CreateBox('far', {}, scene);
  const material = new StandardMaterial('source', scene);
  near.material = far.material = material;
  near.setEnabled(false);
  far.setEnabled(false);
  const picking = new VehiclePickingRegistry(scene);
  const batches = new BabylonCellBatches(scene, picking);
  const instance = (entityId: string, x: number) => ({
    entityId,
    matrix: Matrix.Translation(x, 0, 0),
  });
  const inputs = [instance('a', 0), instance('b', 5)];
  batches.add({
    id: 'cars',
    cell: '0:0',
    source: near,
    distantSource: far,
    dynamic: true,
    instances: inputs,
  });
  inputs[0].matrix.setTranslationFromFloats(999, 0, 0);
  const host = scene.getMeshByName('batch:cars:near')! as Mesh;
  assert.notEqual(host.geometry, near.geometry);
  assert.notEqual(host.geometry, (scene.getMeshByName('batch:cars:far')! as Mesh).geometry);
  const hit = (index: number) =>
    picking.resolve({ hit: true, pickedMesh: host, thinInstanceIndex: index });
  assert.equal(hit(0), 'a');
  batches.update('cars', [instance('b', 50), instance('a', 55)]);
  assert.equal(hit(0), 'b');
  assert.equal(hit(1), 'a');
  batches.updateTransforms('cars', [Matrix.Translation(200, 0, 0), Matrix.Translation(205, 0, 0)]);
  assert.equal(hit(0), 'b');
  assert.equal(host.thinInstanceGetWorldMatrices()[0].getTranslation().x, 200);
  assert.throws(() => batches.updateTransforms('cars', [Matrix.Identity()]), /count/);
  assert.throws(() => batches.update('cars', [instance('x', NaN)]), /transform/);
  assert.equal(hit(0), 'b');
  batches.update('cars', [instance('a', 55)]);
  assert.equal(hit(0), 'a');
  assert.equal(hit(1), null);
  batches.updateLod(new Vector3(1000, 0, 0), 'LOW');
  assert.equal(host.isEnabled(), false);
  const farHost = scene.getMeshByName('batch:cars:far')!;
  assert.equal(farHost.isEnabled(), true);
  assert.equal(picking.resolve({ hit: true, pickedMesh: farHost, thinInstanceIndex: 0 }), 'a');
  batches.updateLod(new Vector3(55, 0, 0), 'LOW');
  assert.equal(host.isEnabled(), true);
  assert.equal(material.isFrozen, false);
  batches.dispose();
  batches.dispose();
  assert.equal(picking.size, 0);
  assert.equal(scene.meshes.length, 2);
  assert.equal(scene.materials.includes(material), true);
  picking.dispose();
  scene.dispose();
  engine.dispose();
});

test('two LOD hosts admit identity capacity atomically before changing any matrix/count', () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const source = CreateBox('source', {}, scene),
    far = CreateBox('far', {}, scene);
  const picking = new VehiclePickingRegistry(scene, { maxThinInstances: 4 }),
    batches = new BabylonCellBatches(scene, picking);
  const instances = [
    { entityId: 'a', matrix: Matrix.Identity() },
    { entityId: 'b', matrix: Matrix.Translation(2, 0, 0) },
  ];
  batches.add({ id: 'atomic', cell: '0', source, distantSource: far, dynamic: true, instances });
  const host = scene.getMeshByName('batch:atomic:near')! as Mesh;
  assert.throws(
    () =>
      batches.update('atomic', [
        ...instances,
        { entityId: 'c', matrix: Matrix.Translation(4, 0, 0) },
      ]),
    /capacity/,
  );
  assert.equal(host.thinInstanceCount, 2);
  assert.equal(picking.resolve({ hit: true, pickedMesh: host, thinInstanceIndex: 1 }), 'b');
  batches.dispose();
  picking.dispose();
  scene.dispose();
  engine.dispose();
});

test('LOD retains near detail when a large scaled source reaches the camera', () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const source = CreateBox('large', { size: 100 }, scene);
  source.setEnabled(false);
  const picking = new VehiclePickingRegistry(scene),
    batches = new BabylonCellBatches(scene, picking);
  batches.add({
    id: 'large',
    cell: '0',
    source,
    distantSource: source,
    dynamic: false,
    instances: [{ entityId: null, matrix: Matrix.Scaling(2, 2, 2) }],
  });
  batches.updateLod(new Vector3(100, 0, 0), 'LOW');
  assert.equal(scene.getMeshByName('batch:large:near')!.isEnabled(), true);
  batches.updateLod(new Vector3(1000, 0, 0), 'LOW');
  assert.equal(scene.getMeshByName('batch:large:far')!.isEnabled(), true);
  batches.dispose();
  picking.dispose();
  scene.dispose();
  engine.dispose();
});

test('twenty static material lifecycle cycles plateau; capacity admission preserves existing batches', () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const source = CreateBox('source', {}, scene),
    material = new StandardMaterial('shared', scene);
  source.material = material;
  source.setEnabled(false);
  const picking = new VehiclePickingRegistry(scene),
    batches = new BabylonCellBatches(scene, picking);
  for (let cycle = 0; cycle < 20; cycle++) {
    batches.add({
      id: 'decor',
      cell: '0:0',
      source,
      dynamic: false,
      staticMaterial: true,
      instances: [{ entityId: null, matrix: Matrix.Identity() }],
    });
    assert.equal(batches.metrics.frozenMaterials, 1);
    assert.throws(() => batches.update('decor', []), /dynamic/);
    assert.throws(
      () =>
        batches.add({
          id: 'oversized',
          cell: '0:0',
          source,
          dynamic: false,
          instances: Array.from({ length: 257 }, () => ({
            entityId: null,
            matrix: Matrix.Identity(),
          })),
        }),
      /capacity/,
    );
    batches.remove('decor');
    assert.equal(scene.meshes.length, 1);
    assert.equal(scene.materials.length, 1);
    assert.equal(picking.size, 0);
  }
  batches.dispose();
  picking.dispose();
  scene.dispose();
  engine.dispose();
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { characterRestPivots, createCharacterAsset } from '../../src/character';
import {
  CHARACTER_MATERIALS,
  CHARACTER_VERTEX_BYTES,
  CHARACTER_VISUAL_LODS,
  admitCharacterAssets,
  buildCharacterVisual,
  characterAssetBudget,
  characterAssetInventory,
  characterAssetManifest,
  characterDrawCalls,
  characterMaterial,
  characterPartGroup,
  characterVisualAlignment,
} from '../../src/rendering';

const asset = createCharacterAsset();

test('descrierea de mesh-uri stă exact pe pivoturile contractului', () => {
  assert.deepEqual(characterVisualAlignment(asset), []);
  const pivots = new Map(
    characterRestPivots(asset.skeleton).map((pivot) => [pivot.joint, pivot.positionM]),
  );
  for (const lod of CHARACTER_VISUAL_LODS) {
    const description = buildCharacterVisual(asset, lod);
    assert.equal(description.version, '191-character-visuals-v1');
    assert.equal(description.assetId, asset.id);
    assert.equal(description.skeletonVersion, asset.skeleton.version);
    assert.equal(description.samplingHz, 60);
    assert.ok(description.parts.length > 0);
    for (const part of description.parts) {
      assert.deepEqual(part.pivotM, pivots.get(part.joint));
      assert.equal(part.group, characterPartGroup(part.joint));
      assert.deepEqual(part.color, characterMaterial(part.group).color);
      assert.ok(Number.isFinite(part.sizeM.x) && part.sizeM.x > 0);
      // A presentation part carries a joint pivot, never an entity transform.
      assert.equal('positionM' in part, false);
      assert.equal('entityId' in part, false);
    }
    assert.equal(description.drawCalls, new Set(description.parts.map((part) => part.group)).size);
    assert.equal(description.drawCalls, characterDrawCalls(lod));
    assert.equal(description.vertices, description.parts.length * 24);
    assert.equal(description.indices, description.parts.length * 36);
    assert.equal(
      description.gpuBytes,
      description.vertices * CHARACTER_VERTEX_BYTES + description.indices * 4,
    );
    assert.equal('positionM' in description, false);
  }
});

test('LOD-urile doar reduc detaliul: mai puține părți, mai puțini bytes, aceleași pivoturi', () => {
  const near = buildCharacterVisual(asset, 'NEAR');
  const mid = buildCharacterVisual(asset, 'MID');
  const far = buildCharacterVisual(asset, 'FAR');
  assert.equal(near.parts.length, 17);
  assert.equal(mid.parts.length, 14);
  assert.equal(far.parts.length, 7);
  assert.ok(near.gpuBytes > mid.gpuBytes && mid.gpuBytes > far.gpuBytes);
  assert.equal(near.materials.length, 4);
  assert.equal(far.materials.length, 3);
  const farJoints = new Set(far.parts.map((part) => part.joint));
  assert.ok(farJoints.has('head') && farJoints.has('pelvis') && farJoints.has('thigh-left'));
  assert.ok(!farJoints.has('hand-left'));
  assert.equal(new Set(CHARACTER_MATERIALS.map((material) => material.group)).size, 4);
});

test('manifestul procedural intră în bugetul de asseturi pentru toate preseturile', () => {
  const manifest = characterAssetManifest(asset);
  assert.equal(manifest.assets.length, 4);
  assert.equal(manifest.assets.filter((entry) => entry.transferBytes === 0).length, 4);
  assert.equal(manifest.assets.at(-1)!.id, `character:${asset.id}:materials`);
  assert.equal(manifest.assets.at(-1)!.shaderVariants, CHARACTER_MATERIALS.length * 2);
  for (const preset of ['LOW', 'MEDIUM', 'HIGH'] as const) {
    const budget = characterAssetBudget(asset, preset);
    assert.equal(budget.accepted, true);
    assert.deepEqual(budget.diagnostics, []);
    assert.ok(budget.totals.geometryGpuBytes > 0);
    assert.doesNotThrow(() => admitCharacterAssets(asset, preset));
  }
  const inventory = characterAssetInventory(asset);
  assert.equal(inventory.length, 4);
  assert.equal(inventory.filter((entry) => entry.type === 'PROCEDURAL_MESH').length, 3);
  assert.ok(inventory.every((entry) => entry.source.length > 0 && entry.license.length > 0));
  assert.ok(inventory.reduce((total, entry) => total + entry.costBytes, 0) > 0);
});

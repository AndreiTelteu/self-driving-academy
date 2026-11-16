import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SURFACE_TEXTURE_IDS,
  generateSurfaceTexture,
  surfaceTextureBytes,
  surfaceTextureSize,
} from '../../src/rendering/surface-textures';
import { SURFACE_PRESETS } from '../../src/rendering/quality-policy';
import { RENDER_ASSET_CAPS } from '../../src/rendering/asset-budgets';

const fingerprint = (data: Uint8Array): number => {
  let h = 2166136261;
  for (let i = 0; i < data.length; i += 7) h = Math.imul(h ^ data[i]!, 16777619);
  return h >>> 0;
};

test('245 textures are deterministic and sized from the preset base', () => {
  for (const id of SURFACE_TEXTURE_IDS) {
    const a = generateSurfaceTexture(id, 128);
    const b = generateSurfaceTexture(id, 128);
    const size = surfaceTextureSize(id, 128);
    assert.equal(a.width, size.width);
    assert.equal(a.height, size.height);
    assert.equal(a.albedo.length, size.width * size.height * 4);
    assert.equal(fingerprint(a.albedo), fingerprint(b.albedo), id);
  }
});

test('245 asphalt has real variation (not a flat colour) and unit normals', () => {
  const asphalt = generateSurfaceTexture('asphalt', 128);
  const values = new Set<number>();
  for (let i = 0; i < asphalt.albedo.length; i += 4) values.add(asphalt.albedo[i]!);
  assert.ok(values.size > 40, `distinct albedo levels ${values.size}`);
  const normal = asphalt.normal!;
  for (let i = 0; i < normal.length; i += 4 * 97) {
    const x = normal[i]! / 127.5 - 1;
    const y = normal[i + 1]! / 127.5 - 1;
    const z = normal[i + 2]! / 127.5 - 1;
    assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 0.03);
    assert.ok(z > 0.5);
  }
});

test('245 textures tile seamlessly: opposite edges are continuous', () => {
  for (const id of ['asphalt', 'sidewalk', 'grass'] as const) {
    const t = generateSurfaceTexture(id, 128);
    let edge = 0;
    let inner = 0;
    for (let y = 0; y < t.height; y += 1) {
      edge += Math.abs(
        t.albedo[y * t.width * 4 + 1]! - t.albedo[(y * t.width + t.width - 1) * 4 + 1]!,
      );
      inner += Math.abs(
        t.albedo[(y * t.width + 20) * 4 + 1]! - t.albedo[(y * t.width + 21) * 4 + 1]!,
      );
    }
    assert.ok(edge < inner * 2.5 + t.height * 4, `${id} seam ${edge} vs ${inner}`);
  }
});

test('245 texture memory stays within the 223 budgets on every preset', () => {
  for (const preset of ['LOW', 'MEDIUM', 'HIGH'] as const) {
    const bytes = surfaceTextureBytes(SURFACE_PRESETS[preset].baseSize);
    assert.ok(bytes < RENDER_ASSET_CAPS.textureGpuBytes[preset] / 4, `${preset} ${bytes}`);
  }
  assert.ok(
    surfaceTextureBytes(SURFACE_PRESETS.LOW.baseSize) <
      surfaceTextureBytes(SURFACE_PRESETS.HIGH.baseSize) / 10,
  );
  assert.equal(SURFACE_PRESETS.HIGH.anisotropy, 8);
});

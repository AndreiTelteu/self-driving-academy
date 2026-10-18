import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  nativeProductionBinding,
  NATIVE_AFTER,
} from '../browser/vehicle-recovery-after/native-after-binding.mjs';

const fixture = () => {
  const inputs = [
    { path: 'src/vehicles/recovery-state.ts', bytes: 42, sha256: 'a'.repeat(64) },
    { path: 'src/vehicles/rapier/recovery-shape-query.ts', bytes: 64, sha256: 'b'.repeat(64) },
    { path: 'tests/browser/vehicle-recovery-after.mjs', bytes: 10, sha256: 'c'.repeat(64) },
  ];
  return {
    sourceHash: NATIVE_AFTER.sourceHash,
    phase: 'AFTER',
    originalBeforeSourceHash: 'e7e5241caa9ef9c5ac1a27460defc9de679a86de3c6a3287eb8409fe3e27d755',
    native: { sha256: NATIVE_AFTER.nativeHash, bytes: 4340292 },
    inputs,
  };
};
const bind = (
  manifest,
  inputs,
  manifestHash = NATIVE_AFTER.manifestHash,
  nativeHash = NATIVE_AFTER.nativeHash,
) => nativeProductionBinding(manifest, inputs, manifestHash, nativeHash);

test('historical native proof binds every current production byte while explicitly permitting browser-only auxiliary changes', () => {
  const native = fixture();
  const build = structuredClone(native.inputs);
  build[2].sha256 = 'd'.repeat(64);
  build.push({
    path: 'tests/browser/vehicle-recovery-after/native-after-binding.mjs',
    bytes: 50,
    sha256: 'e'.repeat(64),
  });
  const result = bind(native, build);
  assert.equal(result.folder, NATIVE_AFTER.folder);
  assert.equal(result.validation, 'HISTORICAL_NATIVE_CAPTURE_WITH_BROWSER_PRODUCTION_BYTES');
  assert.equal(result.production.length, 2);
  assert.match(result.productionIdentity, /^[a-f0-9]{64}$/);
});

test('changed, omitted, added or duplicated production input cannot borrow a successful native capture', () => {
  const native = fixture();
  const changed = structuredClone(native.inputs);
  changed[0].sha256 = 'f'.repeat(64);
  const omitted = native.inputs.filter((row) => row.path !== native.inputs[0].path);
  const extra = [
    ...native.inputs,
    { path: 'src/vehicles/new-semantics.ts', bytes: 1, sha256: 'e'.repeat(64) },
  ];
  const duplicate = [...native.inputs, { ...native.inputs[0] }];
  for (const rows of [changed, omitted, extra, duplicate]) assert.throws(() => bind(native, rows));
});

test('wrong capture source, manifest bytes, native bytes or original baseline fail closed', () => {
  const native = fixture();
  assert.throws(() =>
    bind(
      { ...native, sourceHash: '261733c504a73abd2163ddd59031644e58ae550947a8566270d2dab8e7d5adce' },
      native.inputs,
    ),
  );
  assert.throws(() => bind(native, native.inputs, 'a'.repeat(64)));
  assert.throws(() => bind(native, native.inputs, NATIVE_AFTER.manifestHash, 'a'.repeat(64)));
  assert.throws(() => bind({ ...native, originalBeforeSourceHash: 'a'.repeat(64) }, native.inputs));
});

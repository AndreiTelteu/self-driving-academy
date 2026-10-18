import assert from 'node:assert/strict';
import {
  verifyBuild as verifyOriginalBuild,
  createStore,
} from '../vehicle-recovery-after/browser-store.mjs';
export { createStore };
export async function verifyBuild(path, historical = false) {
  const build = await verifyOriginalBuild(path, historical);
  assert.equal(build.fixtureRevision, '030-SYNTHETIC_DIAGNOSTIC_ONLY-v2');
  assert.match(
    build.buildUUID,
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  );
  assert.equal(
    build.functionalRoot,
    'Docs/Evidence/030-vehicle-recovery/browser-synthetic-diagnostic-02/functional',
  );
  for (const name of [
    'functional-runtime.ts',
    'next-open-boundary.ts',
    'browser-entry.ts',
    'browser.html',
    'build-binding.mjs',
  ]) {
    assert(
      build.inputs.some(
        (row) => row.path === 'tests/browser/vehicle-recovery-synthetic-diagnostic-v2/' + name,
      ),
    );
  }
  return build;
}

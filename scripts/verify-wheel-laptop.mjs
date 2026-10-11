import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPortableCapture } from '../tests/browser/wheel-dynamics-v2/ledger.mjs';
import {
  readCurrentNative,
  verifySuite,
} from '../tests/browser/wheel-dynamics-v2/numeric-reader.mjs';
import { verifyFrozenArchive } from './wheel-capture-source.mjs';

const [webgpuId, webgl2Id, output] = process.argv.slice(2);
assert(process.argv.length === 5, 'Explicit WebGPU ID, WebGL2 ID and fresh output JSON required');
for (const id of [webgpuId, webgl2Id]) assert(/^[a-f0-9-]{36}$/.test(id), 'Capture UUID required');
assert(
  output.startsWith('Docs/Evidence/026-laptop/') &&
    output.endsWith('.json') &&
    !output.includes('..'),
  'Output evidence boundary',
);
const root = 'Docs/Evidence/026-wheel-dynamics';
const directory = (id) => `${root}/laptop-20261011-browser/${id}`;
const native = await readCurrentNative();
let sourceHash;
for (const id of [webgpuId, webgl2Id]) {
  const capture = await readPortableCapture(directory(id));
  const binding = capture.start.binding;
  const archive = resolve(directory(id), '..', binding.archive);
  const manifest = JSON.parse(await readFile(resolve(archive, 'build-manifest.json')));
  await verifyFrozenArchive({
    inputs: manifest.inputs,
    sourceHash: manifest.sourceHash,
    artifacts: manifest.artifacts,
    root: resolve(archive, 'build'),
    archive,
    native: {
      ...native.after.native,
      resolvedPath: fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat')),
    },
  });
  assert.equal(binding.sourceHash, manifest.sourceHash);
  if (sourceHash) assert.equal(sourceHash, binding.sourceHash);
  sourceHash = binding.sourceHash;
}
const verification = await verifySuite({
  webgpu: directory(webgpuId),
  webgl2: directory(webgl2Id),
  beforeDirectory: `${root}/before`,
  afterDirectory: `${root}/${native.pins.afterCapture}`,
  // verifySuite independently retains the original curves; readCurrentNative above
  // validates the fresh calibration against those same curves and reviewed pins.
  calibrationPath: `${root}/calibration-v2.json`,
  budgetPath: 'Docs/performance-budgets.json',
  currentSourceHash: sourceHash,
  nativeReference: 'current',
});
const report = {
  checkedAt: new Date().toISOString(),
  webgpuId,
  webgl2Id,
  sourceHash,
  nativePins: native.pins,
  verification,
  scope:
    'Early wheel fixture on laptop; not integrated game, GPU timing, input latency or exact total memory.',
};
await writeFile(output, JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify(report, null, 2));
if (verification.state !== 'NUMERIC_PASS') process.exitCode = 1;

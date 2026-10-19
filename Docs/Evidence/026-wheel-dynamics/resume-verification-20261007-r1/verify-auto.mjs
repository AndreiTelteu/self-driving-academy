import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { readPortableCapture } from '../../../../tests/browser/wheel-dynamics-v2/ledger.mjs';
import { readCurrentNative, verifyCaptureNumbers, verifyProductionManifests } from '../../../../tests/browser/wheel-dynamics-v2/numeric-reader.mjs';
const base = 'Docs/Evidence/026-wheel-dynamics';
const folder = `${base}/resume-verification-20261007-r1`;
const startedAt = new Date().toISOString();
const sha = b => createHash('sha256').update(b).digest('hex');
try {
  const directory = `${base}/v2-captures-source-ownership-1/2bb1b5fd-8e9f-4ea4-923c-49f2f28e611c`;
  const capture = await readPortableCapture(directory);
  const binding = capture.start.binding;
  assert.equal(binding.sourceHash, '7a3c2ca0c48e63ecd7b2bcc1edcb8658f2a4710b2c5203f77d775adc0230f3e8');
  assert.equal(binding.artifactHash, '8ce69f98824feb6fe39569fc2688656518ab1cc99717750f71a0be515a29f2f4');
  assert.equal(binding.captureId, '2bb1b5fd-8e9f-4ea4-923c-49f2f28e611c');
  assert.equal(binding.requestedBackend, 'AUTO');
  assert.equal(capture.backend.dto.renderer, 'WEBGPU');
  const current = await readCurrentNative();
  assert.deepEqual(binding.currentNative, current.pins);
  const archive = resolve(directory, '..', binding.archive, 'source');
  const browserInputs = [];
  for (const path of binding.inputs.filter(p => p.startsWith('src/'))) {
    const hash = sha(await readFile(resolve(archive, path)));
    assert.equal(current.after.inputs.find(i => i.path === path)?.sha256, hash, path);
    browserInputs.push({path, sha256: hash});
  }
  verifyProductionManifests(browserInputs, current.after.inputs, current.calibration.inputs);
  const budgets = JSON.parse(await readFile('Docs/performance-budgets.json', 'utf8'));
  assert.equal(budgets.budgetVersion, '203-initial-1');
  const numbers = verifyCaptureNumbers(capture, budgets);
  const result = {state: 'SINGLE_BACKEND_NUMERIC_PASS', startedAt, completedAt: new Date().toISOString(), captureId: binding.captureId, sourceHash: binding.sourceHash, artifactHash: binding.artifactHash, currentNativeBinding: current.pins, ...numbers, remaining: 'WEBGL2 full capture and BOTH verifySuite; no PBI completion'};
  await writeFile(`${folder}/result.json`, JSON.stringify(result, null, 2), {flag: 'wx'});
  console.log(JSON.stringify(result));
} catch (error) {
  await writeFile(`${folder}/failure.json`, JSON.stringify({state:'FAIL', startedAt, completedAt:new Date().toISOString(), error:String(error), stack:error?.stack}, null, 2), {flag:'wx'});
  throw error;
}

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const directory = 'Docs/Evidence/223-render-assets';
const measured = JSON.parse(await readFile(`${directory}/measured-build-manifest.json`, 'utf8'));
const current = JSON.parse(await readFile(`${directory}/build-manifest.json`, 'utf8'));
assert.deepEqual(current.inputs, measured.inputs);
const reconstructed = createHash('sha256');
const currentDigest = createHash('sha256');
for (const input of current.inputs) {
  const bytes = await readFile(input);
  currentDigest.update(input).update(bytes);
  let original = bytes;
  if (input === 'tests/browser/render-asset-budgets/main.ts') {
    const text = bytes.toString();
    const corrected = 'cssResolution: [backend.canvas.clientWidth, backend.canvas.clientHeight],';
    assert.equal(text.split(corrected).length, 2);
    original = Buffer.from(
      text.replace(corrected, 'cssResolution: [canvas.clientWidth, canvas.clientHeight],'),
    );
  }
  if (input === 'scripts/render-asset-budgets-server.mjs') {
    const text = bytes.toString();
    const corrected =
      /compression:\s*'Uncompressed response bytes; conservative all emitted JS\+WASM, including Babylon lazy chunks\.',/;
    assert.ok(corrected.test(text));
    original = Buffer.from(
      text.replace(
        corrected,
        "compression: 'Uncompressed response bytes; conservative all emitted JS+WASM. No dynamic imports.',",
      ),
    );
  }
  reconstructed.update(input).update(original);
}
assert.equal(currentDigest.digest('hex'), current.sourceHash, 'Current runtime inputs changed');
assert.equal(
  reconstructed.digest('hex'),
  measured.sourceHash,
  'Change beyond post-measurement metadata',
);
const html = await readFile(`${directory}/measured-index.html`);
assert.equal(
  createHash('sha256').update(html).digest('hex'),
  measured.artifacts.find((entry) => entry.path === 'index.html').sha256,
);
assert.ok(/width:\s*1920px/.test(html.toString()) && /height:\s*1080px/.test(html.toString()));
const backends = [];
for (const backend of ['webgpu', 'webgl2']) {
  const report = JSON.parse(await readFile(`${directory}/${backend}.json`, 'utf8'));
  const smoke = JSON.parse(await readFile(`${directory}/${backend}-smoke.json`, 'utf8'));
  assert.ok([measured.sourceHash, current.sourceHash].includes(report.identity.sourceHash));
  assert.equal(smoke.identity.sourceHash, current.sourceHash);
  assert.deepEqual(
    report.cssResolution,
    report.identity.sourceHash === measured.sourceHash ? [0, 0] : [1920, 1080],
  );
  assert.deepEqual(smoke.cssResolution, [1920, 1080]);
  assert.equal(smoke.runs.length, 20);
  for (const run of [...report.runs, ...smoke.runs]) {
    assert.equal(run.quality.preset, 'MEDIUM');
    assert.equal(run.quality.internalWidth, 1920);
    assert.equal(run.quality.internalHeight, 1080);
    assert.deepEqual(run.diagnostics, []);
  }
  for (const loading of smoke.loading) assert.deepEqual(loading.diagnostics, []);
  assert.deepEqual(smoke.cleanup.before, smoke.cleanup.after);
  backends.push({
    backend: report.backend,
    measurementSourceHash: report.identity.sourceHash,
    measuredCssField: report.cssResolution,
    independentlyVerifiedCss: smoke.cssResolution,
  });
}
const evidence = {
  schemaVersion: 1,
  measuredSourceHash: measured.sourceHash,
  currentSourceHash: current.sourceHash,
  rendererAndTimedWorkloadUnchanged: true,
  changes: [
    'CSS getter in report serialization AFTER all measured loops and cleanup uses live backend.canvas instead of detached original canvas.',
    'Build-manifest compression description acknowledges Babylon lazy chunks. All emitted JS/WASM counted in both builds.',
  ],
  verification:
    'Reversing exactly these two text changes reconstructs the complete measured runtime-input SHA256. No other source/input changed. Original full reports remain unedited; actual CSS is verified by the original hashed HTML, four warmup screenshots and corrected real-backend smokes.',
  backends,
};
await writeFile(`${directory}/metadata-correction.json`, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));

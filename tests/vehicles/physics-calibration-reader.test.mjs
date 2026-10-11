import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { verifyPhysicsCalibration } from '../../scripts/verify-physics-final.mjs';
import { digest } from '../../scripts/wheel-capture-source.mjs';

test('031 reader rejects role substitution, same-source autonomy and invalid terminal', async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), 'pbi031-reader-'));
  const fixture = resolve('Docs/Evidence/031-physics-calibration/capture-20261012-r4');
  try {
    await cp(fixture, temporary, { recursive: true });
    const original = await readFile(`${temporary}/matrix.json`);
    await t.test('missing reference cannot be replaced with a second player', async () => {
      const matrix = JSON.parse(original);
      matrix.runs[0].kind = 'player';
      await writeFile(`${temporary}/matrix.json`, JSON.stringify(matrix));
      await assert.rejects(verifyPhysicsCalibration(temporary), /Wrong player count/);
    });
    await t.test('same PLAYER source cannot certify AUTONOMY', async () => {
      const matrix = JSON.parse(original);
      const entry = matrix.runs.find((run) => run.kind === 'autonomy');
      const rawOriginal = await readFile(`${temporary}/${entry.file}`);
      const run = JSON.parse(gunzipSync(rawOriginal));
      run.source = 'PLAYER';
      const raw = gzipSync(JSON.stringify(run));
      entry.sha256 = digest(raw);
      entry.bytes = raw.length;
      entry.summary.source = 'PLAYER';
      await writeFile(`${temporary}/${entry.file}`, raw);
      await writeFile(`${temporary}/matrix.json`, JSON.stringify(matrix));
      await assert.rejects(verifyPhysicsCalibration(temporary), /PLAYER.*AUTONOMY/s);
      await writeFile(`${temporary}/${entry.file}`, rawOriginal);
    });
    await t.test('terminal hash mismatch cannot certify an otherwise valid matrix', async () => {
      await writeFile(`${temporary}/matrix.json`, original);
      const terminal = JSON.parse(await readFile(`${temporary}/terminal.json`));
      terminal.matrixHash = '0'.repeat(64);
      await writeFile(`${temporary}/terminal.json`, JSON.stringify(terminal));
      await assert.rejects(verifyPhysicsCalibration(temporary), /matrixHash/);
    });
  } finally {
    assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
    await rm(temporary, { recursive: true });
  }
});

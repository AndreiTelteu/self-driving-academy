import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { CURRENT_NATIVE_REFERENCE as pins } from './current-native-reference.mjs';
import { pairedEvidenceHash, readMatchedNative } from './native-paired-reader.mjs';

test('matched native reader checks pinned raw samples, runtime and cleanup', async () => {
  const after = JSON.parse(
    await readFile(`Docs/Evidence/026-wheel-dynamics/${pins.afterCapture}/node.json`),
  );
  const budgets = JSON.parse(await readFile('Docs/performance-budgets.json'));
  assert.equal((await readMatchedNative('.', pins, after, budgets)).pairs.length, 5);
  await assert.rejects(
    readMatchedNative('.', pins, { ...after, runtime: 'v0.0.0' }, budgets),
    /Matched runtime/,
  );
  const root = await mkdtemp(resolve(tmpdir(), 'pbi026-paired-reader-'));
  const directory = resolve(root, 'Docs/Evidence/026-wheel-dynamics', pins.pairedCapture);
  try {
    await cp(`Docs/Evidence/026-wheel-dynamics/${pins.pairedCapture}`, directory, {
      recursive: true,
    });
    const path = resolve(directory, 'run-0.json');
    const run = JSON.parse(await readFile(path));
    run.cleanup.bodies.entities = 1;
    await writeFile(path, JSON.stringify(run));
    await assert.rejects(
      readMatchedNative(root, pins, after, budgets),
      /Pinned raw paired evidence/,
    );
    const alteredPins = { ...pins, pairedHash: await pairedEvidenceHash(directory) };
    await assert.rejects(
      readMatchedNative(root, alteredPins, after, budgets),
      /Expected values to be strictly deep-equal/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

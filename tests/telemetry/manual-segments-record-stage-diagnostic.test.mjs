import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  derive,
  exactReplace,
} from '../../scripts/prepare-manual-segments-record-stage-diagnostic.mjs';
import {
  resetStages,
  enterStages,
  recordStage,
  finishStages,
} from '../../scripts/manual-segments-record-stage-observer.mjs';
test('stage observer preserves result/falsy throws and bounded inclusive nested counts; OFF time is null', () => {
  resetStages();
  enterStages(false, 181);
  assert.equal(
    recordStage('bridge', () => recordStage('bytewalk', () => 42)),
    42,
  );
  let failed = false;
  try {
    recordStage('append', () => {
      throw undefined;
    });
  } catch (e) {
    failed = true;
    assert.equal(e, undefined);
  }
  assert(failed);
  const row = finishStages();
  assert.equal(row.counts.bridge[0], 1);
  assert.equal(row.counts.bytewalk[0], 1);
  assert.equal(row.counts.append[0], 1);
  assert.equal(row.times.bridge, null);
  assert.equal(row.ownedBytes, 76800);
});
test('derivation fails missing/duplicate anchors and actual admission copy leaves original untouched', async () => {
  assert.throws(() => exactReplace('x x', 'x', 'y'));
  assert.throws(() => exactReplace('x', 'z', 'y'));
  const path = 'src/telemetry/intervention-admission.ts';
  const original = await readFile(path, 'utf8');
  const result = await derive(path, original);
  assert(result.includes("recordStage('parse005'"));
  assert(result.includes("recordStage('cachehit'"));
  assert.equal(await readFile(path, 'utf8'), original);
});

import {
  validateProofRows,
  CHANGED_ROOTS,
} from '../../scripts/verify-manual-segments-record-stage-preflight.mjs';
import { guardCopyRuntime } from '../../scripts/manual-segments-record-stage-guard.mjs';
test('all seven actual derivation roots have one closed transform and missing anchors fail closed', async () => {
  for (const path of CHANGED_ROOTS) {
    const original = await readFile(path, 'utf8');
    const copied = await derive(path, original);
    assert.notEqual(copied, original);
    assert.equal(await readFile(path, 'utf8'), original);
  }
  assert.throws(() =>
    validateProofRows(
      { scope: 'INSTRUMENTED_COPY_ONLY_NO_ACCEPTANCE', inputs: [] },
      { inputs: [] },
    ),
  );
});
test('copy guard injected tampered-runtime exit and malformed proof preserve child diagnostics, never launches native', () => {
  assert.throws(
    () =>
      guardCopyRuntime(() => ({
        status: 1,
        signal: null,
        stdout: '',
        stderr: 'live copied byte mismatch',
      })),
    (error) => error.diagnostics.stderr === 'live copied byte mismatch',
  );
  assert.throws(
    () => guardCopyRuntime(() => ({ status: 0, signal: null, stdout: '{}', stderr: '' })),
    /output invalid/,
  );
});

import {
  validateOwnerCleanup,
  validateAbsoluteFlags,
} from '../../scripts/verify-manual-segments-record-stage-diagnostic.mjs';
test('actual failed03 diagnostic fixtures cannot hide heap/native owner cleanup or raw tick/Rapier violations', async () => {
  const actual = JSON.parse(
    await readFile(
      'Docs/Evidence/069-manual-segments/native-after-03/worlds/world-1.complete.json',
      'utf8',
    ),
  );
  validateOwnerCleanup(actual);
  const bad = structuredClone(actual);
  bad.cleanup.snapshots.body.entities = 1;
  assert.throws(() => validateOwnerCleanup(bad));
  const missing = structuredClone(actual);
  missing.cleanup.attempts.pop();
  assert.throws(() => validateOwnerCleanup(missing));
  const flags = {
    absoluteGateFlags: [
      {
        pair: 0,
        tickP95: actual.distributions.tickMs.p95,
        rapierP95: actual.distributions.rapierMs.p95,
        normalTickViolation: true,
        normalRapierViolation: false,
      },
    ],
  };
  validateAbsoluteFlags(flags, [actual]);
  assert.throws(() =>
    validateAbsoluteFlags(
      { absoluteGateFlags: [{ ...flags.absoluteGateFlags[0], normalTickViolation: false }] },
      [actual],
    ),
  );
  const slowRapier = structuredClone(actual);
  slowRapier.raw.rapierMs = Array(600).fill(4);
  assert.throws(() => validateAbsoluteFlags(flags, [slowRapier]));
});

import { verifyCopyBytes } from '../../scripts/verify-manual-segments-record-stage-preflight.mjs';
import { createHash } from 'node:crypto';
test('live runtime and durable source byte tampering both reject even when filename/length are unchanged', () => {
  const good = Buffer.from('approved byte'),
    bad = Buffer.from('altered byte!');
  const row = { bytes: good.length, sha256: createHash('sha256').update(good).digest('hex') };
  verifyCopyBytes(row, good, good);
  assert.throws(() => verifyCopyBytes(row, bad, good));
  assert.throws(() => verifyCopyBytes(row, good, bad));
});

// SOURCE DRAFT: unexecuted; pure ports only, no native/server/browser acquisition.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ownPresentationLatch,
  exportRunParts,
  verifyRafProof,
  verifyHeap,
  fixedTickFault,
  describeCause,
} from '../browser/vehicle-recovery/browser-observation.ts';
import { optionalVerdict, memorySummary } from '../browser/vehicle-recovery/browser-proof.ts';
import { createHistogram } from '../browser/vehicle-damage/hardware-collector.ts';
test('owned presentation latch retains async setup blur and hidden loss through refocus', async () => {
  const releases = [],
    listeners = new Map();
  const win = {
      addEventListener(k, f) {
        listeners.set(k, f);
      },
      removeEventListener(k) {
        listeners.delete(k);
      },
    },
    doc = { ...win, visibilityState: 'visible', hasFocus: () => true };
  const latch = ownPresentationLatch(win, doc, (_k, f) => releases.push(f));
  assert.equal(latch.lost, false);
  await Promise.resolve();
  listeners.get('blur')();
  assert.equal(latch.lost, true);
  doc.visibilityState = 'visible';
  listeners.get('visibilitychange')();
  assert.equal(latch.lost, true);
  for (const release of releases) release();
  assert.equal(listeners.size, 0);
  const hidden = ownPresentationLatch(win, { ...doc, visibilityState: 'hidden' }, () => {});
  assert.equal(hidden.lost, true);
});
test('original fixed-tick cause and nested successful cleanup diagnostics survive fault wrapping', () => {
  const original = new Error('actual step rejected');
  const state = { debtSeconds: 0.2, tick: 9 };
  const fault = fixedTickFault({ error: original, stage: 'step', attemptedTick: 10 }, state);
  assert.equal(fault.errors[0], original);
  const cleanup = Object.assign(new AggregateError([fault, new Error('dispose')], 'cleanup'), {
    diagnostics: { vehicles: 0, rendererMeshesAfter: 0 },
  });
  const description = describeCause(cleanup);
  assert.equal(description.causes[0].causes[0].message, 'Error: actual step rejected');
  assert.deepEqual(description.diagnostics, cleanup.diagnostics);
});
test('metadata precedes raw export; failed part never retries and remaining parts retain individual ACK proof', async () => {
  const calls = [];
  await assert.rejects(
    exportRunParts(
      { run: 0 },
      ['a', 'b', 'c'].map((id) => ({ id, part: { id } })),
      async (path, value) => {
        calls.push([path, value.partId ?? null]);
        if (value.partId === 'b') throw Error('HTTP rejected b');
        return { partId: value.partId };
      },
    ),
    (error) => {
      assert.deepEqual(error.diagnostics.attempted, ['a', 'b', 'c']);
      assert.deepEqual(error.diagnostics.acknowledged, ['a', 'c']);
      return true;
    },
  );
  assert.deepEqual(calls, [
    ['run-submitted', null],
    ['part', 'a'],
    ['part', 'b'],
    ['part', 'c'],
  ]);
  await assert.rejects(
    exportRunParts({}, [{ id: 'a', part: {} }], async () => ({ partId: 'wrong' })),
    /Rawexportfailed/,
  );
});
function frameProof() {
  const h = createHistogram();
  for (let i = 0; i < 7200; i++) h.add(1000 / 60);
  return {
    p: {
      previousMs: 1000,
      firstMs: 1000 + 1000 / 60,
      lastMs: 121000,
      firstDeltaMs: 1000 / 60,
      lastDeltaMs: 1000 / 60,
      sumMs: 120000,
      frames: 7200,
      nativeBefore: 1800,
      nativeAfter: 9000,
    },
    h: h.snapshot(),
  };
}
test('RAF full histogram must cover real wall, endpoint deltas and complete native counters', () => {
  const { p, h } = frameProof();
  verifyRafProof(p, h, 120000, 7200);
  const tiny = createHistogram();
  for (let i = 0; i < 3; i++) tiny.add(16);
  assert.throws(
    () => verifyRafProof({ ...p, frames: 3 }, tiny.snapshot(), 120000, 7200),
    /Histogramaggregate/,
  );
  assert.throws(() => verifyRafProof({ ...p, sumMs: 119999 }, h, 120000, 7200), /AllrawRAF/);
  assert.throws(
    () => verifyRafProof({ ...p, nativeAfter: 8999 }, h, 120000, 7200),
    /nativecounter/,
  );
  assert.throws(() => verifyRafProof({ ...p, lastMs: Infinity }, h, 120000, 7200), /FiniteRAF/);
});
function memory() {
  const points = ['BEFORE_WARMUP', 'BEFORE_MEASURE', 'AFTER_MEASURE'].map((phase, i) => ({
    phase,
    timeMs: [0, 30000, 150000][i],
    usedBytes: 100,
    totalBytes: 200,
    limitBytes: 1000,
  }));
  const rows = Array.from({ length: 120 }, (_, i) => [30016 + i * 1000, 100 + i, 300, 1000]).flat();
  return { points, rows };
}
test('heap rows bind actual phases/cadence, reject omitted available data/repeated times/invalid size and preserve uncertainty', () => {
  const { points, rows } = memory();
  assert.equal(verifyHeap(points, rows, true, 120000, 120, 219), 'RAW_PROXY_BASELINE');
  assert.throws(() => verifyHeap(points, [], true, 120000, 0, null), /omitobservations/);
  const repeated = [...rows];
  repeated[4] = repeated[0];
  assert.throws(() => verifyHeap(points, repeated, true, 120000, 120, 219), /Distinctactual/);
  assert.throws(
    () =>
      verifyHeap(
        points.map((p) => ({ ...p, totalBytes: 50 })),
        rows,
        true,
        120000,
        120,
        219,
      ),
    /ordering/,
  );
  assert.equal(verifyHeap(points, rows.slice(0, -4), true, 120000, 119, 218), 'UNVALIDATED');
  assert.equal(
    verifyHeap(
      points.map((p) => ({ ...p, usedBytes: null, totalBytes: null, limitBytes: null })),
      [],
      true,
      120000,
      0,
      null,
    ),
    'UNVALIDATED',
  );
  assert.equal(verifyHeap(points, [], false, 120000, 0, null), 'RAW_PROXY_BASELINE');
});
test('actual optional measurement failures propagate; absence is explicitly not measured', () => {
  assert.equal(optionalVerdict([{ available: false, verdict: 'UNVALIDATED' }]), 'NOT_MEASURED');
  assert.equal(
    optionalVerdict([
      { available: false, verdict: 'UNVALIDATED' },
      { available: true, verdict: 'FAIL' },
    ]),
    'FAIL',
  );
  assert.equal(optionalVerdict([{ available: true, verdict: 'UNVALIDATED' }]), 'UNVALIDATED');
  assert.equal(optionalVerdict([{ available: true, verdict: 'PASS' }]), 'PASS');
});

test('aggregate memory never promotes missing backend/run observations', () => {
  assert.equal(memorySummary(['RAW_PROXY_BASELINE', 'UNVALIDATED']), 'UNVALIDATED');
  assert.equal(memorySummary([]), 'UNVALIDATED');
  assert.equal(
    memorySummary(['RAW_PROXY_BASELINE', 'RAW_JS_PROXY_BASELINE_ONLY']),
    'RAW_JS_PROXY_BASELINE_ONLY',
  );
});

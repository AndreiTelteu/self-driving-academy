import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  observeRaf,
  warmBoundaryObservation,
  longTaskObservations,
  LONGTASK_CAPACITY,
} from './observations';
import { WarmBoundaryRejection } from './boundary';
import { armDiagnostics } from './diagnostics';
import { validateObservationMetadata, validateTimingArm } from './protocol';
import { validateTimingArm as originalTimingArm } from '../yield-policy-v5/protocol';

const entry = { timeMs: 30000, nativeSerial: 1980, controllerTick: 1800 };
const previous = { timeMs: 29800, observedAtMs: 29801, nativeSerial: 1969, controllerTick: 1789 };

test('ENTRY arriving after original previous rejects once and preserves attempted prefix and trigger', () => {
  const owner = warmBoundaryObservation();
  const raw = { rafTime: [29973.6, 29989.6], controllerTick: [1793, 1797] };
  owner.check(undefined, previous, { recordedFrames: 2, diagnosticCounter: entry });
  assert.equal(owner.snapshot().attempted, false);
  assert.throws(
    () => owner.check(entry, previous, { recordedFrames: 2, diagnosticCounter: entry }),
    WarmBoundaryRejection,
  );
  // A later permissible previous cannot turn the rejected one-shot attempt into success.
  owner.check(
    entry,
    { ...previous, nativeSerial: 1980, controllerTick: 1800 },
    { recordedFrames: 3, diagnosticCounter: entry },
  );
  const exported = JSON.parse(
    JSON.stringify({
      status: 'INCOMPLETE',
      raw,
      warmBoundary: owner.snapshot(),
      phaseEntry: entry,
      previousRaf: previous,
      recordedFrames: 2,
    }),
  );
  assert.deepEqual(exported.raw, raw);
  assert.equal(exported.warmBoundary.diagnostic.result, 'REJECTED');
  assert.deepEqual(exported.warmBoundary.diagnostic.diagnosticCounter, {
    nativeSerial: 1980,
    controllerTick: 1800,
  });
  assert.equal(exported.warmBoundary.diagnostic.previousRaf.controllerTick, 1789);
  validateObservationMetadata(exported, false);
  assert.throws(
    () => validateObservationMetadata({ ...exported, recordedFrames: 1 }, false),
    /prefix identity/,
  );
});

test('previous arriving after ENTRY uses RAF trigger and one-shot successful predicate', () => {
  const owner = warmBoundaryObservation();
  owner.check(entry, undefined, { recordedFrames: 0, diagnosticCounter: entry });
  const first = { ...previous, controllerTick: 1796, nativeSerial: 1976 };
  const trigger = { nativeSerial: 1981, controllerTick: 1801 };
  owner.check(entry, first, { recordedFrames: 1, diagnosticCounter: trigger });
  owner.check(entry, previous, { recordedFrames: 2, diagnosticCounter: entry });
  assert.equal(owner.snapshot().diagnostic?.result, 'WITHIN_EXISTING_BOUNDARY');
  assert.deepEqual(owner.snapshot().diagnostic?.diagnosticCounter, trigger);
  assert.deepEqual(owner.snapshot().diagnostic?.previousRaf, first);
});

test('callback timestamp precedes resolution; continuation clock remains independently delayed', async () => {
  let deliver: ((stamp: number) => void) | undefined;
  let now = 100;
  const promise = observeRaf(
    (callback) => {
      deliver = callback;
    },
    () => now,
  );
  deliver!(99);
  now = 130; // Synthetic delay between Promise resolution and await continuation, not an observed stall.
  const observation = await promise;
  assert.deepEqual(observation, { stampMs: 99, callbackMs: 100 });
  const diagnostic = armDiagnostics();
  diagnostic.wait({
    tick: 1801,
    waitStartMs: 90,
    targetMs: 120,
    counterBefore: { nativeSerial: 1981, controllerTick: 1801 },
    previousRaf: null,
    recoveryStepsBeforeReset: 1,
  });
  diagnostic.returned({
    stampMs: observation.stampMs,
    rafCallbackMs: observation.callbackMs,
    continuationStartMs: now,
    continuationReadMs: now,
    callbackReadMs: now,
    counterAfter: { nativeSerial: 1981, controllerTick: 1801 },
    guardReadMs: 131,
    debtMs: 11,
  });
  const metadata = { diagnostics: diagnostic.snapshot() };
  validateObservationMetadata(metadata, false);
  assert.equal(metadata.diagnostics.rafAttempt?.callbackReadMs, 130);
  assert.equal(metadata.diagnostics.rafAttempt?.rafCallbackMs, 100);
  const corrupt = structuredClone(metadata);
  corrupt.diagnostics.rafAttempt!.rafCallbackMs = 140;
  assert.throws(() => validateObservationMetadata(corrupt, false), /semantics/);
  delete corrupt.diagnostics.rafAttempt!.rafCallbackMs;
  assert.throws(() => validateObservationMetadata(corrupt, false), /pair/);
});

test('partial failure drains queued longtasks before disconnect, retains setup separately and detaches export', () => {
  const calls: string[] = [];
  const tasks = longTaskObservations(true, () => 100);
  tasks.ingest([{ startTime: 20, duration: 62 }]);
  tasks.acquire({
    takeRecords() {
      calls.push('drain');
      return [{ startTime: 110, duration: 1658.6 }];
    },
    disconnect() {
      calls.push('disconnect');
    },
  });
  tasks.finish();
  tasks.finish();
  assert.deepEqual(calls, ['drain', 'disconnect']);
  const snapshot = tasks.snapshot();
  assert.equal(snapshot.count, 1);
  assert.equal(snapshot.maxMs, 1658.6);
  assert.equal(snapshot.observations.entries.length, 2);
  validateObservationMetadata({ longTasks: snapshot }, false);
  snapshot.observations.entries[0].duration = 999;
  assert.equal(tasks.snapshot().observations.entries[0].duration, 62);
  tasks.assertComplete();
});

test('callback and drain combined overflow is explicit; no incomplete observations can become complete', () => {
  const tasks = longTaskObservations(true, () => 100);
  tasks.ingest(Array.from({ length: LONGTASK_CAPACITY }, () => ({ startTime: 110, duration: 51 })));
  tasks.acquire({ takeRecords: () => [{ startTime: 120, duration: 80 }], disconnect() {} });
  tasks.finish();
  const snapshot = tasks.snapshot();
  assert.equal(snapshot.observations.entries.length, LONGTASK_CAPACITY);
  assert.equal(snapshot.observations.observed, LONGTASK_CAPACITY + 1);
  assert.equal(snapshot.observations.overflow, 1);
  assert.equal(snapshot.count, LONGTASK_CAPACITY + 1);
  assert.equal(snapshot.maxMs, 80);
  validateObservationMetadata({ longTasks: snapshot }, false);
  assert.throws(() => tasks.assertComplete(), /overflow/);
  assert.throws(
    () =>
      validateObservationMetadata(
        { longTasks: snapshot, measurement: { windowStartMs: 100 } },
        true,
      ),
    /incomplete/,
  );
  snapshot.observations.overflow = 0;
  assert.throws(() => validateObservationMetadata({ longTasks: snapshot }, false), /accounting/);
});

test('drain and disconnect failures retain honest ownership and are not retried', () => {
  let disconnects = 0;
  const drainFailure = longTaskObservations(true, () => null);
  drainFailure.acquire({
    takeRecords() {
      throw new Error('drain failed');
    },
    disconnect() {
      disconnects++;
    },
  });
  assert.throws(() => drainFailure.finish(), /drain failed/);
  drainFailure.finish();
  assert.equal(disconnects, 1);
  assert.equal(drainFailure.snapshot().observations.drained, false);
  assert.equal(drainFailure.snapshot().observations.disconnected, true);
  validateObservationMetadata({ longTasks: drainFailure.snapshot() }, false);
  assert.throws(() => drainFailure.assertComplete(), /incomplete/);
  const disconnectFailure = longTaskObservations(true, () => null);
  disconnectFailure.acquire({
    takeRecords: () => [],
    disconnect() {
      throw new Error('disconnect failed');
    },
  });
  assert.throws(() => disconnectFailure.finish(), /disconnect failed/);
  disconnectFailure.finish();
  assert.equal(disconnectFailure.snapshot().observations.drained, true);
  assert.equal(disconnectFailure.snapshot().observations.disconnected, false);
  assert.throws(() => disconnectFailure.assertComplete(), /incomplete/);
  const both = longTaskObservations(true, () => null);
  both.acquire({
    takeRecords() {
      throw new Error('drain original');
    },
    disconnect() {
      throw new Error('disconnect original');
    },
  });
  assert.throws(
    () => both.finish(),
    (error: unknown) =>
      error instanceof AggregateError &&
      error.errors.length === 2 &&
      String(error.errors[0]).includes('drain original') &&
      String(error.errors[1]).includes('disconnect original'),
  );
  both.finish();
  validateObservationMetadata({ longTasks: both.snapshot() }, false);
});

test('unsupported API and invalid observations explicitly remain unknown', () => {
  const unsupported = longTaskObservations(false, () => null);
  unsupported.finish();
  unsupported.assertComplete();
  validateObservationMetadata({ longTasks: unsupported.snapshot() }, false);
  assert.equal(unsupported.snapshot().observations.cause, 'UNKNOWN');
  assert.throws(() => unsupported.acquire({ takeRecords: () => [], disconnect() {} }), /ownership/);
  const invalid = longTaskObservations(true, () => 100);
  invalid.acquire({ takeRecords: () => [{ startTime: 110, duration: NaN }], disconnect() {} });
  invalid.finish();
  assert.equal(invalid.snapshot().observations.invalid, 1);
  validateObservationMetadata({ longTasks: invalid.snapshot() }, false);
  assert.throws(() => invalid.assertComplete(), /incomplete/);
});

test('V7 reader inherits the original full proof and only adds optional diagnostic checks', () => {
  assert.equal(validateTimingArm, originalTimingArm);
  validateObservationMetadata({}, false);
  assert.throws(() => validateObservationMetadata({}, true, true), /missing/);
});

test('complete diagnostic reader rejects altered original boundary, alias clocks and disposal claims', () => {
  const owner = warmBoundaryObservation();
  const original = { ...previous, controllerTick: 1796, nativeSerial: 1976 };
  owner.check(entry, original, { recordedFrames: 1, diagnosticCounter: entry });
  const diagnostic = armDiagnostics();
  diagnostic.wait({
    tick: 1801,
    waitStartMs: 90,
    targetMs: 120,
    counterBefore: { nativeSerial: 1981, controllerTick: 1801 },
    previousRaf: null,
    recoveryStepsBeforeReset: 1,
  });
  diagnostic.returned({
    stampMs: 99,
    rafCallbackMs: 100,
    continuationStartMs: 130,
    continuationReadMs: 131,
    callbackReadMs: 131,
    counterAfter: { nativeSerial: 1981, controllerTick: 1801 },
  });
  const tasks = longTaskObservations(true, () => 30000);
  tasks.acquire({ takeRecords: () => [], disconnect() {} });
  tasks.finish();
  const meta = {
    warmBoundary: owner.snapshot(),
    diagnostics: diagnostic.snapshot(),
    longTasks: tasks.snapshot(),
    dualClock: { phaseEntry: entry, previousRaf: original },
    measurement: { samples: 2, windowStartMs: 30000 },
  };
  // This validates diagnostic semantics only; it is not a synthetic full-performance PASS.
  validateObservationMetadata(meta, true, true);
  const wrongPrevious = structuredClone(meta);
  wrongPrevious.dualClock.previousRaf.observedAtMs++;
  assert.throws(() => validateObservationMetadata(wrongPrevious, true, true), /original identity/);
  const wrongAlias = structuredClone(meta);
  wrongAlias.diagnostics.rafAttempt!.callbackReadMs = 100;
  assert.throws(
    () => validateObservationMetadata(wrongAlias, true, true),
    /counter-read semantics/,
  );
  const wrongDisposal = structuredClone(meta);
  wrongDisposal.longTasks.observations.disconnected = false;
  assert.throws(() => validateObservationMetadata(wrongDisposal, true, true), /incomplete/);
});

test('callback and continuation-start survive a subsequent failed counter read', () => {
  const diagnostic = armDiagnostics();
  diagnostic.wait({
    tick: 1801,
    waitStartMs: 90,
    targetMs: 120,
    counterBefore: { nativeSerial: 1981, controllerTick: 1801 },
    previousRaf: null,
    recoveryStepsBeforeReset: 1,
  });
  diagnostic.returned({ stampMs: 99, rafCallbackMs: 100, continuationStartMs: 130 });
  const partial = { diagnostics: diagnostic.snapshot() };
  validateObservationMetadata(partial, false);
  assert.equal(partial.diagnostics.rafAttempt?.rafCallbackMs, 100);
  assert.equal(partial.diagnostics.rafAttempt?.continuationStartMs, 130);
  assert.equal(partial.diagnostics.rafAttempt?.continuationReadMs, undefined);
});

test('later partial failure retains a successful boundary check and the longer actual raw prefix', () => {
  const owner = warmBoundaryObservation();
  const original = { ...previous, controllerTick: 1796, nativeSerial: 1976 };
  owner.check(entry, original, { recordedFrames: 2, diagnosticCounter: entry });
  const metadata = {
    warmBoundary: owner.snapshot(),
    phaseEntry: entry,
    previousRaf: original,
    recordedFrames: 3204,
    status: 'INCOMPLETE',
  };
  validateObservationMetadata(metadata, false);
  assert.equal(metadata.warmBoundary.diagnostic?.recordedFrames, 2);
  assert.equal(metadata.recordedFrames, 3204);
  assert.throws(
    () => validateObservationMetadata({ ...metadata, recordedFrames: 1 }, false),
    /prefix identity/,
  );
});

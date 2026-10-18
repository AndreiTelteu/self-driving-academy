import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDualClock } from '../yield-policy-v5/clock-proof';
import type { DualClockProof, RafPoint } from '../yield-policy-v5/clock-proof';
import { assertActualWarmBoundary, WarmBoundaryRejection } from './boundary';

const point = (controllerTick: number, timeMs: number, observedAtMs = timeMs): RafPoint => ({
  controllerTick,
  nativeSerial: controllerTick + 180,
  timeMs,
  observedAtMs,
});

/** SYNTHETIC arm: captured prefix counters/stamps, synthetic read times/tail/completion. */
function completeFixture(previousTick = 1789) {
  const entry = { controllerTick: 1800, nativeSerial: 1980, timeMs: 565953.1000000238 };
  const capturedPrefix = previousTick === 1789;
  const previousRaf = capturedPrefix
    ? point(1789, 565711.3, 565716.5)
    : point(previousTick, entry.timeMs + ((previousTick - 1800) * 1000) / 60);
  const points = capturedPrefix
    ? [
        point(1793, 565884.9),
        point(1797, 565940.6),
        point(1801, 565954.3),
        point(1805, 565961.3),
        point(1808, 565975.2),
      ]
    : [];
  let latest = points.at(-1) ?? previousRaf;
  while (latest.controllerTick < 9000) {
    const nextTick = Math.min(9000, latest.controllerTick + 4);
    latest = point(nextTick, latest.timeMs + ((nextTick - latest.controllerTick) * 1000) / 60);
    points.push(latest);
  }
  const final = points.at(-1)!;
  const proof: DualClockProof = {
    phaseEntry: entry,
    phaseCompletion: {
      timeMs: final.timeMs,
      controllerTick: final.controllerTick,
      nativeSerial: final.nativeSerial,
    },
    previousRaf,
    nativePhaseRatio: 120 / ((final.timeMs - entry.timeMs) / 1000),
    matchedRafRatio: (9000 - previousTick) / 60 / ((final.timeMs - previousRaf.timeMs) / 1000),
  };
  return {
    proof,
    raw: {
      frame: points.map((p, i) => p.timeMs - (i === 0 ? previousRaf : points[i - 1]!).timeMs),
      rafTime: points.map((p) => p.timeMs),
      rafReadTime: points.map((p) => p.observedAtMs),
      controllerTick: points.map((p) => p.controllerTick),
      nativeSerial: points.map((p) => p.nativeSerial),
    },
  };
}

test('complete synthetic 1789 prefix reaches the existing boundary rejection, not incomplete/max4', () => {
  const { proof, raw } = completeFixture();
  assert.deepEqual(raw.controllerTick.slice(0, 5), [1793, 1797, 1801, 1805, 1808]);
  assert.deepEqual(raw.nativeSerial.slice(0, 5), [1973, 1977, 1981, 1985, 1988]);
  assert.deepEqual(raw.rafTime.slice(0, 5), [565884.9, 565940.6, 565954.3, 565961.3, 565975.2]);
  assert.equal(raw.frame[0], 173.59999999997672);
  assert.equal(proof.phaseCompletion.controllerTick, 9000);
  assert.ok(proof.nativePhaseRatio >= 0.98 && proof.matchedRafRatio >= 0.98);
  assert.throws(
    () => validateDualClock(proof, raw, 1800, 7200),
    /^Error: 052 actual warm-boundary native counter$/,
  );
});

test('inclusive 1796 and 1804 edges agree with the complete frozen dual-clock proof', () => {
  for (const previousTick of [1796, 1800, 1804]) {
    const { proof, raw } = completeFixture(previousTick);
    assert.doesNotThrow(() => validateDualClock(proof, raw, 1800, 7200));
    const diagnostic = assertActualWarmBoundary(proof.phaseEntry, proof.previousRaf, {
      recordedFrames: raw.frame.length,
      diagnosticCounter: proof.phaseCompletion,
    });
    assert.equal(diagnostic.result, 'WITHIN_EXISTING_BOUNDARY');
    assert.equal(diagnostic.performanceAcceptance, false);
  }
});

test('1795 and 1805 reject in both helper and complete proof without selecting a later previous', () => {
  for (const previousTick of [1795, 1805]) {
    const { proof, raw } = completeFixture(previousTick);
    assert.throws(() => validateDualClock(proof, raw, 1800, 7200), /warm-boundary native counter/);
    assert.throws(
      () =>
        assertActualWarmBoundary(proof.phaseEntry, proof.previousRaf, {
          recordedFrames: raw.frame.length,
          diagnosticCounter: proof.phaseCompletion,
        }),
      WarmBoundaryRejection,
    );
  }
});

test('fail-fast exports actual entry/previous/counter/count; attempted prefix stays untouched', () => {
  const { proof, raw } = completeFixture();
  // At actual ENTRY, two measured RAF rows already exist; no completion is needed by helper.
  const prefix = Object.fromEntries(
    Object.entries(raw).map(([key, rows]) => [key, rows.slice(0, 2)]),
  );
  const original = structuredClone(prefix);
  const diagnosticCounter = { controllerTick: 1800, nativeSerial: 1980 };
  let rejection: WarmBoundaryRejection | undefined;
  try {
    assertActualWarmBoundary(proof.phaseEntry, proof.previousRaf, {
      recordedFrames: 2,
      diagnosticCounter,
    });
  } catch (error) {
    assert.ok(error instanceof WarmBoundaryRejection);
    rejection = error;
  }
  assert.ok(rejection);
  const exported = JSON.parse(JSON.stringify({ boundary: rejection.diagnostic, raw: prefix }));
  assert.equal(exported.boundary.status, 'DIAGNOSTIC_ONLY');
  assert.equal(exported.boundary.result, 'REJECTED');
  assert.equal(exported.boundary.performanceAcceptance, false);
  assert.equal(exported.boundary.recordedFrames, 2);
  assert.deepEqual(exported.boundary.phaseEntry, proof.phaseEntry);
  assert.deepEqual(exported.boundary.previousRaf, proof.previousRaf);
  assert.deepEqual(exported.boundary.diagnosticCounter, diagnosticCounter);
  assert.deepEqual(exported.raw, original);
  assert.deepEqual(prefix, original);
  assert.ok(!('phaseCompletion' in exported.boundary));
  diagnosticCounter.controllerTick = 999;
  proof.previousRaf.controllerTick = 999;
  assert.equal(rejection.diagnostic.diagnosticCounter.controllerTick, 1800);
  assert.equal(rejection.diagnostic.previousRaf.controllerTick, 1789);
});

test('parity is mandatory at entry, previous RAF and diagnostic actual-counter contexts', () => {
  const { proof } = completeFixture(1800);
  const attempt = {
    recordedFrames: 0,
    diagnosticCounter: { nativeSerial: 1980, controllerTick: 1800 },
  };
  for (const context of ['entry', 'previous', 'diagnostic'] as const) {
    assert.throws(
      () =>
        assertActualWarmBoundary(
          context === 'entry' ? { ...proof.phaseEntry, nativeSerial: 1981 } : proof.phaseEntry,
          context === 'previous' ? { ...proof.previousRaf, nativeSerial: 1981 } : proof.previousRaf,
          context === 'diagnostic'
            ? { ...attempt, diagnosticCounter: { nativeSerial: 1981, controllerTick: 1800 } }
            : attempt,
        ),
      /actual native\/controller counter disagreement/,
    );
  }
});

test('zero clamp and scalar prefix capacity preserve the existing bounds', () => {
  const entry = point(0, 1);
  for (const tick of [0, 4])
    assert.doesNotThrow(() =>
      assertActualWarmBoundary(entry, point(tick, 1), {
        recordedFrames: 60000,
        diagnosticCounter: entry,
      }),
    );
  assert.throws(
    () =>
      assertActualWarmBoundary(entry, point(5, 1), { recordedFrames: 0, diagnosticCounter: entry }),
    WarmBoundaryRejection,
  );
  for (const recordedFrames of [-1, 0.5, 60001, NaN, Infinity])
    assert.throws(
      () => assertActualWarmBoundary(entry, entry, { recordedFrames, diagnosticCounter: entry }),
      /bounded attempted RAF prefix count/,
    );
  for (const invalid of [point(-1, 1), point(0.5, 1), point(NaN, 1), point(Infinity, 1)])
    assert.throws(
      () =>
        assertActualWarmBoundary(entry, invalid, { recordedFrames: 0, diagnosticCounter: entry }),
      /counter disagreement/,
    );
});

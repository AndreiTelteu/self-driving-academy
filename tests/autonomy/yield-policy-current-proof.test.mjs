import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { originalDistribution, validateCurrentRaw } from './yield-policy-current-proof.mjs';
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function capture() {
  const rawCosts = Array.from({ length: 600 }, (_, index) => ({
    tickMs: (index % 13) + 0.1,
    stepMs: (index % 7) + 0.01,
    policyMs: index % 6 === 5 ? 0.3 : 0,
  }));
  const rawCommands = Array.from({ length: 130 }, (_, index) =>
    Array.from({ length: 2 }, () => ({
      throttle: 0.2,
      brake: 0,
      steering: 0,
      handbrake: false,
      tick: (index + 1) * 6,
    })),
  );
  const finalBodies = Array.from({ length: 2 }, () => ({
    position: { x: 0, y: 1, z: 2 },
    velocity: { x: 1, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    speed: 1,
  }));
  return {
    options: { measured: true },
    rawCosts,
    rawCommands,
    finalBodies,
    finalCrossingBodies: finalBodies,
    commandHash: hash(rawCommands),
    finalPhysicalHash: hash(finalBodies),
    timing: {
      tickMs: originalDistribution(rawCosts.map((c) => c.tickMs)),
      stepMs: originalDistribution(rawCosts.map((c) => c.stepMs)),
      policyMs: originalDistribution(
        rawCosts.filter((_, i) => (181 + i) % 6 === 0).map((c) => c.policyMs),
      ),
    },
  };
}
test('052 current raw proof rejects sample loss, altered cost, forged summary and invalid OFF channel', () => {
  const row = capture();
  assert.doesNotThrow(() => validateCurrentRaw(row, 2));
  assert.throws(() => validateCurrentRaw({ ...row, rawCosts: row.rawCosts.slice(1) }, 2));
  assert.throws(() =>
    validateCurrentRaw(
      { ...row, rawCosts: row.rawCosts.map((c, i) => (i === 0 ? { ...c, tickMs: NaN } : c)) },
      2,
    ),
  );
  assert.throws(() =>
    validateCurrentRaw(
      { ...row, timing: { ...row.timing, tickMs: { p50: 0, p95: 0, p99: 0 } } },
      2,
    ),
  );
  assert.throws(() => validateCurrentRaw({ ...row, options: { measured: false } }, 2));
  assert.doesNotThrow(() =>
    validateCurrentRaw({ ...row, options: { measured: false }, rawCosts: null, timing: null }, 2),
  );
});
test('052 current raw proof rejects changed commands, body state and policy-cadence summary', () => {
  const row = capture();
  assert.throws(() => validateCurrentRaw({ ...row, rawCommands: row.rawCommands.slice(1) }, 2));
  const changed = structuredClone(row);
  changed.rawCommands[0][0].throttle = 0.8;
  assert.throws(() => validateCurrentRaw(changed, 2));
  const body = structuredClone(row);
  body.finalBodies[0].position.x = 3;
  assert.throws(() => validateCurrentRaw(body, 2));
  const invalid = structuredClone(row);
  invalid.finalBodies[0].velocity.x = Infinity;
  assert.throws(() => validateCurrentRaw(invalid, 2));
  assert.throws(() =>
    validateCurrentRaw(
      {
        ...row,
        timing: {
          ...row.timing,
          policyMs: originalDistribution(row.rawCosts.map((c) => c.policyMs)),
        },
      },
      2,
    ),
  );
});

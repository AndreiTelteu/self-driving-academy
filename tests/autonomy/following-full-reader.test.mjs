import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  nativeValidationProtocol,
  validateNativeDurations,
} from '../../scripts/native-validation-protocol.mjs';
import { validateFollowingFullRun } from '../../scripts/verify-following-full.mjs';
const budget = JSON.parse(readFileSync('Docs/performance-budgets.json'));
function fixture() {
  const protocol = nativeValidationProtocol('full'),
    run = {
      count: 70,
      pair: 0,
      observer: true,
      sampleBytes: 7200 * 24,
      samples: {
        tick: Array(7200).fill(2),
        own: Array(7200).fill(1),
        rapier: Array(7200).fill(0.2),
      },
      tickP95Ms: 2,
      ownP95Ms: 1,
      rapierP95Ms: 0.2,
      warmupWallMs: 30001,
      measuredWallMs: 120001,
      elapsedWallMs: 150003,
      maxDeadlineLatenessMs: 1,
      trace: Array.from({ length: 150 }, (_, i) => [(i + 1) * 60, 4, 0]),
      cleanup: {
        body: { entities: 0, subscriptions: 0 },
        fixture: {
          road: { cachedContexts: 0, identities: 0 },
          behavior: { actors: 0, decisions: 0 },
        },
        policy: {
          actors: 0,
          identities: 0,
          delayedBrakeStates: 0,
          cachedTargets: 0,
          scratchRetainedFields: 0,
        },
        controller: { vehicles: 0 },
      },
    };
  return { protocol, run };
}
test('048 full reader rejects synthetic elapsed/throughput, omitted raw sample, absolute overflow, bad continuity and leaked state', () => {
  const { protocol, run } = fixture();
  validateFollowingFullRun(run, protocol, budget);
  for (const mutate of [
    (r) => (r.measuredWallMs = 119999),
    (r) => (r.elapsedWallMs = 200000),
    (r) => r.samples.tick.pop(),
    (r) => {
      r.samples.tick.fill(9);
      r.tickP95Ms = 9;
    },
    (r) => (r.trace[0][0] = 61),
    (r) => (r.cleanup.policy.cachedTargets = 1),
  ]) {
    const bad = structuredClone(run);
    mutate(bad);
    assert.throws(() => validateFollowingFullRun(bad, protocol, budget));
  }
  assert.throws(() => nativeValidationProtocol('fake'));
  assert.throws(() => validateNativeDurations({ ...run, warmupWallMs: 29999 }, protocol));
});

// Pure current-capture proof; no native/browser/world imports.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function originalDistribution(values) {
  assert(values.length > 0);
  assert(values.every((value) => Number.isFinite(value) && value >= 0));
  const sorted = [...values].sort((a, b) => a - b);
  return Object.fromEntries(
    [50, 95, 99].map((p) => ['p' + p, sorted[Math.floor(((sorted.length - 1) * p) / 100)]]),
  );
}
export function validateCurrentRaw(row, actors) {
  assert.equal(row.rawCommands.length, 130);
  for (const pair of row.rawCommands) {
    assert.equal(pair.length, 2);
    for (const command of pair) {
      for (const key of ['throttle', 'brake', 'steering', 'tick'])
        assert(Number.isFinite(command[key]));
      assert(command.throttle >= 0 && command.throttle <= 1);
      assert(command.brake >= 0 && command.brake <= 1);
      assert(command.steering >= -1 && command.steering <= 1);
      assert.equal(typeof command.handbrake, 'boolean');
      assert(Number.isSafeInteger(command.tick) && command.tick >= 1 && command.tick <= 780);
    }
  }
  assert.equal(hash(row.rawCommands), row.commandHash);
  assert.equal(row.finalBodies.length, actors);
  for (const body of row.finalBodies) {
    for (const [name, keys] of [
      ['position', ['x', 'y', 'z']],
      ['velocity', ['x', 'y', 'z']],
      ['rotation', ['x', 'y', 'z', 'w']],
    ])
      for (const key of keys) assert(Number.isFinite(body[name][key]));
    assert(Number.isFinite(body.speed) && body.speed >= 0);
  }
  assert.equal(hash(row.finalBodies), row.finalPhysicalHash);
  assert.deepEqual(row.finalBodies.slice(0, 2), row.finalCrossingBodies);
  if (!row.options.measured) {
    assert.equal(row.rawCosts, null);
    assert.equal(row.timing, null);
    return;
  }
  assert.equal(row.rawCosts.length, 600);
  for (const cost of row.rawCosts) {
    assert.deepEqual(Object.keys(cost).sort(), ['policyMs', 'stepMs', 'tickMs']);
    for (const value of Object.values(cost)) assert(Number.isFinite(value) && value >= 0);
  }
  assert.deepEqual(row.timing, {
    tickMs: originalDistribution(row.rawCosts.map((cost) => cost.tickMs)),
    stepMs: originalDistribution(row.rawCosts.map((cost) => cost.stepMs)),
    policyMs: originalDistribution(
      row.rawCosts.filter((_, index) => (181 + index) % 6 === 0).map((cost) => cost.policyMs),
    ),
  });
}

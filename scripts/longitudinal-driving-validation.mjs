import assert from 'node:assert/strict';
/** Independent physical-driving reader shared by native and browser exports. */
export function validateLongitudinalDriving(result, cleanup) {
  assert(['sedan', 'compact'].includes(result.classId));
  assert(['dry-asphalt', 'reduced-adhesion'].includes(result.surface));
  assert.equal(result.mechanics.classId, result.classId);
  assert.equal(result.mechanics.surface.id, result.surface);
  assert.equal(result.mechanics.brakeAccelerationMps2, result.classId === 'sedan' ? 8 : 9);
  assert.equal(result.trace.length, result.ticks);
  assert(result.ticks >= 30 && result.ticks <= 1800);
  assert.equal(result.stimulusTick, 1);
  assert.equal(result.initialSpeedMps, 15);
  assert.equal(result.obstacleM, 75);
  const delayTicks = result.risky ? 90 : 12;
  const firstBrake = result.trace.find((row) => row.command.brake > 0);
  assert.equal(firstBrake.tick, result.stimulusTick + delayTicks);
  let cumulativePath,
    impulse = 0,
    previous = result.trace[0].position;
  // The first step's path starts at the authored initial origin, after native settling.
  cumulativePath = Math.hypot(previous.x, previous.z);
  for (let index = 0; index < result.trace.length; index++) {
    const row = result.trace[index];
    assert.equal(row.tick, index + 1);
    for (const value of [
      ...Object.values(row.position),
      ...Object.values(row.velocity),
      ...Object.values(row.rotation),
      row.speedMps,
      row.totalSpeedMps,
      row.accelerationMps2,
      row.obstacleImpulseNs,
    ])
      assert(Number.isFinite(value));
    assert(row.command.throttle >= 0 && row.command.throttle <= 1);
    assert(row.command.brake >= 0 && row.command.brake <= 1);
    assert.equal(row.command.source, 'AUTONOMY');
    assert.equal(row.command.units, 'SI');
    assert.equal(row.command.tick, row.tick);
    assert.equal(row.reason, 'TRACK_TARGET');
    assert(row.tick - row.targetDecisionTick >= 0 && row.tick - row.targetDecisionTick <= 5);
    if (row.tick <= firstBrake.tick) assert.equal(row.brakeEventTick, 1);
    if (row.tick < firstBrake.tick) {
      assert.equal(row.phase, 'REACTION_DELAY');
      assert.equal(row.command.brake, 0);
    }
    if (row.speedMps < -0.1) assert.equal(row.command.throttle, 0);
    if (index)
      cumulativePath += Math.hypot(row.position.x - previous.x, row.position.z - previous.z);
    previous = row.position;
    impulse += row.obstacleImpulseNs;
  }
  assert(Math.abs(cumulativePath - result.pathM) < 1e-6);
  assert.equal(impulse, result.collisionImpulseNs);
  assert.equal(result.stopped, result.trace.at(-1).totalSpeedMps < 0.1);
  assert(result.stopped);
  if (result.risky) {
    assert(result.collisionImpulseNs > result.mechanics.massKg);
    assert(result.pathM > 70);
  } else {
    assert.equal(result.collisionImpulseNs, 0);
    assert(result.pathM < 70);
    assert(result.trace.at(-1).position.z + 2 < 75);
  }
  assert.equal(cleanup.body.entities, 0);
  assert.equal(cleanup.body.subscriptions, 0);
  assert.equal(cleanup.policy.actors, 0);
  assert.equal(cleanup.policy.identities, 0);
  assert.equal(cleanup.controller.vehicles, 0);
}

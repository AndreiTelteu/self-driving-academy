import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function validateFollowingBrowser(payload) {
  assert.equal(payload.status, 'PASS');
  assert.equal(payload.fixture, '048-browser-following-v1');
  assert(['WEBGPU', 'WEBGL2'].includes(payload.renderer));
  assert.equal(payload.foreground, true);
  assert(payload.browser.includes('Chrome/'));
  assert.deepEqual(
    payload.episodes.map((e) => e.result.classId),
    ['sedan', 'compact'],
  );
  for (const episode of payload.episodes) {
    const { result, clock, cleanup } = episode;
    assert.equal(result.ticks, 600);
    assert.equal(result.rows.length, 600);
    assert.equal(clock.tick, 600);
    assert.equal(clock.simulatedSeconds, 10);
    assert.equal(clock.overloadCount, 0);
    assert(Number.isFinite(clock.activeRealSeconds) && clock.activeRealSeconds >= 10);
    assert(clock.simulatedSeconds / clock.activeRealSeconds >= 0.98);
    assert(Number.isFinite(episode.maxRafGapMs) && episode.maxRafGapMs >= 0);
    for (const [i, row] of result.rows.entries()) {
      assert.equal(row.tick, i + 1);
      for (const value of [
        row.speedMps,
        row.gapM,
        row.targetMps,
        row.desiredGapM,
        row.brake,
        row.throttle,
        ...Object.values(row.position),
      ])
        assert(Number.isFinite(value));
      assert(row.gapM >= 0);
      assert(row.targetMps >= 0 && row.targetMps <= 8);
      assert(row.brake >= 0 && row.brake <= 1);
      assert(row.throttle >= 0 && row.throttle <= 1);
      assert(['QUEUE_GAP', 'FOLLOWING_GAP'].includes(row.reason));
      assert(row.desiredGapM > 0);
      if (row.reason === 'QUEUE_GAP') assert.equal(row.desiredGapM, 2);
      if (row.targetDecisionTick !== undefined) {
        const decisionTick = 1 + Math.floor(i / 6) * 6;
        assert.equal(row.targetDecisionTick, decisionTick);
        assert.equal(row.targetSourceTick, decisionTick);
        assert.equal(row.observedLeaderId, 'leader');
        assert(
          Number.isSafeInteger(row.observedLeaderIncarnation) && row.observedLeaderIncarnation >= 0,
        );
        assert(Number.isFinite(row.targetEgoSpeedMps));
        const speed = Math.max(0, row.targetEgoSpeedMps);
        assert(Number.isFinite(speed));
        assert(Number.isFinite(row.targetLeaderSpeedMps) && row.targetLeaderSpeedMps >= 0);
        assert(Number.isFinite(row.targetGapM) && row.targetGapM >= 0);
        if (i % 6 === 0) {
          assert(Math.abs(row.targetGapM - row.gapM) < 1e-7);
          assert.equal(row.targetEgoSpeedMps, row.speedMps);
          assert.equal(row.targetLeaderSpeedMps, row.leaderSpeedMps);
        } else {
          for (const key of [
            'targetGapM',
            'targetEgoSpeedMps',
            'targetLeaderSpeedMps',
            'observedLeaderId',
            'observedLeaderIncarnation',
          ])
            assert.equal(row[key], result.rows[i - 1][key]);
        }
        const desired = row.targetLeaderSpeedMps <= 0.1 ? 2 : 3 + 1.8 * speed;
        assert.equal(row.desiredGapM, desired);
        const expected = Math.max(
          0,
          Math.min(
            8,
            speed + 0.7 * (row.targetLeaderSpeedMps - speed) + 0.7 * (row.targetGapM - desired),
          ),
        );
        assert(Math.abs(row.targetMps - expected) < 1e-7);
        assert.equal(row.collisionStepSerial, 181 + i);
        assert(Number.isFinite(row.contactToleranceM) && row.contactToleranceM >= 0);
        assert(Array.isArray(row.contacts) && row.contacts.length <= 131072);
        for (const contact of row.contacts) {
          assert(Number.isFinite(contact.impulseNs) && contact.impulseNs >= 0);
          assert.deepEqual([contact.first.entityId, contact.second.entityId].sort(), [
            'car',
            'leader',
          ]);
          for (const identity of [contact.first, contact.second]) {
            assert.equal(identity.kind, 'VEHICLE');
            assert(Number.isSafeInteger(identity.serial) && identity.serial > 0);
            // Rapier's opaque handle can be a subnormal number; registry admits
            // finite numeric handles, not integer application identities.
            assert(Number.isFinite(identity.colliderHandle) && identity.colliderHandle >= 0);
          }
        }
      }
      // Later captures record leader readback; historical captures only prove
      // finite realized trajectories and target continuity, not per-row arithmetic.
      if (i % 6 === 0 && row.leaderSpeedMps !== undefined) {
        const speed = Math.max(0, row.speedMps);
        assert(Number.isFinite(row.leaderSpeedMps) && row.leaderSpeedMps >= 0);
        const desired = row.leaderSpeedMps <= 0.1 ? 2 : 3 + 1.8 * speed;
        assert.equal(row.desiredGapM, desired);
        const expected = Math.max(
          0,
          Math.min(8, speed + 0.7 * (row.leaderSpeedMps - speed) + 0.7 * (row.gapM - desired)),
        );
        assert(Math.abs(row.targetMps - expected) < 1e-7);
      } else if (i % 6 !== 0) assert.equal(row.targetMps, result.rows[i - 1].targetMps);
    }
    assert(Math.abs(result.rows.at(-1).speedMps) < 0.1);
    assert.equal(result.rows.at(-1).targetMps, 0);
    assert(result.rows.some((r) => r.brake > 0));
    assert(result.rows.some((r) => r.throttle > 0));
    if (result.collisionImpulseNs !== undefined) {
      const impulse = result.rows.reduce(
        (sum, row) => sum + row.contacts.reduce((s, c) => s + c.impulseNs, 0),
        0,
      );
      assert.equal(result.collisionImpulseNs, impulse);
      assert.equal(result.authoredPerVehicleRadiusM, 1.2);
      assert.equal(result.gapMeasurement, '044-circular-envelope');
    }
    const a = result.rows[0].position,
      b = result.rows.at(-1).position;
    assert(Math.hypot(b.x - a.x, b.z - a.z) > 1);
    for (const [owner, keys] of [
      [cleanup.body, ['entities', 'subscriptions']],
      [
        cleanup.policy,
        ['actors', 'identities', 'delayedBrakeStates', 'cachedTargets', 'scratchRetainedFields'],
      ],
      [cleanup.controller, ['vehicles', 'targets', 'projections', 'players', 'retainedBatches']],
    ])
      for (const key of keys) assert.equal(owner[key], 0);
  }
}

export async function inspectFollowingBrowser(folder, runName, cleanupName, current = false) {
  assert(/^run-[a-f0-9-]{36}\.json$/.test(runName));
  assert(/^run-[a-f0-9-]{36}\.json$/.test(cleanupName));
  const binding = JSON.parse(await readFile(resolve(folder, 'binding.json')));
  assert.equal(hash(JSON.stringify(binding.inputs)), binding.sourceHash);
  assert.equal(hash(JSON.stringify(binding.artifacts)), binding.artifactHash);
  for (const [kind, items] of [
    ['source', binding.inputs],
    ['artifact', binding.artifacts],
  ]) {
    for (const item of items) {
      const bytes = await readFile(resolve(folder, kind, item.path));
      assert.equal(bytes.length, item.bytes);
      assert.equal(hash(bytes), item.sha256);
      if (current && kind === 'source') assert.equal(hash(await readFile(item.path)), item.sha256);
    }
  }
  async function envelope(name) {
    const bytes = await readFile(resolve(folder, name));
    const receipt = JSON.parse(await readFile(resolve(folder, name + '.receipt.json')));
    assert.equal(receipt.name, name);
    assert.equal(receipt.sha256, hash(bytes));
    const data = JSON.parse(bytes);
    assert.deepEqual(data.build, binding);
    assert.deepEqual(data.hardware, JSON.parse(await readFile(resolve(folder, 'hardware.json'))));
    assert.equal(data.payload.build.sourceHash, binding.sourceHash);
    for (const key of ['commit', 'budgetVersion', 'engineVersion', 'physicsVersion'])
      assert.equal(data.payload.build[key], binding[key]);
    return data;
  }
  const run = await envelope(runName),
    cleanup = await envelope(cleanupName);
  validateFollowingBrowser(run.payload);
  assert.equal(cleanup.payload.fixture, '048-browser-cleanup-v1');
  assert.equal(cleanup.payload.status, 'PASS');
  assert.equal(cleanup.payload.rendererOwners, 0);
  assert(Date.parse(cleanup.capturedAt) >= Date.parse(run.capturedAt));
  return {
    status: 'PASS',
    renderer: run.payload.renderer,
    episodes: 2,
    sourceHash: binding.sourceHash,
    scope: 'Short queue integration, export and cleanup; no fleet FPS claim.',
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(
    JSON.stringify(
      await inspectFollowingBrowser(
        ...process.argv.slice(2, 5),
        process.argv.includes('--current'),
      ),
    ),
  );
}

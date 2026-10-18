import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const hash = (b) => createHash('sha256').update(b).digest('hex'),
  folder = process.argv[2],
  current = process.argv.includes('--current');
const binding = JSON.parse(await readFile(resolve(folder, 'binding.json'))),
  bytes = await readFile(resolve(folder, 'report.json')),
  report = JSON.parse(bytes),
  terminal = JSON.parse(await readFile(resolve(folder, 'terminal.json')));
await assert.rejects(access(resolve(folder, 'failure.json')), { code: 'ENOENT' });
assert.equal(hash(bytes), terminal.reportSha256);
assert.equal(hash(JSON.stringify(binding.inputs)), binding.sourceHash);
for (const input of binding.inputs) {
  let source;
  try {
    source = await readFile(resolve(folder, 'source', input.path));
  } catch (error) {
    assert.equal(error.code, 'ENOENT');
    source = execFileSync('git', ['show', binding.prerequisiteCommit + ':' + input.path]);
  }
  assert.equal(source.length, input.bytes);
  assert.equal(hash(source), input.sha256);
  if (current) assert.equal(hash(await readFile(input.path)), input.sha256);
}
assert.equal(report.status, 'CAPTURE_COMPLETE');
assert.equal(report.fixture, '048-native-driving-v1');
assert.deepEqual(
  report.episodes.map((e) => e.result.classId),
  ['sedan', 'compact'],
);
for (const episode of report.episodes) {
  const r = episode.result;
  assert.equal(r.ticks, 600);
  assert.equal(r.rows.length, 600);
  for (let i = 0; i < 600; i++) {
    const row = r.rows[i];
    assert.equal(row.tick, i + 1);
    for (const value of [
      row.speedMps,
      row.gapM,
      row.targetMps,
      row.brake,
      row.throttle,
      ...Object.values(row.position),
    ])
      assert(Number.isFinite(value));
    assert(row.gapM >= 0);
    assert(row.targetMps >= 0 && row.targetMps <= 30);
    assert(row.brake >= 0 && row.brake <= 1);
    assert(row.throttle >= 0 && row.throttle <= 1);
  }
  assert(Math.abs(r.rows.at(-1).speedMps) < 0.1);
  assert.equal(r.rows.at(-1).targetMps, 0);
  assert.equal(r.rows.at(-1).reason, 'QUEUE_GAP');
  assert.equal(r.rows.at(-1).desiredGapM, 2);
  assert(r.rows.some((row) => row.brake > 0));
  assert(r.rows.some((row) => row.throttle > 0));
  const a = r.rows[0].position,
    b = r.rows.at(-1).position;
  assert(Math.hypot(b.x - a.x, b.z - a.z) > 1);
  for (const [o, key] of [
    [episode.cleanup.body, 'entities'],
    [episode.cleanup.body, 'subscriptions'],
    [episode.cleanup.policy, 'actors'],
    [episode.cleanup.policy, 'identities'],
    [episode.cleanup.policy, 'delayedBrakeStates'],
    [episode.cleanup.policy, 'cachedTargets'],
    [episode.cleanup.policy, 'scratchRetainedFields'],
    [episode.cleanup.controller, 'vehicles'],
    [episode.cleanup.controller, 'targets'],
  ])
    assert.equal(o[key], 0);
}
console.log(
  JSON.stringify({
    status: 'PASS',
    episodes: 2,
    scope:
      'Finite physical queue/movement/standstill/commands/source/cleanup; no exact gap or contact-free assertion.',
  }),
);

import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { immutable, localClosure, digest, causes } from './wheel-capture-source.mjs';
import { createFollowingDrivingEpisode } from '../tests/autonomy/following-driving-fixture.ts';
const label = process.argv[2];
assert(/^[a-z0-9-]+$/.test(label));
const folder = `Docs/Evidence/048-following/${label}`;
await mkdir(folder);
const prerequisiteCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  inputs = [];
for (const path of await localClosure([
  'scripts/capture-following-driving.mjs',
  'scripts/register-typescript.mjs',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
])) {
  const bytes = await readFile(path);
  inputs.push({ path, bytes: bytes.length, sha256: digest(bytes) });
  let original;
  try {
    original = execFileSync('git', ['show', prerequisiteCommit + ':' + path], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    original = null;
  }
  if (!original?.equals(bytes)) await immutable(`${folder}/source/${path}`, bytes);
}
await immutable(`${folder}/binding.json`, {
  prerequisiteCommit,
  inputs,
  sourceHash: digest(JSON.stringify(inputs)),
  capturedAt: new Date().toISOString(),
});
const episodes = [];
try {
  for (const classId of ['sedan', 'compact']) {
    const episode = await createFollowingDrivingEpisode(classId);
    try {
      while (!episode.complete) episode.step();
      const result = episode.result();
      assert.equal(result.rows.length, 600);
      assert(Math.abs(result.rows.at(-1).speedMps) < 0.1);
      assert(result.rows.some((r) => r.brake > 0) && result.rows.some((r) => r.throttle > 0));
      const cleanup = episode.dispose();
      assert.equal(cleanup.body.entities, 0);
      assert.equal(cleanup.body.subscriptions, 0);
      assert.equal(cleanup.policy.actors, 0);
      episodes.push({ result, cleanup });
    } finally {
      episode.dispose();
    }
  }
  for (const input of inputs) assert.equal(digest(await readFile(input.path)), input.sha256);
  await immutable(`${folder}/report.json`, {
    status: 'CAPTURE_COMPLETE',
    fixture: '048-native-driving-v1',
    episodes,
    scope:
      'Fixed-tick functional queue on actual044 readbacks and047/024/Rapier; no timing/FPS claim. Gap is044 circular envelope gap, not exact bumper separation; Actual native contact identities/impulses and separate ego-leader impulses are instrumented; no contact-free claim.',
  });
  await immutable(`${folder}/terminal.json`, {
    reportSha256: digest(await readFile(`${folder}/report.json`)),
    completedAt: new Date().toISOString(),
  });
  console.log(
    JSON.stringify({
      folder,
      episodes: episodes.map((e) => ({
        classId: e.result.classId,
        last: e.result.rows.at(-1),
        cleanup: e.cleanup,
      })),
    }),
  );
} catch (error) {
  await immutable(`${folder}/failure.json`, { causes: causes(error), episodes });
  throw error;
}

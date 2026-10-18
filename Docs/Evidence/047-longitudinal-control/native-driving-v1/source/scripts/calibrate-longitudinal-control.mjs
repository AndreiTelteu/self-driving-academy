import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createLongitudinalDrivingEpisode } from '../tests/autonomy/longitudinal-driving-fixture.ts';
import { immutable, localClosure, digest, causes } from './wheel-capture-source.mjs';
assert.equal(process.env.PBI047_CPU_LEASE, 'parent-approved-exclusive');
const label = process.argv[2];
assert(/^[a-z0-9-]+$/.test(label));
const folder = `Docs/Evidence/047-longitudinal-control/${label}`;
await mkdir(folder);
const episodes = [];
try {
  const paths = await localClosure([
    'scripts/calibrate-longitudinal-control.mjs',
    'scripts/register-typescript.mjs',
    'package.json',
    'package-lock.json',
    'Docs/performance-budgets.json',
  ]);
  const inputs = [],
    aggregate = createHash('sha256');
  for (const path of paths) {
    const bytes = await readFile(path);
    inputs.push({ path, bytes: bytes.length, sha256: digest(bytes) });
    aggregate.update(path).update(bytes);
    await immutable(`${folder}/source/${path}`, bytes);
  }
  const nativePath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat')),
    native = await readFile(nativePath);
  const binding = {
    capturedAt: new Date().toISOString(),
    sourceHash: aggregate.digest('hex'),
    inputs,
    native: { path: nativePath, bytes: native.length, sha256: digest(native) },
  };
  await immutable(`${folder}/binding.json`, binding);
  await immutable(`${folder}/native/rapier.mjs`, native);
  for (const classId of ['sedan', 'compact'])
    for (const surface of ['dry-asphalt', 'reduced-adhesion'])
      for (const risky of [false, true]) {
        const episode = await createLongitudinalDrivingEpisode(classId, surface, risky);
        let result,
          cleanup,
          primary,
          failed = false;
        try {
          while (!episode.complete) episode.step();
          result = episode.result();
        } catch (error) {
          failed = true;
          primary = error;
        }
        try {
          cleanup = episode.dispose();
        } catch (error) {
          throw new AggregateError(failed ? [primary, error] : [error], 'Driving cleanup failed', {
            cause: error,
          });
        }
        if (failed) throw primary;
        episodes.push({ result, cleanup });
      }
  for (const item of inputs) assert.equal(digest(await readFile(item.path)), item.sha256);
  assert.equal(digest(await readFile(nativePath)), binding.native.sha256);
  await immutable(`${folder}/report.json`, {
    status: 'CAPTURE_COMPLETE',
    runtime: process.version,
    fixture: '047-native-driving-v1',
    scope:
      'Actual024/Rapier commands; synthetic authored044 lane and explicit045 stop stimulus, no048 distance planner, no timed hardware benchmark.',
    episodes,
  });
  await immutable(`${folder}/terminal.json`, {
    status: 'CAPTURE_COMPLETE',
    sourceHash: binding.sourceHash,
    reportSha256: digest(await readFile(`${folder}/report.json`)),
    completedAt: new Date().toISOString(),
  });
  console.log(
    JSON.stringify({ folder, episodes: episodes.length, sourceHash: binding.sourceHash }),
  );
} catch (error) {
  await immutable(`${folder}/failure.json`, { status: 'FAIL', causes: causes(error), episodes });
  throw error;
}

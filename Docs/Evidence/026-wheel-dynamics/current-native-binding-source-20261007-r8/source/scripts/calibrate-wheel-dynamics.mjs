import { readFile } from 'node:fs/promises';
import { archiveCapture, assertFrozen, immutable, digest, causes, requireCaptureGrant } from './wheel-capture-source.mjs';
import { CURRENT_NATIVE_REFERENCE } from '../tests/browser/wheel-dynamics-v2/current-native-reference.mjs';
const capture = process.argv[2];
if (capture !== CURRENT_NATIVE_REFERENCE.calibrationCapture) throw new Error('Explicit fresh calibration label required');
const folder = `Docs/Evidence/026-wheel-dynamics/${capture}`;
requireCaptureGrant();
const binding = await archiveCapture(folder, 'current-calibration');
try {
  const { calibrateWheels } = await import('../tests/vehicles/wheel-dynamics-fixture.ts');
  const runs = [];
  for (const classId of ['sedan', 'compact']) for (const surface of ['dry-asphalt', 'reduced-adhesion']) {
    const scenarios = [[10, 'braking'], [20, 'braking'], [30, 'braking'], [8, 'turning'], [20, 'turning'], [10, 'curb'], [10, 'airborne']];
    for (const [speed, scenario] of scenarios) {
      const index = runs.length;
      const worldAttemptAt = new Date().toISOString();
      await immutable(`${folder}/run-${index}-started.json`, { classId, surface, speed, scenario, worldAttemptAt, archiveCompletedAt: binding.completedAt });
      let world, identity, partial = null, report = null;
      const failures = [];
      try {
        report = await calibrateWheels(classId, surface, speed, scenario, {
          world: (value) => { world = value; },
          progress: (value) => { partial = value; identity ??= world.bodyIdentity('car'); },
        });
      } catch (error) { failures.push({ stage: 'calibration-or-factory-or-dispose', cause: causes(error) }); }
      const cleanup = {};
      if (world) {
        for (const [key, read] of [['bodies', () => world.bodyResources()], ['collisions', () => world.collisionResources()]])
          try { cleanup[key] = read(); } catch (error) { failures.push({ stage: `${key}-readback`, cause: causes(error) }); }
        cleanup.disposedReadRejected = false;
        if (identity) try { world.readBody(identity); } catch { cleanup.disposedReadRejected = true; }
      } else cleanup.unknown = 'Factory did not return a world; independent causes retained';
      if (cleanup.bodies?.entities !== 0 || cleanup.bodies?.subscriptions !== 0 || cleanup.collisions?.colliders !== 0 || cleanup.collisions?.disposed !== true || !cleanup.disposedReadRejected)
        failures.push({ stage: 'cleanup', cause: { message: 'Cleanup failed/UNKNOWN' } });
      await immutable(`${folder}/run-${index}-raw.json`, { classId, surface, speed, scenario, worldAttemptAt, report, partial, cleanup, failures });
      if (failures.length) {
        await immutable(`${folder}/run-${index}-failure.json`, { state: 'FAILED', failures });
        throw new Error('Fresh calibration failed; raw/partial/cleanup causes retained');
      }
      runs.push(report);
    }
  }
  await assertFrozen(binding);
  const report = { fixture: '026-flat-surfaces-calibration-v1', capturedAt: new Date().toISOString(), sourceHash: binding.sourceHash, inputs: binding.inputs, native: binding.native, archiveCompletedAt: binding.completedAt, runs };
  await immutable(`${folder}/calibration.json`, report);
  const { validateNativeCalibration } = await import('../tests/browser/wheel-dynamics-v2/numeric-reader.mjs');
  validateNativeCalibration(report);
  await immutable(`${folder}/terminal.json`, { state: 'NATIVE_CALIBRATION_NUMERIC_PASS', sourceHash: binding.sourceHash, reportHash: digest(await readFile(`${folder}/calibration.json`)), finishedAt: new Date().toISOString(), hardwareAcceptance: false });
} catch (error) {
  await immutable(`${folder}/terminal.json`, { state: 'FAILED', causes: causes(error), finishedAt: new Date().toISOString(), hardwareAcceptance: false });
  throw error;
}

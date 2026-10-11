import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import {
  archiveCapture,
  assertFrozen,
  immutable,
  digest as sha,
  requireCaptureGrant,
  recordFactoryFailure,
  recordRun,
  failTerminal,
} from './wheel-capture-source.mjs';
import { CURRENT_NATIVE_REFERENCE } from '../tests/browser/wheel-dynamics-v2/current-native-reference.mjs';

const phase = process.argv[2];
if (!['before', 'after'].includes(phase)) throw new Error('Choose before or after');
const capture = process.argv[3];
if (phase !== 'after' || capture !== CURRENT_NATIVE_REFERENCE.afterCapture)
  throw new Error('Fresh current AFTER label required; historical BEFORE/AFTER remain immutable');
const folder = `Docs/Evidence/026-wheel-dynamics/${capture}`;
requireCaptureGrant();
// Directory already existing means no retry. Never overwrite or select by performance.
const binding = await archiveCapture(folder, 'current-after');
try {
  const { manyContacts } = await import('../tests/vehicles/physics-fixture.ts');
  const warmupTicks = 180,
    measuredTicks = 600,
    runs = [];
  const channels = [
    'tick',
    'controllerMs',
    'stepMs',
    'queryMs',
    'bridgeMs',
    'totalMs',
    'projection',
  ];
  for (let pair = 0; pair < 5; pair++) {
    for (const observe of pair % 2 ? [true, false] : [false, true]) {
      const runIndex = runs.length;
      const samples = Object.fromEntries(
        channels.map((name) => [name, new Float64Array(observe ? measuredTicks : 0)]),
      );
      await immutable(`${folder}/run-${runIndex}-started.json`, {
        pair,
        observe,
        worldAttemptAt: new Date().toISOString(),
        archiveCompletedAt: binding.completedAt,
      });
      let fixture;
      try {
        fixture = await manyContacts(70);
      } catch (error) {
        await recordFactoryFailure(`${folder}/run-${runIndex}-failure.json`, error);
      }
      const { world, inputs: commands } = fixture;
      let identity;
      let report, cleanupFailed;
      const failures = [];
      let warmupCompleted = 0,
        measuredCompleted = 0;
      try {
        identity = world.bodyIdentity('car-0');
        for (let i = 0; i < warmupTicks; i++) {
          world.step(commands, false);
          warmupCompleted++;
        }
        const start = performance.now();
        for (let i = 0; i < measuredTicks; i++) {
          const tickStart = observe ? performance.now() : 0;
          const costs = world.step(commands, observe);
          const projectionStart = observe ? performance.now() : 0;
          for (const id of commands.keys()) world.project(id);
          if (observe) {
            samples.projection[i] = performance.now() - projectionStart;
            samples.tick[i] = projectionStart - tickStart;
            for (const name of channels.slice(1, -1)) samples[name][i] = costs[name];
          }
          measuredCompleted++;
        }
        const elapsedWallMs = performance.now() - start;
        const metrics = Object.fromEntries(
          channels.map((name) => {
            const data = samples[name];
            const dataSorted = data.slice().sort();
            return [
              name,
              Object.fromEntries(
                [0.5, 0.95, 0.99].map((p) => [
                  `p${p * 100}`,
                  observe ? dataSorted[Math.ceil(dataSorted.length * p) - 1] : null,
                ]),
              ),
            ];
          }),
        );
        report = {
          pair,
          observe,
          warmupTicks,
          measuredTicks,
          elapsedWallMs,
          metrics,
          sampleBytes: Object.values(samples).reduce((sum, data) => sum + data.byteLength, 0),
          physics: world.counts(),
          inputHash: sha(JSON.stringify([...commands])),
          physicalHash: sha(
            JSON.stringify(
              [...commands.keys()].map((id) => {
                // Preserve the BEFORE physical checksum when AFTER adds readonly wheel fields.
                return Object.fromEntries(
                  Object.entries(world.project(id)).filter(
                    ([key]) => key !== 'wheels' && key !== 'angularVelocityRadps',
                  ),
                );
              }),
            ),
          ),
        };
      } catch (error) {
        failures.push({ stage: 'measurement', cause: error });
      } finally {
        try {
          world.dispose();
        } catch (error) {
          failures.push({ stage: 'dispose', cause: error });
        }
        let disposedReadRejected = false;
        try {
          world.readBody(identity);
        } catch {
          disposedReadRejected = true;
        }
        let bodies, collisions;
        try {
          bodies = world.bodyResources();
        } catch (error) {
          failures.push({ stage: 'body-readback', cause: error });
        }
        try {
          collisions = world.collisionResources();
        } catch (error) {
          failures.push({ stage: 'collision-readback', cause: error });
        }
        cleanupFailed = Boolean(
          !bodies ||
          !collisions ||
          bodies?.entities ||
          bodies?.subscriptions ||
          collisions?.colliders ||
          !collisions?.disposed ||
          !disposedReadRejected,
        );
        const cleanup = { bodies, collisions, disposedReadRejected };
        if (report) report.cleanup = cleanup;
        if (cleanupFailed)
          failures.push({ stage: 'cleanup', cause: new Error('Cleanup failed/UNKNOWN') });
        await recordRun(
          `${folder}/run-${runIndex}-raw.json`,
          `${folder}/run-${runIndex}-failure.json`,
          {
            pair,
            observe,
            warmupCompleted,
            measuredCompleted,
            channels: Object.fromEntries(channels.map((name) => [name, Array.from(samples[name])])),
            report: report ?? null,
            cleanup,
          },
          failures,
        );
      }
      runs.push(report);
    }
  }
  await assertFrozen(binding);
  const report = {
    capturedAt: new Date().toISOString(),
    phase,
    fixture: '026-many-contact-projection-v1',
    sourceHash: binding.sourceHash,
    inputs: binding.inputs,
    native: binding.native,
    archiveCompletedAt: binding.completedAt,
    runtime: process.version,
    cpu: cpus()[0]?.model,
    os: `${platform()} ${release()}`,
    budgetVersion: '203-initial-1',
    scope:
      'Unpaced real Rapier CPU; no browser/frame/FPS measurement. Four wheel poses per vehicle; no retained production history.',
    runs,
  };
  await immutable(`${folder}/node.json`, report);
  // Numerical validation is deliberately before the immutable PASS terminal.
  const { readNative, verifyNativeParity, BEFORE_SOURCE } =
    await import('../tests/browser/wheel-dynamics-v2/numeric-reader.mjs');
  const { readFile } = await import('node:fs/promises');
  const before = await readNative(
    'Docs/Evidence/026-wheel-dynamics/before',
    'before',
    BEFORE_SOURCE,
  );
  await readNative(folder, 'after', binding.sourceHash, { freshCapture: true });
  const budgets = JSON.parse(await readFile('Docs/performance-budgets.json', 'utf8'));
  if (
    budgets.budgetVersion !== '203-initial-1' ||
    budgets.regressionProposal.p95RelativeIncrease !== 0.1 ||
    budgets.regressionProposal.p95AbsoluteIncreaseMs !== 1 ||
    budgets.regressionProposal.confirmationsOutOfFive !== 3 ||
    budgets.proposedBudgets.desktop.authoritativeTickP95Ms !== 5.5
  )
    throw new Error('Original native thresholds changed');
  const { readMatchedNative } =
    await import('../tests/browser/wheel-dynamics-v2/native-paired-reader.mjs');
  const matchedNative = await readMatchedNative('.', CURRENT_NATIVE_REFERENCE, report, budgets);
  verifyNativeParity(before, report, budgets, matchedNative);
  await immutable(`${folder}/terminal.json`, {
    state: 'NATIVE_NUMERIC_PASS',
    reportHash: sha(await readFile(`${folder}/node.json`)),
    sourceHash: binding.sourceHash,
    finishedAt: new Date().toISOString(),
    hardwareAcceptance: false,
  });
  console.log(
    JSON.stringify({
      saved: `${folder}/node.json`,
      sourceHash: report.sourceHash,
      runs: runs.length,
    }),
  );
} catch (error) {
  await failTerminal(`${folder}/terminal.json`, error, { hardwareAcceptance: false });
}

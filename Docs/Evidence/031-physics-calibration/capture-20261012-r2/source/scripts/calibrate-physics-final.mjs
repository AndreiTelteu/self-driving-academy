import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { localClosure, immutable, digest, assertFrozen, causes } from './wheel-capture-source.mjs';
import { calibrateWheels } from '../tests/vehicles/wheel-dynamics-fixture.ts';
import {
  CALIBRATION_SCENARIOS,
  calibrateController,
} from '../tests/vehicles/physics-calibration-fixture.ts';
import { verifyPhysicsCalibration } from './verify-physics-final.mjs';

const label = process.argv[2];
if (!/^capture-[0-9]{8}-r[0-9]+$/.test(label ?? ''))
  throw new Error('Fresh capture-YYYYMMDD-rN required');
const folder = `Docs/Evidence/031-physics-calibration/${label}`;
await mkdir(folder, { recursive: false });
const startedAt = new Date().toISOString();
const inputs = [];
const entries = [
  'scripts/calibrate-physics-final.mjs',
  'scripts/register-typescript.mjs',
  'package.json',
  'package-lock.json',
];
for (const path of await localClosure(entries)) {
  const bytes = await readFile(path);
  inputs.push({ path, bytes: bytes.length, sha256: digest(bytes) });
  await immutable(`${folder}/source/${path}`, bytes);
}
await immutable(`${folder}/source/.gitattributes`, '* -text\n');
const resolvedPath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat'));
const nativeBytes = await readFile(resolvedPath);
const nativeArchive = 'Docs/Evidence/026-wheel-dynamics/before/rapier-native-artifact.mjs';
if (digest(await readFile(nativeArchive)) !== digest(nativeBytes))
  throw new Error('Durable026 native artifact differs');
const binding = {
  sourceHash: digest(JSON.stringify(inputs)),
  inputs,
  native: {
    resolvedPath,
    archive: nativeArchive,
    bytes: nativeBytes.length,
    sha256: digest(nativeBytes),
  },
  runtime: {
    node: process.version,
    rapier: '0.21.0',
    platform: process.platform,
    arch: process.arch,
  },
  startedAt,
};
await immutable(`${folder}/binding.json`, binding);
const runs = [];
async function record(kind, run) {
  const file = `run-${runs.length}.json.gz`;
  const bytes = gzipSync(JSON.stringify(run));
  await immutable(`${folder}/${file}`, bytes);
  const { trace, curve, ...summary } = run;
  const outcome = {
    kind,
    file,
    bytes: bytes.length,
    sha256: digest(bytes),
    traceHash: trace ? digest(JSON.stringify(trace)) : null,
    commandHash: trace ? digest(JSON.stringify(trace.map((row) => row.effective))) : null,
    summary,
  };
  runs.push(outcome);
  console.log(
    `${runs.length}: ${kind} ${run.classId} ${run.surface} ${run.scenario} ${run.speedMps} ${run.source ?? ''}`,
  );
}
try {
  for (const classId of ['sedan', 'compact'])
    for (const surface of ['dry-asphalt', 'reduced-adhesion']) {
      for (const { scenario, speed } of CALIBRATION_SCENARIOS) {
        if (['braking', 'turning', 'curb'].includes(scenario))
          await record('026-reference', await calibrateWheels(classId, surface, speed, scenario));
        for (const source of ['PLAYER', 'AUTONOMY', 'PLAYER'])
          await record(
            source === 'AUTONOMY'
              ? 'autonomy'
              : runs.at(-1)?.kind === 'autonomy'
                ? 'repeat'
                : 'player',
            await calibrateController(classId, surface, scenario, speed, source),
          );
      }
    }
  await assertFrozen(binding);
  await immutable(`${folder}/matrix.json`, {
    fixture: '031-final-calibration-v1',
    validationLevel: 'functional',
    hardwareAcceptance: false,
    binding,
    finishedAt: new Date().toISOString(),
    runs,
  });
  const result = await verifyPhysicsCalibration(folder, true);
  await immutable(`${folder}/terminal.json`, { state: 'FUNCTIONAL_PASS', ...result });
} catch (error) {
  await immutable(`${folder}/failure.json`, {
    state: 'FAILED',
    causes: causes(error),
    completedRuns: runs,
    finishedAt: new Date().toISOString(),
  });
  throw error;
}

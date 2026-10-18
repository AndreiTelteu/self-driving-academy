import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { SEDAN } from '../../src/vehicles/physics.ts';
import { measureVehicle } from '../vehicles/vehicle-class-fixture.ts';
import { manyContacts } from '../vehicles/physics-fixture.ts';
import { VEHICLE_CLASSES } from '../../src/vehicles/vehicle-classes.ts';
import { access } from 'node:fs/promises';

const after = process.argv.includes('--after');
const destination = `Docs/Evidence/023-vehicle-classes/${after ? 'after-final' : 'before'}-node.json`;
try {
  await access(destination);
  throw new Error(`Immutable capture already exists: ${destination}`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const inputs = [
  'src/vehicles/physics.ts',
  'src/vehicles/rapier/index.ts',
  'src/vehicles/body-port.ts',
  'src/vehicles/body-registry.ts',
  'tests/vehicles/vehicle-class-fixture.ts',
  'tests/vehicles/physics-fixture.ts',
  'package-lock.json',
  'Docs/performance-budgets.json',
  'src/vehicles/vehicle-classes.ts',
  'tests/browser/vehicle-classes-baseline.mjs',
];
const hash = createHash('sha256');
const files = [];
for (const path of inputs) {
  const bytes = await readFile(path);
  hash.update(path).update(bytes);
  files.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const mechanical = await measureVehicle(SEDAN);
const classMechanical = after
  ? {
      sedan: await measureVehicle(VEHICLE_CLASSES.sedan),
      compact: await measureVehicle(VEHICLE_CLASSES.compact),
    }
  : null;
const runs = [];
for (let run = 0; run < 5; run++) {
  const { world, inputs: commands } = await manyContacts();
  try {
    for (let tick = 0; tick < 1800; tick++) world.step(commands, false);
    const samples = [];
    for (let tick = 0; tick < 7200; tick++) samples.push(world.step(commands).totalMs);
    samples.sort((a, b) => a - b);
    runs.push({ p95Ms: samples[Math.ceil(samples.length * 0.95) - 1], counts: world.counts() });
  } finally {
    world.dispose();
  }
}
const report = {
  capturedAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash: hash.digest('hex'),
  files,
  mechanical,
  classMechanical,
  runs,
  scope:
    'Portable CPU same70vehiclecontact workload; not hardware frame performance.30s simulated warmup/120s simulated measurement x5, not wall-time protocol.',
};
await mkdir('Docs/Evidence/023-vehicle-classes', { recursive: true });
await writeFile(destination, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));

import assert from 'node:assert/strict';
import { writeFile, readFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRapierProbe } from '../../src/vehicles/rapier/index.ts';
import { VEHICLE_CLASSES } from '../../src/vehicles/vehicle-classes.ts';
import { createCollisionEpisodes } from '../../src/vehicles/collision-episodes.ts';

const root = 'Docs/Evidence/029-vehicle-damage';
const destination = `${root}/native-impact-calibration-before.json`;
try {
  await access(destination);
  throw new Error('Immutable calibration exists');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const before = JSON.parse(await readFile(`${root}/before-node.json`, 'utf8'));
for (const input of before.inputs) {
  const bytes = await readFile(input.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), input.sha256);
}
const context = {
  schemaVersion: 1,
  units: 'SI',
  sessionId: 'damage-029-calibration',
  worldEpoch: 0,
};
const runs = [];
for (const tuning of [VEHICLE_CLASSES.sedan, VEHICLE_CLASSES.compact]) {
  for (const speedMps of [1, 3, 6, 12]) {
    const world = await createRapierProbe();
    const episodes = createCollisionEpisodes(context, world.collisionSource);
    const incidents = [];
    const samples = [];
    try {
      world.addCar('car', { x: 0, y: 0.8, z: 0 }, tuning);
      world.addNamedBox('wall', { x: 0, y: 1, z: 3 }, { x: 10, y: 1, z: 0.25 });
      for (let tick = 1; tick <= 180; tick++) world.step(new Map(), false);
      world.setVelocity('car', { x: 0, y: 0, z: speedMps });
      for (let tick = 181; tick <= 1380; tick++) {
        world.step(new Map(), false);
        const readback = world.readCollisionContacts();
        episodes.update(tick, readback.contacts);
        episodes.drain((incident) =>
          incidents.push({
            incidentId: incident.incidentId,
            tick: incident.tick,
            impulseNs: incident.impulseNs,
            vehicleId: incident.vehicleId,
            otherEntityId: incident.otherEntityId,
          }),
        );
        if (tick % 60 === 0) samples.push({ tick, state: world.project('car') });
      }
      assert.ok(incidents.length > 0, 'Actual impact must occur');
      assert.ok(incidents.length <= 20, 'Calibration retention bound');
      runs.push({ tuning, speedMps, incidents, samples, final: world.project('car') });
    } finally {
      episodes.dispose();
      world.dispose();
      assert.equal(world.bodyResources().entities, 0);
      assert.equal(world.collisionResources().colliders, 0);
    }
  }
}
await mkdir(root, { recursive: true });
await writeFile(
  destination,
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      beforeSourceHash: before.sourceHash,
      protocol:
        'Actual named-wall impulses through028; 180 settle ticks and1200 impact ticks per class/speed. Provisional calibration, no damage algorithm or FPS claim.',
      runs,
    },
    null,
    2,
  ),
  { flag: 'wx' },
);
console.log(JSON.stringify({ saved: destination, runs: runs.length }));

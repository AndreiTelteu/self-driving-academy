import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRapierProbe } from '../src/vehicles/rapier/index.ts';
import { createCollisionEpisodes } from '../src/vehicles/collision-episodes.ts';
import { createEventBus } from '../src/simulation/event-bus.ts';

const evidence = 'Docs/Evidence/028-collision-events';
if (existsSync(`${evidence}/onset-cpu.json`)) throw new Error('Preserve onset capture');
const after = JSON.parse(readFileSync(`${evidence}/after.json`));
const hashes = () =>
  Object.fromEntries(
    Object.keys(after.sourceHashes).map((file) => [
      file,
      createHash('sha256').update(readFileSync(file)).digest('hex'),
    ]),
  );
if (JSON.stringify(hashes()) !== JSON.stringify(after.sourceHashes))
  throw new Error('After closure changed');
const world = await createRapierProbe();
const report = {
  capturedAt: new Date().toISOString(),
  scope:
    'Supplemental pure onset replay of a single owned actual native positive-impulse snapshot; no repeated native tick/physical-onset claim. Epoch resets outside timing; update, exact event construction and bus delivery timed separately.',
  afterSourceHashes: after.sourceHashes,
  scriptSha256: createHash('sha256')
    .update(readFileSync('scripts/benchmark-collision-onsets.mjs'))
    .digest('hex'),
  warmup: 100,
  measured: 600,
  repetitions: 5,
  runs: [],
};
const summary = (values) => {
  const sorted = values.slice().sort((a, b) => a - b);
  return Object.fromEntries(
    [
      ['p50', 0.5],
      ['p95', 0.95],
      ['p99', 0.99],
    ].map(([key, p]) => [key, sorted[Math.floor((sorted.length - 1) * p)]]),
  );
};
try {
  world.addCar('car', { x: 0, y: 0.8, z: 0 });
  world.addNamedBox('wall', { x: 0, y: 1, z: 10 }, { x: 4, y: 1, z: 0.05 });
  for (let tick = 0; tick < 180; tick++) world.step(new Map(), false);
  world.setVelocity('car', { x: 0, y: 0, z: 45 });
  let snapshot;
  for (let tick = 0; tick < 180; tick++) {
    world.step(new Map(), false);
    const candidate = world.readCollisionContacts();
    if (candidate.contacts.some((contact) => contact.impulseNs > 0)) {
      snapshot = candidate;
      break;
    }
  }
  if (!snapshot) throw new Error('No actual positive native impulse');
  report.nativeSnapshot = {
    physicsStepSerial: snapshot.physicsStepSerial,
    contacts: snapshot.contacts.map((contact) => ({
      first: contact.first.entityId,
      second: contact.second.entityId,
      impulseNs: contact.impulseNs,
    })),
  };
  for (let repetition = 0; repetition < 5; repetition++) {
    const base = {
      schemaVersion: 1,
      units: 'SI',
      sessionId: `028-onset-${repetition}`,
      worldEpoch: 1,
    };
    const bus = createEventBus({ sessionId: base.sessionId, worldEpoch: 1 });
    const core = createCollisionEpisodes(base, world.collisionSource);
    let delivered = 0;
    bus.subscribe(() => {
      delivered++;
    });
    const update = [],
      publication = [];
    try {
      for (let iteration = 0; iteration < 700; iteration++) {
        if (iteration) {
          bus.advanceWorldEpoch(iteration + 1);
          core.reset({ ...base, worldEpoch: iteration + 1 }, world.collisionSource);
        }
        const start = performance.now();
        core.update(0, snapshot.contacts);
        const updated = performance.now();
        const result = core.drain((incident) => {
          bus.publish({
            schemaVersion: incident.schemaVersion,
            units: incident.units,
            sessionId: incident.sessionId,
            worldEpoch: incident.worldEpoch,
            eventId: incident.incidentId,
            tick: incident.tick,
            entityIds: [incident.vehicleId, incident.otherEntityId],
            type: 'COLLISION',
            payload: {
              vehicleId: incident.vehicleId,
              otherEntityId: incident.otherEntityId,
              impulseNs: incident.impulseNs,
            },
          });
        });
        const end = performance.now();
        if (result.pending || result.accepted !== snapshot.contacts.length)
          throw new Error('Incomplete onset replay delivery');
        if (iteration >= 100) {
          update.push(updated - start);
          publication.push(end - updated);
        }
      }
      report.runs.push({
        repetition,
        delivered,
        updateCpuMs: { count: update.length, ...summary(update) },
        constructionAndBusCpuMs: { count: publication.length, ...summary(publication) },
      });
    } finally {
      core.dispose();
      bus.dispose();
    }
    if (
      core.getStats().trackedPairs ||
      core.getStats().pending ||
      bus.getStats().retainedEvents ||
      bus.getStats().listeners
    )
      throw new Error('Replay resources retained');
  }
} finally {
  world.dispose();
}
if (JSON.stringify(hashes()) !== JSON.stringify(after.sourceHashes))
  throw new Error('After closure drift');
report.disposed = { body: world.bodyResources(), collision: world.collisionResources() };
report.completedAt = new Date().toISOString();
writeFileSync(`${evidence}/onset-cpu.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.runs));

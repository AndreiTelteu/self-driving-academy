// Execute only in an exclusive CPU slot. BEFORE must precede production 045.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { createRoadContext } from '../src/autonomy/road-context.ts';
import { createSimulationScheduler } from '../src/simulation/scheduling.ts';
import { createVehicleController } from '../src/vehicles/controller.ts';
import { manyContacts } from '../tests/vehicles/physics-fixture.ts';
import { CONTROLLER_CONTEXT, controllerCommand } from '../tests/vehicles/controller-reference.ts';
import { roadContextFixture } from '../tests/autonomy/road-context-reference.ts';
import { referenceBehavior, referenceFacts } from '../tests/autonomy/behavior-fsm-reference.ts';
const phase = process.argv[2];
assert.equal(phase, 'before', 'Only preproduction preparation currently supported');
const folder = 'Docs/Evidence/045-behavior-fsm',
  output = `${folder}/before.json`;
const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
};
assert.equal(await exists(output), false, 'Immutable report exists');
assert.equal(
  await exists('src/autonomy/behavior-fsm.ts'),
  false,
  'Chronological BEFORE requires absent production',
);
// Archive all local production sources: public barrels can execute settings/profile exports.
const files = execFileSync('rg', ['--files', 'src'], { encoding: 'utf8' })
  .trim()
  .split(/\r?\n/)
  .map((p) => p.replaceAll('\\', '/'));
files.push(
  'scripts/benchmark-behavior-fsm.mjs',
  'tests/autonomy/behavior-fsm-reference.ts',
  'tests/autonomy/road-context-reference.ts',
  'tests/world/intersection-conflicts-fixture.ts',
  'tests/world/spatial-index-reference.ts',
  'tests/vehicles/physics-fixture.ts',
  'tests/vehicles/controller-reference.ts',
  'scripts/register-typescript.mjs',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
);
files.sort();
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const source = createHash('sha256'),
  inputs = [];
assert.equal(await exists(`${folder}/source-before`), false);
await mkdir(`${folder}/source-before`, { recursive: true });
await writeFile(`${folder}/source-before/.gitattributes`, '* -text\n');
for (const path of files) {
  const bytes = await readFile(path);
  source.update(path).update(bytes);
  inputs.push({ path, bytes: bytes.length, sha256: hash(bytes) });
  const target = `${folder}/source-before/${path}`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}
const nativePath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat')),
  nativeBytes = await readFile(nativePath);
const nativeArtifact = { path: nativePath, bytes: nativeBytes.length, sha256: hash(nativeBytes) };
const semanticFixture = roadContextFixture(false),
  semanticRoad = createRoadContext(semanticFixture.map, { priorityPolicy: semanticFixture.policy });
semanticRoad.updateFrame(semanticFixture.frame);
const semanticContext = semanticRoad.getContext('vehicle-1', { force: true });
assert(semanticContext?.laneId);
const semanticTrace = Array.from({ length: 6 }, (_, index) =>
  referenceBehavior({
    sessionId: semanticContext.sessionId,
    worldEpoch: 0,
    actor: semanticContext.subject,
    decisionTick: 1,
    context: semanticContext,
    facts: referenceFacts(index, 0),
  }),
);
assert.deepEqual(
  semanticTrace.map((r) => r.state),
  ['BLOCKED', 'STOP', 'YIELD', 'SERVICE', 'CHANGE_LANE', 'FOLLOW'],
);
semanticRoad.dispose();
const runs = [];
const dist = (values) => {
  const v = [...values].sort((a, b) => a - b);
  return {
    p50: v[Math.floor((v.length - 1) * 0.5)],
    p95: v[Math.floor((v.length - 1) * 0.95)],
    p99: v[Math.floor((v.length - 1) * 0.99)],
  };
};
for (const count of [70, 110])
  for (let pair = 0; pair < 5; pair++)
    for (const observer of pair % 2 ? [true, false] : [false, true]) {
      const { world, inputs: physicalInputs } = await manyContacts(count);
      const fixture = roadContextFixture(false),
        road = createRoadContext(fixture.map, { priorityPolicy: fixture.policy });
      const scope = { sessionId: CONTROLLER_CONTEXT.sessionId, worldEpoch: 0 };
      const controller = createVehicleController(CONTROLLER_CONTEXT, world);
      const tokens = [...physicalInputs.keys()].map((id) => world.bodyIdentity(id));
      for (const token of tokens) controller.register(token);
      const actors = tokens.map((t) => ({ id: t.entityId, incarnation: t.generation }));
      const samples = new Float64Array(observer ? 600 : 0),
        decisionSamples = new Float64Array(observer ? 600 : 0),
        admissionSamples = new Float64Array(observer ? 600 : 0);
      let packets = [],
        stageDecisionMs = 0,
        stageAdmissionMs = 0,
        decisions = 0,
        inputsCount = 0,
        physicalTicks = 0,
        decisionDigest = 2166136261;
      const reasons = {},
        checkpoints = [];
      function publish(tick) {
        const start = observer ? performance.now() : 0;
        road.updateFrame({
          ...scope,
          tick,
          vehicles: actors.map((actor) => {
            const body = world.readBody(world.bodyIdentity(actor.id));
            const q = body.transform.rotationQuaternion,
              v = body.velocityMps;
            return {
              ...actor,
              positionM: body.transform.positionM,
              headingRad: Math.atan2(1 - 2 * (q.x * q.x + q.y * q.y), 2 * (q.x * q.z + q.w * q.y)),
              access: 'CIVIL',
              speedMps: Math.hypot(v.x, v.z),
              radiusM: 1.2,
              route: null,
              distances: [],
            };
          }),
          obstacles: [],
          zones: [],
          signals: fixture.frame.signals.map((s) => ({ ...s, tick })),
          completeness: { vehicles: true, obstacles: false, zones: false, signals: true },
        });
        if (observer) stageAdmissionMs += performance.now() - start;
      }
      world.publishBodies(0, false);
      publish(0);
      const scheduler = createSimulationScheduler({
        ...scope,
        ports: {
          input(tick) {
            inputsCount++;
            packets = [];
            if (tick % 47 === 0) {
              const actor = actors[tick % count];
              road.invalidate(actor.id, actor.incarnation);
              return { ...scope, actors: [actor] };
            }
          },
          decision(actor, tick, urgent) {
            const start = observer ? performance.now() : 0;
            const context = road.getContext(actor.id, { force: urgent });
            assert(context && context.tick < tick);
            const result = referenceBehavior({
              ...scope,
              actor,
              decisionTick: tick,
              context,
              facts: referenceFacts(Number(actor.id.slice(4)), tick),
            });
            for (const char of JSON.stringify([actor.id, result]))
              decisionDigest = Math.imul(decisionDigest ^ char.charCodeAt(0), 16777619) >>> 0;
            reasons[result.reason] = (reasons[result.reason] ?? 0) + 1;
            decisions++;
            if (observer) stageDecisionMs += performance.now() - start;
          },
          controller(actor, tick) {
            const input = physicalInputs.get(actor.id);
            packets.push({
              identity: world.bodyIdentity(actor.id),
              command: controllerCommand(actor.id, tick, 'AUTONOMY', input),
            });
          },
          physics(tick) {
            controller.step({ tick, dtSeconds: 1 / 60 }, packets, [], false);
            physicalTicks++;
            publish(tick);
          },
        },
      });
      scheduler.setActors(actors, scope);
      const advance = (tick, measure) => {
        stageDecisionMs = 0;
        stageAdmissionMs = 0;
        const start = performance.now();
        scheduler.step({ ...scope, tick, dtSeconds: 1 / 60 });
        if (observer && measure) {
          const index = tick - 181;
          samples[index] = performance.now() - start;
          decisionSamples[index] = stageDecisionMs;
          admissionSamples[index] = stageAdmissionMs;
        }
        if (tick % 60 === 0)
          checkpoints.push({
            tick,
            decisions,
            inputsCount,
            physicalTicks,
            decisionDigest,
            body: tokens
              .filter((_, i) => i === 0 || i === 35 || i === count - 1)
              .map((t) => world.project(t.entityId)),
          });
      };
      const warmStart = performance.now();
      for (let tick = 1; tick <= 180; tick++) advance(tick, false);
      const warmupWallMs = performance.now() - warmStart;
      const start = performance.now();
      for (let tick = 181; tick <= 780; tick++) advance(tick, true);
      const elapsedWallMs = performance.now() - start;
      const finalPhysicalHash = hash(JSON.stringify(tokens.map((t) => world.project(t.entityId))));
      const owned = {
        scheduler: scheduler.getStats(),
        road: road.getStats(),
        controller: controller.getStats(),
      };
      scheduler.dispose();
      road.dispose();
      controller.dispose();
      world.dispose();
      const cleanup = {
        scheduler: scheduler.getStats(),
        road: road.getStats(),
        controller: controller.getStats(),
        body: world.bodyResources(),
        collision: world.collisionResources(),
      };
      assert.equal(cleanup.body.entities, 0);
      assert.equal(cleanup.collision.colliders, 0);
      assert.equal(cleanup.scheduler.actors, 0);
      assert.equal(cleanup.road.cachedContexts, 0);
      runs.push({
        count,
        pair,
        observer,
        warmupTicks: 180,
        measuredTicks: 600,
        warmupWallMs,
        elapsedWallMs,
        sampleBytes: samples.byteLength + decisionSamples.byteLength + admissionSamples.byteLength,
        tickMs: observer ? dist(samples) : null,
        referenceDecisionMs: observer ? dist(decisionSamples) : null,
        contextAdmissionMs: observer ? dist(admissionSamples) : null,
        decisions,
        inputsCount,
        physicalTicks,
        decisionDigest,
        reasons,
        checkpoints,
        finalPhysicalHash,
        owned,
        cleanup,
      });
    }
for (const input of inputs) {
  const bytes = await readFile(input.path);
  assert.equal(bytes.length, input.bytes);
  assert.equal(hash(bytes), input.sha256);
}
assert.equal(hash(await readFile(nativePath)), nativeArtifact.sha256);
assert.equal(await exists('src/autonomy/behavior-fsm.ts'), false);
const report = {
  status: 'PASS',
  capturedAt: new Date().toISOString(),
  phase,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash: source.digest('hex'),
  inputs,
  nativeArtifact,
  budgetVersion: '203-initial-1',
  fixtureVersion: '045-native-context-scheduler-reference-v1',
  runtime: process.version,
  cpu: cpus()[0]?.model,
  os: `${platform()} ${release()}`,
  scope:
    'Unpaced Node CPU BEFORE of actual044/219/024/native70+110. Explicit synthetic six-state policy oracle is separate from identical fixed physical commands. Native contact scene may be offroad; semanticTrace uses separately authored044context. No existing productionFSM, renderer/FPS/laptop/fullgame claim.',
  semanticTrace,
  runs,
};
await writeFile(output, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({ status: report.status, sourceHash: report.sourceHash, runs: runs.length }),
);

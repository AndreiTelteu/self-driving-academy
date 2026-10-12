// Targeted local CPU adapter: actual044/045/024/Rapier, no renderer or047 actuation.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { cpus, platform, release } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { immutable, localClosure, digest } from './wheel-capture-source.mjs';
import { createRoadContext } from '../src/autonomy/road-context.ts';
import { createBehaviorFSM, projectBehaviorContext } from '../src/autonomy/behavior-fsm.ts';
import { createVehicleController } from '../src/vehicles/controller.ts';
import { createRapierProbe } from '../src/vehicles/rapier/index.ts';
import { vehicleClass } from '../src/vehicles/vehicle-classes.ts';
import { getParameterDefinition } from '../src/profiles/parameter-registry.ts';
import { CONTROLLER_CONTEXT, controllerCommand } from '../tests/vehicles/controller-reference.ts';
import { roadContextFixture } from '../tests/autonomy/road-context-reference.ts';
import { referenceFacts } from '../tests/autonomy/behavior-fsm-reference.ts';
import {
  referenceCruise,
  cruiseValues,
  cruiseProfile,
} from '../tests/autonomy/cruise-targets-reference.ts';
const phase = process.argv[2],
  label = process.argv[3];
assert(['before', 'after'].includes(phase));
assert(/^[a-z0-9-]+$/.test(label));
const folder = `Docs/Evidence/046-cruise-targets/${label}`;
await mkdir('Docs/Evidence/046-cruise-targets', { recursive: true });
await mkdir(folder);
const entries = [
  'scripts/benchmark-cruise-targets.mjs',
  'scripts/register-typescript.mjs',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
];
if (phase === 'after') entries.push('src/autonomy/cruise-targets.ts');
if (phase === 'before')
  await assert.rejects(readFile('src/autonomy/cruise-targets.ts'), { code: 'ENOENT' });
for (const key of [
  'speed_delta_urban',
  'speed_delta_residential',
  'curve_lateral_accel',
  'intersection_approach_speed',
])
  assert.equal(getParameterDefinition(key).implemented, phase === 'after');
const inputs = [],
  aggregate = createHash('sha256');
for (const path of await localClosure(entries)) {
  const bytes = await readFile(path);
  aggregate.update(path).update(bytes);
  inputs.push({ path, bytes: bytes.length, sha256: digest(bytes) });
  await immutable(`${folder}/source/${path}`, bytes);
}
await immutable(`${folder}/source/.gitattributes`, '* -text\n');
await immutable(`${folder}/.gitattributes`, '* -text\n');
const nativePath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat'));
const nativeBytes = await readFile(nativePath);
const binding = {
  phase,
  capturedAt: new Date().toISOString(),
  sourceHash: aggregate.digest('hex'),
  inputs,
  native: { path: nativePath, bytes: nativeBytes.length, sha256: digest(nativeBytes) },
};
await immutable(`${folder}/native/rapier.mjs`, nativeBytes);
await immutable(`${folder}/binding.json`, binding);
const moduleUrl = new URL('../src/autonomy/cruise-targets.ts', import.meta.url);
const production = phase === 'after' ? await import(moduleUrl.href) : null;
const profiles = production
  ? cruiseValues.map((values) => production.compileCruiseProfile(cruiseProfile(values)))
  : null;
const percentile = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * 0.95)];
const runs = [];
try {
  for (const count of [70, 110])
    for (let pair = 0; pair < 3; pair++)
      for (const observer of pair % 2 ? [true, false] : [false, true]) {
        let road,
          world,
          controller,
          behavior,
          pending,
          primaryFailed = false;
        try {
          const fixture = roadContextFixture(false),
            scope = { sessionId: CONTROLLER_CONTEXT.sessionId, worldEpoch: 0 };
          road = createRoadContext(fixture.map, { priorityPolicy: fixture.policy });
          world = await createRapierProbe();
          controller = createVehicleController(CONTROLLER_CONTEXT, world);
          behavior = createBehaviorFSM(scope);
          const actors = [],
            tokens = [],
            routes = [];
          for (let i = 0; i < count; i++) {
            const movement = fixture.conflicts.getMovement(
              'junction',
              ['west-straight', 'east-straight', 'south-straight', 'north-right'][i % 4],
            ).movement;
            const [a, b] = fixture.graph.getDirectedPath(movement.fromLaneId).points;
            const f = 0.08 + (0.84 * Math.floor(i / 4)) / (Math.ceil(count / 4) - 1),
              id = `car-${i}`,
              yaw = Math.atan2(b.x - a.x, b.z - a.z);
            const positionM = { x: a.x + (b.x - a.x) * f, y: 0.8, z: a.z + (b.z - a.z) * f };
            world.addClassCar(id, positionM, i % 2 ? 'compact' : 'sedan');
            const token = world.bodyIdentity(id);
            world.setPose(token, {
              positionM,
              rotationQuaternion: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
            });
            controller.register(token);
            tokens.push(token);
            actors.push({ id, incarnation: token.generation });
            routes.push({ intersectionId: 'junction', movementId: movement.id });
          }
          behavior.setActors(actors, scope);
          const samples = new Float64Array(observer ? 600 : 0),
            costs = new Float64Array(observer ? 600 : 0),
            physicsSamples = new Float64Array(observer ? 600 : 0);
          let trace = createHash('sha256'),
            calls = 0,
            ownMs = 0;
          const start = performance.now();
          for (let tick = 1; tick <= 780; tick++) {
            const began = performance.now();
            road.updateFrame({
              ...scope,
              tick,
              vehicles: actors.map((actor, i) => {
                const body = world.readBody(tokens[i]),
                  q = body.transform.rotationQuaternion,
                  v = body.velocityMps;
                return {
                  ...actor,
                  positionM: body.transform.positionM,
                  headingRad: Math.atan2(
                    1 - 2 * (q.x * q.x + q.y * q.y),
                    2 * (q.x * q.z + q.w * q.y),
                  ),
                  access: 'CIVIL',
                  speedMps: Math.hypot(v.x, v.z),
                  radiusM: 1.2,
                  route: routes[i],
                  distances: [],
                };
              }),
              obstacles: [],
              zones: [],
              signals: fixture.frame.signals.map((s) => ({ ...s, tick })),
              completeness: { vehicles: true, obstacles: false, zones: false, signals: true },
            });
            let stage = 0;
            for (let i = tick % 6; i < count; i += 6) {
              const fullContext = road.getContext(actors[i].id, { force: true });
              const context = projectBehaviorContext(fullContext);
              assert(context?.laneId);
              const postedLimitMps = fullContext.lane.lane.speedLimitMps;
              const decision = behavior.decide({
                ...scope,
                actor: actors[i],
                decisionTick: tick,
                context,
                facts: {
                  ...referenceFacts(i, tick),
                  profileVersionId: cruiseProfile(cruiseValues[i % 2]).versionId,
                },
              });
              const values = cruiseValues[i % 2],
                roadKind = i % 2 ? 'RESIDENTIAL' : 'URBAN',
                radius = i % 3 === 1 ? 16 : null,
                intersection = i % 3 === 2;
              const minimumRadius = vehicleClass(i % 2 ? 'compact' : 'sedan').turningRadiusM;
              const beganStage = observer ? performance.now() : 0;
              const expected = referenceCruise(
                values,
                roadKind,
                postedLimitMps,
                radius,
                intersection,
                decision.state,
                minimumRadius,
              );
              let target = expected;
              if (production) {
                const input = {
                  ...scope,
                  actor: actors[i],
                  decisionTick: tick,
                  authority: 'AUTO',
                  profile: profiles[i % 2],
                  context,
                  behavior: decision,
                  facts: {
                    version: '046-road-facts-v1',
                    ...scope,
                    subject: actors[i],
                    sourceTick: context.sourceTick,
                    laneId: context.laneId,
                    roadKind,
                    postedLimitMps,
                    curveRadiusM: radius,
                    intersectionApproach: intersection,
                  },
                  mechanics: {
                    version: '031-coverage-046-v1',
                    classId: i % 2 ? 'compact' : 'sedan',
                    classVersion: '023-mechanics-v1',
                    surface: 'dry-asphalt',
                    surfaceVersion: '026-flat-surfaces-v1',
                  },
                };
                const beganOwner = observer ? performance.now() : 0;
                target = production.evaluateCruiseTarget(input).targetMps;
                if (observer && tick > 180) {
                  ownMs += performance.now() - beganOwner;
                  calls++;
                }
              }
              assert.equal(target, expected);
              if (observer && tick > 180) {
                const cost = performance.now() - beganStage;
                stage += cost;
              }
              trace.update(JSON.stringify([i, tick, target, decision.reason]));
            }
            const realized = controller.step(
              { tick, dtSeconds: 1 / 60 },
              tokens.map((t) => ({
                identity: t,
                command: controllerCommand(t.entityId, tick, 'AUTONOMY', {
                  throttle: 0,
                  brake: 1,
                  steering: 0,
                }),
              })),
              [],
              observer,
            );
            if (observer && tick > 180) {
              samples[tick - 181] = performance.now() - began;
              costs[tick - 181] = stage;
              physicsSamples[tick - 181] = realized.physics.stepMs;
            }
          }
          const physical = digest(JSON.stringify(tokens.map((t) => world.project(t.entityId))));
          behavior.dispose();
          road.dispose();
          controller.dispose();
          world.dispose();
          assert.equal(world.bodyResources().entities, 0);
          assert.equal(behavior.getStats().actors, 0);
          assert.equal(road.getStats().cachedContexts, 0);
          runs.push({
            count,
            pair,
            observer,
            tickP95Ms: observer ? percentile(samples) : null,
            stageP95Ms: observer ? percentile(costs) : null,
            ownMeanMs: calls ? ownMs / calls : null,
            calls,
            elapsedWallMs: performance.now() - start,
            sampleBytes: samples.byteLength + costs.byteLength + physicsSamples.byteLength,
            samples: {
              tickMs: Array.from(samples),
              stageMs: Array.from(costs),
              rapierStepMs: Array.from(physicsSamples),
            },
            rapierStepP95Ms: observer ? percentile(physicsSamples) : null,
            trace: trace.digest('hex'),
            physical,
            cleanup: {
              body: world.bodyResources(),
              behavior: behavior.getStats(),
              road: road.getStats(),
              controller: controller.getStats(),
            },
          });
        } catch (error) {
          primaryFailed = true;
          pending = error;
          throw error;
        } finally {
          const failures = [];
          for (const owned of [behavior, road, controller, world])
            try {
              owned?.dispose();
            } catch (error) {
              failures.push(error);
            }
          if (failures.length)
            throw new AggregateError(
              primaryFailed ? [pending, ...failures] : failures,
              'World cleanup failed',
            );
        }
      }
  for (const input of inputs) assert.equal(digest(await readFile(input.path)), input.sha256);
  assert.equal(digest(await readFile(nativePath)), binding.native.sha256);
  await immutable(`${folder}/report.json`, {
    status: 'CAPTURE_COMPLETE',
    fixture: '046-targeted-native-v1',
    runtime: process.version,
    cpu: cpus()[0]?.model,
    os: `${platform()} ${release()}`,
    budgetVersion: '203-initial-1',
    normalTickBudgetMs: 8,
    scope:
      'Local unpaced laptop CPU; fixed brake1 commands independent of target, explicit synthetic radius/approach observations; no FPS,047 actuation or universal grip certification.',
    runs,
  });
  await immutable(`${folder}/terminal.json`, {
    status: 'CAPTURE_COMPLETE',
    reportSha256: digest(await readFile(`${folder}/report.json`)),
    completedAt: new Date().toISOString(),
    sourceHash: binding.sourceHash,
  });
  console.log(JSON.stringify({ folder, runs: runs.length, sourceHash: binding.sourceHash }));
} catch (error) {
  await immutable(`${folder}/failure.json`, {
    status: 'FAIL',
    message: error.message,
    stack: error.stack,
    completedRuns: runs,
  });
  throw error;
}

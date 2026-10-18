// 047 targeted adapter: unchanged physical brake1; policy commands independently compared.
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { readLongitudinalPower, assertLongitudinalPowerComparable } from './longitudinal-full-power.mjs';
import { referenceFullCruise, referenceFullLongitudinal, recordFullReason, assertFiniteFullBody, assertFiniteFullProjection } from './longitudinal-full-oracle.mjs';
const preflight = process.env.PBI047_FULL_MODE === 'preflight';
const protocol = Object.freeze({ mode: preflight ? 'preflight' : 'full', pacedHz: 60, warmupTicks: preflight ? 30 : 1800, measuredTicks: preflight ? 60 : 7200, pairs: preflight ? 1 : 5, populations: [70,110], offlineInstrumentationBytes: (preflight ? 60 : 7200) * 3 * 8 });
async function pace(deadline) { for (;;) { const remaining = deadline - performance.now(); if (remaining <= 0) return; await sleep(remaining); } }

import { compileCruiseProfile, evaluateCruiseTarget } from '../src/autonomy/cruise-targets.ts';
import {
  referenceLongitudinal,
  longitudinalValues,
  longitudinalProfile,
} from '../tests/autonomy/longitudinal-reference.ts';
import { readFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { cpus, platform, release } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { immutable, localClosure, digest, causes } from './wheel-capture-source.mjs';
import { createRoadContext } from '../src/autonomy/road-context.ts';
import { createBehaviorFSM, projectBehaviorContext } from '../src/autonomy/behavior-fsm.ts';
import { createVehicleController } from '../src/vehicles/controller.ts';
import { createRapierProbe } from '../src/vehicles/rapier/index.ts';
import { vehicleClass } from '../src/vehicles/vehicle-classes.ts';
import { getParameterDefinition } from '../src/profiles/parameter-registry.ts';
import { CONTROLLER_CONTEXT, controllerCommand } from '../tests/vehicles/controller-reference.ts';
import { roadContextFixture } from '../tests/autonomy/road-context-reference.ts';
import { referenceFacts } from '../tests/autonomy/behavior-fsm-reference.ts';
import { referenceCruise, cruiseValues } from '../tests/autonomy/cruise-targets-reference.ts';
assert.equal(process.env.PBI047_CPU_LEASE, 'parent-approved-exclusive');
const phase = process.argv[2],
  label = process.argv[3];
assert(['before', 'after'].includes(phase));
assert(/^[a-z0-9-]+$/.test(label));
const folder = `Docs/Evidence/047-longitudinal-control/${label}`;
await mkdir('Docs/Evidence/047-longitudinal-control', { recursive: true });
await mkdir(folder);
const runs = [];
try {
  const entries = [
    'scripts/benchmark-longitudinal-full.mjs',
    'scripts/benchmark-longitudinal-control.mjs',
    'scripts/prepare-longitudinal-full.mjs',
    'full-origin.json',
    'scripts/register-typescript.mjs',
    'package.json',
    'package-lock.json',
    'Docs/performance-budgets.json',
  ];
  if (phase === 'after') entries.push('src/autonomy/longitudinal-control.ts');
  if (phase === 'before')
    await assert.rejects(readFile('src/autonomy/longitudinal-control.ts'), { code: 'ENOENT' });
  for (const key of [
    'desired_acceleration',
    'comfort_deceleration',
    'acceleration_jerk',
    'brake_reaction_delay',
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
  const powerStart = readLongitudinalPower();
  await immutable(folder + '/power-start.json', powerStart);
  const binding = {
    protocol, powerStart,
    origin: JSON.parse(await readFile('full-origin.json')),
    phase,
    capturedAt: new Date().toISOString(),
    sourceHash: aggregate.digest('hex'),
    inputs,
    native: { path: nativePath, bytes: nativeBytes.length, sha256: digest(nativeBytes) },
  };
  await immutable(`${folder}/native/rapier.mjs`, nativeBytes);
  await immutable(`${folder}/binding.json`, binding);
  const moduleUrl = new URL('../src/autonomy/longitudinal-control.ts', import.meta.url);
  const production = phase === 'after' ? await import(moduleUrl.href) : null;
  const profiles = longitudinalValues.map((values, i) =>
    compileCruiseProfile(longitudinalProfile(values, i)),
  );
  const policyProfiles = production
    ? longitudinalValues.map((values, i) =>
        production.compileLongitudinalProfile(longitudinalProfile(values, i)),
      )
    : null;
  const percentile = (values) =>
    [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * 0.95)];
  for (const count of [70, 110])
    for (let pair = 0; pair < protocol.pairs; pair++)
      for (const observer of pair % 2 ? [true, false] : [false, true]) {
        let road,
          world,
          controller,
          behavior,
          pending,
          longitudinal,
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
          longitudinal = production?.createLongitudinalController(scope);
          longitudinal?.setActors(actors, scope);
          const targetReasonCounts = Object.create(null), phaseCounts = Object.create(null), firstMissing = new Map();
          let checkedBodyStates = 0;
          const states = actors.map(() => ({ acceleration: 0, brakeEventTick: null }));
          const targets = actors.map(() => null);
          const samples = new Float64Array(observer ? protocol.measuredTicks : 0),
            costs = new Float64Array(observer ? protocol.measuredTicks : 0),
            physicsSamples = new Float64Array(observer ? protocol.measuredTicks : 0);
          let trace = createHash('sha256'),
            calls = 0,
            ownMs = 0;
          console.log(JSON.stringify({ milestone: 'world-start', phase, count, pair, observer }));
          const start = performance.now();
          let measuredStarted = null, maxDeadlineLatenessMs = 0;
          for (let tick = 1; tick <= protocol.warmupTicks + protocol.measuredTicks; tick++) {
            if (tick === protocol.warmupTicks + 1) measuredStarted = performance.now();
            const deadline = start + tick * 1000 / 60;
            await pace(deadline);
            maxDeadlineLatenessMs = Math.max(maxDeadlineLatenessMs, performance.now() - deadline);
            const began = performance.now();
            assert.deepEqual(world.counts(), { vehicles: count, bodies: count, colliders: count + 1 });
            road.updateFrame({
              ...scope,
              tick,
              vehicles: actors.map((actor, i) => {
                const body = world.readBody(tokens[i]);
                assertFiniteFullBody(body); checkedBodyStates++;
                const
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
              const postedLimitMps = context?.laneId && fullContext?.lane ? fullContext.lane.lane.speedLimitMps : null;
              const decision = behavior.decide({
                ...scope,
                actor: actors[i],
                decisionTick: tick,
                context,
                facts: postedLimitMps === null ? null : {
                  ...referenceFacts(i, tick),
                  profileVersionId: longitudinalProfile(longitudinalValues[i % 2], i % 2).versionId,
                },
              });
              const values = cruiseValues[i % 2],
                roadKind = i % 2 ? 'RESIDENTIAL' : 'URBAN',
                radius = i % 3 === 1 ? 16 : null,
                intersection = i % 3 === 2;
              const minimumRadius = vehicleClass(i % 2 ? 'compact' : 'sedan').turningRadiusM;
              const beganStage = observer ? performance.now() : 0;
              const expected = referenceFullCruise(
                values,
                roadKind,
                postedLimitMps,
                radius,
                intersection,
                decision.state,
                minimumRadius,
              );
              let target = expected;
              {
                const input = {
                  ...scope,
                  actor: actors[i],
                  decisionTick: tick,
                  authority: 'AUTO',
                  profile: profiles[i % 2],
                  context,
                  behavior: decision,
                  facts: postedLimitMps === null ? null : {
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
                targets[i] = evaluateCruiseTarget(input);
                target = targets[i].targetMps;
                recordFullReason(targetReasonCounts, targets[i].reason);
                if (postedLimitMps === null && !firstMissing.has(actors[i].id)) {
                  assert(firstMissing.size < count);
                  const body = world.readBody(tokens[i]);
                  firstMissing.set(actors[i].id, { tick, actor: actors[i], positionM: body.transform.positionM, velocityMps: body.velocityMps, contextReason: decision.reason, targetReason: targets[i].reason });
                }
              }
              assert.equal(target, expected);
              if (observer && tick > protocol.warmupTicks) {
                const cost = performance.now() - beganStage;
                stage += cost;
              }
              trace.update(JSON.stringify([i, tick, target, decision.reason]));
            }
            for (let i = 0; i < count; i++) {
              const body = world.readBody(tokens[i]);
              const q = body.transform.rotationQuaternion,
                v = body.velocityMps;
              const speed =
                v.x * 2 * (q.x * q.z + q.w * q.y) + v.z * (1 - 2 * (q.x * q.x + q.y * q.y));
              const config = vehicleClass(i % 2 ? 'compact' : 'sedan');
              const beganStage = observer ? performance.now() : 0;
              const expected = referenceFullLongitudinal(states[i], longitudinalValues[i % 2], speed, targets[i], tick, config);
              states[i] = expected.state;
              let result = expected;
              if (production) {
                const input = {
                  ...scope,
                  actor: actors[i],
                  tick,
                  authority: 'AUTO',
                  profile: policyProfiles[i % 2],
                  target: targets[i],
                  observation: {
                    version: '047-observation-v1',
                    units: 'SI',
                    ...scope,
                    actor: actors[i],
                    tick,
                    longitudinalSpeedMps: speed,
                    classId: config.classId,
                    classVersion: config.version,
                  },
                };
                const beganOwner = observer ? performance.now() : 0;
                const evaluated = longitudinal.step(input);
                if (observer && tick > protocol.warmupTicks) {
                  ownMs += performance.now() - beganOwner;
                  calls++;
                }
                result = {
                  throttle: evaluated.command.throttle,
                  brake: evaluated.command.brake,
                  accelerationMps2: evaluated.accelerationMps2,
                  brakeEventTick: evaluated.brakeEventTick,
                  phase: evaluated.phase,
                };
              }
              for (const key of [
                'throttle',
                'brake',
                'accelerationMps2',
                'brakeEventTick',
                'phase',
              ])
                assert.equal(result[key], expected[key], key);
              phaseCounts[result.phase] = (phaseCounts[result.phase] ?? 0) + 1;
              trace.update(
                JSON.stringify([
                  i,
                  tick,
                  result.throttle,
                  result.brake,
                  result.accelerationMps2,
                  result.brakeEventTick,
                  result.phase,
                ]),
              );
              if (observer && tick > protocol.warmupTicks) stage += performance.now() - beganStage;
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
            if (observer && tick > protocol.warmupTicks) {
              samples[tick - protocol.warmupTicks - 1] = performance.now() - began;
              costs[tick - protocol.warmupTicks - 1] = stage;
              physicsSamples[tick - protocol.warmupTicks - 1] = realized.physics.stepMs;
            }
            if (tick === protocol.warmupTicks || (tick > protocol.warmupTicks && (tick - protocol.warmupTicks) % 1800 === 0)) console.log(JSON.stringify({ milestone: tick <= protocol.warmupTicks ? 'warmup-complete' : 'measurement-progress', phase, count, pair, observer, tick }));
          }
          await pace(measuredStarted + protocol.measuredTicks * 1000 / 60);
          const measuredWallMs = performance.now() - measuredStarted;
          const warmupWallMs = measuredStarted - start;
          const finalProjections = tokens.map((t) => world.project(t.entityId));
          for (const projection of finalProjections) assertFiniteFullProjection(projection);
          const physical = digest(JSON.stringify(finalProjections));
          const nativePopulation = world.counts();
          longitudinal?.dispose();
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
            warmupWallMs, measuredWallMs, maxDeadlineLatenessMs,
            targetReasonCounts, phaseCounts, checkedBodyStates, nativePopulation, firstMissing: Array.from(firstMissing.values()),
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
              longitudinal: longitudinal?.getStats() ?? null,
              body: world.bodyResources(),
              behavior: behavior.getStats(),
              road: road.getStats(),
              controller: controller.getStats(),
            },
          });
          const pairRuns = runs.filter((run) => run.count === count && run.pair === pair);
          if (pairRuns.length === 2) {
            const pairPath = folder + '/pairs/' + count + '-' + pair + '.json';
            await immutable(pairPath, { sourceHash: binding.sourceHash, nativeHash: binding.native.sha256, protocol, runs: pairRuns });
            await immutable(pairPath + '.sha256', digest(await readFile(pairPath)));
            console.log(JSON.stringify({ checkpoint: pairPath, phase, count, pair, ticks: protocol.measuredTicks }));
          }
        } catch (error) {
          primaryFailed = true;
          pending = error;
          throw error;
        } finally {
          const failures = [];
          for (const owned of [longitudinal, behavior, road, controller, world])
            try {
              owned?.dispose();
            } catch (error) {
              failures.push(error);
            }
          if (failures.length)
            // eslint-disable-next-line no-unsafe-finally -- Preserve the primary failure together with every cleanup failure.
            throw new AggregateError(
              primaryFailed ? [pending, ...failures] : failures,
              'World cleanup failed',
            );
        }
      }
  const powerEnd = readLongitudinalPower();
  await immutable(folder + '/power-end.json', powerEnd);
  assertLongitudinalPowerComparable(powerStart, powerEnd);
  for (const input of inputs) assert.equal(digest(await readFile(input.path)), input.sha256);
  assert.equal(digest(await readFile(nativePath)), binding.native.sha256);
  await immutable(`${folder}/report.json`, {
    status: 'CAPTURE_COMPLETE',
    fixture: '047-full-native-paced-v2',
    protocol,
    powerStart, powerEnd,
    offlineInstrumentationBytes: protocol.offlineInstrumentationBytes,
    runtime: process.version,
    cpu: cpus()[0]?.model,
    os: `${platform()} ${release()}`,
    budgetVersion: '203-initial-1',
    normalTickBudgetMs: 8,
    scope:
      'Real-deadline-paced60Hz local native CPU;30s warmup/120s measure per full arm, fixed brake1 independent of047; no browser FPS or laptop hardware claim.',
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
    causes: causes(error),
    completedRuns: runs,
  });
  throw error;
}

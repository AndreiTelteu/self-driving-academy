import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileLateralTrajectory,
  createLateralController,
  LATERAL_LIMITS,
} from '../../src/autonomy/lateral-controller';
import type {
  LateralInput,
  LateralObservation,
  LateralRouteRequest,
  LateralWorld,
} from '../../src/autonomy/lateral-controller';
import { createBehaviorFSM } from '../../src/autonomy/behavior-fsm';
import { vehicleClass } from '../../src/vehicles/vehicle-classes';
import { lateralFixture, referenceLateral } from './lateral-controller-reference';
import { minimalMap } from '../world/fixture';
import type { Mutable } from '../world/negative-fixtures';
import type { RoadMap } from '../../src/world/schema';
import { lateralTurnFixture } from './lateral-controller-fixture';

const world = Object.freeze({
  sessionId: 'lateral-test',
  worldEpoch: 0,
  mapId: '049-separated-curves-v1',
  mapVersionId: 'fixture-v1',
});
const actor = Object.freeze({ id: 'car', incarnation: 1 });
const registered = Object.freeze({ ...actor, classId: 'sedan' as const });
const request = (scope: LateralWorld = world): LateralRouteRequest => ({
  ...scope,
  version: '049-directed-trajectory-v1',
  id: 'curve',
  access: 'CIVIL',
  laneIds: ['lane-0'],
  loop: true,
});
const observation = (tick = 0): LateralObservation => ({
  sourceTick: tick,
  positionM: { x: -384, y: 0.8, z: -360 },
  rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
  velocityMps: { x: 0, y: 0, z: 3 },
  discontinuity: false,
});
const input = (tick = 1, obs: LateralObservation | null = observation(tick - 1)): LateralInput => ({
  ...world,
  version: '049-lateral-v1',
  actor,
  tick,
  observation: obs,
  requestedSpeedMps: 3,
});
function ready(classId: 'sedan' | 'compact' = 'sedan') {
  const owner = createLateralController(world),
    trajectory = compileLateralTrajectory(lateralFixture(1), request());
  owner.setActors([{ ...registered, classId }], world);
  owner.setTrajectory(actor, trajectory, world);
  return { owner, trajectory };
}

test('049 compiled routes use actual033 directedlane/TURN authored points and refuse fabricated tokens/gaps', () => {
  const map = minimalMap(),
    scope = { ...world, mapId: map.mapId };
  const trajectory = compileLateralTrajectory(map, {
    ...request(scope),
    laneIds: ['lane-a', 'lane-b'],
    loop: false,
  });
  assert.equal(trajectory.authoredTurnCount, 1);
  assert.deepEqual(
    trajectory.points.map((p) => p.x),
    [0, 9, 11, 20],
  );
  assert.equal(trajectory.minimumRadiusM, null);
  assert(
    Object.isFrozen(trajectory) &&
      Object.isFrozen(trajectory.points) &&
      trajectory.points.every(Object.isFrozen),
  );
  assert.throws(
    () =>
      compileLateralTrajectory(map, {
        ...request(scope),
        laneIds: ['lane-a', 'lane-c'],
        loop: false,
      }),
    /Undeclared/,
  );
  assert.throws(
    () => compileLateralTrajectory(map, { ...request(scope), laneIds: ['lane-a'], loop: true }),
    /Open/,
  );
  const { owner, trajectory: curve } = ready();
  assert.throws(() => owner.setTrajectory(actor, { ...curve }, world), /provenance/);
  assert.equal(owner.getStats().retainedVertices, 65);
  owner.dispose();
});

test('049 left/right TURN preserves all authored intermediate geometry rather than joining only lane endpoints', () => {
  for (const right of [false, true]) {
    const map = lateralTurnFixture(right),
      scope = { ...world, mapId: map.mapId };
    const trajectory = compileLateralTrajectory(map, {
      ...request(scope),
      laneIds: ['lane-a', 'lane-b'],
      loop: false,
    });
    assert.equal(trajectory.authoredTurnCount, 1);
    assert.equal(trajectory.points.length, 19);
    const authored = map.geometry.paths.find((p) => p.id === 'g-move')!;
    const nodes = new Map(map.geometry.nodes.map((n) => [n.id, n.positionM]));
    assert.deepEqual(
      trajectory.points.slice(1, -1),
      authored.nodeIds.map((id) => nodes.get(id)),
    );
    assert(Math.abs(trajectory.minimumRadiusM! - 16) < 0.000001);
    assert(trajectory.maximumHeadingStepRad < Math.PI / 9);
  }
});

test('049 actual steering matches independent exhaustive geometry without actuation/timer/longitudinal fields', () => {
  for (const classId of ['sedan', 'compact'] as const) {
    const { owner, trajectory } = ready(classId);
    const actual = owner.step(input()),
      config = vehicleClass(classId),
      obs = observation();
    const expected = referenceLateral(
      trajectory.points,
      obs.positionM,
      { x: 0, z: 1 },
      3,
      config.wheels.wheelbaseM,
      config.steeringRadians,
    );
    assert.equal(actual.reason, 'TRACKING');
    assert.equal(actual.steering, expected.steering);
    assert.equal(actual.crossTrackM, expected.crossTrackM);
    assert.deepEqual(actual.targetM, expected.target);
    assert(!Object.hasOwn(actual, 'throttle') && !Object.hasOwn(actual, 'brake'));
    assert(Object.isFrozen(actual) && Object.isFrozen(actual.actor));
    owner.dispose();
  }
});

function sampledCurve(vertices: number, radius = 16): Mutable<RoadMap> {
  const map = JSON.parse(JSON.stringify(lateralFixture(1))) as Mutable<RoadMap>;
  map.geometry.nodes = map.geometry.nodes.filter((node) => node.id.startsWith('service-node'));
  for (const node of map.geometry.nodes) node.positionM.x += radius - 16;
  const nodeIds = [];
  for (let i = 0; i < vertices; i++) {
    const angle = (i / (vertices - 1)) * 2 * Math.PI,
      id = `node-0-${i}`;
    map.geometry.nodes.push({
      id,
      positionM: { x: -400 + radius * Math.cos(angle), y: 0, z: -360 + radius * Math.sin(angle) },
    });
    nodeIds.push(id);
  }
  map.geometry.paths[0].nodeIds = nodeIds;
  return map;
}

test('049 sharp/too-tight/grade geometry and closed256vertex admission are explicit rather than teleported', () => {
  for (const [map, reason] of [
    [sampledCurve(4), 'SHARP_POLYLINE'],
    [sampledCurve(65, 2), 'MECHANICALLY_INFEASIBLE'],
  ] as const) {
    const trajectory = compileLateralTrajectory(map, request()),
      owner = createLateralController(world);
    owner.setActors([registered], world);
    owner.setTrajectory(actor, trajectory, world);
    assert.equal(
      owner.step({
        ...input(),
        observation: { ...observation(), positionM: { ...trajectory.points[0], y: 0.8 } },
      }).reason,
      reason,
    );
    owner.dispose();
  }
  const grade = sampledCurve(65);
  grade.geometry.nodes.find((n) => n.id === 'node-0-1')!.positionM.y = 2;
  const trajectory = compileLateralTrajectory(grade, request()),
    owner = createLateralController(world);
  owner.setActors([registered], world);
  owner.setTrajectory(actor, trajectory, world);
  assert.equal(owner.step(input()).reason, 'UNSUPPORTED_GRADE');
  owner.dispose();
  assert.throws(() => compileLateralTrajectory(sampledCurve(257), request()), /vertex capacity/);
  const maximum = compileLateralTrajectory(sampledCurve(256), request());
  assert.equal(maximum.points.length, 256);
  const full = createLateralController(world),
    actors = Array.from({ length: 110 }, (_, i) => ({ ...registered, id: `capacity-${i}` }));
  full.setActors(actors, world);
  for (const value of actors)
    full.setTrajectory({ id: value.id, incarnation: value.incarnation }, maximum, world);
  assert.equal(full.getStats().retainedVertices, 28160);
  full.dispose();
});

test('049 null/stale/discontinuous/future/height/heading/reverse observations and overspeed have explicit reasons', () => {
  const { owner } = ready();
  const cases: readonly [LateralObservation | null, string, number][] = [
    [null, 'MISSING_OBSERVATION', 3],
    [observation(0), 'STALE_OBSERVATION', 3],
    [{ ...observation(3), sourceTick: 100 }, 'STALE_OBSERVATION', 3],
    [{ ...observation(4), discontinuity: true }, 'OBSERVATION_DISCONTINUITY', 3],
    [{ ...observation(5), positionM: { x: -384, y: 10, z: -360 } }, 'HEIGHT_MISMATCH', 3],
    [{ ...observation(6), rotationQuaternion: { x: 0, y: 1, z: 0, w: 0 } }, 'HEADING_MISMATCH', 3],
    [{ ...observation(7), velocityMps: { x: 0, y: 0, z: -3 } }, 'REVERSE_MOTION', 3],
    [observation(8), 'REQUESTED_OVERSPEED', 20],
    [{ ...observation(9), velocityMps: { x: 0, y: 0, z: 20 } }, 'ACTUAL_OVERSPEED', 3],
  ];
  cases.forEach(([obs, reason, speed], i) => {
    const actual = owner.step({ ...input(i + 2, obs), requestedSpeedMps: speed });
    assert.equal(actual.reason, reason);
    assert.equal(actual.feasible, false);
    assert.equal(actual.steering, 0);
  });
  owner.dispose();
});

test('049 posted speed/style and045 state only affect lateral control through explicit owner choices', () => {
  const map = minimalMap(),
    scope = { ...world, mapId: map.mapId },
    owner = createLateralController(scope);
  const trajectory = compileLateralTrajectory(map, {
    ...request(scope),
    laneIds: ['lane-a', 'lane-b'],
    loop: false,
  });
  owner.setActors([registered], scope);
  owner.setTrajectory(actor, trajectory, scope);
  const q = { x: 0, y: Math.sin(Math.PI / 4), z: 0, w: Math.cos(Math.PI / 4) };
  const actual = owner.step({
    ...input(),
    ...scope,
    observation: {
      ...observation(),
      positionM: { x: 4, y: 0.8, z: 0 },
      rotationQuaternion: q,
      velocityMps: { x: 20, y: 0, z: 0 },
    },
    requestedSpeedMps: 20,
  });
  assert.equal(trajectory.speedLimitMps, 13.4);
  assert.equal(actual.reason, 'TRACKING');
  assert.equal(actual.advisorySpeedLimitMps, 100);
  const behavior = createBehaviorFSM({ sessionId: world.sessionId, worldEpoch: 0 });
  behavior.setActors([actor], { sessionId: world.sessionId, worldEpoch: 0 });
  const stop = behavior.decide({
    sessionId: world.sessionId,
    worldEpoch: 0,
    actor,
    decisionTick: 2,
    context: {
      sessionId: world.sessionId,
      worldEpoch: 0,
      sourceTick: 1,
      subject: actor,
      laneId: 'lane-a',
      leaderId: null,
      vehiclesComplete: true,
      discontinuity: false,
    },
    facts: {
      version: '045-decision-facts-v1',
      profileVersionId: 'explicit-style',
      routeBlocked: false,
      stop: 'REQUESTED',
      yield: 'NONE',
      service: 'NONE',
      laneChange: 'NONE',
    },
  });
  assert.equal(stop.state, 'STOP');
  // Caller explicitly retires the trajectory; no implicit regulatory correction lives in049.
  owner.setTrajectory(actor, null, scope);
  assert.equal(owner.step({ ...input(2), ...scope }).reason, 'NO_TRAJECTORY');
  behavior.dispose();
  owner.dispose();
});

test('049 authority/tick/mapversion/incarnation/epoch fences release routes without reopening old ticks', () => {
  const { owner, trajectory } = ready();
  owner.step(input());
  owner.setAuthority(actor, 'MANUAL', world);
  assert.equal(owner.getStats().retainedVertices, 0);
  assert.throws(() => owner.step(input(2)), /authority/);
  owner.setAuthority(actor, 'AUTO', world);
  owner.setTrajectory(actor, trajectory, world);
  assert.throws(() => owner.step(input(1)), /advance/);
  assert.throws(() => owner.step({ ...input(2), mapVersionId: 'foreign' }), /Foreign/);
  owner.setActors([], world);
  assert.equal(owner.getStats().retiredIdentities, 1);
  assert.throws(() => owner.setActors([registered], world), /newer/);
  const newer = { ...registered, incarnation: 2 };
  owner.setActors([newer], world);
  assert.throws(() => owner.setTrajectory(actor, trajectory, world), /Stale/);
  assert.throws(() => owner.setActors([{ ...newer, classId: 'compact' }], world), /Mechanical/);
  const next = { ...world, worldEpoch: 1 };
  owner.reset(next);
  assert.equal(owner.getStats().identities, 0);
  owner.setActors([registered], next);
  assert.throws(() => owner.setTrajectory(actor, trajectory, next), /Stale trajectory/);
  assert.throws(() => owner.reset(next), /new world epoch/);
  owner.dispose();
  owner.dispose();
  assert.equal(owner.getStats().actors, 0);
  assert.throws(() => owner.step(input()), /disposed/);
});

test('049 malformed/getter/sparse/reentrant boundaries reject before owner mutation', () => {
  const { owner, trajectory } = ready();
  const first = owner.step(input());
  let reads = 0;
  const getter = { ...input(2) };
  Object.defineProperty(getter, 'observation', {
    enumerable: true,
    get() {
      reads++;
      return observation(1);
    },
  });
  assert.throws(() => owner.step(getter), /data fields/);
  assert.equal(reads, 0);
  assert.equal(owner.read(actor, world), first);
  assert.throws(
    () =>
      owner.step({
        ...input(2),
        observation: { ...observation(1), positionM: { x: NaN, y: 0, z: 0 } },
      }),
    /finite/,
  );
  const sparse = new Array(1) as (typeof registered)[];
  assert.throws(() => owner.setActors(sparse, world), /dense|data entries/);
  const proxy = new Proxy(input(2), {
    ownKeys(target) {
      owner.dispose();
      return Reflect.ownKeys(target);
    },
  });
  assert.throws(() => owner.step(proxy), /reentrant/);
  assert.equal(owner.read(actor, world), first);
  const badRequest = { ...request(), extra: true };
  assert.throws(() => compileLateralTrajectory(lateralFixture(1), badRequest), /unknown/);
  const compileProxy = new Proxy(request(), {
    ownKeys(target) {
      compileLateralTrajectory(lateralFixture(1), request());
      return Reflect.ownKeys(target);
    },
  });
  assert.throws(() => compileLateralTrajectory(lateralFixture(1), compileProxy), /reentrant/);
  assert.throws(() => owner.setTrajectory(actor, new Proxy(trajectory, {}), world), /provenance/);
  owner.dispose();
});

test('049110owner/256geometry/1024protectedidentity capacities are atomic and20lifecycles release strong ownership', () => {
  const trajectory = compileLateralTrajectory(lateralFixture(1), request());
  for (let cycle = 0; cycle < 20; cycle++) {
    const owner = createLateralController(world),
      actors = Array.from({ length: 110 }, (_, i) => ({ ...registered, id: `car-${i}` }));
    owner.setActors(actors, world);
    for (const value of actors)
      owner.setTrajectory({ id: value.id, incarnation: value.incarnation }, trajectory, world);
    assert.equal(owner.getStats().retainedVertices, 7150);
    assert.throws(
      () => owner.setActors([...actors, { ...registered, id: 'overflow' }], world),
      /capacity/,
    );
    assert.equal(owner.getStats().actors, 110);
    owner.setActors([], world);
    assert.equal(owner.getStats().retainedVertices, 0);
    assert.equal(owner.getStats().projections, 0);
    owner.dispose();
    assert.equal(owner.getStats().identities, 0);
  }
  const owner = createLateralController(world);
  for (let i = 0; i < LATERAL_LIMITS.identitiesPerEpoch; i++)
    owner.setActors([{ ...registered, id: `identity-${i}` }], world);
  const before = owner.getStats();
  assert.throws(
    () => owner.setActors([{ ...registered, id: 'overflow' }], world),
    /identity capacity/,
  );
  assert.deepEqual(owner.getStats(), before);
  owner.dispose();
});

test('049 descriptor snapshots prevent unsafe caller re-read and mutable-object cache/TOCTOU reuse', () => {
  const expectedOwner = ready().owner,
    owner = ready().owner;
  const expected = expectedOwner.step(input());
  const sample = observation(0),
    quaternion = { ...sample.rotationQuaternion };
  let directReads = 0;
  const guardedQuaternion = new Proxy(quaternion, {
    get() {
      directReads++;
      throw new Error('Unsafe direct get');
    },
  });
  const guardedPosition = new Proxy(
    { ...sample.positionM },
    {
      ownKeys(target) {
        quaternion.y = Math.sin(Math.PI / 4);
        quaternion.w = Math.cos(Math.PI / 4);
        return Reflect.ownKeys(target);
      },
    },
  );
  const packet = {
    ...input(),
    observation: { ...sample, rotationQuaternion: guardedQuaternion, positionM: guardedPosition },
  };
  assert.deepEqual(owner.step(packet), expected);
  assert.equal(directReads, 0);
  const prior = owner.read(actor, world);
  const extra = { ...input(2), [Symbol('extra')]: true };
  assert.throws(() => owner.step(extra), /unknown/);
  const disguised = { ...input(2) } as unknown as Record<PropertyKey, unknown>;
  delete disguised.version;
  disguised[Symbol('replacement')] = '049-lateral-v1';
  assert.throws(() => owner.step(disguised as unknown as LateralInput), /unknown/);
  const keySpoof = new Proxy(input(2), {
    ownKeys(target) {
      return Reflect.ownKeys(target).map((key) => (key === 'version' ? Symbol('spoof') : key));
    },
  });
  assert.throws(() => owner.step(keySpoof), /unknown/);
  assert.equal(owner.read(actor, world), prior);
  // The same caller packet is revalidated every call; no WeakMap identity admission cache.
  packet.tick = 2;
  packet.observation.sourceTick = 1;
  Object.defineProperty(packet.observation, 'discontinuity', {
    enumerable: true,
    get() {
      directReads++;
      return false;
    },
  });
  assert.throws(() => owner.step(packet), /data fields/);
  assert.equal(directReads, 0);
  assert.equal(owner.read(actor, world), prior);
  expectedOwner.dispose();
  owner.dispose();
});

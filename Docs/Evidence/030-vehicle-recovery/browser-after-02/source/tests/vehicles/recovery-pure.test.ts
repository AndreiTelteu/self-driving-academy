import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createRecoveryLedger,
  RECOVERY_RECORD_RESERVE_BYTES,
} from '../../src/vehicles/recovery-ledger';
import type { RecoveryRecord } from '../../src/vehicles/recovery-ledger';
import { recoveryFootprintFits, issueRecoveryRoad } from '../../src/vehicles/recovery-road';
import { recoveryTransform } from '../../src/vehicles/recovery-port';
import { createVehicleController } from '../../src/vehicles/controller';
import { createEventBus } from '../../src/simulation/event-bus';
import { CONTROLLER_CONTEXT, controllerCommand } from './controller-reference';
import type { BodyIdentity } from '../../src/vehicles/body-port';
import { createRecoveryRoadProvider } from '../../src/app/vehicle-recovery-road';
import { recoveryRoadFixture } from '../browser/vehicle-recovery/road-fixture';

const pose = (x = 0, z = 0) => ({
  positionM: { x, y: 0.75, z },
  rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
});
const road = () =>
  issueRecoveryRoad({
    mapId: 'map',
    laneId: 'lane',
    access: 'TAXI',
    start: { x: 0, y: 0, z: -10 },
    end: { x: 0, y: 0, z: 10 },
    widthM: 4,
  });

test('only strict parser outputs reuse an immutable transform; caller freezing and replacement never brand it', () => {
  const input = pose();
  const parsed = recoveryTransform(input);
  assert.notEqual(parsed, input);
  assert.notEqual(parsed.positionM, input.positionM);
  assert.notEqual(parsed.rotationQuaternion, input.rotationQuaternion);
  assert(
    Object.isFrozen(parsed) &&
      Object.isFrozen(parsed.positionM) &&
      Object.isFrozen(parsed.rotationQuaternion),
  );
  assert.equal(recoveryTransform(parsed), parsed);
  input.positionM.x = 2;
  assert.equal(parsed.positionM.x, 0);
  assert.equal(recoveryTransform(input).positionM.x, 2);
  const externallyFrozen = Object.freeze({
    positionM: Object.freeze({ ...parsed.positionM }),
    rotationQuaternion: Object.freeze({ ...parsed.rotationQuaternion }),
  });
  assert.notEqual(recoveryTransform(externallyFrozen), externallyFrozen);
  const replacement = { ...parsed, positionM: { ...parsed.positionM, z: 3 } };
  assert.notEqual(recoveryTransform(replacement), parsed);
  assert.equal(recoveryTransform(replacement).positionM.z, 3);
  assert.equal(parsed.positionM.z, 0);
});

test('frozen or copied transforms still reject getters, inheritance, extra fields and malformed nested vectors without getter invocation', () => {
  const parsed = recoveryTransform(pose());
  let called = 0;
  const getter = Object.freeze({
    get positionM() {
      called++;
      return parsed.positionM;
    },
    rotationQuaternion: parsed.rotationQuaternion,
  });
  const nestedGetter = Object.freeze({
    positionM: Object.freeze({
      get x() {
        called++;
        return 0;
      },
      y: 0.75,
      z: 0,
    }),
    rotationQuaternion: parsed.rotationQuaternion,
  });
  for (const value of [
    getter,
    nestedGetter,
    Object.create(parsed),
    Object.freeze({ ...parsed, extra: true }),
    Object.freeze({ ...parsed, positionM: Object.freeze({ ...parsed.positionM, extra: true }) }),
    Object.freeze({ ...parsed, positionM: Object.freeze({ ...parsed.positionM, x: NaN }) }),
    Object.freeze({
      ...parsed,
      rotationQuaternion: Object.freeze({ ...parsed.rotationQuaternion, w: 2 }),
    }),
    Object.freeze({ ...parsed, rotationQuaternion: Object.freeze({ x: 1, y: 0, z: 0, w: 0 }) }),
  ])
    assert.throws(() => recoveryTransform(value));
  assert.equal(called, 0);
  assert.equal(recoveryTransform(parsed), parsed);
});

test('every nonfinite transform component remains rejected before it can become a reusable parser output', () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    for (const key of ['x', 'y', 'z'] as const)
      assert.throws(() =>
        recoveryTransform({ ...pose(), positionM: { ...pose().positionM, [key]: bad } }),
      );
    for (const key of ['x', 'y', 'z', 'w'] as const)
      assert.throws(() =>
        recoveryTransform({
          ...pose(),
          rotationQuaternion: { ...pose().rotationQuaternion, [key]: bad },
        }),
      );
  }
});
function record(operationId: string): RecoveryRecord {
  return {
    context: CONTROLLER_CONTEXT,
    operationId,
    vehicleId: 'car',
    bodyGeneration: 1,
    pointId: 'point',
    mapId: 'map',
    laneId: 'lane',
    access: 'TAXI',
    mode: 'MANUAL',
    validatedTick: 1,
    requestedTick: 1,
    acceptedTick: 1,
    origin: 'R',
    kind: 'TELEPORT',
    learningEligible: false,
    status: 'ADMITTED',
    before: null,
    placement: null,
    deliveredStages: 0,
    failure: null,
  };
}
test('entire oriented footprint rejects corners, wrong direction, unissued and sloped evidence', () => {
  const r = road();
  assert.equal(recoveryFootprintFits(r, pose(), 1.1, 2), true);
  assert.equal(recoveryFootprintFits(r, pose(1), 1.1, 2), false);
  assert.equal(recoveryFootprintFits(r, pose(0, 9), 1.1, 2), false);
  assert.equal(
    recoveryFootprintFits(r, { ...pose(), rotationQuaternion: { x: 0, y: 1, z: 0, w: 0 } }, 1.1, 2),
    false,
  );
  assert.throws(() => recoveryFootprintFits({ ...r }, pose(), 1, 2));
  assert.throws(() => issueRecoveryRoad({ ...r, end: { x: 0, y: 1, z: 10 } }));
  let called = 0;
  assert.throws(() =>
    recoveryTransform({
      get positionM() {
        called++;
        return pose().positionM;
      },
      rotationQuaternion: pose().rotationQuaternion,
    }),
  );
  assert.equal(called, 0);
  assert.throws(() =>
    recoveryFootprintFits(r, { ...pose(), rotationQuaternion: { x: 1, y: 0, z: 0, w: 0 } }, 1, 2),
  );
  const graph = recoveryRoadFixture().graph;
  const provider = createRecoveryRoadProvider(graph);
  assert.equal(provider.locate(pose(), 'TAXI')!.mapId, graph.mapId);
  assert.equal(
    createRecoveryRoadProvider({ ...graph, getDirectedPath: () => null }).locate(pose(), 'TAXI'),
    null,
  );
  assert.equal(
    createRecoveryRoadProvider({
      ...graph,
      getDirectedPath: (id) => ({ ...graph.getDirectedPath(id)!, laneId: 'foreign' }),
    }).locate(pose(), 'TAXI'),
    null,
  );
  assert.throws(() =>
    createRecoveryRoadProvider({
      ...graph,
      get mapId() {
        return 'x'.repeat(129);
      },
    }),
  );
});
test('protected UTF8 ledger counts array delimiters, denies overflow before admission and never evicts', () => {
  const ledger = createRecoveryLedger(),
    first = record('汉🚕');
  const index = ledger.admit(first, 'exact');
  assert.equal(
    ledger.getStats().serializedBytes,
    new TextEncoder().encode(JSON.stringify([first])).byteLength,
  );
  assert.deepEqual(ledger.lookup('汉🚕', 'exact'), first);
  assert.throws(() => ledger.lookup('汉🚕', 'different'));
  ledger.update(index, { ...first, status: 'DENIED' });
  ledger.finish(index);
  assert.throws(() => ledger.finish(index));
  let admitted = 1;
  for (;;) {
    try {
      ledger.admit(record('op-' + admitted), String(admitted));
      admitted++;
    } catch {
      break;
    }
  }
  assert(admitted > 1 && admitted <= 4096);
  assert(ledger.getStats().serializedBytes + ledger.getStats().reservedBytes <= 4 * 1024 * 1024);
  assert.equal(ledger.readHistory(0, 1)[0]!.operationId, '汉🚕');
  assert.throws(() => ledger.readHistory(0, 65));
});
test('record reservation contains full worst-shape scalar evidence and maximum UTF8 identifiers', () => {
  const wide = '汉'.repeat(256),
    vector = { x: -Number.MAX_VALUE, y: -Number.MAX_VALUE, z: -Number.MAX_VALUE };
  const snapshot = {
    physicsStepSerial: Number.MAX_SAFE_INTEGER,
    transform: { positionM: vector, rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 } },
    velocityMps: vector,
    angularVelocityRadS: vector,
  };
  const worst = {
    ...record(wide + wide),
    context: { ...CONTROLLER_CONTEXT, sessionId: wide },
    vehicleId: wide,
    pointId: wide + wide + wide,
    mapId: wide.slice(0, 128),
    laneId: wide.slice(0, 128),
    before: snapshot,
    placement: {
      status: 'SAFE',
      physicsStepSerial: Number.MAX_SAFE_INTEGER,
      colliderCount: 256,
      after: snapshot,
      attempted: 5,
      completed: 5,
      failure: '汉'.repeat(512),
    },
    failure: '汉'.repeat(512),
  };
  assert(
    new TextEncoder().encode(JSON.stringify(worst)).byteLength <= RECOVERY_RECORD_RESERVE_BYTES,
  );
});
test('addressed invalidation preserves native tick, other AUTO target, and actual PLAYER authority', () => {
  const a: BodyIdentity = Object.freeze({ entityId: 'a', handle: 1, generation: 1 });
  const b: BodyIdentity = Object.freeze({ entityId: 'b', handle: 2, generation: 2 });
  let steps = 0;
  const controller = createVehicleController(CONTROLLER_CONTEXT, {
    bodyIdentity: (id) => (id === 'a' ? a : b),
    step() {
      steps++;
      return {
        controllerMs: 0,
        stepMs: 0,
        queryMs: 0,
        bridgeMs: 0,
        totalMs: 0,
        queryCount: 0,
        bridgeCalls: 0,
      };
    },
  });
  controller.register(a);
  controller.register(b);
  controller.step(
    { tick: 1, dtSeconds: 1 / 60 },
    [
      { identity: a, command: controllerCommand('a', 1, 'PLAYER', { throttle: 1 }) },
      { identity: b, command: controllerCommand('b', 1, 'AUTONOMY', { throttle: 0.5 }) },
    ],
    [{ identity: a, mode: 'LEARNING' }],
  );
  const before = controller.readControl(b),
    stats = controller.getStats();
  controller.invalidateRealization!(a, 1, 'LEARNING');
  assert.equal(controller.readControl(a), undefined);
  assert.equal(controller.readControl(b), before);
  assert.equal(controller.getStats().tick, stats.tick);
  assert.equal(controller.getStats().players, 1);
  assert.equal(steps, 1);
  assert.throws(() => controller.invalidateRealization!(a, 0, 'LEARNING'));
  assert.throws(() => controller.invalidateRealization!({ ...a }, 1, 'LEARNING'));
  assert.throws(() => controller.invalidateRealization!(b, 1, 'MANUAL'));
  controller.dispose();
});
test('007 exact non-mutating admission predicts duplicate/conflict/capacity without listeners', () => {
  const bus = createEventBus({ ...CONTROLLER_CONTEXT, maxEventsPerEpoch: 1 });
  let calls = 0;
  bus.subscribe(() => {
    calls++;
  });
  const event = {
    ...CONTROLLER_CONTEXT,
    type: 'VEHICLE_RECOVERED',
    eventId: 'r',
    tick: 1,
    entityIds: ['car'],
    payload: { vehicleId: 'car', recoveryPointId: 'point' },
  };
  assert.equal(bus.inspectPublication!(event), 'new');
  assert.equal(calls, 0);
  assert.equal(bus.getStats().retainedEvents, 0);
  bus.publish(event);
  assert.equal(bus.inspectPublication!(event), 'duplicate');
  assert.equal(calls, 1);
  assert.throws(() => bus.inspectPublication!({ ...event, eventId: 'other' }));
  assert.throws(() =>
    bus.inspectPublication!({
      ...event,
      payload: { ...event.payload, recoveryPointId: 'changed' },
    }),
  );
  bus.dispose();
});

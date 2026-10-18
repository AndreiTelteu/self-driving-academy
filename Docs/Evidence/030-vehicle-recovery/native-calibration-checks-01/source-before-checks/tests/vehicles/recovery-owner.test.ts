import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVehicleRecovery } from '../../src/vehicles/recovery-state';
import { createVehicleController } from '../../src/vehicles/controller';
import { createVehicleDamage } from '../../src/vehicles/damage-state';
import { createControlAuthority } from '../../src/input/control-authority';
import { createEventBus } from '../../src/simulation/event-bus';
import { createRecoveryRoadProvider } from '../../src/app/vehicle-recovery-road';
import { recoveryRoadFixture } from '../browser/vehicle-recovery/road-fixture';
import { CONTROLLER_CONTEXT } from './controller-reference';
import type { BodyIdentity } from '../../src/vehicles/body-port';
import type { PhysicsProbe } from '../../src/vehicles/physics';
import type {
  PhysicsRecoveryPort,
  RecoveryPlacementResult,
} from '../../src/vehicles/recovery-port';
import { CollisionRegistry } from '../../src/vehicles/collision-port';
import type { CollisionIdentity } from '../../src/vehicles/collision-port';

/** Injected owner-order test only. Real geometric/native acceptance is in recovery-native.test.ts. */
function fixture() {
  const identity: BodyIdentity = Object.freeze({ entityId: 'subject', handle: 1, generation: 1 });
  const collisions = new CollisionRegistry();
  collisions.register('subject', 'VEHICLE', 1);
  collisions.register('wall', 'OBSTACLE', 2);
  let serial = 0,
    applies = 0,
    released = 0,
    blocked = false,
    partial = false,
    segmentFails = false,
    preflightStep = false;
  const order: string[] = [];
  const pose = {
    positionM: { x: 0, y: 0.75, z: 0 },
    rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
  };
  const state = () =>
    Object.freeze({
      identity,
      physicsStepSerial: serial,
      transform: pose,
      velocityMps: { x: 0, y: 0, z: 0 },
      angularVelocityRadS: { x: 0, y: 0, z: 0 },
    });
  const native: PhysicsRecoveryPort = {
    readNative: state,
    inspectPlacement: () => ({
      status: blocked ? 'BLOCKED' : 'SAFE',
      physicsStepSerial: serial,
      colliderCount: 2,
      blockingColliderHandle: blocked ? 2 : null,
    }),
    applyPlacement(request): RecoveryPlacementResult {
      applies++;
      order.push('native');
      return {
        inspection: native.inspectPlacement(request),
        before: state(),
        after: state(),
        attempted: blocked ? 0 : partial ? 2 : 5,
        completed: blocked ? 0 : partial ? 1 : 5,
        failure: partial ? 'Injected partial native setter' : null,
      };
    },
    release() {
      released++;
    },
  };
  const physics = {
    bodyIdentity: (id: string) => (id === identity.entityId ? identity : undefined),
    collisionSource: { isCurrent: (token: CollisionIdentity) => collisions.isCurrent(token) },
    collisionIdentity: (id: string) => collisions.identity(id),
    collisionStepSerial: () => serial,
    createRecoveryPort: () => native,
    project: () => ({
      id: 'subject',
      position: pose.positionM,
      rotation: pose.rotationQuaternion,
      velocity: { x: 0, y: 0, z: 0 },
      speed: 0,
      suspension: [0.3, 0.3, 0.3, 0.3],
      wheelContacts: 4,
    }),
    step() {
      serial++;
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
  } as unknown as PhysicsProbe;
  const damage = createVehicleDamage(CONTROLLER_CONTEXT, physics);
  damage.register(identity, 1400);
  const controller = createVehicleController(CONTROLLER_CONTEXT, physics, 0, {
    availability: damage,
  });
  const authority = createControlAuthority(CONTROLLER_CONTEXT, controller, physics);
  authority.register(identity);
  const eventBus = createEventBus(CONTROLLER_CONTEXT);
  eventBus.subscribe(() => {
    order.push('event');
  });
  const originalInvalidate = controller.invalidateRealization!.bind(controller);
  controller.invalidateRealization = (...args) => {
    order.push('invalidate');
    originalInvalidate(...args);
  };
  const recovery = createVehicleRecovery(CONTROLLER_CONTEXT, {
    physics,
    controller,
    authority,
    damage,
    road: createRecoveryRoadProvider(recoveryRoadFixture().graph),
    eventBus,
    clearAddressedInput: (token) => {
      assert.equal(token, identity);
      order.push('clear');
    },
    segments: {
      inspect() {
        if (preflightStep) serial++;
      },
      close() {
        order.push('segment');
        if (segmentFails) throw new Error('segment failure');
      },
    },
  });
  recovery.register(identity, 'TAXI');
  const step = (observe = true) => {
    const at = serial + 1;
    authority.step(
      { ...CONTROLLER_CONTEXT, version: '066-control-authority-v1', tick: at, dtSeconds: 1 / 60 },
      [],
      at === 1 ? [{ identity, mode: 'MANUAL' }] : [],
    );
    if (observe) recovery.observe(at);
  };
  const request = () =>
    recovery.request({
      context: CONTROLLER_CONTEXT,
      identity,
      mode: 'MANUAL',
      tick: serial,
      origin: 'R',
    });
  const dispose = () => {
    recovery.dispose();
    eventBus.dispose();
    authority.dispose();
    controller.dispose();
    damage.dispose();
    collisions.dispose();
  };
  return {
    recovery,
    damage,
    eventBus,
    identity,
    step,
    request,
    order,
    dispose,
    get applies() {
      return applies;
    },
    get serial() {
      return serial;
    },
    get released() {
      return released;
    },
    setBlocked: (value: boolean) => {
      blocked = value;
    },
    setPartial: () => {
      partial = true;
    },
    setSegmentFails: (value: boolean) => {
      segmentFails = value;
    },
    injectPreflightStep: () => {
      preflightStep = true;
    },
    immobilize: () =>
      damage.applyIncident({
        ...CONTROLLER_CONTEXT,
        incidentId: 'injected-pure-onset',
        tick: serial,
        vehicleId: 'subject',
        otherEntityId: 'wall',
        impulseNs: 11200,
        first: collisions.identity('subject')!,
        second: collisions.identity('wall')!,
      }),
  };
}
test('explicit R no-point leaves physical/mobility/history unchanged', () => {
  const f = fixture();
  try {
    f.step(false);
    f.request();
    assert.equal(f.recovery.commit(f.serial), 'NO_VALID_POINT');
    assert.equal(f.applies, 0);
    assert.equal(f.damage.readHistory().length, 0);
    assert.equal(f.eventBus.getStats().retainedEvents, 0);
  } finally {
    f.dispose();
  }
  assert.equal(f.released, 1);
});
test('real controller/damage/event owner order is addressed, explicit, idempotent and non-learning', () => {
  const f = fixture();
  try {
    for (let i = 0; i < 6; i++) f.step();
    f.immobilize();
    const prefix = f.damage.readHistory();
    assert.equal(f.damage.readDamage(f.identity).availability, 'IMMOBILIZED');
    const operationId = f.request(),
      record = f.recovery.commit(f.serial);
    assert(record && typeof record === 'object');
    assert.equal(record.status, 'COMPLETED');
    assert.equal(record.learningEligible, false);
    assert.equal(record.kind, 'TELEPORT');
    assert.deepEqual(f.order, ['native', 'invalidate', 'clear', 'segment', 'event']);
    assert.deepEqual(f.damage.readHistory().slice(0, prefix.length), prefix);
    assert.equal(f.damage.readDamage(f.identity).lastIncidentId, 'injected-pure-onset');
    assert.equal(f.damage.readDamage(f.identity).availability, 'AVAILABLE');
    assert.equal(f.damage.readHistory()[1]!.operationId, operationId);
    f.request();
    f.recovery.commit(f.serial);
    assert.equal(f.applies, 1);
    assert.equal(f.damage.readHistory().length, 2);
  } finally {
    f.dispose();
  }
});
test('fresh blocked placement never clears controller/segment/damage or delivers event', () => {
  const f = fixture();
  try {
    for (let i = 0; i < 6; i++) f.step();
    f.setBlocked(true);
    f.request();
    const record = f.recovery.commit(f.serial);
    assert(record && typeof record === 'object');
    assert.equal(record.status, 'DENIED');
    assert.deepEqual(f.order, ['native']);
    assert.equal(f.damage.readHistory().length, 0);
  } finally {
    f.dispose();
  }
});
test('partial native setter preserves exact stage evidence and cannot retry movement or delivery', () => {
  const f = fixture();
  try {
    for (let i = 0; i < 6; i++) f.step();
    f.setPartial();
    f.request();
    const record = f.recovery.commit(f.serial);
    assert(record && typeof record === 'object');
    assert.equal(record.status, 'PARTIAL');
    assert.equal(record.placement!.completed, 1);
    assert.equal(record.placement!.attempted, 2);
    assert.throws(() => f.recovery.retryDelivery());
    assert.throws(() => f.request());
    assert.equal(f.applies, 1);
    assert.equal(f.damage.readHistory().length, 0);
  } finally {
    f.dispose();
  }
});
test('postmovement host failure retries remaining delivery only; accepted listener failure is never replayed', () => {
  const f = fixture();
  let failures = 0;
  try {
    f.eventBus.subscribe(() => {
      failures++;
      throw new Error('listener after effect');
    });
    for (let i = 0; i < 6; i++) f.step();
    f.setSegmentFails(true);
    f.request();
    const partial = f.recovery.commit(f.serial);
    assert(partial && typeof partial === 'object');
    assert.equal(partial.status, 'PARTIAL');
    f.setSegmentFails(false);
    const complete = f.recovery.retryDelivery();
    assert(complete && typeof complete === 'object');
    assert.equal(complete.status, 'COMPLETED');
    assert.equal(f.applies, 1);
    assert.equal(failures, 1);
    assert.equal(f.order.filter((v) => v === 'invalidate').length, 1);
    assert.equal(f.order.filter((v) => v === 'clear').length, 1);
    assert.equal(f.damage.readHistory().length, 1);
    assert.throws(() => f.recovery.retryDelivery());
  } finally {
    f.dispose();
  }
});
test('external preflight native advancement cannot be adopted as a fresh authorized serial', () => {
  const f = fixture();
  try {
    for (let i = 0; i < 6; i++) f.step();
    f.request();
    f.injectPreflightStep();
    assert.throws(() => f.recovery.commit(6), /Native world advanced/);
    assert.equal(f.applies, 0);
    assert.equal(f.recovery.readHistory().length, 0);
    assert.equal(f.eventBus.getStats().retainedEvents, 0);
    assert.equal(f.damage.readHistory().length, 0);
  } finally {
    f.dispose();
  }
});

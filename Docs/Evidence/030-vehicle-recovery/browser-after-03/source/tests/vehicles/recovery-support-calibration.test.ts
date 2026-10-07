import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acquireFunctionalNative } from '../browser/vehicle-recovery-after/functional-native-instrumentation';
import { createRecoveryRoadProvider } from '../../src/app/vehicle-recovery-road';
import { recoveryRoadFixture } from '../browser/vehicle-recovery-after/road-fixture';
import { CONTROLLER_CONTEXT } from './controller-reference';
import { createHarnessLifetime } from '../browser/vehicle-damage/hardware-lifetime';
/** Actual bounded SI rows; printed only during separately granted native execution.
 * Labeled fixture resets/native placements are not learned/player R actions.
 */
for (const classId of ['sedan', 'compact'] as const)
  test('030 actual ' + classId + ' bounded support/impulse calibration', async () => {
    const life = createHarnessLifetime(),
      rows: Record<string, unknown>[] = [],
      acquisition = await acquireFunctionalNative(),
      world = acquisition.world;
    life.own('world', () => world.dispose());
    try {
      const port = world.createRecoveryPort!(CONTROLLER_CONTEXT);
      life.own('nativePort', () => port.release());
      world.addClassCar('subject', { x: 0, y: 0.75, z: 0 }, classId);
      world.addNamedBox('wall', { x: 0, y: 1, z: 10 }, { x: 4, y: 1, z: 0.05 });
      for (let tick = 0; tick < 180; tick++) world.step(new Map(), false);
      const identity = world.bodyIdentity('subject')!,
        height = world.project('subject').position.y;
      const pose = {
        positionM: { x: 0, y: height, z: 0 },
        rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
      };
      const road = createRecoveryRoadProvider(recoveryRoadFixture().graph).locate(pose, 'TAXI')!;
      assert(road);
      for (const requestedDegrees of [0, 4, 6]) {
        const reset = port.applyPlacement({
          identity,
          context: CONTROLLER_CONTEXT,
          expectedPhysicsSerial: world.collisionStepSerial(),
          transform: pose,
          road,
        });
        assert.equal(reset.completed, 5);
        world.setPose(identity, {
          positionM: pose.positionM,
          rotationQuaternion: {
            x: 0,
            y: 0,
            z: Math.sin((requestedDegrees * Math.PI) / 360),
            w: Math.cos((requestedDegrees * Math.PI) / 360),
          },
        });
        for (let tick = 0; tick < 6; tick++) world.step(new Map(), false);
        const p = world.project('subject'),
          q = p.rotation,
          upDot = 1 - 2 * (q.x * q.x + q.z * q.z),
          serial = world.collisionStepSerial();
        const target = {
          positionM: { x: p.position.x, y: p.position.y, z: p.position.z },
          rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
        };
        const inspection = port.inspectPlacement({
          identity,
          context: CONTROLLER_CONTEXT,
          expectedPhysicsSerial: serial,
          transform: target,
          road,
        });
        const row = {
          classId,
          kind: 'SUPPORT',
          requestedDegrees,
          observedHeightM: p.position.y,
          observedUpDot: upDot,
          wheelContacts: p.wheelContacts,
          suspensionM: [...p.suspension],
          nativeSerial: serial,
          inspection,
          observedUpDotWithinFiveDegrees: upDot >= Math.cos((5 * Math.PI) / 180),
          scope: 'ACTUAL_SUPPORT_QUERY_NOT_OWNER_TRACKING_ACCEPTANCE',
        };
        assert([row.observedHeightM, row.observedUpDot, ...row.suspensionM].every(Number.isFinite));
        rows.push(row);
      }
      world.setPose(identity, pose);
      world.setBodyVelocity(identity, { x: 0, y: 0, z: 45 });
      let impulseNs = 0;
      for (let tick = 0; tick < 180; tick++) {
        world.step(new Map(), false);
        for (const contact of world.readCollisionContacts().contacts)
          if (
            (contact.first.entityId === 'subject' && contact.second.entityId === 'wall') ||
            (contact.first.entityId === 'wall' && contact.second.entityId === 'subject')
          )
            impulseNs = Math.max(impulseNs, contact.impulseNs);
      }
      assert(Number.isFinite(impulseNs) && impulseNs > 0);
      rows.push({
        classId,
        kind: 'WALL_IMPULSE',
        observedImpulseNs: impulseNs,
        observedHeightM: world.project('subject').position.y,
        nativeSerial: world.collisionStepSerial(),
      });
      const injection = acquisition.injectRotationFailure(identity, (label, release) =>
        life.own(label, release),
      );
      let partial;
      try {
        partial = port.applyPlacement({
          identity,
          context: CONTROLLER_CONTEXT,
          expectedPhysicsSerial: world.collisionStepSerial(),
          transform: pose,
          road,
        });
      } finally {
        injection.restore();
      }
      assert.equal(partial.attempted, 2);
      assert.equal(partial.completed, 1);
      assert.equal(injection.readAttempts(), 1);
      assert(partial.failure);
      rows.push({
        classId,
        kind: 'ACTUAL_NATIVE_CAPTURE_HELPER_PARTIAL_NOT_OWNER_R',
        partial,
        injectedAttempts: injection.readAttempts(),
      });
    } catch (error) {
      life.record('primary', error);
    } finally {
      life.dispose();
      const cleanup: Record<string, unknown> = {};
      for (const [name, read] of Object.entries({
        bodies: () => world.bodyResources().entities,
        colliders: () => world.collisionResources().colliders,
        subscriptions: () => world.bodyResources().subscriptions,
        recoveryPorts: () => world.recoveryResources!().activePorts,
      })) {
        try {
          cleanup[name] = read();
          assert.equal(cleanup[name], 0);
        } catch (error) {
          life.record('readback:' + name, error);
        }
      }
      assert(rows.length <= 24);
      console.log(
        JSON.stringify({
          kind: '030_NATIVE_CALIBRATION_ACTUAL_ROWS',
          classId,
          rows,
          cleanup,
          ownership: life.snapshot(),
          performanceAcceptance: false,
        }),
      );
    }
    life.throwIfFailed();
  });

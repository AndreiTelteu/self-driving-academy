import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  verifyFunctionalPhases,
  verifyCompletedNativeDwell,
} from '../browser/vehicle-damage/hardware-functional-phases';
import type { FunctionalPhaseReadback } from '../browser/vehicle-damage/hardware-functional-phases';
import type { BodyState } from '../../src/vehicles/body-port';
function syntheticVerifierRows() {
  const rows: FunctionalPhaseReadback[] = [];
  let tick = 0;
  for (const phase of [
    'REVERSE',
    'SERVICE_BRAKE',
    'HANDBRAKE',
    'LATERAL',
    'RESUME_NEUTRAL',
  ] as const) {
    for (let phaseTick = 1; phaseTick <= 6; phaseTick++) {
      const dwelling = phase === 'REVERSE' && phaseTick < 6;
      const direction = phase === 'LATERAL' || phase === 'RESUME_NEUTRAL' ? 'FORWARD' : 'REVERSE';
      const engaged = dwelling || phase === 'RESUME_NEUTRAL' ? 'FORWARD' : 'REVERSE';
      const nativeInput = {
        throttle: phase === 'REVERSE' && !dwelling ? -1 : 0,
        brake: phase === 'SERVICE_BRAKE' ? 1 : dwelling || phase === 'LATERAL' ? 0.7 : 0,
        handbrake: phase === 'HANDBRAKE',
        steering: 0,
      };
      const velocity = { x: phase === 'LATERAL' ? 2 : 0, y: 0, z: 0 };
      rows.push({
        phase,
        tick: ++tick,
        phaseTick,
        source: 'PLAYER',
        availability: 'AVAILABLE',
        raw: {
          source: 'PLAYER',
          throttle: phase === 'RESUME_NEUTRAL' ? 0 : 1,
          brake: phase === 'SERVICE_BRAKE' ? 1 : 0,
          handbrake: phase === 'HANDBRAKE',
          steering: 0,
          driveIntent: { version: '027-braking-reverse-v1', direction, shiftBrake: 0.7 },
        },
        effective: {
          source: 'PLAYER',
          throttle: Math.abs(nativeInput.throttle),
          brake: nativeInput.brake,
          handbrake: nativeInput.handbrake,
          steering: 0,
          driveIntent: { version: '027-braking-reverse-v1', direction: engaged, shiftBrake: 0.7 },
        },
        nativeInput,
        velocityBefore: velocity,
        velocityAfter: velocity,
        drivetrain: {
          version: '027-braking-reverse-v1',
          requestedDirection: direction,
          engagedDirection: engaged,
          phase: dwelling ? 'NEAR_ZERO_DWELL' : phase === 'LATERAL' ? 'STOPPING' : 'DRIVING',
          nearZeroTicks: dwelling ? phaseTick : phase === 'REVERSE' ? 6 : 0,
          motion: {
            longitudinalSpeedMps: 0,
            totalSpeedMps: Math.hypot(velocity.x, velocity.y, velocity.z),
          },
          physicalInput: nativeInput,
        },
      });
    }
  }
  const body = { velocityMps: { x: 0, y: 0, z: 0 } } as BodyState;
  return {
    rows,
    suspension: { bodyBefore: body, bodyAfter: body, rejected: true },
    lateral: { drivetrain: rows.filter((row) => row.phase === 'LATERAL').at(-1)!.drivetrain },
    resume: rows.at(-1)!.nativeInput,
  };
}
test('independent phase verifier rejects missing/tampered actual-readback schema (synthetic rows are not physical evidence)', () => {
  const good = syntheticVerifierRows();
  const verify = (value: ReturnType<typeof syntheticVerifierRows>) =>
    verifyFunctionalPhases(
      value.rows,
      'PLAYER',
      'AVAILABLE',
      value.suspension,
      value.lateral,
      value.resume,
    );
  assert.doesNotThrow(() => verify(good));
  const mutate: ((value: ReturnType<typeof syntheticVerifierRows>) => void)[] = [
    (value) => {
      value.rows = value.rows.filter((row) => row.phase !== 'SERVICE_BRAKE');
    },
    (value) => {
      const row = value.rows.find((row) => row.phase === 'SERVICE_BRAKE')!;
      row.raw = { ...row.raw, brake: 0 };
    },
    (value) => {
      const row = value.rows.find((row) => row.phase === 'HANDBRAKE')!;
      row.raw = { ...row.raw, handbrake: false };
    },
    (value) => {
      value.rows[0].drivetrain = { ...value.rows[0].drivetrain, nearZeroTicks: 0 };
    },
    (value) => {
      value.rows.find((row) => row.phase === 'LATERAL')!.velocityBefore = { x: 0, y: 0, z: 0 };
    },
    (value) => {
      value.suspension.rejected = false;
    },
    (value) => {
      value.suspension.bodyAfter = {
        ...value.suspension.bodyAfter,
        velocityMps: { x: 1, y: 0, z: 0 },
      };
    },
    (value) => {
      const row = value.rows.find((row) => row.phase === 'RESUME_NEUTRAL')!;
      row.raw = { ...row.raw, throttle: 1 };
    },
    (value) => {
      value.rows[0].source = 'AUTONOMY';
    },
  ];
  for (const change of mutate) {
    const value = structuredClone(good);
    change(value);
    assert.throws(() => verify(value));
  }
});

function interruptedDwellRows() {
  const base = syntheticVerifierRows().rows.filter((row) => row.phase === 'REVERSE');
  const initial = base.map((original, index) => {
    const row = structuredClone(original);
    const count = [1, 2, 3, 0, 0, 0][index];
    const speed = [0, 0.1168, 0.19756, 0.2497, 0.2796, 0.29267][index];
    row.nativeInput = { ...row.nativeInput, throttle: 0, brake: 0.7 };
    row.effective = {
      ...row.effective,
      throttle: 0,
      brake: 0.7,
      driveIntent: { ...row.effective.driveIntent!, direction: 'FORWARD' },
    };
    row.velocityBefore = { x: 0, y: speed, z: 0 };
    row.velocityAfter = { x: 0, y: speed, z: 0 };
    row.drivetrain = {
      ...row.drivetrain,
      nearZeroTicks: count,
      engagedDirection: 'FORWARD',
      phase: count === 0 ? 'STOPPING' : 'NEAR_ZERO_DWELL',
      motion: { longitudinalSpeedMps: 0, totalSpeedMps: speed },
      physicalInput: row.nativeInput,
    };
    return row;
  });
  const completed = base.map((original, index) => {
    const row = structuredClone(original);
    row.tick = 13 + index;
    row.phaseTick = 13 + index;
    return row;
  });
  return [...initial, ...completed];
}
test('interrupted native dwell remains evidence and later completed six ticks are selected without premature propulsion', () => {
  const rows = interruptedDwellRows();
  assert.doesNotThrow(() => verifyCompletedNativeDwell(rows, -1));
  assert.equal(rows.length, 12);
  assert.deepEqual(
    rows.slice(0, 6).map((row) => row.drivetrain.nearZeroTicks),
    [1, 2, 3, 0, 0, 0],
  );
  const mutations: ((value: FunctionalPhaseReadback[]) => void)[] = [
    (value) => {
      value.splice(8, 1);
    },
    (value) => {
      value[8].tick += 10;
    },
    (value) => {
      value[2].drivetrain = { ...value[2].drivetrain, engagedDirection: 'REVERSE' };
    },
    (value) => {
      value[2].nativeInput = { ...value[2].nativeInput, throttle: -1 };
      value[2].effective = { ...value[2].effective, throttle: 1 };
      value[2].drivetrain = { ...value[2].drivetrain, physicalInput: value[2].nativeInput };
    },
    (value) => {
      value[3].velocityBefore = { x: 0, y: 0.1, z: 0 };
      value[3].drivetrain = {
        ...value[3].drivetrain,
        motion: { longitudinalSpeedMps: 0, totalSpeedMps: 0.1 },
      };
    },
    (value) => {
      value[7].velocityBefore = { x: 0, y: 0.3, z: 0 };
      value[7].drivetrain = {
        ...value[7].drivetrain,
        motion: { longitudinalSpeedMps: 0, totalSpeedMps: 0.3 },
      };
    },
    (value) => {
      value[3].drivetrain = {
        ...value[3].drivetrain,
        motion: { longitudinalSpeedMps: 0, totalSpeedMps: 0.1 },
      };
    },
    (value) => {
      value.splice(3, 3);
    },
    (value) => {
      value.splice(11, 1);
    },
  ];
  for (const change of mutations) {
    const value = structuredClone(rows);
    change(value);
    assert.throws(() => verifyCompletedNativeDwell(value, -1));
  }
});

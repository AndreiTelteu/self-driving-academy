import assert from 'node:assert/strict';
import type { VehicleCommand } from '../../../src/vehicles/contracts';
import type { VehicleActuationInput } from '../../../src/vehicles/controller-port';
import type { DrivetrainProjection } from '../../../src/vehicles/drivetrain';
import type { BodyState } from '../../../src/vehicles/body-port';
type CompactCommand = Pick<
  VehicleCommand,
  'source' | 'throttle' | 'brake' | 'handbrake' | 'steering' | 'driveIntent'
>;
export interface FunctionalPhaseReadback {
  phase: 'REVERSE' | 'SERVICE_BRAKE' | 'HANDBRAKE' | 'RECOVERY' | 'LATERAL' | 'RESUME_NEUTRAL';
  tick: number;
  phaseTick: number;
  source: 'PLAYER' | 'AUTONOMY';
  raw: CompactCommand;
  effective: CompactCommand;
  nativeInput: VehicleActuationInput;
  drivetrain: DrivetrainProjection;
  velocityBefore: BodyState['velocityMps'];
  velocityAfter: BodyState['velocityMps'];
  availability: string;
}
/** Consumes actual per-tick readbacks. Synthetic test rows prove rejection, never physical acceptance. */
export function verifyFunctionalPhases(
  rows: readonly FunctionalPhaseReadback[],
  source: string,
  availability: string,
  suspension: { bodyBefore: BodyState; bodyAfter: BodyState; rejected: boolean },
  lateral: unknown,
  resume: VehicleActuationInput,
) {
  assert.equal(Array.isArray(rows), true, 'Actual phase array');
  assert.ok(rows.length <= 64, 'Bounded actual phase readbacks');
  const phases: FunctionalPhaseReadback['phase'][] = [
    'REVERSE',
    'SERVICE_BRAKE',
    'HANDBRAKE',
    ...(availability === 'AVAILABLE' ? [] : (['RECOVERY'] as const)),
    'LATERAL',
    'RESUME_NEUTRAL',
  ];
  let lastTick = 0,
    lastPhase = -1;
  for (const row of rows) {
    assert.ok(phases.includes(row.phase), 'Unknown actual phase');
    assert.ok(phases.indexOf(row.phase) >= lastPhase, 'Actual phase order');
    lastPhase = phases.indexOf(row.phase);
    assert.ok(
      Number.isSafeInteger(row.tick) &&
        row.tick > lastTick &&
        Number.isSafeInteger(row.phaseTick) &&
        row.phaseTick > 0,
      'Phase tick chronology',
    );
    lastTick = row.tick;
    assert.equal(
      row.availability,
      ['RECOVERY', 'LATERAL', 'RESUME_NEUTRAL'].includes(row.phase) ? 'AVAILABLE' : availability,
    );
    assert.equal(row.source, source);
    assert.equal(row.raw.source, source);
    assert.equal(row.effective.source, source);
    assert.deepEqual(
      row.nativeInput,
      row.drivetrain.physicalInput,
      'Actual phase native/projection equality',
    );
    assert.equal(Math.abs(row.nativeInput.throttle), row.effective.throttle);
    for (const value of [row.velocityBefore, row.velocityAfter])
      assert.ok(Object.values(value).every(Number.isFinite), 'Actual phase finite native velocity');
    assert.ok(row.drivetrain.motion !== null, 'Native motion readback');
    assert.ok(
      Math.abs(
        Math.hypot(...Object.values(row.velocityBefore)) - row.drivetrain.motion.totalSpeedMps,
      ) < 1e-9,
      'Native total motion readback',
    );
    assert.equal(row.drivetrain.requestedDirection, row.raw.driveIntent!.direction);
    assert.equal(row.effective.driveIntent!.direction, row.drivetrain.engagedDirection);
    assert.ok(
      Number.isInteger(row.drivetrain.nearZeroTicks) &&
        row.drivetrain.nearZeroTicks >= 0 &&
        row.drivetrain.nearZeroTicks <= 6,
    );
    if (row.nativeInput.throttle !== 0)
      assert.equal(
        Math.sign(row.nativeInput.throttle),
        row.drivetrain.engagedDirection === 'REVERSE' ? -1 : 1,
      );
    if (row.phase === 'REVERSE' || row.phase === 'RECOVERY') {
      assert.equal(row.raw.throttle, 1);
      assert.equal(row.raw.brake, 0);
      assert.equal(row.raw.handbrake, false);
      assert.equal(row.raw.driveIntent!.direction, 'REVERSE');
    }
    if (row.phase === 'SERVICE_BRAKE' || row.phase === 'HANDBRAKE') {
      assert.equal(row.raw.throttle, 1);
      assert.equal(row.nativeInput.throttle, 0);
      if (row.phase === 'SERVICE_BRAKE') {
        assert.equal(row.raw.brake, 1);
        assert.equal(row.nativeInput.brake, 1);
      } else {
        assert.equal(row.raw.handbrake, true);
        assert.equal(row.nativeInput.handbrake, true);
      }
      assert.equal(row.drivetrain.nearZeroTicks, 0, 'Brake blocks dwell');
    }
    if (row.phase === 'LATERAL') {
      assert.equal(row.raw.driveIntent!.direction, 'FORWARD');
      assert.equal(row.nativeInput.throttle, 0);
      assert.equal(row.drivetrain.engagedDirection, 'REVERSE');
      assert.equal(row.drivetrain.nearZeroTicks, 0);
      assert.ok(row.drivetrain.motion.totalSpeedMps > 0.2);
    }
    if (row.phase === 'RESUME_NEUTRAL') {
      assert.equal(row.raw.throttle, 0);
      assert.equal(row.nativeInput.throttle, 0);
    }
    if (row.availability === 'IMMOBILIZED') {
      assert.equal(row.nativeInput.throttle, 0);
      assert.equal(row.nativeInput.brake, 1);
      assert.equal(row.drivetrain.nearZeroTicks, 0);
    }
  }
  for (const phase of phases) {
    const values = rows.filter((row) => row.phase === phase);
    assert.ok(
      values.every((row) => row.tick - row.phaseTick === values[0].tick - values[0].phaseTick),
      'One actual phase start tick',
    );
    assert.deepEqual(
      values.filter((row) => row.phaseTick <= 6).map((row) => row.phaseTick),
      [1, 2, 3, 4, 5, 6],
      `Required six ${phase} ticks`,
    );
  }
  const dwellPhase = availability === 'IMMOBILIZED' ? 'RECOVERY' : 'REVERSE';
  const drive = rows.filter((row) => row.phase === dwellPhase);
  const dwellStart = drive.findIndex((row) => row.drivetrain.nearZeroTicks === 1);
  assert.ok(dwellStart >= 0, 'Actual brake-released near-zero dwell required');
  const dwell = drive.slice(dwellStart, dwellStart + 6);
  assert.deepEqual(
    dwell.map((row) => row.drivetrain.nearZeroTicks),
    [1, 2, 3, 4, 5, 6],
    'Actual six native dwell ticks',
  );
  assert.ok(
    dwell.every(
      (row, index) =>
        row.tick === dwell[0].tick + index &&
        row.drivetrain.motion!.totalSpeedMps <= 0.2 &&
        row.raw.brake === 0 &&
        !row.raw.handbrake,
    ),
    'Contiguous native at-rest dwell',
  );
  for (const row of dwell.slice(0, 5)) {
    assert.equal(row.nativeInput.throttle, 0);
    assert.ok(row.nativeInput.brake >= row.raw.driveIntent!.shiftBrake);
  }
  assert.equal(dwell[5].drivetrain.engagedDirection, 'REVERSE');
  assert.equal(dwell[5].nativeInput.throttle, availability === 'DAMAGED' ? -0.5 : -1);
  assert.equal(suspension.rejected, true);
  assert.deepEqual(suspension.bodyBefore, suspension.bodyAfter, 'Suspend has no native mutation');
  assert.ok(lateral && typeof lateral === 'object' && 'drivetrain' in lateral);
  const summary = lateral.drivetrain as DrivetrainProjection;
  assert.equal(summary.engagedDirection, 'REVERSE');
  assert.equal(summary.requestedDirection, 'FORWARD');
  assert.equal(summary.nearZeroTicks, 0);
  assert.equal(summary.physicalInput.throttle, 0);
  assert.deepEqual(
    resume,
    rows.filter((row) => row.phase === 'RESUME_NEUTRAL').at(-1)!.nativeInput,
  );
}

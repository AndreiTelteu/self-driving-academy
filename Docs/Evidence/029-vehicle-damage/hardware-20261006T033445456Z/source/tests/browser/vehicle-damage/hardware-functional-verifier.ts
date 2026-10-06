import { verifyFunctionalPhases } from './hardware-functional-phases';
import type { FunctionalPhaseReadback } from './hardware-functional-phases';
import assert from 'node:assert/strict';
import type { CarProjection } from '../../../src/vehicles/physics';
import type { BodyState } from '../../../src/vehicles/body-port';
import type {
  VehicleControlProjection,
  VehicleActuationInput,
} from '../../../src/vehicles/controller-port';
import type { DamageHistoryRecord } from '../../../src/vehicles/damage-port';
interface Cleanup {
  bodies: { entities: number; subscriptions: number };
  collisions: { colliders: number };
  sceneDisposed: boolean;
  disposedReadRejected: boolean;
  engineScenes?: number;
  sceneMeshes?: number;
  sceneMaterials?: number;
  sceneTextures?: number;
  connectedCanvasCount?: number;
  controller?: { vehicles: number };
  damage?: { vehicles: number; historyRecords: number };
  controllerVehicles?: number;
  damageVehicles?: number;
  damageHistory?: number;
}
export interface FunctionalCase {
  ordinal: number;
  passed: boolean;
  backend?: string;
  classId?: string;
  source?: 'PLAYER' | 'AUTONOMY';
  impactSpeedMps?: number;
  scriptedCommands?: boolean;
  actualAvailability?: string;
  startedAt?: string;
  completedAt?: string;
  incidentHistory?: readonly DamageHistoryRecord[];
  reverseDrive?: CarProjection;
  reverseControl?: VehicleControlProjection;
  reverseApplied?: VehicleActuationInput;
  reverseSetupBody?: BodyState;
  mechanics?: { classId: string; massKg: number };
  recoveryHistory?: readonly DamageHistoryRecord[];
  recoveryBodyBefore?: BodyState;
  recoveryBodyAfter?: BodyState;
  recovered?: CarProjection;
  ownerCycle?: boolean;
  cycle?: number;
  cleanup: Cleanup;
  error?: string;
  actualNativeTicks?: number;
  phaseReadbacks?: readonly FunctionalPhaseReadback[];
  phaseCapacity?: number;
  suspension?: { bodyBefore: BodyState; bodyAfter: BodyState; rejected: boolean };
  lateralInterlock?: VehicleControlProjection;
  suspensionNativeInput?: VehicleActuationInput;
}
export function verifyFunctionalCase(row: FunctionalCase, ordinal: number, backend: string) {
  assert.equal(row.ordinal, ordinal);
  assert.equal(row.passed, true);
  assert.equal(row.error, undefined);
  const cleanup = row.cleanup;
  assert.equal(cleanup.bodies.entities, 0);
  assert.equal(cleanup.bodies.subscriptions, 0);
  assert.equal(cleanup.collisions.colliders, 0);
  assert.equal(cleanup.sceneDisposed, true);
  assert.equal(cleanup.disposedReadRejected, true);
  assert.equal(row.backend, backend);
  assert.ok(
    Number.isFinite(Date.parse(row.startedAt!)) &&
      Date.parse(row.startedAt!) <= Date.parse(row.completedAt!),
    'Functional case chronology',
  );
  if (ordinal >= 12) {
    assert.equal(row.ownerCycle, true);
    assert.equal(row.cycle, ordinal - 12);
    assert.equal(row.actualNativeTicks, 6);
    assert.equal(cleanup.controllerVehicles, 0);
    assert.equal(cleanup.damageVehicles, 0);
    assert.equal(cleanup.damageHistory, 0);
    assert.equal(cleanup.engineScenes, 0);
    assert.equal(cleanup.sceneMeshes, 0);
    assert.equal(cleanup.sceneMaterials, 0);
    assert.equal(cleanup.sceneTextures, 0);
    assert.equal(cleanup.connectedCanvasCount, 1);
    return;
  }
  assert.equal(row.ownerCycle, undefined);
  assert.equal(row.backend, backend);
  assert.equal(row.scriptedCommands, true);
  const classId = ordinal < 6 ? 'sedan' : 'compact',
    source = Math.floor(ordinal / 3) % 2 ? 'AUTONOMY' : 'PLAYER',
    speed = [0, 3, 12][ordinal % 3],
    availability = speed === 0 ? 'AVAILABLE' : speed === 3 ? 'DAMAGED' : 'IMMOBILIZED';
  assert.equal(row.classId, classId);
  assert.equal(row.source, source);
  assert.equal(row.impactSpeedMps, speed);
  assert.equal(row.actualAvailability, availability);
  assert.ok(
    Number.isFinite(Date.parse(row.startedAt!)) &&
      Date.parse(row.startedAt!) <= Date.parse(row.completedAt!),
    'Native functional chronology',
  );
  assert.equal(cleanup.controller!.vehicles, 0);
  assert.equal(cleanup.damage!.vehicles, 0);
  assert.equal(cleanup.damage!.historyRecords, 0);
  assert.equal(cleanup.engineScenes, 0);
  assert.equal(cleanup.sceneMeshes, 0);
  assert.equal(cleanup.sceneMaterials, 0);
  assert.equal(cleanup.sceneTextures, 0);
  assert.equal(cleanup.connectedCanvasCount, 1);
  assert.equal(row.phaseCapacity, 64);
  assert.ok(
    row.phaseReadbacks && row.suspension && row.lateralInterlock && row.suspensionNativeInput,
    'Actual phase/suspend evidence required',
  );
  verifyFunctionalPhases(
    row.phaseReadbacks,
    source,
    availability,
    row.suspension,
    row.lateralInterlock,
    row.suspensionNativeInput,
  );
  assert.equal(row.mechanics!.classId, classId);
  assert.equal(row.mechanics!.massKg, classId === 'sedan' ? 1400 : 1100);
  assert.ok(
    row.incidentHistory &&
      row.reverseDrive &&
      row.reverseControl &&
      row.reverseApplied &&
      row.reverseSetupBody,
    'Native evidence fields required',
  );
  const history = row.incidentHistory,
    control = row.reverseControl,
    applied = row.reverseApplied;
  if (speed === 0) assert.equal(history.length, 0);
  else {
    assert.ok(history.length > 0 && history.length <= 4096);
    for (const incident of history) {
      assert.equal(incident.kind, 'INCIDENT');
      assert.equal(incident.sessionId, '029-current-functional');
      assert.equal(incident.worldEpoch, ordinal);
      assert.equal(incident.units, 'SI');
      assert.ok(Number.isFinite(incident.impulseNs) && incident.impulseNs! >= 0);
      assert.ok(incident.vehicleIds.includes('car'));
    }
    assert.ok(
      history.some(
        (incident) => incident.impulseNs! / row.mechanics!.massKg >= (speed === 3 ? 2 : 8),
      ),
      'Actual native onset impulse threshold',
    );
  }
  assert.equal(control.raw!.source, source);
  assert.equal(control.raw!.throttle, 1);
  assert.equal(control.raw!.driveIntent!.direction, 'REVERSE');
  assert.equal(control.mode, source === 'PLAYER' ? 'MANUAL' : 'AUTO');
  assert.deepEqual(control.drivetrain!.physicalInput, applied);
  assert.equal(Math.abs(applied.throttle), control.command.throttle);
  assert.equal(control.command.source, source);
  assert.deepEqual(row.reverseSetupBody.transform.positionM, { x: 0, y: 0.8, z: 0 });
  assert.deepEqual(row.reverseSetupBody.velocityMps, { x: 0, y: 0, z: 0 });
  if (availability === 'IMMOBILIZED') {
    assert.equal(applied.throttle, 0);
    assert.equal(applied.brake, 1);
    assert.equal(control.drivetrain!.nearZeroTicks, 0);
    assert.ok(Math.abs(row.reverseDrive.position.z) < 0.25);
  } else {
    assert.equal(applied.throttle, availability === 'DAMAGED' ? -0.5 : -1);
    assert.equal(control.drivetrain!.engagedDirection, 'REVERSE');
    assert.ok(row.reverseDrive.position.z < -5);
  }
  if (availability !== 'AVAILABLE') {
    assert.ok(
      row.recoveryHistory && row.recoveryBodyBefore && row.recoveryBodyAfter && row.recovered,
      'Recovery native evidence required',
    );
    assert.deepEqual(row.recoveryHistory.slice(0, history.length), history);
    assert.equal(row.recoveryHistory.length, history.length + 1);
    assert.equal(row.recoveryHistory.at(-1)!.kind, 'RECOVERY');
    assert.equal(row.recoveryHistory.at(-1)!.worldEpoch, ordinal);
    assert.deepEqual(row.recoveryBodyBefore, row.recoveryBodyAfter);
    assert.ok(
      row.recovered.speed > 2 &&
        row.recovered.position.z < row.recoveryBodyBefore.transform.positionM.z - 5,
    );
  }
}
export function verifyFunctionalCases(rows: readonly FunctionalCase[], backend: string) {
  assert.equal(rows.length, 32);
  assert.ok(backend === 'WEBGPU' || backend === 'WEBGL2');
  rows.forEach((row, ordinal) => verifyFunctionalCase(row, ordinal, backend));
  for (let ordinal = 0; ordinal < 12; ordinal += 3) {
    const available = rows[ordinal].reverseDrive!,
      damaged = rows[ordinal + 1].reverseDrive!;
    assert.ok(
      Math.abs(damaged.position.z) < Math.abs(available.position.z) &&
        damaged.speed < available.speed,
      'Measured actual mechanical motion effect',
    );
  }
  return {
    nativeCases: 12,
    ownershipCycles: 20,
    verified: true,
    scope:
      'Scripted native class/source/onset/signed availability/recovery prefix and scoped lifecycle, not224soak',
  };
}

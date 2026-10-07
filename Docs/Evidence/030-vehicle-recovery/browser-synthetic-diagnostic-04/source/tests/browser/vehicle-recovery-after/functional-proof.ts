import { RECOVERY_LIMITS } from '../../../src/vehicles/recovery-port';
import { parseVehicleCommand } from '../../../src/vehicles/contracts';
import { recoverySnapshot } from '../../../src/vehicles/recovery-ledger';
import { functionalJsonBoundary } from './functional-dto';
import type { FunctionalCase, FunctionalReport } from './functional-dto';
import { createStableId } from '../../../src/sessions';
import type { ContractContext } from '../../../src/sessions';
import type { RecoveryRecord } from '../../../src/vehicles/recovery-ledger';
import type { CollisionIncident } from '../../../src/vehicles/collision-episodes';
export function actualRecoveryOperationId(
  context: ContractContext,
  record: Pick<RecoveryRecord, 'vehicleId' | 'bodyGeneration' | 'requestedTick' | 'origin'>,
) {
  return createStableId('recovery', context.sessionId, [
    String(context.worldEpoch),
    record.vehicleId,
    String(record.bodyGeneration),
    String(record.requestedTick),
    record.origin,
  ]);
}
export function actualRecoveryPointId(
  record: Pick<
    RecoveryRecord,
    'mapId' | 'vehicleId' | 'bodyGeneration' | 'laneId' | 'validatedTick'
  >,
) {
  return createStableId('recovery-point', record.mapId, [
    record.vehicleId,
    String(record.bodyGeneration),
    record.laneId,
    String(record.validatedTick),
  ]);
}
export function actualCollisionIncidentId(
  context: ContractContext,
  incident: Pick<CollisionIncident, 'first' | 'second' | 'tick'>,
) {
  return createStableId('collision', context.sessionId, [
    '028',
    String(context.worldEpoch),
    `${incident.first.serial}:${incident.second.serial}`,
    String(incident.tick),
  ]);
}
export const FUNCTIONAL = Object.freeze({
  version: '030-trusted-r-functional-v1',
  cases: 2,
  maximumRows: 420,
  maximumKeys: 256,
  maximumCurve: 24,
  lifetimes: 20,
  reportBytes: 2 * 1024 * 1024,
  historyBytes: 65536,
  maximumWaitMs: 90000,
});
export interface FunctionalIdentity {
  captureId: string;
  backend: 'WEBGPU' | 'WEBGL2';
  sourceHash: string;
  artifactHash: string;
  nativeHash: string;
}
export function functionalCheck(x: unknown, message: string): asserts x {
  if (!x) throw new Error(message);
}
function noUnknown(value: object, keys: string[]) {
  functionalCheck(
    Object.keys(value).every((key) => keys.includes(key)),
    'Unknown functional DTO field',
  );
}
function keyRange(row: FunctionalCase, range: { keysStart: number; keysEnd: number }) {
  functionalCheck(
    Number.isSafeInteger(range.keysStart) &&
      Number.isSafeInteger(range.keysEnd) &&
      range.keysStart >= 0 &&
      range.keysEnd >= range.keysStart &&
      range.keysEnd <= row.keys.length,
    'Actual bounded canonical key interval',
  );
  return row.keys.slice(range.keysStart, range.keysEnd);
}
export function trustedEdge(
  edge: {
    isTrusted: boolean;
    code: string;
    type: string;
    repeat: boolean;
    tick: number;
    vehicleId: string | null;
    generation: number | null;
  },
  expected: { tick: number; vehicleId: string; generation: number },
  code = 'KeyR',
) {
  functionalCheck(
    edge.isTrusted && edge.code === code && edge.type === 'keydown' && !edge.repeat,
    'Actual trusted recovery edge required',
  );
  functionalCheck(
    edge.tick === expected.tick &&
      edge.vehicleId === expected.vehicleId &&
      edge.generation === expected.generation,
    'Exact accepted seat/tick/generation',
  );
}
export function validateFunctional(rawReport: unknown, rawBuild: unknown) {
  const report = functionalJsonBoundary(rawReport) as FunctionalReport;
  const build = functionalJsonBoundary(rawBuild) as Record<string, string>;
  functionalCheck(
    report.version === FUNCTIONAL.version && report.status === 'COMPLETE',
    'Complete functional report',
  );
  noUnknown(report, [
    'version',
    'status',
    'identity',
    'cases',
    'startedAt',
    'gpu',
    'dpr',
    'css',
    'internal',
    'foreground',
    'firstWorldAt',
    'backendCleanup',
    'ownership',
    'completedAt',
  ]);
  for (const k of ['sourceHash', 'artifactHash', 'nativeHash'])
    functionalCheck(report.identity[k] === build[k], 'Actual functional ' + k);
  functionalCheck(
    Date.parse(build.archivedAt) <= Date.parse(report.firstWorldAt) &&
      Date.parse(report.firstWorldAt) <= Date.parse(report.completedAt),
    'World follows actual archived build',
  );
  functionalCheck(
    report.cases.length === 2 &&
      report.cases[0].classId === 'sedan' &&
      report.cases[1].classId === 'compact',
    'Both actual classes',
  );
  for (const [ordinal, row] of report.cases.entries()) {
    functionalCheck(
      row.context.sessionId === '030-trusted-functional' &&
        row.context.worldEpoch === ordinal &&
        row.context.schemaVersion === 1 &&
        row.context.units === 'SI',
      'Actual class-scoped fixture context',
    );
    noUnknown(row, [
      'classId',
      'status',
      'setupWrites',
      'rows',
      'keys',
      'supportCurve',
      'lifetimes',
      'firstWorldAt',
      'vehicleId',
      'generation',
      'nativeIdentity',
      'collisionIdentities',
      'context',
      'deliveryOrder',
      'events',
      'latestCallback',
      'incidents',
      'noPoint',
      'mechanicsBefore',
      'mechanicsAfter',
      'nativeImpulseNs',
      'damageBefore',
      'damageAfter',
      'lastIncidentBefore',
      'lastIncidentAfter',
      'segmentBefore',
      'segmentAfter',
      'recovered',
      'neutral',
      'availabilityAfter',
      'movingBlocker',
      'blocked',
      'repeat',
      'remapOld',
      'remapped',
      'history',
      'historyBytes',
      'unsupported',
      'nativeSetterFault',
      'deliveryRetry',
      'hud',
      'staleHud',
      'auto',
      'staleGeneration',
      'cleanup',
    ]);
    functionalCheck(
      row.status === 'COMPLETE' &&
        row.rows.length <= FUNCTIONAL.maximumRows &&
        row.keys.length <= FUNCTIONAL.maximumKeys,
      'Bounded complete case',
    );
    functionalCheck(
      row.setupWrites.length <= 20 && row.deliveryOrder.length <= 32,
      'Bounded setup/delivery observations',
    );
    functionalCheck(
      row.rows.length === 394,
      'Exact functional physical ticks, separate from performance',
    );
    for (const [index, sample] of row.rows.entries()) {
      noUnknown(sample, [
        'tick',
        'nativeSerial',
        'heightM',
        'speedMps',
        'wheelContacts',
        'rotation',
        'suspension',
        'raw',
        'effective',
        'availability',
      ]);
      functionalCheck(
        sample.tick === index + 1 && sample.nativeSerial === 181 + index,
        'Actual native/controller tick sequence',
      );
      functionalCheck(
        [
          sample.heightM,
          sample.speedMps,
          sample.wheelContacts,
          ...Object.values(sample.rotation),
          ...sample.suspension,
        ].every(Number.isFinite),
        'Every functional physical row finite',
      );
      for (const value of [sample.raw, sample.effective]) {
        const command = parseVehicleCommand(value);
        const expectedSource =
          value === sample.effective && sample.tick === 392 ? 'AUTONOMY' : 'PLAYER';
        functionalCheck(
          command.vehicleId === row.vehicleId &&
            command.tick === sample.tick &&
            command.source === expectedSource,
          'Actual command subject/tick/source',
        );
        for (const key of ['schemaVersion', 'units', 'sessionId', 'worldEpoch'] as const)
          functionalCheck(
            command[key as keyof typeof command] === row.context[key],
            'Actual command context',
          );
      }
    }
    functionalCheck(
      row.supportCurve.length <= FUNCTIONAL.maximumCurve && row.supportCurve.length >= 4,
      'Actual support observations',
    );
    for (const point of row.supportCurve)
      functionalCheck(
        [point.heightM, point.upDot, point.nativeSerial, ...point.suspension].every(
          Number.isFinite,
        ),
        'Finite actual support SI',
      );
    functionalCheck(
      row.supportCurve.some((p) => p.accepted && p.wheelContacts === 4),
      'Actual supported candidate',
    );
    functionalCheck(
      Number.isFinite(row.nativeImpulseNs) &&
        row.nativeImpulseNs > 0 &&
        row.incidents.some(
          (p) => p.vehicleId === 'subject' && p.otherEntityId === 'wall' && p.impulseNs > 0,
        ),
      'Actual named wall native impulse/028 episode',
    );
    functionalCheck(
      row.collisionIdentities.length === 3 &&
        row.collisionIdentities
          .map((identity) => identity.entityId)
          .sort()
          .join(',') === 'other,subject,wall',
      'Actual acquired native collision identity bindings',
    );
    for (const incident of row.incidents) {
      for (const key of ['schemaVersion', 'units', 'sessionId', 'worldEpoch'] as const)
        functionalCheck(incident[key] === row.context[key], 'Incident actual class context');
      functionalCheck(
        Number.isSafeInteger(incident.tick) &&
          incident.tick >= 1 &&
          incident.tick <= 394 &&
          Number.isSafeInteger(incident.first.serial) &&
          Number.isSafeInteger(incident.second.serial) &&
          incident.first.serial < incident.second.serial &&
          incident.incidentId === actualCollisionIncidentId(row.context, incident),
        'Actual derived028 identity',
      );
      for (const identity of [incident.first, incident.second])
        functionalCheck(
          row.collisionIdentities.some(
            (binding) => JSON.stringify(binding) === JSON.stringify(identity),
          ),
          'Incident binds actual acquired collider identity',
        );
    }
    functionalCheck(
      row.incidents.length <= 32 &&
        row.events.length <= 8 &&
        row.damageBefore.length <= 64 &&
        row.damageAfter.length <= 64,
      'Declared incident/event/history capacities',
    );
    for (const history of [row.damageBefore, row.damageAfter])
      functionalCheck(
        new TextEncoder().encode(JSON.stringify(history)).byteLength <= 65536,
        'Actual bounded full damage prefix bytes',
      );
    functionalCheck(
      row.mechanicsBefore.classId === row.classId && row.mechanicsAfter.classId === row.classId,
      'Actual mechanical class',
    );
    for (const key of [
      'classId',
      'version',
      'massKg',
      'powerW',
      'grip',
      'brakeAccelerationMps2',
      'wheels',
      'turningRadiusM',
    ])
      functionalCheck(
        JSON.stringify(row.mechanicsBefore[key]) === JSON.stringify(row.mechanicsAfter[key]),
        'Immutable native mechanics ' + key,
      );
    for (const operation of [row.noPoint, row.recovered, row.blocked])
      for (const boundary of [operation.before, operation.after])
        for (const body of [boundary.subject, boundary.other])
          functionalCheck(
            [
              body.physicsStepSerial,
              ...Object.values(body.transform.positionM),
              ...Object.values(body.transform.rotationQuaternion),
              ...Object.values(body.velocityMps),
              ...Object.values(body.angularVelocityRadS),
            ].every(Number.isFinite),
            'Finite actual native boundary',
          );
    functionalCheck(
      row.unsupported.length === 3 &&
        row.unsupported.every(
          (p) => p.result.inspection.status === 'INVALID_SUPPORT' && p.result.attempted === 0,
        ),
      'Actual unsupported placement zero setters',
    );
    const fault = row.nativeSetterFault;
    functionalCheck(
      fault.scope === 'ACTUAL030_OWNER_TRUSTED_R_NATIVE_PARTIAL' &&
        fault.result.attempted === 2 &&
        fault.result.completed === 1 &&
        typeof fault.result.failure === 'string' &&
        fault.injectedSetterAttempts === 1 &&
        fault.serialBefore === fault.serialAfter &&
        fault.retryRejected === true &&
        fault.operation.record.status === 'PARTIAL',
      'Actual owner partial native setter fault, no retry or extra native step',
    );
    functionalCheck(
      fault.result.status === 'SAFE' &&
        fault.result.colliderCount > 0 &&
        fault.operation.record.pointId === row.recovered.record.pointId,
      'Actual owner candidate fresh native inspection, distinct from setup probe',
    );
    functionalCheck(
      JSON.stringify(fault.before.other) === JSON.stringify(fault.after.other) &&
        JSON.stringify(recoverySnapshot(fault.after.subject)) ===
          JSON.stringify(fault.result.after),
      'Actual partial readback and other body retained',
    );
    functionalCheck(
      row.keys.some(
        (p) =>
          p.stage === 'TRUSTED_DRIVING' && p.isTrusted && p.type === 'keydown' && p.code === 'KeyW',
      ) &&
        row.keys.some(
          (p) =>
            p.stage === 'TRUSTED_DRIVING' &&
            p.isTrusted &&
            p.type === 'keydown' &&
            (p.code === 'KeyA' || p.code === 'KeyD'),
        ),
      'Actual trusted025 driving and turn inputs',
    );
    functionalCheck(
      row.noPoint.result === 'NO_VALID_POINT' &&
        row.noPoint.serialBefore === row.noPoint.serialAfter,
      'No-point no extra native step',
    );
    functionalCheck(
      JSON.stringify(row.noPoint.before) === JSON.stringify(row.noPoint.after),
      'No-point bodies unchanged',
    );
    for (const operation of [row.noPoint, row.recovered, row.blocked]) {
      trustedEdge(operation.edge, {
        tick: operation.acceptedTick,
        vehicleId: row.vehicleId,
        generation: row.generation,
      });
      functionalCheck(
        operation.serialBefore === operation.serialAfter,
        'No operation physics step',
      );
      functionalCheck(
        operation.serialBefore === 180 + operation.acceptedTick,
        'Native operation counter matches actual controller boundary',
      );
      functionalCheck(
        JSON.stringify(operation.otherBefore) === JSON.stringify(operation.otherAfter),
        'Other native body unchanged',
      );
    }
    const r = row.recovered.record;
    functionalCheck(r.placement !== null, 'Completed actual placement required');
    functionalCheck(row.blocked.record.placement !== null, 'Blocked placement required');
    functionalCheck(row.hud.record.placement !== null, 'HUD placement required');
    functionalCheck(row.remapped.record.placement !== null, 'Remapped placement required');
    for (const operation of [row.recovered, row.blocked, row.remapped, row.hud, fault.operation]) {
      const record = operation.record;
      functionalCheck(record.placement !== null, 'Actual placement record required');
      functionalCheck(
        operation.serialBefore === 180 + operation.acceptedTick &&
          operation.serialAfter === operation.serialBefore,
        'Actual accepted controller boundary/native serial binding',
      );
      functionalCheck(
        record.acceptedTick === operation.acceptedTick &&
          record.requestedTick === operation.acceptedTick &&
          record.vehicleId === row.vehicleId &&
          record.bodyGeneration === row.generation &&
          record.mode === 'MANUAL' &&
          record.origin === (operation === row.hud ? 'HUD' : 'R'),
        'Record bound to accepted R seat/tick/generation',
      );
      functionalCheck(
        JSON.stringify(record.context) === JSON.stringify(row.context),
        'Record exact actual context',
      );
      functionalCheck(
        JSON.stringify(record.before) ===
          JSON.stringify(recoverySnapshot(operation.before.subject)),
        'Record before matches actual native bracket',
      );
      functionalCheck(
        JSON.stringify(record.placement.after) ===
          JSON.stringify(recoverySnapshot(operation.after.subject)),
        'Record after matches actual native bracket',
      );
      functionalCheck(
        record.placement.physicsStepSerial === operation.serialBefore &&
          operation.before.subject.physicsStepSerial === operation.serialBefore &&
          operation.after.subject.physicsStepSerial === operation.serialAfter,
        'Native serial evidence crossbound',
      );
      functionalCheck(
        row.history.some(
          (entry) =>
            entry.operationId === record.operationId &&
            JSON.stringify(entry) === JSON.stringify(record),
        ),
        'Exact operation retained in protected history',
      );
    }
    functionalCheck(
      JSON.stringify(row.blocked.before) === JSON.stringify(row.blocked.after),
      'Blocked BOTH bodies unchanged',
    );
    const event = row.events[0];
    functionalCheck(
      event.type === 'VEHICLE_RECOVERED' &&
        event.eventId === r.operationId &&
        event.tick === r.acceptedTick &&
        JSON.stringify(event.entityIds) === JSON.stringify([row.vehicleId]) &&
        event.payload.vehicleId === row.vehicleId &&
        event.payload.recoveryPointId === r.pointId,
      'Actual event bound to completed operation',
    );
    for (const key of ['schemaVersion', 'units', 'sessionId', 'worldEpoch'] as const)
      functionalCheck(event[key] === row.context[key], 'Event exact context');
    functionalCheck(
      r.status === 'COMPLETED' && r.kind === 'TELEPORT' && !r.learningEligible && r.origin === 'R',
      'Explicit non-learning completed record',
    );
    functionalCheck(
      r.placement.attempted === 5 && r.placement.completed === 5 && r.placement.after !== null,
      'Actual completed native setters',
    );
    functionalCheck(
      Object.values(r.placement.after.velocityMps).every((v) => v === 0) &&
        Object.values(r.placement.after.angularVelocityRadS).every((v) => v === 0),
      'Actual native linear/angular zero',
    );
    functionalCheck(
      row.blocked.record.status === 'DENIED' &&
        row.blocked.record.placement.attempted === 0 &&
        row.blocked.record.placement.status === 'BLOCKED',
      'Fresh blocker no setters',
    );
    functionalCheck(
      row.segmentAfter.completeness === 'CLOSED' &&
        row.segmentAfter.closeReason === 'RECOVERY' &&
        row.segmentAfter.endTick === r.acceptedTick,
      'Actual005 closure',
    );
    functionalCheck(
      JSON.stringify({
        ...row.segmentAfter,
        endTick: null,
        closeReason: null,
        completeness: 'OPEN',
      }) === JSON.stringify(row.segmentBefore),
      '005 prefix preserved',
    );
    functionalCheck(
      JSON.stringify(row.damageAfter.slice(0, row.damageBefore.length)) ===
        JSON.stringify(row.damageBefore),
      '029 append-only prefix',
    );
    const retry = row.deliveryRetry;
    functionalCheck(
      retry.scope === 'ACTUAL030_OWNER_SUFFIX_RETRY_NO_NATIVE_REPLAY' &&
        retry.partial.status === 'PARTIAL' &&
        retry.partial.deliveredStages === 2 &&
        retry.completed.status === 'COMPLETED' &&
        retry.segmentAttempts === 2 &&
        retry.serialBefore === retry.serialAfter &&
        JSON.stringify(retry.before) === JSON.stringify(retry.after),
      'Actual owner accepted-prefix suffix retry without placement replay',
    );
    functionalCheck(
      retry.partial.operationId === r.operationId &&
        JSON.stringify(retry.completed) === JSON.stringify(r),
      'Actual retry same stable operation',
    );
    functionalCheck(
      row.lastIncidentBefore === row.lastIncidentAfter && row.availabilityAfter === 'AVAILABLE',
      'Actual029 restored with incident retained',
    );
    functionalCheck(
      JSON.stringify(row.deliveryOrder) === JSON.stringify(['027', '025', '005', '007']) &&
        row.events.length === 1,
      'Actual delivery order/event once',
    );
    functionalCheck(
      row.neutral.heldKeys === 0 &&
        row.neutral.raw.throttle === 0 &&
        row.neutral.raw.brake === 0 &&
        row.neutral.raw.steering === 0,
      'Actual025 input neutral',
    );
    functionalCheck(
      row.historyBytes <= RECOVERY_LIMITS.serializedBytes &&
        row.history.length <= RECOVERY_LIMITS.operations,
      'Protected trueUTF8 capacity',
    );
    functionalCheck(
      row.historyBytes <= FUNCTIONAL.historyBytes && row.history.length === 4,
      'Four functional operation records, bounded raw transport',
    );
    for (const record of row.history) {
      functionalCheck(
        Number.isSafeInteger(record.requestedTick) &&
          record.requestedTick >= 0 &&
          record.requestedTick <= 394 &&
          Number.isSafeInteger(record.validatedTick) &&
          record.validatedTick >= 0 &&
          record.validatedTick <= record.acceptedTick &&
          record.operationId === actualRecoveryOperationId(row.context, record) &&
          record.pointId === actualRecoveryPointId(record),
        'Actual derived030 operation/point identity',
      );
    }
    for (const record of [...row.damageBefore, ...row.damageAfter]) {
      for (const key of ['schemaVersion', 'units', 'sessionId', 'worldEpoch'] as const)
        functionalCheck(record[key] === row.context[key], 'Actual029 history context');
      if (record.kind === 'INCIDENT') {
        const incident = row.incidents.find(
          (incident) => incident.incidentId === record.operationId,
        );
        functionalCheck(
          incident !== undefined &&
            record.tick === incident.tick &&
            record.impulseNs === incident.impulseNs &&
            record.otherEntityId === incident.otherEntityId &&
            JSON.stringify(record.collisionSerials) ===
              JSON.stringify([incident.first.serial, incident.second.serial]),
          '029 incident history binds complete actual028 identity/solver row',
        );
      } else {
        functionalCheck(
          record.kind === 'RECOVERY' &&
            record.operationId === r.operationId &&
            record.tick === r.acceptedTick &&
            record.impulseNs === null &&
            record.otherEntityId === null &&
            record.collisionSerials.length === 0,
          '029 recovery history binds actual030 operation',
        );
      }
    }
    functionalCheck(
      new Set(row.history.map((entry) => entry.operationId)).size === row.history.length,
      'No duplicate protected operation IDs',
    );
    functionalCheck(
      row.hud.pointer.isTrusted === true &&
        row.hud.focusedOwnButton === true &&
        row.hud.record.origin === 'HUD' &&
        row.hud.record.status === 'DENIED' &&
        row.hud.record.placement.attempted === 0 &&
        JSON.stringify(row.hud.before) === JSON.stringify(row.hud.after),
      'Actual focused owned HUD fresh blocker denial',
    );
    functionalCheck(
      row.staleHud.pointer.isTrusted === true &&
        row.staleHud.pointer.actualSeat === null &&
        JSON.stringify(row.staleHud.before) === JSON.stringify(row.staleHud.after) &&
        row.staleHud.historyBefore === row.staleHud.historyAfter,
      'Actual stale visible HUD cannot address removed PLAYER seat',
    );
    functionalCheck(
      row.auto.seat === null &&
        JSON.stringify(row.auto.before) === JSON.stringify(row.auto.after) &&
        row.auto.historyBefore === row.auto.historyAfter &&
        keyRange(row, row.auto).some(
          (key) => key.isTrusted && key.code === 'KeyR' && key.type === 'keyup',
        ),
      'Actual AUTO R has no mutation or history',
    );
    functionalCheck(
      row.staleGeneration.rejected === true &&
        JSON.stringify(row.staleGeneration.before) === JSON.stringify(row.staleGeneration.after),
      'Forged generation admission rejected without native mutation',
    );
    trustedEdge(row.repeat.edge, {
      tick: row.repeat.acceptedTick,
      vehicleId: row.vehicleId,
      generation: row.generation,
    });
    functionalCheck(
      row.repeat.serialBefore === row.repeat.serialAfter &&
        JSON.stringify(row.repeat.before) === JSON.stringify(row.repeat.after) &&
        row.repeat.historyBefore === row.repeat.historyAfter &&
        row.repeat.eventsBefore === row.repeat.eventsAfter,
      'Held repeats cannot create another operation or native mutation',
    );
    functionalCheck(
      keyRange(row, row.repeat).some(
        (key) => key.isTrusted && key.type === 'keydown' && key.repeat && key.code === 'KeyR',
      ) &&
        keyRange(row, row.repeat).some(
          (key) => key.isTrusted && key.type === 'keyup' && key.code === 'KeyR',
        ),
      'Actual held repeat and release',
    );
    functionalCheck(
      JSON.stringify(row.remapOld.before) === JSON.stringify(row.remapOld.after) &&
        row.remapOld.historyBefore === row.remapOld.historyAfter &&
        keyRange(row, row.remapOld).some(
          (key) => key.isTrusted && key.code === 'KeyR' && key.type === 'keyup',
        ),
      'Old binding produces no recovery after remap',
    );
    trustedEdge(
      row.remapped.edge,
      { tick: row.remapped.acceptedTick, vehicleId: row.vehicleId, generation: row.generation },
      'KeyT',
    );
    functionalCheck(
      row.remapped.record.status === 'DENIED' &&
        row.remapped.record.operationId === row.blocked.record.operationId &&
        row.remapped.record.placement.attempted === 0 &&
        row.remapped.serialBefore === row.remapped.serialAfter &&
        JSON.stringify(row.remapped.otherBefore) === JSON.stringify(row.remapped.otherAfter),
      'Actual remapped key coalesces same stable tick without native steps',
    );
    functionalCheck(
      new TextEncoder().encode(JSON.stringify(row.history)).byteLength === row.historyBytes,
      'Actual history bytes',
    );
    functionalCheck(
      row.lifetimes.length === 20 &&
        row.lifetimes.every(
          (p) =>
            p.activePorts === 1 &&
            p.afterPorts === 0 &&
            p.listeners === 0 &&
            p.nodes === 0 &&
            p.serialBefore === p.serialAfter,
        ),
      'Bounded actual lifecycle/once cleanup',
    );
    functionalCheck(
      row.cleanup.nativeBodies === 0 &&
        row.cleanup.nativeColliders === 0 &&
        row.cleanup.nativeSubscriptions === 0 &&
        row.cleanup.recoveryPorts === 0 &&
        row.cleanup.driveListeners === 0 &&
        row.cleanup.recoveryListeners === 0 &&
        row.cleanup.recoveryNodes === 0 &&
        row.cleanup.domConnected === false,
      'Actual native/DOM/listener cleanup',
    );
    functionalCheck(
      row.cleanup.totalCauses === 0 && row.cleanup.resources === row.cleanup.attempted,
      'All owners once attempted',
    );
  }
  functionalCheck(
    report.backendCleanup.sceneDisposed === true &&
      report.backendCleanup.meshes === 0 &&
      report.backendCleanup.materials === 0 &&
      report.backendCleanup.engineScenes === 0,
    'Actual backend cleanup',
  );
  functionalCheck(
    report.ownership.totalCauses === 0 && report.ownership.resources === report.ownership.attempted,
    'Actual root once-only cleanup',
  );
  return {
    verification: 'TRUSTED_R_FUNCTIONAL_RAW_PASS',
    performanceAcceptance: false,
    pbiDone: false,
  };
}

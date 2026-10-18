import { fields, requireContract, tick, boolean, nullable, list } from '../sessions';
import { parseSimulationEvent } from '../simulation';
import type { SimulationEvent } from '../simulation';
import type { InterventionSegment } from './contracts';
import { admitInterventionRecord } from './intervention-admission';
import { interventionText } from './intervention-validation';
import type {
  InterventionRecordReservation,
  InterventionRecordReceipt,
  InterventionEventReservation,
  InterventionEventReceipt,
  InterventionIntakeReceipt,
  InterventionIntakeDescriptor,
} from './intervention-ports';
export function sameInterventionRecord(
  value: unknown,
  expected: InterventionSegment | null,
): InterventionSegment | null {
  if (expected === null) {
    requireContract(value === null, 'Substituted absent intervention record');
    return null;
  }
  const actual = admitInterventionRecord(value).record;
  requireContract(
    JSON.stringify(actual) === JSON.stringify(expected),
    'Substituted prepared intervention record',
  );
  return actual;
}
export function readInterventionRecordReservation(
  value: unknown,
  closed: InterventionSegment | null,
  opened: InterventionSegment | null,
): InterventionRecordReservation {
  const d = fields(value, ['version', 'sequence', 'closed', 'opened']);
  requireContract(
    d.version === '069-record-reservation-v1' && tick(d.sequence) > 0,
    'Intervention record reservation version/sequence',
  );
  return Object.freeze({
    version: '069-record-reservation-v1',
    sequence: tick(d.sequence),
    closed: sameInterventionRecord(d.closed, closed),
    opened: sameInterventionRecord(d.opened, opened),
  });
}
export function readInterventionRecordReceipt(
  value: unknown,
  reservation: InterventionRecordReservation,
): InterventionRecordReceipt {
  const d = fields(value, [
    'version',
    'sequence',
    'accepted',
    'closedSegmentId',
    'openedSegmentId',
  ]);
  requireContract(
    d.version === '069-record-receipt-v1' && tick(d.sequence) === reservation.sequence,
    'Intervention record receipt version/sequence',
  );
  const r = Object.freeze({
    version: '069-record-receipt-v1' as const,
    sequence: tick(d.sequence),
    accepted: boolean(d.accepted),
    closedSegmentId: nullable(d.closedSegmentId, interventionText),
    openedSegmentId: nullable(d.openedSegmentId, interventionText),
  });
  requireContract(
    r.closedSegmentId === (reservation.closed?.segmentId ?? null) &&
      r.openedSegmentId === (reservation.opened?.segmentId ?? null),
    'Intervention record receipt operation',
  );
  return r;
}
export function readInterventionEventReservation(
  value: unknown,
  expected: readonly SimulationEvent[],
): InterventionEventReservation {
  const d = fields(value, ['version', 'sequence', 'events']);
  requireContract(
    d.version === '069-event-reservation-v1' &&
      tick(d.sequence) > 0 &&
      Array.isArray(d.events) &&
      d.events.length <= 2,
    'Intervention event reservation',
  );
  const events = list(d.events, parseSimulationEvent);
  requireContract(
    JSON.stringify(events) === JSON.stringify(expected),
    'Substituted prepared event reservation',
  );
  return Object.freeze({ version: '069-event-reservation-v1', sequence: tick(d.sequence), events });
}
export function readInterventionEventReceipt(
  value: unknown,
  reservation: InterventionEventReservation,
): InterventionEventReceipt {
  const d = fields(value, ['version', 'sequence', 'acceptedCount', 'complete', 'listenerFailures']);
  requireContract(
    d.version === '069-event-receipt-v1' && tick(d.sequence) === reservation.sequence,
    'Intervention event receipt version/sequence',
  );
  const n = tick(d.acceptedCount),
    complete = boolean(d.complete),
    failures = tick(d.listenerFailures);
  requireContract(
    n <= reservation.events.length &&
      complete === (n === reservation.events.length) &&
      failures <= 256,
    'Intervention event receipt count/completion',
  );
  return Object.freeze({
    version: '069-event-receipt-v1',
    sequence: tick(d.sequence),
    acceptedCount: n,
    complete,
    listenerFailures: failures,
  });
}
export function readInterventionIntakeReceipt(
  value: unknown,
  descriptor: InterventionIntakeDescriptor,
): InterventionIntakeReceipt {
  const d = fields(value, ['version', 'operationId', 'segmentId', 'accepted']);
  requireContract(
    d.version === '069-intake-receipt-v1' &&
      d.operationId === descriptor.operationId &&
      d.segmentId === descriptor.segmentId,
    'Intervention intake receipt operation/version',
  );
  return Object.freeze({
    version: '069-intake-receipt-v1',
    operationId: interventionText(d.operationId),
    segmentId: interventionText(d.segmentId),
    accepted: boolean(d.accepted),
  });
}

import {
  choice,
  contextFields,
  fields,
  list,
  nullable,
  readContext,
  requireContract,
  text,
  tick,
} from '../sessions';
import type { ContractContext } from '../sessions';

export const rideStatuses = [
  'AVAILABLE',
  'TO_PICKUP',
  'PICKUP',
  'TO_DROPOFF',
  'DROPOFF',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
export interface Ride extends ContractContext {
  readonly rideId: string;
  readonly taxiId: string | null;
  readonly pickupId: string;
  readonly dropoffId: string;
  readonly routeLaneIds: readonly string[];
  readonly eventIds: readonly string[];
  readonly status: (typeof rideStatuses)[number];
  readonly createdTick: number;
  readonly assignedTick: number | null;
  readonly completedTick: number | null;
  readonly failureReason: string | null;
}

export function parseRide(value: unknown): Ride {
  const data = fields(value, [
    ...contextFields,
    'rideId',
    'taxiId',
    'pickupId',
    'dropoffId',
    'routeLaneIds',
    'eventIds',
    'status',
    'createdTick',
    'assignedTick',
    'completedTick',
    'failureReason',
  ]);
  const status = choice(data.status, rideStatuses);
  const createdTick = tick(data.createdTick);
  const assignedTick = nullable(data.assignedTick, tick);
  const completedTick = nullable(data.completedTick, tick);
  const taxiId = nullable(data.taxiId, text);
  const failureReason = nullable(data.failureReason, text);
  const terminal = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(status);
  requireContract(terminal === (completedTick !== null), 'Terminal rides require completedTick');
  requireContract(
    (status === 'FAILED' || status === 'CANCELLED') === (failureReason !== null),
    'Failure/cancellation must have reason',
  );
  requireContract(
    (taxiId !== null) === (assignedTick !== null),
    'Taxi and assignment tick must agree',
  );
  requireContract(status !== 'AVAILABLE' || taxiId === null, 'Available ride cannot be assigned');
  requireContract(
    ['AVAILABLE', 'FAILED', 'CANCELLED'].includes(status) || taxiId !== null,
    'Active/completed ride requires assignment',
  );
  requireContract(
    assignedTick === null || assignedTick >= createdTick,
    'Assignment before creation',
  );
  requireContract(
    completedTick === null || completedTick >= (assignedTick ?? createdTick),
    'Completion before assignment/creation',
  );
  const eventIds = list(data.eventIds, text);
  requireContract(new Set(eventIds).size === eventIds.length, 'Duplicate ride event IDs');
  return Object.freeze({
    ...readContext(data),
    rideId: text(data.rideId),
    taxiId,
    pickupId: text(data.pickupId),
    dropoffId: text(data.dropoffId),
    routeLaneIds: list(data.routeLaneIds, text),
    eventIds,
    status,
    createdTick,
    assignedTick,
    completedTick,
    failureReason,
  });
}

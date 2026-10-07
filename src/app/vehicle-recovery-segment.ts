import { parseInterventionSegment } from '../telemetry';
import type { InterventionSegment } from '../telemetry';
import type { BodyIdentity, RecoverySegmentBoundary } from '../vehicles';
import { requireContract } from '../sessions';
import type { ContractContext } from '../sessions';

/**005 segment-only write port: route/trip ownership is deliberately untouched. */
export function createRecoverySegmentBoundary(
  context: ContractContext,
  ports: {
    read(identity: BodyIdentity): InterventionSegment | null;
    write(identity: BodyIdentity, closed: InterventionSegment, operationId: string): void;
  },
): RecoverySegmentBoundary {
  let pending: { identity: BodyIdentity; operationId: string; closed: InterventionSegment } | null =
    null;
  const read = (identity: BodyIdentity, at: number) => {
    const raw = ports.read(identity);
    if (raw === null) return null;
    const segment = parseInterventionSegment(raw);
    requireContract(
      segment.sessionId === context.sessionId &&
        segment.worldEpoch === context.worldEpoch &&
        segment.vehicleId === identity.entityId &&
        segment.controlMode !== 'AUTO' &&
        segment.startTick <= at,
      'Foreign/stale recovery segment',
    );
    return segment;
  };
  return Object.freeze({
    inspect(identity: BodyIdentity, at: number) {
      const segment = read(identity, at);
      requireContract(
        segment === null || segment.completeness === 'OPEN',
        'Recovery requires open005 boundary',
      );
      requireContract(
        segment === null ||
          (segment.samples.every((sample) => sample.tick <= at) &&
            segment.events.every((event) => event.tick <= at)),
        'Recovery segment contains future samples',
      );
    },
    close(identity: BodyIdentity, at: number, operationId: string) {
      const current = read(identity, at);
      if (pending !== null && pending.operationId === operationId) {
        requireContract(pending.identity === identity, 'Conflicting recovery segment operation');
        if (current && JSON.stringify(current) === JSON.stringify(pending.closed)) return;
        requireContract(
          current?.segmentId === pending.closed.segmentId && current.completeness === 'OPEN',
          'Recovery segment changed during failed delivery',
        );
      } else {
        if (current === null) return;
        requireContract(current.completeness === 'OPEN', 'Recovery segment is not open');
        const closed = parseInterventionSegment({
          ...current,
          endTick: at,
          closeReason: 'RECOVERY',
          completeness: 'CLOSED',
        });
        pending = { identity, operationId, closed };
      }
      if (pending === null) throw new Error('Recovery segment delivery missing');
      const delivery = pending;
      requireContract(
        ports.write(identity, delivery.closed, operationId) === undefined,
        'Recovery005 write must be synchronous void',
      );
      const actual = read(identity, at);
      requireContract(
        actual !== null && JSON.stringify(actual) === JSON.stringify(delivery.closed),
        'Recovery005 close was not actually accepted',
      );
    },
  });
}

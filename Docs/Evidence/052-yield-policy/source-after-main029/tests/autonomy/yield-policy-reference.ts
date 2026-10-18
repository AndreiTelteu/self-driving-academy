import type { PriorityArrival } from '../../src/world/priority-arrival';

/** Preproduction oracle. These are complete owner facts, never a044local projection. */
export interface ReferenceYieldInput {
  readonly thresholdS: number;
  readonly coverage: 'COMPLETE_HORIZON' | 'LOCAL_ONLY' | 'INCOMPLETE';
  readonly horizonS: number;
  readonly discontinuity: boolean;
  readonly candidate: Readonly<{ entryS: number; exitS: number }> | null;
  readonly pairs: readonly Readonly<{
    priority: 'YIELD' | 'PRIORITY' | 'EQUAL';
    arrival: PriorityArrival | null;
  }>[];
}
export interface ReferenceYieldDecision {
  readonly action: 'ACCEPT' | 'REFUSE' | 'UNKNOWN';
  readonly reason: 'GAP_ACCEPTED' | 'GAP_REFUSED' | 'NO_EXPOSURE' | 'UNAVAILABLE';
  readonly thresholdS: number;
  readonly minimumGapS: number | null;
}
/** Independent interval predicate prepared before production052. No state or actuation. */
export function referenceYield(input: ReferenceYieldInput): ReferenceYieldDecision {
  const candidate = input.candidate;
  let unavailable =
    input.coverage !== 'COMPLETE_HORIZON' ||
    input.discontinuity ||
    candidate === null ||
    input.horizonS < (candidate?.exitS ?? 0) + input.thresholdS;
  let minimum: number | null = null;
  for (const pair of input.pairs) {
    if (pair.priority === 'PRIORITY') continue;
    if (pair.priority === 'EQUAL' || pair.arrival === null) {
      unavailable = true;
      continue;
    }
    if (pair.arrival.state === 'CLEARED') continue;
    if (
      candidate === null ||
      pair.arrival.timeToEntryS === null ||
      pair.arrival.timeToExitS === null
    ) {
      unavailable = true;
      continue;
    }
    const separation = Math.max(
      pair.arrival.timeToEntryS - candidate.exitS,
      candidate.entryS - pair.arrival.timeToExitS,
    );
    minimum = minimum === null ? separation : Math.min(minimum, separation);
  }
  return Object.freeze({
    action: unavailable
      ? 'UNKNOWN'
      : minimum !== null && minimum < input.thresholdS
        ? 'REFUSE'
        : 'ACCEPT',
    reason: unavailable
      ? 'UNAVAILABLE'
      : minimum === null
        ? 'NO_EXPOSURE'
        : minimum < input.thresholdS
          ? 'GAP_REFUSED'
          : 'GAP_ACCEPTED',
    thresholdS: input.thresholdS,
    minimumGapS: minimum,
  });
}

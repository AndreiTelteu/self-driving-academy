import { parseInterventionSegment } from '../../../src/telemetry';
import type { InterventionSegment } from '../../../src/telemetry';
import { functionalCheck } from '../vehicle-recovery-after/functional-proof';

/** Fixture host lifecycle only, AFTER acknowledged delivery and the existing neutral step. */
export function nextFixtureOpenBoundary(closed: InterventionSegment, nextTick: number) {
  const historical = parseInterventionSegment(closed);
  functionalCheck(
    historical.completeness === 'CLOSED' && historical.closeReason === 'RECOVERY',
    'Next fixture boundary requires acknowledged recovery closure',
  );
  functionalCheck(
    Number.isSafeInteger(nextTick) &&
      historical.endTick !== null &&
      nextTick === historical.endTick + 1,
    'Next boundary begins at existing next accepted tick',
  );
  return parseInterventionSegment({
    ...historical,
    segmentId: historical.segmentId + '-next-' + nextTick,
    startTick: nextTick,
    endTick: null,
    closeReason: null,
    completeness: 'OPEN',
    samples: [],
    events: [],
  });
}

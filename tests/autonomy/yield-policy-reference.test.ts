import assert from 'node:assert/strict';
import test from 'node:test';
import { referenceYield } from './yield-policy-reference';
import type { ReferenceYieldInput } from './yield-policy-reference';

const known = (): ReferenceYieldInput => ({
  thresholdS: 3,
  coverage: 'COMPLETE_HORIZON',
  horizonS: 10,
  discontinuity: false,
  candidate: { entryS: 1, exitS: 2 },
  pairs: [
    { priority: 'YIELD', arrival: { state: 'APPROACHING', timeToEntryS: 5, timeToExitS: 6 } },
  ],
});
test('preproduction interval oracle accepts exact boundary on either side and rejects overlap', () => {
  assert.equal(referenceYield(known()).action, 'ACCEPT');
  assert.equal(referenceYield({ ...known(), thresholdS: 3.00001 }).action, 'REFUSE');
  assert.equal(
    referenceYield({ ...known(), candidate: { entryS: 9, exitS: 10 }, horizonS: 13 }).action,
    'ACCEPT',
  );
  assert.equal(
    referenceYield({ ...known(), candidate: { entryS: 5.5, exitS: 7 } }).action,
    'REFUSE',
  );
});
test('unknown coverage, unresolved priority and indefinite occupancy cannot become availability', () => {
  for (const input of [
    { ...known(), coverage: 'LOCAL_ONLY' as const, pairs: [] },
    { ...known(), coverage: 'INCOMPLETE' as const },
    { ...known(), horizonS: 4.99 },
    { ...known(), discontinuity: true },
    { ...known(), candidate: null },
    { ...known(), pairs: [{ priority: 'EQUAL' as const, arrival: null }] },
    {
      ...known(),
      pairs: [
        {
          priority: 'YIELD' as const,
          arrival: { state: 'OCCUPYING' as const, timeToEntryS: 0, timeToExitS: null },
        },
      ],
    },
    {
      ...known(),
      pairs: [
        {
          priority: 'YIELD' as const,
          arrival: { state: 'STATIONARY' as const, timeToEntryS: null, timeToExitS: null },
        },
      ],
    },
  ])
    assert.equal(referenceYield(input).action, 'UNKNOWN');
  assert.equal(referenceYield({ ...known(), pairs: [] }).reason, 'NO_EXPOSURE');
});

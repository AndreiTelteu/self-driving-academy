import assert from 'node:assert/strict';
import test from 'node:test';
import {
  admitInterventionRecord,
  interventionRecordBytes,
  parseInterventionSegment,
  segmentCloseReasons,
  createInterventionRecordStore,
  createInterventionIntake,
} from '../../src/telemetry';
import { segment } from '../contracts/fixtures';
import { SEGMENT_CONTEXT } from './manual-segments-fixture';
test('069005 additive reasons preserve existing schema and are explicit wire values', () => {
  for (const reason of ['PROFILE_RESTORE', 'PROFILE_IMPORT', 'STATE_IMPORT'] as const) {
    assert.equal(
      parseInterventionSegment({ ...segment(), closeReason: reason }).closeReason,
      reason,
    );
    assert.ok(segmentCloseReasons.includes(reason));
  }
  assert.throws(() => parseInterventionSegment({ ...segment(), closeReason: 'IMPORT_WHATEVER' }));
});
test('069 own-data capacity rejects accessor/symbol/sparse/33 samples before cloning', () => {
  let reads = 0;
  const v = { ...segment() };
  Object.defineProperty(v, 'samples', {
    enumerable: true,
    get() {
      reads++;
      return [];
    },
  });
  assert.throws(() => admitInterventionRecord(v));
  assert.equal(reads, 0);
  assert.throws(() =>
    admitInterventionRecord({ ...segment(), samples: Array(33).fill(segment().samples[0]) }),
  );
  assert.throws(() => interventionRecordBytes({ [Symbol('x')]: 1 }));
  assert.throws(() => interventionRecordBytes({ samples: new Array(2) }));
});
test('069 exact UTF8 envelope capacity includes commas/braces and escaped code units', () => {
  const record = segment();
  assert.equal(
    interventionRecordBytes(record),
    new TextEncoder().encode(JSON.stringify(record)).length,
  );
  assert.throws(
    () =>
      interventionRecordBytes({
        samples: Array(32).fill({ values: Array(32).fill('\u0001'.repeat(256)) }),
      }),
    /capacity/,
  );
});
test('069 repository refuses sample-prefix mutation and forged receipt/ticket ownership', () => {
  const store = createInterventionRecordStore(SEGMENT_CONTEXT),
    v = {
      ...segment(),
      ...SEGMENT_CONTEXT,
      startTick: 10,
      endTick: null,
      closeReason: null,
      completeness: 'OPEN' as const,
      samples: [],
      events: [],
    },
    r = store.port.reserve(null, parseInterventionSegment(v));
  store.port.commit(r);
  const old = store.port.read(v.segmentId)!;
  assert.throws(() =>
    store.port.reserve(
      parseInterventionSegment({
        ...old,
        endTick: 11,
        closeReason: 'MODE_CHANGE',
        completeness: 'CLOSED',
        learningEpoch: old.learningEpoch + 1,
      }),
      null,
    ),
  );
  assert.equal(store.port.read(v.segmentId), old);
  assert.throws(() => store.port.commit({ ...r }));
});
test('069 intake metadata admission is separate from fake training and exact acknowledgement frees counts', () => {
  const q = createInterventionIntake(SEGMENT_CONTEXT),
    d = {
      ...SEGMENT_CONTEXT,
      version: '069-closed-learning-intake-v1' as const,
      segmentId: 's',
      playerId: 'p',
      profileId: 'profile',
      learningEpoch: 1,
      baseVersionId: 'base',
      endTick: 1,
      recordBytes: 65000,
      operationId: 'op',
    };
  assert.throws(() => q.accept(d), /Unreserved/);
  q.reserve(d);
  const r = q.accept(d);
  assert.equal(q.accept(d), r);
  assert.equal(q.getStats().referencedPayloadBytes, 65000);
  assert.throws(() => q.acknowledge({ ...r }));
  q.acknowledge(r);
  assert.equal(q.getStats().entries, 0);
  assert.equal(q.getStats().serializedDescriptorBytes, 2);
});

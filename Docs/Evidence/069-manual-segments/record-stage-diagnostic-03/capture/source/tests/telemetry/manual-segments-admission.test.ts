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

test('069 admission reuses only its own copied immutable record identity and exact UTF8 bytes', () => {
  const external = structuredClone(segment());
  const admitted = admitInterventionRecord(external);
  assert.notEqual(admitted.record, external);
  assert.equal(admitted.bytes, new TextEncoder().encode(JSON.stringify(admitted.record)).length);
  assert.equal(admitInterventionRecord(admitted.record), admitted);
  assert.equal(admitInterventionRecord(admitted.record).record, admitted.record);
  // A separate005 parse, caller freeze or copied identical contents is unbranded.
  const direct005 = parseInterventionSegment(external);
  assert.notEqual(admitInterventionRecord(direct005).record, direct005);
  const frozenCopy = Object.freeze({ ...admitted.record });
  assert.notEqual(admitInterventionRecord(frozenCopy).record, frozenCopy);
  assert.notEqual(admitInterventionRecord(external), admitted);
  external.learningEpoch++;
  assert.equal(admitInterventionRecord(external).record.learningEpoch, external.learningEpoch);
  assert.notEqual(external.learningEpoch, admitted.record.learningEpoch);
  external.samples = Array(33).fill(external.samples[0]);
  assert.throws(() => admitInterventionRecord(external), /cardinality/);
});

test('069 trusted record identity cannot be forged by getter, Proxy or frozen metadata substitution', () => {
  const admitted = admitInterventionRecord(segment());
  let getters = 0;
  const getter = { ...admitted.record };
  Object.defineProperty(getter, 'samples', {
    enumerable: true,
    get() {
      getters++;
      return admitted.record.samples;
    },
  });
  Object.freeze(getter);
  assert.throws(() => admitInterventionRecord(getter), /own data descriptor/);
  assert.equal(getters, 0);
  let proxyReads = 0;
  const proxy = new Proxy(admitted.record, {
    getPrototypeOf() {
      proxyReads++;
      throw new Error('unbranded Proxy rejected');
    },
  });
  assert.throws(() => admitInterventionRecord(proxy), /unbranded Proxy rejected/);
  assert.equal(proxyReads, 1);
  assert.equal(admitInterventionRecord(admitted.record), admitted);
  assert.throws(
    () =>
      admitInterventionRecord(
        Object.freeze({ ...admitted.record, learningEligible: true, controlMode: 'MANUAL' }),
      ),
    /LEARNING/,
  );
  assert.throws(
    () => admitInterventionRecord({ ...admitted.record, profileId: 'x'.repeat(257) }),
    /string capacity/,
  );
});

test('069 repository disposal drops its history while immutable admission reuse grants no stale owner access', () => {
  const store = createInterventionRecordStore(SEGMENT_CONTEXT);
  const opened = admitInterventionRecord({
    ...segment(),
    ...SEGMENT_CONTEXT,
    samples: [],
    events: [],
    startTick: 10,
    endTick: null,
    closeReason: null,
    completeness: 'OPEN',
  });
  const reservation = store.port.reserve(null, opened.record);
  store.port.commit(reservation);
  const actual = store.port.read(opened.record.segmentId)!;
  const cached = admitInterventionRecord(actual);
  assert.equal(admitInterventionRecord(actual), cached);
  store.dispose();
  store.dispose();
  assert.equal(store.getStats().records, 0);
  assert.throws(() => store.port.read(actual.segmentId), /disposed/);
  assert.throws(() => store.port.reserve(null, actual), /disposed/);
  assert.equal(admitInterventionRecord(actual), cached); // Immutable DTO, never a live owner/authority capability.
});

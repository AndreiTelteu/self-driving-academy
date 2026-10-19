// SOURCE-only adversarial fixtures. No native acquisition, physics, servers or browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REFERENCE_PROTOCOL,
  descriptors,
  validateRecord,
  distribution,
} from '../../scripts/manual-segments-reference-records.mjs';
import {
  boundedPath,
  verifyChronology,
} from '../../Docs/Evidence/069-manual-segments/verify-reference.mjs';
const hash = 'a'.repeat(64);
function validRecord() {
  const descriptor = descriptors()[0];
  const identity = { entityId: 'car', handle: 0, generation: 1 };
  const body = {
    identity,
    transform: { positionM: { x: 0, y: 0, z: 0 }, rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 } },
    velocityMps: { x: 0, y: 0, z: 0 },
  };
  const acquiredOwners = [
    'world',
    'controller',
    'keyboard',
    'authority',
    'mode',
    'segment',
    'cameraTarget',
    'bus',
    'selection',
  ];
  const snapshots = Object.fromEntries(
    ['controller', 'keyboard', 'authority', 'mode', 'segment', 'bus', 'selection'].map((name) => [
      name,
      { disposed: true },
    ]),
  );
  snapshots.body = { entities: 0, subscriptions: 0 };
  snapshots.collision = { vehicles: 0, obstacles: 0, colliders: 0 };
  snapshots.segment.retainedRecords = 0;
  snapshots.bus.retainedEvents = 0;
  snapshots.cameraTarget = null;
  return {
    descriptor,
    sourceHash: hash,
    status: 'PASS',
    attemptedTick: 780,
    acceptedTick: 780,
    nativeStepSerial: 780,
    timingSampleCount: 0,
    finiteBodyTickChecks: 780 * descriptor.count,
    nativeInputDigest: hash,
    packetDigest: hash,
    physicalDigest: hash,
    rawInputDigest: hash,
    checkpoints: Array.from({ length: 13 }, (_, i) => ({
      tick: (i + 1) * 60,
      nativeStepSerial: (i + 1) * 60,
      bodies: Array.from({ length: 70 }, () => structuredClone(body)),
    })),
    drivingHostMutations: 0,
    acquiredOwners,
    cleanup: {
      errors: [],
      attempts: [...acquiredOwners].reverse(),
      snapshots,
      disposedReadRejected: true,
    },
    raw: Object.fromEntries(REFERENCE_PROTOCOL.channels.map((c) => [c, null])),
    distributions: Object.fromEntries(REFERENCE_PROTOCOL.channels.map((c) => [c, null])),
    liveRecords: { archivedUtf8Bytes: 1000, retainedRecords: 1 },
    segmentRecords: [
      {
        samples: [],
        events: [],
        learningEligible: false,
        completeness: 'CLOSED',
        startTick: 1,
        endTick: 2,
      },
    ],
  };
}
test('reference protocol fixes24world alternatingOFF/ON and finite raw timing', () => {
  const rows = descriptors();
  assert.equal(rows.length, 24);
  assert.deepEqual(
    rows.slice(0, 4).map((r) => r.observer),
    [false, true, true, false],
  );
  assert.throws(() => distribution([1, NaN]));
  assert.throws(() => distribution([Infinity]));
  assert.equal(distribution([3, 1, 2]).p95, 3);
});
test('record reader rejects lost samples, forged quantiles/native tick and nonfinite body', () => {
  const off = validRecord();
  validateRecord(off, off.descriptor, hash);
  const on = structuredClone(off);
  on.descriptor = descriptors()[1];
  on.timingSampleCount = 600;
  for (const c of REFERENCE_PROTOCOL.channels) {
    on.raw[c] = Array(600).fill(1);
    on.distributions[c] = distribution(on.raw[c]);
  }
  validateRecord(on, on.descriptor, hash);
  const lost = structuredClone(on);
  lost.raw.tickMs.pop();
  assert.throws(() => validateRecord(lost, lost.descriptor, hash));
  const forged = structuredClone(on);
  forged.distributions.tickMs.p95 = 0;
  assert.throws(() => validateRecord(forged, forged.descriptor, hash));
  const native = structuredClone(off);
  native.nativeStepSerial = 779;
  assert.throws(() => validateRecord(native, native.descriptor, hash));
  const bad = structuredClone(off);
  bad.checkpoints[0].bodies[0].velocityMps.x = NaN;
  assert.throws(() => validateRecord(bad, bad.descriptor, hash));
});
test('record reader rejects incomplete/cleanup loss and sample at old end boundary', () => {
  const good = validRecord();
  const missing = structuredClone(good);
  missing.status = 'FAIL';
  assert.throws(() => validateRecord(missing, missing.descriptor, hash));
  const cleanup = structuredClone(good);
  cleanup.cleanup.attempts.pop();
  assert.throws(() => validateRecord(cleanup, cleanup.descriptor, hash));
  const boundary = structuredClone(good);
  boundary.segmentRecords[0].samples = [{ tick: 2 }];
  assert.throws(() => validateRecord(boundary, boundary.descriptor, hash));
});
test('source chronology rejects missing/forged timing and archive path escapes', () => {
  const manifest = {
    protocol: REFERENCE_PROTOCOL,
    sourceHash: hash,
    commit: 'base',
    startedAt: '2026-10-07T01:00:00.000Z',
    archivedAt: '2026-10-07T01:00:01.000Z',
    native: { sha256: hash },
  };
  const started = {
    protocol: REFERENCE_PROTOCOL,
    commit: 'base',
    startedAt: manifest.startedAt,
    phase: 'CHRONOLOGICAL_BEFORE_PRODUCT_ABSENT',
  };
  const first = { sourceHash: hash, firstWorldAt: '2026-10-07T01:00:02.000Z', nativeSha256: hash };
  const complete = {
    protocol: REFERENCE_PROTOCOL,
    status: 'PASS',
    worlds: 24,
    sourceHash: hash,
    startedAt: manifest.startedAt,
    archivedAt: manifest.archivedAt,
    firstWorldAt: first.firstWorldAt,
    completedAt: '2026-10-07T01:00:04.000Z',
  };
  verifyChronology(manifest, started, first, complete, [
    { worldStartedAt: '2026-10-07T01:00:02.000Z', completedAt: '2026-10-07T01:00:03.000Z' },
  ]);
  assert.throws(() =>
    verifyChronology(
      { ...manifest, archivedAt: '2026-10-07T01:00:05.000Z' },
      started,
      first,
      complete,
      [],
    ),
  );
  assert.throws(() => verifyChronology(manifest, started, first, { ...complete, worlds: 20 }, []));
  assert.throws(() => verifyChronology(manifest, started, first, complete, [
    { worldStartedAt: '2026-10-07T01:00:00.500Z', completedAt: '2026-10-07T01:00:03.000Z' },
  ]));
  assert.throws(() => verifyChronology(manifest, started, first, complete, [
    { worldStartedAt: '2026-10-07T01:00:02.000Z', completedAt: '2026-10-07T01:00:03.000Z' },
    { worldStartedAt: '2026-10-07T01:00:02.500Z', completedAt: '2026-10-07T01:00:03.500Z' },
  ]));
  assert.throws(() => boundedPath(process.cwd(), '../escape'));
  assert.throws(() => boundedPath(process.cwd(), 'F:/foreign'));
});
import {
  referencePreparseBytes,
  boundedFixtureRecord,
  referenceSchemaStress,
} from './manual-segments-reference.ts';
const context = { schemaVersion: 1, units: 'SI', sessionId: 'schema-unit', worldEpoch: 0 };
function schemaRecord() {
  const samples = Array.from({ length: 32 }, (_, i) => ({
    tick: i + 1,
    state: {
      ...context,
      vehicleId: 'car',
      classId: 'sedan',
      tick: i + 1,
      transform: {
        positionM: { x: 0, y: 0, z: 0 },
        rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
      },
      velocityMps: { x: 0, y: 0, z: 0 },
      laneId: null,
      controlMode: 'MANUAL',
      appliedProfileVersion: 'base',
      maneuverState: 'IDLE',
    },
    command: {
      ...context,
      vehicleId: 'car',
      tick: i + 1,
      source: 'PLAYER',
      throttle: 0,
      brake: 0,
      steering: 0,
      handbrake: false,
      turnSignal: 'OFF',
    },
    rawInput: { throttle: 0, brake: 0, steering: 0, handbrake: false },
    longitudinalAccelerationMps2: 0,
    lateralAccelerationMps2: 0,
    capabilities: { maxAccelerationMps2: 5, maxDecelerationMps2: 8, maxLateralAccelerationMps2: 9 },
    context: {
      roadType: 'URBAN',
      speedLimitMps: 10,
      curvaturePerM: 0,
      leaderId: null,
      leaderGapM: null,
      signalId: null,
      signalState: null,
      stopLineId: null,
      distanceToStopLineM: null,
      conflictEntityIds: [],
      rideId: null,
    },
    excludedReason: null,
  }));
  return {
    ...context,
    segmentId: 'schema-unit-record',
    vehicleId: 'car',
    controlMode: 'MANUAL',
    learningEligible: false,
    playerId: 'player',
    profileId: 'profile',
    baseVersionId: 'base',
    learningEpoch: 0,
    controlPreferencesVersion: 'prefs',
    startTick: 1,
    endTick: 33,
    closeReason: 'MODE_CHANGE',
    engineVersion: 'engine',
    mapVersion: 'map',
    inputType: 'KEYBOARD',
    samples,
    events: [],
    completeness: 'CLOSED',
  };
}
test('preparse counts escaped Unicode and delimiters exactly without invoking getters', () => {
  for (const value of [{ s: '"\\\n😀\ud800' }, [1, -0, true, null, 'ă']])
    assert.equal(referencePreparseBytes(value), Buffer.byteLength(JSON.stringify(value)));
  let calls = 0;
  const getter = {};
  Object.defineProperty(getter, 'samples', {
    enumerable: true,
    get() {
      calls++;
      return [];
    },
  });
  assert.throws(() => referencePreparseBytes(getter));
  assert.equal(calls, 0);
  assert.throws(() => referencePreparseBytes({ x: Infinity }));
  assert.throws(() => referencePreparseBytes({ x: Symbol() }));
});
test('preparse rejects depth/cardinality/prototype/sparse data before record parser', () => {
  let deep = {};
  for (let i = 0; i < 18; i++) deep = { deep };
  assert.throws(() => referencePreparseBytes(deep));
  assert.throws(() => referencePreparseBytes({ samples: Array(33).fill(null) }));
  assert.throws(() => referencePreparseBytes({ events: Array(9).fill(null) }));
  assert.throws(() => referencePreparseBytes({ conflictEntityIds: Array(9).fill('x') }));
  assert.throws(() => referencePreparseBytes({ x: new Date() }));
  assert.throws(() => referencePreparseBytes(new Array(2)));
});
test('synthetic32sample8event shape fills exact64KiB and over-byte input remains unchanged', () => {
  const admitted = boundedFixtureRecord(schemaRecord());
  assert.equal(admitted.record.samples.length, 32);
  const stress = referenceSchemaStress(admitted.record);
  assert.equal(stress.bytes, 65536);
  assert.equal(stress.record.events.length, 8);
  assert.equal(Buffer.byteLength(JSON.stringify(stress.record)), 65536);
  const over = structuredClone(stress.record);
  let changed = false;
  for (const s of over.samples)
    for (let i = 0; i < s.context.conflictEntityIds.length && !changed; i++)
      if (s.context.conflictEntityIds[i].length < 256) {
        s.context.conflictEntityIds[i] += 'x';
        changed = true;
      }
  const snapshot = structuredClone(over);
  assert.equal(Buffer.byteLength(JSON.stringify(over)), 65537);
  assert.throws(() => boundedFixtureRecord(over), /byte capacity/);
  assert.deepEqual(over, snapshot);
});

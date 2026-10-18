// SOURCE-only AFTER records: real production069 and original chronological parity; no world acquisition.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { parseInterventionSegment } from '../src/telemetry/index.ts';
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const REFERENCE_PROTOCOL = Object.freeze({
  version: '069-original-protocol-after-v1',
  warmupTicks: 180,
  measuredTicks: 600,
  hz: 60,
  pairs: 5,
  populations: [70, 110],
  fleetWorlds: 20,
  semanticWorlds: 4,
  channels: ['tickMs', 'authorityMs', 'boundaryMs', 'deliveryMs', 'rapierMs'],
  sampleCount: 600,
  normalTickP95Ms: 5.5,
  normalRapierP95Ms: 3,
  recordByteCap: 65536,
  recordSampleCap: 32,
  recordEventCap: 8,
});
export function descriptors() {
  const rows = [];
  for (const count of REFERENCE_PROTOCOL.populations)
    for (let pair = 0; pair < 5; pair++)
      for (const observer of pair % 2 === 0 ? [false, true] : [true, false])
        rows.push({
          ordinal: rows.length,
          count,
          pair,
          observer,
          classId: null,
          fixedMode: null,
          kind: 'FLEET',
        });
  for (const classId of ['sedan', 'compact'])
    for (const fixedMode of ['MANUAL', 'LEARNING'])
      rows.push({
        ordinal: rows.length,
        count: 2,
        pair: 0,
        observer: true,
        classId,
        fixedMode,
        kind: 'SEMANTIC',
      });
  return rows;
}
export async function immutableJson(path, value, cap = 4 * 1024 * 1024) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  assert(bytes.length <= cap, 'Bounded immutable JSON');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes, { flag: 'wx' });
  return { bytes: bytes.length, sha256: sha256(bytes) };
}
export function nearestRank(values, p) {
  assert(
    values.length > 0 && values.every((v) => Number.isFinite(v) && v >= 0),
    'Finite timing channel',
  );
  return [...values].sort((a, b) => a - b)[Math.ceil(p * values.length) - 1];
}
export function distribution(values) {
  return {
    count: values.length,
    p50: nearestRank(values, 0.5),
    p95: nearestRank(values, 0.95),
    p99: nearestRank(values, 0.99),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}
export function validateMemory(memory) {
  const keys = ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers'];
  assert(memory && typeof memory === 'object');
  assert.deepEqual(Reflect.ownKeys(memory).sort(), keys.sort());
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(memory, key);
    assert(d && 'value' in d);
    assert(
      typeof d.value === 'number' && Number.isFinite(d.value) && d.value >= 0,
      'Actual numeric memory field ' + key,
    );
  }
  assert(memory.heapUsed <= memory.heapTotal, 'Used heap cannot exceed total');
  return memory;
}
export function validateMemoryEndpoints(record) {
  for (const phase of ['beforeWarmup', 'afterWarmup', 'afterMeasured'])
    validateMemory(record.heap?.[phase]);
}
export function validateSuccessfulDiagnostics(record, field = 'status', expected = 'PASS') {
  const status = Object.getOwnPropertyDescriptor(record, field);
  assert(status && 'value' in status && status.value === expected);
  for (const key of ['primary', 'terminalErrors']) {
    const d = Object.getOwnPropertyDescriptor(record, key);
    assert(d && 'value' in d && d.value === null, 'Successful record requires own null ' + key);
  }
  for (const key of [
    'failureDiagnostics',
    'failureRetirement',
    'retirementFailure',
    'failure',
    'failureState',
  ])
    assert(!Object.hasOwn(record, key), 'Failure diagnostics cannot be successful');
}
export function validateRecord(record, descriptor, sourceHash) {
  assert.deepEqual(record.descriptor, descriptor);
  validateSemanticBudgets(record);
  assert.equal(record.sourceHash, sourceHash);
  validateSuccessfulDiagnostics(record);
  validateMemoryEndpoints(record);
  assert.equal(record.attemptedTick, 780);
  assert.equal(record.acceptedTick, 780);
  assert.equal(record.timingSampleCount, descriptor.observer ? 600 : 0);
  assert.equal(record.nativeStepSerial, 780);
  assert.equal(record.finiteBodyTickChecks, 780 * descriptor.count);
  for (const field of ['nativeInputDigest', 'packetDigest', 'physicalDigest', 'rawInputDigest'])
    assert.match(record[field], /^[a-f0-9]{64}$/);
  assert.equal(record.checkpoints.length, 13);
  for (let i = 0; i < 13; i++) {
    const cp = record.checkpoints[i];
    assert.equal(cp.tick, (i + 1) * 60);
    assert.equal(cp.nativeStepSerial, cp.tick);
    assert.equal(cp.bodies.length, descriptor.count);
    for (const body of cp.bodies) {
      assert.equal(typeof body.identity.entityId, 'string');
      assert(Number.isSafeInteger(body.identity.generation) && body.identity.generation > 0);
      for (const value of [
        ...Object.values(body.transform.positionM),
        ...Object.values(body.transform.rotationQuaternion),
        ...Object.values(body.velocityMps),
      ])
        assert(Number.isFinite(value));
    }
  }
  assert.equal(record.drivingHostMutations, 0);
  assert.equal(record.cleanup.errors.length, 0);
  assert.deepEqual(record.cleanup.snapshots.body, { entities: 0, subscriptions: 0 });
  assert.equal(record.cleanup.snapshots.collision.vehicles, 0);
  assert.equal(record.cleanup.snapshots.collision.obstacles, 0);
  assert.equal(record.cleanup.snapshots.collision.colliders, 0);
  assert.equal(new Set(record.cleanup.attempts).size, record.cleanup.attempts.length);
  assert.deepEqual(record.cleanup.attempts, [...record.acquiredOwners].reverse());
  for (const name of [
    'controller',
    'authority',
    'mode',
    'keyboard',
    'segment',
    'selection',
    'bus',
    'intake',
    'bridge',
  ])
    assert.equal(record.cleanup.snapshots[name].disposed, true);
  assert.equal(record.cleanup.snapshots.segment.records, 0);
  assert.equal(record.cleanup.snapshots.bus.retainedEvents, 0);
  assert.equal(record.cleanup.snapshots.cameraTarget, null);
  assert.equal(record.cleanup.disposedReadRejected, true);
  for (const channel of REFERENCE_PROTOCOL.channels) {
    if (!descriptor.observer) {
      assert.equal(record.raw[channel], null);
      assert.equal(record.distributions[channel], null);
    } else {
      assert.equal(record.raw[channel].length, 600);
      assert.deepEqual(record.distributions[channel], distribution(record.raw[channel]));
    }
  }
  if (descriptor.observer && descriptor.count === 70) {
    assert(record.distributions.tickMs.p95 <= 5.5, 'Normal tick absolute gate');
    assert(record.distributions.rapierMs.p95 <= 3, 'Normal Rapier absolute gate');
  }
  assert(record.liveRecords.archivedUtf8Bytes <= 32 * 1024 * 1024);
  assert(record.liveRecords.intake.entries + record.liveRecords.intake.acknowledgedReceipts <= 64);
  assert(record.liveRecords.intake.serializedMetadataBytes <= 256 * 1024);
  assert(record.liveRecords.intake.referencedPayloadBytes <= 16 * 1024 * 1024);
  assert.equal(record.cleanup.snapshots.intake.entries, 0);
  assert.equal(record.cleanup.snapshots.intake.pending, 0);
  assert.equal(record.cleanup.snapshots.intake.acknowledgedReceipts, 0);
  assert.equal(record.cleanup.snapshots.intake.referencedPayloadBytes, 0);
  assert.equal(record.cleanup.snapshots.bridge.fault, null);
  assert.equal(record.lifecycle.length, 20);
  for (let i = 0; i < 20; i++) {
    const cycle = record.lifecycle[i];
    assert.equal(cycle.cycle, i);
    assert.equal(cycle.scope, 'ACTUAL_AUTO_EMPTY_OWNER_NO_EXTRA_NATIVE_STEP');
    assert.equal(cycle.nativeSerialBefore, 780);
    assert.equal(cycle.nativeSerialAfter, 780);
    assert.equal(cycle.beforeHash, cycle.afterHash);
    assert.equal(cycle.cleanup.errors.length, 0);
    assert.deepEqual(cycle.cleanup.attempts, [
      'bridge',
      'intake',
      'events',
      'store',
      'authority',
      'controller',
    ]);
    for (const name of cycle.cleanup.attempts)
      assert.equal(cycle.cleanup.snapshots[name].disposed, true);
    assert.equal(cycle.cleanup.snapshots.store.records, 0);
    assert.equal(cycle.cleanup.snapshots.events.retainedEvents, 0);
    assert.equal(cycle.cleanup.snapshots.intake.entries, 0);
  }
  assert(record.liveRecords.retainedRecords <= 64);
  assert(record.segmentRecords.length >= 1 && record.segmentRecords.length <= 64);
  for (const entry of record.segmentRecords) {
    assert(entry.samples.length <= 32 && entry.events.length <= 8);
    assert(Buffer.byteLength(JSON.stringify(entry)) <= 65536);
    assert.equal(
      entry.learningEligible,
      entry.controlMode === 'LEARNING',
      'Actual069 OPEN freezes eligibility; reference remains ineligible',
    );
    assert.equal(entry.completeness, 'CLOSED');
    assert(
      entry.samples.every((s) => s.tick >= entry.startTick && s.tick < entry.endTick),
      'Reference boundary t belongs new segment',
    );
  }
}
export function validateSemanticBudgets(record) {
  if (record.descriptor.kind !== 'SEMANTIC') return;
  const terminal = record.terminalBoundary,
    actual = terminal?.record;
  assert(terminal && actual);
  assert.deepEqual(parseInterventionSegment(actual), actual, 'Legal actual terminal005 record');
  assert.equal(terminal.stage, 'SHUTDOWN_AT_LAST_ACCEPTED_TICK');
  assert.equal(terminal.cause.reason, 'SHUTDOWN');
  assert.equal(terminal.cause.timing, 'AT_LAST_ACCEPTED_TICK');
  assert.equal(terminal.cause.tick, 780);
  assert.equal(actual.endTick, 780);
  assert.equal(actual.closeReason, 'SHUTDOWN');
  assert.equal(actual.completeness, 'CLOSED');
  assert.equal(terminal.nativeSerialBefore, 780);
  assert.equal(terminal.nativeSerialAfter, 780);
  assert.equal(terminal.before.acceptedTick, 780);
  assert.equal(terminal.after.acceptedTick, 780);
  assert.equal(terminal.before.active.segmentId, actual.segmentId);
  assert.equal(terminal.closed.segmentId, actual.segmentId);
  assert.equal(terminal.after.lastClosed.segmentId, actual.segmentId);
  assert.equal(terminal.after.active, null);
  assert.equal(terminal.after.retired, true);
  assert.equal(terminal.cause.identity.entityId, actual.vehicleId);
  assert.deepEqual(
    terminal.cause.identity,
    record.checkpoints.at(-1).bodies.find((body) => body.identity.entityId === actual.vehicleId)
      .identity,
    'Terminal native generation must match final actual checkpoint',
  );
  for (const key of ['schemaVersion', 'units', 'sessionId', 'worldEpoch'])
    assert.equal(actual[key], terminal.cause[key]);
  assert.deepEqual(
    record.segmentRecords.find((r) => r.segmentId === actual.segmentId),
    actual,
    'Actual captured terminal record must be in retained records',
  );
  assert.equal(actual.samples.length, 32);
  assert.equal(actual.events.length, 0);
  assert.equal(record.maximumRecord.segmentId, actual.segmentId);
  assert.equal(record.maximumRecord.samples, actual.samples.length);
  assert.equal(record.maximumRecord.events, actual.events.length);
  assert.equal(record.maximumRecord.bytes, Buffer.byteLength(JSON.stringify(actual)));
  assert.equal(record.maximumRecord.nativeLifecycleBoundaryMs, record.nativeBoundaryTotalMs);
  assert.equal(terminal.boundaryMs, record.nativeBoundaryTotalMs);

  assert.equal(record.maximumRecord.samples, 32);
  assert(record.maximumRecord.bytes <= 65536);
  assert.equal(
    record.maximumRecord.scope,
    'ACTUAL_PRODUCTION_LIFECYCLE_NATIVE_SAMPLES_TERMINAL_BOUNDARY',
  );
  const native = record.maximumRecord.nativeLifecycleBoundaryMs;
  assert(
    Number.isFinite(native) && native >= 0 && native <= 5.5,
    'Actual native32sample lifecycle boundary budget',
  );
  const stress = record.schemaStress;
  assert.deepEqual(
    parseInterventionSegment(stress.record),
    stress.record,
    'Legal full supported service005 record',
  );
  assert.equal(stress.bytes, 65536);
  assert.equal(Buffer.byteLength(JSON.stringify(stress.record)), stress.bytes);
  assert.equal(stress.record.samples.length, 32);
  assert.equal(stress.record.events.length, 8);
  assert.equal(stress.timings.length, 5);
  for (const t of stress.timings) {
    assert.deepEqual(
      Object.keys(t).sort(),
      [
        'admissionMs',
        'reserveMs',
        'commitMs',
        'readbackMs',
        'eventMs',
        'intakeMs',
        'totalMs',
      ].sort(),
    );
    assert(Object.values(t).every((v) => Number.isFinite(v) && v >= 0));
    assert.equal(
      t.totalMs,
      t.admissionMs + t.reserveMs + t.commitMs + t.readbackMs + t.eventMs + t.intakeMs,
    );
    assert(t.totalMs <= 5.5, 'Actual service schema boundary budget');
  }
  assert.equal(
    stress.ownerGuardIntakeCoverage,
    'UNVALIDATED_NO_ACTIVE_RECORD_EVENT_IMPORT_API',
    'Services are not whole-owner maximum proof',
  );
}
export async function verifyInventory(folder, sourceHash) {
  const expected = descriptors(),
    files = await readdir(resolve(folder, 'worlds'));
  assert.deepEqual(
    files.sort(),
    expected
      .flatMap((v) => [
        'world-' + v.ordinal + '.started.json',
        'world-' + v.ordinal + '.complete.json',
      ])
      .sort(),
    'Exact world inventory',
  );
  const records = [];
  for (const d of expected) {
    const started = JSON.parse(
      await readFile(resolve(folder, 'worlds/world-' + d.ordinal + '.started.json')),
    );
    const record = JSON.parse(
      await readFile(resolve(folder, 'worlds/world-' + d.ordinal + '.complete.json')),
    );
    assert.deepEqual(started.descriptor, d);
    assert.equal(started.sourceHash, sourceHash);
    assert(Date.parse(started.startedAt) <= Date.parse(record.completedAt));
    validateRecord(record, d, sourceHash);
    records.push({ ...record, worldStartedAt: started.startedAt });
  }
  for (const count of [70, 110])
    for (let pair = 0; pair < 5; pair++) {
      const arms = records.filter(
        (v) => v.descriptor.count === count && v.descriptor.pair === pair,
      );
      assert.equal(arms.length, 2);
      for (const field of ['nativeInputDigest', 'packetDigest', 'physicalDigest', 'rawInputDigest'])
        assert.equal(arms[0][field], arms[1][field], 'OFF/ON ' + field);
      assert.deepEqual(arms[0].checkpoints, arms[1].checkpoints, 'OFF/ON exact native states');
    }
  return records;
}

export function compareOriginal(before, after) {
  assert.equal(before.length, 24);
  assert.equal(after.length, 24);
  for (const row of [...before, ...after]) validateMemoryEndpoints(row);
  for (let i = 0; i < 24; i++) {
    const a = after[i],
      b = before[i];
    assert.deepEqual(a.descriptor, b.descriptor);
    for (const field of ['nativeInputDigest', 'packetDigest', 'physicalDigest', 'rawInputDigest'])
      assert.equal(a[field], b[field], 'Original BEFORE exact ' + field);
    assert.deepEqual(a.checkpoints, b.checkpoints, 'Original13 checkpoints all native bodies');
    assert.deepEqual(
      a.boundaryTrace.map(({ tick, mode, reason, completeness }) => ({
        tick,
        mode,
        reason,
        completeness,
      })),
      b.boundaryTrace.map(({ tick, mode, reason, completeness }) => ({
        tick,
        mode,
        reason,
        completeness,
      })),
      'Original physical mode/trip/selection closure choreography',
    );
  }
  const rows = [];
  for (const count of [70, 110]) {
    for (const channel of ['tickMs', 'authorityMs', 'rapierMs']) {
      const pairs = [];
      for (let pair = 0; pair < 5; pair++) {
        const pick = (list) =>
          list.find(
            (r) =>
              r.descriptor.count === count && r.descriptor.pair === pair && r.descriptor.observer,
          );
        const b = pick(before).distributions[channel].p95,
          a = pick(after).distributions[channel].p95;
        pairs.push({
          pair,
          before: b,
          after: a,
          deltaMs: a - b,
          ratio: a / b,
          failed: a > 1.1 * b && a - b > 1,
        });
      }
      rows.push({
        count,
        channel,
        pairs,
        failedPairs: pairs.filter((p) => p.failed).length,
        verdict: pairs.filter((p) => p.failed).length >= 3 ? 'FAIL' : 'PASS',
      });
    }
    for (const observer of [false, true]) {
      const pairs = [];
      for (let pair = 0; pair < 5; pair++) {
        const pick = (list) =>
          list.find(
            (r) =>
              r.descriptor.count === count &&
              r.descriptor.pair === pair &&
              r.descriptor.observer === observer,
          );
        const b = pick(before).heap.afterMeasured.heapUsed,
          a = pick(after).heap.afterMeasured.heapUsed;
        pairs.push({
          pair,
          before: b,
          after: a,
          deltaBytes: a - b,
          ratio: a / b,
          failed: a > 1.1 * b && a - b > 5 * 1024 * 1024,
        });
      }
      rows.push({
        count,
        channel: 'RAW_RUNTIME_JS_HEAP_USED',
        observer,
        pairs,
        failedPairs: pairs.filter((p) => p.failed).length,
        verdict: pairs.filter((p) => p.failed).length >= 3 ? 'FAIL' : 'PASS',
        scope:
          'matched process.memoryUsage immediately postwindow, not exact ownership/native/totalRAM; no forcedGC',
      });
    }
  }
  return {
    verdict: rows.some((r) => r.verdict === 'FAIL') ? 'FAIL' : 'PASS',
    rows,
    nonComparable: [
      'boundaryMs production owner/fence window differs from placeholder boundary',
      'deliveryMs actual guards+007+receipt vs old007-only',
      'actual32sample terminal boundary not original parse-only stage',
      'supportedSchema actual services total vs original synthetic arraypush total',
    ],
    scope:
      'Supplemental CPU/rawJSproxy only; no normalFrame/RAF/GPU/inputLatency/exactRAM acceptance',
  };
}

export const PINNED_BEFORE = Object.freeze({
  sourceHash: 'c88a6e1dba7b8c28adf2d17f371b26af0b3dd2d1ec9487cecf90515507c019af',
  manifestSha256: 'ac17794e0ccbaf7464e252139e9eeb5030233209eea69ed018e689e57eb17989',
  nativeSha256: '02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0',
  nativeBytes: 4340292,
});
export function validateBeforeBinding(beforeManifest, complete, beforeManifestSha, after) {
  assert(beforeManifest && complete, 'Missing original baseline');
  assert.equal(beforeManifestSha, PINNED_BEFORE.manifestSha256);
  assert.equal(beforeManifest.sourceHash, PINNED_BEFORE.sourceHash);
  assert.equal(complete.sourceHash, PINNED_BEFORE.sourceHash);
  assert.equal(complete.status, 'PASS');
  assert.equal(complete.worlds, 24);
  for (const native of [beforeManifest.native, after.native]) {
    assert.equal(native.sha256, PINNED_BEFORE.nativeSha256);
    assert.equal(native.bytes, PINNED_BEFORE.nativeBytes);
  }
  assert(
    Number.isFinite(Date.parse(complete.completedAt)) &&
      Number.isFinite(Date.parse(after.startedAt)),
  );
  assert(
    Date.parse(complete.completedAt) <= Date.parse(after.startedAt),
    'Original BEFORE must complete before AFTER starts',
  );
}

export function validateOriginalInventory(rows) {
  assert.equal(
    sha256(Buffer.from(JSON.stringify(rows))),
    '32ae4002c6bee94c3cab0771f7c6db829b85c0a85771da6d4c6c0534a499a86a',
    'Exact accepted BEFORE179-file inventory',
  );
  assert.equal(rows.length, 179);
}

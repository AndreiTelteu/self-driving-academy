import assert from 'node:assert/strict';
export const order = () => {
  const arms = [];
  for (let pair = 0; pair < 5; pair++)
    for (const treatment of pair % 2 ? ['CURRENT_068', 'HISTORICAL_REFERENCE'] : ['HISTORICAL_REFERENCE', 'CURRENT_068'])
      for (const observer of pair % 2 ? [true, false] : [false, true]) arms.push({ pair, treatment, observer, ordinal: arms.length });
  return arms;
};
const finite = (value) => { assert.ok(typeof value === 'number' && Number.isFinite(value)); return value; };
export function decode64(value, count = null) {
  assert.deepEqual(Object.keys(value).sort(), ['bytes', 'count', 'data', 'encoding']);
  assert.equal(value.encoding, 'float64-le-base64');
  assert.ok(Number.isInteger(value.count) && value.count >= 0 && value.count <= 32768);
  if (count !== null) assert.equal(value.count, count);
  assert.equal(value.bytes, value.count * 8);
  const bytes = Buffer.from(value.data, 'base64');
  assert.equal(bytes.toString('base64'), value.data); assert.equal(bytes.length, value.bytes);
  return Array.from({ length: value.count }, (_, index) => finite(bytes.readDoubleLE(index * 8)));
}
export function quantiles(values) {
  assert.ok(values.length && values.every((v) => Number.isFinite(v) && v >= 0));
  const sorted = [...values].sort((a, b) => a - b);
  return { count: values.length, p50: sorted[Math.floor((sorted.length - 1) * .5)], p95: sorted[Math.floor((sorted.length - 1) * .95)], p99: sorted[Math.floor((sorted.length - 1) * .99)] };
}
/** Arithmetic-rounding bound, not a physical/gate tolerance. Each rawinterval is a measured
 * binary64 timestamp subtraction; summation error is bounded by gamma_n*sumabs. */
export function elapsedMatches(raw, elapsed) {
  const sum = raw.reduce((a, b) => a + b, 0), n = raw.length + 2;
  const roundingBound = n * Number.EPSILON / (1 - n * Number.EPSILON) * (Math.abs(sum) + Math.abs(elapsed));
  assert.ok(Math.abs(sum - elapsed) <= roundingBound, `Actual RAF elapsed mismatch:${sum}:${elapsed}:${roundingBound}`);
}
export function assertDistributions(actual, expected) { assert.deepEqual(actual, expected, 'Raw-derived distributions cannot be forged'); }
export function tupleUnchanged(proof) {
  assert.equal(proof.tupleVersion, '068-all70-body-tuple-v1');
  assert.deepEqual(proof.fields, ['position.x', 'position.y', 'position.z', 'rotation.x', 'rotation.y', 'rotation.z', 'rotation.w', 'velocity.x', 'velocity.y', 'velocity.z']);
  const before = decode64(proof.before, 700), changes = decode64(proof.after.changedValues);
  assert.equal(proof.after.copyBefore, true);
  assert.equal(changes.length, proof.after.changedIndices.length);
  assert.ok(proof.after.changedIndices.every((value, index, all) => Number.isInteger(value) && value >= 0 && value < 700 && (!index || value > all[index - 1])));
  const after = [...before]; proof.after.changedIndices.forEach((position, index) => { after[position] = changes[index]; });
  before.forEach((value, index) => assert.ok(Object.is(value, after[index]), 'Exact all70 native state changed'));
  return before;
}
function cleanup(record) {
  const c = record.cleanup, s = c.snapshots;
  assert.deepEqual(c.errors, []); assert.equal(c.resourceCap, 192); assert.equal(c.readerCap, 192);
  const expected = ['world', 'controller', 'keyboard', 'authority', 'mode', 'segment', 'camera', 'registry', 'picker', 'loop'];
  if (record.arm.treatment === 'CURRENT_068') expected.push('selection');
  if (record.longTasks !== null) expected.push('longtasks');
  for (let i = 0; i < 70; i++) expected.push('mesh-' + i, 'material-' + i);
  assert.deepEqual([...c.attempts].sort(), expected.sort());
  assert.equal(s.body.entities, 0); assert.equal(s.body.subscriptions, 0); assert.equal(s.collision.colliders, 0);
  for (const key of ['vehicles', 'players', 'targets', 'projections']) assert.equal(s.controller[key], 0);
  assert.equal(s.controller.disposed, true); assert.equal(s.authority.vehicles, 0); assert.equal(s.authority.players, 0);
  assert.equal(s.keyboard.heldKeys, 0); assert.equal(s.keyboard.pendingPreferences, false); assert.equal(s.keyboard.disposed, true);
  assert.equal(s.mode.intents, 0); assert.equal(s.mode.inFlight, 0); assert.equal(s.mode.projection, null);
  assert.equal(s.segment.retainedSegments, 0); assert.equal(s.registry.bindings, 0); assert.equal(s.camera.disposed, true); assert.equal(s.camera.selected, null);
  if (record.arm.treatment === 'CURRENT_068') {
    for (const key of ['vehicles', 'pending', 'inFlight']) assert.equal(s.selection[key], 0);
    assert.equal(s.selection.projection, null); assert.equal(s.selection.disposed, true); assert.equal(s.selection.retainedHistory, 0);
  } else assert.equal(s.selection, undefined);
  for (let i = 0; i < 70; i++) { assert.equal(s['mesh-' + i].disposed, true); assert.equal(s['material-' + i].disposed, true); }
}
export function validateHeap(value, phase, tick) {
  assert.deepEqual(Object.keys(value).sort(), ['limitBytes', 'phase', 'precision', 'readEnded', 'readStarted', 'reason', 'support', 'tick', 'totalBytes', 'usedBytes']);
  assert.equal(value.phase, phase); assert.equal(value.tick, tick);
  assert.ok(finite(value.readStarted) >= 0 && finite(value.readEnded) >= value.readStarted);
  if (value.support === 'REPORTED') {
    assert.equal(value.precision, 'browser-reported-nonstandard-not-exact'); assert.equal(value.reason, null);
    assert.ok(finite(value.usedBytes) >= 0 && finite(value.totalBytes) >= value.usedBytes && finite(value.limitBytes) >= value.totalBytes);
  } else {
    assert.ok(value.support === 'UNAVAILABLE' || value.support === 'UNVALIDATED'); assert.equal(value.precision, 'unknown');
    for (const field of ['usedBytes', 'totalBytes', 'limitBytes']) assert.equal(value[field], null);
    if (value.support === 'UNAVAILABLE') assert.equal(value.reason, null);
    else assert.ok(typeof value.reason === 'string' && value.reason.length > 0 && value.reason.length <= 256);
  }
}
export function validateArm(record, expectedArm) {
  assert.deepEqual(record.arm, expectedArm); assert.equal(record.version, '068-selection-historical-steady-v1');
  assert.equal(record.disposition, 'PASS'); assert.deepEqual(record.causes, []);
  assert.deepEqual(record.context, { schemaVersion: 1, units: 'SI', sessionId: '068-historical-steady-01', worldEpoch: 1000 + expectedArm.pair * 2 + Number(expectedArm.observer) });
  assert.ok(Number.isInteger(record.tick) && record.tick >= 8820 && record.tick <= 9015);
  assert.ok(Number.isInteger(record.frames) && record.frames > 0 && record.frames <= 32768);
  assert.ok(Number.isInteger(record.measuredTicks) && record.measuredTicks > 0 && record.measuredTicks <= 7215);
  const elapsed = finite(record.measurementEnded) - finite(record.measurementStarted), warm = finite(record.warmEnded) - finite(record.warmStarted);
  assert.ok(elapsed >= 120000 && elapsed <= 120250 && warm >= 30000 && warm <= 30250);
  assert.equal(record.measurementStarted, record.warmEnded);
  assert.ok(Number.isInteger(record.warmTicks) && record.warmTicks > 0);
  assert.equal(record.warmSerial, record.warmTicks);
  assert.equal(record.measuredEndTick, record.tick); assert.equal(record.measuredEndSerial, record.tick);
  assert.equal(record.tick, record.warmTicks + record.measuredTicks);
  assert.ok(record.warmTicks / 60 / (warm / 1000) >= .98);
  assert.ok(record.measuredTicks / 60 / (elapsed / 1000) >= .98);
  assert.equal(record.clockState.tick, record.tick); assert.equal(record.clockState.status, 'running');
  assert.equal(record.clockState.overloadCount, 0); assert.equal(record.clockState.fault, null);
  assert.ok(record.clockState.debtSeconds >= 0 && record.clockState.debtSeconds < 1 / 60);
  const heapPhases = [['heapBeforeAllocation', 'beforeAllocation', 0], ['heapBeforeWarmup', 'beforeWarmup', 0], ['heapAfterWarmup', 'afterWarmup', record.warmTicks], ['liveHeap', 'liveHeap', record.tick], ['beforeDisposeHeap', 'beforeDispose', record.tick]];
  let lastHeapRead = 0;
  for (const [key, phase, tick] of heapPhases) {
    const value = record.heap[key]; validateHeap(value, phase, tick);
    assert.ok(value.readStarted >= lastHeapRead); lastHeapRead = value.readEnded;
  }
  assert.ok(record.heap.heapBeforeWarmup.readEnded <= record.warmStarted);
  assert.ok(record.heap.heapAfterWarmup.readStarted >= record.warmEnded && record.heap.heapAfterWarmup.readEnded <= record.measurementStarted + 250);
  for (const key of ['liveHeap', 'beforeDisposeHeap']) assert.ok(record.heap[key].readStarted >= record.measurementEnded && record.heap[key].readEnded <= record.measurementEnded + 250);
  assert.ok(Number.isInteger(record.warmFrames) && record.warmFrames > 0);
  assert.equal(record.initialNativeCounter, 0); assert.equal(record.nativeCounterSamples, record.warmFrames + record.frames);
  assert.ok(finite(record.maxWarmRafGapMs) > 0 && record.maxWarmRafGapMs <= 250);
  const nativeCounters = decode64(record.raw.nativeCounters, record.nativeCounterSamples);
  let previousCounter = record.initialNativeCounter;
  for (const value of nativeCounters) {
    assert.ok(Number.isInteger(value) && value >= previousCounter && value - previousCounter <= 4, 'Actual perRAF native catchup0..4');
    previousCounter = value;
  }
  assert.equal(nativeCounters[record.warmFrames - 1], record.warmTicks); assert.equal(previousCounter, record.measuredEndSerial);
  const frame = decode64(record.raw.frameMs, record.frames), work = decode64(record.raw.workMs, record.frames), tick = decode64(record.raw.tickMs, record.measuredTicks), rapier = decode64(record.raw.rapierMs, record.measuredTicks);
  assert.ok(frame.every((v) => v > 0)); elapsedMatches(frame, elapsed);
  assert.equal(Math.max(...frame), record.maxRafGapMs); assert.ok(record.maxRafGapMs <= 250);
  const metrics = { frame: quantiles(frame), work: quantiles(work), tick: quantiles(tick), rapier: quantiles(rapier) };
  assert.ok(metrics.frame.p50 > 0 && metrics.frame.p95 <= 18.5 && metrics.frame.p99 <= 25);
  assertDistributions(record.distributions, metrics);
  assert.ok(metrics.tick.p95 <= 5.5 && metrics.rapier.p95 <= 3);
  if (expectedArm.observer) {
    decode64(record.raw.uiMs, record.frames); decode64(record.raw.selectionMs, record.measuredTicks);
    assert.ok(metrics.work.p95 <= 10);
  } else { assert.equal(record.raw.uiMs, null); assert.equal(record.raw.selectionMs, null); }
  assert.equal(record.allocatedRawBytes, 3 * 32768 * 8 + 2 * 7215 * 8 + (expectedArm.observer ? (32768 + 7215) * 8 : 0));
  assert.equal(record.identities.length, 70);
  for (let i = 0; i < 70; i++) {
    assert.equal(record.identities[i].entityId, 'car-' + i); finite(record.identities[i].handle);
    assert.ok(Number.isInteger(record.identities[i].generation) && record.identities[i].generation > 0);
    assert.equal(record.kinds[i], i < 30 ? 'TAXI' : 'CIVIL'); assert.equal(record.profiles[i], i % 2 ? 'compact' : 'sedan');
  }
  assert.ok(record.maximumPlayers <= 1 && record.maximumPlayers >= 0);
  assert.equal(record.live.body.entities, 70); assert.equal(record.live.controller.vehicles, 70); assert.equal(record.live.authority.vehicles, 70); assert.equal(record.live.registry, 70);
  if (expectedArm.treatment === 'CURRENT_068') { assert.equal(record.live.selection.vehicles, 70); assert.equal(record.live.selection.pending, 0); assert.equal(record.live.selection.inFlight, 0); assert.equal(record.live.selection.retainedHistory, 0); }
  else assert.equal(record.live.selection, null);
  assert.equal(record.live.guard.nativeSteps, record.tick); assert.equal(record.live.guard.selectionStepAttempts, 0);
  assert.deepEqual(record.live.guard.setupCalls, Array(70).fill('addClassCar'));
  for (const value of Object.values(record.live.guard.drivingCalls)) assert.equal(value, 0);
  const expectedSelectionTicks = [], expectedModeTicks = [];
  for (let first = 1, cycle = 0; first <= record.tick; first += 60, cycle++) {
    if (cycle % 3) expectedModeTicks.push({ tick: first, mode: cycle % 3 === 1 ? 'MANUAL' : 'LEARNING' });
    for (const offset of [20, 40]) if (first + offset <= record.tick) expectedSelectionTicks.push(first + offset);
  }
  assert.deepEqual(record.selectionProofs.map((p) => p.tick), expectedSelectionTicks); assert.ok(record.selectionProofs.length <= 310);
  assert.deepEqual(record.modeProofs.map((p) => ({ tick: p.tick, mode: p.mode })), expectedModeTicks); assert.ok(record.modeProofs.length <= 160);
  for (const proof of record.selectionProofs) {
    assert.equal(proof.serial, proof.tick); assert.equal(proof.serialAfter, proof.serial);
    const index = (proof.tick - 1) % 60 === 20 ? 1 : 0;
    assert.equal(proof.selected, 'car-' + index); assert.equal(proof.cameraSelected, proof.selected);
    assert.deepEqual(proof.selectedIdentity, record.identities[index]); assert.deepEqual(proof.context, record.context);
    assert.equal(proof.selectionSource, 'FLEET'); assert.equal(proof.selectedKind, 'TAXI');
    assert.equal(proof.authority.tick, proof.tick); assert.equal(proof.authority.seat, null); assert.equal(proof.authority.players, 0);
    assert.equal(proof.assignmentBeforeRef, 'arm-assignment-v1'); assert.equal(proof.assignmentAfterRef, 'arm-assignment-v1');
    tupleUnchanged(proof.bodies);
    if (proof.oldSeat) {
      assert.deepEqual(proof.oldSeat.identity, record.identities[0]);
      assert.equal(proof.segmentBefore.segment.completeness, 'OPEN'); assert.equal(proof.segmentAfter.segment.completeness, 'CLOSED');
      assert.equal(proof.segmentAfter.segment.closeReason, 'VEHICLE_SWITCH'); assert.equal(proof.segmentAfter.segment.endTick, proof.tick);
      assert.deepEqual(proof.segmentAfter.identity, record.identities[0]);
      for (const key of ['sessionId', 'worldEpoch', 'schemaVersion', 'units']) assert.equal(proof.segmentAfter.segment[key], record.context[key]);
    }
  }
  for (const proof of record.modeProofs) {
    assert.equal(proof.serial, proof.tick); assert.equal(proof.serialAfter, proof.serial); assert.deepEqual(proof.identity, record.identities[0]);
    assert.equal(proof.segment.segment.completeness, 'OPEN'); assert.equal(proof.segment.segment.startTick, proof.tick); assert.equal(proof.segment.segment.controlMode, proof.mode);
    tupleUnchanged(proof.bodies);
  }
  assert.deepEqual(record.checkpoints.map((p) => p.tick), Array.from({ length: 29 }, (_, i) => (i + 1) * 300));
  for (const point of record.checkpoints) {
    assert.equal(point.serial, point.tick); decode64(point.bodies, 700); assert.equal(point.sampled.length, 3);
    for (const [position, index] of [0, 1, 69].entries()) {
      const sample = point.sampled[position]; assert.deepEqual(sample.identity, record.identities[index]);
      assert.deepEqual(sample.control.identity, sample.identity); assert.equal(sample.control.tick, point.tick);
      assert.equal(sample.nativeInput[0], sample.identity.entityId);
      assert.equal(sample.packets.length, 2);
      for (const [sourceIndex, source] of ['AUTONOMY', 'PLAYER'].entries()) {
        const packet = sample.packets[sourceIndex]; assert.deepEqual(packet.identity, sample.identity); assert.equal(packet.command.source, source); assert.equal(packet.command.tick, point.tick);
        assert.equal(packet.command.vehicleId, sample.identity.entityId);
        for (const key of ['sessionId', 'worldEpoch', 'schemaVersion', 'units']) assert.equal(packet.command[key], record.context[key]);
      }
      const command = sample.control.command, native = sample.nativeInput[1];
      assert.equal(native.throttle, command.brake || command.handbrake ? 0 : command.throttle);
      assert.equal(native.brake, command.brake); assert.equal(native.steering, command.steering); assert.equal(native.handbrake ?? false, command.handbrake);
      for (const field of ['throttle', 'brake', 'steering']) finite(native[field]);
    }
  }
  for (const [key, width] of [['packets', 70 * 2 * 8], ['effective', 70 * 8], ['native', 70 * 7], ['physical', 70 * 12]]) {
    assert.equal(record.checksums[key].algorithm, 'two-u32-float64-le-v1'); assert.equal(record.checksums[key].values, record.tick * width);
    for (const field of ['a', 'b']) assert.ok(Number.isInteger(record.checksums[key][field]) && record.checksums[key][field] >= 0 && record.checksums[key][field] <= 4294967295);
  }
  finite(record.maxSpeedMps); finite(record.maxDisplacementM); assert.ok(record.maxSpeedMps >= 0 && record.maxDisplacementM >= 0);
  if (record.longTasks !== null) { assert.ok(Array.isArray(record.longTasks) && record.longTasks.length <= 256); for (const task of record.longTasks) { assert.ok(finite(task.duration) <= 50 && task.duration >= 0); assert.ok(finite(task.startTime) >= record.measurementStarted && task.startTime <= record.measurementEnded); } }
  assert.equal(record.gpuTimer.value, null); assert.equal(record.gpuTimer.status, 'NOT_COLLECTED');
  cleanup(record);
  return metrics;
}
export function relativeViolation(reference, actual, absolute = 1) {
  finite(reference); finite(actual); finite(absolute);
  assert.ok(reference >= 0 && actual >= 0 && absolute >= 0);
  return actual > reference * 1.1 && actual - reference > absolute;
}
export function compareArms(records) {
  assert.equal(records.length, 20);
  const results = records.map((record, index) => validateArm(record, order()[index]));
  const violations = { frame: 0, work: 0, memory: 0, observerFrameReference: 0, observerFrameCurrent: 0, observerWorkReference: 0, observerWorkCurrent: 0 };
  let trackedMemoryPairs = 0;
  for (let pair = 0; pair < 5; pair++) {
    const at = (treatment, observer) => records.findIndex((r) => r.arm.pair === pair && r.arm.treatment === treatment && r.arm.observer === observer);
    const reference = at('HISTORICAL_REFERENCE', true), actual = at('CURRENT_068', true);
    assert.ok(reference >= 0 && actual >= 0);
    for (const key of ['frame', 'work']) if (relativeViolation(results[reference][key].p95, results[actual][key].p95)) violations[key]++;
    const rh = records[reference].heap.liveHeap, ah = records[actual].heap.liveHeap;
    if (rh?.support === 'REPORTED' && ah?.support === 'REPORTED') { trackedMemoryPairs++; if (finite(ah.usedBytes) > finite(rh.usedBytes) * 1.1 && ah.usedBytes - rh.usedBytes > 5 * 1024 * 1024) violations.memory++; }
    for (const treatment of ['HISTORICAL_REFERENCE', 'CURRENT_068']) {
      const on = at(treatment, true), off = at(treatment, false), suffix = treatment === 'CURRENT_068' ? 'Current' : 'Reference';
      for (const [key, prefix] of [['frame', 'observerFrame'], ['work', 'observerWork']]) if (relativeViolation(results[off][key].p95, results[on][key].p95)) violations[prefix + suffix]++;
      const r = records[at('HISTORICAL_REFERENCE', treatment === 'CURRENT_068')], a = records[at('CURRENT_068', treatment === 'CURRENT_068')];
      assert.deepEqual(a.identities, r.identities); assert.deepEqual(a.profiles, r.profiles); assert.deepEqual(a.kinds, r.kinds); assert.equal(a.assignmentText, r.assignmentText);
      assert.deepEqual(a.checkpoints, r.checkpoints, 'Exact all70 physical/sampled raw/effective/native/checksum parity at every300tick through8700');
    }
  }
  for (const [key, count] of Object.entries(violations)) assert.ok(count < 3, 'Confirmed relative gate:' + key + ':' + count);
  return { results, violations, trackedMemoryPairs, memoryDisposition: trackedMemoryPairs === 5 ? 'TRACKED_NONSTANDARD_HEAP_ONLY' : 'UNAVAILABLE_OR_PARTIAL_NOT_EXACT_HEAP_PASS' };
}

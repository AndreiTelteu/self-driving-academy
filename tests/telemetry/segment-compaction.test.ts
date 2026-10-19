import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createOpportunityRegistry,
  createSegmentCompaction,
  createTickSampleRecorder,
  type OpportunityRecord,
  type TickSampleFrame,
  type TickSampleSegmentInput,
} from '../../src/telemetry/index.ts';
import { parseVehicleCommand, parseVehicleState } from '../../src/vehicles/index.ts';

const context = {
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: 'compact-test',
  worldEpoch: 2,
};
function segment(segmentId: string, startTick = 0): TickSampleSegmentInput {
  return {
    segmentId,
    sessionId: context.sessionId,
    worldEpoch: context.worldEpoch,
    vehicleId: 'taxi',
    classId: 'sedan',
    controlMode: 'MANUAL',
    profileId: 'style',
    baseVersionId: 'v1',
    learningEpoch: 0,
    learningEligible: false,
    inputType: 'KEYBOARD',
    startTick,
  };
}
function frame(tick: number): TickSampleFrame {
  return {
    tick,
    state: parseVehicleState({
      ...context,
      vehicleId: 'taxi',
      classId: 'sedan',
      tick,
      transform: {
        positionM: { x: tick, y: 0, z: 0 },
        rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
      },
      velocityMps: { x: 0, y: 0, z: 5 },
      laneId: 'lane',
      controlMode: 'MANUAL',
      appliedProfileVersion: 'v1',
      maneuverState: 'IDLE',
    }),
    raw: { throttle: 0.5, brake: 0, steering: 0, handbrake: false },
    command: parseVehicleCommand({
      ...context,
      vehicleId: 'taxi',
      tick,
      throttle: 0.5,
      brake: 0,
      steering: 0,
      handbrake: false,
      turnSignal: 'OFF',
      source: 'PLAYER',
    }),
    physics: { longitudinalAccelerationMps2: 0, lateralAccelerationMps2: 0 },
    lane: { laneId: 'lane', speedLimitMps: 10 },
    signal: null,
  };
}
function closedRecorder(
  count: number,
  policy: 'DROP_OLDEST' | 'DROP_NEWEST' = 'DROP_OLDEST',
  capacity = 4096,
) {
  const recorder = createTickSampleRecorder({
    capacity,
    overflowPolicy: policy,
    retainedBytes: capacity * 114,
  });
  recorder.openSegment(segment('ride'));
  for (let tick = 0; tick < count; tick++) recorder.record(frame(tick));
  recorder.closeSegment('RIDE_COMPLETED');
  return recorder;
}
function compactAll(compactor: ReturnType<typeof createSegmentCompaction>) {
  for (;;) {
    const result = compactor.compactAvailable(32);
    if (result.done) break;
  }
}
function opportunity(registry = createOpportunityRegistry(), tick = 1): OpportunityRecord {
  const records = registry.observe({
    tick,
    sessionId: context.sessionId,
    worldEpoch: context.worldEpoch,
    segmentId: 'ride',
    learningEligible: false,
    vehicleId: 'taxi',
    incarnation: 'taxi-1',
    signal: null,
    events: [],
    conclusions: [],
    stimuli: [{ kind: 'YIELD', tick, sourceKey: `yield-${tick}`, relatedIds: ['other'] }],
  });
  assert.equal(records.length, 1);
  return records[0]!;
}

test('long segment rolls over in order, preserves each analysis tick and each real opportunity tick once', () => {
  const recorder = closedRecorder(1200);
  const compactor = createSegmentCompaction({ recorder, segmentId: 'ride' });
  const registry = createOpportunityRegistry();
  const events = [1, 87, 249, 511, 899].map((tick) => opportunity(registry, tick));
  for (const event of events) assert.equal(compactor.recordOpportunity(event), true);
  assert.equal(
    compactor.recordEvent({ id: 'stop-line-511', kind: 'STOP_LINE_CROSSED', tick: 511 }),
    true,
  );
  assert.equal(
    compactor.recordEvent({ id: 'reaction-512', kind: 'REACTION_STIMULUS', tick: 512 }),
    true,
  );
  compactAll(compactor);
  const resolved = registry.conclude({
    tick: 900,
    opportunityId: events[events.length - 1]!.id,
    outcome: 'YIELDED',
  });
  assert.equal(compactor.recordOpportunity(resolved), true);
  assert.equal(compactor.beginFinalize(), true);
  while (!compactor.finalizeStep(32).done) {
    /* bounded continuation */
  }
  const chunks = compactor.getChunks();
  assert.ok(chunks.length >= 3);
  assert.ok(chunks.every((chunk) => chunk.payloadBytes <= 4096));
  assert.deepEqual(
    chunks.map((chunk) => chunk.sequence),
    chunks.map((_, index) => index),
  );
  assert.equal(chunks[0]!.previousSequence, null);
  assert.equal(chunks.at(-1)!.nextSequence, null);
  for (let index = 1; index < chunks.length; index++)
    assert.equal(chunks[index]!.previousSequence, index - 1);
  const ticks = chunks.flatMap((chunk) => Array.from(chunk.samples.ticks));
  assert.deepEqual(
    ticks,
    Array.from({ length: 400 }, (_, index) => index * 3),
  );
  const retainedEvents = chunks.flatMap((chunk) => chunk.opportunities);
  assert.deepEqual(
    retainedEvents.map((event) => event.id).sort(),
    events.map((event) => event.id).sort(),
  );
  assert.deepEqual(
    retainedEvents.map((event) => event.openedTick).sort((a, b) => a - b),
    [1, 87, 249, 511, 899],
  );
  assert.equal(retainedEvents.find((event) => event.id === resolved.id)?.resolvedTick, 900);
  assert.equal(new Set(retainedEvents.map((event) => event.id)).size, events.length);
  const exactEvents = chunks.flatMap((chunk) => chunk.events);
  assert.deepEqual(exactEvents, [
    { id: 'stop-line-511', kind: 'STOP_LINE_CROSSED', tick: 511 },
    { id: 'reaction-512', kind: 'REACTION_STIMULUS', tick: 512 },
  ]);
  assert.equal(compactor.state, 'FINALIZED');
  recorder.dispose();
  registry.dispose();
});

test('DROP_OLDEST and DROP_NEWEST inputs are explicitly incomplete and never claim complete coverage', () => {
  for (const policy of ['DROP_OLDEST', 'DROP_NEWEST'] as const) {
    const recorder = closedRecorder(100, policy, 64);
    const compactor = createSegmentCompaction({ recorder, segmentId: 'ride' });
    compactAll(compactor);
    const result = compactor.beginFinalize();
    assert.equal(result, false);
    assert.equal(compactor.state, 'INCOMPLETE');
    assert.equal(compactor.getStats().reason, 'SOURCE_INCOMPLETE');
    const summary = recorder.getSegment('ride');
    assert.ok(summary);
    assert.equal(summary.overwrittenSamples + summary.rejectedSamples, 36);
    recorder.dispose();
  }
});

test('one-tick and two-tick segments reach a terminal state with their valid short chunk', () => {
  for (const count of [1, 2]) {
    const recorder = closedRecorder(count);
    const compactor = createSegmentCompaction({ recorder, segmentId: 'ride' });
    compactAll(compactor);
    assert.equal(compactor.beginFinalize(), true);
    while (!compactor.finalizeStep(32).done) {
      /* bounded continuation */
    }
    assert.equal(compactor.state, 'FINALIZED');
    assert.deepEqual(
      compactor.getChunks().flatMap((chunk) => Array.from(chunk.samples.ticks)),
      [0],
    );
    recorder.dispose();
  }
});

test('open recorder rows can be compacted incrementally and finalize only after source close', () => {
  const recorder = createTickSampleRecorder();
  recorder.openSegment(segment('ride'));
  const compactor = createSegmentCompaction({ recorder, segmentId: 'ride' });
  assert.deepEqual(compactor.compactAvailable(4), { processedItems: 0, sampled: 0, done: false });
  for (let tick = 0; tick < 6; tick++) recorder.record(frame(tick));
  assert.equal(compactor.compactAvailable(4).done, false);
  assert.equal(compactor.compactAvailable(4).processedItems, 2);
  assert.equal(compactor.beginFinalize(), false);
  recorder.closeSegment('RIDE_COMPLETED');
  assert.equal(compactor.compactAvailable(4).done, true);
  assert.equal(compactor.beginFinalize(), true);
  while (!compactor.finalizeStep().done) {
    /* bounded continuation */
  }
  assert.deepEqual(
    compactor.getChunks().flatMap((chunk) => Array.from(chunk.samples.ticks)),
    [0, 3],
  );
  recorder.dispose();
});

test('finalize work is bounded by the requested item count and completes through further steps', () => {
  const recorder = closedRecorder(900);
  const compactor = createSegmentCompaction({
    recorder,
    segmentId: 'ride',
    options: { finalizeItemsPerStep: 3 },
  });
  const registry = createOpportunityRegistry();
  for (let tick = 1; tick <= 8; tick++) compactor.recordOpportunity(opportunity(registry, tick));
  compactAll(compactor);
  assert.equal(compactor.beginFinalize(), true);
  let calls = 0;
  while (compactor.state === 'FINALIZING') {
    const result = compactor.finalizeStep();
    assert.ok(result.processedItems <= 3);
    calls++;
  }
  assert.equal(calls, 1);
  assert.equal(compactor.state, 'FINALIZED');
  recorder.dispose();
  registry.dispose();
});

test('transfer handle copies chunk storage; live 085 samples remain readable and transfer sequence is exactly once', () => {
  const recorder = closedRecorder(12);
  const compactor = createSegmentCompaction({ recorder, segmentId: 'ride' });
  compactAll(compactor);
  assert.equal(compactor.beginFinalize(), true);
  while (!compactor.finalizeStep().done) {
    /* bounded continuation */
  }
  const readCopy = compactor.getChunks()[0]!;
  structuredClone(readCopy, {
    transfer: Object.values(readCopy.samples).map((array) => array.buffer),
  });
  assert.equal(readCopy.samples.ticks.byteLength, 0);
  const handle = compactor.acquireTransfer(0);
  assert.ok(handle);
  assert.equal(handle.ownership, 'TRANSFER_COPY');
  assert.ok(handle.payloadBytes <= 16 * 1024 * 1024);
  const cloned = structuredClone(handle, {
    transfer: Object.values(handle.samples).map((array) => array.buffer),
  });
  assert.equal(Object.values(handle.samples)[0]!.byteLength, 0);
  assert.equal(cloned.samples.ticks[0], 0);
  assert.equal(recorder.readSample('ride', 0).observation.tick, 0);
  assert.equal(recorder.getStats().samplesRetained, 12);
  assert.equal(compactor.acquireTransfer(0), null);
  recorder.dispose();
});

test('dispose clears live counters and calls after dispose fail closed', () => {
  const recorder = closedRecorder(10);
  const compactor = createSegmentCompaction({ recorder, segmentId: 'ride' });
  compactAll(compactor);
  assert.equal(compactor.beginFinalize(), true);
  while (!compactor.finalizeStep().done) {
    /* bounded continuation */
  }
  compactor.dispose();
  assert.equal(compactor.getStats().retainedBytes, 0);
  assert.equal(compactor.getStats().samplesRetained, 0);
  assert.equal(compactor.recordOpportunity(opportunity()), false);
  assert.equal(compactor.recordEvent({ id: 'after-dispose', kind: 'FULL_STOP', tick: 3 }), false);
  assert.equal(compactor.acquireTransfer(0), null);
  recorder.dispose();
});

test('event id conflicts fail closed instead of silently replacing an earlier tick', () => {
  const recorder = closedRecorder(10);
  const compactor = createSegmentCompaction({ recorder, segmentId: 'ride' });
  assert.equal(compactor.recordEvent({ id: 'stop-1', kind: 'FULL_STOP', tick: 4 }), true);
  assert.equal(compactor.recordEvent({ id: 'stop-1', kind: 'FULL_STOP', tick: 5 }), false);
  assert.equal(compactor.state, 'INCOMPLETE');
  assert.equal(compactor.getStats().reason, 'INVALID_SOURCE');
  recorder.dispose();
});

test('late events after rollover are refused with a counter and LATE_FACT', () => {
  const recorder = closedRecorder(1200);
  const compactor = createSegmentCompaction({ recorder, segmentId: 'ride' });
  assert.equal(compactor.recordEvent({ id: 'early', kind: 'STOP_LINE_CROSSED', tick: 5 }), true);
  compactAll(compactor);
  assert.equal(compactor.getChunks().length, 6);
  assert.equal(compactor.recordEvent({ id: 'late', kind: 'FULL_STOP', tick: 4 }), false);
  assert.equal(compactor.getStats().eventsRejected, 1);
  assert.equal(compactor.getStats().reason, 'LATE_FACT');
  assert.equal(compactor.beginFinalize(), false);
  assert.equal(compactor.state, 'INCOMPLETE');
  assert.deepEqual(
    compactor.getChunks().flatMap((chunk) => chunk.events),
    [{ id: 'early', kind: 'STOP_LINE_CROSSED', tick: 5 }],
  );
  recorder.dispose();
});

test('new opportunity behind a sealed range is rejected without hanging finalization', () => {
  const recorder = closedRecorder(1200);
  const compactor = createSegmentCompaction({ recorder, segmentId: 'ride' });
  compactAll(compactor);
  const registry = createOpportunityRegistry();
  const late = opportunity(registry, 4);
  assert.equal(compactor.recordOpportunity(late), false);
  assert.equal(compactor.getStats().rejectedOpportunities, 1);
  assert.equal(compactor.getStats().reason, 'LATE_FACT');
  assert.equal(compactor.state, 'INCOMPLETE');
  assert.equal(compactor.beginFinalize(), false);
  recorder.dispose();
  registry.dispose();
});

test('finalize step seals the last chunk as one real bounded work item', () => {
  const recorder = closedRecorder(12);
  const compactor = createSegmentCompaction({ recorder, segmentId: 'ride' });
  compactAll(compactor);
  assert.equal(compactor.getChunks().length, 0);
  assert.equal(compactor.beginFinalize(), true);
  const step = compactor.finalizeStep(1);
  assert.equal(step.processedItems, 1);
  assert.equal(step.state, 'FINALIZED');
  assert.equal(step.done, true);
  assert.equal(compactor.getChunks().length, 1);
  recorder.dispose();
});

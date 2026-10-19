import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createTickSampleRecorder,
  deriveTickSamplePhysics,
  mechanicalCapabilities,
  TICK_SAMPLE_BYTES_PER_SAMPLE,
  TICK_SAMPLE_CAPACITY,
  type TickSampleFrame,
  type TickSampleSegmentInput,
} from '../../src/telemetry/index.ts';
import { parseVehicleCommand, parseVehicleState } from '../../src/vehicles/index.ts';
import type { ControlMode, VehicleClassId, VehicleCommand, VehicleState } from '../../src/vehicles';

const CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: 'academy-1',
  worldEpoch: 2,
});

function makeState(options: {
  tick: number;
  vehicleId?: string;
  classId?: string;
  controlMode?: ControlMode;
  baseVersionId?: string;
  laneId?: string | null;
  speedMps?: number;
  x?: number;
}): VehicleState {
  return parseVehicleState({
    ...CONTEXT,
    vehicleId: options.vehicleId ?? 'taxi-1',
    classId: options.classId ?? 'sedan',
    tick: options.tick,
    transform: {
      positionM: { x: options.x ?? 0, y: 0, z: 0 },
      rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
    },
    velocityMps: { x: 0, y: 0, z: options.speedMps ?? 5 },
    laneId: options.laneId === undefined ? 'lane-1' : options.laneId,
    controlMode: options.controlMode ?? 'MANUAL',
    appliedProfileVersion: options.baseVersionId ?? 'style-v1',
    maneuverState: 'IDLE',
  });
}

function makeCommand(options: {
  tick: number;
  vehicleId?: string;
  controlMode?: ControlMode;
  throttle?: number;
}): VehicleCommand {
  return parseVehicleCommand({
    ...CONTEXT,
    vehicleId: options.vehicleId ?? 'taxi-1',
    tick: options.tick,
    throttle: options.throttle ?? 0.5,
    brake: 0,
    steering: 0.25,
    handbrake: false,
    turnSignal: 'OFF',
    source: (options.controlMode ?? 'MANUAL') === 'AUTO' ? 'AUTONOMY' : 'PLAYER',
  });
}

function makeFrame(options: {
  tick: number;
  vehicleId?: string;
  classId?: string;
  controlMode?: ControlMode;
  baseVersionId?: string;
  laneId?: string | null;
  withLane?: boolean;
  withSignal?: boolean;
  speedMps?: number;
}): TickSampleFrame {
  const laneId = options.laneId === undefined ? 'lane-1' : options.laneId;
  const withLane = options.withLane ?? laneId !== null;
  const withSignal = options.withSignal ?? true;
  return {
    tick: options.tick,
    state: makeState({
      tick: options.tick,
      vehicleId: options.vehicleId,
      classId: options.classId,
      controlMode: options.controlMode,
      baseVersionId: options.baseVersionId,
      laneId,
      speedMps: options.speedMps,
      x: options.tick,
    }),
    raw: { throttle: 1, brake: 0, steering: 0.5, handbrake: false },
    command: makeCommand({
      tick: options.tick,
      vehicleId: options.vehicleId,
      controlMode: options.controlMode,
    }),
    physics: { longitudinalAccelerationMps2: 1.5, lateralAccelerationMps2: 0.25 },
    lane: withLane ? { laneId: laneId ?? 'lane-1', speedLimitMps: 13.9 } : null,
    signal: withSignal ? { signalId: 'signal-1', state: 'GREEN' } : null,
  };
}

function segmentInput(overrides: Partial<TickSampleSegmentInput> = {}): TickSampleSegmentInput {
  return {
    segmentId: 'seg-1',
    sessionId: 'academy-1',
    worldEpoch: 2,
    vehicleId: 'taxi-1',
    classId: 'sedan' as VehicleClassId,
    controlMode: 'MANUAL',
    profileId: 'style-1',
    baseVersionId: 'style-v1',
    learningEpoch: 3,
    learningEligible: false,
    inputType: 'KEYBOARD',
    startTick: 100,
    ...overrides,
  };
}

function ticksOf(
  recorder: ReturnType<typeof createTickSampleRecorder>,
  segmentId: string,
): number[] {
  const summary = recorder.getSegment(segmentId);
  assert.ok(summary);
  return Array.from(
    { length: summary.sampleCount },
    (_, index) => recorder.readSample(segmentId, index).observation.tick,
  );
}

test('085 toggle opens a new segment and freezes mode/profile/epoch/eligibility at open', () => {
  const recorder = createTickSampleRecorder();
  recorder.openSegment(segmentInput({ controlMode: 'MANUAL', learningEligible: false }));
  for (let index = 0; index < 3; index += 1) recorder.record(makeFrame({ tick: 100 + index }));
  // A frame whose mode/profile no longer matches the open header must not be attributed to it.
  assert.throws(
    () => recorder.record(makeFrame({ tick: 103, controlMode: 'AUTO' })),
    /frozen segment header/,
  );
  assert.throws(
    () => recorder.record(makeFrame({ tick: 103, baseVersionId: 'style-v2' })),
    /frozen segment header/,
  );
  recorder.record(makeFrame({ tick: 103 }));

  recorder.openSegment(
    segmentInput({
      segmentId: 'seg-2',
      controlMode: 'AUTO',
      inputType: 'AUTONOMY',
      learningEligible: false,
      startTick: 104,
    }),
  );
  recorder.record(makeFrame({ tick: 104, controlMode: 'AUTO' }));

  const segments = recorder.getSegments();
  assert.equal(segments.length, 2);
  const [manual, auto] = segments;
  assert.equal(manual.controlMode, 'MANUAL');
  assert.equal(manual.learningEligible, false);
  assert.equal(manual.profileId, 'style-1');
  assert.equal(manual.learningEpoch, 3);
  assert.equal(manual.completeness, 'CLOSED');
  assert.equal(manual.closeReason, 'MODE_CHANGE');
  assert.equal(manual.sampleCount, 4);
  assert.equal(auto.controlMode, 'AUTO');
  assert.equal(auto.learningEligible, false);
  assert.equal(auto.completeness, 'OPEN');
  // MANUAL remains fully available for metrics/history after the toggle.
  assert.deepEqual(ticksOf(recorder, 'seg-1'), [100, 101, 102, 103]);
  assert.equal(recorder.readSample('seg-1', 0).learningEligible, false);
  assert.equal(recorder.readSample('seg-1', 0).profileId, 'style-1');
  assert.equal(recorder.readSample('seg-1', 0).controlMode, 'MANUAL');
  // An AUTO or MANUAL opening can never be learning-eligible.
  assert.throws(
    () => recorder.openSegment(segmentInput({ segmentId: 'seg-x', learningEligible: true })),
    /LEARNING/,
  );
  assert.throws(
    () =>
      recorder.openSegment(
        segmentInput({ segmentId: 'seg-y', controlMode: 'AUTO', learningEligible: true }),
      ),
    /LEARNING/,
  );
});

test('085 a LEARNING segment is eligible while MANUAL/AUTO stay ineligible by construction', () => {
  const recorder = createTickSampleRecorder();
  recorder.openSegment(
    segmentInput({
      segmentId: 'learn',
      controlMode: 'LEARNING',
      learningEligible: true,
      inputType: 'KEYBOARD',
    }),
  );
  recorder.record(makeFrame({ tick: 100, controlMode: 'LEARNING' }));
  recorder.closeSegment('RIDE_COMPLETED');
  const summary = recorder.getSegment('learn');
  assert.ok(summary);
  assert.equal(summary.learningEligible, true);
  assert.equal(summary.controlMode, 'LEARNING');
  assert.equal(summary.retainedForMetrics, true);
});

test('085 vehicle switch opens a new segment with the new class/profile and no wrong attribution', () => {
  const recorder = createTickSampleRecorder();
  recorder.openSegment(segmentInput());
  recorder.record(makeFrame({ tick: 100, vehicleId: 'taxi-1', classId: 'sedan' }));
  assert.throws(
    () => recorder.record(makeFrame({ tick: 101, vehicleId: 'taxi-2', classId: 'compact' })),
    /open segment identity/,
  );
  recorder.openSegment(
    segmentInput({
      segmentId: 'seg-2',
      vehicleId: 'taxi-2',
      classId: 'compact',
      profileId: 'style-2',
      baseVersionId: 'style-v9',
      startTick: 101,
    }),
    'VEHICLE_SWITCH',
  );
  recorder.record(
    makeFrame({ tick: 101, vehicleId: 'taxi-2', classId: 'compact', baseVersionId: 'style-v9' }),
  );

  const first = recorder.getSegment('seg-1');
  const second = recorder.getSegment('seg-2');
  assert.ok(first && second);
  assert.equal(first.closeReason, 'VEHICLE_SWITCH');
  assert.equal(first.vehicleId, 'taxi-1');
  assert.equal(first.classId, 'sedan');
  assert.deepEqual(first.capabilities, mechanicalCapabilities('sedan'));
  assert.equal(second.vehicleId, 'taxi-2');
  assert.equal(second.classId, 'compact');
  assert.equal(second.profileId, 'style-2');
  assert.deepEqual(second.capabilities, mechanicalCapabilities('compact'));
  assert.notDeepEqual(first.capabilities, second.capabilities);
  // Every retained sample belongs to exactly one vehicle.
  for (const segmentId of ['seg-1', 'seg-2']) {
    const summary = recorder.getSegment(segmentId);
    assert.ok(summary);
    for (let index = 0; index < summary.sampleCount; index += 1) {
      const readout = recorder.readSample(segmentId, index);
      assert.equal(readout.observation.state.vehicleId, summary.vehicleId);
      assert.equal(readout.observation.state.classId, summary.classId);
    }
  }
});

test('085 pause produces no samples and never fabricates ticks', () => {
  const recorder = createTickSampleRecorder();
  recorder.openSegment(segmentInput({ startTick: 100 }));
  recorder.record(makeFrame({ tick: 100 }));
  recorder.record(makeFrame({ tick: 101 }));
  // Simulated pause: the fixed-tick loop suspends, so the recorder is simply not called.
  const afterPauseStats = recorder.getStats();
  assert.equal(afterPauseStats.samplesRetained, 2);
  recorder.record(makeFrame({ tick: 102 }));
  recorder.record(makeFrame({ tick: 103 }));

  assert.deepEqual(ticksOf(recorder, 'seg-1'), [100, 101, 102, 103]);
  assert.equal(recorder.getStats().tickGaps, 0);
  assert.equal(recorder.getStats().samplesRecorded, 4);
  // A regressed or duplicated tick is rejected instead of being silently synthesized.
  assert.throws(() => recorder.record(makeFrame({ tick: 103 })), /monotonically/);
  assert.throws(() => recorder.record(makeFrame({ tick: 99 })), /monotonically|precedes/);
});

test('085 ring capacity is exact and overflow is explicit for both policies', () => {
  const capacity = TICK_SAMPLE_CAPACITY.minimum;
  const oldest = createTickSampleRecorder({ capacity, overflowPolicy: 'DROP_OLDEST' });
  oldest.openSegment(segmentInput({ startTick: 0 }));
  for (let tick = 0; tick < capacity + 36; tick += 1) oldest.record(makeFrame({ tick }));
  let summary = oldest.getSegment('seg-1');
  assert.ok(summary);
  assert.equal(summary.sampleCount, capacity);
  assert.equal(summary.capacity, capacity);
  assert.equal(summary.overflowPolicy, 'DROP_OLDEST');
  assert.equal(summary.overwrittenSamples, 36);
  assert.equal(summary.rejectedSamples, 0);
  assert.equal(summary.bufferBytes, TICK_SAMPLE_BYTES_PER_SAMPLE * capacity);
  assert.deepEqual(ticksOf(oldest, 'seg-1')[0], 36);
  assert.deepEqual(ticksOf(oldest, 'seg-1')[capacity - 1], capacity + 35);
  assert.equal(oldest.getStats().samplesRetained, capacity);

  const newest = createTickSampleRecorder({ capacity, overflowPolicy: 'DROP_NEWEST' });
  newest.openSegment(segmentInput({ startTick: 0 }));
  const rejected: number[] = [];
  for (let tick = 0; tick < capacity + 36; tick += 1) {
    if (newest.record(makeFrame({ tick })) < 0) rejected.push(tick);
  }
  summary = newest.getSegment('seg-1');
  assert.ok(summary);
  assert.equal(summary.sampleCount, capacity);
  assert.equal(summary.rejectedSamples, 36);
  assert.equal(summary.overwrittenSamples, 0);
  assert.equal(rejected.length, 36);
  assert.deepEqual(
    ticksOf(newest, 'seg-1'),
    Array.from({ length: capacity }, (_, i) => i),
  );
});

test('085 retention is bounded by segment count and bytes, and dispose zeroes live counters', () => {
  const recorder = createTickSampleRecorder({ retainedSegments: 2 });
  for (let index = 1; index <= 3; index += 1) {
    recorder.openSegment(segmentInput({ segmentId: `seg-${index}`, startTick: 0 }));
    recorder.record(makeFrame({ tick: 0 }));
  }
  recorder.closeSegment('SHUTDOWN');
  const stats = recorder.getStats();
  assert.equal(stats.segmentsOpened, 3);
  assert.equal(stats.segmentsClosed, 3);
  assert.equal(stats.segmentsRetained, 2);
  assert.equal(stats.segmentsRetired, 1);
  assert.equal(recorder.getSegment('seg-1'), null);
  assert.ok(recorder.getSegment('seg-3'));
  assert.equal(
    stats.retainedBytes,
    2 * TICK_SAMPLE_BYTES_PER_SAMPLE * TICK_SAMPLE_CAPACITY.default,
  );
  assert.equal(stats.retainedBytes <= stats.retainedBytesMaximum, true);

  recorder.dispose();
  const disposed = recorder.getStats();
  assert.equal(disposed.disposed, true);
  assert.equal(disposed.segmentsRetained, 0);
  assert.equal(disposed.samplesRetained, 0);
  assert.equal(disposed.bufferBytes, 0);
  assert.equal(disposed.identityCodeUnits, 0);
  assert.equal(disposed.retainedBytes, 0);
  assert.throws(() => recorder.openSegment(segmentInput()), /disposed/);
  assert.throws(() => recorder.readSample('seg-3', 0), /disposed/);
});

test('085 hot path is finite SI and never serializes JSON per tick', () => {
  const recorder = createTickSampleRecorder();
  recorder.openSegment(segmentInput({ startTick: 100 }));
  const frames = Array.from({ length: 200 }, (_, index) => makeFrame({ tick: 100 + index }));

  const originalStringify = JSON.stringify;
  let calls = 0;
  JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => {
    calls += 1;
    return originalStringify(...args);
  }) as typeof JSON.stringify;
  try {
    for (const frame of frames) recorder.record(frame);
  } finally {
    JSON.stringify = originalStringify;
  }
  assert.equal(calls, 0, 'recording must not serialize JSON per tick');

  const readout = recorder.readSample('seg-1', 199);
  const { observation } = readout;
  assert.equal(observation.tick, 299);
  assert.equal(observation.laneId, 'lane-1');
  assert.equal(Math.abs((observation.speedLimitMps as number) - 13.9) < 1e-3, true);
  assert.equal(observation.signal?.state, 'GREEN');
  assert.equal(observation.rawInput.throttle, 1);
  assert.equal(observation.command.source, 'PLAYER');
  for (const value of [
    observation.physics.longitudinalAccelerationMps2,
    observation.physics.lateralAccelerationMps2,
    observation.speedLimitMps as number,
    observation.state.transform.positionM.x,
    observation.state.velocityMps.z,
  ])
    assert.equal(Number.isFinite(value), true);
  // The stored projection still satisfies the existing authoritative contracts.
  assert.equal(parseVehicleState(observation.state).tick, observation.tick);
  assert.equal(parseVehicleCommand(observation.command).tick, observation.tick);
});

test('085 a lane-less tick has no lane identity and no signal is fabricated', () => {
  const recorder = createTickSampleRecorder();
  recorder.openSegment(segmentInput({ startTick: 100 }));
  recorder.record(makeFrame({ tick: 100, laneId: null, withLane: false, withSignal: false }));
  const { observation } = recorder.readSample('seg-1', 0);
  assert.equal(observation.laneId, null);
  assert.equal(observation.speedLimitMps, null);
  assert.equal(observation.signal, null);
  assert.equal(observation.state.laneId, null);
});

test('085 identical input produces identical samples', () => {
  const capture = () => {
    const recorder = createTickSampleRecorder();
    recorder.openSegment(segmentInput({ controlMode: 'LEARNING', learningEligible: true }));
    for (let index = 0; index < 20; index += 1)
      recorder.record(makeFrame({ tick: 100 + index, controlMode: 'LEARNING', speedMps: index }));
    recorder.closeSegment('RIDE_COMPLETED');
    const summary = recorder.getSegment('seg-1');
    assert.ok(summary);
    return JSON.stringify({
      summary,
      samples: Array.from({ length: summary.sampleCount }, (_, index) =>
        recorder.readSample('seg-1', index),
      ),
    });
  };
  assert.equal(capture(), capture());
});

test('085 derived physics is finite SI and rejects an invalid step', () => {
  const previous = makeState({ tick: 100, speedMps: 4 });
  const current = makeState({ tick: 101, speedMps: 5 });
  const physics = deriveTickSamplePhysics(previous, current, 1 / 60);
  assert.equal(Number.isFinite(physics.longitudinalAccelerationMps2), true);
  assert.equal(Number.isFinite(physics.lateralAccelerationMps2), true);
  assert.equal(physics.longitudinalAccelerationMps2 > 0, true);
  assert.equal(physics.lateralAccelerationMps2, 0);
  assert.throws(() => deriveTickSamplePhysics(previous, current, 0), /finite number/);
});

test('085 rejects malformed segments, frames and statistics inputs', () => {
  const recorder = createTickSampleRecorder();
  // With no open segment the sample is counted as rejected after close, never thrown silently.
  assert.equal(recorder.record(makeFrame({ tick: 100 })), -1);
  assert.equal(recorder.getStats().samplesRejectedAfterClose, 1);
  recorder.openSegment(segmentInput());
  // A frame missing a required field, a foreign class and a non-finite physics value.
  assert.throws(
    () => recorder.record({ ...makeFrame({ tick: 100 }), raw: null } as never),
    /Tick sample raw input/,
  );
  assert.throws(
    () => recorder.record(makeFrame({ tick: 100, classId: 'compact' })),
    /open segment identity/,
  );
  assert.throws(
    () =>
      recorder.record({
        ...makeFrame({ tick: 100 }),
        physics: { longitudinalAccelerationMps2: Number.NaN, lateralAccelerationMps2: 0 },
      }),
    /finite number in range|finite SI/,
  );
  assert.throws(() => recorder.openSegment(segmentInput({ segmentId: 'seg-1' })), /Duplicate/);
  assert.throws(() => createTickSampleRecorder({ capacity: 1 }), /capacity out of range/);
  assert.throws(() => createTickSampleRecorder({ retainedBytes: 1 }), /Retained byte capacity/);
  assert.throws(
    () => createTickSampleRecorder({ overflowPolicy: 'KEEP' as never }),
    /Unsupported enum value/,
  );
  assert.equal(mechanicalCapabilities('compact').maxDecelerationMps2 > 0, true);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { runScenario } from './runner.ts';
import { seededCounter } from '../scenarios/seeded-counter.ts';
import { verifyCounter } from '../scenarios/verify-counter.ts';

test('headless: advances 12 ticks and captures states/events without renderer', () => {
  const capture = runScenario(seededCounter, 41, 12);
  verifyCounter(capture);
  assert.deepEqual(capture.states[12], { tick: 12, value: 36 });
  assert.deepEqual(capture.events, [{ type: 'threshold-crossed', tick: 4, value: 12 }]);
  assert.deepEqual(runScenario(seededCounter, 41, 12), capture);
  assert.notDeepEqual(runScenario(seededCounter, 42, 12), capture);
  assert.equal('document' in globalThis, false);
});

test('zero ticks captures initial state and validates seed/tick boundaries', () => {
  const capture = runScenario(seededCounter, 0, 0);
  verifyCounter(capture);
  assert.deepEqual(capture.states, [{ tick: 0, value: 0 }]);
  assert.deepEqual(capture.events, []);
  for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => runScenario(seededCounter, value, 1), RangeError);
    assert.throws(() => runScenario(seededCounter, 0, value), RangeError);
  }
});

test('capture owns copies even when an adapter reuses mutable state and events', () => {
  const state = { value: 0 };
  const event = { value: 0 };
  const capture = runScenario(
    {
      id: 'mutable-adapter',
      create: () => ({
        snapshot: () => state,
        advance: () => {
          state.value += 1;
          event.value = state.value;
          return [event];
        },
      }),
    },
    0,
    2,
  );
  state.value = 99;
  event.value = 99;
  assert.deepEqual(capture.states, [{ value: 0 }, { value: 1 }, { value: 2 }]);
  assert.deepEqual(capture.events, [{ value: 1 }, { value: 2 }]);
});

test('scenario oracle rejects corrupted state and event evidence', () => {
  const stateCapture = runScenario(seededCounter, 41, 12);
  stateCapture.states[2].value = 99;
  assert.throws(() => verifyCounter(stateCapture), /Unexpected state/);
  const eventCapture = runScenario(seededCounter, 41, 12);
  eventCapture.events[0].tick = 9;
  assert.throws(() => verifyCounter(eventCapture), /Unexpected threshold/);
});

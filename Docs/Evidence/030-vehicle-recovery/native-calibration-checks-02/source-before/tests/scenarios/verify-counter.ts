import type { ScenarioCapture } from '../harness/runner';
import type { CounterEvent, CounterState } from './seeded-counter';

/** Independent oracle reused by the Node and browser integration examples. */
export function verifyCounter(capture: ScenarioCapture<CounterState, CounterEvent>): void {
  const increment = 1 + (capture.seed % 3);
  if (capture.states.length !== capture.ticks + 1) throw new Error('Missing captured state');
  capture.states.forEach((state, tick) => {
    if (state.tick !== tick || state.value !== tick * increment) {
      throw new Error(`Unexpected state at tick ${tick}`);
    }
  });
  const eventTick = Math.ceil(10 / increment);
  const expected = capture.ticks >= eventTick ? 1 : 0;
  if (capture.events.length !== expected) throw new Error('Unexpected event count');
  if (expected === 1) {
    const event = capture.events[0];
    if (
      event.type !== 'threshold-crossed' ||
      event.tick !== eventTick ||
      event.value !== eventTick * increment
    ) {
      throw new Error('Unexpected threshold event');
    }
  }
}

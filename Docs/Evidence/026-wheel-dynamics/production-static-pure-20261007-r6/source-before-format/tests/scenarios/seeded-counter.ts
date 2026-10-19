import type { ScenarioDefinition } from '../harness/runner';

export interface CounterState {
  tick: number;
  value: number;
}
export interface CounterEvent {
  type: 'threshold-crossed';
  tick: number;
  value: number;
}

/** Test-only arithmetic fixture. Seed selects a scripted increment; this is not the game's RNG. */
export const seededCounter: ScenarioDefinition<CounterState, CounterEvent> = {
  id: 'seeded-counter-v1',
  create(seed) {
    const increment = 1 + (seed % 3);
    const state: CounterState = { tick: 0, value: 0 };
    let emitted = false;
    return {
      snapshot: () => state,
      advance() {
        state.tick += 1;
        state.value += increment;
        if (!emitted && state.value >= 10) {
          emitted = true;
          return [{ type: 'threshold-crossed', tick: state.tick, value: state.value }];
        }
        return [];
      },
    };
  },
};

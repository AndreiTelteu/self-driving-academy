/** A test adapter, independent of renderer, clock scheduling and production tick mechanics. */
export interface ScenarioAdapter<State, Event> {
  snapshot(): State;
  advance(): readonly Event[];
}

export interface ScenarioDefinition<State, Event> {
  readonly id: string;
  create(seed: number): ScenarioAdapter<State, Event>;
}

export interface ScenarioCapture<State, Event> {
  readonly scenarioId: string;
  readonly seed: number;
  readonly ticks: number;
  readonly states: readonly State[];
  readonly events: readonly Event[];
}

/** Capture owned JSON-compatible copies, including tick zero, so later writes cannot alter evidence. */
export function runScenario<State, Event>(
  scenario: ScenarioDefinition<State, Event>,
  seed: number,
  ticks: number,
): ScenarioCapture<State, Event> {
  if (!Number.isSafeInteger(seed) || seed < 0) throw new RangeError('Invalid scenario seed');
  if (!Number.isSafeInteger(ticks) || ticks < 0) throw new RangeError('Invalid tick count');
  const adapter = scenario.create(seed);
  const states = [structuredClone(adapter.snapshot())];
  const events: Event[] = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    events.push(...structuredClone(adapter.advance()));
    states.push(structuredClone(adapter.snapshot()));
  }
  return { scenarioId: scenario.id, seed, ticks, states, events };
}

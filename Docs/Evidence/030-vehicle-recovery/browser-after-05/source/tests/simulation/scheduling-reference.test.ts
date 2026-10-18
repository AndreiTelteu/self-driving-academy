import test from 'node:test';
import assert from 'node:assert/strict';
import {
  referenceClockScenario,
  referenceStressScenario,
  schedulingFixture,
  syntheticRouteSearch,
  unscheduledStep,
} from './scheduling-reference';
import { roadContextFixture } from '../autonomy/road-context-reference';

test('unscheduled before reference preserves exact authoritative trace across30/60/120synthetic render clocks', () => {
  const scenarios = ([30, 60, 120] as const).map(referenceClockScenario);
  for (const scenario of scenarios) {
    assert.equal(scenario.tick, 120);
    assert.equal(scenario.simulatedSeconds, 2);
    assert.deepEqual(scenario.events, scenarios[0].events);
    assert.ok(scenario.events.includes('urgent:7:b'));
    assert.ok(scenario.events.includes('input:7:b'));
  }
});

test('before hitch pauses without a step, retains debt and recovers only real60Hzsteps capped at4', () => {
  const result = referenceStressScenario('hitch');
  assert.equal(result.overloadCount, 1);
  assert.equal(result.tick, 60);
  assert.equal(result.maximumSteps, 4);
  assert.ok(result.debtSeconds >= 0 && result.debtSeconds < 1e-12);
  assert.equal(result.simulatedSeconds, 1);
  assert.equal(result.activeRealSeconds, 1);
  assert.equal(result.events.filter((event) => event.startsWith('physics:')).length, 60);
});

test('before background pause excludes stopped wall time; selection and blockage urgent callbacks bypass periodic slot', () => {
  const background = referenceStressScenario('background');
  assert.equal(background.tick, 120);
  assert.equal(background.simulatedSeconds, 2);
  assert.ok(Math.abs(background.activeRealSeconds - 2) < 1e-8);
  const events = referenceStressScenario('urgent-selection-blockage');
  assert.ok(events.events.includes('input-applied:7:b'));
  assert.ok(events.decisions.includes('7:b:urgent:v1'));
  assert.ok(events.decisions.includes('14:b:urgent:v2'));
  assert.deepEqual(background.events, events.events);
});

test('actual044before fixture admits all70/110actors and source tick matches each fresh decision', () => {
  for (const dense of [false, true]) {
    const fixture = schedulingFixture(dense);
    try {
      assert.equal(fixture.actors.length, dense ? 110 : 70);
      for (let tick = 1; tick <= 12; tick++) {
        fixture.prepare(tick);
        unscheduledStep(fixture.actors, tick, fixture.ports);
      }
      assert.equal(fixture.counters().decisions, fixture.actors.length * 2);
      assert.equal(fixture.counters().controllers, fixture.actors.length * 12);
      assert.equal(fixture.counters().physics, 12);
    } finally {
      fixture.dispose();
    }
  }
});

test('synthetic route job consults actual directed successors and never returns a blocked destination', () => {
  const { graph } = roadContextFixture(false);
  const result = syntheticRouteSearch(graph, 'west-in', 'east-out');
  assert.ok(result);
  assert.equal(result[0], 'west-in');
  assert.equal(result.at(-1), 'east-out');
  for (let i = 1; i < result.length; i++)
    assert.ok(graph.canTraverse(result[i - 1], result[i], 'CIVIL'));
  assert.equal(syntheticRouteSearch(graph, 'west-in', 'east-out', new Set(['east-out'])), null);
});

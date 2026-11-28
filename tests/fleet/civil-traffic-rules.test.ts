import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAmbientTraffic } from '../../src/app/ambient-traffic';
import { createCompositionWorld } from '../../src/app/composition-world';

const CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: 'session-283-fleet',
  worldEpoch: 1,
});

test('283 the live 262 fleet advances 036 and produces real red, STOP, yield and lane-change evidence', () => {
  const world = createCompositionWorld(),
    ambient = createAmbientTraffic({
      map: world.map,
      graph: world.graph,
      context: CONTEXT,
      seed: 283,
      liveRules: true,
      focus: { x: world.spawn.x, z: world.spawn.z },
    });
  try {
    for (let tick = 1; tick <= 1800; tick += 1) ambient.traffic.step({ tick, dtSeconds: 1 / 60 });
    const report = ambient.trafficRules()!;
    assert.ok(report.signals.phaseChanges > 0, '036 advanced at least one phase');
    assert.ok(report.signals.redStops > 0, 'at least one AI red stop episode was observed');
    assert.ok(report.signals.redHolds > 0, 'the red command was actually held');
    assert.ok(report.stop.approaches > 0, '037 opened a real STOP opportunity');
    assert.ok(report.stop.fullStops > 0, '051 proved at least one full stop');
    assert.ok(report.yield.checks > 0, '052 evaluated real priority traffic');
    assert.equal(report.violations.total, 0, 'no player violation is fabricated by AI operation');
    assert.ok(report.cost.samples > 0);
    assert.equal(report.retainedHistory, 0);
    for (const actor of ambient.list())
      assert.ok(!actor.blocked, 'AUTO holds never become BLOCKED');
  } finally {
    ambient.dispose();
  }
});

test('283 the same live fleet is deterministic for the same seed', () => {
  const world = createCompositionWorld();
  const run = () => {
    const ambient = createAmbientTraffic({
      map: world.map,
      graph: world.graph,
      context: CONTEXT,
      seed: 283,
      liveRules: true,
      focus: { x: world.spawn.x, z: world.spawn.z },
    });
    try {
      for (let tick = 1; tick <= 300; tick += 1) ambient.traffic.step({ tick, dtSeconds: 1 / 60 });
      const report = ambient.trafficRules()!;
      return {
        signals: report.signals,
        stop: report.stop,
        yield: report.yield,
        laneChange: report.laneChange,
        violations: report.violations,
        actors: ambient.list().map((actor) => ({
          vehicleId: actor.vehicleId,
          laneId: actor.laneId,
          speedMps: actor.speedMps,
          positionM: actor.positionM,
        })),
      };
    } finally {
      ambient.dispose();
    }
  };
  assert.deepEqual(run(), run());
});

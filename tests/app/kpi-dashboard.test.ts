import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMPTY_KPI_IMPACT_MISSION,
  readCityDashboardSnapshot,
  readKpiHistory,
  readKpiImpact,
  rideTripDistanceM,
} from '../../src/app';
import type { RideReview } from '../../src/economy';
import { createFleetHealth } from '../../src/fleet';
import type { RideRecord } from '../../src/fleet';
import { KPI_IMPACT_TEXT, projectKpiImpact } from '../../src/ui';
import type { LaneGraph } from '../../src/world';
import { revenueUpRatingDown, bothDown } from '../economy/kpi-impact-fixture';
import { createLiveRideLifecycleFixture } from '../fleet/live-ride-lifecycle-fixture';
import { createKpiHistoryScenario } from '../ui/kpi-history-fixture';

test('267 KPI history is the exact 210 selection: 12 months, no-data distinct from zero', () => {
  const scenario = createKpiHistoryScenario(),
    before = scenario.kpi.getStats(),
    selection = readKpiHistory({ kpi: scenario.snapshot() }),
    after = scenario.kpi.getStats();
  assert.equal(selection.months.length, 12);
  assert.equal(selection.months[3]?.state, 'NO_DATA');
  assert.equal(selection.months[3]?.revenueMinorUnits, null);
  assert.equal(selection.months[3]?.averageRating, null);
  assert.equal(selection.months[6]?.revenueMinorUnits, 0);
  assert.equal(selection.months[6]?.terminalRides, 30);
  assert.equal(selection.months[11]?.state, 'PARTIAL');
  assert.equal(selection.projection.status, 'PROJECTED');
  assert.equal(selection.totals.averageRating, Math.round((725 / 284) * 1e6) / 1e6);
  assert.equal(selection.historyScans, 0);
  assert.equal(after.historyScans, 0);
  assert.equal(after.settlements, before.settlements);
  assert.equal(after.reviews, before.reviews);
});

test('267 impact snapshot keeps the 214 service plane and real fidelity without inventing XP', () => {
  const scenario = revenueUpRatingDown(),
    review = scenario.kpi.snapshot(scenario.tick).currentDay;
  assert.ok(review !== null);
  const before = scenario.kpi.getStats(),
    snapshot = readKpiImpact({
      kpi: scenario.snapshot(),
      sessionId: 'session:267',
      worldEpoch: 2,
      namespace: 'city:economy',
      controlMode: 'MANUAL',
      lastReview: null,
    }),
    view = projectKpiImpact(snapshot);
  assert.equal(snapshot.version, '214-kpi-impact-feedback-v1');
  assert.equal(snapshot.mission.state, 'NONE');
  assert.equal(snapshot.mission.xpGranted, 0);
  assert.equal(snapshot.fidelity.controlMode, 'MANUAL');
  assert.equal(snapshot.fidelity.controlIntervals, 0);
  assert.equal(snapshot.fidelity.comfortPenalty, null);
  assert.deepEqual(snapshot.service.delta.revenueDirection, 'UP');
  assert.deepEqual(snapshot.service.delta.ratingDirection, 'DOWN');
  assert.equal(view.planes.length, 3);
  assert.ok(view.service.text.includes(KPI_IMPACT_TEXT.directions.UP));
  assert.deepEqual(snapshot.service.xp, { debits: 0, credits: 0, negativeCredits: false });
  assert.equal(snapshot.service.historyScans, 0);
  assert.equal(scenario.kpi.getStats().historyScans, before.historyScans);
});

test('267 impact fidelity copies the real 139 comfort term of the last review', () => {
  const scenario = bothDown(),
    result = scenario.kpi.snapshot(scenario.tick),
    before = scenario.read(),
    snapshot = readKpiImpact({
      kpi: result,
      sessionId: 'session:267',
      worldEpoch: 2,
      namespace: 'city:economy',
      controlMode: 'LEARNING',
      lastReview: {
        controlIntervals: 7,
        evidence: { comfortPenalty: 0.5 },
      } as unknown as RideReview,
      mission: EMPTY_KPI_IMPACT_MISSION,
    });
  assert.equal(snapshot.fidelity.controlMode, 'LEARNING');
  assert.equal(snapshot.fidelity.controlIntervals, 7);
  assert.equal(snapshot.fidelity.comfortPenalty, 0.5);
  assert.equal(snapshot.service.state, before.state);
  assert.equal(snapshot.service.delta.revenueMinorUnits, before.delta.revenueMinorUnits);
});

test('267 the city distance is the real planned trip geometry, never an invented zero', () => {
  const ride = {
      tripRouteLaneIds: Object.freeze(['lane-a', 'lane-b']),
    } as unknown as RideRecord,
    graph = {
      getDirectedPath: (laneId: string) =>
        laneId === 'lane-a' ? { lengthM: 10 } : laneId === 'lane-b' ? { lengthM: 2.5 } : null,
    } as unknown as Pick<LaneGraph, 'getDirectedPath'>;
  assert.equal(rideTripDistanceM(graph, ride), 12.5);
  assert.equal(
    rideTripDistanceM(
      { getDirectedPath: () => null } as unknown as Pick<LaneGraph, 'getDirectedPath'>,
      ride,
    ),
    null,
    'a missing lane is unavailable, not zero',
  );
  assert.equal(
    rideTripDistanceM(graph, { tripRouteLaneIds: [] } as unknown as RideRecord),
    null,
    'an empty route is unavailable, not zero',
  );
});

test('267 the real 264/265/065 owners compose a seven-indicator city frame', () => {
  const fixture = createLiveRideLifecycleFixture(),
    health = createFleetHealth({
      dispatcher: fixture.live.dispatcher,
      lifecycle: fixture.composition.lifecycle.lifecycle,
      demand: fixture.live.demand,
      eta: fixture.composition.lifecycle.eta,
      registry: fixture.ambient.registry,
    });
  try {
    const snapshot = readCityDashboardSnapshot(
      {
        context: { sessionId: 'session-267-live', worldEpoch: 1 },
        lifecycle: fixture.composition.lifecycle.lifecycle,
        health,
        rideDistanceM: (ride) => rideTripDistanceM(fixture.world.graph, ride),
      },
      { tick: 0, selectedIncidentId: null },
    );
    assert.equal(snapshot.metrics.length, 7);
    assert.equal(snapshot.metrics[0]?.id, 'completedRides');
    assert.equal(snapshot.metrics[0]?.state, 'AVAILABLE');
    assert.equal(snapshot.metrics[0]?.value, 0);
    assert.equal(snapshot.metrics[1]?.state, 'UNAVAILABLE');
    assert.equal(snapshot.metrics[3]?.state, 'UNAVAILABLE');
    assert.equal(snapshot.metrics[5]?.id, 'blockages');
    assert.equal(snapshot.metrics[5]?.state, 'AVAILABLE');
    assert.equal(snapshot.metrics[5]?.value, 0);
    assert.equal(snapshot.incidents.length, 0);
    assert.equal(snapshot.exposure.state, 'AVAILABLE');
    assert.equal(snapshot.exposure.windows, 0);
  } finally {
    health.dispose();
    fixture.dispose();
  }
});

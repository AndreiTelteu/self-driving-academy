import assert from 'node:assert/strict';
import test from 'node:test';
import {
  KPI_IMPACT_VERSION,
  kpiImpactDirections,
  kpiImpactIncidentStates,
  kpiImpactRatingAvailability,
  kpiImpactStates,
} from '../../src/economy';
import {
  KPI_IMPACT_DIRECTIONS,
  KPI_IMPACT_FORBIDDEN_FRAGMENTS,
  KPI_IMPACT_INCIDENT_STATES,
  KPI_IMPACT_PLANES,
  KPI_IMPACT_RATING_AVAILABILITY,
  KPI_IMPACT_SERVICE_VERSION,
  KPI_IMPACT_STATES,
  KPI_IMPACT_TEXT,
  KPI_IMPACT_UI_VERSION,
  assertNoXpLossMessages,
  composeKpiImpactSnapshot,
  emptyKpiImpactView,
  kpiImpactTexts,
  missionResultFromSettlement,
  parseKpiImpactSnapshot,
  projectKpiImpact,
} from '../../src/ui';
import type { KpiImpactSnapshot } from '../../src/ui';
import { completedMissionSettlement } from '../missions/player-xp-fixture';
import {
  bothDown,
  controlModeImpact,
  firstDay,
  noEvents,
  realFailedRide,
  revenueDownRatingUp,
  revenueUpRatingDown,
  steady,
} from '../economy/kpi-impact-fixture';
import {
  createKpiImpactHudHarness,
  impactSnapshot,
  impactView,
  simulateHud,
} from './kpi-impact-fixture';

const riseView = impactView({ read: revenueUpRatingDown().read() });
const fallView = impactView({ read: bothDown().read() });
const inverseView = impactView({ read: revenueDownRatingUp().read() });

test('214 the UI vocabularies are the economy vocabularies', () => {
  assert.equal(KPI_IMPACT_SERVICE_VERSION, KPI_IMPACT_VERSION);
  assert.deepEqual([...KPI_IMPACT_DIRECTIONS], [...kpiImpactDirections]);
  assert.deepEqual([...KPI_IMPACT_STATES], [...kpiImpactStates]);
  assert.deepEqual([...KPI_IMPACT_RATING_AVAILABILITY], [...kpiImpactRatingAvailability]);
  assert.deepEqual([...KPI_IMPACT_INCIDENT_STATES], [...kpiImpactIncidentStates]);
  assert.equal(KPI_IMPACT_PLANES.length, 3);
  assert.equal(KPI_IMPACT_UI_VERSION, '214-kpi-impact-feedback-v1');
});

test('214 the feedback keeps the three planes separate', () => {
  assert.equal(riseView.planes.length, 3);
  assert.deepEqual(
    riseView.planes.map((plane) => plane.plane),
    ['MISSION', 'FIDELITY', 'SERVICE'],
  );
  assert.equal(riseView.mission.title, KPI_IMPACT_TEXT.planes.MISSION);
  assert.equal(riseView.fidelity.title, KPI_IMPACT_TEXT.planes.FIDELITY);
  assert.equal(riseView.service.title, KPI_IMPACT_TEXT.planes.SERVICE);
  for (const plane of riseView.planes) {
    assert.ok(plane.headline.startsWith(`${plane.title}: `));
    assert.ok(plane.text.includes(plane.headline));
  }
  // No plane repeats another one's message: the UI never shows one combined consequence.
  assert.notEqual(riseView.mission.headline, riseView.fidelity.headline);
  assert.notEqual(riseView.fidelity.headline, riseView.service.headline);
  assert.notEqual(riseView.mission.headline, riseView.service.headline);
  assert.ok(!riseView.mission.text.includes(riseView.service.headline));
  assert.ok(!riseView.service.text.includes(riseView.mission.headline));
});

test('214 the service plane shows the real revenue and rating directions', () => {
  assert.equal(riseView.directions.revenue, 'UP');
  assert.equal(riseView.directions.rating, 'DOWN');
  assert.equal(riseView.service.state, 'COMPARABLE');
  assert.match(riseView.service.text, /\+500 SDA/);
  assert.match(riseView.service.text, /500 → 1000 SDA/);
  assert.match(riseView.service.text, /5 → 2 \(-3\)/);
  assert.equal(fallView.directions.revenue, 'DOWN');
  assert.equal(fallView.directions.rating, 'DOWN');
  assert.match(fallView.service.text, /-800 SDA/);
  assert.match(fallView.service.text, /1000 → 200 SDA/);
  assert.match(fallView.service.text, /5 → 1 \(-4\)/);
  assert.match(fallView.service.text, /1 \(incidente în creștere\)/);
  assert.equal(inverseView.directions.revenue, 'DOWN');
  assert.equal(inverseView.directions.rating, 'UP');
  assert.equal(steady().read().delta.revenueDirection, 'FLAT');
});

test('214 the first day and the empty snapshot claim no comparison', () => {
  const first = impactView({ read: firstDay().read() });
  assert.equal(first.service.state, 'NO_BASELINE');
  assert.ok(first.service.text.includes(KPI_IMPACT_TEXT.availability.NO_BASELINE));
  assert.ok(!first.service.text.includes(KPI_IMPACT_TEXT.directions.DOWN));
  const empty = impactView({ read: noEvents().read() });
  assert.equal(empty.service.state, 'NO_EVENT');
  assert.equal(empty.empty, false);
  assert.ok(empty.service.text.includes(KPI_IMPACT_TEXT.empty));
  const nothing = emptyKpiImpactView();
  assert.equal(nothing.empty, true);
  assert.equal(nothing.planes.length, 3);
});

test('214 no message or attribute promises a loss of XP', () => {
  for (const view of [riseView, fallView, inverseView, emptyKpiImpactView()]) {
    assert.equal(assertNoXpLossMessages(view), true);
    for (const value of kpiImpactTexts(view))
      for (const fragment of KPI_IMPACT_FORBIDDEN_FRAGMENTS)
        assert.equal(value.toLowerCase().includes(fragment), false, `${fragment} in ${value}`);
    assert.deepEqual(view.xp, { debits: 0, credits: 0, negativeCredits: false });
    assert.equal(view.historyScans, 0);
  }
});

test('214 a failed or refused mission carries no XP and is refused if it claims any', () => {
  const read = bothDown().read();
  const failed = composeKpiImpactSnapshot({
    sessionId: 'session:214',
    worldEpoch: 1,
    tick: read.tick,
    namespace: 'city:economy',
    service: read,
    mission: {
      state: 'FAILED',
      missionId: 'campaign-1-first-taxi',
      attempt: 2,
      xpGranted: 0,
      duplicateXp: 0,
    },
    fidelity: { controlMode: 'MANUAL', controlIntervals: 0, comfortPenalty: null },
  });
  const view = projectKpiImpact(failed);
  assert.equal(view.mission.stateLabel, KPI_IMPACT_TEXT.missionStates.FAILED);
  assert.equal(view.mission.tone, 'NEGATIVE');
  assert.match(view.mission.text, /0 XP/);
  assertNeutralXp(view.mission.text);

  assert.throws(
    () =>
      parseKpiImpactSnapshot({
        ...failed,
        mission: { ...failed.mission, state: 'FAILED', xpGranted: 50 },
      }),
    /failed or refused mission cannot grant XP/,
  );
  assert.throws(
    () =>
      parseKpiImpactSnapshot({
        ...failed,
        mission: { ...failed.mission, state: 'COMPLETED', duplicateXp: 25 },
      }),
    /duplicate delivery cannot grant XP/,
  );
  assert.throws(
    () =>
      parseKpiImpactSnapshot({
        ...failed,
        mission: { ...failed.mission, state: 'COMPLETED', xpGranted: -1 },
      }),
    /granted XP number/,
  );
});

function assertNeutralXp(text: string): void {
  for (const fragment of KPI_IMPACT_FORBIDDEN_FRAGMENTS)
    assert.equal(text.toLowerCase().includes(fragment), false);
}

test('214 a real 125 settlement is completed, a duplicate delivery is refused with 0 XP', () => {
  const scenario = completedMissionSettlement();
  const first = missionResultFromSettlement(scenario.settlement);
  assert.equal(first.state, 'COMPLETED');
  assert.equal(first.xpGranted, 100);
  assert.equal(first.missionId, scenario.settlement.missionId);
  assert.equal(first.attempt, scenario.settlement.attempt);
  const repeated = scenario.ledger.settle({ instance: scenario.instance });
  assert.equal(repeated.status, 'DUPLICATE');
  assert.equal(repeated.xpGranted, 0);
  const refused = missionResultFromSettlement(repeated);
  assert.equal(refused.state, 'REFUSED');
  assert.equal(refused.xpGranted, 0);
  assert.equal(refused.duplicateXp, 0);
  const view = projectKpiImpact(
    impactSnapshot({ read: revenueUpRatingDown().read(), mission: refused }),
  );
  assert.equal(view.mission.stateLabel, KPI_IMPACT_TEXT.missionStates.REFUSED);
  assert.match(view.mission.text, /0 XP/);
  assertNeutralXp(view.mission.text);
});

test('214 the fidelity plane names the real control mode', () => {
  for (const mode of ['MANUAL', 'LEARNING', 'AUTO'] as const) {
    const scenario = controlModeImpact(mode);
    try {
      const view = projectKpiImpact(
        impactSnapshot({
          read: scenario.read,
          fidelity: { controlMode: mode, controlIntervals: 8, comfortPenalty: 0 },
        }),
      );
      assert.equal(view.fidelity.state, mode);
      assert.equal(view.fidelity.stateLabel, KPI_IMPACT_TEXT.modes[mode]);
      assert.ok(view.fidelity.text.includes(KPI_IMPACT_TEXT.modes[mode]));
      assert.equal(view.directions.rating, scenario.read.delta.ratingDirection);
    } finally {
      scenario.dispose();
    }
  }
});

test('214 an invalid service read or a mismatched tick is refused by the UI', () => {
  const read = revenueUpRatingDown().read();
  assert.throws(
    () =>
      parseKpiImpactSnapshot({
        ...impactSnapshot({ read }),
        service: { ...read, delta: { ...read.delta, revenueMinorUnits: 1 } },
      }),
    /revenue delta/,
  );
  assert.throws(
    () =>
      parseKpiImpactSnapshot({
        ...impactSnapshot({ read }),
        tick: read.tick + 1,
      }),
    /not the tick of its snapshot/,
  );
  assert.throws(
    () =>
      parseKpiImpactSnapshot({
        ...impactSnapshot({ read }),
        service: { ...read, historyScans: 1 },
      }),
    /must not scan the ledger/,
  );
  const snapshot: KpiImpactSnapshot = impactSnapshot({ read });
  assert.throws(
    () => parseKpiImpactSnapshot({ ...snapshot, service: { ...read, version: 'other' } }),
    /not the 214 read model/,
  );
});

test('214 the HUD never reads per frame and renders only on a changed KPI', () => {
  const before = impactSnapshot({ read: revenueUpRatingDown().read() });
  const after = impactSnapshot({ read: bothDown().read() });
  const run = simulateHud({ frames: 600, changeAt: 300, before, after });
  assert.equal(run.stats.ticks, 600);
  assert.equal(run.stats.reads, 100);
  assert.equal(run.stats.minimumReadIntervalTicks, 6);
  assert.equal(run.stats.maximumReadHz, 10);
  assert.equal(run.stats.renders, 2);
  assert.equal(run.stats.skippedThrottled, 500);
  assert.equal(run.stats.skippedUnchanged, 98);
  assert.equal(run.stats.planeUpdates, 4);
  assert.equal(run.planeUpdatesBeforeChange, 3);
  assert.equal(run.rendersBeforeChange, 1);
  assert.equal(run.statuses.filter((status) => status === 'RENDERED').length, 2);
  assert.equal(run.stats.historyRebuilds, 0);
  assert.equal(run.stats.xpLossMessages, 0);
  assert.equal(run.stats.listeners, 0);
  assert.equal(run.stats.globalListeners, 0);
});

test('214 an unchanged KPI renders once and the interval gates every read', () => {
  const snapshot = impactSnapshot({ read: steady().read() });
  const unchanged = simulateHud({ frames: 600, changeAt: -1, before: snapshot, after: snapshot });
  assert.equal(unchanged.stats.renders, 1);
  assert.equal(unchanged.stats.reads, 100);
  assert.equal(unchanged.stats.skippedUnchanged, 99);
  assert.equal(unchanged.stats.planeUpdates, 3);

  const harness = createKpiImpactHudHarness({ snapshot });
  const statuses = [0, 1, 2, 3, 4, 5].map((tick) => harness.hud.update(tick));
  assert.deepEqual(statuses, [
    'RENDERED',
    'SKIPPED_THROTTLED',
    'SKIPPED_THROTTLED',
    'SKIPPED_THROTTLED',
    'SKIPPED_THROTTLED',
    'SKIPPED_THROTTLED',
  ]);
  assert.equal(harness.reads.length, 1);
  assert.equal(harness.hud.update(6), 'SKIPPED_UNCHANGED');
  assert.equal(harness.reads.length, 2);
  harness.hud.dispose();
});

test('214 the HUD writes only the plane whose text changed', () => {
  const base = revenueUpRatingDown().read();
  const harness = createKpiImpactHudHarness({ snapshot: impactSnapshot({ read: base }) });
  assert.equal(harness.hud.update(0), 'RENDERED');
  assert.equal(harness.stats().planeUpdates, 3);
  // A new projected view with the same service consequence but a new mission result.
  const settled = completedMissionSettlement();
  const next = impactSnapshot({
    read: base,
    mission: missionResultFromSettlement(settled.settlement),
  });
  harness.setSnapshot({ ...next, tick: next.tick });
  assert.equal(harness.hud.update(6), 'SKIPPED_UNCHANGED');
  const failed = impactSnapshot({
    read: base,
    mission: {
      state: 'FAILED',
      missionId: 'campaign-1-first-taxi',
      attempt: 2,
      xpGranted: 0,
      duplicateXp: 0,
    },
  });
  harness.setSnapshot(failed);
  assert.equal(harness.hud.update(12), 'RENDERED');
  assert.equal(harness.stats().planeUpdates, 4);
  assert.equal(harness.stats().renders, 2);
  harness.hud.dispose();
});

test('214 the HUD exposes the three planes and their states as attributes without XP loss', () => {
  const harness = createKpiImpactHudHarness({
    snapshot: impactSnapshot({ read: bothDown().read() }),
  });
  harness.hud.update(0);
  const root = harness.root();
  assert.equal(root.getAttribute('data-version'), KPI_IMPACT_UI_VERSION);
  assert.equal(root.getAttribute('data-planes'), '3');
  assert.equal(root.getAttribute('data-has-xp-loss'), 'false');
  assert.equal(root.getAttribute('data-history-rebuilds'), '0');
  assert.equal(root.getAttribute('data-revenue-direction'), 'DOWN');
  assert.equal(root.getAttribute('data-rating-direction'), 'DOWN');
  assert.equal(root.getAttribute('data-incident-state'), 'INCREASED');
  assert.equal(root.getAttribute('data-mission-state'), 'COMPLETED');
  assert.equal(root.getAttribute('data-empty'), 'false');
  for (const key of ['MISSION', 'FIDELITY', 'SERVICE'] as const) {
    const plane = harness.plane(key);
    assert.equal(plane.getAttribute('data-no-xp-loss'), 'true');
    const text = plane.textContent.toLowerCase();
    for (const fragment of KPI_IMPACT_FORBIDDEN_FRAGMENTS)
      assert.equal(text.includes(fragment), false, `${fragment} in ${key}`);
  }
  assert.ok(harness.details('SERVICE').length > 0);
  for (const line of harness.details('SERVICE'))
    for (const fragment of KPI_IMPACT_FORBIDDEN_FRAGMENTS)
      assert.equal(line.toLowerCase().includes(fragment), false);
  harness.hud.dispose();
});

test('214 a hidden HUD reads nothing and refresh stays bounded', () => {
  const snapshot = impactSnapshot({ read: steady().read() });
  const hidden = createKpiImpactHudHarness({ snapshot, visible: false });
  assert.equal(hidden.hud.update(0), 'SKIPPED_HIDDEN');
  assert.equal(hidden.stats().reads, 0);
  hidden.hud.show();
  assert.equal(hidden.hud.update(0), 'RENDERED');
  assert.equal(hidden.stats().reads, 1);
  hidden.hud.hide();
  assert.equal(hidden.hud.update(6), 'SKIPPED_HIDDEN');
  assert.equal(hidden.stats().reads, 1);
  hidden.hud.dispose();

  const harness = createKpiImpactHudHarness({ snapshot });
  assert.equal(harness.hud.update(0), 'RENDERED');
  assert.equal(harness.hud.update(1), 'SKIPPED_THROTTLED');
  assert.equal(harness.hud.refresh(1), 'SKIPPED_UNCHANGED');
  assert.equal(harness.stats().forcedReads, 1);
  assert.equal(harness.stats().reads, 2);
  harness.hud.dispose();
  assert.equal(harness.hud.getStats().disposed, true);
});

test('214 an empty host read hides the HUD instead of inventing a consequence', () => {
  const harness = createKpiImpactHudHarness({ snapshot: null });
  assert.equal(harness.hud.update(0), 'SKIPPED_EMPTY');
  assert.equal(harness.stats().skippedEmpty, 1);
  assert.equal(harness.root().getAttribute('hidden'), '');
  harness.setSnapshot(impactSnapshot({ read: revenueUpRatingDown().read() }));
  assert.equal(harness.hud.update(6), 'RENDERED');
  assert.equal(harness.root().getAttribute('hidden'), null);
  harness.hud.dispose();
});

test('214 a real incident keeps the mission plane and the service plane distinct', () => {
  const scenario = revenueUpRatingDown();
  const incident = realFailedRide(scenario.tick - 60, 'ride:214:ui-incident');
  try {
    scenario.kpi.applySettlement(incident.settlement);
    scenario.kpi.applyReview(incident.review);
    const read = scenario.read();
    const view = impactView({
      read,
      mission: {
        state: 'FAILED',
        missionId: 'campaign-1-first-taxi',
        attempt: 2,
        xpGranted: 0,
        duplicateXp: 0,
      },
    });
    assert.match(view.mission.text, /0 XP/);
    assert.match(view.service.text, /1 \(incidente în creștere\)/);
    assert.match(view.service.text, /Review-uri cu nota 2 sau mai mică: 2/);
    assert.ok(!view.service.text.includes('XP'));
    assert.equal(assertNoXpLossMessages(view), true);
  } finally {
    incident.dispose();
  }
});

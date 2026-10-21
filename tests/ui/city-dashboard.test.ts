import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  createCityCollisionLog,
  createCityDashboardFocusPort,
  readCityDashboardSnapshot,
} from '../../src/app';
import {
  CITY_DASHBOARD_LIMITS,
  CITY_DASHBOARD_VERSION,
  CITY_METRIC_IDS,
  parseCityDashboardSnapshot,
  selectIncident,
} from '../../src/ui';
import type { CityDashboardSnapshot } from '../../src/ui';
import { runCityDashboardReport } from '../app/city-dashboard-report';
import { createCityDashboardWorld } from '../app/city-dashboard-world';
import {
  byClass,
  cityPosition,
  cityIncident,
  cityMetric,
  citySnapshot,
  createCityDashboardHarness,
  sevenMetricSnapshot,
} from './city-dashboard-fixture';

function exposureValues(harness: ReturnType<typeof createCityDashboardHarness>): string[] {
  const grid = byClass(harness.exposure(), 'city-dashboard__exposure-grid');
  if (grid === null) throw new Error('Exposure grid is missing');
  return grid.children.filter((child) => child.tagName === 'dd').map((child) => child.textContent);
}

function drilldownPart(
  harness: ReturnType<typeof createCityDashboardHarness>,
  className: string,
): string {
  const node = byClass(harness.drilldown(), className);
  if (node === null) throw new Error(`Drilldown part is missing: ${className}`);
  return node.textContent ?? '';
}

test('082 parser rejects malformed frames and normalizes the incident order', () => {
  const valid = sevenMetricSnapshot();
  assert.equal(parseCityDashboardSnapshot(valid).version, CITY_DASHBOARD_VERSION);
  assert.equal(parseCityDashboardSnapshot(valid).metrics.length, CITY_METRIC_IDS.length);
  assert.throws(
    () => parseCityDashboardSnapshot({ ...valid, version: '075-fleet-panel-v1' }),
    /contract/,
  );
  assert.throws(() => parseCityDashboardSnapshot({ ...valid, units: 'IMPERIAL' }), /contract/);
  assert.throws(() => parseCityDashboardSnapshot({ ...valid, tick: -1 }), /tick/);
  assert.throws(() => parseCityDashboardSnapshot({ ...valid, tick: 1.5 }), /tick/);
  assert.throws(() => parseCityDashboardSnapshot({ ...valid, extra: true }), /fields/);
  assert.throws(
    () => parseCityDashboardSnapshot({ ...valid, sessionId: ' '.repeat(2) }),
    /session identity/,
  );
  assert.throws(
    () =>
      parseCityDashboardSnapshot({
        ...valid,
        metrics: [cityMetric({ state: 'UNAVAILABLE', value: 7, reason: 'NO_EXPOSURE' })],
      }),
    /must not carry a value/,
  );
  assert.throws(
    () =>
      parseCityDashboardSnapshot({
        ...valid,
        metrics: [cityMetric({ state: 'AVAILABLE', value: null, reason: null })],
      }),
    /must be finite/,
  );
  assert.throws(
    () =>
      parseCityDashboardSnapshot({
        ...valid,
        metrics: [
          cityMetric({
            id: 'violations',
            label: 'Încălcări',
            unit: 'count',
            value: 1,
            sampleSize: 1,
          }),
          cityMetric({
            id: 'violations',
            label: 'Încălcări',
            unit: 'count',
            value: 2,
            sampleSize: 2,
          }),
        ],
      }),
    /duplicate metric/,
  );
  assert.throws(
    () =>
      parseCityDashboardSnapshot({
        ...valid,
        metrics: [cityMetric({ id: 'unknownMetric' as never })],
      }),
    /choice/,
  );
  assert.throws(
    () =>
      parseCityDashboardSnapshot({
        ...valid,
        metrics: [cityMetric({ id: 'comfortScore', label: 'Confort', unit: 'count' })],
      }),
    /unit does not match/,
  );
  assert.throws(
    () =>
      parseCityDashboardSnapshot({
        ...valid,
        exposure: {
          state: 'UNAVAILABLE',
          windows: 0,
          observations: null,
          durationSeconds: null,
          reason: 'NO_EXPOSURE',
        },
      }),
    /must not carry a value/,
  );
  assert.throws(
    () =>
      parseCityDashboardSnapshot({
        ...valid,
        incidents: [cityIncident({ positionM: { x: Number.NaN, y: 0, z: 0 } })],
      }),
    /position x must be finite/,
  );
  const ordered = parseCityDashboardSnapshot({
    ...valid,
    incidents: [
      cityIncident({ incidentId: 'incident:b', tick: 10 }),
      cityIncident({ incidentId: 'incident:z', tick: 12 }),
      cityIncident({ incidentId: 'incident:a', tick: 12 }),
    ],
  });
  assert.deepEqual(
    ordered.incidents.map((incident) => incident.incidentId),
    ['incident:a', 'incident:z', 'incident:b'],
  );
});

test('082 unavailable metrics stay distinct from a real zero in the DOM', () => {
  const harness = createCityDashboardHarness();
  harness.panel.update(sevenMetricSnapshot(), 0);
  const collisions = harness.metric('collisions'),
    violations = harness.metric('violations'),
    comfort = harness.metric('comfortScore'),
    average = harness.metric('averageRideSeconds'),
    distance = harness.metric('totalDistanceM');
  assert.equal(collisions.getAttribute('data-state'), 'AVAILABLE');
  assert.equal(collisions.children[1]?.textContent, '0');
  assert.equal(collisions.getAttribute('data-reason'), '');
  assert.equal(violations.getAttribute('data-state'), 'UNAVAILABLE');
  assert.equal(violations.children[1]?.textContent, 'Indisponibil');
  assert.equal(violations.children[3]?.textContent, 'Sursă lipsă');
  assert.equal(violations.getAttribute('data-reason'), 'SOURCE_MISSING');
  assert.equal(comfort.getAttribute('data-state'), 'UNAVAILABLE');
  assert.equal(comfort.children[3]?.textContent, 'Necertificat');
  assert.equal(average.children[1]?.textContent, '1 min 31 s');
  assert.equal(distance.children[1]?.textContent, '1240 m');
  assert.match(harness.status().textContent ?? '', /5 din 7 indicatori disponibili/);
  harness.panel.dispose();
});

test('082 a scenario without exposure reports Indisponibil, not zero', () => {
  const harness = createCityDashboardHarness();
  harness.panel.update(citySnapshot(), 0);
  const completed = harness.metric('completedRides'),
    average = harness.metric('averageRideSeconds');
  assert.equal(completed.getAttribute('data-state'), 'AVAILABLE');
  assert.equal(completed.children[1]?.textContent, '0');
  assert.equal(average.getAttribute('data-state'), 'UNAVAILABLE');
  assert.equal(average.children[1]?.textContent, 'Indisponibil');
  assert.equal(average.children[3]?.textContent, 'Fără expunere');
  assert.equal(harness.exposure().getAttribute('data-state'), 'AVAILABLE');
  assert.deepEqual(exposureValues(harness), ['0', '0', '0 s']);
  harness.panel.dispose();
});

test('082 selecting a located incident emits exactly one focus intention', () => {
  const harness = createCityDashboardHarness(),
    incident = cityIncident();
  harness.panel.update(citySnapshot({ incidents: Object.freeze([incident]) }), 0);
  const button = harness.incidentButton(incident.incidentId);
  assert.equal(harness.focuses.length, 0);
  button.dispatch('click');
  assert.equal(harness.focuses.length, 1);
  assert.deepEqual(harness.focuses[0], {
    incidentId: incident.incidentId,
    positionM: cityPosition(1, 0, 2),
  });
  assert.equal(button.getAttribute('aria-selected'), 'true');
  assert.equal(harness.drilldown().getAttribute('data-status'), 'AVAILABLE');
  assert.equal(drilldownPart(harness, 'city-dashboard__drilldown-position'), 'x 1.0 m, z 2.0 m');
  assert.equal(harness.panel.getStats().focusEmits, 1);
  button.dispatch('click');
  assert.equal(harness.focuses.length, 1);
  harness.panel.dispose();
});

test('082 an incident without a position cannot be located and emits nothing', () => {
  const harness = createCityDashboardHarness(),
    incident = cityIncident({
      incidentId: 'blockage:082:1',
      kind: 'BLOCKAGE',
      positionM: null,
    }),
    snapshot = citySnapshot({ incidents: Object.freeze([incident]) });
  harness.panel.update(snapshot, 0);
  const button = harness.incidentButton(incident.incidentId);
  button.dispatch('click');
  assert.equal(harness.focuses.length, 0);
  assert.equal(harness.panel.getStats().focusSkipped, 1);
  assert.equal(harness.row(incident.incidentId).getAttribute('data-located'), 'false');
  assert.equal(
    drilldownPart(harness, 'city-dashboard__drilldown-position'),
    'Poziție indisponibilă',
  );
  assert.equal(harness.drilldown().getAttribute('data-status'), 'UNAVAILABLE');
  assert.equal(harness.drilldown().getAttribute('data-reason'), 'MISSING_POSITION');
  assert.equal(button.getAttribute('aria-selected'), 'true');
  const selection = selectIncident(parseCityDashboardSnapshot(snapshot), incident.incidentId);
  assert.equal(selection.focus.status, 'UNAVAILABLE');
  assert.deepEqual(selection.focus, { status: 'UNAVAILABLE', reason: 'MISSING_POSITION' });
  assert.equal(selection.row?.located, false);
  harness.panel.dispose();
});

test('082 selection never reads or writes a profile', () => {
  for (const file of [
    'src/ui/city-dashboard-format.ts',
    'src/ui/city-dashboard.ts',
    'src/app/city-dashboard.ts',
  ]) {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    assert.doesNotMatch(source, /from '[^']*profiles/, `${file} imports a profile module`);
    assert.doesNotMatch(source, /appliedProfileVersion|profileVersion|profilePanel/);
  }
  const calls: string[] = [],
    port = createCityDashboardFocusPort({
      focusMap: (positionM, incidentId) => {
        calls.push(`${incidentId}|${Object.keys(positionM).join(',')}`);
        return true;
      },
    });
  assert.equal(port('incident:082:1', cityPosition(3, 1, 4)), true);
  assert.deepEqual(calls, ['incident:082:1|x,y,z']);
  assert.equal(port('', cityPosition()), false);
  assert.equal(port('incident:082:1', { x: Number.NaN, y: 0, z: 0 }), false);
  assert.equal(calls.length, 1);
  const selection = selectIncident(
    parseCityDashboardSnapshot(citySnapshot({ incidents: Object.freeze([cityIncident()]) })),
    'collision:082:1',
  );
  assert.deepEqual(Object.keys(selection).sort(), ['drilldown', 'focus', 'incidentId', 'row']);
  assert.deepEqual(Object.keys(selection.focus).sort(), ['incidentId', 'positionM', 'status']);
});

test('082 incident rows keep a stable element per identity', () => {
  const harness = createCityDashboardHarness(),
    first = cityIncident({ incidentId: 'incident:first', tick: 30 }),
    second = cityIncident({ incidentId: 'incident:second', tick: 20 });
  harness.panel.update(citySnapshot({ incidents: Object.freeze([first, second]) }), 0);
  const firstRow = harness.row('incident:first'),
    secondRow = harness.row('incident:second');
  assert.equal(harness.rows().length, 2);
  assert.equal(harness.panel.getStats().createdRows, 2);
  harness.panel.update(
    citySnapshot({
      tick: 481,
      incidents: Object.freeze([first, { ...second, tick: 40 }]),
    }),
    2000,
  );
  assert.equal(harness.row('incident:first'), firstRow);
  assert.equal(harness.row('incident:second'), secondRow);
  assert.equal(harness.panel.getStats().createdRows, 2);
  assert.equal(harness.panel.getStats().moves, 1);
  assert.equal(harness.rows()[0]?.getAttribute('data-incident-id'), 'incident:second');
  harness.panel.update(
    citySnapshot({ tick: 482, incidents: Object.freeze([{ ...second, tick: 40 }]) }),
    4000,
  );
  assert.equal(harness.rows().length, 1);
  assert.equal(harness.panel.getStats().removedRows, 1);
  harness.panel.dispose();
});

test('082 duplicate incident ids are rejected', () => {
  const incident = cityIncident();
  assert.throws(
    () =>
      parseCityDashboardSnapshot(
        citySnapshot({ incidents: Object.freeze([incident, { ...incident, tick: 41 }]) }),
      ),
    /duplicate incident/,
  );
  assert.throws(
    () =>
      parseCityDashboardSnapshot({
        ...citySnapshot(),
        incidents: Array.from({ length: CITY_DASHBOARD_LIMITS.incidents + 1 }, (_, index) =>
          cityIncident({ incidentId: `incident:${index}`, tick: 1 }),
        ),
      }),
    /incident ceiling/,
  );
});

test('082 the 10 Hz ceiling is bypassed by a selection or a new incident', () => {
  const harness = createCityDashboardHarness(),
    base = sevenMetricSnapshot();
  harness.panel.update(base, 0);
  for (let index = 0; index < 60; index += 1) {
    const metrics = base.metrics.map((metric) =>
      metric.id === 'averageRideSeconds' ? { ...metric, value: 100 + index } : metric,
    );
    harness.panel.update(
      { ...base, tick: 481 + index, metrics: Object.freeze(metrics) },
      (index + 1) * 16,
    );
  }
  const throttled = harness.panel.getStats();
  assert.ok(throttled.updates <= 11, `${throttled.updates} writes for 60 frames`);
  assert.ok(throttled.skipped >= 45, `${throttled.skipped} skipped frames`);
  harness.panel.dispose();

  const fresh = createCityDashboardHarness();
  fresh.panel.update(base, 0);
  fresh.panel.update({ ...base, tick: 481, incidents: Object.freeze([cityIncident()]) }, 16);
  assert.equal(fresh.panel.getStats().updates, 2);
  assert.equal(fresh.panel.getStats().skipped, 0);
  fresh.panel.dispose();

  const selection = createCityDashboardHarness(),
    incident = cityIncident();
  selection.panel.update(citySnapshot({ incidents: Object.freeze([incident]) }), 0);
  selection.incidentButton(incident.incidentId).dispatch('click');
  assert.equal(selection.incidentButton(incident.incidentId).getAttribute('aria-selected'), 'true');
  assert.equal(selection.focuses.length, 1);
  selection.panel.dispose();
});

test('082 an identical frame writes nothing', () => {
  const harness = createCityDashboardHarness(),
    base = sevenMetricSnapshot();
  harness.panel.update(base, 0);
  const writes = harness.panel.getStats().writes,
    dom = harness.dom();
  harness.panel.update(base, 500);
  assert.equal(harness.panel.getStats().writes, writes);
  assert.equal(harness.panel.getStats().skipped, 1);
  assert.equal(harness.dom(), dom);
  harness.panel.dispose();
});

test('082 malformed and stale frames never touch the DOM', () => {
  const harness = createCityDashboardHarness(),
    base = sevenMetricSnapshot();
  harness.panel.update(base, 0);
  harness.panel.update({ ...base, tick: 481 }, 100);
  const dom = harness.dom(),
    writes = harness.panel.getStats().writes;
  assert.throws(() => harness.panel.update({ ...base, tick: 480 }, 200), /Stale/);
  assert.throws(
    () =>
      harness.panel.update(
        { ...base, tick: 482, extra: true } as unknown as CityDashboardSnapshot,
        200,
      ),
    /fields/,
  );
  assert.throws(() => harness.panel.update({ ...base, tick: 482 }, 50), /clock/);
  assert.throws(
    () =>
      harness.panel.update(
        citySnapshot({ metrics: [cityMetric({ state: 'UNAVAILABLE', value: 4 })] }),
        300,
      ),
    /must not carry a value/,
  );
  assert.equal(harness.dom(), dom);
  assert.equal(harness.panel.getStats().writes, writes);
  harness.panel.dispose();
});

test('082 dispose is idempotent and releases every node and listener', () => {
  const harness = createCityDashboardHarness(),
    base = citySnapshot({ incidents: Object.freeze([cityIncident()]) });
  harness.panel.update(base, 0);
  assert.ok(harness.panel.getStats().listeners > 0);
  harness.panel.dispose();
  harness.panel.dispose();
  const stats = harness.panel.getStats();
  assert.equal(stats.disposed, true);
  assert.equal(stats.listeners, 0);
  assert.equal(stats.retainedRows, 0);
  assert.equal(harness.host.children.length, 0);
  assert.equal(harness.panel.getView(), null);
  assert.throws(() => harness.panel.update(base, 100), /disposed/);
  assert.throws(() => harness.panel.select('incident:082:1'), /disposed/);
});

test('082 aggregates the real 061/028/065 sources', () => {
  const world = createCityDashboardWorld();
  try {
    const snapshot = readCityDashboardSnapshot(
        {
          context: world.context,
          lifecycle: world.health.scenario.lifecycle,
          health: world.health.scenario.health,
          collisions: world.collisionLog,
          positions: world.positions,
        },
        { tick: 70, selectedIncidentId: null },
      ),
      byId = new Map(snapshot.metrics.map((metric) => [metric.id, metric])),
      ride = world.completedRide;
    assert.ok(ride !== null);
    assert.equal(byId.get('completedRides')?.state, 'AVAILABLE');
    assert.equal(byId.get('completedRides')?.value, 1);
    assert.equal(byId.get('averageRideSeconds')?.value, ride.totalCostSeconds);
    assert.equal(byId.get('averageRideSeconds')?.sampleSize, 1);
    assert.equal(byId.get('collisions')?.value, 1);
    assert.equal(byId.get('blockages')?.value, 1);
    assert.equal(snapshot.exposure.state, 'AVAILABLE');
    assert.equal(snapshot.exposure.windows, 2);
    assert.equal(snapshot.exposure.observations, 1);
    assert.equal(snapshot.exposure.durationSeconds, ride.totalCostSeconds);
    assert.equal(snapshot.incidents.length, 2);
    const collision = snapshot.incidents.find((incident) => incident.kind === 'COLLISION'),
      blockage = snapshot.incidents.find((incident) => incident.kind === 'BLOCKAGE'),
      failedRide = world.health.scenario.lifecycle
        .terminal()
        .find((entry) => entry.state === 'FAILED');
    assert.ok(collision !== undefined && blockage !== undefined);
    assert.equal(collision.vehicleId, world.collisionVehicleId);
    assert.equal(collision.tick, 65);
    assert.deepEqual(collision.positionM, { x: 12, y: 0, z: -4 });
    assert.equal(blockage.vehicleId, world.blockedTaxiId);
    assert.equal(blockage.rideId, failedRide?.rideId);
    assert.equal(blockage.positionM, null);
    const parsed = parseCityDashboardSnapshot(snapshot);
    assert.equal(parsed.incidents[0]?.kind, 'COLLISION');
    assert.equal(parsed.incidents[1]?.kind, 'BLOCKAGE');
    const harness = createCityDashboardHarness();
    harness.panel.update(snapshot, 0);
    harness.incidentButton(collision.incidentId).dispatch('click');
    assert.deepEqual(harness.focuses[0], {
      incidentId: collision.incidentId,
      positionM: cityPosition(12, 0, -4),
    });
    harness.panel.dispose();
  } finally {
    world.dispose();
  }
});

test('082 missing 137 metrics stay unavailable and are never zero', () => {
  const world = createCityDashboardWorld({ collision: false });
  try {
    const snapshot = readCityDashboardSnapshot(
        {
          context: world.context,
          lifecycle: world.health.scenario.lifecycle,
          health: world.health.scenario.health,
        },
        { tick: 70, selectedIncidentId: null },
      ),
      byId = new Map(snapshot.metrics.map((metric) => [metric.id, metric]));
    for (const id of ['violations', 'comfortScore', 'collisions', 'totalDistanceM'] as const) {
      assert.equal(byId.get(id)?.state, 'UNAVAILABLE', id);
      assert.equal(byId.get(id)?.value, null, id);
      assert.equal(byId.get(id)?.reason, 'SOURCE_MISSING', id);
    }
    assert.equal(byId.get('completedRides')?.state, 'AVAILABLE');
    const harness = createCityDashboardHarness();
    harness.panel.update(snapshot, 0);
    assert.equal(harness.metric('violations').children[1]?.textContent, 'Indisponibil');
    assert.equal(harness.metric('comfortScore').children[1]?.textContent, 'Indisponibil');
    harness.panel.dispose();
  } finally {
    world.dispose();
  }
});

test('082 exposure distinguishes an unreadable window from a real zero', () => {
  const world = createCityDashboardWorld({
    assign: 1,
    completeRide: false,
    blockTaxi: false,
    collision: false,
  });
  try {
    const base = {
        context: world.context,
        lifecycle: world.health.scenario.lifecycle,
        health: world.health.scenario.health,
      },
      empty = createCityCollisionLog(),
      zero = readCityDashboardSnapshot(base, { tick: 70, selectedIncidentId: null }),
      missing = readCityDashboardSnapshot(
        { ...base, exposure: { exposure: () => null } },
        { tick: 70, selectedIncidentId: null },
      ),
      provided = readCityDashboardSnapshot(
        {
          ...base,
          exposure: { exposure: () => ({ windows: 3, observations: 2, durationSeconds: 120 }) },
        },
        { tick: 70, selectedIncidentId: null },
      );
    assert.equal(zero.exposure.state, 'AVAILABLE');
    assert.equal(zero.exposure.windows, 0);
    assert.equal(zero.exposure.observations, 0);
    assert.equal(zero.exposure.durationSeconds, 0);
    assert.equal(missing.exposure.state, 'UNAVAILABLE');
    assert.equal(missing.exposure.reason, 'SOURCE_MISSING');
    assert.equal(missing.exposure.windows, null);
    assert.equal(provided.exposure.state, 'AVAILABLE');
    assert.equal(provided.exposure.windows, 3);
    assert.equal(provided.exposure.durationSeconds, 120);
    assert.equal(
      zero.metrics.find((metric) => metric.id === 'averageRideSeconds')?.reason,
      'NO_EXPOSURE',
    );
    empty.dispose();
  } finally {
    world.dispose();
  }
});

test('082 committed evidence report is the current deterministic transcript', () => {
  const report = runCityDashboardReport(),
    saved = readFileSync(
      join(process.cwd(), 'Docs', 'Evidence', '082-city-dashboard', 'report.json'),
      'utf8',
    );
  assert.equal(report.scenarios.length, 7);
  assert.ok(report.checks.length >= 25, `${report.checks.length} checks`);
  assert.equal(report.summary.pass, true);
  assert.equal(saved, `${JSON.stringify(report, null, 2)}\n`);
});

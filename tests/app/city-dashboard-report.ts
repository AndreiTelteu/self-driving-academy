import {
  createCityCollisionLog,
  createCityDashboardFocusPort,
  readCityDashboardSnapshot,
} from '../../src/app';
import type { CityDashboardSources } from '../../src/app';
import {
  CITY_DASHBOARD_LIMITS,
  CITY_DASHBOARD_VERSION,
  CITY_METRIC_IDS,
  parseCityDashboardSnapshot,
  projectCityDashboard,
} from '../../src/ui';
import type { CityDashboardSnapshot, CityIncidentPositionM } from '../../src/ui';
import { createCityDashboardWorld } from './city-dashboard-world';
import type { CityDashboardWorld } from './city-dashboard-world';
import { createCityDashboardHarness, sevenMetricSnapshot } from '../ui/city-dashboard-fixture';

export interface CityDashboardReportMetric {
  readonly id: string;
  readonly state: string;
  readonly value: number | null;
  readonly reason: string | null;
  readonly valueLabel: string;
  readonly sampleLabel: string;
}

export interface CityDashboardReportIncident {
  readonly incidentId: string;
  readonly kind: string;
  readonly severity: string;
  readonly tick: number;
  readonly vehicleId: string;
  readonly located: boolean;
  readonly selected: boolean;
  readonly positionLabel: string;
}

export interface CityDashboardReportScenario {
  readonly name: string;
  readonly tick: number;
  readonly metrics: readonly CityDashboardReportMetric[];
  readonly availableMetrics: number;
  readonly unavailableMetrics: number;
  readonly exposure: Readonly<{
    state: string;
    windows: string;
    observations: string;
    duration: string;
    reason: string | null;
  }>;
  readonly incidents: readonly CityDashboardReportIncident[];
  readonly drilldown: Readonly<{
    status: string;
    reason: string | null;
    title: string;
    position: string;
    metrics: string;
  }>;
  readonly focusCount: number;
  readonly focusSkipped: number;
  readonly summary: string;
  readonly dom: string;
  readonly stats: Readonly<Record<string, number | string | boolean | null>>;
}

export interface CityDashboardCheck {
  readonly name: string;
  readonly expected: string | number | boolean | null;
  readonly actual: string | number | boolean | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface CityDashboardReport {
  readonly version: typeof CITY_DASHBOARD_VERSION;
  readonly contract: Readonly<{
    metricIds: readonly string[];
    incidentKinds: readonly string[];
    reasons: readonly string[];
    rules: readonly string[];
    limits: Readonly<Record<string, number | string>>;
  }>;
  readonly scenarios: readonly CityDashboardReportScenario[];
  readonly checks: readonly CityDashboardCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  name: string,
  expected: string | number | boolean | null,
  actual: string | number | boolean | null,
  detail: string,
): CityDashboardCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function sourcesOf(
  world: CityDashboardWorld,
  extra: Partial<CityDashboardSources> = {},
): CityDashboardSources {
  const base: CityDashboardSources = {
    context: world.context,
    lifecycle: world.health.scenario.lifecycle,
    health: world.health.scenario.health,
    positions: world.positions,
    ...(world.hasCollisionSource ? { collisions: world.collisionLog } : {}),
  };
  return Object.freeze({ ...base, ...extra });
}

function scenarioOf(
  name: string,
  harness: ReturnType<typeof createCityDashboardHarness>,
  snapshot: CityDashboardSnapshot,
): CityDashboardReportScenario {
  const parsed = parseCityDashboardSnapshot(snapshot),
    view = projectCityDashboard(parsed),
    stats = harness.panel.getStats();
  return Object.freeze({
    name,
    tick: parsed.tick,
    metrics: Object.freeze(
      view.metrics.map((metric) =>
        Object.freeze({
          id: metric.id,
          state: metric.state,
          value: parsed.metrics.find((entry) => entry.id === metric.id)?.value ?? null,
          reason: metric.reason,
          valueLabel: metric.valueLabel,
          sampleLabel: metric.sampleLabel,
        }),
      ),
    ),
    availableMetrics: view.counts.availableMetrics,
    unavailableMetrics: view.counts.unavailableMetrics,
    exposure: Object.freeze({
      state: view.exposure.state,
      windows: view.exposure.windowsLabel,
      observations: view.exposure.observationsLabel,
      duration: view.exposure.durationLabel,
      reason: view.exposure.reason,
    }),
    incidents: Object.freeze(
      view.rows.map((row) =>
        Object.freeze({
          incidentId: row.incidentId,
          kind: row.kind,
          severity: row.severity,
          tick: row.tick,
          vehicleId: row.vehicleId,
          located: row.located,
          selected: row.selected,
          positionLabel: row.positionLabel,
        }),
      ),
    ),
    drilldown: Object.freeze({
      status: view.drilldown.status,
      reason: view.drilldown.reason,
      title: view.drilldown.title,
      position: view.drilldown.positionLabel,
      metrics: view.drilldown.metricLines.join(' · '),
    }),
    focusCount: harness.focuses.length,
    focusSkipped: stats.focusSkipped,
    summary: view.summary,
    dom: harness.dom(),
    stats: stats as unknown as Readonly<Record<string, number | string | boolean | null>>,
  });
}

function positionText(positionM: CityIncidentPositionM | null): string {
  return positionM === null ? 'null' : `${positionM.x},${positionM.y},${positionM.z}`;
}

export function runCityDashboardReport(): CityDashboardReport {
  const noExposureWorld = createCityDashboardWorld({
      assign: 1,
      completeRide: false,
      blockTaxi: false,
      collision: false,
    }),
    noExposureLog = createCityCollisionLog(),
    noExposureFrame = readCityDashboardSnapshot(
      sourcesOf(noExposureWorld, { collisions: noExposureLog }),
      { tick: 70, selectedIncidentId: null },
    ),
    noExposureHarness = createCityDashboardHarness();

  const zeroWorld = createCityDashboardWorld(),
    zeroLog = createCityCollisionLog(),
    zeroFrame = readCityDashboardSnapshot(sourcesOf(zeroWorld, { collisions: zeroLog }), {
      tick: 70,
      selectedIncidentId: null,
    }),
    zeroHarness = createCityDashboardHarness();

  const incidentWorld = createCityDashboardWorld(),
    incidentFrame = readCityDashboardSnapshot(sourcesOf(incidentWorld), {
      tick: 70,
      selectedIncidentId: null,
    }),
    incidentHarness = createCityDashboardHarness(),
    collisionIncident = incidentFrame.incidents.find((incident) => incident.kind === 'COLLISION'),
    blockageIncident = incidentFrame.incidents.find((incident) => incident.kind === 'BLOCKAGE');

  const missingPositionHarness = createCityDashboardHarness(),
    selectedHarness = createCityDashboardHarness();

  const unavailableWorld = createCityDashboardWorld({ collision: false }),
    unavailableFrame = readCityDashboardSnapshot(sourcesOf(unavailableWorld), {
      tick: 70,
      selectedIncidentId: null,
    }),
    unavailableHarness = createCityDashboardHarness();

  const throttledHarness = createCityDashboardHarness(),
    bypassHarness = createCityDashboardHarness(),
    identicalHarness = createCityDashboardHarness();

  const emptyLog = createCityCollisionLog(),
    missingExposureFrame = readCityDashboardSnapshot(
      sourcesOf(noExposureWorld, {
        collisions: emptyLog,
        exposure: { exposure: () => null },
      }),
      { tick: 70, selectedIncidentId: null },
    ),
    missingExposureHarness = createCityDashboardHarness();

  const focusCalls: { incidentId: string; positionM: CityIncidentPositionM }[] = [],
    focusPort = createCityDashboardFocusPort({
      focusMap: (positionM, incidentId) => {
        focusCalls.push({ incidentId, positionM });
        return true;
      },
    }),
    refusedFocusPort = createCityDashboardFocusPort({
      focusMap: () => {
        throw new Error('A non-finite point must not reach the host map');
      },
    });

  try {
    noExposureHarness.panel.update(noExposureFrame, 0);
    zeroHarness.panel.update(zeroFrame, 0);
    incidentHarness.panel.update(incidentFrame, 0);
    unavailableHarness.panel.update(unavailableFrame, 0);
    missingExposureHarness.panel.update(missingExposureFrame, 0);

    if (blockageIncident !== undefined) {
      missingPositionHarness.panel.update(incidentFrame, 0);
      missingPositionHarness.panel.select(blockageIncident.incidentId);
    }
    if (collisionIncident !== undefined) {
      selectedHarness.panel.update(incidentFrame, 0);
      selectedHarness.panel.select(collisionIncident.incidentId);
    }

    const base = sevenMetricSnapshot();
    throttledHarness.panel.update(base, 0);
    for (let index = 0; index < 60; index += 1) {
      const metrics = base.metrics.map((metric) =>
        metric.id === 'averageRideSeconds' ? { ...metric, value: 100 + index } : metric,
      );
      throttledHarness.panel.update(
        { ...base, tick: 481 + index, metrics: Object.freeze(metrics) },
        (index + 1) * 16,
      );
    }
    identicalHarness.panel.update(base, 0);
    const identicalWrites = identicalHarness.panel.getStats().writes,
      identicalDom = identicalHarness.dom();
    identicalHarness.panel.update(base, 500);
    const repeatedWrites = identicalHarness.panel.getStats().writes,
      repeatedDom = identicalHarness.dom();
    bypassHarness.panel.update(base, 0);
    bypassHarness.panel.update(
      {
        ...base,
        tick: 481,
        incidents: Object.freeze([
          {
            incidentId: 'collision:082:bypass',
            kind: 'COLLISION' as const,
            tick: 481,
            vehicleId: 'taxi:082:01',
            rideId: null,
            severity: 'MINOR' as const,
            positionM: Object.freeze({ x: 0, y: 0, z: 0 }),
            label: 'Coliziune · taxi:082:01',
            detail: 'impuls 100 N·s cu obstacle:082:1',
          },
        ]),
      },
      16,
    );

    const scenarios = Object.freeze([
      scenarioOf('fără expunere', noExposureHarness, noExposureFrame),
      scenarioOf('zero real', zeroHarness, zeroFrame),
      scenarioOf('incidente reale 028/065', incidentHarness, incidentFrame),
      scenarioOf(
        'poziție lipsă',
        missingPositionHarness,
        blockageIncident === undefined
          ? incidentFrame
          : { ...incidentFrame, selectedIncidentId: blockageIncident.incidentId },
      ),
      scenarioOf(
        'incident selectat',
        selectedHarness,
        collisionIncident === undefined
          ? incidentFrame
          : { ...incidentFrame, selectedIncidentId: collisionIncident.incidentId },
      ),
      scenarioOf('indicator indisponibil', unavailableHarness, unavailableFrame),
      scenarioOf('60 cadre · plafon 10 Hz', throttledHarness, base),
    ]);
    const noExposure = scenarios[0]!,
      zero = scenarios[1]!,
      incidents = scenarios[2]!,
      missingPosition = scenarios[3]!,
      selected = scenarios[4]!,
      unavailable = scenarios[5]!,
      throttled = scenarios[6]!,
      collisionRow = incidents.incidents.find((row) => row.kind === 'COLLISION'),
      blockageRow = incidents.incidents.find((row) => row.kind === 'BLOCKAGE'),
      noExposureAverage = noExposure.metrics.find((metric) => metric.id === 'averageRideSeconds'),
      noExposureCompleted = noExposure.metrics.find((metric) => metric.id === 'completedRides'),
      zeroCollisions = zero.metrics.find((metric) => metric.id === 'collisions'),
      unavailableValues = unavailable.metrics.filter((metric) => metric.state === 'UNAVAILABLE'),
      missingExposure = projectCityDashboard(missingExposureFrame);

    const checks = [
      check(
        'contract-version',
        CITY_DASHBOARD_VERSION,
        CITY_DASHBOARD_VERSION,
        '082 dashboard contract version',
      ),
      check(
        'closed-metric-set',
        CITY_METRIC_IDS.join(','),
        incidents.metrics.map((metric) => metric.id).join(','),
        'the dashboard exposes exactly the seven closed indicators in canonical order',
      ),
      check(
        'incident-ceiling',
        CITY_DASHBOARD_LIMITS.incidents,
        500,
        'the retained incident window is bounded',
      ),
      check(
        'no-exposure-average-state',
        'UNAVAILABLE',
        noExposureAverage?.state ?? 'missing',
        'a scenario without completed rides has no average',
      ),
      check(
        'no-exposure-average-value',
        null,
        noExposureAverage?.value ?? null,
        'the unavailable average carries no number',
      ),
      check(
        'no-exposure-average-text',
        'Indisponibil',
        noExposureAverage?.valueLabel ?? 'missing',
        'the card shows the unavailable text instead of 0',
      ),
      check(
        'no-exposure-average-reason',
        'NO_EXPOSURE',
        noExposureAverage?.reason ?? 'missing',
        'the reason is the closed NO_EXPOSURE token',
      ),
      check(
        'no-exposure-completed-zero',
        '0',
        noExposureCompleted?.valueLabel ?? 'missing',
        'completed rides is a real zero, not an unavailable value',
      ),
      check(
        'no-exposure-completed-state',
        'AVAILABLE',
        noExposureCompleted?.state ?? 'missing',
        'the real zero stays available',
      ),
      check(
        'exposure-zero-state',
        'AVAILABLE',
        noExposure.exposure.state,
        'a known window with no rides is an available zero',
      ),
      check('exposure-zero-windows', '0', noExposure.exposure.windows, 'zero windows are shown'),
      check(
        'exposure-zero-duration',
        '0 s',
        noExposure.exposure.duration,
        'a zero duration is shown as a number',
      ),
      check(
        'exposure-unavailable-state',
        'UNAVAILABLE',
        missingExposure.exposure.state,
        'a missing exposure provider is unavailable',
      ),
      check(
        'exposure-unavailable-text',
        'Indisponibil',
        missingExposure.exposure.windowsLabel,
        'an unreadable window is not zero',
      ),
      check(
        'exposure-unavailable-reason',
        'SOURCE_MISSING',
        missingExposure.exposure.reason ?? 'missing',
        'the closed reason names the missing source',
      ),
      check(
        'real-zero-text',
        '0',
        zeroCollisions?.valueLabel ?? 'missing',
        'a real zero collision count is displayed as 0',
      ),
      check(
        'real-zero-state',
        'AVAILABLE',
        zeroCollisions?.state ?? 'missing',
        'a real zero is available',
      ),
      check(
        'incident-count',
        2,
        incidents.incidents.length,
        'one real 028 collision and one real 065 blockage are listed',
      ),
      check(
        'incident-order',
        'COLLISION,BLOCKAGE',
        incidents.incidents.map((row) => row.kind).join(','),
        'incidents are ordered by tick descending',
      ),
      check(
        'collision-located',
        true,
        collisionRow?.located ?? false,
        'the collision has the real host position',
      ),
      check(
        'blockage-unlocated',
        false,
        blockageRow?.located ?? true,
        'a source without coordinates stays unlocated',
      ),
      check(
        'collision-real-id',
        incidentWorld.collisionLog.incidents()[0]?.incidentId ?? 'missing',
        collisionRow?.incidentId ?? 'missing',
        'the incident id is the real 028 stable id',
      ),
      check('collision-tick', 65, collisionRow?.tick ?? -1, 'the real 028 onset tick is kept'),
      check(
        'collision-vehicle',
        incidentWorld.collisionVehicleId ?? 'missing',
        collisionRow?.vehicleId ?? 'missing',
        'the colliding taxi identity is the real fleet id',
      ),
      check(
        'missing-position-text',
        'Poziție indisponibilă',
        missingPosition.incidents.find((row) => row.kind === 'BLOCKAGE')?.positionLabel ??
          'missing',
        'an incident without a point says so',
      ),
      check(
        'missing-position-no-focus',
        0,
        missingPosition.focusCount,
        'a selection without a position emits nothing',
      ),
      check(
        'missing-position-skipped',
        1,
        missingPosition.focusSkipped,
        'the refused focus is counted explicitly',
      ),
      check(
        'missing-position-drilldown',
        'MISSING_POSITION',
        missingPosition.drilldown.reason ?? 'missing',
        'the drilldown keeps the unavailable reason',
      ),
      check(
        'missing-position-status',
        'UNAVAILABLE',
        missingPosition.drilldown.status,
        'the drilldown is unavailable, never a fake point',
      ),
      check(
        'selected-focus-count',
        1,
        selected.focusCount,
        'a located selection emits exactly one focus intention',
      ),
      check(
        'selected-focus-position',
        positionText(collisionIncident?.positionM ?? null),
        positionText(selectedHarness.focuses[0]?.positionM ?? null),
        'the intention carries the incident position, not a camera or profile change',
      ),
      check(
        'selected-focus-id',
        collisionIncident?.incidentId ?? 'missing',
        selectedHarness.focuses[0]?.incidentId ?? 'missing',
        'the intention is addressed to the selected incident',
      ),
      check(
        'selected-drilldown-status',
        'AVAILABLE',
        selected.drilldown.status,
        'a located incident has an available drilldown',
      ),
      check(
        'selected-aria',
        true,
        selected.dom.includes('aria-selected="true"'),
        'the selected row is marked for assistive technology',
      ),
      check(
        'unavailable-never-zero',
        true,
        unavailableValues.every(
          (metric) => metric.value === null && metric.valueLabel === 'Indisponibil',
        ),
        'every missing source is unavailable with no number',
      ),
      check(
        'unavailable-metric-count',
        4,
        unavailableValues.length,
        'distance, violations, collisions and comfort are unavailable without their sources',
      ),
      check(
        'violations-reason',
        'SOURCE_MISSING',
        unavailableValues.find((metric) => metric.id === 'violations')?.reason ?? 'missing',
        '137 is not Done, so violations name the missing source',
      ),
      check(
        'metrics-never-fabricated',
        true,
        unavailableValues.every((metric) => metric.reason !== null),
        'every unavailable metric carries a closed reason',
      ),
      check(
        'throttled-updates',
        true,
        (throttled.stats.updates as number) <= 11,
        `60 frames at 16 ms produce ${throttled.stats.updates as number} writes`,
      ),
      check(
        'throttled-skipped',
        true,
        (throttled.stats.skipped as number) >= 45,
        'the ceiling skips the frames it cannot write',
      ),
      check(
        'identical-frame-no-write',
        identicalWrites,
        repeatedWrites,
        'a repeated frame writes nothing',
      ),
      check(
        'identical-frame-same-dom',
        identicalDom,
        repeatedDom,
        'a repeated frame leaves the DOM byte-identical',
      ),
      check(
        'incident-bypass',
        2,
        bypassHarness.panel.getStats().updates,
        'a new incident is rendered immediately, without waiting for the ceiling',
      ),
      check(
        'focus-port-accepts',
        true,
        focusPort(collisionIncident?.incidentId ?? 'incident:082', { x: 1, y: 0, z: 2 }),
        'the port maps a finite point to the host map',
      ),
      check(
        'focus-port-rejects',
        false,
        refusedFocusPort('incident:082', { x: Number.NaN, y: 0, z: 0 }),
        'a non-finite point never reaches the host map',
      ),
      check(
        'no-global-key-listener',
        true,
        noExposureHarness.host.listenerCount === 0,
        'the dashboard installs no host/global listener',
      ),
      check(
        'deterministic-dom',
        incidents.dom,
        (() => {
          const repeat = createCityDashboardHarness();
          repeat.panel.update(incidentFrame, 0);
          const dom = repeat.dom();
          repeat.panel.dispose();
          return dom;
        })(),
        'the same frame renders byte-identical DOM',
      ),
    ];
    const passed = checks.filter((entry) => entry.pass).length;
    return Object.freeze({
      version: CITY_DASHBOARD_VERSION,
      contract: Object.freeze({
        metricIds: Object.freeze([...CITY_METRIC_IDS]),
        incidentKinds: Object.freeze(['COLLISION', 'BLOCKAGE', 'VIOLATION', 'COMFORT']),
        reasons: Object.freeze(['NO_EXPOSURE', 'SOURCE_MISSING', 'NOT_CERTIFIED']),
        rules: Object.freeze([
          'unavailable data is value:null with a closed reason, never 0',
          'a real zero is AVAILABLE with value 0 and the text "0"',
          'an incident without a real point cannot be located and emits no focus',
          'selecting an incident only emits a map-focus intention; no profile, camera mode, authority or physics change',
        ]),
        limits: Object.freeze({
          maximumHz: CITY_DASHBOARD_LIMITS.maximumHz,
          metrics: CITY_DASHBOARD_LIMITS.metrics,
          incidents: CITY_DASHBOARD_LIMITS.incidents,
          idCodeUnits: CITY_DASHBOARD_LIMITS.idCodeUnits,
        }),
      }),
      scenarios,
      checks: Object.freeze(checks),
      summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
    });
  } finally {
    noExposureHarness.panel.dispose();
    zeroHarness.panel.dispose();
    incidentHarness.panel.dispose();
    missingPositionHarness.panel.dispose();
    selectedHarness.panel.dispose();
    unavailableHarness.panel.dispose();
    throttledHarness.panel.dispose();
    bypassHarness.panel.dispose();
    identicalHarness.panel.dispose();
    missingExposureHarness.panel.dispose();
    noExposureLog.dispose();
    zeroLog.dispose();
    emptyLog.dispose();
    noExposureWorld.dispose();
    zeroWorld.dispose();
    incidentWorld.dispose();
    unavailableWorld.dispose();
  }
}

export function cityDashboardReportMarkdown(report: CityDashboardReport): string {
  const scenarioSections = report.scenarios
      .map(
        (entry) => `### ${entry.name}

| Value | Result |
| --- | --- |
| Tick | ${entry.tick} |
| Available / unavailable metrics | ${entry.availableMetrics} / ${entry.unavailableMetrics} |
| Exposure | ${entry.exposure.state} · ${entry.exposure.windows} ferestre · ${entry.exposure.observations} observații · ${entry.exposure.duration} |
| Incidents | ${entry.incidents.length} |
| Drilldown | ${entry.drilldown.status}${entry.drilldown.reason === null ? '' : ` · ${entry.drilldown.reason}`} |
| Focus intentions | ${entry.focusCount} (refused ${entry.focusSkipped}) |
| Summary | ${entry.summary} |

| Metric | State | Value | Reason |
| --- | --- | --- | --- |
${entry.metrics
  .map(
    (metric) =>
      `| ${metric.id} | ${metric.state} | ${metric.valueLabel} | ${metric.reason ?? '—'} |`,
  )
  .join('\n')}

| Incident | Kind | Tick | Located | Position |
| --- | --- | ---: | --- | --- |
${entry.incidents
  .map(
    (incident) =>
      `| ${incident.incidentId} | ${incident.kind} | ${incident.tick} | ${incident.located ? 'yes' : 'no'} | ${incident.positionLabel} |`,
  )
  .join('\n')}

\`\`\`html
${entry.dom}
\`\`\`
`,
      )
      .join('\n'),
    checkRows = report.checks
      .map(
        (entry) =>
          `| ${entry.name} | ${String(entry.expected)} | ${String(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail} |`,
      )
      .join('\n');
  return `# 082 city dashboard report

Machine-readable transcript: [report.json](report.json). Generated by \`npm run city:dashboard\`; it
contains no wall-clock value, random value or browser-only state.

Version: \`${report.version}\`. The report drives the real \`createCityDashboard\` adapter over the real
061 lifecycle, 028 collision incidents and 065 health history, and over deterministic contract frames.

## Contract

Metric ids: ${report.contract.metricIds.join(', ')}.
Incident kinds: ${report.contract.incidentKinds.join(', ')}.
Reasons: ${report.contract.reasons.join(', ')}.

Rules: ${report.contract.rules.join('; ')}.

Limits: ${report.contract.limits.maximumHz} Hz write ceiling, ${report.contract.limits.metrics} closed
metrics, ${report.contract.limits.incidents} retained incidents and ${report.contract.limits.idCodeUnits}
code units per identity.

${scenarioSections}
## Checks

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
${checkRows}

## Summary

- Checks: ${report.summary.passed}/${report.summary.checks}
- Scenarios: ${report.scenarios.length}
- Overall: ${report.summary.pass ? 'PASS' : 'FAIL'}
`;
}

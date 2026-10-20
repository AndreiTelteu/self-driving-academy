import { readTaxiHudSnapshot } from '../../src/app';
import {
  createTaxiHud,
  formatDistanceM,
  formatDuration,
  modeView,
  projectTaxiHud,
  TAXI_HUD_VERSION,
} from '../../src/ui';
import type { TaxiHudSnapshot } from '../../src/ui';
import { createEtaWorld, disposeEtaWorld, etaObservation, rideOf } from '../fleet/eta-fixture';
import type { EtaWorld } from '../fleet/eta-fixture';
import { createHudDocument, createHudHost, findHudElement, serializeHud } from '../ui/hud-dom';

export interface TaxiHudReportScenario {
  readonly name: string;
  readonly mode: TaxiHudSnapshot['mode'];
  readonly tick: number;
  readonly speedMps: number | null;
  readonly rows: Readonly<Record<string, string>>;
  readonly dom: string;
  readonly stats: Readonly<Record<string, number | boolean | string>>;
}

export interface TaxiHudCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface TaxiHudReport {
  readonly version: typeof TAXI_HUD_VERSION;
  readonly contract: Readonly<{
    defaultRows: readonly string[];
    detailRows: readonly string[];
    modes: readonly string[];
  }>;
  readonly scenarios: readonly TaxiHudReportScenario[];
  readonly checks: readonly TaxiHudCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function render(snapshot: TaxiHudSnapshot) {
  const doc = createHudDocument(),
    host = createHudHost(doc),
    hud = createTaxiHud(host as unknown as HTMLElement);
  hud.update(snapshot, 0);
  const root = host.children[0]!,
    details = findHudElement(root, 'details');
  if (!details) throw new Error('Taxi HUD details are missing');
  return { hud, host, root, details, dom: serializeHud(root), stats: hud.getStats() };
}

function rowsOf(snapshot: TaxiHudSnapshot): Readonly<Record<string, string>> {
  const p = projectTaxiHud(snapshot);
  return Object.freeze({
    speed: `${p.speed.value} ${p.speed.unit}`,
    modeSymbol: p.mode.symbol,
    modeLabel: p.mode.label,
    taxi: p.taxi,
    stage: p.stage,
    objective: p.objective,
    route: p.route,
    eta: p.eta,
    progress: p.progress,
    service: p.service,
  });
}

function scenario(
  name: string,
  snapshot: TaxiHudSnapshot,
  dom: string,
  stats: Readonly<Record<string, number | boolean | string>>,
): TaxiHudReportScenario {
  return Object.freeze({
    name,
    mode: snapshot.mode,
    tick: snapshot.tick,
    speedMps: snapshot.speedMps,
    rows: rowsOf(snapshot),
    dom,
    stats,
  });
}

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): TaxiHudCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function completeRide(world: EtaWorld, rideId: string): void {
  for (const [event, atTick] of [
    ['ARRIVED_PICKUP', 12],
    ['PICKUP_COMPLETE', 13],
    ['ARRIVED_DROPOFF', 14],
    ['DROPOFF_COMPLETE', 15],
  ] as const)
    world.rideWorld.lifecycle.apply({
      rideId,
      eventId: `hud:${event}`,
      event,
      tick: atTick,
    });
}

export function runTaxiHudReport(): TaxiHudReport {
  const world = createEtaWorld(),
    registry = world.rideWorld.dispatcherWorld.registry,
    lifecycle = world.rideWorld.lifecycle,
    ride = rideOf(world),
    sources = { fleet: registry, lifecycle, eta: world.eta },
    estimate = world.eta.observe(etaObservation(world, { speedMps: 8 }));
  try {
    const autoSnapshot = readTaxiHudSnapshot(sources, {
        taxiId: ride.taxiId,
        mode: 'AUTO',
        tick: 10,
        speedMps: 8,
      }),
      manualSnapshot = readTaxiHudSnapshot(sources, {
        taxiId: ride.taxiId,
        mode: 'MANUAL',
        tick: 10,
        speedMps: 8,
      }),
      learningSnapshot = readTaxiHudSnapshot(sources, {
        taxiId: ride.taxiId,
        mode: 'LEARNING',
        tick: 10,
        speedMps: 8,
      }),
      auto = render(autoSnapshot),
      manual = render(manualSnapshot),
      learning = render(learningSnapshot);
    if (autoSnapshot.ride === null || autoSnapshot.ride.eta.status !== 'ESTIMATED')
      throw new Error('The report requires a real estimated ETA');

    world.eta.setServiceState('BLOCKED');
    world.eta.observe(etaObservation(world, { tick: 11, speedMps: 8 }));
    const blockedSnapshot = readTaxiHudSnapshot(sources, {
        taxiId: ride.taxiId,
        mode: 'AUTO',
        tick: 11,
        speedMps: 8,
      }),
      blocked = render(blockedSnapshot);

    completeRide(world, ride.rideId);
    const completedSnapshot = readTaxiHudSnapshot(sources, {
        taxiId: ride.taxiId,
        mode: 'AUTO',
        tick: lifecycle.currentTick(),
        speedMps: 0,
        rideId: ride.rideId,
      }),
      completed = render(completedSnapshot),
      otherTaxi = registry
        .list()
        .find((vehicle) => vehicle.driverKind === 'TAXI' && vehicle.vehicleId !== ride.taxiId);
    if (otherTaxi === undefined) throw new Error('The report requires a second taxi');
    const noRideSnapshot = readTaxiHudSnapshot(sources, {
        taxiId: otherTaxi.vehicleId,
        mode: 'AUTO',
        tick: lifecycle.currentTick(),
        speedMps: 0,
      }),
      noRide = render(noRideSnapshot),
      foreignSnapshot = readTaxiHudSnapshot(sources, {
        taxiId: otherTaxi.vehicleId,
        mode: 'AUTO',
        tick: lifecycle.currentTick(),
        speedMps: 0,
        rideId: ride.rideId,
      }),
      foreign = render(foreignSnapshot);

    const repeated = render(autoSnapshot);
    repeated.hud.update(autoSnapshot, 200);
    const repeatedWrites =
      (repeated.hud.getStats().writes as number) - (auto.stats.writes as number);
    repeated.hud.update({ ...autoSnapshot, mode: 'MANUAL' }, 210);
    const changedLabel = repeated.details.parent?.children[1]?.children[1]?.textContent ?? '';
    repeated.hud.dispose();
    auto.hud.dispose();
    manual.hud.dispose();
    learning.hud.dispose();
    blocked.hud.dispose();
    completed.hud.dispose();
    noRide.hud.dispose();
    foreign.hud.dispose();

    const etaText = `~${formatDuration(estimate.etaSeconds)}`,
      progress =
        estimate.progressFraction === null || estimate.remainingDistanceM === null
          ? '—'
          : `${Math.round(estimate.progressFraction * 100)}% · ${formatDistanceM(estimate.remainingDistanceM)}`,
      checks = [
        check('contract-version', TAXI_HUD_VERSION, autoSnapshot.version, '073 snapshot version'),
        check(
          'speed-from-physical-readback',
          '29 km/h',
          rowsOf(autoSnapshot).speed,
          '8 m/s becomes 29 km/h with an explicit unit',
        ),
        check(
          'route-from-real-zones',
          `${ride.pickupZoneId} → ${ride.dropoffZoneId}`,
          rowsOf(autoSnapshot).route,
          'route text is the real 060 assignment zones',
        ),
        check('stage-from-real-ride', 'Spre pasager', rowsOf(autoSnapshot).stage, '061 TO_PICKUP'),
        check(
          'objective-names-real-pickup',
          `Du-te la pasagerul din ${ride.pickupZoneId}`,
          rowsOf(autoSnapshot).objective,
          'objective uses the real pickup zone id',
        ),
        check('eta-from-real-064', etaText, rowsOf(autoSnapshot).eta, '064 estimate, rounded once'),
        check(
          'progress-from-real-064',
          progress,
          rowsOf(autoSnapshot).progress,
          'certified progress',
        ),
        check(
          'mode-auto',
          'Conduce AI-ul',
          rowsOf(autoSnapshot).modeLabel,
          'mandated 08/067 AUTO label',
        ),
        check(
          'mode-manual',
          'Conduci · învățare oprită',
          rowsOf(manualSnapshot).modeLabel,
          'mandated 08/067 MANUAL label',
        ),
        check(
          'mode-learning',
          'Conduci · orașul învață',
          rowsOf(learningSnapshot).modeLabel,
          'mandated 08/067 LEARNING label',
        ),
        check(
          'mode-symbols-distinct',
          true,
          new Set([modeView('AUTO').symbol, modeView('MANUAL').symbol, modeView('LEARNING').symbol])
            .size === 3,
          'text and symbol, not colour alone',
        ),
        check(
          'blocked-explicit-unavailable',
          'Indisponibil',
          rowsOf(blockedSnapshot).eta,
          '064 SERVICE_BLOCKED is displayed, never 0 s',
        ),
        check(
          'blocked-service-label',
          'Serviciu blocat',
          rowsOf(blockedSnapshot).service,
          'service state comes from the same 064 snapshot',
        ),
        check(
          'completed-not-active',
          'Cursă încheiată',
          rowsOf(completedSnapshot).stage,
          'a real terminal ride is not rendered as an active ride',
        ),
        check(
          'completed-without-eta-promise',
          '—',
          rowsOf(completedSnapshot).eta,
          'a closed ride carries no active ETA',
        ),
        check(
          'no-ride-explicit',
          'Nicio cursă activă',
          rowsOf(noRideSnapshot).stage,
          'a taxi without a ride is not shown as completed',
        ),
        check(
          'no-ride-no-estimate',
          'Fără estimare',
          rowsOf(noRideSnapshot).eta,
          'missing ETA is never rendered as 0 s',
        ),
        check(
          'foreign-ride-explicit',
          'Cursă a altui taxi',
          rowsOf(foreignSnapshot).stage,
          'a ride claimed by another taxi is never carried over',
        ),
        check(
          'profile-at-request',
          true,
          auto.details.open === false &&
            auto.dom.includes(`Versiune profil`) &&
            auto.dom.includes(
              registry.state(ride.taxiId)?.appliedProfileVersion ?? 'missing-profile-version',
            ),
          'details are collapsed while profile id/version stay available',
        ),
        check(
          'deterministic-dom',
          auto.dom,
          repeated.dom,
          'the same snapshot renders byte-identical HTML',
        ),
        check('bounded-writes', 0, repeatedWrites, 'a repeated 10 Hz frame writes no text'),
        check(
          'immediate-mode-change',
          true,
          changedLabel === 'Conduci · învățare oprită',
          'a mode change inside the throttle window is not stale',
        ),
        check(
          'bounded-lifecycle',
          true,
          auto.host.children.length === 0 &&
            auto.hud.getStats().elements === 0 &&
            auto.hud.getStats().listeners === 0,
          'dispose removes every owned node and listener',
        ),
      ],
      passed = checks.filter((entry) => entry.pass).length;

    return Object.freeze({
      version: TAXI_HUD_VERSION,
      contract: Object.freeze({
        defaultRows: Object.freeze([
          'Viteză',
          'Mod',
          'Taxi',
          'Etapă',
          'Obiectiv',
          'Rută',
          'ETA',
          'Progres',
          'Serviciu',
        ]),
        detailRows: Object.freeze([
          'Taxi',
          'Clasă',
          'Profil',
          'Versiune profil',
          'Cursă',
          'Etapă tehnică',
          'Interval ETA',
          'Distanță rămasă',
          'Motiv ETA',
        ]),
        modes: Object.freeze(['AUTO', 'MANUAL', 'LEARNING']),
      }),
      scenarios: Object.freeze([
        scenario('AUTO · TO_PICKUP', autoSnapshot, auto.dom, auto.stats),
        scenario('MANUAL · TO_PICKUP', manualSnapshot, manual.dom, manual.stats),
        scenario('LEARNING · TO_PICKUP', learningSnapshot, learning.dom, learning.stats),
        scenario('AUTO · SERVICE_BLOCKED', blockedSnapshot, blocked.dom, blocked.stats),
        scenario('AUTO · COMPLETED', completedSnapshot, completed.dom, completed.stats),
        scenario('AUTO · no ride', noRideSnapshot, noRide.dom, noRide.stats),
        scenario('AUTO · foreign ride', foreignSnapshot, foreign.dom, foreign.stats),
      ]),
      checks: Object.freeze(checks),
      summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
    });
  } finally {
    disposeEtaWorld(world);
  }
}

export function taxiHudReportMarkdown(report: TaxiHudReport): string {
  const scenarioSections = report.scenarios
      .map(
        (entry) => `### ${entry.name}

| Row | Value |
| --- | --- |
| Speed | ${entry.rows.speed} |
| Mode | ${entry.rows.modeSymbol} · ${entry.rows.modeLabel} |
| Taxi | ${entry.rows.taxi} |
| Stage | ${entry.rows.stage} |
| Objective | ${entry.rows.objective} |
| Route | ${entry.rows.route} |
| ETA | ${entry.rows.eta} |
| Progress | ${entry.rows.progress} |
| Service | ${entry.rows.service} |

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
  return `# 073 HUD report

Machine-readable transcript: [report.json](report.json). Generated by \`npm run hud:taxi\`; it
contains no wall-clock value, no random value and no browser-only state.

Version: \`${report.version}\`. The report drives the real 057 registry, real 061 ride and real 064
ETA fixture through \`readTaxiHudSnapshot\`, then renders the real \`createTaxiHud\` DOM.

## Default and detail rows

Default: ${report.contract.defaultRows.join(', ')}. Details on request:
${report.contract.detailRows.join(', ')}. Modes: ${report.contract.modes.join(', ')}.

${scenarioSections}
## Checks

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
${checkRows}

## Summary

- Checks: ${report.summary.passed}/${report.summary.checks}
- Overall: ${report.summary.pass ? 'PASS' : 'FAIL'}
`;
}

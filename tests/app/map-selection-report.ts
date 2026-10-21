import {
  createMapSelectionPort,
  readMapSelectionSnapshot,
  type MapSelectionSources,
} from '../../src/app';
import {
  hitTestMapMarker,
  MAP_SELECTION_LIMITS,
  MAP_SELECTION_VERSION,
  parseMapSelectionSnapshot,
  projectMapSelection,
  projectMinimapPoint,
} from '../../src/ui';
import type { MapMarkerHit, MapSelectionProjection, MapSelectionSnapshot } from '../../src/ui';
import { createEtaWorld, disposeEtaWorld, rideOf } from '../fleet/eta-fixture';
import {
  civilIdOf,
  createMapSelectionHarness,
  fleetMapSnapshot,
  gridPosition,
  mapSnapshot,
  mapTransform,
  mapVehicle,
  taxiIdOf,
} from '../ui/map-selection-fixture';

export interface MapSelectionReportMarker {
  readonly markerId: string;
  readonly kind: string;
  readonly symbol: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly selected: boolean;
  readonly selectable: boolean;
}

export interface MapSelectionReportScenario {
  readonly name: string;
  readonly tick: number;
  readonly followedVehicleId: string | null;
  readonly counts: MapSelectionProjection['counts'];
  readonly description: string;
  readonly markers: readonly MapSelectionReportMarker[];
  readonly hit: MapMarkerHit | null;
  readonly selections: readonly string[];
  readonly dom: string;
  readonly stats: Readonly<Record<string, number | boolean | string>>;
}

export interface MapSelectionCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface MapSelectionReport {
  readonly version: typeof MAP_SELECTION_VERSION;
  readonly contract: Readonly<{
    identity: string;
    hitTest: string;
    limits: Readonly<Record<string, number | string>>;
  }>;
  readonly scenarios: readonly MapSelectionReportScenario[];
  readonly checks: readonly MapSelectionCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): MapSelectionCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function markerSummary(projection: MapSelectionProjection): readonly MapSelectionReportMarker[] {
  return Object.freeze(
    projection.markers.map((marker) =>
      Object.freeze({
        markerId: marker.markerId,
        kind: marker.kind,
        symbol: marker.symbol,
        label: marker.label,
        x: Number(marker.x.toFixed(3)),
        y: Number(marker.y.toFixed(3)),
        selected: marker.selected,
        selectable: marker.selectable,
      }),
    ),
  );
}

function pointOf(
  transform: ReturnType<typeof mapTransform>,
  x: number,
  z: number,
): { x: number; y: number } {
  return projectMinimapPoint(transform, { x, z });
}

function shiftingFrames(base: MapSelectionSnapshot, frames: number): MapSelectionSnapshot[] {
  const result: MapSelectionSnapshot[] = [];
  for (let index = 0; index < frames; index += 1) {
    const vehicles = base.vehicles.map((vehicle, position) =>
      position === 0 && vehicle.positionM !== null
        ? { ...vehicle, positionM: { ...vehicle.positionM, x: vehicle.positionM.x + index * 0.1 } }
        : vehicle,
    );
    result.push({ ...base, tick: base.tick + 1 + index, vehicles: Object.freeze(vehicles) });
  }
  return result;
}

function scenarioOf(
  name: string,
  harness: ReturnType<typeof createMapSelectionHarness>,
  snapshot: MapSelectionSnapshot,
  hit: MapMarkerHit | null,
  previous?: readonly MapSelectionReportMarker[],
): MapSelectionReportScenario {
  const projection = projectMapSelection(harness.transform, snapshot),
    markers = markerSummary(projection);
  return Object.freeze({
    name,
    tick: snapshot.tick,
    followedVehicleId: snapshot.followedVehicleId,
    counts:
      previous === undefined
        ? projection.counts
        : Object.freeze({
            ...projection.counts,
            removed: previous.filter(
              (marker) => !markers.some((entry) => entry.markerId === marker.markerId),
            ).length,
          }),
    description: projection.description,
    markers,
    hit,
    selections: Object.freeze([...harness.selections]),
    dom: harness.dom(),
    stats: harness.overlay.getStats(),
  });
}

export function runMapSelectionReport(): MapSelectionReport {
  const transform = mapTransform(),
    base = fleetMapSnapshot(),
    mainHarness = createMapSelectionHarness(),
    distantHarness = createMapSelectionHarness(),
    clickHarness = createMapSelectionHarness(),
    removedHarness = createMapSelectionHarness(),
    stableHarness = createMapSelectionHarness(),
    throttledHarness = createMapSelectionHarness(),
    unselectableHarness = createMapSelectionHarness();

  mainHarness.overlay.update(base, 0);
  const mainProjection = projectMapSelection(transform, base),
    taxiPoint = pointOf(transform, gridPosition(0).x, gridPosition(0).z),
    distantPoint = pointOf(transform, -9.5, -9.5),
    taxiHit = hitTestMapMarker(mainProjection.markers, taxiPoint);

  // A distant civilian still projects and wins the hit test at its own coordinates.
  const distantSnapshot = mapSnapshot({
      followedVehicleId: null,
      vehicles: Object.freeze([
        mapVehicle({
          vehicleId: taxiIdOf(1),
          slot: 1,
          positionM: { x: 10, y: 0, z: 10 },
        }),
        mapVehicle({
          vehicleId: civilIdOf(41),
          kind: 'CIVIL',
          slot: 41,
          positionM: { x: -9.5, y: 0, z: -9.5 },
        }),
      ]),
    }),
    distantHarnessSnapshot = distantSnapshot;
  distantHarness.overlay.update(distantHarnessSnapshot, 0);
  const distantProjection = projectMapSelection(transform, distantHarnessSnapshot),
    distantOnlyHit = hitTestMapMarker(distantProjection.markers, distantPoint),
    distantMarker = distantProjection.markers.find((marker) => marker.vehicleId === civilIdOf(41));

  // A click is one WORLD intention; the followed marker then changes immediately.
  clickHarness.overlay.update(base, 0);
  clickHarness.markerFor(civilIdOf(41)).dispatch('click');
  clickHarness.markerFor(taxiIdOf(3)).dispatch('click');
  clickHarness.overlay.setFollowed(taxiIdOf(3));

  // Removing a vehicle removes exactly that marker; every other element is retained.
  removedHarness.overlay.update(base, 0);
  const removedSnapshot: MapSelectionSnapshot = Object.freeze({
      ...base,
      tick: 11,
      vehicles: Object.freeze(base.vehicles.filter((vehicle) => vehicle.vehicleId !== taxiIdOf(2))),
    }),
    removedProjection = projectMapSelection(transform, removedSnapshot, {
      previous: projectMapSelection(transform, base).markers,
    });
  removedHarness.overlay.update(removedSnapshot, 500);

  // Representation changes reuse the marker element; only its text/position change.
  const stableFirst = mapSnapshot({
      vehicles: [mapVehicle({ vehicleId: taxiIdOf(5), slot: 5, positionM: { x: 0, y: 0, z: 0 } })],
    }),
    stableSecond = mapSnapshot({
      tick: 11,
      vehicles: [
        mapVehicle({
          vehicleId: taxiIdOf(5),
          slot: 5,
          kind: 'CIVIL',
          label: 'Client fidel',
          positionM: { x: 20, y: 0, z: 25 },
          headingRad: Math.PI / 2,
        }),
      ],
    });
  stableHarness.overlay.update(stableFirst, 0);
  const stableCreated = stableHarness.overlay.getStats().created,
    stableButton = stableHarness.markerFor(taxiIdOf(5));
  stableHarness.overlay.update(stableSecond, 1000);
  const stableReused = stableHarness.markerFor(taxiIdOf(5)) === stableButton;

  // A cap of 10 Hz over 60 changing frames.
  throttledHarness.overlay.update(base, 0);
  const frames = shiftingFrames(base, 60);
  for (let index = 0; index < frames.length; index += 1)
    throttledHarness.overlay.update(frames[index]!, (index + 1) * 16);
  const throttledStats = throttledHarness.overlay.getStats();

  // A non-selectable marker is visible but cannot be picked.
  const unselectableSnapshot = mapSnapshot({
      vehicles: [
        mapVehicle({ vehicleId: taxiIdOf(9), slot: 9, positionM: { x: 10, y: 0, z: 10 } }),
        mapVehicle({
          vehicleId: civilIdOf(9),
          kind: 'CIVIL',
          slot: 9,
          selectable: false,
          positionM: { x: 4, y: 0, z: 10 },
        }),
      ],
    }),
    unselectableProjection = projectMapSelection(transform, unselectableSnapshot);
  unselectableHarness.overlay.update(unselectableSnapshot, 0);
  const unselectableMarker = unselectableProjection.markers.find(
      (marker) => marker.vehicleId === civilIdOf(9),
    )!,
    unselectableHit = hitTestMapMarker(unselectableProjection.markers, {
      x: unselectableMarker.x,
      y: unselectableMarker.y,
    });

  // Tie between two symmetric taxis: the lexicographically smaller identity wins.
  const tieSnapshot = mapSnapshot({
      vehicles: [
        mapVehicle({ vehicleId: taxiIdOf(2), slot: 2, positionM: { x: 12, y: 0, z: 10 } }),
        mapVehicle({ vehicleId: taxiIdOf(1), slot: 1, positionM: { x: 8, y: 0, z: 10 } }),
      ],
    }),
    tieMarkers = [...projectMapSelection(transform, tieSnapshot).markers].reverse(),
    tieHit = hitTestMapMarker(tieMarkers, pointOf(transform, 10, 10));

  const world = createEtaWorld();
  let real: MapSelectionReportScenario | null = null,
    realSnapshot: MapSelectionSnapshot | null = null,
    realFleetTotal = 0;
  try {
    const registry = world.rideWorld.dispatcherWorld.registry,
      vehicles = registry.list(),
      omitted = vehicles[0]!.vehicleId,
      ride = rideOf(world),
      known = new Map(
        vehicles.map((vehicle, index) => [vehicle.vehicleId, gridPosition(index)] as const),
      ),
      sources: MapSelectionSources = {
        fleet: registry,
        camera: { followedVehicleId: () => ride.taxiId },
      },
      harness = createMapSelectionHarness();
    realFleetTotal = vehicles.length;
    realSnapshot = readMapSelectionSnapshot(sources, {
      tick: 10,
      positions: (vehicleId) => (vehicleId === omitted ? null : (known.get(vehicleId) ?? null)),
    });
    harness.overlay.update(realSnapshot, 0);
    const realProjection = projectMapSelection(transform, realSnapshot),
      firstMarker = realProjection.markers[0]!,
      realHit = hitTestMapMarker(realProjection.markers, {
        x: firstMarker.x,
        y: firstMarker.y,
      });
    real = scenarioOf('real 057 binding · civilians included', harness, realSnapshot, realHit);
    harness.overlay.dispose();
  } finally {
    disposeEtaWorld(world);
  }
  if (real === null || realSnapshot === null)
    throw new Error('Map selection report has no real frame');

  const main = scenarioOf('30 taxis + 41 civilians', mainHarness, base, taxiHit),
    distant = scenarioOf(
      'distant civilian',
      distantHarness,
      distantHarnessSnapshot,
      distantOnlyHit,
    ),
    clicked = scenarioOf(
      'civilian click · followed taxi',
      clickHarness,
      {
        ...base,
        followedVehicleId: taxiIdOf(3),
      },
      taxiHit,
    ),
    removed = scenarioOf(
      'removed marker',
      removedHarness,
      removedSnapshot,
      null,
      projectMapSelection(transform, base).markers,
    ),
    stable = scenarioOf('stable identity', stableHarness, stableSecond, null),
    throttled = scenarioOf('60 frames · 10 Hz ceiling', throttledHarness, frames[59]!, null),
    unselectable = scenarioOf(
      'non-selectable marker',
      unselectableHarness,
      unselectableSnapshot,
      unselectableHit,
    );

  // A repeated frame must not write and a malformed frame must not touch the DOM.
  const probe = createMapSelectionHarness();
  probe.overlay.update(base, 0);
  const identicalDom = probe.dom(),
    identicalWrites = probe.overlay.getStats().writes;
  probe.overlay.update(base, 500);
  const repeatedWrites = probe.overlay.getStats().writes,
    repeatedSkipped = probe.overlay.getStats().skipped,
    repeatedDom = probe.dom();
  let parserRejected = false;
  try {
    parseMapSelectionSnapshot({ ...base, version: '075-fleet-panel-v1' });
  } catch {
    parserRejected = true;
  }
  const writesBeforeRejected = probe.overlay.getStats().writes;
  let staleRejected = false;
  try {
    probe.overlay.update({ ...base, tick: 9 }, 510);
  } catch {
    staleRejected = true;
  }
  const rejectedDom = probe.dom(),
    rejectedWrites = probe.overlay.getStats().writes;
  probe.overlay.dispose();

  const selectionProbe = createMapSelectionHarness();
  selectionProbe.overlay.update(base, 0);
  selectionProbe.markerFor(taxiIdOf(4)).dispatch('click');
  const selectedIds = [...selectionProbe.selections];
  selectionProbe.overlay.dispose();

  const enqueued: { identity: unknown; source: string }[] = [],
    identity = Object.freeze({ entityId: taxiIdOf(4), handle: 7, generation: 2 }),
    selectPort = createMapSelectionPort({
      bodyIdentity: (vehicleId) => (vehicleId === taxiIdOf(4) ? identity : undefined),
      selection: {
        enqueue: (target, source) => {
          enqueued.push({ identity: target, source });
          return true;
        },
      },
    }),
    portResult = selectPort(taxiIdOf(4)),
    unknownResult = selectPort('vehicle:unknown');

  const mainTaxi = mainProjection.markers.find((marker) => marker.vehicleId === taxiIdOf(1)),
    mainDistant = mainProjection.markers.find((marker) => marker.vehicleId === civilIdOf(41)),
    stableStats = stableHarness.overlay.getStats(),
    removedStats = removedHarness.overlay.getStats(),
    clickFollowed = clicked.dom.includes('aria-pressed="true"'),
    repeatDom = (() => {
      const repeat = createMapSelectionHarness();
      repeat.overlay.update(base, 0);
      const dom = repeat.dom();
      repeat.overlay.dispose();
      return dom;
    })();

  const checks = [
    check('contract-version', MAP_SELECTION_VERSION, base.version, '076 snapshot version'),
    check('vehicle-population', 71, base.vehicles.length, '30 taxis plus 41 civilians'),
    check(
      'taxi-count',
      30,
      main.counts.taxis,
      'every TAXI member of the deterministic frame is projected',
    ),
    check('civilian-count', 41, main.counts.civilians, 'every CIVIL member is projected'),
    check(
      'marker-count',
      base.vehicles.length,
      main.counts.total,
      'a marker exists for every vehicle with a known position',
    ),
    check(
      'stable-marker-identity',
      true,
      mainProjection.markers.every((marker) => marker.markerId === marker.vehicleId),
      'markerId is the fleet vehicleId, never an index or a handle',
    ),
    check(
      'taxi-symbol',
      'T',
      mainTaxi?.symbol ?? 'missing',
      'taxis are tagged T, not only coloured',
    ),
    check(
      'civilian-symbol',
      'C',
      mainDistant?.symbol ?? 'missing',
      'civilians are tagged C, not only coloured',
    ),
    check(
      'projection-x',
      pointOf(transform, gridPosition(0).x, gridPosition(0).z).x.toFixed(3),
      (mainTaxi?.x ?? Number.NaN).toFixed(3),
      'the taxi marker is the 074 projection of its real position',
    ),
    check(
      'projection-y',
      pointOf(transform, gridPosition(0).x, gridPosition(0).z).y.toFixed(3),
      (mainTaxi?.y ?? Number.NaN).toFixed(3),
      'the projection is north-up: +Z moves up',
    ),
    check(
      'distant-civilian-projection',
      `${distantPoint.x.toFixed(3)},${distantPoint.y.toFixed(3)}`,
      distantMarker === undefined
        ? 'missing'
        : `${distantMarker.x.toFixed(3)},${distantMarker.y.toFixed(3)}`,
      'a far civilian is still projected at its real coordinates',
    ),
    check(
      'hit-nearest-taxi',
      taxiIdOf(1),
      main.hit?.vehicleId ?? 'miss',
      'the nearest marker within the radius wins',
    ),
    check(
      'hit-distant-civilian',
      civilIdOf(41),
      distant.hit?.vehicleId ?? 'miss',
      'a distant civilian can be hit without a nearby taxi stealing the click',
    ),
    check(
      'hit-tie-by-id',
      taxiIdOf(1),
      tieHit?.vehicleId ?? 'miss',
      'an equal-distance tie is broken by the stable identity',
    ),
    check(
      'hit-outside-radius',
      'null',
      String(hitTestMapMarker(mainProjection.markers, { x: -500, y: -500 })),
      'a click outside every radius selects nothing',
    ),
    check(
      'hit-invalid-point',
      'null',
      String(hitTestMapMarker(mainProjection.markers, { x: Number.NaN, y: 0 })),
      'an invalid pointer coordinate is ignored',
    ),
    check(
      'hit-non-selectable',
      'null',
      String(unselectableHit),
      'a non-selectable marker cannot be picked',
    ),
    check(
      'followed-selected',
      taxiIdOf(12),
      mainProjection.markers.find((marker) => marker.selected)?.vehicleId ?? 'missing',
      'the 068 camera target is the selected marker',
    ),
    check(
      'followed-aria-pressed',
      true,
      main.dom.includes('aria-pressed="true"'),
      'the followed marker is announced as pressed',
    ),
    check(
      'set-followed-immediate',
      true,
      clickFollowed && clickHarness.root().getAttribute('data-followed') === taxiIdOf(3),
      'setFollowed updates the retained frame without waiting for the rate ceiling',
    ),
    check(
      'click-world-intent',
      taxiIdOf(4),
      selectedIds.join(','),
      'one click emits exactly one identity through the injected port',
    ),
    check(
      'click-intent-order',
      `${civilIdOf(41)},${taxiIdOf(3)}`,
      clicked.selections.join(','),
      'two clicks emit two intentions in order; a civilian is selectable',
    ),
    check(
      'removed-marker-count',
      1,
      removedProjection.counts.removed,
      'the projection reports the marker that disappeared',
    ),
    check(
      'removed-marker-cleanup',
      true,
      removedStats.markers === 70 && removedStats.removed === 1,
      'only the removed vehicle loses its element and listener',
    ),
    check(
      'identity-survives-representation',
      true,
      stableReused && stableStats.created === stableCreated && stableStats.markers === 1,
      'position/label/kind updates reuse the same marker element',
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
      'the retained DOM stays byte-identical',
    ),
    check('identical-frame-skipped', 1, repeatedSkipped, 'a repeated frame is counted as skipped'),
    check(
      'throttled-updates',
      true,
      (throttledStats.updates as number) <= 10,
      `60 frames at 16 ms produce ${throttledStats.updates as number} writes`,
    ),
    check(
      'throttled-skipped',
      true,
      (throttledStats.skipped as number) >= 45,
      'the 10 Hz ceiling skips the frames it cannot write',
    ),
    check(
      'global-listeners-zero',
      0,
      main.stats.globalListeners,
      'the overlay installs no document/window listener',
    ),
    check(
      'bounded-elements',
      MAP_SELECTION_LIMITS.fixedElements + base.vehicles.length,
      main.stats.elements,
      'two fixed nodes plus one button per marker',
    ),
    check(
      'parser-rejects-wrong-version',
      true,
      parserRejected,
      'a wrong contract version is rejected before any DOM work',
    ),
    check('stale-frame-rejected', true, staleRejected, 'a decreasing tick is rejected'),
    check(
      'rejected-frame-no-write',
      true,
      rejectedDom === identicalDom && rejectedWrites === writesBeforeRejected,
      'a rejected frame never touches the DOM',
    ),
    check('deterministic-dom', main.dom, repeatDom, 'the same frame renders byte-identical DOM'),
    check(
      'real-fleet-total',
      true,
      realSnapshot.vehicles.length > 0 &&
        real.counts.total === realSnapshot.vehicles.length &&
        real.counts.taxis + real.counts.civilians === real.counts.total,
      'the real snapshot exposes taxis and civilians together',
    ),
    check(
      'real-civilians-included',
      true,
      realSnapshot.vehicles.some((vehicle) => vehicle.kind === 'CIVIL'),
      'real 057 civilians keep their own vehicleId in the frame',
    ),
    check(
      'real-followed-vehicle',
      true,
      realSnapshot.followedVehicleId !== null,
      'the 068 camera target is read as the followed vehicle',
    ),
    check(
      'real-missing-position-omitted',
      true,
      realSnapshot.vehicles.length === realFleetTotal - 1,
      'a vehicle without a readback is omitted instead of invented',
    ),
    check(
      'select-port-world',
      true,
      portResult === true && enqueued[0]?.source === 'WORLD' && unknownResult === false,
      'the port maps a marker to one WORLD intention and rejects an unknown identity',
    ),
    check(
      'accessible-description',
      true,
      main.description.includes('Selectare pe hartă') &&
        main.description.includes('schimbă doar ținta camerei'),
      'the overlay describes the counts and the no-teleport selection rule',
    ),
    check(
      'unique-markers',
      true,
      new Set(mainProjection.markers.map((marker) => marker.markerId)).size ===
        mainProjection.markers.length,
      'no duplicate marker identity is projected',
    ),
  ];
  const passed = checks.filter((entry) => entry.pass).length,
    scenarios = Object.freeze([
      main,
      distant,
      clicked,
      removed,
      stable,
      throttled,
      unselectable,
      real,
    ]);
  mainHarness.overlay.dispose();
  distantHarness.overlay.dispose();
  clickHarness.overlay.dispose();
  removedHarness.overlay.dispose();
  stableHarness.overlay.dispose();
  throttledHarness.overlay.dispose();
  unselectableHarness.overlay.dispose();
  return Object.freeze({
    version: MAP_SELECTION_VERSION,
    contract: Object.freeze({
      identity:
        'markerId and data-vehicle-id are the stable 057 vehicleId; representation updates never change identity',
      hitTest:
        'nearest selectable marker within a bounded radius; ties by lexicographic vehicleId; invalid coordinates ignored',
      limits: Object.freeze({
        maximumHz: MAP_SELECTION_LIMITS.maximumHz,
        vehicles: MAP_SELECTION_LIMITS.vehicles,
        markerSizePx: MAP_SELECTION_LIMITS.markerSizePx,
        hitRadiusPx: MAP_SELECTION_LIMITS.hitRadiusPx,
        maximumHitRadiusPx: MAP_SELECTION_LIMITS.maximumHitRadiusPx,
        globalListeners: MAP_SELECTION_LIMITS.globalListeners,
      }),
    }),
    scenarios,
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}

export function mapSelectionReportMarkdown(report: MapSelectionReport): string {
  const scenarioSections = report.scenarios
      .map(
        (entry) => `### ${entry.name}

| Value | Result |
| --- | --- |
| Tick | ${entry.tick} |
| Followed vehicle | ${entry.followedVehicleId ?? '—'} |
| Markers | ${entry.counts.total} (${entry.counts.taxis} taxis, ${entry.counts.civilians} civilians) |
| Selectable / selected | ${entry.counts.selectable} / ${entry.counts.selected} |
| Removed | ${entry.counts.removed} |
| Hit test | ${entry.hit === null ? '—' : `${entry.hit.vehicleId} (${entry.hit.kind})`} |
| Click intentions | ${entry.selections.join(', ') || '—'} |
| Markers created / removed | ${entry.stats.created} / ${entry.stats.removed} |
| Writes / skipped / updates | ${entry.stats.writes} / ${entry.stats.skipped} / ${entry.stats.updates} |
| Listeners (global) | ${entry.stats.listeners} (${entry.stats.globalListeners}) |

${entry.description}

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
      .join('\n'),
    markerRows = report.scenarios
      .flatMap((entry) =>
        entry.markers.map(
          (marker) =>
            `| ${entry.name} | ${marker.markerId} | ${marker.kind} | ${marker.symbol} | ${marker.label} | ${marker.x.toFixed(3)}, ${marker.y.toFixed(3)} | ${marker.selected ? 'yes' : 'no'} |`,
        ),
      )
      .join('\n');
  return `# 076 map selection report

Machine-readable transcript: [report.json](report.json). Generated by \`npm run map:selection\`; it
contains no wall-clock value, random value or browser-only state.

Version: \`${report.version}\`. The report drives the real \`createMapSelectionOverlay\` adapter over a
deterministic 30-taxi/41-civilian frame and over the real 057 fleet fixture.

## Identity and hit test

${report.contract.identity}

${report.contract.hitTest}

Limits: ${report.contract.limits.maximumHz} Hz marker ceiling, ${report.contract.limits.vehicles}
vehicles, ${report.contract.limits.markerSizePx} px marker, ${report.contract.limits.hitRadiusPx} px
default hit radius (maximum ${report.contract.limits.maximumHitRadiusPx} px) and
${report.contract.limits.globalListeners} global listeners.

## Markers

| Scenario | Marker | Kind | Symbol | Label | Canvas x, y | Selected |
| --- | --- | --- | --- | --- | --- | --- |
${markerRows}

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

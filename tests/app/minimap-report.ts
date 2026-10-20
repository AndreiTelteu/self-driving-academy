import { readMinimapFrame, readMinimapGeometry } from '../../src/app';
import {
  createMinimapScene,
  formatDistanceM,
  formatDuration,
  MINIMAP_LIMITS,
  MINIMAP_VERSION,
  projectMinimap,
  projectMinimapPoint,
} from '../../src/ui';
import type {
  MinimapDynamicCommand,
  MinimapFrame,
  MinimapGeometry,
  MinimapMarker,
  MinimapScene,
  MinimapStaticCommand,
} from '../../src/ui';
import {
  createEtaWorld,
  disposeEtaWorld,
  etaObservation,
  graphOf,
  laneStart,
  rideOf,
} from '../fleet/eta-fixture';
import type { EtaWorld } from '../fleet/eta-fixture';
import { createMinimapHarness, frame as buildFrame, root } from '../ui/minimap-fixture';
import { serializeHud } from '../ui/hud-dom';

export interface MinimapReportScenario {
  readonly name: string;
  readonly frame: Readonly<{
    tick: number;
    taxiId: string | null;
    position: Readonly<{ x: number; y: number; z: number }> | null;
    headingRad: number | null;
    rideId: string | null;
  }>;
  readonly route: Readonly<{
    status: string;
    reason: string | null;
    laneIds: readonly string[] | null;
    pointCount: number;
  }>;
  readonly progressText: string;
  readonly etaText: string;
  readonly routeText: string;
  readonly description: string;
  readonly markers: readonly MinimapMarker[];
  readonly commands: readonly MinimapDynamicCommand[];
  readonly dom: string;
  readonly stats: Readonly<Record<string, number | boolean | string>>;
}

export interface MinimapCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface MinimapReport {
  readonly version: typeof MINIMAP_VERSION;
  readonly contract: Readonly<{
    transform: Readonly<{
      widthPx: number;
      heightPx: number;
      paddingPx: number;
      scale: number;
      projection: string;
    }>;
    limits: Readonly<Record<string, number | string>>;
  }>;
  readonly geometry: Readonly<{
    mapId: string;
    bounds: MinimapGeometry['bounds'];
    stats: MinimapScene['stats'];
    staticCommands: readonly MinimapStaticCommand[];
  }>;
  readonly scenarios: readonly MinimapReportScenario[];
  readonly checks: readonly MinimapCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): MinimapCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function pointKey(x: number, y: number): string {
  return `${x.toFixed(6)},${y.toFixed(6)}`;
}

function headingOfLane(world: EtaWorld, laneId: string): number {
  const path = graphOf(world).getDirectedPath(laneId);
  if (path === null || path.points.length < 2) throw new Error(`Missing lane ${laneId}`);
  const first = path.points[0]!,
    second = path.points[1]!;
  return Math.atan2(second.z - first.z, second.x - first.x);
}

function renderScenario(
  geometry: MinimapGeometry,
  scene: MinimapScene,
  name: string,
  view: MinimapFrame,
): MinimapReportScenario {
  const harness = createMinimapHarness(geometry);
  harness.minimap.update(view, 0);
  harness.minimap.update(view, 500);
  const projection = projectMinimap(scene, view),
    stats = harness.minimap.getStats(),
    dom = serializeHud(root(harness));
  harness.minimap.dispose();
  return Object.freeze({
    name,
    frame: Object.freeze({
      tick: view.tick,
      taxiId: view.taxi?.vehicleId ?? null,
      position: view.positionM,
      headingRad: view.headingRad,
      rideId: view.ride?.rideId ?? null,
    }),
    route: Object.freeze({
      status: projection.route.status,
      reason: projection.route.reason,
      laneIds: projection.route.laneIds,
      pointCount: projection.route.points.length,
    }),
    progressText: projection.progressText,
    etaText: projection.etaText,
    routeText: projection.routeText,
    description: projection.description,
    markers: projection.markers,
    commands: projection.dynamicCommands,
    dom,
    stats,
  });
}

export function runMinimapReport(): MinimapReport {
  const world = createEtaWorld();
  try {
    const registry = world.rideWorld.dispatcherWorld.registry,
      lifecycle = world.rideWorld.lifecycle,
      planner = world.rideWorld.dispatcherWorld.planner,
      map = world.rideWorld.dispatcherWorld.map,
      geometry = readMinimapGeometry({ map, graph: graphOf(world) }),
      scene = createMinimapScene(geometry),
      sources = { fleet: registry, lifecycle, eta: world.eta },
      ride = rideOf(world),
      routeLaneIds = world.routeLaneIds,
      startLane = routeLaneIds[0]!,
      midIndex = Math.min(2, routeLaneIds.length - 1),
      midLane = routeLaneIds[midIndex]!,
      endLane = routeLaneIds[routeLaneIds.length - 1]!,
      startPosition = laneStart(world, startLane),
      midPosition = laneStart(world, midLane),
      endPosition = laneStart(world, endLane),
      startHeading = headingOfLane(world, startLane),
      firstEstimate = world.eta.observe(etaObservation(world, { tick: 10, speedMps: 8 })),
      startView = readMinimapFrame(sources, {
        taxiId: ride.taxiId,
        tick: 10,
        positionM: startPosition,
        headingRad: startHeading,
      }),
      start = renderScenario(geometry, scene, 'TO_PICKUP · start', startView),
      secondEstimate = world.eta.observe(
        etaObservation(world, { tick: 11, positionM: midPosition, speedMps: 8 }),
      ),
      progressView = readMinimapFrame(sources, {
        taxiId: ride.taxiId,
        tick: 11,
        positionM: midPosition,
        headingRad: headingOfLane(world, midLane),
      }),
      progress = renderScenario(geometry, scene, 'TO_PICKUP · progress', progressView),
      noPositionView = readMinimapFrame(sources, {
        taxiId: ride.taxiId,
        tick: 12,
        positionM: null,
      }),
      noPosition = renderScenario(geometry, scene, 'TO_PICKUP · no position', noPositionView),
      other = registry
        .list()
        .find((vehicle) => vehicle.driverKind === 'TAXI' && vehicle.vehicleId !== ride.taxiId);
    if (other === undefined) throw new Error('The report requires a second taxi');
    const switchView = readMinimapFrame(sources, {
        taxiId: other.vehicleId,
        tick: 12,
        positionM: endPosition,
        headingRad: headingOfLane(world, endLane),
      }),
      switched = renderScenario(geometry, scene, 'taxi switch · no ride', switchView),
      foreignView = readMinimapFrame(sources, {
        taxiId: other.vehicleId,
        tick: 12,
        positionM: endPosition,
        rideId: ride.rideId,
      }),
      foreign = renderScenario(geometry, scene, 'taxi switch · foreign ride', foreignView);
    planner.setBlocked([startLane]);
    const staleEstimate = world.eta.observe(
        etaObservation(world, { tick: 13, positionM: midPosition, speedMps: 8 }),
      ),
      staleView = readMinimapFrame(sources, {
        taxiId: ride.taxiId,
        tick: 13,
        positionM: midPosition,
        headingRad: headingOfLane(world, midLane),
      }),
      stale = renderScenario(geometry, scene, 'TO_PICKUP · stale after replan', staleView);
    if (firstEstimate.routeLaneIds === null || secondEstimate.routeLaneIds === null)
      throw new Error('The report requires a certified 041 route');

    const pickupZone = geometry.zones.find((zone) => zone.zoneId === ride.pickupZoneId),
      dropoffZone = geometry.zones.find((zone) => zone.zoneId === ride.dropoffZoneId);
    if (pickupZone === undefined || dropoffZone === undefined)
      throw new Error('The report requires real service-zone markers');
    const startProjection = projectMinimap(scene, startView),
      progressProjection = projectMinimap(scene, progressView),
      staleProjection = projectMinimap(scene, staleView),
      switchedProjection = projectMinimap(scene, switchView),
      foreignProjection = projectMinimap(scene, foreignView),
      taxiMarker = startProjection.markers.find((entry) => entry.role === 'TAXI'),
      pickupMarker = startProjection.markers.find((entry) => entry.role === 'PICKUP'),
      dropoffMarker = startProjection.markers.find((entry) => entry.role === 'DROPOFF'),
      routeCommand = startProjection.dynamicCommands.find((command) => command.kind === 'route'),
      pickupPoint = projectMinimapPoint(scene.transform, pickupZone.point),
      dropoffPoint = projectMinimapPoint(scene.transform, dropoffZone.point),
      taxiPoint = projectMinimapPoint(scene.transform, startPosition),
      allowed = new Set<string>();
    for (const lane of geometry.lanes)
      for (const point of lane.points) {
        const projected = projectMinimapPoint(scene.transform, point);
        allowed.add(pointKey(projected.x, projected.y));
      }
    for (const movement of geometry.movements)
      for (const point of movement.points) {
        const projected = projectMinimapPoint(scene.transform, point);
        allowed.add(pointKey(projected.x, projected.y));
      }
    if (routeCommand?.kind !== 'route') throw new Error('The report requires a drawn route');
    const allRoutePointsReal = routeCommand.points.every((point) =>
      allowed.has(pointKey(point.x, point.y)),
    );

    const bounded = createMinimapHarness(geometry),
      moving = buildFrame({
        taxi: { vehicleId: ride.taxiId, slot: registry.get(ride.taxiId)?.slot ?? 1 },
        positionM: startPosition,
        headingRad: startHeading,
        tick: 10,
        ride: {
          rideId: ride.rideId,
          taxiId: ride.taxiId,
          state: ride.state,
          pickupZoneId: ride.pickupZoneId,
          dropoffZoneId: ride.dropoffZoneId,
        },
        route: startView.route,
      });
    for (let index = 0; index < 60; index += 1)
      bounded.minimap.update(
        {
          ...moving,
          tick: 10 + index,
          positionM: { ...startPosition, x: startPosition.x + index * 0.2 },
        },
        index * 16,
      );
    const boundedStats = bounded.minimap.getStats();
    bounded.minimap.dispose();

    const checks = [
      check('contract-version', MINIMAP_VERSION, startView.version, '074 frame version'),
      check(
        'real-map-id',
        map.mapId,
        geometry.mapId,
        'the minimap uses the validated 032 map, not a second map',
      ),
      check(
        'real-lane-count',
        map.lanes.length,
        scene.stats.lanes,
        'every directed 033 lane is part of the static geometry',
      ),
      check(
        'real-zone-count',
        map.serviceZones.length,
        scene.stats.zones,
        'every service zone anchor is available for markers',
      ),
      check(
        'north-up-projection',
        '230.0,10.0',
        (() => {
          const projected = projectMinimapPoint(scene.transform, geometry.bounds.maxM);
          return `${projected.x.toFixed(1)},${projected.y.toFixed(1)}`;
        })(),
        'max X/+Z maps to the top-right padded corner; +Z is up',
      ),
      check(
        'route-lanes-from-064',
        firstEstimate.routeLaneIds.join(','),
        routeCommand.laneIds.join(','),
        'route lane ids are exactly the certified 064 route',
      ),
      check(
        'route-points-are-real-geometry',
        true,
        allRoutePointsReal,
        'each route pixel is a projection of a real lane/movement point',
      ),
      check(
        'taxi-marker-on-real-position',
        `${taxiPoint.x.toFixed(3)},${taxiPoint.y.toFixed(3)}`,
        taxiMarker === undefined
          ? 'missing'
          : `${taxiMarker.x.toFixed(3)},${taxiMarker.y.toFixed(3)}`,
        'the taxi marker is the projected 005 readback, never snapped onto the route',
      ),
      check(
        'taxi-heading-from-geometry',
        Number(startHeading.toFixed(6)),
        Number((taxiMarker?.headingRad ?? Number.NaN).toFixed(6)),
        'the heading arrow uses the directed lane tangent',
      ),
      check(
        'pickup-marker-real-zone',
        `${pickupPoint.x.toFixed(3)},${pickupPoint.y.toFixed(3)}`,
        pickupMarker === undefined
          ? 'missing'
          : `${pickupMarker.x.toFixed(3)},${pickupMarker.y.toFixed(3)}`,
        `pickup marker at the real ${ride.pickupZoneId} anchor`,
      ),
      check(
        'dropoff-marker-real-zone',
        `${dropoffPoint.x.toFixed(3)},${dropoffPoint.y.toFixed(3)}`,
        dropoffMarker === undefined
          ? 'missing'
          : `${dropoffMarker.x.toFixed(3)},${dropoffMarker.y.toFixed(3)}`,
        `dropoff marker at the real ${ride.dropoffZoneId} anchor`,
      ),
      check(
        'pickup-not-swapped',
        true,
        pickupMarker?.zoneId === ride.pickupZoneId && dropoffMarker?.zoneId === ride.dropoffZoneId,
        'pickup/dropoff roles follow the 061 record',
      ),
      check(
        'eta-from-064',
        `~${formatDuration(firstEstimate.etaSeconds)}`,
        startProjection.etaText,
        'ETA is the certified 064 estimate',
      ),
      check(
        'progress-from-064',
        `${Math.round((firstEstimate.progressFraction ?? 0) * 100)}% · ${formatDistanceM(firstEstimate.remainingDistanceM)}`,
        startProjection.progressText,
        'progress is the certified 064 progress',
      ),
      check(
        'progress-advances',
        true,
        (secondEstimate.progressFraction ?? 0) >= (firstEstimate.progressFraction ?? 0) &&
          progressProjection.progressText !== startProjection.progressText,
        'a forward observation moves the marker/route progress',
      ),
      check(
        'stale-route-dropped',
        true,
        staleEstimate.reason === 'ROUTE_STALE' &&
          staleProjection.route.status === 'NO_ROUTE' &&
          staleProjection.route.laneIds === null &&
          stale.route.laneIds === null,
        'a stale 041 plan is not drawn as the current route',
      ),
      check(
        'stale-route-accessible',
        true,
        staleProjection.description.includes('ROUTE_STALE') &&
          staleProjection.routeText.includes('ROUTE_STALE'),
        'the no-route state is explicit in text',
      ),
      check(
        'taxi-switch-updates',
        true,
        switchView.taxi?.vehicleId === other.vehicleId &&
          switchedProjection.route.status === 'NO_ROUTE' &&
          switched.route.status === 'NO_ROUTE' &&
          switchedProjection.markers.filter((entry) => entry.role === 'TAXI').length === 1,
        'selecting another taxi drops the old route and moves the taxi marker',
      ),
      check(
        'foreign-ride-not-drawn',
        true,
        foreignView.route.reason === 'FOREIGN_VEHICLE' &&
          foreignProjection.markers.filter((entry) => entry.role !== 'TAXI').length === 0,
        'another taxi’s ride markers and route are not shown',
      ),
      check(
        'no-position-explicit',
        true,
        noPositionView.positionM === null &&
          projectMinimap(scene, noPositionView).description.includes(
            'Poziția taxiului nu este disponibilă',
          ),
        'a missing position is an explicit state, not an invented marker',
      ),
      check(
        'accessible-description',
        true,
        startProjection.description.includes('Minimapă nord-sus') &&
          startProjection.description.includes(map.mapId) &&
          startProjection.description.includes('ETA') &&
          startProjection.description.includes('Progres'),
        'the canvas has a textual north-up description with route, progress and ETA',
      ),
      check(
        'static-geometry-once',
        true,
        boundedStats.staticPaints === 1,
        '60 marker frames paint the static canvas exactly once',
      ),
      check(
        'bounded-redraw',
        true,
        (boundedStats.dynamicPaints as number) <= 10 && (boundedStats.dynamicPaints as number) >= 2,
        `60 frames at 16 ms produce ${boundedStats.dynamicPaints} marker repaints (10 Hz ceiling)`,
      ),
      check(
        'deterministic-dom',
        start.dom,
        renderScenario(geometry, scene, 'TO_PICKUP · start', startView).dom,
        'the same frame renders byte-identical DOM',
      ),
      check(
        'bounded-lifecycle',
        true,
        (start.stats.elements as number) === MINIMAP_LIMITS.elements &&
          (start.stats.listeners as number) === 0,
        'the report adapter exposes no listeners and owns a fixed node set',
      ),
    ];
    const passed = checks.filter((entry) => entry.pass).length;
    return Object.freeze({
      version: MINIMAP_VERSION,
      contract: Object.freeze({
        transform: Object.freeze({
          widthPx: scene.transform.widthPx,
          heightPx: scene.transform.heightPx,
          paddingPx: MINIMAP_LIMITS.paddingPx,
          scale: scene.transform.scale,
          projection:
            'xPx = width/2 + (xM - centerXM) * scale; yPx = height/2 - (zM - centerZM) * scale; +Z is north/up',
        }),
        limits: Object.freeze({
          maximumHz: MINIMAP_LIMITS.maximumHz,
          routeLanes: MINIMAP_LIMITS.routeLanes,
          elements: MINIMAP_LIMITS.elements,
          textNodes: MINIMAP_LIMITS.textNodes,
          listeners: MINIMAP_LIMITS.listeners,
        }),
      }),
      geometry: Object.freeze({
        mapId: geometry.mapId,
        bounds: geometry.bounds,
        stats: scene.stats,
        staticCommands: scene.staticCommands,
      }),
      scenarios: Object.freeze([start, progress, noPosition, switched, foreign, stale]),
      checks: Object.freeze(checks),
      summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
    });
  } finally {
    disposeEtaWorld(world);
  }
}

export function minimapReportMarkdown(report: MinimapReport): string {
  const scenarioSections = report.scenarios
      .map(
        (entry) => `### ${entry.name}

| Value | Result |
| --- | --- |
| Tick | ${entry.frame.tick} |
| Taxi | ${entry.frame.taxiId ?? '—'} |
| Position | ${entry.frame.position === null ? '—' : `${entry.frame.position.x.toFixed(1)}, ${entry.frame.position.z.toFixed(1)} m`} |
| Route | ${entry.route.status}${entry.route.reason === null ? '' : ` · ${entry.route.reason}`} |
| Route lanes | ${entry.route.laneIds?.length ?? 0} (${entry.route.pointCount} px points) |
| Progress | ${entry.progressText} |
| ETA | ${entry.etaText} |
| Markers | ${entry.markers.map((marker) => `${marker.role}${marker.zoneId === null ? '' : `(${marker.zoneId})`}`).join(', ') || '—'} |

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
      .join('\n');
  return `# 074 minimap report

Machine-readable transcript: [report.json](report.json). Generated by \`npm run hud:minimap\`; it
contains no wall-clock value, random value or browser-only state.

Version: \`${report.version}\`. The report reads the real 032 map, 033 lane graph, 041 route,
057 fleet, 061 ride and 064 ETA, then drives the real \`createMinimap\` adapter and records its
drawing commands.

## Projection

${report.contract.transform.projection}. Size ${report.contract.transform.widthPx}x${report.contract.transform.heightPx},
padding ${report.contract.transform.paddingPx} px, scale ${report.contract.transform.scale.toFixed(6)} px/m.
Markers repaint at most ${report.contract.limits.maximumHz} Hz; static roads are painted once.

Map \`${report.geometry.mapId}\`, bounds X ${report.geometry.bounds.minM.x}..${report.geometry.bounds.maxM.x},
Z ${report.geometry.bounds.minM.z}..${report.geometry.bounds.maxM.z}: ${report.geometry.stats.lanes} lanes,
${report.geometry.stats.roads} road polylines, ${report.geometry.stats.intersections} intersections,
${report.geometry.stats.movements} movements and ${report.geometry.stats.zones} service zones.

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

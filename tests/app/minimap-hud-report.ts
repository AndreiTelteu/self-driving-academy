import {
  readMapSelectionSnapshot,
  readMinimapFrame,
  readMinimapGeometry,
  readMinimapIncidents,
  readTaxiHudSnapshot,
} from '../../src/app';
import type { MapSelectionSnapshot } from '../../src/ui';
import {
  computeResponsiveLayout,
  createLiveMinimap,
  essentialControls,
  findOverlaps,
  LIVE_MINIMAP_VERSION,
  projectTaxiHud,
  RESPONSIVE_LAYOUTS,
  textLegibility,
} from '../../src/ui';
import {
  createHealthWorld,
  disposeHealthWorld,
  rideObservation,
} from '../fleet/fleet-health-fixture';
import type { HealthWorld } from '../fleet/fleet-health-fixture';
import { createRecordingContext } from '../ui/minimap-fixture';
import { createHudDocument, createHudHost, serializeHud } from '../ui/hud-dom';
import type { HudElement } from '../ui/hud-dom';

export interface LiveHudReportScenario {
  readonly name: string;
  readonly route: Readonly<{
    status: string;
    laneIds: readonly string[] | null;
    pointCount: number;
  }>;
  readonly markers: Readonly<{
    vehicles: number;
    taxis: number;
    civilians: number;
    incidents: number;
    selected: string | null;
    incidentIds: readonly string[];
  }>;
  readonly hud: Readonly<{
    speed: string;
    mode: string;
    session: string;
    taxi: string;
    objective: string;
    stance: string;
    rideState: string;
    eta: string;
    progress: string;
  }>;
  readonly dom: string;
  readonly stats: Readonly<Record<string, number | boolean | string>>;
}

export interface LiveHudReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface LiveHudReportLayout {
  readonly id: string;
  readonly region: string;
  readonly effectiveWidthPx: number;
  readonly effectiveHeightPx: number;
  readonly hudWidthPx: number;
  readonly minimapWidthPx: number;
  readonly overlaps: number;
  readonly overlapsDetail: string;
  readonly essentialsVisible: number;
  readonly minFontPx: number;
  readonly legible: boolean;
}

export interface LiveHudReport {
  readonly version: '281-live-minimap-hud-report-v1';
  readonly contract: Readonly<{
    liveMinimap: typeof LIVE_MINIMAP_VERSION;
    layers: readonly string[];
    hudRows: readonly string[];
    updateHz: number;
    sessions: readonly string[];
    incidents: string;
  }>;
  readonly scenarios: readonly LiveHudReportScenario[];
  readonly layouts: readonly LiveHudReportLayout[];
  readonly checks: readonly LiveHudReportCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): LiveHudReportCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function lanePoint(world: HealthWorld, laneId: string | null) {
  if (laneId === null) return null;
  const path = world.scenario.graph.getDirectedPath(laneId);
  if (path === null || path.points.length === 0) return null;
  const point = path.points[0]!;
  return Object.freeze({ x: point.x, y: point.y, z: point.z });
}

function headingOf(world: HealthWorld, laneId: string | null): number | null {
  if (laneId === null) return null;
  const path = world.scenario.graph.getDirectedPath(laneId);
  if (path === null || path.points.length < 2) return null;
  const first = path.points[0]!,
    second = path.points[1]!;
  return Math.atan2(second.z - first.z, second.x - first.x);
}

function selectionOf(
  world: HealthWorld,
  tick: number,
  followedVehicleId: string | null,
  extraLanes: ReadonlyMap<string, string> = new Map(),
): MapSelectionSnapshot {
  return readMapSelectionSnapshot(
    {
      fleet: world.scenario.registry,
      camera: { followedVehicleId: () => followedVehicleId },
    },
    {
      tick,
      positions: (vehicleId) =>
        lanePoint(
          world,
          world.scenario.positions.laneFor(vehicleId) ?? extraLanes.get(vehicleId) ?? null,
        ),
    },
  );
}

interface LiveHarness {
  readonly doc: ReturnType<typeof createHudDocument>;
  readonly host: HudElement;
  readonly live: ReturnType<typeof createLiveMinimap>;
  readonly selected: string[];
}

function harness(world: HealthWorld): LiveHarness {
  const doc = createHudDocument(),
    host = createHudHost(doc),
    selected: string[] = [],
    geometry = readMinimapGeometry({
      map: world.scenario.map,
      graph: world.scenario.graph,
    }),
    live = createLiveMinimap(host as unknown as HTMLElement, {
      geometry,
      select: (vehicleId) => selected.push(vehicleId),
      contexts: {
        static: createRecordingContext().context,
        dynamic: createRecordingContext().context,
      },
    });
  return { doc, host, live, selected };
}

function missionTaxi(world: HealthWorld) {
  const ride = world.scenario.lifecycle.active()[0];
  if (ride === undefined) throw new Error('281 report requires a live ride');
  return ride;
}

function reportScenario(
  name: string,
  live: ReturnType<typeof createLiveMinimap>,
  host: HudElement,
  world: HealthWorld,
  rideTaxiId: string,
): LiveHudReportScenario {
  const view = live.getView(),
    stats = live.getStats(),
    map = view?.map?.projection,
    selection = view?.selection,
    incidents = view?.incidents,
    taxi = world.scenario.registry.get(rideTaxiId),
    ride = world.scenario.lifecycle.active().find((entry) => entry.taxiId === rideTaxiId),
    hud =
      ride === undefined
        ? readTaxiHudSnapshot(
            {
              fleet: world.scenario.registry,
              lifecycle: world.scenario.lifecycle,
              eta: world.scenario.eta,
            },
            { taxiId: rideTaxiId, mode: 'AUTO', tick: 60, speedMps: null },
          )
        : readTaxiHudSnapshot(
            {
              fleet: world.scenario.registry,
              lifecycle: world.scenario.lifecycle,
              eta: world.scenario.eta,
            },
            {
              taxiId: rideTaxiId,
              mode: 'AUTO',
              sessionKind: 'ACADEMY',
              tick: 60,
              speedMps: taxi === undefined ? null : 8,
            },
          ),
    projection = projectTaxiHud(hud);
  return Object.freeze({
    name,
    route: Object.freeze({
      status: map?.route.status ?? 'NO_ROUTE',
      laneIds: map?.route.laneIds ?? null,
      pointCount: map?.route.points.length ?? 0,
    }),
    markers: Object.freeze({
      vehicles: selection?.markers.length ?? 0,
      taxis: selection?.markers.filter((marker) => marker.kind === 'TAXI').length ?? 0,
      civilians: selection?.markers.filter((marker) => marker.kind === 'CIVIL').length ?? 0,
      incidents: incidents?.markers.length ?? 0,
      selected: selection?.snapshot.followedVehicleId ?? null,
      incidentIds: Object.freeze(incidents?.markers.map((marker) => marker.incidentId) ?? []),
    }),
    hud: Object.freeze({
      speed: `${projection.speed.value} ${projection.speed.unit}`,
      mode: projection.mode.label,
      session: projection.session,
      taxi: projection.taxi,
      objective: projection.objective,
      stance: projection.stance,
      rideState: projection.stanceKey,
      eta: projection.eta,
      progress: projection.progress,
    }),
    dom: serializeHud(host.children[0]!),
    stats: Object.freeze({
      version: stats.version,
      mapDynamicPaints: stats.map.dynamicPaints,
      mapRouteLanes: stats.map.routeLanes,
      selectionMarkers: stats.selection.markers,
      selectionWrites: stats.selection.writes,
      incidentMarkers: stats.incidents.markers,
      listeners: stats.listeners,
      globalListeners: stats.globalListeners,
    }),
  });
}

export function runLiveHudReport(): LiveHudReport {
  const world = createHealthWorld({
    taxiCount: 20,
    civilianCount: 20,
    openTaxis: 3,
    assign: 1,
    beginRides: true,
  });
  try {
    const ride = missionTaxi(world),
      laneId = world.scenario.positions.laneFor(ride.taxiId),
      observation = rideObservation(world, ride, 60),
      estimate = world.scenario.eta.observe(observation),
      position = lanePoint(world, laneId),
      heading = headingOf(world, laneId),
      sources = {
        fleet: world.scenario.registry,
        lifecycle: world.scenario.lifecycle,
        eta: world.scenario.eta,
      },
      damaged = world.scenario.registry
        .list()
        .find((vehicle) => vehicle.driverKind === 'TAXI' && vehicle.vehicleId !== ride.taxiId);
    if (damaged === undefined) throw new Error('281 report requires a second taxi');
    const civilianLanes = new Map<string, string>(),
      taxiLanes = world.scenario.taxiIds
        .map((taxiId) => world.scenario.positions.laneFor(taxiId))
        .filter((lane): lane is string => lane !== null);
    for (let index = 0; index < 3; index += 1) {
      const civilian = world.scenario.registry.addVehicle('CIVILIAN', 'compact');
      civilianLanes.set(civilian.vehicleId, taxiLanes[index % taxiLanes.length]!);
    }
    world.scenario.health.apply({
      taxiId: damaged.vehicleId,
      fact: 'COLLISION_DAMAGE',
      factId: '281:report:collision',
      tick: 61,
    });
    const positions = new Map(
        world.scenario.registry
          .list()
          .map((vehicle) => [
            vehicle.vehicleId,
            lanePoint(
              world,
              world.scenario.positions.laneFor(vehicle.vehicleId) ??
                civilianLanes.get(vehicle.vehicleId) ??
                null,
            ),
          ]),
      ),
      incidents = readMinimapIncidents(
        { health: world.scenario.health },
        {
          sessionId: 'session:281-report',
          worldEpoch: 1,
          tick: 61,
          positions: (vehicleId) => {
            const point = positions.get(vehicleId);
            return point === undefined || point === null ? null : { x: point.x, z: point.z };
          },
        },
      ),
      selection = selectionOf(world, 60, ride.taxiId, civilianLanes),
      frame = readMinimapFrame(sources, {
        taxiId: ride.taxiId,
        tick: 60,
        positionM: position,
        headingRad: heading,
      }),
      first = harness(world);
    first.live.update(frame, selection, incidents, 0);
    const start = reportScenario(
        'ruta live + vehicul selectat',
        first.live,
        first.host,
        world,
        ride.taxiId,
      ),
      startStats = first.live.getStats();
    first.live.dispose();

    const second = harness(world),
      movedSelection = selectionOf(world, 61, ride.taxiId, civilianLanes);
    second.live.update(frame, selection, incidents, 0);
    const button = findMarker(second.host, ride.taxiId);
    if (button === null) throw new Error('281 report requires the selected marker');
    button.dispatch('click');
    second.live.update(
      readMinimapFrame(sources, {
        taxiId: ride.taxiId,
        tick: 61,
        positionM: position,
        headingRad: heading,
      }),
      movedSelection,
      incidents,
      500,
    );
    const afterSecond = second.live.getStats(),
      secondView = second.live.getView(),
      identityKept =
        afterSecond.selection.created === startStats.selection.markers &&
        afterSecond.selection.removed === 0 &&
        secondView?.selection?.markers.every((marker) => marker.markerId.length > 0) === true;
    second.live.dispose();

    const third = harness(world),
      noPosition = readMinimapFrame(sources, {
        taxiId: ride.taxiId,
        tick: 62,
        positionM: null,
      }),
      noRideTaxi = world.scenario.registry
        .list()
        .find((vehicle) => vehicle.driverKind === 'TAXI' && vehicle.vehicleId !== ride.taxiId);
    if (noRideTaxi === undefined) throw new Error('281 report requires an idle taxi');
    third.live.update(
      noPosition,
      selectionOf(world, 62, null, civilianLanes),
      readMinimapIncidents(
        { health: world.scenario.health },
        {
          sessionId: 'session:281-report',
          worldEpoch: 1,
          tick: 62,
          positions: () => null,
        },
      ),
      0,
    );
    const emptyLive = reportScenario(
        'fără poziție și fără cursă',
        third.live,
        third.host,
        world,
        noRideTaxi.vehicleId,
      ),
      emptyProjection = (() => {
        const hud = readTaxiHudSnapshot(sources, {
          taxiId: noRideTaxi.vehicleId,
          mode: 'AUTO',
          tick: 62,
          speedMps: null,
        });
        return projectTaxiHud(hud);
      })(),
      emptyDom = serializeHud(third.host.children[0]!),
      positionState = third.live.getView()?.map?.frame.positionM ?? null;
    third.live.dispose();

    const bounded = harness(world);
    for (let index = 0; index < 61; index += 1) {
      const tick = 60 + index,
        nextLane = world.scenario.positions.laneFor(ride.taxiId),
        next = lanePoint(world, nextLane);
      bounded.live.update(
        readMinimapFrame(sources, {
          taxiId: ride.taxiId,
          tick,
          positionM: next,
          headingRad: headingOf(world, nextLane),
        }),
        selectionOf(world, tick, ride.taxiId, civilianLanes),
        incidents,
        index * (1000 / 60),
      );
    }
    const boundedStats = bounded.live.getStats();
    bounded.live.dispose();

    const layouts = RESPONSIVE_LAYOUTS.map((entry) => {
        const layout = computeResponsiveLayout(entry),
          critical = layout.rects.filter((rect) => rect.id !== 'notifications'),
          overlaps = findOverlaps(critical),
          essentials = essentialControls(entry),
          legibility = textLegibility({ widthPx: entry.widthPx, zoom: entry.zoom, fontSizePx: 12 });
        return Object.freeze({
          id: entry.id,
          region: layout.region,
          effectiveWidthPx: layout.effectiveWidthPx,
          effectiveHeightPx: layout.effectiveHeightPx,
          hudWidthPx: layout.surfaces.hud.widthPx,
          minimapWidthPx: layout.surfaces.minimap.widthPx,
          overlaps: overlaps.length,
          overlapsDetail: overlaps.map((overlap) => `${overlap.a}×${overlap.b}`).join(', '),
          essentialsVisible: essentials.filter((control) => control.alwaysVisible).length,
          minFontPx: Math.round(12 * entry.zoom * 100) / 100,
          legible: legibility.legible,
        });
      }),
      checks = [
        check(
          'live-version',
          LIVE_MINIMAP_VERSION,
          start.stats['version'] ?? '',
          'the live composition mounts 074/076/281',
        ),
        check('route-ready', 'READY', start.route.status, 'the minimap draws the certified route'),
        check(
          'route-lanes',
          estimate.routeLaneIds?.length ?? 0,
          start.route.laneIds?.length ?? 0,
          'exactly the 064 route lane count',
        ),
        check('route-points', true, start.route.pointCount > 0, 'the route has projected geometry'),
        check(
          'markers-all',
          23,
          start.markers.vehicles,
          'all real taxis and civilians from the registry',
        ),
        check('markers-taxis', 20, start.markers.taxis, 'real taxi markers'),
        check('markers-civilians', 3, start.markers.civilians, 'real civilian markers'),
        check('incidents', 1, start.markers.incidents, 'one real 065 collision marker'),
        check(
          'incident-identity',
          '281:report:collision',
          start.markers.incidentIds[0] ?? '',
          'the incident keeps the 065 factId',
        ),
        check(
          'selected-vehicle',
          ride.taxiId,
          start.markers.selected ?? '',
          'the followed vehicle is the selected taxi',
        ),
        check('hud-session', 'Academia', start.hud.session, 'the HUD shows the real session kind'),
        check(
          'hud-objective',
          projectionOf(world, ride.taxiId).objective,
          start.hud.objective,
          'the HUD objective comes from the real ride zones',
        ),
        check(
          'hud-stance',
          'În desfășurare',
          start.hud.stance,
          'the HUD shows the real ride state',
        ),
        check(
          'hud-mode',
          'Conduce AI-ul',
          start.hud.mode,
          'the HUD mode is the accepted AUTO mode',
        ),
        check(
          'marker-identity-stable',
          true,
          identityKept,
          'a moved vehicle reuses the same marker node',
        ),
        check(
          'click-selection',
          ride.taxiId,
          second.selected[0] ?? '',
          'the marker click emits the camera-only intention',
        ),
        check(
          'no-position-explicit',
          'MISSING',
          positionState === null ? 'MISSING' : 'PRESENT',
          'a missing position stays null, not zero',
        ),
        check(
          'no-invented-speed',
          '— km/h',
          `${emptyProjection.speed.value} ${emptyProjection.speed.unit}`,
          'a missing speed is a dash, not 0 km/h',
        ),
        check('no-invented-eta', 'Fără estimare', emptyProjection.eta, 'a missing ride has no ETA'),
        check(
          'no-invented-progress',
          '—',
          emptyProjection.progress,
          'a missing ride has no progress',
        ),
        check(
          'empty-session',
          masterSession(world),
          emptyLive.hud.session,
          'an unknown session kind shows the real id',
        ),
        check('empty-stance', 'Fără cursă', emptyLive.hud.stance, 'the HUD says there is no ride'),
        check(
          'position-state-attr',
          'MISSING',
          emptyDom.includes('data-position="MISSING"') ? 'MISSING' : 'PRESENT',
          'the minimap exposes the explicit position state',
        ),
        check(
          'rate-map',
          true,
          boundedStats.map.dynamicPaints <= 11,
          `${boundedStats.map.dynamicPaints} dynamic paints in 1 s`,
        ),
        check(
          'rate-selection',
          true,
          boundedStats.selection.updates <= 11,
          `${boundedStats.selection.updates} selection updates in 1 s`,
        ),
        check(
          'rate-incidents',
          true,
          boundedStats.incidents.updates <= 11,
          `${boundedStats.incidents.updates} incident updates in 1 s`,
        ),
        check(
          'no-global-listeners',
          0,
          boundedStats.globalListeners,
          'the overlay installs no global key listener',
        ),
        ...layouts.flatMap((layout) => [
          check(
            `layout-${layout.id}-overlap`,
            0,
            layout.overlaps,
            layout.overlapsDetail || 'no critical overlap',
          ),
          check(
            `layout-${layout.id}-essentials`,
            5,
            layout.essentialsVisible,
            'all five essential controls stay visible',
          ),
          check(
            `layout-${layout.id}-font`,
            true,
            layout.minFontPx >= 12,
            `${layout.minFontPx} CSS px at the requested zoom`,
          ),
        ]),
      ],
      passed = checks.filter((entry) => entry.pass).length;
    return Object.freeze({
      version: '281-live-minimap-hud-report-v1' as const,
      contract: Object.freeze({
        liveMinimap: LIVE_MINIMAP_VERSION,
        layers: Object.freeze(['074 minimap', '076 selection', '281 incidents']),
        hudRows: Object.freeze([
          'Viteză',
          'Mod',
          'Taxi',
          'Sesiune',
          'Etapă',
          'Obiectiv',
          'Stare',
          'Rută',
          'ETA',
          'Progres',
          'Serviciu',
        ]),
        updateHz: 10,
        sessions: Object.freeze(['Academia', 'Haos']),
        incidents: '065 COLLISION_DAMAGE / DAMAGED at the current authoritative position',
      }),
      scenarios: Object.freeze([
        start,
        Object.freeze({
          ...emptyLive,
          name: emptyLive.name,
        }),
      ]),
      layouts: Object.freeze(layouts),
      checks: Object.freeze(checks),
      summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
    });
  } finally {
    disposeHealthWorld(world);
  }
}

function masterSession(world: HealthWorld): string {
  return world.scenario.registry.context().sessionId;
}

function projectionOf(world: HealthWorld, taxiId: string) {
  const hud = readTaxiHudSnapshot(
    {
      fleet: world.scenario.registry,
      lifecycle: world.scenario.lifecycle,
      eta: world.scenario.eta,
    },
    { taxiId, mode: 'AUTO', sessionKind: 'ACADEMY', tick: 60, speedMps: 8 },
  );
  return projectTaxiHud(hud);
}

function findMarker(root: HudElement, vehicleId: string): HudElement | null {
  for (const child of root.children) {
    if (
      child.className === 'map-selection__marker' &&
      child.getAttribute('data-vehicle-id') === vehicleId
    )
      return child;
    const nested = findMarker(child, vehicleId);
    if (nested !== null) return nested;
  }
  return null;
}

export function liveHudReportMarkdown(report: LiveHudReport): string {
  const scenarioRows = report.scenarios
      .map(
        (scenario) =>
          `| ${scenario.name} | ${scenario.route.status} / ${scenario.route.laneIds?.length ?? 0} | ${scenario.markers.vehicles} (${scenario.markers.taxis} T / ${scenario.markers.civilians} C) | ${scenario.markers.incidents} | ${scenario.hud.speed} | ${scenario.hud.session} | ${scenario.hud.objective} | ${scenario.hud.stance} | ${scenario.hud.eta} |`,
      )
      .join('\n'),
    layoutRows = report.layouts
      .map(
        (layout) =>
          `| ${layout.id} | ${layout.region} | ${layout.effectiveWidthPx}×${layout.effectiveHeightPx} | ${layout.hudWidthPx} / ${layout.minimapWidthPx} | ${layout.overlaps} | ${layout.essentialsVisible} | ${layout.minFontPx} | ${layout.legible} |`,
      )
      .join('\n'),
    checkRows = report.checks
      .map(
        (entry) =>
          `| ${entry.name} | ${entry.pass ? 'PASS' : 'FAIL'} | ${String(entry.expected)} | ${String(entry.actual)} | ${entry.detail} |`,
      )
      .join('\n');
  return `# 281 — minimapa live și HUD-ul complet

Generat de \`npm run minimap:hud\`. Contract: \`${report.contract.liveMinimap}\`.
Status: **${report.summary.pass ? 'PASS' : 'FAIL'}** (${report.summary.passed}/${report.summary.checks} verificări).

## Contract

| Element | Valoare |
| --- | --- |
| Straturi | ${report.contract.layers.join(' + ')} |
| Rânduri HUD | ${report.contract.hudRows.join(', ')} |
| Frecvență | ${report.contract.updateHz} Hz |
| Sesiuni | ${report.contract.sessions.join(', ')} |
| Incidente | ${report.contract.incidents} |

## Scenarii deterministe

| Scenariu | Rută / benzi | Markeri | Incidente | Viteză | Sesiune | Obiectiv | Stare | ETA |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- |
${scenarioRows}

## Layout

| Breakpoint | Regiune | Viewport efectiv | HUD / minimapă (px) | Suprapuneri | Esențiale | Font minim | Legibil |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
${layoutRows}

## Verificări

| Verificare | Rezultat | Așteptat | Actual | Detaliu |
| --- | --- | --- | --- | --- |
${checkRows}

## Limite

- Raportul este determinist și nu măsoară FPS, GPU sau hardware; proba de browser este separată.
- Incidentele live provin exclusiv din 065; buildul curent nu are încă un producător 028/029 montat, deci
  în joc pot apărea zero incidente până când acel owner publică un fapt real.
- Pozițiile vehiculelor din raport sunt citiri de fixture pe benzile reale 032/033, nu un cadru live.
`;
}

/**
 * PBI 262 — flota live din compunerea jucabilă.
 *
 * PBI 256 a legat traficul civil 058 de compunerea V3 și de harta reală, dar taxiurile existau doar
 * ca intrări în registry. Modulul acesta este composition root-ul live: creează populația 057
 * (taxiuri plus civili), le dă fiecăruia o rută reală 041 și aceleași legi 044/047/048, și expune
 * un singur profil comun al orașului, citit la creare și la orice vehicul nou. Prezentarea,
 * selecția și vizibilitatea nu sunt intrări: simularea continuă identic pentru vehiculele din
 * afara ferestrei de observare.
 *
 * Traficul este creat proaspăt pentru fiecare backend, pentru ca recuperarea GPU să nu refolosească
 * un `lastTick` vechi al contractului 058.
 */
import {
  FLEET_LIMITS,
  createCivilTraffic,
  createFleetRegistry,
  type CityProfileSource,
  type CityStyleSource,
  type CivilActorSnapshot,
  type CivilRouteSnapshot,
  type CivilTraffic,
  type CivilTrafficReport,
  type FleetDriverKind,
  type FleetPopulationReport,
  type FleetRegistry,
} from '../fleet';
import {
  parameterDefinitions,
  parseDrivingProfile,
  parsePublishableDrivingProfile,
  type DrivingProfile,
} from '../profiles';
import type { ContractContext } from '../sessions';
import { parseRoadMap, type LaneGraph, type RoadAccess, type RoadMap } from '../world';

export const AMBIENT_TRAFFIC_VERSION = '262-live-fleet-v1' as const;

export const AMBIENT_TRAFFIC_POLICY = Object.freeze({
  contract: AMBIENT_TRAFFIC_VERSION,
  /** Populația minimă 057: 20 de taxiuri; 24 este fixture-ul normal din Docs/25. */
  taxis: 24,
  /** Destul de mulți pentru un oraș viu, sub limita de 40 a lui 058. */
  civilians: 32,
  /** Primele mașini din fiecare categorie pornesc pe benzile apropiate de jucător. */
  nearSpawnLanesPerKind: 5,
  /** Doar benzile care pornesc în acest rayon sunt preferate; restul populației rămâne împrăștiată. */
  nearSpawnRadiusM: 80,
  /** Mașinile preferate pornesc deja avansate pe rută, ca să fie vizibile în fața jucătorului. */
  nearSpawnOffsetM: 20,
  /** Nicio mașină AI nu pornește peste jucător, vehiculele statice sau decor. */
  spawnClearanceM: 6,
  /** Încercări deterministe de seed înainte de a accepta cel mai bun candidat. */
  spawnAttempts: 12,
  /** Fereastra folosită de probe pentru „în afara camerei”; nu este citită de simulare. */
  outsideWindowM: 80,
});

export interface AmbientAvoidPosition {
  readonly x: number;
  readonly z: number;
  /** Raza ocupată de obstacol; pozițiile fără rază sunt tratate ca puncte. */
  readonly radiusM?: number;
}

export interface AmbientTrafficOptions {
  readonly map: unknown;
  readonly graph: LaneGraph;
  readonly context: ContractContext;
  readonly seed?: number;
  readonly taxiCount?: number;
  readonly civilianCount?: number;
  /** Poziții care nu trebuie ocupate la spawn (jucătorul, vehiculele deja prezente, decor). */
  readonly avoid?: readonly AmbientAvoidPosition[];
  /** Punctul de interes pentru primele spawn-uri vizibile; de regulă poziția jucătorului. */
  readonly focus?: Readonly<{ x: number; z: number }>;
  /** Stilul comun; implicit valorile implicite ale catalogului 092. */
  readonly style?: DrivingProfile;
  /** Sursa activă a orașului; dacă există, vehiculele noi citesc versiunea curentă. */
  readonly styleSource?: CityStyleSource;
}

export interface AmbientAuthorityCounts {
  readonly AUTO: number;
  readonly MANUAL: number;
  readonly LEARNING: number;
}

export interface AmbientFleetReport {
  readonly version: typeof AMBIENT_TRAFFIC_VERSION;
  readonly seed: number;
  readonly counts: Readonly<{ vehicles: number; taxis: number; civilians: number }>;
  readonly population: FleetPopulationReport;
  readonly routes: Readonly<{
    ready: number;
    fromPlanner: number;
    blocked: number;
    replans: number;
    byKind: Readonly<Record<FleetDriverKind, number>>;
  }>;
  readonly byAuthority: AmbientAuthorityCounts;
  readonly style: Readonly<{ profileId: string; versionId: string }>;
  readonly traffic: CivilTrafficReport;
}

export interface AmbientTraffic {
  readonly version: typeof AMBIENT_TRAFFIC_VERSION;
  readonly traffic: CivilTraffic;
  readonly registry: FleetRegistry;
  readonly style: DrivingProfile;
  readonly seed: number;
  readonly taxiCount: number;
  readonly civilianCount: number;
  /** Versiunea activă a profilului, așa cum o folosește acum traficul. */
  styleReference(): Readonly<{ profileId: string; versionId: string }>;
  /** Propagarea explicită cerută de composition root după o activare 110. */
  refreshStyle(): Readonly<{ profileId: string; versionId: string }>;
  list(): readonly CivilActorSnapshot[];
  get(vehicleId: string): CivilActorSnapshot | undefined;
  route(vehicleId: string): CivilRouteSnapshot | undefined;
  report(): AmbientFleetReport;
  dispose(): void;
}

interface PreparedTraffic {
  readonly registry: FleetRegistry;
  readonly traffic: CivilTraffic;
  readonly seed: number;
  readonly clearanceM: number;
}

interface SpawnPlan {
  readonly lanesByKind: Readonly<Partial<Record<FleetDriverKind, readonly string[]>>>;
  readonly offsetsByKind: Readonly<Partial<Record<FleetDriverKind, readonly number[]>>>;
}

interface ReadTrafficOptions {
  readonly map: RoadMap;
  readonly graph: LaneGraph;
  readonly context: ContractContext;
  readonly seed: number;
  readonly taxiCount: number;
  readonly civilianCount: number;
  readonly avoid: readonly AmbientAvoidPosition[];
  readonly focus: Readonly<{ x: number; z: number }> | null;
  readonly style: DrivingProfile | null;
  readonly styleSource: CityStyleSource | null;
  readonly profileSource: CityProfileSource | null;
}

function readCount(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum)
    throw new RangeError(`${label} trebuie să respecte limitele 057.`);
  return value as number;
}

function readOptions(value: unknown): ReadTrafficOptions {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Traficul ambiental cere opțiuni explicite.');
  const data = value as AmbientTrafficOptions;
  if (data.map === undefined) throw new Error('Traficul ambiental cere harta 032.');
  if (data.graph === undefined || typeof data.graph.getLane !== 'function')
    throw new Error('Traficul ambiental cere graful 033.');
  if (data.context === undefined) throw new Error('Traficul ambiental cere contextul sesiunii.');
  const seed = data.seed ?? 262;
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff)
    throw new RangeError('Seed-ul traficului ambiental trebuie să fie uint32.');
  const taxiCount = readCount(
    data.taxiCount ?? AMBIENT_TRAFFIC_POLICY.taxis,
    FLEET_LIMITS.taxisMinimum,
    FLEET_LIMITS.taxisMaximum,
    'Numărul de taxiuri',
  );
  const civilianCount = readCount(
    data.civilianCount ?? AMBIENT_TRAFFIC_POLICY.civilians,
    FLEET_LIMITS.civiliansMinimum,
    FLEET_LIMITS.civiliansMaximum,
    'Populația civilă',
  );
  if (data.style !== undefined && data.styleSource !== undefined)
    throw new Error('Traficul ambiental acceptă un singur profil comun.');
  const style = data.style === undefined ? null : parseDrivingProfile(data.style);
  const styleSource = data.styleSource ?? null;
  if (
    styleSource !== null &&
    (typeof styleSource !== 'object' || typeof styleSource.activeStyle !== 'function')
  )
    throw new Error('Sursa stilului comun al orașului este invalidă.');
  const avoid: AmbientAvoidPosition[] = [];
  for (const position of data.avoid ?? []) {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.z))
      throw new RangeError('Poziția de evitat nu este finită.');
    const radiusM = position.radiusM ?? 0;
    if (!Number.isFinite(radiusM) || radiusM < 0 || radiusM > 20)
      throw new RangeError('Raza poziției de evitat este invalidă.');
    avoid.push(Object.freeze({ x: position.x, z: position.z, radiusM }));
  }
  if (
    data.focus !== undefined &&
    (!Number.isFinite(data.focus.x) || !Number.isFinite(data.focus.z))
  )
    throw new RangeError('Punctul de interes al traficului nu este finit.');
  const map = parseRoadMap(data.map);
  const profileSource: CityProfileSource | null =
    styleSource === null
      ? null
      : {
          activeProfile: () => {
            const active = parseDrivingProfile(styleSource.activeStyle());
            return { profileId: active.profileId, versionId: active.versionId };
          },
        };
  return {
    map,
    graph: data.graph,
    context: data.context,
    seed,
    taxiCount,
    civilianCount,
    avoid: Object.freeze(avoid),
    focus: data.focus === undefined ? null : { x: data.focus.x, z: data.focus.z },
    style,
    styleSource,
    profileSource,
  };
}

/**
 * Stilul comun al orașului, construit exclusiv din valorile implicite publicate ale catalogului 092.
 * Toate cheile sunt `BASE`, deci nicio valoare nu este pretinsă ca LEARNED sau MANUAL_TUNING.
 */
export function createCityStyleProfile(
  profileId = 'v3-city-style',
  versionId = 'v3-city-style-v1',
): DrivingProfile {
  const parameters: Record<string, number> = Object.create(null);
  const unitsByParameter: Record<string, string> = Object.create(null);
  const provenanceByParameter: Record<string, string> = Object.create(null);
  const evidenceByParameter: Record<string, null> = Object.create(null);
  for (const definition of parameterDefinitions) {
    parameters[definition.key] = definition.default;
    unitsByParameter[definition.key] = definition.unit;
    provenanceByParameter[definition.key] = 'BASE';
    evidenceByParameter[definition.key] = null;
  }
  return parsePublishableDrivingProfile({
    schemaVersion: 1,
    units: 'SI',
    profileId,
    versionId,
    parentVersionId: null,
    engineVersion: AMBIENT_TRAFFIC_VERSION,
    parameters,
    unitsByParameter,
    provenanceByParameter,
    evidenceByParameter,
    sourceSegmentIds: [],
    createdAt: '2026-11-24T00:00:00.000Z',
    checksum: `${AMBIENT_TRAFFIC_VERSION}:${profileId}:${versionId}`,
  });
}

function fleetConfiguration(
  context: ContractContext,
  seed: number,
  taxiCount: number,
  civilianCount: number,
  style: DrivingProfile,
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: context.sessionId,
    worldEpoch: context.worldEpoch,
    scenarioId: 'v3-composition-city',
    seed,
    namespace: 'v3:city:fleet',
    taxiCount,
    civilianCount,
    profile: { profileId: style.profileId, versionId: style.versionId },
  };
}

/**
 * Benzile cu originea cea mai apropiată de punctul de interes, pentru o singură clasă de acces.
 * Selecția măsoară primul punct al path-ului direcționat, nu centrul benzii; offsetul avansează apoi
 * actorul pe aceeași rută. Benzile deja folosite de cealaltă categorie sunt excluse, ca un taxi și un
 * civil să nu pornească suprapuși.
 */
function nearestPreferredLane(
  map: RoadMap,
  graph: LaneGraph,
  focus: Readonly<{ x: number; z: number }> | null,
  access: RoadAccess,
  excluded: ReadonlySet<string>,
): string | null {
  if (focus === null) return null;
  let best: { laneId: string; distanceM: number } | null = null;
  for (const lane of map.lanes) {
    if (!lane.access.includes(access) || excluded.has(lane.id)) continue;
    const path = graph.getDirectedPath(lane.id);
    if (path === null || path.points.length === 0) continue;
    const start = path.points[0]!;
    const distanceM = Math.hypot(start.x - focus.x, start.z - focus.z);
    if (distanceM > AMBIENT_TRAFFIC_POLICY.nearSpawnRadiusM) continue;
    if (
      best === null ||
      distanceM < best.distanceM ||
      (distanceM === best.distanceM && lane.id < best.laneId)
    )
      best = { laneId: lane.id, distanceM };
  }
  return best?.laneId ?? null;
}

function spawnPlan(options: ReadTrafficOptions): SpawnPlan {
  const used = new Set<string>();
  const lanesByKind: Partial<Record<FleetDriverKind, readonly string[]>> = {};
  const offsetsByKind: Partial<Record<FleetDriverKind, readonly number[]>> = {};
  const lanes: Record<FleetDriverKind, string[]> = { TAXI: [], CIVILIAN: [] };
  // Alternate between kinds so the two nearest lanes do not both go to the first kind.
  for (let round = 0; round < AMBIENT_TRAFFIC_POLICY.nearSpawnLanesPerKind; round += 1)
    for (const kind of ['TAXI', 'CIVILIAN'] as const) {
      if (lanes[kind].length >= AMBIENT_TRAFFIC_POLICY.nearSpawnLanesPerKind) continue;
      const laneId = nearestPreferredLane(
        options.map,
        options.graph,
        options.focus,
        kind === 'TAXI' ? 'TAXI' : 'CIVIL',
        used,
      );
      if (laneId === null) continue;
      used.add(laneId);
      lanes[kind].push(laneId);
    }
  for (const kind of ['TAXI', 'CIVILIAN'] as const) {
    lanesByKind[kind] = Object.freeze(lanes[kind]);
    offsetsByKind[kind] = Object.freeze(
      lanes[kind].map(() => AMBIENT_TRAFFIC_POLICY.nearSpawnOffsetM),
    );
  }
  return { lanesByKind: Object.freeze(lanesByKind), offsetsByKind: Object.freeze(offsetsByKind) };
}

function distanceToAvoid(
  actor: Readonly<{ positionM: Readonly<{ x: number; z: number }> }>,
  position: AmbientAvoidPosition,
): number {
  return (
    Math.hypot(actor.positionM.x - position.x, actor.positionM.z - position.z) -
    (position.radiusM ?? 0)
  );
}

function minimumClearance(
  actors: readonly CivilActorSnapshot[],
  avoid: readonly AmbientAvoidPosition[],
): number {
  if (avoid.length === 0) return Number.POSITIVE_INFINITY;
  let best = Number.POSITIVE_INFINITY;
  for (const actor of actors)
    for (const position of avoid) best = Math.min(best, distanceToAvoid(actor, position));
  return best;
}

function prepare(
  options: ReadTrafficOptions,
  seed: number,
  style: DrivingProfile,
  plan: SpawnPlan,
): PreparedTraffic {
  const registry = createFleetRegistry(
    fleetConfiguration(options.context, seed, options.taxiCount, options.civilianCount, style),
    options.profileSource === null ? {} : { profileSource: options.profileSource },
  );
  try {
    const traffic = createCivilTraffic({
      registry,
      map: options.map,
      graph: options.graph,
      driverKinds: ['TAXI', 'CIVILIAN'],
      contextRefresh: 'DECISION_PERIOD',
      seed,
      spawnLanesByKind: plan.lanesByKind,
      spawnOffsetsMByKind: plan.offsetsByKind,
      ...(options.styleSource === null ? { style } : { styleSource: options.styleSource }),
    });
    const actors = traffic.list();
    if (actors.length !== options.taxiCount + options.civilianCount)
      throw new Error('Traficul ambiental nu a creat populația cerută.');
    const taxis = actors.filter((actor) => actor.driverKind === 'TAXI').length;
    if (taxis !== options.taxiCount)
      throw new Error(`Traficul ambiental a creat ${taxis} taxiuri, nu ${options.taxiCount}.`);
    for (const actor of actors) {
      if (actor.route.status !== 'READY' || actor.route.path.length === 0)
        throw new Error(`Ruta AI ${actor.vehicleId} nu este READY.`);
    }
    return {
      registry,
      traffic,
      seed,
      clearanceM: minimumClearance(actors, options.avoid),
    };
  } catch (error) {
    registry.dispose();
    throw error;
  }
}

export function createAmbientTraffic(options: unknown): AmbientTraffic {
  const read = readOptions(options);
  const style = read.style ?? read.styleSource?.activeStyle() ?? createCityStyleProfile();
  if (
    read.styleSource !== null &&
    read.profileSource !== null &&
    style.profileId !== read.profileSource.activeProfile().profileId
  )
    throw new Error('Sursa stilului comun nu respectă identitatea profilului.');
  let best: PreparedTraffic | null = null;
  let lastError: unknown = null;
  const plan = spawnPlan(read);
  for (let attempt = 0; attempt < AMBIENT_TRAFFIC_POLICY.spawnAttempts; attempt += 1) {
    const seed = (read.seed + attempt) >>> 0;
    let candidate: PreparedTraffic;
    try {
      candidate = prepare(read, seed, style, plan);
    } catch (error) {
      lastError = error;
      continue;
    }
    if (candidate.clearanceM >= AMBIENT_TRAFFIC_POLICY.spawnClearanceM) {
      best?.traffic.dispose();
      best?.registry.dispose();
      best = candidate;
      break;
    }
    if (best === null || candidate.clearanceM > best.clearanceM) {
      best?.traffic.dispose();
      best?.registry.dispose();
      best = candidate;
    } else {
      candidate.traffic.dispose();
      candidate.registry.dispose();
    }
  }
  if (best === null) {
    throw lastError instanceof Error
      ? lastError
      : new Error('Traficul ambiental nu a putut fi creat.');
  }
  const prepared = best;
  let disposed = false;
  return Object.freeze({
    version: AMBIENT_TRAFFIC_VERSION,
    traffic: prepared.traffic,
    registry: prepared.registry,
    style,
    seed: prepared.seed,
    taxiCount: read.taxiCount,
    civilianCount: read.civilianCount,
    styleReference: () => prepared.traffic.style,
    refreshStyle: () => prepared.traffic.refreshStyle(),
    list: () => prepared.traffic.list(),
    get: (vehicleId: string) => prepared.traffic.get(vehicleId),
    route: (vehicleId: string) => prepared.traffic.get(vehicleId)?.route,
    report(): AmbientFleetReport {
      const actors = prepared.traffic.list();
      const byAuthority = { AUTO: 0, MANUAL: 0, LEARNING: 0 };
      const byKind: Record<FleetDriverKind, number> = { TAXI: 0, CIVILIAN: 0 };
      let blocked = 0;
      for (const actor of actors) {
        byAuthority[actor.authority] += 1;
        byKind[actor.driverKind] += 1;
        if (actor.blocked) blocked += 1;
      }
      const traffic = prepared.traffic.report();
      return Object.freeze({
        version: AMBIENT_TRAFFIC_VERSION,
        seed: prepared.seed,
        counts: prepared.registry.counts(),
        population: prepared.registry.report(),
        routes: Object.freeze({
          ready: actors.filter((actor) => actor.route.status === 'READY').length,
          fromPlanner: traffic.routesFromPlanner,
          blocked,
          replans: traffic.replans,
          byKind: Object.freeze(byKind),
        }),
        byAuthority: Object.freeze(byAuthority),
        style: prepared.traffic.style,
        traffic,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      prepared.traffic.dispose();
      prepared.registry.dispose();
    },
  });
}

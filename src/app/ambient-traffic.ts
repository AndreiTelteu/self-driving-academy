/**
 * PBI 256 — traficul AI vizibil în jocul real.
 *
 * PBI 058 livrează simularea civilă (rute 041, context 044, following 048, control 047), dar
 * compunerea jucabilă 236 nu o instanția. Modulul acesta este composition root-ul dintre hartă și
 * compunere: creează un registry 057 cu populația minimă impusă de contract, un stil comun al
 * orașului din valorile implicite 092 și traficul 058. Nu inventează o a doua fizică și nu citește
 * ceasul de perete; aceeași hartă, seed și populație produc aceleași poziții.
 *
 * Traficul este creat proaspăt pentru fiecare backend, pentru ca recuperarea GPU să nu refolosească
 * un `lastTick` vechi al contractului 058.
 */
import {
  FLEET_LIMITS,
  createCivilTraffic,
  createFleetRegistry,
  type CivilTraffic,
  type FleetRegistry,
} from '../fleet';
import {
  parameterDefinitions,
  parsePublishableDrivingProfile,
  type DrivingProfile,
} from '../profiles';
import type { ContractContext } from '../sessions';
import { parseRoadMap, type LaneGraph } from '../world';

export const AMBIENT_TRAFFIC_VERSION = '256-ambient-traffic-v1' as const;

export const AMBIENT_TRAFFIC_POLICY = Object.freeze({
  contract: AMBIENT_TRAFFIC_VERSION,
  /** Populația minimă 057: 20 de taxiuri în registry, deși compunerea conduce doar civilii. */
  taxis: FLEET_LIMITS.taxisMinimum,
  /** Destul de mulți pentru un oraș viu, sub limita de 40 a lui 058. */
  civilians: 24,
  /** Primele mașini pornesc pe benzile cu originea cea mai apropiată de jucător. */
  nearSpawnLanes: 10,
  /** Doar benzile care pornesc în acest rayon sunt preferate; restul populației rămâne împrăștiată. */
  nearSpawnRadiusM: 80,
  /** Mașinile preferate pornesc deja avansate pe rută, ca să fie vizibile în fața jucătorului. */
  nearSpawnOffsetM: 20,
  /** Nicio mașină AI nu pornește peste jucător sau peste vehiculele statice. */
  spawnClearanceM: 6,
  /** Încercări deterministe de seed înainte de a accepta cel mai bun candidat. */
  spawnAttempts: 12,
});

export interface AmbientTrafficOptions {
  readonly map: unknown;
  readonly graph: LaneGraph;
  readonly context: ContractContext;
  readonly seed?: number;
  readonly civilianCount?: number;
  /** Poziții care nu trebuie ocupate la spawn (jucătorul și vehiculele deja prezente). */
  readonly avoid?: readonly Readonly<{ x: number; z: number }>[];
  /** Punctul de interes pentru primele spawn-uri vizibile; de regulă poziția jucătorului. */
  readonly focus?: Readonly<{ x: number; z: number }>;
  /** Stilul comun; implicit valorile implicite ale catalogului 092. */
  readonly style?: DrivingProfile;
}

export interface AmbientTraffic {
  readonly version: typeof AMBIENT_TRAFFIC_VERSION;
  readonly traffic: CivilTraffic;
  readonly registry: FleetRegistry;
  readonly style: DrivingProfile;
  readonly seed: number;
  readonly civilianCount: number;
  dispose(): void;
}

interface PreparedTraffic {
  readonly registry: FleetRegistry;
  readonly traffic: CivilTraffic;
  readonly seed: number;
  readonly clearanceM: number;
}

interface ReadTrafficOptions {
  readonly map: unknown;
  readonly graph: LaneGraph;
  readonly context: ContractContext;
  readonly seed: number;
  readonly civilianCount: number;
  readonly avoid: readonly Readonly<{ x: number; z: number }>[];
  readonly focus: Readonly<{ x: number; z: number }> | null;
  readonly style: DrivingProfile | undefined;
}

function readOptions(value: unknown): ReadTrafficOptions {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Traficul ambiental cere opțiuni explicite.');
  const data = value as AmbientTrafficOptions;
  if (data.map === undefined) throw new Error('Traficul ambiental cere harta 032.');
  if (data.graph === undefined || typeof data.graph.getLane !== 'function')
    throw new Error('Traficul ambiental cere graful 033.');
  if (data.context === undefined) throw new Error('Traficul ambiental cere contextul sesiunii.');
  const seed = data.seed ?? 256;
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff)
    throw new RangeError('Seed-ul traficului ambiental trebuie să fie uint32.');
  const civilianCount = data.civilianCount ?? AMBIENT_TRAFFIC_POLICY.civilians;
  if (
    !Number.isSafeInteger(civilianCount) ||
    civilianCount < FLEET_LIMITS.civiliansMinimum ||
    civilianCount > FLEET_LIMITS.civiliansMaximum
  )
    throw new RangeError('Populația civilă trebuie să respecte limitele 057.');
  for (const position of data.avoid ?? []) {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.z))
      throw new RangeError('Poziția de evitat nu este finită.');
  }
  if (
    data.focus !== undefined &&
    (!Number.isFinite(data.focus.x) || !Number.isFinite(data.focus.z))
  )
    throw new RangeError('Punctul de interes al traficului nu este finit.');
  return {
    map: data.map,
    graph: data.graph,
    context: data.context,
    seed,
    civilianCount,
    avoid: data.avoid ?? [],
    focus: data.focus === undefined ? null : { x: data.focus.x, z: data.focus.z },
    style: data.style,
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
    taxiCount: AMBIENT_TRAFFIC_POLICY.taxis,
    civilianCount,
    profile: { profileId: style.profileId, versionId: style.versionId },
  };
}

/**
 * Benzile cu originea cea mai apropiată de punctul de interes. Selecția măsoară primul punct al
 * path-ului direcționat, nu centrul benzii; `nearSpawnOffsetM` avansează apoi actorul pe aceeași
 * rută, ca să fie vizibil în fața jucătorului. Sortarea după ID face selecția stabilă la seed-uri
 * egale.
 */
function preferredSpawnLanes(
  mapInput: unknown,
  graph: LaneGraph,
  focus: Readonly<{ x: number; z: number }> | null,
  maximum: number,
): readonly string[] {
  if (focus === null) return Object.freeze([]);
  const map = parseRoadMap(mapInput);
  const candidates: { laneId: string; distanceM: number }[] = [];
  for (const lane of map.lanes) {
    if (!lane.access.includes('CIVIL')) continue;
    const path = graph.getDirectedPath(lane.id);
    if (path === null || path.points.length === 0) continue;
    const start = path.points[0]!;
    candidates.push({
      laneId: lane.id,
      distanceM: Math.hypot(start.x - focus.x, start.z - focus.z),
    });
  }
  candidates.sort(
    (left, right) =>
      left.distanceM - right.distanceM ||
      (left.laneId < right.laneId ? -1 : left.laneId > right.laneId ? 1 : 0),
  );
  return Object.freeze(
    candidates
      .filter((candidate) => candidate.distanceM <= AMBIENT_TRAFFIC_POLICY.nearSpawnRadiusM)
      .slice(0, maximum)
      .map((candidate) => candidate.laneId),
  );
}

function minimumClearance(
  traffic: CivilTraffic,
  avoid: readonly Readonly<{ x: number; z: number }>[],
): number {
  if (avoid.length === 0) return Number.POSITIVE_INFINITY;
  let best = Number.POSITIVE_INFINITY;
  for (const actor of traffic.list())
    for (const position of avoid)
      best = Math.min(
        best,
        Math.hypot(actor.positionM.x - position.x, actor.positionM.z - position.z),
      );
  return best;
}

function prepare(
  options: ReturnType<typeof readOptions>,
  seed: number,
  style: DrivingProfile,
  spawnLanes: readonly string[],
  spawnOffsetsM: readonly number[],
): PreparedTraffic {
  const registry = createFleetRegistry(
    fleetConfiguration(options.context, seed, options.civilianCount, style),
  );
  try {
    const traffic = createCivilTraffic({
      registry,
      map: options.map,
      graph: options.graph,
      style,
      seed,
      spawnLanes,
      spawnOffsetsM,
    });
    const actors = traffic.list();
    if (actors.length !== options.civilianCount)
      throw new Error('Traficul ambiental nu a creat populația cerută.');
    for (const actor of actors) {
      if (actor.route.status !== 'READY' || actor.route.path.length === 0)
        throw new Error(`Ruta AI ${actor.vehicleId} nu este READY.`);
    }
    return {
      registry,
      traffic,
      seed,
      clearanceM: minimumClearance(traffic, options.avoid ?? []),
    };
  } catch (error) {
    registry.dispose();
    throw error;
  }
}

export function createAmbientTraffic(options: unknown): AmbientTraffic {
  const read = readOptions(options);
  const style = read.style ?? createCityStyleProfile();
  const spawnLanes = preferredSpawnLanes(
    read.map,
    read.graph,
    read.focus,
    Math.min(AMBIENT_TRAFFIC_POLICY.nearSpawnLanes, read.civilianCount),
  );
  const spawnOffsetsM = Object.freeze(
    spawnLanes.map(() => AMBIENT_TRAFFIC_POLICY.nearSpawnOffsetM),
  );
  let best: PreparedTraffic | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < AMBIENT_TRAFFIC_POLICY.spawnAttempts; attempt += 1) {
    const seed = (read.seed + attempt) >>> 0;
    let candidate: PreparedTraffic;
    try {
      candidate = prepare(read, seed, style, spawnLanes, spawnOffsetsM);
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
    civilianCount: read.civilianCount,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      prepared.traffic.dispose();
      prepared.registry.dispose();
    },
  });
}

/**
 * PBI 236 — compunerea lanțului V3 într-un singur punct de adevăr, pe tick fix de 60 Hz.
 *
 * Ordinea unui tick este cea impusă de contractele livrate, nu o convenție locală:
 *
 *   intenția reală (portul 193) → tranziția cerută (195/196) → 193 `step` + `deliver`
 *   → 192 `walker.step` (personaj) sau mișcarea vehiculului (șofer) → 194 `camera.step`
 *   → 198 `segments.step` → proiecția HUD.
 *
 * Modulul este pur: fără DOM, fără Babylon, fără ceas și fără `Math.random`. El nu rescrie
 * niciun contract: tranzițiile sunt exact `decideVehicleEntry`/`decideVehicleExit`, comanda
 * este exact cea produsă de arbitrajul 193, iar poziția personajului este exclusiv a
 * walker-ului 192. Ieșirea nu scrie poziția: creează un walker nou la `VehicleExitStart`
 * exact furnizat de 196, păstrând aceeași entitate.
 *
 * 198 nu are un pas `DRIVE`. Cât timp jucătorul stă în mașină, modelul de segmente este ținut
 * în pas cu tick-ul printr-un `FOCUS` pe vehiculul condus — exact comanda 198 care nu schimbă
 * autoritatea și a cărei țintă de cameră este mașina condusă. Contorul `focus` este raportat
 * explicit ca atare, nu ascuns.
 */
import {
  CHARACTER_CAMERA_DEFAULT_ORBIT,
  CHARACTER_CAMERA_POLICY,
  CHARACTER_SAMPLING_HZ,
  applyCharacterPose,
  characterPositionBits,
  createCharacterAsset,
  createCharacterAuthority,
  createCharacterCamera,
  createCharacterPoseWriter,
  createCityWalkWorld,
  createWalker,
  createWalkingSegments,
  decideVehicleEntry,
  decideVehicleExit,
  sampleCharacterPose,
  type CharacterCameraFrame,
  type CharacterCameraObstacle,
  type CharacterCameraOrbit,
  type CharacterCameraTarget,
  type CharacterClipId,
  type CharacterPoint,
  type CharacterRenderFrame,
  type VehicleEntryCharacterBody,
  type VehicleEntryVehicle,
  type VehicleExitCharacterBody,
  type WalkingSegments,
  type WalkingSegmentsStats,
  type WalkWorld,
} from '../character';
import {
  createInputAuthorityArbiter,
  type AuthorityCommand,
  type AuthorityTickResult,
  type InputAuthority,
  type InputAuthorityArbiter,
} from '../input';
import {
  VEHICLE_COLLISION_HALF_EXTENTS_M,
  createCityDecorPlan,
  VEHICLE_RIDE_HEIGHT_M,
  vehicleGeometrySpec,
} from '../rendering';
import {
  createVehicleCollisionWorld,
  vehicleBodiesOverlap,
  type VehicleCollisionWorld,
} from './vehicle-collision';
import { createVehicleAutoDrive, type VehicleAutoDrive } from './vehicle-auto-drive';
import type { CivilActorSnapshot, CivilTraffic, CivilTrafficVehicleObservation } from '../fleet';
import type { ContractContext } from '../sessions';
import type { ControlPreferences } from '../settings';
import { tractiveForceN, vehicleClass, type ControlMode } from '../vehicles';
import {
  createRoutePlanner,
  type CityLayout,
  type LaneGraph,
  type RoadMap,
  type RoutePlanner,
} from '../world';

export const V3_COMPOSITION_VERSION = '236-v3-composition-v1' as const;

export const V3_COMPOSITION_POLICY = Object.freeze({
  contract: V3_COMPOSITION_VERSION,
  /** Același tick fix ca 192/193/194/195/196/198. */
  tickHz: CHARACTER_SAMPLING_HZ,
  dtSeconds: 1 / CHARACTER_SAMPLING_HZ,
  /** Coada de evenimente păstrată pentru HUD și pentru raport. */
  eventCapacity: 64,
  /** Sub această viteză mașina este oprită; 196 cere oprirea înainte de coborâre. */
  parkedSpeedMps: 1e-9,
  /**
   * PBI 238: o mașină blocată de un solid nu poate ieși altfel decât în marșarier, deci frâna ținută
   * din staționare dă marșarier lent (viteză semnată, negativă). Limita este deliberat mică.
   */
  reverseMaxMps: 3,
  reverseAccelerationShare: 0.4,
  /** Sub această viteză, după o atingere, mașina este considerată oprită. */
  contactStopSpeedMps: 0.05,
});

export type CompositionKind = 'CHARACTER' | 'VEHICLE';
export type CompositionMode = ControlMode;

export interface CompositionVehicleSeed {
  readonly vehicleId: string;
  readonly driverKind: 'TAXI' | 'CIVILIAN';
  readonly classId: 'sedan' | 'compact';
  /** Poziția la sol a centrului caroseriei, în metri. */
  readonly positionM: Readonly<{ x: number; z: number }>;
  readonly yawRad: number;
  /** Limita reală a benzii pe care stă mașina, citită din layout-ul 042. */
  readonly speedLimitMps: number;
  readonly controlMode?: ControlMode;
}

export interface CompositionOptions {
  readonly layout: CityLayout;
  readonly start: Readonly<{ x: number; z: number; yawRad: number }>;
  readonly entityId?: string;
  readonly control: ControlPreferences;
  readonly context: ContractContext;
  readonly vehicles: readonly CompositionVehicleSeed[];
  readonly orbit?: Partial<CharacterCameraOrbit>;
  /**
   * PBI 256: traficul 058 care devine parte vizibilă a compunerii. Compunerea îl pașește înaintea
   * arbitrajului de input și publică actorii în `frame.vehicles`, dar NU îl deține: caller-ul îl
   * creează proaspăt și îl eliberează împreună cu registry-ul. Mașinile AI nu sunt preluabile de
   * jucător: `requestEntry` le refuză explicit.
   */
  readonly traffic?: CivilTraffic;
  /** PBI 257: harta 032 și graful 033 pentru driverul AUTO. Fără ele, M rămâne indisponibil. */
  readonly map?: RoadMap;
  readonly graph?: LaneGraph;
}

/** Mașina compusă: contractul 195/196 plus viteza reală pe care o integrează compunerea. */
export interface CompositionVehicle {
  readonly vehicleId: string;
  readonly driverKind: 'TAXI' | 'CIVILIAN';
  readonly classId: 'sedan' | 'compact';
  /** 1-based 057 slot for a live traffic actor; `null` for a seeded composition car. */
  readonly slot: number | null;
  readonly positionM: CharacterPoint;
  readonly yawRad: number;
  readonly speedMps: number;
  readonly speedLimitMps: number;
  readonly controlMode: ControlMode;
  readonly halfExtentsM: Readonly<{ x: number; z: number }>;
  readonly bottomM: number;
  readonly topM: number;
  readonly laneId: string | null;
  readonly routeLaneIds: readonly string[];
  readonly rideId: string | null;
  readonly rideProgressM: number;
  readonly appliedProfileVersion: string;
  readonly maneuverState: VehicleEntryVehicle['state']['maneuverState'];
  /** PBI 058 blockage, carried into the live fleet list and never inferred from speed. */
  readonly blocked: boolean;
}

export interface CompositionEvent {
  readonly tick: number;
  readonly kind:
    | 'ENTER_ACCEPTED'
    | 'ENTER_REFUSED'
    | 'EXIT_ACCEPTED'
    | 'EXIT_REFUSED'
    | 'ENTRY_IGNORED'
    | 'EXIT_IGNORED'
    | 'TAKEOVER_ACCEPTED'
    | 'TAKEOVER_REFUSED'
    | 'RELEASE_ACCEPTED'
    | 'RELEASE_REFUSED'
    | 'CAMERA_SELECTED'
    | 'CAMERA_SELECTION_REFUSED'
    | 'RESET';
  readonly detail: string;
}

export interface CompositionCharacterFrame {
  readonly entityId: string;
  readonly tick: number;
  readonly positionM: CharacterPoint;
  readonly yawRad: number;
  readonly clipId: CharacterClipId;
  readonly speedMps: number;
  readonly desiredSpeedMps: number;
  readonly groundHeightM: number;
  readonly blocked: boolean;
  readonly positionBits: string;
}

export interface CompositionHud {
  readonly tick: number;
  readonly controlledKind: CompositionKind;
  readonly controlledEntityId: string;
  readonly controlledLabel: string;
  readonly mode: CompositionMode;
  readonly cameraEntityId: string;
  readonly cameraDivergent: boolean;
  /** Clipul personajului; null când entitatea controlată este o mașină. */
  readonly clipId: CharacterClipId | null;
  readonly speedMps: number;
  readonly transitionRemainingTicks: number;
  readonly heldActions: number;
  readonly neutralizedActions: number;
}

export interface CompositionStats {
  readonly ticks: number;
  readonly deliveries: Readonly<{ CHARACTER: number; VEHICLE: number }>;
  readonly refused: Readonly<{ doubleDelivery: number; inactiveConsumer: number }>;
  readonly transitions: number;
  readonly walkerTicks: number;
  readonly cameraFrames: number;
  readonly segmentCommands: number;
  readonly entryAttempts: number;
  readonly exitAttempts: number;
  /** PBI 263: explicit live takeovers, successful and refused, plus AUTO releases. */
  readonly takeoverAttempts: number;
  readonly takeovers: number;
  readonly releases: number;
  /** Un tick fără exact o livrare este o eroare de compunere, nu o stare normală. */
  readonly ticksWithoutDelivery: number;
}

export interface CompositionFrame {
  readonly tick: number;
  readonly authority: InputAuthority;
  readonly character: CompositionCharacterFrame;
  readonly vehicles: readonly CompositionVehicle[];
  readonly camera: CharacterCameraFrame;
  readonly hud: CompositionHud;
  readonly segments: WalkingSegmentsStats;
  /** PBI 263: camera-only target and the single car in the PLAYER seat (MANUAL/LEARNING). */
  readonly selectedVehicleId: string | null;
  readonly playerVehicleId: string | null;
  readonly stats: CompositionStats;
  readonly lastCommand: AuthorityCommand['consumer'] | null;
  readonly lastSegmentAction: 'WALK' | 'FOCUS' | 'ENTER' | 'EXIT' | null;
  readonly events: readonly CompositionEvent[];
}

export interface CompositionStepRequest {
  readonly tick: number;
}

export interface V3Composition {
  readonly contract: typeof V3_COMPOSITION_VERSION;
  readonly policy: typeof V3_COMPOSITION_POLICY;
  readonly entityId: string;
  readonly walkWorld: WalkWorld;
  /** Solidele statice pentru mașina condusă: clădirile 192 și decorul 146 (PBI 238). */
  readonly vehicleCollision: VehicleCollisionWorld;
  readonly arbiter: InputAuthorityArbiter;
  readonly segments: WalkingSegments;
  readonly port: InputAuthorityArbiter['port'];
  readonly frame: CompositionFrame;
  /** Ultimul rezultat 193 al tick-ului, păstrat pentru probele de livrare dublă. */
  readonly lastResult: AuthorityTickResult | null;
  /** Starea curentă a personajului, citită direct din walker (fără cadru construit). */
  character(): CompositionCharacterFrame;
  step(request: CompositionStepRequest): CompositionFrame;
  setSprint(pressed: boolean): void;
  releaseInput(): void;
  /** Cererea este consumată la următorul tick; fără id se alege cea mai apropiată mașină. */
  requestEntry(vehicleId?: string): void;
  requestExit(): void;
  /**
   * PBI 263: camera-only selection. The vehicle stays in AUTO and the authority does not change.
   * `null` returns the camera to the controlled entity.
   */
  selectVehicle(vehicleId: string | null): boolean;
  selectedVehicleId(): string | null;
  /** The car in the single PLAYER seat (MANUAL/LEARNING), never an AUTO observation. */
  playerVehicleId(): string | null;
  /** Queues an explicit takeover of any live taxi/civil; processed at the next tick. */
  requestTakeover(vehicleId: string, mode: 'MANUAL' | 'LEARNING'): boolean;
  /** Queues the controlled car back to AUTO while keeping it as the camera target. */
  requestRelease(): boolean;
  /** M/L on the selected car: takeover when it differs, otherwise the existing controlled toggle. */
  takeOverSelected(mode: 'MANUAL' | 'LEARNING'): boolean;
  /** PBI 257: modul mașinii conduse, `null` când autoritatea este pe personaj. */
  vehicleMode(): CompositionMode | null;
  /** PBI 257: AUTO cere hartă/graf și o rută READY; MANUAL oprește driverul AUTO. */
  setVehicleMode(mode: 'AUTO' | 'MANUAL'): CompositionMode | null;
  toggleVehicleMode(): CompositionMode | null;
  /** Cadrul de render 191 pentru tick-ul curent al walker-ului (poziția este copiată). */
  characterFrame(): CharacterRenderFrame;
  /** Resetează doar scenariul de probă: walker nou la spawn, autoritatea pe personaj. */
  resetScenario(): void;
  dispose(): void;
}

const point = (x: number, y: number, z: number): CharacterPoint => Object.freeze({ x, y, z });

function requireTick(tick: number, expected: number): number {
  if (!Number.isSafeInteger(tick) || tick !== expected)
    throw new Error(`Compunerea cere tick-ul următor (${expected}), a primit ${String(tick)}.`);
  return tick;
}

function normalizeAngle(rad: number): number {
  return ((((rad + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}

/** Înălțimea reală a plafonului, derivată din geometria PBI 145 a clasei. */
function vehicleAnchorHeightM(classId: 'sedan' | 'compact'): number {
  let top = 0;
  for (const part of vehicleGeometrySpec(classId).parts) {
    top = Math.max(top, part.center[1] + part.size[1] / 2);
  }
  // The geometry spec is chassis-local; the presentation root sits 0.8 m above the road.
  return top + VEHICLE_RIDE_HEIGHT_M;
}

function entryVehicle(vehicle: CompositionVehicle, tick: number): VehicleEntryVehicle {
  return Object.freeze({
    vehicleId: vehicle.vehicleId,
    driverKind: vehicle.driverKind,
    classId: vehicle.classId,
    positionM: vehicle.positionM,
    yawRad: vehicle.yawRad,
    halfExtentsM: vehicle.halfExtentsM,
    bottomM: vehicle.bottomM,
    topM: vehicle.topM,
    availability: 'AVAILABLE' as const,
    state: Object.freeze({
      tick,
      controlMode: vehicle.controlMode,
      velocityMps: point(
        Math.sin(vehicle.yawRad) * vehicle.speedMps,
        0,
        Math.cos(vehicle.yawRad) * vehicle.speedMps,
      ),
      laneId: vehicle.laneId,
      maneuverState: vehicle.maneuverState,
      routeLaneIds: vehicle.routeLaneIds,
      rideId: vehicle.rideId,
      rideProgressM: vehicle.rideProgressM,
      appliedProfileVersion: vehicle.appliedProfileVersion,
    }),
  });
}

function withVehicle(
  vehicle: CompositionVehicle,
  patch: Partial<CompositionVehicle>,
): CompositionVehicle {
  return Object.freeze({ ...vehicle, ...patch });
}

function vehicleFromSeed(seed: CompositionVehicleSeed): CompositionVehicle {
  return Object.freeze({
    vehicleId: seed.vehicleId,
    driverKind: seed.driverKind,
    classId: seed.classId,
    slot: null,
    positionM: point(seed.positionM.x, 0, seed.positionM.z),
    yawRad: seed.yawRad,
    speedMps: 0,
    speedLimitMps: seed.speedLimitMps,
    controlMode: seed.controlMode ?? 'AUTO',
    halfExtentsM: Object.freeze({
      x: VEHICLE_COLLISION_HALF_EXTENTS_M.x,
      z: VEHICLE_COLLISION_HALF_EXTENTS_M.z,
    }),
    bottomM: 0,
    topM: 1.6,
    laneId: null,
    routeLaneIds: Object.freeze([]),
    rideId: null,
    rideProgressM: 0,
    appliedProfileVersion: 'v3-composition-1',
    maneuverState: 'IDLE',
    blocked: false,
  });
}

/**
 * PBI 256: graful 033 măsoară headingul în planul hărții (0 = +X, pozitiv spre +Z), iar compunerea
 * folosește înainte = (sin yaw, cos yaw) (0 = +Z). Conversia este o rotație de 90°, nu o alegere
 * cosmetică: fără ea mașinile AI ar conduce cu 90° lateral.
 */
function compositionYawFromTrafficHeading(headingRad: number): number {
  return normalizeAngle(Math.PI / 2 - headingRad);
}

function trafficHeadingFromCompositionYaw(yawRad: number): number {
  return normalizeAngle(Math.PI / 2 - yawRad);
}

function trafficActorVehicle(actor: CivilActorSnapshot, layout: CityLayout): CompositionVehicle {
  const lane = layout.lanes.find((candidate) => candidate.laneId === actor.laneId);
  return Object.freeze({
    vehicleId: actor.vehicleId,
    driverKind: actor.driverKind,
    classId: actor.classId,
    slot: actor.slot,
    positionM: point(actor.positionM.x, actor.positionM.y, actor.positionM.z),
    yawRad: compositionYawFromTrafficHeading(actor.headingRad),
    speedMps: actor.speedMps,
    speedLimitMps: lane?.speedLimitMps ?? 11.2,
    controlMode: actor.authority,
    halfExtentsM: Object.freeze({
      x: VEHICLE_COLLISION_HALF_EXTENTS_M.x,
      z: VEHICLE_COLLISION_HALF_EXTENTS_M.z,
    }),
    bottomM: 0,
    topM: 1.6,
    laneId: actor.laneId,
    routeLaneIds: Object.freeze([...actor.route.path]),
    rideId: null,
    rideProgressM: 0,
    appliedProfileVersion: actor.styleVersionId,
    maneuverState: 'IDLE',
    blocked: actor.blocked,
  });
}

function authorityEntityId(authority: InputAuthority): string {
  return authority.consumer === 'CHARACTER' ? authority.characterId : authority.vehicleId;
}

function characterAuthority(characterId: string): InputAuthority {
  return Object.freeze({ consumer: 'CHARACTER' as const, characterId });
}

/** Obstacolele 194: solidele reale ale lumii 192 plus caroseriile mașinilor. */
function staticCameraObstacles(world: WalkWorld): readonly CharacterCameraObstacle[] {
  return Object.freeze(
    world.blockers.map((blocker) =>
      Object.freeze({
        id: blocker.id,
        min: point(blocker.polygon.bounds.minX, blocker.bottomM, blocker.polygon.bounds.minZ),
        max: point(blocker.polygon.bounds.maxX, blocker.topM, blocker.polygon.bounds.maxZ),
      }),
    ),
  );
}

function vehicleCameraObstacle(vehicle: CompositionVehicle): CharacterCameraObstacle {
  // AABB-ul real al caroseriei rotite: semilățimile se rotesc cu yaw-ul, altfel o mașină
  // paralelă cu strada ar acoperi trotuarul în camera 194.
  const cos = Math.abs(Math.cos(vehicle.yawRad));
  const sin = Math.abs(Math.sin(vehicle.yawRad));
  const halfX = vehicle.halfExtentsM.x * cos + vehicle.halfExtentsM.z * sin;
  const halfZ = vehicle.halfExtentsM.x * sin + vehicle.halfExtentsM.z * cos;
  return Object.freeze({
    id: `vehicle:${vehicle.vehicleId}`,
    min: point(vehicle.positionM.x - halfX, vehicle.bottomM, vehicle.positionM.z - halfZ),
    max: point(vehicle.positionM.x + halfX, vehicle.topM, vehicle.positionM.z + halfZ),
  });
}

export function createV3Composition(options: CompositionOptions): V3Composition {
  if (!options || typeof options !== 'object')
    throw new Error('Compunerea V3 cere opțiuni explicite.');
  const entityId = options.entityId ?? 'player-character';
  const walkWorld = createCityWalkWorld(options.layout);
  const asset = createCharacterAsset();
  // Același plan 146 ca al scenei: deterministic, deci ce se vede este ce lovește mașina.
  const vehicleCollision = createVehicleCollisionWorld({
    blockers: walkWorld.blockers,
    decor: createCityDecorPlan(options.layout).items,
  });
  const spawn = Object.freeze({
    x: options.start.x,
    z: options.start.z,
    yawRad: options.start.yawRad,
    y: walkWorld.surfaceAt(options.start.x, options.start.z),
  });
  const createSpawnWalker = () =>
    createWalker({
      world: walkWorld,
      start: { positionM: point(spawn.x, spawn.y, spawn.z), yawRad: spawn.yawRad },
      entityId,
    });
  let walker = createSpawnWalker();
  const traffic = options.traffic ?? null;
  const seededVehicles = options.vehicles.map(vehicleFromSeed);
  const trafficIds = new Set<string>();
  if (traffic !== null) {
    for (const actor of traffic.list()) {
      if (
        trafficIds.has(actor.vehicleId) ||
        seededVehicles.some((v) => v.vehicleId === actor.vehicleId)
      )
        throw new Error(`Vehiculul AI ${actor.vehicleId} dublează un vehicul al compunerii.`);
      trafficIds.add(actor.vehicleId);
    }
  }
  let vehicles: readonly CompositionVehicle[] = Object.freeze([
    ...seededVehicles,
    ...(traffic === null
      ? []
      : traffic.list().map((actor) => trafficActorVehicle(actor, options.layout))),
  ]);
  const arbiter = createInputAuthorityArbiter({
    context: options.context,
    authority: characterAuthority(entityId),
  });
  const camera = createCharacterCamera({
    world: Object.freeze({
      minX: options.layout.boundsM.minM.x,
      maxX: options.layout.boundsM.maxM.x,
      minZ: options.layout.boundsM.minM.z,
      maxZ: options.layout.boundsM.maxM.z,
      groundM: 0,
    }),
    control: options.control,
    orbit: {
      // Intenția de cameră a compunerii: 3,5 m în spate, 15° deasupra umărului. Distanța și
      // pitch-ul rămân câmpuri explicite 194, nu un al doilea store de setări.
      distanceM: 3.5,
      pitchRad: Math.PI / 12,
      ...options.orbit,
    },
  });
  const segments = createWalkingSegments({
    ownerId: '236-v3-composition',
    characterId: entityId,
    target: Object.freeze({
      sessionId: options.context.sessionId,
      worldEpoch: options.context.worldEpoch,
      playerId: 'v3-player',
      profileId: 'v3-profile',
      baseVersionId: 'v3-base-1',
      learningEpoch: 1,
      learningEligible: false,
    }),
  });
  const staticObstacles = staticCameraObstacles(walkWorld);

  let tick = 0;
  let lastResult: AuthorityTickResult | null = null;
  let lastCommand: AuthorityCommand['consumer'] | null = null;
  let lastSegmentAction: CompositionFrame['lastSegmentAction'] = null;
  let lastCamera: CharacterCameraFrame | null = null;
  let frame: CompositionFrame | null = null;
  let takeover: VehicleEntryVehicle | null = null;
  let previousEntry: Readonly<{ tick: number; vehicleId: string }> | null = null;
  let previousExit: Readonly<{ tick: number; vehicleId: string }> | null = null;
  let pendingEntry: Readonly<{ vehicleId: string | null }> | null = null;
  let pendingExit = false;
  /** PBI 263: camera-only target, independent from input authority. */
  let cameraFocusVehicleId: string | null = null;
  let pendingTakeover: Readonly<{ vehicleId: string; mode: 'MANUAL' | 'LEARNING' }> | null = null;
  let pendingRelease = false;
  let entryAttempts = 0;
  let exitAttempts = 0;
  let takeoverAttempts = 0;
  let takeovers = 0;
  let releases = 0;
  let ticksWithoutDelivery = 0;
  let segmentCommands = 0;
  let disposed = false;
  /** Intenția de orbită 194; compunerea o rotește doar când camera este complet blocată. */
  const defaultOrbitYaw = options.orbit?.yawRad ?? CHARACTER_CAMERA_DEFAULT_ORBIT.yawRad;
  let orbitYawRad = defaultOrbitYaw;
  let lastOrbitAdjustTick = Number.NEGATIVE_INFINITY;
  let clearOrbitTicks = 0;
  const resetCameraOrbit = (): void => {
    orbitYawRad = defaultOrbitYaw;
    lastOrbitAdjustTick = Number.NEGATIVE_INFINITY;
    clearOrbitTicks = 0;
  };
  const events: CompositionEvent[] = [];

  const emit = (kind: CompositionEvent['kind'], detail: string, atTick: number): void => {
    if (events.length >= V3_COMPOSITION_POLICY.eventCapacity) events.shift();
    events.push(Object.freeze({ tick: atTick, kind, detail }));
  };

  const vehicleById = (id: string): CompositionVehicle | undefined =>
    vehicles.find((vehicle) => vehicle.vehicleId === id);

  const setVehicle = (next: CompositionVehicle): void => {
    vehicles = Object.freeze(
      vehicles.map((vehicle) => (vehicle.vehicleId === next.vehicleId ? next : vehicle)),
    );
  };

  /** PBI 257: AUTO se sprijină pe harta 032 și graful 033; plannerul este creat o singură dată. */
  let autoPlanner: RoutePlanner | null = null;
  const autoDrives = new Map<string, VehicleAutoDrive>();
  const ensureAutoPlanner = (): RoutePlanner | null => {
    if (options.map === undefined || options.graph === undefined) return null;
    if (autoPlanner === null)
      autoPlanner = createRoutePlanner({
        graph: options.graph,
        map: options.map,
        graphVersion: '033-lane-graph-v1',
        costVersion: 'route-cost-v1',
      });
    return autoPlanner;
  };
  const vehicleBody = (vehicle: CompositionVehicle) =>
    Object.freeze({ halfX: vehicle.halfExtentsM.x, halfZ: vehicle.halfExtentsM.z });
  const overlapsAnyVehicle = (
    vehicleId: string,
    pose: Readonly<{ x: number; z: number; yawRad: number }>,
    body: Readonly<{ halfX: number; halfZ: number }>,
  ): boolean =>
    vehicles.some((other) => {
      if (other.vehicleId === vehicleId) return false;
      // PBI 257: filtru ieftin înaintea SAT. Diagonalele maxime însumate sunt sub 4,4 m.
      const dx = other.positionM.x - pose.x;
      if (dx > 8 || dx < -8) return false;
      const dz = other.positionM.z - pose.z;
      if (dz > 8 || dz < -8) return false;
      return vehicleBodiesOverlap(
        pose,
        body,
        { x: other.positionM.x, z: other.positionM.z, yawRad: other.yawRad },
        { halfX: other.halfExtentsM.x, halfZ: other.halfExtentsM.z },
      );
    });
  const controlledVehicle = (): CompositionVehicle | null => {
    const authority = arbiter.snapshot().authority;
    return authority.consumer === 'VEHICLE' ? (vehicleById(authority.vehicleId) ?? null) : null;
  };
  const playerVehicle = (): CompositionVehicle | null => {
    const vehicle = controlledVehicle();
    return vehicle === null || vehicle.controlMode === 'AUTO' ? null : vehicle;
  };
  const applyVehicleModeTo = (
    vehicle: CompositionVehicle,
    mode: 'AUTO' | 'MANUAL',
  ): CompositionMode | null => {
    if (mode === 'AUTO') {
      if (trafficIds.has(vehicle.vehicleId)) {
        if (traffic === null) return null;
        try {
          traffic.reconcile(
            vehicle.vehicleId,
            {
              positionM: Object.freeze({
                x: vehicle.positionM.x,
                y: vehicle.positionM.y,
                z: vehicle.positionM.z,
              }),
              headingRad: trafficHeadingFromCompositionYaw(vehicle.yawRad),
            },
            tick,
          );
        } catch {
          return null;
        }
        traffic.resume(vehicle.vehicleId, tick);
        setVehicle(withVehicle(vehicle, { controlMode: 'AUTO', speedMps: 0 }));
        arbiter.releaseAll();
        return 'AUTO';
      }
      const planner = ensureAutoPlanner();
      if (planner === null || options.map === undefined || options.graph === undefined) return null;
      let drive = autoDrives.get(vehicle.vehicleId);
      if (drive === undefined) {
        drive = createVehicleAutoDrive({
          graph: options.graph,
          planner,
          map: options.map,
          vehicleId: vehicle.vehicleId,
          classId: vehicle.classId,
          start: {
            x: vehicle.positionM.x,
            z: vehicle.positionM.z,
            yawRad: vehicle.yawRad,
          },
          seed: 257,
        });
        autoDrives.set(vehicle.vehicleId, drive);
      }
      setVehicle(withVehicle(vehicle, { controlMode: 'AUTO' }));
      arbiter.releaseAll();
      return 'AUTO';
    }
    const drive = autoDrives.get(vehicle.vehicleId);
    if (drive !== undefined) {
      drive.dispose();
      autoDrives.delete(vehicle.vehicleId);
    }
    if (trafficIds.has(vehicle.vehicleId) && traffic !== null) {
      traffic.setAuthority(vehicle.vehicleId, 'MANUAL', tick);
    }
    setVehicle(withVehicle(vehicle, { controlMode: 'MANUAL', speedMps: 0 }));
    arbiter.releaseAll();
    return 'MANUAL';
  };
  const applyVehicleMode = (mode: 'AUTO' | 'MANUAL'): CompositionMode | null => {
    const vehicle = controlledVehicle();
    return vehicle === null ? null : applyVehicleModeTo(vehicle, mode);
  };
  const toggleControlledVehicleMode = (): CompositionMode | null => {
    const vehicle = controlledVehicle();
    return vehicle === null
      ? null
      : applyVehicleModeTo(vehicle, vehicle.controlMode === 'AUTO' ? 'MANUAL' : 'AUTO');
  };
  const stepAutoDrives = (dtSeconds: number): void => {
    if (autoDrives.size === 0) return;
    for (const [vehicleId, drive] of autoDrives) {
      const vehicle = vehicleById(vehicleId);
      if (vehicle === undefined || vehicle.controlMode !== 'AUTO') {
        drive.dispose();
        autoDrives.delete(vehicleId);
        continue;
      }
      const candidate = drive.step(dtSeconds);
      const body = vehicleBody(vehicle);
      const from = {
        x: vehicle.positionM.x,
        z: vehicle.positionM.z,
        yawRad: vehicle.yawRad,
      };
      const to = {
        x: candidate.positionM.x,
        z: candidate.positionM.z,
        yawRad: candidate.yawRad,
      };
      const swept = vehicleCollision.sweep(from, to, body);
      if (
        swept.blocked ||
        overlapsAnyVehicle(
          vehicleId,
          { x: swept.pose.x, z: swept.pose.z, yawRad: swept.pose.yawRad },
          body,
        )
      ) {
        drive.stop();
        setVehicle(
          withVehicle(vehicle, {
            speedMps: 0,
            controlMode: 'AUTO',
          }),
        );
        continue;
      }
      setVehicle(
        withVehicle(vehicle, {
          positionM: point(swept.pose.x, candidate.positionM.y, swept.pose.z),
          yawRad: swept.pose.yawRad,
          speedMps: candidate.speedMps,
          laneId: candidate.laneId,
          routeLaneIds: candidate.routeLaneIds,
          controlMode: 'AUTO',
        }),
      );
    }
  };

  /**
   * PBI 256: vehiculele care nu aparțin traficului 058 intră în cadrul 044 al traficului ca
   * observații externe. Taxiul jucătorului (parcat sau condus) și civilul static devin lideri
   * semantici, deci mașinile AI frânează în spatele lor. Personajul pe jos nu este injectat ca
   * vehicul: la spawn stă pe carosabil, lângă bordură, iar tratarea lui ca lider ar opri o bandă
   * întreagă în primul cadru.
   */
  const trafficObservations = (): readonly CivilTrafficVehicleObservation[] =>
    Object.freeze(
      vehicles
        .filter((vehicle) => !trafficIds.has(vehicle.vehicleId))
        .map((vehicle) =>
          Object.freeze({
            vehicleId: vehicle.vehicleId,
            driverKind: vehicle.driverKind,
            positionM: Object.freeze({
              x: vehicle.positionM.x,
              y: vehicle.positionM.y,
              z: vehicle.positionM.z,
            }),
            headingRad: trafficHeadingFromCompositionYaw(vehicle.yawRad),
            speedMps: Math.max(0, vehicle.speedMps),
            radiusM: VEHICLE_COLLISION_HALF_EXTENTS_M.z,
          }),
        ),
    );

  const stepTraffic = (atTick: number): void => {
    if (traffic === null) return;
    const frame = traffic.step({
      tick: atTick,
      dtSeconds: V3_COMPOSITION_POLICY.dtSeconds,
      vehicles: trafficObservations(),
    });
    const updated = new Map(frame.actors.map((actor) => [actor.vehicleId, actor]));
    // PBI 269: a company purchase can add a real 058 actor after composition creation. It enters
    // the same frame next tick, never through a second composition or a synthetic vehicle.
    const known = new Set(vehicles.map((vehicle) => vehicle.vehicleId)),
      additions = frame.actors
        .filter((actor) => !known.has(actor.vehicleId))
        .map((actor) => trafficActorVehicle(actor, options.layout));
    if (additions.length > 0) {
      for (const vehicle of additions) trafficIds.add(vehicle.vehicleId);
      vehicles = Object.freeze([...vehicles, ...additions]);
    }
    const controlled = playerVehicle();
    vehicles = Object.freeze(
      vehicles.map((vehicle) => {
        // PBI 263: a traffic car in the PLAYER seat is driven by the composition, not by 058. Its
        // reconciled pose was handed to 058 before this step, so overwriting it here would snap the
        // car back to the frozen AI pose every tick.
        if (controlled !== null && controlled.vehicleId === vehicle.vehicleId) return vehicle;
        const actor = updated.get(vehicle.vehicleId);
        return actor === undefined ? vehicle : trafficActorVehicle(actor, options.layout);
      }),
    );
  };

  /**
   * PBI 263: while a 058 actor is in the PLAYER seat, its real lane occupancy/leader information is
   * kept current from the composition pose. A failed projection (car off the lane graph) leaves the
   * last reconciled pose in place and never teleports it.
   */
  const synchronizePlayerDrivenTraffic = (): void => {
    if (traffic === null) return;
    const vehicle = playerVehicle();
    if (vehicle === null || !trafficIds.has(vehicle.vehicleId)) return;
    try {
      traffic.reconcile(
        vehicle.vehicleId,
        {
          positionM: Object.freeze({
            x: vehicle.positionM.x,
            y: vehicle.positionM.y,
            z: vehicle.positionM.z,
          }),
          headingRad: trafficHeadingFromCompositionYaw(vehicle.yawRad),
        },
        tick,
      );
    } catch {
      // No valid lane under the driven pose: the next safe reconciliation point is used then.
    }
  };

  const characterBody = (): VehicleEntryCharacterBody =>
    Object.freeze({
      entityId,
      positionM: walker.state.positionM,
      yawRad: walker.state.yawRad,
      radiusM: walker.capsule.radiusM,
      heightM: walker.capsule.heightM,
    });

  const exitBody = (): VehicleExitCharacterBody =>
    Object.freeze({
      entityId,
      radiusM: walker.capsule.radiusM,
      heightM: walker.capsule.heightM,
    });

  const nearestVehicle = (): CompositionVehicle | undefined => {
    const feet = walker.state.positionM;
    let best: CompositionVehicle | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const vehicle of vehicles) {
      // PBI 256: mașinile AI nu sunt preluabile; G trebuie să aleagă taxiul, nu o mașină care trece.
      if (trafficIds.has(vehicle.vehicleId)) continue;
      const distance = Math.hypot(vehicle.positionM.x - feet.x, vehicle.positionM.z - feet.z);
      if (distance < bestDistance) {
        best = vehicle;
        bestDistance = distance;
      }
    }
    return best;
  };

  /**
   * Mișcarea de compunere a mașinii conduse: comandă 024 reală + mecanica 023 (masă, forță,
   * frână, ampatament, unghi de bracaj). Fizica completă Rapier rămâne a proprietarului 022/024;
   * aici se compune jucabilitatea, nu un al doilea model de fizică.
   */
  const driveVehicle = (command: AuthorityCommand): void => {
    if (command.consumer !== 'VEHICLE')
      throw new Error('Comanda de conducere nu este a unui vehicul.');
    const vehicle = vehicleById(command.vehicleId);
    if (!vehicle) throw new Error(`Vehiculul ${command.vehicleId} nu există în compunere.`);
    // PBI 257: în AUTO, poziția a fost deja produsă de driverul auto înaintea arbitrajului.
    if (vehicle.controlMode === 'AUTO') return;
    const mechanics = vehicleClass(vehicle.classId);
    const dt = V3_COMPOSITION_POLICY.dtSeconds;
    const current = vehicle.speedMps;
    const { throttle, brake, handbrake } = command.command;
    const brakeShare = Math.max(brake, handbrake ? 1 : 0);
    let speed: number;
    if (current <= V3_COMPOSITION_POLICY.parkedSpeedMps && brake > 0 && !handbrake) {
      // Din staționare (sau deja în marșarier), frâna ținută dă marșarier lent.
      speed = Math.max(
        -V3_COMPOSITION_POLICY.reverseMaxMps,
        current -
          mechanics.brakeAcceleration * V3_COMPOSITION_POLICY.reverseAccelerationShare * brake * dt,
      );
    } else if (current < 0) {
      // Marșarier fără frână ținută: mașina se oprește (mai repede cu accelerația sau frâna de mână).
      const decel = mechanics.brakeAcceleration * (throttle > 0 || handbrake ? 1 : 0.4);
      speed = Math.min(0, current + decel * dt);
    } else {
      const accel =
        brakeShare > 0
          ? -mechanics.brakeAcceleration * brakeShare
          : (tractiveForceN(mechanics, current) / mechanics.massKg) * throttle;
      speed = Math.min(vehicle.speedLimitMps, Math.max(0, current + accel * dt));
    }
    const steering = command.command.steering * mechanics.steeringRadians;
    const yawRate = (speed / mechanics.wheels.wheelbaseM) * Math.tan(steering);
    const yawRad = vehicle.yawRad + yawRate * dt;
    // PBI 238: mișcarea este măturată cu corpul real (dreptunghi rotit) prin solidele statice; la
    // atingere, componenta vitezei spre solid dispare și mașina alunecă pe suprafață.
    const body = Object.freeze({ halfX: vehicle.halfExtentsM.x, halfZ: vehicle.halfExtentsM.z });
    const swept = vehicleCollision.sweep(
      { x: vehicle.positionM.x, z: vehicle.positionM.z, yawRad: vehicle.yawRad },
      {
        x: vehicle.positionM.x + Math.sin(yawRad) * speed * dt,
        z: vehicle.positionM.z + Math.cos(yawRad) * speed * dt,
        yawRad,
      },
      body,
    );
    let resolvedSpeed = speed,
      finalPose = swept.pose;
    if (swept.blocked) {
      if (swept.normal === null) resolvedSpeed = 0;
      else {
        const forwardX = Math.sin(swept.pose.yawRad);
        const forwardZ = Math.cos(swept.pose.yawRad);
        let vx = forwardX * speed;
        let vz = forwardZ * speed;
        const into = vx * swept.normal.x + vz * swept.normal.z;
        if (into < 0) {
          vx -= into * swept.normal.x;
          vz -= into * swept.normal.z;
        }
        resolvedSpeed = vx * forwardX + vz * forwardZ;
      }
      if (Math.abs(resolvedSpeed) < V3_COMPOSITION_POLICY.contactStopSpeedMps) resolvedSpeed = 0;
    }
    // PBI 257: caroseria celorlalte mașini (AI sau static) este opacă pentru cea condusă. Fără
    // această verificare, mașina trecea prin ele; la contact rămâne pe poziția anterioară.
    if (overlapsAnyVehicle(vehicle.vehicleId, finalPose, body)) {
      finalPose = {
        x: vehicle.positionM.x,
        z: vehicle.positionM.z,
        yawRad: vehicle.yawRad,
      };
      resolvedSpeed = 0;
    }
    setVehicle(
      withVehicle(vehicle, {
        positionM: point(finalPose.x, vehicle.positionM.y, finalPose.z),
        yawRad: finalPose.yawRad,
        speedMps:
          Math.abs(resolvedSpeed) <= V3_COMPOSITION_POLICY.parkedSpeedMps ? 0 : resolvedSpeed,
        controlMode: 'MANUAL',
      }),
    );
  };

  const processEntry = (
    atTick: number,
    request: Readonly<{ vehicleId: string | null }>,
  ): boolean => {
    const authority = arbiter.snapshot().authority;
    if (authority.consumer !== 'CHARACTER') {
      emit('ENTRY_IGNORED', 'autoritatea este deja pe un vehicul', atTick);
      return false;
    }
    const target = request.vehicleId ? vehicleById(request.vehicleId) : nearestVehicle();
    entryAttempts += 1;
    if (!target) {
      emit('ENTER_REFUSED', 'UNKNOWN_VEHICLE', atTick);
      return false;
    }
    if (trafficIds.has(target.vehicleId)) {
      // Traficul 058 are propriul progres de rută; o preluare fără reconcilierea poziției ar
      // teleporta mașina înapoi la `resume`. Refuzul explicit păstrează ambele contracte curate.
      emit('ENTER_REFUSED', 'AI_TRAFFIC: vehicle is driven by 058', atTick);
      return false;
    }
    const decision = decideVehicleEntry({
      tick: atTick,
      authority,
      character: characterBody(),
      intent: { vehicleId: target.vehicleId },
      vehicles: vehicles.map((vehicle) => entryVehicle(vehicle, atTick)),
      blockers: walkWorld.blockers,
      previousEntry,
    });
    if (!decision.accepted) {
      emit('ENTER_REFUSED', `${decision.code}: ${decision.detail}`, atTick);
      return false;
    }
    previousEntry = decision.journal;
    takeover = decision.vehicle;
    const entryDrive = autoDrives.get(target.vehicleId);
    if (entryDrive !== undefined) {
      entryDrive.dispose();
      autoDrives.delete(target.vehicleId);
    }
    setVehicle(
      withVehicle(target, {
        controlMode: 'MANUAL',
        speedMps: 0,
      }),
    );
    cameraFocusVehicleId = target.vehicleId;
    resetCameraOrbit();
    arbiter.setAuthority(decision.authority);
    segments.step({
      tick: atTick,
      transition: 'ENTER',
      authority: decision.authority,
      previousAuthority: decision.previousAuthority,
      vehicleId: target.vehicleId,
      mode: 'MANUAL',
      maneuverState: target.maneuverState,
    });
    segmentCommands += 1;
    lastSegmentAction = 'ENTER';
    emit(
      'ENTER_ACCEPTED',
      `${target.vehicleId} la ${decision.door.distanceM.toFixed(3)} m`,
      atTick,
    );
    return true;
  };

  const processExit = (atTick: number): boolean => {
    const authority = arbiter.snapshot().authority;
    if (authority.consumer !== 'VEHICLE') {
      emit('EXIT_IGNORED', 'autoritatea este pe personaj', atTick);
      return false;
    }
    if (!takeover) {
      emit('EXIT_REFUSED', 'INVALID_EXIT_STATE', atTick);
      return false;
    }
    const controlled = vehicleById(authority.vehicleId);
    if (!controlled) {
      emit('EXIT_REFUSED', 'UNKNOWN_VEHICLE', atTick);
      return false;
    }
    exitAttempts += 1;
    const decision = decideVehicleExit({
      tick: atTick,
      authority,
      character: exitBody(),
      vehicle: entryVehicle(controlled, atTick),
      preTakeover: takeover,
      vehicles: vehicles.map((vehicle) =>
        entryVehicle(
          vehicle.vehicleId === controlled.vehicleId
            ? withVehicle(vehicle, { controlMode: 'MANUAL' })
            : vehicle,
          atTick,
        ),
      ),
      world: {
        surfaces: walkWorld.surfaces,
        blockers: walkWorld.blockers,
        defaultGroundM: walkWorld.defaultGroundM,
      },
      previousExit,
    });
    if (!decision.accepted) {
      emit('EXIT_REFUSED', `${decision.code}: ${decision.detail}`, atTick);
      return false;
    }
    previousExit = decision.journal;
    takeover = null;
    cameraFocusVehicleId = null;
    resetCameraOrbit();
    setVehicle(
      withVehicle(controlled, {
        controlMode: decision.vehicle.state.controlMode,
        positionM: decision.vehicle.positionM,
        yawRad: decision.vehicle.yawRad,
        speedMps: 0,
        laneId: decision.vehicle.state.laneId,
        routeLaneIds: decision.vehicle.state.routeLaneIds,
        rideId: decision.vehicle.state.rideId,
        rideProgressM: decision.vehicle.state.rideProgressM,
      }),
    );
    arbiter.setAuthority(decision.authority);
    // 196 furnizează exact `WalkerOptions.start`; corpul este același, fără teleportare scrisă.
    walker = createWalker({ world: walkWorld, start: decision.start, entityId });
    segments.step({
      tick: atTick,
      transition: 'EXIT',
      authority: decision.authority,
      previousAuthority: decision.previousAuthority,
      vehicleId: controlled.vehicleId,
      maneuverState: controlled.maneuverState,
    });
    segmentCommands += 1;
    lastSegmentAction = 'EXIT';
    emit(
      'EXIT_ACCEPTED',
      `${decision.vehicleId} pe ${decision.exit.candidateId} la ${decision.exit.clearanceM.toFixed(3)} m`,
      atTick,
    );
    return true;
  };

  const releaseVehicleToAuto = (vehicle: CompositionVehicle, atTick: number): boolean => {
    // PBI 263: a 058 actor is handed back with its real driven pose reconciled first, so AUTO
    // resumes from where the player left it instead of snapping to the frozen pre-takeover point.
    if (trafficIds.has(vehicle.vehicleId)) {
      if (traffic === null) return false;
      try {
        traffic.reconcile(
          vehicle.vehicleId,
          {
            positionM: Object.freeze({
              x: vehicle.positionM.x,
              y: vehicle.positionM.y,
              z: vehicle.positionM.z,
            }),
            headingRad: trafficHeadingFromCompositionYaw(vehicle.yawRad),
          },
          atTick,
        );
        traffic.resume(vehicle.vehicleId, atTick);
      } catch (error: unknown) {
        emit(
          'RELEASE_REFUSED',
          `${vehicle.vehicleId}: ${error instanceof Error ? error.message : String(error)}`,
          atTick,
        );
        return false;
      }
      setVehicle(withVehicle(vehicle, { controlMode: 'AUTO', speedMps: 0 }));
      return true;
    }
    return applyVehicleModeTo(vehicle, 'AUTO') === 'AUTO';
  };

  /**
   * PBI 263: explicit takeover of any live taxi/civil. The old PLAYER seat is released to AUTO
   * before the new one is claimed, inside the same tick, so there is never a second controlled car.
   * The target keeps its exact pose (route reconciliation, no teleport) and stays AUTO until this
   * explicit M/L command.
   */
  const processTakeover = (
    atTick: number,
    request: Readonly<{ vehicleId: string; mode: 'MANUAL' | 'LEARNING' }>,
  ): boolean => {
    takeoverAttempts += 1;
    const target = vehicleById(request.vehicleId);
    if (target === undefined) {
      emit('TAKEOVER_REFUSED', `UNKNOWN_VEHICLE: ${request.vehicleId}`, atTick);
      return false;
    }
    if (request.mode === 'LEARNING') {
      // PBI 271 owns LEARNING, its segments and eligibility. Refusing explicitly is honest; the car
      // remains AUTO and the current PLAYER seat is not disturbed.
      emit('TAKEOVER_REFUSED', 'LEARNING_UNAVAILABLE: owner PBI 271', atTick);
      return false;
    }
    const previousAuthority = arbiter.snapshot().authority;
    const previous = playerVehicle();
    if (previous !== null && previous.vehicleId === target.vehicleId) {
      const mode = applyVehicleModeTo(target, 'MANUAL');
      if (mode !== 'MANUAL') {
        emit('TAKEOVER_REFUSED', `SAME_VEHICLE_MODE_FAILED: ${target.vehicleId}`, atTick);
        return false;
      }
      cameraFocusVehicleId = target.vehicleId;
      resetCameraOrbit();
      takeovers += 1;
      emit('TAKEOVER_ACCEPTED', `${target.vehicleId} already held`, atTick);
      return false;
    }
    if (previous !== null && !releaseVehicleToAuto(previous, atTick)) {
      emit('TAKEOVER_REFUSED', `RELEASE_HELD_VEHICLE_FAILED: ${previous.vehicleId}`, atTick);
      return false;
    }
    const current = vehicleById(target.vehicleId) ?? target;
    if (trafficIds.has(current.vehicleId) && traffic !== null) {
      // Freeze the real 058 actor at the pose the composition already displays. No position is
      // written into the car and no second authority exists: 058 keeps the route until release.
      traffic.setAuthority(current.vehicleId, 'MANUAL', atTick);
    }
    const claimed = withVehicle(current, { controlMode: 'MANUAL', speedMps: 0 });
    setVehicle(claimed);
    takeover = entryVehicle(claimed, atTick);
    cameraFocusVehicleId = claimed.vehicleId;
    resetCameraOrbit();
    arbiter.releaseAll();
    arbiter.setAuthority(
      Object.freeze({ consumer: 'VEHICLE' as const, vehicleId: claimed.vehicleId }),
    );
    segments.step({
      tick: atTick,
      transition: 'ENTER',
      authority: Object.freeze({ consumer: 'VEHICLE' as const, vehicleId: claimed.vehicleId }),
      previousAuthority,
      vehicleId: claimed.vehicleId,
      mode: 'MANUAL',
      maneuverState: claimed.maneuverState,
    });
    segmentCommands += 1;
    lastSegmentAction = 'ENTER';
    takeovers += 1;
    emit(
      'TAKEOVER_ACCEPTED',
      `${previousAuthority.consumer === 'VEHICLE' ? `released ${previousAuthority.vehicleId}` : 'from character'} → ${claimed.vehicleId} MANUAL`,
      atTick,
    );
    return true;
  };

  /** PBI 263: controlled car back to AUTO while the camera keeps following it (observation). */
  const processRelease = (atTick: number): boolean => {
    const vehicle = controlledVehicle();
    if (vehicle === null) {
      emit('RELEASE_REFUSED', 'NO_CONTROLLED_VEHICLE', atTick);
      return false;
    }
    if (vehicle.controlMode === 'AUTO') {
      emit('RELEASE_REFUSED', `ALREADY_AUTO: ${vehicle.vehicleId}`, atTick);
      return false;
    }
    if (!releaseVehicleToAuto(vehicle, atTick)) {
      emit('RELEASE_REFUSED', `RECONCILIATION_FAILED: ${vehicle.vehicleId}`, atTick);
      return false;
    }
    cameraFocusVehicleId = vehicle.vehicleId;
    releases += 1;
    const authority = arbiter.snapshot().authority;
    segments.step({
      tick: atTick,
      transition: 'FOCUS',
      authority,
      vehicleId: vehicle.vehicleId,
    });
    segmentCommands += 1;
    lastSegmentAction = 'FOCUS';
    emit('RELEASE_ACCEPTED', `${vehicle.vehicleId} → AUTO, route kept`, atTick);
    return true;
  };

  const readCharacter = (): CompositionCharacterFrame =>
    Object.freeze({
      entityId,
      tick: walker.state.tick,
      positionM: walker.state.positionM,
      yawRad: walker.state.yawRad,
      clipId: walker.state.clipId,
      speedMps: walker.state.speedMps,
      desiredSpeedMps: walker.state.desiredSpeedMps,
      groundHeightM: walker.state.groundHeightM,
      blocked: walker.state.blocked,
      positionBits: characterPositionBits(walker.state.positionM),
    });

  const buildFrame = (atTick: number): CompositionFrame => {
    if (lastResult === null) throw new Error('Cadrul compunerii cere un tick livrat.');
    if (lastCamera === null) throw new Error('Cadrul compunerii cere o cameră pașită.');
    const authority = lastResult.authority;
    const officer = arbiter.getStats();
    const controlled = authorityEntityId(authority);
    const controlledVehicle =
      authority.consumer === 'VEHICLE' ? vehicleById(authority.vehicleId) : undefined;
    const mode: CompositionMode =
      authority.consumer === 'CHARACTER' ? 'MANUAL' : (controlledVehicle?.controlMode ?? 'AUTO');
    const hud: CompositionHud = Object.freeze({
      tick: atTick,
      controlledKind: authority.consumer,
      controlledEntityId: controlled,
      controlledLabel:
        authority.consumer === 'CHARACTER'
          ? `Personaj (${entityId})`
          : `${controlledVehicle?.driverKind === 'TAXI' ? 'Taxi' : 'Vehicul'} (${authority.vehicleId})`,
      mode,
      cameraEntityId: lastCamera.entityId,
      cameraDivergent: lastCamera.entityId !== controlled,
      clipId: authority.consumer === 'CHARACTER' ? walker.state.clipId : null,
      speedMps:
        authority.consumer === 'CHARACTER'
          ? walker.state.speedMps
          : (controlledVehicle?.speedMps ?? 0),
      transitionRemainingTicks: lastCamera.transitionRemainingTicks,
      heldActions: officer.held,
      neutralizedActions: officer.neutralized,
    });
    return Object.freeze({
      tick: atTick,
      authority,
      character: readCharacter(),
      vehicles,
      camera: lastCamera,
      hud,
      segments: segments.getStats(),
      selectedVehicleId: cameraFocusVehicleId,
      playerVehicleId: playerVehicle()?.vehicleId ?? null,
      stats: Object.freeze({
        ticks: atTick,
        deliveries: Object.freeze({ ...officer.delivered }),
        refused: Object.freeze({
          doubleDelivery: officer.refused.doubleDelivery,
          inactiveConsumer: officer.refused.inactiveConsumer,
        }),
        transitions: officer.transitions,
        walkerTicks: walker.stats.ticks,
        cameraFrames: camera.stats.frames,
        segmentCommands,
        entryAttempts,
        exitAttempts,
        takeoverAttempts,
        takeovers,
        releases,
        ticksWithoutDelivery,
      }),
      lastCommand,
      lastSegmentAction,
      events: Object.freeze([...events]),
    });
  };

  const step = (request: CompositionStepRequest): CompositionFrame => {
    if (disposed) throw new Error('Compunerea V3 este eliberată.');
    const atTick = requireTick(request?.tick, tick + 1);
    const characterBefore = walker.state.positionM;
    let transitioned = false;

    // 257 înaintea traficului: taxiul AUTO are poziția tick-ului curent când devine observație 044.
    stepAutoDrives(V3_COMPOSITION_POLICY.dtSeconds);
    // PBI 263: poziția condusă de jucător ajunge la 058 înainte ca acesta să calculeze ocuparea.
    synchronizePlayerDrivenTraffic();
    // 058 înaintea arbitrajului: pozițiile AI sunt deja autoritare când intrarea/ieșirea, camera,
    // coliziunea walker-ului și HUD-ul citesc cadrul acestui tick.
    stepTraffic(atTick);

    if (pendingTakeover !== null) {
      const request = pendingTakeover;
      pendingTakeover = null;
      transitioned = processTakeover(atTick, request);
    } else if (pendingRelease) {
      pendingRelease = false;
      transitioned = processRelease(atTick);
    } else if (pendingEntry !== null) {
      const request = pendingEntry;
      pendingEntry = null;
      transitioned = processEntry(atTick, request);
    } else if (pendingExit) {
      pendingExit = false;
      transitioned = processExit(atTick);
    }

    const result = arbiter.step({ tick: atTick, characterYawRad: walker.state.yawRad });
    lastResult = result;
    const deliveredBefore =
      result.command.consumer === 'CHARACTER'
        ? arbiter.getStats().delivered.CHARACTER
        : arbiter.getStats().delivered.VEHICLE;
    arbiter.deliver(result, result.command.consumer, {
      character: (command) => {
        walker.step({
          // Walker-ul 192 are propriul ceas; după o recreare la ieșire, tick-ul lui repornește
          // de la 1, iar contractul cere exact tick-ul următor al walker-ului.
          tick: walker.state.tick + 1,
          input: command.input,
          vehicles: vehicles.map((vehicle) => ({
            vehicleId: vehicle.vehicleId,
            positionM: vehicle.positionM,
            yawRad: vehicle.yawRad,
            halfExtentsM: vehicle.halfExtentsM,
            bottomM: vehicle.bottomM,
            topM: vehicle.topM,
          })),
        });
        lastCommand = 'CHARACTER';
      },
      vehicle: (command) => {
        driveVehicle(command);
        lastCommand = 'VEHICLE';
      },
    });
    const deliveredAfter =
      result.command.consumer === 'CHARACTER'
        ? arbiter.getStats().delivered.CHARACTER
        : arbiter.getStats().delivered.VEHICLE;
    if (deliveredAfter - deliveredBefore !== 1) ticksWithoutDelivery += 1;

    const authority = result.authority;
    const targets: readonly CharacterCameraTarget[] = Object.freeze([
      Object.freeze({
        entityId,
        kind: 'CHARACTER' as const,
        positionM: walker.state.positionM,
        yawRad: walker.state.yawRad,
        anchorHeightM: asset.measured.eyeHeightM,
      }),
      ...vehicles.map((vehicle) =>
        Object.freeze({
          entityId: vehicle.vehicleId,
          kind: 'VEHICLE' as const,
          positionM: vehicle.positionM,
          yawRad: vehicle.yawRad,
          anchorHeightM: vehicleAnchorHeightM(vehicle.classId),
        }),
      ),
    ]);
    const selected = cameraFocusVehicleId;
    const followed =
      selected !== null && vehicleById(selected) !== undefined
        ? selected
        : authorityEntityId(authority);
    const followedVehicle = followed === entityId ? undefined : vehicleById(followed);
    const anchorY =
      followedVehicle === undefined
        ? walker.state.positionM.y + asset.measured.eyeHeightM
        : followedVehicle.positionM.y + vehicleAnchorHeightM(followedVehicle.classId);
    const visibleObstacles = vehicles
      .filter(
        (vehicle) =>
          vehicle.vehicleId !== followed &&
          // Un plafon sub înălțimea ochilor nu poate ocluziona o cameră ancorată la ochi:
          // altfel ieșirea pe flancul de la bordură ar lipi camera de propria mașină.
          vehicle.topM > anchorY + 0.01,
      )
      .map(vehicleCameraObstacle);
    lastCamera = camera.step({
      tick: atTick,
      authorityEntityId: followed,
      targets,
      orbit: Object.freeze({ yawRad: orbitYawRad }),
      obstacles: Object.freeze([...staticObstacles, ...visibleObstacles]),
      groundM:
        followedVehicle === undefined ? walker.state.groundHeightM : followedVehicle.positionM.y,
    });
    // 194 raportează camera complet blocată sub distanța minimă. Compunerea rotește intenția de
    // orbită cu 90° la 0,1 s până găsește un cadru liber; altfel ieșirea pe flancul de la bordură
    // ar lăsa camera lipită de propria mașină.
    if (
      lastCamera.obstructedBy !== null &&
      lastCamera.distanceM < CHARACTER_CAMERA_POLICY.minDistanceM &&
      atTick - lastOrbitAdjustTick >= 6
    ) {
      orbitYawRad = normalizeAngle(orbitYawRad + Math.PI / 2);
      lastOrbitAdjustTick = atTick;
      clearOrbitTicks = 0;
    } else if (
      lastCamera.obstructedBy === null &&
      lastCamera.distanceM >= CHARACTER_CAMERA_POLICY.minDistanceM
    ) {
      // PBI 257: o orbită rotită pentru a ieși dintr-un obstacol nu este permanentă. După 0,5 s
      // fără obstrucție, camera revine în spatele entității; altfel rămânea lateral după depășire.
      clearOrbitTicks += 1;
      if (clearOrbitTicks >= 30 && orbitYawRad !== defaultOrbitYaw) {
        orbitYawRad = defaultOrbitYaw;
        clearOrbitTicks = 0;
      }
    } else {
      clearOrbitTicks = 0;
    }

    if (!transitioned) {
      if (authority.consumer === 'CHARACTER') {
        segments.step({
          tick: atTick,
          transition: 'WALK',
          authority,
          distanceM: Math.hypot(
            walker.state.positionM.x - characterBefore.x,
            walker.state.positionM.z - characterBefore.z,
          ),
        });
        lastSegmentAction = 'WALK';
      } else {
        segments.step({
          tick: atTick,
          transition: 'FOCUS',
          authority,
          vehicleId: authority.vehicleId,
        });
        lastSegmentAction = 'FOCUS';
      }
      segmentCommands += 1;
    }

    tick = atTick;
    frame = buildFrame(atTick);
    return frame;
  };

  return Object.freeze({
    contract: V3_COMPOSITION_VERSION,
    policy: V3_COMPOSITION_POLICY,
    entityId,
    walkWorld,
    vehicleCollision,
    arbiter,
    segments,
    port: arbiter.port,
    get frame(): CompositionFrame {
      if (!frame) throw new Error('Compunerea V3 nu a fost pașită încă.');
      return frame;
    },
    get lastResult(): AuthorityTickResult | null {
      return lastResult;
    },
    step,
    setSprint(pressed: boolean): void {
      arbiter.setSprint(pressed);
    },
    releaseInput(): void {
      arbiter.releaseAll();
    },
    requestEntry(vehicleId?: string): void {
      pendingEntry = Object.freeze({ vehicleId: vehicleId ?? null });
      pendingExit = false;
      pendingTakeover = null;
      pendingRelease = false;
    },
    requestExit(): void {
      pendingExit = true;
      pendingEntry = null;
      pendingTakeover = null;
      pendingRelease = false;
    },
    selectVehicle(vehicleId: string | null): boolean {
      if (vehicleId !== null && vehicleById(vehicleId) === undefined) {
        emit('CAMERA_SELECTION_REFUSED', `UNKNOWN_VEHICLE: ${vehicleId}`, tick);
        return false;
      }
      cameraFocusVehicleId = vehicleId;
      emit('CAMERA_SELECTED', vehicleId ?? 'authority', tick);
      return true;
    },
    selectedVehicleId(): string | null {
      return cameraFocusVehicleId;
    },
    playerVehicleId(): string | null {
      return playerVehicle()?.vehicleId ?? null;
    },
    requestTakeover(vehicleId: string, mode: 'MANUAL' | 'LEARNING'): boolean {
      if (vehicleById(vehicleId) === undefined) {
        emit('TAKEOVER_REFUSED', `UNKNOWN_VEHICLE: ${vehicleId}`, tick);
        return false;
      }
      if (mode !== 'MANUAL' && mode !== 'LEARNING')
        throw new Error('Preluarea cere modul MANUAL sau LEARNING.');
      pendingTakeover = Object.freeze({ vehicleId, mode });
      pendingEntry = null;
      pendingExit = false;
      pendingRelease = false;
      return true;
    },
    requestRelease(): boolean {
      const vehicle = controlledVehicle();
      if (vehicle === null || vehicle.controlMode === 'AUTO') {
        emit('RELEASE_REFUSED', vehicle === null ? 'NO_CONTROLLED_VEHICLE' : 'ALREADY_AUTO', tick);
        return false;
      }
      pendingRelease = true;
      pendingEntry = null;
      pendingExit = false;
      pendingTakeover = null;
      return true;
    },
    takeOverSelected(mode: 'MANUAL' | 'LEARNING'): boolean {
      const selected = cameraFocusVehicleId;
      const controlled = controlledVehicle();
      if (selected === null || (controlled !== null && controlled.vehicleId === selected)) {
        if (mode === 'LEARNING') {
          // LEARNING is refused through the same explicit path; M still toggles the held car.
          if (controlled !== null) {
            emit('TAKEOVER_REFUSED', 'LEARNING_UNAVAILABLE: owner PBI 271', tick);
            return false;
          }
          emit('TAKEOVER_REFUSED', 'NO_SELECTED_VEHICLE', tick);
          return false;
        }
        return toggleControlledVehicleMode() !== null;
      }
      if (vehicleById(selected) === undefined) {
        emit('TAKEOVER_REFUSED', `UNKNOWN_VEHICLE: ${selected}`, tick);
        return false;
      }
      pendingTakeover = Object.freeze({ vehicleId: selected, mode });
      pendingEntry = null;
      pendingExit = false;
      pendingRelease = false;
      return true;
    },
    vehicleMode(): CompositionMode | null {
      return controlledVehicle()?.controlMode ?? null;
    },
    setVehicleMode(mode: 'AUTO' | 'MANUAL'): CompositionMode | null {
      return applyVehicleMode(mode);
    },
    toggleVehicleMode(): CompositionMode | null {
      return toggleControlledVehicleMode();
    },
    character(): CompositionCharacterFrame {
      return readCharacter();
    },
    characterFrame(): CharacterRenderFrame {
      return walker.renderFrame();
    },
    resetScenario(): void {
      walker = createSpawnWalker();
      arbiter.releaseAll();
      arbiter.setAuthority(characterAuthority(entityId));
      takeover = null;
      pendingEntry = null;
      pendingExit = false;
      pendingTakeover = null;
      pendingRelease = false;
      cameraFocusVehicleId = null;
      previousEntry = null;
      previousExit = null;
      resetCameraOrbit();
      for (const drive of autoDrives.values()) drive.dispose();
      autoDrives.clear();
      emit('RESET', 'walker nou la spawn', tick);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const drive of autoDrives.values()) drive.dispose();
      autoDrives.clear();
      autoPlanner?.dispose();
      autoPlanner = null;
      arbiter.dispose();
      segments.dispose();
    },
  });
}

/** Copie compactă, plain-data, pentru bucla fixă; compunerea rămâne proprietarul stării. */
export interface CompositionTickSnapshot {
  readonly tick: number;
  readonly ready: true;
  readonly controlled: string;
  readonly mode: CompositionMode;
  readonly clipId: CharacterClipId | null;
  readonly controlledEntityId: string;
  readonly bodyPositionM: CharacterPoint;
  readonly speedMps: number;
  readonly cameraEntityId: string;
  readonly openSegmentId: string | null;
  readonly deliveries: Readonly<{ CHARACTER: number; VEHICLE: number }>;
}

export function compositionSnapshot(composition: V3Composition): CompositionTickSnapshot {
  const frame = composition.frame;
  return Object.freeze({
    tick: frame.tick,
    ready: true as const,
    controlled: `${frame.hud.controlledKind}:${frame.hud.controlledEntityId}`,
    mode: frame.hud.mode,
    clipId: frame.hud.clipId,
    controlledEntityId: frame.hud.controlledEntityId,
    bodyPositionM: frame.character.positionM,
    speedMps: frame.character.speedMps,
    cameraEntityId: frame.camera.entityId,
    openSegmentId: frame.segments.openSegmentId,
    deliveries: frame.stats.deliveries,
  });
}

/** Proiecția HUD, separată de DOM: UI-ul 236 consumă exact acest read model. */
export function compositionHudLine(hud: CompositionHud): string {
  const kind = hud.controlledKind === 'CHARACTER' ? 'Personaj' : 'Vehicul';
  return `${kind} ${hud.controlledEntityId} · ${hud.mode} · ${hud.clipId ?? 'vehicul'} · ${hud.speedMps.toFixed(2)} m/s`;
}

/** Dovada 191: writer-ul de animație refuză poziția entității, indiferent de apelant. */
export function characterWriterRefusals(characterId: string): readonly string[] {
  const writer = createCharacterPoseWriter(
    createCharacterAuthority({ entityId: characterId, positionM: point(0, 0, 0), yawRad: 0 }),
  );
  const refusals: string[] = [];
  try {
    writer.writeEntityPositionM(point(1, 0, 0));
    refusals.push('ACCEPTED');
  } catch (error: unknown) {
    refusals.push((error as { code?: string }).code ?? 'UNKNOWN');
  }
  try {
    writer.writeRootMotionM(point(0, 0, 1));
    refusals.push('ACCEPTED');
  } catch (error: unknown) {
    refusals.push((error as { code?: string }).code ?? 'UNKNOWN');
  }
  return Object.freeze(refusals);
}

/** Cadrul 191 pentru (poziție, yaw, clip, tick), fără nicio scriere de poziție. */
export function sampleRenderFrame(
  characterId: string,
  positionM: CharacterPoint,
  yawRad: number,
  clipId: CharacterClipId,
  tick: number,
): CharacterRenderFrame {
  const asset = createCharacterAsset();
  const pose = sampleCharacterPose(asset.skeleton, clipId, tick);
  return applyCharacterPose(
    createCharacterAuthority({ entityId: characterId, positionM, yawRad }),
    pose,
  );
}

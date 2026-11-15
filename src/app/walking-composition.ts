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
import { VEHICLE_COLLISION_HALF_EXTENTS_M, vehicleGeometrySpec } from '../rendering';
import type { ContractContext } from '../sessions';
import type { ControlPreferences } from '../settings';
import { tractiveForceN, vehicleClass, type ControlMode } from '../vehicles';
import type { CityLayout } from '../world';

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
}

/** Mașina compusă: contractul 195/196 plus viteza reală pe care o integrează compunerea. */
export interface CompositionVehicle {
  readonly vehicleId: string;
  readonly driverKind: 'TAXI' | 'CIVILIAN';
  readonly classId: 'sedan' | 'compact';
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
  return top;
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
  let vehicles = Object.freeze(options.vehicles.map(vehicleFromSeed));
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
  let entryAttempts = 0;
  let exitAttempts = 0;
  let ticksWithoutDelivery = 0;
  let segmentCommands = 0;
  let disposed = false;
  /** Intenția de orbită 194; compunerea o rotește doar când camera este complet blocată. */
  let orbitYawRad = options.orbit?.yawRad ?? CHARACTER_CAMERA_DEFAULT_ORBIT.yawRad;
  let lastOrbitAdjustTick = Number.NEGATIVE_INFINITY;
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
    const mechanics = vehicleClass(vehicle.classId);
    const dt = V3_COMPOSITION_POLICY.dtSeconds;
    const current = vehicle.speedMps;
    const brakeShare = Math.max(command.command.brake, command.command.handbrake ? 1 : 0);
    const accel =
      brakeShare > 0
        ? -mechanics.brakeAcceleration * brakeShare
        : (tractiveForceN(mechanics, current) / mechanics.massKg) * command.command.throttle;
    const speed = Math.min(vehicle.speedLimitMps, Math.max(0, current + accel * dt));
    const steering = command.command.steering * mechanics.steeringRadians;
    const yawRate = (speed / mechanics.wheels.wheelbaseM) * Math.tan(steering);
    const yawRad = vehicle.yawRad + yawRate * dt;
    setVehicle(
      withVehicle(vehicle, {
        positionM: point(
          vehicle.positionM.x + Math.sin(yawRad) * speed * dt,
          vehicle.positionM.y,
          vehicle.positionM.z + Math.cos(yawRad) * speed * dt,
        ),
        yawRad,
        speedMps: speed <= V3_COMPOSITION_POLICY.parkedSpeedMps ? 0 : speed,
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
    setVehicle(
      withVehicle(target, {
        controlMode: decision.vehicle.state.controlMode,
        speedMps: 0,
      }),
    );
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

    if (pendingEntry !== null) {
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
    const followed = authorityEntityId(authority);
    const anchorY =
      authority.consumer === 'CHARACTER'
        ? walker.state.positionM.y + asset.measured.eyeHeightM
        : (vehicleById(authority.vehicleId)?.positionM.y ?? 0) +
          vehicleAnchorHeightM(vehicleById(authority.vehicleId)?.classId ?? 'sedan');
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
        authority.consumer === 'CHARACTER'
          ? walker.state.groundHeightM
          : (vehicleById(authority.vehicleId)?.positionM.y ?? 0),
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
    },
    requestExit(): void {
      pendingExit = true;
      pendingEntry = null;
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
      previousEntry = null;
      previousExit = null;
      emit('RESET', 'walker nou la spawn', tick);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
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

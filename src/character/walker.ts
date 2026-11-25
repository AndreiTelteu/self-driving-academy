/**
 * PBI 192 — deterministic walking controller: ground movement, collision and steps.
 *
 * The walker is a pure fixed-tick integrator (60 Hz, no clock, no DOM, no random source). It owns
 * the single authoritative transform of the character: `state.positionM` and `state.yawRad` are the
 * only values the renderer may read, and the animation clips from PBI 191 stay output-only.
 *
 * Collision is planar: the character is a cylinder built from the PBI 191 footprint (0.300 × 0.260
 * m, so radius 0.15 m) and height (1.780 m), resolved against convex polygons supplied by the walk
 * world: real building footprints, obstacles and vehicle rectangles. Verticality is a surface
 * height plus one policy: a rise or a drop larger than the real curb height (0.14 m) is refused,
 * and the ledge behaves as a wall instead of being climbed through.
 *
 * The walker never creates, registers or writes a vehicle body. Those channels exist and always
 * throw, so a caller cannot mistake a silent no-op for success.
 */
import {
  applyCharacterPose,
  characterPositionBits,
  createCharacterAuthority,
  type CharacterAuthority,
  type CharacterRenderFrame,
} from './authority';
import { createCharacterAsset } from './asset';
import {
  CHARACTER_SAMPLING_HZ,
  characterClipNominalSpeedMps,
  characterClipSpec,
  sampleCharacterPose,
  type CharacterClipId,
} from './clips';
import { CharacterContractError } from './errors';
import type { CharacterPoint, CharacterSkeleton } from './skeleton';
import {
  WALK_CURB_HEIGHT_M,
  type WalkBlocker,
  type WalkSurface,
  type WalkWorld,
} from './walk-world';
import {
  boundsOverlap,
  circlePushOut,
  createOrientedRectanglePolygon,
  type WalkPolygon,
} from './walk-geometry';

export const WALKER_CONTRACT_VERSION = '192-walker-v1' as const;

const DT_SECONDS = 1 / CHARACTER_SAMPLING_HZ;

export type WalkerGait = 'NONE' | 'WALK' | 'RUN';
export const WALKER_GAITS = Object.freeze(['NONE', 'WALK', 'RUN'] as const);

/**
 * The only walking policy in the project. `stepCeilingM` is the real curb height from the city
 * layout, not a taste value: a step of that height is climbed, anything higher is a wall.
 */
export const WALKER_POLICY = Object.freeze({
  contract: WALKER_CONTRACT_VERSION,
  tickHz: CHARACTER_SAMPLING_HZ,
  dtSeconds: DT_SECONDS,
  /** Longest horizontal move resolved in one solver pass; keeps a fast tick from tunnelling. */
  maxSubstepM: 0.05,
  /** Circle-versus-solid passes per substep; each pass removes the deepest overlap. */
  solverIterations: 8,
  /** Overlaps at or below this depth are numerical residue, not a real contact. */
  solverToleranceM: 1e-9,
  /** Confirmed climb limit: the real 0.14 m curb authored by the city layout. */
  stepCeilingM: WALK_CURB_HEIGHT_M,
  /** Free gap kept between the character cylinder and a vehicle box. */
  vehicleContactMarginM: 0.05,
  /** Free gap kept between the character cylinder and a static obstacle. */
  obstacleMarginM: 0.05,
  /**
   * Facing change limit; the walker turns deterministically instead of snapping. 2.5 rad/s
   * (~143°/s) keeps a short A/D tap to a small correction (~14° for 100 ms).
   */
  turnRateRadps: 2.5,
  accelerationMps2: 6,
  decelerationMps2: 10,
  /** Below this measured speed the character is idle, whatever the input asked for. */
  idleSpeedMps: 0.05,
  /** Above this multiple of the walk clip speed the real motion needs the run clip. */
  runClipRatio: 1.05,
  eventCapacity: 96,
});

/** Nominal ground speed of each gait, derived from the PBI 191 in-place clips. */
export const WALKER_GAIT_SPEEDS_MPS = Object.freeze({
  WALK: characterClipNominalSpeedMps(characterClipSpec('walk')),
  RUN: characterClipNominalSpeedMps(characterClipSpec('run')),
});

export interface WalkerInput {
  /**
   * Desired facing in radians; +Z is forward at yaw 0, the same convention as the chassis. It is
   * honoured for every gait, including `NONE` (turning in place).
   */
  readonly headingRad: number;
  readonly gait: WalkerGait;
  /** 0…1 fraction of the gait speed; zero means the character is commanded to stand. */
  readonly intensity: number;
}

/** Standing input facing yaw 0; to stand without turning, pass the current yaw as `headingRad`. */
export const WALKER_IDLE_INPUT: WalkerInput = Object.freeze({
  headingRad: 0,
  gait: 'NONE',
  intensity: 0,
});

/** Read-only vehicle footprint. The walker only reads it; writing is refused structurally. */
export interface WalkerVehicleSnapshot {
  readonly vehicleId: string;
  readonly positionM: CharacterPoint;
  readonly yawRad: number;
  /** Real X/Z half sizes of the vehicle box, from the PBI 023/145 geometry. */
  readonly halfExtentsM: Readonly<{ x: number; z: number }>;
  readonly bottomM: number;
  readonly topM: number;
}

export type WalkerEventKind =
  | 'STEP_UP'
  | 'STEP_DOWN'
  | 'STEP_REFUSED_ASCENT'
  | 'STEP_REFUSED_DESCENT'
  | 'BLOCKED'
  | 'VEHICLE_CONTACT';

export interface WalkerEvent {
  readonly tick: number;
  readonly kind: WalkerEventKind;
  readonly positionM: CharacterPoint;
  /** Signed height change that triggered a step event; null for the other kinds. */
  readonly riseM: number | null;
  readonly ceilingM: number | null;
  readonly blockerId: string | null;
  /** Free gap kept between the cylinder and the collider face, in metres. */
  readonly clearanceM: number | null;
}

export interface WalkerState {
  readonly tick: number;
  /** Authoritative feet-centre position; the only place the character exists. */
  readonly positionM: CharacterPoint;
  readonly yawRad: number;
  /** Ground speed actually achieved over the last tick, not the commanded speed. */
  readonly speedMps: number;
  readonly desiredSpeedMps: number;
  readonly clipId: CharacterClipId;
  /** Top of the slab the feet stand on, in metres. */
  readonly groundHeightM: number;
  /** True when a solid or an unreachable ledge removed part of the requested motion. */
  readonly blocked: boolean;
  /** Authoritative position writes performed by the walker; the animation writes none. */
  readonly positionWrites: number;
}

export interface WalkerStats {
  readonly ticks: number;
  readonly distanceM: number;
  readonly stepUps: number;
  readonly stepDowns: number;
  readonly stepRefusals: number;
  readonly vehicleContacts: number;
  readonly blockedTicks: number;
  readonly positionWrites: number;
  readonly renderFrames: number;
  /** Always zero: the walking module owns no vehicle body. */
  readonly vehicleBodiesCreated: number;
  readonly droppedEvents: number;
}

export interface WalkerCapsule {
  readonly radiusM: number;
  readonly heightM: number;
}

export interface WalkerOptions {
  readonly world: WalkWorld;
  readonly start: Readonly<{ positionM: CharacterPoint; yawRad: number }>;
  readonly entityId?: string;
  /** Optional overrides; the defaults are measured from the PBI 191 asset, never typed twice. */
  readonly capsule?: WalkerCapsule;
  readonly skeleton?: CharacterSkeleton;
}

export interface WalkerStepInput {
  readonly tick: number;
  readonly input: WalkerInput;
  readonly vehicles?: readonly WalkerVehicleSnapshot[];
}

export interface WalkerStepResult {
  readonly state: WalkerState;
  readonly events: readonly WalkerEvent[];
}

/** Channels that would double the vehicle bodies; they exist only to refuse. */
export interface WalkerRegistrationGuard {
  registerVehicleBody(request: unknown): never;
  writeVehicleState(request: unknown): never;
  readonly vehicleBodiesCreated: number;
}

export interface Walker {
  readonly contract: typeof WALKER_CONTRACT_VERSION;
  readonly entityId: string;
  readonly capsule: WalkerCapsule;
  readonly world: WalkWorld;
  readonly policy: typeof WALKER_POLICY;
  readonly state: WalkerState;
  readonly stats: WalkerStats;
  readonly events: readonly WalkerEvent[];
  readonly registration: WalkerRegistrationGuard;
  step(input: WalkerStepInput): WalkerStepResult;
  /** The single authoritative transform, in the exact PBI 191 shape. */
  authority(): CharacterAuthority;
  /** Render frame for the current tick; position and yaw are copied from the walker. */
  renderFrame(): CharacterRenderFrame;
  positionBits(): string;
}

const point = (x: number, y: number, z: number): CharacterPoint => Object.freeze({ x, y, z });

function requireFinite(value: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new CharacterContractError('INVALID_WALK_INPUT', `${label} must be a finite number`);
  return value;
}

function requireTick(value: number, expected: number): number {
  if (!Number.isSafeInteger(value) || value !== expected)
    throw new CharacterContractError(
      'INVALID_TICK',
      `tick must be the next fixed tick (${expected}), received ${String(value)}`,
    );
  return value;
}

function readInput(input: WalkerInput): WalkerInput {
  if (!input || typeof input !== 'object')
    throw new CharacterContractError('INVALID_WALK_INPUT', 'input is required');
  const headingRad = requireFinite(input.headingRad, 'headingRad');
  if (!WALKER_GAITS.includes(input.gait))
    throw new CharacterContractError('INVALID_WALK_INPUT', `unknown gait ${String(input.gait)}`);
  const intensity = requireFinite(input.intensity, 'intensity');
  if (intensity < 0 || intensity > 1)
    throw new CharacterContractError('INVALID_WALK_INPUT', 'intensity must be within 0…1');
  return Object.freeze({ headingRad, gait: input.gait, intensity });
}

function requireVehicles(
  vehicles: readonly WalkerVehicleSnapshot[] | undefined,
): readonly WalkerVehicleSnapshot[] {
  if (vehicles === undefined) return Object.freeze([]);
  if (!Array.isArray(vehicles))
    throw new CharacterContractError('INVALID_WALK_INPUT', 'vehicles must be an array');
  const seen = new Set<string>();
  for (const vehicle of vehicles) {
    if (!vehicle || typeof vehicle !== 'object')
      throw new CharacterContractError('INVALID_WALK_INPUT', 'vehicle snapshot is required');
    if (typeof vehicle.vehicleId !== 'string' || !vehicle.vehicleId.trim())
      throw new CharacterContractError(
        'INVALID_WALK_INPUT',
        'vehicleId must be a non-empty string',
      );
    if (seen.has(vehicle.vehicleId))
      throw new CharacterContractError(
        'INVALID_WALK_INPUT',
        `duplicate vehicle snapshot ${vehicle.vehicleId}`,
      );
    seen.add(vehicle.vehicleId);
    requireFinite(vehicle.positionM?.x, `vehicle ${vehicle.vehicleId} x`);
    requireFinite(vehicle.positionM?.z, `vehicle ${vehicle.vehicleId} z`);
    requireFinite(vehicle.yawRad, `vehicle ${vehicle.vehicleId} yaw`);
    requireFinite(vehicle.halfExtentsM?.x, `vehicle ${vehicle.vehicleId} half x`);
    requireFinite(vehicle.halfExtentsM?.z, `vehicle ${vehicle.vehicleId} half z`);
    requireFinite(vehicle.bottomM, `vehicle ${vehicle.vehicleId} bottom`);
    requireFinite(vehicle.topM, `vehicle ${vehicle.vehicleId} top`);
    if (vehicle.halfExtentsM.x <= 0 || vehicle.halfExtentsM.z <= 0)
      throw new CharacterContractError(
        'INVALID_WALK_INPUT',
        `vehicle ${vehicle.vehicleId} has no footprint`,
      );
    if (vehicle.topM <= vehicle.bottomM)
      throw new CharacterContractError(
        'INVALID_WALK_INPUT',
        `vehicle ${vehicle.vehicleId} has no vertical extent`,
      );
  }
  return Object.freeze([...vehicles]);
}

function requireCapsule(radiusM: number, heightM: number): WalkerCapsule {
  if (!Number.isFinite(radiusM) || !Number.isFinite(heightM) || radiusM <= 0 || heightM <= 0)
    throw new CharacterContractError('INVALID_WALK_INPUT', 'capsule must be positive and finite');
  return Object.freeze({ radiusM, heightM });
}

/** Clip chosen from the measured speed, never from the input command. */
export function walkerClipForSpeed(speedMps: number): CharacterClipId {
  if (!Number.isFinite(speedMps) || speedMps < 0)
    throw new CharacterContractError('INVALID_WALK_INPUT', 'speed must be finite and non-negative');
  if (speedMps < WALKER_POLICY.idleSpeedMps) return 'idle';
  if (speedMps <= WALKER_GAIT_SPEEDS_MPS.WALK * WALKER_POLICY.runClipRatio) return 'walk';
  return 'run';
}

function turnToward(currentYaw: number, targetYaw: number, maximumStep: number): number {
  // `%` păstrează semnul în JavaScript, deci vechea formulă întorcea −3π/2 pentru o țintă la −π
  // și vira în partea greșită. atan2 dă întotdeauna diferența cea mai scurtă, cu semnul corect.
  const delta = Math.atan2(Math.sin(targetYaw - currentYaw), Math.cos(targetYaw - currentYaw));
  // Rezultatul este current + delta, nu target: target-ul poate fi la 2π distanță și un snap
  // direct ar sări o rotație completă (exact simptomul „se întoarce la poziția inițială”).
  if (Math.abs(delta) <= maximumStep) return currentYaw + delta;
  return currentYaw + Math.sign(delta) * maximumStep;
}

function approachSpeed(current: number, target: number, dtSeconds: number): number {
  const rate = target >= current ? WALKER_POLICY.accelerationMps2 : WALKER_POLICY.decelerationMps2;
  const maximumStep = rate * dtSeconds;
  if (Math.abs(target - current) <= maximumStep) return target;
  return current + Math.sign(target - current) * maximumStep;
}

function vehicleBlocker(vehicle: WalkerVehicleSnapshot): WalkBlocker {
  return Object.freeze({
    id: vehicle.vehicleId,
    kind: 'OBSTACLE' as const,
    bottomM: vehicle.bottomM,
    topM: vehicle.topM,
    marginM: WALKER_POLICY.vehicleContactMarginM,
    polygon: createOrientedRectanglePolygon(
      `vehicle:${vehicle.vehicleId}`,
      vehicle.positionM,
      { x: vehicle.halfExtentsM.x, z: vehicle.halfExtentsM.z },
      vehicle.yawRad,
    ),
  });
}

interface SolverHit {
  readonly id: string;
  readonly surface: boolean;
  readonly depthM: number;
}

/**
 * Creates the single authoritative walker. The start is admitted only on a real surface and only
 * outside every solid, so the character can never appear inside a collider.
 */
export function createWalker(options: WalkerOptions): Walker {
  if (!options || typeof options !== 'object')
    throw new CharacterContractError('INVALID_WALK_INPUT', 'walker options are required');
  const world = options.world;
  if (!world || !Array.isArray(world.surfaces) || !Array.isArray(world.blockers))
    throw new CharacterContractError('INVALID_WALK_INPUT', 'walker needs a walk world');
  const entityId = options.entityId ?? 'player-character';
  if (typeof entityId !== 'string' || !entityId.trim())
    throw new CharacterContractError('INVALID_WALK_INPUT', 'entityId must be a non-empty string');
  const asset = createCharacterAsset();
  const skeleton = options.skeleton ?? asset.skeleton;
  const capsule = requireCapsule(
    options.capsule?.radiusM ??
      Math.max(asset.measured.footprintWidthM, asset.measured.footprintDepthM) / 2,
    options.capsule?.heightM ?? asset.measured.heightM,
  );
  const startX = requireFinite(options.start?.positionM?.x, 'start x');
  const startZ = requireFinite(options.start?.positionM?.z, 'start z');
  const startY = requireFinite(options.start?.positionM?.y, 'start y');
  const startYaw = requireFinite(options.start?.yawRad, 'start yaw');
  const groundHeightM = world.surfaceAt(startX, startZ);
  if (Math.abs(startY - groundHeightM) > 1e-9)
    throw new CharacterContractError(
      'INVALID_WALK_INPUT',
      `start y ${startY} does not sit on the surface ${groundHeightM}`,
    );
  const overlappingStart = world
    .blockingAt(startX, startZ)
    .filter(
      (blocker) =>
        blocker.topM > groundHeightM && blocker.bottomM < groundHeightM + capsule.heightM,
    );
  if (overlappingStart.length > 0)
    throw new CharacterContractError(
      'WALK_START_BLOCKED',
      `start position is inside ${overlappingStart.map((blocker) => blocker.id).join(', ')}`,
    );

  const staticBlockers = world.blockers;
  let state: WalkerState = Object.freeze({
    tick: 0,
    positionM: point(startX, groundHeightM, startZ),
    yawRad: startYaw,
    speedMps: 0,
    desiredSpeedMps: 0,
    clipId: 'idle',
    groundHeightM,
    blocked: false,
    positionWrites: 1,
  });
  let ticks = 0;
  let distanceM = 0;
  let stepUps = 0;
  let stepDowns = 0;
  let stepRefusals = 0;
  let vehicleContacts = 0;
  let blockedTicks = 0;
  let renderFrames = 0;
  let droppedEvents = 0;
  const eventLog: WalkerEvent[] = [];
  /** Contact episodes: one event per new contact, not one per tick of the same contact. */
  let touchingVehicles = new Set<string>();
  let refusedWalls = new Set<string>();

  const pushEvent = (event: WalkerEvent): void => {
    if (eventLog.length >= WALKER_POLICY.eventCapacity) {
      droppedEvents += 1;
      return;
    }
    eventLog.push(Object.freeze(event));
  };

  const authority = (): CharacterAuthority =>
    createCharacterAuthority({ entityId, positionM: state.positionM, yawRad: state.yawRad });

  /** Slabs this walker cannot step onto or off from `feetM`, near enough to matter. */
  const wallsAt = (feetM: number, x: number, z: number): readonly WalkSurface[] => {
    const reach = capsule.radiusM + 1.5;
    return world.surfaces.filter((surface) => {
      const rise = surface.topM - feetM;
      if (rise <= WALKER_POLICY.stepCeilingM && rise >= -WALKER_POLICY.stepCeilingM) return false;
      return boundsOverlap(surface.polygon.bounds, x - reach, x + reach, z - reach, z + reach);
    });
  };

  const step = (stepInput: WalkerStepInput): WalkerStepResult => {
    const tick = requireTick(stepInput?.tick, state.tick + 1);
    const input = readInput(stepInput.input);
    const vehicles = requireVehicles(stepInput.vehicles);
    const vehicleBlockers = Object.freeze(vehicles.map((vehicle) => vehicleBlocker(vehicle)));
    const stepEvents: WalkerEvent[] = [];
    const seen = new Set<string>();
    const emit = (event: WalkerEvent): void => {
      stepEvents.push(event);
      pushEvent(event);
    };

    // The facing follows `headingRad` even while standing, so A/D turn the character in place.
    const yaw = turnToward(
      state.yawRad,
      input.headingRad,
      WALKER_POLICY.turnRateRadps * DT_SECONDS,
    );
    const desiredSpeedMps =
      input.gait === 'NONE' ? 0 : WALKER_GAIT_SPEEDS_MPS[input.gait] * input.intensity;
    const requestedSpeed = approachSpeed(state.speedMps, desiredSpeedMps, DT_SECONDS);
    const intendedM = requestedSpeed * DT_SECONDS;
    const substeps = Math.max(1, Math.ceil(intendedM / WALKER_POLICY.maxSubstepM));
    const substepX = intendedM === 0 ? 0 : (Math.sin(yaw) * intendedM) / substeps;
    const substepZ = intendedM === 0 ? 0 : (Math.cos(yaw) * intendedM) / substeps;

    let x = state.positionM.x;
    let z = state.positionM.z;
    let feetM = state.groundHeightM;
    let blocked = false;
    let wallThisStep = new Set<string>();
    let vehicleThisStep = new Set<string>();

    for (let substep = 0; substep < substeps; substep += 1) {
      const from = { x, z };
      const feetBefore = feetM;
      const candidate = { x: x + substepX, z: z + substepZ };
      const walls = wallsAt(feetM, x, z);
      const hits: SolverHit[] = [];
      for (let iteration = 0; iteration < WALKER_POLICY.solverIterations; iteration += 1) {
        let best: SolverHit | null = null;
        let offsetX = 0;
        let offsetZ = 0;
        const consider = (
          id: string,
          polygon: WalkPolygon,
          effectiveRadiusM: number,
          surface: boolean,
        ): void => {
          if (
            !boundsOverlap(
              polygon.bounds,
              candidate.x - effectiveRadiusM,
              candidate.x + effectiveRadiusM,
              candidate.z - effectiveRadiusM,
              candidate.z + effectiveRadiusM,
            )
          )
            return;
          const push = circlePushOut(polygon, candidate.x, candidate.z, effectiveRadiusM);
          if (!push || push.depthM <= WALKER_POLICY.solverToleranceM) return;
          if (push.depthM <= (best?.depthM ?? 0)) return;
          best = { id, surface, depthM: push.depthM };
          offsetX = push.offsetM.x;
          offsetZ = push.offsetM.z;
        };
        for (const blocker of staticBlockers) {
          if (blocker.topM <= feetM || blocker.bottomM >= feetM + capsule.heightM) continue;
          consider(blocker.id, blocker.polygon, capsule.radiusM + blocker.marginM, false);
        }
        for (const vehicle of vehicleBlockers) {
          if (vehicle.topM <= feetM || vehicle.bottomM >= feetM + capsule.heightM) continue;
          consider(vehicle.id, vehicle.polygon, capsule.radiusM + vehicle.marginM, false);
        }
        for (const wall of walls) consider(wall.id, wall.polygon, capsule.radiusM, true);
        const hit = best as SolverHit | null;
        if (hit === null) break;
        candidate.x += offsetX;
        candidate.z += offsetZ;
        hits.push(hit);
      }
      const surfaceM = world.surfaceAt(candidate.x, candidate.z);
      const rise = surfaceM - feetM;
      if (rise > WALKER_POLICY.stepCeilingM || rise < -WALKER_POLICY.stepCeilingM) {
        // Fail-closed: an unreachable slab may not be entered even if the solver left a gap.
        candidate.x = from.x;
        candidate.z = from.z;
        blocked = true;
      } else {
        const key = rise > 0 ? 'step:up' : rise < 0 ? 'step:down' : null;
        if (rise > 0) stepUps += 1;
        if (rise < 0) stepDowns += 1;
        if (key !== null && !seen.has(key)) {
          seen.add(key);
          emit({
            tick,
            kind: rise > 0 ? 'STEP_UP' : 'STEP_DOWN',
            positionM: point(candidate.x, surfaceM, candidate.z),
            riseM: rise,
            ceilingM: WALKER_POLICY.stepCeilingM,
            blockerId: null,
            clearanceM: null,
          });
        }
        x = candidate.x;
        z = candidate.z;
        feetM = surfaceM;
      }
      if (hits.length > 0) blocked = true;
      wallThisStep = new Set<string>();
      vehicleThisStep = new Set<string>();
      for (const hit of hits) {
        if (hit.surface) {
          wallThisStep.add(hit.id);
          if (refusedWalls.has(hit.id)) continue;
          const wall = walls.find((entry) => entry.id === hit.id);
          const wallRise = (wall?.topM ?? feetBefore) - feetBefore;
          const kind: WalkerEventKind =
            wallRise > 0 ? 'STEP_REFUSED_ASCENT' : 'STEP_REFUSED_DESCENT';
          stepRefusals += 1;
          emit({
            tick,
            kind,
            positionM: point(x, feetM, z),
            riseM: wallRise,
            ceilingM: WALKER_POLICY.stepCeilingM,
            blockerId: hit.id,
            clearanceM: null,
          });
          continue;
        }
        const vehicle = vehicleBlockers.find((entry) => entry.id === hit.id);
        if (!vehicle) continue;
        vehicleThisStep.add(hit.id);
        if (touchingVehicles.has(hit.id)) continue;
        vehicleContacts += 1;
        emit({
          tick,
          kind: 'VEHICLE_CONTACT',
          positionM: point(x, feetM, z),
          riseM: null,
          ceilingM: null,
          blockerId: hit.id,
          clearanceM: vehicle.marginM,
        });
      }
    }

    const rawMovedM = Math.hypot(x - state.positionM.x, z - state.positionM.z);
    // Sub-tolerance motion is solver residue, not walking: keep the frame exactly where it was.
    const movedM = rawMovedM <= WALKER_POLICY.solverToleranceM ? 0 : rawMovedM;
    if (movedM === 0) {
      x = state.positionM.x;
      z = state.positionM.z;
      feetM = state.groundHeightM;
    }
    const actualSpeedMps = movedM / DT_SECONDS;
    const clipId = walkerClipForSpeed(actualSpeedMps);
    touchingVehicles = vehicleThisStep;
    refusedWalls = wallThisStep;
    if (blocked) {
      blockedTicks += 1;
      if (!seen.has('blocked'))
        emit({
          tick,
          kind: 'BLOCKED',
          positionM: point(x, feetM, z),
          riseM: null,
          ceilingM: WALKER_POLICY.stepCeilingM,
          blockerId: null,
          clearanceM: null,
        });
    }
    ticks += 1;
    distanceM += movedM;
    const positionChanged = movedM > 0 || feetM !== state.positionM.y;
    state = Object.freeze({
      tick,
      positionM: point(x, feetM, z),
      yawRad: yaw,
      speedMps: actualSpeedMps,
      desiredSpeedMps,
      clipId,
      groundHeightM: feetM,
      blocked,
      positionWrites: positionChanged ? state.positionWrites + 1 : state.positionWrites,
    });
    return Object.freeze({ state, events: Object.freeze([...stepEvents]) });
  };

  const walker: Walker = {
    contract: WALKER_CONTRACT_VERSION,
    entityId,
    capsule,
    world,
    policy: WALKER_POLICY,
    get state() {
      return state;
    },
    get stats(): WalkerStats {
      return Object.freeze({
        ticks,
        distanceM,
        stepUps,
        stepDowns,
        stepRefusals,
        vehicleContacts,
        blockedTicks,
        positionWrites: state.positionWrites,
        renderFrames,
        vehicleBodiesCreated: 0,
        droppedEvents,
      });
    },
    get events(): readonly WalkerEvent[] {
      return Object.freeze([...eventLog]);
    },
    registration: Object.freeze({
      get vehicleBodiesCreated() {
        return 0;
      },
      registerVehicleBody(_request: unknown): never {
        throw new CharacterContractError(
          'VEHICLE_BODY_WRITE_REFUSED',
          'walking never creates vehicle bodies; it reads the existing colliders of PBI 022',
        );
      },
      writeVehicleState(_request: unknown): never {
        throw new CharacterContractError(
          'VEHICLE_STATE_WRITE_REFUSED',
          'walking never writes vehicle state; the vehicle owner keeps that authority',
        );
      },
    }),
    step,
    authority,
    renderFrame(): CharacterRenderFrame {
      renderFrames += 1;
      const pose = sampleCharacterPose(skeleton, state.clipId, state.tick);
      // The pose only carries local joints; position and yaw are copied bit for bit.
      return applyCharacterPose(authority(), pose);
    },
    positionBits(): string {
      return characterPositionBits(state.positionM);
    },
  };
  return Object.freeze(walker);
}

/**
 * PBI 194 — pure third-person camera contract for the character and the vehicle.
 *
 * The camera is a deterministic fixed-tick controller: no Babylon, no DOM, no clock, no
 * `Math.random` and no simulation service. It receives the authoritative target (the entity
 * position and yaw produced by 192 for the character or by the vehicle owner for a car), the
 * obstacles that matter for visibility and an explicit orbit intent, and it returns the camera
 * position, the look target and the field of view for the tick.
 *
 * Two behaviours are structural rather than cosmetic:
 *
 * 1. The camera follows exactly the `entityId` handed in by the PBI 193 authority. A change of
 *    authority starts a fixed, interpolated transition from the last safe camera position; the
 *    frame already reports the new entity, so no consumer can keep the last entity by accident.
 *    An unknown entity is refused, and a switch towards the current entity is an explicit
 *    `SAME_ENTITY` decision instead of a fake transition. The controller never clones, writes or
 *    freezes the tracked entity.
 * 2. The camera is always placed on the target side of the first obstacle: the anchor-to-camera
 *    segment is swept against inflated boxes and truncated before the entry point, with a real
 *    margin. A bounded depenetration pass, a world clamp and a last-known-safe fallback keep the
 *    camera inside the world even when both axes are blocked in a corner.
 *
 * The only settings consumed are the existing PBI 009 `ControlPreferences`: `cameraMotion` maps to
 * the follow/smoothing sensitivity and `fov` maps to the field of view. Orbit distance and axis
 * inversion stay explicit intent fields (they are input, not a second settings store), so a future
 * UI can bind them without this module owning preferences.
 */
import { parseControlPreferences, type ControlPreferences } from '../settings';
import { CHARACTER_SAMPLING_HZ } from './clips';
import type { CharacterPoint } from './skeleton';

export const CHARACTER_CAMERA_CONTRACT_VERSION = '194-character-camera-v1' as const;

/** Default third-person orbit, in radians and metres. It is data, not a hidden configuration. */
export const CHARACTER_CAMERA_DEFAULT_ORBIT = Object.freeze({
  /** Camera behind the entity: +Z is forward, so the offset points to −Z when the entity yaws 0. */
  yawRad: Math.PI,
  pitchRad: Math.PI / 16,
  distanceM: 4.5,
  invertYaw: false,
  invertPitch: false,
});

/**
 * Camera policy. `transitionTicks` is the fixed transition length required by the authority
 * switch; `cameraRadiusM` and `obstacleMarginM` are the real free gap kept from a solid.
 */
export const CHARACTER_CAMERA_POLICY = Object.freeze({
  contract: CHARACTER_CAMERA_CONTRACT_VERSION,
  tickHz: CHARACTER_SAMPLING_HZ,
  transitionTicks: 18,
  minDistanceM: 2,
  maxDistanceM: 8,
  minPitchRad: -Math.PI / 9,
  maxPitchRad: Math.PI * 0.36,
  cameraRadiusM: 0.2,
  obstacleMarginM: 0.05,
  /** Lowest camera centre above the local ground; the sidewalk is 0.14 m, so this clears it. */
  groundClearanceM: 0.4,
  depenetrationPasses: 8,
  depenetrationEpsilonM: 0.001,
  sweepEpsilon: 1e-6,
  /** `cameraMotion` 100 leaves 25 % of the gap per tick; 0 is a rigid, instant follow. */
  minimumFollowFactor: 0.25,
  /** A look direction shorter than this is degenerate and receives a synthetic forward point. */
  minimumLookDistanceM: 1e-6,
});

export const CHARACTER_CAMERA_ERROR_CODES = Object.freeze([
  'INVALID_CAMERA_INPUT',
  'INVALID_CAMERA_WORLD',
  'INVALID_CAMERA_OBSTACLE',
  'INVALID_CAMERA_TICK',
  'CAMERA_UNKNOWN_ENTITY',
  'CAMERA_SAME_ENTITY',
  'INVALID_CAMERA_STATE',
] as const);
export type CharacterCameraErrorCode = (typeof CHARACTER_CAMERA_ERROR_CODES)[number];

export class CharacterCameraError extends Error {
  readonly code: CharacterCameraErrorCode;

  constructor(code: CharacterCameraErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'CharacterCameraError';
    this.code = code;
  }
}

export interface CharacterCameraWorld {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** Ground plane the camera may never go below. Sidewalk height is supplied per tick. */
  readonly groundM: number;
}

export interface CharacterCameraObstacle {
  readonly id: string;
  /** Axis-aligned box, already in world metres. */
  readonly min: CharacterPoint;
  readonly max: CharacterPoint;
}

export type CharacterCameraTargetKind = 'CHARACTER' | 'VEHICLE';

export interface CharacterCameraTarget {
  readonly entityId: string;
  readonly kind: CharacterCameraTargetKind;
  /** Authoritative ground position: feet for the 192 walker, ground contact for a vehicle. */
  readonly positionM: CharacterPoint;
  readonly yawRad: number;
  /** Eye/anchor height above `positionM`; 191 eye height for a person, supplied for a vehicle. */
  readonly anchorHeightM: number;
}

export interface CharacterCameraOrbit {
  /** Orbit yaw relative to the entity yaw; π puts the camera behind. */
  readonly yawRad: number;
  /** Elevation above the anchor; clamped by the policy. */
  readonly pitchRad: number;
  readonly distanceM: number;
  /** Mirrors the orbit around the entity forward axis (axis inversion input). */
  readonly invertYaw: boolean;
  /** Mirrors the elevation (inverted vertical look) before the pitch clamp. */
  readonly invertPitch: boolean;
}

export interface CharacterCameraControl {
  readonly cameraMotion: number;
  readonly fovDegrees: number;
  readonly fovRadians: number;
  /** Fraction of the remaining gap closed per tick; 1 means rigid, 0.25 means soft. */
  readonly followFactor: number;
}

export interface CharacterCameraTransition {
  readonly fromEntityId: string | null;
  readonly toEntityId: string;
  readonly startTick: number;
  readonly remainingTicks: number;
  readonly fromPositionM: CharacterPoint;
}

export interface CharacterCameraFrame {
  readonly tick: number;
  /** Always the authority entity of this tick, never the last seen one. */
  readonly entityId: string;
  readonly targetKind: CharacterCameraTargetKind;
  readonly anchorM: CharacterPoint;
  readonly positionM: CharacterPoint;
  readonly lookAtM: CharacterPoint;
  readonly up: CharacterPoint;
  readonly fovRadians: number;
  readonly orbit: CharacterCameraOrbit;
  /** Achieved orbit angles, measured from the anchor to the final camera position. */
  readonly yawRad: number;
  readonly pitchRad: number;
  /** Achieved distance after obstacle truncation, world clamp and depenetration. */
  readonly distanceM: number;
  readonly requestedDistanceM: number;
  readonly obstructedBy: string | null;
  readonly transitioning: boolean;
  /** 0 on the last transition frame. */
  readonly transitionRemainingTicks: number;
}

export interface CharacterCameraState {
  readonly tick: number;
  readonly entityId: string | null;
  /** Entity that owned the camera before the current one; null before the first switch. */
  readonly previousEntityId: string | null;
  readonly positionM: CharacterPoint | null;
  readonly lookAtM: CharacterPoint | null;
  readonly orbit: CharacterCameraOrbit;
  readonly transition: CharacterCameraTransition | null;
  readonly transitions: number;
  /** Known target ids; used to refuse an unknown entity explicitly, also after restore. */
  readonly knownEntityIds: readonly string[];
}

export interface CharacterCameraSnapshot extends CharacterCameraState {
  readonly version: typeof CHARACTER_CAMERA_CONTRACT_VERSION;
  readonly control: Readonly<{ cameraMotion: number; fovDegrees: number }>;
}

export interface CharacterCameraStats {
  readonly tick: number;
  readonly frames: number;
  readonly entityId: string | null;
  readonly transitions: number;
  readonly unknownEntityRefusals: number;
  readonly obstacleHits: number;
  readonly worldClamps: number;
  readonly depenetrations: number;
  readonly fallbacks: number;
  /** Always zero: the camera reads an entity, it never copies or mutates it. */
  readonly entityClones: number;
  readonly targetWrites: number;
}

export interface CharacterCameraStepRequest {
  readonly tick: number;
  /** `characterId` or `vehicleId` of the PBI 193 authority for this tick. */
  readonly authorityEntityId: string;
  /** All known snapshots; the authority id must resolve to exactly one of them. */
  readonly targets: readonly CharacterCameraTarget[];
  /** Partial orbit; omitted fields keep the previous orbit. */
  readonly orbit?: Partial<CharacterCameraOrbit>;
  /** Obstacles relevant for visibility, excluding the followed entity's own body. */
  readonly obstacles?: readonly CharacterCameraObstacle[];
  /** Local ground under the target; defaults to the world ground. */
  readonly groundM?: number;
}

export interface CharacterCameraOptions {
  readonly world: CharacterCameraWorld;
  /** The real PBI 009 preferences; only cameraMotion and fov are read. */
  readonly control: ControlPreferences;
  readonly orbit?: Partial<CharacterCameraOrbit>;
  readonly cameraRadiusM?: number;
}

export type CharacterCameraSwitchReason = 'SAME_ENTITY' | 'UNKNOWN_ENTITY';

export interface CharacterCameraSwitchDecision {
  readonly accepted: boolean;
  readonly fromEntityId: string | null;
  readonly toEntityId: string;
  readonly reason: CharacterCameraSwitchReason | null;
}

export interface CharacterCamera {
  readonly contract: typeof CHARACTER_CAMERA_CONTRACT_VERSION;
  readonly policy: typeof CHARACTER_CAMERA_POLICY;
  readonly world: CharacterCameraWorld;
  readonly orbit: CharacterCameraOrbit;
  readonly control: CharacterCameraControl;
  readonly state: CharacterCameraState;
  readonly stats: CharacterCameraStats;
  step(request: CharacterCameraStepRequest): CharacterCameraFrame;
  /** Replaces the existing 009 preferences; a stale/invalid contract is refused by the parser. */
  setControlPreferences(control: ControlPreferences): CharacterCameraControl;
  snapshot(): CharacterCameraSnapshot;
  restore(state: unknown): void;
}

const TAU = Math.PI * 2;
const AXES = ['x', 'y', 'z'] as const;

const point = (x: number, y: number, z: number): CharacterPoint => Object.freeze({ x, y, z });

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const lerp = (from: CharacterPoint, to: CharacterPoint, t: number): CharacterPoint =>
  point(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, from.z + (to.z - from.z) * t);

const distance = (from: CharacterPoint, to: CharacterPoint): number =>
  Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);

const smoothstep = (t: number): number => t * t * (3 - 2 * t);

function normalizeAngle(rad: number): number {
  return ((((rad + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(
  value: unknown,
  label: string,
  code: CharacterCameraErrorCode = 'INVALID_CAMERA_INPUT',
): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new CharacterCameraError(code, `${label} must be finite`);
  return value;
}

function nonEmptyText(
  value: unknown,
  label: string,
  code: CharacterCameraErrorCode = 'INVALID_CAMERA_INPUT',
): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new CharacterCameraError(code, `${label} must be a non-empty string`);
  return value;
}

function requireTick(value: unknown, expected: number): number {
  if (!Number.isSafeInteger(value) || value !== expected)
    throw new CharacterCameraError(
      'INVALID_CAMERA_TICK',
      `tick must be the next fixed tick (${expected}), received ${String(value)}`,
    );
  return value;
}

function finitePoint(
  value: unknown,
  label: string,
  code: CharacterCameraErrorCode = 'INVALID_CAMERA_INPUT',
): CharacterPoint {
  if (!isRecord(value)) throw new CharacterCameraError(code, `${label} must be a point`);
  return point(
    finiteNumber(value.x, `${label}.x`, code),
    finiteNumber(value.y, `${label}.y`, code),
    finiteNumber(value.z, `${label}.z`, code),
  );
}

function readWorld(value: unknown): CharacterCameraWorld {
  if (!isRecord(value))
    throw new CharacterCameraError('INVALID_CAMERA_WORLD', 'world must be a plain object');
  const minX = finiteNumber(value.minX, 'world.minX', 'INVALID_CAMERA_WORLD');
  const maxX = finiteNumber(value.maxX, 'world.maxX', 'INVALID_CAMERA_WORLD');
  const minZ = finiteNumber(value.minZ, 'world.minZ', 'INVALID_CAMERA_WORLD');
  const maxZ = finiteNumber(value.maxZ, 'world.maxZ', 'INVALID_CAMERA_WORLD');
  const groundM = finiteNumber(value.groundM, 'world.groundM', 'INVALID_CAMERA_WORLD');
  if (maxX <= minX || maxZ <= minZ)
    throw new CharacterCameraError('INVALID_CAMERA_WORLD', 'world bounds must have positive area');
  return Object.freeze({ minX, maxX, minZ, maxZ, groundM });
}

function readObstacle(value: unknown): CharacterCameraObstacle {
  if (!isRecord(value))
    throw new CharacterCameraError('INVALID_CAMERA_OBSTACLE', 'obstacle must be a plain object');
  const id = nonEmptyText(value.id, 'obstacle.id', 'INVALID_CAMERA_OBSTACLE');
  const min = finitePoint(value.min, `obstacle ${id} min`, 'INVALID_CAMERA_OBSTACLE');
  const max = finitePoint(value.max, `obstacle ${id} max`, 'INVALID_CAMERA_OBSTACLE');
  if (!AXES.every((axis) => min[axis] <= max[axis]))
    throw new CharacterCameraError('INVALID_CAMERA_OBSTACLE', `obstacle ${id} has an inverted box`);
  return Object.freeze({
    id,
    min: point(min.x, min.y, min.z),
    max: point(max.x, max.y, max.z),
  });
}

function readObstacles(value: unknown): readonly CharacterCameraObstacle[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value))
    throw new CharacterCameraError('INVALID_CAMERA_OBSTACLE', 'obstacles must be an array');
  const seen = new Set<string>();
  const obstacles: CharacterCameraObstacle[] = [];
  for (const entry of value) {
    const obstacle = readObstacle(entry);
    if (seen.has(obstacle.id))
      throw new CharacterCameraError(
        'INVALID_CAMERA_OBSTACLE',
        `duplicate obstacle ${obstacle.id}`,
      );
    seen.add(obstacle.id);
    obstacles.push(obstacle);
  }
  // Stable order makes the first hit and every depenetration tie reproducible.
  return Object.freeze(obstacles.sort((left, right) => (left.id < right.id ? -1 : 1)));
}

function readTarget(value: unknown): CharacterCameraTarget {
  if (!isRecord(value))
    throw new CharacterCameraError('INVALID_CAMERA_INPUT', 'target must be a plain object');
  const entityId = nonEmptyText(value.entityId, 'target.entityId');
  if (value.kind !== 'CHARACTER' && value.kind !== 'VEHICLE')
    throw new CharacterCameraError(
      'INVALID_CAMERA_INPUT',
      `target ${entityId} must be CHARACTER or VEHICLE`,
    );
  finitePoint(value.positionM, `target ${entityId} positionM`);
  finiteNumber(value.yawRad, `target ${entityId} yawRad`);
  const anchorHeightM = finiteNumber(value.anchorHeightM, `target ${entityId} anchorHeightM`);
  if (anchorHeightM <= 0)
    throw new CharacterCameraError(
      'INVALID_CAMERA_INPUT',
      `target ${entityId} anchorHeightM must be positive`,
    );
  // The snapshot is validated in place and never copied, frozen or stored: the camera reads the
  // entity for this tick only, so no second entity is ever created.
  return value as unknown as CharacterCameraTarget;
}

function resolveTargets(value: unknown): readonly CharacterCameraTarget[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new CharacterCameraError('INVALID_CAMERA_INPUT', 'targets must be a non-empty array');
  const seen = new Set<string>();
  const targets: CharacterCameraTarget[] = [];
  for (const entry of value) {
    const target = readTarget(entry);
    if (seen.has(target.entityId))
      throw new CharacterCameraError('INVALID_CAMERA_INPUT', `duplicate target ${target.entityId}`);
    seen.add(target.entityId);
    targets.push(target);
  }
  return Object.freeze(targets);
}

/** The existing 009 control contract is the only settings source; nothing is duplicated. */
export function characterCameraControl(control: ControlPreferences): CharacterCameraControl {
  const parsed = parseControlPreferences(control);
  return Object.freeze({
    cameraMotion: parsed.cameraMotion,
    fovDegrees: parsed.fov,
    fovRadians: (parsed.fov * Math.PI) / 180,
    followFactor:
      1 - (1 - CHARACTER_CAMERA_POLICY.minimumFollowFactor) * (parsed.cameraMotion / 100),
  });
}

/** Clamp a partial orbit into the admitted ranges; a non-finite field is refused, not clamped. */
export function resolveCharacterCameraOrbit(
  input: Partial<CharacterCameraOrbit> = {},
  base: CharacterCameraOrbit = CHARACTER_CAMERA_DEFAULT_ORBIT,
): CharacterCameraOrbit {
  if (!isRecord(input))
    throw new CharacterCameraError('INVALID_CAMERA_INPUT', 'orbit must be a plain object');
  const yawRad = input.yawRad === undefined ? base.yawRad : finiteNumber(input.yawRad, 'orbit yaw');
  const pitchRad =
    input.pitchRad === undefined ? base.pitchRad : finiteNumber(input.pitchRad, 'orbit pitch');
  const distanceM =
    input.distanceM === undefined
      ? base.distanceM
      : finiteNumber(input.distanceM, 'orbit distance');
  const invertYaw = input.invertYaw === undefined ? base.invertYaw : input.invertYaw;
  const invertPitch = input.invertPitch === undefined ? base.invertPitch : input.invertPitch;
  if (typeof invertYaw !== 'boolean' || typeof invertPitch !== 'boolean')
    throw new CharacterCameraError('INVALID_CAMERA_INPUT', 'orbit inversion flags must be boolean');
  return Object.freeze({
    yawRad: normalizeAngle(yawRad),
    pitchRad: clamp(
      pitchRad,
      CHARACTER_CAMERA_POLICY.minPitchRad,
      CHARACTER_CAMERA_POLICY.maxPitchRad,
    ),
    distanceM: clamp(
      distanceM,
      CHARACTER_CAMERA_POLICY.minDistanceM,
      CHARACTER_CAMERA_POLICY.maxDistanceM,
    ),
    invertYaw,
    invertPitch,
  });
}

/**
 * Explicit authority-switch decision. A same-entity request is refused with `SAME_ENTITY` and an
 * entity outside the known set with `UNKNOWN_ENTITY`; neither starts a transition.
 */
export function decideCameraSwitch(
  currentEntityId: string | null,
  nextEntityId: string,
  knownEntityIds: readonly string[],
): CharacterCameraSwitchDecision {
  nonEmptyText(nextEntityId, 'nextEntityId');
  if (!knownEntityIds.includes(nextEntityId))
    return Object.freeze({
      accepted: false,
      fromEntityId: currentEntityId,
      toEntityId: nextEntityId,
      reason: 'UNKNOWN_ENTITY' as const,
    });
  if (currentEntityId === nextEntityId)
    return Object.freeze({
      accepted: false,
      fromEntityId: currentEntityId,
      toEntityId: nextEntityId,
      reason: 'SAME_ENTITY' as const,
    });
  return Object.freeze({
    accepted: true,
    fromEntityId: currentEntityId,
    toEntityId: nextEntityId,
    reason: null,
  });
}

interface SweepResult {
  readonly position: CharacterPoint;
  readonly obstructedBy: string | null;
}

function insideBox(
  position: CharacterPoint,
  box: CharacterCameraObstacle,
  inflate: number,
): boolean {
  return AXES.every(
    (axis) =>
      position[axis] > box.min[axis] - inflate + 1e-9 &&
      position[axis] < box.max[axis] + inflate - 1e-9,
  );
}

function insideAny(
  position: CharacterPoint,
  obstacles: readonly CharacterCameraObstacle[],
  inflate: number,
): boolean {
  return obstacles.some((box) => insideBox(position, box, inflate));
}

function entryFraction(
  from: CharacterPoint,
  to: CharacterPoint,
  box: CharacterCameraObstacle,
  inflate: number,
): number | null {
  let entry = 0;
  let exit = 1;
  for (const axis of AXES) {
    const minimum = box.min[axis] - inflate;
    const maximum = box.max[axis] + inflate;
    const delta = to[axis] - from[axis];
    if (Math.abs(delta) < 1e-12) {
      if (from[axis] < minimum || from[axis] > maximum) return null;
      continue;
    }
    const first = (minimum - from[axis]) / delta;
    const second = (maximum - from[axis]) / delta;
    entry = Math.max(entry, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (entry > exit) return null;
  }
  return entry;
}

/**
 * Truncates the anchor-to-camera segment at the first inflated obstacle. Obstacles that already
 * contain the anchor at the hard radius are skipped, exactly like PBI 017: a target standing
 * against a wall must not collapse the camera to zero from a margin shell.
 */
function sweepToCamera(
  from: CharacterPoint,
  to: CharacterPoint,
  obstacles: readonly CharacterCameraObstacle[],
  radiusM: number,
): SweepResult {
  const inflate = radiusM + CHARACTER_CAMERA_POLICY.obstacleMarginM;
  let fraction = 1;
  let obstructedBy: string | null = null;
  for (const box of obstacles) {
    if (insideBox(from, box, radiusM)) continue;
    const hit = entryFraction(from, to, box, inflate);
    if (hit === null) continue;
    if (hit < fraction) {
      fraction = hit;
      obstructedBy = box.id;
    }
  }
  if (obstructedBy === null) return Object.freeze({ position: to, obstructedBy: null });
  const safeFraction = Math.max(0, fraction - CHARACTER_CAMERA_POLICY.sweepEpsilon);
  return Object.freeze({ position: lerp(from, to, safeFraction), obstructedBy });
}

function clampToWorld(
  position: CharacterPoint,
  world: CharacterCameraWorld,
  radiusM: number,
  minimumY: number,
): Readonly<{ position: CharacterPoint; clamped: boolean }> {
  const x = clamp(position.x, world.minX + radiusM, world.maxX - radiusM);
  const z = clamp(position.z, world.minZ + radiusM, world.maxZ - radiusM);
  const y = Math.max(position.y, minimumY);
  return Object.freeze({
    position: point(x, y, z),
    clamped: x !== position.x || y !== position.y || z !== position.z,
  });
}

function isPlacementValid(
  position: CharacterPoint,
  obstacles: readonly CharacterCameraObstacle[],
  radiusM: number,
  world: CharacterCameraWorld,
  minimumY: number,
): boolean {
  return (
    position.x >= world.minX + radiusM - 1e-9 &&
    position.x <= world.maxX - radiusM + 1e-9 &&
    position.z >= world.minZ + radiusM - 1e-9 &&
    position.z <= world.maxZ - radiusM + 1e-9 &&
    position.y >= minimumY - 1e-9 &&
    !insideAny(position, obstacles, radiusM)
  );
}

/**
 * Bounded, deterministic depenetration. Each pass removes the first overlap by the shortest
 * translation that stays inside the world; if both axes are blocked, no candidate exists and the
 * caller receives `null` so it can keep the last valid point instead of oscillating.
 */
function depenetrate(
  position: CharacterPoint,
  obstacles: readonly CharacterCameraObstacle[],
  radiusM: number,
  world: CharacterCameraWorld,
  minimumY: number,
): Readonly<{ position: CharacterPoint; moves: number }> | null {
  let current = position;
  let moves = 0;
  for (let pass = 0; pass < CHARACTER_CAMERA_POLICY.depenetrationPasses; pass += 1) {
    const box = obstacles.find((entry) => insideBox(current, entry, radiusM));
    if (!box) return Object.freeze({ position: current, moves });
    let best: CharacterPoint | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const axis of AXES) {
      for (const side of [box.min[axis], box.max[axis]] as const) {
        const inward = side === box.min[axis] ? -1 : 1;
        const candidate = {
          ...current,
          [axis]: side + inward * (radiusM + CHARACTER_CAMERA_POLICY.depenetrationEpsilonM),
        } as CharacterPoint;
        const next = point(candidate.x, candidate.y, candidate.z);
        if (!isPlacementValid(next, obstacles, radiusM, world, minimumY)) continue;
        const move = distance(current, next);
        if (move < bestDistance) {
          bestDistance = move;
          best = next;
        }
      }
    }
    if (!best) return null;
    current = best;
    moves += 1;
  }
  return insideAny(current, obstacles, radiusM)
    ? null
    : Object.freeze({ position: current, moves });
}

interface ResolvedPosition {
  readonly position: CharacterPoint;
  readonly obstructedBy: string | null;
  readonly clamped: boolean;
  readonly depenetrations: number;
  readonly fallback: boolean;
}

function resolveCameraPosition(
  anchor: CharacterPoint,
  candidate: CharacterPoint,
  previous: CharacterPoint | null,
  obstacles: readonly CharacterCameraObstacle[],
  world: CharacterCameraWorld,
  radiusM: number,
  minimumY: number,
): ResolvedPosition {
  const visible = sweepToCamera(anchor, candidate, obstacles, radiusM);
  // A truncated point is already on the target side of the wall; sweeping it again from the old
  // camera would leave the camera stuck on the wrong side of a building after an authority switch.
  const movement =
    visible.obstructedBy === null && previous !== null
      ? sweepToCamera(previous, visible.position, obstacles, radiusM)
      : null;
  const swept = movement ?? visible;
  const clamped = clampToWorld(swept.position, world, radiusM, minimumY);
  const pushed = depenetrate(clamped.position, obstacles, radiusM, world, minimumY);
  if (pushed) {
    return Object.freeze({
      position: pushed.position,
      obstructedBy: swept.obstructedBy ?? movement?.obstructedBy ?? null,
      clamped: clamped.clamped,
      depenetrations: pushed.moves,
      fallback: false,
    });
  }
  // Corner with both axes blocked: keep the last valid point (stable, never oscillating), then
  // the anchor itself as a last resort. The target anchor is the one point a valid entity owns.
  if (previous && isPlacementValid(previous, obstacles, radiusM, world, minimumY)) {
    return Object.freeze({
      position: previous,
      obstructedBy: swept.obstructedBy ?? movement?.obstructedBy ?? null,
      clamped: clamped.clamped,
      depenetrations: 0,
      fallback: true,
    });
  }
  const anchorClamped = clampToWorld(anchor, world, radiusM, minimumY);
  const anchorPushed = depenetrate(anchorClamped.position, obstacles, radiusM, world, minimumY);
  return Object.freeze({
    position: anchorPushed?.position ?? anchorClamped.position,
    obstructedBy: swept.obstructedBy ?? movement?.obstructedBy ?? null,
    clamped: true,
    depenetrations: anchorPushed?.moves ?? 0,
    fallback: true,
  });
}

function anchorOf(target: CharacterCameraTarget): CharacterPoint {
  return point(target.positionM.x, target.positionM.y + target.anchorHeightM, target.positionM.z);
}

function desiredCamera(
  anchor: CharacterPoint,
  target: CharacterCameraTarget,
  orbit: CharacterCameraOrbit,
): CharacterPoint {
  const invertedPitch = orbit.invertPitch ? -orbit.pitchRad : orbit.pitchRad;
  const pitch = clamp(
    invertedPitch,
    CHARACTER_CAMERA_POLICY.minPitchRad,
    CHARACTER_CAMERA_POLICY.maxPitchRad,
  );
  const yaw = target.yawRad + (orbit.invertYaw ? -orbit.yawRad : orbit.yawRad);
  const horizontal = orbit.distanceM * Math.cos(pitch);
  return point(
    anchor.x + Math.sin(yaw) * horizontal,
    anchor.y + Math.sin(pitch) * orbit.distanceM,
    anchor.z + Math.cos(yaw) * horizontal,
  );
}

function orbitFromPosition(
  anchor: CharacterPoint,
  position: CharacterPoint,
  fallback: CharacterCameraOrbit,
): Readonly<{ yawRad: number; pitchRad: number }> {
  const delta = {
    x: position.x - anchor.x,
    y: position.y - anchor.y,
    z: position.z - anchor.z,
  };
  const length = Math.hypot(delta.x, delta.y, delta.z);
  if (length < CHARACTER_CAMERA_POLICY.minimumLookDistanceM)
    return Object.freeze({ yawRad: fallback.yawRad, pitchRad: fallback.pitchRad });
  return Object.freeze({
    yawRad: Math.atan2(delta.x, delta.z),
    pitchRad: Math.asin(clamp(delta.y / length, -1, 1)),
  });
}

function readTransition(value: unknown): CharacterCameraTransition {
  if (!isRecord(value))
    throw new CharacterCameraError('INVALID_CAMERA_STATE', 'transition must be a plain object');
  const fromEntityId =
    value.fromEntityId === null
      ? null
      : nonEmptyText(value.fromEntityId, 'transition.fromEntityId', 'INVALID_CAMERA_STATE');
  const toEntityId = nonEmptyText(
    value.toEntityId,
    'transition.toEntityId',
    'INVALID_CAMERA_STATE',
  );
  const startTick = finiteNumber(value.startTick, 'transition.startTick', 'INVALID_CAMERA_STATE');
  if (!Number.isSafeInteger(startTick) || startTick < 0)
    throw new CharacterCameraError('INVALID_CAMERA_STATE', 'transition.startTick is invalid');
  const remainingTicks = finiteNumber(
    value.remainingTicks,
    'transition.remainingTicks',
    'INVALID_CAMERA_STATE',
  );
  if (
    !Number.isSafeInteger(remainingTicks) ||
    remainingTicks < 0 ||
    remainingTicks >= CHARACTER_CAMERA_POLICY.transitionTicks
  )
    throw new CharacterCameraError('INVALID_CAMERA_STATE', 'transition.remainingTicks is invalid');
  const fromPositionM = finitePoint(
    value.fromPositionM,
    'transition.fromPositionM',
    'INVALID_CAMERA_STATE',
  );
  return Object.freeze({ fromEntityId, toEntityId, startTick, remainingTicks, fromPositionM });
}

function readOrbit(value: unknown): CharacterCameraOrbit {
  if (!isRecord(value))
    throw new CharacterCameraError('INVALID_CAMERA_STATE', 'state.orbit must be a plain object');
  return resolveCharacterCameraOrbit(value as Partial<CharacterCameraOrbit>);
}

function readKnownEntityIds(value: unknown): readonly string[] {
  if (!Array.isArray(value))
    throw new CharacterCameraError('INVALID_CAMERA_STATE', 'knownEntityIds must be an array');
  const set = new Set<string>();
  for (const entry of value) {
    const id = nonEmptyText(entry, 'knownEntityIds entry', 'INVALID_CAMERA_STATE');
    if (set.has(id))
      throw new CharacterCameraError('INVALID_CAMERA_STATE', `duplicate known entity ${id}`);
    set.add(id);
  }
  return Object.freeze([...set].sort());
}

function readSnapshot(value: unknown): CharacterCameraSnapshot {
  if (!isRecord(value))
    throw new CharacterCameraError('INVALID_CAMERA_STATE', 'camera state must be a plain object');
  const keys = [
    'version',
    'tick',
    'entityId',
    'previousEntityId',
    'positionM',
    'lookAtM',
    'orbit',
    'transition',
    'transitions',
    'knownEntityIds',
    'control',
  ] as const;
  if (!keys.every((key) => Object.hasOwn(value, key)) || Object.keys(value).length !== keys.length)
    throw new CharacterCameraError(
      'INVALID_CAMERA_STATE',
      `camera state carries exactly ${keys.join(', ')}`,
    );
  if (value.version !== CHARACTER_CAMERA_CONTRACT_VERSION)
    throw new CharacterCameraError('INVALID_CAMERA_STATE', 'unsupported camera state version');
  const tick = finiteNumber(value.tick, 'state.tick', 'INVALID_CAMERA_STATE');
  if (!Number.isSafeInteger(tick) || tick < 0)
    throw new CharacterCameraError('INVALID_CAMERA_STATE', 'state.tick must be a safe integer');
  const knownEntityIds = readKnownEntityIds(value.knownEntityIds);
  const entityId =
    value.entityId === null
      ? null
      : nonEmptyText(value.entityId, 'state.entityId', 'INVALID_CAMERA_STATE');
  const previousEntityId =
    value.previousEntityId === null
      ? null
      : nonEmptyText(value.previousEntityId, 'state.previousEntityId', 'INVALID_CAMERA_STATE');
  if (entityId !== null && !knownEntityIds.includes(entityId))
    throw new CharacterCameraError('INVALID_CAMERA_STATE', 'state.entityId must be a known entity');
  const positionM =
    value.positionM === null
      ? null
      : finitePoint(value.positionM, 'state.positionM', 'INVALID_CAMERA_STATE');
  const lookAtM =
    value.lookAtM === null
      ? null
      : finitePoint(value.lookAtM, 'state.lookAtM', 'INVALID_CAMERA_STATE');
  if ((positionM === null) !== (lookAtM === null))
    throw new CharacterCameraError(
      'INVALID_CAMERA_STATE',
      'state.positionM and state.lookAtM must both be null or both be present',
    );
  const orbit = readOrbit(value.orbit);
  const transition = value.transition === null ? null : readTransition(value.transition);
  if (transition && transition.toEntityId !== entityId)
    throw new CharacterCameraError(
      'INVALID_CAMERA_STATE',
      'an active transition must point at the current entity',
    );
  if (transition) {
    if (transition.startTick > tick)
      throw new CharacterCameraError(
        'INVALID_CAMERA_STATE',
        'transition.startTick cannot be in the future',
      );
    const expectedRemaining =
      CHARACTER_CAMERA_POLICY.transitionTicks - (tick - transition.startTick + 1);
    if (expectedRemaining <= 0 || transition.remainingTicks !== expectedRemaining)
      throw new CharacterCameraError(
        'INVALID_CAMERA_STATE',
        'transition.remainingTicks does not match its start tick',
      );
  }
  const transitions = finiteNumber(value.transitions, 'state.transitions', 'INVALID_CAMERA_STATE');
  if (!Number.isSafeInteger(transitions) || transitions < 0)
    throw new CharacterCameraError('INVALID_CAMERA_STATE', 'state.transitions is invalid');
  const control = value.control;
  if (!isRecord(control))
    throw new CharacterCameraError('INVALID_CAMERA_STATE', 'state.control must be a plain object');
  const cameraMotion = finiteNumber(
    control.cameraMotion,
    'state.control.cameraMotion',
    'INVALID_CAMERA_STATE',
  );
  const fovDegrees = finiteNumber(
    control.fovDegrees,
    'state.control.fovDegrees',
    'INVALID_CAMERA_STATE',
  );
  if (cameraMotion < 0 || cameraMotion > 100 || fovDegrees < 60 || fovDegrees > 100)
    throw new CharacterCameraError('INVALID_CAMERA_STATE', 'state.control is out of range');
  return Object.freeze({
    version: CHARACTER_CAMERA_CONTRACT_VERSION,
    tick,
    entityId,
    previousEntityId,
    positionM,
    lookAtM,
    orbit,
    transition,
    transitions,
    knownEntityIds,
    control: Object.freeze({ cameraMotion, fovDegrees }),
  });
}

function frameOf(
  tick: number,
  target: CharacterCameraTarget,
  anchor: CharacterPoint,
  position: CharacterPoint,
  requested: CharacterCameraOrbit,
  obstructedBy: string | null,
  control: CharacterCameraControl,
  transition: CharacterCameraTransition | null,
  remainingTicks: number,
): CharacterCameraFrame {
  const delta = { x: position.x - anchor.x, y: position.y - anchor.y, z: position.z - anchor.z };
  const actualDistance = Math.hypot(delta.x, delta.y, delta.z);
  const angles = orbitFromPosition(anchor, position, requested);
  const lookAt =
    actualDistance > CHARACTER_CAMERA_POLICY.minimumLookDistanceM
      ? anchor
      : point(position.x, position.y, position.z + 0.01);
  return Object.freeze({
    tick,
    entityId: target.entityId,
    targetKind: target.kind,
    anchorM: anchor,
    positionM: position,
    lookAtM: lookAt,
    up: point(0, 1, 0),
    fovRadians: control.fovRadians,
    orbit: requested,
    yawRad: angles.yawRad,
    pitchRad: angles.pitchRad,
    distanceM: actualDistance,
    requestedDistanceM: requested.distanceM,
    obstructedBy,
    transitioning: transition !== null,
    transitionRemainingTicks: remainingTicks,
  });
}

/**
 * Creates the single third-person camera. The state is plain data, frozen on every transition and
 * fully serialisable through `snapshot()`/`restore()`.
 */
export function createCharacterCamera(options: CharacterCameraOptions): CharacterCamera {
  if (!isRecord(options))
    throw new CharacterCameraError('INVALID_CAMERA_INPUT', 'camera options are required');
  const world = readWorld(options.world);
  const radiusM = finiteNumber(
    options.cameraRadiusM ?? CHARACTER_CAMERA_POLICY.cameraRadiusM,
    'cameraRadiusM',
  );
  if (radiusM <= 0)
    throw new CharacterCameraError('INVALID_CAMERA_INPUT', 'cameraRadiusM must be positive');
  if (world.maxX - world.minX <= 2 * radiusM || world.maxZ - world.minZ <= 2 * radiusM)
    throw new CharacterCameraError(
      'INVALID_CAMERA_WORLD',
      'world must be wider than the camera diameter',
    );
  let control = characterCameraControl(options.control);
  let orbit = resolveCharacterCameraOrbit(options.orbit ?? {});
  let state: CharacterCameraState = Object.freeze({
    tick: 0,
    entityId: null,
    previousEntityId: null,
    positionM: null,
    lookAtM: null,
    orbit,
    transition: null,
    transitions: 0,
    knownEntityIds: Object.freeze([]),
  });
  let frames = 0;
  let transitions = 0;
  let unknownEntityRefusals = 0;
  let obstacleHits = 0;
  let worldClamps = 0;
  let depenetrations = 0;
  let fallbacks = 0;

  const known = new Set<string>(state.knownEntityIds);

  const camera: CharacterCamera = {
    contract: CHARACTER_CAMERA_CONTRACT_VERSION,
    policy: CHARACTER_CAMERA_POLICY,
    world,
    get orbit() {
      return orbit;
    },
    get control() {
      return control;
    },
    get state() {
      return state;
    },
    get stats(): CharacterCameraStats {
      return Object.freeze({
        tick: state.tick,
        frames,
        entityId: state.entityId,
        transitions,
        unknownEntityRefusals,
        obstacleHits,
        worldClamps,
        depenetrations,
        fallbacks,
        entityClones: 0,
        targetWrites: 0,
      });
    },
    step(request) {
      if (!isRecord(request))
        throw new CharacterCameraError('INVALID_CAMERA_INPUT', 'step request is required');
      const tick = requireTick(request.tick, state.tick + 1);
      const authorityEntityId = nonEmptyText(request.authorityEntityId, 'authorityEntityId');
      const targets = resolveTargets(request.targets);
      for (const target of targets) known.add(target.entityId);
      const target = targets.find((entry) => entry.entityId === authorityEntityId);
      if (!target) {
        unknownEntityRefusals += 1;
        throw new CharacterCameraError(
          'CAMERA_UNKNOWN_ENTITY',
          `authority entity ${authorityEntityId} has no target snapshot`,
        );
      }
      const obstacles = readObstacles(request.obstacles);
      const groundM = Math.max(
        world.groundM,
        request.groundM === undefined ? world.groundM : finiteNumber(request.groundM, 'groundM'),
      );
      const minimumY = groundM + CHARACTER_CAMERA_POLICY.groundClearanceM;
      orbit = resolveCharacterCameraOrbit(request.orbit ?? {}, orbit);

      const decision = decideCameraSwitch(state.entityId, authorityEntityId, [...known]);
      let transition = state.transition;
      let previousEntityId = state.previousEntityId;
      if (decision.accepted) {
        previousEntityId = state.entityId;
        if (state.entityId !== null) transitions += 1;
        transition =
          state.positionM === null
            ? null
            : Object.freeze({
                fromEntityId: state.entityId,
                toEntityId: authorityEntityId,
                startTick: tick,
                remainingTicks: CHARACTER_CAMERA_POLICY.transitionTicks,
                fromPositionM: state.positionM,
              });
      }

      let transitionRemainingTicks = 0;
      if (transition) {
        const elapsed = tick - transition.startTick + 1;
        if (elapsed > CHARACTER_CAMERA_POLICY.transitionTicks) transition = null;
        else transitionRemainingTicks = CHARACTER_CAMERA_POLICY.transitionTicks - elapsed;
      }
      const atTransitionEnd = transition !== null && transitionRemainingTicks === 0;

      const anchor = anchorOf(target);
      const desired = desiredCamera(anchor, target, orbit);
      let candidate = desired;
      if (transition) {
        const elapsed = clamp(
          1 - transitionRemainingTicks / CHARACTER_CAMERA_POLICY.transitionTicks,
          0,
          1,
        );
        candidate = lerp(transition.fromPositionM, desired, smoothstep(elapsed));
      } else if (state.positionM) {
        candidate = lerp(state.positionM, desired, control.followFactor);
      }
      const resolved = resolveCameraPosition(
        anchor,
        candidate,
        state.positionM,
        obstacles,
        world,
        radiusM,
        minimumY,
      );
      if (resolved.obstructedBy) obstacleHits += 1;
      if (resolved.clamped) worldClamps += 1;
      depenetrations += resolved.depenetrations;
      if (resolved.fallback) fallbacks += 1;

      const frame = frameOf(
        tick,
        target,
        anchor,
        resolved.position,
        orbit,
        resolved.obstructedBy,
        control,
        transition,
        transitionRemainingTicks,
      );
      const storedTransition =
        transition !== null && !atTransitionEnd
          ? Object.freeze({ ...transition, remainingTicks: transitionRemainingTicks })
          : null;
      frames += 1;
      state = Object.freeze({
        tick,
        entityId: authorityEntityId,
        previousEntityId,
        positionM: resolved.position,
        lookAtM: frame.lookAtM,
        orbit,
        transition: storedTransition,
        transitions,
        knownEntityIds: Object.freeze([...known].sort()),
      });
      return frame;
    },
    setControlPreferences(nextControl) {
      control = characterCameraControl(nextControl);
      return control;
    },
    snapshot() {
      return Object.freeze({
        version: CHARACTER_CAMERA_CONTRACT_VERSION,
        tick: state.tick,
        entityId: state.entityId,
        previousEntityId: state.previousEntityId,
        positionM: state.positionM,
        lookAtM: state.lookAtM,
        orbit: state.orbit,
        transition: state.transition,
        transitions: state.transitions,
        knownEntityIds: state.knownEntityIds,
        control: Object.freeze({
          cameraMotion: control.cameraMotion,
          fovDegrees: control.fovDegrees,
        }),
      });
    },
    restore(saved) {
      const parsed = readSnapshot(saved);
      control = characterCameraControl({
        schemaVersion: 1,
        version: 0,
        mappingVersion: '025-keyboard-v1',
        steeringSensitivity: 50,
        returnRate: 50,
        speedAttenuation: 50,
        throttleRamp: 50,
        brakeRamp: 50,
        cameraMotion: parsed.control.cameraMotion,
        fov: parsed.control.fovDegrees,
      });
      orbit = parsed.orbit;
      known.clear();
      for (const id of parsed.knownEntityIds) known.add(id);
      state = Object.freeze({
        tick: parsed.tick,
        entityId: parsed.entityId,
        previousEntityId: parsed.previousEntityId,
        positionM: parsed.positionM,
        lookAtM: parsed.lookAtM,
        orbit: parsed.orbit,
        transition: parsed.transition,
        transitions: parsed.transitions,
        knownEntityIds: parsed.knownEntityIds,
      });
      frames = 0;
      transitions = parsed.transitions;
      unknownEntityRefusals = 0;
      obstacleHits = 0;
      worldClamps = 0;
      depenetrations = 0;
      fallbacks = 0;
    },
  };
  return Object.freeze(camera);
}

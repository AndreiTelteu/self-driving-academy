/**
 * PBI 194 — deterministic evidence suite for the third-person character camera.
 *
 * The suite follows the real city layout (PBI 042) and the real character/vehicle measurements
 * (PBI 191/022/145), measures obstacle clearance independently of the controller, and proves both
 * halves of acceptance criterion 1 plus criterion 2:
 *
 * (a) the authority entity is followed exactly, an authority switch is a fixed 18-tick
 *     interpolation that immediately reports the new `entityId`, and unknown/same switches are
 *     refused without cloning the entity;
 * (b) the anchor-to-camera ray stops at the first inflated obstacle, including the both-axes
 *     corner, without leaving the world or oscillating.
 *
 * Criterion 2 reuses the existing PBI 009 `ControlPreferences`: `cameraMotion` changes the follow,
 * `fov` changes the field of view, and the explicit orbit carries distance and axis inversion.
 */
import { createHash } from 'node:crypto';
import {
  CHARACTER_CAMERA_CONTRACT_VERSION,
  CHARACTER_CAMERA_POLICY,
  createCharacterAsset,
  createCharacterCamera,
  createOrientedRectanglePolygon,
  decideCameraSwitch,
  type CharacterCamera,
  type CharacterCameraFrame,
  type CharacterCameraObstacle,
  type CharacterCameraOrbit,
  type CharacterCameraTarget,
  type CharacterCameraWorld,
} from '../../src/character';
import {
  createDefaultSettings,
  parseControlPreferences,
  type ControlPreferences,
} from '../../src/settings';
import { vehicleGeometrySpec, vehicleVisualClass } from '../../src/rendering';
import { realBuildingSpot, realWalkWorld, sedanWalkFootprint } from './walk-world';

export const CAMERA_REPORT_CONTRACT = CHARACTER_CAMERA_CONTRACT_VERSION;
export const CAMERA_REPORT_COMMAND = 'npm run character:camera';

const DEFAULT_CONTROL = createDefaultSettings('camera-194').input.control;

export function cameraControl(
  overrides: Partial<Pick<ControlPreferences, 'cameraMotion' | 'fov'>> = {},
): ControlPreferences {
  return parseControlPreferences({ ...DEFAULT_CONTROL, ...overrides });
}

export function characterAnchorHeightM(): number {
  return createCharacterAsset().measured.eyeHeightM;
}

export function characterTarget(
  entityId: string,
  positionM: Readonly<{ x: number; y: number; z: number }>,
  yawRad: number,
): CharacterCameraTarget {
  return Object.freeze({
    entityId,
    kind: 'CHARACTER' as const,
    positionM: Object.freeze({ x: positionM.x, y: positionM.y, z: positionM.z }),
    yawRad,
    anchorHeightM: characterAnchorHeightM(),
  });
}

export function vehicleTarget(
  entityId: string,
  positionM: Readonly<{ x: number; y: number; z: number }>,
  yawRad: number,
): CharacterCameraTarget {
  return Object.freeze({
    entityId,
    kind: 'VEHICLE' as const,
    positionM: Object.freeze({ x: positionM.x, y: positionM.y, z: positionM.z }),
    yawRad,
    anchorHeightM: 1.2,
  });
}

export function cityCameraWorld(): CharacterCameraWorld {
  const { layout } = realWalkWorld();
  return Object.freeze({
    minX: layout.boundsM.minM.x,
    maxX: layout.boundsM.maxM.x,
    minZ: layout.boundsM.minM.z,
    maxZ: layout.boundsM.maxM.z,
    groundM: 0,
  });
}

export function cityCameraObstacles(): readonly CharacterCameraObstacle[] {
  const { world } = realWalkWorld();
  return Object.freeze(
    world.blockers.map((blocker) =>
      Object.freeze({
        id: blocker.id,
        min: Object.freeze({
          x: blocker.polygon.bounds.minX,
          y: blocker.bottomM,
          z: blocker.polygon.bounds.minZ,
        }),
        max: Object.freeze({
          x: blocker.polygon.bounds.maxX,
          y: blocker.topM,
          z: blocker.polygon.bounds.maxZ,
        }),
      }),
    ),
  );
}

export function vehicleCameraObstacle(
  id: string,
  positionM: Readonly<{ x: number; y: number; z: number }>,
  yawRad: number,
): CharacterCameraObstacle {
  const footprint = sedanWalkFootprint();
  const polygon = createOrientedRectanglePolygon(
    `camera:${id}`,
    { x: positionM.x, z: positionM.z },
    footprint.halfExtentsM,
    yawRad,
  );
  const xs = polygon.vertices.map((vertex) => vertex.x);
  const zs = polygon.vertices.map((vertex) => vertex.z);
  // Visibility uses the real visual body, not the low physics collider: a sedan hides the camera
  // up to its roof (PBI 145 geometry), even though its walk collider is only 0.6 m tall.
  const visual = vehicleVisualClass('sedan');
  const geometry = vehicleGeometrySpec('sedan');
  const originAboveGroundM = -visual.wheelBottomM;
  const roofTopM = Math.max(...geometry.parts.map((part) => part.center[1] + part.size[1] / 2));
  return Object.freeze({
    id,
    min: Object.freeze({
      x: Math.min(...xs),
      y: Math.max(0, originAboveGroundM),
      z: Math.min(...zs),
    }),
    max: Object.freeze({
      x: Math.max(...xs),
      y: originAboveGroundM + roofTopM,
      z: Math.max(...zs),
    }),
  });
}

export function pointBoxDistanceM(
  positionM: Readonly<{ x: number; y: number; z: number }>,
  box: CharacterCameraObstacle,
): number {
  const dx = Math.max(box.min.x - positionM.x, 0, positionM.x - box.max.x);
  const dy = Math.max(box.min.y - positionM.y, 0, positionM.y - box.max.y);
  const dz = Math.max(box.min.z - positionM.z, 0, positionM.z - box.max.z);
  return Math.hypot(dx, dy, dz);
}

/** Free gap between the camera sphere and the nearest obstacle; negative is a penetration. */
export function cameraClearanceM(
  positionM: Readonly<{ x: number; y: number; z: number }>,
  obstacles: readonly CharacterCameraObstacle[],
  radiusM = CHARACTER_CAMERA_POLICY.cameraRadiusM,
): number {
  return obstacles.reduce(
    (best, box) => Math.min(best, pointBoxDistanceM(positionM, box) - radiusM),
    Number.POSITIVE_INFINITY,
  );
}

export function insideSuggestedBox(
  positionM: Readonly<{ x: number; y: number; z: number }>,
  box: CharacterCameraObstacle,
  inflate: number,
): boolean {
  return (
    positionM.x > box.min.x - inflate + 1e-9 &&
    positionM.x < box.max.x + inflate - 1e-9 &&
    positionM.y > box.min.y - inflate + 1e-9 &&
    positionM.y < box.max.y + inflate - 1e-9 &&
    positionM.z > box.min.z - inflate + 1e-9 &&
    positionM.z < box.max.z + inflate - 1e-9
  );
}

function insideWorld(
  positionM: Readonly<{ x: number; y: number; z: number }>,
  world: CharacterCameraWorld,
  radiusM = CHARACTER_CAMERA_POLICY.cameraRadiusM,
): boolean {
  return (
    positionM.x >= world.minX + radiusM - 1e-9 &&
    positionM.x <= world.maxX - radiusM + 1e-9 &&
    positionM.z >= world.minZ + radiusM - 1e-9 &&
    positionM.z <= world.maxZ - radiusM + 1e-9 &&
    positionM.y >= world.groundM + CHARACTER_CAMERA_POLICY.groundClearanceM - 1e-9
  );
}

function distanceM(
  first: Readonly<{ x: number; y: number; z: number }>,
  second: Readonly<{ x: number; y: number; z: number }>,
): number {
  return Math.hypot(second.x - first.x, second.y - first.y, second.z - first.z);
}

type ScenarioExpectation = 'OPEN' | 'TRUNCATED' | 'CORNER';

export interface CameraScenarioReport {
  readonly id: string;
  readonly label: string;
  readonly entityId: string;
  readonly targetKind: string;
  readonly obstacleId: string | null;
  readonly ticks: number;
  readonly requestedDistanceM: number;
  readonly finalDistanceM: number;
  readonly minClearanceM: number | null;
  readonly obstructedTicks: number;
  readonly finalPositionM: Readonly<{ x: number; y: number; z: number }>;
  readonly stableTailM: number;
  readonly insideWorld: boolean;
  readonly bothAxesBlocked: boolean | null;
  readonly expected: boolean;
  readonly verdict: 'PASS' | 'FAIL';
}

interface ScenarioSpec {
  readonly id: string;
  readonly label: string;
  readonly expectation: ScenarioExpectation;
  readonly world: CharacterCameraWorld;
  readonly target: CharacterCameraTarget;
  readonly obstacles: readonly CharacterCameraObstacle[];
  readonly orbit: Partial<CharacterCameraOrbit>;
  readonly groundM: number;
  readonly ticks: number;
}

function scenario(spec: ScenarioSpec): CameraScenarioReport {
  const camera = createCharacterCamera({
    world: spec.world,
    control: cameraControl(),
    orbit: spec.orbit,
  });
  const frames: CharacterCameraFrame[] = [];
  const clearances: number[] = [];
  for (let index = 0; index < spec.ticks; index += 1) {
    const frame = camera.step({
      tick: camera.state.tick + 1,
      authorityEntityId: spec.target.entityId,
      targets: [spec.target],
      orbit: spec.orbit,
      obstacles: spec.obstacles,
      groundM: spec.groundM,
    });
    frames.push(frame);
    clearances.push(cameraClearanceM(frame.positionM, spec.obstacles));
  }
  const final = frames[frames.length - 1]!;
  const tail = frames.slice(Math.max(0, frames.length - 20));
  const stableTailM = tail
    .slice(1)
    .reduce(
      (worst, frame, index) => Math.max(worst, distanceM(tail[index]!.positionM, frame.positionM)),
      0,
    );
  const obstructedTicks = frames.filter((frame) => frame.obstructedBy !== null).length;
  const minClearanceM = clearances.length
    ? clearances.reduce((best, value) => Math.min(best, value), Number.POSITIVE_INFINITY)
    : null;
  const everyEntityMatches = frames.every((frame) => frame.entityId === spec.target.entityId);
  const everyPositionValid = frames.every(
    (frame) =>
      (cameraClearanceM(frame.positionM, spec.obstacles) ?? 0) >= -1e-9 &&
      insideWorld(frame.positionM, spec.world),
  );
  let bothAxesBlocked: boolean | null = null;
  if (spec.expectation === 'CORNER') {
    const xProbe = { ...final.positionM, x: final.positionM.x + 0.01 };
    const zProbe = { ...final.positionM, z: final.positionM.z + 0.01 };
    const inflate = CHARACTER_CAMERA_POLICY.cameraRadiusM + CHARACTER_CAMERA_POLICY.obstacleMarginM;
    bothAxesBlocked =
      spec.obstacles.some((box) => insideSuggestedBox(xProbe, box, inflate)) &&
      spec.obstacles.some((box) => insideSuggestedBox(zProbe, box, inflate));
  }
  const expected = (() => {
    switch (spec.expectation) {
      case 'OPEN':
        return obstructedTicks === 0 && Math.abs(final.distanceM - spec.orbit.distanceM!) <= 1e-6;
      case 'TRUNCATED':
        return (
          obstructedTicks > 0 &&
          final.distanceM < spec.orbit.distanceM! - 0.1 &&
          (minClearanceM ?? -1) >= CHARACTER_CAMERA_POLICY.obstacleMarginM - 1e-6
        );
      case 'CORNER':
        return (
          obstructedTicks > 0 &&
          final.distanceM < spec.orbit.distanceM! - 0.1 &&
          (minClearanceM ?? -1) >= CHARACTER_CAMERA_POLICY.obstacleMarginM - 1e-6 &&
          stableTailM <= 1e-9 &&
          insideWorld(final.positionM, spec.world) &&
          bothAxesBlocked === true
        );
      default:
        return false;
    }
  })();
  const verdict: 'PASS' | 'FAIL' =
    everyEntityMatches && everyPositionValid && expected ? 'PASS' : 'FAIL';
  return Object.freeze({
    id: spec.id,
    label: spec.label,
    entityId: spec.target.entityId,
    targetKind: spec.target.kind,
    obstacleId: final.obstructedBy,
    ticks: spec.ticks,
    requestedDistanceM: spec.orbit.distanceM!,
    finalDistanceM: final.distanceM,
    minClearanceM,
    obstructedTicks,
    finalPositionM: Object.freeze({
      x: final.positionM.x,
      y: final.positionM.y,
      z: final.positionM.z,
    }),
    stableTailM,
    insideWorld: frames.every((frame) => insideWorld(frame.positionM, spec.world)),
    bothAxesBlocked,
    expected,
    verdict,
  });
}

export function cornerWorld(): CharacterCameraWorld {
  return Object.freeze({ minX: -10, maxX: 10, minZ: -10, maxZ: 10, groundM: 0 });
}

export function cornerObstacles(): readonly CharacterCameraObstacle[] {
  return Object.freeze([
    Object.freeze({
      id: 'corner:x-wall',
      min: Object.freeze({ x: 1, y: 0, z: -10 }),
      max: Object.freeze({ x: 10, y: 3, z: 2 }),
    }),
    Object.freeze({
      id: 'corner:z-wall',
      min: Object.freeze({ x: -10, y: 0, z: 1 }),
      max: Object.freeze({ x: 2, y: 3, z: 10 }),
    }),
  ]);
}

function buildScenarios(): readonly ScenarioSpec[] {
  const world = cityCameraWorld();
  const obstacles = cityCameraObstacles();
  const building = realBuildingSpot();
  const sedan = vehicleCameraObstacle('sedan-194', { x: 90, y: 0, z: -5 }, 0);
  return Object.freeze([
    {
      id: 'character-open',
      label: 'Urmărire personaj pe teren liber',
      expectation: 'OPEN' as const,
      world,
      target: characterTarget('character-194', { x: 90, y: 0, z: -1 }, 0),
      obstacles: Object.freeze([]),
      orbit: Object.freeze({ yawRad: Math.PI, pitchRad: Math.PI / 16, distanceM: 4.5 }),
      groundM: 0,
      ticks: 60,
    },
    {
      id: 'vehicle-open',
      label: 'Urmărire vehicul pe teren liber',
      expectation: 'OPEN' as const,
      world,
      target: vehicleTarget('sedan-194', { x: 90, y: 0, z: 1.8 }, Math.PI / 2),
      obstacles: Object.freeze([]),
      orbit: Object.freeze({ yawRad: Math.PI, pitchRad: Math.PI / 16, distanceM: 4.5 }),
      groundM: 0,
      ticks: 60,
    },
    {
      id: 'building-wall',
      label: 'Raza camerei trunchiată de clădirea reală',
      expectation: 'TRUNCATED' as const,
      world,
      target: characterTarget(building.buildingId, building.start, 0),
      obstacles,
      orbit: Object.freeze({ yawRad: 0, pitchRad: 0.2, distanceM: 6 }),
      groundM: building.start.y,
      ticks: 60,
    },
    {
      id: 'vehicle-box',
      label: 'Raza camerei trunchiată de sedanul real',
      expectation: 'TRUNCATED' as const,
      world,
      target: characterTarget('character-194', { x: 90, y: 0, z: -1 }, 0),
      obstacles: Object.freeze([sedan]),
      orbit: Object.freeze({ yawRad: Math.PI, pitchRad: 0, distanceM: 6 }),
      groundM: 0,
      ticks: 60,
    },
    {
      id: 'corner-both-axes',
      label: 'Colț cu ambele axe blocate: punct valid, fără oscilație',
      expectation: 'CORNER' as const,
      world: cornerWorld(),
      target: characterTarget('character-194', { x: 0, y: 0, z: 0 }, 0),
      obstacles: cornerObstacles(),
      orbit: Object.freeze({
        yawRad: Math.PI / 4,
        pitchRad: 0.15,
        distanceM: 6,
      }),
      groundM: 0,
      ticks: 120,
    },
  ]);
}

export interface CameraTransitionReport {
  readonly ticks: number;
  readonly transitionTicks: number;
  readonly fromEntityId: string;
  readonly toEntityId: string;
  readonly firstFrameEntityId: string;
  readonly lastFrameEntityId: string;
  readonly everyFrameEntityIsAuthority: boolean;
  readonly transitionFrames: number;
  readonly remainingStart: number;
  readonly remainingEnd: number;
  readonly maxStepM: number;
  readonly noTeleport: boolean;
  readonly settledDistanceM: number;
  readonly entityClones: number;
  readonly targetWrites: number;
}

function transitionProof(): CameraTransitionReport {
  const world = cityCameraWorld();
  const character = characterTarget('character-194', { x: 90, y: 0, z: -1 }, 0);
  const vehicle = vehicleTarget('sedan-194', { x: 94, y: 0, z: -1 }, 0);
  const camera = createCharacterCamera({ world, control: cameraControl() });
  const frames: CharacterCameraFrame[] = [];
  for (let index = 0; index < 30; index += 1) {
    frames.push(
      camera.step({
        tick: camera.state.tick + 1,
        authorityEntityId: character.entityId,
        targets: [character, vehicle],
        groundM: 0,
      }),
    );
  }
  const positionBefore = camera.state.positionM!;
  const before = frames.length;
  for (let index = 0; index < CHARACTER_CAMERA_POLICY.transitionTicks; index += 1) {
    frames.push(
      camera.step({
        tick: camera.state.tick + 1,
        authorityEntityId: vehicle.entityId,
        targets: [character, vehicle],
        groundM: 0,
      }),
    );
  }
  const transitionFrames = frames.slice(before);
  let maxStepM = distanceM(positionBefore, transitionFrames[0]!.positionM);
  for (let index = 1; index < transitionFrames.length; index += 1) {
    maxStepM = Math.max(
      maxStepM,
      distanceM(transitionFrames[index - 1]!.positionM, transitionFrames[index]!.positionM),
    );
  }
  const final = frames[frames.length - 1]!;
  return Object.freeze({
    ticks: frames.length,
    transitionTicks: CHARACTER_CAMERA_POLICY.transitionTicks,
    fromEntityId: character.entityId,
    toEntityId: vehicle.entityId,
    firstFrameEntityId: transitionFrames[0]!.entityId,
    lastFrameEntityId: final.entityId,
    everyFrameEntityIsAuthority:
      frames.slice(0, before).every((frame) => frame.entityId === character.entityId) &&
      transitionFrames.every((frame) => frame.entityId === vehicle.entityId),
    transitionFrames: transitionFrames.filter((frame) => frame.transitioning).length,
    remainingStart: transitionFrames[0]!.transitionRemainingTicks,
    remainingEnd: transitionFrames[transitionFrames.length - 1]!.transitionRemainingTicks,
    maxStepM,
    noTeleport: maxStepM < 2,
    settledDistanceM: final.distanceM,
    entityClones: camera.stats.entityClones,
    targetWrites: camera.stats.targetWrites,
  });
}

export interface CameraRefusalReport {
  readonly sameEntityAccepted: boolean;
  readonly sameEntityReason: string | null;
  readonly unknownEntityAccepted: boolean;
  readonly unknownEntityReason: string | null;
  readonly sameEntityStepTransitions: number;
  readonly unknownStepCode: string | null;
  readonly unknownStepRefusals: number;
  readonly entityCloneCountAfterRefusals: number;
}

function refusalProof(): CameraRefusalReport {
  const world = cityCameraWorld();
  const character = characterTarget('character-194', { x: 90, y: 0, z: -1 }, 0);
  const vehicle = vehicleTarget('sedan-194', { x: 94, y: 0, z: -1 }, 0);
  const camera = createCharacterCamera({ world, control: cameraControl() });
  for (let index = 0; index < 5; index += 1) {
    camera.step({
      tick: camera.state.tick + 1,
      authorityEntityId: character.entityId,
      targets: [character, vehicle],
      groundM: 0,
    });
  }
  const transitionsBefore = camera.state.transitions;
  for (let index = 0; index < 3; index += 1) {
    camera.step({
      tick: camera.state.tick + 1,
      authorityEntityId: character.entityId,
      targets: [character, vehicle],
      groundM: 0,
    });
  }
  const transitionsAfter = camera.state.transitions;
  const same = decideCameraSwitch(character.entityId, character.entityId, [
    character.entityId,
    vehicle.entityId,
  ]);
  const unknown = decideCameraSwitch(character.entityId, 'ghost-194', [
    character.entityId,
    vehicle.entityId,
  ]);
  let unknownStepCode: string | null = null;
  try {
    camera.step({
      tick: camera.state.tick + 1,
      authorityEntityId: 'ghost-194',
      targets: [character, vehicle],
      groundM: 0,
    });
  } catch (error) {
    unknownStepCode = (error as { code?: string }).code ?? null;
  }
  return Object.freeze({
    sameEntityAccepted: same.accepted,
    sameEntityReason: same.reason,
    unknownEntityAccepted: unknown.accepted,
    unknownEntityReason: unknown.reason,
    sameEntityStepTransitions: transitionsAfter - transitionsBefore,
    unknownStepCode,
    unknownStepRefusals: camera.stats.unknownEntityRefusals,
    entityCloneCountAfterRefusals: camera.stats.entityClones,
  });
}

export interface CameraSettingProof {
  readonly setting: string;
  readonly source: string;
  readonly fromValue: string;
  readonly toValue: string;
  readonly metric: string;
  readonly measured: number;
  readonly changed: boolean;
}

function movingFrame(
  world: CharacterCameraWorld,
  motion: number,
  orbit: Partial<CharacterCameraOrbit>,
  fov = 80,
): CharacterCameraFrame {
  const camera = createCharacterCamera({
    world,
    control: cameraControl({ cameraMotion: motion, fov }),
    orbit,
  });
  let frame: CharacterCameraFrame | null = null;
  for (let index = 0; index < 30; index += 1) {
    frame = camera.step({
      tick: camera.state.tick + 1,
      authorityEntityId: 'character-194',
      targets: [characterTarget('character-194', { x: 0, y: 0, z: index * 0.05 }, 0)],
      orbit,
      groundM: 0,
    });
  }
  return frame!;
}

function settingsProof(): readonly CameraSettingProof[] {
  const world = Object.freeze({ minX: -50, maxX: 50, minZ: -50, maxZ: 50, groundM: 0 });
  const rigid = movingFrame(world, 0, { yawRad: Math.PI / 2, pitchRad: 0.2, distanceM: 4.5 });
  const soft = movingFrame(world, 100, { yawRad: Math.PI / 2, pitchRad: 0.2, distanceM: 4.5 });
  const fovNarrow = movingFrame(world, 50, { distanceM: 4.5 }, 60);
  const fovWide = movingFrame(world, 50, { distanceM: 4.5 }, 100);
  const near = movingFrame(world, 50, { yawRad: Math.PI / 2, distanceM: 2 });
  const far = movingFrame(world, 50, { yawRad: Math.PI / 2, distanceM: 8 });
  const yawNormal = movingFrame(world, 50, { yawRad: Math.PI / 2, distanceM: 4.5 });
  const yawInverted = movingFrame(world, 50, {
    yawRad: Math.PI / 2,
    distanceM: 4.5,
    invertYaw: true,
  });
  const pitchNormal = movingFrame(world, 50, {
    yawRad: Math.PI / 2,
    pitchRad: 0.3,
    distanceM: 2,
  });
  const pitchInverted = movingFrame(world, 50, {
    yawRad: Math.PI / 2,
    pitchRad: 0.3,
    distanceM: 2,
    invertPitch: true,
  });
  const source = 'src/settings ControlPreferences (PBI 009), citit prin parseControlPreferences';
  return Object.freeze([
    Object.freeze({
      setting: 'cameraMotion',
      source,
      fromValue: '0',
      toValue: '100',
      metric: 'delta poziție cameră (m) după 30 tick-uri cu țintă în mișcare',
      measured: distanceM(rigid.positionM, soft.positionM),
      changed: distanceM(rigid.positionM, soft.positionM) > 1e-3,
    }),
    Object.freeze({
      setting: 'fov',
      source,
      fromValue: '60°',
      toValue: '100°',
      metric: 'delta FOV (rad)',
      measured: Math.abs(fovNarrow.fovRadians - fovWide.fovRadians),
      changed: Math.abs(fovNarrow.fovRadians - fovWide.fovRadians) > 0.1,
    }),
    Object.freeze({
      setting: 'orbit.distanceM',
      source: 'intenție explicită de orbită (input, nu al doilea sistem de setări)',
      fromValue: '2 m',
      toValue: '8 m',
      metric: 'delta distanță finală (m)',
      measured: Math.abs(near.distanceM - far.distanceM),
      changed: Math.abs(near.distanceM - far.distanceM) > 1,
    }),
    Object.freeze({
      setting: 'orbit.invertYaw',
      source: 'intenție explicită de orbită (inversare axă)',
      fromValue: 'false',
      toValue: 'true',
      metric: 'delta poziție cameră (m)',
      measured: distanceM(yawNormal.positionM, yawInverted.positionM),
      changed: distanceM(yawNormal.positionM, yawInverted.positionM) > 1,
    }),
    Object.freeze({
      setting: 'orbit.invertPitch',
      source: 'intenție explicită de orbită (inversare axă)',
      fromValue: 'false',
      toValue: 'true',
      metric: 'delta poziție cameră (m)',
      measured: distanceM(pitchNormal.positionM, pitchInverted.positionM),
      changed: distanceM(pitchNormal.positionM, pitchInverted.positionM) > 1,
    }),
  ]);
}

function settingsContractRefusal(): boolean {
  try {
    createCharacterCamera({
      world: { minX: -10, maxX: 10, minZ: -10, maxZ: 10, groundM: 0 },
      control: cameraControl({ cameraMotion: 101 }),
    });
    return false;
  } catch {
    return true;
  }
}

export interface CameraSerializationReport {
  readonly savedBytes: number;
  readonly transitionSaved: boolean;
  readonly knownEntities: number;
  readonly identicalAfterRestore: boolean;
  readonly framesCompared: number;
  readonly tamperedVersionRefused: boolean;
}

function serializationProof(): CameraSerializationReport {
  const world = cityCameraWorld();
  const character = characterTarget('character-194', { x: 90, y: 0, z: -1 }, 0);
  const vehicle = vehicleTarget('sedan-194', { x: 94, y: 0, z: -1 }, 0);
  const camera = createCharacterCamera({ world, control: cameraControl() });
  const step = (
    target: CharacterCamera,
    entityId: string,
    targets: readonly CharacterCameraTarget[],
  ) =>
    target.step({
      tick: target.state.tick + 1,
      authorityEntityId: entityId,
      targets,
      groundM: 0,
    });
  for (let index = 0; index < 10; index += 1)
    step(camera, character.entityId, [character, vehicle]);
  for (let index = 0; index < 5; index += 1) step(camera, vehicle.entityId, [character, vehicle]);
  const saved = camera.snapshot();
  const savedJson = JSON.stringify(saved);
  const restored = createCharacterCamera({ world, control: cameraControl() });
  restored.restore(JSON.parse(savedJson));
  const originalFrames: CharacterCameraFrame[] = [];
  const restoredFrames: CharacterCameraFrame[] = [];
  for (let index = 0; index < 25; index += 1) {
    const movedVehicle = vehicleTarget('sedan-194', { x: 94, y: 0, z: -1 + index * 0.02 }, 0);
    originalFrames.push(step(camera, vehicle.entityId, [character, movedVehicle]));
    restoredFrames.push(step(restored, vehicle.entityId, [character, movedVehicle]));
  }
  let tamperedVersionRefused = false;
  try {
    restored.restore({ ...saved, version: '194-other' });
  } catch {
    tamperedVersionRefused = true;
  }
  return Object.freeze({
    savedBytes: Buffer.byteLength(savedJson, 'utf8'),
    transitionSaved: saved.transition !== null,
    knownEntities: saved.knownEntityIds.length,
    identicalAfterRestore: JSON.stringify(originalFrames) === JSON.stringify(restoredFrames),
    framesCompared: originalFrames.length,
    tamperedVersionRefused,
  });
}

export interface CameraNoCloneReport {
  readonly ticks: number;
  readonly targetFrozen: boolean;
  readonly positionFrozen: boolean;
  readonly targetUnchanged: boolean;
  readonly entityClones: number;
  readonly targetWrites: number;
}

function noCloneProof(): CameraNoCloneReport {
  const world = cityCameraWorld();
  const target = characterTarget('character-194', { x: 90, y: 0, z: -1 }, 0);
  const before = JSON.stringify(target);
  const camera = createCharacterCamera({ world, control: cameraControl() });
  for (let index = 0; index < 30; index += 1) {
    camera.step({
      tick: camera.state.tick + 1,
      authorityEntityId: target.entityId,
      targets: [target],
      groundM: 0,
    });
  }
  return Object.freeze({
    ticks: 30,
    targetFrozen: Object.isFrozen(target),
    positionFrozen: Object.isFrozen(target.positionM),
    targetUnchanged: JSON.stringify(target) === before,
    entityClones: camera.stats.entityClones,
    targetWrites: camera.stats.targetWrites,
  });
}

export interface CharacterCameraReport {
  readonly generatedBy: string;
  readonly command: string;
  readonly contract: string;
  readonly tickHz: number;
  readonly policy: typeof CHARACTER_CAMERA_POLICY;
  readonly reference: Readonly<{
    mapId: string;
    cityElements: number;
    surfaces: number;
    blockers: number;
    buildingId: string;
    characterEyeHeightM: number;
    vehicleColliderHalfExtentsM: Readonly<{ x: number; z: number }>;
  }>;
  readonly scenarios: readonly CameraScenarioReport[];
  readonly transition: CameraTransitionReport;
  readonly refusal: CameraRefusalReport;
  readonly settings: readonly CameraSettingProof[];
  readonly settingsContractRefused: boolean;
  readonly serialization: CameraSerializationReport;
  readonly noClone: CameraNoCloneReport;
  readonly summary: Readonly<{
    scenarios: number;
    scenariosPassed: number;
    criterion1a: boolean;
    criterion1b: boolean;
    criterion2: boolean;
    serializable: boolean;
    noCloning: boolean;
    pass: boolean;
  }>;
  readonly determinism: Readonly<{ runs: number; identical: boolean; digest: string }>;
  readonly limitations: readonly string[];
}

function buildReport(): Omit<CharacterCameraReport, 'determinism'> {
  const real = realWalkWorld();
  const building = realBuildingSpot();
  const sedan = sedanWalkFootprint();
  const scenarios = buildScenarios().map((spec) => scenario(spec));
  const transition = transitionProof();
  const refusal = refusalProof();
  const settings = settingsProof();
  const settingsContract = settingsContractRefusal();
  const serialization = serializationProof();
  const noClone = noCloneProof();
  const scenariosPassed = scenarios.filter((entry) => entry.verdict === 'PASS').length;
  const criterion1a =
    transition.everyFrameEntityIsAuthority &&
    transition.firstFrameEntityId === transition.toEntityId &&
    transition.transitionFrames === transition.transitionTicks &&
    transition.remainingStart === transition.transitionTicks - 1 &&
    transition.remainingEnd === 0 &&
    transition.noTeleport &&
    refusal.sameEntityAccepted === false &&
    refusal.sameEntityReason === 'SAME_ENTITY' &&
    refusal.unknownEntityAccepted === false &&
    refusal.unknownEntityReason === 'UNKNOWN_ENTITY' &&
    refusal.sameEntityStepTransitions === 0 &&
    refusal.unknownStepCode === 'CAMERA_UNKNOWN_ENTITY' &&
    refusal.unknownStepRefusals === 1;
  const criterion1b =
    scenarios.every((entry) => entry.verdict === 'PASS') &&
    scenarios.some((entry) => entry.id === 'building-wall' && entry.obstructedTicks > 0) &&
    scenarios.some((entry) => entry.id === 'vehicle-box' && entry.obstructedTicks > 0) &&
    scenarios.some((entry) => entry.id === 'corner-both-axes' && entry.bothAxesBlocked === true);
  const criterion2 =
    settingsContract &&
    settings.every((entry) => entry.changed) &&
    settings.some((entry) => entry.setting === 'cameraMotion');
  const serializable =
    serialization.transitionSaved &&
    serialization.identicalAfterRestore &&
    serialization.tamperedVersionRefused;
  const noCloning =
    noClone.targetFrozen &&
    noClone.positionFrozen &&
    noClone.targetUnchanged &&
    noClone.entityClones === 0 &&
    noClone.targetWrites === 0;
  return {
    generatedBy: 'scripts/run-v3-character-camera-report.mjs',
    command: CAMERA_REPORT_COMMAND,
    contract: CAMERA_REPORT_CONTRACT,
    tickHz: CHARACTER_CAMERA_POLICY.tickHz,
    policy: CHARACTER_CAMERA_POLICY,
    reference: {
      mapId: real.mapId,
      cityElements: real.elementCount,
      surfaces: real.world.stats.surfaces,
      blockers: real.world.stats.blockers,
      buildingId: building.buildingId,
      characterEyeHeightM: characterAnchorHeightM(),
      vehicleColliderHalfExtentsM: sedan.colliderHalfExtentsM,
    },
    scenarios,
    transition,
    refusal,
    settings,
    settingsContractRefused: settingsContract,
    serialization,
    noClone,
    summary: {
      scenarios: scenarios.length,
      scenariosPassed,
      criterion1a,
      criterion1b,
      criterion2,
      serializable,
      noCloning,
      pass: criterion1a && criterion1b && criterion2 && serializable && noCloning,
    },
    limitations: [
      'Camera este un contract pur headless: nu creează cameră Babylon, mesh-uri, input sau renderer. Consumatorul 017/195 mapează poziția și FOV-ul pe camera reală.',
      'Obstacolele sunt cutii AABB orientate pe axe; pentru amprente rotite (vehicule) apelantul furnizează AABB-ul conservator. O formă concavă sau un portal nu face parte din contract.',
      'În timpul unei tranziții de autoritate camera poate fi temporar mai departe de noua țintă decât `maxDistanceM`, pentru că zboară din ultima poziție sigură; limita de distanță se aplică orbitei cerute, nu drumului de tranziție.',
      'Dacă un zid desparte complet poziția veche de noua țintă, trunchierea fail-closed oprește camera pe partea sigură în loc să o teleporteze prin zid; tranziția vizuală poate rămâne la perete până când jucătorul se mișcă.',
      'Setările existente 009 nu au astăzi slider pentru distanță sau inversare de axă; acelea rămân câmpuri explicite de intenție (input), nu un al doilea sistem de setări. `cameraMotion` și `fov` sunt citite direct din contractul 009.',
      'Proba este headless și deterministă; integrarea vizuală reală și feel-ul camerei rămân de validat în browser la PBI 195.',
    ],
  };
}

/** Stable SHA-256 over the report payload, excluding the digest field itself. */
export function characterCameraReportDigest(
  report: Omit<CharacterCameraReport, 'determinism'>,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        generatedBy: report.generatedBy,
        command: report.command,
        contract: report.contract,
        tickHz: report.tickHz,
        policy: report.policy,
        reference: report.reference,
        scenarios: report.scenarios,
        transition: report.transition,
        refusal: report.refusal,
        settings: report.settings,
        settingsContractRefused: report.settingsContractRefused,
        serialization: report.serialization,
        noClone: report.noClone,
        summary: report.summary,
        limitations: report.limitations,
      }),
    )
    .digest('hex');
}

export function runCharacterCameraReport(): CharacterCameraReport {
  const first = buildReport();
  const second = buildReport();
  const identical = JSON.stringify(first) === JSON.stringify(second);
  return {
    ...first,
    determinism: { runs: 2, identical, digest: characterCameraReportDigest(first) },
  };
}

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHARACTER_CAMERA_POLICY,
  CharacterCameraError,
  characterCameraControl,
  createCharacterCamera,
  decideCameraSwitch,
  type CharacterCamera,
  type CharacterCameraFrame,
  type CharacterCameraObstacle,
  type CharacterCameraOrbit,
  type CharacterCameraTarget,
} from '../../src/character';
import {
  cameraClearanceM,
  cameraControl,
  characterTarget,
  cityCameraObstacles,
  cityCameraWorld,
  cornerObstacles,
  cornerWorld,
  insideSuggestedBox,
  pointBoxDistanceM,
  vehicleCameraObstacle,
  vehicleTarget,
} from './character-camera-suite';
import { realBuildingSpot, sedanWalkFootprint } from './walk-world';

function stepFrame(
  camera: CharacterCamera,
  authorityEntityId: string,
  targets: readonly CharacterCameraTarget[],
  extra: {
    readonly orbit?: Partial<CharacterCameraOrbit>;
    readonly obstacles?: readonly CharacterCameraObstacle[];
    readonly groundM?: number;
  } = {},
): CharacterCameraFrame {
  return camera.step({
    tick: camera.state.tick + 1,
    authorityEntityId,
    targets,
    orbit: extra.orbit,
    obstacles: extra.obstacles,
    groundM: extra.groundM ?? 0,
  });
}

function distanceM(
  first: Readonly<{ x: number; y: number; z: number }>,
  second: Readonly<{ x: number; y: number; z: number }>,
): number {
  return Math.hypot(second.x - first.x, second.y - first.y, second.z - first.z);
}

function throwsCode(action: () => unknown, code: string): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof CharacterCameraError, String(error));
    assert.equal(error.code, code);
    return true;
  });
}

test('urmărește exact entityId și produce cadrul third person la distanța orbitei', () => {
  const world = cityCameraWorld();
  const target = characterTarget('character-194', { x: 90, y: 0, z: -1 }, 0);
  const camera = createCharacterCamera({ world, control: cameraControl() });
  let frame: CharacterCameraFrame | null = null;
  for (let index = 0; index < 60; index += 1) {
    frame = stepFrame(camera, target.entityId, [target]);
  }
  assert.ok(frame);
  assert.equal(frame.entityId, 'character-194');
  assert.equal(frame.targetKind, 'CHARACTER');
  assert.ok(Math.abs(frame.distanceM - 4.5) <= 1e-9);
  assert.equal(frame.requestedDistanceM, 4.5);
  assert.deepEqual(frame.lookAtM, frame.anchorM);
  assert.equal(frame.positionM.y > frame.anchorM.y, true);
  assert.equal(frame.up.y, 1);
  assert.equal(frame.fovRadians, characterCameraControl(cameraControl()).fovRadians);
  assert.equal(frame.obstructedBy, null);
  assert.equal(frame.transitioning, false);
  assert.equal(camera.state.transitions, 0);
  assert.equal(camera.state.entityId, 'character-194');
  assert.equal(camera.state.previousEntityId, null);
  assert(Object.isFrozen(camera.state));
  assert(Object.isFrozen(camera.state.positionM));
  assert.equal(camera.stats.frames, 60);
  assert.equal(camera.stats.entityClones, 0);
  assert.equal(camera.stats.targetWrites, 0);
});

test('schimbarea autorității interpolează exact 18 tick-uri și raportează imediat noua entitate', () => {
  const world = cityCameraWorld();
  const character = characterTarget('character-194', { x: 90, y: 0, z: -1 }, 0);
  const vehicle = vehicleTarget('sedan-194', { x: 94, y: 0, z: -1 }, 0);
  const camera = createCharacterCamera({ world, control: cameraControl() });
  for (let index = 0; index < 30; index += 1) {
    stepFrame(camera, character.entityId, [character, vehicle]);
  }
  const before = camera.state.positionM!;
  const transitionFrames: CharacterCameraFrame[] = [];
  for (let index = 0; index < CHARACTER_CAMERA_POLICY.transitionTicks; index += 1) {
    transitionFrames.push(stepFrame(camera, vehicle.entityId, [character, vehicle]));
  }
  assert.equal(transitionFrames[0]!.entityId, vehicle.entityId);
  assert.equal(transitionFrames[0]!.targetKind, 'VEHICLE');
  assert.equal(transitionFrames[0]!.transitioning, true);
  assert.equal(
    transitionFrames[0]!.transitionRemainingTicks,
    CHARACTER_CAMERA_POLICY.transitionTicks - 1,
  );
  assert.equal(transitionFrames.filter((frame) => frame.transitioning).length, 18);
  assert.equal(transitionFrames[17]!.transitionRemainingTicks, 0);
  assert.equal(camera.state.transition, null);
  assert.equal(camera.state.entityId, vehicle.entityId);
  assert.equal(camera.state.previousEntityId, character.entityId);
  assert.equal(camera.state.transitions, 1);
  assert.equal(camera.stats.entityClones, 0);
  assert.equal(camera.stats.targetWrites, 0);

  let maxStepM = distanceM(before, transitionFrames[0]!.positionM);
  for (let index = 1; index < transitionFrames.length; index += 1) {
    maxStepM = Math.max(
      maxStepM,
      distanceM(transitionFrames[index - 1]!.positionM, transitionFrames[index]!.positionM),
    );
  }
  // The transition is interpolated, not a cut: the camera travels roughly 4 m over 18 ticks.
  assert.ok(maxStepM < 2, `max step ${maxStepM}`);
  assert.ok(Math.abs(transitionFrames[17]!.distanceM - 4.5) <= 1e-6);
});

test('refuză explicit aceeași entitate și un entityId necunoscut, fără tranziție falsă', () => {
  const same = decideCameraSwitch('character-194', 'character-194', ['character-194', 'sedan-194']);
  assert.deepEqual(same, {
    accepted: false,
    fromEntityId: 'character-194',
    toEntityId: 'character-194',
    reason: 'SAME_ENTITY',
  });
  const unknown = decideCameraSwitch('character-194', 'ghost-194', ['character-194']);
  assert.deepEqual(unknown, {
    accepted: false,
    fromEntityId: 'character-194',
    toEntityId: 'ghost-194',
    reason: 'UNKNOWN_ENTITY',
  });

  const world = cityCameraWorld();
  const character = characterTarget('character-194', { x: 90, y: 0, z: -1 }, 0);
  const camera = createCharacterCamera({ world, control: cameraControl() });
  for (let index = 0; index < 5; index += 1) {
    stepFrame(camera, character.entityId, [character]);
  }
  const transitionsBefore = camera.state.transitions;
  for (let index = 0; index < 3; index += 1) {
    stepFrame(camera, character.entityId, [character]);
  }
  assert.equal(camera.state.transitions, transitionsBefore);
  throwsCode(() => stepFrame(camera, 'ghost-194', [character]), 'CAMERA_UNKNOWN_ENTITY');
  assert.equal(camera.stats.unknownEntityRefusals, 1);
  assert.equal(camera.state.entityId, character.entityId);
});

test('trunchiază raza la primul obstacol real, cu marjă, fără să intre în zid', () => {
  const world = cityCameraWorld();
  const obstacles = cityCameraObstacles();
  const building = realBuildingSpot();
  const target = characterTarget(building.buildingId, building.start, 0);
  const orbit = Object.freeze({ yawRad: 0, pitchRad: 0.2, distanceM: 6 });
  const camera = createCharacterCamera({ world, control: cameraControl(), orbit });
  const clearances: number[] = [];
  let final: CharacterCameraFrame | null = null;
  for (let index = 0; index < 60; index += 1) {
    final = stepFrame(camera, target.entityId, [target], {
      orbit,
      obstacles,
      groundM: building.start.y,
    });
    clearances.push(cameraClearanceM(final.positionM, obstacles));
    assert.ok(final.distanceM <= 6 + 1e-9);
  }
  assert.ok(final);
  assert.equal(final.obstructedBy, building.buildingId);
  assert.ok(final.distanceM < 6 - 0.1);
  assert.ok(final.distanceM > 0);
  const minimum = Math.min(...clearances);
  assert.ok(minimum >= CHARACTER_CAMERA_POLICY.obstacleMarginM - 1e-6, `clearance ${minimum}`);
  assert.equal(camera.stats.obstacleHits, 60);
});

test('trunchiază raza la caroseria reală a unui sedan', () => {
  const world = cityCameraWorld();
  const sedan = vehicleCameraObstacle('sedan-194', { x: 90, y: 0, z: -5 }, 0);
  const target = characterTarget('character-194', { x: 90, y: 0, z: -1 }, 0);
  const orbit = Object.freeze({ yawRad: Math.PI, pitchRad: 0, distanceM: 6 });
  const camera = createCharacterCamera({ world, control: cameraControl(), orbit });
  let final: CharacterCameraFrame | null = null;
  for (let index = 0; index < 60; index += 1) {
    final = stepFrame(camera, target.entityId, [target], {
      orbit,
      obstacles: [sedan],
    });
    assert.ok(cameraClearanceM(final.positionM, [sedan]) >= 0.05 - 1e-6);
  }
  assert.ok(final);
  assert.equal(final.obstructedBy, 'sedan-194');
  assert.ok(final.positionM.z > sedan.max.z, 'camera stays on the character side');
  assert.ok(Math.abs(final.distanceM - 1.75) <= 1e-4, `distance ${final.distanceM}`);
});

test('colțul cu ambele axe blocate rămâne într-un punct valid, fără oscilație și în lume', () => {
  const world = cornerWorld();
  const obstacles = cornerObstacles();
  const target = characterTarget('character-194', { x: 0, y: 0, z: 0 }, 0);
  const orbit = Object.freeze({ yawRad: Math.PI / 4, pitchRad: 0.15, distanceM: 6 });
  const camera = createCharacterCamera({ world, control: cameraControl(), orbit });
  const frames: CharacterCameraFrame[] = [];
  for (let index = 0; index < 120; index += 1) {
    const frame = stepFrame(camera, target.entityId, [target], { orbit, obstacles });
    frames.push(frame);
    assert.ok(cameraClearanceM(frame.positionM, obstacles) >= 0.05 - 1e-6);
    assert.ok(frame.positionM.x >= world.minX + 0.2 - 1e-9);
    assert.ok(frame.positionM.x <= world.maxX - 0.2 + 1e-9);
    assert.ok(frame.positionM.z >= world.minZ + 0.2 - 1e-9);
    assert.ok(frame.positionM.z <= world.maxZ - 0.2 + 1e-9);
    assert.ok(frame.positionM.y >= 0.4 - 1e-9);
  }
  const final = frames[frames.length - 1]!;
  assert.ok(final.distanceM < 6 - 1);
  const inflate = CHARACTER_CAMERA_POLICY.cameraRadiusM + CHARACTER_CAMERA_POLICY.obstacleMarginM;
  const xProbe = { ...final.positionM, x: final.positionM.x + 0.01 };
  const zProbe = { ...final.positionM, z: final.positionM.z + 0.01 };
  assert.ok(obstacles.some((box) => insideSuggestedBox(xProbe, box, inflate)));
  assert.ok(obstacles.some((box) => insideSuggestedBox(zProbe, box, inflate)));
  const tail = frames.slice(-20);
  for (let index = 1; index < tail.length; index += 1) {
    assert.ok(
      distanceM(tail[index - 1]!.positionM, tail[index]!.positionM) <= 1e-9,
      'camera oscillates in the corner',
    );
  }
  assert.equal(camera.stats.fallbacks, 0);
});

test('constrânge pitch-ul, distanța, solul și limitele lumii', () => {
  const open = Object.freeze({ minX: -50, maxX: 50, minZ: -50, maxZ: 50, groundM: 0 });
  const target = characterTarget('character-194', { x: 0, y: 0, z: 0 }, 0);
  const camera = createCharacterCamera({ world: open, control: cameraControl() });
  const high = stepFrame(camera, target.entityId, [target], {
    orbit: { yawRad: Math.PI, pitchRad: 99, distanceM: 100 },
  });
  assert.equal(high.orbit.pitchRad, CHARACTER_CAMERA_POLICY.maxPitchRad);
  assert.equal(high.orbit.distanceM, CHARACTER_CAMERA_POLICY.maxDistanceM);
  assert.ok(high.distanceM <= CHARACTER_CAMERA_POLICY.maxDistanceM + 1e-9);
  const low = stepFrame(camera, target.entityId, [target], {
    orbit: { yawRad: Math.PI, pitchRad: -99, distanceM: 0.1 },
  });
  assert.equal(low.orbit.pitchRad, CHARACTER_CAMERA_POLICY.minPitchRad);
  assert.equal(low.orbit.distanceM, CHARACTER_CAMERA_POLICY.minDistanceM);
  throwsCode(
    () =>
      stepFrame(camera, target.entityId, [target], {
        orbit: { pitchRad: Number.NaN },
      }),
    'INVALID_CAMERA_INPUT',
  );

  const sidewalkTarget = characterTarget('character-194', { x: 90, y: 0.14, z: 0 }, 0);
  const sidewalk = stepFrame(camera, sidewalkTarget.entityId, [sidewalkTarget], {
    orbit: { yawRad: 0, pitchRad: -99, distanceM: 8 },
    groundM: 0.14,
  });
  assert.ok(
    sidewalk.positionM.y >= 0.14 + CHARACTER_CAMERA_POLICY.groundClearanceM - 1e-9,
    `camera y ${sidewalk.positionM.y}`,
  );

  const small = Object.freeze({ minX: -5, maxX: 5, minZ: -5, maxZ: 5, groundM: 0 });
  const bounded = createCharacterCamera({ world: small, control: cameraControl() });
  const edge = stepFrame(bounded, target.entityId, [target], {
    orbit: { yawRad: 0, pitchRad: 0, distanceM: 8 },
  });
  assert.equal(edge.positionM.z, 5 - CHARACTER_CAMERA_POLICY.cameraRadiusM);
  assert.ok(edge.positionM.x >= small.minX + 0.2 - 1e-9);
  assert.ok(edge.positionM.x <= small.maxX - 0.2 + 1e-9);
  assert.ok(edge.positionM.y >= 0.4 - 1e-9);
});

test('starea camerei este serializabilă și reluarea continuă identic', () => {
  const world = cityCameraWorld();
  const character = characterTarget('character-194', { x: 90, y: 0, z: -1 }, 0);
  const vehicle = vehicleTarget('sedan-194', { x: 94, y: 0, z: -1 }, 0);
  const camera = createCharacterCamera({ world, control: cameraControl() });
  for (let index = 0; index < 10; index += 1) {
    stepFrame(camera, character.entityId, [character, vehicle]);
  }
  for (let index = 0; index < 5; index += 1) {
    stepFrame(camera, vehicle.entityId, [character, vehicle]);
  }
  const snapshot = camera.snapshot();
  assert.notEqual(snapshot.transition, null);
  assert.equal(snapshot.entityId, vehicle.entityId);
  assert.equal(snapshot.previousEntityId, character.entityId);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);

  const restored = createCharacterCamera({ world, control: cameraControl() });
  restored.restore(JSON.parse(JSON.stringify(snapshot)));
  const originalFrames: CharacterCameraFrame[] = [];
  const restoredFrames: CharacterCameraFrame[] = [];
  for (let index = 0; index < 20; index += 1) {
    const moved = vehicleTarget('sedan-194', { x: 94, y: 0, z: -1 + index * 0.02 }, 0);
    originalFrames.push(stepFrame(camera, moved.entityId, [character, moved]));
    restoredFrames.push(stepFrame(restored, moved.entityId, [character, moved]));
  }
  assert.deepEqual(restoredFrames, originalFrames);
  assert.equal(restored.state.transitions, snapshot.transitions);

  throwsCode(() => restored.restore({ ...snapshot, version: '194-other' }), 'INVALID_CAMERA_STATE');
  throwsCode(() => restored.restore({ ...snapshot, unknownField: true }), 'INVALID_CAMERA_STATE');
  throwsCode(
    () => restored.restore({ ...snapshot, entityId: 'ghost-194' }),
    'INVALID_CAMERA_STATE',
  );
});

test('setările 009 existente schimbă camera fără un al doilea sistem', () => {
  const control = cameraControl();
  const projection = characterCameraControl(control);
  assert.equal(projection.cameraMotion, 50);
  assert.equal(projection.fovDegrees, 80);
  assert.equal(projection.followFactor, 0.625);
  assert.ok(Math.abs(projection.fovRadians - (80 * Math.PI) / 180) <= 1e-12);

  const world = cityCameraWorld();
  const target = characterTarget('character-194', { x: 0, y: 0, z: 0 }, 0);
  const camera = createCharacterCamera({ world, control });
  const first = stepFrame(camera, target.entityId, [target]);
  assert.equal(first.fovRadians, projection.fovRadians);
  const updated = camera.setControlPreferences(cameraControl({ cameraMotion: 100, fov: 60 }));
  assert.equal(updated.followFactor, 0.25);
  assert.equal(updated.fovDegrees, 60);
  const second = stepFrame(camera, target.entityId, [target]);
  assert.ok(Math.abs(second.fovRadians - (60 * Math.PI) / 180) <= 1e-12);

  const positions = (motion: number) => {
    const moving = createCharacterCamera({
      world,
      control: cameraControl({ cameraMotion: motion }),
    });
    let frame: CharacterCameraFrame | null = null;
    for (let index = 0; index < 30; index += 1) {
      frame = stepFrame(
        moving,
        'character-194',
        [characterTarget('character-194', { x: 0, y: 0, z: index * 0.05 }, 0)],
        { orbit: { yawRad: Math.PI / 2, pitchRad: 0.2, distanceM: 4.5 } },
      );
    }
    return frame!.positionM;
  };
  assert.ok(distanceM(positions(0), positions(100)) > 1e-3);
  assert.throws(() => cameraControl({ cameraMotion: 101 }));
});

test('nu clonează și nu scrie entitatea urmărită', () => {
  const world = cityCameraWorld();
  const target = characterTarget('character-194', { x: 90, y: 0, z: -1 }, 0);
  const before = JSON.stringify(target);
  const camera = createCharacterCamera({ world, control: cameraControl() });
  for (let index = 0; index < 30; index += 1) {
    stepFrame(camera, target.entityId, [target]);
  }
  assert.equal(JSON.stringify(target), before);
  assert(Object.isFrozen(target));
  assert(Object.isFrozen(target.positionM));
  assert.equal(camera.stats.entityClones, 0);
  assert.equal(camera.stats.targetWrites, 0);
});

test('aceleași intrări produc exact aceleași cadre', () => {
  const run = () => {
    const world = cityCameraWorld();
    const character = characterTarget('character-194', { x: 90, y: 0, z: -1 }, 0);
    const vehicle = vehicleTarget('sedan-194', { x: 94, y: 0, z: -1 }, 0);
    const camera = createCharacterCamera({ world, control: cameraControl() });
    for (let index = 0; index < 30; index += 1) {
      stepFrame(camera, character.entityId, [character, vehicle]);
    }
    const frames: CharacterCameraFrame[] = [];
    for (let index = 0; index < 18; index += 1) {
      frames.push(stepFrame(camera, vehicle.entityId, [character, vehicle]));
    }
    return { frames, snapshot: camera.snapshot() };
  };
  assert.deepEqual(run(), run());
});

test('un obstacol invalid și o lume prea mică sunt refuzate', () => {
  const world = cityCameraWorld();
  const target = characterTarget('character-194', { x: 90, y: 0, z: -1 }, 0);
  const camera = createCharacterCamera({ world, control: cameraControl() });
  throwsCode(
    () =>
      stepFrame(camera, target.entityId, [target], {
        obstacles: [{ id: 'bad', min: { x: 1, y: 1, z: 1 }, max: { x: 0, y: 0, z: 0 } }],
      }),
    'INVALID_CAMERA_OBSTACLE',
  );
  assert.throws(
    () =>
      createCharacterCamera({
        world: { minX: 0, maxX: 0.1, minZ: -1, maxZ: 1, groundM: 0 },
        control: cameraControl(),
      }),
    (error: unknown) =>
      error instanceof CharacterCameraError && error.code === 'INVALID_CAMERA_WORLD',
  );
  const sedan = vehicleCameraObstacle('sedan-194', { x: 90, y: 0, z: -5 }, 0);
  assert.equal(pointBoxDistanceM({ x: 90, y: 0, z: -1 }, sedan) > 0, true);
  assert.equal(sedanWalkFootprint().halfExtentsM.x, 0.85);
});

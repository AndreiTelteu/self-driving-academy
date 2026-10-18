import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { createRenderingBackend } from '../../../src/rendering/babylon';
import type { RenderingBackend } from '../../../src/rendering/babylon';
import { createRapierProbe } from '../../../src/vehicles/rapier';
import { createVehicleController } from '../../../src/vehicles/controller';
import { vehicleClass } from '../../../src/vehicles/vehicle-classes';
import {
  compileLateralTrajectory,
  createLateralController,
  LATERAL_LIMITS,
} from '../../../src/autonomy/lateral-controller';
import type { LateralProjection } from '../../../src/autonomy/lateral-controller';
import { createFixedTickLoop } from '../../../src/simulation/fixed-tick';
import { lateralTurnFixture } from '../../autonomy/lateral-controller-fixture';
import { fixtureSpeedCommand } from '../../autonomy/lateral-controller-reference';

declare const __LATERAL_BUILD__: { sourceHash: string; commit: string; inputs: string[] };
const status = document.getElementById('status')!;
const raf = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
const plain = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;
function check(value: boolean, message: string): asserts value {
  if (!value) throw new Error(message);
}
let owned: RenderingBackend | undefined, failureDiagnostic: unknown;
async function protocol(
  backend: RenderingBackend,
  classId: 'sedan' | 'compact',
  kind: 'STRAIGHT' | 'LEFT' | 'RIGHT',
  speedMps: number,
  epoch: number,
) {
  const map = lateralTurnFixture(kind === 'RIGHT'),
    context = {
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: '049-browser',
      worldEpoch: epoch,
    };
  const lateralWorld = {
    sessionId: context.sessionId,
    worldEpoch: epoch,
    mapId: map.mapId,
    mapVersionId: '049-browser-authored-v1',
  };
  const trajectory = compileLateralTrajectory(map, {
    ...lateralWorld,
    version: '049-directed-trajectory-v1',
    id: `${classId}-${kind}-${speedMps}`,
    access: 'CIVIL',
    laneIds: kind === 'STRAIGHT' ? ['lane-a'] : ['lane-a', 'lane-b'],
    loop: false,
  });
  const world = await createRapierProbe(),
    owner = createLateralController(lateralWorld),
    controller = createVehicleController(context, world);
  try {
    const positionM = { ...trajectory.points[0], y: 0.8 },
      yaw = Math.PI / 2,
      config = vehicleClass(classId);
    world.addClassCar('car', positionM, classId);
    const token = world.bodyIdentity('car')!,
      actor = { id: 'car', incarnation: token.generation };
    world.setPose(token, {
      positionM,
      rotationQuaternion: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
    });
    world.setBodyVelocity(token, { x: speedMps, y: 0, z: 0 });
    controller.register(token);
    owner.setActors([{ ...actor, classId }], lateralWorld);
    owner.setTrajectory(actor, trajectory, lateralWorld);
    const mesh = MeshBuilder.CreateBox(
      'car',
      { width: config.wheels.trackM, height: 0.6, depth: config.wheels.wheelbaseM + 1.2 },
      backend.scene,
    );
    mesh.position.copyFromFloats(positionM.x, positionM.y, positionM.z);
    mesh.rotationQuaternion = new Quaternion(0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2));
    const material = new StandardMaterial('car', backend.scene);
    material.diffuseColor = new Color3(0.15, 0.55, 0.95);
    mesh.material = material;
    const roadMaterial = new StandardMaterial('authored-road', backend.scene);
    roadMaterial.diffuseColor = new Color3(0.2, 0.24, 0.28);
    const roadMeshes = trajectory.points.slice(0, -1).map((a, i) => {
      const b = trajectory.points[i + 1],
        dx = b.x - a.x,
        dz = b.z - a.z;
      const road = MeshBuilder.CreateBox(
        `road-${i}`,
        { width: trajectory.widthM, height: 0.03, depth: Math.hypot(dx, dz) },
        backend.scene,
      );
      road.position.set((a.x + b.x) / 2, 0.015, (a.z + b.z) / 2);
      road.rotation.y = Math.atan2(dx, dz);
      road.material = roadMaterial;
      return road;
    });
    const centerline = MeshBuilder.CreateLines(
      'actual-authored-centerline',
      { points: trajectory.points.map((p) => new Vector3(p.x, 0.06, p.z)) },
      backend.scene,
    );
    centerline.color = new Color3(0.98, 0.84, 0.35);
    const canvas = backend.canvas;
    canvas.focus();
    let tick = 0,
      completed = false,
      sawCurve = false,
      previous = positionM,
      maximumCrossTrackM = 0,
      maximumDisplacementM = 0;
    let minimumSpeedMps = Infinity,
      maximumSpeedMps = 0,
      latest: LateralProjection | null = null;
    const checkpoints: unknown[] = [];
    const loop = createFixedTickLoop({
      captureSnapshot: () => ({ tick }),
      interpolate: (_old, current) => current,
      step(time) {
        tick = time.tick;
        const body = world.readBody(token),
          v = body.velocityMps,
          speed = Math.hypot(v.x, v.z);
        latest = owner.step({
          ...lateralWorld,
          version: '049-lateral-v1',
          actor,
          tick,
          requestedSpeedMps: speedMps,
          observation: {
            sourceTick: tick - 1,
            positionM: body.transform.positionM,
            rotationQuaternion: body.transform.rotationQuaternion,
            velocityMps: v,
            discontinuity: false,
          },
        });
        check(latest.feasible, `Lateral infeasible ${latest.reason}`);
        check(latest.crossTrackM !== null, 'Missing actual cross-track');
        maximumCrossTrackM = Math.max(maximumCrossTrackM, latest.crossTrackM);
        if (tick > 60) {
          minimumSpeedMps = Math.min(minimumSpeedMps, speed);
          maximumSpeedMps = Math.max(maximumSpeedMps, speed);
        }
        const displacement = Math.hypot(
          body.transform.positionM.x - previous.x,
          body.transform.positionM.z - previous.z,
        );
        check(displacement < 1, 'Unexpected pose discontinuity');
        maximumDisplacementM = Math.max(maximumDisplacementM, displacement);
        previous = body.transform.positionM;
        const command = {
          ...context,
          vehicleId: 'car',
          tick,
          source: 'AUTONOMY' as const,
          ...fixtureSpeedCommand(speedMps, speed),
          steering: latest.steering,
          handbrake: false,
          turnSignal: 'OFF' as const,
        };
        const realized = controller.step(time, [{ identity: token, command }], [], false),
          state = world.project('car');
        check(
          [
            ...Object.values(state.position),
            ...Object.values(state.rotation),
            ...Object.values(state.velocity),
          ].every(Number.isFinite),
          'Non-finite native state',
        );
        if (Math.abs(state.position.z) > 4 && Math.abs(state.position.z) < 15) sawCurve = true;
        if (tick % 60 === 0) {
          check(checkpoints.length < 40, 'Checkpoint capacity');
          checkpoints.push(
            plain({
              tick,
              sourceTick: latest.sourceTick,
              steering: latest.steering,
              reason: latest.reason,
              crossTrackM: latest.crossTrackM,
              advisorySpeedLimitMps: latest.advisorySpeedLimitMps,
              physical: state,
              command: realized.controls[0].command,
            }),
          );
        }
        check(tick <= 2400, 'Authored maneuver incomplete');
        completed =
          kind === 'STRAIGHT'
            ? state.position.x >= -20
            : kind === 'RIGHT'
              ? state.position.z <= -24
              : state.position.z >= 24;
      },
    });
    let start = 0,
      previousRaf = 0,
      maxRafGapMs = 0,
      warmupElapsedMs = 0;
    try {
      const warmupStart = performance.now();
      await material.forceCompilationAsync(mesh);
      for (const road of roadMeshes) await roadMaterial.forceCompilationAsync(road);
      await backend.scene.whenReadyAsync();
      for (let frame = 0; frame < 30; frame++) {
        await raf();
        check(document.hasFocus() && !document.hidden, 'Lost foreground during warmup');
        backend.render();
      }
      warmupElapsedMs = performance.now() - warmupStart;
      start = performance.now();
      previousRaf = await raf();
      loop.frame(previousRaf);
      while (!completed) {
        check(document.hasFocus() && !document.hidden, 'Lost foreground');
        const now = await raf(),
          gapMs = now - previousRaf;
        previousRaf = now;
        maxRafGapMs = Math.max(maxRafGapMs, gapMs);
        loop.frame(now);
        failureDiagnostic = {
          classId,
          kind,
          speedMps,
          tick,
          gapMs,
          maxRafGapMs,
          warmupElapsedMs,
          loop: plain(loop.getState()),
          latest: plain(latest),
        };
        check(loop.getState().overloadCount === 0, 'Fixed tick overload');
        check(loop.getState().fault === null, 'Fixed tick fault');
        const state = world.project('car'),
          q = state.rotation;
        mesh.position.copyFromFloats(state.position.x, state.position.y, state.position.z);
        mesh.rotationQuaternion = new Quaternion(q.x, q.y, q.z, q.w);
        status.textContent = `${classId} ${kind} ${speedMps}m/s — tick${tick}, cross-track${maximumCrossTrackM.toFixed(3)}m\n${JSON.stringify(latest)}`;
        backend.render();
      }
      check(completed && (kind === 'STRAIGHT' || sawCurve), 'Authored TURN traversal incomplete');
      check(maximumCrossTrackM <= 1, 'Empirical tracking envelope failed');
      const mechanics = world.readVehicleMechanics('car');
      const nativeWheels = {
        radiusM: Math.fround(config.wheels.radiusM),
        wheelbaseM: 2 * Math.fround(config.wheels.wheelbaseM / 2),
        trackM: 2 * Math.fround(config.wheels.trackM / 2),
      };
      check(
        mechanics.massKg === config.massKg &&
          mechanics.powerW === config.powerW &&
          mechanics.grip === Math.fround(config.grip) &&
          mechanics.wheels.radiusM === nativeWheels.radiusM &&
          mechanics.wheels.wheelbaseM === nativeWheels.wheelbaseM &&
          mechanics.wheels.trackM === nativeWheels.trackM &&
          mechanics.turningRadiusM === nativeWheels.wheelbaseM / Math.tan(config.steeringRadians),
        'Mechanical configuration changed',
      );
      return {
        classId,
        kind,
        requestedSpeedMps: speedMps,
        ticks: tick,
        elapsedWallMs: performance.now() - start,
        completed,
        sawCurve,
        authoredTurnCount: trajectory.authoredTurnCount,
        maximumCrossTrackM,
        maximumDisplacementM,
        minimumSpeedMps,
        maximumSpeedMps,
        initialPoseWrites: 1,
        initialVelocityWrites: 1,
        drivingPoseWrites: 0,
        drivingVelocityWrites: 0,
        overloadCount: loop.getState().overloadCount,
        startup: { warmupFrames: 30, warmupElapsedMs, physicsTicks: 0 },
        maxRafGapMs,
        checkpoints,
        final: plain(world.project('car')),
        mechanics,
      };
    } finally {
      loop.dispose();
      owner.dispose();
      controller.dispose();
      world.dispose();
      check(
        owner.getStats().retainedVertices === 0 &&
          owner.getStats().actors === 0 &&
          controller.getStats().vehicles === 0 &&
          world.bodyResources().entities === 0,
        'Owned cleanup failed',
      );
      mesh.dispose();
      material.dispose();
      for (const road of roadMeshes) road.dispose();
      roadMaterial.dispose();
      centerline.dispose();
    }
  } finally {
    owner.dispose();
    controller.dispose();
    world.dispose();
  }
}
document.getElementById('run')!.addEventListener('click', async () => {
  const button = document.getElementById('run') as HTMLButtonElement;
  button.disabled = true;
  failureDiagnostic = null;
  try {
    owned?.dispose();
    owned = await createRenderingBackend(
      document.getElementById('canvas') as HTMLCanvasElement,
      (document.getElementById('backend') as HTMLSelectElement).value as 'AUTO' | 'WEBGL2',
    );
    const canvas = owned.canvas;
    canvas.tabIndex = 0;
    canvas.focus();
    owned.scene.getEngine().setHardwareScalingLevel(1);
    owned.resize();
    owned.scene.getEngine().setSize(1920, 1080);
    check(
      devicePixelRatio === 1 && canvas.clientWidth === 1920 && canvas.clientHeight === 1080,
      'Resolution mismatch',
    );
    new HemisphericLight('light', new Vector3(0, 1, 0), owned.scene);
    const camera = new FreeCamera('camera', new Vector3(-48, 58, -35), owned.scene);
    camera.setTarget(new Vector3(-12, 0, 12));
    owned.scene.activeCamera = camera;
    MeshBuilder.CreateGround('ground', { width: 160, height: 160 }, owned.scene);
    const arms: Awaited<ReturnType<typeof protocol>>[] = [];
    const scenarios = [
      ['sedan', 'STRAIGHT', 5],
      ['sedan', 'LEFT', 3],
      ['sedan', 'RIGHT', 7],
      ['compact', 'STRAIGHT', 5],
      ['compact', 'LEFT', 7],
      ['compact', 'RIGHT', 3],
    ] as const;
    for (const [epoch, [classId, kind, speed]] of scenarios.entries())
      arms.push(await protocol(owned, classId, kind, speed, epoch));
    const engine = owned.scene.getEngine(),
      manifest = (await (await fetch('/build-manifest.json')).json()) as { artifactHash: string };
    const report = {
      fixtureVersion: '049-lateral-drive-v1',
      identity: __LATERAL_BUILD__,
      artifactHash: manifest.artifactHash,
      createdAt: new Date().toISOString(),
      browser: navigator.userAgent,
      renderer: owned.rendererKind,
      actualGpuInfo:
        'getInfo' in engine ? (engine as unknown as { getInfo(): unknown }).getInfo() : null,
      foreground: document.hasFocus() && !document.hidden,
      cssResolution: [canvas.clientWidth, canvas.clientHeight],
      internalResolution: [engine.getRenderWidth(), engine.getRenderHeight()],
      dpr: devicePixelRatio,
      arms,
      guards: LATERAL_LIMITS,
      scope:
        'Actual visible native049 steering through unchanged024 physics. Authored033straight/LEFT/RIGHT curves, varied3/5/7mps and bothclasses. Explicit fixture speedgovernor; no driving pose/velocity writes. No fleetFPS/laptop/fullgame claim.',
    };
    const response = await fetch('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    check(response.ok, await response.text());
    status.textContent = `PASS ${owned.rendererKind}: six actual sedan/compact straight/LEFT/RIGHT driving arms. Evidence saved.`;
  } catch (error) {
    status.textContent = `FAILED: ${String(error)}`;
    console.error(error);
    try {
      await fetch('/failure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixtureVersion: '049-lateral-drive-v1',
          identity: __LATERAL_BUILD__,
          createdAt: new Date().toISOString(),
          error: String(error),
          diagnostic: failureDiagnostic,
          browser: navigator.userAgent,
          foreground: document.hasFocus() && !document.hidden,
        }),
      });
    } catch (failure) {
      console.error('Failure export unavailable', failure);
    }
  } finally {
    button.disabled = false;
  }
});

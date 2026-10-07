import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { createRenderingBackend } from '../../../src/rendering/babylon/backend';
import { createRapierProbe } from '../../../src/vehicles/rapier';
import { createVehicleController } from '../../../src/vehicles/controller';
import { createVehicleDamage } from '../../../src/vehicles/damage-state';
import { createCollisionEpisodes } from '../../../src/vehicles/collision-episodes';
import { VEHICLE_CLASSES } from '../../../src/vehicles/vehicle-classes';
import { createFixedTickLoop } from '../../../src/simulation/fixed-tick';

declare const __DAMAGE_BUILD__: Readonly<Record<string, unknown>>;
const status = document.getElementById('status')!;
const button = document.getElementById('run') as HTMLButtonElement;
const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
function check(value: boolean, message: string): asserts value {
  if (!value) throw new Error(message);
}
button.onclick = async () => {
  button.disabled = true;
  let backend: Awaited<ReturnType<typeof createRenderingBackend>> | undefined;
  const report: Record<string, unknown> = {
    fixtureVersion: '029-native-damage-functional-v1',
    identity: __DAMAGE_BUILD__,
    startedAt: new Date().toISOString(),
    scope:
      'Actual native collisions and commanded motion, real-wall fixed60Hz, headed functional playtest; no hardware FPS/full-game budget claim',
    passed: false,
  };
  const results: Record<string, unknown>[] = [];
  report.results = results;
  try {
    const preference = (document.getElementById('backend') as HTMLSelectElement).value as
      'AUTO' | 'WEBGL2';
    backend = await createRenderingBackend(
      document.getElementById('canvas') as HTMLCanvasElement,
      preference,
    );
    const owned = backend;
    report.renderer = owned.rendererKind;
    const engine = owned.scene.getEngine();
    engine.setHardwareScalingLevel(1);
    owned.resize();
    check(
      devicePixelRatio === 1 &&
        owned.canvas.clientWidth === 1920 &&
        owned.canvas.clientHeight === 1080 &&
        engine.getRenderWidth() === 1920 &&
        engine.getRenderHeight() === 1080,
      'Required CSS/internal1920x1080 DPR1',
    );
    report.browser = navigator.userAgent;
    report.devicePixelRatio = devicePixelRatio;
    report.cssResolution = [owned.canvas.clientWidth, owned.canvas.clientHeight];
    report.internalResolution = [engine.getRenderWidth(), engine.getRenderHeight()];
    const info =
      'getInfo' in engine ? (engine as unknown as { getInfo(): unknown }).getInfo() : null;
    report.gpu = info;
    check(
      !/swiftshader|llvmpipe|software rasterizer/i.test(JSON.stringify(info)),
      'Actual hardware renderer required',
    );
    report.buildManifest = await (await fetch('/manifest')).json();
    let lost = false;
    engine.onContextLostObservable.add(() => {
      lost = true;
    });
    new HemisphericLight('sun', new Vector3(0, 1, 0), owned.scene);
    const camera = new FreeCamera('damage-camera', new Vector3(14, 12, -14), owned.scene);
    camera.setTarget(new Vector3(0, 0, 10));
    owned.scene.activeCamera = camera;
    MeshBuilder.CreateGround('ground', { width: 60, height: 80 }, owned.scene);
    const car = MeshBuilder.CreateBox(
      'vehicle',
      { width: 1.8, height: 0.8, depth: 4 },
      owned.scene,
    );
    const wallMesh = MeshBuilder.CreateBox(
      'wall',
      { width: 20, height: 2, depth: 0.5 },
      owned.scene,
    );
    wallMesh.position.set(0, 1, 3);
    const material = new StandardMaterial('availability', owned.scene);
    car.material = material;
    for (const tuning of [VEHICLE_CLASSES.sedan, VEHICLE_CLASSES.compact]) {
      const classRows: Record<string, unknown>[] = [];
      for (const impactSpeedMps of [0, 3, 12]) {
        const world = await createRapierProbe();
        const context = {
          schemaVersion: 1,
          units: 'SI',
          sessionId: '029-headed',
          worldEpoch: results.length,
        } as const;
        const damage = createVehicleDamage(context, world);
        const episodes = createCollisionEpisodes(context, world.collisionSource);
        const controller = createVehicleController(context, world, 0, { availability: damage });
        let label = 'settle',
          inputThrottle = 0,
          at = 0;
        world.addCar('car', { x: 0, y: 0.8, z: 0 }, tuning);
        const identity = world.bodyIdentity('car')!;
        damage.register(identity, tuning.massKg);
        controller.register(identity);
        if (impactSpeedMps > 0)
          world.addNamedBox('wall', { x: 0, y: 1, z: 3 }, { x: 10, y: 1, z: 0.25 });
        wallMesh.setEnabled(impactSpeedMps > 0);
        const command = (tick: number) => ({
          ...context,
          vehicleId: 'car',
          tick,
          source: 'PLAYER' as const,
          throttle: inputThrottle,
          brake: 0,
          steering: 0,
          handbrake: false,
          turnSignal: 'OFF' as const,
        });
        const loop = createFixedTickLoop({
          step(time) {
            at = time.tick;
            controller.step(
              time,
              [{ identity, command: command(time.tick) }],
              time.tick === 1 ? [{ identity, mode: 'MANUAL' }] : [],
            );
            episodes.update(at, world.readCollisionContacts().contacts);
            check(
              episodes.drain((value) => {
                damage.applyIncident(value);
              }).status === 'drained',
              'Incident admission must drain',
            );
          },
          captureSnapshot: () => ({ tick: at }),
          interpolate: (_previous, current) => current,
        });
        const row: Record<string, unknown> = {
          classId: tuning.classId,
          massKg: tuning.massKg,
          impactSpeedMps,
        };
        try {
          await owned.scene.whenReadyAsync();
          let now = await frame();
          loop.frame(now);
          const until = async (targetTick: number) => {
            while (at < targetTick) {
              now = await frame();
              check(
                document.visibilityState === 'visible' && document.hasFocus(),
                'Keep real foreground focus',
              );
              check(!lost, 'Renderer context lost');
              const step = loop.frame(now);
              check(step.state.status === 'running', 'No overload/fault tolerated');
              const state = world.project('car'),
                q = state.rotation;
              car.position.set(state.position.x, state.position.y, state.position.z);
              car.rotationQuaternion = new Quaternion(q.x, q.y, q.z, q.w);
              const availability = damage.readDamage(identity).availability;
              material.diffuseColor =
                availability === 'AVAILABLE'
                  ? new Color3(0.15, 0.75, 0.3)
                  : availability === 'DAMAGED'
                    ? new Color3(0.95, 0.65, 0.1)
                    : new Color3(0.9, 0.15, 0.1);
              owned.render();
              status.textContent = JSON.stringify(
                {
                  class: tuning.classId,
                  impactSpeedMps,
                  label,
                  tick: at,
                  availability,
                  speedMps: state.speed,
                  history: damage.getStats().historyRecords,
                },
                null,
                2,
              );
            }
          };
          await until(180);
          if (impactSpeedMps > 0) {
            label = 'actual impact';
            world.setVelocity('car', { x: 0, y: 0, z: impactSpeedMps });
            await until(300);
          }
          const availability = damage.readDamage(identity).availability;
          check(
            availability ===
              (impactSpeedMps === 0
                ? 'AVAILABLE'
                : impactSpeedMps === 3
                  ? 'DAMAGED'
                  : 'IMMOBILIZED'),
            'Measured impact must produce expected availability',
          );
          row.availability = availability;
          row.incidents = damage.readHistory();
          // Controlled test launch setup only;029 recovery does not teleport or remove obstacles.
          if (impactSpeedMps > 0) world.removeCollisionEntity(world.collisionIdentity('wall')!);
          wallMesh.setEnabled(false);
          world.setPose(identity, {
            positionM: { x: 0, y: 0.8, z: 0 },
            rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
          });
          world.setBodyVelocity(identity, { x: 0, y: 0, z: 0 });
          label = 'requested propulsion';
          inputThrottle = 1;
          const driveStart = at;
          await until(driveStart + 300);
          row.drive = world.project('car');
          row.effective = controller.readControl(identity)?.command;
          row.raw = controller.readControl(identity)?.raw;
          check(
            row.raw !== null && controller.readControl(identity)?.raw?.throttle === 1,
            'Raw request retained',
          );
          check(
            controller.readControl(identity)?.command.throttle ===
              (availability === 'AVAILABLE' ? 1 : availability === 'DAMAGED' ? 0.5 : 0),
            'Effective propulsion truthful',
          );
          if (availability === 'IMMOBILIZED') {
            check(
              Math.abs(world.project('car').position.z) < 0.1 && world.project('car').speed < 0.1,
              'Flat-ground blocked propulsion',
            );
            const history = damage.readHistory();
            damage.recover(identity, {
              context,
              operationId: `recover-${tuning.classId}`,
              tick: at,
            });
            check(
              JSON.stringify(damage.readHistory().slice(0, history.length)) ===
                JSON.stringify(history),
              'Recovery preserves incident history',
            );
            label = 'recovered driving';
            const recoveryTick = at;
            await until(recoveryTick + 300);
            check(
              world.project('car').position.z > 5 && world.project('car').speed > 2,
              'Recovery must allow actual motion',
            );
            row.recovered = world.project('car');
            row.historyAfterRecovery = damage.readHistory();
          }
          const state = loop.getState();
          row.simulation = {
            tick: at,
            simulatedSeconds: state.simulatedSeconds,
            activeRealSeconds: state.activeRealSeconds,
            overloadCount: state.overloadCount,
          };
        } finally {
          loop.dispose();
          controller.dispose();
          episodes.dispose();
          damage.dispose();
          world.dispose();
          check(
            world.bodyResources().entities === 0 &&
              world.bodyResources().subscriptions === 0 &&
              world.collisionResources().colliders === 0 &&
              damage.getStats().historyRecords === 0,
            'Zero retained owner/native resources',
          );
          row.cleanup = {
            bodies: world.bodyResources(),
            collisions: world.collisionResources(),
            damage: damage.getStats(),
            controller: controller.getStats(),
          };
        }
        classRows.push(row);
        results.push(row);
      }
      const availableDrive = classRows[0].drive as { position: { z: number }; speed: number };
      const damagedDrive = classRows[1].drive as { position: { z: number }; speed: number };
      check(
        damagedDrive.position.z > 1 &&
          damagedDrive.position.z < availableDrive.position.z &&
          damagedDrive.speed < availableDrive.speed,
        'Damage must reduce real acceleration/motion',
      );
    }
    report.passed = true;
  } catch (error) {
    report.error = String(error);
  } finally {
    backend?.dispose();
    report.completedAt = new Date().toISOString();
    const response = await fetch('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    status.textContent = JSON.stringify({ ...report, exportStatus: response.status }, null, 2);
    button.disabled = false;
  }
};

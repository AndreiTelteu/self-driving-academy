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
import { createKeyboardFilter } from '../../../src/vehicles/keyboard-filter';
import type { BodyIdentity, KeyboardFilter } from '../../../src/vehicles';
import { createDefaultSettings } from '../../../src/settings/store';
import { createControlAuthority, CONTROL_AUTHORITY_LIMITS } from '../../../src/input';
import { createFixedTickLoop } from '../../../src/simulation/fixed-tick';
import { vehicleClass } from '../../../src/vehicles/vehicle-classes';
import { referenceSeat, referenceChanges } from '../../input/control-authority-reference';

declare const __AUTHORITY_BUILD__: { sourceHash: string; commit: string; inputs: string[] };
const status = document.getElementById('status')!;
const raf = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
const plain = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;
function check(value: boolean, message: string): asserts value {
  if (!value) throw Error(message);
}
let rendering: RenderingBackend | undefined, diagnostic: unknown;
async function protocol(backend: RenderingBackend, classId: 'sedan' | 'compact', epoch: number) {
  const context = {
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId: '066-browser',
    worldEpoch: epoch,
  };
  const world = await createRapierProbe(),
    controller = createVehicleController(context, world);
  let keyboard: KeyboardFilter | null = null,
    filterIdentity: BodyIdentity | null = null,
    createdFilters = 0,
    disposedFilters = 0,
    clearCalls = 0;
  const departed = new Map<BodyIdentity, KeyboardFilter>();
  const owner = createControlAuthority(context, controller, {
    bodyIdentity: (id) => world.bodyIdentity(id),
    clearOldPlayer(identity) {
      clearCalls++;
      const old = departed.get(identity);
      check(!!old, 'Departed filter missing');
      old.clear();
      old.dispose();
      disposedFilters++;
      departed.delete(identity);
    },
  });
  const config = vehicleClass(classId),
    preferences = createDefaultSettings('066-browser').input.control;
  const meshes: ReturnType<typeof MeshBuilder.CreateBox>[] = [];
  const materials: StandardMaterial[] = [];
  try {
    for (let i = 0; i < 2; i++) {
      world.addClassCar('car-' + i, { x: i * 8, y: 0.8, z: 0 }, classId);
    }
    const ids = [world.bodyIdentity('car-0')!, world.bodyIdentity('car-1')!];
    for (const identity of ids) owner.register(identity);
    for (let i = 0; i < 2; i++) {
      const mesh = MeshBuilder.CreateBox(
        'car-' + i,
        { width: config.wheels.trackM, height: 0.6, depth: config.wheels.wheelbaseM + 1.2 },
        backend.scene,
      );
      const material = new StandardMaterial('car-' + i, backend.scene);
      material.diffuseColor = i ? new Color3(0.95, 0.6, 0.2) : new Color3(0.15, 0.55, 0.95);
      mesh.material = material;
      meshes.push(mesh);
      materials.push(material);
    }
    const initialMechanics = world.readVehicleMechanics('car-0');
    const mechanicalConfiguration = (m: typeof initialMechanics) => ({
      classId: m.classId,
      version: m.version,
      massKg: m.massKg,
      powerW: m.powerW,
      grip: m.grip,
      brakeAccelerationMps2: m.brakeAccelerationMps2,
      wheels: m.wheels,
      turningRadiusM: m.turningRadiusM,
    });
    const nativeMechanics = plain(mechanicalConfiguration(initialMechanics));
    let tick = 0,
      seat: ReturnType<typeof referenceSeat> = null,
      maximumPlayers = 0,
      ignoredAI = 0,
      ignoredOldPlayer = 0,
      maxDisplacementM = 0,
      selectedVehicleId = 'car-1';
    const modes = { AUTO: 0, MANUAL: 0, LEARNING: 0 },
      checkpoints: unknown[] = [];
    const previous = ids.map((id) => world.project(id.entityId).position);
    let suspendedUnchanged = false,
      conflictRejected = false,
      stalePacketIgnored = false,
      selectionIndependent = false;
    const loop = createFixedTickLoop({
      captureSnapshot: () => ({ tick }),
      interpolate: (_old, current) => current,
      step(time) {
        tick = time.tick;
        const nextSeat = referenceSeat(tick, ids),
          changes = referenceChanges(seat, nextSeat),
          desired = nextSeat?.identity ?? null;
        if (filterIdentity !== desired) {
          if (keyboard && filterIdentity) departed.set(filterIdentity, keyboard);
          keyboard = desired
            ? createKeyboardFilter(context, desired.entityId, preferences, tick - 1)
            : null;
          filterIdentity = desired;
          if (keyboard) createdFilters++;
        }
        if (tick === 1) {
          const before = JSON.stringify(ids.map((id) => world.project(id.entityId)));
          try {
            owner.step(
              { ...context, version: CONTROL_AUTHORITY_LIMITS.version, tick, dtSeconds: 1 / 60 },
              [],
              ids.map((identity) => ({ identity, mode: 'MANUAL' })),
            );
          } catch {
            conflictRejected = true;
          }
          check(
            conflictRejected &&
              owner.getStats().tick === 0 &&
              before === JSON.stringify(ids.map((id) => world.project(id.entityId))),
            'Conflict mutated physics',
          );
        }
        if (tick === 361) {
          const before = JSON.stringify(ids.map((id) => world.project(id.entityId)));
          owner.suspend();
          keyboard?.clear();
          let rejected = false;
          try {
            owner.step({
              ...context,
              version: CONTROL_AUTHORITY_LIMITS.version,
              tick,
              dtSeconds: 1 / 60,
            });
          } catch {
            rejected = true;
          }
          suspendedUnchanged =
            rejected &&
            owner.getStats().tick === tick - 1 &&
            before === JSON.stringify(ids.map((id) => world.project(id.entityId)));
          check(suspendedUnchanged, 'Suspend advanced physics');
          owner.resume();
        }
        let filtered: ReturnType<KeyboardFilter['step']> | null = null;
        if (keyboard && filterIdentity) {
          keyboard.setAction('throttle', tick % 120 < 80);
          keyboard.setAction('brake', tick % 120 >= 100);
          keyboard.setAction('steerRight', tick % 120 >= 30 && tick % 120 < 60);
          keyboard.setAction('steerLeft', tick % 120 >= 60 && tick % 120 < 90);
          const body = world.readBody(filterIdentity);
          filtered = keyboard.step({
            tick,
            dtSeconds: 1 / 60,
            speedMps: Math.hypot(body.velocityMps.x, body.velocityMps.y, body.velocityMps.z),
          });
        }
        const packets = ids.flatMap((identity) => {
          const ai = {
            ...context,
            vehicleId: identity.entityId,
            tick,
            source: 'AUTONOMY' as const,
            throttle: 0.35,
            brake: 0,
            steering: 0.02,
            handbrake: false,
            turnSignal: 'OFF' as const,
          };
          const player =
            nextSeat?.identity === identity
              ? filtered!.command
              : { ...ai, source: 'PLAYER' as const, throttle: 0, brake: 1 };
          return [
            { identity, command: ai },
            { identity, command: player },
          ];
        });
        const result = owner.step(
          { ...context, version: CONTROL_AUTHORITY_LIMITS.version, tick, dtSeconds: 1 / 60 },
          packets,
          changes,
        ).frame;
        const players = result.controls.filter((c) => c.mode !== 'AUTO');
        check(players.length === (nextSeat ? 1 : 0), 'Multiple PLAYER');
        maximumPlayers = Math.max(maximumPlayers, players.length);
        for (const ignored of result.ignoredCommands) {
          if (ignored.source === 'AUTONOMY') ignoredAI++;
          else ignoredOldPlayer++;
        }
        if (nextSeat) {
          check(
            result.ignoredCommands.some(
              (c) => c.vehicleId === nextSeat.identity.entityId && c.source === 'AUTONOMY',
            ),
            'AI acted takeover tick',
          );
          check(players[0].identity === nextSeat.identity, 'Seat retargeted');
        }
        if (tick === 61) {
          stalePacketIgnored = result.ignoredCommands.some(
            (c) => c.vehicleId === 'car-0' && c.source === 'PLAYER',
          );
          check(stalePacketIgnored, 'Old PLAYER acted after handoff');
        }
        // Selection is an independent fixture camera value, never an authority request.
        selectedVehicleId = tick % 2 ? 'car-0' : 'car-1';
        if (tick === 1) {
          selectionIndependent = owner.getStats().seat === null && selectedVehicleId === 'car-0';
          check(selectionIndependent, 'Selection became authority');
        }
        for (const [i, id] of ids.entries()) {
          const state = world.project(id.entityId),
            d = Math.hypot(
              state.position.x - previous[i].x,
              state.position.y - previous[i].y,
              state.position.z - previous[i].z,
            );
          check(d < 0.7, 'Physical discontinuity');
          maxDisplacementM = Math.max(maxDisplacementM, d);
          previous[i] = { ...state.position };
        }
        seat = nextSeat;
        modes[seat?.mode ?? 'AUTO']++;
        if (tick % 60 === 0)
          checkpoints.push({
            tick,
            seat: plain(owner.getStats().seat),
            raw: plain(filtered?.raw ?? null),
            controls: plain(result.controls),
            physical: plain(ids.map((id) => world.project(id.entityId))),
          });
      },
    });
    const start = performance.now();
    let maxRafGapMs = 0,
      previousRaf = 0;
    try {
      backend.canvas.focus();
      await backend.scene.whenReadyAsync();
      for (let i = 0; i < 30; i++) {
        check(document.hasFocus() && !document.hidden, 'Lost foreground in warmup');
        await raf();
        backend.render();
      }
      previousRaf = await raf();
      loop.frame(previousRaf);
      while (tick < 720) {
        check(document.hasFocus() && !document.hidden, 'Lost foreground');
        const now = await raf(),
          gap = now - previousRaf;
        previousRaf = now;
        maxRafGapMs = Math.max(maxRafGapMs, gap);
        loop.frame(now);
        diagnostic = {
          classId,
          tick,
          gapMs: gap,
          maxRafGapMs,
          state: plain(loop.getState()),
          seat: plain(owner.getStats().seat),
        };
        check(
          loop.getState().overloadCount === 0 && loop.getState().fault === null,
          'Fixed tick overload/fault',
        );
        for (const [i, id] of ids.entries()) {
          const state = world.project(id.entityId),
            q = state.rotation;
          meshes[i].position.copyFromFloats(state.position.x, state.position.y, state.position.z);
          meshes[i].rotationQuaternion = new Quaternion(q.x, q.y, q.z, q.w);
        }
        status.textContent =
          classId +
          ' tick ' +
          tick +
          ' modes ' +
          JSON.stringify(modes) +
          ' seat ' +
          JSON.stringify(owner.getStats().seat);
        backend.render();
      }
      check(
        modes.AUTO > 0 &&
          modes.MANUAL > 0 &&
          modes.LEARNING > 0 &&
          maximumPlayers === 1 &&
          ignoredAI > 0 &&
          clearCalls > 0,
        'Missing mode coverage',
      );
      check(
        suspendedUnchanged && conflictRejected && stalePacketIgnored && selectionIndependent,
        'Missing adversarial coverage',
      );
      const finalMechanics = world.readVehicleMechanics('car-0');
      diagnostic = {
        ...(diagnostic as Record<string, unknown>),
        initialMechanics: plain(initialMechanics),
        finalMechanics: plain(finalMechanics),
      };
      check(
        JSON.stringify(nativeMechanics) ===
          JSON.stringify(plain(mechanicalConfiguration(world.readVehicleMechanics('car-0')))),
        'Mechanics changed',
      );
      return {
        classId,
        ticks: tick,
        modes,
        maximumPlayers,
        ignoredAI,
        ignoredOldPlayer,
        clearCalls,
        createdFilters,
        disposedFiltersBeforeCleanup: disposedFilters,
        maxDisplacementM,
        maxRafGapMs,
        elapsedWallMs: performance.now() - start,
        conflictRejected,
        suspendedUnchanged,
        stalePacketIgnored,
        selectionIndependent,
        drivingPoseWrites: 0,
        drivingVelocityWrites: 0,
        overloadCount: loop.getState().overloadCount,
        mechanics: nativeMechanics,
        initialMechanics: plain(initialMechanics),
        finalMechanics: plain(finalMechanics),
        checkpoints,
      };
    } finally {
      loop.dispose();
    }
  } finally {
    const remainingKeyboard = keyboard as KeyboardFilter | null;
    remainingKeyboard?.clear();
    remainingKeyboard?.dispose();
    for (const old of departed.values()) old.dispose();
    departed.clear();
    owner.dispose();
    controller.dispose();
    world.dispose();
    check(
      owner.getStats().vehicles === 0 &&
        owner.getStats().players === 0 &&
        controller.getStats().vehicles === 0 &&
        world.bodyResources().entities === 0,
      'Owned cleanup failed',
    );
    for (const mesh of meshes) mesh.dispose();
    for (const material of materials) material.dispose();
  }
}
document.getElementById('run')!.addEventListener('click', async () => {
  const button = document.getElementById('run') as HTMLButtonElement;
  button.disabled = true;
  diagnostic = null;
  try {
    rendering?.dispose();
    rendering = await createRenderingBackend(
      document.getElementById('canvas') as HTMLCanvasElement,
      (document.getElementById('backend') as HTMLSelectElement).value as 'AUTO' | 'WEBGL2',
    );
    const canvas = rendering.canvas;
    canvas.focus();
    const engine = rendering.scene.getEngine();
    engine.setHardwareScalingLevel(1);
    rendering.resize();
    engine.setSize(1920, 1080);
    check(
      devicePixelRatio === 1 && canvas.clientWidth === 1920 && canvas.clientHeight === 1080,
      'Resolution mismatch',
    );
    new HemisphericLight('light', new Vector3(0, 1, 0), rendering.scene);
    const camera = new FreeCamera('camera', new Vector3(16, 30, -25), rendering.scene);
    camera.setTarget(new Vector3(4, 0, 12));
    rendering.scene.activeCamera = camera;
    MeshBuilder.CreateGround('ground', { width: 120, height: 120 }, rendering.scene);
    const arms = [];
    for (const [epoch, classId] of (['sedan', 'compact'] as const).entries())
      arms.push(await protocol(rendering, classId, epoch));
    const manifest = (await (await fetch('/build-manifest.json')).json()) as {
      artifactHash: string;
    };
    const report = {
      fixtureVersion: '066-authority-drive-v1',
      identity: __AUTHORITY_BUILD__,
      artifactHash: manifest.artifactHash,
      createdAt: new Date().toISOString(),
      browser: navigator.userAgent,
      renderer: rendering.rendererKind,
      actualGpuInfo:
        'getInfo' in engine ? (engine as unknown as { getInfo(): unknown }).getInfo() : null,
      foreground: document.hasFocus() && !document.hidden,
      cssResolution: [canvas.clientWidth, canvas.clientHeight],
      internalResolution: [engine.getRenderWidth(), engine.getRenderHeight()],
      dpr: devicePixelRatio,
      arms,
      guards: CONTROL_AUTHORITY_LIMITS,
      scope:
        'Visible physical066/024/025 scripted authority timeline, same-body mode/handoff/concurrent source/selection/rejection/suspend. No trusted keyboard events, learning queue, fleetFPS/fullgame/laptop claim.',
    };
    const response = await fetch('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    check(response.ok, await response.text());
    status.textContent =
      'PASS ' + rendering.rendererKind + ': sedan/compact authority timelines. Evidence saved.';
  } catch (error) {
    status.textContent = 'FAILED: ' + String(error);
    console.error(error);
    await fetch('/failure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fixtureVersion: '066-authority-drive-v1',
        identity: __AUTHORITY_BUILD__,
        createdAt: new Date().toISOString(),
        error: String(error),
        diagnostic,
        browser: navigator.userAgent,
        foreground: document.hasFocus() && !document.hidden,
      }),
    });
  } finally {
    button.disabled = false;
  }
});

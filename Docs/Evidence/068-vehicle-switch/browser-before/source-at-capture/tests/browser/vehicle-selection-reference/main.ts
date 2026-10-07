import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { createRenderingBackend, type RenderingBackend } from '../../../src/rendering/babylon';
import { BabylonVehicleCamera } from '../../../src/rendering/babylon/vehicle-camera';
import { BabylonVehiclePicker } from '../../../src/rendering/babylon/vehicle-picking';
import { VehiclePickingRegistry } from '../../../src/rendering/babylon/vehicle-picking-registry';
import { createRapierProbe } from '../../../src/vehicles/rapier';
import { createVehicleController } from '../../../src/vehicles/controller';
import { createKeyboardFilter } from '../../../src/vehicles/keyboard-filter';
import { vehicleClass } from '../../../src/vehicles/vehicle-classes';
import { createDefaultSettings } from '../../../src/settings/store';
import { createControlAuthority } from '../../../src/input/control-authority';
import { createModeControls } from '../../../src/input/mode-controls';
import { createFixedTickLoop } from '../../../src/simulation/fixed-tick';
import { parseRide } from '../../../src/fleet/contracts';
import {
  createFixtureSegmentStore,
  referenceSelectionPhase,
  referenceSelectionAdmission,
} from '../../input/vehicle-selection-reference';
import {
  browserScope,
  browserWorld,
  check,
  snapshot,
  unchanged,
  distribution,
  immutableMechanics,
  digest,
} from './proof';
declare const __SELECTION_REFERENCE_BUILD__: {
  sourceHash: string;
  commit: string;
  inputs: string[];
};
const status = document.getElementById('status')!;
const raf = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
const plain = <T>(value: T): T => structuredClone(value);
let firstWorldAt: string | null = null,
  worldsCreated = 0,
  diagnostic: unknown = null;
let surfaceInvalidation: string | null = null;
function surface(backend: RenderingBackend) {
  const engine = backend.scene.getEngine();
  check(
    surfaceInvalidation === null && document.hasFocus() && !document.hidden,
    'Foreground/context invalidated: ' + surfaceInvalidation,
  );
  check(
    devicePixelRatio === 1 &&
      backend.canvas.clientWidth === 1920 &&
      backend.canvas.clientHeight === 1080 &&
      engine.getRenderWidth() === 1920 &&
      engine.getRenderHeight() === 1080,
    'Per-RAF CSS/internal/DPR changed',
  );
}
const context = (epoch: number) => ({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: '068-browser-before',
  worldEpoch: epoch,
});
const command = (
  c: ReturnType<typeof context>,
  id: string,
  tick: number,
  source: 'PLAYER' | 'AUTONOMY',
  values: { throttle: number; brake: number; steering: number; handbrake: boolean },
) => ({ ...c, vehicleId: id, tick, source, turnSignal: 'OFF' as const, ...values });
const prefs = { mode: 'CHASE' as const, fovDegrees: 75, motion: 50, distanceM: 6 };
async function host(
  backend: RenderingBackend,
  classId: 'sedan' | 'compact',
  epoch: number,
  scope: ReturnType<typeof browserScope>,
  guardCase = false,
) {
  firstWorldAt ??= new Date().toISOString();
  const raw = await createRapierProbe();
  worldsCreated++;
  let g: ReturnType<typeof browserWorld> | null = null;
  scope.own('world', () => {
    if (g) g.guard.phase = 'CLEANUP';
    raw.dispose();
  });
  scope.inspect('body', () => raw.bodyResources());
  scope.inspect('collision', () => raw.collisionResources());
  g = browserWorld(raw);
  const { world, guard } = g,
    c = context(epoch);
  const positions = guardCase
    ? [
        { x: 0, y: 0.8, z: 0 },
        { x: 2.5, y: 0.8, z: 6 },
      ]
    : [
        { x: 0, y: 0.8, z: 0 },
        { x: 8, y: 0.8, z: 0 },
      ];
  positions.forEach((position, i) => world.addClassCar('car-' + i, position, classId));
  const ids = [world.bodyIdentity('car-0')!, world.bodyIdentity('car-1')!];
  const controller = createVehicleController(c, world);
  scope.own(
    'controller',
    () => controller.dispose(),
    () => controller.getStats(),
  );
  const keyboard = createKeyboardFilter(
    c,
    'car-0',
    createDefaultSettings('068-browser').input.control,
    0,
  );
  scope.own(
    'keyboard',
    () => keyboard.dispose(),
    () => keyboard.getStats(),
  );
  let clearCalls = 0,
    selected = ids[0]!;
  const authority = createControlAuthority(c, controller, {
    bodyIdentity: (id) => world.bodyIdentity(id),
    clearOldPlayer(identity) {
      check(identity === ids[0], 'Departed identity');
      keyboard.clear();
      clearCalls++;
    },
  });
  scope.own(
    'authority',
    () => authority.dispose(),
    () => authority.getStats(),
  );
  ids.forEach((id) => authority.register(id));
  const modes = createModeControls(c, {
    readAuthority: () => authority.getStats(),
    selectedIdentity: () => selected,
    bodyIdentity: (id) => world.bodyIdentity(id),
  });
  scope.own(
    'mode',
    () => modes.dispose(),
    () => modes.getStats(),
  );
  const segments = createFixtureSegmentStore(c);
  scope.own(
    'segment',
    () => segments.dispose(),
    () => segments.getStats(),
  );
  const meshes: ReturnType<typeof MeshBuilder.CreateBox>[] = [];
  const config = vehicleClass(classId);
  for (let i = 0; i < 2; i++) {
    const mesh = MeshBuilder.CreateBox(
      'car-' + i,
      { width: config.wheels.trackM, height: 0.6, depth: config.wheels.wheelbaseM + 1.2 },
      backend.scene,
    );
    scope.own(
      'mesh-' + i,
      () => mesh.dispose(),
      () => ({ disposed: mesh.isDisposed() }),
    );
    meshes.push(mesh);
    const material = new StandardMaterial('vehicle-material-' + i, backend.scene);
    scope.own(
      'material-' + i,
      () => material.dispose(),
      () => ({ disposed: !backend.scene.materials.includes(material) }),
    );
    material.diffuseColor = i ? new Color3(0.9, 0.6, 0.2) : new Color3(0.15, 0.55, 0.95);
    mesh.material = material;
  }
  const camera = new BabylonVehicleCamera({
    scene: backend.scene,
    preferences: prefs,
    obstacles: () => [],
    exterior: (id) => [meshes[ids.findIndex((v) => v.entityId === id)]!],
  });
  scope.own(
    'camera',
    () => {
      camera.select(null);
      camera.dispose();
    },
    () => ({ disposed: camera.camera.isDisposed(), selected: camera.controller.selectedEntityId }),
  );
  camera.select(selected.entityId);
  const registry = new VehiclePickingRegistry(backend.scene, { maxBindings: 2 });
  scope.own(
    'registry',
    () => registry.dispose(),
    () => ({ bindings: registry.size }),
  );
  meshes.forEach((mesh, i) => registry.register(mesh, ids[i]!.entityId));
  const picker = new BabylonVehiclePicker(backend.scene, registry);
  scope.own('picker', () => picker.dispose());
  const kinds: readonly ('TAXI' | 'CIVIL')[] = guardCase ? ['TAXI', 'CIVIL'] : ['TAXI', 'TAXI'];
  const assignments = ids.map((id, i) => ({
    ...c,
    vehicleId: id.entityId,
    kind: kinds[i],
    routeLaneIds: ['fixture-authored-lane'],
    trip:
      kinds[i] === 'TAXI'
        ? parseRide({
            ...c,
            rideId: 'ride-' + id.entityId,
            taxiId: id.entityId,
            pickupId: 'pickup',
            dropoffId: 'dropoff',
            routeLaneIds: ['fixture-authored-lane'],
            eventIds: [],
            status: 'TO_DROPOFF',
            createdTick: 0,
            assignedTick: 0,
            completedTick: null,
            failureReason: null,
          })
        : null,
  }));
  function kind(id: typeof selected) {
    const i = ids.indexOf(id);
    check(
      i >= 0 && world.bodyIdentity(id.entityId) === id,
      'Kind requires exact current host token',
    );
    return kinds[i]!;
  }
  const assignmentText = JSON.stringify(assignments);
  const target = () => {
    const state = world.project(selected.entityId);
    return {
      entityId: selected.entityId,
      incarnation: String(selected.generation),
      transform: { positionM: state.position, rotationQuaternion: state.rotation },
      speedMps: state.speed,
      driverEyeM: { x: 0, y: 1, z: 0.2 },
    };
  };
  function present() {
    ids.forEach((id, i) => {
      const s = world.project(id.entityId);
      meshes[i]!.position.set(s.position.x, s.position.y, s.position.z);
      meshes[i]!.rotationQuaternion = new Quaternion(
        s.rotation.x,
        s.rotation.y,
        s.rotation.z,
        s.rotation.w,
      );
      meshes[i]!.computeWorldMatrix(true);
    });
    camera.update(target(), 1 / 60);
  }
  function select(id: typeof selected) {
    selected = id;
    camera.select(id.entityId);
  }
  function exactClose(
    tick: number,
    old: NonNullable<ReturnType<typeof authority.getStats>['seat']>,
  ) {
    const b = segments.read();
    check(
      b?.identity === old.identity &&
        b.segment.completeness === 'OPEN' &&
        b.segment.controlMode === old.mode &&
        b.segment.sessionId === c.sessionId &&
        b.segment.worldEpoch === c.worldEpoch,
      'Required segment boundary',
    );
    segments.close(old.identity, tick);
    const closed = segments.read();
    check(
      closed?.identity === old.identity &&
        closed.segment.completeness === 'CLOSED' &&
        closed.segment.endTick === tick &&
        closed.segment.closeReason === 'VEHICLE_SWITCH',
      'Actual close readback',
    );
  }
  function settleSelection(
    tick: number,
    id: typeof selected,
    old: ReturnType<typeof authority.getStats>['seat'],
    source: 'WORLD' | 'FLEET' = 'FLEET',
  ) {
    check(
      referenceSelectionAdmission(
        world.bodyIdentity(id.entityId),
        id,
        source,
        kind(id),
        meshes[ids.indexOf(id)]!.isVisible,
        meshes[ids.indexOf(id)]!.isEnabled(),
      ),
      'Actual host selection admission',
    );
    const serial = world.collisionStepSerial(),
      before = snapshot(world, ids),
      segmentBefore = plain(segments.read()),
      assignmentBefore = JSON.stringify(assignments);
    guard.phase = 'SETTLEMENT';
    modes.clear();
    if (old) exactClose(tick, old);
    select(id);
    present();
    const after = unchanged(world, ids, before, serial);
    guard.phase = 'DRIVING';
    check(JSON.stringify(assignments) === assignmentText, 'Assignment changed');
    check(authority.getStats().seat === null, 'Selection claimed PLAYER');
    return {
      tick,
      serial,
      serialAfter: world.collisionStepSerial(),
      context: plain(c),
      selectedIdentity: plain(id),
      selectionSource: source,
      selectedKind: kind(id),
      cameraSelected: camera.controller.selectedEntityId,
      oldSeat: plain(old),
      segmentBefore,
      segmentAfter: plain(segments.read()),
      authority: plain(authority.getStats()),
      assignmentBefore,
      assignmentAfter: JSON.stringify(assignments),
      selected: id.entityId,
      before: before.map((v) => v.body),
      after: after.map((v) => v.body),
      assignmentText,
    };
  }
  present();
  guard.phase = 'DRIVING';
  return {
    world,
    guard,
    c,
    ids,
    controller,
    keyboard,
    authority,
    modes,
    segments,
    camera,
    registry,
    picker,
    meshes,
    assignments,
    kinds,
    kind,
    assignmentText,
    target,
    present,
    select,
    settleSelection,
    clearCalls: () => clearCalls,
    selected: () => selected,
  };
}
function cleanup(
  scope: ReturnType<typeof browserScope>,
  primary: unknown,
  result: Record<string, unknown> | null,
) {
  const c = scope.close();
  if (result) result.cleanup = c;
  else diagnostic = { previous: diagnostic, cleanup: c };
  const errors = [
    ...(primary ? [primary] : []),
    ...c.errors.map((e) => Error(e.resource + ': ' + e.message)),
  ];
  if (errors.length)
    throw new AggregateError(errors, 'Protocol/callback cleanup failures preserved');
  const s = c.snapshots as {
    body: { entities: number; subscriptions: number };
    collision: { colliders: number };
    controller: {
      vehicles: number;
      targets: number;
      projections: number;
      players: number;
      disposed: boolean;
    };
    authority: { vehicles: number; players: number };
    keyboard: { heldKeys: number; pendingPreferences: boolean; disposed: boolean };
    mode: { intents: number; inFlight: number; projection: unknown };
    segment: { retainedSegments: number };
    registry: { bindings: number };
    camera: { disposed: boolean; selected: unknown };
  };
  check(
    s.body.entities === 0 &&
      s.body.subscriptions === 0 &&
      s.collision.colliders === 0 &&
      s.controller.vehicles === 0 &&
      s.controller.targets === 0 &&
      s.controller.projections === 0 &&
      s.controller.players === 0 &&
      s.controller.disposed &&
      s.authority.vehicles === 0 &&
      s.authority.players === 0 &&
      s.keyboard.heldKeys === 0 &&
      !s.keyboard.pendingPreferences &&
      s.keyboard.disposed &&
      s.mode.intents === 0 &&
      s.mode.inFlight === 0 &&
      s.mode.projection === null &&
      s.segment.retainedSegments === 0 &&
      s.registry.bindings === 0 &&
      s.camera.disposed &&
      s.camera.selected === null,
    'Actual owned cleanup failed',
  );
}
async function protocol(
  backend: RenderingBackend,
  classId: 'sedan' | 'compact',
  epoch: number,
  observer: boolean | null,
) {
  const scope = browserScope();
  let result: Record<string, unknown> | null = null,
    primary: unknown = null;
  try {
    const h = await host(backend, classId, epoch, scope),
      initialMechanics = h.ids.map((id) => plain(h.world.readVehicleMechanics(id.entityId)));
    let maximumPlayers = 0,
      tick = 0,
      frames = 0,
      maxSpeedMps = 0,
      maxDisplacementM = 0,
      lastHud = -Infinity,
      hudWrites = 0,
      packetText = '',
      nativeText = '',
      controlText = '';
    const modes = { AUTO: 0, MANUAL: 0, LEARNING: 0 },
      proofs: unknown[] = [],
      modeProofs: unknown[] = [],
      checkpoints: unknown[] = [];
    const prior = h.ids.map((id) => h.world.project(id.entityId).position);
    const loop = createFixedTickLoop({
      captureSnapshot: () => ({ tick }),
      interpolate: (_a, b) => b,
      step(time) {
        tick = time.tick;
        check(tick <= 2400, 'Physical tick cap');
        const phase = referenceSelectionPhase(tick);
        let ticket: ReturnType<typeof h.modes.prepare> | null = null,
          requests: Parameters<typeof h.authority.step>[2] = [],
          old = h.authority.getStats().seat;
        if (phase.claim && phase.mode !== 'AUTO') {
          check(
            h.modes.enqueue(phase.mode === 'MANUAL' ? 'M' : 'L'),
            'Explicit mode intent rejected',
          );
          ticket = h.modes.prepare({
            ...h.c,
            version: '067-mode-controls-v1',
            tick,
            dtSeconds: 1 / 60,
          });
          requests = ticket.requests;
        }
        if (phase.depart) {
          h.modes.clear();
          old = h.authority.getStats().seat;
          requests = old ? [{ identity: old.identity, mode: 'AUTO' }] : [];
        }
        h.keyboard.setAction('throttle', tick % 120 < 80);
        h.keyboard.setAction('brake', tick % 120 >= 100);
        h.keyboard.setAction('steerRight', tick % 120 >= 30 && tick % 120 < 60);
        h.keyboard.setAction('steerLeft', tick % 120 >= 60 && tick % 120 < 90);
        const b = h.world.readBody(h.ids[0]!),
          filtered = h.keyboard.step({
            tick,
            dtSeconds: 1 / 60,
            speedMps: Math.hypot(b.velocityMps.x, b.velocityMps.y, b.velocityMps.z),
          }),
          v = {
            throttle: filtered.command.throttle,
            brake: filtered.command.brake,
            steering: filtered.command.steering,
            handbrake: filtered.command.handbrake,
          };
        const packets = h.ids.flatMap((identity) =>
          ['AUTONOMY', 'PLAYER'].map((source) => ({
            identity,
            command: command(h.c, identity.entityId, tick, source as 'AUTONOMY' | 'PLAYER', v),
          })),
        );
        packetText += JSON.stringify(packets) + '\n';
        check(packetText.length <= 16 * 1024 * 1024, 'Packet trace bound');
        const frame = h.authority.step(
          { ...h.c, version: '066-control-authority-v1', tick, dtSeconds: 1 / 60 },
          packets,
          requests,
        ).frame;
        controlText += JSON.stringify(frame.controls) + '\n';
        check(controlText.length <= 16 * 1024 * 1024, 'Actual control trace cap');
        nativeText += JSON.stringify(h.guard.nativeInputs) + '\n';
        check(nativeText.length <= 4 * 1024 * 1024, 'Native input trace bound');
        if (ticket) {
          const serial = h.world.collisionStepSerial(),
            before = snapshot(h.world, h.ids);
          h.guard.phase = 'SETTLEMENT';
          check(h.modes.settle(ticket) === 'ACCEPTED', 'Mode ticket not accepted');
          const seat = h.authority.getStats().seat;
          check(seat, 'Claim missing');
          h.segments.open(seat.identity, seat.mode, tick);
          h.present();
          const after = unchanged(h.world, h.ids, before, serial);
          modeProofs.push({
            tick,
            serial,
            serialAfter: h.world.collisionStepSerial(),
            context: plain(h.c),
            identity: plain(seat.identity),
            mode: seat.mode,
            before: before.map((v) => v.body),
            after: after.map((v) => v.body),
            segment: plain(h.segments.read()),
            authority: plain(h.authority.getStats()),
          });
          check(modeProofs.length <= 40, 'Mode proof cap');
          h.guard.phase = 'DRIVING';
        }
        if (phase.depart) proofs.push(h.settleSelection(tick, h.ids[1]!, old));
        if (phase.returnCamera) proofs.push(h.settleSelection(tick, h.ids[0]!, null));
        check(proofs.length <= 80, 'Selection proof bound');
        h.ids.forEach((identity, i) => {
          const s = h.world.project(identity.entityId);
          check(
            [
              ...Object.values(s.position),
              ...Object.values(s.rotation),
              ...Object.values(s.velocity),
              s.speed,
            ].every(Number.isFinite),
            'Native finite state',
          );
          maxSpeedMps = Math.max(maxSpeedMps, s.speed);
          maxDisplacementM = Math.max(
            maxDisplacementM,
            Math.hypot(
              s.position.x - prior[i]!.x,
              s.position.y - prior[i]!.y,
              s.position.z - prior[i]!.z,
            ),
          );
          prior[i] = { ...s.position };
        });
        const actual = h.authority.getStats();
        check(actual.players <= 1, 'Multiple PLAYER');
        maximumPlayers = Math.max(maximumPlayers, actual.players);
        modes[actual.seat?.mode ?? 'AUTO']++;
        check(h.modes.observe().tick === tick, 'HUD acceptedtick');
        if (tick % 60 === 0)
          checkpoints.push({
            tick,
            physical: h.ids.map((id) => plain(h.world.project(id.entityId))),
            context: plain(h.c),
            packets: plain(packets),
            bodies: plain(snapshot(h.world, h.ids).map((v) => v.body)),
            controls: plain(frame.controls),
            nativeInputs: plain(h.guard.nativeInputs),
            seat: plain(actual.seat),
            selected: h.selected().entityId,
            segment: plain(h.segments.read()),
          });
        check(checkpoints.length <= 40, 'Checkpoint cap');
      },
    });
    scope.own('loop', () => loop.dispose());
    backend.canvas.focus();
    await backend.scene.whenReadyAsync();
    for (let i = 0; i < 30; i++) {
      check(document.hasFocus() && !document.hidden, 'Lost foreground warmup');
      await raf();
      surface(backend);
      h.present();
      backend.render();
    }
    const frameSamples: number[] = [],
      workSamples: number[] = [],
      uiSamples: number[] = [];
    let previous = await raf(),
      maxRafGapMs = 0;
    surface(backend);
    loop.frame(previous);
    const started = performance.now();
    while (observer === null ? tick < 720 : frames < 600) {
      check(document.hasFocus() && !document.hidden, 'Lost foreground');
      const now = await raf(),
        gap = now - previous;
      surface(backend);
      previous = now;
      maxRafGapMs = Math.max(maxRafGapMs, gap);
      const began = performance.now();
      loop.frame(now);
      diagnostic = {
        classId,
        observer,
        tick,
        frames,
        gap,
        maxRafGapMs,
        loop: plain(loop.getState()),
      };
      check(
        loop.getState().overloadCount === 0 && !loop.getState().fault,
        'Fixed tick overload/fault',
      );
      h.present();
      const ui = performance.now();
      if (now - lastHud >= 100) {
        document.getElementById('selected')!.textContent = 'Cameră: ' + h.selected().entityId;
        const s = h.authority.getStats();
        document.getElementById('seat')!.textContent =
          'PLAYER: ' + (s.seat ? s.seat.identity.entityId + ' ' + s.seat.mode : '— AUTO');
        document.getElementById('boundary')!.textContent =
          'Segment: ' + (h.segments.read()?.segment.completeness ?? '—');
        lastHud = now;
        hudWrites++;
      }
      const uiCost = performance.now() - ui;
      backend.render();
      if (observer !== null) {
        frameSamples.push(gap);
        if (observer) {
          workSamples.push(performance.now() - began);
          uiSamples.push(uiCost);
        }
        frames++;
      }
    }
    for (const value of Object.values(h.guard.drivingCalls))
      check(value === 0, 'Native driving mutation');
    check(h.guard.selectionStepAttempts === 0, 'Selection native step');
    const finalMechanics = h.ids.map((id) => plain(h.world.readVehicleMechanics(id.entityId)));
    check(
      JSON.stringify(initialMechanics.map(immutableMechanics)) ===
        JSON.stringify(finalMechanics.map(immutableMechanics)),
      'Immutable mechanics changed',
    );
    result = {
      classId,
      observer,
      ticks: tick,
      frames,
      warmupFrames: 30,
      modes,
      maximumPlayers,
      clearCalls: h.clearCalls(),
      context: plain(h.c),
      identities: plain(h.ids),
      kinds: h.kinds,
      selectionProofs: proofs,
      modeSettlementProofs: modeProofs,
      checkpoints,
      rawControlsJsonl: controlText,
      controlDigest: await digest(controlText),
      rawPacketsJsonl: packetText,
      rawNativeInputsJsonl: nativeText,
      packetDigest: await digest(packetText),
      nativeInputDigest: await digest(nativeText),
      maxSpeedMps,
      maxDisplacementM,
      maxRafGapMs,
      elapsedWallMs: performance.now() - started,
      initialMechanics,
      finalMechanics,
      assignmentText: h.assignmentText,
      assignmentDigest: await digest(h.assignmentText),
      owned: {
        controller: h.controller.getStats(),
        authority: h.authority.getStats(),
        keyboard: h.keyboard.getStats(),
        mode: h.modes.getStats(),
        segment: h.segments.getStats(),
        registry: h.registry.size,
        guard: plain(h.guard),
      },
      rawTimings:
        observer === null
          ? null
          : {
              frameMs: frameSamples,
              workMs: observer ? workSamples : null,
              uiMs: observer ? uiSamples : null,
            },
      frameMs: observer === null ? null : distribution(frameSamples),
      workMs: observer ? distribution(workSamples) : null,
      uiMs: observer ? distribution(uiSamples) : null,
      sampleBytes: observer === null ? 0 : 600 * (observer ? 3 : 1) * 8,
      hudNodes: 4,
      hudListeners: 0,
      hudWrites,
      overloadCount: loop.getState().overloadCount,
      scope:
        'Two-body actual physical fixture, pure scripted claims/list selections;not fleetFPS/trusted keyboard',
    };
  } catch (error) {
    primary = error;
    diagnostic = { previous: diagnostic, error: String(error) };
  }
  cleanup(scope, primary, result);
  check(result, 'Protocol result missing');
  return result;
}
async function selectionCases(
  backend: RenderingBackend,
  classId: 'sedan' | 'compact',
  epoch: number,
) {
  const scope = browserScope();
  let result: Record<string, unknown> | null = null,
    primary: unknown = null;
  try {
    const h = await host(backend, classId, epoch, scope, true),
      proofs: unknown[] = [],
      events: unknown[] = [],
      pauses: unknown[] = [],
      modeProofs: unknown[] = [];
    let tick = 0;
    h.camera.setPreferences({ ...prefs, mode: 'FIRST_PERSON' });
    h.present();
    await backend.scene.whenReadyAsync();
    for (let i = 0; i < 30; i++) {
      check(document.hasFocus() && !document.hidden, 'Guard foreground');
      await raf();
      surface(backend);
      backend.render();
    }
    function point(i: number) {
      h.meshes[i]!.computeWorldMatrix(true);
      const p = Vector3.Project(
        h.meshes[i]!.getAbsolutePosition(),
        Matrix.Identity(),
        backend.scene.getTransformMatrix(),
        h.camera.camera.viewport.toGlobal(1920, 1080),
      );
      return p;
    }
    const p = point(1);
    check(p.x >= 0 && p.x < 1920 && p.y >= 0 && p.y < 1080, 'WORLD target not visible');
    const intent = h.picker.pick(p.x, p.y);
    check(intent?.entityId === 'car-1', 'Actual018 nearest body');
    h.meshes[1]!.isVisible = false;
    const hiddenPick = h.picker.pick(p.x, p.y);
    check(hiddenPick?.entityId !== 'car-1', 'Invisible body picked');
    h.meshes[1]!.isVisible = true;
    h.meshes[1]!.setEnabled(false);
    const disabledPick = h.picker.pick(p.x, p.y);
    check(disabledPick?.entityId !== 'car-1', 'Disabled body picked');
    h.meshes[1]!.setEnabled(true);
    const occluder = MeshBuilder.CreateBox('occluder', { size: 2 }, backend.scene);
    scope.own(
      'occluder',
      () => occluder.dispose(),
      () => ({ disposed: occluder.isDisposed() }),
    );
    occluder.position.copyFrom(h.camera.camera.position.add(h.meshes[1]!.position).scale(0.5));
    occluder.computeWorldMatrix(true);
    backend.render();
    const occludedPick = h.picker.pick(p.x, p.y);
    check(occludedPick === null, 'Nearest decor failed to occlude');
    occluder.setEnabled(false);
    check(
      !referenceSelectionAdmission(h.ids[1], h.ids[1], 'FLEET', h.kind(h.ids[1]!), true, true),
      'Civil fleet selection admitted',
    );
    function step(mode: 'AUTO' | 'MANUAL' | 'LEARNING', target: 0 | 1) {
      const old = h.authority.getStats().seat;
      let worldPick: unknown = null;
      if (mode === 'AUTO' && target === 1) {
        h.present();
        backend.render();
        const screen = point(1),
          intent = h.picker.pick(screen.x, screen.y);
        check(intent?.entityId === h.ids[1]!.entityId, 'Actual WORLD transition ray required');
        worldPick = {
          point: plain(screen),
          intent: plain(intent),
          identity: plain(h.world.bodyIdentity(intent.entityId)),
        };
      }
      let ticket: ReturnType<typeof h.modes.prepare> | null = null;
      tick++;
      let requests: Parameters<typeof h.authority.step>[2] = [];
      if (mode !== 'AUTO') {
        h.select(h.ids[0]!);
        check(h.modes.enqueue(mode === 'MANUAL' ? 'M' : 'L'), 'Guard explicitclaim');
        ticket = h.modes.prepare({
          ...h.c,
          version: '067-mode-controls-v1',
          tick,
          dtSeconds: 1 / 60,
        });
        requests = ticket.requests;
      } else requests = old ? [{ identity: old.identity, mode: 'AUTO' }] : [];
      const frame = h.authority.step(
        { ...h.c, version: '066-control-authority-v1', tick, dtSeconds: 1 / 60 },
        [],
        requests,
      ).frame;
      if (ticket) {
        const serial = h.world.collisionStepSerial(),
          before = snapshot(h.world, h.ids);
        h.guard.phase = 'SETTLEMENT';
        check(h.modes.settle(ticket) === 'ACCEPTED', 'Guard settle');
        const seat = h.authority.getStats().seat;
        check(seat, 'Guard seat');
        h.segments.open(seat.identity, seat.mode, tick);
        const after = unchanged(h.world, h.ids, before, serial);
        modeProofs.push({
          tick,
          serial,
          serialAfter: h.world.collisionStepSerial(),
          context: plain(h.c),
          identity: plain(seat.identity),
          mode: seat.mode,
          before: before.map((v) => v.body),
          after: after.map((v) => v.body),
          segment: plain(h.segments.read()),
          authority: plain(h.authority.getStats()),
        });
        h.guard.phase = 'DRIVING';
      } else
        proofs.push(h.settleSelection(tick, h.ids[target]!, old, target === 1 ? 'WORLD' : 'FLEET'));
      events.push({
        tick,
        mode,
        worldPick,
        selected: h.selected().entityId,
        seat: plain(h.authority.getStats().seat),
        segment: plain(h.segments.read()),
        context: plain(h.c),
        bodies: plain(snapshot(h.world, h.ids).map((v) => v.body)),
        controls: plain(frame.controls),
        nativeInputs: plain(h.guard.nativeInputs),
      });
    }
    step('AUTO', 1);
    h.camera.setPreferences({ ...prefs, mode: 'FIRST_PERSON' });
    h.present();
    backend.render();
    const off = point(0);
    check(
      off.x < 0 || off.x >= 1920 || off.y < 0 || off.y >= 1080 || off.z < 0 || off.z > 1,
      'Fleet taxi not actually offscreen',
    );
    check(
      referenceSelectionAdmission(h.ids[0], h.ids[0], 'FLEET', h.kind(h.ids[0]!), false, true),
      'Offscreen taxi rejected',
    );
    step('AUTO', 0);
    for (const mode of ['MANUAL', 'LEARNING'] as const) {
      step(mode, 0);
      const before = snapshot(h.world, h.ids),
        priorTick = h.authority.getStats().tick,
        priorSerial = h.world.collisionStepSerial();
      h.authority.suspend();
      h.modes.clear();
      h.keyboard.clear();
      check(!h.modes.enqueue('M'), 'Paused key admitted');
      let rejected = false;
      try {
        h.authority.step({
          ...h.c,
          version: '066-control-authority-v1',
          tick: tick + 1,
          dtSeconds: 1 / 60,
        });
      } catch {
        rejected = true;
      }
      check(rejected && h.authority.getStats().tick === priorTick, 'Pause advanced');
      const after = unchanged(h.world, h.ids, before, priorSerial);
      pauses.push({
        mode,
        priorTick,
        afterTick: h.authority.getStats().tick,
        priorSerial,
        afterSerial: h.world.collisionStepSerial(),
        rejected,
        before: before.map((v) => v.body),
        after: after.map((v) => v.body),
      });
      h.authority.resume();
      step('AUTO', 1);
      step('AUTO', 0);
    }
    const old = h.ids[1]!;
    h.guard.phase = 'SETUP';
    h.world.removeBody(old);
    h.world.addClassCar(old.entityId, { x: 2.5, y: 0.8, z: 6 }, classId);
    const replacement = h.world.bodyIdentity(old.entityId);
    check(
      replacement !== old &&
        !referenceSelectionAdmission(replacement, old, 'WORLD', 'CIVIL', true, true),
      'Retired identity admitted',
    );
    result = {
      classId,
      context: plain(h.c),
      identities: plain(h.ids),
      kinds: h.kinds,
      assignmentText: h.assignmentText,
      assignmentDigest: await digest(h.assignmentText),
      picking: {
        point: plain(p),
        visibleIntent: plain(intent),
        hiddenPick: plain(hiddenPick),
        disabledPick: plain(disabledPick),
        occludedPick: plain(occludedPick),
        offscreenPoint: plain(off),
        oldIdentity: plain(old),
        replacementIdentity: plain(replacement),
      },
      pauses,
      modeSettlementProofs: modeProofs,
      events,
      selectionProofs: proofs,
      actualPicker: true,
      nearestOcclusion: true,
      hiddenRejected: true,
      disabledRejected: true,
      offscreenTaxiAccepted: true,
      civilFleetRejected: true,
      retiredGenerationRejected: true,
      pausedNoTick: true,
      syntheticDomEvents: 0,
      scope:
        'Actual018 rays;scripted fixture list/mode intents,not trusted keyboard. Two native bodies,static guard placement separate from720tick arms.',
      owned: { guard: plain(h.guard), segment: h.segments.getStats() },
    };
  } catch (error) {
    primary = error;
    diagnostic = { previous: diagnostic, guardError: String(error) };
  }
  cleanup(scope, primary, result);
  check(result, 'Guard result missing');
  return result;
}
document.getElementById('run')!.addEventListener('click', async () => {
  const button = document.getElementById('run') as HTMLButtonElement;
  button.disabled = true;
  firstWorldAt = null;
  worldsCreated = 0;
  diagnostic = null;
  surfaceInvalidation = null;
  const blur = () => {
      surfaceInvalidation ??= 'WINDOW_BLUR';
    },
    visibility = () => {
      if (document.hidden) surfaceInvalidation ??= 'HIDDEN';
    };
  window.addEventListener('blur', blur);
  document.addEventListener('visibilitychange', visibility);
  let captureListeners = 2;
  const lifecycleDisposers: (() => void)[] = [
    () => {
      window.removeEventListener('blur', blur);
      captureListeners--;
    },
    () => {
      document.removeEventListener('visibilitychange', visibility);
      captureListeners--;
    },
  ];
  let rendering: RenderingBackend | null = null,
    primary: unknown = null,
    report: Record<string, unknown> | null = null;
  const startedAt = new Date().toISOString(),
    requestedBackend = (document.getElementById('backend') as HTMLSelectElement).value as
      'AUTO' | 'WEBGL2';
  let captureId: string | null = null;
  try {
    const ready = await fetch('/capture-ready');
    check(ready.ok, 'Durable archive must be verified before Run');
    const start = await fetch('/capture-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestedBackend, startedAt }),
    });
    check(start.ok, 'Durable started marker required');
    captureId = ((await start.json()) as { captureId: string }).captureId;
    rendering = await createRenderingBackend(
      document.getElementById('canvas') as HTMLCanvasElement,
      requestedBackend,
    );
    check(
      rendering.rendererKind === (requestedBackend === 'AUTO' ? 'WEBGPU' : 'WEBGL2'),
      'Requested backend unavailable',
    );
    const engine = rendering.scene.getEngine();
    const observer = engine.onContextLostObservable.add(() => {
      surfaceInvalidation ??= 'CONTEXT_LOST';
    });
    check(observer !== null, 'Context observer admission');
    captureListeners++;
    lifecycleDisposers.push(() => {
      check(engine.onContextLostObservable.remove(observer), 'Context observer removal');
      captureListeners--;
    });
    engine.setHardwareScalingLevel(1);
    rendering.resize();
    engine.setSize(1920, 1080);
    rendering.canvas.focus();
    check(
      devicePixelRatio === 1 &&
        rendering.canvas.clientWidth === 1920 &&
        rendering.canvas.clientHeight === 1080,
      'CSS/DPR resolution',
    );
    new HemisphericLight('light', new Vector3(0, 1, 0), rendering.scene);
    const ground = MeshBuilder.CreateGround('ground', { width: 500, height: 500 }, rendering.scene),
      material = new StandardMaterial('ground-material', rendering.scene);
    material.diffuseColor = new Color3(0.22, 0.3, 0.24);
    ground.material = material;
    surface(rendering);
    const guards = [],
      arms = [],
      frameRuns = [];
    for (const [epoch, classId] of (['sedan', 'compact'] as const).entries()) {
      guards.push(await selectionCases(rendering, classId, epoch));
      arms.push(await protocol(rendering, classId, 10 + epoch, null));
    }
    for (let pair = 0; pair < 5; pair++)
      for (const observer of pair % 2 ? [true, false] : [false, true])
        frameRuns.push({
          ...(await protocol(rendering, 'sedan', 20 + pair * 2 + Number(observer), observer)),
          pair,
        });
    const manifest = (await (await fetch('/build-manifest.json')).json()) as {
      artifactHash: string;
    };
    report = {
      status: 'PASS',
      captureId,
      requestedBackend,
      fixtureVersion: '068-selection-browser-reference-v1',
      identity: __SELECTION_REFERENCE_BUILD__,
      artifactHash: manifest.artifactHash,
      startedAt,
      firstWorldAt,
      createdAt: new Date().toISOString(),
      worldsCreated,
      browser: navigator.userAgent,
      renderer: rendering.rendererKind,
      actualGpuInfo:
        'getInfo' in engine ? (engine as unknown as { getInfo(): unknown }).getInfo() : null,
      surfaceInvalidation,
      foreground: document.hasFocus() && !document.hidden,
      cssResolution: [rendering.canvas.clientWidth, rendering.canvas.clientHeight],
      internalResolution: [engine.getRenderWidth(), engine.getRenderHeight()],
      dpr: devicePixelRatio,
      guards,
      arms,
      frameRuns,
      scope:
        '068 preproduction actual017camera/018picker/published066067,14native two-bodyworlds;2×720ticks+5OFFON600RAF/30warm. Actual raw timings stored duringcapture. No068product,trustedkeys,069recorder/training,wholefleetFPS,fullgame,laptop orheap claim.',
    };
  } catch (error) {
    primary = error;
  }
  const cleanupErrors: unknown[] = [];
  for (const dispose of [...lifecycleDisposers].reverse()) {
    try {
      dispose();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  try {
    rendering?.dispose();
  } catch (error) {
    cleanupErrors.push(error);
  }
  let rendererCleanup: unknown = null;
  try {
    rendererCleanup = rendering
      ? {
          sceneDisposed: rendering.scene.isDisposed,
          meshes: rendering.scene.meshes.length,
          materials: rendering.scene.materials.length,
          cameras: rendering.scene.cameras.length,
          captureListeners,
        }
      : null;
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (report) report.rendererCleanup = rendererCleanup;
  if (primary || cleanupErrors.length) {
    const failure = new AggregateError(
      [...(primary ? [primary] : []), ...cleanupErrors],
      'Capture and renderer cleanup causes',
    );
    status.textContent = 'FAILED: ' + String(failure);
    try {
      const exported = await fetch('/failure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          captureId,
          requestedBackend,
          fixtureVersion: '068-selection-browser-reference-v1',
          identity: __SELECTION_REFERENCE_BUILD__,
          startedAt,
          firstWorldAt,
          createdAt: new Date().toISOString(),
          error: String(failure),
          causes: failure.errors.map((e) => String(e)),
          diagnostic,
          rendererCleanup,
          browser: navigator.userAgent,
          surfaceInvalidation,
          foreground: document.hasFocus() && !document.hidden,
        }),
      });
      check(exported.ok, 'Failure export HTTP ' + exported.status + ': ' + (await exported.text()));
    } catch (error) {
      status.textContent +=
        '; failure export failed (original causes retained above): ' + String(error);
    }
  } else
    try {
      check(report, 'Report missing');
      const response = await fetch('/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
      check(response.ok, await response.text());
      status.textContent =
        'PASS ' + report.renderer + ': actual camera/picking and frame BEFORE. Evidence saved.';
    } catch (error) {
      status.textContent = 'FAILED export: ' + String(error);
      try {
        const failed = await fetch('/failure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            captureId,
            requestedBackend,
            fixtureVersion: '068-selection-browser-reference-v1',
            identity: __SELECTION_REFERENCE_BUILD__,
            startedAt,
            firstWorldAt,
            createdAt: new Date().toISOString(),
            error: String(error),
            causes: [String(error)],
            diagnostic,
            rendererCleanup,
            browser: navigator.userAgent,
            foreground: document.hasFocus() && !document.hidden,
          }),
        });
        check(
          failed.ok,
          'Export-failure transport HTTP ' + failed.status + ': ' + (await failed.text()),
        );
      } catch (transport) {
        status.textContent += '; failure transport also failed: ' + String(transport);
      }
    }
  button.disabled = false;
});

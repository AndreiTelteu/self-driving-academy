import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import type { RenderingBackend } from '../../../src/rendering/babylon';
import { createRapierProbe } from '../../../src/vehicles/rapier';
import { createVehicleController } from '../../../src/vehicles/controller';
import { createKeyboardFilter } from '../../../src/vehicles/keyboard-filter';
import { vehicleClass } from '../../../src/vehicles/vehicle-classes';
import { createDefaultSettings } from '../../../src/settings/store';
import { parseRide } from '../../../src/fleet/contracts';
import type { actualSelectionHost as SelectionConstructor } from '../vehicle-selection-actual/selection-host';
import { createControlAuthority, createModeControls, createFixtureSegmentStore,
  BabylonVehicleCamera, VehiclePickingRegistry, BabylonVehiclePicker, referenceSelectionAdmission } from './historical-reference';
import { browserScope, browserWorld, check, snapshot, unchanged, digest } from './proof';
import { STEADY, steadyPlacement } from './protocol';
type SelectionFactory = typeof SelectionConstructor;
const plain = <T>(value: T): T => structuredClone(value);
const context = (worldEpoch: number) => ({ schemaVersion: 1 as const, units: 'SI' as const, sessionId: '068-historical-steady-01', worldEpoch });
const prefs = { mode: 'CHASE' as const, fovDegrees: 75, motion: 50, distanceM: 6 };
/** Common published029 controller/native plus byte-exact historical017/018/066/067 factories.
 * Selection constructor is injected ONLY for treatment; reference never calls/imports068 factory. */
export async function steadyHost(
  backend: RenderingBackend,
  epoch: number,
  scope: ReturnType<typeof browserScope>,
  selectionFactory: SelectionFactory | null,
  onWorldCreated: () => void = () => {},
) {
  const raw = await createRapierProbe();
  let g: ReturnType<typeof browserWorld> | null = null;
  scope.own('world', () => {
    if (g) g.guard.phase = 'CLEANUP';
    raw.dispose();
  });
  scope.inspect('body', () => raw.bodyResources());
  scope.inspect('collision', () => raw.collisionResources());
  onWorldCreated();
  g = browserWorld(raw);
  const { world, guard } = g,
    c = context(epoch);
  const profiles = Array.from({ length: STEADY.population }, (_, i) => i % 2 ? 'compact' as const : 'sedan' as const);
  profiles.forEach((classId, i) => world.addClassCar('car-' + i, steadyPlacement(i), classId));
  const ids = profiles.map((_, i) => world.bodyIdentity('car-' + i)!);
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
  for (let i = 0; i < STEADY.population; i++) {
    const config = vehicleClass(profiles[i]!);
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
  const registry = new VehiclePickingRegistry(backend.scene, { maxBindings: STEADY.population });
  scope.own(
    'registry',
    () => registry.dispose(),
    () => ({ bindings: registry.size }),
  );
  meshes.forEach((mesh, i) => registry.register(mesh, ids[i]!.entityId));
  const picker = new BabylonVehiclePicker(backend.scene, registry);
  scope.own('picker', () => picker.dispose());
  const kinds = ids.map((_, i) => i < STEADY.taxis ? 'TAXI' as const : 'CIVIL' as const);
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
  const assignmentFingerprints = await Promise.all(assignments.map(async (value) => ({
    routeFingerprint: await digest(JSON.stringify(value.routeLaneIds)),
    tripFingerprint: value.trip === null ? null : await digest(JSON.stringify(value.trip)),
  })));
  const actual = selectionFactory?.(c, ids, kinds, {
    readAuthority: () => authority.getStats(),
    bodyIdentity: (id) => world.bodyIdentity(id),
    readPresentation: (identity) => ({
      identity, kind: kind(identity), visible: meshes[ids.indexOf(identity)]!.isVisible,
      selectable: meshes[ids.indexOf(identity)]!.isEnabled(),
    }),
    readCameraTarget: () => {
      const id = camera.controller.selectedEntityId;
      return id === null ? null : world.bodyIdentity(id) ?? null;
    },
    selectCamera: select,
    clearInput: () => modes.clear(), // 067 only; 025 clear remains066 post-accepted callback.
    readAssignment: (identity) => {
      check(JSON.stringify(assignments) === assignmentText, 'Assignment host changed');
      const index = ids.indexOf(identity);
      check(index >= 0, 'Assignment native identity');
      return { context: c, identity, ...assignmentFingerprints[index]! };
    },
    readBoundary: (identity) => {
      const b = segments.read();
      if (!b || b.identity !== identity) return null;
      check(b.segment.controlMode === 'MANUAL' || b.segment.controlMode === 'LEARNING', 'Controlled boundary mode');
      return { context: c, identity, segmentId: b.segment.segmentId,
        mode: b.segment.controlMode, startTick: b.segment.startTick, endTick: b.segment.endTick,
        completeness: b.segment.completeness, closeReason: b.segment.closeReason };
    },
    closeBoundary: (event) => exactClose(event.tick, { identity: event.identity, mode: event.mode }),
  }) ?? null;
  if (actual) {
    scope.own('selection', () => actual.selection.dispose(), () => actual.selection.getStats());
    actual.register();
  }
  function prepareSelection(tick: number, id: typeof selected, source: 'WORLD' | 'FLEET') {
    if (actual) return actual.prepare(tick, id, source);
    check(referenceSelectionAdmission(world.bodyIdentity(id.entityId), id, source, kind(id), meshes[ids.indexOf(id)]!.isVisible, meshes[ids.indexOf(id)]!.isEnabled()), 'Historical exact admission');
    modes.clear();
    const seat = authority.getStats().seat;
    return { tick, identity: id, source, requests: seat ? [{ identity: seat.identity, mode: 'AUTO' as const }] : [], historicalReference: true as const };
  }
  function settleSelection(
    tick: number,
    id: typeof selected,
    old: ReturnType<typeof authority.getStats>['seat'],
    source: 'WORLD' | 'FLEET',
    ticket: ReturnType<typeof prepareSelection>,
  ) {
    check(ticket.identity === id && ticket.tick === tick && ticket.source === source, 'Exact selection ticket');
    const serial = world.collisionStepSerial(),
      before = snapshot(world, ids),
      segmentBefore = plain(segments.read()),
      assignmentBefore = JSON.stringify(assignments);
    guard.phase = 'SETTLEMENT';
    let acceptedSelection: unknown = null;
    if (actual) {
      check(!('historicalReference' in ticket), 'Historical ticket entered actual068');
      acceptedSelection = actual.settle(ticket, authority.getStats());
    } else {
      check('historicalReference' in ticket && authority.getStats().tick === tick, 'Historical accepted tick');
      if (old) exactClose(tick, old);
      select(id);
    }
    present();
    const after = unchanged(world, ids, before, serial);
    guard.phase = 'DRIVING';
    check(JSON.stringify(assignments) === assignmentText, 'Assignment changed');
    check(authority.getStats().seat === null, 'Selection claimed PLAYER');
    return {
      acceptedSelection: plain(acceptedSelection),
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
    profiles,
    actual,
    prepareSelection,
    settleSelection,
    clearCalls: () => clearCalls,
    selected: () => selected,
  };
}

/// <reference lib="dom" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import '@babylonjs/core/Meshes/instancedMesh.js';
import { VehiclePickingRegistry } from '../../src/rendering/babylon/vehicle-picking-registry';
import { BabylonVehiclePicker } from '../../src/rendering/babylon/vehicle-picking';
import { bindVehiclePickingInput } from '../../src/rendering/babylon/vehicle-picking-input';
function setup() {
  const engine = new NullEngine();
  // CPU-only ray geometry tests; real instancing is separately verified on GL/GPU.
  engine.getCaps().instancedArrays = true;
  const scene = new Scene(engine);
  new FreeCamera('camera', new Vector3(0, 0, -10), scene);
  const registry = new VehiclePickingRegistry(scene);
  const picker = new BabylonVehiclePicker(scene, registry);
  return {
    scene,
    engine,
    registry,
    picker,
    close: () => {
      picker.dispose();
      registry.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
test('nearest mesh/root and ordinary instance identities remain distinct; decor blocks', () => {
  const s = setup();
  try {
    const root = new TransformNode('taxi', s.scene);
    const car = CreateBox('body', {}, s.scene);
    car.parent = root;
    s.registry.register(root, 'taxi');
    s.scene.render();
    assert.equal(s.picker.pick(256, 128)?.entityId, 'taxi');
    const instance = car.createInstance('civil');
    instance.parent = null;
    instance.position.z = -2;
    s.registry.register(instance, 'civil');
    s.scene.render();
    assert.equal(s.picker.pick(256, 128)?.entityId, 'civil');
    const decor = CreateBox('decor', {}, s.scene);
    decor.position.z = -4;
    s.scene.render();
    assert.equal(s.picker.pick(256, 128), null);
    decor.dispose();
    instance.dispose();
    s.scene.render();
    assert.equal(s.registry.size, 1);
    assert.equal(s.picker.pick(256, 128)?.entityId, 'taxi');
    root.dispose();
    assert.equal(s.registry.size, 0);
  } finally {
    s.close();
  }
});
test('thin batch maps real ray hit index, remaps atomically, and rejects stale count', () => {
  const s = setup();
  try {
    const mesh = CreateBox('batch', {}, s.scene);
    const priorPicking = mesh.thinInstanceEnablePicking;
    mesh.thinInstanceAdd(Matrix.Translation(0, 0, 0));
    mesh.thinInstanceAdd(Matrix.Translation(4, 0, 0));
    const ids = ['taxi', 'civil'];
    s.registry.registerThinBatch(mesh, ids);
    ids[0] = 'mutated';
    s.scene.render();
    assert.equal(s.picker.pick(256, 128)?.entityId, 'taxi');
    s.registry.registerThinBatch(mesh, ['civil', 'taxi']);
    assert.equal(s.picker.pick(256, 128)?.entityId, 'civil');
    assert.throws(() => s.registry.registerThinBatch(mesh, ['wrong']));
    assert.equal(s.picker.pick(256, 128)?.entityId, 'civil');
    mesh.thinInstanceCount = 1;
    assert.equal(s.picker.pick(256, 128), null);
    s.registry.registerThinBatch(mesh, [null]);
    assert.equal(s.picker.pick(256, 128), null);
    s.registry.unregister(mesh);
    assert.equal(mesh.thinInstanceEnablePicking, priorPicking);
  } finally {
    s.close();
  }
});
test('foreign/disposed objects, malformed IDs and capacity are rejected without destructive replacement', () => {
  const s = setup();
  const other = new Scene(s.engine);
  try {
    const limited = new VehiclePickingRegistry(s.scene, { maxBindings: 1, maxThinInstances: 1 });
    const a = CreateBox('a', {}, s.scene),
      b = CreateBox('b', {}, s.scene);
    limited.register(a, 'a');
    assert.throws(() => limited.register(b, 'b'));
    assert.throws(() => limited.register(a, ''));
    assert.equal(limited.size, 1);
    assert.throws(() => limited.register(CreateBox('foreign', {}, other), 'f'));
    const thin = CreateBox('thin', {}, s.scene);
    thin.thinInstanceAdd(Matrix.Identity());
    thin.thinInstanceAdd(Matrix.Translation(3, 0, 0));
    assert.throws(() => limited.registerThinBatch(thin, ['a', 'b']));
    assert.throws(() => s.registry.register(thin, 'x'));
    limited.dispose();
    limited.dispose();
    assert.equal(limited.size, 0);
    assert.throws(() => limited.register(a, 'a'));
    assert.throws(() => new BabylonVehiclePicker(other, s.registry));
    assert.throws(() => s.picker.pick(NaN, 0));
    assert.equal(s.picker.pick(-1, 0), null);
    assert.equal(s.picker.pick(512, 128), null);
  } finally {
    other.dispose();
    s.close();
  }
});
test('optional013 resolver maps descendants while thin instances never inherit host identity', () => {
  const s = setup();
  try {
    const mesh = CreateBox('car', {}, s.scene);
    s.picker.dispose();
    const registry = new VehiclePickingRegistry(s.scene, { entityIdFor: () => 'from013' });
    const picker = new BabylonVehiclePicker(s.scene, registry);
    s.scene.render();
    assert.equal(picker.pick(256, 128)?.entityId, 'from013');
    mesh.thinInstanceAdd(Matrix.Identity());
    s.scene.render();
    assert.equal(picker.pick(256, 128), null);
    picker.dispose();
    registry.dispose();
  } finally {
    s.close();
  }
});
test('native pointer scans are disabled and restored; disposed picker does not scan', () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const registry = new VehiclePickingRegistry(scene);
  scene.skipPointerMovePicking = false;
  scene.skipPointerDownPicking = true;
  scene.skipPointerUpPicking = false;
  const picker = new BabylonVehiclePicker(scene, registry);
  assert.equal(scene.skipPointerMovePicking, true);
  assert.equal(scene.skipPointerUpPicking, true);
  assert.throws(() => new BabylonVehiclePicker(scene, registry));
  picker.dispose();
  picker.dispose();
  assert.equal(scene.skipPointerMovePicking, false);
  assert.equal(scene.skipPointerDownPicking, true);
  assert.equal(scene.skipPointerUpPicking, false);
  assert.equal(picker.pick(1, 1), null);
  registry.dispose();
  scene.dispose();
  engine.dispose();
});
class Canvas extends EventTarget {
  width = 1000;
  height = 500;
  ownerDocument = { pointerLockElement: null, defaultView: new EventTarget() };
  getBoundingClientRect() {
    return { left: 100, top: 50, width: 500, height: 250 };
  }
}
function pointer(
  canvas: Canvas,
  type: string,
  x = 200,
  y = 100,
  more: Record<string, unknown> = {},
) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, {
    clientX: x,
    clientY: y,
    button: 0,
    isPrimary: true,
    pointerId: 1,
    ...more,
  });
  canvas.dispatchEvent(event);
  return event;
}
test('input maps CSS to render pixels once; move is scan-free; modal/drag/cancel/UI/cleanup block clicks', () => {
  const canvas = new Canvas();
  let scans = 0,
    selections = 0,
    modal = false;
  let point: number[] = [];
  const dispose = bindVehiclePickingInput({
    canvas: canvas as unknown as HTMLCanvasElement,
    isModalOpen: () => modal,
    pick: (x, y) => {
      scans++;
      point = [x, y];
      return { type: 'SELECT_VEHICLE', entityId: 'taxi' };
    },
    onSelect: () => selections++,
  });
  for (let i = 0; i < 1000; i++) pointer(canvas, 'pointermove');
  assert.equal(scans, 0);
  pointer(canvas, 'pointerdown');
  pointer(canvas, 'pointerup');
  pointer(canvas, 'lostpointercapture');
  pointer(canvas, 'click');
  assert.equal(selections, 1);
  assert.deepEqual(point, [200, 100]);
  modal = true;
  pointer(canvas, 'pointerdown');
  pointer(canvas, 'pointerup');
  const blocked = pointer(canvas, 'click');
  assert.equal(blocked.defaultPrevented, true);
  assert.equal(scans, 1);
  modal = false;
  pointer(canvas, 'pointerdown');
  pointer(canvas, 'pointermove', 230);
  pointer(canvas, 'pointerup');
  pointer(canvas, 'lostpointercapture');
  pointer(canvas, 'click');
  assert.equal(scans, 1);
  pointer(canvas, 'pointerdown');
  pointer(canvas, 'pointercancel');
  pointer(canvas, 'click');
  assert.equal(scans, 1);
  const overlay = new EventTarget();
  pointer(overlay as Canvas, 'click');
  assert.equal(scans, 1);
  dispose();
  dispose();
  pointer(canvas, 'pointerdown');
  pointer(canvas, 'pointerup');
  pointer(canvas, 'lostpointercapture');
  pointer(canvas, 'click');
  assert.equal(scans, 1);
});
test('hover is explicit opt-in, disabled/modal state prevents scans', () => {
  const canvas = new Canvas();
  let scans = 0,
    hovers = 0,
    enabled = true;
  const dispose = bindVehiclePickingInput({
    canvas: canvas as unknown as HTMLCanvasElement,
    isModalOpen: () => false,
    enabled: () => enabled,
    pick: () => {
      scans++;
      return null;
    },
    onSelect: () => {
      throw Error('unexpected');
    },
    onHover: () => hovers++,
  });
  pointer(canvas, 'pointermove');
  assert.equal(scans, 1);
  assert.equal(hovers, 1);
  enabled = false;
  pointer(canvas, 'pointermove');
  assert.equal(scans, 1);
  dispose();
});

test('hardware scaling and aggregate thin capacity retain correct identity', () => {
  const s = setup();
  try {
    const car = CreateBox('car', {}, s.scene);
    s.registry.register(car, 'taxi');
    s.scene.render();
    s.engine.getHardwareScalingLevel = () => 2;
    assert.equal(s.picker.pick(256, 128)?.entityId, 'taxi');
    const r = new VehiclePickingRegistry(s.scene, { maxThinInstances: 3 });
    const a = CreateBox('a', {}, s.scene),
      b = CreateBox('b', {}, s.scene);
    for (const mesh of [a, b]) {
      mesh.thinInstanceAdd(Matrix.Identity());
      mesh.thinInstanceAdd(Matrix.Translation(5, 0, 0));
    }
    r.registerThinBatch(a, ['a', 'b']);
    assert.throws(() => r.registerThinBatch(b, ['c', 'd']));
    assert.equal(r.size, 1);
    r.registerThinBatch(a, ['b', 'a']);
    assert.equal(r.size, 1);
    r.dispose();
  } finally {
    s.close();
  }
});

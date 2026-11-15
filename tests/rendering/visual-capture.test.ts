import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPTURE_VIEWPORT,
  CAPTURE_VIEWS,
  captureView,
  readCaptureConfig,
} from '../../src/rendering/visual-capture';

test('239: modul de captură este inert fără ?capture=1', () => {
  assert.equal(readCaptureConfig(''), null);
  assert.equal(readCaptureConfig('?preset=HIGH'), null);
  assert.equal(readCaptureConfig('?capture=0'), null);
  assert.equal(readCaptureConfig('?capture=true'), null);
});

test('239: ?capture=1 citește presetul și backendul, valorile necunoscute cad pe implicit', () => {
  assert.deepEqual(readCaptureConfig('?capture=1'), { preset: 'HIGH', backend: 'AUTO' });
  assert.deepEqual(readCaptureConfig('?capture=1&preset=low&backend=webgl2'), {
    preset: 'LOW',
    backend: 'WEBGL2',
  });
  assert.deepEqual(readCaptureConfig('?capture=1&preset=ULTRA&backend=metal'), {
    preset: 'HIGH',
    backend: 'AUTO',
  });
});

test('239: cel puțin 12 vederi unice acoperă categoriile cerute', () => {
  assert.ok(CAPTURE_VIEWS.length >= 12);
  assert.equal(new Set(CAPTURE_VIEWS.map((view) => view.id)).size, CAPTURE_VIEWS.length);
  const categories = new Set(CAPTURE_VIEWS.map((view) => view.category));
  for (const required of [
    'character',
    'taxi',
    'street',
    'intersection',
    'facade',
    'city',
    'horizon',
    'decor',
    'civil-cars',
    'map-edge',
    'ui',
  ])
    assert.ok(categories.has(required as never), required);
  assert.ok(CAPTURE_VIEWS.filter((view) => view.category === 'taxi').length >= 2);
  assert.equal(CAPTURE_VIEWPORT.width, 1920);
  assert.equal(CAPTURE_VIEWPORT.height, 1080);
});

test('239: pozele sunt finite, FOV este plauzibil și camera nu privește în ea însăși', () => {
  for (const view of CAPTURE_VIEWS) {
    const { position, target, fovRad } = view.pose;
    for (const value of [position.x, position.y, position.z, target.x, target.y, target.z])
      assert.ok(Number.isFinite(value), view.id);
    assert.ok(fovRad > 0.3 && fovRad < 1.6, `${view.id} fov`);
    assert.ok(
      Math.hypot(position.x - target.x, position.y - target.y, position.z - target.z) > 1,
      `${view.id} distanță`,
    );
    assert.equal(captureView(view.id), view);
  }
  assert.equal(captureView('nu-exista'), undefined);
});

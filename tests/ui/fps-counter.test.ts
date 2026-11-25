import assert from 'node:assert/strict';
import test from 'node:test';
import { fpsColor, summarizeFpsWindow } from '../../src/ui/fps-counter';

test('fereastra de 15 cadre în 250 ms înseamnă 60 FPS', () => {
  const summary = summarizeFpsWindow(15, 250, 18.2);
  assert.equal(summary.fps, 60);
  assert.equal(summary.worstFrameMs, 18.2);
});

test('fereastră goală sau fără durată dă 0, nu NaN/Infinity', () => {
  assert.equal(summarizeFpsWindow(0, 250, 0).fps, 0);
  assert.equal(summarizeFpsWindow(10, 0, 5).fps, 0);
});

test('culoarea urmează pragurile 55 / 30', () => {
  assert.equal(fpsColor(60), '#7ee08a');
  assert.equal(fpsColor(40), '#f2d06b');
  assert.equal(fpsColor(20), '#ff7a6b');
});

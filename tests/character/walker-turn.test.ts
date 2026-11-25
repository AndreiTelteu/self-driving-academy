import assert from 'node:assert/strict';
import test from 'node:test';
import { WALKER_POLICY, createWalkWorld, createWalker } from '../../src/character';

/** Teren plat, fără solide: proba izolează doar regula de virare a walker-ului. */
const world = createWalkWorld({
  surfaces: [
    {
      id: 'fixture:lot',
      kind: 'STREET',
      topM: 0,
      vertices: [
        { x: -40, z: -40 },
        { x: 40, z: -40 },
        { x: 40, z: 40 },
        { x: -40, z: 40 },
      ],
    },
  ],
});

const START_YAW = Math.PI / 2;
const STEP = WALKER_POLICY.turnRateRadps / WALKER_POLICY.tickHz;
/** Tick-uri suficiente pentru un sfert de tură (π/2) la rata walker-ului. */
const QUARTER = Math.ceil(Math.PI / 2 / STEP) + 1;

function yawAfter(headingRad: number, ticks: number, gait: 'WALK' | 'NONE' = 'WALK'): number {
  const walker = createWalker({
    world,
    start: { positionM: { x: 0, y: 0, z: 0 }, yawRad: START_YAW },
    entityId: 'turn-regression',
  });
  for (let tick = 1; tick <= ticks; tick += 1) {
    walker.step({ tick, input: { headingRad, gait, intensity: gait === 'NONE' ? 0 : 1 } });
  }
  return walker.state.yawRad;
}

test('D (dreapta, țintă −π) crește yaw-ul din primul tick și ajunge la π', () => {
  const afterOne = yawAfter(-Math.PI, 1);
  assert.ok(
    afterOne > START_YAW,
    `primul tick trebuie să vireze la dreapta, a fost ${afterOne} față de ${START_YAW}`,
  );
  assert.ok(Math.abs(afterOne - START_YAW - STEP) < 1e-12);
  const final = yawAfter(-Math.PI, QUARTER);
  assert.ok(Math.abs(final - Math.PI) < 1e-9, `yaw final ${final}, așteptat π`);
});

test('A (stânga, țintă 0) scade yaw-ul simetric', () => {
  const afterOne = yawAfter(0, 1);
  assert.ok(afterOne < START_YAW);
  assert.ok(Math.abs(START_YAW - afterOne - STEP) < 1e-12);
  const final = yawAfter(0, QUARTER);
  assert.ok(Math.abs(final) < 1e-9, `yaw final ${final}, așteptat 0`);
});

test('cele două viraje au aceeași mărime absolută', () => {
  const right = yawAfter(-Math.PI, QUARTER) - START_YAW;
  const left = START_YAW - yawAfter(0, QUARTER);
  assert.ok(Math.abs(right - left) < 1e-9, `dreapta ${right}, stânga ${left}`);
});

test('o țintă la −π nu produce o rotație completă după ce yaw-ul a ajuns la π', () => {
  // −π și π sunt aceeași direcție. Vechiul `return targetYaw` sărea de la π la −π, adică o
  // rotație completă inutilă; aproximarea trebuie să se oprească la yaw-ul curent + delta.
  const settled = yawAfter(-Math.PI, QUARTER + 50);
  assert.ok(Math.abs(settled - Math.PI) < 1e-9, `yaw după QUARTER + 50 tick-uri: ${settled}`);
  const closer = yawAfter(-Math.PI, QUARTER + 51);
  assert.ok(Math.abs(closer - Math.PI) < 1e-9, `yaw după QUARTER + 51 tick-uri: ${closer}`);
});

test('virarea merge și pe loc (gait NONE), cu aceeași rată', () => {
  const afterOne = yawAfter(-Math.PI, 1, 'NONE');
  assert.ok(Math.abs(afterOne - START_YAW - STEP) < 1e-12, `yaw după un tick: ${afterOne}`);
  const final = yawAfter(-Math.PI, QUARTER, 'NONE');
  assert.ok(Math.abs(final - Math.PI) < 1e-9, `yaw final ${final}, așteptat π`);
});

test('o apăsare scurtă (100 ms) rotește sub 20°', () => {
  const ticks = Math.round(0.1 * WALKER_POLICY.tickHz);
  const turned = yawAfter(-Math.PI, ticks, 'NONE') - START_YAW;
  assert.ok(turned > 0 && turned < (20 * Math.PI) / 180, `rotire ${(turned * 180) / Math.PI}°`);
});

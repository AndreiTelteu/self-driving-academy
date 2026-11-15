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

function yawAfter(headingRad: number, ticks: number): number {
  const walker = createWalker({
    world,
    start: { positionM: { x: 0, y: 0, z: 0 }, yawRad: START_YAW },
    entityId: 'turn-regression',
  });
  for (let tick = 1; tick <= ticks; tick += 1) {
    walker.step({ tick, input: { headingRad, gait: 'WALK', intensity: 1 } });
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
  const final = yawAfter(-Math.PI, 10);
  assert.ok(Math.abs(final - Math.PI) < 1e-9, `yaw final ${final}, așteptat π`);
});

test('A (stânga, țintă 0) scade yaw-ul simetric', () => {
  const afterOne = yawAfter(0, 1);
  assert.ok(afterOne < START_YAW);
  assert.ok(Math.abs(START_YAW - afterOne - STEP) < 1e-12);
  const final = yawAfter(0, 10);
  assert.ok(Math.abs(final) < 1e-9, `yaw final ${final}, așteptat 0`);
});

test('cele două viraje au aceeași mărime absolută', () => {
  const right = yawAfter(-Math.PI, 10) - START_YAW;
  const left = START_YAW - yawAfter(0, 10);
  assert.ok(Math.abs(right - left) < 1e-9, `dreapta ${right}, stânga ${left}`);
});

test('o țintă la −π nu produce o rotație completă după ce yaw-ul a ajuns la π', () => {
  // −π și π sunt aceeași direcție. Vechiul `return targetYaw` sărea de la π la −π, adică o
  // rotație completă inutilă; aproximarea trebuie să se oprească la yaw-ul curent + delta.
  const settled = yawAfter(-Math.PI, 60);
  assert.ok(Math.abs(settled - Math.PI) < 1e-9, `yaw după 60 tick-uri: ${settled}`);
  const closer = yawAfter(-Math.PI, 61);
  assert.ok(Math.abs(closer - Math.PI) < 1e-9, `yaw după 61 tick-uri: ${closer}`);
});

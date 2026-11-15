/**
 * PBI 242 — limita hărții: mașina condusă la accelerație maximă și personajul care aleargă spre
 * fiecare margine rămân în interior la fiecare tick, determinist, prin aceeași mătură ca 238/192.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCompositionWorld, createV3Composition, type V3Composition } from '../../src/app';
import { createWalker } from '../../src/character';
import { createDefaultSettings } from '../../src/settings';
import { WORLD_LIMIT_POLICY, deriveWorldLimit, worldLimitWalls } from '../../src/world';

const world = createCompositionWorld();
const worldLimit = deriveWorldLimit(world.layout);
const { limit } = worldLimit;
const HALF = Object.freeze({ x: 0.85, z: 2 });
const EPS = 1e-6;

function build(x: number, z: number, yaw: number): V3Composition {
  const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  const seed = world.vehicles[0]!;
  return createV3Composition({
    layout: world.layout,
    start: { x: x + right.x * 1.15, z: z + right.z * 1.15, yawRad: yaw },
    control: createDefaultSettings('242-test').input.control,
    context: Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: '242-test',
      worldEpoch: 1,
    }),
    vehicles: [Object.freeze({ ...seed, positionM: Object.freeze({ x, z }), yawRad: yaw })],
  });
}

function corners(x: number, z: number, yaw: number): { x: number; z: number }[] {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const out: { x: number; z: number }[] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      out.push({
        x: x + rx * HALF.x * sx + fx * HALF.z * sz,
        z: z + rz * HALF.x * sx + fz * HALF.z * sz,
      });
  return out;
}

function drive(x: number, z: number, yaw: number, ticks: number) {
  const model = build(x, z, yaw);
  model.requestEntry();
  const entered = model.step({ tick: 1 });
  assert.equal(entered.events.at(-1)?.kind, 'ENTER_ACCEPTED', JSON.stringify(entered.events));
  model.port.setAction('throttle', true);
  let peak = 0;
  let worst = -Infinity;
  const trace: number[] = [];
  let last = { x, z, speed: 0 };
  for (let tick = 2; tick <= ticks + 1; tick += 1) {
    const car = model.step({ tick }).vehicles[0]!;
    peak = Math.max(peak, car.speedMps);
    for (const corner of corners(car.positionM.x, car.positionM.z, car.yawRad)) {
      const outside = Math.max(
        limit.minX - corner.x,
        corner.x - limit.maxX,
        limit.minZ - corner.z,
        corner.z - limit.maxZ,
      );
      worst = Math.max(worst, outside);
      assert.ok(
        outside <= EPS,
        `tick ${tick}: colț la (${corner.x.toFixed(3)}, ${corner.z.toFixed(3)}) cu ${outside.toFixed(4)} m în afara limitei`,
      );
    }
    trace.push(car.positionM.x, car.positionM.z);
    last = { x: car.positionM.x, z: car.positionM.z, speed: car.speedMps };
  }
  model.dispose();
  return { peak, worst, trace, last };
}

const MID = 360;
const DIRECTIONS = [
  { name: 'est', yaw: Math.PI / 2, x: MID, z: MID, axis: 'x', edge: limit.maxX },
  { name: 'vest', yaw: -Math.PI / 2, x: MID, z: MID, axis: 'x', edge: limit.minX },
  { name: 'nord', yaw: 0, x: MID, z: MID, axis: 'z', edge: limit.maxZ },
  { name: 'sud', yaw: Math.PI, x: MID, z: MID, axis: 'z', edge: limit.minZ },
] as const;

for (const direction of DIRECTIONS) {
  test(`mașina condusă la accelerație maximă spre ${direction.name} se oprește la parapet, în interior`, () => {
    const result = drive(direction.x, direction.z, direction.yaw, 4200);
    assert.ok(result.peak > 8, `mașina a prins viteză (${result.peak.toFixed(2)} m/s)`);
    assert.equal(result.last.speed, 0, 'mașina rămâne oprită la limită');
    const along = direction.axis === 'x' ? result.last.x : result.last.z;
    const gap = Math.abs(direction.edge - along) - HALF.z;
    assert.ok(
      gap >= -EPS && gap < 0.05,
      `oprită lângă parapet (${gap.toFixed(4)} m între bot și limită)`,
    );
  });
}

test('mașina care ajunge oblic într-un colț alunecă pe perete și nu iese', () => {
  const result = drive(730, 700, Math.atan2(1, 1), 2400);
  assert.ok(result.peak > 3);
});

test('mașina conduce de pe carosabil spre colț de la 70° față de perete: rămâne în interior', () => {
  const result = drive(730, 360, (70 * Math.PI) / 180, 2400);
  assert.ok(result.worst <= EPS);
});

test('limita este deterministă: aceeași rulare dă aceiași biți', () => {
  const a = drive(MID, MID, Math.PI / 2, 3600);
  const b = drive(MID, MID, Math.PI / 2, 3600);
  assert.deepEqual(a.trace, b.trace);
});

test('personajul care aleargă spre fiecare margine rămâne în interior la fiecare tick', () => {
  const walkWorld = world.walkWorld;
  const radius = createWalker({
    world: walkWorld,
    start: { positionM: { x: 360, y: 0, z: 360 }, yawRad: 0 },
  }).capsule.radiusM;
  // Pornește pe iarbă, la ~15 m de parapet, cu fața spre el: aleargă 25 s (>100 m) și trebuie să-l atingă.
  const starts = [
    {
      x: 730,
      z: 360,
      yaw: Math.PI / 2,
      reached: (s: { x: number; z: number }) => limit.maxX - s.x,
    },
    {
      x: -10,
      z: 360,
      yaw: -Math.PI / 2,
      reached: (s: { x: number; z: number }) => s.x - limit.minX,
    },
    { x: 360, z: 730, yaw: 0, reached: (s: { x: number; z: number }) => limit.maxZ - s.z },
    { x: 360, z: -10, yaw: Math.PI, reached: (s: { x: number; z: number }) => s.z - limit.minZ },
  ];
  for (const start of starts) {
    const walker = createWalker({
      world: walkWorld,
      start: {
        positionM: { x: start.x, y: walkWorld.surfaceAt(start.x, start.z), z: start.z },
        yawRad: start.yaw,
      },
    });
    let last = { x: start.x, z: start.z };
    for (let tick = 1; tick <= 1500; tick += 1) {
      const state = walker.step({
        tick,
        input: { headingRad: start.yaw, gait: 'RUN', intensity: 1 },
        vehicles: [],
      }).state;
      last = state.positionM;
      assert.ok(
        state.positionM.x >= limit.minX + radius - EPS &&
          state.positionM.x <= limit.maxX - radius + EPS &&
          state.positionM.z >= limit.minZ + radius - EPS &&
          state.positionM.z <= limit.maxZ - radius + EPS,
        `yaw ${start.yaw}: tick ${tick} la (${state.positionM.x.toFixed(2)}, ${state.positionM.z.toFixed(2)}) a ieșit`,
      );
    }
    const remaining = start.reached(last);
    assert.ok(
      remaining >= radius - EPS && remaining < radius + 0.05,
      `yaw ${start.yaw}: personajul a ajuns la zid (${remaining.toFixed(4)} m, rază ${radius.toFixed(3)})`,
    );
  }
});

test('zidurile limitei sunt blocatoare LIMIT, nu obstacole, clădiri sau vehicule', () => {
  const stats = world.walkWorld.stats;
  assert.equal(stats.limits, 4);
  assert.equal(stats.obstacles, 0);
  const walls = worldLimitWalls(worldLimit);
  assert.equal(walls.length, 4);
  for (const wall of walls) {
    const blocker = world.walkWorld.blockers.find((candidate) => candidate.id === wall.id);
    assert.equal(blocker?.kind, 'LIMIT');
    assert.equal(blocker?.topM, WORLD_LIMIT_POLICY.wallHeightM);
  }
  // Limita nu taie niciun element: toate străzile sunt în interior cu cel puțin minClearanceM.
  const extent = worldLimit.extent;
  assert.ok(limit.minX <= extent.minX - WORLD_LIMIT_POLICY.minClearanceM + EPS);
  assert.ok(limit.maxX >= extent.maxX + WORLD_LIMIT_POLICY.minClearanceM - EPS);
  assert.ok(limit.minZ <= extent.minZ - WORLD_LIMIT_POLICY.minClearanceM + EPS);
  assert.ok(limit.maxZ >= extent.maxZ + WORLD_LIMIT_POLICY.minClearanceM - EPS);
});

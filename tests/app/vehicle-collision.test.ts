import assert from 'node:assert/strict';
import test from 'node:test';
import { walkPolygonContains } from '../../src/character';
import {
  createCompositionWorld,
  createV3Composition,
  type CompositionWorld,
  type V3Composition,
} from '../../src/app';
import {
  buildCityDecorGeometry,
  createCityDecorPlan,
  type CityDecorItem,
  type CityDecorKind,
} from '../../src/rendering';
import { createDefaultSettings } from '../../src/settings';
import type { CityPlanarElement } from '../../src/world';

const world = createCompositionWorld();
const plan = createCityDecorPlan(world.layout);
const HALF = Object.freeze({ x: 0.85, z: 2 });

function build(
  startX: number,
  startZ: number,
  yaw: number,
): { model: V3Composition; world: CompositionWorld } {
  // Mașina de probă stă la (startX, startZ) cu yaw-ul dat; personajul stă lângă ușa dreaptă.
  const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  const seed = world.vehicles[0]!;
  const model = createV3Composition({
    layout: world.layout,
    start: { x: startX + right.x * 1.15, z: startZ + right.z * 1.15, yawRad: yaw },
    control: createDefaultSettings('238-test').input.control,
    context: Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: '238-test',
      worldEpoch: 1,
    }),
    vehicles: [
      Object.freeze({
        ...seed,
        positionM: Object.freeze({ x: startX, z: startZ }),
        yawRad: yaw,
      }),
    ],
  });
  return { model, world };
}

/** Corpul rotit ca dreptunghi, micșorat cu `inset` ca atingerea exactă să nu fie penetrare. */
function bodyPoints(
  car: { x: number; z: number; yawRad: number },
  inset: number,
): { x: number; z: number }[] {
  const fx = Math.sin(car.yawRad);
  const fz = Math.cos(car.yawRad);
  const rx = Math.cos(car.yawRad);
  const rz = -Math.sin(car.yawRad);
  const hx = HALF.x - inset;
  const hz = HALF.z - inset;
  const points: { x: number; z: number }[] = [];
  for (let a = -hx; a <= hx + 1e-9; a += hx / 8)
    for (let b = -hz; b <= hz + 1e-9; b += hz / 16) {
      if (Math.abs(a) < hx - 1e-9 && Math.abs(b) < hz - 1e-9) continue; // doar marginea
      points.push({ x: car.x + rx * a + fx * b, z: car.z + rz * a + fz * b });
    }
  return points;
}

/** Distanța de la centrul cercului la dreptunghiul rotit, calculată independent de implementare. */
function distanceToBody(
  car: { x: number; z: number; yawRad: number },
  x: number,
  z: number,
): number {
  const dx = x - car.x;
  const dz = z - car.z;
  const a = dx * Math.cos(car.yawRad) - dz * Math.sin(car.yawRad);
  const b = dx * Math.sin(car.yawRad) + dz * Math.cos(car.yawRad);
  const outA = Math.max(Math.abs(a) - HALF.x, 0);
  const outB = Math.max(Math.abs(b) - HALF.z, 0);
  return Math.hypot(outA, outB);
}

function overlapsDecor(car: { x: number; z: number; yawRad: number }, item: CityDecorItem) {
  return distanceToBody(car, item.x, item.z) < item.radiusM - 1e-3;
}

function overlapsBuilding(
  car: { x: number; z: number; yawRad: number },
  polygon: Parameters<typeof walkPolygonContains>[0],
): boolean {
  if (bodyPoints(car, 1e-3).some((p) => walkPolygonContains(polygon, p.x, p.z))) return true;
  // Un colț de clădire înăuntrul corpului (clădirea mică, mașina mare).
  return polygon.vertices.some((v) => walkInsideBody(car, v.x, v.z, 1e-3));
}

function walkInsideBody(
  car: { x: number; z: number; yawRad: number },
  x: number,
  z: number,
  inset: number,
): boolean {
  const dx = x - car.x;
  const dz = z - car.z;
  const a = dx * Math.cos(car.yawRad) - dz * Math.sin(car.yawRad);
  const b = dx * Math.sin(car.yawRad) + dz * Math.cos(car.yawRad);
  return Math.abs(a) < HALF.x - inset && Math.abs(b) < HALF.z - inset;
}

/** Mașina pornește la `distance` în fața țintei, pe direcția `dir`, cu fața spre țintă. */
function approach(
  target: { x: number; z: number },
  dir: { x: number; z: number },
  distance: number,
) {
  const yaw = Math.atan2(dir.x, dir.z);
  return {
    x: target.x - dir.x * distance,
    z: target.z - dir.z * distance,
    yaw,
  };
}

/** Un drum liber: pornirea și toată dreapta până la țintă nu ating alt solid decât ținta. */
function pathIsClear(
  from: { x: number; z: number; yaw: number },
  ignoreId: string,
  length: number,
): boolean {
  for (let s = 0; s <= length; s += 0.25) {
    const pose = {
      x: from.x + Math.sin(from.yaw) * s,
      z: from.z + Math.cos(from.yaw) * s,
      yawRad: from.yaw,
    };
    const contacts = createCollisionProbe().contacts(pose, { halfX: HALF.x, halfZ: HALF.z });
    if (contacts.some((contact) => contact.id !== ignoreId)) return false;
  }
  return true;
}

let probe: ReturnType<typeof createV3Composition>['vehicleCollision'] | null = null;
function createCollisionProbe() {
  if (!probe) {
    const { model } = build(0, 0, 0);
    probe = model.vehicleCollision;
    model.dispose();
  }
  return probe;
}

function driveFullThrottle(
  model: V3Composition,
  ticks: number,
  onTick: (car: { x: number; z: number; yawRad: number; speedMps: number }) => void,
) {
  model.requestEntry();
  let frame = model.step({ tick: 1 });
  assert.equal(frame.events.at(-1)?.kind, 'ENTER_ACCEPTED', JSON.stringify(frame.events));
  model.port.setAction('throttle', true);
  for (let tick = 2; tick <= ticks + 1; tick += 1) {
    frame = model.step({ tick });
    const car = frame.vehicles[0]!;
    onTick({ x: car.positionM.x, z: car.positionM.z, yawRad: car.yawRad, speedMps: car.speedMps });
  }
  return frame;
}

const DECOR_KINDS: readonly CityDecorKind[] = [
  'tree',
  'street-lamp',
  'hydrant',
  'bench',
  'trash-can',
  'sign',
  'parking-meter',
  'bus-shelter',
];

function nearestRoadDirection(item: CityDecorItem): { x: number; z: number } {
  // Direcția de la obiect spre cel mai apropiat punct al carosabilului, din layout (independent).
  let best = Infinity;
  let dir = { x: 0, z: 0 };
  for (const element of world.layout.elements as readonly CityPlanarElement[]) {
    if (element.kind !== 'LANE_SURFACE' && element.kind !== 'INTERSECTION_SURFACE') continue;
    const ring = element.footprintM;
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const ex = b.x - a.x;
      const ez = b.z - a.z;
      const len = ex * ex + ez * ez;
      const t =
        len === 0 ? 0 : Math.max(0, Math.min(1, ((item.x - a.x) * ex + (item.z - a.z) * ez) / len));
      const px = a.x + ex * t;
      const pz = a.z + ez * t;
      const d = Math.hypot(px - item.x, pz - item.z);
      if (d < best) {
        best = d;
        dir = { x: (px - item.x) / (d || 1), z: (pz - item.z) / (d || 1) };
      }
    }
  }
  return dir;
}

for (const kind of ['tree', 'street-lamp', 'hydrant', 'bench', 'trash-can', 'sign'] as const) {
  test(`mașina condusă la accelerație maximă nu trece prin ${kind} și rămâne oprită lângă el`, () => {
    // Primul obiect de acest fel la care mașina poate ajunge de pe carosabil printr-un drum liber.
    let tried = 0;
    for (const item of plan.items.filter((entry) => entry.kind === kind)) {
      const toRoad = nearestRoadDirection(item);
      const dir = { x: -toRoad.x, z: -toRoad.z }; // de pe carosabil spre obiect
      const from = approach(item, dir, 14);
      const length = 14;
      if (!pathIsClear(from, item.id, length - item.radiusM - 0.5)) continue;
      tried += 1;
      const { model } = build(from.x, from.z, from.yaw);
      let last = { x: from.x, z: from.z, yawRad: from.yaw, speedMps: 0 };
      let peak = 0;
      const frame = driveFullThrottle(model, 900, (car) => {
        last = car;
        peak = Math.max(peak, car.speedMps);
        assert.ok(
          !overlapsDecor(car, item),
          `${item.id}: corpul pătrunde în obstacol la (${car.x.toFixed(3)}, ${car.z.toFixed(3)})`,
        );
      });
      assert.ok(peak > 3, `mașina a prins viteză (${peak.toFixed(2)} m/s) înainte de impact`);
      assert.equal(last.speedMps, 0, `${item.id}: mașina rămâne oprită`);
      const gap = distanceToBody(last, item.x, item.z) - item.radiusM;
      assert.ok(
        gap < 0.05,
        `${item.id}: oprită lângă obstacol, nu în fața lui (${gap.toFixed(3)} m)`,
      );
      assert.equal(frame.hud.speedMps, 0);
      model.dispose();
      if (tried >= 2) return;
    }
    assert.ok(tried >= 1, `există cel puțin un ${kind} atins pe un drum liber`);
  });
}

test('mașina condusă la accelerație maximă nu intră într-o clădire și camera o urmărește', () => {
  let tried = 0;
  const buildings = world.walkWorld.blockers.filter((blocker) => blocker.kind === 'BUILDING');
  for (const building of buildings) {
    const vertices = building.polygon.vertices;
    for (let i = 0; i < vertices.length; i += 1) {
      const a = vertices[i]!;
      const b = vertices[(i + 1) % vertices.length]!;
      const ex = b.x - a.x;
      const ez = b.z - a.z;
      const len = Math.hypot(ex, ez);
      if (len < 8) continue;
      // Poligoanele sunt CCW: normala exterioară este (ez, −ex)/len.
      const normal = { x: ez / len, z: -ex / len };
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const dir = { x: -normal.x, z: -normal.z };
      const from = approach(mid, dir, 14);
      if (!pathIsClear(from, building.id, 14 - 2.5)) continue;
      if (world.walkWorld.surfaceAt(from.x, from.z) !== 0) continue;
      tried += 1;
      const { model } = build(from.x, from.z, from.yaw);
      let last = { x: from.x, z: from.z, yawRad: from.yaw, speedMps: 0 };
      let peak = 0;
      const frame = driveFullThrottle(model, 900, (car) => {
        last = car;
        peak = Math.max(peak, car.speedMps);
        assert.ok(
          !overlapsBuilding(car, building.polygon),
          `${building.id}: corpul intră în clădire la (${car.x.toFixed(3)}, ${car.z.toFixed(3)})`,
        );
      });
      assert.ok(peak > 3, `mașina a prins viteză (${peak.toFixed(2)} m/s)`);
      assert.equal(last.speedMps, 0, `${building.id}: oprită`);
      // Camera rămâne pe mașină, în afara oricărei clădiri și la o distanță utilizabilă.
      assert.equal(frame.camera.entityId, 'taxi-01');
      assert.equal(frame.hud.cameraDivergent, false);
      assert.ok(frame.camera.distanceM >= 2 - 1e-6, `cameră la ${frame.camera.distanceM} m`);
      for (const solid of buildings)
        assert.ok(
          !walkPolygonContains(solid.polygon, frame.camera.positionM.x, frame.camera.positionM.z) ||
            frame.camera.positionM.y > solid.topM,
          `camera este în interiorul clădirii ${solid.id}`,
        );
      const carToCamera = Math.hypot(
        frame.camera.positionM.x - last.x,
        frame.camera.positionM.z - last.z,
      );
      assert.ok(carToCamera < 9, `camera urmărește mașina (${carToCamera.toFixed(2)} m)`);
      model.dispose();
      if (tried >= 2) return;
    }
  }
  assert.ok(tried >= 1, 'există o clădire atinsă pe un drum liber');
});

test('mașina nu trece prin niciun solid static la viteză maximă din orice direcție (măturat)', () => {
  // Pe o scenă dintr-un singur obstacol: 0,1 m de sub-pas la 8 m/s nu poate sări peste un hidrant.
  const hydrant = plan.items.find((entry) => entry.kind === 'hydrant')!;
  const toRoad = nearestRoadDirection(hydrant);
  const collision = createCollisionProbe();
  const body = { halfX: HALF.x, halfZ: HALF.z };
  const dir = { x: -toRoad.x, z: -toRoad.z };
  const from = {
    x: hydrant.x - dir.x * 6,
    z: hydrant.z - dir.z * 6,
    yawRad: Math.atan2(dir.x, dir.z),
  };
  // Un singur tick de 12 m (200 m/s): același rezultat ca la viteză normală, nu tunelare.
  const to = { x: hydrant.x + dir.x * 6, z: hydrant.z + dir.z * 6, yawRad: from.yawRad };
  const swept = collision.sweep(from, to, body);
  assert.equal(swept.blocked, true);
  assert.ok(!overlapsDecor({ ...swept.pose }, hydrant), 'nu a tunelat prin hidrant');
});

test('hidrantul din calea mașinii este atins chiar și când mașina este lângă el la pornire', () => {
  const collision = createCollisionProbe();
  const body = { halfX: HALF.x, halfZ: HALF.z };
  const tree = plan.items.find((entry) => entry.kind === 'tree')!;
  const pose = { x: tree.x + 0.2, z: tree.z, yawRad: 0.3 };
  assert.ok(collision.deepestPenetrationM(pose, body) > 0.5);
  const swept = collision.sweep(pose, { ...pose, x: pose.x + 0.01 }, body);
  assert.ok(!overlapsDecor(swept.pose, tree), 'este scos din copac, nu rămâne în el');
});

function frontOf(item: CityDecorItem) {
  return { x: Math.sin(item.rotationY), z: Math.cos(item.rotationY) };
}

/** Direcția medie, în coordonate de lume, a vârfurilor din intervalul de înălțime dat. */
function worldDirectionOfPart(item: CityDecorItem, minY: number, maxY: number) {
  const geometry = buildCityDecorGeometry({ ...plan, items: [item] });
  const positions = geometry[0]!.positions;
  let sx = 0;
  let sz = 0;
  let n = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1]!;
    if (y < minY || y > maxY) continue;
    sx += positions[i]! - item.x;
    sz += positions[i + 2]! - item.z;
    n += 1;
  }
  assert.ok(n > 0);
  const length = Math.hypot(sx, sz) || 1;
  return { x: sx / length, z: sz / length };
}

test('toate băncile au spătarul spre exterior și șezutul spre carosabil', () => {
  const benches = plan.items.filter((entry) => entry.kind === 'bench');
  assert.ok(benches.length >= 10, `${benches.length} bănci`);
  const seenFront = new Set<string>();
  for (const bench of benches) {
    const toRoad = nearestRoadDirection(bench);
    // Spătarul (cutia de la 0,54–1,02 m) trebuie să fie de partea opusă carosabilului.
    const back = worldDirectionOfPart(bench, 0.53, 1.03);
    assert.ok(
      back.x * toRoad.x + back.z * toRoad.z < -0.5,
      `${bench.id}: spătarul este spre stradă`,
    );
    const front = frontOf(bench);
    assert.ok(
      front.x * toRoad.x + front.z * toRoad.z > 0.5,
      `${bench.id}: fața nu este spre stradă`,
    );
    seenFront.add(`${Math.round(front.x)}:${Math.round(front.z)}`);
  }
  // Orientările acoperă mai multe laturi ale străzii, nu una singură.
  assert.ok(seenFront.size >= 2, `fețe observate: ${[...seenFront].join(' ')}`);
});

test('adăpostul și brațul stâlpului sunt orientate consecvent spre carosabil', () => {
  for (const shelter of plan.items.filter((entry) => entry.kind === 'bus-shelter')) {
    const toRoad = nearestRoadDirection(shelter);
    // Banca adăpostului (+Z local) este spre stradă; peretele de sticlă (−Z) rămâne în spate.
    const seat = worldDirectionOfPart(shelter, 0.45, 0.55);
    assert.ok(
      seat.x * toRoad.x + seat.z * toRoad.z > 0,
      `${shelter.id}: banca adăpostului nu este spre stradă`,
    );
  }
  for (const lamp of plan.items.filter((entry) => entry.kind === 'street-lamp')) {
    const toRoad = nearestRoadDirection(lamp);
    // Brațul și corpul lămpii (4,6–4,9 m) se întind spre carosabil.
    const arm = worldDirectionOfPart(lamp, 4.6, 4.9);
    assert.ok(arm.x * toRoad.x + arm.z * toRoad.z > 0.5, `${lamp.id}: brațul nu este spre stradă`);
  }
});

test('lista de tipuri de decor testate acoperă toate tipurile planului', () => {
  const kinds = new Set(plan.items.map((entry) => entry.kind));
  for (const kind of kinds) assert.ok(DECOR_KINDS.includes(kind), `tip netestat ${kind}`);
});

test('după impact, frâna ținută dă marșarier lent și mașina iese fără să pătrundă în obstacol', () => {
  const tree = plan.items.find((entry) => entry.kind === 'tree')!;
  const toRoad = nearestRoadDirection(tree);
  const from = approach(tree, { x: -toRoad.x, z: -toRoad.z }, 14);
  const { model } = build(from.x, from.z, from.yaw);
  let car = { x: from.x, z: from.z, yawRad: from.yaw, speedMps: 0 };
  driveFullThrottle(model, 600, (next) => (car = next));
  assert.equal(car.speedMps, 0);
  const stuck = { x: car.x, z: car.z };
  model.port.setAction('throttle', false);
  model.port.setAction('brake', true);
  let minSpeed = 0;
  for (let tick = 602; tick <= 760; tick += 1) {
    const frame = model.step({ tick });
    const now = frame.vehicles[0]!;
    car = {
      x: now.positionM.x,
      z: now.positionM.z,
      yawRad: now.yawRad,
      speedMps: now.speedMps,
    };
    minSpeed = Math.min(minSpeed, now.speedMps);
    assert.ok(!overlapsDecor(car, tree), 'marșarierul nu pătrunde în copac');
  }
  assert.ok(minSpeed < -0.5 && minSpeed >= -3, `marșarier limitat (${minSpeed.toFixed(2)} m/s)`);
  assert.ok(Math.hypot(car.x - stuck.x, car.z - stuck.z) > 1, 'mașina s-a depărtat de obstacol');
  model.dispose();
});

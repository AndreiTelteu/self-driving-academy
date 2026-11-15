/**
 * PBI 242 — nicio rază razantă nu ajunge la `clearColor` prin crăpăturile carosabilului.
 *
 * Cauza dungii de culoarea cerului are două părți: rosturile dintre benzi (acoperite de
 * `deriveRoadFill`, vezi `tests/world/road-surface.test.ts`) și lipsa feței verticale a bordurii.
 * Aici raza pornește de la înălțimea ochilor de pe carosabil și țintește marginea bordurii la cotele
 * 0–0,16 m: fără fața bordurii trece pe sub plăcile trotuarului și iese în cer.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Ray } from '@babylonjs/core/Culling/ray.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import { createCityScene } from '../../src/rendering/babylon/city-scene';
import { deriveRoadFill } from '../../src/rendering/road-surface';
import { createCityLayout, createNeighbourhoodMap, type CityPlanarElement } from '../../src/world';

const layout = createCityLayout(createNeighbourhoodMap());

function withCity(run: (scene: Scene) => void): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const city = createCityScene(scene, layout);
  for (const mesh of scene.meshes) {
    mesh.isPickable = true;
    mesh.computeWorldMatrix(true);
  }
  try {
    run(scene);
  } finally {
    city.dispose();
    scene.dispose();
    engine.dispose();
  }
}

test('242 razele de pe carosabil spre marginea blocului nu ating cerul (laturi și colțuri)', () => {
  withCity((scene) => {
    const grounds = (layout.elements as readonly CityPlanarElement[]).filter(
      (element) => element.kind === 'GROUND',
    );
    assert.equal(grounds.length, 16);
    let rays = 0;
    let sky = 0;
    const missed: string[] = [];
    for (const ground of grounds) {
      const xs = ground.footprintM.map((vertex) => vertex.x);
      const zs = ground.footprintM.map((vertex) => vertex.z);
      const lo = { x: Math.min(...xs), z: Math.min(...zs) };
      const hi = { x: Math.max(...xs), z: Math.max(...zs) };
      const sides = [
        { out: { x: 0, z: -1 }, from: { x: lo.x, z: lo.z }, to: { x: hi.x, z: lo.z } },
        { out: { x: 0, z: 1 }, from: { x: lo.x, z: hi.z }, to: { x: hi.x, z: hi.z } },
        { out: { x: -1, z: 0 }, from: { x: lo.x, z: lo.z }, to: { x: lo.x, z: hi.z } },
        { out: { x: 1, z: 0 }, from: { x: hi.x, z: lo.z }, to: { x: hi.x, z: hi.z } },
      ];
      for (const side of sides) {
        const length = Math.hypot(side.to.x - side.from.x, side.to.z - side.from.z);
        // Primii și ultimii 3 m din 0,25 în 0,25 m (colțurile), restul din 15 în 15 m.
        const offsets: number[] = [];
        for (let d = 0.05; d <= 3; d += 0.25) offsets.push(d, length - d);
        for (let d = 3; d < length - 3; d += 15) offsets.push(d);
        for (const offset of offsets) {
          const t = offset / length;
          const edge = {
            x: side.from.x + (side.to.x - side.from.x) * t,
            z: side.from.z + (side.to.z - side.from.z) * t,
          };
          for (const distance of [2.5, 25]) {
            const eye = new Vector3(
              edge.x + side.out.x * distance,
              1.7,
              edge.z + side.out.z * distance,
            );
            for (const targetY of [0.005, 0.03, 0.07, 0.11, 0.15]) {
              const target = new Vector3(
                edge.x - side.out.x * 0.01,
                targetY,
                edge.z - side.out.z * 0.01,
              );
              const hit = scene.pickWithRay(new Ray(eye, target.subtract(eye).normalize(), 400));
              rays += 1;
              if (!hit?.hit) {
                sky += 1;
                if (missed.length < 3)
                  missed.push(`${ground.id} (${edge.x.toFixed(1)}, ${edge.z.toFixed(1)})`);
              }
            }
          }
        }
      }
    }
    assert.ok(rays > 10000, `${rays} raze`);
    assert.equal(sky, 0, `${sky} din ${rays} raze ating cerul, ex.: ${missed.join('; ')}`);
  });
});

test('242 fața bordurii este orientată spre stradă și are culoarea bordurii', () => {
  withCity((scene) => {
    const curbMesh = scene.getMeshByName('city:batch:curb')!;
    const positions = curbMesh.getVerticesData('position')!;
    const normals = curbMesh.getVerticesData('normal')!;
    const indices = curbMesh.getIndices()!;
    // Triunghiurile verticale (normala orizontală): fiecare privește spre exteriorul blocului.
    let vertical = 0;
    for (let index = 0; index < indices.length; index += 3) {
      const a = indices[index]!;
      if (Math.abs(normals[a * 3 + 1]!) > 0.5) continue;
      vertical += 1;
      const x = positions[a * 3]!;
      const z = positions[a * 3 + 2]!;
      const nx = normals[a * 3]!;
      const nz = normals[a * 3 + 2]!;
      // Exteriorul este în afara blocului (terenul GROUND care conține punctul, pe margine).
      const ground = (layout.elements as readonly CityPlanarElement[]).find((element) => {
        if (element.kind !== 'GROUND') return false;
        const gx = element.footprintM.map((vertex) => vertex.x);
        const gz = element.footprintM.map((vertex) => vertex.z);
        return (
          x >= Math.min(...gx) - 0.01 &&
          x <= Math.max(...gx) + 0.01 &&
          z >= Math.min(...gz) - 0.01 &&
          z <= Math.max(...gz) + 0.01
        );
      })!;
      const gx = ground.footprintM.map((vertex) => vertex.x);
      const gz = ground.footprintM.map((vertex) => vertex.z);
      const centerX = (Math.min(...gx) + Math.max(...gx)) / 2;
      const centerZ = (Math.min(...gz) + Math.max(...gz)) / 2;
      const outward = Math.hypot(x - centerX, z - centerZ);
      assert.ok(
        (nx * (x - centerX) + nz * (z - centerZ)) / outward > 0.5,
        `față cu normala (${nx.toFixed(2)}, ${nz.toFixed(2)}) la (${x.toFixed(2)}, ${z.toFixed(2)}) privește spre interior`,
      );
    }
    assert.equal(
      vertical,
      64 * 2 + 32 * 4 * 2,
      'bordura (64) și capetele benzilor N/S (32 × 2 × 2 pereți)',
    );
  });
});

test('242 sub fiecare fâșie de umplere (mediană și rost între benzi) raza verticală ajunge la asfalt', () => {
  withCity((scene) => {
    const { strips } = deriveRoadFill(layout);
    assert.equal(strips.length, 56);
    for (const strip of strips) {
      for (const t of [0.1, 0.5, 0.9]) {
        const a = strip.footprintM[0]!;
        const b = strip.footprintM[1]!;
        const c = strip.footprintM[3]!;
        const x = a.x + (b.x - a.x) * t + (c.x - a.x) * 0.5;
        const z = a.z + (b.z - a.z) * t + (c.z - a.z) * 0.5;
        const hit = scene.pickWithRay(new Ray(new Vector3(x, 5, z), new Vector3(0, -1, 0), 10));
        assert.ok(hit?.hit, `${strip.id}: gol la (${x.toFixed(2)}, ${z.toFixed(2)})`);
        assert.ok(
          ['city:batch:asphalt', 'city:batch:marking', 'city:batch:service'].includes(
            hit!.pickedMesh!.name,
          ),
          `${strip.id}: ${hit!.pickedMesh!.name}`,
        );
      }
    }
  });
});

/**
 * PBI 242 — ordinea pe verticală a suprafețelor fără z-fighting.
 *
 * Două suprafețe planare care se suprapun pe arie nenulă trebuie să difere ca înălțime (sau, dacă au
 * aceeași cotă, să aibă același material, deci aceeași culoare și nicio luptă vizibilă: marcajele,
 * liniile de oprire și zebrele sunt toate materialul `marking`). Se verifică
 * pe toate perechile de elemente ale layout-ului implicit, plus fâșiile de umplere și fețele de
 * bordură, cu decupare Sutherland–Hodgman pe poligoane convexe.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { DEPTH_BIAS } from '../../src/rendering/babylon/city-scene';
import { deriveRoadFill } from '../../src/rendering/road-surface';
import { createCityLayout, createNeighbourhoodMap, type CityPlanarElement } from '../../src/world';

type P = { x: number; z: number };

function area(poly: readonly P[]): number {
  let sum = 0;
  for (let index = 0; index < poly.length; index += 1) {
    const a = poly[index]!;
    const b = poly[(index + 1) % poly.length]!;
    sum += a.x * b.z - b.x * a.z;
  }
  return sum / 2;
}

/** Intersecția a două poligoane convexe (subject decupat de fiecare muchie a clipului). */
function overlapArea(subject: readonly P[], clip: readonly P[]): number {
  const orientation = Math.sign(area(clip)) || 1;
  let output: P[] = [...subject];
  for (let index = 0; index < clip.length && output.length > 0; index += 1) {
    const a = clip[index]!;
    const b = clip[(index + 1) % clip.length]!;
    const inside = (p: P) =>
      orientation * ((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)) >= -1e-12;
    const cut = (p: P, q: P): P => {
      const dp = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
      const dq = (b.x - a.x) * (q.z - a.z) - (b.z - a.z) * (q.x - a.x);
      const t = dp / (dp - dq);
      return { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t };
    };
    const input = output;
    output = [];
    for (let k = 0; k < input.length; k += 1) {
      const current = input[k]!;
      const previous = input[(k + input.length - 1) % input.length]!;
      if (inside(current)) {
        if (!inside(previous)) output.push(cut(previous, current));
        output.push(current);
      } else if (inside(previous)) output.push(cut(previous, current));
    }
  }
  return output.length < 3 ? 0 : Math.abs(area(output));
}

const layout = createCityLayout(createNeighbourhoodMap());

interface Surface {
  readonly id: string;
  readonly kind: string;
  readonly y: number;
  readonly polygon: readonly P[];
  readonly box: readonly [number, number, number, number];
}

/** Materialul de desen al fiecărui tip (ca în `colorForPlanar`): același material înseamnă aceeași culoare. */
const MATERIAL: Readonly<Record<string, string>> = {
  LANE_SURFACE: 'asphalt',
  FILL: 'asphalt',
  INTERSECTION_SURFACE: 'intersection',
  LANE_MARKING: 'marking',
  STOP_LINE: 'marking',
  CROSSWALK: 'marking',
  SERVICE_ZONE: 'service',
  GROUND: 'ground',
  SIDEWALK: 'sidewalk',
  CURB: 'curb',
};

function surface(id: string, kind: string, y: number, ring: readonly P[]): Surface {
  const xs = ring.map((p) => p.x);
  const zs = ring.map((p) => p.z);
  return {
    id,
    kind,
    y,
    polygon: ring,
    box: [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)],
  };
}

test('242 nicio pereche de suprafețe suprapuse nu are aceeași cotă (fără z-fighting)', () => {
  const surfaces: Surface[] = [];
  for (const element of layout.elements) {
    if (element.kind === 'SIGNAL_HEAD' || element.kind === 'BUILDING') continue;
    // Barele zebra și dungile sunt desenate din poligonul elementului; ribbon-urile drepte sunt convexe.
    surfaces.push(surface(element.id, element.kind, element.baseYM, element.footprintM));
  }
  for (const strip of deriveRoadFill(layout).strips)
    surfaces.push(surface(strip.id, 'FILL', strip.baseYM, strip.footprintM));
  let overlaps = 0;
  const problems: string[] = [];
  for (let i = 0; i < surfaces.length; i += 1)
    for (let j = i + 1; j < surfaces.length; j += 1) {
      const a = surfaces[i]!;
      const b = surfaces[j]!;
      if (
        a.box[1] <= b.box[0] ||
        b.box[1] <= a.box[0] ||
        a.box[3] <= b.box[2] ||
        b.box[3] <= a.box[2]
      )
        continue;
      if (overlapArea(a.polygon, b.polygon) < 1e-6) continue;
      overlaps += 1;
      if (Math.abs(a.y - b.y) < 1e-6 && MATERIAL[a.kind] !== MATERIAL[b.kind])
        problems.push(`${a.id} (${a.kind}) ~ ${b.id} (${b.kind}) la y=${a.y}`);
    }
  assert.ok(overlaps > 100, `${overlaps} suprapuneri verificate`);
  assert.deepEqual(problems.slice(0, 8), [], `${problems.length} perechi la aceeași cotă`);
});

test('242 marcajele stau deasupra asfaltului și a trecerilor, iar terenul sub trotuar', () => {
  const y = (kind: string) =>
    (layout.elements as readonly CityPlanarElement[]).find((element) => element.kind === kind)!
      .baseYM;
  assert.ok(y('LANE_MARKING') > y('CROSSWALK'));
  assert.ok(y('CROSSWALK') > y('LANE_SURFACE'));
  assert.ok(y('SIDEWALK') > y('GROUND'));
  assert.ok(y('CURB') > y('SIDEWALK'));
  // Offset de adâncime: marcajul (negativ) trage spre cameră, terenul (pozitiv) o depărtează.
  assert.ok(DEPTH_BIAS.marking!.factor < 0 && DEPTH_BIAS.marking!.units < 0);
  assert.ok(DEPTH_BIAS.ground!.factor > 0 && DEPTH_BIAS.ground!.units > 0);
});

/**
 * PBI 242 — carosabil continuu: uniunea benzilor și a fâșiilor de umplere acoperă lățimea dintre
 * borduri fără goluri mai mari de 1 mm, pe harta implicită și pe fixturile de hartă.
 *
 * Verificarea este independentă de derivare: secțiuni transversale tăiate prin fiecare bandă dreaptă
 * (intersecție exactă cu poligoanele, nu eșantionare), comparate cu marginile blocurilor (GROUND).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { ROAD_SURFACE_POLICY, deriveRoadFill } from '../../src/rendering/road-surface';
import {
  createCityLayout,
  createNeighbourhoodMap,
  type CityLayout,
  type CityPlanarElement,
  type RoadMap,
} from '../../src/world';
import { intersectionConflictFixture } from '../world/intersection-conflicts-fixture';
import { minimalMap } from '../world/fixture';

type Pt = { readonly x: number; readonly z: number };
const GAP_LIMIT_M = 0.001;

function signedArea(ring: readonly Pt[]): number {
  let sum = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index]!;
    const b = ring[(index + 1) % ring.length]!;
    sum += a.x * b.z - b.x * a.z;
  }
  return sum / 2;
}

/** Intervalul [t0, t1] al parametrului dreptei p + t·d în interiorul unui poligon convex. */
function clipLine(ring: readonly Pt[], origin: Pt, dir: Pt): [number, number] | null {
  const sign = signedArea(ring) >= 0 ? 1 : -1;
  let t0 = -Infinity;
  let t1 = Infinity;
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index]!;
    const b = ring[(index + 1) % ring.length]!;
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    if (Math.hypot(ex, ez) < 1e-12) continue;
    // Interiorul este în stânga muchiei (CCW) sau în dreapta (CW): n·(p − a) ≥ 0.
    const nx = -ez * sign;
    const nz = ex * sign;
    const denominator = nx * dir.x + nz * dir.z;
    const numerator = nx * (origin.x - a.x) + nz * (origin.z - a.z);
    if (Math.abs(denominator) < 1e-12) {
      if (numerator < -1e-12) return null;
      continue;
    }
    const t = -numerator / denominator;
    if (denominator > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
  }
  return t0 <= t1 ? [t0, t1] : null;
}

function merge(intervals: [number, number][]): [number, number][] {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const interval of sorted) {
    const last = out[out.length - 1];
    if (last && interval[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], interval[1]);
    else out.push([interval[0], interval[1]]);
  }
  return out;
}

function laneAxis(element: CityPlanarElement): Pt[] {
  const half = element.footprintM.length / 2;
  const axis: Pt[] = [];
  for (let index = 0; index < half; index += 1) {
    const left = element.footprintM[index]!;
    const right = element.footprintM[element.footprintM.length - 1 - index]!;
    axis.push({ x: (left.x + right.x) / 2, z: (left.z + right.z) / 2 });
  }
  return axis;
}

interface Section {
  readonly laneId: string;
  readonly origin: Pt;
  readonly normal: Pt;
  /** Marginile benzilor (fără umplere), îmbinate, în coordonata laterală. */
  readonly lanesOnly: [number, number][];
  readonly withFill: [number, number][];
  readonly hull: [number, number];
}

/** Secțiuni transversale prin mijlocul fiecărei benzi drepte; hull = lanțul de benzi (rosturi ≤ 2 m). */
function sections(layout: CityLayout): Section[] {
  const fill = deriveRoadFill(layout);
  const lanes = (layout.elements as readonly CityPlanarElement[]).filter(
    (element) => element.kind === 'LANE_SURFACE',
  );
  const out: Section[] = [];
  for (const lane of lanes) {
    const axis = laneAxis(lane);
    const first = axis[0]!;
    const last = axis[axis.length - 1]!;
    const length = Math.hypot(last.x - first.x, last.z - first.z);
    const dx = (last.x - first.x) / length;
    const dz = (last.z - first.z) / length;
    const straight = axis.every(
      (p) =>
        Math.abs((p.x - first.x) * dz - (p.z - first.z) * dx) <
        ROAD_SURFACE_POLICY.straightToleranceM,
    );
    if (!straight) continue;
    const origin = { x: (first.x + last.x) / 2, z: (first.z + last.z) / 2 };
    const normal = { x: dz, z: -dx };
    // Doar benzile paralele cu banda secțiunii formează o stradă; fixturile de intersecție au benzi
    // oblice între ele, care nu sunt un fascicul și nu au ce umple.
    const parallel = lanes.filter((candidate) => {
      const candidateAxis = laneAxis(candidate);
      const a = candidateAxis[0]!;
      const b = candidateAxis[candidateAxis.length - 1]!;
      const norm = Math.hypot(b.x - a.x, b.z - a.z);
      return norm > 0 && Math.abs(((b.x - a.x) * dz - (b.z - a.z) * dx) / norm) < 1e-6;
    });
    const lanesOnly = merge(
      parallel.flatMap((candidate) => {
        const hit = clipLine(candidate.footprintM, origin, normal);
        return hit ? [hit] : [];
      }),
    );
    const strips = fill.strips.flatMap((strip) => {
      const hit = clipLine(strip.footprintM, origin, normal);
      return hit ? [hit] : [];
    });
    const withFill = merge([...lanesOnly.map((i) => [...i] as [number, number]), ...strips]);
    // Lanțul care conține banda curentă (t = 0), cu rosturi de cel mult maxGapM între benzi.
    const chain = lanesOnly.findIndex((interval) => interval[0] <= 1e-9 && interval[1] >= -1e-9);
    let lo = chain;
    let hi = chain;
    while (lo > 0 && lanesOnly[lo]![0] - lanesOnly[lo - 1]![1] <= ROAD_SURFACE_POLICY.maxGapM)
      lo -= 1;
    while (
      hi < lanesOnly.length - 1 &&
      lanesOnly[hi + 1]![0] - lanesOnly[hi]![1] <= ROAD_SURFACE_POLICY.maxGapM
    )
      hi += 1;
    out.push({
      laneId: lane.laneId ?? lane.id,
      origin,
      normal,
      lanesOnly,
      withFill,
      hull: [lanesOnly[lo]![0], lanesOnly[hi]![1]],
    });
  }
  return out;
}

/** Cel mai mare gol al uniunii în interiorul intervalului hull. */
function largestGap(intervals: readonly [number, number][], hull: [number, number]): number {
  let gap = 0;
  let cursor = hull[0];
  for (const [lo, hi] of intervals) {
    if (hi < hull[0] || lo > hull[1]) continue;
    gap = Math.max(gap, lo - cursor);
    cursor = Math.max(cursor, hi);
  }
  return Math.max(gap, hull[1] - cursor);
}

const MAPS: readonly (readonly [string, () => RoadMap])[] = [
  ['neighbourhood-compact-v1', () => createNeighbourhoodMap()],
  ['minimal-road-v1', () => minimalMap()],
  ['intersection-CROSS-v1', () => intersectionConflictFixture('CROSS') as RoadMap],
  ['intersection-T-v1', () => intersectionConflictFixture('T') as RoadMap],
];

for (const [name, build] of MAPS) {
  test(`242 carosabil continuu pe ${name}: gol maxim ≤ 1 mm în fiecare secțiune`, () => {
    let layout: CityLayout;
    try {
      layout = createCityLayout(build());
    } catch (error) {
      // Un fixture negativ al hărții poate fi refuzat de parser; nu este o hartă jucabilă.
      assert.fail(`${name}: harta nu produce layout (${(error as Error).message})`);
    }
    const found = sections(layout);
    assert.ok(found.length > 0, `${name}: există benzi drepte`);
    for (const section of found) {
      const gap = largestGap(section.withFill, section.hull);
      assert.ok(
        gap <= GAP_LIMIT_M,
        `${name} ${section.laneId}: gol de ${(gap * 1000).toFixed(1)} mm între borduri`,
      );
    }
  });
}

test('242 cauza este reală: fără fâșii, harta implicită are goluri de 0,3 m și 0,8 m între benzi', () => {
  const layout = createCityLayout(createNeighbourhoodMap());
  const gaps = new Set<string>();
  for (const section of sections(layout)) {
    const gap = largestGap(section.lanesOnly, section.hull);
    if (gap > GAP_LIMIT_M) gaps.add(gap.toFixed(3));
  }
  // Mediana de 0,8 m (2 × CENTER_BUFFER_M) pe fiecare stradă; 0,3 m între benzile unei artere.
  assert.ok(gaps.has('0.800'), `mediana de 0,8 m lipsește din ${[...gaps].join(', ')}`);
  assert.ok(gaps.size >= 1);
});

test('242 harta implicită: marginile carosabilului ating blocurile sau marginea orașului', () => {
  const layout = createCityLayout(createNeighbourhoodMap());
  const grounds = (layout.elements as readonly CityPlanarElement[]).filter(
    (element) => element.kind === 'GROUND',
  );
  const edges = (axis: 'x' | 'z') =>
    grounds.flatMap((ground) => {
      const values = ground.footprintM.map((vertex) => vertex[axis]);
      return [Math.min(...values), Math.max(...values)];
    });
  const xs = edges('x');
  const zs = edges('z');
  const extentMin = { x: -3.8, z: -3.8 };
  const extentMax = { x: 723.8, z: 723.8 };
  const tolerance = GAP_LIMIT_M;
  let touching = 0;
  for (const section of sections(layout)) {
    const axisIsX = Math.abs(section.normal.x) < 1e-9; // secțiune în z: banda merge pe x
    const base = axisIsX ? section.origin.z : section.origin.x;
    const sign = axisIsX ? section.normal.z : section.normal.x;
    const edgesAlong = axisIsX ? zs : xs;
    const min = axisIsX ? extentMin.z : extentMin.x;
    const max = axisIsX ? extentMax.z : extentMax.x;
    for (const t of section.hull) {
      const position = base + sign * t;
      const onBlock = edgesAlong.some((edge) => Math.abs(edge - position) <= tolerance);
      const onExtent =
        Math.abs(position - min) <= tolerance || Math.abs(position - max) <= tolerance;
      assert.ok(
        onBlock || onExtent,
        `${section.laneId}: marginea ${position.toFixed(4)} nu atinge niciun bloc`,
      );
      touching += 1;
    }
  }
  assert.ok(touching >= 96 * 2 - 8, `margini verificate: ${touching}`);
});

test('242 fâșiile nu se suprapun cu benzile (fără z-fighting) și au ordine deterministă', () => {
  const layout = createCityLayout(createNeighbourhoodMap());
  const report = deriveRoadFill(layout);
  assert.equal(report.skipped.length, 0);
  // 8 segmente de arteră × 3 rosturi + 32 segmente locale × 1 median.
  assert.equal(report.strips.length, 8 * 3 + 32 * 1);
  const lanes = (layout.elements as readonly CityPlanarElement[]).filter(
    (element) => element.kind === 'LANE_SURFACE',
  );
  for (const strip of report.strips) {
    const center = {
      x: strip.footprintM.reduce((sum, p) => sum + p.x, 0) / 4,
      z: strip.footprintM.reduce((sum, p) => sum + p.z, 0) / 4,
    };
    for (const lane of lanes) {
      const hit = clipLine(lane.footprintM, center, { x: 1, z: 0 });
      assert.ok(!hit || hit[0] > 1e-9 || hit[1] < -1e-9, `${strip.id} acoperă ${lane.id}`);
    }
    assert.ok(strip.widthM > 0.29 && strip.widthM < 0.81, `${strip.id}: ${strip.widthM}`);
  }
  assert.deepEqual(
    deriveRoadFill(createCityLayout(createNeighbourhoodMap())).strips.map((s) => s.id),
    report.strips.map((s) => s.id),
  );
});

test('242 banda curbă este raportată, nu umplută pe ghicite', () => {
  const layout = createCityLayout(minimalMap());
  const report = deriveRoadFill(layout);
  assert.ok(report.skipped.length >= 1, 'g-c are un cot și nu este dreaptă');
});

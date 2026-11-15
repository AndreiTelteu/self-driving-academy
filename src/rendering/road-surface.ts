/**
 * PBI 242 — suprafața carosabilă continuă între borduri.
 *
 * Suprafețele `LANE_SURFACE` ale lui 042 au exact lățimea benzii. Harta autorată lasă însă între
 * benzi un interval deliberat: `CENTER_BUFFER_M` pe fiecare parte a axei (0,8 m între sensurile
 * opuse) și `LANE_GAP_M` (0,3 m) între benzile aceluiași sens pe arteră. Intervalul nu are nicio
 * suprafață, deci prin el se vedea `clearColor` (dunga de culoarea cerului din audit), exact sub
 * marcajul axial. Modulul (de prezentare: numai tipuri din domeniu) derivă, pur și determinist, fâșiile care umplu aceste intervale; layout-ul
 * 042 (benzile, ID-urile, lățimile) rămâne neschimbat, iar fâșiile sunt geometrie de prezentare cu
 * ID propriu `fill:*`, nu elemente ale lumii.
 *
 * Ipoteza este declarată: banda este dreaptă (axa ei este o dreaptă). Două benzi sunt vecine când
 * sunt paralele, se suprapun pe lungime, între marginile lor nu stă altă bandă, iar intervalul
 * dintre ele este între `minGapM` și `maxGapM`. O bandă curbă nu este umplută pe ghicite: este
 * raportată în `skipped`.
 */
import type { CityLayout, CityPlanarElement } from '../world';

export const ROAD_SURFACE_VERSION = '242-road-surface-v1' as const;

export const ROAD_SURFACE_POLICY = Object.freeze({
  contract: ROAD_SURFACE_VERSION,
  /** Intervalele mai mici sunt eroare numerică, nu un gol de umplut. */
  minGapM: 1e-6,
  /** Un interval mai lat nu este un rost între benzi, ci o mediană reală (nu se acoperă). */
  maxGapM: 2,
  /** Toleranța de coliniaritate a axei unei benzi drepte și de paralelism. */
  straightToleranceM: 1e-4,
});

export interface RoadFillStrip {
  readonly id: string;
  /** Cele două benzi vecine pe care le unește (ordonate lexicografic). */
  readonly laneIds: readonly [string, string];
  readonly baseYM: number;
  /** Dreptunghi (4 colțuri), în planul benzilor. */
  readonly footprintM: readonly Readonly<{ x: number; y: number; z: number }>[];
  readonly widthM: number;
  readonly lengthM: number;
}

export interface RoadFillReport {
  readonly strips: readonly RoadFillStrip[];
  /** Benzi care nu sunt drepte și deci nu participă la umplere. */
  readonly skipped: readonly string[];
}

interface Lane {
  readonly id: string;
  readonly baseYM: number;
  readonly originX: number;
  readonly originZ: number;
  /** Direcția axei, unitară. */
  readonly dx: number;
  readonly dz: number;
  readonly vertices: readonly Readonly<{ x: number; z: number }>[];
}

interface Interval {
  readonly latLo: number;
  readonly latHi: number;
  readonly lonLo: number;
  readonly lonHi: number;
}

/** Axa benzii: mijlocul perechilor stânga/dreapta ale panglicii. */
function laneAxis(element: CityPlanarElement): { x: number; z: number }[] {
  const half = element.footprintM.length / 2;
  const line: { x: number; z: number }[] = [];
  for (let index = 0; index < half; index += 1) {
    const left = element.footprintM[index]!;
    const right = element.footprintM[element.footprintM.length - 1 - index]!;
    line.push({ x: (left.x + right.x) / 2, z: (left.z + right.z) / 2 });
  }
  return line;
}

/** Intervalul ocupat de o bandă în cadrul (origine, direcție) al altei benzi. */
function intervalIn(frame: Lane, lane: Lane): Interval {
  const nx = frame.dz;
  const nz = -frame.dx;
  let latLo = Infinity;
  let latHi = -Infinity;
  let lonLo = Infinity;
  let lonHi = -Infinity;
  for (const vertex of lane.vertices) {
    const rx = vertex.x - frame.originX;
    const rz = vertex.z - frame.originZ;
    const lat = rx * nx + rz * nz;
    const lon = rx * frame.dx + rz * frame.dz;
    latLo = Math.min(latLo, lat);
    latHi = Math.max(latHi, lat);
    lonLo = Math.min(lonLo, lon);
    lonHi = Math.max(lonHi, lon);
  }
  return { latLo, latHi, lonLo, lonHi };
}

/**
 * Derivă fâșiile de umplere ale rosturilor dintre benzile vecine. Determinist: benzile sunt
 * parcurse în ordinea ID-urilor, iar fiecare pereche apare o singură dată.
 */
export function deriveRoadFill(layout: CityLayout): RoadFillReport {
  const policy = ROAD_SURFACE_POLICY;
  const lanes: Lane[] = [];
  const skipped: string[] = [];
  for (const element of layout.elements) {
    if (element.kind !== 'LANE_SURFACE') continue;
    const planar = element as CityPlanarElement;
    const axis = laneAxis(planar);
    const first = axis[0];
    const last = axis[axis.length - 1];
    const length = first && last ? Math.hypot(last.x - first.x, last.z - first.z) : 0;
    if (!first || !last || length === 0) {
      skipped.push(planar.laneId ?? planar.id);
      continue;
    }
    const dx = (last.x - first.x) / length;
    const dz = (last.z - first.z) / length;
    const straight = axis.every(
      (sample) =>
        Math.abs((sample.x - first.x) * dz - (sample.z - first.z) * dx) <=
        policy.straightToleranceM,
    );
    if (!straight) {
      skipped.push(planar.laneId ?? planar.id);
      continue;
    }
    lanes.push({
      id: planar.laneId ?? planar.id,
      baseYM: planar.baseYM,
      originX: first.x,
      originZ: first.z,
      dx,
      dz,
      vertices: planar.footprintM,
    });
  }
  lanes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const strips: RoadFillStrip[] = [];
  for (let i = 0; i < lanes.length; i += 1) {
    const a = lanes[i]!;
    const aSelf = intervalIn(a, a);
    for (let j = i + 1; j < lanes.length; j += 1) {
      const b = lanes[j]!;
      // Paralele: direcția lui b este ±direcția lui a.
      if (Math.abs(a.dx * b.dz - a.dz * b.dx) > policy.straightToleranceM) continue;
      const bIn = intervalIn(a, b);
      const lonLo = Math.max(aSelf.lonLo, bIn.lonLo);
      const lonHi = Math.min(aSelf.lonHi, bIn.lonHi);
      if (lonHi - lonLo <= policy.minGapM) continue;
      // b este de o parte sau de cealaltă a lui a în cadrul lui a.
      const gapHigh = bIn.latLo - aSelf.latHi;
      const gapLow = aSelf.latLo - bIn.latHi;
      const high = gapHigh > policy.minGapM && gapHigh <= policy.maxGapM;
      const low = gapLow > policy.minGapM && gapLow <= policy.maxGapM;
      if (!high && !low) continue;
      const latFrom = high ? aSelf.latHi : bIn.latHi;
      const latTo = high ? bIn.latLo : aSelf.latLo;
      // Vecine numai dacă între ele nu stă altă bandă (care ar fi suprapusă de fâșie).
      let separated = false;
      for (const c of lanes) {
        if (c === a || c === b) continue;
        const cIn = intervalIn(a, c);
        if (
          cIn.latLo < latTo - policy.minGapM &&
          cIn.latHi > latFrom + policy.minGapM &&
          Math.min(cIn.lonHi, lonHi) - Math.max(cIn.lonLo, lonLo) > policy.minGapM
        ) {
          separated = true;
          break;
        }
      }
      if (separated) continue;
      const nx = a.dz;
      const nz = -a.dx;
      const corner = (lon: number, lat: number) =>
        Object.freeze({
          x: a.originX + a.dx * lon + nx * lat,
          y: 0,
          z: a.originZ + a.dz * lon + nz * lat,
        });
      strips.push(
        Object.freeze({
          id: `fill:${a.id}|${b.id}`,
          laneIds: Object.freeze([a.id, b.id] as [string, string]),
          baseYM: a.baseYM,
          footprintM: Object.freeze([
            corner(lonLo, latFrom),
            corner(lonHi, latFrom),
            corner(lonHi, latTo),
            corner(lonLo, latTo),
          ]),
          widthM: latTo - latFrom,
          lengthM: lonHi - lonLo,
        }),
      );
    }
  }
  return Object.freeze({ strips: Object.freeze(strips), skipped: Object.freeze(skipped) });
}

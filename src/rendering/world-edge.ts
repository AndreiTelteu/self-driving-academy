/**
 * PBI 242 — geometria pură a terenului de dincolo de oraș, a dealurilor și a parapetului.
 *
 * Până la 242 terenul exista numai sub blocuri: dincolo de marginea orașului se vedea `clearColor`
 * și mașina putea ieși în vid. Aici se construiește, fără Babylon, DOM sau ceas:
 *
 * - un teren din bucle dreptunghiulare concentrice în jurul extinderii orașului. Între oraș și
 *   limita hărții este plat, la cota străzii; imediat în spatele limitei urcă o taluz (berm) de
 *   câțiva metri, iar mai departe un relief de dealuri care crește până la creste îndepărtate. Nu
 *   este un perete: relieful este continuu, cu înălțimea modulată de zgomot de valori determinist
 *   (hash întreg, fără `Math.random`), deci orizontul este o siluetă de creste, nu o linie dreaptă;
 * - culori pe vârf (iarbă, pădure, stâncă) amestecate spre culoarea cerului cu distanța
 *   (perspectivă atmosferică ușoară); PBI 243 adaugă ceața reală a scenei peste ele (culoarea orizontului);
 * - parapetul: stâlpi și grinzi pe linia limitei.
 *
 * Reliefului nu i se atașează nicio coliziune: limita este oprită de zidurile 192/238 din
 * `world-limit`, iar relieful din spatele parapetului nu poate fi atins.
 */
import type { WorldLimit, WorldRect } from '../world';

export const WORLD_EDGE_VERSION = '242-world-edge-v1' as const;

export const WORLD_EDGE_POLICY = Object.freeze({
  contract: WORLD_EDGE_VERSION,
  /** Distanțe față de limită (spre exterior) la care se așază buclele terenului; prima este limita. */
  loopDistancesM: Object.freeze([
    0, 6, 14, 30, 60, 110, 180, 270, 380, 520, 700, 900, 1150, 1400, 1750, 2100, 2500,
  ]),
  /** Taluzul din spatele parapetului: începe la 4 m de limită și atinge 2,4 m la 40 m. */
  bermStartM: 4,
  bermEndM: 40,
  bermHeightM: 2.4,
  /** Dealurile apropiate cresc până la ~110 m la 1,1 km, crestele îndepărtate până la ~270 m. */
  hillsStartM: 60,
  hillsEndM: 1100,
  hillsHeightM: 110,
  ridgesEndM: 2300,
  ridgesHeightM: 160,
  /**
   * Cota terenului plat. Este cu 2 mm peste benzile de trecere (0,015 m) și sub marcaje (0,02 m):
   * zebra care depășește cu 1,2 m marginea străzii pe perimetrul orașului rămâne sub iarbă, iar
   * pasul de 1,7 cm față de asfalt (cota 0) este închis de un perete (skirt) de-a lungul marginii.
   */
  apronLevelM: 0.017,
  /** Înălțimea parapetului. */
  railHeightM: 0.62,
  railBeamM: Object.freeze({ height: 0.32, thickness: 0.06 }),
  postM: Object.freeze({ width: 0.12, height: 0.95 }),
  /** Grinda stă imediat în afara limitei (fața ei interioară este chiar pe zidul de coliziune). */
  beamOutsetM: 0.06,
  postOutsetM: 0.2,
});

/** Culori liniare (aceeași convenție ca paleta orașului): iarbă, pădure, stâncă, ceață. */
export const WORLD_EDGE_COLORS = Object.freeze({
  grassA: Object.freeze([0.24, 0.29, 0.18] as const),
  grassB: Object.freeze([0.19, 0.26, 0.14] as const),
  forest: Object.freeze([0.1, 0.19, 0.11] as const),
  rock: Object.freeze([0.33, 0.31, 0.28] as const),
  /** Tenta orizontului (albastru-pal), aproape de culoarea ceții din starea de atmosferă (243). */
  haze: Object.freeze([0.22, 0.4, 0.58] as const),
});

export interface WorldEdgeTerrain {
  readonly positions: Float32Array;
  readonly colors: Float32Array;
  readonly indices: Uint32Array;
  readonly loops: number;
  readonly segmentsPerSide: number;
  readonly maxHeightM: number;
  /** Înălțimea reliefului într-un punct (aceeași funcție care a produs vârfurile). */
  heightAt(x: number, z: number): number;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Hash întreg determinist al unui punct de latice, în [0, 1). */
function lattice(ix: number, iz: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = lattice(ix, iz);
  const b = lattice(ix + 1, iz);
  const c = lattice(ix, iz + 1);
  const d = lattice(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/** Zgomot fractal în [0, 1]: trei octave pe lungimi de undă de 260, 110 și 45 m. */
export function terrainNoise(x: number, z: number): number {
  return (
    valueNoise(x / 260 + 11.3, z / 260 + 7.7) * 0.55 +
    valueNoise(x / 110 + 3.1, z / 110 + 19.9) * 0.3 +
    valueNoise(x / 45 + 29.7, z / 45 + 2.3) * 0.15
  );
}

/** Distanța euclidiană de la punct la dreptunghi (0 înăuntru). */
export function distanceOutside(rect: WorldRect, x: number, z: number): number {
  const dx = Math.max(rect.minX - x, 0, x - rect.maxX);
  const dz = Math.max(rect.minZ - z, 0, z - rect.maxZ);
  return Math.hypot(dx, dz);
}

export function createTerrainHeight(limit: WorldRect): (x: number, z: number) => number {
  const p = WORLD_EDGE_POLICY;
  return (x, z) => {
    const d = distanceOutside(limit, x, z);
    if (d <= p.bermStartM) return p.apronLevelM;
    const noise = terrainNoise(x, z);
    const berm = p.bermHeightM * smoothstep(p.bermStartM, p.bermEndM, d) * (0.85 + 0.3 * noise);
    const hills =
      p.hillsHeightM *
      Math.pow(smoothstep(p.hillsStartM, p.hillsEndM, d), 1.4) *
      (0.2 + 0.8 * noise);
    const ridges =
      p.ridgesHeightM *
      Math.pow(smoothstep(p.hillsEndM, p.ridgesEndM, d), 1.2) *
      (0.1 + 0.9 * noise * noise);
    const detail = (terrainNoise(x * 3.1, z * 3.1) - 0.5) * 1.2 * smoothstep(10, 90, d);
    return p.apronLevelM + Math.max(0, berm + hills + ridges + detail);
  };
}

function mix(a: readonly number[], b: readonly number[], t: number): [number, number, number] {
  return [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];
}

/**
 * Terenul: `loops` bucle dreptunghiulare; primele două sunt marginea orașului (peretele la cota 0 și
 * terenul la cota `apronLevelM`), a treia este limita hărții. Toate buclele au același număr de vârfuri, deci benzile
 * dintre ele sunt cvadrilatere index-la-index, fără cusături.
 */
export function buildWorldEdgeTerrain(
  worldLimit: WorldLimit,
  segmentsPerSide: number,
): WorldEdgeTerrain {
  const p = WORLD_EDGE_POLICY;
  const { extent, limit } = worldLimit;
  const heightAt = createTerrainHeight(limit);
  const perLoop = segmentsPerSide * 4;
  // Bucla 0 este peretele (skirt) la cota străzii, bucla 1 chiar marginea orașului la cota terenului;
  // apoi limita (distanța 0) și restul.
  const rects: WorldRect[] = [extent, extent];
  for (const distance of p.loopDistancesM)
    rects.push({
      minX: limit.minX - distance,
      maxX: limit.maxX + distance,
      minZ: limit.minZ - distance,
      maxZ: limit.maxZ + distance,
    });
  const loops = rects.length;
  const positions = new Float32Array(loops * perLoop * 3);
  const colors = new Float32Array(loops * perLoop * 4);
  let maxHeight = 0;
  for (let loop = 0; loop < loops; loop += 1) {
    const rect = rects[loop]!;
    for (let index = 0; index < perLoop; index += 1) {
      const side = Math.floor(index / segmentsPerSide);
      const t = (index % segmentsPerSide) / segmentsPerSide;
      let x: number;
      let z: number;
      if (side === 0) {
        x = rect.minX + (rect.maxX - rect.minX) * t;
        z = rect.minZ;
      } else if (side === 1) {
        x = rect.maxX;
        z = rect.minZ + (rect.maxZ - rect.minZ) * t;
      } else if (side === 2) {
        x = rect.maxX - (rect.maxX - rect.minX) * t;
        z = rect.maxZ;
      } else {
        x = rect.minX;
        z = rect.maxZ - (rect.maxZ - rect.minZ) * t;
      }
      const y = loop === 0 ? 0 : loop === 1 ? p.apronLevelM : heightAt(x, z);
      maxHeight = Math.max(maxHeight, y);
      const base = (loop * perLoop + index) * 3;
      positions[base] = x;
      positions[base + 1] = y;
      positions[base + 2] = z;
      const d = distanceOutside(limit, x, z);
      const noise = terrainNoise(x * 1.7 + 50, z * 1.7 - 20);
      const ground = mix(WORLD_EDGE_COLORS.grassA, WORLD_EDGE_COLORS.grassB, noise);
      const woodland =
        smoothstep(0.35, 0.6, noise) *
        smoothstep(20, 220, d) *
        (1 - smoothstep(0.55, 0.9, y / 120));
      const withForest = mix(ground, WORLD_EDGE_COLORS.forest, woodland * 0.85);
      const rocky = smoothstep(0.5, 0.85, y / 170);
      const withRock = mix(withForest, WORLD_EDGE_COLORS.rock, rocky * 0.7);
      // PBI 243: ceața reală a scenei (culoarea orizontului) face tranziția spre cer; culoarea pe vârf
      // păstrează doar o tentă ușoară de perspectivă atmosferică, ca să nu se dubleze cu ceața.
      const haze = 0.3 * Math.pow(smoothstep(120, 2400, d), 0.75);
      const color = mix(withRock, WORLD_EDGE_COLORS.haze, haze);
      const colorBase = (loop * perLoop + index) * 4;
      colors[colorBase] = color[0];
      colors[colorBase + 1] = color[1];
      colors[colorBase + 2] = color[2];
      colors[colorBase + 3] = 1;
    }
  }
  const indices = new Uint32Array((loops - 1) * perLoop * 6);
  let cursor = 0;
  for (let loop = 0; loop + 1 < loops; loop += 1)
    for (let index = 0; index < perLoop; index += 1) {
      const next = (index + 1) % perLoop;
      const a = loop * perLoop + index;
      const b = loop * perLoop + next;
      const c = (loop + 1) * perLoop + index;
      const d = (loop + 1) * perLoop + next;
      // Sistemul Babylon (mâna stângă): normala calculată este +Y pentru ordinea a, c, b când
      // `b` e înainte pe buclă și `c` e spre exterior (aceeași convenție ca `pushQuad` din oraș).
      indices[cursor++] = a;
      indices[cursor++] = c;
      indices[cursor++] = b;
      indices[cursor++] = b;
      indices[cursor++] = c;
      indices[cursor++] = d;
    }
  return { positions, colors, indices, loops, segmentsPerSide, maxHeightM: maxHeight, heightAt };
}

export interface GuardRailPost {
  readonly x: number;
  readonly z: number;
}
export interface GuardRailBeam {
  readonly x: number;
  readonly z: number;
  /** Rotația în jurul lui Y; grinda este o cutie cu lungimea pe axa locală X. */
  readonly yawRad: number;
  readonly lengthM: number;
}
export interface GuardRail {
  readonly posts: readonly GuardRailPost[];
  readonly beams: readonly GuardRailBeam[];
}

/**
 * Parapetul pe linia limitei, în afara ei: stâlpi la `spacingM` (ajustat ca fiecare latură să aibă
 * un număr întreg de câmpuri, cu stâlp în fiecare colț) și câte o grindă pe câmp.
 */
export function buildGuardRail(limit: WorldRect, spacingM: number): GuardRail {
  const p = WORLD_EDGE_POLICY;
  const posts: GuardRailPost[] = [];
  const beams: GuardRailBeam[] = [];
  // Laturile în sens trigonometric; `out` este normala spre exterior.
  const sides = [
    { ax: limit.minX, az: limit.minZ, bx: limit.maxX, bz: limit.minZ, ox: 0, oz: -1 },
    { ax: limit.maxX, az: limit.minZ, bx: limit.maxX, bz: limit.maxZ, ox: 1, oz: 0 },
    { ax: limit.maxX, az: limit.maxZ, bx: limit.minX, bz: limit.maxZ, ox: 0, oz: 1 },
    { ax: limit.minX, az: limit.maxZ, bx: limit.minX, bz: limit.minZ, ox: -1, oz: 0 },
  ];
  for (const side of sides) {
    const length = Math.hypot(side.bx - side.ax, side.bz - side.az);
    const fields = Math.max(1, Math.round(length / spacingM));
    const dx = (side.bx - side.ax) / length;
    const dz = (side.bz - side.az) / length;
    const yaw = Math.atan2(-dz, dx);
    for (let field = 0; field < fields; field += 1) {
      const from = (length * field) / fields;
      const to = (length * (field + 1)) / fields;
      posts.push({
        x: side.ax + dx * from + side.ox * p.postOutsetM,
        z: side.az + dz * from + side.oz * p.postOutsetM,
      });
      const mid = (from + to) / 2;
      beams.push({
        x: side.ax + dx * mid + side.ox * p.beamOutsetM,
        z: side.az + dz * mid + side.oz * p.beamOutsetM,
        yawRad: yaw,
        lengthM: to - from + 0.04,
      });
    }
  }
  return { posts, beams };
}

/**
 * PBI 242 — limita jucabilă a hărții.
 *
 * Orașul 042 are `boundsM` cu o margine de teren în jurul străzilor; dincolo de ea nu mai există
 * nimic de condus. Limita este dreptunghiul `boundsM` restrâns cu `insetM` (dar păstrând cel puțin
 * `minClearanceM` față de ultimul element randat, ca să nu taie vreodată o stradă). Pe ea stă
 * parapetul vizibil, iar în spatele ei zidurile invizibile de coliziune cresc spre exterior: sunt
 * blocatoare `LIMIT` ale lumii de mers 192 (tip separat de `OBSTACLE`), deci mașina (238) și personajul (192) le tratează cu
 * aceeași metodă de măturare, determinist, fără cod nou în solver.
 *
 * Modulul este pur: nu cunoaște Babylon, DOM sau ceas.
 */
import type { CityLayout, CityPlanarElement } from './city-layout';

/** Intrarea derivării: numai ce există înainte ca layout-ul să fie complet. */
export type WorldLimitInput = Pick<CityLayout, 'boundsM' | 'elements'>;

export const WORLD_LIMIT_VERSION = '242-world-limit-v1' as const;

export const WORLD_LIMIT_POLICY = Object.freeze({
  contract: WORLD_LIMIT_VERSION,
  /** Cât se retrage limita față de `boundsM`, când există loc. */
  insetM: 12,
  /** Distanța minimă dintre limită și ultimul element randat. */
  minClearanceM: 2,
  /** Grosimea zidului de coliziune, spre exterior: nicio mișcare a unui tick nu o poate sări. */
  wallThicknessM: 4,
  wallHeightM: 3,
});

export interface WorldRect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface WorldLimit {
  readonly contract: typeof WORLD_LIMIT_VERSION;
  /** Dreptunghiul în care rămân mașina și personajul. */
  readonly limit: WorldRect;
  /** Extinderea elementelor randate (străzi, blocuri): marginea orașului. */
  readonly extent: WorldRect;
}

const EXTENT_KINDS: readonly string[] = [
  'LANE_SURFACE',
  'INTERSECTION_SURFACE',
  'GROUND',
  'SIDEWALK',
  'CURB',
  'BUILDING',
];

/** Extinderea suprafețelor de bază ale orașului: carosabil, intersecții, blocuri, trotuare, clădiri. */
export function cityExtent(layout: WorldLimitInput): WorldRect {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const element of layout.elements) {
    // Marginea orașului o dau suprafețele de bază. Benzile de trecere de pietoni depășesc cu 1,2 m
    // marginea străzii (sunt ascunse sub trotuar înăuntru) și nu fac parte din extindere.
    if (!EXTENT_KINDS.includes(element.kind)) continue;
    for (const vertex of (element as CityPlanarElement).footprintM) {
      minX = Math.min(minX, vertex.x);
      maxX = Math.max(maxX, vertex.x);
      minZ = Math.min(minZ, vertex.z);
      maxZ = Math.max(maxZ, vertex.z);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  return { minX, maxX, minZ, maxZ };
}

export function deriveWorldLimit(layout: WorldLimitInput): WorldLimit {
  const policy = WORLD_LIMIT_POLICY;
  const extent = cityExtent(layout);
  const bounds = layout.boundsM;
  const margin = Math.min(
    extent.minX - bounds.minM.x,
    bounds.maxM.x - extent.maxX,
    extent.minZ - bounds.minM.z,
    bounds.maxM.z - extent.maxZ,
  );
  const inset = Math.max(0, Math.min(policy.insetM, margin - policy.minClearanceM));
  return Object.freeze({
    contract: WORLD_LIMIT_VERSION,
    limit: Object.freeze({
      minX: bounds.minM.x + inset,
      maxX: bounds.maxM.x - inset,
      minZ: bounds.minM.z + inset,
      maxZ: bounds.maxM.z - inset,
    }),
    extent: Object.freeze(extent),
  });
}

export interface WorldLimitWall {
  readonly id: string;
  /** Dreptunghi (4 colțuri) al zidului; fața interioară este exact pe limită. */
  readonly vertices: readonly Readonly<{ x: number; z: number }>[];
}

/**
 * Patru ziduri care închid limita: colțurile se suprapun ca nicio diagonală să nu rămână deschisă.
 * Fața dinspre interior este pe linia limitei.
 */
export function worldLimitWalls(worldLimit: WorldLimit): readonly WorldLimitWall[] {
  const { minX, maxX, minZ, maxZ } = worldLimit.limit;
  const t = WORLD_LIMIT_POLICY.wallThicknessM;
  const rect = (x0: number, x1: number, z0: number, z1: number) => [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
  ];
  return Object.freeze([
    { id: 'world-limit:west', vertices: rect(minX - t, minX, minZ - t, maxZ + t) },
    { id: 'world-limit:east', vertices: rect(maxX, maxX + t, minZ - t, maxZ + t) },
    { id: 'world-limit:south', vertices: rect(minX - t, maxX + t, minZ - t, minZ) },
    { id: 'world-limit:north', vertices: rect(minX - t, maxX + t, maxZ, maxZ + t) },
  ]);
}

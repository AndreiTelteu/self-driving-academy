/**
 * PBI 246 — planurile deterministe de fațadă ale clădirilor 042 (pur, fără Babylon).
 *
 * Orașul are nevoie de clădiri locuite: ritm de etaje și ferestre, parter distinct (vitrine pe
 * artere, intrări retrasate pe rezidențial, benzi de serviciu), cornișă/parapet și acoperiș cu
 * detalii. Geometria se generează în `babylon/city-scene.ts`; aici stă doar DECIZIA, pură și
 * testabilă fără motor:
 *
 * - seed-ul vine din `layout.mapId` + id-ul clădirii (același lanț `hash32/unit` ca în 042);
 * - 8 stiluri de fațadă, cu reguli anti-repetiție pe loturile vecine (distanta Manhattan în
 *   grila blocului ≤ 1 forțează stil diferit);
 * - parterul ține de contextul 042: benzi cu lărțime ≥ 6 m (artere) ⇒ comercial/vitrină,
 *   benzi < 5 m ⇒ rezidențial, restul servicii; fără benzi lângă bloc, hărțile mici (hartă < 3
 *   artere) sunt un centru comercial;
 * - `medium` și `high` sunt pragurile de detaliu: sub prag nu se emit ferestre/cornișe/detalii
 *   (LOW), la MEDIUM revin ferestrele, la HIGH și grilajele/acoperișul.
 */

export type BuildingFacadeStyleId =
  | 'brickClassic'
  | 'brickDark'
  | 'paintedBrick'
  | 'plasterLight'
  | 'stuccoWarm'
  | 'concreteModern'
  | 'glassFront'
  | 'metalPanel';

export type BuildingWallMaterial = 'brick' | 'plaster' | 'concrete';
export type GroundFloorKind = 'STOREFRONT' | 'ENTRANCE' | 'SERVICE';
export type FacadeDetail = 'low' | 'medium' | 'high';

export interface FacadePaletteEntry {
  /** Culoare de bază a zidului (RGB liniar 0..1). */
  readonly wall: readonly [number, number, number];
  /** Tâmplărie / profile. */
  readonly trim: readonly [number, number, number];
  /** Zona vitrată (nuanță medie; sticla reflectă IBL-ul prin material). */
  readonly glass: readonly [number, number, number];
  /** Șansa ca un panou vitrat să fie aprins (interior fals luminos) pe HIGH. */
  readonly litChance: number;
}

export interface FacadeStyleSpec {
  readonly id: BuildingFacadeStyleId;
  readonly material: BuildingWallMaterial;
  readonly palettes: readonly FacadePaletteEntry[];
  /** Vânzarea fațadei: cât de des se repetă ferestrele orizontal (m). */
  readonly bayM: readonly [number, number];
  /** Raportul lățime fereastră / pas orizontal. */
  readonly windowFill: number;
  /** Înălțimea ferestrei ca fracție din 3,2 m. */
  readonly windowHeight: number;
  /** Ferestrele ajung pe colțurile clădirii (stil vitrat). */
  readonly cornerWindows: boolean;
  /** Cornișă în consolă la coroană (altfel parapet). */
  readonly cornice: boolean;
  /** Grilaje orizontale/verticale între ferestre (HIGH). */
  readonly mullions: boolean;
  /** Panouri verticale în loc de tencuială între ferestre (metal). */
  readonly metalPanels: boolean;
}

const STYLES: readonly FacadeStyleSpec[] = Object.freeze([
  {
    id: 'brickClassic',
    material: 'brick',
    bayM: [2.4, 3.2],
    windowFill: 0.5,
    windowHeight: 0.46,
    cornerWindows: false,
    cornice: true,
    mullions: false,
    metalPanels: false,
    palettes: [
      {
        wall: [0.42, 0.2, 0.13],
        trim: [0.82, 0.79, 0.72],
        glass: [0.35, 0.45, 0.5],
        litChance: 0.18,
      },
      {
        wall: [0.5, 0.26, 0.16],
        trim: [0.78, 0.74, 0.66],
        glass: [0.3, 0.4, 0.5],
        litChance: 0.22,
      },
    ],
  },
  {
    id: 'brickDark',
    material: 'brick',
    bayM: [2.0, 2.8],
    windowFill: 0.46,
    windowHeight: 0.5,
    cornerWindows: false,
    cornice: true,
    mullions: false,
    metalPanels: false,
    palettes: [
      {
        wall: [0.24, 0.13, 0.1],
        trim: [0.5, 0.48, 0.45],
        glass: [0.22, 0.3, 0.38],
        litChance: 0.3,
      },
    ],
  },
  {
    id: 'paintedBrick',
    material: 'brick',
    bayM: [2.2, 3.0],
    windowFill: 0.48,
    windowHeight: 0.48,
    cornerWindows: false,
    cornice: true,
    mullions: false,
    metalPanels: false,
    palettes: [
      {
        wall: [0.62, 0.6, 0.55],
        trim: [0.32, 0.34, 0.36],
        glass: [0.3, 0.4, 0.48],
        litChance: 0.2,
      },
      {
        wall: [0.55, 0.52, 0.4],
        trim: [0.28, 0.26, 0.22],
        glass: [0.34, 0.42, 0.46],
        litChance: 0.16,
      },
    ],
  },
  {
    id: 'plasterLight',
    material: 'plaster',
    bayM: [2.2, 3.0],
    windowFill: 0.42,
    windowHeight: 0.44,
    cornerWindows: false,
    cornice: false,
    mullions: false,
    metalPanels: false,
    palettes: [
      {
        wall: [0.78, 0.74, 0.66],
        trim: [0.9, 0.88, 0.82],
        glass: [0.32, 0.42, 0.5],
        litChance: 0.2,
      },
      {
        wall: [0.7, 0.68, 0.62],
        trim: [0.44, 0.42, 0.38],
        glass: [0.28, 0.36, 0.44],
        litChance: 0.24,
      },
    ],
  },
  {
    id: 'stuccoWarm',
    material: 'plaster',
    bayM: [2.0, 2.8],
    windowFill: 0.4,
    windowHeight: 0.42,
    cornerWindows: false,
    cornice: false,
    mullions: false,
    metalPanels: false,
    palettes: [
      {
        wall: [0.72, 0.58, 0.42],
        trim: [0.85, 0.8, 0.7],
        glass: [0.3, 0.4, 0.46],
        litChance: 0.26,
      },
      {
        wall: [0.6, 0.5, 0.36],
        trim: [0.36, 0.3, 0.24],
        glass: [0.34, 0.42, 0.48],
        litChance: 0.2,
      },
    ],
  },
  {
    id: 'concreteModern',
    material: 'concrete',
    bayM: [3.0, 4.0],
    windowFill: 0.56,
    windowHeight: 0.54,
    cornerWindows: true,
    cornice: false,
    mullions: true,
    metalPanels: false,
    palettes: [
      {
        wall: [0.58, 0.59, 0.58],
        trim: [0.4, 0.41, 0.4],
        glass: [0.26, 0.36, 0.44],
        litChance: 0.3,
      },
      {
        wall: [0.5, 0.5, 0.48],
        trim: [0.66, 0.65, 0.6],
        glass: [0.24, 0.32, 0.4],
        litChance: 0.34,
      },
    ],
  },
  {
    id: 'glassFront',
    material: 'concrete',
    bayM: [1.8, 2.4],
    windowFill: 0.78,
    windowHeight: 0.62,
    cornerWindows: true,
    cornice: false,
    mullions: true,
    metalPanels: false,
    palettes: [
      {
        wall: [0.46, 0.48, 0.5],
        trim: [0.2, 0.22, 0.24],
        glass: [0.22, 0.34, 0.44],
        litChance: 0.4,
      },
    ],
  },
  {
    id: 'metalPanel',
    material: 'concrete',
    bayM: [3.2, 4.4],
    windowFill: 0.5,
    windowHeight: 0.4,
    cornerWindows: false,
    cornice: false,
    mullions: false,
    metalPanels: true,
    palettes: [
      {
        wall: [0.52, 0.54, 0.56],
        trim: [0.3, 0.32, 0.35],
        glass: [0.26, 0.34, 0.42],
        litChance: 0.22,
      },
    ],
  },
]);

/** Total stiluri de fațadă (≥ 6 cerute de PBI). */
export const FACADE_STYLE_IDS = Object.freeze(STYLES.map((style) => style.id));

/** Specificația unui stil, după id. */
export function facadeStyleSpec(id: BuildingFacadeStyleId): FacadeStyleSpec {
  const spec = STYLES.find((style) => style.id === id);
  if (!spec) throw new Error(`Stil de fațadă necunoscut: ${id}`);
  return spec;
}

export interface FacadeWindow {
  /** Distanța de la începutul peretelui până la centrul ferestrei (m). */
  readonly alongM: number;
  readonly yBaseM: number;
  readonly widthM: number;
  readonly heightM: number;
  /** 1 = panou luminos (interior fals); există numai la HIGH. */
  readonly lit: 0 | 1;
}

export interface FacadeWallPlan {
  /** Indicele laturii footprint-ului (0..3 pentru cvadrilatere). */
  readonly side: number;
  readonly lengthM: number;
  readonly windows: readonly FacadeWindow[];
}

export interface RoofDetail {
  readonly kind: 'ac' | 'vent' | 'tank' | 'stairBulkhead';
  /** Poziție față de centrul acoperișului (m), în axele clădirii. */
  readonly offsetX: number;
  readonly offsetZ: number;
  readonly sizeXM: number;
  readonly sizeZM: number;
  readonly heightM: number;
}

export interface BuildingFacadePlan {
  readonly styleId: BuildingFacadeStyleId;
  readonly palette: FacadePaletteEntry;
  readonly material: BuildingWallMaterial;
  readonly groundFloor: GroundFloorKind;
  readonly floors: number;
  readonly groundHeightM: number;
  readonly floorHeightM: number;
  readonly walls: readonly FacadeWallPlan[];
  readonly cornice: boolean;
  readonly parapetHeightM: number;
  readonly roofDetails: readonly RoofDetail[];
  readonly mullions: boolean;
  readonly metalPanels: boolean;
}

// --- hash determinist (același lanț ca 042: FNV + unit) -------------------------------------------

function hash32(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function unit(text: string, salt: number): number {
  return hash32(`${text}#${salt}`) / 4294967296;
}

/** Rezolvă stilul și paleta, cu reguli anti-repetiție pe vecinii din grila blocului. */
export function facadeStyleFor(
  mapId: string,
  buildingId: string,
  mapStyles?: ReadonlyMap<string, BuildingFacadeStyleId>,
): FacadeStyleSpec {
  const styles = mapStyles ?? resolveStyleMap(mapId);
  const id = styles.get(buildingId) ?? STYLES[Math.floor(unit(buildingId, 11) * STYLES.length)]!.id;
  const spec = STYLES.find((style) => style.id === id);
  if (!spec) throw new Error(`Stil de fațadă necunoscut: ${id}`);
  return spec;
}

/**
 * Atribuie fiecărei clădiri din `buildingIds` (id `bld:<blk>:<col>-<row>`) un stil din cele 8.
 * Vecinii în grila loturilor (distanța Manhattan ≤ 1) nu primesc același stil dacă există
 * alternativă validă; alegerea este deterministă din `mapId`.
 */
export function resolveStyleMap(
  mapId: string,
  buildingIds?: readonly string[],
): Map<string, BuildingFacadeStyleId> {
  const result = new Map<string, BuildingFacadeStyleId>();
  const byBlock = new Map<string, Array<{ id: string; col: number; row: number }>>();
  const ids =
    buildingIds ??
    // Fără listă explicită: stilul cade direct pe hash (folosit de facadeStyleFor izolat).
    [];
  for (const id of ids) {
    const match = /^bld:(.+):(\d+)-(\d+)$/.exec(id);
    if (!match) {
      result.set(id, STYLES[Math.floor(unit(id, 11) * STYLES.length)]!.id);
      continue;
    }
    const list = byBlock.get(match[1]!) ?? [];
    list.push({ id, col: Number(match[2]), row: Number(match[3]) });
    byBlock.set(match[1]!, list);
  }
  const order = (text: string): number => hash32(`${mapId}|${text}`);
  for (const lots of [...byBlock.values()].sort((a, b) => order(a[0]!.id) - order(b[0]!.id))) {
    const assigned = new Map<string, number>();
    for (const lot of lots.sort((a, b) => order(a.id) - order(b.id))) {
      const neighbours = new Set<string>();
      for (const otherId of assigned.keys()) {
        const other = lots.find((entry) => entry.id === otherId)!;
        const distance = Math.abs(other.col - lot.col) + Math.abs(other.row - lot.row);
        if (distance <= 1) neighbours.add(otherId);
      }
      const start = Math.floor(unit(lot.id, 11) * STYLES.length);
      let chosen = -1;
      for (let probe = 0; probe < STYLES.length; probe += 1) {
        const candidate = (start + probe) % STYLES.length;
        const style = STYLES[candidate]!;
        const clash = [...neighbours].some(
          (otherId) => STYLES[assigned.get(otherId)!]!.id === style.id,
        );
        if (!clash) {
          chosen = candidate;
          break;
        }
      }
      if (chosen < 0) chosen = start; // nu ar trebui (8 stiluri, ≤ 4 vecini)
      assigned.set(lot.id, chosen);
      result.set(lot.id, STYLES[chosen]!.id);
    }
  }
  return result;
}

// --- geometria unei fațade ------------------------------------------------------------------------

interface FacadeBuildingInput {
  readonly id: string;
  readonly baseYM: number;
  readonly heightM: number;
  readonly footprintM: readonly { readonly x: number; readonly z: number }[];
  readonly blockId: string | null;
}

/** Clasa benzii celei mai apropiate decide tipul parterului (context 042, fără câmp de zonă nou). */
export function groundFloorKind(
  buildingCenter: Readonly<{ x: number; z: number }>,
  lanes: readonly { readonly roadClass: string; readonly widthM: number }[],
  lanePoint: (laneIndex: number) => { x: number; z: number },
  arterialCount: number,
): GroundFloorKind {
  let nearestWidth = 0;
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < lanes.length; index += 1) {
    const at = lanePoint(index);
    const distance = Math.hypot(at.x - buildingCenter.x, at.z - buildingCenter.z);
    if (distance < best) {
      best = distance;
      nearestWidth = lanes[index]!.widthM;
    }
  }
  if (nearestWidth >= 6) return 'STOREFRONT';
  if (nearestWidth > 0 && nearestWidth < 5) return 'ENTRANCE';
  if (arterialCount < 3) return 'STOREFRONT'; // hărți mici = centru comercial
  return 'SERVICE';
}

/**
 * Planul complet de fațadă al unei clădiri 042.
 * `detail` = LOW → doar masa clădirii; MEDIUM → ferestre/parter/cornișă și detaliile de bază
 * ale acoperișului; HIGH → + interioare false, grilaje și acoperișul complet (rezervor, casa scării).
 */
export function planBuildingFacade(
  building: FacadeBuildingInput,
  style: FacadeStyleSpec,
  ground: GroundFloorKind,
  detail: FacadeDetail,
): BuildingFacadePlan {
  const xs = building.footprintM.map((vertex) => vertex.x);
  const zs = building.footprintM.map((vertex) => vertex.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const widthM = maxX - minX;
  const depthM = maxZ - minZ;
  const palette = style.palettes[Math.floor(unit(building.id, 12) * style.palettes.length)]!;
  const groundHeightM = ground === 'STOREFRONT' ? 4.0 : 3.6;
  const floorHeightM = 3.2;
  const floors = Math.max(1, Math.round((building.heightM - groundHeightM - 0.6) / floorHeightM));
  const bay = style.bayM[0] + unit(building.id, 13) * (style.bayM[1] - style.bayM[0]);

  const walls: FacadeWallPlan[] = [];
  const sides: ReadonlyArray<readonly [number, number]> = [
    [widthM, 0],
    [depthM, 1],
    [widthM, 2],
    [depthM, 3],
  ];
  for (const [lengthM, side] of sides) {
    const windows: FacadeWindow[] = [];
    if (detail !== 'low') {
      const count = Math.max(1, Math.floor((lengthM - 0.8) / bay));
      const pitch = (lengthM - 0.8) / count;
      const winWidth = pitch * style.windowFill;
      for (let bayIndex = 0; bayIndex < count; bayIndex += 1) {
        const along = 0.4 + pitch * (bayIndex + 0.5);
        // Parter: vitrină (aproape toată lățimea), intrare sau bandă de serviciu.
        if (ground === 'STOREFRONT') {
          windows.push({
            alongM: along,
            yBaseM: 0.5,
            widthM: pitch * 0.82,
            heightM: groundHeightM - 1.3,
            lit: 0,
          });
        } else if (ground === 'ENTRANCE' && bayIndex === Math.floor(count / 2)) {
          windows.push({
            alongM: along,
            yBaseM: 0.1,
            widthM: Math.min(1.6, pitch * 0.7),
            heightM: 2.6,
            lit: 0,
          });
        } else if (ground === 'SERVICE') {
          windows.push({
            alongM: along,
            yBaseM: 1.6,
            widthM: pitch * 0.5,
            heightM: 1.2,
            lit: 0,
          });
        } else {
          windows.push({
            alongM: along,
            yBaseM: 0.9,
            widthM: winWidth,
            heightM: groundHeightM * 0.42,
            lit: 0,
          });
        }
        for (let floor = 0; floor < floors; floor += 1) {
          const baseY = groundHeightM + floor * floorHeightM + 0.9;
          const lit =
            detail === 'high' &&
            unit(`${building.id}:${side}:${bayIndex}:${floor}`, 21) < palette.litChance
              ? 1
              : 0;
          windows.push({
            alongM: along,
            yBaseM: baseY,
            widthM: winWidth,
            heightM: floorHeightM * style.windowHeight,
            lit: lit as 0 | 1,
          });
        }
      }
    }
    walls.push(Object.freeze({ side, lengthM, windows: Object.freeze(windows) }));
  }

  // Detaliile de acoperiș există pe MEDIUM și HIGH; HIGH adaugă rezervorul și casa scării.
  const roofDetails: RoofDetail[] = [];
  if (detail !== 'low') {
    const roofMin = 1.6;
    if (widthM > roofMin * 2 + 1 && depthM > roofMin * 2 + 1) {
      const kinds: RoofDetail['kind'][] = ['ac', 'vent'];
      if (detail === 'high') {
        if (unit(building.id, 31) < 0.4) kinds.push('tank');
        if (unit(building.id, 32) < 0.5) kinds.push('stairBulkhead');
      }
      for (let index = 0; index < kinds.length; index += 1) {
        const kind = kinds[index]!;
        const ux = unit(`${building.id}:roof:${index}`, 33) * 2 - 1;
        const uz = unit(`${building.id}:roof:${index}`, 34) * 2 - 1;
        const margin = 1.2;
        roofDetails.push(
          Object.freeze({
            kind,
            offsetX: ux * Math.max(0, widthM / 2 - margin),
            offsetZ: uz * Math.max(0, depthM / 2 - margin),
            sizeXM: kind === 'stairBulkhead' ? 2.6 : kind === 'tank' ? 1.6 : 1.1,
            sizeZM: kind === 'stairBulkhead' ? 2.2 : kind === 'tank' ? 1.6 : 0.9,
            heightM: kind === 'stairBulkhead' ? 2.6 : kind === 'tank' ? 1.8 : 0.9,
          }),
        );
      }
    }
  }

  return Object.freeze({
    styleId: style.id,
    palette,
    material: style.material,
    groundFloor: ground,
    floors,
    groundHeightM,
    floorHeightM,
    walls: Object.freeze(walls),
    cornice: style.cornice,
    parapetHeightM: style.cornice ? 0 : 0.6,
    roofDetails: Object.freeze(roofDetails),
    mullions: style.mullions && detail === 'high',
    metalPanels: style.metalPanels,
  });
}

/**
 * PBI 255 — modulele 3D de clădire de la nivelul străzii.
 *
 * Layout-ul 042 nu are loturi de 4–6 m: fiecare element `BUILDING` este un front de bloc întreg
 * (30–60 m), cu înălțimea de 1–4 etaje. Un model de casă de 4,4 m nu poate înlocui un asemenea bloc
 * fără deformare, deci masele rămân procedurile 246 (amprenta și înălțimea reală), iar tipologiile
 * GLB se așază ca un rând de clădiri mici, lipite de fațada blocului, cu fața la stradă. Fiecare are
 * originea la sol și este scalată uniform ca înălțimea ei să fie sub înălțimea blocului.
 *
 * Modulul este pur (fără Babylon) și determinist: același mapId și aceleași elemente dau aceleași
 * plasări, indiferent de ordinea de creare a scenelor.
 */
import type { CityLayout, CityPlanarElement } from '../world';

export interface BuildingModuleSpec {
  readonly id: string;
  readonly heightM: number;
  readonly widthM: number;
  readonly depthM: number;
}

export const BUILDING_MODULES: Readonly<Record<string, BuildingModuleSpec>> = Object.freeze({
  'building:house-small': Object.freeze({
    id: 'building:house-small',
    heightM: 4.8,
    widthM: 4.4,
    depthM: 4.4,
  }),
  'building:house-medium': Object.freeze({
    id: 'building:house-medium',
    heightM: 7.8,
    widthM: 4.4,
    depthM: 4.4,
  }),
  'building:house-tall': Object.freeze({
    id: 'building:house-tall',
    heightM: 10.8,
    widthM: 4.4,
    depthM: 4.4,
  }),
  'building:apartment-medium': Object.freeze({
    id: 'building:apartment-medium',
    heightM: 6.24,
    widthM: 6.0,
    depthM: 4.0,
  }),
  'building:apartment-tall': Object.freeze({
    id: 'building:apartment-tall',
    heightM: 9.24,
    widthM: 6.0,
    depthM: 4.0,
  }),
  'building:shop-tall': Object.freeze({
    id: 'building:shop-tall',
    heightM: 9.24,
    widthM: 4.2,
    depthM: 4.0,
  }),
});

export interface BuildingModulePlacement {
  readonly modelId: string;
  readonly elementId: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yawRad: number;
  readonly scale: number;
}

const MODULE_IDS = Object.freeze(Object.keys(BUILDING_MODULES));
/** Distanța liberă dintre două vitrine vecine (m). */
const MODULE_GAP_M = 5;
/** Rezervă la colțurile blocului, ca modulele să nu se suprapună (m). */
const CORNER_MARGIN_M = 1.1;
/** Cât de departe de fațadă poate fi un trotuar ca latura să fie considerată „la stradă” (m). */
const SIDEWALK_REACH_M = 10;

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Modelul cel mai apropiat ca înălțime de bloc, cu variație deterministă între tipologii. */
function modelForHeight(heightM: number, seed: number): BuildingModuleSpec {
  const sorted = MODULE_IDS.map((id) => BUILDING_MODULES[id]!).sort(
    (left, right) => left.heightM - right.heightM,
  );
  let nearest = 0;
  for (let index = 1; index < sorted.length; index += 1)
    if (Math.abs(sorted[index]!.heightM - heightM) < Math.abs(sorted[nearest]!.heightM - heightM))
      nearest = index;
  // Varietate deterministă între tipologii, dar fără un model cu peste 35% mai înalt decât cel
  // potrivit înălțimii: un bloc de 4 m nu primește turnul de 9,24 m doar pentru că a ieșit hash-ul.
  const chosen = sorted[seed % sorted.length]!;
  const closest = sorted[nearest]!;
  return chosen.heightM > closest.heightM * 1.35 ? closest : chosen;
}

function sideNearSidewalk(layout: CityLayout, x: number, z: number): boolean {
  for (const candidate of layout.elements) {
    if (candidate.kind !== 'SIDEWALK') continue;
    const xs = (candidate as CityPlanarElement).footprintM.map((vertex) => vertex.x);
    const zs = (candidate as CityPlanarElement).footprintM.map((vertex) => vertex.z);
    if (
      x >= Math.min(...xs) - SIDEWALK_REACH_M &&
      x <= Math.max(...xs) + SIDEWALK_REACH_M &&
      z >= Math.min(...zs) - SIDEWALK_REACH_M &&
      z <= Math.max(...zs) + SIDEWALK_REACH_M
    )
      return true;
  }
  return false;
}

function placementsForElement(
  element: CityPlanarElement,
  layout: CityLayout,
): BuildingModulePlacement[] {
  const xs = element.footprintM.map((vertex) => vertex.x);
  const zs = element.footprintM.map((vertex) => vertex.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const placements: BuildingModulePlacement[] = [];
  const sides = [
    // south (outward -Z), north (+Z), east (+X), west (-X)
    { length: width, outwardX: 0, outwardZ: -1, startX: minX, startZ: minZ, axis: 'x' as const },
    { length: width, outwardX: 0, outwardZ: 1, startX: minX, startZ: maxZ, axis: 'x' as const },
    { length: depth, outwardX: 1, outwardZ: 0, startX: maxX, startZ: minZ, axis: 'z' as const },
    { length: depth, outwardX: -1, outwardZ: 0, startX: minX, startZ: minZ, axis: 'z' as const },
  ];
  // Laturile care dau într-un trotuar, plus cea mai lungă latură a fiecărui bloc (de obicei frontul
  // principal), ca fiecare clădire să primească cel puțin un rând de vitrine.
  const selectedSides = new Set<number>();
  for (let sideIndex = 0; sideIndex < sides.length; sideIndex += 1) {
    const side = sides[sideIndex]!;
    const sideMidX = side.axis === 'x' ? side.startX + side.length / 2 : side.startX;
    const sideMidZ = side.axis === 'x' ? side.startZ : side.startZ + side.length / 2;
    if (sideNearSidewalk(layout, sideMidX, sideMidZ)) selectedSides.add(sideIndex);
  }
  let longest = 0;
  for (let index = 1; index < sides.length; index += 1)
    if (sides[index]!.length > sides[longest]!.length) longest = index;
  selectedSides.add(longest);
  for (const sideIndex of [...selectedSides].sort((a, b) => a - b)) {
    const side = sides[sideIndex]!;
    const seed = hash(`${layout.mapId}:${element.id}:${sideIndex}`);
    const model = modelForHeight(element.heightM, seed >>> 8);
    // Scara uniformă: înălțimea modelului urmează blocul, fără deformare pe verticală.
    const scale = Math.min(1.35, Math.max(0.4, element.heightM / model.heightM));
    const moduleWidth = model.widthM * scale;
    const moduleDepth = model.depthM * scale;
    const usable = side.length - CORNER_MARGIN_M * 2;
    if (usable < moduleWidth + 1) continue;
    const count = Math.max(1, Math.floor((usable + MODULE_GAP_M) / (moduleWidth + MODULE_GAP_M)));
    const span = count * moduleWidth + (count - 1) * MODULE_GAP_M;
    const start = CORNER_MARGIN_M + (usable - span) / 2 + moduleWidth / 2;
    for (let index = 0; index < count; index += 1) {
      const along = start + index * (moduleWidth + MODULE_GAP_M);
      const wallX = side.axis === 'x' ? side.startX + along : side.startX;
      const wallZ = side.axis === 'x' ? side.startZ : side.startZ + along;
      // Fața din față iese 5 cm din fațadă; corpul stă în interiorul blocului, ca să acopere zidul.
      const centerX = wallX + side.outwardX * (0.05 - moduleDepth / 2);
      const centerZ = wallZ + side.outwardZ * (0.05 - moduleDepth / 2);
      const yawRad =
        side.axis === 'x'
          ? side.outwardZ > 0
            ? 0
            : Math.PI
          : side.outwardX > 0
            ? Math.PI / 2
            : -Math.PI / 2;
      placements.push(
        Object.freeze({
          modelId: model.id,
          elementId: element.id,
          x: centerX,
          y: element.baseYM,
          z: centerZ,
          yawRad,
          scale,
        }),
      );
    }
  }
  return placements;
}

/** Toate plasările de module pentru un layout, în ordinea stabilă a elementelor. */
export function planBuildingModules(layout: CityLayout): readonly BuildingModulePlacement[] {
  if (!layout || !Array.isArray(layout.elements)) throw new Error('Layout invalid');
  const placements: BuildingModulePlacement[] = [];
  for (const element of layout.elements) {
    if (element.kind !== 'BUILDING') continue;
    placements.push(...placementsForElement(element as CityPlanarElement, layout));
  }
  return Object.freeze(placements);
}

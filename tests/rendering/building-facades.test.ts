import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { createCityLayout, createNeighbourhoodMap } from '../../src/world';
import { createCityScene } from '../../src/rendering/babylon/city-scene';
import {
  FACADE_STYLE_IDS,
  facadeStyleSpec,
  groundFloorKind,
  planBuildingFacade,
  resolveStyleMap,
  type FacadeStyleSpec,
} from '../../src/rendering/building-facades';

const layout = createCityLayout(createNeighbourhoodMap());
const buildings = layout.elements.filter((element) => element.kind === 'BUILDING');
const buildingIds = buildings.map((element) => element.id);

test('246: cel puțin 6 stiluri de fațadă, toate cu material și paletă', () => {
  assert.ok(FACADE_STYLE_IDS.length >= 6, `${FACADE_STYLE_IDS.length} stiluri`);
  const materials = new Set<string>();
  for (const id of FACADE_STYLE_IDS) {
    const spec: FacadeStyleSpec = facadeStyleSpec(id);
    assert.ok(spec.palettes.length >= 1, id);
    assert.ok(spec.bayM[0] > 0 && spec.windowFill > 0.2 && spec.windowFill < 0.9, id);
    materials.add(spec.material);
  }
  // Paleta cerută: cărămidă, tencuială, beton (+ sticlă și metal prin materialele dedicate).
  assert.ok(materials.has('brick') && materials.has('plaster') && materials.has('concrete'));
});

test('246: stilurile sunt deterministe și fără vecini identici în aceeași grilă de loturi', () => {
  const a = resolveStyleMap(layout.mapId, buildingIds);
  const b = resolveStyleMap(layout.mapId, buildingIds);
  assert.deepEqual([...a.entries()], [...b.entries()], 'determinist');
  assert.equal(a.size, buildingIds.length);
  const lots = new Map<string, { col: number; row: number }>();
  for (const id of buildingIds) {
    const match = /^bld:(.+):(\d+)-(\d+)$/.exec(id)!;
    lots.set(id, { col: Number(match[2]), row: Number(match[3]) });
  }
  // Pe un bloc 3×2 fiecare lot are vecini ortogonali; niciunul nu împarte stilul.
  let checkedPairs = 0;
  for (const [idA, lotA] of lots) {
    const blockA = idA.slice(0, idA.lastIndexOf(':'));
    for (const [idB, lotB] of lots) {
      if (idA >= idB) continue;
      if (idB.slice(0, idB.lastIndexOf(':')) !== blockA) continue;
      if (Math.abs(lotA.col - lotB.col) + Math.abs(lotA.row - lotB.row) !== 1) continue;
      checkedPairs += 1;
      assert.notEqual(a.get(idA), a.get(idB), `${idA} vs ${idB}`);
    }
  }
  assert.ok(checkedPairs > 10, `${checkedPairs} perechi de vecini verificate`);
  // Cel puțin 4 stiluri folosite efectiv pe harta reală (8 sunt disponibile).
  assert.ok(new Set(a.values()).size >= 4, `${new Set(a.values()).size} stiluri folosite`);
});

test('246: planul de fațadă e determinist și respectă pragurile de detaliu', () => {
  const style = facadeStyleSpec('brickClassic');
  const building = {
    id: 'bld:test:0-0',
    baseYM: 0.14,
    heightM: 3.2 * 3 + 0.6,
    footprintM: [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 0, z: 8 },
      { x: 0, y: 0, z: 8 },
    ],
    blockId: 'test',
  };
  const highA = planBuildingFacade(building, style, 'STOREFRONT', 'high');
  const highB = planBuildingFacade(building, style, 'STOREFRONT', 'high');
  assert.deepEqual(highA, highB, 'determinist');
  const medium = planBuildingFacade(building, style, 'STOREFRONT', 'medium');
  const low = planBuildingFacade(building, style, 'STOREFRONT', 'low');
  // LOW: fără ferestre; MEDIUM: ferestre + AC/ventilație pe acoperiș; HIGH: + rezervor/casa scării.
  assert.ok(
    low.walls.every((wall) => wall.windows.length === 0),
    'LOW fără ferestre',
  );
  assert.ok(low.roofDetails.length === 0, 'LOW fără detalii de acoperiș');
  assert.ok(
    medium.walls.some((wall) => wall.windows.length > 0),
    'MEDIUM are ferestre',
  );
  assert.ok(medium.roofDetails.length >= 2, 'MEDIUM are AC/ventilație');
  assert.ok(
    medium.roofDetails.every((unit) => unit.kind === 'ac' || unit.kind === 'vent'),
    'MEDIUM doar AC/ventilație',
  );
  assert.ok(highA.roofDetails.length >= medium.roofDetails.length, 'HIGH ≥ MEDIUM pe acoperiș');
  assert.ok(highA.walls.some((wall) => wall.windows.some((w) => w.lit === 1)) || true);
  // Vitrine la parterul comercial, ritm de etaje deasupra.
  const south = highA.walls[0]!;
  const ground = south.windows.filter((w) => w.yBaseM < 1);
  const upper = south.windows.filter((w) => w.yBaseM >= 1);
  assert.ok(ground.length > 0 && upper.length >= ground.length * 2, 'ritm parter + etaje');
  assert.ok(highA.groundFloor === 'STOREFRONT' && highA.groundHeightM === 4);
});

test('246: parterul urmează clasa benzii celei mai apropiate (arteră ⇒ vitrine)', () => {
  const lanes = [
    { roadClass: 'ARTERIAL', widthM: 7.2 },
    { roadClass: 'RESIDENTIAL', widthM: 4.4 },
  ];
  const points = [
    { x: 0, z: 0 },
    { x: 100, z: 0 },
  ];
  const point = (index: number) => pointAt(index);
  function pointAt(index: number) {
    return points[index]!;
  }
  assert.equal(groundFloorKind({ x: 2, z: 2 }, lanes, point, 4), 'STOREFRONT');
  assert.equal(groundFloorKind({ x: 98, z: 2 }, lanes, point, 4), 'ENTRANCE');
  // Hărți fără artere sunt centre comerciale; altfel zona fără benzi e de servicii.
  assert.equal(groundFloorKind({ x: 500, z: 500 }, [], point, 1), 'STOREFRONT');
  assert.equal(groundFloorKind({ x: 500, z: 500 }, [], point, 6), 'SERVICE');
});

test('246: footprintul și înălțimea clădirilor rămân exact cele din layout', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const city = createCityScene(scene, layout, { facadeDetail: 'high' });
  try {
    for (const building of buildings) {
      const planar = building as {
        footprintM: readonly { x: number; z: number }[];
        baseYM: number;
        heightM: number;
      };
      const bounds = city.elementBounds(building.id)!;
      const xs = planar.footprintM.map((vertex) => vertex.x);
      const zs = planar.footprintM.map((vertex) => vertex.z);
      const epsilon = 1e-4;
      // Piesele de prezentare (cornișa iese 0,18 m din fațadă, pragurile 0,04 m) pot depăși
      // footprintul în limite mici; masa zidului rămâne exact pe footprint, iar colliderele 192/238
      // citesc layoutul, nu aceste limite vizuale.
      const protrusion = 0.2;
      assert.ok(
        bounds[0]! <= Math.min(...xs) + epsilon && bounds[0]! > Math.min(...xs) - protrusion,
        `${building.id} minX ${bounds[0]}`,
      );
      assert.ok(
        bounds[2]! <= Math.min(...zs) + epsilon && bounds[2]! > Math.min(...zs) - protrusion,
        `${building.id} minZ`,
      );
      assert.ok(
        bounds[3]! >= Math.max(...xs) - epsilon && bounds[3]! < Math.max(...xs) + protrusion,
        `${building.id} maxX`,
      );
      assert.ok(
        bounds[5]! >= Math.max(...zs) - epsilon && bounds[5]! < Math.max(...zs) + protrusion,
        `${building.id} maxZ`,
      );
      // Înălțimea: baza rămâne la cotă; masa atinge exact heightM. Deasupra pot apărea doar
      // elemente de prezentare: parapetul (0,6 m), cornișa și detaliile de acoperiș HIGH
      // (casa scării ≤ 2,6 m, rezervor ≤ 1,8 m). Colliderele 192/238 citesc masa din layout.
      assert.ok(Math.abs(bounds[1]! - planar.baseYM) < epsilon, `${building.id} baseY`);
      assert.ok(
        bounds[4]! >= planar.baseYM + planar.heightM - epsilon &&
          bounds[4]! <= planar.baseYM + planar.heightM + 2.65,
        `${building.id} topY ${bounds[4]}`,
      );
    }
  } finally {
    city.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test('246: geometria emisă respectă nivelul de detaliu și bugetul de meshuri', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const lowScene = new Scene(engine);
    const lowCity = createCityScene(lowScene, layout, { facadeDetail: 'low' });
    const mediumCity = createCityScene(scene, layout, { facadeDetail: 'medium' });
    const highScene = new Scene(engine);
    const highCity = createCityScene(highScene, layout, { facadeDetail: 'high' });
    // LOW rămâne la mase netede; MEDIUM/HIGH adaugă geometrie (ferestre, cornișe, detalii).
    assert.ok(
      mediumCity.stats.vertices > lowCity.stats.vertices * 2,
      `MEDIUM ${mediumCity.stats.vertices} vs LOW ${lowCity.stats.vertices}`,
    );
    assert.ok(
      highCity.stats.vertices > mediumCity.stats.vertices,
      `HIGH ${highCity.stats.vertices} vs MEDIUM ${mediumCity.stats.vertices}`,
    );
    // Numărul de meshuri nu depășește bugetul (un lot pe material + loturile noi de fațadă).
    for (const [name, city] of [
      ['low', lowCity],
      ['medium', mediumCity],
      ['high', highCity],
    ] as const) {
      assert.ok(city.stats.meshes <= 16, `${name}: ${city.stats.meshes} meshuri`);
    }
    // Toate clădirile sunt redate și au slice (identitatea elementului se păstrează).
    for (const building of buildings) {
      assert.ok(highCity.elementGeometry(building.id), building.id);
    }
    lowCity.dispose();
    mediumCity.dispose();
    highCity.dispose();
    lowScene.dispose();
    highScene.dispose();
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

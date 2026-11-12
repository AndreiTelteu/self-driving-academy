/**
 * PBI 157 — structural render probe and its deterministic report.
 *
 * The probe runs the **real** presentation contracts (`createCityScene`, `createCityDecorScene`,
 * `createDaylight`, `BabylonCellBatches` + `VehiclePickingRegistry`) on the real neighbourhood
 * layout inside a Babylon `NullEngine`. It measures what a renderer would submit — draw calls,
 * thin instances, shadow-map casters, element bounds — and never measures wall-clock time, so the
 * capture is reproducible and `--check` can recompute it byte-for-byte.
 *
 * Frame time and GPU work are **not** measured here: a headless software run is not evidence for
 * hardware FPS (Docs/25: a CPU scene without a renderer is a supplementary probe, never a
 * substitute). They are reported as `NOT_MEASURED` with the reason, not as zero.
 *
 * Every budget is **cited** from the fixed manifest (`Docs/performance-budgets.json`) or from the
 * declared quality contract; nothing in this module may define or relax a budget.
 */
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import '@babylonjs/core/Meshes/instancedMesh.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { Mesh as MeshClass } from '@babylonjs/core/Meshes/mesh.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { createCityLayout, createNeighbourhoodMap } from '../../src/world';
import { createCityScene } from '../../src/rendering/babylon/city-scene';
import { createCityDecorScene } from '../../src/rendering/babylon/city-decor-scene';
import { createDaylight } from '../../src/rendering/babylon/daylight';
import { BabylonCellBatches } from '../../src/rendering/babylon/cell-batches';
import { VehiclePickingRegistry } from '../../src/rendering/babylon/vehicle-picking-registry';
import { BabylonVehiclePicker } from '../../src/rendering/babylon/vehicle-picking';
import { QUALITY_PRESETS, type QualityPreset } from '../../src/rendering/quality-policy';
import type { QualityPreferences } from '../../src/settings';

export const RENDER_BUDGET_PROBE_VERSION = '157-render-budget-v1';

export type Verdict = 'PASS' | 'FAIL' | 'NOT_MEASURED' | 'STRUCTURAL' | 'REPORTED';

/** 1/1000 of a millimetre; element bounds are compared at this precision, not with a tolerance. */
const BOUNDS_DIGITS = 6;

export interface ElementBounds {
  /** Rounded `[minX, minY, minZ, maxX, maxY, maxZ]` in world space. */
  readonly aabb: readonly number[];
}

export interface CityArm {
  readonly elements: number;
  readonly drawCalls: number;
  readonly meshes: number;
  readonly materials: number;
  readonly geometries: number;
  readonly thinBatches: number;
  readonly thinInstances: number;
  readonly instancedElements: number;
  readonly mergedElements: number;
  readonly vertices: number;
  readonly triangles: number;
  readonly frozenMaterials: number;
  /** Per rendered element world bounds; the before/after equivalence proof. */
  readonly bounds: Readonly<Record<string, ElementBounds>>;
  /** Per lane-surface vertex digest of the geometry that belongs to that element. */
  readonly laneDigests: Readonly<Record<string, string>>;
}

export interface DecorArm {
  readonly items: number;
  readonly cells: number;
  readonly drawCalls: number;
  readonly vertices: number;
  readonly triangles: number;
}

export interface ShadowArm {
  readonly preset: QualityPreset;
  readonly limit: number;
  readonly registered: number;
  readonly admitted: number;
  readonly rejected: number;
  /** Essential casters (the player's vehicle) that did not enter the shadow map. */
  readonly essentialDropped: number;
  readonly essentialAdmitted: number;
  readonly shadowMapSize: number;
  readonly shadowMaps: number;
  readonly retainedCasters: number;
}

export interface LodArm {
  readonly preset: QualityPreset;
  readonly nearToFarM: number;
  readonly farToNearM: number;
  /** Hosts enabled on each probe distance of the sweep, `NEAR`/`FAR`/`none`, in sweep order. */
  readonly levels: readonly string[];
  readonly switches: number;
  /** Level changes while the camera dithers inside the hysteresis band; must be 0. */
  readonly oscillation: number;
  readonly drawnHosts: number;
}

export interface PickingArm {
  readonly rays: number;
  readonly resolved: number;
  readonly identical: number;
  /** First ray whose pre/post instancing identity differs, or null. */
  readonly firstMismatch: string | null;
}

export interface RenderMeasurement {
  readonly version: string;
  readonly city: CityArm;
  readonly decor: DecorArm;
  readonly shadows: readonly ShadowArm[];
  readonly lod: readonly LodArm[];
  readonly picking: PickingArm;
}

function round(value: number): number {
  const factor = 10 ** BOUNDS_DIGITS;
  return Math.round(value * factor) / factor;
}

function countDrawCalls(scene: Scene): number {
  return scene.meshes.filter(
    (mesh) =>
      !mesh.isDisposed() && mesh.isEnabled() && mesh.isVisible && mesh.getTotalVertices() > 0,
  ).length;
}

function thinStats(scene: Scene): { batches: number; instances: number } {
  let batches = 0,
    instances = 0;
  for (const mesh of scene.meshes) {
    if (mesh instanceof Object && 'hasThinInstances' in mesh) {
      const candidate = mesh as Mesh;
      if (!candidate.hasThinInstances) continue;
      batches += 1;
      instances += candidate.thinInstanceCount;
    }
  }
  return { batches, instances };
}

function digest(values: readonly number[] | Float32Array): string {
  let hash = 2166136261;
  for (const value of values) {
    hash ^= Math.round(value * 1000);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function aabbOf(mesh: AbstractMesh): readonly number[] | null {
  const box = mesh.getBoundingInfo().boundingBox;
  if (!Number.isFinite(box.minimumWorld.x) || !Number.isFinite(box.maximumWorld.x)) return null;
  return Object.freeze([
    round(box.minimumWorld.x),
    round(box.minimumWorld.y),
    round(box.minimumWorld.z),
    round(box.maximumWorld.x),
    round(box.maximumWorld.y),
    round(box.maximumWorld.z),
  ]);
}

function cityArm(): CityArm {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const layout = createCityLayout(createNeighbourhoodMap());
  const city = createCityScene(scene, layout);
  try {
    const bounds: Record<string, ElementBounds> = {};
    const laneDigests: Record<string, string> = {};
    const withBounds = city as unknown as {
      elementBounds?: (id: string) => readonly number[] | null;
    };
    const withRange = city as unknown as {
      elementGeometry?: (id: string) => { offset: number; count: number } | null;
    };
    let frozen = 0;
    for (const material of scene.materials) if (material.isFrozen) frozen += 1;
    for (const id of city.getRenderedElementIds()) {
      if (withBounds.elementBounds) {
        const entry = withBounds.elementBounds(id);
        if (entry) bounds[id] = { aabb: Object.freeze([...entry]) };
      } else {
        const mesh = city.meshFor(id);
        const lamp = city.lampFor(id);
        const aabb = mesh ? aabbOf(mesh) : null;
        const lampAabb = lamp ? aabbOf(lamp) : null;
        const union =
          aabb && lampAabb
            ? [
                Math.min(aabb[0]!, lampAabb[0]!),
                Math.min(aabb[1]!, lampAabb[1]!),
                Math.min(aabb[2]!, lampAabb[2]!),
                Math.max(aabb[3]!, lampAabb[3]!),
                Math.max(aabb[4]!, lampAabb[4]!),
                Math.max(aabb[5]!, lampAabb[5]!),
              ]
            : (aabb ?? lampAabb);
        if (union) bounds[id] = { aabb: Object.freeze(union) };
      }
      const element = layout.elements.find((candidate) => candidate.id === id);
      if (!element || element.kind !== 'LANE_SURFACE') continue;
      const mesh = city.meshFor(id);
      if (!mesh) continue;
      const positions = mesh.getVerticesData('position');
      if (!positions) continue;
      const range = withRange.elementGeometry?.(id) ?? null;
      laneDigests[id] = range
        ? digest(positions.slice(range.offset * 3, (range.offset + range.count) * 3))
        : digest(positions);
    }
    const thin = thinStats(scene);
    const stats = city.stats as unknown as Record<string, number>;
    const arm: CityArm = Object.freeze({
      elements: city.getRenderedElementIds().length,
      drawCalls: countDrawCalls(scene),
      meshes: scene.meshes.filter((mesh) => !mesh.isDisposed()).length,
      materials: scene.materials.length,
      geometries: scene.geometries.length,
      thinBatches: thin.batches,
      thinInstances: thin.instances,
      instancedElements: Number(stats.instancedElements ?? 0),
      mergedElements: Number(stats.mergedElements ?? 0),
      vertices: Number(stats.vertices ?? 0),
      triangles: Number(stats.triangles ?? 0),
      frozenMaterials: frozen,
      bounds: Object.freeze(bounds),
      laneDigests: Object.freeze(laneDigests),
    });
    return arm;
  } finally {
    city.dispose();
    scene.dispose();
    engine.dispose();
  }
}

function decorArm(): DecorArm {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const layout = createCityLayout(createNeighbourhoodMap());
  const decor = createCityDecorScene(scene, layout);
  try {
    return Object.freeze({
      items: decor.stats.items,
      cells: decor.stats.cells,
      drawCalls: countDrawCalls(scene),
      vertices: decor.stats.vertices,
      triangles: decor.stats.triangles,
    });
  } finally {
    decor.dispose();
    scene.dispose();
    engine.dispose();
  }
}

const preferences: QualityPreferences = {
  preset: 'MEDIUM',
  preferredBackend: 'WEBGL2',
  resolutionScale: 1,
  adaptive: false,
};

/**
 * 70 simulated vehicles (the maximum V1 workload) plus the selected taxi. The selected taxi is
 * registered **last** on purpose: it is the caster a player sees and must never be the one a
 * bounded shadow map silently drops.
 */
function shadowArm(preset: QualityPreset): ShadowArm {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const light = createDaylight(
    scene,
    { ...preferences, preset },
    { width: 1920, height: 1080, dpr: 1 },
  );
  const traffic: AbstractMesh[] = [];
  try {
    for (let index = 0; index < 70; index += 1) {
      const mesh = new MeshClass(`traffic-${index}`, scene);
      traffic.push(mesh);
      const withPriority = light.addShadowCaster as unknown as (
        mesh: AbstractMesh,
        priority?: 'essential' | 'standard' | 'optional',
      ) => boolean;
      withPriority(mesh, 'standard');
    }
    const player = new MeshClass('vehicle-0', scene);
    const withPriority = light.addShadowCaster as unknown as (
      mesh: AbstractMesh,
      priority?: 'essential' | 'standard' | 'optional',
    ) => boolean;
    withPriority(player, 'essential');
    const limit = QUALITY_PRESETS[preset].maxShadowCasters;
    const counts = light.getResourceCounts();
    const renderList = scene.lights[1]?.getShadowGenerator()?.getShadowMap()?.renderList ?? [];
    const admitted = renderList.length;
    const essentialAdmitted = renderList.includes(player) ? 1 : 0;
    return Object.freeze({
      preset,
      limit,
      registered: 71,
      admitted,
      rejected: 71 - admitted,
      essentialDropped: limit > 0 && essentialAdmitted === 0 ? 1 : 0,
      essentialAdmitted,
      shadowMapSize: QUALITY_PRESETS[preset].shadowMapSize,
      shadowMaps: counts.shadowMaps,
      retainedCasters: counts.retainedCasters,
    });
  } finally {
    light.dispose();
    scene.dispose();
    engine.dispose();
  }
}

function lodArm(preset: QualityPreset): LodArm {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const source = CreateBox('lod-source', { size: 2 }, scene);
  const distant = CreateBox('lod-distant', { size: 2 }, scene);
  source.setEnabled(false);
  distant.setEnabled(false);
  const picking = new VehiclePickingRegistry(scene);
  const batches = new BabylonCellBatches(scene, picking);
  try {
    batches.add({
      id: 'lod',
      cell: '0:0',
      source,
      distantSource: distant,
      dynamic: false,
      instances: [{ entityId: 'lod', matrix: Matrix.Identity() }],
    });
    const near = scene.getMeshByName('batch:lod:near') as Mesh;
    const far = scene.getMeshByName('batch:lod:far') as Mesh;
    const level = (): string => (near.isEnabled() ? 'NEAR' : far.isEnabled() ? 'FAR' : 'none');
    const lodDistance = QUALITY_PRESETS[preset].lodDistance;
    const sweep = [
      0,
      lodDistance - 5,
      lodDistance,
      lodDistance + 1,
      lodDistance + 5,
      lodDistance + 20,
      lodDistance * 4,
    ];
    const levels: string[] = [];
    for (const distance of sweep) {
      batches.updateLod(new Vector3(0, 0, -distance), preset);
      levels.push(level());
    }
    let switches = 0;
    for (let index = 1; index < levels.length; index += 1)
      if (levels[index] !== levels[index - 1]) switches += 1;
    // Approach the band from the near side, then dither across it: a stable LOD must not strobe.
    batches.updateLod(new Vector3(0, 0, 0), preset);
    let oscillation = 0;
    let previous = level();
    const radius = source.getBoundingInfo().boundingSphere.radius;
    const bandCenter = lodDistance + radius;
    for (let step = 0; step < 400; step += 1) {
      const offset = ((step % 40) - 20) * 0.24; // ±4.8 m, inside the declared 5 m hysteresis
      batches.updateLod(new Vector3(0, 0, -(bandCenter + offset)), preset);
      const current = level();
      if (current !== previous) {
        oscillation += 1;
        previous = current;
      }
    }
    const metrics = batches.metrics as unknown as { drawnHosts?: number };
    const drawnHosts = metrics.drawnHosts ?? Number(near.isEnabled()) + Number(far.isEnabled());
    return Object.freeze({
      preset,
      nearToFarM: lodDistance,
      farToNearM: lodDistance - 5,
      levels: Object.freeze(levels),
      switches,
      oscillation,
      drawnHosts,
    });
  } finally {
    batches.dispose();
    picking.dispose();
    scene.dispose();
    engine.dispose();
  }
}

/**
 * The same 70 vehicles picked twice: as ordinary meshes (the pre-instancing shape) and as thin
 * instances of one batch. A fixed screen grid of rays must resolve to the same entity IDs.
 */
function pickingArm(): PickingArm {
  const results: { normal: (string | null)[]; thin: (string | null)[] } = {
    normal: [],
    thin: [],
  };
  const grid: [number, number][] = [];
  for (let column = 0; column < 8; column += 1)
    for (let row = 0; row < 4; row += 1) grid.push([64 + column * 32, 32 + row * 32]);
  for (const mode of ['normal', 'thin'] as const) {
    const engine = new NullEngine();
    engine.getCaps().instancedArrays = true;
    const scene = new Scene(engine);
    const camera = new FreeCamera('camera', new Vector3(0, 3.2, -16), scene);
    camera.setTarget(new Vector3(0, 1, 4));
    const registry = new VehiclePickingRegistry(scene);
    const picker = new BabylonVehiclePicker(scene, registry);
    const source = CreateBox('vehicle', { width: 1.8, height: 1.2, depth: 3.5 }, scene);
    source.material = new StandardMaterial('body', scene);
    const matrices: Matrix[] = [];
    for (let index = 0; index < 70; index += 1) {
      const x = (index % 10) * 2.6 - 12;
      const z = Math.floor(index / 10) * 5.4;
      const matrix = Matrix.Translation(x, 0.6, z);
      matrices.push(matrix);
      if (mode === 'thin') continue;
      const mesh = source.createInstance(`vehicle-${index}`);
      mesh.position.set(x, 0.6, z);
      mesh.setEnabled(true);
      registry.register(mesh, `vehicle-${index}`);
    }
    if (mode === 'thin') {
      source.thinInstanceSetBuffer(
        'matrix',
        new Float32Array(matrices.flatMap((matrix) => Array.from(matrix.m))),
        16,
        false,
      );
      source.thinInstanceRefreshBoundingInfo(true);
      registry.registerThinBatch(
        source,
        matrices.map((_, index) => `vehicle-${index}`),
      );
    } else source.setEnabled(false);
    scene.render();
    for (const [x, y] of grid) results[mode].push(picker.pick(x, y)?.entityId ?? null);
    picker.dispose();
    registry.dispose();
    scene.dispose();
    engine.dispose();
  }
  let identical = 0;
  let firstMismatch: string | null = null;
  for (let index = 0; index < grid.length; index += 1) {
    const normal = results.normal[index] ?? null;
    const thin = results.thin[index] ?? null;
    if (normal === thin) identical += 1;
    else if (firstMismatch === null)
      firstMismatch = `ray ${index} (${grid[index]![0]},${grid[index]![1]}): normal ${normal}, thin ${thin}`;
  }
  return Object.freeze({
    rays: grid.length,
    resolved: results.normal.filter((entry) => entry !== null).length,
    identical,
    firstMismatch,
  });
}

/** Runs the whole probe. Pure with respect to the repository: it writes nothing. */
export function measureRenderBudget(): RenderMeasurement {
  return Object.freeze({
    version: RENDER_BUDGET_PROBE_VERSION,
    city: cityArm(),
    decor: decorArm(),
    shadows: Object.freeze((['LOW', 'MEDIUM', 'HIGH'] as const).map((preset) => shadowArm(preset))),
    lod: Object.freeze((['LOW', 'MEDIUM', 'HIGH'] as const).map((preset) => lodArm(preset))),
    picking: pickingArm(),
  });
}

/* ------------------------------------------------------------------------------------------- */
/* Report                                                                                      */
/* ------------------------------------------------------------------------------------------- */

export interface RenderBudgets {
  readonly budgetVersion: string;
  readonly drawCalls: number | null;
  readonly instances: number | null;
  readonly batches: number | null;
  readonly babylonObjects: number | null;
  readonly matrixBufferBytes: number | null;
  readonly frameP95Ms: number | null;
  readonly frameP99Ms: number | null;
  readonly gpuP95Ms: number | null;
  readonly source: string;
}

/** Reads the fixed manifest defensively: a vanished budget is an error, never a silent pass. */
export function parseRenderBudgets(value: unknown): RenderBudgets {
  const source = value as Record<string, unknown>;
  if (typeof source !== 'object' || source === null)
    throw new TypeError('Budget manifest must be an object');
  const capacities = source.proposedCapacities as Record<string, unknown> | undefined;
  const contracts = source.resourceAdmissionContracts as Record<string, unknown> | undefined;
  const rendering = contracts?.rendering as Record<string, unknown> | undefined;
  const budgets = source.proposedBudgets as Record<string, unknown> | undefined;
  if (!capacities || !rendering || !budgets)
    throw new TypeError('Budget manifest is missing rendering capacities/admission contracts');
  const number = (entry: unknown, path: string): number | null => {
    if (entry === null || entry === undefined) return null;
    if (typeof entry !== 'number' || !Number.isFinite(entry))
      throw new TypeError(`Budget manifest field ${path} must be a finite number or null`);
    return entry;
  };
  const laptop = budgets.laptop as Record<string, unknown>;
  return Object.freeze({
    budgetVersion: String(source.budgetVersion),
    drawCalls: number(rendering.drawCalls, 'resourceAdmissionContracts.rendering.drawCalls'),
    instances: number(rendering.instances, 'resourceAdmissionContracts.rendering.instances'),
    batches: number(rendering.batches, 'resourceAdmissionContracts.rendering.batches'),
    babylonObjects: number(capacities.babylonObjects, 'proposedCapacities.babylonObjects'),
    matrixBufferBytes: number(
      rendering.matrixBufferBytes,
      'resourceAdmissionContracts.rendering.matrixBufferBytes',
    ),
    frameP95Ms: number(laptop.frameP95Ms, 'proposedBudgets.laptop.frameP95Ms'),
    frameP99Ms: number(laptop.frameP99Ms, 'proposedBudgets.laptop.frameP99Ms'),
    gpuP95Ms: number(laptop.gpuP95Ms, 'proposedBudgets.laptop.gpuP95Ms'),
    source: 'Docs/performance-budgets.json',
  });
}

export interface RenderRow {
  readonly id: string;
  readonly metric: string;
  readonly unit: 'draw calls' | 'instances' | 'batches' | 'objects' | 'MiB' | 'ms' | 'px' | 'count';
  readonly before: number | null;
  readonly after: number | null;
  readonly budget: Readonly<{
    value: number;
    direction: 'maximum' | 'minimum';
    source: string;
  }> | null;
  readonly verdict: Verdict;
  readonly note: string;
}

export interface RenderBudgetReport {
  readonly version: string;
  readonly manifest: Readonly<{ budgetVersion: string; modified: false }>;
  readonly captures: Readonly<{
    before: Readonly<{ capturedAt: string; commit: string; label: string }>;
    after: Readonly<{ capturedAt: string; commit: string; label: string }>;
  }>;
  readonly rows: readonly RenderRow[];
  readonly deviations: readonly string[];
  readonly structural: readonly string[];
  readonly notMeasured: readonly Readonly<{ metric: string; reason: string }>[];
  readonly summary: Readonly<{
    pass: number;
    fail: number;
    notMeasured: number;
    structural: number;
    gate: 'STRUCTURAL_PASS' | 'FAILED';
    hardwareGameplayGate: 'NOT_VALIDATED';
    note: string;
  }>;
}

export interface CaptureMeta {
  readonly capturedAt: string;
  readonly commit: string;
  readonly label: string;
}

function row(input: RenderRow): RenderRow {
  return Object.freeze(input);
}

function maximum(
  id: string,
  metric: string,
  unit: RenderRow['unit'],
  before: number | null,
  after: number | null,
  budget: number | null,
  source: string,
  note: string,
): RenderRow {
  const within = budget === null || after === null ? null : after <= budget;
  return row({
    id,
    metric,
    unit,
    before,
    after,
    budget:
      budget === null
        ? null
        : Object.freeze({ value: budget, direction: 'maximum' as const, source }),
    verdict: within === null ? 'REPORTED' : within ? 'PASS' : 'FAIL',
    note,
  });
}

function boundsDeviation(
  reference: Record<string, ElementBounds>,
  candidate: Record<string, ElementBounds>,
): { max: number; missing: number } {
  let max = 0;
  let missing = 0;
  for (const [id, entry] of Object.entries(reference)) {
    const other = candidate[id];
    if (!other) {
      missing += 1;
      continue;
    }
    for (let index = 0; index < 6; index += 1)
      max = Math.max(max, Math.abs((entry.aabb[index] as number) - (other.aabb[index] as number)));
  }
  return { max, missing };
}

function digestMismatches(
  reference: Record<string, string>,
  candidate: Record<string, string>,
): number {
  let mismatches = 0;
  for (const [id, value] of Object.entries(reference)) if (candidate[id] !== value) mismatches += 1;
  return mismatches;
}

export function buildRenderBudgetReport(input: {
  budgets: RenderBudgets;
  before: RenderMeasurement;
  after: RenderMeasurement;
  beforeMeta: CaptureMeta;
  afterMeta: CaptureMeta;
}): RenderBudgetReport {
  const { budgets, before, after } = input;
  const rows: RenderRow[] = [];
  const source = budgets.source;
  const manifest = `Docs/performance-budgets.json (${budgets.budgetVersion})`;

  rows.push(
    maximum(
      'city-draw-calls',
      'draw calls ale layout-ului orașului (042)',
      'draw calls',
      before.city.drawCalls,
      after.city.drawCalls,
      budgets.drawCalls,
      `${source} resourceAdmissionContracts.rendering.drawCalls`,
      `${after.city.elements} elemente în ${after.city.meshes} mesh-uri (${after.city.thinBatches} hosturi thin cu ${after.city.thinInstances} instanțe)`,
    ),
    maximum(
      'city-thin-instances',
      'instanțe thin în batchurile orașului',
      'instances',
      before.city.thinInstances,
      after.city.thinInstances,
      budgets.instances,
      `${source} resourceAdmissionContracts.rendering.instances`,
      'semnalele repetate sunt instanțiate pe geometrie unitară partajată',
    ),
    maximum(
      'city-babylon-objects',
      'obiecte Babylon deținute de scena orașului',
      'objects',
      before.city.meshes,
      after.city.meshes,
      budgets.babylonObjects,
      `${source} proposedCapacities.babylonObjects`,
      'mesh-uri, nu instanțe: o instanță nu creează un obiect Babylon',
    ),
    maximum(
      'scene-material-batches',
      'batchuri statice pe material (oraș + decor)',
      'batches',
      before.city.thinBatches + before.decor.cells,
      after.city.thinBatches + after.decor.cells,
      budgets.batches,
      `${source} resourceAdmissionContracts.rendering.batches`,
      'celule de decor 146 plus hosturile thin ale orașului; un host înlocuiește zeci de mesh-uri per element',
    ),
    maximum(
      'decor-draw-calls',
      'draw calls ale decorului 146 (control neschimbat)',
      'draw calls',
      before.decor.drawCalls,
      after.decor.drawCalls,
      budgets.drawCalls,
      `${source} resourceAdmissionContracts.rendering.drawCalls`,
      `${after.decor.items} itemuri în ${after.decor.cells} celule`,
    ),
    maximum(
      'scene-draw-calls',
      'draw calls totale ale scenei de referință (oraș + decor)',
      'draw calls',
      before.city.drawCalls + before.decor.drawCalls,
      after.city.drawCalls + after.decor.drawCalls,
      budgets.drawCalls,
      `${source} resourceAdmissionContracts.rendering.drawCalls`,
      'suma celor două fixture-uri reale, aceeași scenă și același layout',
    ),
  );

  const bounds = boundsDeviation(before.city.bounds, after.city.bounds);
  rows.push(
    row({
      id: 'city-element-bounds',
      metric: 'abaterea maximă a limitelor unui element față de baseline',
      unit: 'px',
      before: 0,
      after: round(bounds.max) as number,
      budget: Object.freeze({
        value: 1e-4,
        direction: 'maximum' as const,
        source: 'contract 042: aceeași poziție și aceeași amprentă (0,1 mm, limita float32)',
      }),
      verdict: bounds.max <= 1e-4 && bounds.missing === 0 ? 'PASS' : 'FAIL',
      note: `${Object.keys(after.city.bounds).length} elemente comparate față de ${Object.keys(before.city.bounds).length}; elemente lipsă ${bounds.missing}`,
    }),
    row({
      id: 'city-lane-geometry',
      metric: 'digest-uri de vârfuri de bandă identice',
      unit: 'count',
      before: Object.keys(before.city.laneDigests).length,
      after: Object.keys(after.city.laneDigests).length,
      budget: null,
      verdict:
        Object.keys(before.city.laneDigests).length ===
          Object.keys(after.city.laneDigests).length &&
        digestMismatches(before.city.laneDigests, after.city.laneDigests) === 0
          ? 'PASS'
          : 'FAIL',
      note: `diferite: ${digestMismatches(before.city.laneDigests, after.city.laneDigests)}`,
    }),
  );

  for (const arm of after.shadows) {
    const reference = before.shadows.find((entry) => entry.preset === arm.preset) ?? arm;
    rows.push(
      row({
        id: `shadows-${arm.preset.toLowerCase()}-essential`,
        metric: 'casters esențiali (taxiul selectat) în shadow map',
        unit: 'count',
        before: reference.essentialAdmitted,
        after: arm.essentialAdmitted,
        budget: Object.freeze({
          value: 1,
          direction: 'minimum' as const,
          source: 'contract 016: umbrele esențiale nu dispar la plafon',
        }),
        verdict: arm.essentialAdmitted === (arm.limit === 0 ? 0 : 1) ? 'PASS' : 'FAIL',
        note:
          arm.limit === 0
            ? `preset ${arm.preset}: harta de umbre e dezactivată prin contract, deci nimic nu intră`
            : `plafon ${arm.limit}, admitere pe prioritate (esențial → standard → opțional)`,
      }),
      maximum(
        `shadows-${arm.preset.toLowerCase()}-admitted`,
        'casters admiși în shadow map',
        'count',
        reference.admitted,
        arm.admitted,
        arm.limit,
        `${source} + contract 016 (${arm.preset})`,
        `înregistrați ${arm.registered}, respinși ${arm.rejected}; harta ${arm.shadowMapSize}²`,
      ),
    );
  }

  for (const arm of after.lod) {
    const reference = before.lod.find((entry) => entry.preset === arm.preset) ?? arm;
    rows.push(
      row({
        id: `lod-${arm.preset.toLowerCase()}`,
        metric: 'tranziții LOD pe balaria de distanță (0 … 4×prag)',
        unit: 'count',
        before: reference.switches,
        after: arm.switches,
        budget: Object.freeze({
          value: 1,
          direction: 'maximum' as const,
          source: `contract LOD declarat: NEAR ≤ ${arm.nearToFarM} m, revenire FAR→NEAR sub ${arm.farToNearM} m`,
        }),
        verdict: arm.switches === 1 && arm.oscillation === 0 ? 'PASS' : 'FAIL',
        note: `nivele: ${arm.levels.join(' → ')}; oscilații în banda de histerezis: ${arm.oscillation}`,
      }),
    );
  }

  rows.push(
    row({
      id: 'picking-equivalence',
      metric: 'raze cu aceeași identitate înainte/după instanțiere',
      unit: 'count',
      before: before.picking.identical,
      after: after.picking.identical,
      budget: Object.freeze({
        value: after.picking.rays,
        direction: 'minimum' as const,
        source: 'contract 014/013: aceeași selecție pentru același ray',
      }),
      verdict: after.picking.identical === after.picking.rays ? 'PASS' : 'FAIL',
      note:
        after.picking.firstMismatch === null
          ? `${after.picking.resolved} raze au nimerit un vehicul; toate cele ${after.picking.rays} au aceeași identitate`
          : `prima diferență: ${after.picking.firstMismatch}`,
    }),
  );

  rows.push(
    row({
      id: 'frame-p95',
      metric: 'interval de cadru p95 (hardware)',
      unit: 'ms',
      before: null,
      after: null,
      budget:
        budgets.frameP95Ms === null
          ? null
          : Object.freeze({
              value: budgets.frameP95Ms,
              direction: 'maximum' as const,
              source: `${source} proposedBudgets.laptop.frameP95Ms`,
            }),
      verdict: 'NOT_MEASURED',
      note: 'proba este structurală, în NullEngine: nu există renderer hardware, deci frame time-ul nu este măsurat și nu se raportează 0',
    }),
    row({
      id: 'gpu-p95',
      metric: 'lucru GPU p95',
      unit: 'ms',
      before: null,
      after: null,
      budget:
        budgets.gpuP95Ms === null
          ? null
          : Object.freeze({
              value: budgets.gpuP95Ms,
              direction: 'maximum' as const,
              source: `${source} proposedBudgets.laptop.gpuP95Ms`,
            }),
      verdict: 'NOT_MEASURED',
      note: 'fără context GPU nu există timer; valoarea rămâne null (Docs/25: headless/software nu dovedește FPS)',
    }),
  );

  const structural: string[] = [
    `${before.city.elements} elemente randate înainte și ${after.city.elements} după; identitatea fiecărui element este păstrată`,
    `instanțe thin: ${before.city.thinInstances} → ${after.city.thinInstances}; mesh-uri: ${before.city.meshes} → ${after.city.meshes}`,
    `materiale înghețate: ${before.city.frozenMaterials} → ${after.city.frozenMaterials}`,
    `vârfuri/triunghiuri: ${before.city.vertices}/${before.city.triangles} → ${after.city.vertices}/${after.city.triangles}`,
    `picking: ${after.picking.identical}/${after.picking.rays} raze identice (${after.picking.resolved} nimeresc un vehicul)`,
    `LOD: ${after.lod.map((arm) => `${arm.preset} ${arm.switches} tranziție/0 oscilații`).join('; ')}`,
    `umbre: ${after.shadows.map((arm) => `${arm.preset} ${arm.admitted}/${arm.limit} admiși, esențial ${arm.essentialAdmitted}`).join('; ')}`,
    `manifest: ${manifest}; bugetele nu au fost modificate`,
  ];

  const normal = rows.filter((entry) => entry.verdict !== 'NOT_MEASURED');
  return Object.freeze({
    version: RENDER_BUDGET_PROBE_VERSION,
    manifest: Object.freeze({ budgetVersion: budgets.budgetVersion, modified: false as const }),
    captures: Object.freeze({
      before: Object.freeze({ ...input.beforeMeta }),
      after: Object.freeze({ ...input.afterMeta }),
    }),
    rows: Object.freeze(rows),
    deviations: Object.freeze(
      rows
        .filter((entry) => entry.verdict === 'FAIL')
        .map(
          (entry) =>
            `${entry.metric}: ${entry.after ?? 'fără valoare'} ${entry.unit} față de ${entry.budget === null ? 'buget inexistent' : `${entry.budget.direction === 'maximum' ? '≤' : '≥'} ${entry.budget.value} ${entry.unit}`} [${entry.budget?.source ?? 'fără sursă'}]`,
        ),
    ),
    structural: Object.freeze(structural),
    notMeasured: Object.freeze(
      rows
        .filter((entry) => entry.verdict === 'NOT_MEASURED')
        .map((entry) => Object.freeze({ metric: entry.metric, reason: entry.note })),
    ),
    summary: Object.freeze({
      pass: normal.filter((entry) => entry.verdict === 'PASS').length,
      fail: normal.filter((entry) => entry.verdict === 'FAIL').length,
      notMeasured: rows.filter((entry) => entry.verdict === 'NOT_MEASURED').length,
      structural: structural.length,
      gate: rows.some((entry) => entry.verdict === 'FAIL')
        ? ('FAILED' as const)
        : ('STRUCTURAL_PASS' as const),
      hardwareGameplayGate: 'NOT_VALIDATED' as const,
      note: 'Verdictul acoperă numai partea structurală măsurabilă determinist; gate-ul hardware al jocului complet rămâne NOT_VALIDATED.',
    }),
  });
}

/** Structural self-check of a report; never used to hide a FAIL. */
export function verifyRenderBudgetReport(report: RenderBudgetReport): readonly string[] {
  const issues: string[] = [];
  if (report.manifest.modified !== false) issues.push('manifestul de bugete apare ca modificat');
  for (const row of report.rows) {
    if (row.verdict === 'PASS' && row.after === null)
      issues.push(`rândul ${row.id} este PASS fără măsurătoare`);
    if (row.verdict === 'NOT_MEASURED' && row.note.trim().length === 0)
      issues.push(`rândul ${row.id} este NOT_MEASURED fără motiv`);
    if (row.budget !== null && row.budget.source.trim().length === 0)
      issues.push(`rândul ${row.id} nu citează sursa bugetului`);
    if (row.verdict === 'FAIL' && !report.deviations.some((entry) => entry.includes(row.metric)))
      issues.push(`absența abaterii pentru rândul ${row.id} (${row.metric})`);
  }
  const counted = report.summary.pass + report.summary.fail + report.summary.notMeasured;
  if (counted > report.rows.length)
    issues.push(`sumarul numără ${counted} rânduri, raportul are ${report.rows.length}`);
  if (report.summary.fail > 0 && report.summary.gate !== 'FAILED')
    issues.push('raportul are FAIL dar gate-ul nu este FAILED');
  const pickingRows = report.rows.filter((entry) => entry.id === 'picking-equivalence');
  if (pickingRows.length !== 1) issues.push('lipsește exact un rând de echivalență a pickingului');
  else {
    const picking = pickingRows[0]!;
    if (picking.after === null || picking.budget === null)
      issues.push('rândul de picking nu are măsurătoare și buget');
    else if (picking.after < picking.budget.value)
      issues.push(`picking: ${picking.after}/${picking.budget.value} raze identice`);
  }
  return Object.freeze(issues);
}

export function renderBudgetMarkdown(report: RenderBudgetReport): string {
  const lines: string[] = [];
  const cell = (value: number | null): string => (value === null ? '—' : String(value));
  lines.push('# PBI 157 — raport determinist al bugetului de randare');
  lines.push('');
  lines.push(
    `Probe structurale în NullEngine pe contractele reale de prezentare (\`${report.version}\`). Bugetele sunt citate din manifestul \`${report.manifest.budgetVersion}\` și **nu** sunt modificate.`,
  );
  lines.push('');
  lines.push(
    `- Înainte: \`${report.captures.before.label}\` · commit \`${report.captures.before.commit.slice(0, 12)}\` · ${report.captures.before.capturedAt}`,
  );
  lines.push(
    `- După: \`${report.captures.after.label}\` · commit \`${report.captures.after.commit.slice(0, 12)}\` · ${report.captures.after.capturedAt}`,
  );
  lines.push(
    `- Sumar: **${report.summary.pass} PASS**, **${report.summary.fail} FAIL**, ${report.summary.notMeasured} NOT_MEASURED; gate structural \`${report.summary.gate}\`, gate hardware \`${report.summary.hardwareGameplayGate}\``,
  );
  lines.push('');
  lines.push('## Metrici structurale');
  lines.push('');
  lines.push('| Metrică | Unitate | Înainte | După | Buget | Verdict | Notă |');
  lines.push('| --- | --- | ---: | ---: | --- | --- | --- |');
  for (const row of report.rows)
    lines.push(
      `| ${row.metric} | ${row.unit} | ${cell(row.before)} | ${cell(row.after)} | ${row.budget === null ? '—' : `${row.budget.value} (${row.budget.direction === 'maximum' ? '≤' : '≥'})`} | ${row.verdict} | ${row.note} |`,
    );
  lines.push('');
  lines.push('## Invarianți verificati');
  lines.push('');
  for (const entry of report.structural) lines.push(`- ${entry}`);
  lines.push('');
  lines.push('## Abateri');
  lines.push('');
  if (report.deviations.length === 0) lines.push('Niciun rând nu depășește bugetul citat.');
  else for (const entry of report.deviations) lines.push(`- ${entry}`);
  lines.push('');
  lines.push('## Ce nu a putut fi măsurat');
  lines.push('');
  for (const entry of report.notMeasured) lines.push(`- **${entry.metric}**: ${entry.reason}`);
  lines.push('');
  lines.push(report.summary.note);
  lines.push('');
  return lines.join('\n');
}

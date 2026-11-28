import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { Scene } from '@babylonjs/core/scene';
import type {
  DestructibleArchetype,
  DestructibleDefinition,
  DestructiblePlayground,
  DestructibleState,
} from '../../world';

/**
 * PBI 285 — presentation of the 227 destructible decor.
 *
 * The scene only copies authoritative states: it never decides a state, an impulse, a material or a
 * fragment count. Object meshes, the bounded fragment pool (192) and the small shock-ring pool are
 * all owned here and released on dispose. Fragments are cosmetic, never physics bodies.
 */
export const DESTRUCTIBLE_DECOR_SCENE_VERSION = '285-destructible-decor-scene-v1' as const;
export const DESTRUCTIBLE_VISUAL_LIMITS = Object.freeze({
  fragmentPool: 192,
  fragmentLifetimeTicks: 120,
  shockRings: 4,
  shockRingLifetimeTicks: 24,
  fragmentMeshDrawCalls: 4,
});

export interface DestructibleObjectVisual {
  readonly objectId: string;
  readonly archetype: DestructibleArchetype;
  readonly state: DestructibleState;
  readonly positionM: Readonly<{ x: number; y: number; z: number }>;
  readonly headingRad: number;
  readonly displacementM: number;
}

export interface DestructibleReactionVisual {
  readonly eventId: string;
  readonly tick: number;
  readonly objectId: string;
  readonly material: 'WOOD' | 'PLASTIC' | 'METAL' | 'GLASS';
  readonly intensity: Readonly<{ normalized: number; tier: string }>;
  readonly positionM: Readonly<{ x: number; y: number; z: number }>;
  readonly fragments: number;
  readonly variant: 'FRAGMENT_BURST' | 'SHOCK_RING';
  readonly visualAlternative: boolean;
  readonly audioPlayed: boolean;
  readonly symbol: string;
  readonly text: string;
}

export interface DestructibleVisualFrame {
  readonly tick: number;
  readonly generation: number;
  readonly objects: readonly DestructibleObjectVisual[];
  readonly reactions: readonly DestructibleReactionVisual[];
  readonly lastReaction: DestructibleReactionVisual | null;
  readonly audioFallback: boolean;
  readonly fragmentLifetimeTicks: number;
  readonly fragmentPoolCap: number;
  readonly resets: number;
}

export interface DestructibleDecorSceneStats {
  readonly version: typeof DESTRUCTIBLE_DECOR_SCENE_VERSION;
  readonly objects: number;
  readonly objectMeshes: number;
  readonly hiddenBroken: number;
  readonly fragmentsActive: number;
  readonly fragmentsPeak: number;
  readonly fragmentsSpawned: number;
  readonly fragmentsExpired: number;
  readonly fragmentsDropped: number;
  readonly fragmentPoolCap: number;
  readonly shockRingsActive: number;
  readonly meshes: number;
  readonly drawCalls: number;
  readonly lastReactionId: string | null;
  readonly resets: number;
}

export interface DestructibleDecorScene {
  readonly version: typeof DESTRUCTIBLE_DECOR_SCENE_VERSION;
  readonly root: TransformNode;
  apply(frame: DestructibleVisualFrame | null): void;
  /** Advances the cosmetic fragment/shock-ring pool. The live tick is authoritative. */
  advance(tick: number): void;
  stats(): DestructibleDecorSceneStats;
  dispose(): void;
}

interface ObjectRecord {
  readonly definition: DestructibleDefinition;
  readonly nodes: Mesh[];
  lastState: DestructibleState;
}

interface FragmentRecord {
  readonly material: DestructibleReactionVisual['material'];
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  size: number;
  expiryTick: number;
}

interface RingRecord {
  readonly mesh: Mesh;
  expiryTick: number;
  strength: number;
}

const MATERIAL_COLORS: Readonly<Record<DestructibleReactionVisual['material'], Color3>> =
  Object.freeze({
    WOOD: new Color3(0.55, 0.37, 0.18),
    PLASTIC: new Color3(0.92, 0.35, 0.08),
    METAL: new Color3(0.55, 0.58, 0.62),
    GLASS: new Color3(0.6, 0.82, 0.95),
  });

const ARCHETYPE_MATERIAL: Readonly<
  Record<DestructibleArchetype, DestructibleReactionVisual['material']>
> = Object.freeze({
  FENCE_LIGHT: 'WOOD',
  CONE: 'PLASTIC',
  CRATE: 'WOOD',
  BIN: 'METAL',
  DECOR_SIGN: 'GLASS',
  STREET_FURNITURE: 'METAL',
});

function materialOf(scene: Scene, name: string, color: Color3, alpha = 1): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.specularColor = new Color3(0.12, 0.12, 0.12);
  material.emissiveColor = color.scale(0.08);
  material.alpha = alpha;
  return material;
}

function makeObjectMesh(
  scene: Scene,
  definition: DestructibleDefinition,
  material: StandardMaterial,
  index: number,
): Mesh[] {
  const { radiusM, heightM } = definition.collider;
  const nodes: Mesh[] = [];
  let mesh: Mesh;
  if (definition.archetype === 'CONE') {
    mesh = CreateCylinder(
      `destructible:${index}:cone`,
      {
        diameterTop: radiusM * 0.35,
        diameterBottom: radiusM * 2,
        height: heightM,
        tessellation: 8,
      },
      scene,
    );
  } else if (definition.archetype === 'BIN') {
    mesh = CreateCylinder(
      `destructible:${index}:bin`,
      { diameter: radiusM * 2, height: heightM, tessellation: 10 },
      scene,
    );
  } else if (definition.archetype === 'FENCE_LIGHT') {
    mesh = CreateBox(
      `destructible:${index}:fence`,
      { width: radiusM * 2, height: heightM, depth: 0.12 },
      scene,
    );
  } else if (definition.archetype === 'DECOR_SIGN') {
    mesh = CreateBox(
      `destructible:${index}:post`,
      { width: 0.08, height: heightM, depth: 0.08 },
      scene,
    );
    mesh.position.y = heightM / 2;
    mesh.material = material;
    mesh.isPickable = false;
    nodes.push(mesh);
    const sign = CreateBox(
      `destructible:${index}:sign`,
      { width: 0.7, height: 0.45, depth: 0.06 },
      scene,
    );
    sign.position.y = heightM - 0.28;
    sign.material = material;
    sign.isPickable = false;
    nodes.push(sign);
    return nodes;
  } else if (definition.archetype === 'STREET_FURNITURE') {
    mesh = CreateBox(
      `destructible:${index}:bench`,
      { width: 1.6, height: 0.35, depth: 0.55 },
      scene,
    );
  } else {
    mesh = CreateBox(
      `destructible:${index}:crate`,
      { width: radiusM * 2, height: heightM, depth: radiusM * 2 },
      scene,
    );
  }
  mesh.position.y = heightM / 2;
  mesh.material = material;
  mesh.isPickable = false;
  nodes.push(mesh);
  return nodes;
}

export function createDestructibleDecorScene(
  scene: Scene,
  plan: DestructiblePlayground,
): DestructibleDecorScene {
  const root = new TransformNode('destructible-root', scene);
  const materials = Object.freeze({
    WOOD: materialOf(scene, 'destructible:wood', MATERIAL_COLORS.WOOD),
    PLASTIC: materialOf(scene, 'destructible:plastic', MATERIAL_COLORS.PLASTIC),
    METAL: materialOf(scene, 'destructible:metal', MATERIAL_COLORS.METAL),
    GLASS: materialOf(scene, 'destructible:glass', MATERIAL_COLORS.GLASS, 0.72),
  });
  const records = new Map<string, ObjectRecord>();
  plan.definitions.forEach((definition, index) => {
    const material = materials[ARCHETYPE_MATERIAL[definition.archetype]];
    const nodes = makeObjectMesh(scene, definition, material, index);
    for (const node of nodes) {
      node.parent = root;
      node.position.x = definition.initialTransform.positionM.x;
      node.position.z = definition.initialTransform.positionM.z;
      node.rotation.y = definition.initialTransform.headingRad;
    }
    records.set(definition.objectId, { definition, nodes, lastState: 'INTACT' });
  });

  const matrixBuffers: Record<DestructibleReactionVisual['material'], Float32Array> = {
    WOOD: new Float32Array(DESTRUCTIBLE_VISUAL_LIMITS.fragmentPool * 16),
    PLASTIC: new Float32Array(DESTRUCTIBLE_VISUAL_LIMITS.fragmentPool * 16),
    METAL: new Float32Array(DESTRUCTIBLE_VISUAL_LIMITS.fragmentPool * 16),
    GLASS: new Float32Array(DESTRUCTIBLE_VISUAL_LIMITS.fragmentPool * 16),
  };
  const fragmentMeshes: Record<DestructibleReactionVisual['material'], Mesh> = {
    WOOD: CreateBox('destructible:fragments:wood', { size: 0.28 }, scene),
    PLASTIC: CreateBox('destructible:fragments:plastic', { size: 0.22 }, scene),
    METAL: CreateBox('destructible:fragments:metal', { size: 0.18 }, scene),
    GLASS: CreateBox('destructible:fragments:glass', { size: 0.16 }, scene),
  };
  for (const [material, mesh] of Object.entries(fragmentMeshes)) {
    const key = material as DestructibleReactionVisual['material'];
    mesh.material = materials[key];
    mesh.isPickable = false;
    mesh.parent = root;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.thinInstanceSetBuffer('matrix', matrixBuffers[key], 16, false);
    mesh.thinInstanceCount = 0;
  }

  const rings: RingRecord[] = [];
  for (let index = 0; index < DESTRUCTIBLE_VISUAL_LIMITS.shockRings; index += 1) {
    const mesh = CreateTorus(
      `destructible:ring:${index}`,
      { diameter: 1, thickness: 0.05, tessellation: 20 },
      scene,
    );
    const material = new StandardMaterial(`destructible:ring-material:${index}`, scene);
    material.emissiveColor = new Color3(1, 0.82, 0.45);
    material.diffuseColor = Color3.Black();
    material.alpha = 0.9;
    material.disableLighting = true;
    mesh.material = material;
    mesh.rotation.x = Math.PI / 2;
    mesh.isPickable = false;
    mesh.parent = root;
    mesh.setEnabled(false);
    rings.push({ mesh, expiryTick: 0, strength: 0 });
  }

  const fragments: FragmentRecord[] = [];
  let peakFragments = 0;
  let spawnedFragments = 0;
  let expiredFragments = 0;
  let droppedFragments = 0;
  let hiddenBroken = 0;
  let lastReactionId: string | null = null;
  let resets = 0;
  let disposed = false;
  let hashSeed = 0x285;
  const matrixCounts: Record<DestructibleReactionVisual['material'], number> = {
    WOOD: 0,
    PLASTIC: 0,
    METAL: 0,
    GLASS: 0,
  };

  const hash = (): number => {
    hashSeed = (Math.imul(hashSeed ^ (hashSeed >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return hashSeed / 0xffffffff;
  };

  const expire = (tick: number): void => {
    for (let index = fragments.length - 1; index >= 0; index -= 1) {
      const fragment = fragments[index]!;
      if (fragment.expiryTick > tick) continue;
      fragments.splice(index, 1);
      expiredFragments += 1;
    }
    for (const ring of rings) {
      if (ring.expiryTick <= tick) ring.mesh.setEnabled(false);
    }
  };

  const spawnFragments = (reaction: DestructibleReactionVisual, tick: number): void => {
    if (reaction.visualAlternative || reaction.variant === 'SHOCK_RING') return;
    const lifetime = DESTRUCTIBLE_VISUAL_LIMITS.fragmentLifetimeTicks;
    for (let index = 0; index < reaction.fragments; index += 1) {
      if (fragments.length >= DESTRUCTIBLE_VISUAL_LIMITS.fragmentPool) {
        // A full cosmetic pool drops new shards; the event and the object state are untouched.
        droppedFragments += 1;
        continue;
      }
      const angle = hash() * Math.PI * 2;
      const speed = 0.8 + hash() * 2.4;
      fragments.push({
        material: reaction.material,
        x: reaction.positionM.x + (hash() - 0.5) * 0.5,
        y: 0.25 + hash() * 0.6,
        z: reaction.positionM.z + (hash() - 0.5) * 0.5,
        vx: Math.cos(angle) * speed,
        vy: 1.4 + hash() * 2.2,
        vz: Math.sin(angle) * speed,
        rx: hash() * Math.PI,
        ry: hash() * Math.PI,
        rz: hash() * Math.PI,
        size: 0.6 + hash() * 0.9 * Math.max(0.4, reaction.intensity.normalized),
        expiryTick: tick + lifetime,
      });
      spawnedFragments += 1;
      if (fragments.length > peakFragments) peakFragments = fragments.length;
    }
  };

  const spawnRing = (reaction: DestructibleReactionVisual, tick: number): void => {
    const ring = rings.find((entry) => entry.expiryTick <= tick || !entry.mesh.isEnabled());
    if (ring === undefined) return;
    ring.expiryTick = tick + DESTRUCTIBLE_VISUAL_LIMITS.shockRingLifetimeTicks;
    (ring as { strength: number }).strength = 0.5 + reaction.intensity.normalized;
    ring.mesh.position.set(reaction.positionM.x, 0.15, reaction.positionM.z);
    ring.mesh.scaling.setAll(0.8 + reaction.intensity.normalized * 1.6);
    ring.mesh.setEnabled(true);
  };

  const advance = (tick: number): void => {
    expire(tick);
    const dt = 1 / 60;
    for (const fragment of fragments) {
      fragment.vy -= 9.81 * dt;
      fragment.x += fragment.vx * dt;
      fragment.y += fragment.vy * dt;
      fragment.z += fragment.vz * dt;
      if (fragment.y < 0.05) {
        fragment.y = 0.05;
        fragment.vy = Math.abs(fragment.vy) * 0.35;
        fragment.vx *= 0.7;
        fragment.vz *= 0.7;
      }
      fragment.rx += dt * 3;
      fragment.ry += dt * 2;
    }
    matrixCounts.WOOD = 0;
    matrixCounts.PLASTIC = 0;
    matrixCounts.METAL = 0;
    matrixCounts.GLASS = 0;
    for (const fragment of fragments) {
      const index = matrixCounts[fragment.material];
      if (index >= DESTRUCTIBLE_VISUAL_LIMITS.fragmentPool) continue;
      const matrix = Matrix.Compose(
        new Vector3(fragment.size, fragment.size, fragment.size),
        Quaternion.RotationYawPitchRoll(fragment.ry, fragment.rx, fragment.rz),
        new Vector3(fragment.x, fragment.y, fragment.z),
      );
      matrix.copyToArray(matrixBuffers[fragment.material], index * 16);
      matrixCounts[fragment.material] = index + 1;
    }
    for (const [material, mesh] of Object.entries(fragmentMeshes)) {
      const key = material as DestructibleReactionVisual['material'];
      const count = matrixCounts[key];
      mesh.thinInstanceCount = count;
      mesh.setEnabled(count > 0);
      if (count > 0) {
        mesh.thinInstanceBufferUpdated('matrix');
        mesh.thinInstanceRefreshBoundingInfo(true);
      }
    }
    for (const ring of rings) {
      if (!ring.mesh.isEnabled()) continue;
      const remaining = ring.expiryTick - tick;
      ring.mesh.scaling.scaleInPlace(1.04);
      const material = ring.mesh.material as StandardMaterial;
      material.alpha =
        Math.max(0, remaining / DESTRUCTIBLE_VISUAL_LIMITS.shockRingLifetimeTicks) * ring.strength;
    }
  };

  const apply = (frame: DestructibleVisualFrame | null): void => {
    if (disposed || frame === null) return;
    if (frame.resets !== resets) {
      resets = frame.resets;
      fragments.length = 0;
      for (const ring of rings) ring.mesh.setEnabled(false);
    }
    advance(frame.tick);
    hiddenBroken = 0;
    for (const object of frame.objects) {
      const record = records.get(object.objectId);
      if (record === undefined) continue;
      const visible = object.state !== 'BROKEN';
      for (const node of record.nodes) {
        node.setEnabled(visible);
        node.position.x = object.positionM.x;
        node.position.z = object.positionM.z;
        node.rotation.y = object.headingRad;
        if (object.state === 'MOVED') node.rotation.z = Math.min(0.35, object.displacementM * 0.08);
        else node.rotation.z = 0;
      }
      if (!visible) hiddenBroken += 1;
      if (record.lastState !== object.state) {
        record.lastState = object.state;
      }
    }
    for (const reaction of frame.reactions) {
      lastReactionId = reaction.eventId;
      spawnFragments(reaction, frame.tick);
      if (reaction.visualAlternative || reaction.variant === 'SHOCK_RING' || !reaction.audioPlayed)
        spawnRing(reaction, frame.tick);
    }
    // The last reaction of a reset generation has no new fragment: the reset already cleared them.
  };

  return Object.freeze({
    version: DESTRUCTIBLE_DECOR_SCENE_VERSION,
    root,
    apply,
    advance,
    stats(): DestructibleDecorSceneStats {
      return Object.freeze({
        version: DESTRUCTIBLE_DECOR_SCENE_VERSION,
        objects: records.size,
        objectMeshes: [...records.values()].reduce(
          (total, record) => total + record.nodes.length,
          0,
        ),
        hiddenBroken,
        fragmentsActive: fragments.length,
        fragmentsPeak: peakFragments,
        fragmentsSpawned: spawnedFragments,
        fragmentsExpired: expiredFragments,
        fragmentsDropped: droppedFragments,
        fragmentPoolCap: DESTRUCTIBLE_VISUAL_LIMITS.fragmentPool,
        shockRingsActive: rings.filter((ring) => ring.mesh.isEnabled()).length,
        meshes: 1 + records.size + 4 + rings.length,
        drawCalls:
          [...records.values()].reduce((total, record) => total + record.nodes.length, 0) + 4,
        lastReactionId,
        resets,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const record of records.values()) for (const node of record.nodes) node.dispose();
      for (const mesh of Object.values(fragmentMeshes)) mesh.dispose();
      for (const ring of rings) {
        ring.mesh.material?.dispose();
        ring.mesh.dispose();
      }
      for (const material of Object.values(materials)) material.dispose();
      root.dispose();
      records.clear();
      fragments.length = 0;
    },
  });
}

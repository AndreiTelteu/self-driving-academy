import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { Scene } from '@babylonjs/core/scene';
import type { LiveHazardObstacleType, LivePedestrianVisualFrame } from '../../app';
import type { PedestrianState } from '../../world';

/**
 * PBI 286 — presentation of the live pedestrian and hazard facts.
 *
 * The scene copies authoritative snapshots only. It never advances a pedestrian, never decides a
 * crossing, never moves a hazard box and never owns a physics body. The pedestrian population is
 * bounded by the 164 capacity and the hazard population by the 165 capacity, so the mesh count is
 * bounded before any frame is drawn.
 */
export const LIVE_PEDESTRIAN_SCENE_VERSION = '286-live-pedestrian-scene-v1' as const;

export const LIVE_PEDESTRIAN_SCENE_LIMITS = Object.freeze({
  pedestrianMeshes: 256,
  hazardMeshes: 96,
});

export interface LivePedestrianSceneStats {
  readonly version: typeof LIVE_PEDESTRIAN_SCENE_VERSION;
  readonly tick: number;
  readonly pedestrianMeshes: number;
  readonly visiblePedestrians: number;
  readonly hazardMeshes: number;
  readonly visibleHazards: number;
  readonly physicalHazards: number;
  readonly drawCalls: number;
}

export interface LivePedestrianScene {
  readonly version: typeof LIVE_PEDESTRIAN_SCENE_VERSION;
  readonly root: TransformNode;
  apply(frame: LivePedestrianVisualFrame | null): void;
  stats(): LivePedestrianSceneStats;
  dispose(): void;
}

const STATE_COLORS: Readonly<Record<PedestrianState, Color3>> = Object.freeze({
  ON_SIDEWALK: new Color3(0.45, 0.55, 0.68),
  WAITING: new Color3(0.95, 0.76, 0.25),
  CROSSING: new Color3(0.96, 0.52, 0.16),
  CROSSED: new Color3(0.3, 0.78, 0.44),
  WITHDRAWN: new Color3(0.2, 0.2, 0.2),
});

const HAZARD_COLORS: Readonly<Record<LiveHazardObstacleType, Color3>> = Object.freeze({
  CONE: new Color3(0.95, 0.48, 0.12),
  BARRIER: new Color3(0.86, 0.18, 0.18),
  DEBRIS: new Color3(0.5, 0.48, 0.42),
  BLOCK: new Color3(0.36, 0.38, 0.42),
});

function materialOf(scene: Scene, name: string, color: Color3): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.specularColor = new Color3(0.08, 0.08, 0.08);
  material.emissiveColor = color.scale(0.12);
  return material;
}

export function createLivePedestrianScene(scene: Scene): LivePedestrianScene {
  const root = new TransformNode('live-pedestrians-root', scene);
  const materials = new Map<string, StandardMaterial>();
  const pedestrianMeshes = new Map<string, Mesh>();
  const hazardMeshes = new Map<string, Mesh>();
  let tick = -1;
  let visiblePedestrians = 0;
  let visibleHazards = 0;
  let physicalHazards = 0;

  const materialFor = (key: string, color: Color3): StandardMaterial => {
    const existing = materials.get(key);
    if (existing !== undefined) return existing;
    const created = materialOf(scene, `live-pedestrian-${key}`, color);
    materials.set(key, created);
    return created;
  };

  const apply = (frame: LivePedestrianVisualFrame | null): void => {
    if (frame === null) return;
    tick = frame.tick;
    const seenPedestrians = new Set<string>();
    visiblePedestrians = 0;
    for (const pedestrian of frame.pedestrians) {
      seenPedestrians.add(pedestrian.pedestrianId);
      let mesh = pedestrianMeshes.get(pedestrian.pedestrianId);
      if (mesh === undefined) {
        if (pedestrianMeshes.size >= LIVE_PEDESTRIAN_SCENE_LIMITS.pedestrianMeshes) continue;
        mesh = CreateBox(`live-pedestrian-${pedestrian.pedestrianId}`, { size: 0.42 }, scene);
        mesh.parent = root;
        mesh.scaling.set(0.75, 4.1, 0.75);
        pedestrianMeshes.set(pedestrian.pedestrianId, mesh);
      }
      mesh.material = materialFor(`state-${pedestrian.state}`, STATE_COLORS[pedestrian.state]);
      mesh.position.set(
        pedestrian.positionM.x,
        pedestrian.positionM.y + 0.86,
        pedestrian.positionM.z,
      );
      mesh.isVisible = pedestrian.state !== 'WITHDRAWN';
      if (mesh.isVisible) visiblePedestrians += 1;
    }
    for (const [id, mesh] of pedestrianMeshes) {
      if (seenPedestrians.has(id)) continue;
      pedestrianMeshes.delete(id);
      mesh.dispose();
    }

    const seenHazards = new Set<string>();
    visibleHazards = 0;
    physicalHazards = 0;
    for (const hazard of frame.hazards) {
      seenHazards.add(hazard.obstacleId);
      let mesh = hazardMeshes.get(hazard.obstacleId);
      if (mesh === undefined) {
        if (hazardMeshes.size >= LIVE_PEDESTRIAN_SCENE_LIMITS.hazardMeshes) continue;
        mesh = CreateBox(`live-hazard-${hazard.obstacleId}`, { size: 1 }, scene);
        mesh.parent = root;
        hazardMeshes.set(hazard.obstacleId, mesh);
      }
      mesh.material = materialFor(`hazard-${hazard.type}`, HAZARD_COLORS[hazard.type]);
      mesh.position.set(hazard.positionM.x, hazard.positionM.y, hazard.positionM.z);
      mesh.scaling.set(hazard.halfSizeM.x * 2, hazard.halfSizeM.y * 2, hazard.halfSizeM.z * 2);
      mesh.isVisible = hazard.active;
      if (mesh.isVisible) visibleHazards += 1;
      if (hazard.physical) physicalHazards += 1;
    }
    for (const [id, mesh] of hazardMeshes) {
      if (seenHazards.has(id)) continue;
      hazardMeshes.delete(id);
      mesh.dispose();
    }
  };

  return Object.freeze({
    version: LIVE_PEDESTRIAN_SCENE_VERSION,
    root,
    apply,
    stats: () =>
      Object.freeze({
        version: LIVE_PEDESTRIAN_SCENE_VERSION,
        tick,
        pedestrianMeshes: pedestrianMeshes.size,
        visiblePedestrians,
        hazardMeshes: hazardMeshes.size,
        visibleHazards,
        physicalHazards,
        drawCalls: visiblePedestrians + visibleHazards,
      }),
    dispose(): void {
      for (const mesh of pedestrianMeshes.values()) mesh.dispose();
      for (const mesh of hazardMeshes.values()) mesh.dispose();
      for (const material of materials.values()) material.dispose();
      pedestrianMeshes.clear();
      hazardMeshes.clear();
      materials.clear();
      root.dispose();
    },
  });
}

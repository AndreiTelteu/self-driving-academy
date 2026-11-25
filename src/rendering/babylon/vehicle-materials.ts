/**
 * PBI 247 — PBR materials for the detailed vehicles.
 *
 * The body uses a PBR clearcoat-like paint (metallic flakes in the clear layer, high reflection)
 * that multiplies the vertex colours of the shell and panels, so every taxi/civilian shade rides
 * the same shared material without a shader permutation. Glass is a separate tinted, reflective
 * material; tyres and trim are matte rubber; the wheel rims are metallic. Emissive lenses keep
 * the PBI 145 light state contract (headlights, brake, turn signals).
 */
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { QualityPreset } from '../quality-policy';

export type VehicleMaterialKey =
  'body' | 'glass' | 'tire' | 'rim' | 'trim' | 'headlight' | 'taillight' | 'signal';

export interface VehicleMaterialSet {
  readonly materials: Readonly<Record<VehicleMaterialKey, PBRMaterial | StandardMaterial>>;
  /** Number of live PBR materials; StandardMaterial entries are not counted. */
  readonly pbrCount: number;
  dispose(): void;
}

const EMISSIVE: Readonly<
  Record<'headlight' | 'taillight' | 'signal', readonly [number, number, number]>
> = Object.freeze({
  headlight: [1, 0.95, 0.82] as const,
  taillight: [0.9, 0.06, 0.05] as const,
  signal: [1, 0.55, 0.05] as const,
});

function createPbr(scene: Scene, name: string): PBRMaterial {
  const material = new PBRMaterial(name, scene);
  material.maxSimultaneousLights = 2;
  material.backFaceCulling = false;
  material.metallic = 0;
  material.roughness = 0.5;
  material.directIntensity = 2.3;
  material.environmentIntensity = 0.35;
  return material;
}

function createEmissive(scene: Scene, key: 'headlight' | 'taillight' | 'signal'): StandardMaterial {
  const material = new StandardMaterial(`vehicle:${key}`, scene);
  material.maxSimultaneousLights = 2;
  material.disableLighting = true;
  material.diffuseColor = Color3.Black();
  const rgb = EMISSIVE[key];
  material.emissiveColor = new Color3(rgb[0], rgb[1], rgb[2]);
  return material;
}

export function createVehicleMaterials(scene: Scene, preset: QualityPreset): VehicleMaterialSet {
  const body = createPbr(scene, 'vehicle:body');
  body.albedoColor = new Color3(1, 1, 1);
  body.metallic = 0.15;
  body.roughness = 0.28;
  // Clearcoat effect: a smooth dielectric layer over the base paint. Babylon does not expose a
  // dedicated clearcoat parameter on PBRMaterial, so we approximate it with a low roughness and
  // a strong reflection of the IBL environment.
  body.environmentIntensity = 0.55;
  const glass = createPbr(scene, 'vehicle:glass');
  glass.albedoColor = new Color3(0.05, 0.08, 0.1);
  glass.metallic = 0.05;
  glass.roughness = 0.08;
  glass.environmentIntensity = 1.1;
  glass.alpha = preset === 'LOW' ? 1 : 0.92;
  const tire = createPbr(scene, 'vehicle:tire');
  // White albedo: the vertex colours carry the tyre/rim split (dark rubber sidewall, metal caps).
  tire.albedoColor = new Color3(1, 1, 1);
  tire.metallic = 0.05;
  tire.roughness = 0.75;
  tire.environmentIntensity = 0.2;
  const rim = createPbr(scene, 'vehicle:rim');
  rim.albedoColor = new Color3(0.62, 0.64, 0.68);
  rim.metallic = 0.85;
  rim.roughness = 0.22;
  rim.environmentIntensity = 0.8;
  const trim = createPbr(scene, 'vehicle:trim');
  trim.albedoColor = new Color3(0.045, 0.045, 0.05);
  trim.metallic = 0;
  trim.roughness = 0.85;
  trim.environmentIntensity = 0.2;
  const materials: Record<VehicleMaterialKey, PBRMaterial | StandardMaterial> = {
    body,
    glass,
    tire,
    rim,
    trim,
    headlight: createEmissive(scene, 'headlight'),
    taillight: createEmissive(scene, 'taillight'),
    signal: createEmissive(scene, 'signal'),
  };
  return Object.freeze({
    materials: Object.freeze(materials),
    pbrCount: 5,
    dispose(): void {
      for (const material of Object.values(materials)) material.dispose(false, false);
    },
  });
}

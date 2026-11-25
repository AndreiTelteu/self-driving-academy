/**
 * PBI 254 — GLB asset definitions for the realistic 3D models.
 *
 * Every model is CC0 (public domain) and shipped inside the repository under `public/assets`.
 * The catalogue is the single place that owns the provenance required by the PBI 150 manifest:
 * the id, the exact byte size on disk, the source page and the licence. Renderers ask for an id
 * and never hard-code a URL.
 *
 * `jordan-animated.glb` is the original Innerscene download reduced with `gltf-transform`
 * (`resize --width 256 --height 256`, `simplify --ratio 0.35`, `prune`) so it fits the registry
 * transfer budget; geometry, the 56-joint skin and all seven clips are preserved.
 */

export type GlbAssetCategory = 'vehicle' | 'character' | 'building' | 'decor';

export interface GlbAssetDefinition {
  readonly id: string;
  readonly version: string;
  readonly url: string;
  readonly bytes: number;
  /** Decoded geometry bytes: mesh attributes, indices and (for the character) animation curves. */
  readonly geometryBytes: number;
  /** Decoded embedded texture bytes. */
  readonly textureBytes: number;
  readonly critical: boolean;
  readonly source: string;
  readonly license: string;
  readonly category: GlbAssetCategory;
  readonly description: string;
  /** Model forward axis in its own space; the renderer rotates it onto the project +Z. */
  readonly forwardAxis: '+X' | '-X' | '+Z' | '-Z';
}

export const GLB_ASSET_LICENSE = 'CC0 1.0 Universal (Public Domain Dedication)' as const;

export const GLB_ASSETS: readonly GlbAssetDefinition[] = Object.freeze([
  Object.freeze({
    id: 'vehicle:taxi',
    version: '1.0.0',
    url: '/assets/models/vehicles/taxi.glb',
    bytes: 48648,
    geometryBytes: 27552,
    textureBytes: 1919,
    critical: true,
    source:
      'Innerscene Low-poly City Taxi — https://www.innerscene.com/tools/library/3d-parts/low-poly-city-taxi-fc99e8ea',
    license: GLB_ASSET_LICENSE,
    category: 'vehicle',
    description: 'Taxi, 4.09 m long on +X, 2.02 m wide, 1.51 m tall; four separate wheels',
    forwardAxis: '-X',
  }),
  Object.freeze({
    id: 'vehicle:sedan',
    version: '1.0.0',
    url: '/assets/models/vehicles/sedan.glb',
    bytes: 46628,
    geometryBytes: 26784,
    textureBytes: 1678,
    critical: true,
    source:
      'Innerscene Low-poly City Car — https://www.innerscene.com/tools/library/3d-parts/low-poly-city-car-6f062e21',
    license: GLB_ASSET_LICENSE,
    category: 'vehicle',
    description: 'Sedan, 4.09 m long on +X, 2.02 m wide; four separate wheels',
    forwardAxis: '-X',
  }),
  Object.freeze({
    id: 'character:jordan',
    version: '1.0.0',
    url: '/assets/models/characters/jordan-animated.glb',
    bytes: 3459804,
    geometryBytes: 2434664,
    textureBytes: 758180,
    critical: true,
    source:
      'Innerscene Locomotion Collection — Jordan — https://www.innerscene.com/tools/library/3d-parts/locomotion-collection-jordan-3d-person-animated-911f1584',
    license: GLB_ASSET_LICENSE,
    category: 'character',
    description:
      'Skinned character, 1.85 m tall, 56 joints, clips Idle_Standing/Walk_Relaxed/Walk_Brisk/Jog/Run/Walk_Carry/Sit_Stand',
    forwardAxis: '+Z',
  }),
  Object.freeze({
    id: 'building:house-medium',
    version: '1.0.0',
    url: '/assets/models/buildings/house-medium.glb',
    bytes: 39816,
    geometryBytes: 19128,
    textureBytes: 1439,
    critical: false,
    source:
      'Innerscene Low-poly City House Building Medium — https://www.innerscene.com/tools/library/3d-parts/low-poly-city-house-building-medium-30234432',
    license: GLB_ASSET_LICENSE,
    category: 'building',
    description: 'Two-storey house, 4.4 x 4.4 m footprint, 7.8 m tall with chimney',
    forwardAxis: '+Z',
  }),
  Object.freeze({
    id: 'decor:tree',
    version: '1.0.0',
    url: '/assets/models/decor/tree.glb',
    bytes: 14120,
    geometryBytes: 8376,
    textureBytes: 960,
    critical: false,
    source:
      'Innerscene Low-poly City Tree — https://www.innerscene.com/tools/library/3d-parts/low-poly-city-tree-80877d8e',
    license: GLB_ASSET_LICENSE,
    category: 'decor',
    description: 'Tree, 3.63 m tall, origin at the trunk base',
    forwardAxis: '+Z',
  }),
  Object.freeze({
    id: 'decor:street-lamp',
    version: '1.0.0',
    url: '/assets/models/decor/street-lamp.glb',
    bytes: 11712,
    geometryBytes: 5688,
    textureBytes: 720,
    critical: false,
    source:
      'Innerscene Low-poly City Street Lamp — https://www.innerscene.com/tools/library/3d-parts/low-poly-city-street-lamp-f1b98623',
    license: GLB_ASSET_LICENSE,
    category: 'decor',
    description: 'Street lamp, 4.34 m tall, arm reaches +X, origin at the base',
    forwardAxis: '+X',
  }),
  Object.freeze({
    id: 'decor:bench',
    version: '1.0.0',
    url: '/assets/models/decor/bench.glb',
    bytes: 20796,
    geometryBytes: 10128,
    textureBytes: 479,
    critical: false,
    source:
      'Innerscene Low-poly City Bench — https://www.innerscene.com/tools/library/3d-parts/low-poly-city-bench-5709bcd8',
    license: GLB_ASSET_LICENSE,
    category: 'decor',
    description: 'Bench, 1.8 m long on X, seat faces +Z, origin at the ground',
    forwardAxis: '+Z',
  }),
]);

const BY_ID = new Map(GLB_ASSETS.map((asset) => [asset.id, asset] as const));

export function getGlbAsset(id: string): GlbAssetDefinition | undefined {
  return BY_ID.get(id);
}

export function getGlbAssetsByCategory(category: GlbAssetCategory): readonly GlbAssetDefinition[] {
  return GLB_ASSETS.filter((asset) => asset.category === category);
}

/** Total bytes of the models a renderer actually admits. */
export function glbAssetBytes(ids: readonly string[]): number {
  let total = 0;
  for (const id of ids) total += BY_ID.get(id)?.bytes ?? 0;
  return total;
}

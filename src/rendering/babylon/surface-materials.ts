/**
 * PBI 245 — materialele PBR ale suprafețelor (asfalt, marcaje, trotuar, bordură, iarbă, teren).
 *
 * Texturile vin din `rendering/surface-textures.ts` (procedurale, deterministe, originale) și se urcă o
 * singură dată pe preset ca `RawTexture` RGBA8 cu lanț de mip-uri și filtrare anizotropă. Mapările sunt
 * în coordonate de lume (geometria 042 nu are UV-uri): `city-scene.ts` și `world-edge-scene.ts` scriu
 * UV = metri / dimensiunea dalei, deci nicio textură nu se întinde pe o suprafață mare.
 *
 * - **Asfalt**: albedo + normal + ORM la 2,5 m, plus harta de detaliu macro (24 m) a materialului PBR
 *   (petice, crăpături, pete de ulei): perioada vizibilă combinată este mult peste 50 m.
 * - **Imagine**: `PBRMaterial` citește `scene.imageProcessingConfiguration` (241): cu pipeline (MEDIUM/HIGH)
 *   tone mappingul îl aplică post-procesarea, pe LOW materialul, exact ca la `StandardMaterial`.
 * - **Ambient**: lumina hemisferică de rezervă (243) nu trebuie să lumineze și materialele PBR (ar dubla
 *   IBL-ul); meshurile PBR se exclud din ea (`daylight.excludeFromLegacyAmbient`), iar materialele
 *   rămân înghețate (`freeze()`) după ce excluderea s-a făcut.
 */
import { Constants } from '@babylonjs/core/Engines/constants.js';
import '@babylonjs/core/Engines/Extensions/engine.rawTexture.js';
import '@babylonjs/core/Engines/WebGPU/Extensions/engine.rawTexture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { SURFACE_PRESETS, type QualityPreset, type SurfaceTier } from '../quality-policy';
import {
  SURFACE_TEXTURE_IDS,
  SURFACE_TEXTURE_SPECS,
  generateSurfaceTexture,
  surfaceTextureBytes,
  type SurfaceTextureId,
} from '../surface-textures';

export type SurfaceMaterialKey =
  'asphalt' | 'intersection' | 'marking' | 'sidewalk' | 'curb' | 'ground' | 'wear';

/** PBI 246 — materialele PBR ale fațadelor (zid + sticlă + tâmplărie), separate de lotul suprafețelor. */
export type BuildingMaterialKey =
  'buildingBrick' | 'buildingPlaster' | 'buildingConcrete' | 'buildingGlass' | 'buildingTrim';

/** Dimensiunea dalei (m) pe care o folosește geometria pentru UV-uri: o sursă unică de adevăr. */
export const SURFACE_TILE_M = Object.freeze({
  asphalt: SURFACE_TEXTURE_SPECS.asphalt.tileM.u,
  marking: SURFACE_TEXTURE_SPECS.marking.tileM.u,
  sidewalk: SURFACE_TEXTURE_SPECS.sidewalk.tileM.u,
  curbAlong: SURFACE_TEXTURE_SPECS.curb.tileM.v,
  ground: SURFACE_TEXTURE_SPECS.grass.tileM.u,
  wearAlong: SURFACE_TEXTURE_SPECS.wear.tileM.v,
  terrain: SURFACE_TEXTURE_SPECS.terrainDetail.tileM.u,
  facadeWall: SURFACE_TEXTURE_SPECS.facadeBrick.tileM.u,
});

export interface SurfaceMaterialStats {
  readonly version: string;
  readonly preset: QualityPreset;
  readonly baseSize: number;
  readonly anisotropy: number;
  readonly textures: number;
  /** Octeți GPU (RGBA8 + lanț complet de mip-uri) ai texturilor curente. */
  readonly gpuBytes: number;
  /** Cât au durat generarea pe CPU și încărcarea ultimului set, în ms. */
  readonly lastBuildMs: number;
  readonly builds: number;
  readonly materials: number;
}

export interface SurfaceMaterials {
  readonly materials: Readonly<Record<SurfaceMaterialKey, PBRMaterial>>;
  /** PBI 246: materialele fațadelor (zid cărămidă/tencuială/beton, sticlă IBL, tâmplărie). */
  readonly buildingMaterials: Readonly<Record<BuildingMaterialKey, PBRMaterial>>;
  /** Modulare de luminanță pentru terenul `StandardMaterial` de la orizont (UV în metri / `SURFACE_TILE_M.terrain`). */
  readonly terrainTexture: RawTexture;
  /** Materialele ca map parțial pentru `createCityScene({ materials })`. */
  cityMaterials(): Readonly<
    Partial<
      Record<
        | 'asphalt'
        | 'intersection'
        | 'marking'
        | 'sidewalk'
        | 'curb'
        | 'ground'
        | 'buildingWallBrick'
        | 'buildingWallPlaster'
        | 'buildingWallConcrete'
        | 'buildingGlass'
        | 'buildingTrim',
        Material
      >
    >
  >;
  /** Înghețe materialele (după ce meshurile lor au fost excluse din lumina de rezervă). */
  freeze(): void;
  /** Schimbă presetul: anizotropia și specular AA imediat, texturile numai dacă dimensiunea diferă. */
  setPreset(preset: QualityPreset): void;
  getStats(): SurfaceMaterialStats;
  dispose(): void;
}

interface TextureSet {
  readonly albedo: RawTexture;
  readonly normal: RawTexture | null;
  readonly orm: RawTexture | null;
}

/**
 * Calibrare față de `StandardMaterial` (soare 1,04 + hemisferic 0,50): IBL-ul (cerul albastru) domina
 * soarele și dădea suprafețelor o tentă de cer; direct ↑ și mediu ↓ readuc contrastul soare/umbră.
 */
const LIGHTING = Object.freeze({ direct: 2.3, environment: 0.35 });

const SURFACE_MATERIAL_KEYS: readonly SurfaceMaterialKey[] = [
  'asphalt',
  'intersection',
  'marking',
  'sidewalk',
  'curb',
  'ground',
  'wear',
];

export function createSurfaceMaterials(
  scene: Scene,
  initialPreset: QualityPreset,
): SurfaceMaterials {
  if (!scene || scene.isDisposed) throw new Error('Materialele de suprafață cer o scenă vie.');
  let preset = initialPreset;
  let tier: SurfaceTier = SURFACE_PRESETS[preset];
  let disposed = false;
  let builds = 0;
  let lastBuildMs = 0;
  let sets = new Map<SurfaceTextureId, TextureSet>();
  let currentBaseSize = 0;

  const raw = (data: Uint8Array, width: number, height: number): RawTexture => {
    const texture = new RawTexture(
      data,
      width,
      height,
      Constants.TEXTUREFORMAT_RGBA,
      scene,
      true,
      false,
      Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
    );
    texture.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
    texture.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
    texture.anisotropicFilteringLevel = tier.anisotropy;
    return texture;
  };

  const buildTextures = (): Map<SurfaceTextureId, TextureSet> => {
    const start = performance.now();
    const next = new Map<SurfaceTextureId, TextureSet>();
    for (const id of SURFACE_TEXTURE_IDS) {
      if (id === 'terrainDetail') continue; // fix, creată o dată (vezi `terrainTexture`)
      const image = generateSurfaceTexture(id, tier.baseSize);
      next.set(id, {
        albedo: raw(image.albedo, image.width, image.height),
        normal: image.normal ? raw(image.normal, image.width, image.height) : null,
        orm: image.orm ? raw(image.orm, image.width, image.height) : null,
      });
    }
    builds += 1;
    lastBuildMs = performance.now() - start;
    currentBaseSize = tier.baseSize;
    return next;
  };

  const disposeSets = (target: Map<SurfaceTextureId, TextureSet>): void => {
    for (const set of target.values()) {
      set.albedo.dispose();
      set.normal?.dispose();
      set.orm?.dispose();
    }
    target.clear();
  };

  const make = (
    key: SurfaceMaterialKey,
    options: {
      readonly albedoScale?: readonly [number, number, number];
      readonly blend?: boolean;
      readonly bias?: Readonly<{ factor: number; units: number }>;
      readonly flatRoughness?: number;
    },
  ): PBRMaterial => {
    const material = new PBRMaterial(`surface:${key}`, scene);
    material.backFaceCulling = false;
    material.maxSimultaneousLights = 2;
    material.environmentIntensity = LIGHTING.environment;
    material.directIntensity = LIGHTING.direct;
    material.metallic = 0;
    if (options.flatRoughness !== undefined) material.roughness = options.flatRoughness;
    const scale = options.albedoScale ?? [1, 1, 1];
    material.albedoColor = new Color3(scale[0], scale[1], scale[2]);
    if (options.bias) {
      material.zOffset = options.bias.factor;
      material.zOffsetUnits = options.bias.units;
    }
    if (options.blend) {
      material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
      material.useAlphaFromAlbedoTexture = true;
      material.needDepthPrePass = false;
      material.disableDepthWrite = true;
    }
    return material;
  };

  const materials: Record<SurfaceMaterialKey, PBRMaterial> = {
    // Asfaltul intersecției este un strat de uzură ceva mai deschis decât al benzilor.
    asphalt: make('asphalt', {}),
    intersection: make('intersection', { albedoScale: [1.12, 1.12, 1.12] }),
    marking: make('marking', {
      bias: { factor: -2, units: -2 },
    }),
    sidewalk: make('sidewalk', { albedoScale: [1.25, 1.25, 1.25] }),
    curb: make('curb', {}),
    // Terenul orașului: depth bias +1 (sub trotuar și clădiri), ca în 242.
    ground: make('ground', { albedoScale: [1.4, 1.4, 1.4], bias: { factor: 1, units: 1 } }),
    wear: make('wear', {
      blend: true,
      flatRoughness: 0.92,
      bias: { factor: -1, units: -1 },
    }),
  };

  /**
   * PBI 246 — materialele fațadelor. Zidurile primesc culoarea clădirii pe vârf (albedoColor alb)
   * ca 8 stiluri × palete să împartă aceleași trei texturi; Babylon activează VERTEXCOLOR singur
   * (`mesh.useVertexColors` + buffer `color`, nu există o proprietate pe material). Sticla este
   * dielectrică netedă și reflectă IBL-ul (interioarele false sunt panouri calde aprinse, nu cubemap).
   */
  const makeBuilding = (
    key: BuildingMaterialKey,
    options: {
      readonly albedoScale?: readonly [number, number, number];
      readonly flatRoughness?: number;
      readonly metallic?: number;
    },
  ): PBRMaterial => {
    const material = new PBRMaterial(`surface:${key}`, scene);
    material.backFaceCulling = false;
    material.maxSimultaneousLights = 2;
    material.environmentIntensity = LIGHTING.environment;
    material.directIntensity = LIGHTING.direct;
    material.metallic = options.metallic ?? 0;
    if (options.flatRoughness !== undefined) material.roughness = options.flatRoughness;
    const scale = options.albedoScale ?? [1, 1, 1];
    material.albedoColor = new Color3(scale[0], scale[1], scale[2]);
    return material;
  };
  const building: Record<BuildingMaterialKey, PBRMaterial> = {
    // Albedo neutru-alb pe ziduri: culoarea reală a fiecărei clădiri vine din vertex colors.
    buildingBrick: makeBuilding('buildingBrick', {}),
    buildingPlaster: makeBuilding('buildingPlaster', {}),
    buildingConcrete: makeBuilding('buildingConcrete', {}),
    buildingGlass: makeBuilding('buildingGlass', { flatRoughness: 0.06 }),
    buildingTrim: makeBuilding('buildingTrim', { flatRoughness: 0.55 }),
  };
  // Sticla: reflexie IBL mai puternică decât zidurile (F0 dielectric, dar netedă).
  building.buildingGlass.environmentIntensity = LIGHTING.environment * 2.2;
  const BUILDING_MATERIAL_KEYS: readonly BuildingMaterialKey[] = [
    'buildingBrick',
    'buildingPlaster',
    'buildingConcrete',
    'buildingGlass',
    'buildingTrim',
  ];

  const bindTextures = (): void => {
    const macro = sets.get('asphaltMacro')!;
    const bind = (key: SurfaceMaterialKey, id: SurfaceTextureId): void => {
      const material = materials[key];
      const set = sets.get(id)!;
      material.albedoTexture = set.albedo;
      if (set.normal) {
        material.bumpTexture = set.normal;
        material.bumpTexture.level = 1;
      }
      if (set.orm) {
        material.metallicTexture = set.orm;
        material.useRoughnessFromMetallicTextureGreen = true;
        material.useMetallnessFromMetallicTextureBlue = true;
        material.useRoughnessFromMetallicTextureAlpha = false;
        material.useAmbientOcclusionFromMetallicTextureRed = true;
        // `metallic`/`roughness` scalare înmulțesc textura: null = textura decide singură.
        material.metallic = null;
        material.roughness = null;
      }
    };
    bind('asphalt', 'asphalt');
    bind('intersection', 'asphalt');
    bind('marking', 'marking');
    bind('sidewalk', 'sidewalk');
    bind('curb', 'curb');
    bind('ground', 'grass');
    // 246: pereții clădirilor (albedo neutru în textură, culoarea clădirii pe vârf).
    const bindWall = (key: BuildingMaterialKey, id: SurfaceTextureId): void => {
      const material = building[key];
      const set = sets.get(id)!;
      material.albedoTexture = set.albedo;
      if (set.normal) material.bumpTexture = set.normal;
      if (set.orm) {
        material.metallicTexture = set.orm;
        material.useRoughnessFromMetallicTextureGreen = true;
        material.useAmbientOcclusionFromMetallicTextureRed = true;
        material.metallic = null;
        material.roughness = null;
      }
    };
    bindWall('buildingBrick', 'facadeBrick');
    bindWall('buildingPlaster', 'facadePlaster');
    bindWall('buildingConcrete', 'facadeConcrete');
    materials.wear.albedoTexture = sets.get('wear')!.albedo;
    // RGBA8 brut nu declară alpha: fără asta fâșia ar fi opacă.
    sets.get('wear')!.albedo.hasAlpha = true;
    // Harta de detaliu macro a asfaltului: aceeași textură pe ambele materiale de carosabil.
    for (const key of ['asphalt', 'intersection'] as const) {
      const detail = materials[key].detailMap;
      detail.texture = macro.albedo;
      macro.albedo.uScale = SURFACE_TILE_M.asphalt / SURFACE_TEXTURE_SPECS.asphaltMacro.tileM.u;
      macro.albedo.vScale = macro.albedo.uScale;
      detail.isEnabled = true;
      detail.diffuseBlendLevel = 1;
      detail.bumpLevel = 1;
      detail.roughnessBlendLevel = 1;
    }
  };

  const applyTier = (): void => {
    for (const set of sets.values())
      for (const texture of [set.albedo, set.normal, set.orm])
        if (texture) texture.anisotropicFilteringLevel = tier.anisotropy;
    for (const key of SURFACE_MATERIAL_KEYS) {
      materials[key].enableSpecularAntiAliasing = tier.specularAA;
    }
    for (const key of BUILDING_MATERIAL_KEYS) {
      building[key].enableSpecularAntiAliasing = tier.specularAA;
    }
  };

  // Terenul de la orizont rămâne `StandardMaterial` (PBR pe tot ecranul costa ~+3 ms pe LOW): textura lui
  // de detaliu are rezoluție fixă (independentă de preset), deci nu se regenerează la schimbarea presetului.
  const terrainImage = generateSurfaceTexture('terrainDetail', 512);
  const terrainTexture = raw(terrainImage.albedo, terrainImage.width, terrainImage.height);
  sets = buildTextures();
  bindTextures();
  applyTier();

  const unfreezeAll = (): boolean => {
    let any = false;
    for (const key of SURFACE_MATERIAL_KEYS)
      if (materials[key].isFrozen) {
        materials[key].unfreeze();
        any = true;
      }
    for (const key of BUILDING_MATERIAL_KEYS)
      if (building[key].isFrozen) {
        building[key].unfreeze();
        any = true;
      }
    return any;
  };

  return {
    materials,
    buildingMaterials: building,
    terrainTexture,
    cityMaterials: () =>
      Object.freeze({
        asphalt: materials.asphalt,
        intersection: materials.intersection,
        marking: materials.marking,
        sidewalk: materials.sidewalk,
        curb: materials.curb,
        ground: materials.ground,
        buildingWallBrick: building.buildingBrick,
        buildingWallPlaster: building.buildingPlaster,
        buildingWallConcrete: building.buildingConcrete,
        buildingGlass: building.buildingGlass,
        buildingTrim: building.buildingTrim,
      }),
    freeze(): void {
      if (disposed) return;
      for (const key of SURFACE_MATERIAL_KEYS) materials[key].freeze();
      for (const key of BUILDING_MATERIAL_KEYS) building[key].freeze();
    },
    setPreset(next: QualityPreset): void {
      if (disposed || next === preset) return;
      preset = next;
      tier = SURFACE_PRESETS[next];
      const wasFrozen = unfreezeAll();
      if (tier.baseSize !== currentBaseSize) {
        const old = sets;
        sets = buildTextures();
        bindTextures();
        // Texturile vechi se eliberează după ce materialele au primit noile texturi.
        disposeSets(old);
      }
      applyTier();
      for (const key of SURFACE_MATERIAL_KEYS)
        materials[key].markAsDirty(Constants.MATERIAL_AllDirtyFlag);
      for (const key of BUILDING_MATERIAL_KEYS)
        building[key].markAsDirty(Constants.MATERIAL_AllDirtyFlag);
      // Reînghețarea după recompilare se face de `refreshFrozenMaterials` (material-refresh.ts).
      if (wasFrozen) {
        let frames = 0;
        const observer = scene.onAfterRenderObservable.add(() => {
          if (++frames < 3) return;
          scene.onAfterRenderObservable.remove(observer);
          if (!disposed) {
            for (const key of SURFACE_MATERIAL_KEYS) materials[key].freeze();
            for (const key of BUILDING_MATERIAL_KEYS) building[key].freeze();
          }
        });
      }
    },
    getStats(): SurfaceMaterialStats {
      return Object.freeze({
        version: '246-building-facades-1',
        preset,
        baseSize: currentBaseSize,
        anisotropy: tier.anisotropy,
        textures: [...sets.values()].reduce(
          (sum, set) => sum + 1 + (set.normal ? 1 : 0) + (set.orm ? 1 : 0),
          0,
        ),
        gpuBytes: surfaceTextureBytes(currentBaseSize),
        lastBuildMs,
        builds,
        materials: SURFACE_MATERIAL_KEYS.length + BUILDING_MATERIAL_KEYS.length,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const key of SURFACE_MATERIAL_KEYS) materials[key].dispose(false, false);
      for (const key of BUILDING_MATERIAL_KEYS) building[key].dispose(false, false);
      disposeSets(sets);
      terrainTexture.dispose();
    },
  };
}

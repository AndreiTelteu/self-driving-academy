/**
 * PBI 243 — scena Babylon a atmosferei: domul cerului (shader procedural), ceața și textura de mediu.
 *
 * Totul citește o singură `AtmosphereState` (`rendering/atmosphere.ts`):
 *
 * - **Cer.** Un dom (sferă) care urmărește camera (`infiniteDistance`) cu un `ShaderMaterial` GLSL
 *   (același cod pe WebGL2 și, prin glslang/twgsl, pe WebGPU). Vârfurile sunt împinse pe planul
 *   îndepărtat (`z = w`), deci domul nu depinde de `camera.maxZ`, nu scrie adâncime și apare doar
 *   unde nimic altceva n-a desenat. O singură desenare pe orice preset; norii (HIGH) sunt tot în
 *   acest shader.
 * - **Ceață.** `scene.fogMode = EXP2` cu culoarea orizontului. Obiectele de la distanță se topesc în
 *   exact culoarea pe care cerul o are la orizont, deci nu rămâne nicio margine dură. La 80 m
 *   vizibilitatea este 99,6%.
 * - **IBL.** Cubul de mediu se generează pe CPU din aceeași funcție `skyRadiance` (fără disc și nori),
 *   se urcă half-float cu lanț de mip-uri (rezoluția pe preset, `ATMOSPHERE_PRESETS`) și i se atașează
 *   polinomul sferic de iradianță calculat din aceleași date (fără readback GPU). Se regenerează doar
 *   la `apply(state)`/schimbare de preset, niciodată pe cadru. `StandardMaterial` îl ignoră; îl folosesc
 *   materialele PBR din 245–249.
 *
 * Materialele orașului sunt înghețate: ceața și `environmentTexture` schimbă defines-urile shaderului,
 * deci la fiecare schimbare de defines se dezgheață, se recompilează și se îngheață din nou
 * (`refreshFrozenMaterials`).
 */
import { Constants } from '@babylonjs/core/Engines/constants.js';
import '@babylonjs/core/Engines/Extensions/engine.rawTexture.js';
import '@babylonjs/core/Engines/WebGPU/Extensions/engine.rawTexture.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { RawCubeTexture } from '@babylonjs/core/Materials/Textures/rawCubeTexture.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { CubeMapToSphericalPolynomialTools } from '@babylonjs/core/Misc/HighDynamicRange/cubemapToSphericalPolynomial.js';
import { RenderingGroup } from '@babylonjs/core/Rendering/renderingGroup.js';
import type { Scene } from '@babylonjs/core/scene.js';
import {
  DAYLIGHT_INPUT,
  backdropColor,
  buildEnvironmentFaces,
  createAtmosphereState,
  environmentTextureBytes,
  facesToBytes,
  facesToHalf,
  type AtmosphereState,
} from '../atmosphere';
import { ATMOSPHERE_PRESETS, type QualityPreset } from '../quality-policy';
import { SKY_FRAGMENT_SHADER, SKY_VERTEX_SHADER } from './atmosphere-sky-shader';
import { refreshFrozenMaterials } from './material-refresh';

/** Raza domului: oricare, deoarece vârfurile sunt împinse pe planul îndepărtat; departe de plan-near. */
const DOME_RADIUS = 1000;
/** Rezoluția din care se calculează polinomul sferic (iradianța este foarte netedă). */
const IRRADIANCE_SIZE = 32;

export interface AtmosphereSceneStats {
  readonly version: string;
  readonly preset: QualityPreset;
  readonly environmentSize: number;
  readonly environmentFormat: 'HALF_FLOAT' | 'RGBA8';
  /** Octeții GPU ai cubului de mediu (cu toate mip-urile): contează la bugetul de texturi 223. */
  readonly environmentGpuBytes: number;
  readonly environmentGenerations: number;
  /** Motivul pentru care cubul nu a putut fi creat (null când există). */
  readonly environmentError: string | null;
  /** Cât a durat ultima generare a cubului (CPU + încărcare), în ms. */
  readonly lastEnvironmentMs: number;
  readonly clouds: boolean;
  readonly drawCalls: 1;
  readonly fogMode: 'EXP2';
  readonly fogDensity: number;
  readonly imageByMaterials: boolean;
}

export interface AtmosphereScene {
  readonly dome: Mesh;
  getState(): AtmosphereState;
  /** Aplică o stare nouă (ex. alt moment al zilei): cer, ceață și cub de mediu din aceleași date. */
  apply(state: AtmosphereState): void;
  setPreset(preset: QualityPreset): void;
  /**
   * `true` când imaginea (expunere, tone mapping) o aplică materialele (LOW, fără pipeline): cerul și
   * culoarea de ștergere sunt atunci scrise deja în spațiul de afișare, ca să arate la fel.
   */
  setImageByMaterials(byMaterials: boolean): void;
  getStats(): AtmosphereSceneStats;
  dispose(): void;
}

export function createAtmosphereScene(
  scene: Scene,
  initialPreset: QualityPreset,
  initialState: AtmosphereState = createAtmosphereState(DAYLIGHT_INPUT),
): AtmosphereScene {
  if (!scene || scene.isDisposed) throw new Error('Atmosfera cere o scenă vie.');
  const engine = scene.getEngine();
  let state = initialState;
  let preset = initialPreset;
  let imageByMaterials = false;
  let disposed = false;
  let dome: Mesh | null = null;
  let material: ShaderMaterial | null = null;
  let environment: RawCubeTexture | null = null;
  let environmentSize = 0;
  let environmentFormat: 'HALF_FLOAT' | 'RGBA8' = 'HALF_FLOAT';
  let environmentGenerations = 0;
  let lastEnvironmentMs = 0;
  let fogConfigured = false;
  let environmentError: string | null = null;

  const tier = () => ATMOSPHERE_PRESETS[preset];

  const bindUniforms = (): void => {
    if (!material) return;
    const s = state;
    material.setVector3('uZenith', new Vector3(...s.zenith));
    material.setVector3('uHorizon', new Vector3(...s.horizon));
    material.setVector3('uSunToward', new Vector3(...s.sunToward));
    material.setVector3('uGlowColor', new Vector3(...s.sun.glowColor));
    const radius = s.sun.discAngularRadiusRad;
    material.setVector4(
      'uSunParams',
      new Vector4(s.sun.discRadiance, Math.cos(radius), Math.cos(radius * 0.82), s.sun.mieStrength),
    );
    material.setVector4(
      'uSkyParams',
      new Vector4(s.gradientRate, s.sun.mieG, imageByMaterials ? 1 : 0, s.exposure),
    );
    material.setVector4(
      'uCloudParams',
      new Vector4(s.clouds.coverage, s.clouds.softness, s.clouds.scale, s.night),
    );
  };

  const buildDome = (): void => {
    dome?.dispose(false, false);
    material?.dispose(false, false);
    const clouds = tier().clouds;
    material = new ShaderMaterial(
      'atmosphere:sky',
      scene,
      { vertexSource: SKY_VERTEX_SHADER, fragmentSource: SKY_FRAGMENT_SHADER },
      {
        attributes: ['position'],
        uniforms: [
          'worldViewProjection',
          'uZenith',
          'uHorizon',
          'uSunToward',
          'uGlowColor',
          'uSunParams',
          'uSkyParams',
          'uCloudParams',
        ],
        defines: clouds ? ['#define CLOUDS'] : [],
      },
    );
    material.backFaceCulling = false;
    material.disableDepthWrite = true;
    material.fogEnabled = false;
    material.depthFunction = Constants.LEQUAL;
    bindUniforms();
    dome = CreateSphere(
      'atmosphere:dome',
      { diameter: DOME_RADIUS * 2, segments: tier().domeSegments },
      scene,
    );
    dome.material = material;
    dome.infiniteDistance = true;
    dome.alwaysSelectAsActiveMesh = true;
    dome.isPickable = false;
    dome.receiveShadows = false;
    dome.applyFog = false;
    dome.doNotSyncBoundingInfo = true;
  };

  const releaseEnvironment = (): void => {
    if (scene.environmentTexture === environment) scene.environmentTexture = null;
    environment?.dispose();
    environment = null;
  };

  /** Generare unică: la încărcare, la schimbare de preset sau de stare (niciodată pe cadru). */
  const buildEnvironment = (): void => {
    const started = performance.now();
    const size = tier().environmentSize;
    const caps = engine.getCaps();
    const halfFloat =
      caps.textureHalfFloatLinearFiltering === true && caps.colorBufferHalfFloat !== false;
    const faces = buildEnvironmentFaces(state, size);
    const previous = environment;
    const data = halfFloat ? facesToHalf(faces) : facesToBytes(faces);
    let texture: RawCubeTexture;
    const texturesBefore = scene.textures.length;
    try {
      texture = new RawCubeTexture(
        scene,
        data,
        size,
        Constants.TEXTUREFORMAT_RGBA,
        halfFloat ? Constants.TEXTURETYPE_HALF_FLOAT : Constants.TEXTURETYPE_UNSIGNED_BYTE,
        true,
        false,
        Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
      );
    } catch (error) {
      // Motor fără context GL (NullEngine în teste): scena rămâne fără IBL, nu se oprește.
      environmentError = error instanceof Error ? error.message : String(error);
      // Constructorul s-a înregistrat în scenă înainte să eșueze încărcarea: nu lăsăm o textură orfană.
      for (const orphan of scene.textures.slice(texturesBefore)) orphan.dispose();
      return;
    }
    environmentError = null;
    texture.name = 'atmosphere:environment';
    texture.gammaSpace = false;
    texture.coordinatesMode = Constants.TEXTURE_CUBIC_MODE;
    texture.sphericalPolynomial =
      CubeMapToSphericalPolynomialTools.ConvertCubeMapToSphericalPolynomial(
        {
          right: faces[0]!,
          left: faces[1]!,
          up: faces[2]!,
          down: faces[3]!,
          front: faces[4]!,
          back: faces[5]!,
          size,
          format: Constants.TEXTUREFORMAT_RGBA,
          type: Constants.TEXTURETYPE_FLOAT,
          gammaSpace: false,
        },
        IRRADIANCE_SIZE,
      );
    environment = texture;
    scene.environmentTexture = texture;
    scene.environmentIntensity = state.environment.intensity;
    if (previous) previous.dispose();
    environmentSize = size;
    environmentFormat = halfFloat ? 'HALF_FLOAT' : 'RGBA8';
    environmentGenerations += 1;
    lastEnvironmentMs = performance.now() - started;
    // Prima textură de mediu schimbă defines-urile (REFLECTION, SPHERICAL harmonics) ale materialelor.
    if (!previous) refreshFrozenMaterials(scene);
  };

  const applyFogAndBackdrop = (): void => {
    const fog = state.fog;
    scene.fogEnabled = true;
    scene.fogMode = Constants.FOGMODE_EXP2;
    scene.fogDensity = fog.density;
    scene.fogColor = new Color3(...fog.colorGamma);
    const clear = backdropColor(state, !imageByMaterials);
    scene.clearColor = new Color4(clear[0], clear[1], clear[2], 1);
    if (!fogConfigured) {
      fogConfigured = true;
      // Ceața schimbă defines-urile (FOG) ale materialelor înghețate.
      refreshFrozenMaterials(scene, Constants.MATERIAL_MiscDirtyFlag);
    }
  };

  const assertActive = (): void => {
    if (disposed || scene.isDisposed) throw new Error('Atmosphere disposed');
  };

  // Cerul se desenează ULTIMUL dintre opace: pixelii acoperiți de oraș și de teren sunt respinși de
  // testul de adâncime (cerul este la 1,0), deci shaderul rulează doar pe pixelii de cer. Fără asta
  // domul (la distanța 0 de cameră) ar fi primul în ordinea față-spate și ar umple tot ecranul.
  scene.setRenderingOrder(0, (a, b) => {
    const aSky = a.getMesh() === dome;
    const bSky = b.getMesh() === dome;
    if (aSky !== bSky) return aSky ? 1 : -1;
    return RenderingGroup.PainterSortCompare(a, b);
  });

  const full = (): void => {
    applyFogAndBackdrop();
    buildDome();
    buildEnvironment();
  };
  full();

  return {
    get dome() {
      return dome!;
    },
    getState: () => state,
    apply(next) {
      assertActive();
      state = next;
      applyFogAndBackdrop();
      bindUniforms();
      buildEnvironment();
    },
    setPreset(next) {
      assertActive();
      if (next === preset && dome) return;
      preset = next;
      buildDome();
      buildEnvironment();
    },
    setImageByMaterials(byMaterials) {
      assertActive();
      if (byMaterials === imageByMaterials) return;
      imageByMaterials = byMaterials;
      applyFogAndBackdrop();
      bindUniforms();
    },
    getStats: () =>
      Object.freeze({
        version: state.version,
        preset,
        environmentSize,
        environmentFormat,
        environmentGpuBytes: environmentTextureBytes(
          environmentSize,
          environmentFormat === 'HALF_FLOAT',
        ),
        environmentGenerations,
        environmentError,
        lastEnvironmentMs,
        clouds: tier().clouds,
        drawCalls: 1 as const,
        fogMode: state.fog.mode,
        fogDensity: state.fog.density,
        imageByMaterials,
      }),
    dispose() {
      if (disposed) return;
      disposed = true;
      dome?.dispose(false, false);
      material?.dispose(false, false);
      dome = null;
      material = null;
      scene.setRenderingOrder(0, null);
      releaseEnvironment();
      scene.fogMode = Constants.FOGMODE_NONE;
    },
  };
}

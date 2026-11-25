/**
 * PBI 243 — „starea de atmosferă”: singura sursă pentru cer, ceață, iluminarea din mediu (IBL),
 * lumina soarelui și ambientul de rezervă al materialelor vechi.
 *
 * Modulul este pur (fără Babylon, DOM sau ceas). Cerul din shader (`babylon/atmosphere-scene.ts`),
 * ceața scenei, culoarea de ștergere și cubul de mediu citesc TOATE aceleași câmpuri, deci nu pot
 * diverge: dacă `zenith`, `horizon` sau direcția soarelui se schimbă, se schimbă simultan cerul,
 * ceața și reflexiile. PBI 252 (ora din zi) va produce alte stări cu `createAtmosphereState` și le va
 * aplica prin `AtmosphereScene.apply(state)`; nimic altceva nu trebuie atins.
 *
 * Unități. Culorile `Rgb` sunt radianță liniară de scenă, înainte de expunere și tone mapping (cele
 * pe care le scrie și un material PBR în ținta HDR). Intrările de proiectare sunt date în spațiu de
 * afișare (cum arată pe ecran) și se convertesc prin `displayToRadiance`, ca să poată fi reglate pe
 * capturi. Modelul cerului (`skyRadiance`) are o oglindă în shaderul GLSL; modificarea uneia cere
 * modificarea celeilalte (testul `atmosphere.test.ts` păstrează constantele sincronizate).
 */

export const ATMOSPHERE_VERSION = '243-atmosphere-v1' as const;

export type Rgb = readonly [number, number, number];
export type Vec3 = readonly [number, number, number];

/** Aceeași putere ca `ToLinearSpace`/`ToGammaSpace` din Babylon (2,2). */
const GAMMA = 2.2;
export const toLinear = (value: number): number => Math.pow(Math.max(0, value), GAMMA);
export const toGamma = (value: number): number => Math.pow(Math.max(0, value), 1 / GAMMA);

const mixNumber = (a: number, b: number, t: number): number => a + (b - a) * t;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  mixNumber(a[0], b[0], t),
  mixNumber(a[1], b[1], t),
  mixNumber(a[2], b[2], t),
];
function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
function normalize(vector: Vec3): Vec3 {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (!(length > 0)) throw new Error('Direcție nulă');
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

/** Culoare de afișare (sRGB, 0..1) → radianță liniară de scenă, anulând expunerea imaginii. */
export function displayToRadiance(display: Rgb, exposure: number): Rgb {
  if (!(exposure > 0)) throw new Error('Expunere invalidă');
  return [
    toLinear(display[0]) / exposure,
    toLinear(display[1]) / exposure,
    toLinear(display[2]) / exposure,
  ];
}

/**
 * Tone mapping Khronos PBR Neutral (identic cu cel din Babylon și din shaderul cerului): folosit
 * pentru culoarea de ștergere pe LOW, unde nu există pipeline care să o convertească.
 */
export function toneMapNeutral(color: Rgb): Rgb {
  const startCompression = 0.8 - 0.04;
  const desaturation = 0.15;
  const x = Math.min(color[0], color[1], color[2]);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  const shifted: [number, number, number] = [
    color[0] - offset,
    color[1] - offset,
    color[2] - offset,
  ];
  const peak = Math.max(shifted[0], shifted[1], shifted[2]);
  if (peak < startCompression) return shifted;
  const d = 1 - startCompression;
  const newPeak = 1 - (d * d) / (peak + d - startCompression);
  const scale = newPeak / peak;
  const g = 1 - 1 / (desaturation * (peak - newPeak) + 1);
  return [
    mixNumber(shifted[0] * scale, newPeak, g),
    mixNumber(shifted[1] * scale, newPeak, g),
    mixNumber(shifted[2] * scale, newPeak, g),
  ];
}

/** Ce se vede pe ecran pentru o radianță liniară: expunere, tone mapping, gamma (fără grading). */
export function radianceToDisplay(radiance: Rgb, exposure: number): Rgb {
  const mapped = toneMapNeutral([
    radiance[0] * exposure,
    radiance[1] * exposure,
    radiance[2] * exposure,
  ]);
  return [
    Math.min(1, toGamma(mapped[0])),
    Math.min(1, toGamma(mapped[1])),
    Math.min(1, toGamma(mapped[2])),
  ];
}

export interface AtmosphereInput {
  /** Expunerea imaginii (`LOOK.exposure`); culorile de afișare se convertesc cu ea. */
  readonly exposure: number;
  /**
   * Direcția în care călătorește lumina soarelui (aceeași convenție ca `DirectionalLight.direction`).
   * Discul din cer și lumina `daylight-sun` se derivă din ea, deci nu pot fi nealiniate.
   */
  readonly sunDirection: Vec3;
  readonly zenithDisplay: Rgb;
  readonly horizonDisplay: Rgb;
  /** Radianța solului văzut de IBL sub orizont (liniar, relativ la cer). */
  readonly ground: Rgb;
  readonly sunLightColor: Rgb;
  readonly sunLightIntensity: number;
  /** Ceața exponențială pătratică: `exp(-(d·densitate)²)`. */
  readonly fogDensity: number;
  readonly clouds: {
    readonly coverage: number;
    readonly softness: number;
    readonly scale: number;
  };
  /** PBI 252: 0 = zi, 1 = noapte. Stinge lumina de rezervă și aprinde stelele din cer. */
  readonly night?: number;
  /** PBI 252: radianța corpului ceresc (soarele sau luna). */
  readonly discRadiance?: number;
  readonly discAngularRadiusDeg?: number;
  readonly glowColor?: Rgb;
  readonly gradientRate?: number;
  readonly mieStrength?: number;
  readonly legacyAmbientIntensity?: number;
  readonly environmentIntensity?: number;
}

/** Expunerea imaginii: o singură valoare pentru `LOOK.exposure` (241) și pentru culorile cerului. */
export const IMAGE_EXPOSURE = 1.45;

/** Direcția luminii `daylight-sun` din 016 (înainte de normalizare). */
export const DAYLIGHT_SUN_DIRECTION: Vec3 = Object.freeze([-0.45, -1, 0.35] as const);

/** Direcția luminii pentru un azimut (grade, 0 = +Z, 90 = +X) și o elevație: pentru ora din zi (252). */
export function sunDirectionFromAngles(azimuthDeg: number, elevationDeg: number): Vec3 {
  const azimuth = (azimuthDeg * Math.PI) / 180;
  const elevation = (elevationDeg * Math.PI) / 180;
  return normalize([
    -Math.sin(azimuth) * Math.cos(elevation),
    -Math.sin(elevation),
    -Math.cos(azimuth) * Math.cos(elevation),
  ]);
}

/** Cerul zilei de azi: aceeași direcție a soarelui ca lumina `daylight-sun` din 016. */
export const DAYLIGHT_INPUT: AtmosphereInput = Object.freeze({
  exposure: IMAGE_EXPOSURE,
  sunDirection: DAYLIGHT_SUN_DIRECTION,
  zenithDisplay: Object.freeze([0.3, 0.55, 0.88] as const),
  horizonDisplay: Object.freeze([0.78, 0.88, 0.96] as const),
  ground: Object.freeze([0.075, 0.08, 0.07] as const),
  sunLightColor: Object.freeze([1, 0.99, 0.96] as const),
  sunLightIntensity: 1.04,
  fogDensity: 0.0008,
  clouds: Object.freeze({ coverage: 0.5, softness: 0.3, scale: 2.4 }),
});

export interface AtmosphereState {
  readonly version: typeof ATMOSPHERE_VERSION;
  readonly exposure: number;
  /** Direcția DINSPRE scenă SPRE soare (unitară). */
  readonly sunToward: Vec3;
  /** Direcția în care călătorește lumina (opusul lui `sunToward`), pentru `DirectionalLight`. */
  readonly sunLightDirection: Vec3;
  readonly sunElevationRad: number;
  readonly sun: {
    readonly lightColor: Rgb;
    readonly lightIntensity: number;
    /** Culoarea aureolei (Mie), caldă. */
    readonly glowColor: Rgb;
    /** Radianța discului în HDR: peste pragul bloomului, deci strălucește pe MEDIUM/HIGH. */
    readonly discRadiance: number;
    readonly discAngularRadiusRad: number;
    readonly mieG: number;
    readonly mieStrength: number;
  };
  /** Radianțe liniare de scenă. */
  readonly zenith: Rgb;
  readonly horizon: Rgb;
  readonly ground: Rgb;
  /** Cât de repede trece cerul de la orizont la zenit: `t = 1 − exp(−h · rate)`. */
  readonly gradientRate: number;
  readonly fog: {
    readonly mode: 'EXP2';
    readonly density: number;
    /** Culoarea ceții în radianță liniară (egală cu orizontul cerului). */
    readonly colorLinear: Rgb;
    /**
     * Valoarea pentru `scene.fogColor`, în spațiu gamma: `StandardMaterial` amestecă ceața înainte de
     * conversia în liniar, iar `PBRMaterial` (245–249) convertește singur `fogColor` în liniar
     * (`BindFogParameters`). În ambele cazuri rezultatul este `colorLinear`.
     */
    readonly colorGamma: Rgb;
  };
  /** IBL: cubul se generează din `environmentRadiance`. */
  readonly environment: { readonly intensity: number };
  /**
   * Ambientul de rezervă al materialelor care nu primesc IBL (`StandardMaterial`): o lumină
   * hemisferică colorată după cer și sol. Se reduce la 0 când toate materialele sunt PBR (245–249),
   * altfel ambientul s-ar dubla (hemisferica + IBL).
   */
  readonly legacyAmbient: {
    readonly intensity: number;
    readonly skyColor: Rgb;
    readonly groundColor: Rgb;
  };
  readonly clouds: AtmosphereInput['clouds'];
  /** PBI 252: 0 = zi, 1 = noapte; shaderul cerului aprinde stelele, restul scenei lumina stradală. */
  readonly night: number;
}

export function createAtmosphereState(input: AtmosphereInput = DAYLIGHT_INPUT): AtmosphereState {
  const light = normalize(input.sunDirection);
  const toward: Vec3 = [-light[0], -light[1], -light[2]];
  // Corpul ceresc trebuie să fie deasupra orizontului; noaptea este luna, nu soarele.
  if (!(toward[1] > 0.05)) throw new Error('Soarele trebuie să fie deasupra orizontului');
  const elevation = Math.asin(toward[1]);
  const night = input.night ?? 0;
  if (!(night >= 0 && night <= 1)) throw new Error('Noaptea trebuie să fie între 0 și 1');
  const discAngularRadiusDeg = input.discAngularRadiusDeg ?? 1.15;
  if (!(discAngularRadiusDeg > 0 && discAngularRadiusDeg < 30))
    throw new Error('Raza discului este invalidă');
  const gradientRate = input.gradientRate ?? 3.1;
  if (!(gradientRate > 0)) throw new Error('Gradientul cerului este invalid');
  const legacyAmbientIntensity = input.legacyAmbientIntensity ?? 0.5;
  const environmentIntensity = input.environmentIntensity ?? 1;
  if (!(legacyAmbientIntensity >= 0 && legacyAmbientIntensity <= 2))
    throw new Error('Ambientul de rezervă este invalid');
  if (!(environmentIntensity >= 0 && environmentIntensity <= 4))
    throw new Error('Intensitatea mediului este invalidă');
  const zenith = displayToRadiance(input.zenithDisplay, input.exposure);
  const horizon = displayToRadiance(input.horizonDisplay, input.exposure);
  const fogDisplay: Rgb = [toGamma(horizon[0]), toGamma(horizon[1]), toGamma(horizon[2])];
  const skyTint = mixRgb(horizon, zenith, 0.5);
  const tintPeak = Math.max(skyTint[0], skyTint[1], skyTint[2]);
  return Object.freeze({
    version: ATMOSPHERE_VERSION,
    exposure: input.exposure,
    night,
    sunToward: toward,
    sunLightDirection: light,
    sunElevationRad: elevation,
    sun: Object.freeze({
      lightColor: input.sunLightColor,
      lightIntensity: input.sunLightIntensity,
      glowColor: input.glowColor ?? ([1, 0.84, 0.58] as const),
      discRadiance: input.discRadiance ?? 34,
      discAngularRadiusRad: (discAngularRadiusDeg * Math.PI) / 180,
      mieG: 0.76,
      mieStrength: input.mieStrength ?? 0.1,
    }),
    zenith,
    horizon,
    ground: input.ground,
    gradientRate,
    fog: Object.freeze({
      mode: 'EXP2' as const,
      density: input.fogDensity,
      colorLinear: horizon,
      colorGamma: fogDisplay,
    }),
    environment: Object.freeze({ intensity: environmentIntensity }),
    legacyAmbient: Object.freeze({
      intensity: legacyAmbientIntensity,
      // Culoarea cerului normalizată, 88% spre alb (luminozitatea o dă `intensity`): o tentă
      // mai mare albăstrea asfaltul și trotuarul față de paleta de la 241.
      skyColor: mixRgb(
        [1, 1, 1],
        [skyTint[0] / tintPeak, skyTint[1] / tintPeak, skyTint[2] / tintPeak],
        0.12,
      ),
      groundColor: [0.42, 0.44, 0.46] as const,
    }),
    clouds: input.clouds,
  });
}

/** Fracțiunea de lumină care ajunge la distanța `distanceM` (1 = ceață zero). */
export function fogVisibility(state: AtmosphereState, distanceM: number): number {
  if (!(distanceM >= 0)) throw new Error('Distanță invalidă');
  const x = distanceM * state.fog.density;
  return Math.exp(-x * x);
}

/** Culoarea de ștergere: radianță liniară în pipeline HDR, culoarea finală de pe ecran pe LOW. */
export function backdropColor(state: AtmosphereState, byPipeline: boolean): Rgb {
  return byPipeline ? state.horizon : radianceToDisplay(state.horizon, state.exposure);
}

/** Termenul Mie (Henyey–Greenstein) al aureolei din jurul soarelui. */
export function mieLobe(cosAngle: number, g: number): number {
  const denominator = 1 + g * g - 2 * g * cosAngle;
  return (1 - g * g) / (4 * Math.PI * Math.pow(Math.max(denominator, 1e-4), 1.5));
}

/**
 * Radianța cerului în direcția `dir` (unitară). Oglinda GLSL este `sky.fragment` din
 * `atmosphere-scene.ts`; norii se adaugă numai în shader (nu intră în IBL).
 */
export function skyRadiance(
  state: AtmosphereState,
  dir: Vec3,
  options: { readonly disc?: boolean } = {},
): Rgb {
  const h = dir[1];
  const t = 1 - Math.exp(-Math.max(h, 0) * state.gradientRate);
  const base = mixRgb(state.horizon, state.zenith, t);
  const cosSun =
    dir[0] * state.sunToward[0] + dir[1] * state.sunToward[1] + dir[2] * state.sunToward[2];
  const glow = mieLobe(cosSun, state.sun.mieG) * state.sun.mieStrength * (0.35 + 0.65 * (1 - t));
  let r = base[0] + state.sun.glowColor[0] * glow;
  let g = base[1] + state.sun.glowColor[1] * glow;
  let b = base[2] + state.sun.glowColor[2] * glow;
  if (options.disc) {
    const radius = state.sun.discAngularRadiusRad;
    const disc =
      smoothstep(Math.cos(radius), Math.cos(radius * 0.82), cosSun) * state.sun.discRadiance;
    r += state.sun.glowColor[0] * disc;
    g += state.sun.glowColor[1] * disc;
    b += state.sun.glowColor[2] * disc;
  }
  return [r, g, b];
}

/** Ce „vede” IBL-ul: cerul fără disc (soarele este lumina directă) și un sol sub orizont. */
export function environmentRadiance(state: AtmosphereState, dir: Vec3): Rgb {
  if (dir[1] >= 0) return skyRadiance(state, dir);
  // Sub orizont: haloul orizontului pe același azimut, care trece treptat în culoarea solului.
  const flat = Math.hypot(dir[0], dir[2]) || 1;
  const horizon = skyRadiance(state, [dir[0] / flat, 0, dir[2] / flat]);
  return mixRgb(horizon, state.ground, smoothstep(0, 0.35, -dir[1]));
}

/** Direcția (nenormalizată) a unui texel, în convenția cuburilor GL (+X −X +Y −Y +Z −Z). */
export function cubeTexelDirection(face: number, column: number, row: number, size: number): Vec3 {
  const u = (2 * (column + 0.5)) / size - 1;
  const v = (2 * (row + 0.5)) / size - 1;
  switch (face) {
    case 0:
      return [1, -v, -u];
    case 1:
      return [-1, -v, u];
    case 2:
      return [u, 1, v];
    case 3:
      return [u, -1, -v];
    case 4:
      return [u, -v, 1];
    case 5:
      return [-u, -v, -1];
    default:
      throw new Error('Față de cub invalidă');
  }
}

/** Unghiul solid al unui texel (aproximația clasică folosită și de Babylon pentru SH). */
export function cubeTexelSolidAngle(column: number, row: number, size: number): number {
  const d = 2 / size;
  const area = (x: number, y: number): number => Math.atan2(x * y, Math.sqrt(x * x + y * y + 1));
  const u = -1 + (column + 0.5) * d;
  const v = -1 + (row + 0.5) * d;
  const h = d / 2;
  return area(u - h, v - h) - area(u - h, v + h) - area(u + h, v - h) + area(u + h, v + h);
}

/**
 * Cele șase fețe ale cubului de mediu, RGBA `Float32Array` în ordinea +X −X +Y −Y +Z −Z (ordinea în
 * care Babylon le primește pe ambele backenduri; verificat în browser pe WebGL2 și WebGPU).
 */
export function buildEnvironmentFaces(state: AtmosphereState, size: number): Float32Array[] {
  if (!Number.isInteger(size) || size < 4 || size > 512 || (size & (size - 1)) !== 0)
    throw new Error('Dimensiunea cubului trebuie să fie putere a lui 2 între 4 și 512');
  const scale = state.environment.intensity;
  const faces: Float32Array[] = [];
  for (let face = 0; face < 6; face += 1) {
    const data = new Float32Array(size * size * 4);
    for (let row = 0; row < size; row += 1)
      for (let column = 0; column < size; column += 1) {
        const dir = normalize(cubeTexelDirection(face, column, row, size));
        const radiance = environmentRadiance(state, dir);
        const base = (row * size + column) * 4;
        data[base] = radiance[0] * scale;
        data[base + 1] = radiance[1] * scale;
        data[base + 2] = radiance[2] * scale;
        data[base + 3] = 1;
      }
    faces.push(data);
  }
  return faces;
}

/** Octeții GPU ai cubului (half-float RGBA, lanț complet de mip-uri): pentru bugetul 223. */
export function environmentTextureBytes(size: number, halfFloat = true): number {
  const texel = halfFloat ? 8 : 4;
  let total = 0;
  for (let level = size; level >= 1; level = level >> 1) total += level * level * 6 * texel;
  return total;
}

/** Conversie float32 → float16 (biți), cu rotunjire la cel mai apropiat și saturare la ±65504. */
export function floatToHalf(value: number): number {
  if (Number.isNaN(value)) return 0;
  const sign = value < 0 || Object.is(value, -0) ? 0x8000 : 0;
  const magnitude = Math.abs(value);
  if (magnitude >= 65520) return sign | 0x7bff;
  if (magnitude < 2 ** -24 / 2) return sign;
  if (magnitude < 2 ** -14) return sign | Math.round(magnitude / 2 ** -24);
  const exponent = Math.floor(Math.log2(magnitude));
  const mantissa = Math.round((magnitude / 2 ** exponent - 1) * 1024);
  // O mantisă rotunjită la 1024 trece în exponentul următor.
  return sign | (((exponent + 15) << 10) + mantissa);
}

export function facesToHalf(faces: readonly Float32Array[]): Uint16Array[] {
  return faces.map((face) => {
    const half = new Uint16Array(face.length);
    for (let index = 0; index < face.length; index += 1) half[index] = floatToHalf(face[index]!);
    return half;
  });
}

/** Rezervă LDR (fără half-float): RGBA8 liniar, saturat la 1. */
export function facesToBytes(faces: readonly Float32Array[]): Uint8Array[] {
  return faces.map((face) => {
    const bytes = new Uint8Array(face.length);
    for (let index = 0; index < face.length; index += 1)
      bytes[index] = Math.round(Math.max(0, Math.min(1, face[index]!)) * 255);
    return bytes;
  });
}

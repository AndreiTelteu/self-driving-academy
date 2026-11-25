/**
 * PBI 245 — texturile procedurale ale suprafețelor orașului (pur, fără Babylon).
 *
 * Nimic nu este descărcat și nimic nu este copiat: fiecare textură se calculează la încărcare din
 * zgomot de valori determinist (hash întreg, fără `Math.random`) care se repetă exact pe marginile
 * dalei (periodice), deci o dală se poate pune cap la cap fără cusătură. Setul unei suprafețe are până
 * la trei imagini RGBA8:
 *
 * - `albedo`: culoarea în sRGB (octeții se decodifică în shader) și, pentru marcaje și urme de uzură,
 *   alpha;
 * - `normal`: normal map tangent (RGB = n·0,5+0,5), derivat dintr-un câmp de înălțimi în METRI, deci
 *   panta fizică nu depinde de rezoluția presetului (LOW 256 px sau HIGH 1024 px arată aceeași suprafață);
 * - `orm`: R = ocluzie ambientală, G = rugozitate, B = metalicitate (0), formatul glTF.
 *
 * Asfaltul are o a doua textură, `asphaltMacro`, în formatul hărții de detaliu Babylon (R = albedo cu
 * 0,5 neutru, G și A = normala Y și X, B = rugozitatea cu 0,5 neutru) la o dală de 24 m: petice, crăpături,
 * pete de ulei. Combinată cu granulația fină de 2,5 m, dala vizibilă nu se repetă pe 50 m.
 *
 * Nu există un encoder KTX2/Basis în proiect și nicio sursă de texturi comprimate: texturile rămân RGBA8 cu
 * lanț de mip-uri (≈ 45 MiB GPU pe HIGH, vezi `surfaceTextureBytes`), mult sub bugetul 223.
 */
export const SURFACE_TEXTURES_VERSION = '246-building-facades-1';

export type SurfaceTextureId =
  | 'asphalt'
  | 'asphaltMacro'
  | 'marking'
  | 'sidewalk'
  | 'curb'
  | 'grass'
  | 'wear'
  | 'terrainDetail'
  | 'facadeBrick'
  | 'facadePlaster'
  | 'facadeConcrete';

export interface SurfaceTextureSpec {
  readonly id: SurfaceTextureId;
  /** Dimensiunea dalei în metri (u, v). Pentru bordură și urme, u este lățimea (0..1 peste element). */
  readonly tileM: Readonly<{ u: number; v: number }>;
  /** Lățimea și înălțimea ca fracții ale `baseSize`. */
  readonly sizeFraction: Readonly<{ w: number; h: number }>;
  readonly hasNormal: boolean;
  readonly hasOrm: boolean;
  /** Descriere pentru inventarul 150. */
  readonly description: string;
}

export const SURFACE_TEXTURE_SPECS: Readonly<Record<SurfaceTextureId, SurfaceTextureSpec>> =
  Object.freeze({
    asphalt: {
      id: 'asphalt',
      tileM: { u: 2.5, v: 2.5 },
      sizeFraction: { w: 1, h: 1 },
      hasNormal: true,
      hasOrm: true,
      description: 'Asfalt: liant închis, agregat fin cu pietre mai deschise, granulație și pori',
    },
    asphaltMacro: {
      id: 'asphaltMacro',
      tileM: { u: 24, v: 24 },
      sizeFraction: { w: 0.5, h: 0.5 },
      hasNormal: false,
      hasOrm: false,
      description: 'Hartă de detaliu macro: pete, petice reparate, crăpături și pete de ulei',
    },
    marking: {
      id: 'marking',
      tileM: { u: 2, v: 2 },
      sizeFraction: { w: 0.5, h: 0.5 },
      hasNormal: true,
      hasOrm: true,
      description: 'Vopsea de marcaj mată, uzată: scorojită, cu asfaltul vizibil prin ea',
    },
    sidewalk: {
      id: 'sidewalk',
      tileM: { u: 4.8, v: 4.8 },
      sizeFraction: { w: 1, h: 1 },
      hasNormal: true,
      hasOrm: true,
      description: 'Trotuar: 4×4 dale de beton de 1,2 m cu rosturi, pete și crăpături fine',
    },
    curb: {
      id: 'curb',
      tileM: { u: 1, v: 3 },
      sizeFraction: { w: 0.125, h: 0.5 },
      hasNormal: true,
      hasOrm: true,
      description: 'Bordură de beton teșită, mai caldă decât trotuarul, cu rosturi la 1,5 m',
    },
    grass: {
      id: 'grass',
      tileM: { u: 6, v: 6 },
      sizeFraction: { w: 0.5, h: 0.5 },
      hasNormal: true,
      hasOrm: true,
      description: 'Iarbă: variație de nuanță, petice uscate, relief fin',
    },
    wear: {
      id: 'wear',
      tileM: { u: 1, v: 6 },
      sizeFraction: { w: 0.125, h: 0.5 },
      hasNormal: false,
      hasOrm: false,
      description: 'Urmă de uzură a roților: bandă întunecată cu margini moi (alpha)',
    },
    terrainDetail: {
      id: 'terrainDetail',
      tileM: { u: 12, v: 12 },
      sizeFraction: { w: 0.25, h: 0.25 },
      hasNormal: false,
      hasOrm: false,
      description:
        'Modulare de luminanță pentru terenul de la orizont (înmulțește culoarea pe vârf)',
    },
    facadeBrick: {
      id: 'facadeBrick',
      tileM: { u: 4, v: 4 },
      sizeFraction: { w: 0.5, h: 0.5 },
      hasNormal: true,
      hasOrm: true,
      description:
        'Cărămidă aparentă: cărămizi de 22×7 cm în legătură întinsă, rosturi de mortar, variație de ardere',
    },
    facadePlaster: {
      id: 'facadePlaster',
      tileM: { u: 4, v: 4 },
      sizeFraction: { w: 0.5, h: 0.5 },
      hasNormal: true,
      hasOrm: true,
      description: 'Tencuială: granulație fină, scurgeri verticale sub ferestre, reparații rare',
    },
    facadeConcrete: {
      id: 'facadeConcrete',
      tileM: { u: 4, v: 4 },
      sizeFraction: { w: 0.5, h: 0.5 },
      hasNormal: true,
      hasOrm: true,
      description: 'Beton cofrat: urme de panouri de 2 m, găuri de cofraj, variație de turnare',
    },
  });

export const SURFACE_TEXTURE_IDS = Object.freeze(
  Object.keys(SURFACE_TEXTURE_SPECS) as SurfaceTextureId[],
);

export interface SurfaceImage {
  readonly id: SurfaceTextureId;
  readonly width: number;
  readonly height: number;
  readonly albedo: Uint8Array;
  readonly normal: Uint8Array | null;
  readonly orm: Uint8Array | null;
}

export function surfaceTextureSize(
  id: SurfaceTextureId,
  baseSize: number,
): Readonly<{ width: number; height: number }> {
  const spec = SURFACE_TEXTURE_SPECS[id];
  return Object.freeze({
    width: Math.max(8, Math.round(baseSize * spec.sizeFraction.w)),
    height: Math.max(8, Math.round(baseSize * spec.sizeFraction.h)),
  });
}

/** Octeți GPU (RGBA8 cu lanț complet de mip-uri, 4/3) ai tuturor texturilor la o rezoluție de bază. */
export function surfaceTextureBytes(baseSize: number): number {
  let total = 0;
  for (const id of SURFACE_TEXTURE_IDS) {
    const spec = SURFACE_TEXTURE_SPECS[id];
    const { width, height } = surfaceTextureSize(id, baseSize);
    const images = 1 + (spec.hasNormal ? 1 : 0) + (spec.hasOrm ? 1 : 0);
    total += Math.ceil(((width * height * 4 * 4) / 3) * images);
  }
  return total;
}

// ---- zgomot periodic -----------------------------------------------------------------------------

function hash(x: number, y: number, seed: number): number {
  let h =
    Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);
const smoothstep = (a: number, b: number, value: number): number => {
  const t = clamp01((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Zgomot de valori periodic pe o grilă de `px × py` celule care se repetă pe dală; valori în [0, 1). */
function valueNoise(w: number, h: number, px: number, py: number, seed: number): Float32Array {
  px = Math.max(1, Math.round(px));
  py = Math.max(1, Math.round(py));
  const lattice = new Float32Array(px * py);
  for (let y = 0; y < py; y += 1)
    for (let x = 0; x < px; x += 1) lattice[y * px + x] = hash(x, y, seed);
  const out = new Float32Array(w * h);
  const fadeX = new Float32Array(w);
  const x0 = new Int32Array(w);
  const x1 = new Int32Array(w);
  for (let x = 0; x < w; x += 1) {
    const fx = (x / w) * px;
    const ix = Math.floor(fx);
    x0[x] = ix % px;
    x1[x] = (ix + 1) % px;
    fadeX[x] = fade(fx - ix);
  }
  for (let y = 0; y < h; y += 1) {
    const fy = (y / h) * py;
    const iy = Math.floor(fy);
    const ty = fade(fy - iy);
    const row0 = (iy % py) * px;
    const row1 = ((iy + 1) % py) * px;
    for (let x = 0; x < w; x += 1) {
      const a = lattice[row0 + x0[x]!]!;
      const b = lattice[row0 + x1[x]!]!;
      const c = lattice[row1 + x0[x]!]!;
      const d = lattice[row1 + x1[x]!]!;
      const tx = fadeX[x]!;
      out[y * w + x] = mix(mix(a, b, tx), mix(c, d, tx), ty);
    }
  }
  return out;
}

/** fBm periodic normalizat în [0, 1]; `px, py` sunt celulele primei octave pe dală. */
function fbm(
  w: number,
  h: number,
  px: number,
  py: number,
  octaves: number,
  seed: number,
  gain = 0.5,
): Float32Array {
  const out = new Float32Array(w * h);
  let amplitude = 1;
  let total = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    const layer = valueNoise(w, h, px * 2 ** octave, py * 2 ** octave, seed + octave * 101);
    for (let index = 0; index < out.length; index += 1) out[index]! += layer[index]! * amplitude;
    total += amplitude;
    amplitude *= gain;
  }
  for (let index = 0; index < out.length; index += 1) out[index]! /= total;
  return out;
}

/** Zgomot alb per pixel, periodic prin construcție (fiecare pixel are propria valoare). */
function whiteNoise(w: number, h: number, seed: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) out[y * w + x] = hash(x, y, seed);
  return out;
}

// ---- conversii -----------------------------------------------------------------------------------

const SRGB_LUT_SIZE = 2048;
const SRGB_LUT = (() => {
  const table = new Uint8Array(SRGB_LUT_SIZE + 1);
  for (let index = 0; index <= SRGB_LUT_SIZE; index += 1) {
    const linear = index / SRGB_LUT_SIZE;
    const encoded = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
    table[index] = Math.round(clamp01(encoded) * 255);
  }
  return table;
})();
/** Liniar [0, 1] → octet sRGB. */
const toSrgb = (linear: number): number => SRGB_LUT[Math.round(clamp01(linear) * SRGB_LUT_SIZE)]!;
const toByte = (value: number): number => Math.round(clamp01(value) * 255);

/**
 * Normal map tangent dintr-un câmp de înălțimi în metri. `pixelM` este mărimea fizică a unui pixel pe
 * fiecare axă: panta (m/m) nu depinde de rezoluție. Diferențe centrale cu înfășurare (dala este periodică).
 */
function normalFromHeight(
  heights: Float32Array,
  w: number,
  h: number,
  pixelMX: number,
  pixelMY: number,
): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const up = ((y + h - 1) % h) * w;
    const down = ((y + 1) % h) * w;
    for (let x = 0; x < w; x += 1) {
      const left = (x + w - 1) % w;
      const right = (x + 1) % w;
      const dx = (heights[y * w + right]! - heights[y * w + left]!) / (2 * pixelMX);
      const dy = (heights[down + x]! - heights[up + x]!) / (2 * pixelMY);
      const inv = 1 / Math.hypot(dx, dy, 1);
      const o = (y * w + x) * 4;
      out[o] = toByte(-dx * inv * 0.5 + 0.5);
      out[o + 1] = toByte(-dy * inv * 0.5 + 0.5);
      out[o + 2] = toByte(inv * 0.5 + 0.5);
      out[o + 3] = 255;
    }
  }
  return out;
}

/** AO (R), rugozitate (G), metalicitate 0 (B) în același RGBA8. */
function packOrm(ao: Float32Array, roughness: Float32Array): Uint8Array {
  const out = new Uint8Array(ao.length * 4);
  for (let index = 0; index < ao.length; index += 1) {
    out[index * 4] = toByte(ao[index]!);
    out[index * 4 + 1] = toByte(roughness[index]!);
    out[index * 4 + 2] = 0;
    out[index * 4 + 3] = 255;
  }
  return out;
}

function packAlbedo(
  w: number,
  h: number,
  color: (index: number) => readonly [number, number, number],
): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let index = 0; index < w * h; index += 1) {
    const [r, g, b] = color(index);
    out[index * 4] = toSrgb(r);
    out[index * 4 + 1] = toSrgb(g);
    out[index * 4 + 2] = toSrgb(b);
    out[index * 4 + 3] = 255;
  }
  return out;
}

// ---- suprafețe -----------------------------------------------------------------------------------

function genAsphalt(w: number, h: number): SurfaceImage {
  const spec = SURFACE_TEXTURE_SPECS.asphalt;
  const pixelM = spec.tileM.u / w;
  const mott = fbm(w, h, 4, 4, 4, 11);
  const mid = valueNoise(w, h, w / 16, h / 16, 12);
  const fine = valueNoise(w, h, w / 2, h / 2, 13);
  const grit = valueNoise(w, h, w / 3, h / 3, 14);
  const white = whiteNoise(w, h, 15);
  const tint = whiteNoise(w, h, 16);
  const size = w * h;
  const height = new Float32Array(size);
  const stone = new Float32Array(size);
  const ao = new Float32Array(size);
  const rough = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    const s = smoothstep(0.7, 0.8, grit[i]!) * (0.55 + 0.45 * white[i]!);
    stone[i] = s;
    // Metri: pori ~1 mm, pietre cu ~2 mm relief.
    height[i] = 0.0014 * fine[i]! + 0.0009 * white[i]! + 0.0008 * mid[i]! + 0.0022 * s;
    const hn = clamp01(height[i]! / 0.0045);
    ao[i] = 0.72 + 0.28 * hn;
    rough[i] = mix(0.84 - 0.1 * (fine[i]! - 0.5), 0.66, s);
  }
  const albedo = packAlbedo(w, h, (i) => {
    const binder =
      0.135 * (0.78 + 0.5 * fine[i]! + 0.18 * (white[i]! - 0.5)) * (0.92 + 0.16 * mott[i]!);
    const l = binder + stone[i]! * (0.1 + 0.07 * tint[i]!);
    const warm = (tint[i]! - 0.5) * 0.12;
    return [l * (1 + warm), l, l * (1 - warm)];
  });
  return {
    id: 'asphalt',
    width: w,
    height: h,
    albedo,
    normal: normalFromHeight(height, w, h, pixelM, pixelM),
    orm: packOrm(ao, rough),
  };
}

function genAsphaltMacro(w: number, h: number): SurfaceImage {
  const spec = SURFACE_TEXTURE_SPECS.asphaltMacro;
  const pixelM = spec.tileM.u / w;
  const mottle = fbm(w, h, 3, 3, 5, 21);
  const patchField = fbm(w, h, 3, 3, 4, 22);
  const crackField = fbm(w, h, 5, 5, 5, 23);
  const crack2 = fbm(w, h, 9, 9, 4, 24);
  const stain = fbm(w, h, 7, 7, 4, 25);
  const fineVar = valueNoise(w, h, w / 8, h / 8, 26);
  const size = w * h;
  const out = new Uint8Array(size * 4);
  const height = new Float32Array(size);
  const albedoDetail = new Float32Array(size);
  const roughDetail = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    let a = 0.5 + 0.1 * (mottle[i]! - 0.5) * 2 + 0.03 * (fineVar[i]! - 0.5);
    let r = 0.5 + 0.06 * (mottle[i]! - 0.5);
    let hh = 0;
    // Peticul reparat: întunecat, mai neted; marginea lui este o muchie ușoară.
    const patch = smoothstep(0.585, 0.595, patchField[i]!);
    const patchEdge = smoothstep(0.575, 0.585, patchField[i]!) - patch;
    a -= 0.1 * patch;
    r -= 0.09 * patch;
    hh += 0.004 * patch - 0.002 * patchEdge;
    a -= 0.07 * patchEdge;
    // Crăpături: linii subțiri în jurul valorii mediane a unui fBm; foarte rare, deci nu se repetă.
    const c1 = Math.abs(crackField[i]! - 0.5);
    const c2 = Math.abs(crack2[i]! - 0.5);
    const crack = Math.max(1 - smoothstep(0.0, 0.0028, c1), (1 - smoothstep(0.0, 0.002, c2)) * 0.5);
    a -= 0.09 * crack;
    r += 0.08 * crack;
    hh -= 0.004 * crack;
    // Pete de ulei sub banda de rulare: întunecare lină, ușor mai lucioasă.
    const oil = smoothstep(0.64, 0.7, stain[i]!);
    a -= 0.05 * oil;
    r -= 0.12 * oil;
    albedoDetail[i] = a;
    roughDetail[i] = r;
    height[i] = hh;
  }
  const normal = normalFromHeight(height, w, h, pixelM, pixelM);
  for (let i = 0; i < size; i += 1) {
    out[i * 4] = toByte(albedoDetail[i]!); // R: albedo (neutru 0,5)
    out[i * 4 + 1] = normal[i * 4 + 1]!; // G: normala Y
    out[i * 4 + 2] = toByte(roughDetail[i]!); // B: rugozitate (neutru 0,5)
    out[i * 4 + 3] = normal[i * 4]!; // A: normala X
  }
  return { id: 'asphaltMacro', width: w, height: h, albedo: out, normal: null, orm: null };
}

function genMarking(w: number, h: number): SurfaceImage {
  const spec = SURFACE_TEXTURE_SPECS.marking;
  const pixelM = spec.tileM.u / w;
  const wearField = fbm(w, h, 5, 5, 5, 31);
  const blotch = fbm(w, h, 11, 11, 4, 32);
  const fine = valueNoise(w, h, w / 2, h / 2, 33);
  const grit = valueNoise(w, h, w / 3, h / 3, 34);
  const white = whiteNoise(w, h, 35);
  const crack = fbm(w, h, 6, 6, 4, 36);
  const size = w * h;
  const height = new Float32Array(size);
  const ao = new Float32Array(size);
  const rough = new Float32Array(size);
  const worn = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    const mask = smoothstep(0.52, 0.72, 0.62 * wearField[i]! + 0.38 * blotch[i]!);
    const specks = smoothstep(0.74, 0.82, grit[i]!);
    const line = 1 - smoothstep(0.0, 0.006, Math.abs(crack[i]! - 0.5));
    const loss = clamp01(mask * 0.55 + specks * 0.55 + line * 0.5);
    worn[i] = loss;
    height[i] = 0.0007 * fine[i]! + 0.0005 * white[i]! - 0.0009 * loss;
    ao[i] = 1 - 0.25 * loss;
    rough[i] = mix(0.7 + 0.08 * (fine[i]! - 0.5), 0.84, loss);
  }
  const albedo = packAlbedo(w, h, (i) => {
    // Vopsea albă ușor caldă; sub ea, asfaltul cu aceeași granulație fină.
    const paint = 0.66 * (0.94 + 0.1 * fine[i]!);
    const base = 0.13 * (0.8 + 0.4 * fine[i]!);
    const l = mix(paint, base, worn[i]!);
    return [l * 1.02, l, l * 0.93 + (1 - worn[i]!) * 0.0];
  });
  return {
    id: 'marking',
    width: w,
    height: h,
    albedo,
    normal: normalFromHeight(height, w, h, pixelM, pixelM),
    orm: packOrm(ao, rough),
  };
}

function genSidewalk(w: number, h: number): SurfaceImage {
  const spec = SURFACE_TEXTURE_SPECS.sidewalk;
  const pixelM = spec.tileM.u / w;
  const slabs = 4;
  const slabPx = w / slabs;
  const mott = fbm(w, h, 4, 4, 5, 41);
  const stainField = fbm(w, h, 6, 6, 4, 42);
  const fine = valueNoise(w, h, w / 2, h / 2, 43);
  const mid = valueNoise(w, h, w / 10, h / 10, 44);
  const white = whiteNoise(w, h, 45);
  const crackField = fbm(w, h, 8, 8, 4, 46);
  const size = w * h;
  const height = new Float32Array(size);
  const ao = new Float32Array(size);
  const rough = new Float32Array(size);
  const lum = new Float32Array(size);
  const jointMask = new Float32Array(size);
  for (let y = 0; y < h; y += 1) {
    const sy = Math.floor(y / slabPx);
    const ly = y - sy * slabPx;
    for (let x = 0; x < w; x += 1) {
      const sx = Math.floor(x / slabPx);
      const lx = x - sx * slabPx;
      const i = y * w + x;
      const edgePx = Math.min(lx + 0.5, slabPx - lx - 0.5, ly + 0.5, slabPx - ly - 0.5);
      const edgeM = edgePx * pixelM;
      const joint = 1 - smoothstep(0.005, 0.014, edgeM);
      const tooled = 1 - smoothstep(0.0, 0.03, edgeM);
      jointMask[i] = joint;
      const slabTint = (hash(sx, sy, 47) - 0.5) * 0.12;
      const slabSheen = hash(sx, sy, 48);
      // Fisuri fine numai pe unele dale.
      const crackOn = slabSheen < 0.3 ? 1 : 0;
      const crack =
        crackOn * (1 - smoothstep(0.0, 0.004, Math.abs(crackField[i]! - 0.5))) * (1 - joint);
      let l =
        0.4 *
        (1 +
          slabTint +
          0.16 * (mott[i]! - 0.5) +
          0.07 * (fine[i]! - 0.5) +
          0.05 * (white[i]! - 0.5));
      l *= 1 - 0.18 * smoothstep(0.55, 0.75, stainField[i]!) - 0.1 * tooled;
      l *= 1 - 0.6 * crack;
      l = mix(l, 0.13, joint);
      lum[i] = l;
      height[i] =
        -0.007 * joint - 0.0016 * tooled + 0.0007 * fine[i]! + 0.0004 * mid[i]! - 0.002 * crack;
      ao[i] = mix(0.92 + 0.08 * fine[i]!, 0.35, joint);
      rough[i] = mix(0.86 - 0.08 * (fine[i]! - 0.5), 0.96, joint);
    }
  }
  const albedo = packAlbedo(w, h, (i) => [lum[i]! * 1.01, lum[i]!, lum[i]! * 0.96]);
  return {
    id: 'sidewalk',
    width: w,
    height: h,
    albedo,
    normal: normalFromHeight(height, w, h, pixelM, pixelM),
    orm: packOrm(ao, rough),
  };
}

function genCurb(w: number, h: number): SurfaceImage {
  const spec = SURFACE_TEXTURE_SPECS.curb;
  // u: peste bordură (lățimea elementului), v: de-a lungul ei. Elementul are ~0,2 m în u.
  const widthM = 0.2;
  const pixelMX = widthM / w;
  const pixelMY = spec.tileM.v / h;
  const mott = fbm(w, h, 2, 6, 4, 51);
  const fine = valueNoise(w, h, w / 2, h / 2, 52);
  const specks = whiteNoise(w, h, 53);
  const size = w * h;
  const height = new Float32Array(size);
  const ao = new Float32Array(size);
  const rough = new Float32Array(size);
  const lum = new Float32Array(size);
  for (let y = 0; y < h; y += 1) {
    const v = y / h;
    // Rosturi transversale la fiecare 1,5 m (v = 0 și 0,5).
    const jointDist = Math.min(Math.abs(v - 0), Math.abs(v - 0.5), Math.abs(v - 1)) * spec.tileM.v;
    const joint = 1 - smoothstep(0.003, 0.009, jointDist);
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const u = (x + 0.5) / w;
      const edgeM = Math.min(u, 1 - u) * widthM;
      // Teșitură de 3 cm pe ambele muchii: relief cvasi-sferic, deci normala se înclină spre exterior.
      const bevel = clamp01(1 - edgeM / 0.03);
      let l =
        0.5 * (1 + 0.14 * (mott[i]! - 0.5) + 0.08 * (fine[i]! - 0.5) + 0.04 * (specks[i]! - 0.5));
      l *= 1 + 0.1 * bevel; // muchia roasă este mai curată
      l *= 1 - 0.28 * smoothstep(0.55, 0.0, u) * (0.6 + 0.4 * mott[i]!); // murdărie spre rigolă
      l *= 1 - 0.35 * joint;
      l *= specks[i]! > 0.985 ? 0.5 : 1; // fire de bitum
      lum[i] = l;
      height[i] = -0.014 * bevel * bevel - 0.006 * joint + 0.0006 * fine[i]!;
      ao[i] = 1 - 0.5 * joint;
      rough[i] = 0.86 - 0.1 * bevel - 0.06 * (fine[i]! - 0.5);
    }
  }
  const albedo = packAlbedo(w, h, (i) => [lum[i]! * 1.04, lum[i]!, lum[i]! * 0.88]);
  return {
    id: 'curb',
    width: w,
    height: h,
    albedo,
    normal: normalFromHeight(height, w, h, pixelMX, pixelMY),
    orm: packOrm(ao, rough),
  };
}

function genGrass(w: number, h: number): SurfaceImage {
  const spec = SURFACE_TEXTURE_SPECS.grass;
  const pixelM = spec.tileM.u / w;
  const hue = fbm(w, h, 3, 3, 4, 61);
  const dryField = fbm(w, h, 5, 5, 4, 62);
  const mid = valueNoise(w, h, w / 12, h / 12, 63);
  const fine = valueNoise(w, h, w / 2, h / 2, 64);
  const blade = whiteNoise(w, h, 65);
  const weeds = valueNoise(w, h, w / 6, h / 6, 66);
  const size = w * h;
  const height = new Float32Array(size);
  const ao = new Float32Array(size);
  const rough = new Float32Array(size);
  const albedo = packAlbedo(w, h, (i) => {
    const t = clamp01((hue[i]! - 0.3) / 0.4);
    const live: [number, number, number] = [
      mix(0.045, 0.1, t),
      mix(0.1, 0.17, t),
      mix(0.018, 0.04, t),
    ];
    const dry = smoothstep(0.56, 0.78, dryField[i]!) * 0.65;
    const clover = smoothstep(0.7, 0.8, weeds[i]!) * 0.5;
    const shade = (0.7 + 0.6 * fine[i]!) * (0.86 + 0.28 * mid[i]!) * (0.92 + 0.16 * blade[i]!);
    const r = mix(live[0], 0.17, dry) * shade;
    const g = mix(mix(live[1], 0.14, dry), 0.2, clover) * shade;
    const b = mix(live[2], 0.06, dry) * shade;
    return [r, g, b];
  });
  for (let i = 0; i < size; i += 1) {
    const hn = 0.6 * fine[i]! + 0.25 * mid[i]! + 0.15 * blade[i]!;
    height[i] = 0.018 * hn;
    ao[i] = 0.55 + 0.45 * hn;
    rough[i] = 0.9 - 0.06 * (fine[i]! - 0.5);
  }
  return {
    id: 'grass',
    width: w,
    height: h,
    albedo,
    normal: normalFromHeight(height, w, h, pixelM, pixelM),
    orm: packOrm(ao, rough),
  };
}

function genWear(w: number, h: number): SurfaceImage {
  const along = fbm(w, h, 1, 6, 4, 71);
  const fine = valueNoise(w, h, w / 3, h / 3, 72);
  const white = whiteNoise(w, h, 73);
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const u = (x + 0.5) / w;
      const edge = 1 - Math.abs(2 * u - 1); // 0 la margini, 1 în centru
      const profile = smoothstep(0.0, 0.7, edge) ** 1.4;
      const patchy = 0.35 + 0.65 * smoothstep(0.25, 0.75, along[i]!);
      const grain = 0.75 + 0.25 * fine[i]! + 0.1 * (white[i]! - 0.5);
      const alpha = clamp01(profile * patchy * grain * 0.3);
      const l = 0.03 + 0.02 * fine[i]!;
      out[i * 4] = toSrgb(l);
      out[i * 4 + 1] = toSrgb(l);
      out[i * 4 + 2] = toSrgb(l * 1.04);
      out[i * 4 + 3] = toByte(alpha);
    }
  return { id: 'wear', width: w, height: h, albedo: out, normal: null, orm: null };
}

function genTerrainDetail(w: number, h: number): SurfaceImage {
  const big = fbm(w, h, 3, 3, 4, 81);
  const fine = valueNoise(w, h, w / 2, h / 2, 82);
  const blade = whiteNoise(w, h, 83);
  // Luminanță liniară medie 0,5 (înmulțită apoi cu 2 în material): modulează culoarea pe vârf.
  const albedo = packAlbedo(w, h, (i) => {
    const l = 0.5 * (0.78 + 0.5 * big[i]! * 0.9 + 0.3 * (fine[i]! - 0.5) + 0.1 * (blade[i]! - 0.5));
    return [l * 0.98, l * 1.02, l * 0.96];
  });
  return { id: 'terrainDetail', width: w, height: h, albedo, normal: null, orm: null };
}

// ---- pereți de clădire (246) ----------------------------------------------------------------------

/**
 * Cărămidă aparentă: cărămizi de 0,22 × 0,07 m în legătură întinsă (jumătate de cărămidă decalată
 * pe rânduri impare), rosturi de mortar de ~12 mm mai deschise și mai rugoase, ardere variabilă.
 */
function genFacadeBrick(w: number, h: number): SurfaceImage {
  const spec = SURFACE_TEXTURE_SPECS.facadeBrick;
  const pixelMX = spec.tileM.u / w;
  const pixelMY = spec.tileM.v / h;
  const brickX = 0.22; // m
  const brickY = 0.07;
  const mortar = 0.012;
  const mott = fbm(w, h, 3, 3, 4, 91);
  const fine = valueNoise(w, h, w / 3, h / 3, 92);
  const size = w * h;
  const height = new Float32Array(size);
  const ao = new Float32Array(size);
  const rough = new Float32Array(size);
  const lum = new Float32Array(size);
  for (let y = 0; y < h; y += 1) {
    const vM = (y / h) * spec.tileM.v;
    const row = Math.floor(vM / brickY);
    const rowOffset = row % 2 === 0 ? 0 : brickX / 2;
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const uM = (x / w) * spec.tileM.u;
      const lx = (uM + rowOffset) % brickX;
      const ly = vM % brickY;
      const edgeM = Math.min(lx, brickX - lx, ly, brickY - ly);
      const joint = 1 - smoothstep(mortar * 0.4, mortar, edgeM);
      const col = Math.floor((uM + rowOffset) / brickX);
      // Variația de ardere e per cărămidă (celulă), nu per pixel.
      const bake = hash(col, row, 93);
      const spall = smoothstep(0.86, 0.95, hash(col, row, 94));
      let l = 0.5 * (0.72 + 0.5 * bake + 0.16 * (fine[i]! - 0.5) + 0.1 * (mott[i]! - 0.5));
      l *= 1 - 0.25 * spall;
      l = mix(l, 0.62, joint); // mortar mai deschis
      lum[i] = l;
      height[i] = -0.006 * joint + 0.0012 * (fine[i]! - 0.5) + 0.002 * (bake - 0.5);
      ao[i] = 1 - 0.45 * joint;
      rough[i] = mix(0.78 + 0.08 * (bake - 0.5), 0.92, joint);
    }
  }
  const albedo = packAlbedo(w, h, (i) => {
    // Roșu-cărămiziu neutru (tinta stilului vine din culoarea pe vârf / albedoColor).
    const l = lum[i]!;
    return [l * 1.06, l * 0.82, l * 0.66];
  });
  return {
    id: 'facadeBrick',
    width: w,
    height: h,
    albedo,
    normal: normalFromHeight(height, w, h, pixelMX, pixelMY),
    orm: packOrm(ao, rough),
  };
}

/** Tencuială: granulație fină, mâzgă verticală sub linia ferestrelor, pete rare de reparație. */
function genFacadePlaster(w: number, h: number): SurfaceImage {
  const spec = SURFACE_TEXTURE_SPECS.facadePlaster;
  const pixelMX = spec.tileM.u / w;
  const pixelMY = spec.tileM.v / h;
  const grain = valueNoise(w, h, w / 2, h / 2, 101);
  const mott = fbm(w, h, 4, 4, 4, 102);
  const streakField = valueNoise(w, h, w / 24, 2, 103); // constant pe verticală → dungi
  const patchField = fbm(w, h, 2, 2, 3, 104);
  const size = w * h;
  const height = new Float32Array(size);
  const ao = new Float32Array(size);
  const rough = new Float32Array(size);
  const albedo = packAlbedo(w, h, (i) => {
    const streak = smoothstep(0.56, 0.72, streakField[i]!) * 0.5;
    const patch = smoothstep(0.62, 0.7, patchField[i]!) * 0.4;
    let l = 0.72 * (0.92 + 0.14 * (mott[i]! - 0.5) + 0.07 * (grain[i]! - 0.5));
    l *= 1 - 0.12 * streak; // scurgeri mai închise
    l *= 1 + 0.08 * patch; // reparații ușor mai deschise
    return [l, l * 0.99, l * 0.95];
  });
  for (let i = 0; i < size; i += 1) {
    height[i] = 0.0009 * (grain[i]! - 0.5) + 0.0004 * (mott[i]! - 0.5);
    ao[i] = 0.94 + 0.06 * grain[i]!;
    rough[i] = 0.82 + 0.08 * (grain[i]! - 0.5) + 0.05 * smoothstep(0.56, 0.72, streakField[i]!);
  }
  return {
    id: 'facadePlaster',
    width: w,
    height: h,
    albedo,
    normal: normalFromHeight(height, w, h, pixelMX, pixelMY),
    orm: packOrm(ao, rough),
  };
}

/** Beton cofrat: panouri de 2 × 2 m cu rosturi adânci, găuri de cofraj la 1 m, variație de turnare. */
function genFacadeConcrete(w: number, h: number): SurfaceImage {
  const spec = SURFACE_TEXTURE_SPECS.facadeConcrete;
  const pixelMX = spec.tileM.u / w;
  const pixelMY = spec.tileM.v / h;
  const pour = fbm(w, h, 3, 3, 4, 111);
  const fine = valueNoise(w, h, w / 3, h / 3, 112);
  const grain = valueNoise(w, h, w / 2, h / 2, 113);
  const size = w * h;
  const height = new Float32Array(size);
  const ao = new Float32Array(size);
  const rough = new Float32Array(size);
  const lum = new Float32Array(size);
  for (let y = 0; y < h; y += 1) {
    const vM = (y / h) * spec.tileM.v;
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const uM = (x / w) * spec.tileM.u;
      const jointU = Math.min(uM % 2, 2 - (uM % 2));
      const jointV = Math.min(vM % 2, 2 - (vM % 2));
      const seam = 1 - smoothstep(0.006, 0.018, Math.min(jointU, jointV));
      // Găuri de cofraj: la 1 m în ambele axe, în afara rosturilor.
      const hx = Math.abs(((uM + 0.5) % 1) - 0.5);
      const hy = Math.abs(((vM + 0.5) % 1) - 0.5);
      const tie = 1 - smoothstep(0.012, 0.02, Math.hypot(hx, hy));
      let l =
        0.58 * (0.88 + 0.2 * (pour[i]! - 0.5) + 0.1 * (fine[i]! - 0.5) + 0.05 * (grain[i]! - 0.5));
      l *= 1 - 0.22 * seam - 0.3 * tie;
      lum[i] = l;
      height[i] = -0.008 * seam - 0.004 * tie + 0.0008 * (grain[i]! - 0.5);
      ao[i] = 1 - 0.5 * seam - 0.4 * tie;
      rough[i] = 0.74 + 0.1 * (fine[i]! - 0.5) + 0.08 * seam;
    }
  }
  const albedo = packAlbedo(w, h, (i) => {
    const l = lum[i]!;
    return [l * 1.01, l, l * 0.97];
  });
  return {
    id: 'facadeConcrete',
    width: w,
    height: h,
    albedo,
    normal: normalFromHeight(height, w, h, pixelMX, pixelMY),
    orm: packOrm(ao, rough),
  };
}

/** Generează textura `id` la rezoluția de bază `baseSize`. Determinist: aceeași intrare, aceiași octeți. */
export function generateSurfaceTexture(id: SurfaceTextureId, baseSize: number): SurfaceImage {
  if (!SURFACE_TEXTURE_SPECS[id])
    throw new Error(`Textură de suprafață necunoscută: ${String(id)}`);
  if (!Number.isInteger(baseSize) || baseSize < 64 || (baseSize & (baseSize - 1)) !== 0)
    throw new Error('Rezoluția de bază trebuie să fie o putere a lui 2, minim 64');
  const { width, height } = surfaceTextureSize(id, baseSize);
  switch (id) {
    case 'asphalt':
      return genAsphalt(width, height);
    case 'asphaltMacro':
      return genAsphaltMacro(width, height);
    case 'marking':
      return genMarking(width, height);
    case 'sidewalk':
      return genSidewalk(width, height);
    case 'curb':
      return genCurb(width, height);
    case 'grass':
      return genGrass(width, height);
    case 'wear':
      return genWear(width, height);
    case 'terrainDetail':
      return genTerrainDetail(width, height);
    case 'facadeBrick':
      return genFacadeBrick(width, height);
    case 'facadePlaster':
      return genFacadePlaster(width, height);
    case 'facadeConcrete':
      return genFacadeConcrete(width, height);
  }
}

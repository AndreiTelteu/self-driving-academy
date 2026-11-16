/**
 * PBI 244 — matematica pură (fără Babylon) a hărții de umbră care urmărește camera.
 *
 * O hartă ortografică ce urmărește camera tremură dacă originea ei se mișcă în pași mai mici decât un
 * texel: marginea umbrei „înoată" peste pixeli. Soluția clasică este alinierea pe texeli: centrul
 * hărții se rotunjește la rețeaua texelilor, în spațiul luminii. Proiecția pe axele luminii este
 * independentă de rotația camerei (centrul este un punct, nu o orientare), deci o rotație de 360° în
 * jurul unui punct fix nu mișcă deloc harta; o translație mișcă harta numai în pași întregi de texel.
 */
export type Vec3 = readonly [number, number, number];

export interface LightFrame {
  /** Direcția luminii (de la soare spre scenă), normalizată. */
  readonly forward: Vec3;
  /** Axa „dreapta" a spațiului luminii (convenția `Matrix.LookAtLH` cu sus = Y). */
  readonly right: Vec3;
  /** Axa „sus" a spațiului luminii. */
  readonly up: Vec3;
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (a: Vec3): Vec3 => {
  const length = Math.hypot(a[0], a[1], a[2]);
  if (!(length > 0) || !Number.isFinite(length)) throw new Error('Direcție de lumină invalidă');
  return [a[0] / length, a[1] / length, a[2] / length];
};

/** Baza spațiului luminii, identică cu cea a lui `Matrix.LookAtLH(eye, eye + dir, Up)`. */
export function lightFrame(direction: Vec3): LightFrame {
  const forward = normalize(direction);
  // Lumină (aproape) verticală: același ocol ca în Babylon, ca să nu degenereze produsul vectorial.
  const safe: Vec3 =
    Math.abs(forward[1]) > 0.999999 ? [forward[0], forward[1], forward[2] + 1e-9] : forward;
  const right = normalize(cross([0, 1, 0], safe));
  const up = normalize(cross(safe, right));
  return { forward: normalize(safe), right, up };
}

/** Rotunjește punctul `focus` la rețeaua texelilor (în planul luminii); adâncimea rămâne neschimbată. */
export function snapToTexelGrid(
  focus: Vec3,
  frame: LightFrame,
  halfExtentM: number,
  mapSize: number,
): Vec3 {
  if (!(halfExtentM > 0) || !(mapSize >= 1)) throw new Error('Hartă de umbră invalidă');
  const texel = (2 * halfExtentM) / mapSize;
  const r = dot(focus, frame.right);
  const u = dot(focus, frame.up);
  const dr = Math.round(r / texel) * texel - r;
  const du = Math.round(u / texel) * texel - u;
  return [
    focus[0] + frame.right[0] * dr + frame.up[0] * du,
    focus[1] + frame.right[1] * dr + frame.up[1] * du,
    focus[2] + frame.right[2] * dr + frame.up[2] * du,
  ];
}

export interface FollowShadowFrame {
  /** Poziția „ochiului" luminii (directional light `position`). */
  readonly position: Vec3;
  /** Centrul aliniat pe texeli, în lume. */
  readonly center: Vec3;
  readonly texelM: number;
  /** Planurile apropiat/îndepărtat, de la poziția ochiului, în metri. */
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * Cadrul hărții unice care urmărește camera: ochiul luminii stă `backM` în spatele centrului aliniat,
 * pe direcția soarelui, iar adâncimea acoperă `2 × backM` (casterii înalți, în amonte de soare).
 */
export function followShadowFrame(
  focus: Vec3,
  direction: Vec3,
  halfExtentM: number,
  mapSize: number,
  backM: number,
): FollowShadowFrame {
  const frame = lightFrame(direction);
  const center = snapToTexelGrid(focus, frame, halfExtentM, mapSize);
  const position: Vec3 = [
    center[0] - frame.forward[0] * backM,
    center[1] - frame.forward[1] * backM,
    center[2] - frame.forward[2] * backM,
  ];
  return {
    position,
    center,
    texelM: (2 * halfExtentM) / mapSize,
    minZ: 1,
    maxZ: 2 * backM,
  };
}

/** Punctul de pe sol (y = 0) pe care îl privește camera, limitat la `maxDistanceM` de cameră. */
export function groundFocus(position: Vec3, target: Vec3, maxDistanceM: number): Vec3 {
  const dx = target[0] - position[0];
  const dy = target[1] - position[1];
  const dz = target[2] - position[2];
  const horizontal = Math.hypot(dx, dz);
  if (horizontal < 1e-6) return [position[0], 0, position[2]];
  const toGround = dy < -1e-6 ? -position[1] / dy : Number.POSITIVE_INFINITY;
  const t = Math.min(Math.max(toGround, 0), maxDistanceM / horizontal);
  return [position[0] + dx * t, 0, position[2] + dz * t];
}

/** Hash FNV-1a pe valori rotunjite la `1/quantum`: semnătura mișcării casterilor dinamici. */
export function motionSignature(values: Iterable<number>, quantum = 1e4): number {
  let hash = 0x811c9dc5;
  for (const value of values) {
    const quantized = Math.round(value * quantum) | 0;
    hash ^= quantized & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= (quantized >>> 8) & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= (quantized >>> 16) & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= (quantized >>> 24) & 0xff;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

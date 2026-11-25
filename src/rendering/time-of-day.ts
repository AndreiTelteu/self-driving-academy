/**
 * PBI 252 — ora din zi: stări de atmosferă deterministe, interpolate lin între patru momente.
 *
 * Modulul este pur (fără Babylon, DOM sau ceas). Fiecare cheie este o intrare completă pentru
 * `createAtmosphereState`, deci cerul, ceața, IBL-ul, soarele/luna și expunerea nu pot diverge.
 * Între chei, direcția corpului ceresc se interpolează vectorial, iar culorile și intensitățile
 * liniar, cu un `smoothstep` ca tranziția să nu aibă coturi. Rezultatul este înghețat.
 *
 * Ora este o preferință de prezentare: nu scrie în simulare, KPI/XP sau determinism.
 */
import {
  DAYLIGHT_INPUT,
  createAtmosphereState,
  sunDirectionFromAngles,
  type AtmosphereInput,
  type AtmosphereState,
  type Rgb,
  type Vec3,
} from './atmosphere';

export type TimeOfDayName = 'morning' | 'noon' | 'sunset' | 'night';

export const TIME_OF_DAY_NAMES: readonly TimeOfDayName[] = Object.freeze([
  'morning',
  'noon',
  'sunset',
  'night',
]);

/** Orele fixe ale celor patru momente (pentru capturi și pentru tasta T). */
export const TIME_OF_DAY_HOURS: Readonly<Record<TimeOfDayName, number>> = Object.freeze({
  morning: 8,
  noon: 12,
  sunset: 18.7,
  night: 23,
});

export const TIME_OF_DAY_LABELS: Readonly<Record<TimeOfDayName, string>> = Object.freeze({
  morning: 'Dimineață',
  noon: 'Amiază',
  sunset: 'Apus',
  night: 'Noapte',
});

interface TimeKeyframe {
  readonly hour: number;
  readonly input: AtmosphereInput;
}

const key = (
  hour: number,
  input: Omit<
    AtmosphereInput,
    'exposure' | 'sunDirection' | 'zenithDisplay' | 'horizonDisplay' | 'ground'
  > & {
    readonly azimuthDeg: number;
    readonly elevationDeg: number;
    readonly exposure: number;
    readonly zenithDisplay: Rgb;
    readonly horizonDisplay: Rgb;
    readonly ground: Rgb;
  },
): TimeKeyframe => {
  const { azimuthDeg, elevationDeg, ...rest } = input;
  return Object.freeze({
    hour,
    input: Object.freeze({
      ...rest,
      sunDirection: sunDirectionFromAngles(azimuthDeg, elevationDeg),
    }),
  });
};

const DAY = DAYLIGHT_INPUT;

const KEYS: readonly TimeKeyframe[] = Object.freeze([
  key(0, {
    exposure: 1.75,
    azimuthDeg: 200,
    elevationDeg: 48,
    zenithDisplay: [0.014, 0.02, 0.045],
    horizonDisplay: [0.045, 0.06, 0.1],
    ground: [0.008, 0.01, 0.014],
    sunLightColor: [0.5, 0.63, 0.9],
    sunLightIntensity: 0.14,
    fogDensity: 0.00085,
    clouds: { coverage: 0.34, softness: 0.32, scale: 2.1 },
    night: 1,
    glowColor: [0.55, 0.68, 0.95],
    discRadiance: 3.2,
    discAngularRadiusDeg: 1.35,
    gradientRate: 2.7,
    mieStrength: 0.16,
    legacyAmbientIntensity: 0.1,
    environmentIntensity: 0.42,
  }),
  key(5.6, {
    exposure: 1.5,
    azimuthDeg: 92,
    elevationDeg: 5,
    zenithDisplay: [0.26, 0.38, 0.6],
    horizonDisplay: [0.95, 0.6, 0.4],
    ground: [0.05, 0.05, 0.045],
    sunLightColor: [1, 0.63, 0.4],
    sunLightIntensity: 0.48,
    fogDensity: 0.001,
    clouds: { coverage: 0.48, softness: 0.32, scale: 2.3 },
    night: 0.36,
    glowColor: [1, 0.6, 0.34],
    discRadiance: 18,
    discAngularRadiusDeg: 1.3,
    gradientRate: 3.3,
    mieStrength: 0.2,
    legacyAmbientIntensity: 0.32,
    environmentIntensity: 0.7,
  }),
  key(8, {
    exposure: 1.45,
    azimuthDeg: 105,
    elevationDeg: 28,
    zenithDisplay: [0.3, 0.53, 0.86],
    horizonDisplay: [0.8, 0.87, 0.94],
    ground: DAY.ground,
    sunLightColor: [1, 0.96, 0.88],
    sunLightIntensity: 0.92,
    fogDensity: 0.0008,
    clouds: DAY.clouds,
    night: 0,
    glowColor: [1, 0.86, 0.62],
    discRadiance: 30,
    discAngularRadiusDeg: 1.15,
    gradientRate: 3.1,
    mieStrength: 0.1,
    legacyAmbientIntensity: 0.5,
    environmentIntensity: 1,
  }),
  key(12, {
    exposure: DAY.exposure,
    // Aceleași unghiuri ca `DAYLIGHT_SUN_DIRECTION` ([-0,45; -1; 0,35] normalizat), ca amiaza
    // să rămână pixel-identică cu baseline-ul 239.
    azimuthDeg: 127.8749836510982,
    elevationDeg: 60.31306680309648,
    zenithDisplay: DAY.zenithDisplay as Rgb,
    horizonDisplay: DAY.horizonDisplay as Rgb,
    ground: DAY.ground as Rgb,
    sunLightColor: DAY.sunLightColor as Rgb,
    sunLightIntensity: DAY.sunLightIntensity,
    fogDensity: DAY.fogDensity,
    clouds: DAY.clouds,
    night: 0,
    glowColor: [1, 0.84, 0.58],
    discRadiance: 34,
    discAngularRadiusDeg: 1.15,
    gradientRate: 3.1,
    mieStrength: 0.1,
    legacyAmbientIntensity: 0.5,
    environmentIntensity: 1,
  }),
  key(16.6, {
    exposure: 1.45,
    azimuthDeg: 232,
    elevationDeg: 26,
    zenithDisplay: [0.3, 0.47, 0.78],
    horizonDisplay: [0.92, 0.8, 0.68],
    ground: [0.07, 0.07, 0.06],
    sunLightColor: [1, 0.87, 0.7],
    sunLightIntensity: 0.96,
    fogDensity: 0.00085,
    clouds: { coverage: 0.52, softness: 0.3, scale: 2.4 },
    night: 0,
    glowColor: [1, 0.78, 0.5],
    discRadiance: 32,
    discAngularRadiusDeg: 1.15,
    gradientRate: 3.1,
    mieStrength: 0.12,
    legacyAmbientIntensity: 0.5,
    environmentIntensity: 0.95,
  }),
  key(18.7, {
    exposure: 1.5,
    azimuthDeg: 268,
    elevationDeg: 4,
    zenithDisplay: [0.24, 0.3, 0.5],
    horizonDisplay: [0.98, 0.55, 0.3],
    ground: [0.05, 0.04, 0.035],
    sunLightColor: [1, 0.52, 0.3],
    sunLightIntensity: 0.52,
    fogDensity: 0.0011,
    clouds: { coverage: 0.46, softness: 0.34, scale: 2.2 },
    night: 0.32,
    glowColor: [1, 0.55, 0.3],
    discRadiance: 20,
    discAngularRadiusDeg: 1.2,
    gradientRate: 3.4,
    mieStrength: 0.22,
    legacyAmbientIntensity: 0.3,
    environmentIntensity: 0.64,
  }),
  key(20.2, {
    exposure: 1.65,
    azimuthDeg: 250,
    elevationDeg: 20,
    zenithDisplay: [0.06, 0.08, 0.16],
    horizonDisplay: [0.2, 0.19, 0.26],
    ground: [0.015, 0.016, 0.02],
    sunLightColor: [0.62, 0.6, 0.82],
    sunLightIntensity: 0.2,
    fogDensity: 0.001,
    clouds: { coverage: 0.4, softness: 0.32, scale: 2.2 },
    night: 0.86,
    glowColor: [0.8, 0.62, 0.9],
    discRadiance: 6,
    discAngularRadiusDeg: 1.3,
    gradientRate: 2.9,
    mieStrength: 0.18,
    legacyAmbientIntensity: 0.18,
    environmentIntensity: 0.52,
  }),
  key(22.4, {
    exposure: 1.75,
    azimuthDeg: 200,
    elevationDeg: 48,
    zenithDisplay: [0.014, 0.02, 0.045],
    horizonDisplay: [0.045, 0.06, 0.1],
    ground: [0.008, 0.01, 0.014],
    sunLightColor: [0.5, 0.63, 0.9],
    sunLightIntensity: 0.14,
    fogDensity: 0.00085,
    clouds: { coverage: 0.34, softness: 0.32, scale: 2.1 },
    night: 1,
    glowColor: [0.55, 0.68, 0.95],
    discRadiance: 3.2,
    discAngularRadiusDeg: 1.35,
    gradientRate: 2.7,
    mieStrength: 0.16,
    legacyAmbientIntensity: 0.1,
    environmentIntensity: 0.42,
  }),
  // 24 = 0: ora se închide, deci interpolarea de la 22,4 la 24 revine exact la starea de la 0.
  key(24, {
    exposure: 1.75,
    azimuthDeg: 200,
    elevationDeg: 48,
    zenithDisplay: [0.014, 0.02, 0.045],
    horizonDisplay: [0.045, 0.06, 0.1],
    ground: [0.008, 0.01, 0.014],
    sunLightColor: [0.5, 0.63, 0.9],
    sunLightIntensity: 0.14,
    fogDensity: 0.00085,
    clouds: { coverage: 0.34, softness: 0.32, scale: 2.1 },
    night: 1,
    glowColor: [0.55, 0.68, 0.95],
    discRadiance: 3.2,
    discAngularRadiusDeg: 1.35,
    gradientRate: 2.7,
    mieStrength: 0.16,
    legacyAmbientIntensity: 0.1,
    environmentIntensity: 0.42,
  }),
]);

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  mix(a[0], b[0], t),
  mix(a[1], b[1], t),
  mix(a[2], b[2], t),
];
const mixVec = (a: Vec3, b: Vec3, t: number): Vec3 => [
  mix(a[0], b[0], t),
  mix(a[1], b[1], t),
  mix(a[2], b[2], t),
];
const smooth = (t: number): number => t * t * (3 - 2 * t);

function normalizeHour(hour: number): number {
  if (!Number.isFinite(hour)) throw new Error('Ora din zi este invalidă');
  return ((hour % 24) + 24) % 24;
}

/** Intrarea de atmosferă pentru o oră oarecare (0..24), interpolată între chei. */
export function atmosphereInputAtHour(hour: number): AtmosphereInput {
  const value = normalizeHour(hour);
  if (value <= KEYS[0]!.hour) return KEYS[0]!.input;
  let upper = KEYS.findIndex((entry) => entry.hour >= value);
  if (upper <= 0) upper = KEYS.length - 1;
  const a = KEYS[upper - 1]!;
  const b = KEYS[upper]!;
  const span = b.hour - a.hour;
  const t = smooth(span > 0 ? Math.min(1, Math.max(0, (value - a.hour) / span)) : 0);
  const left = a.input;
  const right = b.input;
  return Object.freeze({
    exposure: mix(left.exposure, right.exposure, t),
    sunDirection: mixVec(left.sunDirection, right.sunDirection, t),
    zenithDisplay: mixRgb(left.zenithDisplay, right.zenithDisplay, t),
    horizonDisplay: mixRgb(left.horizonDisplay, right.horizonDisplay, t),
    ground: mixRgb(left.ground, right.ground, t),
    sunLightColor: mixRgb(left.sunLightColor, right.sunLightColor, t),
    sunLightIntensity: mix(left.sunLightIntensity, right.sunLightIntensity, t),
    fogDensity: mix(left.fogDensity, right.fogDensity, t),
    clouds: Object.freeze({
      coverage: mix(left.clouds.coverage, right.clouds.coverage, t),
      softness: mix(left.clouds.softness, right.clouds.softness, t),
      scale: mix(left.clouds.scale, right.clouds.scale, t),
    }),
    night: mix(left.night ?? 0, right.night ?? 0, t),
    glowColor: mixRgb(left.glowColor ?? [1, 0.84, 0.58], right.glowColor ?? [1, 0.84, 0.58], t),
    discRadiance: mix(left.discRadiance ?? 34, right.discRadiance ?? 34, t),
    discAngularRadiusDeg: mix(
      left.discAngularRadiusDeg ?? 1.15,
      right.discAngularRadiusDeg ?? 1.15,
      t,
    ),
    gradientRate: mix(left.gradientRate ?? 3.1, right.gradientRate ?? 3.1, t),
    mieStrength: mix(left.mieStrength ?? 0.1, right.mieStrength ?? 0.1, t),
    legacyAmbientIntensity: mix(
      left.legacyAmbientIntensity ?? 0.5,
      right.legacyAmbientIntensity ?? 0.5,
      t,
    ),
    environmentIntensity: mix(left.environmentIntensity ?? 1, right.environmentIntensity ?? 1, t),
  });
}

/** Starea completă de atmosferă pentru o oră (0..24). */
export function atmosphereAtHour(hour: number): AtmosphereState {
  return createAtmosphereState(atmosphereInputAtHour(hour));
}

/** Starea unui moment numit, la ora lui fixă. */
export function atmosphereAt(name: TimeOfDayName): AtmosphereState {
  return atmosphereAtHour(TIME_OF_DAY_HOURS[name]);
}

/** Următorul moment din ciclul jucătorului (morning → noon → sunset → night → morning). */
export function nextTimeOfDay(current: TimeOfDayName): TimeOfDayName {
  const index = TIME_OF_DAY_NAMES.indexOf(current);
  if (index < 0) throw new Error('Moment al zilei necunoscut');
  return TIME_OF_DAY_NAMES[(index + 1) % TIME_OF_DAY_NAMES.length]!;
}

/** Cel mai apropiat moment numit pentru o oră (folosit la pornirea din capturi). */
export function nearestTimeOfDay(hour: number): TimeOfDayName {
  const value = normalizeHour(hour);
  let best: TimeOfDayName = 'noon';
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const name of TIME_OF_DAY_NAMES) {
    const direct = Math.abs(TIME_OF_DAY_HOURS[name] - value);
    const distance = Math.min(direct, 24 - direct);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = name;
    }
  }
  return best;
}

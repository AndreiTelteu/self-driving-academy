import { QUALITY_PRESETS, type QualityPreset } from './quality-policy';

/**
 * PBI 157 — declared LOD contract for locally batched repeated objects.
 *
 * The thresholds live here, not as magic numbers inside the batch owner: the near/far decision is a
 * pure function of the batch's nearest-edge distance, its current level and the preset. Three
 * properties are part of the contract and are tested:
 *
 * - **declared bands**: `lodDistance` from the quality preset is the nominal switch distance, and
 *   the transition needs a full `LOD_HYSTERESIS_M` margin on either side;
 * - **no gap, no double draw**: exactly one level is active at every distance;
 * - **no pop**: the far level is only admitted for a distant source whose bounding sphere is not
 *   smaller than the detailed one (`assertDistantSourceCovers`), so the proxy can never make an
 *   object shrink at the switch. A batch with a larger radius keeps its detailed geometry for
 *   longer, because the distance is measured to its nearest edge.
 *
 * Edge case (documented, and asserted by the tests): a batch that is already inside
 * `nearToFarM` never switches, however wide it is — the detailed level wins. The switch is
 * therefore impossible while the object still occupies a large part of the screen.
 */
export const LOD_HYSTERESIS_M = 5;
/** A distant proxy may not be smaller than 95 % of the detailed bounding sphere. */
export const MIN_DISTANT_SOURCE_RADIUS_RATIO = 0.95;

export type BatchLodLevel = 'NEAR' | 'FAR';

export interface LodBands {
  readonly preset: QualityPreset;
  /** Nominal switch distance from the preset (nearest edge, metres). */
  readonly nominalM: number;
  /** Nearest-edge distance where the coarse level becomes eligible. */
  readonly nearToFarM: number;
  /** Nearest-edge distance where the detailed level returns. */
  readonly farToNearM: number;
  readonly hysteresisM: number;
}

export function lodBands(preset: QualityPreset): LodBands {
  const limits = QUALITY_PRESETS[preset];
  if (!limits) throw new Error('Unknown LOD preset');
  const nominalM = limits.lodDistance;
  return Object.freeze({
    preset,
    nominalM,
    nearToFarM: nominalM + LOD_HYSTERESIS_M,
    farToNearM: nominalM - LOD_HYSTERESIS_M,
    hysteresisM: LOD_HYSTERESIS_M,
  });
}

export interface BatchLodInput {
  /** Distance from the camera to the nearest edge of the batch (`distance - radius`, clamped at 0). */
  readonly edgeDistanceM: number;
  readonly current: BatchLodLevel;
  readonly preset: QualityPreset;
}

/**
 * Pure resolution of a batch level. `NEAR → FAR` needs `edgeDistanceM > nearToFarM`, `FAR → NEAR`
 * needs `edgeDistanceM <= farToNearM`; inside the band the current level is kept, so a camera
 * dithering across the boundary cannot strobe the geometry.
 */
export function resolveBatchLod(input: BatchLodInput): {
  readonly level: BatchLodLevel;
  readonly switched: boolean;
  readonly bands: LodBands;
} {
  const bands = lodBands(input.preset);
  if (!Number.isFinite(input.edgeDistanceM) || input.edgeDistanceM < 0)
    throw new Error('Invalid LOD distance');
  if (input.current !== 'NEAR' && input.current !== 'FAR') throw new Error('Invalid LOD level');
  const level: BatchLodLevel =
    input.current === 'NEAR'
      ? input.edgeDistanceM > bands.nearToFarM
        ? 'FAR'
        : 'NEAR'
      : input.edgeDistanceM <= bands.farToNearM
        ? 'NEAR'
        : 'FAR';
  return Object.freeze({ level, switched: level !== input.current, bands });
}

/**
 * Admission rule that makes the switch pop-free: the coarse proxy must cover the detailed source.
 * A caller that supplies a visibly smaller proxy is rejected instead of producing a visible shrink.
 */
export function assertDistantSourceCovers(nearRadiusM: number, farRadiusM: number): void {
  if (!Number.isFinite(nearRadiusM) || !Number.isFinite(farRadiusM) || nearRadiusM < 0)
    throw new Error('Invalid LOD bounding radius');
  if (farRadiusM < nearRadiusM * MIN_DISTANT_SOURCE_RADIUS_RATIO)
    throw new Error(
      `Distant LOD source (radius ${farRadiusM}) must cover at least ${MIN_DISTANT_SOURCE_RADIUS_RATIO * 100}% of the detailed source (radius ${nearRadiusM})`,
    );
}

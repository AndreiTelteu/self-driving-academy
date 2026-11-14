/**
 * PBI 191 — asset contract and numeric admission against the real city/vehicle scale.
 *
 * The asset declares height, eye height and arm span, but every number is re-measured from the
 * pivots and boxes and from the sampled clips. Admission compares those measurements with
 * references taken from the delivered world (sidewalk width, curb height, lane width) and from the
 * PBI 023/145 vehicle (door clearance, cabin width). A mismatch is a refusal with a closed reason.
 */
import {
  CHARACTER_CLIP_IDS,
  characterClipSpec,
  characterHeadTopM,
  characterJointFrames,
  sampleCharacterPose,
  type CharacterClipId,
} from './clips';
import { CharacterContractError } from './errors';
import { measureClipContact } from './ground';
import {
  measureSkeleton,
  scaleSkeleton,
  type CharacterScale,
  type CharacterSkeleton,
} from './skeleton';

export const CHARACTER_ASSET_VERSION = '191-character-v1' as const;

/** Human adult envelope and the margins required by the real street/vehicle references. */
export const CHARACTER_SCALE_LIMITS = Object.freeze({
  minHeightM: 1.5,
  maxHeightM: 2.0,
  minEyeHeightRatio: 0.88,
  maxEyeHeightRatio: 0.95,
  sidewalkClearanceM: 0.25,
  doorEntryMarginM: 0.05,
  curbStepMarginM: 0.01,
  cabinWidthMarginM: 0.1,
  pivotToleranceM: 1e-9,
});

export interface CharacterVehicleReference {
  readonly classId: string;
  /** Roof top above the ground contact plane: the highest surface an entering body passes under. */
  readonly doorClearanceM: number;
  /** Distance between the inner faces of the side windows. */
  readonly cabinWidthM: number;
  /** Door sill above the ground contact plane. */
  readonly sillHeightM: number;
}

export interface CharacterWorldReference {
  readonly source: string;
  readonly sidewalkWidthM: number;
  readonly curbHeightM: number;
  readonly laneWidthM: number;
  readonly vehicle: CharacterVehicleReference;
}

export interface CharacterAssetDeclaration {
  readonly heightM: number;
  readonly eyeHeightM: number;
  readonly armSpanM: number;
}

export interface CharacterMeasuredScale extends CharacterScale {
  /** Highest sole in one walk cycle: the step the character can take onto a curb. */
  readonly stepHeightM: number;
  /** Deepest crouch of `enter-vehicle`: the head height that must pass under the roof. */
  readonly entryHeightM: number;
}

export interface CharacterAsset {
  readonly id: string;
  readonly version: typeof CHARACTER_ASSET_VERSION;
  readonly skeleton: CharacterSkeleton;
  readonly scale: number;
  readonly declared: CharacterAssetDeclaration;
  readonly measured: CharacterMeasuredScale;
}

export interface CharacterAssetOptions {
  readonly id?: string;
  readonly scale?: number;
  /** Optional declared values; a lie is admitted by creation and refused by the scale check. */
  readonly declared?: Partial<CharacterAssetDeclaration>;
}

function requirePositiveFinite(value: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    throw new CharacterContractError('INVALID_ASSET', `${label} must be a positive finite number`);
  return value;
}

function stepHeightM(skeleton: CharacterSkeleton): number {
  const contact = measureClipContact(skeleton, 'walk');
  return Math.max(contact.leftSoleMaxM, contact.rightSoleMaxM);
}

function entryHeightM(skeleton: CharacterSkeleton): number {
  const spec = characterClipSpec('enter-vehicle');
  let lowest = Number.POSITIVE_INFINITY;
  for (let frame = 0; frame < spec.frames; frame += 1) {
    const pose = sampleCharacterPose(skeleton, 'enter-vehicle', frame);
    lowest = Math.min(lowest, characterHeadTopM(skeleton, characterJointFrames(skeleton, pose)));
  }
  return lowest;
}

/**
 * Deterministic asset construction. No file, no loader and no scene: the pivots are the whole
 * asset, and every declared field defaults to the measured value instead of a hand-typed constant.
 */
export function createCharacterAsset(options: CharacterAssetOptions = {}): CharacterAsset {
  const id = options.id ?? 'pedestrian-adult-01';
  if (typeof id !== 'string' || !id.trim())
    throw new CharacterContractError('INVALID_ASSET', 'asset id must be a non-empty string');
  const scale = requirePositiveFinite(options.scale ?? 1, 'scale');
  const skeleton = scaleSkeleton(scale);
  const base = measureSkeleton(skeleton);
  const measured: CharacterMeasuredScale = Object.freeze({
    ...base,
    stepHeightM: stepHeightM(skeleton),
    entryHeightM: entryHeightM(skeleton),
  });
  const declared: CharacterAssetDeclaration = Object.freeze({
    heightM: requirePositiveFinite(options.declared?.heightM ?? measured.heightM, 'heightM'),
    eyeHeightM: requirePositiveFinite(
      options.declared?.eyeHeightM ?? measured.eyeHeightM,
      'eyeHeightM',
    ),
    armSpanM: requirePositiveFinite(options.declared?.armSpanM ?? measured.armSpanM, 'armSpanM'),
  });
  return Object.freeze({
    id,
    version: CHARACTER_ASSET_VERSION,
    skeleton,
    scale,
    declared,
    measured,
  });
}

export type CharacterCompatibilityId =
  | 'DECLARATION'
  | 'HEIGHT'
  | 'EYE_HEIGHT'
  | 'SIDEWALK_FIT'
  | 'CURB_STEP'
  | 'DOOR_ENTRY'
  | 'CABIN_WIDTH'
  | 'GROUND_PIVOT'
  | 'CLIPS';

export type CharacterRefusalReason =
  | 'DECLARATION_MISMATCH'
  | 'HEIGHT_OUT_OF_RANGE'
  | 'EYE_HEIGHT_RATIO'
  | 'SIDEWALK_TOO_NARROW'
  | 'CURB_TOO_HIGH'
  | 'DOOR_TOO_LOW'
  | 'CABIN_TOO_NARROW'
  | 'GROUND_PIVOT_MISMATCH'
  | 'CLIP_CONTRACT';

export interface CharacterCompatibilityCheck {
  readonly id: CharacterCompatibilityId;
  readonly label: string;
  /** Measured value, in metres or as a ratio (see `unit`). */
  readonly actual: number;
  /** World or rule reference the measurement is compared with. */
  readonly reference: number;
  readonly tolerance: number;
  readonly unit: 'm' | 'ratio' | 'count';
  readonly pass: boolean;
  readonly refusal: CharacterRefusalReason | null;
  readonly detail: string;
}

export interface CharacterCompatibility {
  readonly accepted: boolean;
  readonly checks: readonly CharacterCompatibilityCheck[];
  readonly refusals: readonly CharacterRefusalReason[];
  readonly reference: CharacterWorldReference;
}

function check(
  id: CharacterCompatibilityId,
  label: string,
  actual: number,
  reference: number,
  tolerance: number,
  unit: CharacterCompatibilityCheck['unit'],
  pass: boolean,
  refusal: CharacterRefusalReason,
  detail: string,
): CharacterCompatibilityCheck {
  return Object.freeze({
    id,
    label,
    actual,
    reference,
    tolerance,
    unit,
    pass,
    refusal: pass ? null : refusal,
    detail,
  });
}

function requireReference(reference: CharacterWorldReference): void {
  const values = [
    reference.sidewalkWidthM,
    reference.curbHeightM,
    reference.laneWidthM,
    reference.vehicle.doorClearanceM,
    reference.vehicle.cabinWidthM,
    reference.vehicle.sillHeightM,
  ];
  if (!values.every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0))
    throw new CharacterContractError('INVALID_ASSET', 'invalid world reference');
  if (!reference.source.trim())
    throw new CharacterContractError('INVALID_ASSET', 'world reference needs a source');
}

/** Numeric admission of an asset against the delivered world; never a visual judgement. */
export function checkCharacterCompatibility(
  asset: CharacterAsset,
  reference: CharacterWorldReference,
): CharacterCompatibility {
  requireReference(reference);
  const limits = CHARACTER_SCALE_LIMITS;
  const measured = asset.measured;
  const checks: CharacterCompatibilityCheck[] = [];
  const declarationDelta = Math.max(
    Math.abs(asset.declared.heightM - measured.heightM),
    Math.abs(asset.declared.eyeHeightM - measured.eyeHeightM),
    Math.abs(asset.declared.armSpanM - measured.armSpanM),
  );
  checks.push(
    check(
      'DECLARATION',
      'Declarație vs. măsurătoare (înălțime, ochi, anvergură)',
      declarationDelta,
      0,
      limits.pivotToleranceM,
      'm',
      declarationDelta <= limits.pivotToleranceM,
      'DECLARATION_MISMATCH',
      `height ${measured.heightM.toFixed(3)} m, eye ${measured.eyeHeightM.toFixed(3)} m, span ${measured.armSpanM.toFixed(3)} m`,
    ),
  );
  checks.push(
    check(
      'HEIGHT',
      'Înălțime totală în intervalul uman',
      measured.heightM,
      limits.minHeightM,
      limits.maxHeightM - limits.minHeightM,
      'm',
      measured.heightM >= limits.minHeightM && measured.heightM <= limits.maxHeightM,
      'HEIGHT_OUT_OF_RANGE',
      `interval admis ${limits.minHeightM.toFixed(2)}–${limits.maxHeightM.toFixed(2)} m`,
    ),
  );
  const eyeRatio = measured.eyeHeightM / measured.heightM;
  checks.push(
    check(
      'EYE_HEIGHT',
      'Raport înălțime ochi / înălțime totală',
      eyeRatio,
      limits.minEyeHeightRatio,
      limits.maxEyeHeightRatio - limits.minEyeHeightRatio,
      'ratio',
      eyeRatio >= limits.minEyeHeightRatio && eyeRatio <= limits.maxEyeHeightRatio,
      'EYE_HEIGHT_RATIO',
      `interval admis ${limits.minEyeHeightRatio}–${limits.maxEyeHeightRatio}`,
    ),
  );
  const requiredWidth = measured.shoulderWidthM + 2 * limits.sidewalkClearanceM;
  checks.push(
    check(
      'SIDEWALK_FIT',
      'Lățime necesară pe trotuar (umeri + marjă)',
      requiredWidth,
      reference.sidewalkWidthM,
      0,
      'm',
      requiredWidth <= reference.sidewalkWidthM,
      'SIDEWALK_TOO_NARROW',
      `trotuar real ${reference.sidewalkWidthM.toFixed(2)} m`,
    ),
  );
  checks.push(
    check(
      'CURB_STEP',
      'Pas maxim din mers față de înălțimea bordurii',
      measured.stepHeightM,
      reference.curbHeightM,
      limits.curbStepMarginM,
      'm',
      measured.stepHeightM >= reference.curbHeightM + limits.curbStepMarginM,
      'CURB_TOO_HIGH',
      `bordură reală ${reference.curbHeightM.toFixed(2)} m + marjă ${limits.curbStepMarginM} m`,
    ),
  );
  const requiredEntry = measured.entryHeightM + limits.doorEntryMarginM;
  checks.push(
    check(
      'DOOR_ENTRY',
      'Înălțime de intrare în vehicul (ghemuit) + marjă',
      requiredEntry,
      reference.vehicle.doorClearanceM,
      0,
      'm',
      requiredEntry <= reference.vehicle.doorClearanceM,
      'DOOR_TOO_LOW',
      `ușă ${reference.vehicle.classId} ${reference.vehicle.doorClearanceM.toFixed(2)} m`,
    ),
  );
  const requiredCabin = measured.hipWidthM + limits.cabinWidthMarginM;
  checks.push(
    check(
      'CABIN_WIDTH',
      'Lățime șolduri + marjă față de cabina reală',
      requiredCabin,
      reference.vehicle.cabinWidthM,
      0,
      'm',
      requiredCabin <= reference.vehicle.cabinWidthM,
      'CABIN_TOO_NARROW',
      `cabină ${reference.vehicle.classId} ${reference.vehicle.cabinWidthM.toFixed(3)} m`,
    ),
  );
  checks.push(
    check(
      'GROUND_PIVOT',
      'Pivotul cel mai de jos stă pe planul solului',
      Math.abs(measured.lowestRestPointM),
      0,
      limits.pivotToleranceM,
      'm',
      Math.abs(measured.lowestRestPointM) <= limits.pivotToleranceM,
      'GROUND_PIVOT_MISMATCH',
      `cel mai de jos punct la repaus ${measured.lowestRestPointM.toFixed(6)} m`,
    ),
  );
  const clipsValid = CHARACTER_CLIP_IDS.every((clipId: CharacterClipId) => {
    const spec = characterClipSpec(clipId);
    return (
      spec.frames >= 12 &&
      Number.isSafeInteger(spec.frames) &&
      spec.loop === (spec.kind !== 'TRANSITION')
    );
  });
  checks.push(
    check(
      'CLIPS',
      'Clipuri idle/walk/run/enter-vehicle/exit-vehicle complete',
      CHARACTER_CLIP_IDS.length,
      CHARACTER_CLIP_IDS.length,
      0,
      'count',
      clipsValid,
      'CLIP_CONTRACT',
      `${CHARACTER_CLIP_IDS.length} clipuri, eșantionare 60 Hz`,
    ),
  );
  const refusals = checks.filter((entry) => !entry.pass).map((entry) => entry.refusal!);
  return Object.freeze({
    accepted: refusals.length === 0,
    checks: Object.freeze(checks),
    refusals: Object.freeze(refusals),
    reference,
  });
}

/** Admission gate: an incompatible asset throws instead of being rendered at a wrong scale. */
export function requireCharacterCompatibility(
  asset: CharacterAsset,
  reference: CharacterWorldReference,
): CharacterCompatibility {
  const result = checkCharacterCompatibility(asset, reference);
  if (!result.accepted)
    throw new CharacterContractError(
      'ASSET_REFUSED',
      `${asset.id} refused: ${result.refusals.join(', ')}`,
    );
  return result;
}

/** All measured values an evidence report needs, in one frozen record. */
export function characterScaleTable(asset: CharacterAsset): readonly Readonly<{
  metric: string;
  value: number;
  unit: string;
}>[] {
  const measured = asset.measured;
  return Object.freeze([
    Object.freeze({ metric: 'Înălțime totală', value: measured.heightM, unit: 'm' }),
    Object.freeze({ metric: 'Înălțime ochi', value: measured.eyeHeightM, unit: 'm' }),
    Object.freeze({ metric: 'Anvergură brațe', value: measured.armSpanM, unit: 'm' }),
    Object.freeze({ metric: 'Lățime umeri', value: measured.shoulderWidthM, unit: 'm' }),
    Object.freeze({ metric: 'Lățime șolduri', value: measured.hipWidthM, unit: 'm' }),
    Object.freeze({ metric: 'Amprentă lățime', value: measured.footprintWidthM, unit: 'm' }),
    Object.freeze({ metric: 'Amprentă adâncime', value: measured.footprintDepthM, unit: 'm' }),
    Object.freeze({ metric: 'Înălțime șold', value: measured.hipHeightM, unit: 'm' }),
    Object.freeze({ metric: 'Lungime picior (șold–talpă)', value: measured.legReachM, unit: 'm' }),
    Object.freeze({ metric: 'Talpă sub gleznă', value: measured.ankleToSoleM, unit: 'm' }),
    Object.freeze({ metric: 'Pas maxim (mers)', value: measured.stepHeightM, unit: 'm' }),
    Object.freeze({
      metric: 'Înălțime la intrarea în mașină',
      value: measured.entryHeightM,
      unit: 'm',
    }),
    Object.freeze({
      metric: 'Punctul cel mai de jos la repaus',
      value: measured.lowestRestPointM,
      unit: 'm',
    }),
  ]);
}

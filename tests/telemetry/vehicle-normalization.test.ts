import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NORMALIZATION_CAPACITY,
  NORMALIZATION_EQUALITY_TOLERANCE,
  NORMALIZATION_RECORDER_RAM_BYTES,
  NORMALIZATION_RECORD_BYTES_CEILING,
  NORMALIZATION_SATURATION_FRACTION,
  capabilityLimitChannels,
  createArtifactFilter,
  createEligibilityWindows,
  createOpportunityRegistry,
  createVehicleNormalizer,
  mechanicalCapabilities,
  normalizationPercentile,
  normalizationRefusals,
  type CapabilityLimitedVehicleNormalization,
  type EligibilityWindowRecord,
  type FilteredWindowRecord,
  type IntentionalVehicleNormalization,
  type NormalizationObservation,
  type VehicleNormalizationRecord,
  type VehicleNormalizationSample,
} from '../../src/telemetry/index.ts';
import { createRapierProbe } from '../../src/vehicles/rapier';
import { tractiveForceN, vehicleClass } from '../../src/vehicles';
import type { VehicleClassId } from '../../src/vehicles';
import { createStableId } from '../../src/sessions';
import {
  compileLateralTrajectory,
  compileLongitudinalProfile,
  createLateralController,
  createLongitudinalController,
} from '../../src/autonomy';
import { createLongitudinalTargetFixture } from '../autonomy/longitudinal-target-fixture';
import { longitudinalProfile, longitudinalValues } from '../autonomy/longitudinal-reference';
import { lateralFixture } from '../autonomy/lateral-controller-reference';

const SESSION = '089-normalization';
const EPOCH = 0;
const SEGMENT = 'seg-089';
const VEHICLE = 'taxi';
const INCARNATION = 'taxi-1';
const WORLD = { sessionId: SESSION, worldEpoch: EPOCH };

const capOf = (classId: VehicleClassId) => mechanicalCapabilities(classId);

/**
 * A real 087 record: the window is observed at tick 1 and at `lastTick`, so its own span covers the
 * ride. Every classification fact is a real 087 input.
 */
function eligibilityWindow(
  overrides: {
    readonly classId?: VehicleClassId;
    readonly lastTick?: number;
    readonly opportunityId?: string;
    readonly learningEligible?: boolean;
    readonly controlMode?: 'LEARNING' | 'MANUAL' | 'AUTO';
    readonly demandedAccelerationMps2?: number;
  } = {},
): EligibilityWindowRecord {
  const layer = createEligibilityWindows();
  const base = {
    sessionId: SESSION,
    worldEpoch: EPOCH,
    opportunityId: overrides.opportunityId ?? 'opportunity-1',
    kind: 'GREEN' as const,
    vehicleId: VEHICLE,
    incarnation: INCARNATION,
    segmentId: SEGMENT,
    controlMode: overrides.controlMode ?? ('LEARNING' as const),
    learningEligible: overrides.learningEligible ?? true,
    classId: overrides.classId ?? ('sedan' as const),
    suspension: 'NONE' as const,
    visibility: { source: 'CONTROLLED_FIXTURE' as const, observable: true },
    leader: null,
    signal: null,
    greenExit: null,
    mechanical:
      overrides.demandedAccelerationMps2 === undefined
        ? null
        : {
            demandedLongitudinalAccelerationMps2: overrides.demandedAccelerationMps2,
            demandedLateralAccelerationMps2: 0,
          },
    impact: null,
  };
  layer.observe({ ...base, tick: 1 });
  const lastTick = Math.max(1, overrides.lastTick ?? 100);
  const record = layer.observe({ ...base, tick: lastTick });
  layer.dispose();
  return record;
}

/** A real 088 record over the same segment; every discontinuity is a real 088 input fact. */
function artifactWindow(
  overrides: {
    readonly tick?: number;
    readonly startTick?: number;
    readonly endTick?: number;
    readonly collisionTick?: number | null;
    readonly lostCheckpointTick?: number | null;
  } = {},
): FilteredWindowRecord {
  const layer = createArtifactFilter();
  const startTick = overrides.startTick ?? 1;
  const endTick = overrides.endTick ?? 100;
  const tick = overrides.tick ?? Math.max(startTick + 1, endTick);
  const record = layer.evaluate({
    tick,
    sessionId: SESSION,
    worldEpoch: EPOCH,
    segmentId: SEGMENT,
    vehicleId: VEHICLE,
    incarnation: INCARNATION,
    controlMode: 'LEARNING',
    learningEligible: true,
    startTick,
    endTick,
    segmentCompleteness: 'CLOSED',
    closeReason: 'RIDE_COMPLETED',
    lostCheckpointTick: overrides.lostCheckpointTick ?? null,
    observationLoss: null,
    collisions:
      overrides.collisionTick === undefined || overrides.collisionTick === null
        ? []
        : [
            {
              tick: overrides.collisionTick,
              incidentId: 'incident-089',
              impulseNs: 900,
              otherEntityId: 'wall',
            },
          ],
    recoveries: [],
    suspensions: [],
  });
  layer.dispose();
  return record;
}

/**
 * A synthetic but coherent style: the realized demand is the requested demand fraction times the
 * class's own ceiling, which is exactly what the 023/085 drivetrain and grip produce.
 */
function styleSamples(params: {
  readonly classId: VehicleClassId;
  readonly count: number;
  readonly accelerationFraction?: number;
  readonly decelerationFraction?: number;
  readonly lateralFraction?: number;
  readonly fromTick?: number;
}): VehicleNormalizationSample[] {
  const capability = capOf(params.classId);
  const fromTick = params.fromTick ?? 1;
  return Array.from({ length: params.count }, (_, index) => {
    const acceleration = params.accelerationFraction ?? 0;
    const deceleration = params.decelerationFraction ?? 0;
    const lateral = params.lateralFraction ?? 0;
    return Object.freeze({
      tick: fromTick + index,
      longitudinalAccelerationMps2:
        acceleration * capability.maxAccelerationMps2 -
        deceleration * capability.maxDecelerationMps2,
      lateralAccelerationMps2: lateral * capability.maxLateralAccelerationMps2,
      throttle: acceleration,
      brake: deceleration,
      steering: 0,
    });
  });
}

function observation(params: {
  readonly classId: VehicleClassId;
  readonly eligibility: EligibilityWindowRecord;
  readonly artifacts: FilteredWindowRecord;
  readonly samples: readonly VehicleNormalizationSample[];
  readonly tick?: number;
}): NormalizationObservation {
  return {
    tick: params.tick ?? 400,
    sessionId: SESSION,
    worldEpoch: EPOCH,
    segmentId: SEGMENT,
    vehicleId: VEHICLE,
    incarnation: INCARNATION,
    classId: params.classId,
    eligibility: params.eligibility,
    artifacts: params.artifacts,
    samples: params.samples,
  };
}

function normalized(record: VehicleNormalizationRecord): IntentionalVehicleNormalization {
  assert.equal(
    record.windowClass,
    'NORMALIZED',
    `expected a normalized window, got ${record.windowClass}/${'refusal' in record ? record.refusal : ''}`,
  );
  assert.equal(record.demandStatus, 'INTENTIONAL');
  return record as IntentionalVehicleNormalization;
}

function isNormalized(
  record: VehicleNormalizationRecord,
): record is IntentionalVehicleNormalization | CapabilityLimitedVehicleNormalization {
  return record.windowClass === 'NORMALIZED';
}

// ---------------------------------------------------------------------------------------------
// Criterion 1: the class's maximum acceleration does not by itself determine aggressiveness.
// ---------------------------------------------------------------------------------------------

test('089 the same command and style in a sedan and a compact yield the same normalized demand while the raw values keep the 023 class difference', () => {
  const normalizer = createVehicleNormalizer();
  try {
    // One style: p90 acceleration demand 0.6, no braking, no cornering. The realized values differ
    // only through the class ceiling, which is exactly what 023/031 document.
    const sedan = normalized(
      normalizer.observe(
        observation({
          classId: 'sedan',
          eligibility: eligibilityWindow({ classId: 'sedan' }),
          artifacts: artifactWindow(),
          samples: styleSamples({ classId: 'sedan', count: 20, accelerationFraction: 0.6 }),
        }),
      ),
    );
    const compact = normalized(
      normalizer.observe(
        observation({
          classId: 'compact',
          eligibility: eligibilityWindow({ classId: 'compact' }),
          artifacts: artifactWindow(),
          samples: styleSamples({ classId: 'compact', count: 20, accelerationFraction: 0.6 }),
        }),
      ),
    );

    // Criterion 1: the normalized aggressiveness is the same within the documented tolerance.
    assert.ok(
      Math.abs(sedan.features.aggressiveness - compact.features.aggressiveness) <=
        NORMALIZATION_EQUALITY_TOLERANCE,
      `normalized aggressiveness differs: ${sedan.features.aggressiveness} vs ${compact.features.aggressiveness}`,
    );
    assert.ok(
      Math.abs(sedan.features.accelerationDemand - 0.6) <= NORMALIZATION_EQUALITY_TOLERANCE,
    );
    assert.ok(
      Math.abs(compact.features.accelerationDemand - 0.6) <= NORMALIZATION_EQUALITY_TOLERANCE,
    );
    assert.equal(sedan.features.aggressivenessIsLowerBound, false);
    assert.equal(compact.features.aggressivenessIsLowerBound, false);
    assert.equal(sedan.capabilityMarks.length, 0);
    assert.equal(compact.capabilityMarks.length, 0);

    // ...while the raw accelerations differ by exactly the 023 mechanical difference.
    const sedanRaw = sedan.features.raw.longitudinalAccelerationMps2;
    const compactRaw = compact.features.raw.longitudinalAccelerationMps2;
    assert.ok(
      compactRaw > sedanRaw,
      `the compact must accelerate harder: ${compactRaw} vs ${sedanRaw}`,
    );
    const predicted = capOf('compact').maxAccelerationMps2 / capOf('sedan').maxAccelerationMps2;
    const measured = compactRaw / sedanRaw;
    assert.ok(
      Math.abs(measured - predicted) < 0.01,
      `raw ratio ${measured} does not match the 023 prediction ${predicted}`,
    );
    assert.ok(Math.abs(sedanRaw - 0.6 * capOf('sedan').maxAccelerationMps2) < 1e-9);
    assert.ok(Math.abs(compactRaw - 0.6 * capOf('compact').maxAccelerationMps2) < 1e-9);
    // The class-independent intent is identical, because the command is identical.
    assert.equal(sedan.features.intent.throttle, compact.features.intent.throttle);
    // The car with the lower ceiling is not read as prudent: the same style is the same demand.
    assert.ok(capOf('sedan').maxAccelerationMps2 < capOf('compact').maxAccelerationMps2);
    assert.equal(sedan.features.accelerationDemand, compact.features.accelerationDemand);
  } finally {
    normalizer.dispose();
  }
});

test('089 the ranking follows the style, not the class ceiling', () => {
  const normalizer = createVehicleNormalizer();
  try {
    const drive = (classId: VehicleClassId, fraction: number, opportunityId: string) =>
      normalized(
        normalizer.observe(
          observation({
            classId,
            eligibility: eligibilityWindow({ classId, opportunityId }),
            artifacts: artifactWindow(),
            samples: styleSamples({ classId, count: 20, accelerationFraction: fraction }),
          }),
        ),
      );
    // A hard-accelerating compact and a gently-accelerating sedan: the normalized ranking follows the
    // style, and it is not merely the class ceiling.
    const hardCompact = drive('compact', 0.9, 'opportunity-hard-compact');
    const gentleSedan = drive('sedan', 0.3, 'opportunity-gentle-sedan');
    assert.ok(hardCompact.features.aggressiveness > gentleSedan.features.aggressiveness);

    // The discriminating pair: the class with the LOWER ceiling (sedan) outranks the class with the
    // higher ceiling (compact) because it is driven harder. A ceiling-only ranking, and even the raw
    // accelerations, would invert this.
    const hardSedan = drive('sedan', 0.85, 'opportunity-hard-sedan');
    const gentleCompact = drive('compact', 0.7, 'opportunity-gentle-compact');
    assert.ok(capOf('compact').maxAccelerationMps2 > capOf('sedan').maxAccelerationMps2);
    assert.ok(
      hardSedan.features.aggressiveness > gentleCompact.features.aggressiveness,
      `the style must win: ${hardSedan.features.aggressiveness} vs ${gentleCompact.features.aggressiveness}`,
    );
    assert.ok(hardSedan.features.accelerationDemand > gentleCompact.features.accelerationDemand);
    // A raw-only comparison would have ranked the compact above the sedan in this pair.
    assert.ok(
      hardSedan.features.raw.longitudinalAccelerationMps2 <
        gentleCompact.features.raw.longitudinalAccelerationMps2,
      'the raw values invert the normalized ranking, which is the point',
    );
  } finally {
    normalizer.dispose();
  }
});

// ---------------------------------------------------------------------------------------------
// Criterion 2: mechanically limited data are explicitly marked for the estimator.
// ---------------------------------------------------------------------------------------------

test('089 a demand that saturates the class capability is marked CAPABILITY_LIMITED with the limiting channel and cannot be read as a deliberate style', () => {
  const normalizer = createVehicleNormalizer();
  try {
    const saturated = normalizer.observe(
      observation({
        classId: 'compact',
        eligibility: eligibilityWindow({ classId: 'compact' }),
        artifacts: artifactWindow(),
        samples: styleSamples({ classId: 'compact', count: 10, accelerationFraction: 1 }),
      }),
    );
    assert.equal(saturated.windowClass, 'NORMALIZED');
    assert.equal(saturated.demandStatus, 'CAPABILITY_LIMITED');
    const limited = saturated as CapabilityLimitedVehicleNormalization;
    assert.equal(limited.limitingChannel, 'LONGITUDINAL_ACCELERATION');
    assert.equal(limited.capabilityMarks.length, 1);
    const [mark] = limited.capabilityMarks;
    assert.equal(mark.reason, 'CAPABILITY_LIMITED');
    assert.equal(mark.channel, 'LONGITUDINAL_ACCELERATION');
    assert.equal(mark.limitMps2, capOf('compact').maxAccelerationMps2);
    assert.equal(mark.saturatedTicks, 10);
    assert.equal(mark.sampledTicks, 10);
    assert.equal(mark.saturationFraction, NORMALIZATION_SATURATION_FRACTION);
    assert.ok(mark.peakFraction >= NORMALIZATION_SATURATION_FRACTION);
    // The feature is explicitly a lower bound, never a measured choice.
    assert.equal(limited.features.aggressivenessIsLowerBound, true);

    // The runtime gate: a saturated window cannot become an intent feature at all.
    assert.throws(
      () => normalizer.emitIntentFeature(limited as unknown as IntentionalVehicleNormalization),
      /intentional, non-saturated/,
    );
    assert.equal(normalizer.getDenominators().intentRefused, 1);
    assert.equal(normalizer.getDenominators().intentEmitted, 0);

    // A deliberate mild style is the opposite: no marks, and it can be emitted.
    const mild = normalized(
      normalizer.observe(
        observation({
          tick: 401,
          classId: 'compact',
          eligibility: eligibilityWindow({ classId: 'compact', opportunityId: 'opportunity-mild' }),
          artifacts: artifactWindow(),
          samples: styleSamples({ classId: 'compact', count: 10, accelerationFraction: 0.2 }),
        }),
      ),
    );
    assert.equal(mild.capabilityMarks.length, 0);
    assert.equal(mild.features.aggressivenessIsLowerBound, false);
    const feature = normalizer.emitIntentFeature(mild);
    assert.equal(feature.demandStatus, 'INTENTIONAL');
    assert.ok(Math.abs(feature.aggressiveness - 0.2) < 1e-9);
    assert.equal(normalizer.getDenominators().intentEmitted, 1);

    // Braking and cornering have their own closed channels.
    const braking = normalizer.observe(
      observation({
        tick: 402,
        classId: 'sedan',
        eligibility: eligibilityWindow({ classId: 'sedan', opportunityId: 'opportunity-brake' }),
        artifacts: artifactWindow(),
        samples: styleSamples({ classId: 'sedan', count: 8, decelerationFraction: 1 }),
      }),
    );
    assert.equal(braking.windowClass, 'NORMALIZED');
    assert.equal(braking.demandStatus, 'CAPABILITY_LIMITED');
    assert.equal(
      (braking as CapabilityLimitedVehicleNormalization).limitingChannel,
      'LONGITUDINAL_DECELERATION',
    );
    const cornering = normalizer.observe(
      observation({
        tick: 403,
        classId: 'sedan',
        eligibility: eligibilityWindow({ classId: 'sedan', opportunityId: 'opportunity-corner' }),
        artifacts: artifactWindow(),
        samples: styleSamples({ classId: 'sedan', count: 8, lateralFraction: 1 }),
      }),
    );
    assert.equal((cornering as CapabilityLimitedVehicleNormalization).limitingChannel, 'LATERAL');

    // A single transient tick is not a sustained saturation and never raises a mark.
    const transientSamples = styleSamples({
      classId: 'sedan',
      count: 20,
      accelerationFraction: 1,
    }).map((sample, index) =>
      index < 1 ? sample : Object.freeze({ ...sample, longitudinalAccelerationMps2: 1 }),
    );
    const transient = normalized(
      normalizer.observe(
        observation({
          tick: 404,
          classId: 'sedan',
          eligibility: eligibilityWindow({
            classId: 'sedan',
            opportunityId: 'opportunity-transient',
          }),
          artifacts: artifactWindow(),
          samples: transientSamples,
        }),
      ),
    );
    assert.equal(transient.capabilityMarks.length, 0);
    assert.equal(transient.features.aggressivenessIsLowerBound, false);

    const denominators = normalizer.getDenominators();
    assert.equal(denominators.capabilityLimited, 3);
    for (const channel of capabilityLimitChannels)
      assert.equal(denominators.byChannel.find((entry) => entry.channel === channel)?.count, 1);
  } finally {
    normalizer.dispose();
  }
});

// ---------------------------------------------------------------------------------------------
// Composition with 087 and 088.
// ---------------------------------------------------------------------------------------------

test('089 composes with 087 and 088: only an eligible, usable prefix is normalized and the 088 degree is carried through', () => {
  const normalizer = createVehicleNormalizer();
  try {
    // 088 PARTIAL: a collision at tick 6 leaves the prefix [1, 5] usable. The suppressed ticks are
    // hard; only the prefix may set the feature, which is why the demand stays the prefix's.
    const partial = normalized(
      normalizer.observe(
        observation({
          classId: 'sedan',
          eligibility: eligibilityWindow({ classId: 'sedan' }),
          artifacts: artifactWindow({ collisionTick: 6 }),
          samples: [
            ...styleSamples({ classId: 'sedan', count: 5, accelerationFraction: 0.2 }),
            ...styleSamples({
              classId: 'sedan',
              count: 5,
              accelerationFraction: 1,
              fromTick: 6,
            }),
          ],
        }),
      ),
    );
    assert.equal(partial.completeness, 'PARTIAL');
    assert.equal(partial.completenessReason, 'TRUNCATED_BY_ARTIFACT');
    assert.equal(partial.usableFromTick, 1);
    assert.equal(partial.usableToTick, 5);
    assert.equal(partial.usableTicks, 5);
    assert.equal(partial.sampledTicks, 5);
    assert.equal(partial.sampleCoverage, 1);
    assert.ok(Math.abs(partial.features.accelerationDemand - 0.2) < 1e-9);
    assert.equal(partial.demandStatus, 'INTENTIONAL', 'the suppressed ticks are not demand');

    // The 087 own span also bounds the usable samples: the intersection wins.
    const bounded = normalized(
      normalizer.observe(
        observation({
          tick: 401,
          classId: 'sedan',
          eligibility: eligibilityWindow({
            classId: 'sedan',
            opportunityId: 'opportunity-bounded',
            lastTick: 30,
          }),
          artifacts: artifactWindow(),
          samples: styleSamples({ classId: 'sedan', count: 60, accelerationFraction: 0.4 }),
        }),
      ),
    );
    assert.equal(bounded.usableToTick, 30);
    assert.equal(bounded.sampledTicks, 30);
    assert.equal(bounded.usableTicks, 30);

    // 088 FULLY_SUPPRESSED: no tick is usable, so there is no feature at all.
    const suppressed = normalizer.observe(
      observation({
        tick: 402,
        classId: 'sedan',
        eligibility: eligibilityWindow({
          classId: 'sedan',
          opportunityId: 'opportunity-suppressed',
        }),
        artifacts: artifactWindow({ collisionTick: 1 }),
        samples: styleSamples({ classId: 'sedan', count: 10, accelerationFraction: 0.5 }),
      }),
    );
    assert.equal(suppressed.windowClass, 'REFUSED');
    assert.equal(suppressed.refusal, 'WINDOW_FULLY_SUPPRESSED');
    assert.equal(suppressed.features, null);
    assert.equal(suppressed.capabilityMarks.length, 0);

    // 088 TRUNCATED: a lost checkpoint is never normalized as if it were complete.
    const truncated = normalizer.observe(
      observation({
        tick: 403,
        classId: 'sedan',
        eligibility: eligibilityWindow({
          classId: 'sedan',
          opportunityId: 'opportunity-truncated',
        }),
        artifacts: artifactWindow({ lostCheckpointTick: 50 }),
        samples: styleSamples({ classId: 'sedan', count: 10, accelerationFraction: 0.5 }),
      }),
    );
    assert.equal(truncated.windowClass, 'REFUSED');
    assert.equal(truncated.refusal, 'WINDOW_TRUNCATED');
    assert.equal(truncated.completeness, 'TRUNCATED');

    // 087 EXTERNAL_CONSTRAINT: a declared demand beyond the class capability is a mechanical limit,
    // not preference evidence, so 089 refuses it instead of normalizing it.
    const constrained = normalizer.observe(
      observation({
        tick: 404,
        classId: 'sedan',
        eligibility: eligibilityWindow({
          classId: 'sedan',
          opportunityId: 'opportunity-constrained',
          demandedAccelerationMps2: 50,
        }),
        artifacts: artifactWindow(),
        samples: styleSamples({ classId: 'sedan', count: 10, accelerationFraction: 0.5 }),
      }),
    );
    assert.equal(constrained.windowClass, 'REFUSED');
    assert.equal(constrained.refusal, 'NOT_ELIGIBLE_WINDOW');
    assert.equal(constrained.eligibilityClass, 'EXTERNAL_CONSTRAINT');
    assert.equal(constrained.features, null);

    // 087 EXCLUDED: a MANUAL segment is never normalized.
    const manual = normalizer.observe(
      observation({
        tick: 405,
        classId: 'sedan',
        eligibility: eligibilityWindow({
          classId: 'sedan',
          opportunityId: 'opportunity-manual',
          learningEligible: false,
          controlMode: 'MANUAL',
        }),
        artifacts: artifactWindow(),
        samples: styleSamples({ classId: 'sedan', count: 10, accelerationFraction: 0.5 }),
      }),
    );
    assert.equal(manual.windowClass, 'REFUSED');
    assert.equal(manual.refusal, 'NOT_ELIGIBLE_WINDOW');
    assert.equal(manual.eligibilityClass, 'EXCLUDED');

    // Insufficient evidence and an empty prefix have their own closed reasons.
    const insufficient = normalizer.observe(
      observation({
        tick: 406,
        classId: 'sedan',
        eligibility: eligibilityWindow({
          classId: 'sedan',
          opportunityId: 'opportunity-short',
        }),
        artifacts: artifactWindow(),
        samples: styleSamples({ classId: 'sedan', count: 2, accelerationFraction: 0.5 }),
      }),
    );
    assert.equal(insufficient.windowClass, 'REFUSED');
    assert.equal(insufficient.refusal, 'INSUFFICIENT_SAMPLES');
    const empty = normalizer.observe(
      observation({
        tick: 407,
        classId: 'sedan',
        eligibility: eligibilityWindow({
          classId: 'sedan',
          opportunityId: 'opportunity-empty',
        }),
        artifacts: artifactWindow(),
        samples: [],
      }),
    );
    assert.equal(empty.windowClass, 'REFUSED');
    assert.equal(empty.refusal, 'NO_USABLE_SAMPLES');

    const denominators = normalizer.getDenominators();
    for (const refusal of normalizationRefusals)
      assert.ok(
        denominators.byRefusal.some((entry) => entry.refusal === refusal),
        `refusal ${refusal} is declared`,
      );
    assert.equal(denominators.normalized, 2);
    assert.equal(denominators.refused, 6);
    assert.equal(denominators.total, denominators.normalized + denominators.refused);

    // A later truncation downgrades an already normalized window instead of leaving stale features.
    const downgraded = normalizer.observe(
      observation({
        tick: 408,
        classId: 'sedan',
        eligibility: eligibilityWindow({ classId: 'sedan' }),
        artifacts: artifactWindow({ lostCheckpointTick: 50 }),
        samples: styleSamples({ classId: 'sedan', count: 5, accelerationFraction: 0.2 }),
      }),
    );
    assert.equal(downgraded.windowClass, 'REFUSED');
    assert.equal(normalizer.getStats().downgradedTotal, 1);
    assert.equal(isNormalized(normalizer.getWindow('opportunity-1')!), false);
  } finally {
    normalizer.dispose();
  }
});

// ---------------------------------------------------------------------------------------------
// Determinism, bounds, ownership and malformed input.
// ---------------------------------------------------------------------------------------------

test('089 the closed vocabulary is total and the same input produces an identical record', () => {
  assert.equal(new Set(capabilityLimitChannels).size, capabilityLimitChannels.length);
  assert.equal(new Set(normalizationRefusals).size, normalizationRefusals.length);
  const build = () => {
    const normalizer = createVehicleNormalizer();
    const record = normalizer.observe(
      observation({
        classId: 'compact',
        eligibility: eligibilityWindow({ classId: 'compact' }),
        artifacts: artifactWindow({ collisionTick: 40 }),
        samples: styleSamples({ classId: 'compact', count: 10, accelerationFraction: 1 }),
      }),
    );
    const encoded = JSON.stringify(record);
    normalizer.dispose();
    return encoded;
  };
  assert.equal(build(), build());
  // The documented order statistic is reproducible, not a magic scale.
  assert.equal(normalizationPercentile([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 0.9), 8);
  assert.equal(normalizationPercentile([], 0.9), 0);
  assert.equal(normalizationPercentile([5], 0.9), 5);
  assert.throws(() => normalizationPercentile([1], 0), /percentile/);
});

test('089 the bounded store retires oldest-first, keeps cumulative denominators and rejects malformed input', () => {
  const cap = NORMALIZATION_CAPACITY.minimum;
  const normalizer = createVehicleNormalizer({ maxWindows: cap });
  for (let index = 0; index < cap + 5; index += 1) {
    const base = index * 100;
    normalizer.observe(
      observation({
        tick: base + 60,
        classId: 'sedan',
        eligibility: eligibilityWindow({
          classId: 'sedan',
          opportunityId: `opportunity-${index}`,
          lastTick: base + 50,
        }),
        artifacts: artifactWindow({
          tick: base + 60,
          startTick: base + 1,
          endTick: base + 100,
        }),
        samples: styleSamples({
          classId: 'sedan',
          count: 5,
          accelerationFraction: 0.3,
          fromTick: base + 1,
        }),
      }),
    );
  }
  const stats = normalizer.getStats();
  assert.equal(stats.retained, cap);
  assert.equal(stats.windowsEvaluated, cap + 5);
  assert.equal(stats.retiredTotal, 5);
  assert.equal(stats.rejectedTotal, 0);
  assert.ok(stats.estimatedBytes <= stats.estimatedBytesMaximum);
  assert.equal(stats.estimatedBytesMaximum, cap * NORMALIZATION_RECORD_BYTES_CEILING);
  assert.equal(
    NORMALIZATION_CAPACITY.default * NORMALIZATION_RECORD_BYTES_CEILING <=
      NORMALIZATION_RECORDER_RAM_BYTES,
    true,
  );
  assert.equal(
    NORMALIZATION_CAPACITY.maximum * NORMALIZATION_RECORD_BYTES_CEILING <=
      NORMALIZATION_RECORDER_RAM_BYTES,
    true,
  );
  // Cumulative evidence survives retirement, exactly like the 086/087/088 stores.
  assert.equal(normalizer.getDenominators().total, cap + 5);
  assert.equal(normalizer.getDenominators().normalized, cap + 5);
  assert.equal(normalizer.getWindows().length, cap);
  normalizer.dispose();
  const disposed = normalizer.getStats();
  assert.equal(disposed.disposed, true);
  assert.equal(disposed.retained, 0);
  assert.equal(disposed.identityCodeUnits, 0);
  assert.equal(disposed.estimatedBytes, 0);
  assert.equal(normalizer.getDenominators().total, cap + 5);
  assert.equal(normalizer.getWindow('opportunity-0'), null);
  assert.throws(
    () =>
      normalizer.observe(
        observation({
          classId: 'sedan',
          eligibility: eligibilityWindow({ classId: 'sedan' }),
          artifacts: artifactWindow(),
          samples: styleSamples({ classId: 'sedan', count: 5, accelerationFraction: 0.3 }),
        }),
      ),
    /disposed/,
  );

  assert.throws(() => createVehicleNormalizer({ maxWindows: 1 }), /capacity out of range/);
  assert.throws(
    () => createVehicleNormalizer({ maxWindows: NORMALIZATION_CAPACITY.maximum + 1 }),
    /capacity out of range/,
  );
  assert.throws(
    () => createVehicleNormalizer({ unknown: 1 } as never),
    /Unknown vehicle normalization option/,
  );
  assert.throws(
    () => createVehicleNormalizer({ saturationFraction: 0.1 }),
    /finite number in range/,
  );

  const other = createVehicleNormalizer();
  const base = () =>
    observation({
      classId: 'sedan',
      eligibility: eligibilityWindow({ classId: 'sedan' }),
      artifacts: artifactWindow(),
      samples: styleSamples({ classId: 'sedan', count: 5, accelerationFraction: 0.3 }),
    });
  // A malformed sample is refused before any window state is touched.
  assert.throws(
    () => other.observe({ ...base(), samples: [{ ...base().samples[0], extra: true }] } as never),
    /missing or unknown fields/,
  );
  assert.throws(
    () =>
      other.observe({
        ...base(),
        samples: base().samples.map((sample) => ({ ...sample, throttle: 2 })),
      }),
    /finite number in range/,
  );
  assert.throws(
    () =>
      other.observe({
        ...base(),
        samples: base().samples.map((sample) => ({ ...sample, tick: 1 })),
      }),
    /monotonically/,
  );
  other.observe(base());
  assert.throws(() => other.observe({ ...base(), tick: 1 }), /tick regressed/);
  assert.throws(
    () => other.observe({ ...base(), worldEpoch: EPOCH + 1 }),
    /another session or world epoch/,
  );
  assert.throws(
    () => other.observe({ ...base(), segmentId: 'other-segment' }),
    /crosses window identities/,
  );
  assert.throws(
    () =>
      other.observe({
        ...base(),
        eligibility: eligibilityWindow({
          classId: 'sedan',
          opportunityId: 'opportunity-future',
          lastTick: 5000,
        }),
      }),
    /ends after the evaluation tick/,
  );
  assert.equal(other.getStats().rejectedTotal, 7);
  assert.equal(other.getStats().retained, 1, 'a refused input leaves no partial window');
  other.dispose();
});

// ---------------------------------------------------------------------------------------------
// Real chain at the 219 cadence.
// ---------------------------------------------------------------------------------------------

test('089 integration: real 023 classes, real 047/049 commands, real 086/087/088 layers at the 219 cadence', () => {
  const profile = compileLongitudinalProfile(longitudinalProfile(longitudinalValues[0]));
  const actor = { id: VEHICLE, incarnation: 1 };
  const RIDE_TICKS = 180;
  const DECISION_PERIOD = 6;

  // A real 049 command: a compiled 033-directed trajectory and a real lateral projection.
  const lateralWorld = Object.freeze({
    sessionId: '089-lateral',
    worldEpoch: 0,
    mapId: '049-separated-curves-v1',
    mapVersionId: 'fixture-v1',
  });
  const lateralActor = Object.freeze({ id: 'lateral-car', incarnation: 1 });
  const trajectory = compileLateralTrajectory(lateralFixture(1), {
    ...lateralWorld,
    version: '049-directed-trajectory-v1',
    id: 'curve',
    access: 'CIVIL',
    laneIds: ['lane-0'],
    loop: true,
  });
  const lateral = createLateralController(lateralWorld);
  lateral.setActors([{ ...lateralActor, classId: 'sedan' }], lateralWorld);
  lateral.setTrajectory(lateralActor, trajectory, lateralWorld);
  const projection = lateral.step({
    ...lateralWorld,
    version: '049-lateral-v1',
    actor: lateralActor,
    tick: 1,
    observation: {
      sourceTick: 0,
      positionM: { x: -384, y: 0.8, z: -360 },
      rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
      velocityMps: { x: 0, y: 0, z: 3 },
      discontinuity: false,
    },
    requestedSpeedMps: 3,
  });
  assert.equal(projection.feasible, true, `real 049 projection: ${projection.reason}`);
  const lateralSteering = projection.steering;
  const lateralCurvature = Math.abs(projection.curvaturePerM ?? 0);

  /** One class traverses the ride; `replay` reuses another class's command sequence verbatim. */
  function ride(
    classId: VehicleClassId,
    replay: readonly { throttle: number; brake: number }[] | null,
  ) {
    const config = vehicleClass(classId);
    const targetOwner = createLongitudinalTargetFixture(profile.cruise, actor, WORLD);
    const controller = createLongitudinalController(WORLD);
    controller.setActors([actor], WORLD);
    const commands: { throttle: number; brake: number }[] = [];
    const samples: VehicleNormalizationSample[] = [];
    let speed = 0;
    for (let tick = 1; tick <= RIDE_TICKS; tick += 1) {
      let throttle = 0;
      let brake = 0;
      if (replay === null) {
        const guided = controller.step({
          ...WORLD,
          actor,
          tick,
          authority: 'AUTO',
          profile,
          target: targetOwner.target(tick, false, classId),
          observation: {
            version: '047-observation-v1',
            units: 'SI',
            ...WORLD,
            actor,
            tick,
            longitudinalSpeedMps: speed,
            classId,
            classVersion: '023-mechanics-v1',
          },
        });
        assert.equal(guided.reason, 'TRACK_TARGET', `real 047 reason ${guided.reason}`);
        throttle = guided.command.throttle;
        brake = guided.command.brake;
        commands.push({ throttle, brake });
      } else {
        ({ throttle, brake } = replay[tick - 1]!);
      }
      // The realized demand of the executed command through the real 023 drivetrain (the service
      // brake dominates propulsion) and the real 049 projected curvature at the current speed.
      const longitudinalAccelerationMps2 =
        brake > 0
          ? -brake * config.brakeAcceleration
          : (throttle * tractiveForceN(config, speed)) / config.massKg;
      const lateralAccelerationMps2 = speed * speed * lateralCurvature;
      speed = Math.max(0, speed + longitudinalAccelerationMps2 / 60);
      samples.push(
        Object.freeze({
          tick,
          longitudinalAccelerationMps2,
          lateralAccelerationMps2,
          throttle,
          brake,
          steering: lateralSteering,
        }),
      );
    }
    controller.dispose();
    targetOwner.dispose();
    return { commands, samples };
  }

  const sedanRide = ride('sedan', null);
  const compactRide = ride('compact', sedanRide.commands);

  // Real 086/087/088 at the 219 cadence over the same ride.
  const registry = createOpportunityRegistry();
  const eligibility = createEligibilityWindows();
  const artifacts = createArtifactFilter();
  const normalizer = createVehicleNormalizer();
  const stimulus = {
    kind: 'YIELD' as const,
    tick: DECISION_PERIOD,
    sourceKey: createStableId('priority-yield', SESSION, [
      String(EPOCH),
      VEHICLE,
      String(DECISION_PERIOD),
    ]),
    relatedIds: ['junction', 'west-straight'],
  };
  let opportunity: { id: string; kind: 'YIELD' | 'STOP' | 'RED' | 'GREEN' | 'LANE_CHANGE' } | null =
    null;
  for (let tick = DECISION_PERIOD; tick <= RIDE_TICKS; tick += DECISION_PERIOD) {
    const records = registry.observe({
      tick,
      sessionId: SESSION,
      worldEpoch: EPOCH,
      segmentId: SEGMENT,
      learningEligible: true,
      vehicleId: VEHICLE,
      incarnation: INCARNATION,
      signal: null,
      events: [],
      stimuli: tick === DECISION_PERIOD ? [stimulus] : [],
      conclusions: [],
    });
    if (opportunity === null && records.length > 0)
      opportunity = { id: records[0].id, kind: records[0].kind };
    if (opportunity !== null)
      eligibility.observe({
        tick,
        sessionId: SESSION,
        worldEpoch: EPOCH,
        opportunityId: opportunity.id,
        kind: opportunity.kind,
        vehicleId: VEHICLE,
        incarnation: INCARNATION,
        segmentId: SEGMENT,
        controlMode: 'LEARNING',
        learningEligible: true,
        classId: 'sedan',
        suspension: 'NONE',
        visibility: { source: 'CONTROLLED_FIXTURE', observable: true },
        leader: null,
        signal: null,
        greenExit: null,
        mechanical: null,
        impact: null,
      });
    artifacts.evaluate({
      tick,
      sessionId: SESSION,
      worldEpoch: EPOCH,
      segmentId: SEGMENT,
      vehicleId: VEHICLE,
      incarnation: INCARNATION,
      controlMode: 'LEARNING',
      learningEligible: true,
      startTick: 1,
      endTick: tick === RIDE_TICKS ? RIDE_TICKS : null,
      segmentCompleteness: tick === RIDE_TICKS ? 'CLOSED' : 'OPEN',
      closeReason: tick === RIDE_TICKS ? 'RIDE_COMPLETED' : null,
      lostCheckpointTick: null,
      observationLoss: null,
      collisions: [],
      recoveries: [],
      suspensions: [],
    });
  }
  assert.ok(opportunity, 'the real 086 registry opened a YIELD opportunity');
  const eligible = eligibility.getWindow(opportunity!.id);
  assert.equal(eligible?.windowClass, 'ELIGIBLE', 'the real 087 layer classified it ELIGIBLE');
  const artifactRecord = artifacts.getWindow(SEGMENT)!;
  assert.equal(artifactRecord.windowClass, 'PREFIX_ELIGIBLE');
  assert.equal(artifactRecord.completeness, 'COMPLETE');
  assert.ok(
    sedanRide.commands.some((command) => command.throttle > 0),
    'the real 047 commanded',
  );

  const sedanRecord = normalized(
    normalizer.observe(
      observation({
        tick: 500,
        classId: 'sedan',
        eligibility: eligible!,
        artifacts: artifactRecord,
        samples: sedanRide.samples,
      }),
    ),
  );
  const compactRecord = normalized(
    normalizer.observe(
      observation({
        tick: 501,
        classId: 'compact',
        eligibility: eligible!,
        artifacts: artifactRecord,
        samples: compactRide.samples,
      }),
    ),
  );

  // The same command and style: the longitudinal normalized demand is the same in both classes...
  assert.ok(
    Math.abs(sedanRecord.features.accelerationDemand - compactRecord.features.accelerationDemand) <=
      NORMALIZATION_EQUALITY_TOLERANCE,
    `acceleration demand differs: ${sedanRecord.features.accelerationDemand} vs ${compactRecord.features.accelerationDemand}`,
  );
  // ...while the raw values differ by the real 023 capability ratio.
  const predictedRatio = capOf('compact').maxAccelerationMps2 / capOf('sedan').maxAccelerationMps2;
  const measuredRatio =
    compactRecord.features.raw.longitudinalAccelerationMps2 /
    sedanRecord.features.raw.longitudinalAccelerationMps2;
  assert.ok(
    Math.abs(measuredRatio - predictedRatio) < 0.02,
    `raw ratio ${measuredRatio} vs ${predictedRatio}`,
  );
  // The features are exactly the documented max of the three channels, never a hidden scale.
  for (const record of [sedanRecord, compactRecord])
    assert.equal(
      record.features.aggressiveness,
      Math.max(
        record.features.accelerationDemand,
        record.features.decelerationDemand,
        record.features.lateralDemand,
      ),
    );
  assert.ok(
    Math.abs(sedanRecord.features.intent.throttle - compactRecord.features.intent.throttle) < 1e-9,
  );
  assert.equal(normalizer.getDenominators().normalized, 2);
  assert.equal(normalizer.getDenominators().refused, 0);
  assert.ok(
    sedanRecord.sampledTicks > 150,
    `the prefix carried the ride: ${sedanRecord.sampledTicks}`,
  );

  lateral.dispose();
  normalizer.dispose();
  artifacts.dispose();
  eligibility.dispose();
  registry.dispose();
});

// ---------------------------------------------------------------------------------------------
// A measured check of the same claim on real Rapier physics.
// ---------------------------------------------------------------------------------------------

test('089 measured in Rapier: the same throttle in a real sedan and a real compact normalizes to the same demand', async () => {
  const measured = async (classId: VehicleClassId) => {
    const world = await createRapierProbe();
    try {
      world.addClassCar('car', { x: 0, y: 0.8, z: 0 }, classId);
      for (let tick = 0; tick < 60; tick += 1) world.step(new Map(), false);
      const inputs = new Map([['car', { throttle: 0.5, brake: 0, steering: 0 }]]);
      let previous = world.project('car').speed;
      const samples: VehicleNormalizationSample[] = [];
      for (let tick = 0; tick < 180; tick += 1) {
        world.step(inputs, false);
        const state = world.project('car');
        samples.push(
          Object.freeze({
            tick: tick + 1,
            longitudinalAccelerationMps2: (state.speed - previous) * 60,
            lateralAccelerationMps2: 0,
            throttle: 0.5,
            brake: 0,
            steering: 0,
          }),
        );
        previous = state.speed;
      }
      return samples;
    } finally {
      world.dispose();
    }
  };

  const sedanSamples = await measured('sedan');
  const compactSamples = await measured('compact');
  const normalizer = createVehicleNormalizer();
  try {
    const sedan = normalized(
      normalizer.observe(
        observation({
          classId: 'sedan',
          eligibility: eligibilityWindow({ classId: 'sedan', lastTick: 180 }),
          artifacts: artifactWindow(),
          samples: sedanSamples,
        }),
      ),
    );
    const compact = normalized(
      normalizer.observe(
        observation({
          tick: 401,
          classId: 'compact',
          eligibility: eligibilityWindow({ classId: 'compact', lastTick: 180 }),
          artifacts: artifactWindow(),
          samples: compactSamples,
        }),
      ),
    );
    assert.ok(
      Math.abs(sedan.features.accelerationDemand - compact.features.accelerationDemand) <=
        NORMALIZATION_EQUALITY_TOLERANCE,
      `measured demand differs: ${sedan.features.accelerationDemand} vs ${compact.features.accelerationDemand}`,
    );
    const rawRatio =
      compact.features.raw.longitudinalAccelerationMps2 /
      sedan.features.raw.longitudinalAccelerationMps2;
    const predicted = capOf('compact').maxAccelerationMps2 / capOf('sedan').maxAccelerationMps2;
    assert.ok(
      rawRatio > 1.25 && rawRatio < 1.5,
      `measured raw ratio ${rawRatio} must sit near the 023 prediction ${predicted}`,
    );
    assert.ok(
      compact.features.raw.longitudinalAccelerationMps2 >
        sedan.features.raw.longitudinalAccelerationMps2,
    );
    assert.equal(sedan.features.aggressivenessIsLowerBound, false);
  } finally {
    normalizer.dispose();
  }
});

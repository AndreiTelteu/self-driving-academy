import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateAccelerationParameters } from '../../src/learning/acceleration-estimator';
import { parameterEvidenceSpecs } from '../../src/learning/parameter-evidence';
import type { ParameterEvidenceReadModel } from '../../src/learning/parameter-evidence';
import type { AccelerationEstimatorObservation } from '../../src/learning/acceleration-estimator';
import type { NormalizedVehicleWindow } from '../../src/telemetry';

const keys = parameterEvidenceSpecs.filter((spec) => spec.estimatorOwner === '095');
const reads = keys.map(
  (spec) =>
    Object.freeze({
      key: spec.key,
      status: 'READY',
      distinctEpisodes: 3,
      contextBreakdown: Object.freeze([
        { label: 'FREE_TRAFFIC', roadType: 'test', speedBand: 'MID', episodes: 3 },
      ]),
      sampleCount: 30,
      quality: 1,
      uncertainty: 'MODERATE',
      unchanged: true,
      noEstimate: 'ESTIMATOR_NOT_IMPLEMENTED',
    }) as ParameterEvidenceReadModel,
);
function observation(
  classId: 'sedan' | 'compact',
  options: {
    impact?: boolean;
    limited?: boolean;
    acceleration?: number;
    deceleration?: number;
    jerk?: number;
    response?: number;
  } = {},
): AccelerationEstimatorObservation {
  const impact = options.impact ?? false;
  const eligibility = {
    windowId: 'w',
    opportunityId: 'o',
    kind: 'STOP',
    reason: impact ? 'COLLISION_IN_WINDOW' : 'NO_CONSTRAINT',
    source: impact ? 'COLLISION_028' : 'NONE',
    observable: true,
    vehicleId: 'v',
    incarnation: 'i',
    segmentId: 's',
    controlMode: 'LEARNING',
    learningEligible: true,
    openedTick: 1,
    lastTick: 20,
    observationCount: 20,
    reaction: { open: false, reason: 'SEGMENT_EXCLUDED' },
    windowClass: impact ? 'EXTERNAL_CONSTRAINT' : 'ELIGIBLE',
    label: impact ? 'IMPACT' : 'FREE_TRAFFIC',
  };
  const artifacts = {
    windowId: 'w',
    sessionId: 'session',
    worldEpoch: 1,
    segmentId: 's',
    vehicleId: 'v',
    incarnation: 'i',
    controlMode: 'LEARNING',
    learningEligible: true,
    startTick: 1,
    endTick: 20,
    completeness: 'COMPLETE',
    completenessReason: 'SEGMENT_CLOSED',
    artifacts: impact
      ? [
          {
            artifactId: 'collision',
            kind: 'COLLISION',
            cause: 'COLLISION_IMPULSE',
            source: 'COLLISION_028',
            boundaryTick: 20,
            endTick: null,
            incidentId: 'incident',
            impulseNs: 1000,
            otherEntityId: 'wall',
            operationId: null,
            recoveryPointId: null,
            recoveryMapId: null,
            recoveryLaneId: null,
            recoveryMode: null,
            recoveryValidatedTick: null,
            suspensionCause: null,
          },
        ]
      : [],
    artifactCount: impact ? 1 : 0,
    boundaryTick: impact ? 20 : null,
    boundaryCause: impact ? 'COLLISION_IMPULSE' : null,
    suppressed: null,
    openedTick: 1,
    lastTick: 20,
    observationCount: 20,
    windowClass: 'PREFIX_ELIGIBLE',
    prefix: { fromTick: 1, toTick: 20, ticks: 20 },
  };
  const normalized = {
    version: '089-vehicle-normalization-v1',
    featureId: 'f',
    windowId: 'w',
    opportunityId: 'o',
    kind: 'STOP',
    segmentId: 's',
    vehicleId: 'v',
    incarnation: 'i',
    classId,
    classVersion: '023-mechanics-v1',
    capability: {
      maxAccelerationMps2: classId === 'sedan' ? 4.6 : 3.8,
      maxDecelerationMps2: classId === 'sedan' ? 8 : 9,
      maxLateralAccelerationMps2: 7,
    },
    completeness: 'COMPLETE',
    completenessReason: 'SEGMENT_CLOSED',
    eligibilityClass: 'ELIGIBLE',
    usableFromTick: 1,
    usableToTick: 20,
    usableTicks: 20,
    sampledTicks: 20,
    sampleCoverage: 1,
    saturationFraction: 0.95,
    minSaturatedTicks: 3,
    openedTick: 1,
    lastTick: 20,
    observationCount: 20,
    windowClass: 'NORMALIZED',
    demandStatus: options.limited ? 'CAPABILITY_LIMITED' : 'INTENTIONAL',
    features: {
      accelerationDemand: options.acceleration ?? 0.5,
      decelerationDemand: options.deceleration ?? 0.25,
      lateralDemand: 0.1,
      aggressiveness: options.limited ? 1 : 0.5,
      aggressivenessIsLowerBound: options.limited ?? false,
      demandPercentile: 0.9,
      raw: {
        longitudinalAccelerationMps2:
          (options.acceleration ?? 0.5) * (classId === 'sedan' ? 4.6 : 3.8),
        longitudinalDecelerationMps2:
          (options.deceleration ?? 0.25) * (classId === 'sedan' ? 8 : 9),
        lateralAccelerationMps2: 0.1,
      },
      intent: { throttle: 0.5, brake: 0.2, steering: 0.1 },
    },
    capabilityMarks: options.limited
      ? [
          {
            reason: 'CAPABILITY_LIMITED',
            channel: 'LONGITUDINAL_ACCELERATION',
            limitMps2: 4,
            peakFraction: 1,
            saturatedTicks: 5,
            sampledTicks: 20,
            saturationFraction: 0.95,
          },
        ]
      : [],
  } as unknown as NormalizedVehicleWindow;
  return {
    eligibility: eligibility as unknown as AccelerationEstimatorObservation['eligibility'],
    artifacts: artifacts as unknown as AccelerationEstimatorObservation['artifacts'],
    normalized,
    jerkSamplesMps3: [options.jerk ?? 2],
    reactionEvidence:
      options.response === undefined
        ? null
        : {
            version: '087-eligibility-windows-v1',
            windowId: 'w',
            opportunityId: 'o',
            kind: 'STOP',
            vehicleId: 'v',
            incarnation: 'i',
            reactionDurationTicks: options.response,
            reactionDurationSeconds: options.response / 60,
          },
  };
}

test('095 hard collisions and impacts cannot raise preferred deceleration or jerk', () => {
  const smooth = estimateAccelerationParameters(
    reads,
    Array.from({ length: 3 }, () => observation('sedan', { deceleration: 0.3, jerk: 1 })),
  );
  const collisionHeavy = estimateAccelerationParameters(reads, [
    ...Array.from({ length: 3 }, () => observation('sedan', { deceleration: 0.3, jerk: 1 })),
    ...Array.from({ length: 20 }, () =>
      observation('sedan', { impact: true, deceleration: 1, jerk: 100 }),
    ),
  ]);
  assert.equal(
    smooth.candidates.comfort_deceleration.value,
    collisionHeavy.candidates.comfort_deceleration.value,
  );
  assert.equal(
    smooth.candidates.acceleration_jerk.value,
    collisionHeavy.candidates.acceleration_jerk.value,
  );
  assert.equal(collisionHeavy.excludedArtifactWindows, 20);
});

test('095 sedan and compact equal normalized demand return the same candidate; saturated windows are lower bounds', () => {
  const sedan = observation('sedan', { acceleration: 0.5 });
  const compact = observation('compact', { acceleration: 0.5 });
  const result = estimateAccelerationParameters(reads, [sedan, compact]);
  assert.ok(Math.abs(result.candidates.desired_acceleration.value! - 2.3214285714) < 0.000001);
  assert.equal(result.candidates.desired_acceleration.quality, 2 / 3);
  assert.equal(result.normalizationBreakdown[0]!.accelerationDemandP50, 0.5);
  assert.equal(result.normalizationBreakdown[1]!.accelerationDemandP50, 0.5);
  assert.equal(result.normalizationBreakdown[0]!.rawAccelerationMps2P50, 2.3);
  assert.equal(result.normalizationBreakdown[1]!.rawAccelerationMps2P50, 1.9);
  const limited = estimateAccelerationParameters(reads, [
    observation('compact', { limited: true, acceleration: 1 }),
  ]);
  assert.equal(limited.candidates.desired_acceleration.value, null);
  assert.equal(limited.excludedCapabilityLowerBounds, 1);
});

test('095 reaction delay uses observable 087 tick resolution; missing stimulus remains unobserved', () => {
  const observed = estimateAccelerationParameters(
    reads,
    Array.from({ length: 3 }, () => observation('sedan', { response: 6 })),
  );
  assert.equal(observed.candidates.brake_reaction_delay.value, 0.1);
  const missing = estimateAccelerationParameters(
    reads,
    Array.from({ length: 3 }, () => observation('sedan')),
  );
  assert.equal(missing.candidates.brake_reaction_delay.status, 'UNOBSERVED');
  assert.equal(missing.candidates.brake_reaction_delay.value, null);
});

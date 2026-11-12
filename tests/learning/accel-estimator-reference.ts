import { ACCEL_POLICY_LIMITS } from '../../src/autonomy';
import type { AccelEvidenceEpisode, AccelEvidenceSample } from '../../src/learning/accel-estimator';
import type { EligibilityWindowRecord, FilteredWindowRecord } from '../../src/telemetry';

/**
 * Deterministic 170 fixtures. They are built from the 169 actuation semantics (ramp per tick,
 * held throttle ticks, launch fraction, coasting release) so the estimator measures the same facts
 * the policy produces. They describe plausible demonstrations, not measured data: the report and
 * the tests use them to show that each key needs its own eligible fact and that an unidentifiable
 * fact leaves the key `Unobserved`.
 */
export const accelScene = Object.freeze({
  sessionId: '170-session',
  worldEpoch: 4,
  vehicleId: 'taxi-170',
  incarnation: '1',
  segmentId: 'segment-170',
});

export function accelEligibility(
  windowClass: 'ELIGIBLE' | 'EXTERNAL_CONSTRAINT',
  opportunityId: string,
  overrides: Partial<EligibilityWindowRecord> = {},
): EligibilityWindowRecord {
  return {
    windowId: `window-${opportunityId}`,
    opportunityId,
    kind: 'STOP',
    reason: 'NO_CONSTRAINT',
    source: 'NONE',
    observable: true,
    vehicleId: accelScene.vehicleId,
    incarnation: accelScene.incarnation,
    segmentId: accelScene.segmentId,
    controlMode: 'LEARNING',
    learningEligible: true,
    openedTick: 0,
    lastTick: 600,
    observationCount: 600,
    reaction: { open: false, reason: 'SEGMENT_EXCLUDED' },
    windowClass,
    label: windowClass === 'ELIGIBLE' ? 'FREE_TRAFFIC' : 'LEADER',
    ...overrides,
  } as EligibilityWindowRecord;
}

export function accelArtifacts(opportunityId: string, toTick = 600): FilteredWindowRecord {
  return {
    windowId: `window-${opportunityId}`,
    sessionId: accelScene.sessionId,
    worldEpoch: accelScene.worldEpoch,
    segmentId: accelScene.segmentId,
    vehicleId: accelScene.vehicleId,
    incarnation: accelScene.incarnation,
    controlMode: 'LEARNING',
    learningEligible: true,
    startTick: 0,
    endTick: toTick,
    completeness: 'COMPLETE',
    completenessReason: 'SEGMENT_CLOSED',
    artifacts: [],
    artifactCount: 0,
    boundaryTick: null,
    boundaryCause: null,
    suppressed: null,
    openedTick: 0,
    lastTick: toTick,
    observationCount: toTick + 1,
    windowClass: 'PREFIX_ELIGIBLE',
    prefix: { fromTick: 0, toTick, ticks: toTick + 1 },
  } as FilteredWindowRecord;
}

export function accelSample(
  tick: number,
  speedMps: number,
  requestedAccelerationMps2: number,
  committedAccelerationMps2: number,
  overrides: Partial<AccelEvidenceSample> = {},
): AccelEvidenceSample {
  return {
    tick,
    speedMps,
    requestedAccelerationMps2,
    committedAccelerationMps2,
    leadGapM: null,
    leadSpeedMps: null,
    stopRequired: false,
    ...overrides,
  };
}

export function accelEpisode(
  id: string,
  samples: readonly AccelEvidenceSample[],
  options: {
    occurrence?: number;
    windowClass?: 'ELIGIBLE' | 'EXTERNAL_CONSTRAINT';
    toTick?: number;
    eligibilityOverrides?: Partial<EligibilityWindowRecord>;
  } = {},
): AccelEvidenceEpisode {
  const toTick = options.toTick ?? Math.max(0, ...samples.map((sample) => sample.tick));
  const opportunityId = `opportunity-${id}`;
  return {
    episodeId: id,
    occurrence: options.occurrence ?? 0,
    eligibility: accelEligibility(
      options.windowClass ?? 'ELIGIBLE',
      opportunityId,
      options.eligibilityOverrides,
    ),
    artifacts: accelArtifacts(opportunityId, toTick),
    samples,
  };
}

/**
 * A genuine 047 braking demand with the 169 ramp: the committed deceleration grows by
 * `jerk / 60` per tick until it reaches the demand and is never above it.
 */
export function brakingSamples(
  jerk: number,
  options: { demand?: number; startTick?: number; speedMps?: number } = {},
): AccelEvidenceSample[] {
  const demand = options.demand ?? 2,
    startTick = options.startTick ?? 0,
    speedMps = options.speedMps ?? 12,
    step = jerk / ACCEL_POLICY_LIMITS.tickHz,
    ticks = Math.ceil(demand / step);
  return Array.from({ length: ticks }, (_, index) =>
    accelSample(startTick + index, speedMps, -demand, -Math.min(demand, (index + 1) * step)),
  );
}

/** Four complete braking ramps around 3 m/s³. */
export function brakingEpisodes(jerks: readonly number[] = [2.9, 3.0, 3.1, 3.0]) {
  return jerks.map((jerk, index) => accelEpisode(`braking-${index + 1}`, brakingSamples(jerk)));
}

/**
 * A lift after a real positive request: the 169 layer keeps the previous acceleration for
 * `holdTicks - 1` ticks and commits zero on the closing tick, so the measured hold is `holdTicks`.
 */
export function releaseSamples(
  holdTicks: number,
  options: { startTick?: number; speedMps?: number; acceleratedMps2?: number } = {},
): AccelEvidenceSample[] {
  const startTick = options.startTick ?? 0,
    speedMps = options.speedMps ?? 8,
    acceleratedMps2 = options.acceleratedMps2 ?? 1.5,
    preamble = 4,
    liftTick = startTick + preamble,
    samples = Array.from({ length: preamble }, (_, index) =>
      accelSample(startTick + index, speedMps, acceleratedMps2, acceleratedMps2),
    );
  for (let offset = 0; offset < holdTicks - 1; offset += 1)
    samples.push(accelSample(liftTick + offset, speedMps, 0, acceleratedMps2));
  samples.push(accelSample(liftTick + holdTicks - 1, speedMps, 0, 0));
  return samples;
}

/** Four hold durations around 0.2 s. */
export function releaseEpisodes(holdTicks: readonly number[] = [11, 12, 13, 12]) {
  return holdTicks.map((ticks, index) =>
    accelEpisode(`release-${index + 1}`, releaseSamples(ticks)),
  );
}

/** A launch from a standstill: the applied request is the 169 launch fraction of the 047 request. */
export function launchSamples(
  intensity: number,
  options: { ticks?: number; startTick?: number; requestedMps2?: number } = {},
): AccelEvidenceSample[] {
  const ticks = options.ticks ?? 3,
    startTick = options.startTick ?? 0,
    requestedMps2 = options.requestedMps2 ?? 1.5,
    factor =
      ACCEL_POLICY_LIMITS.minimumLaunchFraction +
      (1 - ACCEL_POLICY_LIMITS.minimumLaunchFraction) * intensity;
  return Array.from({ length: ticks }, (_, index) =>
    accelSample(startTick + index, 0.4 + index * 0.5, requestedMps2, requestedMps2 * factor),
  );
}

/** Four launch preferences around 0.6. */
export function launchEpisodes(intensities: readonly number[] = [0.55, 0.6, 0.65, 0.6]) {
  return intensities.map((intensity, index) =>
    accelEpisode(`launch-${index + 1}`, launchSamples(intensity)),
  );
}

/** Real coasting: a mild positive request is released towards a free roll. */
export function coastingSamples(
  bias: number,
  options: { ticks?: number; startTick?: number; requestedMps2?: number } = {},
): AccelEvidenceSample[] {
  const ticks = options.ticks ?? 3,
    startTick = options.startTick ?? 0,
    requestedMps2 = options.requestedMps2 ?? 0.4;
  return Array.from({ length: ticks }, (_, index) =>
    accelSample(startTick + index, 8 + index * 0.1, requestedMps2, requestedMps2 * (1 - bias)),
  );
}

/** Four coasting preferences around 0.4. */
export function coastingEpisodes(biases: readonly number[] = [0.35, 0.4, 0.45, 0.4]) {
  return biases.map((bias, index) => accelEpisode(`coasting-${index + 1}`, coastingSamples(bias)));
}

/** Positive set: every key has its own demonstrated fact in separate episodes. */
export function positiveEpisodes(): readonly AccelEvidenceEpisode[] {
  return [...brakingEpisodes(), ...releaseEpisodes(), ...launchEpisodes(), ...coastingEpisodes()];
}

/** A steady strong request only: no braking, no lift, no launch and no mild coasting request. */
export function strongRequestEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    accelEpisode(
      `strong-${index + 1}`,
      Array.from({ length: 6 }, (_, tick) => accelSample(tick, 8, 1.5, 1.5)),
    ),
  );
}

/** A braking demand cut off before the ramp reaches it. */
export function censoredBrakingEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    accelEpisode(
      `censored-braking-${index + 1}`,
      Array.from({ length: 6 }, (_, tick) =>
        accelSample(tick, 12, -2, -Math.min(2, (tick + 1) * (3 / 60))),
      ),
    ),
  );
}

/** A brake that reaches the demand on its first observed tick: the ramp is a lower bound only. */
export function hardBrakingEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    accelEpisode(`hard-braking-${index + 1}`, [
      accelSample(0, 12, 0, 0),
      ...Array.from({ length: 5 }, (_, tick) => accelSample(tick + 1, 12, -2, -2)),
    ]),
  );
}

/** The 047 demand moves while the ramp grows, so no single jerk owns the transition. */
export function changingDemandEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    accelEpisode(`changing-demand-${index + 1}`, [
      accelSample(0, 12, -2, -0.05),
      accelSample(1, 12, -1.5, -0.1),
      accelSample(2, 12, -1.5, -0.15),
      accelSample(3, 12, -1.5, -0.2),
    ]),
  );
}

/** A hold that the evidence window cuts in half. */
export function censoredReleaseEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    accelEpisode(`censored-release-${index + 1}`, [
      accelSample(0, 8, 1.5, 1.5),
      accelSample(1, 8, 1.5, 1.5),
      ...Array.from({ length: 4 }, (_, tick) => accelSample(tick + 2, 8, 0, 1.5)),
    ]),
  );
}

/** A lift immediately cancelled by a brake: the hold never completes, the ramp still exists. */
export function brakingAfterLiftEpisodes() {
  return [0, 1, 2, 3].map((index) => {
    const braking = brakingSamples(3, { startTick: 6 });
    return accelEpisode(`braking-after-lift-${index + 1}`, [
      accelSample(0, 12, 1.5, 1.5),
      accelSample(1, 12, 1.5, 1.5),
      accelSample(2, 12, 0, 1.5),
      accelSample(3, 12, 0, 1.5),
      accelSample(4, 12, 0, 1.5),
      accelSample(5, 12, -2, -0.05),
      ...braking,
    ]);
  });
}

/** A stop request vetoes the hold, the launch and the coasting, never the braking ramp. */
export function vetoedEpisodes() {
  return [0, 1, 2, 3].map((index) => {
    const braking = brakingSamples(3).map((sample) => ({ ...sample, stopRequired: true }));
    const release = releaseSamples(12, { startTick: braking.length + 2 }).map((sample) => ({
      ...sample,
      stopRequired: true,
    }));
    return accelEpisode(`vetoed-${index + 1}`, [...braking, ...release]);
  });
}

/** Only a strong request above 2 m/s: the coasting context is absent, not zero. */
export function strongCoastingEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    accelEpisode(
      `strong-coasting-${index + 1}`,
      Array.from({ length: 4 }, (_, tick) => accelSample(tick, 8, 1.2, 0.6)),
    ),
  );
}

/** An applied/requested ratio above one cannot be produced by the 169 coasting envelope. */
export function envelopeCoastingEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    accelEpisode(
      `envelope-coasting-${index + 1}`,
      Array.from({ length: 4 }, (_, tick) => accelSample(tick, 8, 0.4, 0.6)),
    ),
  );
}

/** An applied/requested ratio above one cannot be produced by the 169 launch envelope. */
export function envelopeLaunchEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    accelEpisode(
      `envelope-launch-${index + 1}`,
      Array.from({ length: 4 }, (_, tick) => accelSample(tick, 0.5, 0.4, 0.6)),
    ),
  );
}

/** Four braking ramps far apart: the measured slope is real but not yet a preference. */
export function noisyBrakingEpisodes() {
  return brakingEpisodes([2, 8, 14, 20]).map((episode, index) =>
    accelEpisode(`noisy-braking-${index + 1}`, episode.samples),
  );
}

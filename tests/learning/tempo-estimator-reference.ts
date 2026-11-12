import type {
  TempoEvidenceEpisode,
  TempoEvidenceSample,
  TempoTargetStep,
} from '../../src/learning/tempo-estimator';
import type { EligibilityWindowRecord, FilteredWindowRecord } from '../../src/telemetry';

/**
 * Deterministic 168 fixtures. They describe plausible demonstrations, not measured data: the
 * report and the tests use them to show that each key needs its own eligible fact and that an
 * unidentifiable fact leaves the key `Unobserved`.
 */
export const tempoScene = Object.freeze({
  sessionId: '168-session',
  worldEpoch: 3,
  vehicleId: 'taxi-168',
  incarnation: '1',
  segmentId: 'segment-168',
  postedLimitMps: 13.9,
});

export function tempoEligibility(
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
    vehicleId: tempoScene.vehicleId,
    incarnation: tempoScene.incarnation,
    segmentId: tempoScene.segmentId,
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

export function tempoArtifacts(opportunityId: string, toTick = 600): FilteredWindowRecord {
  return {
    windowId: `window-${opportunityId}`,
    sessionId: tempoScene.sessionId,
    worldEpoch: tempoScene.worldEpoch,
    segmentId: tempoScene.segmentId,
    vehicleId: tempoScene.vehicleId,
    incarnation: tempoScene.incarnation,
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

export function tempoSample(
  tick: number,
  speedMps: number,
  overrides: Partial<TempoEvidenceSample> = {},
): TempoEvidenceSample {
  return {
    tick,
    speedMps,
    postedLimitMps: tempoScene.postedLimitMps,
    roadKind: 'URBAN',
    leadGapM: null,
    leadSpeedMps: null,
    overtaking: false,
    ...overrides,
  };
}

export function tempoStep(
  tick: number,
  previousCommittedMps: number,
  requestedTargetMps: number,
  held: boolean,
): TempoTargetStep {
  return {
    tick,
    previousCommittedMps,
    requestedTargetMps,
    observedCommittedMps: held ? previousCommittedMps : requestedTargetMps,
  };
}

export function tempoEpisode(
  id: string,
  samples: readonly TempoEvidenceSample[],
  options: {
    occurrence?: number;
    windowClass?: 'ELIGIBLE' | 'EXTERNAL_CONSTRAINT';
    steps?: readonly TempoTargetStep[];
    toTick?: number;
    eligibilityOverrides?: Partial<EligibilityWindowRecord>;
  } = {},
): TempoEvidenceEpisode {
  const toTick = options.toTick ?? Math.max(600, ...samples.map((sample) => sample.tick));
  const opportunityId = `opportunity-${id}`;
  return {
    episodeId: id,
    occurrence: options.occurrence ?? 0,
    eligibility: tempoEligibility(
      options.windowClass ?? 'ELIGIBLE',
      opportunityId,
      options.eligibilityOverrides,
    ),
    artifacts: tempoArtifacts(opportunityId, toTick),
    samples,
    targetSteps: options.steps ?? [],
  };
}

/** Four arterial demonstrations of a +4 m/s style delta. */
export function arterialEpisodes(deltas: readonly number[] = [3.9, 4.1, 4, 4.05]) {
  return deltas.map((delta, index) =>
    tempoEpisode(`arterial-${index + 1}`, [
      tempoSample(10, 13.9 + delta, { roadKind: 'ARTERIAL' }),
      tempoSample(40, 13.9 + delta, { roadKind: 'ARTERIAL' }),
      tempoSample(70, 13.9 + delta, { roadKind: 'ARTERIAL' }),
    ]),
  );
}

/** Four full cruise cycles of a 1.2 m/s rhythm wave on an urban road. */
export function variabilityEpisodes(amplitude = 1.2, ticks = 600) {
  return [0.3, 1.4, 2.6, 4.1].map((phase, index) =>
    tempoEpisode(
      `cruise-${index + 1}`,
      Array.from({ length: ticks }, (_, tick) =>
        tempoSample(tick, 12 + amplitude * Math.sin((2 * Math.PI * tick) / 600 + phase)),
      ),
      { toTick: ticks - 1 },
    ),
  );
}

/** Four genuine overtakes: 11 m/s cruise, 13 m/s while passing. */
export function overtakeEpisodes(bonus = 2) {
  return [0, 1, 2, 3].map((index) =>
    tempoEpisode(
      `overtake-${index + 1}`,
      [
        ...Array.from({ length: 30 }, (_, tick) => tempoSample(tick, 11)),
        ...Array.from({ length: 10 }, (_, tick) =>
          tempoSample(30 + tick, 11 + bonus, { overtaking: true }),
        ),
      ],
      { windowClass: 'EXTERNAL_CONSTRAINT', toTick: 39 },
    ),
  );
}

/** Four cruise episodes whose target steps bracket a 0.325 m/s deadband. */
export function deadbandEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    tempoEpisode(`deadband-${index + 1}`, [tempoSample(0, 12), tempoSample(5, 12)], {
      steps: [
        tempoStep(10, 12, 12.2, true),
        tempoStep(20, 12, 12.25, true),
        tempoStep(30, 12, 12.4, false),
        tempoStep(40, 12, 12.5, false),
      ],
    }),
  );
}

/** A large band swallows every observed step, so no upper bound exists. */
export function coveringDeadbandEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    tempoEpisode(`covering-${index + 1}`, [tempoSample(0, 12)], {
      steps: [tempoStep(10, 12, 12.6, true), tempoStep(20, 12, 13, true)],
    }),
  );
}

/** Held and moved steps contradict each other, so no interval exists. */
export function contradictoryDeadbandEpisodes() {
  return [0, 1, 2, 3].map((index) =>
    tempoEpisode(`contradiction-${index + 1}`, [tempoSample(0, 12)], {
      steps: [tempoStep(10, 12, 12.5, true), tempoStep(20, 12, 12.3, false)],
    }),
  );
}

/** Arterial samples capped by a slow lead: traffic owns the speed, not the style. */
export function trafficDominatedArterialEpisodes() {
  return [0, 1, 2].map((index) =>
    tempoEpisode(`arterial-traffic-${index + 1}`, [
      tempoSample(10, 11.5, {
        roadKind: 'ARTERIAL',
        leadGapM: 10,
        leadSpeedMps: 9,
      }),
      tempoSample(40, 11.4, {
        roadKind: 'ARTERIAL',
        leadGapM: 10,
        leadSpeedMps: 9,
      }),
    ]),
  );
}

/** Overtakes at the traffic envelope cannot prove a style bonus. */
export function trafficDominatedOvertakeEpisodes() {
  return [0, 1].map((index) =>
    tempoEpisode(
      `overtake-traffic-${index + 1}`,
      [
        ...Array.from({ length: 20 }, (_, tick) => tempoSample(tick, 10)),
        ...Array.from({ length: 10 }, (_, tick) =>
          tempoSample(20 + tick, 13.4, {
            overtaking: true,
            leadGapM: 8,
            leadSpeedMps: 12,
          }),
        ),
      ],
      { windowClass: 'EXTERNAL_CONSTRAINT', toTick: 29 },
    ),
  );
}

/** Short cruise stretches cannot expose a full rhythm period. */
export function shortCruiseEpisodes() {
  return [0, 1, 2].map((index) =>
    tempoEpisode(
      `short-${index + 1}`,
      Array.from({ length: 30 }, (_, tick) => tempoSample(tick, 12 + Math.sin(tick))),
      { toTick: 29 },
    ),
  );
}

export function positiveEpisodes(): readonly TempoEvidenceEpisode[] {
  return [
    ...arterialEpisodes(),
    ...variabilityEpisodes(),
    ...overtakeEpisodes(),
    ...deadbandEpisodes(),
  ];
}

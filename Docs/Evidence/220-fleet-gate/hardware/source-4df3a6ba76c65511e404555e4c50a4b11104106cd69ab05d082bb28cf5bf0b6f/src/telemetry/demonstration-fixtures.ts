import { parseSimulationEvent } from '../simulation';
import { parseVehicleCommand, parseVehicleState } from '../vehicles';
import { createArtifactFilter } from './artifact-filter';
import {
  createEligibilityWindows,
  eligibilityLabelClasses,
  eligibilityLabels,
} from './eligibility-windows';
import {
  createOpportunityRegistry,
  opportunityKinds,
  opportunityOutcomeTable,
  opportunityStates,
} from './opportunities';
import { createSegmentCompaction } from './segment-compaction';
import { createTickSampleRecorder } from './tick-samples';
import { createVehicleNormalizer } from './vehicle-normalization';
import type { EligibilityLabel } from './eligibility-windows';
import type { OpportunityKind } from './opportunities';
import type { TickSampleFrame } from './tick-samples';

export const demonstrationFixtureReasonCodes = [
  'NON_MONOTONIC_TICK',
  'FOREIGN_ENTITY',
  'DUPLICATE_ENTITY',
  'NON_FINITE_VALUE',
  'COMMAND_OUT_OF_RANGE',
  'UNKNOWN_OPPORTUNITY_KIND',
  'UNKNOWN_OPPORTUNITY_STATE',
  'UNKNOWN_OPPORTUNITY_OUTCOME',
  'DUPLICATE_OPPORTUNITY_ID',
  'UNKNOWN_ELIGIBILITY_LABEL',
  'ELIGIBILITY_FACT_CONTRADICTION',
  'TRUNCATED_CLAIMS_COMPLETE',
  'NOT_OBSERVED',
  'CONTRACT_REJECTED',
] as const;
export type DemonstrationFixtureReasonCode = (typeof demonstrationFixtureReasonCodes)[number];

export interface DemonstrationFixtureIssue {
  readonly reasonCode: DemonstrationFixtureReasonCode;
  readonly fieldPath: string;
  readonly offendingValue: unknown;
}

export interface DemonstrationFixtureValidation {
  readonly fixtureId: string;
  readonly valid: boolean;
  readonly contextLabel: string;
  readonly reasons: readonly DemonstrationFixtureIssue[];
  readonly stopObservation: 'OBSERVED' | 'NOT_OBSERVED';
}

export interface DemonstrationFixtureCorpusCase {
  readonly fixture: unknown;
  readonly expectedValid: boolean;
}

export interface DemonstrationFixtureCorpusResult {
  readonly result: DemonstrationFixtureValidation;
  readonly expectedValid: boolean;
  readonly matchesExpectation: boolean;
}

interface FixtureLike {
  readonly id: string;
  readonly purpose: string;
  readonly eligibilityLabel: string;
  readonly opportunityKind: string;
  readonly opportunityState: string;
  readonly outcome: string | null;
  readonly artifact: 'NONE' | 'COLLISION' | 'RECOVERY' | 'INCOMPLETE';
  readonly ticks: readonly number[];
  readonly entityIds: readonly string[];
  readonly commandThrottle: number;
  readonly longitudinalAccelerationMps2: number;
  readonly stopOpportunity: {
    readonly kind: 'STOP';
    readonly observation: 'OBSERVED' | 'NOT_OBSERVED';
  };
  readonly claimedCompleteness: 'COMPLETE' | 'TRUNCATED';
  readonly opportunityIds?: readonly string[];
}

const SESSION = 'demo-fixtures-v1';
const EPOCH = 1;
const VEHICLE = 'taxi-1';
const INCARNATION = 'taxi-1-incarnation';
const SEGMENT = 'fixture-segment';
const CLOSE_TICK = 3;
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const issue = (
  reasonCode: DemonstrationFixtureReasonCode,
  fieldPath: string,
  offendingValue: unknown,
): DemonstrationFixtureIssue => Object.freeze({ reasonCode, fieldPath, offendingValue });
const has = <const T extends readonly string[]>(values: T, value: string): value is T[number] =>
  values.includes(value);

function classFor(label: EligibilityLabel): 'ELIGIBLE' | 'EXTERNAL_CONSTRAINT' | 'EXCLUDED' {
  return eligibilityLabelClasses[label];
}

function eligibilityFacts(label: EligibilityLabel) {
  return {
    controlMode:
      label === 'MANUAL_SEGMENT'
        ? ('MANUAL' as const)
        : label === 'AUTO_SEGMENT'
          ? ('AUTO' as const)
          : ('LEARNING' as const),
    learningEligible: label !== 'MANUAL_SEGMENT' && label !== 'AUTO_SEGMENT',
    suspension:
      label === 'PAUSE'
        ? ('PAUSE' as const)
        : label === 'FOCUS_LOST'
          ? ('FOCUS_LOST' as const)
          : ('NONE' as const),
    visibility: { source: 'CONTROLLED_FIXTURE' as const, observable: label !== 'NOT_OBSERVABLE' },
    leader: label === 'LEADER' ? { id: 'leader-1', gapM: 4, speedMps: 0 } : null,
    signal:
      label === 'BLOCKED_GREEN'
        ? {
            signalId: 'signal-1',
            intersectionId: 'junction-1',
            movementId: 'move-1',
            state: 'GREEN' as const,
          }
        : null,
    greenExit:
      label === 'BLOCKED_GREEN' ? { blocked: true, source: 'FOLLOWING_QUEUE' as const } : null,
    mechanical:
      label === 'MECHANICAL_LIMIT'
        ? { demandedLongitudinalAccelerationMps2: 1000, demandedLateralAccelerationMps2: 0 }
        : null,
    impact: label === 'IMPACT' ? { collision: true, impairment: null, recovery: false } : null,
  };
}

function frame(tick: number, fixture: FixtureLike): TickSampleFrame {
  const entity = fixture.entityIds[0] ?? VEHICLE;
  const controlMode =
    fixture.eligibilityLabel === 'AUTO_SEGMENT'
      ? 'AUTO'
      : fixture.eligibilityLabel === 'MANUAL_SEGMENT'
        ? 'MANUAL'
        : 'LEARNING';
  const world = {
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId: SESSION,
    worldEpoch: EPOCH,
  };
  return {
    tick,
    state: parseVehicleState({
      ...world,
      vehicleId: entity,
      classId: 'sedan',
      tick,
      transform: {
        positionM: { x: tick, y: 0, z: 0 },
        rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
      },
      velocityMps: { x: 0, y: 0, z: 5 },
      laneId: 'lane-1',
      controlMode,
      appliedProfileVersion: 'profile-v1',
      maneuverState: 'IDLE',
    }),
    raw: { throttle: fixture.commandThrottle, brake: 0, steering: 0, handbrake: false },
    command: parseVehicleCommand({
      ...world,
      vehicleId: entity,
      tick,
      throttle: fixture.commandThrottle,
      brake: 0,
      steering: 0,
      handbrake: false,
      turnSignal: 'OFF',
      source: controlMode === 'AUTO' ? 'AUTONOMY' : 'PLAYER',
    }),
    physics: {
      longitudinalAccelerationMps2: fixture.longitudinalAccelerationMps2,
      lateralAccelerationMps2: 0,
    },
    lane: { laneId: 'lane-1', speedLimitMps: 13 },
    signal: null,
  };
}

function runContracts(fixture: FixtureLike, label: EligibilityLabel): void {
  const learningEligible = label !== 'MANUAL_SEGMENT' && label !== 'AUTO_SEGMENT';
  const mode =
    label === 'MANUAL_SEGMENT' ? 'MANUAL' : label === 'AUTO_SEGMENT' ? 'AUTO' : 'LEARNING';
  const ticks = fixture.ticks;
  const recorder = createTickSampleRecorder();
  recorder.openSegment({
    segmentId: SEGMENT,
    sessionId: SESSION,
    worldEpoch: EPOCH,
    vehicleId: VEHICLE,
    classId: 'sedan',
    controlMode: mode,
    profileId: 'profile-1',
    baseVersionId: 'profile-v1',
    learningEpoch: 1,
    learningEligible,
    inputType: mode === 'AUTO' ? 'AUTONOMY' : 'KEYBOARD',
    startTick: 1,
  });
  for (const tick of ticks) recorder.record(frame(tick, fixture));
  recorder.closeSegment(fixture.artifact === 'INCOMPLETE' ? 'DATA_LOSS' : 'RIDE_COMPLETED');

  const registry = createOpportunityRegistry();
  const opportunityKind = fixture.opportunityKind as OpportunityKind;
  const event = (type: 'STOP_APPROACH' | 'FULL_STOP') =>
    parseSimulationEvent({
      schemaVersion: 1,
      units: 'SI',
      sessionId: SESSION,
      worldEpoch: EPOCH,
      tick: type === 'STOP_APPROACH' ? 1 : 2,
      entityIds: [VEHICLE],
      eventId: `${fixture.id}-${type}`,
      type,
      payload: {
        vehicleId: VEHICLE,
        opportunityId: `${fixture.id}-source`,
        ...(type === 'STOP_APPROACH' ? { stopLineId: 'stop-line-1' } : { durationS: 1 }),
      },
    });
  let opened: ReturnType<typeof registry.getOpportunities>[number] | undefined;
  if (opportunityKind === 'STOP') {
    registry.observe({
      tick: 1,
      sessionId: SESSION,
      worldEpoch: EPOCH,
      segmentId: SEGMENT,
      learningEligible,
      vehicleId: VEHICLE,
      incarnation: INCARNATION,
      signal: null,
      events: [event('STOP_APPROACH')],
      stimuli: [],
      conclusions: [],
    });
    opened = registry.getOpportunities()[0];
    if (fixture.opportunityState === 'RESOLVED')
      registry.observe({
        tick: 2,
        sessionId: SESSION,
        worldEpoch: EPOCH,
        segmentId: SEGMENT,
        learningEligible,
        vehicleId: VEHICLE,
        incarnation: INCARNATION,
        signal: null,
        events: [event('FULL_STOP')],
        stimuli: [],
        conclusions: [],
      });
  } else if (opportunityKind === 'RED' || opportunityKind === 'GREEN') {
    const signal = {
      signalId: 'signal-1',
      intersectionId: 'junction-1',
      phaseId: 'phase-1',
      movementId: 'move-1',
      state: opportunityKind,
      phaseStartedTick: 1,
    };
    registry.observe({
      tick: 1,
      sessionId: SESSION,
      worldEpoch: EPOCH,
      segmentId: SEGMENT,
      learningEligible,
      vehicleId: VEHICLE,
      incarnation: INCARNATION,
      signal,
      events: [],
      stimuli: [],
      conclusions: [],
    });
    opened = registry.getOpportunities()[0];
    if (fixture.opportunityState === 'RESOLVED' && opened)
      registry.conclude({ tick: 2, opportunityId: opened.id, outcome: fixture.outcome ?? '' });
  } else {
    registry.observe({
      tick: 1,
      sessionId: SESSION,
      worldEpoch: EPOCH,
      segmentId: SEGMENT,
      learningEligible,
      vehicleId: VEHICLE,
      incarnation: INCARNATION,
      signal: null,
      events: [],
      conclusions: [],
      stimuli: [
        {
          kind: opportunityKind,
          tick: 1,
          sourceKey: `${fixture.id}-source`,
          relatedIds: ['related-1'],
        },
      ],
    });
    opened = registry.getOpportunities()[0];
    if (fixture.opportunityState === 'RESOLVED' && opened)
      registry.conclude({ tick: 2, opportunityId: opened.id, outcome: fixture.outcome ?? '' });
  }
  if (!opened) throw new Error('086 did not create an opportunity');
  if (fixture.opportunityState === 'TRUNCATED' && opened.state === 'ENTERED')
    registry.truncate({ tick: 3, opportunityId: opened.id, reason: 'SEGMENT_CLOSED' });
  const opportunity = registry.getOpportunity(opened.id);
  if (!opportunity || opportunity.state !== fixture.opportunityState)
    throw new Error('086 lifecycle differs from fixture');
  if (opportunity.outcome !== fixture.outcome) throw new Error('086 outcome differs from fixture');

  const eligibility = createEligibilityWindows();
  const facts = eligibilityFacts(label);
  const eligibilityRecord = eligibility.observe({
    tick: 1,
    sessionId: SESSION,
    worldEpoch: EPOCH,
    opportunityId: opportunity.id,
    kind: opportunity.kind,
    vehicleId: VEHICLE,
    incarnation: INCARNATION,
    segmentId: SEGMENT,
    classId: 'sedan',
    ...facts,
  });
  if (eligibilityRecord.windowClass !== classFor(label))
    throw new Error('087 label/class does not match evidence');
  if (eligibilityRecord.label !== label) throw new Error('087 label does not match fixture label');

  const filter = createArtifactFilter();
  const artifactInput = {
    tick: CLOSE_TICK,
    sessionId: SESSION,
    worldEpoch: EPOCH,
    segmentId: SEGMENT,
    vehicleId: VEHICLE,
    incarnation: INCARNATION,
    controlMode: mode as 'LEARNING',
    learningEligible,
    startTick: 1,
    endTick: CLOSE_TICK,
    segmentCompleteness:
      fixture.artifact === 'INCOMPLETE' ? ('INCOMPLETE' as const) : ('CLOSED' as const),
    closeReason:
      fixture.artifact === 'INCOMPLETE' ? ('DATA_LOSS' as const) : ('RIDE_COMPLETED' as const),
    lostCheckpointTick: null,
    observationLoss: null,
    collisions:
      fixture.artifact === 'COLLISION'
        ? [{ tick: 2, incidentId: `${fixture.id}-incident`, impulseNs: 10, otherEntityId: 'wall' }]
        : [],
    recoveries:
      fixture.artifact === 'RECOVERY'
        ? [
            {
              tick: 2,
              operationId: `${fixture.id}-recovery`,
              status: 'ADMITTED' as const,
              pointId: 'spawn-1',
              mapId: 'academy',
              laneId: 'lane-1',
              mode: 'MANUAL' as const,
              validatedTick: 2,
              learningEligible: false as const,
            },
          ]
        : [],
    suspensions: [],
  };
  const filtered = filter.evaluate(artifactInput);
  if (
    fixture.artifact === 'COLLISION' &&
    !filtered.artifacts.some((item) => item.kind === 'COLLISION')
  )
    throw new Error('088 collision missing');
  if (
    fixture.artifact === 'RECOVERY' &&
    !filtered.artifacts.some((item) => item.kind === 'TELEPORT')
  )
    throw new Error('088 recovery missing');
  if (fixture.artifact === 'INCOMPLETE' && filtered.completeness !== 'TRUNCATED')
    throw new Error('088 incomplete segment was not truncated');

  const normalizer = createVehicleNormalizer();
  const normalized = normalizer.observe({
    tick: CLOSE_TICK,
    sessionId: SESSION,
    worldEpoch: EPOCH,
    segmentId: SEGMENT,
    vehicleId: VEHICLE,
    incarnation: INCARNATION,
    classId: 'sedan',
    eligibility: eligibilityRecord,
    artifacts: filtered,
    samples: ticks.map((tick) => ({
      tick,
      longitudinalAccelerationMps2: fixture.longitudinalAccelerationMps2,
      lateralAccelerationMps2: 0,
      throttle: fixture.commandThrottle,
      brake: 0,
      steering: 0,
    })),
  });
  if (
    eligibilityRecord.windowClass !== 'ELIGIBLE' &&
    (normalized.windowClass !== 'REFUSED' || normalized.refusal !== 'NOT_ELIGIBLE_WINDOW')
  )
    throw new Error('089 normalized a non-eligible 087 window');
  if (
    eligibilityRecord.windowClass === 'ELIGIBLE' &&
    filtered.completeness === 'TRUNCATED' &&
    (normalized.windowClass !== 'REFUSED' || normalized.refusal !== 'WINDOW_TRUNCATED')
  )
    throw new Error('089 did not refuse a truncated 088 window');
  if (
    eligibilityRecord.windowClass === 'ELIGIBLE' &&
    filtered.prefix &&
    ticks.filter((tick) => tick >= filtered.prefix.fromTick && tick <= filtered.prefix.toTick)
      .length < 3 &&
    (normalized.windowClass !== 'REFUSED' || normalized.refusal !== 'INSUFFICIENT_SAMPLES')
  )
    throw new Error('089 accepted insufficient normalization samples');

  const compactor = createSegmentCompaction({ recorder, segmentId: SEGMENT });
  while (!compactor.compactAvailable(32).done) {
    /* bounded source draining */
  }
  if (compactor.beginFinalize()) compactor.finalizeStep(32);
  if (compactor.getStats().state !== 'FINALIZED')
    throw new Error('090 did not finalize the closed 085 segment');
  compactor.dispose();
  normalizer.dispose();
  filter.dispose();
  eligibility.dispose();
  registry.dispose();
  recorder.dispose();
}

export function validateDemonstrationFixture(value: unknown): DemonstrationFixtureValidation {
  const fixture = value as FixtureLike;
  const reasons: DemonstrationFixtureIssue[] = [];
  if (!fixture || typeof fixture !== 'object' || typeof fixture.id !== 'string') {
    return Object.freeze({
      fixtureId: 'unknown',
      valid: false,
      contextLabel: 'UNKNOWN',
      stopObservation: 'NOT_OBSERVED',
      reasons: [issue('CONTRACT_REJECTED', 'fixture', value)],
    });
  }
  if (!Array.isArray(fixture.ticks))
    reasons.push(issue('CONTRACT_REJECTED', 'ticks', fixture.ticks));
  else {
    for (let index = 0; index < fixture.ticks.length; index += 1) {
      const tick = fixture.ticks[index];
      if (index > 0 && typeof tick === 'number' && tick <= fixture.ticks[index - 1]!) {
        reasons.push(issue('NON_MONOTONIC_TICK', `ticks[${index}]`, tick));
        break;
      }
    }
  }
  if (Array.isArray(fixture.entityIds)) {
    const seen = new Set<string>();
    for (let index = 0; index < fixture.entityIds.length; index += 1) {
      const entity = fixture.entityIds[index];
      if (seen.has(entity)) {
        reasons.push(issue('DUPLICATE_ENTITY', `entityIds[${index}]`, entity));
        break;
      }
      seen.add(entity);
      if (entity !== VEHICLE) {
        reasons.push(issue('FOREIGN_ENTITY', `entityIds[${index}]`, entity));
        break;
      }
    }
  }
  if (!isFiniteNumber(fixture.longitudinalAccelerationMps2))
    reasons.push(
      issue(
        'NON_FINITE_VALUE',
        'longitudinalAccelerationMps2',
        fixture.longitudinalAccelerationMps2,
      ),
    );
  if (
    !isFiniteNumber(fixture.commandThrottle) ||
    fixture.commandThrottle < 0 ||
    fixture.commandThrottle > 1
  )
    reasons.push(issue('COMMAND_OUT_OF_RANGE', 'commandThrottle', fixture.commandThrottle));
  if (!has(opportunityKinds, fixture.opportunityKind))
    reasons.push(issue('UNKNOWN_OPPORTUNITY_KIND', 'opportunityKind', fixture.opportunityKind));
  if (!has(opportunityStates, fixture.opportunityState))
    reasons.push(issue('UNKNOWN_OPPORTUNITY_STATE', 'opportunityState', fixture.opportunityState));
  if (
    has(opportunityKinds, fixture.opportunityKind) &&
    fixture.opportunityState === 'RESOLVED' &&
    !opportunityOutcomeTable[fixture.opportunityKind].includes(fixture.outcome as never)
  )
    reasons.push(issue('UNKNOWN_OPPORTUNITY_OUTCOME', 'outcome', fixture.outcome));
  if (fixture.opportunityIds) {
    const seen = new Set<string>();
    for (let index = 0; index < fixture.opportunityIds.length; index += 1) {
      if (seen.has(fixture.opportunityIds[index]!)) {
        reasons.push(
          issue(
            'DUPLICATE_OPPORTUNITY_ID',
            `opportunities[${index}].id`,
            fixture.opportunityIds[index],
          ),
        );
        break;
      }
      seen.add(fixture.opportunityIds[index]!);
    }
  }
  if (!has(eligibilityLabels, fixture.eligibilityLabel))
    reasons.push(issue('UNKNOWN_ELIGIBILITY_LABEL', 'eligibilityLabel', fixture.eligibilityLabel));
  else if (fixture.eligibilityLabel === 'FREE_TRAFFIC' && fixture.artifact === 'COLLISION')
    reasons.push(
      issue('ELIGIBILITY_FACT_CONTRADICTION', 'eligibilityLabel', fixture.eligibilityLabel),
    );
  if (fixture.artifact === 'INCOMPLETE' && fixture.claimedCompleteness === 'COMPLETE')
    reasons.push(
      issue('TRUNCATED_CLAIMS_COMPLETE', 'claimedCompleteness', fixture.claimedCompleteness),
    );
  if (
    !fixture.stopOpportunity ||
    fixture.stopOpportunity.kind !== 'STOP' ||
    !has(['OBSERVED', 'NOT_OBSERVED'] as const, fixture.stopOpportunity.observation)
  )
    reasons.push(issue('NOT_OBSERVED', 'stopOpportunity', fixture.stopOpportunity ?? null));
  if (reasons.length === 0) {
    try {
      const label = fixture.eligibilityLabel as EligibilityLabel;
      runContracts(structuredClone(fixture), label);
    } catch (error: unknown) {
      reasons.push(
        issue(
          'CONTRACT_REJECTED',
          'fixture',
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }
  return Object.freeze({
    fixtureId: fixture.id,
    valid: reasons.length === 0,
    contextLabel: fixture.eligibilityLabel,
    reasons: Object.freeze(reasons),
    stopObservation: fixture.stopOpportunity?.observation ?? 'NOT_OBSERVED',
  });
}

/** Shared by the CLI and tests so an accepted corruption is a corpus-level failure. */
export function evaluateDemonstrationFixtureCorpus(
  cases: readonly DemonstrationFixtureCorpusCase[],
  validate: (fixture: unknown) => DemonstrationFixtureValidation = validateDemonstrationFixture,
): readonly DemonstrationFixtureCorpusResult[] {
  return Object.freeze(
    cases.map(({ fixture, expectedValid }) => {
      const result = validate(fixture);
      return Object.freeze({
        result,
        expectedValid,
        matchesExpectation: result.valid === expectedValid,
      });
    }),
  );
}

export function stopComplianceRatio(
  observation: 'OBSERVED' | 'NOT_OBSERVED',
  successes: number,
  certain: number,
):
  | { readonly value: number; readonly refusalReason: null }
  | { readonly value: null; readonly refusalReason: 'NOT_OBSERVED' | 'NO_CERTAIN_OPPORTUNITIES' } {
  if (observation === 'NOT_OBSERVED')
    return Object.freeze({ value: null, refusalReason: 'NOT_OBSERVED' });
  if (
    !Number.isSafeInteger(successes) ||
    !Number.isSafeInteger(certain) ||
    successes < 0 ||
    certain < 0 ||
    successes > certain
  )
    return Object.freeze({ value: null, refusalReason: 'NO_CERTAIN_OPPORTUNITIES' });
  if (certain === 0)
    return Object.freeze({ value: null, refusalReason: 'NO_CERTAIN_OPPORTUNITIES' });
  return Object.freeze({ value: successes / certain, refusalReason: null });
}

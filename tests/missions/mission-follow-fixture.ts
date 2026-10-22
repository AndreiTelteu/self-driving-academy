import { compileFollowingProfile, evaluateFollowingTarget } from '../../src/autonomy/following';
import type { FollowingEstimatorObservation, ParameterEvidenceReadModel } from '../../src/learning';
import { createParameterEvidenceLedger } from '../../src/learning';
import {
  FOLLOW_COMPARISON_SCENARIOS,
  FOLLOW_MISSION_ID,
  FOLLOW_SINGLE_SPEED_SCENARIOS,
  compareFollowingProfiles,
  followingMissionGate,
} from '../../src/missions';
import type {
  FollowComparison,
  FollowMissionGate,
  FollowScenario,
  FollowScenarioRun,
} from '../../src/missions';
import { parseSimulationEvent } from '../../src/simulation';
import {
  createArtifactFilter,
  createEligibilityWindows,
  createOpportunityRegistry,
} from '../../src/telemetry';
import type { EligibilityWindowRecord, FilteredWindowRecord } from '../../src/telemetry';
import { createFollowingTargetFixture } from '../autonomy/following-target-fixture';
import { followingProfile } from '../autonomy/following-reference';

/**
 * 119 measurement fixture.
 *
 * The gap a style holds is the real output of the delivered 048 policy: the profile is compiled by
 * the real `compileFollowingProfile`, the leader context comes from the real 044/045/046 fixture and
 * `evaluateFollowingTarget` reports `desiredGapM` for exactly that context. Nothing here writes the
 * following law again.
 *
 * The measured pair then travels through the real evidence chain: a real 086 STOP opportunity opened
 * by a real `STOP_APPROACH` and resolved by a real `FULL_STOP`, classified by the real 087 layer with
 * the real 048 leader fact (label `LEADER`), filtered by the real 088 artefact window, and recorded by
 * the real 093 ledger. The 096 observations of the same facts are what the mission compares.
 *
 * The 087 window identity and the 088 window identity are still two schemes; the fixture binds the
 * real 088 window to the real 087 window of the same opportunity, exactly like the 118 fixture, and
 * invents no value, tick or estimate.
 */
export const FOLLOW_SESSION_PREFIX = 'session-119-follow';
export const FOLLOW_WORLD_EPOCH = 1;

/**
 * Known 105 profile values used for the comparison, cited from `knownProfiles`:
 * `PRUDENT` follows at 2.4 s and 4 m, `RECKLESS` at 0.6 s and 1 m. The two `*_TWIN` styles are
 * authored calibration partners that keep one coefficient equal and change only the other, so the
 * report can show which coefficient separates the styles instead of only that they differ.
 */
export const FOLLOW_STYLE_VALUES = Object.freeze({
  PRUDENT: Object.freeze([2.4, 4, 2.5, 0.5] as const),
  RECKLESS: Object.freeze([0.6, 1, 0.7, 1.7] as const),
  HEADWAY_TWIN: Object.freeze([0.6, 4, 2.5, 0.5] as const),
  GAP_TWIN: Object.freeze([2.4, 10, 2.5, 0.5] as const),
  /** Same values as `PRUDENT` under a different identity: the identical case of the comparison. */
  PRUDENT_TWIN: Object.freeze([2.4, 4, 2.5, 0.5] as const),
});

export type FollowStyleId = keyof typeof FOLLOW_STYLE_VALUES;

export interface FollowRunProfile {
  readonly profileId: string;
  readonly style: FollowStyleId;
  readonly scenarios: readonly FollowScenarioRun[];
  readonly evidence: readonly ParameterEvidenceReadModel[];
  /** Measured `desiredGapM` per authored scenario, in catalogue order. */
  readonly measuredGapsM: readonly number[];
}

export interface FollowComparisonCase {
  readonly input: unknown;
  readonly comparison: FollowComparison;
  readonly gate: FollowMissionGate;
}

const STOP_DWELL_TICKS = 120;

function stopEvent(
  type: 'STOP_APPROACH' | 'FULL_STOP',
  tick: number,
  sessionId: string,
  vehicleId: string,
  index: number,
): ReturnType<typeof parseSimulationEvent> {
  return parseSimulationEvent({
    schemaVersion: 1,
    units: 'SI',
    sessionId,
    worldEpoch: FOLLOW_WORLD_EPOCH,
    tick,
    entityIds: [vehicleId],
    eventId: `${sessionId}:117:${type}:${index}`,
    type,
    payload:
      type === 'STOP_APPROACH'
        ? {
            vehicleId,
            opportunityId: `${sessionId}:stop-source:${index}`,
            stopLineId: 'stop-line-119',
          }
        : {
            vehicleId,
            opportunityId: `${sessionId}:stop-source:${index}`,
            durationS: STOP_DWELL_TICKS / 60,
          },
  });
}

/**
 * Measures one style on the authored contexts and produces the real 093/096 evidence of that run.
 *
 * The only number the fixture takes from the policy is the reported `desiredGapM`; every other value
 * is an authored scenario fact or a real event.
 */
export function measureFollowStyle(
  style: FollowStyleId,
  scenarios: readonly FollowScenario[] = FOLLOW_COMPARISON_SCENARIOS,
): FollowRunProfile {
  const values = FOLLOW_STYLE_VALUES[style];
  const profileId = `profile:119:${style.toLowerCase()}`;
  const profile = compileFollowingProfile({
    ...followingProfile(values),
    profileId,
    versionId: `${profileId}:v1`,
  });
  const sessionId = `${FOLLOW_SESSION_PREFIX}:${style.toLowerCase()}`;
  const scope = Object.freeze({ sessionId, worldEpoch: FOLLOW_WORLD_EPOCH });
  const actor = Object.freeze({ id: `taxi:119:${style.toLowerCase()}`, incarnation: 1 });
  const vehicleId = actor.id;
  const incarnation = `${vehicleId}:1`;
  const segmentId = `segment:119:${style.toLowerCase()}`;
  const fixture = createFollowingTargetFixture(profile.longitudinal.cruise, actor, scope);
  const registry = createOpportunityRegistry();
  const eligibility = createEligibilityWindows();
  const filter = createArtifactFilter();
  const ledger = createParameterEvidenceLedger();
  const windows = new Map<string, EligibilityWindowRecord>();
  const measured: {
    scenario: FollowScenario;
    opportunityId: string;
    gapM: number;
    tick: number;
  }[] = [];
  let tick = 0;
  try {
    for (const [index, scenario] of scenarios.entries()) {
      const observationTick = ++tick * 20;
      const input = fixture.input(
        observationTick,
        scenario.egoSpeedMps,
        scenario.leaderGapM,
        scenario.leaderSpeedMps,
        scenario.leaderId,
      );
      const result = evaluateFollowingTarget({
        cruiseInput: input.cruiseInput,
        roadContext: input.roadContext,
        observation: input.observation,
        profile,
      });
      if (result.reason !== 'FOLLOWING_GAP' || result.desiredGapM === null)
        throw new Error(`048 did not report a following gap for ${scenario.scenarioId}`);
      const gapM = result.desiredGapM;

      registry.observe({
        tick: observationTick,
        sessionId,
        worldEpoch: FOLLOW_WORLD_EPOCH,
        segmentId,
        learningEligible: true,
        vehicleId,
        incarnation,
        signal: null,
        events: [stopEvent('STOP_APPROACH', observationTick, sessionId, vehicleId, index)],
        stimuli: [],
        conclusions: [],
      });
      const resolvedTick = observationTick + 5;
      const touched = registry.observe({
        tick: resolvedTick,
        sessionId,
        worldEpoch: FOLLOW_WORLD_EPOCH,
        segmentId,
        learningEligible: true,
        vehicleId,
        incarnation,
        signal: null,
        events: [stopEvent('FULL_STOP', resolvedTick, sessionId, vehicleId, index)],
        stimuli: [],
        conclusions: [],
      });
      const opportunity = touched.find((entry) => entry.state === 'RESOLVED');
      if (opportunity === undefined) throw new Error('086 did not resolve the stop opportunity');

      const window = eligibility.observe({
        tick: resolvedTick,
        sessionId,
        worldEpoch: FOLLOW_WORLD_EPOCH,
        opportunityId: opportunity.id,
        kind: opportunity.kind,
        vehicleId,
        incarnation,
        segmentId,
        classId: 'sedan',
        controlMode: 'LEARNING',
        learningEligible: true,
        suspension: 'NONE',
        visibility: { source: 'CONTROLLED_FIXTURE', observable: true },
        leader: Object.freeze({
          id: scenario.leaderId,
          gapM,
          speedMps: scenario.leaderSpeedMps,
        }),
        signal: null,
        greenExit: null,
        mechanical: null,
        impact: null,
      });
      if (window.label !== 'LEADER' || window.windowClass !== 'EXTERNAL_CONSTRAINT')
        throw new Error('087 did not classify the measured following window as LEADER');
      windows.set(opportunity.id, window);
      measured.push({
        scenario,
        opportunityId: opportunity.id,
        gapM,
        tick: resolvedTick,
      });
    }
    const lastTick = tick * 20 + 5;
    const artifactWindow: FilteredWindowRecord = filter.evaluate({
      tick: lastTick,
      sessionId,
      worldEpoch: FOLLOW_WORLD_EPOCH,
      segmentId,
      vehicleId,
      incarnation,
      controlMode: 'LEARNING',
      learningEligible: true,
      startTick: 1,
      endTick: lastTick,
      segmentCompleteness: 'CLOSED',
      closeReason: 'RIDE_COMPLETED',
      lostCheckpointTick: null,
      observationLoss: null,
      collisions: [],
      recoveries: [],
      suspensions: [],
    });
    if (artifactWindow.windowClass !== 'PREFIX_ELIGIBLE' || artifactWindow.prefix === null)
      throw new Error('088 did not retain a usable prefix for the measurement segment');
    const opportunities = registry.getOpportunities();
    const runs: FollowScenarioRun[] = [];
    for (const row of measured) {
      const opportunity = opportunities.find((entry) => entry.id === row.opportunityId);
      if (opportunity === undefined) throw new Error('086 lost the measured opportunity');
      const window = windows.get(opportunity.id);
      if (window === undefined) throw new Error('087 lost the measured window');
      const artifacts = Object.freeze({ ...artifactWindow, windowId: window.windowId });
      ledger.observe({
        eligibility: window,
        opportunity,
        artifacts,
        roadType: 'urban',
        headway: Object.freeze({ gapM: row.gapM, speedMps: row.scenario.egoSpeedMps }),
      });
      runs.push(
        Object.freeze({
          scenarioId: row.scenario.scenarioId,
          observations: Object.freeze([
            Object.freeze({
              eligibility: window,
              opportunity,
              artifacts,
              context: 'LEADER' as const,
              gapM: row.gapM,
              speedMps: row.scenario.egoSpeedMps,
              leaderId: row.scenario.leaderId,
              leaderSpeedMps: row.scenario.leaderSpeedMps,
              speedGain: 0.5,
            }) as FollowingEstimatorObservation,
          ]),
        }),
      );
    }
    return Object.freeze({
      profileId,
      style,
      scenarios: Object.freeze(runs),
      evidence: ledger.readAll(),
      measuredGapsM: Object.freeze(measured.map((row) => row.gapM)),
    });
  } finally {
    fixture.dispose();
    filter.dispose();
    eligibility.dispose();
    registry.dispose();
  }
}

/** Compares two authored styles on the same authored contexts through the real mission contract. */
export function compareStyles(
  left: FollowStyleId,
  right: FollowStyleId,
  scenarios: readonly FollowScenario[] = FOLLOW_COMPARISON_SCENARIOS,
): FollowComparisonCase {
  const leftRun = measureFollowStyle(left, scenarios);
  const rightRun = measureFollowStyle(right, scenarios);
  const input = Object.freeze({
    scenarioIds: Object.freeze(scenarios.map((entry) => entry.scenarioId)),
    profiles: Object.freeze([
      Object.freeze({
        profileId: leftRun.profileId,
        scenarios: leftRun.scenarios,
        evidence: leftRun.evidence,
      }),
      Object.freeze({
        profileId: rightRun.profileId,
        scenarios: rightRun.scenarios,
        evidence: rightRun.evidence,
      }),
    ]),
  });
  const comparison = compareFollowingProfiles(input);
  return Object.freeze({ input, comparison, gate: followingMissionGate(comparison) });
}

export { FOLLOW_COMPARISON_SCENARIOS, FOLLOW_MISSION_ID, FOLLOW_SINGLE_SPEED_SCENARIOS };

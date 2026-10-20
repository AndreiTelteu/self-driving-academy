/**
 * 056 basic-autonomy scenario suite.
 *
 * Every scenario runs the real production controllers and authored world fixtures. The expected
 * outcome is computed by `auto-scenarios-oracle.ts` from the contract formulas and the scenario
 * inputs. The suite is deterministic, browser-free and safe to execute through Node tests or the
 * standalone report runner.
 */
import { createRoadContext } from '../../src/autonomy/road-context';
import type { RoadContextFrame } from '../../src/autonomy/road-context';
import { createBehaviorFSM, projectBehaviorContext } from '../../src/autonomy/behavior-fsm';
import type { BehaviorActor } from '../../src/autonomy/behavior-fsm';
import { compileCruiseProfile, evaluateCruiseTarget } from '../../src/autonomy/cruise-targets';
import type { CruiseTarget } from '../../src/autonomy/cruise-targets';
import {
  compileLongitudinalProfile,
  createLongitudinalController,
} from '../../src/autonomy/longitudinal-control';
import { compileFollowingProfile, evaluateFollowingTarget } from '../../src/autonomy/following';
import {
  evaluateSignalPolicy,
  projectSignalProfile,
  signalBehaviorFacts,
  signalOpportunityKey,
  SIGNAL_POLICY_LIMITS,
} from '../../src/autonomy/signal-policy';
import {
  evaluateStopPolicy,
  projectStopProfile,
  stopBehaviorFacts,
  STOP_POLICY_LIMITS,
} from '../../src/autonomy/stop-policy';
import {
  evaluateYieldPolicy,
  projectYieldProfile,
  yieldBehaviorFacts,
} from '../../src/autonomy/yield-policy';
import {
  evaluateLaneChange,
  LANE_CHANGE_EMPTY_STATE,
  laneChangeBehaviorFacts,
  projectLaneChangeProfile,
} from '../../src/autonomy/lane-change-policy';
import type { LaneChangeState } from '../../src/autonomy/lane-change-policy';
import {
  BLOCKED_RECOVERY_EMPTY_STATE,
  BLOCKED_RECOVERY_LIMITS,
  blockedRecoveryBehaviorFacts,
  evaluateAuthorityReentry,
  evaluateBlockedRecovery,
} from '../../src/autonomy/blocked-recovery';
import type { BlockedRecoveryState } from '../../src/autonomy/blocked-recovery';
import { createSignalController } from '../../src/world';
import { createEventBus } from '../../src/simulation';
import { deriveScenarioSeed, deriveVehicleSeed } from '../../src/sessions';
import { vehicleClass } from '../../src/vehicles';
import { roadContextFixture } from './road-context-reference';
import {
  blockedProbeFixture,
  laneProbeFixture,
  signalProbeFixture,
  stopApproachProfile,
  stopProbeFixture,
} from './policy-probe-fixture';
import { createFollowingTargetFixture } from './following-target-fixture';
import { createLongitudinalDrivingEpisode } from './longitudinal-driving-fixture';
import {
  addressedComplianceSample,
  autoScenarioProfile,
  autoScenarioProfile as profileFor,
  baseFacts,
  checkEqual,
  checkNumber,
  checkTrue,
  report,
  runCadence,
  scenarioResult,
} from './auto-scenarios-support';
import type {
  AutoScenarioReport,
  GuardResult,
  ScenarioCheck,
  ScenarioResult,
} from './auto-scenarios-support';
import {
  mutationProbes,
  referenceBlockedCause,
  referenceBlockedFirstAction,
  referenceCruise,
  referenceFollowing,
  referenceLaneChange,
  referenceSignal,
  referenceStop,
  referenceYield,
  referenceYieldFacts,
} from './auto-scenarios-oracle';

const CRUISE_VALUES = [1.5, 1.2, 2.5, 4.5] as const;
const FOLLOWING_VALUES = [1.8, 3, 2, 0.7] as const;
const SIGNAL_VALUES = [0.8, 0.5, 1, 0.5] as const;
const STOP_VALUES = [0.8, 0.5, 1] as const;
const LANE_VALUES = [12, 10, 1.5, 2] as const;
const YIELD_VALUE = 3;

function styleProfile(
  overrides: Readonly<Record<string, number>> = {},
  versionId = '056-auto-scenario-v1',
) {
  return profileFor(overrides, versionId);
}
/** Scenario01/02/03: the real044 profile plus real045 and the real046 cruise evaluator. */
function cruiseScenario(input: {
  readonly id: string;
  readonly title: string;
  readonly overrides: Readonly<Record<string, number>>;
  readonly roadKind: 'URBAN' | 'RESIDENTIAL';
  readonly curveRadiusM: number | null;
  readonly intersectionApproach: boolean;
}): ScenarioResult {
  const fixture = roadContextFixture(false),
    scope = { sessionId: `056-${input.id}`, worldEpoch: 0 },
    actor: BehaviorActor = { id: 'taxi-cruise', incarnation: 1 },
    road = createRoadContext(fixture.map, { priorityPolicy: fixture.policy }),
    behavior = createBehaviorFSM(scope),
    plan = fixture.graph.getDirectedPath('west-in')!,
    [a, b] = plan.points,
    headingRad = Math.atan2(b.z - a.z, b.x - a.x),
    positionM = { x: (a.x + b.x) / 2, y: 0.8, z: (a.z + b.z) / 2 },
    tick = 12;
  behavior.setActors([actor], scope);
  let target: CruiseTarget | null = null;
  const checks: ScenarioCheck[] = [];
  try {
    const frame: RoadContextFrame = {
      ...scope,
      tick,
      vehicles: [
        {
          id: actor.id,
          incarnation: actor.incarnation,
          positionM,
          headingRad,
          access: 'TAXI',
          speedMps: 0,
          radiusM: 2.5,
          route: { intersectionId: 'junction', movementId: 'west-straight' },
          distances: [],
        },
      ],
      obstacles: [],
      zones: [],
      signals: [],
      completeness: { vehicles: true, obstacles: true, zones: true, signals: false },
    };
    road.updateFrame(frame);
    const full = road.getContext(actor.id, { force: true })!,
      context = projectBehaviorContext(full)!,
      profile = compileCruiseProfile(styleProfile(input.overrides, `056-${input.id}-v1`)),
      decision = behavior.decide({
        ...scope,
        actor,
        decisionTick: tick,
        context,
        facts: baseFacts(profile.versionId),
      });
    if (full.lane === null) throw new Error('056 cruise fixture has no authored lane');
    target = evaluateCruiseTarget({
      ...scope,
      actor,
      decisionTick: tick,
      authority: 'AUTO',
      profile,
      context,
      behavior: decision,
      facts: {
        version: '046-road-facts-v1',
        ...scope,
        subject: actor,
        sourceTick: tick,
        laneId: context.laneId!,
        roadKind: input.roadKind,
        postedLimitMps: full.lane.lane.speedLimitMps,
        curveRadiusM: input.curveRadiusM,
        intersectionApproach: input.intersectionApproach,
      },
      mechanics: {
        version: '031-coverage-046-v1',
        classId: 'sedan',
        classVersion: '023-mechanics-v1',
        surface: 'dry-asphalt',
        surfaceVersion: '026-flat-surfaces-v1',
      },
    });
    const values = [
        profile.values.speed_delta_urban,
        profile.values.speed_delta_residential,
        profile.values.curve_lateral_accel,
        profile.values.intersection_approach_speed,
      ],
      expected = referenceCruise(
        values,
        input.roadKind,
        full.lane.lane.speedLimitMps,
        input.curveRadiusM,
        input.intersectionApproach,
        decision.state,
        vehicleClass('sedan', '023-mechanics-v1').turningRadiusM,
      ),
      expectedRoad = Math.max(
        0,
        full.lane.lane.speedLimitMps + values[input.roadKind === 'URBAN' ? 0 : 1],
      ),
      expectedCurve =
        input.curveRadiusM === null ? null : Math.sqrt(values[2] * input.curveRadiusM),
      expectedApproach = input.intersectionApproach ? values[3] : null,
      expectedReason =
        expected < Math.min(expectedRoad, expectedCurve ?? Infinity, expectedApproach ?? Infinity)
          ? 'MECHANICAL_COVERAGE_CAP'
          : expectedApproach !== null && expected === expectedApproach
            ? 'INTERSECTION_APPROACH'
            : expectedCurve !== null && expected === expectedCurve
              ? 'CURVE_PREFERENCE'
              : 'FREE_ROAD';
    checks.push(
      checkEqual(
        'behavior state',
        'FOLLOW',
        decision.state,
        'real045 state over the authored044 lane',
      ),
      checkEqual(
        'behavior reason',
        'FOLLOW_LANE',
        decision.reason,
        'no leader is authored on this lane',
      ),
      checkEqual('cruise target', expected, target.targetMps, 'independent046 formula'),
      checkEqual('cruise reason', expectedReason, target.reason, 'documented046 reason priority'),
      checkNumber(
        'preferred road speed',
        expectedRoad,
        target.preferredRoadMps,
        1e-9,
        'posted plus style delta',
      ),
      checkNumber(
        'preferred curve speed',
        expectedCurve,
        target.preferredCurveMps,
        1e-9,
        'sqrt(lateral accel * radius)',
      ),
      checkNumber(
        'preferred approach speed',
        expectedApproach,
        target.preferredApproachMps,
        1e-9,
        'explicit approach fact',
      ),
      checkTrue(
        'target is positive',
        target.targetMps > 0,
        target.targetMps,
        'the authored road is traversable',
      ),
      checkEqual(
        'source tick',
        context.sourceTick,
        target.sourceTick,
        'target retains the real044 source tick',
      ),
    );
  } finally {
    behavior.dispose();
    road.dispose();
  }
  return scenarioResult({
    id: input.id,
    behavior: 'cruise',
    title: input.title,
    oracle: 'referenceCruise (046 formula: min(posted+delta, sqrt(a*radius), approach, 30))',
    ticks: tick,
    checks,
  });
}

/** Scenario04: the real050 policy on the real036/044/045 fixture for every addressed actor. */
function signalScenario(): ScenarioResult {
  const fixture = signalProbeFixture(),
    frame = fixture.frame,
    sessionId = frame.sessionId,
    actors = frame.vehicles.map(({ id, incarnation }) => ({ id, incarnation })),
    profile = projectSignalProfile(
      styleProfile(
        {
          red_stop_probability: 1,
          green_start_delay: SIGNAL_VALUES[1],
          red_stop_line_offset: SIGNAL_VALUES[2],
          late_red_brake_threshold: SIGNAL_VALUES[3],
        },
        '056-signal-v1',
      ),
    ),
    base = baseFacts(profile.versionId),
    subject = frame.vehicles.find((vehicle) => vehicle.route?.movementId === 'west-straight')!,
    seed = deriveVehicleSeed(deriveScenarioSeed(2, sessionId), subject.id),
    checks: ScenarioCheck[] = [],
    states = { red: [] as string[], green: [] as string[] },
    reasons = { red: [] as string[], green: [] as string[] };
  let decisions = 0,
    oracleMismatches = 0,
    redStops = 0,
    greenReleases = 0;
  if (subject === undefined) throw new Error('056 signal fixture has no west-straight subject');
  const run = runCadence({
    sessionId,
    actors,
    ticks: 120,
    beforeTick: (tick) => fixture.prepare(tick),
    decide(actor, tick) {
      const context = fixture.context.getContext(actor.id)!,
        signal = context.signal,
        phaseStartedTick =
          signal === null ? 0 : (fixture.signals.getSignal(signal.signalId)?.phaseStartedTick ?? 0),
        opportunityKey = signalOpportunityKey({
          sessionId,
          worldEpoch: 0,
          vehicleId: actor.id,
          incarnation: actor.incarnation,
          intersectionId: signal?.intersectionId ?? 'junction',
          movementId: signal?.movementId ?? subject.route!.movementId,
          phaseStartedTick,
        }),
        sample = addressedComplianceSample(seed, opportunityKey, 'red-compliance'),
        observation =
          signal === null
            ? null
            : {
                version: SIGNAL_POLICY_LIMITS.observationVersion,
                units: 'SI' as const,
                tick: Math.max(0, tick - 1),
                signalId: signal.signalId,
                intersectionId: signal.intersectionId,
                movementId: signal.movementId,
                phaseId: signal.phaseId,
                state: signal.state,
                phaseElapsedS: Math.max(0, (tick - phaseStartedTick) / 60),
                distanceToStopLineM:
                  context.lane === null || context.laneId === null
                    ? null
                    : fixture.stopLineDistanceM(context.laneId, context.lane.positionM),
              },
        decision = evaluateSignalPolicy({
          sessionId,
          worldEpoch: 0,
          actor,
          decisionTick: tick,
          speedMps: actor.id === subject.id ? 8 : 6,
          seed,
          opportunityKey,
          profile,
          observation,
        }),
        composed = signalBehaviorFacts(base, decision),
        outcome = fixture.behavior.decide({
          sessionId,
          worldEpoch: 0,
          actor,
          decisionTick: tick,
          context: projectBehaviorContext(context)!,
          facts: composed ?? baseFacts(profile.versionId),
        });
      decisions++;
      const expected =
        observation === null
          ? null
          : referenceSignal({
              redStopProbability: profile.redStopProbability,
              greenStartDelayS: profile.greenStartDelayS,
              redStopLineOffsetM: profile.redStopLineOffsetM,
              lateRedBrakeThresholdS: profile.lateRedBrakeThresholdS,
              state: observation.state,
              phaseElapsedS: observation.phaseElapsedS,
              distanceToStopLineM: observation.distanceToStopLineM,
              speedMps: actor.id === subject.id ? 8 : 6,
              complianceSample: sample,
            });
      if (observation === null) {
        if (decision.action !== 'PROCEED' || decision.reason !== 'NO_SIGNAL') oracleMismatches++;
      } else if (
        expected === null ||
        decision.action !== expected.action ||
        decision.reason !== expected.reason
      )
        oracleMismatches++;
      if (actor.id !== subject.id) return;
      if (observation !== null && decision.sampledUnit === sample && tick <= 18)
        checks.push(
          checkEqual(
            `addressed sample ${tick}`,
            expected?.action ?? 'UNKNOWN',
            decision.action,
            'one addressed sample per identified opportunity',
          ),
        );
      const window = tick <= 60 ? 'red' : 'green';
      states[window].push(outcome.state);
      reasons[window].push(decision.reason);
      if (decision.stopRequested) redStops++;
      if (decision.reason === 'GREEN_RELEASE') greenReleases++;
      const expectedState = expected?.stopRequested ? 'STOP' : 'FOLLOW';
      checks.push(
        checkEqual(
          `subject${tick} behavior state`,
          expectedState,
          outcome.state,
          '045 composes the real050 intent',
        ),
      );
    },
  });
  checks.push(
    checkEqual('decision count', actors.length * 20, decisions, 'real219 six-phase10Hz addressing'),
    checkEqual('red window states', 'STOP', states.red[0], 'the cautious profile stops on red'),
    checkEqual('green window states', 'FOLLOW', states.green[0], 'green releases the stop'),
    checkTrue('red stop requests observed', redStops > 0, redStops, 'stopRequested only on red'),
    checkTrue(
      'red stop-line reasons',
      reasons.red.every((reason) => reason === 'STOP_LINE_APPROACH' || reason === 'STOP_LINE_HOLD'),
      reasons.red.join(','),
      'the cautious profile reports the authored stop line',
    ),
    checkTrue(
      'green releases observed',
      greenReleases > 0,
      greenReleases,
      'GREEN_RELEASE observed',
    ),
    checkTrue(
      'green release reasons',
      reasons.green.every((reason) => reason === 'GREEN_RELEASE'),
      reasons.green.join(','),
      'the green phase releases the stop',
    ),
    checkEqual(
      'oracle mismatches',
      0,
      oracleMismatches,
      'every decision matches the independent050 oracle',
    ),
    checkEqual('input calls', 120, run.inputCalls, 'input remains60Hz'),
    checkEqual('physics calls', 120, run.physicsCalls, 'physics remains60Hz'),
  );
  run.dispose();
  fixture.dispose();
  return scenarioResult({
    id: 'signal-red-green',
    behavior: 'signals',
    title: 'Cautious taxi stops on red and leaves on green',
    oracle: 'referenceSignal (050 green release, red stop line, late-red and crossing table)',
    ticks: 120,
    checks,
  });
}

/** Scenario05: real037/051 full-stop profile versus rolling profile. */
function stopScenario(): ScenarioResult {
  function runStop(variant: 'cautious' | 'rolling') {
    const fixture = stopProbeFixture(),
      sessionId = `056-stop-${variant}`,
      actor: BehaviorActor = { id: 'taxi-stop', incarnation: 1 },
      profile = projectStopProfile(
        styleProfile(
          {
            stop_full_probability: variant === 'cautious' ? 1 : 0,
            stop_dwell_time: STOP_VALUES[1],
            stop_line_offset: STOP_VALUES[2],
          },
          `056-stop-${variant}-v1`,
        ),
      ),
      base = baseFacts(profile.versionId),
      behavior = createBehaviorFSM({ sessionId, worldEpoch: 0 }),
      seed = deriveVehicleSeed(deriveScenarioSeed(2, sessionId), actor.id),
      frames = stopApproachProfile({
        ticks: 180,
        stopPointM: fixture.stopLineLongitudinalM - 1,
        holdTicks: 45,
        stepM: 0.15,
      });
    behavior.setActors([actor], { sessionId, worldEpoch: 0 });
    let opportunityId: string | null = null,
      crossed = false,
      stationaryDurationS = 0,
      pending = frames[0],
      oracleMismatches = 0,
      factsUnavailable = 0;
    const states: string[] = [],
      reasons: string[] = [];
    const run = runCadence({
      sessionId,
      actors: [actor],
      ticks: 180,
      beforeTick: (tick) => {
        pending = frames[tick - 1];
        const events = fixture.rules.observe({
          ...fixture.context,
          tick,
          vehicleId: actor.id,
          incarnation: 'taxi-1',
          laneId: 'lane-a',
          access: 'TAXI',
          frontPositionM: { x: pending.xM, y: 0, z: 0 },
          headingRad: 0,
          speedMps: pending.speedMps,
          discontinuity: false,
        });
        for (const event of events) {
          if (event.type === 'STOP_APPROACH') opportunityId = event.payload.opportunityId;
          if (event.type === 'STOP_LINE_CROSSED') crossed = true;
        }
        stationaryDurationS = pending.speedMps === 0 ? stationaryDurationS + 1 / 60 : 0;
      },
      decide(_subject, tick) {
        const observation =
            opportunityId === null
              ? null
              : {
                  version: STOP_POLICY_LIMITS.observationVersion,
                  units: 'SI' as const,
                  tick: tick - 1,
                  opportunityId,
                  stopLineId: fixture.map.stopLines[0].id,
                  distanceToStopLineM: fixture.stopLineLongitudinalM - pending.xM,
                  speedMps: pending.speedMps,
                  stationaryDurationS: stationaryDurationS > 0 ? stationaryDurationS : null,
                  crossed,
                },
          sample =
            opportunityId === null
              ? null
              : addressedComplianceSample(
                  deriveVehicleSeed(deriveScenarioSeed(2, sessionId), actor.id),
                  opportunityId,
                  'full-stop',
                ),
          decision = evaluateStopPolicy({
            sessionId,
            worldEpoch: 0,
            actor,
            decisionTick: tick,
            seed,
            profile,
            leaderStop: 'NONE',
            observation,
          }),
          composed = stopBehaviorFacts(base, decision),
          outcome = behavior.decide({
            sessionId,
            worldEpoch: 0,
            actor,
            decisionTick: tick,
            context: {
              sessionId,
              worldEpoch: 0,
              sourceTick: tick,
              subject: actor,
              laneId: 'lane-a',
              leaderId: null,
              vehiclesComplete: true,
              discontinuity: false,
            },
            facts: composed ?? baseFacts(profile.versionId),
          });
        if (composed === null) factsUnavailable++;
        if (
          observation !== null &&
          sample !== null &&
          referenceStop({
            stopFullProbability: profile.stopFullProbability,
            stopDwellTimeS: profile.stopDwellTimeS,
            stopLineOffsetM: profile.stopLineOffsetM,
            distanceToStopLineM: observation.distanceToStopLineM,
            stationaryDurationS: observation.stationaryDurationS,
            crossed: observation.crossed,
            fullStopSample: sample,
          }).action !== decision.action
        )
          oracleMismatches++;
        states.push(outcome.state);
        reasons.push(decision.reason);
        if (variant === 'cautious') {
          checkEqual(
            `stop${tick} action`,
            observation === null
              ? 'UNKNOWN'
              : referenceStop({
                  stopFullProbability: profile.stopFullProbability,
                  stopDwellTimeS: profile.stopDwellTimeS,
                  stopLineOffsetM: profile.stopLineOffsetM,
                  distanceToStopLineM: observation.distanceToStopLineM,
                  stationaryDurationS: observation.stationaryDurationS,
                  crossed: observation.crossed,
                  fullStopSample: sample!,
                }).action,
            decision.action,
            'independent051 stop table',
          );
        }
      },
    });
    run.dispose();
    fixture.rules.dispose();
    return { states, reasons, oracleMismatches, factsUnavailable };
  }
  const cautious = runStop('cautious'),
    rolling = runStop('rolling'),
    checks = [
      checkTrue(
        'cautious stop state',
        cautious.states.includes('STOP'),
        cautious.states.join(','),
        'full-stop profile stops',
      ),
      checkTrue(
        'cautious dwell release',
        cautious.reasons.includes('DWELL_SATISFIED'),
        cautious.reasons.join(','),
        'release only after the configured stationary proof',
      ),
      checkEqual(
        'cautious final state',
        'FOLLOW',
        cautious.states[cautious.states.length - 1],
        'the release returns the ordinary chain',
      ),
      checkEqual(
        'cautious oracle mismatches',
        0,
        cautious.oracleMismatches,
        'every cautious decision matches the independent051 oracle',
      ),
      checkTrue(
        'rolling never requests a stop',
        rolling.states.every((state) => state === 'FOLLOW'),
        rolling.states.join(','),
        'the rolling profile is distinguished without a hidden clamp',
      ),
      checkEqual(
        'rolling oracle mismatches',
        0,
        rolling.oracleMismatches,
        'every rolling decision matches the independent051 oracle',
      ),
      checkEqual(
        'bridge availability',
        0,
        cautious.factsUnavailable + rolling.factsUnavailable,
        'real observations produce facts',
      ),
    ];
  return scenarioResult({
    id: 'stop-rule-profiles',
    behavior: 'stop',
    title: 'Full stop profile dwells while rolling profile does not invent a stop',
    oracle: 'referenceStop (051 full/rolling sample, offset, dwell, crossing)',
    ticks: 360,
    checks,
  });
}

/** A tiny deterministic longitudinal plant for the route/junction scenario. Not a physics claim. */
function integratePlant(
  speedMps: number,
  distanceM: number,
  accelerationMps2: number,
  dt = 1 / 60,
) {
  const speed = Math.max(0, speedMps + accelerationMps2 * dt);
  return { speedMps: speed, distanceM: distanceM + speed * dt };
}
function routeFixture() {
  const fixture = roadContextFixture(false),
    scope = { sessionId: '056-route', worldEpoch: 0 },
    eventBus = createEventBus(scope),
    map = fixture.map,
    [red, green] = map.signals[0].phases;
  red.durationS = 4;
  green.durationS = 4;
  const signals = createSignalController(map, {
      context: { schemaVersion: 1, units: 'SI', ...scope },
      eventBus,
      initialTick: 0,
    }),
    road = createRoadContext(map, { priorityPolicy: fixture.policy }),
    path = fixture.graph.getDirectedPath('west-in')!,
    [a, b] = path.points,
    headingRad = Math.atan2(b.z - a.z, b.x - a.x),
    pointAt = (distanceM: number) => {
      const ratio = Math.max(0, Math.min(1, distanceM / path.lengthM));
      return {
        x: a.x + (b.x - a.x) * ratio,
        y: a.y + (b.y - a.y) * ratio,
        z: a.z + (b.z - a.z) * ratio,
      };
    };
  return {
    scope,
    map,
    path,
    headingRad,
    pointAt,
    stopLineDistanceM: (distanceM: number) => Math.max(0, path.lengthM - distanceM),
    prepare(tick: number, distanceM: number, actor: BehaviorActor) {
      signals.step(tick);
      const frame: RoadContextFrame = {
        ...scope,
        tick,
        vehicles: [
          {
            id: actor.id,
            incarnation: actor.incarnation,
            positionM: pointAt(distanceM),
            headingRad,
            access: 'TAXI',
            speedMps: 0,
            radiusM: 2.5,
            route: { intersectionId: 'junction', movementId: 'west-straight' },
            distances: [],
          },
        ],
        obstacles: [],
        zones: [],
        signals: map.intersections[0].movements.map((movement) =>
          signals.getMovementSignal('junction', movement.id)!,
        ),
        completeness: { vehicles: true, obstacles: true, zones: true, signals: true },
      };
      road.updateFrame(frame);
      return road.getContext(actor.id, { force: true })!;
    },
    phaseStartedTick(signalId: string) {
      return signals.getSignal(signalId)?.phaseStartedTick ?? 0;
    },
    dispose() {
      road.dispose();
      signals.dispose();
      eventBus.dispose();
    },
  };
}

/** Scenario06/07: cautious and risky profile traversing the same authored junction route. */
function junctionRouteScenario(variant: 'cautious' | 'risky'): ScenarioResult {
  const fixture = routeFixture(),
    actor: BehaviorActor = { id: `taxi-route-${variant}`, incarnation: 1 },
    scope = fixture.scope,
    behavior = createBehaviorFSM(scope),
    published = styleProfile(
      {
        red_stop_probability: variant === 'cautious' ? 1 : 0,
        green_start_delay: SIGNAL_VALUES[1],
        red_stop_line_offset: SIGNAL_VALUES[2],
        late_red_brake_threshold: variant === 'cautious' ? SIGNAL_VALUES[3] : 3,
      },
      `056-route-${variant}-v1`,
    ),
    cruise = compileCruiseProfile(published),
    longitudinal = compileLongitudinalProfile(published),
    signal = projectSignalProfile(published),
    policy = createLongitudinalController(scope),
    seed = deriveVehicleSeed(deriveScenarioSeed(5, fixture.scope.sessionId), actor.id);
  behavior.setActors([actor], scope);
  policy.setActors([actor], scope);
  let speedMps = 8,
    distanceM = fixture.path.lengthM - 22,
    target: CruiseTarget | null = null,
    crossedTick: number | null = null,
    crossedSignalState: string | null = null,
    oracleMismatches = 0,
    cautiousStops = 0,
    stopLineHoldReason = false;
  const checks: ScenarioCheck[] = [];
  for (let tick = 1; tick <= 600 && crossedTick === null; tick++) {
    const context = fixture.prepare(tick, distanceM, actor),
      projected = projectBehaviorContext(context);
    if (projected === null || context.laneId === null) break;
    if (tick % 6 === 1) {
      const signalState = context.signal,
        phaseStartedTick =
          signalState === null ? 0 : fixture.phaseStartedTick(signalState.signalId),
        opportunityKey = signalOpportunityKey({
          sessionId: fixture.scope.sessionId,
          worldEpoch: 0,
          vehicleId: actor.id,
          incarnation: actor.incarnation,
          intersectionId: signalState?.intersectionId ?? 'junction',
          movementId: signalState?.movementId ?? 'west-straight',
          phaseStartedTick,
        }),
        sample = addressedComplianceSample(seed, opportunityKey, 'red-compliance'),
        observation =
          signalState === null
            ? null
            : {
                version: SIGNAL_POLICY_LIMITS.observationVersion,
                units: 'SI' as const,
                tick: tick - 1,
                signalId: signalState.signalId,
                intersectionId: signalState.intersectionId,
                movementId: signalState.movementId,
                phaseId: signalState.phaseId,
                state: signalState.state,
                phaseElapsedS: Math.max(0, (tick - phaseStartedTick) / 60),
                distanceToStopLineM: fixture.stopLineDistanceM(distanceM),
              },
        signalDecision = evaluateSignalPolicy({
          sessionId: fixture.scope.sessionId,
          worldEpoch: 0,
          actor,
          decisionTick: tick,
          speedMps,
          seed,
          opportunityKey,
          profile: signal,
          observation,
        }),
        decision = behavior.decide({
          ...scope,
          actor,
          decisionTick: tick,
          context: projected,
          facts:
            signalBehaviorFacts(baseFacts(signal.versionId), signalDecision) ??
            baseFacts(signal.versionId),
        });
      if (observation !== null) {
        const expected = referenceSignal({
          redStopProbability: signal.redStopProbability,
          greenStartDelayS: signal.greenStartDelayS,
          redStopLineOffsetM: signal.redStopLineOffsetM,
          lateRedBrakeThresholdS: signal.lateRedBrakeThresholdS,
          state: observation.state,
          phaseElapsedS: observation.phaseElapsedS,
          distanceToStopLineM: observation.distanceToStopLineM,
          speedMps,
          complianceSample: sample,
        });
        if (expected.action !== signalDecision.action) oracleMismatches++;
        if (expected.reason === 'STOP_LINE_HOLD' || expected.reason === 'STOP_LINE_APPROACH')
          stopLineHoldReason = true;
      }
      if (decision.state === 'STOP') cautiousStops++;
      const roadFacts = {
          version: '046-road-facts-v1' as const,
          ...scope,
          subject: actor,
          sourceTick: tick,
          laneId: projected.laneId!,
          roadKind: 'URBAN' as const,
          postedLimitMps: context.lane?.lane.speedLimitMps ?? 10,
          curveRadiusM: null,
          intersectionApproach: false,
        },
        expectedTarget = referenceCruise(
          [
            cruise.values.speed_delta_urban,
            cruise.values.speed_delta_residential,
            cruise.values.curve_lateral_accel,
            cruise.values.intersection_approach_speed,
          ],
          'URBAN',
          roadFacts.postedLimitMps,
          null,
          false,
          decision.state,
          vehicleClass('sedan', '023-mechanics-v1').turningRadiusM,
        );
      target = evaluateCruiseTarget({
        ...scope,
        actor,
        decisionTick: tick,
        authority: 'AUTO',
        profile: cruise,
        context: projected,
        behavior: decision,
        facts: roadFacts,
        mechanics: {
          version: '031-coverage-046-v1',
          classId: 'sedan',
          classVersion: '023-mechanics-v1',
          surface: 'dry-asphalt',
          surfaceVersion: '026-flat-surfaces-v1',
        },
      });
      if (target.targetMps !== expectedTarget) oracleMismatches++;
    }
    const realized = policy.step({
      ...scope,
      actor,
      tick,
      authority: 'AUTO',
      profile: longitudinal,
      target,
      observation: {
        version: '047-observation-v1',
        units: 'SI',
        ...scope,
        actor,
        tick,
        longitudinalSpeedMps: speedMps,
        classId: 'sedan',
        classVersion: '023-mechanics-v1',
      },
    });
    if (target === null) throw new Error('056 route target missing');
    if (realized.targetMps !== null && realized.command.vehicleId !== actor.id)
      throw new Error('056 route command identity');
    const integrated = integratePlant(speedMps, distanceM, realized.accelerationMps2);
    speedMps = integrated.speedMps;
    distanceM = Math.min(fixture.path.lengthM + 0.01, integrated.distanceM);
    if (distanceM >= fixture.path.lengthM && crossedTick === null) {
      crossedTick = tick;
      crossedSignalState = context.signal?.state ?? null;
    }
  }
  const finalSignalState = crossedSignalState;
  checks.push(
    checkTrue(
      'route authored length',
      fixture.path.lengthM > 22,
      fixture.path.lengthM,
      'the route has an approach before the line',
    ),
    checkTrue(
      'route crossed the stop line',
      crossedTick !== null,
      crossedTick,
      'the authored route reaches the intersection line',
    ),
    checkTrue(
      'route oracle mismatches',
      oracleMismatches === 0,
      oracleMismatches,
      '050 and046 decisions match the independent formulas on the real chain',
    ),
    checkEqual(
      'route consequence profile',
      variant === 'cautious' ? 'STOP' : 'FOLLOW',
      variant === 'cautious' ? (cautiousStops > 0 ? 'STOP' : 'NONE') : 'FOLLOW',
      'cautious profile stops; risky profile keeps the cruise target',
    ),
  );
  if (crossedTick !== null) {
    checks.push(
      checkEqual(
        'crossed signal state',
        variant === 'cautious' ? 'GREEN' : 'RED',
        finalSignalState,
        variant === 'cautious'
          ? 'the cautious profile waits for green'
          : 'the risky profile crosses during its committed red',
      ),
      checkTrue(
        'crossing happened on the expected side of the phase',
        variant === 'cautious' ? crossedTick > 240 : crossedTick < 240,
        crossedTick,
        'red phase is the first240 authored ticks',
      ),
    );
  }
  if (variant === 'cautious')
    checks.push(
      checkTrue(
        'cautious stop line reason',
        stopLineHoldReason,
        stopLineHoldReason,
        '050 reports a stop-line decision at the authored line',
      ),
    );
  behavior.dispose();
  policy.dispose();
  fixture.dispose();
  return scenarioResult({
    id: `route-junction-${variant}`,
    behavior: 'cruise/signals/accelerate',
    title:
      variant === 'cautious'
        ? 'Cautious taxi stops at the red line and crosses on green'
        : 'Risky taxi commits and crosses on red with a documented reason',
    oracle:
      'referenceSignal + referenceCruise + referenceBehavior over the real044/045/046/047 chain',
    ticks: 600,
    checks,
  });
}

/** Scenario08: real044/045/046/048 following target and the real047 command admission. */
function followingScenario(): ScenarioResult {
  const sessionId = '056-follow',
    scope = { sessionId, worldEpoch: 0 },
    actor: BehaviorActor = { id: 'taxi-follow', incarnation: 1 },
    profile = compileFollowingProfile(
      autoScenarioProfile(
        {
          following_time_headway: FOLLOWING_VALUES[0],
          following_min_gap: FOLLOWING_VALUES[1],
          queue_standstill_gap: FOLLOWING_VALUES[2],
          following_speed_gain: FOLLOWING_VALUES[3],
        },
        '056-follow-v1',
      ),
    ),
    fixture = createFollowingTargetFixture(profile.longitudinal.cruise, actor, scope),
    longitudinal = createLongitudinalController(scope);
  longitudinal.setActors([actor], scope);
  const checks: ScenarioCheck[] = [];
  try {
    const stationary = fixture.input(6, 8, 8, 0, 'leader', 1, 20),
      stationaryTarget = evaluateFollowingTarget({
        cruiseInput: stationary.cruiseInput,
        roadContext: stationary.roadContext,
        observation: stationary.observation,
        profile,
      }),
      stationaryOracle = referenceFollowing(FOLLOWING_VALUES, 8, 0, 8, stationary.cruise.targetMps),
      moving = fixture.input(12, 8, 20, 6, 'leader', 2, 20),
      movingTarget = evaluateFollowingTarget({
        cruiseInput: moving.cruiseInput,
        roadContext: moving.roadContext,
        observation: moving.observation,
        profile,
      }),
      movingOracle = referenceFollowing(FOLLOWING_VALUES, 8, 6, 20, moving.cruise.targetMps);
    let realized: ReturnType<typeof longitudinal.step> | null = null;
    for (let tick = 1; tick <= 12; tick++) {
      realized = longitudinal.step({
        ...scope,
        actor,
        tick,
        authority: 'AUTO',
        profile: profile.longitudinal,
        target: tick === 12 ? movingTarget.target : tick >= 6 ? stationaryTarget.target : null,
        observation: {
          version: '047-observation-v1',
          units: 'SI',
          ...scope,
          actor,
          tick,
          longitudinalSpeedMps: 8,
          classId: 'sedan',
          classVersion: '023-mechanics-v1',
        },
      });
    }
    checks.push(
      checkEqual(
        'stationary reason',
        'QUEUE_GAP',
        stationaryTarget.reason,
        'a stopped leader uses the queue gap',
      ),
      checkNumber(
        'stationary desired gap',
        stationaryOracle.desiredGapM,
        stationaryTarget.desiredGapM,
        1e-9,
        '052/048 queue formula',
      ),
      checkNumber(
        'stationary following speed',
        stationaryOracle.targetMps,
        stationaryTarget.target.targetMps,
        1e-9,
        '048 speed/gap formula',
      ),
      checkEqual(
        'stationary leader id',
        'leader',
        stationaryTarget.leader?.id ?? null,
        'real044 leader identity',
      ),
      checkEqual(
        'moving reason',
        'FOLLOWING_GAP',
        movingTarget.reason,
        'a moving leader uses headway',
      ),
      checkNumber(
        'moving desired gap',
        movingOracle.desiredGapM,
        movingTarget.desiredGapM,
        1e-9,
        '048 headway formula',
      ),
      checkNumber(
        'moving following speed',
        movingOracle.targetMps,
        movingTarget.target.targetMps,
        1e-9,
        '048 speed/gap formula',
      ),
      checkEqual(
        'moving cruise bound',
        true,
        movingTarget.target.targetMps <= moving.cruise.targetMps,
        'following can only reduce the046 target',
      ),
      checkEqual(
        'command identity',
        actor.id,
        realized!.command.vehicleId,
        'real047 returns a common024 command for the actor',
      ),
      checkTrue(
        'command finite',
        Number.isFinite(realized!.command.brake) && Number.isFinite(realized!.command.throttle),
        realized!.command.brake,
        'no nonfinite actuator command',
      ),
    );
  } finally {
    longitudinal.dispose();
    fixture.dispose();
  }
  return scenarioResult({
    id: 'follow-leader',
    behavior: 'follow',
    title: 'Following a stopped and a moving leader over the real044/045/046 chain',
    oracle: 'referenceFollowing (048 queue/headway gaps and speed formula)',
    ticks: 12,
    checks,
  });
}

/** Scenario09: real052 yield interval over explicit038 priority facts and real045 composition. */
function yieldScenario(): ScenarioResult {
  const sessionId = '056-yield',
    scope = { sessionId, worldEpoch: 0 },
    actor: BehaviorActor = { id: 'taxi-yield', incarnation: 1 },
    published = autoScenarioProfile({ yield_time_gap: YIELD_VALUE }, '056-yield-v1'),
    profile = projectYieldProfile(published),
    base = baseFacts(published.versionId),
    relationId = 'west-straight/south-straight',
    fixture = roadContextFixture(false),
    road = createRoadContext(fixture.map, { priorityPolicy: fixture.policy }),
    behavior = createBehaviorFSM(scope),
    checks: ScenarioCheck[] = [],
    input = (arrivalEntryS: number, arrivalExitS: number, decisionTick: number) => ({
      version: '052-yield-interval-v1' as const,
      units: 'SI' as const,
      sessionId,
      worldEpoch: 0,
      subjectId: actor.id,
      observationTick: decisionTick - 1,
      decisionTick,
      profile,
      coverage: 'COMPLETE_HORIZON' as const,
      horizonS: 30,
      discontinuity: false,
      actors: [
        { id: actor.id, incarnation: 1, active: true, observable: true, routeKnown: true },
        {
          id: 'civil-yield',
          incarnation: 1,
          active: true,
          observable: true,
          routeKnown: true,
        },
      ],
      candidates: [{ relationId, entryS: 1, exitS: 2 }],
      pairs: [
        {
          relationId,
          otherActorId: 'civil-yield',
          priority: 'YIELD' as const,
          arrival: {
            state: 'APPROACHING' as const,
            timeToEntryS: arrivalEntryS,
            timeToExitS: arrivalExitS,
          },
        },
      ],
    });
  behavior.setActors([actor], scope);
  const plan = fixture.graph.getDirectedPath('west-in')!,
    [a, b] = plan.points,
    frame: RoadContextFrame = {
      ...scope,
      tick: 60,
      vehicles: [
        {
          id: actor.id,
          incarnation: 1,
          positionM: { x: (a.x + b.x) / 2, y: 0.8, z: (a.z + b.z) / 2 },
          headingRad: Math.atan2(b.z - a.z, b.x - a.x),
          access: 'TAXI',
          speedMps: 8,
          radiusM: 2.5,
          route: { intersectionId: 'junction', movementId: 'west-straight' },
          distances: [],
        },
      ],
      obstacles: [],
      zones: [],
      signals: [],
      completeness: { vehicles: true, obstacles: true, zones: true, signals: false },
    };
  road.updateFrame(frame);
  const context = projectBehaviorContext(road.getContext(actor.id, { force: true })!)!;
  const exercise = (entryS: number, exitS: number, decisionTick: number) => {
    const packet = input(entryS, exitS, decisionTick),
      decision = evaluateYieldPolicy(packet),
      oracle = referenceYield(packet),
      facts = referenceYieldFacts(base, oracle.action),
      outcome =
        facts === null
          ? behavior.decide({
              ...scope,
              actor,
              decisionTick,
              context,
              facts: null,
            })
          : behavior.decide({
              ...scope,
              actor,
              decisionTick,
              context,
              facts: yieldBehaviorFacts(base, decision)!,
            });
    checks.push(
      checkEqual(
        'yield action',
        oracle.action,
        decision.action,
        '052 interval separation and complete-horizon rule',
      ),
      checkEqual('yield reason', oracle.reason, decision.reason, '052 documented reason'),
      checkNumber(
        'yield minimum gap',
        oracle.minimumGapS,
        decision.minimumGapS,
        1e-9,
        'signed interval separation',
      ),
      checkEqual(
        'yield behavior state',
        oracle.action === 'REFUSE' ? 'YIELD' : 'FOLLOW',
        outcome.state,
        '045 composition of the real052 decision',
      ),
    );
  };
  // 2 s separation is below the 3 s profile; 3.5 s is above it.
  exercise(4, 5, 60);
  exercise(5.5, 6.5, 61);
  road.dispose();
  behavior.dispose();
  return scenarioResult({
    id: 'yield-conflict',
    behavior: 'yield',
    title: 'Yield refuses a short priority interval and accepts a clear one',
    oracle: 'referenceYield (052 signed interval gap against the published yield_time_gap)',
    ticks: 60,
    checks,
  });
}

/** Scenario10: real033 adjacency, real053 latch/cooldown and real046 cruise preservation. */
function laneChangeScenario(): ScenarioResult {
  const fixture = laneProbeFixture(),
    sessionId = '056-lane',
    scope = { sessionId, worldEpoch: 0 },
    actor: BehaviorActor = { id: 'taxi-lane', incarnation: 1 },
    published = autoScenarioProfile(
      {
        lane_change_front_gap: LANE_VALUES[0],
        lane_change_back_gap: LANE_VALUES[1],
        lane_change_speed_gain: LANE_VALUES[2],
        lane_change_cooldown: LANE_VALUES[3],
      },
      '056-lane-v1',
    ),
    profile = projectLaneChangeProfile(published),
    cruise = compileCruiseProfile(published),
    base = baseFacts(profile.versionId),
    behavior = createBehaviorFSM(scope),
    adjacency = fixture.adjacency('lane-a', 'TAXI'),
    completed = fixture.adjacency('lane-par', 'TAXI'),
    checks: ScenarioCheck[] = [];
  behavior.setActors([actor], scope);
  let latch: LaneChangeState = LANE_CHANGE_EMPTY_STATE,
    calls = 0,
    cruiseChecked = false;
  const run = runCadence({
    sessionId,
    actors: [actor],
    ticks: 60,
    decide(_subject, tick) {
      calls++;
      const committed = latch.committed !== null,
        targetLaneId = committed ? latch.committed!.targetLaneId : 'lane-par',
        afterRelease = calls > 6,
        observation = {
          version: '053-lane-observation-v1' as const,
          units: 'SI' as const,
          tick: tick - 1,
          targetLaneId: afterRelease ? 'lane-a' : targetLaneId,
          coverage: 'COMPLETE' as const,
          frontGapM: calls <= 2 ? 20 : 1,
          backGapM: calls <= 2 ? 18 : 1,
          targetLaneSpeedMps: calls <= 2 ? 12 : 14,
        },
        decision = evaluateLaneChange({
          sessionId,
          worldEpoch: 0,
          actor,
          decisionTick: tick,
          profile,
          state: latch,
          adjacency: afterRelease ? completed : adjacency,
          observation,
          speedMps: 8,
          ownLaneLeaderSpeedMps: 6,
          intent: 'OPTIONAL_OVERTAKE',
        }),
        oracle = referenceLaneChange({
          frontGapM: LANE_VALUES[0],
          backGapM: LANE_VALUES[1],
          speedGainMps: LANE_VALUES[2],
          cooldownS: LANE_VALUES[3],
          decisionTick: tick,
          neighbors: (afterRelease ? completed : adjacency).neighbors.map((entry) => entry.laneId),
          targetLaneId: observation.targetLaneId,
          coverage: observation.coverage,
          observedFrontGapM: observation.frontGapM,
          observedBackGapM: observation.backGapM,
          targetLaneSpeedMps: observation.targetLaneSpeedMps,
          speedMps: 8,
          ownLaneLeaderSpeedMps: 6,
          intent: 'OPTIONAL_OVERTAKE',
          committedTargetLaneId: latch.committed?.targetLaneId ?? null,
          lastChangeTick: latch.lastChangeTick,
        }),
        outcome = behavior.decide({
          ...scope,
          actor,
          decisionTick: tick,
          context: {
            sessionId,
            worldEpoch: 0,
            sourceTick: tick,
            subject: actor,
            laneId: 'lane-a',
            leaderId: null,
            vehiclesComplete: true,
            discontinuity: false,
          },
          facts: laneChangeBehaviorFacts(base, decision)!,
        });
      latch = decision.state;
      if (calls <= 8)
        checks.push(
          checkEqual(
            `lane${calls} action`,
            oracle.action,
            decision.action,
            '053 start gates and continuity',
          ),
          checkEqual(
            `lane${calls} reason`,
            oracle.reason,
            decision.reason,
            '053 documented reason',
          ),
          checkEqual(
            `lane${calls} behavior`,
            oracle.action === 'CHANGE' ? 'CHANGE_LANE' : 'FOLLOW',
            outcome.state,
            '045 composition of the real053 decision',
          ),
        );
      if (calls === 3 && !cruiseChecked) {
        cruiseChecked = true;
        const target = evaluateCruiseTarget({
          ...scope,
          actor,
          decisionTick: tick,
          authority: 'AUTO',
          profile: cruise,
          context: {
            sessionId,
            worldEpoch: 0,
            sourceTick: tick,
            subject: actor,
            laneId: 'lane-a',
            leaderId: null,
            vehiclesComplete: true,
            discontinuity: false,
          },
          behavior: outcome,
          facts: {
            version: '046-road-facts-v1',
            ...scope,
            subject: actor,
            sourceTick: tick,
            laneId: 'lane-a',
            roadKind: 'URBAN',
            postedLimitMps: 13.4,
            curveRadiusM: null,
            intersectionApproach: false,
          },
          mechanics: {
            version: '031-coverage-046-v1',
            classId: 'sedan',
            classVersion: '023-mechanics-v1',
            surface: 'dry-asphalt',
            surfaceVersion: '026-flat-surfaces-v1',
          },
        });
        checks.push(
          checkEqual(
            'CHANGE_LANE preserves cruise',
            true,
            target.targetMps > 0,
            '046 keeps the style reference',
          ),
          checkTrue(
            'CHANGE_LANE reason not zeroed',
            target.reason !== 'BEHAVIOR_CHANGE_LANE',
            target.reason,
            'validated lane change is not a hold',
          ),
        );
      }
    },
  });
  checks.push(
    checkEqual('lane decision count', 10, calls, 'six-phase cadence'),
    checkEqual(
      'lane committed released',
      null,
      latch.committed,
      'explicit release when the target is no longer adjacent',
    ),
    checkEqual(
      'lane cooldown preserved',
      true,
      latch.lastChangeTick !== null,
      'the release preserves the cooldown latch',
    ),
  );
  run.dispose();
  return scenarioResult({
    id: 'lane-change',
    behavior: 'lane-change',
    title: 'Optional overtake validates, keeps continuity and preserves the cruise reference',
    oracle: 'referenceLaneChange (053 gaps/cooldown/continuity/access-filtered adjacency)',
    ticks: 60,
    checks,
  });
}

/** Scenario11: real033/041/044/045 blocked recovery plus the inert re-entry plan. */
function blockedScenario(): ScenarioResult {
  const fixture = blockedProbeFixture(),
    sessionId = fixture.scope.sessionId,
    scope = { sessionId, worldEpoch: 0 },
    subject = fixture.subject,
    leader: BehaviorActor = { id: fixture.leaderId, incarnation: 1 },
    planner = fixture.planner(),
    base = planner.findRoute({ origin: 'lane-in', destination: 'lane-out', access: 'TAXI' }),
    checks: ScenarioCheck[] = [];
  if (base.path === null) throw new Error('056 blocked fixture base route');
  fixture.behavior.setActors([subject, leader], scope);
  let latch: BlockedRecoveryState = BLOCKED_RECOVERY_EMPTY_STATE,
    blockedLanes: string[] = [],
    task: ReturnType<typeof planner.createRouteTask> | null = null,
    taskDone = false,
    admitted = fixture.prepare(0),
    firstDecision: ReturnType<typeof evaluateBlockedRecovery> | null = null,
    firstReroutePath: readonly string[] | null = null,
    released = false,
    manualPlan: ReturnType<typeof evaluateAuthorityReentry> | null = null,
    reentryPlan: ReturnType<typeof evaluateAuthorityReentry> | null = null;
  const subjectStates: string[] = [];
  const physicalSpeed = (tick: number) => (tick >= 60 ? 8 : 0);
  const run = runCadence({
    sessionId,
    actors: [subject, leader],
    ticks: 120,
    beforeTick: (tick) => {
      fixture.physical.subjectSpeedMps = physicalSpeed(tick);
      fixture.physical.leaderSpeedMps = physicalSpeed(tick);
      admitted = fixture.prepare(tick);
      if (task !== null && !taskDone)
        for (let slice = 0; slice < 4 && !taskDone; slice++) {
          const stepped = task.step({ tick, maxExpansions: 16 });
          taskDone = stepped.done;
          if (stepped.path !== null) firstReroutePath = stepped.path;
        }
    },
    decide(actor, tick) {
      const context = fixture.context.getContext(actor.id);
      if (context === null) throw new Error('056 blocked context missing');
      if (actor.id !== subject.id) return;
      if (tick >= 96 && manualPlan === null) {
        manualPlan = evaluateAuthorityReentry({
          sessionId,
          worldEpoch: 0,
          actor: subject,
          decisionTick: tick,
          authority: 'MANUAL',
          graph: fixture.graph,
          observation: {
            version: '054-progress-observation-v1',
            units: 'SI',
            tick,
            access: 'TAXI',
            positionM: admitted.vehicles[0].positionM,
            headingRad: 0,
            routeStatus: 'READY',
            destination: 'lane-out',
            recoveryLaneId: 'lane-in',
            allowRecoveryEscalation: false,
          },
        });
      }
      if (tick >= 96 && reentryPlan === null) {
        reentryPlan = evaluateAuthorityReentry({
          sessionId,
          worldEpoch: 0,
          actor: subject,
          decisionTick: tick,
          authority: 'AUTO',
          graph: fixture.graph,
          observation: {
            version: '054-progress-observation-v1',
            units: 'SI',
            tick,
            access: 'TAXI',
            positionM: { x: 10, y: 0, z: 1.4 },
            headingRad: 0,
            routeStatus: 'READY',
            destination: 'lane-out',
            recoveryLaneId: 'lane-in',
            allowRecoveryEscalation: false,
          },
        });
      }
      const observation = {
          version: '054-progress-observation-v1' as const,
          units: 'SI' as const,
          tick,
          access: 'TAXI' as const,
          speedMps: physicalSpeed(tick),
          laneId: context.laneId,
          positionM: admitted.vehicles[0].positionM,
          headingRad: 0,
          leaderId: context.leader?.id ?? null,
          leaderGapM: context.leader?.gapM ?? null,
          leaderSpeedMps: context.leader?.speedMps ?? null,
          routeStatus: 'READY' as const,
          blockedLaneAheadId: !taskDone && tick < 60 ? 'lane-a' : null,
          planner: {
            origin: 'lane-in',
            destination: 'lane-out',
            access: 'TAXI' as const,
            graphVersion: planner.graphVersion,
            costVersion: planner.costVersion,
            blocked: blockedLanes,
          },
          allowRecoveryEscalation: false,
        },
        decision = evaluateBlockedRecovery({
          sessionId,
          worldEpoch: 0,
          actor: subject,
          decisionTick: tick,
          graph: fixture.graph,
          observation,
          state: latch,
        });
      latch = decision.state;
      if (firstDecision === null) {
        firstDecision = decision;
        const located = fixture.graph.locateLane({
            positionM: observation.positionM,
            access: 'TAXI',
            headingRad: 0,
          }),
          successors = fixture.graph.getConnections('lane-in', 'TAXI').length,
          cause = referenceBlockedCause(observation, located?.lane.id ?? null, successors),
          action = referenceBlockedFirstAction(cause, true, false, false);
        checks.push(
          checkEqual('blocked cause', cause, decision.reason, '054 structural cause priority'),
          checkEqual('blocked first action', action, decision.action, '054 ordered recovery table'),
          checkTrue(
            'blocked fact',
            decision.blocked,
            decision.blocked,
            'BLOCKED is raised for the structural cause',
          ),
        );
      }
      if (decision.reroute !== null) {
        blockedLanes = [...decision.reroute.blocked];
        planner.setBlocked(blockedLanes);
        planner.setVersions({
          graphVersion: decision.reroute.graphVersion,
          costVersion: decision.reroute.costVersion,
        });
        task = planner.createRouteTask({
          sessionId,
          worldEpoch: 0,
          actor: subject,
          origin: decision.reroute.origin,
          destination: decision.reroute.destination,
          access: decision.reroute.access,
          graphVersion: decision.reroute.graphVersion,
          costVersion: decision.reroute.costVersion,
          priority: 'normal',
        });
      }
      const fed = fixture.behavior.decide({
        sessionId,
        worldEpoch: 0,
        actor: subject,
        decisionTick: tick,
        context: projectBehaviorContext(context)!,
        facts: blockedRecoveryBehaviorFacts(baseFacts('policy-path-v1'), decision)!,
      });
      subjectStates.push(fed.state);
      if (fed.state === 'FOLLOW') released = true;
    },
  });
  checks.push(
    checkTrue(
      'blocked path changed',
      firstReroutePath !== null,
      firstReroutePath,
      'real041 reroute leaves the blocked lane',
    ),
    checkEqual(
      'blocked alternative path',
      JSON.stringify(['lane-in', 'lane-b', 'lane-out']),
      JSON.stringify(firstReroutePath),
      'the legal alternative is the reroute consequence',
    ),
    checkEqual('blocked initial FSM', 'BLOCKED', subjectStates[0], '045 consumes routeBlocked'),
    checkTrue(
      'blocked released to FOLLOW',
      released,
      subjectStates.join(','),
      'progress releases the episode',
    ),
    checkNumber(
      'blocked release hold',
      BLOCKED_RECOVERY_LIMITS.releaseHoldTicks,
      12,
      0,
      'documented hysteresis',
    ),
    checkEqual(
      'manual authority plan',
      'MANUAL_AUTHORITY',
      (manualPlan as ReturnType<typeof evaluateAuthorityReentry> | null)?.reason ?? null,
      '054 does not plan over MANUAL',
    ),
    checkEqual(
      'reentry action',
      'DRIVE_TO_LANE',
      (reentryPlan as ReturnType<typeof evaluateAuthorityReentry> | null)?.action ?? null,
      'off-centre re-entry is a driving request',
    ),
    checkEqual(
      'reentry no teleport',
      false,
      (reentryPlan as ReturnType<typeof evaluateAuthorityReentry> | null)?.teleportsVehicle ?? null,
      'the module has no pose writer',
    ),
  );
  run.dispose();
  fixture.dispose();
  return scenarioResult({
    id: 'blocked-recovery',
    behavior: 'blocked',
    title: 'A structural block reroutes through the real041 planner and releases to FOLLOW',
    oracle: 'referenceBlockedCause/referenceBlockedFirstAction (054 cause and action tables)',
    ticks: 120,
    checks,
  });
}

/** Scenario12: real024/Rapier launch of the real047 command chain. */
async function nativeAccelerationScenario(): Promise<ScenarioResult> {
  const episode = await createLongitudinalDrivingEpisode(
    'sedan',
    'dry-asphalt',
    false,
    true,
    false,
  );
  const checks: ScenarioCheck[] = [];
  try {
    const rows: ReturnType<typeof episode.step>[] = [];
    while (!episode.complete) rows.push(episode.step());
    const result = episode.result(),
      firstPositiveThrottle = rows.findIndex((row) => row.command.throttle > 0),
      firstBrake = rows.findIndex((row) => row.command.brake > 0);
    checks.push(
      checkEqual('native rows', 180, rows.length, 'the authored180-tick launch'),
      checkTrue(
        'native launch moved',
        result.pathM > 5,
        result.pathM,
        'positive command produces real motion',
      ),
      checkTrue(
        'native launch accelerated',
        (rows.at(-1)?.totalSpeedMps ?? 0) > 1,
        rows.at(-1)?.totalSpeedMps ?? 0,
        'speed grew from standstill',
      ),
      checkTrue(
        'native throttle observed',
        firstPositiveThrottle >= 0,
        firstPositiveThrottle,
        'positive acceleration maps to throttle',
      ),
      checkEqual(
        'native no obstacle impact',
        0,
        result.collisionImpulseNs,
        'the launch fixture has no contact',
      ),
      checkTrue(
        'native tick cadence',
        rows.every((row, index) => row.tick === index + 1),
        rows.length,
        'consecutive60Hz realization',
      ),
      checkTrue(
        'native target refresh',
        rows.filter((row) => row.targetDecisionTick !== 0).length > 0,
        rows.length,
        'real046 targets reached047',
      ),
      checkTrue(
        'native no braking launch',
        firstBrake === -1,
        firstBrake,
        'a clear launch never brakes',
      ),
    );
  } finally {
    episode.dispose();
  }
  return scenarioResult({
    id: 'accelerate-native',
    behavior: 'accelerate',
    title: 'Real024/Rapier sedan launch from the real046/047 target chain',
    oracle:
      'contract invariants: positive target -> positive throttle, speed/path grow, no contact',
    ticks: 180,
    checks,
  });
}

/** Negative cases: every unobservable/foreign/stale stimulus must fail closed. */
function negativeCases(): GuardResult[] {
  const guards: GuardResult[] = [],
    cruiseFixture = roadContextFixture(false),
    cruiseScope = { sessionId: '056-negative', worldEpoch: 0 },
    actor: BehaviorActor = { id: 'taxi-negative', incarnation: 1 },
    other: BehaviorActor = { id: 'taxi-other', incarnation: 1 },
    road = createRoadContext(cruiseFixture.map, { priorityPolicy: cruiseFixture.policy }),
    behavior = createBehaviorFSM(cruiseScope),
    plan = cruiseFixture.graph.getDirectedPath('west-in')!,
    [a, b] = plan.points,
    positionM = { x: (a.x + b.x) / 2, y: 0.8, z: (a.z + b.z) / 2 },
    headingRad = Math.atan2(b.z - a.z, b.x - a.x),
    published = styleProfile({}, '056-negative-v1'),
    cruise = compileCruiseProfile(published);
  behavior.setActors([actor, other], cruiseScope);
  const frame: RoadContextFrame = {
      ...cruiseScope,
      tick: 10,
      vehicles: [
        {
          id: actor.id,
          incarnation: actor.incarnation,
          positionM,
          headingRad,
          access: 'TAXI',
          speedMps: 8,
          radiusM: 2.5,
          route: { intersectionId: 'junction', movementId: 'west-straight' },
          distances: [],
        },
      ],
      obstacles: [],
      zones: [],
      signals: [],
      completeness: { vehicles: true, obstacles: true, zones: true, signals: false },
    },
    context = (() => {
      road.updateFrame(frame);
      return projectBehaviorContext(road.getContext(actor.id, { force: true })!)!;
    })(),
    mechanics = {
      version: '031-coverage-046-v1' as const,
      classId: 'sedan' as const,
      classVersion: '023-mechanics-v1' as const,
      surface: 'dry-asphalt' as const,
      surfaceVersion: '026-flat-surfaces-v1' as const,
    },
    roadFacts = {
      version: '046-road-facts-v1' as const,
      ...cruiseScope,
      subject: actor,
      sourceTick: 10,
      laneId: context.laneId!,
      roadKind: 'URBAN' as const,
      postedLimitMps: 10,
      curveRadiusM: null,
      intersectionApproach: false,
    };
  function add(
    id: string,
    behaviorName: string,
    title: string,
    stimulus: string,
    checks: ScenarioCheck[],
    actual: string,
  ) {
    guards.push(
      Object.freeze({
        id,
        behavior: behaviorName,
        title,
        stimulus,
        expected: 'fail closed',
        actual,
        checks: Object.freeze(checks),
        pass: checks.every((check) => check.pass),
      }),
    );
  }
  // 1. Wrong actor/foreign context.
  {
    const decision = behavior.decide({
        ...cruiseScope,
        actor: other,
        decisionTick: 10,
        context,
        facts: baseFacts(published.versionId),
      }),
      target = evaluateCruiseTarget({
        ...cruiseScope,
        actor: other,
        decisionTick: 10,
        authority: 'AUTO',
        profile: cruise,
        context,
        behavior: decision,
        facts: roadFacts,
        mechanics,
      });
    add(
      'wrong-context-actor',
      'context',
      'Foreign context actor is rejected',
      'context subject taxi-negative evaluated for taxi-other',
      [
        checkEqual('045 reason', 'FOREIGN_CONTEXT', decision.reason, 'identity fence'),
        checkEqual('045 state', 'BLOCKED', decision.state, 'context failure precedes behavior'),
        checkEqual('046 reason', 'FOREIGN_CONTEXT', target.reason, '046 fences the same identity'),
        checkEqual('046 target', 0, target.targetMps, 'no target is fabricated'),
      ],
      `${decision.reason}/${target.reason}`,
    );
  }
  // 2. Stale context and future observation.
  {
    const stale = { ...context, sourceTick: 1 },
      staleDecision = behavior.decide({
        ...cruiseScope,
        actor,
        decisionTick: 10,
        context: stale,
        facts: baseFacts(published.versionId),
      }),
      staleTarget = evaluateCruiseTarget({
        ...cruiseScope,
        actor,
        decisionTick: 10,
        authority: 'AUTO',
        profile: cruise,
        context: stale,
        behavior: staleDecision,
        facts: { ...roadFacts, sourceTick: 1 },
        mechanics,
      }),
      futureScope = { ...cruiseScope, sessionId: '056-negative-future' },
      futureBehavior = createBehaviorFSM(futureScope);
    futureBehavior.setActors([actor], futureScope);
    const futureDecision = futureBehavior.decide({
      ...futureScope,
      actor,
      decisionTick: 10,
      context: { ...context, sessionId: futureScope.sessionId, sourceTick: 11 },
      facts: baseFacts(published.versionId),
    });
    futureBehavior.dispose();
    add(
      'stale-context',
      'context',
      'Stale and future context ticks are rejected',
      'sourceTick 1 and future sourceTick 11 at decision tick 10',
      [
        checkEqual('045 stale reason', 'STALE_CONTEXT', staleDecision.reason, 'six-tick age fence'),
        checkEqual('045 stale state', 'BLOCKED', staleDecision.state, 'no driving on stale data'),
        checkEqual('046 stale target', 0, staleTarget.targetMps, 'no target from stale data'),
        checkEqual(
          '045 future reason',
          'STALE_CONTEXT',
          futureDecision.reason,
          'future observations are stale',
        ),
      ],
      `${staleDecision.reason}/${futureDecision.reason}`,
    );
  }
  // 3. Stale/foreign behavior tick in046.
  {
    const oldDecision = behavior.decide({
        ...cruiseScope,
        actor,
        decisionTick: 11,
        context: { ...context, sourceTick: 11 },
        facts: baseFacts(published.versionId),
      }),
      target = evaluateCruiseTarget({
        ...cruiseScope,
        actor,
        decisionTick: 16,
        authority: 'AUTO',
        profile: cruise,
        context: { ...context, sourceTick: 16 },
        behavior: oldDecision,
        facts: { ...roadFacts, sourceTick: 16 },
        mechanics,
      });
    add(
      'foreign-behavior-tick',
      'context',
      'A behavior decision from another tick is rejected',
      '045 decision tick10 used at046 tick16',
      [
        checkEqual(
          '046 reason',
          'FOREIGN_OR_STALE_BEHAVIOR',
          target.reason,
          'exact decision tick fence',
        ),
        checkEqual('046 target', 0, target.targetMps, 'no target is borrowed across ticks'),
      ],
      target.reason,
    );
  }
  // 4. Missing leader: following reports no leader and leaves the cruise target unchanged.
  {
    const sessionId = '056-negative-follow',
      scope = { sessionId, worldEpoch: 0 },
      followingActor: BehaviorActor = { id: 'taxi-follow-negative', incarnation: 1 },
      publisher = autoScenarioProfile({}, '056-negative-follow-v1'),
      following = compileFollowingProfile(publisher),
      fixture = createFollowingTargetFixture(following.longitudinal.cruise, followingActor, scope),
      input = fixture.input(6, 8, 0, 0, null),
      decision = evaluateFollowingTarget({
        cruiseInput: input.cruiseInput,
        roadContext: input.roadContext,
        observation: input.observation,
        profile: following,
      });
    add(
      'missing-leader',
      'follow',
      'A missing leader cannot fabricate a gap target',
      'no leader in the real044 snapshot',
      [
        checkEqual('following reason', 'NO_LEADER', decision.reason, 'absence is explicit'),
        checkEqual(
          'following target',
          input.cruise.targetMps,
          decision.target.targetMps,
          'the cruise target is preserved',
        ),
        checkEqual('leader', null, decision.leader, 'no leader identity is invented'),
        checkEqual('gap', null, decision.gapM, 'no gap is invented'),
      ],
      decision.reason,
    );
    fixture.dispose();
  }
  // 5. Unobservable signal: no stop and no fabricated fact.
  {
    const sessionId = '056-negative-signal',
      actorSignal: BehaviorActor = { id: 'taxi-signal-negative', incarnation: 1 },
      profile = projectSignalProfile(
        autoScenarioProfile({ red_stop_probability: 1 }, '056-negative-signal-v1'),
      ),
      decision = evaluateSignalPolicy({
        sessionId,
        worldEpoch: 0,
        actor: actorSignal,
        decisionTick: 10,
        speedMps: 8,
        seed: deriveVehicleSeed(deriveScenarioSeed(2, sessionId), actorSignal.id),
        opportunityKey: 'opportunity-unobservable',
        profile,
        observation: {
          version: SIGNAL_POLICY_LIMITS.observationVersion,
          units: 'SI',
          tick: 0,
          signalId: 'signal-unobserved',
          intersectionId: 'junction',
          movementId: 'west-straight',
          phaseId: 'red-unobserved',
          state: 'RED',
          phaseElapsedS: 1,
          distanceToStopLineM: 10,
        },
      }),
      facts = signalBehaviorFacts(baseFacts(profile.versionId), decision),
      behaviorSignal = createBehaviorFSM({ sessionId, worldEpoch: 0 });
    behaviorSignal.setActors([actorSignal], { sessionId, worldEpoch: 0 });
    const outcome = behaviorSignal.decide({
      sessionId,
      worldEpoch: 0,
      actor: actorSignal,
      decisionTick: 10,
      context: { ...context, sessionId, sourceTick: 10, subject: actorSignal },
      facts: null,
    });
    add(
      'signal-unobservable',
      'signals',
      'An unobservable signal requests no stop',
      'RED observation older than six ticks',
      [
        checkEqual('signal action', 'UNKNOWN', decision.action, 'unknown is explicit'),
        checkEqual('signal reason', 'UNAVAILABLE', decision.reason, 'no signal is invented'),
        checkEqual('stop requested', false, decision.stopRequested, 'no fabricated stop'),
        checkEqual('sample', null, decision.sampledUnit, 'no sample is drawn'),
        checkEqual('behavior facts', null, facts, 'no policy fact is fabricated'),
        checkEqual('045 state', 'BLOCKED', outcome.state, 'missing policy facts fail closed'),
        checkEqual(
          '045 reason',
          'MISSING_POLICY_FACTS',
          outcome.reason,
          'the caller cannot drive on absent facts',
        ),
      ],
      `${decision.reason}/${outcome.reason}`,
    );
    behaviorSignal.dispose();
  }
  // 6. Leader-induced queue stop is not the driver's STOP intent.
  {
    const sessionId = '056-negative-stop',
      actorStop: BehaviorActor = { id: 'taxi-stop-negative', incarnation: 1 },
      profile = projectStopProfile(
        autoScenarioProfile({ stop_full_probability: 1 }, '056-negative-stop-v1'),
      ),
      decision = evaluateStopPolicy({
        sessionId,
        worldEpoch: 0,
        actor: actorStop,
        decisionTick: 10,
        seed: 1,
        profile,
        leaderStop: 'LEADER_OR_QUEUE',
        observation: null,
      }),
      facts = stopBehaviorFacts(baseFacts(profile.versionId), decision),
      behaviorStop = createBehaviorFSM({ sessionId, worldEpoch: 0 });
    behaviorStop.setActors([actorStop], { sessionId, worldEpoch: 0 });
    const outcome = behaviorStop.decide({
      sessionId,
      worldEpoch: 0,
      actor: actorStop,
      decisionTick: 10,
      context: {
        ...context,
        sessionId,
        sourceTick: 10,
        subject: actorStop,
        leaderId: 'civil-ahead',
      },
      facts,
    });
    add(
      'stop-leader-induced',
      'stop',
      'A leader hold never becomes the driver STOP intent',
      'leaderStop LEADER_OR_QUEUE with no037 opportunity',
      [
        checkEqual('stop action', 'NO_STOP', decision.action, 'the leader path is separate'),
        checkEqual(
          'stop reason',
          'LEADER_STOP_NOT_STOP_INTENT',
          decision.reason,
          'documented separation',
        ),
        checkEqual('stop requested', false, decision.stopRequested, 'no false driver intent'),
        checkEqual('leader induced', true, decision.leaderInduced, 'the cause stays visible'),
        checkEqual('045 state', 'FOLLOW', outcome.state, 'the queue hold is a normal follow'),
        checkEqual('045 reason', 'FOLLOW_LEADER', outcome.reason, 'the leader is still reported'),
      ],
      decision.reason,
    );
    behaviorStop.dispose();
  }
  // 7. Local-only lane coverage cannot certify a change.
  {
    const sessionId = '056-negative-lane',
      fixture = laneProbeFixture(),
      actorLane: BehaviorActor = { id: 'taxi-lane-negative', incarnation: 1 },
      profile = projectLaneChangeProfile(autoScenarioProfile({}, '056-negative-lane-v1')),
      decision = evaluateLaneChange({
        sessionId,
        worldEpoch: 0,
        actor: actorLane,
        decisionTick: 10,
        profile,
        state: LANE_CHANGE_EMPTY_STATE,
        adjacency: fixture.adjacency('lane-a', 'TAXI'),
        observation: {
          version: '053-lane-observation-v1',
          units: 'SI',
          tick: 9,
          targetLaneId: 'lane-par',
          coverage: 'LOCAL_ONLY',
          frontGapM: 100,
          backGapM: 100,
          targetLaneSpeedMps: 15,
        },
        speedMps: 8,
        ownLaneLeaderSpeedMps: 6,
        intent: 'OPTIONAL_OVERTAKE',
      }),
      facts = laneChangeBehaviorFacts(baseFacts(profile.versionId), decision);
    add(
      'lane-local-only',
      'lane-change',
      'Local-only coverage cannot approve a lane change',
      'coverage LOCAL_ONLY',
      [
        checkEqual(
          'lane action',
          'NO_CHANGE',
          decision.action,
          'local coverage is not horizon-wide',
        ),
        checkEqual(
          'lane reason',
          'INCOMPLETE_LANE_COVERAGE',
          decision.reason,
          'documented refusal',
        ),
        checkEqual(
          'behavior fact',
          'NONE',
          facts?.laneChange ?? null,
          'no CHANGE_LANE fact is fabricated',
        ),
      ],
      decision.reason,
    );
  }
  // 8. Incomplete yield coverage cannot approve a gap.
  {
    const packageInput = {
        version: '052-yield-interval-v1' as const,
        units: 'SI' as const,
        sessionId: '056-negative-yield',
        worldEpoch: 0,
        subjectId: 'taxi-yield-negative',
        observationTick: 9,
        decisionTick: 10,
        profile: { versionId: '056-negative-yield-v1', yieldTimeGapS: 3 },
        coverage: 'LOCAL_ONLY' as const,
        horizonS: 30,
        discontinuity: false,
        actors: [
          {
            id: 'taxi-yield-negative',
            incarnation: 1,
            active: true,
            observable: true,
            routeKnown: true,
          },
          {
            id: 'civil-yield-negative',
            incarnation: 1,
            active: true,
            observable: true,
            routeKnown: true,
          },
        ],
        candidates: [{ relationId: 'relation', entryS: 1, exitS: 2 }],
        pairs: [
          {
            relationId: 'relation',
            otherActorId: 'civil-yield-negative',
            priority: 'YIELD' as const,
            arrival: { state: 'APPROACHING' as const, timeToEntryS: 20, timeToExitS: 21 },
          },
        ],
      },
      decision = evaluateYieldPolicy(packageInput),
      oracle = referenceYield(packageInput);
    add(
      'yield-local-only',
      'yield',
      'Local-only traffic cannot certify a priority gap',
      'coverage LOCAL_ONLY with a large local gap',
      [
        checkEqual('yield action', oracle.action, decision.action, 'UNKNOWN dominates'),
        checkEqual('yield reason', oracle.reason, decision.reason, 'documented unavailability'),
        checkEqual(
          'yield facts',
          null,
          referenceYieldFacts(baseFacts('056-negative-yield-v1'), oracle.action),
          'no yield fact is fabricated',
        ),
      ],
      decision.reason,
    );
  }
  // 9. Missing lane graph abstains instead of inventing BLOCKED.
  {
    const decision = evaluateBlockedRecovery({
      sessionId: '056-negative-blocked',
      worldEpoch: 0,
      actor: { id: 'taxi-blocked-negative', incarnation: 1 },
      decisionTick: 10,
      graph: null,
      observation: {
        version: '054-progress-observation-v1',
        units: 'SI',
        tick: 10,
        access: 'TAXI',
        speedMps: 0,
        laneId: 'lane-in',
        positionM: { x: 10, y: 0, z: 0 },
        headingRad: 0,
        leaderId: null,
        leaderGapM: null,
        leaderSpeedMps: null,
        routeStatus: 'READY',
        blockedLaneAheadId: null,
        planner: null,
        allowRecoveryEscalation: false,
      },
      state: BLOCKED_RECOVERY_EMPTY_STATE,
    });
    add(
      'blocked-missing-graph',
      'blocked',
      'A missing graph abstains without a blocked claim',
      'graph null, speed0',
      [
        checkEqual('blocked reason', 'MISSING_LANE_GRAPH', decision.reason, 'explicit abstention'),
        checkEqual('blocked boolean', false, decision.blocked, 'no fabricated BLOCKED'),
        checkEqual('reroute', null, decision.reroute, 'no invented route'),
        checkEqual('recovery', null, decision.recovery, 'no invented recovery'),
        checkEqual(
          'behavior facts',
          null,
          blockedRecoveryBehaviorFacts(baseFacts('policy-path-v1'), decision),
          'no routeBlocked fact',
        ),
      ],
      decision.reason,
    );
  }
  // 10. Profile mismatch in046.
  {
    const wrongPublished = styleProfile({}, '056-negative-other-v1'),
      wrongProfile = compileCruiseProfile(wrongPublished),
      decision = behavior.decide({
        ...cruiseScope,
        actor,
        decisionTick: 12,
        context: { ...context, sourceTick: 12 },
        facts: baseFacts(published.versionId),
      }),
      target = evaluateCruiseTarget({
        ...cruiseScope,
        actor,
        decisionTick: 12,
        authority: 'AUTO',
        profile: wrongProfile,
        context: { ...context, sourceTick: 12 },
        behavior: decision,
        facts: { ...roadFacts, sourceTick: 12 },
        mechanics,
      });
    add(
      'profile-version-mismatch',
      'cruise',
      'A foreign profile version does not drive the target',
      '045 facts from056-negative-v1, 046 profile056-negative-other-v1',
      [
        checkEqual('046 reason', 'PROFILE_VERSION_MISMATCH', target.reason, 'exact version fence'),
        checkEqual('046 target', 0, target.targetMps, 'no target from a foreign policy version'),
      ],
      target.reason,
    );
  }
  behavior.dispose();
  road.dispose();
  return guards;
}

/** Plausible wrong implementations are rejected by the same oracles. */
function mutationChecks(): ScenarioCheck[] {
  const cruiseExpected = referenceCruise(
      CRUISE_VALUES,
      'URBAN',
      10,
      null,
      false,
      'FOLLOW',
      vehicleClass('sedan', '023-mechanics-v1').turningRadiusM,
    ),
    wrongCruise = mutationProbes.cruise(CRUISE_VALUES, 10),
    followingExpected = referenceFollowing(FOLLOWING_VALUES, 8, 0, 8, 8),
    wrongFollowing = mutationProbes.following(8),
    signalExpected = referenceSignal({
      redStopProbability: 0,
      greenStartDelayS: 0.5,
      redStopLineOffsetM: 1,
      lateRedBrakeThresholdS: 3,
      state: 'RED',
      phaseElapsedS: 1,
      distanceToStopLineM: 10,
      speedMps: 8,
      complianceSample: 0.99,
    }),
    laneExpected = referenceLaneChange({
      frontGapM: 12,
      backGapM: 10,
      speedGainMps: 1.5,
      cooldownS: 2,
      decisionTick: 10,
      neighbors: ['lane-par'],
      targetLaneId: 'lane-par',
      coverage: 'LOCAL_ONLY',
      observedFrontGapM: 100,
      observedBackGapM: 100,
      targetLaneSpeedMps: 15,
      speedMps: 8,
      ownLaneLeaderSpeedMps: 6,
      intent: 'OPTIONAL_OVERTAKE',
      committedTargetLaneId: null,
      lastChangeTick: null,
    });
  return [
    checkTrue(
      'mutation cruise ignores style delta',
      cruiseExpected !== wrongCruise,
      JSON.stringify({ expected: cruiseExpected, wrong: wrongCruise }),
      'a posted-limit-only implementation would fail',
    ),
    checkTrue(
      'mutation following ignores leader',
      followingExpected.targetMps !== wrongFollowing,
      JSON.stringify({ expected: followingExpected.targetMps, wrong: wrongFollowing }),
      'a cruise-only implementation would fail',
    ),
    checkTrue(
      'mutation signal always stops',
      signalExpected.action !== mutationProbes.signal(),
      JSON.stringify({ expected: signalExpected.action, wrong: mutationProbes.signal() }),
      'a red-only implementation would fail',
    ),
    checkTrue(
      'mutation lane accepts local coverage',
      laneExpected.action !== mutationProbes.lane(),
      JSON.stringify({ expected: laneExpected.action, wrong: mutationProbes.lane() }),
      'a local-only implementation would fail',
    ),
    checkTrue(
      'mutation yield ignores the gap',
      referenceYield({
        version: '052-yield-interval-v1',
        units: 'SI',
        sessionId: 'mutation',
        worldEpoch: 0,
        subjectId: 'subject',
        observationTick: 9,
        decisionTick: 10,
        profile: { versionId: 'mutation', yieldTimeGapS: 3 },
        coverage: 'COMPLETE_HORIZON',
        horizonS: 30,
        discontinuity: false,
        actors: [
          { id: 'subject', incarnation: 1, active: true, observable: true, routeKnown: true },
          { id: 'other', incarnation: 1, active: true, observable: true, routeKnown: true },
        ],
        candidates: [{ relationId: 'r', entryS: 1, exitS: 2 }],
        pairs: [
          {
            relationId: 'r',
            otherActorId: 'other',
            priority: 'YIELD',
            arrival: { state: 'APPROACHING', timeToEntryS: 4, timeToExitS: 5 },
          },
        ],
      }).action !== mutationProbes.yield(3),
      mutationProbes.yield(3),
      'an always-accept implementation would fail',
    ),
  ];
}

/** Full suite entry point. Deterministic: no wall clock, DOM, timers or browser API is read. */
export async function runAutoScenarioSuite(): Promise<AutoScenarioReport> {
  const scenarios: ScenarioResult[] = [
    cruiseScenario({
      id: 'cruise-urban-free-road',
      title: 'Urban taxi follows the posted limit and its style delta',
      overrides: { speed_delta_urban: -2 },
      roadKind: 'URBAN',
      curveRadiusM: null,
      intersectionApproach: false,
    }),
    cruiseScenario({
      id: 'cruise-residential-curve',
      title: 'Residential taxi slows for the authored curve radius',
      overrides: { speed_delta_residential: -3, curve_lateral_accel: 1.5 },
      roadKind: 'RESIDENTIAL',
      curveRadiusM: 18,
      intersectionApproach: false,
    }),
    cruiseScenario({
      id: 'cruise-intersection-approach',
      title: 'Taxi applies the authored intersection approach speed',
      overrides: { intersection_approach_speed: 4.5 },
      roadKind: 'URBAN',
      curveRadiusM: null,
      intersectionApproach: true,
    }),
    signalScenario(),
    stopScenario(),
    junctionRouteScenario('cautious'),
    junctionRouteScenario('risky'),
    followingScenario(),
    yieldScenario(),
    laneChangeScenario(),
    blockedScenario(),
    await nativeAccelerationScenario(),
  ];
  return report(scenarios, negativeCases(), mutationChecks());
}

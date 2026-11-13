import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HAZARD_POLICY_V2_KEYS,
  HAZARD_POLICY_V2_LIMITS,
  HAZARD_POLICY_V2_M_KEYS,
  compileHazardPolicyProfile,
  getHazardPolicyV2Stats,
} from '../../src/autonomy/hazard-policy-v2';
import { getParameterDefinition } from '../../src/profiles';
import {
  crosswalkScene,
  defaultHazardPolicyValues,
  emergencyScene,
  evaluate,
  evasionScene,
  hazardPolicyDocument,
  hazardPolicyMValues,
  hazardPolicyProfile,
  hornScene,
  neutralHazardPolicyValues,
  pedestrianScene,
  reactionScene,
  realCrossing,
  realObstacle,
  realStimulus,
  scenario,
  scenarioRows,
  sceneOf,
} from './hazard-policy-v2-reference';
import type { HazardPolicyScene } from './hazard-policy-v2-reference';
import { expectedMUnits, expectedUnits, runHazardPolicyReport } from './hazard-policy-v2-report';

const ranges: Readonly<Record<string, readonly [number, number]>> = {
    pedestrian_yield_probability: [0, 1],
    pedestrian_clearance: [0.1, 6],
    hazard_reaction_delay: [0, 3],
    obstacle_clearance: [0.1, 4],
    emergency_brake_intensity: [0, 1],
    evasive_steer_willingness: [0, 1],
    crosswalk_approach_speed: [0.5, 15],
    horn_use_probability: [0, 1],
  },
  close = (left: number, right: number, epsilon = 1e-9) => Math.abs(left - right) <= epsilon;

test('183 compiles the eight R and four delivered M keys with their catalog units', () => {
  assert.deepEqual(HAZARD_POLICY_V2_KEYS, [
    'pedestrian_yield_probability',
    'pedestrian_clearance',
    'hazard_reaction_delay',
    'obstacle_clearance',
    'emergency_brake_intensity',
    'evasive_steer_willingness',
    'crosswalk_approach_speed',
    'horn_use_probability',
  ]);
  assert.deepEqual(HAZARD_POLICY_V2_M_KEYS, [
    'comfort_deceleration',
    'brake_reaction_delay',
    'curve_lateral_accel',
    'yield_time_gap',
  ]);
  for (const [key, [minimum, maximum]] of Object.entries(ranges)) {
    const definition = getParameterDefinition(key);
    assert.equal(definition.min, minimum);
    assert.equal(definition.max, maximum);
    assert.equal(definition.unit, expectedUnits[key as keyof typeof expectedUnits]);
    assert.equal(definition.implemented, true);
  }
  for (const [key, unit] of Object.entries(expectedMUnits)) {
    assert.equal(getParameterDefinition(key).unit, unit);
  }
  const profile = hazardPolicyProfile({
    pedestrian_clearance: 4.5,
    evasive_steer_willingness: 0.75,
  });
  assert.equal(profile.version, '183-hazard-policy-v2');
  assert.equal(profile.values.pedestrian_clearance, 4.5);
  assert.equal(profile.units.evasive_steer_willingness, 'probability');
  assert.equal(profile.units.hazard_reaction_delay, 's');
  assert.equal(profile.provenance.pedestrian_clearance, 'BASE');
  assert.deepEqual(profile.mUnits, expectedMUnits);
  assert.deepEqual(getHazardPolicyV2Stats(), {
    compiling: false,
    evaluating: false,
    retainedHistory: 0,
  });
  assert.equal(HAZARD_POLICY_V2_LIMITS.retainedHistory, 0);
});

test('183 refuses a document without a key, with a wrong unit or with an out-of-catalog value', () => {
  const missing = hazardPolicyDocument();
  delete (missing.parameters as Record<string, number>).horn_use_probability;
  delete (missing.unitsByParameter as Record<string, string>).horn_use_probability;
  delete (missing.provenanceByParameter as Record<string, string>).horn_use_probability;
  delete (missing.evidenceByParameter as Record<string, null>).horn_use_probability;
  assert.throws(() => compileHazardPolicyProfile(missing), /Missing hazard policy v2 parameter/);
  const wrongUnit = hazardPolicyDocument();
  (wrongUnit.unitsByParameter as Record<string, string>).pedestrian_clearance = 's';
  assert.throws(() => compileHazardPolicyProfile(wrongUnit), /Wrong unit/);
  assert.throws(() => hazardPolicyProfile({ pedestrian_yield_probability: 1.5 }), /range/);
  assert.throws(() => hazardPolicyProfile({ crosswalk_approach_speed: 20 }), /range/);
  assert.throws(() => hazardPolicyProfile({ obstacle_clearance: 0 }), /range/);
  const missingM = hazardPolicyDocument();
  delete (missingM.parameters as Record<string, number>).yield_time_gap;
  delete (missingM.unitsByParameter as Record<string, string>).yield_time_gap;
  delete (missingM.provenanceByParameter as Record<string, string>).yield_time_gap;
  delete (missingM.evidenceByParameter as Record<string, null>).yield_time_gap;
  assert.throws(() => compileHazardPolicyProfile(missingM), /Missing hazard policy v2 M parameter/);
});

test('183 gives every key its own observable effect at the two catalog extremes', () => {
  const expectations: Readonly<Record<string, readonly [number, number, number]>> = {
    pedestrian_yield_probability: [0, 1, 5e-9],
    pedestrian_clearance: [6.228965, 4.898979, 5e-6],
    hazard_reaction_delay: [28, 4, 5e-6],
    obstacle_clearance: [6.324555, 5.549775, 5e-6],
    emergency_brake_intensity: [0, 8, 1e-9],
    evasive_steer_willingness: [0, 0.45, 1e-9],
    crosswalk_approach_speed: [0.5, 15, 1e-9],
    horn_use_probability: [0, 1, 5e-9],
  };
  for (const row of scenarioRows) {
    const [low, high] = ranges[row.key],
      lowOutcome = row.measure(evaluate(row.scene, { rValues: { [row.key]: low } }).command),
      highOutcome = row.measure(evaluate(row.scene, { rValues: { [row.key]: high } }).command),
      [expectedLow, expectedHigh, epsilon] = expectations[row.key];
    assert.ok(close(lowOutcome, expectedLow, epsilon), `${row.key} low ${lowOutcome}`);
    assert.ok(close(highOutcome, expectedHigh, epsilon), `${row.key} high ${highOutcome}`);
    assert.notEqual(lowOutcome, highOutcome, `${row.key} must change the outcome`);
  }
});

test('183 keeps all 56 separation pairs inert: no key moves another key scenario', () => {
  const report = runHazardPolicyReport();
  assert.equal(report.separation.length, 56);
  assert.equal(report.couplings.length, 0);
  for (const entry of report.separation)
    assert.equal(entry.difference, 0, `${entry.key} in ${entry.scenario}`);
});

test('183 floors both clearances at the physical margin and never advances through a hazard', () => {
  const pedestrianInside = pedestrianScene(1, 'WAITING', 6),
    obstacleInside: HazardPolicyScene = {
      name: 'obstacol în marjă',
      description: 'bariera reală la 2,50 m',
      speedMps: 6,
      postedLimitMps: 15,
      obstacle: realObstacle(2.5),
    },
    low = evaluate(pedestrianInside, {
      rValues: { pedestrian_clearance: 0.1 },
    }).command,
    high = evaluate(pedestrianInside, { rValues: { pedestrian_clearance: 6 } }).command,
    obstacleLow = evaluate(obstacleInside, {
      rValues: { obstacle_clearance: 0.1 },
    }).command,
    obstacleHigh = evaluate(obstacleInside, { rValues: { obstacle_clearance: 4 } }).command;
  // A sedan is 1.80 m wide: the pedestrian margin is 2.30 m, the barrier margin 3.40 m.
  assert.equal(low.clearance.pedestrian?.minimumM, 1.8 + HAZARD_POLICY_V2_LIMITS.clearanceReserveM);
  assert.equal(low.clearance.pedestrian?.effectiveM, 2.3);
  assert.equal(low.clearance.pedestrian?.floored, true);
  assert.equal(high.clearance.pedestrian?.effectiveM, 6);
  assert.equal(high.clearance.pedestrian?.floored, false);
  assert.equal(obstacleLow.clearance.obstacle?.effectiveM, 3.4);
  assert.equal(obstacleLow.clearance.obstacle?.floored, true);
  assert.equal(obstacleHigh.clearance.obstacle?.effectiveM, 4);
  // A hazard already inside the margin stops every admissible value: nothing passes "through" it.
  for (const command of [low, high, obstacleLow, obstacleHigh]) {
    assert.equal(command.commandedSpeedMps, 0);
    assert.equal(command.action, 'BRAKE');
  }
  // The catalog minimum is a real value, not a clamp: it is accepted by the profile.
  assert.equal(neutralHazardPolicyValues.pedestrian_clearance, 0.1);
});

test('183 saturates the reaction delay at the room that is really there', () => {
  const capped: HazardPolicyScene = {
      name: 'reacție plafonată',
      description: 'stimul real la 16 m',
      speedMps: 8,
      postedLimitMps: 15,
      stimulus: realStimulus(16, 8),
    },
    low = evaluate(capped, { rValues: { hazard_reaction_delay: 0 } }).command,
    high = evaluate(capped, { rValues: { hazard_reaction_delay: 3 } }).command;
  assert.equal(low.reaction?.saturated, false);
  assert.equal(low.reaction?.delayS, 0.5);
  assert.ok(close(low.reaction?.stoppingMarginM ?? 0, 4, 1e-6));
  assert.equal(high.reaction?.saturated, true);
  assert.equal(high.reaction?.maximumFeasibleDelayS, 1);
  assert.equal(high.reaction?.delayS, 1);
  assert.equal(high.reaction?.delayTicks, 60);
  assert.equal(high.reaction?.demandedDelayS, 3.5);
  assert.ok((high.reaction?.stoppingMarginM ?? -1) >= -1e-9);
  assert.equal(high.reason, 'HAZARD_REACTION_SATURATED');
  // A longer delay than the room allows is never accepted: the command stays stoppable.
  for (const seconds of [0, 0.5, 1, 2, 3]) {
    const command = evaluate(capped, { rValues: { hazard_reaction_delay: seconds } }).command;
    assert.ok((command.reaction?.stoppingMarginM ?? -1) >= -1e-9, `${seconds} s`);
    assert.ok((command.reaction?.delayS ?? 0) <= 1 + 1e-12, `${seconds} s`);
  }
});

test('183 caps the emergency brake at the available adhesion and never above it', () => {
  const reduced: HazardPolicyScene = { ...emergencyScene(), surfaceId: 'reduced-adhesion' },
    half = evaluate(reduced, { rValues: { emergency_brake_intensity: 0.5 } }).command,
    full = evaluate(reduced, { rValues: { emergency_brake_intensity: 1 } }).command,
    dry = evaluate(emergencyScene(), { rValues: { emergency_brake_intensity: 1 } }).command;
  assert.equal(half.emergencyBrake?.adhesionLimited, false);
  assert.equal(half.emergencyBrake?.decelerationMps2, 4);
  assert.equal(full.emergencyBrake?.adhesionLimited, true);
  assert.ok(close(full.emergencyBrake?.decelerationMps2 ?? 0, 4.46355, 1e-9));
  assert.ok(
    (full.emergencyBrake?.decelerationMps2 ?? 0) <= (full.emergencyBrake?.adhesionLimitMps2 ?? 0),
  );
  assert.equal(dry.emergencyBrake?.decelerationMps2, 8);
  assert.equal(dry.emergencyBrake?.adhesionLimited, false);
  for (const intensity of [0, 0.25, 0.5, 0.75, 1]) {
    const command = evaluate(reduced, {
      rValues: { emergency_brake_intensity: intensity },
    }).command;
    assert.ok(
      (command.emergencyBrake?.decelerationMps2 ?? 0) <=
        (command.emergencyBrake?.adhesionLimitMps2 ?? 0) + 1e-12,
      `intensity ${intensity}`,
    );
  }
});

test('183 subordinates the evasion to the verified lateral space', () => {
  const noSpace: HazardPolicyScene = {
      name: 'ocolire fără spațiu',
      description: 'bariera reală la 20 m cu 3,00 m de spațiu',
      speedMps: 8,
      postedLimitMps: 15,
      obstacle: realObstacle(20),
      evasion: { side: 'LEFT', lateralSpaceM: 3, timeToObstacleS: 0.6 },
    },
    blockedLow = evaluate(noSpace, { rValues: { evasive_steer_willingness: 0 } }).command,
    blockedHigh = evaluate(noSpace, { rValues: { evasive_steer_willingness: 1 } }).command,
    freeLow = evaluate(evasionScene(), { rValues: { evasive_steer_willingness: 0 } }).command,
    freeHigh = evaluate(evasionScene(), { rValues: { evasive_steer_willingness: 1 } }).command;
  for (const command of [blockedLow, blockedHigh]) {
    assert.equal(command.evasion?.feasible, false);
    assert.equal(command.evasion?.sample, null);
    assert.equal(command.evasion?.offsetM, 0);
    assert.equal(command.reason, 'EVASION_NO_SPACE');
  }
  assert.equal(blockedHigh.evasion?.requiredSpaceM, 3.4);
  assert.equal(freeLow.evasion?.offsetM, 0);
  assert.ok(close(freeHigh.evasion?.offsetM ?? 0, 0.45));
  assert.ok((freeHigh.evasion?.offsetM ?? 0) <= (freeHigh.evasion?.spareM ?? 0) + 1e-12);
  assert.equal(freeHigh.action, 'EVADE');
  // Without space the key is inert at both extremes, whatever the sample says.
  assert.equal(blockedLow.commandedSpeedMps, blockedHigh.commandedSpeedMps);
});

test('183 subordinates the horn to the world permission and samples once per opportunity', () => {
  const forbidden: HazardPolicyScene = {
      ...hornScene(),
      horn: { opportunityId: 'horn-opportunity-183', permitted: false },
    },
    blockedLow = evaluate(forbidden, { rValues: { horn_use_probability: 0 } }).command,
    blockedHigh = evaluate(forbidden, { rValues: { horn_use_probability: 1 } }).command,
    permittedLow = evaluate(hornScene(), { rValues: { horn_use_probability: 0 } }).command,
    permittedHigh = evaluate(hornScene(), { rValues: { horn_use_probability: 1 } }).command;
  for (const command of [blockedLow, blockedHigh]) {
    assert.equal(command.horn?.permitted, false);
    assert.equal(command.horn?.sample, null);
    assert.equal(command.horn?.used, false);
    assert.equal(command.reason, 'HORN_FORBIDDEN');
  }
  assert.equal(permittedLow.horn?.used, false);
  assert.equal(permittedHigh.horn?.used, true);
  assert.equal(permittedHigh.reason, 'HORN_USED');
  const again = evaluate(hornScene(), { rValues: { horn_use_probability: 1 } }).command,
    other = evaluate(hornScene(), {
      rValues: { horn_use_probability: 1 },
      opportunityKey: '183-hazard-opportunity-other',
    }).command;
  assert.equal(again.horn?.sample, permittedHigh.horn?.sample);
  assert.notEqual(other.horn?.sample, permittedHigh.horn?.sample);
});

test('183 yields mandatorily where the pedestrian cannot clear in the M gap', () => {
  const scene = pedestrianScene(30, 'CROSSING', 3),
    crossing = realCrossing(),
    mandatory: HazardPolicyScene = pedestrianScene(12, 'CROSSING', 6),
    discretionaryLow = evaluate(scene, {
      rValues: { pedestrian_yield_probability: 0 },
    }).command,
    discretionaryHigh = evaluate(scene, {
      rValues: { pedestrian_yield_probability: 1 },
    }).command,
    mandatoryLow = evaluate(mandatory, {
      rValues: { pedestrian_yield_probability: 0 },
    }).command;
  assert.ok(close(discretionaryLow.pedestrian?.crossingRemainingS ?? 0, 6.830903, 1e-6));
  assert.equal(discretionaryLow.pedestrian?.crossingRemainingS, crossing.crossingRemainingS);
  assert.ok((discretionaryLow.pedestrian?.gapS ?? 0) > 3);
  assert.equal(discretionaryLow.pedestrian?.mandatoryYield, false);
  assert.equal(discretionaryLow.pedestrian?.yielded, false);
  assert.equal(discretionaryLow.commandedSpeedMps > 0, true);
  assert.equal(discretionaryHigh.pedestrian?.yielded, true);
  assert.equal(discretionaryHigh.commandedSpeedMps, 0);
  assert.equal(discretionaryHigh.action, 'YIELD');
  assert.equal(mandatoryLow.pedestrian?.mandatoryYield, true);
  assert.equal(mandatoryLow.pedestrian?.yielded, true);
  assert.equal(mandatoryLow.action, 'YIELD');
  // A pedestrian that is only waiting is no yield opportunity: the sample is not drawn.
  const waiting = evaluate(pedestrianScene(12, 'WAITING', 6), {
    rValues: { pedestrian_yield_probability: 1 },
  }).command;
  assert.equal(waiting.pedestrian?.sample, null);
  assert.equal(waiting.pedestrian?.yielded, false);
});

test('183 keeps the four delivered M consequences instead of rewriting them', () => {
  const clearance = pedestrianScene(12, 'WAITING', 6),
    caps = [2, 2.5, 8].map(
      (comfort) =>
        evaluate(clearance, { mValues: { comfort_deceleration: comfort } }).command.clearance
          .pedestrian?.speedCapMps ?? 0,
    ),
    reactionDelays = [0, 0.5, 3].map(
      (inherited) =>
        evaluate(reactionScene(), { mValues: { brake_reaction_delay: inherited } }).command
          .reaction,
    ),
    lateral = [2.5, 8].map(
      (accel) =>
        evaluate(evasionScene(), {
          rValues: { evasive_steer_willingness: 1 },
          mValues: { curve_lateral_accel: accel },
        }).command.evasion,
    ),
    gap5: HazardPolicyScene = pedestrianScene(30, 'CROSSING', 3),
    gapThree = evaluate(gap5, {
      rValues: { pedestrian_yield_probability: 0 },
      mValues: { yield_time_gap: 3 },
    }).command,
    gapEight = evaluate(gap5, {
      rValues: { pedestrian_yield_probability: 0 },
      mValues: { yield_time_gap: 8 },
    }).command;
  // A larger comfort deceleration keeps the same clearance and allows a faster approach.
  assert.ok(close(caps[0]!, 6.228965, 1e-6));
  assert.ok(close(caps[1]!, 6.964194, 1e-6));
  assert.ok(close(caps[2]!, 12.457929, 1e-6));
  // The total reaction delay is the delivered M delay plus the R key, in seconds and ticks.
  assert.equal(reactionDelays[0]?.inheritedDelayS, 0);
  assert.equal(reactionDelays[1]?.inheritedDelayS, 0.5);
  assert.equal(reactionDelays[2]?.inheritedDelayS, 3);
  assert.equal(reactionDelays[0]?.demandedDelayS, 0.5);
  assert.equal(reactionDelays[1]?.demandedDelayS, 1);
  assert.equal(reactionDelays[2]?.demandedDelayS, 3.5);
  assert.equal(reactionDelays[0]?.delayTicks, 30);
  assert.equal(reactionDelays[1]?.delayTicks, 60);
  assert.equal(reactionDelays[2]?.delayTicks, 210);
  assert.equal(reactionDelays[0]?.saturated, false);
  // The delivered lateral acceleration bounds the reachable offset and the space bounds the commit.
  assert.ok(close(lateral[0]?.reachableOffsetM ?? 0, 0.45));
  assert.ok(close(lateral[0]?.offsetM ?? 0, 0.45));
  assert.ok(close(lateral[1]?.reachableOffsetM ?? 0, 1.44, 1e-9));
  assert.equal(lateral[1]?.offsetM, 1.1);
  // The delivered yield gap decides where yielding stops being discretionary.
  assert.equal(gapThree.pedestrian?.mandatoryYield, false);
  assert.equal(gapThree.pedestrian?.yielded, false);
  assert.equal(gapEight.pedestrian?.mandatoryYield, true);
  assert.equal(gapEight.pedestrian?.yielded, true);
  assert.deepEqual(hazardPolicyMValues, {
    comfort_deceleration: 2,
    brake_reaction_delay: 0.5,
    curve_lateral_accel: 2.5,
    yield_time_gap: 3,
  });
});

test('183 uses the delivered geometry and adhesion of the vehicle class and the road surface', () => {
  const at = (classId: 'sedan' | 'compact', surfaceId: 'dry-asphalt' | 'reduced-adhesion') =>
      evaluate({
        name: `geometrie ${classId}/${surfaceId}`,
        description: 'drum liber',
        speedMps: 5,
        postedLimitMps: 15,
        classId,
        surfaceId,
      }).command,
    sedan = at('sedan', 'dry-asphalt'),
    compact = at('compact', 'dry-asphalt'),
    reduced = at('sedan', 'reduced-adhesion');
  assert.equal(sedan.geometry.widthM, 1.8);
  assert.equal(compact.geometry.widthM, 1.6);
  assert.equal(sedan.geometry.brakeAccelerationMps2, 8);
  assert.equal(compact.geometry.brakeAccelerationMps2, 9);
  assert.equal(sedan.geometry.grip, 1.3);
  assert.equal(compact.geometry.grip, 1.5);
  assert.ok(close(sedan.geometry.adhesionLimitMps2, 12.753));
  assert.ok(close(compact.geometry.adhesionLimitMps2, 14.715));
  assert.ok(close(reduced.geometry.adhesionLimitMps2, 4.46355));
  assert.equal(sedan.geometry.brakeCapabilityMps2, 8);
  assert.equal(compact.geometry.brakeCapabilityMps2, 9);
  assert.ok(close(reduced.geometry.brakeCapabilityMps2, 4.46355));
  assert.equal(sedan.tireGripScale, 1);
  assert.equal(reduced.tireGripScale, 0.35);
  assert.equal(reduced.surfaceId, 'reduced-adhesion');
});

test('183 is deterministic, frozen and keeps no history between decisions', () => {
  const fingerprint = () =>
    JSON.stringify(
      scenarioRows.map(
        (row) => evaluate(row.scene, { rValues: { [row.key]: ranges[row.key][1] } }).command,
      ),
    );
  assert.equal(fingerprint(), fingerprint());
  const first = evaluate(sceneOf('pedestrian_yield_probability'), {
      rValues: { pedestrian_yield_probability: 1 },
    }).command,
    second = evaluate(sceneOf('pedestrian_yield_probability'), {
      rValues: { pedestrian_yield_probability: 1 },
    }).command;
  assert.deepEqual(first, second);
  assert.equal(first.retainedHistory, 0);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.clearance));
  assert.equal(getHazardPolicyV2Stats().evaluating, false);
  // The crosswalk command is capped by the authored limit, never by the key above it.
  const crosswalk = evaluate(crosswalkScene(), {
    rValues: { crosswalk_approach_speed: 15 },
  }).command;
  assert.equal(crosswalk.crosswalk?.postedLimitMps, 15);
  assert.equal(crosswalk.commandedSpeedMps, 15);
});

test('183 refuses foreign, stale, incomplete or unauthorized input before any key takes effect', () => {
  const scene = sceneOf('pedestrian_yield_probability'),
    manual = evaluate(scene, { authority: 'MANUAL' }).command,
    stale = evaluate(scene, {
      observation: { ...evaluate(scene).input.observation, tick: scenario.tick + 1 },
    }).command,
    foreignActor = evaluate(scene, {
      observation: {
        ...evaluate(scene).input.observation,
        actor: { id: 'other', incarnation: 1 },
      },
    }).command,
    foreignScope = evaluate(scene, {
      observation: { ...evaluate(scene).input.observation, sessionId: 'other' },
    }).command,
    missing = evaluate(scene, { profile: null }).command,
    free = evaluate({
      name: 'drum liber',
      description: 'fără hazard declarat',
      speedMps: 5,
      postedLimitMps: 12,
    }).command;
  assert.equal(manual.reason, 'NO_AUTO_AUTHORITY');
  assert.equal(manual.action, 'UNAVAILABLE');
  assert.equal(manual.commandedSpeedMps, 0);
  assert.equal(manual.pedestrian, null);
  assert.equal(stale.reason, 'FOREIGN_OR_STALE_OBSERVATION');
  assert.equal(foreignActor.reason, 'FOREIGN_OR_STALE_OBSERVATION');
  assert.equal(foreignScope.reason, 'FOREIGN_OR_STALE_OBSERVATION');
  assert.equal(missing.reason, 'MISSING_PROFILE');
  assert.equal(free.reason, 'FREE_ROAD');
  assert.equal(free.action, 'PROCEED');
  assert.equal(free.commandedSpeedMps, 12);
  assert.throws(
    () => evaluate(scene, { profile: { ...evaluate(scene).profile } }),
    /profile token provenance/,
  );
  assert.throws(
    () =>
      evaluate(scene, {
        observation: {
          ...evaluate(scene).input.observation,
          pedestrian: {
            pedestrianId: 'p',
            state: 'CROSSING',
            distanceM: 10,
            crossingRemainingS: null,
          },
        },
      }),
    /exactly the remaining crossing time/,
  );
  assert.throws(
    () =>
      evaluate(scene, {
        observation: {
          ...evaluate(scene).input.observation,
          pedestrian: {
            pedestrianId: ' ',
            state: 'CROSSING',
            distanceM: 10,
            crossingRemainingS: 2,
          },
        },
      }),
    /Invalid hazard policy v2 identity/,
  );
  assert.throws(
    () =>
      evaluate(scene, {
        observation: {
          ...evaluate(scene).input.observation,
          obstacle: { obstacleId: 'o', distanceM: -1, halfWidthM: 0.3 },
        },
      }),
    /Expected finite number in range/,
  );
  assert.throws(
    () =>
      evaluate(scene, {
        observation: {
          ...evaluate(scene).input.observation,
          mechanics: { version: '023-mechanics-v0' as '023-mechanics-v1', classId: 'sedan' },
        },
      }),
    /Invalid hazard policy v2 mechanics version/,
  );
  assert.throws(
    () =>
      evaluate(scene, {
        observation: {
          ...evaluate(scene).input.observation,
          version: '183-hazard-observation-v0' as '183-hazard-observation-v1',
        },
      }),
    /Invalid hazard policy v2 observation version/,
  );
  assert.throws(
    () =>
      evaluate(scene, {
        observation: { ...evaluate(scene).input.observation, species: 'x' } as never,
      }),
    /Missing or unknown contract fields/,
  );
});

test('183 reports the whole contract with every check passing', () => {
  const report = runHazardPolicyReport();
  assert.equal(
    report.summary.pass,
    true,
    report.checks
      .filter((entry) => !entry.pass)
      .map((entry) => entry.id)
      .join(', '),
  );
  assert.equal(report.summary.passed, report.summary.checks);
  assert.equal(report.effects.length, 8);
  assert.equal(report.safety.length, 7);
  assert.equal(report.determinism.digest, report.determinism.repeatedDigest);
  assert.equal(report.samples.repeated, true);
  assert.ok(report.safety.every((entry) => entry.verdict.length > 0));
  assert.ok(defaultHazardPolicyValues.pedestrian_clearance === 2);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PICKUP_POLICY_V2_KEYS,
  PICKUP_POLICY_V2_LIMITS,
  PICKUP_POLICY_V2_M_KEYS,
  compilePickupPolicyProfile,
  getPickupPolicyV2Stats,
} from '../../src/autonomy/pickup-policy-v2';
import { getParameterDefinition } from '../../src/profiles';
import {
  civilOnlyService,
  defaultPickupPolicyValues,
  dropoffApproachScene,
  dropoffCurbScene,
  evaluate,
  occupiedAccelerationScene,
  occupiedLateralScene,
  pickupApproachScene,
  pickupCurbScene,
  pickupDwellScene,
  pickupPolicyDocument,
  pickupPolicyMValues,
  pickupPolicyProfile,
  pickupPrecisionScene,
  pickupService,
  realRideFacts,
  scenario,
  scenarioRows,
  sceneOf,
} from './pickup-policy-v2-reference';
import type { PickupPolicyScene } from './pickup-policy-v2-reference';
import {
  expectedMUnits,
  expectedUnits,
  pickupRanges,
  runPickupPolicyReport,
} from './pickup-policy-v2-report';

const close = (left: number, right: number, epsilon = 1e-9) => Math.abs(left - right) <= epsilon;

test('185 compiles the eight R and four delivered M keys with their catalog units', () => {
  assert.deepEqual(PICKUP_POLICY_V2_KEYS, [
    'pickup_approach_speed',
    'pickup_curb_distance',
    'pickup_stop_precision',
    'pickup_dwell_time',
    'dropoff_approach_speed',
    'dropoff_curb_distance',
    'occupied_acceleration_scale',
    'occupied_lateral_accel_scale',
  ]);
  assert.deepEqual(PICKUP_POLICY_V2_M_KEYS, [
    'desired_acceleration',
    'comfort_deceleration',
    'curve_lateral_accel',
    'stop_dwell_time',
  ]);
  for (const [key, [minimum, maximum]] of Object.entries(pickupRanges)) {
    const definition = getParameterDefinition(key);
    assert.equal(definition.min, minimum);
    assert.equal(definition.max, maximum);
    assert.equal(definition.unit, expectedUnits[key as keyof typeof expectedUnits]);
    assert.equal(definition.implemented, true);
  }
  for (const [key, unit] of Object.entries(expectedMUnits)) {
    assert.equal(getParameterDefinition(key).unit, unit);
  }
  const profile = pickupPolicyProfile({
    pickup_stop_precision: 4.5,
    occupied_lateral_accel_scale: 1.2,
  });
  assert.equal(profile.version, '185-pickup-policy-v2');
  assert.equal(profile.values.pickup_stop_precision, 4.5);
  assert.equal(profile.units.occupied_lateral_accel_scale, 'ratio');
  assert.equal(profile.units.dropoff_curb_distance, 'm');
  assert.equal(profile.provenance.pickup_curb_distance, 'BASE');
  assert.deepEqual(profile.mUnits, expectedMUnits);
  assert.deepEqual(getPickupPolicyV2Stats(), {
    compiling: false,
    evaluating: false,
    retainedHistory: 0,
  });
  assert.equal(PICKUP_POLICY_V2_LIMITS.retainedHistory, 0);
});

test('185 refuses a document without a key, with a wrong unit or with an out-of-catalog value', () => {
  const missing = pickupPolicyDocument();
  delete (missing.parameters as Record<string, number>).occupied_acceleration_scale;
  delete (missing.unitsByParameter as Record<string, string>).occupied_acceleration_scale;
  delete (missing.provenanceByParameter as Record<string, string>).occupied_acceleration_scale;
  delete (missing.evidenceByParameter as Record<string, null>).occupied_acceleration_scale;
  assert.throws(() => compilePickupPolicyProfile(missing), /Missing pickup policy v2 parameter/);
  const wrongUnit = pickupPolicyDocument();
  (wrongUnit.unitsByParameter as Record<string, string>).pickup_curb_distance = 's';
  assert.throws(() => compilePickupPolicyProfile(wrongUnit), /Wrong unit/);
  assert.throws(() => pickupPolicyProfile({ pickup_approach_speed: 9 }), /range/);
  assert.throws(() => pickupPolicyProfile({ pickup_dwell_time: 0.5 }), /range/);
  assert.throws(() => pickupPolicyProfile({ occupied_lateral_accel_scale: 2 }), /range/);
  const missingM = pickupPolicyDocument();
  delete (missingM.parameters as Record<string, number>).stop_dwell_time;
  delete (missingM.unitsByParameter as Record<string, string>).stop_dwell_time;
  delete (missingM.provenanceByParameter as Record<string, string>).stop_dwell_time;
  delete (missingM.evidenceByParameter as Record<string, null>).stop_dwell_time;
  assert.throws(() => compilePickupPolicyProfile(missingM), /Missing pickup policy v2 M parameter/);
});

test('185 gives every key its own observable effect at the two catalog extremes', () => {
  const expectations: Readonly<Record<string, readonly [number, number]>> = {
    pickup_approach_speed: [0.5, Math.sqrt(2 * 2 * 7.75)],
    pickup_curb_distance: [0.15, 1.2],
    pickup_stop_precision: [0.2, 2.75],
    pickup_dwell_time: [3, 10],
    dropoff_approach_speed: [0.5, Math.sqrt(2 * 2 * 7.75)],
    dropoff_curb_distance: [0.15, 1.2],
    occupied_acceleration_scale: [0.45, 2],
    occupied_lateral_accel_scale: [0.75, 2.5],
  };
  for (const row of scenarioRows) {
    const [low, high] = pickupRanges[row.key],
      lowOutcome = row.measure(evaluate(row.scene, { rValues: { [row.key]: low } }).command),
      highOutcome = row.measure(evaluate(row.scene, { rValues: { [row.key]: high } }).command),
      [expectedLow, expectedHigh] = expectations[row.key];
    assert.ok(close(lowOutcome, expectedLow), `${row.key} low ${lowOutcome}`);
    assert.ok(close(highOutcome, expectedHigh), `${row.key} high ${highOutcome}`);
    assert.notEqual(lowOutcome, highOutcome, `${row.key} must change the outcome`);
  }
});

test('185 keeps the mandatory envelope identical while every preference moves', () => {
  const report = runPickupPolicyReport();
  assert.equal(report.mandatoryStability.length, 4);
  for (const entry of report.mandatoryStability) {
    assert.equal(entry.identical, true, `${entry.key} moved the mandatory block`);
    assert.equal(entry.lowStopAllowed && entry.highStopAllowed, true);
    assert.equal(entry.lowBlockedReason, null);
    assert.equal(entry.highBlockedReason, null);
  }
  assert.equal(report.preferenceGrid.cases, 162);
  assert.equal(report.preferenceGrid.violations, 0);
  assert.equal(report.preferenceGrid.mandatoryChanges, 0);
  // Every preference combination keeps the stop, the curb band and the precision window in the bay.
  for (const scene of [pickupApproachScene(), pickupCurbScene()])
    for (const curb of [0.1, 1.05, 2])
      for (const approach of [0.5, 4.25, 8])
        for (const precision of [0.2, 2.6, 5])
          for (const dwell of [1, 5.5, 10]) {
            const command = evaluate(scene, {
                rValues: {
                  pickup_approach_speed: approach,
                  pickup_curb_distance: curb,
                  pickup_stop_precision: precision,
                  pickup_dwell_time: dwell,
                },
              }).command,
              mandatory = command.mandatory!;
            assert.equal(mandatory.stopAllowed, true);
            assert.ok(command.curb!.effectiveM >= command.curb!.minimumM - 1e-9);
            assert.ok(command.curb!.effectiveM <= command.curb!.maximumM + 1e-9);
            assert.ok(command.precision!.windowFromM >= -1e-9);
            assert.ok(command.precision!.windowToM <= mandatory.lengthM + 1e-9);
            assert.ok(command.approach!.projectedStopOffsetM <= mandatory.lengthM + 1e-9);
            assert.equal(command.departure.mayDepart, false);
          }
});

test('185 refuses a CIVIL-only zone, a stop beyond the bay and a mismatched service', () => {
  const civilOnly: PickupPolicyScene = {
      name: 'zonă fără TAXI',
      description: 'zona reală sz:2-2 are acces numai CIVIL',
      speedMps: 0,
      rideState: 'TO_DROPOFF',
      service: civilOnlyService(),
    },
    facts = realRideFacts(),
    beyond: PickupPolicyScene = {
      name: 'peste zonă',
      description: 'ego după ieșirea din bay',
      speedMps: 0,
      rideState: 'TO_PICKUP',
      service: pickupService({
        distanceToStopM: -(facts.pickupStop.lengthM - facts.pickupStop.stopOffsetM) - 1,
      }),
    },
    mismatch: PickupPolicyScene = {
      name: 'fază incompatibilă',
      description: 'fază DROPOFF pe o zonă autorată PICKUP',
      speedMps: 0,
      rideState: 'TO_DROPOFF',
      service: pickupService({ phase: 'DROPOFF' }),
    };
  const expectations: readonly [PickupPolicyScene, string][] = [
    [civilOnly, 'ZONE_NOT_TAXI'],
    [beyond, 'STOP_BEYOND_ZONE'],
    [mismatch, 'ZONE_KIND_MISMATCH'],
  ];
  for (const [scene, reason] of expectations)
    for (const key of PICKUP_POLICY_V2_KEYS) {
      const [low, high] = pickupRanges[key],
        lowCommand = evaluate(scene, { rValues: { [key]: low } }).command,
        highCommand = evaluate(scene, { rValues: { [key]: high } }).command;
      assert.equal(lowCommand.mandatory?.stopAllowed, false, `${reason} ${key} low`);
      assert.equal(highCommand.mandatory?.stopAllowed, false, `${reason} ${key} high`);
      assert.equal(lowCommand.mandatory?.blockedReason, reason);
      assert.equal(highCommand.mandatory?.blockedReason, reason);
      assert.equal(lowCommand.action, 'GO_AROUND');
      assert.equal(highCommand.action, 'GO_AROUND');
      assert.equal(lowCommand.departure.mayDepart, false);
      assert.equal(highCommand.departure.mayDepart, false);
    }
});

test('185 floors the curb band and keeps the precision window inside the bay', () => {
  const lowCurb = evaluate(pickupCurbScene(), { rValues: { pickup_curb_distance: 0.1 } }).command,
    highCurb = evaluate(pickupCurbScene(), { rValues: { pickup_curb_distance: 2 } }).command,
    lowPrecision = evaluate(pickupPrecisionScene(), {
      rValues: { pickup_stop_precision: 0.2 },
    }).command,
    highPrecision = evaluate(pickupPrecisionScene(), {
      rValues: { pickup_stop_precision: 5 },
    }).command,
    facts = realRideFacts();
  assert.equal(lowCurb.curb?.minimumM, PICKUP_POLICY_V2_LIMITS.minimumCurbClearanceM);
  assert.equal(lowCurb.curb?.effectiveM, 0.15);
  assert.equal(lowCurb.curb?.clampedLow, true);
  assert.equal(highCurb.curb?.maximumM, 1.2);
  assert.equal(highCurb.curb?.effectiveM, 1.2);
  assert.equal(highCurb.curb?.clampedHigh, true);
  assert.equal(lowPrecision.precision?.floorM, PICKUP_POLICY_V2_LIMITS.physicalPositionToleranceM);
  assert.equal(lowPrecision.precision?.effectiveM, 0.2);
  assert.equal(highPrecision.precision?.maximumM, 2.75);
  assert.equal(highPrecision.precision?.effectiveM, 2.75);
  assert.equal(highPrecision.precision?.capped, true);
  assert.ok((highPrecision.precision?.windowToM ?? 0) <= facts.pickupStop.lengthM);
  assert.equal(highPrecision.precision?.windowFromM, 0);
});

test('185 caps the approach speed at the stopping distance to the marked point', () => {
  const scene = pickupApproachScene(),
    distance = scene.service?.distanceToStopM ?? 0,
    low = evaluate(scene, { rValues: { pickup_approach_speed: 0.5 } }).command,
    high = evaluate(scene, { rValues: { pickup_approach_speed: 8 } }).command,
    facts = realRideFacts();
  assert.equal(low.approach?.commandedSpeedMps, 0.5);
  assert.ok(close(high.approach?.feasibleSpeedMps ?? 0, Math.sqrt(2 * 2 * distance)));
  assert.equal(high.approach?.commandedSpeedMps, high.approach?.feasibleSpeedMps);
  assert.equal(high.approach?.capped, true);
  assert.ok((high.approach?.stoppingDistanceM ?? 0) <= distance + 1e-9);
  assert.ok((high.approach?.projectedStopOffsetM ?? 0) <= facts.pickupStop.lengthM);
  assert.ok(
    close(high.approach?.projectedStopOffsetM ?? 0, facts.pickupStop.stopOffsetM, 1e-9),
    'the feasible speed stops exactly at the marked point',
  );
  // A short remaining distance bounds even the catalog maximum.
  const short: PickupPolicyScene = {
    ...scene,
    service: pickupService({ distanceToStopM: 1 }),
  };
  const shortHigh = evaluate(short, { rValues: { pickup_approach_speed: 8 } }).command;
  assert.equal(shortHigh.approach?.commandedSpeedMps, 2);
  assert.equal(shortHigh.approach?.feasibleSpeedMps, 2);
});

test('185 raises the dwell to the boarding proof and never departs before the 061 confirmation', () => {
  const low = evaluate(pickupDwellScene(), { rValues: { pickup_dwell_time: 1 } }).command,
    high = evaluate(pickupDwellScene(), { rValues: { pickup_dwell_time: 10 } }).command,
    unconfirmedAtTen: PickupPolicyScene = { ...pickupDwellScene(), dwellElapsedS: 10 },
    confirmed: PickupPolicyScene = {
      ...pickupDwellScene(),
      rideState: 'TO_DROPOFF',
      dwellElapsedS: 3.2,
    },
    unconfirmed = evaluate(unconfirmedAtTen, { rValues: { pickup_dwell_time: 10 } }).command,
    confirmedLow = evaluate(confirmed, { rValues: { pickup_dwell_time: 1 } }).command,
    confirmedHigh = evaluate(confirmed, { rValues: { pickup_dwell_time: 10 } }).command,
    moving = evaluate({ ...confirmed, speedMps: 1 }, { rValues: { pickup_dwell_time: 1 } }).command;
  assert.equal(low.dwell?.minimumS, PICKUP_POLICY_V2_LIMITS.boardingDwellS);
  assert.equal(low.dwell?.effectiveS, 3);
  assert.equal(low.dwell?.preferredS, 1);
  assert.equal(high.dwell?.effectiveS, 10);
  assert.equal(unconfirmed.departure.mayDepart, false);
  assert.equal(unconfirmed.departure.reason, 'SERVICE_NOT_CONFIRMED');
  assert.equal(confirmedLow.departure.mayDepart, true);
  assert.equal(confirmedLow.action, 'DEPART');
  assert.equal(confirmedHigh.departure.mayDepart, false);
  assert.equal(confirmedHigh.departure.reason, 'DWELL_PENDING');
  assert.equal(moving.departure.mayDepart, false);
  assert.equal(moving.departure.reason, 'NOT_STATIONARY');
});

test('185 applies the occupied scales only with a passenger and caps them by comfort and adhesion', () => {
  const accelLow = evaluate(occupiedAccelerationScene(), {
      rValues: { occupied_acceleration_scale: 0.3 },
    }).command,
    accelHigh = evaluate(occupiedAccelerationScene(), {
      rValues: { occupied_acceleration_scale: 1.5 },
    }).command,
    lateralLow = evaluate(occupiedLateralScene(), {
      rValues: { occupied_lateral_accel_scale: 0.3 },
    }).command,
    lateralHigh = evaluate(occupiedLateralScene(), {
      rValues: { occupied_lateral_accel_scale: 1.5 },
    }).command,
    empty: PickupPolicyScene = { ...occupiedAccelerationScene(), rideState: 'TO_PICKUP' },
    emptyLow = evaluate(empty, { rValues: { occupied_acceleration_scale: 0.3 } }).command,
    emptyHigh = evaluate(empty, { rValues: { occupied_acceleration_scale: 1.5 } }).command;
  assert.equal(accelHigh.passenger.aboard, true);
  assert.ok(close(accelLow.passenger.acceleration.commandedMps2, 0.45));
  assert.equal(accelHigh.passenger.acceleration.commandedMps2, 2);
  assert.equal(accelHigh.passenger.acceleration.cappedBy, 'COMFORT');
  assert.ok(close(lateralLow.passenger.lateralAccel.commandedMps2, 0.75));
  assert.equal(lateralHigh.passenger.lateralAccel.commandedMps2, 2.5);
  assert.equal(lateralHigh.passenger.lateralAccel.cappedBy, 'COMFORT');
  // Alone in the cabin the two scales are inert: the delivered M values pass through unchanged.
  assert.equal(emptyHigh.passenger.aboard, false);
  assert.equal(emptyLow.passenger.acceleration.commandedMps2, 1.5);
  assert.equal(emptyHigh.passenger.acceleration.commandedMps2, 1.5);
  assert.equal(emptyLow.passenger.acceleration.applied, false);
  // On a reduced-adhesion surface the tyre, not the key, is the limit.
  const slippery = evaluate(
    { ...occupiedAccelerationScene(), surfaceId: 'reduced-adhesion' },
    {
      rValues: { occupied_acceleration_scale: 1.5 },
      mValues: { desired_acceleration: 4, comfort_deceleration: 8 },
    },
  ).command;
  assert.ok(close(slippery.passenger.acceleration.commandedMps2, 4.46355, 1e-9));
  assert.equal(slippery.passenger.acceleration.cappedBy, 'ADHESION');
  const slipperyLateral = evaluate(
    { ...occupiedLateralScene(), surfaceId: 'reduced-adhesion' },
    { rValues: { occupied_lateral_accel_scale: 1.5 }, mValues: { curve_lateral_accel: 8 } },
  ).command;
  assert.ok(close(slipperyLateral.passenger.lateralAccel.commandedMps2, 4.46355, 1e-9));
  assert.equal(slipperyLateral.passenger.lateralAccel.cappedBy, 'ADHESION');
  for (const scale of [0.3, 0.75, 1, 1.25, 1.5]) {
    const command = evaluate(
      { ...occupiedAccelerationScene(), surfaceId: 'reduced-adhesion' },
      {
        rValues: { occupied_acceleration_scale: scale },
        mValues: { desired_acceleration: 6, comfort_deceleration: 8 },
      },
    ).command;
    assert.ok(
      command.passenger.acceleration.commandedMps2 <=
        command.passenger.acceleration.adhesionLimitMps2 + 1e-12,
    );
    const lateral = evaluate(
      { ...occupiedLateralScene(), surfaceId: 'reduced-adhesion' },
      {
        rValues: { occupied_lateral_accel_scale: scale },
        mValues: { curve_lateral_accel: 8 },
      },
    ).command;
    assert.ok(
      lateral.passenger.lateralAccel.commandedMps2 <=
        lateral.passenger.lateralAccel.adhesionLimitMps2 + 1e-12,
    );
  }
});

test('185 keeps the four delivered M consequences instead of rewriting them', () => {
  const caps = [2, 2.5, 8].map((comfort) => ({
      comfort,
      feasible: evaluate(pickupApproachScene(), {
        rValues: { pickup_approach_speed: 8 },
        mValues: { comfort_deceleration: comfort },
      }).command.approach?.feasibleSpeedMps,
    })),
    dwell = [0, 1, 4].map((stopDwell) => ({
      stopDwell,
      low: evaluate(pickupDwellScene(), {
        rValues: { pickup_dwell_time: 1 },
        mValues: { stop_dwell_time: stopDwell },
      }).command.dwell?.effectiveS,
      high: evaluate(pickupDwellScene(), {
        rValues: { pickup_dwell_time: 10 },
        mValues: { stop_dwell_time: stopDwell },
      }).command.dwell?.effectiveS,
    })),
    accel = [0.5, 1.5, 4].map(
      (desired) =>
        evaluate(occupiedAccelerationScene(), {
          rValues: { occupied_acceleration_scale: 0.85 },
          mValues: { desired_acceleration: desired },
        }).command.passenger.acceleration.commandedMps2,
    ),
    lateral = [1, 2.5, 8].map(
      (curve) =>
        evaluate(occupiedLateralScene(), {
          rValues: { occupied_lateral_accel_scale: 0.85 },
          mValues: { curve_lateral_accel: curve },
        }).command.passenger.lateralAccel.commandedMps2,
    );
  assert.ok(close(caps[0].feasible ?? 0, Math.sqrt(2 * 2 * 7.75)));
  assert.ok(close(caps[1].feasible ?? 0, Math.sqrt(2 * 2.5 * 7.75)));
  assert.ok(close(caps[2].feasible ?? 0, Math.sqrt(2 * 8 * 7.75)));
  assert.deepEqual(dwell, [
    { stopDwell: 0, low: 3, high: 10 },
    { stopDwell: 1, low: 3, high: 10 },
    { stopDwell: 4, low: 4, high: 10 },
  ]);
  assert.ok(close(accel[0]!, 0.425));
  assert.ok(close(accel[1]!, 1.275));
  assert.equal(accel[2], 2);
  assert.ok(close(lateral[0]!, 0.85));
  assert.ok(close(lateral[1]!, 2.125));
  assert.ok(close(lateral[2]!, 6.8));
  assert.deepEqual(pickupPolicyMValues, {
    desired_acceleration: 1.5,
    comfort_deceleration: 2,
    curve_lateral_accel: 2.5,
    stop_dwell_time: 1,
  });
});

test('185 reads the real 061 ride states and the authored 032 service zones', () => {
  const facts = realRideFacts();
  assert.equal(facts.toPickup, 'TO_PICKUP');
  assert.equal(facts.pickup, 'PICKUP');
  assert.equal(facts.toDropoff, 'TO_DROPOFF');
  assert.equal(facts.dropoff, 'DROPOFF');
  assert.equal(facts.completed, 'COMPLETED');
  assert.equal(facts.pickupZoneId, facts.pickupStop.zoneId);
  assert.equal(facts.dropoffZoneId, facts.dropoffStop.zoneId);
  assert.equal(facts.pickupStop.kind, 'PICKUP');
  assert.equal(facts.pickupStop.taxiAccess, true);
  assert.equal(facts.pickupStop.lengthM, 5.5);
  assert.equal(facts.pickupStop.stopOffsetM, 2.75);
  assert.equal(facts.pickupStop.curbBandM, 3);
  assert.equal(facts.civilOnlyStop.taxiAccess, false);
  const pickup = evaluate(pickupCurbScene()).command,
    dropoff = evaluate(dropoffCurbScene()).command,
    approach = evaluate(dropoffApproachScene()).command;
  assert.equal(pickup.mandatory?.zoneId, facts.pickupStop.zoneId);
  assert.equal(dropoff.mandatory?.zoneId, facts.dropoffStop.zoneId);
  assert.equal(pickup.passenger.aboard, false);
  assert.equal(dropoff.passenger.aboard, true);
  assert.equal(approach.passenger.aboard, true);
  assert.equal(dropoff.approach?.key, 'dropoff_approach_speed');
  assert.equal(pickup.approach?.key, 'pickup_approach_speed');
});

test('185 is deterministic, frozen and keeps no history between decisions', () => {
  const fingerprint = () =>
    JSON.stringify(
      scenarioRows.flatMap((row) => {
        const [low, high] = pickupRanges[row.key];
        return [
          evaluate(row.scene, { rValues: { [row.key]: low } }).command,
          evaluate(row.scene, { rValues: { [row.key]: high } }).command,
        ];
      }),
    );
  assert.equal(fingerprint(), fingerprint());
  const first = evaluate(sceneOf('pickup_approach_speed'), {
      rValues: { pickup_approach_speed: 8 },
    }).command,
    second = evaluate(sceneOf('pickup_approach_speed'), {
      rValues: { pickup_approach_speed: 8 },
    }).command;
  assert.deepEqual(first, second);
  assert.equal(first.retainedHistory, 0);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.mandatory));
  assert.ok(Object.isFrozen(first.passenger.acceleration));
  assert.equal(getPickupPolicyV2Stats().evaluating, false);
  // The M defaults are unchanged by a preference: the same zone facts reach every command.
  const command = evaluate(pickupCurbScene(), { rValues: { pickup_curb_distance: 2 } }).command;
  assert.equal(command.mandatory?.zoneKind, 'PICKUP');
  assert.equal(command.mandatory?.dwellMinimumS, 3);
});

test('185 refuses foreign, stale, incomplete or unauthorized input before any key takes effect', () => {
  const scene = pickupCurbScene(),
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
    missing = evaluate(scene, { profile: null }).command;
  assert.equal(manual.reason, 'NO_AUTO_AUTHORITY');
  assert.equal(manual.action, 'UNAVAILABLE');
  assert.equal(manual.mandatory, null);
  assert.equal(stale.reason, 'FOREIGN_OR_STALE_OBSERVATION');
  assert.equal(foreignActor.reason, 'FOREIGN_OR_STALE_OBSERVATION');
  assert.equal(foreignScope.reason, 'FOREIGN_OR_STALE_OBSERVATION');
  assert.equal(missing.reason, 'MISSING_PROFILE');
  assert.throws(
    () => evaluate(scene, { profile: { ...evaluate(scene).profile } }),
    /profile token provenance/,
  );
  const observation = evaluate(scene).input.observation;
  assert.throws(
    () =>
      evaluate(scene, {
        observation: { ...observation, version: '185-pickup-observation-v0' as never },
      }),
    /Invalid pickup policy v2 observation version/,
  );
  assert.throws(
    () =>
      evaluate(scene, {
        observation: {
          ...observation,
          mechanics: { version: '023-mechanics-v0' as never, classId: 'sedan' },
        },
      }),
    /Invalid pickup policy v2 mechanics version/,
  );
  assert.throws(
    () => evaluate(scene, { observation: { ...observation, rideState: 'BOARDING' as never } }),
    /Unsupported enum value/,
  );
  assert.throws(
    () =>
      evaluate(scene, {
        observation: {
          ...observation,
          service: { ...observation.service!, phase: 'DROPOFF' },
        },
      }),
    /does not belong to the declared service phase/,
  );
  assert.throws(
    () =>
      evaluate(scene, {
        observation: {
          ...observation,
          service: { ...observation.service!, distanceToStopM: -2000 },
        },
      }),
    /Expected finite number in range/,
  );
  assert.throws(
    () =>
      evaluate(scene, {
        observation: {
          ...observation,
          service: { ...observation.service!, stopOffsetM: 9 },
        },
      }),
    /Expected finite number in range/,
  );
  assert.throws(
    () =>
      evaluate(scene, {
        observation: { ...observation, species: 'x' } as never,
      }),
    /Missing or unknown contract fields/,
  );
});

test('185 reports the whole contract with every check passing', () => {
  const report = runPickupPolicyReport();
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
  assert.equal(report.separation.length, 56);
  assert.equal(report.couplings.length, 0);
  assert.equal(report.safety.length, 6);
  assert.equal(report.determinism.digest, report.determinism.repeatedDigest);
  assert.equal(report.checks.length, report.summary.checks);
  assert.ok(report.safety.every((entry) => entry.verdict.length > 0));
  assert.equal(defaultPickupPolicyValues.pickup_curb_distance, 0.5);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { PICKUP_POLICY_V2_LIMITS } from '../../src/autonomy';
import { getParameterDefinition } from '../../src/profiles';
import {
  PICKUP_V2_ESTIMATOR_KEYS,
  PICKUP_V2_ESTIMATOR_LIMITS,
  estimatePickupV2Style,
} from '../../src/learning/pickup-v2-estimator';
import type {
  PickupV2EstimatorKey,
  PickupV2EstimatorResult,
  PickupV2EvidenceEpisode,
} from '../../src/learning/pickup-v2-estimator';
import { evaluate } from '../autonomy/pickup-policy-v2-reference';
import { pickupCurbScene } from '../autonomy/pickup-policy-v2-reference';
import {
  beyondZoneEpisodes,
  civilOnlyDropoffEpisodes,
  curbBandEpisodes,
  curbFloorEpisodes,
  demonstrationKeys,
  dwellFloorEpisodes,
  dwellHiddenByMEpisodes,
  inertScaleEpisodes,
  keyEpisodes,
  kindMismatchEpisodes,
  manualEpisodes,
  narrowBayEpisodes,
  occupiedAdhesionEpisodes,
  occupiedComfortEpisodes,
  occupiedLateralAdhesionEpisodes,
  pickupApproachDistance,
  positiveEpisodes,
  precisionAtCapEpisodes,
  precisionCapEpisodes,
  structuralZeroApproachEpisodes,
  taxiRefusedEpisodes,
  tightWindowEpisodes,
  tinyEpisodes,
  unusablePrefixEpisodes,
} from './pickup-v2-estimator-reference';
import { runPickupV2EstimatorReport } from './pickup-v2-estimator-report';

const seed = 186;

function estimate(episodes: readonly PickupV2EvidenceEpisode[]): PickupV2EstimatorResult {
  return estimatePickupV2Style({ episodes, splitSeed: seed });
}
function digest(result: PickupV2EstimatorResult): string {
  const text = JSON.stringify(result);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}
function near(actual: number | null, expected: number, tolerance: number): boolean {
  return actual !== null && Math.abs(actual - expected) <= tolerance;
}

test('186 fiecare cheie are contextul ei eligibil, din comanda 185 reală', () => {
  const positive = estimate(positiveEpisodes());
  assert.equal(PICKUP_V2_ESTIMATOR_KEYS.length, 8);
  assert.equal(new Set(PICKUP_V2_ESTIMATOR_KEYS.map((key) => positive.keys[key].scenario)).size, 8);
  for (const key of PICKUP_V2_ESTIMATOR_KEYS) {
    const entry = positive.keys[key];
    assert.equal(entry.status, 'CANDIDATE', key);
    assert.equal(entry.reason, null, key);
    assert(near(entry.value, demonstrationKeys[key], 1e-9), key);
    assert(entry.eligibleContext.length > 80, key);
  }
});

test('186 un scenariu nu inventează cheile pe care scena nu le poate produce', () => {
  // A pickup tick carries the four pickup preferences, never a dropoff one and never a scale.
  const pickupOnly = estimate(keyEpisodes('pickup_approach_speed'));
  assert.equal(pickupOnly.keys.pickup_approach_speed.status, 'CANDIDATE');
  assert.equal(pickupOnly.keys.pickup_curb_distance.status, 'CANDIDATE');
  assert.equal(pickupOnly.keys.pickup_stop_precision.status, 'CANDIDATE');
  assert.equal(pickupOnly.keys.pickup_dwell_time.status, 'CANDIDATE');
  assert.equal(pickupOnly.keys.dropoff_approach_speed.status, 'UNOBSERVED');
  assert.equal(pickupOnly.keys.dropoff_curb_distance.status, 'UNOBSERVED');
  assert.equal(pickupOnly.keys.occupied_acceleration_scale.status, 'UNOBSERVED');

  // A dropoff tick carries the two dropoff preferences and the occupied state, never pickup facts.
  // The curb scene is already stopped on the marked point, so it has no approach fact to show.
  const dropoffOnly = estimate(keyEpisodes('dropoff_curb_distance'));
  assert.equal(dropoffOnly.keys.dropoff_curb_distance.status, 'CANDIDATE');
  assert.equal(dropoffOnly.keys.dropoff_approach_speed.status, 'UNOBSERVED');
  assert.equal(dropoffOnly.keys.dropoff_approach_speed.reason, 'DROPOFF_APPROACH_SPEED_SATURATED');
  assert.equal(dropoffOnly.keys.pickup_approach_speed.status, 'UNOBSERVED');
  assert.equal(dropoffOnly.keys.pickup_stop_precision.status, 'UNOBSERVED');
  assert.equal(dropoffOnly.keys.pickup_dwell_time.status, 'UNOBSERVED');
});

test('186 o oprire refuzată de pragul obligatoriu nu spune nimic despre preferință', () => {
  const refused = estimate(taxiRefusedEpisodes());
  for (const key of [
    'pickup_approach_speed',
    'pickup_curb_distance',
    'pickup_stop_precision',
    'pickup_dwell_time',
  ] as const) {
    const entry = refused.keys[key];
    assert.equal(entry.status, 'UNOBSERVED', key);
    assert.equal(entry.value, null, key);
    assert.equal(entry.reason, 'PREFERENCE_MASKED_BY_ZONE_ACCESS', key);
    assert.equal(entry.excluded.ZONE_NOT_TAXI, 4, key);
  }
  // The 185 command really does report an approach number on the blocked tick: the estimator refuses
  // to read it as a preference.
  const blocked = evaluate(
    {
      name: 'refuz TAXI',
      description: 'zona reală de pickup cu accesul TAXI refuzat',
      speedMps: 3,
      rideState: 'TO_PICKUP',
      service: {
        ...pickupCurbScene().service!,
        taxiAccess: false,
        distanceToStopM: pickupApproachDistance(),
      },
    },
    { rValues: demonstrationKeys },
  ).command;
  assert.equal(blocked.reason, 'ZONE_NOT_TAXI');
  assert.equal(blocked.action, 'GO_AROUND');
  assert(blocked.mandatory !== null && blocked.mandatory.stopAllowed === false);
  assert(blocked.approach !== null && near(blocked.approach.commandedSpeedMps, 3, 1e-9));

  const civil = estimate(civilOnlyDropoffEpisodes());
  assert.equal(civil.keys.dropoff_curb_distance.reason, 'PREFERENCE_MASKED_BY_ZONE_ACCESS');

  const kind = estimate(kindMismatchEpisodes());
  assert.equal(kind.keys.dropoff_approach_speed.reason, 'PREFERENCE_MASKED_BY_ZONE_KIND');
  assert.equal(kind.keys.dropoff_curb_distance.excluded.ZONE_KIND_MISMATCH, 4);

  for (const [result, reason, key] of [
    [estimate(beyondZoneEpisodes()), 'PREFERENCE_MASKED_BY_BEYOND_ZONE', 'pickup_curb_distance'],
    [estimate(narrowBayEpisodes()), 'PREFERENCE_MASKED_BY_NARROW_BAY', 'pickup_curb_distance'],
    [estimate(tightWindowEpisodes()), 'PREFERENCE_MASKED_BY_STOP_WINDOW', 'pickup_stop_precision'],
  ] as const) {
    assert.equal(result.keys[key].reason, reason, String(reason));
    assert.equal(result.keys[key].status, 'UNOBSERVED', String(reason));
  }
});

test('186 precizia la plafon este ambiguă, dar egalitatea exactă rămâne observabilă', () => {
  const capped = evaluate(
    {
      name: 'plafon de precizie',
      description: 'punct marcat la 0,50 m de marginea bay-ului',
      speedMps: 0,
      rideState: 'TO_PICKUP',
      service: { ...pickupCurbScene().service!, stopOffsetM: 0.5 },
    },
    { rValues: { ...demonstrationKeys, pickup_stop_precision: 1 } },
  ).command;
  assert(capped.precision !== null);
  assert.equal(capped.precision.capped, true);
  assert(near(capped.precision.effectiveM, 0.5, 1e-9));
  assert(near(capped.precision.maximumM, 0.5, 1e-9));

  const saturated = estimate(precisionCapEpisodes()).keys.pickup_stop_precision;
  assert.equal(saturated.status, 'UNOBSERVED');
  assert.equal(saturated.value, null);
  assert.equal(saturated.reason, 'PICKUP_STOP_PRECISION_CAP_SATURATED');
  assert.equal(saturated.excluded.PICKUP_STOP_PRECISION_CAP_SATURATED, 4);

  // A key exactly on the cap is not flagged by 185, so the same number is a valid estimate there.
  const atCap = evaluate(
    {
      name: 'precizie exact la plafon',
      description: 'aceeași fereastră, toleranță egală cu plafonul',
      speedMps: 0,
      rideState: 'TO_PICKUP',
      service: { ...pickupCurbScene().service!, stopOffsetM: 0.5 },
    },
    { rValues: { ...demonstrationKeys, pickup_stop_precision: 0.5 } },
  ).command;
  assert(atCap.precision !== null && atCap.precision.capped === false);
  const exact = estimate(precisionAtCapEpisodes()).keys.pickup_stop_precision;
  assert.equal(exact.status, 'CANDIDATE');
  assert(near(exact.value, 0.5, 1e-9));
});

test('186 podeaua de staționare ascunde banda de sub ea, inclusiv când M o ridică', () => {
  const floored = evaluate(
    {
      name: 'podea de staționare',
      description: 'oprit în bay, îmbarcarea încă neconfirmată',
      speedMps: 0,
      rideState: 'TO_PICKUP',
      dwellElapsedS: 1,
      service: pickupCurbScene().service,
    },
    { rValues: { ...demonstrationKeys, pickup_dwell_time: 1 } },
  ).command;
  assert(floored.dwell !== null);
  assert(near(floored.dwell.minimumS, 3, 1e-9));
  assert(near(floored.dwell.effectiveS, 3, 1e-9));

  const floor = estimate(dwellFloorEpisodes()).keys.pickup_dwell_time;
  assert.equal(floor.status, 'UNOBSERVED');
  assert.equal(floor.value, null);
  assert.equal(floor.reason, 'PICKUP_DWELL_FLOOR_SATURATED');

  const mFloor = estimate(dwellHiddenByMEpisodes()).keys.pickup_dwell_time;
  assert.equal(mFloor.reason, 'PICKUP_DWELL_FLOOR_SATURATED');
  assert.equal(mFloor.value, null);
});

test('186 banda de bordură este un clamp cu două laturi, raportat ca saturație', () => {
  const floor = estimate(curbFloorEpisodes()).keys.pickup_curb_distance;
  assert.equal(floor.status, 'UNOBSERVED');
  assert.equal(floor.reason, 'CURB_DISTANCE_FLOOR_SATURATED');
  assert.equal(floor.value, null);

  const band = estimate(curbBandEpisodes()).keys.pickup_curb_distance;
  assert.equal(band.status, 'UNOBSERVED');
  assert.equal(band.reason, 'CURB_DISTANCE_BAND_SATURATED');
  assert.equal(band.value, null);

  const command = evaluate(pickupCurbScene(), {
    rValues: { ...demonstrationKeys, pickup_curb_distance: 2 },
  }).command;
  assert(command.curb !== null);
  assert.equal(command.curb.clampedHigh, true);
  assert(near(command.curb.maximumM, 1.2, 1e-9));
  assert(near(command.curb.effectiveM, 1.2, 1e-9));
});

test('186 plafonul de confort maschează scara longitudinală', () => {
  const command = evaluate(
    {
      name: 'accelerație cu pasager',
      description: 'pasager la bord, fără serviciu',
      speedMps: 5,
      rideState: 'TO_DROPOFF',
    },
    { rValues: { ...demonstrationKeys, occupied_acceleration_scale: 1.5 } },
  ).command;
  assert(near(command.passenger.acceleration.requestedMps2, 2.25, 1e-9));
  assert(near(command.passenger.acceleration.commandedMps2, 2, 1e-9));
  assert.equal(command.passenger.acceleration.cappedBy, 'COMFORT');

  const entry = estimate(occupiedComfortEpisodes()).keys.occupied_acceleration_scale;
  assert.equal(entry.status, 'UNOBSERVED');
  assert.equal(entry.value, null);
  assert.equal(entry.reason, 'OCCUPIED_ACCELERATION_SCALE_CAP_SATURATED');

  // Below the cap the same inversion is exact: 0,85 · 1,5 = 1,275 m/s².
  const exact = evaluate(
    {
      name: 'accelerație sub plafon',
      description: 'pasager la bord, sub confort',
      speedMps: 5,
      rideState: 'TO_DROPOFF',
    },
    { rValues: demonstrationKeys },
  ).command;
  assert.equal(exact.passenger.acceleration.cappedBy, 'NONE');
  assert(near(exact.passenger.acceleration.commandedMps2, 1.275, 1e-9));
  assert(near(estimate(positiveEpisodes()).keys.occupied_acceleration_scale.value, 0.85, 1e-9));
});

test('186 plafonul de aderență maschează ambele scări, fără a raporta plafonul', () => {
  const longitudinal = evaluate(
    {
      name: 'aderență longitudinală',
      description: 'pasager la bord, suprafață cu aderență redusă',
      speedMps: 5,
      rideState: 'TO_DROPOFF',
      surfaceId: 'reduced-adhesion',
    },
    {
      rValues: { ...demonstrationKeys, occupied_acceleration_scale: 1.5 },
      mValues: { desired_acceleration: 4, comfort_deceleration: 8 },
    },
  ).command;
  assert.equal(longitudinal.passenger.acceleration.cappedBy, 'ADHESION');
  assert(near(longitudinal.passenger.acceleration.commandedMps2, 4.46355, 1e-5));

  const lateral = evaluate(
    {
      name: 'aderență laterală',
      description: 'același pasager, viraj cu aderență redusă',
      speedMps: 5,
      rideState: 'TO_DROPOFF',
      surfaceId: 'reduced-adhesion',
    },
    {
      rValues: { ...demonstrationKeys, occupied_lateral_accel_scale: 1.5 },
      mValues: { curve_lateral_accel: 8 },
    },
  ).command;
  assert.equal(lateral.passenger.lateralAccel.cappedBy, 'ADHESION');
  assert(near(lateral.passenger.lateralAccel.commandedMps2, 4.46355, 1e-5));

  const longitudinalEntry = estimate(occupiedAdhesionEpisodes()).keys.occupied_acceleration_scale;
  assert.equal(longitudinalEntry.status, 'UNOBSERVED');
  assert.equal(longitudinalEntry.value, null);
  assert.equal(longitudinalEntry.reason, 'OCCUPIED_ACCELERATION_SCALE_CAP_SATURATED');

  const lateralEntry = estimate(occupiedLateralAdhesionEpisodes()).keys
    .occupied_lateral_accel_scale;
  assert.equal(lateralEntry.status, 'UNOBSERVED');
  assert.equal(lateralEntry.value, null);
  assert.equal(lateralEntry.reason, 'OCCUPIED_LATERAL_ACCEL_SCALE_CAP_SATURATED');
});

test('186 scările sunt inerte fără pasager la bord', () => {
  const inert = estimate(inertScaleEpisodes());
  assert.equal(inert.keys.occupied_acceleration_scale.status, 'UNOBSERVED');
  assert.equal(inert.keys.occupied_acceleration_scale.reason, 'PASSENGER_NOT_ABOARD');
  assert.equal(inert.keys.occupied_lateral_accel_scale.status, 'UNOBSERVED');
  assert.equal(inert.keys.occupied_lateral_accel_scale.reason, 'PASSENGER_NOT_ABOARD');

  const empty = evaluate({
    name: 'cabină goală',
    description: 'fără serviciu, fără pasager',
    speedMps: 5,
    rideState: 'TO_PICKUP',
  });
  assert.equal(empty.command.passenger.aboard, false);
  assert.equal(empty.command.passenger.acceleration.applied, false);
  assert(near(empty.command.passenger.acceleration.commandedMps2, 1.5, 1e-9));
});

test('186 incertitudinea are prag per cheie, iar peste prag cheia rămâne neobservată', () => {
  const positive = estimate(positiveEpisodes());
  for (const key of PICKUP_V2_ESTIMATOR_KEYS) {
    const entry = positive.keys[key];
    assert.notEqual(entry.uncertainty, null, key);
    assert(entry.uncertainty! > 0, key);
    assert(entry.uncertainty! <= entry.uncertaintyThreshold, key);
    assert.equal(entry.uncertaintyThreshold, PICKUP_V2_ESTIMATOR_LIMITS.maximumUncertainty[key]);
  }

  const noisy: Readonly<Record<PickupV2EstimatorKey, readonly number[]>> = {
    pickup_approach_speed: [2, 2.8, 3.6, 4.4],
    pickup_curb_distance: [0.3, 0.6, 0.9, 1.2],
    pickup_stop_precision: [0.4, 0.85, 1.3, 1.75],
    pickup_dwell_time: [3.2, 4.1, 5, 5.9],
    dropoff_approach_speed: [2, 2.8, 3.6, 4.4],
    dropoff_curb_distance: [0.3, 0.6, 0.9, 1.2],
    occupied_acceleration_scale: [0.4, 0.7, 1, 1.3],
    occupied_lateral_accel_scale: [0.3, 0.53, 0.76, 0.99],
  };
  for (const key of PICKUP_V2_ESTIMATOR_KEYS) {
    const result = estimate(keyEpisodes(key, noisy[key], { idPrefix: `noisy-${key}` }));
    const entry = result.keys[key];
    assert.equal(entry.status, 'UNOBSERVED', key);
    assert.equal(entry.reason, 'UNCERTAINTY_ABOVE_THRESHOLD', key);
    assert.equal(entry.value, null, key);
    assert(entry.uncertainty! > entry.uncertaintyThreshold, key);
  }
});

test('186 validarea folosește date independente și un set mic dă TOO_SMALL', () => {
  const positive = estimate(positiveEpisodes());
  for (const key of PICKUP_V2_ESTIMATOR_KEYS) {
    const entry = positive.keys[key];
    assert.equal(entry.validation.status, 'VALIDATED', key);
    assert(entry.validation.episodes >= PICKUP_V2_ESTIMATOR_LIMITS.minimumValidationEpisodes);
    assert(entry.sourceEpisodes >= PICKUP_V2_ESTIMATOR_LIMITS.minimumEstimateEpisodes);
  }
  assert.equal(new Set(positive.admittedEpisodes).size, positive.admittedEpisodes.length);

  const tiny = estimate(tinyEpisodes());
  assert.equal(tiny.keys.pickup_curb_distance.status, 'CANDIDATE');
  assert.equal(tiny.keys.pickup_curb_distance.validation.status, 'TOO_SMALL');
  assert.equal(tiny.keys.pickup_curb_distance.validation.episodes, 1);
});

test('186 un minim demonstrat rămâne candidat, iar un zero structural nu este preferință', () => {
  const minimum = estimate(keyEpisodes('pickup_approach_speed', [0.5, 0.5, 0.5, 0.5]));
  assert.equal(minimum.keys.pickup_approach_speed.status, 'CANDIDATE');
  assert.equal(minimum.keys.pickup_approach_speed.value, 0.5);
  assert.equal(minimum.keys.pickup_approach_speed.validation.status, 'VALIDATED');

  const zero = estimate(structuralZeroApproachEpisodes()).keys.pickup_approach_speed;
  assert.equal(zero.status, 'UNOBSERVED');
  assert.equal(zero.value, null);
  assert.equal(zero.reason, 'PICKUP_APPROACH_SPEED_SATURATED');
  // The ceiling is zero because the ego is already on the marked point: a structural fact.
  const command = evaluate(pickupCurbScene(), { rValues: demonstrationKeys }).command;
  assert(command.approach !== null);
  assert(near(command.approach.feasibleSpeedMps, 0, 1e-9));
  assert.equal(command.approach.capped, true);

  const floorValue = estimate(keyEpisodes('pickup_curb_distance', [0.15, 0.15, 0.15, 0.15]));
  assert(near(floorValue.keys.pickup_curb_distance.value, 0.15, 1e-9));
});

test('186 intrările neeligibile, duplicate sau malformate sunt refuzate', () => {
  const manual = estimate(manualEpisodes());
  assert.equal(manual.admittedEpisodes.length, 0);
  assert.equal(manual.refusedEpisodes.length, 4);
  assert(manual.refusedEpisodes.every((entry) => entry.reason === 'NOT_LEARNING_ELIGIBLE'));
  assert.equal(manual.keys.pickup_curb_distance.status, 'UNOBSERVED');
  assert.equal(manual.keys.pickup_curb_distance.reason, 'NO_ELIGIBLE_EPISODES');

  const prefix = estimate(unusablePrefixEpisodes());
  assert(prefix.refusedEpisodes.every((entry) => entry.reason === 'NO_USABLE_PREFIX'));

  const duplicate = estimate([positiveEpisodes()[0]!, positiveEpisodes()[0]!]);
  assert.equal(duplicate.refusedEpisodes.length, 1);
  assert.equal(duplicate.refusedEpisodes[0]!.reason, 'DUPLICATE_EPISODE');

  const invalid = positiveEpisodes()[0]!;
  assert.throws(
    () =>
      estimatePickupV2Style({
        splitSeed: seed,
        episodes: [
          {
            ...invalid,
            samples: [
              { ...invalid.samples[0]!, approachCommandedMps: Number.NaN },
              ...invalid.samples.slice(1),
            ],
          },
        ],
      }),
    /pickup evidence/i,
  );

  // A sample whose policy flag contradicts the command reason is malformed, not evidence.
  assert.throws(
    () =>
      estimatePickupV2Style({
        splitSeed: seed,
        episodes: [
          {
            ...invalid,
            samples: [
              { ...invalid.samples[0]!, reason: 'MISSING_PROFILE', policyActive: true },
              ...invalid.samples.slice(1),
            ],
          },
        ],
      }),
    /pickup evidence/i,
  );
});

test('186 estimarea este deterministă și valorile stau în intervalele catalogului', () => {
  const first = estimate(positiveEpisodes());
  assert.equal(digest(first), digest(estimate(positiveEpisodes())));
  assert.equal(first.splitSeed, seed);
  for (const key of PICKUP_V2_ESTIMATOR_KEYS) {
    const entry = first.keys[key],
      definition = getParameterDefinition(key);
    assert(entry.value !== null, key);
    assert(entry.value! >= definition.min && entry.value! <= definition.max, key);
    assert.equal(entry.unit, definition.unit, key);
    assert.equal(entry.clamped, false, key);
    assert.equal(entry.uncertaintyThreshold, PICKUP_V2_ESTIMATOR_LIMITS.maximumUncertainty[key]);
  }
  assert.equal(first.groupConstraints.length, 10);
  assert(
    first.groupConstraints.some(
      (entry) => entry.id === 'TAXI_REFUSAL_HIDES_ALL_FOUR_PICKUP_PREFERENCES',
    ),
    'the mandatory gate is an explained group constraint',
  );
});

test('186 constrângerile de grup numesc unde cheia devine neidentificabilă', () => {
  const positive = estimate(positiveEpisodes());
  const ids: readonly string[] = positive.groupConstraints.map((entry) => entry.id);
  for (const id of [
    'PICKUP_AND_DROPOFF_SHARE_ZONE_REFUSALS',
    'TAXI_REFUSAL_HIDES_ALL_FOUR_PICKUP_PREFERENCES',
    'PRECISION_AND_DWELL_BELONG_TO_PICKUP_PHASE',
    'APPROACH_CAP_DEPENDS_ON_COMFORT_AND_DISTANCE',
    'CURB_BAND_CLAMP_SHARES_PICKUP_AND_DROPOFF',
    'PRECISION_WINDOW_CLAMP_IS_AMBIGUOUS_AT_THE_CAP',
    'DWELL_FLOOR_HIDES_SUB_FLOOR_KEYS',
    'OCCUPIED_SCALES_CAPPED_BY_COMFORT_AND_ADHESION',
    'OCCUPIED_SCALES_ONLY_WITH_PASSENGER',
    'PICKUP_KEYS_FROM_ONE_STOP',
  ])
    assert(ids.includes(id), id);
  for (const entry of positive.groupConstraints) {
    assert(entry.explanation.length > 120, entry.id);
    assert(
      entry.keys.every((key) => PICKUP_V2_ESTIMATOR_KEYS.includes(key)),
      entry.id,
    );
  }
  for (const key of PICKUP_V2_ESTIMATOR_KEYS)
    assert(
      positive.groupConstraints.some((entry) => (entry.keys as readonly string[]).includes(key)),
      `${key} appears in a group constraint`,
    );
});

test('186 185 citește estimările fără schimbare de semantică', () => {
  const values = Object.fromEntries(
    PICKUP_V2_ESTIMATOR_KEYS.map((key) => [key, estimate(positiveEpisodes()).keys[key].value!]),
  ) as Record<PickupV2EstimatorKey, number>;

  const approach = evaluate(
    {
      name: 'apropiere',
      description: 'apropierea reală de pickup',
      speedMps: 3,
      rideState: 'TO_PICKUP',
      service: { ...pickupCurbScene().service!, distanceToStopM: pickupApproachDistance() },
    },
    { rValues: values },
  ).command;
  assert(near(approach.approach?.commandedSpeedMps ?? null, values.pickup_approach_speed, 1e-9));
  assert.equal(approach.approach?.capped, false);
  assert(
    approach.approach !== null &&
      approach.approach.stoppingDistanceM <= pickupApproachDistance() + 1e-9,
  );

  const stop = evaluate(pickupCurbScene(), { rValues: values }).command;
  assert(near(stop.curb?.effectiveM ?? null, values.pickup_curb_distance, 1e-9));
  assert(near(stop.precision?.effectiveM ?? null, values.pickup_stop_precision, 1e-9));
  assert(near(stop.dwell?.effectiveS ?? null, values.pickup_dwell_time, 1e-9));
  assert.equal(stop.departure.mayDepart, false);
  assert.equal(stop.departure.reason, 'SERVICE_NOT_CONFIRMED');

  const occupied = evaluate(
    {
      name: 'ocupat',
      description: 'pasager la bord, fără serviciu',
      speedMps: 5,
      rideState: 'TO_DROPOFF',
    },
    { rValues: values },
  ).command;
  assert(
    near(
      occupied.passenger.acceleration.commandedMps2,
      values.occupied_acceleration_scale * occupied.passenger.acceleration.baseMps2,
      1e-9,
    ),
  );
  assert.equal(occupied.passenger.acceleration.cappedBy, 'NONE');
  assert(
    near(
      occupied.passenger.lateralAccel.commandedMps2,
      values.occupied_lateral_accel_scale * occupied.passenger.lateralAccel.baseMps2,
      1e-9,
    ),
  );
  assert.equal(occupied.passenger.lateralAccel.cappedBy, 'NONE');
  assert.equal(occupied.passenger.aboard, true);
});

test('186 raportul determinist trece toate verificările', () => {
  const report = runPickupV2EstimatorReport();
  assert.equal(report.version, '186-pickup-estimator-v1');
  assert.equal(report.summary.checks, report.checks.length);
  assert.equal(report.summary.passed, report.checks.length);
  assert.equal(report.summary.pass, true);
  assert.equal(report.rows.length, 8);
  assert.equal(report.rows.filter((entry) => entry.status === 'CANDIDATE').length, 8);
  assert.equal(report.determinism.digest, report.determinism.repeatedDigest);
  assert.equal(report.split.disjoint, true);
  assert.equal(report.compatibility.policyVersion, PICKUP_POLICY_V2_LIMITS.version);
  assert.equal(report.compatibility.candidateOnly, true);
  assert.equal(report.compatibility.changesPolicySemantics, false);
});

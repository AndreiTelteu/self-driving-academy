import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ROUTE_V2_ESTIMATOR_KEYS,
  ROUTE_V2_ESTIMATOR_LIMITS,
  estimateRouteV2Style,
  routeV2EligibleContexts,
  routeV2EligibleScenarios,
  routeV2EvidenceReasons,
  routeV2GroupConstraints,
  routeV2PolicyActive,
} from '../../src/learning/route-v2-estimator';
import type {
  RouteV2EvidenceEpisode,
  RouteV2EvidenceSample,
} from '../../src/learning/route-v2-estimator';
import { ROUTE_POLICY_V2_KEYS, ROUTE_POLICY_V2_LIMITS } from '../../src/autonomy/route-policy-v2';
import { getParameterDefinition } from '../../src/profiles';
import {
  TRUE_ROUTE_PROFILE,
  blockedRecoveryEpisodes,
  censoredPatienceEpisodes,
  contradictoryRhoEpisodes,
  decide,
  floorPatienceEpisodes,
  floorRecoveryEpisodes,
  forbiddenUTurnEpisodes,
  manualEpisodes,
  oneSidedRhoEpisodes,
  oneSidedTurnEpisodes,
  positiveEpisodes,
  refusedUTurnEpisodes,
  sampleOf,
  scaledEpisodes,
  suppressedEpisodes,
  weightPairs,
} from './route-v2-estimator-reference';
import { runRouteLearningReport } from './route-v2-estimator-report';

const SEED = 182,
  ranges: Readonly<Record<string, readonly [number, number]>> = {
    route_time_weight: [0, 1],
    route_distance_weight: [0, 1],
    route_turn_penalty: [0, 20],
    route_signal_penalty: [0, 60],
    route_congestion_penalty: [0, 2],
    reroute_patience: [2, 120],
    u_turn_willingness: [0, 1],
    reverse_recovery_duration: [0, 8],
  },
  close = (left: number, right: number, epsilon = 1e-9) => Math.abs(left - right) <= epsilon,
  positive = estimateRouteV2Style({ episodes: positiveEpisodes(), splitSeed: SEED });

test('182 estimates the eight 181 route keys in the catalog ranges and units', () => {
  assert.deepEqual(ROUTE_V2_ESTIMATOR_KEYS, ROUTE_POLICY_V2_KEYS);
  assert.equal(ROUTE_V2_ESTIMATOR_KEYS.length, 8);
  for (const [key, [minimum, maximum]] of Object.entries(ranges)) {
    const definition = getParameterDefinition(key);
    assert.equal(definition.min, minimum, key);
    assert.equal(definition.max, maximum, key);
    assert.equal(definition.implemented, false, key);
    assert.equal(positive.keys[key as keyof typeof positive.keys].unit, definition.unit, key);
  }
  assert.equal(ROUTE_V2_ESTIMATOR_LIMITS.retainedHistory, 0);
  assert.equal(ROUTE_V2_ESTIMATOR_LIMITS.tickHz, 60);
  assert.equal(ROUTE_V2_ESTIMATOR_LIMITS.minimumReverseRecoveryS, 2.5);
  assert.equal(new Set(Object.values(routeV2EligibleScenarios)).size, 8);
  assert.equal(new Set(Object.values(routeV2EligibleContexts)).size, 8);
  assert.equal(routeV2GroupConstraints.length, 8);
  assert.deepEqual(
    routeV2EvidenceReasons.length,
    new Set(routeV2EvidenceReasons).size,
    'evidence reasons are unique',
  );
});

test('182 mirrors the closed 181 reason vocabulary before any key can be measured', () => {
  for (const reason of ['ROUTE_KEPT', 'ROUTE_SELECTED', 'REROUTE_WAIT', 'REROUTE_COMMIT'] as const)
    assert.equal(routeV2PolicyActive(reason), true, reason);
  for (const reason of [
    'ROUTE_POLICY_V2',
    'NO_AUTO_AUTHORITY',
    'MISSING_PROFILE',
    'FOREIGN_OR_STALE_OBSERVATION',
    'NO_ALTERNATIVES',
    'DUPLICATE_ALTERNATIVE',
    'NO_ADMISSIBLE_ROUTE',
  ] as const)
    assert.equal(routeV2PolicyActive(reason), false, reason);
  assert.equal(routeV2EvidenceReasons.length, 14);
});

test('182 measures the emitted behaviour, never the profile: no weight and no score in evidence', () => {
  const command = decide({
      routes: weightPairs.rho[0]!,
      tick: 100,
      opportunityKey: 'evidence-probe',
    }),
    sample = sampleOf(command),
    keys = Object.keys(sample);
  assert.equal(keys.includes('weights'), false);
  assert.equal(keys.includes('score'), false);
  for (const route of sample.routes) {
    assert.equal(Object.keys(route).includes('score'), false);
    assert.ok(route.styleTimeS > 0 && route.lengthM > 0);
  }
  assert.ok(sample.referenceSeconds > 0 && sample.referenceMetres > 0);
  // A profile written at one tenth of the weights emits exactly the same evidence.
  const scaled = sampleOf(
    decide(
      { routes: weightPairs.rho[0]!, tick: 100, opportunityKey: 'evidence-probe' },
      {
        ...TRUE_ROUTE_PROFILE,
        route_time_weight: 0.06,
        route_distance_weight: 0.03,
        route_turn_penalty: 0.2,
        route_signal_penalty: 0.5,
        route_congestion_penalty: 0.05,
      },
    ),
  );
  assert.deepEqual(scaled, sample);
});

test('182 gives every key its own eligible context, uncertainty and independent validation', () => {
  for (const key of ROUTE_V2_ESTIMATOR_KEYS) {
    const estimate = positive.keys[key];
    assert.equal(estimate.status, 'CANDIDATE', `${key}: ${estimate.reason}`);
    assert.equal(estimate.reason, null, key);
    assert.ok(estimate.value !== null && Number.isFinite(estimate.value), key);
    const [minimum, maximum] = ranges[key]!;
    assert.ok(estimate.value! >= minimum && estimate.value! <= maximum, `${key} in range`);
    assert.ok(estimate.uncertainty! > 0, `${key} uncertainty`);
    assert.ok(
      estimate.uncertainty! <= estimate.uncertaintyThreshold,
      `${key} uncertainty ${estimate.uncertainty} over ${estimate.uncertaintyThreshold}`,
    );
    assert.equal(estimate.validation.status, 'VALIDATED', key);
    assert.ok(estimate.validation.episodes >= 2, key);
    assert.ok(
      estimate.validation.error! <= estimate.validation.tolerance,
      `${key} validation error`,
    );
    assert.ok(estimate.sourceEpisodes >= 2 && estimate.sourceSamples >= 2, key);
    assert.equal(estimate.eligibleContext, routeV2EligibleContexts[key]);
    assert.equal(estimate.scenario, routeV2EligibleScenarios[key]);
  }
  // The authored profile is recovered inside the demonstration bands.
  assert.ok(close(positive.keys.route_time_weight.value!, 0.0714, 2e-3));
  assert.ok(close(positive.keys.route_distance_weight.value!, 0.0357, 2e-3));
  assert.ok(close(positive.keys.route_turn_penalty.value!, 0.2381, 5e-3));
  assert.ok(close(positive.keys.route_signal_penalty.value!, 0.5952, 1e-2));
  assert.ok(close(positive.keys.route_congestion_penalty.value!, 0.0595, 1e-2));
  assert.ok(close(positive.keys.reroute_patience.value!, 20, 0.05));
  assert.ok(close(positive.keys.u_turn_willingness.value!, 0.12, 0.05));
  assert.equal(positive.keys.reverse_recovery_duration.value, 4);
});

test('182 identifies the normalized shares, not five absolute weights', () => {
  const coefficients = positive.coefficients,
    shares = positive.normalizedShares;
  assert.ok(coefficients.rho !== null && coefficients.kappaTurn !== null);
  assert.ok(coefficients.kappaSignal !== null && coefficients.kappaCongestion !== null);
  assert.ok(shares !== null);
  assert.ok(close(coefficients.rho!, 2, 0.1));
  assert.ok(close(coefficients.kappaTurn!, 2.2222, 0.05));
  assert.ok(close(coefficients.kappaSignal!, 5.5556, 0.1));
  assert.ok(close(coefficients.kappaCongestion!, 0.5556, 0.08));
  const values = Object.values(shares!);
  assert.equal(values.length, 5);
  assert.ok(
    close(
      values.reduce((total, value) => total + value, 0),
      1,
      1e-9,
    ),
  );
  // The reported value of every weight is exactly the canonical representative.
  for (const key of [
    'route_time_weight',
    'route_distance_weight',
    'route_turn_penalty',
    'route_signal_penalty',
    'route_congestion_penalty',
  ] as const)
    assert.equal(positive.keys[key].value, shares![key]);
  // 181 renormalizes the reported values to themselves: the same coefficients, bit for bit.
  const reported = Object.fromEntries(
      ROUTE_V2_ESTIMATOR_KEYS.map((key) => [key, positive.keys[key].value!]),
    ),
    command = decide(
      { routes: weightPairs.rho[0]!, tick: 700, opportunityKey: 'renormalize-probe' },
      reported,
    ),
    weights = command.weights!;
  assert.ok(close(weights.time, shares!.route_time_weight, 1e-9));
  assert.ok(close(weights.distance, shares!.route_distance_weight, 1e-9));
  assert.ok(close(weights.turn, shares!.route_turn_penalty, 1e-9));
  assert.ok(close(weights.signal, shares!.route_signal_penalty, 1e-9));
  assert.ok(close(weights.congestion, shares!.route_congestion_penalty, 1e-9));
  assert.ok(
    close(weights.time + weights.distance + weights.turn + weights.signal + weights.congestion, 1),
  );
});

test('182 keeps the delivered 181 decisions when the estimate is consumed', () => {
  const estimated = Object.fromEntries(
      ROUTE_V2_ESTIMATOR_KEYS.map((key) => [key, positive.keys[key].value!]),
    ),
    scenes = [
      ...(['rho', 'turn', 'signal', 'congestion'] as const).flatMap((group) =>
        weightPairs[group].map((routes, index) => ({
          routes,
          tick: 800 + index,
          opportunityKey: `consume-${group}-${index}`,
        })),
      ),
      {
        routes: [{ id: 'td-short' }, { id: 'td-long-a' }],
        tick: 3_000,
        opportunityKey: 'consume-patience',
        currentRouteId: 'td-short',
        waitingSinceTick: 3_000 - 1_199,
      },
      {
        routes: [{ id: 'u-direct' }],
        tick: 3_010,
        opportunityKey: 'consume-recovery',
        recovery: { required: true, reverseClear: true },
      },
    ];
  for (const scene of scenes) {
    const authored = decide(scene, TRUE_ROUTE_PROFILE),
      consumed = decide(scene, estimated);
    assert.equal(consumed.candidateRouteId, authored.candidateRouteId, scene.opportunityKey);
    assert.equal(consumed.reason, authored.reason, scene.opportunityKey);
    assert.equal(consumed.reroute.decision, authored.reroute.decision, scene.opportunityKey);
    assert.equal(consumed.recovery.durationS, authored.recovery.durationS, scene.opportunityKey);
  }
});

test('182 proves the whole-scale family: the same cote at factor 1 and 10 give the same estimate', () => {
  const base = estimateRouteV2Style({ episodes: scaledEpisodes(1), splitSeed: SEED }),
    ten = estimateRouteV2Style({ episodes: scaledEpisodes(10), splitSeed: SEED });
  for (const key of [
    'route_time_weight',
    'route_distance_weight',
    'route_turn_penalty',
    'route_signal_penalty',
    'route_congestion_penalty',
  ] as const) {
    assert.equal(ten.keys[key].value, base.keys[key].value, key);
    assert.equal(ten.keys[key].uncertainty, base.keys[key].uncertainty, key);
  }
  assert.deepEqual(ten.coefficients, base.coefficients);
  assert.deepEqual(ten.normalizedShares, base.normalizedShares);
});

test('182 leaves the key unobserved when the world forbids the U-turn', () => {
  const result = estimateRouteV2Style({ episodes: forbiddenUTurnEpisodes(), splitSeed: SEED }),
    estimate = result.keys.u_turn_willingness;
  assert.equal(estimate.status, 'UNOBSERVED');
  assert.equal(estimate.reason, 'U_TURN_PERMISSION_NOT_DECLARED');
  assert.equal(estimate.value, null);
  assert.ok((estimate.excluded.U_TURN_PERMISSION_NOT_DECLARED ?? 0) > 0);
});

test('182 keeps a constant refusal as a demonstrated zero, not as missing evidence', () => {
  const result = estimateRouteV2Style({ episodes: refusedUTurnEpisodes(), splitSeed: SEED }),
    estimate = result.keys.u_turn_willingness;
  assert.equal(estimate.status, 'CANDIDATE');
  assert.equal(estimate.value, 0);
  assert.equal(estimate.rawValue, 0);
  assert.equal(estimate.clamped, false);
  assert.ok(estimate.uncertainty! > 0);
  assert.ok(estimate.uncertainty! <= estimate.uncertaintyThreshold);
  assert.equal(estimate.validation.status, 'VALIDATED');
});

test('182 leaves the recovery duration unobserved under the 2.5 s floor', () => {
  const floor = estimateRouteV2Style({ episodes: floorRecoveryEpisodes(), splitSeed: SEED }),
    blocked = estimateRouteV2Style({ episodes: blockedRecoveryEpisodes(), splitSeed: SEED });
  assert.equal(floor.keys.reverse_recovery_duration.status, 'UNOBSERVED');
  assert.equal(floor.keys.reverse_recovery_duration.reason, 'RECOVERY_FLOOR_SATURATED');
  assert.equal(floor.keys.reverse_recovery_duration.value, null);
  assert.equal(blocked.keys.reverse_recovery_duration.status, 'UNOBSERVED');
  assert.equal(blocked.keys.reverse_recovery_duration.reason, 'RECOVERY_BLOCKED_NO_COMMAND');
  // The floor is the delivered 181 constant, not a local guess.
  assert.equal(
    ROUTE_V2_ESTIMATOR_LIMITS.minimumReverseRecoveryS,
    ROUTE_POLICY_V2_LIMITS.minimumReverseRecoveryS,
  );
  assert.ok(
    close(
      ROUTE_POLICY_V2_LIMITS.minimumReverseRecoveryS,
      ROUTE_POLICY_V2_LIMITS.minimumReverseDistanceM / ROUTE_POLICY_V2_LIMITS.reverseSpeedMps,
    ),
  );
});

test('182 demonstrates the catalog floor of the patience instead of inventing a zero', () => {
  const result = estimateRouteV2Style({ episodes: floorPatienceEpisodes(), splitSeed: SEED }),
    estimate = result.keys.reroute_patience;
  assert.equal(estimate.status, 'CANDIDATE');
  assert.equal(estimate.value, 2);
  assert.equal(estimate.clamped, true);
  assert.ok(estimate.rawValue! < 2);
  assert.ok(estimate.uncertainty! <= estimate.uncertaintyThreshold);
});

test('182 keeps a censored patience unobserved and reports the bound', () => {
  const result = estimateRouteV2Style({ episodes: censoredPatienceEpisodes(), splitSeed: SEED }),
    estimate = result.keys.reroute_patience;
  assert.equal(estimate.status, 'UNOBSERVED');
  assert.equal(estimate.reason, 'PATIENCE_UPPER_BOUND_UNOBSERVED');
  assert.equal(estimate.value, null);
  assert.ok(estimate.sourceSamples >= 2);
});

test('182 treats a one-sided time/distance trade-off as a bound, not a value', () => {
  const result = estimateRouteV2Style({ episodes: oneSidedRhoEpisodes(), splitSeed: SEED });
  for (const key of ['route_time_weight', 'route_distance_weight'] as const) {
    assert.equal(result.keys[key].status, 'UNOBSERVED', key);
    assert.equal(result.keys[key].reason, 'TIME_DISTANCE_UPPER_BOUND_UNOBSERVED', key);
  }
  // The three penalties never read rho, so they stay identified.
  for (const key of [
    'route_turn_penalty',
    'route_signal_penalty',
    'route_congestion_penalty',
  ] as const) {
    assert.equal(result.keys[key].status, 'CANDIDATE', key);
    assert.ok(close(result.keys[key].value!, positive.keys[key].value!, 1e-12), key);
  }
});

test('182 couples the five shares: one censored penalty hides every share', () => {
  const result = estimateRouteV2Style({ episodes: oneSidedTurnEpisodes(), splitSeed: SEED });
  for (const key of [
    'route_time_weight',
    'route_distance_weight',
    'route_turn_penalty',
    'route_signal_penalty',
    'route_congestion_penalty',
  ] as const)
    assert.equal(result.keys[key].status, 'UNOBSERVED', key);
  assert.equal(result.keys.route_turn_penalty.reason, 'TURN_TRADE_OFF_UPPER_BOUND_UNOBSERVED');
  for (const key of [
    'route_time_weight',
    'route_distance_weight',
    'route_signal_penalty',
    'route_congestion_penalty',
  ] as const)
    assert.equal(result.keys[key].reason, 'SHARE_BUDGET_INCOMPLETE', key);
  assert.equal(result.normalizedShares, null);
});

test('182 reports contradictory demonstrations instead of averaging two drivers', () => {
  const result = estimateRouteV2Style({ episodes: contradictoryRhoEpisodes(), splitSeed: SEED });
  assert.equal(result.keys.route_time_weight.reason, 'CONTRADICTORY_TIME_DISTANCE_BOUNDS');
  assert.equal(result.keys.route_distance_weight.reason, 'CONTRADICTORY_TIME_DISTANCE_BOUNDS');
  assert.equal(result.keys.route_time_weight.value, null);
  // The penalties are demonstrated consistently and are not poisoned by the contradiction.
  assert.equal(result.keys.route_signal_penalty.status, 'CANDIDATE');
});

test('182 refuses MANUAL and unusable windows before any key takes effect', () => {
  const manual = estimateRouteV2Style({ episodes: manualEpisodes(), splitSeed: SEED }),
    suppressed = estimateRouteV2Style({ episodes: suppressedEpisodes(), splitSeed: SEED });
  assert.equal(manual.admittedEpisodes.length, 0);
  assert.ok(manual.refusedEpisodes.every((entry) => entry.reason === 'NOT_LEARNING_ELIGIBLE'));
  assert.equal(suppressed.admittedEpisodes.length, 0);
  assert.ok(suppressed.refusedEpisodes.every((entry) => entry.reason === 'NO_USABLE_PREFIX'));
  for (const result of [manual, suppressed])
    for (const key of ROUTE_V2_ESTIMATOR_KEYS) {
      assert.equal(result.keys[key].status, 'UNOBSERVED', key);
      assert.equal(result.keys[key].reason, 'NO_ELIGIBLE_EPISODES', key);
    }
});

test('182 refuses a duplicate episode identity and never splits one episode twice', () => {
  const episodes = positiveEpisodes(),
    duplicated = estimateRouteV2Style({
      episodes: [episodes[0]!, episodes[0]!, ...episodes.slice(1)],
      splitSeed: SEED,
    });
  assert.ok(duplicated.refusedEpisodes.some((entry) => entry.reason === 'DUPLICATE_EPISODE'));
  assert.equal(duplicated.admittedEpisodes.length, episodes.length);
  // No episode is in both halves: every key reports its own two disjoint sets.
  const sides = new Set(duplicated.split.map((entry) => entry.episodeId));
  assert.equal(duplicated.split.length, episodes.length);
  assert.equal(sides.size, episodes.length);
  assert.ok(duplicated.split.some((entry) => entry.side === 'ESTIMATE'));
  assert.ok(duplicated.split.some((entry) => entry.side === 'VALIDATION'));
  for (const key of ROUTE_V2_ESTIMATOR_KEYS) {
    const estimate = duplicated.keys[key];
    assert.ok(estimate.sourceEpisodes >= 2, key);
  }
  const same = estimateRouteV2Style({ episodes, splitSeed: SEED }),
    other = estimateRouteV2Style({ episodes, splitSeed: SEED + 1 });
  assert.deepEqual(same, positive);
  assert.notDeepEqual(other.split, positive.split);
});

test('182 rejects malformed evidence instead of measuring it', () => {
  const episode = positiveEpisodes()[0]!,
    mutate = (change: (value: RouteV2EvidenceEpisode) => void): RouteV2EvidenceEpisode => {
      const copy = structuredClone(episode) as RouteV2EvidenceEpisode;
      change(copy);
      return copy;
    };
  assert.throws(
    () =>
      estimateRouteV2Style({
        episodes: [
          mutate((value) => {
            (value.samples[0] as { reason: string }).reason = 'NOT_A_REASON';
          }),
        ],
        splitSeed: SEED,
      }),
    /sample reason/,
  );
  assert.throws(
    () =>
      estimateRouteV2Style({
        episodes: [
          mutate((value) => {
            (value.samples[0] as { tick: number }).tick = -1;
          }),
        ],
        splitSeed: SEED,
      }),
    /sample tick/,
  );
  assert.throws(
    () =>
      estimateRouteV2Style({
        episodes: [
          mutate((value) => {
            (value.samples[0]!.routes[0] as { turns: number }).turns = 1.5;
          }),
        ],
        splitSeed: SEED,
      }),
    /route turns/,
  );
  assert.throws(
    () =>
      estimateRouteV2Style({
        episodes: [
          mutate((value) => {
            (value.eligibility as { vehicleId: string }).vehicleId = 'other';
          }),
        ],
        splitSeed: SEED,
      }),
    /Mismatched route evidence identity/,
  );
  assert.throws(
    () => estimateRouteV2Style({ episodes: positiveEpisodes(), splitSeed: -1 }),
    /split seed/,
  );
  assert.throws(
    () =>
      estimateRouteV2Style({
        episodes: [
          mutate((value) => {
            (value.samples as RouteV2EvidenceSample[]).reverse();
          }),
        ],
        splitSeed: SEED,
      }),
    /strictly ordered/,
  );
});

test('182 is deterministic and keeps no history between runs', () => {
  const again = estimateRouteV2Style({ episodes: positiveEpisodes(), splitSeed: SEED });
  assert.deepEqual(again, positive);
  assert.equal(again.compatibility.candidateOnly, true);
  assert.equal(again.compatibility.changesPolicySemantics, false);
  assert.equal(again.compatibility.policyVersion, '181-route-policy-v2');
  assert.deepEqual(again.compatibility.mReadByPolicy, [
    'speed_delta_urban',
    'speed_delta_residential',
  ]);
  assert.ok(Object.isFrozen(again));
  assert.ok(Object.isFrozen(again.keys.route_time_weight));
});

test('182 reports the whole contract with every check passing', () => {
  const report = runRouteLearningReport();
  assert.equal(
    report.summary.pass,
    true,
    report.checks
      .filter((entry) => !entry.pass)
      .map((entry) => entry.id)
      .join(', '),
  );
  assert.equal(report.summary.passed, report.summary.checks);
  assert.equal(report.summary.candidateKeys, 8);
  assert.equal(report.determinism.digest, report.determinism.repeatedDigest);
  assert.equal(report.compatibility.identicalDecisions, report.compatibility.decisions);
  assert.equal(report.compatibility.scaleIdentical, true);
  assert.equal(report.rows.length, 8);
  assert.ok(report.demonstrations.length >= 10);
  assert.equal(report.zeros.length, 2);
  assert.ok(report.groupConstraints.length === 8);
});

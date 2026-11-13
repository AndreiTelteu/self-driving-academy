import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ROUTE_POLICY_V2_KEYS,
  ROUTE_POLICY_V2_LIMITS,
  ROUTE_POLICY_V2_M_KEYS,
  compileRoutePolicyProfile,
  getRoutePolicyV2Stats,
} from '../../src/autonomy/route-policy-v2';
import { getParameterDefinition } from '../../src/profiles';
import {
  CORRIDORS,
  chosenRoute,
  defaultRoutePolicyValues,
  evaluate,
  neutralRoutePolicyValues,
  routeAlternative,
  routeFacts,
  routePolicyDocument,
  routePolicyProfile,
  scenario,
  scenarioRows,
  trafficDelay,
} from './route-policy-v2-reference';
import type { RoutePolicyScene } from './route-policy-v2-reference';
import { expectedUnits, runRoutePolicyReport } from './route-policy-v2-report';

const ranges: Readonly<Record<string, readonly [number, number]>> = {
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
  sceneOf = (key: string): RoutePolicyScene => {
    const row = scenarioRows.find((entry) => entry.key === key);
    if (row === undefined) throw new Error(`Missing scenario ${key}`);
    return row.scene;
  };

test('181 compiles the eight R and two delivered M keys with their catalog units', () => {
  assert.deepEqual(ROUTE_POLICY_V2_KEYS, [
    'route_time_weight',
    'route_distance_weight',
    'route_turn_penalty',
    'route_signal_penalty',
    'route_congestion_penalty',
    'reroute_patience',
    'u_turn_willingness',
    'reverse_recovery_duration',
  ]);
  assert.deepEqual(ROUTE_POLICY_V2_M_KEYS, ['speed_delta_urban', 'speed_delta_residential']);
  for (const [key, [minimum, maximum]] of Object.entries(ranges)) {
    const definition = getParameterDefinition(key);
    assert.equal(definition.min, minimum);
    assert.equal(definition.max, maximum);
    assert.equal(definition.unit, expectedUnits[key as keyof typeof expectedUnits]);
    assert.equal(definition.implemented, false);
  }
  const profile = routePolicyProfile({
    route_time_weight: 0.9,
    u_turn_willingness: 0.25,
    reverse_recovery_duration: 5,
  });
  assert.equal(profile.version, '181-route-policy-v2');
  assert.equal(profile.values.route_time_weight, 0.9);
  assert.equal(profile.units.u_turn_willingness, 'probability');
  assert.equal(profile.units.route_turn_penalty, 's');
  assert.equal(profile.provenance.route_time_weight, 'BASE');
  assert.deepEqual(profile.mUnits, { speed_delta_urban: 'm/s', speed_delta_residential: 'm/s' });
  assert.deepEqual(getRoutePolicyV2Stats(), {
    compiling: false,
    evaluating: false,
    retainedHistory: 0,
  });
  assert.equal(ROUTE_POLICY_V2_LIMITS.retainedHistory, 0);
});

test('181 refuses a document without a key, with a wrong unit or with an out-of-catalog value', () => {
  const missing = routePolicyDocument();
  delete (missing.parameters as Record<string, number>).route_congestion_penalty;
  delete (missing.unitsByParameter as Record<string, string>).route_congestion_penalty;
  delete (missing.provenanceByParameter as Record<string, string>).route_congestion_penalty;
  delete (missing.evidenceByParameter as Record<string, null>).route_congestion_penalty;
  assert.throws(() => compileRoutePolicyProfile(missing), /Missing route policy v2 parameter/);
  const wrongUnit = routePolicyDocument();
  (wrongUnit.unitsByParameter as Record<string, string>).route_signal_penalty = 'm';
  assert.throws(() => compileRoutePolicyProfile(wrongUnit), /Wrong unit/);
  assert.throws(() => routePolicyProfile({ route_time_weight: 1.5 }), /range/);
  assert.throws(() => routePolicyProfile({ route_turn_penalty: 21 }), /range/);
  assert.throws(() => routePolicyProfile({ reroute_patience: 1 }), /range/);
  const missingM = routePolicyDocument();
  delete (missingM.parameters as Record<string, number>).speed_delta_urban;
  delete (missingM.unitsByParameter as Record<string, string>).speed_delta_urban;
  delete (missingM.provenanceByParameter as Record<string, string>).speed_delta_urban;
  delete (missingM.evidenceByParameter as Record<string, null>).speed_delta_urban;
  assert.throws(() => compileRoutePolicyProfile(missingM), /Missing route policy v2 M parameter/);
});

test('181 normalizes the weights: shares of one budget, identical coefficients at every scale', () => {
  const base = {
      route_time_weight: 0.06,
      route_distance_weight: 0.03,
      route_turn_penalty: 0.2,
      route_signal_penalty: 0.5,
      route_congestion_penalty: 0.05,
    },
    coefficients = (factor: number) => {
      const command = evaluate(sceneOf('route_time_weight'), {
        rValues: Object.fromEntries(
          Object.entries(base).map(([key, value]) => [key, value * factor]),
        ),
      }).command;
      assert.ok(command.weights !== null);
      return command.weights;
    },
    reference = coefficients(1);
  for (const factor of [0.5, 2, 5, 10])
    assert.deepEqual(coefficients(factor), reference, `factor ${factor}`);
  const sum = Object.values(reference).reduce((total, share) => total + share, 0);
  assert.ok(close(sum, 1, 1e-9), `shares sum to ${sum}`);
  assert.ok(reference.signal > reference.time);
  // A profile whose weights are all zero has no preference: the tie breaks by route id.
  const zero = evaluate(sceneOf('route_time_weight'), {
    rValues: neutralRoutePolicyValues,
  }).command;
  assert.deepEqual(zero.weights, { time: 0, distance: 0, turn: 0, signal: 0, congestion: 0 });
  assert.equal(zero.candidateRouteId, 'route-fast');
});

test('181 picks the same route at every weight scale, in every scenario and in a near tie', () => {
  const base = {
      route_time_weight: 0.06,
      route_distance_weight: 0.03,
      route_turn_penalty: 0.2,
      route_signal_penalty: 0.5,
      route_congestion_penalty: 0.05,
    },
    factors = [0.5, 1, 2, 5, 10];
  for (const row of scenarioRows) {
    const choices = factors.map(
      (factor) =>
        evaluate(row.scene, {
          rValues: Object.fromEntries(
            Object.entries(base).map(([key, value]) => [key, value * factor]),
          ),
        }).command.candidateRouteId,
    );
    for (const [index, choice] of choices.entries())
      assert.equal(choice, choices[0], `${row.key} at factor ${factors[index]}`);
  }
  // The exact pair from the requirement: the same profile written at two scales.
  const small = evaluate(sceneOf('route_distance_weight'), {
      rValues: {
        route_time_weight: 0.06,
        route_distance_weight: 0.03,
        route_turn_penalty: 0.2,
        route_signal_penalty: 0.5,
        route_congestion_penalty: 0.05,
      },
    }).command,
    large = evaluate(sceneOf('route_distance_weight'), {
      rValues: {
        route_time_weight: 0.6,
        route_distance_weight: 0.3,
        route_turn_penalty: 2,
        route_signal_penalty: 5,
        route_congestion_penalty: 0.5,
      },
    }).command;
  assert.deepEqual(small.weights, large.weights);
  assert.equal(small.candidateRouteId, large.candidateRouteId);
  assert.ok(close(small.routes[0].score ?? 0, large.routes[0].score ?? 0));
});

test('181 detects a scale-dependent rule: the near-tie probe flips a naive epsilon, not the policy', () => {
  const scene: RoutePolicyScene = {
      name: 'aproape egalitate',
      description: '12 ms de congestie declarată pe prima rută',
      routes: [{ id: 'route-north', congestionDelayS: 0.012 }, { id: 'route-south' }],
      currentRouteId: 'route-north',
      waitingSinceTick: scenario.tick,
    },
    north = routeAlternative({ id: 'route-north', congestionDelayS: 0.012 }),
    south = routeAlternative({ id: 'route-south' }),
    raw = (weights: Readonly<Record<string, number>>) =>
      weights.route_time_weight * (north.travelTimeS - south.travelTimeS) +
      weights.route_distance_weight * (north.lengthM - south.lengthM) +
      weights.route_turn_penalty * (north.turns - south.turns) +
      weights.route_signal_penalty * (north.signals - south.signals) +
      weights.route_congestion_penalty * (north.congestionDelayS - south.congestionDelayS),
    epsilon = 0.01,
    scaledWeights = Object.fromEntries(
      Object.entries(defaultRoutePolicyValues).map(([key, value]) => [key, value * 10]),
    );
  assert.ok(close(raw(defaultRoutePolicyValues), 0.006, 1e-12));
  assert.ok(close(raw(scaledWeights), 0.06, 1e-12));
  assert.equal(raw(defaultRoutePolicyValues) > epsilon, false);
  assert.equal(raw(scaledWeights) > epsilon, true);
  const small = evaluate(scene, {}).command,
    large = evaluate(scene, {
      rValues: {
        route_time_weight: 0.6,
        route_distance_weight: 0.3,
        route_turn_penalty: 2,
        route_signal_penalty: 5,
        route_congestion_penalty: 0.5,
      },
    }).command;
  assert.equal(small.candidateRouteId, 'route-south');
  assert.equal(large.candidateRouteId, 'route-south');
  assert.equal(small.reroute.decision, 'WAIT');
  assert.equal(large.reroute.decision, 'WAIT');
});

test('181 gives every key its own observable effect, on comparable real alternatives', () => {
  const expectations: Readonly<Record<string, readonly [number, number]>> = {
    route_time_weight: [113.295, 60.656],
    route_distance_weight: [1094.427, 666.476],
    route_turn_penalty: [4, 1],
    route_signal_penalty: [3, 0],
    route_congestion_penalty: [20, 0],
    reroute_patience: [60, 7140],
    u_turn_willingness: [66.056, 40.049],
    reverse_recovery_duration: [2.5, 8],
  };
  for (const row of scenarioRows) {
    const [low, high] = ranges[row.key],
      lowOutcome = row.measure(evaluate(row.scene, { rValues: { [row.key]: low } }).command),
      highOutcome = row.measure(evaluate(row.scene, { rValues: { [row.key]: high } }).command),
      [expectedLow, expectedHigh] = expectations[row.key];
    assert.ok(close(lowOutcome, expectedLow, 5e-4), `${row.key} low ${lowOutcome}`);
    assert.ok(close(highOutcome, expectedHigh, 5e-4), `${row.key} high ${highOutcome}`);
    assert.notEqual(lowOutcome, highOutcome, `${row.key} must change the outcome`);
  }
});

test('181 keeps 54 separation pairs inert and reports the two time/distance couplings', () => {
  const report = runRoutePolicyReport();
  assert.equal(report.separation.length, 56);
  assert.equal(report.couplings.length, 2);
  assert.deepEqual(report.couplings.map((entry) => `${entry.key}:${entry.scenario}`).sort(), [
    'route_distance_weight:ponderea timpului',
    'route_time_weight:ponderea distanței',
  ]);
  for (const entry of report.separation.filter((row) => !row.coupling))
    assert.equal(entry.difference, 0, `${entry.key} in ${entry.scenario}`);
});

test('181 never admits a forbidden or undeclared U-turn, and samples once per opportunity', () => {
  const scene: RoutePolicyScene = {
      name: 'întoarcere',
      description: 'rută directă versus o rută cu întoarcere în U',
      routes: [{ id: 'route-direct' }, { id: 'route-uturn' }],
      uTurn: 'PERMITTED',
    },
    forbidden = evaluate(scene, { rValues: { u_turn_willingness: 1 }, observation: undefined });
  assert.equal(forbidden.command.candidateRouteId, 'route-uturn');
  for (const permission of ['FORBIDDEN', 'UNKNOWN'] as const) {
    const blocked: RoutePolicyScene = { ...scene, uTurn: permission };
    for (const willingness of [0, 0.5, 1]) {
      const command = evaluate(blocked, { rValues: { u_turn_willingness: willingness } }).command;
      assert.equal(command.uTurn.permission, permission);
      assert.equal(command.uTurn.admitted, false);
      assert.equal(command.uTurn.sample, null);
      assert.equal(command.candidateRouteId, 'route-direct');
    }
  }
  const low = evaluate(scene, { rValues: { u_turn_willingness: 0 } }).command,
    high = evaluate(scene, { rValues: { u_turn_willingness: 1 } }).command;
  assert.equal(low.uTurn.admitted, false);
  assert.equal(low.candidateRouteId, 'route-direct');
  assert.equal(high.uTurn.admitted, true);
  assert.equal(high.candidateRouteId, 'route-uturn');
  assert.ok(high.uTurn.sample !== null && high.uTurn.sample >= 0 && high.uTurn.sample < 1);
  const again = evaluate(scene, { rValues: { u_turn_willingness: 1 } }).command,
    otherOpportunity = evaluate(scene, {
      rValues: { u_turn_willingness: 1 },
      opportunityKey: '181-alt',
    }).command;
  assert.equal(again.uTurn.sample, high.uTurn.sample);
  assert.ok(otherOpportunity.uTurn.sample !== null);
  assert.equal(
    evaluate(scene, { rValues: { u_turn_willingness: 1 }, seed: 7 }).command.uTurn.sample,
    evaluate(scene, { rValues: { u_turn_willingness: 1 }, seed: 7 }).command.uTurn.sample,
  );
});

test('181 floors the reverse recovery and never reverses without declared clearance', () => {
  const scene: RoutePolicyScene = {
      name: 'recuperare',
      description: 'recuperare prin marșarier',
      routes: [{ id: 'route-direct' }],
      recovery: { required: true, reverseClear: true },
    },
    floor = evaluate(scene, { rValues: { reverse_recovery_duration: 0 } }).command,
    middle = evaluate(scene, { rValues: { reverse_recovery_duration: 2 } }).command,
    top = evaluate(scene, { rValues: { reverse_recovery_duration: 8 } }).command,
    blocked = evaluate(
      { ...scene, recovery: { required: true, reverseClear: false } },
      { rValues: { reverse_recovery_duration: 8 } },
    ).command;
  assert.equal(ROUTE_POLICY_V2_LIMITS.minimumReverseRecoveryS, 2.5);
  assert.ok(
    close(
      ROUTE_POLICY_V2_LIMITS.minimumReverseRecoveryS,
      ROUTE_POLICY_V2_LIMITS.minimumReverseDistanceM / ROUTE_POLICY_V2_LIMITS.reverseSpeedMps,
    ),
  );
  for (const command of [floor, middle]) {
    assert.equal(command.action, 'RECOVERY');
    assert.equal(command.reason, 'REVERSE_RECOVERY');
    assert.equal(command.recovery.durationS, 2.5);
    assert.equal(command.recovery.ticks, 150);
    assert.equal(command.recovery.floored, true);
    assert.ok(close(command.recovery.distanceM ?? 0, 3));
  }
  assert.equal(top.recovery.durationS, 8);
  assert.equal(top.recovery.ticks, 480);
  assert.equal(top.recovery.floored, false);
  assert.ok(close(top.recovery.distanceM ?? 0, 9.6));
  assert.equal(blocked.action, 'HOLD');
  assert.equal(blocked.reason, 'RECOVERY_BLOCKED');
  assert.equal(blocked.recovery.committed, false);
  assert.equal(blocked.recovery.durationS, null);
  assert.equal(blocked.candidateRouteId, null);
  // A recovery dominates any route decision: the vehicle cannot follow a route while blocked.
  assert.equal(blocked.selectedRouteId, null);
});

test('181 gates a reroute with patience and leaves an inadmissible route at once', () => {
  const scene = sceneOf('reroute_patience'),
    patienceTicks = (seconds: number) =>
      Math.max(1, Math.ceil(seconds * ROUTE_POLICY_V2_LIMITS.tickHz));
  for (const seconds of [2, 20, 120]) {
    const command = evaluate(scene, { rValues: { reroute_patience: seconds } }).command;
    assert.equal(command.reroute.patienceTicks, patienceTicks(seconds));
    assert.equal(command.candidateRouteId, 'route-direct');
  }
  const waiting = evaluate(scene, { rValues: { reroute_patience: 2 } }).command,
    ready = evaluate(
      { ...scene, waitingSinceTick: scenario.tick - 130 },
      { rValues: { reroute_patience: 2 } },
    ).command,
    fresh = evaluate(
      { ...scene, waitingSinceTick: scenario.tick },
      { rValues: { reroute_patience: 120 } },
    ).command,
    kept = evaluate({ ...scene, currentRouteId: 'route-direct' }, {}).command,
    forced = evaluate(
      {
        name: 'rută curentă indisponibilă',
        description: 'ruta curentă este o întoarcere în U interzisă',
        routes: [{ id: 'route-direct' }, { id: 'route-uturn' }],
        currentRouteId: 'route-uturn',
        uTurn: 'FORBIDDEN',
      },
      { rValues: { reroute_patience: 120 } },
    ).command,
    first = evaluate({ ...scene, currentRouteId: null }, {}).command;
  assert.equal(waiting.action, 'REROUTE_WAIT');
  assert.equal(waiting.reason, 'REROUTE_WAIT');
  assert.equal(waiting.selectedRouteId, 'route-slow');
  assert.equal(waiting.reroute.remainingTicks, 60);
  assert.equal(ready.action, 'ROUTE');
  assert.equal(ready.reason, 'REROUTE_COMMIT');
  assert.equal(ready.selectedRouteId, 'route-direct');
  assert.equal(fresh.reroute.remainingTicks, 7200);
  assert.equal(kept.reroute.decision, 'KEPT');
  assert.equal(kept.reason, 'ROUTE_KEPT');
  assert.equal(kept.selectedRouteId, 'route-direct');
  assert.equal(forced.reroute.decision, 'FORCED');
  assert.equal(forced.reason, 'FORCED_REROUTE');
  assert.equal(forced.selectedRouteId, 'route-direct');
  assert.equal(first.reroute.decision, 'COMMIT');
  assert.equal(first.reason, 'ROUTE_SELECTED');
});

test('181 keeps the delivered M consequences: units, delivered time and the style term', () => {
  const timeScene = sceneOf('route_time_weight'),
    solo = (id: string, mValues?: Record<string, number>) =>
      evaluate(
        { name: `stil ${id}`, description: 'o singură rută', routes: [{ id }] },
        mValues === undefined ? {} : { mValues },
      ).command,
    urbanZero = evaluate(timeScene, { mValues: { speed_delta_urban: 0 } }).command,
    urbanMax = evaluate(timeScene, { mValues: { speed_delta_urban: 15 } }).command,
    shortZero = solo('route-short', { speed_delta_urban: 0 }).routes[0],
    shortMax = solo('route-short', { speed_delta_urban: 15 }).routes[0],
    slowZero = solo('route-slow', { speed_delta_residential: 0 }).routes[0],
    slowMax = solo('route-slow', { speed_delta_residential: 12 }).routes[0];
  // The delivered 041 time never changes when the M style changes.
  assert.equal(shortZero.travelTimeS, shortMax.travelTimeS);
  assert.equal(slowZero.travelTimeS, slowMax.travelTimeS);
  // At delta 0 the style time is exactly the delivered free-flow time.
  assert.ok(close(shortZero.styleTimeS, shortZero.travelTimeS));
  assert.ok(close(slowZero.styleTimeS, slowZero.travelTimeS));
  // A larger delta shortens the style time, and it shortens the slow street relatively more.
  assert.ok(shortMax.styleTimeS < shortZero.styleTimeS);
  assert.ok(slowMax.styleTimeS < slowZero.styleTimeS);
  assert.ok(shortMax.styleTimeS / shortZero.styleTimeS < 0.5);
  assert.ok(slowMax.styleTimeS / slowZero.styleTimeS < 0.5);
  assert.equal(urbanZero.candidateRouteId, 'route-fast');
  assert.equal(urbanMax.candidateRouteId, 'route-short');
});

test('181 reads comparable real alternatives from the delivered 041 planner', () => {
  for (const corridor of CORRIDORS) {
    const fact = routeFacts(corridor.id);
    assert.ok(close(fact.penaltySeconds, fact.continuationPenaltyS), corridor.id);
    assert.ok(close(fact.continuationPenaltyS, 0.5 * (fact.path.length - 1)), corridor.id);
    assert.equal(fact.path[0], 'route-in');
    assert.equal(fact.path[fact.path.length - 1], 'route-out');
    assert.ok(fact.lengthM > 0 && fact.travelTimeS > 0);
  }
  // The turn pair is identical in every delivered dimension; only the declared turn count differs.
  const heavy = routeFacts('route-turn-heavy'),
    light = routeFacts('route-turn-light');
  assert.equal(heavy.lengthM, light.lengthM);
  assert.equal(heavy.travelTimeS, light.travelTimeS);
  assert.equal(heavy.derivedTurns, 0);
  assert.equal(light.derivedTurns, 0);
  // The congestion pair is symmetric; only the declared traffic differs.
  assert.equal(routeFacts('route-north').travelTimeS, routeFacts('route-south').travelTimeS);
  assert.equal(routeFacts('route-north').congestionDelayS, 0);
  assert.ok(close(trafficDelay('route-north', 10), 20));
  assert.ok(close(trafficDelay('route-south', 10), 20));
  // The U-turn route is better in time and length, so its willingness is the only gate.
  const direct = routeFacts('route-direct'),
    uTurn = routeFacts('route-uturn');
  assert.ok(uTurn.travelTimeS < direct.travelTimeS);
  assert.ok(uTurn.lengthM < direct.lengthM);
});

test('181 is deterministic and keeps no history between decisions', () => {
  const fingerprint = () =>
    JSON.stringify(
      scenarioRows.map(
        (row) => evaluate(row.scene, { rValues: { [row.key]: ranges[row.key][1] } }).command,
      ),
    );
  assert.equal(fingerprint(), fingerprint());
  const first = evaluate(sceneOf('route_time_weight'), {
      rValues: { route_time_weight: 1 },
    }).command,
    second = evaluate(sceneOf('route_time_weight'), {
      rValues: { route_time_weight: 1 },
    }).command;
  assert.deepEqual(first, second);
  assert.equal(first.retainedHistory, 0);
  assert.ok(Object.isFrozen(first));
  assert.equal(getRoutePolicyV2Stats().evaluating, false);
});

test('181 refuses foreign, stale, incomplete or unauthorized input before any key takes effect', () => {
  const scene = sceneOf('route_time_weight'),
    manual = evaluate(scene, { authority: 'MANUAL' }).command,
    foreignObservation = evaluate(scene, {
      observation: { ...evaluate(scene).input.observation, tick: scenario.tick + 1 },
    }).command,
    foreignActor = evaluate(scene, {
      observation: {
        ...evaluate(scene).input.observation,
        actor: { id: 'other', incarnation: 1 },
      },
    }).command,
    otherScope = evaluate(scene, {
      observation: { ...evaluate(scene).input.observation, sessionId: 'other' },
    }).command,
    missing = evaluate(scene, { profile: null }).command,
    empty = evaluate({ ...scene, routes: [] }).command,
    duplicate = evaluate({
      ...scene,
      routes: [{ id: 'route-short' }, { id: 'route-short' }],
    }).command;
  assert.equal(manual.reason, 'NO_AUTO_AUTHORITY');
  assert.equal(manual.action, 'UNAVAILABLE');
  assert.equal(manual.selectedRouteId, null);
  assert.equal(foreignObservation.reason, 'FOREIGN_OR_STALE_OBSERVATION');
  assert.equal(foreignActor.reason, 'FOREIGN_OR_STALE_OBSERVATION');
  assert.equal(otherScope.reason, 'FOREIGN_OR_STALE_OBSERVATION');
  assert.equal(missing.reason, 'MISSING_PROFILE');
  assert.equal(missing.weights, null);
  assert.equal(empty.reason, 'NO_ALTERNATIVES');
  assert.equal(duplicate.reason, 'DUPLICATE_ALTERNATIVE');
  assert.throws(
    () => evaluate(scene, { profile: { ...evaluate(scene).profile } }),
    /profile token provenance/,
  );
  assert.throws(
    () =>
      evaluate(scene, {
        observation: { ...evaluate(scene).input.observation, waitingSinceTick: scenario.tick + 1 },
      }),
    /after the decision tick/,
  );
  assert.throws(
    () =>
      evaluate(scene, {
        observation: { ...evaluate(scene).input.observation, uTurn: 'MAYBE' as 'PERMITTED' },
      }),
    /Unsupported enum value/,
  );
  assert.throws(
    () =>
      evaluate({
        ...scene,
        routes: [{ id: 'route-short', turns: 1.5 }],
      }),
    /not an integer/,
  );
  assert.throws(() => routeAlternative({ id: 'missing-route' }), /Unknown corridor/);
});

test('181 reports the whole contract with every check passing', () => {
  const report = runRoutePolicyReport();
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
  assert.equal(report.determinism.digest, report.determinism.repeatedDigest);
  assert.equal(report.normalization.identicalDecisions, scenarioRows.length);
  assert.ok(report.normalization.nearTie.naiveBase !== report.normalization.nearTie.naiveScaled);
  assert.ok(chosenRoute(evaluate(sceneOf('route_signal_penalty')).command) !== null);
});

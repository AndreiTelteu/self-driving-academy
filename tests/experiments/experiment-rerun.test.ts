import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EXPERIMENT_RERUN_REPRODUCIBILITY,
  EXPERIMENT_RERUN_VERSION,
  experimentRerunDivergenceCauses,
  experimentRerunPolicyKeys,
  experimentRerunRefusalCodes,
  runExperimentRerun,
} from '../../src/experiments';
import type {
  ExperimentRerunCompleted,
  ExperimentRerunOpportunity,
  ExperimentRerunRequest,
  ExperimentRerunResult,
} from '../../src/experiments';
import type { ParameterKey } from '../../src/profiles';
import { deriveOpportunitySeed, deriveScenarioSeed, deriveVehicleSeed } from '../../src/sessions';
import {
  RERUN_FIXTURE,
  RERUN_PROFILE_KEYS,
  createRerunFixture,
  createRerunProfile,
  createRerunScenario,
  movingLedgerPort,
  publishRerunProfile,
  rawRerunProfile,
  rerunRequest,
} from './experiment-rerun-fixture';
import type { RerunFixture } from './experiment-rerun-fixture';

function rerun(
  fixture: RerunFixture,
  overrides: Partial<ExperimentRerunRequest> = {},
): ExperimentRerunResult {
  return runExperimentRerun(rerunRequest(fixture, overrides), fixture.ports);
}

function completed(result: ExperimentRerunResult): ExperimentRerunCompleted {
  assert.equal(result.status, 'RERUN', JSON.stringify(result).slice(0, 500));
  return result as ExperimentRerunCompleted;
}

function refused(result: ExperimentRerunResult) {
  assert.equal(result.status, 'REFUSED', JSON.stringify(result).slice(0, 500));
  return result as Extract<ExperimentRerunResult, { status: 'REFUSED' }>;
}

/** One signalized approach, so a dedicated scenario can move exactly one profile parameter. */
function signalOpportunity(
  overrides: Partial<ExperimentRerunOpportunity> = {},
): ExperimentRerunOpportunity {
  return Object.freeze({
    opportunityKey: 'opportunity-01',
    kind: 'SIGNAL' as const,
    vehicleId: 'taxi-02',
    decisionTick: 62,
    distanceToStopLineM: 3,
    speedMps: 10,
    phase: 'RED' as const,
    signalId: 'signal-02',
    phaseElapsedS: 0,
    ...overrides,
  });
}

test('142 reruns from the 140 snapshot and proves the request and the start state are identical', () => {
  const fixture = createRerunFixture();
  const result = completed(rerun(fixture));

  assert.equal(result.version, EXPERIMENT_RERUN_VERSION);
  // The start state is the real 206 capture of the 70-vehicle fixture, compared field by field by 140.
  assert.equal(result.state.tick, 60);
  assert.equal(result.snapshot.ticksAdvanced, 0);
  assert.equal(result.state.fields, 3_080);
  assert.equal(result.state.entities, 287);
  assert.equal(result.state.mismatches, 0);
  assert.equal(
    result.state.checksum,
    'c5a0738c0be1b8a149726738b9b9cccad5655229c542396b04d8aa9d24d8bcb5',
  );
  assert.equal(result.state.counts.vehicles, 70);
  assert.equal(result.state.counts.opportunities, 64);
  assert.equal(result.state.counts.signals, 8);
  assert.equal(result.state.rngSeed, 0x5eed_1e);

  const [comparison] = result.comparisons;
  assert.ok(comparison !== undefined);
  assert.equal(comparison.sameRequest, true);
  assert.equal(comparison.sameSeed, true);
  assert.equal(comparison.sameState, true);
  // Every run reports the same request digest and the same start state.
  for (const run of result.runs) {
    assert.equal(run.requestDigest, result.runs[0]?.requestDigest);
    assert.deepEqual(run.state, result.runs[0]?.state);
  }
});

test('142 reruns two profiles on the same snapshot with the same controlled seed chain', () => {
  const fixture = createRerunFixture();
  const result = completed(rerun(fixture));
  const scenarioSeed = deriveScenarioSeed(RERUN_FIXTURE.baseSeed, RERUN_FIXTURE.scenarioId);

  assert.equal(result.seed.baseSeed, RERUN_FIXTURE.baseSeed);
  assert.equal(result.seed.scenarioSeed, scenarioSeed);
  assert.equal(result.seed.profileIdentityInSeed, false);
  assert.equal(result.addressing.length, RERUN_FIXTURE.opportunityCount);

  assert.equal(result.runs.length, 2);
  const [left, right] = result.runs;
  assert.ok(left !== undefined && right !== undefined);
  assert.equal(left.profileVersionId, RERUN_FIXTURE.versionIds.PRUDENT);
  assert.equal(right.profileVersionId, RERUN_FIXTURE.versionIds.IMPULSIVE);
  assert.equal(left.decisions.length, RERUN_FIXTURE.opportunityCount);

  for (let index = 0; index < left.decisions.length; index += 1) {
    const a = left.decisions[index];
    const b = right.decisions[index];
    if (a === undefined || b === undefined) throw new Error('missing decision');
    const vehicleSeed = deriveVehicleSeed(scenarioSeed, a.vehicleId);
    // The addressing is the documented (taxi, event) pair and it is identical for both profiles.
    assert.equal(a.vehicleSeed, vehicleSeed);
    assert.equal(a.opportunitySeed, deriveOpportunitySeed(vehicleSeed, a.opportunityKey));
    assert.equal(a.opportunitySeed, b.opportunitySeed);
    assert.equal(a.sampledUnit, b.sampledUnit);
    assert.equal(a.opportunityKey, b.opportunityKey);
    assert.equal(a.decisionTick, b.decisionTick);
  }
  // Same seed, different profiles: the outcomes differ.
  assert.notEqual(left.traceDigest, right.traceDigest);
  assert.notDeepEqual(left.outcome.byAction, right.outcome.byAction);
});

test('142 reports exactly what differs between the two profiles, per opportunity and parameter', () => {
  const fixture = createRerunFixture();
  const result = completed(rerun(fixture));
  const [comparison] = result.comparisons;
  assert.ok(comparison !== undefined);

  assert.equal(comparison.decisions, RERUN_FIXTURE.opportunityCount);
  assert.equal(comparison.identical + comparison.divergent, comparison.decisions);
  assert.equal(comparison.divergent, 8);
  assert.equal(comparison.identical, 16);
  assert.deepEqual(comparison.causeCounts, {
    PROBABILITY_THRESHOLD: 7,
    GEOMETRY_PARAMETER: 1,
    SEED_DIVERGENCE: 0,
    UNCLASSIFIED: 0,
  });
  assert.deepEqual(comparison.parameterCounts, {
    stop_full_probability: 4,
    red_stop_probability: 3,
    stop_dwell_time: 1,
  });
  // Every profile key the two policies read really differs, so the attribution is auditable.
  assert.deepEqual(
    comparison.profileDifferences.map((entry) => entry.key),
    [...RERUN_PROFILE_KEYS],
  );
  assert.ok(comparison.profileDifferences.every((entry) => entry.differs));

  for (const divergence of comparison.divergences) {
    assert.notEqual(divergence.left.action, divergence.right.action);
    assert.equal(divergence.left.opportunityKey, divergence.right.opportunityKey);
    assert.equal(divergence.left.sampledUnit, divergence.right.sampledUnit);
    assert.ok(
      (experimentRerunDivergenceCauses as readonly string[]).includes(divergence.cause),
      divergence.cause,
    );
    // Every divergence is explained by a named profile parameter; nothing is left unattributed.
    assert.notEqual(divergence.parameter, null);
    assert.ok(
      (experimentRerunPolicyKeys[divergence.kind] as readonly string[]).includes(
        String(divergence.parameter),
      ),
    );
    assert.match(divergence.detail, /versus/);
    assert.ok(
      divergence.parameters.some((entry) => entry.key === divergence.parameter && entry.differs),
    );
  }
});

test('142 attributes a divergence to the single parameter that caused it', () => {
  // Same base profile, same snapshot, same seed: only `red_stop_line_offset` moves. Both profiles
  // still stop, so the divergence is the stop point: approach versus hold.
  const offsetFixture = createRerunFixture();
  const offset = completed(
    rerun(offsetFixture, {
      profiles: Object.freeze([
        publishRerunProfile('PRUDENT', 'offset-far@1', { red_stop_line_offset: 5 }),
        publishRerunProfile('PRUDENT', 'offset-near@1', { red_stop_line_offset: 0.2 }),
      ]),
      scenario: createRerunScenario({
        ticks: 2,
        opportunities: Object.freeze([signalOpportunity()]),
      }),
    }),
  );
  const [offsetComparison] = offset.comparisons;
  assert.ok(offsetComparison !== undefined);
  assert.equal(offsetComparison.divergent, 1);
  const [offsetDivergence] = offsetComparison.divergences;
  assert.ok(offsetDivergence !== undefined);
  assert.equal(offsetDivergence.cause, 'GEOMETRY_PARAMETER');
  assert.equal(offsetDivergence.parameter, 'red_stop_line_offset');
  assert.equal(offsetDivergence.left.action, 'STOP');
  assert.equal(offsetDivergence.right.action, 'STOP');
  assert.notEqual(offsetDivergence.left.reason, offsetDivergence.right.reason);

  // Only `late_red_brake_threshold` moves: neither profile stops for the red itself, so the braking
  // horizon decides between a late brake and crossing.
  const brakeFixture = createRerunFixture();
  const brake = completed(
    rerun(brakeFixture, {
      profiles: Object.freeze([
        publishRerunProfile('PRUDENT', 'brake-long@1', {
          red_stop_probability: 0,
          late_red_brake_threshold: 6,
        }),
        publishRerunProfile('PRUDENT', 'brake-short@1', {
          red_stop_probability: 0,
          late_red_brake_threshold: 0.2,
        }),
      ]),
      scenario: createRerunScenario({
        ticks: 2,
        opportunities: Object.freeze([
          signalOpportunity({ distanceToStopLineM: 20, speedMps: 10 }),
        ]),
      }),
    }),
  );
  const [brakeComparison] = brake.comparisons;
  assert.ok(brakeComparison !== undefined);
  assert.equal(brakeComparison.divergent, 1);
  const [brakeDivergence] = brakeComparison.divergences;
  assert.ok(brakeDivergence !== undefined);
  assert.equal(brakeDivergence.cause, 'GEOMETRY_PARAMETER');
  assert.equal(brakeDivergence.parameter, 'late_red_brake_threshold');
  assert.equal(brakeDivergence.left.action, 'PROCEED');
  assert.equal(brakeDivergence.right.action, 'STOP');
});

test('142 produces the same results when the same request is rerun again', () => {
  const first = completed(rerun(createRerunFixture()));
  const second = completed(rerun(createRerunFixture()));

  assert.equal(first.seed.scenarioSeed, second.seed.scenarioSeed);
  assert.equal(first.runs[0]?.requestDigest, second.runs[0]?.requestDigest);
  assert.deepEqual(first.addressing, second.addressing);
  assert.deepEqual(
    first.runs.map((run) => run.traceDigest),
    second.runs.map((run) => run.traceDigest),
  );
  assert.deepEqual(first.runs[0]?.decisions, second.runs[0]?.decisions);
  assert.deepEqual(first.comparisons[0]?.causeCounts, second.comparisons[0]?.causeCounts);
});

test('142 reports the opportunity divergence without promising bit exactness across platforms', () => {
  assert.equal(EXPERIMENT_RERUN_REPRODUCIBILITY.scope, 'SAME_PLATFORM_SAME_SEED');
  assert.equal(EXPERIMENT_RERUN_REPRODUCIBILITY.crossPlatformBitExactness, false);
  assert.match(EXPERIMENT_RERUN_REPRODUCIBILITY.statement, /aceeași platformă/);
  assert.match(EXPERIMENT_RERUN_REPRODUCIBILITY.statement, /nu este promisă/);

  const result = completed(rerun(createRerunFixture()));
  assert.deepEqual(result.reproducibility, EXPERIMENT_RERUN_REPRODUCIBILITY);
  for (const comparison of result.comparisons) {
    assert.deepEqual(comparison.reproducibility, EXPERIMENT_RERUN_REPRODUCIBILITY);
    assert.equal(comparison.sameSeed, true);
  }
});

test('142 keeps the live ledgers isolated: identical fingerprint, zero live writes', () => {
  const fixture = createRerunFixture();
  const before = fixture.ledgers.fingerprint();
  const result = completed(rerun(fixture));

  assert.equal(result.ledger.unchanged, true);
  assert.equal(result.ledger.liveWrites, 0);
  assert.deepEqual(result.ledger.changedLedgers, []);
  assert.deepEqual(result.ledger.before, before);
  assert.deepEqual(result.ledger.after, before);
  assert.deepEqual(fixture.ledgers.fingerprint(), before);
  assert.equal(result.ledger.refusedWrites, 0);
  assert.equal(result.ledger.copyWrites, 0);

  // Control: a ledger that moves during the rerun is detected, so the check is not a constant.
  const moving = createRerunFixture();
  const moved = refused(
    runExperimentRerun(
      rerunRequest(moving, { ledger: movingLedgerPort(moving.ledgers.port) }),
      moving.ports,
    ),
  );
  assert.equal(moved.stage, 'LEDGER');
  assert.deepEqual(moved.codes, ['LEDGER_CHANGED']);
  assert.deepEqual(moved.paths, ['ledger.KPI']);
});

test('142 refuses an incompatible snapshot instead of rerunning it', () => {
  const fixture = createRerunFixture();
  const result = refused(
    rerun(fixture, {
      snapshot: {
        ...fixture.snapshot,
        storedVersions: {
          engineVersion: 'babylon-9.28.0',
          physicsVersion: 'ammo-0.4.0',
          mapVersion: 'city-v2',
        },
      },
    }),
  );
  assert.equal(result.stage, 'SNAPSHOT');
  assert.deepEqual(result.codes, ['SNAPSHOT_REFUSED']);
  assert.deepEqual(result.snapshot?.codes, [
    'ENGINE_VERSION_MISMATCH',
    'PHYSICS_BACKEND_MISMATCH',
    'MAP_VERSION_MISMATCH',
  ]);
  assert.equal(result.snapshot?.stage, 'COMPATIBILITY');
  // Nothing was rerun and the live ledgers are still intact.
  assert.equal(result.ledger.unchanged, true);
  assert.equal(result.ledger.liveWrites, 0);
});

test('142 refuses a scenario or a profile it cannot run, naming every path', () => {
  const fixture = createRerunFixture();
  const unknown = refused(
    rerun(fixture, {
      scenario: createRerunScenario({
        ticks: 2,
        opportunities: Object.freeze([
          signalOpportunity({ opportunityKey: 'opportunity-99' }),
          {
            ...signalOpportunity({ opportunityKey: 'opportunity-02' }),
            vehicleId: 'taxi-99',
            decisionTick: 99,
            signalId: 'signal-99',
          },
        ]),
      }),
    }),
  );
  assert.equal(unknown.stage, 'SCENARIO');
  assert.deepEqual(unknown.codes, [
    'OPPORTUNITY_UNKNOWN',
    'SIGNAL_UNKNOWN',
    'TICK_OUT_OF_HORIZON',
    'VEHICLE_UNKNOWN',
  ]);
  assert.deepEqual(unknown.paths, [
    'scenario.opportunities[0].opportunityKey',
    'scenario.opportunities[1].vehicleId',
    'scenario.opportunities[1].decisionTick',
    'scenario.opportunities[1].signalId',
  ]);

  // A profile that never passed the 041 publication boundary: a key is missing, a value is not
  // representable. The rerun validates exactly the keys 050/051 read, so both are refused.
  const complete = createRerunProfile('PRUDENT').profile.parameters;
  const { stop_full_probability: removed, ...withoutStop } = complete as Record<string, number>;
  assert.ok(removed !== undefined);
  const missing = refused(
    rerun(fixture, {
      profiles: Object.freeze([
        rawRerunProfile('incomplete@1', withoutStop),
        rawRerunProfile('complete@1', complete as Record<string, number>),
      ]),
    }),
  );
  assert.equal(missing.stage, 'PROFILE');
  assert.deepEqual(missing.codes, ['PROFILE_INCOMPLETE']);
  assert.deepEqual(missing.paths, ['profiles[0].profile.parameters.stop_full_probability']);

  const outOfRange = refused(
    rerun(fixture, {
      profiles: Object.freeze([
        rawRerunProfile('range@1', {
          ...(complete as Record<string, number>),
          red_stop_probability: 4,
        }),
        rawRerunProfile('range-ok@1', complete as Record<string, number>),
      ]),
    }),
  );
  assert.equal(outOfRange.stage, 'PROFILE');
  assert.deepEqual(outOfRange.codes, ['PROFILE_PARAMETER_OUT_OF_RANGE']);
  assert.deepEqual(outOfRange.paths, ['profiles[0].profile.parameters.red_stop_probability']);

  const duplicate = refused(
    rerun(fixture, {
      profiles: Object.freeze([
        publishRerunProfile('PRUDENT', 'same@1'),
        publishRerunProfile('IMPULSIVE', 'same@1'),
      ]),
    }),
  );
  assert.equal(duplicate.stage, 'PROFILE');
  assert.deepEqual(duplicate.codes, ['PROFILE_DUPLICATE']);

  const horizon = refused(
    rerun(fixture, {
      scenario: createRerunScenario({
        ticks: 1,
        opportunities: Object.freeze([signalOpportunity({ decisionTick: 62 })]),
      }),
    }),
  );
  assert.equal(horizon.stage, 'SCENARIO');
  assert.deepEqual(horizon.codes, ['TICK_OUT_OF_HORIZON']);
});

test('142 names the contract surface it publishes', () => {
  assert.equal(EXPERIMENT_RERUN_VERSION, '142-experiment-rerun-v1');
  assert.deepEqual(
    [...experimentRerunPolicyKeys.SIGNAL],
    [
      'red_stop_probability',
      'green_start_delay',
      'red_stop_line_offset',
      'late_red_brake_threshold',
    ],
  );
  assert.deepEqual(
    [...experimentRerunPolicyKeys.STOP],
    ['stop_full_probability', 'stop_dwell_time', 'stop_line_offset'],
  );
  assert.deepEqual(
    [...experimentRerunDivergenceCauses],
    ['PROBABILITY_THRESHOLD', 'GEOMETRY_PARAMETER', 'SEED_DIVERGENCE', 'UNCLASSIFIED'],
  );
  assert.equal(experimentRerunRefusalCodes.length, 11);
  // The seven profile keys the two policies read are a subset of the real catalog.
  const policyKeys = new Set<string>([
    ...experimentRerunPolicyKeys.SIGNAL,
    ...experimentRerunPolicyKeys.STOP,
  ]);
  for (const key of RERUN_PROFILE_KEYS as readonly ParameterKey[]) {
    assert.ok(policyKeys.has(key), `142 fixture profile key ${key} is not read by a policy`);
  }
});

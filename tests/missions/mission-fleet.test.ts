import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  FLEET_COMFORT_TARGETS,
  FLEET_FIDELITY_TARGETS,
  FLEET_LIMITS,
  FLEET_MISSION_ID,
  FLEET_OBJECTIVE_ID,
  FLEET_SCHEMA_VERSION,
  FLEET_SERVICE_TARGETS,
  evaluateFleetMission,
  fleetChallengeBriefing,
  fleetChallengeDefinition,
  fleetComfortVerdicts,
  fleetCompositeRule,
  fleetCompositeVerdicts,
  fleetDimensionIds,
  fleetFidelityVerdicts,
  fleetMissionGate,
  fleetMissionOutcomes,
  fleetMissionReasons,
  fleetRequestStatuses,
  fleetServiceVerdicts,
} from '../../src/missions';
import type { FleetMissionInput } from '../../src/missions';
import { FLEET_FIXTURE_REQUESTS, buildFleetRun, fleetCollision } from './mission-fleet-fixture';
import type { FleetRun } from './mission-fleet-fixture';
import { runMissionFleetReport } from './mission-fleet-report';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '124-mission-fleet', 'report.json');

function withRun<T>(options: Parameters<typeof buildFleetRun>[0], run: (world: FleetRun) => T): T {
  const built = buildFleetRun(options);
  try {
    return run(built);
  } finally {
    built.dispose();
  }
}

function cloneInput(input: FleetMissionInput): FleetMissionInput {
  return JSON.parse(JSON.stringify(input)) as FleetMissionInput;
}

test('124 contract vocabulary, targets and composite rule are closed', () => {
  assert.equal(FLEET_SCHEMA_VERSION, '124-mission-fleet-v1');
  assert.equal(FLEET_MISSION_ID, 'campaign-8-fleet-challenge');
  assert.equal(FLEET_OBJECTIVE_ID, 'fleet-clean-dropoffs');
  assert.equal(FLEET_LIMITS.taxis, 70);
  assert.equal(FLEET_LIMITS.windowTicks, 5_184_000);
  assert.equal(FLEET_SERVICE_TARGETS.minimumServedFraction, 1);
  assert.equal(FLEET_SERVICE_TARGETS.maximumLateRides, 0);
  assert.equal(FLEET_COMFORT_TARGETS.minimumRides, 1);
  assert.equal(FLEET_COMFORT_TARGETS.passengerRequired, true);
  assert.equal(FLEET_FIDELITY_TARGETS.minimumMatchedFraction, 1);
  assert.equal(FLEET_FIDELITY_TARGETS.requiredVerdict, 'EXACT');
  assert.deepEqual([...fleetServiceVerdicts], ['MET', 'BELOW_TARGET']);
  assert.deepEqual([...fleetComfortVerdicts], ['PASSED', 'FAILED', 'NOT_EVALUATED']);
  assert.deepEqual([...fleetFidelityVerdicts], ['MET', 'BELOW_TARGET']);
  assert.deepEqual([...fleetCompositeVerdicts], ['SUCCESS', 'FAILURE', 'INCOMPLETE']);
  assert.deepEqual([...fleetMissionOutcomes], ['PROGRESS', 'NO_PROGRESS']);
  assert.deepEqual([...fleetRequestStatuses], ['SERVED', 'FAILED', 'CANCELLED', 'PENDING']);
  assert.deepEqual(
    [...fleetMissionReasons],
    [
      'SERVICE_BELOW_TARGET',
      'COMFORT_FAILED',
      'COMFORT_NOT_EVALUATED',
      'FIDELITY_BELOW_TARGET',
      'INCIDENT_BUDGET_EXCEEDED',
      'WINDOW_INCOMPLETE',
    ],
  );
  assert.deepEqual(
    [...fleetDimensionIds],
    ['SERVICE', 'COMFORT', 'FIDELITY', 'INCIDENTS', 'WINDOW'],
  );
  assert.equal(fleetCompositeRule.id, 'ALL_DIMENSIONS_WITHIN_BUDGET');
  assert.deepEqual([...fleetCompositeRule.verdicts], ['SUCCESS', 'FAILURE', 'INCOMPLETE']);
  assert.equal(FLEET_LIMITS.version, FLEET_SCHEMA_VERSION, 'the limits carry the contract version');
});

test('124 briefing shows the window, conditions, targets and budget before start', () => {
  const definition = fleetChallengeDefinition();
  const briefing = fleetChallengeBriefing({
    definition,
    difficulty: 'NORMAL',
    startTick: 1_000,
    profile: { profileId: 'city:common', versionId: 'fleet-124-v1' },
  });
  assert.equal(briefing.status, 'BEFORE_START');
  assert.equal(briefing.missionId, FLEET_MISSION_ID);
  assert.equal(briefing.definitionVersion, definition.version);
  assert.deepEqual(briefing.evaluationWindow, {
    startTick: 1_000,
    endTick: 1_000 + 21_600,
    durationTicks: 21_600,
    bounds: 'INCLUSIVE',
  });
  assert.equal(briefing.serviceTargets.minimumServedRides, definition.objectives[0]?.target);
  assert.equal(briefing.serviceTargets.minimumServedFraction, 1);
  assert.equal(briefing.comfortTargets.thresholds.maxAccelerationMps2, 2);
  assert.equal(briefing.comfortTargets.thresholds.maxJerkMps3, 2);
  assert.equal(briefing.fidelityTargets.requiredVerdict, 'EXACT');
  assert.equal(briefing.incidentBudget, definition.incidentBudget);
  assert.equal(briefing.incidentBudget, 0);
  assert.equal(briefing.conditions.length, 4);
  assert.deepEqual(
    briefing.conditions.map((condition) => condition.dimension),
    ['SERVICE', 'COMFORT', 'FIDELITY', 'INCIDENTS'],
  );
  for (const condition of briefing.conditions) assert.ok(condition.statement.length > 0);
  assert.deepEqual(briefing.evaluated, { rides: 0, incidents: 0 });
  assert.equal(Object.isFrozen(briefing), true);
  assert.equal(Object.isFrozen(briefing.conditions[0]), true);

  // EASY/NORMAL/HARD resolve the 116 objective targets, so the shown target cannot drift from the
  // campaign definition.
  const expected = { EASY: 2, NORMAL: 3, HARD: 4 } as const;
  for (const difficulty of ['EASY', 'NORMAL', 'HARD'] as const) {
    const variant = fleetChallengeBriefing({
      definition,
      difficulty,
      startTick: 0,
      profile: { profileId: 'city:common', versionId: 'fleet-124-v1' },
    });
    assert.equal(variant.serviceTargets.minimumServedRides, expected[difficulty]);
  }
});

test('124 accepts a service briefing but refuses any outcome field before start', () => {
  const definition = fleetChallengeDefinition();
  const base = {
    definition,
    difficulty: 'NORMAL',
    startTick: 0,
    profile: { profileId: 'city:common', versionId: 'fleet-124-v1' },
  };
  assert.doesNotThrow(() => fleetChallengeBriefing(base));
  assert.throws(
    () => fleetChallengeBriefing({ ...base, rides: [] }),
    /Unknown fleet briefing field: rides/,
  );
  assert.throws(
    () => fleetChallengeBriefing({ ...base, incidents: [] }),
    /Unknown fleet briefing field: incidents/,
  );
  assert.throws(() => fleetChallengeBriefing({ ...base, startTick: -1 }), /finite number|Invalid/);
});

test('124 success: every real request served, comfort, fidelity and budget pass', () => {
  withRun({}, (run) => {
    const { result } = run;
    assert.equal(result.version, FLEET_SCHEMA_VERSION);
    assert.equal(result.missionId, FLEET_MISSION_ID);
    assert.equal(result.attempt, 1);
    assert.equal(result.service.requests, FLEET_FIXTURE_REQUESTS);
    assert.equal(result.service.served, FLEET_FIXTURE_REQUESTS);
    assert.equal(result.service.failed, 0);
    assert.equal(result.service.cancelled, 0);
    assert.equal(result.service.pending, 0);
    assert.equal(result.service.late, 0);
    assert.equal(result.service.servedFraction, 1);
    assert.equal(result.service.verdict, 'MET');
    assert.equal(result.service.targets.minimumServedRides, 3);
    assert.equal(result.service.missedSeconds, 0);
    assert.ok(result.service.plannedSeconds > 0);
    assert.equal(result.service.rows.length, FLEET_FIXTURE_REQUESTS);
    assert.ok(result.service.rows.every((row) => row.status === 'SERVED'));
    assert.equal(result.comfort.rides, 3);
    assert.equal(result.comfort.passed, 3);
    assert.equal(result.comfort.failed, 0);
    assert.equal(result.comfort.verdict, 'PASSED');
    assert.equal(result.comfort.peakAccelerationMps2, 0);
    assert.equal(result.fidelity.verdict, 'MET');
    assert.equal(result.fidelity.cityVerdict, 'EXACT');
    assert.equal(result.fidelity.matchedFraction, 1);
    assert.equal(result.incidents.limit, 0);
    assert.equal(result.incidents.used, 0);
    assert.equal(result.incidents.remaining, 0);
    assert.equal(result.incidents.withinBudget, true);
    assert.equal(result.composite.verdict, 'SUCCESS');
    assert.deepEqual(result.composite.failingDimensions, []);
    assert.equal(result.evaluationWindow.complete, true);
    assert.equal(result.evaluationWindow.endedAtTick < result.evaluationWindow.endTick, true);
    assert.deepEqual(result.reasons, []);
    assert.equal(result.outcome, 'PROGRESS');
    assert.equal(result.profileWrites, 0);
    assert.equal(result.learningJobs, 0);

    // The embedded briefing is byte-identical to the pre-start contract of the same attempt.
    assert.equal(
      JSON.stringify(result.briefing),
      JSON.stringify(
        fleetChallengeBriefing({
          definition: fleetChallengeDefinition(),
          difficulty: 'NORMAL',
          startTick: 0,
          profile: result.profile,
        }),
      ),
    );
    assert.equal(result.instanceId.length > 0, true);

    const gate = fleetMissionGate(result);
    assert.deepEqual(gate, {
      missionId: FLEET_MISSION_ID,
      objectiveId: FLEET_OBJECTIVE_ID,
      outcome: 'PROGRESS',
      satisfied: true,
      verdict: 'SUCCESS',
      reasons: [],
      dimensions: {
        SERVICE: 'MET',
        COMFORT: 'PASSED',
        FIDELITY: 'MET',
        INCIDENTS: 'WITHIN_BUDGET',
        WINDOW: 'COMPLETE',
      },
    });
  });
});

test('124 failure keeps every dimension visible instead of compensating them', () => {
  withRun({ service: { completed: 2, failed: 30, cancelled: 0 }, comfort: 'FAIL' }, (run) => {
    const { result } = run;
    assert.equal(result.service.served, 2);
    assert.equal(result.service.failed, 30);
    assert.equal(result.service.verdict, 'BELOW_TARGET');
    assert.equal(result.service.servedFraction, 2 / 32);
    assert.equal(result.comfort.verdict, 'FAILED');
    assert.ok(result.comfort.failed > 0);
    // The fleet still reproduces the profile exactly: a failing run does not hide a passing
    // dimension, and the passing dimension does not rescue the run.
    assert.equal(result.fidelity.cityVerdict, 'EXACT');
    assert.equal(result.fidelity.verdict, 'MET');
    assert.equal(result.composite.verdict, 'FAILURE');
    assert.deepEqual(result.composite.failingDimensions, ['SERVICE', 'COMFORT']);
    assert.deepEqual(result.reasons, ['SERVICE_BELOW_TARGET', 'COMFORT_FAILED']);
    assert.equal(result.outcome, 'NO_PROGRESS');
    assert.deepEqual(result.composite.dimensions, {
      SERVICE: false,
      COMFORT: false,
      FIDELITY: true,
      INCIDENTS: true,
    });
    assert.equal(result.evaluationWindow.complete, true);
    assert.equal(fleetMissionGate(result).satisfied, false);
    assert.equal(fleetMissionGate(result).verdict, 'FAILURE');
  });
});

test('124 a replay with another profile keeps the same window and judges its own dimensions', () => {
  const first = buildFleetRun();
  const replay = buildFleetRun({ profile: 'V2', staleVehicles: 6 });
  try {
    assert.notEqual(first.result.instanceId, replay.result.instanceId);
    assert.equal(first.result.attempt, 1);
    assert.equal(replay.result.attempt, 2);
    assert.notEqual(first.result.profile.versionId, replay.result.profile.versionId);
    assert.deepEqual(
      first.result.briefing.evaluationWindow,
      replay.result.briefing.evaluationWindow,
    );
    assert.deepEqual(first.result.briefing.serviceTargets, replay.result.briefing.serviceTargets);
    assert.deepEqual(first.result.briefing.comfortTargets, replay.result.briefing.comfortTargets);
    assert.deepEqual(first.result.briefing.conditions, replay.result.briefing.conditions);

    assert.equal(first.result.composite.verdict, 'SUCCESS');
    assert.equal(replay.result.service.verdict, 'MET');
    assert.equal(replay.result.comfort.verdict, 'PASSED');
    assert.equal(replay.result.fidelity.cityVerdict, 'PARTIAL');
    assert.equal(replay.result.fidelity.verdict, 'BELOW_TARGET');
    assert.ok((replay.result.fidelity.matchedFraction ?? 1) < 1);
    assert.equal(replay.result.composite.verdict, 'FAILURE');
    assert.deepEqual(replay.result.composite.failingDimensions, ['FIDELITY']);
    assert.deepEqual(replay.result.reasons, ['FIDELITY_BELOW_TARGET']);
    assert.equal(replay.result.outcome, 'NO_PROGRESS');
    assert.notEqual(JSON.stringify(first.result), JSON.stringify(replay.result));
  } finally {
    first.dispose();
    replay.dispose();
  }
});

test('124 the numeric incident budget counts real 007 events and can fail the run alone', () => {
  withRun({ incidents: 1 }, (run) => {
    const { result } = run;
    assert.equal(result.incidents.limit, 0);
    assert.equal(result.incidents.used, 1);
    assert.equal(result.incidents.remaining, -1);
    assert.equal(result.incidents.withinBudget, false);
    assert.equal(result.incidents.incidents.length, 1);
    assert.equal(result.incidents.incidents[0]?.tick <= result.evaluationWindow.endedAtTick, true);
    assert.equal(result.service.verdict, 'MET');
    assert.equal(result.comfort.verdict, 'PASSED');
    assert.equal(result.fidelity.verdict, 'MET');
    assert.equal(result.composite.verdict, 'FAILURE');
    assert.deepEqual(result.composite.failingDimensions, ['INCIDENTS']);
    assert.deepEqual(result.reasons, ['INCIDENT_BUDGET_EXCEEDED']);
    assert.deepEqual(result.composite.dimensions, {
      SERVICE: true,
      COMFORT: true,
      FIDELITY: true,
      INCIDENTS: false,
    });
  });
});

test('124 replaying the same collision never inflates the budget', () => {
  withRun({ incidents: 1 }, (run) => {
    const collision = run.input.incidents[0];
    const doubled = cloneInput(run.input);
    const input = {
      ...doubled,
      incidents: [collision, collision],
    } as FleetMissionInput;
    const result = evaluateFleetMission(input);
    assert.equal(result.incidents.used, 1);
    assert.equal(result.incidents.duplicates, 1);
    assert.equal(result.incidents.withinBudget, false);
  });
});

test('124 an incomplete window cannot be reported as a success', () => {
  withRun({ service: { completed: 2, failed: 0, cancelled: 0 } }, (run) => {
    const { result } = run;
    assert.equal(result.service.pending, 30);
    assert.equal(result.evaluationWindow.complete, false);
    assert.equal(result.evaluationWindow.endedAtTick < result.evaluationWindow.endTick, true);
    assert.equal(result.composite.verdict, 'INCOMPLETE');
    assert.ok(result.composite.failingDimensions.includes('WINDOW'));
    assert.ok(result.composite.failingDimensions.includes('SERVICE'));
    assert.ok(result.reasons.includes('WINDOW_INCOMPLETE'));
    assert.ok(result.reasons.includes('SERVICE_BELOW_TARGET'));
    assert.equal(result.outcome, 'NO_PROGRESS');
    assert.equal(fleetMissionGate(result).dimensions.WINDOW, 'INCOMPLETE');
  });
});

test('124 a late ride breaks the service promise without hiding the other dimensions', () => {
  withRun({ lateRequestIndex: 0 }, (run) => {
    const { result } = run;
    assert.equal(result.service.served, FLEET_FIXTURE_REQUESTS);
    assert.equal(result.service.late, 1);
    assert.equal(result.service.verdict, 'BELOW_TARGET');
    assert.equal(result.service.rows.filter((row) => row.late).length, 1);
    assert.equal(result.comfort.verdict, 'PASSED');
    assert.equal(result.fidelity.verdict, 'MET');
    assert.deepEqual(result.composite.failingDimensions, ['SERVICE']);
    assert.equal(result.composite.verdict, 'FAILURE');
    assert.equal(result.outcome, 'NO_PROGRESS');
  });
});

test('124 refuses inputs that could hide a request, a taxi, an incident or another profile', () => {
  withRun({}, (run) => {
    const input = cloneInput(run.input);
    const definition = fleetChallengeDefinition();

    assert.throws(
      () =>
        evaluateFleetMission({
          ...input,
          endedAtTick: (input.definition.windowTicks ?? 0) + 1,
        }),
      /inside the declared evaluation window/,
    );
    assert.throws(
      () =>
        evaluateFleetMission({
          ...input,
          requests: input.requests.map((request, index) =>
            index === 0 ? { ...request, spawnTick: 21_601 } : request,
          ),
        }),
      /outside the declared evaluation interval/,
    );
    assert.throws(
      () =>
        evaluateFleetMission({
          ...input,
          rides: input.rides.map((ride, index) =>
            index === 0 ? { ...ride, requestId: 'request:foreign' } : ride,
          ),
        }),
      /no declared 059 request/,
    );
    assert.throws(
      () =>
        evaluateFleetMission({
          ...input,
          rides: input.rides.map((ride, index) =>
            index === 0 ? { ...ride, taxiId: 'taxi:foreign' } : ride,
          ),
        }),
      /undeclared taxi/,
    );
    assert.throws(
      () =>
        evaluateFleetMission({
          ...input,
          incidents: [fleetCollision('collision:late', 21_601, run.input.fleet.taxis[0]!)],
        }),
      /outside the evaluated interval/,
    );
    assert.throws(
      () =>
        evaluateFleetMission({
          ...input,
          incidents: [fleetCollision('collision:foreign', 1, 'vehicle:foreign')],
        }),
      /declared taxi/,
    );
    assert.throws(
      () =>
        evaluateFleetMission({
          ...input,
          city: { ...(input.city as Record<string, unknown>), profileVersionId: 'other-version' },
        }),
      /another profile version/,
    );
    assert.throws(
      () =>
        evaluateFleetMission({
          ...input,
          comfort: [
            {
              ...(input.comfort[0] as unknown as Record<string, unknown>),
              rideId: 'ride:foreign',
            },
          ],
        }),
      /not a terminal 061 ride/,
    );
    assert.throws(
      () =>
        evaluateFleetMission({
          ...input,
          definition: {
            ...definition,
            missionId: 'campaign-9-foreign',
            objectives: definition.objectives,
          },
        }),
      /cannot evaluate/,
    );
    assert.throws(
      () => evaluateFleetMission({ ...input, hiddenScore: 99 }),
      /Unknown fleet mission/,
    );
  });
});

test('124 evaluation is deterministic, immutable and reads without writing', () => {
  withRun({}, (run) => {
    const first = evaluateFleetMission(run.input);
    const second = evaluateFleetMission(cloneInput(run.input));
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.briefing), true);
    assert.equal(Object.isFrozen(first.service), true);
    assert.equal(Object.isFrozen(first.service.rows), true);
    assert.equal(Object.isFrozen(first.composite), true);
    assert.equal(Object.isFrozen(first.incidents.incidents), true);
    assert.equal(first.profileWrites, 0);
    assert.equal(first.learningJobs, 0);
    // The fixture's 109 store still holds exactly the three authored base versions.
    assert.equal(run.world.store.listVersions().length, 3);
  });
});

test('124 report transcript is deterministic and matches the saved evidence', async () => {
  const report = await runMissionFleetReport();
  assert.equal(report.summary.pass, true, JSON.stringify(report.checks.filter((c) => !c.pass)));
  assert.equal(report.summary.checks, report.checks.length);
  assert.equal(report.runs.length, 5);
  assert.equal(`${JSON.stringify(report, null, 2)}\n`, readFileSync(EVIDENCE, 'utf8'));
});

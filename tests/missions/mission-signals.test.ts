import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SIGNALS_LIMITS,
  SIGNALS_MISSION_ID,
  SIGNALS_SCHEMA_VERSION,
  evaluateSignalMission,
  signalExplanations,
  signalMissionOutcomes,
  signalViolationKinds,
  stopCauses,
} from '../../src/missions';
import {
  SIGNALS_COMPLIANT_PLAN,
  SIGNALS_FULL_STOP_DWELL_S,
  SIGNALS_SHORT_PLAN,
  SIGNALS_SHORT_STOP_DWELL_S,
  SIGNALS_VIOLATION_PLAN,
  buildSignalRun,
} from './mission-signals-fixture';
import type { SignalEpisodeInput, SignalMissionResult } from '../../src/missions';

/**
 * A JSON copy of the mission input, so a test can contradict one real fact and prove the mission
 * refuses it instead of explaining a situation the facts do not support.
 */
interface MutableEpisode {
  opportunity: Record<string, unknown>;
  eligibilityWindow: Record<string, unknown>;
  stopCause: string | null;
  fullStop: boolean | null;
  rollingStop: boolean | null;
  dwellTicks: number | null;
  reaction: { accepted: boolean; reason: string; durationSeconds: number | null } | null;
}

interface MutableInput {
  episodes: MutableEpisode[];
  signal: { certainRedDenominator: number; redStopProbability: Record<string, unknown> };
  stop: {
    certainStopOpportunityDenominator: number;
    certainStopDenominator: number;
    stopFullProbability: Record<string, unknown>;
  };
}

function mutableInput(result: SignalMissionResult, input: unknown): MutableInput {
  assert.equal(result.profileWrites, 0);
  return JSON.parse(JSON.stringify(input)) as MutableInput;
}

function episodeOf(
  result: SignalMissionResult,
  predicate: (entry: SignalMissionResult['episodes'][number]) => boolean,
) {
  const found = result.episodes.find(predicate);
  assert.ok(found, 'expected episode not present in the mission result');
  return found;
}

test('120 contract: the mission is the 116 objective against real 086/087/097/098 facts only', () => {
  assert.equal(SIGNALS_SCHEMA_VERSION, '120-mission-signals-v1');
  assert.equal(SIGNALS_MISSION_ID, 'campaign-4-stops-and-signals');
  assert.equal(SIGNALS_LIMITS.objectiveFullStops, 2);
  assert.equal(SIGNALS_LIMITS.minimumFullStopDwellS, 1.5);
  assert.deepEqual([...signalMissionOutcomes], ['PROGRESS', 'NO_PROGRESS']);
  assert.deepEqual([...signalViolationKinds], ['RED_CROSSED', 'STOP_LINE_CROSSED']);
  assert.deepEqual([...stopCauses], ['STOP_LINE', 'LEADER', 'QUEUE', 'BLOCKED']);
  assert.ok(signalExplanations.includes('TRAFFIC_STOP_NOT_VIOLATION'));
  assert.ok(signalExplanations.includes('BLOCKED_GREEN_NOT_VIOLATION'));

  const run = buildSignalRun(SIGNALS_COMPLIANT_PLAN);
  assert.equal(run.result.version, SIGNALS_SCHEMA_VERSION);
  assert.equal(run.result.missionId, SIGNALS_MISSION_ID);
  assert.equal(run.result.profileWrites, 0);
  assert.equal(run.result.learningJobs, 0);
  assert.equal(run.result.episodes.length, 9);
  // The mission reports the real 097/098 candidates, it never recomputes them.
  assert.equal(
    run.result.learning.redStopProbability.status,
    run.facts.signalResult.candidates.red_stop_probability.status,
  );
  assert.equal(
    run.result.learning.redStopProbability.value,
    run.facts.signalResult.candidates.red_stop_probability.value,
  );
  assert.equal(
    run.result.learning.stopFullProbability.value,
    run.facts.stopResult.candidates.stop_full_probability.value,
  );
});

test('120 compliant run: the 116 objective is met and nothing free-traffic is a violation', () => {
  const run = buildSignalRun(SIGNALS_COMPLIANT_PLAN);
  const { result, facts } = run;

  assert.equal(result.outcome, 'PROGRESS');
  assert.equal(result.reason, null);
  assert.equal(result.violations, 0);
  assert.equal(result.fullStops, 3);
  assert.equal(result.objectiveMet, true);
  assert.equal(result.compliant, 7);
  assert.equal(result.blockedGreens, 1);
  assert.equal(result.trafficStops, 1);

  assert.equal(facts.signalResult.certainRedDenominator, 3);
  assert.equal(facts.stopResult.certainStopOpportunityDenominator, 4);
  assert.equal(facts.stopResult.certainStopDenominator, 3);
  assert.equal(facts.stopResult.trafficInducedStopsExcluded, 1);

  assert.equal(result.learning.redStopProbability.status, 'CANDIDATE');
  assert.equal(result.learning.redStopProbability.value, 1);
  assert.equal(result.learning.stopFullProbability.status, 'CANDIDATE');
  // 3 of 3 stop-line approaches were full stops; the traffic stop is not part of the ratio.
  assert.equal(result.learning.stopFullProbability.value, 1);
  assert.notEqual(result.learning.stopFullProbability.value, 3 / 4);

  assert.equal(new Set(result.episodes.map((entry) => entry.windowClass)).size, 2);
  for (const entry of result.episodes) {
    if (entry.verdict === 'VIOLATION') assert.fail('a compliant run cannot contain a violation');
    if (entry.kind === 'STOP' && entry.stopCause === 'STOP_LINE')
      assert.equal(entry.explanation, 'STOP_LINE_HELD');
  }
  assert.equal(
    episodeOf(result, (entry) => entry.kind === 'STOP' && entry.stopCause === 'STOP_LINE').fullStop,
    true,
  );
});

test('120 blocked green and traffic stop are explained, never scored as violations', () => {
  const run = buildSignalRun(SIGNALS_COMPLIANT_PLAN);
  const { result, facts } = run;

  const blocked = episodeOf(result, (entry) => entry.verdict === 'BLOCKED_GREEN');
  assert.equal(blocked.kind, 'GREEN');
  assert.equal(blocked.windowClass, 'EXTERNAL_CONSTRAINT');
  assert.equal(blocked.label, 'BLOCKED_GREEN');
  assert.equal(blocked.explanation, 'BLOCKED_GREEN_NOT_VIOLATION');
  assert.equal(blocked.violation, null);
  assert.equal(blocked.consequence, null);
  assert.equal(blocked.reaction.applicable, false);
  assert.equal(blocked.reaction.responded, false);
  assert.equal(blocked.reaction.reason, 'EXTERNAL_CONSTRAINT');
  // The real 087 refusal, not a mission guess.
  assert.equal(facts.reactions.get(blocked.opportunityId)!.reason, 'EXTERNAL_CONSTRAINT');

  const traffic = episodeOf(result, (entry) => entry.verdict === 'TRAFFIC_STOP');
  assert.equal(traffic.kind, 'STOP');
  assert.equal(traffic.stopCause, 'LEADER');
  assert.equal(traffic.windowClass, 'EXTERNAL_CONSTRAINT');
  assert.equal(traffic.explanation, 'TRAFFIC_STOP_NOT_VIOLATION');
  assert.equal(traffic.violation, null);
  assert.equal(traffic.consequence, null);
  // The 086 opportunity really is a certain failure; it is excluded for its real cause, not hidden.
  assert.equal(traffic.opportunityResult, 'FAILURE');
  assert.equal(traffic.reaction.applicable, false);
  assert.equal(traffic.reaction.reason, 'EXTERNAL_CONSTRAINT');

  // The blocked green contributes no green-start-delay evidence.
  const delay = facts.evidence.find((row) => row.key === 'green_start_delay')!;
  assert.equal(delay.distinctEpisodes, 1);
  assert.equal(facts.signalResult.candidates.green_start_delay.value, null);
  assert.equal(
    result.episodes.filter((entry) => entry.kind === 'GREEN').length,
    2,
    'two greens were observed, only the free one carries a delay',
  );
});

test('120 violation run: every violation is a real 086 failure inside the real learned candidate', () => {
  const run = buildSignalRun(SIGNALS_VIOLATION_PLAN);
  const { result } = run;

  assert.equal(result.outcome, 'NO_PROGRESS');
  assert.equal(result.reason, 'VIOLATIONS_AND_INSUFFICIENT_FULL_STOPS');
  assert.equal(result.violations, 4);
  assert.equal(result.fullStops, 1);
  assert.equal(result.objectiveMet, false);
  assert.equal(result.compliant, 3);
  assert.equal(result.learning.redStopProbability.status, 'CANDIDATE');
  assert.ok(Math.abs(result.learning.redStopProbability.value! - 1 / 3) < 1e-9);
  assert.equal(result.learning.stopFullProbability.status, 'CANDIDATE');
  assert.ok(Math.abs(result.learning.stopFullProbability.value! - 1 / 3) < 1e-9);

  const violations = result.episodes.filter((entry) => entry.verdict === 'VIOLATION');
  assert.equal(violations.filter((entry) => entry.violation === 'RED_CROSSED').length, 2);
  assert.equal(violations.filter((entry) => entry.violation === 'STOP_LINE_CROSSED').length, 2);
  for (const entry of violations) {
    assert.equal(entry.opportunityResult, 'FAILURE');
    assert.ok(entry.consequence);
    assert.equal(entry.consequence.opportunityResult, 'FAILURE');
    assert.equal(
      entry.consequence.learningKey,
      entry.violation === 'RED_CROSSED' ? 'red_stop_probability' : 'stop_full_probability',
    );
    assert.equal(entry.consequence.candidateStatus, 'CANDIDATE');
    assert.equal(
      entry.consequence.candidateValue,
      result.learning[
        entry.violation === 'RED_CROSSED' ? 'redStopProbability' : 'stopFullProbability'
      ].value,
    );
  }
  assert.equal(
    violations.find((entry) => entry.violation === 'RED_CROSSED')!.explanation,
    'RED_CROSSED',
  );
  assert.equal(
    violations.find((entry) => entry.violation === 'STOP_LINE_CROSSED')!.explanation,
    'STOP_LINE_CROSSED',
  );

  // The same run still contains a blocked green and a traffic stop, and neither is scored.
  const blocked = episodeOf(result, (entry) => entry.verdict === 'BLOCKED_GREEN');
  const traffic = episodeOf(result, (entry) => entry.verdict === 'TRAFFIC_STOP');
  assert.equal(blocked.consequence, null);
  assert.equal(traffic.opportunityResult, 'FAILURE');
  assert.equal(traffic.consequence, null);
  assert.equal(result.blockedGreens, 1);
  assert.equal(result.trafficStops, 1);
});

test('120 objective: a 0.5 s full stop does not satisfy the 1.5 s dwell', () => {
  const run = buildSignalRun(SIGNALS_SHORT_PLAN);
  const { result } = run;

  assert.equal(result.violations, 0);
  assert.equal(result.fullStops, 1);
  assert.equal(result.objectiveMet, false);
  assert.equal(result.outcome, 'NO_PROGRESS');
  assert.equal(result.reason, 'INSUFFICIENT_FULL_STOPS');

  const stops = result.episodes.filter((entry) => entry.stopCause === 'STOP_LINE');
  assert.equal(stops.length, 2);
  assert.equal(stops.filter((entry) => entry.fullStop).length, 2);
  assert.deepEqual(
    stops.map((entry) => entry.dwellS),
    [SIGNALS_FULL_STOP_DWELL_S, SIGNALS_SHORT_STOP_DWELL_S],
  );
  assert.equal(result.learning.stopFullProbability.status, 'UNOBSERVED');
  assert.equal(result.learning.stopFullProbability.value, null);
});

test('120 refuses a contradiction instead of explaining facts that do not exist', () => {
  const run = buildSignalRun(SIGNALS_VIOLATION_PLAN);

  const redCandidate = mutableInput(run.result, run.input);
  redCandidate.signal.redStopProbability.value = 0.9;
  assert.throws(
    () => evaluateSignalMission(redCandidate),
    /097 red_stop_probability candidate does not match the real episodes/,
  );

  // A candidate that disagrees with its own contract is refused before the mission reads it.
  const stopCandidate = mutableInput(run.result, run.input);
  stopCandidate.stop.stopFullProbability.status = 'UNOBSERVED';
  assert.throws(
    () => evaluateSignalMission(stopCandidate),
    /Signal candidate value must exist exactly for an identified candidate/,
  );

  const stopDenominator = mutableInput(run.result, run.input);
  stopDenominator.stop.certainStopDenominator = 2;
  assert.throws(
    () => evaluateSignalMission(stopDenominator),
    /098 stop-line denominator does not match the mission episodes/,
  );

  const foreignWindow = mutableInput(run.result, run.input);
  foreignWindow.episodes[0]!.eligibilityWindow.opportunityId = 'opportunity:somewhere-else';
  assert.throws(
    () => evaluateSignalMission(foreignWindow),
    /Signal episode window does not belong to its opportunity/,
  );

  const duplicate = mutableInput(run.result, run.input);
  duplicate.episodes.push(duplicate.episodes[0]!);
  assert.throws(() => evaluateSignalMission(duplicate), /Duplicate signal mission opportunity/);

  const missingRed = mutableInput(run.result, run.input);
  missingRed.episodes = missingRed.episodes.filter((entry) => entry.opportunity.kind !== 'RED');
  assert.throws(
    () => evaluateSignalMission(missingRed),
    /097 RED denominator does not match the mission episodes/,
  );

  const acceptedConstraint = mutableInput(run.result, run.input);
  const blocked = acceptedConstraint.episodes.find(
    (entry) => entry.eligibilityWindow.label === 'BLOCKED_GREEN',
  )!;
  blocked.reaction = { accepted: true, reason: 'RESPONSE', durationSeconds: 1 };
  assert.throws(
    () => evaluateSignalMission(acceptedConstraint),
    /A constrained window cannot accept a reaction/,
  );

  const noCause = mutableInput(run.result, run.input);
  const stopLine = noCause.episodes.find((entry) => entry.opportunity.kind === 'STOP')!;
  stopLine.stopCause = null;
  assert.throws(() => evaluateSignalMission(noCause), /STOP episode requires a stop cause/);

  const lyingResult = mutableInput(run.result, run.input);
  const crossed = lyingResult.episodes.find(
    (entry) => entry.opportunity.kind === 'RED' && entry.opportunity.outcome === 'CROSSED',
  )!;
  crossed.opportunity.result = 'SUCCESS';
  assert.throws(
    () => evaluateSignalMission(lyingResult),
    /Signal opportunity outcome contradicts its 086 result/,
  );
});

test('120 episode inputs carry only real facts and the mission output is immutable', () => {
  const run = buildSignalRun(SIGNALS_COMPLIANT_PLAN);
  const input = run.input as { episodes: readonly SignalEpisodeInput[] };
  for (const episode of input.episodes) {
    assert.equal(episode.eligibilityWindow.opportunityId, episode.opportunity.id);
    assert.equal(episode.eligibilityWindow.kind, episode.opportunity.kind);
  }
  assert.ok(Object.isFrozen(run.result));
  assert.ok(Object.isFrozen(run.result.episodes));
  assert.throws(() => {
    (run.result as { violations: number }).violations = 9;
  });
});

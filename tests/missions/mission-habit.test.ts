import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  HABIT_LIMITS,
  HABIT_MISSION_ID,
  HABIT_OBJECTIVE,
  HABIT_POLICY,
  HABIT_SCHEMA_VERSION,
  evaluateHabitMission,
  habitDirections,
  habitMissionGate,
  habitMissionOutcomes,
  habitMissionReasons,
  habitRejectionCodes,
  habitStatuses,
} from '../../src/missions';
import { computeProfileVersionChecksum } from '../../src/profiles';
import type { ProfileVersion, ProfileVersionContent } from '../../src/profiles';
import {
  HABIT_FIXTURE_BASE_VALUE,
  HABIT_FIXTURE_ENGINE_VERSION,
  HABIT_FIXTURE_KEY,
  HABIT_FIXTURE_PROFILE_ID,
  createHabitWorld,
} from './mission-habit-fixture';
import type { HabitWorld } from './mission-habit-fixture';
import { runMissionHabitReport } from './mission-habit-report';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '123-mission-habit', 'report.json');
const UP = { stopped: 4, crossed: 0 } as const;
const MIXED = { stopped: 4, crossed: 1 } as const;

async function withWorld<T>(run: (world: HabitWorld) => Promise<T> | T): Promise<T> {
  const world = createHabitWorld();
  try {
    return await run(world);
  } finally {
    world.dispose();
  }
}

async function demonstrated(world: HabitWorld, count: number, input = UP): Promise<void> {
  for (let index = 0; index < count; index += 1)
    await world.demonstrate({ segmentId: `habit-${index + 1}`, ...input });
}

test('123 contract vocabulary and the gradual rule are closed', () => {
  assert.equal(HABIT_SCHEMA_VERSION, '123-mission-habit-v1');
  assert.equal(HABIT_MISSION_ID, 'campaign-7-changing-a-habit');
  assert.deepEqual(HABIT_OBJECTIVE, {
    objectiveId: 'distinct-versions',
    kind: 'DISTINCT_PROFILE_VERSIONS',
    target: 2,
  });
  assert.equal(HABIT_POLICY.stepsToReplace, 3);
  assert.equal(HABIT_POLICY.stepsToReverse, 2);
  assert.equal(HABIT_LIMITS.versions, 128);
  assert.deepEqual([...habitStatuses], ['REPLACED', 'BUILDING', 'NO_DEMONSTRATIONS', 'REJECTED']);
  assert.deepEqual([...habitDirections], ['INCREASE', 'DECREASE', 'NONE']);
  assert.deepEqual([...habitMissionReasons], ['NO_DEMONSTRATIONS', 'TENDENCY_NOT_REPLACED']);
  assert.deepEqual([...habitMissionOutcomes], ['PROGRESS', 'NO_PROGRESS']);
  assert.deepEqual(
    [...habitRejectionCodes],
    [
      'INVALID_INPUT',
      'HISTORY_LIMIT',
      'PROFILE_MISMATCH',
      'NO_BASE_VERSION',
      'DUPLICATE_VERSION',
      'MISSING_INTERMEDIATE_VERSION',
      'ENGINE_VERSION_MISMATCH',
      'VERSION_WITHOUT_KEY',
      'DEMONSTRATION_WITHOUT_EVIDENCE',
      'CHECKSUM_MISMATCH',
      'VALUE_MISMATCH',
    ],
  );
});

test('123 repeated demonstrations replace the old tendency through real 109 versions', async () => {
  await withWorld(async (world) => {
    const values: number[] = [];
    for (let index = 1; index <= 4; index += 1) {
      const demonstration = await world.demonstrate({ segmentId: `repeat-${index}`, ...UP });
      assert.equal(demonstration.pipeline.status, 'COMPOSED');
      assert.equal(demonstration.evidence.fullStops, 4);
      assert.equal(demonstration.evidence.crossings, 0);
      assert.equal(demonstration.evidence.candidateValue, 1);
      assert.equal(demonstration.evidence.ledgerStatus, 'READY');
      assert.equal(demonstration.appliedTick, index);
      assert.equal(demonstration.updatedVehicles, 64);
      values.push(demonstration.value);
    }
    assert.deepEqual(values, [0.8, 0.9, 0.95, 0.975]);

    const result = world.evaluate();
    assert.equal(result.status, 'REPLACED');
    assert.equal(result.reason, null);
    assert.equal(result.key, HABIT_FIXTURE_KEY);
    assert.equal(result.unit, 'probability');
    assert.equal(result.trend?.direction, 'INCREASE');
    assert.equal(result.trend?.consecutiveSteps, 4);
    assert.equal(result.trend?.progress, 1);
    assert.equal(result.trend?.replaced, true);
    assert.equal(result.trend?.contradictions, 0);
    assert.equal(result.trend?.stepsToReplace, 3);
    assert.equal(result.trend?.stepsToReverse, 2);
    assert.equal(result.comparison?.baseValue, HABIT_FIXTURE_BASE_VALUE);
    assert.equal(result.comparison?.headValue, 0.975);
    assert.equal(result.comparison?.change, 0.375);
    assert.equal(result.comparison?.direction, 'INCREASE');
    assert.equal(result.comparison?.versions, 5);
    assert.equal(result.comparison?.demonstrations, 4);
    assert.equal(result.base?.versionId, world.baseVersionId);
    assert.equal(result.profileWrites, 0);
    assert.equal(result.learningJobs, 0);
    assert.deepEqual(habitMissionGate(result), {
      missionId: HABIT_MISSION_ID,
      objectiveId: 'distinct-versions',
      outcome: 'PROGRESS',
      satisfied: true,
      reason: null,
      replaced: true,
      comparedVersions: 5,
      demonstrations: 4,
      direction: 'INCREASE',
    });
  });
});

test('123 every intermediate version keeps its order, provenance and checksum', async () => {
  await withWorld(async (world) => {
    await demonstrated(world, 4);
    const result = world.evaluate();
    assert.equal(result.steps.length, 4);
    const chain = world.store.getHistory(HABIT_FIXTURE_PROFILE_ID);
    assert.equal(chain.length, 5);
    assert.equal(chain[0]?.versionId, world.baseVersionId);
    for (const [index, step] of result.steps.entries()) {
      const stored = chain[index + 1];
      assert.notEqual(stored, undefined);
      assert.equal(step.order, index + 1);
      assert.equal(step.depth, index + 1);
      assert.equal(step.versionId, stored?.versionId);
      assert.equal(step.parentVersionId, chain[index]?.versionId);
      assert.equal(step.checksum, stored?.checksum);
      assert.equal(step.checksumVerified, true);
      assert.match(step.checksum, /^fnv1a64:[0-9a-f]{16}$/);
      assert.equal(step.segmentId, `habit-${index + 1}`);
      assert.equal(step.interventionId, null);
      assert.equal(step.key, HABIT_FIXTURE_KEY);
      assert.equal(step.unit, 'probability');
      assert.deepEqual(
        [...step.sourceSegmentIds],
        [...Array.from({ length: index + 1 }, (_, entry) => `habit-${entry + 1}`)],
      );
      assert.equal(step.previousValue, stored?.provenance.delta?.changes[0]?.previousValue);
      assert.equal(step.newValue, stored?.parameters[HABIT_FIXTURE_KEY]);
      assert.equal(step.direction, 'INCREASE');
      assert.equal(step.absorbed, false);
      assert.equal(step.reversal, false);
    }
    assert.deepEqual(
      result.steps.map((step) => step.newValue),
      [0.8, 0.9, 0.95, 0.975],
    );
    assert.equal(result.steps[3]?.totalChange, 0.375);
    assert.equal(new Set(result.steps.map((step) => step.checksum)).size, 4);
  });
});

test('123 a single contradictory demonstration is absorbed and never reverses the tendency', async () => {
  await withWorld(async (world) => {
    await demonstrated(world, 3);
    const contradiction = await world.demonstrate({ segmentId: 'habit-4', ...MIXED });
    assert.equal(contradiction.pipeline.status, 'COMPOSED');
    assert.equal(contradiction.evidence.fullStops, 4);
    assert.equal(contradiction.evidence.crossings, 1);
    assert.equal(contradiction.evidence.candidateValue, 0.8);
    assert.equal(contradiction.value, 0.8667);

    const result = world.evaluate();
    assert.equal(result.status, 'REPLACED');
    assert.equal(result.trend?.direction, 'INCREASE');
    assert.equal(result.trend?.consecutiveSteps, 3);
    assert.equal(result.trend?.replaced, true);
    assert.equal(result.trend?.contradictions, 1);
    assert.equal(result.trend?.absorbedContradictions, 1);
    assert.equal(result.trend?.reversals, 0);
    assert.equal(result.comparison?.headValue, 0.8667);
    assert.equal(result.comparison?.direction, 'INCREASE');
    assert.ok((result.comparison?.headValue ?? 0) > HABIT_FIXTURE_BASE_VALUE);
    assert.equal(habitMissionGate(result).outcome, 'PROGRESS');

    const last = result.steps.at(-1);
    assert.equal(last?.direction, 'DECREASE');
    assert.equal(last?.trendDirection, 'INCREASE');
    assert.equal(last?.consecutiveSteps, 3);
    assert.equal(last?.absorbed, true);
    assert.equal(last?.reversal, false);
    assert.deepEqual(
      result.steps.map((step) => step.change),
      [0.2, 0.1, 0.05, -0.0833],
    );
  });
});

test('123 repeated contradictions are required to overturn the tendency', async () => {
  await withWorld(async (world) => {
    await demonstrated(world, 3);
    await world.demonstrate({ segmentId: 'habit-4', ...MIXED });
    const absorbed = world.evaluate();
    assert.equal(absorbed.status, 'REPLACED');
    assert.equal(absorbed.trend?.direction, 'INCREASE');
    assert.equal(absorbed.trend?.absorbedContradictions, 1);
    assert.equal(absorbed.trend?.reversals, 0);

    await world.demonstrate({ segmentId: 'habit-5', ...MIXED });
    const flipped = world.evaluate();
    assert.equal(flipped.trend?.direction, 'DECREASE');
    assert.equal(flipped.trend?.consecutiveSteps, 2);
    assert.equal(flipped.trend?.reversals, 1);
    assert.equal(flipped.trend?.absorbedContradictions, 1);
    assert.equal(flipped.trend?.replaced, false);
    assert.equal(flipped.status, 'BUILDING');
    assert.equal(flipped.comparison?.direction, 'INCREASE');
    assert.equal(habitMissionGate(flipped).outcome, 'NO_PROGRESS');
    assert.equal(habitMissionGate(flipped).reason, 'TENDENCY_NOT_REPLACED');
    assert.equal(
      flipped.steps.filter((step) => step.reversal).length,
      1,
      'exactly one step overturns the tendency',
    );
    assert.equal(flipped.steps.at(-1)?.absorbed, false);

    await world.demonstrate({ segmentId: 'habit-6', ...MIXED });
    const reversed = world.evaluate();
    assert.equal(reversed.status, 'REPLACED');
    assert.equal(reversed.trend?.direction, 'DECREASE');
    assert.equal(reversed.trend?.consecutiveSteps, 3);
    assert.equal(reversed.trend?.reversals, 1);
    assert.deepEqual(
      reversed.steps.map((step) => step.newValue),
      [0.8, 0.9, 0.95, 0.8667, 0.8296, 0.8132],
    );
    assert.equal(habitMissionGate(reversed).outcome, 'PROGRESS');
    assert.equal(habitMissionGate(reversed).direction, 'DECREASE');
  });
});

test('123 a history without demonstrations is an empty run, not a rejection', async () => {
  await withWorld((world) => {
    const result = world.evaluate();
    assert.equal(result.status, 'NO_DEMONSTRATIONS');
    assert.equal(result.reason, 'NO_DEMONSTRATIONS');
    assert.equal(result.trend?.direction, 'NONE');
    assert.equal(result.trend?.consecutiveSteps, 0);
    assert.equal(result.trend?.replaced, false);
    assert.equal(result.steps.length, 0);
    assert.equal(result.base?.value, HABIT_FIXTURE_BASE_VALUE);
    assert.equal(result.head?.versionId, world.baseVersionId);
    assert.equal(result.comparison?.versions, 1);
    assert.equal(result.comparison?.demonstrations, 0);
    assert.deepEqual(habitMissionGate(result), {
      missionId: HABIT_MISSION_ID,
      objectiveId: 'distinct-versions',
      outcome: 'NO_PROGRESS',
      satisfied: false,
      reason: 'NO_DEMONSTRATIONS',
      replaced: false,
      comparedVersions: 1,
      demonstrations: 0,
      direction: 'NONE',
    });
  });
});

test('123 refuses inconsistent inputs with closed codes', async () => {
  await withWorld(async (world) => {
    await demonstrated(world, 3);
    const history = world.store.getHistory(HABIT_FIXTURE_PROFILE_ID);
    const [base, first, second, third] = history as readonly ProfileVersion[];
    assert.notEqual(base, undefined);
    assert.notEqual(first, undefined);
    assert.notEqual(second, undefined);
    assert.notEqual(third, undefined);
    const clone = (version: ProfileVersion): ProfileVersion =>
      JSON.parse(JSON.stringify(version)) as ProfileVersion;
    const contentOf = (version: ProfileVersion): ProfileVersionContent => {
      const { checksum: _checksum, ...content } = version;
      return content as ProfileVersionContent;
    };
    const rehashed = (content: ProfileVersionContent): ProfileVersion =>
      Object.freeze({ ...content, checksum: computeProfileVersionChecksum(content) });
    const codeOf = (input: unknown): string | null => {
      const result = evaluateHabitMission(input);
      assert.equal(result.status, 'REJECTED');
      assert.equal(result.steps.length, 0);
      assert.equal(result.trend, null);
      assert.equal(result.profileWrites, 0);
      assert.equal(result.learningJobs, 0);
      assert.ok((result.detail?.length ?? 0) > 0);
      return result.reason as string | null;
    };
    const withHistory = (entries: readonly unknown[]) => ({
      profileId: HABIT_FIXTURE_PROFILE_ID,
      key: HABIT_FIXTURE_KEY,
      history: entries,
    });

    assert.equal(codeOf({ profileId: HABIT_FIXTURE_PROFILE_ID }), 'INVALID_INPUT');
    assert.equal(codeOf(withHistory([clone(first), clone(second)])), 'NO_BASE_VERSION');
    assert.equal(
      codeOf(withHistory([clone(base), clone(first), clone(first)])),
      'DUPLICATE_VERSION',
    );
    assert.equal(
      codeOf(withHistory([clone(base), { ...clone(first), profileId: 'city:foreign' }])),
      'PROFILE_MISMATCH',
    );
    assert.equal(
      codeOf(withHistory([clone(base), clone(first), clone(third)])),
      'MISSING_INTERMEDIATE_VERSION',
    );
    assert.equal(
      codeOf(
        withHistory([
          clone(base),
          rehashed({
            ...contentOf(clone(first)),
            engineVersion: `${HABIT_FIXTURE_ENGINE_VERSION}-other`,
          }),
        ]),
      ),
      'ENGINE_VERSION_MISMATCH',
    );
    assert.equal(
      codeOf(
        withHistory([
          rehashed({
            ...contentOf(clone(base)),
            parameters: Object.fromEntries(
              Object.entries(clone(base).parameters).filter(([key]) => key !== HABIT_FIXTURE_KEY),
            ),
          }),
        ]),
      ),
      'VERSION_WITHOUT_KEY',
    );
    assert.equal(
      codeOf(
        withHistory([
          clone(base),
          rehashed({
            ...contentOf(clone(first)),
            provenance: {
              ...clone(first).provenance,
              delta: null,
              sourceSegmentIds: Object.freeze([]),
            },
          }),
        ]),
      ),
      'DEMONSTRATION_WITHOUT_EVIDENCE',
    );
    assert.equal(
      codeOf(
        withHistory([
          clone(base),
          {
            ...clone(first),
            parameters: { ...clone(first).parameters, stop_full_probability: 0.99 },
          },
        ]),
      ),
      'CHECKSUM_MISMATCH',
    );
    const delta = clone(second).provenance.delta;
    if (delta === null) throw new Error('Refusal fixture lost its delta');
    assert.equal(
      codeOf(
        withHistory([
          clone(base),
          clone(first),
          rehashed({
            ...contentOf(clone(second)),
            provenance: {
              ...clone(second).provenance,
              delta: {
                ...delta,
                changes: delta.changes.map((change) => ({
                  ...change,
                  previousValue: change.previousValue - 0.1,
                })),
              },
            },
          }),
        ]),
      ),
      'VALUE_MISMATCH',
    );
    assert.equal(
      codeOf(withHistory(Array.from({ length: HABIT_LIMITS.versions + 1 }, () => clone(base)))),
      'HISTORY_LIMIT',
    );
    assert.equal(
      codeOf(withHistory([base, { ...clone(first), depth: 3 }])),
      'MISSING_INTERMEDIATE_VERSION',
    );

    // A refused input never writes the store it was given.
    assert.equal(world.store.listVersions(HABIT_FIXTURE_PROFILE_ID).length, 4);
  });
});

test('123 evaluation is deterministic, immutable and reads without writing', async () => {
  await withWorld(async (world) => {
    await demonstrated(world, 3);
    const first = world.evaluate();
    const second = world.evaluate();
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.steps), true);
    assert.equal(Object.isFrozen(first.steps[0]), true);
    assert.equal(Object.isFrozen(first.trend), true);
    assert.equal(world.store.listVersions(HABIT_FIXTURE_PROFILE_ID).length, 4);
    assert.equal(world.activation.commands().length, 3);
  });
});

test('123 report transcript is deterministic and matches the saved evidence', async () => {
  const report = await runMissionHabitReport();
  assert.equal(report.summary.pass, true, JSON.stringify(report.checks.filter((c) => !c.pass)));
  assert.equal(report.summary.checks, report.checks.length);
  assert.equal(report.runs.length, 4);
  assert.equal(`${JSON.stringify(report, null, 2)}\n`, readFileSync(EVIDENCE, 'utf8'));
});

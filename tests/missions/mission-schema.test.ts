import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  MISSION_CATALOG_NAMESPACE,
  MISSION_LIMITS,
  MISSION_OBJECTIVE_EVENT_TYPES,
  MISSION_SCHEMA_VERSION,
  campaignMissionDefinitions,
  campaignOrder,
  createCampaignMissionCatalog,
  createMissionTracker,
  missionDefinitionIds,
  missionDifficulties,
  missionInstanceId,
  missionObjectiveKinds,
  missionRewardId,
  missionRewardKinds,
  missionTargetFor,
  parseMissionCatalog,
  parseMissionDefinition,
} from '../../src/missions';
import { createMissionTestCatalog, createMissionTestTracker, testMission } from './mission-fixture';
import { runMissionSchemaReport } from './mission-schema-report';

const SOURCE_DEFINITIONS = join(process.cwd(), 'src', 'missions', 'definitions.ts');
const SOURCE_LIFECYCLE = join(process.cwd(), 'src', 'missions', 'lifecycle.ts');
const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '116-mission-schema', 'report.json');

function throws(action: () => unknown, pattern: RegExp): boolean {
  try {
    action();
    return false;
  } catch (error) {
    return error instanceof Error && pattern.test(error.message);
  }
}

test('116 catalog carries eight campaign missions with stable ids and versions', () => {
  const catalog = createCampaignMissionCatalog();
  assert.equal(catalog.version, MISSION_SCHEMA_VERSION);
  assert.equal(catalog.namespace, MISSION_CATALOG_NAMESPACE);
  assert.equal(catalog.missions.length, 8);
  const ids = missionDefinitionIds(catalog);
  assert.deepEqual(ids, [...ids].sort());
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(campaignOrder(catalog), [
    'campaign-1-first-taxi',
    'campaign-2-first-demonstration',
    'campaign-3-following-distance',
    'campaign-4-stops-and-signals',
    'campaign-5-passenger',
    'campaign-6-city-copies-you',
    'campaign-7-changing-a-habit',
    'campaign-8-fleet-challenge',
  ]);
  for (const mission of catalog.missions) {
    assert.equal(mission.version, '1');
    assert(mission.objectives.length > 0);
    assert(mission.rewards.length > 0);
    assert.equal(typeof mission.title, 'string');
    assert.equal(mission.schemaVersion, 1);
    assert.equal(mission.units, 'SI');
    assert.deepEqual(
      mission.objectives.map((objective) => objective.objectiveId),
      [...new Set(mission.objectives.map((objective) => objective.objectiveId))],
    );
  }
  const comparison = catalog.missions.find(
    (mission) => mission.missionId === 'campaign-3-following-distance',
  )!;
  assert.equal(comparison.replay.profileSource, 'SNAPSHOT');
  assert.equal(comparison.replay.snapshotId, 'snapshot:campaign-comparison');
  assert.equal(comparison.replay.scenarioId, 'scenario:following-comparison');
  assert.deepEqual(comparison.replay.comparisonProfileIds, ['profile:prudent', 'profile:reckless']);
  const first = catalog.missions.find((mission) => mission.missionId === 'campaign-1-first-taxi')!;
  assert.equal(first.replay.profileSource, 'CURRENT');
  assert.equal(first.replay.snapshotId, null);
});

test('116 objectives name a real event family and difficulty never hides a threshold', () => {
  for (const kind of missionObjectiveKinds) {
    const types = MISSION_OBJECTIVE_EVENT_TYPES[kind];
    assert(types.length > 0);
    for (const type of types) assert.equal(typeof type, 'string');
  }
  for (const mission of campaignMissionDefinitions()) {
    for (const objective of mission.objectives) {
      const declared = Object.keys(objective.difficultyTargets);
      assert(declared.includes('NORMAL'));
      for (const key of declared) assert((missionDifficulties as readonly string[]).includes(key));
      assert.equal(missionTargetFor(objective, 'NORMAL'), objective.target);
      assert(missionTargetFor(objective, 'EASY') <= objective.target);
      assert(missionTargetFor(objective, 'HARD') >= objective.target);
    }
  }
  const fleet = campaignMissionDefinitions().find(
    (mission) => mission.missionId === 'campaign-8-fleet-challenge',
  )!;
  const objective = fleet.objectives[0]!;
  assert.deepEqual(fleet.objectives.length, 1);
  assert.equal(missionTargetFor(objective, 'EASY'), 2);
  assert.equal(missionTargetFor(objective, 'NORMAL'), 3);
  assert.equal(missionTargetFor(objective, 'HARD'), 4);
  assert.equal(fleet.incidentBudget, 0);
});

test('116 definitions reject missing fields, unknown kinds and impossible replays', () => {
  assert(
    throws(
      () => parseMissionDefinition({ ...testMission(), kind: 'UNKNOWN' }),
      /Unknown mission definition field/,
    ),
  );
  assert(
    throws(
      () => parseMissionDefinition({ ...testMission(), objectives: [] }),
      /objective capacity/,
    ),
  );
  assert(
    throws(
      () =>
        parseMissionDefinition({
          ...testMission(),
          objectives: [{ ...testMission().objectives[0]!, kind: 'MADE_UP' }],
        }),
      /enum/i,
    ),
  );
  assert(
    throws(
      () =>
        parseMissionDefinition({
          ...testMission(),
          replay: {
            profileSource: 'SNAPSHOT',
            snapshotId: null,
            scenarioId: null,
            comparisonProfileIds: [],
          },
        }),
      /snapshot id/,
    ),
  );
  assert(
    throws(
      () =>
        parseMissionDefinition({
          ...testMission(),
          rewards: [{ rewardId: 'xp', kind: 'XP', amount: 0, unlockId: null }],
        }),
      /positive amount/,
    ),
  );
  assert(
    throws(
      () =>
        parseMissionDefinition({
          ...testMission(),
          rewards: [{ rewardId: 'xp', kind: 'XP', amount: 10, unlockId: 'challenge:locked' }],
        }),
      /unlock identity/,
    ),
  );
  assert(
    throws(
      () =>
        parseMissionDefinition({
          ...testMission(),
          objectives: [
            {
              ...testMission().objectives[0]!,
              kind: 'FULL_STOPS',
              minDurationS: null,
            },
          ],
        }),
      /minimum stop duration/,
    ),
  );
});

test('116 catalog rejects duplicate ids, unknown prerequisites and cycles', () => {
  const base = testMission();
  assert(throws(() => createMissionTestCatalog([base, base]), /Duplicate mission id/));
  assert(
    throws(
      () => createMissionTestCatalog([testMission({ missionId: 'a', prerequisites: ['missing'] })]),
      /Unknown mission prerequisite/,
    ),
  );
  assert(
    throws(
      () =>
        createMissionTestCatalog([
          testMission({ missionId: 'a', prerequisites: ['b'] }),
          testMission({ missionId: 'b', prerequisites: ['a'] }),
        ]),
      /cycle/i,
    ),
  );
  assert(
    throws(
      () =>
        parseMissionCatalog({
          ...createMissionTestCatalog(),
          version: '999-other-schema',
        }),
      /schema version/,
    ),
  );
});

test('116 identities are stable 006 values inside the documented limits', () => {
  const catalog = createCampaignMissionCatalog();
  const mission = catalog.missions[0]!;
  const instanceId = missionInstanceId(catalog.namespace, mission.missionId, 1);
  assert(instanceId.startsWith('id-v1:'));
  assert(instanceId.length <= MISSION_LIMITS.instanceIdCodeUnits);
  assert.equal(instanceId, missionInstanceId(catalog.namespace, mission.missionId, 1));
  assert.notEqual(instanceId, missionInstanceId(catalog.namespace, mission.missionId, 2));
  const rewardId = missionRewardId(catalog.namespace, mission.missionId, mission.version, 'xp');
  assert(rewardId.length <= MISSION_LIMITS.rewardIdCodeUnits);
  assert.notEqual(rewardId, missionRewardId(catalog.namespace, mission.missionId, '2', 'xp'));
  assert.equal(MISSION_LIMITS.missions, 32);
  assert.equal(MISSION_LIMITS.objectivesPerMission, 8);
  assert.equal(missionDifficulties.length, 3);
  assert.equal(missionRewardKinds.length, 4);
});

test('116 the tracker rejects an invalid catalog instead of defaulting it', () => {
  assert(throws(() => createMissionTracker({}), /catalog/));
  assert(
    throws(() => createMissionTracker({ catalog: { schemaVersion: 1, units: 'SI' } }), /catalog/),
  );
  const tracker = createMissionTestTracker();
  assert.equal(tracker.catalog().missions.length, 8);
  assert.equal(tracker.definition('campaign-1-first-taxi')?.missionId, 'campaign-1-first-taxi');
  assert.equal(tracker.definition('missing'), undefined);
  tracker.dispose();
});

test('116 sources contain no wall clock, DOM, renderer or ambience', () => {
  for (const source of [SOURCE_DEFINITIONS, SOURCE_LIFECYCLE]) {
    const text = readFileSync(source, 'utf8');
    assert(
      !/\bDate\b|performance\.now|setTimeout|setInterval|requestAnimationFrame|Math\.random/.test(
        text,
      ),
    );
    assert(!/\bdocument\b|HTMLElement|HTMLCanvasElement|@babylonjs|@dimforge/.test(text));
  }
});

test('116 committed evidence report is the current mission transcript', () => {
  const report = runMissionSchemaReport();
  const saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as ReturnType<
    typeof runMissionSchemaReport
  >;
  assert.deepEqual(
    saved,
    JSON.parse(JSON.stringify(report)) as ReturnType<typeof runMissionSchemaReport>,
  );
  assert.equal(report.summary.pass, true);
});

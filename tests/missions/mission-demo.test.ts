import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  MISSION_DEMO_BASE_STOP_PROBABILITY,
  MISSION_DEMO_LEARNING_KEY,
  MISSION_DEMO_MISSION_ID,
  MISSION_DEMO_VERSION,
  createMissionDemoWorld,
  missionDemoExperimentExample,
  missionDemoLiveExample,
  missionDemoStatuses,
  runMissionDemonstration,
} from '../../src/app';
import type { MissionDemoWorld } from '../../src/app';
import { DEMO_SEGMENT_ID, buildDemoEvidence, createDemoQueue } from './mission-demo-fixture';
import { runMissionDemoReport } from './mission-demo-report';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '118-mission-demo', 'report.json');

function withWorld<T>(run: (world: MissionDemoWorld) => Promise<T> | T): Promise<T> {
  const queue = createDemoQueue('engine-118');
  const world = createMissionDemoWorld({ queue });
  return Promise.resolve(run(world)).finally(() => {
    world.dispose();
    queue.dispose();
  });
}

test('118 demonstration publishes a justified delta and observes the activation', async () => {
  await withWorld(async (world) => {
    const evidence = buildDemoEvidence();
    assert.equal(evidence.facts.samples, 300);
    assert.equal(evidence.facts.opportunities, 4);
    assert.equal(evidence.facts.eligibleWindows, 4);
    assert.equal(evidence.facts.artifactClass, 'PREFIX_ELIGIBLE');
    assert.equal(evidence.facts.ledgerStatus, 'READY');
    assert.equal(evidence.facts.distinctEpisodes, 4);
    assert.equal(evidence.facts.stopCandidateStatus, 'CANDIDATE');
    assert.equal(evidence.facts.stopCandidateValue, 1);
    assert.equal(evidence.facts.certainStopDenominator, 4);

    const result = await runMissionDemonstration(world, {
      segment: evidence.segment,
      opportunityIds: evidence.opportunityIds,
    });

    assert.equal(result.version, MISSION_DEMO_VERSION);
    assert.equal(result.missionId, MISSION_DEMO_MISSION_ID);
    assert.equal(result.status, 'DEMONSTRATED');
    assert.equal(result.reason, null);
    assert.equal(result.versionId, `${DEMO_SEGMENT_ID}~112`);
    assert.notEqual(result.delta, null);
    assert.equal(result.delta?.key, MISSION_DEMO_LEARNING_KEY);
    assert.equal(result.delta?.previous, MISSION_DEMO_BASE_STOP_PROBABILITY);
    assert.ok((result.delta?.next ?? 0) > MISSION_DEMO_BASE_STOP_PROBABILITY);
    assert.equal(result.delta?.next, 0.8);
    assert.equal(result.evidence.status, 'READY');
    assert.equal(result.evidence.distinctEpisodes, 4);
    assert.equal(result.evidence.effectiveEpisodes, 4);
    assert.equal(result.evidence.confidence, 'OBSERVED');
    assert.deepEqual(result.evidence.contexts, ['FREE_TRAFFIC']);
    assert.equal(result.evidence.opportunityIds.length, 4);
    assert.notEqual(result.activation, null);
    assert.equal(result.activation?.status, 'APPLIED');
    assert.equal(result.activation?.versionId, `${DEMO_SEGMENT_ID}~112`);
    assert.ok((result.activation?.appliedTick ?? 0) > 0);
    assert.equal(result.activation?.updatedVehicles, 64);
    assert.equal(result.requirements.justifiedDelta, true);
    assert.equal(result.requirements.observedActivation, true);
    assert.equal(result.requirements.satisfied, true);
    assert.equal(result.explanation?.status, 'CHANGED');
    assert.equal(result.composedVersionId, 'city-profile-118-base~103.1');
    assert.equal(result.explanation?.versionId, 'city-profile-118-base~103.1');
    assert.deepEqual(world.fleetVersions(), [`${DEMO_SEGMENT_ID}~112`]);
  });
});

test('118 demonstration without eligible evidence explains the no-change', async () => {
  await withWorld(async (world) => {
    const evidence = buildDemoEvidence({ stopCycles: 0, segmentId: 'segment-118-empty' });
    assert.equal(evidence.facts.opportunities, 0);
    assert.equal(evidence.facts.ledgerStatus, 'NO_EVIDENCE');
    assert.equal(evidence.facts.distinctEpisodes, 0);
    assert.equal(evidence.facts.stopCandidateStatus, 'REFUSED');
    assert.equal(evidence.facts.stopCandidateValue, null);
    assert.equal(evidence.facts.stopCandidateReason, 'ZERO_ELIGIBLE_STOP_DENOMINATOR');

    const result = await runMissionDemonstration(world, {
      segment: evidence.segment,
      opportunityIds: evidence.opportunityIds,
    });

    assert.equal(result.status, 'NO_CHANGE');
    assert.equal(result.versionId, null);
    assert.equal(result.delta, null);
    assert.equal(result.activation, null);
    assert.equal(result.requirements.justifiedDelta, false);
    assert.equal(result.requirements.observedActivation, false);
    assert.equal(result.requirements.satisfied, false);
    assert.equal(result.pipelineStatus, 'NO_CHANGE');
    assert.equal(result.explanation?.status, 'NO_CHANGE');
    assert.equal(result.explanation?.versionId, null);
    assert.equal(result.explanation?.noChangeReason, 'NO_NEW_EVIDENCE');
    assert.ok((result.explanation?.missingContexts.length ?? 0) > 0);
    assert.ok((result.explanation?.summary.length ?? 0) > 0);
    assert.equal(world.store.listVersions('city-profile-118').length, 1);
    assert.equal(world.activation.commands().length, 0);
  });
});

test('118 "see an example" is labelled and never presents a reference as a player effect', async () => {
  await withWorld(async (world) => {
    const evidence = buildDemoEvidence();
    const demonstrated = await runMissionDemonstration(world, {
      segment: evidence.segment,
      opportunityIds: evidence.opportunityIds,
    });
    assert.equal(demonstrated.example.kind, 'LIVE');
    assert.equal(demonstrated.example.isPlayerEffect, true);
    assert.equal(demonstrated.example.origin, '109-profile-store-v1');
    assert.ok(demonstrated.example.rows.some((row) => row.label === 'Checksum'));
    assert.ok(demonstrated.example.rows.some((row) => row.label === MISSION_DEMO_LEARNING_KEY));
  });

  // A world without any published version: the example is the labelled 105 reference.
  await withWorld(async (world) => {
    const empty = buildDemoEvidence({ stopCycles: 0, segmentId: 'segment-118-empty-2' });
    const reference = await runMissionDemonstration(world, {
      segment: empty.segment,
      opportunityIds: empty.opportunityIds,
    });
    assert.equal(reference.status, 'NO_CHANGE');
    assert.equal(reference.example.kind, 'EXPERIMENT');
    assert.equal(reference.example.isPlayerEffect, false);
    assert.equal(reference.example.origin, '105-inverse-learning-v1');
    assert.match(reference.example.description, /nu efectul jucătorului/);
    assert.ok(reference.example.rows.some((row) => row.value === 'PRUDENT'));
  });
});

test('118 experiment example exposes the 105 known profiles as reference values', () => {
  for (const profileId of ['PRUDENT', 'IMPULSIVE', 'RECKLESS', 'MIXED'] as const) {
    const example = missionDemoExperimentExample(profileId);
    assert.equal(example.kind, 'EXPERIMENT');
    assert.equal(example.isPlayerEffect, false);
    assert.ok(example.rows.length > 2);
  }
});

test('118 refuses a foreign mission and never fabricates a version', async () => {
  await withWorld(async (world) => {
    const evidence = buildDemoEvidence();
    await assert.rejects(
      () =>
        runMissionDemonstration(world, {
          segment: evidence.segment,
          missionId: 'campaign-3-following-distance',
        }),
      /different mission/,
    );
    assert.equal(world.store.listVersions('city-profile-118').length, 1);
    assert.equal(world.activation.commands().length, 0);
  });
});

test('118 live example refuses an unknown version and a foreign profile', async () => {
  await withWorld((world) => {
    assert.throws(
      () => missionDemoLiveExample(world.store, 'city-profile-118', 'missing-version'),
      /no published version/,
    );
    assert.throws(
      () =>
        missionDemoLiveExample(
          world.store,
          'other-profile',
          world.store.listVersions('city-profile-118')[0]?.versionId ?? '',
        ),
      /another profile/,
    );
  });
});

test('118 status vocabulary is closed', () => {
  assert.deepEqual([...missionDemoStatuses], ['DEMONSTRATED', 'NO_CHANGE', 'REJECTED']);
});

test('118 report transcript is deterministic and matches the saved evidence', async () => {
  const report = await runMissionDemoReport();
  assert.equal(report.summary.pass, true, JSON.stringify(report.checks.filter((c) => !c.pass)));
  assert.equal(report.summary.checks, report.checks.length);
  assert.equal(`${JSON.stringify(report, null, 2)}\n`, readFileSync(EVIDENCE, 'utf8'));
});

test('118 never learns from a MANUAL or an ineligible segment', async () => {
  await withWorld(async (world) => {
    const evidence = buildDemoEvidence();
    const manual = await runMissionDemonstration(world, {
      segment: { ...evidence.segment, segmentId: 'segment-118-manual', mode: 'MANUAL' },
      opportunityIds: evidence.opportunityIds,
    });
    assert.equal(manual.status, 'REJECTED');
    assert.equal(manual.reason, 'MANUAL_SEGMENT_NOT_LEARNABLE');
    assert.equal(manual.pipelineStatus, 'SKIPPED_MANUAL');
    assert.equal(manual.versionId, null);
    assert.equal(manual.delta, null);
    assert.equal(manual.activation, null);
    assert.equal(manual.explanation, null);
    assert.equal(manual.requirements.satisfied, false);
    assert.equal(manual.example.kind, 'EXPERIMENT');
    assert.equal(manual.example.isPlayerEffect, false);

    const ineligible = await runMissionDemonstration(world, {
      segment: { ...evidence.segment, segmentId: 'segment-118-ineligible', eligible: false },
      opportunityIds: evidence.opportunityIds,
    });
    assert.equal(ineligible.status, 'REJECTED');
    assert.equal(ineligible.reason, 'SEGMENT_INELIGIBLE');
    assert.equal(ineligible.pipelineStatus, 'SKIPPED_INELIGIBLE');
    assert.equal(ineligible.versionId, null);
    assert.equal(ineligible.activation, null);
    assert.equal(world.store.listVersions('city-profile-118').length, 1);
    assert.equal(world.activation.commands().length, 0);
  });
});

test('118 refuses to declare a demonstration when the 110 activation was not observed', async () => {
  await withWorld(async (world) => {
    // A pending 110 command blocks the publication of the demonstration version.
    const blocking = world.activation.publish({
      profileId: 'city-profile-118',
      versionId: 'city-profile-118-blocked',
      engineVersion: 'engine-118',
      publishedAtTick: 0,
      activateAtTick: 5,
      reason: 'blocking activation',
      origin: 'MANUAL_TUNING',
      idempotencyKey: '118-blocking',
    });
    assert.equal(blocking.status, 'ACCEPTED');

    const evidence = buildDemoEvidence();
    const result = await runMissionDemonstration(world, {
      segment: evidence.segment,
      opportunityIds: evidence.opportunityIds,
    });
    assert.equal(result.status, 'REJECTED');
    assert.equal(result.reason, 'ACTIVATION_NOT_OBSERVED');
    assert.equal(result.requirements.justifiedDelta, true);
    assert.equal(result.requirements.observedActivation, false);
    assert.equal(result.requirements.satisfied, false);
    assert.equal(result.activation, null);
    assert.equal(result.versionId, 'segment-118-demo~112');
    assert.equal(result.example.kind, 'LIVE');
  });
});

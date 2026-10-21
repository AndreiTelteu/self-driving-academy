import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  runVerticalSlice,
  VERTICAL_SLICE_BASE_VERSION,
  VERTICAL_SLICE_LIMITS,
  VERTICAL_SLICE_PROFILE_ID,
  VERTICAL_SLICE_SEGMENT_IDS,
  VERTICAL_SLICE_VERSION,
  verticalSliceScenarios,
} from '../../src/app';
import type { VerticalSliceReport, VerticalSliceScenarioReport } from '../../src/app';
import { FLEET_STATE_FIELDS, FLEET_VEHICLE_FIELDS } from '../../src/fleet';
import {
  createVerticalSliceServices,
  runVerticalSliceEvidenceReport,
  verticalSliceEvidenceMarkdown,
  verticalSliceEvidenceRows,
} from './vertical-slice-report';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '115-vertical-slice', 'report.json');
const EVIDENCE_MARKDOWN = join(
  process.cwd(),
  'Docs',
  'Evidence',
  '115-vertical-slice',
  'report.md',
);

let cached: VerticalSliceReport | null = null;

async function scenarioReport(): Promise<VerticalSliceReport> {
  cached ??= await runVerticalSlice(createVerticalSliceServices());
  return cached;
}

function scenario(report: VerticalSliceReport, id: string): VerticalSliceScenarioReport {
  const found = report.scenarios.find((entry) => entry.scenario === id);
  assert.ok(found, `missing scenario ${id}`);
  return found;
}

test('115 the contract is closed and both deterministic profiles are present', async () => {
  const report = await scenarioReport();
  assert.equal(VERTICAL_SLICE_VERSION, '115-vertical-slice-v1');
  assert.equal(report.version, '115-vertical-slice-v1');
  assert.deepEqual([...verticalSliceScenarios], ['PRUDENT', 'RECKLESS']);
  assert.deepEqual(
    report.scenarios.map((entry) => entry.scenario),
    ['PRUDENT', 'RECKLESS'],
  );
  assert.equal(report.playtest.kind, 'DETERMINISTIC_SIMULATED');
  assert.equal(report.playtest.humanPlaytest, false);
  assert.equal(report.playtest.browserCapture, false);
  assert.equal(report.contract.learningKey, 'stop_full_probability');
  assert.equal(report.contract.baseStopProbability, 0.6);
  assert.equal(report.contract.tickHz, 60);
  assert.deepEqual([...report.contract.stateFields], [...FLEET_STATE_FIELDS]);
  assert.deepEqual([...report.contract.vehicleFields], [...FLEET_VEHICLE_FIELDS]);
  assert.equal(report.summary.pass, true);
  assert.ok(report.summary.checks >= 25);
});

test('115 the prudent scenario creates exactly one version shared by both categories', async () => {
  const report = await scenarioReport();
  const prudent = scenario(report, 'PRUDENT');
  assert.equal(prudent.status, 'PASS');
  assert.equal(prudent.versionChain.length, 2);
  assert.equal(prudent.versionChain[0]!.versionId, VERTICAL_SLICE_BASE_VERSION);
  const learned = prudent.versionChain[1]!;
  assert.equal(learned.versionId, `${VERTICAL_SLICE_SEGMENT_IDS.PRUDENT}~112`);
  assert.equal(learned.parentVersionId, VERTICAL_SLICE_BASE_VERSION);
  assert.equal(learned.appliedTick, 7);
  assert.deepEqual([...prudent.fleet.taxiVersions], [learned.versionId]);
  assert.deepEqual([...prudent.fleet.civilianVersions], [learned.versionId]);
  assert.equal(prudent.fleet.bothCategoriesUpdated, true);
  assert.deepEqual(Object.keys(prudent.fleet.after), [learned.versionId]);
  assert.equal(
    prudent.fleet.after[learned.versionId],
    VERTICAL_SLICE_LIMITS.taxis + VERTICAL_SLICE_LIMITS.civilians,
  );
  assert.equal(prudent.fleet.updatedVehicles, 40);
  assert.deepEqual(Object.keys(prudent.fleet.taxiAfter), [learned.versionId]);
  assert.deepEqual(Object.keys(prudent.fleet.civilianAfter), [learned.versionId]);
});

test('115 the prudent style is clean with real opportunities on both categories', async () => {
  const report = await scenarioReport();
  const prudent = scenario(report, 'PRUDENT');
  assert.equal(prudent.style.baseValue, 0.6);
  assert.equal(prudent.style.appliedValue, 0.84);
  assert.equal(prudent.style.direction, 'HIGHER');
  assert.deepEqual([...prudent.style.changedKeys], ['stop_full_probability']);
  assert.equal(
    prudent.behaviour.eligibleOpportunities,
    VERTICAL_SLICE_LIMITS.stopOpportunities + VERTICAL_SLICE_LIMITS.redOpportunities,
  );
  assert.equal(prudent.behaviour.successes, prudent.behaviour.eligibleOpportunities);
  assert.equal(prudent.behaviour.violations, 0);
  assert.equal(prudent.behaviour.complianceRate, 100);
  assert.equal(prudent.behaviour.byKind[0]!.kind, 'STOP');
  assert.equal(prudent.behaviour.byKind[0]!.violations, 0);
  assert.equal(prudent.behaviour.byKind[1]!.violations, 0);
  assert.equal(prudent.behaviour.taxi.violations, 0);
  assert.equal(prudent.behaviour.civilian.violations, 0);
  assert.equal(prudent.behaviour.taxi.opportunities + prudent.behaviour.civilian.opportunities, 14);
  assert.equal(prudent.behaviour.mistakesVisible, false);
  assert.ok(prudent.behaviour.speedSamples > 0);
});

test('115 the prudent explanation carries evidence, contexts and explicit unobserved contexts', async () => {
  const report = await scenarioReport();
  const prudent = scenario(report, 'PRUDENT');
  assert.equal(prudent.explanation.status, 'CHANGED');
  assert.equal(prudent.explanation.versionId, `${VERTICAL_SLICE_BASE_VERSION}~103.1`);
  assert.equal(prudent.explanation.composedVersionId, prudent.explanation.versionId);
  assert.equal(prudent.explanation.evidenceTotal, VERTICAL_SLICE_LIMITS.episodesPerSegment);
  assert.deepEqual(prudent.explanation.evidenceCounts, {
    stop_full_probability: VERTICAL_SLICE_LIMITS.episodesPerSegment,
  });
  assert.deepEqual([...prudent.explanation.observedContexts], ['FREE_TRAFFIC']);
  assert.deepEqual([...prudent.explanation.declaredContexts], ['FREE_TRAFFIC']);
  assert.deepEqual(
    prudent.explanation.unobservedContexts.map((entry) => entry.context),
    ['GREEN', 'YIELD', 'LANE_CHANGE'],
  );
  assert.equal(
    prudent.explanation.unobservedContexts.every(
      (entry) => entry.reason === 'NOT_EXERCISED_BY_PLAN',
    ),
    true,
  );
  for (const change of prudent.explanation.changes) {
    assert.ok(change.evidenceCount > 0);
    assert.ok(change.contexts.length > 0);
    assert.equal(change.delta, change.next - change.previous);
    assert.notEqual(change.confidence, 'UNOBSERVED');
  }
});

test('115 the reckless scenario creates one version used by both categories', async () => {
  const report = await scenarioReport();
  const reckless = scenario(report, 'RECKLESS');
  assert.equal(reckless.status, 'PASS');
  assert.equal(reckless.versionChain.length, 2);
  const learned = reckless.versionChain[1]!;
  assert.equal(learned.versionId, `${VERTICAL_SLICE_SEGMENT_IDS.RECKLESS}~112`);
  assert.equal(learned.parentVersionId, VERTICAL_SLICE_BASE_VERSION);
  assert.deepEqual([...reckless.fleet.taxiVersions], [learned.versionId]);
  assert.deepEqual([...reckless.fleet.civilianVersions], [learned.versionId]);
  assert.equal(reckless.fleet.bothCategoriesUpdated, true);
  assert.equal(reckless.style.candidateValue, 0.2);
  assert.equal(reckless.style.appliedValue, 0.36);
  assert.equal(reckless.style.direction, 'LOWER');
});

test('115 the reckless mistakes are visible on a taxi and a civilian and in 138', async () => {
  const report = await scenarioReport();
  const reckless = scenario(report, 'RECKLESS');
  assert.ok(reckless.behaviour.violations > 0);
  assert.ok(reckless.behaviour.byKind[0]!.violations > 0);
  assert.ok(reckless.behaviour.taxi.violations > 0);
  assert.ok(reckless.behaviour.civilian.violations > 0);
  assert.equal(reckless.behaviour.mistakesVisible, true);
  assert.ok(reckless.behaviour.complianceRate !== null && reckless.behaviour.complianceRate < 100);
  assert.equal(
    reckless.behaviour.successes + reckless.behaviour.violations,
    reckless.behaviour.eligibleOpportunities,
  );
  assert.equal(
    reckless.behaviour.taxi.violations + reckless.behaviour.civilian.violations,
    reckless.behaviour.violations,
  );
  assert.equal(reckless.explanation.changes[0]!.next, reckless.style.appliedValue);
  assert.ok(reckless.explanation.changes[0]!.delta < 0);
  assert.ok(reckless.explanation.changes[0]!.evidenceCount > 0);
});

test('115 MANUAL records telemetry but creates no job, version, activation or style change', async () => {
  const report = await scenarioReport();
  for (const entry of report.scenarios) {
    const manual = entry.manual;
    assert.equal(manual.pipelineStatus, 'SKIPPED_MANUAL');
    assert.equal(manual.reason, 'MANUAL_SEGMENT_NOT_LEARNABLE');
    assert.equal(manual.jobSubmitted, false);
    assert.equal(manual.versionId, null);
    assert.equal(manual.activationPublished, false);
    assert.equal(manual.jobsBefore, manual.jobsAfter);
    assert.equal(manual.versionsBefore, manual.versionsAfter);
    assert.equal(manual.commandsBefore, manual.commandsAfter);
    assert.equal(manual.activeVersionBefore, manual.activeVersionAfter);
    assert.equal(manual.valuesDigestBefore, manual.valuesDigestAfter);
    assert.equal(manual.valuesEqual, true);
    assert.deepEqual(manual.styleKeysBefore, manual.styleKeysAfter);
    assert.ok(manual.telemetry.opportunities > 0);
    assert.ok(manual.telemetry.speedSamples > 0);
    assert.equal(manual.telemetryMatchesLearning, true);
    assert.equal(manual.noChange, true);
    assert.equal(manual.binding.pass, true);
    assert.equal(manual.binding.valuesEqualBeforeAfter, true);
  }
});

test('115 the MANUAL explanation is NO_CHANGE with no version and no fabricated evidence', async () => {
  const report = await scenarioReport();
  for (const entry of report.scenarios) {
    const explanation = entry.manual.explanation;
    assert.equal(explanation.status, 'NO_CHANGE');
    assert.equal(explanation.versionId, null);
    assert.equal(explanation.source, '112_SKIPPED_MANUAL');
    assert.equal(explanation.jobSubmitted, false);
    assert.deepEqual([...explanation.changes], []);
    assert.deepEqual({ ...explanation.evidenceCounts }, {});
    assert.ok(explanation.unobservedContexts.length > 0);
    assert.equal(explanation.reason, 'MANUAL_SEGMENT_NOT_LEARNABLE');
  }
});

test('115 a taxi and a civilian UI binding report the same version and values', async () => {
  const report = await scenarioReport();
  for (const entry of report.scenarios) {
    const learned = entry.versionChain.at(-1)!.versionId;
    assert.equal(entry.binding.taxi.pass, true);
    assert.equal(entry.binding.civilian.pass, true);
    assert.equal(entry.binding.taxi.panelVersion, learned);
    assert.equal(entry.binding.civilian.panelVersion, learned);
    assert.equal(entry.binding.taxi.historyVersion, learned);
    assert.equal(entry.binding.civilian.historyVersion, learned);
    assert.equal(entry.binding.taxi.activeVersion, learned);
    assert.equal(entry.binding.civilian.activeVersion, learned);
    assert.equal(entry.binding.taxi.appliedVersion, learned);
    assert.equal(entry.binding.civilian.appliedVersion, learned);
    assert.deepEqual({ ...entry.binding.taxi.values }, { ...entry.binding.civilian.values });
    assert.equal(entry.binding.taxi.values.stop_full_probability, entry.style.appliedValue);
    assert.equal(entry.binding.sameVersion, true);
    assert.equal(entry.binding.sameValues, true);
    assert.deepEqual([...entry.binding.taxi.mismatches], []);
    assert.deepEqual([...entry.binding.civilian.mismatches], []);
    assert.deepEqual([...entry.binding.taxi.changedKeys], ['stop_full_probability']);
  }
});

test('115 no hidden class override exists and the explanation version split is explicit', async () => {
  const report = await scenarioReport();
  for (const entry of report.scenarios) {
    assert.deepEqual([...entry.binding.hiddenOverrides], []);
    assert.equal(entry.binding.explanationBinding.attempted, true);
    assert.equal(entry.binding.explanationBinding.attached, false);
    assert.deepEqual([...entry.binding.explanationBinding.mismatches], ['REASON_CODE_MISMATCH']);
    assert.equal(
      entry.binding.explanationBinding.reason,
      'COMPOSITION_AND_STORE_VERSION_IDS_DIFFER',
    );
    assert.notEqual(entry.explanation.versionId, entry.versionChain.at(-1)!.versionId);
    assert.equal(entry.learner.driverKind, 'CIVILIAN');
    assert.equal(entry.learner.mode, 'LEARNING');
    assert.equal(entry.learner.routePreserved, true);
  }
});

test('115 the scenarios are isolated and do not contaminate each other', async () => {
  const report = await scenarioReport();
  const prudent = scenario(report, 'PRUDENT');
  const reckless = scenario(report, 'RECKLESS');
  assert.notEqual(prudent.explanation.segmentId, reckless.explanation.segmentId);
  assert.notEqual(prudent.versionChain.at(-1)!.versionId, reckless.versionChain.at(-1)!.versionId);
  assert.equal(prudent.fleet.before[VERTICAL_SLICE_BASE_VERSION], 40);
  assert.equal(reckless.fleet.before[VERTICAL_SLICE_BASE_VERSION], 40);
  assert.deepEqual(Object.keys(prudent.fleet.after), [prudent.versionChain.at(-1)!.versionId]);
  assert.deepEqual(Object.keys(reckless.fleet.after), [reckless.versionChain.at(-1)!.versionId]);
  assert.equal(prudent.learner.vehicleId, reckless.learner.vehicleId);
  assert.equal(prudent.behaviour.taxi.opportunities, 7);
  assert.equal(prudent.behaviour.civilian.opportunities, 7);
  assert.equal(report.versionChain.PRUDENT.length, 2);
  assert.equal(report.versionChain.RECKLESS.length, 2);
});

test('115 the report is deterministic across independent runs', async () => {
  const first = await runVerticalSlice(createVerticalSliceServices());
  const second = await runVerticalSlice(createVerticalSliceServices());
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(second), JSON.stringify(first));
});

test('115 every recorded check passes and the summary counts are exact', async () => {
  const report = await scenarioReport();
  assert.equal(
    report.checks.every((entry) => entry.pass),
    true,
    report.checks
      .filter((entry) => !entry.pass)
      .map((entry) => `${entry.name}: ${String(entry.actual)}`)
      .join(', '),
  );
  assert.equal(report.summary.checks, report.checks.length);
  assert.equal(report.summary.passed, report.checks.length);
  assert.equal(report.summary.scenarios, 2);
  assert.equal(report.manualNoChange, true);
  assert.equal(report.bothCategoriesUpdated, true);
  assert.equal(report.mistakesVisible, true);
  assert.equal(report.evidenceCounts['PRUDENT:stop_full_probability'], 16);
  assert.equal(report.evidenceCounts['RECKLESS:stop_full_probability'], 16);
  assert.deepEqual([...report.unobservedContexts], ['GREEN', 'YIELD', 'LANE_CHANGE']);
});

test('115 the report is deeply frozen', async () => {
  const report = await scenarioReport();
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.scenarios), true);
  assert.equal(Object.isFrozen(report.scenarios[0]), true);
  assert.equal(Object.isFrozen(report.scenarios[0]!.fleet.after), true);
  assert.equal(Object.isFrozen(report.scenarios[0]!.explanation.changes), true);
  assert.equal(Object.isFrozen(report.scenarios[0]!.binding.taxi.values), true);
  assert.throws(() => {
    (report as { manualNoChange: boolean }).manualNoChange = false;
  }, TypeError);
});

test('115 the evidence driver has seven rows and at least 25 passing checks', async () => {
  const evidence = await runVerticalSliceEvidenceReport();
  assert.deepEqual(
    evidence.rows.map((entry) => entry.row),
    [...verticalSliceEvidenceRows],
  );
  assert.equal(evidence.rows.length, 7);
  assert.ok(evidence.checks.length >= 25);
  assert.equal(evidence.summary.rows, 7);
  assert.equal(evidence.summary.checks, evidence.checks.length);
  assert.equal(evidence.summary.passed, evidence.checks.length);
  assert.equal(evidence.summary.pass, true);
  assert.equal(evidence.determinism.runs, 2);
  assert.equal(evidence.determinism.equal, true);
  assert.equal(evidence.playtest.kind, 'DETERMINISTIC_SIMULATED');
  assert.equal(
    evidence.rows.every((entry) => entry.status === 'PASS'),
    true,
  );
});

test('115 the committed evidence matches the generated report and Markdown', async () => {
  const evidence = await runVerticalSliceEvidenceReport();
  const json = `${JSON.stringify(evidence, null, 2)}\n`;
  assert.equal(readFileSync(EVIDENCE, 'utf8'), json);
  assert.equal(readFileSync(EVIDENCE_MARKDOWN, 'utf8'), verticalSliceEvidenceMarkdown(evidence));
  assert.equal(evidence.report.contract.profileId, VERTICAL_SLICE_PROFILE_ID);
  assert.equal(evidence.report.contract.seed, 115_000);
});

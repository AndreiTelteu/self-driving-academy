import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  CITY_STYLE_BASE_VERSION,
  CITY_STYLE_LIMITS,
  CITY_STYLE_PROFILE_ID,
  CITY_STYLE_VERSION,
  cityStyleScenarioIds,
  runCityStyleScenario,
} from '../../src/app';
import type { CityStylePhaseReport, CityStyleScenarioReport } from '../../src/app';
import { FLEET_STATE_FIELDS, FLEET_VEHICLE_FIELDS } from '../../src/fleet';
import {
  cityStylePropagationReportMarkdown,
  createCityStyleServices,
  runCityStylePropagationReport,
} from './city-style-propagation-report';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '208-city-style', 'report.json');
const EVIDENCE_MARKDOWN = join(process.cwd(), 'Docs', 'Evidence', '208-city-style', 'report.md');

let cached: CityStyleScenarioReport | null = null;

async function scenario(): Promise<CityStyleScenarioReport> {
  cached ??= await runCityStyleScenario(createCityStyleServices());
  return cached;
}

function phase(report: CityStyleScenarioReport, id: string): CityStylePhaseReport {
  const found = report.phases.find((entry) => entry.phase === id);
  assert.ok(found, `missing phase ${id}`);
  return found;
}

test('208 the contract is closed and the scenarios are the seven documented ones', async () => {
  const report = await scenario();
  assert.equal(CITY_STYLE_VERSION, '208-city-style-v1');
  assert.equal(report.version, '208-city-style-v1');
  assert.deepEqual(
    [...cityStyleScenarioIds],
    [
      'MIXED_ACTIVATION',
      'HIDDEN_VEHICLES',
      'LATER_SPAWN',
      'CIVIL_MANUAL',
      'CIVIL_RELEASE',
      'CIVIL_LEARNING',
      'ROUTE_PRESERVATION',
    ],
  );
  assert.deepEqual(
    report.phases.map((entry) => entry.phase),
    [...cityStyleScenarioIds],
  );
  assert.deepEqual([...report.contract.stateFields], [...FLEET_STATE_FIELDS]);
  assert.deepEqual([...report.contract.vehicleFields], [...FLEET_VEHICLE_FIELDS]);
  assert.equal(report.contract.stateFields.includes('controlMode'), true);
  assert.equal(report.contract.stateFields.includes('appliedProfileVersion'), true);
  assert.equal(report.contract.stateFields.length, 3);
  assert.equal(report.contract.limits.vehicles, CITY_STYLE_LIMITS.vehicles);
  assert.equal(report.contract.tickHz, 60);
  assert.equal(report.summary.phases, 7);
  assert.ok(report.summary.checks >= 25);
  assert.equal(report.summary.pass, true);
  assert.equal(report.summary.passed, report.summary.checks);
});

test('208 before the common tick nothing changes and the early apply writes nothing', async () => {
  const report = await scenario();
  const mixed = phase(report, 'MIXED_ACTIVATION');
  assert.deepEqual(Object.keys(mixed.before), [CITY_STYLE_BASE_VERSION]);
  assert.equal(mixed.before[CITY_STYLE_BASE_VERSION], 40);
  assert.equal(mixed.details.closure, 'COMPOSED');
  const names = [
    'mixed-before-tick-status',
    'mixed-before-tick-writes',
    'mixed-before-tick-versions',
  ];
  for (const name of names) {
    const entry = report.checks.find((check) => check.name === name);
    assert.ok(entry, `missing check ${name}`);
    assert.equal(entry.pass, true, `${name}: ${entry.actual} vs ${entry.expected}`);
  }
});

test('208 after the tick every taxi and civilian reports the same version and tick', async () => {
  const report = await scenario();
  const mixed = phase(report, 'MIXED_ACTIVATION');
  assert.equal(mixed.status, 'PASS');
  assert.equal(mixed.activationStatus, 'APPLIED');
  assert.equal(mixed.appliedTick, mixed.activationTick);
  assert.equal(Object.keys(mixed.after).length, 1);
  assert.equal(Object.keys(mixed.after)[0], mixed.commonVersionAfter);
  assert.equal(
    Object.values(mixed.after).reduce((total, count) => total + count, 0),
    40,
  );
  assert.equal(mixed.changedIds.length, 40);
  assert.equal(mixed.commonVersionAfter, 'segment-208-fleet~112');
});

test('208 the fleet report and the vehicle list are unchanged by the activation', async () => {
  const report = await scenario();
  for (const id of ['MIXED_ACTIVATION', 'ROUTE_PRESERVATION']) {
    const entry = phase(report, id);
    assert.equal(entry.status, 'PASS');
    const names =
      id === 'MIXED_ACTIVATION'
        ? ['mixed-fleet-report', 'mixed-vehicle-list']
        : ['preserve-vehicles', 'preserve-fleet-report'];
    for (const name of names) {
      const check = report.checks.find((candidate) => candidate.name === name);
      assert.ok(check, `missing check ${name}`);
      assert.equal(check.pass, true);
    }
  }
});

test('208 the activation write surface is exactly version and tick', async () => {
  const report = await scenario();
  for (const entry of report.phases) {
    for (const write of entry.writes) {
      assert.equal(write.method, 'updateState');
      assert.deepEqual([...write.fields].sort(), ['appliedProfileVersion', 'tick']);
    }
  }
  const mixed = phase(report, 'MIXED_ACTIVATION');
  assert.equal(mixed.writes.length, 40);
  assert.equal(new Set(mixed.writes.map((write) => write.vehicleId)).size, 40);
});

test('208 hidden, selected and player-driven vehicles are in the same plan with their modes kept', async () => {
  const report = await scenario();
  const hidden = phase(report, 'HIDDEN_VEHICLES');
  assert.equal(hidden.status, 'PASS');
  assert.deepEqual(Object.keys(hidden.after), [hidden.commonVersionAfter]);
  assert.equal(hidden.changedIds.length, 40);
  assert.equal(hidden.controlModesBefore.MANUAL, hidden.controlModesAfter.MANUAL);
  assert.equal(hidden.controlModesBefore.LEARNING, hidden.controlModesAfter.LEARNING);
  assert.ok((hidden.controlModesAfter.MANUAL ?? 0) > 0);
  assert.ok((hidden.controlModesAfter.LEARNING ?? 0) > 0);
  assert.equal(
    hidden.controlModesAfter.AUTO,
    40 - (hidden.controlModesAfter.MANUAL ?? 0) - (hidden.controlModesAfter.LEARNING ?? 0),
  );
  assert.equal((FLEET_VEHICLE_FIELDS as readonly string[]).includes('selected'), false);
  assert.equal((FLEET_STATE_FIELDS as readonly string[]).includes('visible'), false);
});

test('208 a vehicle created before the tick gets the pending target for both kinds', async () => {
  const report = await scenario();
  const later = phase(report, 'LATER_SPAWN');
  assert.equal(later.status, 'PASS');
  assert.equal(later.details.pendingVersion, later.commonVersionAfter);
  assert.equal(later.details.pendingCivilVersion, later.commonVersionAfter);
  assert.equal(report.laterSpawnVersion, later.commonVersionAfter);
  assert.notEqual(report.laterSpawnVersion, CITY_STYLE_BASE_VERSION);
});

test('208 a vehicle created after the tick gets the active version and no second command', async () => {
  const report = await scenario();
  const later = phase(report, 'LATER_SPAWN');
  assert.equal(later.details.appliedVersion, later.commonVersionAfter);
  assert.equal(later.details.appliedCivilVersion, later.commonVersionAfter);
  assert.equal(later.details.grownPopulation, 44);
  assert.equal(Object.keys(later.after).length, 1);
  assert.equal(
    Object.values(later.after).reduce((total, count) => total + count, 0),
    44,
  );
  const check = report.checks.find((entry) => entry.name === 'later-no-extra-command');
  assert.equal(check?.pass, true);
});

test('208 a civil MANUAL segment produces no job, no version and no activation', async () => {
  const report = await scenario();
  const manual = phase(report, 'CIVIL_MANUAL');
  assert.equal(manual.status, 'PASS');
  assert.equal(manual.scenarioStatus, 'SKIPPED_MANUAL');
  assert.equal(manual.manualVersionChanges, 0);
  assert.equal(report.manualVersionChanges, 0);
  assert.equal(manual.details.manualStatus, 'SKIPPED_MANUAL');
  assert.equal(manual.details.manualActivations, 0);
  for (const name of [
    'manual-segment-status',
    'manual-segment-reason',
    'manual-segment-job',
    'manual-segment-version',
    'manual-segment-activation',
    'manual-store-versions',
    'manual-activations',
  ]) {
    const check = report.checks.find((entry) => entry.name === name);
    assert.ok(check, `missing check ${name}`);
    assert.equal(check.pass, true, `${name}: ${check.actual} vs ${check.expected}`);
  }
});

test('208 a MANUAL civilian records the common version and keeps its route', async () => {
  const report = await scenario();
  const manual = phase(report, 'CIVIL_MANUAL');
  assert.equal(manual.preservedRoutes, 1);
  assert.equal(manual.routeFingerprintsPreserved, true);
  assert.equal(manual.details.speedMps, 0);
  for (const name of ['manual-mode-kept', 'manual-route-kept', 'manual-active-version']) {
    const check = report.checks.find((entry) => entry.name === name);
    assert.equal(check?.pass, true, name);
  }
});

test('208 releasing a MANUAL civilian returns it to AUTO on the active version with the same route', async () => {
  const report = await scenario();
  const release = phase(report, 'CIVIL_RELEASE');
  assert.equal(release.status, 'PASS');
  assert.equal(release.preservedRoutes, 1);
  assert.equal(release.routeFingerprintsPreserved, true);
  assert.ok(Number(release.details.distanceAfterM) > Number(release.details.distanceBeforeM));
  for (const name of [
    'release-mode',
    'release-registry-mode',
    'release-version',
    'release-style-version',
    'release-route',
    'release-after-step-route',
    'release-moves-again',
  ]) {
    const check = report.checks.find((entry) => entry.name === name);
    assert.equal(check?.pass, true, name);
  }
});

test('208 an eligible civil LEARNING segment creates one version shared by both categories', async () => {
  const report = await scenario();
  const learning = phase(report, 'CIVIL_LEARNING');
  assert.equal(learning.status, 'PASS');
  assert.equal(learning.learningVersion, 'segment-208-civilian~112');
  assert.equal(report.learningVersion, learning.learningVersion);
  assert.equal(report.crossCategoryUpdated, true);
  assert.equal(learning.crossCategoryUpdated, true);
  assert.equal(learning.details.versionsCreated, 1);
  assert.equal(learning.details.taxiVersions, learning.learningVersion);
  assert.equal(learning.details.civilianVersions, learning.learningVersion);
  assert.equal(Object.keys(learning.after).length, 1);
});

test('208 a LEARNING civilian keeps its mode and route while both categories adopt the style', async () => {
  const report = await scenario();
  const learning = phase(report, 'CIVIL_LEARNING');
  assert.equal(learning.routeFingerprintsPreserved, true);
  assert.equal(learning.preservedRoutes, 1);
  assert.equal(learning.controlModesAfter.LEARNING, learning.controlModesBefore.LEARNING);
  for (const name of ['learning-mode-kept', 'learning-route-kept', 'learning-one-activation']) {
    const check = report.checks.find((entry) => entry.name === name);
    assert.equal(check?.pass, true, name);
  }
});

test('208 civilian routes, mechanical classes and limits survive the style change exactly', async () => {
  const report = await scenario();
  const preserve = phase(report, 'ROUTE_PRESERVATION');
  assert.equal(preserve.status, 'PASS');
  assert.equal(preserve.details.civilians, 20);
  assert.equal(preserve.details.preservedRoutes, 20);
  assert.equal(preserve.preservedRoutes, 20);
  assert.equal(preserve.routeFingerprintsPreserved, true);
  assert.equal(preserve.details.classes, 2);
  for (const name of [
    'preserve-routes',
    'preserve-classes',
    'preserve-limits',
    'preserve-only-version-and-tick',
  ]) {
    const check = report.checks.find((entry) => entry.name === name);
    assert.ok(check, `missing check ${name}`);
    assert.equal(check.pass, true, name);
  }
});

test('208 no hidden fixed profile or class-specific override appears', async () => {
  const report = await scenario();
  assert.deepEqual([...report.hiddenOverrides], []);
  for (const entry of report.phases) assert.deepEqual([...entry.hiddenOverrides], []);
  const preserve = phase(report, 'ROUTE_PRESERVATION');
  const common = preserve.commonVersionAfter;
  assert.equal(preserve.after[common], 40);
  const check = report.checks.find((entry) => entry.name === 'preserve-no-hidden-override');
  assert.equal(check?.pass, true);
  assert.equal(report.contract.profileId, CITY_STYLE_PROFILE_ID);
  assert.equal(phase(report, 'LATER_SPAWN').details.appliedCivilVersion, common);
});

test('208 the store and the fleet are only mutated through the real ports', async () => {
  const report = await scenario();
  const manual = phase(report, 'CIVIL_MANUAL');
  const learning = phase(report, 'CIVIL_LEARNING');
  assert.equal(manual.details.manualActivations, 0);
  assert.equal(learning.details.versionsCreated, 1);
  assert.equal(
    report.checks.every((entry) => entry.pass),
    true,
  );
  const writes = new Set(
    report.phases.flatMap((entry) => entry.writes.flatMap((write) => [...write.fields])),
  );
  assert.deepEqual([...writes].sort(), ['appliedProfileVersion', 'tick']);
});

test('208 the report is deterministic and matches the committed evidence', async () => {
  const first = await scenario();
  const second = await runCityStylePropagationReport();
  assert.deepEqual(second, first);
  const saved = readFileSync(EVIDENCE, 'utf8');
  assert.equal(`${JSON.stringify(first, null, 2)}\n`, saved);
  const savedMarkdown = readFileSync(EVIDENCE_MARKDOWN, 'utf8');
  assert.equal(cityStylePropagationReportMarkdown(first), savedMarkdown);
});

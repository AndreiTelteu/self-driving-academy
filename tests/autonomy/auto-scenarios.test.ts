import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { runAutoScenarioSuite } from './auto-scenarios';
import type { AutoScenarioReport } from './auto-scenarios-support';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '056-auto-scenarios', 'report.json');

function serializable(report: AutoScenarioReport) {
  return JSON.parse(JSON.stringify(report)) as AutoScenarioReport;
}

test('056 scenario suite covers every named autonomy behaviour with real outcomes', async () => {
  const report = await runAutoScenarioSuite();
  assert.equal(report.version, '056-auto-scenarios-v1');
  assert.equal(report.summary.pass, true);
  assert.deepEqual(
    report.scenarios.map((scenario) => scenario.id),
    [
      'cruise-urban-free-road',
      'cruise-residential-curve',
      'cruise-intersection-approach',
      'signal-red-green',
      'stop-rule-profiles',
      'route-junction-cautious',
      'route-junction-risky',
      'follow-leader',
      'yield-conflict',
      'lane-change',
      'blocked-recovery',
      'accelerate-native',
    ],
  );
  assert.equal(report.summary.scenarios, 12);
  assert.equal(report.summary.scenariosPassed, 12);
  const behaviours = new Set(report.scenarios.map((scenario) => scenario.behavior));
  for (const behaviour of [
    'cruise',
    'accelerate',
    'follow',
    'signals',
    'stop',
    'yield',
    'lane-change',
    'blocked',
    'cruise/signals/accelerate',
  ])
    assert(behaviours.has(behaviour), `missing scenario behaviour ${behaviour}`);
  for (const scenario of report.scenarios) {
    assert(scenario.checks.length > 0, `${scenario.id} has no checks`);
    assert(scenario.pass, `${scenario.id} failed`);
    for (const check of scenario.checks) {
      assert.equal(check.pass, true, `${scenario.id}/${check.name}`);
      assert.equal(typeof check.detail, 'string');
      assert(check.detail.length > 0);
    }
  }
  const summary = report.scenarios.map((scenario) => [scenario.id, scenario.checks.length]);
  assert(summary.every(([, checks]) => Number(checks) >= 3));
});

test('056 negative cases fail closed instead of fabricating a policy answer', async () => {
  const report = await runAutoScenarioSuite();
  assert.deepEqual(
    report.negativeCases.map((entry) => entry.id),
    [
      'wrong-context-actor',
      'stale-context',
      'foreign-behavior-tick',
      'missing-leader',
      'signal-unobservable',
      'stop-leader-induced',
      'lane-local-only',
      'yield-local-only',
      'blocked-missing-graph',
      'profile-version-mismatch',
    ],
  );
  assert.equal(report.summary.negativeCases, 10);
  assert.equal(report.summary.negativeCasesPassed, 10);
  for (const entry of report.negativeCases) {
    assert(entry.pass, `${entry.id} did not fail closed`);
    assert.equal(entry.expected, 'fail closed');
    assert(entry.checks.length > 0);
    for (const check of entry.checks) assert.equal(check.pass, true, `${entry.id}/${check.name}`);
  }
  // Explicit fail-closed reasons: identity, age, missing data and unobservable stimulus.
  const byId = new Map(report.negativeCases.map((entry) => [entry.id, entry]));
  assert.equal(byId.get('wrong-context-actor')?.actual, 'FOREIGN_CONTEXT/FOREIGN_CONTEXT');
  assert.equal(byId.get('stale-context')?.actual, 'STALE_CONTEXT/STALE_CONTEXT');
  assert.equal(byId.get('foreign-behavior-tick')?.actual, 'FOREIGN_OR_STALE_BEHAVIOR');
  assert.equal(byId.get('missing-leader')?.actual, 'NO_LEADER');
  assert.equal(byId.get('signal-unobservable')?.actual, 'UNAVAILABLE/MISSING_POLICY_FACTS');
  assert.equal(byId.get('blocked-missing-graph')?.actual, 'MISSING_LANE_GRAPH');
});

test('056 mutation probes prove plausible wrong implementations would fail', async () => {
  const report = await runAutoScenarioSuite();
  assert.equal(report.summary.mutationProbes, 5);
  assert.equal(report.summary.mutationProbesPassed, 5);
  for (const probe of report.mutationProbes) {
    assert(probe.pass, `${probe.name} did not reject the wrong variant`);
    assert(probe.name.startsWith('mutation '));
  }
  const names = report.mutationProbes.map((probe) => probe.name);
  assert(names.includes('mutation cruise ignores style delta'));
  assert(names.includes('mutation following ignores leader'));
  assert(names.includes('mutation signal always stops'));
  assert(names.includes('mutation lane accepts local coverage'));
  assert(names.includes('mutation yield ignores the gap'));
});

test('056 suite and machine-readable report are deterministic and serializable', async () => {
  const first = await runAutoScenarioSuite(),
    second = await runAutoScenarioSuite();
  assert.deepEqual(serializable(first), serializable(second));
  const json = JSON.stringify(serializable(first));
  assert(!json.includes('undefined'));
  assert(!json.includes('NaN'));
  assert(!json.includes('Infinity'));
  assert(json.includes('"version":"056-auto-scenarios-v1"'));
  assert(json.includes('"summary"'));
});

test('056 committed evidence report is the current suite transcript', async () => {
  const report = await runAutoScenarioSuite(),
    saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as AutoScenarioReport;
  assert.deepEqual(saved, serializable(report));
});

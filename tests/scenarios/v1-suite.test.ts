import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runScenarioSuite } from './v1-suite';
import type { ScenarioSuiteReport } from './scenario-suite-support';

/**
 * PBI 151: the V1 scenario suite.
 *
 * The test asserts the suite itself: four families, positive and negative cases with declared
 * tolerances, no unexecuted scenario counted as a pass, the 216/056 reuse entries and a
 * byte-identical transcript on two independent runs. The committed evidence is compared as a whole,
 * so a changed number fails until the evidence is regenerated deliberately.
 */

const EVIDENCE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'Docs',
  'Evidence',
  '151-scenario-suite',
  'report.json',
);

let cached: ScenarioSuiteReport | null = null;

function report(): ScenarioSuiteReport {
  cached ??= runScenarioSuite();
  return cached;
}

function serializable(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

test('151 the suite covers the four V1 families with positives and negatives', () => {
  const suite = report();
  assert.equal(suite.version, '151-scenario-suite-v1');
  assert.equal(suite.command, 'npm run scenarios:v1');
  assert.deepEqual(
    suite.families.map((family) => family.family),
    ['AUTONOMY', 'RIDES', 'LEARNING', 'CAMPAIGN'],
  );
  for (const family of suite.families) {
    assert.ok(family.scenarios >= 3, `${family.family} has only ${family.scenarios} scenarios`);
    assert.ok(family.positive > 0, `${family.family} has no positive case`);
    assert.ok(family.negative > 0, `${family.family} has no negative case`);
    assert.equal(family.fail, 0, `${family.family} has a failing scenario`);
  }
  assert.equal(suite.summary.fail, 0);
  assert.equal(suite.summary.pass, true);
  assert.equal(suite.summary.allFamiliesCovered, true);
  assert.equal(suite.summary.everyFamilyPositiveAndNegative, true);
  assert.equal(suite.summary.positive, 9);
  assert.equal(suite.summary.negative, 4);
  assert.equal(suite.summary.reuse, 2);
});

test('151 every executed scenario declares seed, input, expectation and tolerances', () => {
  const suite = report();
  const executed = suite.scenarios.filter((scenario) => scenario.executed);
  assert.equal(executed.length, 12);
  const ids = new Set<string>();
  for (const scenario of executed) {
    assert(!ids.has(scenario.id), `duplicate scenario id ${scenario.id}`);
    ids.add(scenario.id);
    assert.equal(scenario.seed, 151, `${scenario.id} does not use the fixed seed`);
    assert.ok(scenario.steps >= 1, `${scenario.id} has no executed steps`);
    assert.ok(Object.keys(scenario.input).length > 0, `${scenario.id} has no input`);
    assert.ok(Object.keys(scenario.expected).length > 0, `${scenario.id} has no expectation`);
    assert.ok(Object.keys(scenario.actual).length > 0, `${scenario.id} has no actual result`);
    assert.ok(
      scenario.checks.length >= 4,
      `${scenario.id} has only ${scenario.checks.length} checks`,
    );
    assert.equal(scenario.notRunReason, null);
    for (const check of scenario.checks) {
      assert.equal(check.pass, true, `${scenario.id}/${check.name}`);
      assert.ok(
        check.tolerance.rule.length > 10,
        `${scenario.id}/${check.name} has no tolerance rule`,
      );
      assert.ok(
        ['EXACT', 'ABSOLUTE', 'RELATIVE'].includes(check.tolerance.kind),
        `${scenario.id}/${check.name} has no tolerance kind`,
      );
      if (check.tolerance.kind === 'EXACT') assert.equal(check.tolerance.value, 0);
      else assert.ok(check.tolerance.value >= 0, `${scenario.id}/${check.name} has no tolerance`);
      assert.notEqual(check.actual, undefined, `${scenario.id}/${check.name} has no actual`);
      assert.doesNotMatch(
        check.tolerance.rule.toLowerCase(),
        /aprox|aproximativ/,
        `${scenario.id}/${check.name} uses a vague tolerance`,
      );
    }
    const failed = scenario.checks.filter((check) => !check.pass);
    assert.equal(scenario.verdict, failed.length === 0 ? 'PASS' : 'FAIL', scenario.id);
  }
  const numericTolerances = executed.flatMap((scenario) =>
    scenario.checks.filter(
      (check) => typeof check.expected === 'number' && check.tolerance.kind === 'ABSOLUTE',
    ),
  );
  assert.ok(numericTolerances.length > 0, 'no numeric tolerance was declared');
});

test('151 no unexecuted scenario is reported as a pass', () => {
  const suite = report();
  const notRun = suite.scenarios.filter((scenario) => scenario.verdict === 'NOT_RUN');
  assert.equal(notRun.length, 1);
  assert.equal(suite.summary.notRun, 1);
  for (const scenario of notRun) {
    assert.equal(scenario.executed, false);
    assert.equal(scenario.seed, null);
    assert.equal(scenario.steps, 0);
    assert.deepEqual([...scenario.checks], []);
    assert.ok((scenario.notRunReason ?? '').length > 32, `${scenario.id} has no real reason`);
    assert.equal(scenario.verdict, 'NOT_RUN');
  }
  assert.equal(
    suite.summary.passed + suite.summary.fail + suite.summary.notRun,
    suite.summary.scenarios,
  );
  assert.equal(suite.summary.executed, suite.summary.passed + suite.summary.fail);
  assert.equal(suite.summary.executed + suite.summary.notRun, suite.summary.scenarios);
  assert.equal(suite.summary.passed, 12);
});

test('151 the suite reuses the 216 matrix and the 056 autonomy suite instead of duplicating them', () => {
  const suite = report();
  assert.deepEqual(
    suite.reuse.map((entry) => entry.source),
    ['216-v1-regression', '056-auto-scenarios'],
  );
  for (const entry of suite.reuse) {
    assert.equal(entry.verdict, 'PASS', `${entry.source} reuse failed`);
    assert.ok(entry.checks.length >= 6);
    assert.ok(entry.checks.every((check) => check.pass));
    assert.ok(entry.scenarioIds.length > 0);
    assert.doesNotThrow(() => readFileSync(join(process.cwd(), entry.evidence), 'utf8'));
  }
  const ourIds = new Set(suite.scenarios.map((scenario) => scenario.id));
  for (const entry of suite.reuse)
    for (const id of entry.scenarioIds) assert(!ourIds.has(id), `reused row re-declared as ${id}`);
});

test('151 two independent runs produce the same transcript', () => {
  const first = serializable(runScenarioSuite());
  const second = serializable(runScenarioSuite());
  assert.deepEqual(first, second);
  const json = JSON.stringify(first);
  assert(!json.includes('NaN'));
  assert(!json.includes('Infinity'));
  assert.equal((first as ScenarioSuiteReport).reproducibility.runs, 2);
  assert.match((first as ScenarioSuiteReport).reproducibility.digest, /^[a-f0-9]{64}$/);
});

test(
  '151 the committed scenario report is the current transcript',
  { skip: process.env.V1_SCENARIO_SUITE_PREFLIGHT === '1' },
  () => {
    const saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as ScenarioSuiteReport;
    assert.deepEqual(saved, serializable(report()) as ScenarioSuiteReport);
  },
);

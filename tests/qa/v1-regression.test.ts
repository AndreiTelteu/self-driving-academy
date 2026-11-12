import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runV1RegressionReport } from './v1-regression-report';
import type { V1RegressionReport } from './v1-regression-report';

/**
 * PBI 216: the V1 regression matrix, executed.
 *
 * The test file asserts the matrix itself (each row passed or is explicitly NOT_RUN with a reason),
 * the XP before/after fingerprints of the five degradation paths, the budget comparison and the
 * dependency graph. The committed transcript is compared byte for byte, so a changed number in any
 * contract fails the suite until the evidence is regenerated deliberately.
 */

const EVIDENCE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'Docs',
  'Evidence',
  '216-v1-regression',
  'report.json',
);

let cached: Promise<V1RegressionReport> | null = null;

function report(): Promise<V1RegressionReport> {
  cached ??= runV1RegressionReport();
  return cached;
}

test('216 the matrix executed every category and no row failed', async () => {
  const matrix = await report();
  assert.equal(
    matrix.summary.fail,
    0,
    JSON.stringify(matrix.rows.filter((row) => row.verdict === 'FAIL')),
  );
  assert.ok(matrix.summary.pass >= 20, `only ${matrix.summary.pass} passing rows`);
  assert.equal(
    matrix.summary.notRun,
    2,
    'only the browser playtest and the frame probe are NOT_RUN',
  );
  for (const row of matrix.rows) {
    assert.notEqual(row.verdict, 'FAIL', `${row.id}: ${row.note}`);
    if (row.verdict === 'NOT_RUN') assert.ok((row.notRunReason ?? '').length > 20, row.id);
    else assert.ok(Object.keys(row.actual).length > 0, `${row.id} carries real numbers`);
    assert.equal(row.command, 'npm run qa:v1-regression');
  }
  for (const category of ['MODES', 'PROPAGATION', 'LEARNING_BARRIER', 'KPI', 'DAILY', 'XP']) {
    assert.ok((matrix.summary.categories[category] ?? 0) > 0, `missing ${category} rows`);
  }
  assert.ok((matrix.summary.categories.CHECKPOINT ?? 0) >= 2);
  assert.ok((matrix.summary.categories.REPLAY ?? 0) >= 2);
  assert.ok((matrix.summary.categories.COMBINED ?? 0) >= 1);
  assert.ok((matrix.summary.categories.BENCHMARK ?? 0) >= 1);
  assert.ok((matrix.summary.categories.DEPENDENCIES ?? 0) >= 1);
});

test('216 the three modes, the propagation and the barrier rows are positive and negative', async () => {
  const matrix = await report();
  const modes = matrix.rows.filter((row) => row.category === 'MODES');
  assert.ok(modes.some((row) => row.polarity === 'POSITIVE'));
  assert.ok(modes.some((row) => row.polarity === 'NEGATIVE'));
  const propagation = matrix.rows.filter((row) => row.category === 'PROPAGATION');
  assert.equal(propagation.length, 2);
  assert.ok(propagation.some((row) => row.polarity === 'NEGATIVE'));
  assert.equal(matrix.rows.filter((row) => row.category === 'LEARNING_BARRIER').length, 2);
});

test('216 XP has zero losses on every degradation path', async () => {
  const matrix = await report();
  assert.equal(matrix.xp.losses, 0);
  assert.equal(matrix.xp.fingerprintBefore, matrix.xp.fingerprintAfter);
  assert.equal(matrix.xp.before.balance, matrix.xp.after.balance);
  assert.equal(matrix.xp.before.level, matrix.xp.after.level);
  assert.equal(matrix.xp.after.entries, matrix.xp.before.entries);
  assert.deepEqual(
    matrix.xp.paths.map((entry) => entry.id),
    ['KPI_DOWN', 'INCIDENT', 'MISSION_FAILED', 'GOAL_REFUSED', 'DAY_MISSED'],
  );
  assert.ok(matrix.xp.paths.every((entry) => entry.unchanged));
  assert.equal(matrix.xp.debits, 0);
  assert.equal(matrix.xp.negativeCredits, false);
});

test('216 the new costs are compared with the manifest, not with invented thresholds', async () => {
  const matrix = await report();
  const measured = matrix.budgets.filter((entry) => entry.verdict !== 'NOT_RUN');
  assert.ok(measured.length >= 5, 'at least five real budgets were compared');
  for (const entry of measured) {
    assert.equal(entry.verdict, 'PASS', `${entry.metric}: ${entry.actual} > ${entry.budget}`);
    assert.notEqual(entry.source, '');
  }
  const notRun = matrix.budgets.filter((entry) => entry.verdict === 'NOT_RUN');
  assert.deepEqual(
    notRun.map((entry) => entry.metric),
    ['KPI visual chart points', 'frame p95'],
    'a component without a manifest budget and the frame probe are declared, not faked',
  );
  assert.ok(matrix.gaps.length >= 3);
});

test('216 the extension gate has no inverse dependency and the graph is acyclic', async () => {
  const matrix = await report();
  assert.deepEqual([...matrix.dependencies.cycles], []);
  assert.deepEqual([...matrix.dependencies.inverseDependencies], []);
  assert.equal(matrix.dependencies.gateCoversExtensions, true);
  assert.deepEqual([...matrix.dependencies.duplicates], []);
  assert.ok(matrix.dependencies.nodes > 200, 'the whole board was read');
  assert.ok(matrix.dependencies.edges > 0);
});

test('216 the validation level is declared honestly', async () => {
  const matrix = await report();
  assert.equal(matrix.validation.level, 'targeted');
  assert.equal(matrix.validation.playtest, 'NOT_RUN');
  assert.equal(matrix.validation.frame, 'NOT_RUN');
  assert.ok(matrix.validation.playtestRemaining.length >= 3);
  assert.ok(matrix.limitations.length >= 3);
  assert.equal(
    matrix.rows.some((row) => JSON.stringify(row.actual).toLowerCase().includes('playtest pass')),
    false,
  );
});

test(
  '216 the committed regression report is the current transcript',
  { skip: process.env.V1_REGRESSION_PREFLIGHT === '1' },
  async () => {
    const saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as V1RegressionReport;
    const fresh = await report();
    assert.deepEqual(
      JSON.parse(JSON.stringify(fresh)),
      JSON.parse(JSON.stringify(saved)),
      'run npm run qa:v1-regression to regenerate the evidence',
    );
  },
);

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRenderBudgetReport,
  measureRenderBudget,
  parseRenderBudgets,
  renderBudgetMarkdown,
  verifyRenderBudgetReport,
} from './render-budget';
import type { RenderMeasurement } from './render-budget';

const manifest = JSON.parse(
  readFileSync(join(process.cwd(), 'Docs', 'performance-budgets.json'), 'utf8'),
);
const budgets = parseRenderBudgets(manifest);
const measurement = measureRenderBudget();
const meta = { capturedAt: '2026-11-12T00:00:00.000Z', commit: 'deadbeef', label: 'test' };

function report(before: RenderMeasurement, after: RenderMeasurement) {
  return buildRenderBudgetReport({
    budgets,
    before,
    after,
    beforeMeta: meta,
    afterMeta: meta,
  });
}

test('the manifest budgets are read, never defined here', () => {
  assert.equal(budgets.source, 'Docs/performance-budgets.json');
  assert.equal(budgets.budgetVersion, '203-initial-1');
  assert.equal(budgets.drawCalls, 128);
  assert.equal(budgets.instances, 8192);
  assert.equal(budgets.batches, 512);
  assert.equal(budgets.matrixBufferBytes, 2097152);
  assert.equal(budgets.frameP95Ms, 35);
  assert.equal(budgets.gpuP95Ms, 28);
  assert.throws(() => parseRenderBudgets({ proposedCapacities: {} }), /rendering/);
});

test('the probe is deterministic: two runs produce identical measurements', () => {
  const second = measureRenderBudget();
  assert.equal(JSON.stringify(second), JSON.stringify(measurement));
  assert.ok(measurement.city.elements > 900);
  assert.ok(measurement.city.drawCalls <= 16);
  assert.ok(measurement.city.thinInstances > 0);
  assert.ok(measurement.city.bounds);
  assert.ok(Object.keys(measurement.city.bounds).length === measurement.city.elements);
});

test('the report fails a regression and reports frame/GPU as not measured', () => {
  const regressed: RenderMeasurement = {
    ...measurement,
    city: { ...measurement.city, drawCalls: 200 },
  };
  const report_ = report(measurement, regressed);
  const drawRow = report_.rows.find((row) => row.id === 'city-draw-calls')!;
  assert.equal(drawRow.verdict, 'FAIL');
  assert.equal(report_.summary.gate, 'FAILED');
  const frame = report_.rows.find((row) => row.id === 'frame-p95')!;
  assert.equal(frame.verdict, 'NOT_MEASURED');
  assert.equal(frame.after, null);
  assert.ok(frame.note.includes('NullEngine'));
  assert.deepEqual(
    report_.notMeasured.map((entry) => entry.metric),
    ['interval de cadru p95 (hardware)', 'lucru GPU p95'],
  );
  assert.equal(report_.deviations.length, 2);
  assert.ok(report_.deviations[0]!.includes('draw calls ale layout-ului orașului'));
  assert.ok(report_.deviations[1]!.includes('draw calls totale ale scenei de referință'));
  assert.deepEqual(verifyRenderBudgetReport(report_), []);
});

test('the committed capture is reproducible and the report is internally consistent', () => {
  const report_ = report(measurement, measurement);
  assert.deepEqual(verifyRenderBudgetReport(report_), []);
  assert.equal(report_.summary.fail, 0);
  assert.equal(report_.summary.gate, 'STRUCTURAL_PASS');
  assert.equal(report_.manifest.modified, false);
  assert.equal(report_.summary.hardwareGameplayGate, 'NOT_VALIDATED');
  // The comparison of a capture with itself proves the invariants: zero deviation, one switch.
  const bounds = report_.rows.find((row) => row.id === 'city-element-bounds')!;
  assert.equal(bounds.verdict, 'PASS');
  assert.equal(bounds.after, 0);
  for (const preset of ['low', 'medium', 'high'])
    assert.equal(report_.rows.find((row) => row.id === `lod-${preset}`)!.verdict, 'PASS');
  assert.equal(report_.rows.find((row) => row.id === 'picking-equivalence')!.verdict, 'PASS');
});

test('the markdown names the budgets, the captures and the unmeasured metrics', () => {
  const markdown = renderBudgetMarkdown(report(measurement, measurement));
  assert.ok(markdown.startsWith('# PBI 157'));
  assert.ok(markdown.includes('203-initial-1'));
  assert.ok(markdown.includes('draw calls ale layout-ului orașului (042)'));
  assert.ok(markdown.includes('NOT_MEASURED'));
  assert.ok(markdown.includes('NOT_VALIDATED'));
  assert.ok(markdown.includes('Invarianți verificati'));
  assert.ok(markdown.includes('## Abateri'));
});

test('the committed evidence files match the probe and the report', () => {
  const evidence = join(process.cwd(), 'Docs', 'Evidence', '157-render-budget');
  const before = JSON.parse(readFileSync(join(evidence, 'before.json'), 'utf8'));
  const after = JSON.parse(readFileSync(join(evidence, 'after.json'), 'utf8'));
  assert.equal(JSON.stringify(after.measurement), JSON.stringify(measurement));
  assert.ok(before.measurement.city.drawCalls > after.measurement.city.drawCalls);
  assert.equal(before.measurement.city.thinInstances, 0);
  const derived = buildRenderBudgetReport({
    budgets,
    before: before.measurement,
    after: after.measurement,
    beforeMeta: before.meta,
    afterMeta: after.meta,
  });
  assert.deepEqual(verifyRenderBudgetReport(derived), []);
  const saved = JSON.parse(readFileSync(join(evidence, 'report.json'), 'utf8'));
  assert.equal(saved.summary.fail, 0);
  assert.equal(saved.summary.gate, 'STRUCTURAL_PASS');
  // The report is committed as a deterministic derivation: same rows, same verdicts.
  assert.deepEqual(
    saved.rows.map((row: { id: string; verdict: string }) => [row.id, row.verdict]),
    derived.rows.map((row) => [row.id, row.verdict]),
  );
});

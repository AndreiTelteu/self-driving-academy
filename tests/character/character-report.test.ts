import assert from 'node:assert/strict';
import test from 'node:test';
import { runCharacterReport } from './character-suite';

test('raportul determinist acoperă scară, clipuri, poziția autoritară și refuzurile', () => {
  const report = runCharacterReport();
  assert.equal(report.contract, '191-character-v1');
  assert.equal(report.samplingHz, 60);
  assert.equal(report.summary.pass, true);
  assert.equal(report.summary.compatibilityPassed, 9);
  assert.equal(report.summary.compatibilityChecks, 9);
  assert.equal(report.summary.clipsPassed, 5);
  assert.equal(report.summary.authorityFrames, 309);
  assert.equal(report.summary.refusedCases, 3);
  assert.equal(report.summary.refusedCasesTotal, 3);
  assert.equal(report.summary.visualIssues, 0);
  assert.equal(report.determinism.runs, 2);
  assert.equal(report.determinism.identical, true);
  assert.match(report.determinism.digest, /^[0-9a-f]{64}$/);
  assert.equal(report.compatibility.accepted, true);

  assert.deepEqual(
    report.clips.map((clip) => clip.clipId),
    ['idle', 'walk', 'run', 'enter-vehicle', 'exit-vehicle'],
  );
  for (const clip of report.clips) {
    assert.equal(clip.verdict, 'PASS');
    assert.equal(clip.frameDetail.length, clip.frames);
    assert.ok(clip.toleranceM > 0);
  }
  assert.ok(
    report.clips.every((clip) => clip.lowestMinM >= -clip.toleranceM),
    'no clip sinks below the ground',
  );
  for (const clip of report.authority.clips) {
    assert.equal(clip.identical, true);
    assert.equal(clip.mismatchedFrames, 0);
  }
  assert.equal(report.authority.positionIndependentOfAuthority, true);
  for (const refusal of report.authority.refusals) {
    assert.equal(refusal.refused, true);
    assert.equal(refusal.positionBitsUnchanged, true);
  }
  for (const refusal of report.refusals) assert.equal(refusal.refused, true);
  assert.deepEqual(report.visual.alignmentIssues, []);
  assert.equal(report.visual.budgetAccepted, true);

  const second = runCharacterReport();
  assert.equal(second.determinism.digest, report.determinism.digest);
  assert.equal(JSON.stringify(second), JSON.stringify(report));
});

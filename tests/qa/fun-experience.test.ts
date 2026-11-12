import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import type { FunExperienceReport, FunExperienceSnapshot } from './fun-experience-report';
import {
  buildFunExperienceReport,
  FUN_EXPERIENCE_PLAYTEST_PARTICIPANTS,
  FUN_EXPERIENCE_VERSION,
  funExperienceReportMarkdown,
  verifyFunExperienceReport,
} from './fun-experience-report';

/**
 * PBI 235: the integrated fun/return verification.
 *
 * The tests read the committed `probes.json` (the real numbers produced by the last
 * `npm run qa:fun`) and rebuild the report from it. That proves the derivation is deterministic
 * without re-running every probe inside the suite. The negative cases are the important ones: a
 * claimed retention percentage, a claimed playtest and a claimed release verdict must all be
 * rejected, so the report cannot quietly turn a hypothesis into a measured result.
 */

const EVIDENCE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'Docs',
  'Evidence',
  '235-fun-qa',
);

const snapshot = JSON.parse(
  readFileSync(join(EVIDENCE, 'probes.json'), 'utf8'),
) as FunExperienceSnapshot;

const report = JSON.parse(
  readFileSync(join(EVIDENCE, 'report.json'), 'utf8'),
) as FunExperienceReport;

test('235 the committed probes rebuild the committed report byte for byte', () => {
  const fresh = buildFunExperienceReport(snapshot);
  assert.deepEqual(JSON.parse(JSON.stringify(fresh)), JSON.parse(JSON.stringify(report)));
  assert.equal(fresh.version, FUN_EXPERIENCE_VERSION);
  assert.equal(fresh.command, 'npm run qa:fun');
  assert.equal(funExperienceReportMarkdown(fresh), funExperienceReportMarkdown(report));
});

test('235 the committed probes carry real numbers, not placeholders', () => {
  assert.equal(snapshot.probes.length, 16);
  for (const probe of snapshot.probes) {
    assert.equal(probe.command.startsWith('npm run '), true, probe.id);
    assert.ok(probe.checks > 0, `${probe.id} has no checks`);
    assert.ok(probe.detail.length > 40, `${probe.id} has no real detail`);
    assert.ok(probe.passed <= probe.checks, `${probe.id} passed more than it ran`);
  }
  assert.deepEqual(
    snapshot.probes.map((probe) => probe.pbi),
    [
      '216',
      '151',
      '152',
      '224',
      '225',
      '226',
      '227',
      '228',
      '233',
      '234',
      '229',
      '230',
      '212',
      '084',
      '083',
      '153',
    ],
  );
});

test('235 every criterion carries a verdict and the failures stay visible', () => {
  assert.deepEqual(
    report.criteria.map((criterion) => criterion.id),
    ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'],
  );
  const byId = new Map(report.criteria.map((criterion) => [criterion.id, criterion]));
  assert.equal(byId.get('C1')?.verdict, 'PASS');
  assert.equal(byId.get('C2')?.verdict, 'PASS');
  assert.equal(byId.get('C4')?.verdict, 'PASS');
  assert.equal(byId.get('C6')?.verdict, 'PASS');
  assert.equal(byId.get('C3')?.verdict, 'FAIL');
  assert.equal(byId.get('C5')?.verdict, 'NOT_RUN');
  for (const criterion of report.criteria) {
    assert.ok(criterion.checks.length > 0, `${criterion.id} has no checks`);
    assert.ok(criterion.note.length > 20, `${criterion.id} has no note`);
  }
  const c3 = byId.get('C3');
  const textCheck = c3?.checks.find((check) => check.name.includes('Text lizibil'));
  assert.equal(textCheck?.verdict, 'FAIL');
  assert.match(textCheck?.detail ?? '', /D4|D5|D6/);
  assert.equal(report.summary.criteria, 6);
  assert.equal(report.summary.pass + report.summary.fail + report.summary.notRun, 6);
  assert.deepEqual(verifyFunExperienceReport(report), []);
});

test('235 the mechanism is tested and the retention is not measured', () => {
  assert.equal(report.replayMotives.length, 5);
  assert.deepEqual(
    report.replayMotives.map((motive) => motive.id),
    ['HAOS_DESTRUCTION', 'CHALLENGES', 'DAILY', 'RECORDS', 'QUICK_RESTART'],
  );
  for (const motive of report.replayMotives) {
    assert.equal(motive.mechanism, 'TESTED', motive.id);
    assert.equal(motive.retention, 'NOT_RUN', motive.id);
    assert.ok(motive.mechanismEvidence.length > 40, `${motive.id} has no evidence`);
    assert.ok(motive.wouldNeed.length > 40, `${motive.id} does not say what is needed`);
    assert.equal(/%/.test(motive.mechanismEvidence), false, motive.id);
    assert.equal(/%/.test(motive.hypothesis), false, motive.id);
    assert.ok(motive.probes.length > 0, `${motive.id} cites no probe`);
  }
  assert.equal(report.playtest.status, 'NOT_RUN');
  assert.equal(report.playtest.participants, 0);
  assert.equal(report.playtest.requiredParticipants, FUN_EXPERIENCE_PLAYTEST_PARTICIPANTS);
  assert.equal(report.validation.retention, 'NOT_RUN');
  assert.equal(report.validation.playtest, 'NOT_RUN');
  assert.equal(report.validation.frame, 'NOT_VALIDATED');
  assert.ok(report.notMeasured.length >= 8);
  assert.ok(report.notMeasured.some((entry) => entry.includes('Return rate')));
  assert.ok(report.notMeasured.some((entry) => entry.includes('FPS')));
});

test('235 the gate keeps its real measurements and its open FPS criterion', () => {
  assert.equal(report.gate.structural, 'PASS');
  assert.equal(report.gate.release, 'NOT_VALIDATED');
  assert.equal(report.gate.fail, 0);
  assert.equal(report.gate.notValidated, 1);
  assert.equal(report.gate.manifestModified, false);
  assert.deepEqual(report.gate.issues, []);
  assert.ok(report.gate.soakMinutes >= report.gate.soakRequiredMinutes);
  assert.ok(report.gate.soakCycles >= report.gate.soakRequiredCycles);
  assert.equal(report.gate.soakCycles, 20);
  for (const id of [
    'destruction-effects-audio',
    'challenge-director',
    'savefile-integrity',
    'academy-chaos-cycles',
    'soak-60min',
    'fps-hardware',
  ])
    assert.ok(
      report.gate.rows.some((row) => row.id === id),
      `gate row ${id} is missing`,
    );
  assert.equal(report.gate.rows.find((row) => row.id === 'fps-hardware')?.verdict, 'NOT_VALIDATED');
});

test('235 a retention percentage is rejected', () => {
  const mutated = {
    ...report,
    replayMotives: report.replayMotives.map((motive, index) =>
      index === 0 ? { ...motive, retention: 'MEASURED', hypothesis: '42% revin' } : motive,
    ),
  } as unknown as FunExperienceReport;
  const issues = verifyFunExperienceReport(mutated);
  assert.ok(issues.some((issue) => issue.includes('pretinde retenție măsurată')));
  assert.ok(issues.some((issue) => issue.includes('conține un procent')));
});

test('235 a claimed playtest is rejected', () => {
  const claimed = {
    ...snapshot,
  } as unknown as FunExperienceSnapshot;
  const built = buildFunExperienceReport(claimed);
  const mutated = {
    ...built,
    playtest: { ...built.playtest, status: 'RUN', participants: 5 },
    criteria: built.criteria.map((criterion) =>
      criterion.id === 'C5' ? { ...criterion, verdict: 'PASS' } : criterion,
    ),
  } as unknown as FunExperienceReport;
  const issues = verifyFunExperienceReport(mutated);
  assert.ok(issues.some((issue) => issue.includes('playtestul este declarat rulat')));
  assert.ok(issues.some((issue) => issue.includes('C5 nu poate fi altceva decât NOT_RUN')));
});

test('235 a release PASS with an open criterion is rejected', () => {
  const mutated = {
    ...report,
    gate: { ...report.gate, release: 'PASS', notValidated: 1 },
  } as unknown as FunExperienceReport;
  const issues = verifyFunExperienceReport(mutated);
  assert.ok(issues.some((issue) => issue.includes('release PASS cu rânduri nevalidate')));
});

test('235 a hidden experience failure is rejected', () => {
  const mutated = {
    ...report,
    experienceFailures: [
      { id: 'D9', tier: 'CONTRACT', surface: 'x', viewport: 'y', check: 'z', summary: 'q' },
    ],
    criteria: report.criteria.map((criterion) =>
      criterion.id === 'C3'
        ? {
            ...criterion,
            verdict: 'PASS',
          }
        : criterion,
    ),
  } as unknown as FunExperienceReport;
  const issues = verifyFunExperienceReport(mutated);
  assert.ok(issues.some((issue) => issue.includes('niciun criteriu nu este FAIL')));
});

test('235 a snapshot without a probe reference is rejected', () => {
  const built = buildFunExperienceReport(snapshot);
  const mutated = {
    ...built,
    probes: built.probes.filter((probe) => probe.id !== 'savefile-234'),
  } as unknown as FunExperienceReport;
  const issues = verifyFunExperienceReport(mutated);
  assert.ok(issues.some((issue) => issue.includes('sonda lipsă savefile-234')));
});

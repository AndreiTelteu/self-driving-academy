import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runE2ESession } from './session-e2e';
import type { E2ESessionReport } from './session-e2e';

/**
 * PBI 152: the end-to-end session and progress test.
 *
 * The test asserts the session itself: the four modes are walked in one run, the profile and the
 * progress survive an export/restart with identical fingerprints, the mid-ride vehicle switch keeps
 * the ride and its intervention history, and two independent runs produce the same transcript. The
 * committed evidence is compared as a whole, so a changed number fails until it is regenerated
 * deliberately.
 */

const EVIDENCE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'Docs',
  'Evidence',
  '152-e2e-session',
  'report.json',
);

function serializable(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

test('152 the session walks AUTO, MANUAL, LEARNING and back to AUTO in one run', async () => {
  const session = await runE2ESession();
  assert.equal(session.version, '152-e2e-session-v1');
  assert.equal(session.command, 'npm run e2e:session');
  assert.equal(session.seed, 152);
  assert.deepEqual([...session.session.modePath], ['AUTO', 'MANUAL', 'LEARNING', 'AUTO']);
  assert.deepEqual(
    [...session.session.rideStates],
    ['TO_PICKUP', 'PICKUP', 'TO_DROPOFF', 'DROPOFF', 'COMPLETED'],
  );
  assert.equal(session.session.taxis, 30);
  assert.equal(session.session.civilians, 40);
  assert.equal(session.summary.steps, 11);
  assert.equal(session.summary.checks, 104);
  assert.equal(session.summary.fail, 0);
  assert.equal(session.summary.pass, true);
  assert.deepEqual([...session.summary.failChecks], []);
});

test('152 every check declares a tolerance and has an actual value', async () => {
  const session = await runE2ESession();
  const ids = new Set<string>();
  let numeric = 0;
  for (const step of session.steps) {
    assert(!ids.has(step.id), `duplicate step ${step.id}`);
    ids.add(step.id);
    assert.ok(Object.keys(step.input).length > 0, `${step.id} has no input`);
    assert.ok(Object.keys(step.actual).length > 0, `${step.id} has no actual result`);
    assert.ok(step.checks.length >= 3, `${step.id} has only ${step.checks.length} checks`);
    for (const check of step.checks) {
      assert.equal(check.pass, true, `${step.id}/${check.name}`);
      assert.ok(['EXACT', 'ABSOLUTE', 'RELATIVE'].includes(check.tolerance.kind));
      if (check.tolerance.kind === 'EXACT') assert.equal(check.tolerance.value, 0);
      assert.notEqual(check.actual, undefined, `${step.id}/${check.name} has no actual`);
      assert.doesNotMatch(check.detail.toLowerCase(), /aprox|aproximativ/);
      if (typeof check.expected === 'number' && check.tolerance.kind === 'ABSOLUTE') numeric += 1;
    }
    const failed = step.checks.filter((check) => !check.pass);
    assert.equal(step.verdict, failed.length === 0 ? 'PASS' : 'FAIL', step.id);
  }
  assert.ok(numeric > 0, 'no numeric tolerance was declared');
});

test('152 the export survives a restart with identical fingerprints', async () => {
  const session = await runE2ESession();
  const { restart } = session;
  assert.equal(restart.profileExportStatus, 'ACCEPTED');
  assert.equal(restart.profileChecksumVerified, true);
  assert.equal(restart.economyReadStatus, 'ACCEPTED');
  assert.equal(restart.economyChecksumVerified, true);
  assert.deepEqual(serializable(restart.xpBefore), serializable(restart.xpAfter));
  assert.deepEqual(serializable(restart.dailyBefore), serializable(restart.dailyAfter));
  assert.deepEqual(serializable(restart.kpiBefore), serializable(restart.kpiAfter));
  assert.equal(restart.xpBefore.balanceXp, 200.5);
  assert.equal(restart.xpBefore.level, 2);
  assert.equal(restart.xpBefore.entries, 3);
  assert.equal(restart.xpAfter.balanceXp, restart.xpBefore.balanceXp);
  assert.equal(restart.dailyBefore.rows, 3);
  assert.equal(restart.dailyAfter.rewarded, 1);
  assert.equal(restart.kpiBefore.reviews, 1);
  assert.equal(restart.kpiAfter.revenueMinorUnits, restart.kpiBefore.revenueMinorUnits);
  assert.equal(restart.fleetBefore.activeVersionId, restart.fleetAfterVersionId);
  assert.deepEqual(Object.keys(restart.fleetBefore.taxiHistogram), [restart.fleetAfterVersionId]);
  assert.deepEqual(Object.keys(restart.fleetBefore.civilianHistogram), [
    restart.fleetAfterVersionId,
  ]);
  assert.match(restart.xpFingerprint, /^[a-f0-9]{64}$/);
  assert.match(restart.dailyFingerprint, /^[a-f0-9]{64}$/);
  assert.match(restart.kpiFingerprint, /^[a-f0-9]{64}$/);
  assert.ok(restart.persistedBytes.profile > 0);
  assert.ok(restart.persistedBytes.economy > 0);
  assert.ok(restart.versionChecksums.length >= 2);
});

test('152 the mid-ride vehicle switch closes the intervention, not the ride', async () => {
  const session = await runE2ESession();
  const switchProof = session.vehicleSwitch;
  assert.equal(switchProof.stateBeforeSwitch, 'TO_DROPOFF');
  assert.equal(switchProof.stateAfterSwitch, 'TO_DROPOFF');
  assert.equal(switchProof.closeReason, 'VEHICLE_SWITCH');
  assert.equal(switchProof.segmentEndTick, switchProof.segmentStartTick + 3);
  assert.equal(switchProof.transitionsBefore, 3);
  assert.equal(switchProof.transitionsAfter, 3);
  assert.equal(switchProof.activeRidesAfter, 1);
  assert.equal(switchProof.seatAfterSwitch, null);
  assert.equal(switchProof.assignmentIdAfter, switchProof.assignmentIdBefore);
  assert.equal(switchProof.tripFingerprintAfter, switchProof.tripFingerprintBefore);
  assert.notEqual(switchProof.otherTaxiId, switchProof.taxiId);
  assert.equal(switchProof.segmentId, 'segment-152-1');
  assert.equal(session.session.segmentHistory, 2);
});

test('152 two independent runs produce the same transcript', async () => {
  const first = serializable(await runE2ESession());
  const second = serializable(await runE2ESession());
  assert.deepEqual(first, second);
  const json = JSON.stringify(first);
  assert(!json.includes('NaN'));
  assert(!json.includes('Infinity'));
  assert.equal((first as E2ESessionReport).reproductions.pass, true);
  assert.match((first as E2ESessionReport).reproductions.digest, /^[a-f0-9]{64}$/);
});

test(
  '152 the committed session report is the current transcript',
  { skip: process.env.E2E_SESSION_PREFLIGHT === '1' },
  async () => {
    const saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as E2ESessionReport;
    const current = serializable(await runE2ESession()) as E2ESessionReport;
    assert.deepEqual(saved.summary, current.summary);
    assert.deepEqual(saved.steps, current.steps);
    assert.deepEqual(saved.restart, current.restart);
    assert.deepEqual(saved.vehicleSwitch, current.vehicleSwitch);
    assert.equal(saved.reproductions.digest, current.reproductions.digest);
  },
);

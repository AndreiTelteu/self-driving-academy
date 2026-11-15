import assert from 'node:assert/strict';
import test from 'node:test';
import { runV3DigestValidation } from './v3-validation-digest';
import { runV3FlowValidation } from './v3-validation-flow';

/**
 * PBI 201 — poarta de execuție a criteriului 1.
 *
 * Fiecare mod (AUTO, MANUAL, LEARNING) trece prin lanțul real 192 → 195 → 193 → 196 → 197 → 198 și
 * este raportat separat. Testul nu replică logica modulelor: el cere suitei livrate să fi trecut, iar
 * suitei îi este interzis să inventeze un pas.
 */
test('201 toate cele trei moduri rămân coerente după intrare și după ieșire', () => {
  const report = runV3FlowValidation();
  assert.equal(report.cases.length, 3);
  assert.deepEqual(
    report.cases.map((entry) => entry.id),
    ['AUTO', 'MANUAL', 'LEARNING'],
  );
  for (const entry of report.cases) {
    assert.equal(entry.verdict, 'PASS', `${entry.id}: ${entry.failedChecks.join(' | ')}`);
    assert.deepEqual(entry.failedChecks, []);
    assert.equal(entry.reentry, 'ACCEPTED', `${entry.id}: re-entry is ${entry.reentry}`);
    assert.ok(entry.walkedAfterM > 0, `${entry.id}: no walking after the exit`);
    assert.ok(entry.counters.walkingTicks > 0, `${entry.id}: walking ticks are not counted`);
    assert.equal(
      entry.walker.vehicleBodiesCreated,
      0,
      `${entry.id}: walker created a vehicle body`,
    );
    assert.equal(entry.camera.entityClones, 0, `${entry.id}: camera cloned an entity`);
    assert.ok(entry.authority.transitions >= 2, `${entry.id}: fewer than two transitions`);
    assert.ok(entry.authority.delivered.CHARACTER > 0, `${entry.id}: no character command`);
    assert.ok(entry.authority.delivered.VEHICLE > 0, `${entry.id}: no vehicle command`);
    assert.ok(
      entry.authority.refused.doubleDelivery >= 2,
      `${entry.id}: double delivery not tested`,
    );
  }
  const learning = report.cases.find((entry) => entry.id === 'LEARNING');
  assert.equal(learning?.counters.closedLearning, 1, 'LEARNING closes one learning segment');
  assert.equal(learning?.counters.candidates, 1, 'LEARNING produces exactly one 069 candidate');
  const manual = report.cases.find((entry) => entry.id === 'MANUAL');
  assert.equal(manual?.counters.closedManual, 2, 'MANUAL closes both manual segments');
  const auto = report.cases.find((entry) => entry.id === 'AUTO');
  assert.equal(auto?.counters.closedManual, 2, 'AUTO takeovers open and close manual segments');
  assert.equal(report.seated.length, 3);
  for (const entry of report.seated) {
    assert.equal(entry.verdict, 'PASS', `${entry.mode}: ${entry.failedChecks.join(' | ')}`);
    assert.equal(entry.characterCommands, 0, `${entry.mode}: the character was commanded seated`);
    assert.ok(entry.vehicleCommands > 100, `${entry.mode}: too few vehicle commands`);
    assert.equal(entry.walkerTicks, 0, `${entry.mode}: the suspended body was stepped`);
    assert.ok(entry.inactiveRefusals >= 1, `${entry.mode}: inactive consumer not tested`);
  }
  assert.equal(report.summary.pass, true, JSON.stringify(report.summary));
  assert.equal(report.summary.determinism, true);
});

test('201 mersul nu alterează catalogul 092, capabilitățile 187, KPI 209 și XP 213, nici după reload 200', async () => {
  const report = await runV3DigestValidation();
  assert.equal(report.digests.length, 9);
  for (const entry of report.digests) {
    assert.match(entry.before, /^[0-9a-f]{64}$/, `${entry.id}: no sha256 before`);
    assert.equal(entry.identicalAfterWalks, true, `${entry.id}: changed after walking`);
    assert.equal(entry.identicalAfterReload, true, `${entry.id}: changed after reload`);
  }
  assert.equal(report.summary.pass, true, JSON.stringify(report.summary));
  assert.equal(report.summary.identical, report.summary.entries);
  assert.ok(report.walking.ticks >= 5000, `only ${report.walking.ticks} walking ticks`);
  assert.ok(report.walking.distanceM > 100, `only ${report.walking.distanceM} m walked`);
  assert.equal(report.walking.closedSegments, 0, 'walking closed a driving segment');
  assert.equal(report.walking.candidates, 0, 'walking produced an estimator candidate');
  assert.equal(report.reload.status, 'ACCEPTED');
  assert.equal(report.read.status, 'ACCEPTED');
  assert.equal(report.read.checksumVerified, true);
  assert.equal(report.reload.created, 0, 'the reload created bodies');
  assert.equal(report.reload.characters, 1);
  assert.equal(report.reload.secondReadSameDigest, true);
  assert.equal(report.bundle.ledgerSettlements, 3);
  assert.equal(report.bundle.xpEntries, 2);
});

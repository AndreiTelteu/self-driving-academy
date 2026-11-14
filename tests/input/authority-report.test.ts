import assert from 'node:assert/strict';
import test from 'node:test';
import { runAuthorityReport } from './authority-suite';

test('raportul determinist dovedește o singură autoritate și tranziții fără accelerație accidentală', () => {
  const report = runAuthorityReport();
  assert.equal(report.contract, '193-input-authority-v1');
  assert.equal(report.tickHz, 60);
  assert.equal(report.command, 'npm run authority:report');
  assert.equal(report.reference.transitionRule, 'NEUTRALIZE_UNTIL_RELEASE');
  assert.deepEqual(report.reference.driveActions, [
    'throttle',
    'brake',
    'steerLeft',
    'steerRight',
    'handbrake',
    'signalLeft',
    'signalRight',
  ]);

  // Criteriul 1 — tabelul de scenarii.
  assert.equal(report.scenarios.length, 13);
  for (const scenario of report.scenarios) assert.equal(scenario.verdict, 'PASS', scenario.id);
  assert.equal(report.scenarios.filter((entry) => entry.source === '066-focus').length, 1);

  // Criteriul 1 — exhaustiv: 256 de combinații × 2 autorități.
  assert.equal(report.exhaustive.combinationsPerAuthority, 256);
  assert.equal(report.exhaustive.authorities, 2);
  assert.equal(report.exhaustive.ticks, 512);
  assert.equal(report.exhaustive.addressed, 512);
  assert.equal(report.exhaustive.deliveredCharacter, 256);
  assert.equal(report.exhaustive.deliveredVehicle, 256);
  assert.equal(report.exhaustive.simultaneousNonEmptyTicks, 0);
  assert.equal(report.exhaustive.wrongConsumerDeliveries, 0);
  assert.equal(report.exhaustive.characterNonEmptyTicks, 64);
  assert.equal(report.exhaustive.vehicleNonEmptyTicks, 248);
  assert.equal(report.exhaustive.emptyTicks, 200);
  assert.equal(
    report.exhaustive.characterNonEmptyTicks +
      report.exhaustive.vehicleNonEmptyTicks +
      report.exhaustive.emptyTicks,
    report.exhaustive.ticks,
  );

  // Criteriul 1 — refuzul livrării duble.
  assert.equal(report.delivery.characterDeliveries, 1);
  assert.equal(report.delivery.vehicleDeliveries, 0);
  assert.equal(report.delivery.doubleDeliveryRefused, true);
  assert.equal(report.delivery.inactiveConsumerRefused, true);
  assert.equal(report.delivery.staleResultRefused, true);
  assert.deepEqual(report.delivery.codes, [
    'DOUBLE_DELIVERY_REFUSED',
    'DOUBLE_DELIVERY_REFUSED',
    'INACTIVE_CONSUMER_REFUSED',
    'STALE_RESULT',
  ]);
  assert.equal(report.delivery.refused.doubleDelivery, 2);
  assert.equal(report.delivery.refused.inactiveConsumer, 1);
  assert.equal(report.delivery.refused.staleResult, 1);

  // Criteriul 2 — tranziții cu taste ținute.
  assert.equal(report.transitions.length, 18);
  for (const row of report.transitions) {
    assert.equal(row.verdict, 'PASS', `${row.direction} ${row.held.join('+')}`);
    assert.equal(row.transitioned, true);
    assert.equal(row.afterEmpty, true, `${row.direction} ${row.held.join('+')}`);
    assert.equal(row.rearmedCommand, row.controlCommand);
  }
  const throttled = report.transitions.find(
    (row) => row.direction === 'CHARACTER→VEHICLE' && row.held.join(',') === 'throttle',
  );
  assert.ok(throttled);
  assert.equal(throttled.beforeEmpty, false);
  assert.equal(throttled.afterEmpty, true);
  assert.equal(throttled.rearmedEmpty, false);

  // Focus refolosit din 066.
  assert.equal(report.focus.fieldCommandEmpty, true);
  assert.equal(report.focus.fieldHeldKeys, 0);
  assert.equal(report.focus.fieldWalkerDistanceM, 0);
  assert.equal(report.focus.fieldDefaultPrevented, false);
  assert.equal(report.focus.resumedCommandEmpty, false);
  assert.ok(report.focus.resumedWalkerDistanceM > 0.5);
  assert.equal(report.focus.resumedDefaultPrevented, true);
  assert.equal(report.focus.listenersAfterDispose, 0);

  // Stare serializabilă.
  assert.equal(report.state.authorityPreserved, true);
  assert.equal(report.state.tickPreserved, true);
  assert.equal(report.state.heldPreserved, true);
  assert.equal(report.state.neutralizedOnRestore, true);
  assert.equal(report.state.firstTickAfterRestoreEmpty, true);
  assert.equal(report.state.firstTickAfterRestoreConsumer, 'VEHICLE');
  assert.equal(report.state.plainJson, true);
  assert.equal(report.state.restoreRefusals, 4);
  assert.deepEqual(report.state.keys, [
    'version',
    'tick',
    'authority',
    'held',
    'neutralized',
    'transitions',
  ]);

  assert.equal(report.summary.criterion1, true);
  assert.equal(report.summary.criterion2, true);
  assert.equal(report.summary.focus, true);
  assert.equal(report.summary.serializable, true);
  assert.equal(report.summary.pass, true);
  assert.ok(report.limitations.length >= 6);

  assert.equal(report.determinism.runs, 2);
  assert.equal(report.determinism.identical, true);
  assert.match(report.determinism.digest, /^[0-9a-f]{64}$/);

  const second = runAuthorityReport();
  assert.equal(second.determinism.digest, report.determinism.digest);
  assert.equal(JSON.stringify(second), JSON.stringify(report));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { runCompositionReport } from './walking-composition-suite';

test('raportul determinist al compunerii V3 dovedește lanțul și autoritatea unică', () => {
  const report = runCompositionReport();
  assert.equal(report.contract, '236-v3-composition-v1');
  assert.equal(report.command, 'npm run composition:report');
  assert.equal(report.tickHz, 60);
  assert.equal(report.mapId, 'neighbourhood-compact-v1');
  assert.equal(report.summary.pass, true);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.summary.rows, 6);
  assert.ok(report.summary.checks >= 35);

  const byName = new Map(report.checks.map((check) => [check.name, check]));
  for (const name of [
    'mers: clipul este walk',
    'alergare: clipul este run',
    'intrare: autoritatea trece pe taxi',
    'intrare: poziția personajului rămâne bit-identică',
    'intrare: dubla livrare este refuzată de arbitraj',
    'conducere: corpul personajului este neschimbat',
    'ieșire: autoritatea revine la personaj',
    'ieșire: mașina eliberată revine în AUTO',
    'revenire: clipul este din nou walk',
    'animație: 60/60 cadre de render păstrează poziția bit-identică',
    'determinism: două rulări produc aceleași rânduri și verificări',
  ]) {
    const check = byName.get(name);
    assert.ok(check, `lipsește verificarea ${name}`);
    assert.equal(check.pass, true, `${name}: ${JSON.stringify(check.actual)}`);
  }

  assert.deepEqual(
    report.rows.map((row) => row.sequence),
    ['A-mers', 'B-alergare', 'C-intrare', 'D-conducere', 'E-ieșire', 'F-revenire-mers'],
  );
  assert.equal(report.rows[0]!.controlledEntity, 'CHARACTER:player-character');
  assert.equal(report.rows[2]!.controlledEntity, 'VEHICLE:taxi-01');
  assert.equal(report.rows[2]!.mode, 'MANUAL');
  assert.equal(report.rows[4]!.controlledEntity, 'CHARACTER:player-character');
  assert.equal(report.operations.ticksWithoutDelivery, 0);
  assert.equal(
    report.operations.deliveriesCharacter + report.operations.deliveriesVehicle,
    report.operations.ticks,
  );
  assert.equal(report.operations.entryAttempts, 1);
  assert.equal(report.operations.exitAttempts, 1);
  assert.match(report.digest, /^[a-f0-9]{64}$/);
  assert.equal(report.cost.status, 'NOT_RUN');
  assert.ok(report.limitations.length >= 4);
});

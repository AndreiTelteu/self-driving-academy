import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import {
  demonstrationFixtureReasonCodes,
  evaluateDemonstrationFixtureCorpus,
  stopComplianceRatio,
  validateDemonstrationFixture,
} from '../../src/telemetry/index.ts';
import { corruptedFixtures, validFixtures } from './fixtures/corpus.ts';

test('every declarative valid fixture validates and keeps its expected context label', () => {
  for (const fixture of validFixtures) {
    const result = validateDemonstrationFixture(fixture);
    assert.equal(result.valid, true, `${fixture.id}: ${JSON.stringify(result.reasons)}`);
    assert.deepEqual(result.reasons, []);
    assert.equal(result.contextLabel, fixture.eligibilityLabel);
  }
});

test('every corrupted fixture is refused with its closed reason and exact field path', () => {
  for (const fixture of corruptedFixtures) {
    const result = validateDemonstrationFixture(fixture);
    assert.equal(result.valid, false, fixture.id);
    assert.equal(result.reasons.length, 1, fixture.id);
    assert.equal(result.reasons[0]?.reasonCode, fixture.expectedReason, fixture.id);
    assert.equal(result.reasons[0]?.fieldPath, fixture.expectedPath, fixture.id);
    assert.ok(demonstrationFixtureReasonCodes.includes(result.reasons[0]!.reasonCode));
    assert.ok(Object.hasOwn(result.reasons[0]!, 'offendingValue'));
  }
  const acceptedCorruption = evaluateDemonstrationFixtureCorpus(
    [{ fixture: corruptedFixtures[0], expectedValid: false }],
    () => ({
      fixtureId: 'plausible-bug',
      valid: true,
      contextLabel: 'FREE_TRAFFIC',
      reasons: [],
      stopObservation: 'OBSERVED',
    }),
  );
  assert.equal(acceptedCorruption[0]?.matchesExpectation, false);
});

test('missing STOP stays NOT_OBSERVED and cannot produce a compliance ratio', () => {
  const fixture = validFixtures.find((item) => item.id === 'stop-not-observed');
  assert.ok(fixture);
  const result = validateDemonstrationFixture(fixture);
  assert.equal(result.stopObservation, 'NOT_OBSERVED');
  assert.deepEqual(stopComplianceRatio(result.stopObservation, 0, 0), {
    value: null,
    refusalReason: 'NOT_OBSERVED',
  });
  const plausibleWrongImplementation = (): number => 0;
  assert.notEqual(
    stopComplianceRatio(result.stopObservation, 0, 0).value,
    plausibleWrongImplementation(),
  );
  assert.equal(stopComplianceRatio('OBSERVED', 0, 2).value, 0);
  assert.equal(stopComplianceRatio('OBSERVED', 0, 0).refusalReason, 'NO_CERTAIN_OPPORTUNITIES');
});

test('the CLI accepts the valid corpus and rejects each corrupted row', () => {
  const validOutput = execFileSync(
    process.execPath,
    [
      '--import',
      './scripts/register-typescript.mjs',
      'scripts/validate-telemetry-fixtures.mjs',
      '--valid-only',
    ],
    { encoding: 'utf8' },
  );
  assert.match(validOutput, /summary valid=24 corrupted=0 failures=0/);
  assert.match(validOutput, /eligibility-free_traffic VALID/);

  const corruptedOutput = execFileSync(
    process.execPath,
    [
      '--import',
      './scripts/register-typescript.mjs',
      'scripts/validate-telemetry-fixtures.mjs',
      '--corrupted-only',
    ],
    { encoding: 'utf8' },
  );
  assert.match(
    corruptedOutput,
    /bad-non-monotonic-tick REJECTED reason=NON_MONOTONIC_TICK path=ticks\[2\]/,
  );
  assert.match(corruptedOutput, /summary valid=0 corrupted=11 failures=0/);
});

test('validation never mutates valid or corrupted fixture ownership', () => {
  const validBefore = structuredClone(validFixtures);
  const corruptedBefore = structuredClone(corruptedFixtures);
  for (const fixture of validFixtures) validateDemonstrationFixture(fixture);
  for (const fixture of corruptedFixtures) validateDemonstrationFixture(fixture);
  assert.deepEqual(validFixtures, validBefore);
  assert.deepEqual(corruptedFixtures, corruptedBefore);
});

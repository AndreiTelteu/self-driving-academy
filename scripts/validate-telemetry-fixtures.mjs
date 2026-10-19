import { corruptedFixtures, validFixtures } from '../tests/telemetry/fixtures/corpus.ts';
import {
  evaluateDemonstrationFixtureCorpus,
  validateDemonstrationFixture,
} from '../src/telemetry/demonstration-fixtures.ts';

const selection = process.argv[2] ?? 'all';
if (!['all', '--valid-only', '--corrupted-only'].includes(selection)) {
  process.stderr.write('Usage: validate-telemetry-fixtures.mjs [--valid-only|--corrupted-only]\n');
  process.exitCode = 2;
} else {
  const cases =
    selection === '--valid-only'
      ? validFixtures.map((fixture) => ({ fixture, expectedValid: true }))
      : selection === '--corrupted-only'
        ? corruptedFixtures.map((fixture) => ({ fixture, expectedValid: false }))
        : [
            ...validFixtures.map((fixture) => ({ fixture, expectedValid: true })),
            ...corruptedFixtures.map((fixture) => ({ fixture, expectedValid: false })),
          ];
  const outcomes = evaluateDemonstrationFixtureCorpus(cases, validateDemonstrationFixture);
  let failures = 0;
  for (let index = 0; index < cases.length; index += 1) {
    const fixture = cases[index].fixture;
    const outcome = outcomes[index];
    if (!outcome) throw new Error(`Missing validator result at index ${index}`);
    const { result, matchesExpectation } = outcome;
    if (!matchesExpectation) failures += 1;
    const reason = result.reasons[0];
    const suffix = reason ? ` reason=${reason.reasonCode} path=${reason.fieldPath}` : '';
    process.stdout.write(
      `${fixture.id} ${result.valid ? 'VALID' : 'REJECTED'}${suffix}${matchesExpectation ? '' : ' UNEXPECTED'}\n`,
    );
  }
  const validCount = cases.filter(({ expectedValid }) => expectedValid).length;
  const corruptedCount = cases.length - validCount;
  process.stdout.write(
    `summary valid=${validCount} corrupted=${corruptedCount} failures=${failures}\n`,
  );
  if (failures > 0) process.exitCode = 1;
}

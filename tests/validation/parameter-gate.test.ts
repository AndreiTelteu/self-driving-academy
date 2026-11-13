import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ambiguityConventions,
  evaluateParameterGate,
  parameterCapabilities,
} from '../../src/profiles/parameter-capabilities';
import type {
  CapabilityProbe,
  GateInput,
  ParameterCapability,
} from '../../src/profiles/parameter-capabilities';
import { parseParameterCatalog, parameterDefinitions, parameterRegistry } from '../../src/profiles';
import { ContractValidationError } from '../../src/sessions';

const root = fileURLToPath(new URL('../../', import.meta.url));
const catalogPath = join(root, 'Docs', 'driving-parameters.json');

function catalog() {
  return JSON.parse(readFileSync(catalogPath, 'utf8')) as {
    parameters: { key: string; unit: string }[];
  };
}

async function realProbe(): Promise<CapabilityProbe> {
  const symbols = new Map<string, boolean>();
  for (const capability of parameterCapabilities) {
    for (const declaration of [capability.policy, capability.estimator]) {
      if (declaration === null) continue;
      const cacheKey = `${declaration.module}#${declaration.symbol}`;
      if (symbols.has(cacheKey)) continue;
      const path = join(root, declaration.module);
      if (!existsSync(path)) {
        symbols.set(cacheKey, false);
        continue;
      }
      const module = await import(pathToFileURL(path).href);
      symbols.set(cacheKey, Object.hasOwn(module, declaration.symbol));
    }
  }
  return {
    moduleExports: (modulePath, symbol) => symbols.get(`${modulePath}#${symbol}`) === true,
    pathExists: (path) => existsSync(join(root, path)),
    fileContains: (path, text) => readFileSync(join(root, path), 'utf8').includes(text),
    readJson: (path) => JSON.parse(readFileSync(join(root, path), 'utf8')) as unknown,
  };
}

function gateInput(probe: CapabilityProbe): GateInput {
  return {
    definitions: parseParameterCatalog(catalog()).map((definition) => ({
      key: definition.key,
      unit: definition.unit,
      sourceUnit: definition.sourceUnit,
    })),
    capabilities: parameterCapabilities,
    probe,
    derived: parameterDefinitions.map((definition) => ({
      key: definition.key,
      implemented: definition.implemented,
      estimable: definition.estimable,
    })),
  };
}

function withCapabilities(
  input: GateInput,
  capabilities: readonly ParameterCapability[],
): GateInput {
  return { ...input, capabilities };
}

function replaceEntry(
  key: string,
  replace: (capability: ParameterCapability) => ParameterCapability,
): ParameterCapability[] {
  return parameterCapabilities.map((capability) =>
    capability.key === key ? replace(capability) : capability,
  );
}

function findingChecks(findings: readonly { check: string; key: string | null }[]): string[] {
  return findings.map((finding) => `${finding.check}:${finding.key ?? '-'}`);
}

test('the gate certifies 80/80 keys from the catalog, the modules, the evidence and the tests', async () => {
  const result = evaluateParameterGate(gateInput(await realProbe()));
  assert.deepEqual(result.findings, []);
  assert.equal(result.passed, true);
  assert.equal(result.keys.length, 80);
  assert.equal(result.keys.filter((entry) => entry.policy?.kind === 'CORE').length, 24);
  assert.equal(result.keys.filter((entry) => entry.policy?.kind === 'V2').length, 56);
  assert(result.keys.every((entry) => entry.estimator !== null));
  assert.equal(result.keys.filter((entry) => entry.effect.kind === 'MEASURED').length, 56);
  assert.equal(result.keys.filter((entry) => entry.effect.kind === 'PRESERVED_M').length, 24);
  assert.deepEqual(
    result.keys.map((entry) => entry.key),
    parseParameterCatalog(catalog()).map((definition) => definition.key),
  );
});

test('a declared key without a real consumer is rejected, never reported as a capability', async () => {
  const input = gateInput(await realProbe());

  const missingModule = evaluateParameterGate(
    withCapabilities(
      input,
      replaceEntry(input.capabilities[0].key, (capability) => ({
        ...capability,
        policy: {
          kind: 'V2',
          module: 'src/autonomy/__no-such-policy__.ts',
          symbol: 'evaluateMissing',
        },
      })),
    ),
  );
  assert.equal(missingModule.passed, false);
  assert(
    findingChecks(missingModule.findings).includes(
      `policy-consumer-missing:${input.capabilities[0].key}`,
    ),
  );
  assert.equal(
    missingModule.keys.find((entry) => entry.key === input.capabilities[0].key)?.policy?.symbol,
    'evaluateMissing',
  );

  const missingSymbol = evaluateParameterGate(
    withCapabilities(
      input,
      replaceEntry(input.capabilities[0].key, (capability) => ({
        ...capability,
        policy: {
          kind: 'CORE',
          module: 'src/autonomy/cruise-targets.ts',
          symbol: 'evaluateNoSuchKey',
        },
      })),
    ),
  );
  assert.equal(missingSymbol.passed, false);
  assert(
    findingChecks(missingSymbol.findings).includes(
      `policy-consumer-missing:${input.capabilities[0].key}`,
    ),
  );

  const missingEstimator = evaluateParameterGate(
    withCapabilities(
      input,
      replaceEntry(input.capabilities[0].key, (capability) => ({
        ...capability,
        estimator: { module: 'src/learning/__no-such-estimator__.ts', symbol: 'estimate' },
      })),
    ),
  );
  assert.equal(missingEstimator.passed, false);
  assert(
    findingChecks(missingEstimator.findings).includes(
      `estimator-missing:${input.capabilities[0].key}`,
    ),
  );

  const noEstimator = evaluateParameterGate(
    withCapabilities(
      input,
      replaceEntry(input.capabilities[0].key, (capability) => ({
        ...capability,
        estimator: null,
      })),
    ),
  );
  assert.equal(noEstimator.passed, false);
  assert(
    findingChecks(noEstimator.findings).includes(
      `registry-estimable-mismatch:${input.capabilities[0].key}`,
    ),
  );
});

test('the gate rejects missing evidence, missing tests, missing titles and missing variables', async () => {
  const input = gateInput(await realProbe());

  const missingEvidence = evaluateParameterGate(
    withCapabilities(
      input,
      replaceEntry('speed_delta_arterial', (capability) => ({
        ...capability,
        evidence: 'Docs/Evidence/000-missing-evidence/',
      })),
    ),
  );
  assert(findingChecks(missingEvidence.findings).includes('evidence-missing:speed_delta_arterial'));

  const missingTest = evaluateParameterGate(
    withCapabilities(
      input,
      replaceEntry('speed_delta_arterial', (capability) => ({
        ...capability,
        test: { path: 'tests/autonomy/__no-such-test__.test.ts', title: 'missing' },
      })),
    ),
  );
  assert(findingChecks(missingTest.findings).includes('test-missing:speed_delta_arterial'));

  const missingTitle = evaluateParameterGate(
    withCapabilities(
      input,
      replaceEntry('speed_delta_arterial', (capability) => ({
        ...capability,
        test: {
          path: 'tests/autonomy/speed-policy.test.ts',
          title: 'a title that does not exist in the file',
        },
      })),
    ),
  );
  assert(findingChecks(missingTitle.findings).includes('test-name-missing:speed_delta_arterial'));

  const missingScenario = evaluateParameterGate(
    withCapabilities(
      input,
      replaceEntry('speed_delta_arterial', (capability) => ({ ...capability, scenario: 'scurt' })),
    ),
  );
  assert(findingChecks(missingScenario.findings).includes('scenario-missing:speed_delta_arterial'));

  const missingKey = evaluateParameterGate(
    withCapabilities(
      input,
      parameterCapabilities.filter((capability) => capability.key !== 'speed_delta_arterial'),
    ),
  );
  assert.equal(missingKey.passed, false);
  assert(findingChecks(missingKey.findings).includes('capability-missing:speed_delta_arterial'));
  assert.equal(missingKey.keys.length, 79);
});

test('the gate rejects duplicate, unknown and unmeasured declarations', async () => {
  const input = gateInput(await realProbe());

  const duplicate = evaluateParameterGate(
    withCapabilities(input, [...parameterCapabilities, parameterCapabilities[0]]),
  );
  assert(findingChecks(duplicate.findings).includes('capability-duplicate:speed_delta_urban'));

  const unknown = evaluateParameterGate(
    withCapabilities(input, [
      ...parameterCapabilities,
      { ...parameterCapabilities[0], key: 'unknown_key' as never },
    ]),
  );
  assert(findingChecks(unknown.findings).includes('capability-unknown:unknown_key'));

  const unmeasuredProbe: CapabilityProbe = {
    ...input.probe,
    readJson: () => ({ effects: [] }),
  };
  const unmeasured = evaluateParameterGate({ ...input, probe: unmeasuredProbe });
  assert.equal(unmeasured.passed, false);
  assert(findingChecks(unmeasured.findings).includes('effect-missing:speed_delta_arterial'));
});

test('the registry derives implemented/estimable from the table; the JSON grants nothing', () => {
  for (const capability of parameterCapabilities) {
    const definition = parameterRegistry[capability.key];
    assert.equal(definition.implemented, capability.policy !== null, capability.key);
    assert.equal(definition.estimable, capability.estimator !== null, capability.key);
  }
  assert.equal(parameterDefinitions.filter((entry) => entry.implemented).length, 80);
  assert.equal(parameterDefinitions.filter((entry) => entry.estimable).length, 80);
  const parsed = parseParameterCatalog(catalog());
  assert(parsed.every((entry) => entry.implemented === false && entry.estimable === false));
  const withImplemented = catalog() as ReturnType<typeof catalog> & {
    parameters: { implemented?: boolean }[];
  };
  withImplemented.parameters[0].implemented = true;
  assert.throws(() => parseParameterCatalog(withImplemented), ContractValidationError);
  const withUnknownField = catalog() as ReturnType<typeof catalog> & {
    parameters: { estimable?: boolean }[];
  };
  withUnknownField.parameters[0].estimable = true;
  assert.throws(() => parseParameterCatalog(withUnknownField), ContractValidationError);
});

test('every ambiguity convention is derived from the catalog and anchored in a real test', async () => {
  const probe = await realProbe();
  const input = gateInput(probe);
  const result = evaluateParameterGate(input);
  assert.equal(result.conventions.length, ambiguityConventions.length);
  for (const convention of result.conventions) {
    assert(convention.keys.length > 0, convention.id);
    assert(existsSync(join(root, convention.anchor.path)), convention.id);
    assert(
      readFileSync(join(root, convention.anchor.path), 'utf8').includes(convention.anchor.title),
      convention.id,
    );
  }
  const keysOf = (id: string) =>
    result.conventions.find((convention) => convention.id === id)?.keys ?? [];
  assert.deepEqual(keysOf('speed-delta'), [
    'speed_delta_urban',
    'speed_delta_residential',
    'speed_delta_arterial',
  ]);
  assert.deepEqual(keysOf('event-penalty-seconds'), ['route_turn_penalty', 'route_signal_penalty']);
  assert.deepEqual(keysOf('route-share-weights'), ['route_time_weight', 'route_distance_weight']);
  assert.deepEqual(keysOf('route-congestion-sensitivity'), ['route_congestion_penalty']);
  assert.deepEqual(keysOf('upstream-line-offset'), ['red_stop_line_offset', 'stop_line_offset']);
  assert.deepEqual(keysOf('occupied-scale-factor'), [
    'occupied_acceleration_scale',
    'occupied_lateral_accel_scale',
  ]);
  assert.deepEqual(keysOf('approach-speed-ceiling'), [
    'intersection_approach_speed',
    'turn_entry_speed',
    'crosswalk_approach_speed',
    'pickup_approach_speed',
    'dropoff_approach_speed',
  ]);
  const probabilities = parseParameterCatalog(catalog())
    .filter((definition) => definition.unit === 'probability')
    .map((definition) => definition.key);
  assert.equal(probabilities.length, 10);
  assert.deepEqual(keysOf('probability-per-opportunity'), probabilities);
});

test('the committed gate report is current and reproducible', () => {
  execFileSync(
    process.execPath,
    [
      '--import',
      './scripts/register-typescript.mjs',
      'scripts/run-v2-parameter-gate.mjs',
      '--check',
    ],
    { cwd: root, encoding: 'utf8' },
  );
});

test('a key whose capability is granted by the catalog alone stays impossible to publish', () => {
  const definition = parameterRegistry.speed_delta_arterial;
  assert.equal(definition.implemented, true);
  assert.equal(definition.estimable, true);
  const catalogEntry = parameterDefinitions.find((entry) => entry.key === 'speed_delta_arterial');
  assert.equal(catalogEntry?.implemented, true);
  const parsed = parseParameterCatalog(catalog()).find(
    (entry) => entry.key === 'speed_delta_arterial',
  );
  assert.equal(parsed?.implemented, false);
  assert.equal(parsed?.estimable, false);
});

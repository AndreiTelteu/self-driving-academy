import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Gate 187: every one of the 80 catalog keys must have a declared, verified policy consumer,
 * estimator, evidence document and independent test. The gate is derived from the catalog and
 * fails closed: a declared key without a real consumer is a failure, never a warning.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = 'Docs/driving-parameters.json';
const directory = join(root, 'Docs', 'Evidence', '187-v2-parameter-gate');
const jsonPath = join(directory, 'report.json');
const markdownPath = join(directory, 'report.md');
const evidenceReadme = join(directory, 'README.md');

const profiles = await import(pathToFileURL(join(root, 'src', 'profiles', 'index.ts')).href);
const capabilities = await import(
  pathToFileURL(join(root, 'src', 'profiles', 'parameter-capabilities.ts')).href
);

const catalog = JSON.parse(readFileSync(join(root, catalogPath), 'utf8'));
const definitions = profiles.parseParameterCatalog(catalog);

const exportCache = new Map();
async function moduleExports(modulePath, symbol) {
  const cacheKey = `${modulePath}#${symbol}`;
  if (!exportCache.has(cacheKey)) {
    let exported = false;
    if (existsSync(join(root, modulePath))) {
      const module = await import(pathToFileURL(join(root, modulePath)).href);
      exported = Object.hasOwn(module, symbol);
    }
    exportCache.set(cacheKey, exported);
  }
  return exportCache.get(cacheKey);
}

const uniqueSymbols = new Map();
for (const capability of capabilities.parameterCapabilities) {
  for (const declaration of [capability.policy, capability.estimator]) {
    if (declaration === null) continue;
    uniqueSymbols.set(`${declaration.module}#${declaration.symbol}`, declaration);
  }
}
for (const declaration of uniqueSymbols.values()) {
  await moduleExports(declaration.module, declaration.symbol);
}

const probe = {
  moduleExports: (modulePath, symbol) => exportCache.get(`${modulePath}#${symbol}`) === true,
  pathExists: (path) => existsSync(join(root, path)),
  fileContains: (path, text) => readFileSync(join(root, path), 'utf8').includes(text),
  readJson: (path) => JSON.parse(readFileSync(join(root, path), 'utf8')),
};

const derived = profiles.parameterDefinitions.map((definition) => ({
  key: definition.key,
  implemented: definition.implemented,
  estimable: definition.estimable,
}));

const gateInput = {
  definitions: definitions.map((definition) => ({
    key: definition.key,
    unit: definition.unit,
    sourceUnit: definition.sourceUnit,
  })),
  capabilities: capabilities.parameterCapabilities,
  probe,
  derived,
};

const result = capabilities.evaluateParameterGate(gateInput);

// Fail-closed probes: the same evaluator must reject a declared key that has no real consumer.
const declaredWithoutConsumer = capabilities.parameterCapabilities.map((capability) =>
  capability.key === definitions[0].key
    ? {
        ...capability,
        policy: {
          kind: 'V2',
          module: 'src/autonomy/__missing_case_sensitivity_probe__.ts',
          symbol: 'evaluateMissing',
        },
      }
    : capability,
);
const missingConsumerResult = capabilities.evaluateParameterGate({
  ...gateInput,
  capabilities: declaredWithoutConsumer,
});
const missingEntryResult = capabilities.evaluateParameterGate({
  ...gateInput,
  capabilities: capabilities.parameterCapabilities.filter(
    (capability) => capability.key !== definitions[0].key,
  ),
});
const probes = [
  {
    id: 'declared-key-without-consumer',
    passed: missingConsumerResult.findings.some(
      (finding) =>
        finding.check === 'policy-consumer-missing' && finding.key === definitions[0].key,
    ),
    detail: 'a declared key with a missing policy module is rejected',
  },
  {
    id: 'catalog-key-without-declaration',
    passed: missingEntryResult.findings.some(
      (finding) => finding.check === 'capability-missing' && finding.key === definitions[0].key,
    ),
    detail: 'a catalog key without a capability declaration is rejected',
  },
];

const findingsFor = (...checks) =>
  result.findings.filter((finding) => checks.includes(finding.check));
const pass = (findings) => findings.length === 0;

const fullClosed = definitions.every(
  (definition) => definition.implemented === false && definition.estimable === false,
);
const core = result.keys.filter((entry) => entry.policy?.kind === 'CORE').length;
const v2 = result.keys.filter((entry) => entry.policy?.kind === 'V2').length;
const measured = result.keys.filter((entry) => entry.effect.kind === 'MEASURED').length;
const preserved = result.keys.filter((entry) => entry.effect.kind === 'PRESERVED_M').length;

const checks = [
  {
    id: 'catalog-schema',
    passed: definitions.length === 80,
    detail: `${definitions.length} catalog definitions, 24 M targets, SI units`,
  },
  {
    id: 'catalog-fail-closed',
    passed: fullClosed,
    detail: 'the catalog JSON grants no implemented/estimable capability; only the table does',
  },
  {
    id: 'capability-table',
    passed: pass(findingsFor('capability-missing', 'capability-unknown', 'capability-duplicate')),
    detail: `${result.keys.length}/80 keys declared once, exactly the catalog keys`,
  },
  {
    id: 'policy-consumers',
    passed: pass(findingsFor('policy-consumer-missing', 'policy-kind-invalid')),
    detail: `${core} CORE (046-053) + ${v2} V2 policy consumers exist and export the declared symbol`,
  },
  {
    id: 'estimators',
    passed: pass(findingsFor('estimator-missing')),
    detail: `${result.keys.filter((entry) => entry.estimator !== null).length} estimators declared, ${result.keys.length - result.keys.filter((entry) => entry.estimator !== null).length} NONE`,
  },
  {
    id: 'evidence',
    passed: pass(findingsFor('evidence-missing')),
    detail: 'every key points at an existing evidence document',
  },
  {
    id: 'independent-tests',
    passed: pass(findingsFor('test-missing', 'test-name-missing')),
    detail: 'every key points at an existing test whose declared title exists in the file',
  },
  {
    id: 'scenarios-and-effects',
    passed: pass(findingsFor('scenario-missing', 'effect-missing', 'effect-invalid')),
    detail: `${measured} keys with a measured effect row, ${preserved} M keys with a preserved 046-053 regression effect`,
  },
  {
    id: 'registry-derivation',
    passed: pass(
      findingsFor(
        'registry-size-mismatch',
        'registry-key-missing',
        'registry-implemented-mismatch',
        'registry-estimable-mismatch',
      ),
    ),
    detail: 'the registry derives implemented/estimable from this table, not from the JSON',
  },
  {
    id: 'canonical-conventions',
    passed: pass(
      findingsFor(
        'convention-empty',
        'convention-anchor-missing',
        'convention-anchor-title-missing',
      ),
    ),
    detail: `${result.conventions.length} ambiguity conventions derived from the catalog`,
  },
  {
    id: 'fail-closed-probes',
    passed: probes.every((probeResult) => probeResult.passed),
    detail: probes
      .map((probeResult) => `${probeResult.id}:${probeResult.passed ? 'rejected' : 'ACCEPTED'}`)
      .join(', '),
  },
  {
    id: 'evidence-document',
    passed: existsSync(evidenceReadme),
    detail: 'the gate evidence document exists',
  },
];

const verdict = result.passed && checks.every((check) => check.passed) ? 'PASS' : 'FAIL';
const total = `${result.keys.length}/80`;

function formatNumber(value) {
  if (!Number.isFinite(value)) return String(value);
  const rounded = Number(value.toFixed(6));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function effectCell(effect) {
  if (effect.kind === 'MEASURED') {
    return `${formatNumber(effect.lowValue)} → ${formatNumber(effect.highValue)} ${effect.unit}: ${formatNumber(effect.lowOutcome)} → ${formatNumber(effect.highOutcome)} (Δ ${formatNumber(effect.difference)})`;
  }
  return `M păstrat: ${effect.title}`;
}

function anchorCell(anchor) {
  return `\`${anchor.path}\` — ${anchor.title}`;
}

function policyCell(policy) {
  return policy === null ? 'NONE' : `${policy.kind} \`${policy.module}\` → \`${policy.symbol}\``;
}

function estimatorCell(estimator) {
  return estimator === null ? 'NONE' : `\`${estimator.module}\` → \`${estimator.symbol}\``;
}

const markdown = [
  '# Poarta de validare a celor 80 de parametri (PBI 187)',
  '',
  '> Fișier generat determinist de `npm run validate:parameters`. Nu edita manual.',
  '',
  `**Verdict: ${verdict}** — ${total} chei cu politică, dovezi și test independent. ` +
    `${core} chei CORE livrate de 046–053, ${v2} chei V2 livrate de 167–186, ` +
    `${result.keys.filter((entry) => entry.estimator !== null).length} estimatori.`,
  '',
  '## Verificările porții',
  '',
  '| Verificare | Rezultat | Detaliu |',
  '| --- | --- | --- |',
  ...checks.map(
    (check) => `| \`${check.id}\` | ${check.passed ? 'PASS' : 'FAIL'} | ${check.detail} |`,
  ),
  '',
  '## Convențiile canonice ale ambiguităților',
  '',
  '| Convenție | Chei acoperite | Regula canonică | Ancoră |',
  '| --- | --- | --- | --- |',
  ...result.conventions.map(
    (convention) =>
      `| \`${convention.id}\` | ${convention.keys.map((key) => `\`${key}\``).join(', ')} | ${convention.statement} | ${anchorCell(convention.anchor)} |`,
  ),
  '',
  '## Cele 80 de chei',
  '',
  '| # | Cheie | Politică | Estimator | Scenariu | Efect verificat | Dovezi | Test independent |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...result.keys.map(
    (entry, index) =>
      `| ${index + 1} | \`${entry.key}\` | ${policyCell(entry.policy)} | ${estimatorCell(entry.estimator)} | ${entry.scenario} | ${effectCell(entry.effect)} | \`${entry.evidence}\` | ${anchorCell(entry.test)} |`,
  ),
  '',
  '## Probe fail-closed',
  '',
  '| Probă | Rezultat | Detaliu |',
  '| --- | --- | --- |',
  ...probes.map(
    (probeResult) =>
      `| \`${probeResult.id}\` | ${probeResult.passed ? 'RESPINS' : 'ACCEPTAT'} | ${probeResult.detail} |`,
  ),
  '',
  '## Findings',
  '',
  ...(result.findings.length === 0
    ? ['Niciun finding: poarta a trecut pentru toate cele 80 de chei.']
    : result.findings.map(
        (finding) => `- \`${finding.check}\` ${finding.key ?? ''}: ${finding.message}`,
      )),
  '',
  '## Comenzi',
  '',
  '```bash',
  'npm run validate:parameters',
  'npm run validate:parameters -- --check',
  'node --import ./scripts/register-typescript.mjs --test tests/validation/parameter-gate.test.ts',
  '```',
  '',
].join('\n');

const report = {
  version: '187-v2-parameter-gate-v1',
  catalog: {
    path: catalogPath,
    keys: definitions.length,
    initialLearningTargets: definitions.filter(
      (definition) => definition.implementationStage === 'initial_learning_target',
    ).length,
  },
  capability: {
    declared: result.keys.length,
    core,
    v2,
    estimators: result.keys.filter((entry) => entry.estimator !== null).length,
    nonePolicy: result.keys.filter((entry) => entry.policy === null).length,
    noneEstimator: result.keys.filter((entry) => entry.estimator === null).length,
    measuredEffects: measured,
    preservedMEffects: preserved,
  },
  checks,
  probes,
  conventions: result.conventions,
  keys: result.keys,
  findings: result.findings,
  verdict,
  summary: `${total} keys with policy, evidence and independent test`,
};

const json = `${JSON.stringify(report, null, 2)}\n`;

if (process.argv.includes('--check')) {
  const savedJson = readFileSync(jsonPath, 'utf8');
  if (savedJson !== json) {
    console.error(`Parameter gate report is stale: ${jsonPath}`);
    process.exitCode = 1;
  } else console.log(`Parameter gate report is current: ${jsonPath}`);
  const savedMarkdown = readFileSync(markdownPath, 'utf8');
  if (savedMarkdown !== markdown) {
    console.error(`Parameter gate markdown is stale: ${markdownPath}`);
    process.exitCode = 1;
  } else console.log(`Parameter gate markdown is current: ${markdownPath}`);
} else {
  writeFileSync(jsonPath, json);
  writeFileSync(markdownPath, markdown);
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${markdownPath}`);
}

for (const check of checks)
  console.log(`${check.passed ? 'PASS' : 'FAIL'} CHECK ${check.id} (${check.detail})`);
for (const finding of result.findings)
  console.log(`FAIL FINDING ${finding.check} ${finding.key ?? '-'}: ${finding.message}`);
console.log(
  `SUMMARY ${total} keys, ${result.keys.length} declared, ${result.findings.length} findings, verdict ${verdict}`,
);

if (verdict !== 'PASS' || checks.some((check) => !check.passed)) process.exitCode = 1;

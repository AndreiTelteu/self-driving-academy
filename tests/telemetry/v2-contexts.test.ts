import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  evaluateV2ContextScenario,
  getV2Context,
  parseV2ContextScenario,
  readV2FrameFacets,
  v1ParameterKeys,
  v2ContextCatalogValidation,
  v2ContextCategories,
  v2ContextCoverage,
  v2ContextDefinitions,
  v2ContextFacets,
  v2ContextKeys,
  v2ContextsByCategory,
  V1_COMPATIBILITY,
  V2_CONTROL_SCENARIO_ID,
  V2_CONTEXT_VERSION,
} from '../../src/telemetry/index.ts';
import { getParameterDefinition, parameterDefinitions } from '../../src/profiles/index.ts';
import {
  runV2ContextReport,
  v2ContextDigest,
  v2ContextScenarios,
  v2ControlScenario,
} from './v2-contexts-suite.ts';
import { resetV2EventSequence, v2Event, v2Frame, v2Scenario } from './v2-contexts-fixtures.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const evidenceDirectory = join(root, 'Docs', 'Evidence', '163-v2-contexts');

test('catalogul acoperă exact cele 56 de chei R din catalogul real', () => {
  const catalogKeys = parameterDefinitions
    .filter((entry) => entry.implementationStage === 'extension')
    .map((entry) => entry.key)
    .sort();
  assert.equal(catalogKeys.length, 56);
  assert.deepEqual([...v2ContextKeys].sort(), catalogKeys);
  assert.equal(v2ContextCatalogValidation.valid, true);
  const coverage = v2ContextCoverage();
  assert.equal(coverage.keys, 56);
  assert.equal(coverage.categories, 10);
  assert.equal(coverage.v1Keys, 24);
  assert.deepEqual(
    coverage.perCategory.map((entry) => [entry.category, entry.keys]),
    [
      ['SPEED', 4],
      ['LONGITUDINAL', 4],
      ['FOLLOWING', 4],
      ['SIGNALS', 4],
      ['STOP_PRIORITY', 4],
      ['LANE_CHANGE', 4],
      ['LATERAL', 8],
      ['ROUTING', 8],
      ['HAZARDS', 8],
      ['SERVICE', 8],
    ],
  );
  assert.equal(
    coverage.perCategory.reduce((total, entry) => total + entry.keys, 0),
    56,
  );
});

test('fiecare context are etichetă, scenariu reprezentativ și date de manual', () => {
  for (const entry of v2ContextDefinitions) {
    const definition = getParameterDefinition(entry.key);
    assert.equal(definition.implementationStage, 'extension');
    assert.ok(entry.label.length >= 10, `${entry.key}: etichetă prea scurtă`);
    assert.ok(entry.contextId.startsWith('v2c-'), `${entry.key}: contextId instabil`);
    assert.ok(entry.requires.length > 0, `${entry.key}: fără fapte observabile`);
    for (const facet of entry.requires)
      assert.ok((v2ContextFacets as readonly string[]).includes(facet), `${entry.key}: ${facet}`);
    assert.ok(entry.manual.setup.length >= 20, `${entry.key}: setup incomplet`);
    assert.ok(entry.manual.action.length >= 20, `${entry.key}: action incomplet`);
    assert.ok(entry.manual.evidence.length >= 20, `${entry.key}: evidence incomplet`);
  }
  assert.equal(v2ContextDefinitions.length, 56);
});

test('cheile V1 și pragurile lor rămân neatinse, iar dovezile V1 există', async () => {
  const catalogKeys = parameterDefinitions
    .filter((entry) => entry.implementationStage === 'initial_learning_target')
    .map((entry) => entry.key)
    .sort();
  assert.deepEqual([...v1ParameterKeys].sort(), catalogKeys);
  assert.equal(v1ParameterKeys.length, 24);
  const v2Keys = new Set(v2ContextKeys);
  assert.equal(v1ParameterKeys.filter((key) => v2Keys.has(key as string)).length, 0);
  assert.deepEqual(V1_COMPATIBILITY.renamedKeys, []);
  assert.deepEqual(V1_COMPATIBILITY.changedThresholds, []);
  assert.match(V1_COMPATIBILITY.migration, /^none/);
  for (const key of v1ParameterKeys) {
    const definition = getParameterDefinition(key);
    assert.equal(definition.implementationStage, 'initial_learning_target');
    assert.ok(definition.min <= definition.default && definition.default <= definition.max);
  }
  for (const relative of V1_COMPATIBILITY.evidencePreserved) {
    const raw = await readFile(join(root, relative), 'utf8');
    assert.ok(raw.length > 0, `${relative} este gol`);
    JSON.parse(raw);
  }
});

test('o cheie inexistentă sau o cheie V1 este refuzată explicit', () => {
  assert.throws(() => getV2Context('not_a_catalog_key'), /Unknown V2 context key/);
  assert.throws(() => getV2Context('following_time_headway'), /Unknown V2 context key/);
  assert.equal(getV2Context('lane_center_offset').category, 'LATERAL');
  assert.equal(getV2Context('lane_center_offset').opportunityKind, null);
});

test('fiecare categorie R are un scenariu reprezentativ, cu toate cheile observabile', () => {
  const evaluations = v2ContextScenarios().map((scenario) => evaluateV2ContextScenario(scenario));
  assert.equal(evaluations.length, 10);
  for (const evaluation of evaluations) {
    assert.ok(evaluation.category !== null);
    const expectedKeys = v2ContextsByCategory(evaluation.category).length;
    assert.equal(evaluation.categoryKeys, expectedKeys, `${evaluation.category}: număr de chei`);
    assert.deepEqual(evaluation.missingKeys, [], `${evaluation.category}: chei neobservabile`);
    assert.deepEqual(evaluation.failedTriggers, [], `${evaluation.category}: triggeri lipsă`);
    assert.equal(evaluation.observableKeys, expectedKeys);
    for (const entry of evaluation.keys.filter((key) => key.category === evaluation.category)) {
      assert.equal(entry.observable, true, `${entry.key}: nu este observabil`);
      assert.ok(entry.observableFrames >= 1, `${entry.key}: zero cadre observabile`);
      assert.ok(entry.firstObservableTick !== null, `${entry.key}: fără tick de observare`);
    }
    assert.equal(evaluation.representative, true, `${evaluation.category}: nereprezentativ`);
  }
  const categories = new Set(evaluations.map((evaluation) => evaluation.category));
  assert.deepEqual([...categories], [...v2ContextCategories]);
});

test('toate cele 56 de chei sunt observabile în scenariul lor, nu doar pe categorii', () => {
  const evaluations = v2ContextScenarios().map((scenario) => evaluateV2ContextScenario(scenario));
  const byKey = new Map(
    evaluations.flatMap((evaluation) =>
      evaluation.keys
        .filter((entry) => entry.category === evaluation.category)
        .map((entry) => [entry.key, entry] as const),
    ),
  );
  assert.equal(byKey.size, 56);
  for (const entry of v2ContextDefinitions) {
    const result = byKey.get(entry.key);
    assert.ok(result !== undefined, `${entry.key}: lipsește din evaluare`);
    assert.equal(result!.observable, true, `${entry.key}: nu apare în niciun cadru`);
    assert.equal(result!.contextId, entry.contextId);
    assert.equal(result!.label, entry.label);
  }
});

test('controlul negativ nu produce contexte reprezentative', () => {
  const scenario = v2ControlScenario();
  const evaluation = evaluateV2ContextScenario(scenario);
  assert.equal(evaluation.scenarioId, V2_CONTROL_SCENARIO_ID);
  assert.equal(evaluation.category, null);
  assert.equal(evaluation.representative, false);
  assert.equal(evaluation.observableKeys, 0);
  assert.equal(evaluation.categoryKeys, 56);
  assert.ok(
    evaluation.keys.every((entry) => entry.observable === false),
    'controlul nu are voie să declare chei observabile',
  );
  assert.ok(scenario.frames.length >= 3);
});

test('faptele sunt derivate din contracte: fiecare cadru expune facetul cerut', () => {
  const scenario = v2ContextScenarios().find((entry) => entry.category === 'LATERAL')!;
  const first = scenario.frames[0]!;
  const facets = readV2FrameFacets(first);
  assert.ok(facets.has('CURVATURE'));
  assert.ok(facets.has('STEERING_INPUT'));
  assert.ok(facets.has('LATERAL_ACCEL'));
  assert.ok(facets.has('SPEED_MEASURED'));
  const signals = v2ContextScenarios().find((entry) => entry.category === 'SIGNALS')!;
  const redFrame = signals.frames[0]!;
  assert.ok(readV2FrameFacets(redFrame).has('SIGNAL_RED'));
  assert.ok(readV2FrameFacets(redFrame).has('STOP_LINE'));
});

test('scenariile resping tick-uri inconsistente și regresia de tick', () => {
  resetV2EventSequence();
  const sampleTickMismatch = {
    scenarioId: 'bad-tick',
    category: 'SPEED',
    title: 'ticks greșite',
    frames: [v2Frame(100), { ...v2Frame(160), sample: v2Frame(150).sample }],
  };
  assert.throws(
    () => parseV2ContextScenario(sampleTickMismatch),
    /V2 frame tick does not match its sample/,
  );
  const eventTickMismatch = {
    scenarioId: 'bad-event',
    category: 'SIGNALS',
    title: 'eveniment greșit',
    frames: [
      v2Frame(100, {
        events: [
          v2Event(
            99,
            'SIGNAL_PHASE_CHANGED',
            {
              signalId: 'sig-1',
              intersectionId: 'int-1',
              fromPhaseId: 'a',
              toPhaseId: 'b',
              movementStates: [{ movementId: 'movement-1', state: 'GREEN' }],
            },
            ['sig-1'],
          ),
        ],
      }),
    ],
  };
  assert.throws(
    () => parseV2ContextScenario(eventTickMismatch),
    /V2 frame event tick does not match the frame/,
  );
  resetV2EventSequence();
  assert.throws(
    () => v2Scenario('regression', 'SPEED', 'regresie', [v2Frame(200), v2Frame(100)]),
    /V2 scenario ticks must increase/,
  );
});

test('raportul este determinist și acoperă 56/56 chei în 10/10 categorii', async () => {
  const first = await runV2ContextReport();
  const second = await runV2ContextReport();
  assert.equal(first.reproducibility.digest, second.reproducibility.digest);
  assert.equal(await v2ContextDigest(), first.reproducibility.digest);
  assert.equal(first.version, V2_CONTEXT_VERSION);
  assert.equal(first.summary.pass, true);
  assert.equal(first.summary.keys, 56);
  assert.equal(first.summary.coveredKeys, 56);
  assert.equal(first.summary.categories, 10);
  assert.equal(first.summary.representativeCategories, 10);
  assert.equal(first.summary.representativeScenarios, 10);
  assert.equal(first.summary.controlObservableKeys, 0);
  assert.equal(first.contextTable.length, 56);
  assert.equal(first.v1Compatibility.protectedKeys, 24);
  assert.equal(first.v1Compatibility.disjointFromR, true);
  assert.ok(first.v1Compatibility.evidence.every((entry) => entry.present));
  assert.equal(first.control.scenarioId, V2_CONTROL_SCENARIO_ID);
});

test('raportul comis în dovezi corespunde rulării curente', async () => {
  const committed = JSON.parse(
    await readFile(join(evidenceDirectory, 'report.json'), 'utf8'),
  ) as Awaited<ReturnType<typeof runV2ContextReport>>;
  const fresh = await runV2ContextReport();
  assert.equal(committed.reproducibility.digest, fresh.reproducibility.digest);
  assert.deepEqual(committed.summary, fresh.summary);
  assert.equal(committed.contextTable.length, 56);
});

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { EARLY_LOOP_KEYS } from '../src/learning/early-loop.ts';
import {
  EARLY_LOOP_ACTORS,
  EARLY_LOOP_FIXTURE_VERSION,
  STYLE_TOLERANCE,
  canonicalStopSample,
  runEarlyLoopDemo,
} from '../tests/harness/early-loop-204-fixture.ts';

const outputDirectory = 'Docs/Evidence/204-early-learning-demo/behavior';
const inputs = [
  'scripts/run-204-early-loop-behavior.mjs',
  'tests/harness/early-loop-204-fixture.ts',
  'tests/learning/early-loop-behavior.test.ts',
  'src/learning/early-loop.ts',
  'src/learning/parameter-evidence.ts',
  'src/learning/speed-estimator.ts',
  'src/learning/acceleration-estimator.ts',
  'src/learning/stop-yield-estimator.ts',
  'src/autonomy/cruise-targets.ts',
  'src/autonomy/longitudinal-control.ts',
  'src/autonomy/stop-policy.ts',
];
const hash = createHash('sha256');
for (const file of inputs) hash.update(file).update(readFileSync(file));

const demo = runEarlyLoopDemo();
const baseKeys = Object.keys(demo.baseProfile.parameters);

function valuesOf(run) {
  return Object.fromEntries(
    EARLY_LOOP_KEYS.map((key) => {
      const value = run.composed.values[key];
      return [
        key,
        {
          base: value.base,
          candidate: value.candidate,
          blended: value.value,
          blend: value.blend,
          quality: value.quality,
          sourceEpisodeCount: value.sourceEpisodeCount,
          unchangedReason: value.unchangedReason,
          segmentIds: value.source.segmentIds,
          opportunityIds: value.source.opportunityIds,
        },
      ];
    }),
  );
}

function tokensOf(run) {
  return {
    autoAvailable: true,
    profileId: run.tokens.profile.profileId,
    versionId: run.tokens.profile.versionId,
    parametersEqualBase: baseKeys.every(
      (key) => run.tokens.profile.parameters[key] === demo.baseProfile.parameters[key],
    ),
    cruiseSpeedDeltaUrban: run.tokens.cruise.values.speed_delta_urban,
    longitudinalDesiredAcceleration: run.tokens.longitudinal.values.desired_acceleration,
    stopFullProbability: run.tokens.stop.stopFullProbability,
    stopDwellTimeS: run.tokens.stop.stopDwellTimeS,
    stopLineOffsetM: run.tokens.stop.stopLineOffsetM,
    provenance: Object.fromEntries(
      EARLY_LOOP_KEYS.map((key) => [key, run.tokens.profile.provenanceByParameter[key]]),
    ),
  };
}

function scenarioOf(run) {
  return {
    id: run.id,
    selectedKeys: run.selectedKeys,
    evidence: run.evidence,
    candidates: run.candidates,
    values: valuesOf(run),
    tokens: tokensOf(run),
    actors: run.actors,
    stop: {
      canonical: run.stop.canonical,
      rate: run.stop.rate,
      actors: run.stop.actors,
    },
  };
}

const stopSample = canonicalStopSample();
const report = {
  schemaVersion: 1,
  label: 'EXECUTED_NATIVE_FIXTURE',
  fixture: EARLY_LOOP_FIXTURE_VERSION,
  generatedAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash: hash.digest('hex'),
  inputs,
  runtime: {
    node: process.version,
    platform: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model ?? null,
    logicalCpus: cpus().length,
    ramBytes: totalmem(),
  },
  scope:
    '3 taxis + 2 civilians on the authored 044 road context; 093 ledger -> 094/095/098 estimators -> composeEarlyLoopProfile -> compileEarlyLoopControllerProfiles -> 046 cruise target / 047 longitudinal / 051 stop policy; deterministic native fixture, no renderer, no Rapier, no participant data',
  tolerances: {
    numericStyle: STYLE_TOLERANCE,
    stopRole: 'exact equality for the same seed and opportunity',
    profileParameterDelta: 0,
  },
  baseProfile: {
    profileId: demo.baseProfile.profileId,
    versionId: demo.baseProfile.versionId,
    parameters: demo.baseProfile.parameters,
    earlyKeys: Object.fromEntries(
      EARLY_LOOP_KEYS.map((key) => [key, demo.baseProfile.parameters[key]]),
    ),
  },
  stopSample,
  baseBehavior: demo.base,
  scenarios: Object.fromEntries(
    ['prudent', 'risky', 'no-evidence'].map((id) => [id, scenarioOf(demo.scenarios[id])]),
  ),
  mixed: Object.fromEntries(EARLY_LOOP_KEYS.map((key) => [key, scenarioOf(demo.mixed[key])])),
  manual: {
    earlyLoop: demo.manual.earlyLoop,
    controllerTokens: demo.manual.controllerTokens,
    evidenceEpisodes: demo.manual.evidenceEpisodes,
    profileUnchanged: demo.manual.profileUnchanged,
    maximumParameterDelta: demo.manual.maximumParameterDelta,
    before: demo.manual.before,
    after: demo.manual.after,
  },
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(`${outputDirectory}/driver.json`, `${JSON.stringify(report, null, 2)}\n`);

const percent = (value) => `${(value * 100).toFixed(1)}%`;
const number = (value) => (value === null ? 'null' : String(value));
const lines = [
  '# PBI 204 native behavioural driver',
  '',
  `Label: \`EXECUTED_NATIVE_FIXTURE\`. Fixture: \`${EARLY_LOOP_FIXTURE_VERSION}\`. Commit: \`${report.commit}\`.`,
  '',
  'Real chain: 093 ledger -> 094/095/098 estimators -> `composeEarlyLoopProfile` -> `compileEarlyLoopControllerProfiles` -> 046 cruise target / 047 longitudinal / 051 stop policy, on the authored 044 road context with three taxis and two civilians. No renderer, Rapier, browser or participant data is involved.',
  '',
  '## Blended values',
  '',
  '| Set | Key | Evidence | Episodes | Candidate | Quality | Base | Blended | Blend |',
  '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
];
for (const id of ['prudent', 'risky', 'no-evidence']) {
  const scenario = report.scenarios[id];
  for (const key of EARLY_LOOP_KEYS) {
    const value = scenario.values[key];
    const evidence = scenario.evidence.find((row) => row.key === key);
    lines.push(
      `| ${id} | \`${key}\` | ${evidence.status} | ${evidence.distinctEpisodes} | ${number(value.candidate)} | ${value.quality} | ${value.base} | ${value.blended} | ${value.blend} |`,
    );
  }
}
lines.push(
  '',
  '## Behavioural effect',
  '',
  '| Set | 046 target (m/s) | 047 acceleration (m/s2) | 051 canonical | 051 full-stop rate |',
  '| --- | ---: | ---: | --- | ---: |',
);
for (const id of ['prudent', 'risky', 'no-evidence']) {
  const scenario = report.scenarios[id];
  lines.push(
    `| ${id} | ${scenario.actors[0].targetMps} | ${scenario.actors[0].accelerationMps2} | ${scenario.stop.canonical.action} / ${scenario.stop.canonical.role} | ${scenario.stop.rate.full}/${scenario.stop.rate.total} (${percent(scenario.stop.rate.fullRate)}) |`,
  );
}
lines.push(
  '',
  `Base profile (no early tokens): 046 target ${report.baseBehavior.actors[0].targetMps} m/s, 047 acceleration ${report.baseBehavior.actors[0].accelerationMps2} m/s2, 051 full-stop rate ${report.baseBehavior.stop.rate.full}/${report.baseBehavior.stop.rate.total} (${percent(report.baseBehavior.stop.rate.fullRate)}).`,
  '',
  '## Same style on all five actors',
  '',
  '| Set | Actor | Kind | Class | 046 target | 047 acceleration | 051 probability | 051 canonical role |',
  '| --- | --- | --- | --- | ---: | ---: | ---: | --- |',
);
for (const id of ['prudent', 'risky', 'no-evidence']) {
  const scenario = report.scenarios[id];
  for (const actor of scenario.actors) {
    const outcome = scenario.stop.actors.find((row) => row.actorId === actor.actorId);
    lines.push(
      `| ${id} | ${actor.actorId} | ${actor.kind} | ${actor.classId} | ${actor.targetMps} | ${actor.accelerationMps2} | ${outcome.probability} | ${outcome.role} |`,
    );
  }
}
lines.push(
  '',
  `Tolerance: numeric style values must agree within ${STYLE_TOLERANCE}; STOP outcomes use the same seed (${stopSample.seed}) and opportunity, so the role must match exactly. Sedan and compact mechanics change the throttle command, not the learned style.`,
  '',
  '## MANUAL',
  '',
  `- \`earlyLoopForMode('MANUAL', ...)\`: ${report.manual.earlyLoop}`,
  `- \`compileEarlyLoopControllerProfiles('MANUAL', ...)\`: ${report.manual.controllerTokens}`,
  `- Evidence episodes observed in MANUAL: ${report.manual.evidenceEpisodes}`,
  `- Profile values before/after identical: ${report.manual.profileUnchanged}`,
  `- Maximum parameter delta: ${report.manual.maximumParameterDelta}`,
  '',
  '## No evidence',
  '',
  '| Key | Candidate | Blend | Blended value | Base |',
  '| --- | --- | ---: | ---: | ---: |',
);
for (const key of EARLY_LOOP_KEYS) {
  const value = report.scenarios['no-evidence'].values[key];
  lines.push(
    `| \`${key}\` | ${number(value.candidate)} | ${value.blend} | ${value.blended} | ${value.base} |`,
  );
}
lines.push(
  '',
  'AUTO with no evidence is numerically identical to the base profile: every parameter, unit and provenance entry matches, and the five actors reproduce the base 046/047/051 outputs. The compiled `versionId` still carries the in-memory `-204-early` suffix; that is an identity marker, not a value change.',
  '',
  '## Mixed evidence (unchanged-key guard)',
  '',
  '| Demonstrated key | 046 target | 047 acceleration | 051 full count | Unchanged keys |',
  '| --- | ---: | ---: | ---: | --- |',
);
for (const key of EARLY_LOOP_KEYS) {
  const scenario = report.mixed[key];
  const unchanged = EARLY_LOOP_KEYS.filter((other) => other !== key)
    .map((other) => `\`${other}\`=${scenario.values[other].blended}`)
    .join(', ');
  lines.push(
    `| \`${key}\` | ${scenario.actors[0].targetMps} | ${scenario.actors[0].accelerationMps2} | ${scenario.stop.rate.full}/${scenario.stop.rate.total} | ${unchanged} |`,
  );
}
lines.push(
  '',
  'The unchanged keys keep `candidate = null`, `blend = 0` and the exact base value; the tests fail if a default or reused candidate moves them.',
  '',
  '## Reproduce',
  '',
  '```text',
  'volta run --node 24.21.0 --npm 11.19.0 -- node --import ./scripts/register-typescript.mjs scripts/run-204-early-loop-behavior.mjs',
  'volta run --node 24.21.0 --npm 11.19.0 -- node --import ./scripts/register-typescript.mjs --test tests/learning/early-loop-behavior.test.ts',
  '```',
  '',
  'Deterministic native CPU fixture. It is not a browser, GPU, FPS, gameplay or participant result, and it does not close the five-participant playtest target.',
  '',
);
writeFileSync(`${outputDirectory}/summary.md`, `${lines.join('\n')}`);

console.log(
  JSON.stringify(
    {
      output: `${outputDirectory}/driver.json`,
      summary: `${outputDirectory}/summary.md`,
      scenarios: Object.fromEntries(
        ['prudent', 'risky', 'no-evidence'].map((id) => [
          id,
          {
            targetMps: report.scenarios[id].actors[0].targetMps,
            accelerationMps2: report.scenarios[id].actors[0].accelerationMps2,
            stopAction: report.scenarios[id].stop.canonical.action,
            fullStopCount: report.scenarios[id].stop.rate.full,
            fullStopRate: report.scenarios[id].stop.rate.fullRate,
          },
        ]),
      ),
      manual: {
        earlyLoop: report.manual.earlyLoop,
        controllerTokens: report.manual.controllerTokens,
        evidenceEpisodes: report.manual.evidenceEpisodes,
        maximumParameterDelta: report.manual.maximumParameterDelta,
      },
      actorCount: EARLY_LOOP_ACTORS.length,
    },
    null,
    2,
  ),
);

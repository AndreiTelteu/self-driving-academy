import {
  HABIT_LIMITS,
  HABIT_MISSION_ID,
  HABIT_OBJECTIVE,
  HABIT_POLICY,
  HABIT_SCHEMA_VERSION,
  evaluateHabitMission,
  habitDirections,
  habitMissionGate,
  habitMissionOutcomes,
  habitMissionReasons,
  habitRejectionCodes,
  habitStatuses,
} from '../../src/missions';
import type { HabitMissionResult } from '../../src/missions';
import { computeProfileVersionChecksum } from '../../src/profiles';
import type { ProfileVersion, ProfileVersionContent } from '../../src/profiles';
import {
  HABIT_FIXTURE_BASE_VALUE,
  HABIT_FIXTURE_ENGINE_VERSION,
  HABIT_FIXTURE_KEY,
  HABIT_FIXTURE_PROFILE_ID,
  createHabitWorld,
} from './mission-habit-fixture';
import type { HabitWorld } from './mission-habit-fixture';

/**
 * Deterministic report for PBI 123.
 *
 * Every demonstration of the report is a real closed LEARNING segment driven through the delivered
 * 085/086/087/088/093/097/098 chain and the delivered 103/102/109/110 pipeline. The fixture authors
 * only how many stop-line approaches ended with a full stop; every value, version, checksum and
 * activation is produced by the modules.
 */
export const MISSION_HABIT_REPORT_VERSION = '123-mission-habit-report-v1' as const;

export interface MissionHabitReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean | null;
  readonly actual: string | number | boolean | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface MissionHabitReportStep {
  readonly order: number;
  readonly versionId: string;
  readonly parentVersionId: string;
  readonly segmentId: string;
  readonly sourceSegmentIds: readonly string[];
  readonly checksum: string;
  readonly previousValue: number;
  readonly newValue: number;
  readonly change: number;
  readonly direction: string;
  readonly trendDirection: string;
  readonly consecutiveSteps: number;
  readonly absorbed: boolean;
  readonly reversal: boolean;
  readonly totalChange: number;
  /** The same checksum is the one the real 109 store holds for that version. */
  readonly storeChecksumMatches: boolean;
}

export interface MissionHabitReportRun {
  readonly name: string;
  readonly plan: readonly (readonly [number, number])[];
  readonly values: readonly number[];
  readonly candidates: readonly (number | null)[];
  readonly pipelineStatuses: readonly string[];
  readonly activationTicks: readonly (number | null)[];
  readonly updatedVehicles: readonly number[];
  readonly unit: string | null;
  readonly status: string;
  readonly gate: string;
  readonly gateReason: string | null;
  readonly direction: string;
  readonly consecutiveSteps: number;
  readonly longestRun: number;
  readonly progress: number;
  readonly replaced: boolean;
  readonly contradictions: number;
  readonly absorbedContradictions: number;
  readonly reversals: number;
  readonly baseVersionId: string | null;
  readonly baseValue: number | null;
  readonly baseChecksum: string | null;
  readonly headVersionId: string | null;
  readonly headValue: number | null;
  readonly headChecksum: string | null;
  readonly change: number | null;
  readonly comparisonDirection: string | null;
  readonly versions: number;
  readonly demonstrations: number;
  readonly storeChecksums: number;
  readonly profileWrites: number;
  readonly learningJobs: number;
  readonly deterministic: boolean;
  readonly steps: readonly MissionHabitReportStep[];
}

export interface MissionHabitReport {
  readonly version: typeof MISSION_HABIT_REPORT_VERSION;
  readonly contract: Readonly<{
    missionId: string;
    schema: string;
    key: string;
    unit: string | null;
    objectiveId: string;
    objectiveKind: string;
    objectiveTarget: number;
    stepsToReplace: number;
    stepsToReverse: number;
    versions: number;
    valueEpsilon: number;
    statuses: readonly string[];
    directions: readonly string[];
    rejectionCodes: readonly string[];
    gateReasons: readonly string[];
    gateOutcomes: readonly string[];
  }>;
  readonly runs: readonly MissionHabitReportRun[];
  readonly checks: readonly MissionHabitReportCheck[];
  readonly summary: Readonly<{
    runs: number;
    checks: number;
    passed: number;
    pass: boolean;
  }>;
}

type Plan = readonly (readonly [number, number])[];

const UP: readonly [number, number] = Object.freeze([4, 0] as const);
const MIXED: readonly [number, number] = Object.freeze([4, 1] as const);

function check(
  name: string,
  expected: string | number | boolean | null,
  actual: string | number | boolean | null,
  detail: string,
): MissionHabitReportCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function round(value: number | null, digits = 6): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function stepsOf(result: HabitMissionResult, world: HabitWorld): readonly MissionHabitReportStep[] {
  return Object.freeze(
    result.steps.map((step) =>
      Object.freeze({
        order: step.order,
        versionId: step.versionId,
        parentVersionId: step.parentVersionId,
        segmentId: step.segmentId,
        sourceSegmentIds: Object.freeze([...step.sourceSegmentIds]),
        checksum: step.checksum,
        previousValue: step.previousValue,
        newValue: step.newValue,
        change: step.change,
        direction: step.direction,
        trendDirection: step.trendDirection,
        consecutiveSteps: step.consecutiveSteps,
        absorbed: step.absorbed,
        reversal: step.reversal,
        totalChange: step.totalChange,
        storeChecksumMatches: world.store.getVersion(step.versionId)?.checksum === step.checksum,
      }),
    ),
  );
}

async function driveRun(name: string, plan: Plan): Promise<MissionHabitReportRun> {
  const world = createHabitWorld();
  try {
    const values: number[] = [HABIT_FIXTURE_BASE_VALUE];
    const candidates: (number | null)[] = [];
    const pipelineStatuses: string[] = [];
    const activationTicks: (number | null)[] = [];
    const updatedVehicles: number[] = [];
    for (const [index, entry] of plan.entries()) {
      const demonstration = await world.demonstrate({
        segmentId: `habit-${name}-${index + 1}`,
        stopped: entry[0],
        crossed: entry[1],
      });
      values.push(demonstration.value);
      candidates.push(demonstration.evidence.candidateValue);
      pipelineStatuses.push(demonstration.pipeline.status);
      activationTicks.push(demonstration.appliedTick);
      updatedVehicles.push(demonstration.updatedVehicles);
    }
    const result = world.evaluate();
    const again = world.evaluate();
    const gate = habitMissionGate(result);
    const steps = stepsOf(result, world);
    return Object.freeze({
      name,
      plan: Object.freeze(plan.map((entry) => Object.freeze([...entry] as const))),
      values: Object.freeze(values.map((value) => round(value) ?? 0)),
      candidates: Object.freeze(candidates.map((value) => round(value))),
      pipelineStatuses: Object.freeze(pipelineStatuses),
      activationTicks: Object.freeze(activationTicks),
      updatedVehicles: Object.freeze(updatedVehicles),
      unit: result.unit,
      status: result.status,
      gate: gate.outcome,
      gateReason: gate.reason,
      direction: result.trend?.direction ?? 'NONE',
      consecutiveSteps: result.trend?.consecutiveSteps ?? 0,
      longestRun: result.trend?.longestRun ?? 0,
      progress: result.trend?.progress ?? 0,
      replaced: result.trend?.replaced ?? false,
      contradictions: result.trend?.contradictions ?? 0,
      absorbedContradictions: result.trend?.absorbedContradictions ?? 0,
      reversals: result.trend?.reversals ?? 0,
      baseVersionId: result.base?.versionId ?? null,
      baseValue: result.base?.value ?? null,
      baseChecksum: result.base?.checksum ?? null,
      headVersionId: result.head?.versionId ?? null,
      headValue: result.head?.value ?? null,
      headChecksum: result.head?.checksum ?? null,
      change: result.comparison?.change ?? null,
      comparisonDirection: result.comparison?.direction ?? null,
      versions: result.comparison?.versions ?? 0,
      demonstrations: result.comparison?.demonstrations ?? 0,
      storeChecksums: steps.filter((step) => step.storeChecksumMatches).length,
      profileWrites: result.profileWrites,
      learningJobs: result.learningJobs,
      deterministic: JSON.stringify(result) === JSON.stringify(again),
      steps,
    });
  } finally {
    world.dispose();
  }
}

function rehashed(content: ProfileVersionContent): ProfileVersion {
  return Object.freeze({ ...content, checksum: computeProfileVersionChecksum(content) });
}

function contentOf(version: ProfileVersion): ProfileVersionContent {
  const { checksum: _checksum, ...content } = version;
  return content as ProfileVersionContent;
}

function refusal(history: readonly unknown[]): string | null {
  const result = evaluateHabitMission({
    profileId: HABIT_FIXTURE_PROFILE_ID,
    key: HABIT_FIXTURE_KEY,
    history,
  });
  return result.status === 'REJECTED' ? (result.reason as string) : null;
}

async function buildRefusals(): Promise<readonly MissionHabitReportCheck[]> {
  const world = createHabitWorld();
  try {
    for (const [index] of [0, 1, 2].entries()) {
      await world.demonstrate({
        segmentId: `habit-refusal-${index + 1}`,
        stopped: UP[0],
        crossed: UP[1],
      });
    }
    const history = world.store.getHistory(HABIT_FIXTURE_PROFILE_ID);
    const [base, first, second, third] = history as readonly ProfileVersion[];
    if (!base || !first || !second || !third)
      throw new Error('Refusal fixture needs four versions');
    const clone = (version: ProfileVersion): ProfileVersion =>
      JSON.parse(JSON.stringify(version)) as ProfileVersion;
    return Object.freeze([
      check(
        'refuses-invalid-input',
        'INVALID_INPUT',
        (() => {
          const result = evaluateHabitMission({ profileId: HABIT_FIXTURE_PROFILE_ID });
          return result.status === 'REJECTED' ? result.reason : null;
        })(),
        'a missing history field is a closed rejection, not an exception',
      ),
      check(
        'refuses-history-limit',
        'HISTORY_LIMIT',
        (() => {
          const oversized = Array.from({ length: HABIT_LIMITS.versions + 1 }, () => clone(base));
          return refusal(oversized);
        })(),
        'a chain longer than the 109 per-profile capacity is refused',
      ),
      check(
        'refuses-profile-mismatch',
        'PROFILE_MISMATCH',
        refusal([base, { ...clone(first), profileId: 'city:foreign' }]),
        'a version of another profile is refused',
      ),
      check(
        'refuses-duplicate-version',
        'DUPLICATE_VERSION',
        refusal([clone(base), clone(first), clone(first)]),
        'the same version twice is refused',
      ),
      check(
        'refuses-missing-base',
        'NO_BASE_VERSION',
        refusal([clone(first), clone(second)]),
        'a chain that does not start at a base version is refused',
      ),
      check(
        'refuses-missing-intermediate',
        'MISSING_INTERMEDIATE_VERSION',
        refusal([clone(base), clone(first), clone(third)]),
        'a gap in the chain is refused instead of skipped',
      ),
      check(
        'refuses-engine-mismatch',
        'ENGINE_VERSION_MISMATCH',
        refusal([
          clone(base),
          rehashed({
            ...contentOf(clone(first)),
            engineVersion: `${HABIT_FIXTURE_ENGINE_VERSION}-x`,
          }),
        ]),
        'a version from another engine build is refused',
      ),
      check(
        'refuses-version-without-key',
        'VERSION_WITHOUT_KEY',
        (() => {
          const parameters = Object.fromEntries(
            Object.entries(clone(base).parameters).filter(([key]) => key !== HABIT_FIXTURE_KEY),
          );
          return refusal([rehashed({ ...contentOf(clone(base)), parameters })]);
        })(),
        'a base version without the demonstrated key is refused',
      ),
      check(
        'refuses-demonstration-without-evidence',
        'DEMONSTRATION_WITHOUT_EVIDENCE',
        refusal([
          clone(base),
          rehashed({
            ...contentOf(clone(first)),
            provenance: {
              ...clone(first).provenance,
              delta: null,
              sourceSegmentIds: Object.freeze([]),
            },
          }),
        ]),
        'a derived version without a demonstrated segment is refused',
      ),
      check(
        'refuses-checksum-mismatch',
        'CHECKSUM_MISMATCH',
        (() => {
          const tampered = clone(first);
          const parameters = { ...tampered.parameters, [HABIT_FIXTURE_KEY]: 0.99 };
          return (() => {
            const result = evaluateHabitMission({
              profileId: HABIT_FIXTURE_PROFILE_ID,
              key: HABIT_FIXTURE_KEY,
              history: [clone(base), { ...tampered, parameters }],
            });
            return result.status === 'REJECTED' ? result.reason : null;
          })();
        })(),
        'a version whose content no longer matches its 109 checksum is refused',
      ),
      check(
        'refuses-value-mismatch',
        'VALUE_MISMATCH',
        (() => {
          const tampered = clone(second);
          const delta = tampered.provenance.delta;
          if (delta === null) throw new Error('Refusal fixture lost its delta');
          const changes = delta.changes.map((change) =>
            change.key === HABIT_FIXTURE_KEY
              ? { ...change, previousValue: change.previousValue - 0.1 }
              : change,
          );
          return refusal([
            clone(base),
            clone(first),
            rehashed({
              ...contentOf(second),
              provenance: {
                ...second.provenance,
                delta: { ...delta, changes },
              },
            }),
          ]);
        })(),
        'a version whose value does not match its recorded delta is refused',
      ),
    ]);
  } finally {
    world.dispose();
  }
}

export async function runMissionHabitReport(): Promise<MissionHabitReport> {
  const repeated = await driveRun('repeated', [UP, UP, UP, UP]);
  const singleContradiction = await driveRun('single-contradiction', [UP, UP, UP, MIXED]);
  const repeatedContradictions = await driveRun('repeated-contradictions', [
    UP,
    UP,
    UP,
    MIXED,
    MIXED,
    MIXED,
  ]);
  const empty = await driveRun('no-demonstrations', []);
  const runs = [repeated, singleContradiction, repeatedContradictions, empty];
  const checks: MissionHabitReportCheck[] = [];

  checks.push(
    check('contract-schema', HABIT_SCHEMA_VERSION, '123-mission-habit-v1', 'mission schema'),
    check('mission-id', HABIT_MISSION_ID, 'campaign-7-changing-a-habit', '116 campaign stage'),
    check(
      'objective',
      'distinct-versions/DISTINCT_PROFILE_VERSIONS/2',
      `${HABIT_OBJECTIVE.objectiveId}/${HABIT_OBJECTIVE.kind}/${HABIT_OBJECTIVE.target}`,
      'the authored 116 objective this mission implements',
    ),
    check('steps-to-replace', 3, HABIT_POLICY.stepsToReplace, 'three consecutive demonstrations'),
    check('steps-to-reverse', 2, HABIT_POLICY.stepsToReverse, 'two consecutive contradictions'),
    check('version-capacity', 128, HABIT_LIMITS.versions, '109 per-profile capacity'),
    check('value-epsilon', 1e-9, HABIT_LIMITS.valueEpsilon, 'value comparison tolerance'),
    check(
      'statuses',
      'REPLACED,BUILDING,NO_DEMONSTRATIONS,REJECTED',
      habitStatuses.join(','),
      'closed status vocabulary',
    ),
    check('directions', 'INCREASE,DECREASE,NONE', habitDirections.join(','), 'closed directions'),
    check(
      'rejection-codes',
      'INVALID_INPUT,HISTORY_LIMIT,PROFILE_MISMATCH,NO_BASE_VERSION,DUPLICATE_VERSION,MISSING_INTERMEDIATE_VERSION,ENGINE_VERSION_MISMATCH,VERSION_WITHOUT_KEY,DEMONSTRATION_WITHOUT_EVIDENCE,CHECKSUM_MISMATCH,VALUE_MISMATCH',
      habitRejectionCodes.join(','),
      'every inconsistency has a code',
    ),
    check(
      'gate-reasons',
      'NO_DEMONSTRATIONS,TENDENCY_NOT_REPLACED',
      habitMissionReasons.join(','),
      'closed gate refusals',
    ),
    check(
      'gate-outcomes',
      'PROGRESS,NO_PROGRESS',
      habitMissionOutcomes.join(','),
      'closed gate outcomes',
    ),
    check(
      'repeated-values',
      '0.6,0.8,0.9,0.95,0.975',
      repeated.values.join(','),
      'four real demonstrations',
    ),
    check('repeated-status', 'REPLACED', repeated.status, 'three consecutive increases'),
    check('repeated-gate', 'PROGRESS', repeated.gate, 'the tendency is established'),
    check('repeated-steps', 4, repeated.demonstrations, 'one real 109 version per demonstration'),
    check('repeated-versions', 5, repeated.versions, 'base plus four versions are compared'),
    check('repeated-direction', 'INCREASE', repeated.direction, 'the new habit is a stop'),
    check('repeated-consecutive', 4, repeated.consecutiveSteps, 'every demonstration agrees'),
    check('repeated-progress', 1, repeated.progress, 'progress is capped at one'),
    check('repeated-contradictions', 0, repeated.contradictions, 'no contradiction observed'),
    check(
      'repeated-store-checksums',
      repeated.steps.length,
      repeated.storeChecksums,
      'every reported checksum is the 109 record',
    ),
    check(
      'repeated-step-order',
      '1,2,3,4',
      repeated.steps.map((step) => step.order).join(','),
      'the steps keep the 109 depth order',
    ),
    check(
      'repeated-step-parents',
      [repeated.baseVersionId ?? '', ...repeated.steps.map((step) => step.versionId)]
        .slice(0, -1)
        .join(','),
      repeated.steps.map((step) => step.parentVersionId).join(','),
      'every step continues the previous version of the chain',
    ),
    check(
      'repeated-provenance',
      repeated.steps.at(-1)?.sourceSegmentIds.length ?? 0,
      repeated.demonstrations,
      'the head carries every demonstration segment',
    ),
    check(
      'repeated-distinct-checksums',
      repeated.steps.length,
      new Set(repeated.steps.map((step) => step.checksum)).size,
      'each intermediate version has its own content hash',
    ),
    check(
      'repeated-activations',
      4,
      repeated.activationTicks.filter((tick) => tick !== null).length,
      'every version reached the fleet on a common tick',
    ),
    check('repeated-fleet', 64, repeated.updatedVehicles[0] ?? 0, 'taxis and civilians updated'),
    check(
      'single-contradiction-values',
      '0.6,0.8,0.9,0.95,0.8667',
      singleContradiction.values.join(','),
      'one mixed demonstration moves the value down',
    ),
    check(
      'single-contradiction-status',
      'REPLACED',
      singleContradiction.status,
      'the tendency survives the single contradiction',
    ),
    check(
      'single-contradiction-direction',
      'INCREASE',
      singleContradiction.direction,
      'the reported tendency does not flip',
    ),
    check(
      'single-contradiction-absorbed',
      1,
      singleContradiction.absorbedContradictions,
      'the contradiction is reported, not hidden',
    ),
    check(
      'single-contradiction-consecutive',
      3,
      singleContradiction.consecutiveSteps,
      'the run of three increases is preserved',
    ),
    check(
      'single-contradiction-reversals',
      0,
      singleContradiction.reversals,
      'one contradiction can never reverse',
    ),
    check(
      'single-contradiction-above-base',
      true,
      (singleContradiction.headValue ?? 0) > (singleContradiction.baseValue ?? 0),
      'the head is still on the new side of the old habit',
    ),
    check(
      'single-contradiction-step-absorbed',
      true,
      singleContradiction.steps.at(-1)?.absorbed ?? false,
      'the step is inspectable as an absorbed contradiction',
    ),
    check(
      'repeated-contradictions-direction',
      'DECREASE',
      repeatedContradictions.direction,
      'two consecutive contradictions flip the tendency',
    ),
    check(
      'repeated-contradictions-reversals',
      1,
      repeatedContradictions.reversals,
      'exactly one reversal',
    ),
    check(
      'repeated-contradictions-status',
      'REPLACED',
      repeatedContradictions.status,
      'three consecutive decreases establish the reversed tendency',
    ),
    check(
      'repeated-contradictions-reversal-step',
      true,
      repeatedContradictions.steps.find((step) => step.reversal)?.absorbed === false,
      'the reversing step is marked and is not absorbed',
    ),
    check(
      'repeated-contradictions-values',
      '0.6,0.8,0.9,0.95,0.8667,0.8296,0.8132',
      repeatedContradictions.values.join(','),
      'the value follows both tendencies',
    ),
    check(
      'no-demonstrations-status',
      'NO_DEMONSTRATIONS',
      empty.status,
      'a base-only history is an empty run',
    ),
    check('no-demonstrations-gate', 'NO_PROGRESS', empty.gate, 'nothing to compare'),
    check(
      'no-demonstrations-reason',
      'NO_DEMONSTRATIONS',
      empty.gateReason,
      'the closed reason says why',
    ),
    check('no-demonstrations-steps', 0, empty.demonstrations, 'no version was invented'),
    check('no-demonstrations-versions', 1, empty.versions, 'only the base version exists'),
    check(
      'structural-profile-writes',
      0,
      runs.reduce((total, run) => total + run.profileWrites + run.learningJobs, 0),
      'the mission never writes a profile or queues a learning job',
    ),
    check(
      'deterministic',
      true,
      runs.every((run) => run.deterministic),
      'evaluating the same chain twice produces the identical bytes',
    ),
  );

  checks.push(...(await buildRefusals()));

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: MISSION_HABIT_REPORT_VERSION,
    contract: Object.freeze({
      missionId: HABIT_MISSION_ID,
      schema: HABIT_SCHEMA_VERSION,
      key: HABIT_FIXTURE_KEY,
      unit: repeated.unit,
      objectiveId: HABIT_OBJECTIVE.objectiveId,
      objectiveKind: HABIT_OBJECTIVE.kind,
      objectiveTarget: HABIT_OBJECTIVE.target,
      stepsToReplace: HABIT_POLICY.stepsToReplace,
      stepsToReverse: HABIT_POLICY.stepsToReverse,
      versions: HABIT_LIMITS.versions,
      valueEpsilon: HABIT_LIMITS.valueEpsilon,
      statuses: Object.freeze([...habitStatuses]),
      directions: Object.freeze([...habitDirections]),
      rejectionCodes: Object.freeze([...habitRejectionCodes]),
      gateReasons: Object.freeze([...habitMissionReasons]),
      gateOutcomes: Object.freeze([...habitMissionOutcomes]),
    }),
    runs: Object.freeze(runs),
    checks: Object.freeze(checks),
    summary: Object.freeze({
      runs: runs.length,
      checks: checks.length,
      passed,
      pass: passed === checks.length,
    }),
  });
}

const BACKTICK = '`';

function code(value: string | number | boolean | null): string {
  return `${BACKTICK}${String(value)}${BACKTICK}`;
}

function cell(value: string | number | boolean | null): string {
  return value === null ? '—' : String(value).replaceAll('|', '\\|');
}

export function missionHabitReportMarkdown(report: MissionHabitReport): string {
  const lines: string[] = [];
  lines.push(
    '# 123 "changing a habit" report',
    '',
    'Machine-readable transcript: [report.json](report.json). Generated by ' +
      code('npm run missions:habit') +
      '; no wall-clock value, random source or browser state participates. Version: ' +
      code(report.version) +
      '.',
    '',
    '## Contract',
    '',
    '- Mission: ' +
      code(report.contract.missionId) +
      ' (' +
      report.contract.schema +
      '), key ' +
      code(report.contract.key) +
      '.',
    '- 116 objective: ' +
      code(report.contract.objectiveId) +
      ' / ' +
      code(report.contract.objectiveKind) +
      ' / target ' +
      String(report.contract.objectiveTarget) +
      '.',
    '- Gradual rule: ' +
      String(report.contract.stepsToReplace) +
      ' consecutive demonstrations establish the tendency; ' +
      String(report.contract.stepsToReverse) +
      ' consecutive contradictions reverse it; one contradiction is absorbed.',
    '- Rejection codes: ' +
      report.contract.rejectionCodes.map((entry) => code(entry)).join(', ') +
      '.',
    '',
    '## Runs',
    '',
    '| Run | Demonstrations | Values | Status | Direction | Consecutive | Absorbed | Reversals | Gate |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...report.runs.map(
      (run) =>
        `| ${run.name} | ${run.demonstrations} | ${run.values.join(' → ')} | ${code(run.status)} | ${code(run.direction)} | ${run.consecutiveSteps} | ${run.absorbedContradictions} | ${run.reversals} | ${code(run.gate)} |`,
    ),
    '',
    'The plan columns are authored behaviour: `[full stops, crossings]` per demonstration. Every',
    'value, candidate, version, checksum and activation is produced by the delivered',
    '085/086/087/088/093/097/098 and 103/102/109/110 contracts.',
    '',
    '## Inspectable intermediate versions',
    '',
    '| Run | Order | Version | Segment | Previous | New | Change | Direction | Absorbed | Checksum | Store |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...report.runs.flatMap((run) =>
      run.steps.map(
        (step) =>
          `| ${run.name} | ${step.order} | ${step.versionId} | ${step.segmentId} | ${step.previousValue} | ${step.newValue} | ${step.change} | ${code(step.direction)} | ${step.absorbed ? 'yes' : 'no'} | ${code(step.checksum)} | ${step.storeChecksumMatches ? 'match' : 'MISMATCH'} |`,
      ),
    ),
    '',
    '## Checks',
    '',
    '| Check | Expected | Actual | Result | Detail |',
    '| --- | --- | --- | --- | --- |',
    ...report.checks.map(
      (entry) =>
        `| ${entry.name} | ${cell(entry.expected)} | ${cell(entry.actual)} | ${
          entry.pass ? 'PASS' : 'FAIL'
        } | ${entry.detail} |`,
    ),
    '',
    '## Summary',
    '',
    '- Runs: ' + String(report.summary.runs),
    '- Checks: ' + String(report.summary.passed) + '/' + String(report.summary.checks),
    '- Overall: ' + (report.summary.pass ? 'PASS' : 'FAIL'),
    '',
    '## Limitations',
    '',
    '- Deterministic Node run: the demonstrations are real closed segments and real 109 versions, but',
    '  there is no browser, renderer or human session.',
    '- The authored part is how many stop-line approaches of one demonstration ended with a full stop',
    '  and how many were crossed; the candidate, the blend and every version are computed by the',
    '  delivered estimators and pipeline.',
    '- The mission is a domain contract: it has no HUD, panel or `main.ts` composition.',
    '- No FPS, frame, GPU or hardware measurement is claimed.',
    '',
  );
  return lines.join('\n');
}

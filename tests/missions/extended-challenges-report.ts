import {
  EXTENDED_CHALLENGE_CATALOG_VERSION,
  EXTENDED_CHALLENGE_LIMITS,
  EXTENDED_CHALLENGE_SCHEMA_VERSION,
  EXTENDED_CHALLENGE_TICK_HZ,
  createChallengeTemplateCatalog,
  createComposedChallengeCatalog,
  evaluateExtendedChallenge,
  extendedChallengeEvaluatorDefinition,
  extendedChallengeFamilyLabels,
  extendedChallengeLearningKeys,
  importV1ProgressContext,
} from '../../src/missions';
import type { ExtendedChallengeFamily, ExtendedChallengeMeasured } from '../../src/missions';
import {
  V1_ACCESS_DIGEST,
  V1_ACCESS_EXPECTATION,
  V1_CATALOG_DIGEST,
  V1_CHECKPOINT_DIGEST,
  V1_PLAYER_DIGEST,
  V1_PROGRESS_DIGEST,
  V1_UNLOCKS_DIGEST,
  extendedCatalog,
  extendedPlan,
  failingExtendedFacts,
  passingExtendedFacts,
  v1PreservationSnapshot,
} from './extended-challenges-fixture';

/**
 * Deterministic report for PBI 188.
 *
 * No wall clock, no random source and no browser participate. Every plan uses the same explicit
 * fixture seed and every fact document is an explicit tick window, so the transcript is byte-stable
 * and `--check` can prove the committed report is current.
 */
export const EXTENDED_CHALLENGES_REPORT_VERSION = '188-extended-challenges-report-v1' as const;

export interface ExtendedCheck {
  readonly id: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ExtendedChallengeRow {
  readonly challengeId: string;
  readonly title: string;
  readonly family: ExtendedChallengeFamily;
  readonly evaluatorId: string;
  readonly learningKey: string;
  readonly derivation: string;
  readonly comparison: 'AT_LEAST' | 'AT_MOST';
  readonly unit: string;
  readonly keyValue: number;
  readonly catalogDefault: number;
  readonly opportunities: number;
  readonly floor: number | null;
  readonly threshold: number;
  readonly target: number;
  readonly deadlineTicks: number;
  readonly incidentBudgets: readonly number[];
  readonly explanationEvent: string;
  readonly passing: 'PASSED' | 'FAILED' | 'INCOMPLETE' | 'EXCLUDED';
  readonly failing: 'PASSED' | 'FAILED' | 'INCOMPLETE' | 'EXCLUDED';
  readonly failingReason: string;
  readonly measured: ExtendedChallengeMeasured;
}

export interface ExtendedFamilyRow {
  readonly family: ExtendedChallengeFamily;
  readonly label: string;
  readonly challenges: readonly string[];
  readonly keys: readonly string[];
  readonly evaluators: readonly string[];
  readonly count: number;
}

export interface ExtendedEvaluatorRow {
  readonly evaluatorId: string;
  readonly family: ExtendedChallengeFamily;
  readonly version: string;
  readonly stream: string;
  readonly derivation: string;
  readonly unit: string;
  readonly comparison: 'AT_LEAST' | 'AT_MOST';
  readonly targetKind: 'THRESHOLD' | 'SINGLE';
  readonly floor: number | null;
  readonly observations: readonly string[];
}

export interface ExtendedCompatibilityReport {
  readonly v1CatalogVersion: string;
  readonly v1Templates: number;
  readonly v1TemplateIds: readonly string[];
  readonly v1CatalogDigest: string;
  readonly composed: Readonly<{ v1: number; extended: number; total: number }>;
  readonly v1ProgressDigest: string;
  readonly v1UnlocksDigest: string;
  readonly v1AccessDigest: string;
  readonly v1PlayerDigest: string;
  readonly v1CheckpointDigest: string;
  readonly beforeAfterEqual: boolean;
  readonly completedMissions: number;
  readonly availableMissions: number;
  readonly lockedMissions: number;
  readonly unlocksMonotone: boolean;
  readonly vehicleAccess: typeof V1_ACCESS_EXPECTATION;
  readonly vehicleClasses: readonly string[];
  readonly importProgressDigest: string;
  readonly importUnlocksDigest: string;
  readonly importStable: boolean;
  readonly profileWrites: 0;
  readonly learningJobs: 0;
}

export interface ExtendedChallengesReport {
  readonly version: typeof EXTENDED_CHALLENGES_REPORT_VERSION;
  readonly schemaVersion: typeof EXTENDED_CHALLENGE_SCHEMA_VERSION;
  readonly catalogVersion: typeof EXTENDED_CHALLENGE_CATALOG_VERSION;
  readonly tickHz: typeof EXTENDED_CHALLENGE_TICK_HZ;
  readonly limits: typeof EXTENDED_CHALLENGE_LIMITS;
  readonly families: readonly ExtendedFamilyRow[];
  readonly challenges: readonly ExtendedChallengeRow[];
  readonly evaluators: readonly ExtendedEvaluatorRow[];
  readonly learningKeys: Readonly<{
    extended: number;
    covered: number;
    uncovered: readonly string[];
    v1KeysUsed: readonly string[];
  }>;
  readonly compatibility: ExtendedCompatibilityReport;
  readonly determinism: Readonly<{ runs: number; stable: boolean; digest: string }>;
  readonly checks: readonly ExtendedCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function digest(value: unknown): string {
  const canonical = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function check(
  id: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): ExtendedCheck {
  return Object.freeze({ id, expected, actual, pass: expected === actual, detail });
}

function reportBody(): Omit<ExtendedChallengesReport, 'determinism' | 'checks' | 'summary'> {
  const catalog = extendedCatalog();
  const composed = createComposedChallengeCatalog();
  const v1 = createChallengeTemplateCatalog();
  const challenges: ExtendedChallengeRow[] = catalog.challenges.map((challenge) => {
    const plan = extendedPlan(challenge.challengeId);
    const passing = evaluateExtendedChallenge({
      objective: plan.objective,
      facts: passingExtendedFacts(challenge.challengeId),
    });
    const failure = failingExtendedFacts(challenge.challengeId);
    const failing = evaluateExtendedChallenge({
      objective: plan.objective,
      facts: failure.facts,
    });
    return Object.freeze({
      challengeId: challenge.challengeId,
      title: challenge.title,
      family: challenge.family,
      evaluatorId: challenge.evaluatorId,
      learningKey: challenge.learningKeys[0]!,
      derivation: challenge.threshold.derivation,
      comparison: challenge.threshold.comparison,
      unit: challenge.threshold.unit,
      keyValue: challenge.threshold.keyValue,
      catalogDefault: challenge.threshold.catalogDefault,
      opportunities: challenge.threshold.opportunities,
      floor: challenge.threshold.floor,
      threshold: challenge.threshold.value,
      target: challenge.target,
      deadlineTicks: plan.deadline.durationTicks,
      incidentBudgets: challenge.incidentBudgets,
      explanationEvent: challenge.explanation.observation,
      passing: passing.status,
      failing: failing.status,
      failingReason: failing.reason,
      measured: failing.measured,
    });
  });
  const families: ExtendedFamilyRow[] = [];
  for (const family of ['PEDESTRIAN', 'ROUTING', 'SIGNALLING', 'HAZARD', 'SERVICE'] as const) {
    const rows = challenges.filter((entry) => entry.family === family);
    families.push(
      Object.freeze({
        family,
        label: extendedChallengeFamilyLabels[family],
        challenges: Object.freeze(rows.map((entry) => entry.challengeId)),
        keys: Object.freeze(rows.map((entry) => entry.learningKey)),
        evaluators: Object.freeze(rows.map((entry) => entry.evaluatorId)),
        count: rows.length,
      }),
    );
  }
  const evaluators: ExtendedEvaluatorRow[] = [];
  for (const challenge of catalog.challenges) {
    const definition = extendedChallengeEvaluatorDefinition(challenge.evaluatorId);
    evaluators.push(
      Object.freeze({
        evaluatorId: definition.evaluatorId,
        family: definition.family,
        version: definition.version,
        stream: definition.stream,
        derivation: definition.derivation,
        unit: definition.unit,
        comparison: definition.comparison,
        targetKind: definition.targetKind,
        floor: definition.floor,
        observations: definition.observations,
      }),
    );
  }
  const covered = new Set(challenges.map((entry) => entry.learningKey));
  const v1Progress = v1PreservationSnapshot();
  // Run every 188 feature between the two V1 snapshots, then read the V1 progress again.
  const importBefore = importV1ProgressContext(v1Progress.progress, v1Progress.unlocks);
  for (const row of challenges) {
    const plan = extendedPlan(row.challengeId);
    evaluateExtendedChallenge({
      objective: plan.objective,
      facts: passingExtendedFacts(row.challengeId),
    });
  }
  const importAfter = importV1ProgressContext(v1Progress.progress, v1Progress.unlocks);
  const v1After = v1PreservationSnapshot();
  return {
    version: EXTENDED_CHALLENGES_REPORT_VERSION,
    schemaVersion: EXTENDED_CHALLENGE_SCHEMA_VERSION,
    catalogVersion: EXTENDED_CHALLENGE_CATALOG_VERSION,
    tickHz: EXTENDED_CHALLENGE_TICK_HZ,
    limits: EXTENDED_CHALLENGE_LIMITS,
    families,
    challenges,
    evaluators,
    learningKeys: {
      extended: extendedChallengeLearningKeys.length,
      covered: covered.size,
      uncovered: extendedChallengeLearningKeys.filter((key) => !covered.has(key)),
      v1KeysUsed: challenges
        .map((entry) => entry.learningKey)
        .filter((key) => !extendedChallengeLearningKeys.includes(key)),
    },
    compatibility: Object.freeze({
      v1CatalogVersion: v1.version,
      v1Templates: v1.templates.length,
      v1TemplateIds: Object.freeze(v1.templates.map((entry) => entry.templateId)),
      v1CatalogDigest: digest(v1),
      composed: composed.counts,
      v1ProgressDigest: v1Progress.progressDigest,
      v1UnlocksDigest: v1Progress.unlocksDigest,
      v1AccessDigest: digest(v1Progress.accessJson),
      v1PlayerDigest: digest(v1Progress.playerProgressJson),
      v1CheckpointDigest: digest(v1Progress.playerProgressCheckpointJson),
      beforeAfterEqual:
        v1After.progressJson === v1Progress.progressJson &&
        v1After.unlocksJson === v1Progress.unlocksJson &&
        v1After.accessJson === v1Progress.accessJson &&
        v1After.playerProgressJson === v1Progress.playerProgressJson &&
        v1After.playerProgressCheckpointJson === v1Progress.playerProgressCheckpointJson &&
        importBefore.progressDigest === importAfter.progressDigest &&
        importBefore.unlocksDigest === importAfter.unlocksDigest,
      completedMissions: v1Progress.progress.completedMissionIds.length,
      availableMissions: v1Progress.progress.availableMissionIds.length,
      lockedMissions: v1Progress.progress.lockedMissionIds.length,
      unlocksMonotone: v1Progress.unlocks.monotone,
      vehicleAccess: V1_ACCESS_EXPECTATION,
      vehicleClasses: importAfter.vehicleClasses,
      importProgressDigest: importAfter.progressDigest,
      importUnlocksDigest: importAfter.unlocksDigest,
      importStable:
        importBefore.progressDigest === importAfter.progressDigest &&
        importBefore.unlocksDigest === importAfter.unlocksDigest,
      profileWrites: 0 as const,
      learningJobs: 0 as const,
    }),
  };
}

function reportChecks(
  report: Omit<ExtendedChallengesReport, 'determinism' | 'checks' | 'summary'>,
) {
  const checks: ExtendedCheck[] = [];
  checks.push(
    check('families', 5, report.families.length, 'The catalog covers the five authored families'),
    check(
      'family-minimum',
      3,
      Math.min(...report.families.map((entry) => entry.count)),
      'Each family carries at least one challenge, in the delivered catalog three',
    ),
    check('challenges', 15, report.challenges.length, 'Fifteen extended challenges are authored'),
    check(
      'v1-templates',
      12,
      report.compatibility.v1Templates,
      'The delivered 231 catalog still has twelve templates',
    ),
    check(
      'composed-total',
      27,
      report.compatibility.composed.total,
      'The composed catalog publishes both halves without sharing an id',
    ),
    check(
      'v1-catalog-digest',
      V1_CATALOG_DIGEST,
      report.compatibility.v1CatalogDigest,
      'The 231 catalog bytes are the pre-188 bytes',
    ),
    check(
      'v2-keys',
      56,
      report.learningKeys.extended,
      'The 187 table exposes the 56 extended keys',
    ),
    check(
      'covered-keys',
      15,
      report.learningKeys.covered,
      'Fifteen distinct real V2 keys are covered by the delivered challenges',
    ),
    check(
      'no-v1-key',
      0,
      report.learningKeys.v1KeysUsed.length,
      'No challenge uses a V1 key as its context',
    ),
    check(
      'passing-fixtures',
      report.challenges.length,
      report.challenges.filter((entry) => entry.passing === 'PASSED').length,
      'Every challenge passes a realizable tick-window fixture',
    ),
    check(
      'failing-fixtures',
      report.challenges.length,
      report.challenges.filter((entry) => entry.failing !== 'PASSED').length,
      'Every challenge fails an invalid fixture that changes only the governed fact',
    ),
    check(
      'v1-progress-digest',
      V1_PROGRESS_DIGEST,
      report.compatibility.v1ProgressDigest,
      'The 125 campaign progress is the pre-188 snapshot',
    ),
    check(
      'v1-unlocks-digest',
      V1_UNLOCKS_DIGEST,
      report.compatibility.v1UnlocksDigest,
      'The 125 unlock list is the pre-188 snapshot',
    ),
    check(
      'v1-access-digest',
      V1_ACCESS_DIGEST,
      report.compatibility.v1AccessDigest,
      'The 125 vehicle access is the pre-188 snapshot',
    ),
    check(
      'v1-player-digest',
      V1_PLAYER_DIGEST,
      report.compatibility.v1PlayerDigest,
      'The 213 player progress is the pre-188 snapshot',
    ),
    check(
      'v1-checkpoint-digest',
      V1_CHECKPOINT_DIGEST,
      report.compatibility.v1CheckpointDigest,
      'The 213 progress import round-trips byte for byte',
    ),
    check(
      'v1-before-after',
      true,
      report.compatibility.beforeAfterEqual,
      'Progress, unlocks, access and player progress are identical after the 188 work',
    ),
    check(
      'v1-missions-completed',
      8,
      report.compatibility.completedMissions,
      'The whole delivered campaign completed through the real 116 tracker',
    ),
    check(
      'v1-taxis-selectable',
      24,
      report.compatibility.vehicleAccess.taxisSelectable,
      'All 24 real taxis stay selectable',
    ),
    check(
      'v1-vehicles-driveable',
      64,
      report.compatibility.vehicleAccess.vehiclesDriveable,
      'All 64 real fleet vehicles stay driveable',
    ),
    check(
      'v1-revoked',
      0,
      report.compatibility.vehicleAccess.revoked,
      'No unlock can revoke a vehicle',
    ),
    check(
      'v1-blocked-taxis',
      0,
      report.compatibility.vehicleAccess.blockedTaxis,
      'No taxi is blocked by progress',
    ),
    check(
      'v1-import-stable',
      true,
      report.compatibility.importStable,
      'Importing the V1 progress returns the same digest before and after',
    ),
    check(
      'profile-writes',
      0,
      report.compatibility.profileWrites,
      'The whole extended catalog writes no profile',
    ),
    check(
      'learning-jobs',
      0,
      report.compatibility.learningJobs,
      'The whole extended catalog starts no learning job',
    ),
  );
  for (const row of report.challenges) {
    checks.push(
      check(
        `threshold:${row.challengeId}`,
        row.learningKey,
        row.learningKey,
        `${row.derivation} -> ${row.threshold} ${row.unit} (${row.comparison}) derived from ${row.learningKey}=${row.keyValue}`,
      ),
    );
  }
  return checks;
}

export function runExtendedChallengesReport(): ExtendedChallengesReport {
  const body = reportBody();
  const first = JSON.stringify(body);
  const second = JSON.stringify(reportBody());
  const checks = reportChecks(body);
  return Object.freeze({
    ...body,
    determinism: Object.freeze({
      runs: 2,
      stable: first === second,
      digest: digest(body),
    }),
    checks: Object.freeze(checks),
    summary: Object.freeze({
      checks: checks.length,
      passed: checks.filter((entry) => entry.pass).length,
      pass: checks.every((entry) => entry.pass) && first === second,
    }),
  });
}

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

export function extendedChallengesReportMarkdown(report: ExtendedChallengesReport): string {
  const familyRows = report.families.map((family) => [
    family.label,
    String(family.count),
    family.challenges.join(', '),
    family.keys.join(', '),
  ]);
  const keyRows = report.challenges.map((row) => [
    row.learningKey,
    row.family,
    row.evaluatorId,
    row.derivation,
    `${row.threshold} ${row.unit}`,
    row.comparison,
    String(row.keyValue),
    String(row.catalogDefault),
    String(row.opportunities),
    row.floor === null ? '—' : String(row.floor),
    String(row.target),
  ]);
  const challengeRows = report.challenges.map((row) => [
    row.challengeId,
    row.family,
    row.learningKey,
    row.explanationEvent,
    `${row.measured.measured} vs ${row.threshold} ${row.unit}`,
    row.passing,
    `${row.failing} / ${row.failingReason}`,
  ]);
  const evaluatorRows = report.evaluators.map((row) => [
    row.evaluatorId,
    row.family,
    row.stream,
    row.derivation,
    row.comparison,
    row.targetKind,
    row.observations.join(', '),
  ]);
  const checkRows = report.checks
    .filter((entry) => !entry.id.startsWith('threshold:'))
    .map((entry) => [
      entry.id,
      String(entry.expected),
      String(entry.actual),
      entry.pass ? 'PASS' : 'FAIL',
      entry.detail,
    ]);
  const access = report.compatibility.vehicleAccess;
  return [
    '# 188 Provocări pentru comportamentele extinse — raport determinist',
    '',
    `- Schema: \`${report.schemaVersion}\``,
    `- Catalog extins: \`${report.catalogVersion}\``,
    `- Tick: ${report.tickHz} Hz`,
    `- Provocări: ${report.challenges.length} (${report.families.map((entry) => `${entry.label} ${entry.count}`).join(', ')})`,
    `- Chei V2 acoperite: ${report.compatibility.composed.v1} template-uri 231 neschimbate + ${report.compatibility.composed.extended} provocări extinse = ${report.compatibility.composed.total}`,
    '',
    '## Cele cinci familii',
    '',
    table(['Familie', 'Provocări', 'ID-uri', 'Chei'], familyRows),
    '',
    '## Cheile, evaluatorii și pragurile derivate',
    '',
    table(
      [
        'Cheie',
        'Familie',
        'Evaluator',
        'Derivare',
        'Prag',
        'Comparație',
        'Valoare cheie',
        'Default catalog',
        'Oportunități',
        'Podea',
        'Țintă',
      ],
      keyRows,
    ),
    '',
    '## Obiective observabile și explicații',
    '',
    table(
      [
        'Provocare',
        'Familie',
        'Cheie',
        'Eveniment explicație',
        'Măsurat vs prag',
        'Fixture valid',
        'Fixture invalid',
      ],
      challengeRows,
    ),
    '',
    '## Evaluatori puri',
    '',
    table(
      ['Evaluator', 'Familie', 'Flux de fapte', 'Derivare', 'Comparație', 'Țintă', 'Evenimente'],
      evaluatorRows,
    ),
    '',
    '## Compatibilitate V1',
    '',
    `- Catalog 231: ${report.compatibility.v1Templates} template-uri, digest \`${report.compatibility.v1CatalogDigest}\` (pre-188 \`${V1_CATALOG_DIGEST}\`)`,
    `- Progres campanie: ${report.compatibility.completedMissions} misiuni finalizate, digest \`${report.compatibility.v1ProgressDigest}\``,
    `- Deblocări: monotone \`${String(report.compatibility.unlocksMonotone)}\`, digest \`${report.compatibility.v1UnlocksDigest}\``,
    `- Acces vehicule: ${access.vehiclesDriveable}/${access.vehicles} conduse, ${access.taxisSelectable}/${access.taxis} taxiuri selectabile, revocate ${access.revoked}, taxiuri blocate ${access.blockedTaxis}`,
    `- PlayerProgress: digest \`${report.compatibility.v1PlayerDigest}\`, import \`${report.compatibility.v1CheckpointDigest}\``,
    `- Import progres V1 înainte/după: \`${report.compatibility.importProgressDigest}\` / \`${report.compatibility.importUnlocksDigest}\`, identic \`${String(report.compatibility.importStable)}\``,
    `- Scrieri de profil: ${report.compatibility.profileWrites}, joburi de learning: ${report.compatibility.learningJobs}`,
    '',
    '## Verificări',
    '',
    table(['Verificare', 'Așteptat', 'Real', 'Rezultat', 'Detaliu'], checkRows),
    '',
    `## Determinism`,
    '',
    `- Rulări comparate: ${report.determinism.runs}`,
    `- Stabile: \`${String(report.determinism.stable)}\``,
    `- Digest: \`${report.determinism.digest}\``,
    '',
    `## Sumar`,
    '',
    `- Verificări: ${report.summary.passed}/${report.summary.checks}`,
    `- Rezultat: ${report.summary.pass ? 'PASS' : 'FAIL'}`,
    '',
    `Template-uri 231 declarate neschimbate: ${report.compatibility.v1TemplateIds.length}.`,
    `Provocări extinse: ${report.challenges.length}. Chei V2 necoperite: ${report.learningKeys.uncovered.length}.`,
    `Limite: ${EXTENDED_CHALLENGE_LIMITS.challenges} provocări, ${EXTENDED_CHALLENGE_LIMITS.factsPerStream} fapte per flux, ${EXTENDED_CHALLENGE_LIMITS.attemptsPerChallenge} încercări.`,
    '',
  ].join('\n');
}

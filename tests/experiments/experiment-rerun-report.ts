import {
  EXPERIMENT_RERUN_REPRODUCIBILITY,
  EXPERIMENT_RERUN_VERSION,
  experimentRerunDivergenceCauses,
  experimentRerunPolicyKeys,
  experimentRerunRefusalCodes,
  runExperimentRerun,
} from '../../src/experiments';
import type {
  ExperimentRerunComparison,
  ExperimentRerunCompleted,
  ExperimentRerunResult,
  ExperimentRerunRun,
} from '../../src/experiments';
import {
  createRerunFixture,
  createRerunProfile,
  createRerunScenario,
  movingLedgerPort,
  publishRerunProfile,
  rawRerunProfile,
  rerunRequest,
} from './experiment-rerun-fixture';

/**
 * Deterministic evidence transcript for PBI 142.
 *
 * Everything is measured on the real fixtures: the snapshot is the 206 capture of the 70-vehicle
 * world at tick 60 (3 080 leaf fields compared by 140), the profiles are the real 105 known profiles
 * published through the real 041 boundary, and the opportunities are decided by the real 050 and 051
 * policies with the real 006 seed addressing. There is no wall clock and no `Math.random`, so
 * `--check` compares the transcript byte for byte.
 */

/** Pinned contract of the fixture rerun; a change in 140/050/051 shows up here immediately. */
const PINNED = Object.freeze({
  tick: 60,
  bytes: 64_378,
  checksum: 'c5a0738c0be1b8a149726738b9b9cccad5655229c542396b04d8aa9d24d8bcb5',
  fields: 3_080,
  entities: 287,
  scenarioSeed: 1_360_032_776,
  prudentTrace: 'daf459fc',
  impulsiveTrace: '525ff680',
  decisions: 24,
  divergent: 8,
  identical: 16,
});

export interface ExperimentRerunCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ExperimentRerunRefusalProbe {
  readonly probe: string;
  readonly stage: string;
  readonly codes: readonly string[];
  readonly paths: readonly string[];
  readonly detail: string;
}

export interface ExperimentRerunDecisionRow {
  readonly opportunityKey: string;
  readonly kind: string;
  readonly decisionTick: number;
  readonly vehicleId: string;
  readonly sampledUnit: number | null;
  readonly opportunitySeed: number;
  readonly leftAction: string;
  readonly leftReason: string;
  readonly rightAction: string;
  readonly rightReason: string;
  readonly thresholdLeft: number | null;
  readonly thresholdRight: number | null;
  readonly divergent: boolean;
  readonly cause: string | null;
  readonly parameter: string | null;
}

export interface ExperimentRerunEvidenceReport {
  readonly version: typeof EXPERIMENT_RERUN_VERSION;
  readonly contract: Readonly<{
    policyKeys: typeof experimentRerunPolicyKeys;
    divergenceCauses: typeof experimentRerunDivergenceCauses;
    refusalCodes: typeof experimentRerunRefusalCodes;
    reproducibility: typeof EXPERIMENT_RERUN_REPRODUCIBILITY;
  }>;
  readonly snapshot: Readonly<{
    tick: number;
    expectedTick: number;
    ticksAdvanced: number;
    bytes: number;
    checksum: string;
    entities: number;
    fields: number;
    mismatches: number;
  }>;
  readonly state: Readonly<{
    worldEpoch: number;
    profileId: string;
    learningEpoch: number;
    rngSeed: number;
    counts: Readonly<Record<string, number>>;
    requestDigest: string;
  }>;
  readonly seed: Readonly<{
    baseSeed: number;
    baseSeedHex: string;
    scenarioId: string;
    scenarioSeed: number;
    scenarioSeedHex: string;
    profileIdentityInSeed: boolean;
    derivation: readonly string[];
    addressing: readonly {
      opportunityKey: string;
      vehicleId: string;
      vehicleSeed: number;
      opportunitySeed: number;
    }[];
  }>;
  readonly scenario: Readonly<{
    scenarioId: string;
    ticks: number;
    fromTick: number;
    toTick: number;
    opportunities: number;
    kinds: Readonly<Record<string, number>>;
  }>;
  readonly profiles: readonly Readonly<{
    profileId: string;
    profileVersionId: string;
    parameters: Readonly<Record<string, number>>;
    decisions: number;
    stopRequested: number;
    proceeded: number;
    byAction: Readonly<Record<string, number>>;
    traceDigest: string;
  }>[];
  readonly comparison: Readonly<{
    left: string;
    right: string;
    decisions: number;
    identical: number;
    divergent: number;
    sameRequest: boolean;
    sameSeed: boolean;
    sameState: boolean;
    causeCounts: Readonly<Record<string, number>>;
    parameterCounts: Readonly<Record<string, number>>;
    profileDifferences: readonly { key: string; left: number; right: number }[];
    unattributed: number;
    crossPlatformBitExactness: boolean;
  }>;
  readonly decisions: readonly ExperimentRerunDecisionRow[];
  readonly repeat: Readonly<{
    identical: boolean;
    traceDigests: readonly string[];
  }>;
  readonly refusals: readonly ExperimentRerunRefusalProbe[];
  readonly ledger: Readonly<{
    learning: string;
    rewards: string;
    kpi: string;
    before: string;
    after: string;
    unchanged: boolean;
    liveWrites: number;
    refusedWrites: number;
    copyWrites: number;
    controlDetected: boolean;
  }>;
  readonly checks: readonly ExperimentRerunCheck[];
  readonly summary: Readonly<{
    probes: number;
    checks: number;
    passed: number;
    pass: boolean;
  }>;
}

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): ExperimentRerunCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function rerun(): ExperimentRerunCompleted {
  const fixture = createRerunFixture();
  const result = runExperimentRerun(rerunRequest(fixture), fixture.ports);
  if (result.status !== 'RERUN') {
    throw new Error(
      `142 report: the reference rerun refused: ${JSON.stringify(result).slice(0, 400)}`,
    );
  }
  return result;
}

function refusedProbe(name: string, run: () => ExperimentRerunResult): ExperimentRerunRefusalProbe {
  const result = run();
  if (result.status !== 'REFUSED') throw new Error(`142 report: ${name} did not refuse`);
  return Object.freeze({
    probe: name,
    stage: result.stage,
    codes: result.codes,
    paths: result.paths,
    detail: result.detail,
  });
}

function profileRow(run: ExperimentRerunRun) {
  return Object.freeze({
    profileId: run.profileId,
    profileVersionId: run.profileVersionId,
    parameters: run.parameters,
    decisions: run.outcome.decisions,
    stopRequested: run.outcome.stopRequested,
    proceeded: run.outcome.proceeded,
    byAction: run.outcome.byAction,
    traceDigest: run.traceDigest,
  });
}

function decisionRows(
  comparison: ExperimentRerunComparison,
): readonly ExperimentRerunDecisionRow[] {
  return Object.freeze(
    comparison.divergences.map((divergence) =>
      Object.freeze({
        opportunityKey: divergence.opportunityKey,
        kind: divergence.kind,
        decisionTick: divergence.decisionTick,
        vehicleId: divergence.left.vehicleId,
        sampledUnit: divergence.left.sampledUnit,
        opportunitySeed: divergence.left.opportunitySeed,
        leftAction: divergence.left.action,
        leftReason: divergence.left.reason,
        rightAction: divergence.right.action,
        rightReason: divergence.right.reason,
        thresholdLeft: divergence.left.threshold,
        thresholdRight: divergence.right.threshold,
        divergent: true,
        cause: divergence.cause,
        parameter: divergence.parameter,
      }),
    ),
  );
}

export function runExperimentRerunReport(): ExperimentRerunEvidenceReport {
  const result = rerun();
  const comparison = result.comparisons[0];
  if (comparison === undefined) throw new Error('142 report: the rerun has no comparison');
  const left = result.runs[0];
  const right = result.runs[1];
  if (left === undefined || right === undefined) throw new Error('142 report: one run is missing');

  const refusedSnapshot = (() => {
    const fixture = createRerunFixture();
    return refusedProbe('incompatible-snapshot', () =>
      runExperimentRerun(
        rerunRequest(fixture, {
          snapshot: {
            ...fixture.snapshot,
            storedVersions: {
              engineVersion: 'babylon-9.28.0',
              physicsVersion: 'ammo-0.4.0',
              mapVersion: 'city-v2',
            },
          },
        }),
        fixture.ports,
      ),
    );
  })();
  const refusedProfile = (() => {
    const fixture = createRerunFixture();
    const parameters = {
      ...(createRerunProfile('PRUDENT').profile.parameters as Record<string, number>),
    };
    delete parameters.stop_full_probability;
    return refusedProbe('profile-incomplete', () =>
      runExperimentRerun(
        rerunRequest(fixture, {
          profiles: Object.freeze([
            rawRerunProfile('incomplete@1', parameters),
            rawRerunProfile('complete@1', createRerunProfile('PRUDENT').profile.parameters),
          ]),
        }),
        fixture.ports,
      ),
    );
  })();
  const refusedScenario = (() => {
    const fixture = createRerunFixture();
    const opportunity = {
      opportunityKey: 'opportunity-01',
      kind: 'SIGNAL' as const,
      vehicleId: 'taxi-02',
      decisionTick: 62,
      distanceToStopLineM: 3,
      speedMps: 10,
      phase: 'RED' as const,
      signalId: 'signal-02',
    };
    return refusedProbe('scenario-horizon', () =>
      runExperimentRerun(
        rerunRequest(fixture, {
          scenario: createRerunScenario({ ticks: 1, opportunities: Object.freeze([opportunity]) }),
        }),
        fixture.ports,
      ),
    );
  })();
  const refusedLedger = (() => {
    const fixture = createRerunFixture();
    return refusedProbe('ledger-changed', () =>
      runExperimentRerun(
        rerunRequest(fixture, { ledger: movingLedgerPort(fixture.ledgers.port) }),
        fixture.ports,
      ),
    );
  })();
  const refusedDuplicate = (() => {
    const fixture = createRerunFixture();
    return refusedProbe('profile-duplicate', () =>
      runExperimentRerun(
        rerunRequest(fixture, {
          profiles: Object.freeze([
            publishRerunProfile('PRUDENT', 'same@1'),
            publishRerunProfile('IMPULSIVE', 'same@1'),
          ]),
        }),
        fixture.ports,
      ),
    );
  })();

  const repeat = rerun();
  const unattributed = comparison.divergences.filter(
    (divergence) => divergence.parameter === null,
  ).length;
  const seedDivergences = comparison.causeCounts.SEED_DIVERGENCE ?? 0;
  const digestOfRun = (run: ExperimentRerunRun) => run.traceDigest;

  const checks: ExperimentRerunCheck[] = [
    check(
      'snapshot-tick',
      PINNED.tick,
      result.state.tick,
      'the 140 snapshot loads at its own tick',
    ),
    check(
      'snapshot-bytes',
      PINNED.bytes,
      result.snapshot.bytes,
      'the 206 payload is the pinned one',
    ),
    check('snapshot-checksum', PINNED.checksum, result.snapshot.checksum, 'SHA-256 of the payload'),
    check('snapshot-fields', PINNED.fields, result.state.fields, 'leaf fields compared by 140'),
    check(
      'snapshot-entities',
      PINNED.entities,
      result.state.entities,
      'section entries compared by 140',
    ),
    check('snapshot-mismatches', 0, result.state.mismatches, 'stored versus restored state'),
    check(
      'snapshot-ticks-advanced',
      0,
      result.snapshot.ticksAdvanced,
      'the load neither jumps nor rewinds',
    ),
    check(
      'scenario-seed',
      PINNED.scenarioSeed,
      result.seed.scenarioSeed,
      'deriveScenarioSeed(baseSeed, scenarioId)',
    ),
    check(
      'seed-profile-independent',
      false,
      result.seed.profileIdentityInSeed,
      'the profile id never enters the seed',
    ),
    check('request-identical', true, comparison.sameRequest, 'one request digest for both runs'),
    check('state-identical', true, comparison.sameState, 'one start state for both runs'),
    check('seed-identical', true, comparison.sameSeed, 'one opportunity seed per opportunity'),
    check(
      'opportunities',
      PINNED.decisions,
      result.scenario.opportunities,
      'authored opportunity instances',
    ),
    check(
      'decisions-per-profile',
      PINNED.decisions,
      left.decisions.length,
      'one decision per opportunity and profile',
    ),
    check(
      'divergent',
      PINNED.divergent,
      comparison.divergent,
      'opportunities whose outcome differs',
    ),
    check(
      'identical',
      PINNED.identical,
      comparison.identical,
      'opportunities whose outcome is the same',
    ),
    check(
      'seed-divergences',
      0,
      seedDivergences,
      'the sampled units are shared, so no divergence is a resampling',
    ),
    check(
      'unattributed-divergences',
      0,
      unattributed,
      'every divergence names the profile parameter that caused it',
    ),
    check(
      'prudent-trace',
      PINNED.prudentTrace,
      digestOfRun(left),
      'FNV-1a digest of the PRUDENT trace',
    ),
    check(
      'impulsive-trace',
      PINNED.impulsiveTrace,
      digestOfRun(right),
      'FNV-1a digest of the IMPULSIVE trace',
    ),
    check(
      'repeatable',
      true,
      repeat.runs.map(digestOfRun).join(',') === result.runs.map(digestOfRun).join(','),
      'a repeated request produces the same trace digests',
    ),
    check(
      'ledger-unchanged',
      true,
      result.ledger.unchanged,
      'learning/rewards/KPI fingerprints before and after',
    ),
    check('ledger-live-writes', 0, result.ledger.liveWrites, 'the experiment has no live mutator'),
    check(
      'cross-platform-bit-exactness',
      false,
      EXPERIMENT_RERUN_REPRODUCIBILITY.crossPlatformBitExactness,
      'declared, not implied',
    ),
    check(
      'ledger-control-detected',
      'LEDGER_CHANGED',
      refusedLedger.codes[0] ?? 'none',
      'a moving ledger is refused',
    ),
  ];

  const passed = checks.filter((entry) => entry.pass).length;

  return Object.freeze({
    version: EXPERIMENT_RERUN_VERSION,
    contract: Object.freeze({
      policyKeys: experimentRerunPolicyKeys,
      divergenceCauses: experimentRerunDivergenceCauses,
      refusalCodes: experimentRerunRefusalCodes,
      reproducibility: EXPERIMENT_RERUN_REPRODUCIBILITY,
    }),
    snapshot: Object.freeze({
      tick: result.snapshot.tick,
      expectedTick: result.snapshot.expectedTick,
      ticksAdvanced: result.snapshot.ticksAdvanced,
      bytes: result.snapshot.bytes,
      checksum: result.snapshot.checksum,
      entities: result.state.entities,
      fields: result.state.fields,
      mismatches: result.state.mismatches,
    }),
    state: Object.freeze({
      worldEpoch: result.state.worldEpoch,
      profileId: result.state.profileId,
      learningEpoch: result.state.learningEpoch,
      rngSeed: result.state.rngSeed,
      counts: result.state.counts,
      requestDigest: left.requestDigest,
    }),
    seed: Object.freeze({
      baseSeed: result.seed.baseSeed,
      baseSeedHex: result.seed.baseSeedHex,
      scenarioId: result.seed.scenarioId,
      scenarioSeed: result.seed.scenarioSeed,
      scenarioSeedHex: result.seed.scenarioSeedHex,
      profileIdentityInSeed: result.seed.profileIdentityInSeed,
      derivation: result.seed.derivation,
      addressing: result.addressing,
    }),
    scenario: result.scenario,
    profiles: Object.freeze([profileRow(left), profileRow(right)]),
    comparison: Object.freeze({
      left: left.profileVersionId,
      right: right.profileVersionId,
      decisions: comparison.decisions,
      identical: comparison.identical,
      divergent: comparison.divergent,
      sameRequest: comparison.sameRequest,
      sameSeed: comparison.sameSeed,
      sameState: comparison.sameState,
      causeCounts: comparison.causeCounts,
      parameterCounts: comparison.parameterCounts,
      profileDifferences: Object.freeze(
        comparison.profileDifferences.map((entry) =>
          Object.freeze({ key: entry.key, left: entry.left, right: entry.right }),
        ),
      ),
      unattributed,
      crossPlatformBitExactness: comparison.reproducibility.crossPlatformBitExactness,
    }),
    decisions: decisionRows(comparison),
    repeat: Object.freeze({
      identical: repeat.runs.map(digestOfRun).join(',') === result.runs.map(digestOfRun).join(','),
      traceDigests: Object.freeze(repeat.runs.map(digestOfRun)),
    }),
    refusals: Object.freeze([
      refusedSnapshot,
      refusedProfile,
      refusedScenario,
      refusedDuplicate,
      refusedLedger,
    ]),
    ledger: Object.freeze({
      learning: result.ledger.before.learning,
      rewards: result.ledger.before.rewards,
      kpi: result.ledger.before.kpi,
      before: result.ledger.before.kpi,
      after: result.ledger.after.kpi,
      unchanged: result.ledger.unchanged,
      liveWrites: result.ledger.liveWrites,
      refusedWrites: result.ledger.refusedWrites,
      copyWrites: result.ledger.copyWrites,
      controlDetected: refusedLedger.codes.includes('LEDGER_CHANGED'),
    }),
    checks: Object.freeze(checks),
    summary: Object.freeze({
      probes: 5,
      checks: checks.length,
      passed,
      pass: passed === checks.length,
    }),
  });
}

function table(rows: readonly string[][], header: readonly string[]): string {
  const lines = [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`];
  for (const row of rows) lines.push(`| ${row.join(' | ')} |`);
  return lines.join('\n');
}

function number(value: number | null): string {
  return value === null ? '—' : String(value);
}

export function experimentRerunReportMarkdown(report: ExperimentRerunEvidenceReport): string {
  const divergenceRows = report.decisions.map((entry) => [
    entry.opportunityKey,
    entry.kind,
    String(entry.decisionTick),
    entry.vehicleId,
    `${entry.leftAction}/${entry.leftReason}`,
    `${entry.rightAction}/${entry.rightReason}`,
    entry.cause ?? '—',
    entry.parameter ?? '—',
    number(entry.thresholdLeft),
    number(entry.thresholdRight),
    number(entry.sampledUnit === null ? null : Number(entry.sampledUnit.toFixed(6))),
  ]);
  const parameterRows = report.comparison.profileDifferences.map((entry) => [
    entry.key,
    String(entry.left),
    String(entry.right),
  ]);
  const checkRows = report.checks.map((entry) => [
    entry.name,
    String(entry.expected),
    String(entry.actual),
    entry.pass ? 'PASS' : 'FAIL',
  ]);
  const refRows = report.refusals.map((entry) => [
    entry.probe,
    entry.stage,
    entry.codes.join(', '),
    entry.paths.length === 0 ? '—' : entry.paths.join(', '),
  ]);
  return [
    '# 142 — rerulare din snapshot cu profil ales',
    '',
    `Contract \`${report.version}\`. Rerulare deterministă din snapshotul 140, cu seed de bază explicit și două profile reale.`,
    '',
    '## Starea de start',
    '',
    table(
      [
        ['tick', String(report.snapshot.tick)],
        ['bytes', String(report.snapshot.bytes)],
        ['checksum SHA-256', report.snapshot.checksum],
        ['intrări de secțiune comparate de 140', String(report.snapshot.entities)],
        ['câmpuri frunză comparate de 140', String(report.snapshot.fields)],
        ['diferențe stocate vs restaurate', String(report.snapshot.mismatches)],
        [
          'worldEpoch / profileId / learningEpoch',
          `${report.state.worldEpoch} / ${report.state.profileId} / ${report.state.learningEpoch}`,
        ],
        ['seed RNG din snapshot', String(report.state.rngSeed)],
      ],
      ['Fapt', 'Valoare'],
    ),
    '',
    '## Seed explicit',
    '',
    table(
      [
        ['seed de bază', String(report.seed.baseSeed), report.seed.baseSeedHex],
        ['seed de scenariu', String(report.seed.scenarioSeed), report.seed.scenarioSeedHex],
      ],
      ['Nivel', 'Zecimal', 'Hex'],
    ),
    '',
    `Derivare: ${report.seed.derivation.join(' → ')}. Identitatea profilului nu intră în seed (\`profileIdentityInSeed: ${String(report.seed.profileIdentityInSeed)}\`), deci cele două rulări folosesc exact aceleași numere aleatoare pentru fiecare pereche (taxi, eveniment).`,
    '',
    '## Cele două profile',
    '',
    table(
      report.profiles.map((entry) => [
        entry.profileVersionId,
        String(entry.decisions),
        String(entry.stopRequested),
        String(entry.proceeded),
        Object.entries(entry.byAction)
          .sort(([left], [right]) => (left < right ? -1 : 1))
          .map(([action, count]) => `${action} ${count}`)
          .join(', '),
        entry.traceDigest,
      ]),
      ['Profil', 'Decizii', 'Cer stop', 'Continuă', 'Pe acțiune', 'Digest trasare'],
    ),
    '',
    '## Divergența oportunităților',
    '',
    table(
      [
        ['oportunități comparate', String(report.comparison.decisions)],
        ['identice', String(report.comparison.identical)],
        ['divergente', String(report.comparison.divergent)],
        [
          'aceeași cerere / seed / stare',
          `${String(report.comparison.sameRequest)} / ${String(report.comparison.sameSeed)} / ${String(report.comparison.sameState)}`,
        ],
        ['divergențe din seed', String(report.comparison.causeCounts.SEED_DIVERGENCE ?? 0)],
        ['divergențe neatribuite', String(report.comparison.unattributed)],
        [
          'bit-exactitate între platforme promisă',
          String(report.comparison.crossPlatformBitExactness),
        ],
      ],
      ['Măsură', 'Valoare'],
    ),
    '',
    table(divergenceRows, [
      'Oportunitate',
      'Tip',
      'Tick',
      'Vehicul',
      'Stânga',
      'Dreapta',
      'Cauză',
      'Parametru',
      'Prag stânga',
      'Prag dreapta',
      'Eșantion',
    ]),
    '',
    '### Parametrii care diferă',
    '',
    table(parameterRows, ['Parametru', report.comparison.left, report.comparison.right]),
    '',
    '## Izolarea ledger-elor',
    '',
    table(
      [
        ['learning', report.ledger.learning],
        ['rewards', report.ledger.rewards],
        ['kpi (înainte)', report.ledger.before],
        ['kpi (după)', report.ledger.after],
        ['neschimbat', String(report.ledger.unchanged)],
        ['liveWrites', String(report.ledger.liveWrites)],
        [
          'scriere refuzată / copie',
          `${report.ledger.refusedWrites} / ${report.ledger.copyWrites}`,
        ],
        [
          'proba de control',
          report.ledger.controlDetected ? 'detectată (LEDGER_CHANGED)' : 'nedetectată',
        ],
      ],
      ['Ledger', 'Amprentă / valoare'],
    ),
    '',
    '## Probe de refuz',
    '',
    table(refRows, ['Probă', 'Etapă', 'Coduri', 'Căi']),
    '',
    '## Verificări',
    '',
    table(checkRows, ['Verificare', 'Așteptat', 'Real', 'Rezultat']),
    '',
    `Rezumat: ${report.summary.passed}/${report.summary.checks} verificări, ${report.summary.probes} probe de refuz, ${report.summary.pass ? 'PASS' : 'FAIL'}.`,
    '',
  ].join('\n');
}

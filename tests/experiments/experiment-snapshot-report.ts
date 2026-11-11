import {
  EXPERIMENT_LEDGER_ISOLATION_VERSION,
  EXPERIMENT_SNAPSHOT_INTEGRITY,
  EXPERIMENT_SNAPSHOT_VERSION,
  compareExperimentSnapshotState,
  createExperimentLedgerIsolation,
  experimentLedgerIsolationCodes,
  experimentLedgerNames,
  experimentSnapshotRejectionCodes,
  experimentSnapshotSections,
  runExperimentSnapshot,
} from '../../src/experiments';
import type {
  ExperimentFieldMismatch,
  ExperimentLedgerWriteResult,
  ExperimentSectionComparison,
  ExperimentSnapshotRefused,
  ExperimentSnapshotRequest,
  ExperimentSnapshotResult,
  ExperimentSnapshotStage,
  ExperimentSnapshotRejectionCode,
} from '../../src/experiments';
import { sha256Hex, WORLD_SNAPSHOT_INTEGRITY } from '../../src/persistence';
import {
  EXPERIMENT_FIXTURE,
  corruptSnapshotBody,
  createExperimentLedgers,
  createExperimentSnapshotPorts,
  createExperimentWorld,
  restoredWorld,
} from './experiment-snapshot-fixture';
import { WORLD_FIXTURE, canonicalWorld, runWorld } from '../persistence/world-checkpoint-fixtures';

/**
 * Deterministic evidence transcript for PBI 140.
 *
 * Everything is measured: the snapshot is a real 206 capture of the 70-vehicle fixture, the load
 * goes through `readWorldSnapshot`/`decodeWorldCheckpoint`, and the ledger fingerprints are the
 * `SHA-256` of the canonical (`SDA-CJSON-1`) form of the real 093/125/137 read models. There is no
 * wall clock, no random value and no machine-local measurement, so `--check` can compare the
 * transcript byte for byte.
 */

/** Pinned contract of the fixture snapshot; a change in 206 shows up here immediately. */
const PINNED = Object.freeze({
  tick: 60,
  bytes: 64_378,
  checksum: 'c5a0738c0be1b8a149726738b9b9cccad5655229c542396b04d8aa9d24d8bcb5',
  entities: 287,
  fields: 3080,
});

export interface ExperimentSnapshotCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ExperimentRefusalProbe {
  readonly probe: string;
  readonly stage: ExperimentSnapshotStage;
  readonly codes: readonly ExperimentSnapshotRejectionCode[];
  readonly detail: string;
}

export interface ExperimentLedgerEvidence {
  readonly structuralSurface: readonly string[];
  readonly structuralIsolation: boolean;
  readonly directWrite: ExperimentLedgerWriteResult;
  readonly copyWrite: ExperimentLedgerWriteResult;
  readonly copyRows: number;
  readonly crossLedgerWrite: ExperimentLedgerWriteResult;
  readonly verification: ReturnType<ReturnType<typeof createExperimentLedgerIsolation>['verify']>;
  readonly controlWriteDetected: boolean;
  readonly controlChangedLedgers: readonly string[];
  readonly fingerprintStableAroundLoad: boolean;
}

export interface ExperimentSnapshotEvidenceReport {
  readonly version: typeof EXPERIMENT_SNAPSHOT_VERSION;
  readonly ledgerVersion: typeof EXPERIMENT_LEDGER_ISOLATION_VERSION;
  readonly contract: Readonly<{
    sections: typeof experimentSnapshotSections;
    rejectionCodes: typeof experimentSnapshotRejectionCodes;
    ledgerNames: typeof experimentLedgerNames;
    ledgerCodes: typeof experimentLedgerIsolationCodes;
    integrity: typeof EXPERIMENT_SNAPSHOT_INTEGRITY;
    integrityMatches206: boolean;
    tickHz: 60;
  }>;
  readonly snapshot: Readonly<{
    experimentId: string;
    tick: number;
    expectedTick: number;
    ticksAdvanced: number;
    bytes: number;
    checksum: string;
    entities: number;
    fields: number;
    mismatches: readonly ExperimentFieldMismatch[];
    sections: readonly ExperimentSectionComparison[];
    resumeVersion: string;
  }>;
  readonly continuation: Readonly<{
    ticks: number;
    identical: boolean;
    digest: string;
  }>;
  readonly refusals: readonly ExperimentRefusalProbe[];
  readonly ledger: ExperimentLedgerEvidence;
  readonly checks: readonly ExperimentSnapshotCheck[];
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
): ExperimentSnapshotCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function baseRequest(): ExperimentSnapshotRequest {
  const fixture = createExperimentWorld();
  return {
    experimentId: EXPERIMENT_FIXTURE.experimentId,
    expectedTick: fixture.tick,
    captureInput: fixture.input,
    envelope: {
      checkpointId: EXPERIMENT_FIXTURE.checkpointId,
      sessionId: EXPERIMENT_FIXTURE.sessionId,
      generation: EXPERIMENT_FIXTURE.generation,
      createdAt: EXPERIMENT_FIXTURE.createdAt,
    },
    storedVersions: EXPERIMENT_FIXTURE.versions,
    currentVersions: EXPERIMENT_FIXTURE.versions,
    ledger: createExperimentLedgers().port,
  };
}

function loaded(
  result: ExperimentSnapshotResult,
): Extract<ExperimentSnapshotResult, { status: 'LOADED' }> {
  if (result.status !== 'LOADED') {
    throw new Error(`140 expected a loaded snapshot, got ${JSON.stringify(result).slice(0, 300)}`);
  }
  return result;
}

function refused(result: ExperimentSnapshotResult): ExperimentSnapshotRefused {
  if (result.status !== 'REFUSED') {
    throw new Error('140 expected a refusal');
  }
  return result;
}

function resumeVersion(resume: unknown): string {
  if (typeof resume !== 'object' || resume === null) return 'MISSING';
  const version = (resume as Record<string, unknown>).version;
  return typeof version === 'string' ? version : 'MISSING';
}

function runProbes(): readonly ExperimentRefusalProbe[] {
  const ports = createExperimentSnapshotPorts();
  const probes: ExperimentRefusalProbe[] = [];

  const corrupted: typeof ports = Object.freeze({
    ...ports,
    capture: (input: unknown) => {
      const captured = ports.capture(input);
      if (captured.status !== 'CAPTURED') return captured;
      return { ...captured, body: corruptSnapshotBody(captured.body) };
    },
  });
  const checksum = refused(runExperimentSnapshot(baseRequest(), corrupted));
  probes.push(
    Object.freeze({
      probe: 'STORED_CHECKSUM_CORRUPTED',
      stage: checksum.stage,
      codes: checksum.codes,
      detail: checksum.detail,
    }),
  );

  const versions: readonly {
    readonly probe: string;
    readonly storedVersions: typeof EXPERIMENT_FIXTURE.versions;
  }[] = [
    {
      probe: 'ENGINE_VERSION',
      storedVersions: { ...EXPERIMENT_FIXTURE.versions, engineVersion: 'babylon-9.28.0' },
    },
    {
      probe: 'PHYSICS_BACKEND',
      storedVersions: { ...EXPERIMENT_FIXTURE.versions, physicsVersion: 'ammo-0.4.0' },
    },
    {
      probe: 'MAP_VERSION',
      storedVersions: { ...EXPERIMENT_FIXTURE.versions, mapVersion: 'city-v2' },
    },
    {
      probe: 'ALL_THREE',
      storedVersions: {
        engineVersion: 'babylon-9.28.0',
        physicsVersion: 'ammo-0.4.0',
        mapVersion: 'city-v2',
      },
    },
  ];
  for (const entry of versions) {
    const result = refused(
      runExperimentSnapshot({ ...baseRequest(), storedVersions: entry.storedVersions }, ports),
    );
    probes.push(
      Object.freeze({
        probe: entry.probe,
        stage: result.stage,
        codes: result.codes,
        detail: result.detail,
      }),
    );
  }

  const fixture = createExperimentWorld();
  const tick = refused(
    runExperimentSnapshot(
      { ...baseRequest(), captureInput: fixture.input, expectedTick: fixture.tick + 1 },
      ports,
    ),
  );
  probes.push(
    Object.freeze({
      probe: 'OTHER_TICK',
      stage: tick.stage,
      codes: tick.codes,
      detail: tick.detail,
    }),
  );

  const insideStep = refused(
    runExperimentSnapshot(
      { ...baseRequest(), captureInput: { ...fixture.input, tickBoundary: 'IN_STEP' } },
      ports,
    ),
  );
  probes.push(
    Object.freeze({
      probe: 'CAPTURE_INSIDE_STEP',
      stage: insideStep.stage,
      codes: insideStep.codes,
      detail: insideStep.detail,
    }),
  );

  return Object.freeze(probes);
}

function runLedgerProbes(): ExperimentLedgerEvidence {
  const ledgers = createExperimentLedgers();
  const isolation = createExperimentLedgerIsolation(ledgers.port);

  const directWrite = isolation.write({
    ledger: 'REWARDS',
    rowId: 'probe-direct',
    value: { xp: 500 },
  });
  const fork = isolation.fork('REWARDS');
  const copyWrite = fork.write({ ledger: 'REWARDS', rowId: 'probe-copy', value: { xp: 500 } });
  const crossLedgerWrite = fork.write({ ledger: 'KPI', rowId: 'probe-wrong', value: { rides: 1 } });

  const verification = isolation.verify();
  ledgers.kpi.ingest({
    eventId: 'event:ride:140:control',
    kind: 'RIDE_TERMINAL',
    rideId: 'ride-140-control',
    taxiId: 'taxi-02',
    state: 'COMPLETED',
    tick: 61,
    pickupSeconds: 11,
    tripSeconds: 25,
    distanceM: 700,
  });
  const afterControl = isolation.verify();

  return Object.freeze({
    structuralSurface: Object.freeze(Object.keys(isolation).sort()),
    structuralIsolation: isolation.structuralIsolation,
    directWrite,
    copyWrite,
    copyRows: fork.rows.length,
    crossLedgerWrite,
    verification,
    controlWriteDetected: !afterControl.unchanged,
    controlChangedLedgers: afterControl.changedLedgers,
    fingerprintStableAroundLoad: false,
  });
}

function matchesWorldIntegrity(): boolean {
  return (
    EXPERIMENT_SNAPSHOT_INTEGRITY.algorithm === WORLD_SNAPSHOT_INTEGRITY.algorithm &&
    EXPERIMENT_SNAPSHOT_INTEGRITY.canonicalization === WORLD_SNAPSHOT_INTEGRITY.canonicalization
  );
}

export function runExperimentSnapshotReport(): ExperimentSnapshotEvidenceReport {
  const fixture = createExperimentWorld();
  const ledgers = createExperimentLedgers();
  const ports = createExperimentSnapshotPorts();
  const result = loaded(
    runExperimentSnapshot(
      {
        experimentId: EXPERIMENT_FIXTURE.experimentId,
        expectedTick: fixture.tick,
        captureInput: fixture.input,
        envelope: {
          checkpointId: EXPERIMENT_FIXTURE.checkpointId,
          sessionId: EXPERIMENT_FIXTURE.sessionId,
          generation: EXPERIMENT_FIXTURE.generation,
          createdAt: EXPERIMENT_FIXTURE.createdAt,
        },
        storedVersions: EXPERIMENT_FIXTURE.versions,
        currentVersions: EXPERIMENT_FIXTURE.versions,
        ledger: ledgers.port,
      },
      ports,
    ),
  );

  const captured = ports.capture(fixture.input);
  if (captured.status !== 'CAPTURED') throw new Error('140 fixture capture was refused');
  const comparison = compareExperimentSnapshotState(captured.body, result.state);

  runWorld(fixture.world, EXPERIMENT_FIXTURE.continuationTicks);
  const restored = restoredWorld(result.state);
  runWorld(restored, EXPERIMENT_FIXTURE.continuationTicks);
  const originalCanonical = canonicalWorld(fixture.world);
  const restoredCanonical = canonicalWorld(restored);

  const refusals = runProbes();
  const ledgerProbes = runLedgerProbes();
  const ledger: ExperimentLedgerEvidence = Object.freeze({
    ...ledgerProbes,
    fingerprintStableAroundLoad: result.ledger.unchanged,
  });

  const entityBySection = new Map(result.sections.map((row) => [row.section, row.entities]));
  const fieldBySection = new Map(result.sections.map((row) => [row.section, row.fields]));
  const probe = (name: string): ExperimentRefusalProbe | undefined =>
    refusals.find((entry) => entry.probe === name);

  const checks: ExperimentSnapshotCheck[] = [
    check(
      'contract-version',
      '140-experiment-snapshot-v1',
      EXPERIMENT_SNAPSHOT_VERSION,
      '140 snapshot contract',
    ),
    check(
      'integrity-matches-206',
      true,
      matchesWorldIntegrity(),
      'the experiment reuses SDA-CJSON-1 + SHA-256, not a second format',
    ),
    check('section-count', 16, result.sections.length, 'the 206 payload sections'),
    check('tick-restored', PINNED.tick, result.tick, 'the restored tick is the snapshot tick'),
    check(
      'tick-expected',
      PINNED.tick,
      result.expectedTick,
      'the experiment requests that same tick',
    ),
    check('no-advance', 0, result.ticksAdvanced, 'the load never advances the fixed-tick loop'),
    check('snapshot-bytes', PINNED.bytes, result.bytes, 'the complete 70-vehicle snapshot size'),
    check(
      'snapshot-checksum',
      PINNED.checksum,
      result.checksum,
      'deterministic SHA-256 of the captured payload',
    ),
    check(
      'vehicles',
      WORLD_FIXTURE.taxis + WORLD_FIXTURE.civilians,
      entityBySection.get('vehicles') ?? -1,
      '30 taxis + 40 civilians',
    ),
    check(
      'controllers',
      WORLD_FIXTURE.taxis + WORLD_FIXTURE.civilians,
      entityBySection.get('controllers') ?? -1,
      'one controller memory per vehicle',
    ),
    check(
      'passengers',
      WORLD_FIXTURE.passengers,
      entityBySection.get('passengers') ?? -1,
      'waiting, onboard and delivered passengers',
    ),
    check(
      'rides',
      WORLD_FIXTURE.passengers,
      entityBySection.get('rides') ?? -1,
      'one ride per passenger',
    ),
    check(
      'segments',
      3,
      entityBySection.get('segments') ?? -1,
      'open, closed and incomplete segments',
    ),
    check(
      'opportunities',
      WORLD_FIXTURE.opportunities,
      entityBySection.get('opportunities') ?? -1,
      'evaluated opportunities',
    ),
    check(
      'signals',
      WORLD_FIXTURE.signals,
      entityBySection.get('signals') ?? -1,
      'signal phases and remaining ticks',
    ),
    check(
      'dispatch-entities',
      4,
      entityBySection.get('dispatch') ?? -1,
      '3 pending jobs + 1 accepted result',
    ),
    check(
      'dispatch-fields',
      24,
      fieldBySection.get('dispatch') ?? -1,
      'pending and accepted rows compared leaf by leaf',
    ),
    check('entities-total', PINNED.entities, result.entities, 'entities compared in the roundtrip'),
    check('fields-total', PINNED.fields, result.fields, 'leaf fields compared in the roundtrip'),
    check('mismatches', 0, result.mismatches.length, 'stored and restored states are identical'),
    check(
      'comparison-recomputed',
      result.fields,
      comparison.fields,
      'an independent comparison of capture and restored state reports the same field count',
    ),
    check(
      'resume-plan',
      '206-world-resume-v1',
      resumeVersion(result.resume),
      'the experiment gets the real 206 resume plan',
    ),
    check(
      'checksum-corrupted-refused',
      'READ/CHECKSUM_MISMATCH',
      `${probe('STORED_CHECKSUM_CORRUPTED')?.stage}/${probe('STORED_CHECKSUM_CORRUPTED')?.codes.join(',')}`,
      'a modified payload is refused before any value is used',
    ),
    check(
      'engine-refused',
      'COMPATIBILITY/ENGINE_VERSION_MISMATCH',
      `${probe('ENGINE_VERSION')?.stage}/${probe('ENGINE_VERSION')?.codes.join(',')}`,
      'another engine build is a closed refusal',
    ),
    check(
      'physics-refused',
      'COMPATIBILITY/PHYSICS_BACKEND_MISMATCH',
      `${probe('PHYSICS_BACKEND')?.stage}/${probe('PHYSICS_BACKEND')?.codes.join(',')}`,
      'another physics backend is a closed refusal',
    ),
    check(
      'map-refused',
      'COMPATIBILITY/MAP_VERSION_MISMATCH',
      `${probe('MAP_VERSION')?.stage}/${probe('MAP_VERSION')?.codes.join(',')}`,
      'another map is a closed refusal',
    ),
    check(
      'combined-refused',
      'ENGINE_VERSION_MISMATCH,PHYSICS_BACKEND_MISMATCH,MAP_VERSION_MISMATCH',
      probe('ALL_THREE')?.codes.join(',') ?? 'none',
      'every incompatible field is named at once',
    ),
    check(
      'tick-refused',
      'TICK/TICK_MISMATCH',
      `${probe('OTHER_TICK')?.stage}/${probe('OTHER_TICK')?.codes.join(',')}`,
      'a snapshot from another tick is not loaded as the experiment start',
    ),
    check(
      'capture-boundary-refused',
      'CAPTURE/CAPTURE_REJECTED',
      `${probe('CAPTURE_INSIDE_STEP')?.stage}/${probe('CAPTURE_INSIDE_STEP')?.codes.join(',')}`,
      'a capture inside the fixed step is refused',
    ),
    check(
      'ledger-surface',
      'fingerprint,fork,structuralIsolation,verify,version,write',
      ledger.structuralSurface.join(','),
      'the experiment handle exposes observation, a copy and a refusing write only',
    ),
    check(
      'ledger-direct-refused',
      'REFUSED/LIVE_LEDGER_READ_ONLY',
      `${ledger.directWrite.status}/${ledger.directWrite.code}`,
      'a direct write never reaches the live ledger',
    ),
    check(
      'ledger-direct-not-live',
      false,
      ledger.directWrite.appliedToLive,
      'no live row was appended',
    ),
    check(
      'ledger-copy-accepted',
      'ACCEPTED_IN_COPY',
      ledger.copyWrite.status,
      'the fork accepts the same write',
    ),
    check(
      'ledger-copy-not-live',
      false,
      ledger.copyWrite.appliedToLive,
      'the fork write stays in the copy',
    ),
    check('ledger-copy-rows', 1, ledger.copyRows, 'the copied row count is reported'),
    check(
      'ledger-cross-refused',
      'EXPERIMENT_LEDGER_MISMATCH',
      ledger.crossLedgerWrite.code ?? 'none',
      'a fork only accepts its own ledger',
    ),
    check(
      'ledger-unchanged',
      true,
      ledger.verification.unchanged,
      'learning, rewards and KPI fingerprints are identical',
    ),
    check(
      'ledger-live-writes',
      0,
      ledger.verification.liveWrites,
      'the experiment wrote zero live rows',
    ),
    check(
      'ledger-stable-around-load',
      true,
      ledger.fingerprintStableAroundLoad,
      'the successful load leaves the fingerprints unchanged',
    ),
    check(
      'ledger-control-detected',
      true,
      ledger.controlWriteDetected,
      'a real write on the live KPI ledger changes its fingerprint',
    ),
    check(
      'ledger-control-scope',
      'KPI',
      ledger.controlChangedLedgers.join(','),
      'only the ledger that was written changes',
    ),
    check(
      'continuation-identical',
      true,
      originalCanonical === restoredCanonical,
      `original and restored worlds agree after ${EXPERIMENT_FIXTURE.continuationTicks} ticks`,
    ),
    check(
      'deterministic',
      true,
      JSON.stringify(result) ===
        JSON.stringify(loaded(runExperimentSnapshot(baseRequest(), ports))),
      'two runs produce byte-identical results',
    ),
  ];

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: EXPERIMENT_SNAPSHOT_VERSION,
    ledgerVersion: EXPERIMENT_LEDGER_ISOLATION_VERSION,
    contract: Object.freeze({
      sections: experimentSnapshotSections,
      rejectionCodes: experimentSnapshotRejectionCodes,
      ledgerNames: experimentLedgerNames,
      ledgerCodes: experimentLedgerIsolationCodes,
      integrity: EXPERIMENT_SNAPSHOT_INTEGRITY,
      integrityMatches206: matchesWorldIntegrity(),
      tickHz: 60 as const,
    }),
    snapshot: Object.freeze({
      experimentId: result.experimentId,
      tick: result.tick,
      expectedTick: result.expectedTick,
      ticksAdvanced: result.ticksAdvanced,
      bytes: result.bytes,
      checksum: result.checksum,
      entities: result.entities,
      fields: result.fields,
      mismatches: result.mismatches,
      sections: result.sections,
      resumeVersion: resumeVersion(result.resume),
    }),
    continuation: Object.freeze({
      ticks: EXPERIMENT_FIXTURE.continuationTicks,
      identical: originalCanonical === restoredCanonical,
      digest: sha256Hex(originalCanonical),
    }),
    refusals,
    ledger,
    checks: Object.freeze(checks),
    summary: Object.freeze({
      probes: refusals.length,
      checks: checks.length,
      passed,
      pass: passed === checks.length,
    }),
  });
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|');
}

export function experimentSnapshotReportMarkdown(report: ExperimentSnapshotEvidenceReport): string {
  const sectionRows = report.snapshot.sections
    .map(
      (row) =>
        `| ${row.section} | ${row.entities} | ${row.fields} | ${row.entities > 0 ? 'comparat' : 'gol'} |`,
    )
    .join('\n');
  const refusalRows = report.refusals
    .map(
      (entry) =>
        `| ${entry.probe} | ${entry.stage} | ${entry.codes.join(', ')} | ${escapeCell(entry.detail)} |`,
    )
    .join('\n');
  const checkRows = report.checks
    .map(
      (entry) =>
        `| ${entry.name} | ${String(entry.expected)} | ${String(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${escapeCell(entry.detail)} |`,
    )
    .join('\n');
  return `# Raport determinist 140 — snapshot complet pentru experiment

- Contract: \`${report.version}\` (integritate \`${report.contract.integrity.canonicalization}\` + \`${report.contract.integrity.algorithm}\`)
- Izolare ledger: \`${report.ledgerVersion}\`
- Snapshot: tick ${report.snapshot.tick}, ${report.snapshot.bytes} bytes, \`${report.snapshot.checksum}\`
- Roundtrip: ${report.snapshot.entities} entități, ${report.snapshot.fields} câmpuri frunză, ${report.snapshot.mismatches.length} diferențe
- Încărcare la același tick: expected ${report.snapshot.expectedTick}, restaurat ${report.snapshot.tick}, avans ${report.snapshot.ticksAdvanced}
- Continuare: ${report.continuation.ticks} tickuri, identică ${report.continuation.identical ? 'DA' : 'NU'}, digest \`${report.continuation.digest}\`

## Secțiuni comparate

| Secțiune | Entități | Câmpuri | Stare |
| --- | ---: | ---: | --- |
${sectionRows}

## Refuzuri demonstrate

| Probă | Etapă | Coduri | Detaliu |
| --- | --- | --- | --- |
${refusalRows}

## Izolarea ledger-elor

- Suprafața experimentului: \`${report.ledger.structuralSurface.join('`, `')}\`
- Scriere directă: ${report.ledger.directWrite.status} / ${report.ledger.directWrite.code}, aplicată live: ${report.ledger.directWrite.appliedToLive}
- Scriere în copie: ${report.ledger.copyWrite.status}, aplicată live: ${report.ledger.copyWrite.appliedToLive}, rânduri copiate: ${report.ledger.copyRows}
- Amprentă neschimbată: ${report.ledger.verification.unchanged ? 'DA' : 'NU'}, scrieri live: ${report.ledger.verification.liveWrites}
- Probă de control: ${report.ledger.controlWriteDetected ? 'scrierea reală schimbă amprenta' : 'amprenta nu a reacționat'} (${report.ledger.controlChangedLedgers.join(', ')})

## Verificări

| Verificare | Așteptat | Real | Rezultat | Detaliu |
| --- | --- | --- | --- | --- |
${checkRows}

## Sumar

- Probe de refuz: ${report.summary.probes}
- Verificări: ${report.summary.passed}/${report.summary.checks}
- Rezultat: ${report.summary.pass ? 'PASS' : 'FAIL'}
`;
}

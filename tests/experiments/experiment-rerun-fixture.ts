import { knownProfiles } from '../../src/experiments';
import type {
  ExperimentLedgerPort,
  ExperimentRerunOpportunity,
  ExperimentRerunProfile,
  ExperimentRerunRequest,
  ExperimentRerunScenario,
  ExperimentSnapshotPorts,
  ExperimentSnapshotRequest,
} from '../../src/experiments';
import { parsePublishableDrivingProfile } from '../../src/profiles';
import type { DrivingProfile, ParameterKey } from '../../src/profiles';
import {
  createExperimentLedgers,
  createExperimentSnapshotPorts,
  createExperimentWorld,
} from './experiment-snapshot-fixture';

/**
 * Deterministic fixture for PBI 142.
 *
 * The snapshot is the real 140 fixture: the 206 world of 70 vehicles captured at tick 60 with the
 * three real live ledgers (093 learning, 125 rewards, 137 KPI). The two profiles are the real 105
 * known profiles `PRUDENT` and `IMPULSIVE`, published through the real 041 boundary with exactly the
 * seven keys that 050 and 051 read, so a difference between the runs is a difference of the keys the
 * policies actually consume.
 */

/** The seven profile keys the 050 signal policy and the 051 stop policy read. */
export const RERUN_PROFILE_KEYS: readonly ParameterKey[] = Object.freeze([
  'red_stop_probability',
  'green_start_delay',
  'red_stop_line_offset',
  'late_red_brake_threshold',
  'stop_full_probability',
  'stop_dwell_time',
  'stop_line_offset',
] as ParameterKey[]);

const unitsByParameter: Readonly<Record<string, string>> = Object.freeze({
  red_stop_probability: 'probability',
  green_start_delay: 's',
  red_stop_line_offset: 'm',
  late_red_brake_threshold: 's',
  stop_full_probability: 'probability',
  stop_dwell_time: 's',
  stop_line_offset: 'm',
});

export const RERUN_FIXTURE = Object.freeze({
  experimentId: 'experiment-142-rerun',
  checkpointId: 'checkpoint-142-01',
  sessionId: 'session-142',
  generation: 1,
  createdAt: '2026-11-11T00:00:00.000Z',
  baseSeed: 142_000,
  scenarioId: 'city-v1/exchange-west',
  ticks: 24,
  opportunityCount: 24,
  versionIds: Object.freeze({
    PRUDENT: 'prudent-142@1',
    IMPULSIVE: 'impulsive-142@1',
  }) as Readonly<Record<'PRUDENT' | 'IMPULSIVE', string>>,
});

/**
 * Publishes one real 105 known profile with only the seven policy keys. The targets are the real 105
 * targets, not new numbers: `PRUDENT` is cautious and `IMPULSIVE` is impatient but not reckless.
 * `overrides` exists so a dedicated isolation scenario can move exactly one parameter.
 */
export function publishRerunProfile(
  profileId: 'PRUDENT' | 'IMPULSIVE',
  versionId: string,
  overrides: Partial<Record<ParameterKey, number>> = {},
): ExperimentRerunProfile {
  const known = knownProfiles.find((entry) => entry.profileId === profileId);
  if (known === undefined) throw new Error(`142 fixture: no 105 profile ${profileId}`);
  const targets = new Map<ParameterKey, number>(
    known.targets.map((target) => [target.key, target.value]),
  );
  const parameters: Record<string, number> = {};
  const units: Record<string, string> = {};
  const provenance: Record<string, 'BASE'> = {};
  const evidence: Record<string, null> = {};
  for (const key of RERUN_PROFILE_KEYS) {
    const value = overrides[key] ?? targets.get(key);
    const unit = unitsByParameter[key];
    if (value === undefined || unit === undefined) {
      throw new Error(`142 fixture: the 105 profile ${profileId} has no ${key}`);
    }
    parameters[key] = value;
    units[key] = unit;
    provenance[key] = 'BASE';
    evidence[key] = null;
  }
  const profile: DrivingProfile = parsePublishableDrivingProfile({
    schemaVersion: 1,
    units: 'SI',
    profileId,
    versionId,
    parentVersionId: null,
    engineVersion: 'fixture-142',
    parameters,
    unitsByParameter: units,
    provenanceByParameter: provenance,
    evidenceByParameter: evidence,
    sourceSegmentIds: [],
    createdAt: RERUN_FIXTURE.createdAt,
    checksum: `${versionId}-checksum`,
  });
  return Object.freeze({ profileId, profile });
}

export function createRerunProfile(profileId: 'PRUDENT' | 'IMPULSIVE'): ExperimentRerunProfile {
  return publishRerunProfile(profileId, RERUN_FIXTURE.versionIds[profileId]);
}

function pad(index: number): string {
  return String(index).padStart(2, '0');
}

/**
 * One authored opportunity instance. The kinds, phases and geometry are scenario input that is the
 * same for both profiles; the identity is a real snapshot row.
 *
 * The mix deliberately covers the branches of both policies: a full stop versus a rolling stop, a
 * dwell that is satisfied by one profile and not by the other, a STOP line already crossed, a red
 * that is stopped versus crossed, a green that everyone proceeds on, and a yellow.
 */
export function rerunOpportunity(index: number): ExperimentRerunOpportunity {
  const decisionTick = 61 + index;
  if (index % 2 === 0) {
    const dwelling = index % 8 === 4;
    const crossed = index % 12 === 10;
    return Object.freeze({
      opportunityKey: `opportunity-${pad(index)}`,
      kind: 'STOP' as const,
      vehicleId: `taxi-${pad((index % 24) + 1)}`,
      decisionTick,
      distanceToStopLineM: dwelling ? 0.5 : 8 + (index % 4) * 2,
      speedMps: dwelling || crossed ? 0 : 6 + (index % 3) * 2,
      stationaryDurationS: dwelling ? 0.6 : null,
      crossed,
      leaderStop: index % 10 === 8 ? ('LEADER_OR_QUEUE' as const) : ('NONE' as const),
    });
  }
  const phase =
    index % 9 === 1 ? ('GREEN' as const) : index % 3 === 0 ? ('YELLOW' as const) : ('RED' as const);
  return Object.freeze({
    opportunityKey: `opportunity-${pad(index)}`,
    kind: 'SIGNAL' as const,
    vehicleId: `taxi-${pad((index % 24) + 1)}`,
    decisionTick,
    distanceToStopLineM: 4 + (index % 5) * 3,
    speedMps: 8 + (index % 4),
    phase,
    signalId: `signal-${pad((index % 8) + 1)}`,
    phaseElapsedS: index % 4,
  });
}

export function createRerunScenario(
  overrides: Partial<ExperimentRerunScenario> = {},
): ExperimentRerunScenario {
  return Object.freeze({
    scenarioId: RERUN_FIXTURE.scenarioId,
    ticks: RERUN_FIXTURE.ticks,
    opportunities: Object.freeze(
      Array.from({ length: RERUN_FIXTURE.opportunityCount }, (_, index) => rerunOpportunity(index)),
    ),
    ...overrides,
  });
}

export interface RerunFixture {
  readonly world: ReturnType<typeof createExperimentWorld>;
  readonly ports: ExperimentSnapshotPorts;
  readonly ledgers: ReturnType<typeof createExperimentLedgers>;
  readonly snapshot: ExperimentSnapshotRequest;
}

/** The real 206 capture of the 70-vehicle world at tick 60, with the three real live ledgers. */
export function createRerunFixture(): RerunFixture {
  const world = createExperimentWorld();
  const ledgers = createExperimentLedgers();
  const snapshot: ExperimentSnapshotRequest = {
    experimentId: RERUN_FIXTURE.experimentId,
    expectedTick: world.tick,
    captureInput: world.input,
    envelope: {
      checkpointId: RERUN_FIXTURE.checkpointId,
      sessionId: RERUN_FIXTURE.sessionId,
      generation: RERUN_FIXTURE.generation,
      createdAt: RERUN_FIXTURE.createdAt,
    },
    storedVersions: {
      engineVersion: 'babylon-9.29.0',
      physicsVersion: 'rapier-0.21.0',
      mapVersion: 'city-v1',
    },
    currentVersions: {
      engineVersion: 'babylon-9.29.0',
      physicsVersion: 'rapier-0.21.0',
      mapVersion: 'city-v1',
    },
    ledger: ledgers.port,
  };
  return Object.freeze({
    world,
    ports: createExperimentSnapshotPorts(),
    ledgers,
    snapshot,
  });
}

export function rerunRequest(
  fixture: RerunFixture,
  overrides: Partial<ExperimentRerunRequest> = {},
): ExperimentRerunRequest {
  return {
    snapshot: fixture.snapshot,
    baseSeed: RERUN_FIXTURE.baseSeed,
    profiles: Object.freeze([
      createRerunProfile('PRUDENT'),
      createRerunProfile('IMPULSIVE'),
    ] as readonly ExperimentRerunProfile[]),
    scenario: createRerunScenario(),
    ledger: fixture.ledgers.port,
    ...overrides,
  };
}

/** A ledger port that changes on the second read: the rerun must refuse with `LEDGER_CHANGED`. */
export function movingLedgerPort(ledger: ExperimentLedgerPort): ExperimentLedgerPort {
  let reads = 0;
  return Object.freeze({
    fingerprint(): ReturnType<ExperimentLedgerPort['fingerprint']> {
      reads += 1;
      const value = ledger.fingerprint();
      return reads > 1 ? Object.freeze({ ...value, kpi: `${value.kpi}:moved` }) : value;
    },
  });
}

/**
 * A profile that never passed the real 041 publication boundary: the rerun validates the keys it
 * reads itself, so a hand-built profile with a missing or out-of-range key must be refused.
 */
export function rawRerunProfile(
  versionId: string,
  parameters: Readonly<Record<string, number>>,
): ExperimentRerunProfile {
  const units: Record<string, string> = {};
  const provenance: Record<string, 'BASE'> = {};
  const evidence: Record<string, null> = {};
  for (const key of Object.keys(parameters)) {
    units[key] = unitsByParameter[key] ?? 'ratio';
    provenance[key] = 'BASE';
    evidence[key] = null;
  }
  const profile = {
    schemaVersion: 1,
    units: 'SI',
    profileId: 'RAW',
    versionId,
    parentVersionId: null,
    engineVersion: 'fixture-142',
    parameters,
    unitsByParameter: units,
    provenanceByParameter: provenance,
    evidenceByParameter: evidence,
    sourceSegmentIds: [],
    createdAt: RERUN_FIXTURE.createdAt,
    checksum: `${versionId}-checksum`,
  } as unknown as DrivingProfile;
  return Object.freeze({ profileId: 'RAW', profile });
}

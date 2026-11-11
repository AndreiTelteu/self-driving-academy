import {
  evaluateSignalPolicy,
  evaluateStopPolicy,
  projectSignalProfile,
  projectStopProfile,
  SIGNAL_POLICY_LIMITS,
  STOP_POLICY_LIMITS,
} from '../autonomy';
import type { DrivingProfile, ParameterKey } from '../profiles';
import { getParameterDefinition } from '../profiles';
import { deriveOpportunitySeed, deriveScenarioSeed, deriveVehicleSeed } from '../sessions';
import { createExperimentLedgerIsolation } from './experiment-ledger-isolation';
import type {
  ExperimentLedgerPort,
  ExperimentLedgerVerification,
} from './experiment-ledger-isolation';
import { runExperimentSnapshot } from './experiment-snapshot';
import type {
  ExperimentSnapshotPorts,
  ExperimentSnapshotRefused,
  ExperimentSnapshotRequest,
  ExperimentVersions,
} from './experiment-snapshot';

/**
 * 142 experiment rerun: run the scenario again from the 140 snapshot with a chosen profile and a
 * controlled seed.
 *
 * The snapshot is not rebuilt: the rerun starts from the restored `140-experiment-snapshot-v1`
 * state, which 140 already compared field by field with the captured 206 payload (tick, checksum,
 * 3 080 leaf fields on the 70-vehicle fixture, zero mismatches). The rerun adds only what an
 * experiment needs on top of that start state:
 *
 * 1. the request is one scenario — snapshot, base seed, opportunity instances — and it is identical
 *    for every profile, which is reported as the same request digest and the same state identity;
 * 2. the seed chain is explicit and profile independent (`deriveScenarioSeed` ->
 *    `deriveVehicleSeed` -> the 050/051 `deriveOpportunitySeed`), so a difference between two runs
 *    is a profile parameter difference, not a resampling;
 * 3. the opportunities are re-decided by the real 050 signal policy and 051 stop policy, projected
 *    from the real published `DrivingProfile`; the module owns no second policy engine;
 * 4. the opportunity divergence is reported per opportunity with the exact reason and the profile
 *    parameter that explains it, and the contract states explicitly that it promises reproducibility
 *    only on the same platform with the same seed, never bit equality across platforms;
 * 5. the live ledgers are isolated exactly as in 140: the experiment observes a fingerprint and
 *    reports `liveWrites: 0`.
 */

export const EXPERIMENT_RERUN_VERSION = '142-experiment-rerun-v1' as const;

/**
 * The reproducibility statement of this contract, declared rather than implied. Same platform and
 * same seed are reproducible; anything cross-platform is not promised bit for bit, because the
 * rerun reads whatever floats the platform produced in the restored snapshot.
 */
export const EXPERIMENT_RERUN_REPRODUCIBILITY = Object.freeze({
  scope: 'SAME_PLATFORM_SAME_SEED' as const,
  crossPlatformBitExactness: false as const,
  statement:
    'Reproductibilitatea este promisă numai pe aceeași platformă, cu același snapshot și același seed de bază. Identitatea bit cu bit între browsere, GPU-uri sau backenduri de fizică diferite nu este promisă.',
});

export const experimentRerunStages = [
  'SNAPSHOT',
  'PROFILE',
  'SCENARIO',
  'RUN',
  'COMPARISON',
  'LEDGER',
] as const;
export type ExperimentRerunStage = (typeof experimentRerunStages)[number];

/** Closed refusal codes; a refusal names every affected path instead of the first one. */
export const experimentRerunRefusalCodes = [
  /** The 140 snapshot load refused; its own stage and codes are carried unchanged. */
  'SNAPSHOT_REFUSED',
  /** The restored 206 state has no readable vehicles/opportunities/signals section. */
  'SNAPSHOT_STATE_UNREADABLE',
  /** Two runs would use the same profile version, so nothing would be compared. */
  'PROFILE_DUPLICATE',
  /** A profile lacks a parameter the selected opportunity kinds read. */
  'PROFILE_INCOMPLETE',
  /** A profile value is outside its real catalog range. */
  'PROFILE_PARAMETER_OUT_OF_RANGE',
  /** The scenario structure is not runnable (empty horizon, duplicated opportunity, bad numbers). */
  'SCENARIO_INVALID',
  /** An opportunity instance names a key that the snapshot does not record. */
  'OPPORTUNITY_UNKNOWN',
  /** An opportunity instance names a vehicle that the snapshot does not record. */
  'VEHICLE_UNKNOWN',
  /** A signalized opportunity names a signal that the snapshot does not record, or omits it. */
  'SIGNAL_UNKNOWN',
  /** A decision tick falls outside the declared horizon. */
  'TICK_OUT_OF_HORIZON',
  /** A live ledger changed while the rerun ran. */
  'LEDGER_CHANGED',
] as const;
export type ExperimentRerunRefusalCode = (typeof experimentRerunRefusalCodes)[number];

export const experimentRerunInputCodes = ['INVALID_REQUEST'] as const;
export type ExperimentRerunInputCode = (typeof experimentRerunInputCodes)[number];

export class ExperimentRerunError extends Error {
  readonly code: ExperimentRerunInputCode;
  readonly path: string;

  constructor(code: ExperimentRerunInputCode, message: string, path: string) {
    super(message);
    this.name = 'ExperimentRerunError';
    this.code = code;
    this.path = path;
  }
}

export const experimentRerunOpportunityKinds = ['SIGNAL', 'STOP'] as const;
export type ExperimentRerunOpportunityKind = (typeof experimentRerunOpportunityKinds)[number];

/** The profile keys each real policy reads; the rerun validates exactly these. */
export const experimentRerunPolicyKeys: Readonly<
  Record<ExperimentRerunOpportunityKind, readonly ParameterKey[]>
> = Object.freeze({
  SIGNAL: Object.freeze([
    'red_stop_probability',
    'green_start_delay',
    'red_stop_line_offset',
    'late_red_brake_threshold',
  ] as ParameterKey[]),
  STOP: Object.freeze([
    'stop_full_probability',
    'stop_dwell_time',
    'stop_line_offset',
  ] as ParameterKey[]),
});

/* ----------------------------------------------------------------- request */

/**
 * One authored opportunity instance of the scenario. The geometry is scenario input, identical for
 * both profiles; the identity (`opportunityKey`, `vehicleId`, `signalId`) must exist in the
 * snapshot, so a rerun cannot invent an opportunity the world does not have.
 */
export interface ExperimentRerunOpportunity {
  readonly opportunityKey: string;
  readonly kind: ExperimentRerunOpportunityKind;
  readonly vehicleId: string;
  /** Absolute tick, inside `(snapshotTick, snapshotTick + ticks]`. */
  readonly decisionTick: number;
  readonly distanceToStopLineM: number;
  readonly speedMps: number;
  /** `SIGNAL` only: the observed phase at `decisionTick`. */
  readonly phase?: 'RED' | 'YELLOW' | 'GREEN';
  /** `SIGNAL` only: the snapshot signal the phase belongs to. */
  readonly signalId?: string;
  /** `SIGNAL` only: seconds the phase has been applied when the green start delay is judged. */
  readonly phaseElapsedS?: number;
  /** `STOP` only: continuous stationary proof, null while a full stop is unproven. */
  readonly stationaryDurationS?: number | null;
  /** `STOP` only: the stop line is already behind the vehicle. */
  readonly crossed?: boolean;
  /** `STOP` only: the hold comes from a leader or queue, not from the driver's own intent. */
  readonly leaderStop?: 'NONE' | 'LEADER_OR_QUEUE';
}

export interface ExperimentRerunScenario {
  /** Seed addressing domain; the same scenario id is used by every profile. */
  readonly scenarioId: string;
  /** Horizon in ticks, counted from the snapshot tick. */
  readonly ticks: number;
  readonly opportunities: readonly ExperimentRerunOpportunity[];
}

/** A published profile and the experiment label it runs under. */
export interface ExperimentRerunProfile {
  readonly profileId: string;
  readonly profile: DrivingProfile;
}

export interface ExperimentRerunRequest {
  /** The complete 140 request; the rerun does not build a second snapshot request. */
  readonly snapshot: ExperimentSnapshotRequest;
  /** The explicit experiment root seed; the same value is used by every profile. */
  readonly baseSeed: number;
  readonly profiles: readonly ExperimentRerunProfile[];
  readonly scenario: ExperimentRerunScenario;
  /** Live ledgers, reachable read-only through the 140 isolation. */
  readonly ledger: ExperimentLedgerPort;
}

/* ------------------------------------------------------------------ result */

/** The explicit seed derivation of a run: base seed -> scenario seed -> vehicle/opportunity. */
export interface ExperimentRerunSeedChain {
  readonly baseSeed: number;
  readonly baseSeedHex: string;
  readonly scenarioId: string;
  readonly scenarioSeed: number;
  readonly scenarioSeedHex: string;
  readonly derivation: readonly string[];
  /** Declared: the profile identity never enters the seed, so the seed is held constant. */
  readonly profileIdentityInSeed: false;
}

/** The addressing of one opportunity: the stable (taxi, event) pair the docs require. */
export interface ExperimentRerunAddressing {
  readonly opportunityKey: string;
  readonly vehicleId: string;
  readonly vehicleSeed: number;
  readonly opportunitySeed: number;
}

export interface ExperimentRerunStateIdentity {
  readonly tick: number;
  readonly worldEpoch: number;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly rngSeed: number;
  /** Checksum of the stored 206 payload the rerun starts from. */
  readonly checksum: string;
  /** Leaf fields 140 compared between the captured and the restored state. */
  readonly fields: number;
  readonly entities: number;
  /** Fields that disagreed; the rerun only starts from a zero-mismatch load. */
  readonly mismatches: number;
  readonly counts: Readonly<Record<string, number>>;
}

export interface ExperimentRerunDecision {
  readonly opportunityKey: string;
  readonly kind: ExperimentRerunOpportunityKind;
  readonly decisionTick: number;
  readonly vehicleId: string;
  readonly profileVersionId: string;
  readonly action: string;
  readonly reason: string;
  readonly stopRequested: boolean;
  readonly sampledUnit: number | null;
  readonly sampledRole: 'FULL' | 'ROLLING' | null;
  /** The profile probability the sampled unit was compared with. */
  readonly threshold: number | null;
  readonly remainingToStopPointM: number | null;
  readonly vehicleSeed: number;
  readonly opportunitySeed: number;
}

export interface ExperimentRerunOutcome {
  readonly decisions: number;
  readonly stopRequested: number;
  readonly proceeded: number;
  readonly byAction: Readonly<Record<string, number>>;
}

export interface ExperimentRerunRun {
  readonly profileId: string;
  readonly profileVersionId: string;
  /** The profile values the policies read, copied so the run is reproducible from the report. */
  readonly parameters: Readonly<Record<string, number>>;
  readonly seed: ExperimentRerunSeedChain;
  /** Equal for every run: the scenario, the seed and the snapshot are the same request. */
  readonly requestDigest: string;
  /** Equal for every run: the restored 140 start state. */
  readonly state: ExperimentRerunStateIdentity;
  readonly decisions: readonly ExperimentRerunDecision[];
  readonly outcome: ExperimentRerunOutcome;
  /** `FNV-1a` of the canonical decision trace; equal runs have equal digests. */
  readonly traceDigest: string;
}

export const experimentRerunDivergenceCauses = [
  /** Same sampled unit, different probability: the threshold parameter explains the difference. */
  'PROBABILITY_THRESHOLD',
  /** Same sampled unit and role, different geometry/dwell parameter. */
  'GEOMETRY_PARAMETER',
  /** The sampled units differ, so the two runs did not share the addressing. */
  'SEED_DIVERGENCE',
  /** Nothing in the reported parameters explains the difference. */
  'UNCLASSIFIED',
] as const;
export type ExperimentRerunDivergenceCause = (typeof experimentRerunDivergenceCauses)[number];

export interface ExperimentRerunParameterValue {
  readonly key: string;
  readonly left: number;
  readonly right: number;
  readonly differs: boolean;
}

export interface ExperimentRerunDivergence {
  readonly opportunityKey: string;
  readonly kind: ExperimentRerunOpportunityKind;
  readonly decisionTick: number;
  readonly left: ExperimentRerunDecision;
  readonly right: ExperimentRerunDecision;
  readonly cause: ExperimentRerunDivergenceCause;
  /** The single profile parameter that explains the difference, when one does. */
  readonly parameter: string | null;
  /** Every policy key of the opportunity kind, with both values. */
  readonly parameters: readonly ExperimentRerunParameterValue[];
  readonly detail: string;
}

export interface ExperimentRerunComparison {
  readonly leftProfileVersionId: string;
  readonly rightProfileVersionId: string;
  readonly decisions: number;
  readonly identical: number;
  readonly divergent: number;
  readonly divergences: readonly ExperimentRerunDivergence[];
  /** Proven, not assumed: the same request, seed and start state were used. */
  readonly sameRequest: boolean;
  readonly sameSeed: boolean;
  readonly sameState: boolean;
  /** Profile keys whose values differ, so an attribution can be checked by hand. */
  readonly profileDifferences: readonly ExperimentRerunParameterValue[];
  readonly causeCounts: Readonly<Record<ExperimentRerunDivergenceCause, number>>;
  readonly parameterCounts: Readonly<Record<string, number>>;
  readonly reproducibility: typeof EXPERIMENT_RERUN_REPRODUCIBILITY;
}

export interface ExperimentRerunCompleted {
  readonly status: 'RERUN';
  readonly version: typeof EXPERIMENT_RERUN_VERSION;
  readonly experimentId: string;
  readonly snapshot: Readonly<{
    checksum: string;
    tick: number;
    expectedTick: number;
    ticksAdvanced: 0;
    bytes: number;
    versions: Readonly<{ stored: ExperimentVersions; current: ExperimentVersions }>;
  }>;
  readonly state: ExperimentRerunStateIdentity;
  readonly scenario: Readonly<{
    scenarioId: string;
    ticks: number;
    fromTick: number;
    toTick: number;
    opportunities: number;
    kinds: Readonly<Record<string, number>>;
  }>;
  readonly seed: ExperimentRerunSeedChain;
  /** The addressing table, identical for every profile; reported so a run can be reproduced. */
  readonly addressing: readonly ExperimentRerunAddressing[];
  readonly runs: readonly ExperimentRerunRun[];
  readonly comparisons: readonly ExperimentRerunComparison[];
  readonly ledger: ExperimentLedgerVerification;
  readonly reproducibility: typeof EXPERIMENT_RERUN_REPRODUCIBILITY;
}

export interface ExperimentRerunRefused {
  readonly status: 'REFUSED';
  readonly version: typeof EXPERIMENT_RERUN_VERSION;
  readonly experimentId: string;
  readonly stage: ExperimentRerunStage;
  readonly codes: readonly ExperimentRerunRefusalCode[];
  readonly paths: readonly string[];
  readonly detail: string;
  /** The 140 refusal, unchanged, when the snapshot itself refused. */
  readonly snapshot: ExperimentSnapshotRefused | null;
  readonly ledger: ExperimentLedgerVerification;
}

export type ExperimentRerunResult = ExperimentRerunCompleted | ExperimentRerunRefused;

/* --------------------------------------------------------------- internals */

interface StateView {
  readonly tick: number;
  readonly worldEpoch: number;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly rngSeed: number;
  readonly vehicles: readonly Readonly<{ entityId: string; handle: number }>[];
  readonly opportunities: readonly Readonly<{ opportunityKey: string }>[];
  readonly signals: readonly Readonly<{ signalId: string }>[];
  readonly counts: Readonly<Record<string, number>>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function boundedText(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new ExperimentRerunError('INVALID_REQUEST', 'Expected bounded text', path);
  }
  return value;
}

function safeInteger(value: unknown, path: string, minimum = 0, maximum = 0xffff_ffff): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new ExperimentRerunError(
      'INVALID_REQUEST',
      `Expected a safe integer in [${minimum}, ${maximum}]`,
      path,
    );
  }
  return value;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ExperimentRerunError('INVALID_REQUEST', 'Expected a finite number', path);
  }
  return value;
}

function optionalBoolean(value: unknown, path: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') {
    throw new ExperimentRerunError('INVALID_REQUEST', 'Expected a boolean', path);
  }
  return value;
}

function seedHex(seed: number): string {
  return seed.toString(16).padStart(8, '0');
}

/** Deterministic canonical text; used only for equality digests, never as a storage format. */
function canonicalText(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalText(entry)).join(',')}]`;
  if (isPlainRecord(value)) {
    const keys = Object.keys(value).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalText(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (value === undefined) return 'null';
  return JSON.stringify(value);
}

/**
 * 32-bit `FNV-1a` over the UTF-16 code units of the canonical trace. Non-cryptographic on purpose:
 * it is an equality digest of a deterministic run, computed with integer arithmetic only, so it is
 * identical on every platform and needs no adapter import.
 */
function traceDigest(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    hash = Math.imul(hash ^ (code & 0xff), 0x01000193);
    hash = Math.imul(hash ^ (code >>> 8), 0x01000193);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0).toString(16).padStart(8, '0');
}

function readState(state: unknown): StateView | null {
  if (!isPlainRecord(state)) return null;
  const profile = state.profile;
  const learning = state.learning;
  const rng = state.rng;
  if (!isPlainRecord(profile) || !isPlainRecord(learning) || !isPlainRecord(rng)) return null;
  const tick = state.tick;
  const worldEpoch = state.worldEpoch;
  const profileId = profile.profileId;
  const learningEpoch = learning.learningEpoch;
  const rngSeed = rng.seed;
  if (
    typeof tick !== 'number' ||
    !Number.isSafeInteger(tick) ||
    tick < 0 ||
    typeof worldEpoch !== 'number' ||
    !Number.isSafeInteger(worldEpoch) ||
    worldEpoch < 0 ||
    typeof profileId !== 'string' ||
    profileId.length === 0 ||
    typeof learningEpoch !== 'number' ||
    !Number.isSafeInteger(learningEpoch) ||
    learningEpoch < 0 ||
    typeof rngSeed !== 'number' ||
    !Number.isSafeInteger(rngSeed) ||
    rngSeed < 0 ||
    rngSeed > 0xffff_ffff
  ) {
    return null;
  }
  const vehicles = state.vehicles;
  const opportunities = state.opportunities;
  const signals = state.signals;
  if (!Array.isArray(vehicles) || !Array.isArray(opportunities) || !Array.isArray(signals)) {
    return null;
  }
  const vehicleRows = vehicles.map((vehicle) => {
    if (!isPlainRecord(vehicle)) return null;
    const entityId = vehicle.entityId;
    const handle = vehicle.handle;
    if (typeof entityId !== 'string' || entityId.length === 0) return null;
    if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 0) return null;
    return Object.freeze({ entityId, handle });
  });
  const opportunityRows = opportunities.map((opportunity) => {
    if (!isPlainRecord(opportunity)) return null;
    const opportunityKey = opportunity.opportunityKey;
    if (typeof opportunityKey !== 'string' || opportunityKey.length === 0) return null;
    return Object.freeze({ opportunityKey });
  });
  const signalRows = signals.map((signal) => {
    if (!isPlainRecord(signal)) return null;
    const signalId = signal.signalId;
    if (typeof signalId !== 'string' || signalId.length === 0) return null;
    return Object.freeze({ signalId });
  });
  if (vehicleRows.includes(null) || opportunityRows.includes(null) || signalRows.includes(null)) {
    return null;
  }
  const dispatch = isPlainRecord(state.dispatch) ? state.dispatch : {};
  const pending = Array.isArray(dispatch.pending) ? dispatch.pending.length : 0;
  const accepted = Array.isArray(dispatch.acceptedResults) ? dispatch.acceptedResults.length : 0;
  const learningJobs = Array.isArray(learning.pendingJobs) ? learning.pendingJobs.length : 0;
  const counts: Record<string, number> = {
    vehicles: vehicles.length,
    controllers: Array.isArray(state.controllers) ? state.controllers.length : 0,
    rides: Array.isArray(state.rides) ? state.rides.length : 0,
    passengers: Array.isArray(state.passengers) ? state.passengers.length : 0,
    segments: Array.isArray(state.segments) ? state.segments.length : 0,
    opportunities: opportunities.length,
    signals: signals.length,
    dispatch: pending + accepted,
    learningJobs,
  };
  return Object.freeze({
    tick,
    worldEpoch,
    profileId,
    learningEpoch,
    rngSeed,
    vehicles: Object.freeze(vehicleRows as Readonly<{ entityId: string; handle: number }>[]),
    opportunities: Object.freeze(opportunityRows as Readonly<{ opportunityKey: string }>[]),
    signals: Object.freeze(signalRows as Readonly<{ signalId: string }>[]),
    counts: Object.freeze(counts),
  });
}

interface OpportunityPlan {
  readonly opportunityKey: string;
  readonly kind: ExperimentRerunOpportunityKind;
  readonly vehicleId: string;
  readonly decisionTick: number;
  readonly distanceToStopLineM: number;
  readonly speedMps: number;
  readonly phase: 'RED' | 'YELLOW' | 'GREEN' | null;
  readonly signalId: string | null;
  readonly phaseElapsedS: number;
  readonly stationaryDurationS: number | null;
  readonly crossed: boolean;
  readonly leaderStop: 'NONE' | 'LEADER_OR_QUEUE';
}

interface ScenarioError {
  readonly code: ExperimentRerunRefusalCode;
  readonly path: string;
  readonly detail: string;
}

function readScenario(
  plans: readonly OpportunityPlan[],
  state: StateView,
  ticks: number,
): readonly ScenarioError[] {
  const errors: ScenarioError[] = [];
  const vehicleIds = new Set(state.vehicles.map((vehicle) => vehicle.entityId));
  const opportunityKeys = new Set(state.opportunities.map((row) => row.opportunityKey));
  const signalIds = new Set(state.signals.map((row) => row.signalId));
  const seen = new Set<string>();
  const lastTick = state.tick + ticks;
  if (plans.length === 0) {
    errors.push({
      code: 'SCENARIO_INVALID',
      path: 'scenario.opportunities',
      detail: 'The scenario has no opportunity instance to rerun',
    });
  }
  plans.forEach((plan, index) => {
    const path = `scenario.opportunities[${index}]`;
    if (seen.has(plan.opportunityKey)) {
      errors.push({
        code: 'SCENARIO_INVALID',
        path: `${path}.opportunityKey`,
        detail: `The opportunity ${plan.opportunityKey} is replayed twice`,
      });
    }
    seen.add(plan.opportunityKey);
    if (!opportunityKeys.has(plan.opportunityKey)) {
      errors.push({
        code: 'OPPORTUNITY_UNKNOWN',
        path: `${path}.opportunityKey`,
        detail: `The snapshot records no opportunity ${plan.opportunityKey}`,
      });
    }
    if (!vehicleIds.has(plan.vehicleId)) {
      errors.push({
        code: 'VEHICLE_UNKNOWN',
        path: `${path}.vehicleId`,
        detail: `The snapshot records no vehicle ${plan.vehicleId}`,
      });
    }
    if (plan.decisionTick <= state.tick || plan.decisionTick > lastTick) {
      errors.push({
        code: 'TICK_OUT_OF_HORIZON',
        path: `${path}.decisionTick`,
        detail: `${plan.decisionTick} is outside (${state.tick}, ${lastTick}]`,
      });
    }
    if (!Number.isFinite(plan.distanceToStopLineM) || plan.distanceToStopLineM < 0) {
      errors.push({
        code: 'SCENARIO_INVALID',
        path: `${path}.distanceToStopLineM`,
        detail: 'The distance to the stop line must be a finite, nonnegative number',
      });
    }
    if (!Number.isFinite(plan.speedMps) || plan.speedMps < 0 || plan.speedMps > 100) {
      errors.push({
        code: 'SCENARIO_INVALID',
        path: `${path}.speedMps`,
        detail: 'The speed must be a finite number in [0, 100] m/s',
      });
    }
    if (plan.kind === 'SIGNAL') {
      if (plan.signalId === null || !signalIds.has(plan.signalId)) {
        errors.push({
          code: 'SIGNAL_UNKNOWN',
          path: `${path}.signalId`,
          detail: `The snapshot records no signal ${String(plan.signalId)}`,
        });
      }
      if (plan.phase === null) {
        errors.push({
          code: 'SCENARIO_INVALID',
          path: `${path}.phase`,
          detail: 'A signalized opportunity needs the observed phase',
        });
      }
      if (
        plan.phaseElapsedS < 0 ||
        plan.phaseElapsedS > SIGNAL_POLICY_LIMITS.maximumPhaseElapsedS
      ) {
        errors.push({
          code: 'SCENARIO_INVALID',
          path: `${path}.phaseElapsedS`,
          detail: 'The phase elapsed time is outside the 050 range',
        });
      }
    }
    if (plan.kind === 'STOP' && plan.phase !== null) {
      errors.push({
        code: 'SCENARIO_INVALID',
        path: `${path}.phase`,
        detail: 'A STOP opportunity has no signal phase',
      });
    }
  });
  return Object.freeze(errors);
}

function profileKeyUnion(plans: readonly OpportunityPlan[]): readonly ParameterKey[] {
  const keys: ParameterKey[] = [];
  for (const kind of experimentRerunOpportunityKinds) {
    if (!plans.some((plan) => plan.kind === kind)) continue;
    for (const key of experimentRerunPolicyKeys[kind]) {
      if (!keys.includes(key)) keys.push(key);
    }
  }
  return Object.freeze(keys);
}

interface ProfileCheck {
  readonly errors: readonly ScenarioError[];
  readonly parameters: Readonly<Record<string, number>> | null;
}

/**
 * Validates the profile against the real 041 catalog: a missing key or a value outside the catalog
 * range is a refusal, not a silently clamped number.
 */
function checkProfile(
  profile: ExperimentRerunProfile,
  index: number,
  keys: readonly ParameterKey[],
): ProfileCheck {
  const errors: ScenarioError[] = [];
  const values: Record<string, number> = {};
  keys.forEach((key) => {
    const path = `profiles[${index}].profile.parameters.${key}`;
    const value = profile.profile.parameters[key];
    if (value === undefined) {
      errors.push({
        code: 'PROFILE_INCOMPLETE',
        path,
        detail: `The profile ${profile.profile.versionId} has no ${key}`,
      });
      return;
    }
    const definition = getParameterDefinition(key);
    if (!Number.isFinite(value) || value < definition.min || value > definition.max) {
      errors.push({
        code: 'PROFILE_PARAMETER_OUT_OF_RANGE',
        path,
        detail: `${value} is outside [${definition.min}, ${definition.max}] for ${key}`,
      });
      return;
    }
    values[key] = value;
  });
  return Object.freeze({
    errors: Object.freeze(errors),
    parameters: errors.length === 0 ? Object.freeze(values) : null,
  });
}

function requireRequest(request: ExperimentRerunRequest): void {
  if (!isPlainRecord(request)) {
    throw new ExperimentRerunError('INVALID_REQUEST', 'Expected a request object', 'request');
  }
  safeInteger(request.baseSeed, 'request.baseSeed');
  const profiles = request.profiles;
  if (!Array.isArray(profiles) || profiles.length < 2) {
    throw new ExperimentRerunError(
      'INVALID_REQUEST',
      'A rerun compares at least two profiles',
      'request.profiles',
    );
  }
  profiles.forEach((entry, index) => {
    if (!isPlainRecord(entry)) {
      throw new ExperimentRerunError(
        'INVALID_REQUEST',
        'Expected a profile entry',
        `request.profiles[${index}]`,
      );
    }
    boundedText(entry.profileId, `request.profiles[${index}].profileId`);
    if (!isPlainRecord(entry.profile)) {
      throw new ExperimentRerunError(
        'INVALID_REQUEST',
        'Expected a published profile',
        `request.profiles[${index}].profile`,
      );
    }
    boundedText(entry.profile.versionId, `request.profiles[${index}].profile.versionId`);
  });
  const scenario = request.scenario;
  if (!isPlainRecord(scenario)) {
    throw new ExperimentRerunError('INVALID_REQUEST', 'Expected a scenario', 'request.scenario');
  }
  boundedText(scenario.scenarioId, 'request.scenario.scenarioId');
  safeInteger(scenario.ticks, 'request.scenario.ticks', 1, 86_400);
  if (!Array.isArray(scenario.opportunities)) {
    throw new ExperimentRerunError(
      'INVALID_REQUEST',
      'Expected an opportunity list',
      'request.scenario.opportunities',
    );
  }
  if (!isPlainRecord(request.snapshot)) {
    throw new ExperimentRerunError(
      'INVALID_REQUEST',
      'Expected a 140 snapshot request',
      'request.snapshot',
    );
  }
  if (!isPlainRecord(request.ledger) || typeof request.ledger.fingerprint !== 'function') {
    throw new ExperimentRerunError(
      'INVALID_REQUEST',
      'Expected a read-only ledger port',
      'request.ledger',
    );
  }
}

function readPlans(scenario: ExperimentRerunScenario): readonly OpportunityPlan[] {
  return Object.freeze(
    scenario.opportunities.map((plan, index) => {
      const path = `request.scenario.opportunities[${index}]`;
      if (!isPlainRecord(plan)) {
        throw new ExperimentRerunError('INVALID_REQUEST', 'Expected an opportunity', path);
      }
      const kind = plan.kind;
      if (
        typeof kind !== 'string' ||
        !(experimentRerunOpportunityKinds as readonly string[]).includes(kind)
      ) {
        throw new ExperimentRerunError(
          'INVALID_REQUEST',
          `Expected one of ${experimentRerunOpportunityKinds.join(', ')}`,
          `${path}.kind`,
        );
      }
      const phase = plan.phase ?? null;
      if (phase !== null && !['RED', 'YELLOW', 'GREEN'].includes(phase as string)) {
        throw new ExperimentRerunError(
          'INVALID_REQUEST',
          'Expected a signal phase',
          `${path}.phase`,
        );
      }
      const stationary = plan.stationaryDurationS;
      const leaderStop = plan.leaderStop ?? 'NONE';
      if (leaderStop !== 'NONE' && leaderStop !== 'LEADER_OR_QUEUE') {
        throw new ExperimentRerunError(
          'INVALID_REQUEST',
          'Expected a leader stop flag',
          `${path}.leaderStop`,
        );
      }
      return Object.freeze({
        opportunityKey: boundedText(plan.opportunityKey, `${path}.opportunityKey`),
        kind: kind as ExperimentRerunOpportunityKind,
        vehicleId: boundedText(plan.vehicleId, `${path}.vehicleId`),
        decisionTick: safeInteger(plan.decisionTick, `${path}.decisionTick`),
        distanceToStopLineM: finiteNumber(plan.distanceToStopLineM, `${path}.distanceToStopLineM`),
        speedMps: finiteNumber(plan.speedMps, `${path}.speedMps`),
        phase: phase === null ? null : (phase as 'RED' | 'YELLOW' | 'GREEN'),
        signalId:
          plan.signalId === undefined ? null : boundedText(plan.signalId, `${path}.signalId`),
        phaseElapsedS:
          plan.phaseElapsedS === undefined
            ? 0
            : finiteNumber(plan.phaseElapsedS, `${path}.phaseElapsedS`),
        stationaryDurationS:
          stationary === undefined || stationary === null
            ? null
            : finiteNumber(stationary, `${path}.stationaryDurationS`),
        crossed: optionalBoolean(plan.crossed, `${path}.crossed`, false),
        leaderStop: leaderStop as 'NONE' | 'LEADER_OR_QUEUE',
      });
    }),
  );
}

function seedChain(
  baseSeed: number,
  scenarioId: string,
  scenarioSeed: number,
): ExperimentRerunSeedChain {
  return Object.freeze({
    baseSeed,
    baseSeedHex: seedHex(baseSeed),
    scenarioId,
    scenarioSeed,
    scenarioSeedHex: seedHex(scenarioSeed),
    derivation: Object.freeze([
      'deriveScenarioSeed(baseSeed, scenarioId) -> scenarioSeed',
      'deriveVehicleSeed(scenarioSeed, vehicleId) -> vehicleSeed',
      'deriveOpportunitySeed(vehicleSeed, opportunityKey) -> opportunitySeed (the 050/051 sample)',
    ]),
    profileIdentityInSeed: false as const,
  });
}

interface RunInput {
  readonly profile: ExperimentRerunProfile;
  readonly parameters: Readonly<Record<string, number>>;
  readonly plans: readonly OpportunityPlan[];
  readonly state: StateView;
  readonly sessionId: string;
  readonly seed: ExperimentRerunSeedChain;
  readonly requestDigest: string;
  readonly stateIdentity: ExperimentRerunStateIdentity;
  readonly addressing: readonly ExperimentRerunAddressing[];
}

function decideOne(
  plan: OpportunityPlan,
  input: RunInput,
  addressing: ExperimentRerunAddressing,
  profileVersionId: string,
): ExperimentRerunDecision {
  const vehicle = input.state.vehicles.find((row) => row.entityId === plan.vehicleId);
  if (vehicle === undefined) throw new Error(`142 addressing lost ${plan.vehicleId}`);
  const scope = {
    sessionId: input.sessionId,
    worldEpoch: input.state.worldEpoch,
    actor: Object.freeze({ id: plan.vehicleId, incarnation: vehicle.handle }),
  };
  if (plan.kind === 'SIGNAL') {
    if (plan.phase === null || plan.signalId === null) {
      throw new Error(`142 signalized opportunity ${plan.opportunityKey} lost its phase`);
    }
    const decision = evaluateSignalPolicy({
      ...scope,
      decisionTick: plan.decisionTick,
      speedMps: plan.speedMps,
      seed: addressing.vehicleSeed,
      opportunityKey: plan.opportunityKey,
      profile: projectSignalProfile(input.profile.profile),
      observation: Object.freeze({
        version: SIGNAL_POLICY_LIMITS.observationVersion,
        units: 'SI' as const,
        tick: plan.decisionTick,
        signalId: plan.signalId,
        intersectionId: `intersection/${plan.signalId}`,
        movementId: `movement/${plan.signalId}/through`,
        phaseId: `phase/${plan.signalId}/${plan.phase}/${plan.decisionTick}`,
        state: plan.phase,
        phaseElapsedS: plan.phaseElapsedS,
        distanceToStopLineM: plan.distanceToStopLineM,
      }),
    });
    return Object.freeze({
      opportunityKey: plan.opportunityKey,
      kind: plan.kind,
      decisionTick: plan.decisionTick,
      vehicleId: plan.vehicleId,
      profileVersionId,
      action: decision.action,
      reason: decision.reason,
      stopRequested: decision.stopRequested,
      sampledUnit: decision.sampledUnit,
      sampledRole: null,
      threshold: decision.redStopProbability,
      remainingToStopPointM: decision.remainingToStopPointM,
      vehicleSeed: addressing.vehicleSeed,
      opportunitySeed: addressing.opportunitySeed,
    });
  }
  const decision = evaluateStopPolicy({
    ...scope,
    decisionTick: plan.decisionTick,
    seed: addressing.vehicleSeed,
    profile: projectStopProfile(input.profile.profile),
    observation: Object.freeze({
      version: STOP_POLICY_LIMITS.observationVersion,
      units: 'SI' as const,
      tick: plan.decisionTick,
      opportunityId: plan.opportunityKey,
      stopLineId: `stop-line/${plan.opportunityKey}`,
      distanceToStopLineM: plan.distanceToStopLineM,
      speedMps: plan.speedMps,
      stationaryDurationS: plan.stationaryDurationS,
      crossed: plan.crossed,
    }),
    leaderStop: plan.leaderStop,
  });
  return Object.freeze({
    opportunityKey: plan.opportunityKey,
    kind: plan.kind,
    decisionTick: plan.decisionTick,
    vehicleId: plan.vehicleId,
    profileVersionId,
    action: decision.action,
    reason: decision.reason,
    stopRequested: decision.stopRequested,
    sampledUnit: decision.sampledUnit,
    sampledRole: decision.sampledRole,
    threshold: decision.stopFullProbability,
    remainingToStopPointM: decision.remainingToStopPointM,
    vehicleSeed: addressing.vehicleSeed,
    opportunitySeed: addressing.opportunitySeed,
  });
}

function runProfile(input: RunInput): ExperimentRerunRun {
  const decisions: ExperimentRerunDecision[] = [];
  input.plans.forEach((plan, index) => {
    const addressing = input.addressing[index];
    if (addressing === undefined) throw new Error('142 addressing is not aligned with the plans');
    decisions.push(decideOne(plan, input, addressing, input.profile.profile.versionId));
  });
  const byAction: Record<string, number> = {};
  for (const decision of decisions) {
    byAction[decision.action] = (byAction[decision.action] ?? 0) + 1;
  }
  const stopRequested = decisions.filter((decision) => decision.stopRequested).length;
  return Object.freeze({
    profileId: input.profile.profileId,
    profileVersionId: input.profile.profile.versionId,
    parameters: Object.freeze({ ...input.parameters }),
    seed: input.seed,
    requestDigest: input.requestDigest,
    state: input.stateIdentity,
    decisions: Object.freeze(decisions),
    outcome: Object.freeze({
      decisions: decisions.length,
      stopRequested,
      proceeded: decisions.length - stopRequested,
      byAction: Object.freeze(byAction),
    }),
    traceDigest: traceDigest(canonicalText(decisions)),
  });
}

function sameSign(left: number | null, right: number | null): boolean {
  if (left === null || right === null) return left === right;
  return Math.sign(left) === Math.sign(right);
}

/** True when the two probability thresholds put the same sampled unit on different sides. */
function straddles(
  unit: number | null,
  left: number | undefined,
  right: number | undefined,
): boolean {
  if (unit === null || left === undefined || right === undefined) return false;
  return unit < left !== unit < right;
}

/** Names the single parameter that explains a divergent decision, in documented precedence. */
function attributeDivergence(
  left: ExperimentRerunDecision,
  right: ExperimentRerunDecision,
  leftParameters: Readonly<Record<string, number>>,
  rightParameters: Readonly<Record<string, number>>,
): Readonly<{ cause: ExperimentRerunDivergenceCause; parameter: string | null }> {
  if (left.sampledUnit !== right.sampledUnit) {
    return Object.freeze({ cause: 'SEED_DIVERGENCE' as const, parameter: null });
  }
  const differs = (key: ParameterKey): boolean =>
    leftParameters[key] !== rightParameters[key] &&
    leftParameters[key] !== undefined &&
    rightParameters[key] !== undefined;
  /** A cause is only claimed when the parameter that would explain it really differs. */
  const attribute = (
    cause: ExperimentRerunDivergenceCause,
    parameter: ParameterKey,
  ): Readonly<{ cause: ExperimentRerunDivergenceCause; parameter: string | null }> =>
    differs(parameter)
      ? Object.freeze({ cause, parameter })
      : Object.freeze({ cause: 'UNCLASSIFIED' as const, parameter: null });
  if (left.kind === 'STOP') {
    if (left.sampledRole !== right.sampledRole) {
      return attribute('PROBABILITY_THRESHOLD', 'stop_full_probability');
    }
    if (!sameSign(left.remainingToStopPointM, right.remainingToStopPointM)) {
      return attribute('GEOMETRY_PARAMETER', 'stop_line_offset');
    }
    return attribute('GEOMETRY_PARAMETER', 'stop_dwell_time');
  }
  if (
    straddles(
      left.sampledUnit,
      leftParameters.red_stop_probability,
      rightParameters.red_stop_probability,
    )
  ) {
    return Object.freeze({
      cause: 'PROBABILITY_THRESHOLD' as const,
      parameter: 'red_stop_probability' as const,
    });
  }
  if (!sameSign(left.remainingToStopPointM, right.remainingToStopPointM)) {
    return attribute('GEOMETRY_PARAMETER', 'red_stop_line_offset');
  }
  return attribute('GEOMETRY_PARAMETER', 'late_red_brake_threshold');
}

function compareRuns(
  left: ExperimentRerunRun,
  right: ExperimentRerunRun,
  plans: readonly OpportunityPlan[],
): ExperimentRerunComparison {
  const keys = profileKeyUnion(plans);
  const profileDifferences = keys.map((key) =>
    Object.freeze({
      key,
      left: left.parameters[key] ?? Number.NaN,
      right: right.parameters[key] ?? Number.NaN,
      differs: left.parameters[key] !== right.parameters[key],
    }),
  );
  const divergences: ExperimentRerunDivergence[] = [];
  let identical = 0;
  left.decisions.forEach((decision, index) => {
    const other = right.decisions[index];
    if (other === undefined) throw new Error('142 runs are not aligned');
    // The opportunity outcome is `action` + `reason`; a different threshold that does not change the
    // outcome is a profile difference, not an opportunity divergence, so it is not counted twice.
    const same = decision.action === other.action && decision.reason === other.reason;
    if (same) {
      identical += 1;
      return;
    }
    const attribution = attributeDivergence(decision, other, left.parameters, right.parameters);
    const used = new Set<string>(
      decision.kind === 'STOP' ? experimentRerunPolicyKeys.STOP : experimentRerunPolicyKeys.SIGNAL,
    );
    const differences = profileDifferences.filter((entry) => used.has(entry.key));
    divergences.push(
      Object.freeze({
        opportunityKey: decision.opportunityKey,
        kind: decision.kind,
        decisionTick: decision.decisionTick,
        left: decision,
        right: other,
        cause: attribution.cause,
        parameter: attribution.parameter,
        parameters: Object.freeze(differences),
        detail: `${decision.action}/${decision.reason} versus ${other.action}/${other.reason} at tick ${decision.decisionTick}; sampled unit ${String(decision.sampledUnit)} versus ${String(other.sampledUnit)}, threshold ${String(decision.threshold)} versus ${String(other.threshold)}, ${attributeParameterDetail(attribution.parameter, differences)}`,
      }),
    );
  });
  const causeCounts: Record<string, number> = {
    PROBABILITY_THRESHOLD: 0,
    GEOMETRY_PARAMETER: 0,
    SEED_DIVERGENCE: 0,
    UNCLASSIFIED: 0,
  };
  const parameterCounts: Record<string, number> = {};
  for (const divergence of divergences) {
    causeCounts[divergence.cause] = (causeCounts[divergence.cause] ?? 0) + 1;
    if (divergence.parameter !== null) {
      parameterCounts[divergence.parameter] = (parameterCounts[divergence.parameter] ?? 0) + 1;
    }
  }
  const sameSeed =
    left.seed.baseSeed === right.seed.baseSeed &&
    left.seed.scenarioSeed === right.seed.scenarioSeed &&
    left.decisions.every(
      (decision, index) => decision.opportunitySeed === right.decisions[index]?.opportunitySeed,
    );
  return Object.freeze({
    leftProfileVersionId: left.profileVersionId,
    rightProfileVersionId: right.profileVersionId,
    decisions: left.decisions.length,
    identical,
    divergent: divergences.length,
    divergences: Object.freeze(divergences),
    sameRequest: left.requestDigest === right.requestDigest,
    sameSeed,
    sameState: canonicalText(left.state) === canonicalText(right.state),
    profileDifferences: Object.freeze(profileDifferences),
    causeCounts: Object.freeze(causeCounts),
    parameterCounts: Object.freeze(parameterCounts),
    reproducibility: EXPERIMENT_RERUN_REPRODUCIBILITY,
  });
}

function attributeParameterDetail(
  parameter: string | null,
  differences: readonly ExperimentRerunParameterValue[],
): string {
  if (parameter === null) return 'no single profile parameter explains the difference';
  const entry = differences.find((value) => value.key === parameter);
  if (entry === undefined) return `${parameter} is named but is not a differing key`;
  return `${parameter} ${String(entry.left)} versus ${String(entry.right)}`;
}

/* ------------------------------------------------------------------- entry */

/**
 * Loads the 140 snapshot, asserts that the request and the start state are the same one for every
 * profile, reruns the scenario through the real 050/051 policies with the profile's parameters and
 * the same seed chain, and reports the opportunity divergence per opportunity.
 *
 * Nothing is written: the live ledgers are only fingerprinted, and the restored state is read, never
 * mutated.
 */
export function runExperimentRerun(
  request: ExperimentRerunRequest,
  ports: ExperimentSnapshotPorts,
): ExperimentRerunResult {
  requireRequest(request);
  const isolation = createExperimentLedgerIsolation(request.ledger);
  const refusal = (
    stage: ExperimentRerunStage,
    codes: readonly ExperimentRerunRefusalCode[],
    detail: string,
    paths: readonly string[],
    snapshot: ExperimentSnapshotRefused | null = null,
  ): ExperimentRerunRefused =>
    Object.freeze({
      status: 'REFUSED' as const,
      version: EXPERIMENT_RERUN_VERSION,
      experimentId: request.snapshot.experimentId,
      stage,
      codes: Object.freeze([...codes]),
      paths: Object.freeze([...paths]),
      detail,
      snapshot,
      ledger: isolation.verify(),
    });

  const loaded = runExperimentSnapshot({ ...request.snapshot, ledger: isolation }, ports);
  if (loaded.status === 'REFUSED') {
    return refusal(
      'SNAPSHOT',
      ['SNAPSHOT_REFUSED'],
      `The 140 snapshot load refused in ${loaded.stage}: ${loaded.detail}`,
      [],
      loaded,
    );
  }
  const state = readState(loaded.state);
  if (state === null) {
    return refusal(
      'SNAPSHOT',
      ['SNAPSHOT_STATE_UNREADABLE'],
      'The restored 206 state has no readable vehicle, opportunity or signal section',
      ['snapshot.state'],
    );
  }

  const plans = readPlans(request.scenario);
  const scenarioErrors = readScenario(plans, state, request.scenario.ticks);
  const keys = profileKeyUnion(plans);
  const profileErrors: ScenarioError[] = [];
  const profileParameters: Readonly<Record<string, number>>[] = [];
  const seenVersions = new Set<string>();
  request.profiles.forEach((profile, index) => {
    const versionId = profile.profile.versionId;
    if (seenVersions.has(versionId)) {
      profileErrors.push({
        code: 'PROFILE_DUPLICATE',
        path: `profiles[${index}].profile.versionId`,
        detail: `The profile version ${versionId} is compared with itself`,
      });
    }
    seenVersions.add(versionId);
    const checked = checkProfile(profile, index, keys);
    profileErrors.push(...checked.errors);
    if (checked.parameters !== null) profileParameters.push(checked.parameters);
  });
  if (scenarioErrors.length > 0 || profileErrors.length > 0) {
    const errors = [...scenarioErrors, ...profileErrors];
    const codes = [...new Set(errors.map((error) => error.code))].sort();
    const stage: ExperimentRerunStage = scenarioErrors.length > 0 ? 'SCENARIO' : 'PROFILE';
    return refusal(
      stage,
      codes,
      errors.map((error) => `${error.code} at ${error.path}: ${error.detail}`).join('; '),
      errors.map((error) => error.path),
    );
  }

  const scenarioSeed = deriveScenarioSeed(request.baseSeed, request.scenario.scenarioId);
  const seed = seedChain(request.baseSeed, request.scenario.scenarioId, scenarioSeed);
  const addressing = Object.freeze(
    plans.map((plan) => {
      const vehicleSeed = deriveVehicleSeed(scenarioSeed, plan.vehicleId);
      return Object.freeze({
        opportunityKey: plan.opportunityKey,
        vehicleId: plan.vehicleId,
        vehicleSeed,
        opportunitySeed: deriveOpportunitySeed(vehicleSeed, plan.opportunityKey),
      });
    }),
  );
  const stateIdentity: ExperimentRerunStateIdentity = Object.freeze({
    tick: state.tick,
    worldEpoch: state.worldEpoch,
    profileId: state.profileId,
    learningEpoch: state.learningEpoch,
    rngSeed: state.rngSeed,
    checksum: loaded.checksum,
    fields: loaded.fields,
    entities: loaded.entities,
    mismatches: loaded.mismatches.length,
    counts: state.counts,
  });
  const requestDigest = traceDigest(
    canonicalText({
      snapshot: loaded.checksum,
      tick: state.tick,
      baseSeed: request.baseSeed,
      scenarioId: request.scenario.scenarioId,
      ticks: request.scenario.ticks,
      opportunities: plans.map((plan) => ({
        opportunityKey: plan.opportunityKey,
        kind: plan.kind,
        vehicleId: plan.vehicleId,
        decisionTick: plan.decisionTick,
        distanceToStopLineM: plan.distanceToStopLineM,
        speedMps: plan.speedMps,
        phase: plan.phase,
        signalId: plan.signalId,
        phaseElapsedS: plan.phaseElapsedS,
        stationaryDurationS: plan.stationaryDurationS,
        crossed: plan.crossed,
        leaderStop: plan.leaderStop,
      })),
    }),
  );

  const runs: ExperimentRerunRun[] = request.profiles.map((profile, index) => {
    const parameters = profileParameters[index];
    if (parameters === undefined) throw new Error('142 profile validation is misaligned');
    return runProfile({
      profile,
      parameters,
      plans,
      state,
      sessionId: request.snapshot.envelope.sessionId,
      seed,
      requestDigest,
      stateIdentity,
      addressing,
    });
  });

  const comparisons: ExperimentRerunComparison[] = [];
  for (let left = 0; left < runs.length; left += 1) {
    for (let right = left + 1; right < runs.length; right += 1) {
      const leftRun = runs[left];
      const rightRun = runs[right];
      if (leftRun === undefined || rightRun === undefined) continue;
      comparisons.push(compareRuns(leftRun, rightRun, plans));
    }
  }

  const inconsistent = comparisons.filter(
    (comparison) => !comparison.sameRequest || !comparison.sameSeed || !comparison.sameState,
  );
  if (inconsistent.length > 0) {
    return refusal(
      'COMPARISON',
      ['SCENARIO_INVALID'],
      'The runs did not share the request, the seed or the start state',
      inconsistent.map((comparison) => comparison.rightProfileVersionId),
    );
  }

  const ledger = isolation.verify();
  if (!ledger.unchanged) {
    return Object.freeze({
      status: 'REFUSED' as const,
      version: EXPERIMENT_RERUN_VERSION,
      experimentId: request.snapshot.experimentId,
      stage: 'LEDGER' as const,
      codes: Object.freeze(['LEDGER_CHANGED' as const]),
      paths: Object.freeze(ledger.changedLedgers.map((name) => `ledger.${name}`)),
      detail: `Live ledgers changed during the rerun: ${ledger.changedLedgers.join(', ')}`,
      snapshot: null,
      ledger,
    });
  }

  const kinds: Record<string, number> = {};
  for (const plan of plans) kinds[plan.kind] = (kinds[plan.kind] ?? 0) + 1;

  return Object.freeze({
    status: 'RERUN' as const,
    version: EXPERIMENT_RERUN_VERSION,
    experimentId: request.snapshot.experimentId,
    snapshot: Object.freeze({
      checksum: loaded.checksum,
      tick: loaded.tick,
      expectedTick: loaded.expectedTick,
      ticksAdvanced: 0 as const,
      bytes: loaded.bytes,
      versions: loaded.versions,
    }),
    state: stateIdentity,
    scenario: Object.freeze({
      scenarioId: request.scenario.scenarioId,
      ticks: request.scenario.ticks,
      fromTick: state.tick + 1,
      toTick: state.tick + request.scenario.ticks,
      opportunities: plans.length,
      kinds: Object.freeze(kinds),
    }),
    seed,
    addressing,
    runs: Object.freeze(runs),
    comparisons: Object.freeze(comparisons),
    ledger,
    reproducibility: EXPERIMENT_RERUN_REPRODUCIBILITY,
  });
}

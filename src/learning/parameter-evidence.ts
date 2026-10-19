import { parameterDefinitions, parameterRegistry } from '../profiles';
import type { ParameterDefinition, ParameterKey } from '../profiles';
import type { EligibilityWindowRecord } from '../telemetry';
import type { FilteredWindowRecord } from '../telemetry';
import type { OpportunityRecord } from '../telemetry';
import type { NormalizedVehicleWindow } from '../telemetry';

export const PARAMETER_EVIDENCE_VERSION = '093-parameter-evidence-v1' as const;
export const evidenceChannels = [
  'SPEED_SAMPLE', 'HEADWAY_PAIR', 'ACCELERATION', 'DECELERATION', 'STOP_OUTCOME',
  'GREEN_START_DELAY', 'LANE_CHANGE_OUTCOME',
] as const;
export type EvidenceChannel = (typeof evidenceChannels)[number];
export type EstimatorOwner = '094' | '095' | '096' | '097' | '098' | '099';
export interface ParameterEvidenceSpec {
  readonly key: ParameterKey;
  readonly contexts: readonly ('FREE_TRAFFIC' | 'LEADER' | 'BLOCKED_GREEN')[];
  readonly channel: EvidenceChannel;
  readonly unit: ParameterDefinition['unit'];
  readonly min: number;
  readonly max: number;
  readonly minimumEpisodes: number;
  readonly minimumDurationS: number;
  readonly requiresVariedSpeeds: boolean;
  readonly estimatorOwner: EstimatorOwner;
}

const policies: Readonly<Record<string, Omit<ParameterEvidenceSpec, 'key' | 'unit' | 'min' | 'max'>>> = Object.freeze({
  speed_delta_urban: { contexts: ['FREE_TRAFFIC'], channel: 'SPEED_SAMPLE', minimumEpisodes: 1, minimumDurationS: 10, requiresVariedSpeeds: false, estimatorOwner: '095' },
  speed_delta_residential: { contexts: ['FREE_TRAFFIC'], channel: 'SPEED_SAMPLE', minimumEpisodes: 1, minimumDurationS: 10, requiresVariedSpeeds: false, estimatorOwner: '095' },
  curve_lateral_accel: { contexts: ['FREE_TRAFFIC'], channel: 'ACCELERATION', minimumEpisodes: 3, minimumDurationS: 0, requiresVariedSpeeds: false, estimatorOwner: '095' },
  intersection_approach_speed: { contexts: ['FREE_TRAFFIC'], channel: 'SPEED_SAMPLE', minimumEpisodes: 3, minimumDurationS: 0, requiresVariedSpeeds: false, estimatorOwner: '095' },
  desired_acceleration: { contexts: ['FREE_TRAFFIC'], channel: 'ACCELERATION', minimumEpisodes: 3, minimumDurationS: 0, requiresVariedSpeeds: false, estimatorOwner: '095' },
  comfort_deceleration: { contexts: ['FREE_TRAFFIC'], channel: 'DECELERATION', minimumEpisodes: 3, minimumDurationS: 0, requiresVariedSpeeds: false, estimatorOwner: '095' },
  acceleration_jerk: { contexts: ['FREE_TRAFFIC'], channel: 'ACCELERATION', minimumEpisodes: 3, minimumDurationS: 0, requiresVariedSpeeds: false, estimatorOwner: '095' },
  brake_reaction_delay: { contexts: ['FREE_TRAFFIC'], channel: 'DECELERATION', minimumEpisodes: 3, minimumDurationS: 0, requiresVariedSpeeds: false, estimatorOwner: '095' },
  following_time_headway: { contexts: ['LEADER'], channel: 'HEADWAY_PAIR', minimumEpisodes: 3, minimumDurationS: 0, requiresVariedSpeeds: true, estimatorOwner: '095' },
  following_min_gap: { contexts: ['LEADER'], channel: 'HEADWAY_PAIR', minimumEpisodes: 3, minimumDurationS: 0, requiresVariedSpeeds: true, estimatorOwner: '095' },
  queue_standstill_gap: { contexts: ['LEADER'], channel: 'HEADWAY_PAIR', minimumEpisodes: 3, minimumDurationS: 0, requiresVariedSpeeds: false, estimatorOwner: '095' },
  following_speed_gain: { contexts: ['LEADER'], channel: 'HEADWAY_PAIR', minimumEpisodes: 3, minimumDurationS: 0, requiresVariedSpeeds: true, estimatorOwner: '095' },
  red_stop_probability: { contexts: ['FREE_TRAFFIC'], channel: 'STOP_OUTCOME', minimumEpisodes: 3, minimumDurationS: 0, requiresVariedSpeeds: false, estimatorOwner: '095' },
  green_start_delay: { contexts: ['FREE_TRAFFIC'], channel: 'GREEN_START_DELAY', minimumEpisodes: 2, minimumDurationS: 0, requiresVariedSpeeds: false, estimatorOwner: '095' },
  red_stop_line_offset: { contexts: ['FREE_TRAFFIC'], channel: 'STOP_OUTCOME', minimumEpisodes: 3, minimumDurationS: 0, requiresVariedSpeeds: false, estimatorOwner: '095' },
  late_red_brake_threshold: { contexts: ['FREE_TRAFFIC'], channel: 'DECELERATION', minimumEpisodes: 3, minimumDurationS: 0, requiresVariedSpeeds: false, estimatorOwner: '095' },
  stop_full_probability: { contexts: ['FREE_TRAFFIC'], channel: 'STOP_OUTCOME', minimumEpisodes: 3, minimumDurationS: 0, requiresVariedSpeeds: false, estimatorOwner: '095' },
  stop_dwell_time: { contexts: ['FREE_TRAFFIC'], channel: 'STOP_OUTCOME', minimumEpisodes: 3, minimumDurationS: 0, requiresVariedSpeeds: false, estimatorOwner: '095' },
  stop_line_offset: { contexts: ['FREE_TRAFFIC'], channel: 'STOP_OUTCOME', minimumEpisodes: 3, minimumDurationS: 0, requiresVariedSpeeds: false, estimatorOwner: '095' },
  yield_time_gap: { contexts: ['LEADER'], channel: 'HEADWAY_PAIR', minimumEpisodes: 3, minimumDurationS: 0, requiresVariedSpeeds: false, estimatorOwner: '095' },
  lane_change_front_gap: { contexts: ['FREE_TRAFFIC'], channel: 'LANE_CHANGE_OUTCOME', minimumEpisodes: 3, minimumDurationS: 0, requiresVariedSpeeds: false, estimatorOwner: '095' },
  lane_change_back_gap: { contexts: ['FREE_TRAFFIC'], channel: 'LANE_CHANGE_OUTCOME', minimumEpisodes: 3, minimumDurationS: 0, requiresVariedSpeeds: false, estimatorOwner: '095' },
  lane_change_speed_gain: { contexts: ['FREE_TRAFFIC'], channel: 'LANE_CHANGE_OUTCOME', minimumEpisodes: 3, minimumDurationS: 0, requiresVariedSpeeds: false, estimatorOwner: '095' },
  lane_change_cooldown: { contexts: ['FREE_TRAFFIC'], channel: 'LANE_CHANGE_OUTCOME', minimumEpisodes: 3, minimumDurationS: 0, requiresVariedSpeeds: false, estimatorOwner: '095' },
});

const targets = parameterDefinitions.filter((definition) => definition.implementationStage === 'initial_learning_target');
if (targets.length !== 24 || Object.keys(policies).length !== 24 || targets.some((item) => !Object.hasOwn(policies, item.key)) || Object.keys(policies).some((key) => !targets.some((item) => item.key === key))) {
  throw new Error('Parameter evidence policy must exactly cover the 24 M parameters.');
}
export const parameterEvidenceSpecs: readonly ParameterEvidenceSpec[] = Object.freeze(targets.map((definition) => Object.freeze({
  key: definition.key as ParameterKey,
  ...policies[definition.key]!,
  contexts: Object.freeze([...policies[definition.key]!.contexts]),
  unit: definition.unit,
  min: definition.min,
  max: definition.max,
})));
const specsByKey = new Map(parameterEvidenceSpecs.map((spec) => [spec.key, spec]));

export type ParameterEvidenceStatus = 'NO_EVIDENCE' | 'INSUFFICIENT' | 'READY' | 'EXCLUDED';
export interface EvidenceObservation {
  readonly eligibility: EligibilityWindowRecord;
  readonly opportunity: OpportunityRecord;
  readonly artifacts: FilteredWindowRecord;
  readonly normalized?: NormalizedVehicleWindow;
  readonly roadType: string;
  readonly speedSamples?: readonly { readonly tick: number; readonly speedMps: number }[];
  readonly headway?: { readonly gapM: number; readonly speedMps: number };
  readonly stopOutcome?: 'STOPPED' | 'CROSSED_WITHOUT_STOP' | 'HELD' | 'CROSSED';
  readonly greenStartDelayS?: number;
  readonly laneChangeOutcome?: 'COMPLETED' | 'ABORTED';
  readonly eventValue?: number;
}
export interface ParameterEvidenceReadModel {
  readonly key: ParameterKey;
  readonly status: ParameterEvidenceStatus;
  readonly distinctEpisodes: number;
  readonly contextBreakdown: readonly { readonly label: string; readonly roadType: string; readonly speedBand: string; readonly episodes: number }[];
  readonly sampleCount: number;
  readonly quality: number;
  readonly uncertainty: 'NONE' | 'HIGH' | 'MODERATE' | 'LOW';
  readonly unchanged: true;
  readonly noEstimate: string | null;
  readonly value?: never;
  readonly delta?: never;
}

interface Episode { readonly occurrence: number; readonly label: string; readonly roadType: string; readonly speedBand: string; readonly samples: number; }
export interface ParameterEvidenceLedger {
  observe(input: EvidenceObservation): void;
  read(key: ParameterKey): ParameterEvidenceReadModel;
  readAll(): readonly ParameterEvidenceReadModel[];
}
function validNumber(value: number): boolean { return Number.isFinite(value); }
function speedBand(speed: number | undefined): string { return speed === undefined ? 'UNKNOWN' : speed < 5 ? 'LOW' : speed < 15 ? 'MID' : 'HIGH'; }

/** Descriptive evidence only. It cannot produce a profile value or parameter delta. */
export function createParameterEvidenceLedger(): ParameterEvidenceLedger {
  const episodes = new Map<ParameterKey, Map<string, Episode>>();
  for (const spec of parameterEvidenceSpecs) episodes.set(spec.key, new Map());
  function observe(input: EvidenceObservation): void {
    const { eligibility, opportunity, artifacts } = input;
    if (!eligibility || !opportunity || !artifacts) throw new Error('Evidence requires real 086/087/088 facts.');
    if (eligibility.opportunityId !== opportunity.id || artifacts.windowId !== eligibility.windowId || artifacts.segmentId !== eligibility.segmentId || opportunity.kind !== eligibility.kind || opportunity.vehicleId !== eligibility.vehicleId || opportunity.incarnation !== eligibility.incarnation) throw new Error('Mismatched opportunity, eligibility, or artefact context.');
    if (!opportunity.learningEligible || eligibility.learningEligible === false) return;
    if (opportunity.state !== 'RESOLVED' || !opportunity.result) return;
    if (artifacts.windowClass !== 'PREFIX_ELIGIBLE' || !artifacts.prefix || artifacts.prefix.ticks <= 0) return;
    if (eligibility.windowClass === 'EXCLUDED' || (eligibility.windowClass === 'EXTERNAL_CONSTRAINT' && eligibility.label !== 'LEADER')) return;
    const normalized = input.normalized;
    if (normalized && (normalized.opportunityId !== opportunity.id || normalized.windowId !== eligibility.windowId || normalized.eligibilityClass !== 'ELIGIBLE')) throw new Error('Mismatched normalized features.');
    const speedSamples = input.speedSamples?.filter((sample) => Number.isSafeInteger(sample.tick) && sample.tick >= artifacts.prefix!.fromTick && sample.tick <= artifacts.prefix!.toTick && validNumber(sample.speedMps)) ?? [];
    const speed = speedSamples[0]?.speedMps ?? input.headway?.speedMps;
    const band = speedBand(speed);
    const occurrenceKey = `${opportunity.id}\u0000${opportunity.occurrence}`;
    for (const spec of parameterEvidenceSpecs) {
      if (!spec.contexts.includes(eligibility.label as 'FREE_TRAFFIC' | 'LEADER' | 'BLOCKED_GREEN')) continue;
      if (spec.channel === 'SPEED_SAMPLE' && (eligibility.label !== 'FREE_TRAFFIC' || eligibility.windowClass !== 'ELIGIBLE' || normalized?.demandStatus === 'CAPABILITY_LIMITED' || artifacts.prefix.ticks / 60 < spec.minimumDurationS || speedSamples.length === 0)) continue;
      if (spec.key === 'speed_delta_urban' && !/urban/i.test(input.roadType)) continue;
      if (spec.key === 'speed_delta_residential' && !/residential/i.test(input.roadType)) continue;
      if (spec.channel === 'HEADWAY_PAIR' && (eligibility.label !== 'LEADER' || eligibility.windowClass !== 'EXTERNAL_CONSTRAINT' || !input.headway || !validNumber(input.headway.gapM) || !validNumber(input.headway.speedMps))) continue;
      if (spec.channel === 'STOP_OUTCOME' && (!input.stopOutcome || opportunity.kind !== 'STOP' && opportunity.kind !== 'RED')) continue;
      if (spec.channel === 'GREEN_START_DELAY' && (opportunity.kind !== 'GREEN' || eligibility.label !== 'FREE_TRAFFIC' || input.greenStartDelayS === undefined || !validNumber(input.greenStartDelayS))) continue;
      if (spec.channel === 'LANE_CHANGE_OUTCOME' && (opportunity.kind !== 'LANE_CHANGE' || !input.laneChangeOutcome)) continue;
      if ((spec.channel === 'ACCELERATION' || spec.channel === 'DECELERATION') && (!normalized || normalized.windowClass !== 'NORMALIZED' || normalized.demandStatus !== 'INTENTIONAL')) continue;
      const store = episodes.get(spec.key)!;
      const existing = store.get(occurrenceKey);
      store.set(occurrenceKey, Object.freeze({ occurrence: opportunity.occurrence, label: eligibility.label, roadType: input.roadType, speedBand: band, samples: Math.max(existing?.samples ?? 0, normalized?.sampledTicks ?? (speedSamples.length || 1)) }));
    }
  }
  function read(key: ParameterKey): ParameterEvidenceReadModel {
    const spec = specsByKey.get(key);
    if (!spec || !Object.hasOwn(parameterRegistry, key)) throw new Error(`Unknown evidence key: ${key}`);
    const values = [...episodes.get(key)!.values()];
    const distinctEpisodes = values.length;
    const speeds = new Set(values.map((item) => item.speedBand).filter((item) => item !== 'UNKNOWN'));
    const enough = distinctEpisodes >= spec.minimumEpisodes && (!spec.requiresVariedSpeeds || speeds.size > 1);
    const breakdownMap = new Map<string, { label: string; roadType: string; speedBand: string; episodes: number }>();
    for (const episode of values) {
      const k = `${episode.label}|${episode.roadType}|${episode.speedBand}`;
      const row = breakdownMap.get(k) ?? { label: episode.label, roadType: episode.roadType, speedBand: episode.speedBand, episodes: 0 };
      row.episodes += 1; breakdownMap.set(k, row);
    }
    const status: ParameterEvidenceStatus = distinctEpisodes === 0 ? 'NO_EVIDENCE' : enough ? 'READY' : 'INSUFFICIENT';
    return Object.freeze({ key, status, distinctEpisodes, contextBreakdown: Object.freeze([...breakdownMap.values()].map((row) => Object.freeze(row))), sampleCount: values.reduce((sum, item) => sum + item.samples, 0), quality: enough ? 1 : 0, uncertainty: distinctEpisodes === 0 ? 'NONE' : enough ? 'MODERATE' : 'HIGH', unchanged: true, noEstimate: status === 'NO_EVIDENCE' ? 'NO_QUALIFYING_EVIDENCE' : status === 'INSUFFICIENT' ? 'INSUFFICIENT_DISTINCT_EPISODES_OR_VARIATION' : 'ESTIMATOR_NOT_IMPLEMENTED' });
  }
  return Object.freeze({ observe, read, readAll: () => Object.freeze(parameterEvidenceSpecs.map((spec) => read(spec.key))) });
}

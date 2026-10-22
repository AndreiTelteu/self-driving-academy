import { requireContract, record, text } from '../sessions';

/** Version of the closed mission definition and lifecycle contract (116). */
export const MISSION_SCHEMA_VERSION = '116-mission-schema-v1' as const;

/**
 * Fixed budgets. A catalog, an event stream or a replay loop cannot grow these values, and no
 * unbounded history is retained: recent per-instance event ids are a short evidence window while
 * the tracker-wide ledger is a bounded FIFO that drops the oldest key with an explicit counter.
 */
export const MISSION_LIMITS = Object.freeze({
  version: MISSION_SCHEMA_VERSION,
  /** Authored campaign missions in one catalog. */
  missions: 32,
  /** Objectives in one mission definition. */
  objectivesPerMission: 8,
  /** Rewards in one mission definition. */
  rewardsPerMission: 4,
  /** Concurrent active mission instances. */
  activeInstances: 16,
  /** Retained instances, including terminal outcomes; older ones are evicted with a counter. */
  retainedInstances: 64,
  /** Replay attempts per mission id. */
  attemptsPerMission: 8,
  /** Distinct event identities remembered for progress idempotency (FIFO). */
  retainedEvents: 8192,
  /** Total UTF-16 code units retained by the event fingerprints; the oldest are dropped first. */
  eventCodeUnits: 1_048_576,
  /** Distinct reward identities remembered for reward idempotency (FIFO). */
  retainedRewards: 4096,
  /** Recent event ids kept per instance as evidence; the global ledger owns deduplication. */
  recentEventsPerInstance: 16,
  /** Comparison profiles a replay declaration may name. */
  comparisonProfiles: 4,
  /** Bounded per-vehicle manual/collision fact sets. */
  vehicleFlags: 1024,
  /** Code units per mission, objective, reward, instance and unlock identity. */
  idCodeUnits: 256,
  /** Code units per encoded instance identity (stable 006 id with length prefixes). */
  instanceIdCodeUnits: 768,
  /** Code units per encoded reward identity. */
  rewardIdCodeUnits: 768,
  /** Code units per event identity (a stable ride id can exceed the authored id limit). */
  eventIdCodeUnits: 768,
  /** Code units per authored title/label. */
  titleCodeUnits: 160,
  /** Code units per definition version. */
  versionCodeUnits: 32,
});

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Stable 006 identity with a bounded, trimmed code-unit length. */
export function boundedId(value: unknown, maximum: number, label: string): string {
  const id = text(value);
  requireContract(
    id.length <= maximum && id.trim() === id,
    `Invalid ${label} identity or code-unit length`,
  );
  return id;
}

/** Explicit allowed-field check with a domain label; required keys are checked by the caller. */
export function plainFields(
  value: unknown,
  allowed: readonly string[],
  label: string,
): Record<string, unknown> {
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract((allowed as readonly string[]).includes(key), `Unknown ${label} field: ${key}`);
  return data;
}

export function requireRequired(data: Record<string, unknown>, key: string, label: string): void {
  requireContract(data[key] !== undefined, `Missing ${label} field: ${key}`);
}

/** Sorted, frozen string set used by evidence and report rows. */
export function frozenSorted(values: Iterable<string>): readonly string[] {
  return Object.freeze([...values].sort(compareText));
}

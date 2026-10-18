import {
  fields,
  list,
  record,
  text,
  nullable,
  number,
  boolean,
  tick as readTick,
  requireContract,
  createStableId,
} from '../sessions';
import { FIXED_TICK_HZ } from '../simulation';
import { parseMapPriorityPolicy } from './priority-policy';
import type { MapPriorityPolicy, MapPriorityRule } from './priority-policy';
import { predictPriorityArrival } from './priority-arrival';
import type { PriorityArrival } from './priority-arrival';
export interface ConflictDistance {
  readonly relationId: string;
  /** Authoritative signed remaining route distance to this conflict entry, in metres. */
  readonly distanceM: number;
  /** Distance from entry to complete clearance, including the vehicle envelope, in metres. */
  readonly clearanceM: number;
}
export interface PriorityActor {
  readonly vehicleId: string;
  readonly incarnation: string;
  readonly intersectionId: string | null;
  readonly movementId: string | null;
  readonly speedMps: number;
  readonly active: boolean;
  readonly observable: boolean;
  readonly conflictDistances: readonly ConflictDistance[];
}
export interface PriorityObservation {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
  readonly subject: PriorityActor;
  readonly traffic: readonly PriorityActor[];
  /** False means missing coverage, never an empty road proven by an empty array. */
  readonly trafficComplete: boolean;
  readonly discontinuity: boolean;
}
export interface PriorityGap {
  readonly relationId: string;
  readonly otherVehicleId: string;
  readonly otherIncarnation: string;
  readonly priority: 'YIELD' | 'PRIORITY' | 'EQUAL';
  readonly subjectArrival: PriorityArrival | null;
  readonly otherArrival: PriorityArrival | null;
  readonly gap: 'BLOCKED' | 'AVAILABLE' | 'UNKNOWN';
  readonly eligible: boolean;
}
export interface PriorityEvidence {
  readonly id: string;
  readonly tick: number;
  readonly relationIds: readonly string[];
  readonly kind: 'YIELD_OBSERVED' | 'CROSSED_WITH_PRIORITY_EXPOSURE';
  /** Physical observation/context only; never automatic learning eligibility or reward. */
  readonly learningEligible: null;
}
export interface PriorityEvaluation {
  readonly tick: number;
  readonly status: 'NO_EXPOSURE' | 'EXPOSURE' | 'UNKNOWN';
  readonly hasPriorityExposure: boolean;
  readonly gaps: readonly PriorityGap[];
  readonly recordedEvidence: readonly PriorityEvidence[];
}
export interface PriorityRuleOptions {
  readonly minGapS?: number;
  readonly horizonS?: number;
  readonly yieldHoldS?: number;
  readonly holdZoneM?: number;
  readonly holdTravelToleranceM?: number;
  readonly motionToleranceM?: number;
  readonly maxVehicles?: number;
  readonly maxIncarnations?: number;
  readonly maxTraffic?: number;
  readonly maxDistanceEntries?: number;
  readonly maxObservationCodeUnits?: number;
}
interface Hold {
  readonly startedTick: number;
  readonly ticks: number;
  readonly travelM: number;
  readonly yielded: boolean;
  readonly relationKey: string;
}
interface History {
  readonly incarnation: string;
  readonly tick: number;
  readonly fingerprint: string;
  readonly subject: PriorityActor;
  readonly hold: Hold | null;
  readonly result: PriorityEvaluation;
}
export interface PriorityRules {
  readonly policy: MapPriorityPolicy;
  observe(value: unknown): PriorityEvaluation;
  getRule(intersectionId: string, a: string, b: string): MapPriorityRule | null;
  forgetVehicle(id: string): void;
  advanceWorldEpoch(next: number): void;
  getStats(): Readonly<{
    rules: number;
    vehicles: number;
    incarnations: number;
    retainedObservationCodeUnits: number;
    worldEpoch: number;
    disposed: boolean;
  }>;
  dispose(): void;
}
function identity(value: unknown): string {
  const id = text(value);
  requireContract(id.length <= 256, 'Priority identity exceeds256characters');
  return id;
}
function boundedList<T>(
  value: unknown,
  capacity: number,
  read: (value: unknown) => T,
): readonly T[] {
  requireContract(
    Array.isArray(value) && value.length <= capacity,
    'Priority observation capacity exceeded',
  );
  return list(value, read);
}
const pairKey = (intersection: string, a: string, b: string) =>
  JSON.stringify([intersection, ...[a, b].sort()]);
const actorKey = (id: string, incarnation: string) => JSON.stringify([id, incarnation]);
/** Explicit map policy plus authoritative observable traffic. Never creates evidence from absence. */
export function createPriorityRules(
  mapInput: unknown,
  policyInput: unknown,
  context: { readonly sessionId: string; readonly worldEpoch: number },
  options: PriorityRuleOptions = {},
): PriorityRules {
  const settings = record(options);
  requireContract(
    Object.keys(settings).every((key) =>
      [
        'minGapS',
        'horizonS',
        'yieldHoldS',
        'holdZoneM',
        'holdTravelToleranceM',
        'motionToleranceM',
        'maxVehicles',
        'maxIncarnations',
        'maxTraffic',
        'maxDistanceEntries',
        'maxObservationCodeUnits',
      ].includes(key),
    ),
    'Unknown priority option',
  );
  const world = fields(context, ['sessionId', 'worldEpoch']),
    sessionId = identity(world.sessionId);
  let worldEpoch = readTick(world.worldEpoch),
    watermark = 0,
    disposed = false;
  const minGapS = number(settings.minGapS ?? 2, 0, 10),
    horizonS = number(settings.horizonS ?? 10, 0.01, 60),
    holdZoneM = number(settings.holdZoneM ?? 3, 0.01, 20),
    holdToleranceM = number(settings.holdTravelToleranceM ?? 0.01, 0, 0.1);
  const holdTicks = Math.max(
    1,
    Math.ceil(number(settings.yieldHoldS ?? 0.25, 0, 4) * FIXED_TICK_HZ),
  );
  const motionToleranceM = number(settings.motionToleranceM ?? 0.05, 0, 1);
  const maxVehicles = number(settings.maxVehicles ?? 128, 1, 512),
    maxIncarnations = number(settings.maxIncarnations ?? 4096, maxVehicles, 100000),
    maxTraffic = number(settings.maxTraffic ?? 128, 0, 512),
    maxDistanceEntries = number(settings.maxDistanceEntries ?? 4096, 0, 16384),
    maxCodeUnits = number(settings.maxObservationCodeUnits ?? 65536, 1, 131072);
  for (const capacity of [
    maxVehicles,
    maxIncarnations,
    maxTraffic,
    maxDistanceEntries,
    maxCodeUnits,
  ])
    requireContract(Number.isSafeInteger(capacity), 'Priority capacities must be integers');
  const { policy, conflicts } = parseMapPriorityPolicy(policyInput, mapInput);
  const rules = new Map(
    policy.rules.map((rule) => [pairKey(rule.intersectionId, ...rule.movementIds), rule]),
  );
  const relationRules = new Map(
    policy.rules.map((rule) => [
      conflicts.getRelation(rule.intersectionId, ...rule.movementIds)!.id,
      rule,
    ]),
  );
  const histories = new Map<string, History>(),
    incarnations = new Set<string>();
  function readObservation(value: unknown): PriorityObservation {
    const data = fields(value, [
      'schemaVersion',
      'units',
      'sessionId',
      'worldEpoch',
      'tick',
      'subject',
      'traffic',
      'trafficComplete',
      'discontinuity',
    ]);
    requireContract(
      data.schemaVersion === 1 && data.units === 'SI',
      'Unsupported priority observation units/version',
    );
    requireContract(
      identity(data.sessionId) === sessionId && readTick(data.worldEpoch) === worldEpoch,
      'Stale/foreign priority world',
    );
    let distanceCount = 0;
    const readActor = (value: unknown): PriorityActor => {
      const actor = fields(value, [
        'vehicleId',
        'incarnation',
        'intersectionId',
        'movementId',
        'speedMps',
        'active',
        'observable',
        'conflictDistances',
      ]);
      const intersectionId = nullable(actor.intersectionId, identity),
        movementId = nullable(actor.movementId, identity);
      requireContract(
        (intersectionId === null) === (movementId === null),
        'Priority route IDs must both be known or null',
      );
      requireContract(Array.isArray(actor.conflictDistances), 'Expected conflict distances');
      distanceCount += actor.conflictDistances.length;
      requireContract(
        distanceCount <= maxDistanceEntries,
        'Priority distance entry capacity exceeded',
      );
      const seen = new Set<string>();
      const distances = boundedList(actor.conflictDistances, 128, (value) => {
        const datum = fields(value, ['relationId', 'distanceM', 'clearanceM']),
          relationId = text(datum.relationId);
        const rule = relationRules.get(relationId);
        requireContract(
          rule !== undefined &&
            rule.intersectionId === intersectionId &&
            movementId !== null &&
            rule.movementIds.includes(movementId),
          'Conflict distance does not belong to actor movement/policy',
        );
        requireContract(!seen.has(relationId), 'Duplicate conflict distance');
        seen.add(relationId);
        return Object.freeze({
          relationId,
          distanceM: number(datum.distanceM, -1e6, 1e6),
          clearanceM: number(datum.clearanceM, 0.001, 100),
        });
      });
      return Object.freeze({
        vehicleId: identity(actor.vehicleId),
        incarnation: identity(actor.incarnation),
        intersectionId,
        movementId,
        speedMps: number(actor.speedMps, 0, 100),
        active: boolean(actor.active),
        observable: boolean(actor.observable),
        conflictDistances: Object.freeze(
          [...distances].sort((a, b) => (a.relationId < b.relationId ? -1 : 1)),
        ),
      });
    };
    const subject = readActor(data.subject),
      seen = new Set<string>([subject.vehicleId]);
    const traffic = boundedList(data.traffic, maxTraffic, (value) => {
      const actor = readActor(value);
      requireContract(!seen.has(actor.vehicleId), 'Duplicate traffic/subject vehicle ID');
      seen.add(actor.vehicleId);
      return actor;
    });
    return Object.freeze({
      schemaVersion: 1,
      units: 'SI',
      sessionId,
      worldEpoch,
      tick: readTick(data.tick),
      subject,
      traffic: Object.freeze([...traffic].sort((a, b) => (a.vehicleId < b.vehicleId ? -1 : 1))),
      trafficComplete: boolean(data.trafficComplete),
      discontinuity: boolean(data.discontinuity),
    });
  }
  function evaluate(observation: PriorityObservation): {
    result: PriorityEvaluation;
    eligible: Set<string>;
  } {
    const subject = observation.subject,
      gaps: PriorityGap[] = [],
      eligible = new Set<string>();
    let unknown =
      observation.discontinuity ||
      !observation.trafficComplete ||
      !subject.active ||
      !subject.observable ||
      subject.movementId === null ||
      subject.intersectionId === null;
    if (!unknown && !conflicts.getMovement(subject.intersectionId!, subject.movementId!))
      unknown = true;
    for (const other of observation.traffic) {
      if (!other.active) continue;
      if (!other.observable) {
        unknown = true;
        continue;
      }
      if (other.intersectionId === null || other.movementId === null) {
        unknown = true;
        continue;
      }
      if (!conflicts.getMovement(other.intersectionId, other.movementId)) {
        unknown = true;
        continue;
      }
      if (
        subject.intersectionId === null ||
        subject.movementId === null ||
        other.intersectionId !== subject.intersectionId ||
        other.movementId === subject.movementId
      )
        continue;
      const relation = conflicts.getRelation(
        subject.intersectionId!,
        subject.movementId!,
        other.movementId,
      );
      if (!relation?.incompatible) continue;
      const rule = rules.get(
        pairKey(subject.intersectionId!, subject.movementId!, other.movementId),
      )!;
      const priority =
        rule.priorityMovementId === null
          ? 'EQUAL'
          : rule.priorityMovementId === subject.movementId
            ? 'PRIORITY'
            : 'YIELD';
      const mine = subject.conflictDistances.find((d) => d.relationId === relation.id),
        theirs = other.conflictDistances.find((d) => d.relationId === relation.id);
      const subjectArrival = mine
          ? predictPriorityArrival(mine.distanceM, mine.clearanceM, subject.speedMps)
          : null,
        otherArrival = theirs
          ? predictPriorityArrival(theirs.distanceM, theirs.clearanceM, other.speedMps)
          : null;
      let gap: PriorityGap['gap'] = 'AVAILABLE',
        isEligible = false;
      if (!mine || !theirs) {
        gap = 'UNKNOWN';
        unknown = true;
      } else if (
        subjectArrival!.state !== 'CLEARED' &&
        otherArrival!.state !== 'CLEARED' &&
        otherArrival!.state !== 'STATIONARY'
      ) {
        const nearSubject =
          subjectArrival!.state === 'STATIONARY'
            ? mine.distanceM <= holdZoneM
            : subjectArrival!.timeToEntryS !== null && subjectArrival!.timeToEntryS <= horizonS;
        const nearOther =
          otherArrival!.timeToEntryS !== null && otherArrival!.timeToEntryS <= horizonS;
        if (nearSubject && nearOther) {
          isEligible = priority === 'YIELD';
          if (subjectArrival!.state === 'STATIONARY')
            gap = otherArrival!.timeToEntryS! <= minGapS ? 'BLOCKED' : 'UNKNOWN';
          else {
            const ownEntry = subjectArrival!.timeToEntryS!,
              ownExit = subjectArrival!.timeToExitS;
            const otherEntry = otherArrival!.timeToEntryS!,
              otherExit = otherArrival!.timeToExitS;
            gap =
              (otherExit === null || ownEntry <= otherExit + minGapS) &&
              (ownExit === null || otherEntry <= ownExit + minGapS)
                ? 'BLOCKED'
                : 'AVAILABLE';
          }
        }
      }
      if (isEligible && gap === 'BLOCKED') eligible.add(relation.id);
      gaps.push(
        Object.freeze({
          relationId: relation.id,
          otherVehicleId: other.vehicleId,
          otherIncarnation: other.incarnation,
          priority,
          subjectArrival,
          otherArrival,
          gap,
          eligible: isEligible,
        }),
      );
    }
    if (unknown) eligible.clear();
    return {
      result: Object.freeze({
        tick: observation.tick,
        status: unknown ? 'UNKNOWN' : gaps.some((g) => g.eligible) ? 'EXPOSURE' : 'NO_EXPOSURE',
        hasPriorityExposure: !unknown && gaps.some((g) => g.eligible),
        gaps: Object.freeze(
          unknown
            ? gaps.map((g) => Object.freeze({ ...g, gap: 'UNKNOWN' as const, eligible: false }))
            : gaps,
        ),
        recordedEvidence: Object.freeze([]),
      }),
      eligible,
    };
  }
  return Object.freeze({
    policy,
    getRule: (intersection: string, a: string, b: string) =>
      rules.get(pairKey(intersection, a, b)) ?? null,
    observe(value: unknown): PriorityEvaluation {
      requireContract(!disposed, 'Priority rules disposed');
      const observation = readObservation(value),
        subject = observation.subject;
      const fingerprint = JSON.stringify(observation);
      requireContract(
        fingerprint.length <= maxCodeUnits,
        'Priority observation code-unit capacity exceeded',
      );
      requireContract(observation.tick >= watermark, 'Priority tick precedes watermark');
      const previous = histories.get(subject.vehicleId),
        incarnationKey = actorKey(subject.vehicleId, subject.incarnation);
      if (previous?.incarnation === subject.incarnation && observation.tick === previous.tick) {
        requireContract(
          previous.fingerprint === fingerprint,
          'Conflicting priority observation in same tick',
        );
        return Object.freeze({ ...previous.result, recordedEvidence: Object.freeze([]) });
      }
      if (previous?.incarnation === subject.incarnation)
        requireContract(observation.tick > previous.tick, 'Stale priority observation');
      else {
        requireContract(!incarnations.has(incarnationKey), 'Retired priority incarnation');
        requireContract(
          incarnations.size < maxIncarnations,
          'Priority incarnation capacity exhausted',
        );
      }
      requireContract(
        previous !== undefined || histories.size < maxVehicles,
        'Priority vehicle capacity exhausted',
      );
      const historyContinuous =
        previous?.incarnation === subject.incarnation && observation.tick === previous.tick + 1;
      const motionUnknown =
        historyContinuous &&
        (subject.intersectionId !== previous!.subject.intersectionId ||
          subject.movementId !== previous!.subject.movementId ||
          subject.conflictDistances.some((d) => {
            const old = previous!.subject.conflictDistances.find(
              (candidate) => candidate.relationId === d.relationId,
            );
            return (
              old !== undefined &&
              (Math.abs(old.distanceM - d.distanceM) >
                Math.max(previous!.subject.speedMps, subject.speedMps) / FIXED_TICK_HZ +
                  motionToleranceM ||
                Math.abs(old.clearanceM - d.clearanceM) > 1e-9)
            );
          }));
      const continuityUnknown =
        previous?.incarnation === subject.incarnation && (!historyContinuous || motionUnknown);
      const evaluated = evaluate(
          continuityUnknown ? { ...observation, discontinuity: true } : observation,
        ),
        evidence: PriorityEvidence[] = [];
      const continuous =
        historyContinuous &&
        !continuityUnknown &&
        !observation.discontinuity &&
        previous!.result.status !== 'UNKNOWN' &&
        evaluated.result.status !== 'UNKNOWN';
      const relationIds = [...evaluated.eligible].sort();
      const distances = relationIds.map((id) =>
        subject.conflictDistances.find((d) => d.relationId === id)!,
      );
      const oldDistances = continuous
        ? distances.map((d) =>
            previous!.subject.conflictDistances.find((old) => old.relationId === d.relationId),
          )
        : [];
      const stationary =
        distances.length > 0 &&
        subject.speedMps <= 0.01 &&
        distances.every((d) => d.distanceM > 0 && d.distanceM <= holdZoneM);
      const relationKey = JSON.stringify(relationIds);
      let hold: Hold | null = null;
      if (stationary) {
        const tracked =
          continuous &&
          previous!.hold !== null &&
          previous!.hold.relationKey === relationKey &&
          previous!.subject.speedMps <= 0.01 &&
          oldDistances.every((d) => d !== undefined && d.distanceM > 0);
        const stepTravel = tracked
          ? Math.max(...distances.map((d, i) => Math.abs(d.distanceM - oldDistances[i]!.distanceM)))
          : 0;
        const travelM = tracked ? previous!.hold!.travelM + stepTravel : 0;
        const still = tracked && travelM <= holdToleranceM;
        const ticks = still ? previous!.hold!.ticks + 1 : 0,
          startedTick = still ? previous!.hold!.startedTick : observation.tick;
        let yielded = still ? previous!.hold!.yielded : false;
        if (ticks >= holdTicks && !yielded) {
          yielded = true;
          evidence.push(
            Object.freeze({
              id: createStableId('priority-yield', sessionId, [
                String(worldEpoch),
                policy.mapId,
                policy.versionId,
                subject.vehicleId,
                subject.incarnation,
                String(startedTick),
              ]),
              tick: observation.tick,
              relationIds: Object.freeze(relationIds),
              kind: 'YIELD_OBSERVED',
              learningEligible: null,
            }),
          );
        }
        hold = Object.freeze({
          startedTick,
          ticks,
          travelM: still ? travelM : 0,
          yielded,
          relationKey,
        });
      }
      const crossed: string[] = [];
      if (continuous) {
        const candidates = subject.conflictDistances.filter((d) => {
          const old = previous!.subject.conflictDistances.find(
            (candidate) => candidate.relationId === d.relationId,
          );
          return old !== undefined && old.distanceM > 0 && d.distanceM <= 0;
        });
        if (candidates.length) {
          // The bounded fingerprint is our own validated serialization; decode only for a swept crossing.
          const oldObservation = JSON.parse(previous!.fingerprint) as PriorityObservation;
          for (const datum of candidates) {
            const rule = relationRules.get(datum.relationId)!;
            if (rule.priorityMovementId === null || rule.priorityMovementId === subject.movementId)
              continue;
            const oldDatum = previous!.subject.conflictDistances.find(
              (d) => d.relationId === datum.relationId,
            )!;
            const fraction = oldDatum.distanceM / (oldDatum.distanceM - datum.distanceM);
            const exposed = observation.traffic.some((other) => {
              if (
                !other.active ||
                !other.observable ||
                other.intersectionId !== subject.intersectionId ||
                other.movementId !== rule.priorityMovementId
              )
                return false;
              const oldOther = oldObservation.traffic.find(
                (actor) =>
                  actor.vehicleId === other.vehicleId &&
                  actor.incarnation === other.incarnation &&
                  actor.movementId === other.movementId &&
                  actor.intersectionId === other.intersectionId &&
                  actor.active &&
                  actor.observable,
              );
              const now = other.conflictDistances.find((d) => d.relationId === datum.relationId),
                old = oldOther?.conflictDistances.find((d) => d.relationId === datum.relationId);
              if (
                !now ||
                !old ||
                Math.abs(now.distanceM - old.distanceM) >
                  Math.max(other.speedMps, oldOther!.speedMps) / FIXED_TICK_HZ + motionToleranceM ||
                Math.abs(now.clearanceM - old.clearanceM) > 1e-9
              )
                return false;
              const arrival = predictPriorityArrival(
                old.distanceM + (now.distanceM - old.distanceM) * fraction,
                now.clearanceM,
                other.speedMps,
              );
              if (
                arrival.state === 'CLEARED' ||
                arrival.state === 'STATIONARY' ||
                arrival.timeToEntryS === null ||
                arrival.timeToEntryS > horizonS
              )
                return false;
              const ownExit = subject.speedMps > 0.01 ? datum.clearanceM / subject.speedMps : null;
              return ownExit === null || arrival.timeToEntryS <= ownExit + minGapS;
            });
            if (exposed) crossed.push(datum.relationId);
          }
        }
      }
      if (crossed.length)
        evidence.push(
          Object.freeze({
            id: createStableId('priority-crossing', sessionId, [
              String(worldEpoch),
              policy.mapId,
              policy.versionId,
              subject.vehicleId,
              subject.incarnation,
              String(observation.tick),
            ]),
            tick: observation.tick,
            relationIds: Object.freeze(crossed),
            kind: 'CROSSED_WITH_PRIORITY_EXPOSURE',
            learningEligible: null,
          }),
        );
      const result = Object.freeze({
        ...evaluated.result,
        recordedEvidence: Object.freeze(evidence),
      });
      histories.set(subject.vehicleId, {
        incarnation: subject.incarnation,
        tick: observation.tick,
        fingerprint,
        subject,
        hold,
        result,
      });
      incarnations.add(incarnationKey);
      watermark = observation.tick;
      return result;
    },
    forgetVehicle(id: string) {
      requireContract(!disposed, 'Priority rules disposed');
      histories.delete(identity(id));
    },
    advanceWorldEpoch(value: number) {
      requireContract(!disposed, 'Priority rules disposed');
      const next = readTick(value);
      requireContract(next > worldEpoch, 'Priority world epoch must increase');
      worldEpoch = next;
      watermark = 0;
      histories.clear();
      incarnations.clear();
    },
    getStats: () =>
      Object.freeze({
        rules: rules.size,
        vehicles: histories.size,
        incarnations: incarnations.size,
        retainedObservationCodeUnits: [...histories.values()].reduce(
          (sum, h) => sum + h.fingerprint.length,
          0,
        ),
        worldEpoch,
        disposed,
      }),
    dispose() {
      if (disposed) return;
      disposed = true;
      histories.clear();
      incarnations.clear();
    },
  });
}

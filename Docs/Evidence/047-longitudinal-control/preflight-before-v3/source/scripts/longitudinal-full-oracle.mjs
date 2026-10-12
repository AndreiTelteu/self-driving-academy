import assert from 'node:assert/strict';
import { referenceCruise } from '../tests/autonomy/cruise-targets-reference.ts';
import { referenceLongitudinal } from '../tests/autonomy/longitudinal-reference.ts';
// Documented046 result reasons, independently enumerated; no production047 import.
export const USABLE_CRUISE_REASONS = Object.freeze([
  'FREE_ROAD',
  'MECHANICAL_COVERAGE_CAP',
  'INTERSECTION_APPROACH',
  'CURVE_PREFERENCE',
  'BEHAVIOR_STOP',
  'BEHAVIOR_YIELD',
  'BEHAVIOR_BLOCKED',
  'BEHAVIOR_SERVICE',
  'MECHANICALLY_INFEASIBLE_RADIUS',
]);
export const ALL_CRUISE_REASONS = Object.freeze([
  ...USABLE_CRUISE_REASONS,
  'NO_AUTO_AUTHORITY',
  'MISSING_PROFILE',
  'MISSING_CONTEXT',
  'FOREIGN_CONTEXT',
  'STALE_CONTEXT',
  'CONTEXT_DISCONTINUITY',
  'INCOMPLETE_CONTEXT',
  'MISSING_BEHAVIOR',
  'FOREIGN_OR_STALE_BEHAVIOR',
  'PROFILE_VERSION_MISMATCH',
  'MISSING_ROAD_FACTS',
  'FOREIGN_ROAD_FACTS',
  'UNSUPPORTED_ROAD_KIND',
]);
export function referenceFullCruise(
  values,
  roadKind,
  posted,
  radius,
  intersection,
  state,
  minimumRadius,
) {
  return posted === null
    ? 0
    : referenceCruise(values, roadKind, posted, radius, intersection, state, minimumRadius);
}
export function referenceFullLongitudinal(state, values, speed, target, tick, config) {
  if (!target || !USABLE_CRUISE_REASONS.includes(target.reason))
    return {
      state: { acceleration: 0, brakeEventTick: null },
      throttle: 0,
      brake: 0,
      accelerationMps2: 0,
      brakeEventTick: null,
      phase: 'RELEASED',
    };
  return referenceLongitudinal(
    state,
    values,
    speed,
    target.targetMps,
    tick,
    config.massKg,
    config.powerW,
    config.engineForceN,
    config.brakeAcceleration,
  );
}
export function recordFullReason(counts, reason) {
  assert(ALL_CRUISE_REASONS.includes(reason), 'Unknown046 fixture reason');
  counts[reason] = (counts[reason] ?? 0) + 1;
  assert(Number.isSafeInteger(counts[reason]) && counts[reason] <= 990000, 'Bounded reason count');
}
export function assertFiniteFullBody(body) {
  for (const value of [
    ...Object.values(body.transform.positionM),
    ...Object.values(body.transform.rotationQuaternion),
    ...Object.values(body.velocityMps),
    ...Object.values(body.angularVelocityRadps),
  ])
    assert(Number.isFinite(value), 'Nonfinite actual native body');
}

/**
 * Independent scalar oracle prepared before the 050 production policy. No parsing, ownership,
 * randomness or FSM composition: the caller supplies the already-sampled compliance unit.
 */
export interface ReferenceSignalInput {
  readonly redStopProbability: number;
  readonly greenStartDelayS: number;
  readonly redStopLineOffsetM: number;
  readonly lateRedBrakeThresholdS: number;
  readonly state: 'RED' | 'YELLOW' | 'GREEN';
  readonly phaseElapsedS: number;
  readonly distanceToStopLineM: number | null;
  readonly speedMps: number;
  readonly complianceSample: number;
}
export interface ReferenceSignalDecision {
  readonly action: 'PROCEED' | 'START_DELAY' | 'STOP';
  readonly reason:
    | 'GREEN_RELEASE'
    | 'GREEN_START_DELAY'
    | 'STOP_LINE_APPROACH'
    | 'STOP_LINE_HOLD'
    | 'CROSS_RED_BY_PROFILE'
    | 'LATE_RED_BRAKE';
  readonly stopRequested: boolean;
  readonly remainingToStopPointM: number | null;
}
export function referenceSignal(input: ReferenceSignalInput): ReferenceSignalDecision {
  const distance = input.distanceToStopLineM,
    remaining = distance === null ? null : distance - input.redStopLineOffsetM;
  if (input.state === 'GREEN') {
    const slowStart = input.speedMps <= 0.1 && input.phaseElapsedS < input.greenStartDelayS;
    return Object.freeze({
      action: slowStart ? 'START_DELAY' : 'PROCEED',
      reason: slowStart ? 'GREEN_START_DELAY' : 'GREEN_RELEASE',
      stopRequested: slowStart,
      remainingToStopPointM: remaining,
    });
  }
  if (input.complianceSample < input.redStopProbability)
    return Object.freeze({
      action: 'STOP',
      reason: remaining !== null && remaining <= 0 ? 'STOP_LINE_HOLD' : 'STOP_LINE_APPROACH',
      stopRequested: true,
      remainingToStopPointM: remaining,
    });
  if (distance === null || (remaining !== null && remaining < 0))
    return Object.freeze({
      action: 'PROCEED',
      reason: 'CROSS_RED_BY_PROFILE',
      stopRequested: false,
      remainingToStopPointM: remaining,
    });
  const timeToLineS = distance / Math.max(input.speedMps, 0.1);
  const braking = timeToLineS >= input.lateRedBrakeThresholdS;
  return Object.freeze({
    action: braking ? 'STOP' : 'PROCEED',
    reason: braking ? 'LATE_RED_BRAKE' : 'CROSS_RED_BY_PROFILE',
    stopRequested: braking,
    remainingToStopPointM: remaining,
  });
}

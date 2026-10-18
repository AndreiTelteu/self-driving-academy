/**
 * Independent scalar oracle prepared before the 051 production policy. No parsing, ownership,
 * randomness or FSM composition: the caller supplies the already-sampled full-stop unit.
 */
export interface ReferenceStopInput {
  readonly stopFullProbability: number;
  readonly stopDwellTimeS: number;
  readonly stopLineOffsetM: number;
  readonly distanceToStopLineM: number;
  readonly stationaryDurationS: number | null;
  readonly crossed: boolean;
  readonly fullStopSample: number;
}
export interface ReferenceStopDecision {
  readonly action: 'APPROACH' | 'HOLD' | 'RELEASE' | 'ROLL_THROUGH';
  readonly reason:
    | 'STOP_APPROACH'
    | 'STOP_HOLD'
    | 'DWELL_IN_PROGRESS'
    | 'DWELL_SATISFIED'
    | 'ROLLING_STOP_BY_PROFILE'
    | 'STOP_LINE_CROSSED';
  readonly stopRequested: boolean;
}
export function referenceStop(input: ReferenceStopInput): ReferenceStopDecision {
  if (input.crossed)
    return Object.freeze({
      action: 'RELEASE',
      reason: 'STOP_LINE_CROSSED',
      stopRequested: false,
    });
  const remaining = input.distanceToStopLineM - input.stopLineOffsetM;
  if (input.fullStopSample >= input.stopFullProbability)
    return Object.freeze({
      action: 'ROLL_THROUGH',
      reason: 'ROLLING_STOP_BY_PROFILE',
      stopRequested: false,
    });
  if (remaining > 0)
    return Object.freeze({ action: 'APPROACH', reason: 'STOP_APPROACH', stopRequested: true });
  if (input.stationaryDurationS === null)
    return Object.freeze({ action: 'HOLD', reason: 'STOP_HOLD', stopRequested: true });
  return input.stationaryDurationS < input.stopDwellTimeS
    ? Object.freeze({ action: 'HOLD', reason: 'DWELL_IN_PROGRESS', stopRequested: true })
    : Object.freeze({ action: 'RELEASE', reason: 'DWELL_SATISFIED', stopRequested: false });
}

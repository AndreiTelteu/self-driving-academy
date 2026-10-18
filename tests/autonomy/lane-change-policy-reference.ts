/**
 * Independent scalar oracle prepared before the 053 production policy. The lateral adjacency is an
 * explicit list already derived from033; the oracle never derives or invents an edge itself.
 */
export interface ReferenceLaneChangeInput {
  readonly frontGapM: number;
  readonly backGapM: number;
  readonly speedGainMps: number;
  readonly cooldownS: number;
  readonly decisionTick: number;
  readonly neighbors: readonly string[];
  readonly targetLaneId: string;
  readonly coverage: 'COMPLETE' | 'LOCAL_ONLY';
  readonly observedFrontGapM: number | null;
  readonly observedBackGapM: number | null;
  readonly targetLaneSpeedMps: number;
  readonly speedMps: number;
  readonly ownLaneLeaderSpeedMps: number | null;
  readonly intent: 'NONE' | 'OPTIONAL_OVERTAKE';
  readonly committedTargetLaneId: string | null;
  readonly lastChangeTick: number | null;
}
export interface ReferenceLaneChangeDecision {
  readonly action: 'CHANGE' | 'NO_CHANGE';
  readonly reason:
    | 'NO_INTENT'
    | 'NO_ADJACENT_LANE'
    | 'TARGET_LANE_NOT_ADJACENT'
    | 'INCOMPLETE_LANE_COVERAGE'
    | 'COOLDOWN_ACTIVE'
    | 'INSUFFICIENT_FRONT_GAP'
    | 'INSUFFICIENT_BACK_GAP'
    | 'INSUFFICIENT_SPEED_GAIN'
    | 'OPTIONAL_CHANGE_VALIDATED'
    | 'COMMITTED_CONTINUITY'
    | 'COMMITMENT_RELEASED';
  readonly speedAdvantageMps: number | null;
  readonly cooldownRemainingTicks: number | null;
}
export function referenceLaneChange(input: ReferenceLaneChangeInput): ReferenceLaneChangeDecision {
  const cooldownTicks = Math.ceil(input.cooldownS * 60),
    cooldownRemainingTicks =
      input.lastChangeTick === null
        ? null
        : Math.max(0, cooldownTicks - (input.decisionTick - input.lastChangeTick)),
    decided = (
      action: ReferenceLaneChangeDecision['action'],
      reason: ReferenceLaneChangeDecision['reason'],
      speedAdvantageMps: number | null,
    ): ReferenceLaneChangeDecision =>
      Object.freeze({ action, reason, speedAdvantageMps, cooldownRemainingTicks });
  if (input.committedTargetLaneId !== null)
    return input.neighbors.includes(input.committedTargetLaneId)
      ? decided('CHANGE', 'COMMITTED_CONTINUITY', null)
      : decided('NO_CHANGE', 'COMMITMENT_RELEASED', null);
  if (input.neighbors.length === 0) return decided('NO_CHANGE', 'NO_ADJACENT_LANE', null);
  if (!input.neighbors.includes(input.targetLaneId))
    return decided('NO_CHANGE', 'TARGET_LANE_NOT_ADJACENT', null);
  if (input.intent === 'NONE') return decided('NO_CHANGE', 'NO_INTENT', null);
  if (input.coverage !== 'COMPLETE') return decided('NO_CHANGE', 'INCOMPLETE_LANE_COVERAGE', null);
  if (cooldownRemainingTicks !== null && cooldownRemainingTicks > 0)
    return decided('NO_CHANGE', 'COOLDOWN_ACTIVE', null);
  if (input.observedFrontGapM !== null && input.observedFrontGapM < input.frontGapM)
    return decided('NO_CHANGE', 'INSUFFICIENT_FRONT_GAP', null);
  if (input.observedBackGapM !== null && input.observedBackGapM < input.backGapM)
    return decided('NO_CHANGE', 'INSUFFICIENT_BACK_GAP', null);
  const leaderLimitedSpeed =
      input.ownLaneLeaderSpeedMps === null
        ? input.speedMps
        : Math.min(input.speedMps, input.ownLaneLeaderSpeedMps),
    advantage = input.targetLaneSpeedMps - leaderLimitedSpeed;
  return advantage < input.speedGainMps
    ? decided('NO_CHANGE', 'INSUFFICIENT_SPEED_GAIN', advantage)
    : decided('CHANGE', 'OPTIONAL_CHANGE_VALIDATED', advantage);
}

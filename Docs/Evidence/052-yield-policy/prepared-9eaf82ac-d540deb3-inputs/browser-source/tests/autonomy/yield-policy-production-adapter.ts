import { evaluateYieldPolicy, YIELD_POLICY_LIMITS } from '../../src/autonomy/yield-policy';
import type { ReferenceYieldInput, ReferenceYieldDecision } from './yield-policy-reference';
/** Trace adapter only: logical identities, not authority tokens or invented physical readback. */
export function productionYieldReference(input: ReferenceYieldInput): ReferenceYieldDecision {
  const decision = evaluateYieldPolicy({
    version: YIELD_POLICY_LIMITS.version,
    units: 'SI',
    sessionId: '052-reference-adapter',
    worldEpoch: 0,
    subjectId: 'subject',
    observationTick: 0,
    decisionTick: 0,
    profile: { versionId: `052-base-gap-${input.thresholdS}`, yieldTimeGapS: input.thresholdS },
    coverage: input.coverage,
    horizonS: input.horizonS,
    discontinuity: input.discontinuity,
    actors: [
      { id: 'subject', incarnation: 0, active: true, observable: true, routeKnown: true },
      ...input.pairs.map((_, index) => ({
        id: `pair-${index}`,
        incarnation: 0,
        active: true,
        observable: true,
        routeKnown: true,
      })),
    ],
    candidates: input.candidate === null ? [] : [{ relationId: 'crossing', ...input.candidate }],
    pairs: input.pairs.map((pair, index) => ({
      relationId: 'crossing',
      otherActorId: `pair-${index}`,
      ...pair,
    })),
  });
  return Object.freeze({
    action: decision.action,
    reason: decision.reason,
    thresholdS: decision.thresholdS,
    minimumGapS: decision.minimumGapS,
  });
}

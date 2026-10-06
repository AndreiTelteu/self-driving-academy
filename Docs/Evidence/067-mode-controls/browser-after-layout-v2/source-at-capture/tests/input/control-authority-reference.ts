import type { BodyIdentity, ControlMode, VehicleAuthorityChange } from '../../src/vehicles';

export const AUTHORITY_REFERENCE = Object.freeze({
  version: '066-existing024-reference-v1',
  warmupTicks: 180,
  measuredTicks: 600,
  populations: Object.freeze([70, 110]),
  pairs: 5,
  hz: 60,
});
export interface ReferenceSeat {
  readonly identity: BodyIdentity;
  readonly mode: 'MANUAL' | 'LEARNING';
}
export type ReferenceScenario = 'TIMELINE' | ControlMode;
/** Fixture-only authored schedule. No new066 production coordinator/request arbitration. */
export function referenceSeat(
  tick: number,
  identities: readonly BodyIdentity[],
  scenario: ReferenceScenario = 'TIMELINE',
): ReferenceSeat | null {
  if (scenario === 'AUTO') return null;
  if (scenario === 'MANUAL' || scenario === 'LEARNING')
    return { identity: identities[0], mode: scenario };
  switch (Math.floor((tick - 1) / 20) % 6) {
    case 0:
      return null;
    case 1:
      return { identity: identities[0], mode: 'MANUAL' };
    case 2:
      return { identity: identities[0], mode: 'LEARNING' };
    case 3:
      return { identity: identities[Math.min(1, identities.length - 1)], mode: 'MANUAL' };
    case 4:
      return null;
    default:
      return { identity: identities[0], mode: 'LEARNING' };
  }
}
/** Explicit published024 authority changes derived from the fixture schedule. */
export function referenceChanges(
  prior: ReferenceSeat | null,
  next: ReferenceSeat | null,
): readonly VehicleAuthorityChange[] {
  const result: VehicleAuthorityChange[] = [];
  if (prior && prior.identity !== next?.identity)
    result.push({ identity: prior.identity, mode: 'AUTO' });
  if (next && (prior?.identity !== next.identity || prior.mode !== next.mode))
    result.push({ identity: next.identity, mode: next.mode });
  return result;
}

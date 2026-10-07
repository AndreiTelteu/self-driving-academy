import type { BodyIdentity, ControlMode } from '../../src/vehicles';
import { referenceSeat as authoritySeat, referenceChanges } from './control-authority-reference';
export { referenceChanges };
export const AUTHORITY_REFERENCE = Object.freeze({
  version: '067-existing066-reference-v1',
  warmupTicks: 180,
  measuredTicks: 600,
  populations: Object.freeze([70, 110]),
  pairs: 5,
  hz: 60,
});
export type ModeAction = 'M' | 'L';
export type ReferenceScenario = 'TIMELINE' | 'HANDOFF' | ControlMode;
export function referenceMode(mode: ControlMode, action: ModeAction): ControlMode {
  return action === 'M'
    ? mode === 'AUTO'
      ? 'MANUAL'
      : 'AUTO'
    : mode === 'LEARNING'
      ? 'MANUAL'
      : 'LEARNING';
}
export function referenceAction(tick: number): ModeAction | null {
  if (tick === 1 || (tick - 1) % 20 !== 0) return null;
  return [0, 1, 4].includes(Math.floor((tick - 1) / 20) % 6) ? 'M' : 'L';
}
export function referenceSeat(
  tick: number,
  ids: readonly BodyIdentity[],
  scenario: ReferenceScenario = 'TIMELINE',
) {
  if (scenario === 'HANDOFF') return authoritySeat(tick, ids);
  if (scenario !== 'TIMELINE') return authoritySeat(tick, ids, scenario);
  const modes = ['AUTO', 'MANUAL', 'LEARNING', 'MANUAL', 'AUTO', 'LEARNING'] as const;
  const mode = modes[Math.floor((tick - 1) / 20) % 6];
  return mode === 'AUTO' ? null : { identity: ids[0], mode };
}

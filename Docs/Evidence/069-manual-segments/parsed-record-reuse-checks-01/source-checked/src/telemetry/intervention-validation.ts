import {
  fields,
  contextFields,
  readContext,
  text,
  tick,
  boolean,
  choice,
  nullable,
  number,
  requireContract,
} from '../sessions';
import type { ContractContext } from '../sessions';
import type { BodyIdentity } from '../vehicles';
import { segmentCloseReasons } from './contracts';
import { INTERVENTION_LIMITS } from './intervention-ports';
import type {
  InterventionAuthority,
  InterventionTarget,
  InterventionTargetChange,
  InterventionCause,
} from './intervention-ports';
export const sameInterventionContext = (a: ContractContext, b: ContractContext) =>
  a.schemaVersion === b.schemaVersion &&
  a.units === b.units &&
  a.sessionId === b.sessionId &&
  a.worldEpoch === b.worldEpoch;
export function interventionText(value: unknown) {
  const s = text(value);
  requireContract(s.length <= INTERVENTION_LIMITS.idCodeUnits, 'Intervention identifier capacity');
  return s;
}
export function interventionIdentity(
  value: unknown,
  lookup: (id: string) => BodyIdentity | undefined,
) {
  const d = fields(value, ['entityId', 'handle', 'generation']);
  const id = interventionText(d.entityId);
  number(d.handle);
  requireContract(tick(d.generation) > 0, 'Intervention native generation');
  requireContract(lookup(id) === value, 'Stale intervention native identity');
  return value as BodyIdentity;
}
export function interventionTarget(value: unknown): InterventionTarget {
  const d = fields(value, [
    ...contextFields,
    'version',
    'playerId',
    'profileId',
    'baseVersionId',
    'learningEpoch',
    'controlPreferencesVersion',
    'engineVersion',
    'mapVersion',
    'inputType',
    'learningEligible',
  ]);
  requireContract(d.version === '069-intervention-target-v1', 'Intervention target version');
  return Object.freeze({
    ...readContext(d),
    version: '069-intervention-target-v1',
    playerId: interventionText(d.playerId),
    profileId: interventionText(d.profileId),
    baseVersionId: interventionText(d.baseVersionId),
    learningEpoch: tick(d.learningEpoch),
    controlPreferencesVersion: interventionText(d.controlPreferencesVersion),
    engineVersion: interventionText(d.engineVersion),
    mapVersion: interventionText(d.mapVersion),
    inputType: choice(d.inputType, ['KEYBOARD', 'GAMEPAD']),
    learningEligible: boolean(d.learningEligible),
  });
}
export function interventionAuthority(
  value: unknown,
  lookup: (id: string) => BodyIdentity | undefined,
): InterventionAuthority {
  const d = fields(value, [
    ...contextFields,
    'version',
    'tick',
    'identity',
    'mode',
    'suspended',
    'disposed',
    'fault',
  ]);
  requireContract(d.version === '069-accepted-authority-v1', 'Intervention authority version');
  const identity = d.identity === null ? null : interventionIdentity(d.identity, lookup),
    mode = choice(d.mode, ['AUTO', 'MANUAL', 'LEARNING']);
  requireContract((identity === null) === (mode === 'AUTO'), 'Intervention authority seat/mode');
  return Object.freeze({
    ...readContext(d),
    version: '069-accepted-authority-v1',
    tick: tick(d.tick),
    identity,
    mode,
    suspended: boolean(d.suspended),
    disposed: boolean(d.disposed),
    fault: nullable(d.fault, interventionText),
  });
}
export function interventionTargetChange(value: unknown): InterventionTargetChange {
  const d = fields(value, [...contextFields, 'version', 'operationId', 'tick', 'reason', 'target']);
  requireContract(
    d.version === '069-validated-target-change-v1',
    'Intervention target-change version',
  );
  const target = interventionTarget(d.target),
    context = readContext(d);
  requireContract(sameInterventionContext(context, target), 'Target change foreign target context');
  return Object.freeze({
    ...context,
    version: '069-validated-target-change-v1',
    operationId: interventionText(d.operationId),
    tick: tick(d.tick),
    reason: choice(d.reason, [
      'PROFILE_CHANGE',
      'PROFILE_RESTORE',
      'PROFILE_IMPORT',
      'STATE_IMPORT',
      'CONTROL_PREFERENCES_CHANGE',
    ]),
    target,
  });
}
export function sameInterventionTarget(a: InterventionTarget, b: InterventionTarget) {
  return (
    sameInterventionContext(a, b) &&
    a.playerId === b.playerId &&
    a.profileId === b.profileId &&
    a.baseVersionId === b.baseVersionId &&
    a.learningEpoch === b.learningEpoch &&
    a.controlPreferencesVersion === b.controlPreferencesVersion &&
    a.engineVersion === b.engineVersion &&
    a.mapVersion === b.mapVersion &&
    a.inputType === b.inputType
  );
}

export function interventionCause(
  value: unknown,
  lookup: (id: string) => BodyIdentity | undefined,
): InterventionCause {
  const d = fields(value, [
    ...contextFields,
    'version',
    'operationId',
    'timing',
    'tick',
    'identity',
    'reason',
  ]);
  requireContract(d.version === '069-admitted-cause-v1', 'Intervention cause version');
  return Object.freeze({
    ...readContext(d),
    version: '069-admitted-cause-v1',
    operationId: interventionText(d.operationId),
    timing: choice(d.timing, ['PREPARED_BEFORE_NEXT_TICK', 'AT_LAST_ACCEPTED_TICK']),
    tick: tick(d.tick),
    identity: d.identity === null ? null : interventionIdentity(d.identity, lookup),
    reason: choice(d.reason, segmentCloseReasons),
  });
}

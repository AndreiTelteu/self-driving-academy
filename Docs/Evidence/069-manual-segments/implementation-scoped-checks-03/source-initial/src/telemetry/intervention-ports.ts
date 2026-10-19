import type { ContractContext } from '../sessions';
import type { BodyIdentity } from '../vehicles';
import type { InterventionSegment,TelemetrySample } from './contracts';
import type { SimulationEvent } from '../simulation';

export const INTERVENTION_LIMITS = Object.freeze({
  version: '069-intervention-lifecycle-v1' as const, records: 64,
  recordBytes: 64 * 1024, samples: 32, events: 8,
  recordStoreBytes: 32 * 1024 * 1024, descriptors: 64,
  descriptorBytes: 256 * 1024, intakePayloadBytes: 16 * 1024 * 1024,
  reservations: 1, activeIdentities: 1, idCodeUnits: 256,
});
export type InterventionMode = 'MANUAL' | 'LEARNING';
export type InterventionCloseReason = NonNullable<InterventionSegment['closeReason']>;
export interface InterventionTarget extends ContractContext {
  readonly version: '069-intervention-target-v1';
  readonly playerId: string; readonly profileId: string; readonly baseVersionId: string;
  readonly learningEpoch: number; readonly controlPreferencesVersion: string;
  readonly engineVersion: string; readonly mapVersion: string;
  readonly inputType: 'KEYBOARD' | 'GAMEPAD'; readonly learningEligible: boolean;
}
export interface InterventionAuthority extends ContractContext {
  readonly version: '069-accepted-authority-v1'; readonly tick: number;
  readonly identity: BodyIdentity | null; readonly mode: 'AUTO' | InterventionMode;
  readonly suspended: boolean; readonly disposed: boolean; readonly fault: string | null;
}
/** Prepared target is a host-validated operation token;069 does not parse/import savefiles or profiles. */
export interface InterventionTargetChange extends ContractContext {
  readonly version: '069-validated-target-change-v1'; readonly operationId: string;
  readonly tick: number; readonly reason: 'PROFILE_CHANGE' | 'PROFILE_RESTORE' | 'PROFILE_IMPORT' | 'STATE_IMPORT' | 'CONTROL_PREFERENCES_CHANGE';
  readonly target: InterventionTarget;
}
export interface InterventionRecordReservation {
  readonly version: '069-record-reservation-v1'; readonly sequence: number;
  readonly closed: InterventionSegment | null; readonly opened: InterventionSegment | null;
}
export interface InterventionRecordReceipt {
  readonly version: '069-record-receipt-v1'; readonly sequence: number;
  readonly accepted: boolean; readonly closedSegmentId: string | null;
  readonly openedSegmentId: string | null;
}
export interface InterventionRecordPort {
  reserve(closed: InterventionSegment | null, opened: InterventionSegment | null): InterventionRecordReservation;
  commit(reservation: InterventionRecordReservation): InterventionRecordReceipt;
  reject(reservation: InterventionRecordReservation): void;
  inspectReceipt(reservation: InterventionRecordReservation): InterventionRecordReceipt | null;
  read(segmentId: string): InterventionSegment | null;
  appendSample(segmentId:string,sample:TelemetrySample):void;
}
export interface InterventionIntakeDescriptor extends ContractContext {
  readonly version: '069-closed-learning-intake-v1'; readonly segmentId: string;
  readonly playerId: string; readonly profileId: string; readonly learningEpoch: number;
  readonly baseVersionId: string; readonly endTick: number; readonly recordBytes: number;
  readonly operationId: string;
}
export interface InterventionIntakeReceipt {
  readonly version: '069-intake-receipt-v1'; readonly operationId: string;
  readonly segmentId: string; readonly accepted: boolean;
}
export interface InterventionPorts {
  readonly readAuthority: () => InterventionAuthority;
  readonly bodyIdentity: (id: string) => BodyIdentity | undefined;
  readonly readTarget: () => InterventionTarget;
  readonly preparedCause: (operationId: string) => InterventionCause | null;
  readonly preparedTarget: (operationId: string) => InterventionTargetChange | null;
  readonly records: InterventionRecordPort;
  readonly events: InterventionEventPort;
  readonly reserveIntake: (descriptor: InterventionIntakeDescriptor) => void;
  readonly rejectIntake: (operationId: string) => void;
  /** Concrete queue-admission acknowledgement, never evidence of trained/activated profile. */
  readonly acceptIntake: (descriptor: InterventionIntakeDescriptor) => InterventionIntakeReceipt;
  readonly inspectIntake: (operationId: string) => InterventionIntakeReceipt | null;
  readonly acknowledgeIntake:(operationId:string)=>void;
  readonly inspectIntakeRelease:(operationId:string)=>InterventionIntakeRelease|null;
}
export interface InterventionBoundaryPlan extends ContractContext {
  readonly version: '069-boundary-plan-v1'; readonly tick: number;
  readonly nextIdentity: BodyIdentity | null; readonly nextMode: 'AUTO' | InterventionMode;
  readonly timing: 'PREPARED_BEFORE_NEXT_TICK' | 'AT_LAST_ACCEPTED_TICK';
  readonly reason: InterventionCloseReason | null;
  readonly cause: InterventionCause | null;
  readonly targetChange: InterventionTargetChange | null;
}
export interface InterventionBoundaryTicket extends ContractContext {
  readonly version: '069-boundary-ticket-v1'; readonly sequence: number;
  readonly tick: number; readonly baseTick: number;
}
export interface InterventionBoundaryView {
  readonly context: ContractContext; readonly identity: BodyIdentity;
  readonly segmentId: string; readonly mode: InterventionMode;
  readonly startTick: number; readonly endTick: number | null;
  readonly completeness: 'OPEN' | 'CLOSED' | 'INCOMPLETE';
  readonly closeReason: InterventionCloseReason | null;
}
export interface InterventionFault {
  readonly stage: 'ADMISSION' | 'AUTHORITY' | 'RECORD_COMMIT' | 'EVENT_DELIVERY' | 'INTAKE';
  readonly attemptedTick: number; readonly acceptedTick: number;
  readonly physicalTickAccepted: boolean; readonly physicalAcceptance:'ACCEPTED'|'NOT_ACCEPTED'|'UNKNOWN'; readonly causes: readonly string[];
}

/** Host-validated facts only; ride/recovery/import execution belongs to its owning module. */
export interface InterventionCause extends ContractContext {
  readonly version: '069-admitted-cause-v1'; readonly operationId: string;
  readonly timing: 'PREPARED_BEFORE_NEXT_TICK' | 'AT_LAST_ACCEPTED_TICK';
  readonly tick: number; readonly identity: BodyIdentity | null;
  readonly reason: InterventionCloseReason;
}
export interface InterventionEventReservation {
  readonly version: '069-event-reservation-v1'; readonly sequence: number;
  readonly events: readonly SimulationEvent[];
}
export interface InterventionEventReceipt {
  readonly version: '069-event-receipt-v1'; readonly sequence: number;
  readonly acceptedCount: number; readonly complete: boolean;
  readonly listenerFailures: number;
}
export interface InterventionEventPort {
  reserve(events: readonly SimulationEvent[]): InterventionEventReservation;
  commit(reservation: InterventionEventReservation, phaseGuard?: () => void): InterventionEventReceipt;
  inspectReceipt(reservation: InterventionEventReservation): InterventionEventReceipt | null;
  reject(reservation: InterventionEventReservation): void;
}
export interface InterventionResultToken extends ContractContext {
  readonly version: '069-intake-result-token-v1'; readonly segmentId: string;
  readonly operationId: string; readonly playerId: string; readonly profileId: string;
  readonly baseVersionId: string; readonly learningEpoch: number;
}

export interface InterventionIntakeRelease {
 readonly version:'069-intake-release-v1';readonly operationId:string;
 readonly segmentId:string;readonly released:true;
}

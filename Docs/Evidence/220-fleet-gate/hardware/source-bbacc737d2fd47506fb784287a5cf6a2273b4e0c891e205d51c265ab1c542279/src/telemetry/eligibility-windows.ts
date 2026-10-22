import {
  boolean,
  choice,
  createStableId,
  fields,
  number,
  record,
  requireContract,
  text,
  tick as readTick,
} from '../sessions';
import { FOLLOWING_LIMITS } from '../autonomy';
import { controlModes } from '../vehicles';
import type { ControlMode, VehicleClassId } from '../vehicles';
import type { OpportunityKind } from './opportunities';
import { mechanicalCapabilities } from './tick-samples';

/**
 * 087 eligible windows and external constraints: the closed label vocabulary that attaches to the
 * 086 opportunities, the exclusion rules that keep a constrained situation out of the learning
 * denominator, and the observability rule for reaction time.
 *
 * It owns no clock, physics, renderer, DOM, scheduler or event bus and never publishes. It consumes
 * the already authoritative 086 opportunity occurrence (its id and kind) plus the real context
 * owners: the 036 signal / 044 road context (blocked green), the 048 following leader and its
 * standstill threshold (leader/queue), the 023/085 mechanical capability (mechanical limit), the
 * 028/029/030 impact truth, the 069 segment eligibility and the 070 suspension decision, and the
 * 017 camera pose (stimulus observability). It never re-derives those facts from scratch.
 *
 * Criterion 1 is enforced by construction: a window whose cause is an external constraint (leader,
 * blocked green, mechanical limit, impact) is a *different* TypeScript type and cannot be passed to
 * `emitPreferenceEvidence`, which additionally re-checks at runtime that the window is owned by this
 * layer and still classified ELIGIBLE. The learning denominator only ever counts ELIGIBLE windows.
 *
 * Criterion 2 is enforced by construction: a reaction-time window opens **only** when the stimulus
 * is observable - either inside the player's camera cone (the 017 `VehicleCameraPose` geometry,
 * conservatively tested) with the caller's occlusion truth, or explicitly declared by a controlled
 * fixture. A hidden or occluded stimulus is an explicit NOT_OBSERVABLE window and never contributes
 * a reaction time.
 */

export const ELIGIBILITY_VERSION = '087-eligibility-windows-v1' as const;

/** Fixed simulation rate used only to express a tick span in seconds; no wall clock is read. */
export const ELIGIBILITY_REACTION_TICK_HZ = 60;

/**
 * A window is classified into exactly one of three classes. ELIGIBLE is the only class a later
 * estimator may treat as free driver behavior; EXTERNAL_CONSTRAINT means the world bounded the
 * driver; EXCLUDED means the observation is invalid for another reason (suspension, non-learning
 * segment, hidden stimulus).
 */
export const eligibilityWindowClasses = ['ELIGIBLE', 'EXTERNAL_CONSTRAINT', 'EXCLUDED'] as const;
export type EligibilityWindowClass = (typeof eligibilityWindowClasses)[number];

/** The closed label vocabulary. Every label maps to exactly one class (table below). */
export const eligibilityLabels = [
  'FREE_TRAFFIC',
  'LEADER',
  'BLOCKED_GREEN',
  'MECHANICAL_LIMIT',
  'IMPACT',
  'PAUSE',
  'FOCUS_LOST',
  'MANUAL_SEGMENT',
  'AUTO_SEGMENT',
  'NOT_OBSERVABLE',
] as const;
export type EligibilityLabel = (typeof eligibilityLabels)[number];

export type ExternalConstraintLabel = 'LEADER' | 'BLOCKED_GREEN' | 'MECHANICAL_LIMIT' | 'IMPACT';
export type ExcludedLabel =
  'PAUSE' | 'FOCUS_LOST' | 'MANUAL_SEGMENT' | 'AUTO_SEGMENT' | 'NOT_OBSERVABLE';

/**
 * The exclusion table, fixed and exhaustive: the runtime gate below rejects any attempt to move a
 * label between classes.
 */
export const eligibilityLabelClasses = Object.freeze({
  FREE_TRAFFIC: 'ELIGIBLE',
  LEADER: 'EXTERNAL_CONSTRAINT',
  BLOCKED_GREEN: 'EXTERNAL_CONSTRAINT',
  MECHANICAL_LIMIT: 'EXTERNAL_CONSTRAINT',
  IMPACT: 'EXTERNAL_CONSTRAINT',
  PAUSE: 'EXCLUDED',
  FOCUS_LOST: 'EXCLUDED',
  MANUAL_SEGMENT: 'EXCLUDED',
  AUTO_SEGMENT: 'EXCLUDED',
  NOT_OBSERVABLE: 'EXCLUDED',
} as const satisfies Record<EligibilityLabel, EligibilityWindowClass>);

/** Concrete cause of a classification; a label may be reached by more than one cause. */
export const eligibilityReasons = [
  'NO_CONSTRAINT',
  'LEADER_HEADWAY',
  'QUEUE_STANDSTILL',
  'GREEN_EXIT_BLOCKED',
  'CAPABILITY_EXCEEDED_ACCELERATION',
  'CAPABILITY_EXCEEDED_DECELERATION',
  'CAPABILITY_EXCEEDED_LATERAL',
  'COLLISION_IN_WINDOW',
  'DAMAGE_LIMITED',
  'RECOVERY_IN_WINDOW',
  'SUSPENSION_PAUSE',
  'SUSPENSION_FOCUS_LOST',
  'NON_LEARNING_SEGMENT',
  'STIMULUS_NOT_OBSERVABLE',
] as const;
export type EligibilityReason = (typeof eligibilityReasons)[number];

/** Authoritative owner that supplied the decisive fact; provenance, not a second data source. */
export const eligibilitySources = [
  'NONE',
  'CAMERA_017',
  'MECHANICS_023',
  'COLLISION_028',
  'DAMAGE_029',
  'RECOVERY_030',
  'SIGNAL_036',
  'PRIORITY_038',
  'ROAD_CONTEXT_044',
  'FOLLOWING_048',
  'SEGMENT_069',
  'SUSPENSION_070',
] as const;
export type EligibilitySource = (typeof eligibilitySources)[number];

export const eligibilitySuspensions = ['NONE', 'PAUSE', 'FOCUS_LOST'] as const;
export type EligibilitySuspension = (typeof eligibilitySuspensions)[number];

/** Closed reason a reaction-time window is not open; a suspension is never a slow reaction. */
export const reactionClosureReasons = [
  'NOT_OBSERVABLE',
  'EXTERNAL_CONSTRAINT',
  'SEGMENT_EXCLUDED',
] as const;
export type ReactionClosureReason = (typeof reactionClosureReasons)[number];

export const responseReasons = [
  'RESPONSE',
  'NOT_OBSERVABLE',
  'EXTERNAL_CONSTRAINT',
  'SEGMENT_EXCLUDED',
  'NO_WINDOW',
  'ALREADY_RESPONDED',
] as const;
export type ResponseReason = (typeof responseReasons)[number];

export const eligibilityImpairments = ['DAMAGE', 'IMMOBILIZED'] as const;
export type EligibilityImpairment = (typeof eligibilityImpairments)[number];

const classIds = ['sedan', 'compact'] as const;

export interface EligibilityPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Structural copy of the real 017 `VehicleCameraPose`; the caller passes the actual pose. */
export interface EligibilityCameraPose {
  readonly positionM: EligibilityPoint;
  readonly lookAtM: EligibilityPoint;
  readonly up: EligibilityPoint;
  /** Full vertical field of view in radians, as the 017 pose reports it. */
  readonly fovRadians: number;
}

/**
 * The stimulus is presented to the driver through the camera: its world position must be inside the
 * conservative camera cone and the caller's occlusion truth must say the sightline is clear. The
 * occlusion flag is the result of the real renderer contract (Babylon raycast / 017 sweep), not a
 * guess; the layer never fabricates it.
 */
export interface CameraStimulusVisibility {
  readonly source: 'CAMERA';
  readonly pose: EligibilityCameraPose;
  readonly stimulusPositionM: EligibilityPoint;
  readonly occluded: boolean;
}

/** A controlled fixture explicitly declares whether the stimulus is presented to the driver. */
export interface FixtureStimulusVisibility {
  readonly source: 'CONTROLLED_FIXTURE';
  readonly observable: boolean;
}

export type StimulusVisibility = CameraStimulusVisibility | FixtureStimulusVisibility;

/** Real 044 leader (nearest oriented-lane vehicle ahead), used for the leader/queue label. */
export interface EligibilityLeaderFact {
  readonly id: string;
  readonly gapM: number;
  readonly speedMps: number;
}

/** Real 036/044 movement signal applicable to the subject. */
export interface EligibilitySignalFact {
  readonly signalId: string;
  readonly intersectionId: string;
  readonly movementId: string;
  readonly state: 'RED' | 'YELLOW' | 'GREEN';
}

/** Whether the green's exit is blocked, derived from the real 038/044 context. */
export interface EligibilityGreenExitFact {
  readonly blocked: boolean;
  readonly source: 'FOLLOWING_QUEUE' | 'PRIORITY_OCCUPANCY';
}

/** Demanded longitudinal/lateral acceleration compared with the real 023/085 class capability. */
export interface EligibilityMechanicalDemand {
  readonly demandedLongitudinalAccelerationMps2: number;
  readonly demandedLateralAccelerationMps2: number;
}

/** Real 028/029/030 impact truth inside the window. */
export interface EligibilityImpactFact {
  readonly collision: boolean;
  readonly impairment: EligibilityImpairment | null;
  readonly recovery: boolean;
}

export interface EligibilityWindowObservation {
  readonly tick: number;
  readonly sessionId: string;
  readonly worldEpoch: number;
  /** The 086 opportunity identity this window attaches to. */
  readonly opportunityId: string;
  readonly kind: OpportunityKind;
  readonly vehicleId: string;
  readonly incarnation: string;
  readonly segmentId: string;
  /** Frozen 069/085 segment mode; only LEARNING may be learning-eligible. */
  readonly controlMode: ControlMode;
  readonly learningEligible: boolean;
  /** Real 023 class of the vehicle, for the mechanical capability. */
  readonly classId: VehicleClassId;
  /** The single 070 suspension decision that covers this observation. */
  readonly suspension: EligibilitySuspension;
  readonly visibility: StimulusVisibility;
  readonly leader: EligibilityLeaderFact | null;
  readonly signal: EligibilitySignalFact | null;
  readonly greenExit: EligibilityGreenExitFact | null;
  readonly mechanical: EligibilityMechanicalDemand | null;
  readonly impact: EligibilityImpactFact | null;
}

export type EligibilityReactionWindow =
  | { readonly open: true; readonly openedTick: number }
  | { readonly open: false; readonly reason: ReactionClosureReason };

interface EligibilityWindowBase {
  readonly windowId: string;
  readonly opportunityId: string;
  readonly kind: OpportunityKind;
  readonly reason: EligibilityReason;
  readonly source: EligibilitySource;
  readonly observable: boolean;
  readonly vehicleId: string;
  readonly incarnation: string;
  readonly segmentId: string;
  readonly controlMode: ControlMode;
  readonly learningEligible: boolean;
  readonly openedTick: number;
  /** Cadence-visible. */
  readonly lastTick: number;
  /** Cadence-visible: how many observations touched this window. Never used for identity. */
  readonly observationCount: number;
  readonly reaction: EligibilityReactionWindow;
}

export interface EligibleWindowRecord extends EligibilityWindowBase {
  readonly windowClass: 'ELIGIBLE';
  readonly label: 'FREE_TRAFFIC';
}

export interface ExternalConstraintWindowRecord extends EligibilityWindowBase {
  readonly windowClass: 'EXTERNAL_CONSTRAINT';
  readonly label: ExternalConstraintLabel;
}

export interface ExcludedWindowRecord extends EligibilityWindowBase {
  readonly windowClass: 'EXCLUDED';
  readonly label: ExcludedLabel;
}

export type EligibilityWindowRecord =
  EligibleWindowRecord | ExternalConstraintWindowRecord | ExcludedWindowRecord;

export interface EligibilityLabelDenominator {
  readonly label: EligibilityLabel;
  readonly windowClass: EligibilityWindowClass;
  readonly count: number;
}

export interface EligibilityDenominators {
  readonly version: typeof ELIGIBILITY_VERSION;
  /** Every window ever opened; each one is counted in exactly one class. */
  readonly total: number;
  readonly eligible: number;
  readonly externalConstraint: number;
  readonly excluded: number;
  readonly byLabel: readonly EligibilityLabelDenominator[];
  /** The external-constraint subset; these can never become preference evidence. */
  readonly externalConstraints: readonly EligibilityLabelDenominator[];
  readonly notObservable: number;
  readonly reactionWindowsOpened: number;
  readonly reactionSamples: number;
  readonly responsesRefused: number;
  readonly preferenceEvidenceEmitted: number;
  readonly preferenceEvidenceRefused: number;
}

export interface EligibilityStats {
  readonly version: typeof ELIGIBILITY_VERSION;
  readonly disposed: boolean;
  readonly maxWindows: number;
  /** Cumulative since construction; survives eviction and `dispose()`. */
  readonly windowsOpened: number;
  readonly reclassifiedTotal: number;
  readonly retiredTotal: number;
  readonly rejectedTotal: number;
  readonly observationCalls: number;
  readonly skippedTicks: number;
  readonly responsesAccepted: number;
  readonly responsesRefused: number;
  /** Live owned resources; every one returns to zero after `dispose()`. */
  readonly retained: number;
  readonly eligibleRetained: number;
  readonly identityCodeUnits: number;
  readonly estimatedBytes: number;
  readonly estimatedBytesMaximum: number;
}

export interface EligibilityWindowsOptions {
  readonly maxWindows?: number;
}

export interface EligibilityResponseInput {
  readonly tick: number;
  readonly opportunityId: string;
}

export interface EligibilityResponseResult {
  readonly accepted: boolean;
  readonly reason: ResponseReason;
  readonly durationTicks: number | null;
  readonly durationSeconds: number | null;
}

export interface PreferenceEvidenceRecord {
  readonly version: typeof ELIGIBILITY_VERSION;
  readonly windowId: string;
  readonly opportunityId: string;
  readonly kind: OpportunityKind;
  readonly vehicleId: string;
  readonly incarnation: string;
  readonly reactionDurationTicks: number | null;
  readonly reactionDurationSeconds: number | null;
}

export interface EligibilityWindows {
  readonly version: typeof ELIGIBILITY_VERSION;
  /** Classifies (or tightens) one window attached to a 086 opportunity and returns its record. */
  observe(input: EligibilityWindowObservation): EligibilityWindowRecord;
  /** Closes a reaction-time window; refused for a hidden stimulus or a non-eligible window. */
  respond(input: EligibilityResponseInput): EligibilityResponseResult;
  /** The only path that can turn an owned ELIGIBLE window into preference evidence. */
  emitPreferenceEvidence(entry: EligibleWindowRecord): PreferenceEvidenceRecord;
  getWindow(opportunityId: string): EligibilityWindowRecord | null;
  getWindows(): readonly EligibilityWindowRecord[];
  getDenominators(): EligibilityDenominators;
  getStats(): EligibilityStats;
  dispose(): void;
}

/** The documented precedence: the most restrictive cause wins and is latched for the window. */
export const eligibilityPrecedence = Object.freeze([
  'FOCUS_LOST',
  'PAUSE',
  'MANUAL_SEGMENT',
  'AUTO_SEGMENT',
  'IMPACT',
  'NOT_OBSERVABLE',
  'MECHANICAL_LIMIT',
  'BLOCKED_GREEN',
  'LEADER',
  'FREE_TRAFFIC',
] as const satisfies readonly EligibilityLabel[]);

export const ELIGIBILITY_CAPACITY = Object.freeze({
  minimum: 32,
  /** Mirrors 086's store so the two bounded owners share the manifest `diagnosticSamples` figure. */
  default: 4096,
  maximum: 7168,
});

export const ELIGIBILITY_DENSE_SLOTS = 16;
export const ELIGIBILITY_BYTES_PER_RECORD = ELIGIBILITY_DENSE_SLOTS * 8;
export const ELIGIBILITY_IDENTITY_CODE_UNITS_CEILING = 1024;
export const ELIGIBILITY_RECORD_BYTES_CEILING =
  ELIGIBILITY_BYTES_PER_RECORD + ELIGIBILITY_IDENTITY_CODE_UNITS_CEILING * 2;
/** `Docs/performance-budgets.json` `proposedCapacities.recorderRamBytes`. */
export const ELIGIBILITY_RECORDER_RAM_BYTES = 33_554_432;

const pointFields = ['x', 'y', 'z'] as const;
const poseFields = ['positionM', 'lookAtM', 'up', 'fovRadians'] as const;
const cameraVisibilityFields = ['source', 'pose', 'stimulusPositionM', 'occluded'] as const;
const fixtureVisibilityFields = ['source', 'observable'] as const;
const leaderFields = ['id', 'gapM', 'speedMps'] as const;
const signalFields = ['signalId', 'intersectionId', 'movementId', 'state'] as const;
const greenExitFields = ['blocked', 'source'] as const;
const mechanicalFields = [
  'demandedLongitudinalAccelerationMps2',
  'demandedLateralAccelerationMps2',
] as const;
const impactFields = ['collision', 'impairment', 'recovery'] as const;
const observationFields = [
  'tick',
  'sessionId',
  'worldEpoch',
  'opportunityId',
  'kind',
  'vehicleId',
  'incarnation',
  'segmentId',
  'controlMode',
  'learningEligible',
  'classId',
  'suspension',
  'visibility',
  'leader',
  'signal',
  'greenExit',
  'mechanical',
  'impact',
] as const;
const optionKeys = ['maxWindows'] as const;
const responseFields = ['tick', 'opportunityId'] as const;
const kindValues = ['STOP', 'RED', 'GREEN', 'YIELD', 'LANE_CHANGE'] as const;
const signalStates = ['RED', 'YELLOW', 'GREEN'] as const;
const greenExitSources = ['FOLLOWING_QUEUE', 'PRIORITY_OCCUPANCY'] as const;

const precedenceRank = new Map<EligibilityLabel, number>(
  eligibilityPrecedence.map((label, index) => [label, index]),
);

const identity = (value: unknown, maximum = 256): string => {
  const result = text(value);
  requireContract(result.length <= maximum, 'Eligibility identity capacity exceeded');
  return result;
};

const readPoint = (value: unknown): EligibilityPoint => {
  const data = fields(value, pointFields);
  return Object.freeze({
    x: number(data.x, -1e7, 1e7),
    y: number(data.y, -1e7, 1e7),
    z: number(data.z, -1e7, 1e7),
  });
};

const readPose = (value: unknown): EligibilityCameraPose => {
  const data = fields(value, poseFields);
  return Object.freeze({
    positionM: readPoint(data.positionM),
    lookAtM: readPoint(data.lookAtM),
    up: readPoint(data.up),
    fovRadians: number(data.fovRadians, 1e-6, Math.PI - 1e-6),
  });
};

const readVisibility = (value: unknown): StimulusVisibility => {
  const data = record(value);
  if (data.source === 'CAMERA') {
    const camera = fields(value, cameraVisibilityFields);
    return Object.freeze({
      source: 'CAMERA',
      pose: readPose(camera.pose),
      stimulusPositionM: readPoint(camera.stimulusPositionM),
      occluded: boolean(camera.occluded),
    });
  }
  const fixture = fields(value, fixtureVisibilityFields);
  requireContract(
    fixture.source === 'CONTROLLED_FIXTURE',
    'Unsupported eligibility visibility source',
  );
  return Object.freeze({ source: 'CONTROLLED_FIXTURE', observable: boolean(fixture.observable) });
};

const readLeader = (value: unknown): EligibilityLeaderFact => {
  const data = fields(value, leaderFields);
  return Object.freeze({
    id: identity(data.id),
    gapM: number(data.gapM, 0, 100000),
    speedMps: number(data.speedMps, 0, 100),
  });
};

const readSignal = (value: unknown): EligibilitySignalFact => {
  const data = fields(value, signalFields);
  return Object.freeze({
    signalId: identity(data.signalId),
    intersectionId: identity(data.intersectionId),
    movementId: identity(data.movementId),
    state: choice(data.state, signalStates),
  });
};

const readGreenExit = (value: unknown): EligibilityGreenExitFact => {
  const data = fields(value, greenExitFields);
  return Object.freeze({
    blocked: boolean(data.blocked),
    source: choice(data.source, greenExitSources),
  });
};

const readMechanical = (value: unknown): EligibilityMechanicalDemand => {
  const data = fields(value, mechanicalFields);
  return Object.freeze({
    demandedLongitudinalAccelerationMps2: number(
      data.demandedLongitudinalAccelerationMps2,
      -1000,
      1000,
    ),
    demandedLateralAccelerationMps2: number(data.demandedLateralAccelerationMps2, -1000, 1000),
  });
};

const readImpact = (value: unknown): EligibilityImpactFact => {
  const data = fields(value, impactFields);
  return Object.freeze({
    collision: boolean(data.collision),
    impairment: data.impairment === null ? null : choice(data.impairment, eligibilityImpairments),
    recovery: boolean(data.recovery),
  });
};

/**
 * Conservative inside-camera-cone test built from the real 017 camera pose. Using the vertical
 * half-angle as the cone is deliberately conservative: a stimulus inside the cone is certainly
 * inside the frustum, so a hidden stimulus is never promoted to observable. The horizontal
 * (aspect) extent stays the caller's concern and is documented as a limitation.
 */
export function isStimulusInCameraCone(
  pose: EligibilityCameraPose,
  stimulusPositionM: EligibilityPoint,
): boolean {
  const { positionM, lookAtM } = pose;
  const forwardX = lookAtM.x - positionM.x;
  const forwardY = lookAtM.y - positionM.y;
  const forwardZ = lookAtM.z - positionM.z;
  const forwardLength = Math.hypot(forwardX, forwardY, forwardZ);
  if (!(forwardLength > 1e-9)) return false;
  const toX = stimulusPositionM.x - positionM.x;
  const toY = stimulusPositionM.y - positionM.y;
  const toZ = stimulusPositionM.z - positionM.z;
  const distance = Math.hypot(toX, toY, toZ);
  if (!(distance > 1e-9)) return true;
  const cosAngle = (toX * forwardX + toY * forwardY + toZ * forwardZ) / (distance * forwardLength);
  const halfAngle = pose.fovRadians / 2;
  return cosAngle >= Math.cos(halfAngle);
}

const isObservable = (visibility: StimulusVisibility): boolean =>
  visibility.source === 'CONTROLLED_FIXTURE'
    ? visibility.observable
    : !visibility.occluded && isStimulusInCameraCone(visibility.pose, visibility.stimulusPositionM);

/**
 * Documented derivation of a blocked green from the real 038/044 context: the movement signal is
 * GREEN and the nearest real 044 leader is at the 048 queue standstill threshold inside the 048
 * `queue_standstill_gap`. It is exported so the caller derives it from the authoritative objects
 * instead of re-inventing the rule, and it is still only one explicit input to the classifier.
 */
export function greenExitBlockedByQueue(input: {
  readonly signal: EligibilitySignalFact | null;
  readonly leader: EligibilityLeaderFact | null;
  readonly queueStandstillGapM: number;
}): EligibilityGreenExitFact {
  const gap = number(input.queueStandstillGapM, 0, 1000);
  const leader = input.leader;
  const blocked =
    input.signal?.state === 'GREEN' &&
    leader !== null &&
    leader.speedMps <= FOLLOWING_LIMITS.standstillMps &&
    leader.gapM <= gap;
  return Object.freeze({ blocked, source: 'FOLLOWING_QUEUE' });
}

interface Classification {
  readonly label: EligibilityLabel;
  readonly reason: EligibilityReason;
  readonly source: EligibilitySource;
  readonly observable: boolean;
}

function classify(input: {
  readonly kind: OpportunityKind;
  readonly controlMode: ControlMode;
  readonly learningEligible: boolean;
  readonly suspension: EligibilitySuspension;
  readonly observable: boolean;
  readonly leader: EligibilityLeaderFact | null;
  readonly signal: EligibilitySignalFact | null;
  readonly greenExit: EligibilityGreenExitFact | null;
  readonly mechanical: EligibilityMechanicalDemand | null;
  readonly classId: VehicleClassId;
  readonly impact: EligibilityImpactFact | null;
}): Classification {
  if (input.impact !== null) {
    const label = 'IMPACT' as const;
    const reason: EligibilityReason = input.impact.collision
      ? 'COLLISION_IN_WINDOW'
      : input.impact.impairment !== null
        ? 'DAMAGE_LIMITED'
        : 'RECOVERY_IN_WINDOW';
    const source: EligibilitySource = input.impact.collision
      ? 'COLLISION_028'
      : input.impact.impairment !== null
        ? 'DAMAGE_029'
        : 'RECOVERY_030';
    return { label, reason, source, observable: input.observable };
  }
  if (input.suspension === 'FOCUS_LOST')
    return {
      label: 'FOCUS_LOST',
      reason: 'SUSPENSION_FOCUS_LOST',
      source: 'SUSPENSION_070',
      observable: input.observable,
    };
  if (input.suspension === 'PAUSE')
    return {
      label: 'PAUSE',
      reason: 'SUSPENSION_PAUSE',
      source: 'SUSPENSION_070',
      observable: input.observable,
    };
  if (!input.learningEligible)
    return {
      label: input.controlMode === 'MANUAL' ? 'MANUAL_SEGMENT' : 'AUTO_SEGMENT',
      reason: 'NON_LEARNING_SEGMENT',
      source: 'SEGMENT_069',
      observable: input.observable,
    };
  if (!input.observable)
    return {
      label: 'NOT_OBSERVABLE',
      reason: 'STIMULUS_NOT_OBSERVABLE',
      source: 'CAMERA_017',
      observable: false,
    };
  if (input.mechanical !== null) {
    const capability = mechanicalCapabilities(input.classId);
    const longitudinal = input.mechanical.demandedLongitudinalAccelerationMps2;
    const lateral = Math.abs(input.mechanical.demandedLateralAccelerationMps2);
    if (lateral > capability.maxLateralAccelerationMps2)
      return {
        label: 'MECHANICAL_LIMIT',
        reason: 'CAPABILITY_EXCEEDED_LATERAL',
        source: 'MECHANICS_023',
        observable: true,
      };
    if (longitudinal > capability.maxAccelerationMps2)
      return {
        label: 'MECHANICAL_LIMIT',
        reason: 'CAPABILITY_EXCEEDED_ACCELERATION',
        source: 'MECHANICS_023',
        observable: true,
      };
    if (-longitudinal > capability.maxDecelerationMps2)
      return {
        label: 'MECHANICAL_LIMIT',
        reason: 'CAPABILITY_EXCEEDED_DECELERATION',
        source: 'MECHANICS_023',
        observable: true,
      };
  }
  // A blocked green needs the real GREEN phase *and* the blocked exit; the exit fact alone is not enough.
  if (
    input.kind === 'GREEN' &&
    input.signal?.state === 'GREEN' &&
    input.greenExit?.blocked === true
  )
    return {
      label: 'BLOCKED_GREEN',
      reason: 'GREEN_EXIT_BLOCKED',
      source: input.greenExit.source === 'PRIORITY_OCCUPANCY' ? 'PRIORITY_038' : 'ROAD_CONTEXT_044',
      observable: true,
    };
  if (input.leader !== null)
    return {
      label: 'LEADER',
      reason:
        input.leader.speedMps <= FOLLOWING_LIMITS.standstillMps
          ? 'QUEUE_STANDSTILL'
          : 'LEADER_HEADWAY',
      source: 'FOLLOWING_048',
      observable: true,
    };
  return { label: 'FREE_TRAFFIC', reason: 'NO_CONSTRAINT', source: 'NONE', observable: true };
}

const labelClass = (label: EligibilityLabel): EligibilityWindowClass =>
  eligibilityLabelClasses[label];

const closureReason = (label: EligibilityLabel): ReactionClosureReason =>
  label === 'NOT_OBSERVABLE'
    ? 'NOT_OBSERVABLE'
    : labelClass(label) === 'EXTERNAL_CONSTRAINT'
      ? 'EXTERNAL_CONSTRAINT'
      : 'SEGMENT_EXCLUDED';

interface InternalWindow {
  readonly windowId: string;
  readonly opportunityId: string;
  readonly kind: OpportunityKind;
  readonly vehicleId: string;
  readonly incarnation: string;
  readonly segmentId: string;
  readonly controlMode: ControlMode;
  readonly learningEligible: boolean;
  readonly openedTick: number;
  label: EligibilityLabel;
  reason: EligibilityReason;
  source: EligibilitySource;
  observable: boolean;
  lastTick: number;
  observationCount: number;
  reactionOpen: boolean;
  reactionOpenedTick: number | null;
  reactionResponded: boolean;
  reactionDurationTicks: number | null;
  reactionDurationSeconds: number | null;
}

function windowCodeUnits(entry: InternalWindow): number {
  return (
    entry.windowId.length +
    entry.opportunityId.length +
    entry.vehicleId.length +
    entry.incarnation.length +
    entry.segmentId.length
  );
}

function describe(entry: InternalWindow): EligibilityWindowRecord {
  const reaction: EligibilityReactionWindow = entry.reactionOpen
    ? Object.freeze({
        open: true as const,
        openedTick: entry.reactionOpenedTick ?? entry.openedTick,
      })
    : Object.freeze({ open: false as const, reason: closureReason(entry.label) });
  const base = {
    windowId: entry.windowId,
    opportunityId: entry.opportunityId,
    kind: entry.kind,
    reason: entry.reason,
    source: entry.source,
    observable: entry.observable,
    vehicleId: entry.vehicleId,
    incarnation: entry.incarnation,
    segmentId: entry.segmentId,
    controlMode: entry.controlMode,
    learningEligible: entry.learningEligible,
    openedTick: entry.openedTick,
    lastTick: entry.lastTick,
    observationCount: entry.observationCount,
    reaction,
  };
  const windowClass = labelClass(entry.label);
  if (windowClass === 'ELIGIBLE')
    return Object.freeze({ ...base, windowClass: 'ELIGIBLE', label: 'FREE_TRAFFIC' });
  if (windowClass === 'EXTERNAL_CONSTRAINT')
    return Object.freeze({
      ...base,
      windowClass: 'EXTERNAL_CONSTRAINT',
      label: entry.label as ExternalConstraintLabel,
    });
  return Object.freeze({
    ...base,
    windowClass: 'EXCLUDED',
    label: entry.label as ExcludedLabel,
  });
}

/**
 * Bounded 087 eligibility layer. Windows are keyed by the 086 opportunity id and their
 * classification only ever tightens toward the documented precedence, so a window that was ever
 * constrained or excluded can never drift back into the learning denominator.
 */
export function createEligibilityWindows(
  options: EligibilityWindowsOptions = {},
): EligibilityWindows {
  const config = record(options);
  for (const key of Object.keys(config))
    requireContract(
      optionKeys.includes(key as (typeof optionKeys)[number]),
      'Unknown eligibility option',
    );
  const maxWindows =
    config.maxWindows === undefined ? ELIGIBILITY_CAPACITY.default : readTick(config.maxWindows);
  requireContract(
    maxWindows >= ELIGIBILITY_CAPACITY.minimum && maxWindows <= ELIGIBILITY_CAPACITY.maximum,
    'Eligibility store capacity out of range',
  );
  requireContract(
    maxWindows * ELIGIBILITY_RECORD_BYTES_CEILING <= ELIGIBILITY_RECORDER_RAM_BYTES,
    'Eligibility store cannot fit the recorder RAM budget',
  );

  let disposed = false;
  let sessionId: string | null = null;
  let worldEpoch: number | null = null;
  let lastObservedTick: number | null = null;
  let windowsOpened = 0;
  let reclassifiedTotal = 0;
  let retiredTotal = 0;
  let rejectedTotal = 0;
  let observationCalls = 0;
  let skippedTicks = 0;
  let responsesAccepted = 0;
  let responsesRefused = 0;
  let reactionWindowsOpened = 0;
  let preferenceEvidenceEmitted = 0;
  let preferenceEvidenceRefused = 0;

  const classCounts = new Map<EligibilityWindowClass, number>([
    ['ELIGIBLE', 0],
    ['EXTERNAL_CONSTRAINT', 0],
    ['EXCLUDED', 0],
  ]);
  const labelCounts = new Map<EligibilityLabel, number>(
    eligibilityLabels.map((label) => [label, 0]),
  );
  const retained = new Map<string, InternalWindow>();
  const order: InternalWindow[] = [];

  const alive = () => requireContract(!disposed, 'Eligibility windows disposed');

  const adjust = (label: EligibilityLabel, delta: number) => {
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + delta);
    const windowClass = labelClass(label);
    classCounts.set(windowClass, (classCounts.get(windowClass) ?? 0) + delta);
  };

  const retire = (entry: InternalWindow) => {
    // Cumulative label evidence survives retirement, exactly like the 086 denominators.
    retained.delete(entry.opportunityId);
    retiredTotal += 1;
  };

  return Object.freeze({
    version: ELIGIBILITY_VERSION,
    observe(value: EligibilityWindowObservation): EligibilityWindowRecord {
      alive();
      const data = fields(value, observationFields);
      const tick = readTick(data.tick);
      const observationSession = identity(data.sessionId);
      const observationEpoch = readTick(data.worldEpoch);
      if (sessionId === null && worldEpoch === null) {
        sessionId = observationSession;
        worldEpoch = observationEpoch;
      }
      requireContract(
        observationSession === sessionId && observationEpoch === worldEpoch,
        'Eligibility observation belongs to another session or world epoch',
      );
      if (lastObservedTick !== null) {
        requireContract(tick >= lastObservedTick, 'Eligibility observation tick regressed');
        skippedTicks += tick - lastObservedTick - 1;
      }
      lastObservedTick = tick;
      observationCalls += 1;

      const opportunityId = identity(data.opportunityId);
      const kind = choice(data.kind, kindValues);
      const vehicleId = identity(data.vehicleId);
      const incarnation = identity(data.incarnation);
      const segmentId = identity(data.segmentId);
      const controlMode = choice(data.controlMode, controlModes);
      const learningEligible = boolean(data.learningEligible);
      requireContract(
        !learningEligible || controlMode === 'LEARNING',
        'Only LEARNING can produce learning-eligible windows',
      );
      const classId = choice(data.classId, classIds);
      const suspension = choice(data.suspension, eligibilitySuspensions);
      const visibility = readVisibility(data.visibility);
      const leader = data.leader === null ? null : readLeader(data.leader);
      const signal = data.signal === null ? null : readSignal(data.signal);
      const greenExit = data.greenExit === null ? null : readGreenExit(data.greenExit);
      const mechanical = data.mechanical === null ? null : readMechanical(data.mechanical);
      const impact = data.impact === null ? null : readImpact(data.impact);
      const observable = isObservable(visibility);
      const classification = classify({
        kind,
        controlMode,
        learningEligible,
        suspension,
        observable,
        leader,
        signal,
        greenExit,
        mechanical,
        classId,
        impact,
      });

      const existing = retained.get(opportunityId);
      if (existing !== undefined) {
        existing.lastTick = Math.max(existing.lastTick, tick);
        existing.observationCount += 1;
        // Observability can only be lost: a window is eligible only if it was always visible.
        existing.observable = existing.observable && classification.observable;
        const candidateRank = precedenceRank.get(classification.label)!;
        const currentRank = precedenceRank.get(existing.label)!;
        if (candidateRank < currentRank) {
          adjust(existing.label, -1);
          existing.label = classification.label;
          existing.reason = classification.reason;
          existing.source = classification.source;
          adjust(existing.label, 1);
          reclassifiedTotal += 1;
        }
        if (existing.label !== 'FREE_TRAFFIC') existing.reactionOpen = false;
        return describe(existing);
      }

      // A window is final as soon as it is classified, so the bounded store retires the oldest one.
      while (order.length >= maxWindows) {
        const oldest = order.shift();
        if (oldest === undefined) break;
        retire(oldest);
      }
      const windowId = createStableId('eligibility-entry', sessionId!, [
        String(worldEpoch!),
        opportunityId,
      ]);
      const opened: InternalWindow = {
        windowId,
        opportunityId,
        kind,
        vehicleId,
        incarnation,
        segmentId,
        controlMode,
        learningEligible,
        openedTick: tick,
        label: classification.label,
        reason: classification.reason,
        source: classification.source,
        observable: classification.observable,
        lastTick: tick,
        observationCount: 1,
        reactionOpen: false,
        reactionOpenedTick: null,
        reactionResponded: false,
        reactionDurationTicks: null,
        reactionDurationSeconds: null,
      };
      if (windowCodeUnits(opened) > ELIGIBILITY_IDENTITY_CODE_UNITS_CEILING) {
        rejectedTotal += 1;
        throw new Error('Eligibility entry identity capacity exceeded');
      }
      if (classification.label === 'FREE_TRAFFIC') {
        opened.reactionOpen = true;
        opened.reactionOpenedTick = tick;
        reactionWindowsOpened += 1;
      }
      retained.set(opportunityId, opened);
      order.push(opened);
      windowsOpened += 1;
      adjust(classification.label, 1);
      return describe(opened);
    },
    respond(value: EligibilityResponseInput): EligibilityResponseResult {
      alive();
      const data = fields(value, responseFields);
      const tick = readTick(data.tick);
      const opportunityId = identity(data.opportunityId);
      if (lastObservedTick !== null)
        requireContract(tick >= lastObservedTick, 'Eligibility response tick regressed');
      const entry = retained.get(opportunityId);
      const refused = (reason: ResponseReason): EligibilityResponseResult => {
        responsesRefused += 1;
        return Object.freeze({
          accepted: false,
          reason,
          durationTicks: null,
          durationSeconds: null,
        });
      };
      if (entry === undefined) return refused('NO_WINDOW');
      if (entry.reactionResponded) return refused('ALREADY_RESPONDED');
      if (entry.label === 'NOT_OBSERVABLE') return refused('NOT_OBSERVABLE');
      if (labelClass(entry.label) === 'EXTERNAL_CONSTRAINT') return refused('EXTERNAL_CONSTRAINT');
      if (!entry.reactionOpen || !entry.observable) return refused('SEGMENT_EXCLUDED');
      entry.reactionResponded = true;
      entry.reactionOpen = false;
      const durationTicks = tick - (entry.reactionOpenedTick ?? entry.openedTick);
      entry.reactionDurationTicks = durationTicks;
      entry.reactionDurationSeconds = durationTicks / ELIGIBILITY_REACTION_TICK_HZ;
      responsesAccepted += 1;
      return Object.freeze({
        accepted: true,
        reason: 'RESPONSE',
        durationTicks,
        durationSeconds: entry.reactionDurationSeconds,
      });
    },
    emitPreferenceEvidence(entry: EligibleWindowRecord): PreferenceEvidenceRecord {
      alive();
      const owned = retained.get(entry.opportunityId);
      // The runtime gate: the window must still be owned by this layer and still be ELIGIBLE.
      // `windowClass`/`label` are re-checked even though the parameter type already narrows them.
      const valid =
        owned !== undefined &&
        owned.windowId === entry.windowId &&
        labelClass(owned.label) === 'ELIGIBLE' &&
        entry.windowClass === 'ELIGIBLE' &&
        entry.label === 'FREE_TRAFFIC';
      if (!valid) {
        preferenceEvidenceRefused += 1;
        throw new Error('Only a free-traffic eligible entry can become preference evidence');
      }
      preferenceEvidenceEmitted += 1;
      return Object.freeze({
        version: ELIGIBILITY_VERSION,
        windowId: entry.windowId,
        opportunityId: entry.opportunityId,
        kind: entry.kind,
        vehicleId: entry.vehicleId,
        incarnation: entry.incarnation,
        reactionDurationTicks: owned.reactionDurationTicks,
        reactionDurationSeconds: owned.reactionDurationSeconds,
      });
    },
    getWindow(opportunityId: string) {
      const found = retained.get(identity(opportunityId));
      return found ? describe(found) : null;
    },
    getWindows: () => Object.freeze(order.map(describe)),
    getDenominators(): EligibilityDenominators {
      const byLabel = eligibilityLabels.map((label) =>
        Object.freeze({
          label,
          windowClass: labelClass(label),
          count: labelCounts.get(label) ?? 0,
        }),
      );
      const externalConstraints = byLabel.filter(
        (entry) => entry.windowClass === 'EXTERNAL_CONSTRAINT',
      );
      return Object.freeze({
        version: ELIGIBILITY_VERSION,
        total: windowsOpened,
        eligible: classCounts.get('ELIGIBLE') ?? 0,
        externalConstraint: classCounts.get('EXTERNAL_CONSTRAINT') ?? 0,
        excluded: classCounts.get('EXCLUDED') ?? 0,
        byLabel: Object.freeze(byLabel),
        externalConstraints: Object.freeze(externalConstraints),
        notObservable: labelCounts.get('NOT_OBSERVABLE') ?? 0,
        reactionWindowsOpened,
        reactionSamples: responsesAccepted,
        responsesRefused,
        preferenceEvidenceEmitted,
        preferenceEvidenceRefused,
      });
    },
    getStats(): EligibilityStats {
      let identityCodeUnits = 0;
      let eligibleRetained = 0;
      for (const entry of order) {
        identityCodeUnits += windowCodeUnits(entry);
        if (labelClass(entry.label) === 'ELIGIBLE') eligibleRetained += 1;
      }
      return Object.freeze({
        version: ELIGIBILITY_VERSION,
        disposed,
        maxWindows,
        windowsOpened,
        reclassifiedTotal,
        retiredTotal,
        rejectedTotal,
        observationCalls,
        skippedTicks,
        responsesAccepted,
        responsesRefused,
        retained: order.length,
        eligibleRetained,
        identityCodeUnits,
        estimatedBytes: order.length * ELIGIBILITY_BYTES_PER_RECORD + identityCodeUnits * 2,
        estimatedBytesMaximum: maxWindows * ELIGIBILITY_RECORD_BYTES_CEILING,
      });
    },
    dispose() {
      if (disposed) return;
      order.length = 0;
      retained.clear();
      disposed = true;
    },
  });
}

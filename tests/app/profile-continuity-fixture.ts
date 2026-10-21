import {
  DEFAULT_FLEET_COUNTS,
  createFleetRegistry,
  createProfileActivation,
  createProfileActivationSource,
} from '../../src/fleet';
import type {
  FleetRegistry,
  ProfileActivation,
  ProfileActivationPublication,
  ProfileActivationSource,
} from '../../src/fleet';
import type {
  LaneChangeRead,
  ManeuverSnapshotSources,
  ManualAuthorityRead,
  SignalOpportunityRead,
  VehicleMotionRead,
} from '../../src/app';
import { projectSignalProfile } from '../../src/autonomy';
import type { SignalPolicyProfile } from '../../src/autonomy';
import { parsePublishableDrivingProfile } from '../../src/profiles/parameter-registry';

export const CONTINUITY_ENGINE = 'engine-1';
export const CONTINUITY_PROFILE_ID = 'city-profile';
export const CONTINUITY_BASE_VERSION = 'profile-v1';
export const CONTINUITY_NEXT_VERSION = 'profile-v2';
export const CONTINUITY_SESSION = 'session-111';
export const CONTINUITY_NOW = '2026-10-21T00:00:00Z';
export const CONTINUITY_SEED = 20261021;

export interface MutableMotion extends VehicleMotionRead {
  positionM: { x: number; y: number; z: number };
  speedMps: number;
  headingRad: number;
}

export interface ContinuityFixture {
  readonly registry: FleetRegistry;
  readonly source: ProfileActivationSource;
  readonly activation: ProfileActivation;
  readonly vehicleId: string;
  readonly motion: MutableMotion;
  readonly laneChange: { current: LaneChangeRead | null };
  readonly signal: { current: SignalOpportunityRead | null };
  readonly authority: { current: ManualAuthorityRead | null };
  readonly sources: ManeuverSnapshotSources;
  tick(): number;
  setTick(tick: number): void;
  publish(overrides?: Record<string, unknown>): ProfileActivationPublication;
}

export function continuityConfiguration(
  profileId = CONTINUITY_PROFILE_ID,
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: CONTINUITY_SESSION,
    worldEpoch: 1,
    scenarioId: 'city-fixture',
    seed: CONTINUITY_SEED,
    namespace: 'city:fixture:continuity',
    taxiCount: DEFAULT_FLEET_COUNTS.taxis,
    civilianCount: DEFAULT_FLEET_COUNTS.civilians,
    profile: { profileId, versionId: CONTINUITY_BASE_VERSION },
  };
}

export interface ContinuityFixtureOptions {
  readonly profileId?: string;
  readonly wrap?: (registry: FleetRegistry) => FleetRegistry;
}

export function continuityFixture(
  profileVersionId = CONTINUITY_BASE_VERSION,
  options: ContinuityFixtureOptions = {},
): ContinuityFixture {
  let current = 0;
  const profileId = options.profileId ?? CONTINUITY_PROFILE_ID;
  const source = createProfileActivationSource({
    profileId,
    versionId: profileVersionId,
  });
  const base = createFleetRegistry(continuityConfiguration(profileId), { profileSource: source });
  const registry = options.wrap === undefined ? base : options.wrap(base);
  const activation = createProfileActivation({
    registry,
    source,
    engineVersion: CONTINUITY_ENGINE,
    clock: () => current,
    now: () => CONTINUITY_NOW,
  });
  const vehicleId = registry.list()[0]!.vehicleId;
  const motion: MutableMotion = {
    positionM: { x: 3.25, y: 0.35, z: 120.5 },
    speedMps: 11.25,
    headingRad: 0.42,
  };
  const laneChange: { current: LaneChangeRead | null } = { current: null };
  const signal: { current: SignalOpportunityRead | null } = { current: null };
  const authority: { current: ManualAuthorityRead | null } = { current: null };
  const fixture: ContinuityFixture = {
    registry,
    source,
    activation,
    vehicleId,
    motion,
    laneChange,
    signal,
    authority,
    sources: {
      fleet: registry,
      vehicle: { vehicleId, read: () => motion },
      laneChange: { read: () => laneChange.current },
      signal: { read: () => signal.current },
      authority: { read: () => authority.current },
    },
    tick: () => current,
    setTick(tick: number): void {
      current = tick;
    },
    publish(overrides: Record<string, unknown> = {}): ProfileActivationPublication {
      return activation.publish({
        profileId,
        versionId: CONTINUITY_NEXT_VERSION,
        engineVersion: CONTINUITY_ENGINE,
        publishedAtTick: current,
        activateAtTick: current + 1,
        reason: 'learned segment applied',
        origin: 'LEARNED',
        idempotencyKey: 'continuity-key-1',
        ...overrides,
      });
    },
  };
  return fixture;
}

export function publishedSignalProfile(
  versionId: string,
  values: Partial<Record<string, number>> = {},
) {
  return parsePublishableDrivingProfile({
    schemaVersion: 1,
    units: 'SI',
    profileId: 'signal-style',
    versionId,
    parentVersionId: null,
    engineVersion: CONTINUITY_ENGINE,
    parameters: {
      red_stop_probability: 1,
      green_start_delay: 0.7,
      red_stop_line_offset: 1,
      late_red_brake_threshold: 2,
      ...values,
    },
    unitsByParameter: {
      red_stop_probability: 'probability',
      green_start_delay: 's',
      red_stop_line_offset: 'm',
      late_red_brake_threshold: 's',
    },
    provenanceByParameter: {
      red_stop_probability: 'BASE',
      green_start_delay: 'BASE',
      red_stop_line_offset: 'BASE',
      late_red_brake_threshold: 'BASE',
    },
    evidenceByParameter: {
      red_stop_probability: null,
      green_start_delay: null,
      red_stop_line_offset: null,
      late_red_brake_threshold: null,
    },
    sourceSegmentIds: [],
    createdAt: '2026-10-21T00:00:00.000Z',
    checksum: 'fixture',
  });
}

export function signalProfile(versionId: string): SignalPolicyProfile {
  return projectSignalProfile(publishedSignalProfile(versionId));
}

export function redObservation(distanceToStopLineM = 20) {
  return {
    version: '050-signal-observation-v1' as const,
    units: 'SI' as const,
    tick: 0,
    signalId: 'signal',
    intersectionId: 'junction',
    movementId: 'west-straight',
    phaseId: 'west-red',
    state: 'RED' as const,
    phaseElapsedS: 0.5,
    distanceToStopLineM,
  };
}

export function laneChangeRead(
  state: 'IDLE' | 'COMMITTED' = 'COMMITTED',
  progress = 0.4,
): LaneChangeRead {
  return {
    state:
      state === 'COMMITTED'
        ? { committed: { targetLaneId: 'lane-par', startedTick: 0 }, lastChangeTick: 0 }
        : { committed: null, lastChangeTick: null },
    progress,
  };
}

export function manualRead(overrides: Partial<ManualAuthorityRead> = {}): ManualAuthorityRead {
  return {
    seat: 'PLAYER',
    mode: 'MANUAL',
    command: {
      commandId: 'command-7',
      throttle: 0.4,
      brake: 0,
      steering: -0.1,
      handbrake: false,
    },
    ...overrides,
  };
}

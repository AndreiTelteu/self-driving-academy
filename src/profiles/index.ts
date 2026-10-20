export {
  parseDrivingProfile,
  parseParameterEvidence,
  parameterUnits,
  parameterSources,
} from './contracts';
export type { DrivingProfile, ParameterEvidence } from './contracts';
export {
  parseParameterCatalog,
  parameterRegistry,
  parameterDefinitions,
  getParameterDefinition,
  validateParameterValue,
  parsePublishableDrivingProfile,
} from './parameter-registry';
export type {
  ParameterKey,
  ParameterUnit,
  ParameterStage,
  ParameterDefinition,
} from './parameter-registry';
export {
  PROFILE_STORE_VERSION,
  PROFILE_STORE_CHECKSUM_ALGORITHM,
  PROFILE_STORE_LIMITS,
  PROFILE_STORE_POLICY,
  profileStoreRejectionCodes,
  computeProfileVersionChecksum,
  verifyProfileVersionChecksum,
  createProfileStore,
  isProfileStoreAccepted,
} from './profile-store';
export type {
  ProfileDeltaChange,
  ProfileDeltaRequest,
  ProfileDeltaValidationAccepted,
  ProfileDeltaValidationExpectations,
  ProfileDeltaValidationInput,
  ProfileDeltaValidationRejected,
  ProfileDeltaValidationResult,
  ProfileDeltaValidationValue,
  ProfileDeltaValidator,
  ProfileStore,
  ProfileStoreAccepted,
  ProfileStoreOptions,
  ProfileStoreRejected,
  ProfileStoreRejection,
  ProfileStoreRejectionCode,
  ProfileStoreResult,
  ProfileStoreStats,
  ProfileVersion,
  ProfileVersionContent,
  ProfileVersionDelta,
  ProfileVersionProvenance,
  CreateProfileBaseInput,
} from './profile-store';

/** Minimal bootstrap read model, separate from the versioned DrivingProfile import contract. */
export interface ProfileSnapshot {
  readonly profileId: string;
  readonly versionId: string;
  readonly parameters: Readonly<Record<string, number>>;
}

/** Copy before freezing so the caller retains ownership of the original map. */
export function createProfileSnapshot(profile: ProfileSnapshot): ProfileSnapshot {
  return Object.freeze({
    profileId: profile.profileId,
    versionId: profile.versionId,
    parameters: Object.freeze({ ...profile.parameters }),
  });
}

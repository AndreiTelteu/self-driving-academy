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
  isReservedParameterKey,
  reservedParameterKeys,
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
  profileContentHash,
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

export {
  PROFILE_V2_VERSION,
  PROFILE_V2_CHECKSUM_ALGORITHM,
  PROFILE_SCHEMA_VERSION_V1,
  PROFILE_SCHEMA_VERSION_V2,
  PROFILE_CATALOG_VERSION,
  profileV2Origins,
  profileV2SupportStatuses,
  profileV2EvidenceSources,
  profileV2ReasonCodes,
  profileV2RejectionCodes,
  profileV2OriginLabels,
  profileV2SupportLabels,
  profileV2EvidenceSourceLabels,
  parseProfileCatalogVersion,
  compareProfileCatalogVersions,
  computeProfileV2Checksum,
  verifyProfileV2Checksum,
  parseProfileV2,
  migrateProfileV1ToV2,
  readProfileDocument,
  rollbackProfileV2ToV1,
  projectProfileV2ForUi,
  summarizeProfileV2,
} from './profile-v2';
export type {
  ProfileCatalogVersion,
  ProfileV2Origin,
  ProfileV2SupportStatus,
  ProfileV2EvidenceSource,
  ProfileV2ReasonCode,
  ProfileV2Key,
  ProfileV2MigrationSource,
  ProfileV2,
  ProfileV2Content,
  ProfileV2RejectionCode,
  ProfileV2Rejection,
  ProfileV2MigrationAccepted,
  ProfileV2MigrationRejected,
  ProfileV2MigrationResult,
  ProfileDocumentCurrent,
  ProfileDocumentMigrated,
  ProfileDocumentRejected,
  ProfileDocumentReadResult,
  ProfileMigrationOptions,
  ProfileV2RollbackAccepted,
  ProfileV2RollbackRejected,
  ProfileV2RollbackResult,
  ProfileV2UiKey,
  ProfileV2Summary,
} from './profile-v2';

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

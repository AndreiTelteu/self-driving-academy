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

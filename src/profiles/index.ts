/** Minimal bootstrap read model; complete DrivingProfile belongs to PBI 005. */
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

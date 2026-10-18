import { longitudinalProfile } from './longitudinal-reference';
export const followingKeys = [
  'following_time_headway',
  'following_min_gap',
  'queue_standstill_gap',
  'following_speed_gain',
] as const;
export const followingValues = [1.8, 3, 2, 0.7] as const;
export function followingProfile(values: readonly number[] = followingValues) {
  const base = longitudinalProfile();
  return {
    ...base,
    profileId: '048-fixture',
    versionId: '048-profile-v1',
    parameters: {
      ...base.parameters,
      ...Object.fromEntries(followingKeys.map((k, i) => [k, values[i]])),
    },
    unitsByParameter: {
      ...base.unitsByParameter,
      ...Object.fromEntries(followingKeys.map((k, i) => [k, ['s', 'm', 'm', '1/s'][i]])),
    },
    provenanceByParameter: {
      ...base.provenanceByParameter,
      ...Object.fromEntries(followingKeys.map((k) => [k, 'BASE'])),
    },
    evidenceByParameter: {
      ...base.evidenceByParameter,
      ...Object.fromEntries(followingKeys.map((k) => [k, null])),
    },
  };
}
/** Independent preproduction arithmetic: stopped leader uses queue gap, moving leader uses headway. */
export function referenceFollowing(
  values: readonly number[],
  egoSpeed: number,
  leaderSpeed: number,
  gap: number,
  cruise: number,
) {
  const desiredGapM =
    leaderSpeed <= 0.1 ? values[2] : values[1] + values[0] * Math.max(0, egoSpeed);
  // Explicit one-second policy horizon converts speed relaxation acceleration into speed.
  return {
    desiredGapM,
    targetMps: Math.max(
      0,
      Math.min(
        cruise,
        Math.max(0, egoSpeed) +
          values[3] * (leaderSpeed - Math.max(0, egoSpeed)) * 1 +
          values[3] * (gap - desiredGapM),
      ),
    ),
  };
}

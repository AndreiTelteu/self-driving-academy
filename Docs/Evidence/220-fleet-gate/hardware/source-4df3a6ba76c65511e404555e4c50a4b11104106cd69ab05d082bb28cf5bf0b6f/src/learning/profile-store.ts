import { createProfileStore } from '../profiles';
import type { ProfileStore, ProfileStoreOptions } from '../profiles';
import { validateCandidateDelta } from './candidate-validation';

/** Store options without the validator: the 102 numeric gate is wired here. */
export type CandidateProfileStoreOptions = Omit<ProfileStoreOptions, 'validateDelta'>;

/**
 * Canonical production binding for PBI 109. `src/profiles` cannot import `src/learning` without a
 * domain cycle, so the profiles store accepts a delta-validator port; this factory supplies the
 * 102 `validateCandidateDelta` implementation.
 */
export function createCandidateProfileStore(options: CandidateProfileStoreOptions): ProfileStore {
  return createProfileStore({ ...options, validateDelta: validateCandidateDelta });
}

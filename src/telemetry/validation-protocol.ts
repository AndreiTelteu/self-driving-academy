/** Versioned protocols. Development evidence never closes a hardware release gate. */
export const VALIDATION_POLICY_VERSION = 'targeted-validation-v1';
export const VALIDATION_PROFILES = Object.freeze({
  smoke: Object.freeze({ pairs: 5, warmupMs: 100, measuredMs: 400, suffix: '-SMOKE' }),
  development: Object.freeze({ pairs: 3, warmupMs: 15000, measuredMs: 30000, suffix: '-DEV' }),
  full: Object.freeze({ pairs: 5, warmupMs: 30000, measuredMs: 120000, suffix: '' }),
});
export type ValidationProfile = keyof typeof VALIDATION_PROFILES;

export function profileForFixture(fixture: string): ValidationProfile {
  return fixture.endsWith('-DEV') ? 'development' : fixture.endsWith('-SMOKE') ? 'smoke' : 'full';
}

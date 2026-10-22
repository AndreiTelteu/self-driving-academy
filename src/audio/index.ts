/**
 * Public entry point of the audio module.
 *
 * The engine owns the mixing policy, the voice pool and the ownership; the backend port isolates
 * the Web Audio API (`web-audio-backend.ts`) from the deterministic Node driver
 * (`fake-backend.ts`).
 */
export * from './contracts';
export * from './ports';
export * from './engine';
export * from './fake-backend';
export * from './web-audio-backend';
export * from './collision-bridge';
export * from './procedural';

/**
 * Domain entry point of the destructibles module.
 *
 * The 227 state machine remains in `src/world/destructible-decor.ts`; the live composition that
 * couples it to audio, replay and physics lives in `src/app/live-chaos.ts`, because a domain module
 * must not import adapter/composition modules. This file stays as the stable module boundary.
 */
export {};

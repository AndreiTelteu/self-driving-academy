# 029 preimplementation capture plan

Current state: PREPARED, NOT EXECUTED. No production damage algorithm exists; CPU/browser belongs to026. Canonical board and integration belong to the parent.

Assigned worktree: F:/Sites/self-driving-academy/.worktrees/vehicle-damage-01, loop-pbi/vehicle-damage-01, base d80bf721e536ff1400dc48e1656169ac2fecfa61.

## Chronological baseline

Run after exclusive CPU grant, before damage-state.ts/damage-port.ts exist:

- `node --expose-gc --import ./scripts/register-typescript.mjs tests/browser/vehicle-damage-baseline.mjs`
- `node --expose-gc --import ./scripts/register-typescript.mjs tests/browser/vehicle-damage-calibration.mjs`

The baseline uses actual024 controller with70 physical021 cars,67 anonymous obstacles,60Hz actuation and10Hz refreshed commands. Five alternating observer-off/on pairs,180 warmup ticks and600 measured ticks per world. This is supplemental unpaced native CPU, not a120-second headed performance/FPS claim. Raw intermediate physical traces, input hashes and final70-car physical hashes must match across observers. Timers report whole controller/native phases and external incremental controller cost. Sources, installed native ESM with inlined WASM, and commit are preserved; existing captures cannot be overwritten.

Calibration uses023 sedan/compact, actual named wall, native028 onset incidents,1/3/6/12m/s initial velocities,180 settling and1200 measured physics ticks. Choose provisional versioned damage thresholds only after actual impulse traces. These thresholds are gameplay calibration, not measured real crash tolerances.

## Proposed029 contract

Pure state owner, at most110 exact current BodyIdentity registrations, copied bounded session/epoch context. AVAILABLE, DAMAGED and IMMOBILIZED availability. DAMAGED limits propulsion magnitude; IMMOBILIZED disables propulsion and requests the existing service brake. Existing60Hz/native forces/collisions remain; no freezing, teleport or mass/grip/power changes. Both command sources use the same effect, with raw distinct from realized effective command.

Damage input uses028 incidents once per onset, exact collision/body identities, current session/epoch, and finite retention. Recovery explicitly restores mobility and records an operation while preserving incidents. Retention overflow is an explicit failed admission/backpressure before effects, never silent truncation. Reuse and world changes fence stale operations. No passenger/economy gameplay, relocation226, durable savefile234 or fleet dispatch implementation is claimed.

## Pending validation

Actual native threshold boundaries, low/high impacts, physical propulsion/braking effects, same source parity, recovery/history, duplicate/conflicting incidents, stale tokens/epochs, capacity/reentrancy/terminal fault,20-cycle cleanup. Same fixture AFTER cost compared against preserved BEFORE; added damage/event cost separately. Headed hardware functional playtest in Chrome on actual AMD WebGPU andWebGL2 after slot grant, CSS/internal1920x1080/DPR1. Global project checks and parent integration/board validators remain required.
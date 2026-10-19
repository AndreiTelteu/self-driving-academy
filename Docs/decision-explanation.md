# Decision explanation and observability 055

Status: implementation with targeted local validation. The PBI055 board state and publication are owned by the parent; the targeted cost/memory probe, the tests and the limitations are recorded in [the 055 evidence](Evidence/055-decision-explanation/README.md).

`explainDecision` turns one decision of the real autonomy chain into an immutable, read-only explanation: the ordered reason codes the chain produced, the quantities it actually used and the profile keys that actually influenced it, each with the value that was really consumed. It is a pure builder over decisions that already exist; it does not evaluate a policy and it does not own behaviour state. `createDecisionExplainer` adds a bounded current-explanation store, keyed by admitted actor, that the owner feeds from the 219 decision port and that a UI or a test reads back.

## Public API and the frozen shape

```typescript
import {
  explainDecision, // pure: (input) => deeply frozen DecisionExplanation
  consumedInfluences, // registry-gated [key, value] gate used by the builder
  createDecisionExplainer, // bounded per-actor current store with explicit fences
  DECISION_EXPLANATION_LIMITS,
} from '../autonomy';
```

`explainDecision(input)` takes `{ sessionId, worldEpoch, actor, decisionTick, behavior, reasons, action, targets, influences }` and returns:

| Field | Meaning |
| --- | --- |
| `version` | `055-decision-explanation-v1`; the shape is versioned, not free-form. |
| `sessionId` / `worldEpoch` / `actor` / `decisionTick` | The exact decision identity; they must match the 045 decision. |
| `sourceTick` / `profileVersionId` | Carried from the 045 decision; never restamped by this module. |
| `behavior` | Detached scalars `{ state, reason, previousState, transitioned, sourceTick, profileVersionId }`; a copy, never the FSM object. |
| `reasons` | The ordered reason codes of the chain, `1..16`, unique; the last element must equal `behavior.reason`. |
| `action` | The chosen action of the policy layer for this slice (`STOP`, `CHANGE`, `REQUEST_REROUTE`, …) or `null`. |
| `targets` | `1..32` uniquely named `{ name, value }` quantities the decision actually used (speed targets, gaps, thresholds). |
| `influences` | `0..32` `{ key, value, implemented: true }` entries: only registry-implemented keys, with the consumed value. |
| `retainedHistory` | Literal `0`; the explanation owns no history. |

The whole object, its nested `behavior`, its reason array, its target array and every influence/target entry are deeply frozen at build time. The builder never keeps a reference to the input and never returns a live reference into the 045 decision, a policy decision or a caller object, so a reader cannot reach `Object.defineProperty`, `Reflect.set` or a nested assignment into the autonomy state.

`createDecisionExplainer(scope)` follows the 045 ownership fences: `setActors` (at most 110 actors, dense data array only), `capture` (validates and stores one explanation per actor, requiring a strictly advancing `decisionTick`), `read` (nullable current explanation), `view` (explicit present/absent union), `reset` (must advance the epoch), `dispose` (idempotent) and `getStats` (`actors`, `explanations`, `retainedHistory: 0`, `disposed`). Unknown, stale, foreign, reentrant or disposed access rejects; there is no eviction or truncation.

## Integration point and "no decision yet"

The owner calls `explainer.capture(...)` from the same 219 decision callback that already calls `behavior.decide(...)`. The explanation is built from the decision object that the FSM just returned plus the reason codes and consumed values of the policy layers that fed it. Nothing else in the tick is read or written, so the 60 Hz input/controller/physics cadence and the 10 Hz decision distribution are unchanged. A UI reads with `view(actor, scope)` (or `read(actor, scope)` for a nullable form) at any later time; the returned snapshot is independent of future decisions.

Before the actor's first decision, and during any window in which 045 keeps no AUTO decision (for example MANUAL authority), `view` returns an explicit `{ present: false, decisionTick: null, reason: 'NO_DECISION', ... }` record instead of guessing, and `read` returns `null`. An actor that was never admitted is a rejection, not a silent none.

## Honesty: reason, targets and provenance

`reasons` is not a free-text field. Its last element is checked against the real 045 `state`/`reason` pair (the closed 045 reason families are re-declared, so a foreign pair cannot be explained), and the earlier elements are the policy-chain reasons the owner supplies. The builder therefore cannot publish a reason the FSM did not actually select.

`influences` is registry-gated. A declared `[key, value]` pair with a non-null value requires a known registry key whose `implemented` flag is `true`; otherwise the whole explanation is rejected with a `ContractValidationError` (`Unimplemented decision influence: <key>`). A `null` value means "not consumed" and is dropped, so a value that was not used is never claimed. `implemented: true` is captured at build time as proof that the registry granted the capability.

Provenance reflects real consumption, not the whole profile: a compliant red stop declares `red_stop_probability` and `red_stop_line_offset` and never `green_start_delay` or `late_red_brake_threshold` (they were not read on that branch); a moving green release declares no 050 key at all; a `FOLLOW_LANE` with an URBAN road and no curve declares only `speed_delta_urban`; `FOLLOW_LEADER` declares the headway, minimum-gap and speed-gain keys it used but never `queue_standstill_gap` because the leader was moving. `054` consumes no profile parameter, so a BLOCKED/recovery explanation exposes its cause and its bounded counters as targets and claims no influence.

## Acceptance criterion 2 and the 052 registry gap

The gate above is how "an unimplemented parameter does not appear as the reason of a decision" is enforced: `red_stop_probability` is admitted because the registry marks it implemented, while a V2 catalog key such as `speed_delta_arterial` and an unknown key are refused, and a key that would be declared twice is refused.

One real conflict is reported rather than hidden. The 052 yield policy consumes `yield_time_gap` and the coverage matrix maps that key to policy 052, but the 092 registry does not mark it `implemented` (its runtime capability set lists 046/047/048/050/051/053, not 052). Under this contract that key therefore cannot be attributed as an influence: a YIELD decision explains its reason (`GAP_REFUSED` → `YIELD_CONFLICT_BY_POLICY`) and reports `yieldThresholdS`/`minimumGapS` as consumed targets, with an empty `influences` list, and any attempt to declare `yield_time_gap` is refused. Making that key traceable as an influence requires a 092 registry change (marking it implemented and extending the registry test's expected list); PBI055 does not make that change, because it would alter a 092 contract and its test. This is the honest reading of the registry as it exists today.

## What it is not

It is not a second FSM and does not extend or duplicate the 045 reason set: every state and reason comes from the real 045 decision, and the policy reason codes come from the real 046–054 decisions. It is not a source of truth for the decision: it is a projection, it never feeds anything back and it has no reference to the FSM, so reading it cannot change future decisions. It is not a writer of speed targets, routes, poses or physics, and it does not own a clock, a planner or a policy. It is not a general ledger: at most one explanation per admitted actor is kept, with no history, no events and no telemetry stream. It does not infer a reason from a state name, and it does not turn a missing value into a claimed influence.

## Evidence and limitations

At commit `d98fe714` the targeted probe on the real 219/044/036/050/045 fixture measures an added p95 of `+0.0139 ms` per 10 Hz decision (p50 `+0.0120`), with an identical decision count and checksum `1958000` in both arms, so the collector provably did not perturb the decision chain. All 848 project tests pass (840 existing plus seven isolated 055 tests and one real 219-cadence explanation test). The 20-cycle memory arm shows the collector holding exactly one explanation per actor with `retainedHistory: 0` and `disposed: true`. See [the evidence](Evidence/055-decision-explanation/README.md).

Limitations: the explanation is only as honest as the reason codes and consumed values the owner passes to `capture`; the builder enforces the shape, the 045 binding, the last-reason binding and the registry gate, but it cannot know that an owner omitted a key it really used, so the owner wiring must list the keys per branch. `yield_time_gap` cannot be attributed until 092 marks it implemented. The explanations are per decision slice and are not retained historically, so a UI sees the current decision only. The probe is Node CPU-only on a laptop-type machine, without browser, GPU, FPS or integrated-game budgets; all calibration labels remain provisional.

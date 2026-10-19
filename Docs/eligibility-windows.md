# Eligible windows and external constraints — PBI 087

`createEligibilityWindows(options?)` is the single owner of the **label** attached to a 086
opportunity, the **exclusion** rules that keep a constrained situation out of the learning
denominator, and the **observability** rule that gates a reaction-time window. It lives in
`src/telemetry/eligibility-windows.ts` and is exported through `src/telemetry/index.ts`. It owns no
clock, physics world, renderer, DOM, scheduler or event bus, never publishes and never decides
compliance or compliance failure; the caller supplies already authoritative observations.

## Who owns what

| Component | Owns |
| --- | --- |
| 087 `createEligibilityWindows` | the closed label vocabulary attached to one 086 opportunity, the monotone classification, the learning-denominator exclusion and the reaction-time observability gate |
| 086 `createOpportunityRegistry` | the opportunity identity, lifecycle and certain/incomplete denominators; 087 consumes the record's `id`, `kind`, vehicle, incarnation and learning eligibility |
| 036/044 `createSignalController` / `createRoadContext` | the authoritative movement signal, the route and the nearest oriented-lane leader |
| 038 `createPriorityRules` | the priority/occupancy truth of a blocked exit (`PRIORITY_OCCUPANCY`) |
| 048 `evaluateFollowingTarget` / `FOLLOWING_LIMITS` | the leader/queue reason and the fixed `0.1 m/s` standstill threshold |
| 023/085 `vehicleClass` / `mechanicalCapabilities` | the class mechanical figures (acceleration, braking, grip×g) |
| 028/029/030 | the collision/damage/recovery truth that makes a window an impact |
| 069 segment lifecycle / 070 `createPauseFocusOwner` | the frozen `learningEligible`/`controlMode` and the single suspension decision |
| 017 `VehicleCameraPose` + the renderer occlusion truth | the stimulus visibility the caller passes as a structural camera pose and an occlusion flag |

## The closed label vocabulary

Every window carries exactly one label and exactly one class; the mapping below is total and is
enforced at runtime.

| Label | Class | Cause (`reason`) | Authoritative source |
| --- | --- | --- | --- |
| `FREE_TRAFFIC` | **ELIGIBLE** | `NO_CONSTRAINT` | — |
| `LEADER` | **EXTERNAL_CONSTRAINT** | `QUEUE_STANDSTILL` / `LEADER_HEADWAY` | 048 following, 044 leader |
| `BLOCKED_GREEN` | **EXTERNAL_CONSTRAINT** | `GREEN_EXIT_BLOCKED` | 044 leader + 036 GREEN, or 038 occupancy |
| `MECHANICAL_LIMIT` | **EXTERNAL_CONSTRAINT** | `CAPABILITY_EXCEEDED_ACCELERATION` / `_DECELERATION` / `_LATERAL` | 023 class via 085 `mechanicalCapabilities` |
| `IMPACT` | **EXTERNAL_CONSTRAINT** | `COLLISION_IN_WINDOW` / `DAMAGE_LIMITED` / `RECOVERY_IN_WINDOW` | 028 / 029 / 030 |
| `PAUSE` | **EXCLUDED** | `SUSPENSION_PAUSE` | 070 suspension decision |
| `FOCUS_LOST` | **EXCLUDED** | `SUSPENSION_FOCUS_LOST` | 070 suspension decision |
| `MANUAL_SEGMENT` | **EXCLUDED** | `NON_LEARNING_SEGMENT` | 069/085 frozen header |
| `AUTO_SEGMENT` | **EXCLUDED** | `NON_LEARNING_SEGMENT` | 069/085 frozen header |
| `NOT_OBSERVABLE` | **EXCLUDED** | `STIMULUS_NOT_OBSERVABLE` | 017 camera cone + occlusion truth |

`ELIGIBLE` is the **only** class a later estimator may treat as free driver behavior.
`EXTERNAL_CONSTRAINT` means the world bounded the driver, so the situation is not evidence of a
preference; `EXCLUDED` means the observation is invalid for another reason (suspension, non-learning
segment, hidden stimulus). Blocked green, mechanical limit and impact are therefore external
constraints and never personal preferences.

### Criterion 1 by construction

The window record is a discriminated union: an `ExternalConstraintWindowRecord` and an
`ExcludedWindowRecord` are different TypeScript types from `EligibleWindowRecord`, and
`emitPreferenceEvidence` accepts **only** `EligibleWindowRecord`. A compiler cannot pass a
constrained window. At runtime the same method additionally re-checks that the window is still owned
by the layer and still classified `ELIGIBLE`, so a forged or stale object is refused and counted in
`preferenceEvidenceRefused`. The learning denominator only ever counts the `ELIGIBLE` class:
`total = eligible + externalConstraint + excluded` holds at every moment and a constrained window is
never added to `eligible`.

### Classification precedence and monotonicity

The most restrictive cause wins and is **latched**: `FOCUS_LOST` > `PAUSE` > `MANUAL_SEGMENT` >
`AUTO_SEGMENT` > `IMPACT` > `NOT_OBSERVABLE` > `MECHANICAL_LIMIT` > `BLOCKED_GREEN` > `LEADER` >
`FREE_TRAFFIC`. Observability can only be lost, so once a window is not observable it stays
`NOT_OBSERVABLE`. A window that was ever constrained or excluded can never drift back into the
learning denominator, which is exactly the intent: a situation that was bounded for any part of its
duration is not free behavior. Re-observing the same 086 opportunity only updates the
cadence-visible `lastTick`/`observationCount` (never the identity) and, if the cause is more
restrictive, tightens the label (counted in `reclassifiedTotal`).

## Observability rule for reaction time

A reaction-time window is opened **only** when the stimulus is `OBSERVABLE` and the window is
`ELIGIBLE`:

- **OBSERVABLE** requires either an explicit controlled-fixture declaration
  (`{ source: 'CONTROLLED_FIXTURE', observable: true }`) or the real camera truth: the stimulus
  world position inside the 017 camera cone **and** the caller's occlusion flag false. The cone test
  uses the vertical half-angle of the pose's `fovRadians` and is deliberately conservative — a
  stimulus inside the cone is certainly inside the frustum, so a hidden stimulus is never promoted to
  observable. The occlusion flag is the result of the real renderer contract (Babylon raycast / 017
  sweep); the layer never fabricates it.
- A hidden or occluded stimulus produces an explicit `NOT_OBSERVABLE` window with no reaction-time
  contribution. `respond` on it is refused with reason `NOT_OBSERVABLE`, counted in
  `responsesRefused`, and `reactionSamples` stays 0.
- `respond` is accepted only for an open reaction window; it records
  `durationTicks = responseTick − openedTick` and `durationSeconds = ticks / 60`.
- **Nothing about a suspension looks like a reaction failure.** A `PAUSE`/`FOCUS_LOST` window (and a
  non-learning segment) has no reaction window; a response attempt is refused with
  `SEGMENT_EXCLUDED` and no reaction time, so a suspension can never be read as a slow reaction. The
  same refusal applies to a window that was tightened into an external constraint
  (`EXTERNAL_CONSTRAINT`).

## Bounds, ownership and counters

| Cap | Value |
| --- | --- |
| Retained windows (`maxWindows`) | 32…7168, default **4096** (`diagnosticSamples`) |
| Dense bytes per record | **128** (16 fixed slots × 8 B) |
| Identity code units per record | **1024** (enforced; a larger record is refused) |
| Derived record byte ceiling | **2176** |
| Derived ceiling at the default cap | 4096 × 2176 B ≈ **8.5 MiB** |
| Derived ceiling at the maximum cap | 7168 × 2176 B ≈ **14.9 MiB** (< `recorderRamBytes` 33,554,432 B) |

A window is final as soon as it is classified; the bounded store retires the oldest one
(`retiredTotal`) and the cumulative label counters survive retirement, exactly like the 086
denominators. `getStats()` reports `retained`, `eligibleRetained`, `identityCodeUnits`,
`estimatedBytes`, `estimatedBytesMaximum` and the cumulative counters; after `dispose()` the live
counters are zero while the cumulative denominator evidence survives and `observe` is refused.

`getDenominators()` returns `total`, `eligible`, `externalConstraint`, `excluded`, the per-label
breakdown, the `externalConstraints` subset, `notObservable`, `reactionWindowsOpened`,
`reactionSamples`, `responsesRefused`, `preferenceEvidenceEmitted` and `preferenceEvidenceRefused`.

## What this is NOT

- It is not 086's opportunity identity or denominator owner: it consumes a 086 record and never
  re-identifies, re-opens or re-counts an opportunity. Its `windowId` is derived from the
  opportunity id with `createStableId('eligibility-window', sessionId, [worldEpoch, opportunityId])`.
- It is not a compliance or driving policy: it never decides whether a driver stopped, yielded or
  released, and never commands a vehicle.
- It is not 069's segment lifecycle or 070's suspension arbiter: both facts are reported by their
  owners and only consumed here.
- It is not 085's tick recorder: it stores no per-tick frame, only one bounded label per opportunity.
- It is not 088's artefact filtering or 095's estimator: it produces the labels and denominators an
  estimator may read; it does not estimate a parameter, publish a profile or train anything.
- It does not measure or claim browser, renderer, GPU, FPS or real-time behaviour, and it does not
  compute the stimulus visibility from the rendered image; the occlusion flag is the caller's real
  renderer truth.
- It does not promote a MANUAL/AUTO opportunity into a demonstration: a non-learning segment is
  `EXCLUDED` by construction.

## Verification and evidence

`tests/telemetry/eligibility-windows.test.ts` (11 tests) covers the PBI verification line — an
eligible free-traffic context, a hidden/occluded stimulus with no reaction time, a leader/queue
standstill, a blocked green from the real 038/044 context, an impact, a mechanical limit, a
pause/suspension and MANUAL/AUTO segments — plus the reaction gate, the monotone tightening, the
closed vocabulary, the bounds/disposal and one integration chain that drives real 036/037/086
opportunities at the 219 cadence (10 Hz) with real 036/044/048 context. The native probe
`scripts/benchmark-eligibility-windows.mjs` reuses the 044/085/086 fixture and reports the added cost
of the eligibility layer on top of the 086 registry, the owned-memory counters and a 60 Hz vs 10 Hz
self-check. See [Evidence/087-eligibility-windows](Evidence/087-eligibility-windows/README.md).

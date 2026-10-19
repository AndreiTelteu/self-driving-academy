# Unique opportunities and denominators — PBI 086

`createOpportunityRegistry(options?)` is the single owner of opportunity **identity**, **lifecycle**
and **denominators** for the enumerated kinds `STOP`, `RED`, `GREEN`, `YIELD` and `LANE_CHANGE`. It
lives in `src/telemetry/opportunities.ts` and is exported through `src/telemetry/index.ts`. It owns no
clock, physics world, renderer, DOM, scheduler or event bus, never publishes and never decides
compliance; the caller supplies already authoritative observations.

## Who owns what

| Component | Owns |
| --- | --- |
| 086 `createOpportunityRegistry` | one deterministic identity per physical occurrence, the ENTERED→RESOLVED/TRUNCATED lifecycle with its closed reason vocabulary, the per-kind success/failure/incomplete denominators and a bounded record store |
| 036 `createSignalController` | the authoritative movement phase occurrence (`getMovementSignal`, `getSignal(...).phaseStartedTick`) |
| 037 `createStopRules` | the authoritative `STOP_APPROACH` / `FULL_STOP` / `STOP_LINE_CROSSED` observations and their producer occurrence ids |
| 038/052/053 | the yield/lane-change occurrence keys and the certain outcome of a decision |
| 069 | the segment lifecycle; a segment close ends the observation window |
| 070 | the single suspension decision; a suspension is reported, never inferred |
| 087/095 | whatever may be built **from** the denominators (label windows, estimates). 086 only counts |

## Opportunity kinds and the closed outcome vocabulary

| Kind | Certain success | Certain failure |
| --- | --- | --- |
| `STOP` | `STOPPED` | `CROSSED_WITHOUT_STOP` |
| `RED` | `HELD` | `CROSSED` |
| `GREEN` | `RELEASED` | `MISSED` |
| `YIELD` | `YIELDED` | `PROCEEDED` |
| `LANE_CHANGE` | `COMPLETED` | `ABORTED` |

`result` is `SUCCESS` or `FAILURE` for exactly the two halves of the table. **At most one outcome can
ever be attached to an opportunity**: a second, opposing conclusion is counted in
`contradictionTotal` and never overwrites the first. `YELLOW` is deliberately not a kind (it closes
the previous signal occurrence without opening one), and the registry never converts a
non-observation into an outcome.

## Identity

```text
createStableId('opportunity-<kind>', sessionId, [
  String(worldEpoch), vehicleId, incarnation,
  ...stimulusIdentity,            // STOP: stopLineId
                                  // RED/GREEN: signalId, intersectionId, movementId, phaseStartedTick
                                  // YIELD/LANE_CHANGE: relatedIds
  String(occurrence),             // per-registry monotonic ordinal, assigned once per occurrence
])
```

- The identity comes from the 006 `createStableId` contract; no wall clock and no `Math.random`
  participate. `sessionId` is the namespace and `worldEpoch` is a key, so another session or another
  world generation produces different ids.
- The *producer* occurrence key (037 `opportunityId`, 038 `priority-yield` id, 053 manoeuvre key) is
  used only to tell two distinct physical occurrences apart. It is **never embedded verbatim** in the
  identity, precisely so that a producer stamping its own observation tick cannot make the identity
  cadence-dependent.
- For `RED`/`GREEN` the occurrence is the authoritative `phaseStartedTick` from 036, so a phase that
  cycles back with the same `phaseId` is a *new* occurrence with a *new* id.
- A re-approach (the vehicle leaves and comes back, or the same lane is re-entered in a later
  manoeuvre) is a new occurrence key and therefore a **new** opportunity with a **new** id. An id is
  never reused, and `occurrence` is never reset within one registry instance.

### Framerate independence

`observe(...)` is a *consumer* call. The world always steps every fixed tick; the consumer may be
called every tick (60 Hz) or only at the 219 decision cadence (10 Hz) **as long as it drains the
producer streams instead of sampling them**:

- the 036/037/053 `events` array is the authoritative stream since the previous call (the registry
  opens/resolves from each event's own tick, not from the observation tick);
- `stimuli` and `conclusions` are producer-driven occurrences and must be delivered the same way;
- the 036 signal context is read from the authoritative phase occurrence, so the observed tick does
  not enter the identity at all.

Two fields do legitimately reflect the cadence and never participate in identity: `observationCount`
(how many calls touched the record) and `lastTick`. Everything else — id, kind, state, outcome,
result, truncation reason, opened/resolved ticks and the stimulus identity — is identical, and this is
asserted by both the unit suite and the native probe self-check on the real 036/037 chain.

## Lifecycle

The canonical states are the ones Docs/09 already declares; a second state machine is not introduced.

| State | Meaning | Next |
| --- | --- | --- |
| `ENTERED` | the occurrence was observed and is still open; `observationCount`/`lastTick` distinguish a freshly opened occurrence from a repeatedly observed one | `RESOLVED` or `TRUNCATED` |
| `RESOLVED` | cut short by exactly one certain outcome; `outcome` and `result` are set | terminal |
| `TRUNCATED` | the observation window ended before a certain outcome; `truncationReason` is set and `outcome`/`result` stay `null` | terminal |

Transitions are explicit and terminal states are final: resolving a `TRUNCATED` opportunity (or
truncating a `RESOLVED` one) is a no-op, and an opposing conclusion is counted as a contradiction.
`TRUNCATED` is what "incomplete" and "superseded" mean in this module:

| `truncationReason` | Cause |
| --- | --- |
| `SUPERSEDED` | a new occurrence of the same stimulus started while this one was open — the 036 phase changed mid-approach, or a re-approach began |
| `SEGMENT_CLOSED` | the 069 segment that observed it closed before a certain outcome |
| `OBSERVATION_LOST` | the caller reported a discontinuity |
| `SUSPENDED` | a 070 suspension was reported |
| `DISPOSED` | the registry was disposed while the opportunity was open |

### Documented signal rule

A signal change during an approach **opens a new opportunity** and supersedes the previous one. The
old record becomes `TRUNCATED`/`SUPERSEDED` with no outcome at all, so it can never be counted as a
certain success *and* a certain failure; the new occurrence opens as `RED` or `GREEN` (or closes
without opening anything, for `YELLOW`). If the deciding policy concluded the release before the phase
changed, the record is already `RESOLVED` and stays `RESOLVED`; the new occurrence is a separate
record. Both cases are asserted.

## Denominators

```ts
getDenominators(): {
  total, certain, success, failure, incomplete, entered,
  learningEligibleCertain, byKind[…], truncatedByReason[…]
}
```

- `total = certain + incomplete + entered` and `certain = success + failure` hold at every moment.
- `certain` is the **only** subset a later estimator may treat as a certain success or failure;
  `incomplete` can never be silently promoted, because it has no outcome at all.
- The counters are **cumulative aggregates**, not a scan of the retained store, so retiring or
  disposing records does not change the evidence (Docs/09: retention does not remove aggregated
  evidence).
- `learningEligibleCertain` counts certain outcomes whose owning segment was learning-eligible. The
  eligibility is frozen from the opening segment, exactly like the 085 frozen header, so `MANUAL` and
  `AUTO` opportunities stay out of the learning denominator **by construction**. Turning these numbers
  into labels or estimates belongs to 087/095; 086 provides counts only.

## Bounds and ownership

| Cap | Value |
| --- | --- |
| Retained records (`maxOpportunities`) | 32…7168, default **4096** (`diagnosticSamples`) |
| Dense bytes per record | **192** (24 fixed slots × 8 B) |
| Identity code units per record | **2048** (enforced; a larger prospective record is refused) |
| Derived record byte ceiling | **4288** |
| Derived ceiling at the default cap | 4096 × 4288 B ≈ **16.75 MiB** |
| Derived ceiling at the maximum cap | 7168 × 4288 B ≈ **29.3 MiB** (< `recorderRamBytes` 33,554,432 B) |
| Segments recorded per opportunity | **8**; a rollover continues the same opportunity and is counted in `segmentOverflow` beyond the cap |
| Related ids per YIELD/LANE_CHANGE stimulus | 4 |

Admission is explicit: while every retained record is still `ENTERED`, a new occurrence is refused
(`rejectedTotal`) instead of growing the store or silently dropping evidence. Once a record is
terminal it may be retired oldest-first (`retiredTotal`); live records are never evicted.
`getStats()` reports `retained`, `entered`, `resolved`, `truncated`, `identityCodeUnits`,
`estimatedBytes` and `estimatedBytesMaximum`; after `dispose()` the live counters are zero while the
cumulative denominator evidence survives.

## What this is NOT

- It is not a compliance policy: it does not decide whether a driver stopped, yielded or released. It
  consumes the certain outcome that 050/051/052/053 already decided.
- It is not 085's tick recorder and does not store per-tick frames; it stores one bounded record per
  physical occurrence and keeps the 085 recorder as the only per-tick capture.
- It is not 037's or 036's producer: both keep producing their own events and their own internal ids,
  and the registry deliberately does not reuse those ids as its own identity.
- It is not 087's label windows or 095's estimator, not 069's segment lifecycle and not 070's
  suspension arbiter. It does not infer a suspension, an observation loss or a segment close: those
  are reported by their owners.
- It does not measure or claim browser, renderer, GPU, FPS or real-time behaviour, and it does not
  promote MANUAL/AUTO opportunities into demonstrations.

## Verification and evidence

`tests/telemetry/opportunity-ids.test.ts` (11 tests) covers the PBI verification line — repeated
approaches, an early-closed segment and a changed signal — plus framerate independence on a real
036/037 chain, the suspension rule, determinism, bounds/disposal and the malformed-input contract.
The native probe `scripts/benchmark-opportunity-ids.mjs` reuses the 044/085 fixture and reports the
added cost, the JSON region, the owned-memory counters and a 60 Hz vs 10 Hz self-check. See
[Evidence/086-opportunity-ids](Evidence/086-opportunity-ids/README.md).

# Telemetry artefact filter and partial segments — PBI 088

`createArtifactFilter(options?)` is the single owner of the **artefact** attached to a 069/085
telemetry window, of the **split** that keeps the samples before a discontinuity usable, and of the
explicit **completeness degree** of a recovered, truncated or lost segment. It lives in
`src/telemetry/artifact-filter.ts` and is exported through `src/telemetry/index.ts`. It owns no
clock, physics world, renderer, DOM, scheduler, event bus or storage, never publishes and never
decides compliance; the caller supplies already authoritative facts.

## Who owns what

| Component | Owns |
| --- | --- |
| 088 `createArtifactFilter` | the closed artefact vocabulary, the pre-impact split with its own prefix denominator, the `COMPLETE`/`PARTIAL`/`TRUNCATED` degree with its reason, and the bounded store of filtered windows |
| 028 `createCollisionEpisodes` | the collision incident (`incidentId`, `tick`, `impulseNs`, `otherEntityId`); 088 consumes it as the `COLLISION` artefact |
| 030 `createVehicleRecovery` / `createRecoveryLedger` | the recovery placement (`kind: 'TELEPORT'`, `status`, `pointId`, `mapId`, `laneId`, `mode`, `validatedTick`); 088 preserves the whole cause and proof |
| 070 `createPauseFocusOwner` / 012 `createApplicationLifecycle` | the single suspension decision and its cause (`focus` > `menu` > `panel`, plus the loop host causes); 088 only labels it |
| 069 segment lifecycle / 085 `createTickSampleRecorder` | the `completeness` (`OPEN`/`CLOSED`/`INCOMPLETE`), the `segmentCloseReasons` value and the `tickGaps`; 088 refuses a segment that contradicts itself |
| 222 durable-checkpoint owner | the last checkpoint; until 222 lands the caller (composition root) reports the lost checkpoint tick and 088 never invents it |
| 086 `createOpportunityRegistry` / 087 `createEligibilityWindows` | the opportunity identity and the label/class per opportunity; 088 never re-identifies or re-labels one and never duplicates their denominators |

## The closed artefact vocabulary

Every discontinuity is exactly one kind, reached by exactly one cause from a fixed table, and the
cause is proven by exactly one authoritative owner. The mapping is total and is asserted at runtime.

| Kind | Cause | Authoritative source |
| --- | --- | --- |
| `COLLISION` | `COLLISION_IMPULSE` | 028 collision incident |
| `TELEPORT` | `RECOVERY_TELEPORT` / `RECOVERY_DENIED` / `RECOVERY_PARTIAL` | 030 recovery record (`kind: 'TELEPORT'`, mapped from its `status`) |
| `PAUSE` | `SUSPENSION_PAUSE` | 070 suspension decision (`menu`/`panel`), or the 012 loop host cause (`manual`/`background`/`overload`, source `LOOP_012`) |
| `PAUSE` | `SUSPENSION_FOCUS_LOST` | 070 focus loss (source `SUSPENSION_070`) |
| `INCOMPLETE_SAMPLE` | `SEGMENT_INCOMPLETE` / `CLOSE_REASON_DATA_LOSS` | 069/085 segment lifecycle and close reason (source `SEGMENT_069`) |
| `INCOMPLETE_SAMPLE` | `OBSERVATION_GAP` | 085 `tickGaps` (source `TICK_SAMPLES_085`) |
| `INCOMPLETE_SAMPLE` | `CHECKPOINT_LOST` | the lost durable checkpoint reported by the caller (source `CHECKPOINT_222`) |

A `PAUSE` is never an incomplete sample and never a slow reaction: it has its own kind, its own
cause and its own source, and the completeness reason it produces is `TRUNCATED_BY_ARTIFACT`, not
`OBSERVATION_GAP`. The 030 placement is never learning-eligible (the input is refused otherwise),
exactly as 030 declares it.

## The split rule (criterion 1 by construction)

The export `splitWindowAtArtifacts` is the documented rule and is used by the layer itself:

1. `boundaryTick` is the **minimum** `boundaryTick` over the window's artefacts; with no artefact the
   whole window `[startTick, endTick]` is usable.
2. If `boundaryTick > startTick`, the **prefix** `[startTick, boundaryTick − 1]` is the usable part
   and carries its own `ticks` denominator; the **suppressed** part is `[boundaryTick, endTick]`.
3. If `boundaryTick ≤ startTick`, no tick is usable and the window is `FULLY_SUPPRESSED`.

The record is a discriminated union. A `FullySuppressedWindowRecord` is a **different TypeScript
type** from a `PrefixEligibleWindowRecord`, and `emitPreImpactEvidence` accepts **only** the latter.
At runtime the method additionally re-checks that the window is still owned by the layer and still
has a non-empty prefix, so a forged or stale object is refused and counted in
`preferenceEvidenceRefused`. The impact impulse itself (its own boundary tick) is therefore never
evidence, while the data that preceded it stays usable. The learning denominator identity
`total = prefixEligible + fullySuppressed` and `total = complete + partial + truncated` holds at every
moment.

## Completeness degree (criterion 2 by construction)

Every window exposes `completeness ∈ {COMPLETE, PARTIAL, TRUNCATED}` together with a closed
`completenessReason`; a later estimator reads this instead of assuming a segment is complete. The
most restrictive state wins and is latched, so a window can only ever tighten.

| Degree | Reason | When |
| --- | --- | --- |
| `TRUNCATED` | `CHECKPOINT_LOST` | the caller reported a lost durable checkpoint |
| `TRUNCATED` | `DATA_LOSS` | the 069/085 close reason is `DATA_LOSS` |
| `TRUNCATED` | `SEGMENT_INCOMPLETE` | the 069/085 segment completeness is `INCOMPLETE` |
| `PARTIAL` | `OBSERVATION_GAP` | a 085 `tickGaps` window was lost |
| `PARTIAL` | `RECOVERY` | a 030 placement cut the window |
| `PARTIAL` | `TRUNCATED_BY_ARTIFACT` | a collision or a pause cut the window |
| `PARTIAL` | `OPEN_SEGMENT` | the segment is still open |
| `PARTIAL` | `SHUTDOWN` | the segment closed with `SHUTDOWN` (`Docs/25`: no guaranteed final flush) |
| `COMPLETE` | `SEGMENT_CLOSED` | closed normally, no artefact and no gap |

A recovered segment keeps the 030 cause and proof per artefact — `operationId`, `pointId`, `mapId`,
`laneId`, `mode` and `validatedTick` — alongside the `PARTIAL`/`RECOVERY` degree, so the placement can
be attributed without re-reading the ledger.

### Reset and crash semantics, and the reload contract

When a process or session loses its last durable checkpoint the caller reports
`lostCheckpointTick`; the layer emits a `CHECKPOINT_LOST` artefact whose boundary is exactly that
tick, marks the window `TRUNCATED`, and keeps the prefix before the loss usable. On reload the caller
re-feeds the **persisted** segment facts (identity, `startTick`/`endTick`, `completeness`,
`closeReason` and the last durable tick) into a fresh filter; the layer then produces the same
`TRUNCATED` record rather than a silently missing or falsely complete one. It never invents the
missing observations. The caller's responsibility is to persist at least the segment header and the
last durable tick before the crash; the layer's responsibility is to make the loss explicit and
detectable.

## Interaction with 085/086/087 and the bounded store

088 does not duplicate the state of its dependencies. It consumes the 085 frozen segment header
(`completeness`, `closeReason`) as input, consumes the 086/087 window only in the caller's hands
(`emitPreImpactEvidence` returns a tick span the caller intersects with the 086/087 windows), and
never re-identifies an opportunity or re-labels an eligible window.

| Cap | Value |
| --- | --- |
| Retained windows (`maxWindows`) | 32…7168, default **4096** (`diagnosticSamples`) |
| Dense bytes per record | **192** (24 fixed slots × 8 B) |
| Identity code units per record | **2048** (enforced; a larger window is refused) |
| Derived record byte ceiling | **4288** |
| Artefacts per window | **64** (enforced; beyond it the input is refused) |
| Derived ceiling at the default cap | 4096 × 4288 B ≈ **16.75 MiB** |
| Derived ceiling at the maximum cap | 7168 × 4288 B ≈ **29.3 MiB** (< `recorderRamBytes` 33,554,432 B) |

A closed window is final; the bounded store retires the oldest one (`retiredTotal`) and the
cumulative denominators survive retirement, exactly like the 086/087 stores. A later evaluation of
the same segment only **adds** artefacts or **worsens** the completeness: a segment that was once
partially suppressed can never drift back into a complete, fully usable observation, and a closed
segment cannot silently reopen. `getStats()` reports `retained`, `prefixEligibleRetained`,
`identityCodeUnits`, `estimatedBytes`, `estimatedBytesMaximum` and the cumulative counters (including
`checkpointLosses`); after `dispose()` the live counters are zero while the cumulative evidence
survives and `evaluate` is refused.

## What this is NOT

- It is not 085's recorder and stores no per-tick frame: it keeps one bounded record per segment
  window with its artefacts and its usability span.
- It is not 086's opportunity identity or 087's label windows: it never re-identifies, re-opens,
  re-counts or re-labels an opportunity, and it adds no label to the 087 closed vocabulary.
- It is not 030's recovery and does not re-implement, retry or place anything: it consumes the real
  recovery record and preserves its cause.
- It is not 028's collision detection or 070's suspension arbiter: both facts are reported by their
  owners.
- It is not a compliance, driving or learning policy: it never estimates a parameter, publishes a
  profile or trains anything, and it never promotes MANUAL/AUTO or a recovered segment into a
  demonstration.
- It does not measure or claim browser, renderer, GPU, FPS or real-time behaviour.
- It is not 222's checkpoint owner or 090's storage: it makes the loss explicit and leaves
  persistence to the caller.

## Verification and evidence

`tests/telemetry/artifact-filter.test.ts` (8 tests) covers the PBI verification line — the impact
split with an exact boundary and the refused post-impact evidence, the 030 recovery cause and proof,
the crash with the last checkpoint (`TRUNCATED`/`CHECKPOINT_LOST`, never `COMPLETE`), the pause/focus
exclusion that is never an incomplete sample, a clean segment that stays `COMPLETE` (no false
positives), the closed vocabulary and determinism, the bounds/disposal/malformed-input contract, and
one integration chain that drives the real 028 collision chain, the real 030 recovery ledger, the real
086 registry and the real 087 labels at the 219 decision cadence (10 Hz). The native probe
`scripts/benchmark-telemetry-artifacts.mjs` reuses the 044/085 fixture and reports the added cost of
the artefact filter on top of the 086/087 chain, the owned-memory counters and a 60 Hz vs 10 Hz
self-check. See [Evidence/088-telemetry-filters](Evidence/088-telemetry-filters/README.md).

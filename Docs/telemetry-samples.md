# Tick samples and segment contexts — PBI 085

`createTickSampleRecorder(options?)` records the authoritative per-tick observation of one vehicle
into bounded columnar typed arrays. It lives in `src/telemetry/tick-samples.ts` and is exported
through `src/telemetry/index.ts`. It owns no clock, physics world, renderer, DOM or worker and never
reads render state; the caller supplies one fixed-tick observation and the recorder stores its SI
projection.

## Public API

| Symbol | Meaning |
| --- | --- |
| `createTickSampleRecorder(options?)` | Creates the recorder. `capacity`, `overflowPolicy`, `identitiesPerSegment`, `retainedSegments`, `retainedBytes`. |
| `openSegment(input, closeReason?)` | Opens a segment and freezes its header. Closes the previous open segment with `closeReason` (default `MODE_CHANGE`). |
| `record(frame)` | Stores one tick. Returns the retained logical row index, or `-1` when the overflow policy rejected it. |
| `closeSegment(reason)` | Closes the open segment with an explicit `segmentCloseReasons` value. |
| `getSegments()` / `getSegment(id)` | Read-only summaries of the open and retained segments. |
| `readSample(id, index)` | Materializes one observation plus the segment metadata frozen at open. |
| `releaseSegment(id)` | Drops one retained segment buffer. |
| `getStats()` | Cumulative and live counters, including owned bytes. |
| `dispose()` | Releases every buffer; live counters return to zero. |
| `deriveTickSamplePhysics(previous, current, dtSeconds)` | Signed SI rates between two consecutive authoritative states. |
| `mechanicalCapabilities(classId)` | Class-derived admission figures (see below). |
| `TICK_SAMPLE_CAPACITY`, `TICK_SAMPLE_BYTES_PER_SAMPLE`, `TICK_SAMPLE_VERSION` | Declared caps and layout version. |

## Authoritative input contract

`record(frame)` accepts exactly `tick`, `state`, `raw`, `command`, `physics`, `lane`, `signal`:

- `state` is the authoritative `VehicleState` of that tick (position, quaternion, velocity, laneId,
  controlMode, appliedProfileVersion, maneuverState). It is the source of identity and SI pose.
- `raw` is the unfiltered input at that tick (`throttle`/`brake` in `[0,1]`, `steering` in `[-1,1]`,
  `handbrake`), for example `KeyboardInputFrame.raw` from 025.
- `command` is the filtered `VehicleCommand` of the same tick and vehicle, for example
  `KeyboardInputFrame.command` or the controller output.
- `physics` carries `longitudinalAccelerationMps2`/`lateralAccelerationMps2`;
  `deriveTickSamplePhysics` computes them from two consecutive authoritative states.
- `lane` is the authoritative lane and its advisory `speedLimitMps`, or `null` when the vehicle is
  off the lane graph. It must agree with `state.laneId`, otherwise the sample is refused.
- `signal` is the applicable `MovementSignal` (`signalId` + `RED`/`YELLOW`/`GREEN`), or `null`.

The recorder refuses a sample instead of guessing: a foreign `vehicleId`/`classId`, a different
`controlMode`, a different `appliedProfileVersion`, a different `worldEpoch`, a non-monotonic tick, a
non-finite SI value, an out-of-range input or a lane that contradicts the authoritative state are all
contract violations. `capabilities` are derived from the immutable class definition as mechanical
admission figures — `engineForceN / massKg`, `brakeAcceleration`, and `grip × 9.81` — not measured
tyre forces. `grip` is a class parameter, not a calibrated friction coefficient.

## Frozen segment header

A segment header — `segmentId`, session/world, `vehicleId`, `classId` and class version,
`controlMode`, `profileId`, `baseVersionId`, `learningEpoch`, `learningEligible`, `inputType`,
`startTick`, capabilities — is validated once and frozen at open. Nothing in it can change
mid-segment:

- a mode toggle, profile change, vehicle switch, ride end, recovery, reset or shutdown is a **new**
  segment, opened by the caller with an explicit `segmentCloseReasons` value;
- every stored sample is bound to its own segment, so `profileId`, `learningEpoch`, `controlMode` and
  `learningEligible` are read back from the header and cannot drift;
- `learningEligible` is accepted only for a caller-declared `LEARNING` segment. `MANUAL` and `AUTO`
  are therefore never learning evidence **by construction**, while their samples stay recorded and
  readable for metrics and history (`retainedForMetrics: true`).
- A mode switch only closes the current segment; it never reclassifies samples that were already
  stored. A toggle or a vehicle switch is a separate segment with its own header.

Pauses are handled by the caller: while the fixed-tick loop is suspended the recorder is simply not
called, and it never synthesizes a tick. Ticks must strictly increase inside a segment; regressions
are refused and gaps are counted in `getStats().tickGaps`.

## Capacities, overflow and hot-path cost

Every capacity is finite and explicit; nothing grows with the segment length:

| Cap | Value |
| --- | --- |
| Samples per segment (`capacity`) | 64…65536, default **4096** |
| Bytes per sample (typed arrays only) | **114** |
| Identities interned per segment | 4096 |
| Retained closed segments | 8 |
| Retained bytes | 8 MiB |

`4096 × 114 B = 466,944 B` per segment buffer, so the default retention ceiling is
`8 × 466,944 B ≈ 3.56 MiB`, well inside the manifest's `recorderRamBytes` 33,554,432 B. The 203
manifest proposes `diagnosticSamples: 4096`; 085 fixes it as a measured having capacity and keeps the
`PROVISIONAL_UNCALIBRATED` label. Overflow is explicit: the default `DROP_OLDEST` ring policy
overwrites the oldest row and counts `samplesOverwritten`; `DROP_NEWEST` refuses the sample, returns
`-1` and counts `samplesRejected`. Interning overflow is counted in `identityOverflow` instead of
growing the table.

The hot path is a fixed set of array stores. It performs **no JSON serialization per tick**, no
allocation per tick and no rendering work; the measured added cost on the 044 fixture is
**4.0–8.0 µs p95 per tick** (5 paired repetitions), about 0.15% of the 5.5 ms provisional full-tick
p95 ceiling. The separate JSON region measures `JSON.stringify(frame)` at 6.3 µs p95 versus 2.6 µs p95
for the buffer write, and that serialization is not part of the hot-path delta.

## Ownership and disposal

Each segment owns one set of typed arrays; a closed segment keeps its buffer until the recorder
evicts it (count or byte cap, oldest first, counted in `segmentsRetired`) or `releaseSegment` /
`dispose` drops it. `getStats()` reports exact owned `bufferBytes`, `identityCodeUnits`,
`samplesRetained` and the cumulative counters; after `dispose()` the live counters are zero and
`readSample`/`openSegment` are refused. Materialized `TelemetrySample`-like observations are owned
copies produced only on read, never retained by the recorder.

## What this is NOT

It is not the 069 segment *lifecycle* (the recorder exposes open/close and mirrors its frozen-header
rules, but the app-level mode/vehicle/ride close reasons stay with the caller). It is not 087's
eligible-window labelling and external constraints, not 088's artefact filtering, not 086's unique
opportunity IDs, and not 090/222's chunking, transfer or persistence. It does not measure or claim
browser, renderer, GPU or FPS behaviour, and it does not promote MANUAL/AUTO samples into
demonstrations. Capacities remain provisional until the owning hardware gates.

## Evidence

[Docs/Evidence/085-telemetry-samples](Evidence/085-telemetry-samples/README.md) keeps the BEFORE and
AFTER native reports, the JSON-serialization region, the exact owned-memory region, the unit tests
and the verbatim static checks.

# Evidence 089 — vehicle-class normalization

Targeted validation (`targeted-validation-v1`) for PBI 089. `performance_checks: ["simulation",
"memory"]` as the orchestrator declared before implementation. No `frame` check and no browser,
renderer, GPU or FPS probe is included (the 052 record documents an unresolved WebGPU presentation
stall on this laptop, so no such claim is made); the normalizer is a native CPU/owned-memory feature.

## What was measured

| Item | Value |
| --- | --- |
| Runtime | Node **v24.21.0** (via `volta run --node 24.21.0 --npm 11.19.0`), npm 11.19.0 |
| Hardware | AMD Ryzen 7 7735U with Radeon Graphics, 16 logical CPUs, 14,702,026,752 B RAM, win32 10.0.26300, power scheme High performance |
| Measured source commit | `986cbe172121f3c6e00fd2cf851bf721b8780722` |
| Fixture | `089-vehicle-normalization-native-v1`, map `044-context-cross-v1`, reused from 044/085/086/087/088 (`tests/autonomy/road-context-reference.ts` → `roadContextFixture(false)`): real lane graph, real 036 signal controller, real 044 road context, real 045/046 target producer, real 047 longitudinal controller and a real 049 lateral projection, 64 authoritative vehicles |
| Harness | one new probe `scripts/benchmark-telemetry-normalization.mjs`; no second harness forked |
| Protocol | 5 repetitions, paired arms `chain` / `normalize` sequential in one process, 120 warmup + 360 measured ticks, 60 measured 219-decisions per arm, ride of 480 ticks |
| Budget version | `203-initial-1`, `PROVISIONAL_UNCALIBRATED` |

BEFORE (`--baseline`) is the same fixture with the **089 normalizer disabled**, not a historical
commit: 089 is purely additive. The chain arm performs identical world/context work, the real 086
registry, the real 087 eligibility layer and the real 088 artefact filter; the AFTER `normalize` arm
adds one `normalizer.observe(...)` at each 219 decision. The 089 added cost is the measured
`observe(...)` duration, plus the `normalize − chain` delta of the whole decision.

**Injected because the fixture does not carry it (labelled, not hidden):** the 044 fixture carries no
traffic opportunity, so the real 038 priority-yield identity is injected through the 086 registry
stimulus port at one decision. The ride carries no collision, recovery or suspension, so the 088
window is `COMPLETE`; the refused cases are covered by the unit suite and by the probe self-check.

## Results — added cost

`normalizer.observe(...)`, p50/p95/p99 in **µs**, one call per 219 decision (every 6 ticks) on a
growing window of up to 480 usable samples:

| Repetition | observe p50 | observe p95 | observe p99 | Amortized per-tick p95 (÷6) |
| --- | --- | --- | --- | --- |
| 1 | 100.8 | 150.4 | 440.9 | 25.1 |
| 2 | 71.5 | 198.2 | 254.6 | 33.0 |
| 3 | 74.2 | 144.8 | 205.4 | 24.1 |
| 4 | 69.0 | 115.0 | 156.7 | 19.2 |
| 5 | 62.7 | 109.7 | 128.4 | 18.3 |

- The 089 added cost is **≈198.2 µs p95 worst case per decision**, about **3.60%** of the 5.5 ms
  provisional full-tick p95 ceiling; amortized over the 60 Hz ticks of one decision it is
  **18.3–33.0 µs p95**, about **0.60%** of the 5.5 ms ceiling worst case and 0.41% of the 8 ms laptop
  ceiling. No isolated tick budget is claimed.
- The `p99` of 440.9 µs in repetition 1 is a single first-touch/GC sample of the very first measured
  decision of the arm; repetitions 2–5 stay at 128.4–254.6 µs.

| Repetition | `normalize − chain` p50 | p95 | p99 | `chain` p95 (decision) |
| --- | --- | --- | --- | --- |
| 1 | 2.90 | 6.90 | −0.40 | 18.7 |
| 2 | 3.00 | −7.40 | −44.2 | 48.9 |
| 3 | 2.10 | −1.40 | 6.60 | 26.2 |
| 4 | 1.40 | −0.40 | 8.20 | 29.1 |
| 5 | 2.20 | 10.50 | 9.80 | 13.8 |

All figures in µs. The `chain` p95 (086+087+088 together, on a clean window) is 13.8–48.9 µs. The
`normalize − chain` delta of the whole decision is dominated by timer noise because the isolated
`observe` timing is a sub-window of it; the isolated figure above is the authoritative added cost.

### One `observe` per **closed** window

The incremental per-decision cadence recomputes the whole growing window every decision. The natural
cadence observes each closed window once; the probe measures it separately on a full 480-sample
window, 120 iterations (µs):

| Metric | p50 | p95 | p99 | min | max | mean |
| --- | --- | --- | --- | --- | --- | --- |
| `observe` on a closed 480-sample window | 105.0 | 137.4 | 172.1 | 101.3 | 865.1 | 115.8 |

A closed 8-second (480-tick) window therefore costs ≈137 µs p95 (≈2.5% of the 5.5 ms ceiling),
≈0.29 µs amortized per recorded tick (0.005%). The cost is linear in the usable samples; the dominant term is
the project's strict per-sample boundary validation, which is why the layer reads samples with the
documented 085 hot-path reader (plain prototype, exactly the declared fields, every value in range)
instead of copying a descriptor map per sample.

## Results — bounded ownership

| Item | Value |
| --- | --- |
| Dense bytes per record | 256 (32 slots × 8 B) |
| Identity code units per record (ceiling) | 1024 |
| Derived record byte ceiling | 2304 |
| Default `maxWindows` | 4096 |
| Derived ceiling at the default cap | 9,437,184 B ≈ **9.0 MiB** |
| Manifest `recorderRamBytes` | 33,554,432 B — **not exceeded**; the maximum configurable cap (7168, ≈15.75 MiB) fits too |
| Memory region: iterations / retained / retired | 5120 / **4096 (= cap)** / 1024 |
| Memory region: windows evaluated | 5120 |
| Measured `estimatedBytes` | 2,359,296 B ≈ **2.25 MiB** |
| Measured `identityCodeUnits` | 655,360 |
| `withinCeiling` | `true` |
| Capability-limited windows retained | 683 |
| Memory region labels | `LONGITUDINAL_ACCELERATION` 854 / `LONGITUDINAL_DECELERATION` 0 / `LATERAL` 0 |
| After `dispose()` | `retained = identityCodeUnits = estimatedBytes = 0`, `disposedCountersZero = true` |

`process.memoryUsage().arrayBuffers` moved from 482,633 B to 209,151 B and `heapUsed` from 18.6 MB to
25.4 MB of unrelated JIT/GC state, so the exact ownership figure is taken from the layer counters, as
the performance contract permits ("exact unavailable memory APIs may remain null with ownership
counters"). Forced GC is deliberately not used inside the timed region.

## Native self-check (real chain)

`selfCheck.passed = true`:

- the real 047 ride, replayed verbatim in the compact, produced a `NORMALIZED`/`INTENTIONAL` window
  in both classes; the normalized longitudinal demand agrees within
  `NORMALIZATION_EQUALITY_TOLERANCE` (0.05) while the raw values keep the 023 ratio (within 0.02);
- a synthetic command at the compact ceiling produced `CAPABILITY_LIMITED` with
  `limitingChannel = LONGITUDINAL_ACCELERATION` and `aggressivenessIsLowerBound = true`, and
  `emitIntentFeature` refused it;
- a `FULLY_SUPPRESSED` 088 window was refused with `features: null`, never normalized as if complete.

## Checks and tests

- Static checks: `checks.txt` — `typecheck`, `lint`, `format:check`, `check:architecture` (159
  TypeScript files, 6 + 4 + 3 negative probes PASS), `check:parameter-catalog`; **all exit=0**.
- Tests: `tests.txt` — `tests/telemetry/vehicle-normalization.test.ts` **8/8 PASS**; full `npm test`
  **1008/1008 PASS** (1000 pre-existing + 8 new), `exit=0`. The known unrelated
  `tests/workers/protocol.test.ts` cancellation-latency flake did **not** appear in this run.
- Probe arms: `native-before-01.{json,txt}` (exit=0) and `native-after-01.{json,txt}` (exit=0), run
  sequentially and alone.

## Limitations

1. Native CPU/owned-memory only. No browser, renderer, GPU, FPS, input-latency or real-time
   throughput claim; `frame` is not declared and the integrated gameplay gate stays `NOT_VALIDATED`.
2. The realized demand in the probe is the executed command through the real 023 drivetrain plus the
   real 049 projected curvature; it is a documented realization of the real 047/049 commands, not a
   Rapier measurement. The measured check of the same claim on real Rapier physics lives in the unit
   suite (`089 measured in Rapier`), on a straight acceleration run.
3. The compact arm replays the sedan's command sequence verbatim, because the 047 controller is
   itself class-aware and a class-aware command would not be "the same command" the PBI verification
   line asks for. The lateral channel is reported but not asserted equal across classes, because the
   two classes traverse the ride at different speeds.
4. The 044 fixture carries no traffic opportunity, so the real 038 priority-yield identity is
   injected through the 086 registry stimulus port at one decision; the ride carries no collision,
   recovery or suspension, so the 088 window is `COMPLETE`.
5. The normalizer is not wired into the live fixed-tick loop in this PBI: the probe calls it at the
   same 219 cadence the loop uses (every 6 ticks). The end-to-end wiring stays with the estimator
   owner (095) and the composition root.
6. `estimatedBytes` is a derived counter (dense slots plus identity code units), not exact heap or
   total RAM.
7. `openedTick`, `lastTick` and `observationCount` are cadence-visible by design, exactly like the
   087/088 windows; every other field is identical across cadences.
8. `sampleCoverage` is a ratio of the 087/088 tick span, so it is a coverage indicator, not a
   statistical confidence.
9. 089's `CAPABILITY_LIMITED` mark is not 087's `MECHANICAL_LIMIT` label: 087 classifies a declared
   demand that exceeds the ceiling as an external constraint, while 089 observes a saturated
   realization inside an already-eligible window and reports it as a lower bound.

## Files

- `native-before-01.json` / `native-before-01.txt` — BEFORE arm (086/087/088 chain, 089 disabled).
- `native-after-01.json` / `native-after-01.txt` — AFTER arm (chain + 089, memory region, per-window
  cost, self-check).
- `checks.txt`, `tests.txt` — verbatim command output.

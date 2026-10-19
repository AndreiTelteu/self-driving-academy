# Evidence 085 — telemetry tick samples

Targeted validation (`targeted-validation-v1`) for PBI 085. `performance_checks: simulation, memory`
as declared by the plan before implementation. No browser, renderer, GPU or FPS probe is included
(the 052 record documents an unresolved WebGPU presentation stall on this laptop, so no such claim is
made); the recorder is a native CPU/owned-memory feature.

## What was measured

| Item | Value |
| --- | --- |
| Runtime | Node **v24.21.0** (via `volta run --node 24.21.0 --npm 11.19.0`), npm 11.19.0 |
| Hardware | AMD Ryzen 7 7735U with Radeon Graphics, 16 logical CPUs, win32 10.0.26300 |
| Measured source commit | `53330edfc9f54c5cd1bb6cbf7fb710ff53b952ab` |
| Fixture | `085-tick-samples-native-v1`, reused from 044 (`tests/autonomy/road-context-reference.ts` → `roadContextFixture(false)`): real lane graph, real 036 signal controller, real 025 keyboard filter, real 023 vehicle class |
| Harness | one new probe `scripts/benchmark-telemetry-tick-samples.mjs`; no second harness forked |
| Protocol | 5 repetitions, paired OFF/ON sequential in one process, 200 warmup + 600 measured ticks per arm, 1 subject recorded, 64 authoritative vehicles in the frame |
| Budget version | `203-initial-1`, `PROVISIONAL_UNCALIBRATED` |

BEFORE (`--baseline`) is the same fixture with telemetry disabled, not a historical commit: 085 is
purely additive. The authoritative added-cost figure is the paired OFF/ON delta inside the AFTER run,
where both arms perform identical world/input/state work and only `recorder.record(frame)` differs.

## Results — added cost per tick

| Repetition | record() Δ p50 | record() Δ p95 | record() Δ p99 | frame-build p95 (both arms) |
| --- | --- | --- | --- | --- |
| 1 | 4.0 µs | 8.0 µs | 19.2 µs | 1.374 ms |
| 2 | 1.8 µs | 5.7 µs | 10.2 µs | 1.700 ms |
| 3 | 1.7 µs | 4.5 µs | 9.3 µs | 1.840 ms |
| 4 | 1.5 µs | 4.0 µs | 7.8 µs | 1.697 ms |
| 5 | 1.7 µs | 4.9 µs | 8.9 µs | 1.938 ms |

- OFF timed region is 0.2–0.3 µs p95 (timer overhead only), so the delta is the recorder's cost.
- Added cost is **≈ 8 µs p95 worst case**, about **0.15%** of the 5.5 ms provisional full-tick p95
  ceiling and 0.10% of the 8 ms laptop ceiling. No isolated tick budget is claimed by this probe.
- The 1.3–1.9 ms frame-build p95 is the 044 road-context/filter work present identically in both
  arms; it is **not** attributable to the recorder and is reported only for transparency.
- `wallDeltaMs` between arms is ±150 ms noise in a ~0.9 s wall and is not a metric.

## Results — JSON region (separate, not in the hot-path delta)

`JSON.stringify(frame)` p95 **6.3 µs** versus the recorder buffer write p95 **2.6 µs**
(ratio ≈ 2.4×, 500 iterations each, `label: JSON_REGION_NOT_PART_OF_HOT_PATH_DELTA`). The recorder's
hot path never serializes; the unit suite additionally asserts `JSON.stringify` is called **0** times
during 200 recorded ticks.

## Results — exact owned memory

| Item | Value |
| --- | --- |
| Bytes per sample (typed arrays) | 114 |
| Capacity | 4096 |
| Reported owned `bufferBytes` | 466,944 B |
| Expected `capacity × bytesPerSample` | 466,944 B (**match**) |
| Identity storage | interned strings, 4 code units for the fixture |
| Default retention ceiling | 8 segments × 466,944 B ≈ **3.56 MiB** |
| Manifest `recorderRamBytes` | 33,554,432 B — not exceeded |
| After `dispose()` | `samplesRetained = 0`, `bufferBytes = 0`, `retainedBytes = 0`, `segmentsRetained = 0` |

`process.memoryUsage().arrayBuffers` and `heapUsed` are **not comparable** across JIT/GC state here
(they moved by ±50 MB between samples), so the exact ownership figure is taken from the recorder's
typed-array counters, as the performance contract permits ("exact unavailable memory APIs may remain
null with ownership counters"). Forced GC is deliberately **not** used inside the timed region,
following the 069 lesson that it perturbs the measured window.

## Capacity choice

The 203 manifest proposes `diagnosticSamples: 4096` and its null-capacity policy requires the owning
PBI to establish a finite admission cap and measure it. 085 fixes exactly the proposal:
`TICK_SAMPLE_CAPACITY.default = 4096` with an explicit 64…65536 range, `identitiesPerSegment = 4096`,
`retainedSegments = 8`, `retainedBytes = 8 MiB`, and explicit `DROP_OLDEST` / `DROP_NEWEST` overflow
policies with counters. `TICK_SAMPLE_BYTES_PER_SAMPLE = 114` is asserted against the reported
`bufferBytes` in the memory region and in the unit suite. Labels stay `PROVISIONAL_UNCALIBRATED`.

## Checks and tests

- Static checks: `checks.txt` — typecheck, lint, format:check, check:architecture (143 files, all
  negative probes PASS), check:parameter-catalog, all `exit=0`.
- Tests: `tests.txt` — `tests/telemetry/tick-samples.test.ts` **11/11 PASS**; full `npm test`
  **859/859 PASS** (848 pre-existing + 11 new), `exit=0`.
- Probe self-check: `selfCheck.passed = true` (segment metadata frozen, MANUAL not learning-eligible,
  readouts re-parse through `parseVehicleState`/`parseVehicleCommand`, disposal zeroes counters).

## Limitations

1. Native CPU/owned-memory only. No browser, renderer, GPU, FPS, input-latency or real-time
   throughput claim; the integrated gameplay gate stays `NOT_VALIDATED`.
2. `arrayBuffers`/`heapUsed` are diagnostic and noisy; only typed-array ownership is exact.
3. The recorder does not integrate into the live fixed-tick loop in this PBI: the probe calls
   `record()` at the same tick boundary the loop uses, but the end-to-end wiring stays with the
   recorder/checkpoint owner (090/222) and the 069 app bridge.
4. `capabilities` are class-derived admission figures (`engineForceN/massKg`, `brakeAcceleration`,
   `grip × 9.81`), not measured tyre forces.
5. The lane context is the authoritative lane and its advisory speed limit; road type, curvature,
   leader, stop line, conflicts and rideId belong to 087 and are not recorded here.
6. The 069 segment lifecycle code is not merged in this checkout, so the recorder owns its own
   segment open/close contract rather than consuming 069's bridge; the frozen-header rules are
   mirrored locally.

## Files

- `native-before-01.json` / `native-before-01.txt` — BEFORE arm (telemetry disabled), raw output.
- `native-after-01.json` / `native-after-01.txt` — AFTER arm (paired OFF/ON, JSON region, memory
  region, self-check), raw output.
- `checks.txt`, `tests.txt` — verbatim command output.

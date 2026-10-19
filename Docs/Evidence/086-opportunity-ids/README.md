# Evidence 086 — unique opportunities and denominators

Targeted validation (`targeted-validation-v1`) for PBI 086. `performance_checks: simulation, memory`
as the orchestrator declared before implementation. No browser, renderer, GPU or FPS probe is included
(the 052 record documents an unresolved WebGPU presentation stall on this laptop, so no such claim is
made); the registry is a native CPU/owned-memory feature.

## What was measured

| Item | Value |
| --- | --- |
| Runtime | Node **v24.21.0** (via `volta run --node 24.21.0 --npm 11.19.0`), npm 11.19.0 |
| Hardware | AMD Ryzen 7 7735U with Radeon Graphics, 16 logical CPUs, win32 10.0.26300 |
| Measured source commit | `03c8eb7bc04c32ae0a9732b61571ea836954e8ad` |
| Fixture | `086-opportunity-ids-native-v1`, reused from 044/085 (`tests/autonomy/road-context-reference.ts` → `roadContextFixture(false)`): real lane graph, real 036 signal controller, real 044 road context, real 025 keyboard filter, 64 authoritative vehicles |
| Harness | one new probe `scripts/benchmark-opportunity-ids.mjs`; no second harness forked |
| Protocol | 5 repetitions, paired OFF/ON sequential in one process, 200 warmup + 600 measured ticks per arm |
| Budget version | `203-initial-1`, `PROVISIONAL_UNCALIBRATED` |

BEFORE (`--baseline`) is the same fixture with the registry disabled, not a historical commit: 086 is
purely additive. The authoritative added-cost figure is the paired OFF/ON delta inside the AFTER run,
where both arms perform identical world/context/input/observation work and only the registry calls
(`observe`, `findEntered`, `conclude`) differ.

**Injected because the fixture does not carry them (labelled, not hidden):** the 044 fixture declares
no STOP stop line, so the real 037 event contract and 037's own `createStableId('stop-opportunity')`
identity are injected with `parseSimulationEvent` (one approach every 180 ticks); the real 038
`priority-yield` identity is injected through the stimulus port. Both are real contract values, but no
037/038 producer runs on this fixture.

## Results — added cost per tick

| Repetition | Δ p50 | Δ p95 | Δ p99 | world/context p95 (both arms) |
| --- | --- | --- | --- | --- |
| 1 | 8.1 µs | 14.7 µs | 62.1 µs | 1.294 ms |
| 2 | 7.6 µs | 15.6 µs | 48.6 µs | 1.311 ms |
| 3 | 6.1 µs | 12.5 µs | 34.9 µs | 1.124 ms |
| 4 | 6.0 µs | 11.5 µs | 36.6 µs | 1.199 ms |
| 5 | 6.5 µs | 12.9 µs | 39.4 µs | 1.246 ms |

- The OFF timed region is 0.1–0.2 µs p95 (timer overhead only), so the delta is the registry's cost.
- Added cost is **≈15.6 µs p95 worst case**, about **0.28%** of the 5.5 ms provisional full-tick p95
  ceiling and 0.20% of the 8 ms laptop ceiling. No isolated tick budget is claimed by this probe.
- The registry is roughly twice the 085 recorder's per-tick cost (≈8 µs p95): it builds the stable id
  and materializes one frozen snapshot per touched record per call. Both are far below the ceiling.
- The 1.1–1.3 ms world/context p95 is the 044 road-context and filter work present identically in
  both arms; it is **not** attributable to the registry and is reported only for transparency.
- `wallDeltaMs` between arms is tens of ms of noise in a ~1 s wall and is not a metric.

## Results — JSON region (separate, not in the hot-path delta)

`JSON.stringify(observation)` p95 **1.4 µs** versus the registry `observe` p95 **5.6 µs**
(ratio ≈ 0.25, 500 iterations each, `label: JSON_REGION_NOT_PART_OF_HOT_PATH_DELTA`). The registry's
hot path never serializes; the unit suite does not need to assert this because the registry is a
contract-validating consumer, not a per-tick store.

## Results — bounded ownership

| Item | Value |
| --- | --- |
| Dense bytes per record | 192 (24 slots × 8 B) |
| Identity code units per record (enforced) | 2048 |
| Derived record byte ceiling | 4288 |
| Default `maxOpportunities` | 4096 |
| Derived ceiling at the default cap | 17,563,648 B ≈ **16.75 MiB** |
| Manifest `recorderRamBytes` | 33,554,432 B — **not exceeded**, and the maximum configurable cap (7168) fits too |
| Memory region: iterations / retained / retired | 5120 / **4096 (= cap)** / 1024 |
| Measured `estimatedBytes` | 1,769,472 B ≈ **1.69 MiB** |
| Measured `identityCodeUnits` | 491,520 |
| `withinCeiling` | `true` |
| After `dispose()` | `retained = entered = identityCodeUnits = estimatedBytes = 0`, `disposedCountersZero = true` |

`process.memoryUsage().arrayBuffers` moved by **0 B** across the region (V8 does not expose the
allocated strings as backing buffers) and `heapUsed` moved by ±50 MB of unrelated JIT/GC state, so the
exact ownership figure is taken from the registry counters, as the performance contract permits
("exact unavailable memory APIs may remain null with ownership counters"). Forced GC is deliberately
not used inside the timed region, following the 069/085 lesson.

The identity ceiling is **enforced**, not merely estimated: a prospective record above 2048 code units
is refused (`rejectedTotal`) instead of being retained, which is what makes `estimatedBytesMaximum` a
real bound. A segment rollover appends at most 8 segment ids and counts `segmentOverflow` beyond that.

## Capacity choice

`4096` is the 203 manifest's `diagnosticSamples` figure, and 086 fixes it as the default with an
explicit 32…7168 range. 086 additionally derives the byte ceiling from the enforced identity ceiling
and refuses any configuration that cannot fit `recorderRamBytes`, so the null-capacity policy has a
measured, finite answer instead of an estimate. Labels stay `PROVISIONAL_UNCALIBRATED`.

## Native self-check (60 Hz vs 10 Hz on the real chain)

`selfCheck.passed = true`:

- the every-tick consumer and the 10 Hz decision-cadence consumer (draining the real 036/037 event
  stream and the stimulus port, never sampling them) produced **18 = 18** opportunities with the
  **same ids, states, outcomes, truncation reasons and authoritative open/resolve ticks**;
- no id was produced twice;
- `total = certain + incomplete + entered` (18 = 6 + 10 + 2) and `certain = success + failure`
  (6 = 6 + 0);
- no opportunity is both certain and incomplete;
- a real 037 STOP approach resolved and a real 038 yield occurrence resolved;
- the 10 Hz consumer observed strictly fewer times than the 60 Hz consumer.

## Checks and tests

- Static checks: `checks.txt` — `typecheck`, `lint`, `format:check`, `check:architecture` (156
  TypeScript files, 13 negative probes PASS), `check:parameter-catalog`; **all exit=0**.
- Tests: `tests.txt` — `tests/telemetry/opportunity-ids.test.ts` **11/11 PASS**; full `npm test`
  **981/981 PASS** (970 pre-existing + 11 new), `exit=0`.
- Probe arms: `native-before-01.{json,txt}` (exit=0) and `native-after-01.{json,txt}` (exit=0),
  run sequentially and alone.

## Limitations

1. Native CPU/owned-memory only. No browser, renderer, GPU, FPS, input-latency or real-time
   throughput claim; the integrated gameplay gate stays `NOT_VALIDATED`.
2. The 044 fixture has no STOP stop line and no 038/053 producer, so the STOP and YIELD occurrences
   are injected with the real producer contract and identity; the unit suite drives the *real* 037 and
   the *real* 036 controller instead.
3. The registry is not wired into the live fixed-tick loop in this PBI: the probe calls it at the same
   tick boundary the loop uses, but the end-to-end wiring stays with the recorder/checkpoint owner
   (090/222) and the 069 app bridge.
4. `lastTick` and `observationCount` are cadence-visible by design; the deep-equality guarantee
   covers every other record field. A caller that samples instead of draining the producer streams
   degrades to sampling semantics, and that is documented rather than hidden.
5. The 10 Hz arm drains the producer streams; a phase occurrence shorter than the consumer period
   would still be missed if the caller did not deliver it. 086 documents the drain requirement and
   asserts it on a real chain with 1 s phases.
6. `estimatedBytes` is a derived counter (dense slots plus identity code units), not exact heap or
   total RAM.
7. The `LANE_CHANGE` kind is covered by the unit suite (real `LANE_CHANGE_STARTED`/`_COMPLETED`
   contract) but has no producer on this fixture and therefore no rows in the probe denominators.
8. One full `npm run check` invocation failed a **pre-existing, unrelated** wall-clock test —
   `tests/workers/protocol.test.ts:167` "real worker yields to cancellation…" asserted
   `cancel 115.2 ms` against the documented 100 ms cancellation target. That file is untouched by 086,
   086 adds no worker, timer or background work, and five other full-suite runs and three isolated runs
   of that file were green (`981/981`, `exit=0`). It is recorded here as an observed flake, not
   attributed to 086 and not hidden.

## Files

- `native-before-01.json` / `native-before-01.txt` — BEFORE arm (registry disabled), raw output.
- `native-after-01.json` / `native-after-01.txt` — AFTER arm (paired OFF/ON, JSON region, memory
  region, 60 Hz vs 10 Hz self-check), raw output.
- `checks.txt`, `tests.txt` — verbatim command output.

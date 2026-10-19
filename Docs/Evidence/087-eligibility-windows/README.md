# Evidence 087 — eligible windows and external constraints

Targeted validation (`targeted-validation-v1`) for PBI 087. `performance_checks: ["simulation",
"memory"]` as the orchestrator declared before implementation. No `frame` check and no browser,
renderer, GPU or FPS probe is included (the 052 record documents an unresolved WebGPU presentation
stall on this laptop, so no such claim is made); the eligibility layer is a native CPU/owned-memory
feature.

## What was measured

| Item | Value |
| --- | --- |
| Runtime | Node **v24.21.0** (via `volta run --node 24.21.0 --npm 11.19.0`), npm 11.19.0 |
| Hardware | AMD Ryzen 7 7735U with Radeon Graphics, 16 logical CPUs, win32 10.0.26300, power scheme High performance |
| Measured source commit | `b6b38aa22727668826fe28145c819aef66431649` |
| Fixture | `087-eligibility-windows-native-v1`, reused from 044/085/086 (`tests/autonomy/road-context-reference.ts` → `roadContextFixture(false)`): real lane graph, real 036 signal controller, real 044 road context/leader, real 025 keyboard filter, 64 authoritative vehicles |
| Harness | one new probe `scripts/benchmark-eligibility-windows.mjs`; no second harness forked |
| Protocol | 5 repetitions, three paired arms `world` / `registry` / `eligibility` sequential in one process, 200 warmup + 600 measured ticks per arm |
| Budget version | `203-initial-1`, `PROVISIONAL_UNCALIBRATED` |

BEFORE (`--baseline`) is the same fixture with the 086 registry and the 087 layer disabled, not a
historical commit: 087 is purely additive. The authoritative **added cost of 087** is the
`eligibility − registry` paired delta inside the AFTER run, where both arms perform identical
world/context/input/observation work and only the eligibility calls differ.

**Injected because the fixture does not carry them (labelled, not hidden):** the 044 fixture declares
no STOP stop line, so the real 037 event contract and 037 `createStableId('stop-opportunity')`
identity are injected with `parseSimulationEvent` (one approach every 180 ticks); the real 038
`priority-yield` identity is injected through the stimulus port; the stimulus observability is
declared by a controlled fixture. The blocked-green derivation uses the 048 proposed
`queue_standstill_gap` default of 2 m; the real compiled profile value and the real
`evaluateFollowingTarget`/`FOLLOWING_LIMITS` chain are exercised by the unit suite.

## Results — added cost per tick

`eligibility − registry`, p50/p95/p99 in **µs**:

| Repetition | Δ p50 | Δ p95 | Δ p99 |
| --- | --- | --- | --- |
| 1 | 9.6 | 19.5 | 28.0 |
| 2 | 7.0 | 17.6 | 23.3 |
| 3 | 8.6 | 20.1 | 23.9 |
| 4 | 7.9 | 14.5 | 15.7 |
| 5 | 7.7 | 13.1 | 24.1 |

- The 087 added cost is **≈20.1 µs p95 worst case**, about **0.37%** of the 5.5 ms provisional
  full-tick p95 ceiling and 0.25% of the 8 ms laptop ceiling. No isolated tick budget is claimed.
- For context, `registry − world` p95 is 12.2–18.6 µs, consistent with the 086 record (~15.6 µs p95);
  `eligibility − world` p95 (both layers together) is 25.3–38.1 µs, 0.69% of the ceiling worst case.
- The 1.06–1.41 ms world/context p95 is the 044 road-context and filter work present identically in
  every arm; it is **not** attributable to the layer and is reported only for transparency.
- `eligibility − registry` p99 reaches 28.0 µs in repetition 1; `wallDeltaMs` between arms is tens of
  ms of noise in a ~1 s wall and is not a metric.

## Results — bounded ownership

| Item | Value |
| --- | --- |
| Dense bytes per record | 128 (16 slots × 8 B) |
| Identity code units per record (enforced) | 1024 |
| Derived record byte ceiling | 2176 |
| Default `maxWindows` | 4096 |
| Derived ceiling at the default cap | 8,912,896 B ≈ **8.5 MiB** |
| Manifest `recorderRamBytes` | 33,554,432 B — **not exceeded**; the maximum configurable cap (7168, ≈14.9 MiB) fits too |
| Memory region: iterations / retained / retired | 5120 / **4096 (= cap)** / 1024 |
| Measured `estimatedBytes` | 1,359,872 B ≈ **1.30 MiB** |
| Measured `identityCodeUnits` | 417,792 |
| `withinCeiling` | `true` |
| Memory region labels | eligible 3413 / externalConstraint 1707 |
| After `dispose()` | `retained = identityCodeUnits = estimatedBytes = 0`, `disposedCountersZero = true` |

`process.memoryUsage().arrayBuffers` moved by −178,828 B across the region (allocator noise; V8 does
not expose the retained strings as backing buffers) and `heapUsed` moved by ±11 MB of unrelated
JIT/GC state, so the exact ownership figure is taken from the layer counters, as the performance
contract permits ("exact unavailable memory APIs may remain null with ownership counters"). Forced GC
is deliberately not used inside the timed region, following the 069/085 lesson. The identity ceiling
is **enforced**: a prospective record above 1024 code units is refused (`rejectedTotal`) instead of
being retained, which is what makes `estimatedBytesMaximum` a real bound.

## Native self-check (60 Hz vs 10 Hz on the real chain)

`selfCheck.passed = true`:

- the every-tick consumer and the 10 Hz decision-cadence consumer (draining the real 036/037 event
  stream and the stimulus port, never sampling them) produced **18 = 18** windows with the **same**
  opportunity ids, classes, labels, reasons, sources and observability;
- `total = eligible + externalConstraint + excluded` holds (18 = 0 + 18 + 0);
- the 044 fixture's subject always has a same-lane leader, so **every** real-chain window is correctly
  `EXTERNAL_CONSTRAINT`/`LEADER` — a queued fixture is not free traffic;
- the runtime gate refuses `emitPreferenceEvidence` for the external-constraint window (a
  constrained window cannot become preference evidence);
- a hidden controlled-fixture stimulus is `NOT_OBSERVABLE` and its response is refused with no
  reaction sample (`reactionSamples = 0`);
- an otherwise identical free-traffic window is `ELIGIBLE` and records a 30-tick / 0.5 s reaction.

## Checks and tests

- Static checks: `checks.txt` — `typecheck`, `lint`, `format:check`, `check:architecture` (157
  TypeScript files, 6 negative probes PASS), `check:parameter-catalog`; **all exit=0**.
- Tests: `tests.txt` — `tests/telemetry/eligibility-windows.test.ts` **11/11 PASS**; full `npm test`
  **992/992 PASS** (981 pre-existing + 11 new), `exit=0`. The known unrelated
  `tests/workers/protocol.test.ts` cancellation-latency flake did **not** appear in this run.
- Probe arms: `native-before-01.{json,txt}` (exit=0) and `native-after-01.{json,txt}` (exit=0), run
  sequentially and alone.

## Limitations

1. Native CPU/owned-memory only. No browser, renderer, GPU, FPS, input-latency or real-time
   throughput claim; `frame` is not declared and the integrated gameplay gate stays `NOT_VALIDATED`.
2. The 044 fixture has no STOP stop line and no 038/053 producer, so the STOP and YIELD occurrences
   are injected with the real producer contract and identity; the unit suite drives the **real** 037
   and the **real** 036 controller.
3. Observability in the probe uses a controlled fixture. The real 017 camera cone/occlusion path is
   covered by the unit suite; the cone is the conservative vertical half-angle, so the horizontal
   aspect extent is the caller's renderer truth and is not certified here.
4. The blocked-green derivation in the probe uses the 048 proposed `queue_standstill_gap` default of
   2 m; the unit suite uses the real compiled 048 profile value and a real `evaluateFollowingTarget`
   result.
5. Because the fixture's subject always has a leader, the real-chain windows are all LEADER; the
   eligible free-traffic path is asserted by the unit suite and by the probe's synthetic free window,
   not by the queued fixture.
6. `estimatedBytes` is a derived counter (dense slots plus identity code units), not exact heap or
   total RAM.
7. The layer is not wired into the live fixed-tick loop in this PBI: the probe calls it at the same
   tick boundary the loop uses, but the end-to-end wiring stays with the recorder/checkpoint owner
   (090/222) and the 069 app bridge.
8. `lastTick` and `observationCount` are cadence-visible by design; the deep-equality guarantee covers
   every other window field.
9. The layer consumes a 086 opportunity id; a caller that does not feed it the 086 records gets no
   windows, which is documented rather than hidden.

## Files

- `native-before-01.json` / `native-before-01.txt` — BEFORE arm (registry and eligibility disabled).
- `native-after-01.json` / `native-after-01.txt` — AFTER arm (world / registry / eligibility,
  memory region, 60 Hz vs 10 Hz self-check).
- `checks.txt`, `tests.txt` — verbatim command output.

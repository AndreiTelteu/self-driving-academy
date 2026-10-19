# Evidence 088 — telemetry artefact filter and partial segments

Targeted validation (`targeted-validation-v1`) for PBI 088. `performance_checks: ["simulation",
"memory"]` as the orchestrator declared before implementation. No `frame` check and no browser,
renderer, GPU or FPS probe is included (the 052 record documents an unresolved WebGPU presentation
stall on this laptop, so no such claim is made); the artefact filter is a native CPU/owned-memory
feature.

## What was measured

| Item | Value |
| --- | --- |
| Runtime | Node **v24.21.0** (via `volta run --node 24.21.0 --npm 11.19.0`), npm 11.19.0 |
| Hardware | AMD Ryzen 7 7735U with Radeon Graphics, 16 logical CPUs, 14,702,026,752 B RAM, win32 10.0.26300, power scheme High performance |
| Measured source commit | `e3df66065a0615d64b3e45b1d31efda0df978056` |
| Fixture | `088-telemetry-artifacts-native-v1`, reused from 044/085/086/087 (`tests/autonomy/road-context-reference.ts` → `roadContextFixture(false)`): real lane graph, real 036 signal controller, real 044 road context/leader, real 025 keyboard filter, 64 authoritative vehicles |
| Harness | one new probe `scripts/benchmark-telemetry-artifacts.mjs`; no second harness forked |
| Protocol | 5 repetitions, three paired arms `world` / `chain` / `filter` sequential in one process, 200 warmup + 600 measured ticks per arm, 133 filter evaluations per measured window |
| Budget version | `203-initial-1`, `PROVISIONAL_UNCALIBRATED` |

BEFORE (`--baseline`) is the same fixture with the 086/087 chain and the 088 filter disabled, not a
historical commit: 088 is purely additive. The authoritative **added cost of 088** is the measured
`artifacts.evaluate(...)` call inside the AFTER `filter` arm where the `chain` arm performs identical
world/context/input/observation work, the real 086 registry and the real 087 eligibility layer.

**Injected because the fixture does not carry them (labelled, not hidden):** the 044 fixture carries
no collision and no recovery, so the real 028 incident contract and `createStableId('collision', ...)`
identity are injected at one tick, and a real 030 `RecoveryRecord`-shaped fact is injected at one
tick. The 037 STOP approach and the 038 `priority-yield` stimulus are injected exactly as in 087; the
stimulus observability is declared by a controlled fixture; the blocked-green derivation uses the 048
proposed `queue_standstill_gap` default of 2 m. No suspension is injected in the timed ride; the pause
arm is covered by the unit suite and by the probe self-check.

## Results — added cost

`artifacts.evaluate(...)`, p50/p95/p99 in **µs**, one call per 219 decision (every 6 ticks):

| Repetition | p50 | p95 | p99 | Amortized per-tick p95 (÷6) |
| --- | --- | --- | --- | --- |
| 1 | 61.0 | 93.3 | 324.1 | 15.5 |
| 2 | 39.1 | 60.0 | 93.6 | 10.0 |
| 3 | 39.1 | 73.9 | 112.6 | 12.3 |
| 4 | 42.1 | 82.3 | 109.7 | 13.7 |
| 5 | 35.2 | 68.5 | 82.2 | 11.4 |

- The 088 added cost is **≈93.3 µs p95 worst case per decision**, about **1.70%** of the 5.5 ms
  provisional full-tick p95 ceiling; amortized over the 60 Hz ticks of one decision it is
  **10.0–15.5 µs p95**, about **0.28%** of the ceiling worst case and 0.19% of the 8 ms laptop
  ceiling. No isolated tick budget is claimed.
- The `p99` of 324.1 µs in repetition 1 is a single first-touch/GC sample of the artifact-sorting path
  in the very first measured decision of the arm; repetitions 2–5 stay at 82.2–112.6 µs.
- For context, `chain − world` p95 is 23.3–44.4 µs, consistent with the 086 (~16 µs) plus 087
  (~20 µs) records; `filter − world` p95 (all layers together) is 63.3–96.8 µs.
- The 1.09–1.58 ms world/context p95 is the 044 road-context and filter work present identically in
  every arm; it is **not** attributable to the layer and is reported only for transparency.
- `wallDeltaMs` between arms is tens of ms of noise in a ~1 s wall and is not a metric.

## Results — bounded ownership

| Item | Value |
| --- | --- |
| Dense bytes per record | 192 (24 slots × 8 B) |
| Identity code units per record (enforced) | 2048 |
| Derived record byte ceiling | 4288 |
| Default `maxWindows` | 4096 |
| Derived ceiling at the default cap | 17,563,648 B ≈ **16.75 MiB** |
| Manifest `recorderRamBytes` | 33,554,432 B — **not exceeded**; the maximum configurable cap (7168, ≈29.3 MiB) fits too |
| Memory region: iterations / retained / retired | 5120 / **4096 (= cap)** / 1024 |
| Memory region: windows evaluated / checkpoint losses | 5120 / 1024 |
| Measured `estimatedBytes` | 2,351,520 B ≈ **2.24 MiB** |
| Measured `identityCodeUnits` | 782,544 |
| `withinCeiling` | `true` |
| Memory region labels | prefixEligible 5120 / fullySuppressed 0 / truncated 1024 |
| After `dispose()` | `retained = identityCodeUnits = estimatedBytes = 0`, `disposedCountersZero = true` |

`process.memoryUsage().arrayBuffers` moved from 434,743 B to 209,151 B and `heapUsed` from 60.6 MB to
74.1 MB of unrelated JIT/GC state, so the exact ownership figure is taken from the layer counters, as
the performance contract permits ("exact unavailable memory APIs may remain null with ownership
counters"). Forced GC is deliberately not used inside the timed region. The identity ceiling is
**enforced**: a prospective window above 2048 code units (or with more than 64 artefacts) is refused
(`rejectedTotal`) instead of being retained, which is what makes `estimatedBytesMaximum` a real bound.

## Native self-check (60 Hz vs 10 Hz on the real chain)

`selfCheck.passed = true`:

- the every-tick consumer and the 10 Hz decision-cadence consumer (draining the real 036/037 event
  stream and the stimulus port, never sampling them) produced identical 087 labels **and** an
  identical 088 window apart from the deliberately cadence-visible `observationCount`/`lastTick`/
  `openedTick`;
- the real chain's ride window is `PREFIX_ELIGIBLE` with `boundaryTick = 300` — exactly the injected
  collision tick — a prefix ending at tick 299, `PARTIAL`/`RECOVERY`, and artefacts
  `COLLISION`/`COLLISION_IMPULSE` then `TELEPORT`/`RECOVERY_TELEPORT` (usableTicks 299,
  suppressedTicks 501, artifactsTotal 2);
- the 030 recovery proof is preserved on the artefact (`operationId = probe-recovery-op-1`, point,
  map, lane, mode and validated tick);
- a lost checkpoint is an explicit `TRUNCATED`/`CHECKPOINT_LOST` window whose artefact source is
  `CHECKPOINT_222` — never `COMPLETE`;
- a clean segment is `COMPLETE`/`SEGMENT_CLOSED` and fully usable, and `emitPreImpactEvidence`
  succeeds on it;
- a collision at the first tick is `FULLY_SUPPRESSED` and `emitPreImpactEvidence` refuses it (the
  post-impact segment cannot become preference evidence).

## Checks and tests

- Static checks: `checks.txt` — `typecheck`, `lint`, `format:check`, `check:architecture` (158
  TypeScript files, 6 + 4 + 3 negative probes PASS), `check:parameter-catalog`; **all exit=0**.
- Tests: `tests.txt` — `tests/telemetry/artifact-filter.test.ts` **8/8 PASS**; full `npm test`
  **1000/1000 PASS** (992 pre-existing + 8 new), `exit=0`. The known unrelated
  `tests/workers/protocol.test.ts` cancellation-latency flake did **not** appear in this run.
- Probe arms: `native-before-01.{json,txt}` (exit=0) and `native-after-01.{json,txt}` (exit=0), run
  sequentially and alone.

## Limitations

1. Native CPU/owned-memory only. No browser, renderer, GPU, FPS, input-latency or real-time
   throughput claim; `frame` is not declared and the integrated gameplay gate stays `NOT_VALIDATED`.
2. The 044 fixture carries no collision and no recovery, so the real 028 incident identity and the
   real 030 `RecoveryRecord` shape are injected at one tick each. The unit suite exercises the real
   030 `createRecoveryLedger` (`admit` → `update` → `finish` → `readHistory`) end to end.
3. No Rapier world is stepped in the probe: the native placement path of 030 stays with the 030 suite;
   088 consumes the recovery record it produces.
4. The 222 durable-checkpoint owner does not exist yet. The lost-checkpoint fact is reported by the
   caller (composition root) and 088 never invents it; the reload contract is documented in the module
   doc but is not yet wired into a live reload path.
5. The filter is not wired into the live fixed-tick loop in this PBI: the probe evaluates it at the
   same 219 cadence the loop uses (every 6 ticks), but the end-to-end wiring stays with the
   recorder/checkpoint owner (090/222) and the 069 app bridge.
6. `estimatedBytes` is a derived counter (dense slots plus identity code units), not exact heap or
   total RAM.
7. `observationCount`, `lastTick` and `openedTick` are cadence-visible by design; the deep-equality
   guarantee covers every other window field.
8. The 088 filter consumes the 085 segment facts and the 028/030/070 facts; a caller that feeds it
   none of them gets a `COMPLETE` empty window, which is documented rather than hidden.

## Files

- `native-before-01.json` / `native-before-01.txt` — BEFORE arm (chain and filter disabled).
- `native-after-01.json` / `native-after-01.txt` — AFTER arm (world / chain / filter, memory region,
  60 Hz vs 10 Hz self-check).
- `checks.txt`, `tests.txt` — verbatim command output.

# PBI 204 performance probe record

Status: PARTIAL; no integrated 3 taxi + 2 civilian 204 fixture was measured. All reported commands below ran only the existing 218/221 synthetic probes. They are not 204 fixture results and do not validate gameplay budgets. Browser/GPU measurement was not run; 218 reports GPU unavailable (`No renderer/API`) and hardware frame cadence unavailable (`Synthetic clock is not hardware cadence`).

## 218

Executed:

```text
volta run --node 24.21.0 --npm 11.19.0 -- node --import ./scripts/register-typescript.mjs scripts/benchmark-performance-harness.mjs
```

Result: 5 paired repetitions, existing `218-fixed-counter-v1/20000-frames` fixture; 20,000 fixed ticks, synthetic 60 Hz clock, no physics or renderer. In the first observed enabled arm, main-thread p95 was 0.0029 ms, p99 0.0046 ms, maximum 1.9261 ms; synthetic debt p95 was 3.88e-11 ms, 0 overloads, simulated/admitted time ratio approximately 1.0. These are portable CPU counter-probe numbers, not 204/frame measurements. The script reported `Evidence/218/portable-cpu.json`; that pre-existing artifact was restored after capture and is not part of this change.

## 219

Attempted:

```text
volta run --node 24.21.0 --npm 11.19.0 -- node --import ./scripts/register-typescript.mjs scripts/benchmark-simulation-scheduling.mjs
```

Not run: the script stopped before measurement because `Docs/Evidence/219-simulation-scheduling/after.json` already exists (`Evidence exists; preserve original before/after explicitly before another capture`). Existing 219 reports are not substituted for this task's fixture measurement.

## 221

Executed:

```text
volta run --node 24.21.0 --npm 11.19.0 -- node --import ./scripts/register-typescript.mjs scripts/benchmark-worker-governor.mjs Evidence/221/204-probe.json
```

Result: 5 repeats, zero probe failures; the existing `221-synthetic-cpu-v1` worker-thread fixture ran its protocol slices, preemption, cancellation, restart, and protected persistence checks. Across its recorded learning samples, queue p95 was 4.7844 ms, service p95 0.3833 ms, and end-to-end p95 5.1677 ms. This is synthetic worker protocol timing, not early-loop learning service time or a 204 fixture measurement. `gameplayGate` remains `NOT_VALIDATED`; no browser/FPS/GPU claims.

## Scope decision

The 218 and 221 harnesses do not accept the 044 small map or the 204 controller fixture, and 219's output path is occupied by preserved evidence. No new timing harness or replacement baseline was fabricated. The requested integrated 218/219/221 first-loop measurement therefore remains incomplete and must be rerun with a fixture-specific instrumentation adapter.

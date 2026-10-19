# PBI 204 performance probe record

Status: PARTIAL. The native 204 fixture is now measured with the 218/219/221 APIs directly (stage 3 below). The measurement is `PROVISIONAL_UNCALIBRATED`, Node CPU only, and does not validate browser, GPU, laptop, gameplay or release budgets. The five-participant playtest remains missing.

## Historical stage-2 attempt (generic probes only)

This section is kept because it records a real failed approach, not as 204 evidence.

- 218: `node --import ./scripts/register-typescript.mjs scripts/benchmark-performance-harness.mjs` ran the existing `218-fixed-counter-v1/20000-frames` fixture. It reported main-thread p95 0.0029 ms, p99 0.0046 ms and 0 overloads in the first observed enabled arm. These are portable counter-probe numbers, not 204/frame measurements.
- 219: the generic script stopped before measurement because `Docs/Evidence/219-simulation-scheduling/after.json` already exists (`Evidence exists; preserve original before/after explicitly before another capture`).
- 221: `node --import ./scripts/register-typescript.mjs scripts/benchmark-worker-governor.mjs Evidence/221/204-probe.json` ran the existing `221-synthetic-cpu-v1` protocol; queue p95 4.7844 ms, service p95 0.3833 ms, end-to-end p95 5.1677 ms. Not early-loop learning service time.
- Stage-2 scope decision: the generic scripts did not accept the 044 small map or the 204 controller fixture, so no fixture-specific number was fabricated.

The generic scripts still use their fixed workloads. Stage 3 does not call them: it imports the instrumentation APIs and feeds them the 204 fixture. The earlier statement that the harnesses cannot accept the fixture is therefore superseded for direct API composition; it remains true for the unmodified CLIs.

## Stage-3 fixture-specific measurement

Command:

```text
volta run --node 24.21.0 --npm 11.19.0 -- node --import ./scripts/register-typescript.mjs scripts/run-204-loop-probe.mjs
```

Output: `loop-probe/probe.json` and `loop-probe/summary.md`, labelled `PROVISIONAL_UNCALIBRATED`. Fixture: three taxis + two civilians, authored 044 road context, 046/047/051 callbacks under the 219 scheduler and the 008 fixed-tick loop; 120 warmup frames and 600 measured frames, five alternating enabled/disabled pairs.

### 218

The real `createPerformanceCollector`, `distribution` and `createPerformanceReport` were fed the 204 frames. Median across the five enabled arms: frame p50 0.3593 ms, p95 0.7236 ms, p99 1.1839 ms; main-thread p50 0.3593 ms, p95 0.7236 ms, p99 1.1839 ms. `frameMs`/`mainThreadMs` are the wall cost of one synthetic frame, not display cadence. Collector dropped zero samples.

### 219

| Metric | p50 | p95 | p99 | max |
| --- | ---: | ---: | ---: | ---: |
| step total (callbacks + scheduler) | 0.3555 | 0.7243 | 1.1125 | 1.9893 |
| scheduler own (excludes 044/045/046/047/051) | 0.0038 | 0.0064 | 0.0091 | 0.0665 |
| decision callback (044/045/046/051) | 0.3344 | 0.6932 | 1.0806 | 1.9597 |
| controller callback (047) | 0.0161 | 0.0264 | 0.0399 | 1.1010 |
| physics callback (kinematic state) | 0.0003 | 0.0005 | 0.0008 | 0.0046 |

Fixed-tick debt: p95 1.211e-12 ms, p99 1.211e-12 ms over 3000 samples; 0 overloads. The synthetic 60 Hz clock admits time exactly, so debt is near the floating-point floor; this does not prove real-time headroom. Scheduler stats after the measured arms: 5 actors, 0 route jobs, 0 route cache entries, 2 retained snapshots before dispose and 0 after.

### 221

`WorkerClient` and `WorkerResourceGovernor` admitted eight concurrent `learning` jobs to one real `worker_threads` runtime. Each job ran the real `composeEarlyLoopProfile` + `compileEarlyLoopControllerProfiles` on the 204 estimator candidates and returned the 046/047/051 values; every result matched the main-thread tokens within `1e-9`. Two warmup jobs absorbed worker startup (179.9715 ms) and were acknowledged before measurement.

| Metric | p50 | p95 | p99 | max | count |
| --- | ---: | ---: | ---: | ---: | ---: |
| queue | 3.7846 | 7.6180 | 7.6180 | 7.6180 | 8 |
| service | 0.9868 | 1.4989 | 1.4989 | 1.4989 | 8 |
| end-to-end | 4.9377 | 8.5771 | 8.5771 | 8.5771 | 8 |

All eight admissions were `PENDING`, all eight outcomes were `result`, eight protected results were retained, and acknowledgement returned the memory store and governor usage to zero jobs/bytes.

### Export constraint observed

`createPerformanceReport` with a single 204 arm throws `Complete bounded paired repetitions required`. The export accepts the workload only as complete paired repetitions, so five real pairs were delivered. No other 218/219/221 export rejected the fixture: `createFixedTickLoop`, `createSimulationScheduler`, `WorkerClient` and `WorkerResourceGovernor` accepted it directly.

### Limitations

- Node CPU only; no browser, GPU, FPS, laptop, soak or gameplay gate.
- The fixed tick is synthetic 60 Hz; debt/overload describe that clock.
- The fixture publishes a kinematic speed state instead of a Rapier world.
- The 221 worker task runs the real 204 compose/compile on estimator candidates; the 093 ledger and estimators stay on the main thread.
- Zero real playtest participants exist; this probe is not participant evidence.

# PBI 204 first-loop probe (218/219/221)

**PROVISIONAL_UNCALIBRATED.** Measured on Node CPU only. These numbers are not FPS, GPU, laptop, gameplay or release evidence.

Fixture: `204-early-loop-fixture-v1`; 3 taxis + 2 civilians; authored 044 road context. The 093/094/095/098 -> compose/compile chain runs once; then 046/047/051 callbacks run under the 219 scheduler and the 008 fixed-tick loop. Commit: `0b785f78afc132add7bd0e45425d6b9955600d58`.

## 218 performance harness

Five enabled/disabled pairs, alternating order, 120 warmup frames and 600 measured frames per arm. `frameMs`/`mainThreadMs` are the wall cost of one synthetic frame; display cadence is unavailable.

| Enabled run | frame p50 | frame p95 | frame p99 | main p95 | main p99 | debt p95 | overloads |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.364800 | 0.782900 | 1.204100 | 0.782900 | 1.204100 | 1.211e-12 | 0 |
| 2 | 0.367700 | 0.723600 | 0.907400 | 0.723600 | 0.907400 | 1.211e-12 | 0 |
| 3 | 0.356000 | 0.710600 | 1.189700 | 0.710600 | 1.189700 | 1.211e-12 | 0 |
| 4 | 0.359300 | 0.733200 | 1.183900 | 0.733200 | 1.183900 | 1.211e-12 | 0 |
| 5 | 0.357300 | 0.710300 | 0.833400 | 0.710300 | 0.833400 | 1.211e-12 | 0 |

Median across the five enabled arms: frame p50 0.359300 ms, p95 0.723600 ms, p99 1.183900 ms; main-thread p50 0.359300 ms, p95 0.723600 ms, p99 1.183900 ms.

Collector overflow/dropped: none (`complete` for every enabled arm).

## 219 scheduler

| Metric | p50 | p95 | p99 | max |
| --- | ---: | ---: | ---: | ---: |
| step total (callbacks + scheduler) | 0.355500 | 0.724300 | 1.112500 | 1.989300 |
| scheduler own (excludes 044/045/046/047/051) | 0.003800 | 0.006400 | 0.009100 | 0.066500 |
| decision callback (044/045/046/051) | 0.334400 | 0.693200 | 1.080600 | 1.959700 |
| controller callback (047) | 0.016100 | 0.026400 | 0.039900 | 1.101000 |
| physics callback (kinematic state) | 0.000300 | 0.000500 | 0.000800 | 0.004600 |

Debt: p95 1.211e-12 ms, p99 1.211e-12 ms; combined 3000 fixed-tick samples with max 1.211e-12 ms. Overloads: 0. Scheduler stats after the measured arms: {"actors":5,"routeJobs":0,"routeCache":0,"stopPolicyCalls":600,"retainedSnapshotsBeforeDispose":2,"retainedSnapshotsAfterDispose":0,"exactPageMemoryBytes":null}.

## 221 worker governor

Two warmup jobs absorb worker startup (179.971500 ms) and are acknowledged before measurement. Eight concurrent `learning` submissions then go to one real `worker_threads` runtime; each job runs the real 204 compose/compile on the estimator candidates. Admissions: PENDING, PENDING, PENDING, PENDING, PENDING, PENDING, PENDING, PENDING; outcomes: result, result, result, result, result, result, result, result; transfers: 10.

| Metric | p50 | p95 | p99 | max | count |
| --- | ---: | ---: | ---: | ---: | ---: |
| queue | 3.784600 | 7.618000 | 7.618000 | 7.618000 | 8 |
| service | 0.986800 | 1.498900 | 1.498900 | 1.498900 | 8 |
| end-to-end | 4.937700 | 8.577100 | 8.577100 | 8.577100 | 8 |

Protected results retained: 8/8; store after acknowledgement: {"records":0,"bytes":0}; governor usage after acknowledgement: jobs 0, bytes 0.

## Export constraints

- `createPerformanceReport` with a single 204 arm: Complete bounded paired repetitions required. The export requires complete paired repetitions; five real pairs were delivered.
- No other 218/219/221 export rejected the 204 workload. `createFixedTickLoop`, `createSimulationScheduler`, `WorkerClient` and `WorkerResourceGovernor` accepted the fixture directly.

## Limitations

- Node CPU only; no browser, GPU, FPS, laptop, soak or gameplay gate is measured
- The fixed tick is synthetic 60Hz; debt/overload are reported from that clock
- The fixture publishes a kinematic speed state instead of a Rapier world
- The 221 worker task runs the real 204 compose/compile on estimator candidates; ledger/estimator work stays on the main thread
- Zero playtest participants exist; this probe is not participant evidence

Zero real playtest participants exist. This probe says nothing about the five-participant target.

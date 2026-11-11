# 222 real pipeline cost

Machine-readable values: [cost.json](cost.json). This is the only wall-clock measurement of PBI
222; it is **not** part of the deterministic transcript. It was produced by `--cost` on the machine
that ran it and it is a local sample set, not a p95 and not a hardware certification.

Contract: 222-bounded-pipeline-v1

- Samples: 20
- Vehicles: 70
- Snapshot bytes: 64669
- Clock: performance.now
- Measured at: 2026-11-11T09:53:36.349Z
- Authoritative tick budget: 5.5 ms desktop / 8 ms laptop (single sample, not a percentile)

| Phase | Min (ms) | Median (ms) | Max (ms) |
| --- | --- | --- | --- |
| capture (in the tick) | 0.014 | 0.017 | 0.027 |
| encode | 3.481 | 3.918 | 6.219 |
| copy | 1.042 | 1.111 | 2.36 |
| transfer | 0.003 | 0.003 | 0.038 |
| commit | 0.001 | 0.001 | 0.003 |
| total | 4.565 | 5.163 | 8.322 |

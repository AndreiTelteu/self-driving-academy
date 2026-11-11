# 207 real world-recorder cost

Machine-readable values: [cost.json](cost.json). This is the only wall-clock measurement of PBI
207; it is **not** part of the deterministic transcript. It was produced by `--cost` on the machine
that ran it.

Contract: 207-world-recorder-v1: 1001 recorded ticks with 40 vehicles, one COLLISION at tick 590 and an explicit seal at tick 1000

- Samples: 15
- Vehicles: 40
- Recorded ticks per sample: 1001
- Chunk bytes: 605985
- Peak charged bytes: 1958337 of 25165824
- Measured at: 2026-11-11T03:02:14.957Z

| Phase | Min (ms) | Median (ms) | Max (ms) |
| --- | --- | --- | --- |
| Record 600 ticks + 40 events | 36.009 | 40.915 | 65.237 |
| Seal one incident chunk | 50.134 | 65.385 | 85.4 |
| Verify a sealed chunk | 28.378 | 38.298 | 66.197 |

# 206 real checkpoint cost

Machine-readable values: [cost.json](cost.json). This is the only wall-clock measurement of PBI
206; it is **not** part of the deterministic transcript. It is produced by `--cost` on the machine
that ran it.

Contract: Real monotonic clock (performance.now) on this machine; one process; same 70-vehicle world at tick 60; in-memory IndexedDB double. Not a browser measurement.

- Samples: 25
- Vehicles: 70
- Snapshot bytes: 64378 of 262144 (24.558%)
- Checksum: `c5a0738c0be1b8a149726738b9b9cccad5655229c542396b04d8aa9d24d8bcb5`
- Measured at: 2026-10-22T17:51:44.100Z

| Phase | Min (ms) | Median (ms) | Max (ms) |
| --- | --- | --- | --- |
| Synchronous capture | 0.035 | 0.044 | 0.141 |
| Validation and checksum | 5.864 | 6.942 | 12.555 |
| Durable commit | 7.802 | 11.853 | 16.995 |
| Total | 15.145 | 18.478 | 26.907 |

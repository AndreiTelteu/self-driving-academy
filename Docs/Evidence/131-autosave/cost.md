# 131 real autosave cost

Machine-readable values: [cost.json](cost.json). This is the only wall-clock measurement of PBI 131;
it is **not** part of the deterministic transcript. It was produced by `--cost` on the machine that
ran it and it is a local sample set, not a p95 and not a hardware certification.

Contract: 131-autosave-v1

- Samples: 20
- Vehicles: 70
- Checkpoint body bytes: 64378
- Clock: performance.now
- Measured at: 2026-11-11T13:30:16.380Z
- Authoritative tick budget: 5.5 ms desktop / 8 ms laptop (single sample, not a percentile)

| Phase | Min (ms) | Median (ms) | Max (ms) |
| --- | --- | --- | --- |
| capture (in the tick) | 0.023799999999937427 | 0.027350000000183172 | 0.08230000000003201 |
| encode | 4.057900000000018 | 4.34170000000006 | 5.338600000000042 |
| copy | 1.0895000000000437 | 1.2321000000000595 | 2.192500000000109 |
| transfer | 0.0008000000000265572 | 0.001099999999951251 | 0.002300000000104774 |
| progress (inside commit) | 2.552199999999857 | 2.8184499999998707 | 4.103999999999928 |
| checkpoint (inside commit) | 3.8755999999998494 | 4.312950000000001 | 5.516699999999901 |
| commit | 6.52559999999994 | 7.098250000000007 | 8.898800000000165 |
| total | 12.078699999999799 | 12.806250000000091 | 14.88939999999991 |

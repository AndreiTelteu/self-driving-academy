# 144 — real slice cost

Probe: 144-experiment-worker-v1, 5 batch(es), 15 slice(s).
Recorded: 2026-11-11T21:37:40.089Z, Node v24.19.0, win32 x64.

| Measure | Min (ms) | Median (ms) | Max (ms) |
| --- | --- | --- | --- |
| run cell (one slice) | 24.449 | 25.458 | 29.699 |
| whole batch (3 slices) | 77.46 | 77.685 | 88.158 |

Manifest budget: slice ≤ 10 ms, cancellation response ≤ 100 ms.
Slices over the slice budget: 15 of 15.

One slice is one real 142 run cell executed inside one worker step; the run cell is not internally sliced. Single machine, single run, not a p95 and not a hardware certification.

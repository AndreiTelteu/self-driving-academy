# PBI041 verification — route planner (A*)

PBI041 delivers the real A* routing layer over the PBI033 directed lane graph: a versioned cost model, one-way/access-correct traversal to lane and service-zone destinations, explicit non-route outcomes with bounded termination, a capped and invalidated cache, and the `RouteTask` integration with the PBI219 scheduler queue. This is a `targeted` verification ([validation policy](../../validation-policy.md)): isolated correctness plus a local CPU cost comparison. It is not a hardware, FPS, whole-tick or laptop gate.

## What was executed

- `node --import ./scripts/register-typescript.mjs --test tests/world/route-planner.test.ts`: **13/13 PASS**. Covers directed one-way + access classes, a blocked lane on the only CIVIL path, upstream goals that must loop forward (no reverse edge), unknown origin/destination, service-zone destinations and access mismatch, determinism, cache cap + graph/cost/blocked invalidation, explicit traffic weights, budget-exhausted/unreachable termination, 219-fixture parity + independent cost-optimality oracle, and the real 219 queue integration (ordering, `CACHED`, `BLOCKED`).
- `npm run typecheck`: PASS (`check-typecheck.txt`).
- `npm run lint`: PASS (`check-lint.txt`).
- `npm run format:check`: PASS (`check-format.txt`).
- `npm run check:architecture`: PASS, 137 TypeScript files plus negative probes (`check-architecture.txt`).
- `npm test`: PASS, **805/805** (`check-tests.txt`). The pre-existing PBI219 route-work tests still pass, including `routework admission is finite, priority deterministic…`, `routecache uses graph/cost/access/origin/destination…` and `cooperative synthetic route jobs match original exact path/blocked reference…`.
- `node scripts/benchmark-route-planner.mjs`: PASS, raw stdout in `benchmark-stdout.txt`, report in `route-planner-cost.json`.

`Docs/Evidence/219-simulation-scheduling/route-cost.json` was not modified or regenerated (`git status` on that path is empty).

## Local CPU cost (targeted)

Same real fixture as PBI219 (`tests/autonomy/road-context-reference.ts` map + PBI033 lane graph, 9 lanes, 16 actors, one blocked lane). BEFORE = the preserved `syntheticRouteSearch` BFS; AFTER = `createRoutePlanner.findRoute` A* with a fresh cost version every batch (cold cache). Five alternating observer-off/on repetitions, 20 warmup + 80 measured batches, 16 routes per batch. Each run also asserts reachability parity with the reference, directed-edge legality and that the planner cost is optimal-or-better. Separate measured regions: direct search, queue admission, whole 4-tick processing.

Median of the per-run percentiles in milliseconds (10 runs):

| Region | p50 | p95 | p99 |
| --- | ---: | ---: | ---: |
| BEFORE synthetic BFS `syntheticRouteSearch` | 0.00890 | 0.01905 | 0.02975 |
| AFTER `createRoutePlanner.findRoute` | 0.03895 | 0.06325 | 0.11300 |
| AFTER 219 queue admission (16 jobs) | 0.06495 | 0.09570 | 0.40655 |
| AFTER 219 four-tick processing | 0.09000 | 0.13980 | 0.20845 |

ADDED cost of the new feature, reported separately: +0.04420 ms p95 for the direct planner versus the synthetic reference; +0.09570 ms p95 for queue admission and +0.13980 ms p95 for the four-tick pipeline. These regions are never summed into a compound percentile. Individual `p99` values include JIT/GC outliers (up to ~0.4 ms) and are diagnostic only.

## Budget comparison and limitations

Compared against `Docs/performance-budgets.json` `proposedBudgets.desktop.authoritativeTickP95Ms = 5.5 ms`, which keeps its manifest labels **PROVISIONAL_UNCALIBRATED**. The routing slice is far below that ceiling, but the probe is a small 9-lane synthetic graph, not the full game tick.

The measurement hardware is **AMD Ryzen 7 7735U, 16 logical CPUs, 14.70 GB RAM, win32 10.0.26300** — the integrated-GPU laptop, **not** the desktop 7950X3D baseline in the manifest. Native timed measurements were run sequentially and alone; no heavy build ran during them. No hardware/renderer/GPU/FPS gate is claimed, and this `targeted` PASS does not certify integrated-game performance.

Other explicit limitations:

- The cost model is geometric (metres / map speed limit + documented connection penalties) plus caller-supplied traffic weights; it does not observe live traffic, signals, STOP lines, obstacles or priority, and a static TURN is not permission to cross on RED.
- Service-zone destinations terminate on the zone's serving lane; the 219 `createRouteTask` port accepts lane-id destinations only, so a dispatcher resolves a zone first (the reason is documented in `Docs/route-planner.md`).
- The 219 scheduler owns the routing job queue; the planner connects through `createRouteTask` and does not duplicate the queue. A blocked-set change must be paired with a new `costVersion`, exactly as the 219 cache contract requires.
- The independent cost-optimality oracle and the reference parity check run on the same 9-lane fixture; other real maps need their own calibration.

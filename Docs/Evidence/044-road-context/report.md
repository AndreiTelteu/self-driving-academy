# PBI044 validation and CPU evidence

Implementation and validation complete on 2026-10-05. PBI044 is physically in Done; RequireDone044, Validate-Plan and global345-test checks passed. The accepted production source SHA256 is `49bdfaa3cff2dcd467ee70df655d9b72336774e40997b1958ef6625f708ccbb9`.

## Protocol and provenance

The exhaustive reference baseline was captured before `src/autonomy/road-context.ts` existed, with absence checked before and after capture. [before.json](before.json) and exact new harness/reference bytes in [before-source](before-source) remain unchanged. Its seven listed primary hashes are a declared scope, not the complete transitive Node closure; unchanged committed dependencies are reconstructible from `cc861f5ed4d3bdf310a679d26f76e37d2f72e95a`. After/memory reports hash the declared fixture/reference and all top-level TS sources in autonomy/world/simulation/sessions/vehicles, including public barrels and priority/conflict/contracts. They do not claim a verified full dependency closure.

Hardware: AMD Ryzen 9 7950X3D, 32 logical CPUs, 50,337,325,056 bytes RAM, Windows 10.0.26200, Balanced power scheme; Node v24.21.0. Baseline and after ran in explicit exclusive CPU handoffs, with PBI023 browser measurement paused. Five paired observer-off/on repetitions each use 20 warmup and 80 measured unpaced iterations per workload. Off precedes on, so cache/JIT order may bias the instrumentation comparison. Both modes externally time whole query batches; on adds individual-context sub-timers. Each normal/dense observed run captures all 5,120/8,800 individual contexts, bounded by 8,800 samples; batch/update buffers hold 80 samples each. Numeric diagnostic payload bound is 71,680 bytes, excluding JS array and summary scratch overhead. Actual elapsed wall times and forced-GC heap diagnostics are in raw reports. No 30/120-second wall-steady, FPS, renderer, GPU, laptop or complete-game throughput claim is made.

The identical synthetic fixture contains 64/110 vehicles, 32/96 obstacles and 24/256 zones, four junction approaches and a parallel deck separated vertically by 12m. The real036 signal controller advances every consecutive authoritative tick. Routes and per-relation distances are explicit. Fixed distance10m/clearance5m values remain synthetic owner data despite position motion; they are not continuity evidence. The benchmark always requests fresh contexts; six-tick cache, urgent invalidation, UNKNOWN/completeness and priority semantics are verified by dedicated tests instead.

## Results

Median of five per-run p95 values, milliseconds:

| Workload / observer | Before query batch | Final query batch | New frame update |
| --- | ---: | ---: | ---: |
| Normal / off | 2.1560 | 2.2380 | 1.9321 |
| Normal / on | 2.1882 | 2.1240 | 1.8256 |
| Dense / off | 10.4985 | 8.0746 | 5.7200 |
| Dense / on | 11.6043 | 8.2135 | 5.9448 |

[after.json](after.json) records the stabilized implementation. New atomic frame admission/index construction cost is separate from the query comparison; these percentiles must not be summed into a combined percentile. The fixture characterizes early simulation costs, including material frame-update overhead. It does not validate the provisional 5.5ms whole-game authoritative-tick ceiling or establish absence of a complete-tick regression.

The first measured implementation repeated lane location for each neighbor/context. Its exact raw [after trial](after-trial-no-projection-cache.json) and [memory trial](memory-trial-no-projection-cache.json) are preserved. The final implementation reuses at most110 lane projections within one accepted frame, clearing them at every accepted frame/reset/dispose. It retains identical fixture/reference and validation behavior. Normal off query delta in that first trial was +0.3371ms, which alone did not satisfy the contract's combined >10% AND >1ms relative alert; this optimization does not imply a full-tick budget approval.

Before timing, final benchmark projections compare exact subject identities, lane, leader, concrete signal, conflict relation/vehicle IDs and obstacle/zone IDs against the exhaustive oracle at ticks0/30/60/99 in normal and dense scenes. Every final checksum row also matches before, but checksums alone are not treated as ID-set proof. Extra priority/completeness/UNKNOWN fields have dedicated semantic assertions.

## Correctness and ownership

Executed commands: scoped Prettier write/check; `node --import ./scripts/register-typescript.mjs --test tests/autonomy/road-context.test.ts` (16/16 PASS, final run 889.582ms); `npm run typecheck` PASS; `npm run check:architecture` PASS (93 TS files and negative probes); scoped ESLint PASS. Tests cover exact exhaustive context IDs, same/opposite/lateral/overpass lane geometry, real red→green urgent refresh before AI cadence, preserved source tick, no signal event resampling, conflicting/stale snapshots, access/route/unknown applicability, explicit policy/distance/discontinuity semantics, all-kind session/epoch/incarnation/removal fences, partial completeness, finite1024identity admission and accessor-free deep geometry/array validation.

[memory.json](memory.json) records20 dense epoch-reset cycles and final dispose, including atomic rejected-frame ownership checks. Every reset clears current frame, cache, dirty IDs, lane projections, identity/tombstone ledger, fingerprint and index entities/cells/references/vertices/fallback counters. Returned snapshots are frozen. Forced-GC heap changes 11,130,704→11,877,640 bytes (+746,936); this is a process/harness diagnostic, not exact context RAM or proof of zero allocator growth. The harness retains the static fixture and bounded report rows. There are no context listeners, timers or historical-frame lists.

Admission bounds are110 context/projection entries,1024 all-kind identities per epoch and16Mi fingerprint code units. During atomic frame replacement at most two populated034 indexes coexist:32,768 references/cells,1,436 entities and131,072 indexed zone vertices, plus up to65,536 temporary validated zone vertices and the empty index. Current stats do not represent this transient peak. These arithmetic caps are not measured peak allocator bytes or calibrated gameplay limits. Owner observations must explicitly identify and certify vehicles/obstacles/zones; anonymous022 addBox objects do not acquire fabricated identities. Local priority coverage remains UNKNOWN/LOCAL_ONLY; temporal038 evidence belongs to its authoritative owner.

Coordinator final `npm run check` PASS:345 tests, typecheck, lint, formatting and architecture, preserved in [global-check.txt](global-check.txt). Exact bytes for every declared after/memory source hash are archived under [after-source](after-source), retaining original path names with `.txt` suffixes;36 unique files verified against SHA256. Physical transition completed; [board validation](board-validation.txt) PASS235total/197ToDo/2InProgress/36Done and [plan validation](plan-validation.txt) PASS1100localLinks. [Global check](global-check.txt) passed345tests plus typecheck/lint/format/architecture. Publication is scoped to PBI044.

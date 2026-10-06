# 029 final-stage diagnostic result

The single reviewed execution completed with both syntax checks and all source/native/physical/cleanup guards passing. No production change, optimization, inspector round, acceptance AFTER, build, browser or Git operation occurred. CPU was explicitly released immediately after execution; this document summarizes existing captured data only.

Source hash `d4d7309cd45995ff2f6dda0ae16cda36cd33fcfcad6ff162cd384c2ebf2a6ced`; production commit bf78ad85bb0b32e63d065e663829c6aa8cad2fb1. Execution started2026-10-06T01:46:39.255Z, archive completed01:46:39.459Z, first-world boundary01:46:39.459Z. Separate start/first-world manifests and ten exclusive-write partial outputs persist. Original controller SHA2562b2e98e329cd4e87f868128e646b3f1dd6f91468aae8253c76a8710b256ff587 and reviewed copy86db5f772ec0a7e4334fed4415c69cab7dc6d956dec3c378585e3fbc8a44a85d remained unchanged. Native archive4,340,292bytes/SHA25602dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0 verified.

Ten70-car worlds,180warmup/600measured ticks, five alternating final-stage OFF/ON pairs. Both modes use native observerON,027 opt-in and029AVAILABLE. All ten input/final-physical/intermediate traces equal original reference; all cleanup assertions and partial-file equality checks pass. Five ON runs retain210000 finite ordered per-car stage windows and600 ordered per-tick sums each. Both modes retain600 unsorted whole-tick and incremental durations per run. No sample/tick/run was filtered or selectively repeated.

| Pair | Stage sum p50 ms/tick | Stage sum p95 ms/tick | Whole tick p95 OFF/ON ms | ON minus OFF wall ms | Wall change |
| --- | ---: | ---: | ---: | ---: | ---: |
|0|0.0160|0.0266|2.1350/1.8946|-63.2991|-6.52%|
|1|0.0189|0.0257|1.9558/2.0129|+32.9874|+3.31%|
|2|0.0191|0.0319|1.9358/2.0696|+54.9200|+5.60%|
|3|0.0187|0.0319|2.0032/2.0127|-26.7487|-2.62%|
|4|0.0179|0.0202|2.0298/2.0285|-15.9814|-1.55%|

These are sums of70 independently timed final-transform calls per physical tick; their marginal p95 cannot be added to/subtracted from whole-tick p95. Scope includes final-input setup, magnitude/signed-value calculations and object construction/freezing/projection replacement, with timing-clock effects. It excludes the observer writer, earlier boundary/gear work, final generation fence and native actuation. Mean observed per-car window0.240–0.285microseconds is near clock/JIT-sensitive scale and is not exact allocation cost or a guaranteed optimization saving. OFF/ON whole/wall deltas include observer overhead, order/JIT and host variance; negative changes prohibit interpreting their difference as a clean isolated cost. Potential indirect later GC/JIT effects are not ruled out by a small local window.

Disposition: this new seam's local timing does not provide an actionable direct explanation for the original1.04–1.25ms v5 chronological regression, which predates these clones. Do not infer that newer whole-tick measurements replace the original baseline or pass its gate. Do not implement speculative clone/min optimizations or run a further blind AFTER from this diagnostic alone. Original CPUFAIL5/5, historical runtime-heap findings and current-source browser obligations remain unchanged. Full raw and additive summary files are final-stage-diagnostic.json and final-stage-diagnostic-summary.json; all prior captures remain immutable.

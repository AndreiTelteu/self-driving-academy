# Independent review 029-performance-r3-direct-read

**CHANGES REQUIRED; keep029 In Progress.** V5 preserves the reviewed safety contracts but still fails the original CPU gate **5/5**. This review performed no tests, benchmark, build, UI, source, shared-document, board or Git mutation; only these two r3 files are written. Prior r1/r2 MD/JSON and [parent scope correction](parent-review-r2-scope-correction.json) were read; original reports and failed captures remain untouched.

Verified worktree/root, branch `loop-pbi/vehicle-damage-01`, HEAD `d80bf721e536ff1400dc48e1656169ac2fecfa61`; canonical024/028 files physically exist in Done. Root budgets, Docs25 and PBI/AGENTS remain authoritative: **>10% AND >1ms CPU**, or **>10% AND >5MiB memory**, confirmed in at least3/5; absolute budgets also apply, no automatic baseline replacement. Root/worktree budget JSON is semantically equal.

## V5 implementation and chronological result

Only production change from archived v4 is [damage-state.ts](source-after-v5/src/vehicles/damage-state.ts): `readAvailability` replaces `mutate(() => ...)` with the identical busy/disposed check and guarded `try/finally`. Context validation, tick fence, exact physical identity read and constant effect order are unchanged. Thrown values propagate unchanged, busy clears after exceptions/recursive reads, and the provider still runs for every active car/tick. The [25 recorded tests](native-controller-tests-07.txt) include a meaningful port throw/recursive-read/retry test; typecheck07/lint06 logs have no error diagnostics (reviewer did not rerun or observe their exit statuses).

Existing immutable caches still require full plain own-DATA schema/numeric validation; getters are rejected without invocation, mutable/new values revalidate, physical identity is checked every read and before actuation. Maps remain bounded110; history/operation IDs4096, pages64, serialized UTF-8 full array4MiB including delimiters. Atomic admission, idempotence/backpressure, incident-preserving recovery/reset and disposal remain unchanged. No new semantic/resource/security defect found in this change; bounded serialization is not exact heap RAM.

[AFTER v5](after-node-v5.json), source `b7a0181c453a8fad9297943640e2937f19edcaf49783b19a0186a705badbd3ce`, and [comparison](cpu-comparison-v5.json) against immutable [BEFORE](before-node.json):

| Pair | Before p95 ms | V5 p95 ms | Delta ms | Increase |
| --- | ---: | ---: | ---: | ---: |
| 0 | 1.6536 | 2.9016 | 1.2480 | 75.47% |
| 1 | 1.7294 | 2.8042 | 1.0748 | 62.15% |
| 2 | 1.7618 | 2.8653 | 1.1035 | 62.63% |
| 3 | 1.7402 | 2.7913 | 1.0511 | 60.40% |
| 4 | 1.8233 | 2.8655 | 1.0422 | 57.16% |

Independently recomputed all flags; **FAIL5/5**, despite absolute5.5ms passing. The v5 CPU harness differs from v4 only in archive/output names. Removing the callback has not resolved the measured gate; v2FAIL5/5, v3FAIL3/5, v4FAIL4/5 remain preserved. V5 incremental p95 .3832–.4869ms and Rapier step1.9719–2.1093ms cannot decompose total p95 by adding/subtracting marginal percentiles. Identical native physics does not exclude indirect GC/JIT/scheduling effects; host-only causality remains unproved.

## Corrected GC archive and memory findings

Original GC capture serialized **333 measured-window raw events plus outside count232**. Its565 retained events referred to the in-memory bounded observer, not a complete565-event raw archive. This explicitly clarifies r2; no original report is rewritten.

[GC v2 raw capture](same-host-gc-diagnostic-v2.json), source `030d88064d52022443ceb73d8a6758e71c273012b5dee2a20b412b6ac5180f48`, now serializes all565 observed events:331 measured,234 outside, capacity4096. Independently checked every window assignment against raw events, no overlapping assignments/end crossings, ten60-tick cadence samples per run. Measured events are kind1; full archive also contains kinds4/8 outside. Complete observed serialization improves carryover inspection; asynchronous observer completeness for every engine event is not guaranteed.

Observer-ON current minus archived024:

| Pair | CPU ref/current p95 ms | Raw immediate heap delta B | Live post-GC delta B | Measured GC ref/current |
| --- | ---: | ---: | ---: | ---: |
| 0 | 2.5004/2.5768 | -5,664,112 | +6,024 | 20/20 |
| 1 | 2.5604/2.5824 | +8,708,712 | -40,688 | 20/20 |
| 2 | 2.5718/2.6352 | -580,176 | -5,920 | 10/10 |
| 3 | 2.5540/2.6768 | -571,344 | -28,048 | 10/10 |
| 4 | 2.8310/2.7060 | -606,696 | +45,104 | 10/10 |

Joint flags: CPU0/5, raw heap1/5, live post-GC0/5. OFF raw/live flags0/5; live deltas range-89,472 to+240,528B. All ten post-disposal deltas range-109,640 to+173,488B. Raw current heap is lower8/10, higher2/10; sampled peaks equal immediate endpoints here but are only observed lower bounds on actual peaks.

No retained multi-MiB excess is reproduced while worlds remain live after GC. Raw pressure differential is substantially reduced relative to v4's GC diagnostic, compatible with removing a collectable hot callback, **not exact callback-byte attribution or proof of causality**. Pair1 ON already starts+9,314,008B above reference; its raw growth differential is-605,296B. Do not assign all8.71MB to600ticks or use starting-heap subtraction to redefine the gate. GC counts are equal for ON pairs and durations are mixed; no unsorted per-tick timestamp association exists to assign GC to controller versus assertions/packet/trace work or explain the chronological p95 failure. Different process/phase/JIT state prevents causal subtraction across v4/v5 captures. Earlier red flags are narrowed, not erased; AVAILABLE short runs do not establish full-history/soak memory PASS.

Both arms use forced GC with live worlds before/after measurement, cadence sampling and delivery drains outside CPU timing; those perturbations make this supplemental evidence, not a replacement acceptance baseline. Metadata still calls fixtureVersion v1 and top diagnosticProtocol omits the extra live-world GC correctly documented in per-run observationProtocol/source. Parent should clarify this additively without changing raw archives.

## Integrity, remaining work and next step

Recomputed26 v5 and50 GC-v2 archived input byte counts/SHA256 plus aggregate hashes; all match, current inputs match, all18 production files in GC v2 match v5. Both native archives match4,340,292B/SHA256 `02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0`. All10 CPU and20 GC physical traces, effective-input hashes and final states/hashes exactly match chronological reference; all30 native/controller cleanup records verify release and stale-read rejection. Separate20x110 lifecycle/cap/backpressure tests remain necessary evidence, not replaced by sequential AVAILABLE diagnostic worlds.

Keep029 In Progress. A useful next measurement is bounded allocation sampling with stacks and unsorted tick start/end timings aligned to GC, with host scheduling/load metadata in both arms, to locate a concrete hot site before another optimization. Do not repeat blindly or weaken criteria; this review grants no extra CPU slot/waiver.

Current-source real foreground Chrome WebGPU/WebGL2 motion/recovery/history/lifecycle checks remain absent. Node180warm/600measured ticks mean3/10 simulated seconds unpaced, without renderer: whole-controller CPU is not full authoritative gameplay tick, frame/main-thread/FPS or30s/120s hardware validation. Old5199 build is stale. Parent must integrate027 signed direction before damage magnitude/minimum-brake effects and truthful actual physical projection, then prepare fresh source-identified browser evidence when foreground is available. Full-game/laptop/soak obligations remain with owning PBIs;203 laptop waiver does not extend. Parent owns global checks, truthful shared docs, physical Done move and RequireDone029. Review complete; no work remains running.

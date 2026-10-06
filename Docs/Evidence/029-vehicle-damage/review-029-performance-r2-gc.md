# Independent review 029-performance-r2-gc

Verdict: **CHANGES REQUIRED; keep029 In Progress.** Read r1 MD/JSON in full. Parent accepted its objections and did not change thresholds. This review only writes these distinct r2 artifacts; no benchmark/build/UI/source/shared-doc/board/Git mutation.

Verified root/worktree `F:/Sites/self-driving-academy/.worktrees/vehicle-damage-01`, branch `loop-pbi/vehicle-damage-01`, HEAD `d80bf721e536ff1400dc48e1656169ac2fecfa61`. PBI/AGENTS, root budget JSON and Docs25 remain authoritative: increase **>10% AND >1ms (CPU), or >10% AND >5MiB (memory), confirmed in at least3/5**, absolute budgets still apply, no automatic baseline replacement. Root/worktree budgets are semantically equal.

## Evidence integrity and source safety

[GC raw capture](same-host-gc-diagnostic.json), captured2026-10-05T19:31:32.422Z, source `db9c0f0f2cb351d66dbfea7f7079001efae42cbd5cd19c20297c7ec962383f40`: independently verified all50 archived input byte counts/SHA256, aggregate source hash and current input equality. All18 archived v4 production files under src are byte-identical to current/GC archive: **no v5 implementation is present**. Native archive is4,340,292bytes, SHA256 `02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0`. All20 intermediate traces, input hashes and final physical hashes equal chronological BEFORE; all20 cleanup records verify zero native ownership, disposed collision owner, rejected stale reads and empty controller ownership. Raw cadence/window attribution checked; derived values agree with [owner summary](same-host-gc-diagnostic-summary.json).

r1 cache conclusions remain sound: frozen exact own-data schema validated before cache admission; mutable/new outputs revalidate; provider called every active car/tick, physical identity checked every damage read and before actuation. Context/effect caches remain bounded and cleared on reset/dispose as applicable. No new semantic/security defect found. Bounded history and full-array UTF-8 accounting remain unchanged; this AVAILABLE/no-incident diagnostic does not measure full history RAM or replace20x110 lifecycle tests.

## What the new diagnostic establishes

Both arms use equal forced GC before/after measurement with native world/controller still live, delivery drains outside timing,10 heap samples at60-tick cadence and raw heap immediately after loop before sorting. Node24.21.0 has --expose-gc. Observer capacity4096 retains565 events:333 within measured windows,232 outside. Observed measured events are kind1 (minor); all finish within their attributed window. Cadence samples and semantic assertions are outside sampled controller timing but inside elapsed window and affect allocation/GC. These changed conditions are diagnostic, not an acceptance baseline.

Observer-ON paired results (current minus archived024):

| Pair | CPU p95 ref/current ms | Raw post-loop delta bytes | Live post-GC delta bytes | Measured GC ref/current count | GC duration sum ref/current ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0 | 2.5831/2.7041 | -853,128 | +6,776 | 20/20 | 7.1667/7.9017 |
| 1 | 2.7136/2.8763 | +13,815,968 | -600 | 20/20 | 7.3055/7.5033 |
| 2 | 2.6507/2.6319 | +4,217,464 | +37,376 | 10/10 | 4.7690/4.5577 |
| 3 | 2.7788/2.7337 | +4,292,512 | -25,976 | 10/10 | 3.7170/3.7203 |
| 4 | 2.6935/2.6145 | +4,161,120 | +45,120 | 10/10 | 3.7350/4.8530 |

CPU joint flags0/5; raw endpoint joint memory flags1/5; live post-GC flags0/5. OFF post-GC deltas range-110,608 to+55,784bytes, while raw differences remain+2.24–4.37MB (0/5 joint flags). Across all10 arm comparisons post-disposal differences range-102,816 to+171,488bytes. These support short-run cleanup/collectability, not general runtime-memory PASS.

The GC-aligned live endpoints **do not reproduce a retained multi-MiB029 excess** in this short AVAILABLE fixture. Large pre/post-GC gaps show a collectable process-heap component while the world remains live. This narrows r1's memory objection: evidence does not support calling its5.62–7.27MB endpoint gap a retained damage-owner leak. It does not establish the cause of that earlier gap or exact owner RAM, nor eliminate transient allocation pressure. Current raw heap still increases in9/10 comparisons. Sparse samples are lower bounds on observed peaks, not complete high-water tracking.

Pair1 ON begins with current heap already+9,312,448bytes above reference despite the equal GC procedure; net raw growth difference is+4,503,520bytes. After live post-GC its delta is-600bytes. This demonstrates phase/carryover sensitivity; do not attribute the13.82MB endpoint difference wholly to600ticks of damage allocations or subtract starting heaps to redefine the gate. Other ON net growth differences are-853,184/+4,148,096/+4,280,840/+4,111,832bytes. Exact allocation rate remains unknown.

Observed GC counts are equal in ON pairs and GC duration totals are not consistently higher for029. GC start/duration/kind/flags are window-attributed, but raw per-tick timestamps/unsorted durations are absent: GC may occur in controller work, assertions, packet construction or other window work. GC sums cannot decompose p95, and marginal phase p95 values cannot be added/subtracted. This evidence cannot prove GC/closure/JIT/host causality for the original CPU failure. No prior capture has retrospective GC attribution.

## Unresolved objections and next step

[Chronological v4 CPU comparison](cpu-comparison-v4.json) stays **FAILED4/5**; v2FAIL5/5, v3FAIL3/5, r1 endpoint red flags and original failed publisher/trace attempts remain preserved. The new CPU0/5 result is supplemental under changed instrumentation/GC conditions. Neither absolute5.5ms nor GC-aligned small retained heap permits accepting the failed original relative gate. No host-only explanation or waiver is justified.

The hot `readAvailability` still constructs a callback for `mutate` on every read:42,000 measured invocations/run plus12,600warmup, by source/fixture count. The engine may optimize allocations; this is not a measured closure-byte total. A concrete next code change is to use a direct busy/disposed guard with try/finally in that read path, preserving validation order, reentrancy, exception cleanup, exact identity/context/tick fences and constant effects. Parent should validate stale/accessor/mutable/reentrant/retry behavior and measure a source-identified next version against unchanged chronological criteria plus consistent raw/live/GC channels. If attribution is still required, bounded allocation sampling with stack attribution can distinguish callback allocation from common harness/physics work. This review authorizes no additional measurement slot.

Current-source foreground Chrome WebGPU/WebGL2 motion/recovery/history/lifecycle evidence remains missing; old5199 sourceb813… is stale. Node600ticks are10simulated seconds after3simulated seconds warmup, unpaced and without renderer: whole-controller CPU is neither full authoritative gameplay tick nor hardware frame/main-thread/FPS validation under30s/120s protocol. Signed027 integration must apply magnitude cap after direction and publish actual effective physical commands. Full-history/capacity/native lifecycle recorded tests are separate from these sequential AVAILABLE worlds; later full-game/laptop/soak obligations remain with their PBIs. Shared vehicle-damage docs still label this capture NOT EXECUTED and should be updated truthfully by parent. Parent owns integration, global checks, physical Done move and RequireDone029 validation. Review round complete; no further work running.

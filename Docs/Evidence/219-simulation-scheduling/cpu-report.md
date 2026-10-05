# PBI219 CPU, ownership and headed evidence

The actual unphased before baseline was captured while production `src/simulation/scheduling.ts` was absent, checked before and after execution. [before.json](before.json) and43exact declared input archives in [before-source](before-source) remain unchanged. It uses existing008loop, actual044context and036signals, with static synthetic authoritative positions and a bounded033successor-search test job. Controllers/physics are counters in this CPU fixture, not implemented024/045gameplay. Node v24.21.0 on AMD Ryzen9 7950X3D,32logicalCPUs/50,337,325,056bytesRAM, Windows10.0.26200/Balanced power scheme; commit and source hashes are recorded for each capture. Source scopes include named files and top-level domain sources, not a verified transitive closure.

Each before/after capture has five alternating observer-off/on pairs,60warmup+240measured synthetic60Hzticks per70normal/110overload workload. Actual elapsed execution time is retained;5simulatedseconds does not mean5wallseconds of steady-state. Five typed240sample buffers use9,600bytes per workload. Common tick/admission timers operate in both modes; on adds decision/route subtimers. Decision/route distributions are per tick including zero-work nondue ticks, not individual callback latency. Alternating order exposes but does not eliminate JIT/cache/thermal bias. No CPU result proves hardwareFPS, a30/120secondwallsteady protocol, full-game tick budget, laptop or renderer/GPU throughput.

Median of five per-run p95values in milliseconds:

| Workload / observer | Before scheduling callbacks | After scheduling callbacks | Before044frame admission | After044frame admission |
| --- | ---: | ---: | ---: | ---: |
| Normal70 / off | 1.8465 | 0.6645 | 1.5424 | 1.8581 |
| Normal70 / on | 1.8045 | 0.5888 | 1.5508 | 1.8625 |
| Overload110 / off | 6.1717 | 2.0073 | 5.0414 | 5.5446 |
| Overload110 / on | 6.1143 | 2.1442 | 4.7045 | 5.6925 |

Scheduling timing includes decision/controller/physical-counter callbacks and the same direct synthetic route work in both arms. Frame admission is a separate measurement region. These percentiles must not be summed into a compound/full-tick percentile; new queue/cache work requires its separate cost probe. This evidence characterizes available early scope and does not approve the provisional5.5mscomplete authoritative tick. The normal admission delta and overload results are preserved without retroactively changing budgets or the reference.

All total counters/checksums match before:3,500/5,500decisions,21,000/33,000controllers and300physical-counter callbacks per normal/overload run. Phasing lowers p95decisions/tick from70/110to12/20 on this fixture. It does not promise that arbitrary entity IDs are balanced:110adversarial same-phase actors are all processed, without truncation. Exact authoritative physics/input/urgent trace comparisons across30/60/120synthetic render clocks and explicit hitch/background scenarios are assertions, while checksums alone are not semantic proof. Dedicated tests verify sourceTick versus decisionTick, urgent coalescing and next-tick physical publication, pending028publication admission, callback fault/no-retry, route lifecycle/versions/access/priority/receiver, actor identity and hostile reader/capacity behavior.

Executed20/20targeted tests PASS (367.2749ms), typecheckPASS, architecturePASS (96TSfiles plus negative probes), scopedESLint/PrettierPASS. The initial reference floating-debt exact-zero assertion was corrected to a sub-picosecond tolerance, with failed log retained; the lintprefer-const finding was corrected and its initial log retained. [after.json](after.json) has44declared byte archives in [after-source](after-source), SHA256verified. Accepted scheduler sourceSHA256 `e84615c4270cc315a79214fee17b907352f0004ccf4eec9e45ec9530fcb1f9d0`.

[memory.json](memory.json) was captured once with immutable output guard,5exact [memory-source](memory-source) files and end-of-probe drift verification. Twenty epoch-reset cycles on one engine plus one final dispose exercise110urgent entries,16pending jobs/one resident task and64maximal256-lane paths with256UTF-16code-unit IDs. Each reset clears actor/ledger/tombstone/urgent/job/task/cache/path ownership.1,300created tasks have1,300dispose calls;1,280successful results reflect completed jobs, while reset abandons stale-scope pending work without publishing old-world results. Forced-GC heap delta+415,736bytes is a process/harness diagnostic, not exact scheduler RAM or a full-game leak/soak verdict. Rows/static actor fixture remain harness-owned. The4,194,304code-unit/8MiBpath payload is arithmetic ownership, excluding JS objects, keys, transient result copies and owner task internals.

## Supplemental route queue cost

[route-cost.json](route-cost.json) is an explicitly post-implementation reference comparison, preserving original synchronous033successor-search semantics. It does not replace or rewrite the chronological before baseline. Five alternating off/on pairs have20warmup+80measured batches of16unique cold versioned keys, including blocked paths. Each batch invalidates the synthetic cost version, admits16jobs and processes four real scheduler ticks. Exact actor/path result maps are compared outside timing, and a separate test compares all fixture lane pairs with single-expansion cooperative yields. Every run has1,600tasks/results/cleanup calls and checksum4,300.42declared primary/top-level source files are byte-archived under route-source with end drift verification; source closure is explicitly unverified. Sample ownership is4,480bytes.

Median p95per16routebatch off/on: synchronous search0.0188/0.0202ms, queue admission0.1268/0.0988ms, four-tick scheduler processing0.1467/0.1298ms. These are separate measured regions and cannot be summed into a combined percentile. Processing includes owner test callbacks and scheduling of16actors; this is added pipeline cost on a tiny synthetic graph, not implemented045routing/gameplay or a throughput/FPS gate. Newfixture test/scopedlint/formatPASS. All source archive folders use `* -text` to preserve exact bytes through Git.

At this original capture stage, headed frame comparison was unexecuted. The later full headed results are reported separately below; original CPU reports remain unchanged.

## Corrected-core recapture after independent review

The review corrections reject a cached different target while an actor already owns pending work and attempt safe own-data disposal for a malformed returned task.23targeted tests, typecheck, scopedlint/format pass. Scheduler SHA256 f33fa5e1d8360953b94d74008e6ac407a1ea90c4dc71b6ebc9fb192dbdb3d1bd is now frozen for024hardwareclosure. New reports live under corrected-core; root original reports plus134declared byte archives were also copied unchanged to review-pre-fix.

Corrected after has five observer pairs,47declared archive inputs and21.876seconds summed workload wall time. Median tickp95 off/on is0.5019/0.5393ms normal70 and2.0094/1.8801ms dense110, versus original before1.8465/1.8045 and6.1717/6.1143. Separate frame-admission medians are1.6782/1.6377normal and5.6170/5.3365dense; these are not added to tick percentiles. All ten actor/session/epoch/tick identities and exact total callback/checksum counters match the original before. This remains unpaced CPU characterization, not full-game/FPS acceptance.

Corrected route-cost has44declared input archives; off/on medianp95 rawsearch0.0174/0.0155ms,16jobadmission0.0990/0.1005ms andfourtickprocessing0.1170/0.1444ms, kept separate. Corrected memory has5declared archives,20resetcycles+onefinaldispose,1300created/1300disposedtasks,1280successfulresults,allfinalownership counterszero; forcedGCprocessheapdelta+418136bytes is diagnostic. Capture-end source drift guards pass. The later independent archived-byte recheck passed all96inputs. Full headed captures were subsequently completed, as reported below.


## Resumed verification

The independent archived-byte recheck is now PASS for all96declared corrected-core inputs:47after,44route-cost and5memory. Their current source hashes also match. [Exact verification](corrected-core/independent-archive-verification.json) preserves each expected/archive/current hash without rewriting historical captures.

On resume,23targeted reference/scheduler/route tests PASS in392.3936ms; scoped browser-binding format/lint and full typecheck PASS. The dedicated production physical fixture builds successfully (982modules,818ms Vite build) and serves local HTTP200; the empty resume endpoint returns an empty run list. [Non-UI check record](resumed-nonui-checks.json) identifies80build inputs/source hash/artifact hash. These checks do not execute browser rendering, GPU or hardware frame measurement. The production core remained unchanged for the later full headed captures below.

## Full headed hardware results

WEBGPU capture[20261005T152901307Z](hardware/20261005T152901307Z/webgpu-independent-verification.json) and WEBGL2 capture[20261005T170121469Z](hardware/20261005T170121469Z/webgl2-independent-verification.json) both PASS_FULL_EARLY_FIXTURE. Each has20non-smoke runs (five observer pairs per arm), actual30second warmup and120second measurement, simulation/actual wall ratio at least0.9999766672,300exactly matching fixed physical-tick command/pose/event checkpoints and zero post-dispose owned resources. Both actual Chrome154 backends used AMD RX7900XTX hardware at CSS/internal1920×1080,DPR1,fixed early MEDIUM presentation. Source995b6fba…f78bcb3/artifact78402253…1dc50/commit4096b8d identify the same80source inputs and141emitted artifacts.

Median of five run percentiles, milliseconds; all detailed per-run ranges remain in the captures:

| Backend / observer | Reference framep95/p99 | Phased framep95/p99 | Reference mainp95/p99 | Phased mainp95/p99 |
| --- | --- | --- | --- | --- |
| WEBGPU / off | 7.0 /7.1 | 7.0 /7.1 | 4.6 /5.8 | 4.5 /4.9 |
| WEBGPU / on | 7.0 /7.1 | 7.0 /7.1 | 4.5 /5.8 | 4.5 /5.0 |
| WEBGL2 / off | 7.0 /7.1 | 7.0 /7.1 | 4.5 /5.4 | 4.0 /4.4 |
| WEBGL2 / on | 7.0 /7.1 | 7.0 /7.1 | 4.2 /5.3 | 4.0 /4.4 |

No absolute frame/main-thread budget failure, measured Long Task or confirmed >10%AND>1msp95regression in3/5paired repeats was observed. WEBGL2 preserves one18.6msframe, with zero frames>25ms; it remains within the specified percentile budgets. WEBGL2 observer-on optional authoritative-fixture tickp95median is4.5msreference→3.6msphased. Available asynchronous GPU timerp95medians are0.0248msreference/0.02988msphased; first fresh boundary results were discarded. WEBGPU GPU timer support was unavailable. Exact page memory and outstanding native query count are unavailable, never zero. Observer deltas/ranges remain visible; negative deltas reflect run variation.

These measurements cover the early actual physical/controller/context fixture. Routing remains synthetic, obstacle/zone context incomplete and045policy/economy/learning absent. They do not approve the whole-game5.5mstick budget, complete gameplay or laptop performance. The Node chronological before remains separate from the postimplementation headed reference control. Startup CIM/power identity is not continuous thermal/power telemetry. [Protocol, reproduction and delivery status](hardware-plan.md).

Final delivery verification: durable141-artifact ZIP plus original manifest verified byte/SHA-exact. Default current-source and explicit historical archive modes both PASS for both captures. `npm run check` exits0 with416/416tests and typecheck/lint/format/architecturePASS. [Final check record](final-checks.json). Production core and original performance evidence remain unchanged; coordinator owns physical board transition and publication.

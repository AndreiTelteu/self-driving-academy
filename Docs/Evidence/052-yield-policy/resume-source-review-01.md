# PBI052 independent resume source review 01

Scope: source and evidence reads only, 2026-10-07. Verified worktree Git root `F:/Sites/self-driving-academy/.worktrees/yield-policy-01` and branch `loop-pbi/yield-policy-01` first using the explicitly required read-only Git identity commands. Canonical PBI/AGENTS.md and PBI/In Progress/052-auto_yield.md were read as task data, along with module06, Docs25, manifest203, yield-policy, behavior/priority/scheduling contracts. No tests, builds, formatter, server, browser, native/world imports, installs, profiles, board changes or Git mutations were executed. This is the sole new file. Other authors and026/UI ownership are unchanged.

## Result

One concrete collector/verifier window mismatch is supported by the original full-run prefix. It would prevent full acceptance independently of the later stall. No source-supported cause of the actual1658.6ms RAF-await stall was found. These are separate findings; neither licenses a retry, baseline replacement, dropped intervals, relaxed gates or PBI completion.

## F1: nominal RAF warm boundary can precede actual native boundary by more than the permitted four ticks

`tests/browser/yield-policy-v6/main.ts:254` collects measured native costs only after tick1800. `runtime.ts:248-251` stamps actual native ENTRY before tick1801 with completed controller tick1800. However `main.ts:323-339` starts measured RAF collection at nominal `firstWall + 30000`, retaining the preceding RAF as `previousRaf` without checking its counter proximity to ENTRY. `tests/browser/yield-policy-v5/clock-proof.ts:118-120`, used by V6 full verification, requires that preceding counter be within four of ENTRY.

Original arm4 metadata has previousRaf controller1789/native1969 at stamp565711.3, read565716.5ms; ENTRY controller1800/native1980 at565953.1000000238ms. Difference11 violates the existing lower bound1796. Raw first frames independently confirm controller1793,1797,1801,1805,1808; native1973,1977,1981,1985,1988. RAF stamps565884.9,565940.6,565954.3,565961.3,565975.2; first interval173.59999999997672ms. Each of the first three counter advances is four, yet the start endpoint is eleven ticks before the native measurement phase. The collector permits accumulating debt below250ms, while the full proof additionally demands near-aligned window endpoints. The collection condition alone cannot ensure that latter contract.

This is a necessary full-proof failure if this prefix were retained in a completed arm, established by reading the predicate and raw values, NOT by executing the verifier on an incomplete arm. It is not evidence of an eleven-tick jump per frame and not an explanation for the later stall. Do not trim this prefix, replace previousRaf with a later counter, widen the four-tick allowance or fabricate phaseCompletion. Earlier173.6/55.7ms intervals also remain real evidence; their causes are unknown.

Smallest useful source follow-up: add a pure regression for this window mismatch and a bounded fail-fast diagnostic using the EXACT existing +/-4 ENTRY/previousRaf predicate once both real observations exist. Retain the attempted prefix and real counters in failure export. This only reports an already-required rejection earlier; it does not repair scheduling or make this workload PASS. A broader pacing/window redesign needs root review first, with all original intervals and gates preserved.

## F2: V6 await read is not a timestamp taken inside the RAF callback

`main.ts:21` passes Promise resolve directly to requestAnimationFrame; `main.ts:280-286` reads performance.now and actual counters after await resumes. Thus callbackReadMs is an await-continuation/counter-read timestamp. The source cannot distinguish RAF callback delivery delay from delay before that continuation. The later isolation diagnostic records callbackMs inside the callback (`raf-scheduling-diagnostic/main.ts:112-117`), so it has different observation semantics. This is a diagnostic limitation, not a newly proven cause or justification for changing clocks. Even without that distinction, original RAF stamps themselves advanced1660ms; the true gap cannot be removed by relabelling the continuation clock. No additional instrumented run is recommended in this round.

## F3: failed V6 partials omit longtask observations

`main.ts:149-183` partialSnapshot excludes longTasks; lifetime disconnects the observer at199, before catch snapshots at469. No takeRecords call appears in V6. A failed-arm export therefore cannot establish absence of longtasks overlapping the gap, even if some observer callbacks had already run. The separate diagnostic does drain takeRecords before disposal and exports bounded entries. This supports an evidence-coverage limitation, not GC/OS/compositor attribution. No product fix follows from it.

## Original failure identity and timing

Evidence base `Docs/Evidence/052-yield-policy/browser-v6-20261006T135845838Z/captures/WEBGPU-full/` below is relative to the verified worktree. Capture0760154a-973b-4a07-9b53-07494e6f98fd started2026-10-06T14:08:09.508Z; failure exported14:10:07.870Z. REFERENCE arm4/controller3801/native3981,2001 measured ticks,3204 recorded frames, missing completion/report/terminal PASS.

WaitStart599198.2000000477 -> continuation read600856.8000000715 =1658.6000000238419ms. Target599199.7000000477; guard600856.9000000954 -> debt1657.2000000476837ms. Before/after native3981/controller3801 are unchanged. Prior stamp599191.1 -> triggering stamp600851.1 =1660ms; triggering stamp -> continuation5.7000000715ms. Previous completed render599196.5 ->599198.2000000477 =1.7000000477ms; last four native costs2.1/1.8/1.8/1.5ms. Debt guard throws BEFORE triggering render/raw append, so last raw RAF stays599191.1; the triggering observation survives in diagnostics. Cleanup actual native, renderer delta, backend ownership are zero. Original failure remains FAIL.

Build metadata: source42c5e0472119f2dd5410f0466493a7e18e3058c1edb4038344fd73ec82b0b206; artifactb9e052acc67fe40acf04f90b52337004d78a4d2035abb2effe007aa19061bee8; commitddc35dc3aad3e5f0366b4c7731bb37331b8ffd77. Existing parent record reports ZIPc4f6116ffe527ca5c0568b42a58f83336c9fd54d5ce25b705dfb916bb269a2b4; this round did not rehash the ZIP or rerun build verification. Current and captured three source files were independently byte-hashed and match:

- main.ts:88d7d802f58ba2d94a03efec59030ebc61c62885bc6567c916d9d366241aee47
- runtime.ts:1a1a8ba8b0c7d282731dd6aea8a9a1668ab81e9a516d940d4107c2f3047b9287
- diagnostics.ts:daf5b6a657c2bfa74d71c3a4dcc66484df2e5a2b1834ad833bb61f0309a8cf11

Actual raw SHA256 re-read this round (filenames relative to the full evidence base):

```text
failure.json 3fc4e54abdcd09cf272e6cade1f395f0b5df242bd020af5bc954f597276348c5
incomplete-arm-4.json a1ac457229c335ea5d48b37de0c461ae75cab31bdcb9da31ffd6bdbd58540d8e
submitted-arm-4.json 0087617760860c78c09c38be8b78f397ab2fb65e891babfce2d438938634d7c2
arm-4-controllerTick-0.json 5b7dd6d472530cc4ac9f98652889e43968fd8f91ced45ae8b60c7f8fd2b1832b
arm-4-controllerTick-1.json 087fbb28a4f0d80587782d64915a279c206b28c29b8558626e6bd7df8b81900a
arm-4-frame-0.json eeac0b75d53914e75c3ea1c5e1e1f7e5257fd755e80c46c593296a0a93384e37
arm-4-frame-1.json c97cc776d344121ed6f2dcaf5ea67339228c8b103d2fb91ce0e02d911bbc7cfc
arm-4-main-0.json 01586e28cbf173256405a181000404421058655c7d275973fa82b7f2ce412d3e
arm-4-main-1.json dde4e3ad446b3e9c261525ff5575db9e0e6ffdb17214211279c4ed54258cc997
arm-4-nativeSerial-0.json 6a9f19966e18261ba8831f93172e76bd3ea9a753a43c92aa3fffa71b3c24c25e
arm-4-nativeSerial-1.json c2bfc5be98faba3ca1eec3fd9c5aed7356f911900495c2dd43dfb84d38f240c5
arm-4-policy-0.json 4e0d5a5a9d79959567e9bb8656cb99786e0eed8b78c3a8930d9c21e7e637a61e
arm-4-rafReadTime-0.json 0705ef0046367378d8fd3ca931e0b9be39ee50b09430b273d2eaef50d8dc70e2
arm-4-rafReadTime-1.json 676b3bca2677b738e9b2686b7fbc782b489b942db3596e0f5aaff23319144625
arm-4-rafTime-0.json 704aae97cb1302b10daa92d3fe6709efdc1af0ffaa2dd05e7bc7463326c08d5d
arm-4-rafTime-1.json 6c17f8f6e5fa0f7d1aa5ca807ae75d7a081ef4a67fdb8232e4cda4f5c14efa67
arm-4-step-0.json 33543a85d3b11c2611a62372bf0a8211ec4ff8e8d484cb3381ff816be0bd86e5
arm-4-tick-0.json ef8470ecc6dbe34f2293fe17f21e02efb86f32115e1fd1c621f2f237b06cacae
```

## Separate diagnostic: actual raw inspection

Base `Docs/Evidence/052-yield-policy/raf-scheduling-20261006T150911155Z/captures/`. AUTO/submitted.json SHA256cc21d718a51797e9c453c46e776e29326061385b7ff5ea8ea9d2e0df7c443b7d, capture4912b69e-577d-48ee-a2a5-f75ed432c948,17279waits. WEBGL2/submitted.json SHA2565012eb8d278b4e4df946c546de963863f72abbf221b67f38fe36a29d4142fa2a, capturef741ebce-73df-4e98-bdc3-5cd4aecf7974,17282waits. Both COMPLETE_DIAGNOSTIC, no error/overflow; no performance/full acceptance.

Actual maxima: AUTO38.90000009536743ms in EMPTY_RENDERER (request189211.89999997616, callback189250.80000007153); WEBGL2 12.700000047683716ms in RAF_ONLY (317893.89999997616 ->317906.60000002384). AUTO longtasks empty; WEBGL2 single62ms task392980.7000000477 at physical setup, before nativeanchor393043.3000000715. Existing parent phase summary reports native maxima13.3/12.3ms and actualzero cleanup. Each phase is40s; native phase2400ticks, versus original stall at3801 (~63.35 simulated seconds). Scene/materials and observation overhead differ. Therefore these diagnostics do not exclude duration-dependent effects or establish a cause. No GC/OS tracing is available. The068 repeated-stamp fix does not explain this positive1660ms stamp advance or1658.6ms actual await.

## Gates and root handoff

Keep Doc25/manifest203 and V6 checks unchanged:250ms debt/max4 recovery; no dropped physics ticks/dt changes; raw positive delta<=250; warm-boundary +/-4 actual counters; both native and matchedRAF simulation/wall>=0.98;30s warm+120s measured,5alternating pairs/backend on real foreground hardware at1920x1080/DPR1. Full p95 frame18.5/main10/tick5.5/step3ms; framep99 25ms; supported steady longtask max50ms; >=3/5 regressions exceeding BOTH10% and1ms fail, absolute gates still apply. Actual cleanup/parity/source/artifact/raw identity remain mandatory. GPU/heap/WASM unavailable remain null. Smoke/isolation are not full acceptance. PBI052 stays In Progress.

Root's smallest next action is source-only review of F1, followed by a separately authorized pure regression and exact-predicate fail-fast change. Suggested future workload AFTER that source change and a CPU/test grant, explicit working directory as above:

```powershell
node --import ./scripts/register-typescript.mjs --test tests/browser/yield-policy-v5/clock-proof.test.ts tests/browser/yield-policy-v6/diagnostics.test.ts
```

These two suites are pure; no server/build/native worlds/browser required. Add a complete synthetic warm-boundary case with ENTRY1800 and previous1789, max4 consecutive admissions, retaining the captured prefix, so rejection names the existing boundary predicate rather than an unrelated incomplete-report error. Also cover inclusive +/-4 and fail-fast diagnostic export. This command was NOT run. No full-run command is proposed; actual stall causality remains unresolved. Root owns any further CPU/browser/UI authorization and foreground coordination.
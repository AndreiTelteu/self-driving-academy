# Independent full WEBGL2 verification

Result: **PASS_FULL_WEBGL2_EARLY_FIXTURE**. Capture `20261005T170121469Z` completed at `2026-10-05T17:51:24.802Z`. The user had manually started this capture before this test child took monitoring ownership. No UI input, activation, navigation, restart, duplicate capture, build or additional benchmark was issued. Only sparse read-only `@oai/sky` observations and saved-file checks were used. Final Chrome accessibility observation showed WEBGL2 and “Early fixture frame PASS; both arms preserved exact physical checkpoints and cleanup. Evidence saved.”

The evidence-only [verifier](webgl2-independent-verifier.mjs) executed successfully with Node. Its [independent JSON report](webgl2-independent-verification.json) retains every actual run metric, optional GPU/tick distributions, observer deltas, semantic checkpoints, cleanup counts and report hashes. All 25 original JSON exports/manifests were reparsed and their recorded hashes rechecked without mismatch after verification. Existing exports were not modified.

Identity: commit `4096b8d83b6399a01e7bf0db16b28e5faae32479`; source `995b6fbaa5d2f9cd42bca0bac4c9dc70f2dac89df85ae92c3705b7f14f78bcb3`; artifact `784022537c183d72b1c001e243fc16b5dc573f7834e7e3747a8b4beb4d51dc50`. All 80 frozen archived source files match current bytes and reproduce the aggregate source hash. All 141 production artifact byte lengths and SHA256s match; the artifact manifest reproduces its aggregate hash.

Actual renderer: Chrome 154, WEBGL2, `ANGLE (AMD, AMD Radeon RX 7900 XTX (0x0000744C) Direct3D11 vs_5_0 ps_5_0, D3D11)`, vendor `Google Inc. (AMD)`. No software renderer. CSS/internal resolution both 1920×1080, DPR 1, fixed MEDIUM early-fixture preset, adaptive quality false. Server-startup CIM identifies Ryzen 9 7950X3D, RX 7900 XTX driver 32.0.31041.1004, 48 GiB installed RAM, Windows 11 Pro build 26200 and Balanced power. CIM display refresh is 144 Hz at 3840×2160; this is distinct from the fixed 1080p canvas.

All 20 runs are non-smoke: five alternating observer-off/on pairs per arm, actual RAF clock. Warmups span 30.0004–30.006202 seconds; measured RAF spans 120.0023–120.0028 seconds; performance-clock measurement spans 120.0027–120.0086 seconds. Simulation/actual RAF wall ratio is 0.9999766672–0.9999808337, above 0.98. Each run retains 70 physical vehicles, 60 Hz controller participation and running final state. Successful full exports and the frozen protocol's latched blur/visibility and per-RAF backend/status guards provide foreground/device/overload evidence; sparse observations are not an external continuous OS focus trace.

All 300 checkpoints match exactly across 10 corresponding cross-arm pairs (command, pose and authoritative-event digests at the same physical ticks). Each run disposes its world and returns every recorded scheduler, collision, subscription, vehicle, mesh and GPU-instrument ownership count to zero. No failure export exists in this capture. The earlier failed smoke remains preserved separately.

Median of five run percentiles, milliseconds:

| Arm | Observer | Frame p95/p99 | Main-thread p95/p99 | Optional tick p95/p99 | GPU timer p95/p99 |
| --- | --- | --- | --- | --- | --- |
| UNPHASED_REFERENCE | off | 7.0 / 7.1 | 4.5 / 5.4 | unavailable | disabled |
| UNPHASED_REFERENCE | on | 7.0 / 7.1 | 4.2 / 5.3 | 4.5 / 4.9 | 0.0248 / 0.03708 |
| ENTITY_PHASED | off | 7.0 / 7.1 | 4.0 / 4.4 | unavailable | disabled |
| ENTITY_PHASED | on | 7.0 / 7.1 | 4.0 / 4.4 | 3.6 / 4.1 | 0.02988 / 0.03728 |

Frame p95/p99 are 7.0/7.1 ms in every run, within 18.5/25 ms. Main-thread p95 ranges 3.8–4.6 ms, within 10 ms. Long Tasks support was available in every run: zero measured entries, maximum 0 ms, no overflow. One frame exceeds 18.5 ms: ENTITY_PHASED repeat 2 observer-off, 18.6 ms; zero frames exceed 25 ms. This isolated frame is preserved and does not exceed the percentile acceptance thresholds. No absolute budget failures or confirmed >10% AND >1 ms p95 regression in at least 3/5 corresponding runs. All 10 individual cross-arm pairs also remain below the regression condition.

Observer main-thread p95 deltas range −0.7 to +0.1 ms in the reference arm and −0.1 to +0.2 ms in the phased arm; all frame p95 deltas are zero. Observer-on owns 960000 additional diagnostic bytes per run. Negative paired deltas are run variation, not proof that instrumentation improves performance. GPU query samples are available on WEBGL2, asynchronous fresh counters with the first boundary sample discarded; they are not correlated to the current CPU frame. Pending native query count and exact page memory remain unavailable, never reported as zero. All per-run distributions and ranges remain in the JSON.

Scope limits: this is the early physical 70-car/67-obstacle fixture with actual 024 controller, native Rapier, 028 collision guard/bus, 036 signals and 044 context. Route work is synthetic 033 search, 045 policy is absent and obstacle/zone context remains incomplete. It approves no whole-game 5.5 ms authoritative tick budget, full-game FPS, economy/learning implementation or laptop hardware. Startup hardware/power identity is not continuous thermal/power telemetry. The chronological preimplementation Node baseline remains distinct from this postimplementation headed reference control.

CPU and browser ownership are released to the parent after this terminal verification. No pending runs or monitor loop remain. Chrome stays open; production server 5195/session68863 stays available. Parent may now guide the user's 025 manual keyboard testing. Board, Git, production sources, barrels and thresholds were untouched; no PBI Done claim or commit is made.

Verifier SHA256: `f0ebf15bf2ed09a526f6ae28dbce2041640e4e00ca1aa9889c5b3fdcebd7c430`.

Independent JSON SHA256: `9cf28ad9b0ca6501a652bda2b0e2c46e0561b85211fe0355ca65b77a4a49331e`.

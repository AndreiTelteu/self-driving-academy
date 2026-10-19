# AFTER026 single-capture test handoff

One authorized current native benchmark ran once, exit 0. Terminal NATIVE_NUMERIC_PASS; independent offline readNative(freshCapture) and verifyNativeParity review passed. No retry.

Source SHA256: c293c6f8baa9ec4279793a53a4a1c70d920976fe3cdb1208f6678852cec146a0
Report SHA256: 290484a09790afb731bc461917877fffaf4ff16a90b757d3e99a03d50fcf9fe8
Capture: after-cleanup-current-20261007-r1
Checkout: F:/Sites/self-driving-academy/.worktrees/wheel-dynamics-01; loop-pbi/wheel-dynamics-01; e52e10b1170db7b8882d6581bdbd4027d2149fb6.

Archive completed 2026-10-07T03:11:08.693Z before first native factory attempt at 2026-10-07T03:11:08.782Z. All ten attempt timestamps are distinct and serial. All 80 local closure inputs match current and archived bytes. Installed/archive native SHA256 02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0, 4340292 bytes.

All ten arms preserve original BEFORE commands/input and physical hashes; 70 cars, 134 bodies, 138 colliders, 180 warmup + 600 measured ticks (780/world), unchanged original fixed-60Hz fixture. Observer order alternates OFF/ON, ON/OFF across five pairs. Seven channels x 600 samples, 33600 bytes per observed arm; unobserved samples/timings remain empty/null.

All ten raw exports have complete accepted tick counts, no failures, exact report/raw bindings, independently recomputed p50/p95/p99, and exact cleanup: zero entities/subscriptions/vehicles/obstacles/colliders, disposed true, disposed read rejected true.

| Pair | Tick p50/p95/p99 ms | Projection p50/p95/p99 ms | Tick p95 delta ms | Projection p95 delta ms |
| --- | --- | --- | --- | --- |
| 0 | 1.0628/1.5225/1.6750 | 0.1969/0.3418/0.4996 | -0.0559 | 0.2159 |
| 1 | 1.4219/1.5537/1.6916 | 0.2982/0.3644/0.5079 | -0.0977 | 0.2311 |
| 2 | 1.4136/1.5153/1.6860 | 0.2950/0.4199/0.5189 | -0.2152 | 0.2787 |
| 3 | 1.4170/1.5771/1.6529 | 0.2953/0.3986/0.5176 | -0.0338 | 0.2699 |
| 4 | 1.4179/1.5234/1.6511 | 0.2934/0.4031/0.4914 | -0.0488 | 0.2770 |

All five tick p95 values pass 5.5ms absolute budget. Original combined relative gate (>10% AND >1ms, confirmed in 3/5) has 0/5 confirmations for tick and projection. Projection relative growth is recorded in review-result.json and remains below the original absolute-increase gate. No thresholds changed.

All 169 protected evidence files and the 12 R13 source pins remain exact. R13 manifest SHA256 97423a252a30b0da28386f7072776e1f98ad0447d3bb9c0af5b83ddcb0baa8b5; sorted diagnostic source hash 2472850dd87db3ac827d1238a46b253f4ee50fed66fd8250c8e78baef790a28a. Initial preflight used unsorted manifest order for the diagnostic aggregate and failed; corrected read-only sorted check matched, without native execution or byte changes.

First stdout/stderr preserved exactly. Stderr contains only the actual Node experimental stripTypeScriptTypes warning. Execution command, grant, timestamps, exit and finally-removal recorded in execution-start.json / execution-result.json. Offline reader code and results recorded in review-command.json / review-result.json / review-exit.json.

STOPPED after capture and read-only result review. Process environment grant removed. Calibration needs a separate grant after root actual-results review. Current pins remain null. No calibration, full current verifier, build, browser, CIM, worker, server, board or Git writes; no children.

Native CPU numeric evidence only: hardwareAcceptance false. No browser/frame/FPS/exact RAM claim. Original BEFORE raw timings unavailable under its original protocol. BrowserCaptureLifetime String(error) unresolved for later browser phase. Root owns board/shared Docs/Git and future pins. PBI026 remains incomplete.
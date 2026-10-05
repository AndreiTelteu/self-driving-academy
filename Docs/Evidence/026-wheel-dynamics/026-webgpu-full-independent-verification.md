# 026 WebGPU full independent verification

Outcome: **FAILED_EXPORT_NO_HARDWARE_ACCEPTANCE**. Full AUTO run started 2026-10-05T18:27:24.211Z; terminal failure 2026-10-05T18:52:24.772Z (1500.561 seconds). Actual UI: `FAILED: Error: Export rejected:`.

Immutable failure: `failed-1791226350773-WEBGPU.json`, SHA256 `04a2e6fc94b115115719b1eaf2e15adfe0bba88d9eb2a994cf16a47a8697bfcd`. No drive-webgpu.json exists; no numeric hardware PASS or pair comparison is claimed. WEBGL2 was not started. CPU/browser are released; existing server and Chrome tab remain available.

All 61 actual worktree inputs equal their archived bytes. Current and archived source SHA256: `cdebe6b592537af721d4b4df078fa0eca5ac9d2fa2b74262538e0f5185157e17`. All 142 generated artifacts verified; aggregate SHA256: `74205905d835de75673d39c25ae89184df1a9c9c650e82849ee2fe19472d0b68`. Build HEAD: `4096b8d83b6399a01e7bf0db16b28e5faae32479`. Exact build-manifest.json and hardware.json provenance copies were preserved without changing the original files.

Likely export failure: server body cap is 262656 bytes; equivalent eight archived native calibration curves alone serialize to 443569 bytes. The server returns an empty 413 when this cap is exceeded. HTTP status was not observed, so this cause is a source-backed inference. The full browser payload and its metrics were not persisted.

Reaching export implies completion of the ten awaited 30s/120s arms and eight browser calibration calls according to the verified source, including foreground, overload and native cleanup guards. This does not recover the exact sample counts, simulation ratios or timing percentiles. Browser calibration is eight 20m/s scenarios; the separate historical native calibration has 28 scenarios.

- Failure export contains identity/error/hardware only; numeric arm/calibration results were lost from durable evidence.
- Renderer WEBGPU is preserved; native GPU selection cannot be independently proved because getInfo output is absent from the failure envelope. CIM identifies RX7900XTX hardware but does not prove adapter selection.
- CSS1920x1080/DPR1 startup check must pass to reach export, but numeric resolutions are absent from failure envelope.
- Current fixture exports p50/p95/p99/max/count only, not individual overbudget frame counts or distributions. They cannot be recovered from this export and no values are invented.
- Cleanup guards verify native entity/collider ownership zero before each arm resolves; visual mesh disposal is performed but no per-run disposed counters are exported.
- Chronological CPU baseline and 28-scenario calibration remain separate evidence; this round creates no chronological hardware BEFORE and no browser physical checksums.

Remaining work belongs to the parent/implementation agent: repair evidence export and retention in a new source-bound artifact, preserve this failed capture, then perform a newly authorized full hardware round. This test agent changed only evidence files and did not rebuild, restart, retry, alter sources, move the board, commit or push.

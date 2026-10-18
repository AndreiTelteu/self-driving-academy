# PBI052 V7 short browser smoke — 2026-10-18

`SMOKE_ATTEMPTED / NOT ACCEPTED`. Operator-requested short smoke (Smoke1/3) for the distinct V7 collector
on the AMD machine. Three fresh V7 fixture sessions were served on `127.0.0.1:5217` with headed Chrome
(CDP, dedicated profile, `--force-device-scale-factor=1`, DPR 1, actual AMD Radeon renderer, foreground
`document.hasFocus()`). No build/product source was edited for these runs; the collector is the V7 source
verified by `v7-collector-scoped-checks-01`.

All runs share one build identity (source `7e0ae331…`, artifact `f427ed4e…`); each session re-ran the Vite
build so each produced its own `hardware.json` timestamp and therefore its own ZIP hash.

| Session folder | Captures | Result |
| --- | --- | --- |
| `browser-v7-20261018T192001395Z` | `WEBGPU-smoke`, `WEBGL2-smoke` | WEBGPU **FAIL** (arm 10, ratio), WEBGL2 COMPLETE |
| `browser-v7-20261018T192656329Z` | `WEBGL2-smoke` | WEBGL2 **COMPLETE** (14/14) |
| `browser-v7-20261018T193106239Z` | `WEBGPU-smoke` | WEBGPU **FAIL** (arm 11, debt) |

Archive identities: `browser-v7-20261018T192001395Z-archive.json` (zip `2149b8fa…`),
`browser-v7-20261018T192656329Z-archive.json` (zip `569eb4ed…`),
`browser-v7-20261018T193106239Z-archive.json` (zip `ddc7c6ab…`).

## WEBGL2 smoke — all 14 arms complete (twice)

Both WEBGL2 attempts saved 4 calibration plus 10 measured arms with no failure/rejected marker. Measured
arms (1 s warm + 3 s measured, 70 cars): native ratio 1.0031–1.0092, matched-RAF ratio 0.9982–1.0040,
`simulationToActiveWallTime` 0.9982–1.0040, worst RAF->render debt ≈ 14.5 ms, overload 0, actual zero
cleanup. This clears the automated smoke gates; it is a DEV integration signal only and carries no
performance acceptance.

## WEBGPU (AUTO) smoke — failed twice on timing gates

- Session 1, arm 10 (`current`, pair 2): the pre-existing `052 native phase simulation/wall ratio` gate
  rejected the arm. `nativePhaseRatio 0.976181` / `matchedRafRatio 0.976805` for 180 native ticks over
  3073.2 ms (≈58.61 Hz). The other nine arms were 0.9984–1.0086, so this was an isolated cadence dip, not a
  systemic shortfall. The V7 `warmBoundary` diagnostic reported `WITHIN_EXISTING_BOUNDARY`, i.e. the V7
  fail-fast predicate itself passed.
- Session 3, arm 11 (`current`, pair 3): the harness guard `Simulation overload debt after RAF before
  render` fired. The partial diagnostic records `rafAttempt.debtMs 524.6` (budget 250 ms) with
  `previousRaf.nativeSerial 321` at `tick 142`. The ten preceding arms were clean (debt ≤16.3 ms).

The two failures are in different gates, so this is not one reproducible defect; on this machine the
WEBGPU/AUTO path intermittently stalls the render step. WEBGL2 stayed clean in every run.

## Verification status

No first-class verification is possible for these smokes as captured:

- `tests/browser/yield-policy-v7/verify.mjs` requires a **full** session inventory — its
  `validateCaptureInventory` (v5 protocol) needs 2–4 attempts that include both `WEBGPU-full` and
  `WEBGL2-full`. Running it on the WEBGL2-only session fails with `052 capture inventory capacity`.
- The established V6 precedent for smokes is a hash-guarded derived reader
  (`verify-v6-smoke-only.mjs`) that requires **exactly** `WEBGPU-smoke` and `WEBGL2-smoke` in one folder,
  both complete. WEBGPU never completed a smoke here, so that precondition cannot be met either.

The captures are therefore preserved as diagnostic evidence, not as a verified PASS. No smoke criterion,
performance acceptance or hardware acceptance is claimed; GPU/heap/WASM unavailable values stay null.

## Environment (from each session's `build-manifest.json` hardware block)

AMD Ryzen 7 7735U (8C/16T), AMD Radeon(TM) Graphics (driver 32.0.12019.1028, 1920×1200@60),
16 GiB LPDDR5-6400, Windows 11 Home 26300, mains power (battery 79 %), power scheme High performance.
Chrome 155.0.8059.84. Single 1920×1080 DPR-1 canvas, 70 physically simulated cars.

## Preservation

The failed WEBGPU captures keep `failure.json` (and `rejected.json`/`submission-rejected-*.json` where the
host gate fired); nothing was trimmed, padded, relabelled or deleted. The immutable historical V2–V5
failure captures were not touched. `v7-collector-scoped-checks-01` remains the only verified V7 result.

## Reproduce

Driver: `drive-smoke.mjs` (copied into this folder) selects the backend and Smoke1/3 on the served page and
waits for `SMOKE SAVED`/`FAILED`. Fixture: `node --import ./scripts/register-typescript.mjs
tests/browser/yield-policy-v7/server.mjs 5217` from the `yield-policy-01` worktree, with
`.pbi-validation-052-v7` absent, then a headed Chrome with a remote-debugging port.

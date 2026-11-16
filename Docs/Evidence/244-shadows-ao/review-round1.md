VERDICT: APPROVED

## Blocking findings
None.

## Non-blocking notes
1. `src/rendering/babylon/city-scene.ts` (pushPrism comment, ~line 239) cites `tests/rendering/building-normals.test.ts`, which does not exist. The test lives in `tests/rendering/shadows.test.ts` ("pereții clădirilor au normale spre exterior"). Fix the comment.
2. `src/rendering/babylon/ambient-occlusion.ts:119-120`: `_clearColor` is private and guarded only by `if (clear)`. If a Babylon upgrade removes it, the sky silently gets maximum AO. The comment and PBI say it is "covered by test", but no test touches `_clearColor`. Add a one-line assertion that `_clearColor` exists on a created GeometryBufferRenderer, so an upgrade fails loudly.
3. The cache criterion is reworded and honestly judged. The RENDER_ONCE-with-invalidation cache works: 250 renders of 665 frames at idle. While driving, the map is rendered every frame, with the cost reported (+1.3 ms HIGH, +0.7 ms MEDIUM). Acceptable under the reworded text. The PBI checkbox is still unchecked, which is honest.
4. The qa:v3-validation report is stale, as expected (orchestrator regenerates it at integration).
5. The taxi is nearly black (palette 247). Its shadow and AO are barely readable on it, but this is out of scope for 244.
6. The MEDIUM character shadow on the sidewalk is soft and low-resolution, with a slightly smudgy AO patch at the feet. It is acceptable.

## Verification
- **Visual (my own captures, 1920x1080, WebGPU, amd rdna-2):**
  - HIGH: 15 views. MEDIUM: 4 views.
  - Shadows are soft and grounded for lamps, hydrant, trees, benches, the character and the cars.
  - Building faces light correctly: the sun-facing wall is lit and the far wall is shaded, with a ground shadow at the base.
  - No acne or peter-panning, and no dark halos or dirty edges from AO. The sky is not dimmed.
  - I did not re-run the live 360 degree rotation. I rely on the implementer's `rotation-stability.json` and the unit test (0 sub-texel drift, mathematically sound).
- **Normal flip:** I derived it from Babylon's ComputeNormals formula (cross(p1-p2, p3-p2)). The old winding gave inward normals and the new winding gives outward ones, matching the renders. `pushPrism` has a single caller (`city-scene.ts:658`) and only affects rendering. Collision and the simulation use footprints, not mesh winding. The unit test checks that no wall vertex has an inward normal.
- **Budget:** HIGH 6.81 ms and MEDIUM 5.71 ms (mean frame cost on the same probe, before and after) are far below the frameP95 budget of 18.5 ms (`Docs/performance-budgets.json`). MEDIUM, the default preset, is fine. LOW grows only +0.27 ms. The harness shows cpu 3-8 ms. The 30 ms "frame" figure in the HIGH capture log comes from headless pacing, not render cost.
- **Memory:** The live `gpuBytes` is 100,663,296 (96 MiB), computed as 4x 2048^2 x 6 B (2 B colour + 4 B depth). That is reasonable for HIGH on a desktop GPU. AO adds about 16 MiB.
- **Leaks (live, `?debug`):** 30 preset switches (10 cycles of MEDIUM/LOW/HIGH). The engine texture cache went 21 -> 20. Meshes (90), materials (33) and pipelines (2) were unchanged. The console showed 0 errors.
- **Contract 157:** `SHADOW_MAP_CONTENT` was changed coherently (the `essential` priority is kept and there is a separate static cap of 192). `perf:render-budget --check` is current and the 157 tests are untouched. The docs are honest about the limits.
- **Checks run:**
  - typecheck, lint, format:check and check:architecture all pass.
  - `npm test`: 3509/3509 pass.
  - `qa:v1-regression --check`: current, 0 FAIL, 2 NOT_RUN (frame p95 rows).
  - `v2:contexts --check`: PASS.
  - `qa:v3-validation --check`: all commands PASS, report stale (expected).
  - `perf:render-budget --check`: current.
  - `Validate-Plan.ps1` ran and I read its tail, which reported no errors.
- The preview server on 4411 and the browser are stopped.

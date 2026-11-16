VERDICT: APPROVED

Review round 1, PBI 243.

## Blocking findings
None.

## Non-blocking notes
1. Darkness is understated in the docs. The 241 vs 243 values in Docs/30-calitate-vizuala-v4.md give asphalt 44,50,62 -> 36,43,54 (-18/-14/-13%), grass B 44 -> 36 (-18%), sidewalk -7/-8%. The real range is 7-18%, not "7-13%". Visually the frames are not murky (the sky is much richer; the ground is slightly duller), so this is not blocking. Easy fix: raise `legacyAmbient.intensity` (atmosphere.ts:238) to about 0.58-0.60, or drop the sky tint, to restore 241 brightness. Correct the number in the docs and the PBI.
2. The cost claim "at the limit of noise" is false for some views. street-eye-level HIGH: 1.37 [1.15-1.38] -> 2.18 [2.14-2.40] ms, and LOW: 0.98 -> 1.88 ms. The ranges do not overlap, so this is a real +0.8-0.9 ms. The 5-view mean (+0.16 / +0.26) is hidden by the "horizon" view, which gets faster (-1.16 ms). The absolute cost is acceptable, but the doc text (perf-summary.txt, Docs/30) must say so honestly.
3. MEDIUM has no clouds: sky band 114,154,208 vs HIGH 133,167,212. Acceptable. LOW is 10-15 steps brighter (no vignette or grading, inherited from 241). Documented.
4. There is no test for IBL texture disposal on preset switching (`setPreset` -> `buildEnvironment`). Reading the code, it is correct: previous.dispose() runs, the dome and ShaderMaterial are disposed. Could not check via browser (the scene is not exposed).
5. The `noon[1] < -0.999` test in atmosphere.test.ts is weak. The IBL polynomial and the cube faces are checked only for self-consistency with Babylon's tool.

## Points checked
1. Darkness: compared 241 vs 243 frames (street, HIGH WebGPU). The sky and horizon are clearly better; the ground is 7-18% darker but readable. Not blocking.
2. Presets: MEDIUM sky is simpler but clean. Acceptable.
3. IBL: face orientation in `cubeTexelDirection` matches Babylon's CubeMapToSphericalPolynomialTools (right/left/up/down/front/back) exactly. Up = sky, down = ground; the probe spheres show the sky above and the ground below, and the sun glow on the right side. I did not test WebGPU probe spheres myself (no scene access in the production build); the capture on WebGPU and WebGL2 gave identical sky values.
4. Shader: no console warnings or errors on WebGPU or WebGL2 (HIGH, `?capture=1`) or in my own session on MEDIUM WebGPU. The sun disc is derived from the same direction as `daylight-sun` (test checks this).
5. Fog: all materials are StandardMaterial (grep of src); the dome has applyFog=false. LOW: the image is applied once by the materials and by the sky shader itself (uSkyParams.z), consistent with the fog colour handling.
6. Frozen materials: `material-refresh.ts` is correct; the shared state per scene avoids early refreezing; materials created later are compiled with the current scene state. No per-frame allocations.
7. Stale `qa:v3-validation`: I regenerated it into a temp dir and diffed. The only difference is the figure "3490 teste, 3490 trecute" -> "3498 teste, 3498 trecute" (report.json:269). The input is the test count: PBI 243 added 8 tests (tests/rendering/atmosphere.test.ts). No input file hash changed. The report must be regenerated (`npm run qa:v3-validation`) after the final test count.

## Checks run
- typecheck, lint, format:check, check:architecture: pass.
- npm test: pass (3498/3498 as part of the v3 report run).
- qa:v1-regression --check, v2:contexts --check, assets:manifest --check, perf:render-budget --check: current.
- qa:v3-validation --check: stale (see 7).
- Validate-Plan: passes.
- Production build + preview on 4391: game plays (WebGPU, character, car, fog, sky); console clean. Server stopped, browser closed.

## Side effect to be aware of
My regeneration run of the v3 report (to find the stale input) re-ran `perf:gate --measure`, which rewrote `Docs/Evidence/201-v3-validation/gate-measure/{measurement,report}.json|md`. They show as modified in git status. The report.json/report.md of 201 were NOT touched (written to a temp dir). Regenerate 201 or restore those files before commit.

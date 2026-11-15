VERDICT: CHANGES_REQUIRED

## Blocking

1. LOW preset looks broken and inconsistent with MEDIUM/HIGH (`src/rendering/babylon/post-processing.ts:122-124`, LOW path, materials apply tone mapping).
   - Scenario: in the same view at 1920x1080 on WebGPU, `__v3Composition.setPreset('LOW')` makes the asphalt pure black, the buildings near-black brown, the grass near-black olive and the sidewalk beige-grey. On MEDIUM/HIGH the same scene has a navy-dark asphalt, a brown building, mid-green grass and a cream sidewalk.
   - Two colour pipelines give two different looks (LOW is much murkier and darker than the 239 baseline). This contradicts "a single pipeline, same image". The luminance check compared WebGPU with WebGL2 only, never LOW against HIGH.
   - Expected fix: calibrate LOW (the clear colour, exposure, or the sRGB/linear handling of the material path) so it is within a reasonable distance of MEDIUM/HIGH. Add a LOW-vs-HIGH luminance comparison to the evidence.

2. The asphalt is too black on MEDIUM and HIGH too (see point 4 below), and the lane markings show a glow halo.
   - Scenario: the default game preset is MEDIUM, and the asphalt and the car body are near-black navy. The baseline 239 asphalt was dark slate with visible detail. The markings show a bright yellow halo; they are not emissive, and the bloom is meant for "strong emissive sources".
   - Expected fix: raise the road albedo or the exposure now, or raise `bloomThreshold` so that diffuse markings do not bloom. Deferring the road to 245 is not enough when the road got darker than the baseline.

3. The criterion "quality settings from the menu change the pipeline live" is not wired up.
   - A menu component exists (`createGameSettingsPanel` in `src/ui/game-settings.ts`) but it is not mounted anywhere (grep over `src`: only the `ui/index.ts` export). `main.ts` mounts only `createRenderingView` and `createDiagnosticsPanel`.
   - In the played game the only controls are Pornește, Pauză, Reîncarcă and the Diagnostic `<summary>`.
   - So no reachable menu exists, which is not a failure of this PBI. But the PBI checkbox claims "menu", and the only path is the debug global, which the player cannot reach. Either rephrase the criterion in the PBI as "applyPreferences path verified, menu not yet mounted" and leave the box unchecked with the reason, or wire the existing `settings.quality` change path to `applyPreferences` (and to the preset used by `adaptive`).

## Non-blocking

- Debug global (`src/main.ts:303-307`): `setPreset` and `scene()` are not gated (no `import.meta.env.DEV` or `?capture`), so they ship in production. `setPreset` is presentation only (no authority write), but `scene()` exposes the whole Babylon scene. The doc comment "read-only diagnostics, no authority writes" is still true for authority, but it should be updated, and the access should be gated on DEV or `captureConfig`.
- `setPreset` does not update `settings.quality`, so a later `observe()` or reload can disagree with the displayed preset.
- `dispose()` in `post-processing.ts:216` restores only part of the configuration (it does not restore vignetteWeight, colorCurves or ditheringIntensity). Harmless in one scene, but incomplete.
- The default game preset is MEDIUM, so the player sees FXAA, not MSAA 4x.
- The HIGH/MEDIUM PNGs are ~1.6 MB, above the 600 KB target (admitted by the implementer).

## Verified

- Applied exactly once: `imageProcessingByPostProcess` is false only on LOW and true on MEDIUM/HIGH; tone mapping is enabled. No parallel configuration remains (daylight.ts diff).
- Leaks: 20 live switches in my own browser on WebGPU gave the same counts as the baseline (LOW 0 textures, 2 internal, 1 pp, 0 pipelines; MEDIUM 1/10/0/1; HIGH 1/9/0/1). `releasePasses` disposes the pipeline and the FXAA pass. A resize does not rebuild the pipeline.
- Per-frame allocations: none in the new code (`getState` is called only by debug, capture and tests).
- Console: 0 errors, 0 warnings.
- The 3 new tests are real and are not weakened.
- The sidewalk is now cream, not white; whites went from 0.96% to 0.07% (as the implementer reports).
- Checks I ran: typecheck, lint, format:check, check:architecture, qa:v1-regression --check, v2:contexts --check: pass. Validate-Plan: pass. `npm test`: 3458/3458. `vite build`: OK.
- Not independently re-measured: perf numbers (I did not repeat the interval probe); WebGL2 visuals (I checked WebGPU only).
- Servers stopped and browser closed.

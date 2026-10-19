# Evidence PBI 204

Status: INCOMPLETE. The native three-taxi/two-civilian fixture, the 218/219/221 first-loop probe and the interactive browser playtest page are executed. The five real playtest participants are still missing, so no criterion that depends on participant data is closed.

- `checks.md`: executed static checks and exact outcomes for stages 3 and 4.
- `tests.md`: executed deterministic scenario and behavioural fixture results.
- `probe.md`: the earlier generic-probe attempt and the fixture-specific 218/219/221 measurement.
- `behavior/`: native behavioural driver output (`driver.json` + `summary.md`) for prudent, risky, no-evidence and MANUAL.
- `loop-probe/`: `PROVISIONAL_UNCALIBRATED` 218/219/221 measurements on the 204 fixture (`probe.json` + `summary.md`).
- `playtest-dev/`: two **developer self-test** runs of the interactive page (LEARNING and MANUAL), labelled “developer self-test, not a participant”; contains the JSON exports, result-panel screenshots and `summary.md`.
- `playtest/`: intentionally empty until five real participant sessions are exported.

The behavioural driver is [early-loop-204-fixture.ts](../../../tests/harness/early-loop-204-fixture.ts) and its tests are [early-loop-behavior.test.ts](../../../tests/learning/early-loop-behavior.test.ts). The probe scripts are `scripts/run-204-early-loop-behavior.mjs` and `scripts/run-204-loop-probe.mjs`.

The interactive page is [early-learning-playtest.html](../../../tests/browser/early-learning-playtest.html) with [early-learning-playtest.ts](../../../tests/browser/early-learning-playtest.ts) and the pure session model [early-playtest-session.ts](../../../tests/harness/early-playtest-session.ts). It is served by `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort` at `/tests/browser/early-learning-playtest.html`, without a build. It drives the real 025 keyboard path, 085-style tick facts, 093 ledger, 094/095/098 estimators, `composeEarlyLoopProfile` and `compileEarlyLoopControllerProfiles`, then hands the same car to AUTO with the compiled 046/047/051 values. MANUAL produces zero evidence. The scene is the documented simplified straight corridor; it is not the full game.

The playtest protocol is [early-playtest.md](../../early-playtest.md). No browser, GPU or FPS measurement is implied by the native behaviour fixture; the loop probe is Node CPU on a synthetic clock. The developer self-test is not a participant and its answers describe only the developer run. Zero participants exist.

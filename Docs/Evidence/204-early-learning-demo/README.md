# Evidence PBI 204

Status: INCOMPLETE. The native three-taxi/two-civilian fixture and the 218/219/221 first-loop probe are executed. The five real playtest participants are still missing, so no criterion that depends on participant data is closed.

- `checks.md`: executed static checks and exact outcomes for this stage.
- `tests.md`: executed deterministic scenario and behavioural fixture results.
- `probe.md`: the earlier generic-probe attempt and the fixture-specific 218/219/221 measurement.
- `behavior/`: native behavioural driver output (`driver.json` + `summary.md`) for prudent, risky, no-evidence and MANUAL.
- `loop-probe/`: `PROVISIONAL_UNCALIBRATED` 218/219/221 measurements on the 204 fixture (`probe.json` + `summary.md`).
- `playtest/`: intentionally empty until five real participant sessions are exported.

The behavioural driver is [early-loop-204-fixture.ts](../../../tests/harness/early-loop-204-fixture.ts) and its tests are [early-loop-behavior.test.ts](../../../tests/learning/early-loop-behavior.test.ts). The probe scripts are `scripts/run-204-early-loop-behavior.mjs` and `scripts/run-204-loop-probe.mjs`.

The playtest protocol is [early-playtest.md](../../early-playtest.md). No browser, GPU or FPS measurement is implied by the native behaviour fixture; the loop probe is Node CPU on a synthetic clock. Zero participants exist.

# Behavioral and adapter evidence for PBI 204

Status: the native three-taxi/two-civilian fixture is executed. The five-participant playtest is still missing.

## Commands

```text
volta run --node 24.21.0 --npm 11.19.0 -- node --import ./scripts/register-typescript.mjs --test tests/learning/early-loop.test.ts
volta run --node 24.21.0 --npm 11.19.0 -- node --import ./scripts/register-typescript.mjs --test tests/learning/early-loop-behavior.test.ts
volta run --node 24.21.0 --npm 11.19.0 -- node --import ./scripts/register-typescript.mjs scripts/run-204-early-loop-behavior.mjs
```

Results: `early-loop.test.ts` 3/3 PASS; `early-loop-behavior.test.ts` 5/5 PASS; the driver wrote `behavior/driver.json` and `behavior/summary.md`.

## Native fixture

The fixture is [early-loop-204-fixture.ts](../../../tests/harness/early-loop-204-fixture.ts): three taxis and two civilians on the authored 044 road context. Episodes are recorded through the real 093 ledger and consumed by the 094/095/098 estimators; the resulting candidates are blended by `composeEarlyLoopProfile` and compiled by `compileEarlyLoopControllerProfiles` into 046/047/051. The base profile is `speed_delta_urban=0`, `desired_acceleration=1.5`, `stop_full_probability=0.6`.

| Set | 046 target (m/s) | 047 acceleration (m/s²) | 051 canonical | 051 full-stop rate |
| --- | ---: | ---: | --- | ---: |
| prudent | 9.75 | 1.35 | APPROACH / FULL | 29/40 (72.5%) |
| risky | 10.5 | 2.0 | ROLL_THROUGH / ROLLING | 22/40 (55.0%) |
| no-evidence | 10.0 | 1.5 | APPROACH / FULL | 26/40 (65.0%) |

The five actors receive identical compiled token values: 046 target and 047 acceleration agree within `1e-9`, and 051 uses the same seed and opportunity so the FULL/ROLLING role is identical. Sedan and compact classes change the throttle command only. MANUAL returns `null` for the early profile and the controller tokens, observes zero episodes and leaves all 80 profile values unchanged (maximum delta 0). No-evidence leaves every key at its base value (`candidate=null`, `blend=0`) and reproduces the base profile numerically.

The five tests fail on plausible wrong implementations: evidence applied without the 25% blend, MANUAL leaking tokens or values, a key compiled without behavioral effect, and an unchanged key being modified. The mixed-key fixture asserts each demonstrated key moves only its own 046/047/051 metric.

This is a deterministic native fixture. It is not a browser, GPU, FPS, gameplay or participant result, and it does not close the playtest target. Zero participants exist.

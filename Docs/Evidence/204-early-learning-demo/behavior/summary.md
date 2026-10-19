# PBI 204 native behavioural driver

Label: `EXECUTED_NATIVE_FIXTURE`. Fixture: `204-early-loop-fixture-v1`. Commit: `0b785f78afc132add7bd0e45425d6b9955600d58`.

Real chain: 093 ledger -> 094/095/098 estimators -> `composeEarlyLoopProfile` -> `compileEarlyLoopControllerProfiles` -> 046 cruise target / 047 longitudinal / 051 stop policy, on the authored 044 road context with three taxis and two civilians. No renderer, Rapier, browser or participant data is involved.

## Blended values

| Set | Key | Evidence | Episodes | Candidate | Quality | Base | Blended | Blend |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| prudent | `speed_delta_urban` | READY | 3 | -1 | 1 | 0 | -0.25 | 0.25 |
| prudent | `desired_acceleration` | READY | 3 | 0.9 | 1 | 1.5 | 1.35 | 0.25 |
| prudent | `stop_full_probability` | READY | 4 | 1 | 1 | 0.6 | 0.7 | 0.25 |
| risky | `speed_delta_urban` | READY | 3 | 2 | 1 | 0 | 0.5 | 0.25 |
| risky | `desired_acceleration` | READY | 3 | 3.5 | 1 | 1.5 | 2 | 0.25 |
| risky | `stop_full_probability` | READY | 4 | 0.25 | 1 | 0.6 | 0.5125 | 0.25 |
| no-evidence | `speed_delta_urban` | NO_EVIDENCE | 0 | null | 0 | 0 | 0 | 0 |
| no-evidence | `desired_acceleration` | NO_EVIDENCE | 0 | null | 0 | 1.5 | 1.5 | 0 |
| no-evidence | `stop_full_probability` | NO_EVIDENCE | 0 | null | 0 | 0.6 | 0.6 | 0 |

## Behavioural effect

| Set | 046 target (m/s) | 047 acceleration (m/s2) | 051 canonical | 051 full-stop rate |
| --- | ---: | ---: | --- | ---: |
| prudent | 9.75 | 1.35 | APPROACH / FULL | 29/40 (72.5%) |
| risky | 10.5 | 2 | ROLL_THROUGH / ROLLING | 22/40 (55.0%) |
| no-evidence | 10 | 1.5 | APPROACH / FULL | 26/40 (65.0%) |

Base profile (no early tokens): 046 target 10 m/s, 047 acceleration 1.5 m/s2, 051 full-stop rate 26/40 (65.0%).

## Same style on all five actors

| Set | Actor | Kind | Class | 046 target | 047 acceleration | 051 probability | 051 canonical role |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| prudent | taxi-01 | TAXI | sedan | 9.75 | 1.35 | 0.7 | FULL |
| prudent | taxi-02 | TAXI | sedan | 9.75 | 1.35 | 0.7 | FULL |
| prudent | taxi-03 | TAXI | compact | 9.75 | 1.35 | 0.7 | FULL |
| prudent | civil-01 | CIVIL | compact | 9.75 | 1.35 | 0.7 | FULL |
| prudent | civil-02 | CIVIL | compact | 9.75 | 1.35 | 0.7 | FULL |
| risky | taxi-01 | TAXI | sedan | 10.5 | 2 | 0.5125 | ROLLING |
| risky | taxi-02 | TAXI | sedan | 10.5 | 2 | 0.5125 | ROLLING |
| risky | taxi-03 | TAXI | compact | 10.5 | 2 | 0.5125 | ROLLING |
| risky | civil-01 | CIVIL | compact | 10.5 | 2 | 0.5125 | ROLLING |
| risky | civil-02 | CIVIL | compact | 10.5 | 2 | 0.5125 | ROLLING |
| no-evidence | taxi-01 | TAXI | sedan | 10 | 1.5 | 0.6 | FULL |
| no-evidence | taxi-02 | TAXI | sedan | 10 | 1.5 | 0.6 | FULL |
| no-evidence | taxi-03 | TAXI | compact | 10 | 1.5 | 0.6 | FULL |
| no-evidence | civil-01 | CIVIL | compact | 10 | 1.5 | 0.6 | FULL |
| no-evidence | civil-02 | CIVIL | compact | 10 | 1.5 | 0.6 | FULL |

Tolerance: numeric style values must agree within 1e-9; STOP outcomes use the same seed (1) and opportunity, so the role must match exactly. Sedan and compact mechanics change the throttle command, not the learned style.

## MANUAL

- `earlyLoopForMode('MANUAL', ...)`: null
- `compileEarlyLoopControllerProfiles('MANUAL', ...)`: null
- Evidence episodes observed in MANUAL: 0
- Profile values before/after identical: true
- Maximum parameter delta: 0

## No evidence

| Key | Candidate | Blend | Blended value | Base |
| --- | --- | ---: | ---: | ---: |
| `speed_delta_urban` | null | 0 | 0 | 0 |
| `desired_acceleration` | null | 0 | 1.5 | 1.5 |
| `stop_full_probability` | null | 0 | 0.6 | 0.6 |

AUTO with no evidence is numerically identical to the base profile: every parameter, unit and provenance entry matches, and the five actors reproduce the base 046/047/051 outputs. The compiled `versionId` still carries the in-memory `-204-early` suffix; that is an identity marker, not a value change.

## Mixed evidence (unchanged-key guard)

| Demonstrated key | 046 target | 047 acceleration | 051 full count | Unchanged keys |
| --- | ---: | ---: | ---: | --- |
| `speed_delta_urban` | 9.75 | 1.5 | 26/40 | `desired_acceleration`=1.5, `stop_full_probability`=0.6 |
| `desired_acceleration` | 10 | 1.35 | 26/40 | `speed_delta_urban`=0, `stop_full_probability`=0.6 |
| `stop_full_probability` | 10 | 1.5 | 29/40 | `speed_delta_urban`=0, `desired_acceleration`=1.5 |

The unchanged keys keep `candidate = null`, `blend = 0` and the exact base value; the tests fail if a default or reused candidate moves them.

## Reproduce

```text
volta run --node 24.21.0 --npm 11.19.0 -- node --import ./scripts/register-typescript.mjs scripts/run-204-early-loop-behavior.mjs
volta run --node 24.21.0 --npm 11.19.0 -- node --import ./scripts/register-typescript.mjs --test tests/learning/early-loop-behavior.test.ts
```

Deterministic native CPU fixture. It is not a browser, GPU, FPS, gameplay or participant result, and it does not close the five-participant playtest target.

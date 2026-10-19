# PBI 101 — profile blend, adaptation and recent memories

Implemented `blendProfileValue`, `PROFILE_BLEND_POLICY` and the provenance contract in
`src/learning/profile-blend.ts`, exported through `src/learning/index.ts`. The module composes 100
evidence assessments with the current profile value using

```
newValue = oldValue + learningWeight × (estimate − oldValue)
```

and returns an immutable in-memory candidate. It never publishes a profile or delta, never labels a
value `LEARNED`, and never writes 092 `implemented`/`estimable`.

## Weight and recency rules

`learningWeight = min(cap, quality × E/(E+4) × recencyFactor × contradictionFactor)`:

- `quality` is the 100 assessment quality (0 for `UNOBSERVED`/`WEAK`).
- `E` is `effectiveEpisodeCount`; `E/(E+4)` gives 0.2 for one effective episode, 0.43 for three
  and 0.75 for twelve.
- `recencyFactor` is the exposure-weighted mean of `max(0.05, 0.5 ^ (ageSeconds / 86 400))`, so
  recent episodes dominate while very old evidence keeps a 5% floor.
- `contradictionFactor` is 1 for `NONE`, 0.5 for `MODERATE`, 0 for `SEVERE`.
- The hard cap is 0.6 per update; fewer than two effective episodes are capped at 0.15.

Recency representatives mirror the 100 effective count: frames of one `opportunityId + occurrence`
keep the largest exposure, correlated groups collapse to the best-exposed member, and each
representative contributes `min(1, observedTicks / minimumEpisodeTicks)` to the recency average.

## Behavioural evidence

`tests/learning/profile-blend.test.ts` (12/12):

- One full 600-tick speed episode moves a 1.5 m/s profile only to 1.875 m/s (`weight 0.15`), less
  than a quarter of the 2.5 m/s gap. A weight equal to plain quality would jump to 4.0.
- Sixteen consistent episodes apply the full 0.6 cap (1.5 → 3.0 m/s vs 1.875 for one episode) and
  four chained updates converge to 3.97. A constant small weight or one ignoring the effective
  count fails.
- Three sufficient zero observations produce `estimate = 0`, resolution `APPLIED` and a real move
  from 1 to ~0.57. Skipping falsy estimates leaves the value unchanged.
- `UNOBSERVED` and `WEAK` keep the exact old value with `HELD_UNOBSERVED`/`HELD_WEAK`, weight 0 and
  `changed: false`.
- Values 1.0/7.0/4.0 on `curve_lateral_accel` are `SEVERE`: the 2.5 value stays, weight is 0, the
  interval `[1, 7]` is retained and no averaged point is exposed.
- A moderate following spread applies a reduced step (weight ~0.13) with resolution
  `APPLIED_WITH_INTERVAL` and interval `[1, 2]`; ignoring the extra penalty would apply ~0.26.
- A consistent risky `curve_lateral_accel` value moves 6.5 → 6.65 instead of shrinking toward the
  2.5 default; an established extreme speed style (12 m/s) survives a single low 2 m/s episode at
  10.5 and returns above 12.3 after consistent evidence. Pulling toward a safe base fails.
- Twelve 30-day-old episodes (weight 0.0375) move far less than twelve fresh episodes (weight 0.6)
  while still moving slightly, and the style-change scenario reaches 3.37 from a 3.0 old habit
  after three updates with a 3.4 estimate. Ignoring age makes both weights identical.
- The update/history chain keeps `sequence`, previous values, identity list, ages, weights and
  intervals; results and arrays are frozen with `published: false` and `learned: false`. The 092
  registry snapshot is unchanged.
- A 15 m/s estimate from 1.5 stops at 9.6 (not 15), proving the 0.6 bound; a 1000 estimate clamps
  to the 092 maximum 15 with `clampedToBounds: true`. Non-finite old values, negative ages and a
  foreign-key history are rejected.

## Contract

`UNOBSERVED` and `WEAK` leave the value unchanged; `ZERO` is applied as a real zero. `MODERATE`
contradiction halves the step and keeps the interval; `SEVERE` holds the value and the interval.
There is no regularization term toward a base or safe profile. Full rules and limitations are in
[profile-blend.md](../../profile-blend.md).

## Checks

Exact commands and results are in [checks.txt](checks.txt); test names are in [tests.txt](tests.txt).
Node 24.21.0 and npm 11.19.0 were selected through Volta. The full suite passed 1084/1084 (baseline
1072 plus twelve new tests). Typecheck, lint, format, architecture and parameter-catalog checks
passed.

## Limitations

The caller owns occurrence identity, exposure ticks, correlation groups and the clock behind
`ageSeconds`; the module cannot derive them from physics or geometry. The 24 h half-life, 5%
recency floor, four-episode saturation and 0.6/0.15 caps are starting calibration, not statistical
guarantees. There is no worker, persistence, live learning loop, profile publication, player-panel
integration, browser run or playtest. The module does not modify 092 and does not replace the 100
assessment or the 094–099 estimator contracts.

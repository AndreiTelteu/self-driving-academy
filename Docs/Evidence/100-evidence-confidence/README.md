# PBI 100 — evidence confidence V1

Implemented `assessEvidenceConfidence`, `summarizeEvidenceQuality` and
`assessEstimatorConfidence` in `src/learning/evidence-confidence.ts`, exported through
`src/learning/index.ts`. The layer consumes a 093 read model and real per-occurrence exposures and
returns an immutable quality/uncertainty assessment. It never publishes a profile or delta and never
sets 092 `implemented`/`estimable`.

## Behavioural evidence

`tests/learning/evidence-confidence.test.ts` (10/10):

- Twenty frames of one occurrence, `sampleCount = 1200`, produce `frameObservationCount = 20`,
  `distinctEpisodeCount = 1` and `effectiveEpisodeCount = 1`, so the key stays `WEAK`. Counting
  frames, 20 Hz samples or `observationCount` would report 20 or 1200 and fail. Three genuine
  occurrences produce an effective count of 3, proving the effective count is exposure-weighted
  occurrences, not samples.
- Three distinct occurrences correlated to one leader encounter collapse to one effective episode
  and stay `WEAK` with `CORRELATED_EPISODES_REDUCED_EFFECTIVE_COUNT`. Counting occurrences without
  correlation would pass the threshold and fail.
- A 300-tick speed episode is 5 s against the 600-tick (10 s) threshold, contributes 0.5 and stays
  `WEAK` with `SHORT_INTERVAL_BELOW_MINIMUM_EXPOSURE`. A full 600-tick episode is `OBSERVED`.
  Treating any non-empty interval as sufficient fails.
- Four sufficient zero observations produce `ZERO` with `value: 0` and `zeroObserved: true`; no
  evidence produces `UNOBSERVED` with `value: null`; one episode produces `WEAK`. Collapsing zero
  into unobserved or weak fails.
- Six episodes split between 0.8–1.0 s and 4.7–5.0 s produce a `SEVERE` contradiction, interval
  `[0.8, 5]`, state `WEAK` and `value: null`; the candidate average 2.9 s is never returned.
  Averaging contradictory values away fails.
- A moderate 1.5–2.5 s dispersion stays `OBSERVED` but returns interval `[1.5, 2.5]`,
  `uncertainty: HIGH` and reduced confidence. Hiding dispersion behind a point value fails.
- Accepted and refused gaps delimit `[3, 5]` without contradiction; overlapping accepted/refused
  gaps (`max refused 6 > min accepted 5`) are `SEVERE` and `WEAK`.
- Same-speed following evidence fails `VARIED_SPEEDS_REQUIRED`; missing episode detail is `WEAK`
  with `MISSING_EPISODE_EXPOSURE`; mismatched detail is `WEAK` with `EPISODE_DETAIL_MISMATCH`.
- Thresholds cover exactly the 24 M keys, keep the 093 gates (600 ticks for speed, 30 ticks
  elsewhere, varied speeds for following) and are frozen.
- The real 099 estimator integrates through the structural adapter: three optional completed
  manoeuvres yield an `OBSERVED` front-gap candidate, while the unmeasured cooldown stays `WEAK`.
  Every assessment is frozen, `published: false` and `unchanged: true`.

## Effective-count rule

1. Merge frames by `opportunityId + NUL + occurrence`, keeping the largest measured exposure.
2. Collapse episodes with the same `correlatedWith` group (otherwise the occurrence identity) to
   the best-exposed member.
3. Weight each representative by `min(1, observedTicks / minimumEpisodeTicks)`.
4. Sum the weights into `effectiveEpisodeCount`; `sampleCount` is reported only for contrast.

## Contract

The four states are `UNOBSERVED`, `WEAK`, `ZERO` and `OBSERVED`. Severe contradictions, short
exposure, correlated collapse, missing varied speeds and estimators without a value are `WEAK`.
Accepted/refused overlap is `SEVERE`; moderate dispersion is reported as an interval with `HIGH`
uncertainty. Full rules and limitations are in [evidence-confidence.md](../../evidence-confidence.md).

## Checks

Exact commands and results are in [checks.txt](checks.txt); test names are in [tests.txt](tests.txt).
Node 24.21.0 and npm 11.19.0 were selected through Volta. The full suite passed 1072/1072 (baseline
1062 plus ten new tests). Typecheck, lint, format, architecture, parameter-catalog and the dedicated
test file all passed.

## Limitations

The caller owns occurrence identity, exposure ticks and correlation groups; the layer cannot derive
them from physics or geometry. The contradiction fractions are an explicit policy over the 092
parameter range, not statistical significance. The 30-tick exposure floor and all 093 thresholds
remain provisional for calibration. No statistical confidence interval, bootstrap, worker,
persistence, live learning loop, profile publication, browser run or performance probe is included.

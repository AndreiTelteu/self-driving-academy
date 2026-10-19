# PBI 096 — following estimator evidence

Implemented `estimateFollowingParameters` in `src/learning/following-estimator.ts`. The result is candidate-only, immutable, and uses the 093 evidence specs as the sole source of minimum-episode thresholds. No profile, parameter delta, publication, or activation is produced. 092 registry checks remain unchanged and refuse LEARNED publication for unsupported keys.

## Behavior evidence

`tests/learning/following-estimator.test.ts` (3/3):

- Varied moving speeds fit `gap = minimumGap + headway × egoSpeed`: synthetic truth 1 m and 1.5 s recovered exactly; RMS residual was 0 m. A plausible constant-value or swapped-intercept implementation fails these assertions.
- Three observations at the same speed produce `UNIDENTIFIED` with null values for both coefficients. Three stationary queue facts alone produce a 2 m `queue_standstill_gap`; they do not enter the moving fit. An implementation inventing a zero intercept or mixing queue and moving observations fails.
- A leader transition from `a` to `b` increments `leaderChangeSplits` and preserves distinct opportunity/leader episode identities. MANUAL context yields no candidate. Merging leaders or admitting foreign mode fails.

`following_speed_gain` accepts an explicit measured `speedGain` only; it is never inferred from the headway regression. Queue facts require both ego and leader at or below 0.1 m/s. Moving facts require both above 0.1 m/s.

## Commands

Node 24.21.0 / npm 11.19.0, installed by the mandated `npm ci` (249 packages added, zero vulnerabilities). Exact command results are in [checks.txt](checks.txt).

`npm test` passed 1043/1043: the 1037-test baseline plus six new estimator tests (three for 096 and three for 097). Isolated estimator tests passed 6/6. Registry tests passed 8/8, including unchanged 092 flags and refusal of LEARNED publication.

## Limitations

The ordinary least-squares fit is sensitive to outliers; RMS is diagnostic, not a confidence interval. `speedGain` and leader identity must be supplied by an authoritative producer. The estimator is not wired into the worker, live profile, or gameplay. No browser, GPU, FPS, or performance claim is made. Per orchestration instructions PBI files remain in their current columns; no board validator was run.

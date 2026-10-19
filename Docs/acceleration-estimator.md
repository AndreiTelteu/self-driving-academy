# Longitudinal estimator (PBI 095)

`estimateAccelerationParameters(evidenceReadModel, observations)` returns four frozen candidate
records only. It imports the exact 093 thresholds, context breakdown, status, and 092 parameter
definition limits. It has no profile, delta, publisher, or ledger mutation path; all 092
`estimable` flags remain false.

Each observation must join an 087 eligibility record, 088 artifact-filter result, and 089 normalized
record. Only complete, artifact-free `FREE_TRAFFIC`/`ELIGIBLE`/LEARNING windows with 089
`INTENTIONAL` features are preference samples. Collision/teleport/pause windows and all windows with
artifacts are counted and excluded. 089 `CAPABILITY_LIMITED` features are counted as lower bounds
and excluded. No impact impulse or saturation can increase preferred braking or jerk.

For acceleration, braking and lateral channels, 089 stores p90 fractions of realized SI demand over
the corresponding 023/085 class ceilings. Candidate acceleration and deceleration are computed from
these dimensionless fractions times the sedan reference ceiling, so equal normalized demand across
classes produces the same SI candidate; raw SI values remain available in 089 for diagnostics. Jerk
uses caller-provided tick-to-tick SI jerk samples. Candidates use nearest-rank p50 after trimming the
outer 10% at each tail and then clamp to the imported 092 interval. This median rejects isolated
outliers while retaining a consistent risky style. Confidence is 093 quality scaled by matching
window count; missing measurements remain `UNOBSERVED`/null. The result also returns per-class p50
normalized acceleration/deceleration/lateral demands and the corresponding raw SI p50 values, so
class capability differences remain inspectable.

Reaction delay requires 087's accepted `PreferenceEvidenceRecord` for the same window and an
observable stimulus. Its integer `reactionDurationTicks` is divided by 60, the exact fixed tick
resolution. Missing/unobservable stimulus produces no numeric sample; no frame-count or wall-clock
proxy is used.

Tests prove 20 hard-impact windows cannot change smooth deceleration/jerk candidates, equal normalized
sedan/compact demand yields the same 2.3214285714m/s² candidate, saturated lower bounds are excluded,
and a six-tick observed reaction is 0.1s while no stimulus remains null. These are synthetic
contract tests; no live wiring or hardware/performance claim is made.

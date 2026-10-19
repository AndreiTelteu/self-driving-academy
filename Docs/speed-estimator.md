# Speed estimator (PBI 094)

`estimateSpeedParameters(evidenceReadModel, observations)` returns a frozen candidate for each of
the four 094 keys. It never mutates the 093 ledger, produces a profile/delta, or publishes. Candidate
availability imports the exact 093 specs and requires its status `READY`; 092 `estimable` remains
false and the publication gate continues to reject `LEARNED`.

Only `FREE_TRAFFIC` + `ELIGIBLE` + learning-mode records with a matching 088
`PREFIX_ELIGIBLE` window contribute. Speed observations are tick-stamped and intersected with that
window's exact usable prefix; post-boundary samples are ignored. The estimator requires matching
window, segment, vehicle and incarnation identities across 087/088 and matching 089 identity when
normalization is supplied. The speed delta keys use the median of observed speed minus the posted
limit, separated by authored `URBAN`/`RESIDENTIAL` road kind. The approach key uses the median
observed speed on explicitly marked approaches. The curve
key uses `089 lateralDemand × that observation's class maxLateralAccelerationMps2`, only for an
intentional normalized 089 feature and known positive curve radius. This reconstructs a preferred
lateral acceleration from class-normalized demand; raw lateral acceleration alone is not used.
Values are bounded by the imported 092 definition. A missing sample remains null/`UNOBSERVED`, not
zero. Confidence combines 093 quality with matching sample coverage; context breakdown and distinct
episode count are returned verbatim from 093.

Constrained labels (including `LEADER`, `BLOCKED_GREEN`, `MECHANICAL_LIMIT`, `IMPACT`, pause/focus,
manual and auto) cannot contribute. The 093 read model already excludes 088-suppressed windows;
callers must supply only facts that formed that read model. `CAPABILITY_LIMITED` cannot supply curve
preference. Outlier rejection is not applied to speed because the estimator uses the deterministic
median; this limits single extreme samples. The 046 held-out projection is the documented exact
mapping `min(postedLimitMps + speedDelta, 30m/s)` for free-road cruise targets.

Tests prove a prudent `−1m/s` and risky `+5m/s` candidate from separate three-episode inputs yield
held-out projected targets 14 and 20m/s on a 15m/s road (6m/s difference), and a 28m/s leader-bound
sample produces no candidate. These deterministic synthetic results validate the estimator and
projection; they do not claim live gameplay integration.

# PBI 094 evidence

Implemented `estimateSpeedParameters` in `src/learning/speed-estimator.ts`. Its result contains
candidate-only values, status, confidence/quality, 093 episode counts and context breakdown. It does
not mutate the ledger or produce a profile/delta. 092 remains unchanged: all `estimable` flags are
false; the registry test confirms `parsePublishableDrivingProfile` rejects LEARNED for unsupported
keys.

## Behavior checks

`tests/learning/speed-estimator.test.ts` (2/2) proves three independent prudent episodes at 14m/s
versus 15m/s posted produce `−1m/s`, while three risky episodes at 20m/s produce `+5m/s`. On
independent held-out free-road input, the exact 046 mapping `min(postedLimit + delta, 30m/s)` yields
14m/s versus 20m/s, a **6m/s** target difference. A 28m/s `LEADER` observation produces no candidate.
The test's in-prefix samples at tick 100 are included while an exaggerated 1000m/s sample at tick
700 (past the 088 prefix) has no effect; a fully suppressed 088 window also produces no candidate.
The separate 046 suite validates the actual cruise target math, but this estimator test uses the
documented exact projection rather than running a new full driving fixture.

## Commands run (Node 24.21.0 / npm 11.19.0)

```text
volta run --node 24.21.0 --npm 11.19.0 -- npm run typecheck
PASS (tsc --noEmit; tests typecheck)

volta run --node 24.21.0 --npm 11.19.0 -- npm run lint
PASS (ESLint, zero warnings)

volta run --node 24.21.0 --npm 11.19.0 -- npm run format:check
PASS (all matched files use Prettier code style)

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:architecture
PASS (164 TypeScript files; 6 + 4 + 3 negative probes)

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:parameter-catalog
PASS (Parameter catalog is synchronized)

volta run --node 24.21.0 --npm 11.19.0 -- npm test
PASS (1037/1037 after both estimators were present; 094-specific tests 2/2)

volta run --node 24.21.0 --npm 11.19.0 -- node --import ./scripts/register-typescript.mjs --test tests/parameters/registry.test.ts
PASS (8/8; unsupported LEARNED publication is refused)
```

## Limits

No live estimator wiring, profile activation, browser/gameplay capture or performance probe is
claimed. Curve candidates require a real intentional 089 normalized feature and class ceiling; absent
context remains unobserved. Speed robustness is the median (nearest-rank p50), without a separate
outlier trim. The orchestrator explicitly prohibits board file moves, so the PBI remains In Progress.

# Behavioral and adapter evidence for PBI 204

Status: PARTIAL. No three-vehicle/civilian behavioral fixture has been executed yet.

Executed command:

```text
volta run --node 24.21.0 --npm 11.19.0 -- node --import ./scripts/register-typescript.mjs --test tests/learning/early-loop.test.ts
```

Result: 3/3 PASS. The checks cover the 25% × quality blend, unchanged values when evidence/provenance is missing, MANUAL helper no-op, and successful parsing by the real 046/047/051 profile validators. The controller boundary check confirms the values are exposed as `speed_delta_urban`, `desired_acceleration`, and `stopFullProbability`; it does not measure driving outcomes.

The requested 3 taxis + 2 civilians fixture, prudent/risky/no-evidence independent datasets, measured target-speed/acceleration/full-stop outcomes, common style adoption, and MANUAL zero-learning end-to-end comparison remain unrun. No behavioral number is claimed.

`npm test` completed with 1050/1050 passing (the 1049 stage-1 baseline plus this added adapter test).

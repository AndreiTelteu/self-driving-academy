# PBI 109 — profile imuabile și istoric versionat

Implemented the immutable versioned profile store in `src/profiles/profile-store.ts`, exported
through `src/profiles/index.ts`, with the canonical 102 wiring in `src/learning/profile-store.ts`
(`createCandidateProfileStore`). The store owns deep-frozen `ProfileVersion` records, derives
children only from an explicit parent and a validated delta, deduplicates interventions by
`segmentId`, bounds history per profile/globally and exposes `clear`/`dispose` with counters. It
never publishes a profile/delta, never writes 092 `implemented`/`estimable` and never marks a value
`LEARNED` or an activation.

## Contract

`createProfileStore({ engineVersion, validateDelta, maxVersions?, maxVersionsPerProfile?,
maxInterventions?, now? })` returns a frozen `ProfileStore`. `validateDelta` is a required port: the
102 validator lives in `src/learning`, which already imports `src/profiles`, so importing it back
would create a domain dependency cycle. `createCandidateProfileStore` supplies
`validateCandidateDelta` and is the production path.

- `createBase` creates `parentVersionId: null`, `depth: 0`, origin `BASE` and copies the full
  parameter map validated against the 092 registry.
- `derive` creates a child with an explicit `parentVersionId`, the store `engineVersion`, full
  parameter values and `provenance.delta` containing `baseVersionId`, `validationVersion`,
  `segmentId`, `interventionId`, `reason` and `changes` (`previousValue`/`newValue`/unit).
- `getVersion`, `listVersions`, `getHistory` return fresh deep-frozen copies. `getHistory` walks
  base → tip and is scoped to one `profileId`.
- `stats`, `clear`, `dispose` provide the lifecycle and counters.

Accepted results are `ACCEPTED` with `created`/`deduplicated`; failures are `REJECTED` with a closed
`rejection.code` and, for delta failures, the original 102 `deltaCodes`.

## Immutability rules

- Stored versions, parameter maps, provenance, change rows and id lists are `Object.freeze`d.
- Reads rebuild frozen copies (`getVersion` twice returns different objects with equal content).
- A parent is never edited: a change always produces a child; the parent keeps its values and
  checksum. Mutating a returned version or parameter map throws `TypeError`.

## Versioned history

A child always copies the parent's untouched values. Every recorded change stores the previous
value read from the parent, and `provenance.delta.baseVersionId` must equal the child
`parentVersionId`. A delta that declares another base is `DELTA_BASE_MISMATCH`; a key absent from the
parent is `DELTA_KEY_NOT_IN_BASE`, so a delta can never perform a hidden absolute replacement.
Checksums are deterministic FNV-1a 64-bit content hashes over sorted parameters and provenance;
`computeProfileVersionChecksum`/`verifyProfileVersionChecksum` are exported.

## Idempotency

Intervention identity is `segmentId`, scoped per `profileId`. Re-submitting the same base, engine
and key/value set returns `ACCEPTED`, `deduplicated: true` and the existing `versionId`; this works
with a new child `versionId` or a new timestamp, so a retry is safe. A known segment with a
different payload is `INTERVENTION_CONFLICT` and no second version is created.

## Closed rejections

`STORE_DISPOSED`, `VERSION_ID_DUPLICATE`, `PARENT_NOT_FOUND`, `PARENT_FOREIGN`, `PARENT_SELF`,
`ENGINE_VERSION_MISMATCH`, `DELTA_VERSION_MISMATCH`, `DELTA_BASE_MISMATCH`, `DELTA_INVALID`,
`DELTA_KEY_NOT_IN_BASE`, `INTERVENTION_CONFLICT`, `PROVENANCE_LIMIT`, `HISTORY_LIMIT`,
`INTERVENTION_LIMIT`. Structural request garbage throws `ContractValidationError`, matching the
other contracts.

The store also re-checks key, unit, range, duplicate keys and base membership after the injected
validator, so a rogue validator cannot inject a value outside the 092 contract.

## Evidence

`tests/profiles/profile-store.test.ts` (16/16). Tests intentionally fail for: mutable/in-place
versions, duplicate interventions creating a second version, a delta that loses its base, accepted
missing/foreign/self parents, accepted engine mismatch, unbounded history, lost lifecycle counters
and registry activation.

Full run: `npm test` → 1143 tests, 1143 pass, 0 fail (baseline 1127 plus 16 PBI 109 tests).
`npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:architecture` (179 TS
files) and `npm run check:parameter-catalog` all pass. Exact commands are in `checks.txt`;
per-test rationale is in `tests.txt`.

## Limitations

In-memory only: no persistence, IndexedDB schema, autosave or crash recovery (127/128). No
publication, `PROFILE_ACTIVATE`, tick propagation, `learningEpoch` barrier or fleet activation
(110/205); no worker or estimator integration; no browser/playtest or performance probe. History is
bounded by rejection, not archival or pruning. The checksum is an integrity fingerprint, not a
cryptographic signature. The PBI file was left In Progress: this work does not run board validators
or move the task to Done.

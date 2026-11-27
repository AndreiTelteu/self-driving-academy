# 273 — live learning pipeline

Deterministic report generated from the real 032/033 map, the real 272 telemetry writer, the real
103 queue/221 governor and the real 109/110 profile publication. It never writes XP and never
creates a second simulation, estimator or ledger.

## End-to-end result

| Fact | Value |
| --- | --- |
| Segment | `report-composed` |
| Key | `speed_delta_residential` (FREE_TRAFFIC) |
| Candidate | -2.1999998092651367 (CANDIDATE, READY) |
| Base version | `profile-v1` |
| Published version | `report-composed~112` (parent `profile-v1`) |
| Value | 0 → -0.33 |
| Activation | PENDING at tick 2, applied 2 |
| Fleet | profile-v1 → report-composed~112 |
| Profile fingerprint | `1c4d32b2f4e3829a` → `af1274c24a841c31` |
| XP fingerprint | `681271edaa4119b4e650abb07af84d335b2c4f691ec94fff5da1f54995bd201e` = `681271edaa4119b4e650abb07af84d335b2c4f691ec94fff5da1f54995bd201e` |
| Jobs / versions | 1 / 1 |

## Refusals

- MANUAL: SKIPPED_MANUAL; jobs 0, versions 0.
- Ineligible LEARNING: SKIPPED_INELIGIBLE; jobs 0, versions 0.
- No evidence: INSUFFICIENT_EVIDENCE; evidence NO_EVIDENCE, candidate REFUSED, versions 0.
- Foreign generation: STALE_JOB (EPOCH_MISMATCH); jobs 0, store versions 1.
- Restore: epoch 1 → 2, cancelled 1, late STALE_JOB, physical preserved true, fleet report-target-v2.
- Import: invalid REJECTED (epoch 1), valid PENDING (epoch 2), fleet report-import-v2.
- New profile: epoch 2, target report-new-profile-v2, fleet report-new-profile-v2.

## Checks

| Check | Verdict | Detail |
| --- | --- | --- |
| `contract-version` | PASS | pipeline contract |
| `manual-no-job` | PASS | MANUAL never reaches the queue |
| `manual-no-version` | PASS | MANUAL never produces a version |
| `ineligible-no-job` | PASS | ineligible LEARNING never reaches the queue |
| `no-evidence-status` | PASS | no evidence does not become a version |
| `no-evidence-version` | PASS | no version without evidence |
| `composed-job` | PASS | one eligible segment produced one job |
| `composed-version` | PASS | one immutable version was derived |
| `composed-parent` | PASS | explicit parent |
| `composed-activation` | PASS | common-tick command |
| `composed-applied-tick` | PASS | same tick |
| `composed-fleet` | PASS | one version across the fleet |
| `composed-fleet-version` | PASS | all vehicles use the published version |
| `profile-changed` | PASS | the immutable profile changed |
| `xp-unchanged` | PASS | 273 never writes XP |
| `stale-status` | PASS | foreign generation is stale |
| `stale-no-job` | PASS | a stale segment creates no job |
| `stale-no-version` | PASS | only the base version exists |
| `restore-epoch` | PASS | restore increments learningEpoch once |
| `restore-target` | PASS | target active |
| `restore-cancelled` | PASS | the in-flight 103 job was cancelled |
| `restore-late-version` | PASS | the late result published nothing |
| `restore-preserved` | PASS | no teleport or speed reset |
| `restore-late` | PASS | the cancelled job publishes nothing |
| `import-invalid` | PASS | invalid import has no effect |
| `import-invalid-epoch` | PASS | invalid import keeps the epoch |
| `import-valid-epoch` | PASS | valid import advances the epoch |
| `import-valid-target` | PASS | target active |
| `new-profile-epoch` | PASS | new profile advances the epoch |
| `new-profile-target` | PASS | new profile target active |

Summary: **30/30 PASS**.

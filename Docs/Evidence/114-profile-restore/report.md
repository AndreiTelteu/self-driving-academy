# 114 — Restore, import and new profile evidence

Contract: `114-profile-restore-v1`.

Deterministic report over the real 109 store, 110 activation and 205 learning epoch barrier; no browser capture and no wall clock.

## Contract

- statuses: COMMITTED, PENDING, ALREADY_ACTIVE, REJECTED
- provenances: RESTORE, IMPORT, NEW_PROFILE, RESET_STYLE
- barrier reasons: RESTORE=RESTORE, IMPORT=IMPORT, NEW_PROFILE=NEW_PROFILE, RESET_STYLE=RESTORE
- 110 origins: RESTORE=RESTORE, IMPORT=IMPORT, NEW_PROFILE=MANUAL_TUNING, RESET_STYLE=RESTORE

## Scenarios

| Scenario | Status | Reason | Version | Barrier | Activation | Versions | XP/mission calls | Pass |
| --- | --- | --- | --- | --- | --- | ---: | ---: | --- |
| restore | COMMITTED | RESTORE | profile-v2 | RESTORE | RESTORE | 3 | 0 | PASS |
| already_active | ALREADY_ACTIVE | RESTORE | profile-v1 | — | — | 3 | 0 | PASS |
| valid_import | COMMITTED | IMPORT | import-v4 | IMPORT | IMPORT | 4 | 0 | PASS |
| invalid_import | REJECTED | IMPORT_INVALID | — | — | — | 3 | 0 | PASS |
| new_profile | COMMITTED | NEW_PROFILE | base-profile-b-2 | NEW_PROFILE | MANUAL_TUNING | 2 | 0 | PASS |
| style_reset | COMMITTED | RESET_STYLE | profile-v1 | RESTORE | RESTORE | 3 | 0 | PASS |
| active_session | COMMITTED | RESTORE | profile-v2 | RESTORE | RESTORE | 3 | 0 | PASS |

## Checks

| Check | Expected | Actual | Pass |
| --- | --- | --- | --- |
| restore.pending.status | PENDING | PENDING | PASS |
| restore.pending.barrier | barrier-0001 | barrier-0001 | PASS |
| restore.pending.activation | true | true | PASS |
| restore.pending.versionsAdded | 0 | 0 | PASS |
| restore.status | COMMITTED | COMMITTED | PASS |
| restore.origin | RESTORE | RESTORE | PASS |
| restore.barrierReason | RESTORE | RESTORE | PASS |
| restore.versionsAdded | 0 | 0 | PASS |
| restore.historyUnchanged | ["profile-v1","profile-v2","profile-v3"] | ["profile-v1","profile-v2","profile-v3"] | PASS |
| restore.versionId | profile-v2 | profile-v2 | PASS |
| alreadyActive.status | ALREADY_ACTIVE | ALREADY_ACTIVE | PASS |
| alreadyActive.barrier | null | null | PASS |
| alreadyActive.barriers | 0 | 0 | PASS |
| alreadyActive.changes | 0 | 0 | PASS |
| import.pending.status | PENDING | PENDING | PASS |
| import.pending.created | true | true | PASS |
| import.pending.added | 1 | 1 | PASS |
| import.stored | true | true | PASS |
| import.parent | profile-v1 | profile-v1 | PASS |
| import.marker | IMPORTED | IMPORTED | PASS |
| import.previousHistory | ["profile-v1","profile-v2","profile-v3"] | ["profile-v1","profile-v2","profile-v3"] | PASS |
| import.status | COMMITTED | COMMITTED | PASS |
| import.origin | IMPORT | IMPORT | PASS |
| import.barrierReason | IMPORT | IMPORT | PASS |
| import.duplicate | ALREADY_ACTIVE | ALREADY_ACTIVE | PASS |
| import.singleVersion | 1 | 1 | PASS |
| invalidImport.status | REJECTED | REJECTED | PASS |
| invalidImport.reason | IMPORT_INVALID | IMPORT_INVALID | PASS |
| invalidImport.barrier | null | null | PASS |
| invalidImport.store | ["fnv1a64:8821a6910d8845e2","fnv1a64:2fc224f2e6b4ef94","fnv1a64:408d9f1dc54879a3"] | ["fnv1a64:8821a6910d8845e2","fnv1a64:2fc224f2e6b4ef94","fnv1a64:408d9f1dc54879a3"] | PASS |
| invalidImport.queue | 1 | 1 | PASS |
| invalidImport.activation | 0 | 0 | PASS |
| invalidImport.segments | 0 | 0 | PASS |
| newProfile.pending.status | PENDING | PENDING | PASS |
| newProfile.pending.created | true | true | PASS |
| newProfile.versionId | base-profile-b-2 | base-profile-b-2 | PASS |
| newProfile.otherProfile | ["profile-v1","profile-v2","profile-v3"] | ["profile-v1","profile-v2","profile-v3"] | PASS |
| newProfile.status | COMMITTED | COMMITTED | PASS |
| newProfile.origin | MANUAL_TUNING | MANUAL_TUNING | PASS |
| newProfile.barrierReason | NEW_PROFILE | NEW_PROFILE | PASS |
| newProfile.baseOrigin | BASE | BASE | PASS |
| newProfile.parameterCount | 80 | 80 | PASS |
| newProfile.history | true | true | PASS |
| reset.setupRestore | COMMITTED | COMMITTED | PASS |
| reset.pending.status | PENDING | PENDING | PASS |
| reset.status | COMMITTED | COMMITTED | PASS |
| reset.versionId | profile-v1 | profile-v1 | PASS |
| reset.origin | RESTORE | RESTORE | PASS |
| reset.versionsAdded | 0 | 0 | PASS |
| reset.history | ["profile-v1","profile-v2","profile-v3"] | ["profile-v1","profile-v2","profile-v3"] | PASS |
| reset.checksums | ["fnv1a64:8821a6910d8845e2","fnv1a64:2fc224f2e6b4ef94","fnv1a64:408d9f1dc54879a3"] | ["fnv1a64:8821a6910d8845e2","fnv1a64:2fc224f2e6b4ef94","fnv1a64:408d9f1dc54879a3"] | PASS |
| reset.progressionCalls | 0 | 0 | PASS |
| reset.progressSnapshot | {"xp":420,"level":3,"missions":["m1","m2"]} | {"xp":420,"level":3,"missions":["m1","m2"]} | PASS |
| active.pending | PENDING | PENDING | PASS |
| active.status | COMMITTED | COMMITTED | PASS |
| active.jobTracked | TRACKED | TRACKED | PASS |
| active.cancelled | 1 | 1 | PASS |
| active.physical | true | true | PASS |
| active.readback | [12,9.5,0.25] | [12,9.5,0.25] | PASS |
| active.lateResult | LATE_RESULT | LATE_RESULT | PASS |
| active.versionsAdded | 0 | 0 | PASS |
| active.history | ["profile-v1","profile-v2","profile-v3"] | ["profile-v1","profile-v2","profile-v3"] | PASS |

## Summary

Checks: 62/62. Scenarios: 7. Overall: PASS.

Limitations: RAM-only 109/110/205 integration; no savefile, IndexedDB, browser capture or hardware measurement.

# Raport determinist PBI 234 — savefile `.sdasave`

- Versiune raport: `234-savefile-report-v1`
- Overall: PASS
- Verificări: 84/84
- Fișier produs: 174732 B din plafonul 12285272 B
- Checksum: `f0f5b9d26e4ff78ead11fbf98dd191b738c7060350ed40e7b171ebc98cb4f106`

## Structură

| Câmp | Valoare |
| --- | --- |
| format | `self-driving-academy-save` |
| formatVersion / integrityVersion / schemaVersion | 1 / 1 / 1 |
| schema | `234-savefile-schema-1` |
| fișier | `self-driving-academy-20261022T090000000Z.sdasave` |
| sesiuni | 2 |
| XP total | 201 |

## Round-trip și import

| Măsură | Valoare |
| --- | --- |
| status citire | ACCEPTED |
| checksum verificat | true |
| status import | COMMITTED |
| XP după import | 100.5 |
| XP delta la al doilea import | 0 |
| recompense acordate / settle | 0 / 0 |
| lume pregătită / comisă | 2 / 2 |

## Refuzuri închise

| Caz | Cod |
| --- | --- |
| modifiedWithoutChecksum | `CHECKSUM_MISMATCH` |
| duplicateKey | `DUPLICATE_KEY` |
| truncated | `PARSE_ERROR` |
| trailingContent | `TRAILING_CONTENT` |
| oversized | `FILE_TOO_LARGE` |
| missingChecksum | `MISSING_FIELD` |
| unknownAlgorithm | `UNSUPPORTED_ALGORITHM` |
| unknownCanonicalization | `UNSUPPORTED_CANONICALIZATION` |
| unknownIntegrity | `UNSUPPORTED_INTEGRITY` |
| newerFormat | `FORMAT_VERSION_TOO_NEW` |
| newerSchema | `SCHEMA_TOO_NEW` |
| unknownSchema | `UNSUPPORTED_SCHEMA` |
| checksumBeforeSchema | `CHECKSUM_MISMATCH` |
| replayInvalid | `REPLAY_INVALID` |
| replayTooLarge | `REPLAY_TOO_LARGE` |
| unsafeInteger | `INVALID_COUNTER` |
| invalidNumber | `INVALID_NUMBER` |
| foreignDecor | `DECOR_SESSION_MISMATCH` |
| duplicateSession | `DUPLICATE_SESSION` |
| activeSessionMissing | `ACTIVE_SESSION_MISSING` |
| emptyFile | `SAVEFILE_EMPTY` |
| legacyRefused | `LEGACY_SAVEFILE` |
| previewRequired | `PREVIEW_REQUIRED` |
| previewStale | `PREVIEW_STALE` |
| writerRequired | `WRITER_REQUIRED` |
| cancelled | `CANCELLED` |
| worldPrepareFailed | `WORLD_PREPARE_FAILED` |
| corruptLeftIdentical | `true` |
| cancelledLeftIdentical | `true` |
| decorTamperLeftIdentical | `true` |

## Bugete și performanță

| Metrică | Valoare |
| --- | --- |
| bytes produși | 174732 |
| plafon fișier | 12285272 |
| payload deținut | 174113 |
| heap exact | null |
| transferuri worker | 0 |
| etichete UI | FILE_READY, AUTOSAVE_SAVED |

## Verificări

| Verificare | Expected | Actual | Rezultat |
| --- | --- | --- | --- |
| `format` | self-driving-academy-save | self-driving-academy-save | PASS |
| `formatVersion` | 1 | 1 | PASS |
| `integrityVersion` | 1 | 1 | PASS |
| `checksumLength` | 64 | 64 | PASS |
| `checksumVerified` | true | true | PASS |
| `sessionsPresent` | 2 | 2 | PASS |
| `activeSession` | ACADEMY | ACADEMY | PASS |
| `decorObjects` | 35 | 35 | PASS |
| `academyXp` | 100.5 | 100.5 | PASS |
| `chaosCheckpointTick` | 2500 | 2500 | PASS |
| `totalXp` | 201 | 201 | PASS |
| `replayBytes` | 7 | 7 | PASS |
| `fileName` | self-driving-academy-20261022T090000000Z.sdasave | self-driving-academy-20261022T090000000Z.sdasave | PASS |
| `fileBytesWithinBudget` | true | true | PASS |
| `whitespaceAndKeyOrder` | true | true | PASS |
| `canonicalVector` | {"a":[3,0,2],"n":0.1,"z":1,"é":"Ștefan","😀":true} | {"a":[3,0,2],"n":0.1,"z":1,"é":"Ștefan","😀":true} | PASS |
| `exportStatus` | ACCEPTED | ACCEPTED | PASS |
| `exportSessionXp` | 100.5 | 100.5 | PASS |
| `exportDecorObjects` | 35 | 35 | PASS |
| `modifiedWithoutChecksum` | CHECKSUM_MISMATCH | CHECKSUM_MISMATCH | PASS |
| `xpEditWithoutChecksum` | CHECKSUM_MISMATCH | CHECKSUM_MISMATCH | PASS |
| `duplicateKey` | DUPLICATE_KEY | DUPLICATE_KEY | PASS |
| `truncated` | PARSE_ERROR | PARSE_ERROR | PASS |
| `trailingContent` | TRAILING_CONTENT | TRAILING_CONTENT | PASS |
| `oversized` | FILE_TOO_LARGE | FILE_TOO_LARGE | PASS |
| `missingChecksum` | MISSING_FIELD | MISSING_FIELD | PASS |
| `unknownAlgorithm` | UNSUPPORTED_ALGORITHM | UNSUPPORTED_ALGORITHM | PASS |
| `unknownCanonicalization` | UNSUPPORTED_CANONICALIZATION | UNSUPPORTED_CANONICALIZATION | PASS |
| `unknownIntegrity` | UNSUPPORTED_INTEGRITY | UNSUPPORTED_INTEGRITY | PASS |
| `newerFormat` | FORMAT_VERSION_TOO_NEW | FORMAT_VERSION_TOO_NEW | PASS |
| `newerSchema` | SCHEMA_TOO_NEW | SCHEMA_TOO_NEW | PASS |
| `unknownSchema` | UNSUPPORTED_SCHEMA | UNSUPPORTED_SCHEMA | PASS |
| `checksumBeforeSchema` | CHECKSUM_MISMATCH | CHECKSUM_MISMATCH | PASS |
| `replayInvalid` | REPLAY_INVALID | REPLAY_INVALID | PASS |
| `replayTooLarge` | REPLAY_TOO_LARGE | REPLAY_TOO_LARGE | PASS |
| `unsafeInteger` | INVALID_COUNTER | INVALID_COUNTER | PASS |
| `invalidNumber` | INVALID_NUMBER | INVALID_NUMBER | PASS |
| `foreignDecor` | DECOR_SESSION_MISMATCH | DECOR_SESSION_MISMATCH | PASS |
| `duplicateSession` | DUPLICATE_SESSION | DUPLICATE_SESSION | PASS |
| `activeSessionMissing` | ACTIVE_SESSION_MISSING | ACTIVE_SESSION_MISSING | PASS |
| `emptyFile` | SAVEFILE_EMPTY | SAVEFILE_EMPTY | PASS |
| `legacyRefused` | LEGACY_SAVEFILE | LEGACY_SAVEFILE | PASS |
| `previewRequired` | PREVIEW_REQUIRED | PREVIEW_REQUIRED | PASS |
| `previewStale` | PREVIEW_STALE | PREVIEW_STALE | PASS |
| `importStatus` | COMMITTED | COMMITTED | PASS |
| `importXp` | 100.5 | 100.5 | PASS |
| `importXpMicro` | 100500000 | 100500000 | PASS |
| `importLevel` | 2 | 2 | PASS |
| `rewardsSettled` | 0 | 0 | PASS |
| `rewardsGranted` | 0 | 0 | PASS |
| `launchPausedAuto` | PAUSED_AUTO | PAUSED_AUTO | PASS |
| `launchInputReleased` | true | true | PASS |
| `launchManualVehicles` | 0 | 0 | PASS |
| `dailyRewardsAfter` | 1 | 1 | PASS |
| `settlementsAfter` | 3 | 3 | PASS |
| `worldStaged` | 2 | 2 | PASS |
| `worldCommitted` | 2 | 2 | PASS |
| `decorRestored` | 4 | 4 | PASS |
| `secondImportStatus` | COMMITTED | COMMITTED | PASS |
| `secondXpDelta` | 0 | 0 | PASS |
| `secondXpAfter` | 100.5 | 100.5 | PASS |
| `secondEconomyRevision` | 2 | 2 | PASS |
| `secondDailyRewards` | 1 | 1 | PASS |
| `secondXpMicro` | 100500000 | 100500000 | PASS |
| `corruptImport` | CHECKSUM_MISMATCH | CHECKSUM_MISMATCH | PASS |
| `corruptLeftIdentical` | true | true | PASS |
| `cancelled` | CANCELLED | CANCELLED | PASS |
| `cancelledLeftIdentical` | true | true | PASS |
| `decorTamper` | WORLD_PREPARE_FAILED | WORLD_PREPARE_FAILED | PASS |
| `decorTamperLeftIdentical` | true | true | PASS |
| `writerRequired` | WRITER_REQUIRED | WRITER_REQUIRED | PASS |
| `budget.maxSessionBytes` | 3215360 | 3215360 | PASS |
| `budget.maxDecorBytes` | 65536 | 65536 | PASS |
| `budget.maxReplayBytes` | 4194304 | 4194304 | PASS |
| `budget.fileWithinIngress` | true | true | PASS |
| `budget.replayWithinRetention` | true | true | PASS |
| `performance.storage` | WITHIN_FINITE_ADMISSION_CAP | WITHIN_FINITE_ADMISSION_CAP | PASS |
| `performance.memory` | OWNED_BYTE_COUNTERS_NOT_HEAP | OWNED_BYTE_COUNTERS_NOT_HEAP | PASS |
| `performance.workers` | 0 | 0 | PASS |
| `performance.ui` | true | true | PASS |
| `ui.claimsBrowserWrite` | false | false | PASS |
| `ui.autosaveLabel` | AUTOSAVE_SAVED | AUTOSAVE_SAVED | PASS |
| `ui.fileLabel` | FILE_READY | FILE_READY | PASS |
| `ui.preparingLabel` | PREPARING_FILE | PREPARING_FILE | PASS |

- Total: 84/84 — PASS


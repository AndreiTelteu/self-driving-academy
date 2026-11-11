# PBI 225 — sesiuni Academie și Haos (transcript determinist)

- Overall: PASS
- Checks: 45/45

## Structura

| Câmp | Valoare |
| --- | --- |
| `contract` | 225-session-kinds-v1 |
| `fixture` | 225-session-kinds-v1 |
| `fixedNow` | 2026-11-11T20:00:00.000Z |
| `kinds` | ACADEMY, CHAOS |
| `controlModes` | MANUAL, LEARNING, AUTO |
| `capabilities` | 9 |
| `parityIdentical` | true |
| `sessionKindIsControlMode` | false |

## Profil copiat explicit

| Câmp | Valoare |
| --- | --- |
| `sourceProfileId` | profile-1 |
| `sourceVersionId` | profile-1@1 |
| `sourceChecksum` | fnv1a64:0ed612cdcb47c703 |
| `copyProfileId` | chaos:haos-copy-1 |
| `copyVersionId` | chaos:haos-copy-1@1 |
| `copyChecksum` | fnv1a64:75d6cb7a8c268687 |
| `copyValid` | true |
| `copiedParameters` | 2 |
| `sourceValue` | 10 |
| `tunedValue` | 14 |
| `copyValueAfterAcademyChange` | 10 |
| `progressTransferred` | false |
| `sourceSegmentsTransferred` | 0 |

## Izolare contabilă

| Câmp | Valoare |
| --- | --- |
| `fingerprintBefore` | sha256:0756ca4b7ebc914f06a48e883c5674e2eaad1eedef48137f5a2f28a7e5ce3b68 |
| `fingerprintAfter` | sha256:0756ca4b7ebc914f06a48e883c5674e2eaad1eedef48137f5a2f28a7e5ce3b68 |
| `identical` | true |
| `refusedOperations` | DAILY_INGEST, DAILY_ADVANCE, XP_MISSION, XP_DAILY, XP_ACTIVE_TIME, CAMPAIGN_SETTLE |
| `refusedCount` | 6 |
| `delegatedCount` | 2 |
| `xpBalanceMicroXp` | 500000 |
| `xpEntries` | 1 |
| `dailyRewards` | 0 |
| `rewardGrants` | 2 |
| `historyScans` | 0 |

## Checkpoint-uri și tranziții

| Câmp | Valoare |
| --- | --- |
| `switches` | 20 |
| `committed` | 20 |
| `academyRows` | 10 |
| `chaosRows` | 10 |
| `totalBodyBytes` | 773 |
| `maxBodyBytes` | 40 |
| `liveWorlds` | 1 |
| `residentJobs` | 2 |
| `listeners` | 1 |
| `profileCopies` | 1 |
| `orphanWorlds` | 0 |
| `orphanJobs` | 0 |
| `checksumLength` | 64 |
| `verifiedCheckpoints` | 20 |

## Salvare eșuată

| Câmp | Valoare |
| --- | --- |
| `failedSwitches` | 1 |
| `keptWorld` | ACADEMY |
| `retrySucceeded` | true |
| `epochAfterFailure` | 1 |
| `checkpointsAfterFailure` | 0 |

## Revenire la checkpoint Haos

| Câmp | Valoare |
| --- | --- |
| `status` | RESTORED |
| `sessionKind` | CHAOS |
| `launch` | PAUSED_AUTO |
| `academyFingerprintUnchanged` | true |
| `academyRowsUnchanged` | true |
| `chaosRows` | 1 |

## Copierea stilului Haos în Academie

| Câmp | Valoare |
| --- | --- |
| `status` | ADOPTED |
| `profileValid` | true |
| `fingerprintUnchanged` | true |

## Politica de transfer

| Câmp | Valoare |
| --- | --- |
| `refusedPaths` | IMPORT, EXPORT, CHECKPOINT, RESTORE, ARCHIVE |
| `styleCopyAllowed` | true |
| `profileCopyAllowed` | true |
| `academyIntoChaosImportRefused` | true |

## Memorie

| Câmp | Valoare |
| --- | --- |
| `exactHeapBytes` | null |
| `reason` | The budget manifest leaves totalHeapBytes null; owned resource counters stay separate instead of being summed as heap. |

## Verificări

| Rezultat | Verificare | Așteptat | Real |
| --- | --- | --- | --- |
| PASS | `capabilities are identical in both kinds` | `true` | `true` |
| PASS | `both kinds expose the three control modes` | `["MANUAL","LEARNING","AUTO"]` | `["MANUAL","LEARNING","AUTO"]` |
| PASS | `the session kind is not a control mode` | `false` | `false` |
| PASS | `both kinds allow any existing vehicle` | `"ANY_EXISTING"` | `"ANY_EXISTING"` |
| PASS | `the copy has its own profile identity` | `true` | `true` |
| PASS | `the copied profile checksum is valid` | `true` | `true` |
| PASS | `the copy carries no progress` | `false` | `false` |
| PASS | `the copy carries no source segments` | `0` | `0` |
| PASS | `a Haos tuning changes only the copy` | `14` | `14` |
| PASS | `the Academy profile keeps its value after a Haos tuning` | `10` | `10` |
| PASS | `the copy keeps its value after an Academy change` | `10` | `10` |
| PASS | `all six Academy ledger operations are isolated in Haos` | `6` | `6` |
| PASS | `the Academy ledger fingerprint is identical after Haos` | `"sha256:0756ca4b7ebc914f06a48e883c5674e2eaad1eedef48137f5a2f28a7e5ce3b68"` | `"sha256:0756ca4b7ebc914f06a48e883c5674e2eaad1eedef48137f5a2f28a7e5ce3b68"` |
| PASS | `Haos grants no daily reward` | `0` | `0` |
| PASS | `Haos grants no reward` | `0` | `0` |
| PASS | `Haos grants no XP` | `0` | `0` |
| PASS | `the Academy gate delegates a real active window` | `true` | `true` |
| PASS | `the Academy gate delegates a real campaign settle` | `"DELEGATED"` | `"DELEGATED"` |
| PASS | `the Academy XP balance grows only through the gate` | `500000` | `500000` |
| PASS | `two Academy operations are delegated` | `2` | `2` |
| PASS | `twenty transitions succeed` | `20` | `20` |
| PASS | `exactly one world is live after twenty transitions` | `1` | `1` |
| PASS | `twenty transitions leave no orphan world` | `0` | `0` |
| PASS | `twenty transitions leave one Haos profile copy` | `1` | `1` |
| PASS | `every committed checkpoint verifies` | `20` | `20` |
| PASS | `checkpoints are split between the two kinds` | `20` | `20` |
| PASS | `the failed switch is reported as SAVE_FAILED` | `"SAVE_FAILED"` | `"SAVE_FAILED"` |
| PASS | `a failed save keeps the Academy world` | `"ACADEMY"` | `"ACADEMY"` |
| PASS | `a failed save does not advance the epoch` | `1` | `1` |
| PASS | `a failed save writes no checkpoint` | `0` | `0` |
| PASS | `the retry after a failed save switches` | `"SWITCHED"` | `"SWITCHED"` |
| PASS | `a Haos checkpoint restores` | `"RESTORED"` | `"RESTORED"` |
| PASS | `a restored world launches in PAUSED_AUTO` | `"PAUSED_AUTO"` | `"PAUSED_AUTO"` |
| PASS | `a Haos restore leaves the Academy rows alone` | `"[{\"version\":\"225-session-kinds-v1\",\"checkpointId\":\"checkpoint:ACADEMY:session-225-academy:1\",\"sessionKind\":\"ACADEMY\",\"sessionId\":\"session-225-academy\",\"profileId\":\"profile-1\",\"worldEpoch\":1,\"learningEpoch\":0,\"tick\":1,\"generation\":1,\"reason\":\"SESSION_SWITCH\",\"createdAt\":\"2026-11-11T20:00:00.000Z\",\"vehicles\":4,\"manualVehicles\":1,\"launch\":\"PAUSED_AUTO\",\"body\":{\"tick\":1,\"worldEpoch\":1,\"vehicles\":4},\"bodyBytes\":38,\"checksum\":\"20235af12d7f900caa446a697140823288645ea94c39fce9658cdba33dd0e84f\"}]"` | `"[{\"version\":\"225-session-kinds-v1\",\"checkpointId\":\"checkpoint:ACADEMY:session-225-academy:1\",\"sessionKind\":\"ACADEMY\",\"sessionId\":\"session-225-academy\",\"profileId\":\"profile-1\",\"worldEpoch\":1,\"learningEpoch\":0,\"tick\":1,\"generation\":1,\"reason\":\"SESSION_SWITCH\",\"createdAt\":\"2026-11-11T20:00:00.000Z\",\"vehicles\":4,\"manualVehicles\":1,\"launch\":\"PAUSED_AUTO\",\"body\":{\"tick\":1,\"worldEpoch\":1,\"vehicles\":4},\"bodyBytes\":38,\"checksum\":\"20235af12d7f900caa446a697140823288645ea94c39fce9658cdba33dd0e84f\"}]"` |
| PASS | `a Haos restore leaves the Academy ledger alone` | `"sha256:0756ca4b7ebc914f06a48e883c5674e2eaad1eedef48137f5a2f28a7e5ce3b68"` | `"sha256:0756ca4b7ebc914f06a48e883c5674e2eaad1eedef48137f5a2f28a7e5ce3b68"` |
| PASS | `the Haos style copy into the Academy is accepted` | `"ADOPTED"` | `"ADOPTED"` |
| PASS | `the adopted style is a valid profile version` | `true` | `true` |
| PASS | `the adopted style transfers no XP` | `0` | `0` |
| PASS | `the adopted style transfers no daily reward` | `0` | `0` |
| PASS | `the adoption leaves the Academy ledger alone` | `"sha256:0756ca4b7ebc914f06a48e883c5674e2eaad1eedef48137f5a2f28a7e5ce3b68"` | `"sha256:0756ca4b7ebc914f06a48e883c5674e2eaad1eedef48137f5a2f28a7e5ce3b68"` |
| PASS | `the promotion paths are refused` | `5` | `5` |
| PASS | `the explicit style copy is allowed` | `true` | `true` |
| PASS | `the explicit profile copy is allowed` | `true` | `true` |
| PASS | `an Academy import into Haos is refused` | `false` | `false` |
| PASS | `a history scan is never used` | `0` | `0` |

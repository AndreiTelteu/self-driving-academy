# Raport 215 - persistența pentru KPI, daily și XP

Versiune raport: `215-save-economy-report-v1`. Generat de `npm run save:economy`.

Fiecare componenta este citita de parserul proprietarului (212 restore, 213 parse, 209 structural); valorile de business nu sunt recalculate.

## Structura

| Câmp | Valoare |
| --- | --- |
| `formatVersion` | 2 |
| `schemaVersion` | 2 |
| `sessionId` | session-116-missions |
| `playerId` | player:130 |
| `worldEpoch` | 1 |
| `createdAt` | 2026-10-22T09:00:00.000Z |
| `checksum` | 64 caractere |
| `bundleBytes` | 14483 |
| `rowBytes` | 14647 |
| `bundle.daily` | 4919 |
| `bundle.economy` | 7341 |
| `bundle.player` | 1745 |
| `bundle.total` | 14005 |
| `archive.session` | 65538 |
| `archive.economy` | 14495 |
| `archive.total` | 80033 |

## Round-trip

| Câmp | Valoare |
| --- | --- |
| `import` | COMMITTED |
| `xp inainte` | 100.5 |
| `xp dupa` | 100.5 |
| `micro XP inainte` | 100500000 |
| `micro XP dupa` | 100500000 |
| `nivel inainte` | 2 |
| `nivel dupa` | 2 |
| `intrari XP` | 2 |
| `settle-uri` | 3 |
| `review-uri` | 1 |
| `zile KPI` | 1 |
| `recompense daily` | 1 |
| `historyScans` | 0 |
| `bundle identic` | true |

## Înlocuire, nu adunare

| Câmp | Valoare |
| --- | --- |
| `al doilea import` | COMMITTED |
| `micro XP primul` | 100500000 |
| `micro XP al doilea` | 100500000 |
| `delta XP` | 0 |
| `recompense daily` | 1 |
| `revizie rând` | 2 |

## Refuzuri

| Câmp | Valoare |
| --- | --- |
| `format nou` | FORMAT_VERSION_TOO_NEW |
| `checksum modificat` | CHECKSUM_MISMATCH |
| `componenta peste buget` | COMPONENT_TOO_LARGE |
| `credit XP negativ` | PLAYER_INVALID |
| `sesiune straină` | SESSION_MISMATCH |
| `quota plină` | STORAGE_FULL |
| `al doilea tab` | WRITER_REQUIRED |
| `rollback pe quota` | true |

## Arhivă veche și migrare aditivă

| Câmp | Valoare |
| --- | --- |
| `arhiva v1 citibila` | true |
| `stare` | LEGACY |
| `slot economic dupa import` | UNCHANGED |
| `bundle identic` | true |
| `migrare aditiva` | true |

## Bugete

| Câmp | Valoare |
| --- | --- |
| `sursa` | PERSISTENCE_LIMITS.maxRecordBytes / maxBodyBytes (127) |
| `buget rând` | 1048576 |
| `buget total bundle` | 1048576 |
| `buget daily` | 262144 |
| `buget economy` | 524288 |
| `buget player` | 262144 |
| `buget arhiva v2` | 3149824 |
| `pondere masurata` | 0.014 |

## Verificări

| Câmp | Valoare |
| --- | --- |
| `bundle-row-within-record-budget` | PASS |
| `bundle-daily-bytes` | PASS |
| `bundle-economy-bytes` | PASS |
| `bundle-player-bytes` | PASS |
| `archive-version` | PASS |
| `xp-identical` | PASS |
| `xp-micro-identical` | PASS |
| `level-identical` | PASS |
| `entries-identical` | PASS |
| `settlements` | PASS |
| `reviews` | PASS |
| `kpi-days` | PASS |
| `daily-rewards` | PASS |
| `history-scans` | PASS |
| `bundle-identical` | PASS |
| `xp-not-doubled` | PASS |
| `daily-rewards-not-doubled` | PASS |
| `row-revision` | PASS |
| `refusal-newer-format` | PASS |
| `refusal-checksum` | PASS |
| `refusal-component-budget` | PASS |
| `refusal-negative-xp` | PASS |
| `refusal-foreign-session` | PASS |
| `refusal-storage-full` | PASS |
| `refusal-second-tab` | PASS |
| `storage-full-rollback` | PASS |
| `second-tab-untouched` | PASS |
| `legacy-readable` | PASS |
| `legacy-status` | PASS |
| `legacy-economy-unchanged` | PASS |
| `legacy-bundle-identical` | PASS |
| `upgrade-additive` | PASS |

## Sumar

Verificări: 32/32; scenarii: 8; overall: PASS.

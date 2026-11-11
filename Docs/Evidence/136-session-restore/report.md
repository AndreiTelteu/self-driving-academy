# Raport 136 — migrare și restaurare după restart

Versiune raport: `136-session-restore-report-v1`.

Generat de: `npm run restore:session`.

Regulă oracol: Migrarea este dovedită pe o bază reală în memorie (versiunea 1 cu rânduri, upgrade eșuat injectat, export, recuperare și refuz), iar reluarea pe checkpointul real al writerului 206, cu o generație mai nouă coruptă intenționată; fiecare valoare așteptată este contractul documentat, fără ceas de perete și fără Math.random.

## Migrarea schemei

| Măsură | Valoare |
| --- | --- |
| versiune contract | 136-save-migration-v1 |
| format export | self-driving-academy-save-migration-export |
| versiune schemă curentă | 2 |
| tranziție 1→2 | 127-v2-checkpoints-and-lifecycle-indexes |
| tranziție 2→2 | niciun pas |
| migrare | MIGRATED |
| pași aplicați | 127-v2-checkpoints-and-lifecycle-indexes |
| store-uri exportate | 7 |
| rânduri exportate | 3 |
| versiune după | 2 |
| store-uri după | 8 |
| bază nouă | CREATED |
| bază curentă | CURRENT |
| plan prea nou | SCHEMA_TOO_NEW |
| bază prea nouă | SCHEMA_TOO_NEW |
| eșec | MIGRATION_FAILED |
| rânduri neatinse | true |
| versiune după eșec | 1 |
| store checkpoints după eșec | false |
| export pre-migrare (rânduri) | 3 |
| digest neschimbat | true |
| recuperare | RECOVERED |
| recuperare verificată | true |
| rânduri recuperate | 3 |
| digest recuperat = export | true |
| recuperare peste date | RECOVERY_TARGET_NOT_EMPTY |
| export modificat | EXPORT_CHECKSUM_MISMATCH |

## Reluarea sesiunii

| Măsură | Valoare |
| --- | --- |
| vehicule | 70 |
| curse | 30 |
| pasageri | 30 |
| segmente | 3 |
| joburi learning | 3 |
| joburi dispatch | 3 |
| observații finalizate | 2 |
| checkpoint ales | checkpoint-136-valid |
| tick | 60 |
| generație | 1 |
| bytes | 64378 |
| candidați | 2 |
| generații sărite | checkpoint-136-invalid-newest:CHECKSUM_MISMATCH |
| mod de pornire | PAUSED_AUTO |
| input eliberat | true |
| vehicule MANUAL | 0 |
| vehicule AUTO | 70 |
| MANUAL anterior | 1 |
| segmente deschise | 1 |
| segmente incomplete | 1 |
| joburi reluate | 2 |
| joburi anulate | 4 |
| observații reluate | 2 |
| observații deja recompensate | 1 |
| rânduri ledger | 2 |
| digest ledger | 53b23f20259597bc4b656ad92d487872f3edce72c1fc17a5e0ea64f33ef570bf |
| recompense reaplicate | 0 |

## Scenarii

| Măsură | Valoare |
| --- | --- |
| epoch invalid | {"relaunched":0,"invalidated":6,"reasons":["LEARNING_EPOCH_MISMATCH","PROFILE_AND_EPOCH_MISMATCH"]} |
| profil schimbat | {"relaunched":2,"invalidated":4} |
| plic incoerent | {"candidates":3,"skipped":["CHECKSUM_MISMATCH","LEARNING_EPOCH_MISMATCH"],"selected":"checkpoint-136-valid"} |
| sesiune goală | EMPTY |
| doar generație coruptă | {"status":"BLOCKED","code":"CHECKPOINT_INVALID","skipped":"CHECKSUM_MISMATCH"} |
| versiuni incompatibile | {"status":"BLOCKED","code":"CHECKPOINT_INVALID"} |
| restaurare read-only | true |

## Verificări

| Verificare | Așteptat | Real | Rezultat |
| --- | --- | --- | --- |
| migration version | "136-save-migration-v1" | "136-save-migration-v1" | PASS |
| migration current schema | 2 | 2 | PASS |
| migration transition 1->2 | ["127-v2-checkpoints-and-lifecycle-indexes"] | ["127-v2-checkpoints-and-lifecycle-indexes"] | PASS |
| migration transition 2->2 | [] | [] | PASS |
| migration status | "MIGRATED" | "MIGRATED" | PASS |
| migration source version | 1 | 1 | PASS |
| migration applied step | ["127-v2-checkpoints-and-lifecycle-indexes"] | ["127-v2-checkpoints-and-lifecycle-indexes"] | PASS |
| migration stores | 7 | 7 | PASS |
| migration rows | 3 | 3 | PASS |
| migration version after | 2 | 2 | PASS |
| migration stores after | 8 | 8 | PASS |
| fresh database | "CREATED" | "CREATED" | PASS |
| fresh applied steps | ["127-v1-base-layout","127-v2-checkpoints-and-lifecycle-indexes"] | ["127-v1-base-layout","127-v2-checkpoints-and-lifecycle-indexes"] | PASS |
| fresh rows | 0 | 0 | PASS |
| current database | "CURRENT" | "CURRENT" | PASS |
| current steps | [] | [] | PASS |
| plan refuses newer | "SCHEMA_TOO_NEW" | "SCHEMA_TOO_NEW" | PASS |
| migration refuses newer | "SCHEMA_TOO_NEW" | "SCHEMA_TOO_NEW" | PASS |
| failure code | "MIGRATION_FAILED" | "MIGRATION_FAILED" | PASS |
| failure untouched | true | true | PASS |
| failure version | 1 | 1 | PASS |
| failure has no checkpoint store | false | false | PASS |
| failure export | 3 | 3 | PASS |
| failure digest | true | true | PASS |
| recovery status | "RECOVERED" | "RECOVERED" | PASS |
| recovery verified | true | true | PASS |
| recovery rows | 3 | 3 | PASS |
| recovery digest | true | true | PASS |
| recovery non-empty target | "RECOVERY_TARGET_NOT_EMPTY" | "RECOVERY_TARGET_NOT_EMPTY" | PASS |
| tampered export | "EXPORT_CHECKSUM_MISMATCH" | "EXPORT_CHECKSUM_MISMATCH" | PASS |
| world vehicles | 70 | 70 | PASS |
| world rides | 30 | 30 | PASS |
| world learning jobs | 3 | 3 | PASS |
| world dispatch jobs | 3 | 3 | PASS |
| selected checkpoint | "checkpoint-136-valid" | "checkpoint-136-valid" | PASS |
| selected tick | 60 | 60 | PASS |
| candidates | 2 | 2 | PASS |
| skipped newest | [{"checkpointId":"checkpoint-136-invalid-newest","code":"CHECKSUM_MISMATCH"}] | [{"checkpointId":"checkpoint-136-invalid-newest","code":"CHECKSUM_MISMATCH"}] | PASS |
| checksum length | 64 | 64 | PASS |
| launch mode | "PAUSED_AUTO" | "PAUSED_AUTO" | PASS |
| launch paused | true | true | PASS |
| launch auto | true | true | PASS |
| launch input released | true | true | PASS |
| launch manual vehicles | 0 | 0 | PASS |
| launch vehicles in auto | 70 | 70 | PASS |
| previous manual vehicles | 1 | 1 | PASS |
| open segments | 1 | 1 | PASS |
| incomplete segments | 1 | 1 | PASS |
| segment transition | [{"segmentId":"segment-taxi-01","from":"OPEN","to":"INCOMPLETE","reason":"RELOAD"}] | [{"segmentId":"segment-taxi-01","from":"OPEN","to":"INCOMPLETE","reason":"RELOAD"}] | PASS |
| jobs relaunched | 2 | 2 | PASS |
| jobs invalidated | 4 | 4 | PASS |
| relaunched identities | ["dispatch-01","learning-01"] | ["dispatch-01","learning-01"] | PASS |
| invalidation reasons | ["LEARNING_EPOCH_MISMATCH","PROFILE_MISMATCH"] | ["LEARNING_EPOCH_MISMATCH","PROFILE_MISMATCH"] | PASS |
| observations replayed | 2 | 2 | PASS |
| observations already rewarded | 1 | 1 | PASS |
| ledger rows | 2 | 2 | PASS |
| ledger digest length | 64 | 64 | PASS |
| rewards reapplied | 0 | 0 | PASS |
| invalid epoch | {"relaunched":0,"invalidated":6,"reasons":["LEARNING_EPOCH_MISMATCH","PROFILE_AND_EPOCH_MISMATCH"]} | {"relaunched":0,"invalidated":6,"reasons":["LEARNING_EPOCH_MISMATCH","PROFILE_AND_EPOCH_MISMATCH"]} | PASS |
| changed profile | {"relaunched":2,"invalidated":4} | {"relaunched":2,"invalidated":4} | PASS |
| incoherent envelope | {"candidates":3,"skipped":["CHECKSUM_MISMATCH","LEARNING_EPOCH_MISMATCH"],"selected":"checkpoint-136-valid"} | {"candidates":3,"skipped":["CHECKSUM_MISMATCH","LEARNING_EPOCH_MISMATCH"],"selected":"checkpoint-136-valid"} | PASS |
| empty session | "EMPTY" | "EMPTY" | PASS |
| broken only | {"status":"BLOCKED","code":"CHECKPOINT_INVALID","skipped":"CHECKSUM_MISMATCH"} | {"status":"BLOCKED","code":"CHECKPOINT_INVALID","skipped":"CHECKSUM_MISMATCH"} | PASS |
| incompatible versions | {"status":"BLOCKED","code":"CHECKPOINT_INVALID"} | {"status":"BLOCKED","code":"CHECKPOINT_INVALID"} | PASS |
| read only | true | true | PASS |

## Sumar

Verificări: 65/65; scenarii: 8; overall: PASS.

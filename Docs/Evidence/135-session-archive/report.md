# Raport 135 — arhiva de sesiune

Versiune raport: `135-session-archive-report-v1`.

Generat de: `npm run save:session-archive`.

Regulă oracol: Arhiva este dovedită prin ciclu complet: snapshotul 206 este capturat de writerul real, rândurile 130 sunt scrise de store-ul de progres, campania este finalizată de modulele reale 116/125, iar fiecare valoare așteptată este contractul documentat. Refuzurile sunt măsurate pe aceeași bază în memorie, cu amprentă byte cu byte înainte și după fiecare fișier respins; nu există ceas de perete și nici Math.random.

## Structura arhivei

| Măsură | Valoare |
| --- | --- |
| sesiune | session-116-missions |
| jucător | player:130 |
| world epoch | 1 |
| checkpoint | checkpoint-135 |
| tick checkpoint | 4000 |
| engine/fizică/hartă | engine-127 |
| profil | profile-1 |
| versiune activă | profile-1@2 |
| secvență activare | 3 |
| bytes checkpoint | 54470 |
| bytes progres | 7430 |
| bytes campanie | 1460 |
| bytes setări | 914 |
| bytes referință profil | 315 |
| bytes scenarii | 274 |
| bytes total | 64863 |
| plafon total | 2097152 |
| lungime checksum | 64 |
| bytes canonici document | 65538 |
| instanțe tracker | 3 |
| recompense tracker | 6 |
| evenimente campanie | 3 |
| misiuni finalizate | 3 |
| XP | 300 |
| recompense acordate | 6 |
| scenarii | 1 |

## Round-trip

| Măsură | Valoare |
| --- | --- |
| checksum verificat | true |
| document canonic identic | true |
| digest tracker identic | true |
| digest campanie identic | true |
| setări identice | true |
| XP înainte/după | 300/300 |
| misiuni după | 3 |
| instanțe după | 3 |
| scenarii după | 1 |
| tick checkpoint după | 4000 |
| revizii înainte | 1,1 |
| revizii după | 2,2 |
| rânduri progres înlocuite | 2 |
| scenarii înlocuite | 1 |
| checkpointuri înlocuite | 1 |
| setări înlocuite | true |

## Recompense înlocuite, nu adunate

| Măsură | Valoare |
| --- | --- |
| XP țintă înainte | 600 |
| misiuni țintă înainte | 6 |
| XP arhivă | 300 |
| recompense arhivă | 6 |
| XP după import | 300 |
| recompense după import | 6 |
| misiuni după import | 3 |
| înlocuit, nu adunat | true |
| a doua finalizare | DUPLICATE |
| XP pentru duplicat | 0 |
| XP după al doilea import | 300 |
| recompense după al doilea import | 6 |

## Refuzuri

| Măsură | Valoare |
| --- | --- |
| checksum modificat | CHECKSUM_MISMATCH |
| sesiune neatinsă după checksum | true |
| jurnal de campanie rescris | CAMPAIGN_INVALID |
| sesiune neatinsă după jurnal | true |
| rând din altă sesiune | SESSION_MISMATCH |
| generație în arhivă | PROFILE_GENERATION_MISMATCH |
| generație stocată | PROFILE_GENERATION_MISMATCH |
| versiune lipsă | PROFILE_VERSION_MISSING |
| componentă peste buget | COMPONENT_TOO_LARGE |
| total declarat peste plafon | ARCHIVE_TOO_LARGE |
| mărime declarată greșită | SIZE_MISMATCH |
| chei duplicate | DUPLICATE_KEY |
| format mai nou | FORMAT_VERSION_TOO_NEW |
| altă sesiune cerută | SESSION_MISMATCH |
| al doilea tab | WRITER_REQUIRED |
| eșec înainte de commit | TRANSACTION_ABORTED |
| sesiune neatinsă după rollback | true |
| arhivă fără componente | ARCHIVE_EMPTY |

## Verificări

| Verificare | Așteptat | Real | Rezultat |
| --- | --- | --- | --- |
| format marker | "self-driving-academy-session-archive" | "self-driving-academy-session-archive" | PASS |
| session identity | "session-116-missions" | "session-116-missions" | PASS |
| player identity | "player:130" | "player:130" | PASS |
| world epoch | 1 | 1 | PASS |
| checkpoint identity | "checkpoint-135" | "checkpoint-135" | PASS |
| checkpoint tick | 4000 | 4000 | PASS |
| profile reference | "profile-1@2" | "profile-1@2" | PASS |
| activation sequence | 3 | 3 | PASS |
| campaign completions | 3 | 3 | PASS |
| tracker instances | 3 | 3 | PASS |
| scenario rows | 1 | 1 | PASS |
| component ledger sum | 64863 | 64863 | PASS |
| archive limit | 2097152 | 2097152 | PASS |
| checksum length | 64 | 64 | PASS |
| canonical bytes | true | true | PASS |
| checksum verified | true | true | PASS |
| tracker digest after import | "c3f00b5a8636a28ca52a6369ff12ffc82b29b3c76ec5483b5f9a382d6cd1a10b" | "c3f00b5a8636a28ca52a6369ff12ffc82b29b3c76ec5483b5f9a382d6cd1a10b" | PASS |
| campaign digest after import | "80e2d713db35fecceef8fb50ad9f857f5aae194125a760c7f3323fa1f01c5f2d" | "80e2d713db35fecceef8fb50ad9f857f5aae194125a760c7f3323fa1f01c5f2d" | PASS |
| settings restored | true | true | PASS |
| xp after import | 300 | 300 | PASS |
| completions after import | 3 | 3 | PASS |
| instances after import | 3 | 3 | PASS |
| scenarios after import | 1 | 1 | PASS |
| checkpoint after import | 4000 | 4000 | PASS |
| checkpoint replaced | true | true | PASS |
| progress rows replaced | 2 | 2 | PASS |
| scenarios replaced | 1 | 1 | PASS |
| checkpoints replaced | 1 | 1 | PASS |
| settings replaced | true | true | PASS |
| target completed before | 6 | 6 | PASS |
| target had more xp | true | true | PASS |
| xp replaced, not added | 300 | 300 | PASS |
| xp not summed | true | true | PASS |
| rewards granted replaced | 6 | 6 | PASS |
| completions replaced | 3 | 3 | PASS |
| duplicate settlement | "DUPLICATE" | "DUPLICATE" | PASS |
| duplicate xp | 0 | 0 | PASS |
| second import xp | 300 | 300 | PASS |
| second import granted | 6 | 6 | PASS |
| checksum refusal | "CHECKSUM_MISMATCH" | "CHECKSUM_MISMATCH" | PASS |
| checksum refusal untouched | true | true | PASS |
| campaign digest refusal | "CAMPAIGN_INVALID" | "CAMPAIGN_INVALID" | PASS |
| campaign digest untouched | true | true | PASS |
| mixed session refusal | "SESSION_MISMATCH" | "SESSION_MISMATCH" | PASS |
| archive generation refusal | "PROFILE_GENERATION_MISMATCH" | "PROFILE_GENERATION_MISMATCH" | PASS |
| stored generation refusal | "PROFILE_GENERATION_MISMATCH" | "PROFILE_GENERATION_MISMATCH" | PASS |
| missing version refusal | "PROFILE_VERSION_MISSING" | "PROFILE_VERSION_MISSING" | PASS |
| component budget refusal | "COMPONENT_TOO_LARGE" | "COMPONENT_TOO_LARGE" | PASS |
| declared total refusal | "ARCHIVE_TOO_LARGE" | "ARCHIVE_TOO_LARGE" | PASS |
| declared size refusal | "SIZE_MISMATCH" | "SIZE_MISMATCH" | PASS |
| duplicate key refusal | "DUPLICATE_KEY" | "DUPLICATE_KEY" | PASS |
| newer format refusal | "FORMAT_VERSION_TOO_NEW" | "FORMAT_VERSION_TOO_NEW" | PASS |
| wrong session refusal | "SESSION_MISMATCH" | "SESSION_MISMATCH" | PASS |
| second tab refusal | "WRITER_REQUIRED" | "WRITER_REQUIRED" | PASS |
| rollback refusal | "TRANSACTION_ABORTED" | "TRANSACTION_ABORTED" | PASS |
| rollback untouched | true | true | PASS |
| empty archive refusal | "ARCHIVE_EMPTY" | "ARCHIVE_EMPTY" | PASS |
| progress bytes inside the 127 row budget | true | true | PASS |

## Sumar

Verificări: 58/58; scenarii: 3; overall: PASS.

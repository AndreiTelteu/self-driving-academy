# 200 — salvarea personajului și migrare V3

Transcript determinist generat de `npm run walking:save`; contract `200-walking-save-v1`. Machine-readable:
[report.json](report.json). Formatul arhivei de sesiune urcă de la v1 (135) și v2 (215) la **v3**, iar
sloturile `session` și `economy` rămân **neschimbate**, cu checksum-urile lor proprii. Slotul nou
`character` (`200-walking-character-v1`) poartă poziția, camera, autoritatea, segmentele 198 și
starea de flotă 197, într-un envelope cu checksum `SDA-CJSON-1`/SHA-256.

## Sumar

- Verificări: **160/160**.
- Scenarii: **4/4**.
- Refuzuri închise: **18/18**.
- Migrarea păstrează sesiunea și economia bit-identic: **PASS**.
- Reload coerent (pauză, autoritate, cameră, input eliberat): **PASS**.
- Fără duplicate (0 corpuri create, același set de entități, al doilea reload identic): **PASS**.
- Depozitul neatins după migrare (re-export identic): **PASS**.
- Determinism: 2 rulări identice: **DA**, amprentă SHA-256 `dbe3045fa22e35b7a2002d242b58e7dbdf1569c3508b4000b5e672bafd57d650`.
- Verdict general: **PASS**.

## Scenariu → slot → checksum → migrare → componente identice → reload → verdict

| Scenariu | Descriere | Slot | Migrare | Checksum | Sursă personaj | Componente identice | Autoritate / cameră | Entități | Corpuri create | XP | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |
| `V2_WALKING` | V2 → V3, personaj pe jos | `character` | v2 → v3 | `8cc80793014f…` | `SNAPSHOT` | DA | `CHARACTER:character:player-1` / `character:player-1` | 71 | 0 | 100.5 | PASS |
| `V2_SEATED` | V2 → V3, personaj în taxi | `character` | v2 → v3 | `89124a0fd19e…` | `SNAPSHOT` | DA | `VEHICLE:vehicle:taxi-197` / `vehicle:taxi-197` | 72 | 0 | 100.5 | PASS |
| `V2_DEFAULT` | V2 → V3, sesiune fără slot de personaj | `character(default)` | v2 → v3 | `eee3d147f880…` | `MIGRATION_DEFAULT` | DA | `CHARACTER:character:player-1` / `character:player-1` | 71 | 0 | 100.5 | PASS |
| `V1_LEGACY` | V1 → V3, arhiva 135 fără economie | `character(default)` | v1 → v3 | `d4b1561f4536…` | `MIGRATION_DEFAULT` | DA | `CHARACTER:character:player-1` / `character:player-1` | 71 | 0 | 0 | PASS |

Checksum-ul afișat este valoarea `SHA-256` de 64 de caractere a envelope-ului v3; digesturile complete
ale fiecărui slot sunt în `report.json`. „Componente identice" compară digestul canonic al slotului
`session` (135: lume, progres, campanie, setări, profil, scenarii) și al slotului `economy` (215:
KPI, daily, XP) **înainte și după** migrare; ele sunt aceleași obiecte, deci aceiași octeți.

## Reload: pauză, autoritate, cameră, entități, XP

| Scenariu | Pauză | Mod | Input eliberat | Taste active | Taste neutralizate | Vehicule | Entități | XP / micro-XP | Recompense daily | Decontări | Al doilea reload identic |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- |
| `V2_WALKING` | DA | `PAUSED_AUTO` | DA | 0 | 1 | 70 | 71 | 100.5 / 100500000 | 1 | 3 | DA |
| `V2_SEATED` | DA | `PAUSED_AUTO` | DA | 0 | 0 | 71 | 72 | 100.5 / 100500000 | 1 | 3 | DA |
| `V2_DEFAULT` | DA | `PAUSED_AUTO` | DA | 0 | 0 | 70 | 71 | 100.5 / 100500000 | 1 | 3 | DA |
| `V1_LEGACY` | DA | `PAUSED_AUTO` | DA | 0 | 0 | 70 | 71 | 0 / 0 | 0 | 0 | DA |

După reload, `heldKeysActive` este 0 pentru că `restore` din 193 neutralizează fiecare tastă ținută
la salvare: o accelerație apăsată înainte de salvare nu produce nimic după reluare. `bodiesCreated` este
0 structural — modulul nu are API de creare de corpuri — iar numărul de entități este exact cel salvat
(personajul plus vehiculele din slot), verificat și încă o dată la reload.

## Bilanțul de mărime

| Scenariu | Document | `session` | `economy` | `character` |
| --- | ---: | ---: | ---: | ---: |
| `V2_WALKING` | 83,190 | 65,534 / 2,101,248 | 14,495 / 1,048,576 | 2,584 / 65,536 |
| `V2_SEATED` | 83,610 | 65,534 / 2,101,248 | 14,495 / 1,048,576 | 3,004 / 65,536 |
| `V2_DEFAULT` | 83,784 | 65,534 / 2,101,248 | 14,495 / 1,048,576 | 3,178 / 65,536 |
| `V1_LEGACY` | 69,301 | 65,534 / 2,101,248 | 4 / 1,048,576 | 3,178 / 65,536 |

Plafonul `session` și `economy` este exact bugetul 215; slotul `character` are un sfert din bugetul
unui corp de rând 130 (262 144 / 4 = 65,536 B), suficient pentru cele patru
stări mărginite (o tranziție de cameră, un segment deschis plus unul închis, două jurnale de flotă).

## Regula pentru sesiunile fără slot de personaj

- Poziția: spawn-ul de mers autorat al sesiunii, acceptat numai dacă walker-ul real 192 îl acceptă (un punct într-un solid este refuzat cu SPAWN_BLOCKED).
- Autoritatea: CHARACTER:<characterId>, fără nicio tastă ținută, deci nicio accelerație nu poate supraviețui reluării.
- Camera: pe același personaj, la același tick, cu orbita implicită 194 și controlul 009 al sesiunii; nicio primă cadrare nu este inventată.
- Segmentele: ținta 198 este generația de profil a sesiunii (profileId, activeVersionId, learningEpoch); fără profil, ținta se leagă de identitatea sesiunii (profileId = playerId, baseVersionId = sessionId). Modelul pornește gol la tick-ul salvării: 0 tick-uri de mers, 0 segmente, 0 candidați.
- Flota: un singur corp, la spawn, fără focus și fără corp suspendat.

## Refuzuri închise (checksum, slot, versiune, JSON, coerență)

| Caz | Descriere | Mutație | Cod | Cale | Input neschimbat | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| `CHECKSUM` | Checksum modificat | checksum.value rescris, fără recalculare | `CHECKSUM_MISMATCH` | `checksum.value` | DA | PASS |
| `MISSING_SLOT` | Slot de personaj lipsă | components.character șters, envelope re-stampat | `MISSING_FIELD` | `components.character` | DA | PASS |
| `FUTURE_FORMAT` | Format viitor | formatVersion = 4, envelope re-stampat | `FORMAT_VERSION_TOO_NEW` | `formatVersion` | DA | PASS |
| `FUTURE_SCHEMA` | Schemă viitoare | schemaVersion = 4, envelope re-stampat | `SCHEMA_TOO_NEW` | `schemaVersion` | DA | PASS |
| `CHECKSUM_BEFORE_SCHEMA` | Schemă viitoare cu checksum stricat | schemaVersion = 4 fără re-stampare | `CHECKSUM_MISMATCH` | `checksum.value` | DA | PASS |
| `PARSE_ERROR` | JSON invalid | document trunchiat la 120 de caractere | `PARSE_ERROR` | `$.createdAt` | DA | PASS |
| `DUPLICATE_KEY` | Chei duplicate | cheia format duplicată în text | `DUPLICATE_KEY` | `$.format` | DA | PASS |
| `LEGACY_READ` | Arhivă V2 citită ca V3 | documentul V2 dat cititorului V3 | `LEGACY_WALKING_SAVE` | `formatVersion` | DA | PASS |
| `ALREADY_CURRENT` | Arhivă deja V3 | upgrade pe un document V3 | `ALREADY_CURRENT` | `formatVersion` | DA | PASS |
| `SESSION_MISMATCH` | Slot din altă sesiune | character.sessionId schimbat, envelope re-stampat | `SESSION_MISMATCH` | `character` | DA | PASS |
| `SIZE_MISMATCH` | Bilanț de mărime mincinos | sizes.character + 1, envelope re-stampat | `SIZE_MISMATCH` | `sizes.character` | DA | PASS |
| `CAMERA_AUTHORITY` | Camera pe altă entitate | character.camera.entityId mutat pe un vehicul, envelope re-stampat | `CAMERA_AUTHORITY_MISMATCH` | `character.camera.entityId` | DA | PASS |
| `AUTHORITY_MISMATCH` | Autoritate 193 ≠ flotă 197 | fleet.authority numește alt personaj, envelope re-stampat | `AUTHORITY_MISMATCH` | `character.fleet.authority` | DA | PASS |
| `TICK_MISMATCH` | Tick incoerent | character.tick + 1, envelope re-stampat | `TICK_MISMATCH` | `character.authority.tick` | DA | PASS |
| `XP_TAMPERED` | XP modificat în slotul economic | accountedThroughMs + 1, doar envelope-ul V3 re-stampat | `CHECKSUM_MISMATCH` | `checksum.value` | DA | PASS |
| `WORLD_TAMPERED` | Lume modificată în slotul 135 | checkpoint.body.tick + 1, doar envelope-ul V3 re-stampat | `CHECKSUM_MISMATCH` | `checksum.value` | DA | PASS |
| `ENTITY_SET` | Set de entități diferit la reload | un vehicul viu în plus | `ENTITY_SET_MISMATCH` | `character.vehicleIds` | DA | PASS |
| `SPAWN_BLOCKED` | Spawn blocat | spawn în interiorul primei clădiri autorate | `SPAWN_BLOCKED` | `character.spawn` | DA | PASS |

Fiecare refuz este evaluat pe un document real; „input neschimbat" compară digestul canonic al
intrării înainte și după apel. Modulul nu are port de scriere, deci un refuz nu poate scrie nimic.

## Limitări

- Walker-ul 192 nu expune un invers al stării: reluarea recreează corpul la poziția salvată (biți identici) și tick-ul walker-ului repornește de la 0, în timp ce tick-ul sesiunii rămâne cel salvat în slot.
- Slotul este un contract pur: cablarea din aplicație (pauză, capturare la export, aplicarea la reload) rămâne a consumatorului; modulul nu scrie în IndexedDB și nu creează writer.
- Camera salvată în mijlocul unei tranziții de 18 tick-uri este restaurată exact (17 tick-uri rămase), dar continuarea ei depinde de tick-urile reale ale consumatorului.
- Spațiul de nume al vehiculelor din slot este lista de entități a lumii (maximum 128 din 206); un vehicul care nu există în lume nu poate fi salvat.

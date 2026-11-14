# 197 — schimbare rapidă taxi și revenire la mers

Transcript determinist generat de `scripts/run-v3-fleet-switch-report.mjs`; comanda comisă este `npm run fleet:switch`.
Machine-readable: [report.json](report.json). Contract: `197-fleet-switch-v1`, tick fix la
60 Hz, tranziție de cameră 18 tick-uri, distanța probei FOCUS
200.0000 m, raza de preluare TAKE 0.8900 m
(aceeași din 195), marjă liberă 0.0500 m, plafon de treaptă
0.1400 m.

## Sumar

- Scenarii trecute: **12/12**.
- Criteriul 1 (FOCUS mută doar camera: poziție bit-identică, entități neschimbate, camera pe taxi): **PASS**.
- TAKE (preluare reală 195, refuz pe taxi distant/indisponibil/deja ținut): **PASS**.
- Revenire la mers (ambele ramuri: poziție veche validă și zid peste ea): **PASS**.
- Lanțul FOCUS → TAKE → RETURN fără stare intermediară inconsistentă: **PASS**.
- Proiecția de UI și garda de coerență: **PASS** (4 valide, 8 refuzate).
- Determinism: 2 rulări identice: **DA**, SHA-256 `720753874ba6c1bc115c4ef64b52c2793ceea59cc0d3754e0a044f185226a936`.
- Verdict general: **PASS**.

## Referințe reale

| Referință | Valoare | Sursă |
| --- | ---: | --- |
| Hartă | `neighbourhood-compact-v1` | PBI 042 `createNeighbourhoodMap` |
| Elemente de layout | 923 | `createCityLayout` |
| Suprafețe de mers | 313 | contractul 192 |
| Solide (clădiri/obstacole) | 86 | amprentele reale ale clădirilor |
| Raza corpului (m) | 0.1500 | PBI 191 amprenta 0,300 × 0,260 m |
| Înălțimea corpului (m) | 1.7800 | PBI 191 |
| Collider sedan (m) | 0.8500 × 2.0000 | PBI 022/145 |
| Bordura reală (m) | 0.1400 | PBI 042 |
| Raza de preluare TAKE (m) | 0.8900 | PBI 195 (jumătatea anvergurii 191) |

## Scenarii: comandă → autoritate → cameră → entități → personaj mutat? → verdict

| Scenariu | Descriere | Comandă | Rezultat | Autoritate | Cameră | Diferă | Entități | Personaj mutat | Revenire | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `focus-distant` | FOCUS a taxi 200 m away; the camera may jump, the body may not | `FOCUS` | ACCEPTED | `CHARACTER:player-character` → `CHARACTER:player-character` | `player-character` → `vehicle:far-197` | DA | 2 → 2 | NU | — | PASS |
| `focus-near` | FOCUS the taxi at the kerb; the authority stays with the character | `FOCUS` | ACCEPTED | `CHARACTER:player-character` → `CHARACTER:player-character` | `player-character` → `vehicle:taxi-197` | DA | 2 → 2 | NU | — | PASS |
| `focus-same` | A second FOCUS on the already followed taxi is refused explicitly | `FOCUS` | REFUSED `SAME_ENTITY` | `CHARACTER:player-character` → `CHARACTER:player-character` | `vehicle:far-197` → `vehicle:far-197` | DA | 2 → 2 | NU | — | PASS |
| `focus-unknown` | FOCUS on an id outside the fleet list is refused with a code | `FOCUS` | REFUSED `UNKNOWN_VEHICLE` | `CHARACTER:player-character` → `CHARACTER:player-character` | `player-character` → `player-character` | NU | 2 → 2 | NU | — | PASS |
| `take-after-focus` | TAKE the focused taxi 60 ticks later: the real 195 entry, no extra camera move | `TAKE` | ACCEPTED | `CHARACTER:player-character` → `VEHICLE:vehicle:taxi-197` | `vehicle:taxi-197` → `vehicle:taxi-197` | NU | 2 → 2 | NU | — | PASS |
| `take-distant` | TAKE a taxi 200 m away is refused by the real 195 reach rule | `TAKE` | REFUSED `TAKE_REFUSED` / `OUT_OF_RANGE` | `CHARACTER:player-character` → `CHARACTER:player-character` | `player-character` → `player-character` | NU | 2 → 2 | NU | — | PASS |
| `take-immobilized` | TAKE an IMMOBILIZED taxi keeps the delivered 023 refusal | `TAKE` | REFUSED `TAKE_REFUSED` / `VEHICLE_UNAVAILABLE` | `CHARACTER:player-character` → `CHARACTER:player-character` | `player-character` → `player-character` | NU | 2 → 2 | NU | — | PASS |
| `take-same-vehicle` | TAKE the car already held is refused as SAME_VEHICLE | `TAKE` | REFUSED `SAME_VEHICLE` | `VEHICLE:vehicle:taxi-197` → `VEHICLE:vehicle:taxi-197` | `vehicle:taxi-197` → `vehicle:taxi-197` | NU | 2 → 2 | NU | — | PASS |
| `return-resume` | RETURN with a still valid remembered point resumes it bit for bit | `RETURN` | ACCEPTED | `VEHICLE:vehicle:taxi-197` → `CHARACTER:player-character` | `vehicle:taxi-197` → `player-character` | NU | 2 → 2 | NU | PREVIOUS_POSITION | PASS |
| `return-wall` | A building over the remembered point forces the valid 196 exit, no teleport | `RETURN` | ACCEPTED | `VEHICLE:vehicle:taxi-197` → `CHARACTER:player-character` | `vehicle:taxi-197` → `player-character` | NU | 2 → 2 | DA | EXIT_POINT | PASS |
| `return-not-controlled` | RETURN while walking is refused with NOT_CONTROLLED | `RETURN` | REFUSED `NOT_CONTROLLED` | `CHARACTER:player-character` → `CHARACTER:player-character` | `player-character` → `player-character` | NU | 2 → 2 | NU | — | PASS |
| `second-command-same-tick` | A second fleet command in the same fixed tick is refused | `TAKE` | REFUSED `DOUBLE_SWITCH_REFUSED` | `CHARACTER:player-character` → `CHARACTER:player-character` | `vehicle:far-197` → `vehicle:far-197` | DA | 2 → 2 | NU | — | PASS |

Fiecare rând este o comandă separată. `FOCUS` nu schimbă niciodată autoritatea și nu mută corpul;
`TAKE` este exact intrarea 195 (sau ieșirea 196 urmată de ea, când pornești dintr-o mașină);
`RETURN` este ieșirea validă 196 urmată de reluarea corpului. Refuzurile au codul comenzii și, pentru
cele compuse, cauza reală din 195/196.

## Criteriul 1 — FOCUS pe un taxi la 200.0000 m

| Dovadă | Rezultat |
| --- | --- |
| Taxi urmărit | `vehicle:far-197` la 200.0000 m |
| Autoritatea înainte / după | `CHARACTER:player-character` / `CHARACTER:player-character` |
| Biți IEEE-754 ai poziției (înainte) | `000000000000000000000000000000000000000000000000` |
| Biți IEEE-754 ai poziției (după) | `000000000000000000000000000000000000000000000000` |
| Poziție bit-identică | DA |
| Distanța maximă mișcată de corp (m) | 0 |
| Entități înainte / după | 2 / 2 |
| Entitatea trimisă camerei | `vehicle:far-197` |
| Autoritatea trimisă camerei | `player-character` |
| Camera diferă de entitatea controlată | DA |
| Tick-uri rămase la început / la sfârșit | 17 / 0 |
| Cadre de tranziție | 18/18 |
| Fiecare cadru raportează taxiul | DA |
| Tranziții / clonări / scrieri de țintă | 1 / 0 / 0 |
| A doua comandă FOCUS pe același taxi | `SAME_ENTITY` |
| Starea se reia din JSON | DA |
| Proiecția trece garda | DA |

Camera reală 194 este pornită pe personaj, apoi pașită pe taxi în tick-ul FOCUS: primul cadru
raportează deja taxiul, tranziția existentă durează exact 18 cadre, iar
corpul personajului nu s-a mișcat cu niciun bit.

## Lanțul FOCUS → TAKE → RETURN

| Pas | Tick | Autoritate | Cameră | Entități | Proiecție validă | Autoritate rezolvabilă | Cameră rezolvabilă |
| --- | ---: | --- | --- | ---: | --- | --- | --- |
| `FOCUS` | 500 | `CHARACTER:player-character` | `vehicle:taxi-197` | 2 | DA | DA | DA |
| `TAKE` | 560 | `VEHICLE:vehicle:taxi-197` | `vehicle:taxi-197` | 2 | DA | DA | DA |
| `RETURN` | 620 | `CHARACTER:player-character` | `player-character` | 2 | DA | DA | DA |

Tranzițiile de cameră măsurate: FOCUS 18 cadre, TAKE
0 cadre (aceeași țintă, deci nicio tranziție nouă), RETURN
18 cadre. Entitățile rămân constante, fiecare autoritate și fiecare
țintă de cameră se rezolvă la o entitate existentă, iar proiecția fiecărui pas trece garda: nu există
stare intermediară cu autoritatea fără entitate sau camera pe o entitate inexistentă.

## Revenirea la mers — ambele ramuri

| Ramură | Descriere | Rezultat | Sursă | Biți identici | Motiv respingere | Walker punct vechi | Walker punct ieșire | Marjă (m) | Autoritate | Mod mașină | Entități | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- |
| `resume` | The remembered point is still free | ACCEPTED | `PREVIOUS_POSITION` | DA | — | `ACCEPTED` | `ACCEPTED` | 0.1500 | `CHARACTER:player-character` | AUTO | 2 → 2 | PASS |
| `wall` | A building was built over the remembered point in the meantime | ACCEPTED | `EXIT_POINT` | NU | `CLEARANCE` | `WALK_START_BLOCKED` | `ACCEPTED` | 0.0500 | `CHARACTER:player-character` | AUTO | 2 → 2 | PASS |

Ramura `resume` folosește poziția fizică dinainte de preluare: este încă validă, deci este reluată bit
cu bit. Ramura `wall` construiește o clădire peste ea: punctul vechi este refuzat de walker-ul 192 cu
`WALK_START_BLOCKED`, iar contractul folosește punctul valid al ieșirii 196, care este acceptat de
walker și păstrează marja liberă. Mașina eliberată revine în `AUTO` în ambele ramuri.

## Proiecția de UI și garda de coerență

| Caz | Așteptat | Rezultat | Entitate controlată | Mod | Entitate urmărită | Diferă | Motiv | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `character-default` | ACCEPTED | ACCEPTED | `CHARACTER:player-character` | MANUAL (CHARACTER) | `player-character` | NU | — | PASS |
| `character-focus-taxi` | ACCEPTED | ACCEPTED | `CHARACTER:player-character` | MANUAL (CHARACTER) | `vehicle:taxi-197` | DA | FOCUS | PASS |
| `vehicle-manual` | ACCEPTED | ACCEPTED | `VEHICLE:vehicle:taxi-197` | MANUAL (VEHICLE) | `vehicle:taxi-197` | NU | — | PASS |
| `vehicle-learning` | ACCEPTED | ACCEPTED | `VEHICLE:vehicle:taxi-197` | LEARNING (VEHICLE) | `vehicle:taxi-197` | NU | — | PASS |
| `vehicle-auto` | REFUSED | REFUSED `INCONSISTENT_PROJECTION` | `VEHICLE:vehicle:taxi-197` | AUTO (VEHICLE) | `vehicle:taxi-197` | NU | — | PASS |
| `vehicle-camera-on-character-without-focus` | REFUSED | REFUSED `INCONSISTENT_PROJECTION` | `VEHICLE:vehicle:taxi-197` | MANUAL (VEHICLE) | `player-character` | NU | — | PASS |
| `divergence-flag-lies` | REFUSED | REFUSED `INCONSISTENT_PROJECTION` | `VEHICLE:vehicle:taxi-197` | MANUAL (VEHICLE) | `vehicle:taxi-197` | DA | — | PASS |
| `unknown-camera-entity` | REFUSED | REFUSED `INCONSISTENT_PROJECTION` | `VEHICLE:vehicle:taxi-197` | MANUAL (VEHICLE) | `vehicle:ghost-197` | NU | — | PASS |
| `wrong-mode` | REFUSED | REFUSED `INCONSISTENT_PROJECTION` | `VEHICLE:vehicle:taxi-197` | LEARNING (VEHICLE) | `vehicle:taxi-197` | NU | — | PASS |
| `label-mismatch` | REFUSED | REFUSED `INCONSISTENT_PROJECTION` | `CHARACTER:player-character` | MANUAL (VEHICLE) | `vehicle:taxi-197` | NU | — | PASS |
| `entity-count-mismatch` | REFUSED | REFUSED `INCONSISTENT_PROJECTION` | `VEHICLE:vehicle:taxi-197` | MANUAL (VEHICLE) | `vehicle:taxi-197` | NU | — | PASS |
| `state-focus-outside-list` | REFUSED | REFUSED `INCONSISTENT_PROJECTION` | `CHARACTER:player-character` | MANUAL (CHARACTER) | `vehicle:taxi-197` | DA | FOCUS | PASS |

Proiecția expune entitatea controlată (`CHARACTER:<id>` / `VEHICLE:<id>`), modul, sursa modului,
entitatea urmărită de cameră, steagul de divergență și motivul `FOCUS`. Garda refuză o mașină
controlată în `AUTO`, o cameră pe personaj cât timp o mașină este controlată fără motiv de `FOCUS`,
un steag care contrazice id-urile, o entitate necunoscută, un mod care nu vine din starea 024 și un
număr de entități care nu corespunde listei.

## Determinism

2 rulări complete, identice;
amprenta SHA-256 a raportului (fără câmpul de determinism) este `720753874ba6c1bc115c4ef64b52c2793ceea59cc0d3754e0a044f185226a936`.

## Limitări

- Contractul este pur headless: nu creează scenă, cameră Babylon, input sau corpuri; compunerea (camera 194, input 066, vehicule 024) aplică cererile returnate în tick-ul curent.
- FOCUS nu are regulă de distanță: un taxi la 200 m este o țintă validă, iar dovada arată poziția bit-identică și numărul de entități neschimbat. „Aproape” rămâne o regulă exclusivă a lui TAKE, prin 195.
- TAKE dintr-o mașină compune 196 + 195 în același tick; dacă intrarea în noua mașină e refuzată, ieșirea este raportată dar nu aplicată, deci nu există un moment cu autoritatea pe o entitate fără corp.
- Poziția de revenire este cea a corpului suspendat la preluare, nu o poziție reconstruită: dacă acea poziție a rămas validă, este reluată bit-identic; altfel se folosește punctul valid al ieșirii 196. Contractul nu mută corpul pas cu pas înapoi.
- Proiecția de UI raportează MANUAL pentru personaj, pentru că 193 îl conduce manual; cele trei moduri 024 rămân exclusiv ale vehiculului. Etichetele vizuale rămân să fie formatate de UI.
- O singură comandă de flotă pe tick: FOCUS, TAKE și RETURN nu pot fi combinate în același tick, ca tranziția de cameră și schimbarea de autoritate să rămână observabile separat.
- Registrul 068 scrie doar tick, controlMode și appliedProfileVersion; mașina eliberată de 196 este returnată ca date și trebuie aplicată de proprietarul 061/044/068.
- Proba este deterministă și headless; feel-ul saltului de cameră și validarea în browser rămân la integrarea ulterioară.

# 196 — ieșirea din mașină și punct valid

Transcript determinist generat de `scripts/run-v3-exit-report.mjs`; comanda comisă este `npm run exit:report`.
Machine-readable: [report.json](report.json). Contract: `196-exit-vehicle-v1`, tick fix la
60 Hz, mod de eliberare `AUTO`, marjă liberă 0.0500 m,
inel secundar la 0.6000 m, plafon de treaptă 0.1400 m,
viteză maximă de ieșire 1.3710 m/s.

## Sumar

- Scenarii trecute: **12/12**.
- Criteriul 1 (punct fizic valid, refuz pe fiecare motiv, fără teleport): **PASS**.
- Criteriul 2a (autoritatea revine la personaj, vehiculul nu mai primește input): **PASS**.
- Criteriul 2b (mașina eliberată reia ruta de dinainte de preluare, mod AUTO): **PASS**.
- Camera 194 revine în același tick, cu tranziția existentă de 18 tick-uri: **PASS**.
- Walker-ul 192 acceptă punctul ales și refuză fiecare candidat cu collider: **PASS** (13/13).
- Determinism: 2 rulări identice: **DA**, SHA-256 `419c5643fe21039781692ccc69bda3594330ac82044c5940e6f3d4c2d4b75d0c`.
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

## Scenarii: candidat ales, distanțe măsurate independent, verdict

| Scenariu | Descriere | Rezultat | Candidați testați | Ales | Penetrare max (m) | Marjă min (m) | Sub sol (m) | Start walker | Verdict |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | --- | --- |
| `open-street` | Civil parked at the real kerb; the left door leads to the roadway | ACCEPTED | 1 | `LEFT:R0` | 0 | 0.0500 | 0 | ACCEPTED | PASS |
| `door-obstacle` | A real 165 obstacle box covers the left door; the next valid point must be chosen | ACCEPTED | 2 | `RIGHT:R0` | 0 | 0.0500 | 0 | ACCEPTED | PASS |
| `occupied-by-car` | Another parked car 0.10 m away leaves no room for the 191 footprint | ACCEPTED | 2 | `RIGHT:R0` | 0 | 0.0500 | 0 | ACCEPTED | PASS |
| `rear-only` | Both doors boxed in; the rear ring is the next valid point | ACCEPTED | 3 | `REAR:R0` | 0 | 0.0500 | 0 | ACCEPTED | PASS |
| `real-wall` | Real building bld:blk:0-0:0-0 covers the left door; the right side is on the court | ACCEPTED | 2 | `RIGHT:R0` | 0 | 0.0500 | 0 | ACCEPTED | PASS |
| `step-too-high` | A 0.60 m platform covers the left door, above the real 0.14 m curb ceiling | ACCEPTED | 2 | `RIGHT:R0` | 0 | 0.0500 | 0 | ACCEPTED | PASS |
| `below-map` | A hole 0.50 m below the map plane covers the left door; the body may not appear there | ACCEPTED | 2 | `RIGHT:R0` | 0 | 0.0500 | 0 | ACCEPTED | PASS |
| `moving-slow` | A creeping 0.30 m/s car may still be left at the contact ring | ACCEPTED | 1 | `LEFT:R0` | 0 | 0.0500 | 0 | ACCEPTED | PASS |
| `moving-fast` | An 8.50 m/s car may not be left: the explicit stop rule refuses it | REFUSED `VEHICLE_MOVING` | 0 | — | — | — | — | NOT_APPLICABLE | PASS |
| `no-valid-exit` | All four sides and both rings are blocked; no teleport is allowed | REFUSED `NO_VALID_EXIT` | 8 | — | — | — | — | NOT_APPLICABLE | PASS |
| `seat-not-controlled` | The authority is already the character, so no car seat can be released | REFUSED `NOT_CONTROLLED` | 0 | — | — | — | — | NOT_APPLICABLE | PASS |
| `second-exit` | A second exit in the same fixed tick is refused by the journal | REFUSED `DOUBLE_EXIT_REFUSED` | 0 | — | — | — | — | NOT_APPLICABLE | PASS |

Distanțele sunt măsurate independent de contract, cu `measurePenetration` din fixtures 192, față de
**fiecare** solid și **fiecare** caroserie: penetrarea maximă este 0, marja minimă este pozitivă, iar
cota punctului este exact suprafața autorată (0 sub sol). Un rând `REFUSED` nu are punct, deci nu are
distanțe.

## Candidați: ordinea deterministă și motivul fiecărui refuz

| Scenariu | Candidat | Latură/inel | Valid | Motiv | Sol (m) | Marjă (m) |
| --- | --- | --- | --- | --- | ---: | ---: |
| `open-street` | `LEFT:R0` | LEFT/0 | DA | valid | 0 | 0.0500 |
| `door-obstacle` | `LEFT:R0` | LEFT/0 | NU | `SOLID` (`hazard:exit-196`) | 0 | -0.2000 |
| `door-obstacle` | `RIGHT:R0` | RIGHT/0 | DA | valid | 0 | 0.0500 |
| `occupied-by-car` | `LEFT:R0` | LEFT/0 | NU | `OTHER_VEHICLE` (`vehicle:vehicle:neighbour-196`) | 0 | -0.2000 |
| `occupied-by-car` | `RIGHT:R0` | RIGHT/0 | DA | valid | 0 | 0.0500 |
| `rear-only` | `LEFT:R0` | LEFT/0 | NU | `SOLID` (`fixture:left`) | 0 | -0.2000 |
| `rear-only` | `RIGHT:R0` | RIGHT/0 | NU | `SOLID` (`fixture:right`) | 0 | -0.2000 |
| `rear-only` | `REAR:R0` | REAR/0 | DA | valid | 0 | 0.0500 |
| `real-wall` | `LEFT:R0` | LEFT/0 | NU | `SOLID` (`bld:blk:0-0:0-0`) | 0.1400 | -0.1500 |
| `real-wall` | `RIGHT:R0` | RIGHT/0 | DA | valid | 0.1400 | 0.0500 |
| `step-too-high` | `LEFT:R0` | LEFT/0 | NU | `STEP_TOO_HIGH` | 0.6000 | — |
| `step-too-high` | `RIGHT:R0` | RIGHT/0 | DA | valid | 0 | 0.0500 |
| `below-map` | `LEFT:R0` | LEFT/0 | NU | `BELOW_MAP` | -0.5000 | — |
| `below-map` | `RIGHT:R0` | RIGHT/0 | DA | valid | 0 | 0.0500 |
| `moving-slow` | `LEFT:R0` | LEFT/0 | DA | valid | 0 | 0.0500 |
| `no-valid-exit` | `LEFT:R0` | LEFT/0 | NU | `SOLID` (`fixture:left`) | 0 | -0.2000 |
| `no-valid-exit` | `RIGHT:R0` | RIGHT/0 | NU | `SOLID` (`fixture:right`) | 0 | -0.2000 |
| `no-valid-exit` | `REAR:R0` | REAR/0 | NU | `SOLID` (`fixture:rear`) | 0 | -0.2000 |
| `no-valid-exit` | `FRONT:R0` | FRONT/0 | NU | `SOLID` (`fixture:front`) | 0 | -0.2000 |
| `no-valid-exit` | `LEFT:R1` | LEFT/1 | NU | `SOLID` (`fixture:left`) | 0 | -0.2000 |
| `no-valid-exit` | `RIGHT:R1` | RIGHT/1 | NU | `SOLID` (`fixture:right`) | 0 | -0.2000 |
| `no-valid-exit` | `REAR:R1` | REAR/1 | NU | `SOLID` (`fixture:rear`) | 0 | -0.2000 |
| `no-valid-exit` | `FRONT:R1` | FRONT/1 | NU | `SOLID` (`fixture:front`) | 0 | -0.2000 |

Ordinea este fixă: `LEFT:R0`, `RIGHT:R0`, `REAR:R0`, `FRONT:R0`, apoi același inel secundar la
0.6000 m. Un candidat este respins dacă amprenta 191 atinge caroseria eliberată
(`SOLID` cu id-ul mașinii), altă mașină (`OTHER_VEHICLE`), un solid autorat (`SOLID`), dacă treapta
depășește bordura reală (`STEP_TOO_HIGH`) sau dacă suprafața este sub planul hărții (`BELOW_MAP`).
Când niciun candidat nu supraviețuiește, ieșirea este refuzată cu `NO_VALID_EXIT` și corpul nu este
mutat nicăieri.

## Criteriul 2a — autoritatea revine la personaj în același tick

| Dovadă | Rezultat |
| --- | --- |
| Autoritatea după ieșire | `CHARACTER:player-character` |
| Comanda produsă de arbitrajul 193 | `CHARACTER` |
| Comenzi de vehicul înainte / după | 210 / 0 |
| Comenzi livrate personajului în tick-ul ieșirii | 1 |
| Livrare către vehicul după tranziție | refuzată: DA (`INACTIVE_CONSUMER_REFUSED`) |
| A doua livrare în același tick | refuzată: DA (`DOUBLE_DELIVERY_REFUSED`) |
| Acțiuni ținute neutralizate la tranziție | `throttle` |
| Comanda personajului la tranziție este vidă | DA |
| Tranziții de autoritate | 1 |
| Entități înainte / după | 2 / 2 |
| A doua ieșire în același tick | refuzată: DA (`DOUBLE_EXIT_REFUSED`) |
| Ieșire repetată după eliberare | `NOT_CONTROLLED` |
| Startul walker-ului acceptat | DA |
| Biți poziție de start (IEEE-754) | `405680000000000000000000000000004066199999999999` |

O singură autoritate primește input: vehiculul este inactiv imediat, iar a doua livrare din tick este
refuzată. Un `throttle` ținut peste tranziție rămâne neutralizat, deci nici personajul nu primește
imediat o comandă de mers.

## Criteriul 2b — mașina eliberată reia ruta de dinainte de preluare

| Vehicul | Mod (baseline → preluare → eliberare) | Câmpuri identice | Cursă | Progres (m) | Amprentă identică |
| --- | --- | --- | --- | ---: | --- |
| `vehicle:civil-196` | AUTO → MANUAL → AUTO | DA / DA / DA / DA | — | 0 | DA |
| `vehicle:taxi-196` | LEARNING → MANUAL → AUTO | DA / DA / DA / DA | ride-061-196 | 412.5 | DA |

Câmpurile comparate sunt `state.laneId`, `state.routeLaneIds`, `state.rideId`, `state.rideProgressM`. Snapshot-ul de referință este cel de **dinainte de preluare**
(195): ieșirea nu copiază starea condusă manual, ci restaurează atribuirea de rută și păstrează doar
viteza, cota și tick-ul curent. Amprenta `vehicleExitRouteBits` codifică fiecare număr ca 8 bytes
IEEE-754 și fiecare text ca puncte de cod; o variație de 1e-12 m sau o bandă lipsă o schimbă. Modul
devine `AUTO` chiar și când mașina era `LEARNING` înainte de preluare.

## Camera 194 — aceeași autoritate, în același tick

| Dovadă | Rezultat |
| --- | --- |
| Tick-ul ieșirii / tick-ul cadrului | 211 / 211 |
| Autoritatea trimisă camerei | `player-character` (anterior `vehicle:civil-196`) |
| `entityId` din primul cadru | `player-character` |
| Schimbare în același tick | DA |
| Tranziție pornită | DA |
| Tick-uri rămase la început / la sfârșit | 17 / 0 |
| Cadre de tranziție | 18/18 |
| Fiecare cadru raportează autoritatea | DA |
| Clonări / scrieri de țintă | 0 / 0 |

## Determinism

2 rulări complete, identice;
amprenta SHA-256 a raportului (fără câmpul de determinism) este `419c5643fe21039781692ccc69bda3594330ac82044c5940e6f3d4c2d4b75d0c`.

## Limitări

- Contractul este pur headless: nu creează scenă, cameră Babylon, input sau corpuri; compunerea (input 066, camera 194, vehiculul 024) aplică decizia în tick-ul curent.
- Punctul de ieșire este planar, ca fizica 192: se măsoară în X/Z, iar verticalitatea intră doar prin înălțimea suprafeței și prin plafonul real de 0,14 m. Un portal, o trapă sau un gard suspendat nu sunt modelate.
- Punctul este mijlocul flancului sau al capului caroseriei, nu un mâner modelat; inelul al doilea este la 0,60 m, deci o mașină parcată la mai puțin de 0,80 m de un zid nu are o ieșire „prin” zid.
- Registrul 068 scrie doar `tick`, `controlMode` și `appliedProfileVersion`; ruta, banda, cursa și progresul restaurate sunt returnate ca date și trebuie aplicate de proprietarul 061/044. Contractul compară datele returnate bit-identic cu snapshot-ul de dinainte de preluare, dar nu poate muta singur registrul flotei.
- Progresul pe rută este cel de dinainte de preluare, nu cel condus manual: segmentul MANUAL/LEARNING se închide separat (069), iar poziția fizică a mașinii rămâne cea reală. Dacă designul cere ca progresul manual să continue cursa, baseline-ul trebuie să fie starea curentă și contractul nu este locul potrivit.
- Regula mașinii în mișcare este explicită: peste viteza nominală a clipului de mers din 191 (1,3710 m/s) ieșirea este refuzată cu `VEHICLE_MOVING`; sub ea, punctul se calculează din poza mașinii din același tick.
- Mapa este planul de sol implicit: o suprafață sub el este refuzată cu `BELOW_MAP`. O hartă autorată cu alt plan de bază trebuie să își declare propriul `defaultGroundM`.
- Proba este deterministă și headless; feel-ul ieșirii, animația `exit-vehicle` din 191 și validarea în browser rămân la integrarea 196.

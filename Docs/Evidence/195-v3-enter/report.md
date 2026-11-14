# 195 — intrarea în orice mașină din proximitate

Transcript determinist generat de `scripts/run-v3-enter-report.mjs`; comanda comisă este `npm run enter:report`.
Machine-readable: [report.json](report.json). Contract: `195-enter-vehicle-v1`, tick fix la
60 Hz, rază de acces 0.8900 m (jumătatea anvergurii
brațelor măsurate în 191), mod de intrare `MANUAL`.

## Sumar

- Scenarii de acces trecute: **10/10**.
- Criteriul 1 (orice mașină existentă, cu refuzuri reale codificate): **PASS**.
- Criteriul 2a (o singură autoritate, personajul nu mai primește input, corpul rămâne): **PASS**.
- Criteriul 2b (starea mașinii bit-identică, doar modul devine MANUAL): **PASS**.
- Camera 194 primește noua autoritate în același tick, cu tranziția de 18 tick-uri: **PASS**.
- Determinism: 2 rulări identice: **DA**, SHA-256 `6af63aee34ce49530e7a250c89c488ed5bfbec06302e429390235736d140ba52`.
- Verdict general: **PASS**.

## Referințe reale

| Referință | Valoare | Sursă |
| --- | ---: | --- |
| Hartă | `neighbourhood-compact-v1` | PBI 042 `createNeighbourhoodMap` |
| Elemente de layout | 923 | `createCityLayout` |
| Suprafețe de mers | 313 | contractul 192 |
| Solide (clădiri/obstacole) | 86 | amprentele reale ale clădirilor |
| Clădire folosită pentru zidul dintre | `bld:blk:0-0:0-0` | colțul de sud-vest la (13.0369, 24.7154) |
| Atingerea personajului (m) | 0.8900 | PBI 191 `createCharacterAsset().measured.armSpanM / 2` |
| Collider sedan (m) | 0.8500 × 2.0000 | PBI 022/145 `VEHICLE_COLLISION_HALF_EXTENTS_M` |

## Scenarii: vehicul → distanță → acces → motiv → verdict

| Scenariu | Descriere | Vehicul | Distanță (m) | Acces | Motiv | Verdict |
| --- | --- | --- | ---: | --- | --- | --- |
| `civil-open` | Civil parked in the near lane, character on the roadway at the door | `vehicle:civil-195` (CIVILIAN) | 0.3000 | ACCEPTED | acces fizic confirmat | PASS |
| `taxi-in-ride` | Taxi already on a ride, same reach; the ride and the progress must survive | `vehicle:taxi-195` (TAXI) | 0.3000 | ACCEPTED | acces fizic confirmat | PASS |
| `seat-occupied` | The single player seat already holds another car | `vehicle:taxi-195` (UNKNOWN) | — | REFUSED | `VEHICLE_OCCUPIED` (`vehicle:taxi-195`) | PASS |
| `same-tick-second-entry` | A second entry in the tick that already accepted one | `vehicle:taxi-195` (UNKNOWN) | — | REFUSED | `DOUBLE_ENTRY_REFUSED` | PASS |
| `out-of-range` | Character three metres away from the door, clear line | `vehicle:far-195` (CIVILIAN) | 3.0150 | REFUSED | `OUT_OF_RANGE` | PASS |
| `door-blocked` | A real obstacle box covers the door | `vehicle:civil-195` (CIVILIAN) | 0.3000 | REFUSED | `PATH_BLOCKED` (`hazard:obstacle-01`) | PASS |
| `immobilized` | Vehicle availability is IMMOBILIZED in the PBI 023 damage state | `vehicle:civil-195` (CIVILIAN) | — | REFUSED | `VEHICLE_UNAVAILABLE` | PASS |
| `unknown-vehicle` | Intent names a car that is not in the fleet snapshot | `vehicle:missing-195` (UNKNOWN) | — | REFUSED | `UNKNOWN_VEHICLE` | PASS |
| `vehicle-at-door` | Another car body covers the target door | `vehicle:civil-195` (CIVILIAN) | 0.3000 | REFUSED | `PATH_BLOCKED` (`vehicle:vehicle:neighbour-195`) | PASS |
| `wall-between` | Building bld:blk:0-0:0-0 corner between the character and the door | `vehicle:wall-195` (CIVILIAN) | 0.7071 | REFUSED | `PATH_BLOCKED` (`bld:blk:0-0:0-0`) | PASS |

Distanța este planară, de la centrul picioarelor la mijlocul flancului caroseriei, exact axa de
coliziune a walker-ului 192. Ușa este flancul cel mai apropiat; un zid, un obstacol sau o altă
caroserie oprește accesul cu `PATH_BLOCKED`, iar un vehicul `IMMOBILIZED` din 023 cu
`VEHICLE_UNAVAILABLE`. Taxiul aflat în cursă este acceptat: cursa nu este un motiv de refuz.

## Criteriul 2a — o singură autoritate, fără a distruge personajul

| Dovadă | Rezultat |
| --- | --- |
| Autoritatea după intrare | `VEHICLE:vehicle:civil-195` |
| Comanda produsă de arbitrajul 193 | `VEHICLE` |
| Comenzi livrate personajului înainte / după | 42 / 0 |
| Comenzi livrate vehiculului în tick-ul intrării | 1 |
| Livrare către personaj după tranziție | refuzată: DA (`INACTIVE_CONSUMER_REFUSED`) |
| A doua livrare în același tick | refuzată: DA (`DOUBLE_DELIVERY_REFUSED`) |
| Acțiuni ținute neutralizate la tranziție | `throttle` |
| Tranziții de autoritate | 1 |
| Entități înainte / după | 2 / 2 |
| Corpul personajului păstrat | DA |
| Biți poziție personaj înainte / după | `405680000000000000000000000000004066166666666666` / `405680000000000000000000000000004066166666666666` |
| A doua intrare în același tick | refuzată: DA (`DOUBLE_ENTRY_REFUSED`) |
| Reintrare fără jurnal, în alt tick | `VEHICLE_OCCUPIED` |

Personajul nu este șters, clonat sau mutat: numărul de entități rămâne același, iar biții
IEEE-754 ai poziției autoritare sunt identici înainte și după decizie.

## Criteriul 2b — cursa mașinii este păstrată bit-identic

| Vehicul | Mod | Biți identici | Cursă | Benzi de rută | Progres (m) | Câmpuri identice |
| --- | --- | --- | --- | ---: | ---: | ---: |
| `vehicle:civil-195` | AUTO → MANUAL | DA | — | 0 | 0 | 16/16 |
| `vehicle:taxi-195` | LEARNING → MANUAL | DA | `ride-061-7` | 3 | 412.5000 | 16/16 |

Amprenta este calculată din biții IEEE-754 ai fiecărui număr și din codurile fiecărui text, în
ordine fixă, și **exclude doar** `state.controlMode`. O schimbare de 1e-12 m în poziție, viteză sau
progres, o bandă de rută lipsă sau un `rideId` diferit schimbă amprenta (vezi testele).

**`vehicle:civil-195`** — câmpuri păstrate: `positionM`, `yawRad`, `halfExtentsM`, `bottomM`, `topM`, `availability`, `driverKind`, `classId`, `state.tick`, `state.velocityMps`, `state.laneId`, `state.maneuverState`, `state.routeLaneIds`, `state.rideId`, `state.rideProgressM`, `state.appliedProfileVersion`.

**`vehicle:taxi-195`** — câmpuri păstrate: `positionM`, `yawRad`, `halfExtentsM`, `bottomM`, `topM`, `availability`, `driverKind`, `classId`, `state.tick`, `state.velocityMps`, `state.laneId`, `state.maneuverState`, `state.routeLaneIds`, `state.rideId`, `state.rideProgressM`, `state.appliedProfileVersion`.

## Camera 194 — aceeași autoritate, în același tick

| Dovadă | Rezultat |
| --- | --- |
| Tick-ul intrării / tick-ul cadrului | 43 / 43 |
| Autoritatea trimisă camerei | `vehicle:civil-195` (anterior `player-character`) |
| `entityId` din primul cadru | `vehicle:civil-195` |
| Schimbare în același tick | DA |
| Tranziție pornită | DA |
| Tick-uri rămase la început / la sfârșit | 17 / 0 |
| Cadre de tranziție | 18/18 |
| Fiecare cadru raportează autoritatea | DA |
| Clonări / scrieri de țintă | 0 / 0 |

## Determinism

2 rulări complete, identice;
amprenta SHA-256 a raportului (fără câmpul de determinism) este `6af63aee34ce49530e7a250c89c488ed5bfbec06302e429390235736d140ba52`.

## Limitări

- Contractul este pur headless: nu creează scenă, cameră Babylon, input sau corpuri; compunerea (input 066, camera 194, vehiculul 024) aplică decizia în tick-ul curent.
- Accesul este planar, ca fizica 192: distanța se măsoară în X/Z, iar solidele contează doar dacă se suprapun vertical cu corpul personajului. Un portal, o trapă sau o ușă deschisă nu sunt modelate.
- Ușa este mijlocul flancului caroseriei (amprenta reală 0,85 × 2,00 m), nu un mâner modelat; un vehicul cu o ușă în altă poziție ar cere un câmp de contract suplimentar.
- „Ocupat” este singurul scaun de jucător din 068 (un vehicul primește inputul), nu al doilea jucător: contractul nu are noțiunea de alt șofer uman.
- Indisponibilitatea folosește regula reală din 023 (`IMMOBILIZED` = accelerație zero și frână maximă); 068 nu are o misiune care să interzică preluarea, deci nu a fost inventată una.
- Proba este deterministă și headless; feel-ul intrării, animația `enter-vehicle` din 191 și validarea în browser rămân la integrarea 195/196.

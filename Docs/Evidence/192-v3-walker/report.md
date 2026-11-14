# 192 — controller fizic pentru mers pe jos

Transcript determinist generat de `scripts/run-v3-walker-report.mjs`; comanda comisă este `npm run walker:report`.
Machine-readable: [report.json](report.json). Contract: `192-walker-v1`, tick fix la
60 Hz.

## Sumar

- Scenarii de deplasare/coliziune trecute: **8/8**.
- Penetrare maximă măsurată în orice solid: **1.44e-15 m**.
- Criteriul 1 (nu trece prin clădiri și vehicule): **PASS**.
- Criteriul 2 (fizica de mers nu dublează corpurile auto): **PASS**.
- Autoritate unică, cadru de render bit-identic: **PASS**.
- Determinism: 2 rulări, identice: **DA**, SHA-256 `c9d66eca1d3f7b4164537d9113467851b76cd238ae34fc719cf072019d8fa228`.
- Verdict general: **PASS**.

## Referințe reale

| Referință | Valoare | Sursă |
| --- | ---: | --- |
| Hartă | `neighbourhood-compact-v1` | PBI 042 `createNeighbourhoodMap` |
| Elemente de layout | 923 | `createCityLayout` |
| Suprafețe de mers | 313 | pardoseli autorate + interiorul insulei |
| Solide statice | 86 (86 clădiri) | amprentele reale ale clădirilor |
| Elevația trotuarului (m) | 0.1400 | `CITY_LAYOUT_DEFAULTS.sidewalkElevationM` |
| Bandă de trotuar folosită | `walk:blk:0-0:N` | prima bandă cu bordură reală peste carosabil |
| Clădire folosită | `bld:blk:0-0:0-0` | prima clădire cu fațada sudică accesibilă |
| Collider vehicul (m) | 0.8500 × 2.0000 | PBI 022/145 `VEHICLE_COLLISION_HALF_EXTENTS_M`, clasa sedan |

Capsula personajului: rază 0.1500 m, înălțime 1.7800 m — PBI 191 amprentă 0.300 × 0.260 m (rază = latura mare / 2) și înălțime 1.780 m.
Vitezele de gait sunt derivate din clipurile 191: mers 1.3710 m/s,
alergare 2.9091 m/s. Plafonul de treaptă este bordura reală de
0.1400 m.

## Scenarii: pași → poziție finală → penetrare → verdict

| Scenariu | Descriere | Pași | Poziție finală (x, y, z) | Distanță (m) | Penetrare max (m) | Clip final | Trepte sus/jos/refuzate/contacte | Verdict |
| --- | --- | ---: | --- | ---: | ---: | --- | --- | --- |
| `wall` | Mers în zidul unei clădiri reale | 240 | `34.1189, 0.1400, 24.5654` | 1.8500 | 1.44e-15 | idle | 0/0/0/0 | PASS |
| `sidewalk` | Mers pe trotuarul real | 120 | `92.5966, 0.1400, 175.0000` | 2.5966 | 0 | walk | 0/0/0/0 | PASS |
| `curb-step-up` | Urcarea bordurii reale de 0.14 m | 120 | `90.0000, 0.1400, 174.1034` | 2.5966 | 0 | walk | 1/0/0/0 | PASS |
| `curb-step-down` | Coborârea bordurii reale de 0.14 m | 120 | `90.0000, 0, 177.5966` | 2.5966 | 0 | walk | 0/1/0/0 | PASS |
| `step-over-ceiling` | Treaptă de 0.30 m, peste plafonul de 0.14 m | 120 | `0, 0, 1.8500` | 1.8500 | 0 | idle | 0/0/1/0 | PASS |
| `drop-over-ceiling` | Coborâre de 0.28 m, peste plafon | 120 | `0, 0.1400, 1.8500` | 1.8500 | 0 | idle | 0/0/1/0 | PASS |
| `obstacle` | Obstacol static pe carosabil | 180 | `0, 0, 2.4000` | 2.4000 | 0 | idle | 0/0/0/0 | PASS |
| `vehicle-contact` | Contact cu sedanul real (0.15 m rază + 0.85 m jumătate lățime + 0.05 m marjă) | 180 | `90.0000, 0, 0.7500` | 1.7500 | 0 | idle | 0/0/0/1 | PASS |

Poziția este centrul tălpilor, în metri. „Trepte sus/jos/refuzate” numără tick-urile cu schimbare de
nivel, episoadele de refuz și contactele noi cu un vehicul. Penetrarea este măsurată independent de
walker, din poligoanele lumii și cilindrul de 0.1500 m.

## Criteriul 2 — fizica de mers nu dublează corpurile auto

| Dovadă | Rezultat |
| --- | --- |
| Corpuri auto create de walker | **0** |
| Corpuri auto create după refuzuri | **0** |
| `registerVehicleBody` refuzat | DA (`VEHICLE_BODY_WRITE_REFUSED`) |
| `writeVehicleState` refuzat | DA (`VEHICLE_STATE_WRITE_REFUSED`) |
| Poziția vehiculului neschimbată de tick-urile de mers | DA (biți `405680000000000000000000000000003ffccccccccccccd`) |
| Vehicul mutat de proprietar | DA |
| Biții proprietarului păstrați după alte tick-uri | DA |
| Walker-ul a reacționat la noua poziție | DA |
| Tick-uri de mers din proba de mutare | 180 |

## Autoritatea unică și clipul din viteza reală

| Dovadă | Rezultat |
| --- | --- |
| Tick-uri | 120 |
| Cadre de render | 120 |
| Cadre bit-identice cu poziția walker-ului | **120/120** |
| Scrieri de poziție ale walker-ului | 52 |
| Scrieri de poziție prin animație | 0 |
| Al doilea writer | 0 |
| Scriere prin animație refuzată | DA (`AUTHORITY_WRITE_REFUSED`) |
| Stare înghețată | DA |

| Situație | Viteză măsurată (m/s) | Clip ales | Clip așteptat | Verdict |
| --- | ---: | --- | --- | --- |
| comandă RUN pe teren liber | 2.9091 | `run` | `run` | PASS |
| comandă WALK pe teren liber | 1.3710 | `walk` | `walk` | PASS |
| fără comandă de mers | 0 | `idle` | `idle` | PASS |
| comandă RUN într-un perete | 0 | `idle` | `idle` | PASS |

## Determinism

2 rulări complete, identice;
amprenta SHA-256 a raportului (fără câmpul de determinism) este `c9d66eca1d3f7b4164537d9113467851b76cd238ae34fc719cf072019d8fa228`.

## Limitări

- Coliziunea este planară: personajul e un cilindru, iar lumea e reprezentată prin poligoane convexe cu înălțime. Pantele continue și interioarele nu fac parte din contractul 042 și nu sunt simulate.
- Vehiculele sunt citite ca amprente înghețate (colliderul real 0,85 × 2,00 m din 022/145); walker-ul nu creează, nu înregistrează și nu scrie niciun corp auto.
- Camera, intrarea în vehicul și transferul autorității aparțin PBI 195; aici există doar deplasarea pe sol, coliziunile și treptele.
- Treptele sunt tratate ca suprafață + plafon de urcare/coborâre; o muchie peste plafon se comportă ca un perete, nu ca o rampă.
- Proba este headless și deterministă; integrarea vizuală în scena Babylon folosește reprezentarea deja livrată de 191.

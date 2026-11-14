# 191 — personaj: animații și reprezentare

Transcript determinist generat de `scripts/run-v3-character-report.mjs`; comanda comisă este `npm run character:report`.
Machine-readable: [report.json](report.json). Contract: `191-character-v1`, eșantionare la
60 Hz.

## Sumar

- Verificări de scară/pivoturi: **9/9** trecute, asset **ACCEPTAT**.
- Clipuri cu contact valid: **5/5**.
- Cadre verificate pentru poziția autoritară: **309**, toate bit-identice: **DA**.
- Cazuri incompatibile refuzate: **3/3**.
- Determinism: 2 rulări, identice: **DA**, SHA-256 `e713aecda0fc8f8c1ed6add649fcff7547e8aee1bc9d986ca850a6518811895a`.
- Verdict general: **PASS**.

## Referințe reale din lume

Sursa: PBI 042 city layout defaults + rețeaua reală de 96 benzi din harta neighbourhood, PBI 023 sedan mechanics 023-mechanics-v1, PBI 145 sedan NEAR geometry.

| Referință | Valoare | Sursă reală |
| --- | ---: | --- |
| Lățime trotuar (m) | 2.4000 | `CITY_LAYOUT_DEFAULTS.sidewalkWidthM` |
| Înălțime bordură (m) | 0.1400 | `CITY_LAYOUT_DEFAULTS.sidewalkElevationM` |
| Lățime bandă (m) | 3.4000 | 96 benzi reale, valori 3.4 |
| Plafon vehicul deasupra solului (m) | 1.6500 | sedan: `0.8300` − `-0.8200` (PBI 145/023) |
| Prag ușă deasupra solului (m) | 0.5400 | sedan: `-0.2800` − `-0.8200` |
| Lățime cabină între geamuri (m) | 1.5100 | fețele interioare ale geamurilor laterale sedan |
| Geometrie sedan NEAR (B) | 28112 | `buildVehicleGeometry('sedan','NEAR')` |

## Scara și pivoturile assetului

Asset: `pedestrian-adult-01` (191-character-v1), scală 1. Declarat:
înălțime 1.7800 m, ochi 1.6450 m,
anvergură 1.7800 m.

| Metrică | Valoare | Unitate |
| --- | ---: | --- |
| Înălțime totală | 1.7800 | m |
| Înălțime ochi | 1.6450 | m |
| Anvergură brațe | 1.7800 | m |
| Lățime umeri | 0.5200 | m |
| Lățime șolduri | 0.2000 | m |
| Amprentă lățime | 0.3000 | m |
| Amprentă adâncime | 0.2600 | m |
| Înălțime șold | 0.9350 | m |
| Lungime picior (șold–talpă) | 0.9350 | m |
| Talpă sub gleznă | 0.0750 | m |
| Pas maxim (mers) | 0.1600 | m |
| Înălțime la intrarea în mașină | 1.2812 | m |
| Punctul cel mai de jos la repaus | -9.71e-17 | m |

### Verificări de compatibilitate

| ID | Verificare | Valoare | Referință | Toleranță | Verdict | Detaliu |
| --- | --- | ---: | ---: | ---: | --- | --- |
| `DECLARATION` | Declarație vs. măsurătoare (înălțime, ochi, anvergură) | 0 | 0 | 1.00e-9 | PASS | height 1.780 m, eye 1.645 m, span 1.780 m |
| `HEIGHT` | Înălțime totală în intervalul uman | 1.7800 | 1.5000 | 0.5000 | PASS | interval admis 1.50–2.00 m |
| `EYE_HEIGHT` | Raport înălțime ochi / înălțime totală | 0.9242 | 0.8800 | 0.0700 | PASS | interval admis 0.88–0.95 |
| `SIDEWALK_FIT` | Lățime necesară pe trotuar (umeri + marjă) | 1.0200 | 2.4000 | 0 | PASS | trotuar real 2.40 m |
| `CURB_STEP` | Pas maxim din mers față de înălțimea bordurii | 0.1600 | 0.1400 | 0.0100 | PASS | bordură reală 0.14 m + marjă 0.01 m |
| `DOOR_ENTRY` | Înălțime de intrare în vehicul (ghemuit) + marjă | 1.3312 | 1.6500 | 0 | PASS | ușă sedan 1.65 m |
| `CABIN_WIDTH` | Lățime șolduri + marjă față de cabina reală | 0.3000 | 1.5100 | 0 | PASS | cabină sedan 1.510 m |
| `GROUND_PIVOT` | Pivotul cel mai de jos stă pe planul solului | 9.71e-17 | 0 | 1.00e-9 | PASS | cel mai de jos punct la repaus -0.000000 m |
| `CLIPS` | Clipuri idle/walk/run/enter-vehicle/exit-vehicle complete | 5 | 5 | 0 | PASS | 5 clipuri, eșantionare 60 Hz |

### Asseturi incompatibile refuzate

| Caz | Rezultat | Motive | Mesaj |
| --- | --- | --- | --- |
| Asset supradimensionat (×1.45, 2.58 m) | REFUZAT | HEIGHT_OUT_OF_RANGE, DOOR_TOO_LOW | ASSET_REFUSED: oversized-probe refused: HEIGHT_OUT_OF_RANGE, DOOR_TOO_LOW |
| Trotuar îngust de 0.90 m | REFUZAT | SIDEWALK_TOO_NARROW | ASSET_REFUSED: pedestrian-adult-01 refused: SIDEWALK_TOO_NARROW |
| Declarație mincinoasă de scară (înălțime 2.40 m) | REFUZAT | DECLARATION_MISMATCH | ASSET_REFUSED: lying-declaration-probe refused: DECLARATION_MISMATCH |

## Clipuri, durate și contact cu solul

Contactul este măsurat prin cinematică directă din rotațiile eșantionate și cutiile tălpilor, nu din
țintele solverului. „Min/Max” este punctul cel mai de jos al scheletului în fiecare cadru.

| Clip | Tip | Durată (s) | Cadre | Buclă | Sprijin (cadre) | Ambele tălpi (cadre) | Min (m) | Max (m) | Toleranță (m) | Verdict |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `idle` | IDLE | 2.000 | 120 | da | 120/120 | 120/120 | -9.71e-17 | 1.39e-17 | 0.0040 | PASS |
| `walk` | GAIT | 0.800 | 48 | da | 48/48 | 12/48 | -2.64e-16 | 1.80e-16 | 0.0040 | PASS |
| `run` | GAIT | 0.500 | 30 | da | 30/30 | 4/30 | -2.08e-16 | 1.25e-16 | 0.0040 | PASS |
| `enter-vehicle` | TRANSITION | 0.800 | 48 | nu | 48/48 | 48/48 | -1.53e-16 | 1.53e-16 | 0.0040 | PASS |
| `exit-vehicle` | TRANSITION | 0.900 | 54 | nu | 54/54 | 26/54 | -9.71e-17 | 1.25e-16 | 0.0040 | PASS |

| Clip | Talpă stângă min | Talpă stângă max | Talpă dreaptă min | Talpă dreaptă max | Vârf cap min | Vârf cap max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `idle` | -9.71e-17 | 1.39e-17 | -9.71e-17 | 1.39e-17 | 1.7683 | 1.7722 |
| `walk` | -2.08e-16 | 0.1600 | -2.64e-16 | 0.1600 | 1.7056 | 1.7764 |
| `run` | -2.08e-16 | 0.2396 | -2.08e-16 | 0.2396 | 1.6844 | 1.7841 |
| `enter-vehicle` | -1.53e-16 | 1.80e-16 | -1.53e-16 | 2.64e-16 | 1.2812 | 1.7722 |
| `exit-vehicle` | -9.71e-17 | 1.25e-16 | -9.71e-17 | 0.0999 | 1.2812 | 1.7722 |

Regulile aplicate: `walk`/`run` cer cel puțin un picior în contact în fiecare cadru și niciun cadru
plutitor; `idle` cere ambele tălpi în contact; niciun clip nu poate coborî sub sol. Toleranța este
0.0040 m.

## Poziția autoritară nu este rescrisă

Poziția de probă `{x: 1234.5678901234567, y: -0.10000000000000009, z: 987.6543219876543}`, yaw
`0.1234567890123457`, entitate `pedestrian-001`. Biții IEEE-754 ai poziției
înainte de animație: `40934a4584fd0fdfbfb99999999999a0408edd3c0d2a903b`. După fiecare cadru eșantionat, biții
rămân identici.

| Clip | Cadre eșantionate | Tick-uri suplimentare | Poziție | Nepotriviri |
| --- | ---: | --- | --- | ---: |
| `idle` | 123 | 120, 853, 120120 | identică | 0 |
| `walk` | 51 | 48, 349, 48048 | identică | 0 |
| `run` | 33 | 30, 223, 30030 | identică | 0 |
| `enter-vehicle` | 48 | — | identică | 0 |
| `exit-vehicle` | 54 | — | identică | 0 |

Poziția nu este nici citită de clipuri: două autorități diferite produc exact aceiași biți de
articulații (DA).

| Încercare de scriere prin animație | Rezultat | Cod | Poziție neschimbată |
| --- | --- | --- | --- |
| writer.writeEntityPositionM | REFUZAT | `AUTHORITY_WRITE_REFUSED` | da |
| writer.writeRootMotionM | REFUZAT | `AUTHORITY_WRITE_REFUSED` | da |
| applyCharacterPose cu positionM | REFUZAT | `POSE_CONTAINS_ENTITY_POSITION` | da |
| applyCharacterPose cu root motion pe X | REFUZAT | `ROOT_MOTION_IN_CLIP` | da |
| applyCharacterPose cu transform străin | REFUZAT | `POSE_CONTAINS_ENTITY_POSITION` | da |

## Reprezentare Babylon (contract de mesh-uri)

Descrierea este derivată din contractul `src/character/`: pivoturi, cutii și materiale, fără poziția
entității și fără servicii de simulare. Toate cele trei LOD-uri stau pe aceleași pivoturi
(probleme de aliniere: 0).

| LOD | Părți | Vârfuri | Indici | Bytes GPU | Draw calls | Grupuri de material |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| NEAR | 17 | 408 | 612 | 18768 | 4 | SKIN, TORSO, LEGS, BOOTS |
| MID | 14 | 336 | 504 | 15456 | 4 | SKIN, TORSO, LEGS, BOOTS |
| FAR | 7 | 168 | 252 | 7728 | 3 | SKIN, TORSO, LEGS |

Inventar: 4 intrări, 41952 B. Buget MEDIUM:
ACCEPTAT (0 diagnostice).

## Determinism

2 rulări complete, identice;
amprenta SHA-256 a raportului (fără câmpul de determinism) este `e713aecda0fc8f8c1ed6add649fcff7547e8aee1bc9d986ca850a6518811895a`.

## Limitări

- Verificarea este headless: contractul de asset, animațiile și contactul cu solul sunt dovedite numeric, fără browser. Proba vizuală WebGPU/WebGL2 rămâne pentru integrarea personajului în 192.
- Reprezentarea este un contract de cutii pe pivoturi, nu un skin/GLB final; înlocuirea mesh-urilor nu schimbă contractul.
- Viteza nominală a clipurilor este derivată din pas și faza de sprijin; deplasarea autoritară, coliziunile și camera personajului aparțin PBI 192.
- Toleranța de contact este 0.004 m; ea acoperă eroarea numerică a solverului, nu o alegere vizuală.

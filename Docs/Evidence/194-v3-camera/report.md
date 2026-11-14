# 194 — cameră third person pentru personaj

Transcript determinist generat de `scripts/run-v3-character-camera-report.mjs`; comanda comisă este `npm run character:camera`.
Machine-readable: [report.json](report.json). Contract: `194-character-camera-v1`, tick fix la
60 Hz, tranziție de autoritate pe 18 tick-uri.

## Sumar

- Scenarii de urmărire/coliziune trecute: **5/5**.
- Criteriul 1a (urmărire pe `entityId`, tranziție interpolată, refuzuri): **PASS**.
- Criteriul 1b (rază trunchiată la obstacol, inclusiv colțul): **PASS**.
- Criteriul 2 (setările 009 se aplică, fără al doilea sistem): **PASS**.
- Stare serializabilă și reluare identică: **PASS**.
- Fără clonare/scriere a entității urmărite: **PASS**.
- Determinism: 2 rulări, identice: **DA**, SHA-256 `da23bead1b80d42a8cc050d0ec7a6c4cbdb542352dddf296c03e1a98657d1290`.
- Verdict general: **PASS**.

## Referințe reale

| Referință | Valoare | Sursă |
| --- | ---: | --- |
| Hartă | `neighbourhood-compact-v1` | PBI 042 `createNeighbourhoodMap` |
| Elemente de layout | 923 | `createCityLayout` |
| Suprafețe de mers | 313 | contractul 192 |
| Solide/clădiri | 86 | amprentele reale ale clădirilor |
| Clădire folosită | `bld:blk:0-0:0-0` | prima clădire cu fațada sudică accesibilă |
| Înălțimea ochilor personajului (m) | 1.6450 | PBI 191 `createCharacterAsset().measured.eyeHeightM` |
| Collider sedan (m) | 0.8500 × 2.0000 | PBI 022/145 `VEHICLE_COLLISION_HALF_EXTENTS_M` |

Politica camerei: rază 0.2000 m, marjă obstacol
0.0500 m, clearance față de sol 0.4000 m,
distanță 2.0000–8.0000 m, pitch
-0.3491 rad (-20.0°)…1.1310 rad (64.8°).

## Scenarii: entitate → obstacol → distanță finală → verdict

| Scenariu | Descriere | Entitate | Obstacol | Distanță cerută (m) | Distanță finală (m) | Clearance min (m) | Tick-uri obstruate | Coadă stabilă (m) | Verdict |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `character-open` | Urmărire personaj pe teren liber | `character-194` (CHARACTER) | — | 4.5000 | 4.5000 | Infinity | 0/60 | 0 | PASS |
| `vehicle-open` | Urmărire vehicul pe teren liber | `sedan-194` (VEHICLE) | — | 4.5000 | 4.5000 | Infinity | 0/60 | 0 | PASS |
| `building-wall` | Raza camerei trunchiată de clădirea reală | `bld:blk:0-0:0-0` (CHARACTER) | `bld:blk:0-0:0-0` | 6.0000 | 1.7856 | 0.0500 | 60/60 | 0 | PASS |
| `vehicle-box` | Raza camerei trunchiată de sedanul real | `character-194` (CHARACTER) | `sedan-194` | 6.0000 | 1.7500 | 0.0500 | 60/60 | 0 | PASS |
| `corner-both-axes` | Colț cu ambele axe blocate: punct valid, fără oscilație | `character-194` (CHARACTER) | `corner:x-wall` | 6.0000 | 1.0727 | 0.0500 | 120/120 | 0 | PASS |

Distanța este măsurată de la ancora ochilor la centrul camerei. Clearance-ul este distanța liberă
dintre sfera camerei (rază 0.2000 m) și cea mai apropiată cutie de obstacol,
măsurată independent de controller. „Coada stabilă” este deplasarea maximă dintre cadrele
consecutive din ultimele 20 de tick-uri; zero înseamnă nicio oscilație.

## Criteriul 1a — urmărirea `entityId` și tranziția

| Dovadă | Rezultat |
| --- | --- |
| Tick-uri totale (30 personaj + 18 tranziție) | 48 |
| `entityId` din primul cadru după schimbare | `sedan-194` (autoritatea: `sedan-194`) |
| `entityId` din ultimul cadru | `sedan-194` |
| Fiecare cadru raportează autoritatea tick-ului | DA |
| Cadre de tranziție | **18/18** |
| Tick-uri rămase la început / la sfârșit | 17 / 0 |
| Deplasare maximă între două cadre din tranziție (m) | 0.3340 |
| Fără teleport (deplasare < 2 m/tick) | DA |
| Distanță finală după tranziție (m) | 4.5000 |
| Clonări de entitate / scrieri de țintă | 0 / 0 |
| Tranziție către aceeași entitate | refuzată: DA (`SAME_ENTITY`) |
| Tranziție către entitate necunoscută | refuzată: DA (`UNKNOWN_ENTITY`) |
| Tranziții pornite de tick-urile pe aceeași entitate | 0 |
| Pas cu `entityId` necunoscut | `CAMERA_UNKNOWN_ENTITY` (1 refuz) |
| Clonări după refuzuri | 0 |

Dovada fără clonare: ținta este înghețată (`DA`), poziția ei
este înghețată (`DA`), iar după 30 tick-uri
conținutul ei este neschimbat (`DA`); controllerul raportează
0 clonări și 0 scrieri de țintă.

## Criteriul 2 — setările de mișcare existente

| Setare | Valori | Metrică | Măsurat | Schimbat |
| --- | --- | --- | ---: | --- |
| `cameraMotion` | 0 → 100 | delta poziție cameră (m) după 30 tick-uri cu țintă în mișcare | 0.1500 | DA |
| `fov` | 60° → 100° | delta FOV (rad) | 0.6981 | DA |
| `orbit.distanceM` | 2 m → 8 m | delta distanță finală (m) | 5.9998 | DA |
| `orbit.invertYaw` | false → true | delta poziție cameră (m) | 8.8271 | DA |
| `orbit.invertPitch` | false → true | delta poziție cameră (m) | 1.1821 | DA |

Sursa este contractul PBI 009 `ControlPreferences`, citit prin `parseControlPreferences`;
`cameraMotion` controlează factorul de urmărire, `fov` controlează câmpul vizual. Un control
invalid este refuzat de contract: DA. Distanța și
inversarea de axă sunt intenție explicită de orbită, nu un al doilea sistem de setări.

## Stare serializabilă

| Dovadă | Rezultat |
| --- | --- |
| Bytes JSON ai stării salvate | 629 |
| Tranziție salvată în stare | DA |
| Entități cunoscute în stare | 2 |
| Cadre identice după `restore` | **DA** (25 cadre) |
| Versiune necunoscută refuzată | DA |

## Determinism

2 rulări complete, identice;
amprenta SHA-256 a raportului (fără câmpul de determinism) este `da23bead1b80d42a8cc050d0ec7a6c4cbdb542352dddf296c03e1a98657d1290`.

## Limitări

- Camera este un contract pur headless: nu creează cameră Babylon, mesh-uri, input sau renderer. Consumatorul 017/195 mapează poziția și FOV-ul pe camera reală.
- Obstacolele sunt cutii AABB orientate pe axe; pentru amprente rotite (vehicule) apelantul furnizează AABB-ul conservator. O formă concavă sau un portal nu face parte din contract.
- În timpul unei tranziții de autoritate camera poate fi temporar mai departe de noua țintă decât `maxDistanceM`, pentru că zboară din ultima poziție sigură; limita de distanță se aplică orbitei cerute, nu drumului de tranziție.
- Dacă un zid desparte complet poziția veche de noua țintă, trunchierea fail-closed oprește camera pe partea sigură în loc să o teleporteze prin zid; tranziția vizuală poate rămâne la perete până când jucătorul se mișcă.
- Setările existente 009 nu au astăzi slider pentru distanță sau inversare de axă; acelea rămân câmpuri explicite de intenție (input), nu un al doilea sistem de setări. `cameraMotion` și `fov` sunt citite direct din contractul 009.
- Proba este headless și deterministă; integrarea vizuală reală și feel-ul camerei rămân de validat în browser la PBI 195.

# 191 — personaj: animații și reprezentare

PBI 191 livrează contractul de asset al personajului V3: schelet cu pivoturi, scară comparată numeric
cu orașul și vehiculul real, cinci clipuri in-place eșantionate la 60 Hz, contact cu solul măsurat
per cadru și o reprezentare Babylon derivată din contract. Contractul este
[`191-character-v1`](../../../src/character/index.ts); reprezentarea este
[`191-character-visuals-v1`](../../../src/rendering/character-visuals.ts). Raportul determinist este
[report.json](report.json), iar varianta umană [report.md](report.md).

Regula oracolului: scara și pivoturile se compară cu referințe **citite din contractele livrate**
(trotuar 042, bandă din harta reală, plafon/prag/cabină 145 peste 023), nu cu constante inventate; un
asset incompatibil este **refuzat cu motiv închis**, nu desenat la altă scară. Animația produce
**numai** transformări locale, iar poziția autoritară este copiată bit cu bit — o încercare de a o
scrie prin animație aruncă, nu este ignorată. Contactul cu solul este cinematică directă din
rotațiile eșantionate, nu din țintele solverului.

## Sumar real

| Indicator | Valoare |
| --- | ---: |
| Verificări de scară/pivoturi | **9/9** PASS, asset **ACCEPTAT** |
| Clipuri cu contact valid | **5/5** PASS |
| Cadre verificate pentru poziția autoritară | **309**, toate bit-identice |
| Cazuri incompatibile refuzate | **3/3** |
| Probleme de aliniere a reprezentării | **0** |
| Buget 223 (MEDIUM) | **ACCEPTAT**, 0 diagnostice |
| Determinism | 2 rulări, **identice**, SHA-256 `e713aecda0fc8f8c1ed6add649fcff7547e8aee1bc9d986ca850a6518811895a` |
| Verdict | **PASS** |

## Contractul de asset

**Schelet.** 17 articulații într-un vocabular închis (`pelvis`, `spine`, `chest`, `neck`, `head`,
`upper-arm-*`, `forearm-*`, `hand-*`, `thigh-*`, `shin-*`, `foot-*`), fiecare cu părinte, offset de
repaus, cutie de segment și pivot. Cadrul este cel al personajului: metri, +Y sus, +Z înainte, +X
dreapta, originea pe planul de contact dintre tălpi. `characterRestPivots` este singura sursă de
pivoturi pentru renderer.

**Scară măsurată.** Înălțime 1.780 m, ochi 1.645 m, anvergură 1.780 m, umeri 0.520 m, șolduri
0.200 m, amprentă 0.300 × 0.260 m, șold la 0.935 m, lungime picior (șold–talpă) 0.935 m, talpă sub
gleznă 0.075 m. Cel mai de jos punct la repaus este `-9.71e-17` m, adică zero în dublă precizie.

**Clipuri.** `idle` 2.000 s / 120 cadre, `walk` 0.800 s / 48 cadre, `run` 0.500 s / 30 cadre,
`enter-vehicle` 0.800 s / 48 cadre, `exit-vehicle` 0.900 s / 54 cadre, toate eșantionate determinist
la 60 Hz din `(schelet, clip, tick)`. Clipurile sunt in-place: pelvisul are doar bob vertical, toate
celelalte articulații doar rotații pe X. Viteza nominală derivată din pas și faza de sprijin este
1.371 m/s la mers și 2.909 m/s la alergare; deplasarea reală aparține walker-ului din 192.

## Compatibilitatea numerică cu orașul și vehiculul

Referințele reale folosite în raport:

| Referință | Valoare | Sursă |
| --- | ---: | --- |
| Lățime trotuar | 2.400 m | `CITY_LAYOUT_DEFAULTS.sidewalkWidthM` (042) |
| Înălțime bordură | 0.140 m | `CITY_LAYOUT_DEFAULTS.sidewalkElevationM` |
| Lățime bandă | 3.400 m | cele 96 de benzi reale ale hărții `neighbourhood-compact-v1` |
| Plafon sedan deasupra solului | 1.650 m | `0.830` (plafon 145) − `-0.820` (talpa roții 023) |
| Prag ușă deasupra solului | 0.540 m | `-0.280` (prag 145) − `-0.820` |
| Cabină între geamuri | 1.510 m | fețele interioare ale geamurilor laterale sedan |

Verificările numerice (toate PASS pentru assetul implicit): declarație vs. măsurătoare, interval uman
1.50–2.00 m, raport ochi/înălțime 0.9242 (admis 0.88–0.95), lățime necesară pe trotuar 1.020 m din
2.400 m, pas maxim 0.160 m peste bordura de 0.140 m + marjă 0.010 m, înălțime de intrare ghemuit
1.281 m + marjă 0.050 m sub plafonul de 1.650 m, șolduri + marjă 0.300 m sub cabina de 1.510 m,
pivot la sol și completitudinea celor cinci clipuri.

**Refuzuri demonstrate prin test** (fiecare produce `CharacterContractError` cu cod `ASSET_REFUSED`):

| Caz | Motive |
| --- | --- |
| Asset supradimensionat ×1.45 (2.581 m) | `HEIGHT_OUT_OF_RANGE`, `DOOR_TOO_LOW` (intrare 1.858 + 0.05 > 1.65) |
| Trotuar de 0.90 m | `SIDEWALK_TOO_NARROW` (necesar 1.02 m) |
| Declarație de scară 2.40 m contrazisă de măsurătoare | `DECLARATION_MISMATCH` (delta 0.620 m) |

## Poziția autoritară nu este rescrisă

Poziția de probă are valori intenționat incomode: `{x: 1234.5678901234567, y:
-0.10000000000000009, z: 987.6543219876543}`, yaw `0.1234567890123457`. Biții IEEE-754 ai poziției
înainte de animație sunt `40934a4584fd0fdfbfb99999999999a0408edd3c0d2a903b`; după fiecare dintre cele
309 cadre eșantionate (inclusiv wrap la 120/48/30 și tick-uri de 1000 de ori ciclul), biții sunt
identici. Două autorități diferite produc exact aceiași biți de articulații, deci clipurile nu citesc
nici măcar poziția.

Refuzurile explicite (fail-closed, nu ignorate tacit):

| Încercare | Cod | Poziția rămâne neschimbată |
| --- | --- | --- |
| `writer.writeEntityPositionM` | `AUTHORITY_WRITE_REFUSED` | da |
| `writer.writeRootMotionM` | `AUTHORITY_WRITE_REFUSED` | da |
| `applyCharacterPose` cu `positionM` | `POSE_CONTAINS_ENTITY_POSITION` | da |
| `applyCharacterPose` cu root motion pe X | `ROOT_MOTION_IN_CLIP` | da |
| `applyCharacterPose` cu `transform` străin | `POSE_CONTAINS_ENTITY_POSITION` | da |

## Contactul cu solul, per cadru

Contactul este măsurat prin cinematică directă din rotațiile eșantionate și colțurile cutiilor
tălpilor; toleranța este 0.004 m. „Min/Max” este punctul cel mai de jos al scheletului în fiecare
cadru.

| Clip | Durată (s) | Cadre | Sprijin | Ambele tălpi | Min (m) | Max (m) | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `idle` | 2.000 | 120 | 120/120 | 120/120 | `-9.71e-17` | `1.39e-17` | PASS |
| `walk` | 0.800 | 48 | 48/48 | 12/48 | `-2.64e-16` | `1.80e-16` | PASS |
| `run` | 0.500 | 30 | 30/30 | 4/30 | `-2.08e-16` | `1.25e-16` | PASS |
| `enter-vehicle` | 0.800 | 48 | 48/48 | 48/48 | `-1.53e-16` | `1.53e-16` | PASS |
| `exit-vehicle` | 0.900 | 54 | 54/54 | 26/54 | `-9.71e-17` | `1.25e-16` | PASS |

Talpa din swing urcă măsurat 0.160 m la mers și 0.240 m la alergare; vârful capului coboară la
1.281 m în `enter-vehicle` (sub plafonul real de 1.650 m) și revine la 1.772 m. Un cadru rupt
(pelvis coborât cu 0.20 m) produce `GROUND_PENETRATION`; unul ridicat cu 0.20 m produce
`GROUND_FLOAT` și `NO_SUPPORT_FOOT` la mers și `IDLE_FOOT_LIFTED` la idle, deci verificarea nu este
tautologică.

## Reprezentare Babylon

`character-visuals.ts` produce o descriere pură de mesh-uri, derivată din contract: câte o cutie pe
articulație, patru grupuri de material (SKIN, TORSO, LEGS, BOOTS), trei LOD-uri care doar reduc
detaliul.

| LOD | Părți | Vârfuri | Indici | Bytes GPU estimați | Draw calls |
| --- | ---: | ---: | ---: | ---: | ---: |
| NEAR | 17 | 408 | 612 | 18.768 | 4 |
| MID | 14 | 336 | 504 | 15.456 | 4 |
| FAR | 7 | 168 | 252 | 7.728 | 3 |

Descrierea nu are poziție de entitate și nu importă servicii de simulare; toate LOD-urile stau pe
exact aceleași pivoturi (0 probleme de aliniere). Manifestul procedural are 4 intrări (3 mesh-uri + un
set de materiale, 8 variante de shader) și este acceptat în bugetul 223 pentru LOW/MEDIUM/HIGH.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS (proiect + `tsconfig.tests.json`) |
| `npm run lint` | PASS, 0 warnings |
| `npm run format:check` | PASS, toate fișierele verificabile sunt formatate |
| `npm run check:architecture` | PASS (399 fișiere TypeScript), probe negative 6/4/3 PASS |
| `npm run check:parameter-catalog` | PASS („Parameter catalog is synchronized.”) |
| `npm test` | **3272 teste, 3272 pass, 0 fail**, 111.831 s |
| `node --test "tests/character/*.test.ts"` | **22 teste, 22 pass, 0 fail**, 1.469 s |
| `npm run character:report` | raport scris, verdict **PASS**, determinism identic |
| `npm run character:report -- --check` | „Character report is current” / „Character markdown is current”, exit 0 |

## Fișiere atinse

- `src/character/errors.ts`, `skeleton.ts`, `clips.ts`, `ground.ts`, `asset.ts`, `authority.ts`,
  `index.ts` (modul nou).
- `src/rendering/character-visuals.ts` (nou) și exportul de la finalul `src/rendering/index.ts`.
- `tests/character/world-reference.ts`, `character-suite.ts`, `character-assets.test.ts`,
  `character-animation.test.ts`, `character-ground-contact.test.ts`, `character-visuals.test.ts`,
  `character-report.test.ts`.
- `scripts/run-v3-character-report.mjs` (nou), `package.json` (ultima intrare `scripts`:
  `character:report`).
- `Docs/20-extensii-si-mers-pe-jos.md` (secțiune nouă la final).
- `Docs/Evidence/191-v3-character/README.md`, `report.json`, `report.md`.

## Limitări

- Verificarea este headless: contractul, animațiile și contactul sunt dovedite numeric, fără browser.
  Proba vizuală WebGPU/WebGL2 rămâne pentru integrarea personajului în 192.
- Reprezentarea este un contract de cutii pe pivoturi, nu un skin/GLB final; înlocuirea mesh-urilor nu
  schimbă contractul.
- Viteza nominală a clipurilor este derivată cinematic; deplasarea autoritară, coliziunile, camera și
  tranziția controlului vehicul ↔ personaj aparțin PBI 192.
- Toleranța de contact (0.004 m) acoperă eroarea numerică a solverului și a cinematicii, nu o alegere
  vizuală; ea nu certifică o animație artistică.
- Verificarea de trotuar folosește lățimea reală a hărții (2.40 m) plus un caz de trotuar îngust de
  0.90 m; nu acoperă obstacole stradale sau înghesuială, care nu fac parte din 191.

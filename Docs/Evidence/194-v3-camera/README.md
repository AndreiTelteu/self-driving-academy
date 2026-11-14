# 194 — cameră third person pentru personaj

PBI 194, nivel „Mers pe jos V3”. Contractul `194-character-camera-v1` este livrat în
[`src/character/character-camera.ts`](../../../src/character/character-camera.ts) ca modul **pur,
headless și determinist**: fără Babylon, fără DOM, fără ceas, fără `Math.random` și fără import de
renderer. El urmărește exact `entityId`-ul autorității din 193, interpolează schimbarea de entitate
pe 18 tick-uri fixe, trunchiază raza camerei la primul obstacol cu marjă și refolosește setările de
mișcare existente din `src/settings` (009), fără un al doilea sistem.

Nivel de validare: **funcțional izolat**, conform [politicii de validare](../../validation-policy.md).
PBI-ul nu are `performance_checks`; nu se pretinde FPS, cost GPU sau integrare vizuală completă.
Integrarea în scena Babylon și feel-ul camerei aparțin PBI 195.

## Ce s-a implementat

- **Urmărire pe `entityId`.** `step({ tick, authorityEntityId, targets, orbit, obstacles, groundM })`
  caută exact entitatea autorității în snapshot-urile cunoscute. Un id necunoscut este refuzat cu
  `CAMERA_UNKNOWN_ENTITY`, iar o tranziție către aceeași entitate cu decizia explicită
  `SAME_ENTITY`; tick-urile obișnuite pe aceeași entitate nu pornesc nicio tranziție.
- **Tranziție fără clonare și fără teleport.** La schimbarea autorității, camera pornește din ultima
  poziție sigură și interpolează `smoothstep` timp de exact 18 tick-uri (0,3 s la 60 Hz).
  `frame.entityId` este noua autoritate din primul cadru. Ținta este citită în loc, nu copiată,
  înghețată sau scrisă: `entityClones = 0`, `targetWrites = 0`.
- **Trunchierea razei la obstacol.** Segmentul ancoră → cameră este baleiat contra cutiilor AABB
  umflate cu raza camerei (0,20 m) plus marja de 0,05 m; camera se oprește înainte de prima
  intrare, cu rezervă numerică `1e-6`. Urmează o a doua baleiere a deplasării, un clamp pe limitele
  hărții, un pass determinist de depenetrare (maximum 8 treceri) și un fallback la ultima poziție
  validă. Colțul cu ambele axe blocate rămâne într-un punct valid, fără oscilație.
- **Constrângeri fizice.** Pitch clampat la −20°…64,8°, distanță clampată la 2…8 m, înălțime minimă
  de 0,40 m peste solul local (peste trotuarul real de 0,14 m) și fără ieșire din dreptunghiul hărții.
- **Setările 009, refolosite.** `characterCameraControl(control)` citește `ControlPreferences` prin
  `parseControlPreferences`: `cameraMotion` este factorul de urmărire, `fov` este câmpul vizual.
  `setControlPreferences` aplică imediat un contract 009 valid. Distanța și inversarea axelor sunt
  intenție explicită de orbită (input), nu un store paralel.
- **Stare serializabilă.** `snapshot()` expune versionarea, tick-ul, `entityId`,
  `previousEntityId`, poziția, ținta, orbita, tranziția în curs, numărul de tranziții, entitățile
  cunoscute și controlul aplicat. `restore()` validează strict și continuă identic.

## Rezultate reale

Raportul determinist: [report.md](report.md) și [report.json](report.json), generate de
`scripts/run-v3-character-camera-report.mjs`; `--check` confirmă că sunt actuale.

| Scenariu | Entitate | Obstacol | Distanță cerută | Distanță finală | Clearance min | Tick-uri obstruate | Verdict |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| `character-open` | `character-194` | — | 4,5000 m | 4,5000 m | — | 0/60 | PASS |
| `vehicle-open` | `sedan-194` | — | 4,5000 m | 4,5000 m | — | 0/60 | PASS |
| `building-wall` | `bld:blk:0-0:0-0` | `bld:blk:0-0:0-0` | 6,0000 m | 1,7856 m | 0,0500 m | 60/60 | PASS |
| `vehicle-box` | `character-194` | `sedan-194` | 6,0000 m | 1,7500 m | 0,0500 m | 60/60 | PASS |
| `corner-both-axes` | `character-194` | `corner:x-wall` + `corner:z-wall` | 6,0000 m | 1,0727 m | 0,0500 m | 120/120 | PASS |

Referințe reale: harta `neighbourhood-compact-v1`, 923 elemente de layout, 313 suprafețe de mers,
86 clădiri, înălțimea ochilor 1,6450 m (asset 191), collider sedan 0,8500 × 2,0000 m (022/145).

**Criteriul 1a (urmărire + tranziție):** 30 tick-uri pe personaj + 18 tick-uri de tranziție;
`frame.entityId` este `sedan-194` din primul cadru de tranziție; 18/18 cadre de tranziție;
tick-uri rămase 17 → 0; deplasare maximă 0,3340 m/tick (fără teleport); distanță finală 4,5000 m;
0 clonări, 0 scrieri. Tranziția către aceeași entitate este refuzată cu `SAME_ENTITY`, cea către
`ghost-194` cu `UNKNOWN_ENTITY`, iar pasul cu id necunoscut cu `CAMERA_UNKNOWN_ENTITY` (1 refuz).

**Criteriul 1b (obstacole + colț):** zidul real oprește camera la 1,7856 m din 6 m, sedanul la
1,7500 m, colțul la 1,0727 m; clearance minim 0,0500 m în toate cele trei cazuri, egal cu marja
cerută. În colț, ultimele 20 de tick-uri au deplasare 0 și ambele sonde de +0,01 m intră în
învelișul de marjă al câte unui zid, deci ambele axe sunt blocate.

**Criteriul 2 (setările existente):** `cameraMotion` 0 → 100 schimbă poziția finală cu 0,1500 m
(țintă în mișcare, 30 tick-uri); `fov` 60° → 100° schimbă FOV-ul cu 0,6981 rad; distanța de orbită
2 → 8 m schimbă distanța finală cu 5,9998 m; `invertYaw` schimbă poziția cu 8,8271 m;
`invertPitch` cu 1,1821 m. Un control 009 invalid (`cameraMotion = 101`) este refuzat de parser.

**Serializare:** stare de 629 B, tranziție salvată în mijlocul celor 18 tick-uri, 25/25 cadre
identice după `restore`, versiune necunoscută refuzată.

**Determinism:** 2 rulări identice, SHA-256
`da23bead1b80d42a8cc050d0ec7a6c4cbdb542352dddf296c03e1a98657d1290`.

## Comenzi executate și rezultat

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS (src + tests) |
| `npm run lint` | PASS, 0 warnings |
| `npm run format:check` | PASS, toate fișierele verifică Prettier |
| `npm run check:architecture` | PASS (404 fișiere TypeScript), probe negative PASS |
| `npm run check:parameter-catalog` | „Parameter catalog is synchronized.” |
| `npm test` | **3323 teste, 3323 pass, 0 fail, 0 skipped**, 111672,2028 ms |
| `node --import ./scripts/register-typescript.mjs --test tests/character/character-camera.test.ts tests/character/character-camera-report.test.ts` | **13 teste, 13 pass, 0 fail** |
| `npm run character:camera` | PASS, 5/5 scenarii, raport scris |
| `npm run character:camera -- --check` | „report.json is current”, „report.md is current” |
| `pwsh -NoProfile -ExecutionPolicy Bypass -Command "& './PBI/Validate-Board.ps1' -RequireDone '194'"` | vezi rezultatul final din raportul de predare |

## Fișiere atinse

- `src/character/character-camera.ts` — nou: contractul pur al camerei.
- `src/character/index.ts` — export public la finalul fișierului.
- `tests/character/character-camera-suite.ts` — fixture reale (hartă, clădire, sedan), măsurători
  independente de clearance și raportul determinist.
- `tests/character/character-camera.test.ts` — 12 teste de comportament.
- `tests/character/character-camera-report.test.ts` — invariantul raportului.
- `scripts/run-v3-character-camera-report.mjs` — generatorul `report.json`/`report.md` cu `--check`.
- `package.json` — o singură intrare nouă, ultima din `scripts`: `character:camera`.
- `Docs/20-extensii-si-mers-pe-jos.md` — secțiune nouă la final.
- `Docs/Evidence/194-v3-camera/` — acest README, `report.json`, `report.md`.
- `PBI/To Do/194-character_camera.md` → `PBI/In Progress/` → `PBI/Done/` (mutare fizică).

## Limitări

- Contractul este headless: nu creează camera Babylon, mesh-uri, input sau renderer. Consumatorul
  017/195 mapează poziția, ținta și FOV-ul pe camera reală.
- Obstacolele sunt cutii AABB; pentru amprente rotite, apelantul furnizează AABB-ul conservator.
  Formele concave și portalurile nu fac parte din contract.
- În timpul unei tranziții, camera poate fi temporar mai departe de noua țintă decât
  `maxDistanceM`, pentru că zboară din ultima poziție sigură; limita de 8 m se aplică orbitei
  cerute, nu drumului de tranziție.
- Dacă un zid desparte complet poziția veche de noua țintă, trunchierea fail-closed oprește camera
  pe partea sigură în loc să o teleporteze prin zid; tranziția vizuală poate rămâne la perete până
  când jucătorul se mișcă.
- Setările 009 nu au astăzi slidere pentru distanță sau inversare de axă; acelea rămân câmpuri
  explicite de intenție (input), nu un al doilea sistem de setări. `cameraMotion` și `fov` sunt
  citite direct din contractul 009.
- Verificarea vizuală în browser și feel-ul camerei rămân pentru PBI 195; aici probele sunt
  deterministe, headless, pe harta și geometria reale.

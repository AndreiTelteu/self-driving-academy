# PBI043 — validarea integrității hărții, dovezi

PBI043 livrează `checkMapIntegrity(input, options?)` în `src/world/map-integrity.ts`, un audit determinist la încărcare peste documentul PBI032/PBI042, graful PBI033 și plannerul PBI041. Raportul folosește un vocabular închis de motive, căi de câmp, `entityId`, `relatedId` și `positionM`, plus un raport de acoperire mașină–citibil. Contractul este în [Docs/map-integrity.md](../../map-integrity.md).

Statearea este `targeted` conform [politicii de validare](../../validation-policy.md): corectitudine izolată pe datele reale și corupții plausibile, fără simulare de condus, browser, GPU sau buget de FPS.

## Ce s-a executat

| Comandă | Rezultat | Fișier |
| --- | --- | --- |
| `npm run typecheck` | PASS | `check-typecheck.txt` |
| `npm run lint` | PASS | `check-lint.txt` |
| `npm run format:check` | PASS | `check-format.txt` |
| `npm run check:architecture` | PASS, 180 fișiere TypeScript + probe negative | `check-architecture.txt` |
| `npm run check:parameter-catalog` | PASS, „Parameter catalog is synchronized.” | `check-parameter-catalog.txt` |
| `npm test` | **1154/1154 PASS** (baseline 1143 + 11 teste noi) | `check-tests.txt` |
| `node --test tests/world/map-integrity.test.ts` | **11/11 PASS** | `map-integrity-tests.txt` |
| `node scripts/map-integrity-report.mjs` | **PASS**, 0 erori, 2.880/2.880 rute READY | `report.json`, `report.md` |
| CLI pe harta coruptă | **FAIL non-zero**, 45 erori în 9 motive | `corruption-gate.txt` |

## Rezultatul pe cartierul real

Harta `neighbourhood-compact-v1` (schemaVersion 1) trece toate cele 13 verificări:

| Element | Valoare |
| --- | ---: |
| Noduri / pathuri / arii | 2.528 / 626 / 221 |
| Benzi | 96 (FORWARD 96, REVERSE 0) |
| Intersecții | 25 (4 semaforizate, 4 STOP, 17 prioritate) |
| Mișcări / zone de conflict | 296 / 100 |
| Semnale / faze / stări de mișcare | 4 / 210 / 7.242 |
| Linii STOP / SIGNAL / CROSSWALK | 16 / 26 / 192 |
| Trecere | 80 |
| Zone de serviciu | 16 (PICKUP 6, DROPOFF 5, BOTH 5) |
| Recovery points | 6 |
| Referințe verificate / nerezolvate | 6.047 / 0 |
| Componente tare conexe / slab conexe | 1 / 1 |
| Matrice de rute TAXI+CIVIL | 2.880 cereri, 2.880 READY, 0 eșecuri |
| Zone pickup/dropoff rutabile | 16/16 |

Clase de drum: 32 arteriale (cu vecin lateral declarat) și 64 rezidențiale. Accesul zonelor: TAXI 1, CIVIL 1, TAXI+CIVIL 14. Pentru fiecare clasă, toate cele 96 de benzi permise ajung la fiecare dintre cele 15 zone permise (1.440 perechi bandă–zonă în ambele cazuri). Auditul complet durează ~0,17 s pe Node 24 în probele locale; nu rulează pe tick.

## Cazurile de corupție

Testele clonează harta reală, aplică o singură corupție și verifică motivul, calea, ID-urile și poziția. Toate cele 11 teste trec.

| Corupție | Motiv observat | Detaliu verificat |
| --- | --- | --- |
| successor către `lane:does-not-exist` | `MISSING_REFERENCE` | cale `map.lanes[0].successorIds[2]`, `entityId`, `relatedId`, poziție |
| `signals[0].intersectionId = 'ix:missing'` | `MISSING_REFERENCE` | cale `map.signals[0].intersectionId`, check `SIGNALS` FAIL |
| a doua zonă primește geometria primei | `SERVICE_ZONE_OVERLAP` | `entityId`/`relatedId` pentru ambele zone, poziție |
| `lanes[1].id = lanes[0].id` | `DUPLICATE_ID` | cale `map.lanes[1].id`, ownership-ul primei apariții |
| lățime de bandă arterială 6 m | `LANE_CORRIDOR_OVERLAP` | suprapunere 3,700 m / prag 4,700 m, check `LANE_GEOMETRY` FAIL |
| `lanes[0].successorIds = []` | `CONNECTIVITY_DISCONNECTED` | 3 componente, cea mai mare 94/96, benzi deconectate listate |
| bandă fără successor, serviciu sau recovery | `DANGLING_LANE` | cale `map.lanes[0]`, `entityId`, poziție |
| `schemaVersion = 2` | `SCHEMA_INVALID` | cale `map.schemaVersion`, parser032 respinge |
| `direction = 'REVERSE'` pe o bandă through | `ONE_WAY_INCONSISTENT` | cale `map.lanes[0].direction`, `entityId` |
| document care nu este obiect | `SCHEMA_INVALID` | cale `map`, raport fără excepție |
| vocabular închis pe hartă multiplu coruptă | toate motivele din `MAP_INTEGRITY_REASONS` | fiecare cale începe cu `map`, sumele pe motive = `issueCount` |

`corruption-gate.txt` demonstrează poarta CLI pe o hartă cu bandă deconectată, referință de semnal lipsă, zone suprapuse și lățime de 6 m: `FAIL`, 45 de erori, cod de ieșire non-zero (126 prin shim-ul Volta/Windows; Node direct întoarce 1).

## Ieșirea raportului

`report.md` conține inventarul, starea fiecărui check, matricea de scenarii, conectivitatea, matricea de rute și lista de erori (goală). `report.json` este raportul mașină–citibil cu `entityCounts`, `references`, `connectivity`, `routing`, `scenarios` și `checks`. Ambele sunt generate determinist din `createNeighbourhoodMap()`.

Extras:

```text
Result: PASS · issues: 0
References checked: 6047; unresolved: 0.
Strongly connected components: 1; weakly connected: 1; largest component: 96 lanes.
Total: 2880/2880 READY, 0 failed.
Pickup/dropoff zones routable: 16/16; recovery points: 6.
```

## Reproducere

```powershell
volta run --node 24.21.0 --npm 11.19.0 -- npm run typecheck
volta run --node 24.21.0 --npm 11.19.0 -- npm run lint
volta run --node 24.21.0 --npm 11.19.0 -- npm run format:check
volta run --node 24.21.0 --npm 11.19.0 -- npm run check:architecture
volta run --node 24.21.0 --npm 11.19.0 -- npm run check:parameter-catalog
volta run --node 24.21.0 --npm 11.19.0 -- npm test
volta run --node 24.21.0 -- node --import ./scripts/register-typescript.mjs --test tests/world/map-integrity.test.ts
volta run --node 24.21.0 -- node scripts/map-integrity-report.mjs --json Docs/Evidence/043-map-integrity/report.json --md Docs/Evidence/043-map-integrity/report.md
```

## Limitări

- Audit static, la încărcare; nu simulează trafic, semafoare live, blocaje, obstacole, manevre pickup sau fizică.
- Suprapunerea coridoarelor folosește segmente paralele de centru și lățimile declarate; nu este narrow-phase, footprint de vehicul sau coliziune.
- Suprapunerea zonelor folosește casete X/Z (conservator pentru poligoane neaxis-aliniate); nu verifică self-intersecția poligoanelor.
- Matricea de rute este pe graful static PBI033 cu costul PBI041, fără `blocked`/trafic; nu acordă permisie de trecere.
- Lista de detalii este plafonată la 512 (configurabil); `issueCount` și `errorsByReason` rămân complete, iar `truncated` este explicit.
- Nu este benchmark de performanță și nu înlocuiește gate-urile de joc complet sau hardware.

## Fișiere atinse

- `src/world/map-integrity.ts`, `src/world/index.ts`
- `tests/world/map-integrity.test.ts`
- `scripts/map-integrity-report.mjs`
- `Docs/map-integrity.md`, `Docs/04-oras-si-retea-rutiera.md`, `Docs/map-schema.md`
- acest folder (`README.md`, `report.json`, `report.md`, `check-*.txt`, `map-integrity-tests.txt`, `corruption-gate.txt`)

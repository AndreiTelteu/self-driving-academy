# PBI042 — cartierul în Babylon, dovezi

PBI042 livrează cartierul american compact și legătura visual–semantic: `createNeighbourhoodMap()` (hartă 032 autorată determinist), `createCityLayout(map)` (derivare pură a elementelor vizuale cu `sourceIds`), `createCityLayoutReport()` (inventar + omisiuni/fantome explicite), `verifyCityAlignment()` (recompute independent) și `createCityScene(scene, layout)` (meshuri Babylon, batching, disposal). Contractul este descris în [Docs/city-visual.md](../../city-visual.md).

Verificarea este `targeted` conform [politicii de validare](../../validation-policy.md): corectitudine izolată (derivare, aliniere, acoperire, disposal) plus o captură browser reală. Nu este un gate de FPS, hardware sau joc complet.

## Ce s-a executat

| Comandă | Rezultat | Fișier |
| --- | --- | --- |
| `npm run typecheck` | PASS | `check-typecheck.txt` |
| `npm run lint` | PASS | `check-lint.txt` |
| `npm run format:check` | PASS | `check-format.txt` |
| `npm run check:architecture` | PASS, 177 fișiere TypeScript + probe negative | `check-architecture.txt` |
| `npm run check:parameter-catalog` | PASS, „Parameter catalog is synchronized.” | `check-parameter-catalog.txt` |
| `npm test` | **1127/1127 PASS** (baseline 1110 + 17 teste noi) | `check-tests.txt` |
| `node scripts/city-visual-report.mjs` | raport determinist, 0 probleme de aliniere | `geometry-report.md`, `geometry-report.json` |
| Captură browser Chromium headless (WebGL2) | 4 capturi, 0 erori de consolă, 0 probleme | `capture-*.png`, `report-*.json` |

Testele PBI042 (rulează și separat):

```powershell
node --import ./scripts/register-typescript.mjs --test tests/world/neighbourhood.test.ts tests/world/city-layout.test.ts tests/rendering/city-scene.test.ts
```

- `tests/world/neighbourhood.test.ts` (5): document 032 determinist/valid, context rutier derivabil, toate tipurile de intersecție cu liniile corecte, controllerul036 acceptă toate programele și fiecare mișcare are exact o fază GREEN, accesibilitatea TAXI/CIVIL către toate zonele.
- `tests/world/city-layout.test.ts` (6): fiecare element derivat din entități reale fără fantome, toate tipurile de intersecție parcurse, aliniere 1e-6 m față de graf și hartă, **probe negative** (bandă deplasată 5 cm, marcaj mutat pe altă bandă, cap de semafor lipsă/deplasat, sursă fantomă) care trebuie să eșueze, clădiri în afara suprafeței de rulare, determinism/înghețare/opțiuni invalide.
- `tests/rendering/city-scene.test.ts` (6): toate elementele au mesh, batching/instanțe raportate, fiecare vârf de bandă la exact `widthM/2` față de linia din graful033, vopseaua/marcajele/capetele în coordonatele sursă, un cap deplasat este observabil din mesh, `dispose()` readuce scena la zero (idempotent, scenă reutilizabilă), două builduri independente sunt identice octet cu octet, materialele împrumutate nu sunt eliberate.

## Inventarul randat (raport determinist)

Sursă: `geometry-report.md` / `geometry-report.json`, generat din harta reală și dintr-o scenă Babylon `NullEngine`.

| Element | Număr |
| --- | ---: |
| `LANE_SURFACE` | 96 |
| `LANE_MARKING` | 216 |
| `INTERSECTION_SURFACE` | 25 |
| `STOP_LINE` | 234 |
| `CROSSWALK` | 80 |
| `SIGNAL_HEAD` | 26 |
| `SERVICE_ZONE` | 16 |
| `GROUND` | 16 |
| `SIDEWALK` | 64 |
| `CURB` | 64 |
| `BUILDING` | 86 |
| **Total** | **923** |

Meshuri Babylon: **155** (7 batchuri fuzionate, 122 elemente individuale, 801 elemente fuzionate, 19.172 vârfuri, 10.054 triunghiuri). Tipuri de intersecție: 4 semaforizate, 4 cu STOP, 17 cu prioritate. Clase de drum: 32 benzi arteriale, 64 rezidențiale. După `dispose()`: meshuri 0, materiale 0, geometrii 0, noduri 0.

Entități sursă fără mesh, declarate explicit: 170 `MOVEMENT`, 100 `CONFLICT_ZONE`, 6 `RECOVERY_POINT`, toate cu motivul `SEMANTIC_ONLY`. Zero elemente fantomă, zero elemente lipsă, zero meshuri necunoscute.

## Capturi

Browser real: Chromium 1234 (Playwright, headless), backend **WebGL2** prin SwiftShader. Fixture-ul `/tests/browser/city-visual/` folosește backendul011, daylight016 (materiale împrumutate) și builderul042. WebGPU nu era disponibil în mediul headless, deci capturile nu acoperă backendul WebGPU.

| Captură | URL | Ce dovedește |
| --- | --- | --- |
| `capture-overview.png` | `/tests/browser/city-visual/index.html?capture=overview.quiet` | Cartierul întreg: 16 cvartale, grila de străzi, arteriale late cu marcaje duble, clădiri în afara carosabilului. |
| `capture-signalized.png` | `...?capture=signalized.quiet` | Intersecție semaforizată 4-way: capete de semafor cu lampă colorată pe fiecare bandă de intrare, linii SIGNAL, treceri pe toate picioarele. |
| `capture-stop_controlled.png` | `...?capture=stop_controlled.quiet` | Intersecție 4-way cu STOP: linii STOP pe toate intrările, fără capete de semafor. |
| `capture-uncontrolled.png` | `...?capture=uncontrolled.quiet` | Intersecție cu prioritate: fără linii STOP/SIGNAL și fără semafoare, doar treceri. |

Fiecare captură are raportul JSON al paginii (`report-*.json`) cu statisticile scenei, numărul de probleme (0) și erorile de consolă (0). Comenzile exacte sunt în secțiunea „Reproducere”.

## Reproducere

```powershell
npm run dev -- --port 5179 --strictPort
# în alt terminal, pentru fiecare captură:
node Docs/Evidence/042-city-visual/capture-harness.mjs `
  "http://localhost:5179/tests/browser/city-visual/index.html?capture=signalized.quiet" `
  "Docs/Evidence/042-city-visual/capture-signalized.png" 90000 - `
  "Docs/Evidence/042-city-visual/report-signalized.json"
```

`capture-harness.mjs` este utilitarul CDP folosit pentru aceste dovezi (fără dependențe npm suplimentare, rulează Chromium-ul Playwright deja instalat). Nu este folosit de aplicație și nu face parte din build.

## Limitări

- Capturile sunt WebGL2/SwiftShader; nu există dovadă WebGPU sau FPS în acest PBI.
- Programele de semafor sunt statice și didactice (un singur GREEN per viraj; perechi de înaintare opuse unde geometria035 permite). Right-on-red și fazele protejate reale nu sunt modelate; controllerul live rămâne PBI036.
- Clădirile, trotuarele și zebrele sunt reguli de prezentare (loturi deterministe, înălțimi de vopsea), nu date de gameplay; nu există coliziune, LOD, mobilier, pietoni sau vehicule în scenă.
- Layout-ul derivă cvartalele din centrele ariilor de intersecție; o hartă fără grilă recognoscibilă produce zero cvartale/clădiri (fallback documentat), nu geometrie inventată.
- Nu s-a rulat un playtest de condus: alinierea este dovedită geometric și prin mesh, nu prin experiență de joc.

## Fișiere atinse

- `src/world/neighbourhood.ts`, `src/world/city-layout.ts`, `src/world/index.ts`
- `src/rendering/babylon/city-scene.ts`, `src/rendering/babylon/index.ts`
- `tests/world/neighbourhood.test.ts`, `tests/world/city-layout.test.ts`, `tests/rendering/city-scene.test.ts`
- `tests/browser/city-visual/index.html`, `tests/browser/city-visual/main.ts`
- `scripts/city-visual-report.mjs`
- `Docs/city-visual.md`, `Docs/04-oras-si-retea-rutiera.md`, acest folder

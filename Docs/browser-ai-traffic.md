# Trafic AI vizibil în compunerea de browser (PBI 256, extins de 262)

Status: implementat și verificat în browser real (WebGL2/SwiftShader) pe 25 noiembrie 2026;
PBI 262 a extins compunerea la flota live de taxiuri, PBI 283 a montat regulile live, iar PBI 284 a
închis autonomia civilă și preluarea oricărei mașini. Contractul de simulare rămâne 058; modulul nou
este numai composition root-ul dintre harta 032, registry-ul 057 și compunerea jucabilă 236.

Până la acest PBI, `src/main.ts` afișa doar taxiul parcat și un singur civil static. Contractul
[traficului civil 058](civil-traffic.md) exista și era testat, dar nu era instanțiat de joc. PBI 256
a adus primii 24 de civili AI; PBI 262 duce în lume **24 de taxiuri și 32 de civili** ca actori
reali, fiecare cu ID, clasă, rută și stare proprie, iar compunerea le publică în același
`CompositionFrame` de 60 Hz folosit de personaj, cameră, coliziuni, HUD și renderer.

## Compoziție

```text
createCompositionWorld()  →  map 032 + graph 033 + layout 042
        │
        ├─ createAmbientTraffic({ map, graph, context, seed, focus, avoid, styleSource? })
        │     ├─ createFleetRegistry (24 taxiuri + 32 civili; limitele 057)
        │     ├─ createCityStyleProfile (valorile implicite 092, toate BASE) sau sursa activă
        │     └─ createCivilTraffic (driverKinds TAXI+CIVILIAN, rute 041, context 044, 047/048)
        │
        └─ createV3Composition({ ..., traffic })
              ├─ step: 058 înaintea arbitrajului de input
              ├─ sync: actorii 058 devin `frame.vehicles`
              └─ intrare/preluare: ruta 058 este suspendată, ieșirea o reconciliază și revine în AUTO
```

`createAmbientTraffic` alege determinist primele benzi după distanța originii lor față de
`focus` (poziția jucătorului) și le avansează 20 m pe rută (`spawnOffsetsM`). Alocarea alternează
între taxiuri și civili, astfel încât ambele categorii să fie vizibile în fața jucătorului. Restul
populației folosește căutarea de origine a contractului 058. Benzile și offseturile preferate sunt
parametri opționali ai lui 058 (`spawnLanesByKind`/`spawnOffsetsMByKind`), nu un al doilea router:
ruta rămâne întotdeauna rezultatul planner-ului 041.

## Profilul comun și vehiculele noi

`createAmbientTraffic` acceptă `styleSource` și îl pasează atât registry-ului (`profileSource`), cât
și traficului. O versiune nouă nu schimbă silent actorii existenți: `refreshStyle()` este propagarea
explicită cerută de composition root după activarea 110. Un vehicul creat ulterior prin
`registry.addVehicle()` citește versiunea activă în acel moment, pentru taxi și civil la fel.

## Conversia de heading

Graful 033 măsoară headingul în planul hărții (`0 = +X`, pozitiv spre `+Z`), iar compunerea 236
folosește `înainte = (sin yaw, cos yaw)` (`0 = +Z`). Conversia este o rotație de 90°:

```text
yawCompunere = normalize(π/2 − headingGraf)
headingGraf  = normalize(π/2 − yawCompunere)
```

Fără ea, mașinile AI ar apărea și ar conduce cu 90° lateral. Un test din `tests/app/ambient-traffic`
verifică un actor pe banda `lane:00N0`: avansează pe `+Z`, rămâne pe bandă și are `yaw ≈ 0`.

## Reguli de joc

- **Vizibilitate:** toate cele 56 de actori apar în `CompositionFrame.vehicles` cu poziție, yaw, viteză,
  bandă, clasă și `driverKind`; renderer-ul creează reprezentarea la primul cadru, inclusiv libréul
  de taxi pentru taxiurile AI.
- **Simulare continuă:** camera, selecția și renderer-ul nu sunt intrări în contractul 058. Actorii
  din afara ferestrei de observare avansează pe aceleași tick-uri; proba 262 măsoară 54/54 actori
  aflați la peste 80 m de jucător și fiecare se deplasează peste 1 m în 600 tick-uri.
- **Interacțiune:** taxiul jucătorului și civilul static sunt trimise ca observații externe în cadrul
  044, deci devin lideri semantici și produc frânarea AI prin 048/047. Personajul pe jos nu este
  injectat ca vehicul: la spawn stă pe carosabil lângă bordură, iar tratarea lui ca lider ar opri o
  bandă întreagă în primul cadru.
- **Preluare:** orice mașină AI, taxi sau civil, poate fi condusă de jucător. `M` din panoul `Flotă`
  și `G` când ușa este în rază folosesc aceeași tranziție: `setAuthority(MANUAL|LEARNING)` suspendă
  ruta 058 la poza curentă, fără o a doua rută sau un al doilea actor. La ieșire, poza condusă este
  proiectată pe graful 033 (`reconcile`) și `resume` revine în AUTO pe aceeași rută/destinație; o
  poziție off-graph revine în AUTO la ultima poziție reconciliată, iar `EXIT_ACCEPTED` raportează
  motivul. `nearestVehicle` include acum toate mașinile live.
- **Ownership:** `createAmbientTraffic` deține registry-ul și traficul; compunerea 236 doar le
  pașește. `main.ts` creează un trafic proaspăt pentru fiecare backend, deci recuperarea GPU nu
  refolosește un `lastTick` vechi, și îl eliberează la dispose.
- **Supraîncărcare:** dacă datoria buclei fixe depășește 250 ms (de exemplu pe SwiftShader), jocul
  intră corect în pauză de overload. Proba de browser reia explicit pauza și retrimite tastele
  ținute, ca să măsoare tick-uri reale; pe hardware normal ramura nu se activează.

## Performanță

Măsurat în proba de browser reală (Chromium 156, **WEBGL2 prin ANGLE/SwiftShader**, 1440×900),
24 de mașini AI plus compunerea completă:

| Metrică | Înainte de 256 (236, fără trafic) | După 256 (24 AI) |
| --- | ---: | ---: |
| Tick compunere p50 | 0,50 ms | **3,70 ms** |
| Tick compunere p95 | 1,10 ms | **5,50 ms** |
| Tick compunere max | 17,9 ms | 53,7 ms |
| Vehicule în scenă | 2 | **26** |
| Draw calls vehicule | — | 42 |
| Mesh-uri vehicule | — | 599 |

Tick-ul rămâne sub bugetul provizoriu de **8 ms** din contractul 25. Costul suplimentar al
traficului este de aproximativ **3,2 ms/tick** față de baseline-ul 236. Intervalele de cadru
(p50 ≈ 1,27 s) sunt ale randării software SwiftShader și **nu** sunt raportate ca FPS hardware.
Cele 24 de mașini s-au deplasat toate peste 1 m în timpul probei; scena a raportat 26 de vehicule,
0 erori de pagină și 0 erori de consolă.

## Costul flotei live (PBI 262)

Proba headless pe contractele reale măsoară 40 de civili (baseline 058) și 70 de vehicule
(30 taxiuri + 40 civili), 120 tick-uri warmup + 3 perechi × 600 tick-uri, pe aceeași hartă 032/033.
Rezultatul comis este în [Evidence/262-live-fleet/cost.json](Evidence/262-live-fleet/cost.json):

| Metrică | 40 civili | 70 vehicule |
| --- | ---: | ---: |
| p50 | 2,75 ms | 4,68 ms |
| p95 | 3,51 ms | **5,82 ms** |
| p99 | 4,05 ms | 6,55 ms |

Costul suplimentar este **2,31 ms/tick** la p95, sub bugetul de 8 ms al tick-ului autoritar din
Docs/25. Proba este a subsistemului 058, fără renderer sau GPU; nu înlocuiește măsurătoarea
hardware a tick-ului complet și nu este raportată ca FPS. Deciziile 044 folosesc cadența reală de
10 Hz fazată pe șase tick-uri, iar liderul fizic este recalculat la fiecare tick.

## Costul autonomiei civile (PBI 284)

Aceeași probă 058, cu un singur owner 283 și contextul complet, măsoară 24/32/40 de civili cu 20 de
taxiuri: p95 **6,06 / 7,60 / 6,80 ms** și p99 7,21 / 9,37 / 8,80 ms, sub bugetul de 8 ms al tick-ului
laptop. Rândul 30 taxiuri + 40 civili este marcat separat `STRESS` (p95 **9,11 ms**) și nu este
prezentat ca gate normal. Măsurătoarea este headless, pe subsistemul 058+283, fără renderer sau GPU;
detalii în [Evidence/284-civil-autonomy/cost.json](Evidence/284-civil-autonomy/cost.json).

## Verificare

```powershell
npm test -- tests/app/ambient-traffic.test.ts
npm test -- tests/fleet/civil-traffic.test.ts
npm test -- tests/fleet/live-fleet.test.ts
npm run fleet:live -- --check
npm run fleet:live -- --measure
npm run civil:autonomy
npm run civil:autonomy -- --check
npm run civil:autonomy:cost
npm run civil:autonomy:probe
npm run composition:report -- --browser
npm run composition:report -- --check
```

Dovezi:

- `tests/app/ambient-traffic.test.ts` — populație, rute READY, mișcare, heading, refuzul intrării,
  compunerea fără trafic neschimbată și determinism.
- `tests/fleet/civil-traffic.test.ts` — testul nou pentru `spawnLanes` și suita 058 existentă.
- [Evidence/236-browser-composition/browser.json](Evidence/236-browser-composition/browser.json) —
  proba de browser cu `traffic: { actors: 24, moved: 24 }`, costul tick-ului și cele 7 capturi.
- [Evidence/256-browser-ai-traffic/README.md](Evidence/256-browser-ai-traffic/README.md) —
  rezumatul dovezilor acestui PBI.
- [Evidence/284-civil-autonomy/README.md](Evidence/284-civil-autonomy/README.md) — autonomia civilă
  completă, preluarea G/M, reluarea AUTO fără teleport, profilul comun, spawn-ul sigur, costul și
  proba Chromium 13/13.

## Limite

- 058 nu implementează el semafoarele, prioritatea, STOP-ul sau yield-ul; acestea rămân contractele
  036/037/038/045/050–054 și sunt montate prin adaptorul 283, care este opt-in în fixture-uri.
- Mașinile AI nepreluate rămân pe proxy-uri cinematice; fizica Rapier 282 se aplică mașinii conduse,
  nu întregii flote. Decorul destructibil (285) și pietonii (286) nu sunt încă surse de context.
- Personajul pe jos nu este tratat ca obstacol pentru AI; coliziunea fizică mașină–mașină între
  taxiul condus și AI nu este rezolvată de compunere (AI frânează semantic în spatele taxiului, dar
  nu există impuls fizic la contact).
- Proba de browser este pe SwiftShader, nu pe GPU real; frame-ul nu este o măsurătoare hardware.
  Gate-ul 224 rămâne responsabil pentru acceptarea pe hardware.

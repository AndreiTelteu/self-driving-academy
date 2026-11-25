# Trafic AI vizibil în compunerea de browser (PBI 256)

Status: implementat și verificat în browser real (WebGL2/SwiftShader) pe 25 noiembrie 2026.
Contractul de simulare rămâne 058; modulul nou este numai composition root-ul dintre harta 032,
registry-ul 057 și compunerea jucabilă 236.

Până la acest PBI, `src/main.ts` afișa doar taxiul parcat și un singur civil static. Contractul
[traficului civil 058](civil-traffic.md) exista și era testat, dar nu era instanțiat de joc. Acum
`createAmbientTraffic` creează **24 de mașini conduse de AI** pe lângă taxi, iar compunerea le
publică în același `CompositionFrame` de 60 Hz folosit de personaj, cameră, coliziuni, HUD și
renderer.

## Compoziție

```text
createCompositionWorld()  →  map 032 + graph 033 + layout 042
        │
        ├─ createAmbientTraffic({ map, graph, context, seed, focus, avoid })
        │     ├─ createFleetRegistry (20 taxiuri + 24 civili; 057 cere minim 20 taxiuri)
        │     ├─ createCityStyleProfile (valorile implicite 092, toate BASE)
        │     └─ createCivilTraffic (rute 041, context 044, following 048, control 047)
        │
        └─ createV3Composition({ ..., traffic })
              ├─ step: 058 înaintea arbitrajului de input
              ├─ sync: actorii 058 devin `frame.vehicles`
              └─ intrare: mașinile AI sunt refuzate explicit (`AI_TRAFFIC`)
```

`createAmbientTraffic` alege determinist primele benzi după distanța originii lor față de
`focus` (poziția jucătorului) și le avansează 20 m pe rută (`spawnOffsetsM`), astfel încât cel puțin
o mașină AI să fie deja în fața jucătorului. Restul populației folosește căutarea de origine a
contractului 058. Benzile și offseturile preferate sunt parametri opționali ai lui 058
(`spawnLanes`/`spawnOffsetsM`), nu un al doilea router: ruta rămâne întotdeauna rezultatul
planner-ului 041.

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

- **Vizibilitate:** toți cei 24 de actori apar în `CompositionFrame.vehicles` cu poziție, yaw, viteză,
  bandă și clasă; renderer-ul creează reprezentarea la primul cadru, ca pentru taxi.
- **Interacțiune:** taxiul jucătorului și civilul static sunt trimise ca observații externe în cadrul
  044, deci devin lideri semantici și produc frânarea AI prin 048/047. Personajul pe jos nu este
  injectat ca vehicul: la spawn stă pe carosabil lângă bordură, iar tratarea lui ca lider ar opri o
  bandă întreagă în primul cadru.
- **Preluare:** o mașină AI nu poate fi condusă de jucător. `requestEntry` o refuză cu
  `ENTER_REFUSED: AI_TRAFFIC`, iar `nearestVehicle` o ignoră. Motivul este tehnic: 058 are propriul
  progres de rută, iar o preluare fără reconcilierea poziției ar teleporta mașina la `resume`.
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

## Verificare

```powershell
npm test -- tests/app/ambient-traffic.test.ts
npm test -- tests/fleet/civil-traffic.test.ts
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

## Limite

- 058 nu implementează semafoare live, prioritate în intersecție, STOP sau yield ca actuatoare;
  acestea rămân contractele 036/037/038/045/050–054. Mașinile AI urmăresc ruta și liderul, dar nu
  opresc la roșu.
- Mașinile AI nu sunt preluabile; reconcilierea poziției la `resume` rămâne un follow-up.
- Personajul pe jos nu este tratat ca obstacol pentru AI; coliziunea fizică mașină–mașină între
  taxiul condus și AI nu este rezolvată de compunere (AI frânează semantic în spatele taxiului, dar
  nu există impuls fizic la contact).
- Proba de browser este pe SwiftShader, nu pe GPU real; frame-ul nu este o măsurătoare hardware.
  Gate-ul 224 rămâne responsabil pentru acceptarea pe hardware.

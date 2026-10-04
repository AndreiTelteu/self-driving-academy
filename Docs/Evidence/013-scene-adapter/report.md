# PBI013 — verificare de scenă și performanță provizorie

Data: 2026-10-05 Europe/Bucharest. Base main: `b6d513bdc21b4e2196799e601f87d80aba866f22`; implementare necomisă în workspace comun. Babylon 9.29.0. Niciun commit/push, nicio modificare în package/config/checker/app/main/UI sau modulele 008/032.

## Probe și hardware observat

T3 `preview_status` a fost primul apel browser; fără tab activ, `preview_open` a deschis `http://localhost:5173/tests/browser/scene-adapter/`. Toate probele au folosit exclusiv T3 preview, Chromium 152.0.7977.130 / Electron 44.4.2 / T3Code nightly pe Windows (userAgent complet în JSON). Browserul raportează pentru WebGPU vendor **amd**, renderer **rdna-3**; pentru WebGL2 **ANGLE AMD Radeon RX 7900 XTX, Direct3D11**. CPU, RAM, driver exact, alimentare și refresh rate nu au fost măsurate. Browserul a raportat visibility=visible, DPR=1. Canvasul de benchmark este 640×360, fără preset de gameplay/calitate adaptivă/inspector.

Baseline-ul `013-empty-v1` a fost capturat înaintea implementării registry-ului/resurselor, după tranzacția To Do→In Progress și board validator PASS. `performance_checks: ["frame","memory"]` a fost adăugat înaintea implementării. Fișierele `baseline-auto.json` și `baseline-webgl2.json` păstrează proba inițială; `final-auto.json` și `final-webgl2.json` repetă aceeași scenă goală și aceeași dimensiune/pacing.

Protocol bootstrap timpuriu: cinci repetări/backend, 30 de cadre warmup + 120 de cadre măsurate/repetare. Fiecare cadru este paced cu timer de 5 ms, iar CPU este măsurat în jurul present+render. Încercarea inițială cu requestAnimationFrame a depășit timeout-ul T3 de 15 secunde; acea încercare nu contribuie la rezultate. Intervalele paced din JSON includ scheduling/timer și **nu sunt FPS sau cadența display-ului**. GPU time, FPS/cadence și memoria GPU exactă sunt null. Heap/WASM/Long Tasks nu au fost măsurate. Proba este dev Vite, scurtă și sintetică; nu pretinde benchmarkul principal production/120 s sau închiderea gates 203/218/224.

## Comparație și cost nou separat

Valorile de mai jos sunt mediana celor cinci p95 CPU, în ms; distribuțiile fiecărei repetări rămân în JSON.

| Backend | Scenă goală înainte | Scenă goală după | 70 de cutii + 70 updateTransform/cadru | Cost nou vs aceeași probă goală după |
| --- | ---: | ---: | ---: | ---: |
| WebGPU | 0,30 | 0,30 | 1,60 | +1,30 |
| WebGL2 | 0,10 | 0,20 | 1,30 | +1,10 |

Scena goală nu introduce resurse: toate contoarele nodes/meshes/materials/textures/geometries sunt zero înainte/după. Diferența WebGL2 este +0,10 ms; nu atinge pragul relativ provizoriu >10% **și** >1 ms. Costul nou este separat, nu reinterpretat ca regresie a scenei goale. Lucrul CPU observat este sub propunerea de 10 ms p95 din Docs25, dar workload-ul de joc complet și GPU time nu sunt validate de această probă.

`new-cost-auto.json` / `new-cost-webgl2.json`: 70 entități, 141 TransformNode (scene root + 70 entity roots + 70 representation roots), 70 mesh-uri/geometrii, +70 materiale, zero texturi. Materialul default Babylon (1) este prealocat și separat de costul nou. După cleanup contoarele revin la baseline, verificat prin assertions în fiecare probă. Acestea sunt contoare de obiecte, nu bytes sau memorie GPU exactă.

## Lifecycle pe ambele backenduri reale

`lifecycle-auto.json` și `lifecycle-webgl2.json` sunt rezultate browser finale, cu toate assertions trecute:

- root stabil per entityId; înlocuirea păstrează aceeași referință, pose și domain projection frozen neschimbată;
- poziții SI/Y-up, quaternion xyzw, +Z rotit la +X prin +90° Y, pivot zero al entității și pivot local al reprezentării verificat prin matrice mondială;
- mapare descendant→entityId; duplicate ID, root atașat/owned/disposed/foreign și pose NaN respinse fără modificarea reprezentării existente;
- liste de materiale duplicate și referirea unui material exclusiv deja adoptat respinse; candidata eșuată este curățată de caller;
- două reprezentări cu material/texture shared: replace/remove nu distrug resursele celuilalt consumator; cleanup explicit al callerului;
- 20 de cicluri create→replace→remove, fiecare cu material și textură exclusivă; după fiecare ciclu node/mesh/material/texture/geometry counts revin exact la adapter baseline;
- tick/session/epoch stale, remove/reuse în același epoch, reset cu epoch nou și reutilizare ID testate; istoric plafonat și reset în același epoch respinse;
- right-handed scene respinsă; remove/dispose idempotente; engine count revine după backend cleanup.

Baseline lifecycle după default material: 0 nodes, 0 meshes, 1 material, 0 textures, 0 geometries. Cu adaptor gol: numai +1 scene root. După adaptor disposal: exact baseline-ul de mai sus. Camera și scena backendului nu sunt modificate de adaptor.

## Dovezi vizuale

Inițial T3 `preview_snapshot` a eșuat repetat cu `PreviewAutomationExecutionError` pe tab_3. Nu s-a folosit browser alternativ. T3 recording start/stop a reușit pentru ambele backenduri; MP4-urile au fost copiate în acest folder, apoi ffmpeg a extras cadre PNG la secunda 1. Cadrele au fost inspectate vizual: cutie teal, marker roșu pe +Z, cameră oblică și raportul de assertions. Textul din înregistrări poate avea compresie; JSON-urile sunt dovada textuală exactă.

- `calibration-webgpu.mp4` și `calibration-webgpu.png`
- `calibration-webgl2.mp4` și `calibration-webgl2.png`

## Verificări statice/build

`npm run check`: PASS, typecheck (main + ES2022 Node tests), lint, format:check, architecture și 158 teste Node. Două teste noi pure în `tests/rendering/scene-contract.test.ts`. Output complet: `check-output.txt`.

`npm run build`: PASS; avertisment Vite pentru chunk >500 kB, fără schimbarea configurației sau pragurilor. Output: `build-output.txt`. Browser fixture-ul este separat de buildul gameplay/main și nu adaugă cutii de calibrare în producție.

În timpul lucrului, typecheck a raportat temporar `scalar` unused în `src/world/parser.ts` și `MapValidationError` unused în `tests/world/map-schema.test.ts` (modificări concurente 032). Nu au fost editate în scope013; verificarea finală completă a trecut după remedierea lor de owner. Nicio eroare concurentă rămasă la proba finală.

Contractul și limitele API sunt în `Docs/scene-adapter.md`. Gate-urile hardware/gameplay, asset loaders, instancing, selection UI, interpolation și device recovery rămân în PBI-urile dedicate. Fișierul `integration-requests.txt` păstrează comunicarea cu parent; nu sunt necesare modificări de configurație/composition pentru adoptarea adaptorului.

## Închiderea boardului

PBI013 mutat fizic în PBI/Done; Validate-Board.ps1 -RequireDone '013' PASS și Validate-Plan.ps1 PASS după mutare. Outputs în board-validation.json și plan-validation.json. Singura locație a taskului este PBI/Done/013-scene_adapter.md.


Revizia finală a întărit verificarea referințelor la materialele/texturile shared: foreign/disposed respinse înainte de adoptare. Lifecycle repetat pe ambele backenduri PASS și check complet 158 teste + build PASS. După ce preview_status/navigate a raportat tab vizibil, preview_snapshot a reușit pentru ambele backenduri; capturi PNG native T3 în browser-snapshot-webgpu.png și browser-snapshot-webgl2.png (pe lângă înregistrările și cadrele anterioare). PBI a fost redeschis temporar pentru această revizie și reînchis după probe.


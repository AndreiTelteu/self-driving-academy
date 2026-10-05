# Dovezi PBI023

Implementarea este verificată pe Rapier real, separat de profilul și preferințele jucătorului. `before-node.json` este baseline-ul capturat înainte de modificarea fizicii; `after-final-node.json` este captura finală suplimentară Node. Cele 1800/7200 ticks reprezintă timp simulat, nu 30/120 secunde de măsurare wall-clock. Primele capturi after sunt păstrate separat, cu identitățile lor originale.

Baseline-ul hardware este reutilizarea explicită a rapoartelor complete [022 WebGPU](../022-physics-adapter/webgpu.json) și [022 WebGL2](../022-physics-adapter/webgl2.json), brațele `bridge`. Nu se rescriu rapoartele sau hashurile 022. PBI023 folosește aceeași mașină, aceeași suprafață și același workload de 70 mașini, 64 debris și trei bariere. Variantele `default` și `mixed` livrează aceleași 70 subscriptions. `default` păstrează mecanica sedan021; `mixed` recreează cele 70 mașini alternativ sedan/compact023, astfel încât și ordinea nativă de inserare este parte din workload.

Protocolul complet per backend este format din cinci perechi alternate, fiecare braț cu 30 secunde wall warmup și 120 secunde wall measurement, urmate de 20 cicluri remove/recreate/dispose. Rapoartele `webgpu.json` și `webgl2.json` au identitatea sursei și artefactelor în `build-manifest.json`. Fișierele `*-smoke.json` și `*-diagnostic.json` sunt probe scurte, explicit insuficiente pentru acceptarea protocolului complet.

`classes-*.json` și capturile PNG arată replay-ul vizibil pe aceeași suprafață: accelerație trei secunde, frână comandată patru secunde de la 20 m/s și viraj trei secunde de la 8 m/s. Proba Node măsoară frânarea până sub 0,1 m/s; aceste două definiții de oprire sunt diferite și rezultatele nu sunt prezentate ca identice. Masa, geometria roților, frictionSlip și comenzile roților sunt citite din Rapier. Puterea este definiția controllerului, aplicată prin plafonul dimensional `min(forceCapN, powerW / abs(longitudinalSpeedMps))`.

Tentativele inițiale WebGPU sunt invalide, păstrate separat. Diagnosticul `invalid-webgpu-1791202111806.json` a surprins un gap RAF de 1006,7 ms înainte de primul tick, fără lucru fizic. Controlul nativ Windows a confirmat că fereastra Chrome era minimizată, deși DOM focus/visibility erau true. După restaurarea ferestrei, diagnosticul scurt și protocolul complet au folosit aceleași praguri de debt, timestep, solver și caps. Sursa și artefactele versiunii anterioare sunt în `pre-diagnostic/`, fără reinterpretarea lor ca probe valide finale.

Verificare curentă: `node tests/browser/vehicle-classes/verify.mjs`. Aceasta verifică sursele curente și byte-artefactele buildului, protocolul, GPU-ul real, bugetele, compatibilitatea cu baseline022 și cleanup-ul. Rezultatul este `summary.json`. După acceptarea curentă, `--historical` verifică sursele byte-identice din `source-at-capture/`, bugetele arhivate și aceleași rapoarte, scriind separat `historical-summary.json`. Modul implicit respinge sursele schimbate. Modul istoric verifică manifestul artefactelor și acceptarea originală; nu pretinde că a recitit artefactele istorice.

Probele verifică modelul mecanic timpuriu și workloadul desktop dedicat. Nu validează gameplay complet, laptopul sau gate224. Heap-ul JS și resursele scenei sunt observabile; memoria WASM/GPU exactă nu este măsurată. Bufferul de samples este bounded, 2.880.000 bytes per braț complet; ringul diagnostic este 4096 bytes. Catalogul are două intrări, iar testele de capacitate păstrează 110 mașini / 207 corpuri / 256 collidere / 880 subscriptions și revenirea la baseline după 20 cicluri.

Verificarea curentă și cea istorică au trecut, fără erori: [summary.json](summary.json), [historical-summary.json](historical-summary.json). Identitatea finală este sursa `740d2b41ff1fb79d9569641ce104321f456d4e8be014c0311c10d123b11172cd`, artefactul `d469bf04c5baf81a8e5327596d0dd0483305a0a849b76f356dbe44041def2ba8`. Arhiva finală conține cele 55 intrări hardware plus două intrări suplimentare pentru proba Node, cu `.gitattributes` care păstrează bytes. Cele opt intrări ale baseline-ului Node sunt păstrate în `before-source/`; fiecare hash a fost verificat față de captura originală.

| Mediană p95, ms | WebGPU 022 / default023 / mixed023 | WebGL2 022 / default023 / mixed023 |
| --- | ---: | ---: |
| Frame | 7 / 7 / 7 | 7 / 7 / 7 |
| Main thread | 3,2 / 3,4 / 3,5 | 2,8 / 3,0 / 3,1 |
| Tick fizic | 2,3 / 2,5 / 2,6 | 2,3 / 2,5 / 2,5 |
| Rapier step | 1,7 / 1,9 / 1,9 | 1,7 / 1,9 / 1,9 |

Toate brațele complete au depășit raportul simulated/active-wall de 0,98, fără suprasarcini, pierdere de vizibilitate/dispozitiv sau long tasks în intervalele măsurate. Nu există regresie confirmată în cel puțin trei din cinci brațe conform pragului comun >10% și >1 ms. Diferențele sub rezoluția timerului sunt raportate ca măsurători, fără extrapolare la gameplay complet.

Starea execuției este în [progress.md](progress.md). Chrome `physics023` și serverul dedicat5193 au fost închise după captură. Verificarea globală trece typecheck/lint/format/arhitectură și364teste ([log](global-check.txt)). PBI023 este fizic în Done; RequireDone023 și Validate-Plan trec ([board](board-check.txt), [plan](plan-check.txt)).

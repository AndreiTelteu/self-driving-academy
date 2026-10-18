# Harness de performanță — PBI218

`src/telemetry/performance.ts` exportă un colector numeric portabil și schema `PerformanceReport` v1 prin entry point-ul telemetry. Colectorul nu accesează DOM-ul și nu schimbă starea jocului. Metricile CPU, kernel simulation, frame, debt, GPU, input, learning și checkpoint sunt independente. O metrică fără mostre este `unavailable` cu motiv și distribuție null, niciodată zero dedus din lipsa API-ului.

Capacitatea benchmarkului este cel mult60.000 de mostre per metrică,11 metrici:5.280.044 bytes pentru buffers+contoare cu colector activ și44 bytes pentru contoare când e dezactivat. Este o alocare separată de istoricul diagnostic Babylon4096 din manifest203-initial-1 (131.072 bytes). Observatorul comun de referință browser folosește încă960.000 bytes; funcționează identic în ambele brațe. Agregarea face temporar copii sortate după măsurare, secvențial per metrică. Exportul este plafonat la1MiB, cinci perechi și cel mult cinci intrări cold/warm. La depășirea bufferselor se raportează dropped și incomplete; raportul respinge măsurarea. Nu există log sau JSON per cadru.

Distribuțiile folosesc nearest rank pentru p50/p95/p99, min/max/mean, histograma cu limite1/4/8/16,67/25/50ms și numărul strict peste buget. Statisticile se calculează numai la finalizarea fazei. `finish` închide colectorul. Raportul deține o copie JSON a datelor; aceasta nu este un obiect deep-frozen. Hardware, browser, backend, preset, rezoluții, DPR, cache/rețea/alimentare, commit și sourceHash, versiunea bugetelor/fixture/engine și seedurile însoțesc toate măsurătorile. Physics/map rămân null când scope-ul nu le implementează.

## Probe separate

Proba CPU portabilă execută bucla fixă reală cu un counter determinist,20.000 de cadre cu ceas sintetic60Hz, cinci perechi și câte un pass identic de warmup. Alternarea oprit/pornit și pornit/oprit expune biasul de ordine. `simulation.clock=synthetic` și `admittedClockSeconds` identifică timpul admis de acest ceas; `measuredWallSeconds` măsoară execuția reală Node. Raportul lor nu dovedește FPS sau gameplay real-time. Snapshoturile sunt verificate în starea reală înainte/după dispose. Fișierul este exportat după probă în `Evidence/218/portable-cpu.json`.

```powershell
node --import ./scripts/register-typescript.mjs scripts/benchmark-performance-harness.mjs
node --import ./scripts/register-typescript.mjs scripts/summarize-performance-report.mjs Evidence/218/portable-cpu.json
```

Fixture-ul browser producție folosește Babylon WebGPU gol plus același kernel fixed-tick, cu RAF real și dimensiuni CSS/interne1920×1080. Cinci repetări recreează backendul: startup fresh+primul render CPU și al doilea render warm sunt reținute separat. Cache HTTP no-store nu controlează cache OS/driver și nu simulează25Mbit/s/RTT40ms; proba nu închide gate-ul cold first command. După aceste prime utilizări, fiecare braț are warmup real de minimum30s și minimum120s steady-state. Nu se rulează alte benchmarks/builduri în timpul măsurării hardware.

```powershell
./scripts/Run-PerformanceHarness.ps1 -Profile desktop -Port 5190
```

Deschide `http://127.0.0.1:5190/` în T3 preview și păstrează tabul vizibil și cu focus. Butonul „Rulează proba completă” durează aproximativ25 minute. Smoke folosește tot cinci perechi, cu durate scurte, și are fixtureVersion terminat cu`-SMOKE`; nu poate fi baseline. Exportul devine disponibil numai după toate fazele. Pentru salvare automată locală după probă, evaluarea `fetch('/export',{method:'POST',body:JSON.stringify(window.performanceHarnessReport)})` scrie pe server raportul în`Evidence/218`. Endpointul limitează bytes și verifică identitatea buildului; sumarizatorul verifică perechile/protocolul separat. Serverul ascultă numai127.0.0.1.

Focusul/visibility și pierderea GPU sunt verificate pe tot parcursul; o pierdere invalidează proba. Long Tasks folosește API-ul numai când suportul este real, are maximum1024 evenimente per fază și raportează suport/count/max/overflow. La final se cedează un task și se drenează observerul. GPU este separat în`gpuTimer`: numai rezultate disponibile din ultima fereastră4096 de cadre, cu statut unsupported/pending explicit. Nu se pretinde distribuție GPU pe toate cadrele. Memoria exactă pagină/GPU rămâne null; owned buffers și contoarele Babylon sunt categorii separate, fără însumare drept RAM totală.

`simulationCpuMs` măsoară kernelul complet per cadru, inclusiv snapshot/interpolare. `tickCpuMs` nu este fabricat din costul callbackului counterului: tickul fizic autoritar complet va fi instrumentat cu fixture-ul său. Inputul driving, fizica Rapier, learning-ul și checkpointurile încă neimplementate rămân unavailable. `gameplayGate=NOT_VALIDATED` se păstrează pentru toate probele218; țintele manifestului203 sunt context provizoriu.

Sumarizatorul prezintă mediana/min/max ale p95 pentru cele cinci brațe, fără a construi percentile globale din percentile de repetare. Overhead-ul este diferența brută pornit minus oprit pentru fiecare pereche; valori negative nu dovedesc o îmbunătățire cauzală. Colectorul opțional și observatorul GPU sunt incluse în acest cost. Baseline-ul desktop203 rămâne nemodificat și nu poate certifica overhead-ul colectorului nou218.

## Stare verificată

Proba CPU, testele percentile/capacitate/absență API și proba browser proprie sunt executate. T3 preview a fost încercat prioritar, dar hasFocus=false a respins corect smoke-ul. Utilizatorul a autorizat explicit Chrome local la reluare; Chrome154 headed a avut focus real și adaptor amd/rdna-3. Proba completă a păstrat cinci perechi, warmup >=30.000ms și measure >=120.000ms, fără overflow sau overload, cu cinci startup/first-use și cinci renderuri warm separate. Vezi [verificarea și limitările](../Evidence/218/verification.md) și raportul `Evidence/218/desktop-webgpu.json`.

CPU p95 median a fost 0,2000000477ms în ambele brațe, frame p95 7ms și raportul simulare/ceas RAF aproximativ0,99998. Diferența p95 a colectorului este indistinctă la rezoluția ceasului browserului; nu înseamnă cost zero sau instrumentare gratuită. GPU timer a fost unsupported în toate brațele active și nu primește o valoare dedusă. Memoria exactă și controllerul driving rămân unavailable.

Identitatea este commit bf37fd9 plus sourceHash e3b3abbe23c9d8f610e7a271a74afabae374e39bae33304ab093d5d107196ff4 pentru modificările necomise. Manifestul verifică bytes reali ai celor129 de artefacte, iar verifierul compară digestul cu sursele curente. Snapshotul CIM/alimentare este capturat la pornirea serverului05:18+03, anterior probei09:28+03; este proveniență punctuală, fără monitorizare continuă. Snapshotul de după probă este păstrat separat.

```powershell
node --import ./scripts/register-typescript.mjs scripts/verify-performance-evidence.mjs Evidence/218/desktop-webgpu.json
```

Aceasta validează scope-ul minim și colectorul218. Nu validează fizică/gameplay, laptop, rețeaua cold controlată sau țintele finale de resurse. Manifestul203 și baseline-ul său sunt nemodificate; gate-urile ulterioare păstrează propriile cerințe.
## Validare eficientă — 8 octombrie 2026

[Politica de validare](validation-policy.md) diferențiază verificările locale de gate-urile full/soak și permite corectitudinea izolată în paralel. Harness-ul comun are preflight export, profil DEV 3 × 2 × (15 s + 30 s), salvare automată fără suprascriere și checkpoint-uri imutabile de perechi. După preflight, folosește butonul Dezvoltare pentru cost local; proba completă rămâne pentru gate-uri. Pentru reluare, păstrează ID-ul sesiunii și confirmă condițiile comparabile; perechea întreruptă reîncepe integral. DEV/SMOKE nu certifică hardware/release. Aceste instrumente noi necesită propria verificare browser înainte de folosirea lor ca dovadă hardware; nu sunt prezentate ca probe executate.

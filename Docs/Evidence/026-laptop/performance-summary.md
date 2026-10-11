# Profilare Chrome Performance — PBI026

11 octombrie 2026. Diagnostic DEV, fără acceptare hardware/full.

Captura `a7cf1485-d9f7-469d-a95a-0cecee798121` s-a încheiat `DIAGNOSTIC_COMPLETE`: trei perechi BEFORE/current, 15 s warmup și 30 s măsurare per braț, AUTO/WebGPU. Fereastra Chrome folosită avea un singur tab. Trace-ul Performance de aproximativ 354 s include pornirea profilerului, pregătirea, șase brațe, exportul și un interval idle final. Screenshots au fost active, fără throttling CPU. Costul profilerului este inclus; aceste date nu sunt comparabile ca acceptare cu full fără profiler.

Source `2f5269907254e11e09300d7cb3ad5990683511e766bd520813b9c75a9aca0133`, artifact `dab01519c7ad2ac237d119aa9093d54c73d4f1c9eed82313df1fe7755e7d8cd9`, build UUID `8433f137-8054-4407-8c9e-3488432b2ef4`. `readPortableCapture` a reverificat exporturile și hashurile arhivei source/artifact/native/hardware. Toate cele șase readback-uri au entities/subscriptions/vehicles/obstacles/colliders=0 și disposed=true. Datele brute sunt în worktree, `Docs/Evidence/026-wheel-dynamics/laptop-20261011-browser/a7cf1485-d9f7-469d-a95a-0cecee798121`.

## Rezultate

Firul paginii este CrRendererMain, pid21380/tid1496, identificat prin `TracingStartedInBrowser` și URL-ul local. Taskurile LongTask ale fixture-ului corespund taskurilor RunTask din trace, cu offset aproximativ `510164027.3 ms` între ceasurile trace și Performance API. Diferențele sub 1 ms includ rotunjirea duratei LongTask.

| Task nou | Atribuire susținută de trace |
| --- | --- |
| 128,030 ms, arm5, înaintea primului cadru fizic | RunMicrotasks127,922 ms; stackuri Babylon createIndexBuffer/setIndices și createVertexBuffer/setVerticesData, RandomId; MinorGC4,219 ms. Pregătirea scenei, fără suprapunere cu intervalele CPU fizice. |
| 366,047 ms, arm3, înaintea primului cadru fizic | RunMicrotasks366,002 ms; V8.GCIncrementalMarkingStart179,955 ms, sweeping178,830 ms/CppGC167,175 ms și MajorGC12,865 ms, evenimente imbricate care nu trebuie însumate. Stackuri rebuild/isReadyForSubMesh și creare geometrie Babylon. |
| 57,529 ms, arm1, măsurare | Taskul consumă18,923 ms CPU de fir (`tdur`), față de57,529 ms elapsed. Cadrul înregistrează main50,2 ms, render45 ms, tick4,1 ms, projection1,1 ms. Trace-ul arată callback RAF/microtasks și apeluri locale; diferența elapsed–CPU38,606 ms nu identifică motivul schedulingului/blocării. Nu demonstrează un cost GPU de45 ms. |
| 189,547 ms, arm0, warmup | Primul cadru fizic costisitor, cu stackuri Rapier WASM step; main179,8 ms. Profilarea cold/first-use și instrumentarea nu sunt steady-state. |
| 463,406 ms, pornirea profilerului | CpuProfiler::StartProfiling459,002 ms și deoptimizare. Este costul instrumentării, anterior lansării diagnosticului. |

Toate cele șase brațe au terminat fără overload. Lagul maxim RAF→CPU pe brațe este20,2/19,6/17,8/19,5/8,9/19,7 ms. Taskurile de110/218/141/366/118/127 ms raportate la începutul brațelor nu se suprapun intervalelor CPU fizice; sunt distincte de incidentul dintre cadre din captura istorică.

## Concluzie și pas următor

**Incidentul istoric de129 ms la412929,8 ms din captura91e876ed nu s-a reprodus. Cauza lui rămâne neidentificată.** Taskul nou de aproximativ128 ms este pregătire Babylon și nu poate fi folosit drept atribuirea retroactivă a incidentului vechi. Captura nouă dovedește separat costuri de first-use, pregătire și GC; nu dovedește că o extensie a provocat incidentul istoric. Profilul conține extensii injectate, dar simpla lor prezență nu stabilește cauzalitatea.

Următorul diagnostic util este o captură mai scurtă concentrată pe steady-state BEFORE, cu stackuri și timestamps păstrate, pentru un episod între cadre. O comparație într-un profil Chrome curat poate controla influența extensiilor numai ca experiment distinct, cu configurația consemnată și fără reclasificarea probelor existente. Nu este justificată optimizarea proiecției roților din acest rezultat. Bugetele, fizica și eșecul full istoric rămân neschimbate; PBI026 rămâne In Progress.

## Fișiere de reproducere

- `performance-a7cf1485.json.gz`: export Chrome original copiat byte-exact din Downloads,61.594.492 bytes.
- `performance-tasks.json`: evenimente și durate ale taskurilor principale≥50 ms.
- `cpu-profile.json`: Profile/ProfileChunk ale procesului paginii, extrase secvențial.
- `performance-attribution.json`: stackuri eșantionate în fiecare task; numărul eșantioanelor nu este o măsurătoare exactă per funcție.
- `profile-stage-readback.json`: terminal verificat și asocierea LongTask↔cadre CPU.
- `analyze-performance.py`, `extract-profile.py`, `attribute-tasks.py`: extragere și analiză offline. Prima parsare Node a fost respinsă de limita stringului>512 MiB; nu a schimbat datele. Extragerea Python secvențială a trecut.

Trace-ul este o dovadă locală, nu a fost încărcat pe vreun serviciu extern. Nu s-a executat o nouă probă full și nu există BOTH PASS.

SHA256 trace gzip: FD3DEDC309C99B1B35B831119DACEFE67DD3CE6A8B7B74C07B5999C1C4131850, egal cu originalul din Downloads. Stackurile sunt eșantionate, nu instrumentate per funcție; deltele negative din profilul V8 nu sunt numărate ca eșantioane pozitive. Validatorul boardului PASS,235 PBI-uri. Serverul deținut5220 a fost oprit după captură; cererea automată DevTools pentru .well-known/appspecific/com.chrome.devtools.json a returnat ENOENT, fără a împiedica exportul fixture-ului ori trace-ului.


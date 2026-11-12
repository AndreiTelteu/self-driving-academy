# Contracte de performanță și benchmark progresiv

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Acesta este un plan de implementare și acceptare; jocul nu are încă măsurători. [Manifestul 203-initial-1](performance-budgets.json) fixează contractul inițial înainte de fizică și extinderea orașului, folosind baseline-ul real al desktopului disponibil. La 5 octombrie 2026, utilizatorul a omis explicit testul laptopului din 203; nicio măsurătoare sau trecere laptop nu este declarată. Bugetele gameplay și capacitățile nemăsurate de bootstrap rămân provizorii, cu owner/fixture de calibrare. Derogarea privește numai testul laptop din 203; gate-urile ulterioare de hardware/gameplay/release rămân obligatorii.

## Probleme identificate în planul anterior

| Lacună | Efect posibil | Corecție și PBI |
| --- | --- | --- |
| Benchmarkul complet începe la 155–156 | O arhitectură costisitoare este descoperită după campanie și asseturi | Harness 218 și gate de flotă 220 înainte de 116/145/146 |
| 60 FPS fără protocol și latență | Media ascunde sacadarea și inputul întârziat | Percentile, debit de simulare și raport versionat în 218/203 |
| Decizii la 10 Hz fără distribuirea lucrului | Toată flota decide în același tick, producând vârfuri | Scheduler determinist și protecție la acumulare în 219 |
| Mai multe worker-e fără buget comun | Learning, comparațiile și encode/hash savefile concurează cu jocul | Admitere, priorități și întrerupere cooperativă în 221 |
| Snapshot/recorder/autosave doar „asincrone” | Copierea și serializarea pot bloca firul principal | Captură măsurată, chunkuri și limite în 222 |
| Instanțiere/LOD abia la optimizarea finală | Scene cu prea multe obiecte, texturi și umbre | Contract de asseturi și calitate în 223, verificat în 145/146/150 |
| Istoric KPIs fără limită de afișare | Recalculări din ledger și grafice tot mai mari | Agregări incrementale, paginare și downsampling în 209/210 |
| Soak de 30 de minute fără scenariu repetabil | Leak-uri și degradarea termică pot rămâne ascunse | Soak de minimum 60 de minute în 159 și gate 224 |
| CI generic fără prag de regresie | Încetinirile succesive ajung la release | Probe portabile și măsurători pe hardware în 224/160 |

## Hardware, workload și bugete

PBI 203 produce un manifest versionat de bugete și identifică efectiv, pe desktopul măsurat, CPU, GPU, RAM, OS, browser/versiune, driver, backend, alimentare, refresh rate, rezoluție CSS, devicePixelRatio și rezoluție internă. Configurații de referință: desktop mediu la 1920×1080/Medium și laptop cu GPU integrat la 1920×1080/Low. Rezoluția internă exactă se fixează separat; nu se presupune că un canvas CSS 1080p randează automat 1080p pe un ecran cu DPR mare. Nu declarăm modele hardware sau rezultate fictive.

Workload-ul uzual are 24 de taxiuri și 40 de civile; workload-ul maxim V1 validat are 30 de taxiuri și 40 de civile. 20 de taxiuri și trafic redus verifică scalarea. 30 de taxiuri plus 80 de civile este un test de suprasarcină, separat de cerința normală de FPS. Toate mașinile rămân în lumea fizică, inclusiv în afara camerei. Profilurile prudent/agresiv și cozile/contactele sunt parte din workload, deoarece modifică și costul simulării.

| Metrică | Desktop: propunere | Laptop integrat: propunere | Metodă / limită |
| --- | --- | --- | --- |
| Cadență de render | 60 FPS | 30 FPS | Se raportează și refresh/cap; media singură nu închide gate-ul |
| Interval de cadru p95 / p99 | ≤18,5 / 25 ms | ≤35 / 50 ms | În gameplay steady-state, pe workload maxim validat |
| Lucru pe firul principal p95 per cadru | ≤10 ms | ≤20 ms | Include tick-uri, randare CPU, UI și captură de date |
| Tick autoritar complet p95 | ≤5,5 ms | ≤8 ms | Include fizică, controller, decizii scadente și evenimente |
| Pas Rapier p95 | ≤3 ms | ≤5 ms | Măsurat separat de pregătirea comenzilor și copieri |
| Lucru GPU p95 | ≤12 ms | ≤28 ms | Numai cu timer disponibil; altfel indisponibil, nu 0 |
| Input → aplicarea comenzii p95 | ≤50 ms | ≤80 ms | Latență software; nu pretinde măsurare până la pixelul fizic |
| Timp simulat / timp real activ | ≥0,98 | ≥0,98 | Fără pauze, timp de loading sau experimente; detectează încetinirea ascunsă |
| Închiderea segmentului → activare learning p95 | ≤2 s | ≤2 s | Segment uzual ≤120 s simulate, incluzând așteptarea în coadă, fără pauză |
| Pornire la prima comandă acceptată, cold p95 | ≤12 s | ≤12 s | Profil de rețea propus: 25 Mbit/s, RTT 40 ms, cache gol |
| Recorder RAM / payloaduri worker în așteptare | ≤32 / 16 MiB | ≤32 / 16 MiB | Capacități explicite, distincte de totalul memoriei paginii |
| Replay opțional în IndexedDB | ≤128 MiB | ≤128 MiB | Sub plafonul real al browserului; nu autorizează ștergerea ledgerelor |

Bugetele CPU și GPU nu se adună ca și cum ar fi operații seriale; intervalul de cadru se verifică independent. Manifestul fixează și limite pentru heap disponibil, memoria WASM, texturi estimate, obiecte Babylon, draw calls, dimensiuni de chunk/checkpoint, tranzacții și cozi. Aceste limite se aleg din baseline-ul real; în lipsa unui API de memorie portabil se folosesc contoare de resurse deținute de aplicație și capturi externe. Heap, backing buffers și WASM pot avea suprapuneri în instrumentare; raportul nu însumează categorii suprapuse ca „RAM totală”.

Propuneri pentru asseturi: JS+WASM critice ≤8 MiB transferate, întregul set necesar primei curse ≤20 MiB transferate, texturi rezidente estimate ≤256 MiB Low / ≤384 MiB Medium. Dimensiunea comprimată nu reprezintă memoria după decodare. 223 calibrează și verifică bugetele provizorii fixate în manifestul 203 și include costul decoderelor, mipmap-urilor și variantelor de shader. O depășire nu se repară schimbând pragul retroactiv; se optimizează sau se consemnează explicit o revizie a cerinței și baseline-ului.

## Tick-uri, controller și decizii

Fizica și realizarea comenzilor rulează la 60 Hz; deciziile de nivel înalt ale traficului au inițial 10 Hz. Fazele se distribuie determinist după entityId pe cele șase tick-uri ale perioadei, pentru a evita o rafală simultană. Evenimentele urgente invalidează contextul și sunt procesate la următorul tick relevant; inputul MANUAL/LEARNING nu așteaptă slotul AI de 10 Hz. Nu se adaugă o frânare regulamentară automată care să anuleze stilul învățat.

PBI 219 definește ordinea și limitele de lucru pentru context, rutare, dispecer și UI. Rutarea folosește chei cu versiunea grafului, origine/destinație și costuri; cache-ul are plafon și invalidare la blocaje/modificări, inclusiv la costuri de profil în V2. Reutilizarea aceleiași rute nu autorizează ignorarea unui drum blocat. Query-urile de vecini se compară cu o referință brută; celulele foarte aglomerate și vehiculele la graniță fac parte din test. Nu tăiem vecinii relevanți pentru a obține un număr mic de operații.

Propunere: maximum patru pași de recuperare per cadru, cu restul acumulat păstrat. Dacă datoria de simulare depășește 250 ms, se intră într-o pauză de suprasarcină explicită și se oferă reluare după reducerea costului vizual/joburilor. Nu se mărește dt, nu se sar tick-uri economice și nu se accelerează artificial cursele pentru recuperare. În background/pauză timpul real nu se acumulează pentru fizică. Benchmarkul consemnează orice astfel de pauză; aceasta nu este exclusă pentru a declara workload-ul normal performant. Pentru sarcina V1 acceptată, pauza de suprasarcină este un eșec de buget.

## Fizică și costuri fără alocări repetate

Vehiculele folosesc collidere simple calibrate; decorul vizual nu creează automat un collider. Filtrele de collision/query grupează șoseaua, vehiculele, obstacolele și senzorii fără a elimina contacte relevante. Rapier documentează formele și filtrele de query; alegerea și toleranțele sunt ale proiectului. [Colliders](https://rapier.rs/docs/user_guides/javascript/colliders/), [Scene queries](https://rapier.rs/docs/user_guides/javascript/scene_queries/).

Reutilizăm vectori, matrici și buffere acolo unde profilul arată presiune de alocare; se măsoară și bridge-ul JS↔WASM. A fi în afara camerei nu este motiv pentru eliminarea unui corp sau pentru dezactivarea fizicii. Sleeping-ul unui corp este permis numai dacă starea fizică îl justifică și comenzile/contactele îl reactivează; nu îngheață semafoare, cereri sau FSM-uri. CCD și solverul au configurații versionate validate pe vitezele maxime; nu sunt dezactivate la scăderea FPS. 021 măsoară și cazul cu multe contacte, nu doar o singură mașină.

## Randare Babylon, asseturi și calitate

Decorul static este grupat după material și celulă spațială. Thin instances sunt evaluate pentru repetiții statice; un batch întins peste tot orașul poate rămâne vizibil chiar când puține obiecte sunt în cadru. Pentru vehiculele dinamice se compară instanțe normale și batchuri mici, cu maparea instanceIndex→entityId menținută după modificări. Aceste alegeri derivă din limitele documentate de Babylon, nu dintr-o presupunere că thin instances sunt mereu mai rapide. [Thin instances](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/mesh/copies/thinInstances.md).

Se îngheață numai transformări/materiale dovedit statice. Vehiculele, semafoarele și semnalizatoarele trebuie să poată actualiza reprezentarea. freezeActiveMeshes nu se aplică global orașului dinamic; alegerea camerei, spawn/despawn și pickingul sunt teste obligatorii. Pickingul la mișcarea pointerului se dezactivează dacă fluxul folosește doar click, păstrând accesul la selecție. [Optimizarea scenei](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/scene/optimize_your_scene.md).

Low/Medium/High au limite pentru rezoluție internă/DPR, umbre, distanța umbrelor, LOD, texturi, transparență și efecte. Reducerea automată folosește ferestre și histerezis, cu interval minim între schimbări și opțiune manuală. Schimbă numai prezentarea: nu numărul mașinilor, dt, profilul, oportunitățile, revenue-ul sau XP-ul. Detectarea CPU-bound/GPU-bound precede alegerea ajustării; rezoluția redusă nu rezolvă un evaluator CPU fără control de resurse. Benchmarkurile principale fixează presetul și rezoluția; adaptarea are un scenariu separat și nu ascunde nivelul folosit.

Asseturile critice sunt încărcate și variantele de material necesare primei curse sunt pregătite în loading. Decorul opțional este încărcat incremental, cu plafon de concurență și cache cu ownership/disposal. Datele rutiere și colliderele necesare tuturor mașinilor nu sunt descărcate doar pentru că o zonă nu se vede. Shader compilation, decode/transcode și upload GPU sunt măsurate separat. Codec-uri precum KTX2 se adoptă numai după verificarea costului decoderului, formatelor efective și fallbackului. Audio are un plafon de voci simultane și priorități după proximitate/importanță; toate cele 70 de mașini nu au nevoie de sunete complete în afara razei audibile.

## Worker-e, learning și comparații

221 introduce un singur coordonator de admitere. Propunere inițială: cel mult un job de calcul greu simultan în fundal, inclusiv loturile unei comparații; o lume Rapier de experiment activă la un moment dat, refolosită secvențial pentru control/tratament și seed-uri. Worker-ul de I/O, dacă este ales, are buget separat și mesaje plafonate. navigator.hardwareConcurrency este un indiciu, nu permisiunea de a ocupa toate nucleele. Priorități logice: păstrarea datelor protejate și learning interactiv, apoi encode/hash savefile cerut de jucător și comparații opționale; ordinea nu pretinde priorități OS.

Joburile grele lucrează în felii măsurate, cedează efectiv event loop-ul și verifică anularea între felii. Propunere: felie ≤10 ms, răspuns la anulare ≤100 ms și notificări de progres ≤5 Hz. Un Promise deja rezolvat nu este o garanție că mesajele de anulare vor fi procesate. La presiune CPU/memorie, comparațiile opționale sunt amânate/întrerupte cooperativ; learning-ul nu este lăsat în spatele unui lot lung. Se măsoară costul pornirii WASM și numărul de lumi rezidente.

Datele numerice mari folosesc transfer de ArrayBuffer numai cu ownership explicit; senderul nu mai poate folosi bufferul transferat. Nu transferăm bufferul autoritar al lumii și nu clonăm întreaga lume la fiecare mesaj. SharedArrayBuffer nu este o condiție pentru V1. [Transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects).

Coada are limite de număr, bytes și vârstă. Joburile stale/duplicate sunt invalidate prin identitate/sessionId/worldEpoch/learningEpoch. La capacitate, descrierile protejate de learning sunt persistate, iar UI arată progres; comparațiile opționale pot fi amânate/anulate. Reward-urile și creditele XP sunt date protejate, fără evaluări negative în worker. Dacă persistența nu mai poate păstra datele protejate, sesiunea se suspendă cu export/curățare explicită. A/B folosește aceeași fizică și seed-uri pentru comparații, fără schimbarea XP.

## Telemetrie, recorder și checkpoint

222 definește capacități în bytes, chunkuri și ownership. Samples numerice folosesc buffere reutilizabile; evenimentele își păstrează tick-ul exact. O intervenție lungă este împărțită în chunkuri sau segmente cu continuitate și closeReason explicit, fără dublarea oportunităților și fără schimbarea MANUAL/LEARNING. La presiune se elimină mai întâi replay-ul opțional nefixat; datele eligibile, creditele XP, încasările și reward-urile nu sunt trunchiate tacit. Replay-ul incomplet este etichetat.

Un checkpoint capturează toate componentele la aceeași limită de tick. Snapshotul fizic și copierea minimă a stării au cost sincron care trebuie măsurat chiar dacă scrierea ulterioară este asincronă. Encode/compression/export și operațiile DB sunt făcute incremental sau într-un worker, după transfer sigur. Dacă acea captură sincronă nu intră în buget, se înregistrează o decizie de arhitectură înainte de extindere; nu declarăm că „IndexedDB async” rezolvă costul. Folosirea IndexedDB și într-un worker este o opțiune documentată, nu o obligație de a introduce încă un worker. [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).

Există cel mult o generație de checkpoint în pregătire și una în commit; cererile periodice redundante sunt coalesced. Evenimentele comerciale/reward și invalidările de learning păstrează ordinea și identitatea; nu sunt pierdute prin coalescing. Generațiile sunt pregătite înainte de tranzacția scurtă care publică referința coerentă. Nu ținem o tranzacție IndexedDB deschisă în timp ce așteptăm mesaje de worker. UI afișează vârsta ultimului commit și starea nesalvată. Shutdownul browserului nu garantează un autosave final; recuperarea se bazează pe ultimul commit confirmat.

## HUD, KPI-uri și istorii

HUD/lista/minimapul se actualizează la 5–10 Hz din proiecții compacte și numai în componentele schimbate; inputul și evenimentele autoritare rămân la tick. Review-urile și bucketurile KPI sunt actualizate incremental la evenimente idempotente, fără rescanarea întregului ledger la fiecare cadru. Popup-ul citește agregări, paginează review-urile și limitează punctele graficului la rezoluția afișată. Downsamplingul este numai vizual; tooltip-ul și tabelul pot accesa sumele/numărul de observații exacte. Sortarea listei și notificările au intervale/capacități, iar un panou închis nu reconstruiește grafice. Profilul jucătorului și DrivingProfile rămân independente.

## Protocol de benchmark și regresii

218 produce un PerformanceReport cu commit, budgetVersion, fixtureVersion, engine/physics/mapVersion, seeds, hardware/browser/backend, preset/rezoluții, cache/network/powerState, warmup și durata măsurată. Raportează p50/p95/p99, distribuții, cadre peste buget, timpi de tick și debt, latență de input, learning queue/service/end-to-end, bytes/copieri/transferuri, vârsta checkpointului, cozi, obiecte/resurse și excluderi explicate. Observatorii au buffere limitate și cost măsurat activat/dezactivat. Nu exportăm JSON mare și nu logăm la fiecare cadru în timpul probei.

Long Tasks este utilizat unde este suportat pentru blocări ale firului principal de cel puțin 50 ms; se verifică suportul, iar lipsa API-ului nu înseamnă lipsa blocărilor. Trace-uri de browser și mark/measure completează instrumentarea. Propunere: nicio blocare de aplicație >50 ms în proba steady-state normală. Timer-ele GPU și memoria exactă pot fi indisponibile; se raportează explicit acest lucru. [PerformanceLongTaskTiming](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming).

| Etapă / PBI | Probe obligatorii |
| --- | --- |
| 203 / 218 | Bootstrap, baseline și observator activat/dezactivat; fișier de bugete fără rezultate inventate |
| 021 / 204 | Fizică și bucla de learning timpurie; input, primele materiale și activare de profil |
| 220, după 065/115 | 20/24/30 taxiuri, până la 40 civile; prudent/agresiv, coadă la intersecție, toate în afara camerei, schimbare rapidă de selecție |
| 145/146/150 / 223 | Aceleași probe cu asseturile finale, cold/warm load, primul pickup/material, spawn/disposal și audio |
| 206/207/210/213 / 222/221 | Conducere cu recorder+autosave, learning și credite XP; popup în AUTO cu 12 luni sintetice de istoric și review-uri paginate, pauză în MANUAL/LEARNING; backpressure/anulare |
| 155–158 | Workload V1 complet pe ambele backenduri; normal și suprasarcină, preset fix și adaptiv separat |
| 159 / 224 | Minimum 60 minute cu curse/intervenții/reseturi/cameră, plus repetarea probei după încălzirea laptopului; gate CI și artefacte |
| 189 / 201 | Aceleași cerințe cu pietoni/pericole V2, respectiv personaj V3; bugete versionate separat pentru scope extins |

Pentru gate-ul full steady-state: warmup 30 s, apoi minimum 120 s măsurate, cinci repetări per configurație/seed documentate. Încărcarea cold și prima utilizare au probe distincte; nu dispar din raport prin warmup. Se păstrează rezultatele fiecărei repetări și mediana metricilor, cu variația între probe. Benchmarkul principal se rulează cu build de producție și inspector închis; headless/software GPU nu dovedește FPS pe laptop. Scenele CPU fără renderer sunt probe suplimentare pentru algoritmi, nu substitutul jocului complet.

CI obișnuit verifică determinismul fixture-urilor, limite de operații, capacități, dimensiuni de bundle/asseturi și smoke de benchmark. Pragurile absolute FPS/GPU se închid pe runner/dispozitiv real identificat, cu rezultatul atașat aceleiași revizii; dacă acesta lipsește, gate-ul hardware rămâne nevalidat. Propunere de regresie pe aceeași configurație: creștere >10% și >1 ms a timpului p95, ori creștere >10% și >5 MiB a memoriei urmărite, confirmată în minimum trei din cinci repetări, blochează gate-ul. Aceste praguri relative nu permit depășirea bugetului absolut. Actualizarea baseline-ului are motiv și diff; nu este efectuată automat pentru a accepta o regresie.

Soak-ul raportează tendința după warmup pentru heap/WASM/resurse estimate, listeners, voci audio, corpuri, chunkuri și cozi; retenția ajunge la platou. Propunere: se repetă 20 de cicluri de schimbare a hărții/rendererului și deschidere/închidere de panouri în aceeași probă. Resursele revin la plafonul manifestului după cleanup; rezultatul nu cere ca un browser să elibereze exact aceeași valoare de heap la un moment ales. Thermal throttling, battery saver și tab background sunt scenarii distincte, cu stări consemnate.

## Regula de închidere a unui PBI relevant

Frontmatterul performance_checks declară subsetul necesar: frame, simulation, memory, workers, storage, loading, ui, assets, soak. Înainte de implementare se citește acest modul și se păstrează un baseline pe fixture-ul disponibil; după schimbare se compară aceeași probă, cu build și versiuni identificate. În task-urile anterioare lui 203 se folosesc probele de bootstrap și praguri marcate provizorii; manifestul este fixat în 203, iar 218 condiționează proba de fizică 021. O funcționalitate nouă raportează separat costul suplimentar. Dovezile includ metricile, bugetul, profilul hardware și limitele reale. Scope-ul timpuriu nu cere artificial jocul complet, dar un cost imposibil de măsurat nu este declarat acceptat.

Gate-ul 220 condiționează campania și înlocuirea cu asseturi finale. 221 condiționează worker-ele de learning/experimente; 222 condiționează integrarea autosave; 223 condiționează asseturile finale; 224 condiționează buildul/release-ul. 157/158 rămân optimizările finale bazate pe profil, nu prima ocazie în care măsurăm performanța. Nu se migrează automat fizica live în worker/compute și nu se introduce o reprezentare redusă a civililor fără un experiment și o decizie care păstrează semantica confirmată.

## Workload-uri suplimentare ale reviziei 0.5

224 include 30 taxiuri/40 civile cu impacturi multiple în decor, efecte/audio plafonate, director de provocări și recorder/autosave. 20 de cicluri Academie/Haos/reset verifică revenirea la baseline a corpurilor, listeners, cache-urilor și joburilor. 229/230 măsoară slider draft/aplicare fără rafale de versiuni sau capturi. 234 măsoară encode/canonicalizare/hash/import pe savefile-ul maxim admis, cu progres/anulare în pauză. Costurile de distrugere, checkpoint pentru două sesiuni și istoricul de provocări au plafoane fixate în 203/222/223 după prototip; nu se adaugă obiecte fizice nelimitate. Aceste probe sunt în [modulele 26–29](26-joaca-libera-haos-si-distrugere.md); KPI/XP/daily nu sunt simplificate pentru a obține FPS.

## Politica de validare din 8 octombrie 2026
[Validarea proporțională cu schimbarea](validation-policy.md) stabilește nivelurile funcțional, targeted/DEV, full și soak. Această politică înlocuiește interpretarea că fiecare performance_checks cere un benchmark hardware complet. DEV are trei perechi 15/30 s; full păstrează cinci perechi 30/120 s și gate-urile de release. Bugetele, cerințele explicite de hardware și rapoartele istorice rămân neschimbate. Paralelizarea este pentru corectitudine izolată; benchmarkurile cronometrate sunt secvențiale. Preflight-ul, reutilizarea harness-ului și checkpoint-urile de perechi complete reduc reluările.

## Rezultat măsurat la gate-ul 220 (22 octombrie 2026)

Gate-ul 220 a rulat matricea de mai sus pe hardware real identificat prin CIM (Lenovo Yoga 7 14ARP8, Ryzen 7 7735U, Radeon 680M, 16 GiB, Windows 11 Home 26300, Chrome 155, 1920×1080 CSS/intern, DPR 1, preset LOW fix, schema High performance), cu build de producție și cinci repetări per configurație, în două sesiuni separate (WEBGPU și WEBGL2). S-a aplicat coloana `laptop` a manifestului `203-initial-1`; pragurile nu au fost modificate.

Rezultat: 20/24/30 de taxiuri cu până la 40 de civili trec toate bugetele pe ambele backenduri (frame p95 16,8 ms, p99 ≤ 17,0 ms, main-thread p95 3,3–6,1 ms, tick autoritar p95 3,1–5,5 ms, Rapier p95 0,3–0,4 ms, input p95 1,6–2,5 ms, learning 17,3–17,8 ms, ratio 1,0001, zero cadre peste 35 ms). Proba 30/80 rămâne separată și este raportată ca `STRESS_STRUCTURAL_PASS`, fără gate FPS normal. Timerul GPU este disponibil doar pe WebGL2 (p95 ≈ 1,09 ms) și `null` pe WebGPU. Corecțiile reale care au adus tick-ul în buget (priming înainte de warmup, context 044 publicat la cadența deciziilor de 10 Hz fazate, cache de rutare mărginit) au păstrat semantica fizicii și a learning-ului.

Dovezile complete — rapoarte per rulare, sumare, matrice, manifeste, condiții de mașină, istoricul eșecurilor și verificarea independentă — sunt în [Docs/Evidence/220-fleet-gate](Evidence/220-fleet-gate/README.md). Bugetele rămân cele fixate în 203; un gate `full` nu înlocuiește soak-ul din 224 și nici workload-ul integrat cu asseturile finale din 155/223.

## Verificarea finală a hardware-ului și bugetelor (PBI 155, 12 noiembrie 2026)

PBI 155 verifică bugetele fixate în 203 pe cea mai apropiată probă integrată disponibilă și separă costul fiecărui sistem nou peste baseline. **Pagina de joc completă nu există încă**: intrarea de producție `src/main.ts` compune bootstrap-ul de randare, nu o cursă integrală, deci nu există „prima comandă acceptată” și nici un cadru de joc complet de măsurat. Proba integrată folosită este gate-ul 220 (populația reală 057, cerere/dispecer 059/060, decizii 058, context 044, semafoare 036, scheduler 219, controller 024, fizică 022/028 și pipeline-ul real 103→112); diferența față de jocul complet este declarată, nu ascunsă.

Configurația măsurată: laptopul identificat prin CIM (AMD Ryzen 7 7735U, Radeon 680M, 16 GiB, Windows 11 Home 26300), Chrome 155, preset `LOW_FIXED_220_FLEET` fix, 1920×1080 CSS și intern, DPR 1, alimentare AC, cinci repetări de 30 s warmup + 120 s măsurare, build de producție, inspector închis, pe WEBGPU și WEBGL2. Coloana aplicată este `laptop`; coloana `desktop` nu se împrumută.

Rezultat pe cele 40 de rulări comise (8 configurații × 5 repetări, dintre care două configurații de suprasarcină): **85 PASS, 0 FAIL, 6 NOT_MEASURED declarate, 17 rânduri structurale** de suprasarcină. Frame p95 16,8–16,9 ms (buget 35), p99 ≤ 17,0 ms (buget 50), main-thread p95 3,3–7,8 ms (buget 20), tick autoritar p95 3,0–5,8 ms pe workload-urile normale (buget 8), Rapier p95 0,3–0,5 ms (buget 5), input p95 1,6–3,8 ms (buget 80), learning 17,3–19,1 ms (buget 2000), raport timp simulat/timp real 1,0001 (minim 0,98), zero Long Task de aplicație, zero cadre peste 35 ms. Timerul GPU rămâne `null` pe WEBGPU și raportează 0,49–1,18 ms pe WEBGL2.

**Costuri noi, separate.** Măsurătoarea pereche pe contractele reale (5 eșantioane × 600 tick-uri, baseline real de conducere cu 70 de vehicule, 0,081 ms/tick) dă, în p95: learning 0,135 ms/tick (40,4 ms per segment închis), recorder 0,204 ms/tick (1,33 MiB încărcați din plafonul de 32 MiB), KPI 0,024, XP 0,025, provocări 0,076 și distrugere 0,058 ms/tick. Însumate reprezintă 6,53 % din bugetul de tick al laptopului (0,52 ms din 8 ms) și 2,6 % din bugetul de main-thread; fiecare sistem rămâne sub 2,55 % din bugetul de tick.

**Baseline înainte de optimizări.** Captura `20261022T005309189Z` (22 octombrie 2026, același laptop și protocol, build de producție dinainte de corecțiile 220) avea tick autoritar p95 de 6,6 / 7,1 / 7,6 / 9,1 / 10,4 ms pe cele cinci repetări ale workload-ului 30/40; maximul de 10,4 ms depășea bugetul de 8 ms. După corecții, aceleași cinci repetări dau 4,8–5,8 ms, sub buget, iar valorile de dinainte sunt păstrate ca dovadă, nu reclasificate.

**Declarat `NOT_MEASURED`.** Lucrul GPU pe WEBGPU (fără timer query), memoria exactă a paginii și a GPU (fără API portabil; se raportează heap-ul JS 37,0–69,7 MiB și contoarele de ownership) și pornirea la prima comandă acceptată cold (nu există pagina de joc completă). Încărcarea este totuși măsurată ca transfer real al build-ului de producție: 3 478 182 B JS + 2 646 596 B WASM = 5,84 MiB din plafonul de 8 MiB, gzip 1,69 MiB.

Raportul determinist (`npm run perf:hardware-budget`, cu `--check`; `--measure` reface cele două măsurători locale) compară valorile cu manifestul citit la rulare și refuză să declare PASS o metrică fără măsurătoare. Dovezile, tabelele per metrică și limitele sunt în [Docs/Evidence/155-hardware-budget](Evidence/155-hardware-budget/README.md). Bugetele din `performance-budgets.json` nu au fost modificate; gate-ul hardware al jocului complet rămâne `NOT_VALIDATED`, iar soak-ul și ciclurile lifecycle rămân la 224, cu integrarea finală la 235.

## Benchmark-ul flotei și al traficului (PBI 156, 12 noiembrie 2026)

PBI 156 execută matricea de flotă și trafic **rând cu rând**, nu doar pe workload-ul maxim: 3 numere de taxiuri (20/24/30) × 3 densități civile (20/40/80) × 4 sisteme atașate (baseline, learning, recorder+autosave, credite XP) × 3 condiții (normal, trafic agresiv/contacte, cold/first-use) = **108 rânduri**. Proba rulează în Node, fără renderer, pe contractele reale: populația 057, traficul civil 058, cererea/dispecerul 059/060, semafoarele 036, contextul rutier 044, controller-ul 024, fizica Rapier 022 și publicarea de contacte 028, plus pipeline-ul de learning 103→112, recorder-ul 207 cu capture de checkpoint 206/222 și creditele 213. Fiecare rulare: 30 tick-uri warmup + 180 tick-uri măsurate, două repetări; condiția cold are o singură repetare, fără warmup, 120 tick-uri.

**Rezultat: 36 PASS, 0 FAIL, 12 STRESS, 60 REPORTED.** Cele 36 de rânduri de gate sunt singurele workload-uri declarate în manifest (20/20, 24/40, 30/40) × 4 sisteme × 3 condiții. `30/80` este workload-ul `overload`: cele 12 rânduri sunt etichetate `STRESS` și raportate separat, fără gate FPS normal. Restul de 60 de combinații de densitate sunt în afara workload-urilor declarate și rămân `REPORTED`, nu dovezi de gate.

**Separarea CPU pe componente** (p95 pe rândurile de gate, în ms): tick complet 2,81–7,09 (p99 4,01–12,43), fizică Rapier 0,09–0,26, decizii 2,06–5,37, UI proiectat 0,06–0,25, sistem atașat 0–0,26. Deciziile domină tick-ul: contextul 044 publicat la 10 Hz, pasul traficului civil 058, dispecerul 059/060 și cache-ul de rutare. GPU-ul rămâne `NOT_MEASURED` cu motiv (fără renderer nu există timer), iar frame-ul/FPS-ul și main-thread-ul cu randare sunt declarate separat indisponibile; nu sunt raportate ca 0.

**Taxiurile invizibile.** Fereastra de observare este de ±80 m față de poziția taxiului 0; 18/20, 22/24 și 28/30 de taxiuri sunt în afara ei. Toate rămân în lumea fizică, primesc decizii (360–1 680 per rând, în funcție de număr și repetări) și își mișcă corpurile (20/20, 24/24, 30/30). Expunerea este citită din contractul real 137: `fleetVehicleSeconds = fleet.vehicles × simulatedSeconds`, cu numitorul pe toată flota 057, deci taxiurile invizibile sunt incluse explicit, nu doar cele din cameră.

**Sisteme atașate.** Learning: 227,9–681,7 ms de la închiderea segmentului la activare (buget 2 000 ms), cu 1 segment și 1 activare per rulare. Recorder+autosave: vârf de 156 160–407 040 B reținuți (capacitate 32 MiB) și două capturi reale de checkpoint per rulare. XP: o fereastră de 30 s per rulare, citită la 10 Hz. Cold/first-use: prima comandă acceptată în 351,3–550,7 ms (buget 12 000 ms), măsurată de la construcția world-ului, fără warmup.

**Declarat `NOT_MEASURED`:** frame/FPS (probă headless), lucru GPU (fără timer), main-thread total cu randare, layout/paint DOM, memoria exactă a paginii/GPU, pacing-ul real (timp simulat / timp real activ) și pornirea jocului complet cold (pagina completă nu există). Proba măsoară proiecțiile pure 073/075 pentru UI, nu layout-ul browserului; măsurătoarea de learning include cedarea către microtask-uri a fixture-ului (30 tick-uri), nu latenta reală a cozii de producție.

Raportul determinist (`npm run perf:traffic-benchmark`, cu `--check`; `--measure` reexecută matricea) derivă `report.json` + `report.md` din măsurătoarea comisă și refuză un PASS fără măsurătoare, o matrice incompletă sau un rând fără dovada taxiurilor invizibile. Dovezile și limitele sunt în [Docs/Evidence/156-traffic-benchmark](Evidence/156-traffic-benchmark/README.md). Bugetele din `performance-budgets.json` nu au fost modificate; gate-ul hardware al jocului complet rămâne `NOT_VALIDATED`.

## Sesiunea lungă de memorie și stabilitatea flotei (PBI 159, 12 noiembrie 2026)

PBI 159 rulează soak-ul cerut de contract: **minimum 60 de minute de timp de perete real și 20 de cicluri de lifecycle**. Proba este executată, nu simulată: 60,002 minute, 215 434 tick-uri la 60 Hz real (3 590,572 s simulați), 120 de eșantioane la 30 s, cu start → curse → intervenții → reset → reload în fiecare ciclu. Workload-ul este cel normal V1 (24 taxiuri / 40 civili) pe contractele reale — 057 populație, 058 trafic civil, 059/060 cerere și dispecer, 036 semafoare, 044 context rutier, 024 controller, 022/028 fizică și contacte — plus 112 learning, 207 recorder, 206/222 checkpoint, 132 retenție, 221 governor și 054 pentru blocajele de flotă.

**Rezultat: `SOAK_PASS`.** 14 verificări `PASS`, 3 `NOT_MEASURED` declarate, toate cele 7 tendințe `PLATEAU`, 87 de incidente, toate recuperate. Bugetele sunt citite din manifestul `203-initial-1` și nu au fost modificate.

**Memoria ajunge la platou.** Tendința se citește la granița ciclului (după reset, cu GC forțat), nu în interiorul unei lumi: o sesiune crește natural până la ~96 MiB heap și eliberează la reset. Baseline-ul cald (primul ciclu) este 43,72 MiB heap / 315,05 MiB RSS; finalul (ciclu 20) este 45,53 MiB / 319,43 MiB, deci **+1,81 MiB heap și +4,39 MiB RSS** peste 19 cicluri. Fereastra finală variază cu 0,11 MiB heap, sub pragul de 5 MiB al manifestului; RSS are un prag relativ de 10 % (33,5 MiB). Baseline-ul procesului rece (22,33 MiB) este raportat separat, pentru context.

**Cozile sunt mărginite și se golesc.** Coada 221 nu a depășit 1 job și 4 B; la fiecare închidere de ciclu a fost 0 joburi / 0 B. Răspunsul maxim la anularea explicită a unui job în execuție este 84 ms (buget 100 ms). În ciclurile 6 și 14 un job opțional indus a depășit lease-ul de 30 s, a fost reclamat cu status `stale`, iar `governor.usage.jobs` a revenit la 0 și admiterea a continuat. Pipeline-ul 222 a comis 2 380 de generații cu 0 respingeri.

**Blocajele flotei sunt raportate și recuperabile.** 72 de evenimente, 3–4 taxiuri pe ciclu, detectate după 60 s sub 0,3 m/s. 054 a clasificat 52 × `NO_PROGRESS_OFF_GRAPH` și 20 × `NO_PROGRESS_UNEXPLAINED`, cu `REQUEST_REROUTE`; fixture-ul a aplicat plasarea la portul 030 pe o bandă succesoare reală din graful 033, iar taxiurile au repornit. Toate cele 72 sunt recuperate. 054 doar cere rerutarea; plasarea fizică rămâne a fixture-ului.

**Retenția ajunge la cotă și rămâne acolo.** Recorder-ul produce ~17,4 MiB de fereastră deținută pe ciclu; predată ledger-ului 132, aceasta atinge cota durabilă de 128 MiB în ciclul 8. Din ciclul 8 în ciclul 20, fiecare depășire de 139,4 MiB este rezolvată prin export + evacuare `OLDEST_FIRST` (13 evacuări de 17,4 MiB), iar retenția rămâne la **121,95 MiB**, cu 7 artefacte. Vârful recorder-ului este 17,42 MiB din capacitatea de 32 MiB; eșantioanele reținute sunt 2 400 din 4 096. Nicio depășire `PROTECTED_OVERFLOW`.

**Throttling-ul este raportat, nu ascuns.** Statusul este `OBSERVED`, pe baza variației de timpi: p95 al tick-ului pe fereastră de 30 s variază între 5,16 ms și 8,85 ms (raport 1,72), cu p50 minim 2,85 ms și derivă maximă de 77 ms față de cadența de 60 Hz. Frecvența raportată de OS este constantă la 2 695 MHz în toate cele 120 de eșantioane; Windows raportează o valoare grosieră, nu există senzor termic în fixture, deci cauza termică nu poate fi dovedită sau exclusă aici.

**Declarat `NOT_MEASURED`:** cadența de render/FPS și lucrul GPU (probă headless, fără renderer sau timer GPU), memoria exactă a paginii (`totalHeapBytes` este `null` în manifest), layout/paint DOM, frecvența/temperatura reală a CPU și jocul complet în browser (pagina completă nu există încă). Transportul worker-ului este un loopback în proces peste `WorkerRuntime` real, nu un `Worker` de browser, iar store-ul de commit al pipeline-ului 222 este un dublu de test cu graniță asincronă reală, nu IndexedDB durabil.

Raportul determinist (`npm run perf:soak`, cu `--check`; `--measure` reexecută soak-ul) derivă `report.json` + `report.md` din măsurătoarea comisă și refuză un PASS fără măsurătoare, sub 60 de minute, sub 20 de cicluri, cu incidente nerecuperate sau cu o tendință în creștere. Dovezile și limitele sunt în [Docs/Evidence/159-soak](Evidence/159-soak/README.md). Soak-ul nu înlocuiește gate-ul de release 224 și nici workload-ul integrat cu asseturile finale din 155/223; gate-ul hardware al jocului complet rămâne `NOT_VALIDATED`.


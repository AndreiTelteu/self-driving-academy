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

Pentru steady-state: warmup propus 30 s, apoi minimum 120 s măsurate, cinci repetări per configurație/seed documentate. Încărcarea cold și prima utilizare au probe distincte; nu dispar din raport prin warmup. Se păstrează rezultatele fiecărei repetări și mediana metricilor, cu variația între probe. Benchmarkul principal se rulează cu build de producție și inspector închis; headless/software GPU nu dovedește FPS pe laptop. Scenele CPU fără renderer sunt probe suplimentare pentru algoritmi, nu substitutul jocului complet.

CI obișnuit verifică determinismul fixture-urilor, limite de operații, capacități, dimensiuni de bundle/asseturi și smoke de benchmark. Pragurile absolute FPS/GPU se închid pe runner/dispozitiv real identificat, cu rezultatul atașat aceleiași revizii; dacă acesta lipsește, gate-ul hardware rămâne nevalidat. Propunere de regresie pe aceeași configurație: creștere >10% și >1 ms a timpului p95, ori creștere >10% și >5 MiB a memoriei urmărite, confirmată în minimum trei din cinci repetări, blochează gate-ul. Aceste praguri relative nu permit depășirea bugetului absolut. Actualizarea baseline-ului are motiv și diff; nu este efectuată automat pentru a accepta o regresie.

Soak-ul raportează tendința după warmup pentru heap/WASM/resurse estimate, listeners, voci audio, corpuri, chunkuri și cozi; retenția ajunge la platou. Propunere: se repetă 20 de cicluri de schimbare a hărții/rendererului și deschidere/închidere de panouri în aceeași probă. Resursele revin la plafonul manifestului după cleanup; rezultatul nu cere ca un browser să elibereze exact aceeași valoare de heap la un moment ales. Thermal throttling, battery saver și tab background sunt scenarii distincte, cu stări consemnate.

## Regula de închidere a unui PBI relevant

Frontmatterul performance_checks declară subsetul necesar: frame, simulation, memory, workers, storage, loading, ui, assets, soak. Înainte de implementare se citește acest modul și se păstrează un baseline pe fixture-ul disponibil; după schimbare se compară aceeași probă, cu build și versiuni identificate. În task-urile anterioare lui 203 se folosesc probele de bootstrap și praguri marcate provizorii; manifestul este fixat în 203, iar 218 condiționează proba de fizică 021. O funcționalitate nouă raportează separat costul suplimentar. Dovezile includ metricile, bugetul, profilul hardware și limitele reale. Scope-ul timpuriu nu cere artificial jocul complet, dar un cost imposibil de măsurat nu este declarat acceptat.

Gate-ul 220 condiționează campania și înlocuirea cu asseturi finale. 221 condiționează worker-ele de learning/experimente; 222 condiționează integrarea autosave; 223 condiționează asseturile finale; 224 condiționează buildul/release-ul. 157/158 rămân optimizările finale bazate pe profil, nu prima ocazie în care măsurăm performanța. Nu se migrează automat fizica live în worker/compute și nu se introduce o reprezentare redusă a civililor fără un experiment și o decizie care păstrează semantica confirmată.

## Workload-uri suplimentare ale reviziei 0.5

224 include 30 taxiuri/40 civile cu impacturi multiple în decor, efecte/audio plafonate, director de provocări și recorder/autosave. 20 de cicluri Academie/Haos/reset verifică revenirea la baseline a corpurilor, listeners, cache-urilor și joburilor. 229/230 măsoară slider draft/aplicare fără rafale de versiuni sau capturi. 234 măsoară encode/canonicalizare/hash/import pe savefile-ul maxim admis, cu progres/anulare în pauză. Costurile de distrugere, checkpoint pentru două sesiuni și istoricul de provocări au plafoane fixate în 203/222/223 după prototip; nu se adaugă obiecte fizice nelimitate. Aceste probe sunt în [modulele 26–29](26-joaca-libera-haos-si-distrugere.md); KPI/XP/daily nu sunt simplificate pentru a obține FPS.

# Documentația Self Driving Academy

Versiune 0.5 · 4 octombrie 2026. Aceste fișiere Markdown sunt planul curent al proiectului. Babylon.js este engine-ul confirmat. Gameplay-ul include condus realist, misiuni și o flotă care învață inclusiv greșelile jucătorului.

## Module

| Document | Conținut |
| --- | --- |
| [Produs și scope](01-produs-si-scope.md) | Produs și scope |
| [Arhitectură și contracte](02-arhitectura-si-contracte.md) | Arhitectură și contracte |
| [Babylon.js și integrarea engine-ului](03-babylon-engine.md) | Babylon.js și integrarea engine-ului |
| [Oraș și rețea rutieră](04-oras-si-retea-rutiera.md) | Oraș și rețea rutieră |
| [Vehicule și fizică](05-vehicule-si-fizica.md) | Vehicule și fizică |
| [Autonomie și trafic](06-autonomie-si-trafic.md) | Autonomie și trafic |
| [Flotă și curse](07-flota-si-curse.md) | Flotă și curse |
| [Interfață cameră și control](08-interfata-camera-si-control.md) | Interfață cameră și control |
| [Telemetrie și oportunități](09-telemetrie-si-oportunitati.md) | Telemetrie și oportunități |
| [Învățarea stilului](10-invatarea-stilului.md) | Învățarea stilului |
| [Catalogul parametrilor](11-catalog-parametri.md) | Catalogul parametrilor |
| [Profiluri și propagare în flotă](12-profiluri-si-propagare.md) | Profiluri și propagare în flotă |
| [Misiuni și progres](13-misiuni-si-progres.md) | Misiuni și progres |
| [Experimente și indicatori](14-experimente-si-indicatori.md) | Experimente și indicatori |
| [Salvare și import export](15-salvare-si-import-export.md) | Salvare și import export |
| [Asseturi vizual și audio](16-asseturi-vizual-si-audio.md) | Asseturi vizual și audio |
| [WebGPU și performanță](17-webgpu-si-performanta.md) | WebGPU și performanță |
| [Validare și release](18-validare-si-release.md) | Validare și release |
| [Roadmap și decizii](19-roadmap-si-decizii.md) | Roadmap și decizii |
| [Extensii și mers pe jos](20-extensii-si-mers-pe-jos.md) | Extensii și mers pe jos |
| [Acoperirea funcționalităților prin PBI](21-acoperire-functionalitati.md) | Acoperirea funcționalităților prin PBI |
| [KPI-uri economie și review-uri](22-kpi-economie-si-review-uri.md) | Revenue lunar, ratings și grafice istorice |
| [Misiuni zilnice și experiență](23-misiuni-zilnice-si-experienta.md) | Trei misiuni pe zi și XP fără pierderi |
| [Milestone timpuriu și contracte](24-milestone-timpuriu-si-contracte.md) | Corecțiile auditului și validarea ideii înaintea extinderii |
| [Contracte de performanță și benchmark](25-performanta-contracte-si-benchmark.md) | Bugete, scheduler, workers, date/asseturi și gates progresive |
| [Joacă liberă Haos și distrugere](26-joaca-libera-haos-si-distrugere.md) | Sesiuni, recuperare, decor destructibil și feedback |
| [Reglaje HUD și cameră](27-reglaje-hud-si-camera.md) | Slidere pentru control/stil, HUD simplu și first-person |
| [Provocări random și revenire](28-provocari-random-si-revenire.md) | Clienți neobișnuiți, catalog, director, reluare și recorduri |
| [Savefile și integritate](29-savefile-si-integritate.md) | Backup complet, checksum în browser și încărcare atomică |

## Implementare și Kanban

[Backlogul PBI](../PBI/README.md) conține 235 task-uri: V1 are 195 (001–162 și 203–235), V2 are 28 (163–190), V3 are 12 (191–202). IDs sunt stabile; ordinea de lucru rezultă din graful dependențelor, inclusiv dependențe spre IDs noi mai mari. Toate sunt inițial în To Do. [Regulile pentru agenți](../PBI/AGENTS.md) cer mutarea efectivă To Do → In Progress → Done și verificarea finală obligatorie.

[Catalogul JSON](driving-parameters.json) conține 80 de parametri propuși. [Matricea de acoperire](21-acoperire-functionalitati.md) leagă fiecare parametru de politică, estimare și gate de validare. V1 țintește 24; V2 extinde la 80; V3 adaugă mersul pe jos.

## Stare și istoric

Bootstrapul aplicației browser TypeScript/Vite/Babylon.js și [backendul WebGPU/WebGL2](rendering-backend.md) sunt implementate; [README-ul proiectului](../README.md) documentează versiunile și comenzile locale. Fundația include contracte validate, identitate/random determinist, setări, registry-ul parametrilor, [event bus](event-bus.md) și [protocol workers](worker-protocol.md). Gameplay-ul și sistemele următoare rămân planificate. Valorile de calibrare și bugetele de performanță ale jocului sunt ținte de verificat. Task-urile nu sunt executate prin simpla creare a planului.

[Planul inițial v0.1](Archive/GAME_DESIGN-v0.1.md) este păstrat pentru istoric. Page-ul creat anterior este tot o referință v0.1; nu este sincronizat automat cu documentele Markdown. Modificările viitoare de plan se fac în aceste module și în PBI-urile aferente.

Fundațiile suplimentare implementate sunt [bucla cu pas fix](fixed-tick.md), [maparea entităților în scenă](scene-adapter.md) și [schema hărții cu validare semantică](map-schema.md). Probe separate verifică timpul simulat, lifecycle-ul vizual și referințele rutiere; acestea nu reprezintă încă o sesiune de gameplay completă.

[Lifecycle-ul aplicației](app-lifecycle.md) conectează bucla cu pas fix la bootstrapul browser: start, pauză, reluare, reload și cleanup. Lumea rutieră și vehiculele simulate rămân în PBI-urile următoare.

[Interpolarea snapshoturilor](render-sync.md) conectează proiecțiile readonly la reprezentările Babylon, inclusiv orientarea și mișcarea roților, cu verificări pe WebGPU și WebGL2.

[Registry-ul de asseturi](asset-registry.md) încarcă GLB2 cu texturi embedded, gestionează cache-ul și resursele comune și raportează limitele și costurile încărcării.

[Iluminarea și calitatea](lighting-quality.md) oferă materiale semantice, lumină de zi, umbre plafonate și rezoluție explicită, verificate vizual pe ambele backenduri.

[Camerele de vehicul](vehicle-camera.md) urmăresc ținta selectată, oferă vedere din spate și din poziția șoferului, reglaje de confort și captură explicită a mouse-ului fără transfer de autoritate.

[Graful de benzi](lane-graph.md) oferă query-uri direcționate și localizare geometrică independentă de mesh, cu restricții de acces și index spațial plafonat.

[Zonele de trecere](crosswalk-zones.md) separă traversarea geometrică de expunerea observabilă la pietoni și obstacole, fără dovezi fictive de cedare.

[Diagnosticele de randare](render-diagnostics.md) afișează costuri și contoare reale într-un panou separat, cu istoric plafonat și inspector disponibil doar în dezvoltare.

[Recuperarea GPU](gpu-recovery.md) păstrează sesiunea autoritară în RAM, reconstruiește resursele vizuale după device loss și permite retry și reluare explicită, fără o buclă de simulare nouă.

[Conflictele intersecțiilor](intersection-conflicts.md) combină restricțiile semantice cu geometria traiectoriilor și oferă query-uri fără dependență de randare sau prioritate dedusă din texturi.

[Pickingul vehiculelor](vehicle-picking.md) păstrează identitatea la meshuri și instanțe, respectă ocluzia și modalurile și emite numai intenția de selecție.

[Regulile STOP](stop-rules.md) disting oprirea completă de traversarea liniei și de rolling stop, pe observații autoritare consecutive.

[Controllerul de semafoare](signals.md) gestionează fazele la tick autoritar și semnalele pe mișcare, cu verificarea conflictelor și publicare deterministă.

[Prioritatea și spațiile de traversare](priority-rules.md) folosesc reguli explicite ale hărții și observații în unități SI, fără a transforma lipsa traficului în dovezi de comportament.

[Plannerul de rutare](route-planner.md) calculează trasee A* pe graful de benzi 033 cu cost explicit și versionat, destinații de tip bandă sau zonă de serviciu, rezultat explicit la lipsa rutei, cache plafonat cu invalidare și integrare cu coada schedulerului 219; nu acordă permisie de trecere și nu este dispecerul de flotă.

## Revizia 0.3

Învățarea are loc numai în LEARNING; MANUAL permite intervenții fără schimbarea stilului. Taxiurile și civilii adoptă stilul comun. V1 include revenue și ratings cu grafice KPIs, trei misiuni zilnice și XP din misiuni/timp activ, fără pierderi XP, conform reviziei 0.5. Valorile economice și pragurile sunt propuneri de calibrare. Verifică boardul și planul cu PBI/Validate-Board.ps1 și PBI/Validate-Plan.ps1.

## Revizia 0.4

Performanța devine o condiție progresivă de implementare: 218–224 adaugă harness, scheduler, gate de flotă înainte de campanie/asseturi, bugete workers/date/randare și gate CI/soak. PBI-urile relevante declară performance_checks. [Manifestul inițial 203](performance-budgets.json) fixează protocolul și baseline-ul desktop real; testul laptopului din 203 a fost omis prin derogarea explicită a utilizatorului din 5 octombrie 2026. Pragurile gameplay/capacitățile rămân provizorii, de calibrat în fixture-urile relevante și gate-urile hardware ulterioare obligatorii.

## Revizia 0.5

Se elimină global pierderea XP și scăderea nivelului. V1 adaugă Academie/Haos, resetul orașului cu stil păstrat, decor destructibil cu sunet/fragmente, HUD simplu, first-person, reglaje prin slidere, provocări random opționale și savefile complet cu checksum. Modulele 26–29 și PBI 225–235 descriu scope-ul; 214 păstrează identitatea, cu scope nou de feedback fără penalizare. Cerințele curente nu folosesc alte jocuri ca referință; arhiva rămâne istoric. Planul nu declară funcții sau playtesturi implementate.

[Prototipul de fizică Rapier](physics-prototype.md) oferă calibrare SI, contacte reale și probele de performanță021, cu limita explicită a controllerului raycast și fără validarea jocului complet.

[Bugetele de randare și asseturi](render-asset-budgets.md) adaugă admitere finită, batchuri locale/LOD cu identități de picking păstrate, ownership/disposal și calitate exclusiv vizuală. Fixture-ul timpuriu este verificat prin cinci perechi complete pe WebGPU/WebGL2 reale; limitele pentru jocul complet și laptop rămân provizorii.

[Adaptorul fizic022](physics-adapter.md) oferă mapare entityId↔bodyhandle, SI pose/velocity, remove și callbacks generation-fenced. Probele desktop timpurii Rapier/Babylon și comparațiile direct/bridge pe ambele backenduri sunt verificate; jocul complet și laptopul rămân nevalidate.

[Clasele mecanice023](vehicle-classes.md) definesc sedan/compact versionate, cu masă, putere, frână și roți aplicate în Rapier și diferențe măsurate pe aceeași suprafață. Mecanica rămâne separată de profil și preferințe; controllerul comun și calibrarea finală continuă în task-urile dedicate.

[Indexul spațial034](spatial-index.md) oferă vecini geometric relevanți, update/remove/reset și fallback fără trunchiere; comparațiile CPU normale/dense și probele de ownership sunt documentate separat de bugetul întregului tick.

[Contextul rutier044](road-context.md) derivă bandă, lider, semnal, conflicte și obstacole din cadre autoritare, cu cache bounded, tick de sursă și invalidare urgentă. Completitudinea observațiilor și limitele acoperirii locale sunt explicite; samplingul AI nu avansează oportunitățile sau telemetria.

[Contactele și incidentele028](collision-events.md) leagă identitățile fizice de contactele Rapier și de evenimente COLLISION, cu episoade persistente, cooldown și retry fără repetarea fizicii. Probele native și playtesturile headed WebGPU/WebGL2 verifică impactul și eliberarea resurselor; măsurătorile CPU rămân separate de gate-ul întregului joc.

[Controllerul comun024](vehicle-controller.md) aplică aceeași comandă pentru PLAYER și AUTONOMY la fiecare tick fizic, cu arbitraj atomic, ținte AUTO bounded, frână de mână și semnalizare autoritară. Testele Rapier și probele vizibile Chrome pe WebGPU/WebGL2 verifică paritatea celor două surse, preluarea și cleanup-ul; calibrarea dinamicii și inputul filtrat continuă în PBI-urile dedicate.

[Schedulerul219](simulation-scheduling.md) distribuie deciziile periodice la 10 Hz, păstrând controllerul și fizica la 60 Hz, inputul urgent și datoria buclei fixe. Cozile și cache-urile au limite și invalidare deterministă. Probele complete Chrome WebGPU/WebGL2 pe fixture-ul fizic timpuriu verifică frame-urile, paritatea semantică și cleanup-ul; politica 045, jocul complet și hardware-ul laptop rămân în afara acestei acceptări.

[Inputul de tastatură025](keyboard-input.md) separă inputul brut de comanda filtrată la 60 Hz, cu revenire, sensibilitate la viteză și preferințe versionate. Calibrarea sedan/compact și probele manuale Chrome WebGPU/WebGL2 verifică reglajele, focusul și inputul fizic; popup-ul 229 și marșarierul 027 rămân task-uri separate.

[Mașina de stări045](behavior-fsm.md) oferă șase stări și reason codes din contextul044 și fapte explicite de politică, cu decizii periodice/urgente prin219 și ownership plafonat. Testele și20lumi native AFTER verifică semantica, costul și cleanup-ul contractului timpuriu; manevrele fizice și performanța hardware a jocului complet continuă în task-urile dedicate.

[Controllerul lateral049](lateral-controller.md) urmărește trasee directionate și TURN-uri authored prin aceeași mecanică024, cu direcție, motive de nefezabilitate și viteză consultativă. Baseline-urile native, AFTER70/110, calibrarea22+4 și driving-ul real WebGPU/WebGL2 validează scope-ul empiric; nu certifică FPS-ul flotei ori laptopul.

[Frânarea și marșarierul027](braking-reverse.md) adaugă transmisie opt-in cu oprire și dwell fizic înaintea inversării, input brut distinct de comanda fizică semnată și frână de mână pe roțile spate. Calibrarea celor două clase și driving-ul Chrome WebGPU/WebGL2 sunt verificate; ABS, transmisia completă și performanța întregului joc rămân în afara acestei probe.

[Autoritatea066](control-authority.md) coordonează un singur vehicul PLAYER prin controllerul024, cu transfer simultan, identități native exacte și input025 adresat explicit. Cele34 de scenarii native păstrează rezultatele fizice inițiale și trec comparația CPU; probele Chrome WebGPU/WebGL2 verifică preluarea și continuitatea pentru sedan și compact. Selecția camerei, segmentele LEARNING și dispecerul flotei au contracte separate.

[Comenzile M/L și HUD-ul067](mode-controls.md) publică modul fizic acceptat, eligibilitatea explicită și ținta butoanelor, cu input remapabil și protecții pentru focus, repeat și pauză. Cele34 de lumi native și probele Chrome WebGPU/WebGL2 verifică tranzițiile, paritatea și cleanup-ul. Evenimentele DOM ale probei sunt sintetice; segmentele de învățare, jocul complet și memoria totală rămân în afara acestei verificări.

[Selecția vehiculelor068](vehicle-switch.md) schimbă ținta camerei la tick acceptat, eliberează vehiculul părăsit în AUTO și închide segmentul cu ruta/cursa păstrată. Cele34 de lumi native și probele Chrome WebGPU/WebGL2 verifică selecția vizibilă/din flotă, paritatea fizică, performanța fixture-ului timpuriu și cleanup-ul. Recorderul069, jocul complet, laptopul și memoria totală rămân în afara acestei acceptări.

## Validare eficientă — 8 octombrie 2026

[Politica de validare](validation-policy.md) diferențiază verificările locale de gate-urile full/soak și permite corectitudinea izolată în paralel. Harness-ul comun are preflight export, profil DEV 3 × 2 × (15 s + 30 s), salvare automată fără suprascriere și checkpoint-uri imutabile de perechi. După preflight, folosește butonul Dezvoltare pentru cost local; proba completă rămâne pentru gate-uri. Pentru reluare, păstrează ID-ul sesiunii și confirmă condițiile comparabile; perechea întreruptă reîncepe integral. DEV/SMOKE nu certifică hardware/release. Aceste instrumente noi necesită propria verificare browser înainte de folosirea lor ca dovadă hardware; nu sunt prezentate ca probe executate.

## Mediu laptop — 11 octombrie 2026

[Integrarea026](wheel-dynamics.md) păstrează recuperarea030 și trece689teste pe Node24.21.0/npm11.19.0. Calibrarea28scenarii, paritatea și5perechi native locale sunt verificate. [Raportul final din12octombrie](Evidence/026-laptop/current-delivery-summary.md): Full WebGPU/WebGL2 în ChromeGuest trec cititorul comun și revizuirea fizică, cu zeroLongTaskssteady. Preflight/export/cleanup trec pe aceeași sursă. Istoricul cu extensii păstrează FAIL52ms; cauza nu este atribuită. Acceptarea se limitează la fixture-ul timpuriu026.

Mediul actual este Lenovo Yoga 7 14ARP8/Ryzen7 7735U, identificat prin CIM. [Baseline-ul istoric026 pe laptop](Evidence/026-laptop/summary.json) păstrează separat hardware-ul și datele reale de desktop: CPU și WebGL2 PASS, WebGPU FAIL pentru un LongTask51ms în BEFORE. Raportul final de mai sus folosește sursele integrate și ChromeGuest, cu bugete laptop nemodificate. Aceste probe nu închid gate-ul jocului integrat și nu schimbă derogarea istorică203.

[Calibrarea 031](physics-calibration.md) măsoară presetul fizic curent pentru sedan/compact și verifică paritatea completă PLAYER/AUTONOMY în matricea de frânare, viraj și contact. Rezultatele sunt măsurători ale jocului; nu reprezintă certificarea dinamicii unui automobil real ori a performanței jocului integrat.

[Politica de viteză 046](cruise-targets.md) folosește cele patru chei M pentru ținte urbane/rezidențiale, curbe și apropiere, cu profile compilate și fapte de context versionate. Verificarea targeted păstrează baseline-ul cronologic, costul local și un singur caz de regresie relativă în cele trei perechi normale; bugetul absolut local trece. Controlul longitudinal 047 și performanța jocului integrat rămân verificări separate.

[Controlul longitudinal 047](longitudinal-control.md) aplică cele patru chei de accelerație, frânare și reacție prin comenzile comune 024. Scenariile native și integrarea WebGPU verifică opririle normale și impacturile finite ale profilului riscant pentru sedan/compact. [Dovezile 047](Evidence/047-longitudinal-control/README.md) păstrează baseline-ul cronologic, toate eșecurile și comparația nativă extinsă finală PASS: cinci perechi pentru 70 și 110 vehicule, 30 s încălzire și 120 s măsurare. Fixture-ul comun BEFORE este retrospectiv și legat de sursele preproducție înghețate. Bugetele și mecanica rămân neschimbate; proba locală nu certifică FPS sau gate-ul jocului integrat.

[Urmărirea liderului 048](following.md) leagă distanța și viteza preferată de cele patru reglaje ale profilului și de contextul 044, apoi transmite ținta către 047/024. [Dovezile 048](Evidence/048-following/README.md) păstrează testele, probele fizice, eșecurile și rezultatele comparației locale; starea finală a acceptării este consemnată în PBI.

[Politica la roșu și verde 050](signal-policy.md) aplică cele patru chei M de conformare, întârziere, linie și frânare la roșu pe semnalul autoritativ 036 al mișcării proprii, cu un singur eșantion probabilistic pe oportunitatea identificată din seed-urile 006 și cu trecerea pe roșu raportată explicit. [Dovezile 050](Evidence/050-signal-policy/README.md) păstrează testele, lanțul real 219/044/045/036 și costul adăugat p95 +0,0191 ms/decizie la 10 Hz; proba de browser și bugetul jocului integrat rămân verificări separate, cu etichete de calibrare provizorii.

[Politica STOP 051](stop-policy.md) citește observațiile autoritative 037 și aplică probabilitatea opririi complete, durata și offsetul, ținând strict separate calea opririi provocate de lider de intenția STOP a șoferului. [Dovezile 051](Evidence/051-stop-policy/README.md) păstrează testele, rularea nativă reală 037 și costul adăugat p95 +0,0141 ms/decizie la 10 Hz; gate-urile integrate rămân nevalidate.

[Schimbările de bandă și depășirea 053](lane-change-policy.md) porționează schimbarea opțională prin gap față/spate, avantaj de viteză și cooldown pe vecinătatea laterală 033, cu un latch de manevră purtat de apelant pentru continuitate. [Dovezile 053](Evidence/053-lane-change/README.md) păstrează testele, lanțurile reale 219/033/046 și costul adăugat p95 +0,0121 ms/decizie (grup 050–053: +0,0180 ms); proba de browser rămâne neexecutată și consemnată ca atare.

[Blocajele și reintrarea 054](blocked-recovery.md) detectează lipsa de progres din viteza longitudinală autoritativă și localizarea reală 033 și hrănește starea BLOCKED a 045 prin `routeBlocked`, cu motiv distinct și tabel de decizie explicit; recuperarea cere fie prin plannerul real 041 (set de benzi blocate și `costVersion` derivat, consumat prin portul 219), fie prin dovada de drum a portului nativ 030, iar reintrarea după MANUAL nu teleportează implicit vehiculul. [Dovezile 054](Evidence/054-blocked-recovery/README.md) păstrează testele, lanțul real 219/044/045/033/041 și costul adăugat p95 +0,0148 ms/decizie la 10 Hz; plasarea nativă 030 și proba de browser rămân probe separate.

[Explicația deciziilor 055](decision-explanation.md) transformă o decizie reală a lanțului de autonomie într-o explicație read-only înghețată la adâncime: motivele în ordine, legate de perechea `state`/`reason` a 045, cantitățile chiar folosite și cheile de profil chiar consumate, fiecare cu valoarea reală, filtrate de registry-ul 092, astfel încât un parametru neimplementat nu poate apărea ca motiv. [Dovezile 055](Evidence/055-decision-explanation/README.md) păstrează testele, lanțul real 219/044/036/050/045 și costul adăugat p95 +0,0139 ms/decizie la 10 Hz, cu checksum identic între brațe; proba de browser și bugetul jocului integrat rămân verificări separate.

[Suita autonomiei de bază 056](autonomy-scenarios.md) rulează determinist și fără browser cruise, accelerate, follow, signals, stop, yield, lane-change și blocked peste controllerele și fixture-urile reale, cu o rută authored prudentă/riscantă și cu un oracle independent derivat din contracte, nu din transcriptul controllerelor; zece stimulente invalide trebuie să eșueze închis. [Dovezile 056](Evidence/056-auto-scenarios/report.json) păstrează raportul mașină-citibil, tabelul de scenarii și limitele (planta cinematică de rută, fără browser/FPS).

[Eșantioanele la tick 085](telemetry-samples.md) înregistrează inputul brut, comanda filtrată, mărimile SI, banda, semnalul și clasa vehiculului în buffere coloană cu capacitate finită (114 B/eșantion, 4096 implicit), cu profilul, modul, epochul și eligibilitatea fixate la deschiderea segmentului; MANUAL și AUTO rămân în metrici și istoric fără a deveni demonstrații, iar hot path-ul nu serializează JSON per tick. [Dovezile 085](Evidence/085-telemetry-samples/README.md) păstrează testele, fixture-ul real 044/036/025/023 și costul adăugat p95 4–8 µs/tick, cu regiunea JSON măsurată separat; proba de browser și bugetul jocului integrat rămân verificări separate.

[Lifecycle-ul segmentelor manuale 069](manual-segments.md) ține ciclul de viață al intervenției MANUAL/LEARNING — admitere finită, intake, store de înregistrări parsate, receipt-uri de închidere cu motivele 005 extinse (`PROFILE_RESTORE`, `PROFILE_IMPORT`, `STATE_IMPORT`) și un bridge de aplicație — fără a transforma MANUAL în demonstrație de învățare. Livrarea a fost **recuperată în `main` pe 2026-10-19** din ramura `loop-pbi/manual-segments-01` (cod, teste, scripturi, document și arborele de dovezi), după ce în `main` ajunseseră doar commit-urile de documentație; [dovezile 069](Evidence/069-manual-segments/README.md) păstrează capturile native cronologice, verificările scoped și diagnosticele, cu exceptarea de memorie consemnată în PBI și fără a pretinde o probă de browser, FPS sau hardware.

[Pauză, focus și modalitatea de input 070](pause-focus.md) ține o singură decizie de suspendare pentru panouri, meniu și pierderea focusului: panourile suspendă lumea în MANUAL/LEARNING și rămân live în observare AUTO fără a revendica locul PLAYER, meniul suspendă în toate modurile, diagnosticul read-only nu suspendă niciodată, iar ordinea cauzelor este focus > meniu > panou. Reluarea — inclusiv cea explicită, refuzată cât timp o suprafață cere suspendarea — resetează comenzile ținute și nu transformă timpul oprit în tick-uri, deci secvența de tick-uri rămâne contiguă; 012 deține ceasul, 008 acumulatorul, 025 tastele ținute și 066 autoritatea. [Dovezile 070](Evidence/070-pause-focus/README.md) păstrează testele, costul adăugat per tranziție, brațul „suspendat" și anvelopa de memorie deținută; proba de browser/frame rămâne neexecutată și consemnată ca datorată la 153/224/235.

[Continuitatea la preluare și revenire 071](takeover-continuity.md) este stratul de continuitate peste 054, nu o a doua copie a lui: măsoară și mărginește starea fizică (poză, viteză, stare unghiulară, direcția drivetrain-ului, daune) și diferența de comandă dintre ultima comandă MANUAL și prima comandă AUTONOMY peste exact un pas autoritar, raportând explicit orice depășire fără a o limita, repara sau teleporta. Decizia de reintrare rămâne a lui 054, iar starea BLOCKED rămâne a lui 045 (prin `routeBlocked`), astfel încât un vehicul fără reintrare devine BLOCKED cu motivul 054 și primește recuperarea explicită 030. [Dovezile 071](Evidence/071-takeover-continuity/README.md) păstrează testele, cele două brațe native secvențiale (checksum de decizie identic între brațe, `statePreserved` 200/200) și costul adăugat p95 de ordinul a 0,02–0,03 ms/decizie la 10 Hz, mult sub bugetul absolut; proba de browser/frame rămâne neexecutată și consemnată ca datorată la 153/224/235.

[Registrul de oportunități 086](opportunity-ids.md) derivă identitatea fiecărei apariții fizice STOP, roșu, verde, yield și schimbare de bandă din contractul 006 plus contextul autoritativ (sesiune, worldEpoch, vehicul, incarnation, bandă/intersecție/semnal/mișcare) și un ordinal de apariție, astfel încât aceeași apariție observată la fiecare tick fix și la cadența de decizie de 10 Hz produce exact o oportunitate și un ID, cu condiția ca fluxurile producătorilor 036/037/053 să fie drenate, nu eșantionate. Ciclul documentat ENTERED/RESOLVED/TRUNCATED ține subsetul incomplet (SUPERSEDED, SEGMENT_CLOSED, OBSERVATION_LOST, SUSPENDED, DISPOSED) separat de numitorul cert, cu un singur rezultat per oportunitate și fără refolosirea unui ID după o reapropiere; eligibilitatea de învățare este fixată la deschiderea segmentului, ca la 085, iar magazia este mărginită (4096 implicit, plafon derivat ≈16,75 MiB, sub `recorderRamBytes`). [Dovezile 086](Evidence/086-opportunity-ids/README.md) păstrează testele, fixture-ul real 044/036/037/025, auto-verificarea 60 Hz vs 10 Hz (18 = 18 oportunități cu ID-uri identice) și costul adăugat p95 ~16 µs/tick; proba de browser/frame rămâne separată.

[Ferestrele eligibile 087](eligibility-windows.md) atașează fiecărei oportunități 086 o etichetă dintr-un vocabular închis — trafic liber, lider, verde blocat, limită mecanică, impact, plus excluderile `PAUSE`/`FOCUS_LOST`/`MANUAL_SEGMENT`/`AUTO_SEGMENT`/`NOT_OBSERVABLE` — și separă structural `ELIGIBLE` de `EXTERNAL_CONSTRAINT` și `EXCLUDED`: verdele blocat, limita mecanică și impactul nu pot deveni preferință personală (`preferenceEvidenceEmitted` rămâne 0), iar o fereastră de reacție se deschide numai când stimulul e observabil din camera jucătorului sau dintr-un fixture controlat. [Dovezile 087](Evidence/087-eligibility-windows/README.md) păstrează testele, fixture-ul real 036/037/044/048/086, auto-verificarea etichetelor și numitorilor, costul adăugat și bugetul de memorie mărginit.

[Filtrul de artefacte 088](telemetry-filters.md) separă coliziunile 028, plasările de recuperare 030, pauzele 070 și eșantioanele incomplete 069/085 într-un vocabular închis de tipuri, cauze și surse autoritare, și taie fereastra exact la primul artefact: datele dinaintea impactului rămân utilizabile cu propriul numitor de prefix, iar impulsul și tot ce urmează nu pot deveni dovezi de preferință, pentru că `emitPreImpactEvidence` acceptă structural doar o fereastră cu prefix utilizabil. Fiecare fereastră expune gradul `COMPLETE`/`PARTIAL`/`TRUNCATED` cu motiv explicit, o plasare 030 își păstrează cauza și dovada, iar un checkpoint pierdut lasă un segment `TRUNCATED` detectabil, niciodată `COMPLETE`. [Dovezile 088](Evidence/088-telemetry-filters/README.md) păstrează testele, fixture-ul real 028/030/036/044/086/087, auto-verificarea tăierii și a completitudinii, costul adăugat și bugetul de memorie mărginit.

[Normalizarea după clasa vehiculului 089](vehicle-normalization.md) împarte fiecare cerere realizată de accelerație, frânare și virare la plafonul **propriei** clase din 023/085, astfel încât aceeași comandă și același stil dau aceeași cerere normalizată într-un sedan și într-un compact, deși valorile brute păstrează diferența mecanică, iar o clasă cu plafon mai mic nu este citită ca prudentă. Caracteristicile (p90 pe canal, scalarul `aggressiveness`, valorile brute SI și intenția independentă de clasă) se atașează exclusiv prefixului utilizabil 088 și poartă gradul `COMPLETE`/`PARTIAL`; o fereastră neeligibilă 087, complet suprimată ori trunchiată este refuzată cu motiv închis și fără caracteristici, iar o cerere care a saturat susținut un plafon este marcată explicit `CAPABILITY_LIMITED` cu canalul limitativ și raportată ca limită inferioară, niciodată ca alegere (`emitIntentFeature` acceptă doar o fereastră intenționată). [Dovezile 089](Evidence/089-vehicle-normalization/README.md) păstrează testele, verificarea măsurată în Rapier, lanțul real 023/047/049/086/087/088 la cadența 219, costul adăugat la ambele cadențe și bugetul de memorie mărginit sub `recorderRamBytes`.

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

## Revizia 0.3

Învățarea are loc numai în LEARNING; MANUAL permite intervenții fără schimbarea stilului. Taxiurile și civilii adoptă stilul comun. V1 include revenue și ratings cu grafice KPIs, trei misiuni zilnice și XP din misiuni/timp activ, fără pierderi XP, conform reviziei 0.5. Valorile economice și pragurile sunt propuneri de calibrare. Verifică boardul și planul cu PBI/Validate-Board.ps1 și PBI/Validate-Plan.ps1.

## Revizia 0.4

Performanța devine o condiție progresivă de implementare: 218–224 adaugă harness, scheduler, gate de flotă înainte de campanie/asseturi, bugete workers/date/randare și gate CI/soak. PBI-urile relevante declară performance_checks. [Manifestul inițial 203](performance-budgets.json) fixează protocolul și baseline-ul desktop real; testul laptopului din 203 a fost omis prin derogarea explicită a utilizatorului din 5 octombrie 2026. Pragurile gameplay/capacitățile rămân provizorii, de calibrat în fixture-urile relevante și gate-urile hardware ulterioare obligatorii.

## Revizia 0.5

Se elimină global pierderea XP și scăderea nivelului. V1 adaugă Academie/Haos, resetul orașului cu stil păstrat, decor destructibil cu sunet/fragmente, HUD simplu, first-person, reglaje prin slidere, provocări random opționale și savefile complet cu checksum. Modulele 26–29 și PBI 225–235 descriu scope-ul; 214 păstrează identitatea, cu scope nou de feedback fără penalizare. Cerințele curente nu folosesc alte jocuri ca referință; arhiva rămâne istoric. Planul nu declară funcții sau playtesturi implementate.

[Prototipul de fizică Rapier](physics-prototype.md) oferă calibrare SI, contacte reale și probele de performanță021, cu limita explicită a controllerului raycast și fără validarea jocului complet.

[Bugetele de randare și asseturi](render-asset-budgets.md) adaugă admitere finită, batchuri locale/LOD cu identități de picking păstrate, ownership/disposal și calitate exclusiv vizuală. Fixture-ul timpuriu este verificat prin cinci perechi complete pe WebGPU/WebGL2 reale; limitele pentru jocul complet și laptop rămân provizorii.

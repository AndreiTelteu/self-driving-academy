# Starea implementării și lacunele

Versiune 0.1 · 26 noiembrie 2026. Acest document este sursa curentă pentru întrebarea „ce se poate juca și ce lipsește”. Înlocuiește afirmațiile de stare din documentele mai vechi; acelea rămân istoric.

## Definiții

| Stare | Înseamnă |
| --- | --- |
| **Jucabil** | Comportamentul este montat în buildul din `index.html` și poate fi observat în browser. |
| **Contract** | Modulul, testele și dovezile există, dar nu este compus în jocul live. |
| **Lipsește** | Nu există nici contract, nici implementare. |

Un PBI Done în generația 001–258 înseamnă, în cele mai multe cazuri, **Contract**, nu **Jucabil**. Boardul vechi a fost resetat pentru a nu mai amesteca cele două. Boardul curent începe la 259; ID-urile 001–258 sunt istorice și nu se reutilizează.

## Ce se joacă azi

Buildul curent pornește din `src/main.ts` și oferă:

- mers, alergare, intrare/ieșire din mașină cu `G`;
- `W/S/A/D`, frână de mână și marșarier;
- `M` între AUTO și MANUAL;
- AUTO care urmează o rută 041 la ~80% din limita benzii;
- 24 de mașini AI civile cu cruise/following;
- `T` pentru ora din zi și vizualul V4;
- ecran de start, pauză, vitezometru și indicator de mod;
- meniul Academie / Joacă liberă / Haos și „Oraș proaspăt, păstrează stilul” din panoul shell-ului, cu identitate, checkpoint și pauză/AUTO separate;
- un singur composition root (260) care deține tick-ul, pauza/focusul și ordinea porturilor, plus un panou de integrare care arată explicit sistemele 262–286 încă neintegrate.

Nu sunt montate: LEARNING, curse, pasageri, flota selectabilă, KPI, misiuni, XP, salvare, companie, panourile de sistem (flotă, KPI, misiuni, profil, setări), first-person, minimapa, sunet, decorul destructibil și provocările Haos, fizica Rapier și regulile de trafic.

## Matricea lacunelor

| PBI | Titlu | Etapă | Dependențe |
| --- | --- | --- | --- |
| 259 | Gardă de sincronizare pentru documentația de stare și board | V1 | — |
| 260 | Shell-ul jocului și composition root pentru Academia jucabilă | V1 | — |
| 261 | Sesiuni Academie și Haos, schimbare, reset și recuperare | V1 | 260 |
| 262 | Flota live: 20–30 taxiuri și 20–40 civili, nu doar date în registry | V1 | 260 |
| 263 | Selectarea oricărui taxi sau civil, camera și un singur scaun PLAYER | V1 | 262 |
| 264 | Cereri de curse live, coadă și dispecerizare către flota reală | V1 | 262 |
| 265 | Ciclul complet al cursei: pickup, dropoff, pasager, ETA și HUD | V1 | 264 |
| 266 | Economia live: revenue, review-uri, KPI și ceasul economic | V1 | 265 |
| 267 | Panoul KPI, tabloul orașului și feedbackul consecințelor în joc | V1 | 266 |
| 268 | Modelul financiar al companiei: costuri, profit, cash și P&L | V1 | 266 |
| 269 | Evoluția companiei: nivel, achiziții de vehicule și upgrade-uri | V1 | 268 |
| 270 | Panoul companiei: profit, costuri, cash, flotă și investiții | V1 | 268, 269 |
| 271 | Cele trei moduri live: AUTO, MANUAL, LEARNING și toate tranzițiile | V1 | 260, 263 |
| 272 | Telemetrie, oportunități și eligibilitate din condusul live | V1 | 271 |
| 273 | Pipeline-ul de learning live: dovezi, worker, profil și activare | V1 | 272 |
| 274 | Interfața de learning și profil: notificări, explicații, istoric și restore | V1 | 273 |
| 275 | Campania, tutorialul și panoul de misiuni în jocul live | V1 | 260, 265, 271 |
| 276 | Trei misiuni zilnice, XP, nivel și progresul jucătorului în joc | V1 | 260, 265, 271 |
| 277 | Provocările random, directorul, panoul și reluarea în joc | V1 | 260, 265, 271 |
| 278 | Persistență live: autosave, checkpoint, savefile și recuperare | V1 | 260, 266, 276 |
| 279 | Setări, remapare taste și slidere de control/stil în joc | V1 | 260 |
| 280 | Camera first-person din poziția șoferului | V1 | 260, 263 |
| 281 | Minimapa, harta de flotă și HUD-ul complet de joc | V1 | 260, 263 |
| 282 | Fizica Rapier live pentru jucător și AI | V1 | 260, 262 |
| 283 | Regulile de trafic live: semafoare, STOP, prioritate, yield și benzi | V1 | 260, 262, 282 |
| 284 | Traficul civil complet autonom și preluarea oricărei mașini | V1 | 262, 283 |
| 285 | Decor destructibil, feedback audio și replay în joc | V1 | 282, 283 |
| 286 | Pietoni, treceri și pericole V2 în lumea live | V2 | 282, 283 |
| 287 | Gate V4, QA final, playtest și release verificat | V4 | 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286 |

## Detalii pe task

### 259 — Gardă de sincronizare pentru documentația de stare și board

**Ce lipsește:** Documentația de stare, counturile și linkurile nu au nicio verificare automată; după resetarea boardului pot diverge din nou.

- README-ul rădăcină și Docs/README conțin încă numere și afirmații din generația 001–258.
- Nu există un check care să compare numărul de taskuri, etapele, titlurile și dependențele din PBI/README cu fișierele reale.
- Docs/21 și noul Docs/31 pot rămâne în urmă fără ca cineva să observe.
- Manualul și documentele de release pot descrie funcții care nu sunt montate în joc.
- Linkurile locale din Docs și PBI nu sunt verificate într-o singură comandă de proiect.
- Nu există o regulă clară pentru ID-urile retrase 001–258 și pentru ID-urile noi 259+.

**Documentație:** [Starea implementării și lacunele](31-stare-implementare-si-lacune.md) · [Validare și release](18-validare-si-release.md) · [Contracte de performanță](25-performanta-contracte-si-benchmark.md) · [Politica de validare](validation-policy.md)

**PBI:** [259](../PBI/README.md) · **Dependențe:** niciuna.

**Stare:** Done la 26 noiembrie 2026. `npm run docs:check` și testele aferente sunt active; textul de mai sus rămâne descrierea lacunii care a justificat taskul.

### 260 — Shell-ul jocului și composition root pentru Academia jucabilă

**Ce lipsește:** Sistemele reale 261–286 nu sunt încă montate în shell; porturile lor sunt declarate și raportate ca absente.

**Ce s-a livrat:** un singur composition root montează compunerea V3 existentă pe tickul autoritar și expune explicit porturile sistemelor 261–286.

- `src/app/game-shell.ts` deține tick-ul, ordinea declarată a fazelor, pauza/focusul prin owner-ul 070 și regula „o singură lume activă”; un port absent este raportat `ABSENT`, nu simulat.
- `src/main.ts` atașează compunerea V3 ca lume autoritară, rulează un singur `step` prin shell și leagă start/pauză/reluare/focusul de același owner.
- `src/ui/game-shell-host.ts` montează Start/Pauză/Reia și un panou modal de integrare, cu focus, Escape și zero listeneri globali.
- Porturile flotei, curselor, economiei, learning-ului, misiunilor, persistenței, setărilor, camerei, HUD-ului, traficului, distrugerii și pietonilor sunt declarate și raportate ca absente până la taskurile lor.
- Proba `npm run shell:probe` rulează start → conducere → panou → reluare → reload pe WebGL2 și WebGPU, cu tickul înghețat cât timp panoul suspendă simularea și cu o singură lume/gazdă după reload.

**Ce rămâne:** sistemele reale din 261–286 nu sunt implementate aici. Flota, cursele, economia, learning-ul, misiunile, persistența, setările, camera first-person, minimapa, fizica Rapier, regulile de trafic, distrugerea și pietonii rămân dependențe ale taskurilor lor.

**Documentație:** [Shell-ul jocului și composition root](game-shell.md) · [Arhitectură și contracte](02-arhitectura-si-contracte.md) · [Interfață, cameră și control](08-interfata-camera-si-control.md) · [Salvare și import/export](15-salvare-si-import-export.md) · [Contracte de performanță](25-performanta-contracte-si-benchmark.md)

**PBI:** [260](../PBI/README.md) · **Dependențe:** niciuna.

**Stare:** Done la 26 noiembrie 2026. Shell-ul este montat; sistemele 261–286 rămân taskurile dependente.

### 261 — Sesiuni Academie și Haos, schimbare, reset și recuperare

**Ce lipsește:** Sesiunea este hardcodată `v3-composition-236`; nu există alegere Academie/Haos, checkpoint propriu, schimbare sau reset cu stil păstrat.

**Ce s-a livrat:** `src/app/session-flow.ts` compune hostul 225 peste shell-ul 260; meniul oferă Academie și Haos, fiecare cu `sessionId`, `worldEpoch`, `learningEpoch`, profil și checkpoint propriu. `setSessionContext` adoptă identitatea în tick-ul următor, iar portul `sessions` refuză un context vechi. Schimbarea suspendă shell-ul, închide segmentul, comite un checkpoint, anulează joburile lumii vechi și pornește în `PAUSED_AUTO`; un commit refuzat păstrează lumea și epocile. „Oraș proaspăt, păstrează stilul” comite `SCENARIO_RESET` în același store înainte de a avansa epocile, păstrând profilul, XP, daily-ul, recompensele și KPI-ul. Rezultatele târzii primesc motivele închise 225. Checkpointul live este în memorie; adaptorul durabil și reluarea fizică a snapshotului rămân la 278. Proba `npm run session:probe` a trecut pe WEBGL2 și WEBGPU.

- Nu există meniu de alegere a sesiunii; `sessionId`, `playerId` și `profileId` sunt fixe în compunere.
- Nu există checkpoint propriu pentru Academie și Haos, nici izolarea daily/XP/KPI.
- Nu există „Oraș proaspăt, păstrează stilul” sau reset cu `worldEpoch`/`learningEpoch` nou.
- Nu există recuperare după salvare eșuată și nici reluare în pauză/AUTO.
- Nu există anularea joburilor lumii părăsite sau verificarea identității rezultatelor târzii.
- Nu există o probă de browser pentru două sesiuni și două checkpointuri.

**Documentație:** [Joacă liberă, Haos și distrugere](26-joaca-libera-haos-si-distrugere.md) · [Salvare și import/export](15-salvare-si-import-export.md) · [Savefile și integritate](29-savefile-si-integritate.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [261](../PBI/README.md) · **Dependențe:** 260.

### 262 — Flota live: 20–30 taxiuri și 20–40 civili, nu doar date în registry

**Ce lipsește:** Registry-ul creează 20 de taxiuri doar ca date; în lume există un taxi și 24 de civili AI. Nu există flotă de taxiuri simulată.

- `createAmbientTraffic` creează 20 de taxiuri în registry, dar compunerea conduce doar civilii; taxiul jucătorului este singurul actor taxi.
- Nu există taxiuri AI cu rute, curse sau pickup în lumea live.
- Nu există o separare clară între vehiculele ascunse, selectate, MANUAL, LEARNING și AUTO în compunerea browser.
- Nu există aplicarea profilului comun tuturor taxiurilor și civililor la un tick comun.
- Nu există o limită și un cost măsurat pentru 70 de vehicule în compunerea reală.
- Nu există verificarea faptului că un vehicul nou creat citește versiunea activă a profilului.

**Documentație:** [Flotă și curse](07-flota-si-curse.md) · [Registry-ul flotei](fleet-registry.md) · [Traficul civil](civil-traffic.md) · [Stilul orașului](city-style.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [262](../PBI/README.md) · **Dependențe:** 260.

### 263 — Selectarea oricărui taxi sau civil, camera și un singur scaun PLAYER

**Ce lipsește:** Nu există listă/hartă de flotă; mașinile AI refuză intrarea, iar în lume doar taxiul parcat și civilul static sunt preluabile.

- Nu există panoul flotei, lista de taxiuri, filtrele sau sortarea în jocul live.
- Nu există selecție pe minimapă/hartă și nici intenția `WORLD` către autoritate.
- Mașinile AI refuză intrarea cu `AI_TRAFFIC`; „orice mașină” din Docs/01 nu este îndeplinit.
- Nu există păstrarea rutei/cursei vehiculului părăsit și nici revenirea lui în AUTO.
- Nu există verificarea unui singur scaun `PLAYER` la tranziții rapide.
- Nu există comportament de focus, pauză și Escape pentru panoul de flotă.

**Documentație:** [Interfață, cameră și control](08-interfata-camera-si-control.md) · [Panoul flotei](fleet-panel.md) · [Selectarea prin hartă](map-selection.md) · [Schimbarea vehiculului](vehicle-switch.md) · [Pickingul vehiculelor](vehicle-picking.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [263](../PBI/README.md) · **Dependențe:** 262.

### 264 — Cereri de curse live, coadă și dispecerizare către flota reală

**Ce lipsește:** Nu există cereri de curse, coadă sau dispecer în joc; taxiurile nu primesc și nu execută curse.

- Modulele 059/060 există, dar nu sunt create în compunerea live.
- Nu există zone de pickup/dropoff active în lumea jucabilă.
- Nu există coadă, cursor de program, politică `REJECT_NEWEST` sau replanificare la asignare.
- Nu există excluderea taxiurilor blocate, avariate sau offline din alegere.
- Nu există legătura dintre starea de sănătate a flotei și cursa activă.
- Nu există o probă de browser cu cereri care apar în timpul condusului.

**Documentație:** [Flotă și curse](07-flota-si-curse.md) · [Cereri de curse](ride-demand.md) · [Dispecerizare](dispatcher.md) · [Sănătatea flotei](fleet-health.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [264](../PBI/README.md) · **Dependențe:** 262.

### 265 — Ciclul complet al cursei: pickup, dropoff, pasager, ETA și HUD

**Ce lipsește:** Nu există ciclu de cursă în joc: pickup/dropoff fizic, pasager, ETA, progres și HUD de cursă lipsesc.

- Modulele 061–064 și pasagerul 147 există, dar nu sunt compuse în browser.
- Nu există marcaje de pickup/dropoff, pasager, boarding sau dropoff în lume.
- Nu există HUD de cursă cu pickup, destinație, ETA, progres și stare.
- Nu există păstrarea cursei la schimbarea modului sau a vehiculului.
- Nu există rezultate `FAILED`/`CANCELLED` cu motive și eliberare de revendicare.
- Nu există o probă de browser pentru o cursă completă condusă manual și autonom.

**Documentație:** [Flotă și curse](07-flota-si-curse.md) · [Lifecycle-ul cursei](ride-fsm.md) · [Pickup](pickup.md) · [Dropoff](dropoff.md) · [ETA și progres](eta.md) · [Pasageri simplificați](passenger-visual.md) · [HUD](hud.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [265](../PBI/README.md) · **Dependențe:** 264.

### 266 — Economia live: revenue, review-uri, KPI și ceasul economic

**Ce lipsește:** Ledgerul 209, review-urile și bucketurile KPI există ca module, dar în joc nu se produce revenue, rating sau istoric.

- `createFleetEconomy` nu este instanțiat în compunerea live.
- Nu există ceas economic, zi/lună simulată sau expunere care să hrănească KPI-urile.
- Nu există review-uri reale din cursele jucătorului sau din taxiurile AI.
- Nu există legătura dintre incidente/confomfort și rating.
- Nu există idempotență vizibilă între reload, reluare și dubla livrare.
- Nu există o probă de browser cu revenue și rating după o cursă.

**Documentație:** [KPI-uri, economie și review-uri](22-kpi-economie-si-review-uri.md) · [Flotă și curse](07-flota-si-curse.md) · [Indicatorii de serviciu](metric-service.md) · [Indicatorii de comportament](behavior-metrics.md) · [Indicatorii de confort](comfort-metrics.md) · [Savefile și integritate](29-savefile-si-integritate.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [266](../PBI/README.md) · **Dependențe:** 265.

### 267 — Panoul KPI, tabloul orașului și feedbackul consecințelor în joc

**Ce lipsește:** Pop-up-ul KPI, tabloul orașului și feedbackul 214 sunt implementate ca panouri, dar nu sunt montate; nu există buton sau hotkey în joc.

- `createKpiHistory`, `createCityDashboard` și `createKpiImpactHud` nu sunt apelate din shell.
- Nu există buton „KPIs” sau hotkey `K` în jocul live.
- Nu există grafice lunare, tabel zilnic și distribuție 0–5 montate.
- Nu există tabloul orașului cu incidente, blocaje și confort.
- Nu există feedback scurt după o scădere de KPI, fără mesaj de pierdere XP.
- Nu există verificarea focusului, Escape, Tab și a costului când panoul este închis.

**Documentație:** [KPI-uri, economie și review-uri](22-kpi-economie-si-review-uri.md) · [Tabloul orașului](city-dashboard.md) · [Accesibilitatea interfeței](ui-accessibility.md) · [Layout responsive](responsive-layout.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [267](../PBI/README.md) · **Dependențe:** 266.

### 268 — Modelul financiar al companiei: costuri, profit, cash și P&L

**Ce lipsește:** Documentația definește doar revenue, explicit nu profit; nu există costuri de operare, cash, profit sau P&L de companie.

- Docs/22 și manualul exclud explicit costurile de operare și profitul.
- Nu există entitate `Company`, ledger de costuri, cash sau valoare de flotă.
- Nu există costuri pe cursă (energie, mentenanță, incident, serviciu) sau costuri fixe lunare.
- Nu există legătura dintre daune, kilometraj și cost.
- Nu există raport lunar revenue/costuri/profit și nici idempotență pe cursă.
- Nu există separarea formală față de XP și față de ledgerul 209.

**Documentație:** [Companie: profit și evoluție](32-companie-profit-si-evolutie.md) · [KPI-uri, economie și review-uri](22-kpi-economie-si-review-uri.md) · [Flotă și curse](07-flota-si-curse.md) · [Savefile și integritate](29-savefile-si-integritate.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [268](../PBI/README.md) · **Dependențe:** 266.

### 269 — Evoluția companiei: nivel, achiziții de vehicule și upgrade-uri

**Ce lipsește:** Nu există evoluție de companie: nici nivel, nici cash de investit, nici achiziții sau upgrade-uri. XP-ul jucătorului nu este evoluția companiei.

- Nu există praguri de nivel de companie sau valoare de companie.
- Nu există achiziție de vehicule noi în flotă și nici capacitate de flotă.
- Nu există upgrade-uri cu efecte măsurabile și versionate.
- Nu există refuz pentru fonduri insuficiente sau upgrade deja deținut.
- Nu există persistență pentru nivel, achiziții și upgrade-uri.
- Nu există o regulă care să împiedice un upgrade să modifice ascuns stilul învățat.

**Documentație:** [Companie: profit și evoluție](32-companie-profit-si-evolutie.md) · [Misiuni și progres](13-misiuni-si-progres.md) · [Misiuni zilnice și XP](23-misiuni-zilnice-si-experienta.md) · [Flotă și curse](07-flota-si-curse.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [269](../PBI/README.md) · **Dependențe:** 268.

### 270 — Panoul companiei: profit, costuri, cash, flotă și investiții

**Ce lipsește:** Nu există nicio interfață pentru companie: profit, costuri, cash, valoare de flotă și investiții nu pot fi inspectate.

- Nu există buton sau dialog „Companie”.
- Nu există grafic revenue/costuri/profit pe lună și tabel pe perioade.
- Nu există detaliere pe categorie de cost și pe cursă.
- Nu există listă de achiziții/upgrade-uri cu cost, efect și stare.
- Nu există mesaje pentru fonduri insuficiente, nivel insuficient sau upgrade deținut.
- Nu există reguli de focus, Escape, Tab și cost când panoul este închis.

**Documentație:** [Companie: profit și evoluție](32-companie-profit-si-evolutie.md) · [KPI-uri, economie și review-uri](22-kpi-economie-si-review-uri.md) · [Accesibilitatea interfeței](ui-accessibility.md) · [Layout responsive](responsive-layout.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [270](../PBI/README.md) · **Dependențe:** 268, 269.

### 271 — Cele trei moduri live: AUTO, MANUAL, LEARNING și toate tranzițiile

**Ce lipsește:** Există doar `M` între AUTO și MANUAL. `L`, LEARNING, segmentele 069 și continuitatea la tranziție nu sunt montate.

- `applyVehicleMode` acceptă numai `AUTO` și `MANUAL`; nu există `L` sau `LEARNING`.
- Segmentele live sunt 198 de walking/takeover, nu 069 de intervenție la volan.
- Intrarea în mașină forțează `MANUAL`; nu există eligibilitate sau segment LEARNING.
- Nu există păstrarea rutei/cursei la tranziție și nici reluarea stării fizice la AUTO.
- Nu există raport de continuitate, autoritate unică sau verificare de tick pentru cele șase tranziții.
- Nu există HUD cu textele și simbolurile AUTO/MANUAL/LEARNING.

**Documentație:** [Interfață, cameră și control](08-interfata-camera-si-control.md) · [Învățarea stilului](10-invatarea-stilului.md) · [Comenzile de mod](mode-controls.md) · [Integrarea celor trei moduri](three-modes.md) · [Cursa completă și intervenția](manual-trip.md) · [Continuitatea la preluare](takeover-continuity.md) · [Autoritatea de control](control-authority.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [271](../PBI/README.md) · **Dependențe:** 260, 263.

### 272 — Telemetrie, oportunități și eligibilitate din condusul live

**Ce lipsește:** Nu se înregistrează inputul, comenzile, contextul și oportunitățile jucătorului; pipeline-ul de learning nu are date live.

- Nu există writer de telemetrie conectat la condusul jucătorului.
- Nu există oportunități STOP/semnal/urmărire/bandă din contextul real al lumii live.
- Nu există ferestre de eligibilitate și nici excluderea pauzelor, focusului și teleportărilor.
- Nu există deduplicare pe `opportunity.id + occurrence`.
- Nu există includerea taxiurilor și civililor din afara camerei.
- Nu există un cost măsurat pentru înregistrare și nici un buffer mărginit.

**Documentație:** [Telemetrie și oportunități](09-telemetrie-si-oportunitati.md) · [Învățarea stilului](10-invatarea-stilului.md) · [Eșantioanele la tick](telemetry-samples.md) · [Dovezile de learning](learning-evidence.md) · [Indicatorii de comportament](behavior-metrics.md) · [Regresiile de intervenție](learning-edgecases.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [272](../PBI/README.md) · **Dependențe:** 271.

### 273 — Pipeline-ul de learning live: dovezi, worker, profil și activare

**Ce lipsește:** Estimatoarele, worker-ul, profilul 109 și activarea 110 există ca module, dar nu sunt conectate la segmentele live; orașul folosește un profil default.

- Nu există coadă de joburi, worker sau governor conectat la compunerea live.
- Nu există store de profil, versiune de bază sau istoric de versiuni în joc.
- Nu există activarea profilului la tick comun pentru taxiuri și civili.
- Nu există bariera `learningEpoch` la restore/import/profil nou.
- Nu există refuz pentru MANUAL, segment incomplet, job învechit sau dovezi insuficiente.
- Nu există o probă de browser în care stilul orașului se schimbă după o demonstrație.

**Documentație:** [Învățarea stilului](10-invatarea-stilului.md) · [Profiluri și propagare](12-profiluri-si-propagare.md) · [Worker-ul de learning](learning-worker.md) · [Pipeline-ul de profil](profile-pipeline.md) · [Activarea profilului](profile-activation.md) · [Bariera de generație](learning-epoch.md) · [Bucla timpurie de learning](early-learning-loop.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [273](../PBI/README.md) · **Dependențe:** 272.

### 274 — Interfața de learning și profil: notificări, explicații, istoric și restore

**Ce lipsește:** Panourile de notificări, explicații, profil și istoric există, dar nu sunt montate; jucătorul nu vede ce a învățat orașul.

- Nu există notificări live pentru analiză, candidat, publicare, lipsă dovezi sau eroare.
- Nu există panoul profilului cu cele 80 de chei, `null` vs zero și chei R rezervate.
- Nu există istoric de versiuni, comparație părinte→copil și restore cu confirmare.
- Nu există import/export de profil în UI și nici verificarea unei versiuni incompatibile.
- Nu există explicația „ce s-a schimbat și de ce” din dovezile reale.
- Nu există reguli de focus, 10 Hz, fără listeners globali și fără citiri când panoul este închis.

**Documentație:** [Interfață, cameră și control](08-interfata-camera-si-control.md) · [Învățarea stilului](10-invatarea-stilului.md) · [Notificările de analiză](learning-notifications.md) · [Explicația modificărilor](learning-explanation.md) · [Panoul profilului](profile-panel.md) · [Istoricul profilului](profile-history.md) · [Restaurarea și importul](profile-restore.md) · [Legarea UI la profiluri](profile-ui-binding.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [274](../PBI/README.md) · **Dependențe:** 273.

### 275 — Campania, tutorialul și panoul de misiuni în jocul live

**Ce lipsește:** Catalogul de campanie, tutorialul și panoul de misiuni există, dar nu sunt montate; nu există obiective live sau reluare.

- Nu există tracker de campanie în compunerea live.
- Nu există tutorialul de cinci pași și nici separarea lui de învățare.
- Nu există panou de misiuni montat și nici buton în shell.
- Nu există ferestre de evaluare, buget de incidente sau motive de eșec live.
- Nu există recompense idempotente și nici reluare fără dublare.
- Nu există o probă de browser pentru etapa 1 și etapa 2.

**Documentație:** [Misiuni și progres](13-misiuni-si-progres.md) · [Interfață, cameră și control](08-interfata-camera-si-control.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [275](../PBI/README.md) · **Dependențe:** 260, 265, 271.

### 276 — Trei misiuni zilnice, XP, nivel și progresul jucătorului în joc

**Ce lipsește:** Daily-ul, XP, nivelul și panoul de progres există ca module, dar nu sunt montate; jocul nu acordă XP și nu are misiuni zilnice.

- Nu există generator daily, calendar sau panou montat în shell.
- Nu există ledger XP, credit de misiune, credit daily sau timp activ.
- Nu există nivel, istoric XP sau afișare a soldului.
- Nu există excluderea pauzei, focusului, background-ului, AFK și Haos.
- Nu există reconciliere după reload, schimbare de zi sau ceas inversat.
- Nu există feedback fără mesaje de pierdere XP.

**Documentație:** [Misiuni zilnice și XP](23-misiuni-zilnice-si-experienta.md) · [Misiuni și progres](13-misiuni-si-progres.md) · [KPI-uri, economie și review-uri](22-kpi-economie-si-review-uri.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [276](../PBI/README.md) · **Dependențe:** 260, 265, 271.

### 277 — Provocările random, directorul, panoul și reluarea în joc

**Ce lipsește:** Catalogul, directorul și panoul de provocări există, dar nu sunt montate; jocul nu oferă provocări random sau reluare.

- Nu există oferte live, cooldown sau o singură instanță activă.
- Nu există rezervarea taxiului și nici refuzul când există pasager.
- Nu există evaluatori live pentru checkpoint, zonă, confort, parcare, drift, distrugere sau learning.
- Nu există panou de provocări, accept/refuz, „Mai încearcă” sau „Continuă condusul”.
- Nu există recompense idempotente și nici separarea Haos/Academie.
- Nu există o probă de browser cu o provocare completă și una refuzată.

**Documentație:** [Provocări random și revenire](28-provocari-random-si-revenire.md) · [Flotă și curse](07-flota-si-curse.md) · [Joacă liberă, Haos și distrugere](26-joaca-libera-haos-si-distrugere.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [277](../PBI/README.md) · **Dependențe:** 260, 265, 271.

### 278 — Persistență live: autosave, checkpoint, savefile și recuperare

**Ce lipsește:** Modulele de persistență există, dar jocul nu salvează nimic: nu există autosave, load, export/import sau recuperare după reload.

- Nu există autosave sau checkpoint periodic în shell.
- Nu există meniu „Salvează jocul în fișier” / „Încarcă jocul din fișier”.
- Nu există reluare după reload în pauză/AUTO, cu segment incomplet.
- Nu există preview, confirmare și înlocuire atomică a sesiunii.
- Nu există includerea companiei, daily-ului, XP-ului și profilului în același checkpoint.
- Nu există probă de browser pentru export, import și al doilea import fără duplicate.

**Documentație:** [Salvare și import/export](15-salvare-si-import-export.md) · [Savefile și integritate](29-savefile-si-integritate.md) · [Contracte de performanță](25-performanta-contracte-si-benchmark.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [278](../PBI/README.md) · **Dependențe:** 260, 266, 276.

### 279 — Setări, remapare taste și slidere de control/stil în joc

**Ce lipsește:** Butonul „Setări” din start și pauză face `console.log`; panourile de setări, remapare și slidere nu sunt montate.

- Butonul „Setări” din ecranul de start și meniul de pauză este TODO.
- Nu există panoul de unități, cameră, confort, grafică și audio montat.
- Nu există remapare de taste cu detectarea conflictelor.
- Nu există sliderele de control (7) și stil (8) montate.
- Nu există aplicarea `MANUAL_TUNING` prin bariera 205 și activarea 110.
- Nu există resetare cu confirmare și nici separarea setărilor de profil.

**Documentație:** [Interfață, cameră și control](08-interfata-camera-si-control.md) · [Reglaje HUD și cameră](27-reglaje-hud-si-camera.md) · [Setările jocului](game-settings.md) · [Remaparea comenzilor](key-remapping.md) · [Accesibilitatea interfeței](ui-accessibility.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [279](../PBI/README.md) · **Dependențe:** 260.

### 280 — Camera first-person din poziția șoferului

**Ce lipsește:** Există doar camera de urmărire; `C` și camera first-person din scaunul șoferului nu sunt montate.

- Nu există binding `C` în compunerea live.
- Camera V3 este third-person/character; nu există ancoră în scaunul șoferului.
- Nu există tranziție între camere la intrare/ieșire sau schimbarea vehiculului.
- Nu există FOV/offset din setări aplicate camerei first-person.
- Nu există ocluzie și clipping pentru caroserie în first-person.
- Nu există probă în browser pe ambele backenduri.

**Documentație:** [Interfață, cameră și control](08-interfata-camera-si-control.md) · [Reglaje HUD și cameră](27-reglaje-hud-si-camera.md) · [Camera vehiculului](vehicle-camera.md) · [Input de tastatură](keyboard-input.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [280](../PBI/README.md) · **Dependențe:** 260, 263.

### 281 — Minimapa, harta de flotă și HUD-ul complet de joc

**Ce lipsește:** HUD-ul live are doar viteză și mod; minimapa, ruta, markerii de flotă, obiectivul și sesiunea lipsesc.

- Nu există minimapă montată în joc.
- Nu există markeri pentru taxiuri/civili, rută, pickup/dropoff sau incidente.
- Nu există obiectivul curent, sesiunea sau starea cursei în HUD.
- Nu există hinturi contextuale pentru intrare, mod și recuperare.
- Nu există layout responsive și verificarea suprapunerilor.
- Nu există o probă vizuală la 1280×720 și pe zoom.

**Documentație:** [Interfață, cameră și control](08-interfata-camera-si-control.md) · [Reglaje HUD și cameră](27-reglaje-hud-si-camera.md) · [Minimapa](minimap.md) · [HUD](hud.md) · [Layout responsive](responsive-layout.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [281](../PBI/README.md) · **Dependențe:** 260, 263.

### 282 — Fizica Rapier live pentru jucător și AI

**Ce lipsește:** Mașina condusă folosește un adaptor cinematic, nu Rapier; nu există roți, suspensie, daune sau recuperare fizică în joc.

- Compunerea live folosește `driveVehicle` cinematic, nu adaptorul Rapier 022/024.
- Nu există corpuri fizice, roți, suspensie sau contacte reale în joc.
- Nu există daune, avarii sau recuperare fizică în compunerea live.
- Nu există paritate player/AI pe aceeași comandă și aceeași suprafață.
- Nu există calibrare sedan/compact în jocul live.
- Nu există o probă de browser cu impact, frânare și revenire fără penetrare.

**Documentație:** [Vehicule și fizică](05-vehicule-si-fizica.md) · [Adaptorul fizic](physics-adapter.md) · [Controllerul vehiculului](vehicle-controller.md) · [Dinamica roților](wheel-dynamics.md) · [Daunele vehiculului](vehicle-damage.md) · [Recuperarea vehiculului](vehicle-recovery.md) · [Calibrarea fizicii](physics-calibration.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [282](../PBI/README.md) · **Dependențe:** 260, 262.

### 283 — Regulile de trafic live: semafoare, STOP, prioritate, yield și benzi

**Ce lipsește:** Semaforii sunt randați, dar traficul live are `signals: []`; STOP-ul este decorativ, iar prioritatea, yield-ul și schimbările de bandă nu sunt active.

- `civil-traffic` trimite `signals: []` și `completeness.signals: false`; niciun vehicul nu oprește la roșu.
- Semnele STOP sunt decorative, nu reguli de intersecție.
- Nu există prioritate, yield, conflict de intersecție sau blocaj de rețea în joc.
- Nu există schimbări de bandă, depășiri sau cooldown în traficul live.
- Nu există încălcări observabile pentru jucător și nici consecințe în review.
- Nu există o probă de browser cu roșu, STOP și conflict.

**Documentație:** [Autonomie și trafic](06-autonomie-si-trafic.md) · [Semaforare](signals.md) · [Politica STOP](stop-policy.md) · [Regulile STOP](stop-rules.md) · [Prioritate](priority-rules.md) · [Yield](yield-policy.md) · [Schimbarea benzii](lane-change-policy.md) · [Blocaj și reintrare](blocked-recovery.md) · [Conflictele intersecțiilor](intersection-conflicts.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [283](../PBI/README.md) · **Dependențe:** 260, 262, 282.

### 284 — Traficul civil complet autonom și preluarea oricărei mașini

**Ce lipsește:** Traficul AI live folosește doar cruise/following, nu respectă semafoare și nu poate fi preluat; nu este autonomia documentată.

- Traficul civil live are context incomplet (`signals: []`, fără obstacole/zone).
- Nu folosește semafoare, STOP, prioritate, yield, benzi sau recuperare.
- Nu poate fi preluat de jucător; `requestEntry` îl refuză.
- Nu există reconcilierea rutei la preluare și nici reluarea ei la ieșire.
- Nu există paritate taxi/civil pentru profilul comun și pentru moduri.
- Nu există o probă de browser cu preluarea unui civil AI.

**Documentație:** [Flotă și curse](07-flota-si-curse.md) · [Traficul civil](civil-traffic.md) · [Traficul AI din browser](browser-ai-traffic.md) · [Schimbarea vehiculului](vehicle-switch.md) · [Cursa completă și intervenția](manual-trip.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [284](../PBI/README.md) · **Dependențe:** 262, 283.

### 285 — Decor destructibil, feedback audio și replay în joc

**Ce lipsește:** Decorul destructibil 227, feedbackul audio 228 și replay-ul nu sunt conectate la compunerea din browser.

- Decorul destructibil 227 nu este conectat la compunerea live.
- Nu există impact, fragmente, sunet sau reset al decorului.
- Nu există audio de motor, coliziune, frânare sau mediu în joc.
- Nu există replay pentru distrugeri și reseturi.
- Nu există plafoane pentru fragmente, voci și obiecte.
- Nu există o probă vizuală/audio pentru distrugere și reset.

**Documentație:** [Joacă liberă, Haos și distrugere](26-joaca-libera-haos-si-distrugere.md) · [Asseturi vizual și audio](16-asseturi-vizual-si-audio.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [285](../PBI/README.md) · **Dependențe:** 282, 283.

### 286 — Pietoni, treceri și pericole V2 în lumea live

**Ce lipsește:** Modulele V2 de pietoni, treceri și pericole există, dar nu sunt montate în lumea jucabilă.

- Nu există pietoni în lumea live.
- Nu există treceri active, faze de traversare sau yield observabil.
- Nu există obstacole/pericole cu reacție și evitare.
- Nu există contexte V2 pentru estimatoare și provocări.
- Nu există o probă de browser cu pieton, yield și obstacol.
- Nu există costul pentru 96 de pietoni/obstacole.

**Documentație:** [Extensii și mers pe jos](20-extensii-si-mers-pe-jos.md) · [Autonomie și trafic](06-autonomie-si-trafic.md) · [Zonele de trecere](crosswalk-zones.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [286](../PBI/README.md) · **Dependențe:** 282, 283.

### 287 — Gate V4, QA final, playtest și release verificat

**Ce lipsește:** Gate-ul V4 este singurul task rămas în vechiul board; nu există un release end-to-end, playtest uman sau dovadă hardware.

- Nu există un playtest end-to-end al Academiei în browser.
- FPS/frame pe hardware real rămâne `NOT_VALIDATED`.
- Capturile V4 nu acoperă toate preseturile și backendurile.
- Release checklist-ul vechi are FAIL/NOT_RUN și nu mai corespunde boardului.
- Nu există soak cu toate sistemele montate.
- Nu există o regulă care să împiedice marcarea Done cu criterii deschise.

**Documentație:** [Calitate vizuală V4](30-calitate-vizuala-v4.md) · [Validare și release](18-validare-si-release.md) · [Contracte de performanță](25-performanta-contracte-si-benchmark.md) · [Politica de validare](validation-policy.md) · [Harness de performanță](performance-harness.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [287](../PBI/README.md) · **Dependențe:** 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286.


## Legături istorice

Fișierele din `Docs/Evidence/` păstrează dovezi și linkuri către taskurile 001–258. Acele linkuri sunt **istorice**: fișierele PBI au fost retrase la resetarea boardului, iar dovezile rămân în Git. Validate-Plan exclude `Docs/Evidence` și `Docs/Archive` de la verificarea linkurilor curente, pentru a nu confunda arhiva cu planul activ.

## De ce boardul vechi inducea în eroare

- 236 declara explicit că mișcarea mașinii este un adaptor de jucabilitate, nu fizica Rapier, și că salvarea/HUD-ul final lipsesc.
- 257 declara explicit că LEARNING rămâne în afara scope-ului V3.
- 235 era Done cu C3 `FAIL` și C5 `NOT_RUN` (0/5 playtest uman).
- 162 era `NOT_VALIDATED`, cu 2 FAIL, 1 NOT_VALIDATED și 2 NOT_RUN.
- Documentele de stare erau în urmă: README spunea că nu există lume rutieră, Docs/README spunea că gameplay-ul este planificat, iar manualul descria bootstrapul ca „doar randare”.

## Ordinea recomandată

1. **259–260:** garda de documentație și shell-ul jucabil.
2. **261–265:** sesiuni, flotă, selecție și curse.
3. **266–270:** economie, KPI și companie.
4. **271–274:** moduri, telemetrie, learning și profil.
5. **275–277:** campanie, daily/XP și provocări.
6. **278–281:** persistență, setări, first-person și minimapă.
7. **282–285:** fizică, reguli de trafic, trafic civil complet și distrugere/audio/replay.
8. **286–287:** V2 și gate-ul final.

## Reguli de mentenanță

- Orice schimbare de scope actualizează Docs/21, Docs/31 și PBI/README în același commit.
- `npm run docs:check -- --check` trebuie să treacă înainte de commit; un task mutat fără index, tabel de progres și matrice actualizate este eșec.
- Un task nou primește următorul ID liber; nu se reutilizează 001–258.
- Un task nu se mută în Done fără comportament observabil, dovezi și verificarea din browser/playtest relevantă.
- Un release nu se declară închis cât timp 287 are criterii deschise.
- Documentația de stare se schimbă înaintea codului, nu după el.

## Legături

- [Backlogul curent](../PBI/README.md)
- [Acoperirea pe PBI](21-acoperire-functionalitati.md)
- [Companie: profit și evoluție](32-companie-profit-si-evolutie.md)
- [Produs și scope](01-produs-si-scope.md)
- [Validare și release](18-validare-si-release.md)
- [Manual](manual/README.md)

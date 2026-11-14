# Misiuni și progres

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Misiuni și progres

Campania introduce mecanicile în ordine și păstrează libertatea de a demonstra un stil riscant. Progresul poate evalua rezultate diferite: finalizarea cursei, fidelitatea imitației, confortul, viteza serviciului sau efectul asupra orașului. Învățarea nu șterge automat greșelile pentru a acorda un scor bun.

| Etapă | Misiune propusă | Condiție de progres |
| --- | --- | --- |
| 1 | Primul taxi | Selectează un taxi, comută în manual și finalizează o cursă |
| 2 | Prima demonstrație | Închide un segment LEARNING cu cel puțin un parametru susținut de date și vezi publicarea în flotă |
| 3 | Distanța în trafic | Demonstrează două stiluri de urmărire și identifică diferența dintre profiluri |
| 4 | STOP și semafoare | Întâlnește oportunități relevante și inspectează comportamentul învățat |
| 5 | Pasagerul | Finalizează o cursă cu obiectiv explicit de confort |
| 6 | Orașul te copiază | Rulează un scenariu cu întreaga flotă și inspectează efectele stilului |
| 7 | Schimbarea unui obicei | Creează o versiune nouă din demonstrații repetate și compară două profiluri |
| 8 | Provocarea flotei | Finalizează un scenariu cu obiective de serviciu și buget de incidente afișate |

Recompensele propuse sunt deblocări de provocări, clase de mașini și instrumente de analiză. Capacitățile de bază de a conduce orice mașină existentă și de a selecta orice taxi sunt disponibile de la început. Nu se condiționează accesul la taxiurile existente de nivelul jucătorului.

O misiune are ID stabil, condiții de pornire, obiective, praguri, fereastră de evaluare, stare, recompensă și reguli de reluare. Obiectivele sunt calculate din evenimente ale simulării, nu din textul HUD. Eșecul unei misiuni păstrează profilurile învățate; reluarea arată dacă folosește profilul curent sau un snapshot inițial.

Jocul păstrează separat rezultatul misiunii, fidelitatea stilului și indicatorii orașului. Nu comprimă toate efectele într-un singur scor de „șofer bun”. Provocările care cer respectarea regulilor o spun explicit; experimentele de imitație pot reuși și cu un profil problematic.

## Reluare și dificultate

Reluarea păstrează profilul curent dacă obiectivul nu declară un snapshot fix. Misiunile de comparație declară profilele și scenariul. Dificultatea ajustează cererea și pragurile obiectivelor, fără a modifica pe ascuns stilul învățat. Recompensele sunt idempotente pe missionId și versiunea progresului.

În V2 se adaugă provocări pentru rutare, semnalizare, pietoni, pericole și serviciu. În V3 se adaugă tutorialul de mers și intrare/ieșire. Niciuna dintre aceste extensii nu elimină accesul la taxiurile existente.

## Misiuni zilnice și experiență

V1 include exact trei misiuni noi pe zi calendaristică, separate de campanie și de zilele economice simulate. Obiectivele provin dintr-un catalog de activități de serviciu, experimente și provocări neobișnuite cu parametri randomizați și condiții realizabile: curse MANUAL, confort, eficiență și demonstrații LEARNING explicite. MANUAL rămâne o cale de progres fără schimbarea profilului comun.

PlayerProgress conține XP și nivelul; misiunile eligibile, provocările conform politicii lor și timpul activ Academie contribuie la XP. Revenue și ratingul pot scădea, dar nu retrag XP și nu coboară nivelul. Fidelitatea imitației rămâne un rezultat separat. [Contractul zilnic și XP](23-misiuni-zilnice-si-experienta.md) definește calendarul și creditele idempotente; [provocările random](28-provocari-random-si-revenire.md) adaugă varietate fără a schimba numărul de trei daily.

## Joacă liberă și provocări opționale

[Haos](26-joaca-libera-haos-si-distrugere.md) este disponibil de la început, cu progres/recorduri separate și reluare rapidă. [Modulul 28](28-provocari-random-si-revenire.md) definește urgențe la spital/toaletă, filmări pentru influenceri, livrări comice, drift și demolare, cu prerechizite și obiective calculabile. Editarea sliderelor nu îndeplinește misiuni care cer demonstrații LEARNING. Resetul lumii păstrează progresul acumulat, fără finalizări artificiale.

## Contract implementat în V1 (PBI 116)

Catalogul campaniei este `src/missions` cu schema `116-mission-schema-v1`. Cele opt etape au ID-uri stabile: `campaign-1-first-taxi`, `campaign-2-first-demonstration`, `campaign-3-following-distance`, `campaign-4-stops-and-signals`, `campaign-5-passenger`, `campaign-6-city-copies-you`, `campaign-7-changing-a-habit`, `campaign-8-fleet-challenge`. Fiecare definiție are `missionId`, `version`, `title`, obiective, recompense, `replay`, fereastră de evaluare (`windowTicks`), buget de incidente (`incidentBudget`) și prerechizite. Pragurile și sumele XP sunt propuneri de calibrare, nu valori certificate.

Obiectivele sunt calculate exclusiv din evenimente validate 007 și din valorile lor reale: `DROPOFFS` din `DROPOFF`, `MANUAL_DROPOFFS` din `DROPOFF` după un `MANUAL_START` real pentru același vehicul, `CLEAN_DROPOFFS` din `DROPOFF` fără `COLLISION` de la `DROPOFF`-ul anterior al vehiculului, `LEARNING_ACTIVATIONS` din `PROFILE_ACTIVATE`, `DISTINCT_PROFILE_VERSIONS` din versiunile distincte ale `PROFILE_ACTIVATE`, `FULL_STOPS` din `FULL_STOP` cu `durationS` peste pragul declarat, `LANE_CHANGES` din `LANE_CHANGE_COMPLETED` și `LEADER_ACQUIRED` din `LEADER_ACQUIRED`. HUD-ul, frame-urile randate și scorurile trimise de apelant nu sunt intrări. `attachBus(bus)` abonează trackerul la transportul 007 real; `ingest(event)` acceptă aceleași valori validate pentru teste și pentru compoziții fără bus.

Stările unei instanțe sunt `ACTIVE`, `COMPLETED`, `FAILED`. Completarea este automată când toate obiectivele își ating pragul; eșecul are un motiv închis: `EVALUATION_WINDOW_EXPIRED`, `INCIDENT_BUDGET_EXCEEDED`, `SCENARIO_RESET` sau `PLAYER_ABANDONED`. Fereastra se măsoară în tick-uri autoritare (`advance(tick)`), deci un eveniment terminal sosit după termen nu completează misiunea. Bugetul de incidente numără `COLLISION`; depășirea lui închide instanța fără recompensă.

Idempotența are două chei explicite. Progresul este protejat de un registru mărginit de identități de eveniment (`eventId` + fingerprint); o a doua livrare este `DUPLICATE` și nu schimbă nimic, iar o reutilizare a aceluiași `eventId` cu alt payload este refuzată. Recompensele au identitate stabilă `(namespace, missionId, version, rewardId)` într-un registru separat, deci o reluare sau o completare repetată raportează recompensa ca duplicat. `reset` păstrează ambele registre, ca un reset de scenariu să nu recompenseze din nou. Limitele sunt fixe: 8192 identități de eveniment și 1.048.576 unități UTF-16, 4096 recompense, 16 instanțe active, 64 reținute, 8 încercări pe misiune și 16 ID-uri de eveniment recente pe instanță.

`start` creează prima încercare cu ID derivat din `(namespace, missionId, attempt)`; `replay` creează încercarea următoare pentru o instanță terminală și repornește obiectivele de la zero. Definiția declară `replay.profileSource` (`CURRENT` sau `SNAPSHOT`), `snapshotId` și `scenarioId`; trackerul raportează politica, dar nu încarcă și nu modifică profiluri — aplicarea lor rămâne în pipeline-ul de learning/activare. `snapshot`/`restore` păstrează progresul și registrele, iar o identitate sau o versiune forgeată este refuzată.

Nu fac parte din acest contract: obiectivele de confort/rating (necesită agregatele KPI), aplicarea XP în `PlayerProgress`, persistarea în savefile, UI-ul de misiuni și misiunile zilnice/random (modulele 23/28). Trackerul nu are ceas de perete, DOM, renderer sau muncă pe frame; consumă doar evenimente și tick-ul autoritar.

## Contract implementat în V1 (PBI 117): tutorialul de control

Etapa 1 din campanie are un tutorial separat de definiția de misiune: `src/missions/tutorial.ts` cu schema `117-mission-tutorial-v1`, ID stabil `tutorial-first-taxi-controls` și identitate de instanță derivată din `(namespace, tutorialId, încercare)`. Parcursul are cinci pași fixați, în ordine: `SELECT_TAXI`, `MODE_MANUAL`, `MODE_LEARNING`, `MODE_AUTO`, `COMPLETE_RIDE`. Un pas avansează numai din faptul real al familiei lui: selecția 068 (tip `TAXI`), proiecția acceptată 067 (`mode` plus `learningEligible`) sau evenimentele 007 `PICKUP`/`DROPOFF` pentru taxiul selectat.

Tutorialul nu produce învățare. Pasul `MODE_LEARNING` cere `learningEligible === false`, iar o observație `LEARNING` cu eligibilitate `true` sau `null` este refuzată cu eroare de contract pentru orice pas; contorul `refusedLearning` o consemnează. Contractul nu are API de job, versiune sau profil, iar `stats()` raportează structural `learningJobs: 0` și `profileVersions: 0`. Un `PROFILE_ACTIVATE` observat pe bus este doar evidență (`learningActivationsObserved`), niciodată progres.

Accesul la taxiuri nu este condiționat de progres: orice taxi poate fi selectat în orice pas, `canSelectTaxi` răspunde `allowed: true` pentru orice identitate, iar `blockedSelections` este structural zero. O selecție de taxi în alt pas este `IGNORED` cu motiv explicit (`WRONG_STEP`), nu un refuz; schimbarea taxiului păstrează pașii satisfăcuți și doar golește cursa în curs. Selecția unui vehicul civil este `NOT_A_TAXI`. Cursa cere un `PICKUP` real pentru taxiul selectat, iar un `DROPOFF` cu alt taxi, fără îmbarcare sau cu alt `rideId` este respins cu motiv închis.

Stările sunt `ACTIVE`, `PAUSED`, `COMPLETED`; terminarea este fie prin joc (`completedBy: PLAY`), fie prin skip (`SKIP`). `skip` marchează pasul curent sau toate pașii rămași, `pause` îngheață progresul (observațiile devin `TUTORIAL_PAUSED`), iar `resume` continuă exact de la pasul reținut. Tick-ul este monoton: unul vechi aruncă. Limitele sunt fixe: cinci pași, patru ID-uri de dovadă pe pas, o singură instanță. Fără ceas, DOM, renderer sau aleator în modul.

Panoul `src/ui/mission-tutorial.ts` (schema `117-mission-tutorial-ui-v1`) proiectează un singur snapshot acceptat și expune patru intenții (`PAUZA`, `REIA`, `SARI PESTE PAS`, `SARI PESTE TUTORIAL`) ca butoane native `<button type="button">`. Tastatura și mouse-ul folosesc același drum: clic sau activarea nativă Enter/Space a butonului focalizat, fără listener global, deci tastele de condus nu sunt capturate. Scrierile sunt throttled la 10 Hz, schimbările de pas/etapă ocolesc pragul, iar `dispose` returnează bugetul la zero.

Nu fac parte din acest contract: compunerea tutorialului în `main.ts`/vertical slice, persistarea între sesiuni (127–136), XP-ul de misiune și blocarea intenționată a vreunui taxi. Tutorialul nu este un panou de setări și nu modifică `PlayerProgress`.

## Contract implementat în V1 (PBI 121): obiectivul de confort

`src/missions/comfort.ts` cu schema `121-mission-comfort-v1` definește obiectivul `passenger-comfort`: praguri explicite de **accelerație** (2 m/s²) și **jerk** (2 m/s³), evaluate numai cu pasager la bord, într-o fereastră de maximum 7200 tick-uri (120 s la 60 Hz) și cu minimum 8 intervale utilizabile.

Pragurile nu sunt numere inventate pentru misiune: sunt valorile implicite livrate de catalogul de parametri ai proiectului (`src/profiles/parameter-registry.ts`), citite la import prin `parameterRegistry.comfort_deceleration.default` (2 m/s²) și `parameterRegistry.acceleration_jerk.default` (2 m/s³). Contractul le publică prin `COMFORT_THRESHOLD_SOURCE` (`comfort_deceleration`, `acceleration_jerk`), iar `parseComfortObjective` refuză orice altă sursă de prag. Pragurile sunt constante de misiune: un profil publicat sau ajustat manual nu este citit la runtime, iar confortul nu este o cheie de profil și nu poate fi învățat sau reglat.

Obiectivul este separat explicit de fidelitatea stilului: `separation` declară `styleFidelity: NOT_USED` și `styleScore: NOT_USED`, rezultatul are `styleFidelity: null` și `styleScoreUsed: false`, iar un câmp de scor de stil în intrare este refuzat de parser (câmp necunoscut). Confortul nu este un scor de „șofer bun” și nu se combină cu scorul de imitație.

Toate intrările sunt contracte reale, nu aproximări: pasagerul este derivat din ciclul de cursă **061** (`TO_DROPOFF` și `DROPOFF` au pasager la bord, `TO_PICKUP`/`PICKUP` nu), segmentul este segmentul **069** cu `controlMode` și `learningEligible` fixate la deschidere, eșantioanele sunt citite din înregistrarea reală **085** prin `comfortTelemetryFromTickSamples`, iar excluderile sunt ferestrele reale **088**.

Indicatorii nu includ impulsuri de teleportare. Evaluatorul consumă ferestrele reale **088** (`artifactWindows`) și folosește exclusiv span-ul lor `suppressed` (inclusiv, `fromTick..toTick`): un eșantion din span nu intră în calcul, iar un interval de accelerație care traversează span-ul este eliminat. Recuperările **030** rămân vizibile ca dovezi excluse (`exclusions.teleports`, `collisions`, `pauses`), dar nu pot produce o violare de confort. Fără fereastra 088, același salt de viteză este raportat corect ca violare — deci filtrarea este cea care separă teleportarea de condus. Ambele modele reale de recuperare sunt acoperite: segment închis de recuperare (span de un tick, un interval traversat și eliminat) și segment deschis (span până la capătul segmentului).

Stările sunt `PASSED`, `FAILED`, `NO_PASSENGER`, `INSUFFICIENT_DATA` și `WINDOW_EXCEEDED`; eșecul are motiv închis `ACCELERATION_LIMIT`, `JERK_LIMIT` sau `BOTH_LIMITS`. Accelerația este derivată vitezei reale pe interval (`Δv/Δt` la 60 Hz) din telemetria 085, iar jerk-ul derivata accelerației între intervale consecutive; comparația cu pragul folosește o toleranță de 1e-9 m/s² pentru integrarea la 60 Hz. Rezultatul raportează vârfurile, media |a|, numărul de eșantioane, numărul de depășiri, faptele de segment și contoarele de excludere.

Misiunea `campaign-5-comfort-ride` este un catalog 116 separat (`createComfortMissionCatalog`, namespace `campaign:121-comfort`): obiectivul 116 numără cursa (`DROPOFFS`, prag 1), iar poarta de confort este explicită — `comfortMissionOutcome` completează misiunea numai pentru un rezultat `PASSED` și păstrează motivul eșecului în rest. Un `DROPOFF` singur nu încheie obiectivul de confort.

Din PBI **139** evaluarea misiunii folosește unica formulă de derivare și de rezumare a confortului (`deriveComfortIntervals`, `summarizeComfortIntervals`), iar `comfortMissionOutcomeFromAggregates` citește agregatul per cursă al read modelului 139. Misiunea, tabloul 082 și modelul de review citesc astfel aceleași agregate, fără calcule paralele; pragurile și regula pasagerului sunt tot ale modulului 139.

Limitele sunt fixe: 20.000 eșantioane, 64 ferestre 088, 16 segmente, 64 span-uri, identități de maximum 256 de unități UTF-16. Modulul nu are ceas de perete, DOM, renderer, store de profil sau aleator; consumă doar tick-uri autoritare și valori SI. Nu fac parte din contract: UI-ul de confort, XP-ul, persistarea, calibrarea cu pasageri reali și fidelitatea stilului.

## Contract implementat în V1 (PBI 118): demonstrația primei misiuni

`src/app/mission-demo.ts` cu schema `118-mission-demo-v1` implementează etapa 2 a campaniei (`campaign-2-first-demonstration`, definiție 116) ca traseu real de learning, nu ca efect fabricat. Misiunea cere două lucruri: un delta justificat și o activare observată.

Lanțul este integral real. Segmentul LEARNING 069 (marcat eligibil) produce dovezile prin 085 (mostre de tick), 086 (oportunități STOP), 087 (ferestre de eligibilitate), 088 (fereastra de artefacte), 093 (read model pe cheie) și 097/098 (estimatoarele reale); episodele și candidatul intră în coada 103, poarta numerică 102 acceptă compoziția, 112 derivează versiunea 109 și publică activarea 110 pentru tickul comun următor, iar 104 citește explicația din același job și același outcome pe care le-a folosit pipeline-ul.

Stările sunt închise: `DEMONSTRATED` (delta justificat și activare aplicată, observată), `NO_CHANGE` (compoziția păstrează valoarea, deci fără versiune și fără activare) și `REJECTED` (segment MANUAL, segment neeligibil, job eșuat, job învechit sau segment duplicat). Cerința misiunii este satisfăcută doar când `justifiedDelta` și `observedActivation` sunt amândouă adevărate: delta justificat înseamnă read model 093 `READY`, episoade distincte, context 087 observat și stare 100 `OBSERVED`, iar activare observată înseamnă comanda 110 aplicată la tickul comun, cu vehiculele flotei actualizate.

Segmentul fără dovezi eligibile rezultă `NO_CHANGE`: read model 093 `NO_EVIDENCE`, candidat 098 `REFUSED` cu motivul închis `ZERO_ELIGIBLE_STOP_DENOMINATOR`, compoziția 103 păstrează valoarea de bază, 112 nu derivează nicio versiune, 110 nu primește nicio comandă, iar cadrul 104 este `NO_CHANGE` cu `versionId: null`, motivul închis `NO_NEW_EVIDENCE` și contextele lipsă enumerate. Explicația spune de ce nu s-a schimbat nimic, nu doar că nu s-a schimbat nimic.

Acțiunea „Vezi un exemplu" este întotdeauna etichetată. După o publicare, exemplul este `LIVE` și poartă proveniența 109 a versiunii publicate (segment sursă, delta, checksum, versiune de bază). Fără o versiune publicată, exemplul este `EXPERIMENT` și provine din experimentul invers 105 (profilurile cunoscute `PRUDENT`, `IMPULSIVE`, `RECKLESS`, `MIXED`), marcat explicit ca referință de calibrare și nu ca efect al jucătorului (`isPlayerEffect: false`).

Rezultatul are două identități de versiune și ele nu trebuie confundate: `versionId` este versiunea 109 publicată în flotă, iar `composedVersionId` este compoziția 103 pe care cadrul 104 o raportează. Segmentul demonstrează valoarea de bază a profilului curent, deci un segment ulterior trebuie să declare valoarea de bază a capului acceptat, altfel pipeline-ul 112 compară valoarea compusă cu valoarea capului și derivează o versiune; regula 112 nu este schimbată de 118. Limitele sunt fixe: 24 de rânduri într-un exemplu, 16 identități 086 ca proveniență, 240 de unități UTF-16 pentru un motiv și o lume deterministă cu 24 de taxiuri și 40 de civili. Modulul nu are ceas de perete, DOM, renderer, aleator sau memorie de evenimente; el consumă tick-uri autoritare și module reale. Nu fac parte din contract: UI-ul de misiuni, XP-ul, persisterea și compoziția cu `main.ts`.

## Contract implementat în V1 (PBI 119): comparația stilurilor de urmărire

`src/missions/follow.ts` cu schema `119-mission-follow-v1` implementează etapa 3 a campaniei (`campaign-3-following-distance`, definiție 116) ca **comparație măsurată** între două stiluri de urmărire, nu ca estimare a unor coeficienți dintr-o singură viteză. Modulul nu scrie o a doua lege de urmărire: distanța pe care un stil o ține într-un context cunoscut este `desiredGapM` raportat de politica livrată **048** pentru profilul compilat, iar `following_time_headway` (panta) și `following_min_gap` (intersecția) sunt derivate exclusiv de estimatorul real **096** din observațiile reale.

Contexturile sunt autorate și cunoscute: patru scenarii cu viteze distincte (4, 8, 12, 20 m/s) și distanțe autorate 12, 14, 16, 30 m, fiecare cu liderul lui. În același scenariu ambele stiluri întâlnesc exact aceleași fapte — viteză ego, viteză lider și identitate lider — iar contractul verifică asta pentru fiecare observație; un context străin este refuzat ca eroare de contract, nu comparat silențios cu altă situație. Comparația cere exact două profiluri cu ID-uri distincte, aceleași ID-uri de scenariu declarate și același număr de observații pe scenariu.

Stările sunt închise: `SEPARATED`, `IDENTICAL`, `UNIDENTIFIED`. Separarea este `HEADWAY` când diferă doar panta, `MINIMUM_GAP` când diferă doar intersecția, `BOTH` când diferă ambele, `NONE` când valorile coincid și `UNIDENTIFIED` când estimatorul nu poate identifica coeficienții. Toleranțele sunt explicite: 0,1 s pentru time headway și 0,5 m pentru distanța minimă, sub diferența vizibilă pentru jucător. Poarta misiunii este unică: `followingMissionGate` completează etapa doar pentru `SEPARATED` (`PROGRESS`); `IDENTICAL` raportează `PROFILE_VALUES_MATCH`, iar `UNIDENTIFIED` păstrează motivul estimatorului.

Refuzul pe o singură viteză este executabil, nu declarativ: setul `FOLLOW_SINGLE_SPEED_SCENARIOS` (un context la 8 m/s) produce `UNIDENTIFIED` cu motivul real `SINGLE_SPEED_CANNOT_IDENTIFY`, deși distanțele măsurate ale celor două stiluri diferă. Cu alte cuvinte, jucătorul nu este niciodată pus să ghicească coeficienți dintr-o singură observație; i se cere să compare două comportamente în contexte în care diferența este vizibilă.

Contractul este structural read-only: `profileWrites: 0`, `learningJobs: 0` și `versionIds: []` apar atât pe comparație, cât și pe fiecare profil, iar modulul nu are ceas, DOM, renderer, store de profil, coadă de learning sau aleator. Limitele sunt fixe: 6 scenarii, 2 profiluri, 8 observații pe scenariu, 32 pe profil și 256 de unități UTF-16 pentru o identitate. Nu fac parte din contract: UI-ul de comparație, XP-ul, persistarea, compoziția cu `main.ts` și afișarea grafică a gap-ului.

## Contract implementat în V1 (PBI 120): misiunea STOP/roșu/verde

`src/missions/signals.ts` cu schema `120-mission-signals-v1` implementează etapa 4 a campaniei (`campaign-4-stops-and-signals`, definiție 116) ca misiune în care încălcarea este **învățată și consecința este observabilă**, nu ca o notă inventată deasupra traficului. Modulul consumă exclusiv fapte reale: oportunitatea **086** cu `outcome`/`result` cert, fereastra **087** cu eticheta și clasa ei, refuzul real al lui `respond` pentru ferestrele constrânse, cauza STOP **050/051**, și candidații reali **097** `red_stop_probability` și **098** `stop_full_probability`.

Obiectivul este cel din definiția 116: două opriri complete de minimum **1,5 s** fiecare, plus zero încălcări imputabile. O oprire completă sub 1,5 s rămâne o oprire reală (`FULL_STOP`), dar nu satisface obiectivul; misiunea raportează `INSUFFICIENT_FULL_STOPS`, nu o transformă în încălcare.

O încălcare are două jumătăți observabile: oportunitatea 086 este un `FAILURE` cert, iar episodul intră în candidatul real pe care estimatorul îl învață. `RED_CROSSED` se leagă de `red_stop_probability`, `STOP_LINE_CROSSED` de `stop_full_probability`, iar `SignalConsequence` raportează aceeași valoare pe care o raportează estimatorul (`1/3` într-un run cu o frânare corectă din trei). Modulul nu recalculează estimatorul și nu publică un profil.

Două situații reale nu sunt niciodată încălcări și nu cer reacție:

- **oprirea din trafic** (`cause` `LEADER`, `QUEUE` sau `BLOCKED`) este un `FAILURE` 086 cert, dar fereastra 087 este `EXTERNAL_CONSTRAINT`; misiunea o raportează `TRAFFIC_STOP` și o exclude din numitorul `stop_full_probability` (raportul rămâne `3/3`, nu `3/4`);
- **verdele blocat** (`BLOCKED_GREEN`, sursă `FOLLOWING_QUEUE`) este `EXTERNAL_CONSTRAINT`; `respond` îl refuză cu `EXTERNAL_CONSTRAINT`, deci `reaction.applicable` este `false`, iar delay-ul lui nu intră în `green_start_delay`.

Vocabularul este închis: verdictele `VIOLATION`, `COMPLIANT`, `TRAFFIC_STOP`, `BLOCKED_GREEN`, `EXTERNAL_CONSTRAINT`, iar explicațiile acoperă fiecare caz (`RED_HELD`, `RED_CROSSED`, `STOP_LINE_HELD`, `STOP_LINE_CROSSED`, `GREEN_RELEASED`, `GREEN_MISSED`, `TRAFFIC_STOP_NOT_VIOLATION`, `BLOCKED_GREEN_NOT_VIOLATION`, `EXTERNAL_CONSTRAINT_NOT_VIOLATION`). Contractul refuză un input contradictoriu — fereastră străină, oportunitate duplicată, candidat care nu corespunde episoadelor, reacție acceptată pe o fereastră constrânsă — în loc să explique o situație pe care faptele nu o susțin.

Contractul este structural read-only: `profileWrites: 0` și `learningJobs: 0`, fără ceas, DOM, renderer, store de profil, coadă de learning sau aleator. Limitele sunt fixe: 32 de episoade într-un run și 256 de unități UTF-16 pentru o identitate. Nu fac parte din contract: UI-ul de misiune, XP-ul, persistarea și compoziția cu `main.ts`.

## Contract implementat în V1 (PBI 122): orașul te copiază

`src/missions/city.ts` cu schema `122-mission-city-v1` implementează etapa 6 a campaniei (`campaign-6-city-copies-you`, definiție 116) ca evaluare a **întregii flote** cu profilul jucătorului, nu doar a vehiculelor din cameră. Contractul consumă exclusiv fapte livrate: identitatea, categoria, clasa și modul fiecărui vehicul din registry-ul **057**, versiunea aplicată din starea flotei (**110**), valorile reale ale versiunilor din store-ul **109** (validate prin catalogul **092**) și cursele terminale ale ciclului **061**. Setul de cameră este doar o listă de observație: un vehicul care nu apare în ea este *invizibil*, niciodată *exclus*.

Intrarea este refuzată dacă ar putea ascunde un vehicul sau o cursă: numărul declarat de taxiuri și civili trebuie să corespundă exact listei, fiecare versiune aplicată trebuie să aparțină profilului jucătorului și să aibă același set de chei 092, fiecare cursă trebuie să aparțină unui taxi evaluat, iar activarea reală **110** trebuie să fie exact versiunea jucătorului. Un ID vizibil care nu face parte din flotă este refuzat, deci camera nu poate elimina tacit un vehicul. `coverage.complete` este astfel `true` prin construcție, iar `omittedVehicles` este structural `0`.

**Expunerea** este măsurată în secunde de serviciu planificate de **061** (`totalCostSeconds`), nu în prezență pe ecran. Pentru fiecare vehicul, expunerea include și cursa eșuată: taxiul a fost expus orașului chiar dacă serviciul nu s-a livrat. Rezultatul raportează separat secunzi vizibili și invizibili, numărul de curse și proporția invizibilă (`invisibleSeconds / totalSeconds`, respectiv `invisibleRides / totalRides`), plus câte taxiuri invizibile au servit efectiv.

**Imitația** și **consecințele** au valori și verdicte proprii, fără un scor comun. Fidelitatea compară fiecare valoare a versiunii aplicate cu valoarea publicată a jucătorului, cheie cu cheie, cu toleranță `1e-9`; verdictul este `EXACT` când toate celulele coincid, `PARTIAL` când doar o parte coincid și `NONE` când niciuna. Consecințele citesc doar rezultatele reale **061**: serviciu livrat, serviciu ratat și eșecuri imputabile stilului (`TAXI_DAMAGED`, `TAXI_BLOCKED`); verdictul este `HARMFUL` când există eșecuri imputabile, `NO_SERVICE` când nu s-a livrat nimic și `CLEAN` altfel. Un profil riscant poate fi copiat `EXACT` și poate produce `HARMFUL`, iar o flotă parțial actualizată (`PARTIAL`) poate livra `CLEAN`; cele două jumătăți nu se compensează reciproc. Poarta campaniei (`cityMissionGate`) cere doar ca scenariul să fi rulat cu întreaga flotă și cu cel puțin o cursă terminală (`NO_RIDES` altfel); ea nu cere un stil bun și nu transformă consecințele într-un scor de misiune.

Contractul este structural read-only: `profileWrites: 0` și `learningJobs: 0` apar pe rezultat și pe fidelitate, iar modulul nu are ceas, DOM, renderer, store de profil, coadă de learning sau aleator. Limitele sunt fixe: 70 de vehicule (capacitatea 057), 1024 curse (capacitatea 059), 96 de parametri pe versiune și o fereastră de 5.184.000 tick-uri (24 h la 60 Hz). Nu fac parte din contract: UI-ul de misiune, XP-ul, persistarea, compoziția cu `main.ts` și captura reală de cameră.

## Contract implementat în V1 (PBI 123): schimbarea unui obicei

`src/missions/habit.ts` cu schema `123-mission-habit-v1` implementează etapa 7 a campaniei (`campaign-7-changing-a-habit`, definiție 116) ca obiectiv de actualizare a profilului prin demonstrații repetate. Modulul **nu creează versiuni**: citește istoricul real 109 al unui profil (`store.getHistory(profileId)`) și cheia 092 demonstrată, în ordinea în care magazinul le predă, și evaluează seria de demonstrații acceptate care le-au produs. Obiectivul rămâne cel autorat de 116: `distinct-versions` / `DISTINCT_PROFILE_VERSIONS` / țintă 2 versiuni publicate comparate.

**Regula „treptat" este explicită și trăiește în misiune**, nu în modulele de learning: `HABIT_POLICY.stepsToReplace = 3` demonstrații consecutive în aceeași direcție stabilesc tendința nouă, iar `HABIT_POLICY.stepsToReverse = 2` contradicții consecutive o răstoarnă. Pragul de 3 este cea mai mică serie în care o singură demonstrație contradictorie lasă totuși o majoritate strictă (două din trei) în direcția originală, deci „înlocuit" nu poate fi anulat de o singură eșantionare zgomotoasă. Pragul de 2 este cea mai mică serie **repetată** contrarie, strict mai mare decât o demonstrație singulară. O demonstrație contradictorie singulară este **absorbită**: este raportată în pas, mută valoarea reală prin 101, dar nu schimbă direcția raportată. Tendința inversată pornește cu cele două pasuri deja numărate, deci atinge pragul de 3 după încă o demonstrație consecventă.

Fiecare pas este o versiune reală 109: `order` este adâncimea reală (`depth`), `parentVersionId` continuă lanțul, `checksum` este hash-ul de conținut `fnv1a64` al versiunii (verificat cu `verifyProfileVersionChecksum`), `sourceSegmentIds` păstrează segmentele acumulate, `segmentId`/`interventionId` vin din delta versiunii, iar `previousValue`/`newValue`/`change` arată exact ce a schimbat demonstrația. `absorbed` și `reversal` spun ce s-a întâmplat cu tendința la acel pas, iar `totalChange` cumulează schimbarea față de bază. Jucătorul poate inspecta astfel fiecare versiune intermediară, nu doar capul lanțului.

`HabitComparison` compară cele două versiuni ale obiectivului 116 — baza acceptată și capul lanțului — cu valorile, checksum-urile, schimbarea semnată și numărul de versiuni/demonstrații. `habitMissionGate` cere tendința stabilită (`REPLACED`) și cel puțin două versiuni comparate; o demonstrație doar absorbită nu este progres, iar un istoric fără demonstrații este raportat `NO_DEMONSTRATIONS`.

Stările sunt `REPLACED`, `BUILDING`, `NO_DEMONSTRATIONS`, `REJECTED`. Intrările inconsistente sunt refuzate cu cod închis, fără excepție nerulată: `PROFILE_MISMATCH` (versiune din alt profil), `MISSING_INTERMEDIATE_VERSION` (versiune intermediară lipsă, ordine sau adâncime ruptă), `DEMONSTRATION_WITHOUT_EVIDENCE` (versiune derivată fără segment/delta ori fără cheia demonstrată, respectiv o demonstrație care nu mișcă valoarea), plus `INVALID_INPUT`, `HISTORY_LIMIT`, `NO_BASE_VERSION`, `DUPLICATE_VERSION`, `ENGINE_VERSION_MISMATCH`, `VERSION_WITHOUT_KEY`, `CHECKSUM_MISMATCH` și `VALUE_MISMATCH` (valoarea nu corespunde deltei înregistrate). Rezultatul refuzat are `trend: null`, pași zero și `profileWrites: 0`/`learningJobs: 0` structural; un istoric cu doar versiunea de bază nu este refuzat, ci raportat `NO_DEMONSTRATIONS`.

Contractul este structural read-only: `profileWrites: 0` și `learningJobs: 0`, fără ceas, DOM, renderer, store de profil, coadă de learning sau aleator. Limitele sunt fixe: 128 de versiuni (capacitatea 109 pe profil), 256 de unități UTF-16 pentru identități și token-uri, toleranță `1e-9` la compararea valorilor. Nu fac parte din contract: UI-ul de misiune, XP-ul, persistarea, compoziția cu `main.ts` și captura reală de condus.

## Contract implementat în V1 (PBI 124): provocarea finală de serviciu

`src/missions/fleet.ts` cu schema `124-mission-fleet-v1` implementează etapa 8 a campaniei (`campaign-8-fleet-challenge`, definiție 116) ca o **cursă reală de serviciu** măsurată pe trei dimensiuni separate, nu ca un scor final. Contractul are două intrări distincte: `fleetChallengeBriefing` produce **înainte de start** fereastra, condițiile, țintele și bugetul, iar `evaluateFleetMission` judecă o încercare împotriva aceleiași instanțe de briefing, pe care o embeduiește în rezultat.

**Fereastra de evaluare** este un contract explicit: `[startTick, endTick]` cu ambele capete incluse, `durationTicks` luat din `windowTicks` al definiției 116 (21.600 tick-uri, adică 6 minute la 60 Hz) și `endTick = startTick + durationTicks`. Briefingul are `status: BEFORE_START` și `evaluated: { rides: 0, incidents: 0 }` structural; parserul refuză orice câmp de rezultat trimis la briefing (`rides`, `incidents` etc. sunt câmpuri necunoscute). Orice cerere sau incident din afara ferestrei este refuzat ca eroare de contract, deci fereastra afișată este exact cea judecată. O încercare se încheie legitim devreme numai când toate cererile au un rezultat terminal 061; altfel `window.complete` este `false`.

**Cererea de curse** este cererea reală 059: `requestId`, `scenarioId`, `windowId`, `ordinal`, `spawnTick`, `demandLevel`, `access: TAXI`, zonele de origine/destinație, plus promisiunea de serviciu autorată `promiseTick` (`spawnTick < promiseTick <= endTick`). Rezultatul fiecărei cereri este un rând cu stare închisă `SERVED`, `FAILED`, `CANCELLED` sau `PENDING`, cursa 061 și taxiul care a servit-o, `responseTicks` și `late`.

**Țintele de serviciu** sunt publicate în briefing: `minimumServedRides` este pragul obiectivului 116 `fleet-clean-dropoffs` pentru dificultatea aleasă (2/3/4 pentru EASY/NORMAL/HARD, prin `missionTargetFor`), `minimumServedFraction` este `1` (toate cererile 059 ale ferestrei trebuie servite) și `maximumLateRides` este `0`. Valorile măsurate vin exclusiv din 059/061: curse servite, eșuate, anulate, în așteptare, întârziate, secunde planificate versus livrate. Nu există o a doua metrică de serviciu.

**Confortul** refolosește obiectivul 121: fiecare cursă de pasager este evaluată cu `evaluateComfortRide`, iar dimensiunea cere cel puțin o cursă evaluată, zero eșecuri și pragurile 121 de 2 m/s² și 2 m/s³. Rezultatul listează fiecare cursă cu statusul și vârfurile ei; un rezultat `NOT_EVALUATED` nu poate produce succes. Confortul nu citește și nu raportează niciun scor de stil.

**Fidelitatea** proiectează evaluarea reală 122 a aceleiași flote: contractul cere ca rezultatul 122 să aparțină exact profilului și versiunii încercării și să acopere întreaga flotă evaluată, apoi citește verdicul și celulele potrivite. Ținta este `minimumMatchedFraction: 1` cu verdictul 122 `EXACT`; o flotă parțial actualizată rămâne `PARTIAL` și eșuează, fără rotunjire în sus. Nu se recalculează imitația în modul.

**Bugetul de incidente** este numeric și vine din 116 (`incidentBudget`, `0` pentru etapa 8). Incidentele sunt evenimente reale 007 `COLLISION`, validate cu `parseSimulationEvent`, numărate o singură dată pe `eventId` și numai în intervalul evaluat; un eveniment relivrat nu umflă bugetul (`duplicates` este raportat separat), iar un incident al unui vehicul nedeclarat sau din afara ferestrei este refuzat.

**Verdictul compozit este explicit derivat**, nu un scor opac. `FLEET_COMPOSITE_RULE` publică regula `ALL_DIMENSIONS_WITHIN_BUDGET`: `SUCCESS` numai când fereastra este completă și serviciul (`MET`), confortul (`PASSED`), fidelitatea (`MET`) și bugetul de incidente (`WITHIN_BUDGET`) trec toate; `INCOMPLETE` când fereastra nu s-a încheiat și au rămas cereri fără rezultat; `FAILURE` altfel, cu `failingDimensions` și motive închise. Dimensiunile au verdicte proprii în `composite.dimensions`, deci o dimensiune care trece rămâne vizibilă într-o încercare eșuată, iar una care eșuează nu este compensată de celelalte. Poarta campaniei (`fleetMissionGate`) acordă `PROGRESS` numai pentru `SUCCESS`.

Contractul este structural read-only: `profileWrites: 0` și `learningJobs: 0`, fără ceas, DOM, renderer, store de profil, coadă de learning sau aleator. Limitele sunt fixe: 70 de taxiuri (capacitatea 057), 1024 cereri/curse/incidente, 64 curse de confort, o fereastră de maximum 5.184.000 tick-uri (24 h la 60 Hz) și 256 de unități UTF-16 pentru identități. Nu fac parte din contract: UI-ul de provocare, XP-ul, persistarea, compoziția cu `main.ts` și captura reală de condus.

## Contract implementat în V1 (PBI 125): progres, recompense și deblocări

`src/missions/rewards.ts` cu schema `125-mission-rewards-v1` leagă campania 116, clasele de vehicule 023/057 și instrumentele într-un singur progres, dar păstrează **trei răspunsuri separate**, nu o structură opacă: `progress()` spune ce provocări sunt `LOCKED`, `AVAILABLE` sau `COMPLETED` (cu prerechizitele lipsă, încercările și următoarea încercare), `unlocks()` spune ce capabilități sunt deschise, iar `rewards()` spune ce s-a acordat o singură dată.

**Finalizarea este un fapt real 116, nu o intrare de scor.** `settle` primește o instanță 116 în starea `COMPLETED` și verifică identitatea stabilă `missionInstanceId(namespace, missionId, attempt)`, versiunea definiției din catalog și tick-ul de finalizare. Obiectivele, pragurile și evenimentele 007 rămân ale trackerului 116; modulul nu judecă din nou misiunea și nu inventează scoruri. O intrare forgeată (identitate, versiune, încercare sărită, câmp necunoscut, tick vechi) este refuzată cu eroare de contract.

**Recompensa este idempotentă prin identitate.** Cheia este identitatea 116 deja livrată, `missionRewardId(namespace, missionId, definitionVersion, rewardId)`, iar cheia de finalizare este `missionInstanceId(namespace, missionId, attempt)`. Cheia este suficientă pentru că recompensa este autorată per versiune de definiție: aceeași finalizare livrată a doua oară are aceeași identitate de finalizare și este raportată `DUPLICATE` cu motivul `COMPLETION_ALREADY_SETTLED`; o încercare nouă (reluare reală 116) este o finalizare nouă, dar găsește aceeași cheie de recompensă și este raportată `NO_REWARD` cu motivul `REWARD_ALREADY_GRANTED`, fără să plătească din nou. O versiune nouă a definiției este o recompensă nouă, cu identitate proprie, și se acordă normal. Astfel XP-ul nu poate fi fermat prin reluare, iar `MISSION_REWARD_IDENTITY` publică regula (`MISSION_VERSION`) ca panoul și documentația să nu divergă.

**Deblocările sunt aditive.** Lista de capabilități crește monoton, în ordinea campaniei, iar cele de bază sunt mereu primele: `access:drive-existing-vehicles`, `access:select-any-taxi` și câte o `vehicle-class:<id>` pentru fiecare clasă reală 023. Recompensele de tip `UNLOCK_CHALLENGE`, `UNLOCK_VEHICLE_CLASS` și `UNLOCK_ANALYSIS_TOOL` devin capabilități `CHALLENGE`, `VEHICLE_CLASS` și `ANALYSIS_TOOL`, cu proveniența misiunii, versiunii și recompensei autoare. `missionVehicleAccess` demonstrează pe flota reală 057 că după fiecare deblocare toate taxiurile rămân selectabile și toate vehiculele existente rămân conduse; `revoked` și `blockedTaxis` sunt structural zero, iar capabilitățile de bază sunt prezente la fiecare punct de control.

**Resetul de misiune** readuce doar progresul acelei misiuni în stare jucabilă: șterge înregistrările de finalizare și contorul de încercări al misiunii (deci `AVAILABLE`, `attempts: 0`, `nextAttempt: 1`), păstrează toate recompensele acordate, toate deblocările și profilurile (modulul nu are store de profil; `profileWrites: 0` structural), și numără explicit `resets`. O misiune care depindea doar de ea revine `LOCKED` până la recompletare, iar recompletarea este raportată `NO_REWARD` — nimic nu se dublează. Resetul este granița de scenariu: se folosește împreună cu `reset` al trackerului 116, exact ca în contractul 116, care păstrează și el registrele de idempotență.

Limitele sunt fixe: 32 de misiuni, 8 încercări pe misiune, 256 de finalizări, 256 de recompense, 128 de capabilități, 70 de vehicule (capacitatea 057) și 256 de unități UTF-16 pentru identități. Modulul nu are ceas, DOM, renderer, store de profil, coadă de learning sau aleator. Nu fac parte din contract: UI-ul de progres/deblocări, aplicarea XP în `PlayerProgress`, persistarea în savefile (127–136), compoziția cu `main.ts` și selectarea efectivă a taxiului în scenă (068 rămâne sursa ei).





## Contract implementat în V1 (PBI 126): panoul misiunilor și obiective live

`src/ui/mission-panel-format.ts` (`126-mission-panel-v1`) și `src/ui/mission-panel.ts` afișează obiectivele, progresul, motivele de eșec și opțiunile de reluare. Panoul este o proiecție **read-only** peste contractele livrate 116 și 125: nu recalculează progresul, nu inventează verdicte și nu ține o a doua stare de adevăr.

### De unde vine fiecare text

- Răspunsul campaniei (`LOCKED`/`AVAILABLE`/`COMPLETED`, `attempts`, `nextAttempt`, `playable`, prerechizitele lipsă, `lastCompletedTick`, `resets`, `rewardsGranted`) este copiat din `CampaignProgress` al lui 125.
- Răspunsul evaluării (obiectivele, `progress`, `target`, `satisfied`, `failureReason`, fereastra, termenul, bugetul de incidente, `incidents`, `appliedEvents`, `replayedFrom`) este copiat din cea mai recentă instanță 116 a misiunii.
- Textul autorat (titlu, etichete de obiectiv, praguri pe dificultate, recompense, politica de reluare) este copiat din **versiunea definiției pe care o raportează instanța**, deci două versiuni de definiție nu se amestecă niciodată.

### API

- `composeMissionPanelSnapshot({ sessionId, worldEpoch, tick, catalog, progress, instances })` compune snapshotul din read model-ele reale și îl trece prin parser, ca o compoziție inconsistentă să eșueze în loc să fie afișată.
- `parseMissionPanelSnapshot(value)` refuză orice abatere de la contracte: un obiectiv `satisfied` care contravine pragului, un `nextAttempt` care nu respectă regula 125, o misiune finalizată fără finalizare reală, o încercare care nu aparține misiunii sau versiunii pe care o declară, un câmp necunoscut.
- `projectMissionPanel(snapshot, { selectedMissionId? })` produce vederea deterministă: etichete, bare procentuale și semnătura stabilă folosită de `refresh()`.
- `createMissionPanel(host, { read, setSurface?, open?, idPrefix? })` montează butonul `<button type="button">Misiuni</button>` și dialogul `role="dialog"`. `read` este portul compus de host din 116/125; `setSurface` este portul 070 (`pauseFocus.setSurface('panel', open)`), apelat o dată la deschidere și o dată la închidere.
- `open`, `close`, `toggle`, `refresh`, `isOpen`, `selectMission`, `getSelectedMissionId`, `getView`, `getSnapshot`, `getTrigger`, `getPanel`, `getStats`, `dispose`.

### Stările afișate

| Stare | Sursa reală | Ce scrie panoul |
| --- | --- | --- |
| Disponibil | `CampaignMissionState: AVAILABLE`, fără instanță | eticheta de campanie, „Nicio încercare înregistrată”, obiective `Neevaluat`, reluare de la `nextAttempt` |
| În desfășurare | instanța 116 `ACTIVE` | „În desfășurare” și progresul real `n din target` |
| Finalizat cu succes | instanța 116 `COMPLETED` | „Finalizat”, „Finalizat cu succes”, obiectivele îndeplinite și recompensele acordate |
| Eșuat cu motiv | instanța 116 `FAILED` | motivul închis (`INCIDENT_BUDGET_EXCEEDED`, `EVALUATION_WINDOW_EXPIRED`, `SCENARIO_RESET`, `PLAYER_ABANDONED`), tick-ul și progresul atins |
| Blocat | `LOCKED` și prerechizitele lipsă | „Blocat”, lista prerechizitelor lipsă, „Reluare indisponibilă” |
| Inspectat | `selectMission` pe orice misiune | detaliile misiunii, fără nicio scriere în contracte |
| Reluare disponibilă | `playable` și `nextAttempt` din 125 | „Reluare disponibilă: încercarea n din 8” împreună cu politica de profil a definiției |

### Versiunea aplicată

`composeMissionPanelSnapshot` compară versiunea și titlul definiției cu `definitionVersion` raportat de 125 și refuză compunerea dacă diferă; parserul refuză și o instanță a cărei `missionVersion` nu este versiunea aplicată. Astfel, cu două versiuni în catalog, panoul arată versiunea aplicată, nu pe cea mai nouă sau pe cea mai veche, iar un catalog vechi nu poate fi afișat.

### Inspectarea unui obiectiv blocat

`selectMission(missionId)` este o schimbare pur vizuală: mută doar pointerul de selecție, re-proiectează snapshotul deja citit și nu apelează `read`, trackerul, ledgerul sau `resetMission`. Deschiderea și închiderea panoului pe o misiune blocată nu consumă încercări și nu modifică `instances`, `attempts` sau `resets`; `player progress` și recompensele rămân neschimbate.

### Reluarea

Reluarea este o **opțiune afișată**, nu o acțiune a panoului: textul spune ce încercare urmează și ce politică de profil se aplică, iar pornirea rămâne a hostului prin `MissionTracker.replay`. Un eșec nu consumă slotul de finalizare din 125 (`attempts` numără finalizările încheiate), deci panoul afișează `0 din 8 încercări încheiate` și totodată starea `FAILED` cu motivul ei.

### Accesibilitate, randare și cost

- Buton nativ cu `type="button"`, `aria-haspopup="dialog"`, `aria-expanded` sincronizat și `aria-controls`; dialogul are `role="dialog"`, `aria-modal="true"`, nume din titlu și descriere.
- Focusul intră în panou la deschidere (butonul misiunii selectate), `Tab`/`Shift+Tab` rămân în panou, `Escape` închide și focusul anterior este restaurat. Toate listeners sunt pe elemente deținute: zero listeners pe `window`/`document`, deci tastele de condus rămân ale jocului.
- Randarea este deterministă din valori (elemente HTML, bare `role="progressbar"` cu `aria-valuenow`/`aria-valuemax`), fără librării noi și fără intrare în bucla 3D. Panoul citește o dată la deschidere și doar la `refresh()` cât timp este deschis; închis, `refresh()` întoarce `SKIPPED_CLOSED` fără citire și fără randare, iar o semnătură neschimbată întoarce `SKIPPED_UNCHANGED`.
- Fiecare misiune are `data-state`, `data-attempt-state`, `data-failure` și `data-replay`, ca starea să fie verificabilă fără a citi culoarea.

Dovezile sunt în [Evidence/126-mission-panel](Evidence/126-mission-panel/README.md): 23/23 verificări deterministe, 8 misiuni parcurse, 4 motive de eșec reale și zero listeners globali.

## Contract implementat în V2 (PBI 188): provocările comportamentelor extinse

`src/missions/extended-challenges.ts` cu schema `188-extended-challenges-v1` adaugă cincisprezece provocări pentru pietoni, rutare, semnalizare, pericole și serviciu — câte trei pe fiecare familie. Catalogul 231 rămâne exact cel livrat: aceleași douăsprezece template-uri, aceleași ID-uri, aceeași versiune `231-challenge-templates-v1`. Cele două jumătăți se publică împreună prin `createComposedChallengeCatalog()` (12 + 15 = 27), fără să partajeze vreun ID.

**O provocare nu este un text și nu este un scor.** Fiecare challenge declară un `learningKey` real din tabelul celor 56 de chei V2 al lui 187, o valoare autorată `keyValue` în intervalul real al catalogului și un prag derivat din acea cheie printr-o derivare închisă: `MIN_METRES`, `MAX_METRES`, `MAX_SPEED_MPS`, `MAX_ACCEL_MPS2`, `MIN_TICKS`, `MAX_TICKS`, `MIN_RATIO`, `MIN_YIELDS_PER_OPPORTUNITY` sau `MAX_COUNT_PER_OPPORTUNITY`. Derivarea este aleasă de evaluator, iar unitatea cheii din catalog trebuie să corespundă unității faptului măsurat: `pedestrian_clearance` se compară în metri, `hazard_reaction_delay` în tick-uri, `pedestrian_yield_probability` ca număr de oportunități reale. Astfel, pragul nu poate fi „ajustat” independent de cheie, iar un evaluator nu poate măsura alt fapt decât cel guvernat de cheie.

**Evaluatorii sunt puri, peste fereastra autoritativă de 60 Hz.** Faptele vin din șase fluxuri reale: traversări de pietoni (164), decizii de rută și recuperări (181), oportunități de semnalizare (050/086), treceri de pericole (165) și opriri de serviciu (032/061). „Cedează” este ordinea a două tick-uri reale (`egoEnteredTick >= pedestrianClearedTick`), „oprește la galben” este un `stopTick` fără `crossingTick`, „așteaptă suficient” este o diferență de tick-uri, iar un câmp de tip `score` sau `yielded` trimis de apelant este refuzat ca câmp necunoscut. Nu există ceas de perete, `Math.random`, DOM, renderer sau citire de profil; verdictul raportează structural `profileWrites: 0` și `learningJobs: 0`. Deadline-ul este derivat din durata de referință și marja aleasă (`challengeDeadlineTicks`), iar bugetul de incidente este autorat; precedența verdictului este exclusionare, buget de incidente, violare dură, țintă înainte de deadline, deadline, progres.

**Explicațiile sunt legate de evenimente reale.** Fiecare challenge are un `explanation.why` (de ce contează cheia) și un `explanation.feels` (ce simte pietonul sau pasagerul), ambele legate de un eveniment de observație al evaluatorului (`PEDESTRIAN_YIELDED`, `RED_GAP`, `GREEN_RELEASE`, `PICKUP_BOARDING`, ...), niciodată de un text generic sau de un eveniment de deadline/incident.

**Prerechizitele sunt fail-closed.** `extendedChallengePrerequisitesMissing` numește explicit fiecare lipsă: `SESSION:*`, `CONTROL:MANUAL`, `VEHICLE_CLASS:*`, `CAPABILITY:*`, `LEARNING_KEY:*`, `CAMPAIGN:n`. O provocare fără cheia V2 sau fără capabilitatea familiei este exclusă cu motiv, nu generată și apoi eșuată la runtime; `planExtendedChallengeAttempt` refuză același caz cu lista de motive.

**Progresul V1 și accesul la vehicule sunt păstrate.** Testul `188 V1 progress import and vehicle access are byte-identical before and after` parcurge întreaga campanie 116 prin trackerul real, o decontează prin ledgerul 125, creditează o decontare reală în `PlayerProgress` 213 și compară instantanee înainte/după ce rulează tot catalogul extins: catalog 231 `fnv1a32:9714302b`, progres campanie `fnv1a32:7f45fc70`, deblocări `fnv1a32:0da1f677`, acces vehicule `fnv1a32:bdd636b4`, `PlayerProgress` `fnv1a32:8646bf48`, checkpoint importat `fnv1a32:92f67b0f`. Rezultatul este identic byte cu byte: 8 misiuni finalizate, 24/24 taxiuri selectabile, 64/64 vehicule conduse, zero revocări și zero taxiuri blocate. `importV1ProgressContext` citește progresul 125 fără să scrie nimic și raportează digeste stabile înainte și după.

**Limite:** 32 de provocări într-un catalog, 32 de fapte per flux, 8 încercări per challenge, identități de maximum 256 de unități UTF-16. Catalogul livrat acoperă 15 dintre cele 56 de chei V2; cele 41 rămase sunt raportate explicit de `missions:challenges-v2`. Nu fac parte din contract: programarea ofertelor, ciclul de viață al instanței, acordarea de XP și istoricul de reluare (233), UI-ul și captura de condus. Comanda deterministă este `npm run missions:challenges-v2` (cu `--check`), iar dovezile sunt în [Evidence/188-v2-challenges](Evidence/188-v2-challenges/README.md): 40/40 verificări, 15 provocări, 5 familii, 15 chei V2 acoperite și digestul `fnv1a32:a043542d`.


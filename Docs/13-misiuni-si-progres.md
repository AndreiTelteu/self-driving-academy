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

Limitele sunt fixe: 20.000 eșantioane, 64 ferestre 088, 16 segmente, 64 span-uri, identități de maximum 256 de unități UTF-16. Modulul nu are ceas de perete, DOM, renderer, store de profil sau aleator; consumă doar tick-uri autoritare și valori SI. Nu fac parte din contract: UI-ul de confort, XP-ul, persistarea, calibrarea cu pasageri reali și fidelitatea stilului.


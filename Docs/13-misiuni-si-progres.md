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


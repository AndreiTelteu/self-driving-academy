# Joacă liberă, Haos și distrugerea mediului

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Cerințe V1 acceptate; timpii și plafoanele sunt propuneri de playtest. Documentul nu declară gameplay implementat.

## Alegerea experienței

Din meniul inițial și pauză sunt disponibile „Academie” și „Joacă liberă / Haos”. Acestea sunt tipuri de sesiune, independente de AUTO, MANUAL și LEARNING. Ambele permit selectarea oricărei mașini existente, condus liber și decor destructibil. Nu există pierdere XP sau scădere de nivel în niciuna. În Academie, cursele și incidentele continuă să afecteze revenue, ratings și rezultatul misiunii.

Haos pornește o lume izolată cu sessionKind=CHAOS și un checkpoint propriu. Prima intrare copiază explicit profilul de driving ales; LEARNING și sliderele de stil modifică apoi numai copia. Campania, daily, XP și ledgerul economic din Academie sunt suspendate și nu primesc evenimente din Haos. Statisticile, recordurile și profilurile Haos se salvează separat. Haos are provocări rejucabile, fără farming de XP pentru Academie. Un stil Haos poate fi copiat în Academie printr-o acțiune explicită, validată, cu barieră learningEpoch; recordurile și ledger-ele nu se transferă.

Schimbarea sesiunii închide segmentul curent, salvează checkpointul coerent și anulează joburile lumii părăsite. Rezultatele întârziate verifică sessionId, worldEpoch și learningEpoch. Revenirea în Academie reia checkpointul său în pauză/AUTO, fără timp sau venit offline. Dacă salvarea eșuează, schimbarea nu abandonează lumea nesalvată. Nu există două lumi fizice live simultan.

## Recuperarea fără muncă de curățenie

| Acțiune | Rezultat | Ce păstrează |
| --- | --- | --- |
| R / Deblochează mașina | Repoziționează vehiculul controlat la un recoveryPoint valid și îi restabilește mobilitatea | Profilul, XP, istoricul și celelalte vehicule |
| Oraș proaspăt, păstrează stilul | Reface vehiculele, traficul și decorul din starea inițială a scenariului | Profilul activ cu dovezi, preferințele, XP/nivel, recompensele și istoricul |
| Restaurează stilul | Activează versiunea de profil aleasă, cu barieră learningEpoch | Starea fizică actuală și progresul; nu repară lumea |

R este disponibil rapid și prin HUD. Propunere: revenire la condus în cel mult două secunde după cererea validă, fără animație lungă. Nu poziționează mașina într-un collider, nu șterge incidentul și nu retrage XP. În Academie o cursă cu pasager se încheie FAILED cu motiv RECOVERED_WITH_PASSENGER, aplicând o singură dată regulile de serviciu/review. Fără pasager, se păstrează ruta dacă mai este fezabilă. În Haos, provocarea declară dacă R invalidează încercarea; reluarea este imediat disponibilă.

Resetul orașului arată un dialog scurt: cursele și provocările active se încheie, traficul și decorul se refac, stilul rămâne. La commit: închide segmentele, anulează joburile lumii vechi, incrementează worldEpoch și learningEpoch, păstrează ultima versiune activă, recreează lumea și pornește în pauză/AUTO. Curse active primesc o singură încheiere SCENARIO_RESET, fără revenue inventat; misiunile nu primesc finalizare prin reset. Istoricul economic se închide ca serie și începe un economyEpoch nou, fără ștergerea celui vechi. Calendarul daily și reward-urile deja acordate rămân; evenimentele ulterioare pot continua obiective cumulabile ale zilei. Recorderul marchează discontinuitatea, iar scenele/rutele/query-urile sunt reconstruite fără referințe stale. Resetul repetat nu dublează recompense. Eșecul pregătirii sau commitului păstrează checkpointul anterior.

## Distrugere V1 cu reacții clare

Prima versiune include garduri ușoare pe segmente, conuri, lăzi, pubele, indicatoare decorative și mobilier stradal. Impacturile pot deplasa obiectul sau îl pot trece în stare BROKEN. Clădirile structurale, carosabilul, podurile și infrastructura rutieră funcțională nu sunt destructibile în V1. Semnele decorative se disting de STOP/semafoare; regulile hărții nu dispar dacă se lovește decorul. Nu se promite demolarea integrală a orașului.

DestructibleDefinition conține objectId, archetype, initialTransform, collider, impactThreshold, responseKind, fragmentPreset și resetPolicy. Starea persistentă conține INTACT/MOVED/BROKEN și transformarea relevantă. Pragul folosește intensitatea impactului fizic calibrată, nu fiecare cadru de contact. Un eventId unic DESTRUCTIBLE_BROKEN raportează instigatorul când poate fi determinat, obiectul și intensitatea; creditul jucătorului nu este inventat pentru impacturile AI. Cascadoriile și distrugerea nu devin parametri de driving și nu sunt pretinse drept manevre învățate.

Feedbackul combină cedarea vizibilă a obiectului, sunet specific materialului, puține fragmente și un efect scurt. Intensitatea e reglabilă. Obiectele ușoare nu sunt ziduri invizibile care opresc instant mașina; pragurile și impulsul asupra vehiculului se calibrează în aceeași fizică pentru MANUAL/LEARNING/AUTO. Reacția în lanț poate produce distrugeri autentice, deduplicate, cu proveniență pentru scorul unei provocări.

Fragmentele decorative sunt plafonate și reutilizate, cu durată de viață; nu blochează traficul și nu produc scor/contacte suplimentare. Obiectele mari deplasate rămân obstacole fizice și sunt vizibile contextului autonom; invalidarea rutelor respectă contractul schedulerului. Pool-ul efectelor poate reduce prezentarea la presiune, fără să elimine evenimente sau obiecte de gameplay. Coliziunile nu sunt dependente de cameră.

Harta are o parcare pentru derapaje, o rampă accesibilă și o alee cu obiecte destructibile, cu variante de traseu și repere vizuale. Sunt locuri de joacă, fără a condiționa prima cursă sau a cere mers pe jos. Camera și resetul trebuie să permită încercări succesive confortabile.

## Salvare, replay și performanță

Checkpointul include sessionKind, worldEpoch, starea decorului și recordurile/provocările locale. Replay-ul înregistrează tranzițiile destructibile și reseturile; efectele cosmetice pot fi reconstituite determinist și nu sunt probe pentru scor. Savefile-ul complet păstrează Academie și Haos fără a aduna progresul lor.

Conform [bugetelor](25-performanta-contracte-si-benchmark.md), se măsoară impactul simultan, contactele în lanț, fragmentele, audio și 20 de reseturi/schimbări de sesiune. 203/223 fixează plafoane pentru corpuri, efecte și voci după prototip; 224 verifică workload-ul cu distrugere. După reset, numărul de corpuri/listeners/cozi revine la baseline. Simularea nu dezactivează distrugerea de gameplay pe Low.

## Acoperire și acceptare

PBI 225 implementează sesiunile, 226 recuperarea, 227 destructibilele și zonele de joacă, 228 feedbackul/replay-ul, 235 regresiile. Se verifică Academie→Haos→Academie, job întârziat, salvare eșuată, R cu/fără pasager, reset cu daily în curs, distrugere repetată, contact AI în afara camerei, reload al decorului și lipsa pierderilor XP. Playtestul verifică dacă jucătorul poate provoca un incident și începe singur o nouă încercare fără muncă de curățenie.

## Contract implementat V1 (PBI 225) — sesiuni Academie și Haos

`src/persistence/session-kinds.ts` (contract `225-session-kinds-v1`) implementează dimensiunea de sesiune fără să atingă contractele deja livrate: profilul rămâne al modulului 109, calendarul daily al lui 211/212, ledgerul XP al lui 213, recompensele de campanie ale lui 125, iar checkpointul lumii rămâne al lui 206. Modulul nou compune aceste instanțe reale și refuză explicit ce nu are voie să treacă.

**`SessionKind` este o dimensiune separată, nu un mod de control.** `ACADEMY` și `CHAOS` există lângă `AUTO`, `MANUAL` și `LEARNING`; niciun tip de sesiune nu apare în lista modurilor de control și niciun mod de control nu este filtrat de tipul sesiunii. Ambele sesiuni publică aceleași nouă capabilități (`SELECT_ANY_VEHICLE`, `FREE_DRIVE`, `AUTO_CONTROL`, `MANUAL_CONTROL`, `LEARNING`, `DESTRUCTIBLE_DECOR`, `WORLD_RESET`, `CHECKPOINT_RESTORE`, `SESSION_RECORDS`) și aceleași trei moduri de control, cu `vehicleSelection: ANY_EXISTING`; `sessionKindCapabilityParity` întoarce `identical: true` și zero diferențe.

**Copie explicită, nu referință partajată.** `copyProfileForChaos` validează checksum-ul 109 al sursei, construiește un `ProfileVersion` independent cu `profileId`/`versionId` proprii, proveniență `BASE` fără segmente sursă și checksum recalculat. `applyChaosTuning` produce o versiune derivată numai în copie: în raport, valoarea din Academie rămâne 10 după o reglare Haos la 14, iar copia rămâne 10 după ce Academia produce o versiune nouă. `progressTransferred` este literal `false`, iar `sourceSegmentsTransferred` este `0`.

**Izolarea contabilă este o poartă, nu o convenție.** `createSessionKindIsolation` primește instanțele reale 212/213/125. `fingerprint()` canonicalizează `SDA-CJSON-1` și calculează SHA-256 peste snapshotul daily, checkpointul XP și snapshotul de recompense. În Haos, toate cele șase operații (`DAILY_INGEST`, `DAILY_ADVANCE`, `XP_MISSION`, `XP_DAILY`, `XP_ACTIVE_TIME`, `CAMPAIGN_SETTLE`) răspund `ISOLATED` cu codul `SESSION_KIND_ISOLATED` înainte de a atinge proprietarul; amprenta combinată rămâne identică (`sha256:0756ca4b…3b68` înainte și după), cu `dailyRewards: 0`, `rewardGrants: 0` și `xpBalanceMicroXp: 0`. Aceeași poartă delegă în Academie: o fereastră reală de 30 s creditează 500 000 micro-XP (0,5 XP) și un settle real al misiunii `campaign-1-first-taxi` acordă recompensele autorate.

**Checkpoint propriu și o singură lume live.** Fiecare checkpoint poartă `sessionKind`, `sessionId`, `worldEpoch`, `learningEpoch`, `tick`, `generation`, `launch: PAUSED_AUTO` și un checksum SHA-256 peste documentul canonic. `createSessionKindHost` ține o singură lume vie: la schimbare închide segmentul, capturează lumea, comite un singur checkpoint, anulează joburile lumii părăsite după `sessionId`/`worldEpoch`/`learningEpoch` și eliberează inputul. Douăzeci de tranziții produc 20 de commituri (10 Academie, 10 Haos), 773 B în total (maxim 40 B per checkpoint), o singură lume vie, 2 joburi și 1 listener rezidente, o singură copie de profil și zero lumi orfane.

**Salvarea eșuată păstrează lumea.** Un commit refuzat întoarce `SAVE_FAILED` fără să avanseze epoca, fără să scrie checkpoint și fără să elibereze inputul; `failedSwitches` crește, lumea rămâne `ACADEMY`, iar reîncercarea comite și schimbă sesiunea. `reload()` și `restore(kind)` întorc exclusiv `PAUSED_AUTO`, cu inputul eliberat, zero vehicule în `MANUAL` și checkpointul verificat; un checkpoint străin sau modificat este refuzat cu `FOREIGN_CHECKPOINT`, respectiv `CHECKPOINT_INVALID`, nu potrivit după nume.

**Nicio promovare nu este posibilă.** `evaluateSessionKindTransfer` permite doar `PROFILE_COPY` Academie→Haos și `STYLE_COPY` Haos→Academie; `IMPORT`, `EXPORT`, `CHECKPOINT`, `RESTORE` și `ARCHIVE` din Haos în Academie sunt refuzate cu `PROMOTION_REFUSED`. `adoptChaosStyleIntoAcademy` validează copia și checksum-ul, produce o versiune 109 nouă și declară literal zero pentru `progress`, `dailyRewards`, `xp`, `campaignRewards`, `checkpoints`, `records` și `unlocks`; un câmp de progres strecurat în cerere este refuzat cu `PROGRESS_TRANSFER_REFUSED`, iar amprenta ledger-elor Academiei rămâne neschimbată.

**Limite declarate.** Adaptorul durabil al portului de checkpoint rămâne al stratului de compoziție; aici este livrat magazinul determinist în memorie, cu aceleași reguli închise de verificare. Memoria este raportată ca contoare de proprietate (lumi, joburi, listeners, copii, checkpointuri), nu ca heap: `totalHeapBytes` este `null` în manifestul de bugete și nu este inventat. Nivelul de validare este `targeted`: numerele de storage sunt bytes măsurați ai documentelor, nu o măsurare de hardware.

Dovezi: [Evidence/225-session-kinds](Evidence/225-session-kinds/README.md).

## Contract implementat V1 (PBI 226) — R, resetul orașului și stilul, separate

`src/persistence/world-recovery.ts` (contract `226-world-recovery-v1`) livrează coordinatorul celor trei operații. Nu este un al doilea sistem de recuperare, de checkpoint sau de profil: conduce proprietarii deja livrați prin porturi explicite, iar tipul `RecoveryVehicle` este exact `Pick<ReturnType<typeof createVehicleRecovery>, …>`, deci un alt modul nu poate satisface contractul doar prin nume.

**Trei operații, trei efecte.** `recoverVehicle` (R) mută un singur vehicul și îi redă mobilitatea; nu atinge epoci, profil, serie economică, checkpoint sau XP. `beginCityReset`/`commitCityReset` refac lumea: închid segmente și curse/provocări, invalidează joburile lumii vechi, avansează `worldEpoch`, `learningEpoch` și `economyEpoch`, păstrează profilul activ și repornesc în `PAUSED_AUTO`. `restoreStyle` activează o versiune 109 în spatele barierei `learningEpoch` și nu repară lumea. Vocabularul închis de refuz are 31 de coduri, iar testele demonstrează matricea „ce face fiecare, nu mai mult”: R nu deschide serie economică, resetul nu cheamă 030 și nu schimbă stilul, restaurarea de stil nu repornește lumea, nu închide curse și nu scrie checkpoint.

**R alege un punct validat, nu „unde era”.** Punctul vine din candidatul pe care recuperarea 030 l-a inspectat nativ ca `SAFE`: `readProjection().pointId` există doar după ce `inspectPlacement` a confirmat geometria, suportul și ocuparea. Coordinatorul cere apoi `request`/`commit` la aceeași graniță de tick și verifică rezultatul real: `status=COMPLETED`, `placement.status=SAFE`, `colliderCount=0` și starea `after` publicată. Lipsa unui candidat produce `NO_SAFE_POINT` înainte de orice scriere; un collider raportat produce `COLLIDER_PRESENT`.

**XP nu scade, iar dovada e o amprentă reală.** Înainte și după R se citesc amprentele reale ale proprietarilor 125/211/212/213/109. Raportul are `xpBeforeMicroXp=500000` și `xpAfterMicroXp=500000` (delta 0, `debits=0`), iar un port care ar retrage XP este refuzat cu `XP_WITHDRAWN`; o schimbare de daily, rewards, misiuni sau dovezi este refuzată cu `PROGRESS_MUTATED`.

**R cu pasager se încheie o singură dată.** Cursele și provocările active cu pasager la bordul vehiculului recuperat sunt închise exact o dată cu `RECOVERED_WITH_PASSENGER`, `revenue=0`, terminal. A doua apăsare găsește cursa deja terminală și nu mai închide nimic; istoricul păstrează exact o încheiere. În Haos, provocarea recuperată răspunde `AVAILABLE` la același tick, cu `ticksWaited=0`; în Academie nu se declară reluare.

**Ținta de două secunde: nivel real, fără playtest pretins.** Nu a fost executat un playtest uman, deci raportul declară `playtest: NOT_PERFORMED` și `humanPlaytestClaimed: false`; cele 2000 ms propuse rămân `NOT_MEASURED`. Obiectiv se măsoară ce este determinist: R se comite la aceeași graniță de tick (`ticksToMobility=0`) în 5 etape sincrone, fără muncă în tickul de reset (`workOnResetTick=0`). Costul real al apelului în harness-ul cu dubluri este scris separat, numai de `--cost`, în `cost.json` (500 iterații: medie 0,556 ms, p95 0,93 ms) și nu intră niciodată în `report.json`.

**Resetul: checkpoint durabil întâi, apoi lumea.** `beginCityReset` validează și pregătește fără efecte secundare (nicio închidere, niciun commit, nicio epocă avansată) și refuză cu `PROFILE_INVALID` un profil activ cu checksum 109 stricat. `commitCityReset` scrie întâi checkpointul `SCENARIO_RESET` (612 bytes canonici, checksum `sha256:`, anterior păstrat) și abia apoi închide segmentul, invalidează joburile cu `WORLD_RESET`, eliberează inputul, închide fiecare activitate o dată cu `SCENARIO_RESET` (`revenue=0`), închide seria economică și deschide `economyEpoch=2` păstrând istoricul, repornește lumea (64 corpuri, 40 vehicule de trafic, 1 listener, 2 joburi, o singură lume vie) și marchează discontinuitatea replay cu `WORLD_RESET`. Misiunile nu primesc finalizare (`missionCompletions=0`), recompensele nu se acordă (`rewardGrants=0`), iar profilul, dovezile, XP, daily, rewards și misiunile rămân identice cu amprentele de dinainte.

**Eșecul păstrează checkpointul, repetarea nu dublează nimic.** Un commit refuzat de stocare răspunde `CHECKPOINT_COMMIT_FAILED`, nu scrie checkpoint, nu avansează epoci, nu închide curse și nu repornește lumea; reîncercarea comite exact o dată. Un plan pregătit peste un set de activități schimbat este refuzat cu `PLAN_STALE`, iar un reset parțial (de exemplu lumea refuză pornirea) este raportat cu etapa exactă și se reia idempotent, fără checkpoint, serie sau închidere duplicată. Douăzeci de reseturi consecutive produc 20 de checkpointuri, 21 de serii economice, o singură închidere de scenă, o singură lume vie și valori constante pentru corpuri (64), listeners (1) și joburi (2), cu XP și profil neschimbate.

**Limite declarate.** Adaptorul durabil al checkpointului rămâne al stratului de compoziție; aici este livrat magazinul determinist în memorie. Lumea, scena, economia, replay-ul și profilul sunt porturi ale proprietarilor reali, deci raportul demonstrează contractul coordinatorului, nu o măsurare de hardware. Decorul destructibil și bugetele lui rămân la PBI 227; heap-ul exact rămâne `null`, iar memoria este raportată ca contoare de proprietate. Nivelul de validare este `targeted`.

Dovezi: [Evidence/226-world-recovery](Evidence/226-world-recovery/README.md).

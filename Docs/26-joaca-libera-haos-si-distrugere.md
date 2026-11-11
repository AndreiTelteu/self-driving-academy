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

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

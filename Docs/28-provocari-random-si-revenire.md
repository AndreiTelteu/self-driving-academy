# Provocări random și motive de revenire

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Scope V1 acceptat; duratele, recompensele și dificultatea sunt propuneri de playtest.

## Promisiunea experienței

Orașul oferă curse cu situații neobișnuite, umor actual și provocări scurte. Tonul este jucăuș, cu clienți care au scopuri recognoscibile, fără a depinde doar de slang care poate îmbătrâni. Urgența și comedia sunt exprimate prin cerere, rută, reacții și deznodământ. Nu sunt necesare social media reală, AI generativ, multiplayer sau mers pe jos.

Provocările random sunt separate de campanie și de exact trei misiuni zilnice. Apar opțional în timp ce conduci; Acceptă/Refuză nu penalizează XP, nivelul sau ratings. O setare permite oprirea ofertelor random. La acceptare, condițiile sunt afișate și rămân stabile. Propuneri: durată 1–4 minute, cel mult o provocare activă și o ofertă vizibilă, cooldown de minimum trei minute active după rezultat/refuz. Sunt valori de calibrat, nu rezultate testate.

## Catalog minim V1

| Șablon | Situație | Obiectiv observabil | Variație |
| --- | --- | --- | --- |
| Urgent la maternitate | O pasageră însărcinată cere să ajungă rapid la spital | Dropoff la zona spitalului în timpul acordat, cu buget de incidente afișat | Pickup, spital, trafic și deadline fezabil |
| SOS toaletă | Clientul caută cea mai apropiată toaletă disponibilă | Alege și atinge o zonă eligibilă înaintea deadline-ului | Mai multe benzinării/cafenele și reacții comice |
| Influencer: fără să vărs băutura | Creatorul filmează o provocare cu o băutură în mașină | Cursă cu accelerații/viraje sub pragurile de confort | Traseu și praguri |
| Influencer: un singur cadru | Clientul vrea un traseu fluid pentru un clip | Atinge checkpointuri în ordine, fără opriri peste toleranța afișată | Trasee fără constrângeri contradictorii |
| Influencer: drift de parcare | Filmare pe locul de joacă | Acumulează timp de derapaj valid într-o zonă marcată | Zonă, timp și clasă auto; Academie sau Haos |
| Influencer: demolare în 90 secunde | Clip absurd printre obstacole | Doboară N obiecte eligibile distincte | Număr și traseu; exclusiv Haos |
| Tortul care nu trebuie să zboare | Livrare pentru o petrecere | Ajungi înaintea deadline-ului cu buget de confort afișat | Distanță și praguri |
| Am uitat ceva! | Clientul își schimbă destinația o singură dată, conform premisei afișate | Vizitează două puncte în ordinea cerută | Perechi de zone |
| Ultimul minut la aeroport | Clientul este foarte grăbit | Cursă rapidă la terminalul fictiv | Variante de trafic și rută |
| Turul orașului pe dos | Clientul vrea repere într-o ordine ciudată | Atinge 3 checkpointuri accesibile | Ordine și repere |
| Valet cu stil | Parcarea trebuie să fie precisă | Oprire în zonă la orientarea/viteza cerute | Loc și toleranță |
| Orașul mă copiază | Creatorul vrea să observe o schimbare reală de stil | LEARNING eligibil, publicare și observarea efectului suportat | Cheie deja implementată și context disponibil |

„Urgent la maternitate” are final vizual/textual „Ai ajuns la spital”; eșecul produce o reluare, fără simularea nașterii sau consecințe medicale grafice. Nu presupune pietoni V2. „Filmarea” este o premisă și poate oferi replay intern; nu publică sau încarcă video extern. Obiectivele de drift/distrugere sunt abilități ale jucătorului, nu comportamente pe care AI-ul pretinde să le învețe.

Obiectivele noi au evaluator explicit: checkpoint crossing, dwell/heading pentru parcare, confort din metricile existente, distrugeri deduplicate și drift bazat pe viteză minimă plus unghi între orientarea și viteza mașinii, în zona cerută. Pragurile de drift și toleranțele sunt versionate; rotirea pe loc sau impulsul de coliziune nu acumulează drift. Lipsa evaluatorului dezactivează șablonul, nu produce o finalizare pe text HUD.

## Directorul și lifecycle-ul

ChallengeTemplate are templateId/version, family, sessionKinds, prerequisites, zones, evaluatorId, parameterRanges, dialogueKeys, feasibilityRules, replayRules și rewardPolicy. ChallengeInstance are instanceId, sessionId, worldEpoch, seed, templateVersion, objectiveSnapshot, status, startedTick, deadlineTick, eventCursor și rewardId. Stări: OFFERED → ACTIVE → COMPLETED/FAILED/CANCELLED, cu DECLINED/EXPIRED pentru oferte. Timpul obiectivului este simulat și se oprește în pauză; daily folosește în continuare ziua reală.

Directorul folosește seed/RNG salvat și verifică traseul, zonele, vehiculul, evaluatorul și timpul fezabil înaintea ofertei. Propunere: deadline-ul se bazează pe durata de referință plus marjă, testată la dificultate; nu cere încălcarea unor reguli și respectarea lor simultan. Istoricul recent evită ultimele trei șabloane dacă există alternative. Catalogul mic folosește fallback realizabil fără buclă de rerandomizare. Nu schimbă profilul pentru a fabrica dificultatea.

Ofertele apar când jucătorul nu are pasager/cursă manuală activă, misiune incompatibilă sau transfer de sesiune în curs. Acceptarea rezervă taxiul și suspendă dispecerizarea lui pentru cursa specială, folosind același lifecycle de pickup/dropoff. Directorul nu întrerupe arbitrar clientul existent. Schimbarea mașinii nu dublează instanța sau recompensa; o provocare legată de un taxi rămâne legată de acel taxi. R, resetul orașului și ieșirea au rezultate explicite, iar anularea nu scade XP. Reload păstrează instanța, obiectivele și timpul simulat rămas; nu rerandomizează oferta sau recompensa.

## Recompense și revenire

În Academie, prima finalizare a unei provocări cu identitate stabilă acordă recompensa XP declarată, idempotent. Reluările aceleiași instanțe urmăresc recordul, fără XP repetat. Pentru a limita grindul, rewardKey include familia și data daily pentru ofertele random: prima reușită a unei familii în ziua respectivă poate acorda XP, celelalte sunt marcate din ofertă „Record personal, fără XP suplimentar”. Calendarul, highestObservedDate și regulile clock rollback/timezone din modulul 23 se aplică acestor credite, fără reactivarea familiilor recompensate. În Haos se acordă numai scor/record local. Replay-ul și rerulările nu acordă recompense.

Cele trei daily au varietate pe familii: îndemânare/serviciu, experiment suportat și provocare neobișnuită, când capabilitățile permit; cel puțin una rămâne MANUAL fără learning. Obiectivele de distrugere Haos nu sunt cerute pentru XP/daily Academie. Seturile zilnice nu sunt rerandomizate de o ofertă random. Nu există pierdere de XP pentru zile ratate sau streak obligatoriu.

Un meniu de provocări rejucabile păstrează șabloanele descoperite și recordurile personale; reluarea pornește o încercare cu identitate nouă, dar aceeași politică de recompensă. Scorul rapid este local, fără leaderboard competitiv pretins. Rezumatul final arată rezultatul, un record nou și reacția clientului, cu „Mai încearcă” și „Continuă condusul”. Nu blochează revenirea la joc cu grafice obligatorii. Nu se adaugă în această revizie un sistem separat de cosmetice sau streak-uri.

## Acoperire și verificare

231 livrează catalogul și evaluatorii, 232 directorul și integrarea curselor, 233 UI/reluare/recompense și conectarea la daily; 235 validează retenția ca ipoteză prin playtest, fără procente inventate. Se verifică seed/reload, catalog insuficient, scenariu fără spital/toaletă, traseu imposibil, conflict cu pasager existent, refuz, deadline în pauză, reset, R, schimbare de mașină, reward duplicat și izolarea Haos. Performanța măsoară directorul, query-urile, checkpointurile și istoric plafonat. Playtestul consemnează dacă participanții cer spontan încă o încercare și ce provocări se repetă prea repede.

Generatorul zilnic din [modulul 23](23-misiuni-zilnice-si-experienta.md) acceptă deja familii de șabloane versionate (`parseDailyTemplateCatalog`), cu obiective din vocabularul 116 și parametri variați. Catalogul de provocări din acest modul se conectează în 233 printr-un catalog versionat propriu; până atunci, setul de trei misiuni folosește numai șabloane cu evaluator livrat, iar un șablon fără evaluator este exclus, nu finalizat pe text HUD.

## Contract implementat în V1 (PBI 231): catalogul și evaluatorii

`src/missions/challenges.ts` livrează catalogul `231-challenge-templates-v1` (schema `231-challenge-catalog-v1`), evaluatorii `231-challenge-evaluators-v1` și snapshotul de prerechizite `231-challenge-capabilities-v1`. Modulul nu conține director, oferte, lifecycle de instanță, UI sau credit XP: acelea rămân la 232/233. Nu citește ceas de perete, `Math.random`, DOM, renderer sau profil; timpul este fereastra explicită de tick-uri autoritare la 60 Hz.

**Cele 12 șabloane și familiile lor.** Fiecare are `templateId` stabil și `version` explicit, iar o revizie autorată nouă este o versiune nouă, nu o editare tăcută. Familiile acoperă precizie (`challenge-influencer-single-frame`, `challenge-influencer-parking-drift`, `challenge-valet-with-style`), disciplină (`challenge-influencer-no-spill`, `challenge-cake-delivery`), explorare (`challenge-toilet-sos`, `challenge-forgot-something`, `challenge-city-tour-backwards`), distrugere controlată (`challenge-influencer-demolition`), eficiență (`challenge-maternity-run`, `challenge-last-minute-airport`) și experiment (`challenge-city-copies-me`). Sunt exact situațiile din tabelul „Catalog minim V1”, nu douăsprezece variații de titlu: titlurile sunt unice, iar validatorul respinge două șabloane cu aceeași semnătură de obiectiv.

**Obiectiv calculabil.** Fiecare șablon declară un `objectiveKind` din vocabularul închis (`CHECKPOINTS`, `ZONE_ORDER`, `TIMED_DROPOFF`, `COMFORT`, `PARKING`, `DRIFT`, `DISTRUCTION`, `LEARNING`) și un evaluator pur peste fapte reale: traversări de checkpoint, intrări în zone, dropoff, eșantioane de confort 085/139, oprire cu orientare, eșantioane de drift, obiecte distruse distincte și activarea/observarea unei chei LEARNING suportate. `planChallengeAttempt` derivă dintr-un seed explicit ținta, marja de deadline, bugetul de incidente, zonele concrete și pragurile versiunii; `evaluateChallenge` întoarce un verdict înghețat, cu progres, valoare măsurată, motiv închis și amprentă deterministă. Aceleași date, în orice ordine a listelor, produc același verdict și aceeași amprentă.

**Prerechizite realizabile.** Un șablon declară sesiunile, modul de control, clasele de vehicul, tipurile de zonă (cu numărul concret de zone), capabilitățile și cheile LEARNING de care are nevoie, plus progresul de campanie. `challengePrerequisitesMissing` numește fiecare lipsă (`SESSION:`, `CONTROL:`, `VEHICLE_CLASS:`, `ZONE:`, `CAPABILITY:`, `LEARNING_KEY:`, `CAMPAIGN:`), iar `eligibleChallengeTemplates` exclude șablonul înainte de ofertă. Vocabularul de capabilități este închis și nu conține pietoni V2 sau mers V3; un șablon care le-ar cere este refuzat explicit.

**Validatorul.** `parseChallengeTemplate` / `parseChallengeTemplateCatalog` resping: evaluator necunoscut sau nepotrivit obiectivului, zonă de un tip pe care evaluatorul nu-l acceptă, plan de rută lipsă sau prea scurt, țintă mai mare decât zonele declarate, deadline peste fereastra de 1–4 minute, praguri de confort mai permisive decât sursa 139, praguri de drift sub podeaua anti-exploatare, reguli R/reluare care nu păstrează identitatea nouă și absența XP la reluare, dialog legat de un eveniment inexistent sau cu promisiune de publicare externă, capabilități de pietoni/mers, demolarea în Academie, un catalog sub 12 șabloane ori fără toate cele șase familii, și două șabloane cu același obiectiv.

**Driftul.** Un eșantion contează numai în zona de drift declarată, la viteza minimă și unghiul de derapaj minim, și numai dacă tick-ul respectiv nu are impuls de coliziune. Rotirea pe loc (viteză sub prag) și impulsul de coliziune sunt raportate separat și nu acumulează drift; pragurile minime sunt impuse de validator, deci nu pot fi slăbite dintr-un catalog extern.

**Distrugerea și Haos.** `challenge-influencer-demolition` este singurul șablon cu sesiunea `CHAOS`, cere capabilitatea `DESTRUCTIBLE_DECOR`, numără obiecte distincte în aleea de demolare și nu acordă XP de Academie. Evaluat în Academie, verdictul este `EXCLUDED` cu motivul `SESSION_NOT_ALLOWED`, nu un eșec de gameplay. Scorul din Haos rămâne record local.

**Dialog și filmare.** Fiecare șablon are patru replici (ofertă, progres, succes, eșec), iar replicile de progres/succes/eșec sunt legate de evenimente reale de observare (`CHECKPOINT_REACHED`, `ZONE_ENTERED`, `DROPOFF`, `FULL_STOP`, `DRIFT_SAMPLE`, `DESTRUCTIBLE_BROKEN`, `PROFILE_ACTIVATE`, `COMFORT_SAMPLE`, `DEADLINE_EXPIRED`, `INCIDENT`). Premisa de filmare a celor patru șabloane „influencer” este `INTERNAL_REPLAY`, iar `socialUpload` este literal `false`; validatorul respinge orice text care promite upload sau o rețea socială.

**Compatibilitatea cu 211 și ce rămâne pentru 233.** `challengeDailyFamilies()` expune un catalog `231-challenge-daily-bridge-v1` doar pentru cele trei șabloane care au un obiectiv 116 real (`DROPOFFS` pentru urgența la maternitate și aeroport, `LEARNING_ACTIVATIONS` pentru „Orașul mă copiază”). Generatorul zilnic 211 îl acceptă ca intrare externă și produce în continuare trei misiuni; catalogul livrat 211 rămâne `211-daily-templates-v1` cu șase familii. Restul de nouă șabloane au evaluatori proprii și se conectează în 233. Tot pentru 233 rămân: programarea ofertelor și cooldown-ul, lifecycle-ul instanței și reload-ul, creditul XP prin ledgerul real, istoricul de reluări/recorduri și panoul de provocări. Costul este raportat structural (evaluări pure, fără ceas de perete): vezi [dovezile 231](Evidence/231-challenge-catalog/README.md).


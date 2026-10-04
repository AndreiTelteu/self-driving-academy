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

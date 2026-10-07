# Validare și release

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Criterii de acceptare pentru prima versiune

| Arie | Criteriu verificabil |
| --- | --- |
| Acces la vehicule | Fiecare mașină din hartă poate fi preluată; fiecare taxi poate fi selectat din listă fără mutarea fizică a vehiculului |
| Flotă | 20–30 de taxiuri simulează curse, alături de trafic obișnuit; indicatorii includ și vehiculele din afara camerei |
| Control | Hotkey-ul schimbă autoritatea la un tick clar; maximum un vehicul este în MANUAL sau LEARNING; HUD și simularea raportează același mod |
| Curse | O cursă poate fi făcută manual integral; pickup și dropoff folosesc aceleași reguli pentru manual și autonom |
| Intervenții scurte | Un segment LEARNING valid de câteva străzi poate actualiza parametrii observați fără a finaliza cursa |
| Învățare | Fiecare dintre cei 24 de parametri M are estimator sau calibrare identificabilă, scenariu și test propriu; cheile fără dovezi rămân neschimbate |
| Greșeli | Demonstrații repetate de trecere pe roșu sau STOP incomplet modifică politica în sensul demonstrat, fără înlocuire automată cu un profil regulamentar |
| Publicare | Toate taxiurile și civilele adoptă aceeași versiune la tick-ul de activare; nicio activare dublă și nicio suprascriere de către un rezultat vechi |
| Fizică | Manual și autonom folosesc același vehicul și controller; frânarea, aderența și coliziunile trec scenele de calibrare |
| Explicații | Jucătorul vede deltele, dovezile și parametrii neobservați; UI nu afirmă învățarea unui comportament nereprezentabil |
| Progres | Misiunile pot fi reluate, iar recompensele nu se acordă de două ori; progresul este salvat |
| Persistență | Export/import și restaurarea profilului păstrează valorile; un import invalid nu corupe profilul activ |
| Comparații | Două profiluri pot fi comparate din același scenariu cu expuneri și seed-uri afișate |
| Compatibilitate | WebGPU și fallbackul stabilit trec aceeași suită de gameplay; limitările grafice sunt declarate |
| Performanță | Benchmarkul trece țintele pe hardware-ul de referință agreat; până atunci performanța rămâne nevalidată |

Cerința de 24 de parametri învățabili este o țintă de release propusă. Dacă un estimator nu poate separa efectele unui parametru, acesta rămâne neînvățabil, iar milestone-ul nu este declarat încheiat până la rezolvarea sau renegocierea explicită a criteriului.

## Strategia de validare

Testele de unitate acoperă conversii și unități, evaluarea oportunităților, constrângeri de schemă, estimatori și identitatea profilurilor. Testele de integrare acoperă schimbarea vehiculului, segmentele, cursele, activarea în flotă, salvarea și importul. Testele de scenariu verifică comportamentul rezultat, nu doar existența unei valori în JSON.

Cazurile de învățare obligatorii includ lipsa contextului STOP, verde blocat de lider, stiluri de urmărire la o singură viteză versus viteze variate, coliziune în timpul frânării, schimbare de clasă de vehicul, intervenție foarte scurtă, schimbări contradictorii repetate și rezultate de worker întârziate.

Pentru validarea inversă generăm demonstrații din profiluri cunoscute și verificăm dacă estimatorul recuperează tendințele și comportamentul în scenarii independente. Parametrii neidentificabili nu primesc arbitrar o toleranță aparent satisfăcătoare. Testele cu jucători reali verifică și senzația de condus, explicațiile și faptul că flota este percepută ca având același stil.

Scenariile de trafic includ semafor cu prim vehicul și coadă, STOP liber și aglomerat, conflict cu prioritate, urmărire, schimbare de bandă, drum blocat, vehicul avariat și reintrare după manual. Profilurile de probă includ prudent, impulsiv, neregulamentar și mixt; acestea sunt configurații de test, nu personalități ascunse ale taxiurilor.

QA vizual verifică lizibilitatea HUD la 1280×720 și 1920×1080, panoul flotei cu 30 de taxiuri, contrastul, remaparea tastelor, modul de pauză, focusul, mesajele de învățare și recuperarea după pierderea GPU. Benchmarkul include sesiuni de cel puțin 60 de minute pentru stabilitatea memoriei și a flotei.

În această etapă se verifică documentația și consistența catalogului. Testele de joc de mai sus vor fi executate după implementare; documentul nu susține că ele au trecut deja.

## Gates pentru extindere

V2 cere 80 de chei cu utilizare reală în politică, estimare în contexte identificabile și validare independentă; suportul parțial nu este ascuns. V3 cere intrare/ieșire, mers, camera, arbitraj de input, segmente de driving și migrarea salvărilor verificate împreună cu regresiile V1/V2.

CI rulează verificările statice, scenariile și buildul reproductibil. Livrarea este un artefact static compatibil cu HTTPS și încărcarea asseturilor/WASM. Un gate închis produce un PBI Done numai după verificări și mutarea efectivă în coloana Done.

## Acceptare V1 pentru revizia 0.3

- AUTO/MANUAL/LEARNING sunt distincte în UI și simulare; MANUAL nu modifică parametrii sau dovezile profilului. Se verifică toate cele șase tranziții și selectarea fără preluare implicită.
- Civilii adoptă stilul comun, inclusiv vehiculele create după activare, fără schimbarea rutelor. Indicatorii comerciali însumează doar taxiurile.
- Restore/import/profil nou invalidează joburile din learningEpoch anterior; importul invalid păstrează coada curentă.
- Restartul păstrează lumea și ledger-ele din checkpoint; sesiunea pornește în pauză/AUTO. Două taburi nu au simultan drept de scriere.
- Replay-ul redă un incident exclusiv AUTO cu vehicule nevizibile la momentul înregistrării; seek nu acordă venit, review, reward sau XP.
- Butonul KPIs și K deschid grafice istorice de revenue lunar, ratings 0–5, curse/zi și review-uri/zi, cu sume, număr de observații și medii ponderate corect. Lunile parțiale și proiecțiile sunt etichetate.
- Stilul eficient și confortabil poate îmbunătăți revenue și ratings în condiții comparabile; un scenariu agresiv poate crește revenue și reduce ratings. Coliziunile rămân în evaluarea pasagerului.
- Exact trei misiuni noi sunt create per zi calendaristică; refresh/reload nu le rerandomizează. Schimbarea de zi, fusul orar și clock rollback nu dublează recompensele.
- Misiunile, provocările eligibile și timpul activ acordă credite XP o singură dată. Scăderea revenue/ratings, accidentele și eșecul/refuzul obiectivelor nu retrag XP sau nivel în MANUAL/LEARNING/AUTO; nu există evaluator de penalizare.
- PBI 216 verifică împreună contractele 205–215 și 217 înaintea gate-ului 162. Gates V2/V3 reexecută aceste regresii.

Verificarea planului folosește PBI/Validate-Plan.ps1: board, linkuri locale, index, catalog, matrice și metadate per parametru. Verificarea planului nu reprezintă dovadă de gameplay implementat.

## Gates de performanță ale reviziei 0.4

Se execută [protocolul modulului 25](25-performanta-contracte-si-benchmark.md): preset/rezoluție fixate, hardware real, cinci repetări, percentile, input, debit de simulare, cold/first-use și lucrul de fundal concomitent. 220 condiționează campania/asseturile finale; 224 condiționează livrarea. Testele headless verifică algoritmi și capacități, fără a demonstra FPS pe GPU integrat. Lipsa raportului hardware menține gate-ul nevalidat.

Soak-ul are minimum 60 minute și 20 de cicluri de lifecycle, cu retenție, cozi și resurse la platou. Se probează și throttlingul termic al laptopului. Suprasarcina 30/80 este separată de workload-ul normal 30/40; o pauză de suprasarcină în workload normal este eșec de buget, nu timp eliminat din benchmark. PerformanceReport identifică aceeași revizie ca artefactul de release.

## Acceptare V1 pentru revizia 0.5

- Academie/Haos sunt sesiuni izolate, cu profiluri/recorduri proprii; tranziția/reload nu transferă accidental XP, daily, ledger sau rezultate worker.
- R deblochează rapid mașina; „Oraș proaspăt, păstrează stilul” reconstruiește traficul/decorul fără pierdere de progres, joburi stale sau recompense duplicate.
- Decorul destructibil cedează și are sunet/fragmente plafonate; coliziunile AI în afara camerei și replay-ul păstrează rezultatul corect. Zona de rampă/drift/demolare este accesibilă.
- Popup-ul separă preferințele de control de editarea stilului; aplicarea MANUAL_TUNING este restaurabilă, nu inventează dovezi și nu îndeplinește misiuni LEARNING.
- HUD simplu, camera din spate/first-person, privirea/recenter și reglajele de confort trec verificarea cu tastatură și viewport mic.
- Catalogul minim de provocări, ofertele realizabile, refuzul, cooldown-ul, reluarea și recompensele respectă modulul 28; daily rămâne exact trei.
- Savefile-ul complet face roundtrip; editarea fără recalcularea checksumului este respinsă înaintea migrării/commitului și păstrează sesiunea curentă.
- 235 verifică împreună aceste cerințe după 216 și gate-ul performant 224; 162 nu se închide fără 235. Se consemnează playtesturi reale pentru control, învățare vizibilă, distrugere și dorința de a relua o provocare, fără estimări de retenție prezentate ca rezultate.

## Validare eficientă — 8 octombrie 2026

[Politica de validare](validation-policy.md) diferențiază verificările locale de gate-urile full/soak și permite corectitudinea izolată în paralel. Harness-ul comun are preflight export, profil DEV 3 × 2 × (15 s + 30 s), salvare automată fără suprascriere și checkpoint-uri imutabile de perechi. După preflight, folosește butonul Dezvoltare pentru cost local; proba completă rămâne pentru gate-uri. Pentru reluare, păstrează ID-ul sesiunii și confirmă condițiile comparabile; perechea întreruptă reîncepe integral. DEV/SMOKE nu certifică hardware/release. Aceste instrumente noi necesită propria verificare browser înainte de folosirea lor ca dovadă hardware; nu sunt prezentate ca probe executate.

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

## Regresia V1 pentru moduri, KPI-uri, daily și XP (PBI 216)

Regresia 216 este o matrice executată, nu o listă de promisiuni. `npm run qa:v1-regression` rulează împreună contractele 205–217 pe fixture-uri deterministe și scrie un transcript cu scenariu, comandă, numere reale și verdict; `--check` compară transcriptul cu cel comis, iar `--cost` măsoară separat costul real al căii de tick. Fiecare rând are o polaritate (`POSITIVE`, `NEGATIVE`, `COST`, `DOCUMENT`), iar un scenariu neexecutat este `NOT_RUN` cu motiv, niciodată bifat.

**Ce acoperă.** Cele trei moduri pe taxi și civil (șase tranziții fiecare), fizica păstrată, cinci defecte injectate, propagarea taxi/civil 208, bariera 205 pozitiv și negativ; KPI 209/214 în ambele direcții, graficele 210 pe 12 luni și pop-up-ul cu zero scanări, daily 211/212 pozitiv și negativ, XP 213 cu fracții de minut și ferestre excluse; checkpoint 206 și replay 207/141 fără scrieri; proba combinată learning + recorder + autosave + KPI + XP pe aceeași sesiune de condus; graful boardului cu gate-ul 235 al extensiilor 225–234.

**XP fără pierderi.** Invarianta este dovedită prin amprente înainte/după pe cele cinci căi de scădere (KPI, incident, misiune eșuată, recompensă refuzată, zi ratată), nu prin absența erorilor. Amprenta acoperă soldul, nivelul, intrările și cursorul de contorizare; contoarele de refuz sunt intenționat în afara ei, pentru că un duplicat refuzat crește un contor fără să plătească sau să scadă XP.

**Costuri.** Bugetele din [manifest](performance-budgets.json) sunt comparate direct (recorder, checkpoint, progres, bundle economic, generații de checkpoint). Unde manifestul nu are buget — frame p95, punctele graficului KPI, bundle-ul 215 — lacuna este raportată, fără prag inventat. Nivelul este `targeted`: suita nu are renderer, GPU, input uman sau hardware de referință, deci playtestul și frame-ul rămân `NOT_RUN` și sunt preluate de gate-urile 220/224/235.

Dovezile reale, cu numerele, comenzile și limitările, sunt în [Evidence/216-v1-regression](Evidence/216-v1-regression/README.md).

## Suita de scenarii V1 (PBI 151)

Suita 151 leagă autonomia, cursele, învățarea și campania într-un singur transcript reproductibil. `npm run scenarios:v1` rulează cele patru familii pe contractele livrate, cu seed fix 151, fără ceas de perete și fără aleator în rezultat; `--check` compară `report.json` și `report.md` cu fișierele comise, iar două rulări independente produc același JSON (amprentă SHA-256 în raport).

**Familii și contracte.** `AUTONOMY` evaluează politica 050 pe observații authoreză (întârzierea de pornire la verde, borna exactă a întârzierii și refuzul unei observații mai vechi de 6 tick-uri). `RIDES` conduce ciclul de viață 061 pe flota reală 057/059/060: cursă completă, eveniment terminal rejucat și dropoff ilegal înainte de pickup. `LEARNING` aplică pasul 101 peste poarta 100: o singură demonstrație, șaisprezece episoade consistente și o contradicție severă care ține profilul neschimbat. `CAMPAIGN` folosește tracker-ul real 116 și ledgerul 125: prima misiune, deblocarea exactă a următoarei verigi și refuzul unei finalizări duplicate.

**Toleranțe explicite.** Fiecare comparație numerică are o regulă declarată: `EXACT` pentru valori de contract (stări, motive, contoare, listă de deblocări), `ABSOLUTE` pentru mărimi cu precizie publicată (1e-12 s sau m la ecouri de profil, 1e-4 m/s și 1e-4 ratio la pasul de învățare, 1e-6 episoade la expunere) și `RELATIVE` pentru rapoarte. Nu există „aprox egal”: o valoare numerică fără toleranță declarată nu poate intra în transcript.

**Cazuri negative.** Fiecare familie are cel puțin un refuz explicit: observație de semafor expirată (`UNKNOWN`/`UNAVAILABLE`, fără fapt inventat), tranziție de cursă ilegală (stare și claim neschimbate), contradicție de dovezi (`HELD_CONTRADICTION`, valoare neschimbată) și finalizare de misiune duplicată (`DUPLICATE`, zero XP). Un scenariu care cere browser real este raportat `NOT_RUN` cu motiv și nu este numărat ca trecut.

**Reutilizare.** Matricea 216 rămâne sursa pentru daily 211/212 și XP 213 (rândurile B5–B8, amprenta XP fără pierderi, graful boardului), iar suita 056 rămâne sursa pentru matricea roșu/verde și cele 10 refuzuri de autonomie. 151 le citează ca dovadă comisă și adaugă doar cazurile care lipsesc acolo, fără a le reexecuta sub alt nume.

Dovezile, cu numerele reale per scenariu, sunt în [Evidence/151-scenario-suite](Evidence/151-scenario-suite/README.md).

## Testul integral de sesiune și progres (PBI 152)

Testul 152 parcurge o singură sesiune cap-coadă, pe contractele livrate 057/058/059/060/061/066/067/068, 109/110/112, 209, 211/212/213, 133 și 215. `npm run e2e:session` rulează cele unsprezece etape, scrie transcriptul și iese cu cod diferit de zero dacă o verificare pică; `--check` compară `report.json` și `report.md` cu fișierele comise, iar `--browser` este proba separată în Chromium (necesită Playwright prin `PLAYWRIGHT_MODULE`).

**Ce acoperă.** Un profil nou cu o singură versiune de bază pe 30 de taxiuri și 40 de civile; AUTO fără scaun de jucător; cursa reală a dispeceratului 060 și a FSM-ului 061; preluarea MANUAL și deschiderea intervenției 005; schimbarea vehiculului la mijlocul cursei, care închide explicit segmentul cu `VEHICLE_SWITCH` fără să atingă cursa sau assignment-ul; terminarea cursei cu o singură eliberare a taxiului; LEARNING prin pipeline-ul 112 și activarea aceleiași versiuni pe taxiuri și civile; KPI 209 cu settlement și recenzie reală; daily 211/212 cu exact trei misiuni și o recompensă; XP 213 cu misiune, daily și timp activ; exportul 133 plus bundle-ul 215; restartul care re-citește textele și compară amprentele.

**Cum se dovedește restartul.** Cele două documente sunt serializate ca text, apoi re-citite dintr-o stare nouă. Soldul XP (200,5), nivelul (2), cele trei intrări, misiunea creditată și ziua daily sunt identice; setul daily (3 misiuni, 1 recompensă), KPI (551 unități minore, 1 recenzie, notă 5) și versiunea activă a flotei (`segment-152-learning~112`, 30 taxiuri + 40 civile) au aceleași amprente SHA-256. Checksum-urile 133/215 sunt recalculate la citire, iar un fișier modificat este refuzat.

**Cum se dovedește schimbarea vehiculului.** În mijlocul cursei, când pasagerul este la bord (`TO_DROPOFF`), camera trece de pe taxiul cursei pe alt taxi. Contractul 068 eliberează scaunul MANUAL și cere închiderea segmentului 005 cu motivul `VEHICLE_SWITCH`; cursa rămâne activă, cu același `rideId`, același `taxiId`, același assignment 060 și aceleași trei tranziții, iar ulterior se închide normal. Istoricul intervenției păstrează ambele segmente (MANUAL și LEARNING), fără curse orfane și fără istoric trunchiat.

**Browser.** Transcriptul determinist nu pornește un browser și declară explicit partea aceasta. Proba `npm run e2e:session -- --browser` a rulat în Chromium 156 pe un context nou, cu stocare goală: a parcurs aceleași 104 verificări, a scris documentele în IndexedDB, a reîncărcat pagina și a re-citit documentele; toate cele opt comparații de restart au trecut, fără erori de pagină. Fără Playwright, comanda raportează `SKIP`, nu un succes.

Dovezile, cu numerele reale, comenzile și limitările, sunt în [Evidence/152-e2e-session](Evidence/152-e2e-session/README.md).

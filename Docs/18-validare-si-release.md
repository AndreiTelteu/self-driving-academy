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

## QA vizual și accesibilitate (PBI 153)

PBI 153 verifică HUD-ul, panourile, notificările și suprafețele camerei pe componentele reale din
`src/ui`, cu CSS-ul real, într-un browser real. `npm run qa:ui` derivă un raport determinist din
măsurătorile comise (`report.json`, `report.md`), `--check` compară fișierele, `--browser` reface
capturile în Chromium, iar `--strict` transformă un finding CONTRACT în exit code 1.

**Matricea.** Cinci viewport-uri: 1280×720 și 1920×1080 (țintele PC), 150% pe 1280×720 (853×480, cazul
documentat de 084), 200% pe 1920×1080 (960×540) și 200% pe 1280×720 (640×360, marcat `STRESS` pentru că
iese din banda declarată). Opt scenarii reale: HUD + minimapă + flotă cu 30 de taxiuri + trei notificări,
lista flotei deschisă, notificările, profilul, tabloul orașului, setările (unități, cameră, confort),
reglajele camerei (229) și pop-up-ul KPI (210). Fiecare captură are 14 verificări: maparea
viewport/regiune, text de minimum 12 px cu line-height 1,4, text netăiat, text nesuprapus, contrast
WCAG AA pe perechile compuse, controale cu dreptunghi și hit-test, controale esențiale, fără suprapunere
critică, politica de scroll, suprafață în viewport, ordine de tab, focus vizibil de 3 px și Escape.

**Rezultatul primei rulări.** 22 de capturi, 308 verificări, 300 trecute, 8 eșuate, 8 findings; 9 538 de
noduri text măsurate pentru contrast, cu zero abateri de la AA, și 874 de controale măsurate. Tastatura
trece în toate scenariile: Tab rămâne în dialog, Escape închide și readuce focusul. La 150% și la 200% pe
ținta full-HD layoutul rămâne întreg.

**Defecte raportate, nu reparate aici.** 153 nu are voie să modifice `src/`, deci abaterile reale sunt
findings cu captură și pași de reproducere: la 640×360 (200% pe 720p) coloana flotei începe la y=380 și
iese complet sub un viewport de 360 px, iar notificările depășesc cu 24 px; reglajele camerei (229) au
text de 11,52 px, iar pop-up-ul KPI (210) are etichete de 11 px și valoarea „fără review-uri” (36 px de
text într-o coloană de 14 px) care se suprapune peste grupurile vecine.

**Limite.** Chromium headless fără GPU: capturile dovedesc layout, text, focus și scroll, nu FPS, senzația
de condus sau camera 3D randată. Zoomul este reprodus prin viewport-ul CSS efectiv, iar `forced-colors`,
cititoarele de ecran și inputul fizic uman rămân în afara scope-ului; gate-ul integrat rămâne 235.

Dovezile, cu rezoluțiile, zoomurile, verdictul per componentă și cele 22 de capturi, sunt în
[Evidence/153-ui-qa](Evidence/153-ui-qa/README.md).

## Matricea de compatibilitate WebGPU și WebGL 2 (PBI 154)

PBI 154 verifică backendul efectiv pe combinațiile browser/OS/GPU de referință și garantează că un
browser fără suport nu produce ecran gol. `npm run qa:compat` derivă un raport determinist din
observațiile reale comise (`report.json`, `report.md`), `--check` compară fișierele, iar `--browser`
reface probele în Chromium (necesită Playwright prin `PLAYWRIGHT_MODULE`). Backendul efectiv este
raportat de `rendererKind` din contractele `src/rendering`, nu dedus din user-agent; combinația
browser/OS/GPU vine din versiunea Chromium, `navigator.userAgent` și driverul expus de
`navigator.gpu` / `WEBGL_debug_renderer_info` (`unknown` când driverul îl ascunde).

**Matricea rulată.** Nouă combinații reale, nouă PASS: intrarea de producție `src/main.ts` pe Chromium
156 headed cu GPU AMD Radeon Graphics (RDNA-2) alege **WebGPU**; aceeași intrare cu `navigator.gpu`
eliminat înainte de module alege **WebGL 2** (ANGLE/Direct3D11); Chromium headless alege **WebGL 2** pe
**SwiftShader**; cu WebGPU și WebGL 2 lipsă, și separat cu doar WebGL 1, aplicația afișează mesajul
explicit „Randarea nu a pornit. WebGPU și WebGL 2 nu sunt disponibile. Poți reîncerca.” cu butonul
**Reîncearcă** vizibil, fără canvas gol. Pagina de harness repetă probele pe aceleași contracte, cu un
cub iluminat, și dovedește `activeMeshes = 1` plus cadre care avansează pe ambele backenduri.

**Fallback și recuperare.** Fallback-ul forțat este probat prin eliminarea `navigator.gpu` înainte de
încărcarea modulelor și prin refuzul explicit al WebGL 1 (`WebGL 1 is unsupported`); politica reală
`initializeBackend` este verificată și determinist pe cele patru combinații de capabilități, inclusiv
`RenderingInitializationError` cu mesajul românesc și cauzele agregate. Recuperarea folosește pierderi
native (`GPUDevice.destroy()` pe WebGPU, `WEBGL_lose_context.loseContext()` pe WebGL 2): scena este
reconstruită din același checkpoint RAM, tick-ul 417 rămâne neschimbat, generația avansează 1 → 2, iar
după două eșecuri injectate starea `ERROR` afișează mesajul și butonul de reîncercare, cu bucla de
cadre activă; a doua reîncercare revine în `READY` cu același checkpoint. Cele 11 verificări
deterministe (6 de fallback, 5 de recuperare) trec fără GPU.

**Ce rămâne.** Un singur GPU real și un singur OS: NVIDIA, Intel, macOS/Metal, Linux/Vulkan, Firefox,
WebKit/Safari, Edge stable, Chrome stable separat, Android și iOS sunt declarate `NOT_RUN`, cu motiv,
nu presupuse. Chromium headless rulează WebGL 2 pe SwiftShader, deci rezultatul dovedește fallback-ul,
contextul și mesajele, nu FPS sau senzația de condus. Pierderea este injectată, nu o defectare
hardware; timpul de recompilare a shader-elor nu este măsurat. Gate-ul rămas este 220/224/235.

**Constatare neblocantă.** View-ul real dublează prefixul mesajului de eroare („Randarea nu a pornit.
Randarea nu a pornit. …”); `src/` nu a fost modificat, deci defectul este raportat cu captură pentru
PBI-ul care deține `src/ui/rendering-view.ts`.

Dovezile, cu matricea, capturile, verificările deterministe și limitările, sunt în
[Evidence/154-compat-matrix](Evidence/154-compat-matrix/README.md).

## Verificarea integrată a distracției și a revenirii (PBI 235)

Gate-ul de experiență rulează o singură comandă locală, `npm run qa:fun`, și leagă probele reale ale
extensiilor V1: regresia 216, scenariile 151, sesiunea integrală 152, dovezile gate-ului 224, sesiunile
225/226, distrugerea 227/228, sliderele 229/230, daily 212, savefile 234, layout 084, accesibilitate
083 și QA-ul vizual 153. Fiecare probă este reexecutată în procesul raportului, cu numerele ei reale;
raportul agregat are verdict pe fiecare dintre cele șase criterii ale PBI-ului.

**Rezultatul reviziei: 4 criterii `PASS`, 1 `FAIL`, 1 `NOT_RUN`; 16 sonde, 15 `PASS`, 1 `FAIL`.**
`FAIL` este C3, pentru că 153 raportează cinci eșecuri reale de contract la textul panoului camerei și
al pop-up-ului KPI; sunt raportate cu captură, nu ascunse. `NOT_RUN` este C5, playtestul uman, care
cere minimum cinci participanți și nu a fost executat.

| Criteriu | Verdict | Dovada principală |
| --- | --- | --- |
| C1 combinații fără contaminare | PASS | 225: 20 tranziții, 0 lumi/joburi orfane; 226: 20 reseturi, 0 eșuate, XP și profil neschimbate; 234: 84/84, al doilea import 0 XP |
| C2 XP fără pierderi și fără dubluri | PASS | 216: pierderi 0, debitări 0, amprentă identică; 233: duplicat 0 XP, rollback `SKIPPED`; 212: 5 refuzuri |
| C3 HUD/cameră/slidere accesibile | FAIL | 229: 53/53, două clase, cameră `FIRST_PERSON`, contrast 11,13:1; 230: 70/70; 153: 5 eșecuri de contract (D4–D8) |
| C4 benchmarkul 224 | PASS | 17 rânduri, 16 PASS, 1 `NOT_VALIDATED`; 60,001 min, 20 cicluri; manifest `203-initial-1` nemodificat |
| C5 playtest uman | NOT_RUN | 0/5 participanți; fluxurile sunt acoperite mecanic, nu jucate de oameni |
| C6 eșecuri explicite, fără return rate | PASS | 8 findings de la 153; toate motivele de rejucare au `retention: NOT_RUN` |

**Mecanism versus retenție.** Raportul separă explicit „mecanismul există și e testat” de „oamenii
chiar revin”. Haos/distrugere, provocările, daily, recordurile și reluarea rapidă au dovada mecanismului
(225–233), dar toate au `retention: NOT_RUN`: nu există sesiuni de revenire, deci nu se raportează
procent, rată sau număr de jucători. Verificatorul respinge un raport care ar transforma ipoteza într-o
măsurătoare, care ar declara playtestul rulat sau care ar închide release-ul cu criterii deschise.

**Ce s-a executat efectiv.** `npm run qa:fun` (26,3 s) scrie `probes.json`, `report.json` și
`report.md`; `npm run qa:fun -- --check` confirmă că dovezile comise sunt curente;
`npm run qa:fun -- --strict` transformă un criteriu `FAIL` în exit code 1. `npm run qa:fun -- --browser`
construiește bundle-ul de producție și păstrează o captură Chromium 1280×720 (20 149 B) care dovedește
pornirea și linia WEBGL2; nu dovedește gameplay, input sau lizibilitate.

**Ce nu s-a măsurat.** Playtestul uman și retenția (24 h / 7 zile) rămân `NOT_RUN`. FPS, frame p95/p99
și lucrul GPU pe hardware real rămân `NOT_VALIDATED` în gate-ul 224, pentru că măsurătoarea hardware
aparține altei revizii. Memoria este raportată ca contoare de ownership, nu ca heap total. Findings-urile
153 nu au fost recapturate: worktree-ul nu are Playwright. Niciun procent de revenire nu este prezent în
raport.

Dovezile complete, cu matricea pe criterii, comenzile și rezultatele reale, sunt în
[Evidence/235-fun-qa](Evidence/235-fun-qa/README.md).
## Build de producție și livrare statică (PBI 160, 12 noiembrie 2026)

PBI 160 închide segmentul dintre verificare și livrare: buildul de producție are o configurație explicită, fiecare artefact este măsurat și servit static, iar verificările obligatorii, gate-ul 224 și buildul rulează într-o singură comandă CI, cu livrare doar după ce totul trece.

**Configurația buildului.** `vite.config.ts` fixează `base: './'`, deci toate referințele din `dist/index.html` sunt relative și artefactul poate fi servit din rădăcina unui site sau dintr-un subdirector, fără server de dezvoltare; `sourcemap: false` ține sursele în afara livrării, iar `emptyOutDir` garantează că un build nu păstrează artefacte vechi. `npm run build` rămâne `typecheck + vite build`, iar `src/` nu este modificat de acest PBI.

**Artefactul real.** Buildul reviziei curente produce 130 de fișiere: 3 478 683 B JS, 2 646 596 B WASM, 43 917 B CSS și 2 882 B HTML, în total 6 172 078 B (5,89 MiB), respectiv 1 769 518 B gzip pentru JS+WASM+CSS. JS+WASM împreună au 6 125 279 B, adică 73,02 % din capacitatea de 8 MiB din [manifestul de bugete](performance-budgets.json). Două builduri independente produc același arbore: 130 de artefacte și amprenta SHA-256 `81e33b1d8c54a53b97087288dac3b7cf1f9f833f66eef07b108a23dc2042d3a9`.

**WASM-ul și asseturile intră în build.** Cele două module WASM reale ale engine-ului sunt emise de build și identice byte cu fișierele din pachet și cu intrările `runtime:wasm:glslang` (943 680 B) și `runtime:wasm:twgsl` (1 702 916 B) din manifestul 150, cu encoding `IDENTITY`. Modulele lor JS de încărcare (`glslang-DqqdIFnr.js`, 16 030 B; `twgsl-DqdFeK3J.js`, 74 555 B) sunt și ele emise, iar bundle-ul le referă prin `new URL(..., import.meta.url)`, deci căile rămân valide la servire statică. Rapier rămâne inline base64 în bundle-ul său, exact cum îl descrie manifestul 150; în V1 nu există GLB final, iar geometria și audio-ul procedurale sunt generate la runtime, nu copiate ca fișiere.

**Ce este exclus în producție.** Măsurat pe artefact: 0 source maps, 0 instrucțiuni `debugger`, 0 apeluri `console.log/debug/info/trace`, 0 chunk-uri de inspector și 0 apariții `import.meta.env` neînlocuite. Inspectorul Babylon rămâne dependență de dezvoltare și nu ajunge în bundle.

**Livrare statică verificată, nu presupusă.** `scripts/build-report.mjs` pornește un server `node:http` minimal (fără Vite dev server) și cere prin HTTP `index.html`, toate cele 130 de artefacte și rădăcina: 132 de cereri, fiecare cu status 200, mărime identică și SHA-256 identic cu fișierul de pe disc, iar WASM-ul cu `Content-Type: application/wasm`. Referințele din `index.html` sunt relative, deci nu depind de `base` sau de numele directorului de găzduire.

**CI.** `npm run ci:verify` rulează, în ordine: `typecheck`, `lint`, `format:check`, `check:architecture`, `check:parameter-catalog`, suita completă (2 888 teste, 0 eșecuri), `Validate-Plan.ps1`, `Validate-Board.ps1`, `assets:manifest --check`, gate-ul 224 (`perf:gate --check`) și abia apoi buildul și verificarea statică. Fiecare pas este oprit la primul eșec, iar livrarea este ultima: un rezultat eșuat nu produce artefact publicat. Banda `npm run ci:release` refolosește jobul 224 cu `--require=release` și iese cu cod 1 fără să declare livrare cât timp FPS-ul pe hardware real nu este măsurat pe aceeași revizie; FPS headless/software nu este acceptat ca substitut.

**Datoria de plan, publicată.** `Validate-Plan.ps1` are pe commitul de bază șase linkuri locale rupte, în fișiere pe care acest PBI nu le deține: `Docs/map-integrity.md` → `../Evidence/043-map-integrity/README.md`, `Docs/Evidence/133-export-profile/README.md` și `Docs/Evidence/148-audio-engine/README.md` (adâncime greșită către `Docs/29`, respectiv `Docs/16`) și trei linkuri în `PBI/Done` (067, 145, 146). Regulile boardului interzic modificarea altor PBI, deci datoria este raportată, nu ascunsă: pipeline-ul o clasifică `DEBT` numai când fișierul care conține linkul nu este atins de schimbare; un board invalid, un link rupt într-un fișier modificat aici sau orice altă eroare de plan rămân blocante. Rezultatul reviziei este `PASSED_WITH_PLAN_DEBT`, cu gate 224 structural `PASS`, release `NOT_VALIDATED` și livrare `STATIC_VERIFIED`.

**Ce rămâne deschis.** FPS-ul și lucrul GPU pe hardware real rămân la gate-ul 224; verificarea livrării este la nivel HTTP (status, mărime, hash, MIME), nu o rulare de browser cu GPU, iar `dist/` nu este comis (este reproductibil din `npm run build`). Configurația de HTTPS/CDN și cache-ul de producție nu fac parte din acest PBI.

Comenzile, tabelele de artefacte, dovada negativă (un `format:check` rupt oprește pipeline-ul înainte de build) și limitările sunt în [Evidence/160-build-delivery](Evidence/160-build-delivery/README.md).

## Manualul de utilizare și operare V1 (PBI 161, 12 noiembrie 2026)

PBI 161 adaugă documentația pentru jucător și operator, distinctă de contractele de modul: pași, taste,
nume de butoane, praguri și ce înseamnă fiecare indicator. Manualul are un cuprins propriu și șapte
secțiuni scurte, ca să poată fi citit liniar la prima sesiune și consultat pe sărituri după aceea:
pornire și control, cele trei moduri, Academie/Haos și recuperare, KPI și economie, misiuni zilnice/XP/
provocări, slidere și camera first-person, salvare și recuperare din fișier. Punctul de intrare este
[manual/README.md](manual/README.md).

**De ce `Docs/manual/` și nu un singur `Docs/30-*`.** Manualul se adresează jucătorului, nu dezvoltatorului,
și nu descrie arhitectura; un director propriu păstrează documentele de modul ca sursă tehnică și lasă
manualul să fie rescris fără să atingă contractele. Fiecare secțiune rămâne suficient de scurtă pentru o
singură lectură, iar cuprinsul nu crește odată cu planul modular.

**Două straturi, declarate explicit.** Bootstrapul din `src/main.ts` montează doar suprafața de randare și
panoul „Diagnostic”; HUD-ul, lista flotei, panourile de misiuni/KPI/provocări, pop-up-ul de reglaje și
acțiunile de fișier sunt module cu contracte livrate, montate de stratul de compoziție. Manualul spune
lucrul acesta la fiecare punct unde contează, în loc să descrie un ecran care nu există încă.

**Verificarea.** Fiecare afirmație a fost confruntată cu codul reviziei curente sau cu documentul de modul
care o deține: tastele implicite din `createDefaultSettings`, textele din `src/ui/rendering-view.ts` și
`backend-policy.ts`, etichetele modurilor din `src/ui/taxi-hud-format.ts`, pragurile XP din
`src/missions/player-progress.ts`, ceasul economic și pragul de proiecție din `src/economy/kpi.ts`,
plafoanele și codurile de refuz din `src/persistence/savefile.ts`, respectiv operațiile de recuperare din
`src/persistence/world-recovery.ts`. Tabelul complet afirmație → fișier și simbol este în
[Evidence/161-release-docs](Evidence/161-release-docs/README.md).

**Ce rămâne nevalidat.** Sesiunea de onboarding cu oameni cerută de PBI nu a fost executată (zero
participanți), deci lizibilitatea și confortul manualului sunt `NOT_RUN`; playtestul și retenția rămân
`NOT_RUN`, iar FPS-ul pe hardware real rămâne `NOT_VALIDATED` la gate-ul 224. Manualul nu conține procente
de revenire, promisiuni de învățare „mai bună” sau rate de cadre.

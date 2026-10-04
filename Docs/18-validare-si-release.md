# Validare și release

Versiune 0.2 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Criterii de acceptare pentru prima versiune

| Arie | Criteriu verificabil |
| --- | --- |
| Acces la vehicule | Fiecare mașină din hartă poate fi preluată; fiecare taxi poate fi selectat din listă fără mutarea fizică a vehiculului |
| Flotă | 20–30 de taxiuri simulează curse, alături de trafic obișnuit; indicatorii includ și vehiculele din afara camerei |
| Control | Hotkey-ul schimbă autoritatea la un tick clar; maximum un vehicul este manual; HUD și simularea raportează același mod |
| Curse | O cursă poate fi făcută manual integral; pickup și dropoff folosesc aceleași reguli pentru manual și autonom |
| Intervenții scurte | Un segment valid de câteva străzi poate actualiza parametrii observați fără a finaliza cursa |
| Învățare | Fiecare dintre cei 24 de parametri M are estimator sau calibrare identificabilă, scenariu și test propriu; cheile fără dovezi rămân neschimbate |
| Greșeli | Demonstrații repetate de trecere pe roșu sau STOP incomplet modifică politica în sensul demonstrat, fără înlocuire automată cu un profil regulamentar |
| Publicare | Toate taxiurile adoptă aceeași versiune la tick-ul de activare; nicio activare dublă și nicio suprascriere de către un rezultat vechi |
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

QA vizual verifică lizibilitatea HUD la 1280×720 și 1920×1080, panoul flotei cu 30 de taxiuri, contrastul, remaparea tastelor, modul de pauză, focusul, mesajele de învățare și recuperarea după pierderea GPU. Benchmarkul include sesiuni de cel puțin 30 de minute pentru stabilitatea memoriei și a flotei.

În această etapă se verifică documentația și consistența catalogului. Testele de joc de mai sus vor fi executate după implementare; documentul nu susține că ele au trecut deja.

## Gates pentru extindere

V2 cere 80 de chei cu utilizare reală în politică, estimare în contexte identificabile și validare independentă; suportul parțial nu este ascuns. V3 cere intrare/ieșire, mers, camera, arbitraj de input, segmente de driving și migrarea salvărilor verificate împreună cu regresiile V1/V2.

CI rulează verificările statice, scenariile și buildul reproductibil. Livrarea este un artefact static compatibil cu HTTPS și încărcarea asseturilor/WASM. Un gate închis produce un PBI Done numai după verificări și mutarea efectivă în coloana Done.

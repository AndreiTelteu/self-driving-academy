# Roadmap și decizii

Versiune 0.4 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Etape de implementare

| Etapă | Livrabil | Condiție de ieșire |
| --- | --- | --- |
| 0 | Registrul deciziilor și scenariile de referință | Scope, hardware și primele scene de calibrare definite |
| 1 | Prototip de fizică și renderer | O mașină manuală, aderență și frânare credibile; inițializare WebGPU și fallback verificate |
| 2 | Traseu și autonomie de bază | Un taxi parcurge benzi, semafoare, STOP și pickup/dropoff cu același controller |
| 3 | Prototip timpuriu PBI 204 | LEARNING → telemetrie → estimare → profil → AUTO, trei chei și câteva vehicule înaintea cartierului complet |
| 4 | Flotă și trafic | 20–30 de taxiuri, dispecerizare, civili care imită același stil și publicare comună |
| 5 | Catalogul inițial de învățare | Cei 24 de parametri M au dovezi, explicații și validare în contexte independente |
| 6 | Campanie, economie și fidelizare | KPI-uri și review-uri, trei misiuni zilnice, XP și persistență funcționale |
| 7 | Comparații și istoric | Scenarii, versiuni, replay și indicatori comparabili |
| 8 | Release pentru PC în browser | QA, compatibilitate, benchmark și export/import trec criteriile stabilite |

Etapa 3 trebuie să demonstreze ideea jocului înainte de extinderea orașului. Prima buclă folosește speed_delta_urban, desired_acceleration și stop_full_probability pe fixture-uri mici. PBI 042 depinde de 204; arbitrajul 066 și registry-ul 092 sunt disponibile fără flota completă. PBI 115 verifică apoi integrarea extinsă a orașului, iar gate-ul 108 rămâne obligatoriu la release, fără a bloca demonstrația timpurie. Definiția completă a profilului rămâne versionată pentru extinderea la 24 și ulterior la 80 de parametri.

Nu se estimează calendarul până când etapa 1 oferă un cost de implementare observat și există o echipă cunoscută. Etapele au dependențe reale; construirea campaniei depinde de evenimentele și comportamentele validate.

### Backlog inițial

1. Definirea contractelor, unităților și tick-urilor.
2. Bootstrap grafic și gestionarea erorilor de GPU.
3. Scenă de test cu două clase de vehicule.
4. Input de tastatură, camera și calibrarea fizicii.
5. Graf de benzi și intersecție cu zone de conflict.
6. Controller autonom și explicația deciziei.
7. Cursă completă, pickup și dropoff.
8. Modurile AUTO/MANUAL/LEARNING și înregistrarea segmentului.
9. Primii estimatori și publicare de profil.
10. Teste de lipsă a dovezilor și de copiere a încălcărilor.
11. Dispecer, flotă și trafic obișnuit.
12. Catalog M, misiuni, salvare și comparații.

## Riscuri și măsuri de proiectare

| Risc concret | Măsură |
| --- | --- |
| Fizica nu produce senzația realistă cerută | Validare cu scene de frânare, viraj și tastatură înaintea orașului complet |
| Un număr mare de parametri este imposibil de identificat din puține date | Eligibilitate pe contexte, incertitudine, scenarii dedicate și implementare etapizată |
| Un profil învață capacitățile mașinii în locul intenției | Normalizare pe vehicul și validare între clase |
| Profilul pare schimbat în UI, dar politica nu îl folosește | Teste de comportament și motive ale deciziilor legate de cheile active |
| Învățarea elimină greșelile și pierde conceptul jocului | Separarea validității numerice de evaluarea consecințelor |
| Rezultate de estimare sosesc în ordine greșită | Coadă serială, bază versionată și aplicare idempotentă |
| Flota se blochează permanent după coliziuni | Statut de blocaj, politică de recuperare, evidențiere și înregistrarea recuperărilor |
| Benchmarkul favorizează doar vehiculele vizibile | Simularea și expunerea includ întreaga flotă |
| Comparația atribuie unui parametru toate efectele unui trafic divergent | Scenarii izolate și rulări cu mai multe seed-uri |
| Salvarea locală ajunge la cotă sau este ștearsă | Limită de retenție configurabilă, export și mesaje de stare |
| Misiunile recompensează exploatarea unor indicatori | Evenimente validate, rezultate distincte și teste de reluare |

## Decizii înainte de implementare

Cerințele principale de produs au fost confirmate. Rămân de calibrat hardware-ul de referință, dimensiunea exactă a hărții, densitatea traficului, setarea tastaturii, pragurile de învățare și dificultatea misiunilor. Aceste decizii se rezolvă prin prototip și playtesting; nu blochează redactarea acestui plan.

Propunerile care pot necesita alegerea jucătorului la o revizie sunt numele final, direcția vizuală exactă, nivelul de reprezentare a pietonilor și ordinea extinderii celor 56 de parametri R. Mersul pe jos rămâne în etapa ulterioară confirmată.

## Proveniența tehnică

Researchul pentru WebGPU și motoare a folosit documentație oficială și surse ale proiectelor, consultate la 4 octombrie 2026. Afirmațiile despre capabilitățile tehnologiilor sunt citate lângă ele. Arhitectura, misiunile, catalogul de parametri, algoritmii propuși, valorile inițiale și țintele de performanță sunt proiectarea acestui joc; sursele nu le prezintă ca soluție gata construită.

## Backlog complet și sursă de adevăr

[PBI/README.md](../PBI/README.md) indexează 224 task-uri: 184 pentru V1, 28 pentru V2 și 12 pentru V3. Revizia 0.3 adaugă 203–217 pentru corecții și scope V1; revizia 0.4 adaugă 218–224 pentru performanță progresivă. ID-urile sunt identități stabile, nu ordinea de implementare; dependențele pot avea numere mai mari și sunt validate ca graf fără cicluri. Se alege cel mai mic ID eligibil, nu se începe un task cu dependențe nefinalizate.

Documentele din Docs sunt sursa de adevăr actuală. [Planul v0.1](Archive/GAME_DESIGN-v0.1.md) și Page-ul creat anterior sunt referințe istorice, nu versiuni sincronizate automat. Documentul de arhitectură din v0.3 fixează Babylon.js și înlocuiește comparația anterioară de engine-uri.

Înaintea implementării se citește [workflow-ul Kanban](../PBI/AGENTS.md). Crearea backlogului nu execută task-urile și nu justifică mutarea lor în Done. Toate pornesc în To Do.

## Decizii ale reviziei 0.3

Confirmate de utilizator: învățare din mașini civile; stil comun adoptat și de civili; AUTO/MANUAL/LEARNING cu învățare numai în LEARNING; KPI revenue lunar și ratings 0–5 cu istoric; trei misiuni noi pe zi și XP din misiuni/timp activ, cu pierdere pentru deteriorarea atribuibilă a KPI-urilor. Formulele, tarifele, pragurile și ritmul calendarului economic sunt propuneri versionate de calibrare în modulele 22–23.

Corecțiile auditului, închiderea contractelor și ordinea milestone-urilor sunt în [modulul 24](24-milestone-timpuriu-si-contracte.md). Nu se adaugă în această revizie task-uri de publicare socială, multiplayer sau hosting extern.

## Revizia 0.4: performanță verificată progresiv

218/203 stabilesc harness-ul și bugetele înainte de extindere. 219 distribuie tick-urile/deciziile și tratează suprasarcina; 221 admite worker-ele. După 065/115, gate-ul 220 validează flota înainte de 116/145/146. 222 integrează datele fără sacadare și 223 impune limite asseturilor; 224 condiționează CI/release-ul. Optimizările finale 157/158 rămân după profilare, fără a amâna toate măsurătorile până la ele. [Analiza și probele](25-performanta-contracte-si-benchmark.md) păstrează simularea tuturor taxiurilor și civililor.

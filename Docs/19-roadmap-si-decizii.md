# Roadmap și decizii

Versiune 0.2 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Etape de implementare

| Etapă | Livrabil | Condiție de ieșire |
| --- | --- | --- |
| 0 | Registrul deciziilor și scenariile de referință | Scope, hardware și primele scene de calibrare definite |
| 1 | Prototip de fizică și renderer | O mașină manuală, aderență și frânare credibile; inițializare WebGPU și fallback verificate |
| 2 | Traseu și autonomie de bază | Un taxi parcurge benzi, semafoare, STOP și pickup/dropoff cu același controller |
| 3 | Buclă completă de demonstrație | Manual → telemetrie → estimare → profil → autonomie, inițial pentru un set restrâns de parametri |
| 4 | Flotă și trafic | 20–30 de taxiuri, dispecerizare, mașini civile, listă flotă și publicare comună |
| 5 | Catalogul inițial de învățare | Cei 24 de parametri M au dovezi, explicații și validare în contexte independente |
| 6 | Campanie și progres | Misiuni, obiective, recompense și persistență funcționale |
| 7 | Comparații și istoric | Scenarii, versiuni, replay și indicatori comparabili |
| 8 | Release pentru PC în browser | QA, compatibilitate, benchmark și export/import trec criteriile stabilite |

Etapa 3 trebuie să demonstreze ideea jocului înainte de extinderea orașului. O primă buclă poate folosi viteza preferată, accelerația, frânarea, distanța de urmărire, oprirea la STOP și reacția la verde. Definiția completă a profilului rămâne versionată pentru extinderea la 24 și ulterior la 80 de parametri.

Nu se estimează calendarul până când etapa 1 oferă un cost de implementare observat și există o echipă cunoscută. Etapele au dependențe reale; construirea campaniei depinde de evenimentele și comportamentele validate.

### Backlog inițial

1. Definirea contractelor, unităților și tick-urilor.
2. Bootstrap grafic și gestionarea erorilor de GPU.
3. Scenă de test cu două clase de vehicule.
4. Input de tastatură, camera și calibrarea fizicii.
5. Graf de benzi și intersecție cu zone de conflict.
6. Controller autonom și explicația deciziei.
7. Cursă completă, pickup și dropoff.
8. Moduri manual/autonom și înregistrarea segmentului.
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

Propunerile care pot necesita alegerea jucătorului la o revizie sunt numele final, direcția vizuală exactă, contribuția condusului în mașini civile la profil, nivelul de reprezentare a pietonilor și ordinea extinderii celor 56 de parametri R. Mersul pe jos rămâne în etapa ulterioară confirmată.

## Proveniența tehnică

Researchul pentru WebGPU și motoare a folosit documentație oficială și surse ale proiectelor, consultate la 4 octombrie 2026. Afirmațiile despre capabilitățile tehnologiilor sunt citate lângă ele. Arhitectura, misiunile, catalogul de parametri, algoritmii propuși, valorile inițiale și țintele de performanță sunt proiectarea acestui joc; sursele nu le prezintă ca soluție gata construită.

## Backlog complet și sursă de adevăr

[PBI/README.md](../PBI/README.md) indexează 202 de task-uri: 162 pentru V1, 28 pentru V2 și 12 pentru V3. Ordinea numerică este topologică: toate dependențele au numere mai mici. Numerotarea este stabilă, iar folderul și frontmatterul definesc statusul.

Documentele din Docs sunt sursa de adevăr actuală. [Planul v0.1](Archive/GAME_DESIGN-v0.1.md) și Page-ul creat anterior sunt referințe istorice, nu versiuni sincronizate automat. Documentul de arhitectură din v0.2 fixează Babylon.js și înlocuiește comparația anterioară de engine-uri.

Înaintea implementării se citește [workflow-ul Kanban](../PBI/AGENTS.md). Crearea backlogului nu execută task-urile și nu justifică mutarea lor în Done. Toate pornesc în To Do.

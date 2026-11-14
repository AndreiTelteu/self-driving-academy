# Roadmap și decizii

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

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

[PBI/README.md](../PBI/README.md) indexează 235 task-uri: 195 pentru V1, 28 pentru V2 și 12 pentru V3. Revizia 0.3 adaugă 203–217 pentru corecții și scope V1; revizia 0.4 adaugă 218–224 pentru performanță progresivă; revizia 0.5 adaugă 225–235 pentru experiența de joc. ID-urile sunt identități stabile, nu ordinea de implementare; dependențele pot avea numere mai mari și sunt validate ca graf fără cicluri. Se alege cel mai mic ID eligibil, nu se începe un task cu dependențe nefinalizate.

Documentele din Docs sunt sursa de adevăr actuală. [Planul v0.1](Archive/GAME_DESIGN-v0.1.md) și Page-ul creat anterior sunt referințe istorice, nu versiuni sincronizate automat. Documentul de arhitectură din v0.3 fixează Babylon.js și înlocuiește comparația anterioară de engine-uri.

Înaintea implementării se citește [workflow-ul Kanban](../PBI/AGENTS.md). Crearea backlogului nu execută task-urile și nu justifică mutarea lor în Done. Toate pornesc în To Do.

## Decizii ale reviziei 0.3

Confirmate de utilizator: învățare din mașini civile; stil comun adoptat și de civili; AUTO/MANUAL/LEARNING cu învățare numai în LEARNING; KPI revenue lunar și ratings 0–5 cu istoric; trei misiuni noi pe zi și XP din misiuni/timp activ, fără pierderi pentru deteriorarea KPI-urilor, conform reviziei 0.5. Formulele, tarifele, pragurile și ritmul calendarului economic sunt propuneri versionate de calibrare în modulele 22–23.

Corecțiile auditului, închiderea contractelor și ordinea milestone-urilor sunt în [modulul 24](24-milestone-timpuriu-si-contracte.md). Nu se adaugă în această revizie task-uri de publicare socială, multiplayer sau hosting extern.

## Revizia 0.4: performanță verificată progresiv

218/203 stabilesc harness-ul și bugetele înainte de extindere. 219 distribuie tick-urile/deciziile și tratează suprasarcina; 221 admite worker-ele. După 065/115, gate-ul 220 validează flota înainte de 116/145/146. 222 integrează datele fără sacadare și 223 impune limite asseturilor; 224 condiționează CI/release-ul. Optimizările finale 157/158 rămân după profilare, fără a amâna toate măsurătorile până la ele. [Analiza și probele](25-performanta-contracte-si-benchmark.md) păstrează simularea tuturor taxiurilor și civililor.

## Decizii ale reviziei 0.5

Confirmate de utilizator: eliminarea globală a pierderilor XP; recuperarea lumii distinctă de restaurarea stilului; HUD simplu și feedback prin reacții; slidere pentru control și stil; provocări neobișnuite cu clienți; first-person definit direct; savefile cu checksum; Haos și decor destructibil. Cerințele reviziei 0.3 pentru penalizare XP sunt înlocuite. [Modulele 26–29](26-joaca-libera-haos-si-distrugere.md) detaliază scope-ul. 225–235 sunt task-uri V1 noi; 214 își păstrează identitatea și primește scope de feedback/regresie XP, fără evaluator contrafactual. Fixture-ul 204 rămâne devreme și nu depinde de aceste extensii; 224/235 verifică integrarea lor înainte de 162. Referințele la alte jocuri sunt eliminate din cerințele curente; arhiva v0.1 rămâne istoric.

## Închiderea release-ului V2 (PBI 190, 14 noiembrie 2026)

V2 se închide ca un release **documentat și verificat, dar nevalidat pe hardware**. PBI 190 nu adaugă funcționalitate de joc: leagă cele 80 de chei de dovezile lor, publică notele de compatibilitate față de 0.3 și un checklist executabil, astfel încât fiecare afirmație de suport să aibă o referință și fiecare rând deschis să aibă un owner. Comanda este `npm run release:v2`; `--check` regenerează cele șase fișiere și le compară byte cu byte.

**Artefactul celor 80 de parametri este derivat, nu scris de mână.** `scripts/run-v2-release-artifact.mjs` citește catalogul din [driving-parameters.json](driving-parameters.json), îmbogățește fiecare cheie din tabelul unic de capabilități 187 (politică, estimator, dovezi, test, scenariu), verifică declarațiile cu aceeași funcție fail-closed a porții și leagă livrarea în joc de `learningKeys` ale provocărilor 188. Rezultatul: **80/80 chei, 24 CORE + 56 V2, 80 de politici și 80 de estimatori, 56 de efecte măsurate + 24 de consecințe M păstrate, 8 convenții canonice, 15 chei demonstrate de provocări și 41 fără provocare dedicată**. Fiecare rând spune unitatea, intervalul, defaultul, convenția de ambiguitate și limitarea care rămâne. [Artefactul](Evidence/190-v2-release/parameter-artifact.md) și [notele de compatibilitate](Evidence/190-v2-release/compatibility-notes.md) sunt perechea lui JSON.

**Rezervarea celor 56 de chei este spusă explicit, nu sugerată.** Cheile `extension` sunt certificate de poarta 187, dar etapa de plan le păstrează rezervate: `candidate-validation` le refuză cu `KEY_EXTENSION_STAGE`, iar exportul le scrie `null` în `reservedParameters`. Artefactul marchează fiecare rând V2 „nu este livrabil end-to-end" și nu transformă certificarea într-o promisiune de gameplay. Demonstrația transferului stilului extins merge exact până unde merge contractul: pentru fiecare dintre cele zece familii, valoarea candidată a estimatorului (de exemplu `speed_delta_arterial` 4,075 m/s, `VALIDATED`) produce un efect măsurat în politica familiei (3,9 → 30 m/s, Δ 26,1), iar transferul către flotă este oprit de etapa de plan — **10/10 familii demonstrate până la politică, 10/10 blocate înainte de flotă**.

**Ce rămâne identic și ce se schimbă pentru jucător.** Progresul V1, accesul la vehicule și acordurile de salvare rămân identice: regresia 216 reexecutată dă 27 de rânduri PASS și 0 eșecuri, importul de progres al lui 188 păstrează același digest înainte/după, iar exportul/importul păstrează 56 de chei rezervate cu valoare `null`. Noutatea pentru jucător este lumea cu pietoni și pericole și cele 15 provocări extinse; pentru integrator, cele 56 de straturi de politică cu estimator, dovezi și test propriu, plus poarta executabilă și workload-ul V2 versionat. Notele au **15 afirmații, fiecare cu dovada care o susține** (5 schimbări, 3 identice, 3 noutăți, 4 deschise).

**Verdictul release-ului: `NOT_VALIDATED`, cu 10 `PASS`, 2 `FAIL` și 5 `NOT_RUN`.** [Checklist-ul](Evidence/190-v2-release/release-checklist.md) verifică 27/27 PBI-uri V2 (163–189) în Done cu dovezi fără placeholder, poarta 187, provocările 188, regresia V1, matricea de compatibilitate, roundtrip-ul de salvare și sesiunea integrală. Rândurile deschise nu sunt ascunse: FPS pe hardware real (`NOT_RUN`, owner operator + 224), harness V2 fără fixture cu pietoni/pericole (`NOT_RUN`, owner 220/224), soak V2 (`NOT_RUN`, owner 159/224), playtest uman (`NOT_RUN`, owner 216/235) și re-măsurarea dovezilor comise 224 (`NOT_RUN`, owner 224, pentru că `perf:gate -- --check` iese cu exit 1). Cele două `FAIL` sunt moștenite și au owner: regula V1 rămasă în `Docs/parameter-registry.md` (`estimable=false` pentru toate cheile, contrazisă de cei 80 de estimatori certificați) și gate-urile V1 deschise 153/235 din checklist-ul 162. [Dovezile complete](Evidence/190-v2-release/README.md), cu tabelele, comenzile și rezultatele reale, sunt în directorul release-ului.

**Ce se corectează în documentație.** [Catalogul parametrilor](11-catalog-parametri.md) afirma încă „estimarea și publicarea LEARNED rămân dezactivate până la implementarea estimatorilor", fals după 187: estimatorii sunt livrați, iar registrul derivă `estimable=true` pentru toate cele 80 de chei. Secțiunea a fost corectată cu starea reală și completată cu „Suport real după 187", care separă cele 24 de chei CORE livrate în bucla V1, cele 56 certificate dar rezervate și cele 15 cu provocare. Catalogul de date rămâne fail-closed: `implemented: false` în JSON nu s-a schimbat, iar suportul se citește numai din tabelul 187.

**După V2.** Release-ul se poate declara `PASS` numai după o sesiune pe hardware real, pe aceeași revizie și ambele backenduri, după un fixture de harness cu pietoni și pericole, un soak pe workload-ul V2, un playtest uman și re-măsurarea dovezilor 224. Până atunci, FPS-ul nu este raportat, iar cele 56 de chei extinse rămân certificate, dar nepublicate.

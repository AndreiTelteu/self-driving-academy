# Verificare PBI034

Baseline-ul `before.json` a fost capturat complet înainte de crearea `src/world/spatial-index.ts`; existența modulului a fost verificată false după captură. `before-trial.json` este o probă preliminară exclusă din comparație. Fișierele baseline originale sunt păstrate byte-for-byte în `before-source`, corespunzând SHA256 din `before.json`. Modificările ulterioare ale harnessului/reference au fost numai formatare Prettier; protocolul, fixture-ul și algoritmul brut au rămas identice.

Protocol suplimentar CPU034-local-mutable-v1: cinci repetări pereche observeroff/on,100iterații warmup și600măsurate per configurație, două workloaduri în fiecare iterație. Fără pacing, fără120s wall-time sau debit realtime pretins. Proba normală are64vehicule+32obstacole+24zone; proba densă are110+96+256. Fiecare iterație face câte un query12m per vehicul; un vehicul trece o graniță semnată32m, iar fiecare30a iterație elimină/recreează identitatea. Sunt incluse overpassuri și o zonă mare care necesită fallback. Fiecare vector de diagnostic admite maximum7201samples înainte de push. Observatorul extern măsoară tick-ul în ambele configurații; sub-timerele query/update se activează numai în on. Off precede on, ceea ce poate introduce bias JIT/cache; ordinea este aceeași înainte/după.

Hardware identificat din Node/OS și powercfg: AMD Ryzen9 7950X3D,32CPUlogice, Windows10.0.26200, aproximativ46,88GiB RAM, Balanced; runtime exact și commit/sourceHashes în JSON. Backend CPU Node, fără renderer/GPU/preset/browser. Captura nu validează FPS, geometria fizică live sau bugetul întregului tick autoritar.

| Mediană p95CPU, ms | Brut înainte | Index după |
| --- | ---: | ---: |
| Tick normal, observeroff |0,4210|0,1125|
| Tick dens, observeroff |4,3351|1,6139|
| Tick normal, observeron |0,4135|0,1109|
| Tick dens, observeron |4,3485|1,6324|
| Query normal, observeron |0,4119|0,1034|
| Query dens, observeron |4,3456|1,6291|
| Update normal, observeron |0,0010|0,0063|
| Update dens, observeron |0,0006|0,0032|

Costul suplimentar al actualizării indexului este separat de query și de mutația Map brută. Nu există buget fixat per query; manifestul203-initial-1 propune5,5ms pentru întregul tick desktop. Compararea izolată nu aprobă acel gate. Regresia propusă >10% și >1ms în3din5 nu apare în aceste probe; dense-query rămâne complet chiar când candidații se apropie de întreaga scenă. Toate20perechile repetition/config/workload au checksumuri identice; corectitudinea nu se bazează doar pe numărul de rezultate.

`node --import ./scripts/register-typescript.mjs --test tests/world/spatial-index.test.ts`:9/9PASS. Un test distinct compară6960seturi de IDs ordonate exact din workloadul benchmarkului în afara măsurătorilor; altul compară600query-uri cu mișcări/remove-recreate/geometrie și fallback. Alte teste acoperă tangențe, coordonate negative, overpassuri, prismă concavă, false positives din bounding box, filtre/excludere id+incarnation, actualizări atomice, refuz la capacitate, query exhaustiv,110vecini în aceeași celulă, ordinea inserării, copii frozen,20reseturi și dispose.

`npm run typecheck` PASS după corectarea inferenței stats și a tipului fixture-sphere. ESLint și Prettier pe cele cinci fișiere034 PASS. Prima execuție typecheck a găsit tipul fixtureului; testele runtime treceau, iar eroarea a fost corectată înainte de verificarea finală.

`node --expose-gc --import ./scripts/register-typescript.mjs scripts/measure-spatial-index-memory.mjs`:20cicluri PASS. Toate contoarele entități/vertexuri/celule/referințe/fallback revin la zero la fiecare reset și la dispose. Heap diagnostic după forcedGC9.220.312→9.317.448bytes (+97.136bytes), cu fixture și raporturile owned de harness rămase în proces. Nu sunt bytes exact ai indexului, RAM totală, WASM sau GPU. Indexul nu deține listeners/timers/cozi/istoric de query.

Baseline-ul preimplementare consemnează120/462entități ale referinței Map și zero celule/referințe de index; nu a măsurat heap. Costul suplimentar de ownership al indexului după700iterații este277celule/407referințe/96vertexuri pentru normal și36celule/791referințe/1024vertexuri pentru dens, plus câte un obiect fallback. Bytes exacți și o regresie comparativă de heap față de înainte sunt indisponibile; proba20cicluri verifică retenția și cleanup-ul, fără a inventa o măsurare RAM retrospectivă.

Limitări: observații sintetice autoritare furnizate explicit;022 identifică momentan numai vehiculele, obstacolele anonime/zonele nu sunt inventate din meshuri. Ownerul asigură completitudinea observațiilor și fencing-ul callbackurilor la reset/respawn. Prismele sunt anvelope verticale semantice, nu suprafețe înclinate; query-ul este local la un punct, nu swept. Plafoanele finite110vehicule/96obstacole/512zone/128vertexuri sunt provizorii; bugetele de gameplay, laptopul și gate-urile hardware ulterioare rămân nevalidate.

Verificarea coordonatorului: npm run check PASS (329tests shared checkout, inclusiv023 în curs,0fail/skip,typecheck/lint/format/architecture). [Log](global-check.txt). Revizie statică independentă fără defecte blocante; actualafter.json sourceSHA corespund byte-exact fișierelor actuale. [Identitate rapoarte/source](artifact-identity.json). Nu au fost rescrise hashuri sau rapoarte originale.

Taskul există numai în PBI/Done/034-spatial_index.md; RequireDone034 și ValidatePlan PASS la 2026-10-05T14:44:02.5151591+03:00. [Board](board-validation.txt), [Plan](plan-validation.txt).

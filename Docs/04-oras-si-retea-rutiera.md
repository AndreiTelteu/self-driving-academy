# Oraș și rețea rutieră

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Orașul și vehiculele

Propunere de hartă: un cartier fictiv cu atmosferă americană, de aproximativ 800 pe 800 de metri, cu 12–16 cvartale, drumuri cu una și două benzi pe sens, sensuri unice, cel puțin patru intersecții semaforizate, patru intersecții cu STOP, două intersecții cu prioritate, treceri de pietoni și zone de pickup. Dimensiunea exactă se ajustează după testele de gameplay și performanță.

Geometria vizuală și semantica rutieră sunt separate. Fiecare bandă are direcție, lățime, limită de viteză, legături către benzi vecine și restricții de acces. Intersecțiile definesc mișcări permise și zone de conflict. Semafoarele au faze asociate explicit cu mișcările, iar STOP și trecerile de pietoni au linii și zone de oprire. Valorile din hartă reprezintă regulile jocului.

Vehiculele împărtășesc un contract de comandă: accelerație, frână, direcție, frână de mână și semnalizare. Controlul manual și controlul autonom folosesc aceeași fizică și aceleași limite mecanice. Masa, aderența, puterea, capacitatea de frânare și raza de viraj sunt caracteristici ale vehiculului, separate de stilul șoferului.

Decizie confirmată: segmentele LEARNING din taxiuri și mașini civile contribuie la profilul comun al orașului. MANUAL nu contribuie la învățare. Estimarea normalizează capacitățile vehiculului. Taxiurile și civilii adoptă aceeași versiune la tick-ul de activare; mașinile civile păstrează destinațiile proprii și reiau AUTO cu stilul comun când sunt eliberate. Explicația de produs este imitația stilului taxiurilor de către șoferii civili. Nu se implementează un al doilea proces de antrenare ascuns pentru civili.

## Validarea și authoringul hărții

Formatul de hartă include mapId, schemaVersion, units, bounds, lanes, intersections, signals, stopLines, crosswalks, serviceZones și recoveryPoints. Fiecare referință este validată; graful se verifică pentru conectivitate la toate punctele de serviciu. Limitele de viteză sunt proprietăți ale hărții.

PBI032 implementează [schema runtime și validatorul semantic](map-schema.md) în `world`: geometrie distinctă de reguli, referințe/endpointuri direcționate, faze de semnal complete, conflicte GREEN declarate și accesibilitate orientată per clasă către toate serviciile eligibile. Rezultatul este o copie readonly înghețată; limitele geometrice efective și fixture-urile negative sunt documentate explicit. Nu generează cartierul și nu implementează routing/meshuri.

PBI033 adaugă [graful direcționat de benzi](lane-graph.md): vecini, succesori și conexiuni de viraj filtrate după acces TAXI/CIVIL, plus proiecția poziției pe geometria orientată a benzii. Query-urile țin cont de lățime, înălțime și direcție; în afara grafului întorc null. Indexul spațial are limite explicite și păstrează o căutare completă pentru geometria care depășește capacitatea indexului.

PBI035 construiește [relațiile de conflict ale intersecțiilor](intersection-conflicts.md) din mișcări, zone declarate și coridoare geometrice. Relațiile au IDs stabile și motive distincte; ocuparea incompatibilă nu atribuie prioritate. Geometria este reutilizată, iar construirea are limite explicite pentru perechi și comparații.

Pipeline-ul construiește întâi fixture-uri semantice mici, apoi cartierul. Un validator produce IDs și poziții pentru erori. Decorul nu schimbă banda sau coliziunile fără o actualizare a datelor. Rutele civile și taxiurile folosesc același graf; un segment manual în afara grafului rămâne înregistrat fără a inventa o bandă.

PBI039 oferă [zonele de trecere și contextul de pericol](crosswalk-zones.md): traversări geometrice, linii cu IDs și observații explicite de pietoni/obstacole. O trecere goală nu produce expunere la pietoni sau dovezi de cedare. Implementarea semantică rămâne independentă de meshuri și de viitoarele NPC-uri.

PBI037 oferă [zonele și dovezile STOP](stop-rules.md): apropiere, staționare continuă lângă linie și traversare distinctă, folosind bara frontală autoritară. Istoricul limitat și identificarea oportunităților împiedică transferul dovezii între respawn, reseturi și STOP-uri consecutive.

PBI036 implementează [controllerul de semafoare](signals.md): faze deterministe la 60 Hz, semnal consultat pentru mișcarea concretă și evenimente unice pentru tranziții. Configurația respinge mișcări GREEN incompatibile, iar retry-ul publicării păstrează prefixul deja acceptat fără repetarea evenimentelor.

PBI038 adaugă [politica explicită de prioritate și evaluarea spațiilor](priority-rules.md): relații de hartă exhaustive, timp până la conflict în secunde și dovezi bazate pe trafic observabil. Absența traficului și acoperirea necunoscută nu devin dovezi de refuz sau cedare; schimbările de traseu și discontinuitățile invalidează continuitatea observării.

PBI041 adaugă [planner-ul de rutare A*](route-planner.md) peste graful033: cost explicit și versionat per bandă (metri/limită de viteză plus penalizări de conexiune), trasee doar pe muchii directionate filtrate după acces, destinații de tip bandă sau zonă de serviciu, rezultat explicit când nu există rută, cache plafonat invalidat la schimbarea grafului/blocajelor/costurilor și integrare cu coada schedulerului219. Nu acordă permisie de trecere, nu este fizică și nu este dispecerul de flotă.

PBI042 adaugă [cartierul vizual](city-visual.md): un layout derivat exclusiv din harta032 (`createCityLayout`) și un builder Babylon (`createCityScene`) care randează fiecare bandă, marcaj, linie STOP/SIGNAL, trecere, semafor și zonă de serviciu cu `sourceIds` trasabile, plus trotuare, borduri și clădiri derivate din grila intersecțiilor. Alinierea este verificată la 1e-6 m față de pathul bandei și ancora liniei, iar raportul de inspecție listează explicit entitățile sursă fără mesh și geometria fără sursă. Cartierul autorat are 25 de intersecții (4 semaforizate, 4 cu STOP, 17 cu prioritate), 16 cvartale și 16 zone de serviciu; programele de semafor sunt statice și nu înlocuiesc controllerul036.

## Repere pentru distracție și provocări

V1 include zone de serviciu fictive pentru spital/maternitate, toalete publice sau benzinării/cafenele și terminal, plus parcare pentru drift, rampă și alee destructibilă. [Provocările](28-provocari-random-si-revenire.md) verifică accesibilitatea acestor zone înainte de ofertă. Distrugerea mobilierului decorativ nu elimină semantica STOP/semafor/benzi; obstacolele deplasate sunt raportate contextului fizic, conform [modulului 26](26-joaca-libera-haos-si-distrugere.md).

PBI034 adaugă [indexul spațial local](spatial-index.md) pentru observații autoritare de vehicule, obstacole și zone. Query-urile au filtrare geometrică3D, ownership finit și fallback complet pentru obiecte/query-uri mari; granițele, mișcarea și remove/recreate sunt comparate cu referința brută. Probe CPU și cleanup suplimentare sunt păstrate separat de gate-urile jocului complet.

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

Pipeline-ul construiește întâi fixture-uri semantice mici, apoi cartierul. Un validator produce IDs și poziții pentru erori. Decorul nu schimbă banda sau coliziunile fără o actualizare a datelor. Rutele civile și taxiurile folosesc același graf; un segment manual în afara grafului rămâne înregistrat fără a inventa o bandă.

PBI039 oferă [zonele de trecere și contextul de pericol](crosswalk-zones.md): traversări geometrice, linii cu IDs și observații explicite de pietoni/obstacole. O trecere goală nu produce expunere la pietoni sau dovezi de cedare. Implementarea semantică rămâne independentă de meshuri și de viitoarele NPC-uri.

## Repere pentru distracție și provocări

V1 include zone de serviciu fictive pentru spital/maternitate, toalete publice sau benzinării/cafenele și terminal, plus parcare pentru drift, rampă și alee destructibilă. [Provocările](28-provocari-random-si-revenire.md) verifică accesibilitatea acestor zone înainte de ofertă. Distrugerea mobilierului decorativ nu elimină semantica STOP/semafor/benzi; obstacolele deplasate sunt raportate contextului fizic, conform [modulului 26](26-joaca-libera-haos-si-distrugere.md).

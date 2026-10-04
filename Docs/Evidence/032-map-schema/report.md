# Dovezi PBI032 — schema hărții

Implementare statică în `src/world`: `parseRoadMap(unknown)` construiește o copie readonly înghețată, validează schemaVersion1/SI, geometria separată de reguli, referințele, direction/endpoints/membership, programele complete ale semafoarelor, conflictele GREEN declarate și reachability orientată per clasă la fiecare zonă de serviciu eligibilă. Publicarea este atomică: datele invalide aruncă MapValidationError și nu modifică inputul sau harta publicată.

Comenzi executate și rezultate reale:

- `node --import ./scripts/register-typescript.mjs --test tests/world/map-schema.test.ts`: **56/56 PASS**, rezultat în tests.txt. Include harta minimă, 44 relații negative, două mișcări, program cu mișcare din altă intersecție, GREEN merge/conflict, clase/access/reachability, capacitate, cicluri, copy/freeze/no-source-mutation, STOP+geometrie reverse validă și toate câmpurile numerice cu NaN/±Infinity/string.
- `npm run check`: **exit0,158/158 PASS** în check.txt, inclusiv typecheck/lint/format:check/check:architecture și suitele integrate existente la această execuție.
- `npm run build`: **exit0** în build.txt; avertisment existent pentru chunk Babylon >500kB, fără eroare de build.
- Fixture serializat prin parserul real: **PASS**, fixture.txt și minimal-map.json (3 lanes/1 intersection/1 signal/1 service/1 recovery/1 crosswalk).
- `PBI/Validate-Plan.ps1`: **Valid:true**, rezultat exact în plan.txt. A fost repetat după ce PBI013 a creat raportul referit de documentația sa; nu au fost modificate fișierele celuilalt PBI.

Revizia de bază și SHA256 pentru sursele/documentele validate sunt în source-manifest.json; fără commit/push în subtask.

Scope performanță: parser static cu schema de adâncime fixă, BFS iterativ, IDs și cozi locale plafonate; nu adaugă lucru per frame/tick, resurse GPU/worker sau istoric persistent. Nu declară FPS ori benchmark pentru harta maximă. Capacități finite:8192 intrări per array/65536 total,2048 lanes,256 intersections/signals/serviceZones,128 movements/conflictZones per intersection,128phases per signal. Loopurile de referințe nu sunt recursie pe graf.

Limitări geometrice explicite în ../../map-schema.md: bounds/edge/nonzero shoelace/bounding boxes și endpoint IDs; fără point-in-polygon robust, polygon simplicity, topologie/conflicte deduse geometric, fizică ori proof de lane adjacency. Authoringul completează conflictZoneIds; schema nu inventează conflicte omise. Reachability folosește successorIds și acces per clasă, fără neighbor lane-change edges și fără poziție longitudinală/staționare simulată. Nu implementează oraș800m, routing, editor sau meshuri.

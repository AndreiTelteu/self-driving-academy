# Treceri și context de pericol (PBI039)

`createCrosswalkZones(map)` validează și copiază harta032. `getZone(id)` oferă identitatea trecerii, poligonul semantic și liniile CROSSWALK cu IDs și geometrie. Rezultatele sunt readonly înghețate. Geometria reutilizată este partajată intern; meshurile, culorile și texturile nu participă la query.

`query({fromM, toM, laneId?, heightToleranceM?}, observations?)` testează segmentul parcurs, inclusiv traversarea completă între două puncte exterioare. Filtrul opțional de bandă folosește referințele declarate. Testul X/Z folosește conturul poligonului, inclusiv forme concave și margini; anvelopa verticală a poligonului plus toleranța explicită separă nivelurile. Toleranța implicită este 1m, admisă între0 și10m. Această anvelopă este un context semantic, nu un collider sau reconstrucția suprafeței unui pod înclinat.

`crossedStopLineIds` conține numai liniile cu intersecție geometrică și schimbare de parte. Sosirea exact pe linie este inclusă; plecarea de pe ea, staționarea și deplasarea coliniară nu repetă traversarea. Query-ul nu reține istoric și nu atribuie prioritate; deduplicarea oportunităților între tick-uri rămâne responsabilitatea telemetriei.

Observațiile explicite au entityId, kind PEDESTRIAN/OBSTACLE, poziție, rază, active și observable. Cel mult4096 observații distincte sunt admise; depășirea produce eroare, fără trunchiere. Sunt relevante numai observațiile active și observabile cu centrul în zona semantică și cu sfera intersectând segmentul parcurs în3D. Un pieton ascuns, absent, inactiv, deasupra trecerii sau în afara traiectoriei nu produce `hasPedestrianExposure`. Obstacolele au o listă separată și nu devin pietoni. Observațiile și rezultatele nu sunt păstrate între apeluri.

Expunerea este doar context: API-ul nu afirmă că șoferul a cedat, a încălcat o regulă ori a furnizat o demonstrație eligibilă. O trecere goală poate fi traversată geometric, cu listele de expunere goale. NPC-urile, percepția observabilă, rezultatele oportunităților și estimarea reacției apar în PBI-urile ulterioare; V1 nu inventează pietoni ca să producă dovezi.

Scope-ul obstacolelor aici este asocierea observațiilor cu trecerile existente. Zonele dinamice generale și collider-ele lumii aparțin contextului spațial și fizicii ulterioare. Pentru query-uri pe o hartă mare se furnizează laneId când este cunoscut; fără el sunt inspectate toate trecerile valide. Nicio zonă relevantă nu este eliminată pentru a respecta un plafon artificial de rezultate.

[Dovezile CPU și testele](Evidence/039-crosswalk-zones/report.md) documentează costul suplimentar, limita observațiilor și retenția. Nu există criteriu vizual pentru acest modul semantic și nu se declară un playtest al pietonilor inexistenți.

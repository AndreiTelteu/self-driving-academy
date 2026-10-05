# Graf direcționat de benzi (PBI033)

`createLaneGraph(unknown): LaneGraph` validează inputul prin parserul032 și deține copii readonly. Nu importă Babylon, DOM, mesh-uri sau corpuri fizice. Vecinii, succesorii și virajele provin exclusiv din semantica hărții; proximitatea vizuală nu creează o conexiune.

API-ul public:

- `getLane(id, access?)` și `getDirectedPath(id)` oferă metadata și polilinia în sensul de mers, noduri/poziții frozen și lungime3D în metri.
- `getNeighbors(id, access)` întoarce left/right, filtrate după accesul ambelor benzi. Vecinii sunt metadata laterală; nu adaugă muchii de succesor și nu certifică o schimbare de bandă liberă fizic.
- `getSuccessors`, `getConnections`, `getTurnConnections` și `canTraverse` cer TAXI/CIVIL. Se filtrează atât originea, cât și destinația. TURN are intersecția și Movement declarat; CONTINUATION are movement/intersection null. Muchiile inverse și virajele omise nu sunt inventate.
- `projectOnLane(id, query)` și `locateLane(query)` întorc LaneProjection sau null. ID-urile inexistente produc null/rezultate goale; clasele și numerele invalide sunt respinse.

FORWARD urmează ordinea pathului, REVERSE o inversează. LongitudinalM începe de la endpointul direcționat și cumulează lungimile3D. `headingRad` respectă schema: zero +X, pozitiv spre +Z. Projection raportează centrul, segmentul/fraction, distanța3D, heightOffset și lateralOffset (pozitiv la stânga direcției în planul X/Z).

Localizarea proiectează poziția pe fiecare segment relevant în planul X/Z, apoi interpolează înălțimea. Banda este o reuniune de coridoare de segment cu lățimea declarată și capete longitudinale finite: nu se atribuie banda înaintea începutului sau după sfârșit. Pentru un segment vertical permis de schema032 se proiectează Y; heading/lateralOffset sunt null, iar o interogare care cere heading nu îl acceptă. Nu transformăm această geometrie în dovadă de fezabilitate fizică.

Query cere `positionM` și `access`. `maxHeightDifferenceM` este implicit1,5m (0–100), pentru a separa etaje/overpass. Heading este opțional: fără el localizarea poate identifica semantic și banda unei mașini care merge invers, pentru analiza încălcării. Cu heading se cere compatibilitatea locală; toleranța implicită esteπ/3 și maximulπ/2, astfel încât sensul opus nu devine permis. Datum-ul vehiculului și toleranțele sunt responsabilitatea callerului, nu calibrare nouă a fizicii.

Selecția folosește distanța3D, apoi eroarea de heading, ID lexicografic și indexul segmentului. Tie-ul este determinist inclusiv la reordonarea benzilor. Nu există stare ascunsă de urmărire; callerul poate păstra istoricul în propriul scope. Pozițiile din golul intersecției sau în afara tuturor coridoarelor rămân null. Geometria mișcării de viraj nu este convertită artificial într-o bandă. Semaforul live, STOP, obstacolele și admiterea într-o intersecție sunt contracte separate; TURN static nu reprezintă permisiune de trecere pe RED.

Indexul spațial folosește celule32m și bounding boxes X/Z extinse cu jumătate de lățime. LANE_GRAPH_LIMITS fixează maximum256celule per bandă și32768referințe în total. Benzile prea mari sau peste capacitate rămân în fallback complet. Nu se trunchiază candidații. Interogarea verifică geometria exactă a candidaților și fallback-ul; rezultatul este comparat în teste cu proiecția exhaustivă. Poliliniile/segmentele precompute sunt partajate immutable per geometryId+direction, pentru a evita multiplicarea memoriei când multe benzi folosesc aceeași geometrie.

`getStats()` raportează lanes, connections, segments (referințe logice), geometryVariants/uniqueSegments (geometrie stocată), spatialCells/spatialReferences și fallbackLanes. Nu există cache sau istoric de query, listeners ori buclă proprie. Graphul este pur readonly și se eliberează prin eliminarea referințelor callerului; proiecțiile deja returnate îi aparțin callerului. Costul fallback-ului poate crește pe geometrii foarte mari/suprapuse și trebuie calibrat pe harta reală; indexarea nu justifică omiterea benzilor.

[Verificarea](Evidence/033-lane-graph/verification.md) include sens unic, paralel, acces, viraje permise/interzise, REVERSE, polilinii, overpass, tie-uri, ownership, capacități și probe CPU. Nu este routing, fizică, semnalizare live sau benchmark hardware al jocului.

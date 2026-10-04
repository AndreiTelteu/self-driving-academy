# Schema hărții implementată în PBI032

`src/world/index.ts` exportă `RoadMap`, tipurile componente, `parseRoadMap(unknown): RoadMap`, `MapValidationError` și `mapSchemaLimits`. Parserul validează structura și semantica împreună, construiește copii noi înghețate recursiv și returnează numai harta complet validată. Nu produce meshuri, rute, orașul de 800 m, coliziuni sau starea unei sesiuni.

## Versiune și coordonate

Formatul are exact schemaVersion=1, units=SI, mapId, bounds, geometry, lanes, intersections, signals, stopLines, crosswalks, serviceZones și recoveryPoints. Versiunea schemei diferă de revizia planului și de mapId; versiunile/cheile necunoscute sunt respinse, fără migrare implicită.

Coordonatele positionM și bounds.minM/maxM sunt Vector3{x,y,z} finite în metri: X/Z sunt planul drumului, Y este înălțimea. Direcția unei benzi urmează ordinea punctelor unui path pentru FORWARD și ordinea inversă pentru REVERSE. HeadingRad este un unghi în [-π,π], în radiani în planul X/Z; zero indică +X, unghiul pozitiv indică rotirea spre +Z. Parserul nu compară headingul de recovery cu tangenta benzii. WidthM este pozitiv ≤100 m, speedLimitMps pozitiv ≤200 m/s, durationS pozitiv ≤86400 s; acestea sunt limite de validare, nu calibrare de gameplay. Coordonatele sunt în [-1_000_000,1_000_000] m. Bounds au extindere X/Z strict pozitivă și extindere Y nenegativă (harta plană poate avea Ymin=Ymax).

## Geometrie distinctă de reguli

Geometry conține nodes{id,positionM}, paths{id,nodeIds} și areas{id,vertexNodeIds}. Pathul are minimum două noduri distincte; aria minimum trei noduri distincte, cu închidere implicită ultim→prim. Nu se repetă primul nod pentru închidere. Toate nodurile există și sunt în bounds; muchiile cu puncte identice sunt respinse. Aria proiectată X/Z trebuie să aibă valoare shoelace nenulă (|dublul ariei|>1e-8 m²).

Lane conține id, geometryId (path), direction, widthM, speedLimitMps, access (lista unică nenulă TAXI/CIVIL), neighbors{left,right} nullable, successorIds și fromIntersectionId/toIntersectionId nullable. IDs de geometrie și IDs semantice sunt distincte; fiecare ID de nod/path/arie/bandă/intersecție/mișcare/conflict/program/fază/linie/zonă/punct este unic în întregul document. MapId este identitatea documentului, în afara acestui namespace. ID-urile sunt șiruri nevide trimuite, de maximum 128 caractere.

Succesorul direct fără intersecție conectează exact nodul de sfârșit în sensul de mers cu nodul de început al benzii următoare; ambele capete sunt fără intersecție și benzile au cel puțin o clasă comună de acces. Succesorul prin intersecție trebuie să aibă o mișcare declarată în intersecția de destinație a benzii. Self successors și referințele duplicate sunt respinse. Neighbor este distinct, reciproc pe partea opusă, cu aceeași pereche from/toIntersectionId și direcții globale X/Z cu produs scalar pozitiv. Acest test semantic nu demonstrează distanță laterală, partea fizică left/right, suprapunere sau posibilitatea unei schimbări de bandă pe întreaga curbă.

## Intersecții, mișcări și semnale

Intersection are id, geometryId (area), incomingLaneIds, outgoingLaneIds, conflictZones{id,geometryId(area)} și movements{id,geometryId(path),fromLaneId,toLaneId,conflictZoneIds}. Apartenența este verificată în ambele sensuri: fiecare incoming lane are toIntersectionId corespunzător și fiecare outgoing lane are fromIntersectionId corespunzător; o bandă care declară intersecția trebuie să apară în lista potrivită. Capetele direcționate ale benzilor sunt în bounding boxul ariei intersecției.

Mișcarea conectează două benzi distincte, incoming→outgoing, cu acces comun. Pathul mișcării începe exact la endpointul direcționat al incoming și se termină exact la începutul outgoing; toate punctele lui sunt în bounding boxul intersecției. Perechea from/to este unică și are successor corespunzător. ConflictZoneIds referă exclusiv zone ale aceleiași intersecții; vertexurile zonei sunt în bounding boxul intersecției.

Signal are id, intersectionId și phases{id,durationS,movementStates[{movementId,state}]}. Există cel mult un program complet per intersecție. Fiecare fază atribuie exact o stare RED/YELLOW/GREEN fiecărei mișcări a intersecției, fără mișcări externe sau duplicate. Două GREEN simultane sunt respinse dacă împart o conflictZone declarată sau converg în aceeași toLaneId. Verificarea este liniară prin tabele pentru zone/destinații, fără toate perechile de mișcări. Controllerul semafoarelor, ciclul live, timpii de evacuare și tranzițiile YELLOW/all-red aparțin implementării ulterioare.

## STOP, treceri, servicii și recovery

StopLine are id, geometryId (path cu exact două noduri), laneId, anchorNodeId (nod pe pathul benzii), kind STOP/SIGNAL/CROSSWALK, intersectionId nullable și signalId nullable. O intersecție specificată trebuie să fie cea spre care merge banda. SIGNAL cere ambele IDs și concordanța programului/intersecției; STOP cere intersecție și signalId=null; CROSSWALK nu poate referi signalId. Poziția transversală a liniei și distanța până la endpoint nu sunt calculate.

Crosswalk are id, geometryId (area), laneIds și stopLineIds. Fiecare bandă traversată are minimum o linie CROSSWALK declarată, liniile aparțin benzilor declarate și unei singure treceri; liniile CROSSWALK orfane sunt respinse. Nu se demonstrează intersecția geometrică a poligonului cu banda.

ServiceZone are id, geometryId (area), laneId, anchorNodeId, access TAXI/CIVIL și kind PICKUP/DROPOFF/BOTH. Anchorul este un nod pe pathul benzii și în bounding boxul zonei. Access este subsetul accesului benzii. RecoveryPoint are id, nodeId, laneId și headingRad; nodul trebuie să aparțină pathului benzii.

**Criteriul de accesibilitate este deliberat puternic și orientat:** pentru fiecare clasă TAXI și CIVIL, din fiecare bandă care permite clasa trebuie să poată fi atinsă fiecare ServiceZone care permite clasa, urmând numai successorIds prin benzi care permit clasa. Lista de zone poate exclude explicit o clasă. Vecinii nu adaugă muchii de schimbare de bandă în această verificare. Pentru fiecare target, validatorul face BFS invers iterativ, cu un set visited și un index de coadă; ciclurile sunt valide și nu provoacă recursie. Aceasta verifică reachability la banda zonei, fără a simula poziția longitudinală, manevra pickup, loc de oprire, obstacole sau routing gameplay. Nu cere ca fiecare bandă să fie accesibilă din fiecare alta dacă toate pot ajunge la serviciile cerute.

## Diagnostice, limite și probe

Parserul refolosește cititorii publici `sessions` pentru unknown: obiecte simple Object/null, câmpuri proprii enumerabile de date, fără getters/simboluri/câmpuri ascunse/exotice; array-uri dense fără accessors sau extra fields. Fiecare obiect are formă exactă. NaN/Infinity/stringuri numerice sunt respinse. Nu se execută getters pentru diagnostic. MapValidationError extinde ContractValidationError și expune path, id și positionM când sunt disponibile; mesajul include cauza și ID-ul referinței lipsă. Validarea este deterministă în ordinea datelor și raportează prima eroare. O eroare de structură timpurie poate să nu aibă încă ID sau poziție validată.

Capacități statice: maximum 8192 intrări per array și 65536 intrări de array în total, 2048 benzi, 256 intersecții, 256 programe, 256 servicii, 128 mișcări/zone per intersecție și 128 faze per program. Schema are adâncime fixă; referințele sunt IDs, nu obiecte recursive. Nu păstrează cache/istoric între apeluri, nu lucrează pe tick/frame și nu alocă resurse GPU/worker. Dimensiunile sunt limite de format timpuriu; nu constituie benchmark de hartă maximă/203 și pot necesita revizie de schemă/calibrare înainte de authoringul complet.

Geometria verificată este explicit limitată: bounds, referințe, muchii nezero, arie proiectată nenulă, endpoint IDs și containment în bounding boxes. **Nu se pretinde point-in-polygon robust, polygon simplicity/self-intersection, coliziune fizică, lățime/curbură/gradient realizabile, compatibilitate cu vehiculele, topologie dedusă geometric ori detectarea conflictelor omise de autor.** ConflictZoneIds declarate trebuie completate corect de authoring; validatorul nu inventează zone din pathuri suprapuse.

`tests/world/fixture.ts` este harta minimă executabilă: trei benzi într-un ciclu orientat, intersecție cu mișcare și conflict, semafor, linie de semnal, crosswalk cu linie, serviciu pentru ambele clase și recovery. `tests/world/negative-fixtures.ts` adaugă două mișcări pentru teste de conflict/vecini. `tests/world/map-schema.test.ts` validează determinism/copy/freeze, relațiile negative, clase/reachability, structuri ostile și fiecare câmp numeric injectat cu NaN/±Infinity/string. Comandă: `node --import ./scripts/register-typescript.mjs --test tests/world/map-schema.test.ts`.

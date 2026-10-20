# Validarea integrității hărții (PBI043)

`checkMapIntegrity(input, options?): MapIntegrityReport` din `src/world/map-integrity.ts` este auditul determinist de încărcare pentru documentul de hartă authorat. Rulează peste datele PBI032/PBI042, peste graful direcționat PBI033 și peste plannerul PBI041, fără Babylon, DOM, meshuri, fizică sau stare de tick. Nu mută inputul și nu aruncă pentru conținut de hartă invalid: returnează un raport cu motive închise, căi de câmp, IDs și poziții.

Validarea nu înlocuiește `parseRoadMap`: parserul rămâne contractul de schemă și prima respingere. Auditul adaugă verificări pe care schema le permite structural, dar cartierul V1 nu le acceptă — suprapunere de coridoare, componente deconectate, zone nerutabile — și raportează toate problemele găsite, nu doar prima.

## API

```ts
import { checkMapIntegrity, createNeighbourhoodMap } from '../src/world';

const report = checkMapIntegrity(createNeighbourhoodMap());
if (!report.ok) for (const issue of report.issues) console.error(issue.reason, issue.path);
```

`MapIntegrityOptions` permite `expectedSchemaVersion`, `expectedUnits`, `expectedMapId` și `maxIssues` (plafon de detalii raportate, implicit 512). `issueCount` numără toate aparițiile chiar când lista este trunchiată; `truncated` semnalează acest caz.

`MapIntegrityReport` conține:

- `version` (`map-integrity-v1`), `mapId`, `schemaVersion`, `ok`, `issueCount`, `truncated`;
- `errorsByReason`: numărătoare pe vocabularul închis de motive;
- `issues`: listă sortată determinist după `path`, `reason`, `entityId`, `relatedId`;
- `coverage`: inventar de entități, referințe, conectivitate, matrice de rute, scenarii și starea fiecărei verificări;
- `schemaError`: mesajul parserului032 când documentul nu trece contractul de schemă.

Fiecare `MapIntegrityIssue` are `reason`, `check`, `path` (ex. `map.lanes[17].widthM`), `message`, `entityId`, `relatedId` și `positionM` (X/Y/Z în metri) când poziția este cunoscută.

## Vocabular închis de motive

| Motiv | Ce semnalează |
| --- | --- |
| `SCHEMA_INVALID` | versiune/unități/mapId/bounds invalide, nod în afara limitelor sau respingerea parserului032 |
| `DUPLICATE_ID` | ID repetat în namespace-ul global (inclusiv mișcări, zone de conflict, faze) |
| `MISSING_REFERENCE` | referință către nod/path/arie/bandă/intersecție/semnal/linie/zonă care nu există |
| `LANE_GEOMETRY_INVALID` | geometrie de bandă degenerată, succesor invalid, vecin nereciproc, acces lipsă |
| `LANE_WIDTH_INVALID` | lățime în afara intervalului de schemă (0, 100] m |
| `LANE_CORRIDOR_OVERLAP` | două coridoare paralele se suprapun față de lățimile declarate |
| `LANE_ENDPOINT_MISMATCH` | capătul direcționat al benzii nu este în caseta intersecției declarate |
| `ONE_WAY_INCONSISTENT` | sensul benzii/vecinului contrazice vectorul from → to |
| `DANGLING_LANE` | bandă fără succesor, fără serviciu și fără recovery |
| `ORPHAN_LANE` | bandă izolată, fără nicio legătură direcționată |
| `INTERSECTION_INVALID` | apartenență incoming/outgoing inconsistentă, zonă de conflict în afara intersecției |
| `MOVEMENT_INVALID` | mișcare către benzi greșite, geometrie deplasată, succesor lipsă, conflict străin |
| `SIGNAL_INVALID` | program lipsă/duplicat, fază incompletă, GREEN simultan incompatibil |
| `STOP_LINE_INVALID` | ancoră în afara benzii, intersecție/semnal nepotrivit, linie CROSSWALK orfană |
| `CROSSWALK_INVALID` | trecere fără acoperire pe fiecare bandă sau linie folosită de două treceri |
| `SERVICE_ZONE_INVALID` | ancoră în afara amprentei, acces peste accesul benzii, tip invalid |
| `SERVICE_ZONE_OVERLAP` | două amprente de serviciu se suprapun în planul X/Z |
| `RECOVERY_POINT_INVALID` | nod în afara benzii sau heading în afara [-π, π] |
| `CONNECTIVITY_DISCONNECTED` | graful direcționat are mai mult de o componentă tare conexă |
| `ROUTE_UNREACHABLE` | o zonă de serviciu nu este accesibilă/rutabilă pentru o clasă și o origine permise |

Vocabularul este exportat ca `MAP_INTEGRITY_REASONS`; testele resping orice motiv din afara lui.

## Verificările executate

| Check | Ce acoperă |
| --- | --- |
| `SCHEMA` | versiune, unități, mapId, bounds, poziții de nod, plus rezultatul parserului032 |
| `DUPLICATE_IDS` | IDs unice în toate colecțiile, inclusiv mișcări/zone de conflict/faze |
| `GEOMETRY_REFERENCES` | noduri/pathuri/arii rezolvabile, muchii nenule, arie proiectată nenulă |
| `LANE_REFERENCES` | geometryId, succesori, vecini, apartenență la intersecții, dangling/orphan |
| `LANE_GEOMETRY` | lățime, limită de viteză, lungime, capete, sens unic, suprapunere de coridor |
| `INTERSECTIONS` | liste incoming/outgoing în ambele sensuri, mișcări, zone de conflict |
| `SIGNALS` | referință intersecție, un program per intersecție, acoperire completă a mișcărilor, GREEN compatibil |
| `STOP_LINES` | geometrie cu două noduri, ancoră pe bandă, tip/intersecție/semnal, linii orfane |
| `CROSSWALKS` | arie, benzi, linii CROSSWALK, acoperire și ownership unic |
| `SERVICE_ZONES` | arie, bandă, ancoră în poligon, acces, tip, suprapunere de amprente |
| `RECOVERY_POINTS` | bandă, nod pe path, heading |
| `CONNECTIVITY` | componente tare/tare slab conexe, reachability inversă pe acces către fiecare zonă |
| `ROUTING` | matrice completă origine × zonă × acces prin `createRoutePlanner` (PBI041) |

Fiecare check are în raport `status` (`PASS`/`FAIL`/`SKIPPED`), `examined` și `issues`. Când parserul032 respinge documentul, `ROUTING` este `SKIPPED` cu motiv explicit, iar auditul structural continuă.

## Raportul de acoperire

`coverage.entityCounts` numără noduri, pathuri, arii, benzi, intersecții, mișcări, zone de conflict, semnale, faze, stări de mișcare, linii, treceri, servicii și recovery. `coverage.references` raportează referințe verificate, nerezolvate și defalcare pe tip.

`coverage.connectivity` raportează componentele tari/slabe, mărimea celei mai mari și, per clasă TAXI/CIVIL, benzile, zonele, perechile bandă–zonă accesibile și lista limitată de benzi nereachable.

`coverage.routing` raportează cererile, cele `READY`, eșecurile pe acces și zonele pickup/dropoff rutabile/nerutabile. Pentru cartierul real matricea are 2.880 de cereri (96 benzi × 15 zone permise × 2 clase) și toate sunt `READY`.

`coverage.scenarios` raportează direcțiile și accesele benzilor, clasele de drum, tipurile de intersecție, tipurile de linii și zone, accesele serviciilor, numărul de zone pickup/dropoff rutabile și recovery points. Acesta este raportul mașină–citibil cerut de PBI; CLI-ul îl scrie în JSON.

## CLI

```powershell
node scripts/map-integrity-report.mjs --json Docs/Evidence/043-map-integrity/report.json --md Docs/Evidence/043-map-integrity/report.md
```

Scriptul rulează peste `createNeighbourhoodMap()` real, tipărește raportul Markdown, scrie JSON-ul cu acoperirea completă și iese cu cod `1` dacă există cel puțin o eroare. Opțiunea `--map <fișier.json>` permite auditarea unui document extern; `--json` și `--md` sunt opționale. Ieșirea este deterministă pentru același document.

## Limite explicite

- Validarea este statică, la încărcarea hărții. Nu simulează trafic, semafoare live, blocaje, obstacole sau manevre pickup.
- Suprapunerea coridoarelor folosește segmente paralele de centru și lățimile declarate; nu este narrow-phase, nu modelează curbură, gradient, footprint de vehicul sau coliziune fizică.
- Suprapunerea zonelor folosește casete X/Z (conservator pentru poligoane neaxis-aliniate). Nu verifică self-intersecția poligoanelor, simplitatea sau suprafața exactă a amprentei.
- `ROUTING` certifică doar rutabilitatea pe graful static, cu costul PBI041 și fără `blocked`/trafic. Nu acordă permisie de trecere și nu înlocuiește semaforul, STOP-ul sau politica de prioritate.
- Rezultatele depind de datele authorate: un drum terminal legitim poate produce `DANGLING_LANE` dacă nu are serviciu/recovery; harta V1 nu are astfel de benzi.
- Lista de detalii este plafonată la 512 (configurabil); numărătoarea pe motive rămâne completă, iar `truncated` este explicit.
- Nu este benchmark de performanță. Auditul complet al cartierului durează ~0,17 s pe Node 24 în probele locale și nu rulează pe tick.

## Dovezi

[PBI043](../Evidence/043-map-integrity/README.md) păstrează raportul JSON/Markdown, ieșirile verificărilor, testele de corupție și porțile executate.

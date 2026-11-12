# Cartierul vizual în Babylon (PBI042)

Versiune 0.1 · 20 octombrie 2026. Parte din [planul complet](README.md). Contractul semantic al orașului rămâne [04](04-oras-si-retea-rutiera.md); schema este [map-schema](map-schema.md), graful [lane-graph](lane-graph.md), semafoarele [signals](signals.md), trecerile [crosswalk-zones](crosswalk-zones.md) și STOP-urile [stop-rules](stop-rules.md). Acest document descrie **legătura dintre datele de simulare și meshurile Babylon**, nu un al doilea model de hartă.

## Ce livrează

Două module, separate exact pe granița de arhitectură:

| Modul | Fișier | Rol |
| --- | --- | --- |
| `world` (pur, fără Babylon) | `src/world/neighbourhood.ts` | Harta 032 autorată a cartierului: 25 intersecții, 96 benzi dirijate, 16 cvartale, servicii, treceri, STOP/semafoare. |
| `world` (pur, fără Babylon) | `src/world/city-layout.ts` | Derivă `CityLayout` din orice `RoadMap` validat 032: suprafețe de bandă, marcaje, linii, treceri, semafoare, zone de serviciu, trotuare, borduri, clădiri. |
| `rendering/babylon` | `src/rendering/babylon/city-scene.ts` | Construiește meshurile Babylon din `CityLayout`, raportează batching/instanțe și eliberează tot la `dispose()`. |

`createCityLayout` nu importă Babylon, iar `createCityScene` nu importă servicii de simulare: primește numai datele înghețate ale layout-ului. Un consumator viitor (composition root) poate randa cartierul fără să atingă regulile.

## Regula de derivare

**Nu există o a doua geometrie.** Fiecare element vizual se calculează din datele 032 (și, pentru verificare, din graful 033). Pozițiile, rotațiile și dimensiunile nu sunt hardcodate în renderer; renderer-ul primește poligoane deja calculate în coordonate de hartă.

| Element | Sursă | Regulă |
| --- | --- | --- |
| `LANE_SURFACE` | `lane.id` | Banda direcționată a pathului (FORWARD/REVERSE) extrudată lateral cu `widthM/2`; câte un mesh per bandă, pentru identitate de trafic. |
| `LANE_MARKING` `EDGE_LINE` | `lane.id` | Linie solidă la marginea benzii unde `neighbors[side] === null`, inset `markingInsetM`. |
| `LANE_MARKING` `LANE_DIVIDER` | două benzi vecine | O linie întreruptă per pereche declarată, deținută de ID-ul lexicografic mai mic. |
| `LANE_MARKING` `CENTER_LINE` | perechea opusă cea mai apropiată | Linie întreruptă la mijlocul benzii de separare dintre cele două sensuri ale aceluiași segment. |
| `INTERSECTION_SURFACE` | `intersection.geometryId` | Poligonul ariei intersecției. |
| `STOP_LINE` | `stopLine.id` | Geometria cu exact două noduri, extinsă cu `stopLineThicknessM`; `kind` se păstrează. |
| `CROSSWALK` | `crosswalk.id` | Poligonul ariei; barele zebra sunt prezentare deterministă (număr = `floor(span/pitch)`) în interiorul poligonului declarat. |
| `SIGNAL_HEAD` | `signal.id` + banda de intrare | Un cap per bandă de intrare a intersecției semaforizate, la ancora liniei SIGNAL, deplasat pe partea dreaptă cu `widthM/2 + signalHeadSetbackM`, orientat invers sensului de mers. |
| `SERVICE_ZONE` | `serviceZone.id` | Poligonul ariei de serviciu; ancora rămâne în interior. |
| `GROUND`, `SIDEWALK`, `CURB`, `BUILDING` | `BLOCK` derivat | Grila de cvartale se derivă din centrele și jumătățile de lățime ale ariilor de intersecție; clădirile stau pe loturi deterministe în interiorul cvartalului, inset de trotuar. |
| Tip intersecție | hartă | `SIGNALIZED` dacă există program, altfel `STOP_CONTROLLED` dacă există linii STOP/SIGNAL, altfel `UNCONTROLLED`. |
| Clasă de drum | bandă | `ARTERIAL` dacă banda declară vecini laterali sau `speedLimitMps ≥ 13,4`; altfel `RESIDENTIAL`. |

Fiecare element are `id`, `kind`, `sourceType`, `sourceIds` și (pentru suprafețe) `footprintM` în metri, în coordonatele hărții. `stopKind`, `laneId`, `lateralOffsetM`, `longitudinalM`, `stripeCount`, `movementIds` și `lampState` păstrează legătura semantică.

## Aliniere și toleranțe

- **Toleranță de aliniere: 1e-6 m** pentru marginea benzii față de centrul liniei și pentru poziția capului de semafor față de ancora liniei. Este o toleranță de reprezentare (float), nu o calibrare de gameplay.
- Înălțimile de prezentare (`markingElevationM` 0,02; `crosswalkElevationM` 0,015; `groundElevationM` 0,06; `sidewalkElevationM` 0,14) sunt strict vizuale și nu se întorc niciodată în hartă.
- `verifyCityAlignment(map, layout)` recalculează independent geometria așteptată: muchiile benzii la `±widthM/2` față de fiecare nod al pathului, marcajele în interiorul benzii și la offset-ul lateral declarat, capetele de semafor pe linia STOP/SIGNAL, liniile/trecerile/zonele pe geometria autorată, clădirile în afara suprafeței de rulare. Rezultatul este o listă de probleme cu cod, `sourceId` și `elementId`.
- Testul compară și **mesh-urile reale**: fiecare vârf al unei benzi trebuie să fie la exact `widthM/2` de linia direcționată din graful 033 (calcul independent în test), iar centrul cutiei unui cap de semafor trebuie să fie poziția declarată.

## Raportul de inspecție

`createCityLayoutReport(layout, renderedElementIds?)` întoarce:

- număr de elemente pe tip (`elementsByKind`) și pe tip de sursă (`elementsBySourceType`);
- inventarul entităților sursă (`sourceCounts`) și tipurile de intersecție/clasele de drum;
- `unrendered`: entități sursă fără corespondent vizual, cu motiv explicit. Sunt permise numai `MOVEMENT`, `CONFLICT_ZONE` și `RECOVERY_POINT` cu motivul `SEMANTIC_ONLY`; benzile, liniile, trecerile, serviciile, intersecțiile și semafoarele nu au voie să apară aici;
- `phantomElementIds`: elemente ale căror `sourceIds` nu există în hartă (geometrie inventată) — trebuie să fie zero;
- `missingRenderedElementIds` / `unknownRenderedElementIds`: diferența dintre layout și meshurile raportate de `getRenderedElementIds()`, în ambele sensuri.

Raportul determinist se generează cu:

```powershell
node scripts/city-visual-report.mjs --json Docs/Evidence/042-city-visual/geometry-report.json --md Docs/Evidence/042-city-visual/geometry-report.md
```

## API Babylon

`createCityScene(scene, layout, { materials? })` întoarce `{ root, layout, stats, getRenderedElementIds, meshFor, lampFor, getResourceCounts, dispose }`.

- Suprafețele de bandă și capetele de semafor sunt meshuri individuale (identitatea contează); vopseaua, trotuarele, bordurile, clădirile și zonele sunt fuzionate într-un mesh per material (`batches`), cu `mergedElements` raportate separat.
- Materialele create aici sunt deținute de scenă și eliberate la `dispose()`. Materialele injectate prin `materials` sunt împrumutate (de exemplu paleta [daylight](lighting-quality.md)) și **nu** sunt eliberate de acest owner.
- `stats` raportează `elements`, `meshes`, `batches`, `individualElements`, `mergedElements`, `vertices`, `triangles` și `elementsByKind`. Sunt contoare de ownership, nu memorie GPU exactă și nu un buget de FPS.
- `dispose()` este idempotent; după el `getResourceCounts()` întoarce zero, iar `meshFor`/`lampFor` întorc `null`. `dispose()` se apelează înaintea scenei/backendului.
- Semnalele statice afișează starea primei faze autorate pentru prima mișcare declarată a benzii (nu un controller live); `movementIds` păstrează toate mișcările benzii, deci orice neconcordanță cu controllerul036 este detectabilă. Ciclul real aparține PBI036 și nu este duplicat aici.

## Cartierul autorat

`createNeighbourhoodMap()` întoarce un document 032 validat, determinist, cu:

- 25 intersecții într-o grilă de 5×5 (16 cvartale, 180 m × 180 m), bulevard arterial central cu două benzi pe sens și străzi rezidențiale cu o bandă pe sens;
- 4 intersecții semaforizate, 4 cu STOP (4-way, în interiorul cartierului) și 17 fără control (prioritate);
- 80 de treceri de pietoni (fiecare picior existent), 234 de linii STOP/SIGNAL/CROSSWALK, 16 zone de serviciu (PICKUP/DROPOFF/BOTH, inclusiv una doar TAXI și una doar CIVIL) și 6 puncte de recuperare;
- programe de semafor complete: mișcările de înaintare opuse sunt grupate câte două când geometria 035 o permite, fiecare viraj primește o fază proprie cu un singur GREEN, fiecare fază verde este urmată de YELLOW și programul se închide cu all-red. Toate cele 126 de mișcări semaforizate au exact o fază GREEN, iar `createSignalController` acceptă harta fără conflicte.

## Limitări

- Cartierul este conținut autorat determinist, nu un editor de hartă; modificarea layout-ului se face în datele 032, nu în renderer.
- Programele de semafor sunt didactice: nu modelează right-on-red, faza de protecție la stânga cu trafic opus și nici prioritizarea adaptivă. Fiecare viraj are fereastra lui verde.
- Zebrele, lățimea liniilor, înălțimile de vopsea și loturile de clădiri sunt reguli de prezentare documentate, nu valori de gameplay.
- Nu există LOD, ocluzie, coliziune, mobilier urban, pietoni sau mașini în scenă; clădirile sunt prisme simple.
- Capturile folosesc Chromium headless cu WebGL2 (SwiftShader); WebGPU nu era disponibil în mediul de captură. Nu se pretinde FPS sau buget GPU.

## Verificare

`node --import ./scripts/register-typescript.mjs --test tests/world/neighbourhood.test.ts tests/world/city-layout.test.ts tests/rendering/city-scene.test.ts`

Rezultatele, capturile și raportul geometric sunt în [Docs/Evidence/042-city-visual](Evidence/042-city-visual/README.md).

## Revizuire 157 — instanțiere, LOD și umbre pe aceleași date

PBI 157 păstrează regula de derivare și schimbă doar **cum** se trimit aceleași date către GPU. Nicio poziție, amprentă, culoare sau identitate nu se recalculează: `createCityScene` construiește în continuare geometria din `CityLayout`, dar o grupează.

| Ce se schimbă | Înainte | După |
| --- | --- | --- |
| `LANE_SURFACE` | câte un mesh per bandă (96) | un singur mesh de asfalt, cu interval de vârfuri per element |
| `SIGNAL_HEAD` (stâlp + carcasă) | câte un mesh per cap (26), cu două cutii coapte | instanțe thin ale unei cutii unitare: un host pentru stâlpi, unul pentru carcase |
| Lămpi de semafor | câte un mesh per cap (26) | un host thin per stare (roșu/galben/verde), cu 26 de instanțe în total |
| Draw calls ale layout-ului | 155 | 12 |
| Materiale statice proprii | neînghețate | înghețate (`freeze()`); materialele împrumutate de la caller rămân mutabile |

Identitatea rămâne explicită, ca date, nu ca mesh-uri per element:

- `elementGeometry(id)` → `{ host, offset, count }` pentru elementele fuzionate (benzi, marcaje, clădiri, trotuare);
- `instanceIndexFor(id, 'post' | 'housing' | 'lamp')` și `signalHostFor(id, part)` pentru capetele de semafor;
- `elementBounds(id)` → `[minX, minY, minZ, maxX, maxY, maxZ]` în coordonate de lume, calculat din intervalul de vârfuri sau din matricele instanțelor;
- `meshFor(id)` întoarce hostul care poartă elementul (nu mai este un mesh exclusiv), iar `lampFor(id)` hostul lămpii.

Matricele instanțelor sunt exact compoziția `T · R · S` a cutiilor coapte anterior (aceeași poziție, rotație `atan2(cos(facingRad), sin(facingRad))` și scară), deci silueta de pe ecran nu se schimbă. Diferența maximă măsurată între limitele unui element înainte și după este **2,9 × 10⁻⁵ m** (0,029 mm), adică limita de reprezentare `float32` a bufferelor de vârfuri. Instanțele nu creează obiecte Babylon: 923 de elemente ocupă 12 mesh-uri.

Pickingul nu este afectat: mesh-urile orașului rămân `isPickable = false`, iar selecția vehiculelor este acoperită separat de `VehiclePickingRegistry` (vezi `tests/rendering/render-instancing.test.ts`, care compară 48 de raze între varianta cu mesh-uri per vehicul și cea cu instanțe thin).

Limite declarate:

- starea lămpii este per host: schimbarea stării unui singur cap la runtime ar cere mutarea instanței între hosturi, deci nu este expusă; semafoarele rămân statice în layout, ca înainte;
- LOD-ul rămâne la nivel de batch (`BabylonCellBatches.updateLod`), nu per element de layout, pentru că un batch de celulă are o singură siluetă de comutat;
- orașul nu este înregistrat ca shadow caster: primește umbre (`receiveShadows`), nu aruncă, conform bugetului de umbre din [iluminare](lighting-quality.md).

Verificare: `npm run perf:render-budget -- --check` (proba structurală) și `node --import ./scripts/register-typescript.mjs --test tests/rendering/city-scene.test.ts tests/rendering/render-instancing.test.ts`.

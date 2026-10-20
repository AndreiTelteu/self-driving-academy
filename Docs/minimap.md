# Minimapă și traseul curent 074

Status: implementare și validare funcțională locală. `src/ui/minimap-format.ts` deține contractul,
transformarea world→map, proiecția comenzilor de desen și textul accesibil; `src/ui/minimap.ts` este
adaptorul DOM/canvas; `src/app/minimap.ts` compune geometria reală 032/033 cu taxiul 057, cursa 061 și
ETA/progresul 064. Modulul nu creează hartă, rută, taxi, zonă sau ETA și nu deschide o a doua cameră
Babylon.

## Ce desenează

- drumurile reale, ca polilinii direcționate din graful 033, plus ariile reale ale intersecțiilor 032;
- ruta curentă 041, exact secvența de benzi certificată de 064;
- taxiul la poziția reală raportată de host și săgeata direcției din headingul real;
- markerii de ridicare (`P`, cerc) și predare (`D`, pătrat), la ancorele reale ale zonelor de serviciu;
- progresul, ETA și motivul indisponibilității ca text, niciodată inventate.

Stratul static este desenat o singură dată pe un canvas de fundal. Ruta și markerii sunt pe un al
doilea canvas și se redesenează cu plafon de 10 Hz, independent de tick-ul autoritar.

## API

```ts
import { readMinimapFrame, readMinimapGeometry } from './app';
import { createMinimap } from './ui';

const geometry = readMinimapGeometry({ map, graph }); // 032 + 033, o singură dată
const minimap = createMinimap(hostElement, geometry); // canvase + text, fără listeners

const frame = readMinimapFrame(
  { fleet, lifecycle, eta }, // 057, 061, 064 reale
  {
    taxiId, // taxiul selectat
    tick, // tick-ul autoritar acceptat
    positionM, // citirea 005; null când nu există
    headingRad, // opțional, radiani în planul X/Z
    rideId, // opțional; altfel cursa activă a taxiului
  },
);
minimap.update(frame, nowMs); // markerii cel mult 10 Hz; schimbarea taxiului/cursei nu așteaptă
minimap.getStats(); // staticPaints, dynamicPaints, skipped, lanes, listeners
minimap.dispose(); // idempotent, elimină root-ul și referințele
```

Funcțiile pure exportate sunt `createMinimapTransform`, `projectMinimapPoint`, `createMinimapScene`,
`projectMinimap`, `paintMinimapLayer`, `parseMinimapFrame`. `MINIMAP_VERSION` este `074-minimap-v1`.

## Transformarea world→map

Harta este afișată **nord-sus**: în harta `neighbourhood-compact-v1`, `+Z` este nord, iar `+X` este est.
Transformarea este unică și deterministă:

```text
scale    = min((widthPx − 2·paddingPx) / (maxX − minX),
               (heightPx − 2·paddingPx) / (maxZ − minZ))
centerXM = (minX + maxX) / 2
centerZM = (minZ + maxZ) / 2
xPx      = widthPx / 2 + (xM − centerXM) · scale
yPx      = heightPx / 2 − (zM − centerZM) · scale
```

O singură scară pentru ambele axe păstrează unghiurile; `+Z` crește în sus pe canvas, deci un heading
de `0` indică dreapta, iar `π/2` indică sus. Dimensiunea implicită este 240×240 px cu padding 10 px.
Limitele și centrul provin exclusiv din `map.bounds`; nu există zoom, rotație sau cameră ascunsă.

## Geometrie statică refolosită

`readMinimapGeometry` citește harta validată și graful direcționat o singură dată:

| Element | Sursă reală | Regulă |
| --- | --- | --- |
| Benzi | `graph.getDirectedPath(lane.id)` | polilinia în sensul de mers, păstrată per bandă |
| Drumuri desenate | geometria 033 | deduplicare per `geometryId + direction` |
| Intersecții | `map.geometry.areas` | poligonul real al ariei, fără forme inventate |
| Mișcări | `map.intersections[].movements` | pathul real de viraj, folosit la joncțiunea benzilor de rută |
| Zone | `map.serviceZones[].anchorNodeId` | ancora reală a zonei |
| Limite | `map.bounds` | aceeași transformare pentru toate straturile |

`createMinimapScene` validează punctele finite, numărul de benzi și unicitatea ID-urilor; o geometrie
lipsă este o eroare de contract, nu un desen parțial.

## Ruta curentă 041 prin 064

Ruta este desenată **numai** din `EtaSnapshot.routeLaneIds` atunci când statusul este `READY` și
snapshotul 064 aparține aceleiași curse, taxi, etape și leg. Benzile consecutive sunt unite prin
pathul real al `Movement`-ului declarat; dacă nu există, se păstrează golul real al intersecției.

- Un `ROUTE_MISSING`, `ROUTE_STALE` sau `ROUTE_INVALID` produce `NO_ROUTE`, fără fallback la
  `pickupRouteLaneIds`/`tripRouteLaneIds` din cursă.
- Dacă o bandă din traseu nu are geometrie reală, întreaga rută devine `NO_ROUTE`; nu se desenează o
  rută parțială sau o linie inventată între zone.
- `OFF_ROUTE`, `POSITION_INVALID` și `SERVICE_BLOCKED` păstrează ruta lizibilă și ultimul progres
  certificat, dar ETA poate fi `Indisponibil`; poziția nu avansează progresul.
- O replanificare schimbă semnătura rutei, deci canvasul dinamic este șters și redesenat imediat;
  ruta veche nu rămâne pe ecran.
- Sosirea (`ARRIVED`) și cursa terminală nu inventează un traseu; textul spune explicit starea.

## Markeri

| Marker | Sursă | Regulă |
| --- | --- | --- |
| Taxi | `positionM` + `headingRad` de la host | proiecția poziției reale; nu este lipit de rută |
| Ridicare | `ride.pickupZoneId` → ancora zonei | litera `P`, cerc; lipsește dacă zona nu există |
| Predare | `ride.dropoffZoneId` → ancora zonei | litera `D`, pătrat; lipsește dacă zona nu există |

Markerii de ridicare/predare apar numai când cursa aparține taxiului selectat. O cursă a altui taxi
produce `FOREIGN_VEHICLE`, fără markeri P/D și fără rută. Forma și litera poartă sensul; culoarea doar
îl întărește.

## Stări explicite

| Situație | Rută | Taxi | Text |
| --- | --- | --- | --- |
| Rută 064 `READY` | desenată | proiectat | „Rută: N benzi · progres · ETA” |
| Fără estimare 064 | `NO_ROUTE` | proiecție dacă există | „Fără rută: 064 nu a observat încă o estimare” |
| `ROUTE_STALE` / `ROUTE_MISSING` | `NO_ROUTE` | proiecție dacă există | „Fără rută: … (motiv)” |
| Fără poziție | ruta poate rămâne | absent | „Poziția taxiului nu este disponibilă” |
| Alt taxi / fără cursă | `NO_ROUTE` | proiectat | „Nicio cursă activă…” / „Cursa aparține altui taxi…” |
| Cursă terminală | `NO_ROUTE` | proiecție dacă există | etapa și motivul 064, fără ETA activă |

Tick-ul care scade în aceeași sesiune/epoch produce `Stale minimap frame`; un ceas de afișare care
scade produce `Minimap clock`. Un cadru malformat este respins înainte de orice scriere sau desen.

## Frecvență, scrieri și disposal

- `staticPaints` rămâne 1 după oricâte cadre; `dynamicPaints` este plafonat la 10 Hz pentru poziții
  și progrese care se schimbă.
- Schimbarea taxiului, cursei, etapei sau rutei ocolește plafonul, ca selecția unui taxi distant să
  fie imediată. Un cadru identic nu redesenează și nu scrie text.
- Fiecare valoare are un nod stabil; textul se scrie numai când diferă. Nu există listeners, focus
  sau captură de tastatură.
- `dispose()` este idempotent, elimină root-ul și eliberează scena; după disposal `update` aruncă.

## Accesibilitate

Canvasurile sunt `aria-hidden`. Secțiunea are un `aria-label` scurt și un `aria-describedby` către un
paragraf cu descrierea completă: „Minimapă nord-sus (X est, Z nord)”, harta, taxiul, poziția,
progresul, ETA, motivul și zonele de ridicare/predare. Linia vizibilă de status este `role="status"`
cu `aria-live="polite"`. Starea fără rută sau fără poziție este text explicit, nu doar absența unui
desen.

## Limite

| Limită | Valoare |
| --- | ---: |
| Elemente DOM | 8 |
| Noduri de text | 4 |
| Listeners | 0 |
| Frecvență markeri | 10 Hz |
| Dimensiune implicită | 240×240 px |
| Benzi de rută | 256 |
| Benzi în geometrie | 4096 |
| Code units per identitate | 512 |

## Verificare

`tests/ui/minimap.test.ts` (12 teste) acoperă transformarea nord-sus, geometria statică reală, ruta
exactă 041/064 cu mișcarea reală de intersecție, poziția și headingul taxiului fără lipire de rută,
markerii P/D și inversarea lor, ruta stale/replanificată, stările fără rută/poziție, plafonul de
redesensare, validarea cadrelor, ciclul de viață și legarea reală 057/061/064.

```powershell
npm run hud:minimap
npm run hud:minimap -- --check
```

Runnerul scrie [report.json](Evidence/074-minimap/report.json) și
[report.md](Evidence/074-minimap/report.md): 6 scenarii deterministe și 25 de verificări, inclusiv
comenzile de desen și DOM-ul serializat. `npm test` include comparația cu transcriptul comis.
Captura Chromium opțională este documentată în [Evidence/074-minimap](Evidence/074-minimap/README.md).

## Ce NU este

- Nu este 032/033: nu validează harta și nu inventează drumuri, benzi, zone sau mișcări.
- Nu este 041: nu planifică și nu replanifică; desenează numai ruta certificată 064.
- Nu este 064: nu calculează ETA sau progres; le citește.
- Nu este a doua cameră Babylon, mesh sau randare a orașului.
- Nu este 073/075: nu formatează HUD-ul de condus și nu deține sunetul sau feedbackul.
- Nu măsoară FPS, GPU sau hardware; captura este o dovadă vizuală, nu o probă de performanță.

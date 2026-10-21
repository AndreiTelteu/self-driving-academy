# Tabloul orașului și drilldown de incidente 082

Status: implementare și validare funcțională locală. `src/ui/city-dashboard-format.ts` deține
contractul, agregarea, ordinea, textul și intenția de focalizare; `src/ui/city-dashboard.ts` este
adaptorul DOM; `src/app/city-dashboard.ts` compune lifecycle-ul real 061, incidentele reale 028 și
istoricul de sănătate 065. Modulul nu creează curse, incidente, poziții, profiluri sau cameră.

## Ce afișează

- șapte indicatori cu identitate închisă: curse finalizate, durată medie de cursă, distanță parcursă,
  încălcări, coliziuni, blocaje și confort;
- blocul de expunere: ferestre, observații și durată;
- lista de incidente cu tip, severitate, tick, vehicul, cursă și poziție;
- detaliul incidentului selectat, cu contextul indicatorilor și poziția reală sau explicit lipsă.

Fiecare valoare este un read model. Un indicator sau o expunere pe care build-ul nu o poate citi este
`UNAVAILABLE`, niciodată `0`.

## Regula indisponibil vs zero

| Situație | Contract | Text afișat | `data-state` |
| --- | --- | --- | --- |
| Sursa lipsește (ex. 137 nu este Done) | `state: 'UNAVAILABLE'`, `value: null`, `reason: 'SOURCE_MISSING'` | „Indisponibil” + „Sursă lipsă” | `UNAVAILABLE` |
| Fereastră fără curse, media nu există | `state: 'UNAVAILABLE'`, `value: null`, `reason: 'NO_EXPOSURE'` | „Indisponibil” + „Fără expunere” | `UNAVAILABLE` |
| Istoric 061/065 trunchiat | `state: 'UNAVAILABLE'`, `value: null`, `reason: 'NOT_CERTIFIED'` | „Indisponibil” + „Necertificat” | `UNAVAILABLE` |
| Zero real (ex. nicio coliziune în fereastră) | `state: 'AVAILABLE'`, `value: 0` | „0” | `AVAILABLE` |

Parserul respinge ambele scurtături interzise: un `UNAVAILABLE` care poartă o valoare (un zero fals) și
un `AVAILABLE` fără valoare. Expunerea urmează exact aceeași regulă: `windows`, `observations` și
`durationSeconds` sunt `null` când starea este `UNAVAILABLE`, iar o fereastră cunoscută cu zero curse
rămâne `AVAILABLE` cu `0`.

## API

```ts
import { createCityDashboard, parseCityDashboardSnapshot, selectIncident } from './ui';
import {
  createCityCollisionLog,
  createCityDashboardFocusPort,
  readCityDashboardSnapshot,
} from './app';

const dashboard = createCityDashboard(hostElement, {
  focus: createCityDashboardFocusPort({
    // Drilldown pe hartă: doar un punct și identitatea incidentului.
    focusMap: (positionM, incidentId) => map.focusIncident(positionM, incidentId),
  }),
});

const snapshot = readCityDashboardSnapshot(
  {
    context, // { sessionId, worldEpoch } din lumea reală
    lifecycle, // 061 real
    health, // 065 real
    collisions: collisionLog, // 028 real, colectat din drain
    positions, // (vehicleId) => { x, y, z } | null, citirea reală a hostului
  },
  { tick, selectedIncidentId },
);

dashboard.update(snapshot, nowMs); // cel mult 10 Hz
dashboard.select(incidentId); // echivalentul unui click pe rând
dashboard.getStats(); // metrics, rows, createdRows, writes, skipped, updates, focusEmits, listeners
dashboard.dispose(); // idempotent
```

Funcțiile pure exportate sunt `parseCityDashboardSnapshot`, `projectCityDashboard`, `selectIncident`,
`cityDashboardIncidentSignature`, `cityMetricView`, `cityExposureView`, `cityIncidentRow` și
`compareCityIncidents`, plus constantele `CITY_DASHBOARD_VERSION` (`082-city-dashboard-v1`),
`CITY_DASHBOARD_LIMITS`, `CITY_METRIC_IDS`, `CITY_METRIC_REASONS` și `CITY_INCIDENT_KINDS`.

## Snapshot

`CityDashboardSnapshot` este înghețat și are câmpuri exacte: `schemaVersion` (`1`), `units` (`SI`),
`version`, `sessionId`, `worldEpoch`, `tick`, `metrics`, `incidents`, `selectedIncidentId` și
`exposure`. Orice câmp necunoscut, duplicat, în afara limitelor sau contradictoriu este respins înainte
de orice scriere în DOM.

| Câmp | Regulă |
| --- | --- |
| `metrics[].id` | set închis de șapte identități, fără duplicate, în ordinea canonică |
| `metrics[].unit` | unitate închisă, obligatoriu cea a identității (`rides`, `s`, `m`, `count`, `score`) |
| `metrics[].value` | finit, nenegativ; `null` exact când starea este `UNAVAILABLE` |
| `metrics[].sampleSize` | întreg nenegativ sau `null` |
| `metrics[].reason` | `NO_EXPOSURE`/`SOURCE_MISSING`/`NOT_CERTIFIED` doar când starea este `UNAVAILABLE` |
| `exposure` | `windows`/`observations`/`durationSeconds` toate `null` sau toate numere |
| `incidents[]` | maximum 500, identități unice, `tick` întreg nenegativ |
| `incidents[].positionM` | `{x,y,z}` finit sau `null`; nicio coordonată inventată |
| `selectedIncidentId` | identitate mărginită sau `null`; un incident dispărut rămâne selectabil ca „lipsește” |

`metrics[].label` este textul sursei, mărginit la 96 code units; compoziția folosește etichetele
canonice din `CITY_METRIC_LABELS`.

## Incidente și ordine

Ordinea este parte din contract: `tick` descrescător, apoi `incidentId` crescător. Parserul reordonează
orice cadru acceptat, deci ordinea din array-ul sursă nu ajunge niciodată în DOM. Fiecare incident are
tip (`COLLISION`, `BLOCKAGE`, `VIOLATION`, `COMFORT`), severitate (`MINOR`, `MODERATE`, `SEVERE`), tick,
vehicul, cursă (`rideId` real sau `null`), poziție (`positionM` real sau `null`), etichetă și detaliu.

Un incident fără poziție este afișat cu „Poziție indisponibilă”, `data-located="false"` și nu poate fi
localizat. Lipsa poziției este explicită, nu completată cu un punct arbitrar.

## Selecția și focusul

`selectIncident(snapshot, incidentId)` este pur și întoarce vizualizarea selectată plus o singură
intenție:

```ts
{ status: 'AVAILABLE', incidentId, positionM }
| { status: 'UNAVAILABLE', reason: 'MISSING_INCIDENT' | 'MISSING_POSITION' }
```

Un click (sau Enter/Space nativ pe buton) selectează rândul, actualizează detaliul și, dacă poziția
există, emite exact o intenție prin portul injectat `focus(incidentId, positionM)`.
`createCityDashboardFocusPort({ focusMap })` mapează intenția la o focalizare a hărții și întoarce
`boolean`; un punct nefinit este refuzat fără să apeleze hostul.

**Selectarea este un drilldown de hartă, nu o schimbare de profil.** Modulul nu importă
`src/profiles/*`, nu citește și nu scrie profilul aplicat, modul camerei, autoritatea PLAYER sau fizica.
Rândurile selectate folosesc `aria-selected`, iar detaliul rămâne disponibil și fără poziție.

## Sursele reale

| Valoare | Sursă reală | Regulă |
| --- | --- | --- |
| `completedRides` | 061 `lifecycle.terminal()` cu `state === 'COMPLETED'` | zero real când nu există curse finalizate |
| `averageRideSeconds` | `totalCostSeconds` al curselor finalizate | medie numai cu eșantion pozitiv; altfel `NO_EXPOSURE` |
| `totalDistanceM` | portul opțional `rideDistanceM` | fără port sau fără măsurători → `UNAVAILABLE` |
| `violations`, `comfortScore` | provider opțional (137 nu este Done) | absent → `SOURCE_MISSING`, niciodată `0` |
| `collisions` | 028 `CollisionIncident` colectate în `createCityCollisionLog` | zero real când fereastra este completă |
| `blockages` | 065 `health.history()` cu `TRAFFIC_BLOCK`/`IMMOBILIZATION` | `rideId` real din `releasedRideId` |
| `exposure` | provider de ferestre sau retenția 061 | `droppedTerminal > 0` → `NOT_CERTIFIED` |

`createCityCollisionLog({ capacity? })` este un sink plafonat pentru incidentele reale 028:
`episodes.drain((incident) => { log.record(incident); })`. Rejucarea aceluiași `incidentId` este
idempotentă; când capacitatea elimină un incident, `complete()` devine `false` și rata de coliziuni
este `NOT_CERTIFIED`, nu o subnumărare tăcută.

## Accesibilitate

- `section[aria-label]` + `aria-describedby` explică sursele, regula indisponibil/zero și faptul că
  selectarea nu schimbă profilul.
- Fiecare card este un `li` cu etichetă, valoare, eșantion și motiv; starea este purtată de text și de
  `data-state`, niciodată doar de culoare. Zero real apare „0”, indisponibil apare „Indisponibil”.
- Lista este `ul[role="listbox"]`; fiecare rând este un `button[role="option"]` cu `aria-selected` și
  `aria-label` complet.
- Rezumatul este `role="status"` cu `aria-live="polite"` și `aria-atomic="true"`.
- Butoanele folosesc ordinea de tab nativă și comportamentul nativ Enter/Space. Adaptorul nu instalează
  niciun listener global de tastatură, deci tastele de condus rămân active.

## Limite

| Limită | Valoare |
| --- | ---: |
| Indicatori (set închis) | 7 |
| Incidente reținute | 500 |
| Ferestre de coliziune reținute | 500 |
| Frecvență de scriere/redare | 10 Hz |
| Code units per identitate | 512 |
| Code units per etichetă incident | 96 |
| Code units per detaliu incident | 512 |
| Proiecții reținute | 1 |

## Verificare

`tests/ui/city-dashboard.test.ts` (16 teste) acoperă: parserul strict (câmpuri, duplicate, plafon, unități,
contradicții), indisponibil vs zero pentru indicatori și expunere, scenariul fără expunere, selectarea cu
poziție care emite o singură intenție, selectarea fără poziție care nu emite nimic, absența oricărui import
sau câmp de profil, identitatea stabilă a rândurilor, ordinea deterministă, plafonul de 10 Hz cu bypass,
cadrul identic fără scrieri, cadrele malformate/în urmă fără atingere DOM, ciclul de viață și legarea reală
061/028/065.

```powershell
npm run city:dashboard
npm run city:dashboard -- --check
```

Runnerul scrie [report.json](Evidence/082-city-dashboard/report.json) și
[report.md](Evidence/082-city-dashboard/report.md): 7 scenarii deterministe (fără expunere, zero real,
incidente reale, poziție lipsă, incident selectat, indicator indisponibil, 60 de cadre plafonate) și 47 de
verificări, inclusiv DOM-ul serializat și statisticile adaptorului. `npm test` include comparația cu
transcriptul comis.

## Ce NU este

- Nu este 061/028/065: nu creează, nu avansează și nu repară curse, incidente, blocaje sau sănătatea flotei.
- Nu este 137: încălcările și confortul rămân `UNAVAILABLE` până când providerul real este livrat.
- Nu este 074/076: nu desenează harta, nu mută camera și nu teleportează vehicule; emite doar intenția de
  focalizare către host.
- Nu este 109/110/112: nu citește, nu compară și nu schimbă profilul; profilul este neatins prin construcție.
- Nu este 070: nu decide pauza; hostul aplică regula panourilor.
- Nu măsoară FPS, GPU sau hardware; raportul este un transcript determinist, nu o probă de performanță.

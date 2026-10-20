# HUD de condus 073

Status: implementare și validare funcțională locală. `src/ui/taxi-hud.ts` este adaptorul DOM, iar
`src/ui/taxi-hud-format.ts` conține contractul, validarea și formatarea pură. Compunerea dintre starea
reală și HUD este `src/app/taxi-hud.ts`. Modulul nu creează viteză, taxi, profil, cursă sau ETA și nu
desenează harta; el afișează exact read-model-urile acceptate de host.

## Ce afișează

HUD-ul implicit are nouă rânduri: viteză, mod de control, taxi, etapă, obiectiv, rută, ETA, progres și
starea serviciului. Rândul taxi arată slotul semantic 057 („Taxi #12”), nu ID-ul de mașină. ID-ul
complet al taxiului, clasa, ID-ul profilului, versiunea profilului aplicat, ID-ul cursei, etapa
tehnică 061, intervalul ETA, distanța rămasă și motivul ETA sunt într-un `<details>` închis implicit. Butonul „Detalii” este un `summary` nativ, deci se deschide din tastatură fără un
listener suplimentar și fără să blocheze condusul liber.

Modul este afișat simultan prin text și simbol, nu doar prin culoare:

| Mod | Simbol | Text obligatoriu |
| --- | --- | --- |
| `AUTO` | `A` | „Conduce AI-ul” |
| `MANUAL` | `M` | „Conduci · învățare oprită” |
| `LEARNING` | `L` | „Conduci · orașul învață” |

Etichetele sunt cele din [08](08-interfata-camera-si-control.md) și [mode-controls](mode-controls.md).
Culoarea din `data-mode` doar întărește simbolul și textul.

## API

```ts
import { createTaxiHud } from './ui';
import { readTaxiHudSnapshot } from './app';

const hud = createTaxiHud(hostElement);      // creează DOM-ul o singură dată
const snapshot = readTaxiHudSnapshot(
  { fleet, lifecycle, eta },                 // 057, 061, 064 reale
  {
    taxiId,                                  // taxiul activ/selectat
    mode,                                    // proiecția acceptată 066/067
    tick,                                    // tick-ul autoritativ acceptat
    speedMps,                                // citirea fizică 005, magnitudine m/s
    rideId,                                  // opțional; altfel cursa activă a taxiului
  },
);
hud.update(snapshot, nowMs);                 // cel mult 10 Hz
hud.getStats();                              // noduri, texte, update-uri, scrieri
hud.dispose();
```

Funcțiile pure exportate sunt `parseTaxiHudSnapshot`, `projectTaxiHud`, `modeView`, `rideStageView`,
`formatSpeedKmh`, `formatDuration`, `formatEtaRange` și `formatDistanceM`. `TAXI_HUD_VERSION` este
`073-taxi-hud-v1`.

## Snapshot

`TaxiHudSnapshot` este un obiect înghețat, cu câmpuri exacte:

| Câmp | Sursă reală | Regulă |
| --- | --- | --- |
| `schemaVersion`, `units`, `sessionId`, `worldEpoch` | contextul 057 | `1`, `SI`, identități bounded |
| `tick` | tick-ul acceptat al hostului | întreg nenegativ, monoton |
| `speedMps` | citirea fizică 005 | finit, nenegativ sau `null` |
| `mode` | proiecția 066/067 | `AUTO`, `MANUAL` sau `LEARNING` |
| `taxi` | 057 `FleetVehicle` + `FleetVehicleState` | ID, slot, clasă, profil, versiune aplicată |
| `ride` | 061 `RideRecord` | ID, taxi, stare, zone pickup/dropoff |
| `ride.eta` | 064 `EtaSnapshot` | status, motiv, serviciu, secunde, interval, progres |

`readTaxiHudSnapshot` citește `fleet.get`/`fleet.state`, cursa activă 061 pentru taxi (sau `rideId`
explicit) și `eta.estimate(rideId)`. Nu inventează valori când lipsește ceva:

- taxi necunoscut în registru → `taxi: null`;
- nicio cursă activă → `ride: null`;
- nicio estimare 064 → `status: 'NOT_OBSERVED'`;
- estimare pentru altă etapă, alt taxi sau altă stare 061 → `NOT_OBSERVED`, ca un ETA vechi să nu
  rămână pe ecran după pickup/dropoff sau după schimbarea taxiului.

## Formatare și unități

| Valoare | Regulă | Exemplu |
| --- | --- | --- |
| Viteză | `round(m/s × 3.6)`, unitate `km/h` | `12.5 m/s` → `45 km/h` |
| Durată | rotunjire la secundă; sub un minut `N s`, apoi `M min SS s` | `125.4 s` → `2 min 05 s` |
| Interval ETA | același format pentru minim/maxim | `55 s – 1 min 05 s` |
| Distanță | sub `1000 m` în metri, altfel un decimal în `km` | `1234.5 m` → `1.2 km` |
| Progres | procent rotunjit, apoi distanța rămasă | `42% · 320 m` |
| ETA nominală | prefix `~`, niciodată fără unitate | `~1 min 30 s` |

ETA `ARRIVED` este afișat „La pasager” pe etapa pickup și „La destinație” pe etapa trip, nu „0 s”. `UNAVAILABLE` este afișat „Indisponibil”, iar
motivul închis 064 apare doar în detalii. Lipsa unei curse este „Nicio cursă activă”, niciodată
„Cursă încheiată”.

## Stări explicite

| Situație | Etapă | ETA | Progres |
| --- | --- | --- | --- |
| Fără taxi / fără cursă | „Nicio cursă activă” | „Fără estimare” | `—` |
| Cursă a altui taxi | „Cursă a altui taxi” | „Fără estimare” | `—` |
| `TO_PICKUP` | „Spre pasager” | ETA 064 sau „Fără estimare” | progres certificat |
| `PICKUP` | „La pasager” | „La pasager” când 064 certifică sosirea | `100% · 0 m` |
| `TO_DROPOFF` | „Spre destinație” | ETA 064 | progres certificat |
| `DROPOFF` | „La destinație” | „La destinație” când 064 certifică sosirea | `100% · 0 m` |
| `COMPLETED` | „Cursă încheiată” | `—` | `100% · 0 m` |
| `FAILED` / `CANCELLED` | „Cursă eșuată” / „Cursă anulată” | `—` | `—` |
| `SERVICE_BLOCKED` | etapa reală | „Indisponibil” | ultimul progres certificat |

## Prospețime, scrieri și accesibilitate

- Tick-ul scade în aceeași sesiune/epoch → `Stale taxi HUD snapshot`; ceasul de afișare scade →
  `Taxi HUD clock`. Un update respins nu atinge DOM-ul.
- Scrierile sunt plafonate la `10 Hz`. Schimbarea modului, taxiului, cursei sau stării cursei ocolește
  plafonul, ca eticheta să nu rămână în urmă; un cadru identic nu scrie nimic, deci textul nu
  pâlpâie.
- Fiecare valoare are un nod stabil; `textContent` se schimbă doar când valoarea diferă. `getStats()`
  raportează `updates`, `writes`, `skipped`, `elements`, `textNodes` și `listeners: 0`.
- `section[aria-label]` descrie modul, taxiul și etapa. Rândul de mod are `role="status"` și
  `aria-live="polite"`; viteza are `output` cu etichetă vocală completă („Viteză: 45 kilometri pe
  oră”). Rândurile cursă sunt `dl/dt/dd`, deci eticheta și valoarea sunt asociate nativ.
- HUD-ul nu are listeners, nu captează tastatura și nu cere focus; `details` este singura suprafață
  interactivă și folosește comportamentul nativ al browserului.

## Limite

| Limită | Valoare |
| --- | ---: |
| Elemente DOM | 45 |
| Noduri de text | 38 |
| Listeners | 0 |
| Frecvență de scriere | 10 Hz |
| Proiecții reținute | 1 |
| Code units per identitate | 512 |

## Verificare

`tests/ui/taxi-hud.test.ts` (12 teste) acoperă: conversia și rotunjirea vitezei, formatul duratei și
al intervalului, etichetele și simbolurile celor trei moduri, toate stările 061, legarea la
registrul 057/lifecycle 061/ETA 064 reale, profilul și versiunea din detalii, starea fără cursă,
schimbarea taxiului și a modului fără text rămas, cursa altui taxi, cursa terminală, serviciul
`BLOCKED`, respingerea cadrelor malformate sau în urmă, ciclul de viață mărginit și transcriptul comis.

```powershell
npm run hud:taxi
npm run hud:taxi -- --check
```

Runnerul scrie [report.json](Evidence/073-hud/report.json) și
[report.md](Evidence/073-hud/report.md): șapte scenarii deterministe (AUTO, MANUAL, LEARNING,
BLOCKED, COMPLETED, fără cursă, cursă a altui taxi) și 23 de verificări, inclusiv DOM-ul serializat.
`npm test` include comparația cu transcriptul comis. Captura vizuală opțională este documentată în
[Evidence/073-hud](Evidence/073-hud/README.md).

## Ce NU este

- Nu este 005/024: nu citește Poziția/Viteza din fizică și nu calculează magnitudinea; hostul îi dă
  `speedMps`.
- Nu este 061/064: nu creează, nu avansează și nu replanifică o cursă sau un ETA; doar citește.
- Nu este 066/067: nu decide modul și nu trimite intenții M/L; primește modul acceptat.
- Nu este 057: nu creează taxiuri și nu aplică versiuni de profil.
- Nu este minimapă, cameră, sunet, KPI, tarif sau review; acelea rămân 017/074/075/079/209.
- Nu certifică FPS, GPU sau hardware; captura este o dovadă vizuală a DOM-ului, nu o măsurătoare de
  performanță.

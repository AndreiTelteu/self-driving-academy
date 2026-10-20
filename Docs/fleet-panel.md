# Lista taxiurilor 075

Status: implementare și validare funcțională locală. `src/ui/fleet-panel-format.ts` deține contractul,
filtrele, sortarea, regulile de păstrare și textul accesibil; `src/ui/fleet-panel.ts` este adaptorul
DOM; `src/app/fleet-panel.ts` compune registrul real 057, lifecycle-ul 061 și ETA 064. Modulul nu
creează taxi, cursă, profil, ETA sau blocaj și nu mută niciun vehicul: un click emite doar intenția de
selecție, pe care hostul o trimite lui 068.

## Ce afișează

Lista conține fiecare taxi real din registrul 057, cu slotul semantic („Taxi #12”), starea
(`Liber`, `În cursă`, `Blocat`), modul de control acceptat (`A`/`M`/`L` cu eticheta din 073), etapa
cursei 061 („Spre pasager”, „La pasager”, „Spre destinație”, „La destinație” sau „Nicio cursă
activă”), ETA 064 („~1 min 30 s”, „Indisponibil”, „Fără estimare”, „La pasager”, „La destinație”) și
clasa + ID-ul/versiunea profilului aplicat. Mașinile civile nu apar aici; ele rămân subiectul lui 076.

Starea este purtată de text și de simbol, niciodată doar de culoare. Un rând blocat are
`data-state="BLOCKED"`, textul „Blocat” și `data-blocked="true"`.

## API

```ts
import { createFleetPanel } from './ui';
import { createFleetPanelSelectPort, readFleetPanelSnapshot } from './app';

const panel = createFleetPanel(hostElement, {
  select: createFleetPanelSelectPort({ bodyIdentity, selection }), // 068, port injectat
});

const snapshot = readFleetPanelSnapshot(
  { fleet, lifecycle, eta }, // 057, 061, 064 reale
  { tick, followedTaxiId },  // tick acceptat + ținta camerei
);
panel.update(snapshot, nowMs);   // cel mult 10 Hz
panel.setFilter('BUSY');         // imediat, ocolește plafonul
panel.setSort('ETA');            // imediat, ocolește plafonul
panel.open();                    // afișează view-ul reținut
panel.close();                   // doar ascunde; nu golește și nu reconstruiește
panel.getStats();                // rows, createdRows, moves, writes, skipped, listeners
panel.dispose();                 // idempotent
```

Funcțiile pure exportate sunt `parseFleetPanelSnapshot`, `projectFleetPanel`,
`fleetPanelBlockedSignature`, `FLEET_PANEL_LIMITS`, `FLEET_PANEL_FILTERS`, `FLEET_PANEL_SORTS` și
etichetele lor. `FLEET_PANEL_VERSION` este `075-fleet-panel-v1`.

## Snapshot

`FleetPanelSnapshot` este înghețat și are câmpuri exacte; orice câmp necunoscut, duplicat sau în afara
limitelor este respins înainte de orice scriere în DOM.

| Câmp | Sursă reală | Regulă |
| --- | --- | --- |
| `schemaVersion`, `units`, `sessionId`, `worldEpoch` | contextul 057 | `1`, `SI`, identități mărginite |
| `tick` | tick-ul acceptat al hostului | întreg nenegativ, monoton |
| `followedTaxiId` | ținta camerei 017/068 | ID mărginit sau `null`; un civil nu fixează niciun rând |
| `taxis[].vehicleId/slot/classId/profileId` | 057 `FleetVehicle` | numai `driverKind: TAXI` |
| `taxis[].appliedProfileVersion/controlMode` | 057 `FleetVehicleState` | versiunea aplicată și modul acceptat |
| `taxis[].ride` | 061 `RideRecord` | `null` când taxiul nu are cursă activă |
| `taxis[].ride.eta` | 064 `EtaSnapshot` | status, motiv, serviciu, secunde, interval, progres |
| `taxis[].serviceState` / `blocked` | 064 `serviceState` | `blocked` este exact `serviceState === 'BLOCKED'` |

`readFleetPanelSnapshot` citește `fleet.list()`, `fleet.state()`, `lifecycle.active()` și
`eta.estimate(rideId)`. Nu inventează valori:

- un taxi fără cursă activă → `ride: null`, ETA „Fără estimare”;
- nicio estimare 064 → `status: 'NOT_OBSERVED'`;
- estimare pentru altă cursă, alt taxi, altă etapă sau alt leg → `NOT_OBSERVED`, ca un ETA vechi să nu
  rămână pe rând după pickup/dropoff;
- un taxi listat fără stare acceptată este o eroare de contract, nu o valoare implicită inventată.

## Filtre și sortare

| Filtru | Include | Implicit |
| --- | --- | --- |
| `ALL` | toate taxiurile | da |
| `BUSY` | taxiurile cu cursă activă | |
| `FREE` | taxiurile fără cursă activă | |
| `BLOCKED` | taxiurile cu serviciu blocat certificat | |

Regula de păstrare se aplică după filtru și înainte de sortare:

1. **Taxiul urmărit este mereu prezent**, indiferent de filtru. Dacă selecția este un civil, nu există
   rând de fixat și lista nu inventează unul.
2. **Primul taxi blocat** (slotul cel mai mic) este mereu prezent cât timp există un taxi blocat.
3. `counts.pinned` numără exact rândurile adăugate de aceste două reguli; `pinned: true` apare pe rând,
   iar descrierea accesibilă spune „păstrat de filtru”.

| Sortare | Ordine |
| --- | --- |
| `SLOT` (implicit) | slot crescător, apoi `vehicleId` |
| `STATE` | blocat, `TO_PICKUP`, `PICKUP`, `TO_DROPOFF`, `DROPOFF`, fără cursă, terminal, apoi slot |
| `ETA` | ETA certificată crescător, apoi cele indisponibile, apoi slot |

Sortarea rulează după ce apartenența este decisă, deci nu poate duplica sau elimina un rând. Fiecare
rând are `rowId = vehicleId`, iar semnătura view-ului este deterministă.

## Identitate stabilă și scrieri

- Un singur element de rând per `vehicleId`, creat la prima apariție și refolosit la filtrare,
  sortare și redeschidere. Rândurile filtrate sunt detașate, nu distruse; sunt eliminate numai când
  taxiul dispare din snapshot.
- `getStats().createdRows` crește o singură dată per identitate; `moves` numără reordonările reale;
  `rows` este numărul de rânduri vizibile, `retainedRows` numărul reținut.
- Scrierile și reordonările sunt plafonate la `10 Hz` (`FLEET_PANEL_LIMITS.maximumHz`). Schimbarea
  taxiului urmărit, a filtrului, a sortării sau a stării de blocaj ocolește plafonul.
- Un cadru identic nu scrie nimic (`signature` neschimbată). Un cadru malformat, în urmă sau cu ceas
  descrescător este respins înainte de orice atingere a DOM-ului.
- `close()` doar setează `hidden`; `open()` reafișează view-ul reținut fără să recreeze rânduri.

## Accesibilitate

- `section[aria-label]` descrie filtrul, sortarea și numărul vizibil; `aria-describedby` duce la un
  paragraf cu regulile de păstrare și explicația „selectarea schimbă doar ținta camerei”.
- Lista este `ul[role="listbox"]`; fiecare rând este un `button` cu `role="option"`,
  `aria-selected="true"` numai pe taxiul urmărit și `aria-label` egal cu descrierea completă.
- Rezumatul filtrării este `role="status"` cu `aria-live="polite"` și `aria-atomic="true"`.
- Butoanele sunt în ordinea de tab nativă; Enter și Space declanșează click-ul browserului. Adaptorul
  nu instalează niciun listener global de tastatură, deci tastele de condus rămân active.
- `getStats().listeners` raportează exact două listenere de `change` plus unul per rând reținut.

## Limite

| Limită | Valoare |
| --- | ---: |
| Taxiuri V1 listate | 30 |
| Taxiuri maxim (capacitate 066/068) | 110 |
| Rânduri | 110 |
| Frecvență de scriere/reordonare | 10 Hz |
| Elemente per rând | 8 |
| Noduri de text per rând | 6 |
| Code units per identitate | 512 |
| Proiecții reținute | 1 |

## Verificare

`tests/ui/fleet-panel.test.ts` (18 teste) acoperă: parserul strict (câmpuri, duplicate, plafon,
contradicții), cele 30 de taxiuri randate, toate combinațiile de filtre cu taxiul urmărit și blocajul
păstrate, cele trei sortări stabile fără duplicate, panoul închis/redeschis fără reconstrucție,
plafonul de 10 Hz și ocolirea lui, cadrul identic fără scrieri, selecția și `aria-selected`, cadrele
respinse fără atingerea DOM-ului, ciclul de viață, legarea reală 057/061/064, ETA aruncată după
schimbarea etapei, serviciul BLOCKED explicit și adaptorul de selecție 068.

```powershell
npm run fleet:panel
npm run fleet:panel -- --check
```

Runnerul scrie [report.json](Evidence/075-fleet-panel/report.json) și
[report.md](Evidence/075-fleet-panel/report.md): 7 scenarii deterministe (ALL, BUSY, FREE, BLOCKED,
închis/redeschis, 60 de cadre plafonate, legarea reală) și 44 de verificări, inclusiv DOM-ul serializat
și statisticile adaptorului. `npm test` include comparația cu transcriptul comis.

## Ce NU este

- Nu este 057: nu creează taxiuri, clase, profiluri sau versiuni aplicate.
- Nu este 061/064: nu creează, nu avansează și nu replanifică o cursă sau un ETA.
- Nu este 068/066/067: nu deține selecția, autoritatea sau modul; emite o singură intenție `FLEET` prin
  portul injectat și nu mută, nu teleportează și nu preia niciun vehicul.
- Nu este 074: nu desenează harta și nu citește poziția.
- Nu este 076: nu listează mașinile civile.
- Nu este 070: nu decide pauza; hostul aplică regula panourilor.
- Nu măsoară FPS, GPU sau hardware; raportul este un transcript determinist, nu o probă de
  performanță.

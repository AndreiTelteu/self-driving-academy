# Selectarea live a oricărui taxi sau civil 263

Status: implementare locală V1. `src/app/live-fleet-selection.ts` proiectează cadrul autoritar al
compunerii în lista și harta flotei; `src/ui/fleet-selection-format.ts` deține contractul, filtrele și
identitatea rândurilor; `src/ui/fleet-selection-panel.ts` este adaptorul DOM. Selecția, preluarea și
eliberarea rămân comenzile proprietarului compunerii, nu ale panoului.

## Ce face

- Listează **toate** taxiurile și mașinile civile din lumea live: cele 24 de taxiuri și 32 de civile
  create de 262, plus `taxi-01` și `civil-01` din compunerea V3. Identitatea stabilă este
  `vehicleId`-ul compunerii; sloturile 9998/9999 sunt numai de prezentare pentru cele două mașini
  parcate, nu o a doua identitate de flotă.
- Un click pe rând, pe markerul hărții sau Enter/Space pe butonul nativ schimbă **doar** ținta
  camerei. Vehiculul rămâne în AUTO, autoritatea nu se mută și niciun vehicul nu este scris.
- `M` este preluarea explicită. Dacă ținta selectată este deja mașina condusă, `M` păstrează
  comportamentul 257 AUTO↔MANUAL. Dacă este altă mașină, preluarea eliberează vehiculul vechi în AUTO
  și revendică noua mașină în același tick, deci există cel mult un scaun `PLAYER`.
- `L` este tot o intenție explicită: din 271, preia ținta selectată în LEARNING sau comută mașina
  condusă LEARNING ↔ MANUAL. Butonul `L` din panou este activ când există o țintă selectată;
  eligibilitatea și segmentul sunt raportate de owner-ul 271, nu inventate de panou.
- Filtrele `Toate`, `Disponibile`, `În cursă` și `Blocate` sunt decise înainte de sortare. Rândul
  țintei camerei și rândul scaunului `PLAYER` rămân vizibile indiferent de filtru, marcați
  `păstrat de filtru`; nu sunt duplicate.
- Harta refolosește markerii 076 (`vehicleId`, `T`/`C`, `aria-pressed`) peste geometria reală 032/033
  și transformarea 074. Minimapa completă și HUD-ul rămân la 281.

## Preluarea unei mașini AI

Un actor 058 are poziția și ruta lui reală. La preluare, compunerea:

1. citește poziția autoritară a actorului din cadrul tickului curent;
2. îngheață actorul cu `traffic.setAuthority(id, 'MANUAL', tick)` fără să scrie poziția;
3. mută autoritatea pe aceeași poziție, fără teleport și fără o a doua autoritate.

Cât timp jucătorul conduce actorul, compunerea trimite poziția condusă înapoi la 058 prin
`traffic.reconcile(...)` înainte de fiecare pas. Astfel ocupația benzii și liderii celorlalți actori
rămân reale, iar actorul nu este întors la poziția înghețată.

La eliberare, `reconcile` proiectează poziția condusă pe banda reală. Dacă banda este încă pe ruta
planificată, ruta este păstrată; dacă mașina a părăsit ruta, plannerul real 041 calculează continuarea
către **aceeași destinație** și înregistrează un replan. Abia apoi `resume` readuce actorul în AUTO.
O poziție care nu poate fi proiectată pe graful de benzi este refuzată explicit, fără să fie mutată
mașina cu forța. Cursele și destinațiile rămân ale modulelor 058/061; panoul nu inventează niciun
`rideId`.

## API

```ts
import { createFleetSelectionPanel, projectFleetSelection } from './ui';
import { readLiveFleetSelectionSnapshot } from './app';

const snapshot = readLiveFleetSelectionSnapshot({
  tick: frame.tick,
  sessionId: status.sessionId,
  worldEpoch: status.worldEpoch,
  vehicles: frame.vehicles,
  authority: frame.authority,
  cameraEntityId: frame.camera.entityId,
  characterEntityId: frame.character.entityId,
  selectedVehicleId: frame.selectedVehicleId,
  playerVehicleId: frame.playerVehicleId,
});

panel.update(snapshot, nowMs); // listă + hartă, 10 Hz
panel.open(); // focus pe filtru, Tab/Escape în panou
panel.close(); // refuză numai dacă era închis; nu inventează rezumat
```

Comenzile compunerii sunt `selectVehicle(vehicleId | null)`, `requestTakeover(vehicleId, 'MANUAL' |
'LEARNING')`, `requestRelease()` și `takeOverSelected('MANUAL' | 'LEARNING')`. `requestTakeover`
validează imediat și aplică la următorul tick; `frame.selectedVehicleId`, `frame.playerVehicleId`,
`frame.camera.entityId` și `frame.events` sunt citirile acceptate.

## Accesibilitate și pauză

- Rândurile sunt butoane native `role="option"` cu `aria-selected`, `aria-pressed` și descriere
  completă: etichetă, tip, stare, mod, poziție, ținta camerei, scaunul PLAYER și regula de păstrare.
- Panoul este un singur `role="dialog"` cât timp este deschis; focusul intră pe filtru, Tab/Shift+Tab
  rămân în panou, Escape îl închide și readuce focusul. Nu există listener pe `window`/`document`.
- Deschiderea panoului în AUTO nu suspendă observarea; când preluarea schimbă modul în MANUAL,
  owner-ul 070 suspendă simularea. O preluare sau o eliberare acceptată închide panoul, ca simularea
  să reia imediat și comanda să se aplice la următorul tick; un refuz sincron lasă panoul deschis cu
  motivul. Închiderea manuală reia simularea și readuce focusul pe canvas.
- Tastele de condus nu sunt captate de panou. Cât timp un buton are focusul, filtrul 025 al tastaturii
  le blochează ca în orice suprafață focalizată; după închidere canvasul redevine ținta.

## Limite

| Limită | Valoare |
| --- | ---: |
| Vehicule per cadru | 110 |
| Rânduri/markeri | 110 |
| Frecvență listă/hartă | 10 Hz |
| Listeners globali | 0 |
| Scaune `PLAYER` simultane | 1 |
| Sloturi de prezentare pentru mașinile parcate | 9998 / 9999 |

## Verificare

- `tests/app/live-fleet-selection.test.ts` (5 teste): toate cele 58 de vehicule, selecția care mută
  doar camera, preluarea unui actor 058 cu poziție neschimbată și rută păstrată, taxiul parcat preluat
  și eliberat pe ruta AUTO, eliberarea în AUTO, un singur scaun `PLAYER` și refuzul explicit `L`.
- `tests/ui/fleet-selection.test.ts` (6 teste): parser strict, filtre cu ținta și scaunul fixate,
  click doar pe cameră, preluare separată, auto-închidere după acțiune, Tab/Escape, plafonul de 10 Hz
  cu bypass pentru selecție, zero listeners globali și markerii 076.
- `tests/ui/game-shell-host.test.ts` verifică butonul `Flotă` al gazdei shell-ului.
- `npm run shell:probe` rămâne proba shell-ului 260; proba dedicată 263 este
  `npm run fleet:selection:probe` (Playwright opțional, `NOT_RUN` cu motivul real dacă lipsește).
  Rezultatul local curent este [NOT_RUN](Evidence/263-fleet-selection/report.md): Playwright nu este
  instalat în checkout, deci nicio probă de browser nu este pretinsă. [README-ul dovezilor](Evidence/263-fleet-selection/README.md)
  listează comenzile și testele structurale.

## Ce NU este

- Nu este 262: nu creează taxiuri, civili, rute sau profiluri.
- Nu este 264/265: nu creează curse, pasageri, pickup sau dropoff; `rideId` este citit.
- Nu este 271: trimite intenția `L`, dar modul, eligibilitatea și segmentul 069 rămân owner-ului
  271.
- Nu este 279: nu atinge setările, remaparea sau stilul.
- Nu este 281: harta completă, minimapa HUD și layout-ul rămân acolo.
- Nu este 282: mișcarea rămâne adaptorul cinematic al compunerii, nu fizica Rapier.

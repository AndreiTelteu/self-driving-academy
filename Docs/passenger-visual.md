# Pasageri simplificați și markers 147

Status: implementare și validare funcțională locală. `src/ui/passenger-visual-format.ts` deține
contractul și parserul, `src/ui/passenger-visual.ts` este adaptorul de comenzi, iar
`src/app/passenger-visual.ts` compune starea reală 061 cu ancorele reale 032. Modulul este un read
model vizual: nu conduce taxiul, nu creează pasageri fizici, pietoni, evenimente, telemetrie sau
oportunități și nu închide cursa.

## Faze, ocupare și vizibilitate

| Stare reală 061 | Fază 147 | `occupancy` | `passengerVisible` | Markeri |
| --- | --- | ---: | --- | --- |
| `TO_PICKUP` | `WAITING_PICKUP` | 0 | `false` | `PICKUP` |
| `PICKUP` | `BOARDING` | 0 | `true` | `PICKUP`, `PASSENGER` |
| `TO_DROPOFF` | `ONBOARD` | 1 | `true` | `DROPOFF` |
| `DROPOFF` | `DROPPING_OFF` | 1 | `true` | `DROPOFF` |
| `COMPLETED` / `FAILED` / `CANCELLED` | `NONE` | 0 | `false` | niciunul |
| fără cursă activă | `NONE` | 0 | `false` | niciunul |

`passengerVisible` descrie existența reprezentării V1: în `BOARDING` pasagerul stă la ancora reală de
ridicare, iar în `ONBOARD`/`DROPPING_OFF` este așezat în taxiul revendicat de cursă. Modulul nu are o
coordonată de scaun și nu inventează una, deci în mașină nu apare un marker separat. `occupancy`
spune dacă pasagerul este la bord, nu dacă un mesh este în scenă.

## Markeri și ancore reale

| Marker | Sursă | Regulă |
| --- | --- | --- |
| `PICKUP` | `ride.pickupZoneId` → `map.serviceZones[].anchorNodeId` → `map.geometry.nodes` | litera `P`, poziția exactă a ancorei 032 |
| `PASSENGER` | aceeași ancoră de ridicare | litera `S`, numai în `BOARDING`; nu are coordonată proprie |
| `DROPOFF` | `ride.dropoffZoneId` → ancora reală | litera `D`, numai în `ONBOARD`/`DROPPING_OFF` |

Fiecare marker are `markerId = passengerMarkerId(rideId, role)`, adică identitatea stabilă
`rideId + rol`. Nu este o poziție în array, un nod Babylon, un index de mesh sau o coordonată.
Aceeași cursă păstrează același marker pentru rolul care rămâne vizibil după o schimbare de fază;
rolurile care nu mai aparțin fazei sunt eliminate.

O zonă lipsă produce omisiunea `ZONE_MISSING`, iar o ancoră lipsă produce `ANCHOR_MISSING`, ambele cu
`zoneId`-ul real. Markerul este omis, textul accesibil numește motivul, iar poziția nu este
înlocuită cu un punct fabricat, cu zero sau cu o interpolare. O cursă care aparține altui taxi este
tratată ca străină: fără pasager și fără markere.

## API

```ts
import { readPassengerVisualFrame, createPassengerRideBridge } from './app';
import { createPassengerVisualPresenter } from './ui';

const frame = readPassengerVisualFrame(
  { lifecycle, map }, // 061 real și harta validată 032
  {
    taxiId, // taxiul selectat
    tick, // tick-ul autoritar al hostului
    rideId, // opțional; altfel cursa activă revendicată de taxi
    sessionId, // opțional; implicit namespace-ul lifecycle-ului
    worldEpoch, // opțional; 147 nu deține epoch
  },
);

const presenter = createPassengerVisualPresenter(port); // port: setMarker/removeMarker/setPassengerVisible/clear
presenter.update(frame); // comenzi deterministe; un cadru identic nu scrie nimic
presenter.getStats(); // markers, commands, cleared, updates, rejected
presenter.dispose(); // idempotent, golește portul o singură dată
```

`createPassengerRideBridge({ lifecycle, map, presenter })` leagă citirea pură de adaptor. Bridge-ul
nu are dispatcher, pickup, dropoff, telemetrie sau port de pietoni; `present` doar citește 061 și
scrie în presenter. `stats()` raportează `pedestrianActors`, `opportunityEvents` și
`telemetryEvents` ca zero structural.

Formatul cadrului este închis: `schemaVersion: 1`, `units: 'SI'`, `version:
'147-passenger-visual-v1'`, context (`sessionId`, `worldEpoch`), `tick`, `taxiId`, `rideId`,
`phase`, `occupancy`, `passengerVisible`, `markers`, `omissions`, `labels`, `accessibleText`, `reset`.
Parserul respinge câmpurile necunoscute, identitățile peste limită, coordonatele ne-finite, rolurile
duplicate, markerii incompatibili cu faza și omisiunile fără motiv închis. Ieșirea este înghețată, iar
`passengerVisualSignature` este determinist.

## Fără efecte secundare

- Proiecția nu apelează `begin`, `apply`, `advance` sau `reset` pe lifecycle și nu citește
  dispecerul; nu există `dispatcher.release`. Prezentarea unui cadru nu schimbă starea, tick-ul,
  tranzițiile, revendicarea sau statusul taxiului.
- `DROPPING_OFF` nu este `COMPLETED`: numai un `DROPOFF_COMPLETE` explicit al 063 închide cursa.
- Nu se creează telemetrie, oportunități, evenimente de joc sau actori pietoni. Pietonii autonomi V2
  și personajul V3 rămân în afara acestui contract.
- Nu există `Date`, `performance.now`, `setTimeout`, `setInterval`, `requestAnimationFrame` sau
  `Math.random`. Tick-ul este furnizat de apelant.
- Un cadru malformat sau cu tick în urmă în aceeași sesiune/epoch este refuzat înainte de orice
  comandă și este numărat în `rejected`.

## Reset și schimbarea cursei

Un cadru `NONE` are `reset: true` și produce cel mult un `clear()`: markerii, ocuparea și
vizibilitatea sunt șterse, fără pasager rezidual. Un `NONE` ulterior, când portul este deja gol, nu
mai scrie nimic. O cursă terminală păstrează în text starea și motivul real; un `lifecycle.reset`
real lasă cadrul fără `rideId`. La schimbarea taxiului sau a cursei, markerii vechi sunt eliminați
prin identitatea lor stabilă, iar o cursă nouă pornește curat.

## Limite

| Limită | Valoare |
| --- | ---: |
| Markeri per cadru | 2 |
| Omisiuni per cadru | 2 |
| Comenzi per cadru acceptat | 5 |
| Code units per identitate | 512 |
| Code units per etichetă scurtă | 64 |
| Code units per text accesibil | 1024 |
| Pietoni V1 | 0 |

## Verificare

`tests/ui/passenger-visual.test.ts` (8 teste) acoperă parserul închis, identitățile, coordonatele
finite, rolurile duplicate, comenzile deterministe, cadrul identic, schimbarea de fază, resetul,
respingerea înainte de scriere și disposal-ul. `tests/app/passenger-visual.test.ts` (8 teste) acoperă
serviciul complet `TO_PICKUP → PICKUP → TO_DROPOFF → DROPOFF → COMPLETED`, ancorele reale, absența
efectelor secundare și a dovezilor de pietoni/telemetrie, resetul, ancora/zona lipsă și schimbul de
taxi/cursă.

```powershell
npm run passenger:visual
npm run passenger:visual -- --check
```

Runnerul scrie [report.json](Evidence/147-passenger-visual/report.json) și
[report.md](Evidence/147-passenger-visual/report.md): 7 scenarii deterministe și 40 de verificări.
`--check` eșuează dacă transcriptul comis diferă, iar `npm test` include aceeași comparație.

## Ce NU este

- Nu este un asset 3D, un GLB, o animație sau o captură de browser. Nu pretinde că pasagerul are mesh
  final; reprezentarea este un marker și o stare de ocupare.
- Nu este sistemul de pietoni V2 și nu creează actori de trafic, coliziuni sau dovezi de comportament.
- Nu este pickup 062 sau dropoff 063: nu observă poziția, viteza ori staționarea și nu emite
  evenimente de ridicare/predare.
- Nu este HUD 075, ETA 064 sau minimapă 074; nu desenează rute, taxiuri sau ETA.
- Nu persistă în savefile și nu deține un epoch; contextul este furnizat de composition root.
- Raportul este o probă funcțională deterministă, nu o măsurătoare de FPS/GPU/hardware.

# Indicatori de confort cu pasager 139

Status: implementare și validare funcțională locală (`targeted`). `src/experiments/comfort-metrics.ts`
deține contractul, derivarea intervalelor, sumarea și acumulatorii incrementali;
`src/app/comfort-metrics.ts` compune sursele reale 085/088/061/069/028 și adaptorul pentru tabloul
082. Modulul nu creează curse, incidente, blocaje, distanțe sau oportunități și nu atinge fizica,
profilul, camera, rendererul sau store-ul.

## Ce calculează

Confortul este definit **numai cu pasager la bord**. Unitățile sunt SI și rata de simulare este cea
declarată de 085 (60 Hz); modulul nu citește niciun ceas de perete.

| Indicator | Unitate | Formulă | Eșantion |
| --- | --- | --- | --- |
| `intervals` | `count` | intervale cu pasager acceptate | fapte, fără numitor |
| `passengerSeconds` | `seconds` | `Σ durationSeconds` | intervalele acceptate |
| `jerkSamples` | `count` | perechi de intervale consecutive ale aceleiași curse | perechi derivate |
| `lateralSamples` | `count` | intervale cu accelerație laterală măsurată | intervale măsurate |
| `peakAccelerationMps2` | `m/s²` | maximul `|accelerație longitudinală|` | intervale acceptate |
| `meanAccelerationAbsMps2` | `m/s²` | `Σ |accelerație| / intervale` | intervale acceptate |
| `peakLateralAccelerationMps2` | `m/s²` | maximul componentei laterale | intervale măsurate |
| `meanLateralAccelerationMps2` | `m/s²` | `Σ |lateral| / intervale măsurate` | intervale măsurate |
| `peakJerkMps3` | `m/s³` | maximul `|jerk|` | perechi de intervale |
| `accelerationViolations` | `count` | intervale cu `|accelerație| > comfort_deceleration` | intervale acceptate |
| `jerkViolations` | `count` | perechi cu `|jerk| > acceleration_jerk` | perechi derivate |
| `lateralViolations` | `count` | intervale cu `|lateral| > capability` | intervale măsurate |

Pragurile de confort sunt **valorile implicite livrate de catalogul de parametri ai proiectului**
(`comfort_deceleration` = 2 m/s² și `acceleration_jerk` = 2 m/s³), citite la import din
`src/profiles/parameter-registry.ts`. Ele nu sunt numere inventate pentru metrică și nu urmează un
profil publicat: confortul nu este o cheie de profil.

Limita laterală este **capabilitatea reală a clasei vehiculului**, măsurată de 085
(`grip × 9,81 m/s²`; pentru sedan 12,753 m/s²). Nu este o preferință de confort, ci limita
mecanică a vehiculului; când nu poate fi certificată, lateralul nu este raportat ca încălcare.

## Cine intră în agregare

- **Doar intervalele cu pasager.** Prezența pasagerului este derivată din ciclul de cursă real
  061: `TO_DROPOFF` și `DROPOFF` au pasager la bord, `TO_PICKUP`/`PICKUP` nu. O cursă fără pasager
  este sărită explicit (`null`), nu agregată cu zero.
- **Toate taxiurile, în toate modurile.** `AUTO`, `MANUAL` și `LEARNING` sunt agregate identic;
  snapshotul are câte un rând per mod plus rândul de flotă. Eligibilitatea pentru învățare a
  segmentului 069 este înregistrată ca fapt și **nu** filtrează agregarea.
- **Taxiurile din afara camerei sunt egale cu cele vizibile.** Modulul nu citește camera, selecția
  sau rendererul; composition root-ul primește faptele de telemetrie ale flotei și atât. Un taxi
  nevizibil contribuie cu aceleași intervale ca unul vizibil.

## Fereastra utilizabilă și excluderile

Singura sursă de excludere este **filtrul real 088**:

- un eșantion al cărui tick este într-un span suprimat nu intră în metrică;
- un interval care traversează un span suprimat este eliminat;
- consecința: teleportarea 030 și impulsul de impact nu pot deveni confort al comenzii.

Impactul real nu dispare prin filtrare: el este o consecință separată a experienței pasagerului.
Evenimentul `PASSENGER_IMPACT` (incident 028 real, cu impulsul și cursa) este numărat într-un
agregat propriu (`impacts`, `impulseSumNs`, `peakImpulseNs`, `affectedRides`) și ajunge în modelul
de review **alături** de termenul de confort, niciodată în amestecat cu el.

## Derivarea intervalelor și unica sursă de adevăr

`deriveComfortIntervals` este singura funcție care produce intervale, iar
`summarizeComfortIntervals` este singura funcție care le rezumă. Misiunea 121, tabloul 082 și
modelul de review folosesc aceleași funcții și aceleași agregate:

| Consumator | Citește |
| --- | --- |
| misiunea 121 (`comfortMissionOutcomeFromAggregates`) | agregatul per cursă al read modelului 139 |
| tabloul 082 (`toCityDashboardComfortMetrics`) | scorul de confort al modelului de review 139 |
| modelul de review (`comfortReviewModel`) | aceleași agregate, plus impactele separate |

Nu există calcule paralele: `src/missions/comfort.ts` nu mai are propria formulă de accelerație și
jerk, ci apelează derivarea și rezumarea din 139. Verificarea din suită compară, pe aceleași fapte,
numerele misiunii cu agregatul incremental al serviciului.

Accelerația longitudinală este derivată din viteza reală a două eșantioane consecutive
(`(v₂ − v₁) / Δt`), jerkul este diferența dintre două accelerații consecutive împărțită la durata
intervalului următor, iar componenta laterală este partea perpendiculară pe direcția de mers a
modificării reale a vitezei (`|Δv − (Δv·û)û| / Δt`). Componenta laterală este `null` când
vectorul de viteză nu este disponibil: nu se raportează niciodată un zero fabricat.

## Agregări incrementale

Serviciul păstrează doar contoare, sume, maxime și un model de lectură per cursă mărginit. Nu
există istoric de evenimente și nu există eșantioane integrale:

- `getStats().historyScans` și `snapshot.historyScans` sunt structural `0`;
- `snapshot()` citește exclusiv acumulatorii; repetarea lui nu rescanează nimic;
- ingestia este idempotentă după identitatea evenimentului, iar intervalele aceleiași curse sunt
  acceptate în ordine de tick (un interval care se suprapune peste ultimul este `OUT_OF_ORDER`);
- jerkul este derivat incremental din ultimul interval al cursei, deci o cursă nouă nu rescrie
  istoricul uneia vechi.

| Limită | Valoare |
| --- | ---: |
| Chei de idempotență reținute | 8192 (FIFO) |
| Curse reținute în modelul de lectură | 512 (FIFO) |
| Code units per identitate | 1024 |
| Durată maximă per interval | 60 s |
| Tick-uri maxime per interval | 3600 |
| Accelerație maximă per interval | 1000 m/s² |
| Jerk maxim per interval | 100 000 m/s³ |
| Impuls maxim per impact | 10¹² N·s |
| Istoric de evenimente păstrat | 0 |
| Scanări de istoric per snapshot | 0 |

O cursă eliminată din modelul de lectură (FIFO) nu pierde agregatele de flotă: contoarele cumulate
supraviețuiesc, iar `droppedRides` raportează eliminarea.

## Evenimente și idempotență

| `kind` | Câmpuri | Reguli |
| --- | --- | --- |
| `PASSENGER_INTERVAL` | `eventId`, `rideId`, `vehicleId`, `controlMode`, `learningEligible`, `fromTick`, `toTick`, `durationSeconds`, `longitudinalAccelerationMps2`, `lateralAccelerationMps2`, `lateralLimitMps2` | `learningEligible` trebuie să coincidă cu `controlMode === 'LEARNING'`; `toTick > fromTick`; valori finite |
| `PASSENGER_IMPACT` | `eventId`, `rideId`, `vehicleId`, `tick`, `incidentId`, `impulseNs` | identități mărginite, impuls nenegativ |

- Parserul este închis: câmpuri necunoscute, valori nefinite, identități peste 1024 code units și
  vocabulare necunoscute sunt `REJECTED` cu un motiv închis (`INVALID_SHAPE`, `UNKNOWN_FIELD`,
  `UNKNOWN_KIND`, `INVALID_IDENTITY`, `INVALID_NUMBER`, `INCONSISTENT_STATE`, `LIMIT_EXCEEDED`,
  `OUT_OF_ORDER`). Un eveniment respins nu schimbă niciun acumulator.
- `eventId` este cheia de idempotență. Re-ingestia aceluiași eveniment este `DUPLICATE` și nu
  dublează nimic; composition root-ul folosește `(rideId, fromTick, toTick)` pentru intervale și
  `incidentId` pentru impacte.

## Modelul de review

Termenul de confort al formulei de rating din modulul 22
(`rating = clamp(5 − delayPenalty − comfortPenalty − …, 0, 5)`) este citit din aceleași agregate:

```
comfortPenalty = min(5, accelPenalty + jerkPenalty + lateralPenalty)
comfortScore   = 5 − comfortPenalty
```

Coeficienții sunt versionați cu modelul (`139-comfort-review-v1`): 2 puncte pentru fracția de
intervale cu accelerație peste prag, 2 pentru jerk, 1 pentru lateral, plafonat la baza de rating 5.
Fără interval cu pasager, termenul de confort este `null` (nicio expunere, niciun termen
certificat), nu un 5 perfect. Impacturile călătoresc lângă termenul de confort, ca fapte
separate de incident.

## Adaptorul 082

`toCityDashboardComfortMetrics(snapshot)` produce doar `comfortScore`, cu unitatea 082 `score` și
`sampleSize` egal cu numărul intervalelor cu pasager. Fără expunere, indicatorul este
`UNAVAILABLE` cu `value: null` și motivul `NO_EXPOSURE`. Contractul 082 nu este modificat.

## API

```ts
import { createComfortMetrics, comfortReviewModel } from './experiments';
import {
  ingestComfortImpact,
  ingestComfortRide,
  readComfortSnapshot,
  toCityDashboardComfortMetrics,
} from './app';

const comfort = createComfortMetrics();

ingestComfortRide(comfort, {
  rideId,
  vehicleId,
  rideState, // 061: 'TO_DROPOFF' transportă pasagerul
  readouts, // 085: mostrele reale ale cursei
  artifactWindows, // 088: ferestrele reale ale cursei
});
ingestComfortImpact(comfort, { incident, rideId, vehicleId, rideState });

const snapshot = readComfortSnapshot(comfort, { tick, simulatedSeconds });
const review = comfortReviewModel(snapshot);
const dashboardMetrics = toCityDashboardComfortMetrics(snapshot);
```

## Relația cu 137 și 138

- **137** rămâne proprietarul indicatorilor de serviciu. Nu calculează confort și nici nu îl
  copiază: adaptorul său 082 expune doar `completedRides`, `averageRideSeconds`, `totalDistanceM`,
  `collisions` și `blockedIntervals`.
- **138** rămâne proprietarul încălcărilor per oportunitate. Nu calculează confort; adaptorul său
  expune doar `violations`.
- **139** este singurul proprietar al confortului: intervale, agregate, scor și termen de review.
  Cele trei module nu împart acumulatori: 139 are propriul serviciu, propriul vocabular de evenimente
  și propriul adaptor 082.

## Ce NU este

- Nu este 061/028: nu creează curse și nu creează incidente; consumă faptele lor reale.
- Nu este 085/088: nu înregistrează telemetrie și nu filtrează artefacte; consumă mostrele și
  ferestrele lor reale.
- Nu este 121: nu este o poartă de misiune; îi furnizează agregatele și verdictul.
- Nu este 087/095: nu calculează eligibilitatea și nu estimează parametri de profil.
- Nu este 209/210: nu persistă ledgerul, review-urile sau bucketurile istorice.
- Nu este 074/082 UI: nu desenează și nu scrie în DOM; adaptorul întoarce valori `CityMetric`
  validate de contractul 082 existent.
- Nu măsoară FPS, GPU sau hardware și nu certifică performanța jocului integrat.

## Verificare

```powershell
npm test
npm run metrics:comfort
npm run metrics:comfort -- --check
```

`tests/experiments/comfort-metrics.test.ts` — 16 teste: contract închis și praguri din catalog,
cursă linie în AUTO, cursă bruscă în MANUAL, cursă jerky în LEARNING, cursă mixtă în cele trei
moduri, taxi nevizibil și eligibilitate de învățare nefiltrantă, impact real exclus din confort și
raportat separat, teleport 030 exclus, accelerație laterală măsurată contra capacității reale,
misiune + dashboard + review pe aceleași agregate, incrementalitate și `historyScans = 0`,
idempotență și ordine, limite mărginite și respingeri închise, absența pasagerului și sursele
deterministe fără DOM, ceas sau aleator.

`tests/experiments/comfort-metrics-report.ts` + `scripts/run-metric-comfort-report.mjs` — 8 scenarii,
36 de verificări. Transcriptul este în
[Docs/Evidence/139-metric-comfort](Evidence/139-metric-comfort/README.md). Proba de cost local
(ingest per mod, ingest pentru taxi nevizibil, citirea modelului) este raportată cu valorile
măsurate pe această mașină și este marcată provizorie: nu este un buget, FPS sau o dovadă
hardware.

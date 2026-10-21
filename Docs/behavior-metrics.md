# Indicatori de comportament și încălcări 138

Status: implementare și validare funcțională locală (`targeted`). `src/experiments/behavior-metrics.ts`
deține contractul, parserul închis și acumulatorii incrementali; `src/app/behavior-metrics.ts`
compune înregistrarea reală 086, eșantionul de viteză și adaptorul pentru tabloul 082. Modulul nu
creează oportunități, nu decide conformarea, nu atinge fizica, profilul, camera, flota sau store-ul și
nu publică nimic.

## Ce calculează

Numitorul este **oportunitatea eligibilă**, nu cadrul. Fiecare `(opportunityId, occurrence)` distinct
admis o singură dată este o unitate de numitor; cadrele repetate ale aceleiași apariții fizice sunt
`DUPLICATE` și nu schimbă nici numitorul, nici numărătorii.

| Indicator | Unitate | Formulă | Numitor / eșantion |
| --- | --- | --- | --- |
| `eligibleOpportunities` | `count` | apariții distincte admise | fapte, fără numitor |
| `successes` | `count` | apariții cu rezultat din `opportunitySuccessOutcomes` | fapte |
| `violations` | `count` | apariții cu rezultat de încălcare | fapte |
| `complianceRate` | `percentage` | `successes / eligibleOpportunities × 100` | oportunități eligibile; `NO_OPPORTUNITIES` la zero |
| `violationRate` | `percentage` | `violations / eligibleOpportunities × 100` | oportunități eligibile; `NO_OPPORTUNITIES` la zero |
| `completeStops` | `count` | oportunități STOP rezolvate `STOPPED` | fapte |
| `stopDwellSeconds` | `seconds` | `Σ dwellTicks / 60` | opriri cu dwell măsurat |
| `meanStopDwellSeconds` | `seconds` | `stopDwellSeconds / eșantioane` | opriri cu dwell măsurat |
| `reactionSamples` | `count` | oportunități GREEN cu reacție | fapte |
| `meanReactionSeconds` | `seconds` | `Σ reactionTicks / 60 / eșantioane` | GREEN cu reacție; `NO_REACTION_SAMPLES` |
| `medianReactionSeconds` | `seconds` | histogramă 0,25 s | GREEN cu reacție |
| `speedSamples` | `count` | eșantioane `SPEED_SAMPLE` unice | fapte |
| `meanSpeedMps` | `mps` | `Σ speedMps / eșantioane` | eșantioane de viteză |
| `medianSpeedMps` | `mps` | histogramă 0,5 m/s | eșantioane de viteză |
| `p90SpeedMps` | `mps` | histogramă 0,5 m/s | eșantioane de viteză |
| `limitedSpeedSamples` | `count` | eșantioane cu limită reală | fapte |
| `limitedSeconds` | `seconds` | `eșantioane cu limită / (1 / sampleSeconds)` | eșantioane cu limită |
| `meanLimitMps` | `mps` | `Σ limitMps / eșantioane cu limită` | eșantioane cu limită; `NO_LIMIT` |
| `overLimitSamples` | `count` | eșantioane cu `speedMps > limitMps` | fapte |
| `overLimitSeconds` | `seconds` | `eșantioane peste limită / (1 / sampleSeconds)` | eșantioane cu limită; `NO_LIMIT` |
| `overLimitFraction` | `ratio` | `overLimitSamples / limitedSpeedSamples` | eșantioane cu limită; `NO_LIMIT` |
| `headwaySamples` | `count` | headway-uri la viteză eligibilă | fapte |
| `ineligibleHeadwaySamples` | `count` | headway-uri refuzate (ego staționar) | fapte |
| `meanHeadwaySeconds` | `seconds` | `Σ headwaySeconds / eșantioane` | headway eligibil; `NO_ELIGIBLE_SPEED`/`NO_HEADWAY_SAMPLES` |
| `medianHeadwaySeconds` | `seconds` | histogramă 0,25 s | headway eligibil |
| `p90HeadwaySeconds` | `seconds` | histogramă 0,25 s | headway eligibil |

`STOP` și `RED` sunt raportate separat, fiecare cu propriul numitor eligibil; `YIELD` și
`LANE_CHANGE` la fel. Rândul `ALL` însumează cele cinci tipuri și refolosește aceleași formule. Un
eșec care nu este încălcare (un verde ratat, o schimbare de bandă abandonată) crește eșecurile, dar
nu `violations`.

## Vocabularul real 086

`success` este exact apartenența la `opportunitySuccessOutcomes`; `violation` este derivat din
tabelul închis al rezultatelor, nu din numărul de cadre:

| Rezultat | Succes | Încălcare |
| --- | --- | --- |
| `STOPPED` | da | nu |
| `CROSSED_WITHOUT_STOP` | nu | da |
| `HELD` | da | nu |
| `CROSSED` | nu | da |
| `RELEASED` | da | nu |
| `MISSED` | nu | nu |
| `YIELDED` | da | nu |
| `PROCEEDED` | nu | da |
| `COMPLETED` | da | nu |
| `ABORTED` | nu | nu |

Un steag explicit care contrazice tabelul este respins cu `INCONSISTENT_OUTCOME`; un rezultat din
afara tabelului tipului este respins cu `UNKNOWN_OUTCOME`.

## Cadre duplicate și independența de framerate

Cheia de idempotență a unei oportunități este `(opportunityId, occurrence)`, **nu** `eventId` și
**nu** tick-ul/cadrul. Consecințe:

- fluxul acelorași patru apariții trimis de 10 ori (10 Hz) și de 60 de ori (60 Hz) produce exact
  același numitor și aceiași numărători; diferă doar `duplicates` (36 față de 236) și `events`;
- o re-ingestie a aceleiași apariții, chiar cu alt `eventId`, este `DUPLICATE`;
- două apariții diferite (`occurrence` 0 și 1) sunt două oportunități, chiar cu același
  `opportunityId`;
- `SPEED_SAMPLE` este cheiat după `eventId`, deci un cadru repetat nu dublează nici eșantionul, nici
  durata.

Această regulă este criteriul de acceptare al PBI-ului și este verificată atât în suită, cât și în
raport (`framerate.tenHz` vs `framerate.sixtyHz`).

## Viteză, limită și headway

- Distribuția de viteză și headway folosește histograme mărginite, nu un istoric complet: lățimea
  bucketului este documentată, iar `median`/`p90` raportează mijlocul bucketului (eroare maximă o
  jumătate de bucket). `mean` este exactă.
- Durata peste limită folosește **numai** eșantioanele cu limită reală. `sampleSeconds` este
  intervalul simulat declarat pentru un eșantion acceptat (implicit 0,1 s, cadența deciziilor 10 Hz);
  durata este `eșantioane / (1 / sampleSeconds)`. Fără limită, `meanLimitMps`, `limitedSeconds`,
  `overLimitSeconds` și `overLimitFraction` sunt `UNAVAILABLE`/`NO_LIMIT`, niciodată `0`.
- `overLimitFraction` este o fracție ponderată pe eșantioane, nu o integrală pe timp continuu. Ea
  este stabilă pentru un flux deduplicat, dar nu pretinde precizie sub rezoluția eșantionării.
- Headway-ul intră în distribuție numai dacă egoul se mișcă (`speedMps ≥ 0,1 m/s`, același prag de
  staționare ca 048). Un headway măsurat cu ego oprit este raportat în `ineligibleHeadwaySamples`.
  Dacă există observații, dar niciuna eligibilă, motivul este `NO_ELIGIBLE_SPEED`; dacă nu există
  nicio observație, `NO_HEADWAY_SAMPLES`.

Reacția este raportată numai pentru oportunitățile `GREEN` cu eșantion; o reacție măsurată pe alt
tip nu intră în indicatorul verde. `reactionTicks` și `dwellTicks` sunt convertite la 60 Hz, aceeași
rată fixă ca 087.

## Indisponibil vs zero

| Situație | Contract |
| --- | --- |
| zero oportunități eligibile | `UNAVAILABLE`, `value: null`, `reason: 'NO_OPPORTUNITIES'` |
| zero eșantioane de reacție | `UNAVAILABLE`, `value: null`, `reason: 'NO_REACTION_SAMPLES'` |
| zero opriri cu dwell | `UNAVAILABLE`, `value: null`, `reason: 'NO_STOP_DWELL'` |
| zero eșantioane de viteză | `UNAVAILABLE`, `value: null`, `reason: 'NO_SPEED_SAMPLES'` |
| nicio limită validă | `UNAVAILABLE`, `value: null`, `reason: 'NO_LIMIT'` |
| headway numai la ego staționar | `UNAVAILABLE`, `value: null`, `reason: 'NO_ELIGIBLE_SPEED'` |
| niciun headway observat | `UNAVAILABLE`, `value: null`, `reason: 'NO_HEADWAY_SAMPLES'` |
| zero real cu numitor real (0 încălcări la 3 oportunități) | `AVAILABLE`, `value: 0`, `reason: null` |
| zero real peste limită cu limită validă | `AVAILABLE`, `value: 0` pentru durată și fracție |

Un indicator indisponibil are `value: null` și `sampleSize: null`. Un zero real are `value: 0` și un
`sampleSize` numeric. Numărătorii (oportunități, succese, încălcări, opriri, eșantioane) sunt fapte
cumulative și rămân `AVAILABLE` cu `0` înainte de prima observație; ratele lor cer un numitor real.

## Evenimente, idempotență și limite

| `kind` | Câmpuri | Reguli |
| --- | --- | --- |
| `OPPORTUNITY_RESOLVED` | `eventId`, `opportunityId`, `occurrence`, `opportunityKind`, `vehicleId`, `resolvedTick`, `outcome`, `success`, `violation`, `reactionTicks`, `dwellTicks`, `headwaySeconds`, `speedMps`, `limitMps` | tip ∈ cele cinci 086; `outcome` din tabelul tipului; `success`/`violation` consecvente cu tabelul; valori numerice finite și nenegative |
| `SPEED_SAMPLE` | `eventId`, `tick`, `vehicleId`, `speedMps`, `limitMps` | `speedMps` finit în `[0, 200]`; `limitMps` finit sau `null` |

- Parserul este închis: câmpuri necunoscute, valori nefinite, negative, identități peste 1024 code
  units și vocabulare necunoscute sunt `REJECTED` cu un motiv închis (`INVALID_SHAPE`,
  `UNKNOWN_FIELD`, `UNKNOWN_KIND`, `UNKNOWN_OUTCOME`, `INCONSISTENT_OUTCOME`, `INVALID_IDENTITY`,
  `INVALID_NUMBER`, `LIMIT_EXCEEDED`). Un eveniment respins nu schimbă niciun acumulator.
- Memoria de chei este plafonată la `8192` (FIFO), cu `droppedKeys` raportat. O rejucare în afara
  ferestrei poate fi numărată din nou; apelantul nu reia istoric vechi.
- Tick-urile pot veni în orice ordine; agregatele sunt sume/numărători/histograme, deci snapshotul
  este independent de ordine. `minTick`/`maxTick` raportează intervalul acceptat.
- Nu există istoric de evenimente și nici eșantioane integrale: `getStats().historyScans` este
  structural `0`.

## API

```ts
import { createBehaviorMetrics } from './experiments';
import {
  ingestOpportunityRecord,
  ingestSpeedSample,
  readBehaviorMetricSnapshot,
  toCityDashboardBehaviorMetrics,
} from './app';

const metrics = createBehaviorMetrics();
ingestOpportunityRecord(metrics, record); // doar 086 RESOLVED; TRUNCATED/ENTERED → null
ingestOpportunityRecord(metrics, record, { dwellTicks: 120 }); // timing măsurat de host, altfel null
ingestSpeedSample(metrics, { eventId, tick, vehicleId, speedMps, limitMps }); // idempotent după eventId

const snapshot = readBehaviorMetricSnapshot(metrics, {
  tick,
  simulatedSeconds,
  fleet, // opțional, doar counts()
});
const dashboardMetrics = toCityDashboardBehaviorMetrics(snapshot); // doar `violations`
```

`ingestOpportunityRecord` sare explicit (`null`) pentru o oportunitate `ENTERED` sau `TRUNCATED`:
o observație incompletă nu este un eșec de conformare. `ingestSpeedSample` nu inventează o limită;
`limitMps` absent înseamnă `null`.

## Snapshot

`BehaviorMetricsSnapshot` este înghețat și are câmpurile: `schemaVersion` (`1`), `units` (`SI`),
`version` (`138-behavior-metrics-v1`), `tick`, `simulatedSeconds`, `fleet` (opțional, `null` când nu
este declarat), `overall`, `byKind` (STOP, RED, GREEN, YIELD, LANE_CHANGE), `stops`, `reactions`,
`speed`, `headway`, `speedSampleSeconds`, `historyScans` (`0`) și `snapshotCalls`. Fiecare valoare are
`id`, `unit`, `state`, `value`, `sampleSize` și `reason`; `value` este `null` exact când starea este
`UNAVAILABLE`.

## Adaptorul 082

`toCityDashboardBehaviorMetrics(snapshot)` produce numai `violations`, cu unitatea 082 `count`,
valoarea din rândul `ALL` și `sampleSize` egal cu numitorul eligibil. Confortul rămâne pentru 139, iar
contractul 082 nu este modificat. Un `UNAVAILABLE` rămâne `value: null`, niciodată `0`.

## Ce NU este

- Nu este 086: nu creează, nu identifică și nu rezolvă oportunități; consumă identitatea și
  rezultatul lor cert.
- Nu este 087/088/095: nu calculează eligibilitatea, nu filtrează artefacte și nu estimează
  parametri de profil.
- Nu este 137: nu calculează indicatori de serviciu, distanțe de flotă sau coliziuni.
- Nu este 139: nu calculează confort (accelerație, accelerație laterală, jerk).
- Nu este 061/028/065/036/037: nu produce curse, incidente, blocaje, faze sau observații STOP.
- Nu măsoară FPS, GPU sau hardware și nu certifică performanța jocului integrat.
- Nu persistă ledgerul, review-urile sau bucketurile istorice și nu publică nimic.

## Verificare

```powershell
npm test
npm run metrics:behavior
npm run metrics:behavior -- --check
```

`tests/experiments/behavior-metrics.test.ts` — 21 de teste: contract închis, STOP/RED per
oportunitate, YIELD/LANE_CHANGE, cadre duplicate 10 Hz vs 60 Hz, apariții distincte, deduplicare
`SPEED_SAMPLE`, numitor zero vs zero real, reacție GREEN, eligibilitatea headway, distribuția de
viteză și durata peste limită, evenimente invalide/negative, memorie mărginită, `historyScans = 0`,
snapshot înghețat, reset/dispose, adaptoarele reale 086 și forma 082.

`tests/experiments/behavior-metrics-report.ts` + `scripts/run-behavior-metrics-report.mjs` — 7
scenarii, 58 de verificări. Transcriptul este în
[Docs/Evidence/138-behavior-metrics](Evidence/138-behavior-metrics/README.md).

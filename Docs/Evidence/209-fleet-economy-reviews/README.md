# PBI 209 — revenue-ul flotei și review-uri ale curselor 0–5

Implementat în `src/economy/` (`209-fleet-economy-v1`) și exportat aditiv prin `src/economy/index.ts`:
`tariffs.ts` (`209-tariff-v1`), `ledger.ts` (`209-fleet-ledger-v1`), `reviews.ts`
(`209-review-v1`), `kpi.ts` (`209-fleet-kpi-v1`), `ride-outcome.ts` și `economy.ts`. Modulul nu
citește camera, rendererul, store-ul sau fizica: primește numai curse terminale 061 reale și un
`LaneGraph` real, iar confortul vine din read model-ul 139. Civilii nu ating niciun tarif.

## Contract

- `createFleetEconomy({ namespace?, schedule?, reviewCoefficients?, reviewModelVersion?, clock?,
  retainedSettlements?, retainedReviews?, retainedDays?, retainedMonths? })` — `quote`,
  `ingestRideOutcome`, `reissueReview`, `noteProfileActivation`, `settlement`, `review`, `snapshot`,
  `getStats`, `reset`, `dispose`.
- `readRideEconomicOutcome(ride, graph)` — singurul adaptor 061 + hartă: distanța planificată din
  `tripRouteLaneIds`, durata de referință din `tripCostSeconds`, starea terminală și prezența
  pasagerului. Un ocol sau o așteptare schimbă durata măsurată, nu devizele.
- `quoteFare({ plannedDistanceMeters, referenceTripDurationSeconds }, schedule)` — tarif fixat la
  acceptare, în unități monetare întregi, cu `pricingVersion` și cod de monedă `SDA`.
- `ingestRideOutcome({ ride, graph, eventId?, comfort?, blockedSeconds?, profileVersions?,
  preferenceSeed?, vehicleKind? })` — o singură încasare pe `ride-settled:<rideId>`, plus review-ul
  `ride-review:<rideId>` derivat din aceleași fapte; întoarce `status`, `settlement` și `review`.
- `reissueReview({ ride, graph, eventId, reviewModelVersion?, ... })` — rescriere explicită, doar cu
  `acknowledgeModelChange: true`, care păstrează un singur review per `rideId` și crește `revision`.

## Reguli demonstrate

- **Tarife versionate**: `209-tariff-v1` = 240 bază + 180/km + 90/min, cu taxa de anulare 3000 bp.
  O cursă planificată de 2,083 km și 30 s produce devizul 551; o altă versiune de schedule schimbă
  prețul fără să rescrie settle-ul deja înregistrat.
- **Ocolul nu ridică prețul**: deviz 551 pe timp, 551 cu un ocol de 300 s; întârzierea reală crește
  de la 0,006947 s la 300,006947 s, iar ratingul scade de la 5 la 3.
- **Settle separate**: COMPLETED încasează 551 net; FAILED 0; CANCELLED înainte de îmbarcare 0;
  CANCELLED cu pasager 165 (30% taxa de serviciu). Excepțiile sunt intrări explicite de rambursare
  care referă încasarea, nu tarife rescrise.
- **Civilii nu intră în revenue**: un rezultat marcat `CIVILIAN` este respins înainte de orice deviz;
  în raport `civilianRejected: true` și `civilianRevenueMinorUnits: 0`.
- **Review 0–5 din fapte reale**: `rating = clamp(round(5 − delayPenalty − comfortPenalty −
  incidentPenalty − failurePenalty + preferenceAdjustment), 0, 5)`, cu confortul din 139
  (`comfortReviewModel`), incidentele 028 reale și vocabular închis de motive. Aceeași cursă
  rejucată este `DUPLICATE`, alt `eventId` pentru același `rideId` este `EXISTING` și nu rescrie
  review-ul; modelul schimbat nu recalculează tacit istoricul.
- **Scenarii comparabile**: stilul eficient servește 2 curse în fereastră cu revenue 1102 și rating
  mediu 5 (5, 5, 5); stilul agresiv servește 3 curse cu 1653 și rating mediu 1,333333 (1, 1, 2).
  Devizul rămâne 551 în ambele stiluri.
- **KPI incremental**: fiecare settle actualizează bucketul zilei și al lunii în același apel, iar
  fiecare review acceptat incrementează `reviewCount`/`ratingSum`/histograma; revizia unui review
  aplică delta, nu recalcul. `snapshot` întoarce `historyScans: 0` structural. Proiecția lunară cere
  cel puțin 10 curse terminale și 300 s de expunere, altfel `INSUFFICIENT_DATA`.
- **Ceas economic versionat**: `209-economy-clock-v1`, 1200 s/zi, 30 zile/lună, 60 Hz; ziua și luna
  sunt derivate din tick, nu din ceasul de perete.
- **Limite explicite**: ledger 4096 settle-uri FIFO, review-uri 4096 FIFO cu 8192 chei de
  idempotență, 512 zile și 24 luni; refuzurile au motive închise.

## Dovezi

Raport determinist: `npm run fleet:economy` scrie `report.json` și `report.md`; `--check` verifică
fișierele committed. Rezultat real: 10/10 verificări pass, ledger completed 1 / failed 1 /
cancelled 2, reviews 3, `historyScans: 0`, bucketul zilei: 4 curse terminale, 3 review-uri, medie
3,666667, revenue lunar 716.

Cost local (Node 24, Windows, execuție warm, 30 runde × 10 curse reale 061/139): ingest
settle+review medie 0,0602 ms, p95 0,1122 ms, max 0,5747 ms (300 eșantioane); citire `snapshot`
medie 0,0071 ms, p95 0,0125 ms, max 0,0691 ms (3000 eșantioane). Memoria rămasă după cele 10 curse:
10 settle-uri, 12 intrări de ledger, 10 review-uri, 1 zi, 1 lună. Aceste valori sunt cost local de
integrare, nu un gate de hardware.

Comenzi executate și rezultat:

- `npm run typecheck` — pass (`tsc` + `tsconfig.tests.json`).
- `npm run lint` — pass, 0 warnings.
- `npm run format:check` — „All matched files use Prettier code style!”.
- `npm run check:architecture` — pass: 305 fișiere TypeScript, probe negative 6/4/3 și lifecycle.
- `npm run check:parameter-catalog` — „Parameter catalog is synchronized.”
- `node --import ./scripts/register-typescript.mjs --test "tests/economy/*.test.ts"` — 62 teste,
  62 pass, 0 fail.
- `npm test` — 2136 teste, 2136 pass, 0 fail, 76,9 s.
- `npm run fleet:economy -- --check` — 10/10 checks, raport curent.

Testele acoperă finalizare/eșec/anulare, cursa mixtă taxi+civil, impactul 028 real, ocolul,
duplicatele, două stiluri pe aceeași cerere, idempotența după schimbarea modelului, incrementarea
bucketurilor, limitele FIFO și determinismul (fără browser și fără ceas de perete).

## Limitări

- Costul de mai sus este o măsurătoare locală de integrare, nu un benchmark de hardware; PBI-ul
  folosește nivelul `targeted` și nu certifică performanța jocului integrat.
- Feedbackul rating→cerere rămâne rezervat unei revizii ulterioare: în V1 cererea este scenariul
  controlat, iar revenue și rating sunt rezultate independente.
- Persistența și migrarea ledgerului/bucketurilor aparțin checkpointului de sesiune; modulul expune
  snapshoturi înghețate, nu un format de save.
- Popup-ul KPI, paginarea review-urilor și downsampling-ul graficelor sunt scope 210.

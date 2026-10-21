# PBI 138 — indicatori de comportament și încălcări

Implementat în `src/experiments/behavior-metrics.ts` (`138-behavior-metrics-v1`) și
`src/app/behavior-metrics.ts` (`138-behavior-metrics-app-v1`), exportate aditiv prin
`src/experiments/index.ts` și `src/app/index.ts`. Modulul de domeniu acumulează exclusiv contoare,
sume și histograme mărginite din evenimente idempotente; composition root-ul compune înregistrarea
reală 086, eșantionul de viteză al hostului și un adaptor pentru `CityMetric` 082, fără să atingă
fizica, oportunitățile, profilul, camera, flota sau store-ul.

## Contract

- `createBehaviorMetrics({ retainedKeys?, sampleSeconds? })` — `ingest`, `ingestMany`, `snapshot`,
  `getStats`, `reset`, `dispose`.
- Evenimente închise: `OPPORTUNITY_RESOLVED` (oportunitate 086 rezolvată, cu rezultatul real) și
  `SPEED_SAMPLE` (observație de viteză pe tick).
- `snapshot({ fleet?, tick, simulatedSeconds? })` — 26 identități metrice în rânduri per tip
  (`STOP`, `RED`, `GREEN`, `YIELD`, `LANE_CHANGE`), un rând `ALL`, plus blocuri `stops`, `reactions`,
  `speed` și `headway`, fiecare cu unitate, stare, valoare, eșantion și motiv închis.
- `ingestOpportunityRecord(service, record, timing?)` — numai 086 `RESOLVED`; `ENTERED`/`TRUNCATED`
  este sărit cu `null`. Idempotent după `(id, occurrence)`.
- `ingestSpeedSample(service, input)` — idempotent după `eventId`; limita absentă rămâne `null`.
- `readBehaviorMetricSnapshot(service, context)` — snapshot înghețat, fără rescanare.
- `toCityDashboardBehaviorMetrics(snapshot)` — doar `violations`, ca `CityMetric` 082 valid.

## Reguli demonstrate

- **Numitor per oportunitate**: cheia este `(opportunityId, occurrence)`, nu `eventId` și nu cadrul.
  Trei oportunități STOP produc numitor 3; o re-ingestie a aceleiași apariții este `DUPLICATE`.
  Două apariții cu același `opportunityId` și `occurrence` 0/1 sunt două oportunități.
- **STOP și RED separat**: scenariul STOP are 3 eligibile, 2 succese, 1 încălcare (66,67 % / 33,33 %);
  scenariul RED are 2 eligibile, 1 succes, 1 încălcare (50 % / 50 %). `YIELD` și `LANE_CHANGE` sunt
  raportate la fel; `ABORTED` și `MISSED` sunt eșecuri, dar nu încălcări.
- **Cadre duplicate / framerate**: aceleași patru apariții trimise de 10 ori (40 evenimente, 36
  duplicate) și de 60 de ori (240 evenimente, 236 duplicate) produc identic numitor 4, 2 succese, 2
  încălcări, 50 % / 50 %. Doar contoarele de duplicate diferă.
- **Numitor zero**: starea este `UNAVAILABLE`, `value: null`, `sampleSize: null`,
  `reason: 'NO_OPPORTUNITIES'`; nu este raportată ca 0 % sau 100 %.
- **Zero real**: 3 opriri conforme produc `violations = 0` cu `AVAILABLE`, `value: 0`, `sampleSize: 3`;
  0 eșantioane peste limită cu limită validă produc durată și fracție `AVAILABLE` 0.
- **Viteză și limită**: media este exactă (13,75 m/s pentru 10/15/25/5), medianul și p90 sunt mijloace
  de bucket (0,5 m/s). Cu 3 eșantioane limitate și 2 peste limită, durata peste limită este 0,2 s
  (2 × 0,1 s), iar fracția este 2/3. Fără limită, `meanLimitMps`, `limitedSeconds`,
  `overLimitSeconds` și `overLimitFraction` sunt `NO_LIMIT`.
- **Headway**: numai eșantioanele cu ego în mișcare (`≥ 0,1 m/s`) intră în distribuție; un headway la
  ego oprit este raportat în `ineligibleHeadwaySamples`, iar dacă niciun eșantion nu este eligibil
  motivul este `NO_ELIGIBLE_SPEED`.
- **Reacție GREEN**: numai oportunitățile GREEN cu `reactionTicks` intră în eșantion; 90 și 150 de
  tick-uri la 60 Hz dau media 2 s. O reacție măsurată pe RED nu este inclusă.
- **Vocabular real**: `success` este apartenența la `opportunitySuccessOutcomes`; `violation` vine din
  tabelul închis al rezultatelor. Un steag care contrazice rezultatul este `INCONSISTENT_OUTCOME`.
- **Igienă**: parser închis, valori negative/nefinite respinse, memorie FIFO de 8192 chei cu
  `droppedKeys`, fără istoric (`historyScans: 0`), snapshot înghețat, `reset`/`dispose` idempotente.

## Dovezi

`tests/experiments/behavior-metrics.test.ts` — 21 teste, 21 pass. Acoperă contractul închis,
STOP/RED per oportunitate, YIELD/LANE_CHANGE, cadre duplicate 10 Hz vs 60 Hz, apariții distincte,
deduplicarea `SPEED_SAMPLE`, numitor zero vs zero real, reacția GREEN, eligibilitatea headway,
distribuția de viteză și durata peste limită, evenimente invalide/negative, memoria mărginită,
`historyScans = 0`, snapshot înghețat, `reset`/`dispose`, adaptoarele reale 086 și forma 082.

`tests/experiments/behavior-metrics-report.ts` + `scripts/run-behavior-metrics-report.mjs` — 7
scenarii, 58 verificări, 58 PASS. Transcript: [report.json](report.json) / [report.md](report.md).
Raportul nu conține ceas, valoare aleatoare sau măsurătoare locală, deci `--check` compară exact.

## Comenzi (rulate din rădăcină)

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run format:check` | exit 0, „All matched files use Prettier code style!” |
| `npm run check:architecture` | exit 0, `Architecture imports: PASS (246 TypeScript files)` |
| `npm test` | exit 0, `tests 1704`, `pass 1704`, `fail 0` |
| `npm run metrics:behavior` | exit 0, `SUMMARY checks 58/58, scenarios 7, overall PASS` |
| `npm run metrics:behavior -- --check` | exit 0, `Behavior metrics report is current` |

## Fișiere

Adăugate: `src/experiments/behavior-metrics.ts`, `src/app/behavior-metrics.ts`,
`tests/experiments/behavior-metrics.test.ts`, `tests/experiments/behavior-metrics-report.ts`,
`scripts/run-behavior-metrics-report.mjs`, `Docs/behavior-metrics.md`,
`Docs/Evidence/138-behavior-metrics/{README.md,report.json,report.md}`.

Modificate aditiv: `src/experiments/index.ts`, `src/app/index.ts`, `package.json` (un script),
`Docs/README.md`, `Docs/14-experimente-si-indicatori.md`, `Docs/metric-service.md`.

## Limite

- Fără UI, captură de browser, FPS, GPU sau măsurătoare hardware; validarea este funcțională locală
  (`targeted`), nu certifică jocul integrat.
- Medianul și p90 sunt mijloace de bucket dintr-o histogramă mărginită (0,5 m/s pentru viteză, 0,25 s
  pentru reacție/headway), cu eroare de cel mult o jumătate de bucket. Un istoric complet de eșantioane
  nu este păstrat, prin contract.
- `overLimitFraction` este o fracție ponderată pe eșantioane cu intervalul declarat `sampleSeconds`
  (implicit 0,1 s), nu o integrală pe timp continuu; un flux cu altă cadență trebuie să declare
  intervalul corespunzător.
- Fereastra de idempotență este mărginită (8192 chei FIFO). O rejucare a unei oportunități foarte
  vechi, ieșită din fereastră, poate fi numărată din nou; serviciul nu persistă cheile între sesiuni.
- Eligibilitatea este decisă de 087 și de apelant: 138 numără fiecare apariție distinctă pe care o
  primește ca eligibilă și nu re-clasifică oportunitatea.
- Timpul de reacție și dwell-ul nu există în înregistrarea 086; hostul le măsoară și le trimite
  opțional. Absente rămân `null`, nu sunt inventate.
- Indicatorii de distanță (kilometri-vehicul, distanța pe cursă) rămân la 137; 138 nu dublează aceeași
  deplasare și nu calculează o distanță de urmărire separată.
- Nu persistă ledgerul, review-urile sau bucketurile istorice (209/210) și nu modifică contractul 082.
- PBI-ul rămâne în responsabilitatea orchestratorului pentru board și Git; acest raport nu îl mută în
  `Done` și nu rulează validatorul de board.

# PBI 139 — indicatori de confort cu pasager

Implementat în `src/experiments/comfort-metrics.ts` (`139-comfort-metrics-v1`) și
`src/app/comfort-metrics.ts` (`139-comfort-metrics-app-v1`), exportate aditiv prin
`src/experiments/index.ts` și `src/app/index.ts`. Modulul de domeniu deține singura derivare a
intervalelor (`deriveComfortIntervals`), singura rezumare (`summarizeComfortIntervals`), singurul
verdict (`comfortVerdict`) și acumulatorii incrementali; composition root-ul compune sursele reale
085/088/061/069/028 și adaptorul pentru valorile `CityMetric` 082, fără să atingă fizica, cursele,
profilul, camera sau store-ul.

## Contract

- `createComfortMetrics({ retainedKeys?, retainedRides? })` — `ingest`, `ingestMany`, `snapshot`,
  `getStats`, `reset`, `dispose`.
- Evenimente închise: `PASSENGER_INTERVAL` (interval cu pasager) și `PASSENGER_IMPACT` (impact 028
  real cu pasager la bord). Fiecare are `eventId` de idempotență.
- `snapshot({ tick, simulatedSeconds?, fleet? })` — agregate de flotă, per mod (`AUTO`, `MANUAL`,
  `LEARNING`) și per cursă, plus agregatul de impacturi, cu `historyScans: 0` structural.
- `ingestComfortRide(service, facts)` — real 085 readouts + real 088 windows + real 061 ride state;
  o cursă fără pasager este sărită explicit cu `null`.
- `ingestComfortImpact(service, facts)` — incident 028 real, idempotent după `incidentId`, sărit
  cu `null` când nu era pasager la bord.
- `readComfortSnapshot(service, context)`, `comfortReviewModel(snapshot)`,
  `toCityDashboardComfortMetrics(snapshot)` — doar `comfortScore` pentru 082.

## Reguli demonstrate

- **Toate modurile**: agregatele sunt per `AUTO`, `MANUAL` și `LEARNING`; cursa mixtă (179
  intervale) se repartizează 60/60/59 și suma lor este exact totalul de flotă.
- **Taxiuri nevizibile**: modulul nu citește camera, selecția sau rendererul; un taxi din afara
  camerei contribuie cu aceleași intervale ca unul vizibil (240 intervale pentru două curse
  identice).
- **Eligibilitatea pentru learning nu filtrează**: `learningEligible` este înregistrat ca fapt al
  segmentului 069 și este verificat în parser (`INCONSISTENT_STATE` când nu corespunde modului), dar
  nu elimină niciun interval.
- **Teleportările și impulsurile de impact nu devin confort**: un eșantion dintr-un span 088
  suprimat nu intră în metrică și un interval care traversează spanul este eliminat; cursa cu
  recuperare 030 rămâne la 0,9375 m/s² fără nicio încălcare.
- **Impactul real rămâne consecință separată**: incidentul 028 este numărat în agregatul de
  impacturi (`impacts`, `peakImpulseNs`, `affectedRides`) și apare în modelul de review lângă
  termenul de confort, fără să mărească vreo încălcare de confort.
- **Un singur read model**: misiunea 121, tabloul 082 și modelul de review citesc aceleași
  agregate; pe aceleași fapte, numerele misiunii și agregatul incremental al serviciului coincid
  exact, iar verdictul misiunii calculat din agregat este identic cu verdictul porții de confort.
- **Incremental**: fără istoric de evenimente; `historyScans` este `0` la serviciu și la snapshot,
  iar citirile repetate dau același rezultat.
- **Idempotență și ordine**: același `eventId` este `DUPLICATE` (120 de duplicate la rejucarea
  cursei, fără nicio schimbare a agregatelor); un interval care se suprapune peste ultimul interval
  al cursei este `OUT_OF_ORDER`.
- **Limite explicite**: 8192 chei FIFO, 512 curse FIFO, 1024 code units per identitate, motive de
  respingere închise.

## Dovezi

`tests/experiments/comfort-metrics.test.ts` — 16 teste, 16 pass. Acoperă contractul închis și
pragurile din catalog, cursa linie în AUTO, cursa bruscă în MANUAL, cursa jerky în LEARNING, cursa
mixtă, taxiul nevizibil și eligibilitatea de learning, impactul real separat de confort, teleportul
030 exclus, accelerația laterală măsurată contra capacității reale a clasei, misiune + dashboard +
review pe aceleași agregate, incrementalitatea, idempotența și ordinea, limitele mărginite și
respingerile închise, absența pasagerului și determinismul surselor.

`tests/experiments/comfort-metrics-report.ts` + `scripts/run-metric-comfort-report.mjs` — 8 scenarii,
36 verificări, 36 PASS. Transcript: [report.json](report.json) / [report.md](report.md).

## Cost local măsurat (provizoriu)

Măsurat pe această mașină de către `npm run metrics:comfort`, într-o singură rulare secvențială,
fără paralelizare. Valorile sunt **mărimea costului local**, nu un gate hardware:

| Măsurătoare | Valoare |
| --- | ---: |
| Intervale ingerate | 12 000 |
| Timp ingest total | 31,5422 ms |
| Cost per interval (media celor trei moduri) | 0,002628517 ms (≈2,63 µs) |
| Cost ingest AUTO (4 000 intervale, serviciu nou) | 12,8910 ms → 0,003222750 ms/interval (≈3,22 µs) |
| Cost ingest MANUAL (4 000 intervale, serviciu nou) | 9,1551 ms → 0,002288775 ms/interval (≈2,29 µs) |
| Cost ingest LEARNING (4 000 intervale, serviciu nou) | 9,4961 ms → 0,002374025 ms/interval (≈2,37 µs) |
| Cost ingest taxi nevizibil (4 000 intervale, serviciu nou) | 7,4683 ms → 0,001867075 ms/interval (≈1,87 µs) |
| Snapshoturi citite | 2 000 |
| Timp snapshoturi | 14,9983 ms |
| Cost per snapshot | 0,007499150 ms (≈7,50 µs) |

Fiecare măsurătoare de ingest pornește de la un serviciu nou, deci valorile sunt comparabile între
ele. Taxiul „nevizibil” este un taxi cu altă identitate, fără nicio relație cu o cameră: modulul nu
are noțiune de vizibilitate, deci nu există un tratament special — diferența de timp este jitterul
mașinii, nu o ramură de cod pentru taxiurile ascunse. Costul snapshotului este citit peste un
serviciu care ține toate cele 12 000 intervale.

Valorile sunt locale și provizorii: nu sunt buget, FPS sau dovadă hardware și nu certifică jocul
integrat. `--check` compară transcriptul cu blocul `performance` anulat, ca să rămână un test real
de actualitate fără să pretindă reproductibilitate hardware.

## Comenzi (rulate din rădăcină)

| Comandă | Rezultat |
| --- | --- |
| `npm test` (preflight, înainte de modificare) | exit 0, `tests 1978`, `pass 1978`, `fail 0` |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run format:check` | exit 0, „All matched files use Prettier code style!” |
| `npm run check:architecture` | exit 0, „Architecture imports: PASS (282 TypeScript files)” |
| `npm run check:parameter-catalog` | exit 0, „Parameter catalog is synchronized.” |
| `npm test` (după modificare) | exit 0, `tests 1994`, `pass 1994`, `fail 0` (+16 teste 139) |
| `npm run metrics:comfort` | exit 0, „SUMMARY checks 36/36, scenarios 8, overall PASS” |
| `npm run metrics:comfort -- --check` | exit 0, „Comfort metrics report is current” |
| `pwsh -NoProfile -ExecutionPolicy Bypass -Command "& './PBI/Validate-Board.ps1' -RequireDone '139'"` | exit 0, `Valid: true` |

## Fișiere

Adăugate: `src/experiments/comfort-metrics.ts`, `src/app/comfort-metrics.ts`,
`tests/experiments/comfort-metrics.test.ts`, `tests/experiments/comfort-fixture.ts`,
`tests/experiments/comfort-metrics-report.ts`, `scripts/run-metric-comfort-report.mjs`,
`Docs/comfort-metrics.md`, `Docs/Evidence/139-metric-comfort/{README.md,report.json,report.md}`.

Modificate aditiv: `src/experiments/index.ts`, `src/app/index.ts`, `src/missions/index.ts`,
`src/missions/comfort.ts` (evaluatorul misiunii 121 apelează acum derivarea și rezumarea din 139
și expune `comfortMissionOutcomeFromAggregates`), `package.json` (un script, la finalul blocului
`scripts`), `Docs/README.md`, `Docs/14-experimente-si-indicatori.md`, `Docs/metric-service.md`,
`Docs/city-dashboard.md`, `Docs/13-misiuni-si-progres.md` și fișierul de board al PBI-ului 139.

## Limite

- Fără UI, captură de browser, FPS, GPU sau măsurătoare hardware; proba de cost este locală și
  provizorie, iar validarea rămâne `targeted`.
- Memoria de idempotență este mărginită (8192 chei FIFO) și modelul de lectură per cursă este mărginit
  (512 curse FIFO): o cursă eliminată pierde agregatul ei per cursă, dar contoarele de flotă
  supraviețuiesc, iar eliminările sunt raportate (`droppedKeys`, `droppedRides`).
- Jerkul este derivat din intervalele consecutive ale aceleiași curse, deci intervalele unei curse
  trebuie ingerate în ordine de tick; o suprapunere reală este respinsă cu `OUT_OF_ORDER`.
- Coeficienții termenului de confort (2 puncte accelerație, 2 jerk, 1 lateral, plafon 5) sunt
  propunerea versionată a formulei de rating din modulul 22, nu o calibrare pe jucători reali.
- Limita laterală este capacitatea mecanică reală a clasei vehiculului (`grip × 9,81 m/s²`), nu o
  preferință de confort; când nu poate fi certificată, lateralul nu produce încălcări.
- Adaptorul 082 este livrat și testat, dar nu este încă legat de o buclă de joc: ca 137 și 138,
  hostul trebuie să furnizeze providerul `CityDashboardMetricsProvider`.
- PBI-ul nu persistă ledgerul, review-urile sau bucketurile istorice (209/210) și nu modifică
  contractul 082.
- O rulare a suitei complete pe această mașină a eșuat o singură dată în `tests/workers/protocol.test.ts`,
  pe un prag de timp real (`cancel 112,27 ms`). Testul nu are legătură cu 139 (rulează izolat în
  ≈84 ms, cu `cancelMs` 4,39 ms) și mașina este folosită în paralel de alți agenți; celelalte rulări
  au fost verzi, cu 1994/1994 teste.

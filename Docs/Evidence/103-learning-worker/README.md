# PBI 103 — estimator în worker cu coadă serială

Implementat `LearningEstimatorQueue`, `parseLearningJob`, `learningJobRejectionCodes`,
`LearningEstimatorQueueOptions` și taskul `createLearningEstimatorTask` / contractul
`LearningEstimateRequest`/`LearningEstimateResult` în `src/learning/estimator-worker.ts` și
`src/learning/estimator-task.ts`, exportate prin `src/learning/index.ts`.

Coada folosește `WorkerResourceGovernor` 221 cu operația `learning` și un singur runtime serial.
Nu există un al doilea governor sau un harness paralel.

## Contract

Un job valid are `playerId`, `profileId`, `learningEpoch`, `baseVersionId`, `segmentId`,
`sessionId`, `worldEpoch`, `mode`, `eligible`, `order`, `key`, `baseValue`, `evidence`, `episodes` și
`candidate`.

| Regulă | Comportament |
| --- | --- |
| `mode: 'MANUAL'` | `REJECTED` / `MANUAL_SEGMENT_NOT_LEARNABLE` |
| `mode: 'AUTO'` | `REJECTED` / `AUTO_SEGMENT_NOT_LEARNABLE` |
| `eligible: false` | `REJECTED` / `SEGMENT_INELIGIBLE` |
| identitate/epoch/order invalid | `IDENTITY_INVALID`, `EPOCH_INVALID`, `ORDER_INVALID` |
| cheie necunoscută sau extension | `PARAMETER_UNKNOWN`, `PARAMETER_NOT_LEARNING_TARGET` |
| payload peste limita 221 | `PAYLOAD_TOO_LARGE` |
| coadă plină | `BACKPRESSURE` / `QUEUE_FULL` sau `QUEUE_BYTES` |

Generația este `playerId + profileId + learningEpoch + baseVersionId`. Altă generație invalidează
joburile vechi și tentativa activă (cancel 221), iar rezultatul târziu nu mai compune. În aceeași
generație, un rezultat târziu este păstrat în ledger și ledger-ul este recompus serial în ordinea
`order`; nu există drop și nu există overwrite paralel. Fiecare compunere este o singură operație
sincronă, iar poarta 102 respinge atomic o valoare în afara intervalului 092.

Anularea și erorile eliberează `order`-ul și lasă următorul job runnable. `maxPending` (8 implicit),
`maxBytes` (16 MiB implicit) și `maxProposals` (256 implicit) sunt plafoane explicite.

## Probă

```powershell
node --import ./scripts/register-typescript.mjs scripts/benchmark-learning-estimator.mjs Docs/Evidence/103-learning-worker/probe.json
```

Cinci repetări, 25 de joburi per repetare, un job secundar `comparison` activ la submit, două valuri
de ordine (13–25, apoi 1–12) pentru recompoziție. Fiecare repetare: 23 compuse, 1 eroare de task, 1
anulare pending, 22 rezultate recompuse, 0 invalidate, secondary cancelled. Toate cele cinci repetări
au trecut fără `failures`. Eticheta este `PROVISIONAL_UNCALIBRATED`; nu este o probă browser/GPU.

Valori pe laptopul disponibil (AMD Ryzen 7 7735U, 14,7 GiB RAM, Windows 10.0.26300, Node 24.21.0):

| Metrică | p50 | p95 | p99 |
| --- | --- | --- | --- |
| `learningQueueMs` (125 mostre) | 3,29 ms | 22,32 ms | 24,10 ms |
| `learningEndToEndMs` (125 mostre) | 4,30 ms | 22,61 ms | 24,53 ms |
| `learningServiceMs` (125 mostre) | 0,34 ms | 0,68 ms | 14,68 ms |
| `mainThreadMs` per submit/coalesce (10 mostre) | 0,037 ms | 0,173 ms | 0,173 ms |

Alte valori: startup worker 165,4–192,8 ms; batch submit/coalesce 0,43–2,24 ms pentru 13 joburi și
0,41–0,60 ms pentru 12 joburi; `maxOwnedBytes` 61.341; payload total 125.061 bytes; payload maxim
5.173 bytes; store 24 records / 125.279 bytes. `frameMs`, `gpuMs`, tick, simulare, input și
checkpoint sunt `unavailable` cu motiv explicit.

## Verificări

`npm test` → **1110 teste, 1110 pass, 0 fail** (baseline 1098 plus 12 teste PBI 103).

`npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:architecture` (174
fișiere TS) și `npm run check:parameter-catalog` trec. Comenzile exacte sunt în `checks.txt`;
motivul fiecărui test este în `tests.txt`.

## Limitări

- Proba este Node `worker_threads`: nu măsoară rAF, frame real, FPS, GPU sau laptop. `frameMs` și
  `gpuMs` sunt `unavailable`; `mainThreadMs` este numai costul sincron de submit/coalescing.
- Estimatorul este o singură felie sincronă mărginită (maximum 4096 episoade / 1 MiB); request-urile
  mai mari sunt respinse, nu chunked.
- Coada compune candidați în memorie. Publicarea profilului, checksum-ul, `acknowledge`-ul 221,
  persistența durabilă și propagarea la tick rămân în afara PBI 103.
- Fixture-ul de persistență are 64 records; un store production trebuie să declare propria capacitate
  finită. Profilele sunt tratate ca identități unice per jucător în interiorul cozii.
- PBI-ul a rămas In Progress: nu s-au rulat validatorii de board, nu s-a mutat fișierul în Done și nu
  s-a declarat un gate hardware.

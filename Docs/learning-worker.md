# Estimator learning în worker cu coadă serială — PBI 103

`src/learning/estimator-worker.ts` definește coada serială, iar `src/learning/estimator-task.ts`
definește contractul de mesaj și taskul cooperativ care rulează în worker. Ambele sunt exportate prin
`src/learning/index.ts`. Coada folosește **același** `WorkerResourceGovernor` 221 și operația
`learning`; nu există un al doilea governor, un al doilea runtime sau o coadă paralelă.

Modulul compune candidați în memorie. Nu publică profiluri, nu scrie `implemented`/`estimable` în
registrul 092, nu emite `LEARNED` și nu decide dacă un delta trebuie aplicat.

Consumatorul de producție al cozii este [profile-pipeline](profile-pipeline.md) (112): trimite doar
segmente `LEARNING` eligibile, așteaptă outcome-ul terminal, derivă cel mult o versiune 109 dintr-o
compoziție schimbată și o publică în 110 la tick-ul următor. `MANUAL`, `AUTO`, segmentele
neeligibile, rezultatele fără schimbare și erorile nu produc versiuni; un rezultat depășit în aceeași
generație este raportat ca recompoziție explicită.

## Jobul și eligibilitatea

Un job trebuie să conțină `playerId`, `profileId`, `learningEpoch`, `baseVersionId`, `segmentId`,
`sessionId`, `worldEpoch`, `mode`, `eligible`, `order`, `key`, `baseValue`, plus read model-ul 093
(`evidence`), episoadele 086/087 și candidatul estimatorului. `parseLearningJob` întoarce fie jobul
validat, fie un motiv închis din `learningJobRejectionCodes`.

Sunt acceptate numai segmente `mode: 'LEARNING'` cu `eligible: true`:

| Caz | Motiv închis |
| --- | --- |
| `mode: 'MANUAL'` | `MANUAL_SEGMENT_NOT_LEARNABLE` |
| `mode: 'AUTO'` | `AUTO_SEGMENT_NOT_LEARNABLE` |
| `eligible: false` | `SEGMENT_INELIGIBLE` |
| identitate lipsă/invalidă | `IDENTITY_INVALID`, `EPOCH_INVALID` |
| cheie necunoscută sau R/extension | `PARAMETER_UNKNOWN`, `PARAMETER_NOT_LEARNING_TARGET` |
| dovezi/candidat/episoade invalide | `EVIDENCE_INVALID`, `EPISODES_INVALID`, `CANDIDATE_INVALID` |
| payload peste limita 221 | `PAYLOAD_TOO_LARGE` |
| coadă plină | `QUEUE_FULL` / `QUEUE_BYTES` (status `BACKPRESSURE`) |

MANUAL și AUTO nu devin „no-op learning”: sunt respinse înainte de admiterea în governor.

## Coada serială, ordinea și generațiile

`LearningEstimatorQueue.submit(job)` este sincron și întoarce imediat `QUEUED` cu un ticket (sau
`REJECTED`/`BACKPRESSURE` cu motiv). Dispatch-ul este coalesced într-un microtask, astfel încât două
intervenții trimise în același tick sunt sortate după `order` (ordinea intervenției/segmentului), nu
după sosire. Un singur job este predat governorului o dată; următorul pornește numai după outcome-ul
terminal.

Generația este identificată prin `playerId + profileId + learningEpoch + baseVersionId`:

- Un job cu altă generație **invalidează** joburile vechi din coadă și tentativa activă (cancel 221),
  iar rezultatul târziu al generației vechi nu mai poate compune nimic. Restaurarea profilului ori
  schimbarea bazei versionate intră aici.
- Un rezultat târziu din **aceeași** generație nu este aruncat. Propunerea intră în ledger-ul epocii,
  iar ledger-ul este recompus serial în ordinea intervențiilor. Astfel un job cu `order` mai mic sosit
  după unul cu `order` mai mare este pliat în poziția corectă, nu suprascrie în paralel și nu este
  pierdut.
- `order` este unic în generație (`ORDER_CONFLICT`), `segmentId` nu poate fi refolosit după compunere
  (`SEGMENT_DUPLICATE`), iar `baseValue` pentru o cheie trebuie să fie identic în toată generația
  (`BASE_VALUE_MISMATCH`).

Recompoziția este o singură operație sincronă, apelată din handler-ul de outcome: nu pot exista două
compuneri simultane. Fiecare pas aplică formula 101 `value = value + learningWeight × (estimate −
value)`; estimarea și ponderea vin din worker, deci nu depind de valoarea curentă. Nu există clamp
ascuns: un rezultat care iese din intervalul 092 este respins atomic de `validateCandidateDelta`
(`COMPOSITION_REJECTED`), iar propunerea este retrasă din ledger.

Anularea și erorile sunt terminale pentru jobul respectiv, eliberează `order`-ul și lasă coada
funcțională; următorul job este dispatch-uit normal. `cancel(segmentId)` anulează un job pending sau
cere anularea tentativei active prin governor. `dispose()` nu dispune governorul partajat.

Limitele sunt explicite: `maxPending` (implicit 8, ca `governorLimits.jobs`), `maxBytes` (implicit
16 MiB) și `maxProposals` pe epocă (implicit 256). La depășire se întoarce `BACKPRESSURE`, nu se
crește coada tacit.

## Workerul și măsurarea

`createLearningEstimatorTask()` decodează un request JSON bounded (maximum 4096 episoade și 1 MiB),
rulează `blendProfileValue` 101 și întoarce `estimate`, `learningWeight`, `resolution`, `min`, `max`
și identitatea jobului. Taskul este o singură felie sincronă mărginită; request-urile peste limită
sunt respinse, nu trunchiate. Rezultatul este o propunere; compunerea și poarta 102 rulează în coada
serială.

Fiecare outcome are o măsurătoare:

- `queueMs` — de la `submit` până la predarea către governor (include așteptarea în coada serială);
- `serviceMs` — de la predare până la outcome-ul terminal;
- `endToEndMs` — de la `submit` până la compunere, deci include coada serială, admiterea 221, coada
  governorului, execuția workerului și compunerea;
- `governorQueueMs` / `governorServiceMs` — măsurătoarea 221 pentru același ticket;
- `payloadBytes` — request-ul encoded deținut de coadă.

Proba `scripts/benchmark-learning-estimator.mjs` folosește governorul 221 real, un thread
`worker_threads` real și un job secundar `comparison` care rulează când sosesc joburile de learning.
Rezultatul este marcat `PROVISIONAL_UNCALIBRATED`.

```powershell
node --import ./scripts/register-typescript.mjs scripts/benchmark-learning-estimator.mjs Docs/Evidence/103-learning-worker/probe.json
```

Cinci repetări, 25 de joburi per repetare (23 compuse, 1 eroare de task, 1 anulare pending), două
valuri cu ordine mai mici în al doilea val pentru a exercita recompoziția. Valorile măsurate pe
laptopul disponibil (Node 24.21.0, Windows, AMD Ryzen 7 7735U) sunt în
[Evidence/103-learning-worker](Evidence/103-learning-worker/README.md): end-to-end p50 aproximativ
4,3 ms și p95 aproximativ 22,6 ms, coada p50 aproximativ 3,3 ms, serviciul p95 aproximativ 0,7 ms,
costul sincron de submit/coalescing p95 aproximativ 0,17 ms per job. Acestea nu sunt FPS, frame sau
GPU.

## Verificări

`node --import ./scripts/register-typescript.mjs --test tests/learning/estimator-worker.test.ts`
acoperă: MANUAL/AUTO/inelegibil respinse, ordinea după intervenție, recompoziția unui rezultat
întârziat din aceeași generație, invalidarea la epoch/bază nouă, cancel/eroare/respingere care lasă
coada funcțională, backpressure bounded, latența end-to-end cu job secundar, duplicate/ordine,
taskul worker real și un thread `worker_threads` real. Rulează și `npm run typecheck`, `npm run lint`,
`npm run format:check`, `npm run check:architecture`, `npm run check:parameter-catalog` și `npm test`.

## Limitări

- Proba este Node `worker_threads`, nu browser: nu măsoară rAF, frame real, GPU, FPS sau laptop.
  `frameMs` și `gpuMs` rămân `unavailable`, iar `mainThreadMs` acoperă numai submit/coalescing sincron.
- Coada compune candidați; publicarea idempotentă și `acknowledge`-ul 221 rămân în serviciul de
  profiluri. Un store production trebuie să declare capacitate finită; fixture-ul are 64 records.
- Estimatorul este o singură felie sincronă mărginită. Un request peste 4096 episoade/1 MiB este
  respins; nu există chunking intern.
- `profileVersionId` compus este o cheie de lucru, nu un profil publicat; nu există checksum,
  persistență, `LEARNED` sau propagare la tick.

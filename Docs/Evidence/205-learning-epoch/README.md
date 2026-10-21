# PBI 205 — barieră de generație la restore, import și profil nou

Implementat în `src/app/learning-epoch.ts` (`205-learning-epoch-v1`), exportat aditiv prin
`src/app/index.ts`. Bariera este composition root-ul care leagă porturile reale deja livrate: coada
serială 103 (`cancel(segmentId)`), store-ul imuabil 109 (`getVersion`), activarea 110
(`publish`/`applyAt`/`pending`), lifecycle-ul de segmente 069 (`close`/`open`/readback fizic) și
readback-ul de tick fix. Nu reimplementează estimatorul, compunerea, validarea, store-ul, activarea
sau fizica.

## Contract

- `createLearningEpochBarrier(services)` — servicii injectate: `playerId`, `profileId`,
  `engineVersion`, `learningEpoch`, `baseVersionId`, `segmentId`, `openedTick`, `queue` (103),
  `store` (109), `activation` (110), `segments` (069), `tick` și `history`.
- `requestChange({ reason, targetProfileId, targetVersionId, importValid })` — cerere explicită;
  `RESTORE`, `IMPORT` sau `NEW_PROFILE`.
- `resolve()` — aplică tranzacția numai la limita tick-ului (`resolveAtTick = requestedTick + 1`).
- `trackJob(job)` — capturează un job 103 al generației curente pentru anulare.
- `isCurrent(jobOrResult)` — poarta de generație; `versionId` este întotdeauna `null`.
- `current()`, `generations()`, `barriers()`, `pending()`, `stats()`, `dispose()`.

## Reguli implementate

- **Identitatea generației**: `playerId + profileId + learningEpoch + baseVersionId`, cu
  `segmentId` propriu. Segmentul nou are identitate stabilă `<profileId>:g<epoch>`, iar epoca crește
  strict cu un pas la fiecare schimbare commitată.
- **Tranzacție unică la limita tick-ului**: readback fizic → `close(PROFILE_CHANGE)` → comparare
  fizică → rezolvarea unei comenzi 110 vechi → publicarea țintei → anularea joburilor 103 vechi →
  epoch incrementat, generația veche `CANCELLED_BY_PROFILE_CHANGE`, segment nou deschis, barieră
  `COMMITTED`. Un readback fizic diferit produce `PHYSICAL_STATE_CHANGED` și rollback.
- **Idempotență**: aceeași țintă returnează bariera existentă (`PENDING` sau `COMMITTED`) cu
  `DUPLICATE`; o a doua țintă cât timp există `PENDING` este `CHANGE_PENDING`; ținta curentă este
  `SAME_TARGET`.
- **Import invalid**: `REJECTED`/`IMPORT_INVALID` fără barieră, fără închidere de segment, fără
  anulare de job și fără publicare; coada, jobul și segmentul rămân neschimbate.
- **Rezultate târzii/duplicate**: alt `playerId`/`profileId`/`learningEpoch`/`baseVersionId`/segment
  → `STALE_GENERATION` ignorat; segment anulat de schimbarea de profil → `LATE_RESULT`
  (`CANCELLED_BY_PROFILE_CHANGE`); aceeași identitate de rezultat → `DUPLICATE`
  (`DUPLICATE_RESULT`). Nicio cale nu creează versiune.
- **Rollback**: o publicare 110 refuzată produce `ROLLED_BACK`, segmentul vechi este redeschis,
  epoca/baza rămân neschimbate, iar `rollback.exact` spune dacă nu a supraviețuit niciun efect.
  Efectele parțiale (joburi deja anulate, comandă deja publicată) sunt raportate exact, nu reparate.
- **Istoric mărginit**: 16 bariere și 16 generații anulate (1–64 configurabil), 64 joburi capturate,
  128 identități de rezultat; intrările vechi sunt eliminate și numărate în `droppedBarriers`.
- Nicio versiune nu este scrisă de barieră; singura mutație de flotă este comanda 110 publicată
  pentru ținta cerută, aplicată de controller la tick-ul comun următor.

## Dovezi

`tests/app/learning-epoch.test.ts` — 18 teste, 18 pass. Acoperă: contractul închis și generația
inițială; restore cu job 103 în curs (job anulat, rezultat `LATE_RESULT`, fără versiune); închidere
`PROFILE_CHANGE` și redeschidere fără pierdere fizică; import valid cu activare la tick-ul următor;
import invalid fără barieră și cu coada/segmentul intacte; profil nou cu epocă monotonă și identitate
nouă; `CHANGE_PENDING`; cerere duplicată idempotentă; rezultat duplicat; epoch/bază/segment străine;
rezultat după anulare; captura de joburi; rollback la eșec de activare; readback fizic schimbat;
istoric mărginit; store/flotă nemodificate de barieră; `dispose`; erori structurale.

`tests/app/learning-epoch-report.ts` + `scripts/run-learning-epoch-report.mjs` — 7 scenarii, 73
verificări, 73 PASS. Transcript: [report.json](report.json) / [report.md](report.md).

Comenzi (rulate din rădăcină):

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run format:check` | exit 0, „All matched files use Prettier code style!” |
| `npm run check:architecture` | exit 0, `Architecture imports: PASS (250 TypeScript files)` |
| `npm test` | exit 0, `tests 1738`, `pass 1738`, `fail 0` |
| `npm run learning:epoch` | exit 0, `SUMMARY checks 73/73, scenarios 7, overall PASS` |
| `npm run learning:epoch -- --check` | exit 0, „Learning epoch report is current” |

## Limite

- Transportul worker este un port injectat determinist care răspunde cu rezultatul real 101
  `blendProfileValue`; coada 103, governorul 221, compunerea 102, store-ul 109 și activarea 110 sunt
  reale, dar nu rulează un thread `worker_threads` și nici un browser.
- Legarea 069 din probe este un port în memorie care înregistrează identitatea close/open și un
  readback fizic; nu este store-ul nativ 069 și nu dovedește timing nativ de frame sau continuitatea
  inputului.
- Istoricul barierelor și jurnalul comenzilor 110 sunt RAM-only; nu există savefile, IndexedDB sau
  jurnal de recuperare după crash în acest scope.
- O singură țintă de profil este activă per barieră; un alt `profileId` este
  `TARGET_PROFILE_MISMATCH`. După eliminarea unei ținte din istoricul mărginit, deduplicarea pe
  țintă nu mai este disponibilă.
- Flota este fixture-ul determinist 057 (24 taxiuri, 40 civile); raportul nu certifică bucla de joc
  integrată, fizica sau o sesiune de participant.
- Fără captură de browser, FPS, GPU sau măsurătoare hardware.
- PBI-ul rămâne în coloana deținută de orchestrator; acest raport nu îl mută și nu rulează
  validatorul de board.

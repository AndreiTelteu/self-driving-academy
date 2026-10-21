# Barieră de generație pentru learning la restore, import și profil nou — PBI 205

`src/app/learning-epoch.ts` (contract `205-learning-epoch-v1`) rezolvă explicit o schimbare de
țintă de învățare: restore, import validat sau profil nou. Modulul este un composition root peste
porturile reale deja livrate — coada 103, store-ul 109, activarea 110, lifecycle-ul de segmente 069
și readback-ul de tick — și este exportat aditiv prin `src/app/index.ts`.

```typescript
import { createLearningEpochBarrier } from './app';

const barrier = createLearningEpochBarrier({
  playerId,
  profileId,
  engineVersion,
  learningEpoch,
  baseVersionId,
  segmentId,
  queue,
  store,
  activation,
  segments,
  tick: () => loop.getState().tick,
});

barrier.requestChange({
  reason: 'RESTORE',
  targetProfileId: profileId,
  targetVersionId,
  importValid: true,
});
barrier.resolve(); // aplică numai când tick-ul a atins limita
```

## Identitatea generației

`learningEpoch` este o generație monotonă a țintei de învățare, distinctă de `versionId`. Fiecare
`LearningGeneration` păstrează `playerId`, `profileId`, `learningEpoch`, `segmentId`,
`baseVersionId`, `openedTick`, `closedTick` și un status închis:

| Status | Semnificație |
| --- | --- |
| `OPEN` | generația curentă; singura care poate accepta rezultate |
| `CLOSED` | generația a fost închisă fără o schimbare de profil (ex. `dispose`) |
| `CANCELLED_BY_PROFILE_CHANGE` | dovezile vechi rămân în istoric, dar nu mai pot produce versiuni |

Segmentele și joburile poartă aceeași identitate. `trackJob(job)` capturează un job 103 trimis în
generația curentă, astfel încât o schimbare de profil să îl poată anula; un job cu alt
`playerId`/`profileId`/`learningEpoch`/`baseVersionId` este `STALE_GENERATION` și nu este capturat.

## Tranzacția barierei

`requestChange({ reason, targetProfileId, targetVersionId, importValid })` este **pură**: validează
cererea și ținta în store, apoi înregistrează o barieră `PENDING` cu `resolveAtTick = tick + 1`.
`resolve()` nu scrie nimic înainte de `resolveAtTick` (`TICK_NOT_REACHED`) și aplică exact o
tranzacție la limită:

1. citește readback-ul fizic al segmentului;
2. închide segmentul curent cu `PROFILE_CHANGE` (receipt-ul trebuie să confirme segmentul, motivul și
   tick-ul);
3. reverifică readback-ul fizic și compară cu cel de dinainte;
4. rezolvă o comandă 110 `PENDING` rămasă din generația veche (vezi mai jos);
5. publică ținta în 110 pentru tick-ul următor;
6. anulează joburile 103 nepublicate capturate din generația veche;
7. incrementează `learningEpoch` cu exact un pas, marchează generația veche
   `CANCELLED_BY_PROFILE_CHANGE`, deschide segmentul următor și comite bariera.

Un `requestChange` duplicat pentru aceeași țintă întoarce bariera existentă (`PENDING` sau
`COMMITTED`) cu statusul `DUPLICATE`, fără efecte. O a doua țintă cât timp există o barieră
`PENDING` este refuzată `CHANGE_PENDING`. O țintă egală cu baza curentă este `SAME_TARGET`.

Identitatea noului segment este stabilă și derivată din profil și epocă (`<profileId>:g<epoch>`);
epoch-ul crește strict, deci identitatea nu se repetă. Segmentul vechi rămâne în istoricul 069 cu
`closeReason: 'PROFILE_CHANGE'`, iar segmentul nou pornește la același tick cu noua epocă și noua
bază.

Atomicitatea este raportată, nu reparată: dacă activarea 110 refuză publicarea, bariera devine
`ROLLED_BACK`, segmentul vechi este redeschis cu aceeași identitate, epoca și baza rămân
neschimbate, iar `rollback.exact` spune dacă nu a supraviețuit niciun efect. Un readback fizic
diferit după închidere produce `PHYSICAL_STATE_CHANGED` și același rollback. Dacă un pas ulterior
publicării eșuează, raportul păstrează exact `activationPublished`, `jobsCancelled` și
`segmentRestored`; nu există rollback tăcut al comenzii 110.

## Import invalid

Un import respins de validator este raportat `REJECTED` cu `IMPORT_INVALID` **înainte** de orice
efect: nu se creează barieră, nu se închide segmentul, nu se anulează joburi și nu se publică o
activare. Coada, jobul și segmentul curent rămân exact cum erau. `importValid` este consultat numai
pentru `reason: 'IMPORT'`; restore și profil nou nu depind de el.

## Rezultate târzii și duplicate

`isCurrent(jobOrResult)` este poarta de generație. Verifică `playerId`, `profileId`,
`learningEpoch`, `baseVersionId` și segmentul (segmentul curent sau un segment capturat în generația
curentă). Rezultatele au un vocabular închis:

| Status | Motiv | Efect |
| --- | --- | --- |
| `CURRENT` | `null` | singurul rezultat care poate continua spre 109 |
| `STALE_GENERATION` | `PLAYER_MISMATCH`, `PROFILE_MISMATCH`, `EPOCH_MISMATCH`, `BASE_MISMATCH`, `SEGMENT_MISMATCH` | ignorat |
| `DUPLICATE` | `DUPLICATE_RESULT` | ignorat; aceeași identitate de rezultat a fost deja acceptată |
| `LATE_RESULT` | `CANCELLED_BY_PROFILE_CHANGE` | ignorat; segmentul a fost anulat de schimbarea de profil |
| `INVALID` | `RESULT_INVALID` | ignorat; identitatea nu este citibilă |

`versionId` este întotdeauna `null`: poarta nu creează versiuni, nu compune și nu scrie în store.
Un rezultat care sosește după anulare nu poate produce o versiune, chiar dacă identitatea lui este
altfel validă. Deduplicarea și lista segmentelor anulate sunt mărginite (128 de intrări fiecare).

## Vechea activare 110

110 nu are operație de anulare. Dacă la limita tick-ului există o comandă `PENDING` pentru altă
țintă, bariera o rezolvă la tick-ul curent (`applyAt`) și o numără în `invalidatedActivations` și în
`settledActivations`. Dacă 110 răspunde încă `PENDING` (comanda este programată mai târziu),
bariera refuză `ACTIVATION_PENDING` și face rollback, în loc să publice peste o comandă nesoluționată.
O comandă `PENDING` pentru exact ținta cerută este refolosită (`activationDuplicate: true`), fără o
a doua publicare.

Publicarea folosește originea închisă 110: `RESTORE` pentru restore, `IMPORT` pentru import și
`MANUAL_TUNING` pentru profil nou (110 nu are o origine `NEW_PROFILE`). Aplicarea efectivă la flotă
rămâne a controller-ului 110, la următorul tick comun.

## Istoric, limite și contoare

Istoricul de bariere și cel de generații anulate sunt mărginite la 16 intrări (configurabil 1–64);
intrările vechi sunt eliminate, nu fuzionate, iar `droppedBarriers` le numără. Captura de joburi
este limitată la 64, iar identitățile de rezultat la 128. `stats()` întoarce `changes`, `rejected`,
`rollbacks`, `invalidatedJobs`, `invalidatedActivations`, `duplicates`, `duplicateRequests`,
`lateResults`, `staleResults`, `segmentsClosed`, `segmentsOpened`, `barriers`, `droppedBarriers`,
`generations`, plus generația curentă. `dispose()` închide generația curentă (`CLOSED`) și respinge
cererile ulterioare cu `BARRIER_DISPOSED`.

## Ce nu este

Nu este estimator, worker, compunere 102, store 109, activare 110 sau import de savegame. Nu
creează versiuni, nu publică profiluri în afara activării țintei, nu scrie în store, nu mișcă
vehicule și nu citește ceasul de perete. Nu înlocuiește 069: primește doar identitatea de segment și
readback-ul fizic prin port. Nu certifică performanța jocului integrat și nu are captură de browser.

## Limitări

- Bariera și jurnalul de activări sunt RAM-only; nu există savefile, IndexedDB sau jurnal de
  recuperare după crash în acest scope. „Persistat” înseamnă aici commit-ul unic al barierei și al
  comenzii 110 în istoricul mărginit, nu durabilitate pe disc.
- O singură țintă de profil este activă per barieră; un `profileId` diferit este
  `TARGET_PROFILE_MISMATCH` și cere un controller 110 nou.
- O țintă păstrată în istoric nu poate primi o a doua barieră; după eliminarea din istoricul mărginit
  deduplicarea pe țintă nu mai este disponibilă.
- Portul 069 din probe este o implementare în memorie; dovezile nu acoperă store-ul nativ de
  înregistrări, timing-ul de frame sau continuitatea inputului.

## Verificări

`node --import ./scripts/register-typescript.mjs --test tests/app/learning-epoch.test.ts` acoperă
restore cu job în curs, import valid/invalid, profil nou cu epocă monotonă, rezultat târziu,
duplicat, rollback la eșec de activare, readback fizic schimbat, istoric mărginit, imuabilitatea
store-ului/flotei și `dispose`. Rulează și `npm run typecheck`, `npm run lint`,
`npm run format:check`, `npm run check:architecture`, `npm test`, `npm run learning:epoch` și
`npm run learning:epoch -- --check`. Dovezile sunt în
[Evidence/205-learning-epoch](Evidence/205-learning-epoch/README.md).

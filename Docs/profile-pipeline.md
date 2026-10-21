# Pipeline-ul de publicare a profilului învățat — PBI 112

`src/app/profile-pipeline.ts` (`112-profile-pipeline-v1`) este composition root-ul care leagă
modulele reale deja livrate într-un singur flux: segment închis 069/103 → coadă serială 103 →
estimator 101 → compunere 102 → versiune imuabilă 109 → activare 110 la tick comun. Modulul nu
reimplementează estimatorul, compunerea, validarea, store-ul sau activarea; le injectează.

```typescript
import { createProfilePipeline } from '../app';

const pipeline = createProfilePipeline({
  engineVersion: store.engineVersion,
  playerId: 'player-1',
  profileId: 'academy',
  learningEpoch: 1,
  sessionId: sessionId,
  worldEpoch: worldEpoch,
  queue, // coada 103 reală
  store, // store-ul 109 real (createCandidateProfileStore)
  activation, // controllerul 110, opțional
  tick: () => loop.getState().tick,
  advanceTick: () => loop.step().tick, // numai pentru processInterventions
});

const result = await pipeline.onSegmentClosed(closedSegment);
```

## Serviciile injectate

| Serviciu | Rol |
| --- | --- |
| `queue` | coada serială 103 (`LearningEstimatorQueue`); satisface structural `ProfilePipelineQueue` |
| `store` | store-ul 109; părintele explicit, checksum-ul și idempotența rămân ale lui |
| `activation` | controllerul 110; opțional, dar când lipsește nu se publică nimic |
| `delta` | poarta numerică 102; implicit `validateCandidateDelta` |
| `continuity` | port opțional 111, observat după o activare aplicată |
| `segments` | sursa 069/103 pentru apeluri care au doar `segmentId` |
| `tick` | readback de tick fix; publicarea țintește `tick() + 1` |
| `advanceTick` | driver de tick pentru `processInterventions`; bucla jocului deține tick-urile |

`engineVersion`, `playerId`, `profileId`, `learningEpoch`, `sessionId` și `worldEpoch` sunt
identitatea generației. `baseVersionId` fixează head-ul inițial; altfel se citește vârful istoricului
109. Head-ul este singurul părinte folosit pentru o versiune nouă.

## Statusuri închise

| Status | Când | Job | Versiune | Activare |
| --- | --- | --- | --- | --- |
| `COMPOSED` | LEARNING eligibil, compoziție schimbată și delta 102 acceptat | da | exact una | da, la tick+1 |
| `RECOMPOSED` | rezultat depășit în aceeași generație, ultima compoziție acoperă lanțul | da | exact una | da, la tick+1 |
| `NO_CHANGE` | compoziție acceptată, dar nicio valoare nu diferă de părinte | da | nu | nu |
| `DEDUPLICATED` | `segmentId` deja are versiune; store-ul întoarce versiunea existentă | nu | nu (existenta) | nu |
| `SKIPPED_MANUAL` | `MANUAL` sau `AUTO` | nu | nu | nu |
| `SKIPPED_INELIGIBLE` | `LEARNING` cu `eligible: false` | nu | nu | nu |
| `STALE_JOB` | epoch străin, bază care nu e strămoș, compoziție care nu acoperă lanțul | nu / da | nu | nu |
| `FAILED` | 103 `error`/`rejected`/`invalidated`/`cancelled`, 102 respins, 109 respins | da | nu | nu |

Motivele pipeline-ului sunt un vocabular închis (`profilePipelineReasons`); codul real al domeniului
(103/102/109/110) este păstrat în `result.code`, iar textul în `result.detail`. Nu există un al
treilea rezultat și nicio versiune parțială.

`stats()` numără cumulativ `segments`, `jobs`, `versions`, `noChange`, `manualSkipped` (MANUAL și
AUTO împreună, pentru că ambele sunt surse non-învățabile), `ineligibleSkipped`, `failed`, `stale`,
`recomposed`, `deduplicated`, `activationsPublished`, `activationsApplied` și `activationRejected`,
plus `history`, `dropped` și `headVersionId`. `history()` păstrează cele mai recente rezultate într-o
limită explicită (16 implicit, maximum configurabil 64) și numără evacuările.

## LEARNING, MANUAL și no-change

Numai un segment `LEARNING` cu `eligible: true` devine job 103. Pipeline-ul construiește jobul din
identitatea generației și payload-ul segmentului, apoi îl trimite în coada reală și așteaptă
outcome-ul terminal: admiterea, estimatorul, recompoziția serială și poarta 102 rulează acolo.
`MANUAL` și `AUTO` sunt sărite înainte de admitere (`MANUAL_SEGMENT_NOT_LEARNABLE`,
`AUTO_SEGMENT_NOT_LEARNABLE`), iar `LEARNING` neeligibil este `SEGMENT_INELIGIBLE`. Nicio cale
sărită nu creează job, versiune sau comandă 110.

O compoziție `composed` nu este suficientă pentru o versiune. Valorile acceptate sunt comparate cu
parametrii părintelui; dacă niciuna nu diferă, rezultatul este `NO_CHANGE`, fără versiune și fără
activare. Astfel un candidat identic cu baza, o dovadă slabă sau un `learningWeight` zero nu devin
profil publicat.

## Recompoziție și lanțul de versiuni

Un rezultat târziu din aceeași generație nu este aruncat de coada 103: ledger-ul epocii este
recompus în ordinea intervențiilor. Pipeline-ul marchează rezultatul `RECOMPOSED`, folosește ultima
compoziție și creează o singură versiune, cu părintele head-ul acceptat. O compoziție care nu
acoperă versiunile create între baza jobului și head este `STALE_JOB` (`BASE_SUPERSEDED`), nu o
suprascriere tacită a altei intervenții.

Două intervenții consecutive produc `v1` cu părintele bazei și `v2` cu părintele `v1`; istoricul 109
rămâne bază → vârf, iar proveniența cumulează segmentele. Fiecare segment schimbat produce exact o
versiune. Re-submisia aceluiași `segmentId` replay-ează cererea acceptată, iar store-ul 109 întoarce
versiunea existentă cu `deduplicated`, fără un job nou și fără o a doua activare.

## Erori, tick și continuitate

Un outcome 103 care nu este `composed` este `FAILED` cu motivul real (`RESULT_INVALID`,
`COMPOSITION_REJECTED`, `GENERATION_INVALIDATED`, `ORDER_CONFLICT`, `SEGMENT_DUPLICATE`, …), fără
versiune. Respingerea 102 este `DELTA_REJECTED`, iar respingerea 109 este `STORE_REJECTED`, ambele
cu codul închis al modulului respectiv. Nu există retry ascuns: o reîncercare este un apel explicit
al apelantului și trece din nou prin toate porțile.

O versiune creată este publicată imediat în 110 pentru `tick() + 1`. `advance()` aplică o comandă
`PENDING` la tick-ul fix curent și nu creează versiuni; comanda aplicată scrie numai
`appliedProfileVersion` și `tick` pe fiecare vehicul. Dacă există deja o comandă `PENDING`,
publicarea este refuzată cu motivul 110 real (`ACTIVATION_PENDING`) și raportată în rezultat, fără a
șterge versiunea deja imuabilă. `processInterventions` avansează tick-ul prin `advanceTick` între
intervenții; fără acel driver, două publicări în același tick lasă doar prima comandă în așteptare,
iar a doua este raportată explicit ca respinsă. Guard-ul 111 opțional este apelat după o activare
aplicată și este raportat ca atare; un verdict `BLOCKED` nu repară și nu șterge nimic.

## Ce nu este

Nu este estimator, worker, store de profil, controller de flotă sau UI. Nu inventează valori, nu
recompune altfel decât coada 103, nu calculează un delta în afara porții 102, nu persistă nimic pe
disc și nu are buclă de retry. Nu certifică performanța jocului integrat, fizica Babylon/Rapier sau
o sesiune de participant și nu conține captură de browser.

Verificare: `node --import ./scripts/register-typescript.mjs --test tests/app/profile-pipeline.test.ts`,
`npm run profile:pipeline`, `npm run profile:pipeline -- --check`, plus `npm run typecheck`,
`npm run lint`, `npm run format:check`, `npm run check:architecture` și `npm test`. Dovezile sunt în
[Evidence/112-profile-pipeline](Evidence/112-profile-pipeline/README.md).

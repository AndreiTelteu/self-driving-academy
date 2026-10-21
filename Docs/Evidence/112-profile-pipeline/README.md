# PBI 112 — integrarea intervenției estimatorului și publicarea

Implementat în `src/app/profile-pipeline.ts` (`112-profile-pipeline-v1`), exportat aditiv prin
`src/app/index.ts`. Pipeline-ul este composition root-ul care leagă modulele reale deja livrate:
coada serială 103, store-ul imuabil 109, activatorul de flotă 110, poarta numerică 102 și, opțional,
guard-ul de continuitate 111. Nu reimplementează estimatorul, compunerea, validarea sau activarea.

## Contract

- `createProfilePipeline(services)` — servicii injectate: `queue` (103), `store` (109), `activation`
  (110, opțional), `delta` (102, implicit `validateCandidateDelta`), `continuity` (111, opțional),
  `segments` (sursa 069/103, opțional), `tick` (readback de tick fix), `advanceTick` (driver de tick
  pentru intervenții consecutive), `engineVersion`, `playerId`, `profileId`, `learningEpoch`,
  `sessionId`, `worldEpoch`, `baseVersionId` și `history`.
- `onSegmentClosed(segment)` — un segment închis; întoarce un rezultat înghețat cu status închis.
- `processInterventions(segments)` — procesează intervențiile în ordine, cu un tick de host între ele.
- `advance()` — aplică o comandă 110 `PENDING` la tick-ul fix curent; nu creează versiuni.
- `history()` / `stats()` — istoric mărginit (16 implicit) și contoare cumulative.

## Reguli

- **LEARNING eligibil**: jobul 103 real este construit din segment și trimis în coadă; se așteaptă
  outcome-ul terminal. O compoziție schimbată, acceptată de 102, produce exact o versiune 109 cu
  părintele explicit (head-ul acceptat) și o comandă 110 publicată pentru tick-ul următor.
- **MANUAL / AUTO**: `SKIPPED_MANUAL`, fără job, fără versiune, fără activare.
- **LEARNING neeligibil**: `SKIPPED_INELIGIBLE`, fără job, fără versiune.
- **Fără schimbare**: `NO_CHANGE`, fără versiune și fără activare; o re-submisie a aceluiași segment
  rămâne `NO_CHANGE` fără un job nou.
- **Recompoziție**: un rezultat depășit în aceeași generație este `RECOMPOSED`; se folosește ultima
  compoziție a cozii și se creează o singură versiune, cu lanțul explicit.
- **Generație străină**: epoch sau bază care nu este strămoș al head-ului → `STALE_JOB`, fără job.
- **Erori**: `error`/`rejected`/`invalidated`/`cancelled` 103, respingerea 102 sau 109 → `FAILED` cu
  motivul real, fără versiune.
- **Idempotență**: re-submisia aceluiași `segmentId` replay-ează cererea acceptată, iar store-ul 109
  întoarce versiunea existentă (`deduplicated`); nu apare o versiune nouă.
- Nicio cale sărită sau eșuată nu publică un profil; nu există buclă de retry ascunsă.

## Dovezi

`tests/app/profile-pipeline.test.ts` — 19 teste, 19 pass. Acoperă: LEARNING eligibil → o versiune;
două intervenții consecutive → `v1` apoi `v2` cu părintele `v1`; MANUAL și AUTO fără job/versiune;
LEARNING neeligibil; no-change fără versiune și duplicatul lui fără job; duplicat idempotent cu
versiunea existentă; recompoziție explicită; epoch și bază străine; eroare reală de estimator; poartă
102 care respinge; admitere 103 respinsă (`ORDER_CONFLICT`); publicare la tick-ul următor; guard 111
observat fără reparare; istoric mărginit; sursa de segmente și segment lipsă; pipeline eliberat.

`tests/app/profile-pipeline-report.ts` + `scripts/run-profile-pipeline-report.mjs` — 7 scenarii,
53 verificări, 53 PASS. Transcript: [report.json](report.json) / [report.md](report.md).

Comenzi (rulate din rădăcină):

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run format:check` | exit 0, „All matched files use Prettier code style!” |
| `npm run check:architecture` | exit 0, `Architecture imports: PASS (243 TypeScript files)` |
| `npm test` | exit 0, `tests 1662`, `pass 1662`, `fail 0` |
| `npm run profile:pipeline` | exit 0, `SUMMARY checks 53/53, scenarios 7, overall PASS` |
| `npm run profile:pipeline -- --check` | exit 0, „Profile pipeline report is current” |

## Limite

- Transportul worker este un port injectat determinist care răspunde cu rezultatul real 101
  `blendProfileValue`; coada 103, governorul 221, compunerea 102, store-ul 109 și activarea 110 sunt
  reale, dar nu rulează un thread `worker_threads` și nici un browser.
- Flota este fixture-ul determinist 057 (24 taxiuri, 40 civile); raportul nu certifică bucla de joc
  integrată, fizica sau o sesiune de participant.
- Gate-ul 108 nu este prerequisite: dovada acoperă integrarea, nu acoperirea celor 24 de chei.
- Fără captură de browser, FPS, GPU sau măsurătoare hardware.
- PBI-ul rămâne în `In Progress`; acest raport nu mută task-ul și nu rulează validatorul de board.

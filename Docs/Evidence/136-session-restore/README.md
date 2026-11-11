# 136 — Migrare versionată și continuarea sesiunii după restart

Dovezi pentru PBI 136 (modulul Persistență, release V1). Contractele implementate sunt
`136-save-migration-v1` și `136-session-restore-v1`, descrise în
[Docs/15](../../15-salvare-si-import-export.md) (secțiunea „Contract implementat V1 (PBI 136)”) și
ancorate în contractele deja livrate: schema 127, snapshotul/planul de reluare 206, arhiva 135,
retenția 132 și salvarea de progres 130. Nivel de validare: `targeted`, conform
[politicii proporționale](../../validation-policy.md) — corectitudine izolată în Node, fără browser
real, FPS, Rapier sau hardware.

Migrarea nu inventează un istoric paralel: rulează pașii declarați de 127. Reluarea nu inventează o
lume: folosește snapshotul, checksum-ul și planul lui 206, plus rândurile 130 reale.

## Rezultatul implementării

- `src/persistence/save-migration.ts` (nou) — `migrateSaveDatabase` (descoperirea versiunii,
  export pre-migrare, upgrade tranzacțional, verificarea `untouched`), `buildSaveMigrationExport`,
  `readSaveMigrationExport` (parser strict + checksum + digest), `recoverSaveMigration` (target gol,
  scriere și verificare în aceeași tranzacție), `saveMigrationPlan`/`saveMigrationStores`.
- `src/persistence/session-restore.ts` (nou) — `restoreSession`: toate generațiile sesiunii,
  alegerea ultimului checkpoint valid cu raportarea celor sărite, planul de reluare 206, starea de
  lansare `PAUSED_AUTO` cu input eliberat, segmentele `OPEN → INCOMPLETE/RELOAD`, joburile filtrate
  de `learningEpoch`/`profileId`, observații idempotente și digestul ledgerului 130.
- `src/persistence/repository.ts` — `listCheckpoints(sessionId)`, ordonat determinist (tick, apoi
  generație, apoi identitate), plafonat de bugetul de listă 127.
- `src/persistence/world-checkpoint.ts` — `decodeWorldCheckpoint` extras din
  `loadLatestWorldCheckpoint`, ca 136 să aplice exact aceleași reguli fiecărei generații; comportamentul
  lui 206 rămâne neschimbat.
- `src/persistence/index.ts` — exporturile publice, **append la final**, fără reordonare.
- `tests/persistence/session-restore-fixture.ts` (nou) — harness real: writer 206, generație validă,
  generație mai nouă cu checksum stricat, rânduri 130 reale.
- `tests/persistence/session-restore.test.ts` (nou) — 18 teste deterministe.
- `tests/persistence/save-migration.test.ts` (nou) — 11 teste deterministe.
- `tests/persistence/session-restore-report.ts` (nou) — transcriptul determinist (65 de verificări).
- `scripts/run-session-restore-report.mjs` (nou) — CLI cu `--check` și `--output`.
- `package.json` — scriptul `restore:session`, adăugat ca **ultima** intrare din blocul `scripts`.
- `Docs/15-salvare-si-import-export.md` — secțiunea contractului 136, adăugată la final.
- `PBI/To Do/136-save_migrations.md` → `PBI/Done/136-save_migrations.md`.

## Cum funcționează (punctele cerute)

### 1. Cum se migrează schemele (versiuni, refuz pentru „prea nou")

Versiunile sunt declarate, nu deduse: `saveMigrationPlan(from)` întoarce exact pașii lipsă din
`PERSISTENCE_SCHEMA_STEPS`. `migrateSaveDatabase` deschide baza întâi la versiunea 1, ca să afle
versiunea reală fără să declanșeze un upgrade:

| Stare găsită | Rezultat | Pași aplicați |
| --- | --- | --- |
| Bază nouă (fără fișier) | `CREATED` | `127-v1-base-layout`, `127-v2-checkpoints-and-lifecycle-indexes` |
| Versiunea 1 cu rânduri | `MIGRATED` | `127-v2-checkpoints-and-lifecycle-indexes` |
| Versiunea 2 (build-ul curent) | `CURRENT` | niciunul |
| Versiunea 3 (build mai nou) | `FAILED`/`SCHEMA_TOO_NEW` | niciunul; baza nu este deschisă cu mai puține store-uri |

Tranzițiile `1 → 2` și `2 → 2` au test propriu, iar `saveMigrationPlan(3)` și deschiderea unei baze
mai noi sunt refuzate cu `SCHEMA_TOO_NEW`. Pe fixture-ul de raport: migrarea pornește de la
versiunea 1 cu 7 store-uri și 3 rânduri, aplică exact un pas și ajunge la versiunea 2 cu 8 store-uri,
păstrând digestul rândurilor (`d34458a8…`).

### 2. Ce se întâmplă exact la migrare eșuată (export + recuperare, fără corupere)

Exportul pre-migrare este construit **înainte** de upgrade: toate rândurile store-urilor existente,
canonicalizate `SDA-CJSON-1`, cu `SHA-256` peste document și un digest separat al rândurilor
(2 346 de code units pe fixture, 7 store-uri, 3 rânduri). Marcajul de schemă din `meta` nu este
exportat ca rând de utilizator; versiunea este purtată de `sourceSchemaVersion`/`targetSchemaVersion`.

Upgrade-ul rulează în tranzacția adaptorului. După `MIGRATION_FAILED`, modulul redeschide baza la
versiunea sursă și calculează din nou digestul: `untouched` este `true` numai dacă este identic.
Numere reale din raport:

| Măsură | Valoare |
| --- | --- |
| Cod | `MIGRATION_FAILED` |
| Versiune după eșec | 1 |
| Store `checkpoints` după eșec | absent |
| Rânduri în export | 3 |
| Digest neschimbat | `true` |
| Recuperare în bază goală | `RECOVERED`, verificat `true`, 3 rânduri, digest = export |
| Recuperare peste date | `RECOVERY_TARGET_NOT_EMPTY` |
| Export editat | `EXPORT_CHECKSUM_MISMATCH` (înainte de orice scriere) |

Recuperarea scrie toate rândurile într-o singură tranzacție și re-calculează digestul în interiorul
ei; o diferență anulează tranzacția, deci nu poate rămâne o salvare pe jumătate.

### 3. Cum se reiau pozițiile, cursele, pasagerii și ledger-ele din ultimul checkpoint valid

`restoreSession` citește toate generațiile sesiunii, cea mai nouă primul (tick, apoi generație), și le
decodează pe rând cu `decodeWorldCheckpoint` — exact regulile 206: checksum, coerența plic↔snapshot
(tick, profil, `learningEpoch`), apoi versiunile engine/fizică/hartă. Prima generație acceptată este
lumea reluată; celelalte sunt raportate cu identitate, tick, generație, cod și cale. Pe fixture:

| Măsură | Valoare |
| --- | --- |
| Candidați | 2 |
| Generație sărită | `checkpoint-136-invalid-newest` (`CHECKSUM_MISMATCH`, tick 180) |
| Checkpoint reluat | `checkpoint-136-valid`, tick 60, generația 1 |
| Payload verificat | 64 378 bytes, checksum de 64 caractere |
| Lume reluată | 70 vehicule, 30 curse, 30 pasageri, 3 segmente |
| Ledger 130 | 2 rânduri, digest `53b23f20…`, `rewardsReapplied` 0 |

Dacă nicio generație nu trece, rezultatul este `BLOCKED`/`CHECKPOINT_INVALID` cu lista săriturilor;
o sesiune fără checkpoint este `EMPTY`. O citire eșuată a ledgerului blochează reluarea
(`LEDGER_UNREADABLE`) în loc să promită o lume fără recompensele ei.

### 4. De ce pornirea este în pauză/AUTO, cu input eliberat

Lumea restaurată nu are voie să reintre în control manual: `launch.mode` este `PAUSED_AUTO`, cu
`paused`, `auto`, `inputReleased` și `manualVehicles = 0`. Toate cele 70 de vehicule sunt `AUTO`;
un taxi era `MANUAL` înainte de restart și este raportat ca `previousManualVehicles = 1`, nu restaurat
ca input activ. Segmentele `OPEN` devin `INCOMPLETE` cu motivul `RELOAD` (1 segment:
`segment-taxi-01`), deci sunt numite, nu pierdute. Observațiile finalizate se reiau idempotent cu
cheia `segmentId:observationId` (2 observații, 1 deja recompensată), iar rezultatele acceptate sunt
păstrate: `rewardsReapplied = 0`.

### 5. Ce arată numeric scenariile

| Scenariu | Numere din [report.json](report.json) |
| --- | --- |
| Migrare 1 → 2 | `MIGRATED`, 1 pas, 7 store-uri / 3 rânduri exportate, versiunea 2, 8 store-uri după |
| Bază nouă | `CREATED`, ambele treceri, 0 rânduri, versiunea 2 |
| Bază curentă | `CURRENT`, 0 pași |
| Build mai nou | `SCHEMA_TOO_NEW` (plan și migrare) |
| Migrare eșuată | `MIGRATION_FAILED`, versiunea 1, fără `checkpoints`, digest neschimbat |
| Recuperare | `RECOVERED`, verificat, 3 rânduri, digest = export |
| Restart cu generație nouă coruptă | 2 candidați, 1 sărit (`CHECKSUM_MISMATCH`), reluat tick 60 / generația 1 |
| Pornire | `PAUSED_AUTO`, 70 vehicule AUTO, 0 MANUAL, 1 MANUAL anterior, input eliberat |
| Segmente | 1 `OPEN` → 1 `INCOMPLETE` (`RELOAD`) |
| Joburi | 2 reluate (`dispatch-01`, `learning-01`), 4 anulate (`PROFILE_MISMATCH`, `LEARNING_EPOCH_MISMATCH`) |
| Epoch invalid | 0 reluate, 6 anulate |
| Profil schimbat | 2 reluate (joburile profilului nou), 4 anulate |
| Sesiune goală | `EMPTY` |
| Doar generație coruptă | `BLOCKED`/`CHECKPOINT_INVALID`, săritură `CHECKSUM_MISMATCH` |
| Versiuni incompatibile | `BLOCKED`/`CHECKPOINT_INVALID` |
| Read-only | amprenta bazei identică înainte/după |

## Verificări executate și rezultat real

Toate comenzile au fost rulate în worktree-ul `.worktrees/migration-136-01`, pe branch-ul
`loop-pbi/migration-136-01`.

| Comandă | Rezultat real |
| --- | --- |
| `npm run typecheck` | PASS (exit 0, ambele configurații tsconfig) |
| `npm run lint` | PASS (`eslint . --max-warnings 0`, fără avertismente) |
| `npm run format:check` | PASS (`All matched files use Prettier code style!`) |
| `npm run check:architecture` | PASS — `Architecture imports: PASS (340 TypeScript files)`, plus probele negative 6+4+3 și verificarea lifecycle |
| `npm run check:parameter-catalog` | PASS (`Parameter catalog is synchronized.`) |
| `npm test` | PASS — `tests 2462`, `pass 2462`, `fail 0`, `cancelled 0`, `skipped 0`, `duration_ms 77802.0623` |
| `node --import ./scripts/register-typescript.mjs --test tests/persistence/session-restore.test.ts` | PASS — `tests 18`, `pass 18`, `fail 0` |
| `node --import ./scripts/register-typescript.mjs --test tests/persistence/save-migration.test.ts` | PASS — `tests 11`, `pass 11`, `fail 0` |
| `node --import ./scripts/register-typescript.mjs scripts/run-session-restore-report.mjs` | PASS — `SUMMARY checks 65/65, scenarios 8, overall PASS` |
| `node --import ./scripts/register-typescript.mjs scripts/run-session-restore-report.mjs --check` | PASS — `Session restore report is current: …\Docs\Evidence\136-session-restore\report.json` |

Cele 29 de teste țintă acoperă: planul explicit și refuzul versiunii mai noi, baza nouă, migrarea
1 → 2 cu rânduri identice, baza curentă, migrarea eșuată fără corupere și cu export, recuperarea
verificată, refuzul targetului plin, exportul editat și exportul mai nou, plus: alegerea ultimului
checkpoint valid, plic incoerent, epoch invalid, profil schimbat, segmente incomplete, input eliberat,
joburi reluate/anulate cu motiv, observații idempotente, ledger digerat, `EMPTY`, `BLOCKED`,
incompatibilitate de versiuni, bugetul de candidați, ledger needabil și identitate invalidă.

## Fișiere atinse

- Create: `src/persistence/save-migration.ts`, `src/persistence/session-restore.ts`,
  `tests/persistence/save-migration.test.ts`, `tests/persistence/session-restore.test.ts`,
  `tests/persistence/session-restore-fixture.ts`, `tests/persistence/session-restore-report.ts`,
  `scripts/run-session-restore-report.mjs`, `Docs/Evidence/136-session-restore/` (`README.md`,
  `report.json`, `report.md`).
- Modificate: `src/persistence/repository.ts` (`listCheckpoints`), `src/persistence/world-checkpoint.ts`
  (`decodeWorldCheckpoint` extras, fără schimbare de comportament), `src/persistence/index.ts`
  (exporturi adăugate la final), `package.json` (scriptul `restore:session`, ultima intrare),
  `Docs/15-salvare-si-import-export.md` (secțiune nouă la final),
  `PBI/In Progress/136-save_migrations.md` → `PBI/Done/136-save_migrations.md`.

## Limitări

- Nivelul de validare este `targeted`: corectitudine izolată în Node, fără browser real, fără
  IndexedDB real, fără GPU, FPS, Rapier, soak sau hardware țintă. Nu este un gate `full` și nu
  certifică performanța jocului integrat.
- Migrarea este verificată pe dublul determinist al porturilor 127. Adaptorul IndexedDB real este
  folosit de build, dar un upgrade real de browser (inclusiv blocarea de către alt tab) nu a fost
  executat aici; `BLOCKED_UPGRADE` este raportat ca `OPEN_FAILED` de `migrateSaveDatabase`, iar
  reluarea lui rămâne `retryBlockedUpgrade()` al repository-ului.
- Exportul pre-migrare este ținut în memorie și întors apelantului, nu scris automat pe disc: un
  host care vrea un fișier `.json` trebuie să-l serializeze. Plafonul este 8 388 608 code units și
  32 768 de rânduri; peste ele, migrarea refuză explicit (`EXPORT_TOO_LARGE`) în loc să trunchieze.
- Marcajul `meta.schema` rămâne cel scris de pasul 1 (127), deci nu este folosit ca sursă de adevăr
  pentru versiune; 136 folosește versiunea reală a bazei. Nu am schimbat contractul 127.
- Reluarea întoarce starea și planul; **aplicarea** lor în scene (poziționarea vehiculelor, oprirea
  inputului, marcarea vizuală a segmentelor) aparține compoziției `src/app`/`src/ui`, care este
  read-only pentru acest PBI.
- Joburile de learning sunt clasificate, nu pornite: relansarea efectivă în worker rămâne a
  hostului, exact ca în contractul 206.
- `listCheckpoints` este plafonat la 512 rânduri (bugetul 127); o sesiune cu mai multe generații
  decât atât este refuzată cu `LIST_LIMIT` de repository, nu trunchiată.

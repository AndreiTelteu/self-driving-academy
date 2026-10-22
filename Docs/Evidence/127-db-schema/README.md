# Dovezi 127 — schema IndexedDB și repository local

Status: implementare și validare funcțională locală — PASS. Nivel de validare: `targeted` conform
[politicii proporționale](../../validation-policy.md) — corectitudine izolată și cost local. Nu se
revendică browser, FPS, Rapier, soak sau hardware.

## Ce s-a livrat

- `src/persistence/contracts.ts` — vocabularul închis al modulului: formatul `self-driving-academy-local`,
  numele stabil al bazei `self-driving-academy`, versiunea de schemă curentă `2`, cele 8 store-uri,
  cele 4 nume de index, bugetele fixe (`PERSISTENCE_LIMITS`), codurile de cauză închise
  (`persistenceReasonCodes`) și stările repository-ului.
- `src/persistence/ports.ts` — porturile pe care se izolează driverul: `DatabasePort`,
  `FactoryPort`, `TransactionPort`, `SchemaUpgrader`, `LockManagerPort` și contractul de deschidere
  (`OpenOpened` / `OpenBlocked` / `OpenFailed`).
- `src/persistence/schema.ts` — istoricul declarat al schemei: `PERSISTENCE_SCHEMA_STEPS` cu pasul
  `127-v1-base-layout` și pasul `127-v2-checkpoints-and-lifecycle-indexes`, plus `planUpgrade`,
  `applySchemaStep` și `verifySchemaDeclaration`.
- `src/persistence/records.ts` — validarea la limita de stocare: envelope-uri închise pentru
  segmente/scenarii/progres, checkpoint, activare, meta, profil 109 și setări 009; măsurarea
  canonicală a mărimii (`measureJsonBytes`) și bugetele de corp, adâncime, intrări și înregistrare.
- `src/persistence/indexeddb.ts` — adaptorul real peste `indexedDB` (deschis, upgrade, `versionchange`,
  blocaj, tranzacții, indexuri), cu tipuri structurale proprii ca `src/persistence` să poată fi
  type-checkat fără librăria DOM.
- `src/persistence/memory-idb.ts` — dublu în memorie al IndexedDB și al Web Locks: versiuni pe disc,
  pași de upgrade, `versionchange`, upgrade blocat, rollback de tranzacție, copiere prin
  structured-clone și coadă FIFO pentru lock-uri.
- `src/persistence/writer.ts` — autoritatea de scriitor: lock exclusiv Web Locks
  (`self-driving-academy-persistence-writer`), cu `claim()` non-blocant, `wait()` în coadă și
  `release()`; stările `WRITER` / `READ_ONLY` / `WAITING` / `RELEASED` / `NONE`.
- `src/persistence/repository.ts` — repository-ul local: deschidere cu plan de migrare în upgrade,
  gardul de scriitor, tranzacții multi-store, liste mărginite și statistici.
- `src/persistence/index.ts` — exportul public al modulului.
- `tests/persistence/` — 35 de teste: `schema.test.ts` (15), `repository.test.ts` (13),
  `writer.test.ts` (6), `evidence.test.ts` (2), plus `fixtures.ts` și `db-schema-report.ts`.
- `scripts/run-db-schema-report.mjs` + `npm run db:schema` — raport determinist cu 49 de verificări,
  `report.json` / `report.md` și suport `--check`.
- [Docs/15-salvare-si-import-export.md](../../15-salvare-si-import-export.md) — secțiunea
  „Contract implementat V1 (PBI 127)”: store-uri, chei, indexuri, migrări, stări explicite,
  autoritatea de scriere și limite.

## Rezultat

- Schema are **8 store-uri** la versiunea curentă `2`: `meta` (`key`), `profiles` (`versionId`,
  index `byProfile`), `profileActivations` (`profileId`), `segments` (`recordId`, indexuri `bySession`
  și `byStatus`), `scenarios` (`recordId`, index `bySession`), `progress` (`recordId`, indexuri
  `bySession` și `byStatus`), `settings` (`playerId`) și `checkpoints` (`checkpointId`, indexuri
  `bySession` și `byGeneration`). Cheile primare și indexurile sunt declarate într-un singur loc
  (`PERSISTENCE_KEY_PATHS` + `schema.ts`) și sunt folosite identic de adaptorul real, de dublul în
  memorie, de migrări și de raport.
- **Migrare explicită, nu calculată.** Pasul 1 creează 7 store-uri, pasul 2 creează `checkpoints` și
  adaugă `segments.byStatus` + `progress.byStatus` fără rescriere de rânduri. `planUpgrade` este
  continuu (fără goluri) și refuză explicit o bază mai nouă decât build-ul (`SCHEMA_TOO_NEW`).
  Upgrade-ul 1 → 2 a păstrat rândurile existente (1 rând înainte, 1 rând după) și indexul nou
  `segments.byStatus` returnează acel rând.
- **Stări explicite, nu excepții mută.** Upgrade blocat: repository-ul trece în `BLOCKED_UPGRADE` cu
  `UPGRADE_BLOCKED`, rolul devine `NONE`, iar `retryBlockedUpgrade()` după închiderea tabului
  blocant întoarce `READY` la versiunea 2. Eroare de deschidere: `FAILED` cu `OPEN_FAILED` (există
  și `OPEN_TIMEOUT` pentru `open()` care nu se finalizează în 15 s). Bază prea nouă: `SCHEMA_TOO_NEW`.
  `versionchange` de la un alt tab: `RELEASED_FOR_UPGRADE` cu `VERSION_CHANGE`, pagina eliberează
  lock-ul de scriere și închide conexiunea (0 conexiuni deschise rămase), iar o scriere ulterioară
  este `REJECTED`.
- **Un singur scriitor, prin Web Locks.** Primul tab: `WRITER`. Al doilea tab: `READ_ONLY` cu
  `WRITER_HELD_BY_OTHER_TAB`, iar scrierea lui este `REJECTED` (`WRITER_REQUIRED`) — nu există
  fallback nesigur. `wait()` pune al doilea tab în `WAITING`; când primul eliberează lock-ul, rolul
  devine `WRITER` și scrierea este `COMMITTED`, în timp ce fostul scriitor este `RELEASED` și nu mai
  poate scrie. Fără Web Locks (mediu fără `navigator.locks`) rolul rămâne `READ_ONLY` cu
  `WEB_LOCKS_UNAVAILABLE`.
- **Tranzacții coerente și rollback.** O tranzacție multi-store care eșuează la mijloc nu lasă niciun
  rând (`segments` = 0, `progress` = 0 după rollback). Activarea unui profil fără versiunea sa este
  `REFERENCE_MISSING` și nu lasă niciun rând de activare orfan (0 rânduri). O revizie mai veche este
  `STALE_REVISION`, o versiune de profil modificată este `IMMUTABLE_RECORD`, un checksum 109 stricat
  este `PROFILE_CHECKSUM_MISMATCH` (re-verificat la citire), iar re-scrierea identică a aceleiași
  versiuni este idempotentă (`COMMITTED`).
- **Limite aplicate, nu istoric nelimitat.** Corpul unei înregistrări este JSON simplu, măsurat
  canonical: cel mult 262 144 de octeți pentru corp, 1 048 576 pentru înregistrarea completă,
  adâncime 24, 20 000 de intrări, cel mult 256 de unități de cod pentru un identificator și cel mult
  512 de rânduri pentru o listă (`LIST_LIMIT` peste acest prag). Un corp prea mare este
  `BODY_TOO_LARGE`. Nu există cache sau listă fără plafon.
- **Adaptorul real este izolat de dublul fake.** `indexeddb.ts` (IndexedDB real) și `memory-idb.ts`
  (dublu determinist) implementează aceleași porturi, deci testele rulează în Node fără browser și
  fără dependențe noi în `package.json`.

Raportul complet are [49/49 verificări](report.json), tabelul uman este în [report.md](report.md),
ieșirea completă a testelor țintă este în [tests.txt](tests.txt), jurnalul comenzilor este în
[checks.txt](checks.txt), iar validarea board-ului este în [board.txt](board.txt).

## Validarea board-ului

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File ./PBI/Validate-Board.ps1 -RequireDone '127'
# { "Valid": true, "Total": 235, "Columns": { "To Do": 103, "In Progress": 0, "Done": 132 },
#   "FirstId": "001", "LastId": "235",
#   "RequiredDonePaths": [ "...\PBI\Done\127-db_schema.md" ] } — exit 0
```

**Notă de mediu:** validatorul trebuie rulat cu **PowerShell 7 (`pwsh`)**. Sub Windows PowerShell 5.1
el eșuează cu `Dependență inexistentă 045 041 030 pentru 054` — chiar și pe checkout-ul canonic, cu
board-ul neatinse de PBI 127 — din cauza comportamentului `ConvertFrom-Json` din 5.1, care nu
enumeră tablourile la scriere în pipeline. Este o limitare preexistentă a mediului, nu o
regresie introdusă de acest PBI.

## Reguli verificate

- **Schema este contract, nu convenție:** aceleași declarații hrănesc adaptorul real, dublul în memorie,
  planul de migrare și raportul; `verifySchemaDeclaration()` raportează `[]`.
- **Migrarea se aplică în upgrade, nu după:** planul este calculat în callback-ul `onupgradeneeded`,
  unde `oldVersion` este cunoscut; o migrare eșuată (`MIGRATION_FAILED`) lasă versiunea și rândurile
  anterioare intacte.
- **Nicio excepție mută:** deschiderea, blocajul de upgrade, schimbarea de versiune, lipsa
  Web Locks și lipsa dreptului de scriere sunt stări și coduri de cauză închise, nu `throw` neașteptat.
- **Un singur scriitor real:** lock exclusiv pe origine; al doilea tab este `READ_ONLY` explicit și
  scrierea lui este respinsă; transferul este o eliberare + o așteptare în coadă, nu o cursă.
- **Scrierea este mărginită și validată înainte de tranzacție:** corpul, adâncimea, numărul de
  intrări, dimensiunea, revizia, imutabilitatea profilului și checksum-ul sunt verificate înainte de
  a atinge baza.
- **Atomicitate:** activarea profilului și scrierea segmentului/progresului în aceeași tranzacție sunt
  fie ambele, fie niciuna.

## Comenzi și rezultate exacte

Toate verificările au rulat în worktree-ul `C:\Users\aandr\Sites\self-driving-academy\.worktrees\persistence-127-01`,
pe branch-ul `loop-pbi/persistence-127-01`, cu Node v24.19.0 și npm 11.17.0. Ieșirea completă este în
[checks.txt](checks.txt).

```powershell
npm run typecheck
# tsc --noEmit && tsc -p tsconfig.tests.json --noEmit — exit 0

npm run lint
# eslint . --max-warnings 0 — exit 0

npm run format:check
# All matched files use Prettier code style! — exit 0

npm run check:architecture
# Architecture imports: PASS (271 TypeScript files); negative probes 6+4+3; exit 0

npm test
# tests 1920, suites 1, pass 1920, fail 0, duration_ms 74185.5357 — exit 0

node --import ./scripts/register-typescript.mjs --test "tests/persistence/*.test.ts"
# tests 35, suites 0, pass 35, fail 0, duration_ms 454.3728 — exit 0

npm run db:schema
# SUMMARY checks 49/49, schema v2, stores 8, overall PASS — exit 0

node --import ./scripts/register-typescript.mjs scripts/run-db-schema-report.mjs --check
# DB schema report is current: Docs/Evidence/127-db-schema/report.json — exit 0

pwsh -NoProfile -ExecutionPolicy Bypass -File ./PBI/Validate-Board.ps1 -RequireDone '127'
# Valid: true, Total: 235, Done: 132, RequiredDonePaths: [...\PBI\Done\127-db_schema.md] — exit 0
```

## Fișiere atinse

Create:

- `src/persistence/contracts.ts`, `src/persistence/ports.ts`, `src/persistence/schema.ts`,
  `src/persistence/records.ts`, `src/persistence/indexeddb.ts`, `src/persistence/memory-idb.ts`,
  `src/persistence/writer.ts`, `src/persistence/repository.ts`
- `tests/persistence/fixtures.ts`, `tests/persistence/schema.test.ts`,
  `tests/persistence/repository.test.ts`, `tests/persistence/writer.test.ts`,
  `tests/persistence/evidence.test.ts`, `tests/persistence/db-schema-report.ts`
- `scripts/run-db-schema-report.mjs`
- `Docs/Evidence/127-db-schema/README.md`, `report.json`, `report.md`, `checks.txt`, `tests.txt`, `board.txt`

Modificate:

- `src/persistence/index.ts` — exportul public al modulului persistence
- `Docs/15-salvare-si-import-export.md` — secțiunea „Contract implementat V1 (PBI 127)”, versiunea
  documentului 0.5 → 0.6
- `package.json` — scriptul `db:schema`

Șterse / mutate pe board:

- `PBI/To Do/127-db_schema.md` — mutat fizic în `PBI/In Progress/127-db_schema.md` la început, apoi
  mutat fizic în `PBI/Done/127-db_schema.md` la finalizare.

## Limitări

- **IndexedDB real nu a fost rulat în Node.** Node 24 nu are `indexedDB` în mediu headless, iar
  proiectul nu are dependințe de testare browser. Toate probele rulează pe dublul în memorie
  `memory-idb.ts`, care modelează explicit versiunile pe disc, pașii de upgrade, `versionchange`,
  upgrade-ul blocat, rollback-ul de tranzacție, copierea prin structured-clone și coada FIFO a
  Web Locks. Adaptorul real `indexeddb.ts` este scris și type-checkat, dar **nu a fost executat într-un
  browser**; verificarea lui pe IndexedDB rămâne de făcut într-un PBI de integrare browser.
- **Nu există UI.** Nu există ecran pentru progresul salvării, pentru transferul de scriitor între taburi
  sau pentru starea `BLOCKED_UPGRADE`. Repository-ul expune stările, dar nimeni nu le desenează încă;
  legarea la `main.ts` și la HUD rămâne în PBI-urile de integrare.
- **Nu există autosave periodic.** PBI-ul 127 livrează schema și repository-ul, nu programarea
  salvarii la 15 s descrisă în modulul 15; aceasta revine PBI-urilor 128–130.
- **Nu există export/import de savefile.** Formatul `.sdasave` cu SHA-256, canonicalizare versionată
  și încărcare atomică din [modulul 29](../../29-savefile-si-integritate.md) nu sunt implementate aici;
  127 oferă doar stocarea locală pe care se va construi exportul.
- **Checkpointul conține doar identitatea și metadatele generației.** Snapshotul complet al lumii
  (Rapier, entități, RNG, ledger-e) rămâne în posesia PBI 206; aici se garantează `checkpointId`,
  `sessionId`, `profileId`, `worldEpoch`, `tick`, `generation`, `learningEpoch`, versiunile de
  engine/fizică/hartă și un corp JSON mărginit.
- **Politica de retenție nu este implementată.** Bugetele de dimensiune și de număr de rânduri sunt
  aplicate, dar ștergerea automată a checkpointurilor vechi, coalescing-ul cererilor periodice și
  limitele de latență cu storage lent rămân la PBI-urile 221–223 și 222.
- **Bugetele sunt propuneri, nu măsurători hardware.** Pragurile de octeți, adâncime, intrări, rânduri
  și timeout sunt valori fixe declarate în `PERSISTENCE_LIMITS`, validate prin teste, dar nu calibrate
  pe un profil real de utilizator; nu există măsurătoare de latență IndexedDB pe hardware.
- **Node/npm sub `engines`.** `package.json` cere Node >= 24.21.0 și npm >= 11.19.0, iar verificările
  au rulat pe Node v24.19.0 / npm 11.17.0 (mediul preinstalat al worktree-ului). Diferența nu a
  produs nicio eroare, dar nu este conformitatea exactă cerută de `engines`.

# 206 — Checkpoint complet și reluare coerentă a lumii

Dovezi pentru PBI 206 (modulul Persistență, release V1). Contractele implementate sunt
`206-world-snapshot-v1`, `206-world-resume-v1` și `206-world-checkpoint-v1`; secțiunea
„Contract implementat V1 (PBI 206)” din [Docs/15](../../15-salvare-si-import-export.md) descrie
regulile.

## Rezultatul implementării

Un checkpoint de lume este un document simplu, înghețat, care conține fiecare subsistem la
**același tick**: pozițiile, cursele, pasagerii, FSM/controller, oportunitățile evaluate,
semafoarele, dispecerul, learning-ul, cursorii RNG și deduplicarea. Salvarea progresului rămâne
separată; checkpointul descrie lumea fizică, nu progresul jucătorului.

- `src/persistence/world-snapshot.ts` (nou) — contractul snapshotului, validarea cu vocabular
  închis, bugetul de dimensiune, integritatea `SDA-CJSON-1` + `SHA-256`, reluarea keyed a RNG-ului
  și planul de reluare. Captura este refuzată dacă fixed-tick loop este în interiorul unui pas
  (`TICK_NOT_BOUNDARY`) sau dacă orice subsistem nu este exact la tickul capturat
  (`SUBSYSTEM_TICK_MISMATCH`); documentul nu este niciodată trunchiat, ci refuzat cu
  `SNAPSHOT_TOO_LARGE` sau `INVALID_SNAPSHOT`.
- `src/persistence/world-checkpoint.ts` (nou) — writer-ul unic: verifică rolul `WRITER` din
  repository (127), ține o singură generație în pregătire și una în commit, coalescează cererile
  identice, refuză un token străin (`WRITER_MISMATCH`) și scrie envelope-ul plus snapshotul într-o
  singură tranzacție. Pierderea GPU păstrează captura din RAM și permite commitul durabil abia
  după `integrateRecovery()`.
- `src/persistence/index.ts` — exportă contractele noi (append-only, la finalul fișierului).
- `tests/persistence/world-checkpoint-fixtures.ts` (nou) — lumea deterministă de 70 de vehicule
  (30 taxiuri, 40 civile), fără ceas și fără aleator.
- `tests/persistence/world-checkpoint-harness.ts` (nou) — origin-uri, taburi, ceasuri scriptate și
  versiunile folosite de teste.
- `tests/persistence/world-checkpoint.test.ts` (nou) — 15 teste țintă.
- `tests/persistence/world-checkpoint-report.ts` (nou) — transcrierea deterministă + măsurarea
  reală a costului.
- `scripts/run-world-checkpoint-report.mjs` (nou) — CLI `--check`, `--output`, `--cost`, `--samples`.
- `Docs/15-salvare-si-import-export.md` — versiune 0.10 + contractul 206.

## Verificări executate și rezultat

Toate comenzile au fost rulate în worktree-ul `.worktrees/checkpoint-206-01`, pe branch-ul
`loop-pbi/checkpoint-206-01`, peste commit-ul `74931102`.

| Comandă | Rezultat real |
| --- | --- |
| `npm run typecheck` | PASS (fără erori, ambele configurații tsconfig) |
| `npm run lint` | PASS (`eslint . --max-warnings 0`, fără avertismente) |
| `npm run format:check` | PASS (`All matched files use Prettier code style!`) |
| `npm run check:architecture` | PASS — `Architecture imports: PASS (301 TypeScript files)`, `Architecture negative probes: PASS (6 forbidden dependencies rejected)`, `Inspector exception negative probes: PASS (4 forbidden imports rejected)`, `Rapier adapter negative probes: PASS (3 forbidden imports rejected)`, `Renderer injection, readonly snapshots, defensive persistence and lifecycle: PASS` |
| `npm run check:parameter-catalog` | PASS (`Parameter catalog is synchronized.`) |
| `npm test` (suite completă) | PASS — `tests 2089`, `pass 2089`, `fail 0`, `cancelled 0`, `skipped 0`, `duration_ms 71098.9548` |
| `node --import ./scripts/register-typescript.mjs --test tests/persistence/world-checkpoint.test.ts` | PASS — `tests 15`, `pass 15`, `fail 0`, `duration_ms 755.599` |
| `node --import ./scripts/register-typescript.mjs scripts/run-world-checkpoint-report.mjs --check` | PASS — `SUMMARY checks 98/98, overall PASS`, `World checkpoint report is current: …\Docs\Evidence\206-world-checkpoint\report.json` |
| `npm run world:checkpoint -- --check` | PASS — aceleași `checks 98/98` |
| `npm run world:checkpoint -- --cost --samples 25` | PASS — `cost.json` / `cost.md` scrise pe această mașină |

Testele țintă (`tests/persistence/world-checkpoint.test.ts`, 15 teste):

1. o captură coerentă la graniță conține fiecare subsistem și checksumul lui;
2. o citire în pas, un tick nepotrivit și date incoerente sunt refuzate;
3. bugetul snapshotului și bugetul de body sunt aplicate, fără trunchiere;
4. un snapshot stocat este verificat înainte de citire;
5. cursorul RNG keyed este secvența reluată, nu un generator nou;
6. lumea restaurată continuă exact aceleași 60 de tickuri ca oracolul, byte-identic;
7. reluarea este `PAUSED_AUTO`, fără input și idempotentă;
8. doar pagina writer capturează și doar tokenul ei poate face commit;
9. un singur commit odată, coalescing la cerere identică și discard explicit;
10. un crash înainte de tranzacție nu lasă nimic durabil;
11. o moarte după tranzacție este raportată, dar rândul rămâne durabil;
12. o pierdere GPU păstrează captura din RAM și amână commitul durabil;
13. o versiune incompatibilă de engine/fizică/hartă este explicită;
14. envelope-ul și snapshotul trebuie să cadă de acord asupra tickului, profilului și epoch-ului;
15. atribuirea costului separă copia sincronă, encoding-ul și commitul.

### Scenariile cerute de PBI

| Scenariu | Dovadă în `report.json` |
| --- | --- |
| roundtrip în viraj/pickup | `taxi-01` este în `PICKUP` pe `ride-01` la tick 60; după 60 de tickuri cursa este `COMPLETED`, pasagerul `DELIVERED`, iar digestul canonic coincide cu oracolul |
| `taxi-08` cu pasager la bord | `ride-08` este `ONBOARD` la captură și `COMPLETED` la reluare, cu legătura de vehicul eliberată |
| crash înainte/după commit | `CRASHED_BEFORE_COMMIT` cu `0` rânduri; `CRASHED_AFTER_COMMIT` cu rândul durabil și reload `RESUMABLE` |
| două taburi | al doilea tab este `READ_ONLY` / `WRITER_HELD_BY_OTHER_TAB`, iar captura lui este `WRITER_REQUIRED` |
| job pending | 3 joburi DISPATCH + 3 LEARNING, fiecare `RELAUNCH` sau `INVALIDATED` cu motivul exact |
| device loss | `LOST` / `GPU_DEVICE_LOST`, commit `DEVICE_LOST`, apoi `INTEGRATED` și commit amânat `COMMITTED` din sursa `RAM` |
| versiune incompatibilă | `INCOMPATIBLE` cu `physicsVersion: stored rapier-0.21.0, current rapier-0.22.0` și tot `INCOMPATIBLE` pentru un engine mai vechi |

## Transcript determinist și cost real

Transcrierea deterministă este în [report.json](report.json) și [report.md](report.md): 98 de
verificări, fără ceas de perete, fără aleator și fără date inventate. Fiecare valoare „expected” este
contractul documentat, nu o copie a valorii observate. Se poate re-verifica cu
`npm run world:checkpoint -- --check`; comanda scrie raportul doar dacă lipsește și semnalează
diferențele altfel.

Costul real este singura măsurătoare cu ceas de perete și este ținut separat, în
[cost.json](cost.json) și [cost.md](cost.md). Condiții: un proces, aceeași lume de 70 de vehicule la
tick 60, dublul IndexedDB în memorie, `performance.now`, 25 de eșantioane.

| Fază | Min (ms) | Median (ms) | Max (ms) |
| --- | --- | --- | --- |
| Captură sincronă | 0.035 | 0.044 | 0.141 |
| Validare și checksum | 5.864 | 6.942 | 12.555 |
| Commit durabil | 7.802 | 11.853 | 16.995 |
| Total | 15.145 | 18.478 | 26.907 |

Snapshotul are 64 378 bytes din bugetul de 262 144 (24.558%), checksum
`c5a0738c0be1b8a149726738b9b9cccad5655229c542396b04d8aa9d24d8bcb5`. Captura sincronă este sub
0,15 ms chiar și la maxim, deci nu domină bugetul de frame; costul real stă în encoding și în
tranzacție. Măsurătoarea este a acestei mașini și a acestui dublu în memorie, nu a browserului.

## Fișiere atinse

- `src/persistence/world-snapshot.ts` (nou)
- `src/persistence/world-checkpoint.ts` (nou)
- `src/persistence/index.ts` (exporturi, append-only)
- `tests/persistence/world-checkpoint-fixtures.ts` (nou)
- `tests/persistence/world-checkpoint-harness.ts` (nou)
- `tests/persistence/world-checkpoint.test.ts` (nou)
- `tests/persistence/world-checkpoint-report.ts` (nou)
- `scripts/run-world-checkpoint-report.mjs` (nou)
- `package.json` (script `world:checkpoint`, adăugat la finalul blocului `scripts`)
- `Docs/15-salvare-si-import-export.md` (versiune 0.10 + secțiunea contractului 206)
- `Docs/Evidence/206-world-checkpoint/README.md`, `report.json`, `report.md`, `cost.json`,
  `cost.md` (acest folder)
- `PBI/In Progress/206-world_checkpoint.md` → `PBI/Done/206-world_checkpoint.md`

## Limitări

- Verificarea rulează pe dublul în memorie IndexedDB; adaptorul real folosește același port, dar
  verificarea în browser rămâne PBI 235. Nu există dovadă de browser pentru 206.
- Nu există încă un consumator în joc: captura, writer-ul și reluarea sunt implementate și testate
  la nivel de modul, dar bucla de joc nu apelează automat checkpointul periodic (integrarea rămâne
  în planul de salvare din Docs/15).
- Costul măsurat este al acestei mașini, pe dublul în memorie, la 70 de vehicule; nu este o
  măsurătoare de browser, GPU sau hardware țintă și nu certifică performanța jocului integrat.
- Snapshotul este un document complet, nu incremental: la 70 de vehicule are ~64 KB, iar bugetul
  admite până la 262 144 bytes. O lume mult mai mare este refuzată explicit, nu trunchiată; nu
  există încă o politică de compresie sau de checkpoint diferențial.
- `learningEpoch` și `profileId` sunt singurele criterii de validare a joburilor la reluare; un job
  a cărui configurație se schimbă fără să schimbe epoch-ul este relansat, nu invalidat.

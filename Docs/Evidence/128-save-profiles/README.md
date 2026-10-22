# 128 — Tranzacții pentru profil și activare

Dovezi pentru PBI 128 (modulul Persistență, release V1). Contractul implementat este
`128-profile-transaction-v1`; secțiunea de contract din
[Docs/15](../../15-salvare-si-import-export.md) descrie regulile.

## Rezultatul implementării

Versiunea de profil (109) și activarea (110) sunt acum scrise într-o singură tranzacție
multi-store peste `profiles` și `profileActivations`. Un crash între pași nu mai poate lăsa un
profil activ imposibil de încărcat: înainte de commit nu rămâne nimic, după commit rămân ambele
rânduri.

- `src/persistence/profile-transaction.ts` (nou) — regulile tranzacției, clasificarea
  provenienței (`BASE` / `MANUAL_TUNING` / `LEARNING`) și reconstruirea istoricului din
  legăturile de părinte stocate. Lucrează pe `TransactionPort`, deci rulează identic peste
  adaptorul IndexedDB real și peste dublul în memorie.
- `src/persistence/repository.ts` — `commitProfileActivation(input, hooks)` cu rezultate explicite
  `COMMITTED` / `CRASHED_AFTER_COMMIT` / `REJECTED`, și `getProfileHistory(profileId)`.
- `src/persistence/index.ts` — exportă contractul nou.

Reguli verificate înainte de commit: activarea indică exact versiunea scrisă de aceeași
tranzacție (`REFERENCE_MISSING`); părintele unei versiuni derivate trebuie să fie stocat
(`REFERENCE_MISSING`); o versiune stocată este imuabilă (`IMMUTABLE_RECORD`); secvența activării
nu se întoarce (`STALE_REVISION` pentru o secvență mai veche și pentru aceeași secvență cu altă
versiune); repetarea identică este idempotentă. O pagină fără lock de scriere este respinsă cu
`WRITER_REQUIRED`.

## Verificări executate și rezultat

Toate comenzile au fost rulate în worktree-ul
`.worktrees/saves-128-129-01`, pe branch-ul `loop-pbi/saves-128-129-01`, la commit-ul de bază
`54ede270`.

| Comandă | Rezultat real |
| --- | --- |
| `npm run typecheck` | PASS (fără erori, ambele configurații tsconfig) |
| `npm run lint` | PASS (`eslint . --max-warnings 0`, fără avertismente) |
| `npm run format:check` | PASS (`All matched files use Prettier code style!`) |
| `npm run check:architecture` | PASS — `Architecture imports: PASS (277 TypeScript files)`, `Architecture negative probes: PASS (6 forbidden dependencies rejected)`, `Inspector exception negative probes: PASS (4 forbidden imports rejected)`, `Rapier adapter negative probes: PASS (3 forbidden imports rejected)`, `Renderer injection, readonly snapshots, defensive persistence and lifecycle: PASS` |
| `npm test` (suite completă) | PASS — `tests 1952`, `pass 1952`, `fail 0`, `skipped 0`, `duration_ms 66182.3367` |
| `node --import ./scripts/register-typescript.mjs --test "tests/persistence/profile-transaction.test.ts"` | PASS — `tests 12`, `pass 12`, `fail 0` |
| `npm run save:profiles` | PASS — `SUMMARY checks 40/40, contract 128-profile-transaction-v1, overall PASS` |

Testele ținte ale PBI-ului (`tests/persistence/profile-transaction.test.ts`, 12 teste):

1. versiunea și activarea sunt comise de o singură tranzacție;
2. un crash înainte de commit nu lasă versiune și nu lasă activare, iar profilul activ anterior
   rămâne încărcabil;
3. un crash după commit păstrează ambele rânduri și istoricul le citește înapoi;
4. o activare fără versiunea ei este refuzată (`REFERENCE_MISSING`);
5. o versiune derivată fără părintele stocat este refuzată (`REFERENCE_MISSING`);
6. o versiune stocată nu poate fi înlocuită (`IMMUTABLE_RECORD`);
7. o secvență de activare mai veche nu poate înlocui versiunea activă mai nouă (`STALE_REVISION`);
8. aceeași secvență nu poate indica altă versiune (`STALE_REVISION`);
9. repetarea aceleiași tranzacții este idempotentă;
10. istoricul păstrează lanțul, versiunea activă, secvența, timestamp-urile și proveniența;
11. o versiune învățată își păstrează segmentele sursă;
12. o pagină fără lock de scriere nu poate comite.

Transcrierea deterministă este în [report.json](report.json) și [report.md](report.md), generată
de `scripts/run-save-profiles-report.mjs` (40 de verificări, fără clock, fără identități
aleatoare). Se poate re-verifica cu `npm run save:profiles -- --check`.

## Fișiere atinse

- `src/persistence/profile-transaction.ts` (nou)
- `src/persistence/repository.ts` (metode `commitProfileActivation`, `getProfileHistory`)
- `src/persistence/index.ts` (exporturi)
- `tests/persistence/profile-transaction.test.ts` (nou)
- `tests/persistence/save-profiles-report.ts` (nou)
- `scripts/run-save-profiles-report.mjs` (nou)
- `package.json` (script `save:profiles`, adăugat la finalul blocului `scripts`)
- `Docs/15-salvare-si-import-export.md` (versiune 0.7 + secțiunea contractului 128)
- `Docs/Evidence/128-save-profiles/README.md`, `report.json`, `report.md` (acest folder)
- `PBI/In Progress/128-save_profiles.md` → `PBI/Done/128-save_profiles.md`

## Limitări

- Verificarea rulează exclusiv pe dublul în memorie IndexedDB; adaptorul real este același cod de
  port, dar PBI 235 este cel care îl verifică în browser. Nu există dovadă de browser pentru 128.
- Clasificarea provenienței (`MANUAL_TUNING` / `LEARNING`) este derivată din listele de
  intervenții și segmente stocate în versiunea 109; ea nu aduce o sursă nouă și nu înlocuiește
  câmpul `origin` al contractului 109.
- `commitProfileActivation` publică o versiune și activează exact acea versiune. Activarea unei
  versiuni deja stocate rămâne operația separată `activateProfile` din PBI 127; tranzacția 128 nu
  acoperă revenirea la o versiune mai veche printr-o secvență mai mare, caz pentru care planul nu
  fixează încă un contract.
- Ordinea dintre tabelele și tranzacția este locală, cu un singur scriitor (127); 128 nu adaugă
  sincronizare între taburi.

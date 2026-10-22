# 129 — Salvarea segmentelor și checkpointuri

Dovezi pentru PBI 129 (modulul Persistență, release V1). Contractele implementate sunt
`129-segment-store-v1` și `129-intervention-checkpoint-v1`; secțiunile de contract din
[Docs/15](../../15-salvare-si-import-export.md) descriu regulile.

## Rezultatul implementării

Segmentele închise (069/090) sunt persistate în store-ul `segments` cu starea, motivul
închiderii și ordinea evenimentelor. Un segment scris parțial la o oprire necontrolată este
recuperat ca `INCOMPLETE`, cu un motiv explicit și fără date fabricate.

- `src/persistence/segment-store.ts` (nou) — scrierea în trei pași (manifest → bucăți de
  evenimente → sigiliu), digest FNV-1a 64 al listei ordonate și citirea care raportează realitatea:
  `readSegment` întoarce doar evenimentele aflate efectiv în magazin, numelează bucățile lipsă și
  motivul incompletului (`UNSEALED_WRITE`, `MISSING_CHUNKS`, `ORDER_VIOLATION`,
  `DIGEST_MISMATCH`, `SOURCE_INCOMPLETE`).
- `src/persistence/write-queue.ts` (nou) — coadă FIFO limitată: `enqueue` întoarce imediat,
  scrierea are loc mai târziu, în afara hot path-ului de tick; o coadă plină refuză segmentul nou
  cu `STORAGE_FULL`.
- `src/persistence/intervention-checkpoint.ts` (nou) — checkpointul unei intervenții active conține
  doar identitatea și generația; snapshotul complet al lumii rămâne la PBI 206.
- `src/persistence/index.ts` — exportă contractele noi.

## Verificări executate și rezultat

Toate comenzile au fost rulate în worktree-ul `.worktrees/saves-128-129-01`, pe branch-ul
`loop-pbi/saves-128-129-01`, peste commit-ul PBI-ului 128 (`2927b7e9`).

| Comandă | Rezultat real |
| --- | --- |
| `npm run typecheck` | PASS (fără erori, ambele configurații tsconfig) |
| `npm run lint` | PASS (`eslint . --max-warnings 0`, fără avertismente) |
| `npm run format:check` | PASS (`All matched files use Prettier code style!`) |
| `npm run check:architecture` | PASS — `Architecture imports: PASS (280 TypeScript files)`, `Architecture negative probes: PASS (6 forbidden dependencies rejected)`, `Inspector exception negative probes: PASS (4 forbidden imports rejected)`, `Rapier adapter negative probes: PASS (3 forbidden imports rejected)`, `Renderer injection, readonly snapshots, defensive persistence and lifecycle: PASS` |
| `npm test` (suite completă) | PASS — `tests 1963`, `pass 1963`, `fail 0`, `cancelled 0`, `skipped 0`, `duration_ms 70417.4707` |
| `node --import ./scripts/register-typescript.mjs --test "tests/persistence/segment-store.test.ts"` | PASS — `tests 11`, `pass 11`, `fail 0` |
| `npm run save:segments` | PASS — `SUMMARY checks 52/52, overall PASS` |

Observație honestă: la o rulare anterioară a suitei complete a eșuat un singur test de timp din
`tests/workers/protocol.test.ts` („real worker yields to cancellation …”, asertie pe ~100 ms), fără
legătură cu modulul de persistență; rulările următoare au trecut integral (1963/1963, de două
ori). Testul respectiv măsoară timp real și este predispus la flakiness pe o mașină încărcată.

Testele ținte ale PBI-ului (`tests/persistence/segment-store.test.ts`, 11 teste):

1. un segment închis păstrează starea, motivul și ordinea evenimentelor;
2. o intervenție lungă (500 evenimente) este stocată în 8 bucăți, cu secvența monotonă;
3. un crash înainte de bucăți lasă manifestul nesigilat (`UNSEALED_WRITE`), fără evenimente
   inventate;
4. un crash la mijlocul bucăților recuperează segmentul ca incomplet, cu bucățile prezente
   (0, 1) și cele lipsă (2, 3) numărate, nu invenționate;
5. o bucată lipsă este raportată `MISSING_CHUNKS` cu evenimentele stocate, nu cele promises;
6. o bucată modificată în afara scriitorului este detectată prin digest (`DIGEST_MISMATCH`);
7. un segment incomplet la sursă își păstrează motivul (`SOURCE_INCOMPLETE` / `DATA_LOSS`);
8. un segment invalid este refuzat înainte de orice scriere;
9. coada de scriere nu blochează apelantul (nimic scris în timp ce bucla de input a continuat) și
   păstrează ordinea segmentelor și a evenimentelor;
10. coada limitată refuză segmentul suplimentar cu `STORAGE_FULL` în loc să crească fără limită;
11. checkpointul unei intervenții active păstrează identitatea și generația și refuză o generație
    mai veche cu `STALE_REVISION`.

Transcrierea deterministă este în [report.json](report.json) și [report.md](report.md), generată
de `scripts/run-save-segments-report.mjs` (52 de verificări, fără clock, fără identități
aleatoare). Se poate re-verifica cu `npm run save:segments -- --check`.

## Fișiere atinse

- `src/persistence/segment-store.ts` (nou)
- `src/persistence/write-queue.ts` (nou)
- `src/persistence/intervention-checkpoint.ts` (nou)
- `src/persistence/index.ts` (exporturi)
- `tests/persistence/segment-store.test.ts` (nou)
- `tests/persistence/save-segments-report.ts` (nou)
- `scripts/run-save-segments-report.mjs` (nou)
- `package.json` (script `save:segments`, adăugat la finalul blocului `scripts`)
- `Docs/15-salvare-si-import-export.md` (versiune 0.8 + secțiunea contractului 129)
- `Docs/Evidence/129-save-segments/README.md`, `report.json`, `report.md` (acest folder)
- `PBI/In Progress/129-save_segments.md` → `PBI/Done/129-save_segments.md`

## Limitări

- Verificarea rulează pe dublul în memorie IndexedDB; adaptorul real folosește același port, dar
  verificarea în browser rămâne PBI 235. Nu există dovadă de browser pentru 129.
- Evenimentele sunt stocate ca fapte de ordine (secvență, tick, identitate, tip și payload JSON
  opțional); segmentul nu este un replay complet al lumii, iar mostrele de telemetrie (085/090)
  rămân în contractul lor. Segmentul nu stochează probele brute de telemetrie.
- Bucățile unui segment sunt rânduri separate în store-ul `segments`; o citire generică pe sesiune
  vede și rândurile de bucăți, deci consumatorii trebuie să grupeze după `body.segmentId`.
- Coada de scriere este limitată la segmente, nu la evenimente: un segment foarte mare ocupă un
  singur loc în coadă. Nu există încă o politică de retenție/evacuare a segmentelor vechi.
- Nu există încă un consumator în joc: coada și scrierea sunt implementate și testate la nivel de
  modul, dar PBI 129 nu conectează automat bucla de joc la coadă (integrarea rămâne în planul de
  salvare periodică din Docs/15).

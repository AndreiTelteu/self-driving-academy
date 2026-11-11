# Dovezi PBI 215 — persistență pentru KPI, misiuni zilnice și XP

Implementarea extinde arhiva de sesiune 135 la format/schemă versiunea 2 și adaugă bundle-ul economic
al sesiunii: calendarul daily 211/212, ledgerul comercial 209 cu review-urile și bucketurile KPI și
ledgerul XP 213. Bundle-ul este produs de modulele proprietare și persistat verbatim; persistența nu
recalculează nicio valoare de business.

## Ce s-a implementat

- `src/persistence/economy-save.ts` (contract `215-economy-save-v1`): documentul bundle-ului
  (`daily`, `economy`, `player`), checksum `SDA-CJSON-1`/`SHA-256`, bilanț de mărime pe componentă,
  cititor cu vocabular închis, rând 127 `meta` cu cheia `economy:<sessionId>`, commit tranzacțional
  cu verificare canonică după scriere și portul aplicației (`createEconomySaveStore`).
- `src/persistence/session-archive-economy.ts` (contract `215-session-archive-economy-v1`):
  arhiva versiunea 2 cu sloturile `session` (documentul 135 neschimbat) și `economy`, citirea
  versiunii 1 ca `LEGACY`, migrarea aditivă `upgradeSessionArchive`, exportul, previzualizarea și
  importul atomic peste store-urile 135 plus `meta`.
- Exporturile publice sunt adăugate la finalul `src/persistence/index.ts`.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS (proiect + `tsconfig.tests.json`, fără erori) |
| `npm run lint` | PASS (`eslint . --max-warnings 0`) |
| `npm run format:check` | PASS („All matched files use Prettier code style!”) |
| `npm run check:architecture` | PASS (345 fișiere TypeScript, toate probele negative) |
| `npm run check:parameter-catalog` | PASS („Parameter catalog is synchronized.”) |
| `node --import ./scripts/register-typescript.mjs --test "tests/persistence/economy-save.test.ts"` | 12/12 teste PASS |
| `node --import ./scripts/register-typescript.mjs --test "tests/persistence/economy-save-report.test.ts"` | 2/2 teste PASS (transcript curent + determinism) |
| `npm test` (suita completă) | 2506 teste, 2506 pass, 0 fail, 75 053 ms |
| `npm run save:economy` | 32/32 verificări PASS, `Docs/Evidence/215-save-economy/report.json` + `report.md` scrise |
| `npm run save:economy -- --check` | „Save economy report is current” (transcript determinist) |

## Numere reale (din `report.json`)

- Bundle: `daily` 4 919 B, `economy` 7 341 B, `player` 1 745 B, total 14 005 B din plafonul
  1 048 576 B; rândul `meta` are 14 647 B din bugetul de 1 048 576 B (1,4 %).
- Arhiva versiunea 2: slot `session` 65 538 B, slot `economy` 14 495 B, total 80 033 B din
  3 149 824 B; checksum SHA-256 de 64 caractere.
- Înainte → după export/import: sold XP 100,5 (100 500 000 micro-XP) → 100,5, nivel 2 → 2,
  intrări XP 2 → 2, settle-uri 3 → 3, review-uri 1 → 1, zile KPI 1 → 1, recompense daily 1 → 1,
  `historyScans` 0 → 0; bundle-ul este canonic identic (`bundleIdentical: true`).
- Ziua KPI: venit 690 unități minore, 1 cursă finalizată, 1 eșuată, 1 anulată, 1 review, `ratingSum` 1,
  media 1.
- Al doilea import al aceleiași arhive: delta XP 0, recompense daily tot 1, revizia rândului 2.
- Refuzuri închise: format nou `FORMAT_VERSION_TOO_NEW`, checksum modificat `CHECKSUM_MISMATCH`,
  componentă peste buget `COMPONENT_TOO_LARGE`, credit negativ `PLAYER_INVALID`, sesiune străină
  `SESSION_MISMATCH`, quota plină `STORAGE_FULL` (cu rollback dovedit prin amprentă identică), al
  doilea tab `WRITER_REQUIRED`.
- Arhivă versiune 1: `LEGACY`, citită de cititorul 135, slot economic `UNCHANGED` după import,
  migrare aditivă cu componentele 135 identice.

## Fișiere atinse

- `src/persistence/economy-save.ts` (nou)
- `src/persistence/session-archive-economy.ts` (nou)
- `src/persistence/index.ts` (exporturi adăugate la final)
- `tests/persistence/economy-save-fixture.ts` (nou)
- `tests/persistence/economy-save.test.ts` (nou)
- `tests/persistence/economy-save-report.ts` (nou)
- `tests/persistence/economy-save-report.test.ts` (nou)
- `scripts/run-save-economy-report.mjs` (nou)
- `package.json` (scriptul `save:economy`, ultima intrare din blocul `"scripts"`)
- `Docs/29-savefile-si-integritate.md` (secțiunea contractului 215)
- `PBI/To Do` → `PBI/Done` (fișierul 215)

## Cum se verifică

1. `npm run save:economy` regenerează transcriptul; `npm run save:economy -- --check` îl verifică.
2. `tests/persistence/economy-save.test.ts` acoperă round-trip-ul complet, arhiva veche, migrarea
   aditivă, componenta peste plafon, importul repetat, rollback-ul pe quota plină, al doilea tab,
   rollback-ul de ceas și refuzul unui credit XP negativ.
3. Testele compară valori, nu absența excepțiilor: soldul, nivelul, bucketurile KPI, review-urile și
   calendarul daily sunt comparate canonic înainte și după import.

## Limitări

- 209 nu expune un punct de restaurare din snapshot: bundle-ul comercial este verificat structural
  (versiuni, `historyScans: 0`, identități, referințe charge/refund, aritmetica bucketurilor,
  „dovezile reținute ≤ totaluri”), iar tarifele și notele nu sunt recalculate în persistență. Un
  rebuild live al ledgerului 209 din snapshot rămâne al modulului 209.
- Bundle-ul stă într-un singur rând `meta`; istoricul sintetic peste plafonul de 1 MiB este refuzat
  explicit, nu împărțit pe mai multe rânduri. Nivelul de validare este `targeted`: costurile de
  storage/memorie sunt raportate ca bytes măsurați, nu ca măsurători de hardware.
- Exportul/importul nu are încă acțiune de fișier și envelope `.sdasave`: acelea rămân ale PBI 234.

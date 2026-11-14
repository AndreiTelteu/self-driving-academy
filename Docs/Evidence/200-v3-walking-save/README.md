# 200 — salvarea personajului și migrare V3

Contract: `200-walking-save-v1` (format version 3 al arhivei de sesiune, schema 3). Slot nou:
`200-walking-character-v1`.

## Ce s-a livrat

- `src/persistence/walking-save.ts` — envelope-ul v3, slotul `character`, migrarea v1/v2 → v3,
  cititorul fail-closed și planul de reload.
- `src/persistence/index.ts` — exporturile publice, adăugate la finalul fișierului.
- `tests/persistence/walking-save-fixture.ts` — sesiunea reală 135 + 215 la tick-ul personajului plus
  cele două stări reale de personaj (pe jos și în taxi).
- `tests/persistence/walking-save.test.ts` — 13 teste deterministe.
- `tests/persistence/walking-save-report.ts` și `tests/persistence/walking-save-report.test.ts` —
  raportul de dovezi și testul care îl compară cu transcrierea comisă.
- `scripts/run-v3-walking-save-report.mjs` — generatorul `npm run walking:save` cu `--check`.
- `package.json` — o singură intrare nouă, ultima din `scripts`: `walking:save`.
- `Docs/29-savefile-si-integritate.md` — secțiunea „Contract implementat V3 (PBI 200)".

Sloturile livrate nu sunt rescrise: `components.session` este documentul 135 exact, iar
`components.economy` bundle-ul 215 exact, fiecare cu checksum-ul lui. Migrarea le copiază prin
referință și compară digestul canonic înainte și după.

## Comenzi executate și rezultat real

| Comandă | Rezultat |
| --- | --- |
| `npm run walking:save` | raport scris, `checks 160/160`, `scenarios 4/4`, `refusals 18/18`, overall `PASS`, digest `dbe3045fa22e35b7a2002d242b58e7dbdf1569c3508b4000b5e672bafd57d650` |
| `npm run walking:save -- --check` | `Walking save report is current`, `Walking save markdown is current`, exit 0 |
| `node --import ./scripts/register-typescript.mjs --test "tests/persistence/walking-save.test.ts"` | 13 teste, 13 trecute, 0 eșecuri, 2 841,8 ms |
| `node --import ./scripts/register-typescript.mjs --test "tests/persistence/walking-save-report.test.ts"` | 1 test, 1 trecut, 0 eșecuri |
| `npm run typecheck` | `tsc --noEmit` plus `tsc -p tsconfig.tests.json --noEmit`: 0 erori |
| `npm run lint` | `eslint . --max-warnings 0`: 0 erori, 0 avertismente |
| `npm run format:check` | `All matched files use Prettier code style!` |
| `npm run check:architecture` | `Architecture imports: PASS (410 TypeScript files)`, probe negative `PASS` |
| `npm run check:parameter-catalog` | `Parameter catalog is synchronized.` |
| `npm test` | 3 406 teste, 3 406 trecute, 0 eșecuri, 114 361 ms |

## Numerele reale ale raportului

| Scenariu | Migrare | Checksum (prefix) | Slot `session` | Slot `economy` | Slot `character` | Reload | Entități | XP |
| --- | --- | --- | ---: | ---: | ---: | --- | ---: | ---: |
| `V2_WALKING` | v2 → v3 | `8cc80793014f…` | 65 534 B | 14 495 B | 2 584 B | `CHARACTER:character:player-1`, camera `character:player-1`, pauză | 71 | 100,5 |
| `V2_SEATED` | v2 → v3 | `89124a0fd19e…` | 65 534 B | 14 495 B | 3 004 B | `VEHICLE:vehicle:taxi-197`, camera `vehicle:taxi-197`, pauză | 72 | 100,5 |
| `V2_DEFAULT` | v2 → v3, `MIGRATION_DEFAULT` | `eee3d147f880…` | 65 534 B | 14 495 B | 3 178 B | `CHARACTER:character:player-1`, pauză | 71 | 100,5 |
| `V1_LEGACY` | v1 → v3, `MIGRATION_DEFAULT` | `d4b1561f4536…` | 65 534 B | 4 B (`null`) | 3 178 B | `CHARACTER:character:player-1`, pauză | 71 | 0 |

Bugete: `session` 2 101 248 B, `economy` 1 048 576 B, `character` 65 536 B, total 3 215 360 B,
fișier 3 280 896 B. Documentele produse au 83 190 / 83 610 / 83 784 / 69 301 unități de cod.

Cele 18 refuzuri închise, fiecare cu inputul neschimbat dovedit prin digest:

`CHECKSUM_MISMATCH` (checksum rescris), `MISSING_FIELD` (`components.character` șters),
`FORMAT_VERSION_TOO_NEW` (format 4), `SCHEMA_TOO_NEW` (schemă 4, re-stampată),
`CHECKSUM_MISMATCH` (schemă 4 fără re-stampare — checksum-ul este primul), `PARSE_ERROR`,
`DUPLICATE_KEY`, `LEGACY_WALKING_SAVE` (v2 dat cititorului v3), `ALREADY_CURRENT` (v3 migrat din nou),
`SESSION_MISMATCH`, `SIZE_MISMATCH`, `CAMERA_AUTHORITY_MISMATCH`, `AUTHORITY_MISMATCH`,
`TICK_MISMATCH`, `CHECKSUM_MISMATCH` (XP modificat doar în slotul 215), `CHECKSUM_MISMATCH` (lume
modificată doar în slotul 135), `ENTITY_SET_MISMATCH` (un vehicul viu în plus), `SPAWN_BLOCKED`
(spawn în interiorul primei clădiri autorate).

## Cum funcționează

1. **Slot nou, schemă nouă.** Envelope-ul urcă la `formatVersion 3` / `schemaVersion 3` și adaugă un
   singur slot, `character`; sloturile `session` (135) și `economy` (215) rămân cu aceleași documente
   și aceleași checksum-uri.
2. **Migrare care păstrează tot.** `upgradeWalkingSave` citește intrarea cu cititorul ei real, copiază
   componentele prin referință și compară digestul canonic al fiecărui slot purtat înainte și după;
   lumea, personajul, KPI-urile, calendarul daily și ledgerul XP sunt deci aceiași octeți.
3. **Regula pentru sesiunile fără slot.** Spawn-ul autorat validat de walker-ul 192, autoritate
   `CHARACTER:<id>`, camera pe același personaj, ținta 198 din generația de profil a sesiunii, model de
   segmente gol la tick-ul salvării, un singur corp în flota 197.
4. **Reload coerent.** Pauză `PAUSED_AUTO`, input eliberat, taste ținute neutralizate, autoritate și
   cameră pe aceeași entitate, set de entități identic cu cel salvat, zero corpuri create, XP și daily
   identice la al doilea reload.
5. **Integritate fail-closed.** Buget → parsare strictă → format → canonic → checksum → schemă →
   sloturi (fiecare cu cititorul proprietarului) → bilanț de mărime; orice abatere este un cod închis,
   fără migrare parțială și fără scriere.

## Limitări

- Walker-ul 192 nu are invers de stare: reluarea recreează corpul la poziția salvată (biți identici) și
  tick-ul walker-ului repornește de la 0, în timp ce tick-ul sesiunii rămâne cel salvat.
- Cablarea în aplicație (pauză la export, capturare, aplicare la reload) nu face parte din acest
  contract; modulul nu scrie în IndexedDB și nu creează writer.
- Camera salvată în mijlocul tranziției de 18 tick-uri se restaurează exact (17 tick-uri rămase), dar
  continuarea ei depinde de tick-urile consumatorului.
- `vehicleIds` este lista de entități a lumii (maximum 128 din 206); un vehicul care nu există în lume
  nu poate fi salvat.

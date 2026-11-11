# Dovezi 135 — arhiva de sesiune

Status: implementare și validare funcțională locală — PASS. Nivel de validare: `targeted` conform
[politicii proporționale](../../validation-policy.md) — corectitudine izolată și cost local, fără
browser real, FPS, Rapier, soak sau hardware. Nu se revendică scrierea în IndexedDB-ul unui browser
real: adaptorul real și schema sunt cele livrate de 127, iar aici se verifică regulile peste aceleași
porturi, cu dublul determinist în memorie.

## Ce s-a livrat

- `src/persistence/session-archive.ts` — contractul `135-session-archive-v1`: envelope-ul
  `self-driving-academy-session-archive` (format/schemă/versiuni), sloturile explicite
  (`checkpoint`, `progress`, `campaign`, `settings`, `profile`, `scenarios`), bilanțul de mărime
  pe componente cu plafoane, checksum-ul `SDA-CJSON-1`/SHA-256, constructorul, cititorul strict,
  coerența între componente și exportul din repository.
- `src/persistence/session-archive-import.ts` — contractul `135-session-archive-import-v1`:
  tranzacția unică de înlocuire (`commitSessionArchiveRows`), portul de graniță tranzacțională,
  store-ul aplicației (`createSessionArchiveStore`) cu `export`, `preview` și `import`.
- `src/persistence/index.ts` — exporturile publice, adăugate exclusiv la finalul listei.
- `tests/persistence/session-archive-fixture.ts`, `session-archive.test.ts`,
  `session-archive-report.ts` — 15 teste deterministe și transcriptul raportului, peste un fixture
  real: writerul 206, store-ul 130, versiunile 109/110 și rândurile 127 `SCENARIO`.
- `scripts/run-session-archive-report.mjs` + `npm run save:session-archive` (ultima intrare din
  `package.json`), cu `--check`.
- [Docs/29-savefile-si-integritate.md](../../29-savefile-si-integritate.md) — secțiunea
  „Contract implementat V1 (PBI 135) — arhiva de sesiune”.

## Ce conține arhiva și cum e declarată mărimea

Envelope: `format = self-driving-academy-session-archive`, `formatVersion 1`, `schemaVersion 1`,
`units: SI`, `createdAt`, `versions {engine, physics, map}`, `session {sessionId, playerId,
worldEpoch}`, `components`, `sizes`, `checksum`.

Fiecare componentă are slotul ei și parserul modulului care o deține: rândul 206/127 al lumii
(`CheckpointRecord`, verificat cu `readWorldSnapshot`), rândul 130 `MISSION_TRACKER`, rândul 130
`CAMPAIGN_LEDGER`, rândul 009 de setări, referința de generație a profilului (109/110) și rândurile
127 `SCENARIO` (maximum 8).

Bilanțul de mărime din scenariul de raport (bytes canonici UTF-8, măsurați cu `measureJsonBytes`,
adică exact bugetul 127 folosit la scrierea înapoi):

| Componentă | Bytes | Plafon |
| --- | --- | --- |
| `checkpoint` | 54 470 | 524 288 |
| `progress` | 7 430 | 524 288 |
| `campaign` | 1 460 | 524 288 |
| `settings` | 914 | 131 072 |
| `profile` | 315 | 65 536 |
| `scenarios` | 274 | 524 288 |
| **total** | **64 863** | **2 097 152** |

Documentul canonic are **65 538** de code units, iar checksum-ul are 64 de caractere hex. O
componentă peste bugetul ei este refuzată cu `COMPONENT_TOO_LARGE` (măsurat: 3 scenarii de 200 000
de bytes), un total declarat peste plafon cu `ARCHIVE_TOO_LARGE`, iar o declarație care nu
corespunde măsurătorii cu `SIZE_MISMATCH`. Nu există trunchiere.

## Integritate și coerență înainte de scriere

Ordinea la citire: mărime/adâncime → `parseStrictJson` → format/versiuni (un layout mai nou este
refuzat înainte de checksum) → `SDA-CJSON-1` + SHA-256 peste envelope-ul fără `checksum` → declarația
de mărime → parserele componentelor → coerența între componente. Rezultate reale:

- fișier cu un câmp modificat: `CHECKSUM_MISMATCH`, iar sesiunea stocată rămâne byte cu byte
  identică;
- jurnal de campanie rescris (XP +1 000) **și** envelope re-stampat corect: `CAMPAIGN_INVALID`,
  pentru că rândul 130 este rejucat în ledgerul 125 real și comparat digest cu digest;
- rând de progres al altei sesiuni, cu envelope re-stampat: `SESSION_MISMATCH`;
- referință de profil care numește altă versiune decât checkpointul: `PROFILE_GENERATION_MISMATCH`;
- profil stocat a cărui activare s-a deplasat față de generația checkpointului:
  `PROFILE_GENERATION_MISMATCH`, sesiune neatinsă;
- versiune 109 lipsă în baza țintă: `PROFILE_VERSION_MISSING` (importul de profil rămâne 134);
- chei duplicate în text: `DUPLICATE_KEY`; `formatVersion 2`: `FORMAT_VERSION_TOO_NEW`;
- altă sesiune cerută: `SESSION_MISMATCH`; arhivă fără componente: `ARCHIVE_EMPTY`.

## Cum se demonstrează înlocuirea fără adunarea recompenselor

Arhiva sursă (3 misiuni finalizate, **300 XP**, **6** recompense acordate) este importată peste o
sesiune țintă aflată mai departe în campanie (6 misiuni, **600 XP**):

| Măsură | Înainte | După import |
| --- | --- | --- |
| XP | 600 | **300** |
| recompense acordate | — | **6** |
| misiuni finalizate | 6 | **3** |

Rezultatul este XP-ul arhivei, nu 600 + 300. Aceeași finalizare 116 livrată din nou ledgerului
restaurat răspunde `DUPLICATE` cu **0 XP**. Un al doilea import al aceleiași arhive lasă XP **300** și
**6** recompense, deci operația este idempotentă. În plus, tranzacția recitește sesiunea scrisă și
compară digesturile 130 și totalul XP cu arhiva; o diferență anulează tot.

## Atomic și înlocuitor

O singură tranzacție peste `profiles`, `profileActivations`, `checkpoints`, `progress`, `settings` și
`scenarios`: referința de profil este rezolvată, rândurile existente sunt citite și validate, apoi
șterse, generația arhivei este scrisă (revizii 1,1 → 2,2 în scenariul de raport) și sesiunea este
recitită și verificată în aceeași tranzacție. Un eșec injectat înainte de commit (`beforeCommit`)
produce `TRANSACTION_ABORTED`, iar amprenta sesiunii rămâne identică byte cu byte. Al doilea tab
(rol `READ_ONLY`) este refuzat cu `WRITER_REQUIRED`.

## Comenzi executate și rezultat real

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run format:check` | „All matched files use Prettier code style!” |
| `npm run check:architecture` | PASS, 332 fișiere TypeScript, probe negative 6+4+3 PASS |
| `npm run check:parameter-catalog` | „Parameter catalog is synchronized.” |
| `node --import ./scripts/register-typescript.mjs --test "tests/persistence/session-archive.test.ts"` | 15/15 teste pass, 0 fail |
| `npm test` | 2371/2371 teste pass, 0 fail |
| `npm run save:session-archive` | 58/58 verificări, 3 scenarii, overall PASS |
| `npm run save:session-archive -- --check` | „Session archive report is current” |

Transcript: [report.json](report.json) și [report.md](report.md). Verificările sunt numerotate în
raport: 15 pentru structura și bilanțul de mărime, 14 pentru round-trip, 9 pentru recompense, iar
restul pentru refuzuri și limite.

## Fișiere atinse

- Create: `src/persistence/session-archive.ts`, `src/persistence/session-archive-import.ts`,
  `tests/persistence/session-archive-fixture.ts`, `tests/persistence/session-archive.test.ts`,
  `tests/persistence/session-archive-report.ts`, `scripts/run-session-archive-report.mjs`,
  `Docs/Evidence/135-session-archive/`.
- Modificate: `src/persistence/index.ts` (doar append la final),
  `Docs/29-savefile-si-integritate.md`, `package.json` (ultima intrare din `scripts`),
  `PBI/In Progress/135-export_session.md` → `PBI/Done/135-export_session.md`.

## Limitări

- Repository-ul 127 nu expune încă propria conexiune ca graniță tranzacțională, iar
  `src/persistence/repository.ts` nu este în ownership-ul acestui PBI. Importul primește deci un port
  (`SessionArchiveTransactionRunner`) pe care integratorul îl leagă la conexiunea paginii care deține
  lock-ul; în teste și în raport portul este o a doua conexiune pe aceeași bază în memorie, deci
  tranzacția și rollback-ul sunt reale, nu simulate. Cablarea `repository → runner` rămâne pentru
  PBI-ul de integrare (234/136).
- Nu există UI de export/import sau de confirmare a înlocuirii; store-ul oferă `preview` (validare +
  starea curentă) exact pentru pasul de confirmare, dar compunerea în `main.ts` nu face parte din
  acest PBI.
- Arhiva nu transportă profiluri (doar referința de generație), replay-uri sau telemetrie brută:
  profilul se importă explicit prin 133/134, iar replay-urile rămân opționale conform politicii de
  retenție.
- Plafoanele (2 MiB total, 8 scenarii) sunt propuneri derivate din bugetele 127, nu calibrate pe
  hardware sau pe sesiuni lungi reale; depășirea este refuzată explicit, nu trunchiată.
- Nu este implementat envelope-ul `.sdasave`, acțiunile de fișier și confirmarea din 234; arhiva
  furnizează snapshotul coerent pe care acel PBI îl împachetează.
- Verificările au rulat pe Node cu dublul în memorie, nu pe IndexedDB-ul unui browser real; adaptorul
  real rămâne cel livrat de 127.
- Nu am modificat `Docs/15-salvare-si-import-export.md` (în afara ownership-ului); un pointer către
  secțiunea din Docs/29 și acest PBI ar trebui adăugat la integrare.

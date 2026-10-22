# 133 — Export JSON de profil

Dovezi pentru PBI 133 (modulul Persistență, V1). Contractul implementat este
`133-profile-export-v1`; formatul documentului este
`self-driving-academy-profile-export`, `formatVersion=1`, `schemaVersion=1`.

## Implementare

- `src/persistence/profile-export.ts` — contractul de export: constructorul documentului
  (`buildProfileExport`), calea din repository (`exportProfileFromRepository`), validatorul
  (`validateProfileExport`), cititorul (`readProfileExport`) și helperele de checksum
  (`computeProfileExportChecksum`, `stampProfileExportChecksum`).
- `src/persistence/canonical-json.ts` — canonicalizarea `SDA-CJSON-1`, parserul JSON strict
  (`parseStrictJson`) și SHA-256 (`sha256Hex`, `sha256Bytes`).
- `src/profiles/parameter-registry.ts` — `isReservedParameterKey(key)` și `reservedParameterKeys`
  (cheile R/`extension` ale catalogului 092), exportate din `src/profiles/index.ts`.
- `src/persistence/index.ts` — exportările publice ale modulului.

Formatul documentului are patru secțiuni: `profile` (versiuni cu proveniență, versiunea activă,
activarea și cheile rezervate), `aggregates` (contoare, indicatori, dovezi), `telemetry`
(referințe și, doar la cerere explicită, evenimente brute plafonate) și `checksum`
(`SHA-256` peste forma canonică `SDA-CJSON-1` a documentului fără câmpul `checksum`, conform
[modulului 29](../../../../Docs/29-savefile-si-integritate.md)). Un exemplu real, generat de
scriptul de raport, este în [sample-export.json](sample-export.json), iar transcriptul complet în
[report.json](report.json) și [report.md](report.md).

## Comenzi executate și rezultate reale

Toate comenzile au fost rulate în worktree-ul
`C:\Users\aandr\Sites\self-driving-academy\.worktrees\export-133-01`, pe branch-ul
`loop-pbi/export-133-01`.

| Comandă | Rezultat real |
| --- | --- |
| `npm run typecheck` | fără erori (tsc `--noEmit` pe `src` și pe `tsconfig.tests.json`) |
| `npm run lint` | fără erori (`eslint . --max-warnings 0`) |
| `npm run format:check` | `All matched files use Prettier code style!` |
| `npm run check:architecture` | `Architecture imports: PASS (293 TypeScript files)`, `Architecture negative probes: PASS (6 forbidden dependencies rejected)`, `Inspector exception negative probes: PASS (4 forbidden imports rejected)`, `Rapier adapter negative probes: PASS (3 forbidden imports rejected)`, `Renderer injection, readonly snapshots, defensive persistence and lifecycle: PASS` |
| `npm run check:parameter-catalog` | `Parameter catalog is synchronized.` |
| `node --import ./scripts/register-typescript.mjs --test tests/persistence/profile-export.test.ts` | `tests 27`, `pass 27`, `fail 0` |
| `npm test` (suită completă) | `tests 2041`, `pass 2041`, `fail 0`, `cancelled 0`, exit `0` (două rulări consecutive) |
| `node --import ./scripts/register-typescript.mjs scripts/run-export-profile-report.mjs` | `SUMMARY checks 53/53, contract 133-profile-export-v1, overall PASS`; a scris `report.json`, `sample-export.json`, `report.md` |
| `node --import ./scripts/register-typescript.mjs scripts/run-export-profile-report.mjs --check` | `Export profile report is current` și `Export profile sample is current`, exit `0` |
| `pwsh -NoProfile -ExecutionPolicy Bypass -Command "& './PBI/Validate-Board.ps1'"` | `{"Valid": true, "Total": 235, "Columns": {"To Do": 95, "In Progress": 1, "Done": 139}}` (la începutul lucrării, cu 133 în In Progress) |

Numere reale din transcript (`report.json`): document canonic de **4451** code unități, checksum
`d7597165fa372a82cfbed0b693c331cba3b9bd2def54a29088ad3a34d3bb17e3`, **3** versiuni exportate
(BASE, MANUAL_TUNING, LEARNING), **2** parametri efectivi, **56** chei rezervate, **1** segment de
condus și **1** intervenție manuală ca surse, secvența activării **3**, plafonul de telemetrie
brută **512** evenimente.

Refuzuri verificate cu cod închis (toate din `report.json` → `refusals`): document modificat →
`CHECKSUM_MISMATCH`; cheie rezervată cu valoare → `RESERVED_KEY_SET`; cheie rezervată lipsă →
`RESERVED_KEY_MISSING`; cheie utilizabilă în maparea rezervată → `RESERVED_KEY_INVALID`; cheie
duplicată → `DUPLICATE_KEY`; conținut după document → `TRAILING_CONTENT`; `NaN` → `INVALID_LITERAL`;
versiune de format necunoscută → `UNSUPPORTED_FORMAT_VERSION`; istoric cu o gaură →
`HISTORY_INCOMPLETE`; contor fals → `AGGREGATE_MISMATCH`; parametru în afara catalogului →
`UNKNOWN_PARAMETER`; unitate greșită → `UNIT_MISMATCH`; valoare în afara intervalului →
`VALUE_OUT_OF_RANGE`; telemetrie peste plafon → `TELEMETRY_LIMIT_EXCEEDED`.

Implementarea SHA-256 este proprie (fără `crypto.subtle`, care lipsește în contexte nesigure) și
este verificată împotriva digestului platformei: `b1a11a68f5f9f8bd8659be0b17126c2146284cf4770bc25bbb2a96b11ee4c91b`
pentru ambele implementări, pe același document canonic.

## Ce garantează contractul

- **Telemetria brută nu intră automat.** Documentul implicit are `telemetry.included = false` și
  `rawEventCount = 0`; evenimentele trimise fără cerere explicită sunt lăsate pe loc și raportate
  ca omise (`rawTelemetryOmitted = 1` în transcript). Calea din repository nu poate publica
  telemetrie brută, pentru că repository-ul nu expune niciun cititor de telemetrie.
- **Cheile rezervate rămân rezervate.** Toate cele 56 de chei R (`extension`) sunt publicate cu
  valoarea `null`; constructorul și validatorul refuză orice tentativă de a le da o valoare.
- **Proveniența se păstrează.** Fiecare versiune păstrează părintele, adâncimea, originea, segmentele,
  intervențiile, delta cu schimbările, clasificarea BASE/LEARNING/MANUAL_TUNING și checksum-ul 109,
  pe care cititorul îl recalculează.
- **Roundtrip fără pierderi.** Export → JSON → citire reface aceeași mulțime de valori
  (`speed_delta_urban = 3.5`, `desired_acceleration = 2`), aceeași mulțime de chei rezervate (56) și
  aceeași istorie (3 versiuni, sursele BASE/MANUAL_TUNING/LEARNING).

## Fișiere atinse

- `src/persistence/profile-export.ts` (nou)
- `src/persistence/canonical-json.ts` (nou)
- `src/persistence/index.ts` (exportări publice)
- `src/profiles/parameter-registry.ts` (cheile rezervate R)
- `src/profiles/index.ts` (exportări)
- `tests/persistence/profile-export.test.ts` (nou, 27 de teste)
- `tests/persistence/export-profile-report.ts` (nou, transcriptul determinist)
- `scripts/run-export-profile-report.mjs` (nou)
- `package.json` (scriptul `export:profile`, la finalul blocului `scripts`)
- `Docs/15-salvare-si-import-export.md` (contractul 133, versiunea documentului 0.9)
- `Docs/Evidence/133-export-profile/README.md`, `report.json`, `report.md`, `sample-export.json` (nou)
- `PBI/In Progress/133-export_profile.md` → `PBI/Done/133-export_profile.md` (mutarea fizică)

## Limitări

- Importul propriu-zis nu este implementat: PBI 134 folosește formatul, validatorul și cititorul
  livrate aici. Cititorul reconstruiește valorile și cheile rezervate, dar nu activează nimic.
- Exportul refuză o versiune de profil care conține o cheie din afara catalogului 092
  (`UNKNOWN_PARAMETER`): o asemenea versiune nu poate fi reimportată fără pierderi, deci este
  refuzată explicit în loc de a fi tăcut trunchiată.
- Telemetria brută este plafonată la 512 de evenimente pe document; peste plafon construcția este
  refuzată, nu trunchiată.
- Indicatorii și dovezile din `aggregates` sunt injectate de apelant (de exemplu din snapshoturile
  137/138); exportul nu calculează el însuși indicatori de comportament.
- `npm test` a avut o singură rulare cu un eșec în `tests/workers/protocol.test.ts` („real worker
  yields to cancellation”, buget de 200 ms), un test de timp flosca; cele două rulări complete
  ulterioare au fost verzi (2041/2041) și eșecul nu are legătură cu 133.

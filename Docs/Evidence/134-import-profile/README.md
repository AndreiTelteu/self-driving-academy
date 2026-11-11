# 134 — Import validat și activare de profil

Dovezi pentru PBI 134 (modulul Persistență, V1). Contractele implementate sunt
`134-profile-import-v1` și `134-profile-import-transaction-v1`; documentul consumat este exact cel
livrat de PBI 133: `self-driving-academy-profile-export`, `formatVersion=1`, `schemaVersion=1`,
`units=SI`.

## Implementare

- `src/persistence/profile-import.ts` — contractul de import: `validateProfileImport` (validare
  completă înainte de orice scriere), `importProfileDocument` (import atomic, fără activare) și
  `activateImportedProfile` (activare explicită prin bariera reală 205 și publicarea 110), plus
  vocabularul închis `profileImportRejectionCodes`.
- `src/persistence/profile-import-transaction.ts` — scrierea tuturor versiunilor într-o singură
  tranzacție `profiles` (contract `134-profile-import-transaction-v1`).
- `src/persistence/repository.ts` — `commitProfileImport` și tipurile aferente (modificare aditivă:
  nu exista un port public de tranzacție multi-versiune).
- `src/persistence/index.ts` — exporturile publice, adăugate la finalul listei.
- `tests/persistence/profile-import.test.ts` — 16 teste deterministe.
- `tests/persistence/import-profile-harness.ts` — magazia reală 109, activarea 110, bariera reală
  205 și repository-ul cu dublul în memorie.
- `tests/persistence/import-profile-report.ts` + `scripts/run-import-profile-report.mjs` —
  transcript determinist, verificabil cu `--check`.
- `package.json` — scriptul `import:profile`, ultima intrare din blocul `scripts`.
- `Docs/15-salvare-si-import-export.md` — secțiunea contractului 134.

## Validare înainte de scriere

Documentul este parsat o singură dată și validat integral înainte de orice scriere: buget de mărime
(1 MiB), `format`, versiune de format și de schemă, parsare strictă (chei duplicate, conținut după
document, `NaN`), unități, intervale din catalogul 092, chei necunoscute, chei rezervate R cu
valoare, checksum-ul fiecărei versiuni (109), checksum-ul documentului, proveniență, adâncimea
istoricului, identitatea de import (`profileId`, `engineVersion`, opțional `playerId`).

Un document mai nou decât build-ul este refuzat explicit — `FORMAT_VERSION_TOO_NEW`, respectiv
`SCHEMA_TOO_NEW` — înainte de a se interpreta checksum-ul, deci un layout necunoscut nu este citit
cu regulile de azi. Toate refuzurile sunt coduri închise, cu mesaj și cale.

## Atomicitate

Importul scrie toate versiunile într-o singură tranzacție și nu scrie niciodată activarea
(`activated=false`, `activation=null`). Un fault injectat `beforeCommit` lasă **0 versiuni**,
**0 activări**, iar `progress` și `settings` rămân identice; un retry importă curat 3 versiuni.
Regulile verificate înainte de commit: rând care nu aparține profilului importat
(`REFERENCE_MISSING`), `versionId` duplicat (`INVALID_RECORD`), rând stocat imuabil
(`IMMUTABLE_RECORD`), părinte de versiune derivată absent (`REFERENCE_MISSING`).

## Activarea este un pas separat

`activateImportedProfile` cere ca versiunea să existe deja în magazia 109, să aparțină profilului și
motorului și să corespundă tick-ului gazdă, apoi deschide bariera reală 205 cu motivul `IMPORT` și o
rezolvă la următoarea graniță de tick. Secvența observată: tick 0 → `PENDING`, tick 1 → `ACTIVATED`,
tick 2 → flota aplică `profile-v2`; rezultatul generației vechi → `LATE_RESULT`, iar repetarea →
`ALREADY_ACTIVE`, fără o a doua barieră. Un `TICK_NOT_REACHED` nu scrie nicio activare.

## Verificări

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0 (ambele tsconfig) |
| `npm run lint` | exit 0, `--max-warnings 0` |
| `npm run format:check` | `All matched files use Prettier code style!` |
| `npm run check:architecture` | PASS (305 fișiere TS) |
| `npm run check:parameter-catalog` | `Parameter catalog is synchronized.` |
| test țintă 134 | 16 teste / 16 pass / 0 fail |
| `npm run import:profile` | `SUMMARY checks 53/53, contract 134-profile-import-v1, overall PASS` |
| `npm run import:profile -- --check` | `Import profile report is current` (json și markdown) |
| `npm test` (rularea agentului) | 2104 teste / 2104 pass / 0 fail |
| `npm test` (arborele integrat) | 2195 teste / 2195 pass / 0 fail |
| `Validate-Board.ps1 -RequireDone 134` | `Valid: true`, Done 149 |

## Limitări

- Importul acoperă exclusiv versiunile de profil 109; progresia, economia, misiunile și telemetria
  brută rămân în afara scopului.
- Compunerea barierei 205 în bucla reală de joc și în UI aparține stratului de aplicație.
- `repository.ts` a fost atins aditiv, deoarece nu exista un port public de tranzacție
  multi-versiune.
- Testele folosesc dublul în memorie oficial al persistenței, nu un browser real; același
  `TransactionPort` este exercitat și de adaptorul IndexedDB.
- `report.json` și `report.md` sunt generate de script din șirurile modulului de raport, care au
  păstrat transliterarea ASCII a copilului; `README.md` (acest fișier) a fost rescris cu diacritice
  corecte la integrare, fără să schimbe vreo afirmație.

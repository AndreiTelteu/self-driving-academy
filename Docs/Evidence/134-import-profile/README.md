# 134 - Import validat ?i activare de profil

Dovezi pentru PBI 134 (modulul Persisten?a, V1). Contractele implementate sunt
`134-profile-import-v1` ?i `134-profile-import-transaction-v1`; documentul consumat este exact cel
livrat de PBI 133: `self-driving-academy-profile-export`, `formatVersion=1`, `schemaVersion=1`,
`units=SI`.

## Implementare

- `src/persistence/profile-import.ts` - contractul de import: `validateProfileImport` (validare
  completa �nainte de orice scriere), `importProfileDocument` (import atomic, fara activare) ?i
  `activateImportedProfile` (activare explicita prin bariera reala 205 ?i publicarea 110), plus
  vocabularul �nchis `profileImportRejectionCodes` ?i portul structural al barierei.
- `src/persistence/profile-import-transaction.ts` - `commitProfileImportRows`: toate versiunile
  unui import se scriu �ntr-o singura tranzac?ie `profiles`, cu profil, unicitate, imuabilitate ?i
  lan? de parin?i verificate �nainte de commit.
- `src/persistence/repository.ts` - `commitProfileImport` ?i tipurile `ProfileImportInput` /
  `ProfileImportOutcome`; repository-ul ram�ne proprietarul conexiunii, al lock-ului de scriere ?i
  al grani?ei tranzac?iei.
- `src/persistence/index.ts` - exportarile publice, adaugate la finalul fi?ierului.
- `tests/persistence/import-profile-harness.ts` - lumea determinista: magazia reala 109,
  activarea reala 110, bariera reala 205 ?i repository-ul cu dublul �n memorie.
- `tests/persistence/profile-import.test.ts` - 16 teste deterministe, fara browser.
- `tests/persistence/import-profile-report.ts` ?i `scripts/run-import-profile-report.mjs` -
  transcriptul verificabil cu `--check`.

Nu exista un al doilea parser ?i nu a fost modificat `profile-export.ts`: importul refoloseste
`parseStrictJson`, `canonicalizeJson` ?i `readProfileExport` din 133, deci acelea?i reguli de
canonicalizare `SDA-CJSON-1`, acelea?i unita?i, intervale 092, chei rezervate ?i checksum-uri 109.

## Comenzi executate ?i rezultate reale

Toate comenzile au fost rulate �n worktree-ul
`C:\Users\aandr\Sites\self-driving-academy\.worktrees\import-134-01`, pe branch-ul
`loop-pbi/import-134-01`.

| Comanda | Rezultat real |
| --- | --- |
| `npm run typecheck` | fara erori (tsc `--noEmit` pe `src` ?i pe `tsconfig.tests.json`) |
| `npm run lint` | fara erori (`eslint . --max-warnings 0`) |
| `npm run format:check` | `All matched files use Prettier code style!` |
| `npm run check:architecture` | `Architecture imports: PASS (305 TypeScript files)`, `Architecture negative probes: PASS (6 forbidden dependencies rejected)`, `Inspector exception negative probes: PASS (4 forbidden imports rejected)`, `Rapier adapter negative probes: PASS (3 forbidden imports rejected)`, `Renderer injection, readonly snapshots, defensive persistence and lifecycle: PASS` |
| `npm run check:parameter-catalog` | `Parameter catalog is synchronized.` |
| `node --import ./scripts/register-typescript.mjs --test tests/persistence/profile-import.test.ts` | `tests 16`, `pass 16`, `fail 0` |
| `npm test` (suita completa) | `tests 2104`, `pass 2104`, `fail 0`, `cancelled 0`, exit `0` |
| `node --import ./scripts/register-typescript.mjs scripts/run-import-profile-report.mjs` | `SUMMARY checks 53/53, contract 134-profile-import-v1, overall PASS`; a scris `report.json` ?i `report.md` |
| `node --import ./scripts/register-typescript.mjs scripts/run-import-profile-report.mjs --check` | `Import profile report is current` ?i `Import profile report markdown is current`, exit `0` |

Numere reale din transcript (`report.json`): document canonic de **4491** code unita?i, **3**
versiuni (1 BASE, 2 derivate), **56** chei rezervate cu `null`, import `COMMITTED` cu **3**
r�nduri create ?i **0** preexistente, **0** activari scrise de import. Digestul documentului este
`7902d243e224a18c506c15db3a8a55dffcd7831cf6c7ef83c0d5d05036a3194f`, identic �ntre implementarea
proprie ?i `node:crypto`.

## Validare �nainte de scriere

Ordinea reala a verificarii, fiecare pas cu cod �nchis:

1. marimea textului ?i a formei canonice (1 MiB, `FILE_TOO_LARGE`);
2. `format` (`UNSUPPORTED_FORMAT`), `formatVersion` ?i `schemaVersion` mai noi dec�t build-ul
   (`FORMAT_VERSION_TOO_NEW`, `SCHEMA_TOO_NEW`);
3. parsarea stricta: JSON malformat (`PARSE_ERROR`), chei duplicate (`DUPLICATE_KEY`), con?inut
   dup� document (`TRAILING_CONTENT`);
4. validarea 133 completa: unita?i (`UNIT_MISMATCH`), intervale 092 (`VALUE_OUT_OF_RANGE`), chei
   necunoscute (`UNKNOWN_PARAMETER`), chei rezervate cu valoare (`RESERVED_KEY_SET`), checksum-ul
   fiecarei versiuni 109 (`PROFILE_CHECKSUM_MISMATCH`), checksum-ul documentului
   (`CHECKSUM_MISMATCH`), provenien?a, istoricul complet ?i ad�ncimea;
5. identitatea de import: profil (`IMPORT_PROFILE_MISMATCH`), motor (`ENGINE_INCOMPATIBLE`),
   jucator (`IMPORT_PLAYER_MISMATCH`) ?i bugetul de istoric (`HISTORY_TOO_DEEP`).

Toate refuzurile de mai sus sunt prezente �n `report.json` ? `refusals` ?i sunt acoperite de teste.
Un refuz nu ajunge niciodata la repository: `fileTooLargeImported` este tot `FILE_TOO_LARGE`, iar
testul care importa un document modificat verifica `getProfile(...) === null`.

## Atomicitate reala

Importul scrie toate versiunile �ntr-o singura tranzac?ie. Testul cu `hooks.beforeCommit` care
arunca o excep?ie dupa toate scrierile demonstreaza pe repository-ul real (dublul �n memorie al
adaptorului IndexedDB) ca:

- rezultatul este `REJECTED` cu `IMPORT_WRITE_FAILED`;
- istoricul profilului are **0** versiuni ?i **nici o** activare;
- r�ndurile de `progress` ?i `settings` scrise �nainte sunt identice byte-for-byte;
- aceea?i document se importa curat imediat dup�, cu **3** versiuni create.

Testul cu `afterCommit` demonstreaza cazul opus: r�ndurile sunt deja durabile, iar rezultatul
raporteaza explicit `crashAfterCommit=true`, fara a pretinde ca importul a e?uat.

## Import ?i activare sunt separate

`importProfileDocument` nu scrie niciodata pointerul de activare: `activated=false` ?i
`activation=null` chiar daca documentul nume?te `activeVersionId` ?i o secven?a de activare.
Testul de integrare demonstreaza fluxul complet:

| Pas | Rezultat real |
| --- | --- |
| Import | `COMMITTED`, 3 versiuni, `getActivation(...) === null` |
| Bariera 205 �nainte de activare | `pending() === null`, flota r�m�ne pe `profile-v1` |
| Cerere de activare la tick inexistent | `IMPORT_ACTIVATION_STALE_TICK` |
| Cerere la tick 0 | `PENDING`; nu se scrie activare |
| Rezolvare la tick 1 | `ACTIVATED`, secven?a 1, `learningEpoch=2`, `activateAtTick=2` |
| Publicarea 110 la tick 2 | flota aplica `profile-v2` |
| Rezultat din genera?ia veche | `LATE_RESULT`, `accepted=false` |
| Repetarea activarii | `ALREADY_ACTIVE`, fara o a doua bariera |

O versiune care nu a fost importata este refuzata cu `IMPORT_TARGET_NOT_FOUND` ?i nu scrie nimic.
Bariera folosita este cea reala din `src/app/learning-epoch.ts` (contract 205), cu magazia reala
109 ?i controlerul real 110, nu un mock.

## Fi?iere atinse

- `src/persistence/profile-import.ts` (nou)
- `src/persistence/profile-import-transaction.ts` (nou)
- `src/persistence/repository.ts` (`commitProfileImport` ?i tipurile aferente)
- `src/persistence/index.ts` (exportari publice, la final)
- `tests/persistence/import-profile-harness.ts` (nou)
- `tests/persistence/profile-import.test.ts` (nou, 16 teste)
- `tests/persistence/import-profile-report.ts` (nou)
- `scripts/run-import-profile-report.mjs` (nou)
- `package.json` (scriptul `import:profile`, ultimul din blocul `scripts`)
- `Docs/15-salvare-si-import-export.md` (contractul 134)
- `Docs/Evidence/134-import-profile/README.md`, `report.json`, `report.md` (nou)
- `PBI/In Progress/134-import_profile.md` ? `PBI/Done/134-import_profile.md` (mutarea fizica)

## Limitari

- Importul scrie exclusiv versiunile de profil (109). Nu importa progresie, economie, misiuni,
  segmente brute sau telemetrie ?i nu atinge `progress`/`settings`; acestea r�m�n sub contractele
  lor.
- Activarea cere gazdei sa furnizeze bariera 205 ?i un tick fix; compunerea �n bucla reala de joc ?i
  �n UI apar?ine PBI-urilor 205/110 ?i stratului de aplica?ie, nu acestui modul.
- `src/persistence/repository.ts` a fost atins, de?i nota de proprietate a PBI-ului nu �l lista:
  nu exista un port public de tranzac?ie pentru un import multi-versiune, iar un import care ar
  ocoli repository-ul ar pierde lock-ul de scriere ?i grani?a tranzac?iei. Schimbarea este aditiva
  ?i nu modific? calea existenta `commitProfileActivation`.
- Testele folosesc dublul �n memorie oficial al persisten?ei, nu un browser real; acela?i
  `TransactionPort` este exercitat de adaptorul IndexedDB, dar importul nu are un test de browser
  separat �n acest PBI.
- `playerId` este comparat numai c�nd apelantul �l furnizeaza ?i documentul are o activare; un
  document fara sec?iune de activare poate fi importat, iar activarea ulterioara folose?te
  identitatea gazdei.

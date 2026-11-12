# Dovezi PBI 234 — savefile `.sdasave` cu checksum și încărcare atomică

Status: implementare și validare locală — PASS. Nivel de validare `targeted`, conform
[politicii proporționale](../../validation-policy.md): corectitudine deterministă, buget de bytes,
status/progres/anulare și o probă reală în Chromium. Nu se revendică FPS, heap exact sau calibrare
hardware; `totalHeapBytes` și `twoSessionCheckpointBytes` rămân `null` în manifestul 203.

## Ce s-a implementat

- `src/persistence/savefile.ts` (contract `234-savefile-v1`): envelope-ul
  `self-driving-academy-save` cu `formatVersion`, `integrityVersion`, `schemaVersion`, `createdAt`,
  `payload`, `checksum`; sloturile `sessions.ACADEMY`/`sessions.CHAOS` (documentele 135/215
  neschimbate), `decor.ACADEMY`/`decor.CHAOS` (snapshoturile 227), `optional.replays` (base64
  validat) și bilanțul de mărime; checksum `SDA-CJSON-1`/SHA-256 peste tot envelope-ul fără
  `checksum`; constructorul, cititorul strict, migrarea explicită a arhivei vechi, exportul din
  repository, jobul de progres/anulare și store-ul `preview`/`import`.
- Înlocuirea atomică: un port de lume pregătește generația nouă (inclusiv `restore` 227 pentru decor)
  înainte de scriere, o singură tranzacție peste store-urile 135/215 înlocuiește ambele sesiuni,
  iar fiecare slot este recitit și comparat cu arhiva în aceeași tranzacție. Nu există `settle`,
  `creditMission`, `creditDaily` sau `recordDailyReward` în cale.
- `src/persistence/index.ts`: exporturile publice, adăugate la finalul listei.
- `tests/browser/savefile-234/`: pagina reală care construiește fișierul, îl scrie ca `Blob`/`File`,
  îl descarcă, reverifică SHA-256 cu WebCrypto și îl importă; runner-ul `--browser` salvează fișierul
  pe disc și îl recitește.
- `scripts/run-savefile-report.mjs` + `npm run save:file` (ultima intrare din `package.json`), cu
  `--check` și `--browser`.
- [Docs/29-savefile-si-integritate.md](../../29-savefile-si-integritate.md): secțiunea
  „Contract implementat V1 (PBI 234) — savefile `.sdasave` cu checksum și încărcare atomică”.

## Fișierul produs și checksum-urile reale

Fixture-ul folosește două sesiuni reale (Academie și Haos) în baze separate, fiecare cu checkpoint
206 real, rânduri 130, bundle 215 (daily + ledger 209 + XP 213) și decor 227 real (un con rupt prin
calea de impact reală). Fișierul produs:

| Măsură | Valoare |
| --- | --- |
| Nume | `self-driving-academy-20261022T090000000Z.sdasave` |
| Code units canonici | 174 732 |
| Bytes UTF-8 pe disc | 174 757 |
| SHA-256 al fișierului de pe disc | `8cc72504a71976d14b33384718b2f242fc4cb512bafe824fdfe16642893108bb` |
| Checksum-ul documentului | `f0f5b9d26e4ff78ead11fbf98dd191b738c7060350ed40e7b171ebc98cb4f106` |
| Checksum WebCrypto în Chromium | identic cu cel al documentului |
| Slot `ACADEMY` / `CHAOS` | 80 874 B / 80 858 B |
| Decor `ACADEMY` / `CHAOS` | 6 146 B / 6 144 B |
| Replay-uri | 1 intrare, 7 B decodați |
| Payload / plafon payload | 174 113 B / 12 154 200 B |
| Fișier / plafon fișier | 174 732 / 12 285 272 code units |
| Sesiuni / XP total | 2 / 201 (100,5 + 100,5) |

Plafonul de fișier este sub `persistenceIngressBytes` (16 777 216 B) din manifestul 203 și sub
fereastra de replay (134 217 728 B). `twoSessionCheckpointBytes` este `null` în manifest, deci
raportul măsoară fișierul, nu pretinde o capacitate calibrată.

## Ce s-a executat în browser (Chromium 156)

`npm run save:file -- --browser` a rulat în Chromium 156.0.8078.4 headless (Playwright 1.55 cu
executabilul Chromium 1248 al mașinii) și a produs `browser.json` + `saved-file.sdasave`:

- pagina a construit documentul din fixture-ul real, a calculat din nou checksum-ul cu
  `crypto.subtle.digest` peste forma canonică și a obținut `f0f5b9d2…c98cb4f106`;
- a scris textul într-un `Blob`, l-a citit înapoi ca `Blob` și ca `File` (ambele identice cu textul),
  apoi a declanșat o descărcare reală; runner-ul a salvat fișierul pe disc;
- a citit fișierul cu `readSaveFile` (`ACCEPTED`, 2 sesiuni, 35 obiecte de decor) și a înlocuit o
  țintă proaspătă prin store (`COMMITTED`, `PAUSED_AUTO`, 100,5 XP, 0 recompense acordate);
- runner-ul a recitit de pe disc exact aceleași bytes (SHA-256 al fișierului de mai sus), le-a trimis
  înapoi în pagină, iar `readSaveFile` + `preview` + `import` au răspuns `ACCEPTED`/`COMMITTED`, cu
  2 sesiuni și 35 de obiecte de decor;
- zero erori de consolă.

Ce nu dovedește proba: scrierea pe disc nu este confirmată de pagina însăși (browserul nu oferă asta),
ci de runner care a salvat descărcarea; IndexedDB-ul este dublul determinist în memorie, nu baza
persistentă a unui profil real; nu s-a măsurat FPS, heap sau timp de encode pe hardware.

## Comenzi executate și rezultat real

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0 (proiect + `tsconfig.tests.json`) |
| `npm run lint` | exit 0 (`eslint . --max-warnings 0`) |
| `npm run format:check` | „All matched files use Prettier code style!” |
| `npm run check:architecture` | PASS, 364 fișiere TypeScript + probele negative |
| `npm run check:parameter-catalog` | „Parameter catalog is synchronized.” |
| `node --import ./scripts/register-typescript.mjs --test "tests/persistence/savefile.test.ts" "tests/persistence/savefile-report.test.ts"` | 26/26 teste PASS |
| `npm test` | 2 799 teste, 2 799 pass, 0 fail, 97 943,98 ms |
| `npm run save:file` | 84/84 verificări PASS, 6 scenarii; `report.json` + `report.md` scrise |
| `npm run save:file -- --check` | „Savefile report is current” + markdown curent |
| `npm run save:file -- --browser` | BROWSER PASS, fișier 174 757 B, SHA-256 de mai sus, 2 sesiuni, 100,5 XP |

## Ce acoperă testele deterministe (23 de cazuri)

Round-trip cu ambele sesiuni și decor; vectori `SDA-CJSON-1` (Unicode, `-0`, ordine array, sortare
UTF-16, numere finite); whitespace și ordinea cheilor acceptate; XP modificat fără checksum nou;
chei duplicate; fișier trunchiat, cu conținut după document și peste plafon; checksum lipsă,
algoritm/canonicalizare/integritate necunoscute; checksum verificat înaintea schemei (schemă nouă +
checksum stricat → `CHECKSUM_MISMATCH`; schemă nouă + checksum corect → `SCHEMA_TOO_NEW`); schemă
invalidă re-stampată; replay invalid/peste plafon; contor nesigur și număr invalid; decor din altă
sesiune; două sloturi cu același `sessionId`; slot activ absent; fișier gol; arhivă veche refuzată și
migrată explicit (inclusiv slot interior v1); export din repository; preview obligatoriu și stale;
import atomic al ambelor sesiuni; al doilea import cu delta 0; fișier corupt/anulat lasă ținta byte cu
byte identică; quota plină (`STORAGE_FULL`) anulează înlocuirea; decor modificat și re-stampat refuzat
de staging-ul 227; al doilea tab; bilanț de mărime greșit.

## Fișiere atinse

- Create: `src/persistence/savefile.ts`, `tests/persistence/savefile-fixture.ts`,
  `tests/persistence/savefile.test.ts`, `tests/persistence/savefile-report.ts`,
  `tests/persistence/savefile-report.test.ts`, `scripts/run-savefile-report.mjs`,
  `tests/browser/savefile-234/index.html`, `tests/browser/savefile-234/main.ts`,
  `Docs/Evidence/234-savefile/README.md`, `report.json`, `report.md`, `browser.json`,
  `saved-file.sdasave`.
- Modificate: `src/persistence/index.ts` (doar exporturi la final),
  `Docs/29-savefile-si-integritate.md` (secțiune nouă), `package.json` (`save:file`, ultima intrare),
  `PBI/In Progress/234-savefile_checksum.md` → `PBI/Done/234-savefile_checksum.md`.

## Limitări

- Nu există un panou UI montat: PBI-ul livrează store-ul, sumarul de confirmare și proiecția de
  status (`saveFileView`), nu butoanele din meniul de pauză. Montarea în shell rămâne stratului de
  compunere, ca la 126/210/233. Verificarea vizuală este `NOT_APPLICABLE_NO_UI_COMPONENT`.
- Decorul este verificat structural de cititorul de fișier și complet de `restore` 227 în portul de
  lume; fără un port de lume, un decor modificat și re-stampat ar trece de cititor și ar fi refuzat
  abia la restaurare. Compoziția trebuie să furnizeze portul pentru atomicitatea completă.
- Repository-ul din teste și din pagină este dublul 127 în memorie; tranzacțiile și rollback-ul sunt
  reale, dar nu s-a scris în IndexedDB-ul persistent al unui profil de browser.
- Proba din browser este headless, fără GPU: dovedește fișierul, WebCrypto, `File`/`Blob` și
  înlocuirea, nu performanța de encode/hash pe hardware. Transcriptul determinist nu măsoară timp de
  perete; costul este raportat în bytes deținuți.
- `twoSessionCheckpointBytes` rămâne `null` în manifest și `totalHeapBytes` este indisponibil; nu au
  fost inventate valori. Replay-urile sunt opționale și plafonate, nu comprimate.

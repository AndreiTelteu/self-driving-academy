# Dovezi PBI 216 — regresii V1 pentru moduri, KPI-uri, daily și XP

Regresia execută împreună contractele livrate 205–217 înainte de suita/release-ul V1. Rezultatul este
o matrice de 29 de rânduri cu scenariu, comandă, numere reale și verdict: **27 PASS, 0 FAIL, 2
NOT_RUN** (playtestul în browser și frame p95, ambele declarate cu motiv). Nivelul de validare este
`targeted`, conform [politicii de validare](../../validation-policy.md).

Transcript determinist: [report.json](report.json) și [report.md](report.md). Costul real al căii de
tick, separat de transcript: [cost.json](cost.json) și [cost.md](cost.md).

## Ce s-a implementat

- `tests/qa/modes-propagation.ts` — cele trei moduri pe taxi și civil (șase tranziții fiecare),
  fizica păstrată, cinci defecte injectate, propagarea taxi/civil 208 și bariera 205 (pozitiv și
  negativ).
- `tests/qa/economy-daily-xp.ts` — KPI 214 în ambele direcții, aceleași fapte în trei moduri, grafice
  210 pe 12 luni, pop-up-ul 210, daily 211/212 (pozitiv și negativ) și XP 213, inclusiv amprentele
  „fără pierderi”.
- `tests/qa/persistence-replay.ts` — checkpoint 206 (captură, commit, reluare, 60 de tick-uri identice
  cu oracolul) și replay 207/141 (fereastră completă, checksum, seek/redare fără scrieri).
- `tests/qa/combined-probe.ts` — proba combinată a modulului 25: learning + recorder + autosave + KPI
  + XP în aceeași sesiune de 1 900 de tick-uri, cu efectul asupra condusului măsurat separat de cost.
- `tests/qa/dependencies.ts` — graful real al boardului: gate 235 pentru extensiile 225–234, fără
  dependențe inverse și fără cicluri.
- `tests/qa/v1-regression-report.ts`, `tests/qa/v1-regression-support.ts`,
  `tests/qa/v1-regression.test.ts` — ansamblul, vocabularul și testele care apără matricea.
- `scripts/run-v1-regression-report.mjs` — raportul determinist cu `--check` și costul cu `--cost`.
- `package.json` — intrarea `qa:v1-regression`, ultima din blocul `"scripts"`.

Nu s-a modificat `src/`: regresia compune contractele existente, nu creează sisteme paralele.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`, fără erori) |
| `npm run lint` | PASS (`eslint . --max-warnings 0`, 0 erori, 0 warning-uri) |
| `npm run format:check` | PASS („All matched files use Prettier code style!”) |
| `npm run check:architecture` | PASS (349 fișiere TypeScript, toate probele negative trec) |
| `npm run check:parameter-catalog` | PASS („Parameter catalog is synchronized.”) |
| `node --import ./scripts/register-typescript.mjs --test "tests/qa/v1-regression.test.ts"` | 7 teste, 7 trecute, 0 eșuate (4,4 s) |
| `npm run qa:v1-regression` | 29 rânduri: 27 PASS, 0 FAIL, 2 NOT_RUN; XP losses 0; cycles 0 |
| `npm run qa:v1-regression -- --check` | „V1 regression report is current” + „markdown is current” |
| `npm run qa:v1-regression -- --cost --samples 5` | cost real scris în `cost.json`/`cost.md` |
| `npm test` (suita completă) | 2548 teste, 2548 trecute, 0 eșuate, 0 sărite, 84 377 ms |

Suita completă a rulat pe arborele final, după ce toate fișierele au fost formatate.

## Numere reale din matrice

### Moduri, propagare, barieră (criteriul 1)

- 217: 12 rânduri de tranziție (6 taxi + 6 civil), 0 eșecuri, `maxPlayerSeats: 1`, eroare de pas
  pozițional `0`; cele cinci defecte injectate sunt refuzate cu
  `PHYSICS_POSITION_STEP`, `PHYSICS_SPEED`, `MULTIPLE_PLAYER_SEATS`, `MISSING_CLOSED_SEGMENT` și
  `WRONG_CLOSED_SEGMENT`.
- 208: 7 faze, 71 de verificări, o singură versiune aplicată în fiecare lume (`segment-208-fleet~112`
  pentru taxiuri și civili), 0 suprascrieri ascunse, segmentul MANUAL civil `SKIPPED_MANUAL` cu 0
  versiuni și 0 activări.
- 205: restore cu un job în coadă → job anulat, rezultat târziu `LATE_RESULT`, epoch 1 → 2, versiunile
  din store neschimbate (3 → 3); import invalid → `IMPORT_INVALID`, 0 generații noi.

### KPI, daily, XP, checkpoint, replay (criteriul 2)

- 214: venit +500 / rating −3, venit −500 / rating +3, ambele −800 și −4 cu 1 incident real;
  ratingurile acelorași fapte în MANUAL/LEARNING/AUTO sunt identice (4/4/4).
- 210: 12 luni, 11 cu date, 1 fără date, 1 parțială, 310 zile exacte → 52 de puncte vizuale (sub
  plafonul implicit de 60), venit 31 960 unități minore, 284 review-uri, medie ponderată 2,552817;
  plafonul de 20 de puncte păstrează cele 310 zile exacte.
- Pop-up 210: panou închis → `SKIPPED_CLOSED`, 0 citiri; deschidere → 1 citire, 1 randare; în MANUAL
  suspendă simularea și o reia la închidere.
- 211/212: exact 3 misiuni, 300 XP promise; obiectivul MANUAL completat cu 2 curse (progres 2/2),
  recompensă 100 XP pe obiectivul încheiat; o a treia cursă este numărată, nu plătită; eveniment
  străin `FOREIGN_SESSION`, cursă AUTO pe obiectiv MANUAL numărată ca nepotrivire de mod; ziua
  următoare aduce 3 obiective și păstrează recompensele.
- 213: misiune 100 XP, duplicat 0, replay 116 0, daily 100 XP, duplicat 0; 160 s active = 2,666666 XP
  (ferestre de 30 s plus una de 10 s = 166 666 micro-XP), sold 202,666666, nivel 2; ferestrele în
  pauză și în background sunt excluse; un credit negativ este refuzat.
- 206: snapshot la tick 60, 70 vehicule, 64 378 bytes, checksum
  `c5a0738c0be1b8a149726738b9b9cccad5655229c542396b04d8aa9d24d8bcb5`, reluare `PAUSED_AUTO`, 60 de
  tick-uri identice cu oracolul; captură în interiorul tick-ului `TICK_NOT_BOUNDARY`, snapshot editat
  `CHECKSUM_MISMATCH`.
- 207/141: chunk 129 377 bytes, 60 eșantioane, `COMPLETE`, 1 eveniment, checksum reproductibil, rând
  modificat `CHECKSUM_MISMATCH`; seek la tick 399, 41 cadre redate, `liveWrites: 0`, cele 5 fapte
  imuabile acoperite, soldul XP neschimbat; sesiune străină `IDENTITY/FOREIGN_SOURCE`.

### Proba combinată (criteriul 4)

O singură sesiune de 1 900 de tick-uri cu 70 de vehicule:

- recorder: 4 909 260 bytes în vârf din plafonul de 33 554 432; fereastra incidentului 632 652 bytes,
  `COMPLETE`, 1 eveniment;
- autosave 131: 4 capturi, 4 commit-uri, 4 commit-uri de progres, 0 tick-uri nesalvate, 64 900 bytes
  pentru checkpoint și 9 804 bytes pentru progres;
- KPI 209: 3 settle-uri și 3 review-uri reale din cele 3 curse terminale ale fixture-ului;
- XP 213: 200,5 XP (100 misiune + 100 daily + 0,5 pentru 30 s de condus activ);
- condus 115: conformitate 78,571428 % înainte de learning → **100 %** după versiunea publicată de
  112, iar cu recorder + autosave + KPI + XP atașate rezultatul rămâne **identic** (`systemsUnchanged:
  true`). Efectul learning este deci +21,428571 puncte procentuale, separat de costul sistemelor.

### Costuri noi și bugete (criteriul 3)

| Metrică | Real | Buget | Sursă | Verdict |
| --- | ---: | ---: | --- | --- |
| recorder peak charged bytes | 4 909 260 | 33 554 432 | manifest `recorderRamBytes` | PASS |
| recorder sealed chunk bytes | 632 652 | 134 217 728 | manifest `optionalReplayStorageBytes` | PASS |
| autosave checkpoint bytes | 64 900 | 1 048 576 | 131 `maxCheckpointBytes` | PASS |
| autosave progress body bytes | 9 804 | 262 144 | 131 `maxProgressBodyBytes` | PASS |
| economy bundle bytes | 14 483 | 1 048 576 | 215 `maxDocumentBytes` | PASS |
| preparing / committing checkpoints | 0 / 0 | 1 / 1 | manifest | PASS |

Bundle-ul 215 are `daily` 4 919 B, `economy` 7 341 B, `player` 1 745 B. Costul real al căii de tick
(5 eșantioane × 600 tick-uri, Node, fără renderer) este 45,262/46,828/77,587 ms doar condus față de
103,442/109,953/110,886 ms cu sistemele atașate, adică 0,078 → 0,183 ms/tick. Nu este o probă de cadru.

Lacune declarate, fără prag inventat: frame p95 (nu există renderer în suită), punctele graficului
KPI (manifestul nu are buget; limita de componentă este 60/90), bundle-ul 215 (fără buget dedicat;
limita aplicabilă este rândul de 1 MiB) și costul per tick (doar cu ceas de perete, raportat separat).

### XP fără pierderi (criteriul 5)

Soldul 200,5 XP, nivelul 2 și cele 3 intrări rămân identice după toate cele cinci căi: KPI în scădere
(cursă 209 eșuată reală), incident (settle + review cu notă mică), misiune 116 eșuată (125 refuză
settle-ul), recompensă daily refuzată (duplicat) și zi ratată (`FORWARD_JUMP`). Amprenta stării
economice este `85df901a8cacee6620dfdc7eb2c3f8e48ee5f135e27516d4a607b2643112e3cc` înainte și după;
`debits: 0`, niciun credit negativ, iar contorul de duplicat crește fără să atingă soldul.

Graful boardului are 235 noduri și 235 muchii, **0 cicluri**, 0 id-uri duplicate și 0 id-uri externe.
Gate-ul 235 acoperă toate extensiile 225–234 prin închiderea tranzitivă, iar niciuna dintre ele nu
depinde de 235. Dependențele proprii ale 216 (215, 141, 108, 208, 217, 205) sunt toate în Done.

## Cum se verifică

1. `npm run qa:v1-regression` regenerează transcriptul; `npm run qa:v1-regression -- --check` îl
   compară exact (JSON și Markdown).
2. `node --import ./scripts/register-typescript.mjs --test "tests/qa/v1-regression.test.ts"` apără
   matricea: zero rânduri FAIL, cele două NOT_RUN au motiv, XP losses 0, bugetele măsurate PASS,
   graful fără cicluri.
3. `npm run qa:v1-regression -- --cost --samples 5` regenerează costul real al căii de tick.

## Limitări

- Nivel `targeted`: fără browser, GPU, input uman sau hardware de referință. Playtestul și frame p95
  rămân `NOT_RUN`; ce rămâne de verificat este listat în raport (lizibilitate HUD, senzația de condus,
  input/focus, frame-ul pe hardware).
- Condusul din proba combinată este comportamentul simulat 115 (oportunități declarate), nu fizica
  Babylon/Rapier live.
- Costurile de memorie sunt contoare de ownership (recorder, checkpoint, bundle), nu RAM totală a
  paginii; costul per tick este o măsurătoare Node, nu un cadru.
- Review-urile din proba combinată folosesc durata reală a cursei din fixture și un read model 139
  real pentru cursele finalizate; calibrarea completă a confortului rămâne a dovezilor 209/214.
- Nu s-a modificat `src/`; nu a fost găsit niciun defect real de business care să necesite o
  raportare separată.

## Fișiere atinse

- `tests/qa/v1-regression-support.ts` (nou)
- `tests/qa/modes-propagation.ts` (nou)
- `tests/qa/economy-daily-xp.ts` (nou)
- `tests/qa/persistence-replay.ts` (nou)
- `tests/qa/combined-probe.ts` (nou)
- `tests/qa/dependencies.ts` (nou)
- `tests/qa/v1-regression-report.ts` (nou)
- `tests/qa/v1-regression.test.ts` (nou)
- `scripts/run-v1-regression-report.mjs` (nou)
- `package.json` (intrarea `qa:v1-regression`, ultima din `"scripts"`)
- `Docs/18-validare-si-release.md` (secțiune nouă la final)
- `Docs/Evidence/216-v1-regression/` (acest README, `report.json`, `report.md`, `cost.json`, `cost.md`)
- `PBI/To Do` → `PBI/Done` (fișierul 216)

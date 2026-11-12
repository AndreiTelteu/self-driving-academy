# Dovezi PBI 235 — regresii și playtest pentru distracție și revenire

Gate-ul de experiență rulează **o singură comandă** (`npm run qa:fun`), reexecută toate probele de care
depinde PBI-ul și agregă rezultatul în șase verdicte de criteriu. Mecanismul dovedit și ipoteza de
retenție sunt ținute separat: nu există playtest uman, deci toate motivele de rejucare au
`retention: NOT_RUN`, fără procent și fără rată de revenire.
**Rezultatul acestei revizii: 4 criterii `PASS`, 1 `FAIL`, 1 `NOT_RUN`; 16 sonde, 15 `PASS`, 1 `FAIL`.**

Rapoartele generate: [report.json](report.json) și [report.md](report.md). Numerele reale ale fiecărei
sonde: [probes.json](probes.json). Verificarea scurtă de browser: [browser.json](browser.json) și
[browser-1280x720.png](browser-1280x720.png).

## Ce s-a implementat

- `tests/qa/fun-experience-report.ts` — contractul agregat: `collectFunExperienceProbes()` reexecută
  216, 151, 152, 225, 226, 227, 228, 229, 230, 233, 234, 212, 084, 083 și citește dovezile comise ale
  224 și 153; `buildFunExperienceReport()` derivă cele șase criterii, cele cinci motive de rejucare,
  lista „ce nu s-a măsurat” și blocul de playtest; `verifyFunExperienceReport()` respinge retenția
  inventată, playtestul pretins și release-ul închis cu criterii deschise; `funExperienceReportMarkdown()`
  scrie raportul citibil.
- `tests/qa/fun-experience.test.ts` — 10 teste deterministe: transcriptul comis se reconstruiește byte
  cu byte, fiecare sondă are numere reale, criteriile au verdict, mecanismul e `TESTED` și retenția
  `NOT_RUN`, iar un procent de retenție, un playtest pretins, un release `PASS` cu rânduri nevalidate,
  un eșec ascuns sau o sondă lipsă sunt refuzate.
- `scripts/run-fun-qa-report.mjs` — `npm run qa:fun` scrie `probes.json`, `report.json` și `report.md`;
  `--check` regenerează și compară byte cu byte; `--strict` transformă un criteriu `FAIL` în exit 1;
  `--browser` construiește bundle-ul de producție, îl servește local și păstrează captura Chromium
  1280×720 (sau scrie explicit `NOT_INSTALLED`).
- `package.json` — intrarea `qa:fun`, ultima din blocul `"scripts"`.
- `Docs/26`, `Docs/27`, `Docs/28`, `Docs/29`, `Docs/18` — secțiune nouă la finalul fiecăruia.

`src/`, `Docs/performance-budgets.json`, `vite.config.*`, `scripts/ci/`, `tests/browser/` și `tests/e2e/`
nu au fost modificate. Alte PBI-uri din board nu au fost atinse.

## Matricea de criterii

| ID | Criteriu | Verdict | Dovada reală |
| --- | --- | --- | --- |
| C1 | Scenarii combinate Academie/Haos, learning/slidere, R/reset, distrugere, provocări/daily, savefile, fără contaminarea progresului | PASS | 225: 20 tranziții (10/10), 20 checkpointuri, 0 lumi/joburi orfane, 1 copie de profil; 226: `RECOVERED` în 0 tick-uri, 20 reseturi, 0 eșuate, corpuri 64, XP 500 000 micro-XP neschimbat; 227: 3 zone, 35 obiecte, aceeași amprentă MANUAL/LEARNING/AUTO; 228: replay 3/3; 233: 55/55; 234: 84/84, 2 sesiuni; 152: 104/104, XP 200,5 → 200,5; 216: 29 rânduri, 0 FAIL |
| C2 | XP/nivel nu scad; duplicate, joburi stale, schimbarea zilei și importul nu dublează creditele | PASS | 216: pierderi 0, debitări 0, amprentă `85df901a…3112e3cc` identică; 226: `xpDecreased=false`, profil stabil, recompense neschimbate; 233: duplicat `FAMILY_REWARDED_TODAY` cu 0 XP, rollback de calendar `SKIPPED`; 212: 5 refuzuri, 1 recompensă reținută; 230: stale respins fără scriere; 234: al doilea import 0 XP |
| C3 | HUD/cameră first-person și slidere confortabile în două clase și accesibile la 1280×720; feedback destructibil vizual/audio | **FAIL** | 229: 53/53, camera `FIRST_PERSON`, sedan + compact, layout 1280 încape/derulează, contrast minim 11,13:1; 230: 70/70; 084: 42/42; 083: 53/53; 228: 6 profiluri, 24 reacții/incident, 4 voci. 153: 300/308, **5 eșecuri de contract** — D4 camera 11,52 px, D5/D7 KPI 11 px, D6/D8 patru etichete tăiate |
| C4 | Benchmarkul 224 include toate sistemele noi și 20 de cicluri reset/sesiune, cu măsurători, plafoane și limitări reale | PASS | 224: 17 rânduri, 16 PASS, 0 FAIL, 1 `NOT_VALIDATED`; rândurile `destruction-effects-audio`, `challenge-director`, `savefile-integrity`, `academy-chaos-cycles`, `soak-60min`, `gameplay-systems-max-v1` prezente; 60,001 min / 20 cicluri `SOAK_PASS`; manifest `203-initial-1` nemodificat; `perf:gate --check` exit 0 |
| C5 | Playtest cu minimum cinci participanți; cine reîncearcă spontan și de ce | **NOT_RUN** | 0/5 participanți. Fluxurile sunt acoperite mecanic, dar nu au fost jucate de oameni; nu se inventează motive |
| C6 | Eșecurile/limitările sunt explicite; fără return rate fără sesiuni măsurate | PASS | 8 findings de la 153 listate cu captură; toate cele cinci motive au `retention: NOT_RUN`; 8 limitări declarate în „Ce nu s-a măsurat” |

## Motive de rejucare: mecanism dovedit vs. retenție nemăsurată

| Motiv | Mecanism | Dovada | Retenție |
| --- | --- | --- | --- |
| `HAOS_DESTRUCTION` | TESTED | 225: 20 tranziții fără lumi orfane; 227: 35 obiecte, 3 zone, 20 cicluri cu 1 checksum; 228: 6 profiluri, 24 reacții/incident, 4 voci | NOT_RUN |
| `CHALLENGES` | TESTED | 233: 55/55, 2 credite XP, 3 șabloane exprimabile în daily, 0 listeners globali | NOT_RUN |
| `DAILY` | TESTED | 233: 3 șabloane/zi în 3 familii, determinist pe dată; 212: 26/26, 5 refuzuri | NOT_RUN |
| `RECORDS` | TESTED | 233: 4 rânduri; 300 → 120 tick-uri îmbunătățește recordul, o rulare mai lentă sau egală nu îl scade | NOT_RUN |
| `QUICK_RESTART` | TESTED | 233: `RESTARTED` la încercarea 2, același șablon, identitate nouă, 0 XP; provocare neeșuată refuzată cu `NOT_FAILED` | NOT_RUN |

Ipotezele (distrugerea oferă o sesiune scurtă, provocarea e un punct de intrare, daily-ul readuce a
doua zi, recordul determină reluarea, reluarea reduce abandonul) sunt marcate explicit ca neverificate
și fiecare spune ce ar fi nevoie pentru a fi măsurată. Raportul nu conține niciun procent.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run qa:fun` | exit 0, 26,3 s; scrie `probes.json`, `report.json`, `report.md`; 6 criterii (4 PASS, 1 FAIL, 1 NOT_RUN), 16 sonde (15 PASS, 1 FAIL) |
| `npm run qa:fun -- --check` | exit 0; „Fun QA probes/report/markdown is current” |
| `npm run qa:fun -- --browser` | exit 0; `CAPTURED browser 1280×720`, 20 149 B, sha256 `5cf065a8ca06…` |
| `node --import ./scripts/register-typescript.mjs --test tests/qa/fun-experience.test.ts` | exit 0, 10/10 teste, 959,8 ms |
| `npm test` | exit 0, **2 898 teste, 2 898 trecute, 0 eșuate**, 100 689 ms |
| `npm run typecheck` | exit 0 (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0, 0 erori, 0 warning-uri, 34,1 s |
| `npm run format:check` | exit 0, „All matched files use Prettier code style!”, 31,7 s |
| `npm run check:architecture` | exit 0, 365 fișiere TypeScript, probe negative 6 + 4 + 3 respinse |
| `npm run check:parameter-catalog` | exit 0, „Parameter catalog is synchronized.” |
| `npm run perf:gate -- --check` | exit 0, 15,1 s, „Gate report is current” + „Gate markdown is current”; structural PASS, release `NOT_VALIDATED` |

Probele reexecutate în `qa:fun`, cu numerele lor: 216 27/29 (2 `NOT_RUN` declarate), 151 12/12
executate, 152 104/104, 224 16/17 (1 `NOT_VALIDATED`), 225 45/45, 226 65/65, 227 24/24, 228 20/20,
233 55/55, 234 84/84, 229 53/53, 230 70/70, 212 26/26, 084 42/42, 083 53/53, 153 300/308.

## Verificarea de browser

`npm run qa:fun -- --browser` a construit bundle-ul de producție, l-a servit pe un port local și l-a
randat în Chrome 156 headless la 1280×720. Captura păstrată are 20 149 B și sha256
`5cf065a8ca06a4006e19e4099a286a7b12a63b7fd3798a1c071fe5bcb377a934`; se vede poarta de start cu linia
„Bootstrap pregatit · Babylon.js · WEBGL2”, deci `src/main.ts` pornește și creează contextul WebGL2 pe
această revizie. Poarta nu a fost apăsată: inputul, focusul, HUD-ul în joc, senzația de condus și FPS-ul
nu sunt dovedite de această captură.

## Ce nu s-a măsurat

- Playtest uman cu minimum cinci participanți (condus liber, prima schimbare de stil, distrugere,
  reluarea unei provocări) — `NOT_RUN`, 0/5.
- Cine reîncearcă spontan și de ce — `NOT_RUN`; nu există observație de sesiune.
- Return rate / retenție la 24 de ore și 7 zile — `NOT_RUN`; niciun procent nu este raportat.
- FPS, frame p95/p99 și lucrul GPU pe hardware real, ambele backenduri — `NOT_VALIDATED` în gate-ul 224
  (release `NOT_VALIDATED`, 1 criteriu deschis).
- Memoria exactă a paginii și a GPU — `totalHeapBytes` este `null`; probele raportează contoare de
  ownership.
- Latența audio reală și plăcerea sunetului — 228 dovedește planul de reacție și plafoanele, nu mixerul
  pe hardware.
- Confortul subiectiv al camerei (motion sickness) — fără jucător uman.
- Textul din 153 nu a fost recapturat: worktree-ul nu are Playwright, deci findings-urile D4–D8 sunt
  citite din dovezile comise de 153.

## Limitări

- Nivelul declarat de PBI este `soak`, dar playtestul și retenția nu pot fi executate de un agent; ele
  rămân `NOT_RUN` și nu sunt înlocuite cu scenarii deterministe.
- C3 este `FAIL` din cauza unor defecte reale de text din `src/ui` (găsite de 153). PBI 235 nu are voie
  să modifice `src/`, deci le raportează cu captură; repararea lor este un PBI de UI separat.
- Criteriul 1 al gate-ului 224 (FPS pe hardware real) rămâne deschis; `qa:fun` nu îl poate închide.
- Costul per tick, heap-ul total și latența audio pe hardware nu sunt măsurate de acest raport.
- `qa:fun` reexecută probele în același proces; dacă un raport de probă se schimbă, `--check` iese cu
  exit 1 până când dovezile sunt regenerate deliberat.

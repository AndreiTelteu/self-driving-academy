# Dovezi PBI 152 — test integral de sesiune și progres

Testul parcurge **o singură sesiune** cap-coadă pe contractele livrate: profil nou → AUTO → MANUAL →
cursă reală → schimbare de vehicul la mijlocul cursei → LEARNING → activare taxi și civil → KPI →
daily → XP → export → restart → comparație. Rezultatul este un transcript determinist de **11 pași și
104 verificări, 11 PASS, 0 FAIL**, plus o probă reală în Chromium.

Transcript: [report.json](report.json) și [report.md](report.md). Proba de browser:
[browser.json](browser.json) și [browser-session.png](browser-session.png).

## Ce s-a implementat

- `tests/e2e/session-world.ts` — o singură lume de sesiune compusă din contractele reale: 115 (109 +
  110 + 058 + 112), 033 planner, 059 demand, 060 dispatcher, 061 lifecycle, 066/067/068 pentru scaun,
  taste și schimbarea vehiculului, plus un owner 005 care păstrează un singur segment OPEN și un
  istoric append-only de segmente închise.
- `tests/e2e/session-e2e.ts` — cele unsprezece etape, verificările cu toleranțe declarate, probele de
  restart și de schimbare a vehiculului, plus `compareArtifacts` folosit și de pagina de browser.
- `tests/e2e/session-support.ts` — vocabularul `EXACT`/`ABSOLUTE`/`RELATIVE`, verdictul derivat și
  amprentele canonice SHA-256.
- `tests/e2e/e2e-session.test.ts` — șase teste: cele patru moduri într-o rulare, toleranțele,
  restartul, schimbarea vehiculului, determinismul și transcriptul comis.
- `scripts/run-e2e-session-report.mjs` — raportul determinist cu `--check` și proba `--browser`.
- `tests/browser/session-e2e/` — pagina reală: rulează sesiunea în Chromium, scrie documentele în
  IndexedDB, iar reîncărcarea paginii este restartul.
- `package.json` — intrarea `e2e:session`, ultima din blocul `"scripts"`.

`src/` nu a fost modificat. Nu au fost atinse `tests/qa/`, `tests/scenarios/`, `src/world/`, `Docs/04`
sau `Docs/26`.

## Cum se parcurge sesiunea, în ordine

| Pas | Ce se întâmplă | Contract |
| --- | --- | --- |
| S0 | profil nou: o versiune de bază, 30 taxiuri + 40 civile, toate pe aceeași versiune | 109 + 057 |
| S1 | AUTO: simularea rulează fără scaun de jucător și fără segment | 024 + 066 |
| S2 | dispeceratul alocă o cursă, FSM-ul o deschide în `TO_PICKUP` | 059 + 060 + 061 |
| S3 | tasta M ia MANUAL pe taxiul cursei și deschide segmentul 005 | 067 + 066 + 005 |
| S4 | pickup complet: cursa ajunge în `TO_DROPOFF`, cu 3 tranziții | 061 |
| S5 | camera trece pe alt taxi: segmentul se închide `VEHICLE_SWITCH`, cursa rămâne activă | 068 + 005 + 061 |
| S6 | dropoff: cursa se închide, taxiul este eliberat o singură dată | 061 + 060 |
| S7 | LEARNING pe al doilea taxi, pipeline-ul 112 compune și activează versiunea pe taxiuri și civile | 100–103 + 109 + 110 + 112 |
| S8 | KPI 209, daily 211/212 și XP 213 primesc faptele reale ale cursei și ale zilei | 209 + 211 + 212 + 213 |
| S9 | export 133 pentru profil și 215 pentru daily/economie/XP | 133 + 215 |
| S10 | restart: textele sunt re-citite și amprentele sunt comparate | 133 + 215 + 212 |

## Numerele reale

- Moduri: `AUTO → MANUAL → LEARNING → AUTO`; cursa:
  `TO_PICKUP → PICKUP → TO_DROPOFF → DROPOFF → COMPLETED`; tick final 23.
- Flotă: 30 taxiuri și 40 civile, toate pe `segment-152-learning~112` după activare; 0 suprascrieri
  ascunse.
- XP: **200,5** (100 misiune + 100 daily + 0,5 timp activ), nivel **2**, **3** intrări; dublurile
  daily și de misiune sunt refuzate (`DUPLICATE`).
- Daily: **3** misiuni pentru `2026-11-11`, **1** recompensă, **100 XP** promis.
- KPI: **551** unități minore, **1** settlement, **1** recenzie, nota **5**.
- Export: profil **5 851** unități canonice, bundle economie **13 362**; checksum-urile versiunilor
  109: `fnv1a64:04272752f8b03537` și `fnv1a64:b62f09a0c88905e8`.
- Restart: XP `200,5/2/3` înainte și după; daily `1/3`; KPI `551` și `1` recenzie; flotă
  `segment-152-learning~112`. Amprente: XP `876d4783…42f1bd`, daily `71c2de1c…483a24`, KPI
  `08715908…954f33`, flotă `df96f5a9…8d4320`.
- Schimbare de vehicul: segmentul `segment-152-1` se închide la tick 15, după ce a început la 12, cu
  `VEHICLE_SWITCH`; starea cursei rămâne `TO_DROPOFF`; tranzițiile rămân 3; cursa activă rămâne 1;
  assignment-ul 060 și amprenta călătoriei sunt identice; istoricul păstrează 2 segmente.
- Reproductibilitate: două rulări independente produc același transcript; amprenta SHA-256 a pașilor
  este `8f8664e167f462703814d40c49539b5f254a933060630d0ac0b0b1aae1e2ae1d`.

## Proba în browser

`npm run e2e:session -- --browser` a rulat în **Chromium 156.0.8078.4**, viewport 1440×900, pe un
context nou cu stocare goală (profil nou). Pagina a parcurs aceleași **104 verificări**, a scris cele
două documente în IndexedDB, a fost reîncărcată, iar după reload a re-citit documentele și a comparat
starea: **8/8 comparații PASS**, **0 erori de pagină**, XP `200,5`, nivel `2`, daily `1/3`, KPI `551`,
flotă `segment-152-learning~112`. Dovada vizuală este [browser-session.png](browser-session.png).

Fără Playwright, comanda afișează explicit `SKIP` și nu pretinde că browserul a rulat.

## Comenzi executate și rezultat

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS (exit 0, fără erori) |
| `npm run lint` | PASS (exit 0, 0 erori, 0 warning-uri) |
| `npm run format:check` | PASS („All matched files use Prettier code style!”) |
| `npm run check:architecture` | PASS (356 fișiere TypeScript, probe negative 6+4+3, lifecycle) |
| `npm run check:parameter-catalog` | PASS („Parameter catalog is synchronized.”) |
| `npm test` | 2 647 teste, 2 647 trecute, 0 eșuate, 0 sărite, 86 903 ms |
| `node --import ./scripts/register-typescript.mjs --test "tests/e2e/e2e-session.test.ts"` | 6 teste, 6 trecute, 0 eșuate |
| `npm run e2e:session` | 11 pași, 104 verificări, 11 PASS, 0 FAIL, overall PASS |
| `npm run e2e:session -- --check` | „E2E session report is current” + „E2E session markdown is current” |
| `npm run e2e:session -- --browser` | Chromium 156, 104 verificări, 8/8 comparații de restart, 0 erori de pagină |

Suita completă a rulat pe arborele final, după formatare.

## Fișiere atinse

- `tests/e2e/session-support.ts` (nou)
- `tests/e2e/session-world.ts` (nou)
- `tests/e2e/session-e2e.ts` (nou)
- `tests/e2e/e2e-session.test.ts` (nou)
- `scripts/run-e2e-session-report.mjs` (nou)
- `tests/browser/session-e2e/index.html`, `tests/browser/session-e2e/main.ts` (nou; pagina existentă
  `tests/browser/index.html` este doar o fixture aritmetică, fără gameplay)
- `package.json` (intrarea `e2e:session`, ultima din `"scripts"`)
- `Docs/18-validare-si-release.md` (secțiune nouă la final)
- `Docs/Evidence/152-e2e-session/` (acest README, `report.json`, `report.md`, `browser.json`,
  `browser-session.png`)
- `PBI/In Progress` → `PBI/Done` (fișierul 152)

## Limitări

- Nivel determinist în Node: fără GPU, renderer Babylon, input uman sau FPS. Fizica nativă este un
  dublu contorizat (același folosit de testele 068); proba de browser este separată și nu măsoară
  frame-ul.
- Segmentele 005 din sesiune au boundary real (start, end, motiv), dar fără eșantioane de telemetrie;
  harness-ul nu inventează samples și nu pretinde un recorder live.
- Recenzia 209 folosește o observație de confort construită cu modelul real 137/138 din fixture-ul
  economiei, nu o înregistrare live a pasagerului.
- Misiunea de campanie creditată este settlement-ul real 116/125 al fixture-ului, nu o misiune jucată
  în harta din sesiune; daily 211/212 sunt reale pentru ziua aleasă.
- Exportul 133 nu publică telemetrie brută, iar bundle-ul 215 nu conține starea lumii (206); profilul
  flotei este dovedit prin versiunea activă și histogramele ei, nu printr-un snapshot de lume.
- Playtestul vizual, senzația de condus și frame-ul pe hardware rămân ale gate-urilor
  153/220/224/235.

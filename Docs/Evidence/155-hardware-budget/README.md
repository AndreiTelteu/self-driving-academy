# PBI 155 — verificarea hardware-ului și bugetelor fixate

Verificarea finală a bugetelor fixate în 203, pe cea mai apropiată probă integrată existentă, cu
costul fiecărui sistem nou raportat separat peste baseline. Bugetele din
[`Docs/performance-budgets.json`](../../performance-budgets.json) sunt **citite** la rulare și nu au
fost modificate; raportul derivat este [report.json](report.json) / [report.md](report.md).

**Rezultat: 85 PASS, 0 FAIL, 6 NOT_MEASURED declarate, 17 rânduri structurale de suprasarcină.**
Gate-ul hardware al jocului complet rămâne `NOT_VALIDATED`: pagina de joc completă nu există încă, iar
lipsurile sunt declarate mai jos, nu umplute cu valori deduse.

## Ce s-a implementat

- `tests/harness/hardware-budget.ts` — contract pur (fără DOM, fără ceas): citește manifestul 203,
  grupează rulările pe configurație, calculează percentile nearest-rank, compară fiecare repetare cu
  bugetul citat și produce rândurile, abaterile, lista `NOT_MEASURED`, costurile per sistem și
  renderul Markdown. `verifyHardwareBudgetReport` refuză un PASS fără măsurătoare, un buget care nu
  citează manifestul și o abatere care nu apare în listă.
- `tests/harness/hardware-systems-cost.ts` — proba de cost pe contractele reale: baseline de conducere
  cu 70 de vehicule (fixture 206) plus **un singur** sistem per braț, la cadența documentată —
  learning 103→112, recorder 207/222, KPI 209/214, XP 213, provocări 231–233, distrugere 227/228.
  Diferența pereche (braț − baseline) este costul sistemului; ordinea brațelor alternează între
  eșantioane, iar primul eșantion este warmup.
- `tests/harness/hardware-budget.test.ts` — 12 teste deterministe care apără contractul: citarea
  bugetelor, regula de percentile, verdictul PASS/FAIL, direcția minimă pentru cadență, `NOT_MEASURED`
  cu motiv, separarea suprasarcinii, refuzul unei configurații fără cele cinci repetări, costurile
  pereche, baseline-ul păstrat ca FAIL și verificatorul de raport.
- `scripts/run-hardware-budget-report.mjs` — raportul determinist (`--check` compară fișierele comise;
  `--measure` reface cele două măsurători locale: bytes-ii build-ului de producție și costul pe
  sisteme).
- `package.json` — intrarea `perf:hardware-budget`, ultima din blocul `"scripts"`.
- `Docs/25-performanta-contracte-si-benchmark.md` — secțiune nouă la final (fără modificarea
  bugetelor).

Nu s-a modificat `src/` și nu s-a atins `Docs/performance-budgets.json`.

## Configurația exactă măsurată

| Câmp | Valoare |
| --- | --- |
| Hardware | Lenovo 82YM (Yoga 7 14ARP8), AMD Ryzen 7 7735U (8C/16T), Radeon 680M integrat, 16 GiB, Windows 11 Home 26300 |
| Browser | Chrome 155.0.8059.85 |
| Backend | WEBGPU și WEBGL2, sesiuni separate |
| Preset | `LOW_FIXED_220_FLEET`, adaptive quality off |
| Rezoluții | 1920×1080 CSS și intern, DPR 1 |
| Alimentare | AC, schema High performance |
| Protocol | 5 repetări × (30 s warmup + 120 s măsurare), build de producție, inspector închis, fereastră în prim-plan |
| Coloană de bugete | `laptop` (identificată prin CIM); coloana `desktop` nu se împrumută |
| Workload-uri | 20/20, 24/40, 30/40 (maxim V1) și 30/80 (suprasarcină, separat) |
| Build măsurat de browser | commit `2d68b43c8cdf`, 5 repetări per configurație |

**Diferența față de „jocul complet”.** Intrarea de producție `src/main.ts` compune bootstrap-ul de
randare (scenă goală + recuperare), nu o cursă integrală. Proba folosită este gate-ul 220: populația
reală 057, cerere/dispecer 059/060, decizii 058, context 044, semafoare 036, scheduler 219, controller
024, fizică 022/028 și pipeline-ul real de learning 103→112, cu toate vehiculele în lumea fizică. Ce
**nu** conține: HUD/panourile finale, asseturile finale ale orașului, recorderul, KPI, XP, provocările
și distrugerea în aceeași buclă — exact acestea sunt măsurate separat ca **cost peste baseline** în
secțiunea următoare, nu ca parte din frame-ul 220.

## Verdict per metrică (coloana `laptop`, bugete citate din manifest)

| Metrică | Rezultat (p95, 5 repetări) | Buget | Verdict |
| --- | --- | ---: | --- |
| Interval de cadru p95 | 16,8–16,9 ms | 35 ms | PASS |
| Interval de cadru p99 | 16,8–17,0 ms | 50 ms | PASS |
| Cadență derivată (1000/p50) | 59,88 fps | ≥ 30 fps | PASS |
| Lucru main-thread p95 | 3,3–6,5 ms (7,8 ms doar la suprasarcină) | 20 ms | PASS |
| Tick autoritar p95 | 3,0–5,8 ms | 8 ms | PASS |
| Pas Rapier p95 | 0,3–0,5 ms | 5 ms | PASS |
| Lucru GPU p95 | `null` pe WEBGPU; 0,49–1,18 ms pe WEBGL2 | 28 ms | NOT_MEASURED / PASS |
| Input → comandă p95 | 1,6–2,6 ms | 80 ms | PASS |
| Închidere segment → activare learning p95 | 17,3–19,1 ms | 2000 ms | PASS |
| Timp simulat / timp real activ | 1,0001 | ≥ 0,98 | PASS |
| Long Task maxim de aplicație | 0 ms | 50 ms | PASS |
| Vehicule fizice păstrate / cleanup | 70/70, zero resurse deținute | structural | PASS |
| Heap JS al paginii | 37,0–69,7 MiB | fără buget în manifest (`totalHeapBytes: null`) | REPORTED |
| Vârf recorder (ownership) | 1 395 200 B = 1,33 MiB | 32 MiB | PASS |
| JS+WASM critice transferate | 5,84 MiB (3 478 182 B JS + 2 646 596 B WASM) | 8 MiB | PASS |
| Memoria exactă pagină/GPU | — | fără API portabil | NOT_MEASURED |
| Pornire la prima comandă acceptată, cold p95 | — | 12000 ms | NOT_MEASURED |

Suprasarcina 30/80 (110 corpuri fizice) este raportată separat: frame p95 16,8–16,9 ms, tick p95
6,4–7,0 ms (WEBGPU) / 5,2–6,0 ms (WEBGL2), input 2,9–3,8 ms, toate marcate `STRUCTURAL` — nu
închide gate-ul normal și nu este folosită ca dovadă V1. Tabelele complete, pe fiecare configurație și
metrică, sunt în [report.md](report.md); distribuțiile per rulare (p50/p95/p99, histogramă, cadre peste
35 ms, contoare de cleanup) sunt în [report.json](report.json).

## Costul fiecărui sistem peste baseline

Măsurat pe 12 noiembrie 2026, 5 eșantioane × 600 tick-uri, baseline real de conducere cu 70 de
vehicule (0,081 ms/tick). Δ este diferența pereche braț − baseline, în p95; `% tick` raportează la
bugetul `authoritativeTickP95Ms` de 8 ms, `% main` la `mainThreadP95Ms` de 20 ms.

| Sistem | Cadență reală | Δ ms/tick | Δ ms/simulat | Δ ms/invocare | % tick | % main | Contoare reale |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| learning | o închidere de segment la 5 s simulate | 0,135 | 8,09 | 40,42 | 1,69 % | 0,68 % | 2 segmente, 2 activări |
| recorder | un apel pe tick, decimare internă la 20 Hz | 0,204 | 12,24 | 0,204 | 2,55 % | 1,02 % | 200 mostre, 1,33 MiB |
| KPI (209/214) | settle + review la 1 s, snapshot la 10 Hz | 0,024 | 1,43 | 0,119 | 0,30 % | 0,12 % | 10 settle-uri, 10 review-uri |
| XP (213) | fereastră de 30 s + citire la 10 Hz | 0,025 | 1,49 | 0,146 | 0,31 % | 0,13 % | 2 ferestre, 2 intrări |
| provocări (231–233) | advance per tick + o încercare completă | 0,076 | 4,57 | 0,076 | 0,95 % | 0,38 % | 1 încercare creditată |
| distrugere (227/228) | advance per tick + un impact la 50 de tick-uri | 0,058 | 3,50 | 0,057 | 0,73 % | 0,29 % | 12 impacturi, 7 obiecte sparte din 35 |

Însumate: **0,522 ms/tick = 6,53 % din bugetul de tick** și 2,6 % din bugetul de main-thread. Fiecare
sistem rămâne sub 2,55 %. Toate deltele sunt peste zgomotul de măsurare (p95 > 0 față de baseline);
valoarea per invocare este media pe invocările eșantionului, nu un cost unic garantat. Costul de
construcție a fiecărui sistem (store, recorder, director) este în afara ceasului, pentru că se plătește
o dată la pornire, nu pe tick.

## Baseline înainte de optimizări

Documentat explicit ca stare de dinainte, păstrat fără reclasificare:

| Câmp | Valoare |
| --- | --- |
| Captură | `20261022T005309189Z` (Docs/Evidence/220-fleet-gate/hardware) |
| Data | 2026-10-22T01:06:04Z |
| Build | commit `2d68b43c8cdf`, build de producție pe arborele de dinainte de corecțiile 220 (sourceHash diferit de capturile acceptate) |
| Condiții | același laptop (Ryzen 7 7735U / Radeon 680M), preset LOW fix, 1920×1080 CSS/intern, DPR 1, 5 × (30 s + 120 s), WEBGPU |
| Metrică | tick autoritar p95, workload 30/40 |
| Înainte | min 6,6 ms, mediană 7,6 ms, medie 8,1 ms, **max 10,4 ms** |
| Buget | 8 ms |
| Verdict | **FAIL** (10,4 > 8) |
| După aceleași corecții | 4,8–5,8 ms (p95) pe aceeași configurație, PASS |

Corecțiile reale dintre cele două stări sunt cele documentate de 220 (priming înainte de warmup,
context 044 publicat la cadența de 10 Hz fazată, cache de rutare mărginit); 155 nu a optimizat nimic și
nu a schimbat bugetul ca să treacă.

## Ce nu a putut fi măsurat și de ce

| Metrică | Motiv | Măsurat în schimb |
| --- | --- | --- |
| Lucru GPU pe WEBGPU | Babylon nu raportează timer query pe acest backend | `null`, nu 0; pe WEBGL2 timerul există (0,49–1,18 ms) |
| Memoria exactă a paginii și a GPU | nu există API portabil pentru memoria exactă | `performance.memory.usedJSHeapSize` 37,0–69,7 MiB + contoare de ownership (recorder 1,33 MiB), fără însumarea categoriilor suprapuse |
| Pornire la prima comandă acceptată, cold | nu există pagina de joc completă; bootstrap-ul nu are „prima comandă” | bytes-ii reali ai build-ului de producție (5,84 MiB din 8 MiB) și captura 218/203 pentru startup-ul de backend |
| Frame pe jocul complet | `src/main.ts` nu compune o cursă | frame-ul probei integrate 220, cu diferența declarată mai sus |
| Coloana `desktop` | alt hardware | doar coloana `laptop`, identificată prin CIM |
| Rețea cold 25 Mbit/s / RTT 40 ms | serverul local nu este throttled | protocolul rămâne țintă, nu rezultat |
| Soak 60 min și 20 cicluri lifecycle | rămâne gate-ul 224 | — |

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | PASS (0 erori, 0 warning-uri) |
| `npm run format:check` | PASS („All matched files use Prettier code style!”) |
| `npm run check:architecture` | PASS (probele negative incluse) |
| `npm run check:parameter-catalog` | PASS („Parameter catalog is synchronized.”) |
| `node --import ./scripts/register-typescript.mjs --test "tests/harness/hardware-budget.test.ts"` | 12 teste, 12 trecute, 0 eșuate |
| `npm run perf:hardware-budget -- --measure` | build 130 artefacte: 3 478 182 B JS, 2 646 596 B WASM, 43 917 B CSS, gzip 1 769 191 B; cost 5 × 600 tick-uri, baseline median 48,635 ms/600 tick-uri |
| `npm run perf:hardware-budget` | 8 configurații, 109 rânduri; 85 PASS, 0 FAIL, 6 NOT_MEASURED, 17 STRUCTURAL, 1 REPORTED |
| `npm run perf:hardware-budget -- --check` | „report is current” + „markdown is current” |
| `npm test` (suita completă) | 2792 teste, 2792 trecute, 0 eșuate, 0 sărite, 96 117 ms |

## Fișiere atinse

- `tests/harness/hardware-budget.ts` (nou)
- `tests/harness/hardware-budget.test.ts` (nou)
- `tests/harness/hardware-systems-cost.ts` (nou)
- `scripts/run-hardware-budget-report.mjs` (nou)
- `package.json` (intrarea `perf:hardware-budget`, ultima din `"scripts"`)
- `Docs/25-performanta-contracte-si-benchmark.md` (secțiune nouă la final)
- `Docs/Evidence/155-hardware-budget/` (acest README, `report.json`, `report.md`, `systems-cost.json`, `build-transfer.json`, `.gitattributes`)
- `PBI/To Do` → `PBI/Done` (fișierul 155)

## Limitări

- Proba de frame este gate-ul 220, nu jocul complet: HUD-ul, asseturile finale și sistemele noi nu
  rulează în același cadru. Costul lor este măsurat separat pe tick, nu adăugat la frame-ul 220.
- Costurile pe sisteme sunt măsurători Node cu ceas de perete, pe același laptop, fără renderer: descriu
  costul sincron al căii de tick, nu un cadru și nu un p95 de hardware.
- Capturile de browser sunt din 22 octombrie 2026, pe commit `2d68b43c8cdf`; build-ul curent diferă.
  Măsurătorile proprii ale 155 (costuri, bytes de build) sunt din 12 noiembrie 2026. Diferența este
  declarată, nu prezentată ca aceeași revizie.
- Măsurătoarea de cost rulează pe o mașină partajată cu alte lucrări; ordinea brațelor alternează și
  primul eșantion este warmup, dar nu există monitorizare termică continuă.
- Suprasarcina 30/80 rămâne structurală: nu dovedește FPS normal și nu este folosită ca verdict V1.
- Gate-ul hardware al jocului complet rămâne `NOT_VALIDATED`; soak-ul și ciclurile lifecycle rămân la
  224, iar integrarea finală la 235.

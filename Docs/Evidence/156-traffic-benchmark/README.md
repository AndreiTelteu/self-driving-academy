# PBI 156 — benchmark flotă și trafic

Matricea de flotă și trafic este **executată rând cu rând** pe contractele reale, cu CPU-ul separat pe
fizică, decizii, UI proiectat și sistemul atașat, cu dovada că taxiurile invizibile rămân simulate și
incluse în expunere. Bugetele sunt citite din [`Docs/performance-budgets.json`](../../performance-budgets.json)
și **nu** au fost modificate. Raportul derivat este [report.json](report.json) / [report.md](report.md);
măsurătoarea brută este [measurement.json](measurement.json).

**Rezultat: 36 PASS, 0 FAIL, 12 STRESS, 60 REPORTED, din 108 rânduri executate.** Gate-ul măsurat este
`MEASURED_GATE_PASS`; gate-ul hardware al jocului complet rămâne `NOT_VALIDATED`, pentru că proba este
headless (fără renderer), iar frame-ul, GPU-ul și paint-ul DOM nu pot fi măsurate aici.

## Ce s-a implementat

- `tests/harness/traffic-benchmark.ts` — contractul și motorul de măsurare:
  - matrice completă 3 taxiuri × 3 densități × 4 sisteme × 3 condiții;
  - execuție reală pe 057 (populație), 058 (trafic civil), 059/060 (cerere+dispecer), 036
    (semafoare), 044 (context rutier), 024 (controller), 022/028 (fizică Rapier + contacte);
  - sisteme atașate reale: pipeline 103→112 (learning), recorder 207 + capture de checkpoint 206/222
    (recorder+autosave), ledger 213 (credite XP);
  - separare CPU: `tick`, `physics` (Rapier), `controller` (realizarea comenzilor), `decisions`
    (context 044 + trafic 058 + dispecer + cache de rutare), `ui` (proiecții pure 073/075), `system`;
  - dovada taxiurilor invizibile: fereastră de observare de ±80 m, contoare de decizii pe taxiurile
    din afara ei, corpuri în mișcare și expunerea din contractul real 137;
  - verdict din manifest, etichetare `STRESS` pentru `30/80` și `REPORTED` pentru densitățile din
    afara workload-urilor declarate, `NOT_MEASURED` cu motiv pentru GPU/frame/memorie exactă;
  - `verifyTrafficBenchmarkReport` refuză un PASS fără măsurătoare, o matrice incompletă, un rând fără
    dovada taxiurilor invizibile și un buget care nu citește manifestul.
- `tests/harness/traffic-benchmark.test.ts` — 12 teste deterministe pentru matrice, clasificare,
  separarea componentelor, verdict, suprasarcină etichetată, `NOT_MEASURED`, capacități, expunere,
  dovada de invizibilitate și renderul Markdown. Folosesc fixture-uri sintetice ca intrare pentru
  contractul de verdict; ele nu sunt dovezi de măsurare.
- `scripts/run-traffic-benchmark-report.mjs` — raport determinist: `--measure` reexecută matricea,
  rularea implicită derivează `report.json` + `report.md`, `--check` compară artefactele comise.
- `package.json` — intrarea `perf:traffic-benchmark`, ultima din blocul `"scripts"`.
- `Docs/25-performanta-contracte-si-benchmark.md` — secțiune nouă la final, fără modificarea bugetelor.

**Refolosit din 155:** `parseBudgetManifest`, `summarize`/`percentile` (nearest-rank), `budgetSource`
și regula de verdict care refuză un PASS fără măsurătoare. **Adăugat:** matricea pe patru axe,
execuția headless a flotei reale, separarea pe componente, dovada taxiurilor invizibile și
clasificarea `GATE`/`STRESS`/`REPORTED`. Nu s-a modificat `src/` și nu s-a atins
`Docs/performance-budgets.json`.

## Configurația măsurată

| Câmp | Valoare |
| --- | --- |
| Hardware | AMD Ryzen 7 7735U with Radeon Graphics, 16 fire logice, 14 GiB RAM vizibilă (laptopul identificat în 203/220) |
| Runtime | Node 24.19.0, Windows, **headless, fără renderer** |
| Protocol | 30 tick-uri warmup + 180 tick-uri măsurate, 2 repetări; cold: 1 repetare, 0 warmup, 120 tick-uri |
| Cadențe | decizii 6 tick-uri (10 Hz fazat), UI 6 tick-uri, autosave 90 tick-uri, learning 300 tick-uri, XP 300 tick-uri |
| Fereastră de observare | ±80 m față de poziția taxiului 0 (camera de playtest); restul flotei este „invizibil” pentru cameră |
| Coloană de bugete | `laptop` (manifestul `203-initial-1`) |
| Seed | 156 001 + repetarea |
| Măsurat | 2026-11-12T05:29:26.936Z |

## Matricea și verdictul

| Axă | Valori |
| --- | --- |
| Taxiuri | 20 / 24 / 30 |
| Civili | 20 / 40 / 80 (peste 40 = surplus fizic declarat, ca în 220) |
| Sistem atașat | BASELINE / LEARNING / RECORDER_AUTOSAVE / XP |
| Condiție | NORMAL / AGGRESSIVE (contacte) / COLD_FIRST_USE |

Total: **108 rânduri**. Workload-urile declarate în manifest (20/20, 24/40, 30/40) × 4 sisteme × 3
condiții = **36 rânduri de gate**: toate PASS. `30/80` = **12 rânduri `STRESS`**, raportate separat.
Restul de 60 de combinații de densitate sunt **`REPORTED`**: măsurate și comparate informativ, dar nu
sunt dovezi de gate.

### CPU separat (p95, rândurile de gate, ms)

| Componentă | Interval | Buget aplicabil |
| --- | ---: | --- |
| Tick autoritar complet | 2,81–7,09 (p99 4,01–12,43) | ≤ 8 ms |
| Fizică Rapier | 0,09–0,26 | ≤ 5 ms |
| Realizarea comenzilor (024) | 0,33–0,81 | — |
| Decizii (044 + 058 + 059/060 + cache rutare) | 2,06–5,37 | — |
| UI proiectat (073/075, fără DOM) | 0,06–0,25 | — |
| Sistem atașat | 0–0,26 | — |
| GPU | `NOT_MEASURED` | ≤ 28 ms (fără timer) |

Deciziile domină tick-ul: publicarea contextului 044 la 10 Hz, pasul traficului civil 058, dispecerul
și căutarea de rutare cache-uită. Sistemul atașat costă cel mai mult la recorder (0,100–0,258 ms/tick),
apoi XP (0,027–0,119) și learning (0,023–0,043); baseline-ul nu are sistem atașat (0).

### Sistem atașat, cold și contacte

| Metrică | Rezultat (rândurile de gate) | Buget |
| --- | --- | ---: |
| Închidere segment → activare learning p95 | 227,9–681,7 ms | ≤ 2 000 ms |
| Vârf de bytes reținuți de recorder | 156 160–407 040 B (2 capturi de checkpoint/rulare) | ≤ 33 554 432 B |
| Prima comandă acceptată, cold | 351,3–550,7 ms | ≤ 12 000 ms |
| Contacte în condiția agresivă | toate cele 36 de rânduri au ≥ 4 contacte, 2+ evenimente de coliziune | structural |

Suprasarcina `30/80` (110 corpuri fizice, tick p95 5,29–8,38 ms) este etichetată `STRESS` și nu
închide gate-ul normal. Două dintre cele 12 rânduri de suprasarcină depășesc bugetul de 8 ms
(8,375 ms și 8,273 ms) și sunt raportate ca atare, nu ascunse sau reclasificate ca PASS.

## Taxiurile invizibile și expunerea

| Taxiuri | Invizibile | Decizii invizibile (gate) | Corpuri în mișcare | Expunere |
| ---: | ---: | ---: | ---: | ---: |
| 20 | 18/20 | 360–1 080 | 20/20 | 80–240 vehicul-secunde |
| 24 | 22/24 | 440–1 320 | 24/24 | 128–384 vehicul-secunde |
| 30 | 28/30 | 560–1 680 | 30/30 | 140–420 vehicul-secunde |

Expunerea este citită din contractul real 137: `fleetVehicleSeconds = fleet.vehicles × simulatedSeconds`,
cu numitorul pe toată flota 057 (`registry.counts()`), nu pe selecția camerei. Fiecare taxi invizibil
primește decizii la cadența de 10 Hz fazată și își mișcă corpul în lumea Rapier; recorder-ul primește
`inCamera: false` pentru ele, dar le înregistrează. Nicio probă nu exclude un taxi pentru că nu este în
cameră.

## Baseline înainte de optimizări

PBI 156 **nu optimizează** nimic: matricea de mai sus este baseline-ul de referință pentru optimizările
ulterioare (157/158). Referința istorică de dinainte de corecțiile 220 rămâne cea documentată de 155
(captura `20261022T005309189Z`, tick p95 6,6–10,4 ms la 30/40), nu se reclasifică și nu se amestecă cu
măsurătoarea headless de aici.

## Ce nu a putut fi măsurat

| Metrică | Motiv | Măsurat în schimb |
| --- | --- | --- |
| Interval de cadru / FPS | probă headless, fără renderer și cadru de prezentare | tick-ul autoritar complet |
| Lucru GPU p95 | fără renderer nu există timer GPU; valoarea rămâne `null`, nu 0 | costul CPU al fizicii, deciziilor, UI și sistemului |
| Main-thread total | include randarea CPU și paint-ul DOM, absente în Node | tick-ul complet, comparat cu bugetul de tick |
| UI layout/paint | Node nu are DOM | proiecțiile pure 073/075 la cadența HUD |
| Memoria exactă pagină/GPU | fără API portabil | bytes reținuți de recorder și bytes de checkpoint |
| Pornirea jocului complet, cold | pagina completă nu există încă | world build + populare + prima comandă a fixture-ului integrat |
| Timp simulat / timp real activ (pacing) | proba rulează cât mai repede, nu la 60 Hz real | tick-ul complet și durata măsurată; rata simulat/timp CPU rămâne diagnostic |
| Coloana `desktop` | alt hardware | doar coloana `laptop`, identificată în 203/220 |

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0 (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0 (0 erori, 0 warning-uri) |
| `npm run format:check` | exit 0 („All matched files use Prettier code style!”) |
| `npm run check:architecture` | exit 0 („Architecture imports: PASS (364 TypeScript files)”, probe negative 6+4+3) |
| `npm run check:parameter-catalog` | exit 0 („Parameter catalog is synchronized.”) |
| `node --import ./scripts/register-typescript.mjs --test "tests/harness/traffic-benchmark.test.ts"` | 12 teste, 12 trecute, 0 eșuate |
| `npm run perf:traffic-benchmark -- --measure` | 108 rânduri, 180 rulări; matrice completă scrisă în `measurement.json` |
| `npm run perf:traffic-benchmark` | 36 PASS, 0 FAIL, 12 STRESS, 60 REPORTED; gate `MEASURED_GATE_PASS` |
| `npm run perf:traffic-benchmark -- --check` | „report is current” + „markdown is current” |
| `npm test` | 2 830 teste, 2 830 trecute, 0 eșuate, 0 sărite, 91 376 ms |

## Fișiere atinse

- `tests/harness/traffic-benchmark.ts` (nou)
- `tests/harness/traffic-benchmark.test.ts` (nou)
- `scripts/run-traffic-benchmark-report.mjs` (nou)
- `package.json` (intrarea `perf:traffic-benchmark`, ultima din `"scripts"`)
- `Docs/25-performanta-contracte-si-benchmark.md` (secțiune nouă la final)
- `Docs/Evidence/156-traffic-benchmark/` (acest README, `measurement.json`, `report.json`, `report.md`, `.gitattributes`)
- `PBI/To Do` → `PBI/Done` (fișierul 156)

## Limitări

- Proba este **headless**: nu măsoară randarea, frame-ul, GPU-ul sau paint-ul DOM. Verdictul de gate
  acoperă numai tick-ul, fizica, deciziile, UI-ul proiectat, sistemele atașate și expunerea.
- UI-ul măsurat este proiecția pură 073 (HUD) + 075 (panou de flotă) la 10 Hz, nu layout-ul browserului.
- `handle`-ul Rapier nu este întotdeauna un întreg sigur (observat `5e-324` la al doilea corp), deci
  checkpoint-ul folosește un slot 1-based stabil, cu `entityId` păstrat; costul capturii rămâne real.
- Harta 032 se întinde dincolo de placa de sol a probei Rapier (1000×1000 m); s-a adăugat o placă de
  sol declarată peste extensia hărții, fără a schimba gravitația, solverul, CCD sau dt.
- Latența learning end-to-end include cedarea către microtask-uri a fixture-ului (30 tick-uri), nu
  latenta reală a cozii de producție; ea rămâne sub bugetul de 2 000 ms.
- Condiția agresivă folosește o pereche declarată care frânează/accelerează pe aceeași bandă, plus
  bariere și moloz; contactele sunt reale, dar nu sunt o politică de joc 045/050/051/052.
- Densitatea 80 are 40 de civili autoritari (057) + 40 de corpuri fizice surplus, marcate în raport;
  capacitatea de admitere a fizicii este respectată.
- Mașina este partajată cu alte lucrări; nu există monitorizare termică continuă. Măsurătoarea este
  păstrată ca atare, fără reclasificare.
- Cele 60 de rânduri `REPORTED` sunt combinații de densitate în afara workload-urilor declarate în
  manifest; ele nu înlocuiesc gate-ul și nu sunt folosite ca dovadă V1.

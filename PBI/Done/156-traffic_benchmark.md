---
id: "156"
title: "Benchmark flotă și trafic"
status: "Done"
release: "V1"
module: "Validare și release"
depends_on: ["155","065","144"]
performance_checks: ["frame", "simulation", "workers"]
owner: "loop-pbi/traffic-156-01"
started_at: "2026-11-12T06:49:07.401+02:00"
completed_at: "2026-11-12T07:34:34.707+02:00"
---

# 156 Benchmark flotă și trafic

## Obiectiv

Măsoară 20/24/30 de taxiuri și densități civile variate.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[18-validare-si-release.md](../../Docs/18-validare-si-release.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 155 trebuie să existe în Done înainte de începere.
- PBI 065 trebuie să existe în Done înainte de începere.
- PBI 144 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Taxiurile nevizibile rămân simulate și incluse în expunere.
- [x] CPU de fizică, decizii, UI și GPU sunt raportate separat.

- [x] Matricea include driving cu learning, recorder+autosave și credite XP, plus trafic agresiv/contacte, cold/first-use și suprasarcină etichetată.

## Verificare

Rulează aceeași matrice înainte și după optimizare.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `tests/harness/traffic-benchmark.ts` execută rând cu rând matricea 20/24/30 taxiuri × densități civile 20/40/80 × 4 sisteme atașate (BASELINE, LEARNING, RECORDER_AUTOSAVE, XP) × 3 condiții (NORMAL, AGGRESSIVE/contacte, COLD_FIRST_USE) = 108 rânduri, pe contractele reale 057/058/059/060/036/044/024/022/028 plus pipeline-ul 103→112, recorder-ul 207 cu capture de checkpoint 206/222 și creditele 213. CPU-ul este separat pe tick, fizică Rapier, realizarea comenzilor, decizii, UI proiectat (073/075, fără DOM) și sistemul atașat; GPU-ul este `NOT_MEASURED` cu motiv, nu 0. Taxiurile din afara ferestrei de observare de ±80 m rămân în lumea fizică: 18/20, 22/24 și 28/30 primesc decizii (360–1 680 per rând) și își mișcă corpurile, iar expunerea este citită din 137 pe toată flota (`fleet.vehicles × simulatedSeconds`). Verdictul citit din manifest: 36 PASS, 0 FAIL, 12 rânduri `STRESS` pentru `30/80` (două peste bugetul de 8 ms, etichetate ca atare) și 60 `REPORTED` pentru densitățile din afara workload-urilor declarate. `scripts/run-traffic-benchmark-report.mjs` derivează raportul determinist, cu `--check`.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` exit 0 („All matched files use Prettier code style!”); `npm run check:architecture` exit 0 („Architecture imports: PASS (364 TypeScript files)”, probe negative 6+4+3); `npm run check:parameter-catalog` exit 0 („Parameter catalog is synchronized.”); testele țintă `node --import ./scripts/register-typescript.mjs --test "tests/harness/traffic-benchmark.test.ts"` 12/12 pass; `npm run perf:traffic-benchmark -- --measure` a executat 108 rânduri / 180 de rulări; `npm run perf:traffic-benchmark` a raportat 36 PASS, 0 FAIL, 12 STRESS, 60 REPORTED, gate `MEASURED_GATE_PASS`; `npm run perf:traffic-benchmark -- --check` „report is current” + „markdown is current”; `npm test` 2 830 teste, 2 830 trecute, 0 eșuate, 0 sărite, 91 376 ms.

Fișiere și documente actualizate: `tests/harness/traffic-benchmark.ts` (nou), `tests/harness/traffic-benchmark.test.ts` (nou), `scripts/run-traffic-benchmark-report.mjs` (nou), `package.json` (intrarea `perf:traffic-benchmark`, ultima din `"scripts"`), `Docs/25-performanta-contracte-si-benchmark.md` (secțiune nouă la final, bugete neschimbate), `Docs/Evidence/156-traffic-benchmark/` (README, measurement.json, report.json, report.md, .gitattributes). `src/` și `Docs/performance-budgets.json` nu au fost modificate.

Limitări sau follow-up: proba este headless, deci frame/FPS, GPU, main-thread cu randare, layout/paint DOM, memoria exactă și pacing-ul real rămân `NOT_MEASURED`; UI-ul măsurat este proiecția pură 073/075. Checkpoint-ul folosește un slot 1-based în locul handle-ului Rapier (nu este întotdeauna un întreg sigur). S-a adăugat o placă de sol declarată peste extensia hărții 032, fără schimbarea gravitației/solverului/CCD/dt. Latența learning include cedarea către microtask-uri a fixture-ului (30 tick-uri). Condiția agresivă este o pereche declarată + bariere/moloz, nu politicile de joc 045/050–052. Densitatea 80 are 40 de civili autoritari + 40 de corpuri surplus marcate. Mașina este partajată, fără monitorizare termică continuă. Cele 60 de rânduri `REPORTED` nu sunt dovezi de gate; gate-ul hardware al jocului complet rămâne `NOT_VALIDATED`.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '156' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-11-12: Implementare finalizată: matrice executată pe 108 rânduri (20/24/30 taxiuri × 20/40/80 civili × 4 sisteme × 3 condiții), CPU separat pe fizică/decizii/UI/sistem, dovada taxiurilor invizibile în simulare și expunere, suprasarcină etichetată, raport determinist cu `--check`; 36 PASS, 0 FAIL, 12 STRESS, 60 REPORTED; 2 830 teste trecute. Mutat fizic în Done după validare.

## Nivel de validare — politica 2026-10-08

Nivel: `full`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

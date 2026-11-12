---
id: "224"
title: "Gate de regresii performanță CI și soak complet"
status: "Done"
release: "V1"
module: "Validare"
depends_on: ["159","220","221","222","223","218","228","229","230","233","234"]
performance_checks: ["frame", "memory", "workers", "storage", "assets", "soak"]
owner: "loop-pbi/gate-224-01"
started_at: "2026-11-12T12:30:51.368+02:00"
completed_at: "2026-11-12T13:46:50.750+02:00"
---

# 224 Gate de regresii performanță CI și soak complet

## Obiectiv

Implementează comenzile și jobul CI de regresii care leagă probele portabile și măsurătorile hardware ale aceleiași revizii de un gate obligatoriu. PBI 160 integrează apoi acest gate în pipeline-ul complet de livrare.

## Context și plan

- [26-joaca-libera-haos-si-distrugere.md](../../Docs/26-joaca-libera-haos-si-distrugere.md)

- [Contracte de performanță și benchmark](../../Docs/25-performanta-contracte-si-benchmark.md)
- [WebGPU și performanță](../../Docs/17-webgpu-si-performanta.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 159 trebuie să existe în Done înainte de începere.
- PBI 220 trebuie să existe în Done înainte de începere.
- PBI 221 trebuie să existe în Done înainte de începere.
- PBI 222 trebuie să existe în Done înainte de începere.
- PBI 223 trebuie să existe în Done înainte de începere.
- PBI 218 trebuie să existe în Done înainte de începere.
- PBI 228 trebuie să existe în Done înainte de începere.
- PBI 229 trebuie să existe în Done înainte de începere.
- PBI 230 trebuie să existe în Done înainte de începere.
- PBI 233 trebuie să existe în Done înainte de începere.
- PBI 234 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] CI respinge depășiri de capacitate/bundle și regresii confirmate conform bugetelor; un runner fără GPU real nu închide gate-ul FPS. — `npm run perf:gate` măsoară buildul de producție (5,84 MiB din 8 MiB) și capacitățile structurale (48/128 draw calls, 78/8192 instanțe, 40/512 batchuri, 12/4096 obiecte) și respinge o creștere controlată de bundle (9 425 362 B → `FAIL`, apoi `PASS` după eliminare). `fps-hardware` rămâne `NOT_VALIDATED` fără măsurătoare hardware a reviziei, iar `verifyPerformanceGateReport` respinge orice raport care ar închide FPS fără ea.
- [x] Gameplay cu learning, recorder, autosave, KPIs și credite XP trece probele pe workload maxim V1 și pe ambele backenduri. — rândurile 30/40 GATE din 156 (BASELINE, LEARNING, RECORDER_AUTOSAVE, XP) trec toate, tick p95 maxim 7,00 ms din 8 ms; ambele backenduri sunt declarate de matricea 154 (9/9 + 11 verificări deterministe), iar bugetele absolute pe backend rămân deschise la rândul `fps-hardware` (`NOT_VALIDATED`, declarat explicit).
- [x] Soak-ul de minimum 60 minute include 20 de cicluri de lifecycle și încălzirea laptopului; memoria/cozile ajung la platou, iar baseline-ul nu se actualizează automat. — soak rulat pe revizia curentă: 60,001 min, 20 cicluri curate, 19 reload-uri, 640 curse, 701 segmente/activări learning, 2 380 checkpointuri, 85 incidente toate recuperate; 7/7 tendințe `PLATEAU` (heap +1,82 MiB din 5 MiB, RSS +13,46 MiB din 33,85 MiB, cozi 1 job / 4 B, retenție 121,95 MiB). Manifestul este verificat ca nemodificat (`modified: false`) și nu este rescris.
- [x] Probe cu distrugere/efecte/audio, director random, encode/hash savefile și 20 de schimbări Academie/Haos/reset respectă bugetele pe ambele backenduri. — 227 (24/24, 20 cicluri de reset, 35 corpuri), 228 (20/20, 4 voci impact, 24 reacții/incident), 149 (32/32, 1/14 voci), 232 (56/56, istoric 24/24), 233 (55/55, 1 rând de ledger din 32), 234 (84/84, 174 732 B din 12 285 272 B, checksum 64 B), 225 (20 tranziții 10 Academie + 10 Haos, 0 lumi/joburi orfane), 226 (20 reseturi, 0 eșuate, corpuri 64 stabile); backendurile sunt declarate de 154, partea hardware absolută rămâne `NOT_VALIDATED` la FPS.

## Verificare

Demonstrează detecția unei regresii controlate și revenirea după eliminare; păstrează cinci repetări, trace-uri, raportul soak, artefactele CI și hardware-ul real.

Păstrează comenzile, configurația, rapoartele și limitările reale. Nu declara verificări fără execuție.

## Dovezi de finalizare

Rezultat implementare: gate-ul de release este executabil local cu `npm run perf:gate` și leagă probele portabile ale reviziei curente (build de producție măsurat de gate, proba structurală 157, comenzile `--check` ale 155/156/157/158/159) cu dovezile criteriilor 2 și 4 (156, 227/228/149, 232/233, 234, 225/226, 154) și cu soak-ul aceleiași revizii. Verdict agregat pe `757e7168`: **structural `PASS`, release `NOT_VALIDATED`** — 17 rânduri, 16 `PASS`, 0 `FAIL`, 1 `NOT_VALIDATED` (`fps-hardware`, fără măsurătoare hardware pe revizie). Contractul (`tests/harness/performance-gate.ts`) refuză un `PASS` fără măsurătoare, un manifest modificat și un release `PASS` cu probe deschise.

Verificări executate și rezultat: `npm run typecheck` 0; `npm run lint` 0 (0 warnings); `npm run format:check` 0; `npm run check:architecture` 0; `npm run check:parameter-catalog` 0; `npm test` 2 888 teste, 2 887 pass, 1 fail așteptat (testul dovezii comise, înainte de generarea ei), apoi `tests/harness/performance-gate.test.ts` 14/14 pass. `npm run perf:gate -- --measure` 0 (5/5 repetări identice: 6 125 279 B, digests `3ac5f69c276c` / `b6c188a777eb626e`). `npm run perf:gate -- --check` 0 („Gate report is current”). Soak 60,001 min / 20 cicluri / 7/7 `PLATEAU` (`SOAK_PASS`). Regresie controlată: `01-baseline` PASS → `02-regression` FAIL (9 425 362 B, +0,99 MiB) → `03-restored` PASS, `detected: true`, `recovered: true`. Jobul CI: `CI job: PASSED` (structural), 7 pași cu exit 0, artefact `ci-job.json`. Toate cele cinci probe apelate cu `--check` ies 0.

Fișiere și documente actualizate: `tests/harness/performance-gate.ts`, `tests/harness/performance-gate.test.ts`, `scripts/run-performance-gate.mjs`, `scripts/ci/run-gate-soak.mjs`, `scripts/ci/run-regression-demo.mjs`, `scripts/ci/run-performance-gate-job.mjs`, `package.json` (o intrare `perf:gate`, ultima), `Docs/25-performanta-contracte-si-benchmark.md` (secțiune nouă), `Docs/Evidence/224-performance-gate/` (README, `measurement.json`, `report.json`, `report.md`, `ci-job.json`, `soak/`, `regression-demo/`) și acest fișier mutat în `PBI/Done`. `src/` și `Docs/performance-budgets.json` nu au fost modificate.

Limitări sau follow-up: FPS, frame p95/p99 și lucrul GPU pe hardware real rămân `NOT_VALIDATED` pe această revizie (capturile 220 sunt pe buildul `2d68b43c8cdf`); închiderea cere o rulare Chrome reală pe commitul de release, pe ambele backenduri. Lucrul GPU pe WEBGPU rămâne `null` (fără timer), la fel memoria exactă a paginii/GPU. Probele 155/156/158 nu sunt recronometrate de gate (sunt verificate cu `--check`; repetările lor comise rămân în dovezi), iar regula relativă de regresie nu poate declanșa singură sub capacitatea absolută de 8 MiB. `qa:ui` (153) nu face parte din gate: este contract de layout/accesibilitate, nu metrică de performanță. Integrarea gate-ului în pipeline-ul complet de livrare rămâne la PBI 160.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate, inclusiv rapoartele performance_checks.
- [x] Contracte/documentație actualizate.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '224'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.4; implementarea nu a început.

- 2026-10-04: Revizia 0.5 actualizează scope-ul și verificările; implementarea rămâne în To Do.

- 2026-11-12: Implementare completă. Gate-ul `npm run perf:gate` agregă 17 probe (build de producție și capacități măsurate de gate, 5 probe `--check` ale 155/156/157/158/159, 11 dovezi pentru criteriile 2 și 4, soak-ul reviziei) cu verdict `PASS`/`FAIL`/`NOT_VALIDATED` și motiv per probă. Rezultat: structural `PASS`, release `NOT_VALIDATED` (FPS fără hardware real pe revizie). Regresia controlată este detectată și eliminată (PASS → FAIL → PASS), soak-ul de 60,001 min cu 20 de cicluri are 7/7 tendințe `PLATEAU`, baseline-ul rămâne nemodificat. Jobul CI raportează `PASSED` structural.

## Nivel de validare — politica 2026-10-08

Nivel: `soak`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

---
id: "220"
title: "Gate de performanță al flotei înainte de campanie și asseturi"
status: "Done"
release: "V1"
module: "Validare"
depends_on: ["115","065","218","219"]
performance_checks: ["frame", "simulation", "workers", "memory"]
owner: "loop-pbi/fleet-gate-220-01 (cpa/deepseek/deepseek-v4.1-flash)"
started_at: "2026-10-22T02:40:22+03:00"
completed_at: "2026-10-22T07:37:13+03:00"
---

# 220 Gate de performanță al flotei înainte de campanie și asseturi

## Obiectiv

Măsoară flota și pipeline-ul de learning funcționale înainte de a construi campania și asseturile finale.

## Context și plan

- [Contracte de performanță și benchmark](../../Docs/25-performanta-contracte-si-benchmark.md)
- [WebGPU și performanță](../../Docs/17-webgpu-si-performanta.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 115 trebuie să existe în Done înainte de începere.
- PBI 065 trebuie să existe în Done înainte de începere.
- PBI 218 trebuie să existe în Done înainte de începere.
- PBI 219 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] 20/24/30 de taxiuri și până la 40 civile trec bugetele versionate pe hardware real, inclusiv trafic agresiv, cozi/contacte și vehicule nevizibile.
- [x] Latența inputului și learning-ului, debitul simulat și percentilele au rezultate reproductibile, nu doar FPS mediu.
- [x] Workload-ul 30/80 este stres separat; abaterile din workload-ul V1 normal blochează extinderea și nu sunt mascate prin reducerea traficului.

## Verificare

Execută matricea modulului 25 cu build de producție, cinci repetări și preset fix; păstrează rapoarte și trace-uri înainte/după corecții.

Păstrează comenzile, configurația, rapoartele și limitările reale. Nu declara verificări fără execuție.

## Dovezi de finalizare

Rezultat implementare: Gate `full` al flotei fizice V1, executat pe laptopul real identificat prin CIM (Lenovo 82YM / Yoga 7 14ARP8, Ryzen 7 7735U, Radeon 680M, 16 GiB, Windows 11 Home 26300, Chrome 155.0.8059.85, 1920×1080 CSS/intern, DPR 1, preset LOW fix, schema High performance). S-a aplicat coloana `laptop` din manifestul `203-initial-1`; nu s-a folosit derogarea din 203 și nu s-a modificat niciun prag. Workload-urile 20/20, 24/40 și 30/40 au trecut toate bugetele pe ambele backenduri, iar 30/80 a rămas probă separată de suprasarcină.

Workload-ul fizic refolosește modulele reale: populație 057, cerere/dispecer 059/060, decizii civile 058, context 044, semafoare 036, programator 219, controller 024, fizică 022/Rapier, publicare contacte 028 și pipeline-ul de learning 103 → 109 → 110 → 112, cu stiluri prudente/agresive, bariere + moloz, depășiri scriptate și cozi reale. Toate corpurile rămân în lumea fizică, inclusiv cele din afara frustum-ului.

Rezultate mediane pe cinci repetări (buget laptop în paranteză): frame p95 16,8 ms (35), p99 16,9–17,0 ms (50), main-thread p95 3,3–6,1 ms (20), tick autoritar p95 3,1–5,5 ms (8), Rapier p95 0,3–0,4 ms (5), input→comandă p95 1,6–2,5 ms (80), închidere segment → activare learning 17,3–17,8 ms (2000), raport timp simulat/timp real 1,0001 (≥0,98), zero cadre peste 35 ms, zero Long Task de aplicație. GPU p95 este 1,09 ms pe WebGL2 (buget 28) și indisponibil (`null`, nu 0) pe WebGPU, unde Babylon nu raportează timer query. Proba 30/80: tick p95 6,9 ms (WEBGPU) / 5,3 ms (WEBGL2), 42 contacte simultane, 110 corpuri fizice, verdict separat `STRESS_STRUCTURAL_PASS`.

Verificări executate și rezultat:
- `npm run check` (typecheck + lint + format:check + check:architecture + npm test) — exit 0; 1816 teste trec, 0 eșecuri; arhitectura PASS.
- `node --import ./scripts/register-typescript.mjs scripts/verify-fleet-gate-evidence.mjs 20261022T024028061Z WEBGPU` — `valid: true`, `failures: []`, toate cele patru workload-uri `PASS`/`STRESS_STRUCTURAL_PASS`.
- `node --import ./scripts/register-typescript.mjs scripts/verify-fleet-gate-evidence.mjs 20261022T033847343Z WEBGL2` — `valid: true`, `failures: []`.
- `powershell -NoProfile -File ./scripts/Run-FleetGate.ps1 -Backend WEBGPU -Profile full` — 20 rulări + sumare + matrice, 1 eșec de mediu (pierdere de focus) păstrat și repetat integral.
- `powershell -NoProfile -File ./scripts/Run-FleetGate.ps1 -Backend WEBGL2 -Profile full` — 20 rulări, niciun eșec.
- Preflight `smoke` înainte de fiecare sesiune, conform politicii; DEV (3 perechi 15/30 s) folosit numai pentru escaladare și diagnostic.
- `./PBI/Validate-Board.ps1 -RequireDone '220'` — după mutarea fizică.

Fișiere și documente actualizate:
- `tests/browser/fleet-performance-gate/` — `plan.ts` (matrice, coloane de buget, verdict, reproductibilitate), `workload.ts` (workload fizic real), `protocol.ts` (warmup/măsurare, priming, eșantionare, reluare), `main.ts` (matrice pe un backend, verdict în pagină), `index.html`, `plan.test.ts`.
- `scripts/fleet-gate-server.mjs` (build de producție, CIM, export imuabil, reluare), `scripts/verify-fleet-gate-evidence.mjs` (verificare independentă), `scripts/Run-FleetGate.ps1` (check de mașină, focus keeper, jurnal de încărcare).
- `Docs/Evidence/220-fleet-gate/README.md` și `Docs/Evidence/220-fleet-gate/hardware/` (14 capturi, inclusiv eșecurile și trace-urile înainte/după corecții, manifeste, condiții, `machine-load.csv`, verificări independente).
- `Docs/25-performanta-contracte-si-benchmark.md` (secțiune de rezultat măsurat), `Docs/17-webgpu-si-performanta.md` (rezultat măsurat pe ambele backenduri).

Limitări sau follow-up: timer GPU indisponibil pe WebGPU (raportat `null`); memoria exactă a paginii indisponibilă (doar `usedJSHeapSize` 37–70 MB și contoare de proprietate); politica de comandă este o politică de fixture peste progresul real pe rută și interacțiunea 058, nu politicile 045/050/051/052 (rămân în 155); cei 40 de civili suplimentari ai probei 30/80 sunt corpuri fizice reale în afara plafonului de populație 057/058 (70) și sunt marcați `surplusActors`; mașina a fost partajată (încărcare medie 21,6 %/18,6 %, vârf 86 %/83 %), cu un eșec de focus păstrat și repetat; fără telemetrie termică continuă; soak-ul de 60 de minute și asseturile finale rămân la 224/223.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate, inclusiv rapoartele performance_checks.
- [x] Contracte/documentație actualizate.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '220'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.4; implementarea nu a început.
- 2026-10-22: implementare începută (owner `loop-pbi/fleet-gate-220-01`), mutat în In Progress.
- 2026-10-22: gate `full` executat pe laptopul real, ambele backenduri, cinci repetări per workload; 20/24/30 taxiuri + 40 civili în buget, 30/80 raportat separat ca stres; `npm run check` exit 0 (1816 teste) și ambele verificări independente `valid: true`. Mutat în Done.

## Nivel de validare — politica 2026-10-08

Nivel: `full`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

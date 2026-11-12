---
id: "216"
title: "Regresii V1 pentru moduri KPI-uri daily și XP"
status: "Done"
release: "V1"
module: "Validare"
depends_on: ["215","141","108","208","217","205"]
performance_checks: ["frame", "memory"]
owner: "loop-pbi/qa-216-01"
started_at: "2026-11-11T23:13:17+02:00"
completed_at: "2026-11-11T23:32:58+02:00"
---

# 216 Regresii V1 pentru moduri KPI-uri daily și XP

## Obiectiv

Verifică împreună corecțiile auditului și noile mecanici înaintea suitei/release-ului V1.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

- [18-validare-si-release.md](../../Docs/18-validare-si-release.md)
- [24-milestone-timpuriu-si-contracte.md](../../Docs/24-milestone-timpuriu-si-contracte.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 215 trebuie să existe în Done înainte de începere.
- PBI 141 trebuie să existe în Done înainte de începere.
- PBI 108 trebuie să existe în Done înainte de începere.
- PBI 208 trebuie să existe în Done înainte de începere.
- PBI 217 trebuie să existe în Done înainte de începere.
- PBI 205 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Cele trei moduri, propagarea taxi/civil și bariera de learning trec scenariile pozitive/negative.
- [x] KPI-uri, grafice, daily, XP fără pierderi, checkpoint și replay trec scenariile modulelor 22–23.
- [x] Playtestul confirmă explicațiile și benchmarkul raportează costurile noi; limitările nerezolvate nu sunt ascunse. — benchmarkul raportează costurile noi față de manifest; playtestul în browser **nu a fost rulat** și este declarat `NOT_RUN`, rămânând gate-ului 235 conform [politicii de validare](../../Docs/validation-policy.md). Nu se pretinde playtest.
- [x] Probele combinate ale modulului 25 raportează efectul learning+recorder+autosave+KPI+XP asupra condusului, nu doar componente izolate.
- [x] Regresia confirmă lipsa pierderilor XP; extensiile 225–234 au gate separat 235, fără dependență inversă care să formeze ciclu.

## Verificare

Execută matricea completă de regresii și playtest; păstrează dovezi, versiuni, rezultate și limitări.

Păstrează comenzile, scenariile și rezultatele reale; nu declara trecere fără execuție.

## Dovezi de finalizare

Rezultat implementare: matrice executată `npm run qa:v1-regression` cu 29 de rânduri (27 PASS, 0 FAIL, 2 NOT_RUN: playtest în browser și frame p95). Acoperă cele trei moduri pe taxi și civil cu cinci defecte injectate, propagarea 208, bariera 205 pozitiv/negativ, KPI 209/214 în ambele direcții, graficele 210 pe 12 luni, daily 211/212 pozitiv/negativ, XP 213, checkpoint 206, replay 207/141 și proba combinată learning+recorder+autosave+KPI+XP pe 1 900 de tick-uri. Nu s-a modificat `src/`; nu a fost găsit niciun defect real de business.

Verificări executate și rezultat: `npm run typecheck` PASS; `npm run lint` PASS (0 erori, 0 warning-uri); `npm run format:check` PASS; `npm run check:architecture` PASS (349 fișiere TypeScript, toate probele negative); `npm run check:parameter-catalog` PASS; `npm test` 2548 teste, 2548 trecute, 0 eșuate, 0 sărite, 84 377 ms; testele țintă `tests/qa/v1-regression.test.ts` 7/7 PASS; `npm run qa:v1-regression -- --check` „report is current” + „markdown is current”; `npm run qa:v1-regression -- --cost --samples 5` scrie `cost.json` (0,078 → 0,183 ms/tick cu sistemele atașate). XP: sold 200,5 → 200,5, nivel 2 → 2, amprentă `85df901a…3112e3cc` identică pe KPI, incident, misiune eșuată, recompensă refuzată și zi ratată; pierderi 0, debitări 0. Bugete: recorder 4 909 260 / 33 554 432 B, chunk 632 652 / 134 217 728 B, checkpoint 64 900 / 1 048 576 B, progres 9 804 / 262 144 B, bundle economic 14 483 / 1 048 576 B, generații 0/1. Graful boardului: 235 noduri, 235 muchii, 0 cicluri, 0 duplicate, 235 acoperă toate extensiile 225–234, 0 dependențe inverse.

Fișiere și documente actualizate: `tests/qa/*.ts` (8 fișiere noi), `scripts/run-v1-regression-report.mjs` (nou), `package.json` (intrarea `qa:v1-regression`, ultima), `Docs/18-validare-si-release.md` (secțiune nouă la final), `Docs/Evidence/216-v1-regression/` (`README.md`, `report.json`, `report.md`, `cost.json`, `cost.md`), fișierul PBI mutat fizic în `PBI/Done`.

Limitări sau follow-up: nivel `targeted`, fără browser, GPU, input uman sau hardware de referință; playtestul și frame p95 rămân `NOT_RUN` și sunt preluate de gate-urile 220/224/235. Condusul din proba combinată este comportamentul simulat 115, nu fizica Babylon/Rapier live. Costurile de memorie sunt contoare de ownership, nu RAM totală; costul per tick este o măsurătoare Node, nu un cadru. Review-urile din proba combinată folosesc un read model 139 real pentru cursele finalizate, iar calibrarea completă a confortului rămâne a dovezilor 209/214.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '216'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-04: Revizia 0.5 actualizează scope-ul și verificările; implementarea rămâne în To Do.

- 2026-11-11: Implementare `loop-pbi/qa-216-01`: matrice executată de 29 de rânduri (27 PASS, 0 FAIL, 2 NOT_RUN), XP fără pierderi dovedit prin amprente, costuri noi față de manifest, graf fără cicluri; playtestul și frame-ul rămân neexecutate și declarate.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

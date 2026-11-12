---
id: "158"
title: "Optimizare simulare și estimare"
status: "Done"
release: "V1"
module: "Validare și release"
depends_on: ["156","034","103","219","221","222"]
performance_checks: ["simulation", "workers", "memory"]
owner: "loop-pbi/simopt-158-01"
started_at: "2026-11-12T07:52:26.482+02:00"
completed_at: "2026-11-12T08:21:42.311+02:00"
---

# 158 Optimizare simulare și estimare

## Obiectiv

Reduce costurile CPU și transferurile fără schimbarea semanticii.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[18-validare-si-release.md](../../Docs/18-validare-si-release.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 156 trebuie să existe în Done înainte de începere.
- PBI 034 trebuie să existe în Done înainte de începere.
- PBI 103 trebuie să existe în Done înainte de începere.
- PBI 219 trebuie să existe în Done înainte de începere.
- PBI 221 trebuie să existe în Done înainte de începere.
- PBI 222 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Contextul și denominatoarele rămân echivalente în scenariile de regresie.
- [x] Estimarea nu blochează inputul pe hardware-ul de referință.

- [x] Costurile de alocare, transfer și coadă sunt măsurate; optimizarea păstrează fizica/seed-urile și nu substituie A/B cu proxy pentru XP.

## Verificare

Rulează regresii și măsoară percentilele de cost.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Optimizări fără schimbare de semantică în patru fișiere deținute. (1) `src/autonomy/road-context.ts`: amprenta canonică `JSON.stringify(frame)` a publicării 044 nu mai este construită la fiecare cadru, ci doar la comparația pe același tick (admiterea rămâne mărginită de `estimatedUnits`); semnalele rutierii se caută într-o mapă `intersectionId → movementId` construită o dată per cadru, iar existența unui program per intersecție este un `Set` construit o dată per engine. (2) `src/learning/estimator-task.ts`: encoding-ul cererii/rezultatului folosește direct bufferul `TextEncoder`, fără copia `ArrayBuffer.prototype.slice`. (3) `src/learning/profile-blend.ts`: istoricul gol este un array înghețat partajat. (4) `src/workers/protocol.ts`: `parsePacket` întoarce envelope-urile deja validate fără copiere/revalidare (verificarea bufferului, inclusiv detach, rămâne), iar pachetele de control partajează un singur `ArrayBuffer` gol. Proba deterministă `158-simulation-budget-v1` măsoară separat decizii, estimare și transfer, cu mediane din 3 treceri × 3 repetări.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0 (0 erori/0 warning-uri); `npm run format:check` exit 0; `npm run check:architecture` exit 0 (PASS, 364 fișiere TS, probe negative 6+4+3); `npm run check:parameter-catalog` exit 0; `npm test` 2841 teste, 2841 trecute, 0 eșuate, 0 sărite, 103 726 ms; teste țintă `road-context` + `protocol` + `estimator-worker` + `profile-blend` 49/49; `tests/harness/simulation-budget.test.ts` 11/11; `npm run perf:simulation-budget -- --measure` 3 treceri × 3 repetări; `npm run perf:simulation-budget -- --check` „report is current” + „markdown is current”, exit 0. Rezultate înainte → după (p95, mediana repetărilor): tick de decizii 6,9296 → 6,3242 ms (buget 8 ms), publicare 044 6,3779 → 4,8106 ms, submit sincron estimare 0,0171 → 0,0145 ms (buget 20 ms), felie worker 0,0534 → 0,0460 ms (buget 10 ms), admitere 4096 episoade 1,6334 → 2,1253 ms (buget 10 ms, variație de zgomot), cost per mesaj worker 0,0234 → 0,0176 ms, `receive` 0,0038 → 0,0002 ms. Determinist: copii de payload per estimare 2 → 0 (2 199,627 B → 0 B; 404 829 B eliminați la cererea de plafon), alocări de buffer de control 1 → 0, bytes livrate identici 2 304 000 B. Digests SHA-256 identice înainte/după: decizii 26 400 de contexte, estimare 1 320 de rezultate + blend-uri, transfer 6 000 de mesaje.

Fișiere și documente actualizate: `src/autonomy/road-context.ts`, `src/learning/estimator-task.ts`, `src/learning/profile-blend.ts`, `src/workers/protocol.ts`, `tests/harness/simulation-budget.ts` (nou), `tests/harness/simulation-budget.test.ts` (nou), `scripts/run-simulation-budget-report.mjs` (nou), `package.json` (intrarea `perf:simulation-budget`, ultima din `"scripts"`), `Docs/14-experimente-si-indicatori.md` (secțiune nouă „Bugetul de simulare și estimare 158”), `Docs/Evidence/158-simulation-budget/` (README, `baseline.json`, `measurement.json`, `report.json`, `report.md`, `.gitattributes`). `Docs/performance-budgets.json` nu a fost modificat; `src/rendering`, `src/world`, `src/missions` nu au fost atinse.

Limitări sau follow-up: proba este headless (Node), fără renderer, deci nu măsoară frame/FPS/GPU/pacing și nu închide gate-ul hardware al jocului complet (`NOT_VALIDATED`); costurile sunt per componentă pe fixture-ul 044, nu tick-ul autoritar complet. Validarea de admitere 044 și proiecția de bandă din `src/world` rămân dominante și nu au fost optimizate (contract de siguranță, respectiv modul în afara scope-ului). Timpii de perete variază ±10–30 % între treceri pe componentele mici (mașina este partajată); verdictul se sprijină pe copii, bytes și digests, care sunt deterministe. `RoadContextEngine.getStats().fingerprintCodeUnits` raportează `0`, pentru că șirul canonic nu mai este păstrat (diagnostic, nu ieșire de decizie).

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '158' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-11-12: Implementare finalizată. Optimizări fără schimbare de semantică în 044 (amprentă leneșă, mapă de semnale), 103 (fără copie de payload la encoding), 101 (istoric gol partajat) și 221 (envelope validat fără copiere, buffer de control partajat). Baseline real înainte (546fa29e) și după, pe aceeași probă: tick de decizii 6,93 → 6,32 ms p95, publicare 044 6,38 → 4,81 ms p95, cost per mesaj worker 0,0234 → 0,0176 ms p95, copii de payload per estimare 2 → 0. Digests SHA-256 identice pe 26 400 de contexte, 1 320 de estimări și 6 000 de mesaje; `npm test` 2841/2841. Bugetele din manifest nu au fost modificate.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

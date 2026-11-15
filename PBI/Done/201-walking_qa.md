---
id: "201"
title: "Validare integrală V3"
status: "Done"
release: "V3"
module: "Mers pe jos V3"
depends_on: ["200","189"]
performance_checks: ["frame", "simulation", "soak"]
owner: "loop-pbi/v3-qa-201-01"
started_at: "2026-11-15T01:48:23+02:00"
completed_at: "2026-11-15T02:40:37+02:00"
---

# 201 Validare integrală V3

## Obiectiv

Verifică coliziuni, camere, input, misiuni, învățare și performanță.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[20-extensii-si-mers-pe-jos.md](../../Docs/20-extensii-si-mers-pe-jos.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 200 trebuie să existe în Done înainte de începere.
- PBI 189 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Toate fluxurile manual/AUTO funcționează și după intrare/ieșire. — `PASS`: 3/3 moduri (`AUTO`, `MANUAL`, `LEARNING`) și 3/3 conduceri lungi trec lanțul real 192 → 195 → 193 → 196 → 197 → 198; fiecare mod se reia după ieșire și personajul merge 1,226 m.
- [x] Catalogul și indicatorii nu sunt alterați de mers. — `PASS`: 9/9 digeste SHA-256 identice după 5 000 de tick-uri de mers (114,10 m) și după reload 200.
- [x] Cele trei moduri, personajul și streamingul vizual trec contractul 25; workload/bugete V3 sunt explicit versionate. — `NOT_RUN`: contractul 25 reexecutat pe workload-ul versionat `201-workload-v3-1` (158 `PASS`, 157 `STRUCTURAL_PASS`, 159 `SOAK_PASS`, 224 structural `PASS`, baseline nemodificat), dar FPS/frame pe GPU real și cei 2 pași de streaming vizual `NOT_MEASURED` rămân deschise; gate-ul nu este declarat `PASS`.

## Verificare

Sesiune completă, soak și matrice backend pentru V3.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: validare integrală V3 cu verdict pe criterii, nu global — **2 `PASS`, 0 `FAIL`, 1 `NOT_RUN`**. `qa:v3-validation` rulează efectiv 11 comenzi (toate exit 0), importă două suite noi și scrie `Docs/Evidence/201-v3-validation/{report.json,report.md}`. C1 este dovedit prin lanțul real 192 → 195 → 193 → 196 → 197 → 198 pe `AUTO`/`MANUAL`/`LEARNING` (3/3 moduri, 3/3 conduceri, re-intrare după ieșire, 1,226 m mers după ultima ieșire, 0 comenzi către consumatorul inactiv). C2 este dovedit prin digest: catalog 092, capabilități 187, KPI 209, ledger 209, XP 213, daily 211 și sesiunea 135 sunt identice (9/9) după 5 000 de tick-uri de mers (114,10 m) și după reload-ul 200 (`ACCEPTED`, checksum verificat, 71 entități, 0 corpuri create, XP 100,5 / nivel 2). C3 este `NOT_RUN`: 158 `PASS` (3/3 `IDENTICAL`), 157 `STRUCTURAL_PASS` (17 `PASS`, 0 `FAIL`, 2 `NOT_MEASURED`), 159 `SOAK_PASS` (60,002 min, 20 cicluri), 224 structural `PASS` (16/0/1), 154 9/9, 188 40/40, dar FPS/frame pe GPU real și streamingul vizual nu au măsurătoare. Workload-ul `201-workload-v3-1` este versionat explicit: 1 personaj cu 10 contracte 191–200, 30 taxiuri / 40 civili, 96 pietoni / 80 treceri, 96 obstacole / 11 stimuli, 80 chei de catalog, 15 provocări; bugetele rămân cele din `203-initial-1`.

Verificări executate și rezultat: `npm run qa:v3-validation` exit 0 (criterii 2/0/1, moduri 3/3, digeste 9/9); `npm run qa:v3-validation -- --check` exit 0 („Raportul V3 este curent” + „Markdown-ul V3 este curent”); `npm run qa:v1-regression -- --check` exit 0 (29 rânduri, 27 `PASS`, 2 `NOT_RUN`, pierderi XP 0); `npm run qa:compat -- --check` exit 0 (9/9, 11/11); `npm run perf:simulation-budget -- --check` exit 0 (3/3 `IDENTICAL`); `npm run perf:render-budget -- --check` exit 0 (17 `PASS`, 2 `NOT_MEASURED`); `npm run perf:soak -- --check` exit 0 (`SOAK_PASS`, 60,002 min); `npm run perf:gate -- --measure --out=Docs/Evidence/201-v3-validation/gate-measure` exit 0 (structural `PASS`, release `NOT_VALIDATED`, 16/0/1); `npm run validate:parameters -- --check` exit 0 (80 chei, 0 findings); `npm run missions:challenges-v2 -- --check` exit 0 (40/40); `npm run walking:segments -- --check` exit 0 (16/16 scenarii); `npm run walking:save -- --check` exit 0 (160/160 verificări, 18/18 refuzuri); `npm test` exit 0 (**3 408 teste, 3 408 trecute, 0 eșuate**); `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` exit 0; `npm run check:architecture` exit 0 (410 fișiere, probe negative respinse); `npm run check:parameter-catalog` exit 0.

Fișiere și documente actualizate: `scripts/run-v3-validation-report.mjs` (nou), `tests/qa/v3-validation-flow.ts` (nou), `tests/qa/v3-validation-digest.ts` (nou), `tests/qa/v3-validation.test.ts` (nou), `package.json` (o intrare nouă, ultima din `scripts`: `qa:v3-validation`), `Docs/18-validare-si-release.md` (secțiune nouă la final), `Docs/Evidence/201-v3-validation/` (raport, markdown, măsurătoare gate, README) și acest fișier PBI.

Limitări sau follow-up: FPS/frame/GPU pe hardware real, pe aceeași revizie și ambele backenduri (owner 224 / operator); fixture de harness cu personaj, pietoni și pericole pentru probele de timp V3 (owner 220/224); cei 2 pași de streaming vizual `NOT_MEASURED` (owner 157/223); soak V3 (owner 159/224); playtest uman moștenit din 216 (owner 235/216). `Docs/performance-budgets.json` nu a fost modificat: SHA-256 `10d78ab5c999215684c821a1f32fd7045392f0f6d8c140c54115d0f73475a21c`, identic cu `HEAD`, `approvedGate` `false`, `hardwareGameplayGate` `NOT_VALIDATED`.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate. — C1 și C2 bifate; C3 `NOT_RUN` declarat cu motiv, gate-ul rămâne deschis.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate. — `Docs/18` și dovezile 201; contractele 191–200 nu au fost modificate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '201' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-11-15: Validare integrală V3 finalizată: 2 criterii `PASS`, 0 `FAIL`, 1 `NOT_RUN` (FPS/GPU și streaming vizual, gate deschis); 11/11 comenzi exit 0, 3 408 teste trecute, workload `201-workload-v3-1` versionat, baseline nemodificat.

## Nivel de validare — politica 2026-10-08

Nivel: `soak`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

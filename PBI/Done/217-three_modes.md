---
id: "217"
title: "Integrare AUTO MANUAL și LEARNING fără învățare accidentală"
status: "Done"
release: "V1"
module: "Control manual"
depends_on: ["067","069","085","112","073","080"]
performance_checks: ["frame", "simulation"]
owner: "opencode deepseek-v4.1-flash three-modes-01"
started_at: "2026-10-21T21:56:29.511Z"
completed_at: "2026-10-22T01:45:36+03:00"
---

# 217 Integrare AUTO MANUAL și LEARNING fără învățare accidentală

## Obiectiv

Verifică cele trei moduri de la hotkey și HUD până la estimator/profil, inclusiv taxiuri și civile.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

- [08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md)
- [09-telemetrie-si-oportunitati.md](../../Docs/09-telemetrie-si-oportunitati.md)
- [10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 067 trebuie să existe în Done înainte de începere.
- PBI 069 trebuie să existe în Done înainte de începere.
- PBI 085 trebuie să existe în Done înainte de începere.
- PBI 112 trebuie să existe în Done înainte de începere.
- PBI 073 trebuie să existe în Done înainte de începere.
- PBI 080 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] MANUAL produce telemetrie pentru indicatori și istoric fără a modifica parametrii sau dovezile; LEARNING eligibil publică automat.
- [x] Toate cele șase tranziții separă segmentele, păstrează fizica și maximum un vehicul condus de jucător.
- [x] M/L sunt remapabile, focusul este corect, iar selecția nouă nu preia implicit controlul.

- [x] Inputul celor trei moduri și schimbarea selecției au latență măsurată inclusiv cu worker ocupat.

## Verificare

Parcurge matricea AUTO/MANUAL/LEARNING × taxi/civil, curse mixte, pauză, remapare și worker întârziat.

Păstrează comenzile, scenariile și rezultatele reale; nu declara trecere fără execuție.

## Dovezi de finalizare

Rezultat implementare: Harness-ul `217-three-modes-v1` parcurge matricea AUTO/MANUAL/LEARNING × TAXI/CIVIL (12 rânduri) peste modulele reale 066/067/068/069/070/080/103/109/112. Fiecare dintre cele șase tranziții închide segmentul vechi la tick-ul acceptat și deschide segmentul nou la același tick, cu modul corect; `RETURN_TO_AUTO`/`MODE_CHANGE` sunt singurele motive, iar `learningEligible` este true doar pentru un LEARNING eligibil. Fizica este păstrată: viteza și headingul identice la `1e-9`, pasul de poziție exact `speed/60 s` la `1e-6 m`; un salt injectat eșuează cu `PHYSICS_POSITION_STEP`/`PHYSICS_SPEED`. Există maximum un seat `PLAYER`, mereu identitatea controlată; un al doilea seat injectat eșuează cu `MULTIPLE_PLAYER_SEATS`. Selecția mută doar ținta camerei, civilul rămâne neselectat în AUTO, iar `M`/`L` explicit îl preia. MANUAL închide `SKIPPED_MANUAL` (`MANUAL_SEGMENT_NOT_LEARNABLE`), fără job/versiune, cu parametri neschimbați și telemetrie > 0; LEARNING eligibil închide `COMPOSED` cu job 103 real și versiune reală 109/112; LEARNING ineligibil închide `SKIPPED_INELIGIBLE`, cu 0 joburi/versiuni. Tastele remapate `Digit1`/`Digit2` prin 080 conduc modurile, `KeyM` este ignorat; pauza de panou și pierderea focusului suspendă prin 070, curăță tasta ținută și intenția pending, apoi reiau exact la `tick+1` cu segmentul deschis. Cu un job secundar care ține worker-ul serial ocupat, fiecare închidere LEARNING este totuși admisă; reluarea este deduplicată cu 0 porniri suplimentare. Latențele locale, provizorii (`level full`, `scope LOCAL_NODE_SINGLE_PROCESS`, hardware/FPS/GPU `NOT_MEASURED`): intent→tranziție p50 1.18 ms/p95 1.51 ms; selecție→țintă cameră p50 0.37 ms/p95 0.55 ms; închidere LEARNING→admitere 103 cu worker ocupat p50 0.71 ms/p95 0.97 ms, 200/200 admise, 0 joburi duplicate. Bugetul de un tick este informativ, nu un gate.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (253 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1792/1792 pass, 0 fail; `npm run modes:three` preflight `npm test` PASS, apoi 28/28 verificări, 7 scenarii, matrix PASS; `npm run modes:three -- --check` PASS cu latențele normalizate. Testele țintite 217: 20/20 pass. Raportul are 12 rânduri de tranziție, 8 segmente închise (4 MANUAL, 4 LEARNING), maximum 1 seat PLAYER, 2 joburi de learning, 2 versiuni de profil, 0 publicări MANUAL și determinism pe două rulări identice. Dovezi: [report.json](../../Docs/Evidence/217-three-modes/report.json), [report.md](../../Docs/Evidence/217-three-modes/report.md), [README](../../Docs/Evidence/217-three-modes/README.md).

Fișiere și documente actualizate: `src/app/three-modes.ts`, `src/app/index.ts`, `tests/app/three-modes-fixture.ts`, `tests/app/three-modes.test.ts`, `tests/app/three-modes-report.ts`, `scripts/run-three-modes-report.mjs`, `package.json`, `Docs/three-modes.md`, `Docs/08-interfata-camera-si-control.md`, `Docs/10-invatarea-stilului.md`, `Docs/README.md` și `Docs/Evidence/217-three-modes/`.

Limitări sau follow-up: Fizica scenei este un readback determinist cu viteză constantă, folosit pentru continuitatea tranzițiilor, nu o simulare Rapier. Estimatoarele 094–101 rulează în worker, dar harness-ul răspunde cu blend-ul real 101, deci nu re-estimează acuratețea stilului. Nu există captură browser, FPS, GPU sau măsurători hardware; integrarea vizuală completă rămâne gate-ul de release. Eșantionul de latență este 48/200/200 pentru că 069 protejează 64 de înregistrări de segment per lifecycle; `--check` compară totul în afara valorilor de latență și a flag-urilor informative de un tick. Nivelul `full` a fost aplicat cu preflight pe suita completă; rezultatele rămân locale și provizorii.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '217'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-22: Implementare finalizată: matrice completă AUTO/MANUAL/LEARNING × taxi/civil, șase tranziții cu segmente și fizică păstrată, un singur seat PLAYER, MANUAL fără învățare vs LEARNING eligibil publicat, remapare/focus/pauză, worker ocupat și latențe locale măsurate; 20 teste, raport cu 28 de verificări și documentație. Mutat fizic în Done după validare.

## Nivel de validare — politica 2026-10-08

Nivel: `full`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

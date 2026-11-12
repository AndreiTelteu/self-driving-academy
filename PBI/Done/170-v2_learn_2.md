---
id: "170"
title: "Învățare extinsă pentru accelerație și frânare"
status: "Done"
release: "V2"
module: "Învățare V2"
depends_on: ["169","163"]
parameter_role: "estimator"
parameter_keys: ["braking_jerk","throttle_release_delay","launch_intensity","coasting_bias"]
owner: "loop-pbi/v2-learn-170-01"
started_at: "2026-11-12T20:11:06+02:00"
completed_at: "2026-11-12T20:25:41+02:00"
---

# 170 Învățare extinsă pentru accelerație și frânare

## Obiectiv

Construiește estimarea și dovezile pentru braking_jerk, throttle_release_delay, launch_intensity, coasting_bias. Separă coastingul, jerk-ul de frână, întârzierea ridicării accelerației și plecarea specifică.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 169 trebuie să existe în Done înainte de începere.
- PBI 163 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare cheie are context eligibil, incertitudine și validare pe date independente.
- [x] Datele neidentificabile păstrează cheia neobservată; constrângerile de grup sunt explicate.

## Verificare

Demonstrații sintetice și manuale cu contexte variate și cazuri fără dovezi.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Contractul `170-accel-estimator-v1` din `src/learning/accel-estimator.ts` estimează cele patru chei 169 din fapte de actuare separate. `braking_jerk` se măsoară din panta decelerației commitate a unei frânări reale cu cerere 047 constantă și rampă completă; `throttle_release_delay` din tick-urile de menținere a accelerației după o ridicare reală de throttle; `launch_intensity` prin inversarea raportului aplicat/cerut sub 2 m/s în factorul 169 `0,35 + 0,65 · intensity`; `coasting_bias` prin inversarea raportului unei cereri mici (≤ 0,6 m/s²) peste 2 m/s în `1 − bias`. Estimarea este mediana pe episod, incertitudinea este eroarea standard a medianei prin MAD cu podea per cheie, iar fiecare cheie are prag de incertitudine (1,5 m/s³, 0,25 s, 0,1, 0,1): peste prag cheia rămâne `UNOBSERVED` cu `UNCERTAINTY_ABOVE_THRESHOLD`. Validarea folosește un split determinist după hash-ul seed-ului 170, fără suprapunere (2 episoade de estimare + 2 ținute deoparte per cheie), cu `TOO_SMALL` sub două episoade. Rezultatul este candidat-only, nu publică profiluri și nu schimbă semantica 169. Dovezile reale: `braking_jerk` 3,0000 m/s³ ±0,0500 (validare 3,0000, eroare 0,0000), `throttle_release_delay` 0,2000 s ±0,0020 (validare 0,2000), `launch_intensity` 0,6000 ±0,0657 (validare 0,6000), `coasting_bias` 0,4000 ±0,0657 (validare 0,4000).

Verificări executate și rezultat: `npm run typecheck` 0 erori; `npm run lint` 0 erori/0 warnings; `npm run format:check` toate fișierele formatate; `npm run check:architecture` PASS (373 fișiere TypeScript); `npm run check:parameter-catalog` catalog sincronizat; `node --import ./scripts/register-typescript.mjs --test tests/learning/accel-estimator.test.ts` 10 teste, 10 PASS, 0 fail; `npm test` 2993 teste, 2993 PASS, 0 fail; `npm run accel:learning` 21/21 verificări PASS, digest `fnv1a32:eaa7cad7`; `npm run accel:learning -- --check` raport actual (exit 0). Performanță: PBI fără `performance_checks`, fără lucru pe tick/frame în runtime (modul pur de estimare, apelat offline), deci nivelul `targeted-validation-v1` nu cere probe hardware suplimentare.

Fișiere și documente actualizate: creat `src/learning/accel-estimator.ts`, `tests/learning/accel-estimator.test.ts`, `tests/learning/accel-estimator-reference.ts`, `tests/learning/accel-estimator-report.ts`, `scripts/run-v2-accel-learning-report.mjs`, `Docs/Evidence/170-v2-accel-learning/README.md` (+ `report.json`, `report.md`); modificat `src/learning/index.ts` (export la finalul listei), `package.json` (scriptul `accel:learning`, ultima intrare), `Docs/10-invatarea-stilului.md` (secțiune nouă la final). Nu au fost modificate `src/ui`, `src/rendering`, `src/persistence`, `src/missions`, `src/world`, `src/autonomy` (doar citit), bugetele sau `Docs/18`.

Limitări sau follow-up: Fixturile sunt sintetice și deterministe, construite din semantica 169; conectarea la telemetrie reală cere un adaptor din 086–089 pentru cererea 047, accelerația commitată, viteză și faptele de lider/oprire. Pragurile de incertitudine, numărul minim de episoade și toleranțele sunt inițiale și trebuie revizuite pe date reale. Catalogul 092 rămâne fail-closed: cele patru chei R au `implemented: false`, deci estimările nu pot deveni `LEARNED` sau `MANUAL_TUNING`. Rampa de frânare este identificabilă doar când cererea 047 este constantă și vizibilă sub ea.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '170' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-12T20:11:06+02:00: preluat de `loop-pbi/v2-learn-170-01`, mutat în In Progress.
- 2026-11-12T20:25:41+02:00: implementat contractul `170-accel-estimator-v1`, teste deterministe, raport `accel:learning` (21/21) și dovezi; mutat fizic în Done după validator.

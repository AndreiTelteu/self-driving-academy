---
id: "168"
title: "Învățare extinsă pentru viteză și ritm"
status: "Done"
release: "V2"
module: "Învățare V2"
depends_on: ["167","163"]
parameter_role: "estimator"
parameter_keys: ["speed_delta_arterial","cruise_speed_variability","overtake_speed_bonus","cruise_accel_deadband"]
owner: "loop-pbi/v2-learn-168-01"
started_at: "2026-11-12T19:18:15.655+02:00"
completed_at: "2026-11-12T19:32:51.426+02:00"
---

# 168 Învățare extinsă pentru viteză și ritm

## Obiectiv

Construiește estimarea și dovezile pentru speed_delta_arterial, cruise_speed_variability, overtake_speed_bonus, cruise_accel_deadband. Separă variația ritmului, deadbandul și bonusul de depășire de constrângerile traficului.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 167 trebuie să existe în Done înainte de începere.
- PBI 163 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare cheie are context eligibil, incertitudine și validare pe date independente.
- [x] Datele neidentificabile păstrează cheia neobservată; constrângerile de grup sunt explicate.

## Verificare

Demonstrații sintetice și manuale cu contexte variate și cazuri fără dovezi.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: contractul `168-tempo-estimator-v1` din `src/learning/tempo-estimator.ts` estimează cele patru chei de tempo 167 din fapte demonstrate, cu context eligibil separat per cheie (arterial liber, ciclu de croazieră complet, depășire reală neconstrânsă, pași de țintă), incertitudine măsurată și prag per cheie, split explicit seed-uit între estimare și validare, și valori `null` cu motiv închis pentru datele neidentificabile. Sunt explicate patru constrângeri de grup; estimarea este candidate-only și nu schimbă semantica 167. Rezultate reale: arterial 4,075 ±0,100 m/s (validare 3,950, eroare 0,125), variabilitate 1,200 ±0,050 m/s (validare 1,200, eroare 0,000), bonus 2,000 ±0,200 m/s (validare 2,000, eroare 0,000), deadband 0,325 ±0,075 m/s (2 episoade ținute deoparte, toți cei 4 pași consistenți).

Verificări executate și rezultat: `npm run typecheck` 0 erori; `npm run lint` 0 erori/0 warnings; `npm run format:check` toate fișierele formatate; `npm run check:architecture` PASS (371 fișiere TypeScript); `npm run check:parameter-catalog` sincronizat; `node --import ./scripts/register-typescript.mjs --test tests/learning/tempo-estimator.test.ts` 8 teste, 8 PASS, 0 fail; `npm test` 2973 teste, 2973 PASS, 0 fail (97,6 s); `npm run speed:learning` 19/19 verificări PASS; `npm run speed:learning -- --check` raport actual.

Fișiere și documente actualizate: `src/learning/tempo-estimator.ts` (nou), `src/learning/index.ts` (export la final), `src/autonomy/speed-policy.ts` (export pentru anvelopa de trafic, fără schimbare de semantică), `tests/learning/tempo-estimator.test.ts`, `tests/learning/tempo-estimator-reference.ts`, `tests/learning/tempo-estimator-report.ts` (noi), `scripts/run-v2-speed-learning-report.mjs` (nou), `package.json` (script `speed:learning` la finalul blocului), `Docs/10-invatarea-stilului.md` (secțiune nouă la final), `Docs/Evidence/168-v2-speed-learning/README.md` + `report.json` + `report.md`.

Limitări sau follow-up: fixturile sunt sintetice, nu capturi reale; conectarea la telemetria 086–089 cere un adaptor de fapte de tempo. Pragurile de incertitudine, numărul minim de episoade și toleranțele de validare sunt inițiale și trebuie revizuite pe date reale. Catalogul 092 rămâne fail-closed (`implemented: false`), deci estimările rămân candidate și nu devin `LEARNED`/`MANUAL_TUNING`.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '168' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-12: implementare finalizată în worktree-ul `loop-pbi/v2-learn-168-01`; contract `168-tempo-estimator-v1`, raport determinist 19/19, suita completă 2973/2973; fișier mutat fizic în Done.

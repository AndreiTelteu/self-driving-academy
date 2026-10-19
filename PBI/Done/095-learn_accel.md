---
id: "095"
title: "Estimator accelerație frânare jerk și reacție"
status: "Done"
release: "V1"
module: "Învățare"
depends_on: ["093","047","089"]
parameter_role: "estimator"
parameter_keys: ["desired_acceleration","comfort_deceleration","acceleration_jerk","brake_reaction_delay"]
owner: "Codex gpt-6-luna medium speed-accel-estimators-01"
started_at: "2026-10-19T16:53:02+03:00"
completed_at: "2026-10-19T17:19:36+03:00"
---

# 095 Estimator accelerație frânare jerk și reacție

## Obiectiv

Estimează cele patru chei M longitudinale folosind input efectiv și stimuli.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 093 trebuie să existe în Done înainte de începere.
- PBI 047 trebuie să existe în Done înainte de începere.
- PBI 089 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Impacturile nu măresc frânarea sau jerk-ul preferat.
- [x] Diferențele de clasă sunt normalizate sau reduc calitatea dovezii.

## Verificare

Compară demonstrații sintetice, impact și limite mecanice.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `estimateAccelerationParameters` în `src/learning/acceleration-estimator.ts`, exportat prin `src/learning/index.ts`, produce candidați pentru cele patru chei longitudinale (`desired_acceleration`, `comfort_deceleration`, `acceleration_jerk`, `brake_reaction_delay`). Observațiile sunt validate pe identitatea 087/088/089 (fereastră, segment, vehicul, incarnation, oportunitate) și acceptate numai din `FREE_TRAFFIC`/`ELIGIBLE`/`LEARNING` cu fereastră 088 `COMPLETE` și fără artefacte; coliziunile, plasările de recovery și ferestrele trunchiate sunt excluse și contorizate, iar `CAPABILITY_LIMITED`/`aggressivenessIsLowerBound` sunt reținute doar ca limite inferioare numărate, niciodată ca preferință. Estimatorul folosește mediane robuste cu eliminarea a 10% valori extreme, transformă cererea normalizată 089 în accelerație de referință a sedanului (deci aceeași cerere normalizată dă același candidat la sedan și compact) și păstrează separat sumarul brut SI pe clasă. Reacția la frânare provine exclusiv din dovada 087 cu stimul observabil și durată în tick-uri; absența ei rămâne `UNOBSERVED`, nu o reacție lentă. Rezultatul este candidat-only, cu breakdown pe clasă și contoare de excludere; nu produce profil și nu activează `estimable`.

Verificări executate și rezultat:
- Implementator: `npm run typecheck`, `lint`, `format:check`, `check:architecture`, `check:parameter-catalog` exit 0; `npm test` 1037/1037 PASS; suita 092 `tests/parameters/registry.test.ts` 8/8 PASS.
- Orchestrator, pe starea integrată (`da3d1fff`): `npm run check` EXIT 0 — 1037 teste, 1037 pass, 0 fail; `npm run check:parameter-catalog` EXIT 0.
- Testele 095 (3/3): 20 de ferestre cu impact nu ridică frânarea sau jerk-ul față de setul lin; aceeași cerere normalizată sedan/compact produce candidatul identic 2,3214285714 m/s², în timp ce sumarul brut SI păstrează diferența de clasă; 6 tick-uri de reacție produc 0,1 s, iar lipsa dovezii de reacție rămâne neobservată.
- Dovezi: [Evidence/095-acceleration-estimator](../../Docs/Evidence/095-acceleration-estimator/README.md).

Fișiere și documente actualizate: `src/learning/acceleration-estimator.ts` (nou), `src/learning/index.ts`, `tests/learning/acceleration-estimator.test.ts` (nou), [Docs/acceleration-estimator.md](../../Docs/acceleration-estimator.md) (nou), [Docs/10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md), `Docs/Evidence/095-acceleration-estimator/`.

Limitări sau follow-up: Candidat-only, necablat în bucla live și fără publicare de profil. `jerkSamplesMps3` este furnizat de apelant din eșantioanele 085; estimatorul nu verifică derivarea lui. Conversia reacției folosește tick-ul fix de 60 Hz al proiectului (`FIXED_TICK_HZ`), nu o rată variabilă. Normalizarea raportează cererea pe plafonul clasei, dar candidatul este exprimat pe referința sedanului; pentru clasele viitoare cu plafon mai mare convenția trebuie revizuită. Fără rulare integrată de condus, browser, GPU sau FPS.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '095' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-19: Implementare în worktree izolat (commit `f1487ee6`): estimator candidat longitudinal cu excluderea impacturilor și a limitelor mecanice, normalizare pe referința sedanului și reacție din dovada 087 observabilă. Integrat prin merge (baza era vârful 094 pre-integrare); verificat de orchestrator cu 1037/1037 teste.

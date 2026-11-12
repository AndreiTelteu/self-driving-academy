---
id: "180"
title: "Învățare extinsă pentru control lateral și viraje"
status: "Done"
release: "V2"
module: "Învățare V2"
depends_on: ["179","163"]
parameter_role: "estimator"
parameter_keys: ["lane_center_offset","steering_response_time","steering_rate_limit","turn_entry_speed","turn_exit_acceleration","corner_cutting_bias","lateral_clearance","lateral_correction_deadband"]
owner: "loop-pbi/v2-learn-180-01"
started_at: "2026-11-13T01:30:25+02:00"
completed_at: "2026-11-13T01:52:49+02:00"
---

# 180 Învățare extinsă pentru control lateral și viraje

## Obiectiv

Construiește estimarea și dovezile pentru lane_center_offset, steering_response_time, steering_rate_limit, turn_entry_speed, turn_exit_acceleration, corner_cutting_bias, lateral_clearance, lateral_correction_deadband. Normalizează traiectoriile după geometrie și aderență pentru controllerul lateral.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 179 trebuie să existe în Done înainte de începere.
- PBI 163 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare cheie are context eligibil, incertitudine și validare pe date independente.
- [x] Datele neidentificabile păstrează cheia neobservată; constrângerile de grup sunt explicate.

## Verificare

Demonstrații sintetice și manuale cu contexte variate și cazuri fără dovezi.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: contractul `180-lateral-estimator-v2` din `src/learning/lateral-v2-estimator.ts` estimează cele opt chei R ale politicii 179 din opt scenarii distincte, inversând aritmetica comenzii reale 179: deplasarea efectivă în interiorul coridorului 049, tick-urile până la prima reacție confirmate de `responseTicks`, pasul saturat de direcție, limita de viteză în viraj sub plafonul de aderență, accelerația de pe tick-ul de ieșire sub plafonul M `desired_acceleration`, tăierea raportată față de coridor, spațiul efectiv față de podeaua vehiculului și intersecția inegalităților benzii moarte. Fiecare cheie are prag de incertitudine propriu, iar peste prag rămâne `UNOBSERVED`; un zero demonstrat (țintă pe centrul benzii, tăiere 0 în viraj) rămâne `CANDIDATE` cu valoarea 0. Rezultatul explică șapte constrângeri de grup, inclusiv cele patru plafoane (rată 1,5 rad/s, podeaua de spațiu lateral, aderența la intrare, plafonul M la ieșire) și continuitatea latch-ului pentru timpul mort și corecție.

Verificări executate și rezultat: `npm run typecheck` PASS; `npm run lint` PASS (0 avertismente); `npm run format:check` PASS; `npm run check:architecture` PASS (383 fișiere, 6+4+3 probe negative respinse); `npm run check:parameter-catalog` PASS („Parameter catalog is synchronized."); `npm test` PASS cu 3118 teste trecute, 0 eșecuri, 100923,76 ms; testul țintă `tests/learning/lateral-v2-estimator.test.ts` PASS cu 16 teste, 0 eșecuri; `npm run lateral:learning` raportează 30/30 verificări PASS, 8 chei candidate, 15 demonstrații neobservate, digest `fnv1a32:de102d60`; `npm run lateral:learning -- --check` confirmă `report.json` și `report.md` actuale (cod de ieșire 0).

Fișiere și documente actualizate: creat `src/learning/lateral-v2-estimator.ts`, `tests/learning/lateral-v2-estimator-reference.ts`, `tests/learning/lateral-v2-estimator-report.ts`, `tests/learning/lateral-v2-estimator.test.ts`, `scripts/run-v2-lateral-learning-report.mjs`, `Docs/Evidence/180-v2-lateral-learning/README.md` (+ `report.json`, `report.md` generate); modificat `src/learning/index.ts` (export la final), `package.json` (intrarea `lateral:learning` la finalul blocului `scripts`) și `Docs/10-invatarea-stilului.md` (secțiune nouă la final).

Limitări sau follow-up: valorile din fixturi sunt demonstrații plauzibile, nu date măsurate pe jucători, deci dovezile validează contractul de context, incertitudine, împărțire și refuz, nu calibrarea finală. Banda moartă este un prag strict și rămâne întotdeauna un interval, niciodată o valoare exactă. Benzile ascunse de plafoane (1,5–4 rad/s, 0,1–2,0 m, peste 6,2688 m/s, 1,5–6 m/s², ±0,9 m coridor) rămân neobservate prin construcție. Episoadele de ieșire și de spațiu lateral se sprijină pe exact două episoade de validare.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '180' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-13: Implementare finalizată în worktree-ul `v2-learn-180-01`; contract `180-lateral-estimator-v2`, raport determinist 30/30 PASS (8 chei candidate, 15 demonstrații neobservate), suita completă 3118/3118 teste.

---
id: "172"
title: "Învățare extinsă pentru urmărire și distanțe"
status: "Done"
release: "V2"
module: "Învățare V2"
depends_on: ["171","163"]
parameter_role: "estimator"
parameter_keys: ["cutin_brake_response","closing_ttc_threshold","leader_change_delay","following_hysteresis"]
owner: "loop-pbi/v2-learn-172-01"
started_at: "2026-11-12T21:14:41+02:00"
completed_at: "2026-11-12T21:33:00+02:00"
---

# 172 Învățare extinsă pentru urmărire și distanțe

## Obiectiv

Construiește estimarea și dovezile pentru cutin_brake_response, closing_ttc_threshold, leader_change_delay, following_hysteresis. Testează cut-in, schimbarea liderului, TTC și histerezis în episoade distincte.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 171 trebuie să existe în Done înainte de începere.
- PBI 163 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare cheie are context eligibil, incertitudine și validare pe date independente.
- [x] Datele neidentificabile păstrează cheia neobservată; constrângerile de grup sunt explicate.

## Verificare

Demonstrații sintetice și manuale cu contexte variate și cazuri fără dovezi.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: contractul `172-follow-estimator-v1` din `src/learning/follow-estimator.ts` estimează cele patru chei 171 (`cutin_brake_response`, `closing_ttc_threshold`, `leader_change_delay`, `following_hysteresis`) prin inversarea aritmeticii livrate de 171, pe episoade separate: cut-in, apropiere reală, schimbare de lider fără cut-in și oscilație în bandă. Estimarea este candidat-only, fără publicare de profil, fără scriere în store și fără schimbarea semanticii 171. Valorile reale: cut-in 0,7000 ratio ±0,0200, prag TTC 3,0000 s ±0,0500, întârziere 0,1917 s ±0,0083 (12 tick-uri ținute), histerezis 1,0000 m ±0,2000; fiecare cheie `VALIDATED` pe 2 episoade ținute deoparte din 4. Un zero demonstrat rămâne `CANDIDATE` cu valoare 0, iar 11 demonstrații neobservate păstrează valoarea `null` cu motiv explicit. Compatibilitate 171: țintă cut-in 7,9500 m/s, plafon contact 22,3333 m/s, 12 tick-uri de ținere, histerezis ținut/neținut la 0,8/1,2 m.

Verificări executate și rezultat: `npm run typecheck` 0 erori; `npm run lint` 0 erori/0 warnings; `npm run format:check` PASS; `npm run check:architecture` PASS (375 fișiere TypeScript, 6+4+3 probe negative); `npm run check:parameter-catalog` sincronizat; `node --import ./scripts/register-typescript.mjs --test tests/learning/follow-estimator.test.ts` 13/13 PASS; `npm test` 3016 teste, 3016 PASS, 0 fail; `npm run follow:learning` 22/22 verificări PASS, digest `fnv1a32:3e8addc1`; `npm run follow:learning -- --check` raport actual (exit 0).

Fișiere și documente actualizate: `src/learning/follow-estimator.ts` (nou), `src/learning/index.ts` (export la final), `tests/learning/follow-estimator.test.ts`, `tests/learning/follow-estimator-reference.ts`, `tests/learning/follow-estimator-report.ts` (noi), `scripts/run-v2-follow-learning-report.mjs` (nou), `package.json` (scriptul `follow:learning`, ultima intrare), `Docs/10-invatarea-stilului.md` (secțiune nouă la final), `Docs/Evidence/172-v2-follow-learning/` (README, report.json, report.md).

Limitări sau follow-up: fixturile sunt sintetice și deterministe, produse de stratul 171 real; adaptorul din telemetria reală (086–089) și calibrarea pragurilor rămân pași separați. Pragurile de incertitudine și toleranțele sunt inițiale (`FOLLOW_ESTIMATOR_LIMITS`). Catalogul 092 rămâne fail-closed: cele patru chei au `implemented: false`, deci estimările sunt candidate. Întârzierea este cuantizată la `ceil(întârziere · 60)`, deci valoarea este mijlocul unui interval de jumătate de tick. Contractul nu este încă montat în bucla live de simulare.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '172' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-12: implementare finalizată pe branch `loop-pbi/v2-learn-172-01`; contract `172-follow-estimator-v1`, raport determinist `follow:learning` 22/22, suita completă 3016/3016, mutare fizică în Done.

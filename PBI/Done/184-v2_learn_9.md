---
id: "184"
title: "Învățare extinsă pentru pietoni și pericole"
status: "Done"
release: "V2"
module: "Învățare V2"
depends_on: ["183","163"]
parameter_role: "estimator"
parameter_keys: ["pedestrian_yield_probability","pedestrian_clearance","hazard_reaction_delay","obstacle_clearance","emergency_brake_intensity","evasive_steer_willingness","crosswalk_approach_speed","horn_use_probability"]
owner: "loop-pbi/v2-learn-184-01"
started_at: "2026-11-13T20:51:06+02:00"
completed_at: "2026-11-13T21:10:22+02:00"
---

# 184 Învățare extinsă pentru pietoni și pericole

## Obiectiv

Construiește estimarea și dovezile pentru pedestrian_yield_probability, pedestrian_clearance, hazard_reaction_delay, obstacle_clearance, emergency_brake_intensity, evasive_steer_willingness, crosswalk_approach_speed, horn_use_probability. Folosește stimuli observabili, traversări reale și contexte de evitare fezabile.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 183 trebuie să existe în Done înainte de începere.
- PBI 163 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare cheie are context eligibil, incertitudine și validare pe date independente.
- [x] Datele neidentificabile păstrează cheia neobservată; constrângerile de grup sunt explicate.

## Verificare

Demonstrații sintetice și manuale cu contexte variate și cazuri fără dovezi.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: contractul `184-hazard-estimator-v1` din `src/learning/hazard-v2-estimator.ts` estimează cele opt chei R ale politicii 183, fiecare din contextul ei eligibil, cu incertitudine per cheie și validare pe episoade ținute deoparte. Toate cele opt chei ies `CANDIDATE` pe setul pozitiv: `pedestrian_yield_probability` 0,5000 (±0,1021), `pedestrian_clearance` 2,5000 m (±0,0200), `hazard_reaction_delay` 0,8000 s (±0,0200), `obstacle_clearance` 2,4000 m (±0,0200), `emergency_brake_intensity` 0,6500 (±0,0200), `evasive_steer_willingness` 0,3053 (±0,0200), `crosswalk_approach_speed` 6,0000 m/s (±0,0500), `horn_use_probability` 0,2521 (±0,0200). Estimatorul este candidat-only și nu schimbă semantica 183.

Cele două capcane de identificabilitate sunt tratate explicit. Plafoanele de spațiu (`sqrt(2 · comfort_deceleration · cameră)`) se inversează numai cu decelerația de confort M declarată: fără ea cheia rămâne `UNOBSERVED` cu `CLEARANCE_M_UNKNOWN`, iar un M declarat care nu reproduce plafonul raportat dă `CLEARANCE_M_INCONSISTENT`. Saturația reacției este detectată: `hazard_reaction_delay` se citește doar când `saturated` este false, altfel cheia rămâne `UNOBSERVED` cu `REACTION_DELAY_SATURATED`. Sunt demonstrate și `CLEARANCE_FLOOR_SATURATED`, `CLEARANCE_ROOM_EXHAUSTED`, `ADHESION_CAP_SATURATED`, `EVASION_NO_SPACE`, `CROSSWALK_LIMIT_SATURATED`, `HORN_FORBIDDEN`, `PEDESTRIAN_ALL_CROSSINGS_MANDATORY` și `UNCERTAINTY_ABOVE_THRESHOLD` (0,7434 s peste pragul de 0,2 s), plus două zerouri demonstrate: claxon nefolosit constant și ocolire refuzată constant, ambele `CANDIDATE` cu valoarea 0.

Verificări executate și rezultat: `npm run typecheck` PASS; `npm run lint` PASS; `npm run format:check` PASS; `npm run check:architecture` PASS (387 fișiere TypeScript, 6 + 4 + 3 probe negative respinse); `npm run check:parameter-catalog` PASS („Parameter catalog is synchronized.”); `npm test` PASS: 3195 teste, 3195 trecute, 0 eșecuri, 99685,02 ms; `node --import ./scripts/register-typescript.mjs --test tests/learning/hazard-v2-estimator.test.ts` PASS: 27 teste, 27 trecute, 0 eșecuri; `npm run hazard:learning` 23/23 verificări PASS, 8 chei candidate, 0 chei neobservate, digest `fnv1a32:57a8782d`, overall PASS; `npm run hazard:learning -- --check` PASS (rapoartele sunt actuale, cod de ieșire 0).

Fișiere și documente actualizate: creat `src/learning/hazard-v2-estimator.ts`, `tests/learning/hazard-v2-estimator-reference.ts`, `tests/learning/hazard-v2-estimator-report.ts`, `tests/learning/hazard-v2-estimator.test.ts`, `scripts/run-v2-hazard-learning-report.mjs` și `Docs/Evidence/184-v2-hazard-learning/{README.md,report.json,report.md}`; modificat `src/learning/index.ts` (export la finalul listei), `package.json` (intrarea `hazard:learning` la finalul blocului `scripts`) și `Docs/10-invatarea-stilului.md` (secțiune nouă la final).

Limitări sau follow-up: valorile din fixture sunt demonstrații plauzibile, nu date măsurate pe jucători; dovezile validează contractul de context, identificabilitate, incertitudine, împărțire și refuz, nu calibrarea finală a stilului. Distanța ego față de linia trecerii este cea a scenariului (ca în 183), iar starea, identitatea și ceasul traversării sunt cele reale ale modulului 164. Benzile de eșantioane ale ocolirii și claxonului sunt alese înguste pentru ca intersecția să fie informativă. Estimatorul nu publică profile și nu scrie în store; integrarea în pipeline-ul de publicare rămâne în afara scope-ului.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '184' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-13: Implementare începută pe branch-ul `loop-pbi/v2-learn-184-01`; fișier mutat în In Progress.
- 2026-11-13: Contractul `184-hazard-estimator-v1` livrat cu 27 de teste deterministe, raport determinist 23/23 PASS și dovezi complete; cele două capcane de identificabilitate (plafonul de spațiu dependent de M și saturația reacției) sunt tratate explicit, iar toate verificările obligatorii au trecut. Fișier mutat fizic în Done.

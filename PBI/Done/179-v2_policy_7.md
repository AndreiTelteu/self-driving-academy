---
id: "179"
title: "Politică extinsă pentru control lateral și viraje"
status: "Done"
release: "V2"
module: "Parametri V2"
depends_on: ["166","049"]
parameter_role: "policy"
parameter_keys: ["lane_center_offset","steering_response_time","steering_rate_limit","turn_entry_speed","turn_exit_acceleration","corner_cutting_bias","lateral_clearance","lateral_correction_deadband"]
owner: "loop-pbi/v2-policy-179-01"
started_at: "2026-11-13T01:01:04+02:00"
completed_at: "2026-11-13T01:20:29+02:00"
---

# 179 Politică extinsă pentru control lateral și viraje

## Obiectiv

Implementează utilizarea cheilor R: lane_center_offset, steering_response_time, steering_rate_limit, turn_entry_speed, turn_exit_acceleration, corner_cutting_bias, lateral_clearance, lateral_correction_deadband. Normalizează traiectoriile după geometrie și aderență pentru controllerul lateral.

## Context și plan

[11-catalog-parametri.md](../../Docs/11-catalog-parametri.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 166 trebuie să existe în Done înainte de începere.
- PBI 049 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare cheie schimbă un comportament observabil într-un scenariu izolat.
- [x] Interacțiunea cu cheile M păstrează unitățile, profilele și consecințele stilului.

## Verificare

Compară valori joase și ridicate pentru fiecare cheie în aceeași scenă.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: contractul `179-lateral-policy-v2` din `src/autonomy/lateral-policy-v2.ts` activează cele opt chei R ca strat de politică peste proiecția reală `049-lateral-v1`. Traiectoria este normalizată după geometria clasei 023 (`wheelbaseM`, `trackM`, `steeringRadians`) și după aderența din cheia M `curve_lateral_accel` (046). Fiecare cheie are un efect izolat dovedit pe aceeași scenă: deplasare de bandă ±0,9 m (coridor 049, cheia ±1 m), timp mort 3 vs 90 tick-uri (0,05 vs 1,5 s), pas de direcție 0,001667 vs 0,025000 rad/tick (0,1 vs 4 rad/s, plafon 1,5 rad/s), viteză de intrare 1 vs 6,269 m/s, accelerație de ieșire 0,2 vs 1,5 m/s², tăiere 0 vs 0,9 m, spațiu lateral permis vs interzis și corecție activă vs oprită. Raportul măsoară 56 de perechi de separare, toate cu diferența 0,000.

Verificări executate și rezultat: `npm run typecheck` 0 erori; `npm run lint` 0 erori/0 warnings; `npm run format:check` toate fișierele formatate; `npm run check:architecture` PASS (382 fișiere TypeScript, 6+4+3 probe negative); `npm run check:parameter-catalog` catalog sincronizat; testele țintă 15/15 PASS; `npm test` 3102 teste, 3102 PASS, 0 fail (101,3 s); `npm run lateral:policy` 19/19 verificări PASS; `npm run lateral:policy -- --check` raport actual.

Fișiere și documente actualizate: `src/autonomy/lateral-policy-v2.ts` (nou), `src/autonomy/index.ts` (export la final), `tests/autonomy/lateral-policy-v2-reference.ts`, `tests/autonomy/lateral-policy-v2.test.ts`, `tests/autonomy/lateral-policy-v2-report.ts` (noi), `scripts/run-v2-lateral-policy-report.mjs` (nou), `package.json` (scriptul `lateral:policy` la finalul blocului), `Docs/11-catalog-parametri.md` (secțiune nouă la final), `Docs/Evidence/179-v2-lateral-policy/` (README, report.json, report.md).

Limitări sau follow-up: registry-ul 092 rămâne fail-closed (cele opt chei au `implemented: false`, deci `MANUAL_TUNING` și `LEARNED` sunt refuzate); stratul este un contract de politică neexecutat încă în bucla live de simulare, iar montarea în compoziție și proba de browser rămân pași separați; observația (lățimea benzii, abaterea laterală semnată, obstacolul) este a apelantului; latch-ul `state` trebuie purtat de apelant. Performanța jocului integrat nu este validată de acest PBI (nivel „funcțional izolat”).

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '179' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-13: Implementare completă în worktree-ul `v2-policy-179-01`; contract `179-lateral-policy-v2` cu opt efecte izolate, 56 perechi de separare cu diferența 0, 19/19 verificări ale raportului, 15 teste țintă și 3102 teste ale suitei complete; fișier mutat fizic în Done după validare.

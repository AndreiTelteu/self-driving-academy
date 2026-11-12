---
id: "176"
title: "Învățare extinsă pentru stop și prioritate"
status: "Done"
release: "V2"
module: "Învățare V2"
depends_on: ["175","163"]
parameter_role: "estimator"
parameter_keys: ["rolling_stop_speed","priority_assertiveness","allway_stop_patience","blocked_intersection_entry_probability"]
owner: "loop-pbi/v2-learn-176-01"
started_at: "2026-11-12T23:18:25+02:00"
completed_at: "2026-11-12T23:36:06+02:00"
---

# 176 Învățare extinsă pentru stop și prioritate

## Obiectiv

Construiește estimarea și dovezile pentru rolling_stop_speed, priority_assertiveness, allway_stop_patience, blocked_intersection_entry_probability. Separă rolling stop, asertivitatea, răbdarea și intrarea într-o intersecție blocată.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 175 trebuie să existe în Done înainte de începere.
- PBI 163 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare cheie are context eligibil, incertitudine și validare pe date independente.
- [x] Datele neidentificabile păstrează cheia neobservată; constrângerile de grup sunt explicate.

## Verificare

Demonstrații sintetice și manuale cu contexte variate și cazuri fără dovezi.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: contractul `176-stop-priority-estimator-v1` din `src/learning/stop-priority-estimator.ts` estimează cele patru chei R ale politicii 175 din patru scenarii separate. `rolling_stop_speed` se măsoară numai din comenzi `ROLL_THROUGH` reale (o comandă neplafonată dă cheia exact, una plafonată dovedește doar `cheie > 2,5 m/s`); `priority_assertiveness` numai din refuzuri 052 cu separator cunoscut (revendicarea dă limita inferioară `(yield_time_gap − separator) / (yield_time_gap − 3 s)`, cedarea limita superioară); `allway_stop_patience` numai din eliberări 051 la un all-way stop unde subiectul nu este primul sosit (ținerea dă limita inferioară, trecerea limita superioară); `blocked_intersection_entry_probability` numai din oportunități fără spațiu de ieșire declarat și fără veto (acceptarea dă limita inferioară a eșantionului determinist, așteptarea sub plafon limita superioară). Estimarea e candidat-only, verificată cu 25/25 aserțiuni în raport: 4 chei candidate (`rolling_stop_speed` 1,2000 m/s ±0,0500, `priority_assertiveness` 0,3667 ±0,0333, `allway_stop_patience` 4,0000 s ±0,2000, `blocked_intersection_entry_probability` 0,2804 ±0,0912), toate `VALIDATED` pe 2 + 2 episoade ținute deoparte, și 25 demonstrații neobservate cu motiv explicit.

Verificări executate și rezultat: `npm run typecheck` 0 erori; `npm run lint` 0 erori, 0 warnings; `npm run format:check` toate fișierele formatate; `npm run check:architecture` PASS (379 fișiere TypeScript, 6+4+3 probe negative); `npm run check:parameter-catalog` catalogul 092 sincronizat; testul țintă `tests/learning/stop-priority-estimator.test.ts` 14 teste, 14 PASS, 0 fail; `npm test` 3061 teste, 3061 PASS, 0 fail; `npm run stop:learning` 25/25 verificări PASS, 4 chei candidate, 25 demonstrații neobservate, digest `fnv1a32:cf5e99b7`; `npm run stop:learning -- --check` raport actual.

Fișiere și documente actualizate: `src/learning/stop-priority-estimator.ts` (nou), `src/learning/index.ts` (export adăugat la final), `tests/learning/stop-priority-estimator.test.ts`, `tests/learning/stop-priority-estimator-reference.ts` și `tests/learning/stop-priority-estimator-report.ts` (noi), `scripts/run-v2-stop-learning-report.mjs` (nou) și intrarea `stop:learning` ca ultima din blocul `scripts` din `package.json`, `Docs/10-invatarea-stilului.md` (secțiune nouă la final), `Docs/Evidence/176-v2-stop-learning/` (README, `report.json`, `report.md`).

Limitări sau follow-up: fixturile sunt sintetice și deterministe, produse prin straturile 051/052/175 reale, nu calibrare pe date reale; `rolling_stop_speed` rămâne neidentificabilă peste plafonul de 2,5 m/s al politicii, iar `blocked_intersection_entry_probability` peste plafonul de 0,5; asertivitatea și răbdarea sunt identificabile doar ca interval; pragurile de incertitudine și toleranțele sunt inițiale; cheile R rămân `implemented: false` în catalogul 092; montarea estimatorului în pipeline-ul live și proba de browser rămân pași separați.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '176' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-12: implementare începută în `loop-pbi/v2-learn-176-01`; contractul `176-stop-priority-estimator-v1`, testele deterministe și raportul `stop:learning` au fost livrate, cu dovezile în `Docs/Evidence/176-v2-stop-learning/`.
- 2026-11-12: PBI finalizat; toate verificările obligatorii au trecut, status `Done`, fișier mutat fizic în `PBI/Done`.

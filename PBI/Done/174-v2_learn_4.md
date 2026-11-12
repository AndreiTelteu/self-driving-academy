---
id: "174"
title: "Învățare extinsă pentru semafoare"
status: "Done"
release: "V2"
module: "Învățare V2"
depends_on: ["173","163"]
parameter_role: "estimator"
parameter_keys: ["yellow_stop_probability","red_run_gap_acceptance","yellow_commit_time","green_launch_acceleration"]
owner: "loop-pbi/v2-learn-174-01"
started_at: "2026-11-12T22:13:19+02:00"
completed_at: "2026-11-13T00:05:00+02:00"
---

# 174 Învățare extinsă pentru semafoare

## Obiectiv

Construiește estimarea și dovezile pentru yellow_stop_probability, red_run_gap_acceptance, yellow_commit_time, green_launch_acceleration. Controlează fezabilitatea la galben, angajarea în traversare și gap-ul pe roșu.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 173 trebuie să existe în Done înainte de începere.
- PBI 163 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare cheie are context eligibil, incertitudine și validare pe date independente.
- [x] Datele neidentificabile păstrează cheia neobservată; constrângerile de grup sunt explicate.

## Verificare

Demonstrații sintetice și manuale cu contexte variate și cazuri fără dovezi.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: contractul `174-signal-estimator-v2` din `src/learning/signal-v2-estimator.ts` estimează cele patru chei R ale politicii 173 din patru scenarii separate — fezabilitate la galben (`yellow_stop_probability`, rată de oprire pe oportunități identificate împărțită la factorul M observat), angajare în traversare (`yellow_commit_time`, intersecția limitelor „angajat ⇒ cheie ≥ timp” și „eșantionat ⇒ cheie ≤ timp”), gap pe roșu (`red_run_gap_acceptance`, intersecția dintre „acceptat ⇒ cheie ≤ gap” și „refuzat peste 3 s ⇒ cheie > gap”) și plecare de la verde (`green_launch_acceleration`, mediana plecărilor de pe loc după ținerea M). Estimarea rămâne candidat-only, nu publică profiluri, nu scrie în store și nu schimbă semantica 173. Rezultate reale: probabilitate 0,8875 ±0,0493 (validare 0,7625, eroare 0,1250 ≤ 0,15), orizont 2,0500 ±0,1500 s (validare 2,0500, eroare 0), gap 4,5000 ±0,5000 s (validare 4,5000, eroare 0), accelerație 1,5000 ±0,0500 m/s² (validare 1,5000, eroare 0); toate cele patru `VALIDATED`, iar 19 demonstrații rămân `UNOBSERVED` cu motiv explicit. Constrângerile de grup sunt `YELLOW_STOP_AND_RED_COMPLIANCE_SHARED`, `YELLOW_PROBABILITY_AND_COMMIT_SHARE_APPROACH`, `RED_RUN_GAP_DEPENDS_ON_OBSERVED_GAP`, `GREEN_LAUNCH_AFTER_START_DELAY` și `SIGNAL_KEYS_FROM_ONE_APPROACH`. Dovezile complete sunt în [Docs/Evidence/174-v2-signal-learning/README.md](../../Docs/Evidence/174-v2-signal-learning/README.md).

Verificări executate și rezultat: `npm run typecheck` 0 erori; `npm run lint` 0 erori/0 warnings; `npm run format:check` toate fișierele formatate; `npm run check:architecture` PASS (377 fișiere TypeScript, 6+4+3 probe negative); `npm run check:parameter-catalog` sincronizat; `node --import ./scripts/register-typescript.mjs --test tests/learning/signal-v2-estimator.test.ts` 14/14 PASS; `npm test` 3038/3038 PASS, 0 fail; `npm run signal:learning` 23/23 verificări PASS, 4 chei candidate, 19 demonstrații neobservate, amprentă `fnv1a32:adefc652`; `npm run signal:learning -- --check` confirmă raport actual.

Fișiere și documente actualizate: `src/learning/signal-v2-estimator.ts` (nou), `src/learning/index.ts` (export la finalul listei), `tests/learning/signal-v2-estimator.test.ts`, `tests/learning/signal-v2-estimator-reference.ts`, `tests/learning/signal-v2-estimator-report.ts` (noi), `scripts/run-v2-signal-learning-report.mjs` (nou), `package.json` (`signal:learning`, ultima intrare), `Docs/10-invatarea-stilului.md` (secțiune nouă la final), `Docs/Evidence/174-v2-signal-learning/{README.md,report.json,report.md}` (noi).

Limitări sau follow-up: fixturile sunt sintetice și deterministe, produse de straturile 050/173 reale; conectarea la telemetrie reală cere un adaptor pentru faptele comenzii 173 plus factorul M. Probabilitatea este o rată măsurată, deci o demonstrație de 0,8 cu 40 de oportunități pe episod produce 0,8875 pe jumătatea de estimare. Orizontul și gap-ul rămân intervale; sub plasa de siguranță de 3 s gap-ul nu este identificabil prin construcție. Pragurile și toleranțele din `SIGNAL_V2_ESTIMATOR_LIMITS` sunt inițiale și trebuie revizuite pe date reale. Catalogul 092 rămâne fail-closed (`implemented: false`), iar estimatorul nu este încă montat în bucla live.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '174' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-12: preluat de `loop-pbi/v2-learn-174-01`; implementat contractul `174-signal-estimator-v2`, testele, raportul determinist și dovezile.
- 2026-11-13: finalizat; 14/14 teste țintă, 3038/3038 teste de suită, 23/23 verificări de raport, fișier mutat fizic în Done.

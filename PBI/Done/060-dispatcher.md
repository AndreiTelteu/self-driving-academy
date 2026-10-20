---
id: "060"
title: "Dispecerizare după disponibilitate și cost"
status: "Done"
release: "V1"
module: "Flotă și curse"
depends_on: ["059","041"]
owner: "Codex gpt-6-luna medium loop-060"
started_at: "2026-10-20T16:29:35+03:00"
completed_at: "2026-10-20T05:05:00+03:00"
---

# 060 Dispecerizare după disponibilitate și cost

## Obiectiv

Alege taxiul disponibil după cost de serviciu determinat.

## Context și plan

[07-flota-si-curse.md](../../Docs/07-flota-si-curse.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 059 trebuie să existe în Done înainte de începere.
- PBI 041 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] O cursă nu este alocată simultan la două taxiuri.
- [x] Vehiculele blocate sau avariate nu sunt tratate ca disponibile.

## Verificare

Testează egalitate de cost, lipsă taxi și avarie.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/fleet/dispatcher.ts` (exportat prin `src/fleet/index.ts`) oferă `createRideDispatcher` cu `step/assignments/assignmentFor/availableTaxis/taxiStatus/setTaxiStatus/release/rejections/releases/stats/dispose` și `dispatchAssignmentId`. Alocarea este FIFO strictă din `pending()`-ul real 059; candidați sunt doar vehiculele 057 `TAXI` cu status `AVAILABLE`, iar claim-ul este indexat simultan pe taxi și pe cerere, deci nu există dublă alocare; `demand.dequeue()` este verificat că întoarce exact capul așteptat înainte de claim. Costul este recalculat proaspăt cu planner-ul real 041 `taxi→pickup` (`pickupCostSeconds`) și `pickup→dropoff` (`tripCostSeconds`); snapshot-ul de validare din 059 nu este citit niciodată. Tie-break-ul este strict pe cost mai mic, apoi pe id stabil lexicografic mai mic, cu candidații sortați după id și scanare all-or-nothing, astfel încât epuizarea bugetului să nu jumătățească ranking-ul. Disponibilitatea este publicată de apelant (`BLOCKED`/`DAMAGED`/`OFFLINE`/`AVAILABLE`), `ASSIGNED` aparține dispatcher-ului; civilii și taxiurile indisponibile/ocupate nu sunt niciodată candidați. Motive închise: `NO_TAXI`, `NO_POSITION`, `PICKUP_UNREACHABLE`, `TRIP_UNREACHABLE`, `ROUTE_BUDGET_EXHAUSTED`; eliberări: `COMPLETED`, `CANCELLED`, `FAILED`, `TAXI_BLOCKED`, `TAXI_DAMAGED`, `TAXI_REMOVED`. Limite: 4 alocări/pas (max 16), 30 candidați, 128 căutări de planner/pas (max 256).

Rulare de raport: 24 taxiuri, 20 civili, 21 utilizabile (1 blocat/1 avariat/1 offline), **32/32 cereri alocate exact o dată**, 32 eliberări, **692 căutări reale 041**, 0 claim-uri duplicate de taxi, maximum 2 concurente, 32/32 costuri recalculate, ordine FIFO păstrată. Probe: cost egal → id stabil; snapshot 059 `READY` învechit → `TRIP_UNREACHABLE`/`BLOCKED`; fără taxi → `NO_TAXI` cu 0 căutări; fără poziție → `NO_POSITION`; buget 30 → 1 alocare/25 căutări + `ROUTE_BUDGET_EXHAUSTED`; dispose la zero cu contractele injectate în viață.

Verificări executate și rezultat: `npm run typecheck`, `lint`, `format:check`, `check:architecture` (184 fișiere), `check:parameter-catalog` exit 0; `npm test` 1201/1201 PASS (1190 baseline + 11); `npm run fleet:dispatch -- --check` 28/28 PASS. Dovezi în [Evidence/060-dispatcher](../../Docs/Evidence/060-dispatcher/README.md).

Fișiere și documente actualizate: `src/fleet/dispatcher.ts` (nou), `src/fleet/index.ts`, `scripts/fleet-dispatch-report.mjs` (nou), testele aferente, [Docs/dispatcher.md](../../Docs/dispatcher.md) (nou), [Docs/07-flota-si-curse.md](../../Docs/07-flota-si-curse.md), `Docs/README.md`, `Docs/Evidence/060-dispatcher/`.

Limitări sau follow-up: blocarea FIFO la cap este strictă — o cerere temporar neatinsă ține restul cozii în așteptare (fără reordonare sau expirare ascunsă). Pozițiile taxiurilor sunt un port de lume injectat (024/058); dispatcher-ul nu mișcă taxiurile și nu reîmprospătează poziția după alocare. Daunele/blocajele la mijlocul cursei trebuie eliberate explicit de apelant; consecințele cursei aparțin 061–063. Nu este ciclu `Ride`, tarif/review, ETA/HUD sau predicție de trafic; fără Rapier/renderer sau FPS/GPU/hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '060' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-20: Implementare în worktree izolat (commit `5d4c6695`): dispatcher FIFO cu cost 041 recalculat la alocare, claim dublu-indexat, tie-break stabil, limite per pas și motive închise; 32/32 cereri, 692 căutări, 11 teste noi. Integrat prin fast-forward; verificat de orchestrator cu 1201/1201 teste.

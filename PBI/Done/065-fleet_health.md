---
id: "065"
title: "Blocaje avarii și reset de scenariu"
status: "Done"
release: "V1"
module: "Flotă și curse"
depends_on: ["058","063","029","064"]
performance_checks: ["simulation", "frame"]
owner: "Codex gpt-6-luna medium loop-065"
started_at: "2026-10-20T22:01:16+03:00"
completed_at: "2026-10-20T06:50:00+03:00"
---

# 065 Blocaje avarii și reset de scenariu

## Obiectiv

Leagă disponibilitatea flotei, recuperările și resetul lumii.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[07-flota-si-curse.md](../../Docs/07-flota-si-curse.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 058 trebuie să existe în Done înainte de începere.
- PBI 063 trebuie să existe în Done înainte de începere.
- PBI 029 trebuie să existe în Done înainte de începere.
- PBI 064 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Resetul nu lasă curse alocate unor vehicule dispărute.
- [x] Statisticile și profilele sunt păstrate sau resetate conform opțiunii explicite.

- [x] Fixture-ul 20/24/30 taxiuri plus până la 40 civile este reproductibil și reutilizabil în gate-ul 220.

## Verificare

Testează reset în cursă și recuperare după avarie.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/fleet/fleet-health.ts` oferă `createFleetHealth({ dispatcher, lifecycle, demand, eta, registry })` cu `health/list/report/apply/reset/history/stats/dispose`, stări închise `AVAILABLE|BLOCKED|DAMAGED|OFFLINE` și fapte închise `TRAFFIC_BLOCK`, `IMMOBILIZATION`, `COLLISION_DAMAGE`, `RECOVERY`, `SERVICE_WITHDRAWN`, `SERVICE_RETURNED`, idempotente pe `factId` și cu tick monoton. `src/fleet/scenario-fixture.ts` oferă `createFleetScenario`/`fleetScenarioReport` peste stack-ul real 032/033/041/057/059/060/061/064, cu fixture reproductibil 20/24/30 taxiuri + 20–40 civili, exportat pentru gate-ul 220. Porturile aditive de scenariu sunt `demand.reset()`, `dispatcher.reset()`, `lifecycle.reset()`, `eta.reset()`.

Sănătatea → eliberare: damage/blocaj/retragere închide o cursă activă prin 061 cu `TAXI_DAMAGED`/`TAXI_BLOCKED`/`TAXI_REMOVED` (061 eliberează claim-ul cu motivul `FAILED` închis, apoi 060 publică starea de sănătate). Un claim fără cursă este eliberat direct cu motivul `TAXI_*` potrivit. Taxiurile indisponibile nu apar niciodată în `availableTaxis()`; `report().consistent` verifică încrucișat fiecare status 060. `dispatcher.release()` permite acum eliberarea explicită a unui claim activ al cărui taxi a ieșit din registry; id-urile necunoscute fără claim aruncă în continuare `Unknown taxi`, iar `step` eșuează zgomotos.

Reset: validează tick-ul întâi; închide fiecare cursă activă cu `SCENARIO_RESET`; eliberează claim-urile rămase; curăță lifecycle/dispatcher/demand/ETA/health; raportează `discardedRides` când un claim lipsea deja; păstrează opțional statisticile cumulative și profilurile aplicate prin politică explicită (`RESET` implicit). Sănătatea revine mereu la `AVAILABLE` explicit; al doilea reset nu produce curse/eliberări/marcaje; id-urile vechi de cursă/ETA dispar înainte ca următorul scenariu să refolosească id-urile stabile. Un taxi dispărut își închide cursa alocată în loc să o scurgă; release-ul funcționează fără intrarea din registry.

Verificări: `npm run typecheck`, `lint`, `format:check`, `check:architecture` (190 fișiere), `check:parameter-catalog` exit 0; `npm test` 1265/1265 PASS (1252 baseline + 13); `npm run fleet:health` 28/28 checks, `--check` curent; suita țintă 13/13 (inclusiv taxi avariat încă asignabil, release lipsă, reset cu curse/claim-uri, reset dublu, ETA/rută învechită, sănătate pierdută la reset, taxi dispărut, fixture 20/24/30 reproductibil). Dovezi în [Evidence/065-fleet-health](../../Docs/Evidence/065-fleet-health/README.md).

Fișiere și documente actualizate: `src/fleet/fleet-health.ts`, `src/fleet/scenario-fixture.ts` (noi), `src/fleet/index.ts`, `src/fleet/{dispatcher,ride-demand,ride-fsm,eta}.ts` (porturi reset), `scripts/fleet-health-report.mjs`, `tests/fleet/fleet-health.test.ts`, [Docs/fleet-health.md](../../Docs/fleet-health.md) (nou), [Docs/07-flota-si-curse.md](../../Docs/07-flota-si-curse.md), `Docs/Evidence/065-fleet-health/`.

Limitări sau follow-up: validare locală țintită; fără FPS/GPU/Rapier/hardware, iar gate-ul 220 deține performanța. Faptele de sănătate sunt intrări explicite 029/030, nu inferență din coliziuni. Reset-ul păstrează tick-ul global monoton. Memoria `factId` este mărginită la 1024. Fără integrare HUD/browser/savefile.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '065' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
- 2026-10-20: Implementare în worktree izolat (commit `a24e5cb3`): sănătate de flotă cu eliberare automată din asignare, reset determinist de scenariu și fixture reproductibil 20/24/30; 13 teste noi. Integrat prin fast-forward; verificat de orchestrator cu 1265/1265 teste.

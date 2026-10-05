---
id: "036"
title: "Controller de semafoare"
status: "Done"
release: "V1"
module: "Oraș"
performance_checks: ["simulation", "memory"]
depends_on: ["035","008","007"]
owner: "Codex PBI036"
started_at: "2026-10-05T04:03:21.0977271+03:00"
completed_at: "2026-10-05T04:14:49.4079047+03:00"
---

# 036 Controller de semafoare

## Obiectiv

Implementează faze, durate și asocierea cu mișcări.

## Context și plan

[04-oras-si-retea-rutiera.md](../../Docs/04-oras-si-retea-rutiera.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 035 trebuie să existe în Done înainte de începere.
- PBI 008 trebuie să existe în Done înainte de începere.
- PBI 007 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] O mașină consultă numai semnalul mișcării sale.
- [x] Schimbările de fază au tick și eveniment unic.

## Verificare

Rulează cicluri complete și semnale pentru sensuri diferite.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Controller60Hz determinist, query exclusiv per intersecție/mișcare și faze valide contra035 inclusiv geometricGREEN. Eveniment explicit SIGNAL_PHASE_CHANGED cu tick/ID unic/stări mixte; transaction bounded cu accepted-prefix retry, failure results și disposal.

Verificări executate și rezultat:11teste proprii cicluri/sensuri/tick/phaseevent/JSON/invalidGREEN/pause008/partialretry/lifecycle PASS. npm run check typecheck/lint/format/architecture+253teste PASS, production build PASS. Baseline CPU înainte/final, cost nou cu007events, observeroff/on și20cleanupcycles executate; [raport](../../Docs/Evidence/036-signals/report.md).

Fișiere și documente actualizate: src/world/signals.ts, src/simulation/events.ts (variantă nouă compatibilă cu legacy), tests/world/signals-fixture.ts și signals.test.ts, scripts/benchmark-signals.mjs, Docs/signals.md, Docs/data-contracts.md și Docs/Evidence/036-signals. Publicexports/Docs04/README integrate de parent.

Limitări sau follow-up: CPU pur fără vehicule/UI/mesh sau restoredcheckpoint; initialTick începe prima fază. Bugete pre203, nu gameplaytick complet/FPS/GPU ori gate220/224. Transport fault suspendă query/step și cere retry/recovery explicit; callbacks folosesc payloadul noii faze până la commitul batchului. Listener failures nu fac rollback/reexecuție; busul este deținut extern și plafonul payloadului trebuie configurat explicit.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '036' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.


- 2026-10-05T04:14:49.4079047+03:00: Implementat,11teste și check253/build/probeCPU PASS; mutat fizic în Done.

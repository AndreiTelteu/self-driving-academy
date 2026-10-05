---
id: "033"
title: "Graf direcționat de benzi"
status: "Done"
release: "V1"
module: "Oraș"
depends_on: ["032"]
owner: "Codex /root/pbi012"
started_at: "2026-10-05T03:21:39.3205108+03:00"
completed_at: "2026-10-05T03:40:38.1984197+03:00"
performance_checks: ["simulation", "memory"]
---

# 033 Graf direcționat de benzi

## Obiectiv

Implementează query-uri de bandă, vecini, succesor și conexiuni de viraj.

## Context și plan

[04-oras-si-retea-rutiera.md](../../Docs/04-oras-si-retea-rutiera.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 032 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Direcțiile și restricțiile de acces sunt respectate în graf.
- [x] Banda curentă poate fi identificată fără dependență de mesh.

## Verificare

Testează sens unic, benzi paralele și viraje permise/interzise.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Graf readonly cu conexiuni direcționate/access, vecini și viraje explicite, localizare pe geometrie world fără mesh; index spațial bounded cu fallback complet și geometrie immutable partajată.

Verificări executate și rezultat: 12/12 teste dedicate PASS; npm run check PASS (208/208), npm run build PASS; probe CPU baseline/after și rebuild/GC executate. Raportul exact: [verification.md](../../Docs/Evidence/033-lane-graph/verification.md). Validate-Board -RequireDone 033 executat după mutare: [board.json](../../Docs/Evidence/033-lane-graph/board.json).

Fișiere și documente actualizate: src/world/lane-graph.ts; tests/world/lane-graph-fixture.ts și lane-graph.test.ts; scripts/benchmark-lane-graph.mjs; Docs/lane-graph.md și Docs/Evidence/033-lane-graph. Exporturile world și linkurile documentelor comune sunt integrate de agentul părinte.

Limitări sau follow-up: Query static fără routing/admitere live/fizică; golul intersecției rămâne null. Fallback complet pe geometrii mari poate crește costul; probele CPU nu certifică bugetul întregului tick ori gate hardware. Calibrare ulterioară pe harta reală.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '033' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.


- 2026-10-05: Implementare și verificări reale finalizate; mutare fizică în Done și RequireDone 033 PASS.

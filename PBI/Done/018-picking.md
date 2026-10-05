---
id: "018"
title: "Picking și selectarea mașinilor"
status: "Done"
release: "V1"
module: "Babylon"
depends_on: ["013","017"]
performance_checks: ["frame", "memory"]
owner: "Codex /root/pbi012"
started_at: "2026-10-05T03:41:41.4120802+03:00"
completed_at: "2026-10-05T04:08:07.9257525+03:00"
---

# 018 Picking și selectarea mașinilor

## Obiectiv

Mapează clickurile pe mesh/instance la intenții de selecție.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[03-babylon-engine.md](../../Docs/03-babylon-engine.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 013 trebuie să existe în Done înainte de începere.
- PBI 017 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Se poate selecta orice mașină vizibilă fără a depinde de mesh unic.
- [x] Un dialog modal consumă clickul și nu selectează vehicule în spate.

- [x] Pickingul instanțelor/batchurilor păstrează entityId; mișcarea pointerului nu scanează permanent scena dacă nu cere hover.

## Verificare

Testează mașină civilă, taxi, decor și UI peste canvas.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Registry bounded mesh/root/regular-instance/thin-index → entityId; remap atomic și ownership explicit; picker Babylon nearest-hit; input canvas cu modal/UI/drag/capture guards, pointermove fără query implicit și SELECT_VEHICLE fără transfer de autoritate.

Verificări executate și rezultat: 8/8 teste dedicate PASS; scoped typecheck/lint/format/architecture PASS; npm run build PASS. Clickuri native trusted în fixture producție WebGL2/WebGPU PASS, modal/UI fără scan, decor occlude, thin remap PASS, 20 rebuilds fără creștere resurse și double cleanup PASS. Baseline CPU anterior implementării și cost nou separat; randare înainte/după pe aceeași scenă. [Raport exact](../../Docs/Evidence/018-vehicle-picking/verification.md), [RequireDone018](../../Docs/Evidence/018-vehicle-picking/board.json). Global check anterior PASS234; rulări globale ulterioare au întâlnit source/format WIP al altor agenți, păstrate în raport.

Fișiere și documente actualizate: src/rendering/babylon/vehicle-picking-registry.ts, vehicle-picking.ts, vehicle-picking-input.ts; tests/rendering/vehicle-picking.test.ts; tests/browser/vehicle-picking/{main.ts,index.html,vite.config.mjs}; scripts/benchmark-vehicle-picking.mjs; Docs/vehicle-picking.md și Evidence/018-vehicle-picking. Exporturile/shared docs sunt integrate de agentul părinte.

Limitări sau follow-up: Reorder thin cu count identic cere remap sincron explicit; batch gol se unregister/disable de owner. Bootstrap fără vehicule gameplay folosește ulterior compoziția demonstrată. Probe scurte timpurii, fără certificare whole-game/FPS/gate laptop; timer GPU/memorie exactă indisponibile, exact HEAD baseline CPU necapturat (fixture/engine/date păstrate).

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '018' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.



- 2026-10-05: Implementare/probe reale finalizate; mutare fizică Done și RequireDone018 PASS. Performance checks includ memoria registry-ului și cleanupul repetat.

---
id: "016"
title: "Materiale lumină și niveluri de calitate"
status: "To Do"
release: "V1"
module: "Babylon"
depends_on: ["013","009"]
performance_checks: ["frame", "assets"]
owner: null
started_at: null
completed_at: null
---

# 016 Materiale lumină și niveluri de calitate

## Obiectiv

Creează iluminarea zilei și setările de umbre/materiale cu paritate de gameplay.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[03-babylon-engine.md](../../Docs/03-babylon-engine.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 013 trebuie să existe în Done înainte de începere.
- PBI 009 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Semnalele și marcajele sunt lizibile la nivelurile de calitate alese.
- [ ] Schimbarea calității nu schimbă regulile sau fizica.

- [ ] Rezoluția internă/DPR și presetul sunt explicite; ajustarea automată are histerezis și păstrează regulile simulării.

## Verificare

Inspectează scenele pe ambele backenduri și două niveluri de calitate.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: De completat.

Verificări executate și rezultat: De completat.

Fișiere și documente actualizate: De completat.

Limitări sau follow-up: De completat.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '016' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

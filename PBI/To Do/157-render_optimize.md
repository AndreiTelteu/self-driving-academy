---
id: "157"
title: "Optimizare Babylon instanțiere LOD și umbre"
status: "To Do"
release: "V1"
module: "Validare și release"
depends_on: ["156","150","223"]
performance_checks: ["frame", "assets"]
owner: null
started_at: null
completed_at: null
---

# 157 Optimizare Babylon instanțiere LOD și umbre

## Obiectiv

Reduce costul vizual bazat pe măsurători și verifică pickingul.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[18-validare-si-release.md](../../Docs/18-validare-si-release.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 156 trebuie să existe în Done înainte de începere.
- PBI 150 trebuie să existe în Done înainte de începere.
- PBI 223 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Optimizările nu modifică starea simulării sau profilele.
- [ ] Câștigurile sunt măsurate pe scenele de referință.

- [ ] Instanțierea locală, materialele statice și calitatea adaptivă păstrează pickingul, semnalele, spawn/despawn și presetul declarat.

## Verificare

Compară frame time și selecția înainte/după.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '157' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

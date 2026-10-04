---
id: "144"
title: "Experimente în worker progres și anulare"
status: "To Do"
release: "V1"
module: "Experimente și indicatori"
depends_on: ["143","010","221"]
performance_checks: ["workers", "memory", "frame"]
owner: null
started_at: null
completed_at: null
---

# 144 Experimente în worker progres și anulare

## Obiectiv

Rulează loturi cu progres, limită de resurse și anulare.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[14-experimente-si-indicatori.md](../../Docs/14-experimente-si-indicatori.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 143 trebuie să existe în Done înainte de începere.
- PBI 010 trebuie să existe în Done înainte de începere.
- PBI 221 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] UI rămâne operabil și rezultatele parțiale sunt etichetate.
- [ ] Un model simplificat nu este prezentat drept aceeași fizică fără validare.

- [ ] Loturile sunt admise prin 221, au felii de lucru și o singură lume activă conform bugetului; learning-ul poate întrerupe un lot cooperativ.

## Verificare

Testează lot lung, anulare și eroare de worker.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '144' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

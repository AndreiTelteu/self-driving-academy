---
id: "031"
title: "Calibrare și paritate manual autonom"
status: "To Do"
release: "V1"
module: "Vehicule și fizică"
depends_on: ["026","027","028"]
owner: null
started_at: null
completed_at: null
---

# 031 Calibrare și paritate manual autonom

## Obiectiv

Finalizează presetul de fizică realistă și fixture-urile pentru ambele clase.

## Context și plan

[05-vehicule-si-fizica.md](../../Docs/05-vehicule-si-fizica.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 026 trebuie să existe în Done înainte de începere.
- PBI 027 trebuie să existe în Done înainte de începere.
- PBI 028 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Distanțele și răspunsurile sunt documentate ca măsurători ale jocului.
- [ ] Aceleași comenzi produc rezultate echivalente din surse manual și AI.

## Verificare

Rulează matricea de frânare, viraj și contact pentru ambele clase.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '031' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

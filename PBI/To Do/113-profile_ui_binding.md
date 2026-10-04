---
id: "113"
title: "Conectarea UI la profiluri reale"
status: "To Do"
release: "V1"
module: "Profiluri"
depends_on: ["112","077","078","104"]
owner: null
started_at: null
completed_at: null
---

# 113 Conectarea UI la profiluri reale

## Obiectiv

Înlocuiește datele de preview cu proiecții reale ale serviciului.

## Context și plan

[12-profiluri-si-propagare.md](../../Docs/12-profiluri-si-propagare.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 112 trebuie să existe în Done înainte de începere.
- PBI 077 trebuie să existe în Done înainte de începere.
- PBI 078 trebuie să existe în Done înainte de începere.
- PBI 104 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] UI și politica raportează aceeași versiune și aceleași valori.
- [ ] Rezervat și neobservat rămân distincte în istoric.

## Verificare

Compară UI, delta și reason code în același scenariu.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '113' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

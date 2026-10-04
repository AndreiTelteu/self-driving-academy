---
id: "171"
title: "Politică extinsă pentru urmărire și distanțe"
status: "To Do"
release: "V2"
module: "Parametri V2"
depends_on: ["166","048"]
parameter_role: "policy"
parameter_keys: ["cutin_brake_response","closing_ttc_threshold","leader_change_delay","following_hysteresis"]
owner: null
started_at: null
completed_at: null
---

# 171 Politică extinsă pentru urmărire și distanțe

## Obiectiv

Implementează utilizarea cheilor R: cutin_brake_response, closing_ttc_threshold, leader_change_delay, following_hysteresis. Testează cut-in, schimbarea liderului, TTC și histerezis în episoade distincte.

## Context și plan

[11-catalog-parametri.md](../../Docs/11-catalog-parametri.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 166 trebuie să existe în Done înainte de începere.
- PBI 048 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Fiecare cheie schimbă un comportament observabil într-un scenariu izolat.
- [ ] Interacțiunea cu cheile M păstrează unitățile, profilele și consecințele stilului.

## Verificare

Compară valori joase și ridicate pentru fiecare cheie în aceeași scenă.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '171' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

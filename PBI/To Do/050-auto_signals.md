---
id: "050"
title: "Politica la roșu și verde"
status: "To Do"
release: "V1"
module: "Autonomie"
depends_on: ["047","036","006"]
parameter_role: "policy"
parameter_keys: ["red_stop_probability","green_start_delay","red_stop_line_offset","late_red_brake_threshold"]
owner: null
started_at: null
completed_at: null
---

# 050 Politica la roșu și verde

## Obiectiv

Aplică parametrii M de conformare, întârziere, linie și frânare la roșu.

## Context și plan

[06-autonomie-si-trafic.md](../../Docs/06-autonomie-si-trafic.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 047 trebuie să existe în Done înainte de începere.
- PBI 036 trebuie să existe în Done înainte de începere.
- PBI 006 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Profilurile pot reproduce trecerea pe roșu și plecarea lentă sau rapidă.
- [ ] Decizia probabilistică este eșantionată o dată pe oportunitate.

## Verificare

Testează semafor liber, coadă și oportunitate reevaluată.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '050' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

---
id: "047"
title: "Control longitudinal accelerație și frânare"
status: "To Do"
release: "V1"
module: "Autonomie"
depends_on: ["046","024"]
parameter_role: "policy"
parameter_keys: ["desired_acceleration","comfort_deceleration","acceleration_jerk","brake_reaction_delay"]
owner: null
started_at: null
completed_at: null
---

# 047 Control longitudinal accelerație și frânare

## Obiectiv

Aplică accelerația dorită, frânarea confortabilă, jerk și reacția la frână.

## Context și plan

[06-autonomie-si-trafic.md](../../Docs/06-autonomie-si-trafic.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 046 trebuie să existe în Done înainte de începere.
- PBI 024 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Controllerul produce comenzi comune și păstrează semnul/unitățile.
- [ ] Frânarea poate fi insuficientă într-un profil riscant fără instabilitate numerică.

## Verificare

Testează oprire normală și reacție întârziată la obstacol.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '047' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

---
id: "174"
title: "Învățare extinsă pentru semafoare"
status: "To Do"
release: "V2"
module: "Învățare V2"
depends_on: ["173","163"]
owner: null
started_at: null
completed_at: null
---

# 174 Învățare extinsă pentru semafoare

## Obiectiv

Construiește estimarea și dovezile pentru yellow_stop_probability, red_run_gap_acceptance, yellow_commit_time, green_launch_acceleration. Controlează fezabilitatea la galben, angajarea în traversare și gap-ul pe roșu.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 173 trebuie să existe în Done înainte de începere.
- PBI 163 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Fiecare cheie are context eligibil, incertitudine și validare pe date independente.
- [ ] Datele neidentificabile păstrează cheia neobservată; constrângerile de grup sunt explicate.

## Verificare

Demonstrații sintetice și manuale cu contexte variate și cazuri fără dovezi.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '174' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

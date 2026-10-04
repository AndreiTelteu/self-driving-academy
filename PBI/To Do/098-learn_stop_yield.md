---
id: "098"
title: "Estimator STOP și acceptare de prioritate"
status: "To Do"
release: "V1"
module: "Învățare"
depends_on: ["093","051","052"]
parameter_role: "estimator"
parameter_keys: ["stop_full_probability","stop_dwell_time","stop_line_offset","yield_time_gap"]
owner: null
started_at: null
completed_at: null
---

# 098 Estimator STOP și acceptare de prioritate

## Obiectiv

Estimează cele patru chei M STOP/yield cu contexte identificate.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 093 trebuie să existe în Done înainte de începere.
- PBI 051 trebuie să existe în Done înainte de începere.
- PBI 052 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Rolling stop și oprirea provocată de trafic sunt diferențiate.
- [ ] Gap-ul este prezentat ca interval sau limită când datele nu identifică un prag exact.

## Verificare

Testează STOP liber, aglomerat și oportunități acceptate/refuzate.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '098' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

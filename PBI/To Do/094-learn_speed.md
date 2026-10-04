---
id: "094"
title: "Estimator viteză curbe și apropiere"
status: "To Do"
release: "V1"
module: "Învățare"
depends_on: ["093","046"]
parameter_role: "estimator"
parameter_keys: ["speed_delta_urban","speed_delta_residential","curve_lateral_accel","intersection_approach_speed"]
owner: null
started_at: null
completed_at: null
---

# 094 Estimator viteză curbe și apropiere

## Obiectiv

Estimează cele patru chei M de viteză din ferestre eligibile.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 093 trebuie să existe în Done înainte de începere.
- PBI 046 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Traficul constrâns nu este folosit ca viteză preferată.
- [ ] Profiluri sintetice distincte produc diferențe comportamentale pe date independente.

## Verificare

Validează trafic liber, curbă și segment cu lider.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '094' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

---
id: "053"
title: "Schimbări de bandă și depășire V1"
status: "To Do"
release: "V1"
module: "Autonomie"
depends_on: ["048","049","044"]
parameter_role: "policy"
parameter_keys: ["lane_change_front_gap","lane_change_back_gap","lane_change_speed_gain","lane_change_cooldown"]
owner: null
started_at: null
completed_at: null
---

# 053 Schimbări de bandă și depășire V1

## Obiectiv

Aplică gap față/spate, avantaj de viteză și cooldown.

## Context și plan

[06-autonomie-si-trafic.md](../../Docs/06-autonomie-si-trafic.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 048 trebuie să existe în Done înainte de începere.
- PBI 049 trebuie să existe în Done înainte de începere.
- PBI 044 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Schimbarea opțională ține cont de profil și context.
- [ ] Manevra începută are continuitate și nu este resetată în fiecare frame.

## Verificare

Testează gap insuficient, avantaj absent și două schimbări apropiate.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '053' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

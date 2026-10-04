---
id: "082"
title: "Tablou oraș și drilldown de evenimente"
status: "To Do"
release: "V1"
module: "Interfață"
depends_on: ["073","028","061"]
owner: null
started_at: null
completed_at: null
---

# 082 Tablou oraș și drilldown de evenimente

## Obiectiv

Creează componente pentru metrici, expunere și evenimente pe hartă.

## Context și plan

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 073 trebuie să existe în Done înainte de începere.
- PBI 028 trebuie să existe în Done înainte de începere.
- PBI 061 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Datele indisponibile sunt distincte de zero.
- [ ] Incidentul selectat poate fi localizat fără schimbarea profilului.

## Verificare

Inspectează scenarii fără expunere și cu incidente.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '082' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

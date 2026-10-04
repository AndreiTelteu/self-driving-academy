---
id: "038"
title: "Priorități și evaluarea spațiilor"
status: "To Do"
release: "V1"
module: "Oraș"
depends_on: ["035","037"]
owner: null
started_at: null
completed_at: null
---

# 038 Priorități și evaluarea spațiilor

## Obiectiv

Definește prioritatea de hartă și oportunități de traversare.

## Context și plan

[04-oras-si-retea-rutiera.md](../../Docs/04-oras-si-retea-rutiera.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 035 trebuie să existe în Done înainte de începere.
- PBI 037 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Timpul până la conflict este calculat în unități coerente.
- [ ] Lipsa traficului nu este înregistrată ca refuz de prioritate.

## Verificare

Testează conflict eligibil, conflict absent și cedare.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '038' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

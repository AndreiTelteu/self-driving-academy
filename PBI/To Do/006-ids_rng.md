---
id: "006"
title: "Identificatori stabili și random determinist"
status: "To Do"
release: "V1"
module: "Fundație"
depends_on: ["005"]
owner: null
started_at: null
completed_at: null
---

# 006 Identificatori stabili și random determinist

## Obiectiv

Creează IDs de entități și seed-uri pe vehicul, scenariu și oportunitate.

## Context și plan

[02-arhitectura-si-contracte.md](../../Docs/02-arhitectura-si-contracte.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 005 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Același seed și aceeași cheie de oportunitate reproduc eșantionarea.
- [ ] Alte evenimente nu modifică arbitrar randomul unei oportunități existente.

## Verificare

Compară secvențe cu evenimente inserate și seed-uri diferite.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '006' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

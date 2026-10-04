---
id: "131"
title: "Autosave și închiderea sesiunii"
status: "To Do"
release: "V1"
module: "Persistență"
depends_on: ["128","129","130","206","222"]
performance_checks: ["storage", "frame"]
owner: null
started_at: null
completed_at: null
---

# 131 Autosave și închiderea sesiunii

## Obiectiv

Leagă salvările periodice și evenimentele de închidere.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[15-salvare-si-import-export.md](../../Docs/15-salvare-si-import-export.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 128 trebuie să existe în Done înainte de începere.
- PBI 129 trebuie să existe în Done înainte de începere.
- PBI 130 trebuie să existe în Done înainte de începere.
- PBI 206 trebuie să existe în Done înainte de începere.
- PBI 222 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] UI indică pending, succes și eroare fără a pretinde o salvare neterminată.
- [ ] Timpul de salvare este separat de timpul simulat.

- [ ] Autosave folosește pipeline-ul 222; cererile redundante sunt coalesced fără a pierde evenimente protejate și fără salvare finală garantată la shutdown.

## Verificare

Testează periodic, close intervention și eroare de scriere.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '131' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

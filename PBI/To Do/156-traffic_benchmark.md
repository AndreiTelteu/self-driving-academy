---
id: "156"
title: "Benchmark flotă și trafic"
status: "To Do"
release: "V1"
module: "Validare și release"
depends_on: ["155","065","144"]
performance_checks: ["frame", "simulation", "workers"]
owner: null
started_at: null
completed_at: null
---

# 156 Benchmark flotă și trafic

## Obiectiv

Măsoară 20/24/30 de taxiuri și densități civile variate.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[18-validare-si-release.md](../../Docs/18-validare-si-release.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 155 trebuie să existe în Done înainte de începere.
- PBI 065 trebuie să existe în Done înainte de începere.
- PBI 144 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Taxiurile nevizibile rămân simulate și incluse în expunere.
- [ ] CPU de fizică, decizii, UI și GPU sunt raportate separat.

- [ ] Matricea include driving cu learning, recorder+autosave și XP A/B, plus trafic agresiv/contacte, cold/first-use și suprasarcină etichetată.

## Verificare

Rulează aceeași matrice înainte și după optimizare.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '156' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

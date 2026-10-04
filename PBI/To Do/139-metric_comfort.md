---
id: "139"
title: "Indicatori de confort cu pasager"
status: "To Do"
release: "V1"
module: "Experimente și indicatori"
depends_on: ["137","088","121"]
owner: null
started_at: null
completed_at: null
---

# 139 Indicatori de confort cu pasager

## Obiectiv

Calculează accelerație, accelerație laterală și jerk în intervalele cu pasager pentru toate taxiurile, în AUTO, MANUAL și LEARNING.

## Context și plan

[14-experimente-si-indicatori.md](../../Docs/14-experimente-si-indicatori.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 137 trebuie să existe în Done înainte de începere.
- PBI 088 trebuie să existe în Done înainte de începere.
- PBI 121 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Intervalele cu pasager sunt agregate în toate modurile, inclusiv pentru taxiuri în afara camerei, independent de eligibilitatea pentru learning.
- [ ] Teleportările și impulsurile de impact nu devin confort al comenzii.
- [ ] Impactul real rămâne consecință a experienței pasagerului și intră separat în review.
- [ ] Misiunea, dashboardul și modelul review citesc aceleași agregări.

## Verificare

Testează curse lină, bruscă și cu incident în AUTO, MANUAL și LEARNING, inclusiv o cursă mixtă și un taxi nevizibil.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '139' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

---
id: "137"
title: "Indicatori de serviciu și expunere"
status: "To Do"
release: "V1"
module: "Experimente și indicatori"
depends_on: ["063","028","085"]
performance_checks: ["simulation"]
owner: null
started_at: null
completed_at: null
---

# 137 Indicatori de serviciu și expunere

## Obiectiv

Calculează durate, finalizări, kilometri-vehicul și timp blocat.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[14-experimente-si-indicatori.md](../../Docs/14-experimente-si-indicatori.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 063 trebuie să existe în Done înainte de începere.
- PBI 028 trebuie să existe în Done înainte de începere.
- PBI 085 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Denominatoarele includ toată flota și au unități.
- [ ] Expunerea zero produce indisponibil, nu o rată aparent perfectă.

- [ ] Agregările sunt incrementale pe evenimente idempotente; nu se rescanează istoricul întreg la fiecare tick sau refresh HUD.

## Verificare

Testează flotă nevizibilă și lipsa curselor/distanței.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '137' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

---
id: "015"
title: "Registry asseturi și încărcare GLB"
status: "To Do"
release: "V1"
module: "Babylon"
depends_on: ["013"]
performance_checks: ["assets", "loading", "memory"]
owner: null
started_at: null
completed_at: null
---

# 015 Registry asseturi și încărcare GLB

## Obiectiv

Configurează loaderul versiunii Babylon fixate, progres, cache și placeholder.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[03-babylon-engine.md](../../Docs/03-babylon-engine.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 013 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Asseturile critice au erori explicite; decorul lipsă poate folosi placeholder.
- [ ] Load și unload eliberează resurse și nu dublează materiale.

- [ ] Încărcarea critică/opțională, cache-ul și decode/upload au limite și timpi raportați; disposal păstrează resursele partajate încă folosite.

## Verificare

Încarcă un asset valid, unul lipsă și două instanțe ale aceluiași asset.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '015' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

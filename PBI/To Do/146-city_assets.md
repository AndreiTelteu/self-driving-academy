---
id: "146"
title: "Asseturi cartier decor și optimizare"
status: "To Do"
release: "V1"
module: "Asseturi și audio"
depends_on: ["042","015","220","223"]
performance_checks: ["assets", "loading", "frame"]
owner: null
started_at: null
completed_at: null
---

# 146 Asseturi cartier decor și optimizare

## Obiectiv

Înlocuiește placeholder-ele cu decor coerent american și instanțe potrivite.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[16-asseturi-vizual-si-audio.md](../../Docs/16-asseturi-vizual-si-audio.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 042 trebuie să existe în Done înainte de începere.
- PBI 015 trebuie să existe în Done înainte de începere.
- PBI 220 trebuie să existe în Done înainte de începere.
- PBI 223 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Semantica hărții rămâne aliniată după schimbarea asseturilor.
- [ ] Costul asseturilor și sursele/licențele sunt inventariate.

- [ ] Batchurile statice sunt locale spațial; texturile/umbrele/draw calls și startup-ul rămân în buget pe workload-ul gate-ului 220.

## Verificare

Parcurge orașul și măsoară încărcarea și draw calls.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '146' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

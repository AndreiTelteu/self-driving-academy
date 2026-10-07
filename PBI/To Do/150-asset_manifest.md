---
id: "150"
title: "Manifest și pipeline de asseturi pentru build"
status: "To Do"
release: "V1"
module: "Asseturi și audio"
depends_on: ["146","145","147","149"]
performance_checks: ["assets", "loading"]
owner: null
started_at: null
completed_at: null
---

# 150 Manifest și pipeline de asseturi pentru build

## Obiectiv

Versionează fișierele, cache-ul și inventarul asseturilor.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[16-asseturi-vizual-si-audio.md](../../Docs/16-asseturi-vizual-si-audio.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 146 trebuie să existe în Done înainte de începere.
- PBI 145 trebuie să existe în Done înainte de începere.
- PBI 147 trebuie să existe în Done înainte de începere.
- PBI 149 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Un build nou invalidează numai cache-ul necesar.
- [ ] Lipsa unui asset critic este detectată înainte de release.

- [ ] CI verifică bytes transferați și resurse decodate estimate, inclusiv WASM/decodere, fără a confunda compresia cu memoria rezidentă.

## Verificare

Testează manifest incomplet și rebuild cu un asset modificat.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '150' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

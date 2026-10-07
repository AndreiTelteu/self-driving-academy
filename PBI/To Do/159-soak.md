---
id: "159"
title: "Sesiune lungă memorie și stabilitatea flotei"
status: "To Do"
release: "V1"
module: "Validare și release"
depends_on: ["157","158"]
performance_checks: ["soak", "memory", "storage", "workers"]
owner: null
started_at: null
completed_at: null
---

# 159 Sesiune lungă memorie și stabilitatea flotei

## Obiectiv

Rulează cel puțin 60 de minute cu curse, intervenții, reseturi și cicluri de lifecycle.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[18-validare-si-release.md](../../Docs/18-validare-si-release.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 157 trebuie să existe în Done înainte de începere.
- PBI 158 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Nu există creștere necontrolată de resurse sau cozi blocate.
- [ ] Blocajele flotei și quota sunt raportate și recuperabile.

- [ ] Soak-ul durează minimum 60 minute și include 20 de cicluri lifecycle; memoria/cozile/retention ajung la platou și throttlingul laptopului este raportat.

## Verificare

Raport de soak cu memorie, incidente și jobs.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '159' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

## Nivel de validare — politica 2026-10-08

Nivel: `soak`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
